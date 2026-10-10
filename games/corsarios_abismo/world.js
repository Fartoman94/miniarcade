// @ts-check
/* Corsarios del Abismo — construcción de cada región: islas (terreno fusionado en un solo draw call), palmeras,
   rocas y coral instanciados, muelles con mercado, faros, cañones de costa, tesoros enterrados, cofres, náufragos,
   cueva, fuerte y corrientes de salida. También alturas del terreno, colisión de barcos con la costa y la
   prueba de línea de tiro (segmento contra islas) que usan los cañones. */
import * as THREE from 'three';
import { REGIONS } from './config.js';
import { Builder, vmat, glowMat, islandGeo, islandHeight, palmGeo, rockGeo, coralGeo, islandDecor, caveDecor, dockDecor, lighthouseDecor, fortDecor,
  cannonBase, cannonTurretGeo, rubbleGeo, chestGeos, xMarkGeo, holeGeo, castawayModel, flagMesh, gateModel } from './models.js';
import { waveHeight } from './water.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
let shared = /** @type {any} */ (null);
function sharedGeos() {
  if (!shared) shared = { palm: palmGeo(), rock: rockGeo(), coral: coralGeo(), turret: cannonTurretGeo(false), rubble: rubbleGeo(), chest: chestGeos(), x: xMarkGeo(), hole: holeGeo() };
  return shared;
}

/**
 * @param {string} id
 * @param {{rs:any, rand:()=>number, q:any}} o rs = estado persistente de la región (save.regions[id])
 */
export function createRegion(id, o) {
  const R = /** @type {any} */ (REGIONS)[id];
  const env = R.env, rand = o.rand, rs = o.rs;
  const group = new THREE.Group(); group.name = 'region-' + id;
  const G = sharedGeos();
  const mat = vmat();
  const islands = R.islands.map((isl, i) => ({ ...isl, seed: i * 1.7 + R.idx }));
  const islById = Object.fromEntries(islands.map(i => [i.id, i]));
  const heightAt = (x, z) => { let h = -3; for (const isl of islands) { const d = Math.hypot(x - isl.x, z - isl.z); if (d < isl.r * 1.35) h = Math.max(h, islandHeight(isl, x, z)); } return h; };

  /* ---------- terreno y decoración estática (1 malla) ---------- */
  const b = new Builder();
  for (const isl of islands) { b.add(islandGeo(isl, env), -1); islandDecor(b, isl, rand); }
  if (R.cave) caveDecor(b, R.cave, islById[R.cave.isl]);
  /** @type {any[]} */ const docks = [];
  for (const d of R.docks) { const info = dockDecor(b, d, islById[d.isl]); docks.push({ ...d, ...info, visited: !!rs.dock }); }
  /** @type {any[]} */ const lighthouses = [];
  for (const lh of R.lighthouses) { const isl = islands.reduce((a, i) => Math.hypot(i.x - lh.x, i.z - lh.z) < Math.hypot(a.x - lh.x, a.z - lh.z) ? i : a, islands[0]); const top = lighthouseDecor(b, lh, islandHeight(isl, lh.x, lh.z)); lighthouses.push({ ...lh, top }); }
  let fort = null;
  if (R.fort) { const isl = islById[R.fort.isl]; const by = fortDecor(b, R.fort, isl); fort = { ...R.fort, batteryY: by, gy: islandHeight(isl, isl.x, isl.z), captured: false, raise: 0, flag: /** @type {any} */ (null) }; dockDecor(b, { pier: R.fort.pier }, isl); }
  for (const c of R.cannons) cannonBase(b, c.x, c.battery ? fort.batteryY - 0.6 : heightAt(c.x, c.z), c.z, c.battery);
  const terrain = new THREE.Mesh(b.build(), mat);
  terrain.receiveShadow = true; terrain.castShadow = true; terrain.name = 'terreno';
  group.add(terrain);

  /* ---------- palmeras, rocas y coral instanciados ---------- */
  const avoid = [...R.chests, ...R.treasures, ...R.cannons, ...(R.cave ? [R.cave] : []), ...docks.map(d => d.market)];
  function scatter(isl, n, minT, maxT) {
    const out = [];
    for (let k = 0, tries = 0; k < n && tries < n * 30; tries++) {
      const a = rand() * Math.PI * 2, t = minT + rand() * (maxT - minT), x = isl.x + Math.cos(a) * isl.r * t, z = isl.z + Math.sin(a) * isl.r * t;
      if (avoid.some(p => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
      if (fort && isl.id === fort.isl && Math.abs(x - isl.x) < fort.wall + 4 && Math.abs(z - isl.z) < fort.wall + 4) continue;
      out.push([x, heightAt(x, z), z]); k++;
    }
    return out;
  }
  const palmPts = [], rockPts = [], coralPts = [];
  for (const isl of islands) {
    if (isl.palms) palmPts.push(...scatter(isl, isl.palms, 0.25, 0.82));
    if (!isl.rock && !isl.coral) rockPts.push(...scatter(isl, Math.ceil(isl.r / 6), 0.6, 0.95));
    if (isl.rock) rockPts.push(...scatter(isl, 3, 0.3, 0.9));
    if (isl.coral) coralPts.push(...scatter(isl, 7, 0, 0.8));
    if (isl.fort) coralPts.push(...scatter(isl, 14, 0.82, 1.02));
  }
  // order shuffle so lowering quality keeps an even spread
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  function inst(geo, pts, scl) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
    shuffle(pts).forEach(([x, y, z], i) => { const s = scl[0] + rand() * scl[1]; _m.compose(_p.set(x, y - 0.1, z), _q.setFromEuler(_e.set(0, rand() * 6.28, 0)), _s.set(s, s, s)); m.setMatrixAt(i, _m); });
    m.count = pts.length; m.castShadow = true; m.receiveShadow = true; m.userData.total = pts.length;
    group.add(m); return m;
  }
  const decor = [inst(G.palm, palmPts, [0.85, 0.4]), inst(G.rock, rockPts, [0.7, 0.9]), inst(G.coral, coralPts, [0.8, 0.8])];

  /* ---------- faros (luz giratoria) ---------- */
  for (const lh of lighthouses) {
    if (lh.broken) continue;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 38, 16, 1, true).translate(0, -19, 0).rotateZ(Math.PI / 2), glowMat(0xfff0a0, { opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.set(lh.x, lh.top + 1.0, lh.z);
    group.add(beam); lh.beam = beam;
  }

  /* ---------- muelles: faroles que se encienden al atracar ---------- */
  for (const d of docks) {
    const lb = new Builder(); for (const [x, y, z] of d.lamps) lb.box(0.35, 0.45, 0.35, 0xffffff, x, y, z);
    d.lampMesh = new THREE.Mesh(lb.build(), glowMat(0xffd27a, { opacity: d.visited ? 1 : 0.35 }));
    group.add(d.lampMesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.2, 7, 32).rotateX(-Math.PI / 2), glowMat(0xffbe3d, { opacity: 0.4, side: THREE.DoubleSide }));
    ring.position.set(d.x, 0.3, d.z); group.add(ring); d.ring = ring;
    const fl = flagMesh(0xffbe3d); fl.position.set(d.market.x, d.market.y + 5.2, d.market.z); group.add(fl); d.flag = fl;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3), vmat()); pole.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pole.geometry.attributes.position.count * 3).fill(0.2), 3));
    pole.position.set(d.market.x, d.market.y + 4.1, d.market.z); group.add(pole);
    d.anim = 0;
  }
  if (fort) {
    fort.flagPos = R.fort.flag; fort.flag = flagMesh(0x151515); fort.flag.position.set(R.fort.flag.x, fort.gy + 10.2, R.fort.flag.z); group.add(fort.flag);
    fort.ring = new THREE.Mesh(new THREE.RingGeometry(6.2, 7, 32).rotateX(-Math.PI / 2), glowMat(0xffbe3d, { opacity: 0.4, side: THREE.DoubleSide }));
    fort.ring.position.set(R.fort.dock.x, 0.3, R.fort.dock.z); group.add(fort.ring);
  }

  /* ---------- cañones de costa / baterías ---------- */
  const cannons = R.cannons.map(c => {
    const y = c.battery ? fort.batteryY : heightAt(c.x, c.z) + 1.4;
    const turret = new THREE.Mesh(G.turret, mat); turret.position.set(c.x, y, c.z); turret.castShadow = true; group.add(turret);
    const rubble = new THREE.Mesh(G.rubble, mat); rubble.position.set(c.x, y - 0.2, c.z); rubble.visible = false; group.add(rubble);
    const destroyed = rs.cannons.includes(c.id);
    turret.visible = !destroyed; rubble.visible = destroyed;
    return { ...c, y, turret, rubble, destroyed, maxHp: c.hp, hp: c.hp, yaw: rand() * 6.28, pitch: 0.4, cd: 2 + rand() * 2, tele: 0, flash: 0, spiked: false, smokeT: 0 };
  });

  /* ---------- tesoros enterrados ---------- */
  const treasures = R.treasures.map(t => {
    const y = heightAt(t.x, t.z);
    const mark = new THREE.Mesh(G.x, mat); mark.position.set(t.x, y + 0.08, t.z); group.add(mark);
    const hole = new THREE.Mesh(G.hole, mat); hole.position.set(t.x, y + 0.02, t.z); group.add(hole);
    const dug = rs.dug.includes(t.id);
    mark.visible = !dug; hole.visible = dug;
    return { ...t, y, mark, hole, dug, progress: 0, chest: /** @type {any} */ (null) };
  });

  /* ---------- cofres ---------- */
  function makeChest(x, y, z, yaw, opened) {
    const base = new THREE.Mesh(G.chest.base, mat), lid = new THREE.Mesh(G.chest.lid, mat), gold = new THREE.Mesh(G.chest.gold, mat);
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
    lid.position.set(0, 0.8, -0.45); gold.visible = !opened;
    g.add(base, lid, gold); group.add(g);
    if (opened) lid.rotation.x = -1.9;
    base.castShadow = true;
    return { g, lid, gold, open: opened ? 1 : 0, opening: false };
  }
  const chests = R.chests.map(c => {
    const y = heightAt(c.x, c.z), isl = islById[c.isl];
    const opened = rs.chests.includes(c.id);
    const ch = makeChest(c.x, y, c.z, Math.atan2(isl.x - c.x, isl.z - c.z) + Math.PI, opened);
    return { ...c, y, ...ch, opened };
  });
  // los tesoros ya desenterrados muestran su cofre abierto
  for (const t of treasures) if (t.dug) t.chest = makeChest(t.x + 1.4, t.y, t.z, 0.4, true);

  /* ---------- náufragos ---------- */
  const castaways = R.castaways.map(c => {
    const m = castawayModel(); m.group.position.set(c.x, 0, c.z); group.add(m.group);
    const rescued = rs.rescued.includes(c.id); m.group.visible = !rescued;
    return { ...c, ...m, rescued, ph: rand() * 6 };
  });

  /* ---------- cueva ---------- */
  const cave = R.cave ? { ...R.cave, found: !!rs.cave, y: heightAt(R.cave.x, R.cave.z) } : null;

  /* ---------- corrientes (salidas) ---------- */
  const gates = R.gates.map(g => { const m = gateModel(); m.group.position.set(g.x, 0, g.z); group.add(m.group); return { ...g, ...m, active: false }; });

  /* ---------- colisión ---------- */
  /** Empuja un círculo fuera de las costas. Devuelve la isla tocada o null. @param {{x:number,z:number}} c @param {number} r */
  function pushOut(c, r) {
    let hit = null;
    for (const isl of islands) {
      const dx = c.x - isl.x, dz = c.z - isl.z, d = Math.hypot(dx, dz) || 0.001, k = coast(isl, dx, dz), min = isl.r * k * 0.97 + r;
      if (d < min) { c.x = isl.x + dx / d * min; c.z = isl.z + dz / d * min; hit = isl; }
    }
    if (fort) { // el muelle del fuerte no es sólido: el resto de la isla sí (ya incluido)
    }
    return hit;
  }
  const coast = (isl, dx, dz) => { const a = Math.atan2(dz, dx), s = isl.seed || 0; return 1 + 0.05 * Math.sin(3 * a + s) + 0.03 * Math.sin(7 * a + s * 2.3); };
  /** ¿El segmento (línea de tiro) cruza alguna isla alta? (raycast 2D contra cilindros) */
  function blocked(x0, z0, x1, z1, skip) {
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1;
    for (const isl of islands) {
      if (isl === skip || isl.h < 3.5) continue;
      let t = ((isl.x - x0) * dx + (isl.z - z0) * dz) / L2; t = Math.max(0, Math.min(1, t));
      const px = x0 + dx * t - isl.x, pz = z0 + dz * t - isl.z;
      if (t > 0.05 && t < 0.95 && px * px + pz * pz < (isl.r * 0.55) ** 2) return true;
    }
    return false;
  }
  /** Isla «desembarcable» cercana al barco. */
  function landableNear(x, z, extra = 9) {
    let best = null, bd = 1e9;
    for (const isl of islands) { if (!isl.land) continue; const d = Math.hypot(x - isl.x, z - isl.z) - isl.r; if (d < extra && d < bd) { bd = d; best = isl; } }
    return best;
  }

  let t = 0;
  const api = {
    id, R, env, group, islands, islById, terrain, decor, docks, lighthouses, cannons, treasures, chests, castaways, cave, gates, fort,
    heightAt, pushOut, blocked, landableNear, makeChest,
    get name() { return R.name; },
    /** @param {any} q */
    applyQuality(q) { for (const d of decor) d.count = Math.max(0, Math.round(d.userData.total * q.decor)); },
    get decorCount() { return decor.reduce((n, d) => n + d.count, 0); },
    /** @param {number} dt */
    update(dt) {
      t += dt;
      for (const lh of lighthouses) if (lh.beam) lh.beam.rotation.y = t * 0.7;
      for (const d of docks) {
        d.flag.rotation.y = Math.sin(t * 2.2) * 0.25; d.ring.visible = !d.docked;
        /** @type {any} */ (d.ring.material).opacity = 0.25 + 0.2 * Math.sin(t * 3);
        if (d.anim > 0) d.anim = Math.max(0, d.anim - dt);
        /** @type {any} */ (d.lampMesh.material).opacity = d.visited ? 0.75 + 0.25 * Math.sin(t * 9) * (d.anim > 0 ? 1 : 0.2) : 0.3;
      }
      if (fort) {
        fort.flag.rotation.y = Math.sin(t * 2.5) * 0.3;
        fort.ring.visible = !fort.captured && cannons.every(c => c.destroyed);
        /** @type {any} */ (fort.ring.material).opacity = 0.25 + 0.2 * Math.sin(t * 3);
      }
      for (const c of chests) animChest(c, dt);
      for (const tr of treasures) {
        if (!tr.dug) { tr.mark.rotation.y = 0; tr.mark.scale.setScalar(1 + 0.06 * Math.sin(t * 4)); }
        if (tr.chest) { animChest(tr.chest, dt); if (tr.rise < 1) { tr.rise = Math.min(1, (tr.rise || 0) + dt * 0.8); tr.chest.g.position.y = tr.y - 1 + tr.rise; } }
      }
      for (const c of castaways) {
        if (c.rescued) continue;
        const y = waveHeight(c.x, c.z);
        c.group.position.y = y; c.group.rotation.z = Math.sin(t * 1.3 + c.ph) * 0.06; c.group.rotation.x = Math.cos(t * 1.1 + c.ph) * 0.05;
        c.arm.rotation.z = -2.3 + Math.sin(t * 7 + c.ph) * 0.6;
        /** @type {any} */ (c.glow.material).opacity = 0.25 + 0.25 * Math.sin(t * 3 + c.ph);
      }
      for (const g of gates) {
        g.ring.rotation.y = t * (g.active ? 0.8 : 0.15);
        g.arrows.position.z = ((t * 3) % 2.6) - 1.3;
        g.arrows.visible = g.active; g.pillar.visible = g.active;
        /** @type {any} */ (g.ring.material).color.setHex(g.active ? 0xffbe3d : 0x6a7a88);
        /** @type {any} */ (g.inner.material).opacity = g.active ? 0.22 + 0.1 * Math.sin(t * 4) : 0.06;
        g.group.position.y = waveHeight(g.x, g.z) * 0.6;
      }
    },
    dispose() {
      group.removeFromParent();
      group.traverse(/** @param {any} x */ x => {
        if (x.geometry && !Object.values(G).includes(x.geometry) && !Object.values(G.chest).includes(x.geometry)) x.geometry.dispose();
        if (x.material && x.material !== mat) x.material.dispose();
      });
      mat.dispose();
    },
  };
  function animChest(c, dt) {
    if (c.opening && c.open < 1) { c.open = Math.min(1, c.open + dt * 1.6); c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.open, 3)); }
    if (c.gold.visible && c.open >= 1) c.gold.position.y = Math.sin(t * 3) * 0.05;
  }
  return api;
}
