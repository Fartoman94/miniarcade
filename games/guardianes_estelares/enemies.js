// @ts-check
/* Enemigos: interceptor rápido, dron minador, bombardero pesado y fragata protectora.
   Pools fijos dibujados con InstancedMesh (cuerpo + brillo por tipo = 8 draw calls). Cada tipo tiene
   silueta, patrón y contrajuego propios, y avisa (telegrafía) antes de atacar. */
import * as THREE from 'three';
import * as M from './models.js';
import { ENEMY } from './config.js';

const UP = new THREE.Vector3(0, 1, 0), O = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sd = new THREE.Vector3();
const CAP = { interceptor: 18, drone: 14, bomber: 8, frigate: 3 };
const TYPES = /** @type {const} */ (['interceptor', 'drone', 'bomber', 'frigate']);

/** @typedef {{type:string, i:number, alive:boolean, pos:THREE.Vector3, vel:THREE.Vector3, fwd:THREE.Vector3, hp:number, max:number,
 *  state:number, st:number, cd:number, cd2:number, burst:number, tele:number, flash:number, target:any, shielded:boolean,
 *  mines:number, anchor:THREE.Vector3, orbit:number, group:number, side:number, speedK:number, hint:boolean, protect:any, age:number}} Enemy */

/** @param {any} ctx */
export function createEnemies(ctx) {
  const { mats } = ctx;
  const geos = { interceptor: M.buildInterceptor(), drone: M.buildDrone(), bomber: M.buildBomber(), frigate: M.buildFrigate() };
  /** @type {Record<string, {body:THREE.InstancedMesh, glow:THREE.InstancedMesh, items:Enemy[]}>} */
  const T = {};
  /** @type {Enemy[]} */ const all = [];
  for (const type of TYPES) {
    const n = CAP[type];
    const body = new THREE.InstancedMesh(geos[type].body, mats.body, n), glow = new THREE.InstancedMesh(geos[type].glow, mats.glow, n);
    for (const im of [body, glow]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; for (let i = 0; i < n; i++) { im.setMatrixAt(i, ZERO); im.setColorAt(i, _c.setRGB(1, 1, 1)); } ctx.root.add(im); }
    body.castShadow = true;
    const items = [];
    for (let i = 0; i < n; i++) {
      const e = /** @type {Enemy} */ ({ type, i, alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), hp: 0, max: 0,
        state: 0, st: 0, cd: 0, cd2: 0, burst: 0, tele: 0, flash: 0, target: null, shielded: false, mines: 0, anchor: new THREE.Vector3(), orbit: 0, group: -1, side: 1, speedK: 1, hint: false, protect: null, age: 0 });
      items.push(e); all.push(e);
    }
    T[type] = { body, glow, items };
  }

  /** @param {string} type @param {THREE.Vector3} pos @param {{target?:any, group?:number, protect?:any}} [o] */
  function spawn(type, pos, o = {}) {
    const pool = T[type]; if (!pool) return null;
    const e = pool.items.find(x => !x.alive); if (!e) return null;
    const base = /** @type {any} */ (ENEMY)[type];
    e.alive = true; e.pos.copy(pos); e.vel.set(0, 0, 0);
    e.fwd.subVectors(ctx.player.pos, pos).normalize(); if (!isFinite(e.fwd.x)) e.fwd.set(0, 0, 1);
    e.max = e.hp = base.hp * ctx.diff.enemyHp; e.state = 0; e.st = 0; e.cd = 1 + Math.random() * 1.5; e.cd2 = 2; e.burst = 0; e.tele = 0; e.flash = 0;
    e.target = o.target || null; e.group = o.group ?? -1; e.protect = o.protect || null; e.shielded = false; e.mines = 0;
    e.orbit = Math.random() * Math.PI * 2; e.side = Math.random() < 0.5 ? -1 : 1; e.speedK = 0.9 + Math.random() * 0.2; e.hint = false; e.age = 0;
    e.anchor.copy(pos);
    ctx.fx.flashes.spawn(pos, type === 'frigate' ? 40 : 16, 0x9fd8ff, 0.5);
    return e;
  }

  /** Gira fwd hacia dir (unitario) con velocidad angular aproximada. */
  function steer(e, dir, rate, dt) {
    // evitar coberturas por delante
    _sd.copy(dir);
    _sb.copy(e.pos).addScaledVector(e.fwd, 22);
    const hit = ctx.W.grid.hit(_sb, 5);
    if (hit >= 0) { const c = ctx.W.grid.covers[hit]; _sa.set(e.pos.x - c.x, e.pos.y - c.y, e.pos.z - c.z).normalize(); _sd.addScaledVector(_sa, 1.6).normalize(); }
    // mantenerse dentro del sector
    const R = ctx.W.radius;
    if (e.pos.lengthSq() > R * R) _sd.addScaledVector(_sa.copy(e.pos).normalize(), -1.5).normalize();
    e.fwd.lerp(_sd, Math.min(1, rate * dt)).normalize();
  }

  /** Disparo enemigo con anticipación parcial. */
  function shootAt(e, from, target, speed, spread, dmgK = 1) {
    _a.subVectors(target.pos, from);
    const t = _a.length() / speed;
    if (target.vel) _a.addScaledVector(target.vel, t * 0.6);
    _a.normalize();
    if (spread) { _a.x += (Math.random() - 0.5) * spread; _a.y += (Math.random() - 0.5) * spread; _a.z += (Math.random() - 0.5) * spread; _a.normalize(); }
    const b = ctx.fx.ebolts.spawn(from, _a.multiplyScalar(speed), 3.2, 7 * ctx.diff.enemyDmg * dmgK, 1);
    ctx.sfx.enemyShot(from);
    return b;
  }

  const isAlly = t => t && (t.alive !== false);
  /** @param {Enemy} e */
  function pickTarget(e) {
    const opts = ctx.allyTargets(e);
    return opts.length ? opts[Math.floor(Math.random() * opts.length)] : ctx.player;
  }

  /** @param {number} dt */
  function update(dt) {
    const P = ctx.player, W = ctx.W, D = ctx.diff;
    // reset de vínculos de escudo (las fragatas los vuelven a marcar)
    for (const e of all) e.shielded = false;
    for (const f of T.frigate.items) {
      if (!f.alive) continue;
      for (const e of all) if (e.alive && e !== f && e.type !== 'frigate' && e.pos.distanceToSquared(f.pos) < 80 * 80) e.shielded = true;
    }
    for (const e of all) {
      if (!e.alive) continue;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt * 5);
      e.cd -= dt; e.cd2 -= dt;
      if (!isAlly(e.target) || (e.target.alive === false)) e.target = pickTarget(e);
      const tgt = e.target || P;
      if (e.type === 'interceptor') {
        const toT = _a.subVectors(tgt.pos, e.pos), dist = toT.length(); toT.divideScalar(dist || 1);
        let speed = 46 * e.speedK;
        if (e.state === 0) {
          steer(e, toT, 2.2, dt);
          if (dist < 125 && e.fwd.dot(toT) > 0.9 && e.cd <= 0 && !W.grid.blocked(e.pos, tgt.pos)) { e.state = 1; e.st = 0.55; }
          if (dist < 25) { e.state = 3; e.st = 1.6; }
        } else if (e.state === 1) {
          speed = 30; steer(e, toT, 1.3, dt);
          e.st -= dt; e.tele = 1 - e.st / 0.55;
          if (e.st <= 0) { e.state = 2; e.burst = 3; e.st = 0; e.tele = 0; }
        } else if (e.state === 2) {
          speed = 36; steer(e, toT, 1.0, dt); e.st -= dt;
          if (e.st <= 0 && e.burst > 0) { _b.copy(e.pos).addScaledVector(e.fwd, 3); shootAt(e, _b, tgt, 92, 0.05); e.burst--; e.st = 0.13; }
          if (e.burst <= 0) { e.state = 3; e.st = 1.8 + Math.random(); e.cd = (2.4 + Math.random()) / D.fireRate; _d.crossVectors(e.fwd, UP).normalize().multiplyScalar(e.side).addScaledVector(UP, 0.4).normalize(); e.anchor.copy(_d); }
        } else {
          speed = 54; steer(e, e.anchor, 2.0, dt); e.st -= dt;
          if (e.st <= 0) { e.state = 0; if (Math.random() < 0.5) e.target = pickTarget(e); }
        }
        e.vel.copy(e.fwd).multiplyScalar(speed);
      } else if (e.type === 'drone') {
        // se ubica por delante del objetivo protegido (convoy/carguero) o del jugador y siembra minas
        if (e.state === 0) { ctx.droneAnchor(e, e.anchor); e.state = 1; e.cd = 2 + Math.random() * 2; }
        _b.subVectors(e.anchor, e.pos); const d = _b.length();
        const toP = _a.subVectors(e.pos, P.pos); const dp = toP.length();
        if (dp < 45) _b.addScaledVector(toP.divideScalar(dp || 1), 30); // se aleja del jugador
        if (d > 4 || dp < 45) { _b.normalize(); e.fwd.lerp(_b, Math.min(1, dt * 2)).normalize(); e.vel.copy(_b).multiplyScalar(16 * e.speedK); }
        else e.vel.multiplyScalar(0.92);
        if (e.cd <= 0 && e.mines < 6 && d < 30) {
          e.tele = 1;
          const mn = ctx.fx.mines.spawn(e.pos, _a.set(0, 0, 0), 45, 26 * D.enemyDmg, 1);
          if (mn) { mn.state = 0; mn.t = 0; }
          e.mines++; e.cd = (3.6 + Math.random()) / D.fireRate;
          ctx.sfx.mineDrop(e.pos);
          if (e.mines % 2 === 0) e.state = 0; // reubicarse
        }
        e.tele = Math.max(0, e.tele - dt * 2);
      } else if (e.type === 'bomber') {
        const toT = _a.subVectors(tgt.pos, e.pos), dist = toT.length(); toT.divideScalar(dist || 1);
        if (e.state === 0) {
          // aproximación hasta distancia de lanzamiento, luego órbita lenta
          if (dist > 95) steer(e, toT, 0.8, dt);
          else { _d.crossVectors(toT, UP).normalize().multiplyScalar(e.side); steer(e, _d, 0.6, dt); }
          if (dist < 130 && e.cd <= 0) { e.state = 1; e.st = 1.5; }
        } else {
          steer(e, toT, 0.5, dt); e.st -= dt; e.tele = 1 - e.st / 1.5;
          if (e.st <= 0) {
            e.state = 0; e.tele = 0; e.cd = (7 + Math.random() * 2) / D.fireRate;
            _b.copy(e.pos).addScaledVector(e.fwd, 6).addScaledVector(UP, -1.5);
            const tp = ctx.fx.torps.spawn(_b, _d.copy(e.fwd).multiplyScalar(14), 16, 1, 1);
            if (tp) { tp.target = tgt; tp.hp = 14; }
            ctx.sfx.torpedo(e.pos);
          }
        }
        e.vel.copy(e.fwd).multiplyScalar(15 * e.speedK);
        // cañón de cola contra el jugador si está detrás
        _d.subVectors(P.pos, e.pos); const dpl = _d.length();
        if (dpl < 75 && e.cd2 <= 0 && e.fwd.dot(_d.divideScalar(dpl)) < -0.3) { _b.copy(e.pos).addScaledVector(e.fwd, -5); shootAt(e, _b, P, 80, 0.06, 0.8); e.cd2 = 1.4 / D.fireRate; }
      } else if (e.type === 'frigate') {
        // orbita lo que protege y gira su blindaje frontal hacia el jugador
        const anchor = e.protect ? e.protect.pos : _b.set(0, 0, 0);
        e.orbit += dt * 0.12;
        _b.set(anchor.x + Math.cos(e.orbit) * 55, anchor.y + 10 + Math.sin(e.orbit * 0.7) * 10, anchor.z + Math.sin(e.orbit) * 55);
        _d.subVectors(_b, e.pos); const dd = _d.length();
        e.vel.lerp(_d.normalize().multiplyScalar(Math.min(10, dd)), Math.min(1, dt));
        _a.subVectors(P.pos, e.pos); const dp = _a.length(); _a.divideScalar(dp || 1);
        e.fwd.lerp(_a, Math.min(1, dt * 0.45)).normalize();
        if (e.state === 0) { if (dp < 170 && e.cd <= 0 && !W.grid.blocked(e.pos, P.pos)) { e.state = 1; e.st = 0.85; } }
        else {
          e.st -= dt; e.tele = 1 - e.st / 0.85;
          if (e.st <= 0) {
            e.state = 0; e.tele = 0; e.cd = (3.2 + Math.random()) / D.fireRate;
            for (let k = 0; k < 5; k++) { _b.copy(e.pos).addScaledVector(e.fwd, 14).addScaledVector(UP, 4); shootAt(e, _b, P, 85, 0.16, 0.9); }
          }
        }
      }
      e.pos.addScaledVector(e.vel, dt);
      // no atravesar coberturas
      const ci = W.grid.hit(e.pos, /** @type {any} */ (ENEMY)[e.type].radius * 0.6);
      if (ci >= 0) { const c = W.grid.covers[ci]; _a.set(e.pos.x - c.x, e.pos.y - c.y, e.pos.z - c.z); const l = _a.length() || 1; e.pos.set(c.x, c.y, c.z).addScaledVector(_a, (c.r + /** @type {any} */ (ENEMY)[e.type].radius * 0.6 + 0.1) / l); }
    }
  }

  /**
   * Daño a un enemigo. dir = dirección del proyectil (para blindaje frontal/punto débil trasero).
   * @param {Enemy} e @param {number} amt @param {THREE.Vector3|null} dir @param {'pulse'|'laser'|'ally'|'blast'} by
   * @returns {number} multiplicador aplicado
   */
  function damage(e, amt, dir, by) {
    if (!e.alive) return 0;
    let k = 1;
    if (dir) {
      const dd = dir.dot(e.fwd); // >0: impacto desde atrás
      if (e.type === 'frigate') { if (dd < -0.25) { k = 0.15; if (!e.hint) { e.hint = true; ctx.hint('frigate'); } } else if (dd > 0.35) k = 1.7; }
      if (e.type === 'bomber' && dd > 0.35) k = 2;
    }
    if (e.type === 'drone' && by === 'laser') k *= 3;
    if (e.shielded) k *= 0.3;
    e.hp -= amt * k; e.flash = 1;
    if (e.hp <= 0) kill(e, by);
    return k;
  }
  /** @param {Enemy} e @param {string} by */
  function kill(e, by) {
    e.alive = false;
    const r = /** @type {any} */ (ENEMY)[e.type].radius;
    const col = e.type === 'drone' ? 0xffe066 : e.type === 'frigate' ? 0x7fe6ff : 0xff8a3a;
    ctx.fx.parts.burst(e.pos, e.type === 'frigate' ? 70 : e.type === 'bomber' ? 45 : 26, col, 26 + r * 3, 1.1, e.vel);
    ctx.fx.parts.burst(e.pos, 6, 0xfff4d0, 12, 0.4);
    ctx.fx.flashes.spawn(e.pos, Math.min(30, r * 6), 0xffc070, 0.5);
    if (e.type === 'frigate' || e.type === 'bomber') ctx.fx.flashes.spawn(e.pos, r * 5, 0xff6030, 0.8);
    ctx.onKill(e, by);
  }

  function sync() {
    for (const type of TYPES) {
      const { body, glow, items } = T[type];
      let last = -1;
      for (let i = 0; i < items.length; i++) {
        const e = items[i];
        if (!e.alive) { body.setMatrixAt(i, ZERO); glow.setMatrixAt(i, ZERO); continue; }
        last = i;
        _m.lookAt(e.fwd, O, UP); _q.setFromRotationMatrix(_m);
        if (type === 'drone') _q.multiply(_q2.setFromAxisAngle(UP, e.age * 2));
        _m.compose(e.pos, _q, _s.set(1, 1, 1));
        body.setMatrixAt(i, _m); glow.setMatrixAt(i, _m);
        const f = 1 + e.flash * 2.5;
        if (e.shielded) _c.setRGB(0.65 * f, 1.0 * f, 1.5 * f); else _c.setRGB(f, f, f);
        body.setColorAt(i, _c);
        const g = 1 + e.tele * 3 + e.flash;
        glow.setColorAt(i, _c.setRGB(g, g, g));
      }
      body.count = glow.count = last + 1;
      for (const im of [body, glow]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
  }
  const _q2 = new THREE.Quaternion();

  return {
    all, spawn, update, damage, sync, kill,
    /** @param {string} [type] */
    count(type) { let c = 0; for (const e of all) if (e.alive && (!type || e.type === type)) c++; return c; },
    clear() { for (const e of all) e.alive = false; sync(); },
    dispose() {
      for (const type of TYPES) { const { body, glow } = T[type]; ctx.root.remove(body, glow); body.dispose(); glow.dispose(); }
      for (const k in geos) { /** @type {any} */ (geos)[k].body.dispose(); /** @type {any} */ (geos)[k].glow.dispose(); }
    },
  };
}
