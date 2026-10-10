// @ts-check
/* Arena: interpreta el mapa ASCII, arma la geometría (pisos y paredes fusionados, coberturas instanciadas,
   puertas, generadores, cajas, trampas...), y resuelve colisiones, raycast 3D por grilla y campo de flujo
   (Dijkstra) para que los mutantes encuentren al jugador rodeando paredes y puertas. */
import * as THREE from 'three';
import { ARENAS, CELL, WALL_H, QUALITY } from './config.js';
import * as M from './models.js';
import { rng } from '../../matelabs/kit3d.js';

export const T = { FLOOR: 0, WALL: 1, COVER: 2, DOOR: 3, TOXIC: 4, GRATE: 5, PROP: 6 };
const HALF = CELL / 2;

export function createMaterials() {
  return {
    vc: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.08 }),
    vcGlow: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.1, emissive: 0x222222 }),
    floor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 }),
  };
}

/** @param {any} ctx @param {number} idx */
export function buildArena(ctx, idx) {
  const def = ARENAS[idx], pal = def.palette;
  const q = QUALITY[ctx.quality] || QUALITY.medium;
  const cols = def.map[0].length, rows = def.map.length;
  const group = new THREE.Group(); group.name = 'arena';
  ctx.root.add(group);
  /** @type {any[]} */ const disposables = [];
  const own = (/** @type {any} */ x) => { disposables.push(x); return x; };
  const R = rng(1234 + idx * 77);

  const cx = (/** @type {number} */ c) => (c - cols / 2 + 0.5) * CELL;
  const cz = (/** @type {number} */ r) => (r - rows / 2 + 0.5) * CELL;
  const grid = new Uint8Array(cols * rows);
  /** referencia por celda (puerta, cobertura, etc.) */
  const ref = /** @type {any[]} */ (new Array(cols * rows).fill(null));
  const at = (/** @type {number} */ c, /** @type {number} */ r) => (c < 0 || r < 0 || c >= cols || r >= rows) ? '#' : def.map[r][c];

  const W = /** @type {any} */ ({
    idx, def, cols, rows, grid, ref, group, cx, cz,
    doors: [], gens: [], crates: [], traps: [], spawns: [], covers: [], props: 0,
    workbench: null, terminal: null, pad: null, exit: null, survivorPos: null, antidote: null, grate: null,
    pool: [], playerStart: new THREE.Vector3(), barricades: [], extraCost: new Float32Array(cols * rows),
    bounds: { minX: -cols * HALF, maxX: cols * HALF, minZ: -rows * HALF, maxZ: rows * HALF },
    lights: [],
  });
  const exitCells = [], padCells = [];
  /** @type {Record<string, number[][]>} */ const doorCells = {};
  /** @type {Record<string, number[]>} */ const genCells = {};

  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = def.map[r][c], i = r * cols + c;
    let t = T.FLOOR;
    if (ch === '#') t = T.WALL;
    else if (ch === 'o') t = T.COVER;
    else if (ch >= '1' && ch <= '9') { t = T.DOOR; (doorCells[ch] ||= []).push([c, r]); }
    else if (ch === '~') { t = T.TOXIC; W.pool.push([c, r]); }
    else if (ch === 'Z') t = T.GRATE;
    else if (ch >= 'a' && ch <= 'c') { t = T.PROP; genCells[ch] = [c, r]; }
    else if (ch === 'W' || ch === 'R' || ch === 'C') t = T.PROP;
    if (ch === 'X') exitCells.push([c, r]);
    if (ch === 'L') padCells.push([c, r]);
    grid[i] = t;
  }

  /* ---------- piso ---------- */
  {
    const pos = [], col = [], nor = [];
    const c0 = new THREE.Color(pal.floor[0]), c1 = new THREE.Color(pal.floor[1]), tmp = new THREE.Color();
    const stripe = new THREE.Color(0xd9a020), dark = new THREE.Color(0x151515);
    const quad = (x0, z0, x1, z1, y, color) => {
      pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      for (let k = 0; k < 6; k++) { nor.push(0, 1, 0); col.push(color.r, color.g, color.b); }
    };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ch = def.map[r][c]; if (ch === '#') continue;
      const x = cx(c), z = cz(r);
      tmp.copy((c + r) % 2 ? c0 : c1).multiplyScalar(0.9 + R() * 0.2);
      if (ch === '~') tmp.setHex(0x1c2a18);
      quad(x - HALF, z - HALF, x + HALF, z + HALF, 0, tmp);
      // juntas de baldosas
      quad(x - HALF, z - HALF, x + HALF, z - HALF + 0.05, 0.005, dark);
      quad(x - HALF, z - HALF, x - HALF + 0.05, z + HALF, 0.005, dark);
      if (ch === 'X' || ch === 'L' || (ch >= '1' && ch <= '9')) {
        for (let k = 0; k < 4; k++) quad(x - HALF + k * 0.5, z - HALF + 0.1, x - HALF + k * 0.5 + 0.22, z + HALF - 0.1, 0.01, stripe);
      }
    }
    // fondo exterior oscuro
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const floor = new THREE.Mesh(own(g), ctx.mats.floor); floor.receiveShadow = true; floor.name = 'piso';
    group.add(floor);
    const under = new THREE.Mesh(own(new THREE.PlaneGeometry(cols * CELL + 80, rows * CELL + 80)), own(new THREE.MeshBasicMaterial({ color: pal.sky })));
    under.rotation.x = -Math.PI / 2; under.position.y = -0.05; group.add(under);
  }

  /* ---------- paredes (una sola geometría) ---------- */
  {
    const gb = new M.GB();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (def.map[r][c] !== '#') continue;
      let edge = false;
      for (let dr = -1; dr <= 1 && !edge; dr++) for (let dc = -1; dc <= 1; dc++) { const ch = at(c + dc, r + dr); if (ch !== '#' && !(c + dc < 0 || r + dr < 0 || c + dc >= cols || r + dr >= rows)) { edge = true; break; } }
      const x = cx(c), z = cz(r);
      if (!edge) { gb.box(CELL, 0.2, CELL, pal.wall2, [x, WALL_H - 0.1, z]); continue; }
      const h = WALL_H + (idx === 1 && (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) ? 0 : 0);
      gb.box(CELL, h, CELL, pal.wall, [x, h / 2, z], undefined, 0.12);
      gb.box(CELL + 0.06, 0.18, CELL + 0.06, pal.trim, [x, h - 0.35, z]);
      gb.box(CELL + 0.04, 0.35, CELL + 0.04, pal.wall2, [x, 0.17, z]);
      if (idx === 0 && (c + r) % 3 === 0) gb.box(CELL + 0.02, 0.9, CELL + 0.02, 0x8a5a2a, [x, 1.4, z], undefined, 0.25);
      if (idx === 2 && (c + r) % 2 === 0) gb.box(CELL + 0.02, 1.2, CELL + 0.02, 0xbfd0cc, [x, 1.6, z]);
      if (idx === 1 && (c * 7 + r) % 4 === 0) gb.box(CELL + 0.02, 0.12, CELL + 0.02, 0x2ee6ff, [x, 2.4, z]);
      gb.box(CELL + 0.03, 0.14, CELL + 0.03, pal.trim, [x, 3.55, z]);
    }
    // dinteles sobre las puertas (las hojas miden 3,6 m)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ch = def.map[r][c]; if (!(ch >= '1' && ch <= '9')) continue;
      gb.box(CELL, WALL_H - 3.6, CELL, pal.wall2, [cx(c), (WALL_H + 3.6) / 2, cz(r)]);
    }
    const mesh = new THREE.Mesh(own(gb.build()), ctx.mats.vc); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'paredes';
    group.add(mesh);
  }
  /* ---------- techo (interiores): sólo se ve desde abajo; tiras de luz ---------- */
  if (def.ceiling) {
    const cm = own(new THREE.MeshBasicMaterial({ color: def.ceiling, side: THREE.BackSide }));
    const ceil = new THREE.Mesh(own(new THREE.PlaneGeometry(cols * CELL, rows * CELL)), cm);
    ceil.rotation.x = -Math.PI / 2; ceil.position.y = WALL_H; ceil.name = 'techo';
    group.add(ceil);
    const lg = new M.GB();
    for (let r = 1; r < rows - 1; r += 2) for (let c = 1; c < cols - 1; c += 3) {
      if (def.map[r][c] === '#') continue;
      lg.box(1.6, 0.08, 0.3, 0xffffff, [cx(c), WALL_H - 0.05, cz(r)]);
      lg.box(0.08, 0.4, 0.08, 0x333333, [cx(c), WALL_H - 0.2, cz(r)]);
    }
    const lm = own(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: idx === 0 ? 0xffc890 : 0xe0fff4 }));
    const lights = new THREE.Mesh(own(lg.build()), lm); lights.name = 'tubos'; group.add(lights);
  }

  /* ---------- coberturas instanciadas ---------- */
  {
    const list = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (def.map[r][c] === 'o') list.push([c, r]);
    const geo = own(M.buildCover(def.id === 'bunker' ? 'bunker' : def.id));
    const im = new THREE.InstancedMesh(geo, ctx.mats.vc, Math.max(1, list.length)); im.castShadow = true; im.receiveShadow = true; im.name = 'coberturas';
    const m4 = new THREE.Matrix4();
    list.forEach(([c, r], i) => {
      const rot = (c + r) % 2 ? 0 : Math.PI / 2;
      m4.makeRotationY(rot).setPosition(cx(c), 0, cz(r)); im.setMatrixAt(i, m4);
      const cov = { i, c, r, pos: new THREE.Vector3(cx(c), 0, cz(r)), hp: 260, alive: true, rot };
      W.covers.push(cov); ref[r * cols + c] = cov;
    });
    im.count = list.length;
    group.add(im); W.coverMesh = im;
  }

  /* ---------- puertas ---------- */
  for (const k of Object.keys(doorCells).sort()) {
    const cells = doorCells[k];
    const sx = cells.reduce((a, b) => a + b[0], 0) / cells.length, sz = cells.reduce((a, b) => a + b[1], 0) / cells.length;
    const minC = Math.min(...cells.map(x => x[0])), maxC = Math.max(...cells.map(x => x[0]));
    const [c0, r0] = cells[0];
    // eje: la puerta sigue la línea de pared
    const alongX = maxC > minC || (at(c0 - 1, r0) === '#' && at(c0 + 1, r0) === '#') || (at(c0 - 1, r0) === k || at(c0 + 1, r0) === k);
    const width = cells.length * CELL;
    const parts = M.buildDoorParts(width, pal);
    const dg = new THREE.Group();
    dg.position.set((sx - cols / 2 + 0.5) * CELL, 0, (sz - rows / 2 + 0.5) * CELL);
    if (!alongX) dg.rotation.y = Math.PI / 2;
    const frame = new THREE.Mesh(own(parts.frame), ctx.mats.vc); frame.castShadow = true;
    own(parts.leaf);
    const leafA = new THREE.Mesh(parts.leaf, ctx.mats.vc), leafB = new THREE.Mesh(parts.leaf, ctx.mats.vc);
    leafA.castShadow = leafB.castShadow = true;
    const lightMat = own(new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
    const light = new THREE.Mesh(own(new THREE.BoxGeometry(width * 0.7, 0.14, 1.0)), lightMat); light.position.y = 3.05;
    dg.add(frame, leafA, leafB, light);
    group.add(dg);
    const cfg = def.doors[k] || { gens: [] };
    const door = { id: Number(k), cells, alongX, width, group: dg, leafA, leafB, lightMat, gens: cfg.gens || [], exit: !!cfg.exit,
      state: 'locked', open: 0, hp: 260, maxHp: 260, center: dg.position.clone(), bash: 0 };
    for (const [c, r] of cells) ref[r * cols + c] = door;
    W.doors.push(door);
  }

  /* ---------- entidades ---------- */
  const genModel = M.buildGenerator(); own(genModel.base); own(genModel.wheel);
  const crateModel = M.buildCrate(); own(crateModel.base); own(crateModel.lid);
  const trapGeo = own(M.buildTrap(def.trapKind));
  const spawnGeo = own(M.buildSpawn(def.spawnKind));
  const ringGeo = own(new THREE.RingGeometry(0.9, 1.1, 24)); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = own(new THREE.CircleGeometry(1, 20)); discGeo.rotateX(-Math.PI / 2);
  const bulbGeo = own(new THREE.IcosahedronGeometry(0.14, 0));

  for (const ch of ['a', 'b', 'c']) {
    if (!genCells[ch]) continue;
    const [c, r] = genCells[ch];
    const g = new THREE.Group(); g.position.set(cx(c), 0, cz(r));
    const base = new THREE.Mesh(genModel.base, ctx.mats.vc); base.castShadow = true;
    const wheel = new THREE.Mesh(genModel.wheel, ctx.mats.vc); wheel.position.fromArray(genModel.wheelPos);
    const lightMat = own(new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false }));
    const bulb = new THREE.Mesh(bulbGeo, lightMat); bulb.position.set(-0.6, 1.95, 0.35); bulb.scale.setScalar(1.3);
    const ringMat = own(new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.y = 0.04; ring.scale.setScalar(1.9);
    g.add(base, wheel, bulb, ring);
    group.add(g);
    const gen = { i: W.gens.length, c, r, pos: g.position.clone(), restored: false, progress: 0, wheel, lightMat, ringMat, group: g, spin: 0 };
    W.gens.push(gen); ref[r * cols + c] = gen;
  }

  let trapIdx = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = def.map[r][c], x = cx(c), z = cz(r);
    if (ch === 'C') {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = R() * 0.6 - 0.3;
      const base = new THREE.Mesh(crateModel.base, ctx.mats.vc); base.castShadow = true;
      const lidPivot = new THREE.Group(); lidPivot.position.fromArray(crateModel.lidPivot);
      const lid = new THREE.Mesh(crateModel.lid, ctx.mats.vc); lidPivot.add(lid);
      const beamMat = own(new THREE.MeshBasicMaterial({ color: 0xa6ff2e, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      const beam = new THREE.Mesh(ringGeo, beamMat); beam.position.y = 0.03; beam.scale.setScalar(0.8);
      g.add(base, lidPivot, beam);
      group.add(g);
      const crate = { i: W.crates.length, c, r, pos: g.position.clone(), opened: false, t: 0, lidPivot, beam, beamMat, group: g };
      W.crates.push(crate); ref[r * cols + c] = crate;
    } else if (ch === 'T') {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      // la consola mira hacia el primer lado libre (nunca dentro de una pared)
      let cd = [1, 0];
      for (const dd of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ch2 = at(c + dd[0], r + dd[1]); if (ch2 !== '#' && ch2 !== 'o') { cd = dd; break; } }
      g.rotation.y = Math.atan2(-cd[1], cd[0]);
      const base = new THREE.Mesh(trapGeo, ctx.mats.vc); base.receiveShadow = true;
      const lightMat = own(new THREE.MeshBasicMaterial({ color: 0x555555, toneMapped: false }));
      const bulb = new THREE.Mesh(bulbGeo, lightMat); bulb.position.set(1.5, 1.15, 0); bulb.scale.setScalar(1.4);
      const zoneMat = own(new THREE.MeshBasicMaterial({ color: def.trapKind === 'tesla' ? 0x6ad8ff : def.trapKind === 'vapor' ? 0xffb070 : 0xc08aff, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }));
      const zone = new THREE.Mesh(ringGeo, zoneMat); zone.position.y = 0.06; zone.scale.setScalar(3.2);
      g.add(base, bulb, zone);
      group.add(g);
      const cfg = (def.traps || [])[trapIdx] || { gen: null };
      const trap = { i: trapIdx++, c, r, pos: g.position.clone(), console: new THREE.Vector3(x + cd[0] * 1.5, 0, z + cd[1] * 1.5), kind: def.trapKind, gen: cfg.gen,
        state: 'idle', t: 0, radius: 3.4, lightMat, zoneMat, group: g, uses: 0, tick: 0 };
      W.traps.push(trap);
    } else if (ch === 'S') {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const m = new THREE.Mesh(spawnGeo, ctx.mats.vc);
      const glowMat = own(new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      const glow = new THREE.Mesh(discGeo, glowMat); glow.position.y = 0.12; glow.scale.setScalar(1.1);
      g.add(m, glow); group.add(g);
      W.spawns.push({ i: W.spawns.length, c, r, pos: g.position.clone(), glowMat, warn: 0 });
    } else if (ch === 'W') {
      const m = new THREE.Mesh(own(M.buildWorkbench()), ctx.mats.vc); m.position.set(x, 0, z); m.castShadow = true; group.add(m);
      W.workbench = { pos: m.position.clone(), c, r };
      ref[r * cols + c] = W.workbench;
    } else if (ch === 'R') {
      const m = new THREE.Mesh(own(M.buildTerminal()), ctx.mats.vc); m.position.set(x, 0, z); m.rotation.y = -Math.PI / 2; m.castShadow = true; group.add(m);
      const ringMat = own(new THREE.MeshBasicMaterial({ color: 0x38c8ff, transparent: true, opacity: 0.0, depthWrite: false, toneMapped: false }));
      const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.set(x, 0.04, z); ring.scale.setScalar(1.8); group.add(ring);
      W.terminal = { pos: m.position.clone(), c, r, progress: 0, used: false, ringMat };
      ref[r * cols + c] = W.terminal;
    } else if (ch === 'P') {
      W.playerStart.set(x, 0, z);
    } else if (ch === 'V') {
      W.survivorPos = new THREE.Vector3(x, 0, z);
    } else if (ch === 'A') {
      const m = new THREE.Mesh(own(M.buildAntidote()), ctx.mats.vc); m.position.set(x, 0, z); group.add(m);
      const glowMat = own(new THREE.MeshBasicMaterial({ color: 0x7dff3a, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      const glow = new THREE.Mesh(discGeo, glowMat); glow.position.set(x, 0.05, z); glow.scale.setScalar(1.3); group.add(glow);
      W.antidote = { pos: m.position.clone(), taken: false, mesh: m, glow, c, r };
    } else if (ch === 'Z') {
      const m = new THREE.Mesh(own(M.buildGrate()), ctx.mats.vc); m.position.set(x, 0, z);
      if (at(c - 1, r) !== '#' && at(c + 1, r) !== '#') m.rotation.y = Math.PI / 2;
      group.add(m);
      W.grate = { c, r, pos: m.position.clone(), hp: 30, broken: false, mesh: m };
      ref[r * cols + c] = W.grate;
    }
  }
  // salida / pista
  const avg = (/** @type {number[][]} */ cells) => new THREE.Vector3(cells.reduce((a, b) => a + cx(b[0]), 0) / cells.length, 0, cells.reduce((a, b) => a + cz(b[1]), 0) / cells.length);
  if (exitCells.length) {
    W.exit = { pos: avg(exitCells), radius: 2.6 };
    const ringMat = own(new THREE.MeshBasicMaterial({ color: 0xa6ff2e, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.copy(W.exit.pos); ring.position.y = 0.05; ring.scale.setScalar(2.4); group.add(ring);
    W.exit.ringMat = ringMat;
  }
  if (padCells.length) {
    W.pad = { pos: avg(padCells), radius: 3.2 };
    const gb = new M.GB();
    gb.cyl(3.6, 3.6, 0.08, 20, 0x3a4a48, [0, 0.04, 0]);
    gb.tor(3.2, 0.12, 0xd9a020, [0, 0.1, 0], [Math.PI / 2, 0, 0], 20);
    gb.box(0.4, 0.04, 2.4, 0xffffff, [-0.8, 0.1, 0]); gb.box(0.4, 0.04, 2.4, 0xffffff, [0.8, 0.1, 0]); gb.box(1.2, 0.04, 0.4, 0xffffff, [0, 0.1, 0]);
    const m = new THREE.Mesh(own(gb.build()), ctx.mats.vc); m.position.copy(W.pad.pos); m.receiveShadow = true; group.add(m);
    const beacon = new THREE.Mesh(own(M.buildBeacon()), ctx.mats.vc); beacon.position.copy(W.pad.pos).add(new THREE.Vector3(3.9, 0, 0)); group.add(beacon);
    const ringMat = own(new THREE.MeshBasicMaterial({ color: 0xa6ff2e, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.copy(W.pad.pos); ring.position.y = 0.12; ring.scale.setScalar(3.0); group.add(ring);
    W.pad.ringMat = ringMat; W.pad.beaconPos = beacon.position.clone();
  }
  // pileta tóxica
  if (W.pool.length) {
    const gb = new M.GB();
    for (const [c, r] of W.pool) gb.box(CELL, 0.06, CELL, 0x7dff3a, [cx(c), 0.04, cz(r)]);
    const poolMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, toneMapped: false }));
    const pm = new THREE.Mesh(own(gb.build()), poolMat); pm.name = 'pileta'; group.add(pm);
    W.poolMat = poolMat;
    W.poolCenter = avg(W.pool);
    // borde de la pileta
    const rim = new M.GB();
    for (const [c, r] of W.pool) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (at(c + dc, r + dr) === '~') continue;
      rim.box(dc ? 0.2 : CELL, 0.25, dr ? 0.2 : CELL, 0x5a6a62, [cx(c) + dc * HALF, 0.12, cz(r) + dr * HALF]);
    }
    group.add(new THREE.Mesh(own(rim.build()), ctx.mats.vc));
  }

  /* ---------- decorado (instanciado, densidad según calidad) ---------- */
  {
    const geos = M.buildProps(def.id === 'bunker' ? 'bunker' : def.id);
    /** @type {number[][][]} */ const spots = geos.map(() => []);
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) {
      if (def.map[r][c] !== '.') continue;
      // junto a una pared y lejos de puertas/entidades
      let wallDir = null;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(c + dc, r + dr) === '#') { wallDir = [dc, dr]; break; }
      if (!wallDir) continue;
      let near = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const ch = at(c + dc, r + dr); if (ch !== '#' && ch !== '.') near = true; }
      if (near || R() > q.props * 0.9) continue;
      const k = Math.floor(R() * geos.length);
      spots[k].push([cx(c) + wallDir[0] * 0.55, cz(r) + wallDir[1] * 0.55, Math.atan2(-wallDir[0], -wallDir[1])]);
    }
    const m4 = new THREE.Matrix4();
    geos.forEach((g, k) => {
      own(g);
      if (!spots[k].length) return;
      const im = new THREE.InstancedMesh(g, ctx.mats.vc, spots[k].length); im.castShadow = true;
      spots[k].forEach((s, i) => { m4.makeRotationY(s[2]).setPosition(s[0], 0, s[1]); im.setMatrixAt(i, m4); });
      group.add(im); W.props += spots[k].length;
    });
  }

  /* ---------- luces ---------- */
  const hemi = new THREE.HemisphereLight(pal.hemi[0], pal.hemi[1], pal.hemiI); group.add(hemi);
  const sun = new THREE.DirectionalLight(pal.sun, pal.sunI);
  sun.position.set(-14, 30, 12); sun.target.position.set(0, 0, 0);
  sun.castShadow = q.shadows;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -cols * HALF; sc.right = cols * HALF; sc.top = rows * HALF + 4; sc.bottom = -rows * HALF - 4; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0015;
  group.add(sun, sun.target);
  const lightSpots = [...W.gens.map((/** @type {any} */ g) => g.pos), ...W.traps.map((/** @type {any} */ t) => t.pos)];
  for (let i = 0; i < Math.min(q.lights, lightSpots.length); i++) {
    const pl = new THREE.PointLight(pal.glow, 6, 9, 1.6); pl.position.copy(lightSpots[i]).setY(2.4); group.add(pl); W.lights.push(pl);
  }
  W.sun = sun;

  /* ---------- API de consulta ---------- */
  W.toCell = (/** @type {number} */ x, /** @type {number} */ z) => {
    const c = Math.floor(x / CELL + cols / 2), r = Math.floor(z / CELL + rows / 2);
    return [c, r];
  };
  W.cellIndex = (/** @type {number} */ x, /** @type {number} */ z) => {
    const c = Math.floor(x / CELL + cols / 2), r = Math.floor(z / CELL + rows / 2);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  };
  /** Celda sólida para caminar (paredes, coberturas, props, puertas cerradas, rejilla). */
  W.solid = (/** @type {number} */ i) => {
    const t = grid[i];
    if (t === T.WALL || t === T.COVER || t === T.PROP || t === T.GRATE) return true;
    if (t === T.DOOR) { const d = ref[i]; return d.open < 0.85; }
    return false;
  };
  /** Medio tamaño del obstáculo de la celda (las coberturas y props no ocupan toda la celda). */
  const halfOf = (/** @type {number} */ i) => {
    const t = grid[i];
    if (t === T.COVER) return 0.85;
    if (t === T.PROP) return 0.72;
    if (t === T.DOOR) return HALF;
    return HALF;
  };
  const heightOf = (/** @type {number} */ i) => {
    const t = grid[i];
    if (t === T.COVER) return 1.35;
    if (t === T.PROP) return 1.25;
    return WALL_H;
  };
  /** Empuja un círculo fuera de los sólidos. Devuelve true si chocó. @param {THREE.Vector3} p */
  W.collide = (p, rad, ignoreBarricades = false) => {
    let hit = false;
    const c0 = Math.floor((p.x - rad) / CELL + cols / 2), c1 = Math.floor((p.x + rad) / CELL + cols / 2);
    const r0 = Math.floor((p.z - rad) / CELL + rows / 2), r1 = Math.floor((p.z + rad) / CELL + rows / 2);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const i = r * cols + c;
      if (!W.solid(i)) continue;
      const h = halfOf(i);
      if (pushOut(p, rad, cx(c), cz(r), h, h)) hit = true;
    }
    if (!ignoreBarricades) for (const b of W.barricades) if (b.alive && pushOut(p, rad, b.pos.x, b.pos.z, b.hx, b.hz)) { hit = true; b.touched = true; }
    // límites
    p.x = Math.max(W.bounds.minX + rad, Math.min(W.bounds.maxX - rad, p.x));
    p.z = Math.max(W.bounds.minZ + rad, Math.min(W.bounds.maxZ - rad, p.z));
    return hit;
  };
  /** Barricada que bloquea un punto (para que los mutantes la golpeen). */
  W.barricadeNear = (/** @type {THREE.Vector3} */ p, /** @type {number} */ rad) => {
    for (const b of W.barricades) if (b.alive && Math.abs(p.x - b.pos.x) < b.hx + rad + 0.15 && Math.abs(p.z - b.pos.z) < b.hz + rad + 0.15) return b;
    return null;
  };

  /** Raycast 3D: devuelve distancia al primer sólido (paredes, coberturas, props, puertas, rejilla, barricadas). */
  const hitInfo = { t: Infinity, kind: '', ref: /** @type {any} */ (null), cell: -1 };
  W.raycast = (/** @type {THREE.Vector3} */ o, /** @type {THREE.Vector3} */ d, /** @type {number} */ maxT, skipCovers = false, skipBarr = false) => {
    hitInfo.t = Infinity; hitInfo.kind = ''; hitInfo.ref = null; hitInfo.cell = -1;
    // DDA en XZ
    let c = Math.floor(o.x / CELL + cols / 2), r = Math.floor(o.z / CELL + rows / 2);
    const stepC = d.x > 0 ? 1 : -1, stepR = d.z > 0 ? 1 : -1;
    const gx = (o.x / CELL + cols / 2), gz = (o.z / CELL + rows / 2);
    const tdx = Math.abs(CELL / (d.x || 1e-9)), tdz = Math.abs(CELL / (d.z || 1e-9));
    let tmx = d.x > 0 ? (Math.floor(gx) + 1 - gx) * tdx : (gx - Math.floor(gx)) * tdx;
    let tmz = d.z > 0 ? (Math.floor(gz) + 1 - gz) * tdz : (gz - Math.floor(gz)) * tdz;
    let t = 0;
    for (let n = 0; n < 80 && t <= maxT; n++) {
      if (c >= 0 && r >= 0 && c < cols && r < rows) {
        const i = r * cols + c, tt = grid[i];
        const blocking = tt === T.WALL || tt === T.GRATE || (tt === T.DOOR && ref[i].open < 0.85) || (!skipCovers && (tt === T.COVER || tt === T.PROP));
        if (blocking) {
          const h = halfOf(i), th = rayBox(o, d, cx(c) - h, 0, cz(r) - h, cx(c) + h, heightOf(i), cz(r) + h);
          if (th < hitInfo.t && th <= maxT) {
            hitInfo.t = th; hitInfo.cell = i;
            hitInfo.kind = tt === T.WALL ? 'wall' : tt === T.COVER ? 'cover' : tt === T.DOOR ? 'door' : tt === T.GRATE ? 'grate' : 'prop';
            hitInfo.ref = ref[i];
            if (tt === T.WALL || tt === T.DOOR || tt === T.GRATE) break;
          }
        }
      } else if (t > 0) break;
      if (tmx < tmz) { t = tmx; tmx += tdx; c += stepC; } else { t = tmz; tmz += tdz; r += stepR; }
    }
    if (!skipBarr) for (const b of W.barricades) {
      if (!b.alive) continue;
      const th = rayBox(o, d, b.pos.x - b.hx, 0, b.pos.z - b.hz, b.pos.x + b.hx, 1.3, b.pos.z + b.hz);
      if (th < hitInfo.t && th <= maxT) { hitInfo.t = th; hitInfo.kind = 'barricade'; hitInfo.ref = b; hitInfo.cell = -1; }
    }
    return hitInfo;
  };
  /** Línea de visión libre entre dos puntos (a la altura dada). */
  const _o = new THREE.Vector3(), _d = new THREE.Vector3();
  W.los = (/** @type {THREE.Vector3} */ a, /** @type {THREE.Vector3} */ b, h = 1.2, skipCovers = false) => {
    _o.set(a.x, h, a.z); _d.set(b.x - a.x, 0, b.z - a.z);
    const len = _d.length(); if (len < 0.01) return true;
    _d.multiplyScalar(1 / len);
    return W.raycast(_o, _d, len, skipCovers).t >= len;
  };

  /* ---------- campo de flujo (Dijkstra) ---------- */
  const N = cols * rows;
  const heap = new Int32Array(N * 8), heapD = new Float32Array(N * 8);
  /** costo de paso por una celda (Infinity = intransitable) */
  W.cost = (/** @type {number} */ i) => {
    const t = grid[i];
    if (t === T.WALL || t === T.COVER || t === T.PROP || t === T.GRATE) return Infinity;
    if (t === T.DOOR) { const d = ref[i]; if (d.open >= 0.85) return 1; return d.state === 'locked' ? Infinity : 9; }
    if (t === T.TOXIC) return 7;
    return 1 + W.extraCost[i];
  };
  /** @param {Float32Array} dist @param {number} tx @param {number} tz */
  W.flow = (dist, tx, tz) => {
    dist.fill(Infinity);
    const start = W.cellIndex(tx, tz); if (start < 0) return dist;
    let n = 0;
    const push = (/** @type {number} */ i, /** @type {number} */ d) => {
      let k = n++; heap[k] = i; heapD[k] = d;
      while (k > 0) { const p = (k - 1) >> 1; if (heapD[p] <= heapD[k]) break; const ti = heap[p], td = heapD[p]; heap[p] = heap[k]; heapD[p] = heapD[k]; heap[k] = ti; heapD[k] = td; k = p; }
    };
    const pop = () => {
      const top = heap[0]; heap[0] = heap[--n]; heapD[0] = heapD[n];
      let k = 0;
      for (;;) { const l = 2 * k + 1, rr = l + 1; let m = k; if (l < n && heapD[l] < heapD[m]) m = l; if (rr < n && heapD[rr] < heapD[m]) m = rr; if (m === k) break; const ti = heap[m], td = heapD[m]; heap[m] = heap[k]; heapD[m] = heapD[k]; heap[k] = ti; heapD[k] = td; k = m; }
      return top;
    };
    dist[start] = 0; push(start, 0);
    while (n > 0 && n < heap.length - 8) {
      const d0 = heapD[0], i = pop();
      if (d0 > dist[i]) continue;
      const c = i % cols, r = (i / cols) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        const w = W.cost(j); if (w === Infinity) continue;
        if (dc && dr && (W.cost(r * cols + nc) === Infinity || W.cost(nr * cols + c) === Infinity)) continue;
        const nd = d0 + w * (dc && dr ? 1.414 : 1);
        if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
      }
    }
    return dist;
  };
  /** Dirección (en `out`) hacia la celda vecina con menor distancia. Devuelve la celda elegida o -1. */
  W.flowDir = (/** @type {Float32Array} */ dist, /** @type {THREE.Vector3} */ p, /** @type {THREE.Vector3} */ out) => {
    const i = W.cellIndex(p.x, p.z); if (i < 0) { out.set(0, 0, 0); return -1; }
    const c = i % cols, r = (i / cols) | 0;
    let best = dist[i], bj = -1;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc;
      if (dc && dr && (W.cost(r * cols + nc) === Infinity || W.cost(nr * cols + c) === Infinity)) continue;
      if (dist[j] < best) { best = dist[j]; bj = j; }
    }
    if (bj < 0) { out.set(0, 0, 0); return -1; }
    out.set(cx(bj % cols) - p.x, 0, cz((bj / cols) | 0) - p.z);
    const l = out.length(); if (l > 1e-4) out.multiplyScalar(1 / l);
    return bj;
  };
  W.recomputeExtraCost = () => {
    W.extraCost.fill(0);
    for (const b of W.barricades) {
      if (!b.alive) continue;
      const [c0, r0] = W.toCell(b.pos.x - b.hx, b.pos.z - b.hz), [c1, r1] = W.toCell(b.pos.x + b.hx, b.pos.z + b.hz);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (c >= 0 && r >= 0 && c < cols && r < rows) W.extraCost[r * cols + c] += 6;
    }
  };
  /** Cobertura destruida (jefe / bruto): la celda pasa a piso. */
  W.destroyCover = (/** @type {any} */ cov) => {
    if (!cov || !cov.alive) return false;
    cov.alive = false; cov.hp = 0;
    grid[cov.r * cols + cov.c] = T.FLOOR; ref[cov.r * cols + cov.c] = null;
    const m4 = new THREE.Matrix4().makeScale(0, 0, 0); W.coverMesh.setMatrixAt(cov.i, m4); W.coverMesh.instanceMatrix.needsUpdate = true;
    return true;
  };
  W.breakGrate = () => {
    const g = W.grate; if (!g || g.broken) return false;
    g.broken = true; g.hp = 0; grid[g.r * cols + g.c] = T.FLOOR; ref[g.r * cols + g.c] = null;
    g.mesh.rotation.x = -1.35; g.mesh.position.y = 0.15;
    return true;
  };
  W.setDoorState = (/** @type {any} */ d, /** @type {string} */ s) => {
    d.state = s;
    d.lightMat.color.setHex(s === 'locked' ? 0xff3030 : s === 'closed' ? 0xffc02a : s === 'open' ? 0x3aff6a : 0x777777);
  };
  W.doors.forEach((/** @type {any} */ d) => W.setDoorState(d, 'locked'));

  /* ---------- animación ---------- */
  W.update = (/** @type {number} */ dt, /** @type {number} */ time) => {
    for (const d of W.doors) {
      const target = d.state === 'open' || d.state === 'broken' ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 1.6);
      const w = d.width / 4, slide = d.open * (d.width / 2 - 0.05);
      d.leafA.position.x = -w - slide; d.leafB.position.x = w + slide;
      if (d.state === 'broken') { d.leafA.rotation.z = 0.12; d.leafB.rotation.z = -0.18; }
      else { d.leafA.rotation.z = 0; d.leafB.rotation.z = 0; }
    }
    for (const g of W.gens) {
      if (g.restored) { g.spin += dt * 9; g.wheel.rotation.x = g.spin; }
      else if (g.progress > 0) { g.spin += dt * 9 * g.progress; g.wheel.rotation.x = g.spin; }
      g.ringMat.opacity = g.restored ? 0 : g.progress > 0 ? 0.55 : 0.18 + 0.12 * Math.sin(time * 3 + g.i);
    }
    for (const c of W.crates) {
      if (c.opened) { c.t = Math.min(1, c.t + dt * 3); c.lidPivot.rotation.x = -c.t * 1.9; c.beamMat.opacity = Math.max(0, 0.35 - c.t * 0.35); }
      else c.beamMat.opacity = 0.22 + 0.14 * Math.sin(time * 4 + c.i);
    }
    for (const s of W.spawns) { s.warn = Math.max(0, s.warn - dt); s.glowMat.opacity = s.warn > 0 ? 0.35 + 0.35 * Math.sin(time * 18) : 0; }
    if (W.poolMat) W.poolMat.opacity = 0.74 + 0.1 * Math.sin(time * 2.2);
    if (W.antidote && !W.antidote.taken) { W.antidote.mesh.rotation.y += dt * 1.5; W.antidote.glow.material.opacity = 0.35 + 0.2 * Math.sin(time * 4); }
  };

  W.dispose = () => {
    ctx.root.remove(group);
    disposables.forEach(x => x.dispose && x.dispose());
    group.traverse(/** @param {any} o */ o => { if (o.isInstancedMesh) o.dispose(); if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); });
  };
  return W;
}

/** Empuja un círculo fuera de una caja XZ. */
function pushOut(/** @type {THREE.Vector3} */ p, /** @type {number} */ rad, /** @type {number} */ bx, /** @type {number} */ bz, /** @type {number} */ hx, /** @type {number} */ hz) {
  const nx = Math.max(bx - hx, Math.min(p.x, bx + hx)), nz = Math.max(bz - hz, Math.min(p.z, bz + hz));
  let dx = p.x - nx, dz = p.z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rad * rad) return false;
  if (d2 < 1e-8) {
    // centro dentro de la caja: salir por el lado más cercano
    const ox = hx - Math.abs(p.x - bx), oz = hz - Math.abs(p.z - bz);
    if (ox < oz) p.x = bx + Math.sign(p.x - bx || 1) * (hx + rad); else p.z = bz + Math.sign(p.z - bz || 1) * (hz + rad);
    return true;
  }
  const d = Math.sqrt(d2), k = (rad - d) / d;
  p.x += dx * k; p.z += dz * k;
  return true;
}
/** Intersección rayo-caja (slabs). Devuelve t o Infinity. */
export function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const oo = a === 0 ? o.x : a === 1 ? o.y : o.z, dd = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const lo = a === 0 ? x0 : a === 1 ? y0 : z0, hi = a === 0 ? x1 : a === 1 ? y1 : z1;
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return Infinity; continue; }
    let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
