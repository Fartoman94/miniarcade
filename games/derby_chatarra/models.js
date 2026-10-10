// @ts-check
/* Derby de Chatarra — modelos low-poly procedurales (geometrías fusionadas con color por vértice). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Acumula piezas con color y las fusiona en una sola geometría no indexada (posición, normal, color). */
export class Builder {
  constructor() { /** @type {THREE.BufferGeometry[]} */ this.parts = []; }
  /**
   * @param {THREE.BufferGeometry} geo
   * @param {number} color
   * @param {any[]} [t] [x,y,z, rx,ry,rz, sx,sy,sz, orden de Euler]
   */
  add(geo, color, t = []) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    geo.dispose();
    const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ'] = t;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, order)), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.setHex(color).convertSRGBToLinear();
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  /** caja w×h×d */
  box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, [x, y, z, rx, ry, rz]); }
  /** cilindro (eje Y salvo rotación) */
  cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, [x, y, z, rx, ry, rz]); }
  sphere(r, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, d = 1) { return this.add(new THREE.IcosahedronGeometry(r, d), color, [x, y, z, 0, 0, 0, sx, sy, sz]); }
  cone(r, h, seg, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), color, [x, y, z, rx, ry, rz]); }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    this.parts.forEach(p => p.dispose()); this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Material de vértices plano. @param {object} [o] */
export const vmat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.75, metalness: 0.1, ...o });

const DARK = 0x26282c, CHROME = 0x9aa0a6, GLASS = 0x58788f, HEAD = 0xfff1b8, TAIL = 0xff3a2a, RUST = 0x8a4a22;

/** @param {number} hex @param {number} k */
export function shade(hex, k) { _c.setHex(hex); _c.r = Math.min(1, _c.r * k); _c.g = Math.min(1, _c.g * k); _c.b = Math.min(1, _c.b * k); return _c.getHex(); }

/**
 * Modelos de autos. Frente = +Z. Devuelve geometría del cuerpo, ruedas y datos de escala.
 * @param {string} kind @param {number} color
 * @returns {{geo:THREE.BufferGeometry, wheels:{x:number,y:number,z:number,r:number,w:number,steer:boolean}[], len:number, wid:number, h:number, extras?:any}}
 */
export function carModel(kind, color) {
  const b = new Builder();
  const dk = shade(color, 0.62), lt = shade(color, 1.25);
  /** @type {{x:number,y:number,z:number,r:number,w:number,steer:boolean}[]} */
  const wheels = [];
  const W = (x, y, z, r, w, steer) => { wheels.push({ x, y, z, r, w, steer }); wheels.push({ x: -x, y, z, r, w, steer }); };
  let len = 4, wid = 2, h = 1.5;
  const numDisc = (x, y, z, rz) => { b.cyl(0.32, 0.32, 0.04, 10, 0xf4f1e6, x, y, z, 0, 0, rz); b.box(0.06, 0.3, 0.05, 0x111111, x + Math.sign(x) * 0.02, y, z); };
  if (kind === 'beetle') {
    len = 3.9; wid = 1.95; h = 1.55;
    b.box(1.9, 0.55, 3.8, color, 0, 0.62, 0);
    b.box(1.96, 0.24, 3.6, DARK, 0, 0.32, 0);
    b.box(1.78, 0.22, 1.3, lt, 0, 0.98, 1.15, 0, -0.12);
    b.add(new THREE.CylinderGeometry(0.72, 1.02, 0.6, 4), GLASS, [0, 1.2, -0.25, 0, Math.PI / 4, 0, 1.0, 1, 1.3]);
    b.box(1.2, 0.12, 1.45, color, 0, 1.53, -0.3);
    b.box(2.02, 0.3, 0.28, CHROME, 0, 0.46, 1.98); b.box(2.02, 0.3, 0.28, CHROME, 0, 0.46, -1.98);
    b.box(0.36, 0.2, 0.08, HEAD, 0.6, 0.74, 1.92); b.box(0.36, 0.2, 0.08, HEAD, -0.6, 0.74, 1.92);
    b.box(0.32, 0.16, 0.08, TAIL, 0.62, 0.74, -1.92); b.box(0.32, 0.16, 0.08, TAIL, -0.62, 0.74, -1.92);
    b.box(0.05, 0.3, 0.7, RUST, 0.96, 0.55, -1.2); b.box(0.05, 0.22, 0.5, RUST, -0.96, 0.7, 1.3);
    b.cyl(0.09, 0.09, 0.5, 6, 0x555555, 0.55, 0.4, -2.1, Math.PI / 2);
    numDisc(0.97, 0.7, 0, Math.PI / 2); numDisc(-0.97, 0.7, 0, Math.PI / 2);
    W(0.96, 0.42, 1.25, 0.42, 0.34, true); W(0.96, 0.42, -1.25, 0.44, 0.36, false);
  } else if (kind === 'pickup' || kind === 'ram') {
    len = 4.6; wid = 2.05; h = 1.85;
    b.box(2.0, 0.6, 4.4, color, 0, 0.72, 0);
    b.box(2.06, 0.22, 4.2, DARK, 0, 0.36, 0);
    b.box(1.92, 0.78, 1.55, color, 0, 1.38, 0.35);
    b.box(1.95, 0.42, 1.35, GLASS, 0, 1.45, 0.4);
    b.box(1.9, 0.24, 1.45, lt, 0, 1.12, 1.45);
    b.box(0.14, 0.42, 1.9, dk, 0.94, 1.22, -1.25); b.box(0.14, 0.42, 1.9, dk, -0.94, 1.22, -1.25); b.box(1.9, 0.42, 0.14, dk, 0, 1.22, -2.15);
    b.box(1.6, 0.3, 0.1, 0x222222, 0, 0.85, 2.21);
    b.box(0.34, 0.2, 0.08, HEAD, 0.68, 0.92, 2.21); b.box(0.34, 0.2, 0.08, HEAD, -0.68, 0.92, 2.21);
    b.box(0.3, 0.2, 0.08, TAIL, 0.75, 0.95, -2.22); b.box(0.3, 0.2, 0.08, TAIL, -0.75, 0.95, -2.22);
    b.box(0.06, 0.3, 0.9, RUST, 1.01, 0.65, 0.9);
    numDisc(1.02, 0.85, -0.2, Math.PI / 2); numDisc(-1.02, 0.85, -0.2, Math.PI / 2);
    if (kind === 'ram') {
      // paragolpes ariete + cuernos
      b.box(2.3, 0.16, 0.16, CHROME, 0, 0.7, 2.5); b.box(2.3, 0.16, 0.16, CHROME, 0, 1.1, 2.5);
      for (const x of [-0.95, -0.3, 0.3, 0.95]) b.box(0.14, 0.62, 0.14, CHROME, x, 0.9, 2.5);
      b.box(0.14, 0.14, 0.5, CHROME, 0.95, 0.9, 2.25); b.box(0.14, 0.14, 0.5, CHROME, -0.95, 0.9, 2.25);
      b.cone(0.13, 0.75, 6, 0xf1e6c8, 0.75, 1.95, 0.5, 0, 0, -1.1); b.cone(0.13, 0.75, 6, 0xf1e6c8, -0.75, 1.95, 0.5, 0, 0, 1.1);
      b.box(0.5, 0.12, 0.12, 0xffe08a, 0, 1.82, 0.9);
    } else {
      b.box(2.1, 0.32, 0.3, 0x444444, 0, 0.62, 2.3);
      b.box(1.7, 0.14, 0.14, 0x444444, 0, 1.82, 0.0);
      for (const x of [-0.6, -0.2, 0.2, 0.6]) b.box(0.18, 0.14, 0.12, 0xffe08a, x, 1.9, 0.0);
    }
    W(1.0, 0.5, 1.45, 0.5, 0.38, true); W(1.0, 0.5, -1.45, 0.5, 0.38, false);
  } else if (kind === 'coupe') {
    len = 4.1; wid = 1.95; h = 1.25;
    b.box(1.9, 0.45, 4.0, color, 0, 0.55, 0);
    b.box(1.96, 0.18, 3.8, DARK, 0, 0.3, 0);
    b.box(1.8, 0.2, 1.4, lt, 0, 0.82, 1.25, 0, -0.18);
    b.add(new THREE.CylinderGeometry(0.62, 0.95, 0.45, 4), GLASS, [0, 1.0, -0.35, 0, Math.PI / 4, 0, 1.0, 1, 1.45]);
    b.box(1.1, 0.08, 1.2, color, 0, 1.24, -0.4);
    b.box(0.1, 0.35, 0.1, DARK, 0.7, 0.95, -1.8); b.box(0.1, 0.35, 0.1, DARK, -0.7, 0.95, -1.8);
    b.box(2.0, 0.08, 0.42, lt, 0, 1.15, -1.85);
    b.box(0.08, 0.14, 3.6, 0xffffff, 0.3, 0.79, 0); b.box(0.08, 0.14, 3.6, 0xffffff, -0.3, 0.79, 0);
    b.box(0.4, 0.14, 0.08, HEAD, 0.6, 0.62, 2.02); b.box(0.4, 0.14, 0.08, HEAD, -0.6, 0.62, 2.02);
    b.box(1.5, 0.12, 0.08, TAIL, 0, 0.66, -2.02);
    numDisc(0.97, 0.58, -0.1, Math.PI / 2); numDisc(-0.97, 0.58, -0.1, Math.PI / 2);
    W(0.95, 0.4, 1.3, 0.4, 0.34, true); W(0.95, 0.42, -1.3, 0.43, 0.4, false);
  } else if (kind === 'kart') {
    len = 2.6; wid = 1.6; h = 1.3;
    b.box(1.2, 0.14, 2.3, 0x333333, 0, 0.32, 0);
    b.box(1.0, 0.3, 0.9, color, 0, 0.5, 0.85, 0, -0.25);
    b.box(0.8, 0.5, 0.6, color, 0, 0.62, -0.35);
    b.box(0.9, 0.35, 0.5, 0x555555, 0, 0.55, -1.0);
    b.cyl(0.08, 0.08, 1.7, 6, CHROME, 0, 0.42, 1.25, 0, 0, Math.PI / 2);
    b.cyl(0.08, 0.08, 1.7, 6, CHROME, 0, 0.42, -1.3, 0, 0, Math.PI / 2);
    b.sphere(0.3, color, 0, 1.05, -0.25, 1, 1, 1, 1);
    b.box(0.42, 0.14, 0.1, GLASS, 0, 1.08, 0.0);
    b.box(0.5, 0.45, 0.35, 0x2a2a6a, 0, 0.82, -0.3);
    b.box(1.4, 0.06, 0.3, color, 0, 0.95, -1.25);
    b.cyl(0.07, 0.09, 0.4, 6, 0x666666, 0.3, 0.75, -1.25, -0.4);
    W(0.72, 0.3, 0.9, 0.3, 0.28, true); W(0.75, 0.38, -0.85, 0.38, 0.42, false);
  } else if (kind === 'hover') {
    len = 3.6; wid = 2.2; h = 1.4;
    b.sphere(1, color, 0, 0.95, 0, 1.0, 0.36, 1.8, 1);
    b.sphere(0.6, 0x5a3fa8, 0, 1.25, 0.25, 1, 0.75, 1.3, 1);
    b.box(0.12, 0.6, 0.9, shade(color, 0.7), 0.75, 1.3, -1.35, 0, 0, -0.3); b.box(0.12, 0.6, 0.9, shade(color, 0.7), -0.75, 1.3, -1.35, 0, 0, 0.3);
    for (const [x, z] of [[1.0, 1.1], [-1.0, 1.1], [1.0, -1.1], [-1.0, -1.1]]) { b.cyl(0.38, 0.45, 0.32, 8, 0x3a3a46, x, 0.62, z); b.cyl(0.3, 0.3, 0.06, 8, 0x7ff7ff, x, 0.45, z); }
    b.box(0.5, 0.12, 0.1, HEAD, 0.4, 0.9, 1.78); b.box(0.5, 0.12, 0.1, HEAD, -0.4, 0.9, 1.78);
    b.cyl(0.06, 0.06, 0.5, 6, 0x888888, 0, 1.75, -0.2);
  } else if (kind === 'truck') {
    len = 5.6; wid = 2.6; h = 3.0;
    b.box(2.4, 0.5, 5.4, 0x2e2e2e, 0, 0.75, 0);
    b.box(2.35, 1.5, 1.8, color, 0, 1.75, 1.75);
    b.box(2.2, 0.5, 0.1, GLASS, 0, 2.15, 2.66);
    b.box(2.5, 2.0, 3.3, shade(color, 0.85), 0, 2.0, -0.95);
    // placas de blindaje con remaches
    b.box(2.6, 0.9, 0.18, 0x55604a, 0, 1.15, 2.72);
    b.box(0.16, 1.2, 4.6, 0x55604a, 1.3, 1.6, 0.2); b.box(0.16, 1.2, 4.6, 0x55604a, -1.3, 1.6, 0.2);
    for (let i = 0; i < 6; i++) { const z = -1.9 + i * 0.8; b.box(0.08, 0.1, 0.1, CHROME, 1.39, 1.95, z); b.box(0.08, 0.1, 0.1, CHROME, -1.39, 1.95, z); }
    b.box(0.4, 0.2, 0.08, HEAD, 0.8, 1.25, 2.82); b.box(0.4, 0.2, 0.08, HEAD, -0.8, 1.25, 2.82);
    b.box(0.1, 0.1, 0.1, 0xffaa00, 0.9, 2.55, 2.0); b.box(0.1, 0.1, 0.1, 0xffaa00, -0.9, 2.55, 2.0);
    b.cyl(0.55, 0.55, 2.0, 10, 0xff8a2a, 0, 1.05, -2.85, 0, 0, Math.PI / 2);
    b.cyl(0.58, 0.58, 0.1, 10, 0x333333, 0.95, 1.05, -2.85, 0, 0, Math.PI / 2); b.cyl(0.58, 0.58, 0.1, 10, 0x333333, -0.95, 1.05, -2.85, 0, 0, Math.PI / 2);
    b.box(0.1, 0.3, 0.1, 0xffe14a, 0, 1.7, -2.85);
    W(1.2, 0.6, 1.8, 0.6, 0.45, true); W(1.2, 0.6, -0.5, 0.6, 0.45, false); W(1.2, 0.6, -1.9, 0.6, 0.45, false);
  } else if (kind === 'monster') {
    len = 5.4; wid = 3.4; h = 3.6;
    b.box(3.0, 1.0, 4.8, color, 0, 2.3, 0);
    b.box(3.1, 0.3, 4.6, DARK, 0, 1.75, 0);
    b.box(2.6, 1.1, 2.0, shade(color, 0.85), 0, 3.3, -0.3);
    b.box(2.62, 0.5, 1.6, GLASS, 0, 3.45, -0.2);
    b.box(2.8, 0.25, 1.4, lt, 0, 2.9, 1.7, 0, -0.15);
    for (const x of [-1.3, 1.3]) { b.cyl(0.14, 0.14, 1.6, 6, CHROME, x, 3.9, -1.3); b.cyl(0.2, 0.14, 0.2, 6, 0x222222, x, 4.75, -1.3); }
    for (let i = 0; i < 5; i++) b.cone(0.12, 0.45, 5, CHROME, -1.2 + i * 0.6, 3.95, 0.6);
    b.box(0.4, 0.22, 0.1, HEAD, 1.0, 2.5, 2.42); b.box(0.4, 0.22, 0.1, HEAD, -1.0, 2.5, 2.42);
    b.box(2.0, 0.5, 0.6, 0x3b3b3b, 0, 1.4, 2.3);
    b.box(0.3, 1.2, 0.3, 0x444444, 1.2, 1.2, 1.8); b.box(0.3, 1.2, 0.3, 0x444444, -1.2, 1.2, 1.8);
    b.box(0.3, 1.2, 0.3, 0x444444, 1.2, 1.2, -1.8); b.box(0.3, 1.2, 0.3, 0x444444, -1.2, 1.2, -1.8);
    b.box(2.6, 0.5, 0.3, 0x55303a, 0, 2.2, -2.45);
    W(1.85, 1.05, 1.85, 1.05, 0.9, true); W(1.85, 1.05, -1.85, 1.05, 0.9, false);
  }
  return { geo: b.build(), wheels, len, wid, h };
}

/** Rueda unitaria (eje X): neumático + llanta. Escala por instancia: (ancho, radio, radio). */
export function wheelGeo() {
  const b = new Builder();
  b.cyl(1, 1, 1, 12, 0x1d1d20, 0, 0, 0, 0, 0, Math.PI / 2);
  b.cyl(0.55, 0.55, 1.04, 8, 0xa8adb3, 0, 0, 0, 0, 0, Math.PI / 2);
  b.box(1.06, 0.18, 0.9, 0x6a6e73, 0, 0, 0);
  return b.build();
}

/** Triturador frontal del jefe (eje X) con dientes. */
export function grinderGeo() {
  const b = new Builder();
  b.cyl(0.75, 0.75, 3.2, 10, 0x4a4f55, 0, 0, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + i * 0.5, x = -1.35 + i * 0.54;
    b.box(0.16, 0.42, 0.22, 0xd9d2c0, x, Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0, a, 0);
  }
  return b.build();
}
/** Escudo frontal (pala curva) del jefe. */
export function shieldGeo() {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(3.4, 3.4, 2.2, 14, 1, true, -0.75, 1.5), 0x3ec8ff, [0, 0, -2.0, 0, 0, 0]);
  b.box(3.6, 0.2, 0.3, 0x9ff0ff, 0, 1.1, 1.0); b.box(3.6, 0.2, 0.3, 0x9ff0ff, 0, -1.1, 1.0);
  return b.build();
}

/** Caja de madera unitaria (1 m). */
export function crateGeo() {
  const b = new Builder();
  b.box(1, 1, 1, 0xb07a3c);
  b.box(1.02, 0.14, 1.02, 0x7a4f22, 0, 0.43, 0); b.box(1.02, 0.14, 1.02, 0x7a4f22, 0, -0.43, 0);
  b.box(0.14, 1.02, 1.02, 0x7a4f22, 0.43, 0, 0); b.box(0.14, 1.02, 1.02, 0x7a4f22, -0.43, 0, 0);
  b.box(1.03, 0.12, 0.12, 0x8c5c2a, 0, 0, 0, 0, 0, 0.78);
  return b.build();
}

/** Contenedor de carga (12 × 2.6 × 2.6) con nervaduras. Color blanco: se tiñe con el material o instanceColor. */
export function containerGeo(len = 12) {
  const b = new Builder();
  b.box(len, 2.6, 2.6, 0xffffff, 0, 1.3, 0);
  const n = Math.floor(len / 0.8);
  for (let i = 0; i <= n; i++) { const x = -len / 2 + 0.25 + i * (len - 0.5) / n; b.box(0.12, 2.4, 2.7, 0xd8d8d8, x, 1.3, 0); }
  b.box(len + 0.06, 0.16, 2.66, 0x8a8a8a, 0, 2.55, 0); b.box(len + 0.06, 0.16, 2.66, 0x8a8a8a, 0, 0.08, 0);
  b.box(0.08, 2.4, 0.08, 0x666666, len / 2 + 0.02, 1.3, 0.3); b.box(0.08, 2.4, 0.08, 0x666666, len / 2 + 0.02, 1.3, -0.3);
  return b.build();
}

/** Íconos 3D de potenciadores. @param {string} type */
export function powerGeo(type) {
  const b = new Builder();
  if (type === 'nitro') { b.cyl(0.38, 0.38, 1.0, 10, 0xff7a1a, 0, 0, 0); b.cyl(0.18, 0.25, 0.25, 8, 0xdddddd, 0, 0.62, 0); b.box(0.8, 0.12, 0.8, 0x222222, 0, -0.1, 0); b.cone(0.22, 0.4, 6, 0xffe14a, 0, 0.2, 0.39, Math.PI / 2); }
  else if (type === 'iman') { b.add(new THREE.TorusGeometry(0.45, 0.16, 6, 12, Math.PI), 0xff3b5c, [0, 0.1, 0]); b.box(0.32, 0.3, 0.32, 0xdddddd, 0.45, -0.1, 0); b.box(0.32, 0.3, 0.32, 0xdddddd, -0.45, -0.1, 0); }
  else if (type === 'escudo') { b.add(new THREE.IcosahedronGeometry(0.55, 0), 0x3ec8ff); b.add(new THREE.IcosahedronGeometry(0.3, 0), 0xc8f4ff, [0, 0, 0.3]); }
  else if (type === 'trampa') { b.add(new THREE.IcosahedronGeometry(0.36, 0), 0x444444); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.cone(0.1, 0.4, 4, 0xffe14a, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0, 0, 0, a - Math.PI / 2); } }
  else { b.box(0.18, 0.9, 0.14, 0x4dff88, 0, 0, 0, 0, 0, 0.6); b.cyl(0.24, 0.24, 0.14, 6, 0x4dff88, 0.26, 0.38, 0, Math.PI / 2); b.box(0.5, 0.5, 0.05, 0xffffff, 0, 0, -0.12); }
  return b.build();
}

/** Mina/trampa en el piso. */
export function mineGeo() {
  const b = new Builder();
  b.cyl(0.6, 0.7, 0.25, 10, 0x333333, 0, 0.12, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.cone(0.1, 0.35, 4, 0xffe14a, Math.cos(a) * 0.45, 0.35, Math.sin(a) * 0.45); }
  b.sphere(0.14, 0xff3030, 0, 0.3, 0, 1, 1, 1, 0);
  return b.build();
}
