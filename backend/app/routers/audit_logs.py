from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..main import AuditLog, User, require

router = APIRouter(tags=['Audit Logs'])


@router.get('/api/audit-logs')
def audit_logs(db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    rows = db.execute(select(AuditLog, User.username).outerjoin(User, User.id == AuditLog.user_id).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())).all()
    return {'success': True, 'data': [{'id': str(x.id), 'timestamp': x.created_at.isoformat(), 'userId': str(x.user_id or ''), 'username': username or '', 'action': x.action, 'entity': x.entity_type, 'entityId': x.entity_id, 'details': x.description} for x, username in rows]}
