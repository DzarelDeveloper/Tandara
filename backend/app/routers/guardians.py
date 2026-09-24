from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import Guardian, GuardianIn, Student, audit, error, require

router = APIRouter(tags=['Guardians'])


def guardian_out(x, db):
    linked = db.scalars(select(Student).where(Student.guardian_id == x.id)).all()
    return {'id': str(x.id), 'fullName': x.full_name, 'phone': x.phone_number, 'isActive': x.is_active, 'studentIds': [str(s.id) for s in linked], 'studentNames': [s.full_name for s in linked], 'createdAt': x.created_at.isoformat()}


@router.get('/api/guardians')
def guardians(q: str = '', include_inactive: bool = False, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    query = select(Guardian)
    if not include_inactive: query = query.where(Guardian.is_active == True)
    if q: query = query.where(or_(Guardian.full_name.contains(q), Guardian.phone_number.contains(q)))
    return {'success': True, 'data': [guardian_out(x, db) for x in db.scalars(query).all()]}


@router.post('/api/guardians')
def create_guardian(body: GuardianIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    x = Guardian(**body.model_dump()); db.add(x); db.flush(); audit(db, u, 'CREATE', 'Guardian', x.id, 'Menambah data wali'); db.commit(); return {'success': True, 'data': guardian_out(x, db)}


@router.patch('/api/guardians/{id}')
def update_guardian(id: int, body: GuardianIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    x = db.get(Guardian, id)
    if not x: error(404, 'Wali tidak ditemukan.', 'NOT_FOUND')
    x.full_name = body.full_name; x.phone_number = body.phone_number; audit(db, u, 'UPDATE', 'Guardian', id, 'Memperbarui wali'); db.commit(); return {'success': True, 'data': guardian_out(x, db)}


@router.post('/api/guardians/{id}/students')
def link_guardian(id: int, student_ids: list[int], db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    x = db.get(Guardian, id)
    if not x or not x.is_active: error(404, 'Wali aktif tidak ditemukan.', 'NOT_FOUND')
    students = db.scalars(select(Student).where(Student.id.in_(student_ids))).all()
    if len(students) != len(set(student_ids)): error(422, 'Satu atau lebih siswa tidak ditemukan.')
    for student in students: student.guardian_id = x.id
    audit(db, u, 'LINK_STUDENTS', 'Guardian', id, 'Menautkan siswa ke wali'); db.commit(); return {'success': True, 'data': guardian_out(x, db)}


@router.patch('/api/guardians/{id}/status')
def guardian_status(id: int, active: bool, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    x = db.get(Guardian, id)
    if not x: error(404, 'Wali tidak ditemukan.', 'NOT_FOUND')
    if not active and db.scalar(select(func.count()).select_from(Student).where(Student.guardian_id == id, Student.is_active == True)): error(409, 'Wali masih terhubung dengan siswa aktif.', 'GUARDIAN_LINKED')
    x.is_active = active; audit(db, u, 'STATUS_CHANGE', 'Guardian', id, 'Status wali diubah'); db.commit(); return {'success': True}
