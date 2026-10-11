// Mateo: Ciudad de Altura — DIRECTOR DE INCIDENTES determinista (V2 P1), basado en docs/kit_v2/examples/crime_director.mjs
// y en game/data/incidentes.json. Cada incidente es una máquina de estados con actores reales de la ciudad:
//   spawn → approach (el villano se acerca a un vecino) → attempt (arrebato: el objeto pasa de la víctima al villano)
//   → alert (la víctima pide ayuda, un testigo señala; marca roja en el mapa) → pursuit (Mateo decide intervenir al
//   acercarse) → confront (combate no letal o cable) → recover (el villano se rinde y suelta el objeto) → return
//   (Mateo lo devuelve) → complete (agradecimiento, puntos y reputación local; se guarda UNA vez).
// Salidas limpias: expired (nadie atendió / se pasó el tiempo), escaped (el villano se alejó), cancelled (Mateo se fue
// lejos o cambió de distrito, debug). Al cerrar SIEMPRE se liberan víctima, testigo, villano y objeto (sin huérfanos).
// Semilla fija y `force()` para pruebas; límite de incidentes activos según la calidad; enfriamiento entre incidentes.
import * as THREE from 'three';
import { rng } from './util.js';

const ITEM_NAMES = { mochila: 'la mochila', caja: 'la caja', paquete: 'el paquete', cartel: 'el cartel' };
const END = new Set(['complete', 'expired', 'escaped', 'cancelled']);

function itemMesh(kind) {
  const g = new THREE.Group(), m = (geo, c, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (kind === 'mochila') { m(new THREE.BoxGeometry(0.32, 0.4, 0.18), 0x2ecc71); m(new THREE.BoxGeometry(0.26, 0.14, 0.06), 0x27ae60, 0, -0.08, 0.11); }
  else if (kind === 'caja') { m(new THREE.BoxGeometry(0.42, 0.3, 0.32), 0x8a5a32); m(new THREE.BoxGeometry(0.44, 0.05, 0.34), 0xc8a050, 0, 0.17, 0); }
  else if (kind === 'paquete') { m(new THREE.BoxGeometry(0.4, 0.3, 0.3), 0xc89a5a); m(new THREE.BoxGeometry(0.41, 0.06, 0.31), 0xe8d8a0); }
  else { m(new THREE.BoxGeometry(0.9, 0.5, 0.06), 0xffcf3f); m(new THREE.BoxGeometry(0.7, 0.3, 0.07), 0xc0392b); }
  return g;
}

export function createIncidents(ctx) {
  // ctx: { data, city, nav, people, villains, enemies, player, ui, sfx, fx, save, scene, carryAnchor, quality(), districtAt(x,z), dayPhase(), questActive(), touch, onEvent }
  const D = ctx.data.defaults, defs = Object.fromEntries(ctx.data.events.map(e => [e.id, e]));
  const S = () => ctx.save.data;
  const group = new THREE.Group(); group.name = 'incidentes'; ctx.scene.add(group);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff6b5a, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
  beacon.visible = false; group.add(beacon);
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ff6ff, toneMapped: false }));
  glow.visible = false; group.add(glow);
  let seed = 1234, rand = rng(seed), seq = 0, clock = 0, nextAt = D.firstDelaySeconds;
  const active = [], history = [], results = [];
  const stats = { spawned: 0, complete: 0, expired: 0, escaped: 0, cancelled: 0, rewards: 0, failedSpawns: 0, maxActive: 0, byType: {} };

  const P = () => ctx.player.P;
  const maxActive = () => (D.maxConcurrent[ctx.quality()] || 1);
  function rec(inc, state, extra = {}) {
    inc.state = state; inc.t = 0;
    const e = { incidentId: inc.id, type: inc.type, state, location: { x: +inc.loc.x.toFixed(1), z: +inc.loc.z.toFixed(1), district: inc.loc.district }, victimId: inc.victimId, thiefId: inc.villainId, timestamp: +clock.toFixed(2), ...extra };
    history.push(e); if (history.length > 200) history.shift();
    ctx.onEvent('incident', e);
  }

  /* ---------- elección de lugar y actores ---------- */
  const portals = () => ctx.city.interiors.map(it => ({ x: it.x, z: it.z - it.d / 2 }));
  function validSpot(x, z) {
    if (!ctx.city.world.hasFloor(x, z)) return false;
    if (portals().some(p => Math.hypot(p.x - x, p.z - z) < D.noSpawnNearInteriorPortal)) return false;
    return true;
  }
  function chooseVictim(def, near, maxR) {
    const Pl = P(), kinds = def.victim === 'comerciante' ? ['comerciante'] : ['walker', 'ambient'];
    const cands = ctx.people.people.filter(p => p.active && !p.dyn && !p.cross && !p.scared && kinds.includes(p.kind) && !(p.kind === 'walker' && p.role === 'corredor') && def.districts.includes(ctx.districtAt(p.x, p.z)) && validSpot(p.x, p.z));
    const scored = cands.map(p => ({ p, d: Math.hypot(p.x - Pl.pos.x, p.z - Pl.pos.z), n: near ? Math.hypot(p.x - near.x, p.z - near.z) : 0 }))
      .filter(o => near ? o.n < maxR : o.d >= D.minimumDistanceFromPlayer && o.d <= D.maximumDistanceFromPlayer)
      .sort((a, b) => (near ? a.n - b.n : a.d - b.d) || a.p.x - b.p.x);
    if (!scored.length) return null;
    return near ? scored[0].p : scored[Math.floor(rand() * Math.min(scored.length, 6))].p;
  }
  function villainStart(victim, dist = 14) {
    // en la misma vereda (anillo de la manzana) que la víctima, a ~dist m: llega caminando sin cruzar media ciudad
    const nav = ctx.nav, vb = nav.nodes[nav.nearest(victim.x, victim.z)].block; let best = -1, bs = 1e9;
    for (const n of nav.nodes) { const d = Math.hypot(n.x - victim.x, n.z - victim.z); const s = Math.abs(d - dist) + (n.block === vb ? 0 : 40); if (d > 8 && s < bs && ctx.city.world.hasFloor(n.x, n.z)) { bs = s; best = n.id; } }
    return best >= 0 ? nav.nodes[best] : { x: victim.x + 10, z: victim.z };
  }

  /* ---------- crear un incidente ---------- */
  function spawn(type, opts = {}) {
    const def = defs[type]; if (!def) return { ok: false, reason: 'tipo desconocido' };
    if (def.schedule === 'shop_open' && ctx.dayPhase() === 'noche') return { ok: false, reason: 'los negocios están cerrados' };
    const victim = chooseVictim(def, opts.near, opts.near ? (opts.maxR || 60) : 0);
    if (!victim) { stats.failedSpawns++; return { ok: false, reason: 'sin vecinos disponibles en rango' }; }
    const id = `${type}-${++seq}`;
    const inc = { id, type, def, state: 'spawn', t: 0, start: clock, expires: clock + def.durationSeconds, loc: { x: victim.x, z: victim.z, district: ctx.districtAt(victim.x, victim.z) }, victim, victimId: `${victim.kind}@${victim.x.toFixed(0)},${victim.z.toFixed(0)}`, witness: null, villain: null, drone: null, villainId: null, item: { kind: def.item, mesh: itemMesh(def.item), at: 'victim' }, engaged: false, announced: false, pursuitT: 0 };
    ctx.people.assign(victim, 'espera', {});
    attachItem(inc, 'victim');
    if (def.villain === 'dron') {
      const sh = victim.shop || { x: victim.x, z: victim.z, nx: 0, nz: 1 };
      inc.sign = { x: sh.x + sh.nx * 0.25, y: 3.4, z: sh.z + sh.nz * 0.25 };
      inc.item.at = 'wall'; inc.item.mesh.position.set(inc.sign.x, inc.sign.y, inc.sign.z); inc.item.mesh.rotation.y = Math.atan2(sh.nx, sh.nz); group.add(inc.item.mesh);
      const d = ctx.enemies.spawnDrone(inc.sign.x + 18, 16, inc.sign.z + 18, 'inc_' + id);
      d.home = { x: inc.sign.x + sh.nx * 4, y: 6, z: inc.sign.z + sh.nz * 4 }; d.state = 'patrol';
      inc.drone = d; inc.villainId = 'inc_' + id;
    } else {
      const st = villainStart(victim, def.villain === 'grandote' ? 11 : 15);
      const v = ctx.villains.spawn(def.villain, st.x, st.z, { incident: id, surrender: def.lines.surrender, yaw: Math.atan2(victim.x - st.x, victim.z - st.z) });
      const path = ctx.nav.path(ctx.nav.nearest(st.x, st.z), ctx.nav.nearest(victim.x, victim.z)) || [];
      v.noEscape = true; v.target = { x: victim.x, z: victim.z, r: 1.1, speed: def.villain === 'grandote' ? 1.6 : 1.9, face: victim, path };
      v.state = 'walk'; inc.villain = v; inc.villainId = v.id;
    }
    active.push(inc); stats.spawned++; stats.maxActive = Math.max(stats.maxActive, active.length); stats.byType[type] = (stats.byType[type] || 0) + 1;
    nextAt = Math.max(nextAt, clock + D.cooldownSeconds);
    rec(inc, 'approach');
    return { ok: true, id };
  }
  function attachItem(inc, where) {
    const it = inc.item, m = it.mesh; m.removeFromParent(); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.setScalar(1);
    if (where === 'victim') { const b = inc.victim.ch.bones; (b.chest || inc.victim.ch.group).add(m); m.position.set(0, it.kind === 'mochila' ? 0 : -0.05, it.kind === 'mochila' ? -0.24 : 0.25); }
    else if (where === 'villain') { const h = inc.villain.hand || inc.villain.ch.group; h.add(m); m.position.set(0, -0.12, 0.05); }
    else if (where === 'drone') { inc.drone.m.group.add(m); m.position.set(0, -0.7, 0); }
    else if (where === 'player') { const a = ctx.carryAnchor(); a.add(m); m.position.set(0, -0.12, 0.08); m.scale.setScalar(0.8); }
    else if (where === 'ground') { group.add(m); m.position.set(inc.drop.x, inc.drop.y + 0.25, inc.drop.z); }
    it.at = where;
  }
  /** cierra el incidente y libera todo (sin huérfanos) */
  function close(inc, state, why = '') {
    if (END.has(inc.state)) return;
    rec(inc, state, why ? { why } : {});
    stats[state]++;
    const Pl = P();
    if (inc.villain) { const v = inc.villain, far = Math.hypot(v.x - Pl.pos.x, v.z - Pl.pos.z) > 40; if (far || state === 'cancelled' || v.state === 'escaped') ctx.villains.remove(v); else ctx.villains.release(v); ctx.villains.setTag(v, false); }
    if (inc.drone) ctx.enemies.clear('inc_' + inc.id);
    inc.item.mesh.removeFromParent();
    // V2 P3 (B-27): el objeto robado se crea por incidente; sin liberar dejaba 2 geometrías y 2 materiales en la GPU cada vez
    inc.item.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (inc.witness) ctx.people.release(inc.witness);
    if (state === 'complete') ctx.people.assign(inc.victim, 'agradecido', { say: inc.def.lines.thanks, sec: 3.5, color: '#e6fff0' });
    else { if (inc.engaged && state !== 'cancelled') ctx.people.say(inc.victim, '¡Uf! Bueno... gracias igual.', 2.5); ctx.people.release(inc.victim); }
    if (state === 'expired' || state === 'escaped') { inc.repDelta = -1; if (inc.engaged) ctx.ui.toast(state === 'escaped' ? '💨 El villano se escapó esta vez. ¡Ya va a haber otra oportunidad!' : '⌛ El incidente terminó sin ayuda.', 2400); }
    active.splice(active.indexOf(inc), 1);
    results.push({ id: inc.id, type: inc.type, state, at: +clock.toFixed(1) }); if (results.length > 60) results.shift();
    nextAt = Math.max(nextAt, clock + 25);
  }
  function complete(inc) {
    const S_ = S(), d = inc.loc.district;
    S_.points += inc.def.rewardPoints; S_.rep[d] = (S_.rep[d] || 0) + inc.def.reputation; S_.inc[inc.type] = (S_.inc[inc.type] || 0) + 1; S_.stats.incidents++;
    ctx.save.flush(); stats.rewards++;
    ctx.ui.big('¡AYUDASTE A UN VECINO!', `${inc.def.name.toUpperCase()} · +${inc.def.rewardPoints} PTS · +${inc.def.reputation} REPUTACIÓN`, 2.6);
    ctx.sfx.win(); ctx.fx.confetti(P().pos.x, P().pos.y + 2, P().pos.z);
    close(inc, 'complete');
  }

  /* ---------- máquina de estados ---------- */
  function step(inc, dt) {
    inc.t += dt;
    const Pl = P(), v = inc.villain, dr = inc.drone, vic = inc.victim;
    const vx = v ? v.x : dr ? dr.x : inc.loc.x, vz = v ? v.z : dr ? dr.z : inc.loc.z;
    const dPl = Math.hypot(vx - Pl.pos.x, vz - Pl.pos.z), dLoc = Math.hypot(inc.loc.x - Pl.pos.x, inc.loc.z - Pl.pos.z);
    // vigilancia: duración total, distancia de cancelación y cambio de distrito
    if (clock > inc.expires) return close(inc, 'expired', 'duración');
    if (Math.min(dPl, dLoc) > D.cancelDistance || (ctx.districtAt(Pl.pos.x, Pl.pos.z) !== inc.loc.district && Math.min(dPl, dLoc) > 120)) return close(inc, 'cancelled', 'Mateo se alejó');
    if (!vic.active && vic.kind === 'ambient') return close(inc, 'cancelled', 'la víctima se descargó');
    switch (inc.state) {
      case 'approach':
        if (v && v.state === 'arrived') { v.state = 'snatch'; v.t = 0; rec(inc, 'attempt'); }
        if (dr && Math.hypot(dr.x - inc.sign.x, dr.z - inc.sign.z) < 10) { rec(inc, 'attempt'); ctx.fx.zap(inc.sign.x, inc.sign.y, inc.sign.z); }
        if (inc.t > 30) return close(inc, 'cancelled', 'no pudo acercarse');
        break;
      case 'attempt':
        if (inc.t > 0.35 && inc.item.at !== 'villain' && inc.item.at !== 'drone') attachItem(inc, v ? 'villain' : 'drone');
        if (inc.t > 0.6) {
          ctx.people.assign(vic, 'victima', { say: inc.def.lines.alert, sec: 4, color: '#ffe2d6', mark: true, look: () => ({ x: v ? v.x : dr.x, z: v ? v.z : dr.z }) });
          const w = ctx.people.pick(vic.x, vic.z, 30, ['walker', 'ambient', 'comerciante', 'paseante'], vic);
          if (w) { inc.witness = w; ctx.people.assign(w, 'testigo', { say: inc.def.lines.witness, sec: 3.5, color: '#fff6d8', look: () => ({ x: v ? v.x : dr.x, z: v ? v.z : dr.z }) }); }
          if (v) { v.state = v.A.flee ? 'flee' : 'walkaway'; v.cur = -1; v.speedScale = 0.6; ctx.villains.setTag(v, true); }
          if (dr) { dr.home = { x: inc.sign.x, y: 12, z: inc.sign.z }; }
          rec(inc, 'alert', { witness: inc.witness ? inc.witness.kind : null });
          ctx.sfx.beep(); ctx.ui.toast(`🆘 ${inc.def.lines.alert} — seguí la marca roja`, 3200);
        }
        break;
      case 'alert':
        if (dPl < 32) { inc.engaged = true; if (v) { v.noEscape = false; v.speedScale = 1; } rec(inc, 'pursuit'); ctx.ui.toast(v ? `¡Ahí va el ${v.A.name.toLowerCase()}! Alcanzalo` : '¡El dron se llevó el cartel! Desactivalo (golpe o cable)', 2200); }
        else if (inc.t > D.alertSeconds) return close(inc, 'expired', 'nadie atendió el aviso');
        break;
      case 'pursuit': case 'confront':
        inc.pursuitT += dt;
        if (v) {
          if (inc.state === 'pursuit' && (dPl < 3.5 || v.hits > 0 || v.tiedT > 0)) rec(inc, 'confront');
          if (v.state === 'escaped' || (dPl > 70 && inc.pursuitT > 8) || inc.pursuitT > D.escapeSeconds) return close(inc, 'escaped', 'se alejó');
          if (['surrender', 'subdued'].includes(v.state)) { inc.drop = { x: v.x + Math.sin(v.yaw) * 0.8, y: v.y, z: v.z + Math.cos(v.yaw) * 0.8 }; attachItem(inc, 'ground'); ctx.villains.setTag(v, false); rec(inc, 'recover'); }
        } else if (dr) {
          if (inc.state === 'pursuit' && (dr.state === 'chase' || dr.state === 'tele' || dPl < 8)) rec(inc, 'confront');
          if (dr.disabled && dr.state === 'landed') { inc.drop = { x: dr.x, y: ctx.city.world.groundAt(dr.x, dr.z, dr.y + 1), z: dr.z }; attachItem(inc, 'ground'); rec(inc, 'recover'); }
          if (inc.pursuitT > D.escapeSeconds + 40) return close(inc, 'escaped', 'el dron se fue');
        }
        break;
      case 'recover': {
        const it = inc.item.mesh; it.rotation.y += dt * 2; it.position.y = inc.drop.y + 0.35 + Math.sin(clock * 3) * 0.08;
        if (Math.hypot(it.position.x - Pl.pos.x, it.position.z - Pl.pos.z) < 1.6 && Math.abs(it.position.y - Pl.pos.y - 0.6) < 2) {
          attachItem(inc, 'player'); ctx.sfx.medal(); ctx.ui.toast(`🎒 ¡Recuperaste ${ITEM_NAMES[inc.item.kind]}! Devolvésela a la víctima (marca roja)`, 2600);
          ctx.people.assign(vic, 'espera', { mark: true, look: () => ({ x: P().pos.x, z: P().pos.z }) });
          if (v) ctx.villains.release(v);
          rec(inc, 'return');
        }
        if (inc.t > D.returnSeconds) return close(inc, 'expired', 'el objeto quedó tirado');
        break;
      }
      case 'return':
        if (inc.t > D.returnSeconds) return close(inc, 'expired', 'no se devolvió a tiempo');
        break;
    }
  }

  /* ---------- API ---------- */
  const api = {
    get active() { return active; },
    update(dt, state) {
      clock += dt;
      for (const inc of active.slice()) step(inc, dt);
      // marcadores
      const tgt = api.target();
      beacon.visible = !!tgt; if (tgt) beacon.position.set(tgt.x, 30, tgt.z);
      glow.visible = false;
      for (const inc of active) if (inc.state === 'recover') { glow.visible = true; glow.position.set(inc.item.mesh.position.x, inc.drop.y + 0.08, inc.item.mesh.position.z); }
      // director: aparece uno nuevo cuando corresponde (jugando, sin misión activa, sin pasarse del límite)
      if (state === 'play' && S().settings.incidents !== false && !ctx.questActive() && clock >= nextAt && active.length < maxActive()) {
        const pool = ctx.data.events.filter(e => e.districts.includes(ctx.districtAt(P().pos.x, P().pos.z)) && !(e.schedule === 'shop_open' && ctx.dayPhase() === 'noche') && !(e.schedule === 'day' && ctx.dayPhase() === 'noche'));
        if (pool.length) { const def = pool[Math.floor(rand() * pool.length)]; const r = spawn(def.id); if (!r.ok) nextAt = clock + 15; }
        else nextAt = clock + 30;
      }
    },
    /** punto al que hay que ir (para baliza, minimapa y HUD) */
    target() {
      const inc = api.focus(); if (!inc) return null;
      if (inc.state === 'return' || inc.state === 'alert' || inc.state === 'approach' || inc.state === 'attempt') return { x: inc.victim.x, z: inc.victim.z, y: 0 };
      if (inc.state === 'recover') return { x: inc.item.mesh.position.x, z: inc.item.mesh.position.z, y: inc.drop.y };
      if (inc.villain) return { x: inc.villain.x, z: inc.villain.z, y: inc.villain.y };
      if (inc.drone) return { x: inc.drone.x, z: inc.drone.z, y: inc.drone.y };
      return null;
    },
    /** incidente al que Mateo está atendiendo (o el más cercano anunciado) */
    focus() { const Pl = P(); let best = null, bd = 1e9; for (const inc of active) { if (inc.state === 'approach' || inc.state === 'attempt') continue; const d = (inc.engaged ? 0 : 1000) + Math.hypot(inc.loc.x - Pl.pos.x, inc.loc.z - Pl.pos.z); if (d < bd) { bd = d; best = inc; } } return best; },
    interactTarget() {
      const Pl = P();
      for (const inc of active) if (inc.state === 'return' && Math.hypot(inc.victim.x - Pl.pos.x, inc.victim.z - Pl.pos.z) < 2.8) return { kind: 'incident', inc, label: `Devolver ${ITEM_NAMES[inc.item.kind]}` };
      return null;
    },
    interact(t) { if (t && t.inc && t.inc.state === 'return') complete(t.inc); },
    objective() {
      const inc = api.focus(); if (!inc) return null;
      const Pl = P(), tg = api.target(), v = inc.villain, who = v ? `al ${v.A.name.toLowerCase()}` : 'al dron', thing = ITEM_NAMES[inc.item.kind];
      const step = { alert: '¡Un vecino pide ayuda! Acercate a la marca roja', pursuit: `Perseguí ${who}`, confront: v ? `Reducilo sin lastimar: golpes, patada, golpe cargado o cable (${ctx.touch ? 'CABLE' : 'F'})` : `Desactivá el dron: saltá y golpealo o atrapalo con el cable (${ctx.touch ? 'CABLE' : 'F'})`, recover: `Agarrá ${thing}`, return: `Devolvé ${thing} (${ctx.touch ? 'ACCIÓN' : 'E'})` }[inc.state] || '';
      return { kind: 'AYUDA', engaged: inc.engaged, name: '🆘 ' + inc.def.name, step, dist: tg ? Math.hypot(Pl.pos.x - tg.x, Pl.pos.z - tg.z) : null, dy: tg ? (tg.y || 0) - Pl.pos.y : 0, time: null };
    },
    /** villano cerca: muestra los botones de combate táctiles */
    get combatNear() { const Pl = P(); return active.some(inc => (inc.villain && Math.hypot(inc.villain.x - Pl.pos.x, inc.villain.z - Pl.pos.z) < 14 && !['surrender', 'subdued', 'leave'].includes(inc.villain.state)) || (inc.drone && !inc.drone.disabled && Math.hypot(inc.drone.x - Pl.pos.x, inc.drone.z - Pl.pos.z) < 16)); },
    drawMap(c, X, Y) {
      for (const inc of active) {
        if (inc.state === 'approach') continue;
        const tg = inc.state === 'return' || inc.state === 'alert' || inc.state === 'attempt' ? inc.victim : inc.state === 'recover' ? inc.item.mesh.position : (inc.villain || inc.drone);
        if (!tg) continue;
        c.fillStyle = inc.state === 'pursuit' || inc.state === 'confront' ? '#ff9a3a' : '#ff5a4a';
        c.beginPath(); c.arc(X(tg.x), Y(tg.z), 7, 0, 7); c.fill();
        c.fillStyle = '#fff'; c.font = '900 10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', X(tg.x), Y(tg.z) + 0.5);
      }
    },
    /** el dron de un incidente fue desactivado (evento del módulo de rivales) */
    onDroneDown(tag) { for (const inc of active) if (inc.drone && 'inc_' + inc.id === tag && inc.state === 'pursuit') rec(inc, 'confront'); },
    onExhausted() { for (const inc of active) if (inc.engaged && (inc.state === 'pursuit' || inc.state === 'confront')) close(inc, 'escaped', 'Mateo se cansó'); },
    force(type, o = {}) { return spawn(type, o); },
    cancelAll(why = 'debug') { for (const inc of active.slice()) close(inc, 'cancelled', why); },
    seed(n) { seed = n; rand = rng(n); seq = 0; },
    setNext(t) { nextAt = clock + t; },
    get clock() { return clock; },
    info() {
      return {
        clock: +clock.toFixed(2), nextAt: +nextAt.toFixed(2), seed, maxActive: maxActive(), stats: JSON.parse(JSON.stringify(stats)),
        active: active.map(i => ({ id: i.id, type: i.type, state: i.state, t: +i.t.toFixed(2), engaged: i.engaged, loc: { x: +i.loc.x.toFixed(1), z: +i.loc.z.toFixed(1), district: i.loc.district }, victim: { kind: i.victim.kind, x: +i.victim.x.toFixed(2), z: +i.victim.z.toFixed(2), dyn: i.victim.dyn }, witness: i.witness ? i.witness.kind : null, villain: i.villain ? { id: i.villain.id, type: i.villain.type, state: i.villain.state, x: +i.villain.x.toFixed(2), z: +i.villain.z.toFixed(2), hp: i.villain.hp } : i.drone ? { id: 'inc_' + i.id, type: 'dron', state: i.drone.state, x: +i.drone.x.toFixed(2), y: +i.drone.y.toFixed(2), z: +i.drone.z.toFixed(2), disabled: i.drone.disabled } : null, item: { kind: i.item.kind, at: i.item.at, x: +i.item.mesh.position.x.toFixed(2), z: +i.item.mesh.position.z.toFixed(2) }, expiresIn: +(i.expires - clock).toFixed(1) })),
        history: history.slice(-40), results: results.slice(-20),
      };
    },
  };
  return api;
}
