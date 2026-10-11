// Mateo: Ciudad de Altura — combate arcade NO letal (V2 P1). Movimientos con ventanas claras:
//   anticipación (startup) → ventana activa (el golpe sólo cuenta acá y sólo si la hitbox toca la hurtbox) → recuperación
//   (se puede encadenar desde `cancel`). Combo: golpe → cruzado → patada. Patada directa (R / Y / PATADA).
//   Mantener ACCIÓN carga el golpe cargado (rompe la guardia del grandote). Guardia (Q / LT / GUARDIA) bloquea de frente.
//   Esquiva (C / B / ESQUIVA): impulso corto con invulnerabilidad y enfriamiento. Cable inmovilizador (F/clic/CABLE sobre
//   un villano): lo ata 3,5 s; si Mateo se queda cerca, se rinde sin más golpes.
// Prioridades: golpe recibido > esquiva > golpe activo > guardia > recuperación > moverse. Nunca daña vecinos: sólo hay
// hurtboxes de villanos/rivales; si un vecino queda dentro de la hitbox se cuenta como «protegido» y no pasa nada.
import * as THREE from 'three';
import { wrapAngle } from './util.js';

export const MOVES = {
  jab: { clip: 'punch_jab', startup: 0.06, active: 0.09, recovery: 0.17, reach: 1.25, radius: 0.75, dmg: 1, stun: 0.45, knock: 1.8, cancel: 0.06, next: 'cross', lunge: 2 },
  cross: { clip: 'punch_cross', startup: 0.07, active: 0.09, recovery: 0.2, reach: 1.25, radius: 0.75, dmg: 1, stun: 0.5, knock: 2.2, cancel: 0.08, next: 'kick', lunge: 2 },
  kick: { clip: 'kick_front', startup: 0.14, active: 0.1, recovery: 0.3, reach: 1.6, radius: 0.85, dmg: 2, stun: 0.7, knock: 4, cancel: 0.16, next: null, lunge: 1.5, cd: 0.25 },
  charged: { clip: 'charged_strike', startup: 0.1, active: 0.12, recovery: 0.42, reach: 1.7, radius: 1.0, dmg: 3, stun: 1.2, knock: 6, cancel: 0.3, next: null, guardBreak: true, lunge: 4, cd: 0.9 },
};
export const COMBAT_TUNE = { dodgeTime: 0.32, dodgeSpeed: 10, iframes: [0.03, 0.3], dodgeCd: 0.55, bindCd: 3, bindRange: 18, chargeStart: 0.3, chargeFull: 0.6, chargeMin: 0.45, comboWindow: 0.6, guardMove: 0.35, assistRange: 3.2, assistAngle: 1.2 };

export function createCombat({ player, input, villains, enemies, people, fx, sfx, scene, onEvent, settings }) {
  const T = COMBAT_TUNE;
  const C = { state: 'idle', move: null, name: '', t: 0, phase: '', hit: new Set(), combo: 0, comboT: 0, queued: null, holdT: 0, holding: false, charge: 0, dodgeT: 0, bindT: 0, cd: { dodge: 0, charged: 0, bind: 0, kick: 0 },
    stats: { hits: 0, blocked: 0, whiffs: 0, dodges: 0, perfectDodges: 0, guardBlocks: 0, binds: 0, civilianHits: 0, civilianProtected: 0, legacyHits: 0, moves: {}, outOfWindow: 0 }, log: [] };
  // cable visual del inmovilizador
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x7ff6ff, toneMapped: false }));
  rope.visible = false; rope.frustumCulled = false; scene.add(rope);
  let ropeT = 0, ropeTo = null;
  const P = () => player.P;
  const log = (e) => { C.log.push(e); if (C.log.length > 60) C.log.shift(); };

  function start(name) {
    const m = MOVES[name]; const Pl = P();
    C.state = 'attack'; C.move = m; C.name = name; C.t = 0; C.phase = 'startup'; C.hit.clear(); C.queued = null;
    if (m.cd) C.cd[name === 'charged' ? 'charged' : 'kick'] = m.cd;
    C.stats.moves[name] = (C.stats.moves[name] || 0) + 1;
    // asistencia suave de apuntado (no mueve la cámara): gira a Mateo hacia el villano más cercano delante
    if (settings().autoTarget !== false) {
      let best = null, bd = T.assistRange;
      for (const tg of villains.targets()) { const dx = tg.x - Pl.pos.x, dz = tg.z - Pl.pos.z, d = Math.hypot(dx, dz); if (d < bd && Math.abs(wrapAngle(Math.atan2(dx, dz) - Pl.yaw)) < T.assistAngle) { bd = d; best = tg; } }
      if (best) Pl.yaw = Math.atan2(best.x - Pl.pos.x, best.z - Pl.pos.z);
    }
    player.oneShot(m.clip, m.startup + m.active + m.recovery);
    sfx.whoosh ? sfx.whoosh(0.35) : null;
    log({ t: 'start', move: name });
  }
  /** resolución de la ventana activa: hitbox (esfera delante de Mateo) contra hurtboxes (cilindros) */
  function resolve() {
    const Pl = P(), m = C.move, fx_ = Math.sin(Pl.yaw), fz = Math.cos(Pl.yaw);
    const hx = Pl.pos.x + fx_ * m.reach * 0.75, hz = Pl.pos.z + fz * m.reach * 0.75, hy = Pl.pos.y + 1.0;
    let any = 0;
    for (const tg of villains.targets()) {
      if (C.hit.has(tg.v.id)) continue;
      const d = Math.hypot(tg.x - hx, tg.z - hz);
      if (d > m.radius + tg.r || hy < tg.y - 0.2 || hy > tg.y + tg.h + 0.2) continue;
      C.hit.add(tg.v.id);
      const r = villains.hit(tg.v, m, Pl);
      if (r === 'hit' || r === 'ko') { any++; C.stats.hits++; if (C.name === 'charged') C.stats.chargedHits = (C.stats.chargedHits || 0) + 1; Pl.hitstop = 0.05; fx.sparkle(tg.x, tg.y + 1.2, tg.z, 0xffffff, 6); }
      else if (r === 'blocked') { any++; C.stats.blocked++; }
      log({ t: 'hit', move: C.name, target: tg.v.id, r });
    }
    // rivales de las misiones V1 (drones, ladrón de la mochila, autómata): el golpe libera el pulso de energía de siempre
    const legacy = enemies.attack(Pl);
    if (legacy) { any += legacy; C.stats.legacyHits += legacy; }
    // vecinos: nunca reciben daño; si alguno quedó dentro de la hitbox se cuenta como protegido
    const civ = people.near(hx, hz, m.radius + 0.4);
    if (civ.length) C.stats.civilianProtected += civ.length;
    if (!any) C.stats.whiffs++;
    // efecto proporcional: chispas chicas en los golpes, onda de energía sólo en el golpe cargado
    if (C.name === 'charged') { fx.pulse(hx, hy, hz); sfx.pulse(); }
    else if (any) { fx.sparkle(hx, hy, hz, 0xfff2a0, 6); sfx.land(0.5); }
    else sfx.whoosh(0.25);
    return any;
  }

  const api = {
    C, MOVES,
    /** ACCIÓN sin interacción cercana: golpe (o encadenar el combo) */
    press(kind = 'punch') {
      const Pl = P(); if (Pl.stun > 0 || Pl.talking) return false;
      if (kind === 'kick') { if (C.cd.kick > 0) return false; if (C.state === 'idle' || C.state === 'guard' || (C.state === 'attack' && C.phase === 'recovery' && C.t >= C.move.cancel)) { start('kick'); return true; } C.queued = 'kick'; return true; }
      C.holding = true; C.holdT = 0;
      if (C.state === 'idle' || C.state === 'guard') { start(C.comboT > 0 && C.combo === 1 ? 'cross' : C.comboT > 0 && C.combo === 2 ? 'kick' : 'jab'); C.combo = C.name === 'jab' ? 1 : C.name === 'cross' ? 2 : 0; return true; }
      if (C.state === 'attack') { C.queued = C.move.next || 'jab'; return true; }
      return false;
    },
    /** cable sobre un villano (devuelve true si lo usó) */
    tryBind(yaw) {
      const Pl = P(); if (C.cd.bind > 0 || Pl.stun > 0 || C.state === 'dodge') return false;
      const v = villains.bindTarget(Pl, yaw, T.bindRange); if (!v) return false;
      villains.tie(v); C.cd.bind = T.bindCd; C.stats.binds++; C.state = 'bind'; C.bindT = 0.45; ropeTo = v; ropeT = 0.7;
      Pl.yaw = Math.atan2(v.x - Pl.pos.x, v.z - Pl.pos.z); player.oneShot('cable_bind', 0.45); sfx.cable(); fx.zap(v.x, v.y + 1.2, v.z);
      onEvent('bind', { id: v.id }); log({ t: 'bind', target: v.id });
      return true;
    },
    /** paso fijo: entradas de guardia/esquiva/patada, ventanas de los golpes y carga */
    update(dt, cam, canFight) {
      const Pl = P();
      for (const k in C.cd) C.cd[k] = Math.max(0, C.cd[k] - dt);
      C.comboT = Math.max(0, C.comboT - dt); if (C.comboT <= 0 && C.state === 'idle') C.combo = 0;
      if (ropeT > 0) { ropeT -= dt; rope.visible = ropeT > 0 && !!ropeTo; }
      // golpe recibido: cancela todo
      if (Pl.stun > 0 || !canFight) { if (C.state !== 'idle') { C.state = 'idle'; C.move = null; } Pl.guard = false; Pl.combatMove = 1; C.charge = 0; C.holding = false; Pl.dodgeIF = 0; return; }
      if (C.holding) { if (input.held('action')) C.holdT += dt; else C.holding = false; }
      // esquiva (prioridad sobre todo lo demás que no sea un golpe recibido)
      if (input.pressed('dodge') && C.cd.dodge <= 0 && Pl.grounded && C.state !== 'dodge' && !(C.state === 'attack' && C.phase === 'active')) {
        const ax = input.axis(), yaw = cam.yaw; let dx = Math.sin(yaw) * ax.y - Math.cos(yaw) * ax.x, dz = Math.cos(yaw) * ax.y + Math.sin(yaw) * ax.x;
        if (Math.hypot(dx, dz) < 0.2) { dx = -Math.sin(Pl.yaw); dz = -Math.cos(Pl.yaw); } // sin dirección: hacia atrás
        const l = Math.hypot(dx, dz); C.dodgeDir = [dx / l, dz / l];
        C.state = 'dodge'; C.dodgeT = 0; C.cd.dodge = T.dodgeCd; C.stats.dodges++; C.charge = 0; C.holding = false;
        Pl.guard = false; Pl.dashT = T.dodgeTime; Pl.vel.x = C.dodgeDir[0] * T.dodgeSpeed; Pl.vel.z = C.dodgeDir[1] * T.dodgeSpeed;
        player.oneShot('dodge_roll', T.dodgeTime + 0.08); sfx.whoosh ? sfx.whoosh(0.6) : null; log({ t: 'dodge' });
      }
      if (input.pressed('kick')) api.press('kick');
      switch (C.state) {
        case 'dodge':
          C.dodgeT += dt; Pl.dodgeIF = C.dodgeT >= T.iframes[0] && C.dodgeT <= T.iframes[1] ? 1 : 0; Pl.combatMove = 0;
          if (C.dodgeT >= T.dodgeTime) { C.state = 'idle'; Pl.dodgeIF = 0; Pl.dashT = 0; }
          break;
        case 'attack': {
          const m = C.move; C.t += dt;
          if (C.phase === 'startup' && C.t >= m.startup) { C.phase = 'active'; const n = resolve(); log({ t: 'active', move: C.name, n }); Pl.vel.x += Math.sin(Pl.yaw) * m.lunge; Pl.vel.z += Math.cos(Pl.yaw) * m.lunge; }
          else if (C.phase === 'active' && C.t >= m.startup + m.active) C.phase = 'recovery';
          Pl.combatMove = C.phase === 'recovery' ? 0.5 : 0.2;
          if (C.phase === 'recovery') {
            const r = C.t - m.startup - m.active;
            // carga: manteniendo ACCIÓN después del primer golpe
            if (C.holding && C.holdT >= T.chargeStart && (C.name === 'jab' || C.name === 'cross') && C.cd.charged <= 0) { C.state = 'charge'; C.charge = 0; player.oneShot('', 0); break; }
            if (C.queued && r >= m.cancel) { const q = C.queued; C.combo = q === 'cross' ? 2 : q === 'kick' ? 0 : 1; start(q); C.comboT = T.comboWindow; break; }
            if (r >= m.recovery) { C.state = 'idle'; C.move = null; C.comboT = T.comboWindow; }
          }
          break;
        }
        case 'charge':
          C.charge = Math.min(1, C.charge + dt / T.chargeFull); Pl.combatMove = 0.3; Pl.chargeAtk = true;
          if (!input.held('action') || C.holdT > 3) { Pl.chargeAtk = false; C.holding = false; if (C.charge >= T.chargeMin) start('charged'); else C.state = 'idle'; C.charge = 0; }
          break;
        case 'bind': C.bindT -= dt; Pl.combatMove = 0.2; if (C.bindT <= 0) C.state = 'idle'; break;
        case 'guard': case 'idle':
          Pl.combatMove = 1; Pl.chargeAtk = false;
          if (input.held('guard') && Pl.grounded) {
            if (C.state !== 'guard') { C.stats.guards = (C.stats.guards || 0) + 1; log({ t: 'guard' }); }
            C.state = 'guard'; Pl.guard = true; Pl.combatMove = T.guardMove;
            // la guardia mira al villano más cercano (4 m): cubrirse no depende de la orientación exacta
            if (settings().autoTarget !== false) { let best = null, bd = 4; for (const tg of villains.targets()) { const d = Math.hypot(tg.x - Pl.pos.x, tg.z - Pl.pos.z); if (d < bd) { bd = d; best = tg; } } if (best) Pl.yaw = Math.atan2(best.x - Pl.pos.x, best.z - Pl.pos.z); }
          }
          else { C.state = 'idle'; Pl.guard = false; }
          break;
      }
      if (C.state !== 'guard') Pl.guard = false;
      if (C.state !== 'charge') Pl.chargeAtk = false;
    },
    render() {
      if (rope.visible && ropeTo) {
        const Pl = P(), a = new THREE.Vector3(Pl.pos.x, Pl.pos.y + 1.0, Pl.pos.z), b = new THREE.Vector3(ropeTo.x, ropeTo.y + 1.0, ropeTo.z), d = b.clone().sub(a), l = d.length();
        rope.position.copy(a); rope.scale.set(1, l, 1); rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      }
    },
    /** golpe recibido: guardia de frente bloquea; esquiva con invulnerabilidad lo evita */
    filterDamage(n, fromX, fromZ) {
      const Pl = P();
      if (Pl.dodgeIF > 0) { C.stats.perfectDodges++; onEvent('dodged', {}); return 0; }
      if (Pl.guard) { const a = Math.abs(wrapAngle(Math.atan2(fromX - Pl.pos.x, fromZ - Pl.pos.z) - Pl.yaw)); if (a < 1.75) { C.stats.guardBlocks++; onEvent('guardBlock', {}); return 0; } }
      return n;
    },
    get busy() { return C.state !== 'idle'; },
    info() { return { state: C.state, move: C.name, phase: C.phase, t: +C.t.toFixed(3), combo: C.combo, charge: +C.charge.toFixed(2), cd: { ...C.cd }, guard: !!P().guard, dodgeIF: P().dodgeIF || 0, stats: JSON.parse(JSON.stringify(C.stats)), log: C.log.slice(-20) }; },
  };
  return api;
}
