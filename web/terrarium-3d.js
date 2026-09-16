/* WebGL 3D presentation only. app.js remains authoritative for brain and physics. */
(() => {
  const canvas = document.getElementById('terrariumCanvas3d');
  if (!canvas || !window.THREE) return;
  const THREE = window.THREE;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setClearColor('#10203b', 1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#10203b', 10, 22);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 40); camera.position.set(0, 10.8, 7.2); camera.lookAt(0, 0, .25);
  const cursorRay = new THREE.Raycaster();
  const cursorNDC = new THREE.Vector2();
  const cursorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();
  const flyScreen = new THREE.Vector3();
  const world = new THREE.Group(); scene.add(world);
  const mazeLayer = new THREE.Group(); world.add(mazeLayer); mazeLayer.visible = false;
  const gardenLayer = new THREE.Group(); world.add(gardenLayer);
  const fly = new THREE.Group(); world.add(fly);
  const state = { x: .48, y: .34, vx: 0, vy: 0, heading: 0, altitude: 0, grounded: true, mode: 'flight', foodPoint: null, foodVisible: false, homePoint: null, homeVisible: false, homeCall: false, playLight: null, maze: null, mazeVisible: false, wind: { windX: 0, windY: 0, daylight: .7 }, senses: null, viewMode: 'follow' };
  const wings = [], legs = [], odorParticles = [], foliage = [], homeShell = []; let foodMarker, homeMarker, homeLamp, playMarker, sensorCone;
  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: 0, ...options });
  const add = (geometry, material, parent = world) => { const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  // This maps the authoritative normalized simulation plane into the 3D world.
  const point = (x, y, height = 0) => new THREE.Vector3((x - .5) * 10.4, height, (y - .5) * 7.1);
  const box = (w, h, d, color, x, y, z, parent = world) => { const mesh = add(new THREE.BoxGeometry(w, h, d), standard(color), parent); mesh.position.set(x, y, z); return mesh; };
  const sphere = (radius, color, x, y, z, parent = world) => { const mesh = add(new THREE.SphereGeometry(radius, 18, 12), standard(color), parent); mesh.position.set(x, y, z); return mesh; };

  function addPlant(x, z, size) {
    const group = new THREE.Group(); gardenLayer.add(group);
    foliage.push(group);
    const stem = add(new THREE.CylinderGeometry(.045, .065, size, 8), standard('#4baa6a'), group); stem.position.y = size / 2;
    for (const side of [-1, 1]) { const leaf = add(new THREE.SphereGeometry(.28 * size, 12, 8), standard(side < 0 ? '#6bd686' : '#4cae6a'), group); leaf.scale.set(1.6, .20, .62); leaf.position.set(side * .16, size * .58, side * .10); leaf.rotation.z = side * -.58; }
    group.position.set(x, 0, z);
  }
  function addFlower(x, z, color) {
    const group = new THREE.Group(); gardenLayer.add(group);
    const stem = add(new THREE.CylinderGeometry(.022, .028, .35, 7), standard('#4baa6a'), group); stem.position.y = .175;
    for (let i = 0; i < 5; i++) { const petal = add(new THREE.SphereGeometry(.09, 12, 8), standard(color), group); petal.scale.set(1.3, .32, .72); petal.position.set(Math.cos(i * Math.PI * .4) * .11, .38, Math.sin(i * Math.PI * .4) * .11); }
    sphere(.075, '#ffe99b', 0, .4, 0, group); group.position.set(x, 0, z);
  }
  function makeGarden() {
    const floor = add(new THREE.PlaneGeometry(12, 8), standard('#214c45'), gardenLayer); floor.rotation.x = -Math.PI / 2;
    const shore = add(new THREE.CylinderGeometry(1.82, 1.82, .035, 40), standard('#173b49'), gardenLayer); shore.scale.z = .53; shore.position.set(0, .005, 1.75);
    const water = add(new THREE.CylinderGeometry(1.7, 1.7, .055, 40), standard('#52b7bd', { roughness: .25, metalness: .08 }), gardenLayer); water.scale.z = .48; water.position.set(0, .04, 1.75);
    addPlant(-4.0, .9, 1.35); addPlant(4.0, 1.1, 1.1); addFlower(-2.5, 1.45, '#ff9fb9'); addFlower(2.8, 1.6, '#f5dc86');
    foodMarker = sphere(.17, '#ffe58a', 0, .18, 0); foodMarker.visible = false; foodMarker.add(new THREE.PointLight('#ffe58a', .65, 2.4));
    playMarker = sphere(.10, '#d7a5ff', 0, .25, 0); playMarker.visible = false; playMarker.add(new THREE.PointLight('#d7a5ff', .8, 2.5));
    homeMarker = new THREE.Group(); world.add(homeMarker); homeMarker.visible = false;
    const cabin = box(.65, .42, .55, '#78c99c', 0, .22, 0, homeMarker); homeShell.push(cabin);
    const roof = add(new THREE.ConeGeometry(.53, .35, 4), standard('#d7a5ff'), homeMarker); roof.position.y = .60; roof.rotation.y = Math.PI / 4; homeShell.push(roof);
    const door = box(.15, .22, .02, '#243555', 0, .13, .286, homeMarker); door.castShadow = false;
    homeLamp = new THREE.PointLight('#d7a5ff', 0, 2.6); homeLamp.position.set(0,.58,.1); homeMarker.add(homeLamp);
  }
  function makeFly() {
    // Local forward is -X. updateFly turns the body from the neural heading.
    const abdomen = sphere(.28, '#a07c6d', .34, 0, 0, fly); abdomen.scale.set(1.38, .74, .78);
    const thorax = sphere(.30, '#403540', -.03, .02, 0, fly); thorax.scale.set(1, .82, .86);
    sphere(.25, '#473947', -.38, .025, 0, fly);
    for (const side of [-1, 1]) { const eye = sphere(.13, '#bd5573', -.48, .065, side * .16, fly); eye.scale.set(.75, 1, .7); }
    const wingMat = new THREE.MeshStandardMaterial({ color: '#bfe9ee', transparent: true, opacity: .62, side: THREE.DoubleSide, depthWrite: false, roughness: .18 });
    for (const side of [-1, 1]) { const wing = add(new THREE.SphereGeometry(.30, 14, 8), wingMat, fly); wing.scale.set(1.25, .10, .57); wing.position.set(.05, .13, side * .20); wing.rotation.x = side * .20; wing.userData.wingSide = side; wings.push(wing); }
    const legMat = standard('#bda29b');
    for (let i = 0; i < 3; i++) for (const side of [-1, 1]) { const leg = add(new THREE.CylinderGeometry(.015, .015, .34, 6), legMat, fly); leg.position.set(-.17 + i * .18, -.18, side * .18); leg.rotation.z = side * (i - 1) * .35; leg.rotation.x = side * Math.PI / 2.4; leg.userData.baseZ=leg.rotation.z; leg.userData.phase=i*Math.PI+side*.7; legs.push(leg); }
  }
  function makeSensoryOverlay() {
    sensorCone = new THREE.Group(); world.add(sensorCone); sensorCone.visible = false;
    const coneMat = new THREE.MeshBasicMaterial({ color: '#87e8ff', transparent: true, opacity: .10, side: THREE.DoubleSide, depthWrite: false });
    const cone = add(new THREE.ConeGeometry(.65, 1.25, 24, 1, true), coneMat, sensorCone); cone.rotation.z = -Math.PI / 2; cone.position.x = -.63;
    const antennaMat = new THREE.LineBasicMaterial({ color: '#d9ffb7', transparent: true, opacity: .75 });
    for (const side of [-1,1]) { const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.48,.08,side*.12),new THREE.Vector3(-.76,.12,side*.23)]), antennaMat); sensorCone.add(line); }
    const odorMat = new THREE.MeshBasicMaterial({ color: '#ffe58a', transparent: true, opacity: .42 });
    for(let i=0;i<18;i++) { const mote=add(new THREE.SphereGeometry(.035,8,6),odorMat); mote.visible=false; odorParticles.push({mesh:mote,phase:i*.71}); }
  }
  function clearMaze() { while (mazeLayer.children.length) { const item = mazeLayer.children.pop(); item.traverse?.(child => { child.geometry?.dispose(); child.material?.dispose(); }); } }
  function drawMaze(maze) {
    clearMaze(); if (!maze) return;
    // Use the exact same normalized cell centres as app.js. Rendering must not
    // introduce a second maze coordinate system.
    const cellW = .74 / Math.max(1, maze.cols - 1) * 10.4;
    const cellD = .38 / Math.max(1, maze.rows - 1) * 7.1;
    const sizeX = cellW * maze.cols, sizeZ = cellD * maze.rows;
    const centre = point(.5, .47, -.02);
    const floor = add(new THREE.PlaneGeometry(sizeX, sizeZ), standard('#172443'), mazeLayer); floor.rotation.x = -Math.PI / 2; floor.position.copy(centre);
    const wallMat = standard('#41648f');
    for (let y = 0; y < maze.rows; y++) for (let x = 0; x < maze.cols; x++) if (maze.grid[y][x]) { const wall = add(new THREE.BoxGeometry(cellW * .96, .52, cellD * .96), wallMat, mazeLayer); wall.position.copy(point(.13 + x / Math.max(1, maze.cols - 1) * .74, .28 + y / Math.max(1, maze.rows - 1) * .38, .26)); }
    const rim = add(new THREE.BoxGeometry(sizeX + .12, .13, sizeZ + .12), standard('#0c1831'), mazeLayer); rim.position.copy(point(.5, .47, -.12));
    const goal = point(.13 + maze.goal.x / Math.max(1, maze.cols - 1) * .74, .28 + maze.goal.y / Math.max(1, maze.rows - 1) * .38, .02);
    const halo = add(new THREE.RingGeometry(.15, .24, 28), new THREE.MeshBasicMaterial({ color: '#ffe58a', transparent: true, opacity: .6, side: THREE.DoubleSide }), mazeLayer); halo.rotation.x = -Math.PI / 2; halo.position.copy(goal);
  }
  function resize() { const width = canvas.clientWidth || 1, height = canvas.clientHeight || 1; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); }
  function screenToWorld(clientX, clientY) {
    const rect=canvas.getBoundingClientRect();
    if(!rect.width || !rect.height) return null;
    cursorNDC.set((clientX-rect.left)/rect.width*2-1,-((clientY-rect.top)/rect.height)*2+1);
    cursorRay.setFromCamera(cursorNDC,camera);
    // Intersect at Mica's rendered body height, rather than the ground under
    // her. In perspective view this eliminates the parallax gap between the
    // visible fly and the sensory cursor position.
    cursorPlane.constant=-((state.mazeVisible ? .19 : .18)+(state.altitude||0)*2.2);
    if(!cursorRay.ray.intersectPlane(cursorPlane,groundHit)) return null;
    return {x:Math.max(.06,Math.min(.90,groundHit.x/10.4+.5)),y:Math.max(.12,Math.min(.78,groundHit.z/7.1+.5))};
  }
  function publishCursorPerception(event) {
    const rect=canvas.getBoundingClientRect();
    fly.getWorldPosition(flyScreen); flyScreen.project(camera);
    const centreX=rect.left+(flyScreen.x*.5+.5)*rect.width;
    const centreY=rect.top+(-flyScreen.y*.5+.5)*rect.height;
    const radius=Math.max(56,rect.width*.14);
    const dx=event.clientX-centreX,dy=event.clientY-centreY;
    const threat=Math.max(0,Math.min(1,1-Math.hypot(dx,dy)/radius));
    // This is a lateral optical measurement, not an instruction to turn.
    const side=Math.max(-1,Math.min(1,dx/radius));
    window.dispatchEvent(new CustomEvent('flygotchi:pointer-perception',{detail:{threat,left:Math.max(0,1-side),right:Math.max(0,1+side)}}));
  }
  function updateFly(now) {
    fly.position.copy(point(state.x, state.y, (state.mazeVisible ? .19 : .18)+(state.altitude||0)*2.2));
    // app.js publishes degrees; Three.js rotations use radians.
    fly.rotation.y = -(state.heading || 0) * Math.PI / 180 + Math.PI;
    const speed = Math.hypot(state.vx || 0, state.vy || 0), scale = state.mazeVisible ? .22 : .56; fly.scale.setScalar(scale);
    const beat = speed > .001 && state.mode === 'flight' && !reducedMotion ? Math.sin(now * .036) * .42 : 0;
    wings.forEach(wing => { wing.rotation.x = wing.userData.wingSide * (.20 + beat); });
    const walking=state.grounded && speed>.004;
    legs.forEach(leg => { leg.rotation.z=leg.userData.baseZ+(walking&&!reducedMotion?Math.sin(now*.018+leg.userData.phase)*.34:0); });
    if (!state.mazeVisible && state.mode === 'flight') fly.position.y += reducedMotion ? 0 : Math.sin(now * .007) * .025;
    sensorCone.position.copy(fly.position); sensorCone.rotation.copy(fly.rotation); sensorCone.visible=state.viewMode==='senses';
  }
  function updateMarkers(now) {
    foodMarker.visible = !!state.foodVisible && !!state.foodPoint;
    if (state.foodPoint) foodMarker.position.copy(point(state.foodPoint.x, state.foodPoint.y, state.mazeVisible ? .17 : .19));
    foodMarker.scale.setScalar(state.mazeVisible ? .38 : 1); if (foodMarker.visible) foodMarker.rotation.y = now * .002;
    playMarker.visible = !!state.playLight; if (state.playLight) playMarker.position.copy(point(state.playLight.x, state.playLight.y, .28));
    homeMarker.visible = !!state.homeVisible && !!state.homePoint && !state.mazeVisible; if (state.homePoint) homeMarker.position.copy(point(state.homePoint.x, state.homePoint.y, 0));
    // Preserve a view of Mica after she enters the shelter. This is purely a
    // presentation cutaway; collision, contact and neural state stay in app.js.
    const occupied=!!state.homePoint && Math.hypot(state.x-state.homePoint.x,state.y-state.homePoint.y)<.14;
    homeShell.forEach(mesh=>{ mesh.material.transparent=occupied; mesh.material.opacity=occupied?.32:1; mesh.material.depthWrite=!occupied; });
    if(homeLamp) homeLamp.intensity=state.homeCall ? .95+(reducedMotion?0:Math.sin(now*.009)*.18) : .12;
    gardenLayer.visible = !state.mazeVisible; mazeLayer.visible = !!state.mazeVisible && !!state.maze;
    const wind=state.wind||{};
    foliage.forEach((plant,index) => { plant.rotation.z=(reducedMotion?0:Math.sin(now*.0016+index)*((Math.hypot(wind.windX||0,wind.windY||0))*2.8)); });
    if(foodMarker.visible && state.foodPoint) for(const particle of odorParticles) {
      const drift=(now*.0003+particle.phase)%1;
      particle.mesh.visible=state.viewMode==='senses';
      particle.mesh.position.copy(point(state.foodPoint.x+(wind.windX||0)*drift*8, state.foodPoint.y+(wind.windY||0)*drift*8, .18+drift*.35));
      particle.mesh.scale.setScalar(.35+drift*.8);
    } else odorParticles.forEach(p=>p.mesh.visible=false);
  }
  function updateCamera() {
    const desired=state.viewMode==='top' ? new THREE.Vector3(0,14,.1) : state.viewMode==='senses' ? fly.position.clone().add(new THREE.Vector3(0,3.2,2.2)) : fly.position.clone().add(new THREE.Vector3(0,10.8,7.2));
    camera.position.lerp(desired,.06);
    const target=state.viewMode==='top' ? new THREE.Vector3(0,0,.25) : fly.position.clone().add(new THREE.Vector3(state.viewMode==='senses' ? -.4 : 0,0,.25));
    camera.lookAt(target);
  }
  function animate(now) { requestAnimationFrame(animate); updateFly(now); updateMarkers(now); updateCamera(); renderer.render(scene, camera); }
  scene.add(new THREE.HemisphereLight('#9bb9ff', '#173827', 2.1));
  const sun = new THREE.DirectionalLight('#fff0b4', 2.3); sun.position.set(-4, 8, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7; scene.add(sun);
  makeGarden(); makeFly(); makeSensoryOverlay(); resize(); new ResizeObserver(resize).observe(canvas); window.addEventListener('resize', resize);
  canvas.addEventListener('pointermove',publishCursorPerception);
  canvas.addEventListener('pointerleave',()=>window.dispatchEvent(new CustomEvent('flygotchi:pointer-perception',{detail:{threat:0,left:0,right:0}})));
  // The animated fly and HUD are DOM layers above the WebGL canvas. Pointer
  // events can therefore land on those layers instead of the canvas itself.
  // Listen globally and keep only coordinates inside the terrarium so the
  // same visual threat reaches the brain even when the cursor is over Mica.
  window.addEventListener('pointermove', event=>{
    const rect=canvas.getBoundingClientRect();
    const inside=event.clientX>=rect.left && event.clientX<=rect.right && event.clientY>=rect.top && event.clientY<=rect.bottom;
    if(inside) publishCursorPerception(event);
    else window.dispatchEvent(new CustomEvent('flygotchi:pointer-perception',{detail:{threat:0,left:0,right:0}}));
  }, {passive:true});
  canvas.closest('.terrarium')?.classList.add('webgl-active');
  window.terrarium3D = { screenToWorld, getFlyScreen() { const rect=canvas.getBoundingClientRect(); fly.getWorldPosition(flyScreen); flyScreen.project(camera); return {x:rect.left+(flyScreen.x*.5+.5)*rect.width,y:rect.top+(-flyScreen.y*.5+.5)*rect.height}; }, setFlyState(next = {}) { Object.assign(state, next); }, setEnvironment(next = {}) { if (Object.prototype.hasOwnProperty.call(next, 'maze') && next.maze !== state.maze) drawMaze(next.maze); Object.assign(state, next); } };
  requestAnimationFrame(animate);
})();
