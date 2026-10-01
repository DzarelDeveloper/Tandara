import csv
import io
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..main import ClassRoom, Guardian, Student, GuardianStudent, audit, error, require

router = APIRouter(tags=['Imports'])


def import_result(rows, db):
    required={'nis','nama','kelas','jurusan','nama_wali','nomor_wali'}
    if not rows or not required.issubset(rows[0]):
        return None, {'total_rows':len(rows),'valid_rows':0,'invalid_rows':len(rows),'rows':[],'header_error':'Kolom wajib: nis,nama,kelas,jurusan,nama_wali,nomor_wali'}
    seen=set(); details=[]
    for number,row in enumerate(rows,2):
        errors=[]
        row={key: (value or '').strip() if isinstance(value, (str, type(None))) else value for key,value in row.items()}
        nis=row['nis']
        if not nis: errors.append({'field':'nis','message':'NIS wajib diisi'})
        elif nis in seen: errors.append({'field':'nis','message':'NIS duplikat dalam file'})
        elif db.scalar(select(Student.id).where(Student.nis==nis)): errors.append({'field':'nis','message':'NIS sudah terdaftar'})
        seen.add(nis)
        if len(nis)>20: errors.append({'field':'nis','message':'NIS maksimal 20 karakter'})
        for field in ('nama','nama_wali'):
            if len(row[field]) < 2: errors.append({'field':field,'message':'Nama minimal 2 karakter'})
        if not db.scalar(select(ClassRoom.id).where(ClassRoom.name==row['kelas'].strip(),ClassRoom.major==row['jurusan'].strip(),ClassRoom.is_active.is_(True))):errors.append({'field':'kelas','message':'Kelas atau jurusan tidak ditemukan'})
        if not re.fullmatch(r'(\+62|62|0)\d{8,13}', row['nomor_wali']):errors.append({'field':'nomor_wali','message':'Nomor telepon Indonesia tidak valid'})
        details.append({'row_number':number,'valid':not errors,'errors':errors,'data':row})
    return details, {'total_rows':len(rows),'valid_rows':sum(x['valid'] for x in details),'invalid_rows':sum(not x['valid'] for x in details),'rows':details}


@router.get('/api/students/import-template.csv')
def import_template(u=Depends(require('ADMIN_IT'))):
    return StreamingResponse(iter(['nis,nama,kelas,jurusan,nama_wali,nomor_wali\n']),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="tandara-template-siswa.csv"'})


@router.post('/api/students/import/preview')
async def import_preview(file:UploadFile=File(...),db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    if not file.filename or not file.filename.lower().endswith('.csv'):raise HTTPException(415,{'success':False,'message':'File harus CSV.','errors':{},'code':'REQUEST_ERROR'})
    raw=await file.read()
    if len(raw)>settings.max_upload_mb*1024*1024:raise HTTPException(413,{'success':False,'message':'Ukuran file melebihi batas.','errors':{},'code':'REQUEST_ERROR'})
    try: rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    except UnicodeDecodeError:raise HTTPException(422,{'success':False,'message':'CSV harus UTF-8.','errors':{},'code':'REQUEST_ERROR'})
    _, result=import_result(rows,db)
    if 'header_error' in result:error(422,result['header_error'],'IMPORT_HEADER_ERROR')
    return {'success':True,'data':result}


@router.post('/api/students/import')
async def import_students(file:UploadFile=File(...),db:Session=Depends(get_db),u=Depends(require('ADMIN_IT'))):
    if not file.filename or not file.filename.lower().endswith('.csv'):raise HTTPException(415,{'success':False,'message':'File harus CSV.','errors':{},'code':'REQUEST_ERROR'})
    raw=await file.read()
    if len(raw)>settings.max_upload_mb*1024*1024:raise HTTPException(413,{'success':False,'message':'Ukuran file melebihi batas.','errors':{},'code':'REQUEST_ERROR'})
    try: rows=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    except UnicodeDecodeError:raise HTTPException(422,{'success':False,'message':'CSV harus UTF-8.','errors':{},'code':'REQUEST_ERROR'})
    details,result=import_result(rows,db)
    if details is None:error(422,result['header_error'],'IMPORT_HEADER_ERROR')
    if result['invalid_rows']:raise HTTPException(422,{'success':False,'message':'Validasi impor gagal.','errors':result,'code':'IMPORT_VALIDATION_ERROR'})
    prepared=[]
    for n,row in enumerate(rows,2):
      nis=row['nis'].strip(); classroom=db.scalar(select(ClassRoom).where(ClassRoom.name==row['kelas'].strip(),ClassRoom.major==row['jurusan'].strip(),ClassRoom.is_active.is_(True)))
      prepared.append((nis,row,classroom))
    try:
      for nis,row,classroom in prepared:
        guardian=Guardian(full_name=row['nama_wali'].strip(),phone_number=row['nomor_wali'].strip());db.add(guardian);db.flush()
        student=Student(nis=nis,full_name=row['nama'].strip(),class_id=classroom.id,guardian_id=guardian.id)
        db.add(student);db.flush()
        db.add(GuardianStudent(guardian_id=guardian.id,student_id=student.id,relationship='Wali'))
      audit(db,u,'IMPORT','Student',None,f'Mengimpor {len(prepared)} siswa');db.commit()
    except Exception:
      db.rollback();raise
    return {'success':True,'data':{'importedCount':len(prepared)}}
