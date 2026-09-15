# Verificación de la primera entrega

Comandos:

```bash
go test ./...
node tools/brain_view_test.cjs
node --check web/app.js
```

La prueba Go comprueba que buscar comida sin contacto no reduce hambre, que el contacto sí la reduce y que una secuencia duplicada no avanza el estado. La prueba JavaScript comprueba el límite visual de 160 nodos/180 enlaces, extremos válidos, selección estable y conservación de la topología original.

Para perfilar la ejecución web, abrir DevTools → Performance y registrar 60 segundos con el mapa cerrado y abierto. Anotar resolución, navegador, pack cargado, FPS y p95 de frame. Para el prototipo Godot, usar el Profiler y registrar la misma información antes de añadir partículas, postprocesado o modelos externos.

## Estado por fase

- Fase 0: baseline, pruebas automatizadas y benchmark reproducible.
- Fase 1: proyecto Godot 4 procedural, terrario, colisiones y puente HTTP.
- Fase 2: scheduler neuronal fijo a 20 Hz, secuencias idempotentes y telemetría de `sim_time`.
- Fase 3: olor escalar básico, contacto de néctar validado y sentidos acotados en `[0,1]`.
- Fase 4: estados de vuelo, aterrizaje y reposo en el cuerpo procedural y movimiento con colisión.
- Fase 5: alas, patas, sombra y transición vuelo/reposo animadas sin assets externos.
- Fase 6: presets visuales, muestreo estable y benchmark del backend.
- Fase 7: guardado periódico atómico, documentación de ejecución y licencias existentes.

Pendientes para una versión de producción: viento y visión con raycasts calibrados, IK de patas sobre superficies inclinadas, topología estática separada de muestras de actividad, perfil p50/p95 visible en el hardware objetivo, arte/sonido final y validación científica de un conectoma completo. El prototipo deja interfaces y puntos de extensión para cada uno.
