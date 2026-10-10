// @ts-check
/* Academia de Dragones — modelos low-poly procedurales (geometrías fusionadas con colores por vértice).
   Nada de assets externos: cada modelo se arma con primitivas de Three.js, se pinta y se fusiona
   para que cueste 1–3 draw calls. Los modelos miran hacia -Z (adelante). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Pinta una geometría (no indexada) con un color, con variación leve por triángulo para el look facetado.
 * @param {THREE.BufferGeometry} geo @param {number|string} color @param {number} [jit] */
export function paint(geo, color, jit = 0.06) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (geo !== g) geo.dispose();
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * jit;
    for (let j = 0; j < 3 && i + j < n; j++) { arr[(i + j) * 3] = _c.r * k; arr[(i + j) * 3 + 1] = _c.g * k; arr[(i + j) * 3 + 2] = _c.b * k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Pinta por altura (gradiente entre dos colores en Y local). */
function paintGrad(geo, c0, c1, y0, y1) {
  const g = paint(geo, 0xffffff, 0.05);
  const pos = g.attributes.position, col = g.attributes.color;
  _c.set(c0); _c2.set(c1);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    col.setXYZ(i, (_c.r + (_c2.r - _c.r) * t) * col.getX(i), (_c.g + (_c2.g - _c.g) * t) * col.getY(i), (_c.b + (_c2.b - _c.b) * t) * col.getZ(i));
  }
  return g;
}

/** Transforma una geometría: posición, rotación (euler XYZ) y escala. */
export function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e);
  _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
  geo.applyMatrix4(_m);
  return geo;
}

/** @param {THREE.BufferGeometry[]} list */
export function merge(list) {
  const g = mergeGeometries(list, false);
  list.forEach(x => x.dispose());
  g.computeBoundingSphere();
  return g;
}

/** Deforma vértices al azar (rocas). Mantiene los vértices compartidos juntos (antes de toNonIndexed). */
function jitterGeo(geo, amt, seed) {
  const pos = geo.attributes.position; const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let d = map.get(key);
    if (!d) { const h = Math.sin((i + 1) * 91.7 + seed * 13.1) * 43758.5; const r = (h - Math.floor(h)); d = 1 + (r - 0.5) * amt; map.set(key, d); }
    pos.setXYZ(i, pos.getX(i) * d, pos.getY(i) * d, pos.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ======================= materiales compartidos ======================= */
export function makeMaterials() {
  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.04 });
  const vcDouble = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.02, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const cloud = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, metalness: 0, emissive: 0x6d7f99, emissiveIntensity: 0.25 });
  return { vc, vcDouble, glow, cloud };
}

/* ======================= dragones ======================= */
/** Ala: membrana triangulada + hueso del borde de ataque. Se extiende hacia +X desde el hombro. */
function wingGeo(memb, bone, span = 5.6) {
  const s = span / 5.6;
  const P = [[0, 0, -0.9], [2.2 * s, 0.35, -1.0], [5.6 * s, 0.5, 0.0], [4.2 * s, 0.25, 1.4], [2.8 * s, 0.1, 1.2], [1.6 * s, 0.05, 2.1], [0, 0, 1.6]];
  const idx = [0, 1, 4, 1, 2, 3, 1, 3, 4, 0, 4, 5, 0, 5, 6];
  const pos = new Float32Array(idx.length * 3);
  idx.forEach((k, i) => { pos[i * 3] = P[k][0]; pos[i * 3 + 1] = P[k][1]; pos[i * 3 + 2] = P[k][2]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
  const membrane = paint(g, memb, 0.1);
  const b1 = paint(xf(new THREE.CylinderGeometry(0.12, 0.2, 2.4 * s, 5), [1.1 * s, 0.18, -0.95], [0, 0, Math.PI / 2 - 0.12]), bone);
  const b2 = paint(xf(new THREE.CylinderGeometry(0.06, 0.12, 3.6 * s, 5), [3.9 * s, 0.42, -0.5], [0.3, 0, Math.PI / 2 - 0.05]), bone);
  const claw = paint(xf(new THREE.ConeGeometry(0.12, 0.5, 4), [2.25 * s, 0.5, -1.1], [0, 0, -0.4]), 0xf2ead6);
  return merge([membrane, b1, b2, claw]);
}

/** @param {{body:number, belly:number, wing:number, horn:number, element:string}} def @param {ReturnType<typeof makeMaterials>} mats */
export function makeDragon(def, mats) {
  const B = def.body, E = def.belly, H = def.horn;
  const parts = [
    paint(xf(new THREE.SphereGeometry(1.3, 10, 8), [0, 0, 0], [0, 0, 0], [1, 0.95, 2.1]), B),
    paint(xf(new THREE.SphereGeometry(1.15, 10, 6), [0, -0.38, 0.1], [0, 0, 0], [0.88, 0.7, 1.85]), E),
    paint(xf(new THREE.CylinderGeometry(0.5, 0.85, 2.6, 7), [0, 0.85, -2.85], [-1.05, 0, 0]), B),
    paint(xf(new THREE.BoxGeometry(1.15, 0.95, 1.7), [0, 1.6, -4.3], [0.1, 0, 0]), B),
    paint(xf(new THREE.BoxGeometry(0.85, 0.55, 1.3), [0, 1.35, -5.45], [0.12, 0, 0]), B),
    paint(xf(new THREE.BoxGeometry(0.75, 0.25, 1.1), [0, 1.0, -5.3], [0.25, 0, 0]), E),
    paint(xf(new THREE.SphereGeometry(0.18, 6, 4), [0.5, 1.85, -4.75]), 0xfff2a8, 0),
    paint(xf(new THREE.SphereGeometry(0.18, 6, 4), [-0.5, 1.85, -4.75]), 0xfff2a8, 0),
    paint(xf(new THREE.SphereGeometry(0.09, 5, 3), [0.6, 1.86, -4.82]), 0x111111, 0),
    paint(xf(new THREE.SphereGeometry(0.09, 5, 3), [-0.6, 1.86, -4.82]), 0x111111, 0),
    // cola: cono largo + punta
    paint(xf(new THREE.CylinderGeometry(0.08, 0.75, 5.6, 7), [0, 0.05, 4.4], [Math.PI / 2 + 0.08, 0, 0]), B),
    paint(xf(new THREE.ConeGeometry(0.6, 1.1, 4), [0, -0.2, 7.4], [Math.PI / 2, 0, Math.PI / 4], [1, 1, 0.35]), def.wing),
    // patas recogidas
    paint(xf(new THREE.CylinderGeometry(0.22, 0.3, 1.0, 5), [0.75, -1.0, -0.9], [0.9, 0, 0]), B),
    paint(xf(new THREE.CylinderGeometry(0.22, 0.3, 1.0, 5), [-0.75, -1.0, -0.9], [0.9, 0, 0]), B),
    paint(xf(new THREE.CylinderGeometry(0.25, 0.34, 1.2, 5), [0.75, -0.95, 1.3], [1.1, 0, 0]), B),
    paint(xf(new THREE.CylinderGeometry(0.25, 0.34, 1.2, 5), [-0.75, -0.95, 1.3], [1.1, 0, 0]), B),
  ];
  // cuernos según elemento
  const hornLen = def.element === 'fuego' ? 1.7 : def.element === 'tierra' ? 0.9 : 1.25;
  parts.push(paint(xf(new THREE.ConeGeometry(0.2, hornLen, 5), [0.38, 2.15 + hornLen * 0.1, -3.75], [2.3, 0, -0.2]), H));
  parts.push(paint(xf(new THREE.ConeGeometry(0.2, hornLen, 5), [-0.38, 2.15 + hornLen * 0.1, -3.75], [2.3, 0, 0.2]), H));
  // cresta / placas dorsales
  for (let i = 0; i < 7; i++) {
    const z = -2.0 + i * 0.95, y = 1.25 - Math.max(0, i - 3) * 0.22;
    if (def.element === 'tierra') parts.push(paint(xf(new THREE.BoxGeometry(0.25, 0.75, 0.6), [0, y + 0.1, z], [0.3, 0, 0]), 0x8f8a7a));
    else parts.push(paint(xf(new THREE.ConeGeometry(0.22, 0.75 - i * 0.05, 4), [0, y, z], [-0.35, 0, 0]), def.wing));
  }
  if (def.element === 'viento') {
    parts.push(paint(xf(new THREE.ConeGeometry(0.35, 1.3, 3), [0.6, 1.7, -3.8], [2.0, 0, -0.9], [1, 1, 0.25]), def.wing));
    parts.push(paint(xf(new THREE.ConeGeometry(0.35, 1.3, 3), [-0.6, 1.7, -3.8], [2.0, 0, 0.9], [1, 1, 0.25]), def.wing));
  }
  if (def.element === 'fuego') {
    parts.push(paint(xf(new THREE.SphereGeometry(0.5, 6, 4), [0, -0.9, -0.4], [0, 0, 0], [1.2, 0.5, 2.2]), 0xffd36b, 0));
  }
  const body = new THREE.Mesh(merge(parts), mats.vc);
  body.castShadow = true;
  const group = new THREE.Group();
  group.add(body);
  const wg = wingGeo(def.wing, def.body);
  const wingR = new THREE.Mesh(wg, mats.vcDouble); wingR.position.set(0.95, 0.75, -0.6); wingR.castShadow = true;
  const wingL = new THREE.Mesh(wg, mats.vcDouble); wingL.position.set(-0.95, 0.75, -0.6); wingL.scale.x = -1; wingL.castShadow = true;
  group.add(wingR, wingL);
  const seat = new THREE.Object3D(); seat.position.set(0, 1.25, 0.6); group.add(seat);
  return { group, body, wingL, wingR, seat, mouth: new THREE.Vector3(0, 1.35, -6.2) };
}

/** Anima el aleteo. @param {{wingL:THREE.Object3D, wingR:THREE.Object3D}} d @param {number} t @param {number} amp @param {number} freq */
export function flap(d, t, amp, freq) {
  const a = Math.sin(t * freq) * amp + 0.12;
  d.wingR.rotation.z = a; d.wingL.rotation.z = -a;
}

/* ======================= crías (para rescatar) ======================= */
export const CREATURES = {
  cabrita: { body: 0xf3efe6, accent: 0xb9a27a, name: 'cabrita alada' },
  grifito: { body: 0xf2c94c, accent: 0xffffff, name: 'grifito' },
  zorrito: { body: 0xff8a3d, accent: 0x3a2318, name: 'zorrito de brasa' },
};
/** @param {keyof typeof CREATURES} kind */
export function creatureGeo(kind) {
  const c = CREATURES[kind];
  return merge([
    paint(xf(new THREE.SphereGeometry(0.75, 8, 6), [0, 0.7, 0], [0, 0, 0], [1, 0.85, 1.2]), c.body),
    paint(xf(new THREE.SphereGeometry(0.5, 8, 6), [0, 1.35, -0.75]), c.body),
    paint(xf(new THREE.ConeGeometry(0.16, 0.5, 4), [0.25, 1.85, -0.7], [0.2, 0, -0.3]), c.accent),
    paint(xf(new THREE.ConeGeometry(0.16, 0.5, 4), [-0.25, 1.85, -0.7], [0.2, 0, 0.3]), c.accent),
    paint(xf(new THREE.SphereGeometry(0.09, 5, 3), [0.2, 1.45, -1.18]), 0x111111, 0),
    paint(xf(new THREE.SphereGeometry(0.09, 5, 3), [-0.2, 1.45, -1.18]), 0x111111, 0),
    paint(xf(new THREE.ConeGeometry(0.35, 0.9, 3), [0.7, 0.95, 0.1], [0, 0, -1.2], [1, 1, 0.3]), c.accent),
    paint(xf(new THREE.ConeGeometry(0.35, 0.9, 3), [-0.7, 0.95, 0.1], [0, 0, 1.2], [1, 1, 0.3]), c.accent),
  ]);
}

/* ======================= escenografía ======================= */
export function ringGeo(R) { return new THREE.TorusGeometry(R, Math.max(0.45, R * 0.075), 8, 28); }

export function cloudGeo() {
  const parts = [];
  const blobs = [[0, 0, 0, 5], [4.5, -0.5, 1, 3.8], [-4.2, -0.8, -0.5, 3.6], [1.5, 1.8, -1, 3.4], [-1.5, 1.2, 1.5, 3], [6.5, -1.4, -0.8, 2.4]];
  for (const [x, y, z, r] of blobs) parts.push(xf(new THREE.IcosahedronGeometry(r, 0), [x, y, z], [0, 0, 0], [1, 0.75, 1]));
  const g = merge(parts.map(p => p.index ? p.toNonIndexed() : p));
  g.deleteAttribute('uv');
  return g;
}

/** Peñasco: roca deformada con dos tonos. */
export function rockGeo(c0 = 0x7a7f8a, c1 = 0x9aa2ab, seed = 1) {
  const g = jitterGeo(new THREE.DodecahedronGeometry(1, 1), 0.45, seed);
  return paintGrad(g, c0, c1, -1, 1);
}

/** Isla flotante: cono invertido de roca + tapa de pasto. */
export function islandGeo(top = 0x7cc56b, rock = 0x8a7a6a) {
  const base = paintGrad(jitterGeo(new THREE.ConeGeometry(1, 1.6, 9, 2), 0.18, 3), rock, 0x4a4038, -0.8, 0.8);
  xf(base, [0, -0.8, 0], [Math.PI, 0, 0]);
  const cap = paint(xf(new THREE.CylinderGeometry(1.05, 1, 0.22, 9), [0, 0.05, 0]), top);
  return merge([base, cap]);
}

export function eggGeo(color = 0xffd34d, spots = 0xffffff) {
  const parts = [paint(xf(new THREE.SphereGeometry(1, 10, 8), [0, 1.3, 0], [0, 0, 0], [1, 1.32, 1]), color, 0.05)];
  for (let i = 0; i < 6; i++) {
    const a = i * 1.7, y = 0.7 + (i % 3) * 0.55;
    parts.push(paint(xf(new THREE.SphereGeometry(0.2, 5, 3), [Math.cos(a) * 0.93, y + 0.2, Math.sin(a) * 0.93], [0, 0, 0], [1, 1, 0.4]), spots, 0));
  }
  return merge(parts);
}

export function nestGeo() {
  const parts = [paint(xf(new THREE.TorusGeometry(2.6, 0.9, 6, 14), [0, 0.6, 0], [Math.PI / 2, 0, 0], [1, 1, 0.7]), 0x7a5531, 0.25),
    paint(xf(new THREE.CylinderGeometry(2.4, 1.6, 0.6, 10), [0, 0.2, 0]), 0x5e3f22, 0.2)];
  for (let i = 0; i < 10; i++) {
    const a = i * 0.63;
    parts.push(paint(xf(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 3), [Math.cos(a) * 2.7, 0.9, Math.sin(a) * 2.7], [0.4, a, 1.2]), 0x9a6e3f));
  }
  return merge(parts);
}

/** Baliza de entrenamiento: base de piedra + anillo rúnico. La columna de luz va aparte (material propio). */
export function beaconBaseGeo() {
  return merge([
    paint(xf(new THREE.CylinderGeometry(3.4, 4.2, 2.2, 8), [0, 0, 0]), 0x8f8a80),
    paint(xf(new THREE.CylinderGeometry(2.6, 3.0, 1.0, 8), [0, 1.5, 0]), 0xd9d2bf),
    paint(xf(new THREE.TorusGeometry(3.2, 0.3, 4, 16), [0, 2.2, 0], [Math.PI / 2, 0, 0]), 0xc79a3a),
  ]);
}

/** Posada flotante: isla, casita con techo, farol, bandera y aro de aterrizaje. */
export function innGeo(accent = 0xff9f43) {
  const isl = islandGeo(0x8fcf72, 0x9a8a72); xf(isl, [0, 0, 0], [0, 0, 0], [12, 9, 12]);
  return merge([
    isl,
    paint(xf(new THREE.BoxGeometry(7, 4.5, 6), [0, 2.4, 2]), 0xf1e3c6),
    paint(xf(new THREE.ConeGeometry(5.8, 3.6, 4), [0, 6.4, 2], [0, Math.PI / 4, 0]), 0xb6492f),
    paint(xf(new THREE.BoxGeometry(1.4, 2.4, 0.2), [0, 1.3, -1.05]), 0x6b4423),
    paint(xf(new THREE.BoxGeometry(1.2, 1.1, 0.2), [2.2, 2.8, -1.05]), 0xffe08a, 0),
    paint(xf(new THREE.BoxGeometry(1.2, 1.1, 0.2), [-2.2, 2.8, -1.05]), 0xffe08a, 0),
    paint(xf(new THREE.CylinderGeometry(0.25, 0.3, 9, 5), [-6.5, 4.5, -2]), 0x6b4423),
    paint(xf(new THREE.CylinderGeometry(0.15, 0.15, 4, 4), [7, 2, -4]), 0x3b3b3b),
    paint(xf(new THREE.OctahedronGeometry(0.8, 0), [7, 4.4, -4]), 0xffd36b, 0),
    paint(xf(new THREE.CylinderGeometry(4, 4.4, 0.6, 10), [0, 0.15, -9]), 0xc8b89a),
  ]);
}
export function flagGeo(color) {
  const g = paint(xf(new THREE.PlaneGeometry(3.6, 2.2, 4, 1), [1.8, 0, 0]), color, 0.1);
  return g;
}

/** Academia: torreón central, cuatro torres, muralla circular, puente y ventanas. */
export function academyGeo(accent = 0xff9f43) {
  const stone = 0xd6cdbb, stone2 = 0xb8ad97, roof = 0x3d5a9e, win = 0xffd98a;
  const P = [];
  P.push(paint(xf(new THREE.CylinderGeometry(30, 34, 6, 16), [0, -1, 0]), stone2));
  P.push(paint(xf(new THREE.CylinderGeometry(28, 28, 1, 16), [0, 2.3, 0]), 0x8fb46a));
  // muralla
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    if (i === 4) continue; // portal
    P.push(paint(xf(new THREE.BoxGeometry(11.2, 6, 1.6), [Math.cos(a) * 27, 5, Math.sin(a) * 27], [0, -a + Math.PI / 2, 0]), stone));
    P.push(paint(xf(new THREE.BoxGeometry(2, 1.4, 1.8), [Math.cos(a + 0.1) * 27, 8.6, Math.sin(a + 0.1) * 27], [0, -a + Math.PI / 2, 0]), stone2));
  }
  // torreón
  P.push(paint(xf(new THREE.CylinderGeometry(9, 10, 26, 10), [0, 15, 0]), stone));
  P.push(paint(xf(new THREE.CylinderGeometry(10.5, 10.5, 2, 10), [0, 28.5, 0]), stone2));
  P.push(paint(xf(new THREE.ConeGeometry(11, 16, 10), [0, 37.5, 0]), roof));
  P.push(paint(xf(new THREE.CylinderGeometry(0.3, 0.3, 6, 4), [0, 48, 0]), 0x444444));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    P.push(paint(xf(new THREE.BoxGeometry(1.4, 2.6, 0.4), [Math.cos(a) * 9.4, 19, Math.sin(a) * 9.4], [0, -a + Math.PI / 2, 0]), win, 0));
    P.push(paint(xf(new THREE.BoxGeometry(1.2, 2.2, 0.4), [Math.cos(a + 0.4) * 9.6, 10, Math.sin(a + 0.4) * 9.6], [0, -a - 0.4 + Math.PI / 2, 0]), win, 0));
  }
  // cuatro torres
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 27, z = Math.sin(a) * 27;
    P.push(paint(xf(new THREE.CylinderGeometry(4, 4.6, 20, 8), [x, 12, z]), stone));
    P.push(paint(xf(new THREE.CylinderGeometry(5, 5, 1.6, 8), [x, 22.5, z]), stone2));
    P.push(paint(xf(new THREE.ConeGeometry(5.4, 10, 8), [x, 28, z]), i % 2 ? roof : 0xb6492f));
    P.push(paint(xf(new THREE.BoxGeometry(1, 2, 0.3), [x + Math.cos(a) * 4.3, 15, z + Math.sin(a) * 4.3], [0, -a + Math.PI / 2, 0]), win, 0));
  }
  // nido/plataforma de despegue con el emblema
  P.push(paint(xf(new THREE.CylinderGeometry(7, 7, 0.6, 12), [16, 3.2, -6]), accent, 0));
  return merge(P);
}

/** Arco de piedra (semicírculo) para el lago. Se apoya en Y=0 y se extiende en X. */
export function archGeo(R = 26) {
  const t = new THREE.TorusGeometry(R, 3.2, 6, 16, Math.PI);
  return merge([paintGrad(jitterGeo(t, 0.12, 7), 0x7f8e9a, 0xc9d4dc, 0, R),
    paint(xf(new THREE.CylinderGeometry(4.5, 5.5, 10, 7), [R, -4, 0]), 0x6d7a85),
    paint(xf(new THREE.CylinderGeometry(4.5, 5.5, 10, 7), [-R, -4, 0]), 0x6d7a85)]);
}

/** Pilar de cristal hexagonal. */
export function crystalGeo() {
  return merge([
    paintGrad(xf(new THREE.CylinderGeometry(1, 1, 1, 6), [0, 0.5, 0]), 0x6fa8dc, 0xd7f2ff, 0, 1),
    paint(xf(new THREE.ConeGeometry(1, 0.35, 6), [0, 1.17, 0]), 0xeefaff),
  ]);
}

/** Árbol estilizado (pino) para islas. */
export function pineGeo(c = 0x3f7f4a) {
  return merge([
    paint(xf(new THREE.CylinderGeometry(0.25, 0.35, 1.4, 5), [0, 0.7, 0]), 0x6b4a2f),
    paint(xf(new THREE.ConeGeometry(1.5, 2.4, 7), [0, 2.3, 0]), c),
    paint(xf(new THREE.ConeGeometry(1.1, 2.0, 7), [0, 3.5, 0]), c),
  ]);
}

/** Columna de roca volcánica / pilar. */
export function pillarGeo(c0 = 0x2c2522, c1 = 0x5a4038) {
  return paintGrad(jitterGeo(new THREE.CylinderGeometry(0.75, 1, 1, 7, 3), 0.15, 11), c0, c1, -0.5, 0.5);
}

/** Portal de viaje (anillo grande con runas). */
export function portalGeo() {
  const P = [paint(new THREE.TorusGeometry(16, 1.6, 8, 40), 0xf2d27a)];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    P.push(paint(xf(new THREE.OctahedronGeometry(1.4, 0), [Math.cos(a) * 16, Math.sin(a) * 16, 0]), 0xfff6c8, 0));
  }
  return merge(P);
}

/* ======================= rivales ======================= */
export function batGeo() {
  return merge([
    paint(xf(new THREE.SphereGeometry(0.9, 7, 5), [0, 0, 0], [0, 0, 0], [1, 0.9, 1.3]), 0x2e2440),
    paint(xf(new THREE.SphereGeometry(0.6, 7, 5), [0, 0.35, -1.0]), 0x3a2d52),
    paint(xf(new THREE.ConeGeometry(0.25, 0.8, 4), [0.3, 1.0, -1.0], [0, 0, -0.3]), 0x2e2440),
    paint(xf(new THREE.ConeGeometry(0.25, 0.8, 4), [-0.3, 1.0, -1.0], [0, 0, 0.3]), 0x2e2440),
  ]);
}
export function batEyeGeo() {
  return merge([paint(xf(new THREE.SphereGeometry(0.13, 5, 3), [0.22, 0.45, -1.52]), 0xffffff, 0), paint(xf(new THREE.SphereGeometry(0.13, 5, 3), [-0.22, 0.45, -1.52]), 0xffffff, 0)]);
}
export function batWingGeo() {
  const P = [[0, 0, -0.5], [1.5, 0.4, -0.9], [3.2, 0.2, -0.3], [2.6, 0, 0.6], [1.8, 0, 0.3], [1.2, 0, 0.9], [0, 0, 0.7]];
  const idx = [0, 1, 4, 1, 2, 3, 1, 3, 4, 0, 4, 5, 0, 5, 6];
  const pos = new Float32Array(idx.length * 3);
  idx.forEach((k, i) => { pos[i * 3] = P[k][0]; pos[i * 3 + 1] = P[k][1]; pos[i * 3 + 2] = P[k][2]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
  return paint(g, 0x4a3468, 0.15);
}

export function harpyGeo() {
  return merge([
    paint(xf(new THREE.CylinderGeometry(0.7, 0.45, 2.4, 7), [0, 0, 0], [0.5, 0, 0]), 0x6e4c8e),
    paint(xf(new THREE.SphereGeometry(0.55, 8, 6), [0, 1.35, -0.75]), 0xe8c4a0),
    paint(xf(new THREE.ConeGeometry(0.5, 1.5, 5), [0, 1.9, -0.2], [-1.2, 0, 0]), 0xc23b6a),
    paint(xf(new THREE.ConeGeometry(0.18, 0.5, 4), [0, 1.25, -1.35], [-Math.PI / 2, 0, 0]), 0xf2b134),
    paint(xf(new THREE.SphereGeometry(0.1, 5, 3), [0.22, 1.45, -1.22]), 0xfff36b, 0),
    paint(xf(new THREE.SphereGeometry(0.1, 5, 3), [-0.22, 1.45, -1.22]), 0xfff36b, 0),
    paint(xf(new THREE.CylinderGeometry(0.12, 0.08, 1.4, 4), [0.3, -1.5, 0.3], [0.3, 0, 0]), 0xf2b134),
    paint(xf(new THREE.CylinderGeometry(0.12, 0.08, 1.4, 4), [-0.3, -1.5, 0.3], [0.3, 0, 0]), 0xf2b134),
    paint(xf(new THREE.ConeGeometry(0.6, 1.8, 4), [0, -0.6, 1.4], [Math.PI / 2 + 0.4, 0, 0], [1, 1, 0.3]), 0x4b2f6b),
  ]);
}
export function harpyWingGeo() {
  const P = [[0, 0, -0.7], [2, 0.5, -1.0], [4.6, 0.3, -0.4], [4.3, 0, 0.5], [3.4, 0, 1.1], [2.2, 0, 1.5], [0, 0, 0.9]];
  const idx = [0, 1, 6, 1, 2, 3, 1, 3, 4, 1, 4, 5, 1, 5, 6];
  const pos = new Float32Array(idx.length * 3);
  idx.forEach((k, i) => { pos[i * 3] = P[k][0]; pos[i * 3 + 1] = P[k][1]; pos[i * 3 + 2] = P[k][2]; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
  return paint(g, 0x8a5fb0, 0.2);
}
export function featherGeo() { return paint(xf(new THREE.ConeGeometry(0.25, 1.6, 4), [0, 0, 0], [-Math.PI / 2, 0, 0], [1, 1, 0.4]), 0xff6fa8, 0); }

export function autoGeo() {
  return merge([
    paint(xf(new THREE.OctahedronGeometry(1.8, 0), [0, 0, 0], [0, 0, 0], [1, 1.1, 1]), 0xb8862f),
    paint(xf(new THREE.BoxGeometry(2.4, 0.5, 2.4), [0, 0, 0], [0, Math.PI / 4, 0]), 0x6f5222),
    paint(xf(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 4), [0, 1.9, 0]), 0x444444),
    paint(xf(new THREE.ConeGeometry(0.9, 1.4, 4), [1.9, 0, 0.6], [0, 0, -Math.PI / 2], [1, 1, 0.25]), 0x8a6a2a),
    paint(xf(new THREE.ConeGeometry(0.9, 1.4, 4), [-1.9, 0, 0.6], [0, 0, Math.PI / 2], [1, 1, 0.25]), 0x8a6a2a),
  ]);
}
export function autoRingGeo() { return paint(new THREE.TorusGeometry(2.8, 0.22, 4, 18), 0xd9b25a); }
export function autoEyeGeo() { return paint(xf(new THREE.SphereGeometry(0.55, 8, 6), [0, 0, -1.55]), 0xffffff, 0); }

/* ======================= Serpiente de Tormenta ======================= */
export function serpentHeadGeo() {
  return merge([
    paint(xf(new THREE.BoxGeometry(5, 3.6, 7), [0, 0, 0], [0.05, 0, 0]), 0x2c3e66),
    paint(xf(new THREE.BoxGeometry(4, 2.2, 5), [0, -0.6, -5.2], [0.1, 0, 0]), 0x2c3e66),
    paint(xf(new THREE.BoxGeometry(3.8, 1, 4.8), [0, -2.2, -4.2], [0.3, 0, 0]), 0x9fb6d8),
    paint(xf(new THREE.ConeGeometry(0.6, 5, 5), [1.8, 2.8, 1.5], [1.1, 0, -0.35]), 0xe6eefc),
    paint(xf(new THREE.ConeGeometry(0.6, 5, 5), [-1.8, 2.8, 1.5], [1.1, 0, 0.35]), 0xe6eefc),
    paint(xf(new THREE.ConeGeometry(0.4, 3, 4), [2.6, 0.2, -6.5], [1.5, 0, -0.8]), 0xc8d8f0),
    paint(xf(new THREE.ConeGeometry(0.4, 3, 4), [-2.6, 0.2, -6.5], [1.5, 0, 0.8]), 0xc8d8f0),
    paint(xf(new THREE.ConeGeometry(1.2, 3.2, 4), [0, 2.4, 3], [-0.4, 0, 0], [0.3, 1, 1]), 0x5d7fc2),
  ]);
}
export function serpentEyesGeo() {
  return merge([paint(xf(new THREE.SphereGeometry(0.6, 6, 4), [1.9, 0.8, -2.8]), 0xffffff, 0), paint(xf(new THREE.SphereGeometry(0.6, 6, 4), [-1.9, 0.8, -2.8]), 0xffffff, 0)]);
}
export function serpentSegGeo() {
  return merge([
    paint(xf(new THREE.IcosahedronGeometry(1, 1), [0, 0, 0], [0, 0, 0], [3.1, 2.9, 3.6]), 0x3d5a96),
    paint(xf(new THREE.ConeGeometry(0.8, 2.8, 4), [0, 3.4, 0.4], [-0.35, 0, 0], [0.3, 1, 1.3]), 0x9fc0ff),
    paint(xf(new THREE.SphereGeometry(1, 8, 4), [0, -1.9, 0], [0, 0, 0], [2.2, 1.1, 3.0]), 0xc4d4ee),
  ]);
}
export function scaleGeo() { return paint(xf(new THREE.OctahedronGeometry(1.6, 0), [0, 0, 0], [0, 0, 0], [1, 1.4, 1]), 0xffffff, 0); }
