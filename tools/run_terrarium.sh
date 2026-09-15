#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
MODE="${1:-browser}"

if curl -fsS http://127.0.0.1:8080/api/v1/state >/dev/null 2>&1; then
  BRAIN_PID=""
else
  go run ./cmd/flygotchi-web -port 8080 &
  BRAIN_PID=$!
fi
cleanup() {
  if [[ -n "$BRAIN_PID" ]]; then kill "$BRAIN_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:8080/api/v1/state >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

if [[ "$MODE" == "--godot" ]]; then
  exec godot --path "$ROOT_DIR/godot"
fi

if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:8080/"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:8080/" >/dev/null 2>&1 || true
else
  echo "Abre http://127.0.0.1:8080/ en tu navegador."
fi

# Keep an owned Go process alive. If another server was already running, the
# launcher can return after opening the browser without killing that process.
if [[ -n "$BRAIN_PID" ]]; then
  wait "$BRAIN_PID"
fi
