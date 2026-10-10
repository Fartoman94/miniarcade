// @ts-check
/* Bastiones Elementales — Titán Elemental: intro, 3 fases con inmunidades cambiantes, desvío de ruta (fuerza los puentes
   y bloquea las palancas) y pulso que aturde torres. Cada cambio se telegrafía antes de aplicarse. */
import * as THREE from 'three';
import { TITAN } from './config.js';
import * as M from './models.js';

const _c = new THREE.Color();

/** @param {any} ctx */
export function createBoss(ctx) {
  const { scene, mats } = ctx;
  const g = M.buildTitan();
  const group = new THREE.Group(); group.name = 'titan'; group.visible = false;
  const crystalMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: 0x8fe0ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.2, flatShading: true });
  const legs = new THREE.Mesh(g.legs, mats.solid), torso = new THREE.Mesh(g.torso, mats.solid), crystals = new THREE.Mesh(g.crystals, crystalMat);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.add(new THREE.Mesh(g.arm, mats.solid)); armR.add(new THREE.Mesh(g.arm, mats.solid));
  armL.position.set(-2.1, 4.6, 0); armR.position.set(2.1, 4.6, 0);
  const body = new THREE.Group(); body.add(torso, crystals, armL, armR);
  [legs, torso, crystals].forEach(m => { m.castShadow = true; });
  armL.children[0].castShadow = armR.children[0].castShadow = true;
  const auraMat = new THREE.MeshBasicMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const aura = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 40), auraMat); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.12;
  group.add(legs, body, aura);
  group.scale.setScalar(0.8);
  scene.add(group);

  /** Objeto «enemigo» del Titán (lo apuntan las torres). */
  const T = /** @type {any} */ ({
    type: 'titan', isBoss: true, alive: false, dying: false, def: { name: 'Titán Elemental', mult: {} }, x: 0, y: 0, z: 0, yaw: 0, hp: 1, max: 1,
    speed: TITAN.speed, rad: 1.6, scale: 1, fly: false, remain: 999, tc: 0, tr: 0, pdc: 0, pdr: 0,
    slowT: 0, slowK: 0, freezeT: 0, burnT: 0, burnDps: 0, stunT: 0, shredT: 0, shieldT: 0, comboCd: 0, flash: 0, btick: 0.25, state: 'walk',
  });
  const S = { active: false, phase: 0, transT: 0, nextPhase: 0, empT: 0, empWarn: 0, rise: 0, t: 0, defeated: false, rerouted: false, introT: 0, flash: 0 };

  function start(spawnIdx) {
    const W = ctx.W, sp = W.spawns[spawnIdx % W.spawns.length];
    Object.assign(T, { alive: true, dying: false, x: sp.x, y: 0, z: sp.z, hp: TITAN.hp * ctx.diff.titan, tc: sp.c, tr: sp.r, pdc: 0, pdr: 0, slowT: 0, slowK: 0, burnT: 0, stunT: 0, freezeT: 0, comboCd: 0, flash: 0, remain: 999 });
    T.max = T.hp;
    const nx = W.next(sp.c, sp.r); if (nx) { T.tc = nx.c; T.tr = nx.r; T.yaw = Math.atan2(nx.c - sp.c, nx.r - sp.r); }
    Object.assign(S, { active: true, phase: 0, transT: 0, empT: TITAN.empEvery, empWarn: 0, rise: 0, t: 0, defeated: false, rerouted: false, introT: 4.2, flash: 0 });
    setColor(TITAN.phases[0].color);
    group.visible = true;
    ctx.enemies.addExternal(T);
  }
  function setColor(c) { crystalMat.emissive.setHex(c); auraMat.color.setHex(c); }
  function reset() { S.active = false; T.alive = false; group.visible = false; }
  const invuln = () => !S.active || S.introT > 0 || S.transT > 0 || S.defeated;
  /** @param {string} el */
  function mult(el) {
    if (invuln()) return 0;
    const ph = TITAN.phases[S.phase];
    if (el === ph.immune) return 0;
    if (el === ph.weak) return 1.5;
    return 1;
  }
  function onDamage() {
    const r = T.hp / T.max;
    if (S.transT > 0) return;
    if (S.phase === 0 && r <= 2 / 3) beginTransition(1);
    else if (S.phase === 1 && r <= 1 / 3) beginTransition(2);
  }
  function beginTransition(p) {
    S.transT = TITAN.transition; S.nextPhase = p;
    if (T.hp <= 0) T.hp = 1;
    const ph = TITAN.phases[p];
    ctx.fx.ring(T.x, T.z, ph.color, 4, 4, TITAN.transition, 0.15, T);
    ctx.banner('EL TITÁN CAMBIA', ph.name.toUpperCase(), `Inmune a ${ph.immune} · débil a ${ph.weak}`, true);
    ctx.sfx.roar();
    if (p === 1) ctx.telegraphReroute(TITAN.transition);
  }
  function enterPhase(p) {
    S.phase = p;
    const ph = TITAN.phases[p];
    setColor(ph.color);
    ctx.fx.burst(T.x, 4, T.z, ph.color, 40, 6, 1, 1.6, 0.9);
    ctx.shake(0.6);
    if (p === 1) {
      // desvío de ruta: fuerza todos los puentes al otro estado y bloquea las palancas
      ctx.reroute();
      for (let i = 0; i < 4; i++) ctx.spawnNear('imp', T, i);
    }
    if (p === 2) { for (let i = 0; i < 4; i++) ctx.spawnNear('volador', T, i); S.empT = 3; }
    ctx.emitPhase(p);
  }
  function onKilled() {
    if (S.defeated) return;
    S.defeated = true; T.hp = 0; T.dying = true;
    ctx.fx.burst(T.x, 3, T.z, 0xffffff, 60, 7, 1, 2, 1.2);
    for (const ph of TITAN.phases) ctx.fx.ring(T.x, T.z, ph.color, 1, 9, 1.2);
    ctx.shake(1);
    ctx.sfx.titanDown();
    ctx.later(1.4, () => { T.alive = false; ctx.enemies.remove(T); group.visible = false; S.active = false; ctx.onTitanDown(); });
  }

  /** @param {number} dt */
  function update(dt) {
    if (!S.active) return;
    S.t += dt;
    if (S.defeated) return;
    if (S.introT > 0) { S.introT -= dt; S.rise = Math.min(1, S.rise + dt / 3); return; }
    T.flash = Math.max(0, T.flash - dt);
    T.comboCd = Math.max(0, T.comboCd - dt);
    if (T.slowT > 0) { T.slowT -= dt; if (T.slowT <= 0) T.slowK = 0; }
    if (T.burnT > 0) { T.burnT -= dt; T.btick -= dt; if (T.btick <= 0) { T.btick = 0.25; ctx.enemies.damage(T, T.burnDps * 0.25, 'fuego'); } }
    if (S.transT > 0) {
      S.transT -= dt;
      if (S.transT <= 0) enterPhase(S.nextPhase);
      return;
    }
    // pulso de tormenta (fase 3)
    if (S.phase === 2) {
      if (S.empWarn > 0) {
        S.empWarn -= dt;
        if (S.empWarn <= 0) {
          const n = ctx.towers.stunArea(T.x, T.z, TITAN.empRadius, TITAN.empStun);
          ctx.fx.ring(T.x, T.z, 0xffe14a, 1, TITAN.empRadius, 0.4); ctx.fx.burst(T.x, 3, T.z, 0xffe14a, 24, 6);
          ctx.sfx.emp(); ctx.shake(0.4);
          if (n) ctx.popup(T, 8, `PULSO: ${n} TORRE${n > 1 ? 'S' : ''} ATURDIDA${n > 1 ? 'S' : ''}`, '#ffe14a');
        }
        return;
      }
      S.empT -= dt;
      if (S.empT <= 0) {
        S.empT = TITAN.empEvery; S.empWarn = TITAN.empWarn;
        ctx.fx.disc(T.x, T.z, 0xffe14a, TITAN.empRadius, TITAN.empWarn);
        ctx.fx.ring(T.x, T.z, 0xffe14a, TITAN.empRadius, TITAN.empRadius, TITAN.empWarn);
        ctx.sfx.warn();
        return;
      }
    }
    const spd = T.speed * ctx.diff.speed * (1 - T.slowK);
    if (ctx.enemies.moveGround(T, dt, spd)) { ctx.onLeak(T); }
  }

  const _tc = new THREE.Color();
  function render(dt, reduced) {
    if (!S.active) return;
    group.position.set(T.x, -6 * (1 - easeOut(S.rise)) * (S.introT > 0 ? 1 : 0), T.z);
    if (S.introT <= 0) S.rise = 1;
    group.rotation.y = T.yaw;
    const walking = S.introT <= 0 && S.transT <= 0 && S.empWarn <= 0 && !S.defeated;
    const w = walking ? S.t * 2.4 : 0;
    legs.position.y = walking ? Math.abs(Math.sin(w)) * 0.2 : 0;
    body.position.y = legs.position.y;
    body.rotation.z = walking ? Math.sin(w) * 0.05 : 0;
    armL.rotation.x = walking ? Math.sin(w) * 0.5 : S.transT > 0 ? -2.4 : S.empWarn > 0 ? -1.2 : 0;
    armR.rotation.x = walking ? -Math.sin(w) * 0.5 : S.transT > 0 ? -2.4 : S.empWarn > 0 ? -1.2 : 0;
    if (S.transT > 0 && !reduced) body.position.x = Math.sin(S.t * 40) * 0.08; else body.position.x = 0;
    const ph = TITAN.phases[S.transT > 0 ? S.nextPhase : S.phase];
    crystalMat.emissiveIntensity = S.transT > 0 ? 0.8 + Math.abs(Math.sin(S.t * 8)) * 1.5 : 0.9 + (T.flash > 0 ? 1 : 0);
    if (S.transT > 0) { _tc.setHex(TITAN.phases[S.phase].color).lerp(_c.setHex(ph.color), Math.abs(Math.sin(S.t * 5))); crystalMat.emissive.copy(_tc); }
    aura.rotation.z += dt * (S.transT > 0 ? 3 : 0.6);
    auraMat.opacity = 0.25 + Math.sin(S.t * 3) * 0.1;
    if (S.defeated) body.rotation.x = Math.min(0.5, (body.rotation.x || 0) + dt * 0.4);
  }
  const easeOut = k => 1 - (1 - k) * (1 - k);

  function dispose() { group.removeFromParent(); for (const k in g) /** @type {any} */ (g)[k].dispose(); crystalMat.dispose(); auraMat.dispose(); aura.geometry.dispose(); }

  return {
    T, S, start, reset, update, render, mult, invuln, onDamage, onKilled, dispose, group,
    get active() { return S.active; },
    info() {
      return { active: S.active, phase: S.phase + 1, phaseId: TITAN.phases[S.phase].id, transition: S.transT > 0, intro: S.introT > 0, hp: Math.max(0, Math.round(T.hp)), max: Math.round(T.max),
        immune: TITAN.phases[S.phase].immune, weak: TITAN.phases[S.phase].weak, empWarn: S.empWarn > 0, defeated: S.defeated, x: T.x, z: T.z };
    },
    debugPhase(p) { if (!S.active) return; T.hp = T.max * (p === 1 ? 0.9 : p === 2 ? 0.6 : 0.3); S.introT = 0; beginTransition(p - 1); S.transT = 0.01; },
  };
}
