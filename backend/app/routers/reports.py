import csv
import io
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import Attendance, Student, localnow, user_dep

router = APIRouter(tags=['Reports'])


@router.get('/api/reports/attendance.csv')
def attendance_csv(date_from: date | None = None, date_to: date | None = None, class_id: int | None = None, student_id: int | None = None, status: str | None = None, db: Session = Depends(get_db), u=Depends(user_dep)):
    q = select(Attendance).join(Student).order_by(Attendance.attendance_date.desc())
    if date_from: q = q.where(Attendance.attendance_date >= date_from)
    if date_to: q = q.where(Attendance.attendance_date <= date_to)
    if class_id: q = q.where(Student.class_id == class_id)
    if student_id: q = q.where(Attendance.student_id == student_id)
    if status: q = q.where(Attendance.status == status)
    out = io.StringIO(); writer = csv.writer(out); writer.writerow(['Tanggal', 'NIS', 'Nama', 'Kelas', 'Jam Masuk', 'Jam Pulang', 'Status', 'Metode Masuk', 'Metode Pulang', 'Catatan'])
    for a in db.scalars(q): writer.writerow([a.attendance_date, a.student.nis, a.student.full_name, a.student.classroom.name, a.check_in_time.isoformat() if a.check_in_time else '', a.check_out_time.isoformat() if a.check_out_time else '', a.status, a.check_in_method or '', a.check_out_method or '', a.notes or ''])
    filename = f'tandara-laporan-{localnow().date().isoformat()}.csv'
    return StreamingResponse(iter([out.getvalue()]), media_type='text/csv; charset=utf-8', headers={'Content-Disposition': f'attachment; filename="{filename}"'})
