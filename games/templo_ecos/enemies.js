// @ts-check
/* Templo de los Ecos — rivales: centinela de piedra, araña de ruinas, espectro vigía. */
import * as THREE from 'three';
import { makeSentinel, makeSpider, makeSpectre } from './models.js';
import { body, moveBody, losBlocked } from './physics.js';

const TAU = Math.PI * 2;
/** @param {number} a */
const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

/**
 * Centinela de piedra. Patrulla con cono de visión; al verte se planta y embiste en línea recta.
 * Contrajuego: escondete detrás de columnas (corta la visión), hacé que choque contra una pared
 * (queda aturdido) o golpeale la grieta de la espalda con el Eco (aturdido).
 * @param {import('./level.js').Level} L @param {{path:number[][], range?:number}} o
 */
export function createSentinel(L, o) {
  const ctx = L.ctx, m = makeSentinel(ctx.mats);
  L.group.add(m.group);
  const range = o.range ?? 7.5, half = 0.58;
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffc35a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const cone = new THREE.Mesh(new THREE.CircleGeometry(range, 18, -Math.PI / 2 - half, half * 2), coneMat);
  cone.rotation.x = -Math.PI / 2; cone.position.y = 0.06; cone.renderOrder = 1;
  m.group.add(cone);
  const b = body(0.95, 2.9, 0.2);
  const e = {
    kind: 'sentinel', obj: m.group, b, state: 'patrol', t: 0, wp: 1, heading: 0, cdx: 0, cdz: 0, hitDone: false, warned: false,
    reset() {
      b.pos.x = o.path[0][0]; b.pos.z = o.path[0][1]; b.pos.y = 0; b.vel.x = b.vel.z = b.vel.y = 0;
      e.wp = 1 % o.path.length; e.state = 'patrol'; e.t = 0;
      const n = o.path[e.wp]; e.heading = Math.atan2(n[0] - b.pos.x, n[1] - b.pos.z);
    },
    /** @param {number} dt @param {any} P */
    update(dt, P) {
      const sp = ctx.diff().enemySpeed, p = b.pos, pp = P.body.pos;
      const dx = pp.x - p.x, dz = pp.z - p.z, dist = Math.hypot(dx, dz);
      const toP = Math.atan2(dx, dz);
      e.t -= dt;
      if (e.state === 'patrol') {
        const w = o.path[e.wp], wx = w[0] - p.x, wz = w[1] - p.z, wd = Math.hypot(wx, wz);
        const want = Math.atan2(wx, wz), diff = wrap(want - e.heading);
        e.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.2);
        const go = Math.abs(diff) < 0.3 ? 1.7 * sp : 0;
        b.vel.x = Math.sin(e.heading) * go; b.vel.z = Math.cos(e.heading) * go;
        if (wd < 0.4) e.wp = (e.wp + 1) % o.path.length;
        // visión
        if (P.alive && P.vulnerable && dist < range && Math.abs(pp.y - p.y) < 2 && Math.abs(wrap(toP - e.heading)) < half && !losBlocked(L.cols, p.x, p.z, pp.x, pp.z, 1.3)) {
          e.state = 'alert'; e.t = 0.7 / sp; ctx.sfx.alert(); b.vel.x = b.vel.z = 0;
        }
      } else if (e.state === 'alert') {
        const diff = wrap(toP - e.heading); e.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
        b.vel.x = b.vel.z = 0;
        if (e.t <= 0) { e.state = 'charge'; e.t = 1.15; e.cdx = Math.sin(e.heading); e.cdz = Math.cos(e.heading); e.hitDone = false; ctx.sfx.charge(); }
      } else if (e.state === 'charge') {
        b.vel.x = e.cdx * 9 * sp; b.vel.z = e.cdz * 9 * sp;
        if (!e.hitDone && P.alive && dist < 1.6 && Math.abs(pp.y - p.y) < 1.8) {
          e.hitDone = true; ctx.hurt(1, p.x, p.z, 'sentinel', 9);
          e.state = 'recover'; e.t = 1.0; b.vel.x = b.vel.z = 0;
        } else if (b.contact && b.contact.tag !== 'floor') {
          e.state = 'stun'; e.t = 2.8; b.vel.x = b.vel.z = 0; ctx.sfx.thud(); ctx.fx.burst(p.x + e.cdx, 2, p.z + e.cdz, 0x9a9a8a, 16, 4);
          if (dist < 12) ctx.fx.shake(0.35);
          ctx.emit('sentinelStun');
        } else if (e.t <= 0) { e.state = 'recover'; e.t = 0.8; }
      } else if (e.state === 'recover' || e.state === 'stun') {
        b.vel.x = b.vel.z = 0;
        if (e.t <= 0) { e.state = 'patrol'; let best = 0, bd = 1e9; o.path.forEach((w, i) => { const d = Math.hypot(w[0] - p.x, w[1] - p.z); if (d < bd) { bd = d; best = i; } }); e.wp = best; }
      }
      b.vel.y -= 25 * dt;
      moveBody(L.cols, b, dt);
      if (p.y < -8) e.reset();
      m.group.position.set(p.x, p.y, p.z);
      m.group.rotation.y = e.heading;
      const stun = e.state === 'stun';
      m.group.rotation.z = stun && !ctx.reduced() ? Math.sin(L.time * 9) * 0.05 : 0;
      m.eyeMat.color.setHex(e.state === 'alert' || e.state === 'charge' ? 0xff3b2f : stun ? 0x404040 : 0xffc35a);
      coneMat.color.setHex(e.state === 'patrol' ? 0xffc35a : 0xff3b2f);
      coneMat.opacity = stun ? 0.0 : e.state === 'patrol' ? 0.16 : 0.26;
    },
    onPulse(x, z, R) {
      const p = b.pos, d = Math.hypot(x - p.x, z - p.z);
      if (d > R + 0.8 || e.state === 'stun') return;
      const fromP = Math.atan2(x - p.x, z - p.z);
      if (Math.abs(wrap(fromP - e.heading)) > 1.9) { // por la espalda
        e.state = 'stun'; e.t = 3.4; ctx.sfx.thud(); ctx.fx.burst(p.x, 1.5, p.z, 0x9fe8de, 20, 3); ctx.emit('sentinelStun');
      } else ctx.toast('El centinela es inmune de frente: ¡por la espalda!', 1500);
    },
  };
  e.reset();
  return e;
}

/**
 * Araña de ruinas. Duerme entre escombros; al acercarte corre en zigzag y muerde.
 * Contrajuego: es sensible al sonido (el Eco la destruye) y la luz la quema; se la puede saltar.
 * @param {import('./level.js').Level} L @param {{x:number, z:number, y?:number, wake?:number, respawn?:number, awake?:boolean}} o
 */
export function createSpider(L, o) {
  const ctx = L.ctx, m = makeSpider(ctx.mats);
  L.group.add(m.group);
  const b = body(0.42, 0.8, 0.3);
  const e = {
    kind: 'spider', obj: m.group, b, state: 'sleep', t: 0, cd: 0, phase: Math.random() * 6, dead: false,
    tgt: { x: o.x, z: o.z, r: 0.55, hitNow: false, active: () => !e.dead, hit: () => e.die(true) },
    reset() { b.pos.x = o.x; b.pos.z = o.z; b.pos.y = (o.y ?? 0) + 0.05; b.vel.x = b.vel.y = b.vel.z = 0; e.state = o.awake ? 'hunt' : 'sleep'; e.dead = false; m.group.visible = true; e.t = 0; },
    wakeUp() { if (!e.dead && e.state === 'sleep') { e.state = 'hunt'; ctx.sfx.skitter(); } },
    die(byLight) {
      if (e.dead) return;
      e.dead = true; e.state = 'dead'; e.t = o.respawn ?? 0; m.group.visible = false;
      ctx.fx.burst(b.pos.x, 0.5, b.pos.z, byLight ? 0xffd27a : 0x5a4a5a, 18, 4); ctx.sfx.squish(); ctx.emit('spider'); ctx.addScore(40);
    },
    /** @param {number} dt @param {any} P */
    update(dt, P) {
      const p = b.pos, pp = P.body.pos, sp = ctx.diff().enemySpeed;
      if (e.dead) { if (o.respawn) { e.t -= dt; if (e.t <= 0 && Math.hypot(pp.x - o.x, pp.z - o.z) > 8) e.reset(); } return; }
      const dx = pp.x - p.x, dz = pp.z - p.z, dist = Math.hypot(dx, dz);
      e.cd -= dt; e.t -= dt;
      if (e.state === 'sleep') {
        b.vel.x = b.vel.z = 0;
        if (P.alive && dist < (o.wake ?? 6) && Math.abs(pp.y - p.y) < 2.5) e.wakeUp();
      } else if (e.state === 'hunt') {
        const ux = dx / (dist || 1), uz = dz / (dist || 1), zig = Math.sin(L.time * 7 + e.phase) * 0.8;
        const s = 3.5 * sp;
        b.vel.x = (ux - uz * zig) * s; b.vel.z = (uz + ux * zig) * s;
        if (P.alive && P.vulnerable && dist < 0.95 && Math.abs(pp.y - p.y) < 1.2 && e.cd <= 0) {
          ctx.hurt(1, p.x, p.z, 'spider', 4); e.cd = 1.2; e.state = 'retreat'; e.t = 1.0;
        }
        if (dist > 16) { e.state = 'sleep'; }
      } else if (e.state === 'retreat') {
        b.vel.x = -dx / (dist || 1) * 3; b.vel.z = -dz / (dist || 1) * 3;
        if (e.t <= 0) e.state = 'hunt';
      }
      b.vel.y -= 25 * dt;
      moveBody(L.cols, b, dt);
      if (p.y < -8) { e.dead = true; m.group.visible = false; e.t = o.respawn ?? 0; }
      e.tgt.x = p.x; e.tgt.z = p.z;
      m.group.position.set(p.x, p.y + (e.state === 'hunt' && !ctx.reduced() ? Math.abs(Math.sin(L.time * 16)) * 0.08 : 0), p.z);
      if (e.state !== 'sleep') m.group.rotation.y = Math.atan2(b.vel.x, b.vel.z);
      m.group.scale.setScalar(e.state === 'sleep' ? 0.8 : 1);
    },
    onPulse(x, z, R) { if (!e.dead && Math.hypot(x - b.pos.x, z - b.pos.z) < R) e.die(false); },
  };
  L.beamTargets.push(e.tgt);
  e.reset();
  return e;
}

/**
 * Espectro vigía. Flota alrededor de su puesto, casi invisible de lejos; si te ve, te persigue
 * atravesando paredes y drena vida. Contrajuego: el Eco lo repele y aturde; un rayo de luz lo disuelve.
 * @param {import('./level.js').Level} L @param {{x:number, z:number, radius?:number, y?:number}} o
 */
export function createSpectre(L, o) {
  const ctx = L.ctx, m = makeSpectre();
  L.group.add(m.group);
  const by = o.y ?? 0.2;
  const e = {
    kind: 'spectre', obj: m.group, x: o.x, z: o.z, y: by, state: 'drift', t: 0, a: 0, cd: 0, vx: 0, vz: 0, fade: 1,
    tgt: { x: o.x, z: o.z, r: 0.75, hitNow: false, active: () => e.state !== 'gone', hit: () => e.dissolve() },
    reset() { e.x = o.x + (o.radius ?? 3); e.z = o.z; e.state = 'drift'; e.t = 0; e.fade = 1; m.group.visible = true; m.group.scale.setScalar(1); },
    dissolve() {
      if (e.state === 'gone') return;
      e.state = 'gone'; e.t = 14; ctx.sfx.dispel(); ctx.fx.burst(e.x, 1.4, e.z, 0xbff6ff, 26, 3); ctx.emit('spectre'); ctx.addScore(80);
    },
    /** @param {number} dt @param {any} P */
    update(dt, P) {
      const pp = P.body.pos, sp = ctx.diff().enemySpeed;
      const dx = pp.x - e.x, dz = pp.z - e.z, dist = Math.hypot(dx, dz);
      e.t -= dt; e.cd -= dt;
      if (e.state === 'gone') {
        e.fade = Math.max(0, e.fade - dt * 2); m.group.scale.setScalar(Math.max(0.01, e.fade));
        if (e.fade <= 0) m.group.visible = false;
        if (e.t <= 0 && Math.hypot(pp.x - o.x, pp.z - o.z) > 7) e.reset();
        return;
      }
      if (e.state === 'drift') {
        e.a += dt * 0.6;
        const r = o.radius ?? 3, tx = o.x + Math.cos(e.a) * r, tz = o.z + Math.sin(e.a) * r;
        e.x += (tx - e.x) * Math.min(1, dt * 1.5); e.z += (tz - e.z) * Math.min(1, dt * 1.5);
        if (P.alive && dist < 6.5 && Math.abs(pp.y - by) < 3 && e.t <= 0) { e.state = 'hunt'; ctx.sfx.wail(); }
      } else if (e.state === 'hunt') {
        const s = 2.1 * sp;
        e.x += dx / (dist || 1) * s * dt; e.z += dz / (dist || 1) * s * dt;
        if (P.alive && P.vulnerable && dist < 1.0 && e.cd <= 0) { ctx.hurt(1, e.x, e.z, 'spectre', 2); e.cd = 1.2; }
        if (dist > 11 || Math.hypot(e.x - o.x, e.z - o.z) > 14 || !P.alive) { e.state = 'drift'; e.t = 2; }
      } else if (e.state === 'repel') {
        e.x += e.vx * dt; e.z += e.vz * dt; e.vx *= 0.9; e.vz *= 0.9;
        if (e.t <= 0) { e.state = 'drift'; e.t = 1.5; }
      }
      e.tgt.x = e.x; e.tgt.z = e.z;
      const near = Math.max(0, 1 - dist / 12);
      m.mat.opacity = e.state === 'repel' ? 0.85 : 0.14 + near * 0.5;
      m.group.visible = true;
      m.group.position.set(e.x, by + 0.35 + Math.sin(L.time * 2 + o.x) * 0.15, e.z);
      m.group.rotation.y = Math.atan2(dx, dz);
    },
    onPulse(x, z, R) {
      if (e.state === 'gone') return;
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz);
      if (d > R + 1) return;
      e.state = 'repel'; e.t = 2.6; e.vx = dx / (d || 1) * 9; e.vz = dz / (d || 1) * 9; ctx.sfx.dispel(); ctx.emit('spectreRepel');
    },
  };
  L.beamTargets.push(e.tgt);
  e.reset();
  return e;
}
