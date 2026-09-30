from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select, delete, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..database import get_db
from ..main import ClassRoom, Guardian, Student, audit, error, require, user_dep
from ..services.face_recognition import face_recognition_service
from ..models import GuardianAccount, GuardianStudent, FaceEnrollment
from ..database import Base
from ..services.biometric_cleanup import staged_biometric_cleanup
from ..services.parent_access import get_parent_student, get_parent_student_ids


class StudentIn(BaseModel):
 nis:str=Field(min_length=1, max_length=20)
 full_name:str=Field(min_length=2, max_length=120)
 class_id:int
 guardian_id:int|None=None
 gender:str|None=None
 is_active:bool=True

 @field_validator('nis', 'full_name', mode='before')
 @classmethod
 def trim_text(cls, value):
  return value.strip() if isinstance(value, str) else value


def student_out(s):
 return {'id':str(s.id),'nis':s.nis,'fullName':s.full_name,'classId':str(s.class_id),'className':s.classroom.name,'major':s.classroom.major,'gender':s.gender,'guardianId':str(s.guardian_id) if s.guardian_id else None,'parentName':s.guardian.full_name if s.guardian else '', 'parentPhone':s.guardian.phone_number if s.guardian else '', 'faceRegistered':s.face_enrollment_status=='REGISTERED','status':'ACTIVE' if s.is_active else 'INACTIVE','createdAt':s.created_at.isoformat(),'updatedAt':s.updated_at.isoformat()}


def validate_guardian_assignment(guardian_id, db, student_id=None):
 if guardian_id is None:return
 guardian=db.get(Guardian,guardian_id)
 if not guardian or not guardian.is_active:error(422,'Wali aktif tidak ditemukan.','GUARDIAN_NOT_FOUND')
 account=db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id==guardian_id))
 if account:
  links=select(GuardianStudent).where(GuardianStudent.guardian_id==guardian_id)
  if student_id is not None:links=links.where(GuardianStudent.student_id!=student_id)
  if db.scalar(links):error(422,'Satu akun orang tua hanya dapat terhubung ke satu siswa.','MULTIPLE_STUDENTS_NOT_ALLOWED')


router=APIRouter(tags=['Students'])
@router.get('/api/students')
def students(is_active:bool=True,q:str='',class_id:int|None=None,face_status:str|None=None,page:int=Query(1, ge=1),page_size:int=Query(50, ge=1, le=500),db:Session=Depends(get_db),u=Depends(user_dep)):
 if not is_active and u.role!='ADMIN_IT':error(403,'Arsip siswa hanya tersedia untuk Admin IT.','FORBIDDEN')
 s=select(Student).where(Student.is_active==is_active)
 if u.role=='PARENT':
  student_ids=get_parent_student_ids(u,db)
  s=s.where(Student.id.in_(student_ids))
 if q:s=s.where(or_(Student.nis.contains(q),Student.full_name.contains(q)))
 if class_id:s=s.where(Student.class_id==class_id)
 if face_status:s=s.where(Student.face_enrollment_status==face_status)
 return {'success':True,'data':[student_out(x) for x in db.scalars(s.order_by(Student.id).offset((page-1)*page_size).limit(page_size)).all()]}
@router.post('/api/students')
def create_student(body:StudentIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
 classroom=db.get(ClassRoom,body.class_id)
 if not classroom or not classroom.is_active:error(422,'Kelas aktif tidak ditemukan.','CLASS_NOT_FOUND')
 validate_guardian_assignment(body.guardian_id,db)
 x=Student(**body.model_dump());db.add(x)
 try:db.flush()
 except IntegrityError:db.rollback();error(409,'NIS sudah digunakan.','NIS_EXISTS')
 if body.guardian_id is not None:db.add(GuardianStudent(guardian_id=body.guardian_id,student_id=x.id,relationship='Wali'))
 audit(db,u,'CREATE','Student',x.id,'Menambah siswa');db.commit();db.refresh(x);return {'success':True,'data':student_out(x)}
@router.get('/api/students/{id}')
def get_student(id:int,db:Session=Depends(get_db),u=Depends(user_dep)):
 x=db.get(Student,id)
 if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
 if u.role=='PARENT':
  x=get_parent_student(u,id,db)
 return {'success':True,'data':student_out(x)}
@router.patch('/api/students/{id}')
def update_student(id:int,body:StudentIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
 x=db.get(Student,id)
 if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
 classroom=db.get(ClassRoom,body.class_id)
 if not classroom or (not classroom.is_active and body.class_id != x.class_id):error(422,'Kelas aktif tidak ditemukan.','CLASS_NOT_FOUND')
 validate_guardian_assignment(body.guardian_id,db,id)
 was_active=x.is_active
 for k,v in body.model_dump(exclude_unset=True).items():setattr(x,k,v)
 try:db.flush()
 except IntegrityError:db.rollback();error(409,'NIS sudah digunakan.','NIS_EXISTS')
 if body.guardian_id is not None and not db.scalar(select(GuardianStudent).where(GuardianStudent.guardian_id==body.guardian_id,GuardianStudent.student_id==x.id)):db.add(GuardianStudent(guardian_id=body.guardian_id,student_id=x.id,relationship='Wali'))
 audit(db,u,'UPDATE','Student',id,'Memperbarui siswa')
 if was_active != x.is_active:audit(db,u,'REACTIVATE' if x.is_active else 'DEACTIVATE','Student',id,'Mengubah status siswa')
 db.commit();db.refresh(x)
 if was_active != x.is_active or not x.is_active:face_recognition_service.invalidate(id)
 return {'success':True,'data':student_out(x)}
@router.delete('/api/students/{id}')
def delete_student(id:int,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
 x=db.get(Student,id)
 if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
 x.is_active=False;audit(db,u,'DEACTIVATE','Student',id,'Menonaktifkan siswa');db.commit();face_recognition_service.invalidate(id);return {'success':True}


class StudentStatusIn(BaseModel):
    is_active: bool


@router.patch('/api/students/{id}/status')
def student_status(id: int, body: StudentStatusIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    student = db.get(Student, id)
    if not student:
        error(404, 'Siswa tidak ditemukan.', 'NOT_FOUND')
    student.is_active = body.is_active
    audit(db, u, 'REACTIVATE' if body.is_active else 'DEACTIVATE', 'Student', id,
          'Mengaktifkan kembali siswa' if body.is_active else 'Menonaktifkan siswa')
    db.commit()
    face_recognition_service.invalidate(id)
    return {'success': True, 'data': student_out(student)}


@router.delete('/api/students/{id}/permanent')
def permanent_delete_student(id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    # Acquire a write lock before checking history (SQLite serializes writers).
    db.execute(update(Student).where(Student.id == id).values(is_active=Student.is_active))
    student = db.get(Student, id)
    if not student:
        error(404, 'Siswa tidak ditemukan.', 'NOT_FOUND')
    # Fail closed for every current or future mapped FK except owned disposable data.
    for table in Base.metadata.sorted_tables:
        if table.name in ('face_enrollments', 'guardian_students'):
            continue
        for fk in table.foreign_keys:
            if fk.column.table.name == 'students' and db.scalar(select(fk.parent).where(fk.parent == id).limit(1)) is not None:
                error(409, 'Siswa memiliki riwayat presensi, izin, atau notifikasi sehingga tidak dapat dihapus permanen. Gunakan Nonaktifkan agar riwayat tetap tersimpan.', 'STUDENT_HISTORY_PROTECTED')
    if student.photo_path:
        error(409, 'Berkas foto siswa memerlukan pemeriksaan kepemilikan. Gunakan Nonaktifkan.', 'STUDENT_FILE_PROTECTED')
    # Import lazily so the enrollment router's configured/test storage roots stay authoritative.
    from .face_enrollment import FACE_ROOT, PENDING_ROOT
    try:
        with staged_biometric_cleanup(db, id, FACE_ROOT, PENDING_ROOT) as cleanup:
            db.execute(delete(GuardianStudent).where(GuardianStudent.student_id == id))
            db.execute(delete(FaceEnrollment).where(FaceEnrollment.student_id == id))
            audit(db, u, 'PERMANENT_DELETE', 'Student', id,
                  f'Menghapus permanen siswa: student_id={id}; NIS={student.nis}; nama={student.full_name}')
            db.delete(student)
            db.commit()
    except IntegrityError:
        db.rollback()
        error(409, 'Siswa masih memiliki data terkait. Gunakan Nonaktifkan agar riwayat tetap tersimpan.', 'STUDENT_HISTORY_PROTECTED')
    except OSError:
        db.rollback()
        error(503, 'Berkas wajah belum dapat dibersihkan. Penghapusan dibatalkan; silakan coba lagi.', 'BIOMETRIC_CLEANUP_FAILED')
    face_recognition_service.invalidate(id)
    return {'success': True, 'data': {'id': str(id), 'action': 'PERMANENT_DELETE', **cleanup}}
