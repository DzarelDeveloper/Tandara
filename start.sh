#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${TANDARA_BACKEND_PORT:-8000}"
FRONTEND_PORT="${TANDARA_FRONTEND_PORT:-3000}"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"
LOG_DIR="$ROOT/.logs"
RUNTIME_DIR="$ROOT/.runtime"
backend_pid=""
frontend_pid=""
backend_started=false
frontend_started=false
cleanup_done=false

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
note() { printf '%s\n' "$*"; }

find_python() {
  local candidate
  if [[ -n "${TANDARA_PYTHON:-}" && -x "$TANDARA_PYTHON" ]]; then
    printf '%s\n' "$TANDARA_PYTHON"; return 0
  fi
  if [[ -n "${VIRTUAL_ENV:-}" && -x "$VIRTUAL_ENV/bin/python" ]]; then
    printf '%s\n' "$VIRTUAL_ENV/bin/python"; return 0
  fi
  for candidate in "$ROOT/.venv/bin/python" "$ROOT/backend/.venv/bin/python"; do
    if [[ -x "$candidate" ]]; then printf '%s\n' "$candidate"; return 0; fi
  done
  return 1
}

port_open() {
  "$PYTHON" - "$1" <<'PY'
import socket, sys
connection = socket.socket()
connection.settimeout(0.4)
is_open = connection.connect_ex(('127.0.0.1', int(sys.argv[1]))) == 0
connection.close()
raise SystemExit(0 if is_open else 1)
PY
}

show_port_owner() {
  local port="$1"
  note "Listener on port $port:"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>&1 || true
  else
    note "Install ss (iproute2) or lsof to inspect the process owner."
  fi
}

health_payload() { curl -fsS --max-time 2 "$BACKEND_URL/api/health" 2>/dev/null; }

health_state() {
  "$PYTHON" -c 'import json,sys; d=json.load(sys.stdin); print("\t".join(str(x) for x in (d.get("success"), d.get("message"), d.get("data",{}).get("status"), d.get("data",{}).get("database",{}).get("status"), d.get("data",{}).get("face_recognition"))))' <<<"$1" 2>/dev/null
}

backend_state=""
backend_is_ready() {
  local payload
  payload="$(health_payload)" || return 1
  backend_state="$(health_state "$payload")" || return 1
  [[ "$backend_state" == $'True\tBackend Tandara aktif\tok\tconnected\tREADY' ]]
}

frontend_is_ready() {
  local html
  html="$(curl -fsS --max-time 2 "$FRONTEND_URL/" 2>/dev/null)" || return 1
  grep -Eiq '<title>[^<]*Tandara|content="[^"]*Tandara' <<<"$html"
}

process_matches() {
  local pid="$1" marker="$2" cmdline
  [[ -r "/proc/$pid/cmdline" ]] || return 1
  cmdline="$(tr '\0' ' ' <"/proc/$pid/cmdline")"
  [[ "$cmdline" == *"$ROOT"* && "$cmdline" == *"$marker"* ]]
}

stop_owned_process() {
  local pid="$1" marker="$2" label="$3" pgid
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  if ! process_matches "$pid" "$marker"; then
    note "$label PID $pid tidak lagi dapat dibuktikan milik launcher; tidak disentuh."
    return 0
  fi
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  if [[ "$pgid" == "$pid" ]]; then kill -TERM -- "-$pid" 2>/dev/null || true; else kill -TERM "$pid" 2>/dev/null || true; fi
  wait "$pid" 2>/dev/null || true
  rm -f "$RUNTIME_DIR/$label.pid"
  note "$label launcher child stopped."
}

cleanup() {
  [[ "$cleanup_done" == true ]] && return
  cleanup_done=true
  if [[ "$frontend_started" == true ]]; then stop_owned_process "$frontend_pid" 'npm run dev' frontend; fi
  if [[ "$backend_started" == true ]]; then stop_owned_process "$backend_pid" 'uvicorn app.main:app' backend; fi
}

on_signal() { exit 130; }
trap cleanup EXIT
trap on_signal INT TERM

[[ -d "$ROOT/backend" && -f "$ROOT/backend/app/main.py" ]] || fail "Backend entrypoint missing under $ROOT/backend."
[[ -f "$ROOT/package.json" && -f "$ROOT/package-lock.json" ]] || fail 'Frontend package.json/package-lock.json is missing.'
[[ -f "$ROOT/.env" ]] || fail "Root .env is missing. Run $ROOT/setup.sh; .env.example is the active backend config template."
[[ -f "$ROOT/.env.example" ]] || fail 'Root .env.example is missing.'
[[ -d "$ROOT/node_modules" && -x "$ROOT/node_modules/.bin/vite" ]] || fail "Frontend dependencies are missing. Run $ROOT/setup.sh."
command -v node >/dev/null 2>&1 || fail 'Node.js is not installed or not on PATH.'
command -v npm >/dev/null 2>&1 || fail 'npm is not installed or not on PATH.'
command -v curl >/dev/null 2>&1 || fail 'curl is required for health checks.'
command -v setsid >/dev/null 2>&1 || fail 'setsid is required (install util-linux).'
command -v ss >/dev/null 2>&1 || command -v lsof >/dev/null 2>&1 || fail 'ss or lsof is required to identify port owners safely.'
PYTHON="$(find_python)" || fail "Python virtualenv not found. Supported locations: .venv or backend/.venv. Run ./setup.sh."

python_version="$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
[[ "$(printf '%s\n' 3.12 "$python_version" | sort -V | head -n1)" == 3.12 ]] || fail "Python 3.12+ required; found $python_version."

cd "$ROOT/backend"
mapfile -t runtime_values < <(PYTHONPATH="$ROOT/backend" APP_ENV=development "$PYTHON" - <<'PY'
import importlib.util
from app.config import settings
required = ('fastapi', 'uvicorn', 'sqlalchemy', 'pydantic_settings', 'cv2', 'numpy', 'jwt', 'argon2', 'multipart')
missing = [name for name in required if importlib.util.find_spec(name) is None]
if missing:
    raise SystemExit('Missing backend dependencies: ' + ', '.join(missing))
print(settings.face_detector_model)
print(settings.face_recognizer_model)
print(settings.database_url.split(':', 1)[0])
PY
) || fail "Backend config/dependencies could not load. Run ./setup.sh and check .env."
(( ${#runtime_values[@]} >= 3 )) || fail 'Could not resolve configured face model/database paths.'
for model in "${runtime_values[0]}" "${runtime_values[1]}"; do
  [[ -f "$model" ]] || fail "Required face model not found: $model. Restore the provided model file; setup does not download models."
done
[[ -n "${runtime_values[2]}" ]] || fail 'Database configuration is empty.'

printf '========================================\n        TANDARA DEVELOPMENT\n========================================\n'
printf 'System      : Ubuntu/Linux\nPython      : %s (%s)\nNode        : %s\nFace models : ready\nDatabase    : %s configured\n' "$python_version" "$PYTHON" "$(node --version)" "${runtime_values[2]}"

mkdir -p "$LOG_DIR" "$RUNTIME_DIR"
export APP_ENV=development
export PYTHONPATH="$ROOT/backend"
export FRONTEND_ORIGIN="http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT},http://localhost:3000,http://localhost:5173"
export VITE_API_URL="$BACKEND_URL"

if backend_is_ready; then
  note "Backend already running and healthy on :$BACKEND_PORT"
elif [[ -n "$backend_state" ]]; then
  note "Tandara health responded but is not ready: $backend_state"
  show_port_owner "$BACKEND_PORT"
  fail "Backend is degraded; inspect its owner/logs. No existing process was stopped."
elif port_open "$BACKEND_PORT"; then
  show_port_owner "$BACKEND_PORT"
  fail "Port $BACKEND_PORT is occupied by a non-healthy/unidentified service. Inspect it before stopping anything; if it is a recorded Tandara child, run ./stop.sh."
else
  : >"$LOG_DIR/backend-dev.log"
  note '[1/4] Backend starting...'
  (cd "$ROOT/backend" && exec setsid env APP_ENV=development PYTHONPATH="$ROOT/backend" FRONTEND_ORIGIN="$FRONTEND_ORIGIN" "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT") >>"$LOG_DIR/backend-dev.log" 2>&1 &
  backend_pid=$!
  backend_started=true
  printf '%s\n' "$backend_pid" >"$RUNTIME_DIR/backend.pid"
  note '[2/4] Waiting for backend health (max 30 seconds)...'
  backend_ready=false
  for _ in {1..30}; do
    if backend_is_ready; then backend_ready=true; break; fi
    if ! kill -0 "$backend_pid" 2>/dev/null; then break; fi
    sleep 1
  done
  [[ "$backend_ready" == true ]] || { tail -n 30 "$LOG_DIR/backend-dev.log" >&2 || true; fail 'Tandara backend failed to start; see .logs/backend-dev.log.'; }
  note 'Backend health: OK'
fi

if frontend_is_ready; then
  note "Frontend already running and healthy on :$FRONTEND_PORT"
elif port_open "$FRONTEND_PORT"; then
  show_port_owner "$FRONTEND_PORT"
  fail "Port $FRONTEND_PORT is occupied by a non-Tandara frontend. Inspect it before stopping anything; if it is a recorded Tandara child, run ./stop.sh."
else
  : >"$LOG_DIR/frontend-dev.log"
  note '[3/4] Backend ready'
  note '[4/4] Starting frontend...'
  (cd "$ROOT" && exec setsid bash -c 'cd "$1"; npm run dev -- --port "$2" --strictPort; result=$?; exit "$result"' _ "$ROOT" "$FRONTEND_PORT") >>"$LOG_DIR/frontend-dev.log" 2>&1 &
  frontend_pid=$!
  frontend_started=true
  printf '%s\n' "$frontend_pid" >"$RUNTIME_DIR/frontend.pid"
  frontend_ready=false
  for _ in {1..30}; do
    if frontend_is_ready; then frontend_ready=true; break; fi
    if ! kill -0 "$frontend_pid" 2>/dev/null; then break; fi
    sleep 1
  done
  [[ "$frontend_ready" == true ]] || { tail -n 30 "$LOG_DIR/frontend-dev.log" >&2 || true; fail 'Tandara frontend failed to start; see .logs/frontend-dev.log.'; }
fi

cat <<EOF

----------------------------------------
Tandara is running

Frontend:
$FRONTEND_URL

Backend:
$BACKEND_URL

Swagger:
$BACKEND_URL/docs

Logs: .logs/backend-dev.log, .logs/frontend-dev.log
Press Ctrl+C to stop only children started by this launcher.
Pre-existing healthy services are reused and left running.
----------------------------------------
EOF

while true; do
  if [[ "$backend_started" == true ]] && ! kill -0 "$backend_pid" 2>/dev/null; then fail 'Backend child exited; see .logs/backend-dev.log.'; fi
  if [[ "$frontend_started" == true ]] && ! kill -0 "$frontend_pid" 2>/dev/null; then fail 'Frontend child exited; see .logs/frontend-dev.log.'; fi
  sleep 1
done