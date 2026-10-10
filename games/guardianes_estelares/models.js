// @ts-check
/* Modelos low-poly procedurales (geometrías fusionadas con colores por vértice).
   Convención: la nariz de cada nave apunta a +Z (Object3D.lookAt orienta +Z hacia el objetivo).
   Cada constructor devuelve { body, glow } — body se dibuja con material estándar (luces),
   glow con material básico aditivo (motores, ventanas, puntos débiles). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Pieza: geometría transformada, sin índice, con color por vértice (con leve variación por cara).
 * @param {THREE.BufferGeometry} geo @param {number} color
 * @param {{p?:number[], r?:number[], s?:number[]|number, shade?:number}} [o]
 */
export function P(geo, color, o = {}) {
  const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0], s = o.s === undefined ? [1, 1, 1] : typeof o.s === 'number' ? [o.s, o.s, o.s] : o.s;
  _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _s.set(s[0], s[1], s[2]); _p.set(p[0], p[1], p[2]);
  _m.compose(_p, _q, _s);
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  g.applyMatrix4(_m);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const n = g.getAttribute('position').count, col = new Float32Array(n * 3);
  const shade = o.shade ?? 0.06;
  _c.setHex(color).convertSRGBToLinear();
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (Math.sin(i * 12.9898 + color) * 43758.5453 % 1) * shade;
    for (let j = 0; j < 3 && i + j < n; j++) { col[(i + j) * 3] = _c.r * k; col[(i + j) * 3 + 1] = _c.g * k; col[(i + j) * 3 + 2] = _c.b * k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** @param {THREE.BufferGeometry[]} list */
export function merge(list) {
  const g = mergeGeometries(list, false);
  list.forEach(x => x.dispose());
  g.computeBoundingSphere();
  return /** @type {THREE.BufferGeometry} */ (g);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const tor = (r, t, rs = 6, ts = 24) => new THREE.TorusGeometry(r, t, rs, ts);
const H = Math.PI / 2;

/* ---------------- jugador ---------------- */
export function buildPlayerShip() {
  const W = 0xe9eef2, G = 0x5d6b78, D = 0x2a323c, A = 0xffa52e, GL = 0x2a6fb0;
  const body = merge([
    P(cyl(0.55, 0.95, 5.2, 8), W, { r: [H, 0, 0] }),
    P(cone(0.55, 2.2, 8), W, { p: [0, 0, 3.7], r: [H, 0, 0] }),
    P(sph(0.62, 8, 6), GL, { p: [0, 0.45, 1.2], s: [1, 0.7, 1.9], shade: 0.2 }),
    P(box(6.4, 0.16, 1.6), W, { p: [0, -0.1, -0.6], r: [0, 0, 0] }),
    P(box(2.2, 0.18, 1.1), A, { p: [2.6, -0.08, -0.2], r: [0, -0.35, 0] }),
    P(box(2.2, 0.18, 1.1), A, { p: [-2.6, -0.08, -0.2], r: [0, 0.35, 0] }),
    P(box(0.25, 1.2, 0.9), G, { p: [3.25, 0.35, -0.9] }),
    P(box(0.25, 1.2, 0.9), G, { p: [-3.25, 0.35, -0.9] }),
    P(cyl(0.42, 0.5, 2.0, 8), D, { p: [1.0, -0.05, -2.3], r: [H, 0, 0] }),
    P(cyl(0.42, 0.5, 2.0, 8), D, { p: [-1.0, -0.05, -2.3], r: [H, 0, 0] }),
    P(box(0.12, 1.1, 1.4), A, { p: [0, 0.75, -1.9], r: [0.4, 0, 0] }),
    P(box(0.9, 0.08, 2.4), A, { p: [0, 0.56, 0.2] }),
  ]);
  const glow = merge([
    P(cyl(0.34, 0.34, 0.12, 8), 0xffd27a, { p: [1.0, -0.05, -3.32], r: [H, 0, 0] }),
    P(cyl(0.34, 0.34, 0.12, 8), 0xffd27a, { p: [-1.0, -0.05, -3.32], r: [H, 0, 0] }),
    P(box(0.2, 0.2, 0.2), 0x7cf7ff, { p: [3.25, 0.98, -0.9] }),
    P(box(0.2, 0.2, 0.2), 0xff5a5a, { p: [-3.25, 0.98, -0.9] }),
  ]);
  return { body, glow };
}

/* ---------------- enemigos ---------------- */
export function buildInterceptor() {
  const R = 0xb8222e, K = 0x1c1f26, S = 0x8a95a3;
  const body = merge([
    P(cone(0.75, 5.5, 6), K, { p: [0, 0, 0.8], r: [H, 0, 0] }),
    P(box(0.9, 0.5, 2.6), R, { p: [0, 0.15, -1.2] }),
    P(box(4.8, 0.12, 1.0), R, { p: [0, 0, -1.6], r: [0, 0, 0] }),
    P(box(0.12, 1.6, 1.4), K, { p: [2.4, 0, -1.7] }),
    P(box(0.12, 1.6, 1.4), K, { p: [-2.4, 0, -1.7] }),
    P(box(0.5, 0.3, 1.8), S, { p: [0, 0.45, 0.3] }),
  ]);
  const glow = merge([
    P(box(0.5, 0.35, 0.1), 0xff4040, { p: [0, 0.2, -2.55] }),
    P(sph(0.22, 6, 4), 0xff2a2a, { p: [0, 0.5, 1.1] }),
  ]);
  return { body, glow };
}
export function buildDrone() {
  const Y = 0xe8c23a, K = 0x24262c, G = 0x6b7280;
  const spikes = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    spikes.push(P(cone(0.35, 1.4, 5), K, { p: [Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3], r: [0, -a, -H] }));
  }
  const body = merge([
    P(ico(1.4, 0), G),
    P(tor(2.1, 0.32, 5, 12), Y, { r: [H, 0, 0] }),
    P(cyl(0.3, 0.3, 4.6, 6), K, { r: [0, 0, H] }),
    P(cyl(0.3, 0.3, 4.6, 6), K, { r: [H, 0, 0] }),
    ...spikes,
  ]);
  const glow = merge([P(sph(0.6, 8, 6), 0x7dff5a, { p: [0, 0, 1.1] })]);
  return { body, glow };
}
export function buildBomber() {
  const O = 0x4d5a3a, K = 0x22262a, A = 0xd8792a, S = 0x8b8f80;
  const body = merge([
    P(box(4.2, 2.2, 9), O, { p: [0, 0, 0] }),
    P(box(2.6, 1.4, 3), S, { p: [0, 0.9, 3.4], r: [-0.25, 0, 0] }),
    P(cyl(1.0, 1.2, 8, 8), K, { p: [3.4, -0.3, -0.6], r: [H, 0, 0] }),
    P(cyl(1.0, 1.2, 8, 8), K, { p: [-3.4, -0.3, -0.6], r: [H, 0, 0] }),
    P(box(11, 0.3, 2.6), O, { p: [0, 0.2, -1.4] }),
    P(box(1.6, 0.25, 4.5), A, { p: [0, 1.15, -0.8] }),
    P(box(0.25, 2.6, 2.2), A, { p: [0, 1.8, -3.8] }),
    P(box(2.4, 0.6, 3.2), K, { p: [0, -1.25, 0.6] }),
  ]);
  const glow = merge([
    P(cyl(0.8, 0.8, 0.2, 8), 0xff8a2a, { p: [3.4, -0.3, -4.65], r: [H, 0, 0] }),
    P(cyl(0.8, 0.8, 0.2, 8), 0xff8a2a, { p: [-3.4, -0.3, -4.65], r: [H, 0, 0] }),
    P(box(1.8, 0.5, 0.2), 0xffd36b, { p: [0, 0.95, 4.95] }),
  ]);
  return { body, glow };
}
export function buildFrigate() {
  const B = 0x3c4656, K = 0x1b2029, P2 = 0x7d8796, R = 0x9c2d38;
  const body = merge([
    P(box(6, 4, 22), B),
    P(cone(4.4, 8, 4), B, { p: [0, 0, 15], r: [H, H / 2, 0], s: [1.2, 1, 0.7] }),
    P(box(12, 9, 1.2), P2, { p: [0, 0, 11.5], shade: 0.12 }), // escudo frontal
    P(box(10, 1, 1.4), R, { p: [0, 4.2, 11.4] }),
    P(box(3, 4, 6), K, { p: [0, 3.6, -2] }),
    P(box(1.2, 3, 1.2), P2, { p: [0, 6.6, -2.5] }),
    P(cyl(1.3, 1.3, 6, 8), K, { p: [4, 0, -6], r: [H, 0, 0] }),
    P(cyl(1.3, 1.3, 6, 8), K, { p: [-4, 0, -6], r: [H, 0, 0] }),
    P(box(14, 0.4, 3), B, { p: [0, -1, -4] }),
  ]);
  const glow = merge([
    P(sph(1.9, 10, 8), 0x55e6ff, { p: [0, 0.5, -11.8] }), // generador trasero (punto débil)
    P(cyl(1.0, 1.0, 0.3, 8), 0x8ad8ff, { p: [4, 0, -9.1], r: [H, 0, 0] }),
    P(cyl(1.0, 1.0, 0.3, 8), 0x8ad8ff, { p: [-4, 0, -9.1], r: [H, 0, 0] }),
    P(box(2.6, 0.6, 0.2), 0x9ff7ff, { p: [0, 4.6, 1.05] }),
  ]);
  return { body, glow };
}

/* ---------------- aliados y estructuras ---------------- */
export function buildFreighter(tint = 0x2f7fc1) {
  const W = 0xc9ced4, K = 0x30363e;
  const cont = [0xd9822b, tint, 0x3aa36b, 0xc8c2b0, 0xb94a48, tint];
  const parts = [
    P(box(1.6, 1.6, 22), K),
    P(box(4.2, 3.2, 4.2), W, { p: [0, 0.4, 11.5] }),
    P(box(3.4, 1.2, 1.6), 0x2a5a86, { p: [0, 1.4, 13.4], shade: 0.15 }),
    P(cyl(1.4, 1.7, 3.4, 8), K, { p: [1.8, 0, -11.4], r: [H, 0, 0] }),
    P(cyl(1.4, 1.7, 3.4, 8), K, { p: [-1.8, 0, -11.4], r: [H, 0, 0] }),
  ];
  for (let i = 0; i < 6; i++) {
    const z = 7 - i * 3.3, side = i % 2 ? 1 : -1;
    parts.push(P(box(2.6, 2.6, 3), cont[i], { p: [side * 1.5, 1.2, z], shade: 0.1 }));
    parts.push(P(box(2.6, 2.6, 3), cont[(i + 2) % 6], { p: [-side * 1.5, -1.3, z], shade: 0.1 }));
  }
  const body = merge(parts);
  const glow = merge([
    P(cyl(1.1, 1.1, 0.2, 8), 0x8fd3ff, { p: [1.8, 0, -13.2], r: [H, 0, 0] }),
    P(cyl(1.1, 1.1, 0.2, 8), 0x8fd3ff, { p: [-1.8, 0, -13.2], r: [H, 0, 0] }),
    P(box(0.3, 0.3, 0.3), 0x6bff8f, { p: [2.2, 2.2, 11.5] }),
    P(box(0.3, 0.3, 0.3), 0xff5050, { p: [-2.2, 2.2, 11.5] }),
  ]);
  return { body, glow };
}

export function buildStation() {
  const W = 0xc4cad1, K = 0x343b45, B = 0x23436b, A = 0xe0a240;
  const parts = [
    P(tor(62, 4.2, 8, 40), W, { r: [H, 0, 0] }),
    P(cyl(7, 7, 70, 12), K),
    P(cyl(11, 11, 14, 12), W, { p: [0, 0, 0] }),
    P(cone(9, 14, 12), W, { p: [0, 42, 0] }),
    P(cone(9, 14, 12), W, { p: [0, -42, 0], r: [Math.PI, 0, 0] }),
    P(tor(14, 1.2, 6, 20), A, { p: [0, 22, 0], r: [H, 0, 0] }),
    P(tor(14, 1.2, 6, 20), A, { p: [0, -22, 0], r: [H, 0, 0] }),
  ];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    parts.push(P(box(2.4, 2.4, 52), K, { p: [Math.cos(a) * 33, 0, Math.sin(a) * 33], r: [0, -a + H, 0] }));
    parts.push(P(box(9, 6, 12), W, { p: [Math.cos(a) * 62, 0, Math.sin(a) * 62], r: [0, -a, 0] }));
  }
  for (const s of [1, -1]) {
    for (let j = 0; j < 3; j++) {
      parts.push(P(box(26, 0.5, 9), B, { p: [s * (22 + j * 0) , 32 * s, (j - 1) * 11], r: [0, 0, 0], shade: 0.25 }));
    }
    parts.push(P(box(30, 0.8, 0.8), K, { p: [s * 20, 32 * s, 0] }));
  }
  const body = merge(parts);
  const gl = [];
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2;
    gl.push(P(box(1.4, 1.4, 1.4), i % 2 ? 0xffe9a8 : 0x8fe8ff, { p: [Math.cos(a) * 62, 4.8, Math.sin(a) * 62] }));
  }
  gl.push(P(cyl(11.2, 11.2, 2.4, 12), 0x8fe8ff, { p: [0, 0, 0] }));
  return { body, glow: merge(gl) };
}

export function buildTurretBase() {
  return merge([
    P(cyl(3.2, 4.2, 2.4, 8), 0x55606e),
    P(box(9, 0.8, 9), 0x3a424d, { p: [0, -1.5, 0] }),
    P(cyl(4.4, 4.4, 0.4, 8), 0x3fbf6f, { p: [0, 1.25, 0] }),
  ]);
}
export function buildTurretHead() {
  return merge([
    P(box(3.4, 2.2, 3.6), 0x8d98a6),
    P(cyl(0.38, 0.38, 5, 6), 0x2a2f36, { p: [0.8, 0.2, 2.6], r: [H, 0, 0] }),
    P(cyl(0.38, 0.38, 5, 6), 0x2a2f36, { p: [-0.8, 0.2, 2.6], r: [H, 0, 0] }),
    P(box(3.6, 0.4, 1), 0x3fbf6f, { p: [0, 1.2, 0.6] }),
  ]);
}
export function buildDockFrame() {
  const W = 0xb8c0ca, K = 0x2e353f, A = 0xffb13b;
  const parts = [P(tor(11, 1.4, 6, 28), W), P(tor(11, 0.5, 4, 28), A, { p: [0, 0, 1.6] })];
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + Math.PI / 4;
    parts.push(P(box(3, 3, 7), K, { p: [Math.cos(a) * 13.5, Math.sin(a) * 13.5, -2] }));
  }
  parts.push(P(box(4, 22, 4), K, { p: [0, -22, -2] }));
  parts.push(P(box(16, 2, 10), W, { p: [0, -33, -2] }));
  return merge(parts);
}
export function buildDockArm() {
  return merge([P(box(1.2, 6, 1.2), 0x88919c, { p: [0, 3, 0] }), P(box(2.4, 1, 2.4), 0xffb13b, { p: [0, 6.2, 0] })]);
}
export function buildBeacon() {
  return merge([
    P(cyl(0.5, 0.9, 12, 6), 0x9aa4b0),
    P(box(5, 0.6, 5), 0x3a424d, { p: [0, -6, 0] }),
    P(cone(1.6, 2, 6), 0x55606e, { p: [0, -4.8, 0] }),
  ]);
}
export function buildBeaconDish() {
  return merge([
    P(new THREE.SphereGeometry(3, 10, 6, 0, Math.PI * 2, 0, 1.0), 0xdfe5ea, { r: [-H, 0, 0] }),
    P(cyl(0.2, 0.2, 2.6, 5), 0x55606e, { p: [0, 0, 1.6], r: [H, 0, 0] }),
  ]);
}
export function buildCapsule() {
  return merge([
    P(new THREE.CapsuleGeometry(0.9, 1.6, 4, 8), 0xf3f0e6),
    P(cyl(0.95, 0.95, 0.5, 8), 0xff7a2e, { p: [0, 0.2, 0] }),
  ]);
}
export function buildTransmitter() {
  return merge([
    P(cyl(1.4, 2.4, 22, 8), 0x5b2433),
    P(box(8, 1, 8), 0x2b2f36, { p: [0, -11, 0] }),
    P(new THREE.SphereGeometry(4, 10, 6, 0, Math.PI * 2, 0, 1.1), 0xb83a4b, { p: [0, 9, 0], r: [-0.5, 0, 0] }),
    P(new THREE.SphereGeometry(3, 10, 6, 0, Math.PI * 2, 0, 1.1), 0xb83a4b, { p: [0, 2, 0], r: [-0.5, Math.PI, 0] }),
    P(box(0.4, 7, 0.4), 0x2b2f36, { p: [0, 14, 0] }),
  ]);
}
export function buildGate() {
  const parts = [P(tor(30, 2.6, 8, 40), 0x9aa6b4)];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    parts.push(P(box(6, 6, 7), i % 2 ? 0xffb13b : 0x46505c, { p: [Math.cos(a) * 30, Math.sin(a) * 30, 0], r: [0, 0, a] }));
  }
  return merge(parts);
}

/* ---------------- entorno ---------------- */
/** Asteroide facetado (la semilla cambia la forma). @param {number} seed */
export function buildAsteroid(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  const v = new THREE.Vector3();
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = map.get(key);
    if (k === undefined) { k = 0.72 + 0.4 * Math.abs(Math.sin(v.x * 3.1 * seed + v.y * 5.7 + v.z * 2.3 * seed)); map.set(key, k); }
    v.multiplyScalar(k); v.y *= 0.82;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const out = P(g, 0xa49482, { shade: 0.28 });
  // vetas más oscuras
  const col = out.getAttribute('color');
  for (let i = 0; i < col.count; i += 3) {
    if (Math.sin(i * 0.77 + seed) > 0.55) for (let j = 0; j < 3; j++) { col.setXYZ(i + j, col.getX(i + j) * 0.6, col.getY(i + j) * 0.58, col.getZ(i + j) * 0.55); }
  }
  out.computeBoundingSphere();
  return out;
}
export function buildCrystal() {
  return merge([
    P(new THREE.OctahedronGeometry(1, 0), 0xc77dff, { s: [0.7, 3, 0.7], shade: 0.35 }),
    P(new THREE.OctahedronGeometry(1, 0), 0x7ae0ff, { p: [0.9, -0.8, 0.3], r: [0, 0, -0.5], s: [0.45, 1.8, 0.45], shade: 0.35 }),
    P(new THREE.OctahedronGeometry(1, 0), 0xff7ad9, { p: [-0.8, -1, -0.2], r: [0.3, 0, 0.6], s: [0.4, 1.6, 0.4], shade: 0.35 }),
  ]);
}
export function buildMine() {
  return merge([P(ico(1, 0), 0x3a3d44), P(cyl(0.18, 0.18, 3, 4), 0x3a3d44, { r: [0, 0, H] }), P(cyl(0.18, 0.18, 3, 4), 0x3a3d44, { r: [H, 0, 0] }), P(cyl(0.18, 0.18, 3, 4), 0x3a3d44)]);
}
export function buildTorpedo() {
  return merge([P(cyl(0.45, 0.45, 2.6, 6), 0x6b6f78, { r: [H, 0, 0] }), P(cone(0.45, 1, 6), 0xd8792a, { p: [0, 0, 1.8], r: [H, 0, 0] })]);
}

/* ---------------- jefe: Destructor Némesis ---------------- */
export function buildNemesisHull() {
  const D = 0x6a5560, K = 0x3a2c34, R = 0xb02a3a, G = 0x8d8890;
  const parts = [
    P(box(26, 10, 110), D),
    P(cone(13, 40, 4), D, { p: [0, 0, 74], r: [H, H / 2, 0], s: [1.4, 1, 0.55] }),
    P(box(16, 8, 50), G, { p: [0, 8, -10] }),
    P(box(10, 12, 18), K, { p: [0, 18, -24] }),
    P(box(14, 2, 4), R, { p: [0, 24.5, -24] }),
    P(box(44, 4, 26), D, { p: [0, -2, -30] }),
    P(box(6, 14, 30), K, { p: [22, 0, -40] }),
    P(box(6, 14, 30), K, { p: [-22, 0, -40] }),
    P(box(2, 2, 100), R, { p: [13.2, 2, 4] }),
    P(box(2, 2, 100), R, { p: [-13.2, 2, 4] }),
    P(box(30, 3, 14), K, { p: [0, -6.5, 20] }),
    P(cyl(5, 6.5, 14, 8), K, { p: [12, 0, -60], r: [H, 0, 0] }),
    P(cyl(5, 6.5, 14, 8), K, { p: [-12, 0, -60], r: [H, 0, 0] }),
  ];
  const body = merge(parts);
  const glow = merge([
    P(cyl(4.2, 4.2, 0.4, 8), 0xff6a3a, { p: [12, 0, -67.2], r: [H, 0, 0] }),
    P(cyl(4.2, 4.2, 0.4, 8), 0xff6a3a, { p: [-12, 0, -67.2], r: [H, 0, 0] }),
    P(box(9, 1.2, 0.4), 0xff3a4a, { p: [0, 20, -14.8] }),
    ...Array.from({ length: 10 }, (_, i) => P(box(0.6, 0.6, 3), 0xffd0a0, { p: [13.4, -2, 40 - i * 9] })),
    ...Array.from({ length: 10 }, (_, i) => P(box(0.6, 0.6, 3), 0xffd0a0, { p: [-13.4, -2, 40 - i * 9] })),
  ]);
  return { body, glow };
}
export function buildBossTurret() {
  return merge([
    P(cyl(3, 3.6, 2, 8), 0x4a3a42),
    P(box(4.6, 2.6, 5), 0xc0404c, { p: [0, 2, 0] }),
    P(cyl(0.5, 0.5, 6, 6), 0x1b1418, { p: [1, 2.3, 4], r: [H, 0, 0] }),
    P(cyl(0.5, 0.5, 6, 6), 0x1b1418, { p: [-1, 2.3, 4], r: [H, 0, 0] }),
  ]);
}
export function buildEmitter() {
  return merge([
    P(cyl(1.2, 2.4, 10, 6), 0x2a2025),
    P(new THREE.OctahedronGeometry(2.6, 0), 0x47d9ff, { p: [0, 7, 0], shade: 0.3 }),
  ]);
}
export function buildVent() {
  return merge([P(box(9, 1.2, 12), 0x55474e), P(box(7, 0.4, 10), 0x8e1f2c, { p: [0, 0.7, 0] })]);
}
