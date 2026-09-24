# Tandara backend MVP

Backend FastAPI + SQLite lokal untuk dashboard Tandara. Database dimulai kosong; buat akun Admin IT secara eksplisit.

## Linux/macOS

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m app.cli.create_admin
.venv/bin/uvicorn app.main:app --reload --port 8000
```

## Windows

```powershell
cd backend
py -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python -m app.cli.create_admin
.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

Set `VITE_API_BASE_URL=http://localhost:8000` pada `.env` frontend lalu jalankan `npm run dev`. Swagger tersedia di `/docs`.

`data/kena_scan.db`, `data/faces/`, dan `data/backups/` bersifat lokal dan tidak masuk Git. Folder wajah disiapkan untuk `data/faces/{student_id}/`; engine wajah belum dikonfigurasi dan sengaja tidak pernah mengembalikan identitas palsu. SQLite dan file wajah belum dienkripsi pada MVP lokal—amankan perangkat serta backup.
