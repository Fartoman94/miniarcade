// @ts-check
/* Bastiones Elementales — torres (construir, mejorar, vender, reubicar), apuntado por prioridad, proyectiles en pool
   y sinergias elementales: choque térmico (fuego+hielo), conducción (hielo+rayo) y sobrecarga (fuego+rayo). */
import * as THREE from 'three';
import { TOWERS, SELL_RATIO } from './config.js';
import * as M from './models.js';
import { toWorld } from './world.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const ACC = { ballesta: 0xe8d8a8, fuego: 0xff6a2a, hielo: 0x7fd8ff, rayo: 0xffe14a };

/** @param {any} ctx */
export function createTowers(ctx) {
  const { scene, mats } = ctx;
  const root = new THREE.Group(); root.name = 'torres'; scene.add(root);
  /** @type {THREE.BufferGeometry[]} */ const geos = [];
  /** @type {Record<string, any>} */ const cache = {};
  const geo = (key, fn) => { if (!cache[key]) { cache[key] = fn(); for (const k in cache[key]) if (cache[key][k] && cache[key][k].isBufferGeometry) geos.push(cache[key][k]); } return cache[key]; };
  const iceGeo = M.buildIceBlock(); geos.push(iceGeo);
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.1, flatShading: true, depthWrite: false });
  const stunGeo = new THREE.TorusGeometry(0.8, 0.06, 6, 24); stunGeo.rotateX(Math.PI / 2); geos.push(stunGeo);
  const stunMat = new THREE.MeshBasicMaterial({ color: 0xfff080, toneMapped: false, transparent: true, opacity: 0.85 });

  /** @type {any[]} */ const list = [];

  function build(pad, type, free = false) {
    const T = /** @type {any} */ (TOWERS)[type];
    const t = {
      id: Math.random().toString(36).slice(2, 7), pad, type, def: T, lv: 0, cd: 0.4, prio: 'primero', yaw: 0, target: /** @type {any} */ (null), retarget: 0,
      frozenT: 0, stunT: 0, moveT: 0, riseT: 0.6, invested: free ? 0 : T.lv[0].cost, hits: 0, kills: 0, shots: 0, recoil: 0,
      group: new THREE.Group(), base: /** @type {any} */ (null), head: new THREE.Group(), headMesh: /** @type {any} */ (null), glow: /** @type {any} */ (null),
      ice: new THREE.Mesh(iceGeo, iceMat), stun: new THREE.Mesh(stunGeo, stunMat), top: 1,
    };
    t.ice.visible = false; t.stun.visible = false;
    t.group.add(t.head, t.ice, t.stun);
    t.group.position.set(pad.x, 0, pad.z);
    root.add(t.group);
    pad.tower = t;
    setLevelMeshes(t);
    list.push(t);
    return t;
  }
  function setLevelMeshes(t) {
    if (t.base) t.group.remove(t.base);
    if (t.headMesh) t.head.remove(t.headMesh, t.glow);
    const b = geo('base' + t.lv + t.type, () => { const r = M.buildTowerBase(t.lv, ACC[t.type]); return { geo: r.geo, top: r.top }; });
    const h = geo('head' + t.lv + t.type, () => M.buildTowerHead(t.type, t.lv));
    t.base = new THREE.Mesh(b.geo, mats.solid); t.base.castShadow = true; t.base.receiveShadow = true;
    t.top = b.top;
    t.headMesh = new THREE.Mesh(h.head, t.type === 'ballesta' ? mats.solid : mats.metal); t.headMesh.castShadow = true;
    t.glow = new THREE.Mesh(h.glow, mats.glowV);
    t.head.add(t.headMesh, t.glow);
    t.head.position.y = t.top;
    t.group.add(t.base);
    t.stun.position.y = t.top + 1.4;
  }
  const stats = t => t.def.lv[t.lv];
  const upgradeCost = t => t.lv < 2 ? t.def.lv[t.lv + 1].cost : 0;
  const sellValue = t => Math.floor(t.invested * SELL_RATIO);
  function upgrade(t) {
    if (t.lv >= 2) return false;
    t.invested += upgradeCost(t);
    t.lv++;
    setLevelMeshes(t);
    t.riseT = 0.35;
    ctx.fx.burst(t.pad.x, t.top, t.pad.z, ACC[t.type], 16, 3.5);
    ctx.fx.ring(t.pad.x, t.pad.z, ACC[t.type], 0.4, 2.4, 0.5);
    return true;
  }
  function sell(t) {
    const v = sellValue(t);
    remove(t);
    ctx.fx.burst(t.pad.x, 1, t.pad.z, 0xffd23a, 14, 3);
    return v;
  }
  function remove(t) {
    t.pad.tower = null;
    root.remove(t.group);
    const i = list.indexOf(t); if (i >= 0) list.splice(i, 1);
  }
  function relocate(t, pad) {
    t.pad.tower = null;
    ctx.fx.burst(t.pad.x, 0.6, t.pad.z, 0xc8bcff, 10, 2.5);
    t.pad = pad; pad.tower = t;
    t.group.position.set(pad.x, 0, pad.z);
    t.moveT = 1.0; t.riseT = 1.0; t.target = null;
    ctx.fx.ring(pad.x, pad.z, 0xc8bcff, 0.4, 2.2, 0.6);
  }
  function clear() { for (const t of [...list]) remove(t); }

  /* ---------- apuntado ---------- */
  function canHit(t, e) {
    if (!e.alive || e.dying) return false;
    if (e.fly ? !t.def.air : !t.def.ground) return false;
    return ctx.enemies.multOf(e, t.def.el) > 0 || (t.type === 'hielo' && e.burnT > 0);
  }
  function acquire(t) {
    const st = stats(t), r2 = st.range * st.range;
    let best = null, bv = Infinity;
    for (const e of ctx.enemies.list) {
      if (!canHit(t, e)) continue;
      const dx = e.x - t.pad.x, dz = e.z - t.pad.z, d2 = dx * dx + dz * dz;
      if (d2 > r2) continue;
      const v = t.prio === 'fuerte' ? -e.hp : t.prio === 'cerca' ? d2 : e.remain;
      if (v < bv) { bv = v; best = e; }
    }
    return best;
  }

  /* ---------- proyectiles ---------- */
  const KIND = {
    bolt: { geo: M.buildBolt(), cap: 90, speed: 34 },
    fire: { geo: M.buildFireball(), cap: 40, speed: 0 },
    shard: { geo: M.buildShard(), cap: 70, speed: 26 },
  };
  /** @type {Record<string, THREE.InstancedMesh>} */ const pm = {};
  /** @type {Record<string, any[]>} */ const pp = {};
  for (const k in KIND) {
    const K = /** @type {any} */ (KIND)[k]; geos.push(K.geo);
    const im = new THREE.InstancedMesh(K.geo, mats.glowV, K.cap); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.count = 0; im.frustumCulled = false;
    root.add(im); pm[k] = im;
    pp[k] = Array.from({ length: K.cap }, () => ({ on: false }));
  }
  function shoot(kind, t, e, extra = {}) {
    const p = pp[kind].find(x => !x.on); if (!p) return;
    const sx = t.pad.x, sy = t.top + 0.7, sz = t.pad.z;
    Object.assign(p, { on: true, kind, t, e, x: sx, y: sy, z: sz, life: 2, ...extra });
    if (kind === 'fire') {
      // tiro parabólico al punto predicho
      const dur = 0.45 + Math.hypot(e.x - sx, e.z - sz) * 0.035;
      let tx = e.x, tz = e.z;
      if (!e.isBoss && e.freezeT <= 0 && e.stunT <= 0 && e.state !== 'attack') {
        // anticipa hacia la próxima baldosa del camino
        const w = toWorld(e.tc, e.tr), dx = w.x - e.x, dz = w.z - e.z, d = Math.hypot(dx, dz) || 1;
        const ahead = Math.min(d, e.speed * (1 - e.slowK) * dur);
        tx += dx / d * ahead; tz += dz / d * ahead;
      }
      p.sx = sx; p.sy = sy; p.sz = sz; p.tx = tx; p.tz = tz; p.u = 0; p.dur = dur;
    }
  }

  /* ---------- sinergias ---------- */
  function thermal(e, lv) {
    if (e.comboCd > 0) return false;
    e.comboCd = 1.2; e.shredT = 4.5;
    e.slowT = 0; e.slowK = 0; e.freezeT = 0; e.burnT = 0;
    ctx.fx.burst(e.x, 1, e.z, 0xffffff, 14, 4); ctx.fx.burst(e.x, 1, e.z, 0x9ad8ff, 8, 3);
    ctx.popup(e, 2.4 * e.scale, 'CHOQUE TÉRMICO', '#ffd0f0');
    ctx.onCombo('termico');
    ctx.enemies.damage(e, 34 + 14 * lv, 'combo');
    return true;
  }
  function hitFire(p) {
    const st = p.st, splash = st.splash;
    ctx.fx.burst(p.tx, 0.4, p.tz, 0xff8a30, 12, 3.2);
    ctx.fx.ring(p.tx, p.tz, 0xff7a30, 0.3, splash, 0.35);
    ctx.sfx.boom();
    for (const e of [...ctx.enemies.list]) {
      if (!e.alive || e.fly) continue;
      const dx = e.x - p.tx, dz = e.z - p.tz, rr = splash + (e.rad || 0.5);
      if (dx * dx + dz * dz > rr * rr) continue;
      if ((e.freezeT > 0 || e.slowT > 0) && thermal(e, p.lv)) { if (!e.alive) { p.t.kills++; continue; } }
      ctx.enemies.damage(e, st.dmg, 'fuego');
      if (e.alive) ctx.enemies.burn(e, st.burn, 3); else p.t.kills++;
    }
  }
  function hitIce(p, e) {
    const st = p.st;
    const targets = st.splash ? ctx.enemies.list.filter(x => x.alive && (x.x - e.x) ** 2 + (x.z - e.z) ** 2 < st.splash * st.splash) : [e];
    ctx.fx.burst(e.x, e.y + 1, e.z, 0xbff0ff, 8, 2.4);
    for (const x of targets) {
      if (!x.alive) continue;
      if (x.burnT > 0 && thermal(x, p.lv)) { if (!x.alive) continue; }
      ctx.enemies.damage(x, st.dmg, 'hielo');
      if (!x.alive) { p.t.kills++; continue; }
      if (ctx.enemies.multOf(x, 'hielo') > 0) {
        ctx.enemies.slow(x, st.slow, 2.2);
        if (x === e) { p.t.hits++; if (p.t.hits % st.freezeEvery === 0) { ctx.enemies.freeze(x, 1.1); if (x.freezeT > 0) ctx.sfx.freeze(); } }
      }
    }
  }
  function zap(t, first) {
    const st = stats(t);
    let dmg = st.dmg, chain = st.chain;
    const hit = new Set();
    let cur = first, px = t.pad.x, py = t.top + 1.4, pz = t.pad.z;
    for (let j = 0; j <= chain && cur; j++) {
      hit.add(cur);
      const ey = cur.y + (cur.isBoss ? 4 : 0.9 * (cur.scale || 1));
      ctx.fx.bolt(px, py, pz, cur.x, ey, cur.z, 0.14);
      let d = dmg;
      if ((cur.freezeT > 0 || cur.slowT > 0) && cur.comboCd <= 0) {
        cur.comboCd = 1.2; d *= 1.6; if (j === 0) chain++;
        ctx.popup(cur, 2.3 * (cur.scale || 1), 'CONDUCCIÓN', '#bff6ff'); ctx.onCombo('conduccion');
      }
      if (cur.burnT > 0 && cur.comboCd <= 0) {
        cur.comboCd = 1.2; cur.burnT = 0;
        ctx.popup(cur, 2.3 * (cur.scale || 1), 'SOBRECARGA', '#ffe08a'); ctx.onCombo('sobrecarga');
        ctx.fx.burst(cur.x, 1, cur.z, 0xffd040, 16, 4.5); ctx.fx.ring(cur.x, cur.z, 0xffd040, 0.3, 2.4, 0.35);
        for (const o of [...ctx.enemies.list]) if (o !== cur && o.alive && !o.fly && (o.x - cur.x) ** 2 + (o.z - cur.z) ** 2 < 2.4 * 2.4) { ctx.enemies.damage(o, 22 + 10 * t.lv, 'combo'); if (!o.alive) t.kills++; }
      }
      ctx.enemies.damage(cur, d, 'rayo');
      if (!cur.alive) t.kills++;
      else if (st.stun) ctx.enemies.stun(cur, st.stun);
      px = cur.x; py = ey; pz = cur.z;
      dmg *= 0.75;
      // siguiente eslabón: el más cercano no golpeado
      let nb = null, bd = 4.6 * 4.6;
      for (const o of ctx.enemies.list) {
        if (!o.alive || hit.has(o) || ctx.enemies.multOf(o, 'rayo') <= 0) continue;
        const d2 = (o.x - px) ** 2 + (o.z - pz) ** 2;
        if (d2 < bd) { bd = d2; nb = o; }
      }
      cur = nb;
    }
    ctx.sfx.zap();
  }

  /* ---------- gólem: congela una torre ---------- */
  function golemStomp(g) {
    let best = null, bd = 5.5 * 5.5;
    for (const t of list) { if (t.frozenT > 0) continue; const d2 = (t.pad.x - g.x) ** 2 + (t.pad.z - g.z) ** 2; if (d2 < bd) { bd = d2; best = t; } }
    if (!best) return;
    const tw = best;
    ctx.fx.ring(tw.pad.x, tw.pad.z, 0x6ad0ff, 2.2, 2.2, 1.0);
    ctx.fx.ring(g.x, g.z, 0x9ae0ff, 0.5, 3, 0.6);
    ctx.popup(tw.pad, tw.top + 1.5, '¡PISOTÓN HELADO!', '#9ae0ff');
    ctx.sfx.warn();
    ctx.later(1.0, () => { if (list.includes(tw)) { tw.frozenT = 3; ctx.fx.burst(tw.pad.x, 1.4, tw.pad.z, 0xbff0ff, 16, 3); ctx.sfx.freeze(); } });
  }
  /** Pulso del Titán: aturde torres en radio. */
  function stunArea(x, z, rad, dur) {
    let n = 0;
    for (const t of list) if ((t.pad.x - x) ** 2 + (t.pad.z - z) ** 2 < rad * rad) { t.stunT = Math.max(t.stunT, dur); n++; }
    return n;
  }

  /* ---------- actualización ---------- */
  function update(dt) {
    for (const t of list) {
      t.frozenT = Math.max(0, t.frozenT - dt); t.stunT = Math.max(0, t.stunT - dt); t.moveT = Math.max(0, t.moveT - dt);
      t.cd -= dt; t.recoil = Math.max(0, t.recoil - dt * 4);
      if (t.frozenT > 0 || t.stunT > 0 || t.moveT > 0) continue;
      t.retarget -= dt;
      const st = stats(t);
      if (!t.target || !t.target.alive || t.retarget <= 0 || (t.target.x - t.pad.x) ** 2 + (t.target.z - t.pad.z) ** 2 > st.range * st.range) {
        t.target = acquire(t); t.retarget = 0.12;
      }
      const e = t.target;
      if (!e) continue;
      const ty = Math.atan2(e.x - t.pad.x, e.z - t.pad.z);
      let dy = ty - t.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      t.yaw += dy * Math.min(1, dt * 12);
      if (t.cd > 0) continue;
      t.cd = 1 / st.rate; t.shots++; t.recoil = 1;
      if (t.type === 'ballesta') {
        shoot('bolt', t, e, { st, lv: t.lv });
        if (st.multi) { const o = ctx.enemies.list.find(x => x !== e && canHit(t, x) && (x.x - t.pad.x) ** 2 + (x.z - t.pad.z) ** 2 < st.range * st.range); if (o) shoot('bolt', t, o, { st, lv: t.lv }); }
        ctx.sfx.bolt();
      } else if (t.type === 'fuego') { shoot('fire', t, e, { st, lv: t.lv }); ctx.sfx.fire(); }
      else if (t.type === 'hielo') { shoot('shard', t, e, { st, lv: t.lv }); ctx.sfx.ice(); }
      else zap(t, e);
    }
    // proyectiles
    for (const k in pp) for (const p of pp[k]) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (k === 'fire') {
        p.u += dt / p.dur;
        const u = Math.min(1, p.u);
        p.x = p.sx + (p.tx - p.sx) * u; p.z = p.sz + (p.tz - p.sz) * u; p.y = p.sy + (0.3 - p.sy) * u + Math.sin(u * Math.PI) * 3.2;
        if (u >= 1) { p.on = false; hitFire(p); }
        continue;
      }
      const e = p.e;
      const ey = e.isBoss ? 4 : e.y + 0.9 * (e.scale || 1);
      if (!e.alive) { p.on = false; continue; }
      _v.set(e.x - p.x, ey - p.y, e.z - p.z);
      const d = _v.length(), step = /** @type {any} */ (KIND)[k].speed * dt;
      p.dx = _v.x / (d || 1); p.dy = _v.y / (d || 1); p.dz = _v.z / (d || 1);
      if (d <= step + 0.3) {
        p.on = false;
        if (k === 'bolt') {
          const dm = ctx.enemies.damage(e, p.st.dmg * (e.fly ? 1.5 : 1), 'piedra');
          ctx.fx.burst(e.x, ey, e.z, dm > 0 ? 0xe8d8a8 : 0x888888, 3, 2);
          if (!e.alive) p.t.kills++;
        } else hitIce(p, e);
      } else { p.x += p.dx * step; p.y += p.dy * step; p.z += p.dz * step; }
    }
  }

  let time = 0;
  function render(dt, reduced) {
    time += dt;
    for (const t of list) {
      t.riseT = Math.max(0, t.riseT - dt);
      const sink = t.moveT > 0 ? Math.sin((1 - t.moveT) * Math.PI) * -0.6 : -t.riseT * 1.2;
      t.group.position.y = sink;
      t.head.rotation.y = t.yaw;
      t.headMesh.position.z = -t.recoil * 0.12;
      const k = t.frozenT > 0 || t.stunT > 0 ? 0.3 : 1;
      if (t.type === 'fuego') { const f = 1 + Math.sin(time * 14 + t.pad.i) * 0.08 * k; t.glow.scale.set(f, f * (1 + t.recoil * 0.25), f); }
      else if (t.type === 'hielo') t.glow.rotation.y += dt * 1.2 * k;
      else if (t.type === 'rayo') t.glow.scale.setScalar(k * (1 + (reduced ? 0 : Math.sin(time * 20 + t.pad.i) * 0.06)));
      t.glow.visible = t.frozenT <= 0;
      t.ice.visible = t.frozenT > 0;
      if (t.ice.visible) t.ice.scale.setScalar(Math.min(1, (3 - t.frozenT) * 5) * (0.9 + t.lv * 0.12));
      t.stun.visible = t.stunT > 0;
      if (t.stun.visible) t.stun.rotation.y += dt * 6;
    }
    for (const k in pp) {
      const im = pm[k]; let n = 0;
      for (const p of pp[k]) {
        if (!p.on) continue;
        if (k === 'fire') _q.setFromEuler(_e.set(time * 8, time * 6, 0));
        else _q.setFromUnitVectors(_p.set(0, 0, 1), _v.set(p.dx || 0, p.dy || 0, p.dz || 1));
        im.setMatrixAt(n++, _m.compose(_p.set(p.x, p.y, p.z), _q, _s.setScalar(1 + (p.lv || 0) * 0.15)));
      }
      im.count = n; im.instanceMatrix.needsUpdate = true;
    }
  }
  function clearShots() { for (const k in pp) for (const p of pp[k]) p.on = false; }
  function dispose() { root.removeFromParent(); geos.forEach(g => g.dispose()); iceMat.dispose(); stunMat.dispose(); for (const k in pm) pm[k].dispose(); }

  return {
    list, build, upgrade, sell, relocate, clear, clearShots, update, render, dispose, golemStomp, stunArea,
    stats, upgradeCost, sellValue,
    shots: () => { let n = 0; for (const k in pp) for (const p of pp[k]) if (p.on) n++; return n; },
  };
}
