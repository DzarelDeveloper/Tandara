from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import ClassRoom, Student, audit, error, require, user_dep


class ClassIn(BaseModel):
    name: str
    grade: str
    major: str
    school_year: str


router = APIRouter()


@router.get('/api/classes')
def classes(db: Session = Depends(get_db), u=Depends(user_dep)):
    return {'success': True, 'data': [{'id': str(x.id), 'name': x.name, 'grade': x.grade, 'major': x.major, 'schoolYear': x.school_year, 'isActive': x.is_active, 'studentCount': db.scalar(select(func.count()).select_from(Student).where(Student.class_id == x.id))} for x in db.scalars(select(ClassRoom)).all()]}


@router.post('/api/classes')
def create_class(body: ClassIn, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    x = ClassRoom(**body.model_dump()); db.add(x)
    try:
        db.flush()
    except IntegrityError:
        db.rollback(); error(409, 'Nama kelas sudah digunakan.', 'CLASS_EXISTS')
    audit(db, u, 'CREATE', 'ClassRoom', x.id, 'Menambah kelas'); db.commit(); return {'success': True, 'data': {'id': str(x.id), 'name': x.name}}
