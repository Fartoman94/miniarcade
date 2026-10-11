// Mateo: Ciudad de Altura — V2 P1: detalle de la ZONA DE REFERENCIA (manzanas 2..5 × 2..5: Plaza Mayor, Banco, Torre
// Altura, Torre del Reloj, la comercial «Avenida Prisma» y el residencial «Barrio Las Glicinas»), articulación de
// fachadas en toda la ciudad (zócalo, bandas de piso, pilastras, cornisas), techos jugables (casillas de escalera,
// antenas, paneles solares), estacionamiento con autos estacionados, mesas de café, árboles con alcorque, maceteros,
// bolardos, bicicleteros, señales y una costanera con baranda en el borde de la isla.
// Usa un PRNG propio: NO altera la secuencia aleatoria de la ciudad V1 (mismas manzanas, edificios y medallas).
import * as THREE from 'three';
import { boxGeo, prep, FACE } from './geo.js';
import { signRect } from './textures.js';
import { SIGN2 } from './textures.js';
import { rng } from './util.js';

export const ZONE = { bx0: 2, bx1: 5, bz0: 2, bz1: 5, name: 'Centro · zona de referencia' };
export const inZone = (bx, bz) => bx >= ZONE.bx0 && bx <= ZONE.bx1 && bz >= ZONE.bz0 && bz <= ZONE.bz1;
/** manzanas residenciales (Barrio Las Glicinas): la última columna de la grilla (se generan al final, sin alterar el resto) */
export const isResidential = (bx, bz) => bx === 5 && bz >= 2;
const PASTEL = [0xfbe3d0, 0xe2f0dc, 0xdfe8f6, 0xf7efc8, 0xf3d9e4, 0xffffff, 0xf6e2c0];
const CAR_COLS = [0xc0392b, 0x2f6db0, 0xe8e8e8, 0x2a2a2a, 0x7f8c8d, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xd35400];

/** Auto estacionado (cuerpo + cabina + vidrios + ruedas) en coordenadas locales: largo en +Z. */
export function parkedCar(b, x, z, ry, color, y0 = 0) {
  const L = 4.2, W = 1.8, H = 1.42;
  const add = (g, px, py, pz) => { g.translate(px, py, pz); g.rotateY(ry); g.translate(x, y0, z); b.add('paint', g); };
  add(boxGeo(W, H * 0.45, L, { color }), 0, 0.32 + H * 0.225, 0);
  add(boxGeo(W * 0.9, H * 0.4, L * 0.52, { color }), 0, 0.32 + H * 0.45 + H * 0.2, -0.15);
  add(boxGeo(W * 0.92, H * 0.3, L * 0.48, { color: 0x24323f }), 0, 0.32 + H * 0.64, -0.15);
  add(boxGeo(W * 1.01, 0.14, L * 0.98, { color: 0x222222 }), 0, 0.36, 0);
  for (const s of [-1, 1]) { add(boxGeo(0.3, 0.16, 0.04, { color: 0xfff6c8 }), s * W * 0.34, 0.55, L / 2 + 0.01); add(boxGeo(0.3, 0.14, 0.04, { color: 0xb02020 }), s * W * 0.34, 0.6, -L / 2 - 0.01); }
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) add(prep(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 10).rotateZ(Math.PI / 2), 0x151515), sx * (W / 2 - 0.1), 0.33, sz * L * 0.32);
  return { L, W, H };
}

/**
 * Manzana de casas bajas (3×3 lotes, el del centro es patio común): retiro con jardín al frente, cerco bajo con portón,
 * puerta con escalón, techo transitable con parapeto. k = { world, tree(b,x,z,s), bench(b,x,z,ry), onHouse(info), st }.
 * Determinista: misma semilla → mismas casas (lo usa también el streaming del Barrio del Sol).
 */
export function buildHouseBlock(k, b, cx, cz, inner, rand) {
  const { world, st } = k, CURB = 0.18;
  const cell = inner / 3, back = 2.2;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const ox = i * cell, oz = j * cell;
    if (!i && !j) { // patio común
      b.add('grass', boxGeo(cell - 1, 0.1, cell - 1, { tile: [4, 4], faces: [0, 0, 1, 0, 0, 0] }), [cx, CURB + 0.05, cz]);
      k.tree(b, cx - 2.5, cz + 2, 1.05); k.bench(b, cx + 2.5, cz - 2.5, 0);
      continue;
    }
    const sx = i, sz = j;
    let w = cell - 2.2, d = cell - 2.2, x = cx + ox, z = cz + oz;
    if (sx) { w -= back; x -= sx * back / 2; }
    if (sz) { d -= back; z -= sz * back / 2; }
    const h = rand() < 0.45 ? 6.6 : 9.8, tint = PASTEL[Math.floor(rand() * PASTEL.length)];
    b.add('stucco', boxGeo(w, h, d, { faces: [1, 1, 0, 0, 1, 1], tile: [9, 12.8], color: tint }), [x, h / 2, z]);
    const box = world.addBox(x, 0, z, w, h, d, 'building');
    b.add('roof', boxGeo(w, 0.3, d, { tile: [6, 6], faces: [1, 1, 1, 0, 1, 1] }), [x, h + 0.15, z]);
    for (const [px, pz, pw, pd] of [[x, z + d / 2 - 0.17, w, 0.35], [x, z - d / 2 + 0.17, w, 0.35], [x + w / 2 - 0.17, z, 0.35, d], [x - w / 2 + 0.17, z, 0.35, d]]) {
      b.box('trim', pw, 0.9, pd, px, h + 0.75, pz, { color: 0xe8e0d0 }); world.addBox(px, h, pz, pw, 1.2, pd, 'parapet');
    }
    const info = { type: 'casa', x, z, w, d, h, tiers: [box], roofY: h + 0.3, tint };
    k.onHouse(info); st.houses++;
    for (const [nx, nz] of [[sx, 0], [0, sz]]) {
      if (!nx && !nz) continue;
      const faceX = x + nx * w / 2, faceZ = z + nz * d / 2;
      b.box('paint', nx ? 0.08 : 1.2, 2.2, nz ? 0.08 : 1.2, faceX + nx * 0.04, 1.2, faceZ + nz * 0.04, { color: [0x6b4a32, 0x2f4f6f, 0x7a2f2f][Math.floor(rand() * 3)] });
      b.box('trim', nx ? 0.5 : 1.8, 0.16, nz ? 0.5 : 1.8, faceX + nx * 0.25, CURB + 0.08, faceZ + nz * 0.25, { color: 0xbcb6aa });
      st.doors++;
      const hx = nx ? cx + nx * (inner / 2 - 0.15) : x, hz = nz ? cz + nz * (inner / 2 - 0.15) : z;
      const len = nx ? d : w, gap = 1.6;
      for (const s of [-1, 1]) {
        const L = (len - gap) / 2, off = s * (gap / 2 + L / 2);
        const gx = nx ? hx : hx + off, gz = nz ? hz : hz + off;
        b.add('paint', boxGeo(nx ? 0.5 : L, 0.85, nx ? L : 0.5, { color: 0x3f7d3a }), [gx, CURB + 0.42, gz]);
        world.addBox(gx, 0, gz, nx ? 0.5 : L, CURB + 0.85, nx ? L : 0.5, 'fence'); st.hedges++;
      }
      if (rand() < 0.5) { const mx = hx + (nz ? gap / 2 + 0.4 : 0), mz = hz + (nx ? gap / 2 + 0.4 : 0); b.box('paint', 0.45, 0.6, 0.4, mx, CURB + 0.95, mz, { color: 0xe8b81a }); b.box('metal', 0.08, 0.65, 0.08, mx, CURB + 0.33, mz, { color: 0x3a3a3a }); st.mailboxes++; }
    }
  }
}

/**
 * @param {any} c contexto de city.js: { B, world, camWorld, buildings, lamps, trees, benches, intersections, roads, P, N, RW, HALFW, CURB, walkE, blockCenter, special, landmarks, shops, roadsB }
 */
export function createDetail(c) {
  const rand = rng(20261011);
  const { world, camWorld, roads: R, P, N, RW, CURB, blockCenter } = c;
  const size = P - RW, half = size / 2, inner = size - 3.5 * 2;
  const st = { parking: 0, parked: 0, cafe: 0, streetTrees: 0, planters: 0, bollards: 0, racks: 0, signs: 0, huts: 0, antennas: 0, solar: 0, houses: 0, doors: 0, hedges: 0, mailboxes: 0, kiosks: 0, totems: 0, railing: 0, promenadeTrees: 0, bands: 0 };
  const parkedBoxes = [], parkingBays = [], houses = [];
  const A = R[4]; // Avenida Prisma (eje E-O, z = 64)

  /* ---------- mobiliario pequeño ---------- */
  function streetTree(b, x, z) {
    b.box('metal', 1.3, 0.04, 1.3, x, CURB + 0.02, z, { color: 0x3a3f44 });
    b.add('paint', prep(new THREE.CylinderGeometry(0.13, 0.2, 3, 6), 0x6b4f35), [x, CURB + 1.5, z]);
    const g = rand() * 0.12;
    b.add('paint', prep(new THREE.IcosahedronGeometry(1.5, 1), new THREE.Color(0.26 + g, 0.52 + g, 0.27).getHex()), [x, CURB + 3.6, z, rand() * 3, 0, 0, 1, 0.9, 1]);
    world.addBox(x, 0, z, 0.4, 2.8, 0.4, 'tree'); c.trees.push([x, z]); st.streetTrees++;
  }
  function planter(b, x, z) {
    b.box('trim', 1.6, 0.6, 0.7, x, CURB + 0.3, z, { color: 0x8f8a80 });
    b.add('paint', prep(new THREE.IcosahedronGeometry(0.55, 0), 0x4f9a3f), [x - 0.4, CURB + 0.8, z, 0, 0, 0, 1, 0.6, 1]);
    b.add('paint', prep(new THREE.IcosahedronGeometry(0.5, 0), 0xd65a8a), [x + 0.4, CURB + 0.78, z, 0, 0, 0, 1, 0.6, 1]);
    world.addBox(x, 0, z, 1.6, CURB + 0.6, 0.7, 'prop'); st.planters++;
  }
  function bollard(b, x, z) { b.add('metal', prep(new THREE.CylinderGeometry(0.11, 0.13, 0.9, 8), 0x2f3438), [x, CURB + 0.45, z]); b.box('glow', 0.24, 0.06, 0.24, x, CURB + 0.86, z, { color: 0xf2c230 }); world.addBox(x, 0, z, 0.26, CURB + 0.9, 0.26, 'pole'); st.bollards++; }
  function bikeRack(b, x, z, ry) {
    for (let k = -1; k <= 1; k++) b.add('metal', prep(new THREE.TorusGeometry(0.35, 0.03, 4, 10, Math.PI), 0x9aa0a6), [x + Math.cos(ry) * k * 0.6, CURB + 0.05, z - Math.sin(ry) * k * 0.6, ry + Math.PI / 2]);
    st.racks++;
  }
  function cafeSet(b, x, z) {
    b.add('paint', prep(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), 0xf4f1ea), [x, CURB + 0.74, z]);
    b.add('metal', prep(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), 0x2f3438), [x, CURB + 0.37, z]);
    for (const s of [-1, 1]) { b.box('paint', 0.42, 0.06, 0.42, x + s * 0.7, CURB + 0.45, z, { color: 0x8a5a32 }); b.box('paint', 0.06, 0.45, 0.42, x + s * 0.92, CURB + 0.7, z, { color: 0x8a5a32 }); }
    b.add('metal', prep(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), 0x8a8f96), [x, CURB + 1.1, z]);
    b.add('paint', prep(new THREE.ConeGeometry(1.25, 0.5, 8), [0xc0392b, 0x2e8b57, 0x1f6f9f][Math.floor(rand() * 3)]), [x, CURB + 2.25, z]);
    world.addBox(x, 0, z, 1.0, CURB + 0.75, 0.9, 'prop'); camWorld.addBox(x, CURB + 2.0, z, 2.4, 0.5, 2.4, 'awning'); st.cafe++;
  }
  function signPost(b, x, z, cell, ry, h = 2.4, w = 0.7) {
    b.add('metal', prep(new THREE.CylinderGeometry(0.04, 0.04, h, 6), 0x8a8f96), [x, CURB + h / 2, z]);
    b.add('signs2', boxGeo(w, w, 0.04, { uvRect: { [FACE.pz]: signRect(cell), [FACE.nz]: signRect(cell) } }), [x, CURB + h, z, ry]);
    st.signs++;
  }
  function totem(b, x, z, ry) { b.add('signs2', boxGeo(0.8, 1.8, 0.2, { uvRect: { [FACE.pz]: signRect(SIGN2.info), [FACE.nz]: signRect(SIGN2.info) } }), [x, CURB + 0.9, z, ry]); world.addBox(x, 0, z, 0.8, CURB + 1.8, 0.8, 'prop'); st.totems++; }
  function newsKiosk(b, x, z, ry) {
    b.box('paint', 2.4, 2.2, 1.6, x, CURB + 1.1, z, { color: 0x2e5a3a }, ry);
    b.box('paint', 2.9, 0.12, 2.1, x, CURB + 2.3, z, { color: 0x1f3a28 }, ry);
    b.add('signs2', boxGeo(2.0, 0.5, 0.05, { uvRect: { [FACE.pz]: signRect(SIGN2.diarios), [FACE.nz]: signRect(SIGN2.diarios) } }), [x, CURB + 2.65, z, ry]);
    world.addBox(x, 0, z, Math.abs(Math.cos(ry)) > 0.5 ? 2.4 : 1.6, CURB + 2.4, Math.abs(Math.cos(ry)) > 0.5 ? 1.6 : 2.4, 'prop'); st.kiosks++;
  }

  /* ---------- fachadas: zócalo, bandas, pilastras, cornisa; techos: casilla, antena, paneles ---------- */
  function articulate(info) {
    const b = c.B(info.z), tiers = info.tiers || [];
    if (!tiers.length || !info.type || ['banco', 'centro', 'stone'].includes(info.type)) return;
    const low = info.type !== 'tower';
    const band = info.type === 'brick' ? 0x8a4a38 : info.type === 'office' ? 0x8d949c : info.type === 'casa' ? 0xe8e0d0 : 0xd8d2c8;
    tiers.forEach((t, i) => {
      const w = t.maxX - t.minX, d = t.maxZ - t.minZ, x = (t.minX + t.maxX) / 2, z = (t.minZ + t.maxZ) / 2, y0 = t.minY, y1 = t.maxY;
      if (i === 0 && low) b.box('trim', w + 0.16, 0.7, d + 0.16, x, 0.35, z, { color: 0x6f6a62, tile: [3, 3] });
      const every = info.type === 'office' ? 6.4 : info.type === 'tower' ? 0 : 3.2;
      if (every) for (let y = Math.max(y0, 4.4) + every; y < y1 - 1.2; y += every) { b.box('trim', w + 0.18, 0.14, d + 0.18, x, y, z, { color: band }); st.bands++; }
      if (low && (info.type === 'brick' || info.type === 'stucco' || info.type === 'casa')) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('trim', 0.42, y1 - y0, 0.42, x + sx * (w / 2 - 0.15), (y0 + y1) / 2, z + sz * (d / 2 - 0.15), { color: band });
      b.box('trim', w + 0.24, 0.32, d + 0.24, x, y1 - 0.16, z, { color: band });
    });
    // techo del último nivel
    const top = tiers[tiers.length - 1], w = top.maxX - top.minX, d = top.maxZ - top.minZ, x = (top.minX + top.maxX) / 2, z = (top.minZ + top.maxZ) / 2, y = top.maxY;
    if (w >= 10 && d >= 10 && rand() < 0.7) {
      const hw = 2.8, hd = 2.6, cands = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [x + sx * (w / 2 - hw / 2 - 1.2), z + sz * (d / 2 - hd / 2 - 1.2)]);
      const free = cands.find(([hx, hz]) => !world.near(hx - 2, hz - 2, hx + 2, hz + 2, []).some(o => o.kind === 'prop' && o.minY >= y - 0.5 && o.maxX > hx - hw / 2 && o.minX < hx + hw / 2 && o.maxZ > hz - hd / 2 && o.minZ < hz + hd / 2));
      if (free) {
        const [hx, hz] = free;
        b.box('trim', hw, 2.5, hd, hx, y + 0.3 + 1.25, hz, { color: 0xc9c3b6, tile: [3, 3] });
        b.box('trim', hw + 0.3, 0.18, hd + 0.3, hx, y + 0.3 + 2.55, hz, { color: 0x5a5f66 });
        b.box('paint', 0.9, 1.9, 0.06, hx, y + 0.3 + 0.95, hz + hd / 2 + 0.03, { color: 0x3b3f45 });
        world.addBox(hx, y, hz, hw, 2.95, hd, 'prop'); st.huts++;
      }
    }
    if ((info.type === 'office' || info.type === 'tower' || info.type === 'brick') && rand() < 0.35) { const ax = x + (rand() - 0.5) * w * 0.5, az = z + (rand() - 0.5) * d * 0.5; b.box('metal', 0.12, 5, 0.12, ax, y + 2.8, az, { color: 0xb8c0c6 }); b.box('metal', 1.4, 0.06, 0.06, ax, y + 4.6, az, { color: 0xb8c0c6 }); st.antennas++; }
    if ((info.type === 'stucco' || info.type === 'casa') && w >= 8 && rand() < 0.45) {
      const px = x - w * 0.18, pz = z + d * 0.12;
      for (let k = -1; k <= 1; k++) b.add('glass2', boxGeo(1.4, 0.06, 2.2, { tile: [12, 14] }), [px + k * 1.6, y + 0.9, pz, 0, -0.45]);
      world.addBox(px, y, pz, 4.8, 1.0, 2.4, 'prop'); st.solar++;
    }
  }

  /* ---------- Barrio Las Glicinas ---------- */
  function residential(b, cx, cz, bx, bz) {
    buildHouseBlock({ world, tree: c.tree, bench: c.bench, st, onHouse: info => { info.block = [bx, bz]; c.buildings.push(info); houses.push(info); } }, b, cx, cz, inner, rand);
    signPost(b, cx - half + 1.2, cz - half + 1.2, SIGN2.glicinas, Math.PI / 4, 2.8, 1.2);
  }

  /* ---------- Avenida Prisma: estacionamiento, café, árboles, maceteros, bolardos, bicicleteros, kiosco ---------- */
  function avenue() {
    for (let bx = 0; bx < N; bx++) {
      const cx = blockCenter(bx);
      for (const s of [-1, 1]) { // s=-1: lado de las manzanas bz=3 (sur del eje), s=1: bz=4
        const zLine = A + s * (RW / 2 - 1.15), b = c.B(zLine);
        // dársenas de 6 m: líneas blancas y autos estacionados (≈ la mitad)
        for (let k = -2.5; k <= 2.5; k += 1) {
          const x = cx + k * 6;
          parkingBays.push({ x, z: zLine, axis: 'x' }); st.parking++;
          b.box('lines', 0.12, 0.02, 2.0, x - 3, 0.013, zLine, { color: 0xf4f4f4 });
          if (k === 2.5) b.box('lines', 0.12, 0.02, 2.0, x + 3, 0.013, zLine, { color: 0xf4f4f4 });
          if (rand() < 0.55) {
            const col = CAR_COLS[Math.floor(rand() * CAR_COLS.length)], ry = (s > 0 ? -1 : 1) * Math.PI / 2 + (rand() - 0.5) * 0.04;
            parkedCar(b, x, zLine, ry, col);
            parkedBoxes.push(world.addBox(x, 0, zLine, 4.2, 1.42, 1.85, 'car', { parked: true })); st.parked++;
          }
        }
        b.box('lines', 36, 0.02, 0.12, cx, 0.013, A + s * (RW / 2 - 2.15), { color: 0xf4f4f4 });
        signPost(b, cx - 12.2, A + s * (RW / 2 + 1.1), SIGN2.parking, s > 0 ? Math.PI : 0, 2.3, 0.6);
        // vereda: franja de mobiliario (cerca del cordón), libre la línea de caminata
        const fz = A + s * (RW / 2 + 1.2), bz = s > 0 ? 4 : 3, kind = c.special[bx + ',' + bz];
        const sb = c.B(fz);
        streetTree(sb, cx - 10.5, fz); streetTree(sb, cx + 19, fz);
        if (kind !== 'parque') planter(sb, cx + 11.5, fz);
        bikeRack(sb, cx - 16.5, fz, 0);
        if (!kind || kind === 'banco' || kind === 'reloj') cafeSet(sb, cx + 1.6, fz);
        for (const e of [-1, 1]) { bollard(sb, cx + e * 21.2, A + s * (RW / 2 + 0.45)); }
        if (bx === 2 && s < 0) newsKiosk(c.B(A - RW / 2 - 6.1), cx + 6, A - RW / 2 - 6.1, 0); // dentro de la plaza, de cara a la avenida
      }
    }
    // carteles «Avenida Prisma» en las esquinas
    for (let i = 1; i < N; i++) signPost(c.B(A), R[i] + RW / 2 + 2.6, A - RW / 2 - 1.0, SIGN2.prisma, 0, 3.2, 1.1);
  }

  /* ---------- señales de tránsito y tótems en la zona ---------- */
  function zoneSignals(intersections) {
    for (const it of intersections) {
      if (it.i < ZONE.bx0 || it.i > ZONE.bx1 + 1 || it.j < ZONE.bz0 || it.j > ZONE.bz1 + 1) continue;
      if (Math.abs(it.x) > c.HALFW - 1 || Math.abs(it.z) > c.HALFW - 1) continue;
      signPost(c.B(it.z), it.x - RW / 2 - 1.0, it.z + RW / 2 + 4.2, SIGN2.peatones, Math.PI / 2, 2.4, 0.6);
    }
    totem(c.B(32), c.landmarks.plaza.x + 24.0, c.landmarks.plaza.z - 12, Math.PI / 2);
    totem(c.B(96), blockCenter(3) - 24.0, blockCenter(4) + 8, Math.PI / 2);
  }

  /* ---------- costanera: vereda, árboles, faroles y baranda en el borde de la isla ---------- */
  function promenade(gaps) {
    const S = c.HALFW + 40, e0 = c.HALFW + RW / 2 + 1; // 200
    const bands = [[-S, S, -S, -e0], [-S, S, e0, S], [-S, -e0, -e0, e0], [e0, S, -e0, -130], [e0, S, 130, e0]];
    const sb = c.promB;
    // líneas de caminata del enlace centro ↔ Barrio del Sol (cruzan la franja oeste): sin árboles encima
    const walkLines = []; for (let bz = 1; bz < N - 1; bz++) for (const s of [-1, 1]) walkLines.push(blockCenter(bz) + s * c.walkE);
    for (const [x0, x1, z0, z1] of bands) {
      // la franja oeste se corta donde siguen las calles hacia el Barrio del Sol
      const pieces = [];
      if (x1 === -e0 && gaps.length) {
        let z = z0; for (const g of gaps) { if (g - 7 > z) pieces.push([x0, x1, z, g - 7]); z = g + 7; } if (z < z1) pieces.push([x0, x1, z, z1]);
      } else pieces.push([x0, x1, z0, z1]);
      for (const [a0, a1, b0, b1] of pieces) {
        const w = a1 - a0, d = b1 - b0;
        if (w <= 0.5 || d <= 0.5) continue;
        sb.add('sidewalk', boxGeo(w, CURB, d, { tile: [3, 3], faces: [1, 1, 1, 0, 1, 1] }), [(a0 + a1) / 2, CURB / 2, (b0 + b1) / 2]);
        world.addBox((a0 + a1) / 2, 0, (b0 + b1) / 2, w, CURB, d, 'curb');
        // cantero central de pasto con árboles (deja libres las sendas de los dos lados y las líneas de caminata)
        const alongX = w > d, gw = (alongX ? d : w) - 12, gl = (alongX ? w : d) - 6;
        if (gw >= 4 && gl >= 6) {
          const mx = (a0 + a1) / 2, mz = (b0 + b1) / 2;
          sb.add('grass', boxGeo(alongX ? gl : gw, 0.1, alongX ? gw : gl, { tile: [4, 4], faces: [0, 0, 1, 0, 0, 0] }), [mx, CURB + 0.05, mz]);
          sb.box('trim', alongX ? gl : 0.3, 0.3, alongX ? 0.3 : gl, mx + (alongX ? 0 : -gw / 2), CURB + 0.15, mz + (alongX ? -gw / 2 : 0), { color: 0xbcb6aa });
          sb.box('trim', alongX ? gl : 0.3, 0.3, alongX ? 0.3 : gl, mx + (alongX ? 0 : gw / 2), CURB + 0.15, mz + (alongX ? gw / 2 : 0), { color: 0xbcb6aa });
          for (let t = -gl / 2 + 4; t <= gl / 2 - 3; t += 13) {
            const x = alongX ? mx + t : mx, z = alongX ? mz : mz + t;
            if (!alongX && walkLines.some(l => Math.abs(z - l) < 2.2)) continue;
            c.tree(sb, x, z, 0.9 + rand() * 0.25, 0); st.promenadeTrees++;
          }
        }
      }
    }
    // baranda sobre el agua (norte, sur, oeste fuera del barrio, este fuera del puerto): se puede saltar
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      if (len < 1) return;
      sb.box('metal', alongX ? len : 0.08, 0.08, alongX ? 0.08 : len, mx, CURB + 1.05, mz, { color: 0xd8dde2 });
      sb.box('metal', alongX ? len : 0.05, 0.05, alongX ? 0.05 : len, mx, CURB + 0.6, mz, { color: 0xd8dde2 });
      for (let t = 0; t <= len; t += 3) { const px = x0 + (x1 - x0) * t / len, pz = z0 + (z1 - z0) * t / len; sb.box('metal', 0.08, 1.05, 0.08, px, CURB + 0.52, pz, { color: 0xb8c0c6 }); }
      world.addBox(mx, 0, mz, alongX ? len : 0.2, CURB + 1.1, alongX ? 0.2 : len, 'fence', { rail: true }); st.railing += len;
    };
    const E = S - 0.6;
    rail(-E, -E, E, -E); rail(-E, E, E, E);
    rail(-E, -E, -E, -c.district.landZ); rail(-E, c.district.landZ, -E, E);
    rail(E, -E, E, -130); rail(E, 130, E, E);
    // árboles, faroles y bancos a lo largo de la costanera
    for (let t = -S + 14; t < S - 10; t += 18) {
      for (const [x, z] of [[t, -S + 7], [t, S - 7]]) { c.tree(sb, x, z, 0.95, 0); st.promenadeTrees++; if ((t + S) % 36 < 18) c.lamp(sb, x + 9, z, Math.PI); else c.bench(sb, x + 9, z, 0); }
      if (Math.abs(t) > c.district.landZ + 4 && t > -e0 + 2 && t < e0 - 2) { c.tree(sb, -S + 7, t, 0.95, 0); st.promenadeTrees++; }
    }
  }

  return { st, parkedBoxes, parkingBays, houses, articulate, residential, avenue, zoneSignals, promenade, streetTree, planter, bollard, signPost, cafeSet, newsKiosk };
}
