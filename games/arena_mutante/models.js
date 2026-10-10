// @ts-check
/* Modelos low-poly procedurales (geometrías fusionadas con color por vértice). Sin assets externos.
   Cada personaje animado se arma en partes con el origen en su articulación (cadera, hombro, cuello). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

/** Constructor de geometría: acumula primitivas con color y transformación y las fusiona. */
export class GB {
  constructor() { /** @type {THREE.BufferGeometry[]} */ this.list = []; }
  /** @param {THREE.BufferGeometry} g @param {number} color @param {number[]} [p] @param {number[]} [r] @param {number[]} [s] */
  add(g, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], jitter = 0) {
    let geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    geo.deleteAttribute('uv');
    _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); _s.set(s[0], s[1], s[2]); _p.set(p[0], p[1], p[2]);
    _m.compose(_p, _q, _s); geo.applyMatrix4(_m);
    const n = geo.getAttribute('position').count, col = new Float32Array(n * 3);
    _c.setHex(color);
    for (let i = 0; i < n; i += 3) {
      const j = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      for (let k = 0; k < 3; k++) { const o = (i + k) * 3; col[o] = _c.r * j; col[o + 1] = _c.g * j; col[o + 2] = _c.b * j; }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.list.push(geo);
    return this;
  }
  box(w, h, d, color, p, r, jitter = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, p, r, [1, 1, 1], jitter); }
  cyl(rt, rb, h, seg, color, p, r, s) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, p, r, s); }
  sph(rad, color, p, s, seg = 7) { return this.add(new THREE.IcosahedronGeometry(rad, seg > 6 ? 1 : 0), color, p, [0, 0, 0], s); }
  cone(rad, h, seg, color, p, r, s) { return this.add(new THREE.ConeGeometry(rad, h, seg), color, p, r, s); }
  tor(rad, tube, color, p, r, seg = 10) { return this.add(new THREE.TorusGeometry(rad, tube, 4, seg), color, p, r); }
  build() {
    const g = this.list.length ? mergeGeometries(this.list, false) : new THREE.BufferGeometry();
    this.list.forEach(x => x.dispose()); this.list = [];
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

/* ======================= sobreviviente ======================= */
/** @param {{suit:number, vest:number, skin?:number, helmet:number, visor:number}} c */
export function buildHuman(c) {
  const body = new GB();
  // torso con chaleco, mochila y casco con visor de máscara
  body.box(0.56, 0.62, 0.32, c.suit, [0, 1.2, 0]);
  body.box(0.6, 0.42, 0.36, c.vest, [0, 1.26, 0.01]);
  body.box(0.12, 0.08, 0.37, 0xd9a020, [0.16, 1.4, 0.01]);
  body.box(0.44, 0.5, 0.2, 0x3a3f2a, [0, 1.25, -0.26]);
  body.cyl(0.07, 0.07, 0.5, 6, 0x556040, [0.16, 1.25, -0.37]);
  body.box(0.5, 0.14, 0.3, 0x2a2a2a, [0, 0.9, 0]);
  body.box(0.14, 0.12, 0.14, c.skin ?? 0xc89070, [0, 1.56, 0]);
  body.sph(0.21, c.helmet, [0, 1.75, 0], [1, 0.95, 1.05]);
  body.box(0.3, 0.13, 0.12, c.visor, [0, 1.74, 0.17]);
  body.cyl(0.06, 0.07, 0.1, 6, 0x333333, [0, 1.63, 0.2], [Math.PI / 2, 0, 0]);
  const leg = new GB();
  leg.box(0.2, 0.46, 0.22, c.suit, [0, -0.23, 0]);
  leg.box(0.18, 0.4, 0.2, 0x2f3329, [0, -0.62, 0]);
  leg.box(0.22, 0.12, 0.32, 0x1f1f1f, [0, -0.83, 0.05]);
  const legG = leg.build();
  // brazos + rifle como una pieza (pivote en los hombros: sigue el ángulo de apuntado)
  const gun = new GB();
  gun.box(0.14, 0.14, 0.42, c.suit, [0.26, -0.06, 0.18], [0, -0.25, 0]);
  gun.box(0.14, 0.14, 0.4, c.suit, [-0.18, -0.08, 0.26], [0, 0.55, 0]);
  gun.box(0.11, 0.11, 0.12, c.skin ?? 0xc89070, [0.12, -0.08, 0.44]);
  gun.box(0.1, 0.16, 0.86, 0x2b2f33, [0.12, -0.04, 0.52]);
  gun.box(0.08, 0.08, 0.3, 0x50565c, [0.12, 0.02, 1.02]);
  gun.box(0.06, 0.2, 0.08, 0x2b2f33, [0.12, -0.16, 0.36]);
  gun.box(0.05, 0.05, 0.05, 0xa6ff2e, [0.12, 0.06, 1.12]);
  gun.box(0.09, 0.07, 0.24, 0x1f2326, [0.12, 0.09, 0.5]);
  gun.box(0.14, 0.18, 0.14, 0xa6ff2e, [0.12, -0.12, 0.6]);
  return { body: body.build(), leg: legG, gun: gun.build(), legPivot: [0.13, 0.92, 0], gunPivot: [0.0, 1.42, 0.05], muzzle: new THREE.Vector3(0.12, 0.02, 1.2) };
}

/* ======================= mutantes ======================= */
/** Devuelve partes {geo, pivot:[x,y,z]} para instanciar. */
export function buildRunner() {
  const flesh = 0x9aa86a, dark = 0x5d6b3a, glow = 0xb6ff3a, bone = 0xd8d0b0;
  const body = new GB();
  body.box(0.42, 0.5, 0.36, flesh, [0, 1.05, 0.05], [0.5, 0, 0], 0.15);
  body.box(0.34, 0.3, 0.3, dark, [0, 0.78, -0.02], [0.2, 0, 0]);
  body.sph(0.17, flesh, [0, 1.32, 0.3], [1, 0.9, 1.25]);
  body.box(0.18, 0.06, 0.06, glow, [0, 1.36, 0.47]);
  body.cone(0.05, 0.22, 4, bone, [0.1, 1.25, -0.08], [-1.2, 0, 0.3]);
  body.cone(0.05, 0.2, 4, bone, [-0.1, 1.2, -0.06], [-1.1, 0, -0.3]);
  body.cone(0.04, 0.18, 4, bone, [0, 1.12, -0.1], [-1.3, 0, 0]);
  const arm = new GB();
  arm.box(0.11, 0.62, 0.11, flesh, [0, -0.31, 0], undefined, 0.2);
  arm.box(0.13, 0.14, 0.16, dark, [0, -0.66, 0.04]);
  arm.cone(0.03, 0.18, 4, bone, [0, -0.78, 0.12], [1.2, 0, 0]);
  const leg = new GB();
  leg.box(0.14, 0.42, 0.15, dark, [0, -0.2, 0.04], [-0.2, 0, 0]);
  leg.box(0.12, 0.36, 0.12, flesh, [0, -0.55, -0.04], [0.3, 0, 0]);
  leg.box(0.14, 0.06, 0.24, dark, [0, -0.74, 0.04]);
  const a = arm.build(), l = leg.build();
  return {
    body: { geo: body.build(), pivot: [0, 0, 0] },
    armL: { geo: a, pivot: [0.26, 1.22, 0.18] }, armR: { geo: a, pivot: [-0.26, 1.22, 0.18] },
    legL: { geo: l, pivot: [0.13, 0.76, 0] }, legR: { geo: l, pivot: [-0.13, 0.76, 0] },
  };
}
export function buildBrute() {
  const flesh = 0x8a6a5a, dark = 0x4e3a30, plate = 0x6b6f72, glow = 0xff7a2a, tumor = 0xc6ff4a;
  const body = new GB();
  body.box(1.3, 1.0, 0.9, flesh, [0, 1.75, 0], [0.15, 0, 0], 0.12);
  body.box(1.0, 0.6, 0.7, dark, [0, 1.15, 0]);
  body.box(1.12, 0.62, 0.22, plate, [0, 1.85, 0.45], [0.15, 0, 0]); // placa frontal (blindaje)
  body.box(0.5, 0.16, 0.06, 0x2a2a2a, [0, 1.62, 0.57], [0.15, 0, 0]);
  body.sph(0.24, flesh, [0, 2.38, 0.32], [1, 0.85, 1]);
  body.box(0.22, 0.05, 0.05, glow, [0, 2.4, 0.53]);
  body.sph(0.36, tumor, [0.05, 1.95, -0.48], [1.1, 1, 0.8]); // tumor dorsal = punto débil
  body.sph(0.2, tumor, [-0.3, 2.15, -0.38]);
  const arm = new GB();
  arm.box(0.38, 0.9, 0.4, flesh, [0, -0.45, 0], undefined, 0.12);
  arm.box(0.48, 0.5, 0.5, dark, [0, -1.05, 0.05]);
  arm.box(0.52, 0.18, 0.54, plate, [0, -1.28, 0.05]);
  const leg = new GB();
  leg.box(0.4, 0.7, 0.42, dark, [0, -0.35, 0]);
  leg.box(0.46, 0.12, 0.6, 0x2a2420, [0, -0.78, 0.08]);
  const a = arm.build(), l = leg.build();
  return {
    body: { geo: body.build(), pivot: [0, 0, 0] },
    armL: { geo: a, pivot: [0.82, 2.05, 0.05] }, armR: { geo: a, pivot: [-0.82, 2.05, 0.05] },
    legL: { geo: l, pivot: [0.3, 0.84, 0] }, legR: { geo: l, pivot: [-0.3, 0.84, 0] },
  };
}
export function buildSpitter() {
  const flesh = 0xa7b08a, dark = 0x5a6040, sack = 0x8dff3a, glow = 0xe8ff6a;
  const body = new GB();
  body.box(0.5, 0.5, 0.4, flesh, [0, 1.05, 0], [0.15, 0, 0], 0.1);
  body.sph(0.2, flesh, [0, 1.48, 0.1], [1, 1.1, 1]);
  body.box(0.26, 0.08, 0.1, 0x2a1a10, [0, 1.38, 0.28]);
  body.box(0.08, 0.05, 0.05, glow, [0.07, 1.55, 0.26]);
  body.box(0.08, 0.05, 0.05, glow, [-0.07, 1.55, 0.26]);
  body.sph(0.34, sack, [0, 1.22, -0.38], [1, 1.2, 1]); // saco tóxico (se infla al escupir)
  body.sph(0.18, sack, [0.24, 1.5, -0.3]);
  body.sph(0.14, sack, [-0.22, 1.42, -0.42]);
  body.box(0.4, 0.3, 0.34, dark, [0, 0.72, 0]);
  const arm = new GB();
  arm.box(0.12, 0.5, 0.12, flesh, [0, -0.25, 0]);
  arm.sph(0.1, dark, [0, -0.52, 0.03]);
  const leg = new GB();
  leg.box(0.16, 0.36, 0.17, dark, [0, -0.18, 0]);
  leg.box(0.14, 0.3, 0.14, flesh, [0, -0.46, 0]);
  leg.box(0.16, 0.06, 0.24, dark, [0, -0.62, 0.04]);
  const a = arm.build(), l = leg.build();
  return {
    body: { geo: body.build(), pivot: [0, 0, 0] },
    armL: { geo: a, pivot: [0.32, 1.22, 0.05] }, armR: { geo: a, pivot: [-0.32, 1.22, 0.05] },
    legL: { geo: l, pivot: [0.13, 0.65, 0] }, legR: { geo: l, pivot: [-0.13, 0.65, 0] },
  };
}
export function buildStalker() {
  const skin = 0x6a7a8a, dark = 0x3a4450, eye = 0xff2a3a;
  const body = new GB();
  body.box(0.34, 0.7, 0.24, skin, [0, 1.45, 0], [0.25, 0, 0]);
  body.box(0.26, 0.3, 0.2, dark, [0, 1.0, 0]);
  body.cone(0.2, 0.45, 5, skin, [0, 1.98, 0.18], [1.3, 0, 0]);
  body.box(0.07, 0.04, 0.04, eye, [0.08, 1.98, 0.36]);
  body.box(0.07, 0.04, 0.04, eye, [-0.08, 1.98, 0.36]);
  const arm = new GB();
  arm.box(0.08, 0.8, 0.08, skin, [0, -0.4, 0]);
  arm.cone(0.05, 0.4, 3, 0xd8d8e8, [0, -0.95, 0.06], [Math.PI, 0, 0]);
  const leg = new GB();
  leg.box(0.1, 0.55, 0.1, dark, [0, -0.27, 0.06], [-0.25, 0, 0]);
  leg.box(0.09, 0.5, 0.09, skin, [0, -0.72, -0.06], [0.3, 0, 0]);
  const a = arm.build(), l = leg.build();
  return {
    body: { geo: body.build(), pivot: [0, 0, 0] },
    armL: { geo: a, pivot: [0.24, 1.72, 0.08] }, armR: { geo: a, pivot: [-0.24, 1.72, 0.08] },
    legL: { geo: l, pivot: [0.1, 1.0, 0] }, legR: { geo: l, pivot: [-0.1, 1.0, 0] },
  };
}

/* ======================= Coloso Radiactivo ======================= */
export function buildColossus() {
  const flesh = 0x6f7a5a, dark = 0x3e4632, plate = 0x5a5f63, rust = 0x8a4a22, glow = 0x9dff2a;
  const body = new GB();
  body.box(3.6, 2.6, 2.4, flesh, [0, 6.2, 0], [0.12, 0, 0], 0.15);
  body.box(2.8, 1.6, 2.0, dark, [0, 4.6, 0]);
  body.box(2.6, 1.2, 0.5, plate, [-0.4, 6.8, 1.2], [0.12, 0, 0.1]);
  body.box(1.2, 0.8, 0.4, rust, [1.1, 5.9, 1.25], [0.1, 0, -0.1]);
  body.sph(0.75, flesh, [0, 7.9, 0.9], [1, 0.85, 1]);
  body.box(0.9, 0.18, 0.12, glow, [0, 7.95, 1.55]);
  body.box(0.6, 0.3, 0.3, 0x1a1a14, [0, 7.55, 1.5]);
  for (let i = 0; i < 6; i++) body.cone(0.18, 0.9, 4, 0xd8d0a0, [-1.4 + i * 0.56, 7.5, -0.9], [-0.7, 0, 0]);
  const arm = new GB();
  arm.box(1.1, 2.6, 1.1, flesh, [0, -1.3, 0], undefined, 0.12);
  arm.box(1.3, 1.4, 1.3, dark, [0, -3.1, 0.1]);
  arm.box(1.4, 0.4, 1.4, plate, [0, -3.8, 0.1]);
  arm.cone(0.2, 0.7, 4, 0xd8d0a0, [0.4, -3.4, 0.7], [1.2, 0, 0]);
  const leg = new GB();
  leg.box(1.2, 2.0, 1.2, dark, [0, -1.0, 0]);
  leg.box(1.0, 1.4, 1.0, flesh, [0, -2.6, 0]);
  leg.box(1.4, 0.4, 1.8, 0x2a2420, [0, -3.4, 0.25]);
  return {
    body: body.build(), arm: arm.build(), leg: leg.build(),
    armPivot: [2.3, 7.0, 0], legPivot: [0.85, 3.6, 0],
  };
}
/** Tanque radiactivo (punto débil de la fase 1). */
export function buildTank() {
  const g = new GB();
  g.cyl(0.5, 0.5, 1.4, 8, 0x4a5a3a, [0, 0, 0]);
  g.cyl(0.42, 0.42, 1.0, 8, 0x9dff2a, [0, 0, 0]);
  g.cyl(0.55, 0.55, 0.12, 8, 0x2a2a2a, [0, 0.66, 0]);
  g.cyl(0.55, 0.55, 0.12, 8, 0x2a2a2a, [0, -0.66, 0]);
  return g.build();
}
/** Núcleo expuesto del pecho (fase 2-3). */
export function buildCore() {
  const g = new GB();
  g.sph(0.7, 0xc8ff4a, [0, 0, 0], [1, 1, 0.7]);
  g.tor(0.85, 0.12, 0x3a3a2a, [0, 0, 0], [0, 0, 0], 10);
  return g.build();
}

/* ======================= escenario ======================= */
export function buildBarricade() {
  const g = new GB();
  g.box(2.4, 0.9, 0.18, 0x6a6f74, [0, 0.55, 0.12], [-0.12, 0, 0], 0.1);
  g.box(2.4, 0.12, 0.2, 0xd9a020, [0, 0.95, 0.07], [-0.12, 0, 0]);
  for (let i = 0; i < 4; i++) g.box(0.6, 0.32, 0.4, 0x8a7a50, [-0.9 + i * 0.6, 0.16, -0.18], [0, (i % 2) * 0.1, 0], 0.12);
  g.box(0.08, 1.2, 0.08, 0x3a3a3a, [-1.05, 0.6, 0.25]);
  g.box(0.08, 1.2, 0.08, 0x3a3a3a, [1.05, 0.6, 0.25]);
  return g.build();
}
export function buildCover(kind) {
  const g = new GB();
  if (kind === 'bunker') {
    g.box(1.5, 0.75, 1.1, 0x6a4a2a, [0, 0.375, 0], [0, 0.05, 0], 0.15);
    g.box(1.3, 0.55, 0.9, 0x7a5a32, [0.1, 1.02, 0], [0, -0.1, 0], 0.15);
    g.box(1.52, 0.08, 1.12, 0xd9a020, [0, 0.72, 0]);
  } else if (kind === 'estacion') {
    g.box(1.7, 1.2, 0.9, 0x5a646e, [0, 0.6, 0]);
    g.box(1.75, 0.1, 0.95, 0x2ee6ff, [0, 1.0, 0]);
    g.box(0.5, 0.3, 0.5, 0x3a4450, [0.4, 1.35, 0]);
  } else {
    g.box(1.6, 1.0, 0.9, 0xe8eeea, [0, 0.5, 0]);
    g.box(1.62, 0.1, 0.92, 0x8b5cf6, [0, 0.85, 0]);
    g.cyl(0.25, 0.25, 0.5, 8, 0x7dff3a, [0.4, 1.25, 0]);
    g.cyl(0.25, 0.25, 0.5, 8, 0x38c8ff, [-0.35, 1.25, 0.1]);
  }
  return g.build();
}
export function buildCrate() {
  const base = new GB();
  base.box(1.1, 0.6, 0.8, 0x3d5a2a, [0, 0.3, 0], undefined, 0.08);
  for (const x of [-0.45, 0.45]) base.box(0.08, 0.62, 0.82, 0xd9a020, [x, 0.3, 0]);
  base.box(0.3, 0.2, 0.02, 0xffffff, [0, 0.35, 0.41]);
  base.box(0.12, 0.12, 0.03, 0xd8232a, [0, 0.35, 0.42]);
  const lid = new GB();
  lid.box(1.14, 0.14, 0.84, 0x2f4a20, [0, 0.07, 0.42]);
  lid.box(0.3, 0.06, 0.1, 0xa6ff2e, [0, 0.15, 0.78]);
  return { base: base.build(), lid: lid.build(), lidPivot: [0, 0.6, -0.42] };
}
export function buildGenerator() {
  const g = new GB();
  g.box(1.5, 0.3, 1.2, 0x2a2a2a, [0, 0.15, 0]);
  g.box(1.3, 1.1, 1.0, 0x6a7a3a, [0, 0.85, 0], undefined, 0.06);
  g.box(1.32, 0.12, 1.02, 0xd9a020, [0, 1.25, 0]);
  g.cyl(0.18, 0.18, 0.8, 8, 0x5a5a5a, [0.45, 1.75, -0.2]);
  g.box(0.5, 0.4, 0.06, 0x1a1a1a, [-0.25, 0.95, 0.52]);
  g.box(0.12, 0.6, 0.12, 0x3a3a3a, [-0.6, 1.6, 0.35]);
  const wheel = new GB();
  wheel.tor(0.36, 0.07, 0x9a9a9a, [0, 0, 0], [0, Math.PI / 2, 0], 10);
  wheel.box(0.06, 0.66, 0.06, 0x9a9a9a, [0, 0, 0]);
  wheel.box(0.06, 0.06, 0.66, 0x9a9a9a, [0, 0, 0]);
  return { base: g.build(), wheel: wheel.build(), wheelPos: [0.7, 0.95, 0] };
}
export function buildWorkbench() {
  const g = new GB();
  g.box(1.8, 0.1, 0.9, 0x6a4a2a, [0, 0.9, 0]);
  for (const x of [-0.8, 0.8]) for (const z of [-0.36, 0.36]) g.box(0.08, 0.9, 0.08, 0x3a3a3a, [x, 0.45, z]);
  g.box(0.6, 0.4, 0.06, 0x1a2a1a, [-0.4, 1.25, -0.3], [-0.3, 0, 0]);
  g.box(0.5, 0.3, 0.02, 0xa6ff2e, [-0.4, 1.25, -0.27], [-0.3, 0, 0]);
  g.box(0.5, 0.12, 0.2, 0x2b2f33, [0.35, 1.02, 0.05], [0, 0.3, 0]);
  g.box(0.15, 0.2, 0.15, 0xd8232a, [0.7, 1.05, -0.2]);
  g.cyl(0.03, 0.03, 0.4, 5, 0x9a9a9a, [0.1, 0.98, 0.25], [0, 0, Math.PI / 2]);
  return g.build();
}
export function buildTerminal() {
  const g = new GB();
  g.box(0.9, 1.1, 0.6, 0x4a4f58, [0, 0.55, 0]);
  g.box(0.8, 0.5, 0.1, 0x1a2228, [0, 1.25, 0.12], [-0.4, 0, 0]);
  g.box(0.66, 0.36, 0.02, 0x38c8ff, [0, 1.26, 0.18], [-0.4, 0, 0]);
  g.cyl(0.03, 0.03, 1.2, 5, 0x9a9a9a, [0.35, 1.7, -0.2]);
  g.sph(0.06, 0xff3a3a, [0.35, 2.32, -0.2]);
  return g.build();
}
/** Trampa: base (consola + rejilla) según tipo. */
export function buildTrap(kind) {
  const g = new GB();
  g.box(2.6, 0.06, 2.6, 0x2a2a2a, [0, 0.03, 0]);
  for (let i = -1; i <= 1; i++) g.box(2.5, 0.07, 0.12, 0xd9a020, [0, 0.05, i * 0.8]);
  if (kind === 'vapor') {
    for (const [x, z] of [[-0.8, -0.8], [0.8, 0.8], [0.8, -0.8], [-0.8, 0.8]]) g.cyl(0.14, 0.18, 0.3, 6, 0x6a5a4a, [x, 0.15, z]);
    g.box(0.4, 1.0, 0.3, 0x5a4a3a, [1.5, 0.5, 0]);
  } else if (kind === 'tesla') {
    g.cyl(0.15, 0.3, 2.2, 6, 0x5a646e, [0, 1.1, 0]);
    for (let i = 0; i < 4; i++) g.tor(0.32 - i * 0.04, 0.05, 0xc87a3a, [0, 0.6 + i * 0.35, 0], [Math.PI / 2, 0, 0], 8);
    g.sph(0.28, 0x9adfff, [0, 2.4, 0]);
    g.box(0.4, 1.0, 0.3, 0x3a4450, [1.5, 0.5, 0]);
  } else {
    g.cyl(0.08, 0.08, 2.6, 6, 0xd8e2de, [0, 1.3, 0]);
    g.cyl(0.4, 0.2, 0.2, 8, 0x8b5cf6, [0, 2.6, 0]);
    g.box(0.4, 1.0, 0.3, 0xd8e2de, [1.5, 0.5, 0]);
  }
  g.box(0.3, 0.2, 0.04, 0x1a1a1a, [1.5, 0.85, 0.16]);
  return g.build();
}
/** Puerta de dos hojas: marco fijo + hoja (una geometría para ambas hojas). */
export function buildDoorParts(width, pal) {
  const frame = new GB();
  frame.box(0.3, 3.6, 0.9, pal.wall2, [-width / 2 - 0.05, 1.8, 0]);
  frame.box(0.3, 3.6, 0.9, pal.wall2, [width / 2 + 0.05, 1.8, 0]);
  frame.box(width + 0.4, 0.5, 0.9, pal.wall2, [0, 3.35, 0]);
  const leaf = new GB();
  const w = width / 2;
  leaf.box(w, 3.1, 0.3, 0x6a6f74, [0, 1.55, 0], undefined, 0.05);
  for (let i = 0; i < 4; i++) leaf.box(w * 0.9, 0.12, 0.34, i % 2 ? 0x1a1a1a : 0xd9a020, [0, 0.4 + i * 0.16, 0]);
  leaf.box(w * 0.8, 0.5, 0.32, 0x4a4f54, [0, 2.2, 0]);
  return { frame: frame.build(), leaf: leaf.build() };
}
/** Transporte de extracción (VTOL). */
export function buildTransport() {
  const g = new GB();
  g.box(3.2, 2.0, 7.5, 0x5a6a52, [0, 1.6, 0], undefined, 0.05);
  g.box(2.6, 1.3, 2.2, 0x4a5a44, [0, 2.0, 4.6]);
  g.box(2.3, 0.6, 1.2, 0x7ac8ff, [0, 2.3, 5.4], [0.3, 0, 0]);
  g.box(9.5, 0.3, 2.0, 0x4a5a44, [0, 2.6, -0.5]);
  for (const x of [-4.4, 4.4]) { g.cyl(1.0, 1.0, 0.6, 10, 0x2a2a2a, [x, 2.8, -0.5]); g.cyl(0.85, 0.85, 0.62, 10, 0xff8a3a, [x, 2.8, -0.5]); }
  g.box(2.6, 0.2, 2.6, 0x3a3a3a, [0, 0.35, -4.6], [0.5, 0, 0]);
  g.box(3.3, 0.18, 0.2, 0xd9a020, [0, 2.6, 3.0]);
  g.box(0.3, 1.6, 1.6, 0x4a5a44, [0, 3.2, -3.4]);
  g.box(0.25, 0.25, 0.25, 0xff3a3a, [1.65, 2.6, 0]);
  g.box(0.25, 0.25, 0.25, 0x3aff6a, [-1.65, 2.6, 0]);
  return g.build();
}
/** Boca de mutantes según arena. */
export function buildSpawn(kind) {
  const g = new GB();
  if (kind === 'vent') {
    g.box(1.6, 0.08, 1.6, 0x2a1e14, [0, 0.04, 0]);
    for (let i = -2; i <= 2; i++) g.box(1.4, 0.1, 0.1, 0x6a4a2a, [0, 0.09, i * 0.28]);
  } else if (kind === 'hatch') {
    g.cyl(0.85, 0.85, 0.08, 10, 0x2a3038, [0, 0.04, 0]);
    g.cyl(0.65, 0.65, 0.1, 10, 0x14181c, [0, 0.06, 0]);
    g.box(1.4, 0.12, 0.12, 0xd9a020, [0, 0.1, 0]);
  } else {
    g.cyl(0.8, 0.9, 0.5, 10, 0x6f8a86, [0, 0.25, 0]);
    g.cyl(0.62, 0.62, 0.52, 10, 0x2a3a2a, [0, 0.27, 0]);
    for (let i = 0; i < 5; i++) g.cone(0.12, 0.5, 3, 0xbfe8ff, [Math.cos(i * 1.3) * 0.7, 0.6, Math.sin(i * 1.3) * 0.7], [0.3, i, 0.2]);
  }
  return g.build();
}
/** Decorado por arena (sin colisión, va contra las paredes). */
export function buildProps(kind) {
  const list = [];
  if (kind === 'bunker') {
    const a = new GB(); a.cyl(0.38, 0.38, 1.0, 8, 0x8a3a1a, [0, 0.5, 0]); a.cyl(0.4, 0.4, 0.08, 8, 0xd9a020, [0, 0.8, 0]); list.push(a.build());
    const b = new GB(); b.box(0.15, 3.4, 0.15, 0x6a5a4a, [0, 1.7, 0]); b.box(0.15, 0.15, 1.6, 0x6a5a4a, [0, 3.0, 0.7]); b.cyl(0.12, 0.12, 0.3, 6, 0xffb040, [0, 2.6, 0.2]); list.push(b.build());
    const c = new GB(); c.box(0.9, 0.5, 0.6, 0x5a4a32, [0, 0.25, 0]); c.box(0.6, 0.4, 0.5, 0x6a5a3a, [0.1, 0.7, 0], [0, 0.4, 0]); list.push(c.build());
  } else if (kind === 'estacion') {
    const a = new GB(); a.box(1.2, 1.6, 1.0, 0x4a5662, [0, 0.8, 0]); for (let i = 0; i < 4; i++) a.box(1.25, 0.06, 1.05, 0x2a3038, [0, 0.4 + i * 0.3, 0]); a.cyl(0.12, 0.12, 0.6, 6, 0xc87a3a, [0.3, 1.9, 0]); a.cyl(0.12, 0.12, 0.6, 6, 0xc87a3a, [-0.3, 1.9, 0]); list.push(a.build());
    const b = new GB(); b.box(0.12, 3.6, 0.12, 0x5a646e, [0, 1.8, 0]); b.box(1.6, 0.12, 0.12, 0x5a646e, [0, 3.4, 0]); b.sph(0.1, 0x9adfff, [0.7, 3.25, 0]); b.sph(0.1, 0x9adfff, [-0.7, 3.25, 0]); list.push(b.build());
    const c = new GB(); c.cyl(0.4, 0.4, 0.9, 8, 0x3a6a8a, [0, 0.45, 0]); c.cyl(0.42, 0.42, 0.06, 8, 0xd9a020, [0, 0.7, 0]); list.push(c.build());
  } else {
    const a = new GB(); a.cyl(0.45, 0.45, 0.25, 10, 0x6f8a86, [0, 0.12, 0]); a.cyl(0.4, 0.4, 2.0, 10, 0x9fffd0, [0, 1.25, 0]); a.sph(0.25, 0x5a7a4a, [0, 1.2, 0], [1, 1.6, 1]); a.cyl(0.45, 0.45, 0.25, 10, 0x6f8a86, [0, 2.35, 0]); list.push(a.build());
    const b = new GB(); b.box(1.2, 1.0, 0.6, 0xd8e2de, [0, 0.5, 0]); b.box(1.0, 0.5, 0.04, 0x38c8ff, [0, 1.3, 0], [-0.2, 0, 0]); b.box(0.2, 0.2, 0.2, 0x8b5cf6, [0.4, 1.1, 0.1]); list.push(b.build());
    const c = new GB(); c.cyl(0.3, 0.3, 0.9, 8, 0x8b5cf6, [0, 0.45, 0]); c.cyl(0.31, 0.31, 0.12, 8, 0xd9a020, [0, 0.6, 0]); list.push(c.build());
  }
  return list;
}
export function buildAntidote() {
  const g = new GB();
  g.cyl(0.35, 0.4, 0.5, 8, 0x6f8a86, [0, 0.25, 0]);
  g.cyl(0.13, 0.13, 0.45, 8, 0x7dff3a, [0, 0.75, 0]);
  g.cyl(0.08, 0.08, 0.12, 6, 0xffffff, [0, 1.03, 0]);
  return g.build();
}
export function buildGrate() {
  const g = new GB();
  g.box(1.9, 3.6, 0.2, 0x6f8a86, [0, 1.8, 0]);
  for (let i = 0; i < 6; i++) g.box(1.7, 0.1, 0.3, 0x3a4a48, [0, 0.5 + i * 0.5, 0]);
  return g.build();
}
export function buildBeacon() {
  const g = new GB();
  g.cyl(0.4, 0.6, 0.4, 8, 0x3a3a3a, [0, 0.2, 0]);
  g.cyl(0.08, 0.08, 2.2, 6, 0x9a9a9a, [0, 1.3, 0]);
  g.sph(0.22, 0xff3a3a, [0, 2.45, 0]);
  return g.build();
}
