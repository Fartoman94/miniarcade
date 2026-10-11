// Mateo: Ciudad de Altura — utilidades de geometría: cajas con UV en metros (las texturas repiten por tamaño real),
// UV por cara para carteles (atlas), color por vértice para teñir una misma textura, y fusión por material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// caras de una caja: [normal, u-eje, v-eje] (u y v en el plano de la cara)
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },   // +X
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },   // -X
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },   // +Y
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },   // -Y
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },    // +Z
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },  // -Z
];
export const FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };

/**
 * Caja centrada en (x,y,z) con medidas w×h×d. UV en metros/tile (tile=[tu,tv]) o rect de atlas por cara.
 * opts: { tile:[tu,tv], color, faces: bool[6] (omitir caras), uvRect:{face:[u0,v0,u1,v1]}, uvOff:[ou,ov] }
 */
export function boxGeo(w, h, d, opts = {}) {
  const tile = opts.tile || [4, 4], half = [w / 2, h / 2, d / 2];
  const pos = [], nor = [], uv = [], col = [];
  _c.set(opts.color ?? 0xffffff);
  const size = [w, h, d];
  FACES.forEach((f, fi) => {
    if (opts.faces && !opts.faces[fi]) return;
    const n = f.n, u = f.u, v = f.v;
    const uLen = Math.abs(u[0]) * size[0] + Math.abs(u[1]) * size[1] + Math.abs(u[2]) * size[2];
    const vLen = Math.abs(v[0]) * size[0] + Math.abs(v[1]) * size[1] + Math.abs(v[2]) * size[2];
    const c = [n[0] * half[0], n[1] * half[1], n[2] * half[2]];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const rect = opts.uvRect && opts.uvRect[fi];
    const pts = corners.map(([a, b]) => [c[0] + (u[0] * uLen * a + v[0] * vLen * b) / 2, c[1] + (u[1] * uLen * a + v[1] * vLen * b) / 2, c[2] + (u[2] * uLen * a + v[2] * vLen * b) / 2]);
    const uvs = corners.map(([a, b]) => rect
      ? [rect[0] + (rect[2] - rect[0]) * (a + 1) / 2, rect[1] + (rect[3] - rect[1]) * (b + 1) / 2]
      : [((a + 1) / 2 * uLen) / tile[0] + (opts.uvOff ? opts.uvOff[0] : 0), ((b + 1) / 2 * vLen) / tile[1] + (opts.uvOff ? opts.uvOff[1] : 0)]);
    for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...pts[k]); nor.push(...n); uv.push(...uvs[k]); col.push(_c.r, _c.g, _c.b); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Normaliza cualquier geometría de Three a (position, normal, uv, color) no indexada con color fijo. */
export function prep(geo, color = 0xffffff, uvScale = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  else if (uvScale !== 1) { const a = g.attributes.uv.array; for (let i = 0; i < a.length; i++) a[i] *= uvScale; }
  _c.set(color);
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Acumulador de geometrías por material (clave) y por trozo espacial; build() fusiona y devuelve mallas. */
export class Batcher {
  constructor() { /** @type {Map<string, THREE.BufferGeometry[]>} */ this.map = new Map(); }
  /** @param {string} key material @param {THREE.BufferGeometry} g @param {number[]} t [x,y,z, ry, rx, rz, sx, sy, sz] */
  add(key, g, t = []) {
    const [x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1] = t;
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(g);
    return this;
  }
  box(key, w, h, d, x, y, z, opts = {}, ry = 0) { return this.add(key, boxGeo(w, h, d, opts), [x, y, z, ry]); }
  /** @param {Record<string, THREE.Material>} mats */
  build(mats, parent, name = '') {
    const out = [];
    for (const [key, list] of this.map) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      list.forEach(x => x.dispose());
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[key]);
      m.name = name + ':' + key; m.receiveShadow = true; m.castShadow = !/glow|decal|line/.test(key);
      parent.add(m); out.push(m);
    }
    this.map.clear();
    return out;
  }
}
