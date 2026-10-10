// @ts-check
/* Cocina del Caos — construcción de cada cocina a partir de su plano de baldosas.
   Lo estático (piso, paredes, mesadas, cuerpos de estaciones, decoración) se fusiona en pocas mallas;
   lo animado (puertas, tapas, ollas, cinta, platos) queda en mallas propias. */
import * as THREE from 'three';
import { Builder, mesh, MAT, C, THEMES, ingGeo, plateGeo, dirtyGeo, makeCustomer } from './models.js';
import { TS, COUNTER_H, ING } from './config.js';
import { rng } from '../../matelabs/kit3d.js';

const FLOORLIKE = new Set(['.', '@', 'h', 'v', '>', '<']);
const TYPE = { '#': 'counter', T: 'board', O: 'oven', P: 'pot', S: 'sink', D: 'rack', R: 'return', C: 'conveyor', c: 'conveyor', X: 'hatch', B: 'trash', E: 'counter', H: 'hole', W: 'wall', A: 'airlock', L: 'lava' };
const _o = new THREE.Object3D();

/** @param {any} def definición de la cocina (config.KITCHENS) @param {any} Q tabla de calidad */
export function buildKitchen(def, Q) {
  const th = THEMES[def.theme];
  const L = def.layout, H = L.length, W = L[0].length;
  const group = new THREE.Group(); group.name = def.id;
  const r = rng(def.id.length * 977);
  const X = c => (c - (W - 1) / 2) * TS, Z = rw => (rw - (H - 1) / 2) * TS;
  const ch = (c, rw) => (rw < 0 || rw >= H || c < 0 || c >= W ? 'W' : L[rw][c]);
  const walkable = (c, rw) => FLOORLIKE.has(ch(c, rw));
  const halfW = W * TS / 2, halfH = H * TS / 2;

  const stat = new Builder();   // estático mate
  const shiny = new Builder();  // metales
  const glow = new Builder();   // brillos (sin luz)
  const floor = new Builder();

  /* ---------- piso ---------- */
  for (let rw = 0; rw < H; rw++) for (let c = 0; c < W; c++) {
    const k = ch(c, rw);
    if (k === 'L') continue;
    const col = (c + rw) % 2 ? th.floorA : th.floorB;
    floor.box(TS, 0.1, TS, col, [X(c), -0.05, Z(rw)]);
  }
  // borde exterior del piso (zócalo)
  floor.box(W * TS + 2, 0.1, H * TS + 2, th.wall2, [0, -0.12, 0]);

  /* ---------- paredes ---------- */
  const wallH = def.theme === 'espacial' ? 3.2 : 3.4;
  stat.box(W * TS + 1.4, wallH, 0.5, th.wall, [0, wallH / 2, -halfH - 0.25]);
  stat.box(0.5, wallH, H * TS + 0.5, th.wall, [-halfW - 0.25, wallH / 2, -0.25]);
  // pared derecha baja (deja ver el salón)
  stat.box(0.4, 1.25, H * TS + 0.5, th.wall2, [halfW + 0.2, 0.62, -0.25]);
  decorateWalls(def.theme, stat, shiny, glow, W, H, halfW, halfH, wallH, r, Q);

  /* ---------- estaciones ---------- */
  /** @type {any[]} */ const stations = [];
  const fridgeQueue = [...def.fridges];
  let spawn = { x: 0, z: 0 }, helperSpawn = { x: 0, z: 0 };
  const holes = [], airlocks = [], cracks = [], walk = [], lava = [];
  for (let rw = 0; rw < H; rw++) for (let c = 0; c < W; c++) {
    const k = ch(c, rw), x = X(c), z = Z(rw);
    if (k === '@') spawn = { x, z };
    if (k === 'h') helperSpawn = { x, z };
    if (k === 'v') cracks.push({ c, rw, x, z });
    if (k === '>' || k === '<') walk.push({ c, rw, x, z, dir: k === '>' ? 1 : -1 });
    if (FLOORLIKE.has(k)) continue;
    if (k === 'L') { lava.push({ c, rw, x, z }); continue; }
    const type = /[1-6]/.test(k) ? 'fridge' : TYPE[k] || 'counter';
    // hacia dónde mira (baldosa de piso vecina, prioridad: frente)
    let fx = 0, fz = 1;
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (walkable(c + dx, rw + dz)) { fx = dx; fz = dz; break; }
    const st = { id: '', type, c, rw, x, z, fx, fz, top: COUNTER_H, item: null, prog: 0, fire: 0, fireT: 0, parts: /** @type {any} */ ({}), key: k };
    if (type === 'fridge') st.ing = def.fridges[Number(k) - 1] || fridgeQueue[0];
    buildStation(st, def.theme, th, stat, shiny, glow, group);
    if (type === 'hole') holes.push({ x, z, ox: x + fx * TS * 0.9, oz: z + fz * TS * 0.9, fx, fz });
    if (type === 'airlock') airlocks.push(st);
    if (type !== 'wall' && type !== 'hole' && type !== 'airlock') stations.push(st);
  }
  // ids legibles y únicos por tipo
  const cnt = {};
  for (const s of stations) { cnt[s.type] = (cnt[s.type] || 0); s.id = s.type === 'fridge' ? 'nevera_' + s.ing : s.type + cnt[s.type]; cnt[s.type]++; }
  for (const s of stations) if (s.key === 'E') s.id = 'mesada_extintor';

  /* ---------- lava ---------- */
  let lavaMesh = null;
  if (lava.length) {
    const lb = new Builder();
    for (const t of lava) { lb.box(TS, 0.06, TS, 0xffffff, [t.x, -0.05, t.z]); }
    lavaMesh = new THREE.Mesh(lb.build(), MAT.lava); group.add(lavaMesh);
    const rocks = new Builder();
    for (const t of lava) for (const sd of [-1, 1]) {
      if (!walkable(t.c, t.rw + sd)) continue;
      rocks.box(TS, 0.16, 0.16, 0x2a2024, [t.x, -0.02, t.z + sd * TS * 0.5]);
    }
    // puentes de hierro sobre la lava en las baldosas de piso de esa fila
    const lavaRow = lava[0].rw;
    for (let c = 0; c < W; c++) if (walkable(c, lavaRow)) {
      const x = X(c), z = Z(lavaRow);
      shiny.box(TS * 0.98, 0.08, TS, 0x5a5a62, [x, -0.03, z]).box(0.08, 0.5, TS, 0xb8662e, [x - TS * 0.48, 0.25, z]).box(0.08, 0.5, TS, 0xb8662e, [x + TS * 0.48, 0.25, z]);
    }
    if (!rocks.empty) group.add(mesh(rocks.build()));
  }
  /* ---------- grietas ---------- */
  const crackMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false });
  if (cracks.length) {
    const cb = new Builder();
    for (const t of cracks) for (let i = 0; i < 4; i++) cb.box(0.7 - i * 0.1, 0.012, 0.05, 0xffffff, [t.x + (r() - 0.5) * 0.3, 0.005, t.z + (i - 1.5) * 0.18], [0, r() * 1.2 - 0.6, 0]);
    group.add(new THREE.Mesh(cb.build(), crackMat));
  }
  /* ---------- pasillos móviles ---------- */
  let chevrons = null;
  if (walk.length) {
    const belt = new Builder();
    for (const t of walk) belt.box(TS, 0.03, TS * 0.86, 0x2a3446, [t.x, 0.012, t.z]);
    group.add(mesh(belt.build()));
    const cg = new Builder().box(0.3, 0.01, 0.07, 0xffffff, [0, 0, 0.1], [0, 0.7, 0]).box(0.3, 0.01, 0.07, 0xffffff, [0, 0, -0.1], [0, -0.7, 0]).build();
    chevrons = new THREE.InstancedMesh(cg, MAT.push, walk.length * 2);
    chevrons.frustumCulled = false; group.add(chevrons);
  }

  /* ---------- cinta: recorrido ordenado C → c… → X ---------- */
  const conv = [];
  const start = stations.find(s => s.key === 'C');
  if (start) {
    let cur = start; const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur); conv.push(cur);
      if (cur.type === 'hatch') break;
      cur = stations.find(s => !seen.has(s) && (s.key === 'c' || s.key === 'X') && Math.abs(s.c - cur.c) + Math.abs(s.rw - cur.rw) === 1);
    }
    conv.forEach((s, i) => { s.convIndex = i; });
  }
  const slatGeo = new Builder().box(TS * 0.8, 0.02, 0.12, 0x1e1e24, [0, 0, 0]).build();
  const slats = new THREE.InstancedMesh(slatGeo, MAT.base, Math.max(1, conv.length * 4));
  slats.frustumCulled = false; group.add(slats);

  /* ---------- salón con comensales y tickets 3D ---------- */
  const dining = new Builder();
  const seats = [];
  const NS = 5;
  for (let i = 0; i < NS; i++) {
    const z = -halfH + 0.9 + i * ((H * TS - 1.8) / (NS - 1)), x = halfW + 2.3;
    dining.cyl(0.42, 0.42, 0.06, 12, def.theme === 'espacial' ? 0xe8eef5 : def.theme === 'volcan' ? 0x3a3034 : C.wood, [x - 0.75, 0.78, z]).cyl(0.06, 0.1, 0.76, 6, th.trim, [x - 0.75, 0.39, z]);
    dining.cyl(0.25, 0.25, 0.08, 10, th.trim, [x, 0.5, z]).cyl(0.05, 0.05, 0.5, 6, C.black, [x, 0.25, z]);
    const cust = makeCustomer(def.theme, i + def.id.length);
    cust.group.position.set(x, -0.12, z); cust.group.rotation.y = -Math.PI / 2; cust.group.visible = false;
    cust.legs.forEach(l => { l.rotation.x = -1.3; });
    group.add(cust.group);
    // ticket 3D: tarjeta de papel con lienzo (receta) + barra de paciencia
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    card.position.set(x - 0.2, 2.75, z); card.visible = false; group.add(card);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.02), new THREE.MeshBasicMaterial({ color: 0x6be38a, toneMapped: false }));
    bar.position.set(x - 0.2, 2.27, z); bar.visible = false; group.add(bar);
    const dish = new THREE.Group(); dish.position.set(x - 0.75, 0.82, z); dish.visible = false; group.add(dish);
    seats.push({ x, z, cust, card, cv, tex, bar, dish, orderId: -1, mood: 0, pop: 0, leave: 0 });
  }
  dining.box(4.2, 0.08, H * TS + 0.5, def.theme === 'espacial' ? 0x9fb2c8 : def.theme === 'volcan' ? 0x2a1c1c : 0x7a5032, [halfW + 2.3, -0.04, -0.25]);
  group.add(mesh(dining.build()));

  /* ---------- mallas estáticas ---------- */
  const fm = mesh(floor.build(), MAT.base, false); fm.receiveShadow = true; group.add(fm);
  group.add(mesh(stat.build()));
  if (!shiny.empty) group.add(mesh(shiny.build(), MAT.shiny));
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  if (!glow.empty) group.add(new THREE.Mesh(glow.build(), glowMat));

  /* ---------- fondo (estrellas / brasas) ---------- */
  let starPts = null;
  if (def.theme === 'espacial') {
    const n = 1200, pos = new Float32Array(n * 3), rr = rng(42);
    for (let i = 0; i < n; i++) { const a = rr() * Math.PI * 2, y = rr() * 30 - 6; pos.set([Math.cos(a) * (40 + rr() * 20), y, -30 - rr() * 30 + Math.sin(a) * 6], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, fog: false }));
    starPts.frustumCulled = false; group.add(starPts);
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(7, 2), new THREE.MeshStandardMaterial({ color: 0x5a7ad8, flatShading: true, roughness: 0.8, fog: false }));
    planet.position.set(-14, 9, -34); group.add(planet);
    const ringP = new THREE.Mesh(new THREE.TorusGeometry(10, 0.5, 3, 40), new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
    ringP.position.copy(planet.position); ringP.rotation.set(1.2, 0.3, 0); group.add(ringP);
  }

  /* ---------- animación ambiental ---------- */
  const C1 = new THREE.Color(0xff6a1a), C2 = new THREE.Color(0xffb02a);
  let convOffset = 0;
  function update(t, dt, convSpeed = 1) {
    if (lavaMesh) MAT.lava.color.copy(C1).lerp(C2, 0.5 + 0.5 * Math.sin(t * 1.7));
    if (cracks.length) crackMat.color.setRGB(1, 0.35 + 0.25 * Math.sin(t * 3), 0.1);
    glowMat.color.setScalar(def.theme === 'taberna' ? 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3) : 0.9 + 0.1 * Math.sin(t * 2));
    // cinta
    convOffset = (convOffset + dt * convSpeed * 0.9) % 1;
    let n = 0;
    for (let i = 0; i < conv.length; i++) {
      const s = conv[i], nx = conv[i + 1] || null;
      const dx = nx ? Math.sign(nx.x - s.x) : (i ? Math.sign(s.x - conv[i - 1].x) : 0), dz = nx ? Math.sign(nx.z - s.z) : (i ? Math.sign(s.z - conv[i - 1].z) : 1);
      for (let k = 0; k < 4; k++) {
        const f = ((k + convOffset * 4) % 4) / 4 - 0.5 + 0.125;
        _o.position.set(s.x + dx * f * TS, s.top + 0.012, s.z + dz * f * TS);
        _o.rotation.set(0, dx ? Math.PI / 2 : 0, 0); _o.scale.setScalar(1); _o.updateMatrix();
        slats.setMatrixAt(n++, _o.matrix);
      }
    }
    slats.count = n; slats.instanceMatrix.needsUpdate = true;
    if (chevrons) {
      let m = 0;
      for (const w of walk) for (let k = 0; k < 2; k++) {
        const f = ((k * 0.5 + t * 0.9) % 1) - 0.5;
        _o.position.set(w.x + w.dir * f * TS, 0.035, w.z); _o.rotation.set(0, w.dir > 0 ? 0 : Math.PI, 0); _o.updateMatrix();
        chevrons.setMatrixAt(m++, _o.matrix);
      }
      chevrons.instanceMatrix.needsUpdate = true;
    }
    if (starPts) starPts.rotation.y = t * 0.004;
  }
  update(0, 0);

  return {
    def, group, W, H, X, Z, ch, walkable, stations, conv, holes, airlocks, cracks, walk, lava, seats, spawn, helperSpawn, halfW, halfH, update,
    /** baldosa (col, fila) de una posición */
    cellOf(x, z) { return { c: Math.round(x / TS + (W - 1) / 2), rw: Math.round(z / TS + (H - 1) / 2) }; },
    /** ¿bloquea el paso? */
    solid(c, rw) { return !FLOORLIKE.has(ch(c, rw)); },
    stationAt(c, rw) { return stations.find(s => s.c === c && s.rw === rw) || null; },
  };
}

/* ======================= estaciones ======================= */
function buildStation(st, theme, th, stat, shiny, glow, group) {
  const { x, z, fx, fz, type } = st;
  const yaw = Math.atan2(fx, fz); // frente de la estación
  const f = (d) => [x + fx * d, z + fz * d];
  const side = [fz, -fx]; // perpendicular
  const counter = () => {
    stat.box(TS * 0.98, COUNTER_H - 0.06, TS * 0.98, th.counter, [x, (COUNTER_H - 0.06) / 2, z]);
    stat.box(TS, 0.06, TS, th.top, [x, COUNTER_H - 0.03, z]);
    stat.box(TS * 0.9, 0.05, 0.04, th.trim, [x + fx * TS * 0.49, COUNTER_H - 0.22, z + fz * TS * 0.49], [0, yaw + Math.PI / 2 * (fx ? 1 : 0) * 0, 0]);
  };
  const P = st.parts;
  if (type === 'counter' || type === 'hatch' || type === 'conveyor') {
    if (type === 'conveyor' || type === 'hatch') {
      stat.box(TS * 0.98, COUNTER_H - 0.1, TS * 0.98, th.counter, [x, (COUNTER_H - 0.1) / 2, z]);
      shiny.box(TS, 0.08, TS, 0x8a929c, [x, COUNTER_H - 0.06, z]);
      stat.box(TS * 0.84, 0.03, TS, 0x2a2a30, [x, COUNTER_H - 0.005, z]);
      st.top = COUNTER_H + 0.01;
      if (type === 'hatch') {
        // ventanilla con campana y marco hacia el salón
        shiny.box(0.08, 1.4, 0.08, th.trim, [x + 0.62, COUNTER_H + 0.7, z - 0.58]).box(0.08, 1.4, 0.08, th.trim, [x + 0.62, COUNTER_H + 0.7, z + 0.58]).box(0.08, 0.12, 1.24, th.trim, [x + 0.62, COUNTER_H + 1.4, z]);
        shiny.cyl(0.02, 0.1, 0.1, 10, C.gold, [x + 0.3, COUNTER_H + 0.05, z + 0.4]).ball(0.02, C.gold, [x + 0.3, COUNTER_H + 0.12, z + 0.4]);
        glow.box(0.04, 0.12, 1.1, 0x6be38a, [x + 0.66, COUNTER_H + 1.52, z]);
      }
    } else counter();
  } else if (type === 'board') {
    counter();
    stat.box(0.78, 0.05, 0.56, 0xd9a86a, [x, COUNTER_H + 0.025, z], [0, yaw, 0]);
    const knife = mesh(new Builder().box(0.05, 0.02, 0.32, 0xd8dde4, [0, 0, -0.16]).box(0.05, 0.04, 0.14, C.black, [0, 0, 0.07]).build(), MAT.shiny);
    knife.position.set(x + side[0] * 0.3, COUNTER_H + 0.08, z + side[1] * 0.3); knife.rotation.y = yaw; group.add(knife);
    P.knife = knife; P.knifeY = COUNTER_H + 0.08;
    st.top = COUNTER_H + 0.05;
  } else if (type === 'oven') {
    stat.box(TS * 0.98, COUNTER_H, TS * 0.98, theme === 'espacial' ? 0xbfc9d6 : theme === 'volcan' ? 0x4a3a36 : 0x6a6058, [x, COUNTER_H / 2, z]);
    if (theme === 'taberna') stat.cyl(0.55, 0.62, 0.5, 10, 0x9a5a3a, [x, COUNTER_H + 0.25, z]).cyl(0.35, 0.5, 0.4, 10, 0xa86a4a, [x, COUNTER_H + 0.55, z]).cyl(0.1, 0.12, 0.7, 8, 0x5a4a40, [x - fx * 0.3, COUNTER_H + 1.0, z - fz * 0.3]);
    else if (theme === 'volcan') stat.cone(0.6, 0.8, 7, 0x3a2a26, [x, COUNTER_H + 0.35, z]).ball(0.14, 0xff6a1a, [x, COUNTER_H + 0.78, z]);
    else shiny.box(TS * 0.9, 0.42, TS * 0.9, 0xe8eef5, [x, COUNTER_H + 0.2, z]).box(TS * 0.6, 0.06, 0.06, 0x37c6e8, [x + fx * TS * 0.46, COUNTER_H + 0.38, z + fz * TS * 0.46], [0, yaw, 0]);
    // boca/ventana con brillo (material propio para la intensidad)
    const gm = new THREE.MeshBasicMaterial({ color: 0x442010, toneMapped: false });
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), gm);
    const [mx, mz] = f(TS * 0.495); mouth.position.set(mx, COUNTER_H * 0.55, mz); mouth.rotation.y = yaw; group.add(mouth);
    const door = mesh(new Builder().box(0.72, 0.08, 0.05, theme === 'espacial' ? 0x37c6e8 : 0x2a2a2e, [0, 0.42, 0]).box(0.66, 0.42, 0.03, theme === 'espacial' ? 0xdfe8f2 : 0x3a3a40, [0, 0.21, 0]).build(), MAT.shiny);
    const [dx, dz] = f(TS * 0.52); door.position.set(dx, COUNTER_H * 0.33, dz); door.rotation.y = yaw; group.add(door);
    P.mouth = gm; P.door = door; st.top = COUNTER_H + (theme === 'taberna' ? 0.08 : theme === 'volcan' ? 0.06 : 0.43);
    // bandeja visible arriba (donde se ve el ingrediente)
    shiny.cyl(0.32, 0.32, 0.03, 12, 0x4a4a52, [x, st.top + 0.0, z]);
    st.top += 0.02;
  } else if (type === 'pot') {
    stat.box(TS * 0.98, COUNTER_H, TS * 0.98, theme === 'espacial' ? 0xcfd8e2 : 0x3a3a40, [x, COUNTER_H / 2, z]);
    shiny.box(TS, 0.05, TS, 0x2a2a30, [x, COUNTER_H + 0.02, z]).torus(0.3, 0.03, 0x555, [x, COUNTER_H + 0.05, z], [Math.PI / 2, 0, 0], 14);
    const flame = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 4, 14).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a8aff, toneMapped: false, transparent: true, opacity: 0.85 }));
    flame.position.set(x, COUNTER_H + 0.07, z); group.add(flame); flame.visible = false;
    const pot = mesh(new Builder().cyl(0.36, 0.32, 0.42, 14, theme === 'espacial' ? 0xdfe8f2 : 0x8a929c, [0, 0.21, 0]).torus(0.36, 0.03, 0x6a727c, [0, 0.42, 0], [Math.PI / 2, 0, 0], 14)
      .box(0.14, 0.05, 0.06, C.black, [0.44, 0.34, 0]).box(0.14, 0.05, 0.06, C.black, [-0.44, 0.34, 0]).build(), MAT.shiny);
    pot.position.set(x, COUNTER_H + 0.06, z); group.add(pot);
    const soupMat = new THREE.MeshStandardMaterial({ color: 0xd8402a, roughness: 0.3 });
    const soup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 14), soupMat); soup.position.set(x, COUNTER_H + 0.1, z); soup.visible = false; group.add(soup);
    const bub = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), 4);
    bub.count = 0; bub.frustumCulled = false; group.add(bub);
    P.flame = flame; P.pot = pot; P.soup = soup; P.soupMat = soupMat; P.bub = bub;
    st.top = COUNTER_H + 0.5; st.pot = { ing: '', n: 0, t: 0, state: 'empty' };
  } else if (type === 'sink') {
    stat.box(TS * 0.98, COUNTER_H - 0.06, TS * 0.98, th.counter, [x, (COUNTER_H - 0.06) / 2, z]);
    shiny.box(TS, 0.06, 0.12, 0xb8c2cc, [x, COUNTER_H - 0.03, z - 0.54]).box(TS, 0.06, 0.12, 0xb8c2cc, [x, COUNTER_H - 0.03, z + 0.54]).box(0.12, 0.06, TS, 0xb8c2cc, [x - 0.54, COUNTER_H - 0.03, z]).box(0.12, 0.06, TS, 0xb8c2cc, [x + 0.54, COUNTER_H - 0.03, z]);
    shiny.box(0.96, 0.04, 0.96, 0x8a929c, [x, COUNTER_H - 0.3, z]);
    shiny.cyl(0.04, 0.04, 0.4, 6, 0xb8c2cc, [x - fx * 0.5, COUNTER_H + 0.2, z - fz * 0.5]).cyl(0.03, 0.03, 0.3, 6, 0xb8c2cc, [x - fx * 0.38, COUNTER_H + 0.4, z - fz * 0.38], [fz ? Math.PI / 2 * fz : 0, 0, fx ? -Math.PI / 2 * fx : 0]);
    const water = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.02, 0.94), MAT.water); water.position.set(x, COUNTER_H - 0.12, z); water.visible = false; group.add(water);
    const dishes = new THREE.InstancedMesh(dirtyGeo, MAT.base, 6); dishes.count = 0; dishes.frustumCulled = false; group.add(dishes);
    P.water = water; P.dishes = dishes; st.dirty = 0; st.top = COUNTER_H - 0.1;
  } else if (type === 'rack') {
    counter();
    shiny.box(0.06, 0.5, 0.7, 0xb8c2cc, [x - 0.36, COUNTER_H + 0.25, z]).box(0.06, 0.5, 0.7, 0xb8c2cc, [x + 0.36, COUNTER_H + 0.25, z]);
    const plates = new THREE.InstancedMesh(plateGeo, MAT.base, 8); plates.count = 0; plates.frustumCulled = false; group.add(plates);
    P.plates = plates; st.clean = 0;
  } else if (type === 'return') {
    counter();
    stat.box(0.1, 1.3, TS, th.trim, [x - fx * 0.55 - 0.05, COUNTER_H + 0.65, z]);
    glow.box(0.04, 0.1, 0.5, 0xffd23a, [x - 0.62 + fx * 0.02, COUNTER_H + 1.2, z]);
    const dishes = new THREE.InstancedMesh(dirtyGeo, MAT.base, 8); dishes.count = 0; dishes.frustumCulled = false; group.add(dishes);
    P.dishes = dishes; st.dirty = 0;
  } else if (type === 'fridge') {
    const body = theme === 'espacial' ? 0xe8eef5 : theme === 'volcan' ? 0x5a6a7a : 0x7ab0c8;
    stat.box(TS * 0.98, COUNTER_H - 0.04, TS * 0.98, body, [x, (COUNTER_H - 0.04) / 2, z]);
    stat.box(TS * 0.7, 0.18, 0.04, 0xeaf6ff, [x + fx * TS * 0.5, COUNTER_H * 0.6, z + fz * TS * 0.5], [0, yaw, 0]);
    glow.box(0.14, 0.04, 0.04, 0x8affff, [x + fx * TS * 0.5 + side[0] * 0.35, COUNTER_H * 0.82, z + fz * TS * 0.5 + side[1] * 0.35]);
    // tapa con bisagra atrás
    const lidG = new Builder().box(TS * 0.98, 0.08, TS * 0.98, theme === 'espacial' ? 0xffffff : 0xd8eef8, [0, 0.04, TS * 0.49]).box(0.5, 0.05, 0.08, C.steel2, [0, 0.06, TS * 0.96]).build();
    const lid = mesh(lidG); const pv = new THREE.Group();
    pv.position.set(x - fx * TS * 0.49, COUNTER_H - 0.04, z - fz * TS * 0.49); pv.rotation.y = yaw; pv.add(lid); group.add(pv);
    // cartel: el ingrediente encima (bien grande)
    const icon = mesh(ingGeo(st.ing || 'tomate', 'crudo'), MAT.base, false);
    icon.scale.setScalar(1.5); lid.add(icon); icon.position.set(0, 0.08, TS * 0.42);
    P.lid = pv; P.icon = icon; st.top = COUNTER_H + 0.04;
  } else if (type === 'trash') {
    stat.box(TS * 0.98, COUNTER_H - 0.06, TS * 0.98, th.counter, [x, (COUNTER_H - 0.06) / 2, z]);
    stat.cyl(0.42, 0.36, 0.3, 12, 0x3a4a3a, [x, COUNTER_H + 0.1, z]);
    const lid = mesh(new Builder().cyl(0.44, 0.44, 0.05, 12, 0x4a6a4a, [0, 0, 0.42]).box(0.16, 0.04, 0.05, C.black, [0, 0.04, 0.42]).build());
    const pv = new THREE.Group(); pv.position.set(x - fx * 0.42, COUNTER_H + 0.27, z - fz * 0.42); pv.rotation.y = yaw; pv.add(lid); group.add(pv);
    P.lid = pv; st.top = COUNTER_H + 0.3;
  } else if (type === 'hole') {
    stat.box(TS * 0.98, 0.9, TS * 0.98, th.wall2, [x, 0.45, z]);
    stat.box(0.42, 0.34, 0.08, 0x0a0606, [x + fx * TS * 0.5, 0.17, z + fz * TS * 0.5], [0, yaw, 0]).cyl(0.21, 0.21, 0.08, 10, 0x0a0606, [x + fx * TS * 0.5, 0.34, z + fz * TS * 0.5], [Math.PI / 2, yaw, 0]);
  } else if (type === 'wall') {
    counter();
    if (theme === 'taberna') stat.cyl(0.3, 0.3, 0.7, 10, C.woodDark, [x - 0.2, COUNTER_H + 0.35, z]).cyl(0.31, 0.31, 0.05, 10, 0x444, [x - 0.2, COUNTER_H + 0.55, z]).cyl(0.22, 0.22, 0.5, 10, C.wood, [x + 0.3, COUNTER_H + 0.25, z]);
  } else if (type === 'airlock') {
    stat.box(0.4, 3.2, TS, 0x9fb2c8, [x - 0.4, 1.6, z]);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xffb02a, roughness: 0.5, metalness: 0.4 });
    const dA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, TS / 2), doorMat), dB = dA.clone();
    dA.position.set(x - 0.1, 1.2, z - TS / 4); dB.position.set(x - 0.1, 1.2, z + TS / 4); group.add(dA, dB);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), new THREE.MeshBasicMaterial({ color: 0x552222, toneMapped: false }));
    lamp.position.set(x - 0.05, 2.6, z); group.add(lamp);
    P.dA = dA; P.dB = dB; P.lamp = lamp.material; P.z0 = z;
  }
}

/* ======================= decoración de paredes por tema ======================= */
function decorateWalls(theme, stat, shiny, glow, W, H, halfW, halfH, wallH, r, Q) {
  const bz = -halfH - 0.02;
  const many = Q.decor;
  if (theme === 'taberna') {
    for (let i = 0; i < 7; i++) stat.box(W * TS + 1.4, 0.05, 0.06, 0x6a6050, [0, 0.4 + i * 0.45, bz]); // juntas de piedra
    for (let i = -2; i <= 2; i++) stat.box(0.3, 0.3, 0.6, C.woodDark, [i * 3.2, wallH - 0.2, bz + 0.2]);
    stat.box(W * TS + 1.4, 0.22, 0.3, C.woodDark, [0, wallH - 0.1, bz + 0.1]);
    // estandartes del reino
    for (const sx of [-4.6, 4.6]) { stat.box(1, 1.5, 0.04, 0xa82a2a, [sx, 2.3, bz + 0.05]).box(1.02, 0.12, 0.08, C.gold, [sx, 3.05, bz + 0.06]).cone(0.3, 0.45, 4, C.gold, [sx, 2.35, bz + 0.08], [Math.PI / 2, 0, 0]); }
    // ventana
    stat.box(1.6, 1.1, 0.1, 0x3a2a1a, [0, 2.2, bz + 0.03]); glow.box(1.4, 0.9, 0.05, 0x9ad8ff, [0, 2.2, bz + 0.08]).box(0.06, 0.9, 0.06, 0x3a2a1a, [0, 2.2, bz + 0.1]);
    // antorchas
    for (const sx of [-2.4, 2.4]) { stat.cyl(0.05, 0.04, 0.4, 6, C.woodDark, [sx, 2.1, bz + 0.15], [0.4, 0, 0]); glow.cone(0.1, 0.26, 6, 0xffa030, [sx, 2.4, bz + 0.24]).cone(0.06, 0.18, 6, 0xffe36a, [sx, 2.42, bz + 0.26]); }
    // estantes con frascos
    if (many > 0.5) for (const sx of [-7.4]) for (let k = 0; k < 3; k++) { stat.box(0.4, 0.05, 1.8, C.woodDark, [-halfW - 0.05, 1.5 + k * 0.5, -1 + k * 0.3]); for (let j = 0; j < 4; j++) stat.cyl(0.07, 0.07, 0.22, 6, [0xd86a3a, 0x6ab0d8, 0xd8c83a, 0x8ad86a][(j + k) % 4], [-halfW, 1.64 + k * 0.5, -1.6 + j * 0.4 + k * 0.3]); }
    // ristras de ajo y ollas colgadas
    for (let i = 0; i < Math.round(6 * many); i++) shiny.cyl(0.2, 0.16, 0.18, 8, 0xb87333, [-5.5 + i * 2.1, 2.9, bz + 0.3]);
  } else if (theme === 'volcan') {
    for (let i = 0; i < Math.round(10 * many) + 3; i++) stat.cone(0.5 + r() * 0.6, 1.5 + r() * 2.5, 5, i % 2 ? 0x2a2224 : 0x3a2a2a, [-halfW + r() * W * TS, 0.6 + r() * 1.5, bz + 0.2], [0, r() * 3, 0]);
    // cascadas de lava detrás
    for (const sx of [-4.2, 3.8]) { glow.box(0.6, wallH, 0.06, 0xff5a1a, [sx, wallH / 2, bz + 0.05]).box(0.3, wallH, 0.07, 0xffb02a, [sx, wallH / 2, bz + 0.07]); }
    for (let i = 0; i < 12; i++) glow.box(0.04, 0.6 + r(), 0.04, 0xff7a2a, [-halfW + r() * W * TS, 0.4 + r() * 2, bz + 0.04], [0, 0, r() - 0.5]);
    shiny.cyl(0.1, 0.1, W * TS, 8, 0xb8662e, [0, 2.8, bz + 0.3], [0, 0, Math.PI / 2]).cyl(0.1, 0.1, W * TS, 8, 0xb8662e, [0, 3.1, bz + 0.3], [0, 0, Math.PI / 2]);
    stat.box(0.2, 0.8, 0.2, 0x2a2224, [-halfW - 0.1, 2.5, -1]);
  } else {
    for (let i = 0; i < 5; i++) stat.box(W * TS + 1.4, 0.04, 0.06, 0xb8c6d8, [0, 0.5 + i * 0.6, bz + 0.02]);
    // ventanales al espacio
    for (const sx of [-4, 0, 4]) { shiny.cyl(0.9, 0.9, 0.12, 16, 0x9fb2c8, [sx, 2.1, bz + 0.03], [Math.PI / 2, 0, 0]); glow.cyl(0.78, 0.78, 0.13, 16, 0x0a1430, [sx, 2.1, bz + 0.04], [Math.PI / 2, 0, 0]); for (let k = 0; k < 6; k++) glow.ball(0.03, 0xffffff, [sx + (r() - 0.5) * 1.2, 2.1 + (r() - 0.5) * 1.2, bz + 0.12]); }
    glow.box(W * TS + 1.4, 0.06, 0.05, 0x37c6e8, [0, 0.25, bz + 0.05]).box(W * TS + 1.4, 0.06, 0.05, 0xff5c7a, [0, wallH - 0.15, bz + 0.05]);
    glow.box(0.05, 0.06, H * TS, 0x37c6e8, [-halfW - 0.02, 0.25, 0]);
    for (let i = 0; i < Math.round(4 * many); i++) stat.box(0.6, 0.4, 0.08, 0x2a3446, [-5 + i * 3.4, 3.0, bz + 0.05]);
  }
}
