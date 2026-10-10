// @ts-check
/* Mareas Profundas — las tres zonas: Arrecifes Bioluminiscentes, Ciudad Sumergida y Fosa Silenciosa.
   Cada zona devuelve un "nivel" con terreno, colisiones, interactuables (sondas, escombros, puertas hidráulicas,
   caja negra, cápsula, módulos de buceo, puertas acuáticas), criaturas, objetivos de sonar y su propio update. */
import * as THREE from 'three';
import { GeoBuilder, PAL, coralGeos, probeGeo, probeMastGeo, debrisGeo, doorGeo, panelGeo, wheelGeo, blackBoxGeo, capsuleGeo, cellGeo,
  moduleGeo, moduleLightsGeo, irisGeo, boatGeo, beaconGeo, lampGeo, pillarGeo, ruinStatueGeo } from './models.js';
import { makeSchools, makeManta, makeTurtle, makeAnglers, makeJellies, makeEel, makeDrone, makeOctopus } from './creatures.js';
import { box } from './physics.js';
import { rng } from '../../matelabs/kit3d.js';

const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _c = new THREE.Color(), _c2 = new THREE.Color(), _o = new THREE.Object3D();

/* ======================= piezas comunes ======================= */
/** Terreno: plano desplazado por la función de alturas, con colores por vértice. */
function terrainGeo(height, colorFn, size, seg) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const x = P.getX(i), z = P.getZ(i), y = height(x, z); P.setY(i, y); }
  g.computeVertexNormals();
  const N = g.attributes.normal;
  for (let i = 0; i < n; i++) { colorFn(P.getX(i), P.getY(i), P.getZ(i), N.getY(i), _c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * Base de un nivel: raíz, colisiones, listas y helpers de interactuables persistentes.
 * @param {any} ctx @param {number} n @param {string} name
 */
function baseLevel(ctx, n, name) {
  const root = new THREE.Group(); root.name = 'zone' + n;
  ctx.scene.add(root);
  /** @type {any} */
  const L = {
    n, name, root, time: 0,
    /** @type {import('./physics.js').World} */
    world: { height: () => -100, ceil: 0, floorMin: -200, boxes: [], balls: [], bound: { x0: -70, x1: 70, z0: -70, z1: 70 } },
    spawns: {}, inters: [], ents: [], hazards: [], updaters: [], targets: [], triggers: [], lights: [], probes: {}, debris: {}, doors: {}, items: {}, cells: [], gates: {},
    module: null, schools: null, terrain: null, terrainArgs: null, env: null, boss: null, pits: [],
    /** Añade una luz puntual de bioluminiscencia (se encienden según la calidad). */
    addLight(color, x, y, z, i = 8, d = 18) { const l = new THREE.PointLight(color, i, d, 1.5); l.position.set(x, y, z); root.add(l); L.lights.push(l); return l; },
    applyQuality(q) {
      L.lights.forEach((l, i) => { l.visible = i < q.bioLights; });
      if (L.schools) L.schools.setCount(q.fish);
      if (L.terrainArgs && L.terrain && L.terrainSeg !== q.terrainSeg) {
        const [h, cf, size] = L.terrainArgs; const old = L.terrain.geometry;
        L.terrain.geometry = terrainGeo(h, cf, size, q.terrainSeg); old.dispose(); L.terrainSeg = q.terrainSeg;
      }
    },
    update(dt, c) {
      L.time += dt;
      for (const u of L.updaters) u(dt, c);
      for (const e of L.ents) if (e.update) e.update(dt, c);
      if (L.schools) L.schools.update(dt, c.player.pos);
      for (const t of L.triggers) {
        if (t.done) continue;
        const P = c.player.pos;
        if (Math.hypot(P.x - t.x, P.y - t.y, P.z - t.z) < t.r && (!t.can || t.can())) { t.done = !t.repeat; t.fn(); }
      }
    },
    dispose() {
      root.traverse(/** @param {any} o */ o => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) if (!m.userData.shared) { if (m.map && !m.map.userData?.shared) m.map.dispose(); m.dispose(); }
        if (o.isInstancedMesh) o.dispose();
      });
      ctx.scene.remove(root);
    },
  };
  return L;
}

/** Terreno del nivel. */
function addTerrain(L, ctx, height, colorFn, size) {
  const seg = ctx.qual().terrainSeg;
  const mesh = new THREE.Mesh(terrainGeo(height, colorFn, size, seg), ctx.mats.world);
  mesh.receiveShadow = true; L.root.add(mesh);
  L.terrain = mesh; L.terrainArgs = [height, colorFn, size]; L.terrainSeg = seg;
  L.world.height = height;
}

/** Corales instanciados sobre el terreno, con puntas bioluminiscentes. */
function scatterCorals(L, ctx, seed, n, area, pal, avoid, opts = {}) {
  const r = rng(seed), G = coralGeos(), H = L.world.height;
  const kinds = opts.kinds || ['branch', 'fan', 'brain', 'tube', 'kelp'];
  /** @type {Record<string, {m:THREE.InstancedMesh, i:number}>} */
  const meshes = {};
  for (const k of kinds) { const m = new THREE.InstancedMesh(/** @type {any} */ (G)[k], ctx.mats.coral, n); m.count = 0; meshes[k] = { m, i: 0 }; L.root.add(m); }
  for (const k in G) if (!kinds.includes(k)) /** @type {any} */ (G)[k].dispose();
  const glowN = Math.floor(n * 0.7);
  const glow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), ctx.mats.glowInst, glowN); glow.count = 0; L.root.add(glow);
  let gi = 0;
  for (let t = 0; t < n * 3 && t < n * 6; t++) {
    const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0);
    if (avoid && avoid(x, z)) continue;
    const y = H(x, z);
    if (opts.minY !== undefined && y < opts.minY) continue;
    if (opts.maxY !== undefined && y > opts.maxY) continue;
    const k = kinds[Math.floor(r() * kinds.length)], M = meshes[k];
    if (M.i >= n / kinds.length * 1.6 || M.i >= n) continue;
    const s = (k === 'kelp' ? 0.8 + r() * 1.2 : 0.6 + r() * 1.3) * (opts.scale || 1);
    _o.position.set(x, y - 0.1, z); _o.rotation.set((r() - 0.5) * 0.3, r() * 6.28, (r() - 0.5) * 0.3); _o.scale.setScalar(s); _o.updateMatrix();
    M.m.setMatrixAt(M.i, _o.matrix); M.m.setColorAt(M.i, _c.setHex(pal[Math.floor(r() * pal.length)]).multiplyScalar(0.8 + r() * 0.4)); M.i++; M.m.count = M.i;
    if (gi < glowN && k !== 'brain' && r() < 0.8) {
      const top = k === 'kelp' ? 5 * s : k === 'fan' ? 1.1 * s : 1.4 * s;
      _o.position.set(x + (r() - 0.5) * 0.4 * s, y + top, z + (r() - 0.5) * 0.4 * s); _o.rotation.set(0, 0, 0); _o.scale.setScalar(0.7 + r() * 0.8); _o.updateMatrix();
      glow.setMatrixAt(gi, _o.matrix); glow.setColorAt(gi, _c.setHex(opts.glowPal ? opts.glowPal[Math.floor(r() * opts.glowPal.length)] : 0x4ff7e6)); gi++; glow.count = gi;
    }
  }
  for (const k in meshes) { const m = meshes[k].m; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); }
  if (glow.instanceColor) glow.instanceColor.needsUpdate = true; glow.computeBoundingSphere();
}

/** Rocas instanciadas; las grandes colisionan. */
function scatterRocks(L, ctx, seed, n, area, avoid, color = PAL.rock, big = 1) {
  const r = rng(seed), G = coralGeos(), H = L.world.height;
  for (const k of ['branch', 'fan', 'brain', 'tube', 'kelp']) /** @type {any} */ (G)[k].dispose();
  const m = new THREE.InstancedMesh(G.rock, ctx.mats.world, n); m.count = 0; L.root.add(m);
  let i = 0;
  for (let t = 0; t < n * 5 && i < n; t++) {
    const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0);
    if (avoid && avoid(x, z)) continue;
    const s = (0.8 + r() * 2.6) * big, y = H(x, z);
    _o.position.set(x, y + 0.1 * s, z); _o.rotation.set(r() * 0.4, r() * 6.28, r() * 0.4); _o.scale.set(s, s * (0.6 + r() * 0.8), s); _o.updateMatrix();
    m.setMatrixAt(i, _o.matrix); m.setColorAt(i, _c.setHex(color).multiplyScalar(0.75 + r() * 0.5)); i++;
    if (s > 2.2) L.world.balls.push({ x, y: y + 0.3 * s, z, r: s * 0.85, on: true, tag: 'rock' });
  }
  m.count = i; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere();
}

/** Módulo de buceo: acople = recarga, reparación, punto de control y mejora de presión. */
function addModule(L, ctx, id, x, z, rating) {
  const y = L.world.height(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z); L.root.add(g);
  g.add(new THREE.Mesh(moduleGeo(), ctx.mats.world));
  const lm = new THREE.MeshBasicMaterial({ color: 0xffb547 });
  const lights = new THREE.Mesh(moduleLightsGeo(), lm); g.add(lights);
  L.world.boxes.push(box(x, y + 2.2, z, 6.4, 4.4, 6.4, 'module'));
  L.addLight(0x9ff4ff, x, y + 6, z, 10, 20);
  const dock = { x, y: y + 6.0, z };
  const M = { id, x, y, z, dock, rating, g, lm };
  L.module = M;
  L.spawns.module = { x, y: dock.y, z: z + 0.01, yaw: Math.PI };
  L.inters.push({ id: 'module:' + id, kind: 'module', x: dock.x, y: dock.y, z: dock.z, r: 4.2, label: () => 'Acoplar al módulo de buceo', use: () => ctx.dock(M) });
  L.targets.push({ x: dock.x, y: dock.y, z: dock.z, color: 0xffb547, kind: 'module' });
  L.updaters.push(() => { lm.color.setHex(ctx.S().modules[id] ? (Math.sin(L.time * 3) > 0 ? 0x9ff4ff : 0x4ff7e6) : (Math.sin(L.time * 4) > 0 ? 0xffb547 : 0x7a4a10)); });
  return M;
}

/** Célula de energía flotante (se toma al pasar). */
function addCell(L, ctx, id, x, y, z) {
  if (ctx.S().cells.includes(id)) return;
  const m = new THREE.Mesh(L.cellGeo || (L.cellGeo = cellGeo()), ctx.mats.glow); m.position.set(x, y, z); L.root.add(m);
  const t = { x, y, z, r: 1.8, done: false, fn() { m.visible = false; ctx.takeCell(id, x, y, z); } };
  L.triggers.push(t);
  L.cells.push({ id, m, t });
  L.targets.push({ x, y, z, color: 0x9dffb0, kind: 'cell', alive: () => !t.done });
  L.updaters.push(() => { if (!t.done) { m.rotation.y = L.time * 2; m.position.y = y + Math.sin(L.time * 2 + x) * 0.25; } });
}

/** Sonda científica: al activarla se despliega el mástil, gira la antena y emite pulsos. */
function addProbe(L, ctx, id, x, z) {
  const y = L.world.height(x, z);
  const g = new THREE.Group(); g.position.set(x, y, z); L.root.add(g);
  g.add(new THREE.Mesh(L.probeGeo || (L.probeGeo = probeGeo()), ctx.mats.world));
  const mast = new THREE.Mesh(L.mastGeo || (L.mastGeo = probeMastGeo()), ctx.mats.world); mast.position.y = -1.6; g.add(mast);
  const lm = new THREE.MeshBasicMaterial({ color: 0xffb547 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lm); lamp.position.y = 0.75; g.add(lamp);
  const ringM = new THREE.MeshBasicMaterial({ color: 0x4ff7e6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 24), ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  const P = { id, x, y, z, g, mast, k: ctx.S().probes[id] ? 1 : 0, get on() { return !!ctx.S().probes[id]; } };
  L.probes[id] = P;
  L.world.boxes.push(box(x, y + 0.4, z, 1.8, 0.9, 1.8, 'probe'));
  L.inters.push({ id: 'probe:' + id, kind: 'probe', x, y: y + 1.6, z, r: 4.5, can: () => !P.on, label: () => 'Activar sonda científica', use: () => ctx.activateProbe(id, x, y + 2, z) });
  L.targets.push({ x, y: y + 1, z, color: 0xffb547, kind: 'probe', alive: () => !P.on });
  L.updaters.push(dt => {
    const want = P.on ? 1 : 0; P.k += (want - P.k) * Math.min(1, dt * 1.5);
    mast.position.y = -1.6 + P.k * 2.2; mast.rotation.y += dt * P.k * 1.4;
    lm.color.setHex(P.on ? 0x4ff7e6 : (Math.sin(L.time * 5 + x) > 0 ? 0xffb547 : 0x553300));
    if (P.on) { const ph = (L.time * 0.6 + x * 0.1) % 1; ring.scale.setScalar(1 + ph * 6); ringM.opacity = (1 - ph) * 0.5; } else ringM.opacity = 0;
  });
  return P;
}

/**
 * Escombros movibles: se empujan con el casco a lo largo de un eje. Su desplazamiento se guarda.
 * @param {{id:string,x:number,y:number,z:number,ax:number,az:number,max:number,clear:number,w:number,h:number,d:number,kind?:string,ry?:number}} o
 */
function addDebris(L, ctx, o) {
  const g = new THREE.Group(); L.root.add(g);
  const mesh = new THREE.Mesh(debrisGeo(o.id.length, o.kind || 'slab'), ctx.mats.world); mesh.rotation.y = o.ry || 0; g.add(mesh);
  const col = box(o.x, o.y, o.z, o.w, o.h, o.d, 'debris:' + o.id);
  L.world.boxes.push(col);
  const D = {
    id: o.id, o, g, col, off: ctx.S().debris[o.id] || 0, wob: 0, cleared: false, moved: 0,
    place() {
      const x = o.x + o.ax * D.off, z = o.z + o.az * D.off;
      g.position.set(x, o.y, z); g.rotation.z = Math.sin(D.wob * 30) * 0.03 * Math.min(1, D.wob * 4);
      col.x0 = x - o.w / 2; col.x1 = x + o.w / 2; col.z0 = z - o.d / 2; col.z1 = z + o.d / 2;
      D.cleared = Math.abs(D.off) >= o.clear;
    },
    /** Empuje desde el submarino: velocidad proyectada sobre el eje. */
    push(vx, vz, dt) {
      const along = vx * o.ax + vz * o.az;
      if (Math.abs(along) < 0.4) return false;
      const was = D.cleared;
      D.off = Math.max(-o.max, Math.min(o.max, D.off + along * dt * 0.55));
      D.wob = 0.3; D.moved += Math.abs(along * dt * 0.55);
      D.place();
      if (Math.random() < dt * 10) ctx.fx.cloud(g.position.x, o.y - o.h / 2 + 0.3, g.position.z, 2, 0x8a7a5a, 2, 0.9);
      ctx.sfx.scrape();
      ctx.S().debris[o.id] = Math.round(D.off * 100) / 100; ctx.persistSoon();
      if (!was && D.cleared) ctx.debrisCleared(o.id);
      return true;
    },
  };
  D.place();
  L.debris[o.id] = D;
  L.inters.push({ id: 'debris:' + o.id, kind: 'debris', x: o.x, y: o.y, z: o.z, r: Math.max(o.w, o.d) / 2 + 2.6, push: true, can: () => !D.cleared, label: () => 'Empujá los escombros con el casco' });
  L.targets.push({ x: o.x, y: o.y, z: o.z, color: 0xffd27a, kind: 'debris', alive: () => !D.cleared, follow: g.position });
  L.updaters.push(dt => { if (D.wob > 0) { D.wob -= dt; D.place(); } });
  return D;
}

/**
 * Puerta hidráulica en un hueco de muro + panel con válvula.
 * @param {{id:string,x:number,y:number,z:number,w:number,h:number,ry?:number,panel:[number,number,number,number], blockedBy?:string}} o
 */
function addDoor(L, ctx, o) {
  const mesh = new THREE.Mesh(doorGeo(o.w, o.h), ctx.mats.world); mesh.position.set(o.x, o.y, o.z); mesh.rotation.y = o.ry || 0; L.root.add(mesh);
  const col = box(o.x, o.y, o.z, o.ry ? 1 : o.w, o.h, o.ry ? o.w : 1, 'door');
  L.world.boxes.push(col);
  const [px, py, pz, pry] = o.panel;
  const panel = new THREE.Mesh(L.panelGeo || (L.panelGeo = panelGeo()), ctx.mats.world); panel.position.set(px, py, pz); panel.rotation.y = pry; L.root.add(panel);
  const wheel = new THREE.Mesh(L.wheelGeo || (L.wheelGeo = wheelGeo()), ctx.mats.glow); wheel.position.set(0, -0.45, 0.45); panel.add(wheel);
  const lightM = new THREE.MeshBasicMaterial({ color: 0xff4040 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lightM); lamp.position.set(0, 1.1, 0.3); panel.add(lamp);
  L.world.boxes.push(box(px, py, pz, 1.6, 2, 1.6, 'panel'));
  const D = { id: o.id, mesh, col, k: ctx.S().doors[o.id] ? 1 : 0, spin: 0, get open() { return !!ctx.S().doors[o.id]; } };
  L.doors[o.id] = D;
  const blocked = () => { if (!o.blockedBy) return null; const d = L.debris[o.blockedBy]; return d && !d.cleared ? 'Los escombros tapan el panel: empujalos con el casco' : null; };
  L.inters.push({ id: 'door:' + o.id, kind: 'door', x: px + Math.sin(pry) * 1.4, y: py, z: pz + Math.cos(pry) * 1.4, r: 4.2, can: () => !D.open, blocked, label: () => 'Girar la válvula hidráulica', use: () => { D.spin = 1.5; ctx.openDoor(o.id); } });
  L.targets.push({ x: px, y: py + 1, z: pz, color: 0xffb547, kind: 'panel', alive: () => !D.open });
  L.updaters.push(dt => {
    const want = D.open ? 1 : 0;
    if (D.k !== want) {
      const prev = D.k; D.k = want > D.k ? Math.min(1, D.k + dt / 2.4) : 0;
      if (prev < 1 && D.k > 0 && Math.random() < dt * 14) ctx.fx.bubbles(o.x + (Math.random() - 0.5) * o.w, o.y - o.h / 2 + D.k * o.h, o.z, 3, 1.5, 0.16);
    }
    mesh.position.y = o.y + D.k * (o.h - 0.4);
    col.on = D.k < 0.7;
    if (D.spin > 0) { D.spin -= dt; wheel.rotation.z += dt * 6; }
    lightM.color.setHex(D.open ? 0x4fff7a : 0xff4040);
  });
  return D;
}

/** Puerta acuática (escotilla de iris) entre zonas. */
function addGate(L, ctx, o) {
  const y = o.y;
  const g = new THREE.Group(); g.position.set(o.x, y, o.z); if (o.ceiling) g.rotation.x = Math.PI; L.root.add(g);
  const b = new GeoBuilder(301);
  b.cyl(0, -0.4, 0, 7.2, 7.8, 1.6, 16, PAL.steelDark, 0.03); b.add(new THREE.TorusGeometry(5.4, 0.6, 6, 20), 0xffb547, [0, 0.45, 0], [Math.PI / 2, 0, 0], [1, 1, 1], 0.02);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(Math.cos(a) * 6.6, 0.5, Math.sin(a) * 6.6, 1.0, 0.8, 1.0, PAL.steel); }
  g.add(new THREE.Mesh(b.build(), ctx.mats.world));
  const hole = new THREE.Mesh(new THREE.CircleGeometry(5, 20), new THREE.MeshBasicMaterial({ color: 0x02060c })); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.42; g.add(hole);
  const glowM = new THREE.MeshBasicMaterial({ color: 0x4ff7e6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(4.8, 20), glowM); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.45; g.add(glow);
  const ig = irisGeo(); const blades = [];
  for (let i = 0; i < 6; i++) { const p = new THREE.Group(); p.rotation.y = i / 6 * Math.PI * 2; const m = new THREE.Mesh(ig, ctx.mats.world); m.rotation.x = -Math.PI / 2; m.position.y = 0.5; p.add(m); g.add(p); blades.push(m); }
  const G = { id: o.id, g, k: 0, open: false, to: o.to, spawn: o.spawn };
  L.gates[o.id] = G;
  L.world.boxes.push(box(o.x, y - 0.6, o.z, 12, 1.4, 12, 'gate'));
  if (!o.noUse) L.inters.push({ id: 'gate:' + o.id, kind: 'gate', x: o.x, y: y + (o.ceiling ? -3 : 3), z: o.z, r: 6.5, can: () => true, blocked: () => (o.isOpen() ? null : o.lockedMsg()), label: () => o.label, use: () => ctx.travel(o.to, o.spawn) });
  L.targets.push({ x: o.x, y: y + 1, z: o.z, color: 0x4ff7e6, kind: 'gate' });
  L.updaters.push(dt => {
    const want = o.isOpen() ? 1 : 0; G.open = !!want;
    G.k += (want - G.k) * Math.min(1, dt * 1.2);
    blades.forEach((m, i) => { m.rotation.z = -G.k * 1.2; m.position.x = Math.cos(i) * 0; m.scale.setScalar(1 - G.k * 0.55); });
    glowM.opacity = G.k * (0.35 + Math.sin(L.time * 2) * 0.12);
    if (G.k > 0.5 && Math.random() < dt * 6) ctx.fx.bubbles(o.x + (Math.random() - 0.5) * 6, y + 0.8, o.z + (Math.random() - 0.5) * 6, 2, 0.5, 0.14);
  });
  return G;
}

/** Objeto de carga (caja negra / cápsula): se engancha con USAR y se entrega al acoplar en el módulo. */
function addCargo(L, ctx, kind, geo, x, y, z, label) {
  const m = new THREE.Mesh(geo, ctx.mats.world); m.position.set(x, y, z); L.root.add(m);
  const beaconM = new THREE.MeshBasicMaterial({ color: kind === 'blackbox' ? 0xff7a1a : 0xff4040 });
  const bl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), beaconM); bl.position.set(0, 0.6, 0); m.add(bl);
  const I = { kind, m, home: new THREE.Vector3(x, y, z) };
  L.items[kind] = I;
  const state = () => /** @type {any} */ (ctx.S())[kind === 'blackbox' ? 'blackbox' : 'capsule'];
  const atHome = () => state() === (kind === 'blackbox' ? 'wreck' : 'alley');
  L.inters.push({ id: 'cargo:' + kind, kind: 'cargo', x, y: y + 0.6, z, r: 4, can: () => atHome(), blocked: () => (ctx.carrying() ? 'Ya llevás carga: entregala en el módulo primero' : null), label: () => label, use: () => ctx.grab(kind) });
  L.targets.push({ x, y, z, color: 0xff7a1a, kind: 'cargo', alive: atHome });
  L.updaters.push(() => {
    const s = state();
    m.visible = s !== 'delivered';
    if (atHome()) { m.position.copy(I.home); m.position.y += Math.sin(L.time * 1.5) * 0.06; m.rotation.set(0, L.time * 0.2, 0); }
    beaconM.color.setHex(Math.sin(L.time * 6) > 0 ? (kind === 'blackbox' ? 0xff7a1a : 0xff4040) : 0x220800);
  });
  return I;
}

/** Luz caída: cono de luz de la superficie atravesando grietas (barata). */
function addShaft(L, ctx, x, y, z, h, w) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w, h, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.position.set(x, y - h / 2, z); m.renderOrder = 6; L.root.add(m);
  L.updaters.push(() => { /** @type {any} */ (m.material).opacity = 0.05 + Math.sin(L.time * 0.7 + x) * 0.02; });
}

/* ======================= ZONA 1: ARRECIFES ======================= */
export const REEF_RUIN = { x0: -60, x1: -46, z0: -21, z1: -7, floor: -30 };
export function buildReef(ctx) {
  const L = baseLevel(ctx, 1, 'Arrecifes Bioluminiscentes');
  const R = REEF_RUIN;
  const height = (x, z) => {
    if (x > R.x0 - 0.5 && x < R.x1 + 0.5 && z > R.z0 - 0.5 && z < R.z1 + 0.5) return R.floor;
    let h = -28 + 4 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 2.5 * Math.sin(x * 0.13 + z * 0.09) + 1.2 * Math.sin(x * 0.31 - z * 0.27);
    h += ss(20, 50, z) * 11;
    h -= ss(-24, -52, z) * 15;
    const e = Math.max(ss(56, 72, Math.abs(x)), ss(58, 72, Math.abs(z)));
    return h + (6 - h) * e;
  };
  const colorFn = (x, y, z, ny, c) => {
    const n = Math.sin(x * 0.4) * Math.cos(z * 0.35);
    c.setHex(PAL.sand).lerp(_c2.setHex(0x9a8a6a), Math.max(0, -y - 30) / 20);
    if (ny < 0.8) c.lerp(_c2.setHex(PAL.rock), 0.75);
    if (n > 0.6) c.lerp(_c2.setHex(0x6a8f5a), 0.35);
    if (y > -3) c.lerp(_c2.setHex(0x6f8a96), 0.6);
  };
  addTerrain(L, ctx, height, colorFn, 170);
  L.world.ceil = 0; L.world.bound = { x0: -70, x1: 70, z0: -70, z1: 70 };
  L.env = { fog: 0x0b5f80, density: 0.02, bg: 0x0b5f80, sky: 0x9fe6ff, ground: 0x1a4a5a, hemi: 1.15, sun: 0xcff6ff, sunI: 1.6, snow: 0xcfefff, rays: 1, top: 0, caus: 1.0, surface: true };
  // superficie vista desde abajo
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(320, 320, 1, 1), ctx.mats.surface); surf.rotation.x = -Math.PI / 2; surf.position.y = 0.05; L.root.add(surf);
  // barco de apoyo
  const boat = new THREE.Mesh(boatGeo(), ctx.mats.world); boat.position.set(0, 0.2, 52); L.root.add(boat);
  L.world.boxes.push(box(0, -0.4, 52, 4.4, 1.6, 13, 'boat'));
  L.boat = { x: 0, z: 52 };
  L.spawns.start = { x: 0, y: -5, z: 42, yaw: Math.PI };
  L.spawns.ascent = { x: 0, y: -38, z: -40, yaw: 0 };
  L.spawns.entry = { x: 0, y: -36, z: -40, yaw: 0 };
  const avoidRuin = (x, z) => (x > R.x0 - 3 && x < R.x1 + 6 && z > R.z0 - 3 && z < R.z1 + 3) || Math.hypot(x - 16, z - 28) < 7 || Math.hypot(x, z + 48) < 9;
  scatterCorals(L, ctx, 11, 300, { x0: -64, x1: 64, z0: -62, z1: 62 }, [PAL.coralPink, PAL.coralViolet, PAL.coralOrange, PAL.coralTeal, PAL.coralYellow], avoidRuin, { glowPal: [0x4ff7e6, 0xff5fd2, 0xffe066, 0x9dffb0], maxY: -6 });
  scatterRocks(L, ctx, 12, 46, { x0: -64, x1: 64, z0: -62, z1: 62 }, avoidRuin);
  // ruina oculta: cámara de piedra con la entrada tapada por escombros
  const rb = new GeoBuilder(120), F = R.floor, top = F + 9;
  rb.box((R.x0 + R.x1) / 2, top + 0.6, (R.z0 + R.z1) / 2, R.x1 - R.x0 + 2, 1.2, R.z1 - R.z0 + 2, PAL.stoneDark);
  rb.box(R.x0, F + 4.5, (R.z0 + R.z1) / 2, 1.4, 9, R.z1 - R.z0 + 2, PAL.stone);
  rb.box((R.x0 + R.x1) / 2, F + 4.5, R.z0, R.x1 - R.x0, 9, 1.4, PAL.stone);
  rb.box((R.x0 + R.x1) / 2, F + 4.5, R.z1, R.x1 - R.x0, 9, 1.4, PAL.stone);
  rb.box(R.x1, F + 4.5, R.z0 + 2.75, 1.4, 9, 5.5, PAL.stone); rb.box(R.x1, F + 4.5, R.z1 - 2.75, 1.4, 9, 5.5, PAL.stone);
  rb.box(R.x1, F + 7.25, -14, 1.4, 3.5, 3.2, PAL.stone);
  for (let i = 0; i < 4; i++) rb.cyl(R.x1 + 1.4, F + 4.5, -16.3 + (i % 2) * 4.6 + (i > 1 ? 0 : 0), 0.5, 0.6, 9, 6, PAL.stoneLight);
  rb.box(R.x1 + 1, top + 1.6, -14, 2.4, 1, 8, PAL.bronze);
  L.root.add(new THREE.Mesh(rb.build(), ctx.mats.world));
  L.world.boxes.push(box((R.x0 + R.x1) / 2, top + 0.6, (R.z0 + R.z1) / 2, R.x1 - R.x0 + 2, 1.2, R.z1 - R.z0 + 2, 'ruin'));
  L.world.boxes.push(box(R.x0, F + 4.5, (R.z0 + R.z1) / 2, 1.4, 9, R.z1 - R.z0 + 2, 'ruin'));
  L.world.boxes.push(box((R.x0 + R.x1) / 2, F + 4.5, R.z0, R.x1 - R.x0, 9, 1.4, 'ruin'));
  L.world.boxes.push(box((R.x0 + R.x1) / 2, F + 4.5, R.z1, R.x1 - R.x0, 9, 1.4, 'ruin'));
  L.world.boxes.push(box(R.x1, F + 4.5, R.z0 + 2.75, 1.4, 9, 5.5, 'ruin'), box(R.x1, F + 4.5, R.z1 - 2.75, 1.4, 9, 5.5, 'ruin'), box(R.x1, F + 7.25, -14, 1.4, 3.5, 3.2, 'ruin'));
  const statue = new THREE.Mesh(ruinStatueGeo(), ctx.mats.world); statue.position.set(-56, F, -14); statue.rotation.y = Math.PI / 2; L.root.add(statue);
  const glyphM = new THREE.MeshBasicMaterial({ color: 0x4ff7e6 });
  const glyph = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.1, 4, 6), glyphM); glyph.position.set(-58.9, F + 5, -14); glyph.rotation.y = Math.PI / 2; L.root.add(glyph);
  L.addLight(0x4ff7e6, -54, F + 4, -14, 7, 14);
  addDebris(L, ctx, { id: 'ruina', x: R.x1 + 2.2, y: F + 1.9, z: -14, ax: 0, az: 1, max: 4.5, clear: 3.6, w: 2.0, h: 3.8, d: 3.6, kind: 'slab', ry: Math.PI / 2 });
  L.triggers.push({ x: -53, y: F + 3, z: -14, r: 4.5, done: !!ctx.S().ruin, fn: () => ctx.findRuin() });
  L.targets.push({ x: -53, y: F + 3, z: -14, color: 0xb98cff, kind: 'ruin', alive: () => !ctx.S().ruin });
  L.updaters.push(() => { glyph.rotation.z = L.time * 0.5; glyphM.color.setHex(ctx.S().ruin ? 0xffe066 : 0x4ff7e6); });
  // columnas caídas decorativas
  const cb = new GeoBuilder(121);
  for (const [x, z, a] of [[20, -30, 0.3], [-24, 30, 1.2], [34, 20, 2.0], [-34, -36, 0.8]]) { const y = height(x, z); cb.add(new THREE.CylinderGeometry(0.8, 0.9, 7, 8), PAL.stoneLight, [x, y + 0.7, z], [Math.PI / 2, a, 0], [1, 1, 1], 0.05); cb.cyl(x + 3, y + 1.6, z + 2, 0.8, 0.9, 3.2, 8, PAL.stone); }
  L.root.add(new THREE.Mesh(cb.build(), ctx.mats.world));
  // módulo, sondas, puerta acuática
  addModule(L, ctx, 'reef', 16, 28, 150);
  addProbe(L, ctx, 'p1', -30, 12); addProbe(L, ctx, 'p2', 34, -6); addProbe(L, ctx, 'p3', -6, -34);
  const gy = height(0, -48);
  L.gate = addGate(L, ctx, { id: 'reef_city', x: 0, y: gy + 0.4, z: -48, to: 2, spawn: 'entry', label: 'Descender a la Ciudad Sumergida',
    isOpen: () => ['p1', 'p2', 'p3'].every(k => ctx.S().probes[k]), lockedMsg: () => `Puerta acuática sellada: activá las sondas (${['p1', 'p2', 'p3'].filter(k => ctx.S().probes[k]).length}/3)` });
  L.spawns.entry = { x: 0, y: gy + 8, z: -40, yaw: Math.PI };
  // fauna y rivales
  L.schools = makeSchools(L.root, ctx.mats, [
    { x: -18, y: -16, z: 20, rx: 9, ry: 2, rz: 7, speed: 1 }, { x: 24, y: -15, z: -18, rx: 8, ry: 3, rz: 9, speed: 1.3 }, { x: -6, y: -26, z: -40, rx: 10, ry: 2, rz: 5, speed: 0.8 },
  ], 0x9fe8ff, 0x4ff7e6);
  L.ents.push(...L.schools.ents);
  const J = makeJellies(L.root, [[-12, -14, 8], [8, -18, -6], [22, -12, 14], [-26, -16, -10], [4, -22, -26], [-14, -26, -40], [28, -20, -30]]);
  L.ents.push(...J.ents); L.updaters.push((dt, c) => J.update(dt, c));
  L.ents.push(makeManta(L.root, ctx.mats, 6, -18, -4, 22));
  L.ents.push(makeTurtle(L.root, ctx.mats, [[-20, -8, 36], [-34, -10, 20], [-20, -12, 2], [-4, -9, 24]]));
  for (const [id, x, y, z] of [['c1', -40, -18, 28], ['c2', 44, -14, 30], ['c3', 46, -20, -36], ['c4', -40, -30, -44], ['c5', 2, -10, 10]]) addCell(L, ctx, 'r_' + id, /** @type {number} */ (x), /** @type {number} */ (y), /** @type {number} */ (z));
  L.addLight(0xff5fd2, -20, -22, 10, 8, 18); L.addLight(0x4ff7e6, 22, -22, -16, 8, 18); L.addLight(0xffe066, -8, -30, -36, 8, 18);
  return L;
}

/* ======================= ZONA 2: CIUDAD ======================= */
export function buildCity(ctx) {
  const L = baseLevel(ctx, 2, 'Ciudad Sumergida');
  const FLOOR = -56;
  const height = (x, z) => {
    let h = FLOOR + 0.5 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.3 * Math.sin(x * 0.53 + z * 0.4);
    const e = Math.max(ss(60, 70, Math.abs(x)), ss(60, 70, Math.abs(z)));
    return h + (2 - h) * e;
  };
  const colorFn = (x, y, z, ny, c) => {
    const street = (Math.abs(x % 16) < 3 || Math.abs(z % 16) < 3);
    c.setHex(street ? 0x5a6460 : 0x4a4a3a).lerp(_c2.setHex(0x3a4a48), (Math.sin(x * 0.3) + 1) * 0.15);
    if (ny < 0.75) c.setHex(PAL.rockDark);
  };
  addTerrain(L, ctx, height, colorFn, 160);
  L.world.ceil = -2; L.world.bound = { x0: -66, x1: 66, z0: -66, z1: 66 };
  L.env = { fog: 0x073a52, density: 0.026, bg: 0x073a52, sky: 0x7fd0ff, ground: 0x1a2a30, hemi: 0.95, sun: 0x9fdcff, sunI: 0.9, snow: 0xa8d8ee, rays: 0.4, top: -2, caus: 0.45, surface: false };
  // bóveda de roca
  const ceil = new GeoBuilder(201);
  ceil.box(0, 1.5, 0, 160, 3, 160, 0x16222a, 0.02, 0, false);
  const r = rng(202);
  for (let i = 0; i < 70; i++) { const x = (r() - 0.5) * 128, z = (r() - 0.5) * 128, h = 2 + r() * 7; ceil.add(new THREE.ConeGeometry(0.8 + r() * 1.6, h, 5), 0x22313a, [x, -h / 2 + 0.1, z], [Math.PI, r() * 6, 0], [1, 1, 1], 0.1); }
  L.root.add(new THREE.Mesh(ceil.build(), ctx.mats.world));
  addShaft(L, ctx, -30, 0, 40, 44, 5); addShaft(L, ctx, 26, 0, -6, 40, 4); addShaft(L, ctx, -8, 0, -46, 42, 4);
  // murallas de contención con huecos para las puertas hidráulicas
  const wb = new GeoBuilder(203), glowB = new GeoBuilder(204);
  const wall = (zc) => {
    for (const [x0, x1] of [[-70, -4], [4, 70]]) {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      wb.box(cx, -29, zc, w, 62, 2.4, PAL.stoneDark, 0.03); L.world.boxes.push(box(cx, -29, zc, w, 62, 2.4, 'wall'));
      for (let x = x0 + 4; x < x1 - 2; x += 8) { wb.box(x, -40, zc + 1.3, 1.6, 30, 0.6, PAL.stone, 0.05); glowB.box(x + 3.5, -46 + (Math.abs(x) % 3) * 6, zc + 1.25, 1.2, 1.8, 0.1, 0xffd27a, 0, 0, false); glowB.box(x + 3.5, -46 + (Math.abs(x) % 3) * 6, zc - 1.25, 1.2, 1.8, 0.1, 0xffd27a, 0, 0, false); }
    }
    wb.box(0, -24, zc, 8, 48, 2.4, PAL.stoneDark, 0.03); L.world.boxes.push(box(0, -24, zc, 8, 48, 2.4, 'wall'));
    wb.box(0, -47.4, zc, 10, 1.2, 3, 0xffb547, 0.02);
    wb.box(-4.6, -52, zc, 1.2, 9, 3, PAL.steelDark, 0.02); wb.box(4.6, -52, zc, 1.2, 9, 3, PAL.steelDark, 0.02);
  };
  wall(22); wall(-20);
  // edificios por distrito
  const bld = (x, z, w, d, h, tint = PAL.stone) => {
    const y0 = FLOOR - 1, cy = y0 + h / 2;
    wb.box(x, cy, z, w, h, d, tint, 0.06);
    L.world.boxes.push(box(x, cy, z, w, h, d, 'bld'));
    wb.box(x, y0 + h + 0.4, z, w + 0.6, 0.8, d + 0.6, PAL.stoneDark, 0.04);
    for (let yy = y0 + 3; yy < y0 + h - 1.5; yy += 3.5) {
      for (let k = -w / 2 + 1.5; k < w / 2 - 1; k += 2.6) {
        const lit = ((x * 7 + z * 3 + yy * 5 + k * 11) | 0) % 5 === 0;
        (lit ? glowB : wb).box(x + k, yy, z + d / 2 + 0.05, 1.1, 1.6, 0.1, lit ? 0xffe0a0 : 0x0c141a, 0, 0, false);
        (lit ? glowB : wb).box(x + k, yy, z - d / 2 - 0.05, 1.1, 1.6, 0.1, lit ? 0x9fe8ff : 0x0c141a, 0, 0, false);
      }
    }
    if (h > 14) { wb.boxR(x + w * 0.2, y0 + h + 1.5, z, w * 0.5, 3, d * 0.5, tint, [0.15, 0, 0.2]); }
  };
  // sur (entrada)
  [[-38, 44, 10, 8, 18], [-20, 54, 8, 8, 12], [26, 50, 12, 8, 22], [44, 34, 8, 10, 14], [-48, 30, 8, 8, 10], [16, 34, 6, 6, 8], [-14, 34, 6, 6, 9]].forEach(a => bld(a[0], a[1], a[2], a[3], a[4]));
  // plaza
  [[-40, 8, 10, 10, 20], [-46, -10, 8, 8, 14], [26, 10, 6, 6, 10], [-26, 14, 6, 6, 8]].forEach(a => bld(a[0], a[1], a[2], a[3], a[4], 0x6d7a78));
  // norte (hangar)
  [[-40, -40, 12, 12, 24], [40, -32, 10, 10, 16], [-30, -58, 10, 6, 12], [44, -56, 8, 8, 10]].forEach(a => bld(a[0], a[1], a[2], a[3], a[4], 0x5f6a66));
  // callejón de columnas (cápsula) al este de la plaza
  for (let i = 0; i < 14; i++) {
    const x = 40 + (i % 2) * 7 + (i % 4 === 0 ? 3 : 0), z = -14 + Math.floor(i / 2) * 4.4;
    wb.cyl(x, FLOOR + 6, z, 0.9, 1.1, 14, 8, PAL.stoneLight, 0.05);
    L.world.boxes.push(box(x, FLOOR + 6, z, 1.8, 14, 1.8, 'col'));
  }
  wb.box(56, FLOOR + 13.5, 0, 16, 1.4, 34, PAL.stoneDark); L.world.boxes.push(box(56, FLOOR + 13.5, 0, 16, 1.4, 34, 'roof'));
  wb.box(63, FLOOR + 7, 0, 2, 14, 34, PAL.stone); L.world.boxes.push(box(63, FLOOR + 7, 0, 2, 14, 34, 'wall'));
  // estatua caída en la plaza
  wb.add(new THREE.CylinderGeometry(1.2, 1.4, 9, 8), PAL.stoneLight, [-14, FLOOR + 1.1, 6], [Math.PI / 2, 0.6, 0], [1, 1, 1], 0.04);
  wb.sph(-18, FLOOR + 1.6, 9, 1.8, PAL.stoneLight, [1, 1.1, 1], 0);
  L.world.balls.push({ x: -18, y: FLOOR + 1.6, z: 9, r: 1.9, on: true, tag: 'statue' });
  // avión hundido (hangar norte)
  const fus = new GeoBuilder(205);
  fus.add(new THREE.CylinderGeometry(2.2, 2.2, 20, 12, 1, true), 0xb8c4cc, [0, FLOOR + 2.4, -44], [0, 0, Math.PI / 2 + 0.06], [1, 1, 1], 0.04);
  fus.add(new THREE.ConeGeometry(2.2, 4, 12), 0xb8c4cc, [-12, FLOOR + 2.2, -44], [0, 0, Math.PI / 2], [1, 1, 1], 0.04);
  fus.boxR(-1, FLOOR + 1.8, -51, 6, 0.4, 12, 0x9aa6ae, [0, 0.25, 0.08]); fus.boxR(-1, FLOOR + 1.8, -37, 6, 0.4, 10, 0x9aa6ae, [0, -0.3, -0.1]);
  fus.boxR(11, FLOOR + 4.6, -44, 3, 4.5, 0.4, 0xd84a3a, [0, 0, 0.2]); fus.boxR(10, FLOOR + 3, -46.5, 3, 0.3, 4, 0x9aa6ae, [0, 0, 0]);
  L.root.add(new THREE.Mesh(fus.build(), ctx.mats.world));
  L.world.boxes.push(box(-1, FLOOR + 2.4, -44, 19, 4.4, 4.4, 'plane'));
  L.root.add(new THREE.Mesh(wb.build(), ctx.mats.world));
  L.root.add(new THREE.Mesh(glowB.build(), ctx.mats.glow));
  scatterCorals(L, ctx, 21, 120, { x0: -60, x1: 60, z0: -60, z1: 60 }, [0x4a8a6a, 0x7a5a9a, 0x9a7a4a, 0x3a7a8a], (x, z) => Math.abs(z - 22) < 4 || Math.abs(z + 20) < 4 || Math.hypot(x, z - 2) < 8, { kinds: ['tube', 'kelp', 'fan'], glowPal: [0x9dffb0, 0x4ff7e6], scale: 1.2 });
  scatterRocks(L, ctx, 22, 30, { x0: -60, x1: 60, z0: -60, z1: 60 }, (x, z) => Math.abs(z - 22) < 5 || Math.abs(z + 20) < 5 || Math.abs(x) < 6, 0x4a5050, 0.7);
  // entrada desde el arrecife (escotilla en la bóveda)
  addGate(L, ctx, { id: 'city_reef', x: 0, y: -1.2, z: 58, ceiling: true, to: 1, spawn: 'entry', label: 'Subir a los Arrecifes', isOpen: () => true, lockedMsg: () => '' });
  L.spawns.entry = { x: 0, y: -9, z: 56, yaw: Math.PI };
  L.spawns.trench = { x: 26, y: FLOOR + 9, z: -42, yaw: Math.PI };
  // puertas hidráulicas
  addDoor(L, ctx, { id: 'd1', x: 0, y: -52, z: 22, w: 8, h: 8, panel: [9, -53.2, 25.6, 0] });
  addDebris(L, ctx, { id: 'panel', x: -9, y: -54, z: -15.6, ax: 1, az: 0, max: 4.5, clear: 3.2, w: 3.6, h: 3.6, d: 2.2, kind: 'beam' });
  addDoor(L, ctx, { id: 'd2', x: 0, y: -52, z: -20, w: 8, h: 8, panel: [-9, -53.2, -18.2, 0], blockedBy: 'panel' });
  // módulo de la ciudad y puerta a la fosa
  addModule(L, ctx, 'city', 0, 2, 300);
  addGate(L, ctx, { id: 'city_trench', x: 26, y: FLOOR + 0.6, z: -50, to: 3, spawn: 'entry', label: 'Descender a la Fosa Silenciosa',
    isOpen: () => ctx.S().blackbox === 'delivered', lockedMsg: () => 'Sellada: el código de acceso está en la caja negra' });
  // carga
  addCargo(L, ctx, 'blackbox', blackBoxGeo(), 12, FLOOR + 1.1, -44.5, 'Enganchar la caja negra');
  addCargo(L, ctx, 'capsule', capsuleGeo(), 55, FLOOR + 1.0, 4, 'Enganchar la cápsula de escape');
  // rivales
  L.ents.push(makeDrone(L.root, ctx.mats, [[-30, -44, 14], [30, -44, 14], [30, -44, -12], [-30, -44, -12]]));
  L.ents.push(makeDrone(L.root, ctx.mats, [[10, -46, 44], [-28, -46, 40], [-28, -46, 28], [24, -46, 28]]));
  const pipe = new GeoBuilder(206);
  const eels = [{ x: 12, y: -54.4, z: -32, dx: 0, dy: 0, dz: -1, len: 15 }, { x: -58, y: -51, z: 0, dx: 1, dy: 0, dz: 0, len: 13 }];
  for (const d of eels) {
    const alongX = Math.abs(d.dx) > 0.5, bx = d.x - d.dx * 2.6, bz = d.z - d.dz * 2.6;
    pipe.add(new THREE.CylinderGeometry(1.5, 1.5, 6, 10, 1, true), 0x5a4a3a, [bx, d.y, bz], alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], [1, 1, 1], 0.05);
    pipe.add(new THREE.TorusGeometry(1.5, 0.3, 4, 12), 0x8a4a2a, [d.x + d.dx * 0.3, d.y, d.z + d.dz * 0.3], alongX ? [0, Math.PI / 2, 0] : [0, 0, 0], [1, 1, 1], 0.03);
    pipe.box(bx, d.y - 1.9, bz, alongX ? 6 : 1.4, 0.6, alongX ? 1.4 : 6, PAL.steelDark);
    L.world.boxes.push(box(bx, d.y + 1.7, bz, alongX ? 6 : 3.2, 0.4, alongX ? 3.2 : 6, 'pipe'), box(bx, d.y - 1.7, bz, alongX ? 6 : 3.2, 0.4, alongX ? 3.2 : 6, 'pipe'));
    L.ents.push(makeEel(L.root, ctx.mats, d));
  }
  L.root.add(new THREE.Mesh(pipe.build(), ctx.mats.world));
  const J = makeJellies(L.root, [[-24, -40, 40], [30, -36, 40], [10, -30, -6]]);
  L.ents.push(...J.ents); L.updaters.push((dt, c) => J.update(dt, c));
  L.schools = makeSchools(L.root, ctx.mats, [{ x: -20, y: -38, z: 40, rx: 10, ry: 3, rz: 6, speed: 1 }, { x: 10, y: -36, z: -40, rx: 12, ry: 3, rz: 8, speed: 0.9 }], 0xc8d8e8, 0xffe066);
  L.ents.push(...L.schools.ents);
  for (const [id, x, y, z] of [['c1', -46, -50, 52], ['c2', 50, -40, 50], ['c3', -50, -51, 0], ['c4', 52, -52, -10], ['c5', -14, -52, -32], ['c6', 40, -46, -46]]) addCell(L, ctx, 'k_' + id, /** @type {number} */ (x), /** @type {number} */ (y), /** @type {number} */ (z));
  L.addLight(0xffd27a, -30, -40, 22, 8, 22); L.addLight(0x9fe8ff, 30, -40, -24, 8, 22); L.addLight(0xffd27a, 0, -44, -40, 8, 22); L.addLight(0x9fe8ff, 30, -42, 40, 8, 22);
  return L;
}

/* ======================= ZONA 3: FOSA ======================= */
export const OCTO = { a: 2.4, r: 38 };
export function buildTrench(ctx) {
  const L = baseLevel(ctx, 3, 'Fosa Silenciosa');
  const height = (x, z) => {
    const r = Math.hypot(x, z), n = 2 * Math.sin(x * 0.11) * Math.cos(z * 0.13) + 1.2 * Math.sin(x * 0.27 + z * 0.2);
    let h;
    if (r < 26) h = -100 + n * 0.25;
    else if (r < 46) { const t = (r - 26) / 20; h = -100 + t * t * (3 - 2 * t) * 76 + n * 1.5 + Math.sin(Math.atan2(z, x) * 5 + r * 0.3) * 3 * Math.sin(t * Math.PI); }
    else h = -24 + n + ss(64, 78, r) * 26;
    // repisa de la guarida del pulpo
    const a = Math.atan2(z, x); let da = a - OCTO.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) < 0.32 && r > 31 && r < 44) h = Math.max(h, -64 + n * 0.3);
    return h;
  };
  const colorFn = (x, y, z, ny, c) => {
    c.setHex(0x2a3442).lerp(_c2.setHex(0x101622), Math.min(1, Math.max(0, (-y - 30) / 70)));
    if (ny < 0.7) c.lerp(_c2.setHex(0x0c1018), 0.6);
    if (Math.sin(x * 0.7) * Math.cos(z * 0.6) > 0.85) c.lerp(_c2.setHex(0x2a5a5a), 0.4);
  };
  addTerrain(L, ctx, height, colorFn, 170);
  L.world.ceil = -1; L.world.bound = { r: 76 };
  L.env = { fog: 0x04142a, density: 0.034, bg: 0x04142a, sky: 0x3a5a8a, ground: 0x05080e, hemi: 0.75, sun: 0x6a8ab0, sunI: 0.35, snow: 0x7f9fb8, rays: 0, top: -1, caus: 0.0, surface: false };
  L.spawns.entry = { x: 0, y: -8, z: 62, yaw: Math.PI };
  L.spawns.arena = { x: 0, y: -86, z: 20, yaw: Math.PI };
  addGate(L, ctx, { id: 'trench_city', x: 0, y: -0.6, z: 66, ceiling: true, to: 2, spawn: 'trench', label: 'Subir a la Ciudad', isOpen: () => true, lockedMsg: () => '' });
  addModule(L, ctx, 'trench', 16, 56, 300);
  scatterRocks(L, ctx, 31, 60, { x0: -70, x1: 70, z0: -70, z1: 70 }, (x, z) => Math.hypot(x, z) < 26 || Math.hypot(x - 16, z - 56) < 8 || Math.hypot(x, z - 64) < 9, 0x1e2632, 1.3);
  // agujas de roca
  const sp = new GeoBuilder(301), r = rng(302);
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = 48 + r() * 22, x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.hypot(x - 16, z - 56) < 10 || Math.hypot(x, z - 62) < 10) continue; const h = 8 + r() * 18, y = height(x, z); sp.add(new THREE.ConeGeometry(1.5 + r() * 2, h, 5), 0x1a2230, [x, y + h / 2 - 1, z], [0, r() * 6, 0], [1, 1, 1], 0.1); L.world.balls.push({ x, y: y + h * 0.2, z, r: 1.8, on: true, tag: 'spire' }); }
  L.root.add(new THREE.Mesh(sp.build(), ctx.mats.world));
  // gusanos tubícolas bioluminiscentes en el fondo
  scatterCorals(L, ctx, 33, 90, { x0: -40, x1: 40, z0: -40, z1: 40 }, [0x3a2a4a, 0x2a3a4a, 0x4a3a2a], (x, z) => Math.hypot(x, z) < 15 || Math.hypot(x, z) > 34, { kinds: ['tube', 'kelp'], glowPal: [0xff5fd2, 0x4ff7e6, 0xb98cff], scale: 0.9 });
  // faro, pilares de válvulas y consola del reactor
  const beacon = new THREE.Mesh(beaconGeo(), ctx.mats.world); beacon.position.set(0, -100, 0); L.root.add(beacon);
  const lampM = new THREE.MeshBasicMaterial({ color: 0x223040, transparent: true, opacity: 0.95 });
  const lamp = new THREE.Mesh(lampGeo(), lampM); lamp.position.copy(beacon.position); L.root.add(lamp);
  const beamM = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 9, 90, 16, 1, true), beamM); beam.position.set(0, -84 + 45, 0); beam.renderOrder = 6; L.root.add(beam);
  L.world.boxes.push(box(0, -99, 0, 11, 2.2, 11, 'beacon'), box(0, -88, 0, 4.6, 22, 4.6, 'beacon'));
  const beaconLight = new THREE.PointLight(0xffe9a8, 0, 60, 1.2); beaconLight.position.set(0, -82, 0); L.root.add(beaconLight);
  L.beacon = { lamp, lampM, beam, beamM, light: beaconLight, k: ctx.S().beacon ? 1 : 0, flicker: 0 };
  L.pillars = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + i * 2.094, x = Math.cos(a) * 15, z = Math.sin(a) * 15;
    const m = new THREE.Mesh(L.pillarGeo || (L.pillarGeo = pillarGeo()), ctx.mats.world); m.position.set(x, -100, z); m.rotation.y = -a + Math.PI / 2; L.root.add(m);
    L.world.boxes.push(box(x, -97.5, z, 2.4, 5, 2.4, 'pillar'));
    L.pillars.push({ x, y: -100, z, m });
  }
  L.console = { x: 0, y: -96.5, z: 7.5 };
  const cb = new GeoBuilder(303); cb.box(0, -98.5, 6.8, 3, 1.6, 1.4, PAL.steelDark); cb.boxR(0, -97.4, 6.8, 2.6, 0.2, 1.4, 0x14202a, [-0.5, 0, 0]);
  L.root.add(new THREE.Mesh(cb.build(), ctx.mats.world));
  L.targets.push({ x: 0, y: -90, z: 0, color: 0xffe9a8, kind: 'beacon' });
  // corriente ascendente (aparece con el faro encendido)
  const curM = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cur = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 30, 14, 1, true), curM); cur.position.set(0, -80, 19); L.root.add(cur);
  L.current = { x: 0, y: -90, z: 19, m: cur, mat: curM };
  L.triggers.push({ x: 0, y: -88, z: 19, r: 4.2, repeat: true, can: () => ctx.S().beacon && !L.boss?.active, fn: () => ctx.ascend() });
  L.updaters.push(dt => {
    const B = L.beacon, on = ctx.S().beacon;
    const want = on ? 1 : B.flicker > 0 ? (Math.random() > 0.5 ? 0.6 : 0.1) : 0; B.flicker -= dt;
    B.k += (want - B.k) * Math.min(1, dt * 2);
    B.lampM.color.setRGB(0.15 + B.k * 1.4, 0.18 + B.k * 1.3, 0.25 + B.k * 0.9);
    B.beamM.opacity = B.k * (0.12 + Math.sin(L.time * 1.3) * 0.03);
    B.light.intensity = B.k * 40;
    curM.opacity = on && !L.boss?.active ? 0.14 + Math.sin(L.time * 3) * 0.05 : 0;
    if (on && !L.boss?.active && Math.random() < dt * 20) ctx.fx.bubbles(L.current.x + (Math.random() - 0.5) * 3, L.current.y + Math.random() * 4, L.current.z + (Math.random() - 0.5) * 3, 1, 0.5, 0.2);
  });
  // rivales y fauna
  const oy = height(Math.cos(OCTO.a) * OCTO.r, Math.sin(OCTO.a) * OCTO.r);
  L.octopus = makeOctopus(L.root, { x: Math.cos(OCTO.a) * OCTO.r, y: oy + 0.4, z: Math.sin(OCTO.a) * OCTO.r, ry: -OCTO.a - Math.PI / 2, R: 14 });
  L.ents.push(L.octopus);
  L.ents.push(...makeAnglers(L.root, ctx.mats, [[22, -60, -10], [-18, -78, -20], [10, -84, 22], [-26, -50, 10]], ctx.qual().bioLights));
  L.schools = makeSchools(L.root, ctx.mats, [{ x: 30, y: -40, z: -30, rx: 10, ry: 4, rz: 10, speed: 0.7 }], 0xff9a7a, 0xff5fd2);
  L.ents.push(...L.schools.ents);
  for (const [id, x, y, z] of [['c1', -30, -30, 50], ['c2', Math.cos(OCTO.a) * 41, oy + 2, Math.sin(OCTO.a) * 41], ['c3', 30, -70, 6], ['c4', -20, -92, -16], ['c5', 50, -26, -30]]) addCell(L, ctx, 't_' + id, /** @type {number} */ (x), /** @type {number} */ (y), /** @type {number} */ (z));
  L.addLight(0xff5fd2, -12, -94, 12, 8, 16); L.addLight(0x4ff7e6, 14, -94, -10, 8, 16); L.addLight(0xb98cff, -20, -60, 30, 8, 16); L.addLight(0x4ff7e6, 30, -30, 40, 8, 18);
  L.spawns.trench = L.spawns.entry;
  return L;
}

export const BUILDERS = { 1: buildReef, 2: buildCity, 3: buildTrench };
