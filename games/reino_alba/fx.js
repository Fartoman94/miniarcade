// @ts-check
/* Reino del Alba — efectos: partículas en un InstancedMesh con pool fijo (sin asignaciones por cuadro),
   anillos, púas de raíz, línea de cadena, sacudida de cámara (respeta movimiento reducido) y luciérnagas. */
import * as THREE from 'three';

/** @param {THREE.Scene} scene @param {()=>boolean} reduced */
export function createFx(scene, reduced) {
  const MAX = 160;
  const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const im = new THREE.InstancedMesh(geo, mat, MAX); im.frustumCulled = false; im.count = 0;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  scene.add(im);
  const P = Array.from({ length: MAX }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s: 1, c: new THREE.Color() }));
  let cap = 64;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  // anillos
  const ringGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; scene.add(m); return { m, t: 0, dur: 0.5, r: 1 }; });
  // púas de raíz
  const spikeGeo = new THREE.ConeGeometry(0.22, 1.4, 5).translate(0, 0.7, 0);
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x5a3a24, flatShading: true });
  const spikes = Array.from({ length: 4 }, () => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(spikeGeo, spikeMat); const a = i * 1.26; s.position.set(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6); s.rotation.set(Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3); g.add(s); } g.visible = false; scene.add(g); return { g, t: 0 }; });
  // cadena
  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1).translate(0, 0, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 0.7, roughness: 0.4 }));
  chain.visible = false; scene.add(chain); let chainT = 0;
  let shakeAmt = 0;

  function burst(x, y, z, color, n, sp) {
    let k = 0;
    for (const p of P) {
      if (k >= Math.min(n, cap)) break;
      if (p.on) continue;
      p.on = true; p.x = x; p.y = y; p.z = z; p.t = 0; p.life = 0.5 + Math.random() * 0.4; p.s = 0.6 + Math.random() * 0.8;
      const a = Math.random() * Math.PI * 2, u = Math.random();
      p.vx = Math.cos(a) * sp * (0.4 + u); p.vz = Math.sin(a) * sp * (0.4 + u); p.vy = sp * (0.5 + Math.random());
      p.c.setHex(color); k++;
    }
  }
  return {
    burst,
    ring(x, z, color, r) { const o = rings.find(o => !o.m.visible); if (!o) return; o.m.visible = true; o.t = 0; o.r = r; o.m.position.set(x, 0.08, z); o.m.material.color.setHex(color); },
    spikes(x, z) { const o = spikes.find(o => !o.g.visible) || spikes[0]; o.g.visible = true; o.t = 0; o.g.position.set(x, 0, z); burst(x, 0.3, z, 0x7a5a3a, 8, 3); },
    line(x, z, dx, dz, len) { chain.visible = true; chainT = 0.35; chain.position.set(x, 1.1, z); chain.rotation.set(0, Math.atan2(dx, dz), 0); chain.scale.set(1, 1, len); },
    shake(a) { if (!reduced()) shakeAmt = Math.max(shakeAmt, a); },
    get shakeAmt() { return shakeAmt; },
    setCap(n) { cap = n; },
    get cap() { return cap; },
    clear() { for (const p of P) p.on = false; rings.forEach(o => o.m.visible = false); spikes.forEach(o => o.g.visible = false); chain.visible = false; im.count = 0; },
    update(dt) {
      let n = 0;
      for (const p of P) {
        if (!p.on) continue;
        p.t += dt; if (p.t >= p.life) { p.on = false; continue; }
        p.vy -= 9 * dt; p.x += p.vx * dt; p.y = Math.max(0.05, p.y + p.vy * dt); p.z += p.vz * dt;
        const k = 1 - p.t / p.life;
        m4.compose(pos.set(p.x, p.y, p.z), q, scl.setScalar(p.s * k));
        im.setMatrixAt(n, m4); im.setColorAt(n, p.c); n++;
      }
      im.count = n; if (n) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
      for (const o of rings) { if (!o.m.visible) continue; o.t += dt; const k = o.t / o.dur; if (k >= 1) { o.m.visible = false; continue; } o.m.scale.setScalar(o.r * (0.3 + k * 0.7)); o.m.material.opacity = 1 - k; }
      for (const o of spikes) { if (!o.g.visible) continue; o.t += dt; const k = o.t < 0.15 ? o.t / 0.15 : o.t > 0.8 ? Math.max(0, 1 - (o.t - 0.8) / 0.3) : 1; o.g.scale.set(1, Math.max(0.01, k), 1); if (o.t > 1.1) o.g.visible = false; }
      if (chain.visible) { chainT -= dt; if (chainT <= 0) chain.visible = false; }
      shakeAmt = Math.max(0, shakeAmt - dt * 1.5);
    },
    get count() { return im.count; },
    dispose() { geo.dispose(); mat.dispose(); ringGeo.dispose(); spikeGeo.dispose(); },
  };
}
