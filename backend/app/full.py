"""MVP route extension. Run with: uvicorn app.full:app --reload"""
from datetime import date, datetime
from fastapi import Depends, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse
import jwt
from .config import settings
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from .main import app, get_db, user_dep, require, localnow, audit, AttendanceSession, Attendance, LeaveRequest, Student, User, ClassRoom, Guardian, attendance_out, clients, broadcast, Patch, AuditLog
from pydantic import BaseModel, Field

class SessionIn(BaseModel): mode:str; camera_source:str='0'
class ManualIn(BaseModel): student_id:int; mode:str; reason:str=Field(min_length=3)
class ScanIn(BaseModel): session_id:int; student_id:int; confidence_score:float=Field(ge=0,le=1)
class LeaveIn(BaseModel): student_id:int; leave_date:date; leave_type:str; reason:str=Field(min_length=3)
def fail(code,msg): raise HTTPException(code,{'success':False,'message':msg,'errors':{},'code':'REQUEST_ERROR'})
def take(db, student_id, mode, method, user, confidence=None, notes=None):
    s=db.get(Student,student_id)
    if not s or not s.is_active: fail(404,'Siswa aktif tidak ditemukan.')
    a=db.scalar(select(Attendance).where(Attendance.student_id==student_id,Attendance.attendance_date==localnow().date()))
    if mode=='CHECK_IN':
        if a and a.check_in_time: fail(409,'Siswa sudah melakukan check-in.')
        if not a: a=Attendance(student_id=student_id,attendance_date=localnow().date(),status='PRESENT',created_by=user.id); db.add(a)
        a.check_in_time=localnow();a.check_in_method=method
    elif mode=='CHECK_OUT':
        if not a or not a.check_in_time: fail(422,'Check-out ditolak karena siswa belum check-in.')
        if a.check_out_time: fail(409,'Siswa sudah melakukan check-out.')
        a.check_out_time=localnow();a.check_out_method=method
    else: fail(422,'Mode absensi tidak valid.')
    a.confidence_score=confidence or a.confidence_score;a.notes=notes or a.notes;a.updated_by=user.id;db.flush();return a
@app.websocket('/ws/attendance')
async def websocket(ws:WebSocket):
    token=ws.query_params.get('token')
    try: jwt.decode(token or '',settings.secret_key,algorithms=['HS256'])
    except Exception:
        await ws.close(code=1008);return
    await ws.accept();clients.add(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: clients.discard(ws)
