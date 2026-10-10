// @ts-check
/* Derby de Chatarra — efectos: chispas, humo, escombros, explosiones, anillos y sacudida de cámara.
   Dos pools de InstancedMesh (brillante y sólido) sin asignaciones por cuadro. */
import * as THREE from 'three';

const MAX = 420;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** @param {THREE.Material} mat */
function makePool(mat, geo) {
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, _c.set(0xffffff));
  mesh.count = 0; mesh.frustumCulled = false;
  const F = n => new Float32Array(MAX * n);
  return { mesh, n: 0, cap: 240, p: F(3), v: F(3), life: F(1), max: F(1), size: F(1), grow: F(1), grav: F(1), drag: F(1), rot: F(3), spin: F(3), dirty: false };
}

/**
 * @param {THREE.Scene} scene
 * @param {() => boolean} reduced
 */
export function createFx(scene, reduced) {
  const glow = makePool(new THREE.MeshBasicMaterial({ toneMapped: false }), new THREE.BoxGeometry(1, 1, 1));
  const solid = makePool(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), new THREE.IcosahedronGeometry(0.6, 0));
  scene.add(glow.mesh, solid.mesh);

  /** @param {ReturnType<typeof makePool>} P */
  function spawn(P, x, y, z, vx, vy, vz, life, size, color, grav = 0, grow = 0, drag = 0) {
    if (P.n >= P.cap) return;
    const i = P.n++;
    P.p[i * 3] = x; P.p[i * 3 + 1] = y; P.p[i * 3 + 2] = z;
    P.v[i * 3] = vx; P.v[i * 3 + 1] = vy; P.v[i * 3 + 2] = vz;
    P.life[i] = life; P.max[i] = life; P.size[i] = size; P.grow[i] = grow; P.grav[i] = grav; P.drag[i] = drag;
    P.rot[i * 3] = Math.random() * 6; P.rot[i * 3 + 1] = Math.random() * 6; P.rot[i * 3 + 2] = Math.random() * 6;
    P.spin[i * 3] = (Math.random() - 0.5) * 12; P.spin[i * 3 + 1] = (Math.random() - 0.5) * 12; P.spin[i * 3 + 2] = (Math.random() - 0.5) * 12;
    P.mesh.setColorAt(i, _c.setHex(color));
    P.dirty = true;
  }
  /** @param {ReturnType<typeof makePool>} P @param {number} i @param {number} j */
  function copy(P, i, j) {
    for (const k of ['p', 'v', 'rot', 'spin']) { const a = /** @type {Float32Array} */ (P[k]); a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; }
    for (const k of ['life', 'max', 'size', 'grow', 'grav', 'drag']) { const a = /** @type {Float32Array} */ (P[k]); a[i] = a[j]; }
    const ic = /** @type {THREE.InstancedBufferAttribute} */ (P.mesh.instanceColor);
    ic.array[i * 3] = ic.array[j * 3]; ic.array[i * 3 + 1] = ic.array[j * 3 + 1]; ic.array[i * 3 + 2] = ic.array[j * 3 + 2];
  }
  /** @param {ReturnType<typeof makePool>} P @param {number} dt */
  function step(P, dt) {
    let i = 0;
    while (i < P.n) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.n--; if (i !== P.n) copy(P, i, P.n); P.dirty = true; continue; }
      const k = Math.exp(-P.drag[i] * dt);
      P.v[i * 3] *= k; P.v[i * 3 + 2] *= k; P.v[i * 3 + 1] = P.v[i * 3 + 1] * k - P.grav[i] * dt;
      P.p[i * 3] += P.v[i * 3] * dt; P.p[i * 3 + 1] += P.v[i * 3 + 1] * dt; P.p[i * 3 + 2] += P.v[i * 3 + 2] * dt;
      if (P.p[i * 3 + 1] < 0.05 && P.grav[i] > 0) { P.p[i * 3 + 1] = 0.05; P.v[i * 3 + 1] *= -0.35; P.v[i * 3] *= 0.6; P.v[i * 3 + 2] *= 0.6; }
      P.rot[i * 3] += P.spin[i * 3] * dt; P.rot[i * 3 + 1] += P.spin[i * 3 + 1] * dt; P.rot[i * 3 + 2] += P.spin[i * 3 + 2] * dt;
      const t = P.life[i] / P.max[i];
      const sz = Math.max(0.001, P.size[i] * (P.grow[i] ? (1 + (1 - t) * P.grow[i]) * Math.min(1, t * 3) : Math.min(1, t * 2.5)));
      _m.compose(_p.set(P.p[i * 3], P.p[i * 3 + 1], P.p[i * 3 + 2]), _q.setFromEuler(_e.set(P.rot[i * 3], P.rot[i * 3 + 1], P.rot[i * 3 + 2])), _s.set(sz, sz, sz));
      P.mesh.setMatrixAt(i, _m);
      i++;
    }
    P.mesh.count = P.n;
    P.mesh.instanceMatrix.needsUpdate = true;
    if (P.dirty && P.mesh.instanceColor) { P.mesh.instanceColor.needsUpdate = true; P.dirty = false; }
  }

  /* anillos (ondas de choque, recogidas) */
  const ringGeo = new THREE.RingGeometry(0.86, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  /** @type {{mesh:THREE.Mesh, t:number, dur:number, r:number}[]} */
  const rings = [];
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    mesh.visible = false; mesh.renderOrder = 2; scene.add(mesh); rings.push({ mesh, t: 0, dur: 1, r: 1 });
  }

  let shakeAmt = 0;
  const api = {
    get count() { return glow.n + solid.n; },
    get cap() { return glow.cap + solid.cap; },
    /** @param {number} n partículas por pool según calidad */
    setCap(n) { glow.cap = solid.cap = Math.min(MAX, n); if (glow.n > glow.cap) glow.n = glow.cap; if (solid.n > solid.cap) solid.n = solid.cap; },
    sparks(x, y, z, n, color = 0xffd27a, speed = 9) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8);
        spawn(glow, x, y, z, Math.cos(a) * s, 2 + Math.random() * speed * 0.6, Math.sin(a) * s, 0.25 + Math.random() * 0.35, 0.12 + Math.random() * 0.1, color, 18, 0, 1.5);
      }
    },
    smoke(x, y, z, color = 0x777777, size = 0.8, rise = 2) {
      spawn(solid, x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, rise, (Math.random() - 0.5) * 0.8, 0.7 + Math.random() * 0.5, size, color, -0.5, 1.3, 0.8);
    },
    fire(x, y, z) { spawn(glow, x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, 0, 2.5 + Math.random() * 1.5, 0, 0.35 + Math.random() * 0.25, 0.35, Math.random() < 0.5 ? 0xff7a1a : 0xffd23a, -1, 0.8, 1); },
    dust(x, y, z, color = 0xc8b48a) { spawn(solid, x, y, z, (Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2, 0.6 + Math.random() * 0.4, 0.45, color, -0.2, 1.8, 1.2); },
    debris(x, y, z, n, color, speed = 8) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.8);
        spawn(solid, x, y, z, Math.cos(a) * s, 3 + Math.random() * speed * 0.7, Math.sin(a) * s, 1.2 + Math.random() * 1.2, 0.25 + Math.random() * 0.3, color, 20, 0, 0.4);
      }
    },
    explosion(x, y, z, scale = 1) {
      api.sparks(x, y + 0.5, z, Math.round(18 * scale), 0xffc23a, 12 * scale);
      for (let i = 0; i < 10 * scale; i++) spawn(glow, x + (Math.random() - 0.5) * 2 * scale, y + 0.5 + Math.random(), z + (Math.random() - 0.5) * 2 * scale, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.45 + Math.random() * 0.3, 0.9 * scale, Math.random() < 0.5 ? 0xff5a1a : 0xffc23a, -1, 1.5, 2);
      for (let i = 0; i < 8 * scale; i++) api.smoke(x + (Math.random() - 0.5) * 2, y + 1, z + (Math.random() - 0.5) * 2, 0x2b2b2b, 1.2 * scale, 3);
      api.ring(x, 0.15, z, 0xffa040, 6 * scale, 0.5);
      api.shake(0.6 * scale);
    },
    /** onda expansiva visual */
    ring(x, y, z, color, r, dur) {
      const R = rings.find(q => !q.mesh.visible) || rings[0];
      R.mesh.visible = true; R.t = 0; R.dur = dur; R.r = r; R.mesh.position.set(x, y, z);
      /** @type {THREE.MeshBasicMaterial} */ (R.mesh.material).color.setHex(color);
    },
    /** @param {number} a */
    shake(a) { if (!reduced()) shakeAmt = Math.min(1.2, shakeAmt + a); },
    get shakeAmt() { return shakeAmt; },
    /** @param {number} dt */
    update(dt) {
      step(glow, dt); step(solid, dt);
      for (const R of rings) {
        if (!R.mesh.visible) continue;
        R.t += dt; const k = R.t / R.dur;
        if (k >= 1) { R.mesh.visible = false; continue; }
        const s = 0.2 + k * R.r; R.mesh.scale.set(s, 1, s);
        /** @type {THREE.MeshBasicMaterial} */ (R.mesh.material).opacity = 1 - k;
      }
      shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
    },
    clear() { glow.n = solid.n = 0; glow.mesh.count = solid.mesh.count = 0; rings.forEach(R => R.mesh.visible = false); shakeAmt = 0; },
  };
  return api;
}
