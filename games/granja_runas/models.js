// @ts-check
/* Granja de Runas — modelos low-poly procedurales (sin assets externos).
   Todo se arma con primitivas fusionadas en una sola geometría con colores por vértice:
   un objeto estático = 1 draw call. Lo repetido (árboles, pasto, cercos) va en InstancedMesh. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- materiales compartidos ---------- */
export const MAT = {
  base: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
  /** follaje y pasto: su color se tiñe según la estación */
  foliage: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 }),
  ground: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 }),
  /** brillo de runas, faroles y ventanas (se intensifica de noche) */
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfefff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1, depthWrite: false }),
  water: new THREE.MeshStandardMaterial({ color: 0x4fa9d6, transparent: true, opacity: 0.78, roughness: 0.2, metalness: 0.1 }),
  ring: new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.85, depthWrite: false }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  danger: new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
  tarp: new THREE.MeshStandardMaterial({ color: 0x3b82c4, flatShading: true, roughness: 0.7, side: THREE.DoubleSide }),
};

/* ---------- constructor de geometrías fusionadas ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Builder {
  constructor() { /** @type {THREE.BufferGeometry[]} */ this.parts = []; }
  /**
   * @param {THREE.BufferGeometry} geo @param {number|string} color
   * @param {number[]} [p] posición @param {number[]} [r] rotación @param {number[]} [s] escala
   */
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
  cyl(rt, rb, h, seg, color, p, r) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, p, r); }
  cone(rad, h, seg, color, p, r) { return this.add(new THREE.ConeGeometry(rad, h, seg), color, p, r); }
  ball(rad, color, p, s, detail = 0, r) { return this.add(new THREE.IcosahedronGeometry(rad, detail), color, p, r, s); }
  dodec(rad, color, p, s, r) { return this.add(new THREE.DodecahedronGeometry(rad, 0), color, p, r, s); }
  torus(rad, tube, color, p, r, seg = 8) { return this.add(new THREE.TorusGeometry(rad, tube, 4, seg), color, p, r); }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

/** Mesh con sombras según el material. */
export function mesh(geo, mat = MAT.base, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m;
}

/* ======================= paleta ======================= */
export const C = {
  skin: 0xf2c49b, skin2: 0xd9a073, hair: 0x6b3b1f, hair2: 0xb5651d, straw: 0xe8c66a, strawDark: 0xc9a243,
  dress: 0x5aa86b, apron: 0xf4ecd8, shirt: 0xe8604c, overall: 0x3e6aa8, boot: 0x5a3a26, white: 0xf7f3ea,
  wood: 0xb07a4a, woodDark: 0x7a5233, woodLight: 0xd3a26b, roof: 0xc8553d, roof2: 0x3f8f8a, wall: 0xf2e3c6, wall2: 0xe9d3a8,
  stone: 0xa9a59b, stoneDark: 0x7d7a72, soil: 0x8a5a3b, soilWet: 0x553422, grass: 0x7fbf5a, grass2: 0x9ad06b, leaf: 0x4f9a45, leaf2: 0x6fbf55,
  pine: 0x2f6e4a, pine2: 0x3f8a58, water: 0x5fb6d9, pumpkin: 0xf08a24, carrot: 0xf07a28, wheat: 0xe8c35a, turnip: 0xf4f0ff, turnipTop: 0xb067c9,
  rune: 0x7df9ff, rune2: 0xc4a7ff, accent: 0x86efac, red: 0xd9483b, yellow: 0xf6d04d, pink: 0xf59ac0, iron: 0x6d7480, dark: 0x2b2b33,
};

/* ======================= personajes ======================= */
/**
 * Persona low-poly con piernas y brazos separados (para animar caminata y herramientas).
 * @param {{skin?:number, hair?:number, top?:number, bottom?:number, hat?:'straw'|'cap'|'scarf'|'none', hatColor?:number, skirt?:boolean, beard?:boolean, apron?:boolean, braid?:boolean, scale?:number}} o
 */
export function makePerson(o = {}) {
  const skin = o.skin ?? C.skin, top = o.top ?? C.shirt, bottom = o.bottom ?? C.overall;
  const group = new THREE.Group();
  const body = new Builder();
  // torso / vestido
  if (o.skirt) body.cone(0.42, 0.78, 8, top, [0, 0.82, 0], [0, 0, 0]).cyl(0.2, 0.26, 0.38, 8, top, [0, 1.2, 0]);
  else body.cyl(0.22, 0.27, 0.62, 8, top, [0, 1.05, 0]).cyl(0.26, 0.24, 0.24, 8, bottom, [0, 0.72, 0]);
  if (o.apron) body.box(0.36, 0.5, 0.04, C.apron, [0, 0.95, 0.24]);
  if (!o.skirt && bottom === C.overall) body.box(0.3, 0.3, 0.04, bottom, [0, 1.12, 0.21]).box(0.05, 0.36, 0.04, bottom, [0.12, 1.25, 0.2]).box(0.05, 0.36, 0.04, bottom, [-0.12, 1.25, 0.2]);
  // cabeza
  body.ball(0.26, skin, [0, 1.62, 0], [1, 1.05, 1], 1).ball(0.05, C.dark, [0.09, 1.66, 0.23]).ball(0.05, C.dark, [-0.09, 1.66, 0.23]);
  body.ball(0.045, 0xe88a7a, [0, 1.6, 0.26]);
  body.ball(0.04, 0xf09a9a, [0.16, 1.57, 0.2], [1, 0.6, 0.5]).ball(0.04, 0xf09a9a, [-0.16, 1.57, 0.2], [1, 0.6, 0.5]);
  const hair = o.hair ?? C.hair;
  body.ball(0.27, hair, [0, 1.7, -0.04], [1.02, 0.85, 1.02], 1);
  if (o.braid) body.cyl(0.06, 0.04, 0.5, 6, hair, [0.18, 1.35, -0.16], [0.2, 0, 0.25]).ball(0.06, C.red, [0.24, 1.1, -0.2]);
  if (o.beard) body.ball(0.2, hair, [0, 1.5, 0.12], [1, 0.8, 0.7]);
  if (o.hat === 'straw') body.cyl(0.52, 0.55, 0.05, 12, o.hatColor ?? C.straw, [0, 1.84, 0]).cyl(0.22, 0.27, 0.22, 10, o.hatColor ?? C.straw, [0, 1.95, 0]).cyl(0.28, 0.28, 0.06, 10, C.red, [0, 1.88, 0]);
  else if (o.hat === 'cap') body.cyl(0.27, 0.28, 0.16, 10, o.hatColor ?? C.red, [0, 1.86, 0]).box(0.32, 0.03, 0.22, o.hatColor ?? C.red, [0, 1.8, 0.22]);
  else if (o.hat === 'scarf') body.ball(0.29, o.hatColor ?? C.pink, [0, 1.74, -0.02], [1.05, 0.78, 1.05], 1);
  const bodyMesh = mesh(body.build());
  group.add(bodyMesh);
  // piernas (pivote en la cadera)
  const legGeo = new Builder().cyl(0.09, 0.08, 0.5, 6, o.skirt ? skin : bottom, [0, -0.25, 0]).box(0.16, 0.12, 0.26, C.boot, [0, -0.5, 0.04]).build();
  const legs = [-1, 1].map(sd => { const l = mesh(legGeo); l.position.set(0.12 * sd, 0.6, 0); group.add(l); return l; });
  // brazos (pivote en el hombro)
  const armGeo = new Builder().cyl(0.075, 0.065, 0.5, 6, top, [0, -0.22, 0]).ball(0.08, skin, [0, -0.5, 0]).build();
  const arms = [-1, 1].map(sd => { const a = mesh(armGeo); a.position.set(0.32 * sd, 1.32, 0); group.add(a); return a; });
  const s = o.scale ?? 1; group.scale.setScalar(s);
  return { group, body: bodyMesh, legs, arms };
}

/* ---------- herramientas (en la mano derecha) ---------- */
export function makeTools() {
  const can = mesh(new Builder().cyl(0.14, 0.16, 0.26, 8, 0x5b9bd5, [0, 0, 0]).cyl(0.025, 0.035, 0.32, 6, 0x5b9bd5, [0.2, 0.06, 0], [0, 0, -1]).torus(0.1, 0.02, 0x3f78ad, [0, 0.16, 0], [0, 0, 0]).build(), MAT.base, false);
  const hoe = mesh(new Builder().cyl(0.03, 0.03, 1.1, 5, C.woodLight, [0, 0, 0]).box(0.26, 0.06, 0.12, C.iron, [0.08, 0.55, 0.04]).build(), MAT.base, false);
  const axe = mesh(new Builder().cyl(0.03, 0.03, 0.8, 5, C.woodLight, [0, 0, 0]).box(0.2, 0.18, 0.04, C.iron, [0.1, 0.33, 0]).build(), MAT.base, false);
  const basket = mesh(new Builder().cyl(0.2, 0.15, 0.18, 8, C.strawDark, [0, 0, 0]).torus(0.14, 0.015, C.woodDark, [0, 0.14, 0], [0, Math.PI / 2, 0]).build(), MAT.base, false);
  return { can, hoe, axe, basket };
}

/* ======================= cultivos ======================= */
export const CROP_TYPES = ['nabo', 'zanahoria', 'trigo', 'calabaza', 'arcoiris'];
/** Geometrías de cultivo por tipo y etapa (0 semilla, 1 brote, 2 creciendo, 3 maduro). Cacheadas. */
const cropCache = new Map();
export function cropGeo(type, stage) {
  const k = type + stage;
  if (cropCache.has(k)) return cropCache.get(k);
  const b = new Builder();
  if (stage === 0) {
    b.ball(0.16, C.soil, [0, 0.03, 0], [1.4, 0.5, 1.4]).ball(0.05, type === 'arcoiris' ? C.rune2 : 0xe9d79a, [0, 0.1, 0]);
  } else if (type === 'trigo') {
    const n = stage === 1 ? 4 : 9, h = stage === 1 ? 0.3 : stage === 2 ? 0.65 : 0.95;
    const col = stage === 3 ? C.wheat : stage === 2 ? 0x9cc25a : C.leaf2;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4, rr = 0.08 + (i % 3) * 0.1, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      b.cyl(0.018, 0.025, h, 4, stage === 3 ? 0xd9b04a : C.leaf2, [x, h / 2, z], [Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12]);
      if (stage >= 2) b.ball(0.06, col, [x + Math.sin(a) * 0.06, h + 0.05, z], [0.7, 1.8, 0.7]);
    }
  } else {
    const leafC = type === 'arcoiris' ? 0x5fbf8a : C.leaf;
    const nl = stage === 1 ? 2 : stage === 2 ? 4 : 5, lh = stage === 1 ? 0.18 : stage === 2 ? 0.34 : 0.42;
    for (let i = 0; i < nl; i++) {
      const a = (i / nl) * Math.PI * 2;
      if (type === 'zanahoria') b.cone(0.07, lh * 1.4, 4, C.leaf2, [Math.cos(a) * 0.06, lh * 0.7, Math.sin(a) * 0.06], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]);
      else b.ball(lh * 0.5, leafC, [Math.cos(a) * lh * 0.45, lh * 0.45, Math.sin(a) * lh * 0.45], [1, 0.35, 0.6], 0, [0, -a, 0.5]);
    }
    if (stage === 3) {
      if (type === 'nabo') b.ball(0.2, C.turnip, [0, 0.12, 0], [1, 0.9, 1], 1).ball(0.17, C.turnipTop, [0, 0.2, 0], [1, 0.55, 1], 1);
      else if (type === 'zanahoria') b.cone(0.13, 0.22, 7, C.carrot, [0, 0.06, 0], [Math.PI, 0, 0]);
      else if (type === 'calabaza') {
        b.ball(0.42, C.pumpkin, [0.1, 0.32, 0.05], [1.15, 0.75, 1.1], 1).cyl(0.04, 0.05, 0.16, 5, C.woodDark, [0.1, 0.66, 0.05]);
        for (let i = 0; i < 4; i++) b.ball(0.42, 0xe57d1c, [0.1, 0.32, 0.05], [1.17 - i * 0.02, 0.74, 0.5], 0, [0, i * 0.8, 0]);
      } else if (type === 'arcoiris') {
        b.cyl(0.025, 0.03, 0.7, 5, 0x4f9a45, [0, 0.35, 0]);
        const cols = [0xff6b6b, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0xb197fc];
        cols.forEach((c, i) => { const a = (i / 6) * Math.PI * 2; b.ball(0.13, c, [Math.cos(a) * 0.15, 0.74, Math.sin(a) * 0.15], [1, 0.35, 0.65], 0, [0, -a, 0]); });
        b.ball(0.08, 0xfff3bf, [0, 0.78, 0]);
      }
    } else if (stage === 2 && type === 'calabaza') b.ball(0.16, 0x9cc25a, [0.12, 0.12, 0.05], [1.1, 0.8, 1.1]);
    else if (stage === 2 && type === 'arcoiris') b.cyl(0.02, 0.025, 0.45, 5, 0x4f9a45, [0, 0.22, 0]).ball(0.09, C.rune2, [0, 0.48, 0]);
  }
  const g = b.build(); cropCache.set(k, g); return g;
}

/** Maleza o piedras sobre una parcela abandonada. */
export function makeWeeds(rocky) {
  const b = new Builder();
  for (let i = 0; i < 11; i++) {
    const a = i * 2.1, r = 0.2 + (i % 4) * 0.2;
    b.cone(0.16 + (i % 2) * 0.06, 0.5 + (i % 3) * 0.18, 4, i % 3 === 0 ? 0x5f7f2f : i % 2 ? 0x6e8f3a : 0x93b04f, [Math.cos(a) * r, 0.25, Math.sin(a) * r], [0.25 * Math.sin(a), a, 0.25 * Math.cos(a)]);
  }
  b.ball(0.35, 0x6e8f3a, [0, 0.12, 0], [1.6, 0.4, 1.6]).ball(0.06, 0xf6d04d, [0.35, 0.55, 0.1]).ball(0.06, 0xffffff, [-0.3, 0.5, -0.2]);
  if (rocky) { b.dodec(0.32, C.stone, [0.25, 0.15, -0.2], [1.2, 0.7, 1]); b.dodec(0.22, C.stoneDark, [-0.3, 0.1, 0.25], [1, 0.7, 1.1]); }
  return b.build();
}

/** Parcela de tierra (surcos). El color se cambia por instancia (seca/mojada/helada). */
export function plotGeo() {
  const b = new Builder();
  b.box(2.05, 0.12, 2.05, 0xffffff, [0, 0.06, 0]);
  for (let i = 0; i < 4; i++) b.box(1.9, 0.1, 0.2, 0xe8e8e8, [0, 0.15, -0.72 + i * 0.48]);
  return b.build();
}

/* ======================= animales ======================= */
/** @param {'gallina'|'oveja'|'cabra'} kind */
export function makeAnimal(kind) {
  const b = new Builder();
  if (kind === 'gallina') {
    b.ball(0.32, C.white, [0, 0.42, 0], [1, 0.9, 1.15], 1).ball(0.2, C.white, [0, 0.72, 0.24], [1, 1, 1], 1);
    b.cone(0.06, 0.14, 4, C.yellow, [0, 0.7, 0.46], [Math.PI / 2, 0, 0]).box(0.05, 0.14, 0.12, C.red, [0, 0.92, 0.24]).box(0.04, 0.08, 0.05, C.red, [0, 0.62, 0.42]);
    b.ball(0.035, C.dark, [0.1, 0.76, 0.4]).ball(0.035, C.dark, [-0.1, 0.76, 0.4]);
    b.cone(0.18, 0.3, 4, 0xe8e2d2, [0, 0.55, -0.35], [-0.9, 0, 0]);
    b.cyl(0.025, 0.025, 0.22, 4, C.yellow, [0.1, 0.11, 0]).cyl(0.025, 0.025, 0.22, 4, C.yellow, [-0.1, 0.11, 0]);
  } else if (kind === 'oveja') {
    for (let i = 0; i < 7; i++) { const a = i * 0.9; b.ball(0.3, 0xf6f3ee, [Math.cos(a) * 0.22, 0.72 + Math.sin(i) * 0.06, Math.sin(a) * 0.3], [1, 0.9, 1], 0); }
    b.ball(0.42, 0xefeae2, [0, 0.72, 0], [1, 0.85, 1.25], 1);
    b.ball(0.2, 0x3b3540, [0, 0.82, 0.55], [0.9, 1, 1.15], 1).ball(0.1, 0x3b3540, [0.22, 0.86, 0.5], [1.6, 0.5, 0.8]).ball(0.1, 0x3b3540, [-0.22, 0.86, 0.5], [1.6, 0.5, 0.8]);
    b.ball(0.035, C.white, [0.08, 0.88, 0.71]).ball(0.035, C.white, [-0.08, 0.88, 0.71]);
    for (const [x, z] of [[0.2, 0.3], [-0.2, 0.3], [0.2, -0.3], [-0.2, -0.3]]) b.cyl(0.06, 0.05, 0.42, 5, 0x3b3540, [x, 0.21, z]);
  } else {
    b.ball(0.36, 0xd8c3a0, [0, 0.7, 0], [0.9, 0.85, 1.35], 1).ball(0.2, 0xd8c3a0, [0, 1.0, 0.48], [0.85, 1, 1.2], 1);
    b.cone(0.05, 0.25, 4, 0x8a7a66, [0.08, 1.24, 0.42], [-0.4, 0, 0.2]).cone(0.05, 0.25, 4, 0x8a7a66, [-0.08, 1.24, 0.42], [-0.4, 0, -0.2]);
    b.ball(0.08, 0xd8c3a0, [0.2, 1.02, 0.4], [1.6, 0.4, 0.8]).ball(0.08, 0xd8c3a0, [-0.2, 1.02, 0.4], [1.6, 0.4, 0.8]);
    b.cone(0.06, 0.16, 4, 0xbfa985, [0, 0.82, 0.68], [Math.PI, 0, 0]).ball(0.035, C.dark, [0.09, 1.06, 0.66]).ball(0.035, C.dark, [-0.09, 1.06, 0.66]);
    b.cyl(0.05, 0.03, 0.18, 4, 0xd8c3a0, [0, 0.82, -0.5], [-0.8, 0, 0]);
    for (const [x, z] of [[0.18, 0.3], [-0.18, 0.3], [0.18, -0.3], [-0.18, -0.3]]) b.cyl(0.05, 0.045, 0.45, 5, 0xc4ad88, [x, 0.22, z]);
    b.box(0.32, 0.06, 0.06, C.red, [0, 0.92, 0.38]).ball(0.05, C.yellow, [0, 0.86, 0.43]);
  }
  return mesh(b.build());
}

/** Productos animales (aparecen al lado del animal a la mañana). */
export function makeProduct(kind) {
  const b = new Builder();
  if (kind === 'huevo') b.ball(0.12, 0xfff6e0, [0, 0.12, 0], [0.85, 1.15, 0.85], 1);
  else if (kind === 'lana') b.ball(0.18, 0xffffff, [0, 0.16, 0], [1.2, 0.8, 1], 0).ball(0.12, 0xf2efe8, [0.12, 0.22, 0.05]);
  else b.cyl(0.1, 0.12, 0.3, 8, 0xf4f4f4, [0, 0.15, 0]).cyl(0.06, 0.1, 0.08, 8, 0x5b9bd5, [0, 0.34, 0]);
  return mesh(b.build(), MAT.base, false);
}

/* ======================= edificios y utilería ======================= */
export function makeHouse() {
  const b = new Builder();
  b.box(5.2, 0.4, 4.4, C.stone, [0, 0.2, 0]);
  b.box(5, 2.8, 4.2, C.wall, [0, 1.8, 0]);
  for (const x of [-2.45, 2.45]) for (const z of [-2.05, 2.05]) b.box(0.25, 2.9, 0.25, C.woodDark, [x, 1.85, z]);
  b.box(5.1, 0.2, 4.3, C.woodDark, [0, 3.2, 0]);
  // techo a dos aguas
  b.box(5.8, 0.25, 2.9, C.roof, [0, 4.05, 1.05], [0.62, 0, 0]).box(5.8, 0.25, 2.9, C.roof, [0, 4.05, -1.05], [-0.62, 0, 0]);
  b.add(new THREE.CylinderGeometry(0.01, 2.2, 1.6, 3), C.wall2, [2.45, 3.95, 0], [0, 0, Math.PI / 2], [1, 1, 1.25]);
  b.add(new THREE.CylinderGeometry(0.01, 2.2, 1.6, 3), C.wall2, [-2.45, 3.95, 0], [0, 0, -Math.PI / 2], [1, 1, 1.25]);
  b.box(0.6, 1.6, 0.6, C.stoneDark, [1.5, 4.6, -0.8]);
  // puerta, escalón, macetas
  b.box(1.1, 1.9, 0.12, C.woodDark, [0, 1.35, 2.12]).ball(0.06, C.yellow, [0.35, 1.35, 2.2]);
  b.box(1.6, 0.18, 0.7, C.stone, [0, 0.09, 2.5]);
  b.box(0.5, 0.35, 0.4, C.woodLight, [-1.2, 0.18, 2.45]).ball(0.25, C.pink, [-1.2, 0.5, 2.45], [1, 0.7, 1]);
  b.box(0.5, 0.35, 0.4, C.woodLight, [1.2, 0.18, 2.45]).ball(0.25, C.yellow, [1.2, 0.5, 2.45], [1, 0.7, 1]);
  for (const x of [-1.6, 1.6]) b.box(0.9, 0.1, 0.15, C.woodDark, [x, 1.25, 2.15]).box(0.12, 0.8, 0.14, C.woodDark, [x, 1.75, 2.13]);
  const win = new Builder();
  for (const x of [-1.6, 1.6]) win.box(0.8, 0.8, 0.06, 0xffd27a, [x, 1.8, 2.11]);
  win.box(0.06, 0.8, 0.8, 0xffd27a, [2.51, 1.8, 0]).box(0.06, 0.8, 0.8, 0xffd27a, [-2.51, 1.8, 0]);
  const g = new THREE.Group();
  g.add(mesh(b.build()));
  const w = mesh(win.build(), MAT.glow, false); g.add(w);
  return g;
}

export function makeBarn() {
  const b = new Builder();
  b.box(5.2, 3.2, 4.2, 0xc0473a, [0, 1.6, 0]);
  b.box(5.4, 0.25, 3.1, C.stoneDark, [0, 3.65, 1.05], [0.75, 0, 0]).box(5.4, 0.25, 3.1, C.stoneDark, [0, 3.65, -1.05], [-0.75, 0, 0]);
  b.add(new THREE.CylinderGeometry(0.01, 2.2, 1.8, 3), 0xc0473a, [2.6, 3.7, 0], [0, 0, Math.PI / 2], [1, 1, 1.0]);
  b.add(new THREE.CylinderGeometry(0.01, 2.2, 1.8, 3), 0xc0473a, [-2.6, 3.7, 0], [0, 0, -Math.PI / 2], [1, 1, 1.0]);
  b.box(2, 2.2, 0.1, C.white, [0, 1.1, 2.12]).box(1.8, 2, 0.12, 0x9a3a2f, [0, 1.05, 2.14]);
  b.box(2.4, 0.12, 0.14, C.white, [0, 1.05, 2.2], [0, 0, 0.75]).box(2.4, 0.12, 0.14, C.white, [0, 1.05, 2.2], [0, 0, -0.75]);
  b.box(0.9, 0.9, 0.1, C.white, [0, 3.0, 2.12]);
  // fardos de heno
  b.box(1, 0.6, 0.6, C.straw, [-3.2, 0.3, 1.4]).box(1, 0.6, 0.6, C.strawDark, [-3.2, 0.9, 1.4]).box(1, 0.6, 0.6, C.straw, [-3.2, 0.3, 0.6]);
  return mesh(b.build());
}

export function makeWell() {
  const b = new Builder();
  b.cyl(0.9, 1, 0.9, 10, C.stone, [0, 0.45, 0]).cyl(0.7, 0.7, 0.05, 10, C.water, [0, 0.86, 0]);
  b.box(0.15, 1.6, 0.15, C.woodDark, [0.85, 1.4, 0]).box(0.15, 1.6, 0.15, C.woodDark, [-0.85, 1.4, 0]);
  b.box(2.2, 0.15, 1.3, C.roof2, [0, 2.35, 0.35], [0.5, 0, 0]).box(2.2, 0.15, 1.3, C.roof2, [0, 2.35, -0.35], [-0.5, 0, 0]);
  b.cyl(0.07, 0.07, 1.7, 6, C.woodLight, [0, 1.75, 0], [0, 0, Math.PI / 2]);
  b.cyl(0.18, 0.15, 0.25, 8, C.woodLight, [0.3, 1.25, 0]);
  return mesh(b.build());
}

export function makeMill() {
  const b = new Builder();
  b.cyl(1.1, 1.6, 5.5, 8, C.wall, [0, 2.75, 0]).cone(1.5, 1.6, 8, C.roof, [0, 6.3, 0]);
  b.box(0.9, 1.5, 0.1, C.woodDark, [0, 0.75, 1.55]).box(0.5, 0.5, 0.1, 0x6fa8dc, [0, 3.6, 1.28]);
  b.cyl(0.18, 0.18, 0.8, 6, C.woodDark, [0, 4.8, 1.3], [Math.PI / 2, 0, 0]);
  const tower = mesh(b.build());
  const bl = new Builder();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    bl.box(0.18, 2.6, 0.06, C.woodLight, [Math.sin(a) * 1.3, Math.cos(a) * 1.3, 0], [0, 0, -a]);
    bl.box(0.7, 2.0, 0.03, C.apron, [Math.sin(a) * 1.4 + Math.cos(a) * 0.35, Math.cos(a) * 1.4 - Math.sin(a) * 0.35, 0.03], [0, 0, -a]);
  }
  bl.cyl(0.25, 0.25, 0.3, 8, C.woodDark, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const blades = mesh(bl.build());
  blades.position.set(0, 4.8, 1.75);
  // tablones rotos (antes de reparar)
  const broken = mesh(new Builder().box(1.6, 0.1, 0.3, C.woodDark, [0.6, 0.06, 2.4], [0, 0.4, 0]).box(1.2, 0.1, 0.25, C.woodLight, [-0.7, 0.06, 2.2], [0, -0.3, 0]).dodec(0.3, C.stone, [1.4, 0.15, 1.7]).build());
  const g = new THREE.Group(); g.add(tower, blades, broken);
  return { group: g, blades, broken };
}

/** Invernadero mágico por etapa: 0 cimientos, 1 estructura, 2 vidrio, 3 terminado (runas brillando). */
export function makeGreenhouse() {
  const g = new THREE.Group();
  const base = mesh(new Builder().box(7.2, 0.3, 5.2, C.stone, [0, 0.15, 0]).box(0.9, 0.2, 0.6, C.woodLight, [-2.8, 0.4, 2.9]).box(0.5, 0.5, 0.5, C.woodDark, [2.9, 0.55, 2.9]).build());
  const fb = new Builder();
  for (const x of [-3.5, -1.75, 0, 1.75, 3.5]) for (const z of [-2.5, 2.5]) fb.box(0.14, 2.6, 0.14, 0xf7f3ea, [x, 1.6, z]);
  for (const z of [-2.5, 2.5]) fb.box(7.1, 0.14, 0.14, 0xf7f3ea, [0, 2.9, z]);
  for (const x of [-3.5, 0, 3.5]) fb.box(0.12, 0.12, 5.2, 0xf7f3ea, [x, 2.9, 0]);
  fb.box(7.2, 0.12, 0.12, 0xf7f3ea, [0, 4.0, 0]);
  for (const x of [-3.5, -1.75, 0, 1.75, 3.5]) { fb.box(0.1, 0.1, 2.9, 0xf7f3ea, [x, 3.45, 1.25], [0.72, 0, 0]); fb.box(0.1, 0.1, 2.9, 0xf7f3ea, [x, 3.45, -1.25], [-0.72, 0, 0]); }
  const frame = mesh(fb.build());
  const gb = new Builder();
  gb.box(7, 2.6, 0.04, 0xffffff, [0, 1.6, 2.5]).box(7, 2.6, 0.04, 0xffffff, [0, 1.6, -2.5]).box(0.04, 2.6, 5, 0xffffff, [3.5, 1.6, 0]).box(0.04, 2.6, 5, 0xffffff, [-3.5, 1.6, 0]);
  gb.box(7, 0.04, 3.1, 0xffffff, [0, 3.45, 1.25], [0.72, 0, 0]).box(7, 0.04, 3.1, 0xffffff, [0, 3.45, -1.25], [-0.72, 0, 0]);
  const glassGeo = gb.build(); glassGeo.deleteAttribute('color');
  const glass = new THREE.Mesh(glassGeo, MAT.glass);
  const rb = new Builder();
  for (const x of [-3.5, 0, 3.5]) rb.box(0.5, 0.5, 0.06, C.rune, [x, 3.0, 2.58], [0, 0, Math.PI / 4]);
  rb.ball(0.35, C.rune2, [0, 4.25, 0], [1, 1.3, 1]);
  const runes = mesh(rb.build(), MAT.glow, false);
  g.add(base, frame, glass, runes);
  return { group: g, base, frame, glass, runes };
}

export function makeFenceSegment() { // 1 tramo de 2 m (para InstancedMesh)
  return new Builder().box(0.14, 0.9, 0.14, C.woodDark, [-1, 0.45, 0]).box(2.05, 0.1, 0.06, C.woodLight, [0, 0.65, 0]).box(2.05, 0.1, 0.06, C.woodLight, [0, 0.35, 0]).build();
}

export function makeTree() { // árbol frondoso (instanciado)
  return new Builder().cyl(0.18, 0.28, 1.6, 6, C.woodDark, [0, 0.8, 0]).dodec(1.2, C.leaf, [0, 2.3, 0], [1, 0.9, 1]).dodec(0.85, C.leaf2, [0.5, 2.9, 0.2]).dodec(0.75, C.leaf, [-0.5, 2.7, -0.3]).build();
}
export function makePine() {
  return new Builder().cyl(0.15, 0.25, 1.2, 5, C.woodDark, [0, 0.6, 0]).cone(1.3, 2, 7, C.pine, [0, 2, 0]).cone(1.0, 1.7, 7, C.pine2, [0, 3.0, 0]).cone(0.65, 1.3, 7, C.pine, [0, 3.9, 0]).build();
}
export function makeGrassTuft() {
  const b = new Builder();
  for (let i = 0; i < 3; i++) b.cone(0.07, 0.4, 3, i % 2 ? C.grass : C.leaf2, [Math.cos(i * 2.1) * 0.08, 0.2, Math.sin(i * 2.1) * 0.08], [Math.sin(i) * 0.3, i, Math.cos(i) * 0.3]);
  return b.build();
}
export function makeFlower(color) {
  return new Builder().cyl(0.015, 0.015, 0.3, 3, C.leaf, [0, 0.15, 0]).ball(0.08, color, [0, 0.32, 0], [1, 0.6, 1]).build();
}
export function makeBush() { return new Builder().dodec(0.6, C.leaf, [0, 0.45, 0], [1.2, 0.8, 1]).dodec(0.45, C.leaf2, [0.4, 0.55, 0.1]).build(); }
export function makeRock() { return new Builder().dodec(0.6, C.stone, [0, 0.3, 0], [1.3, 0.7, 1]).dodec(0.35, C.stoneDark, [0.5, 0.2, 0.3]).build(); }

export function makeStall(awning = C.red, awning2 = C.white) {
  const b = new Builder();
  b.box(3, 1, 1.4, C.wood, [0, 0.5, 0]).box(3.1, 0.1, 1.5, C.woodLight, [0, 1.02, 0]);
  for (const x of [-1.45, 1.45]) for (const z of [-0.65, 0.65]) b.box(0.12, 2.6, 0.12, C.woodDark, [x, 1.3, z]);
  for (let i = 0; i < 6; i++) b.box(0.52, 0.08, 1.9, i % 2 ? awning2 : awning, [-1.3 + i * 0.52, 2.7, 0.15], [0.25, 0, 0]);
  for (let i = 0; i < 6; i++) b.cone(0.26, 0.3, 3, i % 2 ? awning2 : awning, [-1.3 + i * 0.52, 2.4, 1.05], [Math.PI, 0, 0]);
  return b;
}

export function makeFountain() {
  const b = new Builder();
  b.cyl(2.4, 2.6, 0.6, 12, C.stone, [0, 0.3, 0]).cyl(2.1, 2.1, 0.05, 12, C.water, [0, 0.58, 0]);
  b.cyl(0.35, 0.5, 1.6, 8, C.stone, [0, 1.1, 0]).cyl(0.9, 0.6, 0.3, 10, C.stone, [0, 1.9, 0]).cyl(0.7, 0.7, 0.04, 10, C.water, [0, 2.04, 0]);
  b.ball(0.25, C.rune, [0, 2.3, 0]);
  return mesh(b.build());
}

/** Estante de semillas con bolsitas (las bolsitas son una InstancedMesh aparte para mostrar el stock). */
export function makeShelf() {
  return new Builder().box(1.6, 0.08, 0.6, C.woodLight, [0, 0.5, 0]).box(1.6, 0.08, 0.6, C.woodLight, [0, 1.1, 0]).box(1.6, 0.08, 0.6, C.woodLight, [0, 1.7, 0])
    .box(0.08, 1.9, 0.6, C.woodDark, [-0.8, 0.95, 0]).box(0.08, 1.9, 0.6, C.woodDark, [0.8, 0.95, 0]).box(1.6, 1.9, 0.05, C.wood, [0, 0.95, -0.3]).build();
}
export function makeSack(color) {
  return new Builder().box(0.28, 0.34, 0.2, color, [0, 0.17, 0]).box(0.2, 0.08, 0.14, 0xf4ecd8, [0, 0.36, 0]).build();
}

export function makeBoard() {
  const b = new Builder();
  b.box(0.15, 2.2, 0.15, C.woodDark, [-1, 1.1, 0]).box(0.15, 2.2, 0.15, C.woodDark, [1, 1.1, 0]).box(2.3, 1.3, 0.1, C.wood, [0, 1.5, 0]);
  b.box(2.5, 0.15, 0.4, C.roof2, [0, 2.25, 0]);
  b.box(0.5, 0.6, 0.02, C.apron, [-0.65, 1.5, 0.06], [0, 0, 0.05]).box(0.5, 0.6, 0.02, 0xfff3bf, [0, 1.45, 0.06], [0, 0, -0.04]).box(0.5, 0.6, 0.02, C.apron, [0.65, 1.52, 0.06], [0, 0, 0.03]);
  return mesh(b.build());
}

export function makeForge() {
  const b = new Builder();
  b.box(1.6, 1.0, 1.2, C.stoneDark, [0, 0.5, 0]).box(1.2, 1.6, 0.9, C.stone, [0, 1.6, -0.2]).cyl(0.25, 0.3, 1.6, 6, C.stoneDark, [0, 3, -0.2]);
  b.box(0.8, 0.3, 0.35, C.iron, [1.6, 0.85, 0.3]).box(0.35, 0.5, 0.3, C.iron, [1.6, 0.45, 0.3]).box(0.5, 0.15, 0.5, C.dark, [1.6, 0.15, 0.3]);
  for (let i = 0; i < 4; i++) b.box(0.05, 0.9, 0.05, C.woodLight, [-1.1 + i * 0.08, 1.2, -0.65], [0, 0, 0.1]);
  const g = new THREE.Group();
  g.add(mesh(b.build()));
  g.add(mesh(new Builder().box(0.9, 0.35, 0.2, 0xff8a3d, [0, 1.15, 0.62]).build(), MAT.glow, false));
  return g;
}

export function makeTent() {
  const b = new Builder();
  b.add(new THREE.ConeGeometry(2.6, 2.4, 8), 0xf6d04d, [0, 3.6, 0]);
  b.cyl(2.6, 2.6, 2.4, 8, 0xfff3bf, [0, 1.2, 0]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; b.box(0.25, 2.42, 0.05, i % 2 ? C.red : C.accent, [Math.cos(a) * 2.42, 1.2, Math.sin(a) * 2.42], [0, -a + Math.PI / 2, 0]); }
  b.cyl(0.05, 0.05, 1.2, 4, C.woodDark, [0, 5.3, 0]).box(0.6, 0.35, 0.03, C.accent, [0.3, 5.7, 0]);
  b.box(2.6, 0.9, 1.0, C.wood, [0, 0.45, 2.9]).box(2.7, 0.1, 1.1, C.woodLight, [0, 0.92, 2.9]);
  b.box(2.6, 0.4, 0.05, C.red, [0, 2.2, 2.62]);
  return mesh(b.build());
}

export function makePen() { // corral del refugio / corral de la granja (sin el cerco)
  return new Builder().box(1.2, 0.4, 0.5, C.woodLight, [0, 0.2, 0]).box(1.1, 0.1, 0.4, C.straw, [0, 0.42, 0]).build();
}

export function makeSign(color = C.accent) {
  return mesh(new Builder().box(0.15, 1.8, 0.15, C.woodDark, [0, 0.9, 0]).box(1.5, 0.5, 0.08, C.woodLight, [0, 1.55, 0.05]).box(0.4, 0.3, 0.1, color, [0.62, 1.55, 0.1], [0, 0, Math.PI / 4]).build());
}

/* ---------- decoración ---------- */
export const DECOR = {
  farol: { name: 'Farol rúnico', icon: '🏮', price: 30 },
  banco: { name: 'Banco de madera', icon: '🪑', price: 40 },
  maceta: { name: 'Maceta florida', icon: '🌷', price: 25 },
  espantapajaros: { name: 'Espantapájaros', icon: '🎃', price: 50 },
};
export function makeDecor(kind) {
  const b = new Builder(), glow = new Builder();
  if (kind === 'farol') { b.cyl(0.06, 0.08, 1.8, 6, C.dark, [0, 0.9, 0]).box(0.4, 0.06, 0.4, C.dark, [0, 2.1, 0]).box(0.36, 0.06, 0.36, C.dark, [0, 1.75, 0]); glow.box(0.28, 0.3, 0.28, 0xffd27a, [0, 1.93, 0]); }
  else if (kind === 'banco') b.box(1.5, 0.08, 0.45, C.woodLight, [0, 0.45, 0]).box(1.5, 0.35, 0.06, C.woodLight, [0, 0.75, -0.2], [-0.15, 0, 0]).box(0.1, 0.45, 0.4, C.woodDark, [0.6, 0.22, 0]).box(0.1, 0.45, 0.4, C.woodDark, [-0.6, 0.22, 0]);
  else if (kind === 'maceta') { b.cyl(0.35, 0.25, 0.45, 8, 0xc9673e, [0, 0.22, 0]); for (let i = 0; i < 5; i++) { const a = i * 1.25; b.ball(0.14, [C.pink, C.yellow, 0xff6b6b, 0xb197fc, C.white][i], [Math.cos(a) * 0.18, 0.62, Math.sin(a) * 0.18], [1, 0.7, 1]); } b.ball(0.22, C.leaf, [0, 0.5, 0], [1.3, 0.6, 1.3]); }
  else { b.cyl(0.05, 0.05, 2, 5, C.woodDark, [0, 1, 0]).box(1.3, 0.08, 0.08, C.woodDark, [0, 1.45, 0]).cyl(0.3, 0.38, 0.75, 6, 0x5a7fb5, [0, 1.35, 0]).ball(0.3, C.pumpkin, [0, 1.95, 0], [1.1, 0.9, 1], 1).cyl(0.42, 0.45, 0.05, 10, C.straw, [0, 2.2, 0]).cyl(0.18, 0.22, 0.25, 8, C.straw, [0, 2.32, 0]);
    for (const sd of [-1, 1]) b.cone(0.12, 0.3, 4, C.straw, [0.7 * sd, 1.45, 0], [0, 0, sd * Math.PI / 2]); }
  const g = new THREE.Group(); g.add(mesh(b.build()));
  if (glow.parts.length) g.add(mesh(glow.build(), MAT.glow, false));
  return g;
}

/* ======================= bosque ======================= */
export function makeMushroom(color) {
  return new Builder().cyl(0.12, 0.16, 0.5, 6, C.white, [0, 0.25, 0]).ball(0.35, color, [0, 0.55, 0], [1, 0.55, 1], 1).ball(0.06, C.white, [0.18, 0.66, 0.1]).ball(0.05, C.white, [-0.12, 0.7, -0.12]).build();
}
export function makeRuneBush() {
  const b = new Builder().dodec(0.7, 0x2f7a5a, [0, 0.55, 0], [1.2, 0.9, 1.1]).dodec(0.45, 0x3f9a6a, [0.4, 0.75, 0.2]);
  const glow = new Builder();
  for (let i = 0; i < 5; i++) { const a = i * 1.3; glow.ball(0.09, C.rune2, [Math.cos(a) * 0.62, 0.6 + (i % 2) * 0.35, Math.sin(a) * 0.55]); }
  return { geo: b.build(), glow: glow.build() };
}
export function makeLog() {
  return new Builder().cyl(0.32, 0.36, 2.2, 8, C.woodDark, [0, 0.33, 0], [0, 0, Math.PI / 2]).cyl(0.3, 0.3, 0.02, 8, C.woodLight, [1.11, 0.33, 0], [0, 0, Math.PI / 2]).cyl(0.3, 0.3, 0.02, 8, C.woodLight, [-1.11, 0.33, 0], [0, 0, Math.PI / 2]).ball(0.18, 0x6fae4a, [0.3, 0.62, 0.1], [1.4, 0.4, 1]).build();
}
export function makeCrystal() {
  const b = new Builder().dodec(0.55, C.stoneDark, [0, 0.25, 0], [1.3, 0.6, 1.1]);
  const glow = new Builder().cone(0.22, 1.1, 5, C.rune, [0, 0.8, 0], [0.1, 0, 0.1]).cone(0.16, 0.8, 5, C.rune2, [0.3, 0.6, 0.15], [0.3, 0, -0.4]).cone(0.14, 0.7, 5, C.rune, [-0.28, 0.55, -0.1], [-0.3, 0, 0.45]);
  return { geo: b.build(), glow: glow.build() };
}
export function makeShrine() {
  const b = new Builder();
  b.cyl(2, 2.2, 0.3, 10, C.stone, [0, 0.15, 0]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.box(0.45, 1.6 + (i % 2) * 0.5, 0.35, C.stoneDark, [Math.cos(a) * 2.6, 0.8, Math.sin(a) * 2.6], [0, -a, 0.05]); }
  b.box(0.9, 0.9, 0.9, C.stone, [0, 0.75, 0]);
  const glow = new Builder();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; glow.box(0.22, 0.22, 0.03, i % 2 ? C.rune2 : C.rune, [Math.cos(a) * 2.42, 1.1, Math.sin(a) * 2.42], [0, -a + Math.PI / 2, Math.PI / 4]); }
  glow.ball(0.28, C.rune2, [0, 1.5, 0], [1, 1.2, 1], 1);
  const g = new THREE.Group(); g.add(mesh(b.build())); const gl = mesh(glow.build(), MAT.glow, false); g.add(gl);
  return { group: g, glow: gl };
}

/* ======================= rivales ======================= */
/** Topo travieso: redondo, orejas grandes, runa en la frente. */
export function makeMole() {
  const b = new Builder();
  b.ball(0.38, 0x8a6a52, [0, 0.3, 0], [1, 0.9, 1.05], 1).ball(0.09, 0xf5a3b5, [0, 0.32, 0.38]);
  b.ball(0.16, 0x8a6a52, [0.3, 0.6, 0], [0.5, 1.2, 0.9]).ball(0.16, 0x8a6a52, [-0.3, 0.6, 0], [0.5, 1.2, 0.9]);
  b.ball(0.1, 0xf5a3b5, [0.32, 0.6, 0.04], [0.3, 0.9, 0.6]).ball(0.1, 0xf5a3b5, [-0.32, 0.6, 0.04], [0.3, 0.9, 0.6]);
  b.ball(0.045, C.dark, [0.12, 0.42, 0.32]).ball(0.045, C.dark, [-0.12, 0.42, 0.32]);
  b.box(0.12, 0.12, 0.02, C.rune2, [0, 0.55, 0.3], [0.4, 0, Math.PI / 4]);
  b.box(0.12, 0.05, 0.12, 0xf0e6d2, [0.18, 0.08, 0.3]).box(0.12, 0.05, 0.12, 0xf0e6d2, [-0.18, 0.08, 0.3]);
  return mesh(b.build());
}
export function makeMound() { return mesh(new Builder().ball(0.45, C.soil, [0, 0, 0], [1.2, 0.45, 1.2]).dodec(0.12, C.soilWet, [0.3, 0.12, 0.1]).dodec(0.1, C.soilWet, [-0.25, 0.1, -0.2]).build()); }
/** Cuervo: alas separadas para aletear. */
export function makeCrow() {
  const g = new THREE.Group();
  const body = new Builder().ball(0.3, 0x1f1d2b, [0, 0, 0], [0.8, 0.8, 1.4], 1).ball(0.2, 0x262435, [0, 0.12, 0.38], [1, 1, 1], 1)
    .cone(0.07, 0.25, 4, C.yellow, [0, 0.1, 0.62], [Math.PI / 2, 0, 0]).ball(0.04, 0xffe066, [0.1, 0.18, 0.5]).ball(0.04, 0xffe066, [-0.1, 0.18, 0.5])
    .cone(0.2, 0.45, 4, 0x1f1d2b, [0, 0.02, -0.5], [-Math.PI / 2, 0, 0]);
  g.add(mesh(body.build()));
  const wingGeo = new Builder().box(0.8, 0.05, 0.4, 0x2b2840, [0.4, 0, 0]).box(0.4, 0.04, 0.3, 0x1f1d2b, [0.85, 0, -0.05]).build();
  const wings = [-1, 1].map(sd => { const w = mesh(wingGeo); w.scale.x = sd; w.position.set(0.15 * sd, 0.05, 0); g.add(w); return w; });
  return { group: g, wings };
}
/** Espíritu del clima: nube con núcleo luminoso; rayos de sol o cristales de hielo. */
export function makeSpirit(type) {
  const g = new THREE.Group();
  const b = new Builder();
  const cl = type === 'sol' ? 0xfff1d6 : 0xe6f4ff;
  b.ball(0.45, cl, [0, 0, 0], [1.3, 0.8, 1], 1).ball(0.32, cl, [0.45, 0.05, 0.05], [1, 0.9, 1], 1).ball(0.32, cl, [-0.45, 0.02, -0.05], [1, 0.9, 1], 1).ball(0.28, cl, [0.1, 0.32, 0], [1, 0.9, 1], 1);
  b.ball(0.06, C.dark, [0.15, 0.08, 0.42]).ball(0.06, C.dark, [-0.15, 0.08, 0.42]).ball(0.05, 0xf59ac0, [0, -0.05, 0.45], [1.2, 0.5, 0.5]);
  g.add(mesh(b.build(), MAT.base, false));
  const glow = new Builder();
  if (type === 'sol') for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; glow.cone(0.08, 0.35, 3, 0xffc94d, [Math.cos(a) * 0.95, Math.sin(a) * 0.6, -0.2], [0, 0, a - Math.PI / 2]); }
  else for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; glow.add(new THREE.OctahedronGeometry(0.13, 0), 0xa5e3ff, [Math.cos(a) * 0.9, Math.sin(a) * 0.55, -0.1], [0, 0, a], [0.6, 1.4, 0.6]); }
  glow.ball(0.16, type === 'sol' ? 0xffd27a : 0xbfe9ff, [0, -0.45, 0], [1, 1.4, 1]);
  const halo = mesh(glow.build(), MAT.glow, false); g.add(halo);
  return { group: g, halo };
}
/** Gran espíritu de la tormenta (evento final). */
export function makeStormSpirit() {
  const g = new THREE.Group();
  const b = new Builder();
  for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 2 + (i % 4) * 1.1; b.ball(1.6 + (i % 3) * 0.5, i % 2 ? 0x4b5568 : 0x5d6880, [Math.cos(a) * r, Math.sin(i * 1.7) * 0.8, Math.sin(a) * r * 0.6], [1.3, 0.7, 1], 1); }
  b.ball(2.6, 0x3d4558, [0, 0.4, 0], [1.4, 0.9, 1], 1);
  const body = mesh(b.build(), MAT.base, false); g.add(body);
  const glow = new Builder().ball(0.5, 0xfff2a8, [1, 0.8, 2.3], [1.3, 0.7, 0.5]).ball(0.5, 0xfff2a8, [-1, 0.8, 2.3], [1.3, 0.7, 0.5]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; glow.box(0.6, 0.6, 0.1, i % 2 ? C.rune : C.rune2, [Math.cos(a) * 5.2, -1.2, Math.sin(a) * 3.2], [0, -a, Math.PI / 4]); }
  const eyes = mesh(glow.build(), MAT.glow, false); g.add(eyes);
  return { group: g, eyes, body };
}

/* ---------- utilería del evento ---------- */
export function makeBell(color) {
  const b = new Builder().box(0.16, 2.4, 0.16, C.woodDark, [-0.6, 1.2, 0]).box(0.16, 2.4, 0.16, C.woodDark, [0.6, 1.2, 0]).box(1.5, 0.18, 0.25, C.woodDark, [0, 2.45, 0]);
  const bell = new Builder().cone(0.38, 0.6, 8, color, [0, -0.3, 0]).ball(0.1, C.dark, [0, -0.62, 0]).torus(0.08, 0.03, C.iron, [0, 0.02, 0]).build();
  const g = new THREE.Group(); g.add(mesh(b.build()));
  const bm = mesh(bell, MAT.base, false); bm.position.set(0, 2.3, 0); g.add(bm);
  return { group: g, bell: bm };
}
export function makeRod() {
  const b = new Builder().box(0.4, 0.3, 0.4, C.stone, [0, 0.15, 0]).cyl(0.05, 0.07, 2.8, 5, C.iron, [0, 1.6, 0]).cone(0.12, 0.4, 5, C.iron, [0, 3.15, 0]);
  const glow = new Builder().ball(0.18, C.rune, [0, 2.5, 0], [1, 1.4, 1]).box(0.18, 0.18, 0.03, C.rune2, [0, 0.9, 0.08], [0, 0, Math.PI / 4]);
  const g = new THREE.Group(); g.add(mesh(b.build())); const gl = mesh(glow.build(), MAT.glow, false); g.add(gl);
  return { group: g, glow: gl };
}
export function makeGate() {
  const b = new Builder().box(1.6, 0.6, 0.3, C.stone, [0, 0.3, 0]);
  const door = mesh(new Builder().box(1.1, 0.7, 0.08, C.woodDark, [0, 0.35, 0]).box(0.1, 0.5, 0.1, C.iron, [0, 0.9, 0]).build());
  door.position.set(0, 0.3, 0.2);
  const g = new THREE.Group(); g.add(mesh(b.build()), door);
  return { group: g, door };
}
