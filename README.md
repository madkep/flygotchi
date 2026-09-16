# FlyGotchi

Una mascota virtual web cuyo comportamiento se expresa a través de una interfaz cerebral intercambiable. Esta primera versión es un vertical slice jugable y visual: Mica responde a néctar, juego, descanso y exploración; sus necesidades modulan señales en vez de disparar acciones rígidas.

## Ejecutar

```bash
go run ./cmd/flygotchi-web
```

Abre [http://localhost:8080](http://localhost:8080). Para otro puerto: `go run ./cmd/flygotchi-web -port 3000`.

El terrario principal se renderiza como una escena 2D plana dentro del navegador usando WebGL (`web/terrarium-3d.js`). Inicia Go y abre [http://localhost:8080](http://localhost:8080). El proyecto [godot/project.godot](godot/project.godot) conserva una ejecución nativa 3D de referencia.

Para iniciar el terrario web y el cerebro con un solo comando (macOS/Linux): `./tools/run_terrarium.sh`. Usa `./tools/run_terrarium.sh --godot` solo para abrir la ejecución nativa de Godot. El scheduler Go mantiene el cerebro a 20 Hz aunque el inspector esté cerrado; `go run ./cmd/brain-benchmark` muestra p50/p95 del backend disponible.

Para ejecutar el cerebro completo de [fly.ai](https://github.com/alextitonis/fly.ai) como proceso persistente: instala la librería (`python3 -m pip install git+https://github.com/alextitonis/fly.ai.git`), descarga sus datos (`python3 -m flybrain download`) y ejecuta `./tools/run_flybrain.sh`. El adaptador conserva toda la simulación MaleCNS en Python y entrega sus salidas descendentes al mundo Go por HTTP local.

La primera ejecución funciona con el cerebro sintético incluido. Si el pack local de MaleCNS v1.0 está disponible, el servidor lo carga automáticamente; si no, mantiene el cerebro sintético.

## Arquitectura inicial

### Vista cerebral ligera

El mapa dibuja como máximo 160 nodos y 180 enlaces a 10 FPS, con una selección estable por clase y lado. Conserva todas las neuronas y conexiones del pack en el servidor (actualmente 800 neuronas en el microcircuito). Las posiciones se reutilizan entre fotogramas y el mapa deja de dibujarse cuando está fuera de pantalla. El botón «Pausar mapa» afecta solo a la visualización. Para comprobar el muestreo: `node tools/brain_view_test.cjs`.

El navegador contiene el terrario 2D WebGL, la interfaz y la animación. `web/terrarium-3d.js` usa una cámara ortográfica y capas planas aceleradas por GPU; `web/app.js` conserva la simulación corporal y las interacciones; el servidor Go sirve el juego y mantiene la autoridad cerebral.

```text
Web game → Brain API → Brain Pack → simulación neuronal
```

Los datasets como FlyWire no se incluyen ni se acoplan al juego: serán adaptadores/brain packs independientes conforme al plan del proyecto.

## Cerebro conectado

El juego ya usa un `SyntheticBrain` real en Go. Al interactuar, el navegador llama a `POST /api/brain/step` con una acción (`food`, `play`, `rest` o `explore`). Go traduce esa acción a señales sensoriales, combina las necesidades internas y devuelve las salidas motoras (`eat`, `rest`, `explore`, `social`).

`GET /api/state` entrega el estado actual y `data/mica-state.json` conserva la memoria y las necesidades locales. Esta frontera está definida por `internal/brain.Brain`: un brain pack o adaptador FlyWire futuro solo tendrá que implementar esa interfaz.

El cliente 3D usa `POST /api/v1/senses` con una secuencia monotónica. Buscar comida envía olor; el hambre solo baja cuando el volumen corporal intersecta el néctar y se informa `food_contact: true`. `GET /api/v1/telemetry` expone el tiempo simulado sin depender de la frecuencia de render.

La interfaz solicita la topología una vez desde `/api/v1/brain/topology`; los snapshots posteriores solo llevan estado y motores. Esto conserva las 800 neuronas internas sin retransmitir la red completa en cada actualización.

## Descargar el brain pack MaleCNS v1.0 (opcional)

El servidor usa por defecto `male-cns:v1.0`, el conectoma masculino completo publicado por Janelia/FlyEM. El pack local conserva 800 neuronas de alta conectividad y conexiones dirigidas con umbral de al menos 5 sinapsis. Los datos fuente se descargan desde [Janelia](https://male-cns.janelia.org/download/) y no se incluyen en Git. Tras obtener `neurons.csv.gz` y `edges.csv.gz` en `data/raw/male-cns_v1.0/`, genera el pack con:

```bash
python3 tools/build_malecns_pack.py
```

El proyecto puede cargar un microcircuito local derivado de tres productos públicos de FlyWire FAFB v783: conectividad, clasificación y coordenadas representativas de las neuronas. El pack conserva 800 neuronas de alta conectividad y sus conexiones dirigidas con etiquetas de neurotransmisor, para integrar actividad sobre topología real a un coste razonable. El panel cerebral proyecta esas posiciones y muestra una selección de 900 enlaces fuertes. Son puntos representativos, no mallas 3D ni trazas completas de las neuronas. No se suben los archivos de origen ni el pack generado al repositorio.

Antes de descargarlo, lee [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md), acepta los términos de FlyWire y ejecuta:

```bash
FLYWIRE_TERMS_ACCEPTED=yes ./tools/download_flywire_v783.sh
```

El script descarga las tres tablas a `data/flywire-v783-source/` y construye este pack local:

```text
data/brain-packs/flywire-v783-microcircuit/manifest.json
```

Luego inicia el juego normalmente:

```bash
go run ./cmd/flygotchi-web
```

Para reconstruir solo el pack, después de haber descargado el archivo de origen:

```bash
go run ./tools/build_flywire_pack.go
```

Todo `data/` está en `.gitignore`, por lo que ni el cerebro ni el estado local de Mica se incluirán en commits o en GitHub.

La actividad sobre FlyWire usa neuronas simplificadas con voltaje, fuga, umbral de disparo, periodo refractario y transmisión por las conexiones dirigidas. La dinámica toma como referencia el modelo de [Shiu et al. (Nature, 2024)](https://www.nature.com/articles/s41586-024-07763-9), pero corre solo en un subconjunto de 800 neuronas y usa una ganancia adaptada para ese recorte. Las entradas sensoriales se sitúan según clases publicadas como ALPN/ALLN (olfato), neuronas visuales y ascendentes; las salidas de alimento, reposo, exploración y juego siguen siendo una adaptación para FlyGotchi. Una tabla de conectividad no contiene por sí sola una simulación validada de cuerpo, sentidos y conducta; el juego aún no predice la respuesta de una mosca real.
