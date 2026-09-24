from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
import csv, io
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .config import settings
from .database import Base, engine, get_db
from .models import User, ClassRoom, Guardian, Student, FaceEnrollment, AttendanceSession, Attendance, LeaveRequest, AuditLog

TZ=ZoneInfo(settings.timezone); pwd=PasswordHasher(); clients:set[WebSocket]=set()
def localnow(): return datetime.now(TZ).replace(tzinfo=None)
def error(code,msg,code_name='VALIDATION_ERROR'): raise HTTPException(code, {'success':False,'message':msg,'errors':{},'code':code_name})
def audit(db,u,action,typ,eid,desc): db.add(AuditLog(user_id=u.id if u else None,action=action,entity_type=typ,entity_id=str(eid) if eid else None,description=desc))
def token(user): return jwt.encode({'sub':str(user.id),'role':user.role,'exp':datetime.utcnow()+timedelta(minutes=settings.access_token_expire_minutes)},settings.secret_key,algorithm='HS256')
def current_user(authorization: str|None = None, db:Session=Depends(get_db)):
    from fastapi import Header
    # Header injection is wired below through dependency wrapper.
    error(401,'Sesi tidak valid.','UNAUTHORIZED')
async def broadcast(event,data):
    message={'event':event,'timestamp':datetime.now(TZ).isoformat(),'data':data}
    for ws in list(clients):
        try: await ws.send_json(message)
        except Exception: clients.discard(ws)
def auth(authorization: str|None, db:Session):
    if not authorization or not authorization.startswith('Bearer '): error(401,'Silakan login terlebih dahulu.','UNAUTHORIZED')
    try: payload=jwt.decode(authorization[7:],settings.secret_key,algorithms=['HS256']); user=db.get(User,int(payload['sub']))
    except Exception: error(401,'Sesi tidak valid atau telah berakhir.','UNAUTHORIZED')
    if not user or not user.is_active: error(401,'Akun tidak aktif.','ACCOUNT_INACTIVE')
    return user
from fastapi import Header
def user_dep(authorization: str|None=Header(default=None),db:Session=Depends(get_db)): return auth(authorization,db)
def require(*roles):
    def dep(u:User=Depends(user_dep)):
        if u.role not in roles: error(403,'Anda tidak memiliki akses untuk aksi ini.','FORBIDDEN')
        return u
    return dep
def student_out(s): return {'id':str(s.id),'nis':s.nis,'fullName':s.full_name,'classId':str(s.class_id),'className':s.classroom.name,'major':s.classroom.major,'gender':s.gender,'parentName':s.guardian.full_name if s.guardian else '', 'parentPhone':s.guardian.phone_number if s.guardian else '', 'faceRegistered':s.face_enrollment_status=='REGISTERED','status':'ACTIVE' if s.is_active else 'INACTIVE','createdAt':s.created_at.isoformat(),'updatedAt':s.updated_at.isoformat()}
def attendance_out(a): return {'id':str(a.id),'date':a.attendance_date.isoformat(),'studentId':str(a.student_id),'studentName':a.student.full_name,'nis':a.student.nis,'className':a.student.classroom.name,'checkInTime':a.check_in_time.isoformat() if a.check_in_time else None,'checkOutTime':a.check_out_time.isoformat() if a.check_out_time else None,'status':a.status,'isCorrected':bool(a.notes),'correctionReason':a.notes,'parentNotified':False}
class Login(BaseModel): username:str; password:str
class UserIn(BaseModel): full_name:str=Field(min_length=2); username:str=Field(min_length=3); password:str=Field(min_length=8); role:str='GURU_PIKET'; is_active:bool=True
class ClassIn(BaseModel): name:str; grade:str; major:str; school_year:str
class GuardianIn(BaseModel): full_name:str; phone_number:str=Field(pattern=r'^(\+62|62|0)\d{8,13}$')
class StudentIn(BaseModel): nis:str; full_name:str; class_id:int; guardian_id:int|None=None; gender:str|None=None; is_active:bool=True
class SessionIn(BaseModel): mode:str; camera_source:str=str(settings.camera_source)
class ManualIn(BaseModel): student_id:int; mode:str; reason:str=Field(min_length=3); captured_at:datetime|None=None
class ScanIn(BaseModel): session_id:int; student_id:int; confidence_score:float=Field(ge=0,le=1); captured_at:datetime|None=None
class LeaveIn(BaseModel): student_id:int; leave_date:date; leave_type:str; reason:str=Field(min_length=3)
class Patch(BaseModel): status:str|None=None; notes:str|None=None; check_in_time:datetime|None=None; check_out_time:datetime|None=None
@asynccontextmanager
async def lifespan(app): Base.metadata.create_all(engine); yield
app=FastAPI(title='Kena Scan Tandara API',version='0.1.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.frontend_origin.split(',')],allow_credentials=False,allow_methods=['*'],allow_headers=['*'])
@app.exception_handler(HTTPException)
async def http_error(_,e):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=e.status_code,content=e.detail if isinstance(e.detail,dict) else {'success':False,'message':str(e.detail),'errors':{},'code':'HTTP_ERROR'})
@app.get('/api/health')
def health(): return {'success':True,'message':'Backend Tandara aktif','data':{'face_recognition':'NOT_CONFIGURED'}}
@app.post('/api/auth/login')
def login(body:Login,db:Session=Depends(get_db)):
    u=db.scalar(select(User).where(User.username==body.username.strip()))
    if not u or not u.is_active:
        error(401,'Username atau password tidak sesuai.','INVALID_CREDENTIALS')
    try: pwd.verify(u.password_hash,body.password)
    except VerifyMismatchError: error(401,'Username atau password tidak sesuai.','INVALID_CREDENTIALS')
    u.last_login_at=localnow(); audit(db,u,'LOGIN','User',u.id,'Pengguna login'); db.commit()
    return {'success':True,'data':{'access_token':token(u),'token_type':'bearer','user':{'id':str(u.id),'username':u.username,'displayName':u.full_name,'role':u.role,'isActive':u.is_active}}}
@app.post('/api/auth/logout')
def logout(u=Depends(user_dep),db:Session=Depends(get_db)): audit(db,u,'LOGOUT','User',u.id,'Pengguna logout'); db.commit(); return {'success':True,'message':'Logout berhasil'}
@app.get('/api/auth/me')
def me(u=Depends(user_dep)): return {'success':True,'data':{'id':str(u.id),'username':u.username,'displayName':u.full_name,'role':u.role,'isActive':u.is_active}}
@app.get('/api/users')
def users(db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))): return {'success':True,'data':[{'id':str(x.id),'username':x.username,'displayName':x.full_name,'role':x.role,'isActive':x.is_active,'createdAt':x.created_at.isoformat(),'lastLogin':x.last_login_at.isoformat() if x.last_login_at else None} for x in db.scalars(select(User)).all()]}
@app.post('/api/users')
def create_user(body:UserIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    if body.role not in ('GURU_PIKET','ADMIN_IT'): error(422,'Role tidak valid.')
    x=User(full_name=body.full_name,username=body.username,password_hash=pwd.hash(body.password),role=body.role,is_active=body.is_active); db.add(x)
    try: db.flush()
    except IntegrityError: db.rollback(); error(409,'Username sudah digunakan.','USERNAME_EXISTS')
    audit(db,u,'CREATE','User',x.id,f'Membuat akun {x.username}'); db.commit(); return {'success':True,'data':{'id':str(x.id),'username':x.username,'displayName':x.full_name,'role':x.role,'isActive':x.is_active,'createdAt':x.created_at.isoformat()}}
@app.patch('/api/users/{id}/status')
def user_status(id:int,active:bool,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=db.get(User,id)
    if not x:error(404,'User tidak ditemukan.','NOT_FOUND')
    x.is_active=active; audit(db,u,'STATUS_CHANGE','User',id,'Status user diubah');db.commit();return {'success':True}
@app.get('/api/classes')
def classes(db:Session=Depends(get_db),u=Depends(user_dep)):
    return {'success':True,'data':[{'id':str(x.id),'name':x.name,'grade':x.grade,'major':x.major,'schoolYear':x.school_year,'isActive':x.is_active,'studentCount':db.scalar(select(func.count()).select_from(Student).where(Student.class_id==x.id))} for x in db.scalars(select(ClassRoom)).all()]}
@app.post('/api/classes')
def create_class(body:ClassIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=ClassRoom(**body.model_dump());db.add(x)
    try:db.flush()
    except IntegrityError:db.rollback();error(409,'Nama kelas sudah digunakan.','CLASS_EXISTS')
    audit(db,u,'CREATE','ClassRoom',x.id,'Menambah kelas');db.commit();return {'success':True,'data':{'id':str(x.id),'name':x.name}}
def guardian_out(x, db):
    linked=db.scalars(select(Student).where(Student.guardian_id==x.id)).all()
    return {'id':str(x.id),'fullName':x.full_name,'phone':x.phone_number,'isActive':x.is_active,'studentIds':[str(s.id) for s in linked],'studentNames':[s.full_name for s in linked],'createdAt':x.created_at.isoformat()}
@app.get('/api/guardians')
def guardians(q:str='',include_inactive:bool=False,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    query=select(Guardian)
    if not include_inactive:query=query.where(Guardian.is_active==True)
    if q:query=query.where(or_(Guardian.full_name.contains(q),Guardian.phone_number.contains(q)))
    return {'success':True,'data':[guardian_out(x,db) for x in db.scalars(query).all()]}
@app.post('/api/guardians')
def create_guardian(body:GuardianIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=Guardian(**body.model_dump());db.add(x);db.flush();audit(db,u,'CREATE','Guardian',x.id,'Menambah data wali');db.commit();return {'success':True,'data':guardian_out(x,db)}
@app.patch('/api/guardians/{id}')
def update_guardian(id:int,body:GuardianIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=db.get(Guardian,id)
    if not x:error(404,'Wali tidak ditemukan.','NOT_FOUND')
    x.full_name=body.full_name;x.phone_number=body.phone_number;audit(db,u,'UPDATE','Guardian',id,'Memperbarui wali');db.commit();return {'success':True,'data':guardian_out(x,db)}
@app.post('/api/guardians/{id}/students')
def link_guardian(id:int,student_ids:list[int],db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=db.get(Guardian,id)
    if not x or not x.is_active:error(404,'Wali aktif tidak ditemukan.','NOT_FOUND')
    students=db.scalars(select(Student).where(Student.id.in_(student_ids))).all()
    if len(students)!=len(set(student_ids)):error(422,'Satu atau lebih siswa tidak ditemukan.')
    for student in students:student.guardian_id=x.id
    audit(db,u,'LINK_STUDENTS','Guardian',id,'Menautkan siswa ke wali');db.commit();return {'success':True,'data':guardian_out(x,db)}
@app.patch('/api/guardians/{id}/status')
def guardian_status(id:int,active:bool,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=db.get(Guardian,id)
    if not x:error(404,'Wali tidak ditemukan.','NOT_FOUND')
    if not active and db.scalar(select(func.count()).select_from(Student).where(Student.guardian_id==id,Student.is_active==True)):error(409,'Wali masih terhubung dengan siswa aktif.','GUARDIAN_LINKED')
    x.is_active=active;audit(db,u,'STATUS_CHANGE','Guardian',id,'Status wali diubah');db.commit();return {'success':True}
@app.get('/api/students')
def students(q:str='',class_id:int|None=None,face_status:str|None=None,page:int=1,page_size:int=50,db:Session=Depends(get_db),u=Depends(user_dep)):
    s=select(Student).where(Student.is_active==True)
    if q:s=s.where(or_(Student.nis.contains(q),Student.full_name.contains(q)))
    if class_id:s=s.where(Student.class_id==class_id)
    if face_status:s=s.where(Student.face_enrollment_status==face_status)
    rows=db.scalars(s.offset((page-1)*page_size).limit(page_size)).all();return {'success':True,'data':[student_out(x) for x in rows]}
@app.post('/api/students')
def create_student(body:StudentIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    if not db.get(ClassRoom,body.class_id):error(422,'Kelas tidak ditemukan.')
    x=Student(**body.model_dump());db.add(x)
    try:db.flush()
    except IntegrityError:db.rollback();error(409,'NIS sudah digunakan.','NIS_EXISTS')
    audit(db,u,'CREATE','Student',x.id,'Menambah siswa');db.commit();db.refresh(x);return {'success':True,'data':student_out(x)}
@app.get('/api/students/{id}')
def get_student(id:int,db:Session=Depends(get_db),u=Depends(user_dep)):
    x=db.get(Student,id)
    if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
    return {'success':True,'data':student_out(x)}
@app.patch('/api/students/{id}')
def update_student(id:int,body:StudentIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=db.get(Student,id)
    if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
    for k,v in body.model_dump().items():setattr(x,k,v)
    audit(db,u,'UPDATE','Student',id,'Memperbarui siswa');db.commit();db.refresh(x);return {'success':True,'data':student_out(x)}
@app.delete('/api/students/{id}')
def delete_student(id:int,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    x=db.get(Student,id)
    if not x:error(404,'Siswa tidak ditemukan.','NOT_FOUND')
    x.is_active=False;audit(db,u,'DEACTIVATE','Student',id,'Menonaktifkan siswa');db.commit();return {'success':True}

# Register attendance, leave, and WebSocket routes in the default ASGI app too.
# This keeps `uvicorn app.main:app` and the test entrypoint behaviour identical.
from . import full as _full
