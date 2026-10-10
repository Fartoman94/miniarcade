// @ts-check
/* Corsarios del Abismo — efectos con pools de InstancedMesh (sin asignaciones por cuadro):
   espuma plana sobre el agua (estela, salpicaduras), partículas brillantes (gotas, fuego, fogonazos, chispas
   espectrales), humo, astillas, y anillos/telegrafías sobre el agua (círculos de mortero, carriles de embestida). */
import * as THREE from 'three';
import { waveHeight } from './water.js';

const MAXP = 520;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qf = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
_qf.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** @param {THREE.Material} mat @param {THREE.BufferGeometry} geo @param {'flat'|'bill'|'solid'} mode */
function makePool(mat, geo, mode, additive) {
  const mesh = new THREE.InstancedMesh(geo, mat, MAXP);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, _c.set(0xffffff));
  /** @type {THREE.InstancedBufferAttribute} */ (mesh.instanceColor).setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false;
  const F = n => new Float32Array(MAXP * n);
  return { mesh, mode, additive, n: 0, cap: 200, p: F(3), v: F(3), col: F(3), life: F(1), max: F(1), size: F(1), grow: F(1), grav: F(1), drag: F(1), rot: F(1), spin: F(1), float: new Uint8Array(MAXP) };
}

/**
 * @param {THREE.Scene} scene
 * @param {() => boolean} reduced
 */
export function createFx(scene, reduced) {
  const tex = softTexture();
  const quad = new THREE.PlaneGeometry(1, 1);
  const foam = makePool(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false }), quad, 'flat', false);
  const glow = makePool(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), quad, 'bill', true);
  const smoke = makePool(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }), quad, 'bill', false);
  const debris = makePool(new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), new THREE.BoxGeometry(0.5, 0.18, 1.0), 'solid', false);
  foam.mesh.renderOrder = 1; glow.mesh.renderOrder = 3; smoke.mesh.renderOrder = 2;
  const pools = [foam, glow, smoke, debris];
  pools.forEach(P => scene.add(P.mesh));

  /** @param {ReturnType<typeof makePool>} P */
  function spawn(P, x, y, z, vx, vy, vz, life, size, color, grav = 0, grow = 0, drag = 0, float = 0) {
    if (P.n >= P.cap) return;
    const i = P.n++;
    P.p[i * 3] = x; P.p[i * 3 + 1] = y; P.p[i * 3 + 2] = z;
    P.v[i * 3] = vx; P.v[i * 3 + 1] = vy; P.v[i * 3 + 2] = vz;
    _c.setHex(color); P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
    P.life[i] = life; P.max[i] = life; P.size[i] = size; P.grow[i] = grow; P.grav[i] = grav; P.drag[i] = drag;
    P.rot[i] = Math.random() * 6.28; P.spin[i] = (Math.random() - 0.5) * 6; P.float[i] = float;
  }
  function copy(P, i, j) {
    for (const k of ['p', 'v', 'col']) { const a = P[k]; a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; }
    for (const k of ['life', 'max', 'size', 'grow', 'grav', 'drag', 'rot', 'spin', 'float']) P[k][i] = P[k][j];
  }
  /** @param {ReturnType<typeof makePool>} P @param {number} dt @param {THREE.Quaternion} camQ */
  function step(P, dt, camQ) {
    let i = 0;
    const ic = /** @type {THREE.InstancedBufferAttribute} */ (P.mesh.instanceColor);
    while (i < P.n) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.n--; if (i !== P.n) copy(P, i, P.n); continue; }
      const k = Math.exp(-P.drag[i] * dt);
      P.v[i * 3] *= k; P.v[i * 3 + 2] *= k; P.v[i * 3 + 1] = P.v[i * 3 + 1] * k - P.grav[i] * dt;
      P.p[i * 3] += P.v[i * 3] * dt; P.p[i * 3 + 1] += P.v[i * 3 + 1] * dt; P.p[i * 3 + 2] += P.v[i * 3 + 2] * dt;
      const x = P.p[i * 3], z = P.p[i * 3 + 2];
      if (P.mode === 'flat' || P.float[i]) P.p[i * 3 + 1] = waveHeight(x, z) + (P.mode === 'flat' ? 0.12 : 0.1);
      else if (P.grav[i] > 0 && P.p[i * 3 + 1] < -1.5) P.life[i] = Math.min(P.life[i], 0.01);
      P.rot[i] += P.spin[i] * dt;
      const t = P.life[i] / P.max[i];
      let sz = P.size[i] * (1 + (1 - t) * P.grow[i]);
      if (!P.additive) sz *= Math.min(1, t * 2.2);
      sz = Math.max(0.001, sz);
      if (P.mode === 'flat') _q.copy(_qf), _q.multiply(_qtmp.setFromAxisAngle(_z, P.rot[i]));
      else if (P.mode === 'bill') _q.copy(camQ).multiply(_qtmp.setFromAxisAngle(_z, P.rot[i]));
      else _q.setFromEuler(_e.set(P.rot[i], P.rot[i] * 0.7, P.rot[i] * 1.3));
      _m.compose(_p.set(P.p[i * 3], P.p[i * 3 + 1], P.p[i * 3 + 2]), _q, _s.set(sz, sz, sz));
      P.mesh.setMatrixAt(i, _m);
      const a = P.additive ? Math.min(1, t * 1.6) : 1;
      ic.array[i * 3] = P.col[i * 3] * a; ic.array[i * 3 + 1] = P.col[i * 3 + 1] * a; ic.array[i * 3 + 2] = P.col[i * 3 + 2] * a;
      i++;
    }
    P.mesh.count = P.n;
    P.mesh.instanceMatrix.needsUpdate = true;
    ic.needsUpdate = true;
  }
  const _qtmp = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

  /* anillos y telegrafías sobre el agua */
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 32); discGeo.rotateX(-Math.PI / 2);
  const laneGeo = new THREE.PlaneGeometry(1, 1); laneGeo.rotateX(-Math.PI / 2); laneGeo.translate(0, 0, 0.5);
  /** @type {{mesh:THREE.Mesh, t:number, dur:number, r0:number, r1:number, fade:boolean, follow:boolean}[]} */
  const rings = [];
  for (let i = 0; i < 14; i++) {
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    mesh.visible = false; mesh.renderOrder = 4; scene.add(mesh); rings.push({ mesh, t: 0, dur: 1, r0: 1, r1: 2, fade: true, follow: true });
  }
  /** Marcadores persistentes (los maneja el que los pide): disco/anillo/carril. */
  const markers = [];
  function marker(kind, color) {
    const geo = kind === 'disc' ? discGeo : kind === 'lane' ? laneGeo : ringGeo;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
    mesh.visible = false; mesh.renderOrder = 4; scene.add(mesh); markers.push(mesh);
    return mesh;
  }

  let shakeAmt = 0;
  let wakeMul = 1;
  const api = {
    get count() { return foam.n + glow.n + smoke.n + debris.n; },
    get cap() { return foam.cap + glow.cap + smoke.cap + debris.cap; },
    get shakeAmt() { return reduced() ? 0 : shakeAmt; },
    /** @param {number} total */
    setCap(total) { foam.cap = Math.min(MAXP, Math.round(total * 0.4)); glow.cap = Math.min(MAXP, Math.round(total * 0.3)); smoke.cap = Math.min(MAXP, Math.round(total * 0.2)); debris.cap = Math.min(MAXP, Math.round(total * 0.1)); },
    setWake(k) { wakeMul = k; },
    shake(a) { if (!reduced()) shakeAmt = Math.min(1.2, Math.max(shakeAmt, a)); },
    marker,
    /** Espuma de estela (plana) */
    wake(x, z, size = 1.4, life = 2.2) { spawn(foam, x + (Math.random() - 0.5) * 0.6, 0, z + (Math.random() - 0.5) * 0.6, 0, 0, 0, life * wakeMul, size, 0xf4fbff, 0, 1.4, 0); },
    /** Gotas de proa */
    spray(x, y, z, vx, vz, n = 2, color = 0xd8f0ff) { for (let i = 0; i < n; i++) spawn(glow, x, y, z, vx + (Math.random() - 0.5) * 2, 2 + Math.random() * 2.5, vz + (Math.random() - 0.5) * 2, 0.6, 0.35 + Math.random() * 0.25, color, 9.8, 0.5, 0.4); },
    /** Impacto de bala en el agua */
    splash(x, z, k = 1) {
      const y = waveHeight(x, z);
      for (let i = 0; i < 14 * k; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 3; spawn(glow, x, y + 0.2, z, Math.cos(a) * s, 5 + Math.random() * 7 * k, Math.sin(a) * s, 0.9, 0.5 + Math.random() * 0.4, 0xe8f6ff, 14, 0.3, 0.3); }
      for (let i = 0; i < 4; i++) spawn(foam, x, 0, z, (Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2, 2.2, 1.6 * k, 0xffffff, 0, 2.5, 1);
      api.ring(x, z, 0.5, 4 * k, 0.8, 0xffffff);
    },
    /** Fogonazo de cañón con humo */
    muzzle(x, y, z, dx, dz, color = 0xffc070) {
      spawn(glow, x, y, z, dx * 4, 0.5, dz * 4, 0.18, 1.6, color, 0, 1.2, 2);
      for (let i = 0; i < 3; i++) spawn(smoke, x + dx * i * 0.6, y, z + dz * i * 0.6, dx * (3 + i) + (Math.random() - 0.5), 0.6 + Math.random(), dz * (3 + i) + (Math.random() - 0.5), 1.6 + Math.random(), 1.2 + i * 0.3, color === 0xffc070 ? 0xd8d4cc : 0x9affd8, -0.4, 1.4, 1.2);
    },
    /** Astillas de madera */
    splinters(x, y, z, n = 8, color = 0x8a5a32) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 2 + Math.random() * 5; spawn(debris, x, y, z, Math.cos(a) * s, 3 + Math.random() * 5, Math.sin(a) * s, 1.6 + Math.random(), 0.6 + Math.random() * 0.5, color, 12, 0, 0.3); } },
    /** Explosión (fuego + humo + astillas) */
    explosion(x, y, z, k = 1, color = 0xff8a2a) {
      for (let i = 0; i < 16 * k; i++) { const a = Math.random() * 6.28, s = Math.random() * 6 * k; spawn(glow, x, y, z, Math.cos(a) * s, 2 + Math.random() * 6, Math.sin(a) * s, 0.5 + Math.random() * 0.4, 1.2 + Math.random() * k, i % 3 ? color : 0xffe08a, -1, 1.2, 1.5); }
      for (let i = 0; i < 8 * k; i++) spawn(smoke, x + (Math.random() - 0.5) * 3, y + Math.random() * 2, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 2, 2.5 + Math.random() * 1.5, 2 + Math.random() * 1.5 * k, 0x3a3634, -0.6, 1.5, 0.8);
      api.splinters(x, y, z, Math.round(6 * k));
      api.shakeAt(x, z, 0.5 * k);
    },
    fire(x, y, z, color = 0xff7a2a) { spawn(glow, x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8, 0, 2 + Math.random() * 1.5, 0, 0.6, 0.8 + Math.random() * 0.5, color, -0.5, 0.2, 0.5); },
    smoke(x, y, z, color = 0x4a4644, size = 1.4) { spawn(smoke, x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), (Math.random() - 0.5) * 0.6, 2.4, size, color, -0.2, 1.6, 0.4); },
    sparkle(x, y, z, color = 0xffe27a, n = 1) { for (let i = 0; i < n; i++) spawn(glow, x + (Math.random() - 0.5) * 1.6, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 1.6, 0, 0.8 + Math.random(), 0, 0.9, 0.35 + Math.random() * 0.3, color, 0, 0.2, 0); },
    gold(x, y, z, n = 14) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = 1 + Math.random() * 2.5; spawn(glow, x, y, z, Math.cos(a) * s, 5 + Math.random() * 4, Math.sin(a) * s, 1.0, 0.4, i % 2 ? 0xffd84a : 0xfff2b0, 12, 0, 0.2); } },
    /** Espuma flotante (tiburón, remolino) */
    churn(x, z, size = 1.2) { spawn(foam, x, 0, z, (Math.random() - 0.5), 0, (Math.random() - 0.5), 1.4, size, 0xd0e8f0, 0, 1.2, 0.5); },
    /** Anillo que se expande sobre el agua (efímero) */
    ring(x, z, r0, r1, dur, color, y = -999) {
      const r = rings.find(o => !o.mesh.visible) || rings[0];
      r.mesh.visible = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.follow = y === -999;
      r.mesh.position.set(x, r.follow ? waveHeight(x, z) + 0.15 : y, z);
      /** @type {THREE.MeshBasicMaterial} */ (r.mesh.material).color.setHex(color);
    },
    shakeAt(x, z, a) { void x; void z; api.shake(a); },
    /** @param {number} dt @param {THREE.Camera} cam */
    update(dt, cam) {
      shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
      for (const P of pools) step(P, dt, cam.quaternion);
      for (const r of rings) {
        if (!r.mesh.visible) continue;
        r.t += dt; const k = r.t / r.dur;
        if (k >= 1) { r.mesh.visible = false; continue; }
        r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)));
        if (r.follow) r.mesh.position.y = waveHeight(r.mesh.position.x, r.mesh.position.z) + 0.15;
        /** @type {THREE.MeshBasicMaterial} */ (r.mesh.material).opacity = (1 - k) * 0.8;
      }
    },
    /** Quita los marcadores (al cambiar de región). */
    dropMarkers() { for (const m of markers) { m.removeFromParent(); /** @type {any} */ (m.material).dispose(); } markers.length = 0; },
    clear() { for (const P of pools) { P.n = 0; P.mesh.count = 0; } for (const r of rings) r.mesh.visible = false; for (const m of markers) m.visible = false; },
  };
  return api;
}
