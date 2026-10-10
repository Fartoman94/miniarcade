// @ts-check
/* Mareas Profundas — modelos low-poly procedurales (geometrías fusionadas con colores por vértice) y materiales.
   Todo se construye en código: submarino, corales, peces, criaturas, ruinas, sondas, puertas, faro y Leviatán. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../matelabs/kit3d.js';
import { withCaustics } from './fx.js';

export const PAL = {
  hull: 0xffb547, hullDark: 0xc9781f, steel: 0x8a98a6, steelDark: 0x3c4652, glass: 0x7ff3ff,
  sand: 0xc9b48a, sandDark: 0x8f7a58, rock: 0x6a7a80, rockDark: 0x3a4650, moss: 0x3f7a6a,
  coralPink: 0xff6fa8, coralViolet: 0xa77bff, coralOrange: 0xff9a4a, coralTeal: 0x3fe0c8, coralYellow: 0xffe066,
  cyan: 0x4ff7e6, magenta: 0xff5fd2, red: 0xff4040, amber: 0xffb547, white: 0xf2fbff,
  stone: 0x7d8a8c, stoneDark: 0x4a5557, stoneLight: 0xa9b4b0, bronze: 0x9a7b4a, rust: 0x8a4a2a,
  abyss: 0x141b2a, flesh: 0x6a3a7a, lev: 0x2e4660, levBelly: 0x6a7f96,
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

/** Acumula primitivas con color y las fusiona en una sola geometría (un draw call). */
export class GeoBuilder {
  /** @param {number} [seed] */
  constructor(seed = 7) { /** @type {THREE.BufferGeometry[]} */ this.parts = []; this.r = rng(seed); }
  /**
   * @param {THREE.BufferGeometry} geo @param {number} color
   * @param {number[]} [pos] @param {number[]} [rot] @param {number[]} [scl] @param {number} [jitter] @param {boolean} [ao]
   */
  add(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1], jitter = 0.07, ao = true) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    _e.set(rot[0], rot[1], rot[2]); _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scl[0], scl[1], scl[2]));
    g.applyMatrix4(_m);
    const P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
    _c.set(color);
    if (jitter) _c.multiplyScalar(1 + (this.r() - 0.5) * 2 * jitter);
    let y0 = Infinity, y1 = -Infinity;
    if (ao) for (let i = 0; i < n; i++) { const y = P.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < n; i++) {
      const k = ao ? 0.7 + 0.3 * ((P.getY(i) - y0) / Math.max(0.001, y1 - y0)) : 1;
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  box(x, y, z, w, h, d, color, jitter = 0.07, ry = 0, ao = true) { return this.add(UNIT_BOX, color, [x, y, z], [0, ry, 0], [w, h, d], jitter, ao); }
  boxR(x, y, z, w, h, d, color, rot, jitter = 0.07) { return this.add(UNIT_BOX, color, [x, y, z], rot, [w, h, d], jitter); }
  cyl(x, y, z, rt, rb, h, seg, color, jitter = 0.06, rot = [0, 0, 0]) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); this.add(g, color, [x, y, z], rot, [1, 1, 1], jitter); g.dispose(); return this;
  }
  sph(x, y, z, r, color, scl = [1, 1, 1], detail = 0, jitter = 0.06, ao = true) {
    const g = new THREE.IcosahedronGeometry(r, detail); this.add(g, color, [x, y, z], [0, 0, 0], scl, jitter, ao); g.dispose(); return this;
  }
  get empty() { return this.parts.length === 0; }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Degradé del haz de los focos: intenso junto al submarino, transparente al final. */
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, 'rgba(255,255,255,0.8)'); v.addColorStop(0.35, 'rgba(255,255,255,0.25)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Materiales compartidos de la página. */
export function createMaterials() {
  const m = {
    world: withCaustics(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
    coral: withCaustics(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x0a1626 })),
    sub: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6fe6ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55, emissive: 0x0d4a5a }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glowInst: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    creature: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    beam: new THREE.MeshBasicMaterial({ color: 0xfff1c8, map: beamTexture(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    surface: withCaustics(new THREE.MeshBasicMaterial({ color: 0x3aa7c9, transparent: true, opacity: 0.85, side: THREE.DoubleSide })),
  };
  for (const k in m) /** @type {any} */ (m)[k].userData.shared = true;
  return m;
}
/** @typedef {ReturnType<typeof createMaterials>} Mats */

/* ======================= submarino ======================= */
/** @param {Mats} mats */
export function makeSub(mats) {
  const group = new THREE.Group(); group.name = 'sub';
  const b = new GeoBuilder(11);
  // casco: cápsula achatada (eje Z hacia adelante = +Z)
  b.add(new THREE.CapsuleGeometry(0.62, 1.5, 6, 12), PAL.hull, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 0.86, 1], 0.03);
  b.box(0, -0.52, -0.1, 0.5, 0.18, 1.6, PAL.hullDark, 0.03);                // quilla
  b.box(0, 0.62, -0.35, 0.16, 0.4, 0.8, PAL.hullDark, 0.03);                // aleta dorsal
  b.boxR(0.78, -0.1, -0.7, 0.7, 0.08, 0.42, PAL.hullDark, [0, 0, -0.2]);     // alerones
  b.boxR(-0.78, -0.1, -0.7, 0.7, 0.08, 0.42, PAL.hullDark, [0, 0, 0.2]);
  b.cyl(0, 0, -1.28, 0.34, 0.42, 0.36, 10, PAL.steelDark, 0.02, [Math.PI / 2, 0, 0]); // carcasa de hélice
  b.cyl(0.42, -0.36, 0.95, 0.12, 0.12, 0.3, 8, PAL.steel, 0.02, [Math.PI / 2, 0, 0]); // focos
  b.cyl(-0.42, -0.36, 0.95, 0.12, 0.12, 0.3, 8, PAL.steel, 0.02, [Math.PI / 2, 0, 0]);
  b.box(0, -0.66, 0.55, 0.12, 0.3, 0.12, PAL.steelDark);                    // brazo
  b.boxR(0.1, -0.84, 0.66, 0.06, 0.24, 0.06, PAL.steel, [0.4, 0, 0.4]);
  b.boxR(-0.1, -0.84, 0.66, 0.06, 0.24, 0.06, PAL.steel, [0.4, 0, -0.4]);
  // franjas
  b.add(new THREE.TorusGeometry(0.6, 0.04, 4, 16), PAL.steelDark, [0, 0, -0.35], [0, 0, 0], [1, 0.86, 1], 0);
  const body = new THREE.Mesh(b.build(), mats.sub);
  group.add(body);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.glass);
  canopy.position.set(0, 0.18, 0.62); canopy.rotation.x = 0.55; canopy.scale.set(0.95, 0.9, 1.15);
  group.add(canopy);
  const pb = new GeoBuilder(3);
  for (let i = 0; i < 3; i++) pb.boxR(0, 0, 0, 0.1, 0.62, 0.05, PAL.steel, [0, 0, i * 2.094]);
  pb.cyl(0, 0, 0, 0.08, 0.08, 0.14, 6, PAL.steelDark, 0, [Math.PI / 2, 0, 0]);
  const prop = new THREE.Mesh(pb.build(), mats.sub); prop.position.set(0, 0, -1.48);
  group.add(prop);
  const lb = new GeoBuilder(5);
  lb.sph(0.42, -0.36, 1.12, 0.1, 0xfff4d0, [1, 1, 0.5], 1, 0, false); lb.sph(-0.42, -0.36, 1.12, 0.1, 0xfff4d0, [1, 1, 0.5], 1, 0, false);
  lb.sph(0, 0.86, -0.5, 0.06, 0xff5050, [1, 1, 1], 0, 0, false);
  const lamps = new THREE.Mesh(lb.build(), mats.glow); group.add(lamps);
  // cono de luz visible (volumen falso)
  const coneG = new THREE.ConeGeometry(3.2, 14, 18, 1, true); coneG.translate(0, -7, 0); coneG.rotateX(-Math.PI / 2);
  const cone = new THREE.Mesh(coneG, mats.beam); cone.position.set(0, -0.36, 1.1); cone.renderOrder = 9;
  group.add(cone);
  // ancla de carga (caja negra / cápsula / barra de control)
  const hook = new THREE.Object3D(); hook.position.set(0, -1.05, 0.55); group.add(hook);
  return { group, body, prop, canopy, lamps, cone, hook };
}

/* ======================= fauna y flora ======================= */
export function coralGeos() {
  const branch = new GeoBuilder(21);
  branch.cyl(0, 0.5, 0, 0.09, 0.14, 1, 5, 0xffffff);
  branch.cyl(0.25, 1.05, 0, 0.06, 0.08, 0.7, 5, 0xffffff, 0.06, [0, 0, -0.6]);
  branch.cyl(-0.22, 1.15, 0.1, 0.06, 0.08, 0.8, 5, 0xffffff, 0.06, [0.2, 0, 0.55]);
  branch.cyl(0.05, 1.3, -0.2, 0.05, 0.07, 0.7, 5, 0xffffff, 0.06, [-0.5, 0, 0]);
  const fan = new GeoBuilder(22);
  fan.add(new THREE.CircleGeometry(0.9, 9, 0, Math.PI), 0xffffff, [0, 0.15, 0], [0, 0, 0], [1, 1.2, 1], 0.05);
  fan.add(new THREE.CircleGeometry(0.9, 9, 0, Math.PI), 0xffffff, [0, 0.15, 0.01], [0, Math.PI, 0], [1, 1.2, 1], 0.05);
  fan.cyl(0, 0.1, 0, 0.05, 0.07, 0.3, 4, 0xbbbbbb);
  const brain = new GeoBuilder(23);
  brain.sph(0, 0.25, 0, 0.6, 0xffffff, [1, 0.6, 1], 1, 0.04);
  const tube = new GeoBuilder(24);
  for (let i = 0; i < 4; i++) { const a = i * 1.7, r = i ? 0.22 : 0; tube.cyl(Math.cos(a) * r, 0.4 + i * 0.08, Math.sin(a) * r, 0.11, 0.09, 0.8 + i * 0.2, 6, 0xffffff); }
  const kelp = new GeoBuilder(25);
  for (let i = 0; i < 6; i++) kelp.boxR(Math.sin(i) * 0.06, 0.5 + i * 0.95, Math.cos(i) * 0.06, 0.3, 1.0, 0.04, 0xffffff, [0.08 * Math.sin(i * 2), i * 0.6, 0.1 * Math.cos(i)], 0.05);
  const rock = new GeoBuilder(26);
  rock.sph(0, 0.3, 0, 1, 0xffffff, [1.2, 0.75, 1], 0, 0.08);
  return { branch: branch.build(), fan: fan.build(), brain: brain.build(), tube: tube.build(), kelp: kelp.build(), rock: rock.build() };
}
/** Pez pequeño (hocico hacia +Z). */
export function fishGeo(color = 0x9fe8ff, glowTail = 0x4ff7e6) {
  const b = new GeoBuilder(31);
  b.add(new THREE.OctahedronGeometry(0.22, 0), color, [0, 0, 0], [0, 0, 0], [0.55, 0.8, 1.5], 0.04);
  b.add(new THREE.ConeGeometry(0.16, 0.26, 3), glowTail, [0, 0, -0.38], [-Math.PI / 2, 0, 0], [0.4, 1, 1], 0);
  return b.build();
}
export function mantaGeo() {
  const b = new GeoBuilder(32);
  const s = new THREE.Shape(); s.moveTo(0, 1.4); s.quadraticCurveTo(2.6, 0.2, 2.8, -0.4); s.quadraticCurveTo(1.2, -0.3, 0.3, -1.1); s.lineTo(-0.3, -1.1); s.quadraticCurveTo(-1.2, -0.3, -2.8, -0.4); s.quadraticCurveTo(-2.6, 0.2, 0, 1.4);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false }); g.center();
  b.add(g, 0x2d3e5c, [0, 0, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], 0.03); g.dispose();
  b.boxR(0, 0, -1.9, 0.06, 0.06, 1.8, 0x22304a, [0, 0, 0]);
  b.sph(0.9, 0.12, 0.3, 0.12, 0x4ff7e6, [1, 0.4, 1], 0, 0, false); b.sph(-0.9, 0.12, 0.3, 0.12, 0x4ff7e6, [1, 0.4, 1], 0, 0, false);
  b.sph(1.6, 0.11, -0.1, 0.1, 0x4ff7e6, [1, 0.4, 1], 0, 0, false); b.sph(-1.6, 0.11, -0.1, 0.1, 0x4ff7e6, [1, 0.4, 1], 0, 0, false);
  return b.build();
}
export function turtleGeo() {
  const b = new GeoBuilder(33);
  b.sph(0, 0, 0, 0.8, 0x5e7a3a, [1, 0.45, 1.25], 1, 0.05);
  b.sph(0, -0.12, 0, 0.75, 0xc9b070, [1, 0.25, 1.15], 1, 0.04);
  b.sph(0, 0.02, 1.15, 0.28, 0x8aa070, [0.9, 0.8, 1.2], 0, 0.04);
  for (const [x, z, r] of [[0.8, 0.5, -0.5], [-0.8, 0.5, 0.5], [0.6, -0.7, -0.3], [-0.6, -0.7, 0.3]]) b.boxR(x, -0.05, z, 0.7, 0.07, 0.3, 0x8aa070, [0, r, 0]);
  return b.build();
}
export function anglerGeo() {
  const b = new GeoBuilder(34);
  b.sph(0, 0, 0, 0.7, 0x2a2238, [1, 0.9, 1.2], 1, 0.05);
  for (let i = 0; i < 5; i++) b.add(new THREE.ConeGeometry(0.05, 0.22, 3), 0xe8e0d0, [-0.3 + i * 0.15, -0.12, 0.78], [Math.PI, 0, 0], [1, 1, 1], 0);
  b.boxR(0, 0.65, 0.5, 0.04, 0.04, 0.9, 0x2a2238, [-0.7, 0, 0]);
  b.add(new THREE.ConeGeometry(0.3, 0.5, 4), 0x2a2238, [0, 0, -0.9], [-Math.PI / 2, 0, 0], [1, 0.3, 1], 0.04);
  return b.build();
}
export function jellyGeos() {
  const bell = new THREE.SphereGeometry(0.7, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.55); bell.scale(1, 0.8, 1);
  const t = new GeoBuilder(35);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; t.boxR(Math.cos(a) * 0.45, -0.9, Math.sin(a) * 0.45, 0.04, 1.8, 0.04, 0xffffff, [Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15], 0); }
  t.boxR(0, -0.6, 0, 0.12, 1.1, 0.12, 0xffffff, [0, 0, 0], 0);
  return { bell, tent: t.build() };
}
/** Segmento de anguila (cuerpo) y cabeza. */
export function eelGeos() {
  const seg = new GeoBuilder(36); seg.sph(0, 0, 0, 0.42, 0x3a5a3a, [1, 1, 1.4], 1, 0.04); seg.boxR(0, 0.4, 0, 0.05, 0.3, 0.6, 0x6a8a4a, [0, 0, 0]);
  const head = new GeoBuilder(37);
  head.sph(0, 0, 0.2, 0.5, 0x3f6440, [1, 0.9, 1.6], 1, 0.04);
  head.boxR(0, -0.22, 0.75, 0.5, 0.12, 0.6, 0x2e4a30, [0.25, 0, 0]);
  for (let i = 0; i < 4; i++) head.add(new THREE.ConeGeometry(0.04, 0.16, 3), 0xf0f0e0, [-0.18 + i * 0.12, -0.08, 0.95], [Math.PI, 0, 0], [1, 1, 1], 0);
  const eyes = new GeoBuilder(38); eyes.sph(0.25, 0.18, 0.55, 0.09, 0xffffff, [1, 1, 1], 0, 0, false); eyes.sph(-0.25, 0.18, 0.55, 0.09, 0xffffff, [1, 1, 1], 0, 0, false);
  return { seg: seg.build(), head: head.build(), eyes: eyes.build() };
}
/** @param {Mats} mats */
export function makeDrone(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(41);
  b.box(0, 0, 0, 1.3, 0.6, 1.6, 0x56616e, 0.03); b.box(0, 0.38, -0.1, 0.8, 0.2, 1.0, 0x3a434e, 0.03);
  for (const x of [-0.95, 0.95]) { b.cyl(x, 0, -0.2, 0.32, 0.32, 0.4, 10, 0x2a3038, 0.02, [Math.PI / 2, 0, 0]); }
  b.box(0, -0.4, 0.4, 0.2, 0.25, 0.3, 0x2a3038);
  b.boxR(0.3, -0.55, 0.55, 0.06, 0.3, 0.06, 0x8a98a6, [0.5, 0, 0.3]); b.boxR(-0.3, -0.55, 0.55, 0.06, 0.3, 0.06, 0x8a98a6, [0.5, 0, -0.3]);
  b.box(0, 0.05, 0.82, 0.9, 0.2, 0.04, 0xffb547, 0);
  g.add(new THREE.Mesh(b.build(), mats.creature));
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x66ffe0 });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), eyeMat); eye.position.set(0, 0, 0.82); g.add(eye);
  const coneG = new THREE.ConeGeometry(4.2, 16, 16, 1, true); coneG.translate(0, -8, 0); coneG.rotateX(-Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0x66ffe0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(coneG, coneMat); cone.position.set(0, 0, 0.85); cone.renderOrder = 9; g.add(cone);
  return { group: g, eye, eyeMat, cone, coneMat };
}
export function octopusGeos() {
  const mantle = new GeoBuilder(42);
  mantle.sph(0, 0.9, -0.3, 1.1, 0xffffff, [1, 1.25, 1.1], 1, 0.03);
  mantle.sph(0.45, 0.45, 0.6, 0.2, 0xfff3c0, [1, 1, 0.6], 0, 0, false); mantle.sph(-0.45, 0.45, 0.6, 0.2, 0xfff3c0, [1, 1, 0.6], 0, 0, false);
  mantle.sph(0.45, 0.45, 0.72, 0.09, 0x111111, [1, 1, 0.6], 0, 0, false); mantle.sph(-0.45, 0.45, 0.72, 0.09, 0x111111, [1, 1, 0.6], 0, 0, false);
  const seg = new THREE.CylinderGeometry(0.16, 0.22, 0.8, 6); seg.rotateX(Math.PI / 2); seg.translate(0, 0, 0.4);
  return { mantle: mantle.build(), seg };
}

/* ======================= objetos interactivos ======================= */
export function probeGeo() {
  const b = new GeoBuilder(51);
  b.cyl(0, 0.25, 0, 0.7, 0.85, 0.5, 8, 0x3c4652); b.cyl(0, 0.55, 0, 0.4, 0.5, 0.2, 8, 0xffb547);
  for (let i = 0; i < 3; i++) { const a = i * 2.094; b.boxR(Math.cos(a) * 0.8, 0.12, Math.sin(a) * 0.8, 0.9, 0.12, 0.16, 0x56616e, [0, -a, -0.25]); }
  return b.build();
}
export function probeMastGeo() {
  const b = new GeoBuilder(52);
  b.cyl(0, 1.0, 0, 0.08, 0.1, 2.0, 6, 0x8a98a6); b.add(new THREE.ConeGeometry(0.55, 0.3, 10, 1, true), 0xdfe8ee, [0, 2.0, 0], [Math.PI, 0, 0], [1, 1, 1], 0);
  return b.build();
}
export function debrisGeo(seed = 1, kind = 'slab') {
  const b = new GeoBuilder(60 + seed);
  if (kind === 'slab') {
    b.boxR(0, 0, 0, 3.2, 3.6, 1.2, PAL.stone, [0.05, 0, 0.06]); b.boxR(0.4, 1.1, 0.2, 1.5, 1.2, 1.3, PAL.stoneDark, [0.2, 0.3, 0.1]);
    b.sph(-0.9, -1.2, 0.4, 0.8, PAL.rock, [1, 0.6, 1], 0); b.box(0.9, -0.8, -0.1, 0.9, 0.5, 1.4, PAL.moss);
  } else {
    b.boxR(0, 0, 0, 3.4, 0.6, 0.6, PAL.rust, [0, 0, 0.12]); b.boxR(0.2, 0.6, 0.1, 2.6, 0.5, 0.5, PAL.steelDark, [0, 0.3, -0.15]);
    b.box(-0.8, -0.3, 0.3, 1.4, 1.0, 1.2, PAL.stoneDark); b.sph(1.0, -0.4, -0.2, 0.7, PAL.stone, [1, 0.7, 1], 0);
  }
  return b.build();
}
/** Puerta hidráulica (panel con franjas de advertencia), centrada en el origen. */
export function doorGeo(w, h) {
  const b = new GeoBuilder(71);
  b.box(0, 0, 0, w, h, 0.5, 0x5a6672, 0.03);
  for (let i = 0; i < 5; i++) b.boxR(-w / 2 + (i + 0.5) * w / 5, -h / 2 + 0.5, 0.27, 0.35, 1.2, 0.04, i % 2 ? 0x222222 : 0xffb547, [0, 0, 0.6], 0);
  b.box(0, 0.6, 0.28, w * 0.7, 0.18, 0.06, 0x2a3038, 0); b.box(0, -0.4, 0.28, w * 0.7, 0.18, 0.06, 0x2a3038, 0);
  b.cyl(0, 1.4, 0.3, 0.45, 0.45, 0.12, 10, 0x8a98a6, 0.02, [Math.PI / 2, 0, 0]);
  return b.build();
}
export function panelGeo() {
  const b = new GeoBuilder(72);
  b.box(0, 0, 0, 1.4, 1.8, 0.5, 0x3c4652); b.box(0, 0.35, 0.27, 1.0, 0.6, 0.05, 0x14202a, 0);
  b.cyl(0, -0.45, 0.35, 0.38, 0.38, 0.12, 8, 0xd84a3a, 0.02, [Math.PI / 2, 0, 0]);
  b.box(0, -1.4, 0, 0.3, 1.2, 0.3, 0x2a3038);
  return b.build();
}
export function wheelGeo() {
  const b = new GeoBuilder(73);
  b.add(new THREE.TorusGeometry(0.38, 0.06, 4, 10), 0xffb547, [0, 0, 0], [0, 0, 0], [1, 1, 1], 0);
  b.box(0, 0, 0, 0.74, 0.08, 0.06, 0xffb547, 0); b.box(0, 0, 0, 0.08, 0.74, 0.06, 0xffb547, 0);
  return b.build();
}
export function blackBoxGeo() {
  const b = new GeoBuilder(74);
  b.box(0, 0, 0, 0.9, 0.6, 0.7, 0xff7a1a, 0.02);
  b.box(0, 0, 0.36, 0.92, 0.12, 0.02, 0xf2f2f2, 0); b.box(0, 0.18, 0.36, 0.92, 0.06, 0.02, 0x222222, 0);
  b.box(0, 0.36, 0, 0.5, 0.12, 0.1, 0x333333, 0);
  return b.build();
}
export function capsuleGeo() {
  const b = new GeoBuilder(75);
  b.sph(0, 0, 0, 0.7, 0xe8eef2, [1, 1, 1.2], 1, 0.02); b.add(new THREE.TorusGeometry(0.66, 0.08, 4, 14), 0xff4040, [0, 0, 0], [0, 0, 0], [1, 1, 1.1], 0);
  b.sph(0, 0, 0.62, 0.3, 0x2a4a5a, [1, 1, 0.5], 0, 0);
  return b.build();
}
export function cellGeo() { const b = new GeoBuilder(76); b.add(new THREE.OctahedronGeometry(0.4, 0), 0x9dffb0, [0, 0, 0], [0, 0, 0], [0.7, 1.2, 0.7], 0, false); return b.build(); }
/** Módulo de buceo: cúpula con anillo de acople y luces. */
export function moduleGeo() {
  const b = new GeoBuilder(77);
  b.cyl(0, 0.6, 0, 3.4, 3.8, 1.2, 12, 0x56616e); b.add(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a98a6, [0, 1.2, 0], [0, 0, 0], [1, 0.8, 1], 0.03);
  b.cyl(0, 3.8, 0, 0.6, 0.8, 0.8, 8, 0x3c4652); b.add(new THREE.TorusGeometry(1.5, 0.22, 6, 16), 0xffb547, [0, 4.6, 0], [Math.PI / 2, 0, 0], [1, 1, 1], 0);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; b.boxR(Math.cos(a) * 3.6, 0.3, Math.sin(a) * 3.6, 1.6, 0.4, 0.5, 0x3c4652, [0, -a, 0]); }
  return b.build();
}
export function moduleLightsGeo() {
  const b = new GeoBuilder(78);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.sph(Math.cos(a) * 3.55, 1.25, Math.sin(a) * 3.55, 0.18, 0xffffff, [1, 1, 1], 0, 0, false); }
  b.sph(0, 4.6, 0, 0.35, 0xffffff, [1, 0.4, 1], 1, 0, false);
  return b.build();
}
/** Puerta acuática entre zonas: marco circular con iris. */
export function gateFrameGeo() {
  const b = new GeoBuilder(79);
  b.add(new THREE.TorusGeometry(5, 0.9, 8, 20), 0x3c4652, [0, 0, 0], [0, 0, 0], [1, 1, 1.4], 0.03);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; b.boxR(Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0, 1.2, 0.8, 1.6, 0xffb547, [0, 0, a], 0.03); }
  return b.build();
}
export function irisGeo() {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(5, -0.4); s.lineTo(4.6, 2.2); s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
  const b = new GeoBuilder(80); b.add(g, 0x56616e, [0, 0, -0.15], [0, 0, 0], [1, 1, 1], 0.05); g.dispose();
  return b.build();
}
export function boatGeo() {
  const b = new GeoBuilder(81);
  b.box(0, 0.2, 0, 4.4, 1.6, 12, 0xe8eef2, 0.02); b.boxR(0, -0.6, 0, 3.6, 0.8, 11, 0xd84a3a, [0, 0, 0], 0.02);
  b.box(0, 1.6, -1.5, 3.2, 1.4, 4, 0xf2f6f8, 0.02); b.box(0, 2.6, -1.0, 0.3, 2.4, 0.3, 0x8a98a6);
  b.add(new THREE.ConeGeometry(2.2, 3, 4), 0xe8eef2, [0, 0.2, 7.3], [Math.PI / 2, Math.PI / 4, 0], [1, 1, 0.7], 0.02);
  b.box(1.6, 1.2, 3.4, 0.2, 1.4, 0.2, 0xffb547); b.box(1.6, 1.9, 3.4, 0.2, 0.2, 2.2, 0xffb547);
  return b.build();
}

/* ======================= faro, reactor y Leviatán ======================= */
export function beaconGeo() {
  const b = new GeoBuilder(91);
  b.cyl(0, 1.0, 0, 5, 6, 2, 10, 0x3c4652); b.cyl(0, 8, 0, 1.6, 2.6, 12, 10, 0x56616e);
  for (let i = 0; i < 4; i++) b.cyl(0, 3 + i * 3, 0, 2.7 - i * 0.25, 2.7 - i * 0.25, 0.5, 10, i % 2 ? 0xffb547 : 0x2a3038, 0.02);
  b.cyl(0, 14.6, 0, 2.2, 1.6, 1.2, 10, 0x2a3038); b.cyl(0, 17.2, 0, 1.4, 2.2, 0.6, 10, 0x2a3038);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; b.boxR(Math.cos(a) * 1.9, 16, Math.sin(a) * 1.9, 0.18, 2.2, 0.18, 0x8a98a6, [0, 0, 0]); }
  return b.build();
}
export function lampGeo() { const g = new THREE.CylinderGeometry(1.7, 1.7, 2.0, 12, 1); g.translate(0, 16, 0); return g; }
export function pillarGeo() {
  const b = new GeoBuilder(92);
  b.cyl(0, 2.5, 0, 0.9, 1.2, 5, 8, 0x4a5557); b.box(0, 3.2, 1.0, 1.4, 1.6, 0.5, 0x3c4652);
  b.cyl(0, 5.2, 0, 1.2, 1.0, 0.4, 8, 0xffb547);
  return b.build();
}
export function coreGeo() {
  const b = new GeoBuilder(93);
  b.cyl(0, 0, 0, 1.1, 1.1, 3.6, 10, 0xffffff, 0, [0, 0, 0]);
  for (let i = 0; i < 3; i++) b.add(new THREE.TorusGeometry(1.35, 0.12, 4, 14), 0xffffff, [0, -1.2 + i * 1.2, 0], [Math.PI / 2, 0, 0], [1, 1, 1], 0);
  return b.build();
}
export function rodGeo() {
  const b = new GeoBuilder(94);
  b.cyl(0, 0, 0, 0.22, 0.22, 2.2, 8, 0x8a98a6); b.cyl(0, 1.15, 0, 0.3, 0.3, 0.2, 8, 0xffb547); b.cyl(0, -1.15, 0, 0.3, 0.3, 0.2, 8, 0xffb547);
  b.cyl(0, 0, 0, 0.26, 0.26, 0.9, 8, 0x4ff7e6, 0);
  return b.build();
}
export function leviathanGeos() {
  const head = new GeoBuilder(95);
  head.sph(0, 0, 0, 2.6, PAL.lev, [1.1, 0.8, 1.7], 1, 0.04);
  head.boxR(0, -1.2, 2.6, 3.4, 0.8, 3.2, PAL.levBelly, [0.25, 0, 0], 0.04);          // mandíbula
  head.boxR(0, 0.9, 2.4, 3.0, 0.9, 3.4, PAL.lev, [-0.12, 0, 0], 0.04);                // hocico
  for (let i = 0; i < 9; i++) head.add(new THREE.ConeGeometry(0.16, 0.7, 3), 0xe8e0d0, [-1.3 + i * 0.32, -0.55, 4.0], [Math.PI, 0, 0], [1, 1, 1], 0);
  for (let i = 0; i < 4; i++) head.add(new THREE.ConeGeometry(0.35, 1.8, 4), PAL.flesh, [0, 1.6 - i * 0.1, -0.6 - i * 1.1], [-0.9, 0, 0], [1, 1, 1], 0.04);
  head.add(new THREE.ConeGeometry(0.4, 2.2, 4), PAL.flesh, [1.9, 0.9, -0.8], [-1.0, 0, -0.6], [1, 1, 1], 0.04);
  head.add(new THREE.ConeGeometry(0.4, 2.2, 4), PAL.flesh, [-1.9, 0.9, -0.8], [-1.0, 0, 0.6], [1, 1, 1], 0.04);
  const eyes = new GeoBuilder(96);
  for (const x of [-1.7, 1.7]) { eyes.sph(x, 0.55, 2.0, 0.42, 0xffffff, [1, 0.7, 1], 1, 0, false); }
  for (let i = 0; i < 6; i++) eyes.sph(i % 2 ? 1.3 : -1.3, -0.2, -0.4 - i * 0.6, 0.16, 0xffffff, [1, 1, 1], 0, 0, false);
  const seg = new GeoBuilder(97);
  seg.sph(0, 0, 0, 1.0, PAL.lev, [1, 0.85, 1.25], 1, 0.03); seg.add(new THREE.ConeGeometry(0.35, 1.3, 4), PAL.flesh, [0, 1.05, 0], [-0.4, 0, 0], [1, 1, 1], 0.04);
  seg.sph(0, -0.45, 0, 0.8, PAL.levBelly, [1, 0.5, 1.15], 0, 0.03);
  const spot = new GeoBuilder(98);
  spot.sph(0.8, 0.15, 0, 0.22, 0xffffff, [1, 1, 1.4], 0, 0, false); spot.sph(-0.8, 0.15, 0, 0.22, 0xffffff, [1, 1, 1.4], 0, 0, false); spot.sph(0, 1.0, 0.3, 0.16, 0xffffff, [1, 1, 1], 0, 0, false);
  const tail = new GeoBuilder(99);
  tail.add(new THREE.ConeGeometry(1.4, 2.6, 4), PAL.flesh, [0, 0, -1.0], [-Math.PI / 2, 0, 0], [1, 0.25, 1], 0.03);
  return { head: head.build(), eyes: eyes.build(), seg: seg.build(), spot: spot.build(), tail: tail.build() };
}

/** Ruina tallada de la cámara oculta. */
export function ruinStatueGeo() {
  const b = new GeoBuilder(101);
  b.box(0, 0.4, 0, 2.6, 0.8, 2.6, PAL.stoneDark); b.box(0, 2.0, 0, 1.4, 2.4, 1.0, PAL.stone);
  b.sph(0, 3.9, 0, 0.9, PAL.stoneLight, [1, 1.1, 0.9], 0); b.box(0, 3.6, 0.7, 1.4, 0.3, 0.3, PAL.bronze);
  b.boxR(1.1, 2.4, 0, 0.5, 1.8, 0.5, PAL.stone, [0, 0, -0.3]); b.boxR(-1.1, 2.4, 0, 0.5, 1.8, 0.5, PAL.stone, [0, 0, 0.3]);
  return b.build();
}
