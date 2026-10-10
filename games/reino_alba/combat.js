// @ts-check
/* Reino del Alba — enemigos (sombras, gólem), jefes con fases (Guardián del bosque, Carcelero) y avisos en el piso.
   Todo ataque se anuncia con un telegrafiado (círculo, cono, línea o anillo) cuya duración depende de la dificultad. */
import * as THREE from 'three';
import { makeQuad, animateQuad, makeGolem, makeGuardian, makeHumanoid, animateRig } from './models.js';
import { moveCircle, losBlocked } from './physics.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** @param {any} G */
export function createCombat(G) {
  const root = new THREE.Group(); root.name = 'combat'; G.scene.add(root);
  /* ---------- telegrafiados ---------- */
  const TG = {
    circle: new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
    ring: new THREE.RingGeometry(0.86, 1, 36).rotateX(-Math.PI / 2),
    cone: new THREE.CircleGeometry(1, 20, -Math.PI / 3, (2 * Math.PI) / 3).rotateX(-Math.PI / 2),
    rect: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(-Math.PI / 2),
  };
  /** @type {any[]} */ const teles = [];
  function tele(shape, x, z, ry, sx, sz, dur) {
    let t = teles.find(o => !o.on && o.shape === shape);
    if (!t) { const m = new THREE.Mesh(TG[shape], G.mats.tele.clone()); m.renderOrder = 2; root.add(m); t = { mesh: m, shape, on: false }; teles.push(t); }
    t.on = true; t.t = 0; t.dur = dur; t.mesh.visible = true;
    t.mesh.position.set(x, 0.04, z); t.mesh.rotation.y = ry; t.mesh.scale.set(sx, 1, sz);
    return t;
  }
  function updateTeles(dt) {
    for (const t of teles) {
      if (!t.on) continue;
      t.t += dt; const k = Math.min(1, t.t / t.dur);
      t.mesh.material.opacity = 0.25 + k * 0.5; t.mesh.material.color.setHex(k > 0.8 ? 0xffd04a : 0xff5a3d);
      if (t.t >= t.dur) { t.on = false; t.mesh.visible = false; }
    }
  }
  function clearTeles() { for (const t of teles) { t.on = false; t.mesh.visible = false; } }

  /* ---------- enemigos ---------- */
  /** @type {any[]} */ let enemies = [];
  /** @type {any} */ let boss = null;
  const pool = { sombra: /** @type {any[]} */ ([]), preso: /** @type {any[]} */ ([]) };
  let golemRig = null, guardRig = null, jailRig = null;

  function rigFor(kind) {
    if (kind === 'sombra' || kind === 'wisp' || kind === 'preso') {
      const key = kind === 'preso' ? 'preso' : 'sombra';
      const free = pool[key].find(r => !r.used);
      if (free) { free.used = true; free.root.visible = true; return free; }
      const r = kind === 'preso' ? makeQuad(G.mats, { color: 0x4a4a52, eyes: 0xff6a20, size: 1.0, ear: 0x3a3a42 }) : makeQuad(G.mats, { color: 0x2b1e3a, eyes: 0xff4af0, size: 1.0, ear: 0x1a1024, snout: 0x3a2a4a });
      r.used = true; pool[key].push(r); root.add(r.root); return r;
    }
    if (kind === 'golem') { if (!golemRig) { golemRig = makeGolem(G.mats); root.add(golemRig.root); } golemRig.root.visible = true; return golemRig; }
    if (kind === 'guardian') { if (!guardRig) { guardRig = makeGuardian(G.mats); root.add(guardRig.root); } guardRig.root.visible = true; return guardRig; }
    if (kind === 'carcelero') {
      if (!jailRig) { jailRig = makeHumanoid(G.mats, { shirt: 0x3a3238, pants: 0x2a2228, hat: 'mask', extra: ['belt', 'cape'], extraColor: 0x4a1a1a, weapon: 'bighammer', h: 1.0, w: 1.25 }); jailRig.root.scale.setScalar(1.6); root.add(jailRig.root); }
      jailRig.root.visible = true; return jailRig;
    }
    return null;
  }
  function release(e) { if (e.rig) { e.rig.root.visible = false; e.rig.used = false; } }

  const BASE = { sombra: { hp: 3, sp: 3.1, r: 0.45 }, wisp: { hp: 2, sp: 3.6, r: 0.4 }, preso: { hp: 3, sp: 3.0, r: 0.45 }, golem: { hp: 10, sp: 1.4, r: 1.0 }, guardian: { hp: 24, sp: 1.9, r: 1.1 }, carcelero: { hp: 28, sp: 1.7, r: 1.0 } };
  function spawn(kind, x, z, extra = {}) {
    const d = G.diff(), b = BASE[kind];
    const isBoss = kind === 'guardian' || kind === 'carcelero';
    const hp = Math.ceil(b.hp * (isBoss ? d.bossHp : d.enemyHp));
    const e = { kind, x, z, ry: Math.PI, hp, maxHp: hp, r: b.r, sp: b.sp * d.enemySpeed, state: 'idle', t: 0, home: [x, z], rig: rigFor(kind), flash: 0, dead: false, deadT: 0,
      cd: 1 + Math.random(), lunge: 0, lx: 0, lz: 0, hitDone: false, kx: 0, kz: 0, kt: 0, wander: [x, z], wanderT: 0, phase: 1, shield: false, attack: '', tel: null, minion: false, ...extra };
    if (e.rig) { e.rig.root.position.set(x, 0, z); e.rig.root.scale.setScalar(kind === 'carcelero' ? 1.6 : kind === 'wisp' ? 0.7 : 1); }
    enemies.push(e);
    if (isBoss) boss = e;
    return e;
  }
  function clear() {
    for (const e of enemies) release(e);
    for (const r of [golemRig, guardRig, jailRig]) if (r) r.root.visible = false;
    enemies = []; boss = null; clearTeles();
  }
  /** carga los enemigos de la escena */
  function loadScene(scn) {
    clear();
    for (const s of scn.enemySpawns) spawn(s.kind, s.x, s.z);
  }

  /* ---------- daño ---------- */
  function damage(e, n, fromX, fromZ) {
    if (e.dead) return false;
    if (e.shield || e.state === 'roar') { G.sfx.clank(); G.fx.burst(e.x, 1.4, e.z, 0x9af0ff, 6, 2); return false; }
    e.hp -= n; e.flash = 0.15;
    const dx = e.x - fromX, dz = e.z - fromZ, l = Math.hypot(dx, dz) || 1;
    const kb = e.kind === 'sombra' || e.kind === 'wisp' || e.kind === 'preso' ? 5 : 1.2;
    e.kx = dx / l * kb; e.kz = dz / l * kb; e.kt = 0.18;
    if (e.state === 'windup' && (e.kind === 'sombra' || e.kind === 'wisp' || e.kind === 'preso')) { e.state = 'recover'; e.t = 0.5; if (e.tel) { e.tel.on = false; e.tel.mesh.visible = false; } }
    G.fx.burst(e.x, 1.0, e.z, e.kind === 'guardian' ? 0xff6af0 : 0xd0a0ff, 8, 3);
    G.sfx.hit();
    if (e.hp <= 0) kill(e);
    else if (e === boss) checkPhase(e);
    else if (e.kind === 'golem' && e.phase === 1 && e.hp <= e.maxHp / 2) { e.phase = 2; G.toast('¡El gólem se enfurece! Alejate de sus ondas', 2200); }
    return true;
  }
  function kill(e) {
    e.dead = true; e.deadT = 0.8; e.state = 'dead'; if (e.tel) { e.tel.on = false; e.tel.mesh.visible = false; }
    G.fx.burst(e.x, 1, e.z, 0x6a3a8a, 18, 4); G.sfx.kill();
    if (e === boss) { G.onBossDefeated(e.kind); clearTeles(); for (const m of enemies) if (m.minion && !m.dead) kill(m); }
    else G.onEnemyKilled(e.kind, e);
  }
  function checkPhase(e) {
    const f = e.hp / e.maxHp;
    if (e.kind === 'guardian') {
      if (e.phase === 1 && f <= 0.6) startPhase(e, 2);
      else if (e.phase === 2 && f <= 0.25) startPhase(e, 3);
    } else if (e.kind === 'carcelero') {
      if (e.phase === 1 && f <= 0.5) startPhase(e, 2);
    }
  }
  function startPhase(e, ph) {
    e.phase = ph; e.state = 'roar'; e.t = 1.2; clearTeles(); e.attack = '';
    G.onBossPhase(e.kind, ph);
    G.sfx.roar();
    if (e.kind === 'guardian' && ph === 2) { e.shield = true; summonWisps(e); }
    if (e.kind === 'guardian' && ph === 3) { e.shield = false; e.sp *= 1.35; }
    if (e.kind === 'carcelero' && ph === 2) { e.sp *= 1.2; const sc = G.scn(); for (const [ox, oz] of [[-5, 1], [5, 1]]) spawn('preso', sc.bossSpot.x + ox, sc.bossSpot.z + oz, { minion: true }); }
  }
  function summonWisps(e) {
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; spawn('wisp', e.x + Math.cos(a) * 3, e.z + Math.sin(a) * 3, { minion: true }); }
  }

  /** ataque del jugador: arco frente a él */
  function playerAttack(px, pz, face, reach = 2.1) {
    let hits = 0;
    const fx = Math.sin(face), fz = Math.cos(face);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz);
      if (d > reach + e.r) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < 0.25) continue;
      if (damage(e, 1, px, pz)) hits++;
    }
    return hits;
  }

  /* ---------- IA ---------- */
  const tmp = { x: 0, z: 0 };
  function update(dt, p, frozen) {
    updateTeles(dt);
    const scn = G.scn(), d = G.diff();
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { e.deadT -= dt; if (e.rig) { e.rig.root.position.y = -(0.8 - e.deadT) * 1.2; } if (e.deadT <= 0) { release(e); if (e.kind === 'golem' || e === boss) { if (e.rig) e.rig.root.visible = false; } enemies.splice(i, 1); } continue; }
      if (frozen) { present(e, 0); continue; }
      e.flash -= dt;
      if (e.kt > 0) { e.kt -= dt; tmp.x = e.x; tmp.z = e.z; moveCircle(scn.cols, tmp, e.r, e.kx * dt, e.kz * dt); e.x = tmp.x; e.z = tmp.z; }
      const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz);
      let moveSp = 0;
      if (e.kind === 'sombra' || e.kind === 'wisp' || e.kind === 'preso') moveSp = smallAI(e, dt, p, dx, dz, dist, d, scn);
      else if (e.kind === 'golem') moveSp = golemAI(e, dt, p, dx, dz, dist, d, scn);
      else if (e.kind === 'guardian') moveSp = guardianAI(e, dt, p, dx, dz, dist, d, scn);
      else if (e.kind === 'carcelero') moveSp = jailerAI(e, dt, p, dx, dz, dist, d, scn);
      present(e, moveSp, dt);
    }
    if (boss && boss.kind === 'guardian' && boss.phase === 2 && boss.shield && !enemies.some(m => m.kind === 'wisp' && !m.dead)) {
      boss.shield = false; boss.vulnT = 7; G.toast('¡El escudo del Guardián se rompió! Atacá ahora', 2200); G.sfx.solve();
    }
    if (boss && boss.vulnT !== undefined && boss.phase === 2 && !boss.shield) { boss.vulnT -= dt; if (boss.vulnT <= 0 && boss.hp > 0) { boss.shield = true; summonWisps(boss); G.toast('El Guardián vuelve a protegerse', 1800); } }
  }
  function stepToward(e, tx, tz, sp, dt, scn) {
    const dx = tx - e.x, dz = tz - e.z, l = Math.hypot(dx, dz);
    if (l < 0.05) return 0;
    tmp.x = e.x; tmp.z = e.z;
    moveCircle(scn.cols, tmp, e.r, dx / l * sp * dt, dz / l * sp * dt);
    e.x = tmp.x; e.z = tmp.z; e.ry = Math.atan2(dx, dz);
    return sp;
  }
  function smallAI(e, dt, p, dx, dz, dist, d, scn) {
    e.t -= dt; e.cd -= dt;
    const sees = p.alive && dist < d.aggro && !losBlocked(scn.cols, e.x, e.z, p.x, p.z, 1.5);
    if (e.state === 'idle' || e.state === 'wander') {
      if (sees || e.minion) { e.state = 'chase'; return 0; }
      e.wanderT -= dt;
      if (e.wanderT <= 0) { e.wanderT = 2 + Math.random() * 3; e.wander = [e.home[0] + (Math.random() - 0.5) * 6, e.home[1] + (Math.random() - 0.5) * 6]; }
      return stepToward(e, e.wander[0], e.wander[1], e.sp * 0.35, dt, scn);
    }
    if (e.state === 'chase') {
      if (!p.alive || (!e.minion && dist > d.aggro * 1.6)) { e.state = 'idle'; return 0; }
      if (dist < 1.9 && e.cd <= 0) {
        e.state = 'windup'; e.t = 0.6 * d.telegraph; e.ry = Math.atan2(dx, dz); e.lx = dx / (dist || 1); e.lz = dz / (dist || 1);
        e.tel = tele('rect', e.x, e.z, e.ry + Math.PI, 1.0, 2.6, e.t); G.sfx.growl(); return 0;
      }
      if (dist < 1.4) { e.ry = Math.atan2(dx, dz); return 0; }
      return stepToward(e, p.x, p.z, e.sp, dt, scn);
    }
    if (e.state === 'windup') { if (e.t <= 0) { e.state = 'lunge'; e.t = 0.28; e.hitDone = false; } return 0; }
    if (e.state === 'lunge') {
      tmp.x = e.x; tmp.z = e.z; moveCircle(scn.cols, tmp, e.r, e.lx * 9 * dt, e.lz * 9 * dt); e.x = tmp.x; e.z = tmp.z;
      if (!e.hitDone && Math.hypot(p.x - e.x, p.z - e.z) < 1.15) { e.hitDone = true; G.hurtPlayer(d.enemyDmg, e.x, e.z); }
      if (e.t <= 0) { e.state = 'recover'; e.t = 0.7; e.cd = 1.2 + Math.random() * 0.8; }
      return 6;
    }
    if (e.state === 'recover') { if (e.t <= 0) e.state = 'chase'; return 0; }
    return 0;
  }
  function golemAI(e, dt, p, dx, dz, dist, d, scn) {
    e.t -= dt; e.cd -= dt;
    if (e.state === 'idle') { if (p.alive && dist < 10) { e.state = 'chase'; G.onBossNear('golem'); } return 0; }
    if (e.state === 'chase') {
      if (!p.alive || dist > 18) { e.state = 'idle'; return 0; }
      if (e.cd <= 0 && dist < 3.2) {
        e.state = 'windup'; e.attack = 'slam'; e.t = 1.0 * d.telegraph; e.ry = Math.atan2(dx, dz);
        e.ax = e.x + Math.sin(e.ry) * 1.6; e.az = e.z + Math.cos(e.ry) * 1.6;
        e.tel = tele('circle', e.ax, e.az, 0, 2.4, 2.4, e.t); G.sfx.growl(); return 0;
      }
      if (e.cd <= 0 && e.phase === 2 && dist < 6) {
        e.state = 'windup'; e.attack = 'wave'; e.t = 1.1 * d.telegraph; e.tel = tele('ring', e.x, e.z, 0, 4.6, 4.6, e.t); return 0;
      }
      if (dist > 2.4) return stepToward(e, p.x, p.z, e.sp * (e.phase === 2 ? 1.3 : 1), dt, scn);
      e.ry = Math.atan2(dx, dz); return 0;
    }
    if (e.state === 'windup') {
      e.rig.armR.rotation.x = e.rig.armL.rotation.x = -2.2 * (1 - Math.max(0, e.t) / (1.0 * d.telegraph));
      if (e.t <= 0) {
        G.sfx.slam(); G.fx.shake(0.35);
        if (e.attack === 'slam') { G.fx.burst(e.ax, 0.4, e.az, 0x8a8090, 14, 3); if (Math.hypot(p.x - e.ax, p.z - e.az) < 2.4) G.hurtPlayer(d.enemyDmg + 1, e.ax, e.az); }
        else { G.fx.ring(e.x, e.z, 0x8af0ff, 4.6); const pd = Math.hypot(p.x - e.x, p.z - e.z); if (pd > 3.6 && pd < 4.8) G.hurtPlayer(d.enemyDmg, e.x, e.z); else if (pd <= 3.6) G.hurtPlayer(d.enemyDmg, e.x, e.z); }
        e.state = 'recover'; e.t = 1.0; e.cd = e.phase === 2 ? 1.4 : 2.0;
      }
      return 0;
    }
    if (e.state === 'recover') { e.rig.armR.rotation.x *= 0.9; e.rig.armL.rotation.x *= 0.9; if (e.t <= 0) e.state = 'chase'; return 0; }
    return 0;
  }
  function guardianAI(e, dt, p, dx, dz, dist, d, scn) {
    e.t -= dt; e.cd -= dt;
    if (e.state === 'roar') { e.rig.body.rotation.x = Math.sin(e.t * 20) * 0.05; if (e.t <= 0) { e.state = 'chase'; e.rig.body.rotation.x = 0; } return 0; }
    // raíces: en fases 2 y 3 brotan bajo el jugador
    if (e.phase >= 2) {
      e.spikeT = (e.spikeT ?? 2) - dt;
      if (e.spikeT <= 0 && p.alive) {
        e.spikeT = e.phase === 3 ? 1.7 : 2.7;
        const sx = p.x, sz = p.z, tt = 1.0 * d.telegraph;
        tele('circle', sx, sz, 0, 1.4, 1.4, tt);
        G.later(tt, () => { if (!boss || boss !== e || e.dead) return; G.fx.spikes(sx, sz); G.sfx.slam(); if (Math.hypot(G.player.x - sx, G.player.z - sz) < 1.4) G.hurtPlayer(d.enemyDmg, sx, sz + 0.1); });
      }
    }
    if (e.state === 'chase' || e.state === 'idle') {
      e.state = 'chase';
      if (e.cd <= 0 && p.alive) {
        e.ry = Math.atan2(dx, dz);
        if (dist < 3.6) { e.state = 'windup'; e.attack = 'sweep'; e.t = 0.9 * d.telegraph * (e.phase === 3 ? 0.8 : 1); e.tel = tele('cone', e.x, e.z, e.ry - Math.PI / 2, 3.6, 3.6, e.t); }
        else if (dist < 11) { e.state = 'windup'; e.attack = 'charge'; e.t = 1.0 * d.telegraph * (e.phase === 3 ? 0.8 : 1); e.lx = dx / dist; e.lz = dz / dist; e.tel = tele('rect', e.x, e.z, e.ry + Math.PI, 2.0, 10, e.t); }
        if (e.state === 'windup') { G.sfx.growl(); return 0; }
      }
      if (dist > 2.6) return stepToward(e, p.x, p.z, e.sp, dt, scn);
      return 0;
    }
    if (e.state === 'windup') {
      const k = 1 - Math.max(0, e.t) / 0.9;
      e.rig.armR.rotation.x = e.rig.armL.rotation.x = -k * 1.6;
      if (e.t <= 0) {
        if (e.attack === 'sweep') {
          G.sfx.swoosh(); G.fx.burst(e.x + Math.sin(e.ry) * 2, 1, e.z + Math.cos(e.ry) * 2, 0x6aa04a, 12, 3);
          const pd = Math.hypot(p.x - e.x, p.z - e.z), pa = Math.atan2(p.x - e.x, p.z - e.z);
          if (pd < 3.6 + 0.3 && Math.abs(angDiff(pa, e.ry)) < Math.PI / 3 + 0.1) G.hurtPlayer(d.enemyDmg, e.x, e.z);
          e.state = 'recover'; e.t = 0.8; e.cd = e.phase === 3 ? 0.9 : 1.6;
        } else { e.state = 'lunge'; e.t = 0.9; e.hitDone = false; }
      }
      return 0;
    }
    if (e.state === 'lunge') {
      tmp.x = e.x; tmp.z = e.z; const hit = moveCircle(scn.cols, tmp, e.r, e.lx * 11 * dt, e.lz * 11 * dt); e.x = tmp.x; e.z = tmp.z;
      if (!e.hitDone && Math.hypot(p.x - e.x, p.z - e.z) < 1.6) { e.hitDone = true; G.hurtPlayer(d.enemyDmg + 1, e.x, e.z); }
      if (e.t <= 0 || hit) { e.state = 'recover'; e.t = hit ? 1.4 : 0.9; e.cd = e.phase === 3 ? 1.0 : 1.8; if (hit) { G.fx.shake(0.3); G.sfx.slam(); } }
      return 11;
    }
    if (e.state === 'recover') { e.rig.armR.rotation.x *= 0.9; e.rig.armL.rotation.x *= 0.9; if (e.t <= 0) e.state = 'chase'; return 0; }
    return 0;
  }
  function jailerAI(e, dt, p, dx, dz, dist, d, scn) {
    e.t -= dt; e.cd -= dt;
    if (e.state === 'roar') { if (e.t <= 0) e.state = 'chase'; return 0; }
    // aliados reunidos: en la fase 2 golpean al Carcelero cada tanto
    if (e.phase === 2) {
      e.allyT = (e.allyT ?? 3) - dt;
      if (e.allyT <= 0) { e.allyT = 4.5; G.allyStrike(e); }
    }
    if (e.state === 'chase' || e.state === 'idle') {
      if (e.state === 'idle') { if (dist < 12) { e.state = 'chase'; } return 0; }
      if (e.cd <= 0 && p.alive) {
        e.ry = Math.atan2(dx, dz);
        if (e.phase === 2 && dist < 4 && Math.random() < 0.5) { e.state = 'windup'; e.attack = 'spin'; e.t = 1.1 * d.telegraph; e.tel = tele('circle', e.x, e.z, 0, 3.6, 3.6, e.t); }
        else if (dist < 3.4) { e.state = 'windup'; e.attack = 'slam'; e.t = 0.95 * d.telegraph; e.ax = e.x + Math.sin(e.ry) * 2; e.az = e.z + Math.cos(e.ry) * 2; e.tel = tele('circle', e.ax, e.az, 0, 2.3, 2.3, e.t); }
        else if (dist < 10) { e.state = 'windup'; e.attack = 'chain'; e.t = 0.9 * d.telegraph; e.lx = dx / dist; e.lz = dz / dist; e.tel = tele('rect', e.x, e.z, e.ry + Math.PI, 1.3, 9, e.t); }
        if (e.state === 'windup') { G.sfx.growl(); return 0; }
      }
      if (dist > 2.6) return stepToward(e, p.x, p.z, e.sp, dt, scn);
      return 0;
    }
    if (e.state === 'windup') {
      const R = e.rig; R.armR.rotation.x = -2.6 * (1 - Math.max(0, e.t)); if (e.attack === 'spin') R.root.rotation.y += dt * 4;
      if (e.t <= 0) {
        if (e.attack === 'slam') { G.sfx.slam(); G.fx.shake(0.4); G.fx.burst(e.ax, 0.4, e.az, 0x7a6a5a, 14, 3); if (Math.hypot(p.x - e.ax, p.z - e.az) < 2.3) G.hurtPlayer(d.enemyDmg + 1, e.ax, e.az); }
        else if (e.attack === 'spin') { G.sfx.swoosh(); G.fx.ring(e.x, e.z, 0xff8a3a, 3.6); if (Math.hypot(p.x - e.x, p.z - e.z) < 3.6) G.hurtPlayer(d.enemyDmg, e.x, e.z); }
        else {
          G.sfx.chain();
          // cadena: segmento de 9 m
          const px = p.x - e.x, pz = p.z - e.z, along = px * e.lx + pz * e.lz, perp = Math.abs(px * e.lz - pz * e.lx);
          G.fx.line(e.x, e.z, e.lx, e.lz, 9);
          if (along > 0 && along < 9 && perp < 0.75) G.hurtPlayer(d.enemyDmg, e.x, e.z);
        }
        e.state = 'recover'; e.t = 0.9; e.cd = e.phase === 2 ? 1.1 : 1.7; R.armR.rotation.x = 0;
      }
      return 0;
    }
    if (e.state === 'recover') { if (e.t <= 0) e.state = 'chase'; return 0; }
    return 0;
  }

  function present(e, sp, dt = 0) {
    const R = e.rig; if (!R) return;
    R.root.position.x = e.x; R.root.position.z = e.z; if (!e.dead) R.root.position.y = 0;
    let dd = e.ry - R.root.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    if (!(e.kind === 'carcelero' && e.attack === 'spin' && e.state === 'windup')) R.root.rotation.y += dd * Math.min(1, dt * 10);
    if (e.kind === 'sombra' || e.kind === 'wisp' || e.kind === 'preso') {
      animateQuad(R, dt, sp);
      R.body.rotation.x = e.state === 'windup' ? -0.25 : e.state === 'lunge' ? 0.2 : 0;
      R.body.position.y = e.state === 'windup' ? -0.12 : R.body.position.y;
    } else if (e.kind === 'carcelero') {
      animateRig(R, dt, sp, sp > 0.1 ? 'walk' : 'idle');
    } else if (R.phase !== undefined) {
      R.phase += dt * (sp > 0.1 ? 4 : 1.5);
      R.body.position.y = sp > 0.1 ? Math.abs(Math.sin(R.phase)) * 0.12 : Math.sin(R.phase) * 0.04;
      if (e.kind === 'guardian' && R.runes) R.runes.material.color.setHex(e.shield ? 0x9af0ff : e.phase === 3 ? 0xff3a3a : 0xff6af0);
    }
    // destello al recibir golpe: se escala un instante
    const s = (e.kind === 'carcelero' ? 1.6 : e.kind === 'wisp' ? 0.7 : 1) * (e.flash > 0 ? 1.08 : 1);
    R.root.scale.setScalar(s);
  }

  return {
    root, spawn, clear, loadScene, update, damage, playerAttack, kill, startPhase,
    get enemies() { return enemies; },
    get boss() { return boss; },
    set boss(b) { boss = b; },
    get teleCount() { return teles.filter(t => t.on).length; },
    alive: () => enemies.filter(e => !e.dead).length,
    dispose() { Object.values(TG).forEach(g => g.dispose()); },
  };
}
