// Mateo: Ciudad de Altura — QuestManager data-driven: pasos de tipo talk, waypoint, event (contar sucesos del juego),
// collect (anillos con o sin tiempo), race (puntos de control en orden con reloj), chase (alcanzar a un ladrón) y
// return (devolver algo a alguien). Estados locked/available/active/complete, recompensas, diálogos subtitulados,
// marcadores en el mundo y en el minimapa, medallas M coleccionables y autoguardado sin duplicar recompensas.
import * as THREE from 'three';

/* ---------- datos ---------- */
export function questData(city) {
  const L = city.landmarks;
  const pl = L.plaza, park = L.parque, ob = L.obra;
  // techo con gato: vivienda baja más cercana a la abuela Rosa
  const catRoof = city.buildings.filter(b => (b.type === 'brick' || b.type === 'stucco') && b.roofY < 32).sort((a, b) => Math.hypot(a.x - park.x + 24, a.z - park.z) - Math.hypot(b.x - park.x + 24, b.z - park.z))[0];
  return {
    npcs: [
      { id: 'lia', name: 'Profe Lía', x: pl.x - 4, z: pl.z - 14, yaw: Math.PI, seed: 21, style: { suit: 0x7b4fa0, pantsColor: 0x2b3a55, hair: 0x5b3a22, hairStyle: 'long', skin: 0xe0b090 }, icon: 'L', color: '#7b4fa0' },
      { id: 'rulo', name: 'Don Rulo', x: L.kiosk.x + 4.5, z: L.kiosk.z + 1, yaw: -Math.PI / 2, seed: 8, style: { suit: 0xe0a030, pantsColor: 0x3a3a3a, hair: 0x8a8a8a, hairStyle: 'short' }, icon: 'R', color: '#e0a030' },
      { id: 'pipa', name: 'Pipa', x: park.x + 3, z: park.z - 20, yaw: Math.PI, seed: 3, style: { child: true, scale: 1, legLen: 0.5, torso: 0.82, arm: 0.38, shoulder: 0.9, hipW: 0.9, headR: 0.15, bodyW: 0.13, suit: 0x16a0a0, pantsColor: 0xe07ab0, hair: 0x2a1a10, hairStyle: 'long' }, icon: 'P', color: '#16a0a0' },
      { id: 'tomi', name: 'Tomi', x: park.x - 20, z: park.z + 6, yaw: Math.PI / 2, seed: 4, style: { child: true, scale: 1, legLen: 0.5, torso: 0.82, arm: 0.38, shoulder: 0.9, hipW: 0.9, headR: 0.15, bodyW: 0.13, suit: 0xc0392b, pantsColor: 0x2b3a55, hair: 0xd8b060, hairStyle: 'short' }, icon: 'T', color: '#c0392b' },
      { id: 'sol', name: 'Sol, la mensajera', x: L.reloj.x - 3, z: L.reloj.z - 10, yaw: Math.PI, seed: 12, style: { suit: 0x2e8b57, pantsColor: 0x1e2a3a, hair: 0x1a1a1a, hairStyle: 'long' }, icon: 'S', color: '#2e8b57' },
      { id: 'marta', name: 'Marta, la cajera', x: city.interiors[0].npc.x, z: city.interiors[0].npc.z, y: city.interiors[0].y, yaw: Math.PI, seed: 31, style: { suit: 0x1f3a5a, pantsColor: 0x2b2b2b, hair: 0x1a1a1a, hairStyle: 'long' }, icon: 'M', color: '#1f3a5a' },
      { id: 'gus', name: 'Profe Gus', x: city.interiors[1].npc.x, z: city.interiors[1].npc.z, y: city.interiors[1].y, yaw: 0, seed: 33, style: { suit: 0xe74c3c, pantsColor: 0x2b3a55, hair: 0x2a1a10, hairStyle: 'short' }, icon: 'G', color: '#e74c3c' },
      { id: 'irma', name: 'Capitana Irma', x: L.puerto.x + 38, z: -24, yaw: -Math.PI / 2, y: 0.2, seed: 35, style: { suit: 0xf0f0f0, pantsColor: 0x1e2a3a, hair: 0x8a8a8a, hairStyle: 'short' }, icon: 'I', color: '#1e2a3a' },
      { id: 'nico', name: 'Nico, el fotógrafo', x: -9.5, z: -76, yaw: -Math.PI / 2, seed: 37, style: { suit: 0x16a0a0, pantsColor: 0x3a3a3a, hair: 0xd8b060, hairStyle: 'short' }, icon: 'N', color: '#16a0a0' },
      { id: 'rosa', name: 'Abuela Rosa', x: park.x - 23.5, z: park.z - 14, yaw: Math.PI / 2, seed: 39, style: { suit: 0xc06090, pantsColor: 0x5a4a6a, hair: 0xdedede, hairStyle: 'long' }, icon: 'R', color: '#c06090' },
      { id: 'beto', name: 'Beto, el electricista', x: pl.x + 14, z: pl.z + 20, yaw: Math.PI, seed: 41, style: { suit: 0x2f6db0, pantsColor: 0x2b3a55, hair: 0x5b3a22, hairStyle: 'short' }, icon: 'B', color: '#2f6db0' },
      { id: 'nora', name: 'Ingeniera Nora', x: ob.x - 6, z: ob.z - 24.5, yaw: Math.PI, seed: 15, style: { suit: 0xf2b81d, pantsColor: 0x2b3a55, hair: 0xa0522d, hairStyle: 'short' }, icon: 'N', color: '#f2b81d' },
    ],
    quests: [
      { id: 'primer_salto', name: 'Primer salto', giver: 'lia', kind: 'tutorial', reward: 150, unlocks: ['nuevos_poderes', 'dron', 'mochila', 'medallas_parque', 'plaza_luz', 'gato'],
        steps: [
          { type: 'talk', npc: 'lia', lines: ['¡Hola, Mateo! Soy la Profe Lía. Hoy vas a aprender a moverte por Ciudad de Altura.', 'Primero, caminá hasta la fuente de la plaza.'] },
          { type: 'waypoint', label: 'Caminá hasta la fuente', x: pl.x, y: 0, z: pl.z, r: 8.5 },
          { type: 'event', event: 'jump', count: 2, label: 'Saltá 2 veces', hint: 'kb:Espacio|tc:SALTO' },
          { type: 'waypoint', label: 'Subí al techo del quiosco rojo', hint: 'Saltá y en el aire saltá otra vez (doble salto)', x: L.kiosk.x, y: L.kiosk.y - 0.4, z: L.kiosk.z, r: 3.4, above: true },
          { type: 'event', event: 'superJump', count: 1, label: 'Hacé un súper salto', hint: 'Quedate quieto, mantené SALTO y soltalo' },
          { type: 'talk', npc: 'lia', lines: ['¡Increíble! Saltás altísimo.', 'Cuando quieras, volvé a hablarme: te enseño el cable de energía.'] },
        ] },
      { id: 'nuevos_poderes', name: 'Tus nuevos poderes', giver: 'lia', kind: 'tutorial', reward: 200, unlocks: ['desde_el_techo', 'carrera_techos', 'automata', 'foto_horizonte', 'mensajero', 'trampolin'], unlockMove: 'glide',
        steps: [
          { type: 'talk', npc: 'lia', lines: ['Tus pulseras lanzan un cable de energía que se engancha a los edificios altos.', 'Mirá hacia una torre y lanzá el cable. Si ves el aro celeste, ¡hay anclaje!'] },
          { type: 'event', event: 'cable', count: 1, label: 'Lanzá el cable a un edificio', hint: 'kb:F o clic|tc:CABLE' },
          { type: 'event', event: 'release', count: 1, label: 'Soltá el cable con SALTO para salir disparado', boost: true },
          { type: 'waypoint', label: 'Llegá al techo del Banco Central', x: L.banco.x, y: L.banco.y - 0.5, z: L.banco.z, r: 15, above: true },
          { type: 'talk', npc: 'lia', lines: ['¡Sos un natural! Ahora, si mantenés SALTO mientras caés después del doble salto, vas a PLANEAR.', 'Te dejo un desafío: llegá a la cima de Torre Altura.'] },
        ] },
      { id: 'desde_el_techo', name: 'Desde el techo', giver: 'lia', kind: 'main', reward: 400, unlocks: [],
        steps: [
          { type: 'talk', npc: 'lia', lines: ['Torre Altura es la más alta de la ciudad. Corré por sus paredes, lanzá cables y súper saltos.', '¡Te espero con buenas noticias!'] },
          { type: 'waypoint', label: 'Subí a la cima de Torre Altura', x: L.altura.x, y: L.altura.y - 0.5, z: L.altura.z, r: 10, above: true },
          { type: 'talk', npc: 'lia', lines: ['¡Lo lograste! Toda la ciudad te vio allá arriba.', 'Ahora sos el Guardián de Ciudad de Altura. Ayudá a los vecinos que tengan un "!" sobre la cabeza.'] },
        ] },
      { id: 'medallas_parque', name: 'Medallas M del parque', giver: 'pipa', kind: 'side', repeat: true, reward: 120, timed: 75,
        steps: [
          { type: 'talk', npc: 'pipa', lines: ['¡Mateo! Se me volaron 6 aros brillantes por el parque.', '¿Los juntás en menos de 75 segundos? ¡Uno quedó arriba del ombú!'] },
          { type: 'collect', label: 'Juntá los 6 aros del parque', timer: 75, points: [[park.x - 12, 1.5, park.z + 14], [park.x + 14, 1.5, park.z + 2], [park.x + 6, 1.5, park.z - 14], [L.ombu.x, L.ombu.y + 1.2, L.ombu.z], [park.x + 12, 4.5, park.z - 12], [park.x - 16, 1.5, park.z - 16]] },
          { type: 'talk', npc: 'pipa', lines: ['¡Los encontraste todos! Sos rapidísimo.'] },
        ] },
      { id: 'dron', name: 'Dron descontrolado', giver: 'rulo', kind: 'side', repeat: true, reward: 150,
        steps: [
          { type: 'talk', npc: 'rulo', lines: ['¡Pibe! Los drones de mantenimiento se volvieron locos y me tiran descargas al quiosco.', 'Acercate y usá tu pulso (ACCIÓN) o atrapalos con el cable. ¡Ojo con el círculo rojo!'] },
          { type: 'event', event: 'droneDown', count: 3, label: 'Desactivá 3 drones', spawn: 'drones' },
          { type: 'talk', npc: 'rulo', lines: ['¡Gracias, Mateo! Tomá, un alfajor de energía.'] },
        ] },
      { id: 'carrera_techos', name: 'Carrera por los techos', giver: 'sol', kind: 'side', repeat: true, reward: 220,
        steps: [
          { type: 'talk', npc: 'sol', lines: ['Tengo que entregar un mensaje urgente al otro lado de la ciudad.', '¿Me ganás una carrera por los techos? Pasá por todos los aros en orden.'] },
          { type: 'race', label: 'Pasá por los aros de los techos', timer: 120, points: 'roofs' },
          { type: 'talk', npc: 'sol', lines: ['¡Qué velocidad! El mensaje llegó a tiempo.'] },
        ] },
      { id: 'mochila', name: 'La mochila perdida', giver: 'tomi', kind: 'side', repeat: true, reward: 160,
        steps: [
          { type: 'talk', npc: 'tomi', lines: ['¡Mateo! Un señor con gorro rojo se llevó mi mochila verde. ¡Se fue corriendo!', 'Alcanzalo y usá tu pulso para que se rinda.'] },
          { type: 'chase', label: 'Alcanzá al ladrón del gorro rojo', spawn: 'thief' },
          { type: 'talk', npc: 'tomi', lines: ['¡Mi mochila! Gracias, Mateo. ¡Sos el mejor!'], label: 'Devolvele la mochila a Tomi' },
        ] },
      { id: 'foto_horizonte', name: 'Foto del horizonte', giver: 'nico', kind: 'side', repeat: true, reward: 180,
        steps: [
          { type: 'talk', npc: 'nico', lines: ['Quiero la mejor foto de la ciudad, pero me da vértigo.', 'Subí al Puente Elevado entre las torres y sacala desde el medio. ¡Te presto la cámara!'] },
          { type: 'act', label: 'Sacá la foto desde el Puente Elevado', prompt: 'Sacar la foto 📸', x: L.puente.x, y: L.puente.y, z: L.puente.z, r: 3, marker: 'camera' },
          { type: 'talk', npc: 'nico', lines: ['¡Qué foto! Se ve toda Ciudad de Altura. La voy a colgar en la plaza.'] },
        ] },
      { id: 'gato', name: 'Búsqueda del gato', giver: 'rosa', kind: 'side', repeat: true, reward: 170,
        steps: [
          { type: 'talk', npc: 'rosa', lines: ['¡Ay, Mateo! Mi gato Michi se subió a un techo y no puede bajar.', 'Está en esa casa de ladrillo. ¿Me lo traés con cuidado?'] },
          { type: 'act', label: 'Encontrá a Michi en el techo', prompt: 'Agarrar a Michi 🐱', x: catRoof.x, y: catRoof.roofY, z: catRoof.z, r: 3, marker: 'cat', after: 'carry' },
          { type: 'talk', npc: 'rosa', lines: ['¡Michi! Gracias, Mateo. Sos un héroe muy dulce.'], label: 'Llevale a Michi a la Abuela Rosa' },
        ] },
      { id: 'plaza_luz', name: 'La plaza necesita luz', giver: 'beto', kind: 'side', repeat: true, reward: 160,
        steps: [
          { type: 'talk', npc: 'beto', lines: ['Se cortó la luz de los faroles de la plaza.', 'Tocá el interruptor de cada uno de los 4 faroles de las esquinas.'] },
          { type: 'act', label: 'Encendé el farol 1 de 4', prompt: 'Encender farol 💡', x: pl.x - 9, y: 1, z: pl.z - 21, r: 2.4, marker: 'switch', after: 'light' },
          { type: 'act', label: 'Encendé el farol 2 de 4', prompt: 'Encender farol 💡', x: pl.x + 9, y: 1, z: pl.z - 21, r: 2.4, marker: 'switch', after: 'light' },
          { type: 'act', label: 'Encendé el farol 3 de 4', prompt: 'Encender farol 💡', x: pl.x + 9, y: 1, z: pl.z + 21, r: 2.4, marker: 'switch', after: 'light' },
          { type: 'act', label: 'Encendé el farol 4 de 4', prompt: 'Encender farol 💡', x: pl.x - 9, y: 1, z: pl.z + 21, r: 2.4, marker: 'switch', after: 'light' },
          { type: 'talk', npc: 'beto', lines: ['¡Volvió la luz! Ahora la plaza brilla de noche.'] },
        ] },
      { id: 'mensajero', name: 'Mensajero de altura', giver: 'marta', kind: 'side', repeat: true, reward: 220,
        steps: [
          { type: 'talk', npc: 'marta', lines: ['Estos documentos tienen que llegar al barco del puerto ya mismo.', 'Llevaselos a la Capitana Irma en menos de 80 segundos. ¡Por los techos es más rápido!'] },
          { type: 'talk', npc: 'irma', timer: 80, lines: ['¡Justo a tiempo, grumete! El barco ya puede zarpar.'], label: 'Llevale los documentos a la Capitana Irma (puerto)' },
        ] },
      { id: 'trampolin', name: 'Acróbata del centro', giver: 'gus', kind: 'side', repeat: true, reward: 120,
        steps: [
          { type: 'talk', npc: 'gus', lines: ['¡Bienvenido al centro comunitario! ¿Probaste la cama elástica?', 'Rebotá 3 veces y después subí a la repisa del muro de escalada.'] },
          { type: 'event', event: 'bounce', count: 3, label: 'Rebotá 3 veces en la cama elástica' },
          { type: 'waypoint', label: 'Subí a la repisa del muro de escalada', x: city.interiors[1].x + 6, y: city.interiors[1].y + 9.2, z: city.interiors[1].z + 9.2, r: 3.2, above: true },
          { type: 'talk', npc: 'gus', lines: ['¡Qué acróbata! Volvé cuando quieras.'] },
        ] },
      { id: 'automata', name: 'El autómata de la obra', giver: 'nora', kind: 'side', repeat: true, reward: 250,
        steps: [
          { type: 'talk', npc: 'nora', lines: ['Nuestro autómata de carga se trabó y está pisoteando todo.', 'Tiene un escudo adelante: esquivá el pisotón saltando y apagalo con pulsos por la ESPALDA.'] },
          { type: 'event', event: 'robotDown', count: 1, label: 'Apagá al autómata (3 pulsos por la espalda)', spawn: 'robot' },
          { type: 'talk', npc: 'nora', lines: ['¡Listo! Lo vamos a reparar. Gracias, Mateo.'] },
        ] },
    ],
  };
}

export function createQuests(ctx) {
  const { save, ui, city, people, enemies, player, fx, sfx, scene } = ctx;
  const S = () => save.data;
  const D = questData(city);
  const byId = Object.fromEntries(D.quests.map(q => [q.id, q]));
  const group = new THREE.Group(); group.name = 'misiones'; scene.add(group);
  for (const n of D.npcs) people.spawnNamed(n);

  // marcador de objetivo (columna de luz) y aros de recolección/carrera
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 80, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
  beacon.visible = false; group.add(beacon);
  const ringGeo = new THREE.TorusGeometry(1.4, 0.16, 8, 28);
  const ringMats = { on: new THREE.MeshBasicMaterial({ color: 0x6ff3ff, toneMapped: false }), next: new THREE.MeshBasicMaterial({ color: 0xffd34a, toneMapped: false }) };
  const rings = [];
  for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(ringGeo, ringMats.on); m.visible = false; group.add(m); rings.push(m); }
  // medallas M
  const medalGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20).rotateX(Math.PI / 2);
  const medalMat = new THREE.MeshStandardMaterial({ color: 0xffd34a, emissive: 0x6a4a00, metalness: 0.8, roughness: 0.25 });
  const medals = city.medalSpots.map((p, i) => { const m = new THREE.Mesh(medalGeo, medalMat); m.position.set(p.x, p.y, p.z); m.visible = !S().medals.includes(i); group.add(m); return { ...p, i, m }; });

  // marcadores de los pasos «act»: cámara, gato, interruptor; y luces que se encienden
  const mk = (kind) => {
    const g = new THREE.Group(), m = (geo, c, x, y, z) => { const o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })); o.position.set(x, y, z); g.add(o); return o; };
    if (kind === 'camera') { m(new THREE.BoxGeometry(0.5, 0.35, 0.3), 0x2a2a2a, 0, 0.6, 0); m(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10).rotateX(Math.PI / 2), 0x555555, 0, 0.6, 0.22); m(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), 0x777777, 0, 0.25, 0); }
    if (kind === 'cat') { m(new THREE.SphereGeometry(0.22, 10, 8), 0xe08a2e, 0, 0.25, 0).scale.set(1, 0.8, 1.5); m(new THREE.SphereGeometry(0.15, 10, 8), 0xe08a2e, 0, 0.42, 0.28); for (const sx of [-1, 1]) m(new THREE.ConeGeometry(0.05, 0.12, 4), 0xe08a2e, sx * 0.08, 0.57, 0.28); m(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), 0xe08a2e, 0, 0.35, -0.38).rotation.x = -0.8; }
    if (kind === 'switch') { m(new THREE.BoxGeometry(0.3, 0.45, 0.15), 0xd8d8d8, 0, 0, 0); m(new THREE.BoxGeometry(0.08, 0.18, 0.08), 0xd63031, 0, 0, 0.1); }
    g.visible = false; group.add(g); return g;
  };
  const markers = { camera: mk('camera'), cat: mk('cat'), switch: mk('switch') };
  const lights = [];
  const Q = { active: null, step: 0, count: 0, timer: 0, collected: [], dialog: null, dialogIdx: 0, chaseThief: null, raceIdx: 0, level: 1 };
  function qs(id) { return S().quests[id] || (S().quests[id] = { status: id === 'primer_salto' ? 'available' : 'locked', step: 0, best: 0, times: 0 }); }
  function refreshMarkers() {
    for (const n of D.npcs) {
      const avail = D.quests.find(q => q.giver === n.id && (qs(q.id).status === 'available' || (q.repeat && qs(q.id).status === 'complete')) && (!Q.active));
      const turnIn = Q.active && curStep() && curStep().type === 'talk' && curStep().npc === n.id;
      people.setMarker(n.id, turnIn ? 'turn' : avail && (qs(avail.id).status === 'available' || avail.repeat) ? 'give' : null);
    }
  }
  const cur = () => Q.active ? byId[Q.active] : null;
  const curStep = () => cur() ? cur().steps[Q.step] : null;

  function start(id) {
    const q = byId[id];
    if (id === 'plaza_luz') { lights.forEach(l => l.removeFromParent()); lights.length = 0; }
    Q.active = id; Q.step = 0; Q.count = 0; Q.timer = 0; Q.collected = []; Q.raceIdx = 0; Q.usedTime = 0;
    qs(id).status = 'active'; qs(id).step = 0; save.flush();
    enterStep();
    ui.big(q.name.toUpperCase(), q.kind === 'tutorial' ? 'TUTORIAL' : q.repeat ? 'MISIÓN SECUNDARIA' : 'MISIÓN', 2);
    sfx.quest();
  }
  function enterStep() {
    const st = curStep(); if (!st) return finish();
    Q.count = 0;
    rings.forEach(r => r.visible = false);
    for (const k in markers) markers[k].visible = false;
    if (st.type === 'talk' && !st.timer) { // el diálogo se abre solo si el vecino está cerca; si no, hay que ir a hablarle
      const n = people.named[st.npc], P = player.P;
      if (Q.step === 0 || Math.hypot(n.x - P.pos.x, n.z - P.pos.z) < 7) openDialog(st);
    }
    if (st.type === 'talk' && st.timer) { Q.timer = st.timer; Q.deliver = true; }
    if (st.type === 'act' && st.marker) { const m = markers[st.marker]; m.visible = true; m.position.set(st.x, st.y + (st.marker === 'switch' ? 0 : 0.05), st.z); }
    if (st.type === 'collect') { Q.collected = st.points.map(() => false); Q.timer = st.timer || 0; }
    if (st.type === 'race') { Q.racePts = roofRace(); Q.raceIdx = 0; Q.timer = st.timer; }
    if (st.spawn === 'drones') { enemies.clear('q_dron'); const b = city.landmarks.banco, p = city.landmarks.plaza; enemies.spawnDrone(p.x + 10, 14, p.z + 6, 'q_dron'); enemies.spawnDrone(b.x - 6, 26, b.z - 20, 'q_dron'); enemies.spawnDrone(p.x - 12, 18, p.z - 8, 'q_dron'); }
    if (st.spawn === 'thief') { enemies.clear('q_ladron'); const n = people.named.tomi; const t = enemies.spawnThief(n.x + 6, n.z + 4, 'q_ladron'); t.state = 'flee'; t.carrying = true; Q.chaseThief = t; }
    if (st.spawn === 'robot') { enemies.clear('q_robot'); const o = city.landmarks.obra; enemies.spawnRobot(o.x - 4, o.z - 12, 'q_robot'); }
    S().quests[Q.active].step = Q.step; save.flush();
    refreshMarkers();
  }
  function roofRace() {
    const pick = city.buildings.filter(b => b.type !== 'tower' && b.roofY > 10 && b.roofY < 45 && Math.hypot(b.x - city.landmarks.reloj.x, b.z - city.landmarks.reloj.z) < 170)
      .sort((a, b) => Math.atan2(a.x - city.landmarks.reloj.x, a.z - city.landmarks.reloj.z) - Math.atan2(b.x - city.landmarks.reloj.x, b.z - city.landmarks.reloj.z));
    const out = []; let lastP = { x: city.landmarks.reloj.x, z: city.landmarks.reloj.z };
    for (const b of pick) { if (out.length >= 6) break; const d = Math.hypot(b.x - lastP.x, b.z - lastP.z); if (d > 35 && d < 90) { out.push([b.x, b.roofY + 2, b.z]); lastP = b; } }
    while (out.length < 4) { const b = pick[out.length * 3 % pick.length]; out.push([b.x, b.roofY + 2, b.z]); }
    return out;
  }
  function nextStep() { Q.step++; sfx.checkpoint(); if (Q.step >= cur().steps.length) finish(); else enterStep(); }
  function finish() {
    const q = cur(), st = qs(q.id);
    const first = st.times === 0;
    st.status = 'complete'; st.times++; st.step = 0;
    let pts = q.reward;
    if (q.timed || q.steps.some(s => s.timer)) { const used = Q.usedTime || 0; if (!st.best || used < st.best) { st.best = Math.round(used * 10) / 10; pts += 50; } }
    if (!first) pts = Math.round(pts * 0.5); // repetir da menos puntos (no se duplica la recompensa completa)
    S().points += pts;
    for (const u of q.unlocks || []) if (qs(u).status === 'locked') qs(u).status = 'available';
    if (q.unlockMove) { S().unlocked[q.unlockMove] = true; }
    save.flush();
    ui.big('¡MISIÓN CUMPLIDA!', `${q.name.toUpperCase()} · +${pts} PTS`, 2.6); sfx.win(); fx.confetti(player.P.pos.x, player.P.pos.y + 2, player.P.pos.z);
    enemies.clear('q_dron'); enemies.clear('q_ladron'); enemies.clear('q_robot');
    Q.active = null; Q.step = 0; rings.forEach(r => r.visible = false); beacon.visible = false; clearExtras();
    ctx.onEvent('questDone', q.id);
    refreshMarkers();
  }
  function clearExtras(failed) { if (Q.carry) { Q.carry.visible = false; Q.carry = null; } for (const k in markers) markers[k].visible = false; Q.deliver = false; if (failed) { lights.forEach(l => l.removeFromParent()); lights.length = 0; } }
  function fail(reason) {
    const q = cur(); if (!q) return;
    ui.big('¡CASI!', reason, 2); sfx.denied();
    qs(q.id).status = 'available'; save.flush();
    enemies.clear('q_dron'); enemies.clear('q_ladron'); enemies.clear('q_robot');
    Q.active = null; rings.forEach(r => r.visible = false); beacon.visible = false; clearExtras(true);
    ui.toast('Hablá de nuevo para reintentarlo', 2200);
    refreshMarkers();
  }
  /* ---------- diálogo ---------- */
  function openDialog(st) {
    const npc = D.npcs.find(n => n.id === st.npc);
    Q.dialog = { npc, lines: st.lines, i: 0 };
    const p = people.named[st.npc]; if (p) p.talking = true;
    showLine();
  }
  function showLine() {
    const d = Q.dialog; if (!d) return;
    ui.dialog({ who: d.npc.name.toUpperCase(), text: d.lines[d.i], icon: d.npc.icon, color: d.npc.color, hint: (d.i < d.lines.length - 1 ? 'Seguir ▸' : 'Listo ✓') + (ctx.touch ? ' (tocá ACCIÓN)' : ' (E / Espacio)') });
    sfx.talk();
  }
  function advanceDialog() {
    const d = Q.dialog; if (!d) return;
    d.i++;
    if (d.i < d.lines.length) { showLine(); return; }
    const p = people.named[d.npc.id]; if (p) p.talking = false;
    Q.dialog = null; ui.dialog(null);
    nextStep();
  }
  /* ---------- interacción con NPC ---------- */
  function interactTarget() {
    const P = player.P; if (Q.dialog) return null;
    const cs = curStep();
    if (cs && cs.type === 'act' && Math.hypot(P.pos.x - cs.x, P.pos.z - cs.z) < cs.r && Math.abs(P.pos.y - cs.y) < 2.6) return { kind: 'act', label: cs.prompt, npc: null };
    let best = null, bd = 3.2;
    for (const n of D.npcs) { const p = people.named[n.id]; const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z); if (d < bd && Math.abs(P.pos.y - p.y) < 2) { bd = d; best = n; } }
    if (!best) return null;
    const st = curStep();
    if (st && st.type === 'talk' && st.npc === best.id) return { npc: best, label: st.timer ? `Entregar a ${best.name}` : `Hablar con ${best.name}`, kind: 'turnin' };
    if (!Q.active) {
      const q = D.quests.find(x => x.giver === best.id && (qs(x.id).status === 'available' || (x.repeat && qs(x.id).status === 'complete')));
      if (q) return { npc: best, quest: q, label: `${best.name}: «${q.name}»${qs(q.id).status === 'complete' ? ' (repetir)' : ''}`, kind: 'start' };
    }
    return { npc: best, label: `Hablar con ${best.name}`, kind: 'chat' };
  }
  const CHAT = { lia: ['¡Seguí practicando, Mateo!'], rulo: ['¿Querés un caramelo? Tengo de menta.'], pipa: ['¿Viste el ombú gigante? ¡Arriba hay de todo!'], tomi: ['Mi mamá dice que sos un héroe.'], sol: ['Los techos son el camino más rápido.'], nora: ['En la obra hay que usar casco... ¡salvo los héroes!'], marta: ['Bienvenido al Banco Central. La bóveda es enorme, ¿no?'], gus: ['¡Saltá, rebotá, divertite!'], irma: ['El mar está tranquilo hoy.'], nico: ['La luz del atardecer es la mejor para las fotos.'], rosa: ['¿Querés una galletita?'], beto: ['Siempre revisá que los cables estén bien aislados.'] };
  function interact(t) {
    if (t.kind === 'act') {
      const st = curStep();
      sfx.checkpoint(); fx.sparkle(st.x, st.y + 1, st.z, 0x6ff3ff, 12);
      if (st.marker === 'camera') { ui.big('📸 ¡CLIC!', 'FOTO DEL HORIZONTE', 1.4); fx.confetti(st.x, st.y + 2, st.z); }
      if (st.after === 'carry') { Q.carry = markers.cat; }
      if (st.after === 'light') { const o = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b0, toneMapped: false })); o.position.set(st.x, 6.2, st.z); group.add(o); lights.push(o); }
      nextStep(); if (Q.carry) Q.carry.visible = true;
      return;
    }
    ctx.onEvent('talk', t.npc ? t.npc.id : ''); // V2 P3: «saludá a un vecino» (campaña)
    if (t.kind === 'start') { start(t.quest.id); return; }
    if (t.kind === 'turnin') { openDialog(curStep()); return; }
    const lines = CHAT[t.npc.id] || ['¡Hola!'];
    // V2 P3: los vecinos reconocen tu progreso (nivel de reputación): una charla sí, otra no
    const fame = ctx.repLine && ctx.repLine(); Q.chats = (Q.chats || 0) + 1;
    Q.dialog = { npc: t.npc, lines: [fame && Q.chats % 2 === 1 ? fame : lines[Math.floor(Math.random() * lines.length)]], i: 0, chat: true };
    const p = people.named[t.npc.id]; if (p) p.talking = true;
    showLine();
    Q.dialog.onEnd = true;
  }

  /* ---------- eventos del juego ---------- */
  function event(type, d) {
    if (type === 'land' && d.impact > 12) people.cheer(player.P.pos.x, player.P.pos.z);
    if (type === 'cable') S().stats.swings++;
    if (type === 'superJump') S().stats.superJumps++;
    if (type === 'droneDown') S().stats.drones++;
    if (type === 'thiefCaught') S().stats.thieves++;
    if (type === 'robotDown') S().stats.automatons++;
    if (type === 'shield') ui.toast('🛡 ¡Escudo! Pegale por la espalda o después del pisotón', 1600);
    if (type === 'robotHit') ui.toast(`⚡ ¡Bien! Le quedan ${d.hp}`, 1200);
    const st = curStep(); if (!st) return;
    if (st.type === 'event' && st.event === type && (!st.boost || d.boost)) {
      Q.count++;
      if (Q.count >= st.count) nextStep(); else ui.toast(`${st.label}: ${Q.count}/${st.count}`, 1200);
    }
    if (st.type === 'chase' && type === 'thiefCaught' && d.tag === 'q_ladron') { ui.toast('🎒 ¡Recuperaste la mochila!', 1800); nextStep(); }
  }

  /* ---------- actualización ---------- */
  let t = 0;
  function update(dt, state) {
    t += dt;
    const P = player.P;
    // medallas
    for (const m of medals) {
      if (!m.m.visible) continue;
      m.m.rotation.y = t * 2 + m.i; m.m.position.y = m.y + Math.sin(t * 2 + m.i) * 0.15;
      if (Math.hypot(P.pos.x - m.x, P.pos.y + 0.8 - m.y, P.pos.z - m.z) < 1.7) {
        m.m.visible = false; S().medals.push(m.i); S().points += 50; save.flush();
        sfx.medal(); fx.sparkle(m.x, m.y, m.z);
        ui.toast(`🏅 Medalla M: ${m.name} (${S().medals.length}/${medals.length}) · +50`, 1800);
        ctx.onEvent('medal', m.i);
      }
    }
    Q.level = 1 + Math.floor(S().points / 600);
    if (state !== 'play' && state !== 'dialog') return;
    S().stats.playTime += dt;
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) { S().pos = [+P.lastSafe.x.toFixed(2), +Math.max(0, P.lastSafe.y).toFixed(2), +P.lastSafe.z.toFixed(2)]; /* último punto seguro (en la calle), nunca un techo ni una pared */ if (P.grounded) save.flush(); }
    const st = curStep(); if (!st) { beacon.visible = false; return; }
    if (cur()) Q.usedTime = (Q.usedTime || 0) + dt;
    if (Q.carry && Q.carry.visible) { Q.carry.position.set(P.pos.x - Math.sin(P.yaw) * 0.25, P.pos.y + 0.95, P.pos.z - Math.cos(P.yaw) * 0.25); Q.carry.rotation.y = P.yaw; }
    if (st.type === 'talk' && st.timer && !Q.dialog) { Q.timer -= dt; if (Q.timer <= 0) return fail('Los documentos no llegaron a tiempo'); }
    if (st.type === 'act' && st.marker) markers[st.marker].rotation.y = st.marker === 'cat' ? Math.sin(t) * 0.5 : 0;
    if (st.type === 'waypoint') {
      beacon.visible = true; beacon.position.set(st.x, st.y + 40, st.z);
      const d = Math.hypot(P.pos.x - st.x, P.pos.z - st.z);
      if (d < st.r && (!st.above || P.pos.y >= st.y - 0.2) && (st.above || P.pos.y < st.y + 6)) nextStep();
    } else if (st.type === 'act') { beacon.visible = true; beacon.position.set(st.x, st.y + 40, st.z); }
    else if (st.type === 'talk' && st.timer) { const n = people.named[st.npc]; beacon.visible = true; beacon.position.set(n.x, 40, n.z); }
    else beacon.visible = false;
    if (st.type === 'collect') {
      let left = 0;
      st.points.forEach((p, i) => { const r = rings[i]; if (Q.collected[i]) { r.visible = false; return; } left++; r.visible = true; r.material = ringMats.on; r.position.set(p[0], p[1], p[2]); r.rotation.y = t * 1.5 + i; if (Math.hypot(P.pos.x - p[0], P.pos.y + 0.8 - p[1], P.pos.z - p[2]) < 2.2) { Q.collected[i] = true; sfx.medal(); fx.sparkle(p[0], p[1], p[2], 0x6ff3ff); } });
      if (st.timer) { Q.timer -= dt; if (Q.timer <= 0) return fail('Se terminó el tiempo'); }
      if (left === 0) nextStep();
    }
    if (st.type === 'race') {
      const pts = Q.racePts;
      pts.forEach((p, i) => { const r = rings[i]; r.visible = i >= Q.raceIdx; r.material = i === Q.raceIdx ? ringMats.next : ringMats.on; r.position.set(p[0], p[1], p[2]); r.rotation.y = t + i; r.scale.setScalar(i === Q.raceIdx ? 1.6 : 1); });
      const p = pts[Q.raceIdx];
      beacon.visible = true; beacon.position.set(p[0], p[1] + 40, p[2]);
      if (Math.hypot(P.pos.x - p[0], P.pos.y + 0.8 - p[1], P.pos.z - p[2]) < 3.4) { Q.raceIdx++; sfx.checkpoint(); fx.sparkle(p[0], p[1], p[2], 0xffd34a); if (Q.raceIdx >= pts.length) return nextStep(); }
      Q.timer -= dt; if (Q.timer <= 0) return fail('Se terminó el tiempo de la carrera');
    }
    if (st.type === 'chase' && Q.chaseThief) { const th = Q.chaseThief; beacon.visible = true; beacon.position.set(th.x, 40, th.z); }
  }

  const api = {
    get inDialog() { return !!Q.dialog; },
    get medalCount() { return S().medals.length; }, get medalTotal() { return medals.length; }, get level() { return Q.level; },
    D, byId, status: id => qs(id).status,
    begin() { refreshMarkers(); if (qs('primer_salto').status === 'available' && !Q.active) ui.toast('Hablá con la Profe Lía (tiene un «!») junto a la fuente', 3500); },
    reset() { Q.active = null; Q.dialog = null; ui.dialog(null); enemies.clear(); medals.forEach(m => m.m.visible = true); rings.forEach(r => r.visible = false); beacon.visible = false; refreshMarkers(); },
    start, advanceDialog: () => { if (Q.dialog && Q.dialog.chat) { const p = people.named[Q.dialog.npc.id]; if (p) p.talking = false; Q.dialog = null; ui.dialog(null); return; } advanceDialog(); },
    interactTarget, interact, event, update,
    abandon() { if (Q.active) { clearExtras(true); const q = cur(); qs(q.id).status = q.repeat && qs(q.id).times > 0 ? 'complete' : 'available'; enemies.clear('q_dron'); enemies.clear('q_ladron'); enemies.clear('q_robot'); Q.active = null; Q.dialog = null; ui.dialog(null); rings.forEach(r => r.visible = false); beacon.visible = false; save.flush(); refreshMarkers(); } },
    /** V2 P3: punto del objetivo actual (ruta del minimapa y mapa completo) */
    targetPoint() {
      const st = curStep(); if (!st) return null;
      if (st.type === 'waypoint' || st.type === 'act') return { x: st.x, y: st.y, z: st.z };
      if (st.type === 'talk') { const n = people.named[st.npc]; return { x: n.x, y: n.y || 0, z: n.z }; }
      if (st.type === 'race' && Q.racePts) { const p = Q.racePts[Q.raceIdx]; return p ? { x: p[0], y: p[1], z: p[2] } : null; }
      if (st.type === 'chase' && Q.chaseThief) return { x: Q.chaseThief.x, y: 0, z: Q.chaseThief.z };
      if (st.type === 'collect') { const i = Q.collected.findIndex(c => !c); if (i >= 0) { const p = st.points[i]; return { x: p[0], y: p[1], z: p[2] }; } }
      return null;
    },
    objective(P) {
      const q = cur(), st = curStep();
      if (!q) { const av = D.quests.find(x => qs(x.id).status === 'available'); return av ? { name: 'Explorá Ciudad de Altura', step: `Buscá a ${D.npcs.find(n => n.id === av.giver).name} («!») para «${av.name}»`, dist: null } : { name: 'Explorá Ciudad de Altura', step: `Medallas M: ${S().medals.length}/${medals.length}`, dist: null }; }
      let tgt = null;
      if (st.type === 'waypoint') tgt = st;
      if (st.type === 'talk') { const n = people.named[st.npc]; tgt = { x: n.x, y: n.y, z: n.z }; }
      if (st.type === 'act') tgt = st;
      if (st.type === 'race') { const p = Q.racePts[Q.raceIdx]; tgt = { x: p[0], y: p[1], z: p[2] }; }
      if (st.type === 'chase' && Q.chaseThief) tgt = { x: Q.chaseThief.x, y: 0, z: Q.chaseThief.z };
      if (st.type === 'collect') { const i = Q.collected.findIndex(c => !c); if (i >= 0) { const p = st.points[i]; tgt = { x: p[0], y: p[1], z: p[2] }; } }
      const hint = st.hint ? (st.hint.startsWith('kb:') ? (ctx.touch ? st.hint.split('|tc:')[1] : st.hint.split('|')[0].slice(3)) : st.hint) : '';
      const label = st.type === 'talk' ? (st.label || `Hablá con ${D.npcs.find(n => n.id === st.npc).name}`) : st.label;
      return {
        name: q.name, step: `${Q.step + 1}/${q.steps.length} · ${label}${st.type === 'event' && st.count > 1 ? ` (${Q.count}/${st.count})` : ''}${st.type === 'collect' ? ` (${Q.collected.filter(Boolean).length}/${st.points.length})` : ''}${st.type === 'race' ? ` (${Q.raceIdx}/${Q.racePts.length})` : ''}${hint ? ' — ' + hint : ''}`,
        dist: tgt ? Math.hypot(P.pos.x - tgt.x, P.pos.z - tgt.z) : null, dy: tgt ? tgt.y - P.pos.y : 0,
        time: (st.type === 'collect' && st.timer) || st.type === 'race' || (st.type === 'talk' && st.timer) ? Math.max(0, Q.timer) : null,
      };
    },
    drawMap(c, X, Y) {
      for (const n of D.npcs) { const p = people.named[n.id]; if (!p.marker.visible) continue; c.fillStyle = '#ffcf3f'; c.beginPath(); c.arc(X(p.x), Y(p.z), 6, 0, 7); c.fill(); c.fillStyle = '#1a1204'; c.font = '900 9px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', X(p.x), Y(p.z) + 0.5); }
      for (const m of medals) if (m.m.visible) { c.fillStyle = '#ffe27a'; c.fillRect(X(m.x) - 2, Y(m.z) - 2, 4, 4); }
      const st = curStep(); if (!st) return;
      let p = null;
      if (st.type === 'waypoint' || st.type === 'act') p = st; else if (st.type === 'race') { const q = Q.racePts[Q.raceIdx]; p = { x: q[0], z: q[2] }; } else if (st.type === 'talk') p = people.named[st.npc]; else if (st.type === 'chase' && Q.chaseThief) p = Q.chaseThief;
      if (p) { c.strokeStyle = '#6ff3ff'; c.lineWidth = 3; c.beginPath(); c.arc(X(p.x), Y(p.z), 8, 0, 7); c.stroke(); }
    },
    stepPoint() { const st = curStep(); return st && st.x !== undefined ? { x: st.x, y: st.y, z: st.z, type: st.type } : null; },
    info() { return { active: Q.active, step: Q.step, stepType: curStep() ? curStep().type : '', count: Q.count, timer: +Q.timer.toFixed(2), dialog: Q.dialog ? Q.dialog.lines[Q.dialog.i] : '', statuses: Object.fromEntries(D.quests.map(q => [q.id, qs(q.id).status])), medals: S().medals.length, medalSpots: medals.map(m => ({ x: m.x, y: m.y, z: m.z, got: !m.m.visible })), race: Q.racePts ? { idx: Q.raceIdx, pts: Q.racePts } : null, collect: curStep() && curStep().type === 'collect' ? curStep().points : null, npcs: Object.fromEntries(D.npcs.map(n => [n.id, { x: people.named[n.id].x, z: people.named[n.id].z }])) }; },
    debugStart(id) { if (Q.active) api.abandon(); qs(id).status = 'available'; start(id); },
    debugStep() { if (Q.dialog) { Q.dialog = null; ui.dialog(null); } nextStep(); },
    debugMedal(i) { const m = medals[i]; if (m) player.teleport(m.x, m.y - 0.8, m.z); },
  };
  return api;
}
