from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..main import AttendanceSession, SessionIn, audit, broadcast, localnow, require, user_dep
router=APIRouter(tags=['Attendance Sessions'])
def fail(code,msg):raise HTTPException(code,{'success':False,'message':msg,'errors':{},'code':'REQUEST_ERROR'})
@router.post('/api/attendance-sessions/open')
async def open_session(body:SessionIn,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 if body.mode not in ('CHECK_IN','CHECK_OUT'):fail(422,'Mode harus CHECK_IN atau CHECK_OUT.')
 if db.scalar(select(AttendanceSession).where(AttendanceSession.status=='ACTIVE',AttendanceSession.mode==body.mode,AttendanceSession.camera_source==body.camera_source)):fail(409,'Sesi aktif untuk mode dan kamera ini sudah ada.')
 x=AttendanceSession(mode=body.mode,camera_source=body.camera_source,opened_by=u.id);db.add(x);db.flush();audit(db,u,'OPEN','AttendanceSession',x.id,'Membuka sesi');db.commit();await broadcast('SESSION_OPENED',{'session_id':x.id,'mode':x.mode});return {'success':True,'data':{'id':str(x.id),'mode':x.mode,'status':x.status}}
@router.get('/api/attendance-sessions/active')
def active_session(db:Session=Depends(get_db),u=Depends(user_dep)):
 x=db.scalar(select(AttendanceSession).where(AttendanceSession.status=='ACTIVE').order_by(AttendanceSession.opened_at.desc()))
 return {'success':True,'data':None if not x else {'id':str(x.id),'mode':x.mode,'status':x.status,'cameraSource':x.camera_source,'openedAt':x.opened_at.isoformat()}}
@router.post('/api/attendance-sessions/{id}/close')
async def close_session(id:int,db:Session=Depends(get_db),u=Depends(require('ADMIN_IT','GURU_PIKET'))):
 x=db.get(AttendanceSession,id)
 if not x or x.status!='ACTIVE':fail(404,'Sesi aktif tidak ditemukan.')
 x.status='CLOSED';x.closed_at=localnow();audit(db,u,'CLOSE','AttendanceSession',id,'Menutup sesi');db.commit();await broadcast('SESSION_CLOSED',{'session_id':id});return {'success':True}
