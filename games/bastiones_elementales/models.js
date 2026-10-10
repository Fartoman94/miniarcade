// @ts-check
/* Bastiones Elementales — modelos low-poly procedurales: geometrías fusionadas con color por vértice (un draw call por pieza).
   Todos miran hacia +Z; el pivote está en el piso. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../matelabs/kit3d.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

/** Acumula primitivas con color (con oclusión simple por altura) y las fusiona en una geometría. */
export class GeoBuilder {
  constructor(seed = 7) { /** @type {THREE.BufferGeometry[]} */ this.parts = []; this.r = rng(seed); }
  /**
   * @param {THREE.BufferGeometry} geo @param {number} color @param {number[]} [pos] @param {number[]} [rot] @param {number[]} [scl]
   * @param {number} [jitter] @param {number} [ao] intensidad de la oclusión por altura (0 = sin)
   */
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], jitter = 0.06, ao = 0.25) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
    g.applyMatrix4(_m);
    const P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
    _c.set(color);
    if (jitter) _c.multiplyScalar(1 + (this.r() - 0.5) * 2 * jitter);
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { const y = P.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < n; i++) {
      const k = ao ? (1 - ao) + ao * ((P.getY(i) - y0) / Math.max(0.001, y1 - y0)) : 1;
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    this.parts.push(g);
    return this;
  }
  box(x, y, z, w, h, d, color, ry = 0, rx = 0, rz = 0) { return this.add(UNIT_BOX, color, [x, y, z], [rx, ry, rz], [w, h, d]); }
  cyl(x, y, z, rt, rb, h, seg, color, rx = 0, rz = 0, ry = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); this.add(g, color, [x, y, z], [rx, ry, rz]); g.dispose(); return this;
  }
  cone(x, y, z, r, h, seg, color, rx = 0, rz = 0) { return this.cyl(x, y, z, 0, r, h, seg, color, rx, rz); }
  ico(x, y, z, r, color, sx = 1, sy = 1, sz = 1, detail = 0) {
    const g = new THREE.IcosahedronGeometry(r, detail); this.add(g, color, [x, y, z], [0, 0, 0], [sx, sy, sz]); g.dispose(); return this;
  }
  oct(x, y, z, r, color, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) {
    const g = new THREE.OctahedronGeometry(r, 0); this.add(g, color, [x, y, z], [0, ry, rz], [sx, sy, sz], 0.04, 0.15); g.dispose(); return this;
  }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Materiales compartidos. */
export function createMaterials() {
  return {
    solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55, flatShading: true }),
    glowV: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    ring: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    range: new THREE.MeshBasicMaterial({ color: 0x8f7bff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    rangeEdge: new THREE.MeshBasicMaterial({ color: 0xc8bcff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  };
}

/* ======================= escenario ======================= */
/** Plataforma de construcción hexagonal. */
export function buildPad() {
  const b = new GeoBuilder(11);
  b.cyl(0, 0.12, 0, 0.92, 0.98, 0.24, 6, 0x7d7a82);
  b.cyl(0, 0.27, 0, 0.8, 0.88, 0.08, 6, 0x9a96a2);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; b.box(Math.cos(a) * 0.86, 0.2, Math.sin(a) * 0.86, 0.12, 0.18, 0.12, 0x5d5a64, -a); }
  return b.build();
}
/** Runa brillante del centro de la plataforma (se tiñe por instancia). */
export function buildPadRune() {
  const g = new THREE.RingGeometry(0.42, 0.56, 6); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 6); g.translate(0, 0.32, 0);
  return g;
}

/** Decoración por tipo de mapa. @param {string} kind */
export function buildDecor(kind) {
  const b = new GeoBuilder(kind.length * 13);
  if (kind === 'pino') {
    b.cyl(0, 0.35, 0, 0.12, 0.16, 0.7, 5, 0x5a3e2a);
    b.cone(0, 1.1, 0, 0.9, 1.3, 7, 0x2f5a4a); b.cone(0, 1.75, 0, 0.7, 1.1, 7, 0x356a55); b.cone(0, 2.35, 0, 0.45, 0.9, 7, 0x3b7660);
    b.cone(0, 1.42, 0, 0.62, 0.55, 7, 0xf2f8ff); b.cone(0, 2.0, 0, 0.46, 0.45, 7, 0xf2f8ff); b.cone(0, 2.62, 0, 0.26, 0.38, 7, 0xffffff);
  } else if (kind === 'obsidiana') {
    b.oct(0, 0.9, 0, 0.55, 0x2a2030, 0.8, 2.0, 0.8, 0.3);
    b.oct(0.45, 0.55, 0.2, 0.35, 0x3a2a3a, 0.7, 1.6, 0.7, 0.9, 0.3);
    b.oct(-0.35, 0.45, -0.25, 0.3, 0x24182a, 0.8, 1.5, 0.8, 0.2, -0.25);
    b.ico(0, 0.12, 0, 0.6, 0x3a2c2a, 1.3, 0.3, 1.1);
  } else if (kind === 'roble') {
    b.cyl(0, 0.6, 0, 0.16, 0.24, 1.2, 6, 0x6a4a30);
    b.ico(0, 1.75, 0, 0.95, 0x4f8a3e, 1, 0.85, 1); b.ico(0.5, 1.5, 0.3, 0.6, 0x5c9a46); b.ico(-0.45, 1.55, -0.25, 0.6, 0x467e38);
  } else if (kind === 'roca') {
    b.ico(0, 0.3, 0, 0.55, 0x8a8a92, 1.2, 0.7, 1); b.ico(0.4, 0.2, 0.25, 0.32, 0x7a7a84);
  } else if (kind === 'roca_lava') {
    b.ico(0, 0.3, 0, 0.55, 0x4a3a3a, 1.2, 0.7, 1); b.ico(0.4, 0.2, 0.25, 0.32, 0x3a2c2c);
  } else if (kind === 'menhir') {
    b.box(0, 0.9, 0, 0.5, 1.8, 0.35, 0x8c9096, 0.2, 0.05, 0.06); b.box(0, 0.05, 0, 0.9, 0.1, 0.7, 0x6a6e74);
  } else if (kind === 'hielo') {
    b.oct(0, 0.7, 0, 0.4, 0xbfe8ff, 0.6, 2.0, 0.6, 0.2); b.oct(0.3, 0.45, 0.15, 0.28, 0x9ad8ff, 0.6, 1.8, 0.6, 0.7, 0.35);
  } else if (kind === 'hierba') {
    for (let i = 0; i < 5; i++) b.cone(Math.cos(i * 1.3) * 0.25, 0.2, Math.sin(i * 1.3) * 0.25, 0.08, 0.4 + (i % 3) * 0.1, 3, 0x6aa04a, 0.15 * Math.cos(i), 0.15 * Math.sin(i));
  } else if (kind === 'brasa') {
    b.ico(0, 0.1, 0, 0.35, 0x2a1a18, 1.3, 0.4, 1.1); b.ico(0.1, 0.18, 0, 0.12, 0xff6a2a);
  } else if (kind === 'nieve') {
    b.ico(0, 0.05, 0, 0.5, 0xf5faff, 1.4, 0.25, 1.1);
  }
  return b.build();
}

/** Tablones de puente (largo en X = 2 baldosas, ancho 1.6). */
export function buildBridgeDeck(len) {
  const b = new GeoBuilder(31);
  const n = Math.round(len / 0.5);
  for (let i = 0; i < n; i++) b.box(-len / 2 + 0.25 + i * 0.5, 0, 0, 0.44, 0.14, 1.7, i % 2 ? 0x8a5e3a : 0x7a5232);
  b.box(0, 0.1, 0.82, len, 0.08, 0.12, 0x5a3a24); b.box(0, 0.1, -0.82, len, 0.08, 0.12, 0x5a3a24);
  for (let i = 0; i <= 2; i++) { const x = -len / 2 + 0.1 + i * (len - 0.2) / 2; b.box(x, 0.4, 0.85, 0.12, 0.7, 0.12, 0x4a2e1c); b.box(x, 0.4, -0.85, 0.12, 0.7, 0.12, 0x4a2e1c); }
  b.box(0, 0.68, 0.85, len, 0.08, 0.1, 0x6a4428); b.box(0, 0.68, -0.85, len, 0.08, 0.1, 0x6a4428);
  // cadenas de hierro
  b.box(-len / 2 + 0.1, 0.9, 0.85, 0.08, 0.5, 0.08, 0x3a3a40); b.box(-len / 2 + 0.1, 0.9, -0.85, 0.08, 0.5, 0.08, 0x3a3a40);
  return b.build();
}
/** Pilar de piedra a cada lado del puente. */
export function buildBridgePost() {
  const b = new GeoBuilder(5);
  b.box(0, 0.5, 0, 0.55, 1.6, 0.55, 0x8a8690); b.box(0, 1.35, 0, 0.7, 0.18, 0.7, 0x6a6670); b.oct(0, 1.62, 0, 0.18, 0xd0c8ff);
  return b.build();
}

/** Palanca: base + mango (mango por separado para animarlo). */
export function buildLever() {
  const base = new GeoBuilder(9);
  base.box(0, 0.25, 0, 1.0, 0.5, 0.8, 0x6a6670); base.box(0, 0.55, 0, 0.8, 0.1, 0.6, 0x8a8690);
  base.cyl(0, 0.62, 0, 0.18, 0.22, 0.12, 8, 0x3a3a44);
  base.cyl(0, 0.3, 0, 0.62, 0.62, 0.06, 16, 0x2a2a30, Math.PI / 2);
  const handle = new GeoBuilder(10);
  handle.cyl(0, 0.55, 0, 0.06, 0.07, 1.1, 6, 0x4a4a52);
  handle.ico(0, 1.15, 0, 0.17, 0xd94a3a);
  return { base: base.build(), handle: handle.build() };
}

/** Cristal principal: cúmulo de cristales + pedestal. */
export function buildMainCrystal() {
  const ped = new GeoBuilder(21);
  ped.cyl(0, 0.2, 0, 1.6, 1.8, 0.4, 8, 0x6a6474); ped.cyl(0, 0.5, 0, 1.25, 1.45, 0.25, 8, 0x8a84a0);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ped.box(Math.cos(a) * 1.5, 0.75, Math.sin(a) * 1.5, 0.22, 0.9, 0.22, 0x55506a, -a); ped.oct(Math.cos(a) * 1.5, 1.3, Math.sin(a) * 1.5, 0.13, 0xd8ccff); }
  const core = new GeoBuilder(22);
  core.oct(0, 2.4, 0, 0.9, 0xb9a8ff, 0.8, 2.1, 0.8);
  core.oct(0.6, 1.5, 0.2, 0.45, 0x9a86ff, 0.6, 1.5, 0.6, 0.4, -0.4);
  core.oct(-0.55, 1.4, -0.25, 0.42, 0xa896ff, 0.6, 1.5, 0.6, 0.9, 0.45);
  core.oct(0.1, 1.3, -0.6, 0.38, 0x8a76ff, 0.6, 1.4, 0.6, 0.2, 0.3);
  return { pedestal: ped.build(), core: core.build() };
}
/** Cristal auxiliar (más chico, verde-turquesa). */
export function buildAuxCrystal() {
  const ped = new GeoBuilder(23);
  ped.cyl(0, 0.15, 0, 0.75, 0.85, 0.3, 6, 0x6a6a72);
  const core = new GeoBuilder(24);
  core.oct(0, 1.15, 0, 0.5, 0x7dffd0, 0.75, 1.9, 0.75);
  core.oct(0.35, 0.75, 0.1, 0.26, 0x5ae8b8, 0.6, 1.5, 0.6, 0.3, -0.45);
  core.oct(-0.32, 0.7, -0.12, 0.24, 0x4ad8a8, 0.6, 1.5, 0.6, 0.7, 0.45);
  const shards = new GeoBuilder(25);
  shards.oct(0.3, 0.35, 0.1, 0.22, 0x3a7a68, 0.7, 0.9, 0.7, 0.3, 1.2); shards.oct(-0.3, 0.3, -0.2, 0.2, 0x2f6a58, 0.7, 0.8, 0.7, 1.2, -1.1);
  return { pedestal: ped.build(), core: core.build(), shards: shards.build() };
}

/** Portal de aparición. */
export function buildPortal() {
  const b = new GeoBuilder(41);
  b.box(-1.0, 1.2, 0, 0.4, 2.4, 0.5, 0x4a4456); b.box(1.0, 1.2, 0, 0.4, 2.4, 0.5, 0x4a4456); b.box(0, 2.5, 0, 2.6, 0.4, 0.6, 0x5a5468);
  b.oct(0, 2.85, 0, 0.25, 0xff5a8a); b.oct(-1.0, 2.55, 0, 0.16, 0xff5a8a); b.oct(1.0, 2.55, 0, 0.16, 0xff5a8a);
  const swirl = new THREE.CircleGeometry(0.85, 20); swirl.scale(1, 1.25, 1); swirl.translate(0, 1.15, 0);
  return { frame: b.build(), swirl };
}

/* ======================= torres ======================= */
/** Base de piedra según nivel (0..2). @param {number} lv @param {number} accent */
export function buildTowerBase(lv, accent) {
  const b = new GeoBuilder(50 + lv);
  const h = 0.9 + lv * 0.45;
  b.cyl(0, 0.35 + h / 2, 0, 0.58 - lv * 0.02, 0.72, h, 8, 0x9a94a6);
  b.cyl(0, 0.35 + h * 0.35, 0, 0.74, 0.74, 0.12, 8, 0x6a6476);
  b.cyl(0, 0.35 + h, 0, 0.7, 0.62, 0.16, 8, 0x7a748a);
  if (lv >= 1) b.cyl(0, 0.35 + h * 0.7, 0, 0.7, 0.7, 0.1, 8, accent);
  if (lv >= 2) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.box(Math.cos(a) * 0.62, 0.35 + h + 0.2, Math.sin(a) * 0.62, 0.2, 0.26, 0.2, 0x8a849a, -a); }
    b.box(0, 0.35 + h * 0.55, 0.69, 0.34, 0.6, 0.04, accent); b.box(0, 0.35 + h * 0.55, -0.69, 0.34, 0.6, 0.04, accent);
  }
  // ventanitas
  b.box(0.0, 0.35 + h * 0.5, 0.62, 0.16, 0.24, 0.06, 0x2a2434); b.box(0.62, 0.35 + h * 0.5, 0, 0.06, 0.24, 0.16, 0x2a2434);
  return { geo: b.build(), top: 0.35 + h + 0.08 };
}

/** Cabezal giratorio por tipo y nivel: {head (sólido), glow (brillo)}. @param {string} type @param {number} lv */
export function buildTowerHead(type, lv) {
  const b = new GeoBuilder(60 + lv), g = new GeoBuilder(70 + lv);
  const s = 1 + lv * 0.12;
  if (type === 'ballesta') {
    b.box(0, 0.18 * s, 0, 0.5 * s, 0.22 * s, 0.9 * s, 0x7a5232);
    b.box(0, 0.32 * s, 0.35 * s, 1.5 * s, 0.1 * s, 0.12 * s, 0x5a3a24);
    b.box(-0.72 * s, 0.32 * s, 0.22 * s, 0.1 * s, 0.1 * s, 0.3 * s, 0x5a3a24, 0.5);
    b.box(0.72 * s, 0.32 * s, 0.22 * s, 0.1 * s, 0.1 * s, 0.3 * s, 0x5a3a24, -0.5);
    b.box(0, 0.32 * s, 0.1 * s, 0.06, 0.06, 1.1 * s, 0xc8c0b0);
    b.cyl(0, 0.05, 0, 0.35, 0.4, 0.12, 8, 0x6a6476);
    if (lv >= 2) { b.box(0.22, 0.42 * s, 0.1, 0.06, 0.06, 1.0 * s, 0xc8c0b0); b.box(-0.22, 0.42 * s, 0.1, 0.06, 0.06, 1.0 * s, 0xc8c0b0); }
    g.oct(0, 0.32 * s, 0.68 * s, 0.09 * s, 0xffe6a8);
  } else if (type === 'fuego') {
    b.cyl(0, 0.12, 0, 0.42 * s, 0.32 * s, 0.25, 8, 0x3a3236);
    b.cyl(0, 0.4 * s, 0, 0.62 * s, 0.4 * s, 0.4 * s, 8, 0x5a3a2e);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; b.box(Math.cos(a) * 0.58 * s, 0.62 * s, Math.sin(a) * 0.58 * s, 0.1, 0.3, 0.1, 0xb06a2a, -a); }
    b.box(0, 0.42 * s, 0.6 * s, 0.24 * s, 0.24 * s, 0.4 * s, 0x4a3432);
    g.ico(0, 0.78 * s, 0, 0.36 * s, 0xffa040, 1, 1.35, 1); g.ico(0, 0.95 * s, 0, 0.2 * s, 0xffe08a, 1, 1.4, 1);
  } else if (type === 'hielo') {
    b.cyl(0, 0.1, 0, 0.42 * s, 0.46 * s, 0.2, 8, 0x5a6a80);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; b.box(Math.cos(a) * 0.36 * s, 0.35 * s, Math.sin(a) * 0.36 * s, 0.1, 0.5 * s, 0.1, 0x8ab0d0, -a, 0, 0.25); }
    g.oct(0, 0.85 * s, 0, 0.4 * s, 0xbff0ff, 0.7, 1.7, 0.7);
    g.oct(0.3 * s, 0.6 * s, 0, 0.18 * s, 0x8fe0ff, 0.6, 1.5, 0.6, 0, -0.5);
    g.oct(-0.3 * s, 0.6 * s, 0, 0.18 * s, 0x8fe0ff, 0.6, 1.5, 0.6, 0, 0.5);
  } else if (type === 'rayo') {
    b.cyl(0, 0.1, 0, 0.4 * s, 0.46 * s, 0.2, 8, 0x4a4656);
    b.cyl(0, 0.6 * s, 0, 0.1, 0.14, 1.0 * s, 6, 0x8a7a5a);
    b.cyl(0, 0.4 * s, 0, 0.36 * s, 0.36 * s, 0.07, 10, 0xc89a3a); b.cyl(0, 0.7 * s, 0, 0.3 * s, 0.3 * s, 0.07, 10, 0xc89a3a);
    if (lv >= 1) b.cyl(0, 0.95 * s, 0, 0.24 * s, 0.24 * s, 0.07, 10, 0xc89a3a);
    g.ico(0, 1.2 * s, 0, 0.26 * s, 0xfff3a0, 1, 1, 1, 1);
  }
  return { head: b.build(), glow: g.build() };
}

/** Bloque de hielo que encierra una torre congelada por el gólem. */
export function buildIceBlock() {
  const b = new GeoBuilder(80);
  b.oct(0, 1.2, 0, 1.0, 0xbfeaff, 1.0, 1.6, 1.0); b.oct(0.6, 0.6, 0.3, 0.5, 0x9ad8ff, 0.8, 1.4, 0.8, 0.4, -0.3); b.oct(-0.5, 0.6, -0.3, 0.45, 0xa8e0ff, 0.8, 1.4, 0.8, 0.9, 0.3);
  return b.build();
}

/* ======================= enemigos ======================= */
/** @param {string} type */
export function buildEnemy(type) {
  const b = new GeoBuilder(90 + type.length);
  if (type === 'trasgo') {
    b.box(-0.16, 0.22, 0, 0.16, 0.44, 0.18, 0x4a3a2a); b.box(0.16, 0.22, 0, 0.16, 0.44, 0.18, 0x4a3a2a);
    b.box(0, 0.65, 0, 0.55, 0.5, 0.36, 0x7a5a3a);
    b.box(0, 0.62, 0.02, 0.6, 0.12, 0.4, 0x4a3420);
    b.ico(0, 1.1, 0.04, 0.3, 0x7aa04a, 1, 0.95, 1);
    b.cone(-0.32, 1.18, 0, 0.1, 0.36, 4, 0x6a9040, 0, 1.2); b.cone(0.32, 1.18, 0, 0.1, 0.36, 4, 0x6a9040, 0, -1.2);
    b.box(-0.1, 1.14, 0.27, 0.07, 0.07, 0.04, 0xffe060); b.box(0.1, 1.14, 0.27, 0.07, 0.07, 0.04, 0xffe060);
    b.box(0.38, 0.8, 0.15, 0.06, 1.3, 0.06, 0x6a4a2a, 0, 0.35); b.cone(0.38, 1.5, 0.39, 0.08, 0.22, 4, 0xc8c8d0, 0.35);
  } else if (type === 'imp') {
    b.box(-0.12, 0.15, 0, 0.12, 0.3, 0.14, 0x8a2a1a); b.box(0.12, 0.15, 0, 0.12, 0.3, 0.14, 0x8a2a1a);
    b.ico(0, 0.52, 0, 0.3, 0xd8442a, 1, 1.1, 0.9);
    b.ico(0, 0.92, 0.04, 0.25, 0xe85a30);
    b.cone(-0.16, 1.18, 0, 0.07, 0.28, 4, 0x2a1a1a, 0, 0.35); b.cone(0.16, 1.18, 0, 0.07, 0.28, 4, 0x2a1a1a, 0, -0.35);
    b.box(-0.09, 0.95, 0.22, 0.07, 0.05, 0.04, 0xfff080); b.box(0.09, 0.95, 0.22, 0.07, 0.05, 0.04, 0xfff080);
    b.box(-0.42, 0.62, -0.12, 0.42, 0.04, 0.3, 0x6a1a14, 0, 0, 0.5); b.box(0.42, 0.62, -0.12, 0.42, 0.04, 0.3, 0x6a1a14, 0, 0, -0.5);
    b.cone(0, 0.32, -0.42, 0.06, 0.5, 4, 0xb8381e, -1.1);
    b.ico(0, 0.55, 0.12, 0.12, 0xffb040);
  } else if (type === 'golem') {
    b.box(-0.42, 0.45, 0, 0.42, 0.9, 0.5, 0x6a9ac0); b.box(0.42, 0.45, 0, 0.42, 0.9, 0.5, 0x6a9ac0);
    b.box(0, 1.35, 0, 1.4, 1.0, 0.9, 0x8ab8d8);
    b.box(0, 1.92, 0.12, 0.62, 0.5, 0.55, 0x9cc8e6);
    b.box(-0.16, 1.98, 0.4, 0.12, 0.08, 0.04, 0x2ae0ff); b.box(0.16, 1.98, 0.4, 0.12, 0.08, 0.04, 0x2ae0ff);
    b.box(-0.92, 1.1, 0.1, 0.45, 1.2, 0.5, 0x7aaad0, 0, 0.15, 0.1); b.box(0.92, 1.1, 0.1, 0.45, 1.2, 0.5, 0x7aaad0, 0, 0.15, -0.1);
    b.oct(-0.4, 2.0, -0.35, 0.28, 0xd8f4ff, 0.7, 1.6, 0.7, 0, 0.3); b.oct(0.35, 2.05, -0.3, 0.32, 0xc8eeff, 0.7, 1.7, 0.7, 0, -0.3); b.oct(0, 2.15, -0.45, 0.24, 0xe8faff, 0.7, 1.6, 0.7);
  } else if (type === 'caballero') {
    b.box(-0.2, 0.32, 0, 0.22, 0.64, 0.26, 0x5a5e68); b.box(0.2, 0.32, 0, 0.22, 0.64, 0.26, 0x5a5e68);
    b.box(0, 0.95, 0, 0.78, 0.68, 0.48, 0x9aa0ae);
    b.box(0, 0.98, 0.25, 0.5, 0.4, 0.04, 0xc8a040);
    b.box(0, 1.5, 0, 0.42, 0.44, 0.44, 0xb0b6c4); b.box(0, 1.5, 0.22, 0.32, 0.06, 0.04, 0x1a1a22);
    b.cone(0, 1.86, -0.04, 0.12, 0.42, 4, 0xd8302a, -0.4);
    b.box(-0.5, 0.95, 0.24, 0.12, 0.85, 0.7, 0x4a5a8a, 0.25); b.box(-0.5, 0.95, 0.24, 0.14, 0.3, 0.3, 0xc8a040, 0.25);
    b.box(0.5, 0.95, 0.35, 0.08, 0.08, 1.0, 0xd8dce8, 0, 0.25);
  } else if (type === 'volador') {
    b.ico(0, 0, 0, 0.36, 0x6a4a8a, 1, 0.8, 1.5);
    b.ico(0, 0.18, 0.5, 0.22, 0x8a6aa8);
    b.cone(0, 0.18, 0.78, 0.08, 0.22, 4, 0xffc040, Math.PI / 2);
    b.box(-0.85, 0.1, -0.1, 1.3, 0.06, 0.5, 0x3ab0c8, -0.25, 0, 0.18); b.box(0.85, 0.1, -0.1, 1.3, 0.06, 0.5, 0x3ab0c8, 0.25, 0, -0.18);
    b.box(-1.6, 0.22, -0.42, 0.7, 0.05, 0.32, 0x2a8aa8, -0.5, 0, 0.3); b.box(1.6, 0.22, -0.42, 0.7, 0.05, 0.32, 0x2a8aa8, 0.5, 0, -0.3);
    b.box(-0.5, 0.12, -0.2, 0.5, 0.07, 0.42, 0x8a6aa8, -0.2); b.box(0.5, 0.12, -0.2, 0.5, 0.07, 0.42, 0x8a6aa8, 0.2);
    b.cone(0, 0, -0.75, 0.22, 0.6, 4, 0x4a2a6a, -Math.PI / 2);
    b.box(-0.08, 0.26, 0.66, 0.06, 0.05, 0.04, 0xfff080); b.box(0.08, 0.26, 0.66, 0.06, 0.05, 0.04, 0xfff080);
  }
  return b.build();
}

/** Escudo del caballero (burbuja). */
export function buildShield() { const g = new THREE.SphereGeometry(1.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2); return g; }

/** Titán: piezas separadas para animarlas. */
export function buildTitan() {
  const legs = new GeoBuilder(101);
  legs.box(-0.9, 1.1, 0, 0.9, 2.2, 1.0, 0x4a4656); legs.box(0.9, 1.1, 0, 0.9, 2.2, 1.0, 0x4a4656);
  legs.box(-0.9, 0.2, 0.2, 1.1, 0.4, 1.4, 0x3a3644); legs.box(0.9, 0.2, 0.2, 1.1, 0.4, 1.4, 0x3a3644);
  const torso = new GeoBuilder(102);
  torso.box(0, 3.4, 0, 2.8, 2.4, 1.8, 0x5a5468);
  torso.box(0, 2.3, 0, 2.2, 0.5, 1.5, 0x3a3644);
  torso.box(-1.75, 4.3, 0, 1.0, 0.9, 1.3, 0x6a6478); torso.box(1.75, 4.3, 0, 1.0, 0.9, 1.3, 0x6a6478);
  torso.box(0, 4.95, 0.1, 1.1, 0.9, 1.0, 0x6a6478);
  torso.box(-0.25, 5.0, 0.62, 0.22, 0.12, 0.05, 0xffffff); torso.box(0.25, 5.0, 0.62, 0.22, 0.12, 0.05, 0xffffff);
  const arm = new GeoBuilder(103);
  arm.box(0, -0.9, 0, 0.75, 1.9, 0.8, 0x5a5468); arm.box(0, -2.1, 0.1, 1.0, 0.8, 1.0, 0x3a3644);
  const crystals = new GeoBuilder(104);
  crystals.oct(0, 3.5, 0.95, 0.55, 0xffffff, 0.8, 1.2, 0.5);
  crystals.oct(-1.75, 5.0, -0.1, 0.4, 0xffffff, 0.7, 1.6, 0.7, 0, 0.3); crystals.oct(1.75, 5.0, -0.1, 0.4, 0xffffff, 0.7, 1.6, 0.7, 0, -0.3);
  crystals.oct(0, 5.75, 0, 0.32, 0xffffff, 0.7, 1.8, 0.7);
  crystals.oct(-0.7, 4.2, -1.0, 0.35, 0xffffff, 0.7, 1.6, 0.7, 0, 0.5); crystals.oct(0.7, 4.3, -1.0, 0.38, 0xffffff, 0.7, 1.6, 0.7, 0, -0.5);
  return { legs: legs.build(), torso: torso.build(), arm: arm.build(), crystals: crystals.build() };
}

/* ======================= proyectiles ======================= */
export function buildBolt() { const b = new GeoBuilder(120); b.box(0, 0, 0, 0.08, 0.08, 0.9, 0xd8c8a0); b.cone(0, 0, 0.5, 0.09, 0.2, 4, 0xc0c4d0, Math.PI / 2); b.box(0, 0, -0.42, 0.22, 0.02, 0.14, 0xe8e0d0); return b.build(); }
export function buildFireball() { const b = new GeoBuilder(121); b.ico(0, 0, 0, 0.32, 0xffb040, 1, 1, 1, 1); b.ico(0, 0, 0, 0.2, 0xfff0b0); return b.build(); }
export function buildShard() { const b = new GeoBuilder(122); b.oct(0, 0, 0, 0.22, 0xd8f6ff, 0.6, 0.6, 1.8); return b.build(); }
