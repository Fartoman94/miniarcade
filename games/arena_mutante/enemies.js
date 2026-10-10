// @ts-check
/* Mutantes: corredor, bruto, escupidor tóxico y acechador invisible.
   Cada uno tiene silueta, patrón y contrajuego propios, con aviso (telegrafía) antes de atacar:
   - Corredor: se agacha (destello rojo) y salta; rodar lo esquiva y queda expuesto al aterrizar.
   - Bruto: blindaje frontal (×0,35), embestida marcada con una línea; si choca contra una pared queda aturdido
     y el tumor de la espalda recibe ×1,6. Rompe barricadas.
   - Escupidor: mantiene distancia, marca en el piso dónde cae el ácido; al morir se infla y libera gas.
   - Acechador: casi invisible; se revela al recibir un tiro o con el Pulso y avisa (ojos + siseo) antes del zarpazo.
   Corredores, brutos y escupidores se dibujan con InstancedMesh por parte (5 draw calls por tipo). */
import * as THREE from 'three';
import { ENEMY } from './config.js';
import * as M from './models.js';
import { createPool } from './fx.js';

const CAP = { runner: 26, brute: 6, spitter: 10, stalker: 6 };
const PARTS = ['body', 'armL', 'armR', 'legL', 'legR'];

export function createEnemies(ctx) {
  const group = new THREE.Group(); group.name = 'mutantes'; ctx.root.add(group);
  const models = { runner: M.buildRunner(), brute: M.buildBrute(), spitter: M.buildSpitter(), stalker: M.buildStalker() };
  /** @type {Record<string, Record<string, THREE.InstancedMesh>>} */
  const inst = {};
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const white = new THREE.Color(1, 1, 1);
  for (const type of ['runner', 'brute', 'spitter']) {
    inst[type] = {};
    for (const p of PARTS) {
      const im = new THREE.InstancedMesh(/** @type {any} */ (models)[type][p].geo, ctx.mats.vc, CAP[/** @type {'runner'} */ (type)]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = true; im.frustumCulled = false; im.name = type + ':' + p;
      for (let i = 0; i < im.count; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, white); }
      group.add(im); inst[type][p] = im;
    }
  }
  // acechadores: mallas propias con material transparente por individuo (invisibilidad independiente)
  const stalkerSlots = [];
  for (let i = 0; i < CAP.stalker; i++) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.08, emissive: 0x000000 });
    const g = new THREE.Group(); g.visible = false;
    /** @type {Record<string, THREE.Mesh>} */ const parts = {};
    for (const p of PARTS) {
      const pm = /** @type {any} */ (models.stalker)[p];
      const holder = new THREE.Group(); holder.position.fromArray(pm.pivot);
      const mesh = new THREE.Mesh(pm.geo, mat); holder.add(mesh); g.add(holder); parts[p] = /** @type {any} */ (holder);
    }
    group.add(g);
    stalkerSlots.push({ g, mat, parts, used: false });
  }

  /** @type {any[]} */ const all = [];
  const slotsUsed = { runner: new Uint8Array(CAP.runner), brute: new Uint8Array(CAP.brute), spitter: new Uint8Array(CAP.spitter) };

  // proyectiles (ácido del escupidor, escombros del Coloso) y charcos
  const blobGeo = new THREE.IcosahedronGeometry(0.28, 1);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const blobs = createPool(group, { count: 30, geometry: blobGeo, material: blobMat, name: 'proyectiles' });
  /** @type {any[]} */ const projs = [];
  const puddleGeo = new THREE.CircleGeometry(1, 18); puddleGeo.rotateX(-Math.PI / 2);
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x7dff3a, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const puddlePool = createPool(group, { count: 24, geometry: puddleGeo, material: puddleMat, name: 'charcos' });
  /** @type {{x:number,z:number,r:number,t:number,max:number,dps:number,i:number}[]} */ const puddles = [];

  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _to = new THREE.Vector3(), _m = new THREE.Matrix4(), _pm = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const _e = new THREE.Euler(), Y = new THREE.Vector3(0, 1, 0);

  function allocSlot(type) {
    if (type === 'stalker') { const i = stalkerSlots.findIndex(s => !s.used); if (i >= 0) stalkerSlots[i].used = true; return i; }
    const u = /** @type {any} */ (slotsUsed)[type];
    for (let i = 0; i < u.length; i++) if (!u[i]) { u[i] = 1; return i; }
    return -1;
  }
  function freeSlot(e) {
    if (e.type === 'stalker') { const s = stalkerSlots[e.slot]; s.used = false; s.g.visible = false; return; }
    /** @type {any} */ (slotsUsed)[e.type][e.slot] = 0;
    for (const p of PARTS) { const im = inst[e.type][p]; im.setMatrixAt(e.slot, zero); im.instanceMatrix.needsUpdate = true; }
  }

  /** @param {string} type @param {THREE.Vector3} pos */
  function spawn(type, pos, opts = {}) {
    const st = /** @type {any} */ (ENEMY)[type]; if (!st) return null;
    const slot = allocSlot(type); if (slot < 0) return null;
    const D = ctx.diff;
    const e = {
      type, slot, alive: true, pos: pos.clone(), push: new THREE.Vector3(), dir: new THREE.Vector3(), lock: new THREE.Vector3(), yaw: Math.random() * 6.28,
      hp: st.hp * D.enemyHp, max: st.hp * D.enemyHp, radius: st.radius, height: st.height, speed: st.speed * D.enemySpeed * (0.92 + Math.random() * 0.16),
      state: 'spawn', t: 0, cd: 0.6 + Math.random(), cd2: 2 + Math.random() * 2, phase: Math.random() * 6, flash: 0, hitDone: false, stun: 0,
      revealed: 0, alpha: type === 'stalker' ? 0.08 : 1, target: opts.target || 'player', bash: 0, swell: 0, id: Math.random(), sub: '',
    };
    if (type === 'stalker') stalkerSlots[slot].g.visible = true;
    all.push(e);
    return e;
  }

  function kill(e, cause = '') {
    if (!e.alive) return;
    e.alive = false;
    freeSlot(e);
    const i = all.indexOf(e); if (i >= 0) all.splice(i, 1);
    if (cause !== 'clear') {
      const col = e.type === 'stalker' ? 0x6a9aff : e.type === 'brute' ? 0xa86a4a : 0x8dff3a;
      ctx.fx.gore.burst(e.pos.x, e.height * 0.5, e.pos.z, ctx.reduced ? 10 : 22, col, 6, 0.9, 12, 0.4);
      ctx.fx.sparks.burst(e.pos.x, e.height * 0.6, e.pos.z, 10, 0xb6ff3a, 4, 0.4, 2, 0.3);
      if (cause !== 'debug') ctx.hooks.onKill(e, cause);
    }
  }

  /** Daño con dirección (para el blindaje del bruto). Devuelve 'kill' | 'armor' | 'weak' | 'hit'. */
  function damage(e, amount, from, crit = false) {
    if (!e.alive || e.state === 'spawn' && e.t < 0.25) return 'none';
    let mul = 1, res = 'hit';
    if (e.type === 'brute') {
      _v.set(from.x - e.pos.x, 0, from.z - e.pos.z).normalize();
      const front = Math.sin(e.yaw) * _v.x + Math.cos(e.yaw) * _v.z;
      if (e.state === 'stun') { mul = 1.6; res = 'weak'; }
      else if (front > 0.25) { mul = 0.35; res = 'armor'; }
      else if (front < -0.35) { mul = 1.6; res = 'weak'; }
    }
    if (crit) mul *= 1.6;
    e.hp -= amount * mul;
    e.flash = 0.08;
    if (e.type === 'stalker') e.revealed = Math.max(e.revealed, 2.5);
    if (e.type === 'runner' && e.state === 'move') e.push.addScaledVector(_v.set(e.pos.x - from.x, 0, e.pos.z - from.z).normalize(), 2.5);
    if (e.hp <= 0) {
      if (e.type === 'spitter') { startSwell(e); return 'kill'; }
      kill(e, 'shot'); return 'kill';
    }
    return res;
  }
  function startSwell(e) {
    if (e.state === 'swell') return;
    e.state = 'swell'; e.t = 0; e.hp = 0;
    ctx.fx.tele.zone(e.pos.x, e.pos.z, 2.7, 0.6, 0x9dff3a);
    ctx.sfx.swell(e.pos);
    ctx.hooks.onKill(e, 'shot');
    e.counted = true;
  }

  /* ---------- proyectiles ---------- */
  /** Lanza un proyectil parabólico de a hacia b en `time` s. */
  function lob(kind, a, b, time, dmg, splash, puddle, onImpact = null) {
    const i = blobs.alloc(); if (i < 0) return;
    const g = 14;
    const vel = new THREE.Vector3((b.x - a.x) / time, 0, (b.z - a.z) / time);
    vel.y = ((b.y || 0) - a.y + 0.5 * g * time * time) / time;
    projs.push({ kind, i, pos: a.clone(), vel, t: 0, time, dmg, splash, puddle, g, scale: kind === 'rock' ? 2.6 : 1, onImpact });
    blobs.color(i, _c.setHex(kind === 'rock' ? 0x8a7a6a : 0x9dff3a));
  }
  function addPuddle(x, z, r, life, dps) {
    const i = puddlePool.alloc(); if (i < 0) return;
    puddles.push({ x, z, r, t: life, max: life, dps, i });
    _m.compose(_v.set(x, 0.06 + puddles.length * 0.002, z), _q.identity(), _s.set(r, 1, r)); puddlePool.set(i, _m);
  }
  function updateProjectiles(dt) {
    for (let k = projs.length - 1; k >= 0; k--) {
      const p = projs[k];
      p.t += dt; p.vel.y -= p.g * dt; p.pos.addScaledVector(p.vel, dt);
      _m.compose(p.pos, _q.identity(), _s.setScalar(p.scale)); blobs.set(p.i, _m);
      if (p.pos.y <= 0.15 || p.t > p.time + 0.5) {
        blobs.free(p.i); projs.splice(k, 1);
        const P = ctx.player;
        const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z;
        if (dx * dx + dz * dz < p.splash * p.splash) ctx.hooks.hurtPlayer(p.dmg, p.pos, p.kind);
        const S = ctx.survivor;
        if (S && S.alive && S.following && (S.pos.x - p.pos.x) ** 2 + (S.pos.z - p.pos.z) ** 2 < p.splash * p.splash) ctx.hooks.hurtSurvivor(p.dmg * 0.6);
        if (p.kind === 'rock') {
          ctx.fx.gore.burst(p.pos.x, 0.3, p.pos.z, ctx.reduced ? 10 : 24, 0x7a6a5a, 7, 0.9, 14, 0.6);
          ctx.sfx.thud(p.pos);
          ctx.hooks.shake(0.35, p.pos);
        } else {
          ctx.fx.sparks.burst(p.pos.x, 0.3, p.pos.z, 14, 0x9dff3a, 4, 0.5, 6, 0.6);
          ctx.sfx.splat(p.pos);
        }
        if (p.puddle) addPuddle(p.pos.x, p.pos.z, p.puddle, 5, 10 * ctx.diff.enemyDmg);
        if (p.onImpact) p.onImpact(p.pos);
      }
    }
    for (let k = puddles.length - 1; k >= 0; k--) {
      const u = puddles[k]; u.t -= dt;
      if (u.t <= 0) { puddlePool.free(u.i); puddles.splice(k, 1); continue; }
      const f = Math.min(1, u.t / 0.6);
      _m.compose(_v.set(u.x, 0.06, u.z), _q.identity(), _s.set(u.r * f, 1, u.r * f)); puddlePool.set(u.i, _m);
      if (Math.random() < dt * 3) ctx.fx.sparks.plume(u.x, 0.1, u.z, 1, 0x7dff3a, u.r, 0.8, 1.2);
    }
  }
  /** Daño por segundo de charcos en un punto. */
  function puddleDps(x, z) {
    let d = 0;
    for (const u of puddles) if ((x - u.x) ** 2 + (z - u.z) ** 2 < u.r * u.r * 0.8) d = Math.max(d, u.dps);
    return d;
  }

  /* ---------- IA ---------- */
  function targetOf(e) {
    const S = ctx.survivor, B = ctx.beacon;
    if (e.target === 'beacon' && B && B.active && B.hp > 0) return B.pos;
    if (S && S.alive && S.following) {
      const ds = (S.pos.x - e.pos.x) ** 2 + (S.pos.z - e.pos.z) ** 2, dp = (ctx.player.pos.x - e.pos.x) ** 2 + (ctx.player.pos.z - e.pos.z) ** 2;
      if (ds < 36 && ds < dp * 0.7) { e.sub = 'survivor'; return S.pos; }
    }
    e.sub = '';
    return ctx.player.pos;
  }
  /** Mueve hacia el objetivo por el campo de flujo (o directo si hay línea de visión cercana). */
  function steer(e, tgt, dt, speedMul, away = false) {
    const W = ctx.W;
    const dx = tgt.x - e.pos.x, dz = tgt.z - e.pos.z, dist = Math.hypot(dx, dz);
    let direct = dist < 9 && W.los(e.pos, tgt, 1.0, true);
    const field = e.target === 'beacon' && ctx.beacon && ctx.beacon.active ? ctx.flow.beacon : ctx.flow.player;
    if (away) { e.dir.set(-dx / (dist || 1), 0, -dz / (dist || 1)); }
    else if (direct || !field) { e.dir.set(dx / (dist || 1), 0, dz / (dist || 1)); }
    else {
      const j = W.flowDir(field, e.pos, _w);
      if (j < 0) e.dir.set(dx / (dist || 1), 0, dz / (dist || 1)); else e.dir.copy(_w);
      // puerta cerrada (con energía) en el camino: golpearla
      if (j >= 0 && W.grid[j] === 3) {
        const d = W.ref[j];
        if (d.state === 'closed' && Math.hypot(W.cx(j % W.cols) - e.pos.x, W.cz((j / W.cols) | 0) - e.pos.z) < CELL_REACH + e.radius) {
          e.bash -= dt;
          if (e.bash <= 0) { e.bash = 1.0; ctx.hooks.bashDoor(d, e.type === 'brute' ? 40 : 14, e); e.flash = 0.05; e.phase += 1.5; }
          return dist;
        }
      }
    }
    const sp = e.speed * speedMul;
    e.pos.x += (e.dir.x * sp + e.push.x) * dt; e.pos.z += (e.dir.z * sp + e.push.z) * dt;
    e.push.multiplyScalar(Math.max(0, 1 - dt * 5));
    const yawT = Math.atan2(away ? -e.dir.x : e.dir.x, away ? -e.dir.z : e.dir.z);
    e.yaw = lerpAngle(e.yaw, yawT, Math.min(1, dt * 8));
    e.phase += dt * sp * 1.6;
    return dist;
  }
  const CELL_REACH = 1.6;

  function faceTo(e, p, dt, k = 10) { e.yaw = lerpAngle(e.yaw, Math.atan2(p.x - e.pos.x, p.z - e.pos.z), Math.min(1, dt * k)); }
  function hitTarget(e, tgt, dmg, kind) {
    if (e.sub === 'survivor') ctx.hooks.hurtSurvivor(dmg);
    else if (e.target === 'beacon' && ctx.beacon && ctx.beacon.active && tgt === ctx.beacon.pos) ctx.hooks.hurtBeacon(dmg);
    else ctx.hooks.hurtPlayer(dmg, e.pos, kind);
  }

  function update(dt) {
    const P = ctx.player, W = ctx.W, D = ctx.diff, tel = D.telegraph;
    for (let k = all.length - 1; k >= 0; k--) {
      const e = all[k];
      if (!e.alive) continue;
      e.t += dt; e.cd -= dt; e.cd2 -= dt; e.flash = Math.max(0, e.flash - dt); e.revealed = Math.max(0, e.revealed - dt);
      if (e.frozen) continue; // sólo pruebas (?debug)
      if (e.state === 'spawn') { if (e.t > 0.7) { e.state = 'move'; e.t = 0; } continue; }
      if (e.state === 'swell') { if (e.t > 0.6) { gasBurst(e); kill(e, 'clear'); } continue; }
      if (e.stun > 0) { e.stun -= dt; if (e.stun <= 0 && e.state === 'stun') { e.state = 'move'; e.t = 0; } if (e.state === 'stun') { e.pos.addScaledVector(e.push, dt); e.push.multiplyScalar(Math.max(0, 1 - dt * 5)); W.collide(e.pos, e.radius); continue; } }
      const tgt = targetOf(e);
      const dx = tgt.x - e.pos.x, dz = tgt.z - e.pos.z, dist = Math.hypot(dx, dz);
      const st = /** @type {any} */ (ENEMY)[e.type], dmg = st.dmg * D.enemyDmg;

      if (e.type === 'runner') {
        if (e.state === 'move') {
          steer(e, tgt, dt, 1);
          if (dist < 5.5 && e.cd <= 0 && W.los(e.pos, tgt, 1.0)) { e.state = 'wind'; e.t = 0; ctx.sfx.screech(e.pos); }
        } else if (e.state === 'wind') {
          faceTo(e, tgt, dt, 12);
          if (e.t > 0.45 * tel) { e.state = 'leap'; e.t = 0; e.hitDone = false; e.lock.set(dx, 0, dz).normalize(); }
        } else if (e.state === 'leap') {
          e.pos.addScaledVector(e.lock, 11 * dt);
          if (!e.hitDone && dist < e.radius + 0.75) { e.hitDone = true; hitTarget(e, tgt, dmg, 'runner'); }
          if (e.t > 0.42) { e.state = 'recover'; e.t = 0; e.cd = 1.6; }
        } else if (e.state === 'recover') { if (e.t > 0.6) { e.state = 'move'; e.t = 0; } }
      } else if (e.type === 'brute') {
        if (e.state === 'move') {
          steer(e, tgt, dt, 1);
          if (dist < 2.7) { e.state = 'wind'; e.t = 0; ctx.sfx.growl(e.pos); }
          else if (e.cd2 <= 0 && dist > 6 && dist < 15 && W.los(e.pos, tgt, 1.2)) {
            e.state = 'cwind'; e.t = 0; e.lock.set(dx, 0, dz).normalize();
            ctx.fx.tele.line(e.pos.x, e.pos.z, Math.atan2(e.lock.x, e.lock.z), 16, 2.0, 0.95 * tel + 0.2, 0xff5a2a);
            ctx.sfx.roar(e.pos);
          }
        } else if (e.state === 'wind') {
          faceTo(e, tgt, dt, 6);
          if (e.t > 0.75 * tel) {
            _v.set(dx, 0, dz).normalize();
            const fwd = Math.sin(e.yaw) * _v.x + Math.cos(e.yaw) * _v.z;
            if (dist < 3.2 && fwd > 0.35) hitTarget(e, tgt, dmg, 'brute');
            ctx.fx.gore.burst(e.pos.x + Math.sin(e.yaw) * 1.6, 0.2, e.pos.z + Math.cos(e.yaw) * 1.6, 8, 0x6a5a4a, 4, 0.5, 12, 0.5);
            ctx.sfx.thud(e.pos);
            e.state = 'recover'; e.t = 0;
          }
        } else if (e.state === 'cwind') {
          e.yaw = lerpAngle(e.yaw, Math.atan2(e.lock.x, e.lock.z), Math.min(1, dt * 10));
          if (e.t > 0.95 * tel) { e.state = 'charge'; e.t = 0; e.hitDone = false; }
        } else if (e.state === 'charge') {
          e.pos.addScaledVector(e.lock, 12.5 * dt);
          e.phase += dt * 20;
          if (!e.hitDone) {
            const ddx = P.pos.x - e.pos.x, ddz = P.pos.z - e.pos.z;
            if (ddx * ddx + ddz * ddz < (e.radius + 0.7) ** 2) { e.hitDone = true; ctx.hooks.hurtPlayer(dmg * 1.25, e.pos, 'charge'); P.knock.addScaledVector(e.lock, 11); }
          }
          const b = W.barricadeNear(e.pos, e.radius);
          if (b) ctx.hooks.breakBarricade(b, 999);
          if (W.collide(e.pos, e.radius, true) || e.t > 1.3) {
            if (e.t <= 1.3) { e.state = 'stun'; e.stun = 2.2; e.t = 0; ctx.sfx.thud(e.pos); ctx.hooks.shake(0.25, e.pos); ctx.fx.sparks.burst(e.pos.x, 2.2, e.pos.z, 12, 0xffe08a, 3, 0.8, 0, 0); ctx.hooks.bruteStunned(e); }
            else { e.state = 'recover'; e.t = 0; }
            e.cd2 = 5 + Math.random() * 2;
          }
        } else if (e.state === 'recover') { if (e.t > 0.8) { e.state = 'move'; e.t = 0; } }
      } else if (e.type === 'spitter') {
        if (e.state === 'move') {
          if (dist < 6) steer(e, tgt, dt, 1.05, true);
          else if (dist > 13 || !W.los(e.pos, tgt, 1.2, true)) steer(e, tgt, dt, 1);
          else { faceTo(e, tgt, dt); e.phase += dt * 0.5; }
          if (e.cd <= 0 && dist < 17 && dist > 3 && W.los(e.pos, tgt, 1.4, true)) {
            e.state = 'wind'; e.t = 0;
            const lead = 0.6 * Math.min(1.2, dist / 12);
            e.lock.set(tgt.x + (tgt === P.pos ? P.vel.x * lead : 0), 0, tgt.z + (tgt === P.pos ? P.vel.z * lead : 0));
            ctx.fx.tele.zone(e.lock.x, e.lock.z, 1.8, 0.8 * tel + 1.0, 0x9dff3a);
            ctx.sfx.gurgle(e.pos);
          }
        } else if (e.state === 'wind') {
          faceTo(e, e.lock, dt);
          e.swell = Math.min(1, e.t / (0.8 * tel));
          if (e.t > 0.8 * tel) {
            _v.set(e.pos.x + Math.sin(e.yaw) * 0.4, 1.6, e.pos.z + Math.cos(e.yaw) * 0.4);
            lob('spit', _v, e.lock, 1.0, dmg, 1.8, 1.6);
            e.state = 'recover'; e.t = 0; e.cd = 3.2 + Math.random(); e.swell = 0;
          }
        } else if (e.state === 'recover') { if (e.t > 0.5) { e.state = 'move'; e.t = 0; } }
      } else if (e.type === 'stalker') {
        const vis = e.revealed > 0 || e.state === 'wind' || e.state === 'slash';
        e.alpha += ((vis ? 1 : 0.07) - e.alpha) * Math.min(1, dt * (vis ? 10 : 2));
        if (e.state === 'move') {
          steer(e, tgt, dt, 1);
          if (dist < 2.4 && e.cd <= 0) { e.state = 'wind'; e.t = 0; ctx.sfx.hiss(e.pos); }
        } else if (e.state === 'wind') {
          faceTo(e, tgt, dt, 12);
          if (e.t > 0.55 * tel) {
            if (dist < 2.9) hitTarget(e, tgt, dmg, 'stalker');
            e.state = 'retreat'; e.t = 0; e.cd = 2.5;
          }
        } else if (e.state === 'retreat') {
          steer(e, tgt, dt, 1.1, true);
          if (e.t > 1.3) { e.state = 'move'; e.t = 0; }
        }
      }
      // separación entre mutantes
      for (let j = k - 1; j >= 0; j--) {
        const o = all[j]; if (!o.alive || o.state === 'spawn') continue;
        const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, rr = e.radius + o.radius;
        const d2 = sx * sx + sz * sz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5 / d;
          const we = e.type === 'brute' ? 0.2 : 1, wo = o.type === 'brute' ? 0.2 : 1;
          e.pos.x += sx * push * we; e.pos.z += sz * push * we; o.pos.x -= sx * push * wo; o.pos.z -= sz * push * wo;
        }
      }
      // no se superponen con el jugador ni con el superviviente
      for (const o of [P, ctx.survivor]) {
        if (!o || (o !== P && !(o.alive && o.following))) continue;
        const sx = e.pos.x - o.pos.x, sz = e.pos.z - o.pos.z, rr = e.radius + 0.42, d2 = sx * sx + sz * sz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; e.pos.x += sx * k; e.pos.z += sz * k; }
      }
      // barricadas: si la toca, la golpea
      if (e.state !== 'charge') {
        W.collide(e.pos, e.radius);
        const b = W.barricadeNear(e.pos, e.radius);
        if (b && e.state === 'move') {
          e.bash -= dt;
          if (e.bash <= 0) { e.bash = 0.9; ctx.hooks.breakBarricade(b, (e.type === 'brute' ? 45 : 12) * D.enemyDmg, e); e.phase += 1.5; }
        }
      }
      // pileta tóxica: los mutantes no sufren (son mutantes)
    }
    updateProjectiles(dt);
  }
  function gasBurst(e) {
    const P = ctx.player;
    ctx.fx.sparks.plume(e.pos.x, 0.6, e.pos.z, ctx.reduced ? 12 : 30, 0x9dff3a, 2.6, 1.6, 1.4);
    ctx.fx.gore.burst(e.pos.x, 1.2, e.pos.z, 16, 0x8dff3a, 5, 0.8, 10, 0.4);
    ctx.sfx.splat(e.pos);
    if ((P.pos.x - e.pos.x) ** 2 + (P.pos.z - e.pos.z) ** 2 < 2.7 * 2.7) ctx.hooks.hurtPlayer(16 * ctx.diff.enemyDmg, e.pos, 'gas');
    for (const o of all) if (o !== e && o.alive && o.state !== 'swell' && (o.pos.x - e.pos.x) ** 2 + (o.pos.z - e.pos.z) ** 2 < 2.7 * 2.7) damage(o, 20, e.pos);
    addPuddle(e.pos.x, e.pos.z, 2.0, 4, 8 * ctx.diff.enemyDmg);
  }

  /* ---------- dibujo ---------- */
  function render(time) {
    for (const e of all) {
      if (!e.alive) continue;
      const sp = e.state === 'spawn' ? Math.min(1, e.t / 0.7) : 1;
      const y = e.state === 'spawn' ? -e.height * (1 - sp) : e.state === 'leap' ? Math.sin(Math.min(1, e.t / 0.42) * Math.PI) * 0.9 : 0;
      const crouch = e.state === 'wind' && e.type === 'runner' ? 0.82 : 1;
      const swell = e.type === 'spitter' ? 1 + e.swell * 0.18 + (e.state === 'swell' ? e.t * 0.7 : 0) : 1;
      const stunTilt = e.state === 'stun' ? 0.35 : 0;
      _q.setFromEuler(_e.set(stunTilt, e.yaw, 0));
      _m.compose(_v.set(e.pos.x, y, e.pos.z), _q, _s.set(swell, crouch * swell, swell));
      const walk = Math.sin(e.phase * 2.2);
      let armA = walk * 0.6, armB = -walk * 0.6, legA = -walk * 0.7, legB = walk * 0.7;
      if (e.type === 'runner') { armA = -1.1 + walk * 0.3; armB = -1.1 - walk * 0.3; if (e.state === 'leap' || e.state === 'wind') { armA = armB = -2.2; } }
      if (e.type === 'brute') {
        if (e.state === 'wind') { const k = Math.min(1, e.t / 0.5); armA = armB = -2.6 * k; }
        else if (e.state === 'cwind' || e.state === 'charge') { armA = armB = -0.9; }
        else if (e.state === 'recover') { armA = armB = -0.4; }
        else { armA = walk * 0.35; armB = -walk * 0.35; }
      }
      if (e.type === 'stalker' && (e.state === 'wind')) { armA = armB = -2.4 * Math.min(1, e.t / 0.35); }
      if (e.state === 'stun' || e.state === 'swell') { armA = armB = 0.3; legA = legB = 0; }
      // color: destello por golpe, rojo durante el aviso, amarillo aturdido
      let cr = 1, cg = 1, cb = 1;
      if (e.flash > 0) { cr = cg = cb = 3; }
      else if (e.state === 'wind' || e.state === 'cwind') { const f = 0.5 + 0.5 * Math.sin(time * 30); cr = 1.4 + f; cg = 0.45; cb = 0.35; }
      else if (e.state === 'stun') { cr = 1.6; cg = 1.5; cb = 0.4; }
      else if (e.state === 'swell') { cr = 1.2; cg = 2; cb = 0.6; }
      if (e.type === 'stalker') {
        const s = stalkerSlots[e.slot];
        s.g.position.set(e.pos.x, y, e.pos.z); s.g.rotation.set(0, e.yaw, 0);
        s.parts.armL.rotation.x = armA; s.parts.armR.rotation.x = armB; s.parts.legL.rotation.x = legA; s.parts.legR.rotation.x = legB;
        s.mat.opacity = Math.max(0.05, Math.min(1, e.alpha + (e.flash > 0 ? 0.6 : 0)));
        s.mat.emissive.setRGB(e.state === 'wind' ? 0.6 : e.flash > 0 ? 0.5 : 0, e.flash > 0 ? 0.5 : 0, e.flash > 0 ? 0.5 : 0.15 * (1 - e.alpha));
        s.mat.depthWrite = e.alpha > 0.6;
        continue;
      }
      const mm = /** @type {any} */ (models)[e.type];
      const I = inst[e.type];
      _c.setRGB(cr, cg, cb);
      for (const p of PARTS) {
        const piv = mm[p].pivot;
        const ang = p === 'armL' ? armA : p === 'armR' ? armB : p === 'legL' ? legA : p === 'legR' ? legB : 0;
        if (p === 'body') _pm.copy(_m);
        else { _pm.makeRotationX(ang); _pm.setPosition(piv[0], piv[1], piv[2]); _pm.premultiply(_m); }
        I[p].setMatrixAt(e.slot, _pm);
        I[p].setColorAt(e.slot, _c);
      }
    }
    // sólo se dibujan las instancias hasta el último lugar ocupado (menos vértices procesados)
    for (const t of ['runner', 'brute', 'spitter']) {
      const u = /** @type {any} */ (slotsUsed)[t]; let n = 0;
      for (let i = 0; i < u.length; i++) if (u[i]) n = i + 1;
      for (const p of PARTS) { const im = inst[t][p]; im.count = n; im.visible = n > 0; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
  }

  /** Rayo contra mutantes: esfera de torso y de cabeza (cabeza = crítico). */
  const rayRes = { e: /** @type {any} */ (null), t: Infinity, head: false };
  function raycast(o, d, maxT) {
    rayRes.e = null; rayRes.t = Infinity; rayRes.head = false;
    for (const e of all) {
      if (!e.alive || e.state === 'swell' || (e.state === 'spawn' && e.t < 0.3)) continue;
      const crouch = e.state === 'wind' && e.type === 'runner' ? 0.8 : 1;
      const r1 = e.radius * 1.15 + 0.1;
      let t = raySphere(o, d, e.pos.x, e.height * 0.5 * crouch, e.pos.z, r1);
      let head = false;
      const th = raySphere(o, d, e.pos.x + Math.sin(e.yaw) * e.radius * 0.4, e.height * 0.9 * crouch, e.pos.z + Math.cos(e.yaw) * e.radius * 0.4, Math.max(0.24, e.radius * 0.55));
      if (th < t) { t = th; head = true; }
      // piernas
      const tl = raySphere(o, d, e.pos.x, e.height * 0.2, e.pos.z, e.radius * 0.9);
      if (tl < t) { t = tl; head = false; }
      if (t < rayRes.t && t <= maxT) { rayRes.t = t; rayRes.e = e; rayRes.head = head; }
    }
    return rayRes;
  }

  function count(type) { let n = 0; for (const e of all) if (e.alive && (!type || e.type === type)) n++; return n; }
  function clear() {
    for (const e of [...all]) kill(e, 'clear');
    all.length = 0;
    for (const p of projs) blobs.free(p.i); projs.length = 0;
    for (const u of puddles) puddlePool.free(u.i); puddles.length = 0;
  }
  function dispose() {
    clear();
    ctx.root.remove(group);
    for (const t in inst) for (const p of PARTS) inst[t][p].dispose();
    for (const s of stalkerSlots) s.mat.dispose();
    for (const t in models) for (const p of PARTS) /** @type {any} */ (models)[t][p].geo.dispose();
    blobs.dispose(); puddlePool.dispose(); blobGeo.dispose(); blobMat.dispose(); puddleGeo.dispose(); puddleMat.dispose();
  }

  return {
    all, spawn, kill, damage, update, render, raycast, count, clear, dispose, lob, addPuddle, puddleDps, startSwell,
    get projectiles() { return projs.length; }, get puddles() { return puddles.length; },
    /** Pulso: empuja, aturde, daña y revela. */
    pulse(center, radius, dmg, push, stun, reveal) {
      let n = 0;
      for (const e of [...all]) {
        if (!e.alive || e.state === 'swell') continue;
        const dx = e.pos.x - center.x, dz = e.pos.z - center.z, d = Math.hypot(dx, dz);
        if (d > radius) continue;
        n++;
        const k = 1 - d / radius * 0.5;
        if (e.type === 'stalker') e.revealed = Math.max(e.revealed, reveal);
        if (e.type !== 'brute' || e.state !== 'charge') {
          e.push.x += dx / (d || 1) * push * k * (e.type === 'brute' ? 0.3 : 1); e.push.z += dz / (d || 1) * push * k * (e.type === 'brute' ? 0.3 : 1);
          if (e.state === 'wind' || e.state === 'cwind' || e.state === 'move' || e.state === 'leap') { e.state = 'stun'; e.stun = stun * (e.type === 'brute' ? 0.6 : 1); e.t = 0; }
        }
        damage(e, dmg, center);
      }
      return n;
    },
  };
}

function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
function raySphere(o, d, x, y, z, r) {
  const ox = o.x - x, oy = o.y - y, oz = o.z - z;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - c; if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : (c < 0 ? 0 : Infinity);
}
export { lerpAngle, raySphere };
