import getpass, os
from ..database import Base, engine, SessionLocal
from ..models import User
from ..main import pwd
Base.metadata.create_all(engine)
db=SessionLocal()
username=os.getenv('ADMIN_USERNAME') or input('Username admin: ').strip()
name=os.getenv('ADMIN_FULL_NAME') or input('Nama lengkap: ').strip()
password=os.getenv('ADMIN_PASSWORD') or getpass.getpass('Password (min 8): ')
if len(password)<8: raise SystemExit('Password minimal 8 karakter.')
if db.query(User).filter_by(username=username).first(): raise SystemExit('Username sudah digunakan.')
db.add(User(full_name=name,username=username,password_hash=pwd.hash(password),role='ADMIN_IT'));db.commit();print('Akun Admin IT berhasil dibuat.')
