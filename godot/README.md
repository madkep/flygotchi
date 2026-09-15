# Terrario Godot

Este prototipo es la ejecución nativa de referencia de la escena 3D. La experiencia principal se muestra en el navegador mediante WebGL; Godot permite validar el mismo concepto con colisiones 3D y el puente `terrarium.gd` hacia Go.

## Ejecutar

1. Instala Godot 4.7.2 estable (la versión verificada: `4.7.2.stable.official.ed1daf0bf`).
2. Desde la raíz del repositorio, inicia el cerebro: `go run ./cmd/flygotchi-web`.
3. Abre `godot/project.godot` en Godot y ejecuta la escena.

La app web es el cliente principal y el inspector de actividad. Esta escena nativa es opcional para pruebas; el puente hace polling de sentidos a 4 Hz y conserva la última salida motora válida cuando el servidor no está disponible.

## Alcance

La mosca tiene cuerpo, alas y seis patas procedurales; las animaciones se sincronizan con vuelo y contacto. La alimentación real, olor espacial, visión, viento, IK de patas, cámara de observación y assets artísticos quedan como iteraciones de las siguientes fases. El controlador corporal escrito organiza estados físicos; no se debe describir como conducta biológica emergente del conectoma.
