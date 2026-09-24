from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import AuditLog, require

router = APIRouter(tags=['Audit Logs'])


@router.get('/api/audit-logs')
def audit_logs(db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc())).all()
    return {'success': True, 'data': [{'id': str(x.id), 'timestamp': x.created_at.isoformat(), 'userId': str(x.user_id or ''), 'username': '', 'action': x.action, 'entity': x.entity_type, 'entityId': x.entity_id, 'details': x.description} for x in rows]}
