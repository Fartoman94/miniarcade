// Mateo: Ciudad de Altura — personaje humanoide procedural con esqueleto real (SkinnedMesh + 22 huesos con nombres
// estándar), pesos suaves en articulaciones (rodillas, codos, hombros, cadera) y rostro expresivo (ojos con párpados
// para parpadear/guiñar, cejas, bocas: sonrisa, hablar, sorpresa). Se usa para Mateo y para los vecinos (otras
// proporciones y ropa). Frente = +Z. No usa fotos: el aspecto sigue la descripción del documento de diseño.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const BONES = ['root', 'hips', 'spine', 'chest', 'neck', 'head',
  'clavicle_L', 'upperarm_L', 'lowerarm_L', 'hand_L', 'clavicle_R', 'upperarm_R', 'lowerarm_R', 'hand_R',
  'upperleg_L', 'lowerleg_L', 'foot_L', 'toes_L', 'upperleg_R', 'lowerleg_R', 'foot_R', 'toes_R'];

const _c = new THREE.Color();

/** Proporciones base (niño ~1,3 m). s = escala general; adultos usan otra tabla. */
function layout(o) {
  const s = o.scale, L = o.legLen, T = o.torso;
  return {
    root: [null, 0, 0, 0], hips: ['root', 0, L, 0], spine: ['hips', 0, 0.1 * T, 0], chest: ['spine', 0, 0.14 * T, 0], neck: ['chest', 0, 0.15 * T, 0], head: ['neck', 0, 0.045 * s, 0],
    clavicle_L: ['chest', 0.05 * s, 0.11 * T, 0], upperarm_L: ['clavicle_L', 0.105 * o.shoulder, -0.01, 0], lowerarm_L: ['upperarm_L', 0, -o.arm * 0.52, 0], hand_L: ['lowerarm_L', 0, -o.arm * 0.48, 0],
    clavicle_R: ['chest', -0.05 * s, 0.11 * T, 0], upperarm_R: ['clavicle_R', -0.105 * o.shoulder, -0.01, 0], lowerarm_R: ['upperarm_R', 0, -o.arm * 0.52, 0], hand_R: ['lowerarm_R', 0, -o.arm * 0.48, 0],
    upperleg_L: ['hips', 0.08 * o.hipW, -0.04 * s, 0], lowerleg_L: ['upperleg_L', 0, -(L - 0.04 * s) * 0.5, 0], foot_L: ['lowerleg_L', 0, -(L - 0.04 * s) * 0.44, 0], toes_L: ['foot_L', 0, -0.05 * s, 0.09 * s],
    upperleg_R: ['hips', -0.08 * o.hipW, -0.04 * s, 0], lowerleg_R: ['upperleg_R', 0, -(L - 0.04 * s) * 0.5, 0], foot_R: ['lowerleg_R', 0, -(L - 0.04 * s) * 0.44, 0], toes_R: ['foot_R', 0, -0.05 * s, 0.09 * s],
  };
}

export const MATEO = {
  name: 'Mateo', scale: 1, legLen: 0.52, torso: 0.82, arm: 0.38, shoulder: 0.9, hipW: 0.95, headR: 0.168, bodyW: 0.142, child: true,
  skin: 0xf0c6a0, hair: 0x5b3a22, eyes: 0x6b3e1e, suit: 0x1f2c52, panel: 0x394150, accent: 0xd63031, trim: 0xf5f5f5, shoes: 0xd63031, glow: 0x5ff2ff, hairStyle: 'messy',
};
export function npcStyle(seed) {
  const r = (n) => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 * n; };
  const skins = [0xf2d0b5, 0xe0b090, 0xc58c63, 0x9a6a46, 0x6e4a32], tops = [0x2f6db0, 0xc0392b, 0x2e8b57, 0xe0a030, 0x7b4fa0, 0x3a3a3a, 0xf0f0f0, 0x16a0a0];
  const pants = [0x2b3a55, 0x3a3a3a, 0x6b5a45, 0x1e2a3a, 0x8a8a8a], hairs = [0x2a1a10, 0x5b3a22, 0xd8b060, 0x8a8a8a, 0x1a1a1a, 0xa0522d];
  const kid = r(1) < 0.18;
  const top = tops[Math.floor(r(tops.length))];
  return {
    name: 'npc', scale: kid ? 1 : 1.3, legLen: kid ? 0.58 : 0.86, torso: kid ? 0.95 : 1.35, arm: kid ? 0.42 : 0.62, shoulder: kid ? 0.95 : 1.35, hipW: kid ? 0.95 : 1.25,
    headR: kid ? 0.14 : 0.125, bodyW: kid ? 0.15 : 0.2, child: kid,
    skin: skins[Math.floor(r(skins.length))], hair: hairs[Math.floor(r(hairs.length))], eyes: 0x3a2a1a,
    suit: top, panel: top, accent: pants[Math.floor(r(pants.length))], trim: top, shoes: 0x2a2a2a, glow: 0, hairStyle: r(1) < 0.4 ? 'long' : 'short', npc: true,
    pantsColor: pants[Math.floor(r(pants.length))],
  };
}

/** Construye el personaje. Devuelve { group (raíz), mesh, bones, face, wrist:{L,R}, height } */
export function buildCharacter(o = MATEO) {
  const L = layout(o);
  const bones = {}, world = {};
  for (const name of BONES) {
    const [parent, x, y, z] = L[name];
    const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z);
    bones[name] = b;
    if (parent) bones[parent].add(b);
    world[name] = new THREE.Vector3(x, y, z).add(parent ? world[parent] : new THREE.Vector3());
  }
  const idx = Object.fromEntries(BONES.map((n, i) => [n, i]));
  const parts = [];
  /** agrega geometría con pesos: fn(posición) → [[hueso, peso], ...] */
  function part(geo, color, weights) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    _c.setHex(color);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      p.fromBufferAttribute(g.attributes.position, i);
      const w = typeof weights === 'string' ? [[weights, 1]] : Array.isArray(weights) ? weights : weights(p);
      let tot = 0; w.forEach(([, v]) => tot += v);
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = w[k] ? idx[w[k][0]] : 0; sw[i * 4 + k] = w[k] ? w[k][1] / tot : 0; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(g);
  }
  const at = (geo, v, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { geo.scale(sx, sy, sz); geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(v.x, v.y, v.z); return geo; };
  /** tubo entre dos huesos con mezcla suave hacia el hijo (y hacia el padre al inicio) */
  function limb(a, bName, r0, r1, color, parentBlend, seg = 8, childBlend = 0.25) {
    const A = world[a], Bp = world[bName], dir = new THREE.Vector3().subVectors(Bp, A), len = dir.length();
    const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 6, false);
    geo.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    geo.applyQuaternion(q); geo.translate(A.x, A.y, A.z);
    part(geo, color, p => {
      const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, A).dot(dir) / (len * len)));
      if (t > 1 - childBlend) { const k = (t - (1 - childBlend)) / childBlend * 0.5; return [[a, 1 - k], [bName, k]]; }
      if (parentBlend && t < 0.15) { const k = (0.15 - t) / 0.15 * 0.5; return [[a, 1 - k], [parentBlend, k]]; }
      return [[a, 1]];
    });
  }
  const s = o.scale, bw = o.bodyW, hr = o.headR;
  const skin = o.skin, suit = o.suit, legs = o.npc ? o.pantsColor : suit;
  // torso (cadera, abdomen, pecho) con mezcla entre huesos de columna
  const torsoGeo = new THREE.CylinderGeometry(bw * 0.98, bw * 0.88, (world.neck.y - world.hips.y) + 0.04, 14, 8);
  { const tp = torsoGeo.attributes.position; for (let i = 0; i < tp.count; i++) { const yy = tp.getY(i) / ((world.neck.y - world.hips.y) / 2 + 0.02); const k = 1 - Math.max(0, yy - 0.6) * 0.55; tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * (0.95 - Math.max(0, yy - 0.6) * 0.3)); } }
  torsoGeo.scale(1, 1, 0.78); torsoGeo.translate(0, (world.neck.y + world.hips.y) / 2 - 0.01, 0);
  part(torsoGeo, suit, p => {
    const y = p.y;
    if (y < world.spine.y) return [['hips', 1]];
    if (y < world.chest.y) { const k = (y - world.spine.y) / (world.chest.y - world.spine.y); return [['spine', 1 - k * 0.5], [k < 0.5 ? 'hips' : 'chest', Math.abs(k - 0.5)]]; }
    if (y > world.neck.y - 0.03) return [['chest', 0.6], ['neck', 0.4]];
    return [['chest', 1]];
  });
  // pelvis / short
  part(at(new THREE.SphereGeometry(bw * 0.9, 14, 10), new THREE.Vector3(0, world.hips.y - 0.005, 0), 0, 0, 0, 0.98, 0.5, 0.72), legs, 'hips');
  if (!o.npc) {
    // panel rojo del pecho, franjas laterales, cinturón blanco
    part(at(new THREE.CylinderGeometry(bw * 0.97, bw * 0.99, 0.045, 16, 1, true), new THREE.Vector3(0, world.chest.y + 0.115 * o.torso, 0), 0, 0, 0, 1.02, 1, 0.81), o.accent, 'chest'); // franja roja del pecho
    part(at(new THREE.CylinderGeometry(bw * 1.08, bw * 1.08, 0.035, 14), new THREE.Vector3(0, world.spine.y - 0.01, 0), 0, 0, 0, 1, 1, 0.74), o.trim, [['spine', 0.5], ['hips', 0.5]]);
    // cuello capucha compacta
    part(at(new THREE.TorusGeometry(bw * 0.62, 0.035, 8, 16), new THREE.Vector3(0, world.neck.y, -0.01), Math.PI / 2, 0, 0, 1, 1, 0.8), o.panel, 'neck');
  } else {
    part(at(new THREE.CylinderGeometry(bw * 0.6, bw * 0.8, 0.05, 12), new THREE.Vector3(0, world.neck.y - 0.01, 0), 0, 0, 0, 1, 1, 0.75), o.suit, 'chest');
  }
  // cuello y cabeza
  part(at(new THREE.CylinderGeometry(0.042 * s, 0.048 * s, 0.07 * s, 8), new THREE.Vector3(0, world.neck.y + 0.03 * s, 0)), skin, [['neck', 1]]);
  const headC = new THREE.Vector3(0, world.head.y + hr * 0.95, 0.005);
  part(at(new THREE.SphereGeometry(hr, 20, 16), headC, 0, 0, 0, 0.98, 1.0, 1.0), skin, 'head');
  part(at(new THREE.SphereGeometry(hr * 0.62, 12, 10), headC.clone().add(new THREE.Vector3(0, -hr * 0.42, 0.025)), 0, 0, 0, 1.15, 0.8, 1), skin, 'head'); // mandíbula/mejillas
  for (const sx of [-1, 1]) part(at(new THREE.SphereGeometry(hr * 0.2, 8, 6), headC.clone().add(new THREE.Vector3(sx * hr * 0.97, -hr * 0.05, 0)), 0, 0, 0, 0.5, 1, 0.8), skin, 'head'); // orejas
  part(at(new THREE.SphereGeometry(hr * 0.13, 8, 6), headC.clone().add(new THREE.Vector3(0, -hr * 0.12, hr * 0.98)), 0, 0, 0, 0.9, 0.8, 1), shade(skin, 0.95), 'head'); // nariz
  for (const sx of [-1, 1]) part(at(new THREE.SphereGeometry(hr * 0.17, 8, 6), headC.clone().add(new THREE.Vector3(sx * hr * 0.55, -hr * 0.3, hr * 0.74)), 0, 0, 0, 1, 0.6, 0.3), o.child ? 0xf3a28e : shade(skin, 0.92), 'head'); // mejillas
  // pelo
  const hair = o.hair, hs = o.hairStyle;
  part(at(new THREE.SphereGeometry(hr * 1.05, 18, 12, 0, Math.PI * 2, 0, Math.PI * (hs === 'long' ? 0.62 : 0.5)), headC.clone().add(new THREE.Vector3(0, hr * 0.05, -hr * 0.04)), -0.25, 0, 0, 1.02, 1, 1.04), hair, 'head');
  if (hs === 'messy') {
    // mechones despeinados: conos que salen del cuero cabelludo hacia afuera, flequillo hacia la frente
    const up = new THREE.Vector3(0, 1, 0), pr = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(11);
    for (let i = 0; i < 26; i++) {
      const th = pr() * Math.PI * 2, ph = 0.15 + pr() * 0.95;
      const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      if (dir.z > 0.55 && dir.y < 0.55) continue; // no tapar la cara
      const tuft = new THREE.ConeGeometry(hr * (0.17 + pr() * 0.08), hr * (0.32 + pr() * 0.22), 5);
      tuft.translate(0, hr * 0.2, 0);
      const tilt = dir.clone().add(new THREE.Vector3((pr() - 0.5) * 0.6, -0.15, -0.55)).normalize();
      tuft.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, tilt));
      const c = headC.clone().add(dir.clone().multiplyScalar(hr * 0.93)).add(new THREE.Vector3(0, hr * 0.04, -hr * 0.03));
      tuft.translate(c.x, c.y, c.z);
      part(tuft, shade(hair, 0.85 + pr() * 0.3), 'head');
    }
    for (let i = 0; i < 5; i++) { // flequillo
      const fr = new THREE.ConeGeometry(hr * 0.13, hr * 0.42, 5); fr.rotateX(2.2); fr.rotateZ((i - 2) * 0.18);
      fr.translate((i - 2) * hr * 0.2, headC.y + hr * 0.62, headC.z + hr * 0.8); part(fr, shade(hair, 0.95), 'head');
    }
  } else if (hs === 'long') {
    part(at(new THREE.CylinderGeometry(hr * 0.95, hr * 1.05, hr * 1.3, 14, 1, true, Math.PI * 0.35, Math.PI * 1.3), headC.clone().add(new THREE.Vector3(0, -hr * 0.45, -hr * 0.12))), hair, [['head', 0.8], ['neck', 0.2]]);
  }
  // brazos
  for (const sd of ['L', 'R']) {
    const sx = sd === 'L' ? 1 : -1;
    part(at(new THREE.SphereGeometry(0.052 * s * o.shoulder, 10, 8), world['upperarm_' + sd]), o.suit, [['upperarm_' + sd, 0.6], ['chest', 0.4]]);
    limb('upperarm_' + sd, 'lowerarm_' + sd, 0.048 * s, 0.042 * s, o.suit, 'chest');
    limb('lowerarm_' + sd, 'hand_' + sd, 0.042 * s, 0.036 * s, o.npc ? (o.child ? skin : o.suit) : o.suit, null);
    if (!o.npc) {
      part(at(new THREE.CylinderGeometry(0.048 * s, 0.048 * s, 0.07, 10), world['hand_' + sd].clone().add(new THREE.Vector3(0, 0.06, 0))), o.accent, 'lowerarm_' + sd); // guante
    }
    part(at(new THREE.SphereGeometry(0.038 * s, 10, 8), world['hand_' + sd].clone().add(new THREE.Vector3(0, -0.035 * s, 0.005)), 0, 0, 0, 0.8, 1.15, 0.65), o.npc ? skin : o.accent, 'hand_' + sd);
    part(at(new THREE.SphereGeometry(0.018 * s, 6, 5), world['hand_' + sd].clone().add(new THREE.Vector3(-sx * 0.0, -0.03 * s, 0.04 * s))), o.npc ? skin : o.accent, 'hand_' + sd); // pulgar
  }
  // piernas
  for (const sd of ['L', 'R']) {
    limb('upperleg_' + sd, 'lowerleg_' + sd, 0.07 * s, 0.058 * s, legs, 'hips', 10);
    limb('lowerleg_' + sd, 'foot_' + sd, 0.058 * s, 0.046 * s, legs, null, 10);
    const f = world['foot_' + sd];
    part(at(new THREE.SphereGeometry(0.06 * s, 12, 8), f.clone().add(new THREE.Vector3(0, -0.01 * s, 0.035 * s)), 0, 0, 0, 0.9, 0.7, 1.7), o.shoes, 'foot_' + sd);
    part(at(new THREE.SphereGeometry(0.05 * s, 10, 8), world['toes_' + sd].clone().add(new THREE.Vector3(0, -0.012 * s, 0.0)), 0, 0, 0, 1, 0.75, 1.1), o.shoes, 'toes_' + sd);
    part(at(new THREE.SphereGeometry(0.058 * s, 12, 6), f.clone().add(new THREE.Vector3(0, -0.04 * s, 0.05 * s)), 0, 0, 0, 0.95, 0.22, 2.1), o.npc ? 0x202020 : o.trim, [['foot_' + sd, 0.7], ['toes_' + sd, 0.3]]);
    if (!o.npc) part(at(new THREE.CylinderGeometry(0.06 * s, 0.062 * s, 0.1 * s, 10), f.clone().add(new THREE.Vector3(0, 0.05 * s, 0))), o.accent, 'lowerleg_' + sd); // caña de bota
  }
  if (o.simpleFace) { // vecinos: ojos y boca dentro de la misma malla (1 draw call por persona)
    for (const sx of [-1, 1]) { part(at(new THREE.SphereGeometry(hr * 0.16, 8, 6), headC.clone().add(new THREE.Vector3(sx * hr * 0.36, hr * 0.06, hr * 0.86)), 0, 0, 0, 1, 1.1, 0.5), 0xffffff, 'head'); part(at(new THREE.SphereGeometry(hr * 0.1, 8, 6), headC.clone().add(new THREE.Vector3(sx * hr * 0.36, hr * 0.06, hr * 0.94)), 0, 0, 0, 1, 1.1, 0.5), 0x2a1a10, 'head'); }
    part(at(new THREE.TorusGeometry(hr * 0.2, hr * 0.04, 5, 10, Math.PI), headC.clone().add(new THREE.Vector3(0, -hr * 0.32, hr * 0.88)), 0, 0, Math.PI, 1, 0.7, 1), 0x8a2a2a, 'head');
  }
  // V2 P3: las piezas se arman sin índice (toNonIndexed); al unirlas se vuelven a compartir los vértices idénticos
  // (misma posición, normal, color y pesos) → ~4× menos vértices y memoria JS por personaje, mismo aspecto
  const geo = mergeVertices(mergeGeometries(parts, false));
  for (const pg of parts) pg.dispose();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = o.name + '_cuerpo';
  mesh.castShadow = true; mesh.frustumCulled = false;
  const group = new THREE.Group(); group.name = o.name;
  group.add(bones.root); group.add(mesh);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map(n => bones[n]));
  mesh.bind(skeleton);

  if (o.simpleFace) return { group, mesh, bones, face: null, wrist: { L: null, R: null }, skeleton, height: world.head.y + hr * 1.9 };
  /* ---------- rostro y extras (hijos de huesos, sin skinning) ---------- */
  const head = bones.head, hy = headC.y - world.head.y;
  const flat = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, emissive: e || 0x000000 });
  const face = { lids: [], mouth: null, brows: [] };
  for (const sx of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(sx * hr * 0.36, hy + hr * 0.08, hr * 0.84);
    const white = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.2, 12, 10), flat(0xffffff)); white.scale.set(1, 1.15, 0.55);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.13, 12, 10), flat(o.eyes)); iris.position.z = hr * 0.07; iris.scale.set(1, 1.1, 0.45);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.07, 8, 8), flat(0x0d0805)); pupil.position.z = hr * 0.12; pupil.scale.set(1, 1, 0.4);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(hr * 0.04, hr * 0.05, hr * 0.15);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.215, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(skin)); lid.scale.set(1.05, 0.05, 0.62); lid.position.y = hr * 0.17;
    lid.name = 'parpado_' + (sx > 0 ? 'L' : 'R');
    eye.add(white, iris, pupil, glint, lid);
    eye.name = 'ojo_' + (sx > 0 ? 'L' : 'R');
    head.add(eye); face.lids.push(lid);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.32, hr * 0.06, hr * 0.06), flat(shade(o.hair, 0.8)));
    brow.position.set(sx * hr * 0.37, hy + hr * 0.38, hr * 0.9); brow.rotation.z = -sx * 0.12; brow.name = 'ceja_' + (sx > 0 ? 'L' : 'R'); head.add(brow); face.brows.push(brow);
  }
  const mouthY = hy - hr * 0.42, mouthZ = hr * 0.86;
  // boca con morph targets (blendshapes): sonrisa, abierta (hablar) y sorpresa
  const mg = new THREE.SphereGeometry(hr * 0.22, 18, 10); mg.scale(1, 0.16, 0.35);
  const base = mg.attributes.position, n = base.count, R = hr * 0.22;
  const tgt = fn => { const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const [x, y, z] = fn(base.getX(i), base.getY(i), base.getZ(i)); a[i * 3] = x; a[i * 3 + 1] = y; a[i * 3 + 2] = z; } return new THREE.Float32BufferAttribute(a, 3); };
  mg.morphAttributes.position = [
    tgt((x, y, z) => [x * 1.08, y + (x / R) ** 2 * hr * 0.09 - hr * 0.03, z]),
    tgt((x, y, z) => [x * 0.92, y * 4.2 - hr * 0.02, z * 1.1]),
    tgt((x, y, z) => [x * 0.5, y * 3.4 - hr * 0.01, z]),
  ];
  const mouth = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: 0x7a2424, roughness: 0.5 }));
  mouth.morphTargetDictionary = { sonrisa: 0, abierta: 1, sorpresa: 2 }; mouth.morphTargetInfluences = [1, 0, 0];
  mouth.position.set(0, mouthY + hr * 0.04, mouthZ + hr * 0.02); mouth.name = 'boca';
  head.add(mouth); face.mouth = mouth;

  /** emblema M en el pecho y emisores de cable en las muñecas */
  const wrist = { L: null, R: null };
  if (!o.npc) {
    const em = new THREE.Group(); em.name = 'emblema_M';
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(bw * 0.42, bw * 0.42, 0.012, 20), flat(0xffffff)); disk.rotation.x = Math.PI / 2; em.add(disk);
    const M = new THREE.Shape(); const m = bw * 0.28;
    M.moveTo(-m, -m); M.lineTo(-m, m); M.lineTo(0, 0.1 * m); M.lineTo(m, m); M.lineTo(m, -m); M.lineTo(m * 0.6, -m); M.lineTo(m * 0.6, m * 0.25); M.lineTo(0, -m * 0.55); M.lineTo(-m * 0.6, m * 0.25); M.lineTo(-m * 0.6, -m); M.closePath();
    const mm = new THREE.Mesh(new THREE.ExtrudeGeometry(M, { depth: 0.012, bevelEnabled: false }), flat(o.accent, 0x330000)); mm.position.z = 0.004; em.add(mm);
    em.position.set(0, world.chest.y - world.chest.y + 0.05, bw * 0.74); bones.chest.add(em);
    for (const sd of ['L', 'R']) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05 * s, 0.014, 6, 16), new THREE.MeshBasicMaterial({ color: o.glow, toneMapped: false }));
      ring.rotation.x = Math.PI / 2; ring.position.y = -o.arm * 0.48 * 0.62; ring.name = 'emisor_' + sd;
      bones['lowerarm_' + sd].add(ring);
      const tip = new THREE.Object3D(); tip.name = 'muneca_' + sd; tip.position.set(0, -0.07, 0.02); bones['hand_' + sd].add(tip);
      wrist[sd] = tip;
    }
  }
  return { group, mesh, bones, face, wrist, skeleton, height: world.head.y + hr * 1.9 };
}
function shade(hex, k) { _c.setHex(hex); _c.r = Math.min(1, _c.r * k); _c.g = Math.min(1, _c.g * k); _c.b = Math.min(1, _c.b * k); return _c.getHex(); }

/** Control de expresiones: 'neutral'|'smile'|'talk'|'surprised'|'wink'|'focus'. Parpadeo automático. */
export function createFace(face) {
  let blinkT = 2, expr = 'smile', talkT = 0;
  return {
    set(e) { expr = e; },
    get expr() { return expr; },
    update(dt) {
      blinkT -= dt; talkT += dt;
      let lidL = 0.05, lidR = 0.05;
      if (blinkT < 0.12) { lidL = lidR = 1; } if (blinkT < 0) blinkT = 2 + Math.random() * 3;
      if (expr === 'wink') lidR = 1;
      if (expr === 'focus') { lidL = Math.max(lidL, 0.45); lidR = Math.max(lidR, 0.45); }
      face.lids[0].scale.y = lidL; face.lids[1].scale.y = lidR;
      const talking = expr === 'talk' && Math.sin(talkT * 18) > -0.2;
      const inf = face.mouth.morphTargetInfluences, dic = face.mouth.morphTargetDictionary || { sonrisa: 0, abierta: 1, sorpresa: 2 };
      const w = { sonrisa: expr === 'smile' || expr === 'wink' ? 1 : expr === 'talk' ? 0.5 : expr === 'neutral' ? 0.15 : 0, abierta: talking ? 0.35 + 0.5 * Math.abs(Math.sin(talkT * 11)) : expr === 'focus' ? 0.3 : 0, sorpresa: expr === 'surprised' ? 1 : 0 };
      for (const k in w) if (dic[k] !== undefined) inf[dic[k]] += (w[k] - inf[dic[k]]) * Math.min(1, dt * 14);
      const up = expr === 'surprised' ? 0.025 : expr === 'focus' ? -0.012 : 0;
      face.brows.forEach((b, i) => { b.position.y = (b.userData.y0 ??= b.position.y) + up; b.rotation.z = (i ? -1 : 1) * (expr === 'focus' ? -0.25 : -0.12) * -1; });
    },
  };
}
