// Mateo: Ciudad de Altura — efectos: partículas en pool instanciado (chispas de energía, polvo de aterrizaje,
// destellos de medalla, confeti) y anillos de onda. Sin asignaciones por cuadro.
import * as THREE from 'three';

const MAX = 400;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function soft() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFx(scene, reduced) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: soft(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.setColorAt(0, _c.set(0xffffff)); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 5;
  scene.add(mesh);
  const F = n => new Float32Array(MAX * n);
  const S = { n: 0, cap: 260, p: F(3), v: F(3), col: F(3), life: F(1), max: F(1), size: F(1), grav: F(1) };
  function spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0) {
    if (S.n >= S.cap) return; const i = S.n++;
    S.p.set([x, y, z], i * 3); S.v.set([vx, vy, vz], i * 3); _c.setHex(color); S.col.set([_c.r, _c.g, _c.b], i * 3);
    S.life[i] = S.max[i] = life; S.size[i] = size; S.grav[i] = grav;
  }
  const rings = [];
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.visible = false; scene.add(m); rings.push({ m, t: 0, r: 4 }); }
  const api = {
    get count() { return S.n; },
    setCap(n) { S.cap = Math.min(MAX, n); },
    zap(x, y, z) { for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, b = Math.random() * 3 - 1.5; spawn(x, y, z, Math.cos(a) * 3, b * 2, Math.sin(a) * 3, 0.45, 0.35, i % 2 ? 0x7ff6ff : 0xffffff, 0); } },
    pulse(x, y, z) { for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28; spawn(x, y, z, Math.cos(a) * 5, (Math.random() - 0.3) * 3, Math.sin(a) * 5, 0.35, 0.45, 0x8ff8ff, 0); } api.ring(x, y - 0.8, z, 0x7ff6ff, 3); },
    dust(x, y, z, n = 8) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; spawn(x, y + 0.1, z, Math.cos(a) * 2.5, 0.5 + Math.random(), Math.sin(a) * 2.5, 0.6, 0.7, 0x8a8478, -1); } },
    sparkle(x, y, z, color = 0xffd34a, n = 10) { for (let i = 0; i < n; i++) spawn(x + (Math.random() - 0.5), y + Math.random(), z + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.8, 0.3, color, 3); },
    confetti(x, y, z) { const cols = [0xff5a5a, 0xffd34a, 0x5ad1ff, 0x7aff7a, 0xff8ae0]; for (let i = 0; i < 40; i++) spawn(x, y, z, (Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8, 1.6, 0.3, cols[i % 5], 8); },
    splash(x, y, z) { for (let i = 0; i < 30; i++) { const a = Math.random() * 6.28, sp = 1 + Math.random() * 4; spawn(x, y, z, Math.cos(a) * sp, 4 + Math.random() * 6, Math.sin(a) * sp, 1, 0.4, 0xcfefff, 14); } api.ring(x, y + 0.1, z, 0xffffff, 6); },
    ring(x, y, z, color = 0xffffff, r = 4) { const k = rings.find(o => !o.m.visible) || rings[0]; k.m.visible = true; k.t = 0; k.r = r; k.m.position.set(x, y + 0.06, z); k.m.material.color.setHex(color); },
    update(dt, cam) {
      let i = 0;
      while (i < S.n) {
        S.life[i] -= dt;
        if (S.life[i] <= 0) { S.n--; if (i !== S.n) { S.p.copyWithin(i * 3, S.n * 3, S.n * 3 + 3); S.v.copyWithin(i * 3, S.n * 3, S.n * 3 + 3); S.col.copyWithin(i * 3, S.n * 3, S.n * 3 + 3); S.life[i] = S.life[S.n]; S.max[i] = S.max[S.n]; S.size[i] = S.size[S.n]; S.grav[i] = S.grav[S.n]; } continue; }
        S.v[i * 3 + 1] -= S.grav[i] * dt;
        S.p[i * 3] += S.v[i * 3] * dt; S.p[i * 3 + 1] += S.v[i * 3 + 1] * dt; S.p[i * 3 + 2] += S.v[i * 3 + 2] * dt;
        const k = S.life[i] / S.max[i], sz = S.size[i] * (0.4 + 0.6 * k);
        _m.compose(_p.set(S.p[i * 3], S.p[i * 3 + 1], S.p[i * 3 + 2]), cam.quaternion, _s.set(sz, sz, sz));
        mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.setRGB(S.col[i * 3] * k, S.col[i * 3 + 1] * k, S.col[i * 3 + 2] * k));
        i++;
      }
      mesh.count = S.n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      for (const r of rings) { if (!r.m.visible) continue; r.t += dt; const k = r.t / 0.6; if (k >= 1) { r.m.visible = false; continue; } r.m.scale.setScalar(0.3 + r.r * k); r.m.material.opacity = 1 - k; }
      void reduced;
    },
  };
  return api;
}
