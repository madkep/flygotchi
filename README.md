# FlyGotchi

Una mascota virtual web cuyo comportamiento se expresa a través de una interfaz cerebral intercambiable. Esta primera versión es un vertical slice jugable y visual: Mica responde a néctar, juego, descanso y exploración; sus necesidades modulan señales en vez de disparar acciones rígidas.

## Ejecutar

```bash
go run ./cmd/flygotchi-web
```

Abre [http://localhost:8080](http://localhost:8080). Para otro puerto: `go run ./cmd/flygotchi-web -port 3000`.

## Arquitectura inicial

El navegador contiene el mundo, interfaz y animación. El servidor Go sirve el juego localmente y será el punto natural para exponer un futuro `Brain API`.

```text
Web game → Brain API → Brain Pack → simulación neuronal
```

Los datasets como FlyWire no se incluyen ni se acoplan al juego: serán adaptadores/brain packs independientes conforme al plan del proyecto.

## Cerebro conectado

El juego ya usa un `SyntheticBrain` real en Go. Al interactuar, el navegador llama a `POST /api/brain/step` con una acción (`food`, `play`, `rest` o `explore`). Go traduce esa acción a señales sensoriales, combina las necesidades internas y devuelve las salidas motoras (`eat`, `rest`, `explore`, `social`).

`GET /api/state` entrega el estado actual y `data/mica-state.json` conserva la memoria y las necesidades locales. Esta frontera está definida por `internal/brain.Brain`: un brain pack o adaptador FlyWire futuro solo tendrá que implementar esa interfaz.
