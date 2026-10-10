// @ts-check
/* Reino del Alba — modelos low-poly procedurales: geometrías fusionadas con color por vértice (un draw call por
   escena para lo estático), plantillas para instanciar (árboles, trigo, pasto) y rigs reutilizables de personajes
   (mismo esqueleto, distinta vestimenta). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../matelabs/kit3d.js';

export const PAL = {
  grass: 0x7fae4e, grassDark: 0x5d8a3a, grassGold: 0xc9b25a, dirt: 0xb08a5a, dirtDark: 0x8a6a42, stone: 0x9c958a, stoneDark: 0x6c665e,
  stoneLight: 0xbdb6a8, wood: 0x8a5a34, woodDark: 0x5e3b22, woodLight: 0xb3804e, plaster: 0xeadfc6, plasterWarm: 0xe8cfa6,
  roofRed: 0xb5482f, roofBlue: 0x3e5f8a, roofGreen: 0x4f7a43, roofSlate: 0x535a66, roofStraw: 0xd8b25c, gold: 0xf2c14e,
  leaf: 0x4f8f3a, leafDark: 0x2f6a34, leafAutumn: 0xd08a2c, pine: 0x2e6b45, water: 0x3d8fbf, iron: 0x5b5f66, ironDark: 0x34373c,
  cloth: 0xa23b3b, clothBlue: 0x3b5ea2, rune: 0x7ff0ff, shadow: 0x2b1e3a, ember: 0xff7a2a, cave: 0x7a7482, caveDark: 0x58525f,
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const GEO = {
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8), cone6: new THREE.ConeGeometry(1, 1, 6),
  cone8: new THREE.ConeGeometry(1, 1, 8), ico: new THREE.IcosahedronGeometry(1, 0), dodec: new THREE.DodecahedronGeometry(1, 0),
  prism: new THREE.CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2), sphere: new THREE.SphereGeometry(1, 8, 6),
  tor: new THREE.TorusGeometry(1, 0.12, 6, 16),
};

/** Acumula primitivas con color y las fusiona en una sola geometría. */
export class GeoBuilder {
  constructor(seed = 7) { /** @type {THREE.BufferGeometry[]} */ this.parts = []; this.r = rng(seed); }
  /**
   * @param {THREE.BufferGeometry} geo @param {number} color @param {number[]} pos @param {number[]} rot @param {number[]} scl
   * @param {number} [jitter] @param {boolean} [ao]
   */
  add(geo, color, pos, rot, scl, jitter = 0.06, ao = true) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (g.getAttribute('normal')) g.deleteAttribute('normal');
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
    g.applyMatrix4(_m);
    const P = g.attributes.position, n = P.count, colA = new Float32Array(n * 3);
    _c.set(color);
    if (jitter) _c.multiplyScalar(1 + (this.r() - 0.5) * 2 * jitter);
    let y0 = Infinity, y1 = -Infinity;
    if (ao) for (let i = 0; i < n; i++) { const y = P.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < n; i++) {
      const k = ao ? 0.78 + 0.22 * ((P.getY(i) - y0) / Math.max(0.001, y1 - y0)) : 1;
      colA[i * 3] = _c.r * k; colA[i * 3 + 1] = _c.g * k; colA[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    this.parts.push(g);
    return this;
  }
  box(x, y, z, w, h, d, color, ry = 0, jitter = 0.06) { return this.add(UNIT_BOX, color, [x, y, z], [0, ry, 0], [w, h, d], jitter); }
  /** caja con rotación completa */
  boxR(x, y, z, w, h, d, color, rx, ry, rz, jitter = 0.06) { return this.add(UNIT_BOX, color, [x, y, z], [rx, ry, rz], [w, h, d], jitter); }
  cyl(x, y, z, r, h, color, seg = 8, ry = 0) { return this.add(seg === 6 ? GEO.cyl6 : GEO.cyl8, color, [x, y, z], [0, ry, 0], [r, h, r]); }
  cylR(x, y, z, r, h, color, rx, ry, rz) { return this.add(GEO.cyl6, color, [x, y, z], [rx, ry, rz], [r, h, r]); }
  cone(x, y, z, r, h, color, seg = 6, ry = 0) { return this.add(seg === 6 ? GEO.cone6 : GEO.cone8, color, [x, y, z], [0, ry, 0], [r, h, r]); }
  ico(x, y, z, r, color, sy = 1, ry = 0) { return this.add(GEO.ico, color, [x, y, z], [0, ry, 0], [r, r * sy, r]); }
  dodec(x, y, z, r, color, sy = 1, ry = 0) { return this.add(GEO.dodec, color, [x, y, z], [0.3, ry, 0.2], [r, r * sy, r]); }
  sphere(x, y, z, r, color, sy = 1) { return this.add(GEO.sphere, color, [x, y, z], [0, 0, 0], [r, r * sy, r], 0.04, false); }
  torus(x, y, z, r, color, rx = Math.PI / 2, ry = 0) { return this.add(GEO.tor, color, [x, y, z], [rx, ry, 0], [r, r, r]); }
  /** Techo a dos aguas: base en baseY, cumbrera a lo largo de X (alongZ=false) o Z. */
  roof(x, baseY, z, len, width, height, color, alongZ = false) {
    const sx = height / 1.5;
    return this.add(GEO.prism, color, [x, baseY + 0.5 * sx, z], [0, alongZ ? Math.PI / 2 : 0, Math.PI / 2], [sx, len, width / 1.732], 0.05, false);
  }
  get empty() { return this.parts.length === 0; }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (g.getAttribute('position')) g.computeVertexNormals();
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Materiales compartidos (se crean una vez). */
export function createMaterials() {
  return {
    vc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new THREE.MeshStandardMaterial({ color: PAL.water, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.86 }),
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    tele: new THREE.MeshBasicMaterial({ color: 0xff5a3d, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    teleHot: new THREE.MeshBasicMaterial({ color: 0xffd04a, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    blob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    fx: new THREE.MeshBasicMaterial({ toneMapped: false }),
    marker: new THREE.MeshBasicMaterial({ color: 0xffd34a, toneMapped: false }),
    markerTurn: new THREE.MeshBasicMaterial({ color: 0x8fe8ff, toneMapped: false }),
    focus: new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    hit: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  };
}
/** @typedef {ReturnType<typeof createMaterials>} Mats */

/* ======================= plantillas para instanciar ======================= */
/** Árbol frondoso (roble) — geometría única para InstancedMesh. */
export function oakGeo(leaf = PAL.leaf) {
  const b = new GeoBuilder(3);
  b.cyl(0, 0.9, 0, 0.22, 1.8, PAL.wood, 6);
  b.ico(0, 2.5, 0, 1.25, leaf, 0.9); b.ico(0.6, 2.1, 0.3, 0.8, leaf); b.ico(-0.5, 2.2, -0.4, 0.75, leaf);
  return b.build();
}
export function pineGeo(c = PAL.pine) {
  const b = new GeoBuilder(4);
  b.cyl(0, 0.5, 0, 0.18, 1, PAL.woodDark, 6);
  b.cone(0, 1.6, 0, 1.2, 1.8, c); b.cone(0, 2.5, 0, 0.95, 1.5, c); b.cone(0, 3.3, 0, 0.65, 1.2, c);
  return b.build();
}
export function deadTreeGeo() {
  const b = new GeoBuilder(5);
  b.cyl(0, 1.2, 0, 0.2, 2.4, 0x4a3a3a, 6);
  b.cylR(0.4, 2.0, 0, 0.08, 1.2, 0x4a3a3a, 0, 0, -0.9); b.cylR(-0.35, 1.7, 0.1, 0.07, 1.0, 0x4a3a3a, 0, 0, 0.8);
  b.ico(0, 2.6, 0, 0.7, 0x4a3560, 0.8);
  return b.build();
}
export function wheatGeo() {
  const b = new GeoBuilder(6);
  for (let i = 0; i < 5; i++) { const a = i * 1.26, r = 0.18; b.box(Math.cos(a) * r, 0.45, Math.sin(a) * r, 0.05, 0.9, 0.05, PAL.grassGold); b.box(Math.cos(a) * r, 0.95, Math.sin(a) * r, 0.1, 0.22, 0.1, 0xe8c66a); }
  return b.build();
}
export function grassGeo() {
  const b = new GeoBuilder(8);
  for (let i = 0; i < 4; i++) b.boxR(Math.cos(i * 1.6) * 0.12, 0.2, Math.sin(i * 1.6) * 0.12, 0.06, 0.4, 0.02, PAL.grassDark, 0.2 * (i - 1.5), i * 0.8, 0.15);
  return b.build();
}
export function rockGeo(c = PAL.stone) { const b = new GeoBuilder(9); b.dodec(0, 0.35, 0, 0.6, c, 0.7); return b.build(); }
export function flowerGeo() {
  const b = new GeoBuilder(10);
  b.box(0, 0.15, 0, 0.04, 0.3, 0.04, PAL.grassDark); b.ico(0, 0.33, 0, 0.09, 0xffffff, 1);
  return b.build();
}

/* ======================= personajes ======================= */
/**
 * Rig humanoide reutilizable: el mismo esqueleto (cadera, torso, cabeza, brazos y piernas con pivote) y la
 * vestimenta parametrizada. Las partes con color se hornean en geometrías fusionadas (un material compartido).
 * @param {Mats} mats
 * @param {{skin?:number,hair?:number,shirt?:number,pants?:number,shoes?:number,h?:number,w?:number,
 *   hat?:string,hatColor?:number,extra?:string[],extraColor?:number,beard?:boolean,hairStyle?:string,dress?:boolean,weapon?:string}} look
 */
export function makeHumanoid(mats, look) {
  const skin = look.skin ?? 0xe9b88f, hair = look.hair ?? 0x4a2e1c, shirt = look.shirt ?? 0x6b8f4a, pants = look.pants ?? 0x5a4632;
  const shoes = look.shoes ?? 0x3a2a1c, H = look.h ?? 1, W = look.w ?? 1, ex = look.extra || [], exC = look.extraColor ?? 0xb08a3a;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.scale.set(W, H, W);
  const mk = (/** @type {GeoBuilder} */ b) => { const m = new THREE.Mesh(b.build(), mats.vc); m.castShadow = true; return m; };
  // piernas (pivote en la cadera)
  /** @param {number} sx */
  const leg = sx => {
    const g = new THREE.Group(); g.position.set(sx * 0.17, 0.82, 0);
    const b = new GeoBuilder(11);
    if (look.dress) b.box(0, -0.4, 0, 0.2, 0.8, 0.22, pants); else b.box(0, -0.38, 0, 0.22, 0.76, 0.24, pants);
    b.box(0, -0.78, 0.05, 0.24, 0.1, 0.34, shoes);
    g.add(mk(b)); body.add(g); return g;
  };
  const legL = leg(-1), legR = leg(1);
  // torso
  const tb = new GeoBuilder(12);
  tb.box(0, 1.2, 0, 0.62, 0.78, 0.36, shirt);
  tb.box(0, 0.86, 0, 0.64, 0.12, 0.38, ex.includes('belt') ? exC : 0x4a3424);
  if (look.dress) { tb.cone(0, 0.62, 0, 0.55, 0.9, shirt, 8); }
  if (ex.includes('apron')) tb.box(0, 1.0, 0.2, 0.5, 0.9, 0.04, exC);
  if (ex.includes('cape')) tb.boxR(0, 0.95, -0.24, 0.66, 1.25, 0.06, exC, 0.08, 0, 0);
  if (ex.includes('armor')) { tb.box(0, 1.25, 0, 0.66, 0.6, 0.4, 0xa9b0b8); tb.box(-0.36, 1.5, 0, 0.18, 0.12, 0.42, 0x8a9098); tb.box(0.36, 1.5, 0, 0.18, 0.12, 0.42, 0x8a9098); }
  if (ex.includes('pack')) { tb.box(0, 1.2, -0.3, 0.44, 0.56, 0.24, 0x7a5a32); tb.cyl(0, 1.55, -0.3, 0.12, 0.42, 0x9a8a6a, 6); }
  if (ex.includes('sash')) tb.boxR(0, 1.2, 0.19, 0.12, 0.85, 0.02, exC, 0, 0, 0.6);
  if (ex.includes('scarf')) tb.box(0, 1.56, 0.02, 0.5, 0.14, 0.42, exC);
  const torso = mk(tb); body.add(torso);
  // brazos (pivote en el hombro)
  /** @param {number} sx */
  const arm = sx => {
    const g = new THREE.Group(); g.position.set(sx * 0.4, 1.52, 0);
    const b = new GeoBuilder(13);
    b.box(0, -0.3, 0, 0.18, 0.62, 0.2, ex.includes('armor') ? 0x9aa1aa : shirt);
    b.box(0, -0.66, 0, 0.16, 0.14, 0.16, skin);
    if (sx > 0 && look.weapon === 'sword') { b.box(0, -0.72, 0.18, 0.06, 0.06, 0.3, 0x5a3a22); b.box(0, -0.72, 0.62, 0.06, 0.1, 0.7, 0xdfe6ee); b.box(0, -0.72, 0.28, 0.24, 0.06, 0.06, PAL.gold); }
    if (sx > 0 && look.weapon === 'hammer') { b.box(0, -0.72, 0.25, 0.06, 0.06, 0.8, 0x5a3a22); b.box(0, -0.72, 0.7, 0.24, 0.24, 0.36, PAL.iron); }
    if (sx > 0 && look.weapon === 'bighammer') { b.box(0, -0.72, 0.5, 0.1, 0.1, 1.3, 0x4a2a1a); b.box(0, -0.72, 1.2, 0.5, 0.5, 0.7, PAL.ironDark); }
    if (sx > 0 && look.weapon === 'spear') { b.box(0, -0.7, 0, 0.05, 2.2, 0.05, 0x6a4a2a); b.cone(0, 0.5, 0, 0.08, 0.3, 0xdfe6ee, 6); }
    if (sx > 0 && look.weapon === 'staff') { b.box(0, -0.4, 0.05, 0.06, 1.9, 0.06, 0x7a5a32); b.ico(0, 0.6, 0.05, 0.1, 0x9ad0ff); }
    if (sx > 0 && look.weapon === 'book') b.box(0, -0.75, 0.14, 0.28, 0.06, 0.2, 0x8a2a2a);
    if (sx < 0 && look.weapon === 'sword') b.boxR(0, -0.55, 0.16, 0.08, 0.6, 0.5, 0x8a5a34, 0, 0, 0);
    g.add(mk(b)); body.add(g); return g;
  };
  const armL = arm(-1), armR = arm(1);
  // cabeza (pivote en el cuello)
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); body.add(head);
  const hb = new GeoBuilder(14);
  hb.box(0, 0.24, 0, 0.42, 0.44, 0.4, skin);
  hb.box(-0.1, 0.27, 0.205, 0.06, 0.07, 0.02, 0x1d1410, 0, 0); hb.box(0.1, 0.27, 0.205, 0.06, 0.07, 0.02, 0x1d1410, 0, 0);
  hb.box(0, 0.16, 0.21, 0.08, 0.06, 0.04, 0xd99a74, 0, 0);
  const hs = look.hairStyle || 'short';
  if (hs !== 'bald') hb.box(0, 0.48, -0.02, 0.46, 0.12, 0.44, hair);
  if (hs === 'long') { hb.box(0, 0.2, -0.2, 0.46, 0.56, 0.1, hair); }
  if (hs === 'bun') { hb.box(0, 0.25, -0.2, 0.44, 0.4, 0.06, hair); hb.ico(0, 0.58, -0.18, 0.13, hair); }
  if (hs === 'short') hb.box(0, 0.36, -0.2, 0.44, 0.26, 0.06, hair);
  if (look.beard) { hb.box(0, 0.08, 0.17, 0.4, 0.2, 0.1, hair); hb.box(0, -0.04, 0.16, 0.26, 0.14, 0.08, hair); }
  if (ex.includes('glasses')) { hb.box(-0.1, 0.27, 0.22, 0.12, 0.1, 0.02, 0x2a2a2a); hb.box(0.1, 0.27, 0.22, 0.12, 0.1, 0.02, 0x2a2a2a); }
  const hc = look.hatColor ?? 0x6a4a2a;
  if (look.hat === 'crown') { hb.box(0, 0.56, 0, 0.44, 0.1, 0.42, PAL.gold); for (let i = 0; i < 4; i++) hb.cone(Math.cos(i * 1.57) * 0.16, 0.66, Math.sin(i * 1.57) * 0.16, 0.06, 0.16, PAL.gold, 6); }
  if (look.hat === 'tiara') { hb.box(0, 0.55, 0.05, 0.44, 0.07, 0.36, PAL.gold); hb.ico(0, 0.62, 0.2, 0.05, 0xff5a8a); }
  if (look.hat === 'helmet') { hb.box(0, 0.5, 0, 0.5, 0.2, 0.48, hc); hb.box(0, 0.3, 0.22, 0.06, 0.24, 0.04, hc); }
  if (look.hat === 'plume') { hb.box(0, 0.5, 0, 0.5, 0.2, 0.48, hc); hb.boxR(0, 0.72, -0.05, 0.08, 0.32, 0.3, 0xc0392b, 0.4, 0, 0); }
  if (look.hat === 'straw') { hb.cyl(0, 0.52, 0, 0.42, 0.04, PAL.roofStraw, 8); hb.cyl(0, 0.62, 0, 0.22, 0.2, PAL.roofStraw, 8); }
  if (look.hat === 'wide') { hb.cyl(0, 0.52, 0, 0.4, 0.05, hc, 8); hb.cyl(0, 0.64, 0, 0.24, 0.22, hc, 8); hb.box(0, 0.58, 0.0, 0.5, 0.05, 0.05, 0xf2c14e); }
  if (look.hat === 'cap') { hb.box(0, 0.52, 0, 0.46, 0.1, 0.44, hc); hb.box(0, 0.48, 0.24, 0.4, 0.04, 0.16, hc); }
  if (look.hat === 'hood') { hb.box(0, 0.32, -0.04, 0.5, 0.62, 0.48, hc); hb.box(0, 0.2, 0.22, 0.32, 0.36, 0.02, 0x2a1e1a); hb.box(0, 0.27, 0.215, 0.36, 0.3, 0.03, skin); }
  if (look.hat === 'kerchief') { hb.box(0, 0.5, -0.02, 0.48, 0.12, 0.46, hc); hb.boxR(0, 0.38, -0.24, 0.2, 0.2, 0.04, hc, 0.3, 0, 0.78); }
  if (look.hat === 'bandana') hb.box(0, 0.45, 0, 0.47, 0.1, 0.45, hc);
  if (look.hat === 'mask') { hb.box(0, 0.3, -0.02, 0.48, 0.66, 0.46, 0x2a2228); hb.box(-0.1, 0.3, 0.22, 0.08, 0.05, 0.02, 0xff4020); hb.box(0.1, 0.3, 0.22, 0.08, 0.05, 0.02, 0xff4020); }
  const headMesh = mk(hb); head.add(headMesh);
  return { root, body, head, legL, legR, armL, armR, torso, phase: Math.random() * 6, talkT: 0, atk: 0 };
}
/** @typedef {ReturnType<typeof makeHumanoid>} Rig */

/**
 * Anima un rig: caminar (según velocidad), respirar, hablar y atacar.
 * @param {Rig} R @param {number} dt @param {number} speed @param {'idle'|'walk'|'talk'|'attack'|'sleep'} mode
 */
export function animateRig(R, dt, speed, mode) {
  R.phase += dt * (mode === 'walk' ? 2 + speed * 2.2 : 2);
  const s = Math.sin(R.phase);
  if (mode === 'walk' && speed > 0.1) {
    const a = Math.min(1, speed / 3) * 0.75;
    R.legL.rotation.x = s * a; R.legR.rotation.x = -s * a;
    R.armL.rotation.x = -s * a * 0.8; R.armR.rotation.x = s * a * 0.8;
    R.body.position.y = Math.abs(Math.cos(R.phase)) * 0.05;
    R.head.rotation.x = 0;
  } else {
    R.legL.rotation.x *= 0.8; R.legR.rotation.x *= 0.8;
    R.body.position.y = Math.sin(R.phase * 0.5) * 0.012;
    if (mode === 'talk') {
      R.talkT += dt;
      R.head.rotation.x = Math.sin(R.talkT * 7) * 0.08;
      R.armR.rotation.x = -0.6 + Math.sin(R.talkT * 3) * 0.35; R.armR.rotation.z = 0.15;
      R.armL.rotation.x *= 0.8;
    } else if (mode === 'sleep') {
      R.head.rotation.x = 0.35; R.armL.rotation.x *= 0.9; R.armR.rotation.x *= 0.9;
    } else {
      R.head.rotation.x *= 0.9; R.armR.rotation.z *= 0.9;
      R.armL.rotation.x = Math.sin(R.phase * 0.5) * 0.04; R.armR.rotation.x = -Math.sin(R.phase * 0.5) * 0.04;
    }
  }
  if (R.atk > 0) {
    R.atk = Math.max(0, R.atk - dt);
    const k = R.atk / 0.3; // 1 → 0
    R.armR.rotation.x = k > 0.6 ? -2.4 * (1 - (k - 0.6) / 0.4) - 0.2 : -2.6 + (1 - k / 0.6) * 3.4;
  }
}

/** Cuadrúpedo (sombra-lobo, perrita, oveja): mismo rig, distinto pelaje. */
export function makeQuad(mats, o) {
  const c = o.color, s = o.size ?? 1;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(s);
  const mk = (b, mat = mats.vc) => { const m = new THREE.Mesh(b.build(), mat); m.castShadow = true; return m; };
  const bb = new GeoBuilder(21);
  if (o.wool) { bb.ico(0, 0.62, 0, 0.5, 0xf2efe6, 0.8); bb.ico(0, 0.66, 0.3, 0.38, 0xf2efe6, 0.8); }
  else { bb.box(0, 0.6, 0, 0.5, 0.42, 1.0, c); bb.box(0, 0.62, -0.5, 0.12, 0.12, 0.4, c, 0); }
  if (o.spots) { bb.box(0.26, 0.7, 0.1, 0.02, 0.2, 0.3, 0x2a2a2a); bb.box(-0.26, 0.6, -0.2, 0.02, 0.22, 0.3, 0x2a2a2a); }
  body.add(mk(bb));
  const head = new THREE.Group(); head.position.set(0, 0.86, 0.5); body.add(head);
  const hb = new GeoBuilder(22);
  hb.box(0, 0, 0.12, 0.36, 0.34, 0.4, o.headColor ?? c);
  hb.box(0, -0.06, 0.38, 0.22, 0.18, 0.22, o.snout ?? c);
  hb.box(-0.12, 0.22, 0.02, 0.1, 0.18, 0.08, o.ear ?? c); hb.box(0.12, 0.22, 0.02, 0.1, 0.18, 0.08, o.ear ?? c);
  if (o.horns) { hb.cone(-0.14, 0.24, 0.05, 0.05, 0.2, 0xe8e0c8, 6); hb.cone(0.14, 0.24, 0.05, 0.05, 0.2, 0xe8e0c8, 6); }
  head.add(mk(hb));
  if (o.eyes) { const eb = new GeoBuilder(23); eb.box(-0.1, 0.06, 0.33, 0.07, 0.05, 0.02, o.eyes); eb.box(0.1, 0.06, 0.33, 0.07, 0.05, 0.02, o.eyes); head.add(new THREE.Mesh(eb.build(), mats.glow)); }
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); g.position.set(i % 2 ? 0.17 : -0.17, 0.45, i < 2 ? 0.35 : -0.35);
    const lb = new GeoBuilder(24 + i); lb.box(0, -0.22, 0, 0.12, 0.46, 0.12, o.legColor ?? c);
    g.add(mk(lb)); body.add(g); legs.push(g);
  }
  return { root, body, head, legs, phase: Math.random() * 6 };
}
export function animateQuad(Q, dt, speed) {
  Q.phase += dt * (3 + speed * 3);
  const s = Math.sin(Q.phase) * Math.min(0.8, speed * 0.3);
  Q.legs[0].rotation.x = s; Q.legs[3].rotation.x = s; Q.legs[1].rotation.x = -s; Q.legs[2].rotation.x = -s;
  Q.body.position.y = speed > 0.2 ? Math.abs(Math.cos(Q.phase)) * 0.04 : Math.sin(Q.phase * 0.3) * 0.01;
}

/** Gólem de cristal (mini jefe de la cueva). */
export function makeGolem(mats) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const b = new GeoBuilder(31);
  b.dodec(0, 1.6, 0, 1.0, PAL.caveDark, 1.1); b.dodec(0, 2.6, 0.15, 0.6, PAL.cave, 0.9);
  b.dodec(-0.5, 0.5, 0, 0.45, PAL.caveDark); b.dodec(0.5, 0.5, 0, 0.45, PAL.caveDark);
  body.add(new THREE.Mesh(b.build(), mats.vc));
  const g = new GeoBuilder(32);
  g.cone(0.4, 2.3, -0.5, 0.18, 0.7, 0x8af0ff); g.cone(-0.3, 2.5, -0.4, 0.14, 0.6, 0x8af0ff); g.box(-0.18, 2.7, 0.62, 0.12, 0.08, 0.04, 0x8af0ff); g.box(0.18, 2.7, 0.62, 0.12, 0.08, 0.04, 0x8af0ff);
  body.add(new THREE.Mesh(g.build(), mats.glow));
  /** @param {number} sx */
  const arm = sx => { const p = new THREE.Group(); p.position.set(sx * 1.05, 2.0, 0); const ab = new GeoBuilder(33); ab.dodec(0, -0.6, 0, 0.42, PAL.cave, 1.4); ab.dodec(0, -1.3, 0.1, 0.5, PAL.caveDark); p.add(new THREE.Mesh(ab.build(), mats.vc)); body.add(p); return p; };
  return { root, body, armL: arm(-1), armR: arm(1), phase: 0 };
}

/** Guardián del bosque (jefe de la principal B): un ent de corteza y runas. */
export function makeGuardian(mats) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const b = new GeoBuilder(41);
  b.cyl(0, 1.6, 0, 0.75, 3.2, 0x5a4030, 8); b.cyl(0, 0.3, 0, 1.0, 0.6, 0x4a3426, 8);
  b.ico(0, 3.6, 0, 1.5, 0x2f5a30, 0.8); b.ico(0.9, 3.3, 0.3, 0.9, 0x356a36); b.ico(-0.9, 3.4, -0.2, 0.9, 0x2a5030);
  for (let i = 0; i < 5; i++) { const a = i * 1.26; b.boxR(Math.cos(a) * 0.9, 0.2, Math.sin(a) * 0.9, 0.25, 0.3, 0.9, 0x4a3426, 0, -a, 0.3); }
  body.add(new THREE.Mesh(b.build(), mats.vc));
  const g = new GeoBuilder(42);
  g.box(-0.28, 2.6, 0.72, 0.18, 0.1, 0.06, 0xff6af0); g.box(0.28, 2.6, 0.72, 0.18, 0.1, 0.06, 0xff6af0);
  g.box(0, 1.6, 0.76, 0.12, 0.7, 0.04, 0xff6af0); g.box(0, 1.6, 0.76, 0.5, 0.1, 0.04, 0xff6af0);
  const runes = new THREE.Mesh(g.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  body.add(runes);
  /** @param {number} sx */
  const arm = sx => { const p = new THREE.Group(); p.position.set(sx * 0.85, 2.6, 0); const ab = new GeoBuilder(43); ab.cylR(sx * 0.2, -0.9, 0, 0.22, 2.0, 0x5a4030, 0, 0, sx * 0.25); ab.ico(sx * 0.45, -1.9, 0, 0.42, 0x2f5a30); p.add(new THREE.Mesh(ab.build(), mats.vc)); body.add(p); return p; };
  return { root, body, runes, armL: arm(-1), armR: arm(1), phase: 0 };
}

/* ======================= piezas dinámicas ======================= */
/** Hoja de puerta (pivote en la bisagra, en el origen; se extiende hacia +x). */
export function doorLeafGeo(w, h, color = PAL.wood, iron = false) {
  const b = new GeoBuilder(51);
  b.box(w / 2, h / 2, 0, w - 0.04, h, 0.12, color);
  for (let i = 0; i < 3; i++) b.box(w / 2, 0.35 + i * (h - 0.6) / 2, 0.07, w - 0.1, 0.1, 0.03, iron ? PAL.ironDark : PAL.woodDark);
  b.box(w - 0.22, h * 0.48, 0.1, 0.08, 0.08, 0.08, PAL.gold);
  return b.build();
}
/** Cofre: base y tapa (la tapa con pivote atrás). */
export function chestGeos(locked) {
  const b = new GeoBuilder(52);
  b.box(0, 0.3, 0, 1.0, 0.6, 0.66, PAL.woodLight); b.box(0, 0.3, 0, 1.04, 0.1, 0.7, PAL.ironDark);
  b.box(-0.42, 0.3, 0, 0.08, 0.62, 0.7, PAL.ironDark); b.box(0.42, 0.3, 0, 0.08, 0.62, 0.7, PAL.ironDark);
  if (locked) b.box(0, 0.42, 0.36, 0.2, 0.24, 0.06, PAL.gold);
  const l = new GeoBuilder(53);
  l.box(0, 0.12, 0.33, 1.02, 0.24, 0.68, PAL.wood); l.box(0, 0.24, 0.33, 1.06, 0.06, 0.72, PAL.ironDark);
  return { base: b.build(), lid: l.build() };
}

/** Disposición de recursos compartidos de este módulo. */
export function disposeShared() { Object.values(GEO).forEach(g => g.dispose()); }
