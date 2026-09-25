from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import FastAPI, Depends, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .config import settings
from .database import Base, engine, get_db
from .models import User, ClassRoom, Guardian, Student, AttendanceSession, Attendance, LeaveRequest, AuditLog

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
def attendance_out(a): return {'id':str(a.id),'date':a.attendance_date.isoformat(),'studentId':str(a.student_id),'studentName':a.student.full_name,'nis':a.student.nis,'className':a.student.classroom.name,'checkInTime':a.check_in_time.isoformat() if a.check_in_time else None,'checkOutTime':a.check_out_time.isoformat() if a.check_out_time else None,'status':a.status,'isCorrected':bool(a.notes),'correctionReason':a.notes,'parentNotified':False}
class Login(BaseModel): username:str; password:str
class UserIn(BaseModel): full_name:str=Field(min_length=2); username:str=Field(min_length=3); password:str=Field(min_length=8); role:str='GURU_PIKET'; is_active:bool=True
class ClassIn(BaseModel): name:str; grade:str; major:str; school_year:str
class GuardianIn(BaseModel): full_name:str; phone_number:str=Field(pattern=r'^(\+62|62|0)\d{8,13}$')
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
from .routers.imports import router as imports_router
app.include_router(imports_router)
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

# Register attendance, leave, and WebSocket routes in the default ASGI app too.
# This keeps `uvicorn app.main:app` and the test entrypoint behaviour identical.
from . import full as _full
from .routers.dashboards import router as dashboards_router
from .routers.reports import router as reports_router
from .routers.audit_logs import router as audit_logs_router
from .routers.guardians import router as guardians_router
from .routers.leave_requests import router as leave_requests_router
from .routers.attendance_sessions import router as attendance_sessions_router
from .routers.attendance import router as attendance_router
from .routers.students import router as students_router
app.include_router(dashboards_router)
app.include_router(reports_router)
app.include_router(audit_logs_router)
app.include_router(guardians_router)
app.include_router(leave_requests_router)
app.include_router(attendance_sessions_router)
app.include_router(attendance_router)
app.include_router(students_router)
