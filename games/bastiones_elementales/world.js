// @ts-check
/* Bastiones Elementales — construcción del escenario (terreno, río, decoración, plataformas, cristales, palancas, puentes)
   y navegación de los enemigos (campo de flujo BFS sobre la grilla, recalculado al mover un puente). */
import * as THREE from 'three';
import { TILE, COLS, ROWS, AUX } from './config.js';
import * as M from './models.js';
import { rng } from '../../matelabs/kit3d.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const WALK = new Set(['#', 'S', 'C']);
const BRIDGE_CH = { '1': [0, 0], '2': [0, 1], '3': [1, 0], '4': [1, 1] };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export const toWorld = (c, r) => ({ x: (c - (COLS - 1) / 2) * TILE, z: (r - (ROWS - 1) / 2) * TILE });
export const tileOf = (x, z) => ({ c: Math.round(x / TILE + (COLS - 1) / 2), r: Math.round(z / TILE + (ROWS - 1) / 2) });

/** @param {any} ctx @param {any} def definición del mapa (config.MAPS[i]) */
export function buildWorld(ctx, def) {
  const { scene, mats } = ctx;
  const q = ctx.qcfg;
  const root = new THREE.Group(); root.name = 'mundo'; scene.add(root);
  const R = rng(def.id.length * 977 + 3);
  const grid = def.grid.map(/** @param {string} row */ row => row.split(''));
  const ch = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? ' ' : grid[r][c];
  /** @type {THREE.Material[]} */ const ownMats = [];
  /** @type {THREE.BufferGeometry[]} */ const ownGeos = [];
  const own = (/** @type {any} */ x) => { if (x.isMaterial) ownMats.push(x); else ownGeos.push(x); return x; };

  /* ---------- parseo ---------- */
  const pads = [], spawns = [], aux = [], levers = [];
  /** @type {any} */ let crystal = null;
  /** @type {{i:number,state:number,tiles:number[][][],decks:THREE.Group[],anim:number,lock:number,cool:number}[]} */
  const bridges = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = grid[r][c], w = toWorld(c, r);
    if (k === 'P') pads.push({ i: pads.length, c, r, x: w.x, z: w.z, tower: /** @type {any} */ (null) });
    else if (k === 'S') spawns.push({ i: spawns.length, c, r, x: w.x, z: w.z });
    else if (k === 'C') crystal = { c, r, x: w.x, z: w.z };
    else if (k === 'a') aux.push({ i: aux.length, c, r, x: w.x, z: w.z, hp: AUX.hp, max: AUX.hp, charge: 0.4, alive: true, threat: 0, hitT: 0, lost: false });
    else if (k === 'L' || k === 'M') levers.push({ i: levers.length, c, r, x: w.x, z: w.z, bridge: k === 'L' ? 0 : 1, cool: 0, pulse: 0 });
    else if (k in BRIDGE_CH) {
      const [bi, st] = /** @type {any} */ (BRIDGE_CH)[k];
      while (bridges.length <= bi) bridges.push({ i: bridges.length, state: 0, tiles: [[], []], decks: [], anim: 0, lock: 0, cool: 0 });
      bridges[bi].tiles[st].push([c, r]);
    }
  }
  levers.sort((a, b) => a.bridge - b.bridge);
  const isWater = (c, r) => { const k = ch(c, r); return k === '~' || k in BRIDGE_CH; };

  /* ---------- terreno (una geometría) ---------- */
  const tb = new M.GeoBuilder(def.id.length);
  const gA = new THREE.Color(def.ground), gB = new THREE.Color(def.ground2), pc = new THREE.Color(def.path);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = grid[r][c], w = toWorld(c, r);
    if (isWater(c, r)) {
      tb.box(w.x, -1.25, w.z, TILE, 0.5, TILE, new THREE.Color(def.waterE).lerp(new THREE.Color(0x222222), 0.5).getHex());
      continue;
    }
    if (WALK.has(k)) {
      _c.copy(pc).multiplyScalar(0.94 + R() * 0.12);
      tb.box(w.x, -0.4, w.z, TILE, 0.68, TILE, _c.getHex());
      // bordes de piedritas
      if (R() < 0.5) tb.box(w.x + (R() - 0.5) * 1.4, -0.03, w.z + (R() - 0.5) * 1.4, 0.18, 0.08, 0.14, _c.clone().multiplyScalar(0.8).getHex());
    } else {
      _c.copy((c + r) % 2 ? gA : gB).lerp(gA, R() * 0.5).multiplyScalar(0.95 + R() * 0.1);
      tb.box(w.x, -0.3, w.z, TILE, 0.6 + R() * 0.04, TILE, _c.getHex());
    }
  }
  // zócalo del diorama
  const W2 = COLS * TILE, H2 = ROWS * TILE;
  tb.box(0, -1.8, 0, W2 + 0.4, 2.4, H2 + 0.4, new THREE.Color(def.ground2).multiplyScalar(0.55).getHex());
  const terrainGeo = own(tb.build());
  const terrain = new THREE.Mesh(terrainGeo, mats.solid); terrain.receiveShadow = true; terrain.name = 'terreno';
  root.add(terrain);
  // llanura exterior (más baja) para que el borde no sea vacío
  const outerMat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(def.ground2).multiplyScalar(0.8), roughness: 1, flatShading: true }));
  const outer = new THREE.Mesh(own(new THREE.CircleGeometry(150, 24)), outerMat); outer.rotation.x = -Math.PI / 2; outer.position.y = -2.9; outer.receiveShadow = true;
  root.add(outer);

  /* ---------- agua / lava ---------- */
  const wb = [];
  let wMinC = 99, wMaxC = -1, wMinR = 99, wMaxR = -1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (isWater(c, r)) {
    const w = toWorld(c, r), g = new THREE.PlaneGeometry(TILE, TILE); g.rotateX(-Math.PI / 2); g.translate(w.x, 0, w.z); wb.push(g);
    wMinC = Math.min(wMinC, c); wMaxC = Math.max(wMaxC, c); wMinR = Math.min(wMinR, r); wMaxR = Math.max(wMaxR, r);
  }
  const lava = def.id === 'lava';
  const waterMat = own(new THREE.MeshStandardMaterial({ color: def.water, emissive: def.waterE, emissiveIntensity: lava ? 1.4 : 0.25, roughness: lava ? 0.7 : 0.15, metalness: lava ? 0 : 0.2, transparent: !lava, opacity: lava ? 1 : 0.86, flatShading: true }));
  const waterGeo = own(mergeGeometries(wb, false)); wb.forEach(g => g.dispose());
  const water = new THREE.Mesh(waterGeo, waterMat); water.position.y = -0.5; root.add(water);
  // témpanos / costra de lava / espuma flotando a lo largo del río
  const alongZ = (wMaxR - wMinR) >= (wMaxC - wMinC);
  const floeGeo = own(new THREE.BoxGeometry(0.7, 0.12, 0.5));
  const floeMat = own(new THREE.MeshStandardMaterial({ color: lava ? 0x2a1a16 : def.id === 'glacial' ? 0xeaf6ff : 0xdfeff8, roughness: 0.6, flatShading: true }));
  const FLOES = q.waterAnim ? 14 : 6;
  const floes = new THREE.InstancedMesh(floeGeo, floeMat, FLOES); floes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const floeData = Array.from({ length: FLOES }, (_, i) => ({ u: R(), lane: R(), s: 0.6 + R() * 0.8, v: 0.03 + R() * 0.03, ry: R() * 6 }));
  root.add(floes);
  const span = alongZ ? { a: toWorld(0, wMinR - 0.5).z, b: toWorld(0, wMaxR + 0.5).z, l0: toWorld(wMinC, 0).x - 0.6, l1: toWorld(wMaxC, 0).x + 0.6 }
    : { a: toWorld(wMinC - 0.5, 0).x, b: toWorld(wMaxC + 0.5, 0).x, l0: toWorld(0, wMinR).z - 0.6, l1: toWorld(0, wMaxR).z + 0.6 };

  /* ---------- decoración instanciada ---------- */
  const decorKinds = def.decor === 'pino' ? { big: 'pino', rock: 'roca', small: ['hielo', 'nieve'] }
    : def.decor === 'obsidiana' ? { big: 'obsidiana', rock: 'roca_lava', small: ['brasa', 'roca_lava'] }
      : { big: 'roble', rock: 'menhir', small: ['hierba', 'roca'] };
  /** @type {Record<string, {x:number,z:number,s:number,ry:number,y:number}[]>} */
  const placements = {};
  const put = (kind, x, z, s, y = 0) => { (placements[kind] = placements[kind] || []).push({ x, z, s, ry: R() * Math.PI * 2, y }); };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = grid[r][c], w = toWorld(c, r);
    if (k === 'T') { put(decorKinds.big, w.x + (R() - 0.5) * 0.5, w.z + (R() - 0.5) * 0.5, 0.9 + R() * 0.4); if (R() < q.decor) put(decorKinds.small[0], w.x + 0.7, w.z - 0.6, 0.8); }
    else if (k === 'R') put(decorKinds.rock, w.x, w.z, 1.1 + R() * 0.4);
    else if (k === '.' && R() < q.decor * 0.42) {
      const kind = R() < 0.65 ? decorKinds.small[(R() * 2) | 0] : (R() < 0.5 ? decorKinds.rock : decorKinds.big);
      const big = kind === decorKinds.big;
      put(kind, w.x + (R() - 0.5) * 1.1, w.z + (R() - 0.5) * 1.1, big ? 0.65 + R() * 0.3 : 0.7 + R() * 0.5);
    }
  }
  // llanura exterior
  const outerN = Math.round(90 * q.decor);
  for (let i = 0; i < outerN; i++) {
    const a = R() * Math.PI * 2, d = 0.5 + R();
    const x = Math.cos(a) * (W2 / 2 + 3 + d * 22), z = Math.sin(a) * (H2 / 2 + 3 + d * 18);
    put(R() < 0.7 ? decorKinds.big : decorKinds.rock, x, z, 1 + R() * 0.9, -2.9);
  }
  /** @type {THREE.InstancedMesh[]} */ const decor = [];
  for (const kind in placements) {
    const list = placements[kind], geo = own(M.buildDecor(kind));
    const im = new THREE.InstancedMesh(geo, mats.solid, list.length);
    list.forEach((p, i) => { _q.setFromEuler(_e.set(0, p.ry, 0)); im.setMatrixAt(i, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(p.s))); });
    im.castShadow = kind === decorKinds.big; im.receiveShadow = true; im.name = 'decor:' + kind;
    root.add(im); decor.push(im);
  }

  /* ---------- plataformas ---------- */
  const padGeo = own(M.buildPad()), runeGeo = own(M.buildPadRune());
  const padMesh = new THREE.InstancedMesh(padGeo, mats.solid, pads.length); padMesh.receiveShadow = true; padMesh.castShadow = true;
  const runeMat = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
  const runeMesh = new THREE.InstancedMesh(runeGeo, runeMat, pads.length);
  pads.forEach((p, i) => { padMesh.setMatrixAt(i, _m.makeTranslation(p.x, 0, p.z)); runeMesh.setMatrixAt(i, _m.makeTranslation(p.x, 0, p.z)); runeMesh.setColorAt(i, _c.set(0x8f7bff)); });
  root.add(padMesh, runeMesh);

  /* ---------- cristal principal ---------- */
  const mc = M.buildMainCrystal();
  const crystalMat = own(new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x5a3cff, emissiveIntensity: 0.55, roughness: 0.18, metalness: 0.3, flatShading: true }));
  crystal.group = new THREE.Group(); crystal.group.position.set(crystal.x, 0, crystal.z);
  const ped = new THREE.Mesh(own(mc.pedestal), mats.solid); ped.castShadow = true; ped.receiveShadow = true;
  crystal.core = new THREE.Mesh(own(mc.core), crystalMat); crystal.core.castShadow = true;
  crystal.mat = crystalMat;
  const orbitGeo = own(new THREE.TorusGeometry(1.9, 0.05, 6, 40));
  crystal.orbit = new THREE.Mesh(orbitGeo, own(new THREE.MeshBasicMaterial({ color: 0xb9a8ff, toneMapped: false, transparent: true, opacity: 0.7 })));
  crystal.orbit.position.y = 2.2; crystal.orbit.rotation.x = Math.PI / 2;
  crystal.group.add(ped, crystal.core, crystal.orbit); root.add(crystal.group);

  /* ---------- cristales auxiliares ---------- */
  const ag = M.buildAuxCrystal();
  const auxPed = own(ag.pedestal), auxCore = own(ag.core), auxShards = own(ag.shards);
  const ringGeo = own(new THREE.RingGeometry(0.95, 1.15, 32)); ringGeo.rotateX(-Math.PI / 2);
  for (const a of aux) {
    a.group = new THREE.Group(); a.group.position.set(a.x, 0, a.z);
    a.mat = own(new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x20c890, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.25, flatShading: true }));
    a.core = new THREE.Mesh(auxCore, a.mat); a.core.castShadow = true;
    a.shards = new THREE.Mesh(auxShards, mats.solid); a.shards.visible = false;
    a.ringMat = own(new THREE.MeshBasicMaterial({ color: 0x7dffd0, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
    a.ring = new THREE.Mesh(ringGeo, a.ringMat); a.ring.position.y = 0.33;
    const p = new THREE.Mesh(auxPed, mats.solid); p.receiveShadow = true;
    a.group.add(p, a.core, a.shards, a.ring); root.add(a.group);
  }

  /* ---------- palancas ---------- */
  const lg = M.buildLever();
  const leverBase = own(lg.base), leverHandle = own(lg.handle);
  for (const l of levers) {
    l.group = new THREE.Group(); l.group.position.set(l.x, 0, l.z);
    const base = new THREE.Mesh(leverBase, mats.solid); base.castShadow = true;
    l.pivot = new THREE.Group(); l.pivot.position.y = 0.62;
    l.handle = new THREE.Mesh(leverHandle, mats.solid); l.handle.castShadow = true; l.pivot.add(l.handle);
    l.ringMat = own(new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
    l.ring = new THREE.Mesh(ringGeo, l.ringMat); l.ring.position.y = 0.05; l.ring.scale.setScalar(0.9);
    l.group.add(base, l.pivot, l.ring); root.add(l.group);
  }

  /* ---------- puentes ---------- */
  const postGeo = own(M.buildBridgePost());
  for (const b of bridges) {
    for (let st = 0; st < 2; st++) {
      const tiles = b.tiles[st];
      const cs = tiles.map(t => t[0]), rs = tiles.map(t => t[1]);
      const horiz = new Set(rs).size === 1; // tablones a lo largo de X (el río corre en Z)
      const n = tiles.length, len = n * TILE;
      const deckGeo = own(M.buildBridgeDeck(len));
      const a = toWorld(Math.min(...cs), Math.min(...rs)), z1 = toWorld(Math.max(...cs), Math.max(...rs));
      const cx = (a.x + z1.x) / 2, cz = (a.z + z1.z) / 2;
      // bisagra en un extremo: el tablero gira hacia arriba alrededor de ella
      const hinge = new THREE.Group();
      if (horiz) { hinge.position.set(cx - len / 2, -0.05, cz); } else { hinge.position.set(cx, -0.05, cz - len / 2); hinge.rotation.y = -Math.PI / 2; }
      const deck = new THREE.Mesh(deckGeo, mats.solid); deck.position.x = len / 2; deck.castShadow = true; deck.receiveShadow = true;
      hinge.add(deck);
      const end = new THREE.Group(); end.position.copy(hinge.position); end.rotation.y = hinge.rotation.y;
      for (const [px, pz] of [[-0.3, 1.15], [-0.3, -1.15], [len + 0.3, 1.15], [len + 0.3, -1.15]]) {
        const p = new THREE.Mesh(postGeo, mats.solid); p.position.set(px, 0, pz); p.castShadow = true; end.add(p);
      }
      root.add(hinge, end);
      b.decks.push(/** @type {any} */ ({ hinge, deck }));
    }
  }

  /* ---------- portales ---------- */
  const pg = M.buildPortal();
  const portalGeo = own(pg.frame), swirlGeo = own(pg.swirl);
  const swirlMat = own(new THREE.MeshBasicMaterial({ color: 0xff5a8a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
  for (const s of spawns) {
    s.group = new THREE.Group(); s.group.position.set(s.x, 0, s.z);
    // el portal mira hacia el primer tramo de camino
    let best = null;
    for (const [dc, dr] of DIRS) if (WALK.has(ch(s.c + dc, s.r + dr))) best = [dc, dr];
    if (best) s.group.rotation.y = Math.atan2(best[0], best[1]);
    const f = new THREE.Mesh(portalGeo, mats.solid); f.castShadow = true;
    s.swirl = new THREE.Mesh(swirlGeo, swirlMat);
    s.group.add(f, s.swirl); root.add(s.group);
  }

  /* ---------- flechas de ruta ---------- */
  const chevGeo = own(new THREE.BufferGeometry());
  chevGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.42, 0, -0.18, 0, 0, 0.32, 0.42, 0, -0.18, -0.42, 0, -0.18, 0.42, 0, -0.18, 0, 0, 0.02]), 3));
  chevGeo.setIndex([0, 1, 5, 5, 1, 2]); // punta de flecha en V
  const chevMat = own(new THREE.MeshBasicMaterial({ color: 0xfff4d0, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  const walkTiles = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (WALK.has(grid[r][c]) || grid[r][c] in BRIDGE_CH) walkTiles.push([c, r]);
  const chev = new THREE.InstancedMesh(chevGeo, chevMat, walkTiles.length); chev.renderOrder = 2;
  root.add(chev);

  /* ---------- luces del mapa ---------- */
  /** @type {THREE.PointLight[]} */ const lights = [];
  if (q.lights > 0) {
    const pl = new THREE.PointLight(0x9a7bff, 18, 14, 1.6); pl.position.set(crystal.x, 3.5, crystal.z); root.add(pl); lights.push(pl);
    if (q.lights > 1) for (const s of spawns.slice(0, q.lights - 1)) { const l = new THREE.PointLight(0xff5a8a, 10, 10, 1.6); l.position.set(s.x, 2, s.z); root.add(l); lights.push(l); }
    if (q.lights > 2) for (const a of aux.slice(0, q.lights - 2)) { const l = new THREE.PointLight(0x5affc0, 6, 8, 1.6); l.position.set(a.x, 2, a.z); root.add(l); lights.push(l); }
  }

  /* ---------- navegación ---------- */
  const dist = new Int16Array(COLS * ROWS);
  const bridgeAt = new Map(); // "c,r" -> [bridge, state]
  bridges.forEach(b => b.tiles.forEach((ts, st) => ts.forEach(([c, r]) => bridgeAt.set(c + ',' + r, [b.i, st]))));
  /** @param {number} c @param {number} r @param {number[]} [states] estados hipotéticos de los puentes */
  function walkable(c, r, states) {
    const k = ch(c, r);
    if (WALK.has(k)) return true;
    const bt = bridgeAt.get(c + ',' + r);
    if (!bt) return false;
    const st = states ? states[bt[0]] : bridges[bt[0]].state;
    return st === bt[1];
  }
  /** BFS desde el cristal. Devuelve si todos los spawns quedan conectados. @param {Int16Array} out @param {number[]} [states] */
  function bfs(out, states) {
    out.fill(-1);
    const qq = [crystal.c, crystal.r]; out[crystal.r * COLS + crystal.c] = 0;
    for (let h = 0; h < qq.length; h += 2) {
      const c = qq[h], r = qq[h + 1], d = out[r * COLS + c];
      for (const [dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || out[nr * COLS + nc] !== -1 || !walkable(nc, nr, states)) continue;
        out[nr * COLS + nc] = d + 1; qq.push(nc, nr);
      }
    }
    return spawns.every(s => out[s.r * COLS + s.c] > 0);
  }
  const tmpDist = new Int16Array(COLS * ROWS);
  function computeFlow() {
    bfs(dist);
    // flechas
    let n = 0;
    for (const [c, r] of walkTiles) {
      const d = dist[r * COLS + c];
      if (d <= 0) continue;
      const nx = next(c, r); if (!nx) continue;
      const w = toWorld(c, r);
      _q.setFromEuler(_e.set(0, Math.atan2(nx.c - c, nx.r - r), 0));
      chev.setMatrixAt(n++, _m.compose(_p.set(w.x, 0.02, w.z), _q, _s.set(1, 1, 1)));
    }
    chev.count = n; chev.instanceMatrix.needsUpdate = true;
  }
  /** Siguiente baldosa hacia el cristal (prefiere seguir derecho). */
  function next(c, r, pdc = 0, pdr = 0) {
    const d = dist[r * COLS + c];
    if (d <= 0) return null;
    let best = null, bd = d;
    for (const [dc, dr] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const nd = dist[nr * COLS + nc];
      if (nd < 0) continue;
      if (nd < bd || (nd === bd - 0 && best && dc === pdc && dr === pdr && nd < d)) { bd = nd; best = { c: nc, r: nr }; }
    }
    return best;
  }
  /** ¿Se puede poner el puente i en el estado st sin dejar a nadie sin camino? */
  function canSet(i, st) { const states = bridges.map(b => b.state); states[i] = st; return bfs(tmpDist, states); }
  function setBridge(i, st, instant = false) {
    const b = bridges[i]; if (!b || b.state === st) return false;
    b.state = st; b.anim = instant ? 0 : 1;
    computeFlow();
    if (instant) poseBridges(0);
    return true;
  }
  function poseBridges(dt) {
    for (const b of bridges) {
      if (b.anim > 0) b.anim = Math.max(0, b.anim - dt * 1.1);
      b.decks.forEach((/** @type {any} */ d, st) => {
        const open = st === b.state ? 0 : 1; // 1 = levantado
        const cur = d.k ?? open;
        const k = b.anim > 0 ? cur + (open - cur) * Math.min(1, dt * 3) : open;
        d.k = k;
        d.hinge.rotation.z = k * 1.15;
      });
    }
  }
  poseBridges(0);
  computeFlow();

  /* ---------- animación ---------- */
  let t = 0;
  function update(dt, reduced) {
    t += dt;
    poseBridges(dt);
    crystal.core.rotation.y += dt * 0.35;
    crystal.core.position.y = reduced ? 0 : Math.sin(t * 1.4) * 0.12;
    crystal.orbit.rotation.z += dt * 0.6;
    crystal.orbit.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.25;
    for (const s of spawns) { s.swirl.rotation.z += dt * 2.5; s.swirl.material.opacity = 0.55 + Math.sin(t * 3) * 0.15; }
    if (q.waterAnim) waterMat.emissiveIntensity = lava ? 1.2 + Math.sin(t * 1.7) * 0.35 : 0.22 + Math.sin(t * 1.3) * 0.06;
    const fl = q.waterAnim ? 1 : 0.4;
    floeData.forEach((f, i) => {
      f.u = (f.u + dt * f.v * fl) % 1;
      const along = span.a + (span.b - span.a) * f.u, lane = span.l0 + (span.l1 - span.l0) * f.lane;
      const x = alongZ ? lane : along, z = alongZ ? along : lane;
      _q.setFromEuler(_e.set(0, f.ry + t * 0.1, 0));
      floes.setMatrixAt(i, _m.compose(_p.set(x, -0.46 + Math.sin(t * 2 + i) * 0.03, z), _q, _s.set(f.s, 1, f.s)));
    });
    floes.instanceMatrix.needsUpdate = true;
    chevMat.opacity = 0.28 + Math.sin(t * 3) * 0.1;
    for (const a of aux) {
      if (!a.alive) continue;
      a.core.rotation.y += dt * 0.8;
      const ready = a.charge >= 1;
      a.mat.emissiveIntensity = ready ? 0.9 + Math.sin(t * 6) * 0.35 : 0.15 + a.charge * 0.35;
      a.core.position.y = ready && !reduced ? Math.abs(Math.sin(t * 4)) * 0.18 : 0;
      a.ring.scale.setScalar(0.6 + 0.4 * a.charge);
      const hr = a.hp / a.max;
      a.ringMat.color.setRGB(hr < 0.5 ? 1 : 0.5 + (1 - hr), hr < 0.5 ? hr * 1.6 : 1, hr > 0.6 ? 0.8 : 0.3);
      a.ringMat.opacity = a.hitT > 0 ? 0.95 : 0.55;
      a.hitT = Math.max(0, a.hitT - dt);
    }
    for (const l of levers) {
      const b = bridges[l.bridge];
      const target = b.state ? 0.65 : -0.65;
      l.pivot.rotation.z += (target - l.pivot.rotation.z) * Math.min(1, dt * 6);
      const ready = l.cool <= 0 && b.lock <= 0;
      l.ringMat.color.setHex(b.lock > 0 ? 0xff3a3a : ready ? 0xffd23a : 0x777777);
      l.ringMat.opacity = ready ? 0.45 + Math.sin(t * 4) * 0.2 : 0.35;
    }
  }

  function dispose() {
    root.removeFromParent();
    ownGeos.forEach(g => g.dispose()); ownMats.forEach(m => m.dispose());
    for (const im of [padMesh, runeMesh, chev, floes, ...decor]) im.dispose();
    lights.forEach(l => l.dispose());
  }

  return {
    def, root, grid, ch, pads, spawns, aux, levers, bridges, crystal, dist, lights, terrain,
    padMesh, runeMesh, chev, chevMat, decor,
    walkable, computeFlow, next, canSet, setBridge, update, dispose,
    distAt: (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS) ? -1 : dist[r * COLS + c],
    bounds: { x0: -W2 / 2, x1: W2 / 2, z0: -H2 / 2, z1: H2 / 2 },
  };
}
