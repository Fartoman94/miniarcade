// @ts-check
/* Corsarios del Abismo — rivales con silueta, patrón y contrajuego propios:
   - Goleta pirata: busca ponerte de costado a ~26 m y dispara andanadas (troneras naranjas = aviso).
     Contrajuego: cruzale la proa o la popa (no puede disparar hacia adelante/atrás). Con poca vida se rinde: abordala.
   - Lancha corsaria: rápida y frágil; se alinea (carril rojo) y embiste. Contrajuego: recibila de proa (daño a la mitad
     y ella se rompe) o barrela de costado mientras apunta.
   - Cañones de costa / baterías del fuerte: morteros con círculo rojo de impacto. Contrajuego: cambiar rumbo o velocidad;
     se destruyen a cañonazos o, desembarcando, se clavan (sabotaje). Necesitan línea de tiro (las islas tapan).
   - Tiburón gigante: aleta que te rodea, aviso (ondas + gruñido) y embestida; tras morder (o fallar) salta y queda
     expuesto: es el momento de dispararle. Navegar rápido hace que falle. */
import * as THREE from 'three';
import { createShip, fireBroadside, hullDist, MAX_RANGE, V0, G } from './ships.js';
import { sharkModel } from './models.js';
import { waveHeight } from './water.js';

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/**
 * @param {any} ctx {scene, world, balls, fx, sfx, diff:()=>any, player:()=>any, onFoot:()=>boolean, rand, hooks}
 */
export function createEnemies(ctx) {
  /** @type {any[]} */ const ships = [];
  /** @type {any[]} */ const sharks = [];
  const group = new THREE.Group(); ctx.scene.add(group);

  function spawn(def) {
    const d = ctx.diff();
    if (def.type === 'shark') {
      const m = sharkModel(); group.add(m.group);
      const sh = { kind: 'shark', model: m, x: def.x, z: def.z, y: -1.2, yaw: 0, hp: Math.round(90 * d.hp), maxHp: Math.round(90 * d.hp), alive: true, fled: false,
        home: { x: def.x, z: def.z }, state: 'roam', t: 0, ang: 0, cd: 4, speed: 0, tx: 0, tz: 0, hitDone: false, ring: ctx.fx.marker('ring', 0xff4030), flashT: 0, aggro: false };
      sharks.push(sh); return sh;
    }
    const s = createShip(def.type, group, { x: def.x, z: def.z, yaw: ctx.rand() * 6.28, hpMul: d.hp, rand: ctx.rand });
    s.reloadMax = s.spec.reload * d.reload;
    s.ai = { state: 'patrol', home: { x: def.x, z: def.z }, wp: { x: def.x, z: def.z }, t: 0, cd: 2 + ctx.rand() * 2, side: 1, teleSide: 0, teleT: 0, surrT: 0, aggro: false, dashT: 0, lockYaw: 0, evadeT: 0 };
    if (def.type === 'lancha') { s.ai.lane = ctx.fx.marker('lane', 0xff3020); }
    s.sail = 0.45; s.sailCur = 0.45;
    ships.push(s); return s;
  }
  function clear() {
    for (const s of ships) { s.model.group.removeFromParent(); disposeObj(s.model.group); if (s.ai.lane) s.ai.lane.visible = false; }
    for (const s of sharks) { s.model.group.removeFromParent(); disposeObj(s.model.group); s.ring.visible = false; }
    ships.length = 0; sharks.length = 0;
  }
  function disposeObj(o) { o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach(m => m.dispose()); }); }

  /** Evita costas: devuelve una corrección de timón (-1..1) si hay tierra adelante. */
  function avoid(s, look = 16) {
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    for (const isl of ctx.world.islands) {
      const ax = s.x + fx * look, az = s.z + fz * look;
      const dx = ax - isl.x, dz = az - isl.z, d = Math.hypot(dx, dz);
      if (d < isl.r + s.wid + 6) {
        const side = (isl.x - s.x) * -Math.cos(s.yaw) + (isl.z - s.z) * Math.sin(s.yaw); // >0: isla a estribor
        return side > 0 ? -1 : 1;
      }
    }
    const r = Math.hypot(s.x + fx * look, s.z + fz * look);
    if (r > 175) { const want = Math.atan2(-s.x, -s.z); return clamp(wrap(want - s.yaw) * 2, -1, 1); }
    return 0;
  }
  const steerTo = (s, yaw) => clamp(wrap(yaw - s.yaw) * 1.8, -1, 1);

  /* ---------------- goleta ---------------- */
  function goleta(s, dt, P, onFoot) {
    const ai = s.ai, d = ctx.diff();
    const dx = P.x - s.x, dz = P.z - s.z, dist = Math.hypot(dx, dz);
    if (s.boarded) { s.sail = 0; s.steer = 0; return; }
    if (s.surrender) {
      s.sail = 0; s.steer = 0; ai.surrT -= dt;
      if (ai.surrT <= 0) { s.surrender = false; s.model.white.visible = false; ai.state = 'flee'; ai.t = 12; ctx.hooks.toast('⛵ La goleta escapó: no la abordaste a tiempo', 1800); }
      return;
    }
    const wasAggro = ai.aggro;
    ai.aggro = !onFoot && (dist < 70 || (ai.aggro && dist < 110)) && ai.state !== 'flee';
    if (ai.aggro && !wasAggro) ctx.hooks.engage(s);
    if (ai.state === 'flee') {
      ai.t -= dt; s.sail = 1; s.steer = steerTo(s, Math.atan2(-dx, -dz));
      const av = avoid(s); if (av) s.steer = av;
      if (ai.t <= 0) ai.state = 'patrol';
    } else if (!ai.aggro) {
      ai.state = 'patrol';
      if (Math.hypot(ai.wp.x - s.x, ai.wp.z - s.z) < 8) { const a = ctx.rand() * 6.28; ai.wp = { x: ai.home.x + Math.cos(a) * 28, z: ai.home.z + Math.sin(a) * 28 }; }
      s.sail = 0.4; s.steer = steerTo(s, Math.atan2(ai.wp.x - s.x, ai.wp.z - s.z));
      const av = avoid(s); if (av) s.steer = av;
    } else {
      ai.state = 'engage';
      const bearing = Math.atan2(dx, dz), rel = wrap(bearing - s.yaw);
      const side = rel < 0 ? 1 : -1; // jugador a estribor (+1) o babor (-1)
      ai.side = side;
      const c = clamp((dist - 26) / 26, -0.55, 0.75);
      s.steer = steerTo(s, bearing + side * (Math.PI / 2 - c));
      s.sail = dist > 45 ? 0.95 : 0.65;
      const av = avoid(s); if (av) s.steer = av;
      // disparo con aviso (troneras encendidas)
      const key = side > 0 ? 'R' : 'L';
      const inArc = Math.abs(wrap(rel - (side > 0 ? -Math.PI / 2 : Math.PI / 2))) < 0.42;
      if (ai.teleT > 0) {
        ai.teleT -= dt;
        if (ai.teleT <= 0) {
          const k = ai.teleSide > 0 ? 'R' : 'L';
          const fl = Math.hypot(P.x - s.x, P.z - s.z) / (V0 * 0.8);
          const err = 3.5 * d.spread;
          const tgt = { x: P.x + Math.sin(P.yaw) * P.speed * fl * 0.85 + (ctx.rand() - 0.5) * err, z: P.z + Math.cos(P.yaw) * P.speed * fl * 0.85 + (ctx.rand() - 0.5) * err };
          ctx.hooks.fire(s, ai.teleSide, tgt);
          s.reload[k] = s.reloadMax;
        }
      } else if (s.reload[key] <= 0 && inArc && dist < MAX_RANGE * 0.85 && !ctx.world.blocked(s.x, s.z, P.x, P.z, null)) {
        ai.teleT = 0.85; ai.teleSide = side; s.tele[key] = 0.85; ctx.sfx.tele(false);
      }
    }
    if (!s.surrender && !s.boarded && s.hp < s.maxHp * 0.22 && !ai.gaveUp) {
      ai.gaveUp = true; s.surrender = true; ai.surrT = 25; s.model.white.visible = true; ai.teleT = 0;
      ctx.hooks.surrender(s);
    }
  }

  /* ---------------- lancha ---------------- */
  function lancha(s, dt, P, onFoot) {
    const ai = s.ai, dx = P.x - s.x, dz = P.z - s.z, dist = Math.hypot(dx, dz);
    const wasAggro = ai.aggro;
    ai.aggro = !onFoot && (dist < 60 || (ai.aggro && dist < 100));
    if (ai.aggro && !wasAggro) ctx.hooks.engage(s);
    ai.cd -= dt;
    ai.lane.visible = false;
    s.speedMul = 1;
    if (!ai.aggro) {
      ai.state = 'patrol';
      if (Math.hypot(ai.wp.x - s.x, ai.wp.z - s.z) < 8) { const a = ctx.rand() * 6.28; ai.wp = { x: ai.home.x + Math.cos(a) * 22, z: ai.home.z + Math.sin(a) * 22 }; }
      s.sail = 0.5; s.steer = steerTo(s, Math.atan2(ai.wp.x - s.x, ai.wp.z - s.z));
      const av = avoid(s, 10); if (av) s.steer = av;
      return;
    }
    if (ai.state === 'patrol') ai.state = 'approach';
    if (ai.state === 'approach') {
      // orbita a ~24 m buscando el costado del jugador
      const a = Math.atan2(s.x - P.x, s.z - P.z) + 0.6;
      const tx = P.x + Math.sin(a) * 24, tz = P.z + Math.cos(a) * 24;
      s.sail = 1; s.steer = steerTo(s, Math.atan2(tx - s.x, tz - s.z));
      const av = avoid(s, 10); if (av) s.steer = av;
      if (ai.cd <= 0 && dist < 36 && !ctx.world.blocked(s.x, s.z, P.x, P.z, null)) { ai.state = 'aim'; ai.t = 1.15; ctx.sfx.boost(); ctx.hooks.laneWarn(s); }
    } else if (ai.state === 'aim') {
      ai.t -= dt; s.sail = 0.15; s.speed *= Math.exp(-dt * 2);
      const want = Math.atan2(dx, dz); s.steer = steerTo(s, want); s.yaw += clamp(wrap(want - s.yaw), -2.5 * dt, 2.5 * dt);
      ai.lane.visible = true;
      ai.lane.position.set(s.x, waveHeight(s.x, s.z) + 0.2, s.z); ai.lane.rotation.y = s.yaw; ai.lane.scale.set(2.6, 1, Math.min(40, dist + 6));
      /** @type {any} */ (ai.lane.material).opacity = 0.2 + 0.3 * Math.abs(Math.sin(ai.t * 12));
      if (ai.t <= 0) { ai.state = 'dash'; ai.t = 1.8; ai.lockYaw = s.yaw; s.speed = 16; }
    } else if (ai.state === 'dash') {
      ai.t -= dt; s.sail = 1; s.speedMul = 1.9;
      const want = Math.atan2(dx, dz);
      ai.lockYaw += clamp(wrap(want - ai.lockYaw), -0.3 * dt, 0.3 * dt);
      s.steer = steerTo(s, ai.lockYaw);
      if (ctx.rand() < 0.5) ctx.fx.spray(s.x + Math.sin(s.yaw) * 3, s.y + 0.6, s.z + Math.cos(s.yaw) * 3, Math.sin(s.yaw) * 4, Math.cos(s.yaw) * 4, 1);
      if (ai.t <= 0) { ai.state = 'evade'; ai.t = 2.6; ai.cd = 3.5 * ctx.diff().reload; }
    } else if (ai.state === 'evade') {
      ai.t -= dt; s.sail = 1; s.steer = steerTo(s, Math.atan2(-dx, -dz) + 0.8);
      const av = avoid(s, 10); if (av) s.steer = av;
      if (ai.t <= 0) ai.state = 'approach';
    }
  }

  /* ---------------- tiburón ---------------- */
  function shark(sh, dt, P, onFoot) {
    sh.t -= dt; sh.flashT = Math.max(0, sh.flashT - dt);
    const d = ctx.diff();
    const dx = P.x - sh.x, dz = P.z - sh.z, dist = Math.hypot(dx, dz);
    const near = Math.hypot(P.x - sh.home.x, P.z - sh.home.z) < 75 || dist < 45;
    sh.ring.visible = false;
    let wantY = -1.2, speed = 6;
    if (sh.fled) { sh.y -= dt * 2; sh.x += Math.sin(sh.yaw) * 10 * dt; sh.z += Math.cos(sh.yaw) * 10 * dt; if (sh.y < -8) sh.alive = false; place(sh); return; }
    if (onFoot || !near) { if (sh.state !== 'roam') sh.state = 'roam'; }
    else if (sh.state === 'roam') { sh.state = 'circle'; sh.cd = 3.5 * d.sharkCd; sh.ang = Math.atan2(sh.x - P.x, sh.z - P.z); if (!sh.aggro) { sh.aggro = true; ctx.hooks.sharkSeen(sh); } }
    if (sh.state === 'roam') {
      sh.ang += dt * 0.25; const tx = sh.home.x + Math.sin(sh.ang) * 18, tz = sh.home.z + Math.cos(sh.ang) * 18;
      steerShark(sh, tx, tz, 5, dt);
    } else if (sh.state === 'circle') {
      sh.ang += dt * 0.55; sh.cd -= dt;
      const tx = P.x + Math.sin(sh.ang) * 17, tz = P.z + Math.cos(sh.ang) * 17;
      steerShark(sh, tx, tz, 9, dt); speed = 9;
      if (sh.cd <= 0) { sh.state = 'tele'; sh.t = 1.4; ctx.sfx.shark(); ctx.hooks.sharkTele(sh); }
    } else if (sh.state === 'tele') {
      sh.ring.visible = true; sh.ring.position.set(sh.x, waveHeight(sh.x, sh.z) + 0.2, sh.z); sh.ring.scale.setScalar(3 + Math.sin(sh.t * 18) * 0.6);
      steerShark(sh, P.x, P.z, 3, dt, 4);
      if (ctx.rand() < 0.6) ctx.fx.churn(sh.x + (ctx.rand() - 0.5) * 3, sh.z + (ctx.rand() - 0.5) * 3, 1.6);
      if (sh.t <= 0) { sh.state = 'charge'; sh.t = 2.2; sh.hitDone = false; }
    } else if (sh.state === 'charge') {
      steerShark(sh, P.x, P.z, 23, dt, 2.2); speed = 23; wantY = -0.9;
      if (ctx.rand() < 0.7) ctx.fx.wake(sh.x, sh.z, 1.6, 1.4);
      if (!sh.hitDone && hullDist(P, sh.x, sh.z) < P.wid * 0.5 + 1.6) {
        sh.hitDone = true; ctx.hooks.sharkBite(sh); sh.state = 'surface'; sh.t = 3.0; sh.jump = 0;
      } else if (sh.t <= 0) { sh.state = 'surface'; sh.t = 2.4; sh.jump = 0; ctx.hooks.sharkMiss(sh); }
    } else if (sh.state === 'surface') {
      sh.jump += dt; speed = 3;
      wantY = sh.jump < 0.9 ? Math.sin(sh.jump / 0.9 * Math.PI) * 3.2 : 0.2;
      sh.x += Math.sin(sh.yaw) * 4 * dt; sh.z += Math.cos(sh.yaw) * 4 * dt;
      if (sh.jump > 0.85 && sh.jump - dt <= 0.85) { ctx.fx.splash(sh.x, sh.z, 1.4); ctx.sfx.splash(1.5); }
      if (sh.t <= 0) { sh.state = 'circle'; sh.cd = (4.5 + ctx.rand() * 2) * d.sharkCd; sh.ang = Math.atan2(sh.x - P.x, sh.z - P.z); }
    }
    if (sh.state !== 'surface') { sh.x += Math.sin(sh.yaw) * speed * dt; sh.z += Math.cos(sh.yaw) * speed * dt; }
    const wy = waveHeight(sh.x, sh.z);
    sh.y += (wy + wantY - sh.y) * Math.min(1, dt * (sh.state === 'surface' ? 12 : 4));
    sh.exposed = sh.state === 'surface';
    // no atravesar islas
    ctx.world.pushOut(sh, 3);
    place(sh);
    if (sh.state !== 'surface' && ctx.rand() < 0.25) ctx.fx.wake(sh.x - Math.sin(sh.yaw) * 1.5, sh.z - Math.cos(sh.yaw) * 1.5, 0.9, 1.0);
  }
  function steerShark(sh, tx, tz, sp, dt, turn = 1.6) { const want = Math.atan2(tx - sh.x, tz - sh.z); sh.yaw = wrap(sh.yaw + clamp(wrap(want - sh.yaw), -turn * dt, turn * dt)); sh.speed = sp; }
  function place(sh) {
    const g = sh.model.group; g.position.set(sh.x, sh.y, sh.z); g.rotation.set(sh.state === 'surface' && sh.jump < 0.9 ? -0.5 + sh.jump : 0, sh.yaw, 0);
    sh.model.tail.rotation.y = Math.sin(performance.now() * 0.008 * (sh.state === 'charge' ? 2.5 : 1)) * 0.45;
  }

  /* ---------------- cañones de costa ---------------- */
  function cannon(c, dt, P, onFoot) {
    if (c.destroyed) { c.smokeT -= dt; if (c.smokeT <= 0) { c.smokeT = 0.35; ctx.fx.smoke(c.x, c.y + 0.5, c.z, 0x3a3634, 1.2); } return; }
    if (!c.marker) c.marker = ctx.fx.marker('disc', 0xff2a1a);
    c.flash = Math.max(0, c.flash - dt);
    const dx = P.x - c.x, dz = P.z - c.z, dist = Math.hypot(dx, dz), range = c.battery ? 88 : 76;
    const isl = c.isl ? ctx.world.islById[c.isl] : null;
    const los = dist < range && !ctx.world.blocked(c.x, c.z, P.x, P.z, isl);
    c.seen = los && !onFoot && P.alive && !P.sinking;
    const want = Math.atan2(dx, dz);
    if (c.seen) c.yaw += clamp(wrap(want - c.yaw), -1.3 * dt, 1.3 * dt);
    c.turret.rotation.y = c.yaw;
    if (c.tele > 0) {
      c.tele -= dt;
      const k = 1 - c.tele / c.teleMax;
      c.marker.visible = true; c.marker.position.set(c.tx, waveHeight(c.tx, c.tz) + 0.25, c.tz); c.marker.scale.setScalar(5 * (0.4 + 0.6 * k));
      /** @type {any} */ (c.marker.material).opacity = 0.18 + 0.35 * k + 0.15 * Math.sin(k * 30);
      if (c.tele <= 0) {
        c.marker.visible = true;
        const T = c.flight, by = c.y + 1.5;
        const mx = c.x + Math.sin(c.yaw) * 2.4, mz = c.z + Math.cos(c.yaw) * 2.4;
        ctx.balls.spawn({ x: mx, y: by, z: mz, vx: (c.tx - mx) / T, vz: (c.tz - mz) / T, vy: (0 - by + 0.5 * G * T * T) / T, team: 'enemy', owner: c, dmg: (c.battery ? 15 : 12) * ctx.diff().dmg, mortar: true, big: 1.3, life: T + 1 });
        ctx.fx.muzzle(mx, by + 0.6, mz, Math.sin(c.yaw), Math.cos(c.yaw)); ctx.sfx.cannon(Math.max(0.3, 1 - dist / 120)); c.flash = 0.2;
        c.markT = T + 0.1;
      }
    } else if (c.markT > 0) { c.markT -= dt; if (c.markT <= 0) c.marker.visible = false; }
    else {
      c.marker.visible = false;
      c.cd -= dt;
      if (c.seen && c.cd <= 0) {
        const d = ctx.diff();
        c.flight = 1.5 + dist / 60; c.teleMax = c.tele = 1.25;
        const lead = c.flight + c.tele;
        const err = 4 * d.spread;
        c.tx = P.x + Math.sin(P.yaw) * P.speed * lead * 0.9 + (ctx.rand() - 0.5) * err; c.tz = P.z + Math.cos(P.yaw) * P.speed * lead * 0.9 + (ctx.rand() - 0.5) * err;
        c.cd = (c.battery ? 3.6 : 4.6) * d.reload + ctx.rand();
        ctx.sfx.whistle();
        ctx.hooks.cannonTele(c);
      }
    }
  }

  return {
    ships, sharks, group, spawn, clear,
    /** @param {number} dt */
    update(dt, frozen) {
      const P = ctx.player(), onFoot = ctx.onFoot();
      for (const s of ships) {
        if (!s.alive) continue;
        s.reload.L = Math.max(0, s.reload.L - dt); s.reload.R = Math.max(0, s.reload.R - dt);
        s.tele.L = Math.max(0, s.tele.L - dt); s.tele.R = Math.max(0, s.tele.R - dt);
        if (s.sinking || frozen) { if (frozen) { s.sail = 0; s.steer = 0; } continue; }
        if (s.kind === 'goleta') goleta(s, dt, P, onFoot);
        else if (s.kind === 'lancha') lancha(s, dt, P, onFoot);
      }
      for (const sh of sharks) if (sh.alive && !frozen) shark(sh, dt, P, onFoot); else if (sh.alive) place(sh);
      for (const c of ctx.world.cannons) if (!frozen) cannon(c, dt, P, onFoot);
    },
    /** cuántos enemigos están peleando */
    engaged() { return ships.filter(s => s.alive && !s.sinking && !s.surrender && !s.boarded && s.ai.aggro).length + sharks.filter(s => s.alive && !s.fled && s.state !== 'roam').length; },
    dispose() { clear(); group.removeFromParent(); },
  };
}
