// @ts-check
/* Portales Imposibles — efectos: partículas (InstancedMesh), trazas de disparo, anillos, rayos láser, mira de
   torretas, polvo ambiental y sacudida de cámara. Todo con pools: cero asignaciones por cuadro. */
import { THREE } from '../../matelabs/kit3d.js';

export function createFx(scene, M, reduced) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  /* ---------- partículas ---------- */
  const MAXP = 400;
  const pgeo = new THREE.OctahedronGeometry(0.06, 0);
  const pmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const pmesh = new THREE.InstancedMesh(pgeo, pmat, MAXP);
  pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pmesh.setColorAt(0, new THREE.Color(1, 1, 1));
  pmesh.frustumCulled = false; pmesh.count = 0;
  root.add(pmesh);
  const parts = Array.from({ length: MAXP }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 1, g: 0, r: 1, gg: 1, b: 1 }));
  let alive = 0, cap = 160;
  const _m = new THREE.Matrix4(), _c = new THREE.Color(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  function burst(x, y, z, hex, n, speed = 3, grav = 6, life = 0.6) {
    _c.setHex(hex);
    n = Math.min(n, cap);
    for (let i = 0; i < n; i++) {
      if (alive >= Math.min(MAXP, cap)) break;
      const p = parts[alive++];
      const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), v = speed * (0.35 + Math.random() * 0.65);
      p.x = x; p.y = y; p.z = z; p.vx = Math.sin(b) * Math.cos(a) * v; p.vy = Math.cos(b) * v; p.vz = Math.sin(b) * Math.sin(a) * v;
      p.life = p.max = life * (0.6 + Math.random() * 0.6); p.s = 0.7 + Math.random() * 0.9; p.g = grav;
      p.r = _c.r; p.gg = _c.g; p.b = _c.b;
    }
  }
  /** Chorro direccional (salida de portal, chispas). */
  function spray(x, y, z, dx, dy, dz, hex, n, speed = 3) {
    _c.setHex(hex);
    for (let i = 0; i < n && alive < Math.min(MAXP, cap); i++) {
      const p = parts[alive++];
      p.x = x; p.y = y; p.z = z;
      p.vx = dx * speed + (Math.random() - 0.5) * speed * 0.8; p.vy = dy * speed + (Math.random() - 0.5) * speed * 0.8; p.vz = dz * speed + (Math.random() - 0.5) * speed * 0.8;
      p.life = p.max = 0.35 + Math.random() * 0.3; p.s = 0.6 + Math.random() * 0.6; p.g = 3;
      p.r = _c.r; p.gg = _c.g; p.b = _c.b;
    }
  }
  function updateParts(dt) {
    for (let i = 0; i < alive; i++) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { const t = parts[--alive]; parts[alive] = p; parts[i] = t; i--; continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (let i = 0; i < alive; i++) {
      const p = parts[i], k = p.life / p.max;
      _p.set(p.x, p.y, p.z); _s.setScalar(p.s * (0.3 + 0.7 * k));
      _m.compose(_p, _q, _s); pmesh.setMatrixAt(i, _m);
      _c.setRGB(p.r * k, p.gg * k, p.b * k); pmesh.setColorAt(i, _c);
    }
    pmesh.count = alive;
    pmesh.instanceMatrix.needsUpdate = true;
    if (pmesh.instanceColor) pmesh.instanceColor.needsUpdate = true;
  }

  /* ---------- trazas, rayos y miras (cilindros escalados) ---------- */
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); cyl.rotateX(Math.PI / 2); // eje +z
  const up = new THREE.Vector3(0, 0, 1), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3();
  function makePool(n, mat, r) {
    const list = [];
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(cyl, mat); m.visible = false; m.frustumCulled = false; m.userData.r = r; root.add(m); list.push(m); }
    return list;
  }
  function placeSeg(m, ax, ay, az, bx, by, bz, r) {
    _a.set(ax, ay, az); _b.set(bx, by, bz); _d.subVectors(_b, _a);
    const len = _d.length(); if (len < 1e-4) { m.visible = false; return; }
    m.position.copy(_a).addScaledVector(_d, 0.5);
    m.quaternion.setFromUnitVectors(up, _d.multiplyScalar(1 / len));
    m.scale.set(r, r, len); m.visible = true;
  }
  const tracerMatA = new THREE.MeshBasicMaterial({ color: 0x7fd2ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracerMatB = new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracersA = makePool(3, tracerMatA, 0.025), tracersB = makePool(3, tracerMatB, 0.025);
  const tracerT = new Float32Array(6);
  let tIdx = 0;
  function tracer(which, ax, ay, az, bx, by, bz) {
    const pool = which === 'A' ? tracersA : tracersB, i = tIdx++ % 3;
    placeSeg(pool[i], ax, ay, az, bx, by, bz, 0.03);
    tracerT[(which === 'A' ? 0 : 3) + i] = 0.14;
  }
  const beams = makePool(24, M.beam, 0.035), glows = makePool(24, M.beamGlow, 0.12);
  /** Dibuja los segmentos de láser del paso actual (Float32Array de 6 por segmento). */
  function setBeams(segs, count) {
    for (let i = 0; i < beams.length; i++) {
      if (i < count) {
        const o = i * 6;
        placeSeg(beams[i], segs[o], segs[o + 1], segs[o + 2], segs[o + 3], segs[o + 4], segs[o + 5], 0.035);
        placeSeg(glows[i], segs[o], segs[o + 1], segs[o + 2], segs[o + 3], segs[o + 4], segs[o + 5], 0.11);
      } else { beams[i].visible = false; glows[i].visible = false; }
    }
  }
  const sights = makePool(8, M.sight, 0.018);
  let sightN = 0;
  function sight(ax, ay, az, bx, by, bz) { if (sightN < sights.length) placeSeg(sights[sightN++], ax, ay, az, bx, by, bz, 0.018); }

  /* ---------- anillos ---------- */
  const ringGeo = new THREE.RingGeometry(0.85, 1, 32); ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; root.add(m); return { m, t: 0, d: 1, r: 1 };
  });
  let rIdx = 0;
  function ring(x, y, z, hex, radius, dur = 0.5) {
    const r = rings[rIdx++ % rings.length];
    r.m.position.set(x, y, z); /** @type {any} */ (r.m.material).color.setHex(hex); r.t = 0; r.d = dur; r.r = radius; r.m.visible = true; r.m.scale.setScalar(0.01);
  }

  /* ---------- polvo ambiental ---------- */
  const DUST = 320;
  const dpos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { dpos[i * 3] = (Math.random() - 0.5) * 30; dpos[i * 3 + 1] = Math.random() * 10; dpos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dmat = new THREE.PointsMaterial({ color: 0xbfd8ff, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false });
  const dust = new THREE.Points(dgeo, dmat); dust.frustumCulled = false; root.add(dust);
  let dustN = 160;

  /* ---------- sacudida ---------- */
  let shakeAmt = 0;
  function shake(a) { if (!reduced()) shakeAmt = Math.max(shakeAmt, a); }

  function update(dt, cx, cy, cz) {
    updateParts(dt);
    for (let i = 0; i < 6; i++) if (tracerT[i] > 0) { tracerT[i] -= dt; if (tracerT[i] <= 0) (i < 3 ? tracersA : tracersB)[i % 3].visible = false; }
    for (const r of rings) if (r.m.visible) {
      r.t += dt; const k = r.t / r.d;
      if (k >= 1) { r.m.visible = false; continue; }
      r.m.scale.setScalar(0.05 + r.r * k); /** @type {any} */ (r.m.material).opacity = 0.85 * (1 - k);
    }
    dust.position.set(Math.round(cx / 30) * 30, 0, Math.round(cz / 30) * 30);
    dust.rotation.y += dt * 0.01;
    shakeAmt = Math.max(0, shakeAmt - dt * 1.8);
    // las miras se vuelven a pedir cada paso
    for (let i = sightN; i < sights.length; i++) sights[i].visible = false;
    sightN = 0;
    void cy;
  }
  function clear() {
    alive = 0; pmesh.count = 0;
    for (const m of [...tracersA, ...tracersB, ...beams, ...glows, ...sights]) m.visible = false;
    for (const r of rings) r.m.visible = false;
    shakeAmt = 0;
  }
  return {
    burst, spray, tracer, setBeams, sight, ring, shake, update, clear,
    get shakeAmt() { return shakeAmt; },
    setCap(n) { cap = n; dustN = Math.min(DUST, Math.round(n * 1.1)); dgeo.setDrawRange(0, dustN); },
    setDustColor(hex) { dmat.color.setHex(hex); },
    get dustCount() { return dustN; },
    get particles() { return alive; },
    dispose() { root.traverse(o => { const a = /** @type {any} */ (o); if (a.geometry) a.geometry.dispose(); if (a.material && a.material !== M.beam && a.material !== M.beamGlow && a.material !== M.sight) a.material.dispose(); }); scene.remove(root); },
  };
}
