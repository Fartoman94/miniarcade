// @ts-check
/* Granja de Runas — Gran evento «Estación de Tormentas»: rescatar la cosecha, sin combate.
   Intro animada → Fase 1 Ráfagas (lonas) → Fase 2 Rayos y anegamiento (pararrayos y compuertas; el viento se lleva las lonas)
   → Fase 3 Ojo de la tormenta (melodía de campanas) → desenlace con recompensa (Runa de tormenta).
   Nada es irreversible: si se pierde más de lo permitido, la tormenta vuelve en dos días. */
import * as THREE from 'three';
import { rng } from '../../matelabs/kit3d.js';
import * as M from './models.js';
import { PLOT_POS, STORM_POS } from './world.js';

export const PHASES = ['', 'Ráfagas', 'Rayos y anegamiento', 'El ojo de la tormenta'];

/** @param {any} G */
export function createStorm(G) {
  const A = G.scenes.granja.anchors;
  const spirit = M.makeStormSpirit(); spirit.group.visible = false; G.scenes.granja.group.add(spirit.group);
  // rayo (malla de zigzag) y anillos de aviso
  const boltB = new M.Builder();
  let bx = 0; for (let i = 0; i < 6; i++) { const nx = (i % 2 ? 0.5 : -0.5) * (0.6 + i * 0.1); boltB.box(0.18, 2.2, 0.18, 0xfff7c2, [(bx + nx) / 2, 13 - i * 2.1 - 1.05, 0], [0, 0, (nx - bx) * 0.4]); bx = nx; }
  const bolt = M.mesh(boltB.build(), M.MAT.glow, false); bolt.visible = false; G.scenes.granja.group.add(bolt);
  const ringGeo = new THREE.RingGeometry(0.9, 1.25, 20); ringGeo.rotateX(-Math.PI / 2);
  const rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(ringGeo, M.MAT.danger.clone()); m.visible = false; G.scenes.granja.group.add(m); return { m, on: false, t: 0, x: 0, z: 0, plot: -1, player: false }; });
  const BELL_NAMES = ['roja', 'azul', 'amarilla'];

  const S = {
    active: false, phase: 0, t: 0, intro: 0, outro: 0, hp: /** @type {number[]} */ ([]), risk: /** @type {boolean[]} */ ([]), communal: /** @type {boolean[]} */ ([]),
    covered: /** @type {boolean[]} */ ([]), tarps: 6, gust: { t: 0, n: 0, lane: /** @type {number[]} */ ([]), tele: false, total: 7 },
    strikes: 0, strikeT: 0, rods: [0, 0, 0], gates: [false, false], flood: 0, floodT: 0,
    seq: /** @type {number[]} */ ([]), seqShow: 0, seqIdx: 0, input: 0, wrongs: 0, bellAnim: [0, 0, 0],
    result: /** @type {any} */ (null), r: rng(1), stun: 0,
  };

  function plotsAtRisk() { return S.risk.reduce((n, v) => n + (v ? 1 : 0), 0); }
  function alive() { let n = 0; for (let i = 0; i < S.hp.length; i++) if (S.risk[i] && S.hp[i] > 0) n++; return n; }

  function start() {
    const s = G.s;
    S.r = rng(s.seed + s.day * 31 + s.storm.tries * 7);
    S.active = true; S.phase = 0; S.t = 0; S.intro = 0; S.outro = 0; S.result = null; S.stun = 0;
    S.hp = []; S.risk = []; S.communal = []; S.covered = [];
    s.plots.forEach((p, i) => {
      let risk = false, communal = false;
      if (p.s === 'cultivo') risk = true;
      else if (p.s === 'vacia') { p.s = 'cultivo'; p.crop = 'trigo'; p.g = 0.55; p.w = 1; p.frost = 0; risk = true; communal = true; }
      S.risk.push(risk); S.communal.push(communal); S.hp.push(risk ? 2 : 0); S.covered.push(false);
      G.refreshPlot(i, false);
    });
    S.tarps = G.diffKey === 'facil' ? 8 : 6;
    S.gust = { t: 0, n: 0, lane: [], tele: false, total: G.diffKey === 'extremo' ? 9 : 7 };
    S.rods = [0, 0, 0]; S.gates = [false, false]; S.flood = 0; S.floodT = 0; S.strikes = 0; S.strikeT = 0;
    S.seq = []; S.seqShow = 0; S.seqIdx = 0; S.input = 0; S.wrongs = 0;
    s.storm.tries++;
    A.storm.visible = true; A.flood.visible = false;
    A.gates.forEach(g => { g.door.position.y = 0.3; });
    A.rods.forEach(r => { r.glow.visible = false; });
    spirit.group.visible = true; spirit.group.position.set(-4, 30, -6); spirit.group.scale.setScalar(0.6);
    G.critters.reset();
    G.mode = 'cutscene';
    G.sfx('thunder');
    G.ui.banner('⛈ GRAN EVENTO', 'Estación de Tormentas', 4200);
    G.emitLocal('stormStart');
  }

  /** Cámara cinemática durante la intro. */
  function introCam(k) {
    const a = -0.6 + k * 0.9;
    G.camOverride = { x: -4 + Math.sin(a) * 22, y: 8 + k * 4, z: 2 + Math.cos(a) * 22, lx: -4, ly: 6 + (1 - k) * 4, lz: -4 };
  }

  function setPhase(n) {
    S.phase = n; S.t = 0;
    if (n === 1) { G.ui.banner('FASE 1 · RÁFAGAS', 'Cubrí con lonas los surcos marcados en rojo', 3400); G.tut && G.tut('storm'); }
    if (n === 2) {
      // cambio de reglas: el viento arranca todas las lonas
      for (let i = 0; i < S.covered.length; i++) S.covered[i] = false;
      A.tarp.forEach(t => { t.visible = false; });
      A.flood.visible = true; A.flood.scale.set(1, 1, 1); A.flood.position.y = 0.02;
      S.strikeT = 2.2;
      G.ui.banner('FASE 2 · RAYOS Y AGUA', '¡El viento se llevó las lonas! Cargá pararrayos y abrí compuertas', 3800);
      G.sfx('thunder');
    }
    if (n === 3) {
      for (const r of rings) { r.on = false; r.m.visible = false; }
      A.flood.visible = false;
      const len = G.diffKey === 'facil' ? 3 : G.diffKey === 'extremo' ? 5 : 4;
      S.seq = []; for (let i = 0; i < len; i++) S.seq.push(Math.floor(S.r() * 3));
      S.seqShow = 0.01; S.seqIdx = 0; S.input = 0;
      G.ui.banner('FASE 3 · EL OJO', 'Mirá qué campanas suenan y repetí la melodía', 3600);
    }
    G.emitLocal('stormPhase', n);
  }

  function damage(i, why) {
    if (!S.risk[i] || S.hp[i] <= 0) return;
    S.hp[i]--;
    const P = PLOT_POS[i];
    G.burst(P[0], 0.6, P[1], why === 'zap' ? 0xfff7c2 : 0x6fbf55, 14);
    if (S.hp[i] <= 0) { G.pop('¡Perdida!', P[0], 1.6, P[1], '#ffb4a8'); G.sfx('lost'); }
    else G.pop('¡Dañada!', P[0], 1.4, P[1], '#ffd8a8');
    G.refreshPlot(i, true);
  }

  function pickLane() {
    const rowLane = S.r() < 0.5;
    if (rowLane) { const row = Math.floor(S.r() * 3); return [0, 1, 2, 3].map(c => row * 4 + c); }
    const col = Math.floor(S.r() * 4); return [0, 1, 2].map(rr => rr * 4 + col);
  }

  function update(dt, t) {
    if (!S.active) return;
    S.t += dt;
    spirit.group.rotation.y += dt * 0.15;
    spirit.eyes.scale.y = 0.85 + Math.abs(Math.sin(t * 2)) * 0.25;
    // intro cinemática (salteable)
    if (S.phase === 0) {
      S.intro += dt;
      const k = Math.min(1, S.intro / 4.5);
      spirit.group.position.set(-4, 30 - k * 14, -6); spirit.group.scale.setScalar(0.6 + k * 0.4);
      introCam(k);
      if (k >= 1 || G.skipPressed()) { G.camOverride = null; G.mode = 'play'; setPhase(1); }
      return;
    }
    if (S.phase === 4) { // desenlace
      S.outro += dt;
      spirit.group.position.y += dt * 6; spirit.group.scale.multiplyScalar(1 - dt * 0.3);
      if (S.outro > 3.2) finish();
      return;
    }
    S.stun = Math.max(0, S.stun - dt);
    // el gran espíritu baja sobre el campo y sigue el peligro (silueta siempre a la vista)
    {
      let tx = -5, tz = -7, ty = 6.2;
      if (S.phase === 1 && S.gust.tele && S.gust.lane.length) { tx = 0; tz = 0; for (const i of S.gust.lane) { tx += PLOT_POS[i][0]; tz += PLOT_POS[i][1]; } tx /= S.gust.lane.length; tz = tz / S.gust.lane.length - 7; }
      if (S.phase === 3) { ty = 5.2; tz = -9; }
      const k = Math.min(1, dt * 1.5), sp = spirit.group.position;
      sp.x += (tx - sp.x) * k; sp.y += (ty - sp.y) * k; sp.z += (tz - sp.z) * k;
      const sc = spirit.group.scale.x + (0.42 - spirit.group.scale.x) * k; spirit.group.scale.setScalar(sc);
    }
    // la lluvia y el viento empujan
    if (S.phase === 1) phase1(dt, t);
    else if (S.phase === 2) phase2(dt, t);
    else if (S.phase === 3) phase3(dt, t);
    // marcas visuales
    for (let i = 0; i < PLOT_POS.length; i++) {
      const tele = S.phase === 1 && S.gust.tele && S.gust.lane.includes(i);
      A.mark[i].visible = tele;
      if (tele) { A.mark[i].scale.setScalar(1 + Math.sin(t * 10) * 0.06); }
      A.tarp[i].visible = S.covered[i];
      if (S.covered[i]) A.tarp[i].rotation.z = Math.sin(t * 9 + i) * 0.03;
    }
    for (let k = 0; k < 3; k++) { S.bellAnim[k] = Math.max(0, S.bellAnim[k] - dt); A.bells[k].bell.rotation.z = Math.sin(S.bellAnim[k] * 18) * S.bellAnim[k] * 0.6; A.bells[k].bell.scale.setScalar(1 + S.bellAnim[k] * 0.25); }
  }

  function phase1(dt, t) {
    const tele = G.D.telegraph;
    S.gust.t += dt;
    if (!S.gust.tele && S.gust.t > 1.2) { S.gust.lane = pickLane(); S.gust.tele = true; S.gust.t = 0; G.sfx('wind'); }
    if (S.gust.tele) {
      // el viento empuja a la jugadora si está en el carril
      if (S.gust.t > tele) {
        for (const i of S.gust.lane) { if (S.covered[i]) { G.pop('¡Resistió!', PLOT_POS[i][0], 1.6, PLOT_POS[i][1], '#c3fae8'); continue; } damage(i, 'wind'); }
        G.sfx('gust'); G.shake(0.25);
        S.gust.tele = false; S.gust.t = 0; S.gust.n++;
        if (S.gust.n >= S.gust.total) setPhase(2);
      }
    }
  }

  function phase2(dt, t) {
    const tele = G.D.telegraph;
    // anegamiento: sube si no están abiertas las dos compuertas
    const open = S.gates[0] && S.gates[1];
    S.flood = Math.max(0, Math.min(1, S.flood + (open ? -dt / 3 : dt / 16)));
    A.flood.position.y = 0.02 + S.flood * 0.32;
    if (S.flood >= 1) {
      S.floodT += dt;
      if (S.floodT > 6) { S.floodT = 0; for (let i = 8; i < 12; i++) damage(i, 'flood'); G.sfx('splash'); }
    } else S.floodT = 0;
    // rayos con aviso
    S.strikeT -= dt;
    if (S.strikeT <= 0 && S.t < 30) {
      S.strikeT = 2.4;
      const ring = rings.find(q => !q.on);
      if (ring) {
        const targetPlayer = S.r() < 0.28;
        const cand = []; for (let i = 0; i < S.hp.length; i++) if (S.risk[i] && S.hp[i] > 0 && !rings.some(q => q.on && q.plot === i)) cand.push(i);
        if (targetPlayer || !cand.length) { ring.x = G.player.x; ring.z = G.player.z; ring.plot = -1; ring.player = true; }
        else { const i = cand[Math.floor(S.r() * cand.length)]; ring.plot = i; ring.x = PLOT_POS[i][0]; ring.z = PLOT_POS[i][1]; ring.player = false; }
        ring.on = true; ring.t = 0; ring.m.visible = true; ring.m.position.set(ring.x, 0.3, ring.z);
      }
    }
    for (const ring of rings) {
      if (!ring.on) continue;
      ring.t += dt;
      const k = Math.min(1, ring.t / tele);
      ring.m.scale.setScalar(1.6 - k * 0.6);
      /** @type {any} */ (ring.m.material).opacity = 0.3 + k * 0.5;
      if (k >= 1) {
        ring.on = false; ring.m.visible = false;
        // ¿lo absorbe un pararrayos?
        let rod = -1;
        STORM_POS.rods.forEach((p, k2) => { if (rod < 0 && S.rods[k2] > 0 && Math.hypot(p[0] - ring.x, p[1] - ring.z) < 4.8) rod = k2; });
        const bxz = rod >= 0 ? STORM_POS.rods[rod] : [ring.x, ring.z];
        bolt.position.set(bxz[0], rod >= 0 ? 0.5 : 0, bxz[1]); bolt.visible = true; S.boltT = 0.18;
        G.flash(); G.sfx('thunder'); G.shake(0.4);
        if (rod >= 0) { S.rods[rod]--; A.rods[rod].glow.visible = S.rods[rod] > 0; G.pop('¡Absorbido!', bxz[0], 3.4, bxz[1], '#a5f3fc'); G.burst(bxz[0], 2.8, bxz[1], 0x7df9ff, 16); }
        else {
          if (ring.plot >= 0) damage(ring.plot, 'zap');
          if (Math.hypot(G.player.x - ring.x, G.player.z - ring.z) < 1.4) { S.stun = 1.4; G.zap(); }
        }
        S.strikes++;
      }
    }
    if (S.boltT > 0) { S.boltT -= dt; if (S.boltT <= 0) bolt.visible = false; }
    if (S.t >= 32 && !rings.some(q => q.on)) setPhase(3);
  }
  S.boltT = 0;

  function phase3(dt, t) {
    // mostrar la secuencia
    if (S.seqShow > 0) {
      S.seqShow += dt;
      const step = Math.floor((S.seqShow - 0.6) / 0.9);
      if (step >= 0 && step < S.seq.length && S.bellAnim[S.seq[step]] <= 0.05 && (S.seqShow - 0.6) % 0.9 < 0.1) { S.bellAnim[S.seq[step]] = 0.7; G.sfx('bell' + S.seq[step]); }
      if (step >= S.seq.length) { S.seqShow = 0; S.input = 0; G.toast('Tu turno: tocá las campanas en el mismo orden'); }
    }
  }

  function ring(k) {
    if (S.phase !== 3) return;
    S.bellAnim[k] = 0.7; G.sfx('bell' + k);
    if (S.seqShow > 0) return;
    if (S.seq[S.input] === k) {
      S.input++;
      G.pop('♪', STORM_POS.bells[k][0], 3.4, STORM_POS.bells[k][1], '#fff3bf');
      if (S.input >= S.seq.length) { S.phase = 4; S.outro = 0; G.ui.banner('LA TORMENTA SE CALMA', '¡Lo lograste!', 3000); G.sfx('fanfare'); G.emitLocal('stormCalm'); }
    } else {
      S.wrongs++;
      G.toast('Nota equivocada: el espíritu ruge y repite la melodía');
      // castigo leve: una ráfaga a una planta al azar
      const cand = []; for (let i = 0; i < S.hp.length; i++) if (S.risk[i] && S.hp[i] > 0) cand.push(i);
      if (cand.length) damage(cand[Math.floor(S.r() * cand.length)], 'wind');
      if (S.wrongs % 3 === 0 && S.seq.length > 2) S.seq.pop(); // nunca bloquea: se acorta
      S.input = 0; S.seqShow = 0.01;
    }
  }

  function finish() {
    const s = G.s, total = plotsAtRisk(), saved = alive();
    const ratio = total ? saved / total : 1;
    const win = ratio >= G.D.rescue;
    // consecuencias en la granja (recuperables)
    s.plots.forEach((p, i) => {
      if (!S.risk[i]) return;
      if (S.hp[i] <= 0) { p.s = 'vacia'; p.crop = ''; p.g = 0; s.stats.cropsLost++; }
      else if (S.communal[i]) { p.g = 1; } // el trigo comunal rescatado queda para vos
      G.refreshPlot(i, false);
    });
    const coins = win ? 40 + saved * 15 : 0;
    s.coins += coins; s.earned += coins;
    if (win) { s.storm.state = 'done'; s.inv.runa = 1; s.storm.best = Math.max(s.storm.best, saved); }
    else { s.storm.state = 'pending'; s.storm.day = s.day + 2; }
    S.result = { win, saved, total, coins, ratio };
    cleanup();
    G.onStormEnd(S.result);
  }

  function cleanup() {
    S.active = false; S.phase = 0;
    spirit.group.visible = false; bolt.visible = false;
    for (const r of rings) { r.on = false; r.m.visible = false; }
    A.storm.visible = false; A.flood.visible = false;
    A.tarp.forEach(t => { t.visible = false; }); A.mark.forEach(m => { m.visible = false; });
    G.camOverride = null;
  }

  /* ---------- interactuables del evento ---------- */
  const inter = [];
  STORM_POS.bells.forEach((p, k) => inter.push({ id: 'campana' + k, kind: 'bell', x: p[0], z: p[1], r: 2.0, y: 2.6, scene: 'granja',
    live: () => S.active && S.phase === 3, label: () => S.seqShow > 0 ? `🔔 Escuchá la melodía…` : `🔔 Tocar la campana ${BELL_NAMES[k]}`, act: () => ring(k) }));
  STORM_POS.rods.forEach((p, k) => inter.push({ id: 'pararrayos' + k, kind: 'rod', x: p[0], z: p[1], r: 2.0, y: 2.6, scene: 'granja',
    live: () => S.active && S.phase === 2, label: () => S.rods[k] > 0 ? `⚡ Pararrayos cargado (${S.rods[k]})` : '⚡ Cargar pararrayos rúnico',
    act: () => { if (S.rods[k] > 0) return; S.rods[k] = 3; A.rods[k].glow.visible = true; G.sfx('charge'); G.burst(p[0], 2.5, p[1], 0x7df9ff, 12); G.emitLocal('rod'); } }));
  STORM_POS.gates.forEach((p, k) => inter.push({ id: 'compuerta' + k, kind: 'gate', x: p[0], z: p[1], r: 1.9, y: 1, scene: 'granja',
    live: () => S.active && S.phase === 2, label: () => S.gates[k] ? '🚪 Compuerta abierta' : '🚪 Abrir compuerta de desagüe',
    act: () => { if (S.gates[k]) return; S.gates[k] = true; A.gates[k].door.position.y = 1.1; G.sfx('gate'); G.burst(p[0], 0.5, p[1], 0x5fb6d9, 12); } }));

  return {
    S, start, update, ring, cleanup, inter, PHASES,
    /** acción sobre una parcela durante la fase 1: poner o sacar lona */
    plotAction(i) {
      if (!S.active || S.phase !== 1 || !S.risk[i] || S.hp[i] <= 0) return null;
      if (S.covered[i]) return { label: '🟦 Quitar la lona (recuperarla)', act: () => { S.covered[i] = false; S.tarps++; G.sfx('tarp'); } };
      if (S.tarps <= 0) return { label: '🟦 No te quedan lonas: sacá una de otro surco', act: () => {} };
      return { label: `🟦 Cubrir con lona (${S.tarps})`, act: () => { S.covered[i] = true; S.tarps--; G.sfx('tarp'); G.tut && G.tut('tarp'); } };
    },
    hpOf: i => S.hp[i] ?? 0, riskOf: i => !!S.risk[i],
    stats() { return { active: S.active, phase: S.phase, alive: alive(), atRisk: plotsAtRisk(), tarps: S.tarps, gust: S.gust.n, gusts: S.gust.total, flood: +S.flood.toFixed(2), gates: [...S.gates], rods: [...S.rods], seqLen: S.seq.length, input: S.input, showing: S.seqShow > 0, stun: S.stun, result: S.result }; },
    /** sólo pruebas: saltar a la fase siguiente */
    skip() { if (!S.active) return; if (S.phase === 0) { G.camOverride = null; G.mode = 'play'; setPhase(1); } else if (S.phase < 3) setPhase(S.phase + 1); else if (S.phase === 3) { S.phase = 4; S.outro = 0; } else finish(); },
    /** sólo pruebas: forzar el resultado */
    forceEnd(win) { if (!S.active) return; for (let i = 0; i < S.hp.length; i++) if (S.risk[i]) S.hp[i] = win ? 2 : 0; finish(); },
    get seq() { return [...S.seq]; },
  };
}
