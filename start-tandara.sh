#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:3000"
LOG_DIR="$SCRIPT_DIR/.logs"
backend_pid=""
frontend_pid=""
backend_started=false
frontend_started=false
cleanup_done=false
open_browser=true
backend_host="127.0.0.1"
frontend_host="127.0.0.1"
lan_mode=false
lan_host="${TANDARA_LAN_HOST:-}"
if [[ -n "$lan_host" ]]; then lan_mode=true; fi

ok() { printf '[OK] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; }
error() { printf '[ERROR] %s\n' "$*" >&2; }
check() { printf '\n[CHECK] %s\n' "$*"; }
start_msg() { printf '[START] %s\n' "$*"; }

usage() {
  cat <<'EOF'
Penggunaan: ./start-tandara.sh [--lan | --lan-host PRIVATE_IPV4] [--no-browser | --status | --help]

  --lan         Bind frontend dan backend ke IPv4 private rute utama yang terdeteksi.
  --lan-host IP Bind frontend dan backend hanya ke IPv4 private yang ditentukan.
  --no-browser  Jalankan Tandara tanpa membuka browser.
  --status      Tampilkan status tanpa menjalankan service.
  --help        Tampilkan bantuan ini.
EOF
}

show_port_owner() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" 2>/dev/null || true
  fi
}

port_is_open() {
  local port="$1"
  local host="${2:-127.0.0.1}"
  "$SCRIPT_DIR/.venv/bin/python" - "$port" "$host" <<'PY'
import socket
import sys

with socket.socket() as sock:
    sock.settimeout(0.4)
    raise SystemExit(0 if sock.connect_ex((sys.argv[2], int(sys.argv[1]))) == 0 else 1)
PY
}

port_is_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :$port" 2>/dev/null | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | grep -q .
  else
    return 1
  fi
}

detect_lan_host() {
  "$SCRIPT_DIR/.venv/bin/python" - <<'PY'
import socket

with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
    sock.connect(('192.0.2.1', 9))
    print(sock.getsockname()[0])
PY
}

validate_lan_host() {
  "$SCRIPT_DIR/.venv/bin/python" - "$1" <<'PY'
import ipaddress
import socket
import sys

address = ipaddress.IPv4Address(sys.argv[1])
private_networks = tuple(map(ipaddress.ip_network, ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')))
if not any(address in network for network in private_networks):
    raise SystemExit('LAN mode requires an RFC1918 private IPv4 address.')
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.bind((str(address), 0))
PY
}

health_payload() {
  curl -fsS --max-time 2 "$BACKEND_URL/api/health" 2>/dev/null
}

health_value() {
  local payload="$1"
  local field="$2"
  "$SCRIPT_DIR/.venv/bin/python" - "$payload" "$field" <<'PY'
import json
import sys

try:
    value = json.loads(sys.argv[1])
    for key in sys.argv[2].split('.'):
        value = value[key]
except (ValueError, KeyError, TypeError):
    raise SystemExit(1)
if isinstance(value, bool):
    print(str(value).lower())
else:
    print(value)
PY
}

backend_is_tandara() {
  local payload
  payload="$(health_payload)" || return 1
  [[ "$(health_value "$payload" success 2>/dev/null)" == "true" ]] &&
    [[ "$(health_value "$payload" message 2>/dev/null)" == "Backend Tandara aktif" ]]
}

frontend_is_tandara() {
  local html
  command -v curl >/dev/null 2>&1 || return 1
  html="$(curl -fsS --max-time 2 "$FRONTEND_URL/" 2>/dev/null)" || return 1
  grep -Eiq '<title>[^<]*Tandara|content="[^"]*Tandara' <<<"$html"
}

camera_status() {
  local devices=()
  while IFS= read -r device; do
    devices+=("$device")
  done < <(compgen -G '/dev/video*' | sort || true)

  if ((${#devices[@]})); then
    ok "Video device ditemukan:"
    printf '     %s\n' "${devices[@]}"
    if command -v v4l2-ctl >/dev/null 2>&1; then
      v4l2-ctl --list-devices 2>/dev/null | sed 's/^/     /' || true
    fi
    return 0
  fi

  warn "Tidak ada video device terdeteksi."
  printf '       Hubungkan/aktifkan DroidCam sebelum Live Attendance.\n'
  return 1
}

print_status() {
  local payload backend_state="OFFLINE" database_state="UNKNOWN" face_state="UNKNOWN"
  if [[ -x "$SCRIPT_DIR/.venv/bin/python" ]] && command -v curl >/dev/null 2>&1; then
    payload="$(health_payload)" || payload=""
    if [[ -n "$payload" ]] &&
      [[ "$(health_value "$payload" success 2>/dev/null)" == "true" ]] &&
      [[ "$(health_value "$payload" message 2>/dev/null)" == "Backend Tandara aktif" ]]; then
      backend_state="$(health_value "$payload" data.status 2>/dev/null | tr '[:lower:]' '[:upper:]')"
      [[ "$backend_state" == "OK" ]] && backend_state="READY"
      database_state="$(health_value "$payload" data.database.status 2>/dev/null | tr '[:lower:]' '[:upper:]')"
      face_state="$(health_value "$payload" data.face_recognition 2>/dev/null | tr '[:lower:]' '[:upper:]')"
    fi
  fi

  printf 'Backend: %s\n' "${backend_state:-UNKNOWN}"
  printf 'Database: %s\n' "${database_state:-UNKNOWN}"
  printf 'Face Engine: %s\n' "${face_state:-UNKNOWN}"
  if frontend_is_tandara; then
    printf 'Frontend: READY\n'
  else
    printf 'Frontend: OFFLINE\n'
  fi
  if compgen -G '/dev/video*' >/dev/null; then
    printf 'Camera: DETECTED\n'
  else
    printf 'Camera: NOT DETECTED\n'
  fi
}

stop_group() {
  local pid="$1"
  local label="$2"
  [[ -n "$pid" ]] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    local attempt
    for attempt in {1..20}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
    wait "$pid" 2>/dev/null || true
  fi
  ok "$label dihentikan"
}

cleanup() {
  [[ "$cleanup_done" == false ]] || return
  cleanup_done=true
  if [[ "$frontend_started" == true || "$backend_started" == true ]]; then
    printf '\n[STOP] Menghentikan Tandara...\n'
    [[ "$frontend_started" == true ]] && stop_group "$frontend_pid" "Frontend"
    [[ "$backend_started" == true ]] && stop_group "$backend_pid" "Backend"
    ok "Selesai"
  fi
}

on_signal() {
  exit 130
}

trap cleanup EXIT
trap on_signal INT TERM

mode="start"
while (($#)); do
  case "$1" in
    --lan) lan_mode=true ;;
    --lan-host)
      (($# > 1)) || { error '--lan-host requires a private IPv4 address.'; exit 2; }
      lan_mode=true
      lan_host="$2"
      shift
      ;;
    --no-browser) open_browser=false ;;
    --status) mode="status" ;;
    --help|-h) usage; exit 0 ;;
    *) error "Argumen tidak dikenal: $1"; usage; exit 2 ;;
  esac
  shift
done

if [[ "$mode" == "status" ]]; then
  print_status
  exit 0
fi

cat <<'EOF'
========================================
              TANDARA
        Local Attendance System
========================================
EOF

check "Environment"
[[ -x "$SCRIPT_DIR/.venv/bin/python" ]] || { error ".venv/bin/python tidak ditemukan atau tidak executable."; printf '        Buat virtualenv dan install backend/requirements.txt terlebih dahulu.\n'; exit 1; }
[[ -d "$SCRIPT_DIR/backend" ]] || { error "Direktori backend tidak ditemukan."; exit 1; }
[[ -f "$SCRIPT_DIR/backend/app/main.py" ]] || { error "backend/app/main.py tidak ditemukan."; exit 1; }
[[ -f "$SCRIPT_DIR/package.json" ]] || { error "package.json tidak ditemukan."; exit 1; }
command -v node >/dev/null 2>&1 || { error "node tidak ditemukan. Install Node.js terlebih dahulu."; exit 1; }
command -v npm >/dev/null 2>&1 || { error "npm tidak ditemukan. Install Node.js/npm terlebih dahulu."; exit 1; }
command -v curl >/dev/null 2>&1 || { error "curl tidak ditemukan. Install curl terlebih dahulu."; exit 1; }
command -v setsid >/dev/null 2>&1 || { error "setsid tidak ditemukan. Install paket util-linux terlebih dahulu."; exit 1; }

if [[ "$lan_mode" == true ]]; then
  if [[ -z "$lan_host" ]]; then
    lan_host="$(detect_lan_host)" || { error 'Alamat LAN tidak dapat dideteksi; gunakan --lan-host PRIVATE_IPV4.'; exit 1; }
  fi
  validate_lan_host "$lan_host" || { error "Alamat LAN $lan_host bukan IPv4 private lokal pada komputer ini."; exit 1; }
  backend_host="$lan_host"
  frontend_host="$lan_host"
  printf '[WARN] Mode LAN: hanya bind ke %s. Firewall dan jangkauan jaringan tidak diperiksa.\n' "$lan_host"
fi
BACKEND_URL="http://${backend_host}:8000"
FRONTEND_URL="http://${frontend_host}:3000"
export FRONTEND_ORIGIN="$FRONTEND_URL"
export VITE_API_URL="$BACKEND_URL"

ok "$($SCRIPT_DIR/.venv/bin/python --version 2>&1)"
ok "Node $(node --version)"
ok "npm $(npm --version)"

yunet_model="$SCRIPT_DIR/backend/ml_models/yunet_face_detection.onnx"
sface_model="$SCRIPT_DIR/backend/ml_models/face_recognition_sface.onnx"
models_ok=true
if [[ -f "$yunet_model" ]]; then ok "YuNet model ditemukan"; else error "Model Face Engine tidak lengkap: backend/ml_models/yunet_face_detection.onnx tidak ditemukan."; models_ok=false; fi
if [[ -f "$sface_model" ]]; then ok "SFace model ditemukan"; else error "Model Face Engine tidak lengkap: backend/ml_models/face_recognition_sface.onnx tidak ditemukan."; models_ok=false; fi
[[ "$models_ok" == true ]] || exit 1

mkdir -p "$LOG_DIR"

check "Services"
if backend_is_tandara; then
  ok "Backend Tandara sudah berjalan di port 8000"
elif port_is_open 8000 "$backend_host"; then
  error "Port 8000 digunakan proses lain."
  show_port_owner 8000
  exit 1
elif port_is_listening 8000; then
  error "Port 8000 sudah memiliki listener pada interface lain."
  show_port_owner 8000
  exit 1
else
  : >"$LOG_DIR/backend.log"
  start_msg "FastAPI..."
  # Match start.sh and the documented backend CLI working directory so a
  # relative SQLite URL selects the same database as account initialization.
  (cd "$SCRIPT_DIR" && exec setsid env PYTHONPATH="$SCRIPT_DIR/backend" APP_ENV=development FRONTEND_ORIGIN="$FRONTEND_ORIGIN" \
    "$SCRIPT_DIR/.venv/bin/python" -m uvicorn app.main:app \
    --host "$backend_host" --port 8000) >>"$LOG_DIR/backend.log" 2>&1 &
  backend_pid=$!
  backend_started=true

  backend_ready=false
  for attempt in {1..30}; do
    printf '\r       Menunggu backend... [%d/30]' "$attempt"
    if backend_is_tandara; then backend_ready=true; break; fi
    if ! kill -0 "$backend_pid" 2>/dev/null; then break; fi
    sleep 1
  done
  printf '\n'
  if [[ "$backend_ready" != true ]]; then
    error "Backend gagal siap. Log terakhir:"
    tail -n 30 "$LOG_DIR/backend.log" >&2 || true
    exit 1
  fi
  ok "Backend ready"
fi

payload="$(health_payload)"
backend_state="$(health_value "$payload" data.status 2>/dev/null || printf 'unknown')"
database_state="$(health_value "$payload" data.database.status 2>/dev/null || printf 'unknown')"
face_state="$(health_value "$payload" data.face_recognition 2>/dev/null || printf 'UNKNOWN')"
[[ "$backend_state" == "ok" ]] || { error "Backend health status: $backend_state"; exit 1; }
[[ "$database_state" == "connected" ]] || { error "Database tidak terhubung: $database_state"; exit 1; }
ok "Database connected"
if [[ "$face_state" == "READY" ]]; then
  ok "Face Engine READY"
else
  warn "Face Engine belum READY ($face_state)"
fi

check "Camera"
camera_status || true

if frontend_is_tandara; then
  ok "Frontend Tandara sudah berjalan di port 3000"
elif port_is_open 3000 "$frontend_host"; then
  error "Port 3000 digunakan proses lain."
  show_port_owner 3000
  exit 1
elif port_is_listening 3000; then
  error "Port 3000 sudah memiliki listener pada interface lain."
  show_port_owner 3000
  exit 1
else
  : >"$LOG_DIR/frontend.log"
  start_msg "Frontend..."
  setsid npm run dev -- --host "$frontend_host" --port 3000 --strictPort >>"$LOG_DIR/frontend.log" 2>&1 &
  frontend_pid=$!
  frontend_started=true

  frontend_ready=false
  for attempt in {1..30}; do
    printf '\r       Menunggu frontend... [%d/30]' "$attempt"
    if frontend_is_tandara; then frontend_ready=true; break; fi
    if ! kill -0 "$frontend_pid" 2>/dev/null; then break; fi
    sleep 1
  done
  printf '\n'
  if [[ "$frontend_ready" != true ]]; then
    error "Frontend gagal siap. Log terakhir:"
    tail -n 30 "$LOG_DIR/frontend.log" >&2 || true
    exit 1
  fi
  ok "Frontend ready"
fi

if [[ "$open_browser" == true ]]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$FRONTEND_URL" >/dev/null 2>&1 &
  else
    warn "xdg-open tidak tersedia; buka browser secara manual."
  fi
fi

cat <<EOF

----------------------------------------
Tandara siap digunakan

Web:
$FRONTEND_URL

API:
$BACKEND_URL

FastAPI bind:
$backend_host:8000

Logs:
.logs/backend.log
.logs/frontend.log

Tekan Ctrl+C untuk menghentikan launcher.
Service yang sudah berjalan sebelum launcher tidak akan dihentikan.
----------------------------------------
EOF

while true; do
  if [[ "$backend_started" == true ]] && ! kill -0 "$backend_pid" 2>/dev/null; then
    error "Backend berhenti tidak terduga. Periksa .logs/backend.log."
    exit 1
  fi
  if [[ "$frontend_started" == true ]] && ! kill -0 "$frontend_pid" 2>/dev/null; then
    error "Frontend berhenti tidak terduga. Periksa .logs/frontend.log."
    exit 1
  fi
  sleep 2
done
