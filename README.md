# FlyGotchi

Una mascota virtual web cuyo comportamiento se expresa a través de una interfaz cerebral intercambiable. Esta primera versión es un vertical slice jugable y visual: Mica responde a néctar, juego, descanso y exploración; sus necesidades modulan señales en vez de disparar acciones rígidas.

## Ejecutar

```bash
go run ./cmd/flygotchi-web
```

Abre [http://localhost:8080](http://localhost:8080). Para otro puerto: `go run ./cmd/flygotchi-web -port 3000`.

La primera ejecución funciona con el cerebro sintético incluido. Si el pack local de FlyWire está disponible, el servidor lo carga automáticamente; si no, mantiene el cerebro sintético.

## Arquitectura inicial

El navegador contiene el mundo, interfaz y animación. El servidor Go sirve el juego localmente y será el punto natural para exponer un futuro `Brain API`.

```text
Web game → Brain API → Brain Pack → simulación neuronal
```

Los datasets como FlyWire no se incluyen ni se acoplan al juego: serán adaptadores/brain packs independientes conforme al plan del proyecto.

## Cerebro conectado

El juego ya usa un `SyntheticBrain` real en Go. Al interactuar, el navegador llama a `POST /api/brain/step` con una acción (`food`, `play`, `rest` o `explore`). Go traduce esa acción a señales sensoriales, combina las necesidades internas y devuelve las salidas motoras (`eat`, `rest`, `explore`, `social`).

`GET /api/state` entrega el estado actual y `data/mica-state.json` conserva la memoria y las necesidades locales. Esta frontera está definida por `internal/brain.Brain`: un brain pack o adaptador FlyWire futuro solo tendrá que implementar esa interfaz.

## Descargar el brain pack FlyWire FAFB v783 (opcional)

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
