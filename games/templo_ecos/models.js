// @ts-check
/* Templo de los Ecos — modelos low-poly procedurales (geometrías fusionadas con colores por vértice) y materiales. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../matelabs/kit3d.js';

export const PAL = {
  sand: 0xcfa86e, sandLight: 0xe2c48e, sandDark: 0x9a7448, stone: 0x8a8174, stoneDark: 0x564d44, slate: 0x4a4f55,
  moss: 0x6d8a4f, bronze: 0xb5853f, teal: 0x3fe8d6, amber: 0xffc35a, red: 0xff4d4d, violet: 0xb06cff,
  floorA: 0xb79466, floorB: 0xa98858, dark: 0x2a2420,
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
      const k = ao ? 0.72 + 0.28 * ((P.getY(i) - y0) / Math.max(0.001, y1 - y0)) : 1;
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  /** Caja centrada en (x,y,z). */
  box(x, y, z, w, h, d, color, jitter = 0.07, ry = 0, ao = true) { return this.add(UNIT_BOX, color, [x, y, z], [0, ry, 0], [w, h, d], jitter, ao); }
  /** Cilindro centrado. */
  cyl(x, y, z, rt, rb, h, seg, color, jitter = 0.06, ry = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); this.add(g, color, [x, y, z], [0, ry, 0], [1, 1, 1], jitter); g.dispose(); return this;
  }
  get empty() { return this.parts.length === 0; }
  build() {
    const g = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Materiales compartidos (se crean una vez por partida de página). */
export function createMaterials() {
  return {
    stone: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }),
    glowV: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, metalness: 0.85, roughness: 0.12, emissive: 0x29475e, flatShading: true }),
    beam: new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    beamGlow: new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    drain: new THREE.MeshBasicMaterial({ color: 0xc27dff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    tele: new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    orb: new THREE.MeshBasicMaterial({ color: 0xfff1b0, toneMapped: false }),
    orbBack: new THREE.MeshBasicMaterial({ color: 0x7ffff0, toneMapped: false }),
    shadowBlob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    fx: new THREE.MeshBasicMaterial({ toneMapped: false }),
  };
}
/** @typedef {ReturnType<typeof createMaterials>} Mats */

/** Material de brillo de un solo color (para glifos que cambian de estado). @param {number} color */
export const glowMat = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });

/* ---------------- modelos estáticos (geometría para fusionar o instanciar) ---------------- */

/** Estatua de guardián con túnica (base en y=0). @param {number} variant */
export function statueGeo(variant = 0) {
  const b = new GeoBuilder(11 + variant);
  const S = PAL.sandLight, D = PAL.sandDark;
  b.box(0, 0.3, 0, 1.5, 0.6, 1.5, PAL.stone);
  b.box(0, 0.68, 0, 1.25, 0.16, 1.25, PAL.stoneDark);
  b.cyl(0, 1.65, 0, 0.42, 0.62, 1.8, 6, S);
  b.box(0, 2.75, 0, 0.95, 0.55, 0.55, S);              // hombros
  b.box(0, 3.25, 0, 0.5, 0.55, 0.5, S);                // cabeza
  b.box(0, 3.62, 0, 0.62, 0.14, 0.62, D);              // tocado
  b.box(0, 3.38, 0.27, 0.32, 0.06, 0.04, PAL.dark, 0); // ojos
  if (variant % 2 === 0) {
    b.box(-0.62, 2.1, 0.18, 0.24, 1.1, 0.24, S, 0.05);
    b.box(0.62, 2.1, 0.18, 0.24, 1.1, 0.24, S, 0.05);
    b.box(0, 1.9, 0.5, 0.18, 0.18, 0.3, D);            // manos juntas
  } else {
    b.box(-0.6, 2.2, 0, 0.24, 1.0, 0.24, S, 0.05);
    b.box(0.66, 2.55, 0.25, 0.22, 0.9, 0.22, S, 0.05);
    b.box(0.9, 1.9, 0.3, 0.1, 3.0, 0.1, PAL.bronze);   // báculo
    b.box(0.9, 3.45, 0.3, 0.3, 0.3, 0.3, PAL.teal, 0);
  }
  b.box(0.3, 1.1, 0.4, 0.4, 0.3, 0.06, PAL.moss, 0.15);
  return b.build();
}

/** Columna con base y capitel. @param {number} h */
export function columnGeo(h = 4) {
  const b = new GeoBuilder(23);
  b.box(0, 0.18, 0, 1.15, 0.36, 1.15, PAL.stone);
  b.cyl(0, h / 2, 0, 0.38, 0.44, h - 0.6, 8, PAL.sand);
  b.box(0, h - 0.15, 0, 1.15, 0.3, 1.15, PAL.stone);
  b.box(0, h * 0.35, 0.36, 0.5, 0.25, 0.06, PAL.moss, 0.2);
  return b.build();
}

/** Bloque movible (1.8 m) con glifo tallado. */
export function blockGeo() {
  const b = new GeoBuilder(31);
  b.box(0, 0.9, 0, 1.8, 1.8, 1.8, 0xb59a72, 0.04);
  for (const s of [-1, 1]) {
    b.box(0, 0.9, s * 0.905, 0.9, 0.12, 0.02, PAL.dark, 0, 0, false);
    b.box(0, 0.9, s * 0.905, 0.12, 0.9, 0.02, PAL.dark, 0, 0, false);
    b.box(s * 0.905, 0.9, 0, 0.02, 0.12, 0.9, PAL.dark, 0, 0, false);
    b.box(s * 0.905, 0.9, 0, 0.02, 0.9, 0.12, PAL.dark, 0, 0, false);
  }
  b.box(0, 1.81, 0, 1.5, 0.04, 1.5, 0xc9ad83, 0.03, 0, false);
  return b.build();
}

/* ---------------- personajes ---------------- */

/** Exploradora: cuerpo + piernas animables + farol. */
export function makePlayer(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(41);
  b.box(0, 1.05, 0, 0.62, 0.62, 0.38, 0x2f62b0);          // chaqueta
  b.box(0, 0.78, 0, 0.64, 0.12, 0.4, 0x6a4a2a);           // cinturón
  b.box(0, 1.42, 0.02, 0.66, 0.14, 0.42, 0xe0482f);       // bufanda
  b.box(0.12, 1.3, 0.24, 0.16, 0.34, 0.06, 0xe0482f);
  b.box(0, 1.68, 0, 0.42, 0.4, 0.4, 0xf0c09a);            // cabeza
  b.box(0, 1.72, 0.205, 0.26, 0.06, 0.02, 0x23180f, 0, 0, false); // ojos
  b.cyl(0, 1.9, 0, 0.42, 0.42, 0.06, 10, 0x7a4f2a);        // ala del sombrero
  b.cyl(0, 2.02, 0, 0.24, 0.27, 0.22, 8, 0x8e5d31);
  b.box(0, 1.02, -0.27, 0.46, 0.5, 0.18, 0x7b5a35);        // mochila
  b.box(-0.4, 1.05, 0, 0.16, 0.54, 0.18, 0x2f62b0);        // brazos
  b.box(0.4, 1.05, 0, 0.16, 0.54, 0.18, 0x2f62b0);
  const body = new THREE.Mesh(b.build(), mats.stone);
  body.castShadow = true;
  g.add(body);
  const lb = new GeoBuilder(43); lb.box(0, -0.3, 0, 0.22, 0.6, 0.24, 0xc7ab78); lb.box(0, -0.58, 0.05, 0.24, 0.12, 0.32, 0x4a3420);
  const legGeo = lb.build();
  const legL = new THREE.Mesh(legGeo, mats.stone), legR = new THREE.Mesh(legGeo, mats.stone);
  legL.position.set(-0.15, 0.72, 0); legR.position.set(0.15, 0.72, 0);
  legL.castShadow = legR.castShadow = true;
  g.add(legL, legR);
  // farol en la mano derecha
  const lan = new GeoBuilder(45); lan.box(0, 0, 0, 0.16, 0.2, 0.16, 0x5a4020); lan.box(0, 0.13, 0, 0.1, 0.06, 0.1, 0x5a4020);
  const lantern = new THREE.Mesh(lan.build(), mats.stone); lantern.position.set(0.48, 0.7, 0.12);
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), glowMat(0xffd27a)); lantern.add(flame);
  g.add(lantern);
  // halo del eco (visible al tener el sello)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 4, 18), glowMat(0x3fe8d6));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; ring.visible = false;
  g.add(ring);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), mats.shadowBlob);
  blob.rotation.x = -Math.PI / 2; blob.renderOrder = 1;
  return { group: g, body, legL, legR, lantern, flame, ring, blob };
}

/** Centinela de piedra: mole ancha con ojo en ranura. */
export function makeSentinel(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(51);
  const C = 0x7a7a6c, D = 0x585a50;
  b.box(0, 0.25, 0, 1.3, 0.5, 1.0, D);
  b.box(0, 1.15, 0, 1.6, 1.3, 1.1, C);
  b.box(0, 2.0, 0, 2.2, 0.5, 1.2, D);
  b.box(0, 2.55, 0.05, 0.9, 0.7, 0.85, C);
  b.box(-1.25, 1.4, 0.15, 0.55, 1.4, 0.6, C); b.box(1.25, 1.4, 0.15, 0.55, 1.4, 0.6, C);
  b.box(-1.25, 0.6, 0.25, 0.7, 0.55, 0.75, D); b.box(1.25, 0.6, 0.25, 0.7, 0.55, 0.75, D);
  b.box(0.4, 1.4, 0.56, 0.5, 0.5, 0.05, PAL.moss, 0.2);
  b.box(0, 1.2, -0.58, 0.18, 1.0, 0.08, 0x9fe8de, 0, 0, false); // grieta trasera (punto débil)
  const body = new THREE.Mesh(b.build(), mats.stone); body.castShadow = true; g.add(body);
  const eyeMat = glowMat(PAL.amber);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.05), eyeMat); eye.position.set(0, 2.62, 0.48); g.add(eye);
  return { group: g, eye, eyeMat };
}

/** Araña de ruinas: cuerpo bajo, 8 patas y ojos rojos. */
export function makeSpider(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(61);
  const C = 0x3b2f3a, L = 0x2a2129;
  const ico = new THREE.IcosahedronGeometry(0.5, 0);
  b.add(ico, C, [0, 0.45, -0.25], [0, 0, 0], [1, 0.75, 1.15]);
  b.add(ico, 0x4d3a2e, [0, 0.42, 0.28], [0, 0, 0], [0.6, 0.5, 0.6]);
  ico.dispose();
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const z = 0.35 - i * 0.22;
    b.add(UNIT_BOX, L, [s * 0.5, 0.5, z], [0, s * (0.3 - i * 0.2), s * 0.7], [0.62, 0.07, 0.07], 0.05);
    b.add(UNIT_BOX, L, [s * 0.86, 0.25, z * 1.2], [0, 0, -s * 0.9], [0.5, 0.06, 0.06], 0.05);
  }
  const body = new THREE.Mesh(b.build(), mats.stone); body.castShadow = true; g.add(body);
  const eb = new GeoBuilder(63); eb.box(-0.12, 0.5, 0.5, 0.08, 0.08, 0.05, 0xff3030, 0, 0, false); eb.box(0.12, 0.5, 0.5, 0.08, 0.08, 0.05, 0xff3030, 0, 0, false);
  eb.box(-0.22, 0.56, 0.45, 0.06, 0.06, 0.05, 0xff3030, 0, 0, false); eb.box(0.22, 0.56, 0.45, 0.06, 0.06, 0.05, 0xff3030, 0, 0, false);
  const eyes = new THREE.Mesh(eb.build(), mats.glowV); g.add(eyes);
  return { group: g, body };
}

/** Espectro vigía: túnica flotante translúcida con farol. */
export function makeSpectre() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xa7e9ff, emissive: 0x2c7f94, transparent: true, opacity: 0.5, depthWrite: false, flatShading: true });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.9, 7, 1, true), mat); robe.position.y = 0.95; g.add(robe);
  const hood = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat); hood.position.y = 1.95; g.add(hood);
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.05), glowMat(0xd8fbff)); face.position.set(0, 1.95, 0.3); g.add(face);
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), glowMat(0x9ffcff)); lantern.position.set(0.55, 1.2, 0.3); g.add(lantern);
  return { group: g, mat, lantern };
}

/** Guardián Eco: torso flotante, cabeza con ojo, manos sueltas, halo y fragmentos-escudo. */
export function makeGuardian(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(71);
  const C = 0x8d8577, D = 0x5f574c, G = PAL.bronze;
  b.box(0, 3.2, 0, 3.0, 2.2, 1.7, C);
  b.box(0, 4.55, 0, 3.8, 0.6, 2.0, D);
  b.box(-1.9, 4.6, 0, 1.0, 0.9, 1.4, G); b.box(1.9, 4.6, 0, 1.0, 0.9, 1.4, G);
  b.cyl(0, 1.9, 0, 1.1, 0.4, 1.4, 6, D);
  b.box(0, 5.35, 0, 1.3, 1.1, 1.2, C);
  b.box(0, 6.05, 0, 1.6, 0.3, 1.4, G);
  b.box(0, 6.4, 0, 0.5, 0.5, 0.5, G);
  b.box(0.8, 3.0, 0.86, 0.6, 0.5, 0.05, PAL.moss, 0.2);
  const body = new THREE.Mesh(b.build(), mats.stone); body.castShadow = true; g.add(body);
  const eyeMat = glowMat(0x7ffff0);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.08), eyeMat); eye.position.set(0, 5.4, 0.62); g.add(eye);
  const coreMat = glowMat(0x7ffff0);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), coreMat); core.position.set(0, 3.3, 0.95); g.add(core);
  const hb = new GeoBuilder(73); hb.box(0, 0, 0, 0.9, 0.9, 1.0, C); hb.box(0, -0.1, 0.62, 0.8, 0.3, 0.3, D); hb.box(-0.32, 0.38, 0.45, 0.2, 0.3, 0.2, D);
  const handGeo = hb.build();
  const handL = new THREE.Mesh(handGeo, mats.stone), handR = new THREE.Mesh(handGeo, mats.stone);
  handL.position.set(-2.6, 3.0, 0.6); handR.position.set(2.6, 3.0, 0.6);
  handL.castShadow = handR.castShadow = true;
  g.add(handL, handR);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.07, 4, 32), glowMat(0x3fe8d6)); halo.position.set(0, 5.0, -0.95); g.add(halo);
  const shardMat = new THREE.MeshStandardMaterial({ color: 0x9ff7ff, emissive: 0x2fb6c8, emissiveIntensity: 1.2, flatShading: true, transparent: true, opacity: 0.9 });
  const shards = [];
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), shardMat); s.scale.y = 1.7; s.visible = false; g.add(s); shards.push(s); }
  return { group: g, body, eye, eyeMat, core, coreMat, handL, handR, halo, shards };
}

/* ---------------- objetos interactivos ---------------- */

/** Espejo giratorio sobre pedestal: devuelve grupo y pivote que rota. */
export function makeMirror(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(81);
  b.cyl(0, 0.25, 0, 0.55, 0.65, 0.5, 8, PAL.stone);
  b.cyl(0, 0.55, 0, 0.42, 0.5, 0.1, 8, PAL.bronze);
  g.add(new THREE.Mesh(b.build(), mats.stone));
  const pivot = new THREE.Group(); pivot.position.y = 0.6; g.add(pivot);
  const f = new GeoBuilder(83);
  f.box(-0.72, 0.75, 0, 0.12, 1.5, 0.16, PAL.bronze); f.box(0.72, 0.75, 0, 0.12, 1.5, 0.16, PAL.bronze);
  f.box(0, 1.52, 0, 1.56, 0.12, 0.16, PAL.bronze); f.box(0, 0.06, 0, 0.5, 0.12, 0.3, PAL.bronze);
  f.box(0, 0.75, -0.08, 1.32, 1.36, 0.04, 0x5a4a35, 0, 0, false);
  const frame = new THREE.Mesh(f.build(), mats.stone); frame.castShadow = true; pivot.add(frame);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.34, 0.05), mats.glass); glass.position.y = 0.75; pivot.add(glass);
  const markMat = glowMat(0x3fe8d6);
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.5), markMat); mark.position.set(0, -0.02, 0.4); pivot.add(mark);
  return { group: g, pivot, markMat };
}

/** Placa de presión con anillo de glifo. */
export function makePlate(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(91); b.box(0, 0.05, 0, 1.9, 0.1, 1.9, PAL.stoneDark);
  g.add(new THREE.Mesh(b.build(), mats.stone));
  const t = new GeoBuilder(93); t.box(0, 0, 0, 1.5, 0.14, 1.5, 0xb49a74, 0.03);
  const top = new THREE.Mesh(t.build(), mats.stone); top.position.y = 0.13; top.receiveShadow = true; g.add(top);
  const ringMat = glowMat(0x6a5a40);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 4, 20), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; top.add(ring);
  return { group: g, top, ringMat };
}

/** Puerta sellada: losa que se hunde. @param {number} w @param {number} h */
export function makeDoor(mats, w = 3.6, h = 3.2) {
  const g = new THREE.Group();
  const b = new GeoBuilder(101);
  b.box(0, h / 2, 0, w, h, 0.6, 0x9b8463, 0.04);
  for (let i = 1; i < 4; i++) b.box(0, (h / 4) * i, 0.31, w - 0.2, 0.06, 0.02, PAL.dark, 0, 0, false);
  for (let i = 1; i < 4; i++) b.box(0, (h / 4) * i, -0.31, w - 0.2, 0.06, 0.02, PAL.dark, 0, 0, false);
  const slab = new THREE.Mesh(b.build(), mats.stone); slab.castShadow = true; g.add(slab);
  const sealMat = glowMat(0xff8a3d);
  const seal = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 4, 6), sealMat); seal.position.set(0, h * 0.55, 0.34); slab.add(seal);
  const seal2 = seal.clone(); seal2.position.z = -0.34; slab.add(seal2);
  return { group: g, slab, sealMat };
}

/** Marco fijo de la puerta (para fusionar en lo estático). */
export function doorFrameInto(b, x, z, w, h, alongX) {
  const t = 0.7;
  // sólo jambas con remate (sin dintel, para que la cámara cenital no quede tapada)
  if (alongX) for (const s of [-1, 1]) { b.box(x + s * (w / 2 + t / 2), h / 2 + 0.2, z, t, h + 0.4, 1.0, PAL.stone); b.box(x + s * (w / 2 + t / 2), h + 0.55, z, t + 0.3, 0.3, 1.3, PAL.sandDark); }
  else for (const s of [-1, 1]) { b.box(x, h / 2 + 0.2, z + s * (w / 2 + t / 2), 1.0, h + 0.4, t, PAL.stone); b.box(x, h + 0.55, z + s * (w / 2 + t / 2), 1.3, 0.3, t + 0.3, PAL.sandDark); }
}

/** Cristal de resonancia. @param {number} color */
export function makeCrystal(color, size = 0.45) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, flatShading: true, roughness: 0.3 });
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(size), mat); m.scale.y = 1.7;
  return { mesh: m, mat };
}

/** Códice flotante. */
export function makeCodex(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(111);
  b.box(0, 0, 0, 0.5, 0.1, 0.38, 0x8a2f2f, 0.02); b.box(0.02, 0, 0, 0.44, 0.08, 0.36, 0xf3e6c4, 0.02, 0, false);
  b.box(-0.24, 0, 0, 0.04, 0.12, 0.4, 0xd4a640, 0.02, 0, false);
  const book = new THREE.Mesh(b.build(), mats.stone); book.rotation.x = -0.4; g.add(book);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 4, 18), glowMat(PAL.amber)); halo.rotation.x = Math.PI / 2; halo.position.y = -0.35; g.add(halo);
  return { group: g, book, halo };
}

/** Brasero (checkpoint). */
export function makeBrazier(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(121);
  b.cyl(0, 0.45, 0, 0.18, 0.3, 0.9, 6, PAL.stoneDark);
  b.cyl(0, 1.0, 0, 0.6, 0.35, 0.3, 8, PAL.bronze);
  g.add(new THREE.Mesh(b.build(), mats.stone));
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 6), glowMat(0xffa23a)); flame.position.y = 1.5; flame.visible = false; g.add(flame);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), glowMat(0xfff0b0)); inner.position.y = -0.1; flame.add(inner);
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 8), glowMat(0x4a2a14)); ember.position.y = 1.16; g.add(ember);
  return { group: g, flame, ember };
}

/** Reliquias: 'sello' (disco con anillo) o 'plumas' (tres plumas). @param {'sello'|'plumas'} kind */
export function makeRelic(kind) {
  const g = new THREE.Group();
  if (kind === 'sello') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 6, 24), glowMat(0x3fe8d6)); g.add(ring);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 6), glowMat(0xfff1b0)); disk.rotation.x = Math.PI / 2; g.add(disk);
  } else {
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 4), glowMat(i === 1 ? 0xffffff : 0xa9f3ff));
      f.position.set((i - 1) * 0.22, 0, 0); f.rotation.z = (i - 1) * -0.35; f.scale.z = 0.3; g.add(f);
    }
  }
  return g;
}

/** Emisor de luz solar (ranura con disco). */
export function makeEmitter(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(131);
  b.box(0, 1.1, 0, 1.3, 2.2, 1.3, PAL.stone); b.box(0, 2.35, 0, 1.6, 0.3, 1.6, PAL.sandDark);
  g.add(new THREE.Mesh(b.build(), mats.stone));
  const diskMat = glowMat(0xffd27a);
  const disk = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), diskMat); disk.position.set(0, 1.1, 0.66); g.add(disk);
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.08), mats.stone); shutter.position.set(0, 1.1, 0.7); g.add(shutter);
  return { group: g, disk, diskMat, shutter };
}

/** Receptor de luz: pedestal + cristal grande. */
export function makeReceptor(mats) {
  const g = new THREE.Group();
  const b = new GeoBuilder(141); b.cyl(0, 0.5, 0, 0.45, 0.6, 1.0, 6, PAL.stone); b.box(0, 1.05, 0, 0.9, 0.12, 0.9, PAL.bronze);
  g.add(new THREE.Mesh(b.build(), mats.stone));
  const c = makeCrystal(0x9fe9ff, 0.4); c.mesh.position.y = 1.65; g.add(c.mesh);
  return { group: g, crystal: c.mesh, mat: c.mat };
}

/** Corazón del templo. */
export function makeHeart() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff3020, emissiveIntensity: 1.4, flatShading: true });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), mat); g.add(core);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 4, 24), glowMat(PAL.bronze)); g.add(cage);
  const cage2 = cage.clone(); cage2.rotation.y = Math.PI / 2; g.add(cage2);
  return { group: g, core, mat, cage, cage2 };
}
