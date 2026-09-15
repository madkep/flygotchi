# FlyGotchi: terrario 3D, cuerpo animado y cerebro desacoplado

## Encargo para el modelo ejecutor

Implementa este plan por fases en el repositorio FlyGotchi. El objetivo del usuario es que Mica se sienta como una mosca animada que habita e interactúa con un entorno coherente, con una presentación de videojuego y un mapa neuronal que no ralentice el equipo. Puedes descargar herramientas y assets necesarios. Conserva las modificaciones existentes; inspecciona el estado del repositorio antes de editar. No publiques ni subas datasets como parte de este encargo.

Este documento es un plan de trabajo propuesto, no una afirmación de funcionalidades ya implementadas. La petición actual fue preparar el plan para otro modelo. Al recibir el encargo de aplicarlo, implementa, prueba y entrega una escena ejecutable; no te limites a devolver otra propuesta.

**Versión de motor fijada para esta implementación: Godot 4.7.2** (`4.7.2.stable.official.ed1daf0bf`).

## 1. Resultado esperado

Una aplicación web local con un terrario 2D plano renderizado con WebGL: suelo, agua, plantas, flores y luciérnagas. Mica puede volar, aterrizar, caminar, alimentarse, limpiarse y reposar. El jugador modifica el entorno; los sentidos detectan esos cambios y el controlador corporal expresa las señales del cerebro. Godot 4.7.2 queda como ejecución nativa 3D de referencia y herramienta de validación; el navegador es la experiencia principal.

Primero completar esta escena vertical. El jardín grande, muchos animales, clima complejo y la simulación del conectoma completo quedan como ampliaciones posteriores.

### Prioridades

1. Contacto e interacción coherentes entre cuerpo, entorno y necesidades.
2. Movimiento y animación legibles y convincentes.
3. Fluidez en el equipo del usuario, medida con el profiler.
4. Integración del cerebro existente y observabilidad honesta.
5. Escalado neuronal independiente de la calidad gráfica.

## 2. Estado del código comprobado

Repositorio de referencia: `/Users/fcespedes/Madkep/flygotchi`.

| Archivo | Responsabilidad actual |
| --- | --- |
| `cmd/flygotchi-web/main.go` | Servidor local en 127.0.0.1:8080; GET `/api/state`, POST `/api/brain/step` |
| `internal/brain/brain.go` | Contrato Brain, sentidos, necesidades, motores y cerebro sintético |
| `internal/brain/connectome.go` | Circuito FlyWire reducido con dinámica neuronal simplificada |
| `internal/game/game.go` | Necesidades, traducción de botones a sentidos y persistencia |
| `web/app.js` | Simulación espacial, interacción, consulta al backend y dibujo cerebral |
| `web/terrarium-3d.js` | Render WebGL ligero del terrario y cuerpo animado en el navegador |
| `web/fly.css`, `web/map.css` | Animación y representación web actuales |
| `web/brain-view.js` | Muestreo exclusivamente visual |
| `tools/brain_view_test.cjs` | Pruebas de límites y conservación de índices del muestreo |
| `tools/build_flywire_pack.go` | Construcción del microcircuito local |

La versión web funciona con Go. No asumir que Rust o Godot ya están integrados. Reutilizar Go y el contrato cerebral; reescribir el backend en Rust no es requisito de esta fase.

El microcircuito actual contiene 800 neuronas. El mapa web ahora muestra como máximo 160 nodos y 180 enlaces a 10 FPS, cachea la proyección y permite pausar el dibujo. Todas las neuronas del pack permanecen en el backend. Estos cambios pueden estar sin commit: preservarlos.

El backend todavía envía la topología y actividad completa del microcircuito en cada snapshot. La optimización visual actual no resuelve ese coste de transferencia a escalas mayores.

### Limitaciones que deben corregirse

- El botón `food` genera `FoodContact` sin verificar la posición del cuerpo.
- Los sentidos del backend proceden principalmente de acciones de interfaz, no del mundo físico.
- El movimiento web mezcla salidas cerebrales, necesidades, aleatoriedad y decisiones impuestas por botones.
- El navegador consulta pasos cada cinco segundos; el motor limita cada llamada a 80–130 ticks de 1 ms. No equivale a cinco segundos de simulación neuronal continua.
- Las salidas del conectoma modulan un adaptador sintético de cuatro conductas. No son un decodificador motor biológico validado.
- Los recuerdos actuales son textos predeterminados disparados por acciones; no demuestran aprendizaje neuronal.

## 3. Arquitectura elegida

```text
Godot: mundo + cuerpo + contactos
    → campos sensoriales locales
    → puente asíncrono con Go
    → Brain Pack + simulación neuronal
    → impulsos motores
    → controlador corporal + animación en Godot

Go: telemetría muestreada → inspector opcional
```

Godot es autoridad sobre posición, velocidad, superficies y contactos. Go es autoridad sobre dinámica neuronal, necesidades y estado persistente de la mascota. Los eventos de contacto tienen identificador y secuencia para impedir que una repetición de red alimente dos veces. No mantener dos versiones independientes del hambre o la energía.

El hilo de render nunca debe esperar una respuesta HTTP. El cliente conserva la última salida válida y aplica una transición gradual a un estado seguro al perder conexión. Los sentidos no deben acumularse en una cola sin límite: para medidas continuas usar el último valor disponible; para eventos discretos usar una cola acotada con confirmación.

Mantener la web como cliente principal y de diagnóstico. Godot es una ejecución nativa secundaria; abrir un inspector adicional no debe avanzar la simulación dos veces.

## 4. Fases de implementación

### Fase 0 — Baseline reproducible

- Revisar instrucciones locales, `git status` y versiones instaladas.
- Ejecutar `go test ./...`, `node tools/brain_view_test.cjs` y `node --check web/app.js`.
- Medir tiempo de paso neuronal, tamaño de snapshot y coste de render cerebral con el pack real disponible.
- Registrar hardware, versión del motor, resolución y escenario. No inventar cifras si no hay profiler disponible.
- Crear `docs/realism/BASELINE.md` con resultados y limitaciones.

Aceptación: ejecución actual reproducible, cambios del usuario preservados y mediciones iniciales documentadas.

### Fase 1 — Escena Godot ejecutable

- Crear proyecto en `godot/`, fijar Godot 4.7.2 y documentar la instalación exacta.
- Escena con suelo, hoja con colisión y fruta con región comestible.
- Cámara de observación cercana, órbita/zoom suaves y límites que eviten atravesar objetos.
- Empezar con renderizador Compatibility y geometría sencilla; medir antes de introducir efectos costosos.
- Mica puede comenzar como modelo procedural de segmentos, seis patas, antenas y dos alas. El prototipo debe ejecutarse sin depender de conseguir un asset externo.
- Usar unidades coherentes: definir y documentar escala entre unidades del motor y escala representada. Ajustar colisiones y cámara a esa escala; evitar geometría microscópica numéricamente inestable.
- Añadir puente asíncrono al servicio Go y estado visible de conexión.

Aceptación: escena navegable, mosca visible, colisiones presentes y conexión al cerebro existente sin bloquear frames.

### Fase 2 — Relojes y contrato de simulación

- Introducir API versionada, por ejemplo `/api/v1/session`, `/api/v1/senses`, `/api/v1/state` y `/api/v1/telemetry`.
- Definir esquemas en `docs/realism/API.md`: versión, sesión, secuencia, unidades, rangos y política de errores.
- Desacoplar reloj neuronal del render y del número de peticiones. Usar scheduler fijo en Go con propiedad exclusiva sobre el cerebro y publicación de snapshots.
- Integrar en subpasos neuronales explícitos. Eliminar el mínimo de 80 ms por petición; el tiempo solicitado y el integrado deben coincidir según la política documentada.
- Objetivos iniciales a perfilar: física Godot a 60 Hz, actualización sensorial a 20 Hz, telemetría a 5–10 Hz. Estos son frecuencias diferentes, no requisitos para ejecutar HTTP por cada tick neuronal.
- Limitar recuperación de retrasos. Reportar `sim_time`, `wall_time`, `real_time_factor` y retraso; nunca compensar bloqueando indefinidamente ni reducir neuronas silenciosamente.
- Inyectar reloj y semilla para pruebas reproducibles. Aclarar qué se pausa al minimizar: render, mundo o sesión completa. No enviar segundos acumulados como un salto al volver.
- Preservar endpoints antiguos como adaptadores durante la migración, evitando que avancen una segunda simulación.

Aceptación: bajar FPS, pausar el inspector o abrir otro observador no altera los ticks neuronales ejecutados para el mismo tiempo simulado.

### Fase 3 — El entorno produce los sentidos

- Sustituir botones que ordenan conductas por acciones sobre objetos: colocar alimento, moverlo, crear sombra o perturbar una superficie.
- Olor: campo escalar de concentración que disminuye con distancia; añadir dirección de viento simple. Muestrear en dos puntos junto a las antenas para producir diferencia izquierda/derecha.
- Visión aproximada: obstáculos y cambios de luminancia mediante rayos o sondas de bajo coste. No implementar ojos compuestos de miles de cámaras.
- Contacto: puntos o volúmenes corporales detectan superficie y región alimentaria. Solo producir `food_contact` cuando el aparato bucal alcance una región accesible.
- Refugio: sombra y apoyo físico estable. La intención de descansar no recupera energía durante vuelo.
- Saciedad: ingestión depende de contacto, señal motora de alimentación, duración y alimento restante. Retirar la fruta interrumpe la ingestión.
- Validar números finitos y rangos en Go; limitar tamaño de solicitudes y frecuencia. Rechazar sesiones o secuencias inválidas.

Aceptación: colocar fruta lejos genera olor sin reducir hambre; llegar y comer sí la reduce; retirar la fruta corta la alimentación; un botón por sí solo no produce contacto.

### Fase 4 — Cuerpo y locomoción

- Controlador con estados corporales: vuelo, aproximación, aterrizaje, marcha, alimentación, limpieza, reposo y despegue/escape.
- Las transiciones respetan geometría, velocidad y contactos. Los estados organizan el cuerpo; no deben presentarse como conducta emergente del conectoma si los decide un controlador escrito a mano.
- Vuelo con aceleración limitada, arrastre simplificado, velocidad máxima, orientación hacia el movimiento y cambios breves de rumbo reproducibles con semilla.
- Aproximación con frenado; aterrizar exige una superficie alcanzable, velocidad adecuada y orientación de apoyo.
- Marcha alineada a la normal de la superficie. Implementar primero suelo y hojas de pendiente moderada; paredes y techo quedan para una ampliación.
- Resolver colisiones y bordes; impedir atravesar hojas, flotar en reposo o teletransportarse hacia comida.
- El entorno solo se conoce a través de sensores disponibles. Si se usa navegación global para el prototipo, marcarla como asistencia de locomoción y documentar su alcance.

Aceptación: secuencia vuelo → aproximación → aterrizaje → marcha → alimentación → despegue funciona con cambios de posición del alimento y sin atravesar objetos.

### Fase 5 — Animación y presencia

- Animaciones o rig procedural para caminar, volar, comer, limpiar patas/ojos, descansar y despegar.
- Mezclar animaciones según velocidad y estado corporal; no reproducir una secuencia fija independiente del mundo.
- Patas con apoyo mediante raycasts/IK sencillo, evitando deslizamiento evidente. Detener marcha cuando la velocidad es cero.
- Representar alas rápidas con un efecto visual económico; no intentar renderizar cada batido físico.
- Orientación corporal, sombra de contacto y cambios de escala aparente deben seguir posición y altura reales.
- Añadir audio opcional de vuelo ligado a distancia, velocidad y estado. Silencio cuando corresponde; control de volumen funcional.
- Interfaz discreta: nombre y necesidades resumidas, controles contextuales, inspector cerebral plegable. Reducir paneles que compitan con el terrario.
- Añadir calidad baja y movimiento reducido sin modificar el motor neuronal.

Aceptación: las acciones se reconocen observando el cuerpo sin leer etiquetas; aterrizar detiene las alas, caminar mueve patas y comer requiere postura/contacto compatibles.

### Fase 6 — Telemetría y rendimiento

- Conservar todas las neuronas y conexiones del pack cargado en el backend, independientemente de la calidad visual.
- Separar topología estática, resumen global y muestras de actividad. Transferir la topología una vez por versión de pack.
- Muestreo estable por región/clase y lado. Identificadores estables y enlaces con extremos presentes; no recalcular la muestra por actividad en cada frame.
- Presets iniciales: ligero 80 nodos/80 enlaces; normal 160/180. Inspector cerrado: sin render ni suscripción a muestras; simulación activa.
- Mostrar por separado `neuronas simuladas`, `conexiones simuladas`, `nodos visibles` y `enlaces visibles`.
- No representar conexiones agregadas como conexiones anatómicas individuales. Si se agrupa por regiones, rotular explícitamente esa vista.
- Medir percentiles p50/p95 de render y pasos neuronales, memoria y bytes/segundo durante al menos 60 segundos de un escenario reproducible.
- Objetivo inicial en el equipo del usuario: 60 FPS a 1080p en calidad baja, p95 de frame cercano o inferior a 16,7 ms; inspector con coste incremental p95 menor de 2 ms. Son objetivos a comprobar, no resultados garantizados.
- Si no se alcanzan: reducir efectos, resolución, frecuencia visual y complejidad geométrica antes de cambiar la simulación. Reportar cualquier factor de tiempo real menor que 1.

Aceptación: registro antes/después y prueba que distintos presets visuales producen la misma trayectoria neuronal con idénticos sentidos y semilla.

### Fase 7 — Persistencia y entrega

- Guardado versionado de necesidades, posición corporal, mundo y semilla/estado aleatorio; documentar qué estado neuronal puede restaurarse exactamente.
- Separar memoria de experiencias de estado neuronal. No llamar aprendizaje a un texto agregado al pulsar un botón.
- No introducir plasticidad sin modelo, límites y pruebas propios. Puede quedar pendiente tras el vertical slice.
- Script o instrucciones concretas para arrancar Go y Godot, apagar ambos y usar otro puerto. Comprobar disponibilidad de servicios y evitar procesos duplicados.
- Exportación local para macOS cuando las herramientas lo permitan; mantener ejecución desde editor como alternativa documentada.
- Inventario de assets con URL de origen, autor, licencia y modificaciones. Respetar `THIRD_PARTY_LICENSES.md` y mantener datasets locales fuera de Git.
- Entregar `docs/realism/VERIFICATION.md`: pruebas, mediciones, capturas, pasos de ejecución, limitaciones y pendientes.

## 5. Estructura orientativa

```text
godot/
  project.godot
  scenes/terrarium.tscn
  scenes/fly.tscn
  scripts/world/
  scripts/fly/
  scripts/brain_bridge/
  scripts/ui/
  assets/
internal/brain/          # dinámica y muestreo de telemetría
internal/game/           # scheduler, necesidades, sesión y persistencia
docs/realism/
  API.md
  BASELINE.md
  VERIFICATION.md
  ASSETS.md
```

Adaptar nombres a convenciones existentes; no crear archivos vacíos para aparentar avance.

## 6. Pruebas mínimas obligatorias

| Prueba | Evidencia requerida |
| --- | --- |
| Alimentación distante | Sin contacto, hambre no disminuye por alimento |
| Ingestión con contacto | Consumo proporcional al tiempo y a recurso disponible |
| Contacto perdido | Retirar comida detiene ingestión en el siguiente paso aplicable |
| Petición duplicada | Repetir evento/sequence no duplica consumo |
| Reloj independiente | Mismo tiempo y sentidos → mismos pasos a 30/60/120 FPS |
| Vista independiente | Pausar/muestrear telemetría no cambia estado neuronal |
| Conexión perdida | Sin bloqueo, NaN, saltos ni colas sin límite; recuperación explícita |
| Geometría | Sin penetración sostenida ni reposo flotante en superficies de prueba |
| Guardado | Carga compatible y errores de archivo tratados sin perder estado silenciosamente |
| Rendimiento | Perfil de 60 s con y sin inspector, resolución/hardware documentados |

Usar tests Go para lógica, validación y tiempo simulado; Godot headless para carga y lógica comprobable; verificar animación, apoyos y cámara en ejecución visible. Un test headless aprobado no certifica calidad visual.

## 7. Escalado al conectoma completo: trabajo separado

El deseo de conservar todos los nodos internos debe cumplirse para cada pack cargado. No cambiar un pack de 800 neuronas por uno completo sin medir coste y revisar cobertura sensorial/motora.

Preparar un benchmark con escalas crecientes, almacenamiento disperso, asignaciones fuera del bucle y telemetría acotada. Medir tiempo de carga, memoria, coste por segundo simulado y factor de tiempo real. Registrar neuronas/conexiones originales, descartadas y simuladas. Si el equipo no alcanza tiempo real, ofrecer explícitamente ejecución más lenta o backend más potente; no ocultar recortes.

Una topología completa por sí sola no aporta un cuerpo, un sistema sensorial calibrado ni un decodificador motor validado. Esa integración científica necesita un proyecto de validación adicional. La primera entrega debe ser una mosca animada con interacción coherente y un backend neuronal observable.

## 8. Cierre que debe entregar el modelo ejecutor

1. Qué fases implementó y cuáles siguen pendientes.
2. Comando exacto para abrir la escena.
3. Pruebas y mediciones reales, con limitaciones explícitas.
4. Capturas o vídeo breve de alimentación y aterrizaje.
5. Número real de neuronas/conexiones simuladas frente a las visibles.
6. Distinción entre dinámica neuronal, controlador corporal diseñado y animaciones.

Referencia técnica de partida: https://docs.godotengine.org/en/stable/getting_started/first_3d_game/index.html . Consultar documentación oficial de la versión elegida durante la implementación.
