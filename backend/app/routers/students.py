from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..database import get_db
from ..main import ClassRoom, Student, audit, error, require, user_dep


class StudentIn(BaseModel):
 nis:str
 full_name:str
 class_id:int
 guardian_id:int|None=None
 gender:str|None=None
 is_active:bool=True


def student_out(s):
 return {'id':str(s.id),'nis':s.nis,'fullName':s.full_name,'classId':str(s.class_id),'className':s.classroom.name,'major':s.classroom.major,'gender':s.gender,'parentName':s.guardian.full_name if s.guardian else '', 'parentPhone':s.guardian.phone_number if s.guardian else '', 'faceRegistered':s.face_enrollment_status=='REGISTERED','status':'ACTIVE' if s.is_active else 'INACTIVE','createdAt':s.created_at.isoformat(),'updatedAt':s.updated_at.isoformat()}


router=APIRouter(tags=['Students'])
@router.get('/api/students')
def students(q:str='',class_id:int|None=None,face_status:str|None=None,page:int=1,page_size:int=50,db:Session=Depends(get_db),u=Depends(user_dep)):
 s=select(Student).where(Student.is_active==True)
 if q:s=s.where(or_(Student.nis.contains(q),Student.full_name.contains(q)))
 if class_id:s=s.where(Student.class_id==class_id)
 if face_status:s=s.where(Student.face_enrollment_status==face_status)
 return {'success':True,'data':[student_out(x) for x in db.scalars(s.offset((page-1)*page_size).limit(page_size)).all()]}
@router.post('/api/students')
def create_student(body:StudentIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
 if not db.get(ClassRoom,body.class_id):error(422,'Kelas tidak ditemukan.')
 x=Student(**body.model_dump());db.add(x)
 try:db.flush()
 except IntegrityError:db.rollback();error(409,'NIS sudah digunakan.','NIS_EXISTS')
 audit(db,u,'CREATE','Student',x.id,'Menambah siswa');db.commit();db.refresh(x);return {'success':True,'data':student_out(x)}
@router.get('/api/students/{id}')
def get_student(id:int,db:Session=Depends(get_db),u=Depends(user_dep)):
 x=db.get(Student,id)
 if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
 return {'success':True,'data':student_out(x)}
@router.patch('/api/students/{id}')
def update_student(id:int,body:StudentIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
 x=db.get(Student,id)
 if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
 for k,v in body.model_dump().items():setattr(x,k,v)
 audit(db,u,'UPDATE','Student',id,'Memperbarui siswa');db.commit();db.refresh(x);return {'success':True,'data':student_out(x)}
@router.delete('/api/students/{id}')
def delete_student(id:int,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
 x=db.get(Student,id)
 if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
 x.is_active=False;audit(db,u,'DEACTIVATE','Student',id,'Menonaktifkan siswa');db.commit();return {'success':True}
