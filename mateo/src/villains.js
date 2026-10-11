// Mateo: Ciudad de Altura — villanos de los incidentes (V2 P1), originales y NO letales, con IA por estados:
//  · Carterista (gorro rojo, rayas): rápido, huye por la red PEATONAL alejándose de Mateo, evita cruzar con autos
//    cerca, esquiva de costado y, si lo acorralan, amaga un manotazo (aviso visible) para escaparse.
//  · Corredor (gorra azul): más veloz todavía, no pelea; se cansa si lo alcanzan y lo inmovilizan.
//  · Grandote: lento, se planta con GUARDIA (bloquea golpes de frente), avisa el empujón (anillo rojo + pose) y queda
//    expuesto al recuperarse. El golpe cargado o el cable rompen la guardia.
// Todos: aturdido con estrellitas → se rinde (manos arriba, suelta el objeto) → se sienta → se va. Nunca atacan a
// vecinos, nunca atraviesan paredes (cápsula contra el mismo mundo de colisiones que Mateo) y siempre terminan
// (rendido, escapado o despedido) para que no queden villanos huérfanos.
import * as THREE from 'three';
import { buildCharacter, npcStyle } from './rig.js';
import { buildClips, buildExtraClips } from './anims.js';
import { createBubble } from './bubble.js';
import { dampAngle, wrapAngle, rng } from './util.js';

export const ARCH = {
  carterista: { name: 'Carterista', speed: 6.2, hp: 2, suit: 0x2a2a2a, pants: 0x3a3a50, hat: 0xc0392b, stripes: 0xf0f0f0, flee: true, dodge: 0.55, swipe: { windup: 0.5, active: 0.12, range: 1.7, cone: 0.9, dmg: 5, knock: 5 }, scale: 1 },
  corredor: { name: 'Corredor', speed: 6.9, hp: 2, suit: 0x2f6db0, pants: 0x1e2a3a, hat: 0x1f3a5a, stripes: 0xffd34a, flee: true, dodge: 0.35, swipe: null, scale: 1 },
  grandote: { name: 'Grandote', speed: 3.3, hp: 5, suit: 0x6b4a32, pants: 0x2b2b2b, hat: 0x3a3a3a, stripes: null, flee: false, guard: true, shove: { windup: 0.85, active: 0.15, range: 2.5, cone: 0.85, dmg: 10, knock: 8 }, scale: 1.18 },
};
const ENDED = new Set(['gone', 'escaped']);
const PASSIVE = new Set(['stunned', 'surrender', 'subdued', 'leave', 'gone', 'escaped']);

export function createVillains(scene, city, ctx) {
  // ctx: { nav, world, fx, sfx, onEvent(type, d), hurt(n, x, z, kind) → bool, cars() → [{x,z}], player() → P, seed }
  const group = new THREE.Group(); group.name = 'villanos'; scene.add(group);
  let rand = rng(ctx.seed || 9091);
  const list = [], clipCache = new Map(), pool = { carterista: [], corredor: [], grandote: [] };
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const tieMat = new THREE.MeshBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: 0.9, toneMapped: false });
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false });
  const res = {}, _v = new THREE.Vector3(), _vel = new THREE.Vector3();
  let seq = 0;
  const stats = { spawned: 0, hits: 0, blocked: 0, dodges: 0, attacks: 0, surrenders: 0, escapes: 0, tied: 0, gone: 0, hurtCivilians: 0 };

  function build(type) {
    const A = ARCH[type], base = npcStyle(type === 'grandote' ? 77 : type === 'corredor' ? 63 : 91);
    const st = { ...base, child: false, scale: 1.3 * A.scale, legLen: 0.86 * A.scale, torso: 1.35 * A.scale, arm: 0.62 * A.scale, shoulder: 1.35 * A.scale * (type === 'grandote' ? 1.15 : 1), hipW: 1.25 * A.scale, headR: 0.125 * A.scale, bodyW: 0.2 * A.scale * (type === 'grandote' ? 1.3 : 1), suit: A.suit, panel: A.suit, trim: A.suit, pantsColor: A.pants, hair: 0x1a1a1a, hairStyle: 'short', simpleFace: true };
    const ch = buildCharacter(st);
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.155 * A.scale, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: A.hat }));
    hat.position.set(0, 0.14 * A.scale, 0); ch.bones.head.add(hat);
    if (type === 'corredor') { const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.14), new THREE.MeshStandardMaterial({ color: A.hat })); visor.position.set(0, 0.15, 0.13); ch.bones.head.add(visor); }
    if (A.stripes) for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.04, 14, 1, true), new THREE.MeshStandardMaterial({ color: A.stripes })); s.scale.z = 0.72; s.position.y = -0.05 + i * 0.1; ch.bones.chest.add(s); }
    const hy = ch.bones.hips.position.y, key = hy.toFixed(3);
    if (!clipCache.has(key)) clipCache.set(key, [...buildClips(hy), ...buildExtraClips(hy)]);
    const clips = clipCache.get(key), mixer = new THREE.AnimationMixer(ch.group), acts = {};
    for (const n of ['idle_look', 'idle_breath', 'walk_forward', 'run', 'sprint', 'stagger', 'hit_react', 'celebrate', 'hands_up', 'sit', 'shove_windup', 'shove', 'snatch', 'cower']) {
      const c = clips.find(k => k.name === n); const a = mixer.clipAction(c);
      if (!c.userData.loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      acts[n] = a;
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40).rotateX(-Math.PI / 2), ringMat.clone()); ring.visible = false; group.add(ring);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.42 * A.scale, 0.04, 6, 24).rotateX(Math.PI / 2), tieMat); tie.position.y = 1.05 * A.scale; tie.visible = false; ch.group.add(tie);
    const tie2 = tie.clone(); tie2.position.y = 0.75 * A.scale; ch.group.add(tie2);
    const stars = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), starMat); s.position.set(Math.cos(i * 2.1) * 0.4, 0, Math.sin(i * 2.1) * 0.4); stars.add(s); } stars.position.y = 2.25 * A.scale; stars.visible = false; ch.group.add(stars);
    const warn = createBubble(ch.group, 2.6 * A.scale), bubble = createBubble(ch.group, 2.4 * A.scale);
    const hand = ch.bones.hand_R;
    // marca roja sobre la cabeza mientras huye con el objeto (se ve de lejos)
    const tag = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.38, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xff5040, toneMapped: false, depthTest: false }));
    tag.position.y = 2.95 * A.scale; tag.renderOrder = 9; tag.visible = false; ch.group.add(tag);
    return { type, A, ch, mixer, acts, ring, tie, tie2, stars, warn, bubble, hand, tag, anim: '' };
  }
  function play(v, n, fade = 0.15) {
    if (v.anim === n) return;
    const a = v.acts[n], b = v.acts[v.anim];
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
    if (b && b !== a) b.crossFadeTo(a, fade, false);
    v.anim = n;
  }

  /** aparece un villano (del pool) en (x,z) sobre el piso */
  function spawn(type, x, z, opts = {}) {
    const A = ARCH[type];
    const m = pool[type].pop() || build(type);
    const v = Object.assign(m, {
      id: `${type}-${++seq}`, x, z, y: ctx.world.groundAt(x, z, 2), yaw: opts.yaw || 0, vx: 0, vz: 0, state: opts.state || 'idle', t: 0, hp: A.hp, stunT: 0, tiedT: 0, cd: 1.5,
      dodgeCd: 0, sideT: 0, near: 0, far: 0, fleeT: 0, cur: -1, prev: -1, next: -1, target: null, item: null, incident: opts.incident || null, hits: 0, blockedHits: 0, leaveT: 0, hitstop: 0,
      surrenderLine: opts.surrender || '¡Me rindo! Perdón.', attackKind: null, attackT: 0, lastHurt: 0, noEscape: false, speedScale: 1,
    });
    v.tag.visible = false;
    v.ch.group.visible = true; v.ch.group.position.set(x, v.y, v.z); v.ch.group.rotation.y = v.yaw; group.add(v.ch.group);
    v.stars.visible = false; v.tie.visible = v.tie2.visible = false; v.ring.visible = false; v.warn.hide(); v.bubble.hide();
    v.anim = ''; for (const a of Object.values(v.acts)) a.stop(); play(v, 'idle_look', 0);
    list.push(v); stats.spawned++;
    return v;
  }
  function remove(v) {
    const i = list.indexOf(v); if (i < 0) return;
    list.splice(i, 1);
    if (v.item) { v.item.removeFromParent(); v.item = null; }
    v.ch.group.removeFromParent(); v.ring.visible = false; v.warn.hide(); v.bubble.hide();
    v.state = 'gone'; stats.gone++;
    pool[v.type].push(v);
  }

  /* ---------- movimiento con colisiones (mismo mundo que Mateo) ---------- */
  function moveDir(v, dx, dz, speed, dt) {
    const l = Math.hypot(dx, dz); if (l < 1e-4) return;
    _v.set(v.x, v.y, v.z); _vel.set(dx / l * speed, -2, dz / l * speed);
    ctx.world.moveCapsule(_v, _vel, dt, { r: 0.34 * v.A.scale, h: 1.6 * v.A.scale, step: 0.42, grounded: true }, res);
    v.x = _v.x; v.z = _v.z; v.y = Math.max(0, _v.y);
    v.yaw = dampAngle(v.yaw, Math.atan2(dx, dz), 10, dt);
  }
  /** cruce seguro: con semáforo para peatones o sin autos a menos de 15 m del tramo */
  function crossOk(e, a, b) {
    if (e.kind !== 'cross') return true;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, cars = ctx.cars();
    const clear = !cars.some(c => Math.hypot(c.x - mx, c.z - mz) < 15);
    return clear && (!e.signal || city.canCross(e.axis) || clear);
  }
  function flee(v, P, dt, speed) {
    const nav = ctx.nav;
    if (v.cur < 0) { v.cur = nav.nearest(v.x, v.z); v.prev = -1; v.next = v.cur; }
    const n = nav.nodes[v.next];
    const dx = n.x - v.x, dz = n.z - v.z, d = Math.hypot(dx, dz);
    if (d < 0.5) {
      v.prev = v.cur; v.cur = v.next;
      v.next = nav.fleeNext(v.cur, v.prev, P.pos.x, P.pos.z, crossOk, rand);
      return;
    }
    // esquive de costado (no se sale de la vereda: dura muy poco y vuelve a su línea)
    if (v.sideT > 0) { v.sideT -= dt; moveDir(v, -dz * v.side, dx * v.side, speed * 0.9, dt); moveDir(v, dx, dz, speed * 0.3, dt); return; }
    moveDir(v, dx, dz, speed, dt);
  }
  function faceTo(v, x, z, dt, k = 8) { v.yaw = dampAngle(v.yaw, Math.atan2(x - v.x, z - v.z), k, dt); }

  /* ---------- golpe recibido (desde combat.js): devuelve el resultado ---------- */
  function hit(v, move, P) {
    if (PASSIVE.has(v.state)) return 'ignored';
    if (v.state === 'dodge' || v.sideT > 0.12) { stats.dodges++; ctx.onEvent('villainDodge', { id: v.id }); return 'dodged'; }
    const ang = Math.abs(wrapAngle(Math.atan2(P.pos.x - v.x, P.pos.z - v.z) - v.yaw));
    const front = ang < 1.4, tied = v.tiedT > 0;
    if (v.A.guard && front && !move.guardBreak && !tied && ['confront', 'windup', 'idle', 'walkaway'].includes(v.state)) {
      v.blockedHits++; stats.blocked++;
      const kx = Math.sin(v.yaw), kz = Math.cos(v.yaw); v.vx = -kx * 1.2; v.vz = -kz * 1.2;
      ctx.fx.zap(v.x + kx * 0.6, v.y + 1.4 * v.A.scale, v.z + kz * 0.6); ctx.sfx.shield ? ctx.sfx.shield() : ctx.sfx.denied();
      ctx.onEvent('villainBlocked', { id: v.id }); return 'blocked';
    }
    const dmg = move.dmg * (tied ? 2 : 1);
    v.hp -= dmg; v.hits++; stats.hits++; v.hitstop = 0.06;
    const dx = v.x - P.pos.x, dz = v.z - P.pos.z, l = Math.hypot(dx, dz) || 1;
    v.vx = dx / l * move.knock; v.vz = dz / l * move.knock;
    ctx.fx.sparkle(v.x, v.y + 1.3 * v.A.scale, v.z, 0xffe14a, 8); ctx.sfx.stun();
    v.ring.visible = false; v.warn.hide();
    if (v.hp <= 0 || tied) { v.state = 'stunned'; v.t = 0; v.tiedT = 0; v.tie.visible = v.tie2.visible = false; v.stars.visible = true; ctx.onEvent('villainHit', { id: v.id, ko: true }); return 'ko'; }
    v.state = 'hitstun'; v.t = 0; v.stunT = move.stun; v.cd = Math.max(v.cd, 0.8);
    ctx.onEvent('villainHit', { id: v.id, ko: false, hp: v.hp });
    return 'hit';
  }
  /** cable inmovilizador: el villano más cercano en el cono de la cámara/frente, a la vista */
  function bindTarget(P, yaw, range = 18) {
    let best = null, bd = 1e9;
    for (const v of list) {
      if (PASSIVE.has(v.state) || v.tiedT > 0 || v.noEscape) continue; // sin intervenir todavía: F sigue siendo el cable a los edificios
      const dx = v.x - P.pos.x, dz = v.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d > range || d < 0.5 || Math.abs(v.y - P.pos.y) > 4) continue;
      const a = Math.abs(wrapAngle(Math.atan2(dx, dz) - yaw)); if (a > 0.6) continue;
      const h = ctx.world.raycast(P.pos.x, P.pos.y + 1, P.pos.z, dx / d, (v.y - P.pos.y) / d, dz / d, d - 0.6, b => b.kind === 'building');
      if (h) continue;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  function tie(v) {
    v.tiedT = 3.5; v.state = v.state === 'hitstun' ? 'hitstun' : 'tied'; v.t = 0; v.tie.visible = v.tie2.visible = true; v.ring.visible = false; v.warn.hide();
    stats.tied++; ctx.onEvent('villainTied', { id: v.id });
  }
  function surrender(v) {
    v.state = 'surrender'; v.t = 0; v.stars.visible = false; v.tie.visible = v.tie2.visible = false; v.tiedT = 0; v.ring.visible = false; v.warn.hide();
    v.bubble.say(v.surrenderLine, 3.5, '#fff6d8'); stats.surrenders++;
    ctx.onEvent('villainSurrender', { id: v.id, x: v.x, z: v.z });
  }

  const api = {
    list, ARCH, stats, spawn, remove, hit, bindTarget, tie, surrender,
    reseed(s) { rand = rng(s); },
    setTag(v, on) { if (v && v.tag) v.tag.visible = on; },
    clearAll() { for (const v of list.slice()) remove(v); },
    /** objetivos para el combate (hurtbox: cilindro alrededor del cuerpo) */
    targets() { return list.filter(v => !ENDED.has(v.state)).map(v => ({ v, x: v.x, y: v.y, z: v.z, r: 0.42 * v.A.scale, h: 1.8 * v.A.scale })); },
    /** puntos de peligro para que los vecinos se aparten (pelea, huida, ataque anunciado) */
    dangers() { return list.filter(v => ['flee', 'confront', 'windup', 'attack', 'recover', 'hitstun', 'tied', 'walkaway'].includes(v.state)).map(v => ({ x: v.x, z: v.z, r: v.state === 'flee' ? 5 : 8 })); },
    onRoad() { return list.filter(v => !ENDED.has(v.state)).map(v => ({ x: v.x, z: v.z, r: 0.4 })); },
    update(dt, frozen) {
      const P = ctx.player(); if (!P) return;
      for (const v of list.slice()) {
        v.warn.tick(dt); v.bubble.tick(dt);
        if (v.hitstop > 0) { v.hitstop -= dt; continue; }
        v.t += dt; v.cd = Math.max(0, v.cd - dt); v.dodgeCd = Math.max(0, v.dodgeCd - dt);
        const dx = P.pos.x - v.x, dz = P.pos.z - v.z, dist = Math.hypot(dx, dz), A = v.A;
        // retroceso de los golpes (con colisiones)
        if (Math.hypot(v.vx, v.vz) > 0.05) { const sp = Math.hypot(v.vx, v.vz); moveDir(v, v.vx, v.vz, sp, dt); v.yaw = dampAngle(v.yaw, Math.atan2(dx, dz), 12, dt); v.vx *= Math.exp(-7 * dt); v.vz *= Math.exp(-7 * dt); }
        if (v.tiedT > 0 && !PASSIVE.has(v.state)) {
          v.tiedT -= dt; play(v, 'cower');
          if (v.tiedT <= 0) { v.tie.visible = v.tie2.visible = false; if (dist < 8) { v.stars.visible = true; v.state = 'stunned'; v.t = 0.8; } else { v.state = A.flee ? 'flee' : 'walkaway'; } }
        } else if (frozen && !PASSIVE.has(v.state)) { /* congelado (pruebas) */ }
        else switch (v.state) {
          case 'idle': play(v, 'idle_look'); break;
          case 'walk': { // camina hacia un punto (acercarse a la víctima) por la red peatonal y, al final, directo
            const t = v.target; if (!t) { v.state = 'idle'; break; }
            if (t.path && t.path.length) {
              const n = ctx.nav.nodes[t.path[0]], nx = n.x - v.x, nz = n.z - v.z, nd = Math.hypot(nx, nz);
              if (nd < 0.5) t.path.shift(); else { moveDir(v, nx, nz, t.speed || 1.6, dt); play(v, 'walk_forward'); }
              break;
            }
            const tx = t.x - v.x, tz = t.z - v.z, d = Math.hypot(tx, tz);
            if (d < (t.r || 0.9)) { v.state = 'arrived'; v.t = 0; play(v, 'idle_look'); break; }
            moveDir(v, tx, tz, t.speed || 1.6, dt); play(v, 'walk_forward'); break;
          }
          case 'arrived': play(v, 'idle_look'); if (v.target && v.target.face) faceTo(v, v.target.face.x, v.target.face.z, dt); break;
          case 'snatch': if (v.t < 0.05) play(v, 'snatch', 0.08); if (v.target && v.target.face) faceTo(v, v.target.face.x, v.target.face.z, dt); break;
          case 'flee': {
            v.fleeT += dt;
            flee(v, P, dt, A.speed * v.speedScale);
            play(v, v.speedScale < 0.8 ? 'run' : A.speed > 6.5 ? 'sprint' : 'run');
            // acorralado: Mateo pegado un rato → esquiva o amaga un manotazo para zafar
            if (dist < 2.2) { v.near += dt; if (v.dodgeCd <= 0 && rand() < A.dodge) { v.sideT = 0.32; v.side = rand() < 0.5 ? 1 : -1; v.dodgeCd = 2.4; stats.dodges++; ctx.onEvent('villainDodge', { id: v.id }); } }
            else v.near = Math.max(0, v.near - dt);
            if (v.near > 1.0 && A.swipe && v.cd <= 0) { v.state = 'windup'; v.t = 0; v.attackKind = 'swipe'; v.warn.say('¡!', A.swipe.windup + 0.2, '#ffd0c0'); stats.attacks++; ctx.onEvent('villainAttack', { id: v.id, kind: 'swipe' }); }
            v.far = dist > 70 ? v.far + dt : 0;
            if (v.far > 6 && !v.noEscape) { v.state = 'escaped'; stats.escapes++; ctx.onEvent('villainEscaped', { id: v.id }); }
            break;
          }
          case 'walkaway': { // el grandote se aleja despacio; si Mateo se acerca, se planta
            flee(v, P, dt, A.speed); play(v, 'walk_forward');
            if (dist < 7) { v.state = 'confront'; v.t = 0; v.cd = 1.0; }
            v.far = dist > 70 ? v.far + dt : 0; if (v.far > 8 && !v.noEscape) { v.state = 'escaped'; stats.escapes++; ctx.onEvent('villainEscaped', { id: v.id }); }
            break;
          }
          case 'confront': { // en guardia frente a Mateo; se acerca hasta el alcance y prepara el empujón
            faceTo(v, P.pos.x, P.pos.z, dt, 6); play(v, 'idle_breath');
            if (dist > 2.0) moveDir(v, dx, dz, A.speed * 0.8, dt), play(v, 'walk_forward');
            if (A.shove && v.cd <= 0 && dist < 3.2) { v.state = 'windup'; v.t = 0; v.attackKind = 'shove'; v.ring.visible = true; v.warn.say('¡Ahí va!', A.shove.windup + 0.2, '#ffd0c0'); stats.attacks++; ctx.onEvent('villainAttack', { id: v.id, kind: 'shove' }); }
            if (dist > 16) { v.state = A.flee ? 'flee' : 'walkaway'; }
            break;
          }
          case 'windup': { // aviso (anillo rojo creciente / globo): ventana clara para esquivar o cubrirse
            const W = v.attackKind === 'shove' ? A.shove : A.swipe;
            faceTo(v, P.pos.x, P.pos.z, dt, 5); play(v, v.attackKind === 'shove' ? 'shove_windup' : 'snatch');
            const k = Math.min(1, v.t / W.windup);
            v.ring.visible = true; v.ring.position.set(v.x + Math.sin(v.yaw) * W.range * 0.5, v.y + 0.05, v.z + Math.cos(v.yaw) * W.range * 0.5); v.ring.scale.setScalar(0.3 + W.range * 0.7 * k); v.ring.material.opacity = 0.25 + 0.5 * k;
            if (v.t >= W.windup) { v.state = 'attack'; v.t = 0; play(v, v.attackKind === 'shove' ? 'shove' : 'snatch', 0.05); }
            break;
          }
          case 'attack': {
            const W = v.attackKind === 'shove' ? A.shove : A.swipe;
            if (v.t <= dt + 1e-6) { // un solo instante de impacto, en la ventana activa
              const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - v.yaw));
              if (dist < W.range && ang < W.cone && Math.abs(P.pos.y - v.y) < 1.6) ctx.hurt(W.dmg, v.x, v.z, v.attackKind);
              ctx.fx.ring(v.x + Math.sin(v.yaw) * 1.2, v.y, v.z + Math.cos(v.yaw) * 1.2, 0xff6040, W.range);
            }
            if (v.t >= W.active) { v.state = 'recover'; v.t = 0; v.ring.visible = false; }
            break;
          }
          case 'recover': { // expuesto: sin guardia
            play(v, 'idle_breath');
            if (v.t > (v.attackKind === 'shove' ? 1.1 : 0.5)) { v.cd = v.attackKind === 'shove' ? 1.4 + rand() * 0.6 : 2.5; v.near = 0; v.state = A.flee ? 'flee' : 'confront'; }
            break;
          }
          case 'hitstun': play(v, 'hit_react', 0.05); if (v.t > v.stunT) { v.state = A.flee ? 'flee' : 'confront'; v.near = 0; } break;
          case 'stunned': play(v, 'stagger', 0.1); v.stars.rotation.y += dt * 4; if (v.t > 1.8) surrender(v); break;
          case 'surrender': play(v, 'hands_up', 0.2); faceTo(v, P.pos.x, P.pos.z, dt, 3); if (v.t > 3) { v.state = 'subdued'; v.t = 0; } break;
          case 'subdued': play(v, 'sit', 0.4); break;
          case 'leave': { // se va caminando (arrepentido) y desaparece lejos de la vista
            v.leaveT += dt; flee(v, P, dt, 1.8); play(v, 'walk_forward');
            if (v.leaveT > 7 || dist > 45) remove(v);
            break;
          }
          case 'escaped': case 'gone': break;
          default: break;
        }
        v.ch.group.position.set(v.x, v.y, v.z); v.ch.group.rotation.y = v.yaw;
        if (v.tag.visible) v.tag.position.y = 2.95 * A.scale + Math.sin(v.t * 5) * 0.08;
        if (dist < 160) v.mixer.update(dt);
      }
    },
    /** el director pide que se vaya (al terminar el incidente) */
    release(v) { if (v && !ENDED.has(v.state)) { v.state = 'leave'; v.t = 0; v.leaveT = 0; v.stars.visible = false; v.cur = -1; } },
    info() { return { count: list.length, stats: { ...stats }, list: list.map(v => ({ id: v.id, type: v.type, state: v.state, hp: v.hp, x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2), yaw: +v.yaw.toFixed(2), tied: +v.tiedT.toFixed(2), incident: v.incident, carrying: !!v.item, guard: !!v.A.guard })) }; },
  };
  return api;
}
