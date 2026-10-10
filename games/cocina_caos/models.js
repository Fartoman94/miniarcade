// @ts-check
/* Cocina del Caos — modelos low-poly procedurales (sin assets externos).
   Primitivas fusionadas con colores por vértice: un objeto estático = 1 draw call. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- materiales compartidos ---------- */
export const MAT = {
  base: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0.02 }),
  shiny: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35, metalness: 0.45 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  lava: new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }),
  water: new THREE.MeshStandardMaterial({ color: 0x7cc8f0, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.1 }),
  hl: new THREE.MeshBasicMaterial({ color: 0xff5c7a, toneMapped: false, transparent: true, opacity: 0.95, depthTest: false }),
  hlFill: new THREE.MeshBasicMaterial({ color: 0xff5c7a, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
  guide: new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  danger: new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  fire: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  puddle: new THREE.MeshStandardMaterial({ color: 0x8a5a2b, transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  ring: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
  push: new THREE.MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }),
};

/* ---------- constructor de geometrías fusionadas ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
export class Builder {
  constructor() { /** @type {THREE.BufferGeometry[]} */ this.parts = []; }
  add(geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e);
    _m.compose(_p.set(p[0], p[1], p[2]), _q, _s.set(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    _c.set(/** @type {any} */ (color));
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  box(w, h, d, color, p, r) { return this.add(new THREE.BoxGeometry(w, h, d), color, p, r); }
  cyl(rt, rb, h, seg, color, p, r, s) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, p, r, s); }
  cone(rad, h, seg, color, p, r, s) { return this.add(new THREE.ConeGeometry(rad, h, seg), color, p, r, s); }
  ball(rad, color, p, s, detail = 0, r) { return this.add(new THREE.IcosahedronGeometry(rad, detail), color, p, r, s); }
  torus(rad, tube, color, p, r, seg = 10, rs = 5) { return this.add(new THREE.TorusGeometry(rad, tube, rs, seg), color, p, r); }
  get empty() { return this.parts.length === 0; }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}
export function mesh(geo, mat = MAT.base, cast = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; }

/* ======================= paleta ======================= */
export const C = {
  skin: 0xf2c49b, skin2: 0xc98b5e, skin3: 0x8d5a3b, white: 0xf8f6f0, cream: 0xf1e6cc, dark: 0x22222a, red: 0xe0453a, pink: 0xff5c7a,
  steel: 0xb8c2cc, steel2: 0x7d8792, black: 0x26262c, gold: 0xf5c542, wood: 0xb07a4a, woodDark: 0x76502f, green: 0x5bbf4a,
};
/** Colores por tema de cocina. */
export const THEMES = {
  taberna: { floorA: 0xb98a5a, floorB: 0xa6784b, wall: 0x9d927f, wall2: 0x7f7565, counter: 0x8a5a34, top: 0xd8b78a, trim: 0x5e3b20,
    sky: 0x2b1d14, fog: 0x2b1d14, hemiSky: 0xffe2b8, hemiGround: 0x4a3322, sun: 0xffd8a0, accentLight: 0xff9a4a, puddle: 0xa86a28 },
  volcan: { hemiI: 1.9, floorA: 0x5e5052, floorB: 0x4e4244, wall: 0x3a2e30, wall2: 0x5a3a30, counter: 0x55474c, top: 0x968a8c, trim: 0xb8662e,
    sky: 0x1a0a08, fog: 0x2a0c06, hemiSky: 0xffb08a, hemiGround: 0x3a120a, sun: 0xffa060, accentLight: 0xff5a1a, puddle: 0x2a2018 },
  espacial: { floorA: 0xdfe8f2, floorB: 0xc9d6e4, wall: 0xe8eef5, wall2: 0x9fb2c8, counter: 0xd5dee8, top: 0xf6f9fc, trim: 0x37c6e8,
    sky: 0x050816, fog: 0x0a1028, hemiSky: 0xdcefff, hemiGround: 0x3a4660, sun: 0xffffff, accentLight: 0x5ef0ff, puddle: 0x6cff6a },
};

/* ======================= personajes ======================= */
/** Chef/ayudante/cliente low-poly con brazos y piernas separados. */
export function makePerson(o = {}) {
  const skin = o.skin ?? C.skin, top = o.top ?? C.white, bottom = o.bottom ?? 0x34343c;
  const group = new THREE.Group();
  const b = new Builder();
  b.cyl(0.25, 0.3, 0.62, 10, top, [0, 1.02, 0]).cyl(0.29, 0.27, 0.22, 10, bottom, [0, 0.68, 0]);
  if (o.apron) b.box(0.4, 0.52, 0.05, o.apron, [0, 0.86, 0.26]);
  if (o.buttons) b.ball(0.035, o.buttons, [0.08, 1.18, 0.25]).ball(0.035, o.buttons, [0.08, 1.04, 0.27]).ball(0.035, o.buttons, [-0.08, 1.18, 0.25]).ball(0.035, o.buttons, [-0.08, 1.04, 0.27]);
  if (o.scarf) b.torus(0.2, 0.06, o.scarf, [0, 1.33, 0], [Math.PI / 2, 0, 0]);
  // cabeza
  b.ball(0.28, skin, [0, 1.6, 0], [1, 1.04, 1], 1);
  b.ball(0.045, C.dark, [0.1, 1.64, 0.25]).ball(0.045, C.dark, [-0.1, 1.64, 0.25]);
  b.ball(0.055, o.nose ?? 0xe8977f, [0, 1.58, 0.28]);
  if (o.mustache) b.box(0.24, 0.05, 0.05, o.hair ?? 0x5a3420, [0, 1.52, 0.26]);
  if (o.antenna) b.cyl(0.015, 0.015, 0.3, 4, 0x9aa, [0.12, 1.95, 0]).ball(0.05, o.antenna, [0.12, 2.1, 0]).cyl(0.015, 0.015, 0.3, 4, 0x9aa, [-0.12, 1.95, 0]).ball(0.05, o.antenna, [-0.12, 2.1, 0]);
  if (o.ears) b.cone(0.1, 0.32, 4, skin, [0.3, 1.66, 0], [0, 0, -1.2]).cone(0.1, 0.32, 4, skin, [-0.3, 1.66, 0], [0, 0, 1.2]);
  if (o.hair !== undefined && !o.bald) b.ball(0.29, o.hair, [0, 1.7, -0.05], [1.02, 0.8, 1.02], 1);
  const body = mesh(b.build());
  group.add(body);
  // sombrero aparte (el gorro dorado se cambia en caliente)
  const hat = new THREE.Group(); group.add(hat);
  const legGeo = new Builder().cyl(0.09, 0.08, 0.46, 6, bottom, [0, -0.23, 0]).box(0.17, 0.12, 0.27, 0x2a2a30, [0, -0.47, 0.04]).build();
  const legs = [-1, 1].map(sd => { const l = mesh(legGeo); l.position.set(0.13 * sd, 0.58, 0); group.add(l); return l; });
  const armGeo = new Builder().cyl(0.08, 0.07, 0.48, 6, top, [0, -0.22, 0]).ball(0.085, skin, [0, -0.48, 0]).build();
  const arms = [-1, 1].map(sd => { const a = mesh(armGeo); a.position.set(0.34 * sd, 1.28, 0); group.add(a); return a; });
  if (o.scale) group.scale.setScalar(o.scale);
  return { group, body, legs, arms, hat };
}
/** Gorro de chef (blanco o dorado). */
export function chefHatGeo(gold = false) {
  const col = gold ? C.gold : C.white;
  const b = new Builder().cyl(0.25, 0.25, 0.16, 12, gold ? 0xd9a520 : 0xe8e6e0, [0, 1.86, 0]);
  b.ball(0.2, col, [0, 2.06, 0], [1, 0.75, 1], 1).ball(0.17, col, [0.15, 2.02, 0.05], [1, 0.8, 1], 1).ball(0.17, col, [-0.15, 2.02, -0.04], [1, 0.8, 1], 1).ball(0.16, col, [0, 2.0, 0.16], [1, 0.8, 1], 1);
  if (gold) b.ball(0.06, C.red, [0, 1.88, 0.25]);
  return b.build();
}
export function makeChef(gold = false) {
  const p = makePerson({ top: C.white, bottom: 0x2f3542, apron: C.pink, buttons: 0x30303a, mustache: true, hair: 0x4a2a18, scarf: C.red });
  const hatMesh = mesh(chefHatGeo(gold)); p.hat.add(hatMesh);
  return { ...p, hatMesh };
}
export function makeHelper() {
  const p = makePerson({ skin: 0x8fd16a, top: 0xffa53a, bottom: 0x4a3a6a, apron: 0xfff3d6, ears: true, nose: 0x6cb04c, scale: 0.78 });
  const b = new Builder().ball(0.3, 0xff7a3a, [0, 1.78, -0.02], [1.05, 0.6, 1.05], 1).cone(0.08, 0.3, 5, 0xff7a3a, [0, 1.8, -0.32], [-1.2, 0, 0]);
  p.hat.add(mesh(b.build()));
  return p;
}
/** Comensal sentado (por tema y variante). */
export function makeCustomer(theme, i) {
  let o;
  if (theme === 'taberna') o = [{ top: 0x7a2f2f, hair: 0x6a3a1a, mustache: true }, { top: 0x3f6a9a, hair: 0xd9b25a }, { top: 0x5b7a3a, hair: 0x2a1a10, mustache: true }, { top: 0x8a5ab0, hair: 0xc0c0c0 }, { top: 0xb08a3a, hair: 0x7a3a1a }][i % 5];
  else if (theme === 'volcan') o = [{ skin: 0xff8a5a, top: 0x3a2a2a, ears: true, nose: 0xd05a3a }, { skin: 0x9a6a5a, top: 0xb8662e, hair: 0x222 }, { skin: 0xffb07a, top: 0x6a2a2a, ears: true, nose: 0xe07a4a }, { skin: 0xc98b5e, top: 0x2a2a2a, hair: 0xff5a1a }, { skin: 0xff8a5a, top: 0x5a3a2a, ears: true }][i % 5];
  else o = [{ skin: 0x8ae0c8, top: 0x3a5ab0, antenna: 0xff5c7a, bald: true }, { skin: 0xc8a8ff, top: 0xe8eef5, antenna: 0x5ef0ff, bald: true }, { skin: C.skin, top: 0x37c6e8, hair: 0x222 }, { skin: 0xffd27a, top: 0x6a3ab0, antenna: 0xffe066, bald: true }, { skin: 0x8ae0c8, top: 0xff7a3a, ears: true }][i % 5];
  const p = makePerson({ ...o, bottom: 0x30303a });
  if (theme === 'taberna' && i % 5 === 0) p.hat.add(mesh(new Builder().cone(0.3, 0.42, 5, C.gold, [0, 1.95, 0]).build()));
  return p;
}
/** Roedor travieso: cuerpo en gota, orejas rosas, cola larga. */
export function makeRat(space = false) {
  const body = space ? 0xcfd8e8 : 0x8a8a92, ear = 0xff9fb0;
  const b = new Builder();
  b.ball(0.2, body, [0, 0.17, 0], [0.9, 0.75, 1.35], 1).ball(0.12, body, [0, 0.2, 0.25], [0.9, 0.85, 1.1], 1);
  b.cyl(0.075, 0.075, 0.02, 8, ear, [0.09, 0.32, 0.22], [Math.PI / 2.4, 0, 0.3]).cyl(0.075, 0.075, 0.02, 8, ear, [-0.09, 0.32, 0.22], [Math.PI / 2.4, 0, -0.3]);
  b.ball(0.03, C.dark, [0.06, 0.24, 0.36]).ball(0.03, C.dark, [-0.06, 0.24, 0.36]).ball(0.03, ear, [0, 0.19, 0.4]);
  b.cyl(0.02, 0.012, 0.55, 4, ear, [0, 0.15, -0.42], [Math.PI / 2 - 0.25, 0, 0]);
  if (space) b.ball(0.24, 0xbfefff, [0, 0.24, 0.24], [1, 1, 1], 1);
  return mesh(b.build(), space ? MAT.shiny : MAT.base);
}

/* ======================= ingredientes (geometría por ingrediente y estado, cacheada) ======================= */
const ingCache = new Map();
export function ingGeo(ing, st) {
  const k = ing + ':' + st;
  if (ingCache.has(k)) return ingCache.get(k);
  const b = new Builder();
  if (st === 'quemado') {
    b.ball(0.17, 0x1d1a1a, [0, 0.12, 0], [1.2, 0.7, 1.1], 1).ball(0.08, 0x3a2a24, [0.08, 0.2, 0.05]).ball(0.07, 0x111, [-0.08, 0.18, -0.05]);
  } else if (ing === 'lechuga') {
    if (st === 'picado') for (let i = 0; i < 9; i++) b.box(0.1, 0.03, 0.08, i % 2 ? 0x7ad45a : 0x4fa83a, [Math.cos(i * 2.3) * 0.13, 0.04 + (i % 3) * 0.03, Math.sin(i * 2.3) * 0.13], [0.3, i, 0.2]);
    else b.ball(0.2, 0x5cba44, [0, 0.18, 0], [1, 0.85, 1], 1).ball(0.15, 0x8ade6a, [0.05, 0.25, 0.04], [1, 0.8, 1], 0);
  } else if (ing === 'tomate') {
    if (st === 'picado') for (let i = 0; i < 5; i++) b.cyl(0.08, 0.08, 0.04, 8, i % 2 ? 0xe33b2c : 0xf05a3a, [Math.cos(i * 1.3) * 0.11, 0.03 + i * 0.01, Math.sin(i * 1.3) * 0.11], [0.3, 0, 0.2]);
    else b.ball(0.16, 0xe8392b, [0, 0.16, 0], [1, 0.88, 1], 1).cone(0.07, 0.06, 5, 0x3f9a3a, [0, 0.31, 0]);
  } else if (ing === 'hongo') {
    if (st === 'picado') for (let i = 0; i < 6; i++) b.box(0.1, 0.03, 0.06, i % 2 ? 0xe9dccb : 0xb06a4a, [Math.cos(i * 1.7) * 0.12, 0.03, Math.sin(i * 1.7) * 0.12], [0, i, 0]);
    else b.cyl(0.06, 0.07, 0.14, 7, 0xf0e4d0, [0, 0.07, 0]).ball(0.16, 0xc4523a, [0, 0.18, 0], [1, 0.6, 1], 1).ball(0.03, C.white, [0.07, 0.25, 0.05]).ball(0.025, C.white, [-0.06, 0.24, -0.04]);
  } else if (ing === 'pan') {
    b.ball(0.18, 0xe0a050, [0, 0.12, 0], [1.1, 0.6, 1.1], 1).ball(0.03, 0xfff3d0, [0.05, 0.22, 0.04]).ball(0.03, 0xfff3d0, [-0.06, 0.21, -0.02]);
  } else if (ing === 'carne') {
    if (st === 'asado') b.cyl(0.17, 0.17, 0.08, 10, 0x7a3a1e, [0, 0.05, 0]).box(0.28, 0.01, 0.025, 0x3a1a0a, [0, 0.095, 0.05]).box(0.28, 0.01, 0.025, 0x3a1a0a, [0, 0.095, -0.05]);
    else b.cyl(0.17, 0.17, 0.08, 10, 0xe0606a, [0, 0.05, 0]).ball(0.05, 0xf8d0d0, [0.06, 0.09, 0.03], [1, 0.3, 1]);
  } else if (ing === 'queso') {
    if (st === 'picado') for (let i = 0; i < 8; i++) b.box(0.05, 0.05, 0.05, 0xffd23a, [Math.cos(i * 2.1) * 0.11, 0.03 + (i % 2) * 0.04, Math.sin(i * 2.1) * 0.11]);
    else b.cyl(0.18, 0.18, 0.14, 3, 0xffd23a, [0, 0.07, 0]).ball(0.03, 0xe0a820, [0.04, 0.14, 0.02], [1, 0.3, 1]);
  } else if (ing === 'papa') {
    if (st === 'asado') { b.cone(0.14, 0.2, 6, C.red, [0, 0.1, 0], [Math.PI, 0, 0]); for (let i = 0; i < 6; i++) b.box(0.03, 0.2, 0.03, 0xffd060, [Math.cos(i) * 0.06, 0.24, Math.sin(i) * 0.06], [0.2 * Math.cos(i), 0, 0.2 * Math.sin(i)]); }
    else if (st === 'picado') for (let i = 0; i < 7; i++) b.box(0.04, 0.04, 0.18, 0xf0dca0, [Math.cos(i * 1.9) * 0.09, 0.03 + (i % 2) * 0.04, Math.sin(i * 1.9) * 0.05], [0, i * 0.7, 0]);
    else b.ball(0.15, 0xb08850, [0, 0.12, 0], [1.25, 0.8, 0.9], 1).ball(0.02, 0x6a4a2a, [0.08, 0.18, 0.05]);
  } else if (ing === 'pescado') {
    const col = st === 'asado' ? 0xd9963a : 0x7aa8d8;
    if (st === 'picado') for (let i = 0; i < 4; i++) b.box(0.14, 0.05, 0.07, 0xff8a7a, [-0.12 + i * 0.08, 0.04, (i % 2) * 0.04], [0, 0.2, 0]).box(0.14, 0.012, 0.072, 0xffe0d8, [-0.12 + i * 0.08, 0.07, (i % 2) * 0.04], [0, 0.2, 0]);
    else b.ball(0.15, col, [0, 0.1, 0], [1.6, 0.7, 0.6], 1).cone(0.1, 0.14, 4, col, [-0.28, 0.1, 0], [0, 0, Math.PI / 2]).ball(0.025, C.dark, [0.17, 0.13, 0.06]);
  } else if (ing === 'arroz') {
    if (st === 'cocido') b.ball(0.15, 0xfafaf2, [0, 0.1, 0], [1.1, 0.7, 1.1], 1);
    else b.cyl(0.13, 0.15, 0.22, 8, 0xe8d8b0, [0, 0.11, 0]).cyl(0.08, 0.13, 0.06, 8, 0xd8c8a0, [0, 0.25, 0]);
  } else if (ing === 'alga') {
    b.box(0.3, 0.02, 0.2, 0x1f4a2a, [0, 0.03, 0]).box(0.28, 0.022, 0.02, 0x2f6a3a, [0, 0.04, 0.05]);
  } else if (ing === 'sopa_tomate' || ing === 'sopa_hongo') {
    b.cyl(0.19, 0.12, 0.13, 10, 0xf2efe8, [0, 0.07, 0]).cyl(0.17, 0.17, 0.02, 10, ing === 'sopa_tomate' ? 0xd8402a : 0x9a6a3a, [0, 0.125, 0]);
    if (ing === 'sopa_hongo') b.ball(0.035, 0xe9dccb, [0.05, 0.14, 0.03]).ball(0.03, 0xe9dccb, [-0.06, 0.14, -0.02]);
    else b.ball(0.03, 0x4fa83a, [0.04, 0.14, 0.02]);
  } else b.ball(0.15, 0xcccccc, [0, 0.15, 0]);
  const g = b.build(); ingCache.set(k, g); return g;
}
export const plateGeo = new Builder().cyl(0.27, 0.2, 0.05, 14, 0xfafaf7, [0, 0.025, 0]).cyl(0.2, 0.2, 0.012, 14, 0xe6e4dc, [0, 0.052, 0]).build();
export const dirtyGeo = new Builder().cyl(0.27, 0.2, 0.05, 14, 0xd8d0b8, [0, 0.025, 0]).ball(0.07, 0x8a6a3a, [0.08, 0.06, 0.02], [1.4, 0.2, 1]).ball(0.05, 0x6a8a3a, [-0.08, 0.06, -0.05], [1.3, 0.2, 1]).build();
export const extGeo = new Builder().cyl(0.11, 0.11, 0.5, 10, 0xd8322a, [0, 0.25, 0]).ball(0.11, 0xd8322a, [0, 0.5, 0], [1, 0.5, 1]).cyl(0.04, 0.04, 0.1, 6, C.black, [0, 0.58, 0]).box(0.2, 0.04, 0.05, C.black, [0.08, 0.62, 0]).cyl(0.025, 0.035, 0.22, 6, C.black, [0.14, 0.45, 0.06], [0.4, 0, 0.3]).box(0.18, 0.12, 0.012, C.white, [0, 0.28, 0.105]).build();

/* ======================= efectos ======================= */
export const fireGeo = new Builder().cone(0.32, 0.8, 6, 0xff5a1a, [0, 0.4, 0]).cone(0.22, 0.6, 6, 0xffb02a, [0.12, 0.3, 0.08]).cone(0.16, 0.5, 5, 0xffe36a, [-0.1, 0.25, -0.06]).cone(0.18, 0.55, 5, 0xff7a2a, [-0.05, 0.28, 0.14]).build();
export const ringGeo = new THREE.RingGeometry(0.42, 0.55, 28).rotateX(-Math.PI / 2);
export const puddleGeo = (() => { const b = new Builder(); b.cyl(0.55, 0.55, 0.02, 14, 0xffffff, [0, 0, 0]).cyl(0.3, 0.3, 0.02, 10, 0xffffff, [0.45, 0, 0.2]).cyl(0.24, 0.24, 0.02, 10, 0xffffff, [-0.35, 0, -0.32]); const g = b.build(); g.deleteAttribute('color'); return g; })();
