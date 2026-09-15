# Movimiento neuronal experimental

El navegador mide visión bilateral de objetos visibles y espacio libre, olor local
y contacto. Publica las medidas a `/api/v1/senses` a un máximo de 10 Hz.
Los botones cambian objetos del entorno; no seleccionan una conducta.

El microcircuito FlyWire recibe esas medidas como corrientes sensoriales laterales.
`ConnectomeBrain.decodeMotor` lee exclusivamente las actividades neuronales:
produce `forward` (0–1), `turn` (-1–1, positivo horario) y `brake` (0–1).
El cuerpo integra estas órdenes y las colisiones impiden penetrar las paredes.
No hay elección de casillas, destinos ni trayectoria en el controlador del cuerpo.
El olor se difunde por las celdas libres; la visión se interrumpe en las paredes.

Una orden caduca tras 600 ms sin recibir una respuesta válida. Sin actividad
neuronal o sin campos motores compatibles, el cuerpo permanece quieto.
La posición inicial del laberinto y la colocación de objetos son cambios del mundo,
no movimientos decididos por el animal.

## Alcance científico

El mapa muestra las actividades del circuito. El decodificador de poblaciones
sensoriales, descendentes y ascendentes es diseñado, no una identificación de los
circuitos motores biológicos. Tampoco está entrenado para resolver laberintos.
Puede detenerse o no encontrar la comida. La fisiología y las animaciones siguen
siendo modelos simplificados. Los canales históricos eat/rest/explore/social
son lecturas agregadas; ya no seleccionan destinos del navegador.

## Verificación

- `go test ./...`: circuitos, entradas laterales y decodificador motor.
- `node tools/neural_body_test.cjs`: salida nula, caducidad, colisión y giro neuronal.
