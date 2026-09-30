#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -f .env.example ]] || fail 'Missing root .env.example.'
[[ -f backend/requirements.txt ]] || fail 'Missing backend/requirements.txt.'
[[ -f package-lock.json ]] || fail 'Missing package-lock.json; npm ci cannot be used safely.'

PYTHON="${TANDARA_PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  for candidate in .venv/bin/python backend/.venv/bin/python; do
    if [[ -x "$candidate" ]]; then PYTHON="$candidate"; break; fi
  done
fi

if [[ -z "$PYTHON" ]]; then
  command -v python3 >/dev/null 2>&1 || fail 'Python 3.12+ is required. Install Python, then run ./setup.sh again.'
  version="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  [[ "$(printf '%s\n' 3.12 "$version" | sort -V | head -n1)" == 3.12 ]] || fail "Python 3.12+ required; found $version."
  python3 -m venv .venv || fail 'Could not create .venv.'
  PYTHON="$ROOT/.venv/bin/python"
fi
[[ -x "$PYTHON" ]] || fail "Python executable not found: $PYTHON"
version="$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
[[ "$(printf '%s\n' 3.12 "$version" | sort -V | head -n1)" == 3.12 ]] || fail "Python 3.12+ required; found $version."
command -v node >/dev/null 2>&1 || fail 'Node.js is required. Install Node.js LTS, then rerun ./setup.sh.'
command -v npm >/dev/null 2>&1 || fail 'npm is required. Install Node.js LTS, then rerun ./setup.sh.'

"$PYTHON" -m pip install -r backend/requirements.txt || fail 'Backend dependency installation failed.'
if [[ ! -f .env ]]; then
  secret="$("$PYTHON" -c 'import secrets; print(secrets.token_urlsafe(48))')"
  sed "s|^SECRET_KEY=.*|SECRET_KEY=$secret|" .env.example > .env
  printf 'Created .env from .env.example with a local random secret.\n'
else
  printf 'Preserved existing .env.\n'
fi

[[ -f backend/ml_models/yunet_face_detection.onnx ]] || fail 'YuNet model missing: backend/ml_models/yunet_face_detection.onnx. Restore the provided model; setup will not download models.'
[[ -f backend/ml_models/face_recognition_sface.onnx ]] || fail 'SFace model missing: backend/ml_models/face_recognition_sface.onnx. Restore the provided model; setup will not download models.'
npm ci || fail 'Frontend dependency installation failed.'
printf '\nSetup complete. Start Tandara with ./start.sh\n'