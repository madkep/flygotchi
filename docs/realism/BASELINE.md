# Baseline reproducible

Fecha de esta entrega: 2026-09-15. El repositorio se ejecuta con Go, Node y Godot 4.7.2 disponibles. La escena 3D fue validada en modo editor/headless con `godot --headless --path godot --editor --quit` y `godot --headless --path godot --quit-after 180`.

## Checks automatizados

- `go test ./...` — correcto.
- `go vet ./...` — correcto.
- `node tools/brain_view_test.cjs` — correcto.
- `node --check web/app.js` — correcto.

## Perfil pendiente

Todavía no se registró un p50/p95 de frames porque requiere abrir el navegador en el equipo objetivo. Registrar 60 segundos a 1080p con el inspector cerrado, normal y ligero. Anotar navegador, hardware, pack cargado, FPS, p95 de frame, memoria y bytes por segundo. La escena Godot requiere el mismo registro con el profiler de Godot.

El valor verificable de esta entrega es la separación de trabajo: 800 neuronas y 36.423 conexiones permanecen en el brain pack local cuando está instalado; la vista normal selecciona como máximo 160 nodos y 180 enlaces, y la vista ligera 80/80.

## Benchmark del backend

En este equipo, `go run ./cmd/brain-benchmark` midió el microcircuito local (20 pasos de 50 ms) en p50 **2,458 ms** y p95 **3,874 ms** por paso. Es una medida del backend, no una garantía de FPS de Godot; el perfil gráfico debe hacerse por separado.
