// @ts-check
/* Bastiones Elementales — efectos con pools: partículas instanciadas, anillos, rayos en cadena, clima. Sin asignaciones por cuadro. */
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();

/** @param {THREE.Scene} scene @param {()=>boolean} reduced */
export function createFx(scene, reduced) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  /* ---------- partículas ---------- */
  const MAXP = 900;
  const pGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const pMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const parts = new THREE.InstancedMesh(pGeo, pMat, MAXP);
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parts.frustumCulled = false; parts.count = 0;
  for (let i = 0; i < MAXP; i++) parts.setColorAt(i, _c.set(0xffffff));
  root.add(parts);
  const P = Array.from({ length: MAXP }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 1, g: 1, r: 1, gg: 1, b: 1 }));
  let cap = 420, cursor = 0;

  /* ---------- anillos (telegrafía, explosiones) ---------- */
  const ringGeo = new THREE.RingGeometry(0.9, 1, 48); ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 40); discGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: 16 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(ringGeo, mat); m.visible = false; m.renderOrder = 3; root.add(m);
    return { m, mat, t: 0, dur: 0.5, r0: 0.5, r1: 3, on: false, fill: false, follow: /** @type {any} */ (null), y: 0.1 };
  });
  const discs = Array.from({ length: 6 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(discGeo, mat); m.visible = false; m.renderOrder = 2; root.add(m);
    return { m, mat, t: 0, dur: 1, r: 1, on: false };
  });

  /* ---------- rayos (segmentos) ---------- */
  const MAXSEG = 360;
  const lpos = new Float32Array(MAXSEG * 6);
  const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
  const lmat = new THREE.LineBasicMaterial({ color: 0xfff6a0, transparent: true, opacity: 1, toneMapped: false });
  const lines = new THREE.LineSegments(lgeo, lmat); lines.frustumCulled = false; lines.renderOrder = 4; root.add(lines);
  lgeo.setDrawRange(0, 0);
  /** @type {{ax:number,ay:number,az:number,bx:number,by:number,bz:number,life:number,seed:number}[]} */
  const bolts = Array.from({ length: 40 }, () => ({ ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, life: 0, seed: 0 }));

  /* ---------- clima ---------- */
  const WMAX = 480;
  const wpos = new Float32Array(WMAX * 3), wvel = new Float32Array(WMAX);
  const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3).setUsage(THREE.DynamicDrawUsage));
  const wmat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
  const weather = new THREE.Points(wgeo, wmat); weather.frustumCulled = false; root.add(weather);
  let wKind = 'nieve', wCount = 0;
  const spawnW = i => { wpos[i * 3] = (Math.random() - 0.5) * 50; wpos[i * 3 + 1] = Math.random() * 18; wpos[i * 3 + 2] = (Math.random() - 0.5) * 36; wvel[i] = 0.6 + Math.random() * 0.8; };

  const api = {
    root,
    /** @param {number} n */ setCap(n) { cap = Math.min(MAXP, n); },
    /** @param {string} kind @param {number} n */
    setWeather(kind, n) {
      wKind = kind; wCount = Math.min(WMAX, n);
      wmat.color.set(kind === 'brasas' ? 0xff8a3a : kind === 'tormenta' ? 0xaad0ff : 0xffffff);
      wmat.size = kind === 'brasas' ? 0.16 : kind === 'tormenta' ? 0.1 : 0.2;
      for (let i = 0; i < wCount; i++) spawnW(i);
      wgeo.setDrawRange(0, wCount);
    },
    /** Ráfaga de partículas. */
    burst(x, y, z, color, n = 10, speed = 3, up = 1, size = 1, life = 0.6) {
      if (reduced()) n = Math.ceil(n * 0.5);
      _c.set(color);
      for (let k = 0; k < n; k++) {
        const p = P[cursor]; cursor = (cursor + 1) % cap;
        const a = Math.random() * Math.PI * 2, u = Math.random() * 0.8 + 0.2;
        p.x = x; p.y = y; p.z = z; p.vx = Math.cos(a) * speed * u; p.vz = Math.sin(a) * speed * u; p.vy = (Math.random() * 0.8 + 0.3) * speed * up;
        p.max = p.life = life * (0.6 + Math.random() * 0.8); p.s = size * (0.6 + Math.random() * 0.8); p.g = up >= 0 ? 1 : 0;
        p.r = _c.r; p.gg = _c.g; p.b = _c.b;
      }
    },
    /** Anillo que se expande (o se mantiene, si r0 === r1). */
    ring(x, z, color, r0 = 0.5, r1 = 3, dur = 0.5, y = 0.12, follow = null) {
      const r = rings.find(q => !q.on) || rings[0];
      r.on = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.y = y; r.follow = follow;
      r.mat.color.set(color); r.m.position.set(x, y, z); r.m.visible = true; r.m.scale.setScalar(r0);
      return r;
    },
    /** Disco translúcido de telegrafía (área de efecto). */
    disc(x, z, color, rad, dur) {
      const d = discs.find(q => !q.on) || discs[0];
      d.on = true; d.t = 0; d.dur = dur; d.r = rad; d.mat.color.set(color); d.m.position.set(x, 0.08, z); d.m.scale.setScalar(rad); d.m.visible = true;
      return d;
    },
    /** Rayo quebrado entre dos puntos. */
    bolt(ax, ay, az, bx, by, bz, life = 0.16) {
      const b = bolts.find(q => q.life <= 0) || bolts[0];
      b.ax = ax; b.ay = ay; b.az = az; b.bx = bx; b.by = by; b.bz = bz; b.life = life; b.seed = Math.random() * 100;
    },
    update(dt, cam) {
      // partículas
      let n = 0;
      for (let i = 0; i < cap; i++) {
        const p = P[i]; if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        p.vy -= 9 * dt * p.g; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05 && p.g) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        const k = p.life / p.max, s = p.s * (0.3 + 0.7 * k);
        _q.setFromEuler(_e.set(p.life * 7, p.life * 5, 0));
        parts.setMatrixAt(n, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s)));
        parts.setColorAt(n, _c.setRGB(p.r, p.gg, p.b));
        n++;
      }
      parts.count = n; parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
      // anillos
      for (const r of rings) {
        if (!r.on) continue;
        r.t += dt;
        const k = Math.min(1, r.t / r.dur);
        if (r.follow) r.m.position.set(r.follow.x, r.y, r.follow.z);
        r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (r.r0 === r.r1 ? 1 : 1 - (1 - k) * (1 - k)));
        r.mat.opacity = r.r0 === r.r1 ? 0.5 + 0.4 * Math.sin(r.t * 14) : 0.85 * (1 - k);
        if (k >= 1) { r.on = false; r.m.visible = false; r.follow = null; }
      }
      for (const d of discs) {
        if (!d.on) continue;
        d.t += dt;
        const k = d.t / d.dur;
        d.mat.opacity = 0.12 + 0.18 * k;
        if (k >= 1) { d.on = false; d.m.visible = false; }
      }
      // rayos: 6 tramos quebrados por rayo
      let s = 0;
      for (const b of bolts) {
        if (b.life <= 0) continue;
        b.life -= dt;
        if (b.life <= 0) continue;
        let px = b.ax, py = b.ay, pz = b.az;
        const SEG = 6;
        for (let j = 1; j <= SEG && s < MAXSEG; j++) {
          const t = j / SEG, jit = j === SEG ? 0 : 0.45;
          const nx = b.ax + (b.bx - b.ax) * t + (Math.sin(b.seed + j * 12.9 + b.life * 60) * jit);
          const ny = b.ay + (b.by - b.ay) * t + (Math.sin(b.seed * 1.7 + j * 7.1) * jit * 0.6);
          const nz = b.az + (b.bz - b.az) * t + (Math.cos(b.seed + j * 5.3 + b.life * 50) * jit);
          const o = s * 6;
          lpos[o] = px; lpos[o + 1] = py; lpos[o + 2] = pz; lpos[o + 3] = nx; lpos[o + 4] = ny; lpos[o + 5] = nz;
          px = nx; py = ny; pz = nz; s++;
        }
      }
      lgeo.setDrawRange(0, s * 2); lgeo.attributes.position.needsUpdate = true;
      // clima
      if (wCount) {
        for (let i = 0; i < wCount; i++) {
          const o = i * 3;
          if (wKind === 'brasas') { wpos[o + 1] += wvel[i] * dt * 1.4; wpos[o] += Math.sin(wpos[o + 1] + i) * dt * 0.4; if (wpos[o + 1] > 16) { spawnW(i); wpos[o + 1] = 0; } }
          else if (wKind === 'tormenta') { wpos[o + 1] -= wvel[i] * dt * 16; wpos[o] += dt * 3; if (wpos[o + 1] < 0) { spawnW(i); wpos[o + 1] = 18; } }
          else { wpos[o + 1] -= wvel[i] * dt * 1.6; wpos[o] += Math.sin(wpos[o + 1] * 0.8 + i) * dt * 0.5; if (wpos[o + 1] < 0) { spawnW(i); wpos[o + 1] = 18; } }
        }
        wgeo.attributes.position.needsUpdate = true;
        if (cam) weather.position.set(cam.x, 0, cam.z);
      }
    },
    clear() {
      for (const p of P) p.life = 0;
      for (const r of rings) { r.on = false; r.m.visible = false; r.follow = null; }
      for (const d of discs) { d.on = false; d.m.visible = false; }
      for (const b of bolts) b.life = 0;
    },
    count: () => parts.count,
    dispose() {
      root.removeFromParent();
      pGeo.dispose(); pMat.dispose(); parts.dispose(); ringGeo.dispose(); discGeo.dispose();
      rings.forEach(r => r.mat.dispose()); discs.forEach(d => d.mat.dispose());
      lgeo.dispose(); lmat.dispose(); wgeo.dispose(); wmat.dispose();
    },
  };
  return api;
}
