# API de simulación (v1)

La sesión de mundo pertenece al proceso Go. Godot envía eventos sensoriales y recibe un snapshot; ninguna llamada de render avanza el cerebro dos veces.

`POST /api/v1/senses`

```json
{"action":"food|idle|play|rest|explore", "food_contact":false, "food_smell":0.0, "food_smell_left":0.0, "food_smell_right":0.0, "vision_left":0.0, "vision_right":0.0, "touch":0.0, "danger_smell":0.0, "safety":0.7, "novelty":0.1, "temperature":0.5, "water_contact":0.0, "reward":0.0, "sequence":12}
```

`sequence` es monotónico por cliente. Un valor repetido o menor devuelve el último snapshot sin aplicar otro paso. Los valores sensoriales se recortan a `[0,1]`; NaN e infinitos se convierten en cero. `food_contact` solo puede ser verdadero cuando el volumen de contacto del cuerpo intersecta la región de néctar.

`GET /api/v1/state` devuelve la mascota y la última salida motora. `GET /api/v1/telemetry` devuelve `sim_time` y el identificador del brain pack.

`GET /api/v1/brain/topology` entrega la topología estática del pack. El cliente debe solicitarla una vez por identificador de brain pack y reutilizarla; los snapshots de estado y sentidos no la repiten.

El endpoint publica la medición y el scheduler Go la integra a 20 Hz. La respuesta confirma el snapshot más reciente; no implica que una petición HTTP equivalga a un tick neuronal. El estado se guarda periódicamente mediante escritura temporal y renombrado atómico.

Los endpoints `/api/state` y `/api/brain/step` se mantienen como adaptadores de compatibilidad para la demo web.
