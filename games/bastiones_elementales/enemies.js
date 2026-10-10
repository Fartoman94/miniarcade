// @ts-check
/* Bastiones Elementales — enemigos: navegación por campo de flujo (tierra) o línea recta (voladores), estados elementales,
   comportamientos propios (salto del imp, pisotón del gólem, escudo del caballero) y render instanciado con barras de vida. */
import * as THREE from 'three';
import { ENEMIES, TILE, AUX } from './config.js';
import { toWorld, tileOf } from './world.js';
import * as M from './models.js';

const CAP = { trasgo: 80, imp: 70, golem: 24, caballero: 40, volador: 40 };
const COLOR = { trasgo: 0x8ab04a, imp: 0xff6a30, golem: 0xaee0ff, caballero: 0xc8ccd8, volador: 0x8a6aff, titan: 0xffffff };
const HEIGHT = { trasgo: 1.7, imp: 1.4, golem: 2.6, caballero: 2.2, volador: 0.9, titan: 7.2 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
const _right = new THREE.Vector3();

/** @param {any} ctx */
export function createEnemies(ctx) {
  const { scene, mats } = ctx;
  const root = new THREE.Group(); root.name = 'enemigos'; scene.add(root);
  /** @type {Record<string, THREE.InstancedMesh>} */ const meshes = {};
  /** @type {Record<string, any[]>} */ const pools = {};
  /** @type {THREE.BufferGeometry[]} */ const geos = [];
  for (const type of Object.keys(CAP)) {
    const g = M.buildEnemy(type); geos.push(g);
    const im = new THREE.InstancedMesh(g, mats.solid, /** @type {any} */ (CAP)[type]);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = true; im.count = 0; im.frustumCulled = false; im.name = 'enemigo:' + type;
    for (let i = 0; i < /** @type {any} */ (CAP)[type]; i++) im.setColorAt(i, _c.set(0xffffff));
    root.add(im); meshes[type] = im;
    pools[type] = Array.from({ length: /** @type {any} */ (CAP)[type] }, () => ({ alive: false }));
  }
  // sombras, barras de vida y escudos
  const TOTAL = 260;
  const shadowGeo = new THREE.CircleGeometry(1, 12); shadowGeo.rotateX(-Math.PI / 2); geos.push(shadowGeo);
  const shadows = new THREE.InstancedMesh(shadowGeo, mats.shadow, TOTAL); shadows.count = 0; shadows.frustumCulled = false; root.add(shadows);
  const barGeo = new THREE.PlaneGeometry(1, 1); geos.push(barGeo);
  const barBgMat = new THREE.MeshBasicMaterial({ color: 0x14101c, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
  const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, depthWrite: false, transparent: true });
  const barsBg = new THREE.InstancedMesh(barGeo, barBgMat, TOTAL), bars = new THREE.InstancedMesh(barGeo, barMat, TOTAL);
  barsBg.count = bars.count = 0; barsBg.frustumCulled = bars.frustumCulled = false; barsBg.renderOrder = 5; bars.renderOrder = 6;
  for (let i = 0; i < TOTAL; i++) bars.setColorAt(i, _c.set(0x5aff6a));
  root.add(barsBg, bars);
  const shieldGeo = M.buildShield(); geos.push(shieldGeo);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x9ab8ff, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const shields = new THREE.InstancedMesh(shieldGeo, shieldMat, 40); shields.count = 0; shields.frustumCulled = false; root.add(shields);
  const iceGeo = new THREE.IcosahedronGeometry(1, 0); geos.push(iceGeo);
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.55, roughness: 0.1, flatShading: true, depthWrite: false });
  const ices = new THREE.InstancedMesh(iceGeo, iceMat, 60); ices.count = 0; ices.frustumCulled = false; root.add(ices);

  /** @type {any[]} */ const list = [];
  let kills = 0, t = 0;

  function spawn(type, spawnIdx, opts = {}) {
    const W = ctx.W, def = /** @type {any} */ (ENEMIES)[type];
    const e = pools[type].find(x => !x.alive);
    if (!e) return null;
    const sp = W.spawns[spawnIdx % W.spawns.length];
    const D = ctx.diff, elite = !!opts.elite;
    Object.assign(e, {
      type, def, alive: true, dying: false, isBoss: false, elite, wave: opts.wave ?? -1,
      x: sp.x, y: 0, z: sp.z, yaw: 0, tc: sp.c, tr: sp.r, pdc: 0, pdr: 0,
      max: def.hp * D.hp * (elite ? 3.2 : 1) * (opts.hpMul || 1), speed: def.speed * D.speed * (elite ? 0.9 : 1), rad: def.r * (elite ? 1.35 : 1),
      fly: def.fly, scale: elite ? 1.35 : 1, remain: 999, spawnT: 0.5,
      slowT: 0, slowK: 0, freezeT: 0, burnT: 0, burnDps: 0, stunT: 0, shredT: 0, shieldT: 0, shieldCd: 0, comboCd: 0, flash: 0, iceHits: 0,
      state: 'walk', abilityT: 3 + Math.random() * 4, attackT: 0, blinkUsed: false, auxTarget: null, tick: Math.random() * 0.3, btick: 0.25,
      phase: Math.random() * 6, hitBy: 0,
    });
    e.hp = e.max;
    if (e.fly) {
      const cr = W.crystal, dx = cr.x - sp.x, dz = cr.z - sp.z, len = Math.hypot(dx, dz);
      e.fsx = sp.x; e.fsz = sp.z; e.fdx = dx / len; e.fdz = dz / len; e.flen = len; e.fu = 0; e.y = 2.8;
      e.yaw = Math.atan2(dx, dz);
    } else {
      const nx = W.next(sp.c, sp.r);
      if (nx) { e.tc = nx.c; e.tr = nx.r; e.pdc = nx.c - sp.c; e.pdr = nx.r - sp.r; e.yaw = Math.atan2(e.pdc, e.pdr); }
    }
    if (opts.at) { e.x = opts.at.x; e.z = opts.at.z; const tl = tileOf(e.x, e.z); const nx = W.next(tl.c, tl.r); if (nx) { e.tc = nx.c; e.tr = nx.r; } }
    list.push(e);
    return e;
  }
  /** Agrega un enemigo externo (el Titán) a la lista de objetivos. */
  function addExternal(e) { list.push(e); }

  function remove(e) { e.alive = false; const i = list.indexOf(e); if (i >= 0) { list[i] = list[list.length - 1]; list.pop(); } }

  /** Multiplicador de daño por elemento. @param {any} e @param {string} el */
  function multOf(e, el) {
    if (el === 'combo') return e.isBoss ? (ctx.boss.invuln() ? 0 : 1) : 1;
    if (e.isBoss) return ctx.boss.mult(el);
    let m = e.def.mult[el];
    if (m === 0) return 0;
    if (e.shredT > 0 && m < 1) m = 1;
    if (e.shieldT > 0 && el !== 'rayo' && e.shredT <= 0) m *= 0.25;
    return m;
  }
  /** Aplica daño. Devuelve el daño real. */
  function damage(e, amount, el) {
    if (!e.alive || e.dying) return 0;
    const m = multOf(e, el);
    if (m <= 0) { if (Math.random() < 0.15) ctx.popup(e, (HEIGHT[e.type] || 2) * e.scale, 'INMUNE', '#c8c8d0'); return 0; }
    const d = amount * m;
    e.hp -= d; e.flash = 0.08;
    if (e.type === 'caballero' && el !== 'rayo' && e.shieldCd <= 0 && e.shredT <= 0) { e.shieldT = 2.4; e.shieldCd = 6.5; ctx.sfx.shield(); }
    if (e.isBoss) ctx.boss.onDamage(d);
    if (e.type === 'imp' && !e.blinkUsed && e.hp < e.max * 0.6 && e.freezeT <= 0 && e.stunT <= 0 && e.hp > 0) blink(e);
    if (e.hp <= 0) kill(e, el);
    return d;
  }
  function kill(e, el) {
    if (e.isBoss) { e.hp = 0; ctx.boss.onKilled(); return; }
    kills++;
    const c = COLOR[e.type];
    ctx.fx.burst(e.x, e.y + 0.8 * e.scale, e.z, c, e.type === 'golem' ? 22 : 12, e.type === 'golem' ? 4 : 3, 1, e.type === 'golem' ? 1.6 : 1);
    if (el === 'fuego' || el === 'combo') ctx.fx.burst(e.x, e.y + 0.5, e.z, 0xffa040, 6, 2);
    ctx.onKill(e);
    remove(e);
  }
  function slow(e, k, dur) {
    if (e.isBoss) { if (ctx.boss.mult('hielo') > 0) { e.slowK = Math.max(e.slowK * (e.slowT > 0 ? 1 : 0), k * 0.5); e.slowT = Math.max(e.slowT, dur); } return; }
    if (e.type === 'golem') return;
    if (e.slowT <= 0 || k >= e.slowK) e.slowK = k;
    e.slowT = Math.max(e.slowT, dur);
  }
  function freeze(e, dur) {
    if (e.isBoss || e.type === 'golem') return;
    e.freezeT = Math.max(e.freezeT, dur);
    if (e.state === 'attack') { e.state = 'walk'; e.attackT = 0; }
  }
  function burn(e, dps, dur) { if (multOf(e, 'fuego') <= 0) return; e.burnDps = Math.max(e.burnT > 0 ? e.burnDps : 0, dps); e.burnT = Math.max(e.burnT, dur); }
  function stun(e, dur) { if (e.isBoss) return; e.stunT = Math.max(e.stunT, dur); }

  /** El imp herido salta dos baldosas hacia adelante. */
  function blink(e) {
    e.blinkUsed = true;
    const W = ctx.W;
    ctx.fx.burst(e.x, 0.6, e.z, 0xff7a3a, 8, 2.5);
    let c = e.tc, r = e.tr;
    for (let i = 0; i < 2; i++) { const nx = W.next(c, r); if (!nx) break; c = nx.c; r = nx.r; }
    const w = toWorld(c, r);
    e.x = w.x; e.z = w.z;
    const nx = W.next(c, r); if (nx) { e.tc = nx.c; e.tr = nx.r; } else { e.tc = c; e.tr = r; }
    { const tw = toWorld(e.tc, e.tr), dd = W.distAt(e.tc, e.tr); e.remain = (dd < 0 ? 60 : dd) * TILE + Math.hypot(tw.x - e.x, tw.z - e.z); }
    ctx.fx.burst(e.x, 0.6, e.z, 0xffc040, 10, 3);
    ctx.sfx.blink();
    ctx.popup(e, 1.6, '¡SALTO!', '#ffb070');
  }

  /** Avanza un enemigo de tierra por el campo de flujo. Devuelve true si llegó al cristal. */
  function moveGround(e, dt, spd) {
    const W = ctx.W;
    let left = spd * dt;
    for (let guard = 0; guard < 4 && left > 0; guard++) {
      const w = toWorld(e.tc, e.tr);
      const dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz);
      if (d > 0.001) { const ty = Math.atan2(dx, dz); let dy = ty - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 10); }
      if (d > left) { e.x += dx / d * left; e.z += dz / d * left; left = 0; break; }
      e.x = w.x; e.z = w.z; left -= d;
      if (e.tc === W.crystal.c && e.tr === W.crystal.r) return true;
      const nx = W.next(e.tc, e.tr, e.pdc, e.pdr);
      if (!nx) {
        // baldosa sin camino (puente levantado bajo los pies): cae al río
        if (W.distAt(e.tc, e.tr) < 0) { e.fell = true; return false; }
        return false;
      }
      e.pdc = nx.c - e.tc; e.pdr = nx.r - e.tr; e.tc = nx.c; e.tr = nx.r;
    }
    const w = toWorld(e.tc, e.tr);
    const dd = W.distAt(e.tc, e.tr);
    e.remain = (dd < 0 ? 60 : dd) * TILE + Math.hypot(w.x - e.x, w.z - e.z);
    return false;
  }

  function update(dt) {
    t += dt;
    const W = ctx.W;
    for (const a of W.aux) a.threat = Math.max(0, a.threat - dt);
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e || !e.alive) continue;
      if (e.isBoss) continue; // el Titán se mueve en boss.js
      e.flash = Math.max(0, e.flash - dt);
      e.spawnT = Math.max(0, e.spawnT - dt);
      e.comboCd = Math.max(0, e.comboCd - dt);
      e.shredT = Math.max(0, e.shredT - dt);
      e.shieldT = Math.max(0, e.shieldT - dt); e.shieldCd = Math.max(0, e.shieldCd - dt);
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowK = 0; }
      if (e.freezeT > 0) e.freezeT -= dt;
      if (e.stunT > 0) e.stunT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.btick -= dt;
        if (e.btick <= 0) { e.btick = 0.25; damage(e, e.burnDps * 0.25, 'fuego'); if (!e.alive) continue; if (Math.random() < 0.5) ctx.fx.burst(e.x, 0.9 * e.scale, e.z, 0xff8a30, 2, 1.2, 1, 0.7, 0.4); }
      }
      const held = e.freezeT > 0 || e.stunT > 0;
      let spd = held ? 0 : e.speed * (1 - e.slowK);
      // comportamientos
      if (e.type === 'golem' && !held) {
        e.abilityT -= dt;
        if (e.abilityT <= 0) { e.abilityT = 7; ctx.towers.golemStomp(e); }
      }
      if (e.type === 'imp' && !held) {
        if (e.state === 'attack') {
          spd = 0;
          e.attackT -= dt;
          const a = e.auxTarget;
          if (!a || !a.alive || e.attackT <= 0) { e.state = 'walk'; e.abilityT = 6; e.auxTarget = null; }
          else {
            ctx.hurtAux(a, AUX.imp * dt);
            const ty = Math.atan2(a.x - e.x, a.z - e.z); e.yaw = ty;
            e.tick -= dt; if (e.tick <= 0) { e.tick = 0.3; ctx.fx.burst(a.x, 1.1, a.z, 0xff7a30, 3, 1.6); ctx.fx.burst(e.x, 1, e.z, 0xffc040, 1, 1); }
          }
        } else {
          e.abilityT -= dt;
          if (e.abilityT <= 0) {
            e.abilityT = 0.5;
            for (const a of W.aux) if (a.alive && (a.x - e.x) ** 2 + (a.z - e.z) ** 2 < 5.6 * 5.6) { e.state = 'attack'; e.attackT = 2.2; e.auxTarget = a; ctx.popup(a, 2.4, '¡IMP!', '#ff9a5a'); break; }
          }
        }
      }
      if (e.fly) {
        e.fu += spd * dt;
        const k = e.fu, wv = Math.sin(e.phase + k * 0.35) * 0.9;
        e.x = e.fsx + e.fdx * k - e.fdz * wv; e.z = e.fsz + e.fdz * k + e.fdx * wv;
        e.y = 2.8 + Math.sin(t * 3 + e.phase) * 0.25;
        e.remain = e.flen - k;
        if (k >= e.flen) { ctx.onLeak(e); remove(e); continue; }
      } else if (spd > 0) {
        if (moveGround(e, dt, spd)) { ctx.onLeak(e); remove(e); continue; }
        if (e.fell) { e.fell = false; ctx.fx.burst(e.x, 0.2, e.z, 0x9ad0ff, 12, 3); ctx.popup(e, 1.2, '¡AL AGUA!', '#9ad0ff'); kill(e, 'combo'); continue; }
      }
      // drenaje de cristales auxiliares al pasar cerca
      if (!e.fly) for (const a of W.aux) if (a.alive && (a.x - e.x) ** 2 + (a.z - e.z) ** 2 < 2.7 * 2.7) ctx.hurtAux(a, AUX.touch * dt);
    }
  }

  const camQ = new THREE.Quaternion();
  function render(camera) {
    camQ.copy(camera.quaternion);
    _right.set(1, 0, 0).applyQuaternion(camQ);
    const counts = { trasgo: 0, imp: 0, golem: 0, caballero: 0, volador: 0 };
    let ns = 0, nb = 0, nsh = 0, ni = 0;
    for (const e of list) {
      if (!e.alive) continue;
      const h = (HEIGHT[e.type] || 2) * e.scale;
      if (!e.isBoss) {
        const im = meshes[e.type], i = /** @type {any} */ (counts)[e.type]++;
        const moving = e.freezeT <= 0 && e.stunT <= 0 && e.state !== 'attack';
        const bob = e.fly ? 0 : moving ? Math.abs(Math.sin(t * e.speed * 3.2 + e.phase)) * 0.12 : 0;
        const grow = 1 - e.spawnT * 1.6;
        const roll = e.fly ? Math.sin(t * 2 + e.phase) * 0.25 : moving ? Math.sin(t * e.speed * 3.2 + e.phase) * 0.08 : 0;
        _q.setFromEuler(_e.set(0, e.yaw, roll, 'YXZ'));
        const sc = e.scale * Math.max(0.2, grow);
        im.setMatrixAt(i, _m.compose(_p.set(e.x, e.y + bob, e.z), _q, _s.set(e.fly ? sc * (1 + Math.sin(t * 10 + e.phase) * 0.28) : sc, sc, sc)));
        if (e.flash > 0) _c.setRGB(2.2, 2.2, 2.2);
        else if (e.freezeT > 0) _c.setRGB(0.75, 1.05, 1.7);
        else if (e.stunT > 0) _c.setRGB(1.5, 1.5, 0.7);
        else if (e.burnT > 0) _c.setRGB(1.5, 0.85, 0.55);
        else if (e.slowT > 0) _c.setRGB(0.8, 0.95, 1.35);
        else if (e.shredT > 0) _c.setRGB(1.3, 0.75, 1.3);
        else if (e.elite) _c.setRGB(1.25, 1.1, 0.75);
        else _c.setRGB(1, 1, 1);
        im.setColorAt(i, _c);
        if (e.shieldT > 0 && nsh < 40) { shields.setMatrixAt(nsh++, _m.compose(_p.set(e.x, 0, e.z), _q.identity(), _s.setScalar(1.15 * e.scale))); }
        if (e.freezeT > 0 && ni < 60) { _q.setFromEuler(_e.set(0.3, e.phase, 0.2)); ices.setMatrixAt(ni++, _m.compose(_p.set(e.x, 0.7 * e.scale, e.z), _q, _s.set(0.75 * e.scale, 1.0 * e.scale, 0.75 * e.scale))); }
      }
      if (ns < TOTAL) shadows.setMatrixAt(ns++, _m.compose(_p.set(e.x, 0.04, e.z), _q.identity(), _s.setScalar(e.rad * (e.fly ? 0.9 : 1.1))));
      if (e.hp < e.max && nb < TOTAL) {
        const w = e.isBoss ? 0 : 1.1 * Math.min(1.4, e.scale), ratio = Math.max(0, e.hp / e.max);
        if (w > 0) {
          const y = e.y + h + 0.25;
          barsBg.setMatrixAt(nb, _m.compose(_p.set(e.x, y, e.z), camQ, _s.set(w + 0.08, 0.2, 1)));
          const off = -(1 - ratio) * w / 2;
          bars.setMatrixAt(nb, _m.compose(_p.set(e.x + _right.x * off, y + _right.y * off, e.z + _right.z * off).addScaledVector(_right, 0), camQ, _s.set(Math.max(0.001, w * ratio), 0.13, 1)));
          bars.setColorAt(nb, _c.set(e.shieldT > 0 ? 0x9ab8ff : ratio > 0.5 ? 0x5aff6a : ratio > 0.25 ? 0xffd23a : 0xff4a3a));
          nb++;
        }
      }
    }
    for (const type in meshes) { const im = meshes[type]; im.count = /** @type {any} */ (counts)[type]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    shadows.count = ns; shadows.instanceMatrix.needsUpdate = true;
    barsBg.count = bars.count = nb; barsBg.instanceMatrix.needsUpdate = true; bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
    shields.count = nsh; shields.instanceMatrix.needsUpdate = true;
    ices.count = ni; ices.instanceMatrix.needsUpdate = true;
  }

  function clear() { for (const e of list) e.alive = false; list.length = 0; }
  function dispose() { root.removeFromParent(); geos.forEach(g => g.dispose()); for (const k in meshes) meshes[k].dispose(); [barBgMat, barMat, shieldMat, iceMat].forEach(m => m.dispose()); [shadows, barsBg, bars, shields, ices].forEach(m => m.dispose()); }

  return {
    list, spawn, addExternal, remove, damage, multOf, slow, freeze, burn, stun, update, render, clear, dispose, moveGround,
    get kills() { return kills; }, resetKills() { kills = 0; },
    counts() { const c = { total: 0, ground: 0, air: 0 }; for (const e of list) if (e.alive) { c.total++; if (e.fly) c.air++; else c.ground++; } return c; },
    HEIGHT,
  };
}
