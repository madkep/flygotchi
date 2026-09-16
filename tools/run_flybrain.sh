#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
RUNTIME_DIR="$ROOT_DIR/data/flybrain-runtime"
PYTHON_BIN="${PYTHON_BIN:-$RUNTIME_DIR/bin/python}"
DATA_DIR="${FLY_DATA:-$ROOT_DIR/data/flybrain-data}"
PORT="${FLYGOTCHI_PORT:-8080}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  python3 -m venv "$RUNTIME_DIR"
  "$PYTHON_BIN" -m pip install --upgrade pip -q
  "$PYTHON_BIN" -m pip install git+https://github.com/alextitonis/fly.ai.git
fi
if ! FLY_DATA="$DATA_DIR" "$PYTHON_BIN" -c 'from flybrain import has_data; raise SystemExit(0 if has_data() else 1)'; then
  FLY_DATA="$DATA_DIR" "$PYTHON_BIN" -m flybrain download
fi
PY_PID=""
if ! curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
  FLY_DATA="$DATA_DIR" "$PYTHON_BIN" tools/flybrain_service.py > /tmp/flygotchi-flybrain.log 2>&1 &
  PY_PID=$!
fi
cleanup() { [[ -n "$PY_PID" ]] && kill "$PY_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
for _ in {1..60}; do
  curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1 && break
  sleep 0.2
done
if ! curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
  cat /tmp/flygotchi-flybrain.log >&2 2>/dev/null || true
  exit 1
fi
if curl -fsS "http://127.0.0.1:$PORT/api/v1/state" >/dev/null 2>&1; then
  echo "El puerto $PORT ya tiene un FlyGotchi. Detén esa instancia o usa FLYGOTCHI_PORT=8094." >&2
  exit 1
fi
FLYGOTCHI_FLYBRAIN_URL=http://127.0.0.1:8090 go run ./cmd/flygotchi-web -port "$PORT"
