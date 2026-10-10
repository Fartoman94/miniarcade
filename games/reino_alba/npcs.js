// @ts-check
/* Reino del Alba — 12 roles de NPC (+ Tomás el prisionero y dos guardias reales).
   Mismo rig para todos, vestimenta propia. Cada uno tiene id, casa/spawn, nombre, agenda diaria, máquina de estados
   (idle / walk / talk / questAvailable / questTurnIn), orientación al jugador, manejo de proximidad y navegación por
   grilla A* (nunca atraviesan paredes: además se mueven con el mismo colisionador que el jugador).
   Los del área activa tienen IA completa; los lejanos o de otras escenas se actualizan a baja frecuencia. */
import * as THREE from 'three';
import { makeHumanoid, animateRig } from './models.js';
import { moveCircle } from './physics.js';
import { PARENT, LINKS } from './world.js';

/** agenda: [hora de inicio, escena, ancla] (se repite cada día) */
export const NPC_DEFS = {
  herrero: { name: 'Bruno', role: 'Herrero', home: 'herreria', icon: '⚒', look: { shirt: 0x6a4a3a, pants: 0x3a2e28, hair: 0x2a1a10, beard: true, w: 1.12, extra: ['apron'], extraColor: 0x3a2a20, weapon: 'hammer', hairStyle: 'bald' },
    schedule: [[6, 'herreria', 'yunque'], [13, 'herreria', 'fragua'], [20, 'taberna', 'mesa1'], [23, 'herreria', 'cama']] },
  tabernera: { name: 'Rosa', role: 'Tabernera', home: 'taberna', icon: '🍺', look: { shirt: 0xb5482f, pants: 0x6a3a2a, hair: 0x8a3a1a, hairStyle: 'bun', dress: true, extra: ['apron'], extraColor: 0xf0e6d0 },
    schedule: [[7, 'taberna', 'barra'], [11, 'taberna', 'mesa2'], [13, 'taberna', 'barra'], [17, 'taberna', 'chimenea'], [19, 'taberna', 'barra']] },
  guardia: { name: 'Iván', role: 'Guardia de entrada', home: 'aldea', icon: '🛡', look: { shirt: 0x3e5f8a, pants: 0x4a4a52, hat: 'helmet', hatColor: 0x9aa1aa, extra: ['armor'], weapon: 'spear' },
    schedule: [[6, 'aldea', 'puente'], [20, 'castillo', 'porton']] },
  capitan: { name: 'Leandro', role: 'Capitán', home: 'castillo', icon: '⚔', look: { shirt: 0x8a2a2a, pants: 0x3a3a42, hat: 'plume', hatColor: 0xb8bec6, extra: ['armor', 'cape'], extraColor: 0x8a2a2a, beard: true, hair: 0x5a4a3a, weapon: 'sword', h: 1.05 },
    schedule: [[6, 'castillo', 'patio'], [18, 'trono', 'capitan'], [22, 'castillo', 'cuartel']] },
  rey: { name: 'Rey Alberto', role: 'Rey', home: 'trono', icon: '👑', look: { shirt: 0x7a2a8a, pants: 0x4a2a5a, hat: 'crown', extra: ['cape', 'belt'], extraColor: 0xc0392b, beard: true, hair: 0xd8d0c0, h: 1.04 },
    schedule: [[0, 'trono', 'trono']] },
  reina: { name: 'Reina Isolda', role: 'Reina', home: 'trono', icon: '👸', look: { shirt: 0x3e7a9a, pants: 0x2e5a7a, hat: 'tiara', hairStyle: 'long', hair: 0xe0c070, dress: true, extra: ['cape'], extraColor: 0x2e4a7a },
    schedule: [[0, 'trono', 'reina'], [13, 'castillo', 'jardin'], [17, 'trono', 'reina']] },
  curandera: { name: 'Mirta', role: 'Curandera', home: 'curandera', icon: '🌿', look: { shirt: 0x5a7a4a, pants: 0x4a5a3a, hat: 'hood', hatColor: 0x3a5a3a, dress: true, hair: 0xb0b0b0, h: 0.94, weapon: 'staff' },
    schedule: [[6, 'aldea', 'huerta'], [10, 'curandera', 'caldero'], [15, 'curandera', 'estante'], [18, 'curandera', 'caldero']] },
  bibliotecaria: { name: 'Elena', role: 'Bibliotecaria', home: 'biblioteca', icon: '📚', look: { shirt: 0x4a3a6a, pants: 0x3a2a4a, hairStyle: 'bun', hair: 0x3a2a1a, extra: ['glasses', 'scarf'], extraColor: 0xc0a040, dress: true, weapon: 'book' },
    schedule: [[7, 'biblioteca', 'atril'], [12, 'biblioteca', 'estantes'], [15, 'biblioteca', 'atril'], [19, 'biblioteca', 'mesa']] },
  mercader: { name: 'Fermín', role: 'Mercader', home: 'aldea', icon: '💰', look: { shirt: 0xc08a2a, pants: 0x5a3a2a, hat: 'wide', hatColor: 0x6a2a2a, extra: ['sash', 'belt'], extraColor: 0x2a6a4a, w: 1.15, beard: true, hair: 0x3a2a1a },
    schedule: [[7, 'aldea', 'mercado'], [19, 'taberna', 'mesa2'], [23, 'aldea', 'mercado']] },
  campesino: { name: 'Ramón', role: 'Campesino', home: 'campos', icon: '🌾', look: { shirt: 0x8a9a5a, pants: 0x6a5a3a, hat: 'straw', hair: 0x6a4a2a, beard: true, h: 0.98 },
    schedule: [[6, 'campos', 'campo'], [12, 'campos', 'corral'], [15, 'campos', 'campo'], [19, 'campos', 'camino']] },
  aprendiz: { name: 'Lucas', role: 'Aprendiz', home: 'herreria', icon: '🔨', look: { shirt: 0x6a7a8a, pants: 0x4a4a3a, hat: 'cap', hatColor: 0x8a5a2a, h: 0.86, w: 0.92, extra: ['apron'], extraColor: 0x5a4a3a },
    schedule: [[8, 'herreria', 'fuelle'], [17, 'aldea', 'banco'], [21, 'herreria', 'mostrador']] },
  viajero: { name: 'Saúl', role: 'Viajero', home: 'aldea', icon: '🎒', look: { shirt: 0x7a6a4a, pants: 0x4a3a2a, hat: 'bandana', hatColor: 0x2a6a8a, extra: ['pack', 'scarf'], extraColor: 0x2a6a8a, weapon: 'staff', hair: 0x2a1a10 },
    schedule: [[0, 'aldea', 'pozo']] },
  // personajes de misión (no cuentan entre los 12 roles)
  tomas: { name: 'Tomás', role: 'Aldeano', home: 'aldea', icon: '🧑', extra: true, look: { shirt: 0x9a7a5a, pants: 0x5a4a3a, hair: 0x8a5a2a, hat: 'kerchief', hatColor: 0x6a8a3a },
    schedule: [[0, 'aldea', 'casaTomas']] },
  guardia_real1: { name: 'Guardia real', role: 'Guardia real', home: 'trono', icon: '🛡', extra: true, look: { shirt: 0x7a2a2a, pants: 0x3a3a42, hat: 'helmet', hatColor: 0xc8a040, extra: ['armor'], weapon: 'spear' }, schedule: [[0, 'trono', 'guardiaI']] },
  guardia_real2: { name: 'Guardia real', role: 'Guardia real', home: 'trono', icon: '🛡', extra: true, look: { shirt: 0x7a2a2a, pants: 0x3a3a42, hat: 'helmet', hatColor: 0xc8a040, extra: ['armor'], weapon: 'spear' }, schedule: [[0, 'trono', 'guardiaD']] },
};
export const ROLES = ['herrero', 'tabernera', 'guardia', 'capitan', 'rey', 'reina', 'curandera', 'bibliotecaria', 'mercader', 'campesino', 'aprendiz', 'viajero'];

/** siguiente escena en el camino de `from` a `to` (BFS en el grafo zona/interior) */
export function nextHop(from, to) {
  if (from === to) return to;
  const nbr = s => { const out = []; if (PARENT[s]) out.push(PARENT[s]); for (const k in PARENT) if (PARENT[k] === s) out.push(k); (LINKS[s] || []).forEach(z => out.push(z)); return out; };
  const prev = { [from]: '' }, q = [from];
  while (q.length) { const s = q.shift(); if (s === to) break; for (const n of nbr(s)) if (!(n in prev)) { prev[n] = s; q.push(n); } }
  if (!(to in prev)) return to;
  let c = to; while (prev[c] && prev[c] !== from) c = prev[c];
  return c;
}

const _v = new THREE.Vector3();
/**
 * @param {any} G contexto del juego (escena actual, jugador, guardado, calidad, etc.)
 */
export function createNPCs(G) {
  const root = new THREE.Group(); root.name = 'npcs'; G.scene.add(root);
  /** @type {Record<string, any>} */
  const list = {};
  const markGeo = { bang: new THREE.BoxGeometry(0.14, 0.42, 0.14), dot: new THREE.BoxGeometry(0.14, 0.14, 0.14), q: new THREE.OctahedronGeometry(0.2, 0) };
  for (const id in NPC_DEFS) {
    const def = NPC_DEFS[id];
    const rig = makeHumanoid(G.mats, def.look);
    const mark = new THREE.Group();
    const m1 = new THREE.Mesh(markGeo.bang, G.mats.marker); m1.position.y = 0.28; const m2 = new THREE.Mesh(markGeo.dot, G.mats.marker); m2.position.y = -0.1;
    const m3 = new THREE.Mesh(markGeo.q, G.mats.markerTurn);
    mark.add(m1, m2, m3); mark.position.y = 2.55 * (def.look.h || 1); rig.root.add(mark);
    const blob = new THREE.Mesh(G.blobGeo, G.mats.blob); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; rig.root.add(blob);
    root.add(rig.root);
    list[id] = {
      id, def, rig, mark, m1, m2, m3, scene: '', x: 0, z: 0, ry: 0, state: 'idle', anim: 'idle',
      path: /** @type {number[]|null} */ (null), pathI: 0, goalScene: '', goalAnchor: '', goal: [0, 0], speed: 0, lowAcc: 0,
      stuck: 0, lastD: 0, greetT: 0, talking: false, marker: 'none', sleeping: false, hop: '', wait: 0,
    };
  }
  const P = () => G.player;

  /** destino (escena, ancla) según la hora y el progreso */
  function goalOf(n) {
    const ov = G.npcOverride(n.id);
    if (ov) return ov;
    const h = G.hour(), sc = n.def.schedule;
    let cur = sc[sc.length - 1];
    for (const e of sc) if (h >= e[0]) cur = e;
    return { scene: cur[1], anchor: cur[2] };
  }
  /** coloca al NPC directamente en su destino (lejanos y al cargar) */
  function snap(n) {
    const g = goalOf(n);
    n.scene = g.scene; n.goalScene = g.scene; n.goalAnchor = g.anchor; n.sleeping = !!g.sleep;
    const a = G.anchorOf(g.scene, g.anchor) || [0, 0];
    n.x = a[0]; n.z = a[1]; n.goal = a; n.path = null; n.state = 'idle'; n.speed = 0; n.hop = '';
  }
  function placeAll() { for (const id in list) snap(list[id]); refreshVisibility(); }
  function refreshVisibility() {
    const sid = G.sceneId();
    for (const id in list) { const n = list[id]; n.rig.root.visible = n.scene === sid; if (n.rig.root.visible) { n.rig.root.position.set(n.x, 0, n.z); n.rig.root.rotation.y = n.ry; } }
  }
  /** al cambiar de escena: los que están en la nueva escena caminan desde su lugar actual; los demás se ubican según la agenda */
  function onSceneLoaded() {
    for (const id in list) { const n = list[id]; snap(n); n.talking = false; n.rig.root.rotation.y = n.ry; }
    refreshVisibility();
  }

  let farAcc = 0;
  /** @param {number} dt */
  function update(dt) {
    const sid = G.sceneId(), scn = G.scn(), q = G.qual(), p = P();
    farAcc += dt;
    const farStep = 1 / q.farNpcHz;
    const doFar = farAcc >= farStep; if (doFar) farAcc = 0;
    for (const id in list) {
      const n = list[id];
      n.marker = G.npcMarker(id);
      if (n.scene !== sid) {
        // fuera del área activa: agenda a baja frecuencia (sin IA ni animación)
        if (doFar) { const g = goalOf(n); if (g.scene !== n.scene || g.anchor !== n.goalAnchor) { snap(n); if (n.scene === sid) { n.rig.root.visible = true; n.rig.root.position.set(n.x, 0, n.z); } } }
        continue;
      }
      const dx = p.x - n.x, dz = p.z - n.z, dist = Math.hypot(dx, dz);
      // lejos dentro del área activa: IA a 4 Hz
      let step = dt;
      if (dist > q.nearNpcR) { n.lowAcc += dt; if (n.lowAcc < 0.25) continue; step = n.lowAcc; n.lowAcc = 0; }
      think(n, step, dist, dx, dz, scn);
      // presentación
      const R = n.rig;
      R.root.position.set(n.x, 0, n.z);
      let d = n.ry - R.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      R.root.rotation.y += d * Math.min(1, step * 8);
      animateRig(R, step, n.speed, n.talking ? 'talk' : n.sleeping ? 'sleep' : n.state === 'walk' ? 'walk' : 'idle');
      R.body.rotation.z = n.sleeping ? 0.08 : 0;
      n.mark.visible = n.marker !== 'none' && !n.talking;
      n.m1.visible = n.m2.visible = n.marker === 'available'; n.m3.visible = n.marker === 'turnIn';
      if (n.mark.visible) { n.mark.rotation.y += step * 2; n.mark.position.y = 2.55 * (n.def.look.h || 1) + Math.sin(G.time() * 3 + n.rig.phase) * 0.08; }
    }
  }

  function think(n, dt, dist, dx, dz, scn) {
    n.greetT -= dt;
    if (n.talking) { n.state = 'talk'; n.speed = 0; n.ry = Math.atan2(dx, dz); return; }
    const g = goalOf(n);
    n.sleeping = !!g.sleep;
    // ¿cambió el destino? si es otra escena, camina hacia la salida que lleva hacia allá
    if (g.scene !== n.goalScene || g.anchor !== n.goalAnchor || !n.path && n.state === 'walk') {
      n.goalScene = g.scene; n.goalAnchor = g.anchor;
      let tgt;
      if (g.scene === n.scene) { tgt = G.anchorOf(n.scene, g.anchor); n.hop = ''; }
      else { n.hop = nextHop(n.scene, g.scene); tgt = G.exitToward(n.scene, n.hop); }
      if (tgt) { n.goal = tgt; n.path = scn.nav ? scn.nav.path(n.x, n.z, tgt[0], tgt[1]) : null; n.pathI = 0; n.state = n.path ? 'walk' : 'idle'; n.stuck = 0; }
    }
    // marcadores de misión: se queda en su puesto y mira al jugador
    const quest = n.marker === 'available' ? 'questAvailable' : n.marker === 'turnIn' ? 'questTurnIn' : '';
    if (n.state === 'walk' && n.path) {
      // proximidad: si el jugador está justo delante, espera
      const px = n.path[n.pathI * 2], pz = n.path[n.pathI * 2 + 1];
      let mx = px - n.x, mz = pz - n.z; const ml = Math.hypot(mx, mz);
      const ahead = dist < 1.3 && (dx * mx + dz * mz) > 0;
      if (ahead) { n.speed = 0; n.wait += dt; if (n.wait > 4) { n.wait = 0; } n.ry = Math.atan2(dx, dz); return; }
      n.wait = 0;
      if (ml < 0.25) {
        n.pathI++;
        if (n.pathI * 2 >= n.path.length) { arrive(n); return; }
        return;
      }
      mx /= ml; mz /= ml;
      const sp = n.id === 'rey' ? 1.2 : 1.7;
      const bx = n.x, bz = n.z;
      const pos = { x: n.x, z: n.z };
      moveCircle(scn.cols, pos, 0.32, mx * sp * dt, mz * sp * dt);
      n.x = pos.x; n.z = pos.z;
      const moved = Math.hypot(n.x - bx, n.z - bz);
      n.speed = moved / Math.max(dt, 1e-4);
      n.ry = Math.atan2(mx, mz);
      if (moved < sp * dt * 0.2) { n.stuck += dt; if (n.stuck > 2.5) { // trabado: recalcula o salta al destino si el jugador no mira
        n.stuck = 0; const tgt = n.goal; n.path = scn.nav ? scn.nav.path(n.x, n.z, tgt[0], tgt[1]) : null; n.pathI = 0;
        if (!n.path || dist > 12) { n.x = tgt[0]; n.z = tgt[1]; arrive(n); }
      } } else n.stuck = 0;
      return;
    }
    n.speed = 0;
    n.state = quest || 'idle';
    // orientación al jugador cuando está cerca; saludo al acercarse
    if (dist < 4.5 && !n.sleeping) {
      n.ry = Math.atan2(dx, dz);
      if (dist < 3.2 && n.greetT <= 0 && G.canBubble()) { n.greetT = 25; G.bubble(n.id); }
    }
  }
  function arrive(n) {
    n.path = null; n.speed = 0; n.state = 'idle';
    if (n.hop) {
      // cruza a la escena siguiente (fuera del área activa): desde ahí sigue su agenda a baja frecuencia
      n.scene = n.hop; n.hop = ''; n.goalScene = ''; n.goalAnchor = '';
      n.rig.root.visible = false;
    }
  }

  return {
    list, root, placeAll, onSceneLoaded, update, refreshVisibility,
    /** NPC visibles en la escena activa (para interacción) */
    inScene: () => Object.values(list).filter(n => n.scene === G.sceneId()),
    get(id) { return list[id]; },
    setTalking(id, v) { const n = list[id]; if (n) { n.talking = v; if (v) { n.path = null; n.state = 'talk'; n.goalScene = ''; } else n.state = 'idle'; } },
    snap(id) { const n = list[id]; if (n) { snap(n); refreshVisibility(); } },
    worldPos(id, out = _v) { const n = list[id]; return out.set(n.x, 0, n.z); },
    dispose() { Object.values(markGeo).forEach(g => g.dispose()); },
  };
}
