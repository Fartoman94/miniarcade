// Mateo: Ciudad de Altura — distrito «Centro de Altura» (6×6 manzanas, ~400 m): calles con carriles, cordones,
// sendas peatonales, semáforos sincronizados, faroles, árboles y mobiliario; edificios variados por tipo (torres de vidrio
// con retiros, oficinas, ladrillo con balcones y escaleras de incendio, viviendas revocadas, locales con carteles) y
// lugares memorables: Plaza Mayor, Banco Central, Torre Altura, Parque del Ombú, Torre del Reloj, Puente Elevado y la Obra.
// Toda la geometría estática se fusiona por material y por franja (pocos draw calls); las colisiones son AABB.
import * as THREE from 'three';
import { Batcher, boxGeo, prep, FACE } from './geo.js';
import { shopRect, signRect, SHOP_COUNT } from './textures.js';
import { World } from './physics.js';
import { rng } from './util.js';
import { createDetail, ZONE, inZone, isResidential } from './city_detail.js';

export const P = 64, N = 6, RW = 14, HALFW = P * N / 2; // paso de manzana, manzanas por lado, ancho de calle
export const ROADS = Array.from({ length: N + 1 }, (_, k) => k * P - HALFW);   // ejes de calles (x o z)
export const blockCenter = i => (i + 0.5) * P - HALFW;
const SW = 3.5, CURB = 0.18;                                                  // vereda y cordón
const LANE = 3.2;                                                             // desplazamiento del carril respecto del eje
export const WALK_E = (P - RW) / 2 - 2.6;                                     // V2: línea de caminata (22,4 m del centro de manzana)

const TYPE_TILE = { glass0: [12, 14], glass1: [12, 14], glass2: [12, 14], office: [9, 14], brick: [9, 12.8], stucco: [9, 12.8] };
const PASTEL = [0xffffff, 0xfbe3d0, 0xe2f0dc, 0xdfe8f6, 0xf7efc8, 0xf3d9e4];

/**
 * @param {Record<string, THREE.Material>} mats
 * @param {'low'|'medium'|'high'} quality
 * @param {{ west?: { rect: number[], roadsZ: number[] } }} [opts] distrito oeste (Barrio del Sol) para el piso y el agua
 */
export function createCity(mats, quality, opts = {}) {
  const group = new THREE.Group(); group.name = 'ciudad';
  const world = new World();
  // obstáculos sólo para la cámara (toldos, balcones, escaleras de incendio): Mateo no choca con ellos, pero la cámara
  // no se mete adentro ni queda arriba de un toldo mirando a través de él
  const camWorld = new World();
  const rand = rng(20261010);
  const chunks = Array.from({ length: N }, () => new Batcher());
  const roadsB = new Batcher();
  const chunkOf = z => Math.max(0, Math.min(N - 1, Math.floor((z + HALFW) / P)));
  const B = (z) => chunks[chunkOf(z)];
  /** @type {any[]} */ const buildings = [];
  /** @type {{x:number,y:number,z:number,name:string}[]} */ const medalSpots = [], roofSpots = [];
  const interiors = [];
  const landmarks = {};
  const lamps = [];
  const trees = [], benches = [], shops = [];                // V2: listas para NPC (bancos), incidentes (locales) y QA
  const west = opts.west || { rect: [-404, -232, -140, 140], roadsZ: [-128, -64, 0, 64, 128] };
  const district = { landZ: west.rect[3], rect: west.rect, roadsZ: west.roadsZ };

  /* ---------------- suelo y calles ---------------- */
  const S = HALFW + 40;
  roadsB.add('asphalt', boxGeo(S * 2, 0.2, S * 2, { tile: [8, 8], faces: [0, 0, 1, 0, 0, 0] }), [0, -0.1, 0]);
  for (let i = 0; i <= N; i++) {
    const c = ROADS[i];
    for (let j = 0; j < N; j++) {
      const a = blockCenter(j), len = P - RW;
      // línea central discontinua amarilla y bordes blancos (ejes N-S y E-O)
      for (let k = -len / 2 + 1.5; k < len / 2 - 1; k += 5) {
        roadsB.box('lines', 0.18, 0.02, 2.6, c, 0.012, a + k + 1.3, { color: 0xf2c230 });
        roadsB.box('lines', 2.6, 0.02, 0.18, a + k + 1.3, 0.012, c, { color: 0xf2c230 });
      }
      for (const s of [-1, 1]) {
        roadsB.box('lines', 0.14, 0.02, len, c + s * (RW / 2 - 0.6), 0.011, a, { color: 0xe8e8e8 });
        roadsB.box('lines', len, 0.02, 0.14, a, 0.011, c + s * (RW / 2 - 0.6), { color: 0xe8e8e8 });
      }
    }
    // sendas peatonales y líneas de frenado en cada cruce
    for (let j = 0; j <= N; j++) {
      const x = ROADS[i], z = ROADS[j];
      for (const s of [-1, 1]) {
        for (let k = -RW / 2 + 1; k <= RW / 2 - 1; k += 1.4) {
          roadsB.box('lines', 0.75, 0.02, 2.6, x + k, 0.013, z + s * (RW / 2 + 1.6), { color: 0xf4f4f4 });
          roadsB.box('lines', 2.6, 0.02, 0.75, x + s * (RW / 2 + 1.6), 0.013, z + k, { color: 0xf4f4f4 });
        }
        roadsB.box('lines', RW / 2 - 0.6, 0.02, 0.35, x + s * (RW / 4), 0.012, z - s * (RW / 2 + 3.4), { color: 0xffffff });
        roadsB.box('lines', 0.35, 0.02, RW / 2 - 0.6, x + s * (RW / 2 + 3.4), 0.012, z + s * (RW / 4), { color: 0xffffff });
      }
    }
  }

  /* ---------------- manzanas ---------------- */
  const special = { '2,3': 'plaza', '3,3': 'banco', '3,2': 'altura', '1,4': 'parque', '4,4': 'reloj', '2,1': 'puenteO', '3,1': 'puenteE', '4,1': 'obra', '1,2': 'centro' };
  const promB = new Batcher();
  const detail = createDetail({ B, world, camWorld, buildings, lamps, trees, benches, intersections: null, roads: ROADS, P, N, RW, HALFW, CURB, walkE: WALK_E, blockCenter, special, landmarks, shops, tree, bench, lamp, promB, district });
  for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
    const cx = blockCenter(bx), cz = blockCenter(bz), size = P - RW, inner = size - SW * 2;
    const kind = special[bx + ',' + bz] || 'normal';
    const b = B(cz);
    // vereda elevada con cordón
    b.add('sidewalk', boxGeo(size, CURB, size, { tile: [3, 3], faces: [1, 1, 1, 0, 1, 1] }), [cx, CURB / 2, cz]);
    world.addBox(cx, 0, cz, size, CURB, size, 'curb');
    if (kind === 'parque' || kind === 'plaza') { /* veredas y mobiliario dentro de su función */ }
    else streetFurniture(b, cx, cz, size, bx, bz);
    const d = Math.hypot(bx - 2.5, bz - 2.5);
    if (kind === 'normal' && isResidential(bx, bz)) detail.residential(b, cx, cz, bx, bz); // V2: Barrio Las Glicinas (últimas manzanas del bucle)
    else if (kind === 'normal') {
      const split = rand();
      const lots = split < 0.28 ? [[0, 0, inner, inner]] : split < 0.62 ? [[-inner / 4, 0, inner / 2 - 1, inner], [inner / 4, 0, inner / 2 - 1, inner]]
        : [[-inner / 4, -inner / 4, inner / 2 - 1, inner / 2 - 1], [inner / 4, -inner / 4, inner / 2 - 1, inner / 2 - 1], [-inner / 4, inner / 4, inner / 2 - 1, inner / 2 - 1], [inner / 4, inner / 4, inner / 2 - 1, inner / 2 - 1]];
      for (const [ox, oz, w, dd] of lots) {
        const r = rand();
        const type = d < 1.8 ? (r < 0.75 ? 'tower' : 'office') : d < 2.6 ? (r < 0.3 ? 'tower' : r < 0.7 ? 'office' : 'brick') : (r < 0.15 ? 'office' : r < 0.6 ? 'brick' : 'stucco');
        building(b, type, cx + ox, cz + oz, w - rand() * 3, dd - rand() * 3, d, cx, cz);
      }
    } else landmark(kind, b, cx, cz, inner);
  }

  /* ---------------- edificios ---------------- */
  function facadeKey(type) { return type === 'tower' ? 'glass' + Math.floor(rand() * 3) : type; }
  function building(b, type, x, z, w, d, distC, bcx, bcz) {
    const floorsH = type === 'tower' ? 60 + rand() * 70 + Math.max(0, 1.6 - distC) * 30 : type === 'office' ? 24 + rand() * 30 : type === 'brick' ? 12 + rand() * 16 : 8 + rand() * 8;
    const h = Math.round(floorsH);
    const key = facadeKey(type);
    const tint = type === 'stucco' ? PASTEL[Math.floor(rand() * PASTEL.length)] : type === 'brick' ? [0xffffff, 0xf0d8cc, 0xe6c8b8][Math.floor(rand() * 3)] : 0xffffff;
    const pod = type === 'tower' ? 6 : 4.4;
    const info = { type, x, z, w, d, h, tiers: [], roofY: h };
    // planta baja: locales hacia las calles (caras exteriores de la manzana), resto revestido
    const faceOut = [x + w / 2 > bcx + 10, x - w / 2 < bcx - 10, false, false, z + d / 2 > bcz + 10, z - d / 2 < bcz - 10];
    const shop = Math.floor(rand() * SHOP_COUNT);
    const uvRect = {}; [FACE.px, FACE.nx, FACE.pz, FACE.nz].forEach((f, i) => { if (faceOut[f]) uvRect[f] = shopRect(shop + i); });
    if (type !== 'tower') [FACE.px, FACE.nx, FACE.pz, FACE.nz].forEach((f, i) => { if (!faceOut[f]) return; const nx = f === FACE.px ? 1 : f === FACE.nx ? -1 : 0, nz = f === FACE.pz ? 1 : f === FACE.nz ? -1 : 0; shops.push({ x: x + nx * w / 2, z: z + nz * d / 2, nx, nz, shop: (shop + i) % SHOP_COUNT, bx: Math.floor((bcx + HALFW) / P), bz: Math.floor((bcz + HALFW) / P) }); });
    if (type === 'tower') { b.add(key, boxGeo(w, pod, d, { faces: [1, 1, 0, 0, 1, 1], tile: [6, 7], color: 0xaebcc8 }), [x, pod / 2, z]); b.box('trim', w + 0.6, 0.6, d + 0.6, x, pod, z, { color: 0x8d949c }); }
    else {
      const faces = [1, 1, 0, 0, 1, 1];
      // los locales usan el atlas; las caras interiores, ladrillo/oficina
      for (const f of [FACE.px, FACE.nx, FACE.pz, FACE.nz]) {
        const m = [0, 0, 0, 0, 0, 0]; m[f] = 1;
        b.add(faceOut[f] ? 'shops' : key, boxGeo(w, pod, d, { faces: m, uvRect: faceOut[f] ? { [f]: uvRect[f] } : null, tile: TYPE_TILE[key], color: faceOut[f] ? 0xffffff : tint }), [x, pod / 2, z]);
      }
      void faces;
      // toldos sobre los locales
      for (const f of [FACE.px, FACE.nx, FACE.pz, FACE.nz]) if (faceOut[f]) {
        const col = [0xc0392b, 0x1f6f9f, 0x2e8b57, 0xe08a1e, 0x7b4fa0][Math.floor(rand() * 5)];
        if (f === FACE.px || f === FACE.nx) { b.box('paint', 1.6, 0.16, d * 0.8, x + (f === FACE.px ? 1 : -1) * (w / 2 + 0.8), pod - 0.9, z, { color: col }, 0); camWorld.addBox(x + (f === FACE.px ? 1 : -1) * (w / 2 + 0.8), pod - 0.98, z, 1.6, 0.16, d * 0.8, 'awning'); }
        else { b.box('paint', w * 0.8, 0.16, 1.6, x, pod - 0.9, z + (f === FACE.pz ? 1 : -1) * (d / 2 + 0.8), { color: col }); camWorld.addBox(x, pod - 0.98, z + (f === FACE.pz ? 1 : -1) * (d / 2 + 0.8), w * 0.8, 0.16, 1.6, 'awning'); }
      }
    }
    world.addBox(x, 0, z, w, pod, d, 'building', { info });
    // fuste con retiros
    let y0 = pod, cw = w, cd = d;
    const tiers = type === 'tower' ? (h > 100 ? 3 : 2) : 1;
    for (let t = 0; t < tiers; t++) {
      const top = t === tiers - 1 ? h : y0 + (h - pod) * (t === 0 ? 0.55 : 0.3);
      const th = top - y0;
      b.add(key, boxGeo(cw, th, cd, { faces: [1, 1, 0, 0, 1, 1], tile: TYPE_TILE[key], color: tint }), [x, y0 + th / 2, z]);
      const box = world.addBox(x, y0, z, cw, th, cd, 'building', { info });
      info.tiers.push(box);
      roof(b, x, top, z, cw, cd, type, t === tiers - 1);
      if (type === 'brick' || type === 'stucco') balconies(b, x, z, cw, cd, y0, top, tint);
      if (type === 'brick' && rand() < 0.7) fireEscape(b, x, z, cw, cd, y0, top);
      y0 = top; cw *= 0.78; cd *= 0.78;
    }
    info.roofY = y0;
    if (type === 'tower' && rand() < 0.6) { b.box('metal', 0.5, 12, 0.5, x, y0 + 6, z, { color: 0xcfd6dc }); b.box('glow', 0.5, 0.5, 0.5, x, y0 + 12.3, z, { color: 0xff4040 }); }
    buildings.push(info);
    if (h > 25 && rand() < 0.35) roofSpots.push({ x: x + (rand() - 0.5) * cw * 0.5, y: y0 + 1.2, z: z + (rand() - 0.5) * cd * 0.5, name: 'Azotea' });
    return info;
  }
  function roof(b, x, y, z, w, d, type, last) {
    b.add('roof', boxGeo(w, 0.3, d, { tile: [6, 6], faces: [1, 1, 1, 0, 1, 1] }), [x, y + 0.15, z]);
    const ph = 1.0, pt = 0.35;
    const col = type === 'tower' ? 0xa9b3bd : type === 'brick' ? 0x9b5a45 : 0xd8d2c8;
    for (const [px, pz, pw, pd] of [[x, z + d / 2 - pt / 2, w, pt], [x, z - d / 2 + pt / 2, w, pt], [x + w / 2 - pt / 2, z, pt, d], [x - w / 2 + pt / 2, z, pt, d]]) {
      b.box('trim', pw, ph, pd, px, y + 0.3 + ph / 2, pz, { color: col, tile: [3, 3] });
      world.addBox(px, y, pz, pw, ph + 0.3, pd, 'parapet');
    }
    if (!last) return;
    const n = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const ax = x + (rand() - 0.5) * (w - 6), az = z + (rand() - 0.5) * (d - 6), aw = 2 + rand() * 2, ah = 1.2 + rand() * 1.2, ad = 1.6 + rand() * 1.5;
      if (w < 9 || d < 9) break;
      b.box('metal', aw, ah, ad, ax, y + 0.3 + ah / 2, az, { color: 0xb8c0c6, tile: [2, 2] });
      b.box('trim', aw * 0.5, 0.15, aw * 0.5, ax, y + 0.3 + ah + 0.08, az, { color: 0x30363c });
      world.addBox(ax, y, az, aw, ah + 0.3, ad, 'prop');
    }
    if ((type === 'brick' || type === 'office') && w > 10 && rand() < 0.6) { // tanque de agua
      const tx = x + (rand() - 0.5) * (w - 6), tz = z + (rand() - 0.5) * (d - 6);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('metal', 0.18, 2.4, 0.18, tx + sx, y + 1.5, tz + sz, { color: 0x4a4a4a });
      b.add('paint', prep(new THREE.CylinderGeometry(1.5, 1.5, 2.8, 12), 0x8a6a4a), [tx, y + 4.1, tz]);
      b.add('paint', prep(new THREE.ConeGeometry(1.6, 0.9, 12), 0x5a4a3a), [tx, y + 5.95, tz]);
      world.addBox(tx, y, tz, 3.2, 6.4, 3.2, 'prop');
    }
  }
  function balconies(b, x, z, w, d, y0, top, tint) {
    const face = rand() < 0.5 ? 'z' : 'x', s = rand() < 0.5 ? -1 : 1;
    for (let y = y0 + 3.2; y < top - 1.5; y += 3.2) for (let k = -1; k <= 1; k++) {
      if (rand() < 0.35) continue;
      const along = k * 3 * (face === 'z' ? Math.min(1, w / 10) : Math.min(1, d / 10));
      const bx = face === 'x' ? x + s * (w / 2 + 0.6) : x + along, bz = face === 'z' ? z + s * (d / 2 + 0.6) : z + along;
      const bw = face === 'x' ? 1.2 : 2.4, bd = face === 'x' ? 2.4 : 1.2;
      b.box('trim', bw, 0.18, bd, bx, y, bz, { color: tint === 0xffffff ? 0xe4ded2 : tint }); camWorld.addBox(bx, y - 0.09, bz, bw, 1.0, bd, 'balcony');
      b.box('metal', face === 'x' ? 0.06 : bw, 0.9, face === 'x' ? bd : 0.06, bx + (face === 'x' ? s * 0.57 : 0), y + 0.5, bz + (face === 'z' ? s * 0.57 : 0), { color: 0x2f3438 });
    }
  }
  function fireEscape(b, x, z, w, d, y0, top) {
    const s = rand() < 0.5 ? -1 : 1, fx = x + s * (w / 2 + 0.9);
    camWorld.addBox(fx, y0 + 1.4, z, 1.7, Math.max(0.5, top - y0 - 1.4), 4.1, 'fire_escape');
    for (let y = y0 + 3.2; y < top - 1; y += 3.2) {
      b.box('metal', 1.6, 0.12, 4, fx, y, z, { color: 0x2a2d30 });
      b.box('metal', 0.06, 0.9, 4, fx + s * 0.78, y + 0.45, z, { color: 0x2a2d30 });
      b.add('metal', boxGeo(0.9, 0.08, 3.6, { color: 0x34383c }), [fx, y - 1.6, z, 0, 0.8, 0]);
    }
  }

  /* ---------------- mobiliario urbano (fusionado por franja) ---------------- */
  function streetFurniture(b, cx, cz, size, bx, bz) {
    const e = size / 2 - 1.2;
    for (const [sx, sz, ry] of [[1, 0, 0], [-1, 0, 0], [0, 1, Math.PI / 2], [0, -1, Math.PI / 2]]) {
      for (let k = -1; k <= 1; k += 2) {
        const along = k * size * 0.28;
        const x = cx + sx * e + (sz ? along : 0), z = cz + sz * e + (sx ? along : 0);
        lamp(b, x, z, Math.atan2(sx, sz));
      }
      const tx = cx + sx * e + (sz ? 0 : 0), tz = cz + sz * e;
      if ((bx + bz) % 2 === 0) tree(b, tx + (sz ? size * 0.1 : 0), tz + (sx ? size * 0.1 : 0), 0.9);
      if (rand() < 0.4) bench(b, cx + sx * (e - 0.4) + (sz ? -size * 0.12 : 0), cz + sz * (e - 0.4) + (sx ? -size * 0.12 : 0), ry);
      if (rand() < 0.5) bin(b, cx + sx * e + (sz ? size * 0.18 : 0), cz + sz * e + (sx ? size * 0.18 : 0));
      if (rand() < 0.25) hydrant(b, cx + sx * e + (sz ? -size * 0.38 : 0), cz + sz * e + (sx ? -size * 0.38 : 0));
      void ry;
    }
    if ((bx * 7 + bz) % 5 === 0) busStop(b, cx + e + 0.3, cz + size * 0.15, Math.PI / 2); // V2: junto al cordón (antes tapaba la línea de caminata)
  }
  function lamp(b, x, z, rot) {
    b.add('metal', prep(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), 0x3a4048), [x, CURB + 3, z]);
    b.box('metal', 0.1, 0.1, 1.6, x, CURB + 5.9, z, { color: 0x3a4048 }, rot);
    const hx = x - Math.sin(rot) * 0.7, hz = z - Math.cos(rot) * 0.7;
    b.box('glow', 0.5, 0.14, 0.32, hx, CURB + 5.8, hz, { color: 0xfff1c4 }, rot);
    lamps.push([hx, CURB + 5.7, hz]);
    world.addBox(x, 0, z, 0.3, 6, 0.3, 'pole');
  }
  function tree(b, x, z, s = 1, detail = 1) { // detail 0: copa más simple (costanera, lejos de la acción)
    b.add('paint', prep(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 3.2 * s, detail ? 6 : 5), 0x6b4f35), [x, CURB + 1.6 * s, z]);
    const g = rand() * 0.15;
    b.add('paint', prep(new THREE.IcosahedronGeometry(1.7 * s, detail), new THREE.Color(0.24 + g, 0.48 + g, 0.25).getHex()), [x, CURB + 3.9 * s, z, rand() * 3, 0, 0, 1, 0.85, 1]);
    b.add('paint', prep(new THREE.IcosahedronGeometry(1.2 * s, detail), new THREE.Color(0.3 + g, 0.56 + g, 0.28).getHex()), [x + 0.6 * s, CURB + 4.7 * s, z - 0.3 * s]);
    world.addBox(x, 0, z, 0.5 * s, 3 * s, 0.5 * s, 'tree');
    trees.push([x, z]);
  }
  function bench(b, x, z, ry) {
    b.box('paint', 1.8, 0.1, 0.5, x, CURB + 0.45, z, { color: 0x8a5a32 }, ry);
    b.add('paint', boxGeo(1.8, 0.45, 0.08, { color: 0x8a5a32 }), [x - Math.sin(ry) * 0.25, CURB + 0.75, z - Math.cos(ry) * 0.25, ry]);
    for (const k of [-0.75, 0.75]) b.box('metal', 0.08, 0.45, 0.45, x + Math.cos(ry) * k, CURB + 0.22, z - Math.sin(ry) * k, { color: 0x2f3438 }, ry);
    world.addBox(x, 0, z, 1.2, CURB + 0.5, 1.2, 'prop');
    benches.push({ x, z, ry });
  }
  function bin(b, x, z) { b.add('paint', prep(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 8), 0x2e6b3a), [x, CURB + 0.45, z]); }
  function hydrant(b, x, z) { b.add('paint', prep(new THREE.CylinderGeometry(0.16, 0.2, 0.75, 8), 0xd23a2a), [x, CURB + 0.37, z]); b.add('paint', prep(new THREE.SphereGeometry(0.17, 8, 6), 0xd23a2a), [x, CURB + 0.78, z]); }
  function busStop(b, x, z, ry) {
    b.box('paint', 3.6, 0.12, 1.6, x, CURB + 2.6, z, { color: 0x1a73a8 }, ry);
    b.box('metal', 3.6, 2.4, 0.06, x + Math.sin(ry) * 0.75, CURB + 1.3, z + Math.cos(ry) * 0.75, { color: 0x9ec7da }, ry);
    b.add('signs', boxGeo(1.2, 0.9, 0.08, { uvRect: { [FACE.pz]: signRect(11), [FACE.nz]: signRect(11) } }), [x, CURB + 3.2, z, ry]);
    world.addBox(x, 0, z, 1.8, 2.7, 3.8, 'prop');
  }

  /* ---------------- lugares memorables ---------------- */
  function landmark(kind, b, cx, cz, inner) {
    if (kind === 'plaza') {
      b.add('sidewalk', boxGeo(inner, 0.08, inner, { tile: [2, 2], color: 0xe9e2d4, faces: [0, 0, 1, 0, 0, 0] }), [cx, CURB + 0.04, cz]);
      // fuente
      b.add('trim', prep(new THREE.CylinderGeometry(6.5, 6.8, 0.8, 28), 0xcfc7b8), [cx, CURB + 0.4, cz]);
      b.add('trim', prep(new THREE.CylinderGeometry(1.2, 1.5, 2.6, 16), 0xcfc7b8), [cx, CURB + 1.3, cz]);
      b.add('trim', prep(new THREE.CylinderGeometry(2.6, 2.2, 0.4, 20), 0xcfc7b8), [cx, CURB + 2.7, cz]);
      world.addBox(cx, 0, cz, 12.4, CURB + 0.8, 12.4, 'fountain');
      world.addBox(cx, 0, cz, 2.6, CURB + 2.9, 2.6, 'fountain');
      landmarks.fountain = { x: cx, z: cz, y: CURB + 0.8 };
      // monumento M sobre pedestal
      const mx = cx, mz = cz + 15;
      b.box('trim', 3, 3, 3, mx, CURB + 1.5, mz, { color: 0x9aa0a6 });
      b.add('signs', boxGeo(2.4, 2.4, 0.4, { uvRect: { [FACE.pz]: signRect(7), [FACE.nz]: signRect(7) } }), [mx, CURB + 4.3, mz]);
      world.addBox(mx, 0, mz, 3, CURB + 3, 3, 'prop');
      b.add('signs', boxGeo(3.6, 1.2, 0.12, { uvRect: { [FACE.nz]: signRect(8), [FACE.pz]: signRect(8) } }), [cx, CURB + 2.2, cz - 20]);
      // quiosco (techo trepable)
      const kx = cx - 14, kz = cz - 10;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('paint', prep(new THREE.CylinderGeometry(0.15, 0.15, 3.4, 6), 0xf4f1ea), [kx + sx * 2.4, CURB + 1.7, kz + sz * 2.4]);
      b.add('paint', prep(new THREE.ConeGeometry(4.2, 1.6, 8), 0xc0392b), [kx, CURB + 4.2, kz, Math.PI / 8]);
      b.box('trim', 5.8, 0.25, 5.8, kx, CURB + 3.45, kz, { color: 0xf4f1ea });
      world.addBox(kx, CURB + 3.3, kz, 5.8, 0.4, 5.8, 'prop');
      landmarks.kiosk = { x: kx, z: kz, y: CURB + 3.7 };
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; bench(b, cx + Math.cos(a) * 10, cz + Math.sin(a) * 10, -a + Math.PI / 2); }
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { tree(b, cx + sx * 18, cz + sz * 18, 1.15); lamp(b, cx + sx * 9, cz + sz * 21, 0); }
      landmarks.plaza = { x: cx, z: cz };
      medalSpots.push({ x: kx, y: CURB + 4.9, z: kz, name: 'Quiosco' }, { x: mx, y: CURB + 6, z: mz, name: 'Monumento M' });
    } else if (kind === 'banco') {
      const w = 34, d = 26, h = 18, x = cx, z = cz + 4;
      b.box('trim', w + 4, 1.6, d + 6, x, CURB + 0.8, z, { color: 0xd8d2c4, tile: [3, 3] }); // escalinata
      for (let i = 0; i < 5; i++) { const sh = (i + 1) * 0.356, sz = z - (d + 6) / 2 - (5 - i) * 0.6 + 0.3; b.box('trim', w + 4, sh, 0.6, x, sh / 2, sz, { color: 0xe2ddd0 }); world.addBox(x, 0, sz, w + 4, sh, 0.6, 'curb'); } // escalones
      const inn = hollow(b, x, CURB + 1.6, z, w, d, h, 'office', [9, 14], 0xf4efe2, 0xf3ead8, 'banco');
      // hall del banco: piso de mármol, mostradores, columnas, bóveda y lámparas
      const fy = CURB + 1.6;
      b.box('trim', 18, 1.15, 1.1, x, fy + 0.6, z + 5, { color: 0x6b4a32 }); b.box('trim', 18.4, 0.12, 1.4, x, fy + 1.22, z + 5, { color: 0xd9cfbf });
      world.addBox(x, fy, z + 5, 18, 1.2, 1.1, 'prop');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.add('trim', prep(new THREE.CylinderGeometry(0.55, 0.6, h - 0.6, 12), 0xf2ede2), [x + sx * 9, fy + (h - 0.6) / 2, z + sz * 6 - 2]); world.addBox(x + sx * 9, fy, z + sz * 6 - 2, 1.2, h - 0.6, 1.2, 'pole'); }
      b.add('paint', prep(new THREE.CylinderGeometry(3, 3, 0.4, 24).rotateX(Math.PI / 2), 0xb8c0c6), [x, fy + 4, z + d / 2 - 0.9]);
      b.add('glow', prep(new THREE.TorusGeometry(3.05, 0.08, 6, 32), 0xffd34a), [x, fy + 4, z + d / 2 - 1.1]);
      for (let i = -2; i <= 2; i++) b.box('glow', 1.6, 0.15, 1.6, x + i * 6, fy + h - 0.7, z - 2, { color: 0xfff1c4 });
      for (const sx of [-1, 1]) { bench(b, x + sx * 12, z - 6, 0); b.add('paint', prep(new THREE.IcosahedronGeometry(0.8, 1), 0x3f8a3a), [x + sx * 15, fy + 1.2, z + 10]); b.add('paint', prep(new THREE.CylinderGeometry(0.5, 0.4, 0.8, 8), 0x8a5a32), [x + sx * 15, fy + 0.4, z + 10]); }
      interiors.push({ id: 'banco', name: 'Hall del Banco Central', x, z, y: fy, w: inn.w, d: inn.d, h, light: [x, fy + h - 2, z], npc: { x: x + 2, z: z + 6.4, yaw: Math.PI } });
      medalSpots.push({ x: x - 6, y: fy + 1.2, z: z + 9, name: 'Bóveda del Banco' });
      for (let i = 0; i < 8; i++) b.add('trim', prep(new THREE.CylinderGeometry(0.75, 0.85, h - 2, 12), 0xf2ede2), [x - w / 2 + 2.2 + i * (w - 4.4) / 7, CURB + 1.6 + (h - 2) / 2, z - d / 2 - 1.5]);
      b.box('trim', w + 2, 1.6, 4, x, CURB + 1.6 + h - 1, z - d / 2 - 1.5, { color: 0xe8e2d4 });
      const tri = new THREE.Shape([new THREE.Vector2(-w / 2 - 1, 0), new THREE.Vector2(w / 2 + 1, 0), new THREE.Vector2(0, 4.5)]);
      b.add('trim', prep(new THREE.ExtrudeGeometry(tri, { depth: 3, bevelEnabled: false }), 0xe8e2d4), [x, CURB + 1.6 + h, z - d / 2 - 3.5]);
      b.add('signs', boxGeo(10, 2.2, 0.2, { uvRect: { [FACE.nz]: signRect(4) } }), [x, CURB + 1.6 + h - 3.6, z - d / 2 - 3.6]);
      world.addBox(x, 0, z, w + 4, CURB + 1.6, d + 6, 'building');
      const box = inn.roof;
      world.addBox(x, CURB + 1.6 + h - 1.8, z - d / 2 - 1.5, w + 2, 1.6, 4, 'building');
      for (let i = 0; i < 8; i++) world.addBox(x - w / 2 + 2.2 + i * (w - 4.4) / 7, CURB + 1.6, z - d / 2 - 1.5, 1.6, h - 2, 1.6, 'pole');
      buildings.push({ type: 'banco', x, z, w, d, h: h + 1.6, tiers: [box], roofY: CURB + 1.6 + h });
      landmarks.banco = { x, z, y: CURB + 1.6 + h };
      medalSpots.push({ x, y: CURB + 1.6 + h + 1.2, z, name: 'Techo del Banco' });
    } else if (kind === 'altura') {
      const info = buildingCustom(b, cx, cz, 30, 30, [[0, 70, 1], [70, 120, 0.75], [120, 152, 0.5]], 'glass0', 'tower');
      b.box('metal', 0.9, 30, 0.9, cx, info.roofY + 15, cz, { color: 0xdfe6ec });
      b.box('glow', 1.2, 1.2, 1.2, cx, info.roofY + 30.5, cz, { color: 0xff3030 });
      for (const f of [FACE.nz, FACE.pz]) b.add('signs', boxGeo(10, 2.5, 0.3, { uvRect: { [f]: signRect(5) } }), [cx, 9, cz + (f === FACE.pz ? 15.3 : -15.3)]);
      landmarks.altura = { x: cx, z: cz, y: info.roofY };
      medalSpots.push({ x: cx + 4, y: info.roofY + 1.2, z: cz + 4, name: 'Cima de Torre Altura' }, { x: cx + 12, y: 70.4 + 1.2, z: cz, name: 'Retiro de la Torre' });
    } else if (kind === 'reloj') {
      const info = buildingCustom(b, cx, cz, 14, 14, [[0, 38, 1]], 'office', 'stone', 0xe4d9c4);
      b.add('paint', prep(new THREE.ConeGeometry(9.6, 9, 4), 0x5b3a2a), [cx, info.roofY + 4.5, cz, Math.PI / 4]);
      for (const f of [FACE.px, FACE.nx, FACE.pz, FACE.nz]) {
        const ox = f === FACE.px ? 7.05 : f === FACE.nx ? -7.05 : 0, oz = f === FACE.pz ? 7.05 : f === FACE.nz ? -7.05 : 0;
        b.add('signs', boxGeo(f <= 1 ? 0.1 : 6, 6, f <= 1 ? 6 : 0.1, { uvRect: { [f]: signRect(6) } }), [cx + ox, 32, cz + oz]);
      }
      b.add('signs', boxGeo(8, 1.4, 0.2, { uvRect: { [FACE.nz]: signRect(13) } }), [cx, 6, cz - 7.2]);
      for (let k = 0; k < 4; k++) { tree(b, cx - 16 + k * 10, cz - 18, 1); tree(b, cx - 16 + k * 10, cz + 18, 1); }
      landmarks.reloj = { x: cx, z: cz, y: info.roofY };
      medalSpots.push({ x: cx + 3, y: info.roofY + 1.2, z: cz + 3, name: 'Torre del Reloj' });
    } else if (kind === 'parque') {
      b.add('grass', boxGeo(inner + 4, 0.12, inner + 4, { tile: [6, 6], faces: [0, 0, 1, 0, 0, 0] }), [cx, CURB + 0.06, cz]);
      for (const [w, d] of [[inner + 4, 3], [3, inner + 4]]) b.add('sidewalk', boxGeo(w, 0.06, d, { tile: [2, 2], color: 0xd9c9a8, faces: [0, 0, 1, 0, 0, 0] }), [cx, CURB + 0.13, cz]);
      b.add('water', prep(new THREE.CircleGeometry(7, 24).rotateX(-Math.PI / 2), 0xffffff), [cx + 11, CURB + 0.16, cz + 11]);
      // gran ombú (tronco grueso + copa: plataforma trepable)
      const ox = cx - 10, oz = cz - 10;
      b.add('paint', prep(new THREE.CylinderGeometry(1.6, 2.6, 7, 9), 0x5a4330), [ox, CURB + 3.5, oz]);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; b.add('paint', prep(new THREE.CylinderGeometry(0.5, 0.8, 5, 6), 0x5a4330), [ox + Math.cos(a) * 2, CURB + 7.2, oz + Math.sin(a) * 2, 0, Math.sin(a) * 0.7, Math.cos(a) * 0.7]); }
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; b.add('paint', prep(new THREE.IcosahedronGeometry(4 + rand() * 1.5, 1), 0x3f7d3a + (k % 2) * 0x050a05), [ox + Math.cos(a) * 5, CURB + 10 + rand() * 1.5, oz + Math.sin(a) * 5, 0, 0, 0, 1, 0.7, 1]); }
      world.addBox(ox, 0, oz, 3.6, CURB + 7, 3.6, 'tree');
      world.addBox(ox, CURB + 9.4, oz, 12, 1, 12, 'prop');
      landmarks.ombu = { x: ox, z: oz, y: CURB + 10.4 };
      landmarks.parque = { x: cx, z: cz };
      // juegos: tobogán y hamacas
      const px = cx + 12, pz = cz - 12;
      b.box('paint', 2, 3, 2, px, CURB + 1.5, pz, { color: 0xe0b030 }); world.addBox(px, 0, pz, 2, CURB + 3, 2, 'prop');
      b.add('paint', boxGeo(1.2, 0.15, 5, { color: 0x2f8fd0 }), [px, CURB + 1.6, pz + 3.2, 0, -0.55, 0]);
      for (const k of [-1.5, 1.5]) b.add('metal', prep(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), 0xc0392b), [px - 6 + k, CURB + 1.5, pz]);
      b.box('metal', 3.4, 0.12, 0.12, px - 6, CURB + 3, pz, { color: 0xc0392b });
      for (let i = 0; i < 18; i++) { const a = rand() * 6.28, r = 8 + rand() * 12; const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (Math.abs(x - cx) < 2.5 || Math.abs(z - cz) < 2.5) continue; tree(b, x, z, 0.8 + rand() * 0.5); }
      for (let i = 0; i < 4; i++) bench(b, cx + (i < 2 ? -2.6 : 2.6), cz + (i % 2 ? -8 : 8), Math.PI / 2);
      b.add('signs', boxGeo(4, 1.2, 0.12, { uvRect: { [FACE.nz]: signRect(9), [FACE.pz]: signRect(9) } }), [cx, CURB + 2.4, cz - inner / 2 + 1]);
      medalSpots.push({ x: ox, y: CURB + 11.6, z: oz, name: 'Copa del Ombú' });
    } else if (kind === 'puenteO' || kind === 'puenteE') {
      const s = kind === 'puenteO' ? -1 : 1, x = cx - s * 6;
      const info = buildingCustom(b, x, cz, 26, 26, [[0, 64, 1], [64, 78, 0.7]], 'glass1', 'tower');
      if (kind === 'puenteE') {
        const y = 40, len = (cx - 6) - (blockCenter(2) + 6) - 26;
        const mx = (blockCenter(2) + 6 + 13 + cx - 6 - 13) / 2;
        b.box('glass2', len, 4, 5, mx, y + 2, cz, { tile: [12, 14] });
        b.box('trim', len, 0.5, 5.6, mx, y - 0.25, cz, { color: 0xb8c0c6 });
        b.box('roof', len, 0.3, 5.6, mx, y + 4.15, cz, { tile: [6, 6] });
        world.addBox(mx, y - 0.5, cz, len, 4.8, 5.6, 'building', { landmark: 'puente' });
        landmarks.puente = { x: mx, z: cz, y: y + 4.3 };
        medalSpots.push({ x: mx, y: y + 5.5, z: cz, name: 'Puente Elevado' });
      }
      void info;
    } else if (kind === 'obra') {
      // vallado, estructura de vigas y grúa torre
      for (const [w, d, ox, oz] of [[inner, 0.2, 0, -inner / 2], [inner, 0.2, 0, inner / 2], [0.2, inner, -inner / 2, 0], [0.2, inner, inner / 2, 0]]) {
        b.box('paint', w, 2.2, d, cx + ox, CURB + 1.1, cz + oz, { color: 0xd9a520 }); world.addBox(cx + ox, 0, cz + oz, w || 0.2, CURB + 2.2, d || 0.2, 'fence');
      }
      b.add('signs', boxGeo(4, 1.2, 0.1, { uvRect: { [FACE.nz]: signRect(10) } }), [cx, CURB + 1.4, cz - inner / 2 - 0.15]);
      for (let fy = 0; fy < 4; fy++) for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
        const x = cx - 12 + i * 6, z = cz - 6 + k * 6, y = CURB + fy * 5;
        b.box('metal', 0.4, 5, 0.4, x, y + 2.5, z, { color: 0xb5562c });
        if (i < 3) b.box('metal', 6, 0.4, 0.4, x + 3, y + 5, z, { color: 0xb5562c });
        if (k < 3) b.box('metal', 0.4, 0.4, 6, x, y + 5, z + 3, { color: 0xb5562c });
        world.addBox(x, y, z, 0.4, 5, 0.4, 'beam');
      }
      for (let fy = 1; fy <= 4; fy++) { b.box('roof', 18, 0.25, 18, cx - 3, CURB + fy * 5 + 0.1, cz + 3, { tile: [6, 6] }); world.addBox(cx - 3, CURB + fy * 5 - 0.2, cz + 3, 18.4, 0.5, 18.4, 'building'); }
      const gx = cx + 14, gz = cz - 14;
      b.box('metal', 1.6, 48, 1.6, gx, CURB + 24, gz, { color: 0xe8b81a });
      b.box('metal', 34, 1.2, 1.2, gx - 10, CURB + 48, gz, { color: 0xe8b81a });
      b.box('metal', 3, 3, 3, gx + 5, CURB + 47, gz, { color: 0x6a6a6a });
      b.box('paint', 2.2, 2.2, 2.2, gx, CURB + 46, gz, { color: 0x3a6fa0 });
      world.addBox(gx, 0, gz, 1.6, CURB + 47.4, 1.6, 'building', { landmark: 'grua' });
      world.addBox(gx - 10, CURB + 47.4, gz, 34, 1.2, 1.2, 'building', { landmark: 'grua' });
      landmarks.obra = { x: cx, z: cz }; landmarks.grua = { x: gx - 22, z: gz, y: CURB + 48.6 };
      medalSpots.push({ x: gx - 24, y: CURB + 50, z: gz, name: 'Punta de la grúa' });
    } else if (kind === 'centro') {
      const fy = CURB, H = 14;
      const inn = hollow(b, cx, fy, cz, 30, 22, H, 'stucco', [9, 12.8], 0xf3d9b8, 0xe8f0f6, 'centro');
      const info = { roofY: fy + H };
      buildings.push({ type: 'centro', x: cx, z: cz, w: 30, d: 22, h: H, tiers: [inn.roof], roofY: fy + H });
      // gimnasio: cama elástica, muro de escalada con repisa, aro de básquet, gradas
      b.add('paint', prep(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 24), 0x2f6db0), [cx - 8, fy + 0.25, cz + 2]);
      b.add('glow', prep(new THREE.TorusGeometry(2.4, 0.12, 6, 32).rotateX(Math.PI / 2), 0x6ff3ff), [cx - 8, fy + 0.52, cz + 2]);
      world.addBox(cx - 8, fy, cz + 2, 4.4, 0.5, 4.4, 'trampoline');
      b.box('paint', 10, 9, 0.5, cx + 6, fy + 4.5, cz + 10.4, { color: 0x8a8f96 });
      for (let i = 0; i < 26; i++) b.add('paint', prep(new THREE.IcosahedronGeometry(0.18, 0), [0xe74c3c, 0xf1c40f, 0x2ecc71, 0x3498db][i % 4]), [cx + 1.5 + (i * 37 % 90) / 10, fy + 0.8 + (i * 53 % 80) / 10, cz + 10.05]);
      b.box('trim', 6, 0.3, 2.4, cx + 6, fy + 9.2, cz + 9.2, { color: 0x8a6a4a }); world.addBox(cx + 6, fy + 9.05, cz + 9.2, 6, 0.3, 2.4, 'prop');
      b.box('metal', 0.15, 3.2, 0.15, cx - 13, fy + 1.6, cz - 6); b.box('paint', 1.8, 1.1, 0.08, cx - 13, fy + 3.4, cz - 5.6, { color: 0xffffff }); b.add('paint', prep(new THREE.TorusGeometry(0.3, 0.03, 6, 16).rotateX(Math.PI / 2), 0xe67e22), [cx - 13, fy + 3.05, cz - 5.2]);
      for (let k = 0; k < 3; k++) { b.box('trim', 12, 0.5, 1.2, cx + 4, fy + 0.25 + k * 0.5, cz - 7.5 + k * 1.2, { color: 0x9a7048 }); world.addBox(cx + 4, fy, cz - 7.5 + k * 1.2, 12, 0.5 + k * 0.5, 1.2, 'prop'); }
      for (let i = -1; i <= 1; i++) b.box('glow', 2, 0.15, 2, cx + i * 9, fy + H - 0.7, cz, { color: 0xeaf6ff });
      interiors.push({ id: 'centro', name: 'Centro Comunitario', x: cx, z: cz, y: fy, w: inn.w, d: inn.d, h: H, light: [cx, fy + H - 2, cz], npc: { x: cx - 3, z: cz - 3, yaw: 0 } });
      medalSpots.push({ x: cx + 6, y: fy + 10.5, z: cz + 9, name: 'Repisa del muro de escalada' });
      b.add('signs', boxGeo(10, 1.8, 0.2, { uvRect: { [FACE.nz]: signRect(12) } }), [cx, 6, cz - 11.2]);
      b.add('signs', boxGeo(8, 3, 0.2, { uvRect: { [FACE.px]: signRect(14), [FACE.nx]: signRect(14) } }), [cx + 15.15, 9, cz, Math.PI / 2]);
      landmarks.centro = { x: cx, z: cz, y: info.roofY };
      for (let k = 0; k < 3; k++) tree(b, cx - 12 + k * 12, cz + 16, 1);
    }
  }
  /** Edificio hueco y visitable: 4 muros con puerta al frente (-Z), forro interior liso, piso, cielorraso y techo transitable. */
  function hollow(b, x, y0, z, w, d, h, key, tile, tint, lining, landmarkId) {
    const t = 0.6, dw = 4, dh = 4.6, segW = (w - dw) / 2;
    const wall = (ww, hh, dd, px, py, pz) => { b.add(key, boxGeo(ww, hh, dd, { tile, color: tint }), [px, py, pz]); world.addBox(px, py - hh / 2, pz, ww, hh, dd, 'building', { landmark: landmarkId }); };
    wall(w, h, t, x, y0 + h / 2, z + d / 2 - t / 2);
    wall(t, h, d - 2 * t, x - w / 2 + t / 2, y0 + h / 2, z);
    wall(t, h, d - 2 * t, x + w / 2 - t / 2, y0 + h / 2, z);
    wall(segW, h, t, x - dw / 2 - segW / 2, y0 + h / 2, z - d / 2 + t / 2);
    wall(segW, h, t, x + dw / 2 + segW / 2, y0 + h / 2, z - d / 2 + t / 2);
    wall(dw, h - dh, t, x, y0 + dh + (h - dh) / 2, z - d / 2 + t / 2);
    // forro interior (tapa las ventanas pintadas de la fachada)
    const L = (ww, hh, dd, px, py, pz) => b.box('paint', ww, hh, dd, px, py, pz, { color: lining });
    L(w - 2 * t, h - 0.4, 0.06, x, y0 + h / 2, z + d / 2 - t - 0.03);
    L(0.06, h - 0.4, d - 2 * t, x - w / 2 + t + 0.03, y0 + h / 2, z); L(0.06, h - 0.4, d - 2 * t, x + w / 2 - t - 0.03, y0 + h / 2, z);
    L(segW - t, h - 0.4, 0.06, x - dw / 2 - (segW - t) / 2, y0 + h / 2, z - d / 2 + t + 0.03); L(segW - t, h - 0.4, 0.06, x + dw / 2 + (segW - t) / 2, y0 + h / 2, z - d / 2 + t + 0.03);
    L(dw, h - dh - 0.4, 0.06, x, y0 + dh + (h - dh) / 2, z - d / 2 + t + 0.03);
    b.add('sidewalk', boxGeo(w - 2 * t, 0.06, d - 2 * t, { tile: [2, 2], color: 0xece4d4, faces: [0, 0, 1, 0, 0, 0] }), [x, y0 + 0.03, z]);
    b.box('paint', w - 2 * t, 0.2, d - 2 * t, x, y0 + h - 0.35, z, { color: 0xf8f4ec });
    b.box('trim', dw + 0.6, 0.3, 0.8, x, y0 + dh + 0.15, z - d / 2 - 0.1, { color: 0x6b4a32 });
    const roofBox = world.addBox(x, y0 + h - 0.45, z, w, 0.75, d, 'building', { landmark: landmarkId, roof: true });
    roof(b, x, y0 + h, z, w, d, 'office', false);
    return { w: w - 2 * t, d: d - 2 * t, roof: roofBox };
  }
  /** Edificio con niveles a medida: tiers = [[y0, y1, escala]] */
  function buildingCustom(b, x, z, w, d, tiers, key, type, tint = 0xffffff) {
    const info = { type, x, z, w, d, h: tiers[tiers.length - 1][1], tiers: [], roofY: 0 };
    for (const [y0, y1, s] of tiers) {
      const tw = w * s, td = d * s, y = CURB + y0;
      b.add(key, boxGeo(tw, y1 - y0, td, { faces: [1, 1, 0, 0, 1, 1], tile: TYPE_TILE[key] || [9, 14], color: tint }), [x, y + (y1 - y0) / 2, z]);
      info.tiers.push(world.addBox(x, y, z, tw, y1 - y0, td, 'building', { info }));
      roof(b, x, CURB + y1, z, tw, td, type, y1 === info.h);
      info.roofY = CURB + y1;
    }
    buildings.push(info);
    return info;
  }

  /* ---------------- distrito Puerto (este): muelle, contenedores, grúas pórtico, galpones y un carguero ---------------- */
  const portB = new Batcher();
  {
    const X0 = HALFW + 8, X1 = 300, Z = 130, pb = portB;
    world.bound.maxX = 340; world.waterX = X1;
    // tierra firme: la isla del centro (el asfalto llega a ±S) y el muelle; alrededor, agua (caer devuelve a tierra)
    const [wx0, , wz0, wz1] = district.rect; // V2: Barrio del Sol (oeste), tierra firme contigua a la isla
    world.floors = [{ minX: -S, maxX: S, minZ: -S, maxZ: S }, { minX: X0 - 1, maxX: X1, minZ: -Z, maxZ: Z }, { minX: wx0, maxX: -S + 0.5, minZ: wz0, maxZ: wz1 }];
    world.bound = { minX: wx0 - 40, maxX: 340, minZ: -S - 40, maxZ: S + 40 };
    pb.add('sidewalk', boxGeo(X1 - X0, 0.2, Z * 2, { tile: [4, 4], color: 0xbab3a6, faces: [1, 1, 1, 0, 1, 1] }), [(X0 + X1) / 2, 0.1, 0]);
    world.addBox((X0 + X1) / 2, 0, 0, X1 - X0, 0.2, Z * 2, 'curb');
    pb.box('paint', 0.5, 1.2, Z * 2, X1 - 0.25, -0.4, 0, { color: 0x3a3a3a }); // borde del muelle
    for (let z = -Z + 6; z < Z; z += 12) { pb.add('metal', prep(new THREE.CylinderGeometry(0.3, 0.35, 0.7, 8), 0x2a2a2a), [X1 - 1.2, 0.55, z]); world.addBox(X1 - 1.2, 0, z, 0.7, 0.9, 0.7, 'prop'); }
    for (let k = 0; k < 6; k++) pb.box('lines', 0.3, 0.02, Z * 2 - 10, X0 + 12 + k * 14, 0.215, 0, { color: 0xf2c230 });
    // mar
    // agua alrededor de toda la isla (antes había huecos sin nada al norte/sur del muelle y en los bordes)
    // (4 franjas alrededor, no debajo de la isla: debajo no se ve y en celulares cada píxel cuenta)
    const R = 1200, seaMat = new THREE.MeshLambertMaterial({ color: 0x3a86a8 }); // opaco y barato: ocupa mucho de la pantalla desde lo alto
    for (const [x0, x1, z0, z1] of [[-R, R, S - 2, R], [-R, R, -R, -S + 2], [-R, -S + 2, -S + 2, wz0 + 2], [-R, -S + 2, wz1 - 2, S - 2], [-R, wx0 + 2, wz0 + 2, wz1 - 2], [S - 2, R, -S + 2, S - 2]]) {
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), seaMat); sea.position.set((x0 + x1) / 2, -1.6, (z0 + z1) / 2); sea.receiveShadow = true; group.add(sea);
    }
    // pilas de contenedores
    const cols = [0xc0392b, 0x2f6db0, 0x27ae60, 0xe67e22, 0x8e44ad, 0x16a085, 0xd4ac0d, 0x7f8c8d];
    const pr = rng(909);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) {
      const cx = X0 + 20 + row * 14, cz = -100 + i * 28 + (row % 2) * 6, n = 1 + Math.floor(pr() * 4);
      for (let k = 0; k < n; k++) {
        const c = cols[Math.floor(pr() * cols.length)], y = k * 2.6;
        pb.box('paint', 2.5, 2.55, 12, cx, y + 1.3, cz, { color: c });
        for (let r = -5; r <= 5; r += 1) pb.box('paint', 2.56, 2.3, 0.08, cx, y + 1.3, cz + r, { color: new THREE.Color(c).multiplyScalar(0.8).getHex() });
        pb.box('paint', 2.52, 0.12, 12.02, cx, y + 2.5, cz, { color: 0x333333 });
      }
      world.addBox(cx, 0, cz, 2.5, n * 2.6, 12, 'building', { landmark: 'contenedor' });
      if (row === 3 && i === 2) medalSpots.push({ x: cx, y: n * 2.6 + 1.2, z: cz, name: 'Pila de contenedores' });
    }
    // grúas pórtico sobre el borde del muelle
    for (const gz of [-60, 40]) {
      const gx = X1 - 8;
      for (const [lx, lz] of [[-6, -6], [-6, 6], [6, -6], [6, 6]]) { pb.box('paint', 1.2, 38, 1.2, gx + lx, 19, gz + lz, { color: 0xe8b81a }); world.addBox(gx + lx, 0, gz + lz, 1.2, 38, 1.2, 'building', { landmark: 'grua_portico' }); }
      pb.box('paint', 70, 2.4, 3, gx + 20, 39, gz, { color: 0xe8b81a }); world.addBox(gx + 20, 37.8, gz, 70, 2.4, 3, 'building', { landmark: 'grua_portico' });
      pb.box('paint', 5, 4, 5, gx, 42, gz, { color: 0x34495e }); world.addBox(gx, 40, gz, 5, 4, 5, 'building');
      for (const sz of [-6, 6]) pb.box('metal', 14, 1, 1, gx, 37, gz + sz, { color: 0xd8a810 });
      landmarks['grua' + (gz < 0 ? 'N' : 'S')] = { x: gx + 20, z: gz, y: 40.2 };
    }
    medalSpots.push({ x: X1 + 40, y: 41.6, z: 40, name: 'Pluma de la grúa pórtico' });
    // galpones
    for (const [gx, gz] of [[X0 + 22, 92], [X0 + 60, 92]]) {
      pb.box('brick', 30, 10, 26, gx, 5, gz, { tile: [9, 12.8], color: 0xe6c8b8 });
      pb.add('metal', prep(new THREE.CylinderGeometry(13, 13, 30, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0x8a9aa6), [gx, 10, gz, 0, 0, 0, 1, 0.35, 1]);
      pb.box('paint', 8, 6, 0.2, gx, 3, gz - 13.05, { color: 0x3a3a3a });
      world.addBox(gx, 0, gz, 30, 10, 26, 'building', { landmark: 'galpon' });
      world.addBox(gx, 10, gz, 30, 3.5, 22, 'building');
    }
    // carguero amarrado
    const sx = X1 + 22, len = 120;
    pb.box('paint', 22, 9, len, sx, 1.5, 0, { color: 0x1f3a5a }); pb.box('paint', 22.2, 1.4, len + 0.2, sx, -2.2, 0, { color: 0x9a2a2a });
    pb.box('trim', 22, 0.3, len, sx, 6.15, 0, { color: 0x6a7076 });
    world.addBox(sx, -3, 0, 22, 9.3, len, 'building', { landmark: 'barco' });
    pb.box('paint', 18, 12, 12, sx, 12, -len / 2 + 10, { color: 0xf2f2f2 }); pb.box('glass2', 18.2, 2, 12.2, sx, 16, -len / 2 + 10, { tile: [12, 14] });
    world.addBox(sx, 6, -len / 2 + 10, 18, 12, 12, 'building', { landmark: 'barco' });
    pb.box('paint', 2, 8, 2, sx, 22, -len / 2 + 10, { color: 0xc0392b }); world.addBox(sx, 18, -len / 2 + 10, 2, 8, 2, 'building');
    for (let i = 0; i < 7; i++) for (let k = 0; k < 2; k++) { const c = cols[(i + k) % cols.length]; pb.box('paint', 6.2, 2.5, 12, sx - 4 + k * 8, 7.5, -30 + i * 13, { color: c, tile: [1.5, 2.5] }); world.addBox(sx - 4 + k * 8, 6.3, -30 + i * 13, 6.2, 2.5, 12, 'building', { landmark: 'barco' }); }
    medalSpots.push({ x: sx, y: 27.2, z: -len / 2 + 10, name: 'Chimenea del carguero' });
    // pasarela al barco
    pb.box('metal', 22, 0.3, 3, X1 + 5, 3.2, -20, { color: 0x7f8c8d }, 0); world.addBox(X1 + 5, 0, -20, 22, 3.35, 3, 'prop');
    pb.add('signs', boxGeo(6, 1.6, 0.2, { uvRect: { [FACE.nx]: signRect(15), [FACE.px]: signRect(15), [FACE.pz]: signRect(15), [FACE.nz]: signRect(15) } }), [X0 + 2, 3, -6, Math.PI / 2]);
    landmarks.puerto = { x: (X0 + X1) / 2, z: 0, y: 0 }; landmarks.barco = { x: sx, z: 0, y: 6.3 };
    for (let z = -Z + 10; z < Z; z += 30) lamp(pb, X0 + 4, z, Math.PI / 2);
  }
  medalSpots.push(...roofSpots.slice(0, Math.max(0, 26 - medalSpots.length)));
  /* ---------------- fondo: skyline lejano (sin colisión) ---------------- */
  const sky = new Batcher();
  const br = rng(77);
  for (let i = 0; i < 70; i++) {
    const a = i / 70 * Math.PI * 2 + br() * 0.05, r = 250 + br() * 90, w = 18 + br() * 22, h = 20 + br() * 90 * (r < 290 ? 1 : 0.6);
    if (Math.cos(a) > 0.35) continue; // hacia el este está el puerto y el mar
    { const sx = Math.cos(a) * r, sz = Math.sin(a) * r; if (sx < -S + 20 && sx > district.rect[0] - 60 && Math.abs(sz) < district.rect[3] + 60) continue; } // V2: ahí está el Barrio del Sol
    const key = br() < 0.5 ? 'glass' + Math.floor(br() * 3) : 'office';
    sky.add(key, boxGeo(w, h, w, { faces: [1, 1, 1, 0, 1, 1], tile: TYPE_TILE[key], color: 0xd0d8e0 }), [Math.cos(a) * r, h / 2, Math.sin(a) * r, a]);
  }

  /* ---------------- semáforos ---------------- */
  // fase A: verde en el eje N-S (autos que viajan en ±Z); fase B: verde en el eje E-O
  const sigB = { A: { r: new Batcher(), y: new Batcher(), g: new Batcher() }, B: { r: new Batcher(), y: new Batcher(), g: new Batcher() } };
  const intersections = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = ROADS[i], z = ROADS[j];
    intersections.push({ x, z, i, j });
    for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const px = x + sx * (RW / 2 + 0.9), pz = z + sz * (RW / 2 + 0.9);
      if (Math.abs(px) > HALFW + 2 || Math.abs(pz) > HALFW + 2) continue;
      const b = B(pz);
      b.add('metal', prep(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 6), 0x2f3438), [px, 2.3, pz]);
      world.addBox(px, 0, pz, 0.3, 4.6, 0.3, 'pole');
      // cabezal para autos que llegan en el eje Z (fase A) mirando hacia -sz, y en eje X (fase B) mirando hacia -sx
      for (const [ph, fx, fz] of [['A', 0, -sz], ['B', -sx, 0]]) {
        const hx = px + fx * 0.3, hz = pz + fz * 0.3, ry = Math.atan2(fx, fz);
        b.box('metal', 0.4, 1.1, 0.3, hx, 4.1, hz, { color: 0x1d2024 }, ry);
        const lx = hx + fx * 0.17, lz = hz + fz * 0.17;
        sigB[ph].r.box('glow', 0.24, 0.24, 0.05, lx, 4.45, lz, {}, ry);
        sigB[ph].y.box('glow', 0.24, 0.24, 0.05, lx, 4.12, lz, {}, ry);
        sigB[ph].g.box('glow', 0.24, 0.24, 0.05, lx, 3.79, lz, {}, ry);
      }
    }
  }
  const sigMats = {}; const sigCols = { r: 0xff2a1a, y: 0xffb21a, g: 0x2aff6a };
  for (const ph of ['A', 'B']) for (const c of ['r', 'y', 'g']) {
    const m = new THREE.MeshBasicMaterial({ color: sigCols[c], toneMapped: false });
    sigMats[ph + c] = m;
    sigB[ph][c].build({ glow: m }, group, 'semaforo' + ph + c);
  }

  /* ---------------- V2: articulación, zona de referencia y costanera ---------------- */
  for (const info of buildings.slice()) detail.articulate(info);
  detail.avenue();
  detail.zoneSignals(intersections);
  detail.promenade(district.roadsZ);

  /* ---------------- construir mallas ---------------- */
  chunks.forEach((b, i) => b.build(mats, group, 'franja' + i));
  portB.build(mats, group, 'puerto');
  roadsB.build(mats, group, 'calles');
  promB.build(mats, group, 'costanera');
  const skyMeshes = sky.build(mats, group, 'skyline');
  skyMeshes.forEach(m => { m.castShadow = false; m.receiveShadow = false; });

  /* ---------------- tráfico: carriles ---------------- */
  // cada calle es un eje con dos carriles; un auto avanza por el eje y gira en los cruces
  const signal = { phase: 'A', state: 'green', t: 0, cycle: 0 };
  const PH = [['A', 'green', 12], ['A', 'yellow', 2.5], ['A', 'red', 1.5], ['B', 'green', 12], ['B', 'yellow', 2.5], ['B', 'red', 1.5]];
  function setSignalMats() {
    for (const ph of ['A', 'B']) {
      const on = signal.phase === ph ? signal.state : 'red';
      sigMats[ph + 'r'].color.setHex(on === 'red' ? 0xff2a1a : 0x3a1010);
      sigMats[ph + 'y'].color.setHex(on === 'yellow' ? 0xffb21a : 0x3a2a10);
      sigMats[ph + 'g'].color.setHex(on === 'green' ? 0x2aff6a : 0x103a1a);
    }
  }
  setSignalMats();

  return {
    group, world, camWorld, buildings, medalSpots, landmarks, intersections, lamps, signal, mats, interiors,
    roads: ROADS, laneOffset: LANE, curb: CURB, sidewalk: SW, roadWidth: RW, half: HALFW,
    walkE: WALK_E, zone: ZONE, inZone, special, trees, benches, shops, detail: detail.st, parkingBays: detail.parkingBays, parkedBoxes: detail.parkedBoxes, houses: detail.houses, district, blockCenter, P_BLOCK: P, N,
    /** ¿Puede pasar un auto que viaja en el eje 'z' (N-S) o 'x' (E-O)? */
    canGo(axis) { const ph = axis === 'z' ? 'A' : 'B'; return signal.phase === ph && signal.state === 'green'; },
    /** ¿Pueden cruzar peatones una calle orientada en el eje dado? (cruzan perpendicular al tránsito con rojo) */
    canCross(roadAxis) { return !this.canGo(roadAxis) && !(signal.state === 'yellow' && signal.phase === (roadAxis === 'z' ? 'A' : 'B')); },
    update(dt) {
      signal.t += dt;
      const cur = PH[signal.cycle];
      if (signal.t >= cur[2]) { signal.t = 0; signal.cycle = (signal.cycle + 1) % PH.length; signal.phase = PH[signal.cycle][0]; signal.state = PH[signal.cycle][1]; setSignalMats(); }
    },
    stats() { let tris = 0, meshes = 0; group.traverse(o => { if (o.isMesh) { meshes++; tris += o.geometry.attributes.position.count / 3; } }); return { tris: Math.round(tris), meshes, boxes: world.boxes.length, buildings: buildings.length }; },
  };
}
