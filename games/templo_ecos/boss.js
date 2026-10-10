// @ts-check
/* Templo de los Ecos — Guardián Eco (jefe en 3 fases).
   F1 «Eco reflejado»: telegrafía una línea y dispara rayos de eco; se devuelven con el Eco a tiempo.
   F2 «Resonadores»: escudo de 3 fragmentos; se rompe guiando la luz de los resonadores (placa + espejo).
      Ataca con ondas de choque (saltarlas), arañas y el «drenaje» que intenta absorber la reliquia.
   F3 «Corazón»: el Corazón baja; rayos más rápidos (y dobles en Difícil/Extremo). Al caer, se desactiva el Corazón. */
import * as THREE from 'three';
import { makeGuardian } from './models.js';
import { colBox, losBlocked } from './physics.js';
import { createSpider } from './enemies.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** Coloca una caja fina entre dos puntos. @param {THREE.Object3D} m */
export function setLine(m, ax, ay, az, bx, by, bz, th = 0.08) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.scale.set(th, th, Math.max(0.001, len));
  m.lookAt(_b);
}

/** @param {import('./level.js').Level} L @param {any} refs */
export function createBoss(L, refs) {
  const ctx = L.ctx, mats = ctx.mats;
  const G = makeGuardian(mats);
  G.group.position.set(0, -7, 0);
  L.group.add(G.group);
  const col = colBox(0, -1, 0, 4.2, 9, 4.2, 'wall'); col.vt = -1; L.cols.push(col);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const tele = new THREE.Mesh(unit, mats.tele); tele.visible = false; L.group.add(tele);
  const drainM = new THREE.Mesh(unit, mats.drain); drainM.visible = false; L.group.add(drainM);
  // rayos (orbes)
  const orbGeo = new THREE.IcosahedronGeometry(0.38, 1), haloGeo = new THREE.IcosahedronGeometry(0.75, 1);
  const orbs = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(orbGeo, mats.orb); const h = new THREE.Mesh(haloGeo, mats.beamGlow); m.add(h);
    m.visible = false; L.group.add(m);
    orbs.push({ m, on: false, back: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  // ondas de choque
  const ringGeo = new THREE.RingGeometry(0.93, 1, 72);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x7ffff0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(ringGeo, mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.15; m.visible = false; L.group.add(m);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.55, 48, 1, true), mat); wall.position.y = 0.28; wall.visible = false; L.group.add(wall);
    rings.push({ m, wall, on: false, r: 0, hit: false });
  }
  // arañas invocadas (pool)
  const spawnPts = [[-8, 9], [8, 9], [-11, -5], [11, -5]];
  const spiders = spawnPts.map(([x, z]) => { const s = createSpider(L, { x, z, wake: 99, awake: true }); s.die(false); s.dead = true; return s; });
  L.enemies.push(...spiders);

  const B = {
    phase: 0, sub: 'idle', t: 0, hp: 0, maxHp: 0, shards: 3, p3: 0, p3Max: 0,
    shardHit: /** @type {Record<string, number>} */ ({ E: 0, W: 0, N: 0 }), resDone: /** @type {Record<string, boolean>} */ ({ E: false, W: false, N: false }),
    next: 2, aimT: 0, lockX: 0, lockZ: 0, ringT: 4, spiderT: 8, drainT: 7, drain: 'idle', drainP: 0, drainAcc: 0, drainLife: 0,
    integrity: 3, stagger: 0, dead: false, heartY: 12, guardY: -7, introT: 0, reflects: 0,
    G, col, orbs, rings, spiders,
    get active() { return B.phase >= 1 && B.phase <= 3; },
    get orbCount() { return orbs.filter(o => o.on).length; },
    /** Prepara el inicio de una fase (también al reintentar tras perder). @param {number} ph */
    startPhase(ph) {
      const d = ctx.diff();
      B.phase = ph; B.sub = 'idle'; B.t = 0; B.next = 2.2; B.aimT = 0; B.stagger = 0;
      B.ringT = 3.5; B.spiderT = 6; B.drainT = 6; B.drain = 'idle'; B.drainP = 0; B.drainAcc = 0; B.integrity = 3;
      tele.visible = false; drainM.visible = false;
      for (const o of orbs) { o.on = false; o.m.visible = false; }
      for (const r of rings) { r.on = false; r.m.visible = r.wall.visible = false; }
      for (const s of spiders) { s.dead = true; s.obj.visible = false; s.t = 0; }
      if (ph === 1) { B.maxHp = B.hp = d.p1Hits; }
      if (ph === 2) { B.shards = 3; for (const k in B.shardHit) { B.shardHit[k] = 0; B.resDone[k] = false; } refs.resetResonators(); }
      if (ph === 3) { B.p3Max = B.p3 = d.p3Hits; }
      G.shards.forEach(s => { s.visible = ph === 2; });
      G.eyeMat.color.setHex(ph === 3 ? 0xff4d3d : 0x7ffff0);
      G.coreMat.color.setHex(ph === 3 ? 0xff4d3d : 0x7ffff0);
    },
    ui() {
      if (B.phase === 1) return { phase: 1, label: 'FASE 1 · Devolvé los rayos', frac: B.hp / B.maxHp };
      if (B.phase === 2) return { phase: 2, label: 'FASE 2 · Resonadores ' + (3 - B.shards) + '/3', frac: B.shards / 3 };
      if (B.phase === 3) return { phase: 3, label: 'FASE 3 · Corazón expuesto', frac: B.p3 / B.p3Max };
      return null;
    },
    damage() {
      ctx.sfx.bossHit(); ctx.fx.burst(0, 4, 0.8, 0x7ffff0, 30, 6); ctx.fx.shake(0.5); B.stagger = 0.8;
      ctx.emit('reflect'); ctx.addScore(200);
      if (B.phase === 1) { B.hp--; if (B.hp <= 0) B.transition(2); }
      else if (B.phase === 3) { B.p3--; if (B.p3 <= 0) B.defeat(); }
    },
    /** @param {number} to */
    transition(to) {
      B.sub = 'trans'; B.t = 2.6; B.toPhase = to;
      tele.visible = false; drainM.visible = false; B.drain = 'idle';
      for (const o of orbs) { o.on = false; o.m.visible = false; }
      ctx.sfx.roar(); ctx.fx.shake(0.8); ctx.addScore(1000);
      ctx.emit('bossPhase', to);
      ctx.onBossPhase(to);
    },
    toPhase: 0,
    defeat() {
      B.sub = 'dying'; B.t = 3; B.phase = 4; B.dead = true;
      tele.visible = drainM.visible = false;
      for (const o of orbs) { o.on = false; o.m.visible = false; }
      for (const r of rings) { r.on = false; r.m.visible = r.wall.visible = false; }
      for (const s of spiders) if (!s.dead) s.die(false);
      ctx.sfx.roar(); ctx.fx.shake(1); ctx.addScore(1000);
      ctx.onBossDefeated();
    },
    /** Reflejo con el Eco: devuelve los rayos cercanos y corta el drenaje. */
    onPulse(px, pz) {
      if (!B.active) return;
      const R = ctx.diff().parry * 13 + 0.6;
      for (const o of orbs) {
        if (!o.on || o.back) continue;
        if (Math.hypot(o.x - px, o.z - pz) < R && o.y < 4) {
          o.back = true; ctx.sfx.reflect(); ctx.fx.burst(o.x, o.y, o.z, 0x7ffff0, 14, 4); B.reflects++;
        }
      }
      if (B.drain === 'grow' || B.drain === 'attached') { B.drain = 'idle'; drainM.visible = false; B.drainT = 8; ctx.toast('¡Cortaste el drenaje!', 1200); ctx.emit('drainBreak'); }
    },
    /** Luz de un resonador sobre el guardián (F2). @param {number} dt @param {string} src */
    beamHit(dt, src) {
      if (B.phase !== 2 || B.sub === 'trans') return;
      const k = src.replace('em', '');
      if (B.resDone[k]) return;
      B.shardHit[k] += dt;
      if (Math.random() < 0.3) ctx.fx.burst(0, 3.4, 1.4, 0xffe08a, 2, 2);
      if (B.shardHit[k] > 1.2) {
        B.resDone[k] = true; B.shards--; refs.resonatorDone(k);
        const s = G.shards[B.shards]; if (s) s.visible = false;
        ctx.sfx.shatter(); ctx.fx.burst(0, 4, 0, 0x9ff7ff, 36, 7); ctx.fx.shake(0.4); ctx.emit('shard'); ctx.addScore(300);
        if (B.shards <= 0) B.transition(3);
      }
    },
    /** @param {number} dt */
    intro(dt) { B.introT += dt; B.guardY = Math.min(0, -7 + B.introT * 2.6); },
    /** @param {number} dt @param {any} P */
    update(dt, P) {
      const t = L.time, d = ctx.diff(), pp = P.body.pos;
      // animación base
      const hover = Math.sin(t * 1.4) * 0.25;
      if (B.sub === 'dying') { B.guardY -= dt * 3; }
      G.group.position.y = B.guardY + (B.phase >= 1 && B.phase <= 3 ? hover : 0);
      if (B.active && B.sub !== 'dying') { const want = Math.atan2(pp.x, pp.z); G.group.rotation.y += Math.atan2(Math.sin(want - G.group.rotation.y), Math.cos(want - G.group.rotation.y)) * Math.min(1, dt * 3); }
      G.halo.rotation.z += dt * 0.6;
      G.handL.position.y = 3 + Math.sin(t * 2) * 0.3 + (B.sub === 'slam' ? (B.t > 0.4 ? 2 : -1.5) : 0);
      G.handR.position.y = 3 + Math.cos(t * 2) * 0.3 + (B.sub === 'slam' ? (B.t > 0.4 ? 2 : -1.5) : 0);
      G.body.rotation.x = B.stagger > 0 ? -0.18 * B.stagger : 0;
      G.shards.forEach((s, i) => { const a = t * 1.8 + i * 2.094; s.position.set(Math.cos(a) * 3.2, 3.6 + Math.sin(t * 3 + i) * 0.3, Math.sin(a) * 3.2); s.rotation.y += dt * 3; });
      B.stagger = Math.max(0, B.stagger - dt);
      // corazón
      const heartGoal = B.phase === 3 ? 8 : B.phase === 4 ? 1.9 : 12;
      B.heartY += (heartGoal - B.heartY) * Math.min(1, dt * (B.phase === 4 ? 0.8 : 1.2));
      refs.heart.group.position.y = B.heartY; refs.heart.core.rotation.y += dt; refs.heart.cage.rotation.x += dt * 0.7; refs.heart.cage2.rotation.z += dt * 0.5;
      if (B.sub === 'dying') { B.t -= dt; if (B.t <= 0) { B.sub = 'gone'; G.group.visible = false; col.on = false; } return; }
      if (!B.active) return;
      if (B.sub === 'trans') { B.t -= dt; if (B.t <= 0) B.startPhase(B.toPhase); return; }

      // orbes
      for (const o of orbs) {
        if (!o.on) continue;
        o.life -= dt;
        if (o.back) {
          const tx = 0 - o.x, ty = 4 - o.y, tz = 0 - o.z, l = Math.hypot(tx, ty, tz) || 1;
          o.vx = tx / l * 19; o.vy = ty / l * 19; o.vz = tz / l * 19;
          if (l < 1.8) { o.on = false; o.m.visible = false; B.damage(); continue; }
        }
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        if (o.y < 1.1 && !o.back) { o.y = 1.1; o.vy = 0; }
        o.m.position.set(o.x, o.y, o.z);
        if (!o.back && P.alive && P.vulnerable && Math.hypot(o.x - pp.x, o.y - (pp.y + 1), o.z - pp.z) < 0.85) {
          o.on = false; o.m.visible = false; ctx.hurt(1, o.x, o.z, 'orb', 6); ctx.fx.burst(o.x, o.y, o.z, 0xfff1b0, 12, 3); continue;
        }
        if (o.life <= 0 || Math.hypot(o.x, o.z) > 15 || losBlocked(L.cols, o.x - o.vx * dt, o.z - o.vz * dt, o.x, o.z, o.y)) {
          if (!o.back) { o.on = false; o.m.visible = false; ctx.fx.burst(o.x, o.y, o.z, 0xfff1b0, 8, 2); }
        }
      }
      // ataque de rayos (F1 y F3)
      if (B.phase === 1 || B.phase === 3) {
        const interval = B.phase === 3 ? d.orbInterval * 0.75 : d.orbInterval;
        if (B.sub === 'idle') { B.next -= dt; if (B.next <= 0) { B.sub = 'aim'; B.aimT = d.telegraph; ctx.sfx.charge(); } }
        if (B.sub === 'aim') {
          B.aimT -= dt;
          if (B.aimT > 0.3) { B.lockX = pp.x; B.lockZ = pp.z; }
          const ex = Math.sin(G.group.rotation.y) * 1.2, ez = Math.cos(G.group.rotation.y) * 1.2;
          tele.visible = true; setLine(tele, ex, G.group.position.y + 5.3, ez, B.lockX, 1.1, B.lockZ, B.aimT > 0.3 ? 0.06 : 0.16);
          if (B.aimT <= 0) {
            tele.visible = false; B.sub = 'idle'; B.next = interval;
            B.fire(ex, G.group.position.y + 5.2, ez, B.lockX, B.lockZ);
            if (d.doubleOrb && B.phase === 3) { const a = Math.atan2(B.lockX, B.lockZ) + 0.35, r = Math.hypot(B.lockX, B.lockZ); B.fire(ex, G.group.position.y + 5.2, ez, Math.sin(a) * r, Math.cos(a) * r); }
          }
        }
      }
      // ondas de choque (F2 y F3)
      if (B.phase >= 2) {
        B.ringT -= dt;
        if (B.ringT <= 0 && B.sub === 'idle') { B.sub = 'slam'; B.t = 0.8; ctx.sfx.charge(); }
        if (B.sub === 'slam') {
          B.t -= dt;
          if (B.t <= 0) {
            B.sub = 'idle'; B.ringT = B.phase === 2 ? 5 / d.enemySpeed : 7 / d.enemySpeed; B.next = Math.max(B.next, 1.2);
            const r = rings.find(x => !x.on); if (r) { r.on = true; r.r = 2.4; r.hit = false; r.m.visible = r.wall.visible = true; }
            ctx.sfx.slam(); ctx.fx.shake(0.45);
          }
        }
      }
      for (const r of rings) {
        if (!r.on) continue;
        r.r += dt * 7 * d.enemySpeed;
        r.m.scale.set(r.r, r.r, 1); r.wall.scale.set(r.r, 1, r.r);
        /** @type {any} */ (r.m.material).opacity = Math.max(0, 0.85 - r.r / 20);
        const pd = Math.hypot(pp.x, pp.z);
        if (!r.hit && P.alive && P.vulnerable && Math.abs(pd - r.r) < 0.5 && pp.y < 0.55) { r.hit = true; ctx.hurt(1, 0, 0, 'ring', 7); }
        if (r.r > 16) { r.on = false; r.m.visible = r.wall.visible = false; }
      }
      // arañas (F2)
      if (B.phase === 2) {
        B.spiderT -= dt;
        const alive = spiders.filter(s => !s.dead).length, max = d.enemySpeed >= 1.2 ? 3 : 2;
        if (B.spiderT <= 0) {
          B.spiderT = 11;
          if (alive < max) { const s = spiders.find(x => x.dead); if (s) { s.reset(); s.state = 'hunt'; ctx.fx.burst(s.b.pos.x, 0.5, s.b.pos.z, 0x5a4a5a, 14, 3); ctx.sfx.skitter(); } }
        }
      }
      // drenaje de la reliquia (F2 y F3)
      if (B.phase >= 2) {
        const hx = G.handR.position.x, hy = G.group.position.y + 3;
        if (B.drain === 'idle') { B.drainT -= dt; if (B.drainT <= 0 && P.alive) { B.drain = 'charge'; B.drainP = 1.0; ctx.sfx.drainCharge(); } }
        else if (B.drain === 'charge') {
          B.drainP -= dt; G.coreMat.color.setHex(0xc27dff);
          if (B.drainP <= 0) { B.drain = 'grow'; B.drainP = 0; }
        } else if (B.drain === 'grow' || B.drain === 'attached') {
          const blocked = losBlocked(L.cols, hx * 0.3, 0, pp.x, pp.z, 1.3, 'floor') && Math.hypot(pp.x, pp.z) > 2.6;
          const far = Math.hypot(pp.x, pp.z) > 18;
          if (blocked || far || !P.alive) {
            B.drain = 'idle'; B.drainT = 7; drainM.visible = false; G.coreMat.color.setHex(B.phase === 3 ? 0xff4d3d : 0x7ffff0);
            if (blocked) { ctx.toast('¡Te cubriste del drenaje!', 1200); ctx.emit('drainBreak'); }
          } else {
            if (B.drain === 'grow') { B.drainP = Math.min(1, B.drainP + dt / 0.9); if (B.drainP >= 1) { B.drain = 'attached'; B.drainAcc = 0; B.drainLife = d.drainTime * 3 + 0.6; ctx.sfx.drainHit(); } }
            const k = B.drainP, tx = hx + (pp.x - hx) * k, ty = hy + (pp.y + 1.1 - hy) * k, tz = 0.6 + (pp.z - 0.6) * k;
            drainM.visible = true; setLine(drainM, hx, hy, 0.6, tx, ty, tz, B.drain === 'attached' ? 0.14 : 0.07);
            if (B.drain === 'attached') {
              B.drainAcc += dt; B.drainLife -= dt;
              if (B.drainAcc >= d.drainTime) { B.drainAcc = 0; B.integrity--; ctx.sfx.crack(); ctx.onRelicDrain(B.integrity); ctx.emit('relicCrack'); if (B.integrity <= 0) { drainM.visible = false; B.drain = 'idle'; return; } }
              if (B.drainLife <= 0) { B.drain = 'idle'; B.drainT = 8; drainM.visible = false; G.coreMat.color.setHex(B.phase === 3 ? 0xff4d3d : 0x7ffff0); }
            }
          }
        }
      }
    },
    fire(sx, sy, sz, tx, tz) {
      const o = orbs.find(x => !x.on); if (!o) return;
      const dx = tx - sx, dy = 1.1 - sy, dz = tz - sz, l = Math.hypot(dx, dy, dz) || 1, sp = 13;
      Object.assign(o, { on: true, back: false, x: sx, y: sy, z: sz, vx: dx / l * sp, vy: dy / l * sp, vz: dz / l * sp, life: 4 });
      o.m.visible = true; o.m.position.set(sx, sy, sz);
      ctx.sfx.fire();
    },
  };
  return B;
}
