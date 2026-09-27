from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import ClassRoom, Student, audit, error, require, user_dep
from ..models import Major


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    grade: str = Field(default='', max_length=10)
    major_id: int | None = None
    major: str = Field(default='', max_length=120)
    school_year: str = Field(default='', max_length=20)
    is_active: bool = True

    @field_validator('name', 'grade', 'major', 'school_year')
    @classmethod
    def trim_text(cls, value: str) -> str:
        return value.strip()


class MajorIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_active: bool = True

    @field_validator('name')
    @classmethod
    def trim_name(cls, value: str) -> str:
        return value.strip()


router = APIRouter()


def class_out(row: ClassRoom, db: Session) -> dict:
    major = db.scalar(select(Major).where(Major.name == row.major)) if row.major else None
    return {
        'id': str(row.id), 'name': row.name, 'grade': row.grade, 'major': row.major,
        'majorId': str(major.id) if major else None, 'schoolYear': row.school_year,
        'isActive': row.is_active,
        'studentCount': db.scalar(select(func.count()).select_from(Student).where(Student.class_id == row.id)) or 0,
    }


def major_out(row: Major, db: Session) -> dict:
    return {
        'id': str(row.id), 'name': row.name, 'isActive': row.is_active,
        'classCount': db.scalar(select(func.count()).select_from(ClassRoom).where(ClassRoom.major == row.name)) or 0,
        'createdAt': row.created_at.isoformat(), 'updatedAt': row.updated_at.isoformat(),
    }


def resolve_major(body: ClassIn, db: Session) -> str:
    if body.major_id is not None:
        major = db.get(Major, body.major_id)
        if not major or not major.is_active:
            error(422, 'Jurusan aktif tidak ditemukan.', 'MAJOR_NOT_FOUND')
        return major.name
    # Compatibility for existing clients while keeping arbitrary text valid.
    return body.major


@router.get('/api/classes')
def classes(db: Session = Depends(get_db), u=Depends(user_dep)):
    return {'success': True, 'data': [class_out(row, db) for row in db.scalars(select(ClassRoom).order_by(ClassRoom.name)).all()]}


@router.post('/api/classes')
def create_class(body: ClassIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    row = ClassRoom(name=body.name, grade=body.grade, major=resolve_major(body, db), school_year=body.school_year, is_active=body.is_active)
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback(); error(409, 'Nama kelas sudah digunakan.', 'CLASS_EXISTS')
    audit(db, u, 'CREATE', 'ClassRoom', row.id, 'Menambah kelas'); db.commit(); db.refresh(row)
    return {'success': True, 'data': class_out(row, db)}


@router.patch('/api/classes/{class_id}')
def update_class(class_id: int, body: ClassIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    row = db.get(ClassRoom, class_id)
    if not row: error(404, 'Kelas tidak ditemukan.', 'NOT_FOUND')
    row.name = body.name; row.grade = body.grade; row.major = resolve_major(body, db)
    row.school_year = body.school_year; row.is_active = body.is_active
    try:
        db.flush()
    except IntegrityError:
        db.rollback(); error(409, 'Nama kelas sudah digunakan.', 'CLASS_EXISTS')
    audit(db, u, 'UPDATE', 'ClassRoom', row.id, 'Memperbarui kelas'); db.commit(); db.refresh(row)
    return {'success': True, 'data': class_out(row, db)}


@router.delete('/api/classes/{class_id}')
def delete_class(class_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    row = db.get(ClassRoom, class_id)
    if not row: error(404, 'Kelas tidak ditemukan.', 'NOT_FOUND')
    in_use = bool(db.scalar(select(func.count()).select_from(Student).where(Student.class_id == row.id)))
    if in_use:
        row.is_active = False
        action = 'DEACTIVATE'
    else:
        db.delete(row)
        action = 'DELETE'
    audit(db, u, action, 'ClassRoom', class_id, 'Menghapus atau menonaktifkan kelas'); db.commit()
    return {'success': True, 'data': {'id': str(class_id), 'action': action}}


@router.get('/api/majors')
def majors(db: Session = Depends(get_db), u=Depends(user_dep)):
    return {'success': True, 'data': [major_out(row, db) for row in db.scalars(select(Major).order_by(Major.name)).all()]}


@router.post('/api/majors')
def create_major(body: MajorIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    row = Major(name=body.name, is_active=body.is_active); db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback(); error(409, 'Nama jurusan sudah digunakan.', 'MAJOR_EXISTS')
    audit(db, u, 'CREATE', 'Major', row.id, 'Menambah jurusan'); db.commit(); db.refresh(row)
    return {'success': True, 'data': major_out(row, db)}


@router.patch('/api/majors/{major_id}')
def update_major(major_id: int, body: MajorIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    row = db.get(Major, major_id)
    if not row: error(404, 'Jurusan tidak ditemukan.', 'NOT_FOUND')
    old_name = row.name
    row.name = body.name; row.is_active = body.is_active
    try:
        db.flush()
    except IntegrityError:
        db.rollback(); error(409, 'Nama jurusan sudah digunakan.', 'MAJOR_EXISTS')
    db.query(ClassRoom).filter(ClassRoom.major == old_name).update({'major': row.name}, synchronize_session=False)
    audit(db, u, 'UPDATE', 'Major', row.id, 'Memperbarui jurusan'); db.commit(); db.refresh(row)
    return {'success': True, 'data': major_out(row, db)}


@router.delete('/api/majors/{major_id}')
def delete_major(major_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    row = db.get(Major, major_id)
    if not row: error(404, 'Jurusan tidak ditemukan.', 'NOT_FOUND')
    in_use = bool(db.scalar(select(func.count()).select_from(ClassRoom).where(ClassRoom.major == row.name)))
    if in_use:
        row.is_active = False
        action = 'DEACTIVATE'
    else:
        db.delete(row)
        action = 'DELETE'
    audit(db, u, action, 'Major', major_id, 'Menghapus atau menonaktifkan jurusan'); db.commit()
    return {'success': True, 'data': {'id': str(major_id), 'action': action}}
