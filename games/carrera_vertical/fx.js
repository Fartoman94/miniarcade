// @ts-check
/* Carrera Vertical — efectos: partículas instanciadas (polvo, chispas, viento), anillos expansivos y sacudida. */
import { THREE } from '../../matelabs/kit3d.js';

export function createFx(scene, reduced) {
  const MAX = 420;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false; mesh.count = 0;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  scene.add(mesh);
  const P = Array.from({ length: MAX }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, g: 0, streak: 0 }));
  let cap = 240, live = 0;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color(), _d = new THREE.Vector3(), _u = new THREE.Vector3(0, 0, 1);
  const rings = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); return { m, t: 0, d: 0.4, r: 2 };
  });
  let shakeAmt = 0;
  function spawn(x, y, z, vx, vy, vz, color, life, size, g = 9, streak = 0) {
    if (live >= cap) return;
    for (let i = 0; i < cap; i++) {
      const p = P[i]; if (p.on) continue;
      p.on = true; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s = size; p.g = g; p.streak = streak;
      _c.set(color); mesh.setColorAt(i, _c); live++;
      return;
    }
  }
  return {
    /** @param {number} n */
    setCap(n) { cap = Math.min(MAX, n); for (let i = cap; i < MAX; i++) if (P[i].on) { P[i].on = false; live--; } },
    get cap() { return cap; },
    get live() { return live; },
    burst(x, y, z, color, n = 10, sp = 3) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, u = Math.random(); spawn(x, y, z, Math.cos(a) * sp * u, Math.random() * sp, Math.sin(a) * sp * u, color, 0.35 + Math.random() * 0.4, 0.07 + Math.random() * 0.08); }
    },
    dust(x, y, z, n = 6, color = 0xd8cfc0) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; spawn(x + Math.cos(a) * 0.3, y + 0.05, z + Math.sin(a) * 0.3, Math.cos(a) * 1.6, 0.6 + Math.random(), Math.sin(a) * 1.6, color, 0.4 + Math.random() * 0.3, 0.12, 2); }
    },
    /** estela de viento al ir rápido */
    wind(x, y, z, vx, vy, vz, color = 0xffffff) {
      spawn(x + (Math.random() - 0.5) * 5, y + Math.random() * 3, z + (Math.random() - 0.5) * 5, -vx * 0.6, -vy * 0.3, -vz * 0.6, color, 0.3, 0.035, 0, 1.4);
    },
    trail(x, y, z, color) { spawn(x, y, z, 0, 0.2, 0, color, 0.35, 0.09, 0); },
    ring(x, y, z, color, r = 2, d = 0.4) {
      const R = rings.find(q => !q.m.visible) || rings[0];
      R.m.visible = true; R.t = 0; R.d = d; R.r = r; R.m.position.set(x, y, z); /** @type {any} */ (R.m.material).color.setHex(color);
    },
    shake(a) { if (!reduced()) shakeAmt = Math.max(shakeAmt, a); },
    get shakeAmt() { return shakeAmt; },
    clear() { for (const p of P) p.on = false; live = 0; mesh.count = 0; for (const r of rings) r.m.visible = false; shakeAmt = 0; },
    update(dt) {
      shakeAmt = Math.max(0, shakeAmt - dt * 1.6);
      let hi = 0;
      for (let i = 0; i < cap; i++) {
        const p = P[i];
        if (!p.on) { if (i < mesh.count) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); } continue; }
        p.life -= dt;
        if (p.life <= 0) { p.on = false; live--; _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); continue; }
        p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = p.life / p.max;
        _p.set(p.x, p.y, p.z);
        if (p.streak) {
          _d.set(p.vx, p.vy, p.vz); const L = _d.length() || 1; _d.multiplyScalar(1 / L);
          _q.setFromUnitVectors(_u, _d); _s.set(p.s, p.s, Math.min(2.2, L * 0.12) * p.streak * k);
        } else { _q.identity(); _s.setScalar(p.s * (0.4 + k * 0.6)); }
        _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
        hi = i + 1;
      }
      mesh.count = Math.max(hi, 0);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      for (const R of rings) {
        if (!R.m.visible) continue;
        R.t += dt; const k = R.t / R.d;
        if (k >= 1) { R.m.visible = false; continue; }
        R.m.scale.setScalar(0.2 + k * R.r); /** @type {any} */ (R.m.material).opacity = 1 - k;
      }
    },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); for (const r of rings) { r.m.geometry.dispose(); /** @type {any} */ (r.m.material).dispose(); } },
  };
}
