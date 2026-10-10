// @ts-check
/* Carrera Vertical — Vigía Mayor, el dron gigante del Circuito Maestro.
   Fase 1 «La caza»: te persigue por detrás y barre la azotea con un láser telegrafiado (saltalo).
   Fase 2 «Bloqueo»: se adelanta y siembra minas de pulso marcadas en el piso sobre tu trayectoria.
   Fase 3 «Sobrecarga»: vuelve a perseguirte más rápido, con barridos más seguidos y alguna mina.
   Si te alcanza, te atrapa: volvés al último punto de control con penalización. Llegar a la meta = escapar. */
import { THREE } from '../../matelabs/kit3d.js';
import { groundBelow } from './physics.js';
import { bossGeo, bossRotorGeo, bossEyeGeo } from './models.js';

const PHASE_NAMES = ['', 'LA CAZA', 'BLOQUEO', 'SOBRECARGA'];

export function createBoss(ctx, W) {
  const mats = ctx.mats;
  const grp = new THREE.Group(); W.group.add(grp);
  const body = new THREE.Mesh(bossGeo(), mats.prop); body.castShadow = true; grp.add(body);
  const rotors = new THREE.Mesh(bossRotorGeo(), mats.glowAdd.clone()); /** @type {any} */ (rotors.material).opacity = 0.18; /** @type {any} */ (rotors.material).color.setHex(0xcfe0ee); grp.add(rotors);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3348, toneMapped: false });
  const eye = new THREE.Mesh(bossEyeGeo(), eyeMat); grp.add(eye);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3348, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const line = new THREE.Mesh(box, warnMat); line.visible = false; W.group.add(line);
  const wall = new THREE.Mesh(box, beamMat); wall.visible = false; W.group.add(wall);
  const ray = new THREE.Mesh(box, beamMat); ray.visible = false; W.group.add(ray);
  const ringG = new THREE.RingGeometry(0.86, 1, 28).rotateX(-Math.PI / 2), discG = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
  const mines = [0, 1, 2, 3].map(() => {
    const ring = new THREE.Mesh(ringG, warnMat); ring.visible = false; W.group.add(ring);
    const fill = new THREE.Mesh(discG, warnMat); fill.visible = false; W.group.add(fill);
    return { on: false, x: 0, y: 0, z: 0, t: 0, ring, fill };
  });
  const _v = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
  const MINE_R = 2.2;

  const B = {
    active: false, phase: 0, bz: 0, x: 0, y: 30, z: 30, captures: 0, sweeps: 0, sweepHits: 0, mineHits: 0, minesDropped: 0,
    atkT: 2.5, mineT: 1.5, sweep: { on: false, t: 0, z: 0, gy: 0, fire: 0 }, introT: 0, defeated: false, fallT: 0, grp, mines,
    get gap() { return B.active ? Math.max(0, B.bz - ctx.player.body.pos.z) : 0; },
    get phaseName() { return PHASE_NAMES[B.phase] || ''; },
    /** reinicia la persecución desde un punto de control */
    resetAt(cpIndex, z) {
      B.phase = cpIndex + 1; B.bz = z + 24; B.atkT = 2.6; B.mineT = 1.4;
      B.sweep.on = false; line.visible = wall.visible = ray.visible = false;
      for (const m of mines) { m.on = false; m.ring.visible = m.fill.visible = false; }
      B.defeated = false; B.fallT = 0;
      eyeMat.color.setHex(0xff3348);
    },
    start() { B.active = true; B.captures = 0; B.resetAt(0, W.start.z); B.x = W.start.x; B.y = W.start.y + 12; B.z = W.start.z + 26; grp.visible = true; },
    stop() { B.active = false; line.visible = wall.visible = ray.visible = false; for (const m of mines) { m.on = false; m.ring.visible = m.fill.visible = false; } },
    setPhase(n) { if (n === B.phase) return; B.phase = n; B.sweep.on = false; line.visible = wall.visible = ray.visible = false; B.atkT = 2; B.mineT = 0.8; if (n === 3) B.bz = Math.min(B.bz, ctx.player.body.pos.z + 26); ctx.onBossPhase(n); },
    /** cinemática de entrada: el dron sube por detrás del edificio de largada */
    intro(k) {
      grp.visible = true;
      B.x = W.start.x + Math.sin(k * 3) * 2; B.y = W.start.y - 14 + k * 26; B.z = W.start.z + 22;
      grp.position.set(B.x, B.y, B.z); grp.rotation.set(0, Math.PI, 0);
      rotors.rotation.y += 0.6;
      eyeMat.color.setRGB(1, 0.2 + 0.5 * Math.abs(Math.sin(k * 12)), 0.25);
    },
    /** escape: el dron se sobrecarga y cae */
    crash(dt) {
      B.fallT += dt;
      B.y -= dt * (2 + B.fallT * 9); B.z += dt * 4; grp.rotation.z += dt * 2.5; grp.rotation.x += dt * 1.2;
      grp.position.set(B.x, B.y, B.z);
      if (Math.random() < dt * 20) ctx.fx.burst(B.x + (Math.random() - 0.5) * 4, B.y, B.z, Math.random() < 0.5 ? 0xffb02e : 0x555555, 4, 4);
      eyeMat.color.setHex(Math.sin(B.fallT * 30) > 0 ? 0xffffff : 0x331111);
      line.visible = wall.visible = ray.visible = false;
      for (const m of mines) { m.on = false; m.ring.visible = m.fill.visible = false; }
    },
    update(dt, P) {
      rotors.rotation.y += dt * 25;
      if (!B.active || !P) return;
      const p = P.body.pos, d = ctx.diff();
      const chase = B.phase === 1 || B.phase === 3;
      // posición objetivo
      let tz, ty, tx;
      if (chase) {
        const sp = d.bossChase * (B.phase === 3 ? 1.15 : 1);
        B.bz -= sp * dt;
        if (B.bz > p.z + 34) B.bz = p.z + 34; // nunca queda demasiado lejos: la tensión se mantiene
        tz = B.bz + 1.5; tx = p.x * 0.7 + B.x * 0.3; ty = p.y + 8.5;
      } else { B.bz = Math.max(B.bz, p.z + 26); tz = p.z - 20; tx = p.x; ty = p.y + 10; }
      const k = Math.min(1, dt * (chase ? 3 : 1.6));
      B.x += (tx - B.x) * k; B.y += (ty + Math.sin(W.time * 1.3) * 0.6 - B.y) * k; B.z += (tz - B.z) * k;
      grp.position.set(B.x, B.y, B.z);
      grp.rotation.y = Math.atan2(p.x - B.x, p.z - B.z);
      grp.rotation.z = Math.sin(W.time * 0.9) * 0.05;
      // atrapado
      if (chase && P.alive && B.bz - p.z < 1.2) { ctx.bossCapture(); return; }
      // ---- barrido láser telegrafiado ----
      const warn = d.turretWarn * 0.95;
      if (chase || B.phase === 3) {
        B.atkT -= dt;
        if (!B.sweep.on && B.atkT <= 0 && P.alive) {
          const ahead = Math.max(3.5, Math.min(9, -P.body.vel.z * 0.8));
          const lz = p.z - ahead;
          let gy = groundBelow(W.grid.near(lz), p.x, lz, p.y + 1.5);
          if (!isFinite(gy)) gy = p.y;
          B.sweep.on = true; B.sweep.t = 0; B.sweep.z = lz; B.sweep.gy = gy; B.sweep.fire = 0; B.sweeps++;
          ctx.sfx.bossCharge();
        }
        if (B.sweep.on) {
          const s = B.sweep; s.t += dt;
          line.visible = true; line.position.set(p.x * 0.5, s.gy + 0.05, s.z); line.scale.set(44, 0.06, 0.5 + Math.min(1, s.t / warn) * 0.5);
          warnMat.opacity = 0.35 + 0.35 * Math.abs(Math.sin(s.t * (8 + s.t * 10)));
          // rayo del dron a la línea mientras carga
          _v.set(p.x * 0.5 - B.x, s.gy - (B.y - 1.4), s.z - B.z); const L = _v.length(); _v.multiplyScalar(1 / L);
          ray.visible = true; ray.position.set(B.x + _v.x * L / 2, B.y - 1.4 + _v.y * L / 2, B.z + _v.z * L / 2); _q.setFromUnitVectors(_u, _v); ray.quaternion.copy(_q); ray.scale.set(0.12, L, 0.12);
          if (s.t >= warn) {
            if (s.fire === 0) { ctx.sfx.bossFire(); ctx.fx.shake(0.25); }
            s.fire += dt;
            wall.visible = true; wall.position.set(p.x * 0.5, s.gy + 0.65, s.z); wall.scale.set(44, 1.3, 0.4);
            if (P.alive && P.inv <= 0 && Math.abs(p.z - s.z) < 0.75 && p.y < s.gy + 0.95 && p.y > s.gy - 1.5) { B.sweepHits++; ctx.bossHit('sweep', 0, 1); B.bz -= 6; }
            if (s.fire > 0.35) { s.on = false; line.visible = wall.visible = ray.visible = false; B.atkT = (B.phase === 3 ? 2.3 : 3.4) * (0.6 + d.turretWarn * 0.4); }
          }
        }
      }
      // ---- minas de pulso ----
      if (B.phase === 2 || B.phase === 3) {
        B.mineT -= dt;
        if (B.mineT <= 0 && P.alive) {
          B.mineT = (B.phase === 2 ? 1.25 : 3.2) * (0.7 + d.turretWarn * 0.3);
          const n = B.phase === 2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const m = mines.find(q => !q.on); if (!m) break;
            const lead = 0.9 + i * 0.5;
            const mx = p.x + P.body.vel.x * lead + (i ? (Math.random() - 0.5) * 4 : 0), mz = p.z + Math.min(-2.5, P.body.vel.z * lead) - i * 3;
            let gy = groundBelow(W.grid.near(mz), mx, mz, p.y + 2);
            if (!isFinite(gy) || gy < p.y - 4) continue; // no sembrar sobre el vacío
            m.on = true; m.t = 0; m.x = mx; m.y = gy; m.z = mz; B.minesDropped++;
            m.ring.position.set(mx, gy + 0.06, mz); m.ring.scale.setScalar(MINE_R); m.ring.visible = true;
            m.fill.position.set(mx, gy + 0.05, mz); m.fill.visible = true;
            ctx.sfx.mineDrop();
          }
        }
      }
      const fuse = 1.15 + d.turretWarn * 0.25;
      for (const m of mines) {
        if (!m.on) continue;
        m.t += dt;
        m.fill.scale.setScalar(Math.max(0.01, MINE_R * Math.min(1, m.t / fuse)));
        if (m.t >= fuse) {
          m.on = false; m.ring.visible = m.fill.visible = false;
          ctx.fx.burst(m.x, m.y + 0.4, m.z, 0xff4a2a, 18, 5); ctx.fx.ring(m.x, m.y + 0.1, m.z, 0xff4a2a, MINE_R + 0.6, 0.35); ctx.sfx.mineBoom();
          const dx = p.x - m.x, dz = p.z - m.z, dist = Math.hypot(dx, dz);
          if (P.alive && P.inv <= 0 && dist < MINE_R && p.y < m.y + 1.4 && p.y > m.y - 1) { B.mineHits++; ctx.bossHit('mine', dx / (dist || 1), dz / (dist || 1)); }
        }
      }
    },
    dispose() { eyeMat.dispose(); beamMat.dispose(); warnMat.dispose(); box.dispose(); ringG.dispose(); discG.dispose(); /** @type {any} */ (rotors.material).dispose(); },
  };
  grp.visible = false;
  return B;
}
