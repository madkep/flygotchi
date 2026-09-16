let state = { hunger: 38, energy: 73, bond: 61, stress: 14, activity: 'Conectando cerebro…', sound: false };
let stepPending = false;
let motor = { eat: 0, rest: 0, explore: 0, social: 0, dominant_signal: 'explore', confidence: 0 };
let brainVisual = null;
let brainDisplay = { nodes: [], edges: [] };
let projectionCache = null;
let contactRequestAt = 0;
const bodyClientID = crypto.randomUUID();
let brainQuality = 'normal';
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
	if (typeof simulation !== 'undefined' && snapshot.body) {
		Object.assign(simulation, { x:snapshot.body.X, y:snapshot.body.Y, vx:snapshot.body.VX, vy:snapshot.body.VY, heading:snapshot.body.Heading, bodyAngle:snapshot.body.BodyAngle, altitude:snapshot.body.Altitude, verticalVelocity:snapshot.body.VerticalVelocity, grounded:snapshot.body.Grounded, support:snapshot.body.Support });
	}
	if (typeof simulation !== 'undefined' && Object.prototype.hasOwnProperty.call(snapshot,'body_owner')) simulation.isBodyOwner=snapshot.body_owner;
  if (Object.prototype.hasOwnProperty.call(snapshot, 'brain_visual')) {
    brainVisual = snapshot.brain_visual || null;
    brainDisplay = sampleBrainView(brainVisual, brainQuality === 'light' ? 80 : 160, brainQuality === 'light' ? 80 : 180);
    projectionCache = null;
  }
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
  const count = brainVisual ? `${brainVisual.nodes.length.toLocaleString('es-CL')} neuronas simuladas · ${brainVisual.total_connections.toLocaleString('es-CL')} conexiones internas · ${brainDisplay.nodes.length} nodos / ${brainDisplay.edges.length} enlaces visibles` : 'Brain pack sintético · cuatro salidas del juego';
  setText('brainCount', count);
  document.getElementById('neuralCanvas').setAttribute('aria-label', brainVisual ? 'Proyección de neuronas y conexiones dirigidas MaleCNS v1.0' : 'Diagrama del cerebro sintético');
  setFlyBehavior(motor.dominant_signal || 'explore', origin);
  render();
}

// Buttons alter the physical world; they never submit an action to the brain.
function act(action='idle') {
  if(action==='food') spawnFoodPoint();
  if(action==='rest') activateHomePoint();
  if(action==='maze') startMaze();
  if(action==='play') simulation.playLight={x:randomBetween(.15,.8),y:randomBetween(.2,.65),until:performance.now()+8000};
  if(action==='explore') {simulation.maze=null;simulation.playLight=null;}
  document.querySelector('[data-action="'+action+'"]')?.animate(
    [{transform:'translateY(0)'},{transform:'translateY(-4px)'},{transform:'translateY(0)'}],{duration:240});
}
// Epoch-based sequence avoids rejecting a fresh browser tab after the Go
// process has already handled events from an earlier tab.
window.flygotchiSequence = Date.now();

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
  home: { x: .84, y: .23 },
  air: [{ x: .18, y: .28 }, { x: .52, y: .24 }, { x: .74, y: .35 }, { x: .42, y: .42 }],
  water: [{ x: .52, y: .64 }],
};
function mazePoint(cell, maze) {
  return { x: .13 + (cell.x / Math.max(1, maze.cols - 1)) * .74, y: .28 + (cell.y / Math.max(1, maze.rows - 1)) * .38 };
}
function shuffled(values) { return values.slice().sort(() => Math.random() - .5); }
function generateMaze(cols = 15, rows = 9) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(1));
  const stack = [{ x: 1, y: 1 }]; grid[1][1] = 0;
  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = shuffled([{ x: 2, y: 0 }, { x: -2, y: 0 }, { x: 0, y: 2 }, { x: 0, y: -2 }]).filter(step => { const nx = current.x + step.x, ny = current.y + step.y; return nx > 0 && nx < cols - 1 && ny > 0 && ny < rows - 1 && grid[ny][nx] === 1; });
    if (!choices.length) { stack.pop(); continue; }
    const step = choices[0], nx = current.x + step.x, ny = current.y + step.y; grid[current.y + step.y / 2][current.x + step.x / 2] = 0; grid[ny][nx] = 0; stack.push({ x: nx, y: ny });
  }
  const open = []; for (let y = 1; y < rows - 1; y += 1) for (let x = 1; x < cols - 1; x += 1) if (!grid[y][x]) open.push({ x, y });
  // The maze only describes the world. No route is calculated here: Mica must
  // discover the destination from the local smell/vision signals at runtime.
  const junctions = open.filter(cell => cell.x % 2 === 1 && cell.y % 2 === 1);
  const start = pick(junctions.length ? junctions : open);
  const candidates = open.filter(cell => cell.x !== start.x || cell.y !== start.y);
  const goal = pick(candidates.length ? candidates : open);
  return { cols, rows, grid, start, goal, active: true, lastDirection: null, lastTurnAt: 0 };
}
function startMaze() {
  const maze = generateMaze();
  const start = mazePoint(maze.start, maze);
  simulation.maze = maze; simulation.foodAvailable = true; simulation.food = { point: mazePoint(maze.goal, maze), quantity: 1, sugar: .82, createdAt: performance.now(), kind: 'néctar' }; simulation.intent = 'maze';
  simulation.x = start.x; simulation.y = start.y; simulation.vx = 0; simulation.vy = 0;
  simulation.bodyAngle=0; simulation.motorAt=0; simulation.nextSenseAt=0;
  diffuseMaze(maze, 1200);
  const foodPoint = simulation.food.point;
  window.terrarium3D?.setEnvironment({ maze, mazeVisible: true, foodPoint, foodVisible: true, homeVisible: false }); setBehavior('flight', 'Siguiendo el olor de la comida');
}
function mazeCellAt(x, y, maze) {
  if (!maze) return 1;
  const cellX = Math.round((x - .13) / .74 * Math.max(1, maze.cols - 1));
  const cellY = Math.round((y - .28) / .38 * Math.max(1, maze.rows - 1));
  if (cellX < 0 || cellX >= maze.cols || cellY < 0 || cellY >= maze.rows) return 1;
  return maze.grid[cellY][cellX] ? 1 : 0;
}
// Odor is an environmental diffusion field. Walls have zero permeability.
function diffuseMaze(maze, iterations = 12) {
  maze.odor ||= Array.from({length: maze.rows}, () => Array(maze.cols).fill(0));
  for (let n = 0; n < iterations; n++) {
    const next = maze.odor.map(row => row.slice());
    for (let y = 1; y < maze.rows - 1; y++) for (let x = 1; x < maze.cols - 1; x++) {
      if (maze.grid[y][x]) continue;
      let flux = 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if (!maze.grid[y+dy][x+dx]) flux += maze.odor[y+dy][x+dx] - maze.odor[y][x];
      }
      next[y][x] = maze.odor[y][x] * .9999 + .2 * flux;
    }
    next[maze.goal.y][maze.goal.x] = maze.active ? 1 : 0;
    maze.odor = next;
  }
}
function sampleMazeOdor(maze,x,y) {
  if(mazeCellAt(x,y,maze)) return 0;
  const gx=(x-.13)/.74*(maze.cols-1), gy=(y-.28)/.38*(maze.rows-1);
  const ix=Math.floor(gx), iy=Math.floor(gy), fx=gx-ix, fy=gy-iy;
  let sum=0, weight=0;
  for(const [dx,dy,w] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]) {
    if(maze.grid[iy+dy]?.[ix+dx]===0) {sum+=(maze.odor[iy+dy][ix+dx]||0)*w;weight+=w;}
  }
  return weight ? sum/weight : 0;
}
function worldBlocked(x,y) {
  if(simulation.maze) return !!mazeCellAt(x,y,simulation.maze);
  return x<.06 || x>.9 || y<.12 || y>.78;
}
function bodyFits(x,y) {
  const radius=simulation.maze ? .009 : simulation.radius;
  return [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]].every(([dx,dy])=>!worldBlocked(x+dx,y+dy));
}
function updateEnvironment(now) {
  const env=simulation.environment, phase=(now-env.startedAt)/1000;
  env.windX=.026*Math.sin(phase*.13)+.012*Math.sin(phase*.037);
  env.windY=.022*Math.cos(phase*.11);
  env.humidity=clamp(.58+.18*Math.sin(phase*.035),0,1);
  env.temperature=clamp(.50+.14*Math.sin(phase*.021),0,1);
  env.daylight=clamp(.55+.42*Math.sin(phase*.018),.08,1);
}
function activeFood() { return simulation.foodAvailable && simulation.food?.quantity > .001 ? simulation.food : null; }
function refugeSmell(x,y) {
  if(!simulation.homeInvitationUntil || performance.now()>simulation.homeInvitationUntil || simulation.maze) return 0;
  // The refuge releases a stable plume. Wind bends it, but cannot carry the
  // only cue away before Mica has had a chance to sample its gradient.
  const age=Math.min(2,(performance.now()-simulation.homeInvitationStarted)/1000);
  const sourceX=garden.home.x+simulation.environment.windX*age*1.5;
  const sourceY=garden.home.y+simulation.environment.windY*age*1.5;
  return clamp(Math.exp(-Math.hypot(x-sourceX,y-sourceY)/.46),0,1);
}
function bodySmell(x,y) {
  if(simulation.maze) return sampleMazeOdor(simulation.maze,x,y);
  const food=activeFood(); if(!food) return 0;
  // Wind carries a plume downwind; antennae sample it separately.
  const age=Math.min(5,(performance.now()-food.createdAt)/1000);
  const plumeX=food.point.x+simulation.environment.windX*age*2.2;
  const plumeY=food.point.y+simulation.environment.windY*age*2.2;
  const direct=Math.exp(-Math.hypot(x-food.point.x,y-food.point.y)/.18);
  const carried=Math.exp(-Math.hypot(x-plumeX,y-plumeY)/.26)*.55;
  return clamp((direct+carried)*food.quantity,0,1);
}
function seeObject(point, heading) {
  if(!point) return {left:0,right:0};
  const dx=point.x-simulation.x,dy=point.y-simulation.y,d=Math.hypot(dx,dy);
  // Wide compound eyes, with less precision toward the edge of the field.
  if(d>.4 || (dx*heading.x+dy*heading.y)/Math.max(d,.0001)<.15) return {left:0,right:0};
  const steps=Math.ceil(d/.003);
  for(let i=1;i<=steps;i++) if(worldBlocked(simulation.x+dx*i/steps,simulation.y+dy*i/steps)) return {left:0,right:0};
  const side=(heading.x*dy-heading.y*dx)/Math.max(d,.0001), strength=1-d/.5;
  return {left:strength*clamp(1-side,0,1),right:strength*clamp(1+side,0,1)};
}
function measureSenses(now) {
  const angle=simulation.bodyAngle||0,h={x:Math.cos(angle),y:Math.sin(angle)};
  const range=simulation.maze ? .012 : .03;
  const antennaLeft={x:simulation.x+(h.x+h.y)*range,y:simulation.y+(h.y-h.x)*range};
  const antennaRight={x:simulation.x+(h.x-h.y)*range,y:simulation.y+(h.y+h.x)*range};
  const liveFood=activeFood();
  const food=simulation.maze ? (liveFood?.point||null) : (liveFood?.point||null);
  const visual=seeObject(food,h);
  const home=seeObject(simulation.homeVisible && !simulation.maze ? garden.home:null,h);
  const light=seeObject(simulation.playLight?.until>now ? simulation.playLight:null,h);
  // Rays describe the visible corridor opening; walls stop them.
  const ray=offset=>{
    const direction=angle+offset;
    for(let d=.004;d<=.1;d+=.004) if(worldBlocked(simulation.x+Math.cos(direction)*d,simulation.y+Math.sin(direction)*d)) return d/.1;
    return 1;
  };
  const clearLeft=ray(-.55),clearRight=ray(.55);
  const smell=bodySmell(simulation.x,simulation.y);
  const refuge=refugeSmell(simulation.x,simulation.y);
  const foodContact=!!food && Math.hypot(food.x-simulation.x,food.y-simulation.y)<(simulation.maze ? .016:.04);
  // The complete house base is a valid resting surface, not a single point
  // hidden in its centre. This matches the visible 3D footprint.
  const nearHome=simulation.homeVisible && !simulation.maze && Math.hypot(garden.home.x-simulation.x,garden.home.y-simulation.y)<.14;
  const pointer=simulation.pointer;
  const pressure=pointer ? clamp(1-Math.hypot(pointer.x-simulation.x,pointer.y-simulation.y)/.08,0,1):0;
  const water=!simulation.maze && Math.hypot(simulation.x-garden.water[0].x,simulation.y-garden.water[0].y)<.13 && simulation.altitude<.025;
  const visionStrength=visual.left+visual.right;
  const visionMotion=clamp(Math.abs(visionStrength-simulation.previousVision)*8,0,1);
  simulation.previousVision=visionStrength;
  const speed=Math.hypot(simulation.vx,simulation.vy);
  simulation.currentFoodContact=foodContact; simulation.currentTaste=foodContact&&liveFood ? liveFood.sugar : 0;
  // On a head-on collision both antennae touch the same surface. Real
  // antennae sample out of phase, giving the nervous system a small,
  // changing left/right difference from which it can choose a turn. This is
  // a contact measurement, not a destination or steering command.
  const antennaPhase=simulation.collided ? Math.sin(now*.013)*.28 : 0;
  return {action:'idle',food_contact:foodContact,
    food_smell:smell,food_smell_left:bodySmell(antennaLeft.x,antennaLeft.y),food_smell_right:bodySmell(antennaRight.x,antennaRight.y),
    refuge_smell:refuge,refuge_smell_left:refugeSmell(antennaLeft.x,antennaLeft.y),refuge_smell_right:refugeSmell(antennaRight.x,antennaRight.y),
    refuge_cue:simulation.homeInvitationUntil>now?1:0,refuge_contact:nearHome?1:0,
    vision_left:clamp(.15*clearLeft+visual.left*.8+home.left*(simulation.homeInvitationUntil>now?.9:.4)+light.left*.5,0,1),
    vision_right:clamp(.15*clearRight+visual.right*.8+home.right*(simulation.homeInvitationUntil>now?.9:.4)+light.right*.5,0,1),
    touch_left:clamp(1-clearLeft+pressure+antennaPhase,0,1),touch_right:clamp(1-clearRight+pressure-antennaPhase,0,1),
    touch:simulation.collided ? 1:pressure,safety:nearHome?1:(simulation.grounded?.32:.16),novelty:clamp(.06+visionMotion*.4,0,1),temperature:simulation.environment.temperature,
    water_contact:water?1:0,taste:simulation.currentTaste,humidity:simulation.environment.humidity,
    airflow:clamp(Math.hypot(simulation.environment.windX,simulation.environment.windY)*16,0,1),
    angular_speed:clamp(Math.abs(simulation.angularVelocity)/2,0,1),body_speed:clamp(speed/.18,0,1),ground_contact:simulation.grounded?1:0,vision_motion:visionMotion,
    reward:foodContact ? liveFood.sugar*.65:0,
    _foodVisible:visual.left+visual.right>0};
}
async function publishBodySenses(now) {
  if(stepPending || now<(simulation.nextSenseAt||0)) return;
  simulation.nextSenseAt=now+100;
  const frame=measureSenses(now);
  simulation.lastSenses=frame;
  const { _foodVisible,...senses }=frame;
  const previous=simulation.lastSmell??frame.food_smell;
  const label=_foodVisible?'Ve la comida delante':frame.food_smell>previous+.0001?'El olor está aumentando':frame.food_smell<previous-.0001?'El olor está disminuyendo':'Percibiendo el entorno';
  simulation.lastSmell=frame.food_smell;
  setText('mazeSenses',label+' · olor '+(frame.food_smell*100).toFixed(1)+'%');
  stepPending=true;
  try {
    const response=await fetch('/api/v1/senses',{method:'POST',headers:{'Content-Type':'application/json'},
      signal:AbortSignal.timeout(1500),body:JSON.stringify({...senses,sequence:++window.flygotchiSequence,client_id:bodyClientID,body:{X:simulation.x,Y:simulation.y,VX:simulation.vx,VY:simulation.vy,Heading:simulation.heading,BodyAngle:simulation.bodyAngle,Altitude:simulation.altitude,VerticalVelocity:simulation.verticalVelocity,Grounded:simulation.grounded,Support:simulation.support}})});
    if(!response.ok) throw new Error('Brain unavailable');
    applySnapshot(await response.json(),'idle');
    simulation.motorAt=performance.now();
  } catch {simulation.motorAt=0;}
  finally {stepPending=false;}
}
function integrateNeuralBody(dt,now) {
	if(!simulation.isBodyOwner) {
		setBehavior('rest','Observando la misma Mica desde otra pestaña');
		return;
	}
  simulation.environment ||= {windX:0,windY:0};
  simulation.altitude ||= 0; simulation.verticalVelocity ||= 0; simulation.angularVelocity ||= 0; simulation.bodyAngle ||= 0;
  simulation.vx ||= 0; simulation.vy ||= 0; simulation.grounded ??= true;
  simulation.telemetry ||= [];
  const fresh=simulation.motorAt && now-simulation.motorAt<600;
  const forward=fresh?clamp(Number(motor.forward)||0,0,1):0;
  const turn=fresh?clamp(Number(motor.turn)||0,-1,1):0;
  const brake=fresh?clamp(Number(motor.brake)||0,0,1):1;
  const lift=fresh?clamp(Number(motor.lift)||0,0,1):0;
  // A lost brain stream is a safety stop, not an inertial ghost command.
  if(!fresh) { simulation.vx=0; simulation.vy=0; simulation.angularVelocity=0; }
  // Angular acceleration, mass, drag and gravity make a command a physical
  // request rather than an instant position change.
  simulation.angularVelocity+=(turn*3.2-simulation.angularVelocity*4.4)*dt;
  simulation.bodyAngle=(simulation.bodyAngle||0)+simulation.angularVelocity*dt;
  const direction={x:Math.cos(simulation.bodyAngle),y:Math.sin(simulation.bodyAngle)};
  const maxAcceleration=simulation.maze ? .22 : .58;
  const acceleration=forward*(1-brake)*maxAcceleration;
  const drag=simulation.grounded?5.4:1.5;
  const windCoupling=simulation.grounded ? .08 : .52;
  simulation.vx+=(direction.x*acceleration+simulation.environment.windX*windCoupling-simulation.vx*drag)*dt;
  simulation.vy+=(direction.y*acceleration+simulation.environment.windY*windCoupling-simulation.vy*drag)*dt;
  const supportHeight=!simulation.maze && simulation.homeVisible && Math.hypot(simulation.x-garden.home.x,simulation.y-garden.home.y)<.14 ? .045 : 0;
  if(!simulation.maze) simulation.verticalVelocity+=(lift*1.25-.72-simulation.verticalVelocity*.9)*dt;
  else simulation.verticalVelocity=0;
  simulation.altitude+=simulation.verticalVelocity*dt;
  simulation.grounded=simulation.altitude<=supportHeight+.002;
  if(simulation.grounded) { simulation.altitude=supportHeight; simulation.verticalVelocity=Math.max(0,simulation.verticalVelocity); simulation.support=supportHeight?'refugio':'suelo'; }
  else simulation.support='aire';
  const x=simulation.x+simulation.vx*dt,y=simulation.y+simulation.vy*dt;
  simulation.collided=!bodyFits(x,y);
  if(simulation.collided) { simulation.vx*=0; simulation.vy*=0; } else { simulation.x=x;simulation.y=y; }
  simulation.heading=simulation.bodyAngle*180/Math.PI;
  // Food only disappears through sustained contact, taste and a neural eat drive.
  const food=typeof activeFood==='function' ? activeFood() : null;
  if(food && simulation.currentFoodContact && simulation.currentTaste>.2 && motor.eat>.2) {
    food.quantity=Math.max(0,food.quantity-motor.eat*dt*.16);
    if(food.quantity<=.001) { simulation.foodAvailable=false; if(simulation.maze) simulation.maze.active=false; }
  }
  const moving=Math.hypot(simulation.vx,simulation.vy)>.004;
  const mode=simulation.grounded?(moving?'walk':'rest'):'flight';
  simulation.state=mode;
  setBehavior(mode,!fresh?'Esperando órdenes del cerebro':moving?'Movimiento neuronal':'En reposo · salida neuronal');
  setText('neuralMotion','Avance '+forward.toFixed(2)+' · giro '+turn.toFixed(2)+' · elevación '+lift.toFixed(2)+' · freno '+brake.toFixed(2));
  const smell=typeof bodySmell==='function' ? bodySmell(simulation.x,simulation.y) : 0;
  const resting=simulation.support==='refugio' && motor.rest>.2;
  setText('bodyTelemetry','cuerpo: '+simulation.support+(resting?' · recuperando energía':'')+' · altura '+simulation.altitude.toFixed(2)+' m · olor '+Math.round(smell*100)+'% · viento '+Math.round(Math.hypot(simulation.environment.windX,simulation.environment.windY)*100)+'%');
  simulation.telemetry.push({t:now,x:simulation.x,y:simulation.y,z:simulation.altitude,forward,turn,lift,smell,contact:simulation.currentFoodContact});
  if(simulation.telemetry.length>180) simulation.telemetry.shift();
}
function spawnFoodPoint() {
  const point = { x: randomBetween(.16, .78), y: randomBetween(.43, .66) };
  simulation.maze = null;
  garden.nectar = [point];
  simulation.foodAvailable = true; simulation.food={point,quantity:1,sugar:.78,createdAt:performance.now(),kind:'néctar'};
  window.terrarium3D?.setEnvironment({ foodPoint: point, foodVisible: true });
}
function activateHomePoint() {
  simulation.maze = null;
  // A sensory invitation only: it never sets a target, route or motor output.
  simulation.homeVisible=true; simulation.homeInvitationStarted=performance.now(); simulation.homeInvitationUntil=performance.now()+120000;
  window.terrarium3D?.setEnvironment({ homePoint: garden.home, homeVisible: true, homeCall: true });
}
const mapElements = {
  nectar: [...document.querySelectorAll('[data-feature="nectar"]')],
  refuge: [...document.querySelectorAll('[data-feature="refuge"]')],
  water: document.getElementById('pond'),
  plants: [document.getElementById('plantA'), document.getElementById('plantB')],
};
const simulation = {
  // Normalized world coordinates map to a 10.4 m × 7.1 m physical garden.
  // Speeds and forces below are expressed in normalized metres / second.
  x: .48, y: .34, vx: 0, vy: 0, heading: -3, bodyAngle: 0, angularVelocity: 0,
  altitude: 0, verticalVelocity: 0, mass: .12, radius: .025, grounded: true, support: 'suelo',
  state: 'flight', intent: 'explore', isBodyOwner: false,
  foodAvailable: false, food: null, homeVisible: true, homeInvitationStarted: 0, homeInvitationUntil: 0,
  environment: { windX: .025, windY: -.012, humidity: .62, temperature: .52, daylight: .7, startedAt: performance.now() },
  telemetry: [], previousVision: 0, currentFoodContact: false, currentTaste: 0,
  maze: null,
  target: null, targetKind: 'air', lastFrame: 0, nextDecision: 0, lastLabel: '',
  arousal: .16, fatigue: .18, curiosity: .62, habituation: 0, startle: 0,
  pointer: null, cursorPressure: 0, cursorNearUntil: 0, lastCursorStartle: 0,
  painUntil: 0, painVisualUntil: 0, foodCueUntil: 0, playCueUntil: 0, refugeCueUntil: 0, exploreCueUntil: 0,
  stimulusIntent: '', stimulusUntil: 0, placeMessage: '', placeMessageUntil: 0,
};
const pick = list => list[Math.floor(Math.random() * list.length)];
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
function setFlyBehavior(signal,origin) {
  flyMotion.signal=signal;
  if(!flyMotion.started) {flyMotion.started=true; requestAnimationFrame(simulateFly);}
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
  window.terrarium3D?.setFlyState({ x: simulation.x, y: simulation.y, vx: simulation.vx, vy: simulation.vy, heading: simulation.heading, behavior: flyMotion.behavior, mode: flyMotion.mode });
}
function simulateFly(now) {
  requestAnimationFrame(simulateFly);
  if(!flyMotion.started || document.hidden) return;
  const dt=Math.min(.04,Math.max(0,(now-(simulation.lastFrame||now))/1000));
  simulation.lastFrame=now;
  updateEnvironment(now);
  if(simulation.maze) diffuseMaze(simulation.maze,3);
  publishBodySenses(now);
  integrateNeuralBody(dt,now);
  placeFly();updateGardenResponse();
}
function nearestDistance(points) { return Math.min(...points.map(point => Math.hypot(simulation.x - point.x, simulation.y - point.y))); }
function updateGardenResponse() {
  document.body.classList.toggle('maze-active', !!simulation.maze);
  const nearNectar = nearestDistance(garden.nectar) < .115 || false;
  const nearRefuge = nearestDistance(garden.refuge) < .13 || false;
  const nearWater = nearestDistance(garden.water) < .16 || false;
  mapElements.nectar.forEach(element => element.classList.toggle('is-sensed', nearNectar));
  mapElements.refuge.forEach(element => element.classList.toggle('is-sensed', nearRefuge));
  mapElements.water.classList.toggle('is-active', nearWater && flyMotion.mode === 'flight');
  mapElements.plants.forEach((element, index) => element.classList.toggle('is-brushed', Math.hypot(simulation.x - garden.leaves[index].x, simulation.y - garden.leaves[index].y) < .13));
  terrarium.classList.toggle('is-near-pond', nearWater);
  terrarium.classList.toggle('is-disturbed', simulation.startle > .28);
  document.getElementById('mazeSenses').hidden = false;
  const mazeView = simulation.maze;
  const foodPoint = activeFood()?.point || null;
  window.terrarium3D?.setEnvironment({ playLight:simulation.playLight?.until>performance.now()?simulation.playLight:null, nearNectar, nearRefuge, nearWater, disturbed: simulation.startle > .28, foodPoint, foodVisible: !!activeFood(), homePoint: garden.home, homeVisible: !simulation.maze, homeCall:simulation.homeInvitationUntil>performance.now(), maze: mazeView, mazeVisible: !!mazeView, altitude:simulation.altitude, grounded:simulation.grounded, support:simulation.support, wind:simulation.environment, senses:simulation.lastSenses });
}
window.addEventListener('resize',placeFly);
terrarium.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch') return;
  const rect=terrarium.getBoundingClientRect();
  simulation.pointer={x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};
});
terrarium.addEventListener('pointerleave',()=>{simulation.pointer=null;});
document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => act(button.dataset.action)));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  window.terrarium3D?.setEnvironment({ viewMode: button.dataset.view });
  document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
document.addEventListener('keydown', event => {
  const action = ({ '1': 'food', '2': 'play', '3': 'rest', '4': 'explore', '5': 'maze' })[event.key];
  if (action) act(action);
});
document.getElementById('soundToggle').addEventListener('click', event => {
  state.sound = !state.sound; event.currentTarget.textContent = state.sound ? '◉' : '◌';
});

setInterval(() => setText('clock', new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })), 1000);

const canvas = document.getElementById('neuralCanvas');
const ctx = canvas.getContext('2d');
const nodeInfo = document.getElementById('brainNodeInfo');
let hoveredNode = -1;
let lastBrainFrame = 0;
let brainPaused = false;
let brainOnscreen = true;
const brainObserver = new IntersectionObserver(entries => { brainOnscreen = entries[0].isIntersecting; });
brainObserver.observe(canvas);
document.getElementById('brainPause').addEventListener('click', event => {
  brainPaused = !brainPaused;
  event.currentTarget.setAttribute('aria-pressed', String(brainPaused));
  event.currentTarget.textContent = brainPaused ? 'Reanudar mapa · cerebro activo' : 'Pausar mapa · cerebro activo';
});
document.getElementById('brainQuality').addEventListener('change', event => {
  brainQuality = event.currentTarget.value;
  brainDisplay = sampleBrainView(brainVisual, brainQuality === 'light' ? 80 : 160, brainQuality === 'light' ? 80 : 180);
  projectionCache = null;
  const count = brainVisual ? `${brainVisual.nodes.length.toLocaleString('es-CL')} neuronas simuladas · ${brainVisual.total_connections.toLocaleString('es-CL')} conexiones internas · ${brainDisplay.nodes.length} nodos / ${brainDisplay.edges.length} enlaces visibles` : 'Brain pack sintético · cuatro salidas del juego';
  setText('brainCount', count);
});
function projectNodes(width, height) {
  if (!brainDisplay.nodes.length) return [];
  if (projectionCache?.width === width && projectionCache?.height === height) return projectionCache.points;
  const positions = brainDisplay.nodes.map(node => node.position || [0, 0, 0]);
  const xs = positions.map(pos => pos[0]), ys = positions.map(pos => pos[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const points = brainDisplay.nodes.map((node, index) => ({
    x: 24 + (positions[index][0] - minX) / Math.max(1, maxX - minX) * (width - 48),
    y: 53 + (positions[index][1] - minY) / Math.max(1, maxY - minY) * (height - 100),
    value: clamp(node.activity || 0, 0, 1), className: node.super_class, cellClass: node.cell_class, id: node.id, side: node.side, sourceIndex: node.sourceIndex,
  }));
  projectionCache = { width, height, points, bySource: new Map(points.map(point => [point.sourceIndex, point])) };
  return points;
}
function palette(className) {
  if (['optic', 'visual_projection', 'visual_centrifugal'].includes(className)) return [112, 219, 237];
  if (['descending', 'motor'].includes(className)) return [255, 181, 137];
  return [216, 166, 255];
}
function drawBrain(time) {
  requestAnimationFrame(drawBrain);
  if (document.hidden || brainPaused || !brainOnscreen || time - lastBrainFrame < (prefersReducedMotion.matches ? 500 : 100)) return;
  lastBrainFrame = time;
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = 1;
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
  for (const edge of brainDisplay.edges) {
    const from = projectionCache.bySource.get(edge.from), to = projectionCache.bySource.get(edge.to);
    if (!from || !to) continue;
    const activation = (from.value + to.value) / 2;
    const color = edge.neurotransmitter === 'GABA' ? '207,151,246' : edge.neurotransmitter === 'GLUT' ? '255,188,135' : '116,226,216';
    ctx.strokeStyle = `rgba(${color},${.018 + activation*.16})`;
    ctx.lineWidth = .5 + Math.min(edge.weight, 4) * .11;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  }
  if (!prefersReducedMotion.matches) {
    for (let i = 0; i < brainDisplay.edges.length; i += 20) {
      const edge = brainDisplay.edges[i], from = projectionCache.bySource.get(edge.from), to = projectionCache.bySource.get(edge.to);
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
    if (index === hoveredNode) { ctx.shadowBlur = 7; ctx.shadowColor = `rgb(${color.join(',')})`; }
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
Promise.all([
  fetch('/api/v1/brain/topology').then(response => response.json()),
  fetch('/api/v1/state').then(response => response.json()),
]).then(([topology, snapshot]) => {
  if (topology.brain_visual) {
    brainVisual = topology.brain_visual;
    brainDisplay = sampleBrainView(brainVisual, brainQuality === 'light' ? 80 : 160, brainQuality === 'light' ? 80 : 180);
  }
  applySnapshot(snapshot, 'load');
}).catch(() => fetch('/api/state').then(response => response.json()).then(snapshot => applySnapshot(snapshot, 'load')).catch(render));

let activityPending=false;
async function refreshBrainActivity() {
  if(activityPending || document.hidden || brainPaused || !brainVisual) return;
  activityPending=true;
  try {
    const response=await fetch('/api/v1/brain/activity',{cache:'no-store'});
    if(!response.ok) throw new Error('Activity unavailable');
    const frame=await response.json();
    if(frame.brain_pack!==document.getElementById('brainPack').textContent || frame.activity.length!==brainVisual.nodes.length) return;
    brainVisual.nodes.forEach((node,i)=>{node.activity=frame.activity[i];});
    brainDisplay.nodes.forEach(node=>{node.activity=frame.activity[node.sourceIndex];});
    if(projectionCache) projectionCache.points.forEach(point=>{point.value=clamp(frame.activity[point.sourceIndex]||0,0,1);});
    setText('brainLiveStatus','EN VIVO · '+Number(frame.sim_time).toFixed(1)+' s');
  } catch {setText('brainLiveStatus','SIN ACTUALIZACIÓN');}
  finally {activityPending=false;}
}
setInterval(refreshBrainActivity,500);
