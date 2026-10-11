// Mateo: Ciudad de Altura — «Barrio del Sol» (V2 P1): segundo distrito, residencial, al oeste de la isla y unido por
// las calles E-O. Capa permanente barata (piso, calles con sendas, veredas con cordón, parque lineal, costanera con
// baranda y un «proxy» de casas por manzana) + sectores con streaming (una manzana por sector: casas con detalle y
// colisiones, árboles, faroles, bancos, autos estacionados y dos vecinos que pasean). Todo determinista por semilla.
import * as THREE from 'three';
import { Batcher, boxGeo, prep, FACE } from './geo.js';
import { signRect, SIGN2 } from './textures.js';
import { buildHouseBlock, parkedCar } from './city_detail.js';
import { rng } from './util.js';

const RW = 14, CURB = 0.18, WALK = 22.4, P = 64, SIZE = P - RW, INNER = SIZE - 7;
const CAR_COLS = [0xc0392b, 0x2f6db0, 0xe8e8e8, 0x2a2a2a, 0x7f8c8d, 0x27ae60, 0xf1c40f];
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

export function createDistrictSol(def, { mats, world, scene, people }) {
  const group = new THREE.Group(); group.name = 'barrio_sol'; scene.add(group);
  const [X0, X1, Z0, Z1] = def.rect;
  const RX = [...def.roadsX].sort((a, b) => b - a), RZ = [...def.roadsZ].sort((a, b) => a - b);
  const blocks = [];
  for (let i = 0; i < RX.length - 1; i++) for (let k = 0; k < RZ.length - 1; k++)
    blocks.push({ id: `sol_${i}_${k}`, i, k, cx: (RX[i] + RX[i + 1]) / 2, cz: (RZ[k] + RZ[k + 1]) / 2, park: def.park && def.park[0] === i && def.park[1] === k, seed: def.seed + i * 131 + k * 17 });
  const stats = { houses: 0, doors: 0, hedges: 0, mailboxes: 0 };
  const permBoxes = [];
  const addPerm = (...a) => { const b = world.addBox(...a); permBoxes.push(b); return b; };

  /* ---------- mobiliario con un «mundo» dado (los sectores registran sus cajas para poder descargarlas) ---------- */
  function tree(w, b, x, z, s = 1, detail = 1) {
    b.add('paint', prep(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 3.2 * s, 6), 0x6b4f35), [x, CURB + 1.6 * s, z]);
    const g = hash(x, z) * 0.15;
    b.add('paint', prep(new THREE.IcosahedronGeometry(1.7 * s, detail), new THREE.Color(0.26 + g, 0.5 + g, 0.24).getHex()), [x, CURB + 3.9 * s, z, hash(z, x) * 3, 0, 0, 1, 0.85, 1]);
    b.add('paint', prep(new THREE.IcosahedronGeometry(1.2 * s, detail), new THREE.Color(0.32 + g, 0.58 + g, 0.28).getHex()), [x + 0.6 * s, CURB + 4.7 * s, z - 0.3 * s]);
    w.addBox(x, 0, z, 0.5 * s, 3 * s, 0.5 * s, 'tree');
  }
  function bench(w, b, x, z, ry) {
    b.box('paint', 1.8, 0.1, 0.5, x, CURB + 0.45, z, { color: 0x8a5a32 }, ry);
    b.add('paint', boxGeo(1.8, 0.45, 0.08, { color: 0x8a5a32 }), [x - Math.sin(ry) * 0.25, CURB + 0.75, z - Math.cos(ry) * 0.25, ry]);
    w.addBox(x, 0, z, 1.2, CURB + 0.5, 1.2, 'prop');
  }
  function lamp(w, b, x, z, rot) {
    b.add('metal', prep(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), 0x3a4048), [x, CURB + 3, z]);
    b.box('metal', 0.1, 0.1, 1.6, x, CURB + 5.9, z, { color: 0x3a4048 }, rot);
    b.box('glow', 0.5, 0.14, 0.32, x - Math.sin(rot) * 0.7, CURB + 5.8, z - Math.cos(rot) * 0.7, { color: 0xfff1c4 }, rot);
    w.addBox(x, 0, z, 0.3, 6, 0.3, 'pole');
  }
  function sign(b, x, z, cell, ry, h, s) {
    b.add('metal', prep(new THREE.CylinderGeometry(0.05, 0.05, h, 6), 0x8a8f96), [x, CURB + h / 2, z]);
    b.add('signs2', boxGeo(s, s, 0.05, { uvRect: { [FACE.pz]: signRect(cell), [FACE.nz]: signRect(cell) } }), [x, CURB + h, z, ry]);
  }

  /* ---------- capa permanente ---------- */
  const base = new Batcher();
  const xEdge = -232; // borde de la isla original (el asfalto del centro llega hasta ahí)
  base.add('asphalt', boxGeo(xEdge - X0, 0.2, Z1 - Z0, { tile: [8, 8], faces: [0, 0, 1, 0, 0, 0] }), [(X0 + xEdge) / 2, -0.1, (Z0 + Z1) / 2]);
  const xEnd = RX[RX.length - 1];
  for (const z of RZ) { // calles E-O desde el borde del centro (x = -199) hasta la última transversal
    for (let x = -201; x > xEnd + RW / 2; x -= 5) base.box('lines', 2.6, 0.02, 0.18, x - 1.3, 0.012, z, { color: 0xf2c230 });
    for (const s of [-1, 1]) base.box('lines', (-199) - (xEnd - RW / 2), 0.02, 0.14, (-199 + xEnd - RW / 2) / 2, 0.011, z + s * (RW / 2 - 0.6), { color: 0xe8e8e8 });
  }
  for (const x of RX) { // transversales N-S
    for (let z = RZ[0] + RW / 2 + 1; z < RZ[RZ.length - 1] - RW / 2; z += 5) base.box('lines', 0.18, 0.02, 2.6, x, 0.012, z + 1.3, { color: 0xf2c230 });
    for (const s of [-1, 1]) base.box('lines', 0.14, 0.02, RZ[RZ.length - 1] - RZ[0] - RW, x + s * (RW / 2 - 0.6), 0.011, 0, { color: 0xe8e8e8 });
  }
  // sendas peatonales en cada cruce del barrio y señales de PARE (sin semáforos: el barrio no tiene tránsito pasante)
  for (const x of RX) for (const z of RZ) for (const s of [-1, 1]) {
    for (let k = -RW / 2 + 1; k <= RW / 2 - 1; k += 1.4) {
      if (z + s * (RW / 2 + 1.6) > Z0 + 2 && z + s * (RW / 2 + 1.6) < Z1 - 2) base.box('lines', 0.75, 0.02, 2.6, x + k, 0.013, z + s * (RW / 2 + 1.6), { color: 0xf4f4f4 });
      base.box('lines', 2.6, 0.02, 0.75, x + s * (RW / 2 + 1.6), 0.013, z + k, { color: 0xf4f4f4 });
    }
    if (s > 0 && Math.abs(z) < Z1 - 10) sign(base, x + RW / 2 + 1.2, z - RW / 2 - 1.2, SIGN2.pare, Math.PI / 4, 2.3, 0.7);
  }
  // veredas de las manzanas (con cordón y colisión permanente)
  for (const bl of blocks) { base.add('sidewalk', boxGeo(SIZE, CURB, SIZE, { tile: [3, 3], faces: [1, 1, 1, 0, 1, 1] }), [bl.cx, CURB / 2, bl.cz]); addPerm(bl.cx, 0, bl.cz, SIZE, CURB, SIZE, 'curb'); }
  // parque lineal (entre el centro y la primera transversal) y franjas de costanera, cortados por las calles
  const strips = [[RX[0] + RW / 2, xEdge + 0.3], [X0, xEnd - RW / 2]];
  for (const [a0, a1] of strips) {
    let z = Z0;
    for (const rz of [...RZ, Z1 + RW]) {
      const b0 = z, b1 = Math.min(Z1, rz - RW / 2); z = rz + RW / 2;
      if (b1 - b0 < 1) continue;
      base.add('sidewalk', boxGeo(a1 - a0, CURB, b1 - b0, { tile: [3, 3], faces: [1, 1, 1, 0, 1, 1] }), [(a0 + a1) / 2, CURB / 2, (b0 + b1) / 2]);
      addPerm((a0 + a1) / 2, 0, (b0 + b1) / 2, a1 - a0, CURB, b1 - b0, 'curb');
      if (a0 === X0) continue;
      base.add('grass', boxGeo(a1 - a0 - 6, 0.1, Math.max(0.5, b1 - b0 - 8), { tile: [4, 4], faces: [0, 0, 1, 0, 0, 0] }), [(a0 + a1) / 2, CURB + 0.05, (b0 + b1) / 2]);
      for (let t = b0 + 6; t < b1 - 5; t += 12) tree({ addBox: addPerm }, base, (a0 + a1) / 2 + (hash(t, a0) - 0.5) * 4, t, 0.9, 0);
    }
  }
  for (const [za, zb] of [[Z0, RZ[0] - RW / 2], [RZ[RZ.length - 1] + RW / 2, Z1]]) if (zb - za > 0.5) {
    base.add('sidewalk', boxGeo(xEdge - X0, CURB, zb - za, { tile: [3, 3], faces: [1, 1, 1, 0, 1, 1] }), [(X0 + xEdge) / 2, CURB / 2, (za + zb) / 2]);
    addPerm((X0 + xEdge) / 2, 0, (za + zb) / 2, xEdge - X0, CURB, zb - za, 'curb');
  }
  // baranda de la costanera (oeste, norte, sur): se puede saltar
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    base.box('metal', ax ? len : 0.08, 0.08, ax ? 0.08 : len, mx, CURB + 1.05, mz, { color: 0xd8dde2 });
    base.box('metal', ax ? len : 0.05, 0.05, ax ? 0.05 : len, mx, CURB + 0.6, mz, { color: 0xd8dde2 });
    for (let t = 0; t <= len; t += 3) base.box('metal', 0.08, 1.05, 0.08, x0 + (x1 - x0) * t / len, CURB + 0.52, z0 + (z1 - z0) * t / len, { color: 0xb8c0c6 });
    addPerm(mx, 0, mz, ax ? len : 0.2, CURB + 1.1, ax ? 0.2 : len, 'fence', { rail: true });
  };
  rail(X0 + 0.6, Z0 + 0.6, X0 + 0.6, Z1 - 0.6); rail(X0 + 0.6, Z0 + 0.6, xEdge, Z0 + 0.6); rail(X0 + 0.6, Z1 - 0.6, xEdge, Z1 - 0.6);
  for (let z = Z0 + 10; z < Z1 - 6; z += 26) if (RZ.every(r => Math.abs(r - z) > RW / 2 + 2)) lamp({ addBox: addPerm }, base, X0 + 4, z, -Math.PI / 2);
  // cartel de bienvenida (de cara al centro) en el parque lineal
  const wz = RZ[2] + RW / 2 + 8, wx = (RX[0] + RW / 2 + xEdge) / 2;
  for (const s of [-1, 1]) { base.box('metal', 0.18, 3.6, 0.18, wx, CURB + 1.8, wz + s * 1.6, { color: 0x6a4a2a }); addPerm(wx, 0, wz + s * 1.6, 0.3, CURB + 3.6, 0.3, 'pole'); }
  base.add('signs2', boxGeo(0.12, 1.6, 3.4, { uvRect: { [FACE.px]: signRect(SIGN2.bienvenidos), [FACE.nx]: signRect(SIGN2.bienvenidos) } }), [wx, CURB + 3.3, wz]);
  base.build(mats, group, 'sol:base');

  /* ---------- plan determinista por manzana (proxy LOD barato) ---------- */
  const dummyB = { add(_k, g) { g.dispose(); return this; }, box() { return this; } };
  let fakeId = 0;
  const dummyW = { addBox: (x, y, z, w, h, d) => ({ id: -(++fakeId), minX: x - w / 2, maxX: x + w / 2, minY: y, maxY: y + h, minZ: z - d / 2, maxZ: z + d / 2 }), near: () => [] };
  for (const bl of blocks) {
    bl.houses = [];
    if (!bl.park) buildHouseBlock({ world: dummyW, tree() {}, bench() {}, st: { houses: 0, doors: 0, hedges: 0, mailboxes: 0 }, onHouse: h => bl.houses.push({ x: h.x, z: h.z, w: h.w, d: h.d, h: h.h, tint: h.tint }) }, dummyB, bl.cx, bl.cz, INNER, rng(bl.seed));
    const pb = new Batcher();
    for (const h of bl.houses) { pb.add('stucco', boxGeo(h.w, h.h, h.d, { faces: [1, 1, 0, 0, 1, 1], tile: [9, 12.8], color: h.tint }), [h.x, h.h / 2, h.z]); pb.box('roof', h.w, 0.3, h.d, h.x, h.h + 0.15, h.z, { tile: [6, 6] }); }
    if (bl.park) { pb.add('grass', boxGeo(INNER, 0.1, INNER, { tile: [6, 6], faces: [0, 0, 1, 0, 0, 0] }), [bl.cx, CURB + 0.05, bl.cz]); for (let a = 0; a < 8; a++) pb.add('paint', prep(new THREE.ConeGeometry(2.2, 5, 6), 0x3f7d3a), [bl.cx + Math.cos(a * 0.785) * 15, CURB + 2.5, bl.cz + Math.sin(a * 0.785) * 15]); }
    const meshes = pb.build(mats, group, 'sol:proxy:' + bl.id);
    meshes.forEach(m => { m.castShadow = false; });
    bl.proxy = meshes;
  }

  /* ---------- sector: carga con detalle ---------- */
  function loadBlock(bl) {
    const boxes = [], sw = { addBox: (...a) => { const b = world.addBox(...a); boxes.push(b); return b; }, near: (...a) => world.near(...a) };
    const b = new Batcher(), rand = rng(bl.seed), houses = [];
    const st = { houses: 0, doors: 0, hedges: 0, mailboxes: 0 };
    if (bl.park) buildPark(sw, b, bl, rand);
    else buildHouseBlock({ world: sw, tree: (bb, x, z, s) => tree(sw, bb, x, z, s), bench: (bb, x, z, ry) => bench(sw, bb, x, z, ry), st, onHouse: h => houses.push(h) }, b, bl.cx, bl.cz, INNER, rand);
    // vereda: faroles en las esquinas, árboles y un banco por lado; autos estacionados sobre la calle
    const e = SIZE / 2 - 1.2;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const k of [-1, 1]) lamp(sw, b, bl.cx + sx * e + (sz ? k * 14 : 0), bl.cz + sz * e + (sx ? k * 14 : 0), Math.atan2(sx, sz));
      tree(sw, b, bl.cx + sx * e + (sz ? 4 : 0), bl.cz + sz * e + (sx ? 4 : 0), 0.9);
      bench(sw, b, bl.cx + sx * (e - 0.4) + (sz ? -6 : 0), bl.cz + sz * (e - 0.4) + (sx ? -6 : 0), sx ? Math.PI / 2 : 0);
      // estacionados del lado de la calle (sólo calles internas del barrio, lejos de las sendas)
      const off = SIZE / 2 + 1.15;
      for (const along of [-9, 3]) {
        if (rand() > 0.5) continue;
        const x = bl.cx + sx * off + (sz ? along : 0), z = bl.cz + sz * off + (sx ? along : 0);
        if (x > RX[0] - 1 || x < RX[RX.length - 1] + 1 || z < RZ[0] + 1 || z > RZ[RZ.length - 1] - 1) continue;
        parkedCar(b, x, z, sx ? 0 : Math.PI / 2, CAR_COLS[Math.floor(rand() * CAR_COLS.length)]);
        sw.addBox(x, 0, z, sx ? 1.85 : 4.2, 1.42, sx ? 4.2 : 1.85, 'car', { parked: true });
      }
    }
    const meshes = b.build(mats, group, 'sol:' + bl.id);
    const walkers = people && people.acquireAmbient ? people.acquireAmbient(2, { cx: bl.cx, cz: bl.cz, E: WALK, seed: bl.seed }) : [];
    let sum = 0; for (const x of boxes) sum += x.minX * 3 + x.maxY * 7 + x.minZ * 11;
    stats.houses += houses.length;
    return { meshes, boxes, walkers, houses, sig: `${boxes.length}:${sum.toFixed(2)}` };
  }
  function buildPark(sw, b, bl, rand) {
    const { cx, cz } = bl;
    b.add('grass', boxGeo(INNER + 4, 0.12, INNER + 4, { tile: [6, 6], faces: [0, 0, 1, 0, 0, 0] }), [cx, CURB + 0.06, cz]);
    for (const [w, d] of [[INNER + 4, 3], [3, INNER + 4]]) b.add('sidewalk', boxGeo(w, 0.06, d, { tile: [2, 2], color: 0xe2cfa8, faces: [0, 0, 1, 0, 0, 0] }), [cx, CURB + 0.13, cz]);
    b.add('trim', prep(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 20), 0xcfc7b8), [cx, CURB + 0.35, cz]); sw.addBox(cx, 0, cz, 6.4, CURB + 0.7, 6.4, 'fountain');
    b.add('water', prep(new THREE.CircleGeometry(2.8, 20).rotateX(-Math.PI / 2), 0xffffff), [cx, CURB + 0.66, cz]);
    // juegos: tobogán, hamacas y arenero
    const px = cx + 11, pz = cz - 11;
    b.box('paint', 2, 2.6, 2, px, CURB + 1.3, pz, { color: 0xf07a3a }); sw.addBox(px, 0, pz, 2, CURB + 2.6, 2, 'prop');
    b.add('paint', boxGeo(1.1, 0.14, 4.4, { color: 0x2f8fd0 }), [px, CURB + 1.4, pz + 2.9, 0, -0.55, 0]);
    for (const k of [-1.6, 1.6]) b.add('metal', prep(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), 0xffcf3f), [px - 7 + k, CURB + 1.4, pz]);
    b.box('metal', 3.6, 0.12, 0.12, px - 7, CURB + 2.8, pz, { color: 0xffcf3f });
    b.box('paint', 5, 0.25, 5, cx - 11, CURB + 0.12, cz + 11, { color: 0xe8d8a0 });
    for (let a = 0; a < 10; a++) { const ang = a / 10 * Math.PI * 2 + rand() * 0.2, r = 14 + rand() * 4; tree(sw, b, cx + Math.cos(ang) * r, cz + Math.sin(ang) * r, 0.85 + rand() * 0.3); }
    for (const s of [-1, 1]) { bench(sw, b, cx + s * 5.5, cz - 2.4, 0); bench(sw, b, cx - 2.4, cz + s * 5.5, Math.PI / 2); }
    sign(b, cx, cz - INNER / 2 - 0.5, SIGN2.amistad, 0, 2.4, 1.4);
  }
  function unloadBlock(h) {
    for (const m of h.meshes) { m.removeFromParent(); m.geometry.dispose(); }
    world.remove(h.boxes);
    if (people && people.releaseAmbient) people.releaseAmbient(h.walkers);
    stats.houses -= h.houses.length;
  }
  for (const bl of blocks) bl.proxy.forEach(m => { m.visible = true; });

  return {
    group, blocks, stats, permBoxes, rect: def.rect, roadsX: RX, roadsZ: RZ, walkE: WALK, size: SIZE,
    sectors: blocks.map(bl => ({ id: bl.id, cx: bl.cx, cz: bl.cz, load: () => loadBlock(bl), unload: h => unloadBlock(h), setProxy: on => bl.proxy.forEach(m => { m.visible = on; }) })),
    /** rectángulos de casas (plan) para el minimapa */
    mapRects() { const out = []; for (const bl of blocks) for (const h of bl.houses) out.push(h); return out; },
  };
}
