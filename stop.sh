#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT/.runtime"

stop_recorded() {
  local name="$1" marker="$2" pid_file="$RUNTIME_DIR/$1.pid" pid cmd pgid
  [[ -f "$pid_file" ]] || return 0
  pid="$(<"$pid_file")"
  [[ "$pid" =~ ^[0-9]+$ ]] || { printf 'Ignoring invalid %s PID record.\n' "$name"; return 0; }
  [[ -r "/proc/$pid/cmdline" ]] || { rm -f "$pid_file"; return 0; }
  cmd="$(tr '\0' ' ' <"/proc/$pid/cmdline")"
  if [[ "$cmd" != *"$ROOT"* || "$cmd" != *"$marker"* ]]; then
    printf 'Not stopping %s PID %s: command does not match this Tandara project.\n' "$name" "$pid"
    return 0
  fi
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  if [[ "$pgid" == "$pid" ]]; then kill -TERM -- "-$pid" 2>/dev/null || true; else kill -TERM "$pid" 2>/dev/null || true; fi
  rm -f "$pid_file"
  printf 'Stopped recorded Tandara %s process group %s.\n' "$name" "$pid"
}

stop_recorded frontend 'npm run dev'
stop_recorded backend 'uvicorn app.main:app'