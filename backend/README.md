# Tandara backend MVP

Backend FastAPI + SQLite lokal untuk dashboard Tandara. Database dimulai kosong; buat akun Admin IT secara eksplisit.

## Linux/macOS

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
test -f .env || cp .env.example .env
# Ganti SECRET_KEY dengan nilai acak yang kuat sebelum menjalankan aplikasi.
PYTHONPATH=backend .venv/bin/python -m app.cli.create_admin
PYTHONPATH=backend .venv/bin/uvicorn app.main:app --reload --port 8000
```

## Windows

```powershell
py -m venv .venv
.venv\Scripts\pip install -r backend\requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Ganti SECRET_KEY dengan nilai acak yang kuat sebelum menjalankan aplikasi.
$env:PYTHONPATH = "backend"
.venv\Scripts\python.exe -m app.cli.create_admin
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Jalankan perintah dari root repository. Backend membaca konfigurasi dari `.env` root; gunakan `.env.example` root sebagai template. `DATABASE_URL` default menunjuk ke `backend/data/kena_scan.db`. Untuk menjalankan frontend Admin IT dan Guru Piket, install dependency dengan `npm ci`, lalu jalankan `npm run dev`; `VITE_API_URL` default dari template adalah `http://localhost:8000`. Swagger tersedia di `/docs`.

Parent API tersedia di bawah `/api/parent`, termasuk dashboard, siswa terhubung,
presensi hari ini/riwayat, pengajuan izin, daftar notifikasi, unread count,
mark-read, dan read-all. Parent WebSocket menggunakan `/ws/parent?token=<JWT>`
dan hanya mengirim event untuk siswa yang terhubung ke akun tersebut. Notifikasi
ditulis ke SQLite sebelum delivery realtime; Parent yang offline tetap dapat
mengambilnya melalui API. Push notification Firebase/FCM belum diimplementasikan.

`backend/data/kena_scan.db`, `backend/data/faces/`, dan `backend/data/backups/` bersifat lokal dan tidak masuk Git. Face engine menggunakan model YuNet dan SFace yang dikonfigurasi di `backend/ml_models/`; identitas hanya diterima melalui enrollment dan verifikasi yang berhasil, tidak dibuat sebagai fallback. SQLite dan file wajah belum dienkripsi pada MVP lokal—amankan perangkat serta backup.

## Retensi siswa dan data wajah

Menonaktifkan siswa adalah tindakan arsip: baris siswa, riwayat presensi/izin/notifikasi, relasi wali, dan enrollment dipertahankan; siswa nonaktif tidak dipakai untuk pengenalan sampai diaktifkan kembali. Penghapusan permanen hanya untuk Admin IT dan ditolak jika ada riwayat presensi, izin, atau notifikasi yang merujuk siswa. Berkas wajah hanya dibersihkan dari direktori siswa yang kepemilikannya dapat dipastikan; berkas ambigu atau berbagi menghalangi penghapusan.

Cleanup biometrik memakai staging di bawah direktori wajah agar berkas dapat dipulihkan bila transaksi database gagal. Kegagalan purge setelah commit dilaporkan sebagai `cleanupPending`; kegagalan proses mendadak dapat meninggalkan staging untuk pemeriksaan manual. Jangan menghapus seluruh direktori wajah atau `.deleting`; periksa ID siswa, enrollment, dan audit sebelum memulihkan atau membersihkan staging tertentu.

Recognition SFace menggunakan cosine similarity dengan threshold awal `FACE_RECOGNITION_THRESHOLD=0.363`, mengacu pada ambang LFW yang dicantumkan dokumentasi resmi OpenCV. Nilai itu bukan kalibrasi untuk dataset sekolah; ukur false accept/reject dengan data enrollment lokal sebelum penggunaan operasional. Margin ambiguity dapat diatur dengan `FACE_RECOGNITION_AMBIGUITY_MARGIN` (default `0`, dinonaktifkan sampai dikalibrasi), dan scan berulang ditahan selama `FACE_SCAN_COOLDOWN_SECONDS` (default `4`).

Untuk membuat akun demo hardware validation secara idempotent, set `APP_ENV=development` lalu jalankan `python -m app.cli.seed_demo`. Perintah ini ditolak pada environment production, tidak berjalan otomatis saat startup, dan tidak mengubah akun yang username-nya sudah ada.
