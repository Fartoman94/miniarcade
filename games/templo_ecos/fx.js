// @ts-check
/* Templo de los Ecos — efectos con pools (partículas instanciadas, anillos, rayos de luz, polvo). Sin asignaciones por cuadro. */
import * as THREE from 'three';

const MAXP = 240, MAX_BEAM = 40;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/** @param {THREE.Scene} scene @param {any} mats @param {()=>boolean} reduced */
export function createFx(scene, mats, reduced) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  // partículas
  const pm = new THREE.MeshBasicMaterial({ toneMapped: false }); pm.userData.shared = true;
  const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), pm, MAXP);
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parts.frustumCulled = false; parts.count = 0;
  root.add(parts);
  const P = Array.from({ length: MAXP }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 1 }));
  let alive = 0;
  for (let i = 0; i < MAXP; i++) parts.setColorAt(i, _c.set(0xffffff));
  // anillos
  const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  const rings = Array.from({ length: 6 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x3fe8d6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const m = new THREE.Mesh(ringGeo, mat); m.rotation.x = -Math.PI / 2; m.visible = false; root.add(m);
    return { m, mat, t: 0, dur: 0.5, max: 4, on: false };
  });
  // rayos de luz
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const core = [], glow = [];
  for (let i = 0; i < MAX_BEAM; i++) {
    const a = new THREE.Mesh(unit, mats.beam); a.visible = false; a.renderOrder = 3; root.add(a); core.push(a);
    const b = new THREE.Mesh(unit, mats.beamGlow); b.visible = false; b.renderOrder = 3; root.add(b); glow.push(b);
  }
  const sparkGeo = new THREE.IcosahedronGeometry(0.22, 0);
  const sparks = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(sparkGeo, mats.beam); m.visible = false; root.add(m); return m; });
  let beamGlow = true, beamCount = 0;
  // polvo en suspensión
  const DUST = 420;
  const dpos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { dpos[i * 3] = (Math.random() - 0.5) * 34; dpos[i * 3 + 1] = Math.random() * 8; dpos[i * 3 + 2] = (Math.random() - 0.5) * 34; }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dmat = new THREE.PointsMaterial({ color: 0xffe0a8, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const dust = new THREE.Points(dgeo, dmat); dust.frustumCulled = false; root.add(dust);
  let dustN = 220;
  dgeo.setDrawRange(0, dustN);

  let shakeAmt = 0;
  const api = {
    root,
    /** @param {number} x @param {number} y @param {number} z @param {number} color @param {number} n @param {number} speed */
    burst(x, y, z, color, n = 12, speed = 3) {
      _c.set(color);
      for (let k = 0; k < n; k++) {
        let i = -1;
        for (let j = 0; j < MAXP; j++) if (P[j].life <= 0) { i = j; break; }
        if (i < 0) return;
        const p = P[i], a = Math.random() * Math.PI * 2, u = Math.random() * 0.8 + 0.2;
        p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * speed * u; p.vz = Math.sin(a) * speed * u; p.vy = (Math.random() * 0.8 + 0.4) * speed;
        p.max = p.life = 0.5 + Math.random() * 0.6; p.s = 0.6 + Math.random() * 0.9;
        parts.setColorAt(i, _c);
      }
      if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    },
    ring(x, y, z, color, max = 4, dur = 0.45) {
      const r = rings.find(q => !q.on) || rings[0];
      r.on = true; r.t = 0; r.dur = dur; r.max = max; r.mat.color.setHex(color); r.m.position.set(x, y, z); r.m.visible = true;
    },
    shake(a) { if (!reduced()) shakeAmt = Math.min(1.2, shakeAmt + a); },
    get shakeAmt() { return shakeAmt; },
    /** @param {number} q cantidad de partículas de polvo según calidad */
    setDust(q) { dustN = Math.min(DUST, q); dgeo.setDrawRange(0, dustN); },
    get dustCount() { return dustN; },
    setDustColor(c) { dmat.color.setHex(c); },
    setBeamGlow(v) { beamGlow = v; },
    get beamCount() { return beamCount; },
    /** Dibuja los segmentos de luz del nivel. @param {Float32Array} segs @param {number} n @param {Float32Array} ends @param {number} ne @param {number} y */
    beams(segs, n, ends, ne, y) {
      beamCount = n;
      for (let i = 0; i < MAX_BEAM; i++) {
        const on = i < n;
        core[i].visible = on; glow[i].visible = on && beamGlow;
        if (!on) continue;
        const k = i * 4;
        _a.set(segs[k], y, segs[k + 1]); _b.set(segs[k + 2], y, segs[k + 3]);
        const len = _a.distanceTo(_b);
        const c = core[i]; c.position.copy(_a).add(_b).multiplyScalar(0.5); c.scale.set(0.09, 0.09, Math.max(0.01, len)); c.lookAt(_b);
        if (beamGlow) { const g = glow[i]; g.position.copy(c.position); g.quaternion.copy(c.quaternion); g.scale.set(0.34, 0.34, Math.max(0.01, len)); }
      }
      for (let i = 0; i < sparks.length; i++) {
        const on = i < ne; sparks[i].visible = on;
        if (on) { sparks[i].position.set(ends[i * 2], y, ends[i * 2 + 1]); sparks[i].scale.setScalar(0.8 + Math.random() * 0.6); }
      }
    },
    clear() {
      for (const p of P) p.life = 0;
      for (const r of rings) { r.on = false; r.m.visible = false; }
      api.beams(new Float32Array(4), 0, new Float32Array(2), 0, 0);
      shakeAmt = 0;
    },
    /** @param {number} dt @param {THREE.Vector3} focus */
    update(dt, focus) {
      alive = 0;
      for (let i = 0; i < MAXP; i++) {
        const p = P[i];
        if (p.life <= 0) { _m.makeScale(0, 0, 0); parts.setMatrixAt(i, _m); continue; }
        p.life -= dt; p.vy -= 9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
        const s = p.s * Math.max(0, p.life / p.max);
        _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(s, s, s)); parts.setMatrixAt(i, _m);
        alive = i + 1;
      }
      parts.count = alive; parts.instanceMatrix.needsUpdate = true;
      for (const r of rings) {
        if (!r.on) continue;
        r.t += dt; const k = r.t / r.dur;
        if (k >= 1) { r.on = false; r.m.visible = false; continue; }
        const s = 0.3 + k * r.max; r.m.scale.set(s, s, 1); r.mat.opacity = 0.85 * (1 - k);
      }
      // polvo anclado al mundo, envuelto alrededor del foco
      const fx = focus.x, fz = focus.z;
      for (let i = 0; i < dustN; i++) {
        let x = dpos[i * 3] + Math.sin(i * 1.7 + dpos[i * 3 + 1]) * dt * 0.15, y = dpos[i * 3 + 1] + dt * 0.12, z = dpos[i * 3 + 2];
        if (y > 8) y -= 8;
        if (x - fx > 17) x -= 34; else if (x - fx < -17) x += 34;
        if (z - fz > 17) z -= 34; else if (z - fz < -17) z += 34;
        dpos[i * 3] = x; dpos[i * 3 + 1] = y; dpos[i * 3 + 2] = z;
      }
      dgeo.attributes.position.needsUpdate = true;
      shakeAmt = Math.max(0, shakeAmt - dt * 2.2);
    },
  };
  return api;
}
