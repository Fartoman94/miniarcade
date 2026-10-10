// @ts-check
/* Corsarios del Abismo — modelos low-poly procedurales (geometrías fusionadas con color por vértice).
   Frente de los barcos = +Z. Nada se carga de afuera: barcos, galeón, tiburón, islas, muelle, faro, cañones,
   cofres, náufragos, fuerte y capitán se arman acá con primitivas deformadas. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Fija color por vértice (uno solo, o función de posición y normal). */
function paint(g, color) {
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const hex = typeof color === 'function' ? color(pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getY(i) : 0, i) : color;
    _c.setHex(hex);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Acumula piezas con color y las fusiona en una geometría no indexada (posición, normal, color). */
export class Builder {
  constructor() { /** @type {THREE.BufferGeometry[]} */ this.parts = []; }
  /** @param {THREE.BufferGeometry} geo @param {number|Function} color @param {any[]} [t] [x,y,z, rx,ry,rz, sx,sy,sz] */
  add(geo, color, t = []) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1] = t;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!(typeof color === 'number' && color < 0)) paint(g, color);
    this.parts.push(g);
    return this;
  }
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, [x, y, z, rx, ry, rz]); }
  cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, [x, y, z, rx, ry, rz]); }
  sphere(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, d = 0) { return this.add(new THREE.IcosahedronGeometry(r, d), color, [x, y, z, 0, 0, 0, sx, sy, sz]); }
  cone(r, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), color, [x, y, z, rx, ry, rz]); }
  get empty() { return this.parts.length === 0; }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    this.parts.forEach(p => p.dispose()); this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Material de vértices plano. */
export const vmat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.05, ...o });
export const glowMat = (color, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false, ...o });

/* ======================= cascos ======================= */
/**
 * Casco deformado a partir de una caja: proa en punta, popa ancha, quilla angosta y arrufo (proa y popa altas).
 * @param {number} len @param {number} wid @param {number} h @param {{wood:number, stripe:number, bottom:number, deck:number}} c
 */
function hullGeo(len, wid, h, c) {
  const g = new THREE.BoxGeometry(wid, h, len, 3, 3, 12).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
    const t = z / (len / 2), yy = Math.max(0, Math.min(1, (y + h / 2) / h));
    let wf = t > 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.4))) : 1 - 0.22 * Math.pow(-t, 3);
    wf *= 0.32 + 0.68 * Math.pow(yy, 0.55);
    x *= wf;
    if (yy > 0.5) y += Math.pow(Math.max(0, t), 2) * h * 0.35 + Math.pow(Math.max(0, -t), 2) * h * 0.25;
    else if (t > 0.7) y += (t - 0.7) * h * 0.5;
    p.setX(i, x); p.setY(i, y);
  }
  g.computeVertexNormals();
  const top = h / 2;
  paint(g, (x, y, z, ny) => ny > 0.8 && y > top - 0.3 ? c.deck : y < -h * 0.12 ? c.bottom : y > top - 0.42 ? c.stripe : c.wood);
  return g;
}

/** Vela curva (inflada) con origen en la verga (borde superior en y=0, cuelga hacia -y). */
function sailGeo(w, h, billow, color, jagged = 0, tri = false, rand = Math.random) {
  const g = new THREE.PlaneGeometry(w, h, 4, 4).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i) - h / 2;
    const u = x / (w / 2), v = -y / h;
    if (tri) x *= 1 - v * 0.95;
    let z = billow * (1 - u * u) * Math.sin(Math.min(1, v) * Math.PI * 0.9 + 0.2);
    if (jagged && v > 0.9) y += rand() * jagged;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return paint(g, typeof color === 'function' ? color : color);
}

const SHIP_STYLE = {
  player: { wood: 0x8a5a32, stripe: 0xffbe3d, bottom: 0x5c2a1c, deck: 0xc9a06a, sail: 0xf4ead2, sailBand: 0xc0392b, flag: 0xffbe3d, port: 0xff9a3a },
  goleta: { wood: 0x2c2624, stripe: 0xb03a2e, bottom: 0x1a1414, deck: 0x7a5a3a, sail: 0x8a2a24, sailBand: 0x1c1414, flag: 0x111111, port: 0xff7a2a },
  lancha: { wood: 0x5a4030, stripe: 0x1e1e1e, bottom: 0x2a1a12, deck: 0x9a7a52, sail: 0xd8c8a0, sailBand: 0xa02a20, flag: 0x111111, port: 0xff7a2a },
  galeon: { wood: 0x24312d, stripe: 0x3fdc9c, bottom: 0x10201a, deck: 0x3a3a30, sail: 0x7affc8, sailBand: 0x2a8a66, flag: 0x0e1a16, port: 0x5cffb0 },
};

/**
 * Barco completo. Devuelve el grupo y las piezas animables.
 * @param {'player'|'goleta'|'lancha'|'galeon'} kind
 */
export function shipModel(kind, rand = Math.random) {
  const st = SHIP_STYLE[kind];
  const cfg = {
    player: { len: 11, wid: 3.8, h: 2.2, masts: [[2.4, 8.5, 4.4, 3.6], [-1.4, 10.5, 5.6, 4.6]], ports: [-2.6, -0.6, 1.4], castle: 1 },
    goleta: { len: 12, wid: 3.6, h: 2.0, masts: [[2.6, 9, 4, 3.8], [-1.8, 10, 4.6, 4.4]], ports: [-2.8, -0.8, 1.2], castle: 0.6 },
    lancha: { len: 6.5, wid: 2.4, h: 1.2, masts: [[0.6, 5.2, 3.4, 4.2]], ports: [], castle: 0 },
    galeon: { len: 24, wid: 7, h: 3.6, masts: [[6.5, 15, 8, 6], [0.5, 18, 9.5, 7.5], [-6, 14, 7, 5.5]], ports: [-7.5, -5, -2.5, 0, 2.5, 5, 7.5], castle: 2.4 },
  }[kind];
  const { len, wid, h } = cfg;
  const group = new THREE.Group();
  const b = new Builder();
  b.add(hullGeo(len, wid, h, st), -1, [0, h / 2 - h * 0.35, 0]);
  const deckY = h - h * 0.35;
  if (cfg.castle) {
    const cw = wid * 0.86, cl = len * 0.24, ch = cfg.castle;
    b.add(hullGeo(cl * 2.2, cw, ch, { ...st, bottom: st.wood }), -1, [0, deckY + ch / 2 - 0.1, -len * 0.38]);
    // ventanas de popa
    for (let i = -1; i <= 1; i++) b.box(cw * 0.16, ch * 0.3, 0.1, kind === 'galeon' ? 0x5cffb0 : 0xffd27a, i * cw * 0.25, deckY + ch * 0.45, -len * 0.5 + 0.05);
    if (kind === 'galeon') { b.box(cw * 1.02, 0.25, cl * 1.4, st.stripe, 0, deckY + ch + 0.05, -len * 0.38); b.box(wid * 0.7, 1.2, len * 0.14, st.wood, 0, deckY + 0.6, len * 0.36); }
  }
  // bauprés
  b.cyl(0.08, 0.14, len * 0.32, 5, st.wood, 0, deckY + h * 0.35, len / 2 + len * 0.08, Math.PI / 2 - 0.35);
  // cañones laterales
  const portY = deckY - 0.35 * (kind === 'galeon' ? 2 : 1);
  for (const z of cfg.ports) for (const sd of [-1, 1]) b.cyl(0.13 * (kind === 'galeon' ? 1.6 : 1), 0.17 * (kind === 'galeon' ? 1.6 : 1), 0.9, 6, 0x1c1c1e, sd * (wid / 2 + 0.05), portY, z, 0, 0, Math.PI / 2);
  if (kind === 'lancha') { b.cyl(0.07, 0.09, 1.1, 5, 0x1c1c1e, 0, deckY + 0.5, len * 0.3, Math.PI / 2); b.box(0.9, 0.5, 0.9, 0x6a4a2a, 0, deckY + 0.2, -1.5); b.cyl(0.35, 0.35, 0.7, 7, 0x7a3a1a, 0.5, deckY + 0.35, -0.3); }
  if (kind === 'galeon') {
    // placas de hierro (casco acorazado) y mascarón de calavera
    for (const sd of [-1, 1]) for (let i = -4; i <= 4; i++) b.box(0.25, h * 0.55, 2.2, i % 2 ? 0x5d6a66 : 0x4a5552, sd * (wid / 2 * (1 - Math.pow(Math.abs(i) / 6, 2.4) * 0.5) + 0.05), h * 0.2, i * 2.4);
    b.sphere(1.0, 0xd8d2c0, 0, deckY + 0.6, len / 2 + 0.6, 1, 1.1, 1, 1); b.sphere(0.25, 0x0a0a0a, -0.35, deckY + 0.75, len / 2 + 1.4); b.sphere(0.25, 0x0a0a0a, 0.35, deckY + 0.75, len / 2 + 1.4);
  }
  // mástiles y vergas
  for (const [z, mh, sw] of cfg.masts) {
    b.cyl(0.12 * (kind === 'galeon' ? 1.8 : 1), 0.2 * (kind === 'galeon' ? 1.8 : 1), mh, 6, kind === 'galeon' ? 0x2a2a26 : 0x6a4a2a, 0, deckY + mh / 2, z);
    if (kind !== 'lancha') { b.cyl(0.07, 0.07, sw * 1.15, 5, 0x5a3a20, 0, deckY + mh * 0.92, z + 0.1, 0, 0, Math.PI / 2); b.cyl(0.06, 0.06, sw, 5, 0x5a3a20, 0, deckY + mh * 0.55, z + 0.1, 0, 0, Math.PI / 2); }
    b.cyl(0.32, 0.4, 0.35, 6, 0x5a3a20, 0, deckY + mh * 0.78, z); // cofa
  }
  const hull = new THREE.Mesh(b.build(), vmat());
  hull.castShadow = true; hull.receiveShadow = true;
  group.add(hull);

  // velas (una malla por mástil para poder recogerlas)
  /** @type {THREE.Mesh[]} */ const sails = [];
  const sailMat = kind === 'galeon'
    ? new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0.82, emissive: 0x1a8a5a, emissiveIntensity: 0.6, roughness: 1 })
    : vmat({ side: THREE.DoubleSide, roughness: 1, emissive: 0x3a352a });
  for (const [z, mh, sw, sh] of cfg.masts) {
    const tri = kind === 'lancha';
    const col = (x, y) => (y < -sh * 0.72 && y > -sh * 0.86 ? st.sailBand : st.sail);
    const g = sailGeo(sw, sh, kind === 'lancha' ? 0.6 : 0.9, col, kind === 'galeon' ? 1.6 : 0, tri, rand);
    const m = new THREE.Mesh(g, sailMat);
    m.position.set(0, deckY + mh * (tri ? 0.98 : 0.9), z + 0.25);
    if (tri) m.rotation.y = 0.25;
    m.castShadow = true;
    group.add(m); sails.push(m);
  }
  // bandera
  const fg = new THREE.PlaneGeometry(kind === 'galeon' ? 2.4 : 1.4, kind === 'galeon' ? 1.5 : 0.9, 3, 1); fg.translate(kind === 'galeon' ? 1.2 : 0.7, 0, 0);
  const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: st.flag, side: THREE.DoubleSide, roughness: 1, emissive: kind === 'player' ? 0x3a2a00 : 0 }));
  const top = cfg.masts.reduce((a, m) => Math.max(a, m[1]), 0), topZ = cfg.masts.find(m => m[1] === top)?.[0] || 0;
  flag.position.set(0, deckY + top + 0.1, topZ); flag.rotation.y = Math.PI / 2;
  group.add(flag);
  if (kind !== 'player') {
    // calavera en la bandera
    const sk = new THREE.Mesh(new THREE.CircleGeometry(kind === 'galeon' ? 0.4 : 0.25, 8), new THREE.MeshBasicMaterial({ color: kind === 'galeon' ? 0x7affc8 : 0xf0f0f0, side: THREE.DoubleSide }));
    sk.position.set(kind === 'galeon' ? 1.2 : 0.7, 0, 0.01); flag.add(sk);
  }
  // troneras (brillan antes de disparar): una malla por banda
  /** @type {Record<string, THREE.Mesh>} */ const ports = {};
  if (cfg.ports.length) for (const sd of [-1, 1]) {
    const pb = new Builder();
    for (const z of cfg.ports) pb.box(0.06, kind === 'galeon' ? 0.9 : 0.5, kind === 'galeon' ? 1.1 : 0.6, 0xffffff, sd * (wid / 2 + 0.06), portY, z);
    const pm = new THREE.Mesh(pb.build(), glowMat(st.port, { opacity: 0 }));
    pm.visible = false; group.add(pm);
    ports[sd < 0 ? 'neg' : 'pos'] = pm; // local -x = estribor (derecha), +x = babor
  }
  // bandera blanca de rendición (goleta)
  let white = null;
  if (kind === 'goleta') {
    white = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0x555555 }));
    white.geometry.translate(0.8, 0, 0); white.position.set(0, deckY + 9.6, -1.8); white.rotation.y = Math.PI / 2; white.visible = false; group.add(white);
  }
  return { group, hull, sails, flag, ports, white, deckY, len, wid, top: deckY + top, portY, portZ: cfg.ports };
}

/* ======================= tiburón ======================= */
export function sharkModel() {
  const group = new THREE.Group();
  const b = new Builder();
  const body = new THREE.IcosahedronGeometry(1, 1);
  b.add(body, (x, y) => y < -0.2 ? 0xd8dde0 : 0x5f7487, [0, 0, 0, 0, 0, 0, 1.4, 1.2, 5.2]);
  b.cone(0.9, 2.2, 4, 0x4f6477, 0, 1.6, 0.3, -0.35, 0, 0, ); // aleta dorsal
  b.cone(0.5, 1.6, 4, 0x4f6477, 1.3, -0.5, 1.4, 0.2, 0, -1.9);
  b.cone(0.5, 1.6, 4, 0x4f6477, -1.3, -0.5, 1.4, 0.2, 0, 1.9);
  b.box(1.0, 0.18, 0.2, 0x1a1a1a, 0, -0.35, 4.6); // boca
  b.sphere(0.14, 0x0a0a0a, 0.75, 0.25, 3.9); b.sphere(0.14, 0x0a0a0a, -0.75, 0.25, 3.9);
  const bodyMesh = new THREE.Mesh(b.build(), vmat());
  bodyMesh.castShadow = true;
  const tb = new Builder();
  tb.cone(0.7, 2.6, 4, 0x4f6477, 0, 1.0, -0.6, -0.6, 0, 0); tb.cone(0.5, 1.8, 4, 0x4f6477, 0, -0.7, -0.4, Math.PI + 0.7, 0, 0);
  tb.add(new THREE.IcosahedronGeometry(0.7, 0), 0x5f7487, [0, 0, 0.6, 0, 0, 0, 0.8, 0.8, 1.6]);
  const tail = new THREE.Mesh(tb.build(), vmat());
  tail.position.set(0, 0, -4.8);
  group.add(bodyMesh, tail);
  group.scale.setScalar(1.15);
  return { group, tail };
}

/* ======================= islas ======================= */
/** Contorno irregular determinista de la isla. */
export function coastK(isl, a) { const s = isl.seed || 0; return 1 + 0.05 * Math.sin(3 * a + s) + 0.03 * Math.sin(7 * a + s * 2.3); }
/** Altura del terreno de una isla en coordenadas del mundo (o -3 si está lejos). */
export function islandHeight(isl, x, z) {
  const dx = x - isl.x, dz = z - isl.z, d = Math.hypot(dx, dz);
  const t = d / (isl.r * coastK(isl, Math.atan2(dz, dx)));
  return profile(isl, t, Math.atan2(dz, dx));
}
const smooth = t => t * t * (3 - 2 * t);
function profile(isl, t, a) {
  const h = isl.h;
  if (isl.rock || isl.coral) {
    if (t < 0.35) return h + Math.sin(a * 3) * 0.4;
    if (t < 1) return h + (0.2 - h) * smooth((t - 0.35) / 0.65);
    return 0.2 + (-3 - 0.2) * Math.min(1, (t - 1) / 0.3);
  }
  const bump = Math.sin(a * 4 + (isl.seed || 0)) * 0.25 * (1 - t);
  if (t < 0.5) return h + bump;
  if (t < 0.85) return h + (1.0 - h) * smooth((t - 0.5) / 0.35) + bump;
  if (t < 1) return 1.0 + (0.15 - 1.0) * (t - 0.85) / 0.15;
  return 0.15 + (-3 - 0.15) * Math.min(1, (t - 1) / 0.3);
}

/**
 * Geometría de terreno de una isla (malla polar con sombreado plano).
 * @param {any} isl @param {any} env
 */
export function islandGeo(isl, env) {
  const rings = isl.rock || isl.coral ? [0, 0.2, 0.35, 0.6, 0.82, 1, 1.12, 1.3] : [0, 0.22, 0.42, 0.55, 0.7, 0.85, 0.94, 1, 1.1, 1.3];
  const seg = Math.max(14, Math.min(34, Math.round(isl.r * 1.3)));
  const pts = rings.map(f => Array.from({ length: seg }, (_, j) => {
    const a = j / seg * Math.PI * 2, k = coastK(isl, a), rr = f * isl.r * k;
    return [isl.x + Math.cos(a) * rr, profile(isl, f, a), isl.z + Math.sin(a) * rr];
  }));
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
    const j2 = (j + 1) % seg, a = pts[i][j], b = pts[i][j2], c = pts[i + 1][j], d = pts[i + 1][j2];
    if (i === 0) { tri(a, d, c); continue; }
    tri(a, b, c); tri(b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const rocky = isl.rock || isl.coral;
  paint(g, (x, y, z, ny) => {
    if (rocky) return y < 0.3 ? 0x3a3a40 : ny < 0.55 ? env.rock : (isl.coral ? 0x3a2a44 : env.rock);
    if (y < 0.05) return 0xb8a77a;
    if (y < 1.25) return env.sand;
    return ny < 0.6 ? env.rock : env.grass;
  });
  return g;
}

/** Palmera (una geometría; se instancia). */
export function palmGeo() {
  const b = new Builder();
  for (let i = 0; i < 5; i++) b.cyl(0.16 - i * 0.015, 0.2 - i * 0.015, 1.1, 6, i % 2 ? 0x8a6a44 : 0x7a5a38, i * 0.12, 0.55 + i * 1.0, 0, 0, 0, -0.1);
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    b.add(new THREE.ConeGeometry(0.45, 3.2, 3), k % 2 ? 0x3f9a3a : 0x4fae44, [0.6 + Math.cos(a) * 1.4, 5.0, Math.sin(a) * 1.4, 0, -a, Math.PI / 2 + 0.35, 1, 1, 0.25]);
  }
  b.sphere(0.25, 0x6a4a2a, 0.65, 4.8, 0.2); b.sphere(0.25, 0x6a4a2a, 0.45, 4.75, -0.2);
  return b.build();
}
export function rockGeo() { const b = new Builder(); b.sphere(1, 0x8a8478, 0, 0.3, 0, 1.2, 0.8, 1, 0); b.sphere(0.6, 0x7a746a, 0.8, 0.1, 0.4, 1, 0.7, 1, 0); return b.build(); }
export function coralGeo() {
  const b = new Builder();
  b.cone(0.5, 3.4, 5, 0x2a1f33, 0, 1.7, 0); b.cone(0.3, 2.2, 5, 0x3a2a48, 0.5, 1.1, 0.2, 0, 0, -0.5); b.cone(0.3, 2.0, 5, 0x3a2a48, -0.45, 1.0, -0.2, 0, 0, 0.6);
  b.sphere(0.12, 0xff5ab0, 0.85, 2.0, 0.2); b.sphere(0.1, 0xff5ab0, -0.8, 1.8, -0.2);
  return b.build();
}

/** Decoración estática de una isla (chozas, calavera, cueva, restos de mástiles) dentro del Builder de la región. */
export function islandDecor(b, isl, rand) {
  const y = (x, z) => islandHeight(isl, x, z);
  for (let i = 0; i < (isl.huts || 0); i++) {
    const a = i / isl.huts * Math.PI * 2 + 0.8, rr = isl.r * (0.25 + rand() * 0.25), x = isl.x + Math.cos(a) * rr, z = isl.z + Math.sin(a) * rr, gy = y(x, z);
    b.box(3, 2.2, 3, 0xd8b88a, x, gy + 1.1, z, a); b.cone(2.6, 1.6, 4, 0xa0522d, x, gy + 3.0, z, 0, a + Math.PI / 4); b.box(0.8, 1.2, 0.1, 0x4a3020, x + Math.cos(a) * 1.55, gy + 0.6, z + Math.sin(a) * 1.55, -a + Math.PI / 2);
  }
  if (isl.skull) { const gy = y(isl.x - 3, isl.z - 4); b.sphere(2.4, 0xe8e0c8, isl.x - 3, gy + 1.6, isl.z - 4, 1, 0.9, 1, 1); b.sphere(0.6, 0x1a1a1a, isl.x - 3.9, gy + 2.0, isl.z - 5.9); b.sphere(0.6, 0x1a1a1a, isl.x - 2.0, gy + 2.0, isl.z - 6.0); }
  if (isl.wrecks) for (let i = 0; i < 3; i++) { const x = isl.x - 5 + i * 4, z = isl.z - 6 + rand() * 3, gy = y(x, z); b.cyl(0.18, 0.25, 7, 6, 0x5a4030, x, gy + 3, z, 0.3 - i * 0.25, 0, 0.4 - i * 0.3); b.box(4, 0.15, 0.15, 0x5a4030, x, gy + 5.2, z, 0, 0.2, 0.3); }
}
/** Arco de la cueva (Isla del Eco). */
export function caveDecor(b, cave, isl) {
  const gy = islandHeight(isl, cave.x, cave.z);
  b.add(new THREE.TorusGeometry(3.6, 1.5, 6, 10, Math.PI), 0x5f625c, [cave.x, gy - 0.5, cave.z, 0, 0.35, 0]);
  b.sphere(4.2, 0x6f7470, cave.x - 1, gy + 2.4, cave.z + 6.8, 1.5, 1, 1.4, 0);
  b.add(new THREE.CircleGeometry(2.3, 10), 0x0a0a0c, [cave.x, gy + 1.2, cave.z + 1.0, 0, 0.35 + Math.PI, 0]);
  for (let i = 0; i < 4; i++) b.cone(0.25, 0.9, 4, 0x8a8478, cave.x - 1.5 + i, gy + 4.3, cave.z + 0.2, Math.PI);
}

/* ======================= muelle, faro, fuerte ======================= */
/** Muelle con mercado (estático) — devuelve además posiciones de faroles. */
export function dockDecor(b, dock, isl) {
  const { x, z0, z1 } = dock.pier;
  const len = z1 - z0, mid = (z0 + z1) / 2;
  b.box(3.2, 0.3, len, 0x9a7048, x, 1.15, mid);
  for (let z = z0; z <= z1 + 0.01; z += 3) for (const sx of [-1.5, 1.5]) b.cyl(0.18, 0.22, 3.6, 6, 0x5a4030, x + sx, -0.5, z);
  for (let z = z0 + 1; z < z1; z += 1.1) b.box(3.3, 0.06, 0.12, 0x6a4a2a, x, 1.31, z);
  // mercado en tierra
  const mx = x - 6, mz = z0 - 5, gy = islandHeight(isl, mx, mz);
  b.box(6, 2.4, 3.4, 0xcfa878, mx, gy + 1.2, mz); b.box(6.6, 0.2, 4.4, 0x6a3a1a, mx, gy + 2.5, mz);
  for (let i = 0; i < 6; i++) b.box(1.1, 0.12, 4.6, i % 2 ? 0xffbe3d : 0xc0392b, mx - 2.75 + i * 1.1, gy + 2.8, mz + 0.6, 0, -0.12);
  b.box(1.0, 0.9, 1.0, 0x8a6a3a, mx + 4, gy + 0.45, mz + 1.5); b.box(0.9, 0.8, 0.9, 0x7a5a32, mx + 4.2, gy + 1.3, mz + 1.4, 0.4);
  b.cyl(0.45, 0.45, 1.1, 8, 0x6a3a1a, mx - 4, gy + 0.55, mz + 2);
  b.box(1.0, 0.8, 1.0, 0x8a6a3a, x + 0.7, 1.7, z1 - 2); b.cyl(0.4, 0.4, 0.9, 8, 0x6a3a1a, x - 0.8, 1.75, z1 - 3.5);
  // postes de faroles
  const lamps = [[x - 1.4, z1 - 0.3], [x + 1.4, z1 - 0.3], [x - 1.4, mid], [x + 1.4, mid]];
  for (const [lx, lz] of lamps) b.cyl(0.07, 0.07, 2.2, 5, 0x2a2a2a, lx, 2.3, lz);
  return { lamps: lamps.map(([lx, lz]) => [lx, 3.5, lz]), market: { x: mx, z: mz, y: gy } };
}
export function lighthouseDecor(b, lh, gy) {
  const n = 6;
  for (let i = 0; i < n; i++) b.cyl(1.6 - i * 0.14, 1.75 - i * 0.14, 1.6, 10, i % 2 ? 0xc0392b : 0xf2efe6, lh.x, gy + 0.8 + i * 1.6, lh.z);
  const top = gy + n * 1.6;
  if (lh.broken) { b.box(1.8, 0.8, 1.2, 0x8a8478, lh.x + 0.6, top + 0.2, lh.z, 0.4, 0.3); return top; }
  b.cyl(1.25, 1.25, 0.25, 10, 0x2a2a2a, lh.x, top + 0.1, lh.z);
  b.cyl(0.95, 0.95, 1.6, 8, 0xfff0a0, lh.x, top + 1.0, lh.z);
  b.cone(1.3, 1.2, 8, 0x2a2a2a, lh.x, top + 2.4, lh.z);
  return top;
}
/** Murallas y torres del fuerte. Devuelve la altura de las baterías. */
export function fortDecor(b, fort, isl) {
  const cx = isl.x, cz = isl.z, W = fort.wall, gy = islandHeight(isl, cx, cz);
  const wallH = 4.2, col = 0x3a3442, top = 0x2a2532;
  const seg = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0); b.box(1.6, wallH, l, col, (x0 + x1) / 2, gy + wallH / 2 - 0.4, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0)); for (let t = 0.5; t < l; t += 2) b.box(1.7, 0.7, 0.9, top, x0 + (x1 - x0) * t / l, gy + wallH - 0.05, z0 + (z1 - z0) * t / l, Math.atan2(x1 - x0, z1 - z0)); };
  seg(cx - W, cz + W, cx + W, cz + W); seg(cx - W, cz - W, cx - W, cz + W); seg(cx + W, cz - W, cx + W, cz + W);
  seg(cx - W, cz - W, cx - 4.5, cz - W); seg(cx + 4.5, cz - W, cx + W, cz - W);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.cyl(3.4, 3.8, 6.4, 8, 0x332d3c, cx + sx * W, gy + 2.8, cz + sz * W); b.cyl(3.7, 3.7, 0.6, 8, top, cx + sx * W, gy + 6.2, cz + sz * W); }
  // torre del homenaje y mástil de la bandera
  b.box(8, 7, 8, 0x3a3442, cx, gy + 3.1, cz + 6); b.box(8.6, 0.8, 8.6, top, cx, gy + 6.9, cz + 6);
  b.cyl(0.14, 0.18, 11, 6, 0x2a2a2a, fort.flag.x, gy + 5.5, fort.flag.z);
  b.box(3, 0.6, 3, 0x2a2532, fort.flag.x, gy + 0.3, fort.flag.z);
  // portón
  b.box(9, 6.2, 1.8, 0x2a2532, cx, gy + 2.7, cz - W - 0.2); b.box(5.8, 4.6, 2.0, 0x120e16, cx, gy + 1.9, cz - W - 0.2);
  return gy + 6.5;
}

/* ======================= piezas interactivas ======================= */
/** Cañón de costa: base (para el estático) + torreta (malla aparte que gira). */
export function cannonBase(b, x, y, z, battery) { b.cyl(2.0, 2.4, battery ? 0.6 : 1.4, 8, battery ? 0x2a2532 : 0x8a8478, x, y + (battery ? 0.3 : 0.7), z); if (!battery) for (let i = 0; i < 6; i++) b.box(0.9, 0.6, 0.7, 0x6f6a62, x + Math.cos(i) * 2.0, y + 1.6, z + Math.sin(i) * 2.0, i); }
export function cannonTurretGeo(spectral = false) {
  const b = new Builder();
  b.box(1.8, 0.8, 2.0, spectral ? 0x1a3a30 : 0x5a3a20, 0, 0.4, 0);
  for (const sx of [-0.95, 0.95]) b.cyl(0.55, 0.55, 0.2, 8, spectral ? 0x2a5a4a : 0x3a2a1a, sx, 0.5, -0.4, 0, 0, Math.PI / 2);
  b.cyl(0.32, 0.46, 3.0, 8, spectral ? 0x3fdc9c : 0x26272b, 0, 1.15, 0.9, Math.PI / 2 - 0.25);
  b.cyl(0.4, 0.4, 0.3, 8, spectral ? 0x7affc8 : 0x3a3b40, 0, 1.52, 2.3, Math.PI / 2 - 0.25);
  return b.build();
}
export function rubbleGeo() { const b = new Builder(); for (let i = 0; i < 6; i++) b.sphere(0.6 + (i % 3) * 0.2, i % 2 ? 0x3a3a3a : 0x5a5650, Math.cos(i * 2.1) * 1.2, 0.3, Math.sin(i * 2.1) * 1.2, 1, 0.6, 1, 0); b.cyl(0.3, 0.42, 2.2, 7, 0x1c1c1e, 0.4, 0.3, 0.2, 1.5, 0.6, 0.2); return b.build(); }

export function chestGeos() {
  const b = new Builder();
  b.box(1.4, 0.8, 0.9, 0x7a4a22, 0, 0.4, 0); for (const x of [-0.5, 0.5]) b.box(0.12, 0.82, 0.92, 0xffbe3d, x, 0.4, 0);
  b.box(0.25, 0.3, 0.06, 0xffd84a, 0, 0.62, 0.46);
  const base = b.build();
  const l = new Builder();
  l.add(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 8, 1, false, 0, Math.PI), 0x8a5a2a, [0, 0, 0.45, 0, 0, Math.PI / 2]);
  for (const x of [-0.5, 0.5]) l.add(new THREE.CylinderGeometry(0.47, 0.47, 0.12, 8, 1, false, 0, Math.PI), 0xffbe3d, [x, 0, 0.45, 0, 0, Math.PI / 2]);
  const lid = l.build();
  const gold = new Builder(); for (let i = 0; i < 7; i++) gold.cyl(0.14, 0.14, 0.05, 8, 0xffd84a, (i % 4 - 1.5) * 0.28, 0.75 + (i > 3 ? 0.06 : 0), (i > 3 ? 0.1 : -0.1), 0.3, 0, 0.2 * i);
  return { base, lid, gold: gold.build() };
}
export function xMarkGeo() { const b = new Builder(); b.box(2.0, 0.08, 0.35, 0xd0251a, 0, 0, 0, Math.PI / 4); b.box(2.0, 0.08, 0.35, 0xd0251a, 0, 0, 0, -Math.PI / 4); return b.build(); }
export function holeGeo() { const b = new Builder(); b.cyl(1.1, 0.8, 0.12, 9, 0x4a3a22, 0, 0, 0); b.sphere(0.5, 0xc8b07a, 1.3, 0.1, 0.3, 1, 0.5, 1); b.sphere(0.4, 0xc8b07a, -1.2, 0.1, -0.5, 1, 0.5, 1); return b.build(); }

export function castawayModel() {
  const group = new THREE.Group();
  const b = new Builder();
  for (let i = -2; i <= 2; i++) b.cyl(0.22, 0.22, 3.0, 6, i % 2 ? 0x8a6a44 : 0x9a7a52, i * 0.45, 0.1, 0, Math.PI / 2);
  b.cyl(0.05, 0.05, 2.6, 5, 0x6a4a2a, 0.8, 1.3, -0.9); b.box(0.9, 0.6, 0.04, 0xe8e0d0, 1.25, 2.3, -0.9);
  b.cyl(0.28, 0.32, 0.9, 6, 0x4a7ab0, 0, 0.75, 0); b.sphere(0.24, 0xf0c090, 0, 1.4, 0, 1, 1, 1, 1);
  b.box(0.3, 0.12, 0.6, 0x2a2a2a, 0, 0.32, 0.25);
  const body = new THREE.Mesh(b.build(), vmat()); group.add(body);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12).translate(0, 0.4, 0), vmat()); paint(arm.geometry, 0xf0c090);
  arm.position.set(0.3, 1.05, 0); group.add(arm);
  const glow = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.0, 24).rotateX(-Math.PI / 2), glowMat(0xfff27a, { opacity: 0.5, side: THREE.DoubleSide }));
  glow.position.y = 0.15; group.add(glow);
  return { group, arm, glow };
}

/** Capitán a pie (cuerpo + piernas + brazo con pala). */
export function captainModel() {
  const group = new THREE.Group();
  const b = new Builder();
  b.cyl(0.36, 0.42, 1.0, 7, 0x1d3557, 0, 1.25, 0); b.box(0.86, 0.12, 0.5, 0x5a3a1a, 0, 0.95, 0);
  b.box(0.2, 0.5, 0.06, 0xffbe3d, 0, 1.35, 0.38);
  b.sphere(0.28, 0xf0c090, 0, 2.0, 0, 1, 1, 1, 1);
  b.cyl(0.52, 0.52, 0.12, 3, 0x111111, 0, 2.27, 0, 0, Math.PI / 6); b.cyl(0.3, 0.32, 0.3, 7, 0x111111, 0, 2.42, 0); b.cyl(0.54, 0.54, 0.04, 3, 0xffbe3d, 0, 2.22, 0, 0, Math.PI / 6);
  b.box(0.12, 0.6, 0.12, 0x1d3557, -0.45, 1.3, 0, 0, 0, 0.15);
  const body = new THREE.Mesh(b.build(), vmat());
  body.castShadow = true;
  const legG = new THREE.BoxGeometry(0.2, 0.75, 0.22).translate(0, -0.37, 0); paint(legG, 0x2a2420);
  const legL = new THREE.Mesh(legG, vmat()), legR = new THREE.Mesh(legG, legL.material);
  legL.position.set(-0.16, 0.82, 0); legR.position.set(0.16, 0.82, 0);
  const ab = new Builder(); ab.box(0.13, 0.6, 0.13, 0x1d3557, 0, -0.3, 0); ab.cyl(0.04, 0.04, 1.3, 5, 0x6a4a2a, 0, -0.6, 0.35, Math.PI / 2 - 0.6); ab.box(0.35, 0.05, 0.45, 0x8a8a90, 0, -0.95, 0.85, 0.5);
  const arm = new THREE.Mesh(ab.build(), vmat()); arm.position.set(0.45, 1.6, 0);
  group.add(body, legL, legR, arm);
  return { group, legL, legR, arm };
}

/** Bandera del fuerte (se cambia el color al capturarla). */
export function flagMesh(color) { const g = new THREE.PlaneGeometry(2.6, 1.6, 4, 1); g.translate(1.3, 0, 0); return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 1 })); }

/** Portal de corriente marina (anillo + pilar de luz). */
export function gateModel() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.45, 6, 40).rotateX(Math.PI / 2), glowMat(0xffbe3d, { opacity: 0.85 }));
  ring.position.y = 0.6;
  const inner = new THREE.Mesh(new THREE.RingGeometry(3, 8.6, 40, 1).rotateX(-Math.PI / 2), glowMat(0xffe7a0, { opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  inner.position.y = 0.45;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 40, 24, 1, true), glowMat(0xffd27a, { opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  pillar.position.y = 20;
  const ab = new Builder();
  for (let i = 0; i < 3; i++) { ab.box(0.5, 0.1, 3.2, 0xffffff, -1.1, 0, -2 + i * 2.6, 0.7); ab.box(0.5, 0.1, 3.2, 0xffffff, 1.1, 0, -2 + i * 2.6, -0.7); }
  const arrows = new THREE.Mesh(ab.build(), glowMat(0xffffff, { opacity: 0.7 }));
  arrows.position.y = 0.55;
  group.add(ring, inner, pillar, arrows);
  return { group, ring, inner, pillar, arrows };
}
