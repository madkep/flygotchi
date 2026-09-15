let state = { hunger: 38, energy: 73, bond: 61, stress: 14, activity: 'Conectando cerebro…', sound: false };
let stepPending = false;

const setText = (id, value) => document.getElementById(id).textContent = value;
function render() {
  for (const key of ['hunger', 'energy', 'bond']) {
    setText(`${key}Value`, Math.round(state[key]));
    document.getElementById(`${key}Bar`).style.width = `${state[key]}%`;
  }
  const mood = state.energy < 25 ? 'Somnolienta, busca una hoja' : state.hunger > 70 ? 'Atenta al olor del néctar' : state.bond > 80 ? 'Confiada y juguetona' : 'Curiosa y alerta';
  setText('moodText', mood);
  setText('activity', state.activity);
}

function applySnapshot(snapshot) {
  state = { ...state, ...snapshot.pet };
  const labels = { eat: 'alimentarse', rest: 'reposar', explore: 'explorar', socialize: 'socializar' };
  setText('signalName', labels[snapshot.motor?.dominant_signal] || 'en espera');
  setText('signalConfidence', (snapshot.motor?.confidence || 0).toFixed(2));
  const memory = snapshot.pet.memory?.[0] || 'Mica está creando un nuevo recuerdo.';
  setText('speech', memory);
  setText('memoryLog', memory);
  render();
}

async function act(action = 'idle') {
  if (stepPending) return;
  stepPending = true;
  try {
    const response = await fetch('/api/brain/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) throw new Error('Brain API unavailable');
    applySnapshot(await response.json());
  } catch {
    setText('speech', 'No puedo escuchar el Brain API todavía.');
    setText('memoryLog', 'Esperando conexión local con el cerebro.');
  } finally {
    stepPending = false;
  }
  if (action === 'idle') return;
  document.querySelector(`.action.${action}`).animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }],
    { duration: 340 },
  );
}

document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => act(button.dataset.action)));
document.addEventListener('keydown', event => {
  const action = ({ '1': 'food', '2': 'play', '3': 'rest', '4': 'explore' })[event.key];
  if (action) act(action);
});
document.getElementById('fly').addEventListener('click', () => act('play'));
document.getElementById('soundToggle').addEventListener('click', event => {
  state.sound = !state.sound;
  event.currentTarget.textContent = state.sound ? '◉' : '◌';
});
setInterval(() => act('idle'), 5000);
setInterval(() => {
  const now = new Date();
  setText('clock', now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
}, 1000);

const canvas = document.getElementById('neuralCanvas');
const ctx = canvas.getContext('2d');
const nodes = Array.from({ length: 34 }, (_, i) => ({ x: 26 + (i % 7) * 51 + Math.random() * 13, y: 25 + Math.floor(i / 7) * 45 + Math.random() * 18, phase: Math.random() * Math.PI * 2 }));
function drawNetwork(time) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 92 || Math.random() > .14) continue;
    const glow = (Math.sin(time / 680 + a.phase) + 1) / 2;
    ctx.strokeStyle = `rgba(121, 240, 209, ${.035 + glow * .20})`;
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  nodes.forEach((node, i) => {
    const pulse = (Math.sin(time / 560 + node.phase) + 1) / 2;
    const hue = i % 3 === 0 ? '255,170,222' : '112,245,204';
    ctx.beginPath(); ctx.fillStyle = `rgba(${hue}, ${.32 + pulse * .68})`;
    ctx.shadowBlur = 12 + pulse * 12; ctx.shadowColor = `rgb(${hue})`;
    ctx.arc(node.x, node.y, 2 + pulse * 2.8, 0, Math.PI * 2); ctx.fill();
  });
  ctx.shadowBlur = 0;
  requestAnimationFrame(drawNetwork);
}
requestAnimationFrame(drawNetwork);
render();
fetch('/api/state').then(response => response.json()).then(applySnapshot).catch(render);
