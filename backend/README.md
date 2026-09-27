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

Set `VITE_API_URL=http://localhost:8000` dan opsional `VITE_SCAN_INTERVAL_MS=850` pada `.env` frontend lalu jalankan `npm run dev`. Swagger tersedia di `/docs`.

Parent API tersedia di bawah `/api/parent`, termasuk dashboard, siswa terhubung,
presensi hari ini/riwayat, pengajuan izin, daftar notifikasi, unread count,
mark-read, dan read-all. Parent WebSocket menggunakan `/ws/parent?token=<JWT>`
dan hanya mengirim event untuk siswa yang terhubung ke akun tersebut. Notifikasi
ditulis ke SQLite sebelum delivery realtime; Parent yang offline tetap dapat
mengambilnya melalui API. Push notification Firebase/FCM belum diimplementasikan.

`data/kena_scan.db`, `data/faces/`, dan `data/backups/` bersifat lokal dan tidak masuk Git. Folder wajah disiapkan untuk `data/faces/{student_id}/`; engine wajah belum dikonfigurasi dan sengaja tidak pernah mengembalikan identitas palsu. SQLite dan file wajah belum dienkripsi pada MVP lokal—amankan perangkat serta backup.

Recognition SFace menggunakan cosine similarity dengan threshold awal `FACE_RECOGNITION_THRESHOLD=0.363`, mengacu pada ambang LFW yang dicantumkan dokumentasi resmi OpenCV. Nilai itu bukan kalibrasi untuk dataset sekolah; ukur false accept/reject dengan data enrollment lokal sebelum penggunaan operasional. Margin ambiguity dapat diatur dengan `FACE_RECOGNITION_AMBIGUITY_MARGIN` (default `0`, dinonaktifkan sampai dikalibrasi), dan scan berulang ditahan selama `FACE_SCAN_COOLDOWN_SECONDS` (default `4`).

Untuk membuat akun demo hardware validation secara idempotent, set `APP_ENV=development` lalu jalankan `python -m app.cli.seed_demo`. Perintah ini ditolak pada environment production, tidak berjalan otomatis saat startup, dan tidak mengubah akun yang username-nya sudah ada.
