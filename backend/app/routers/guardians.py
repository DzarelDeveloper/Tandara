from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import Guardian, Student, User, audit, error, pwd, require
from ..models import GuardianAccount, GuardianStudent
from ..services.usernames import generate_unique_username
from ..services.parent_access import get_parent_guardian

router = APIRouter(tags=['Guardians'])


class GuardianCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone_number: str = Field(pattern=r'^(\+62|62|0)\d{8,13}$')
    relationship: str = Field(default='Wali', min_length=1, max_length=40)
    password: str | None = Field(default=None, min_length=8)
    student_ids: list[int] = Field(default_factory=list)
    is_active: bool = True


class GuardianUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone_number: str = Field(pattern=r'^(\+62|62|0)\d{8,13}$')
    relationship: str | None = Field(default=None, min_length=1, max_length=40)


class GuardianLinks(BaseModel):
    student_ids: list[int] = Field(min_length=1)
    relationship: str = Field(default='Wali', min_length=1, max_length=40)


def linked_rows(guardian_id: int, db: Session, active_only: bool = True):
    query = (
        select(GuardianStudent, Student)
        .join(Student, Student.id == GuardianStudent.student_id)
        .where(GuardianStudent.guardian_id == guardian_id)
        .order_by(Student.full_name)
    )
    if active_only:
        query = query.where(Student.is_active.is_(True))
    return db.execute(query).all()


def guardian_out(row: Guardian, db: Session):
    account = db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id == row.id))
    user = db.get(User, account.user_id) if account else None
    links = linked_rows(row.id, db)
    students = [{
        'id': str(student.id), 'nis': student.nis, 'fullName': student.full_name,
        'className': student.classroom.name, 'isActive': student.is_active,
        'relationship': link.relationship,
    } for link, student in links]
    relationship = students[0]['relationship'] if students else 'Wali'
    return {
        'id': str(row.id), 'fullName': row.full_name, 'phone': row.phone_number,
        'relationship': relationship, 'isActive': row.is_active and (user.is_active if user else True),
        'username': user.username if user else '', 'userId': str(user.id) if user else None,
        'studentIds': [item['id'] for item in students], 'studentNames': [item['fullName'] for item in students],
        'students': students, 'createdAt': row.created_at.isoformat(),
        'lastLogin': user.last_login_at.isoformat() if user and user.last_login_at else None,
    }


def validate_students(student_ids: list[int], db: Session) -> list[Student]:
    unique_ids = list(dict.fromkeys(student_ids))
    students = db.scalars(select(Student).where(Student.id.in_(unique_ids))).all() if unique_ids else []
    if len(students) != len(unique_ids): error(422, 'Satu atau lebih siswa tidak ditemukan.', 'STUDENT_NOT_FOUND')
    return students


def add_links(guardian: Guardian, students: list[Student], relationship: str, db: Session) -> None:
    for student in students:
        exists = db.scalar(select(GuardianStudent).where(GuardianStudent.guardian_id == guardian.id, GuardianStudent.student_id == student.id))
        if not exists: db.add(GuardianStudent(guardian_id=guardian.id, student_id=student.id, relationship=relationship))
        else: exists.relationship = relationship
        if student.guardian_id is None: student.guardian_id = guardian.id


@router.get('/api/guardians')
def guardians(q: str = '', include_inactive: bool = False, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    query = select(Guardian)
    if not include_inactive: query = query.where(Guardian.is_active.is_(True))
    if q: query = query.where(or_(Guardian.full_name.contains(q), Guardian.phone_number.contains(q)))
    return {'success': True, 'data': [guardian_out(row, db) for row in db.scalars(query.order_by(Guardian.full_name)).all()]}


@router.post('/api/guardians')
def create_guardian(body: GuardianCreate, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    if body.password and not body.student_ids: error(422, 'Akun orang tua harus terhubung minimal satu siswa.', 'STUDENT_REQUIRED')
    students = validate_students(body.student_ids, db)
    guardian = Guardian(full_name=body.full_name.strip(), phone_number=body.phone_number, is_active=body.is_active)
    db.add(guardian); db.flush()
    if body.password:
        username = generate_unique_username(body.full_name, db)
        user = User(full_name=body.full_name.strip(), username=username, password_hash=pwd.hash(body.password), role='PARENT', is_active=body.is_active)
        db.add(user)
        try: db.flush()
        except IntegrityError: db.rollback(); error(409, 'Username baru saja digunakan. Silakan ulangi pembuatan akun.', 'USERNAME_EXISTS')
        db.add(GuardianAccount(guardian_id=guardian.id, user_id=user.id))
    add_links(guardian, students, body.relationship.strip(), db)
    audit(db, u, 'CREATE', 'Guardian', guardian.id, 'Membuat wali dan hubungan siswa'); db.commit(); db.refresh(guardian)
    return {'success': True, 'data': guardian_out(guardian, db)}


@router.patch('/api/guardians/{guardian_id}')
def update_guardian(guardian_id: int, body: GuardianUpdate, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    guardian = db.get(Guardian, guardian_id)
    if not guardian: error(404, 'Wali tidak ditemukan.', 'NOT_FOUND')
    guardian.full_name = body.full_name.strip(); guardian.phone_number = body.phone_number
    account = db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id == guardian.id))
    if account: db.get(User, account.user_id).full_name = guardian.full_name
    if body.relationship:
        db.query(GuardianStudent).filter(GuardianStudent.guardian_id == guardian.id).update({'relationship': body.relationship.strip()}, synchronize_session=False)
    audit(db, u, 'UPDATE', 'Guardian', guardian.id, 'Memperbarui wali'); db.commit(); db.refresh(guardian)
    return {'success': True, 'data': guardian_out(guardian, db)}


@router.put('/api/guardians/{guardian_id}/students')
def replace_guardian_students(guardian_id: int, body: GuardianLinks, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    guardian = db.get(Guardian, guardian_id)
    if not guardian: error(404, 'Wali tidak ditemukan.', 'NOT_FOUND')
    students = validate_students(body.student_ids, db)
    desired = {student.id for student in students}
    existing = db.scalars(select(GuardianStudent).where(GuardianStudent.guardian_id == guardian.id)).all()
    for link in existing:
        if link.student_id not in desired:
            student = db.get(Student, link.student_id)
            db.delete(link); db.flush()
            if student and student.guardian_id == guardian.id:
                replacement = db.scalar(select(GuardianStudent).where(GuardianStudent.student_id == student.id))
                student.guardian_id = replacement.guardian_id if replacement else None
    add_links(guardian, students, body.relationship.strip(), db)
    audit(db, u, 'REPLACE_STUDENT_LINKS', 'Guardian', guardian.id, 'Memperbarui hubungan siswa'); db.commit()
    return {'success': True, 'data': guardian_out(guardian, db)}


@router.post('/api/guardians/{guardian_id}/students')
def link_guardian(guardian_id: int, student_ids: list[int], relationship: str = 'Wali', db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    guardian = db.get(Guardian, guardian_id)
    if not guardian or not guardian.is_active: error(404, 'Wali aktif tidak ditemukan.', 'NOT_FOUND')
    add_links(guardian, validate_students(student_ids, db), relationship.strip(), db)
    audit(db, u, 'LINK_STUDENTS', 'Guardian', guardian.id, 'Menautkan siswa ke wali'); db.commit()
    return {'success': True, 'data': guardian_out(guardian, db)}


@router.delete('/api/guardians/{guardian_id}/students/{student_id}')
def unlink_guardian(guardian_id: int, student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    link = db.scalar(select(GuardianStudent).where(GuardianStudent.guardian_id == guardian_id, GuardianStudent.student_id == student_id))
    if not link: error(404, 'Hubungan wali dan siswa tidak ditemukan.', 'NOT_FOUND')
    student = db.get(Student, student_id); db.delete(link); db.flush()
    if student and student.guardian_id == guardian_id:
        replacement = db.scalar(select(GuardianStudent).where(GuardianStudent.student_id == student_id))
        student.guardian_id = replacement.guardian_id if replacement else None
    audit(db, u, 'UNLINK_STUDENT', 'Guardian', guardian_id, 'Melepas hubungan siswa'); db.commit()
    return {'success': True}


@router.patch('/api/guardians/{guardian_id}/status')
def guardian_status(guardian_id: int, active: bool, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    guardian = db.get(Guardian, guardian_id)
    if not guardian: error(404, 'Wali tidak ditemukan.', 'NOT_FOUND')
    guardian.is_active = active
    account = db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id == guardian.id))
    if account: db.get(User, account.user_id).is_active = active
    audit(db, u, 'STATUS_CHANGE', 'Guardian', guardian.id, 'Status wali diubah'); db.commit()
    return {'success': True, 'data': guardian_out(guardian, db)}


def current_parent(u: User, db: Session) -> Guardian:
    return get_parent_guardian(u, db)


@router.get('/api/parent/profile')
def parent_profile(db: Session = Depends(get_db), u=Depends(require('PARENT'))):
    return {'success': True, 'data': guardian_out(current_parent(u, db), db)}


@router.get('/api/parent/students')
def parent_students(db: Session = Depends(get_db), u=Depends(require('PARENT'))):
    guardian = current_parent(u, db)
    return {'success': True, 'data': [student for student in guardian_out(guardian, db)['students'] if student['isActive']]}


@router.get('/api/parent/students/{student_id}')
def parent_student(student_id: int, db: Session = Depends(get_db), u=Depends(require('PARENT'))):
    guardian = current_parent(u, db)
    link = db.scalar(select(GuardianStudent).where(GuardianStudent.guardian_id == guardian.id, GuardianStudent.student_id == student_id))
    if not link: error(404, 'Siswa tidak ditemukan.', 'NOT_FOUND')
    student = db.get(Student, student_id)
    if not student or not student.is_active: error(404, 'Siswa tidak ditemukan.', 'NOT_FOUND')
    return {'success': True, 'data': {'id': str(student.id), 'nis': student.nis, 'fullName': student.full_name, 'className': student.classroom.name, 'isActive': student.is_active, 'relationship': link.relationship}}
