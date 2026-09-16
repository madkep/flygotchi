#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! "$PYTHON_BIN" -c 'import flybrain' >/dev/null 2>&1; then
  echo "Instala fly.ai primero: $PYTHON_BIN -m pip install git+https://github.com/alextitonis/fly.ai.git"
  exit 1
fi
if ! "$PYTHON_BIN" -m flybrain info >/dev/null 2>&1; then
  "$PYTHON_BIN" -m flybrain download
fi
"$PYTHON_BIN" tools/flybrain_service.py > /tmp/flygotchi-flybrain.log 2>&1 &
PY_PID=$!
cleanup() { kill "$PY_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
for _ in {1..60}; do
  curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1 && break
  sleep 0.2
done
FLYGOTCHI_FLYBRAIN_URL=http://127.0.0.1:8090 go run ./cmd/flygotchi-web -port 8080
