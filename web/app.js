let state = { hunger: 38, energy: 73, bond: 61, stress: 14, activity: 'Conectando cerebro…', sound: false };
let stepPending = false;
let queuedAction = null;
let motor = { eat: 0, rest: 0, explore: 0, social: 0, dominant_signal: 'explore', confidence: 0 };
let brainVisual = null;
const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const setText = (id, value) => { document.getElementById(id).textContent = value; };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);

function render() {
  for (const key of ['hunger', 'energy', 'bond']) {
    setText(`${key}Value`, Math.round(state[key]));
    document.getElementById(`${key}Bar`).style.width = `${clamp(state[key], 0, 100)}%`;
  }
  const mood = state.energy < 25 ? 'Somnolienta, busca una hoja' : state.hunger > 70 ? 'Atenta al olor del néctar' : state.bond > 80 ? 'Confiada y juguetona' : 'Curiosa y alerta';
  setText('moodText', mood);
  const held = flyMotion.started && performance.now() < flyMotion.holdUntil;
  const visibleActivity = flyMotion.displayActivity || (held ? ({ feed:'Saboreando néctar', rest:'Descansando bajo una hoja', social:'Jugando contigo', explore:'Trazando una nueva ruta' })[flyMotion.signal] : state.activity);
  setText('activity', visibleActivity);
  fly.setAttribute('aria-label', `Mica: ${visibleActivity}. Interacción directa no recomendada.`);
}

function applySnapshot(snapshot, origin = 'load') {
  state = { ...state, ...snapshot.pet };
  motor = snapshot.motor || motor;
  brainVisual = snapshot.brain_visual || null;
  setText('brainPack', snapshot.brain_pack || 'sin brain pack');
  const labels = { eat: 'alimentarse', rest: 'reposar', explore: 'explorar', socialize: 'socializar' };
  setText('signalName', labels[motor.dominant_signal] || 'en espera');
  setText('signalConfidence', (motor.confidence || 0).toFixed(2));
  for (const key of ['eat', 'rest', 'explore', 'social']) {
    document.getElementById(`motor${key[0].toUpperCase()}${key.slice(1)}`).style.width = `${clamp((motor[key] || 0) * 100, 0, 100)}%`;
  }
  const memory = snapshot.pet.memory?.[0] || 'Mica está creando un nuevo recuerdo.';
  setText('speech', memory);
  setText('memoryLog', memory);
  const count = brainVisual ? `${brainVisual.nodes.length.toLocaleString('es-CL')} neuronas · ${brainVisual.total_connections.toLocaleString('es-CL')} enlaces · ${brainVisual.edges.length} visibles` : 'Brain pack sintético · cuatro salidas del juego';
  setText('brainCount', count);
  document.getElementById('neuralCanvas').setAttribute('aria-label', brainVisual ? 'Proyección de neuronas y conexiones dirigidas FlyWire FAFB v783' : 'Diagrama del cerebro sintético');
  setFlyBehavior(motor.dominant_signal || 'explore', origin);
  render();
}

async function act(action = 'idle') {
  if (stepPending) {
    if (action !== 'idle') queuedAction = action;
    return;
  }
  stepPending = true;
  try {
    const response = await fetch('/api/brain/step', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) throw new Error('Brain API unavailable');
    applySnapshot(await response.json(), action);
  } catch {
    setText('speech', 'No puedo escuchar el Brain API todavía.');
    setText('memoryLog', 'Esperando conexión local con el cerebro.');
  } finally {
    stepPending = false;
    if (queuedAction) {
      const next = queuedAction;
      queuedAction = null;
      queueMicrotask(() => act(next));
    }
  }
  if (action === 'idle') return;
  document.querySelector(`.action.${action}`).animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }],
    { duration: 340 },
  );
}

// A deliberately small, continuous body simulation. The connectome selects drives;
// this layer turns those drives plus local stimuli into movement, not a fixed script.
const fly = document.getElementById('fly');
const shadow = document.getElementById('flyShadow');
const terrarium = document.querySelector('.terrarium');
const gardenWhisper = document.getElementById('gardenWhisper');
const flyMotion = { signal: 'explore', mode: 'flight', behavior: 'flight', started: false, x: .48, y: .30, displayActivity: '' };
const behaviorLabels = {
  flight: 'Volando entre las plantas', hover: 'Sobrevolando una flor', perch: 'Observando desde una hoja', walk: 'Caminando sobre una hoja',
  run: 'Corriendo hacia un refugio', groom: 'Limpiando sus patas y ojos', feed: 'Saboreando néctar',
  rest: 'Descansando bajo una hoja', alert: 'Alerta a un movimiento cercano', escape: 'Escapando hacia la sombra',
  social: 'Acercándose con curiosidad', hurt: 'Se sobresaltó por el contacto',
};
const garden = {
  nectar: [{ x: .25, y: .63 }, { x: .69, y: .64 }],
  leaves: [{ x: .13, y: .61 }, { x: .80, y: .64 }],
  refuge: [{ x: .81, y: .64 }, { x: .13, y: .60 }],
  air: [{ x: .18, y: .28 }, { x: .52, y: .24 }, { x: .74, y: .35 }, { x: .42, y: .42 }],
  water: [{ x: .52, y: .64 }],
};
const mapElements = {
  nectar: [...document.querySelectorAll('[data-feature="nectar"]')],
  refuge: [...document.querySelectorAll('[data-feature="refuge"]')],
  water: document.getElementById('pond'),
  plants: [document.getElementById('plantA'), document.getElementById('plantB')],
};
const simulation = {
  x: .48, y: .34, vx: 0, vy: 0, heading: -3, state: 'flight', intent: 'explore',
  target: null, targetKind: 'air', lastFrame: 0, nextDecision: 0, lastLabel: '',
  arousal: .16, fatigue: .18, curiosity: .62, habituation: 0, startle: 0,
  pointer: null, cursorPressure: 0, cursorNearUntil: 0, lastCursorStartle: 0,
  painUntil: 0, painVisualUntil: 0, foodCueUntil: 0, playCueUntil: 0, refugeCueUntil: 0, exploreCueUntil: 0,
  stimulusIntent: '', stimulusUntil: 0, placeMessage: '', placeMessageUntil: 0,
};
const pick = list => list[Math.floor(Math.random() * list.length)];
const weightedPick = entries => {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  let threshold = Math.random() * Math.max(total, .001);
  for (const entry of entries) { threshold -= Math.max(0, entry.weight); if (threshold <= 0) return entry.value; }
  return entries[entries.length - 1].value;
};
function syncFlyClasses() {
  const aware = simulation.cursorPressure > .12 && performance.now() < simulation.cursorNearUntil ? ' fly--aware' : '';
  fly.className = `fly fly--${flyMotion.signal} fly--${flyMotion.mode} fly--${flyMotion.behavior}${aware}`;
}
function setBehavior(behavior, activityLabel = '') {
  const airborne = ['flight', 'hover', 'escape', 'social', 'alert', 'hurt'].includes(behavior);
  flyMotion.behavior = behavior;
  flyMotion.mode = airborne ? 'flight' : 'landed';
  flyMotion.displayActivity = activityLabel || behaviorLabels[behavior] || '';
  syncFlyClasses();
  gardenWhisper.textContent = performance.now() < simulation.placeMessageUntil ? simulation.placeMessage : (flyMotion.displayActivity || 'El jardín está en calma.');
  if (simulation.lastLabel !== flyMotion.displayActivity) { simulation.lastLabel = flyMotion.displayActivity; render(); }
}
function setFlyBehavior(signal, origin) {
  const next = ({ eat: 'feed', rest: 'rest', explore: 'explore', socialize: 'social' })[signal] || 'explore';
  flyMotion.signal = next;
  const now = performance.now();
  if (origin === 'food') simulation.foodCueUntil = now + 12000;
  if (origin === 'play') simulation.playCueUntil = now + 9000;
  if (origin === 'rest') simulation.refugeCueUntil = now + 13000;
  if (origin === 'explore') simulation.exploreCueUntil = now + 7500;
  if (origin !== 'idle' && origin !== 'load') {
    simulation.stimulusIntent = ({ food: 'feed', play: 'social', rest: 'rest', explore: 'explore' })[origin] || '';
    simulation.stimulusUntil = now + ({ food: 8500, play: 6800, rest: 10800, explore: 5200 })[origin];
  }
  if (origin !== 'idle' && origin !== 'load') simulation.nextDecision = now;
  if (!flyMotion.started) { flyMotion.started = true; placeFly(); requestAnimationFrame(simulateFly); }
}
function placeFly() {
  const width = terrarium.clientWidth, height = terrarium.clientHeight;
  flyMotion.x = simulation.x; flyMotion.y = simulation.y;
  fly.dataset.intent = simulation.intent;
  fly.dataset.simulationState = simulation.state;
  fly.style.setProperty('--fly-x', `${simulation.x * width}px`);
  fly.style.setProperty('--fly-y', `${simulation.y * height}px`);
  fly.style.setProperty('--fly-angle', `${simulation.heading}deg`);
  fly.style.setProperty('--flight-time', `${prefersReducedMotion.matches ? 0 : '.11'}s`);
  fly.style.setProperty('--beat-time', `${clamp(123 - state.energy * .35 - simulation.arousal * 25, 64, 145)}ms`);
  const airborne = flyMotion.mode === 'flight';
  shadow.style.setProperty('--shadow-x', `${simulation.x * width + 28}px`);
  shadow.style.setProperty('--shadow-y', `${(airborne ? .81 : simulation.y + .18) * height}px`);
  shadow.style.setProperty('--shadow-scale', airborne ? '.55' : '1');
  shadow.style.setProperty('--shadow-alpha', airborne ? '.23' : '.55');
}
function setTarget(target, kind) { simulation.target = target; simulation.targetKind = kind; }
function chooseTarget(kind) {
  if (kind === 'feed') return pick(garden.nectar);
  if (kind === 'rest') return pick(garden.refuge);
  if (kind === 'social') return { x: .50 + randomBetween(-.08, .08), y: .43 + randomBetween(-.06, .06) };
  if (kind === 'water') return pick(garden.water);
  return Math.random() < .52 ? pick(garden.air) : { x: randomBetween(.10, .78), y: randomBetween(.18, .52) };
}
function chooseDecision(now) {
  const danger = Math.max(simulation.startle, now < simulation.painUntil ? .98 : 0);
  const hunger = clamp(state.hunger / 100, 0, 1);
  const tired = clamp((100 - state.energy) / 100, 0, 1);
  const cues = {
    feed: now < simulation.foodCueUntil ? .9 : 0,
    rest: now < simulation.refugeCueUntil ? .85 : 0,
    social: now < simulation.playCueUntil ? .7 : 0,
    explore: now < simulation.exploreCueUntil ? .65 : 0,
  };
  const previousIntent = simulation.intent;
  const options = [
    { value: 'feed', weight: .08 + (motor.eat || 0) * 1.25 + hunger * .72 + cues.feed },
    { value: 'rest', weight: .08 + (motor.rest || 0) * 1.2 + tired * .7 + cues.rest },
    { value: 'social', weight: .05 + (motor.social || 0) * 1.1 + state.bond / 100 * .2 + cues.social },
    { value: 'explore', weight: .11 + (motor.explore || 0) * 1.15 + simulation.curiosity * .4 + cues.explore },
  ];
  const strongest = options.reduce((best, entry) => entry.weight > best.weight ? entry : best);
  const current = options.find(entry => entry.value === previousIntent);
  const currentDistance = simulation.target ? Math.hypot(simulation.target.x - simulation.x, simulation.target.y - simulation.y) : Infinity;
  let intent;
  if (danger > .26) intent = 'escape';
  else if (now < simulation.stimulusUntil) intent = simulation.stimulusIntent;
  else if (current && simulation.target && currentDistance > .09 && current.weight >= strongest.weight * .62 && Math.random() < .78) intent = previousIntent;
  else intent = weightedPick(options);
  const shouldRetarget = intent !== previousIntent || !simulation.target || currentDistance < .04 || Math.random() < .16;
  simulation.intent = intent;
  if (intent === 'escape') {
    const from = simulation.pointer || { x: .5, y: .5 };
    setTarget({ x: clamp(simulation.x + Math.sign(simulation.x - from.x || .5) * randomBetween(.25, .48), .08, .80), y: randomBetween(.16, .34) }, 'air');
    setBehavior('escape');
  } else {
    if (shouldRetarget) setTarget(chooseTarget(intent), intent);
    const travelDistance = Math.hypot(simulation.target.x - simulation.x, simulation.target.y - simulation.y);
    if (travelDistance > .065) simulation.state = intent === 'social' ? 'social' : 'flight';
    const grounded = ['feed', 'rest', 'walk', 'run', 'groom', 'perch'].includes(simulation.state);
    const behavior = grounded && intent === 'feed' ? 'feed' : grounded && intent === 'rest' ? 'rest' : intent === 'social' ? 'social' : 'flight';
    setBehavior(behavior);
  }
  simulation.nextDecision = now + randomBetween(650, 1900) * (simulation.intent === 'rest' ? 1.8 : 1);
}
function simulateFly(now) {
  requestAnimationFrame(simulateFly);
  if (!flyMotion.started || document.hidden) return;
  const dt = Math.min(.045, Math.max(.008, (now - (simulation.lastFrame || now)) / 1000));
  simulation.lastFrame = now;
  simulation.startle = Math.max(0, simulation.startle - dt * (.22 + simulation.habituation * .12));
  simulation.cursorPressure = Math.max(0, simulation.cursorPressure - dt * 1.45);
  simulation.habituation = clamp(simulation.habituation + dt * .018, 0, .72);
  simulation.fatigue = clamp(simulation.fatigue + dt * (flyMotion.mode === 'flight' ? .006 : -.011), 0, 1);
  simulation.curiosity = clamp(simulation.curiosity + dt * .012 - (simulation.intent === 'rest' ? dt * .025 : 0), .12, .95);
  if (now >= simulation.nextDecision || !simulation.target) chooseDecision(now);
  const target = simulation.target;
  const dx = target.x - simulation.x, dy = target.y - simulation.y;
  const distance = Math.hypot(dx, dy) || .001;
  const direction = { x: dx / distance, y: dy / distance };
  const isEscaping = simulation.intent === 'escape' && (simulation.startle > .05 || now < simulation.painUntil);
  const nearTarget = distance < (simulation.targetKind === 'air' ? .04 : .028);
  if (nearTarget && !isEscaping) {
    let dwell;
    if (simulation.targetKind === 'feed') { simulation.state = Math.random() < .22 ? 'walk' : 'feed'; setBehavior(simulation.state, simulation.state === 'walk' ? 'Caminando sobre los pétalos' : ''); dwell = randomBetween(1500, 3200); }
    else if (simulation.targetKind === 'rest') { simulation.state = Math.random() < .18 ? 'groom' : 'rest'; setBehavior(simulation.state); dwell = randomBetween(3100, 6800); }
    else if (simulation.intent === 'explore' && Math.random() < .48) { simulation.state = Math.random() < .22 ? 'run' : 'walk'; setBehavior(simulation.state); dwell = randomBetween(800, 1900); }
    else { simulation.state = Math.random() < .4 ? 'hover' : 'perch'; setBehavior(simulation.state); dwell = randomBetween(650, 1500); }
    simulation.nextDecision = now + dwell;
  } else if (isEscaping || simulation.state === 'flight' || simulation.state === 'hover' || simulation.state === 'social') {
    simulation.state = isEscaping ? 'escape' : (simulation.intent === 'social' ? 'social' : 'flight');
    setBehavior(simulation.state);
  }
  const airborne = ['flight', 'hover', 'escape', 'social'].includes(simulation.state);
  const baseSpeed = isEscaping ? .56 : airborne ? .13 + state.energy / 100 * .12 : simulation.state === 'run' ? .12 : .035;
  const turn = airborne ? 3.8 : 8.5;
  const wander = airborne ? .045 : .014;
  const curl = Math.sin(now / 310 + simulation.x * 19) * wander;
  const desiredX = direction.x * baseSpeed - direction.y * curl;
  const desiredY = direction.y * baseSpeed + direction.x * curl;
  simulation.vx += (desiredX - simulation.vx) * Math.min(1, dt * turn);
  simulation.vy += (desiredY - simulation.vy) * Math.min(1, dt * turn);
  if (simulation.state === 'groom' || simulation.state === 'rest' || simulation.state === 'feed') { simulation.vx *= .76; simulation.vy *= .76; }
  simulation.x = clamp(simulation.x + simulation.vx * dt, .05, .82);
  simulation.y = clamp(simulation.y + simulation.vy * dt, .14, .70);
  if (Math.abs(simulation.vx) + Math.abs(simulation.vy) > .01) simulation.heading = clamp(Math.atan2(simulation.vy, simulation.vx) * 180 / Math.PI * .33, -17, 17);
  if (now < simulation.painVisualUntil) setBehavior('hurt');
  placeFly();
  updateGardenResponse();
}
function nearestDistance(points) { return Math.min(...points.map(point => Math.hypot(simulation.x - point.x, simulation.y - point.y))); }
function updateGardenResponse() {
  const nearNectar = nearestDistance(garden.nectar) < .115 || simulation.targetKind === 'feed';
  const nearRefuge = nearestDistance(garden.refuge) < .13 || simulation.targetKind === 'rest';
  const nearWater = nearestDistance(garden.water) < .16 || simulation.targetKind === 'water';
  mapElements.nectar.forEach(element => element.classList.toggle('is-sensed', nearNectar));
  mapElements.refuge.forEach(element => element.classList.toggle('is-sensed', nearRefuge));
  mapElements.water.classList.toggle('is-active', nearWater && flyMotion.mode === 'flight');
  mapElements.plants.forEach((element, index) => element.classList.toggle('is-brushed', Math.hypot(simulation.x - garden.leaves[index].x, simulation.y - garden.leaves[index].y) < .13));
  terrarium.classList.toggle('is-near-pond', nearWater);
  terrarium.classList.toggle('is-disturbed', simulation.startle > .28);
}
function stimulatePlace(feature, element) {
  const now = performance.now();
  const stimulus = { nectar: 'feed', refuge: 'rest', water: 'explore' }[feature];
  if (!stimulus) return;
  const gardenRect = terrarium.getBoundingClientRect();
  const placeRect = element.getBoundingClientRect();
  const target = {
    x: clamp((placeRect.left + placeRect.width / 2 - gardenRect.left) / gardenRect.width, .07, .80),
    y: clamp((placeRect.top + placeRect.height / 2 - gardenRect.top) / gardenRect.height, .16, .69),
  };
  simulation.stimulusIntent = stimulus;
  simulation.stimulusUntil = now + (feature === 'refuge' ? 9000 : 6500);
  simulation.intent = stimulus;
  simulation.target = target;
  simulation.targetKind = feature === 'nectar' ? 'feed' : feature === 'refuge' ? 'rest' : 'water';
  simulation.nextDecision = now;
  simulation.placeMessage = ({ nectar: 'El perfume dulce se volvió más intenso.', refuge: 'La hoja ofrece una sombra fresca.', water: 'El reflejo del agua cambia con el aire.' })[feature];
  simulation.placeMessageUntil = now + 2600;
  gardenWhisper.textContent = simulation.placeMessage;
}
window.addEventListener('resize', placeFly);

function startleFly(reason = 'Detectó una sombra cercana', strength = .62) {
  if (!flyMotion.started || prefersReducedMotion.matches) return;
  simulation.startle = clamp(Math.max(simulation.startle, strength * (1 - simulation.habituation * .55)), 0, 1);
  simulation.arousal = clamp(simulation.arousal + strength * .7, 0, 1);
  simulation.nextDecision = performance.now();
  gardenWhisper.textContent = reason;
}
function hurtFly() {
  const now = performance.now();
  simulation.pointer = { x: simulation.x, y: simulation.y, time: now };
  simulation.cursorPressure = 1;
  simulation.cursorNearUntil = now + 700;
  simulation.startle = 1;
  simulation.arousal = 1;
  simulation.habituation = 0;
  simulation.painVisualUntil = now + 480;
  simulation.painUntil = now + 3600;
  simulation.nextDecision = now;
  setBehavior('hurt');
  gardenWhisper.textContent = 'El contacto fue brusco; Mica se aleja.';
}
terrarium.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' || !flyMotion.started) return;
  const bounds = terrarium.getBoundingClientRect();
  const pointer = { x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1), y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1), time: performance.now() };
  const previous = simulation.pointer;
  simulation.pointer = pointer;
  const distance = Math.hypot(pointer.x - simulation.x, pointer.y - simulation.y);
  const velocity = previous ? Math.hypot(pointer.x - previous.x, pointer.y - previous.y) / Math.max(.01, (pointer.time - previous.time) / 1000) : 0;
  const pressure = clamp(1 - distance / .18, 0, 1);
  if (pressure > 0) {
    simulation.cursorPressure = Math.max(simulation.cursorPressure, pressure);
    simulation.cursorNearUntil = pointer.time + 220;
  }
  if (pressure > .42) {
    simulation.startle = Math.max(simulation.startle, pressure * .48);
    simulation.nextDecision = pointer.time;
  }
  if ((pressure > .68 || (distance < .12 && velocity > .12)) && pointer.time - simulation.lastCursorStartle > 720) {
    simulation.lastCursorStartle = pointer.time;
    startleFly('Percibió el cursor muy cerca', clamp(.34 + pressure * .32 + velocity * .10, .34, .9));
  }
});
terrarium.addEventListener('pointerleave', () => { simulation.pointer = null; });
terrarium.addEventListener('click', event => {
  if (event.target.closest('#fly') || event.target.closest('[data-feature]')) return;
  startleFly('El jardín se movió de repente', .88);
});
document.querySelectorAll('[data-feature]').forEach(feature => feature.addEventListener('click', event => {
  event.stopPropagation();
  stimulatePlace(feature.dataset.feature, feature);
}));

document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => act(button.dataset.action)));
document.addEventListener('keydown', event => {
  const action = ({ '1': 'food', '2': 'play', '3': 'rest', '4': 'explore' })[event.key];
  if (action) act(action);
});
fly.addEventListener('pointerdown', event => { if (event.isPrimary) hurtFly(); });
fly.addEventListener('click', event => event.stopPropagation());
document.getElementById('soundToggle').addEventListener('click', event => {
  state.sound = !state.sound; event.currentTarget.textContent = state.sound ? '◉' : '◌';
});
setInterval(() => act('idle'), 5000);
setInterval(() => setText('clock', new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })), 1000);

const canvas = document.getElementById('neuralCanvas');
const ctx = canvas.getContext('2d');
const nodeInfo = document.getElementById('brainNodeInfo');
let hoveredNode = -1;
let lastBrainFrame = 0;
function projectNodes(width, height) {
  if (!brainVisual?.nodes?.length) return [];
  const positions = brainVisual.nodes.map(node => node.position || [0, 0, 0]);
  const xs = positions.map(pos => pos[0]), ys = positions.map(pos => pos[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return brainVisual.nodes.map((node, index) => ({
    x: 24 + (positions[index][0] - minX) / Math.max(1, maxX - minX) * (width - 48),
    y: 53 + (positions[index][1] - minY) / Math.max(1, maxY - minY) * (height - 100),
    value: clamp(node.activity || 0, 0, 1), className: node.super_class, cellClass: node.cell_class, id: node.id, side: node.side,
  }));
}
function palette(className) {
  if (['optic', 'visual_projection', 'visual_centrifugal'].includes(className)) return [112, 219, 237];
  if (['descending', 'motor'].includes(className)) return [255, 181, 137];
  return [216, 166, 255];
}
function drawBrain(time) {
  requestAnimationFrame(drawBrain);
  if (document.hidden || time - lastBrainFrame < (prefersReducedMotion.matches ? 200 : 32)) return;
  lastBrainFrame = time;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const points = projectNodes(width, height);
  if (!points.length) { drawSynthetic(width, height, time); return; }
  // The soft lobes frame a projection; they are illustrative, not 3D meshes.
  for (const [cx, color] of [[width*.28, '97,189,210'], [width*.72, '184,127,210']]) {
    const glow = ctx.createRadialGradient(cx, height*.48, 10, cx, height*.48, width*.31);
    glow.addColorStop(0, `rgba(${color},.10)`); glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
  }
  ctx.strokeStyle = '#a5d6e222'; ctx.setLineDash([2, 6]); ctx.beginPath(); ctx.moveTo(width/2, 40); ctx.lineTo(width/2, height-30); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'screen';
  for (const edge of brainVisual.edges) {
    const from = points[edge.from], to = points[edge.to];
    if (!from || !to) continue;
    const activation = (from.value + to.value) / 2;
    const color = edge.neurotransmitter === 'GABA' ? '207,151,246' : edge.neurotransmitter === 'GLUT' ? '255,188,135' : '116,226,216';
    ctx.strokeStyle = `rgba(${color},${.018 + activation*.16})`;
    ctx.lineWidth = .5 + Math.min(edge.weight, 4) * .11;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  }
  if (!prefersReducedMotion.matches) {
    for (let i = 0; i < brainVisual.edges.length; i += 37) {
      const edge = brainVisual.edges[i], from = points[edge.from], to = points[edge.to];
      if (!from || !to || from.value < .09) continue;
      const progress = (time / (1400 + i % 600) + i*.137) % 1;
      ctx.fillStyle = `rgba(172,248,230,${.13 + from.value*.48})`;
      ctx.beginPath(); ctx.arc(from.x + (to.x-from.x)*progress, from.y + (to.y-from.y)*progress, 1.2, 0, Math.PI*2); ctx.fill();
    }
  }
  points.forEach((point, index) => {
    const color = palette(point.className);
    const breath = prefersReducedMotion.matches ? 0 : (Math.sin(time/880 + index*.67)+1)*.13;
    const radius = .7 + point.value*2.7 + breath;
    ctx.fillStyle = `rgba(${color.join(',')},${.40 + point.value*.58})`;
    if (point.value > .18 || index === hoveredNode) { ctx.shadowBlur = 7 + point.value*13; ctx.shadowColor = `rgb(${color.join(',')})`; }
    ctx.beginPath(); ctx.arc(point.x, point.y, index === hoveredNode ? radius+2 : radius, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#b4c7dc'; ctx.font = '10px DM Mono, monospace';
  ctx.fillText('L', 13, height-25); ctx.fillText('R', width-21, height-25);
}
function drawSynthetic(width, height, time) {
  const names = ['SENSORES', 'INTEGRACIÓN', 'MOTOR', 'MICA'];
  const points = names.map((name, i) => ({ x: width*(.16+i*.22), y: height*(.48 + Math.sin(i*1.9)*.13), name }));
  ctx.strokeStyle = '#82dbc57b'; ctx.lineWidth = 2; ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
  points.forEach((p, i) => { const glow = .5 + Math.sin(time/700+i)*.2; ctx.fillStyle = `rgba(124,237,216,${glow})`; ctx.beginPath(); ctx.arc(p.x,p.y,9,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#b5c7dd'; ctx.font='8px DM Mono, monospace'; ctx.fillText(p.name,p.x-21,p.y+24); });
}
canvas.addEventListener('pointermove', event => {
  if (!brainVisual?.nodes?.length) return;
  const rect = canvas.getBoundingClientRect(), points = projectNodes(rect.width, rect.height);
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  let nearest = -1, distance = 11;
  points.forEach((p, i) => { const d = Math.hypot(p.x-x,p.y-y); if (d < distance) { nearest=i; distance=d; } });
  hoveredNode = nearest;
  nodeInfo.textContent = nearest < 0 ? 'Pasa el cursor por una neurona' : `#${points[nearest].id} · ${points[nearest].cellClass || points[nearest].className || 'sin clase'} · ${(points[nearest].value).toFixed(2)}`;
});
canvas.addEventListener('pointerleave', () => { hoveredNode = -1; nodeInfo.textContent = 'Pasa el cursor por una neurona'; });
requestAnimationFrame(drawBrain);
render();
fetch('/api/state').then(response => response.json()).then(snapshot => applySnapshot(snapshot, 'load')).catch(render);
