// @ts-check
/* Corsarios del Abismo — jefe: el Almirante Espectral, galeón acorazado con cañones encantados.
   Intro: emerge del mar entre niebla verde (cinemática salteable).
   Fase 1 «Casco acorazado» (100 %→60 %): costados blindados (×0,2). Antes de cada andanada sus troneras brillan
     en verde: mientras están abiertas ese costado recibe ×1,6. La popa (faroles) siempre ×1,2; la proa ×0,3.
   Fase 2 «Cañones encantados» (60 %→25 %): se vuelve etéreo (inmune) e invoca cañones espectrales sobre rocas
     flotantes con balas teledirigidas lentas. Destruirlos rompe el hechizo: 10 s materializado y vulnerable.
     Además embiste por un carril verde telegrafiado.
   Fase 3 «Furia del Abismo» (<25 %): remolino en el centro que arrastra los barcos (el núcleo daña), tormenta,
     andanadas alternadas más rápidas; costados ×0,6.
   Recompensa: al hundirse deja flotando el Cofre del Almirante (recuperarlo = victoria). */
import * as THREE from 'three';
import { createShip, fireBroadside, hitZone, hullDist, MAX_RANGE, V0 } from './ships.js';
import { cannonTurretGeo, vmat, Builder } from './models.js';
import { waveHeight, sea } from './water.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/** @param {any} ctx */
export function createBoss(ctx) {
  const d = ctx.diff();
  const A = ctx.arena; // {x,z,arena}
  const group = new THREE.Group(); ctx.scene.add(group);
  const s = createShip('galeon', group, { x: A.x, z: A.z + 30, yaw: Math.PI, rand: ctx.rand });
  s.hp = s.maxHp = d.bossHp; s.team = 'enemy'; s.isBoss = true; s.sail = 0.5; s.sailCur = 0.5;
  s.reloadMax = 4.2 * d.reload;
  // materiales que se vuelven translúcidos en fase etérea
  const mats = [];
  s.model.group.traverse(o => { const m = /** @type {any} */ (o).material; if (m && !mats.includes(m)) mats.push(m); });
  const baseOpacity = new Map(mats.map(m => [m, { o: m.opacity, t: m.transparent }]));
  const lane = ctx.fx.marker('lane', 0x3fffb0);
  const fan = { L: ctx.fx.marker('lane', 0x3fffb0), R: ctx.fx.marker('lane', 0x3fffb0) };
  const turretGeo = cannonTurretGeo(true);
  const rb = new Builder(); rb.cone(2.6, 7, 6, 0x2a3a34, 0, -1.5, 0, Math.PI); rb.cyl(2.4, 2.8, 1.2, 6, 0x3a4a44, 0, 2.2, 0); const rockGeo = rb.build();
  const mat = vmat({ emissive: 0x0a3a28 });
  /** @type {any[]} */ const cannons = [];

  const B = {
    ship: s, group, cannons,
    phase: 1, state: 'intro', t: 0, introT: 0, ethereal: false, materialT: 0, waves: 0,
    portsOpen: { L: 0, R: 0 }, teleSide: 0, teleT: 0, orbit: 0, ramT: 7, ramState: '', ramYaw: 0, alt: 1, dyingT: 0, defeated: false, chest: null,
    get hp() { return s.hp; }, get maxHp() { return s.maxHp; },
    label() { return this.phase === 1 ? 'FASE 1 · CASCO ACORAZADO' : this.phase === 2 ? (this.ethereal ? 'FASE 2 · CAÑONES ENCANTADOS (ETÉREO)' : 'FASE 2 · ¡MATERIALIZADO!') : 'FASE 3 · FURIA DEL ABISMO'; },
    /** multiplicador de daño según dónde pega la bala */
    zoneMul(x, z) {
      if (this.state !== 'fight' || this.ethereal) return 0;
      const zn = hitZone(s, x, z);
      if (zn === 'stern') return 1.2;
      if (zn === 'bow') return this.phase === 1 ? 0.3 : 0.5;
      const side = ((x - s.x) * -Math.cos(s.yaw) + (z - s.z) * Math.sin(s.yaw)) > 0 ? 'R' : 'L';
      if (this.phase === 1) return this.portsOpen[side] > 0 ? 1.6 : 0.2;
      if (this.phase === 2) return 1;
      return this.portsOpen[side] > 0 ? 1.4 : 0.6;
    },
    hurt(n) {
      if (this.state !== 'fight' || n <= 0) return 0;
      const before = s.hp;
      s.hp = Math.max(0, s.hp - n);
      s.flashT = 0.1;
      if (this.phase === 1 && s.hp <= s.maxHp * 0.6) setPhase(2);
      else if (this.phase === 2 && s.hp <= s.maxHp * 0.25) setPhase(3);
      if (s.hp <= 0) die();
      return before - s.hp;
    },
    startFight() { this.state = 'fight'; s.y = 0; setEthereal(false); },
    update, dispose,
  };

  function setEthereal(on) {
    B.ethereal = on;
    for (const m of mats) { const b = /** @type {any} */ (baseOpacity.get(m)); m.transparent = on ? true : b.t; m.opacity = on ? Math.min(b.o, 0.32) : b.o; m.needsUpdate = true; }
  }
  function setPhase(n) {
    B.phase = n; ctx.sfx.phase(); ctx.hooks.phase(n);
    if (n === 2) { setEthereal(true); summon(3); B.ramT = 6; }
    if (n === 3) { setEthereal(false); for (const c of cannons) killCannon(c, true); B.orbit = Math.atan2(s.x - A.x, s.z - A.z); s.reloadMax = 3.0 * d.reload; }
  }
  function summon(n) {
    for (const c of cannons) killCannon(c, true);
    cannons.length = 0;
    const a0 = ctx.rand() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * Math.PI * 2, x = A.x + Math.sin(a) * 38, z = A.z + Math.cos(a) * 38;
      const rock = new THREE.Mesh(rockGeo, mat), turret = new THREE.Mesh(turretGeo, mat);
      rock.position.set(x, 0, z); turret.position.set(x, 3.0, z); group.add(rock, turret);
      cannons.push({ x, z, y: 3.0, hp: Math.round(40 * d.hp), maxHp: Math.round(40 * d.hp), alive: true, rock, turret, cd: 2 + i * 1.3, glow: 0, ph: ctx.rand() * 6, spectral: true });
    }
    ctx.sfx.ghost();
    ctx.hooks.toast(`👻 ¡${n} cañones encantados! Destruilos para romper el hechizo`, 2400);
  }
  function killCannon(c, silent) {
    if (!c.alive) return; c.alive = false; c.rock.visible = false; c.turret.visible = false;
    if (!silent) { ctx.fx.explosion(c.x, 3, c.z, 1, 0x5cffb0); ctx.sfx.crack(); }
  }
  B.hitCannon = (c, n) => {
    if (!c.alive) return;
    c.hp -= n; c.glow = 0.15;
    if (c.hp <= 0) {
      killCannon(c, false);
      if (cannons.every(k => !k.alive) && B.phase === 2) { setEthereal(false); B.materialT = 10; ctx.hooks.toast('✨ ¡Hechizo roto! El galeón está MATERIALIZADO: ¡fuego!', 2200); ctx.sfx.phase(); }
    }
  };
  function die() {
    B.state = 'dying'; B.dyingT = 0; s.sinking = true; s.sinkT = 0; setEthereal(false);
    for (const c of cannons) killCannon(c, true);
    lane.visible = fan.L.visible = fan.R.visible = false;
    ctx.sfx.roar(); ctx.hooks.dying();
  }

  function fanShow(side, k) {
    const m = side > 0 ? fan.R : fan.L, ang = Math.atan2(-Math.cos(s.yaw) * side, Math.sin(s.yaw) * side);
    m.visible = k > 0; if (!m.visible) return;
    m.position.set(s.x - Math.cos(s.yaw) * side * 4, waveHeight(s.x, s.z) + 0.3, s.z + Math.sin(s.yaw) * side * 4); m.rotation.y = ang; m.scale.set(s.len * 0.8, 1, 46);
    /** @type {any} */ (m.material).opacity = 0.12 + 0.25 * Math.abs(Math.sin(k * 20));
  }

  function update(dt, P, onFoot) {
    B.t += dt;
    s.reload.L = Math.max(0, s.reload.L - dt); s.reload.R = Math.max(0, s.reload.R - dt);
    B.portsOpen.L = Math.max(0, B.portsOpen.L - dt); B.portsOpen.R = Math.max(0, B.portsOpen.R - dt);
    for (const k of ['L', 'R']) { const pm = k === 'R' ? s.model.ports.neg : s.model.ports.pos; const o = B.portsOpen[k] > 0 ? 0.6 + 0.4 * Math.sin(B.t * 20) : 0; pm.visible = o > 0; /** @type {any} */ (pm.material).opacity = o; }
    // fuego espectral de ambientación
    if (ctx.rand() < 0.35) ctx.fx.fire(s.x + (ctx.rand() - 0.5) * s.wid, s.y + 4 + ctx.rand() * 6, s.z + (ctx.rand() - 0.5) * s.len * 0.8, 0x3fffb0);
    if (B.state === 'intro') return;
    if (B.state === 'dying') {
      B.dyingT += dt;
      if (ctx.rand() < 0.8) ctx.fx.explosion(s.x + (ctx.rand() - 0.5) * 8, s.y + 2 + ctx.rand() * 5, s.z + (ctx.rand() - 0.5) * 18, 0.6, ctx.rand() < 0.5 ? 0x5cffb0 : 0xff9a3a);
      sea.whirl.s = Math.max(0, sea.whirl.s - dt * 0.4);
      if (B.dyingT > 4.5 && !B.defeated) { B.defeated = true; B.state = 'dead'; s.alive = false; s.model.group.visible = false; ctx.hooks.defeated(s.x, s.z); }
      return;
    }
    if (B.state !== 'fight') return;
    const dx = P.x - s.x, dz = P.z - s.z, dist = Math.hypot(dx, dz), bearing = Math.atan2(dx, dz), rel = wrap(bearing - s.yaw);
    // telegrafía de andanada
    if (B.teleT > 0) {
      B.teleT -= dt; fanShow(B.teleSide, B.teleT);
      if (B.teleT <= 0) {
        fanShow(B.teleSide, 0);
        const k = B.teleSide > 0 ? 'R' : 'L';
        const fl = dist / (V0 * 0.8);
        ctx.hooks.fire(s, B.teleSide, { x: P.x + Math.sin(P.yaw) * P.speed * fl * 0.7, z: P.z + Math.cos(P.yaw) * P.speed * fl * 0.7 }, true);
        s.reload[k] = s.reloadMax; B.portsOpen[k] = 1.6;
      }
    }
    let steer = 0, sail = 0.6;
    if (B.phase === 1 || (B.phase === 2 && !B.ethereal)) {
      const side = rel < 0 ? 1 : -1, c = clamp((dist - 32) / 26, -0.55, 0.7);
      steer = clamp(wrap(bearing + side * (Math.PI / 2 - c) - s.yaw) * 1.8, -1, 1);
      sail = dist > 50 ? 0.9 : 0.6;
      tryFire(side, rel, dist, 1.6);
      if (B.phase === 2) { B.materialT -= dt; if (B.materialT <= 0) { setEthereal(true); summon(2); } }
    } else if (B.phase === 2) {
      // etéreo: patrulla y embiste por un carril
      B.ramT -= dt;
      if (B.ramState === 'tele') {
        B.ramT2 -= dt; sail = 0.1; steer = clamp(wrap(bearing - s.yaw) * 2, -1, 1); s.yaw += clamp(wrap(bearing - s.yaw), -0.9 * dt, 0.9 * dt);
        lane.visible = true; lane.position.set(s.x, waveHeight(s.x, s.z) + 0.3, s.z); lane.rotation.y = s.yaw; lane.scale.set(7, 1, 60);
        /** @type {any} */ (lane.material).opacity = 0.15 + 0.3 * Math.abs(Math.sin(B.ramT2 * 10));
        if (B.ramT2 <= 0) { B.ramState = 'dash'; B.ramT2 = 2.6; B.ramYaw = s.yaw; s.speed = 14; ctx.sfx.ghost(); }
      } else if (B.ramState === 'dash') {
        B.ramT2 -= dt; lane.visible = false; sail = 1; s.speedMul = 2.4; steer = clamp(wrap(B.ramYaw - s.yaw) * 2, -1, 1);
        if (!B.ramHit && hullDist(s, P.x, P.z) < s.wid * 0.5 + P.wid * 0.5 + 0.5) { B.ramHit = true; ctx.hooks.ram(s); }
        if (B.ramT2 <= 0) { B.ramState = ''; s.speedMul = 1; B.ramT = 8 + ctx.rand() * 3; }
      } else {
        const tx = A.x + Math.sin(B.t * 0.15) * 30, tz = A.z + Math.cos(B.t * 0.15) * 30;
        steer = clamp(wrap(Math.atan2(tx - s.x, tz - s.z) - s.yaw) * 1.8, -1, 1); sail = 0.5;
        if (B.ramT <= 0 && dist < 60) { B.ramState = 'tele'; B.ramT2 = 1.6; B.ramHit = false; ctx.hooks.ramTele(); }
      }
      // cañones encantados
      for (const c of cannons) {
        if (!c.alive) continue;
        c.glow = Math.max(0, c.glow - dt); c.cd -= dt;
        c.turret.rotation.y = Math.atan2(P.x - c.x, P.z - c.z);
        c.rock.position.y = Math.sin(B.t * 1.5 + c.ph) * 0.5; c.turret.position.y = c.y + c.rock.position.y;
        if (c.cd <= 0 && !onFoot) {
          c.cd = 4.2 * d.reload + ctx.rand();
          const a = Math.atan2(P.x - c.x, P.z - c.z);
          ctx.balls.spawn({ x: c.x + Math.sin(a) * 2.5, y: 4, z: c.z + Math.cos(a) * 2.5, vx: Math.sin(a) * 9, vy: 0, vz: Math.cos(a) * 9, team: 'enemy', owner: c, dmg: 9 * d.dmg, spectral: true, big: 1.8, life: 7, home: P });
          ctx.fx.muzzle(c.x, 4, c.z, Math.sin(a), Math.cos(a), 0x5cffb0); ctx.sfx.ghost();
        }
        if (ctx.rand() < 0.2) ctx.fx.sparkle(c.x, 3.5, c.z, 0x5cffb0);
      }
    } else if (B.phase === 3) {
      sea.whirl.x = A.x; sea.whirl.z = A.z; sea.whirl.r = 46; sea.whirl.s = Math.min(1, sea.whirl.s + dt * 0.3);
      B.orbit += dt * 0.22;
      const tx = A.x + Math.sin(B.orbit) * 30, tz = A.z + Math.cos(B.orbit) * 30;
      steer = clamp(wrap(Math.atan2(tx - s.x, tz - s.z) - s.yaw) * 2, -1, 1); sail = 0.8;
      const side = rel < 0 ? 1 : -1;
      tryFire(side, rel, dist, 1.1);
    }
    s.steer = steer; s.sail = sail;
  }
  function tryFire(side, rel, dist, tele) {
    const key = side > 0 ? 'R' : 'L';
    const inArc = Math.abs(wrap(rel - (side > 0 ? -Math.PI / 2 : Math.PI / 2))) < 0.6;
    if (B.teleT <= 0 && s.reload[key] <= 0 && inArc && dist < MAX_RANGE) {
      B.teleT = tele; B.teleSide = side; B.portsOpen[key] = tele + 1.5; ctx.sfx.tele(true); ctx.hooks.broadsideTele(side);
    }
  }
  function dispose() {
    group.removeFromParent();
    group.traverse(o => { const x = /** @type {any} */ (o); if (x.geometry && x.geometry !== turretGeo && x.geometry !== rockGeo) x.geometry.dispose(); if (x.material && !mats.includes(x.material) && x.material !== mat) x.material.dispose(); });
    for (const m of mats) m.dispose(); mat.dispose(); turretGeo.dispose(); rockGeo.dispose();
    lane.visible = fan.L.visible = fan.R.visible = false;
    sea.whirl.s = 0;
  }
  void fireBroadside;
  return B;
}
