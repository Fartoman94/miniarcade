// @ts-check
/* Derby de Chatarra — juego principal: torneo de 3 rondas, jugador, rivales, jefe, daño y puntos, cámara,
   misiones, guardado, menús (garaje, opciones, ayuda), tutorial contextual y ganchos de prueba. */
import { createGame, createInput, createSave, screen, toast, clamp, rng, THREE } from '../../matelabs/kit3d.js';
import { GAME_ID, TITLE, ACCENT, CARS, RIVALS, RIVAL_IDS, ROUNDS, PLACE_POINTS, ADVANCE_PLACE, DIFF, QUAL, POWERS, POWER_TYPES, MISSIONS, SAVE_VERSION, SAVE_DEFAULTS, keyLabel } from './config.js';
import { createArena, ARENA_NAMES } from './arena.js';
import { createCars } from './entities.js';
import { stepCar, collideCars, zoneOf } from './physics.js';
import { initAI, updateAI } from './ai.js';
import { createBoss, makeDecal } from './boss.js';
import { createFx } from './fx.js';
import { createSfx } from './sfx.js';
import { createUI } from './ui.js';

const W = /** @type {any} */ (window);
const A = W.MLArcade, M = W.MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/* ======================= guardado ======================= */
const save = createSave(GAME_ID + ':save', SAVE_VERSION, structuredClone(SAVE_DEFAULTS), old => old || {});
/** Repara datos con forma inválida (guardado viejo, editado o a medias): nunca bloquea la partida. */
function sanitize() {
  const s = /** @type {any} */ (save.get()), D = /** @type {any} */ (SAVE_DEFAULTS);
  for (const k in D) {
    const dv = D[k], v = s[k];
    if (dv && typeof dv === 'object' && !Array.isArray(dv)) { if (!v || typeof v !== 'object' || Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (typeof v !== typeof dv) s[k] = structuredClone(dv);
  }
  for (const k in s) if (!(k in D)) delete s[k];
  if (![1, 2, 3].includes(s.round)) s.round = 1;
  s.unlocked = { omega: s.unlocked.omega === true };
  if (!(s.car in CARS) || (s.car === 'omega' && !s.unlocked.omega)) s.car = 'escarabajo';
  const t = s.tour, dt = D.tour;
  const pts = {};
  for (const k of Object.keys(dt.pts)) pts[k] = t.pts && Number.isFinite(t.pts[k]) && t.pts[k] >= 0 ? Math.round(t.pts[k]) : 0;
  s.tour = { pts, places: Array.isArray(t.places) ? t.places.filter(n => Number.isInteger(n) && n >= 1 && n <= 5).slice(0, 3) : [],
    wrecks: Number.isFinite(t.wrecks) && t.wrecks >= 0 ? Math.floor(t.wrecks) : 0, score: Number.isFinite(t.score) && t.score >= 0 ? Math.round(t.score) : 0, qualified: t.qualified === true };
  for (const k of ['wins', 'bestScore']) if (!Number.isFinite(s[k]) || s[k] < 0) s[k] = 0;
  for (const k of Object.keys(D.stats)) if (!Number.isFinite(s.stats[k]) || s.stats[k] < 0) s.stats[k] = 0;
  s.tutorial = { off: s.tutorial.off === true, seen: s.tutorial.seen && typeof s.tutorial.seen === 'object' && !Array.isArray(s.tutorial.seen) ? s.tutorial.seen : {} };
  const o = s.opts, dO = D.opts;
  s.opts = {
    sens: typeof o.sens === 'number' && o.sens >= 0.5 && o.sens <= 1.6 ? o.sens : 1,
    autoGas: o.autoGas === true,
    motion: ['auto', 'reduce', 'full'].includes(o.motion) ? o.motion : 'auto',
    cam: ['lejos', 'cerca'].includes(o.cam) ? o.cam : 'lejos',
    binds: { ...dO.binds, ...(o.binds && typeof o.binds === 'object' ? o.binds : {}) },
  };
  for (const k of Object.keys(dO.binds)) if (typeof s.opts.binds[k] !== 'string' || !s.opts.binds[k]) s.opts.binds[k] = dO.binds[k];
  for (const k of Object.keys(s.opts.binds)) if (!(k in dO.binds)) delete s.opts.binds[k];
}
sanitize(); save.flush();
const S = () => /** @type {typeof SAVE_DEFAULTS} */ (save.get());
const persist = () => save.flush();
const binds = () => S().opts.binds;

/* ======================= misiones y dificultad ======================= */
M.setup({ gameId: GAME_ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 2, hud: 'none' });
const diffName = () => /** @type {keyof typeof DIFF} */ (M.difficulty(GAME_ID));
const diff = () => DIFF[diffName()] || DIFF.normal;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => { const m = S().opts.motion; return m === 'reduce' || (m === 'auto' && reducedMQ.matches); };
const emit = (ev, v) => M.emit(ev, v);

/* ======================= juego base ======================= */
const ACTIVE = new Set(['countdown', 'play', 'cutscene', 'wrecked']);
let state = 'menu';
let overlay = false; // ayuda/opciones abiertas desde la pausa: la simulación espera
const game = createGame({
  id: GAME_ID, title: TITLE, toolbar: 'tr', background: 0x14110e, fov: 62, far: 300,
  help: ['W/↑ acelerar · S/↓ frenar y marcha atrás · A/D o ←/→ girar', 'Espacio: derrape (freno de mano) · Shift: nitro · E: usar potenciador',
    'Embestí con el FRENTE: hacés más daño y recibís menos. Cuidá costados y cola.', 'Las teclas se cambian en «Controles y opciones»', 'Esc, P o Start: pausa'],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', rt: 'KeyW', lt: 'KeyS', a: 'F13', x: 'F14', b: 'F15', rb: 'F13' },
  isActive: () => ACTIVE.has(state),
  update, render, onRestart, onQuality: () => applyQuality(),
  actions: [
    { label: '📖 Cómo jugar y tutorial', fn: () => openHelp(true) },
    { label: '⚙ Controles y accesibilidad', fn: () => openOptions(true) },
    { label: '🏁 Volver al menú del derby', fn: exitToMenu },
  ],
});
const { scene, camera, renderer } = game;
scene.fog = new THREE.Fog(0x14110e, 70, 190);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const fx = createFx(scene, reduced);
const sfx = createSfx(game.audio);
const ui = createUI();
const cars = createCars(scene);
const rand = rng(DEBUG ? 12345 : Date.now() & 0xffff);

let input = createInput(game.root, {
  joystick: 'left',
  buttons: [{ id: 'brake', label: 'FRENO' }, { id: 'gas', label: 'ACEL' }, { id: 'nitro', label: 'NITRO' }, { id: 'power', label: 'PODER' }],
});
if (input.isTouch) document.body.classList.add('dc-touch');
input.showTouch(false);
const powerBtn = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="power"]'));
const nitroBtn = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="nitro"]'));

/* ======================= estado de ronda ======================= */
/** estado interactivo persistente durante la sesión (rampas usadas, contenedores descarrilados, interruptores) */
const session = { deposito: {}, coliseo: {}, neon: {} };
/** @type {any} */ let arena = null;
/** @type {any} */ let P = null;
/** @type {any[]} */ let rivals = [];
/** @type {any} */ let boss = null;
/** @type {Record<string, {lane?:THREE.Mesh, shadow?:THREE.Mesh, ring?:THREE.Mesh}>} */ let decals = {};
const run = { round: 1, time: 0, left: 90, countdown: 0, cdShown: -1, repairs: 0, powerTypes: new Set(), wrecks: 0, stunts: 0, towers: 0, bossTriggered: false,
  endT: 0, deadT: 0, result: /** @type {any} */ (null), moved: 0, near: '', engT: 0, skidT: 0, setupFor: '' };
/** @type {any} */ let cut = null;
let tipId = '', tipT = 0, cutSkip = false;
const dbg = { freezeAI: false, god: false, manual: false, stepping: false };
const cam = { x: 0, y: 8, z: 20, yaw: 0, fov: 62, orbit: 0, lx: 0, ly: 0, lz: 0 };

/* ======================= tutorial contextual ======================= */
const K = id => input.isTouch ? ({ nitro: 'NITRO', power: 'PODER', drift: 'FRENO + girar' })[id] : keyLabel(binds()[id]);
const TIPS = {
  drive: () => input.isTouch ? 'Girá con el <b>VOLANTE</b> de la izquierda. <b>ACEL</b> y <b>FRENO</b> a la derecha (podés activar la aceleración automática en Opciones).' : '<b>W/↑</b> acelerar, <b>S/↓</b> frenar y reversa, <b>A/D</b> girar. <b>' + K('drift') + '</b> derrape, <b>' + K('nitro') + '</b> nitro.',
  ram: () => 'Embestí con el <b>FRENTE</b>: hacés más daño y recibís menos. Los <b>costados y la cola</b> son tu punto débil: mirá el diagrama de daño.',
  power: () => `Tenés un potenciador en la ranura. Usalo con <b>${K('power')}</b>: 🔥 nitro, 🧲 imán (atrae rivales), 🛡 escudo, ✴ trampa.`,
  ramp: () => 'Subí la <b>rampa</b> a toda velocidad: más de 0,7 s en el aire es un <b>salto acrobático</b>. Girá en el aire para un trompo.',
  switch: () => 'Los <b>interruptores</b> del piso suben y bajan barreras: cambiá el circuito o encerrá a un rival.',
  container: () => 'Los <b>contenedores</b> se mueven por rieles (baliza naranja). Embestilos de frente a más de 45 km/h para <b>descarrilarlos</b>.',
  tower: () => 'Las <b>torres de cajas</b> se derrumban si las embestís a más de 25 km/h: dan puntos.',
  toro: () => '¡<b>El Toro</b> te apunta (faros y carril rojo)! Esquivá la carga: si choca contra un muro queda <b>aturdido</b>.',
  helice: () => '<b>Dr. Hélice</b> va a caer sobre la <b>sombra roja</b>. Salí de ahí y pegale cuando aterriza (queda sin propulsores).',
  tanque: () => '<b>Doña Tanque</b> está blindada adelante y a los costados. Rodeala y pegale en el <b>tanque naranja</b> de atrás.',
  chispa: () => '<b>La Chispa</b> es rápida y frágil: busca tus costados. Frená de golpe o recibila de frente.',
  boss: () => 'El <b>Triturador Omega</b> tiene un <b>escudo frontal</b>: de frente no le hacés nada. Hacelo chocar y pegale en la <b>cola</b>.',
  bossCharge: () => 'Carril rojo = <b>carga</b>. Salite del carril; si choca contra un muro, columna o <b>barrera eléctrica</b> (interruptores) queda aturdido.',
  bossMagnet: () => 'Anillos violetas = <b>imán triturador</b>. Acelerá en dirección contraria, usá nitro o el escudo.',
  bossJump: () => 'Círculo naranja = <b>salto sísmico</b>. Alejate o saltá con una rampa: la onda sólo daña a los autos en el piso.',
};
function tip(id) {
  const t = S().tutorial;
  if (t.off || t.seen[id] || tipId || !ACTIVE.has(state) || state === 'countdown') return;
  t.seen[id] = true; persist();
  tipId = id; tipT = 10;
  ui.tip(TIPS[id](), a => { if (a === 'skip') { S().tutorial.off = true; persist(); toast('Tutorial desactivado (lo podés reactivar desde «Cómo jugar»)', 2200); } closeTip(); });
  emit('tutorial');
}
function closeTip() { tipId = ''; ui.tip(null); }

/* ======================= construcción de ronda ======================= */
function carSpec(id) { return { ...CARS[id] }; }
function makePlayer() {
  const id = S().car, spec = carSpec(id);
  P = cars.make({ id: 'player', name: 'Vos · ' + spec.name, model: spec.model, color: spec.color, spec, hp: spec.hp, isPlayer: true, markColor: 0xb8f52a, scale: id === 'omega' ? 0.62 : 1 });
}
function clearRound() {
  if (boss) { boss.dispose(); boss = null; }
  for (const k in decals) for (const m of Object.values(decals[k])) { if (!m) continue; m.removeFromParent(); m.geometry.dispose(); /** @type {any} */ (m.material).dispose(); }
  decals = {};
  cars.clear(); P = null; rivals = [];
  if (arena) { arena.dispose(); arena = null; }
  fx.clear(); cut = null;
}
/** Arma la arena, los autos y (en la final) al jefe. @param {number} n */
function setupRound(n) {
  clearRound();
  const R = ROUNDS[n - 1], d = diff();
  arena = createArena(/** @type {any} */ (R.arena), { session: session[R.arena], q: QUAL[game.quality], repairs: d.repair, padRespawn: d.padRespawn, rand });
  scene.add(arena.group);
  const e = arena.env;
  /** @type {any} */ (scene.background).setHex(e.bg); /** @type {THREE.Fog} */ (scene.fog).color.setHex(e.fog);
  hemi.color.setHex(e.hemi[0]); hemi.groundColor.setHex(e.hemi[1]); hemi.intensity = e.hemi[2];
  sun.color.setHex(e.sun[0]); sun.intensity = e.sun[1];
  renderer.toneMappingExposure = e.exposure;
  makePlayer();
  const sp = arena.spawns;
  place(P, sp[0]);
  RIVAL_IDS.forEach((rid, i) => {
    const r = RIVALS[rid], spec = { ...r };
    const c = cars.make({ id: rid, name: r.name, model: r.model, color: r.color, spec, hp: Math.round(r.hp * d.rivalHp), rtype: r.type });
    initAI(c, rand); place(c, sp[i + 1]); rivals.push(c);
    if (r.type === 'ariete') { decals[rid] = { lane: makeDecal('lane', 0xff2a2a) }; scene.add(/** @type {THREE.Mesh} */ (decals[rid].lane)); }
    if (r.type === 'volador') { decals[rid] = { shadow: makeDecal('circle', 0xff2020), ring: makeDecal('ring', 0xff5050) }; scene.add(/** @type {any} */ (decals[rid].shadow), /** @type {any} */ (decals[rid].ring)); }
  });
  if (R.boss) boss = createBoss({ scene, cars, arena: () => arena, fx, sfx, diff, player: () => P, rand, hurtPlayer, onPhase: bossPhase, onDefeat: bossDefeated, tip, toast: (t, ms) => toast(t, ms || 2000), sparkAt: (x, y, z, c) => fx.sparks(x, y, z, 6, c, 6) });
  run.round = n; run.setupFor = n + ':' + S().car + ':' + diffName();
  applyQuality();
}
function place(c, s) { c.x = s.x; c.z = s.z; c.yaw = s.yaw; c.y = arena.heightAt(s.x, s.z); c.vx = c.vz = c.vy = 0; c.yawRate = 0; c.grounded = true; }

/* ======================= ciclo de partida ======================= */
/** @param {number} n */
function startRound(n) {
  setupRound(n);
  const s = S(); s.started = true; s.round = n; persist();
  run.time = 0; run.left = diff().roundTime; run.countdown = 3.2; run.cdShown = -1; run.repairs = 0; run.powerTypes = new Set(); run.wrecks = 0; run.stunts = 0; run.towers = 0;
  run.bossTriggered = false; run.endT = 0; run.deadT = 0; run.result = null; run.moved = 0;
  state = 'countdown'; overlay = false; closeTip();
  menu.hide(); endScreen.hide(); helpScreen.hide(); optScreen.hide();
  ui.show(true); input.showTouch(true); input.clear();
  cam.yaw = P.yaw; cam.x = P.x - Math.sin(P.yaw) * 10; cam.z = P.z - Math.cos(P.yaw) * 10; cam.y = 5;
  M.runStart();
  if (s.tour.wrecks) emit('wreck', s.tour.wrecks);
  if (s.tour.qualified) emit('qualifyWin');
  A.started();
  const R = ROUNDS[n - 1];
  ui.big(R.name.toUpperCase(), `RONDA ${n} · ${R.place.toUpperCase()}`, 2.2);
  hudTick(1);
}
/** @param {boolean} won */
function endRun(won, extra = 0) {
  M.runEnd({ won });
  A.ended({ score: S().tour.score + extra });
}
function onRestart() {
  if (!ACTIVE.has(state)) return;
  endRun(false, P ? P.points : 0);
  startRound(run.round);
}
function exitToMenu() {
  if (ACTIVE.has(state)) endRun(false, P ? P.points : 0);
  overlay = false;
  showMenu();
}

/* ======================= daño, puntos y choques ======================= */
const TAKEN = { f: 0.55, l: 1.15, r: 1.15, b: 1.35 };
function takenMul(c, z) {
  if (c.isBoss) return boss ? boss.zoneMul(z) : 0;
  const sp = c.spec;
  let m = TAKEN[z];
  if (z === 'f') m *= sp.frontArmor ?? 1;
  else if (z === 'b') m = sp.rearMul ?? m;
  else m *= sp.sideArmor ?? 1;
  if (c.vuln) m *= 1.5;
  if (c.stunT > 0) m *= 1.25;
  return m;
}
function dealtMul(c, z) {
  let m = z === 'f' ? 1.25 * (c.spec.frontDmg || 1) : z === 'b' ? 0.45 : 0.7;
  if (c.nitroOn) m *= 1.3;
  if (c.isBoss) m *= 0.55;
  return m;
}
/**
 * @param {any} c @param {number} dmg @param {string} zone @param {any} attacker @param {string} kind
 */
function damageCar(c, dmg, zone, attacker, kind) {
  if (!c || c.wrecked || c.retired || dmg <= 0.4) return 0;
  if (c.shieldT > 0) { fx.sparks(c.x, c.y + 1, c.z, 6, 0x3ec8ff, 6); return 0; }
  if (c.isPlayer) { dmg *= diff().dmgTaken; if (dbg.god) dmg = 0; }
  if (c.isBoss) { if (!boss) return 0; const before = c.hp; boss.hurt(dmg); dmg = before - c.hp; }
  else c.hp -= dmg;
  if (dmg <= 0) return 0;
  c.zone[zone] = Math.min(1, (c.zone[zone] || 0) + dmg / c.maxHp * 2.2);
  c.dentsDirty = true; c.flashT = 0.07;
  if (attacker && attacker !== c) {
    c.lastHitBy = attacker; c.lastHitT = run.time;
    attacker.points += Math.round(dmg * 10);
    if (attacker.isPlayer) emit('hit');
  }
  if (c.isPlayer) {
    if (!reduced() && dmg > 4) ui.flash();
    sfx.hurt(); fx.shake(Math.min(0.6, dmg * 0.025));
    if (c.zone[zone] > 0.6 && !c['lost' + zone]) { c['lost' + zone] = true; fx.debris(c.x, c.y + 0.8, c.z, 5, c.color, 6); toast(zone === 'f' ? '¡Se te soltó el paragolpes!' : zone === 'b' ? '¡Perdiste el baúl!' : '¡Se te voló una puerta!', 1300); }
  }
  if (c.hp <= 0 && !c.isBoss) wreck(c, attacker, kind);
  return dmg;
}
function wreck(c, attacker, kind) {
  c.hp = 0; c.wrecked = true; c.alert = false; c.manualY = false; c.shieldT = c.magnetT = c.boostT = 0; c.vuln = false;
  c.vy = 7; c.grounded = false; c.yawRate += (rand() - 0.5) * 8;
  fx.explosion(c.x, c.y, c.z, c.isPlayer ? 1.3 : 1); sfx.explosion(1);
  for (const k in decals) if (k === c.id) for (const m of Object.values(decals[k])) if (m) m.visible = false;
  const killer = attacker && attacker !== c ? attacker : (c.lastHitBy && run.time - c.lastHitT < 4 ? c.lastHitBy : null);
  if (killer && killer !== c && !killer.wrecked) killer.points += 500;
  if (arena) arena.cheer = 2.5;
  if (c.isPlayer) { playerWrecked(); return; }
  if (killer && killer.isPlayer) {
    run.wrecks++; const s = S(); s.tour.wrecks++; s.stats.wrecks++; persist();
    emit('wreck');
    ui.big('¡FUERA DE COMBATE!', `${c.name} · +500`, 1.6);
  } else toast(`💥 ${c.name} quedó fuera de combate${killer ? ' (lo liquidó ' + killer.name.replace('Vos · ', '') + ')' : ''}`, 2000);
  void kind;
}
function hurtPlayer(n, fx0, fz0, kind, knock) {
  if (!P || P.wrecked) return;
  const dx = P.x - fx0, dz = P.z - fz0, l = Math.hypot(dx, dz) || 1;
  P.vx += dx / l * knock; P.vz += dz / l * knock; if (knock > 8) { P.vy = 5; P.grounded = false; }
  damageCar(P, n, zoneOf(P, -dx / l, -dz / l), boss ? boss.car : null, kind);
}
const PH = {
  onWall(c, impact, dx, dz, obj) {
    if (impact < 2.5) return;
    if (c.isBoss && boss) boss.onWall(impact, obj);
    const zone = zoneOf(c, dx, dz);
    const near = P ? Math.hypot(c.x - P.x, c.z - P.z) : 0, vol = Math.max(0, 1 - near / 70);
    const px = c.x + dx * c.radius, pz = c.z + dz * c.radius;
    if (obj.kind === 'tower' && obj.ref) {
      if (impact >= 6.5 && arena.destroyTower(obj.ref, -dx, -dz, impact)) {
        sfx.tower(); fx.debris(obj.ref.x, 2, obj.ref.z, 8, 0xb07a3c, 7); fx.dust(obj.ref.x, 0.5, obj.ref.z);
        arena.cheer = 2;
        if (c.isPlayer) { run.towers++; S().stats.towers++; persist(); c.points += 300; emit('tower'); ui.big('¡TORRE AL PISO!', '+300', 1.2); fx.shake(0.3); }
        // la torre frena al auto
        c.vx *= 0.75; c.vz *= 0.75;
      }
      return;
    }
    if (obj.kind === 'container' && obj.ref && c.isPlayer && zone === 'f' && impact >= 12.5 && !obj.ref.st.derailed) {
      arena.derail(obj.ref); sfx.derail(); fx.sparks(px, 1.2, pz, 30, 0xffd27a, 12); fx.smoke(obj.ref.box.x, 2.6, obj.ref.box.z, 0x555555, 1.6, 2);
      c.points += 200; emit('derail'); ui.big('¡DESCARRILADO!', '+200', 1.3); fx.shake(0.5);
    }
    let dmg = impact > 6 ? (impact - 6) * 0.9 * (zone === 'f' ? 0.6 : zone === 'b' ? 1.1 : 0.9) : 0;
    if (obj.kind === 'elec') {
      dmg += 8; c.stunT = Math.max(c.stunT, c.isBoss ? c.stunT : 0.8);
      fx.sparks(px, 1.2, pz, 18, 0x3cf0ff, 10); if (vol > 0.2) sfx.zap();
    }
    if (c.rtype === 'ariete' && c.ai && c.ai.state === 'charge' && impact > 8) {
      c.stunT = 2.6; c.ai.state = 'hunt'; c.ai.cool = 3; c.alert = false;
      if (near < 30) toast('💫 ¡El Toro se dio contra la pared! Está aturdido', 1600);
    }
    if (impact > 5) { fx.sparks(px, c.y + 0.7, pz, Math.min(16, Math.round(impact)), 0xffd27a, 6 + impact * 0.3); if (vol > 0.05) sfx.crash(Math.min(1.2, impact / 18) * vol); }
    else if (c.isPlayer) sfx.scrape();
    if (c.isPlayer) fx.shake(Math.min(0.5, impact * 0.02));
    if (dmg > 0 && !c.isBoss) damageCar(c, dmg, zone, c.lastHitBy && run.time - c.lastHitT < 2 ? c.lastHitBy : null, 'wall');
  },
  onLand(c, air, vy, spin, ramp) {
    c.bounce = -Math.min(0.35, vy * 0.02);
    if (vy > 16 && !c.isBoss) damageCar(c, (vy - 16) * 1.2, 'b', null, 'land');
    if (!c.isPlayer) { if (vy > 6) fx.dust(c.x, 0.3, c.z, arena.id === 'coliseo' ? 0xd8b47a : 0x8a8478); return; }
    sfx.land(); for (let i = 0; i < 4; i++) fx.dust(c.x, 0.3, c.z, arena.id === 'neon' ? 0x6a4aff : arena.id === 'coliseo' ? 0xd8b47a : 0x8a8478);
    if (ramp) {
      ramp.st.best = Math.max(ramp.st.best, Math.round(air * 100) / 100);
      if (air >= 0.7) {
        const trick = spin > 4.4;
        const pts = 250 + Math.round(air * 150) + (trick ? 400 : 0);
        c.points += pts; run.stunts++; S().stats.stunts++; persist();
        emit('stunt'); ramp.pulse = 1.2; sfx.stunt(); arena.cheer = 2;
        ui.big(trick ? '¡TROMPO AÉREO!' : '¡SALTO ACROBÁTICO!', `+${pts} · ${air.toFixed(1)} s en el aire`, 1.4);
      }
    }
  },
  onLaunch(c) {
    if (c.isPlayer && c.launchRamp) { c.launchRamp.st.used++; c.launchRamp.pulse = 0.6; emit('ramp'); }
  },
};
function onCarHit(a, b, rel, nx, nz) {
  if (rel < 2.5) { if ((a.isPlayer || b.isPlayer) && rel > 1) sfx.scrape(); return; }
  const za = zoneOf(a, nx, nz), zb = zoneOf(b, -nx, -nz);
  const base = (rel - 2.5) * 0.85;
  const mf = (x, y) => (x.isBoss || y.isBoss) ? 1 : clamp(Math.sqrt(x.mass / y.mass), 0.5, 2);
  let dB = base * mf(a, b) * takenMul(b, zb) * dealtMul(a, za);
  let dA = base * mf(b, a) * takenMul(a, za) * dealtMul(b, zb);
  dB = Math.min(dB, b.isBoss ? 80 : 34); dA = Math.min(dA, a.isBoss ? 80 : 34);
  if (a.wrecked) dB *= 0.3; if (b.wrecked) dA *= 0.3;
  const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, cy = Math.min(a.y, b.y) + 0.8;
  const shieldHit = (b.isBoss && zb === 'f' && boss && boss.phase === 1) || (a.isBoss && za === 'f' && boss && boss.phase === 1);
  damageCar(b, dB, zb, a.wrecked ? null : a, 'ram');
  damageCar(a, dA, za, b.wrecked ? null : b, 'ram');
  const spinK = Math.min(3.5, rel * 0.16);
  if (!b.isBoss) b.yawRate += (zb === 'l' ? -1 : zb === 'r' ? 1 : 0) * spinK * clamp(a.mass / b.mass, 0.3, 2);
  if (!a.isBoss) a.yawRate += (za === 'l' ? -1 : za === 'r' ? 1 : 0) * spinK * clamp(b.mass / a.mass, 0.3, 2);
  for (const c of [a, b]) if (c.rtype === 'kart' && c.ai && (c === a ? za : zb) === 'f') { c.ai.flee = 2.2; c.ai.side = rand() < 0.5 ? -1 : 1; }
  for (const c of [a, b]) if (c.rtype === 'ariete' && c.ai && c.ai.state === 'charge') { c.ai.state = 'hunt'; c.ai.cool = 2.5; }
  if (boss && (a.isBoss || b.isBoss)) boss.onRam();
  const near = P ? Math.hypot(cx - P.x, cz - P.z) : 0, vol = Math.max(0, 1 - near / 70);
  fx.sparks(cx, cy, cz, Math.min(22, Math.round(rel * 1.1)), shieldHit ? 0x3ec8ff : 0xffd27a, 6 + rel * 0.35);
  if (rel > 10) fx.debris(cx, cy, cz, 3, (rel > 14 ? b : a).color, 6);
  if (vol > 0.05) sfx.crash(Math.min(1.3, rel / 16) * vol);
  if (a.isPlayer || b.isPlayer) {
    fx.shake(Math.min(0.8, rel * 0.035));
    const me = a.isPlayer ? a : b, other = a.isPlayer ? b : a, myZone = a.isPlayer ? za : zb;
    if (shieldHit && other.isBoss) { if (!boss.shieldMsgT || run.time - boss.shieldMsgT > 4) { boss.shieldMsgT = run.time; toast('🛡 ¡Escudo frontal! Pegale en la cola o los costados', 1600); } }
    else if (myZone === 'f' && rel > 9 && !other.wrecked) ui.big(rel > 18 ? '¡DEMOLEDOR!' : '¡IMPACTO!', `+${Math.round((a.isPlayer ? dB : dA) * 10)}`, 0.8);
    void me;
  }
}

/* ======================= potenciadores ======================= */
const AH = {
  onPickup(pad, c) {
    if (pad.type === 'repair') {
      if (c.hp >= c.maxHp - 1) return false;
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.35);
      for (const k of ['f', 'b', 'l', 'r']) c.zone[k] *= 0.6;
      c.dentsDirty = true;
      if (c.isPlayer) { run.repairs++; emit('repair'); sfx.power('repair'); toast('🔧 ¡Reparación! +35 % de vida', 1500); fx.sparks(c.x, 1.5, c.z, 12, 0x4dff88, 5); }
      return true;
    }
    if (c.slot) return false;
    c.slot = pad.type; c.slotT = 0;
    if (c.isPlayer) { sfx.pickup(); toast(`${POWERS[pad.type].icon} ¡${POWERS[pad.type].name}! Usalo con ${K('power')}`, 1600); tip('power'); }
    return true;
  },
  onSwitch(sw) {
    sfx.switch(); emit('switch');
    toast(`🔀 ${sw.label}: ${sw.on ? 'ARRIBA' : 'ABAJO'}`, 1500);
  },
  onMine(Mn, c) {
    fx.explosion(Mn.x, 0.3, Mn.z, 0.7); sfx.explosion(0.6);
    c.vy = 7; c.grounded = false; c.yawRate += (rand() < 0.5 ? -1 : 1) * 6;
    if (c.isBoss) { if (boss) boss.hurt(30); if (Mn.owner && Mn.owner.isPlayer) Mn.owner.points += 300; }
    else damageCar(c, 18, 'b', Mn.owner !== c ? Mn.owner : null, 'mine');
    if (c.isPlayer) toast('✴ ¡Pisaste una trampa!', 1200);
  },
  get player() { return P; },
};
function usePower(c) {
  const t = c.slot;
  if (!t) { if (c.isPlayer) sfx.denied(); return; }
  c.slot = ''; c.slotT = 0;
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  if (t === 'nitro') c.boostT = POWERS.nitro.dur;
  else if (t === 'iman') c.magnetT = POWERS.iman.dur;
  else if (t === 'escudo') c.shieldT = POWERS.escudo.dur;
  else if (t === 'trampa') arena.dropMine(c.x - s * (c.len * 0.5 + 1.2), c.z - co * (c.len * 0.5 + 1.2), c);
  const near = P ? Math.hypot(c.x - P.x, c.z - P.z) : 0;
  if (c.isPlayer || near < 30) sfx.power(t);
  if (c.isPlayer) {
    emit('power');
    if (!run.powerTypes.has(t)) { run.powerTypes.add(t); emit('powerType'); }
  }
}
/** imanes: atraen a los autos cercanos hacia quien lo activó */
function magnets(dt) {
  for (const m of cars.list) {
    if (m.magnetT <= 0 || m.wrecked || m.retired) continue;
    for (const o of cars.list) {
      if (o === m || o.wrecked || o.retired || o.isBoss || o.manualY || (o.spec.magnetImmune)) continue;
      const dx = m.x - o.x, dz = m.z - o.z, d = Math.hypot(dx, dz);
      if (d > 17 || d < 0.1) continue;
      const k = (26 * (1 - d / 17) + 8) * dt * (o.shieldT > 0 ? 0.3 : 1);
      o.vx += dx / d * k; o.vz += dz / d * k;
    }
  }
}

/* ======================= IA: telegrafía y golpe del volador ======================= */
const AIG = {
  get cars() { return cars.list; }, get player() { return P; }, get arena() { return arena; }, get diff() { return diff(); }, rand,
  telegraph(c, kind, on, x, z) {
    const D = decals[c.id];
    if (kind === 'horn') { if (P && Math.hypot(c.x - P.x, c.z - P.z) < 45) sfx.horn(true); if (c.ai.target === P) tip('toro'); return; }
    if (kind === 'lane' && D && D.lane) D.lane.visible = on;
    if (kind === 'shadow' && D && D.shadow && D.ring) {
      D.shadow.visible = D.ring.visible = on;
      if (on && x !== undefined && z !== undefined) { D.shadow.position.set(x, arena.heightAt(x, z) + 0.07, z); D.ring.position.copy(D.shadow.position); D.ring.scale.setScalar(4.8); sfx.hop(); if (P && Math.hypot(x - P.x, z - P.z) < 10) tip('helice'); }
    }
  },
  slam(c) {
    fx.ring(c.x, 0.2, c.z, 0xff5050, 6, 0.5); for (let i = 0; i < 6; i++) fx.dust(c.x, 0.3, c.z, 0xb0a0ff);
    const near = P ? Math.hypot(c.x - P.x, c.z - P.z) : 99;
    if (near < 40) sfx.slam(1);
    if (near < 14) fx.shake(0.4);
    for (const o of cars.list) {
      if (o === c || o.wrecked || o.retired || o.isBoss || o.y > 1.5) continue;
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
      if (d > 4.8 + o.radius) continue;
      const l = d || 1;
      o.vx += dx / l * 12; o.vz += dz / l * 12; o.vy = 5; o.grounded = false;
      damageCar(o, 15, zoneOf(o, -dx / l, -dz / l), c, 'slam');
    }
  },
  usePower,
};

/* ======================= jefe ======================= */
function triggerBoss() {
  if (run.bossTriggered || !boss) return;
  run.bossTriggered = true;
  for (const c of rivals) {
    if (c.wrecked || c.retired) continue;
    c.points += Math.round(c.hp / c.maxHp * 300);
    c.retired = true; c.root.visible = false; c.fx.visible = false; c.alert = false;
    fx.smoke(c.x, 1, c.z, 0x666666, 1.6, 2);
    for (const k in decals) if (k === c.id) for (const m of Object.values(decals[k])) if (m) m.visible = false;
  }
  closeTip();
  boss.start(); arena.gate.want = 1;
  state = 'cutscene'; cutSkip = false;
  sfx.roar(1.3);
  ui.big('TRITURADOR OMEGA', 'EL GRAN EVENTO · LOS RIVALES SE RETIRAN', reduced() ? 2.2 : 3.6);
  cut = {
    t: 0, dur: reduced() ? 2.4 : 4.6,
    step(dt) {
      const B = boss.car;
      boss.update(dt); stepCar(B, dt, arena, PH);
      const k = Math.min(1, cut.t / cut.dur);
      const a = -0.7 + k * 1.0; camera.position.set(B.x + Math.sin(a) * 24, 7 + k * 4, B.z - Math.cos(a) * 24);
      camera.lookAt(B.x, 2.5, B.z);
      if (k > 0.3 && !reduced()) fx.shake(0.015);
    },
    end() {
      const B = boss.car; B.ignoreBounds = false;
      if (B.z > 30) { B.z = 26; B.x = 0; }
      boss.startPhase(1); arena.gate.want = 0;
      state = 'play'; tip('boss'); emit('bossStart');
      ui.big('¡FASE 1!', 'ESCUDO FRONTAL: PEGALE ATRÁS', 1.6);
    },
  };
}
function bossPhase(n) {
  ui.big('¡FASE 2!', 'EL TRITURADOR SE ENFURECE', 2);
  toast('¡Sin escudo! Cuidado: imán triturador y salto sísmico', 2600);
  emit('bossPhase2'); void n;
}
function bossDefeated() {
  P.points += 3000;
  const s = S(); const first = !s.unlocked.omega; s.unlocked.omega = true; persist();
  emit('omega'); arena.cheer = 4; sfx.win();
  ui.big('¡OMEGA DESTRUIDO!', '+3000 · RECOMPENSA DESBLOQUEADA', 2.5);
  toast(first ? '🏆 ¡Desbloqueaste el Mini-Omega (frente ×1,8, inmune a imanes)!' : '🏆 ¡Otra vez el Omega al desarmadero!', 3000);
  run.endT = 2.6;
}

/* ======================= fin de ronda ======================= */
function playerWrecked() {
  state = 'wrecked'; run.deadT = 2.4; closeTip();
  ui.big('¡CHATARRA!', 'TU VEHÍCULO QUEDÓ DESTRUIDO', 2);
  sfx.lose();
}
function standings() {
  const all = [P, ...rivals];
  return all.slice().sort((a, b) => b.points - a.points || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0));
}
/** @param {'time'|'ko'|'boss'} reason */
function endRound(reason) {
  if (!ACTIVE.has(state) || state === 'wrecked') return;
  state = 'roundEnd'; closeTip(); input.showTouch(false);
  const n = run.round, s = S();
  for (const c of [P, ...rivals]) if (!c.wrecked && !c.retired) c.points += Math.round(c.hp / c.maxHp * 300);
  if (reason === 'ko') P.points += 500;
  const order = standings(), place = order.indexOf(P) + 1;
  const before = structuredClone(s.tour.pts), after = structuredClone(s.tour.pts);
  order.forEach((c, i) => { const k = c.isPlayer ? 'player' : c.id; after[k] = (after[k] || 0) + PLACE_POINTS[i]; });
  if (!run.repairs && !P.wrecked) emit('noRepairRound');
  if (n === 1 && place === 1) emit('qualifyWin');
  const roundScore = P.points;
  let result;
  if (n < 3) {
    const adv = place <= ADVANCE_PLACE;
    if (adv) { s.tour.pts = after; s.tour.places.push(place); s.tour.score += roundScore; s.round = n + 1; if (n === 1 && place === 1) s.tour.qualified = true; }
    s.stats.rounds++;
    persist();
    result = { kind: adv ? 'advance' : 'retry', place };
    endRun(adv);
  } else {
    const champ = Object.keys(after).every(k => k === 'player' || after.player >= after[k]);
    s.stats.rounds++;
    if (champ) {
      const total = s.tour.score + roundScore;
      s.wins++; s.bestScore = Math.max(s.bestScore, total);
      M.runEnd({ won: true }); A.ended({ score: total });
      s.tour = structuredClone(SAVE_DEFAULTS.tour); s.round = 1; s.started = false; persist();
      result = { kind: 'champion', place, total };
    } else { persist(); endRun(false, roundScore); result = { kind: 'lost', place }; }
  }
  run.result = { ...result, reason, order: order.map(c => ({ name: c.isPlayer ? 'Vos (' + CARS[S().car].name + ')' : c.name, pts: c.points, me: c.isPlayer, out: c.wrecked, color: '#' + c.color.toString(16).padStart(6, '0'), key: c.isPlayer ? 'player' : c.id })), before, after };
  showResults();
}
function defeat() {
  state = 'defeat'; input.showTouch(false); ui.show(false);
  endRun(false, P.points);
  run.result = { kind: 'defeat' };
  sfx.lose();
  const R = ROUNDS[run.round - 1];
  endScreen.show(`<span class="k3-kicker">SALUD DEL VEHÍCULO: CERO</span><h1>¡CHATARRA!</h1>
    <p>Te desarmaron en la ${R.name} (${R.place}). Tus puntos de torneo de las rondas anteriores siguen guardados.</p>
    <div class="dc-menu-prog">Puntos de esta ronda: <b>${P.points}</b> · Rivales destruidos: ${run.wrecks} · Saltos: ${run.stunts}</div>
    <div class="k3-btnrow"><button class="k3-b" data-retry>↻ Reintentar ronda</button><button class="k3-b alt" data-menu>🏁 Menú</button></div>`);
}
function showResults() {
  ui.show(false); sfx.roundEnd();
  const r = run.result, n = run.round, R = ROUNDS[n - 1];
  const rows = r.order.map((o, i) => `<tr class="${o.me ? 'me' : ''}"><td>${i + 1}º</td><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${o.color};margin-right:5px"></span>${o.name}${o.out ? ' 💥' : ''}</td><td class="n">${o.pts}</td><td class="n">${r.after[o.key]} <small style="opacity:.7">(+${PLACE_POINTS[i]})</small></td></tr>`).join('');
  const table = `<table class="dc-table"><tr><th>#</th><th>PILOTO</th><th class="n">RONDA</th><th class="n">TORNEO</th></tr>${rows}</table>`;
  let head = '', body = '', btns = '';
  if (r.kind === 'advance') {
    head = `<span class="k3-kicker">${R.name.toUpperCase()} · ${r.place}º PUESTO</span><h1>¡CLASIFICASTE!</h1>`;
    body = `<p>${r.place === 1 ? '¡Ganaste la ronda! ' : ''}Pasás a la ${ROUNDS[n].name}: <b>${ROUNDS[n].place}</b>.</p>`;
    btns = `<button class="k3-b" data-next>▶ ${ROUNDS[n].name}</button><button class="k3-b alt" data-menu>🏁 Menú</button>`;
  } else if (r.kind === 'retry') {
    head = `<span class="k3-kicker">${R.name.toUpperCase()} · ${r.place}º PUESTO</span><h1>NO CLASIFICASTE</h1>`;
    body = `<p>Necesitás terminar entre los ${ADVANCE_PLACE} primeros. Los puntos de torneo no se modifican: reintentá la ronda.</p>`;
    btns = `<button class="k3-b" data-retry>↻ Reintentar ronda</button><button class="k3-b alt" data-menu>🏁 Menú</button>`;
  } else if (r.kind === 'champion') {
    head = `<span class="k3-kicker">PRIMERO EN PUNTOS AL FINALIZAR EL TORNEO</span><h1>¡CAMPEÓN!</h1>`;
    body = `<p>Ganaste el Derby de Chatarra con <b>${r.after.player}</b> puntos de torneo. Puntaje total: <b>${r.total}</b>${S().bestScore === r.total ? ' · ¡NUEVO RÉCORD!' : ''}.</p>
      <p class="dc-small">${S().unlocked.omega ? 'Recompensa: el Mini-Omega ya está en tu garaje.' : ''}</p>`;
    btns = `<button class="k3-b" data-new>🏆 Nuevo torneo</button><button class="k3-b alt" data-menu>🏁 Menú</button>`;
    sfx.win();
  } else {
    const best = Object.entries(r.after).sort((a, b) => /** @type {number} */ (b[1]) - /** @type {number} */ (a[1]))[0];
    head = `<span class="k3-kicker">FIN DEL TORNEO · ${r.place}º EN LA FINAL</span><h1>SUBCAMPEÓN</h1>`;
    body = `<p>${best[0] === 'player' ? '' : `Ganó ${RIVALS[best[0]] ? RIVALS[best[0]].name : best[0]} por puntos. `}Necesitás terminar primero en puntos de torneo. Reintentá la final: tus puntos anteriores se conservan.</p>`;
    btns = `<button class="k3-b" data-retry>↻ Reintentar la final</button><button class="k3-b alt" data-menu>🏁 Menú</button>`;
  }
  state = r.kind === 'champion' ? 'victory' : r.kind === 'lost' ? 'tourLost' : 'roundEnd';
  endScreen.show(`${head}${body}${table}<div class="k3-btnrow">${btns}</div>`);
}

/* ======================= actualización ======================= */
function playerControl(dt) {
  const c = P.ctl, a = input.axis(), o = S().opts, bd = binds();
  let thr = 0;
  const gas = input.any('KeyW', 'ArrowUp') || input.button('gas');
  const brk = input.any('KeyS', 'ArrowDown') || input.button('brake');
  if (gas) thr = 1;
  if (brk) thr = -1;
  if (o.autoGas && !brk) thr = 1;
  c.throttle = thr;
  c.steer = clamp(a.x * o.sens, -1.3, 1.3);
  c.handbrake = input.down(bd.drift) || input.down('F15') || (input.isTouch && brk && Math.abs(a.x) > 0.5 && P.speed > 8);
  c.nitro = input.down(bd.nitro) || input.down('F13') || input.button('nitro');
  if (input.hit(bd.power, 'F14', 'btn:power')) usePower(P);
  if (c.nitro && P.nitro > 1) sfx.nitro();
  run.moved += Math.abs(P.speed) * dt;
}
function update(dt) {
  // ?debug con manual(true): el tiempo de juego sólo avanza con simulate() (pruebas deterministas)
  if (dbg.manual && !dbg.stepping) return;
  if (overlay) { input.endStep(); return; }
  if (!ACTIVE.has(state)) {
    // menús y pantallas finales: la arena sigue viva de fondo
    if (arena) arena.update(dt, cars.list, { onPickup: () => false, onSwitch() {}, onMine() {}, player: null });
    fx.update(dt);
    orbitCamera(dt);
    input.takeLook(); input.endStep(); ui.tick(dt);
    return;
  }
  if (state === 'cutscene' && cut) {
    if (input.hit('Space', 'Enter', 'F13', 'F14', 'btn:gas', 'btn:power') || cutSkip) { cut.t = cut.dur; cutSkip = false; }
    cut.t += dt; cut.step(dt);
    for (const c of cars.list) if (!c.isBoss) { c.ctl.throttle = 0; c.ctl.steer = 0; c.ctl.nitro = false; stepCar(c, dt, arena, PH); }
    arena.update(dt, cars.list, AH); fx.update(dt); ui.tick(dt); hudTick(dt);
    if (cut.t >= cut.dur) { const k = cut; cut = null; k.end(); }
    input.endStep();
    return;
  }
  if (state === 'countdown') {
    run.countdown -= dt;
    const n = Math.ceil(run.countdown - 0.2);
    if (n !== run.cdShown && run.countdown < 3) { run.cdShown = n; if (n > 0) { ui.big(String(n), 'PREPARATE', 0.9); sfx.beep(false); } }
    if (run.countdown <= 0.2) { state = 'play'; ui.big('¡YA!', 'A DESTROZAR', 0.8); sfx.beep(true); tip('drive'); }
    for (const c of cars.list) { c.ctl.throttle = 0; c.ctl.steer = 0; c.ctl.nitro = false; c.ctl.handbrake = false; }
    if (P && (input.any('KeyW', 'ArrowUp') || input.button('gas'))) sfx.engine(8, false, 1);
  } else if (state === 'play') {
    run.time += dt;
    if (!run.bossTriggered && run.endT <= 0) run.left -= dt;
    if (!P.wrecked) playerControl(dt);
    for (const c of rivals) { if (dbg.freezeAI) { c.ctl.throttle = 0; c.ctl.steer = 0; c.ctl.nitro = false; c.alert = false; continue; } updateAI(c, dt, AIG); }
    if (boss && run.bossTriggered && !dbg.freezeAI) boss.update(dt);
  } else if (state === 'wrecked') {
    P.ctl.throttle = 0; P.ctl.steer = 0; P.ctl.nitro = false;
    for (const c of rivals) updateAI(c, dt, AIG);
    run.deadT -= dt;
    if (run.deadT <= 0) { defeat(); input.endStep(); return; }
  }
  // temporizadores de estado de cada auto
  for (const c of cars.list) {
    if (c.shieldT > 0) c.shieldT -= dt;
    if (c.magnetT > 0) c.magnetT -= dt;
    if (!c.isBoss && c.stunT > 0) c.stunT -= dt;
  }
  magnets(dt);
  for (const c of cars.list) stepCar(c, dt, arena, PH);
  collideCars(cars.list, onCarHit);
  arena.update(dt, cars.list, AH);
  // seguridad: nada se escapa de la arena ni queda con NaN
  for (const c of cars.list) if (!Number.isFinite(c.x) || !Number.isFinite(c.z) || c.y < -6) { const s = arena.spawns[0]; c.x = s.x; c.z = s.z; c.y = 0; c.vx = c.vz = c.vy = 0; c.grounded = true; }
  fx.update(dt);
  // telegrafía del ariete
  for (const c of rivals) {
    const D = decals[c.id];
    if (D && D.lane && D.lane.visible) { D.lane.position.set(c.x, arena.heightAt(c.x, c.z) + 0.06, c.z); D.lane.rotation.y = c.yaw; D.lane.scale.set(3.4, 1, 30); /** @type {any} */ (D.lane.material).opacity = 0.25 + 0.3 * Math.abs(Math.sin(run.time * 14)); }
    if (D && D.shadow && D.shadow.visible) { const k = c.ai.state === 'glide' ? 1 - c.ai.st / c.ai.gT : 0.2; D.shadow.scale.setScalar(1 + k * 3.6); /** @type {any} */ (D.shadow.material).opacity = 0.25 + k * 0.4; }
  }
  if (state === 'play') {
    // motor y derrape
    run.engT -= dt;
    if (run.engT <= 0 && !P.wrecked) { run.engT = 0.09; sfx.engine(P.speed, P.nitroOn, Math.max(0, P.ctl.throttle)); }
    if (P.drift && P.grounded && Math.abs(P.speed) > 8) { run.skidT -= dt; if (run.skidT <= 0) { run.skidT = 0.06; sfx.skid(); fx.dust(P.x - Math.sin(P.yaw) * 1.6, 0.2, P.z - Math.cos(P.yaw) * 1.6, arena.id === 'coliseo' ? 0xd8b47a : arena.id === 'neon' ? 0x6a4aff : 0x9a978f); } }
    contextTips();
    // condiciones de fin
    const alive = rivals.filter(c => !c.wrecked && !c.retired).length;
    if (run.endT > 0) { run.endT -= dt; if (run.endT <= 0) endRound('boss'); }
    else if (ROUNDS[run.round - 1].boss) { if (!run.bossTriggered && (run.left <= 0 || alive === 0)) triggerBoss(); }
    else if (run.left <= 0) endRound('time');
    else if (alive === 0) { ui.big('¡ÚLTIMO EN PIE!', '+500', 1.6); endRound('ko'); }
  }
  updateCamera(dt);
  ui.tick(dt);
  hudTick(dt);
  input.endStep();
}
function contextTips() {
  if (tipId) return;
  if (run.time > 7) tip('ram');
  for (const r of arena.ramps) if (Math.hypot(r.x - P.x, r.z - P.z) < 14) { tip('ramp'); break; }
  for (const s of arena.switches) if (Math.hypot(s.x - P.x, s.z - P.z) < 11) { tip('switch'); break; }
  for (const c of arena.containers) if (!c.st.derailed && Math.hypot(c.box.x - P.x, c.box.z - P.z) < 12) { tip('container'); break; }
  for (const t of arena.towers) if (t.alive && Math.hypot(t.x - P.x, t.z - P.z) < 11) { tip('tower'); break; }
  for (const c of rivals) {
    if (c.wrecked || c.retired) continue;
    const d = Math.hypot(c.x - P.x, c.z - P.z);
    if (c.rtype === 'blindado' && d < 15) tip('tanque');
    if (c.rtype === 'kart' && d < 10) tip('chispa');
  }
}
let lastRender = 0;
function render() {
  const now = performance.now(), dt = lastRender ? Math.min(0.1, (now - lastRender) / 1000) : 1 / 60;
  lastRender = now;
  cars.render(arena ? arena.time : 0, dt, arena ? arena.heightAt : () => 0, fx, QUAL[game.quality].smokeEvery);
}

/* ======================= cámara ======================= */
function updateCamera(dt) {
  if (!P) return;
  if (state === 'wrecked') { cam.orbit += dt * 0.6; camera.position.set(P.x + Math.sin(cam.orbit) * 11, P.y + 6, P.z + Math.cos(cam.orbit) * 11); camera.lookAt(P.x, P.y + 1, P.z); return; }
  const sp = Math.abs(P.speed), o = S().opts, portrait = camera.aspect < 0.85;
  let want = P.yaw;
  if (P.speed < -3) want = P.yaw; // en reversa la cámara sigue detrás
  cam.yaw += wrap(want - cam.yaw) * Math.min(1, dt * (P.grounded ? 4.5 : 1.5));
  const bossOn = boss && run.bossTriggered;
  const dist = (o.cam === 'cerca' ? 7.2 : 9.6) + sp * 0.07 + (portrait ? 2.5 : 0) + (bossOn ? 3 : 0) + (P.isPlayer && S().car === 'omega' ? 0.5 : 0);
  let hgt = 4.3 + (portrait ? 1.6 : 0) + (bossOn ? 1.5 : 0);
  // la cámara no atraviesa los muros: se acerca y sube si quedaría afuera de la arena
  let dd = dist;
  for (let i = 0; i < 10 && !arena.inside(P.x - Math.sin(cam.yaw) * dd, P.z - Math.cos(cam.yaw) * dd, 1.2); i++) dd *= 0.82;
  hgt += (dist - dd) * 0.8;
  const tx = P.x - Math.sin(cam.yaw) * dd, tz = P.z - Math.cos(cam.yaw) * dd, ty = Math.max(P.y, 0) + hgt;
  const k = Math.min(1, dt * 7);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k;
  const sh = fx.shakeAmt * 0.45;
  camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z + (Math.random() - 0.5) * sh);
  const look = portrait ? 2 + sp * 0.05 : 4 + sp * 0.08;
  cam.lx += (P.x + Math.sin(P.yaw) * look - cam.lx) * Math.min(1, dt * 8);
  cam.lz += (P.z + Math.cos(P.yaw) * look - cam.lz) * Math.min(1, dt * 8);
  cam.ly = P.y + (portrait ? -0.6 : 1.3);
  camera.lookAt(cam.lx, cam.ly, cam.lz);
  const fov = 60 + Math.min(14, sp * 0.4) + (P.nitroOn ? 7 : 0) + (portrait ? 8 : 0);
  cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
  if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  followSun(P.x, P.z);
}
function orbitCamera(dt) {
  cam.orbit += dt * (reduced() ? 0 : 0.06);
  const r = 46, portrait = camera.aspect < 0.85;
  camera.position.set(Math.sin(cam.orbit) * r * (portrait ? 1.3 : 1), portrait ? 30 : 22, Math.cos(cam.orbit) * r * (portrait ? 1.3 : 1));
  camera.lookAt(0, 0, 0);
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  followSun(0, 0);
}
function followSun(x, z) {
  const d = arena ? arena.env.sunDir : [30, 55, 20];
  sun.target.position.set(x, 0, z); sun.position.set(x + d[0], d[1], z + d[2]);
}
function applyQuality() {
  const q = QUAL[game.quality] || QUAL.medium;
  const f = /** @type {THREE.Fog} */ (scene.fog); f.near = q.fogNear; f.far = q.fogFar;
  camera.far = q.far; camera.updateProjectionMatrix();
  fx.setCap(Math.round(q.particles / 2));
  if (arena) arena.applyQuality(q);
}

/* ======================= HUD ======================= */
let hudAcc = 0;
function fmt(t) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }
function hudTick(dt) {
  if (tipId) { tipT -= dt; if (tipT <= 0 || (tipId === 'drive' && run.moved > 40)) closeTip(); }
  hudAcc += dt;
  if (hudAcc < 0.1 || !P) return;
  hudAcc = 0;
  const fxs = [P.shieldT > 0 ? '🛡' + Math.ceil(P.shieldT) : '', P.magnetT > 0 ? '🧲' + Math.ceil(P.magnetT) : '', P.boostT > 0 ? '🔥' : '', P.stunT > 0 ? '💫' : ''].filter(Boolean).join(' ');
  ui.status({ name: CARS[S().car].name, speed: P.speed, hp: Math.max(0, P.hp), max: P.maxHp, nitro: P.nitro, nitroOn: P.nitroOn, slot: P.slot, slotIcon: P.slot ? POWERS[P.slot].icon : '', slotKey: input.isTouch ? 'PODER' : keyLabel(binds().power), zone: P.zone, fx: fxs });
  const R = ROUNDS[run.round - 1];
  const bossOn = boss && run.bossTriggered;
  const label = bossOn ? 'GRAN EVENTO' : `R${run.round} · ${R.name.toUpperCase()}`;
  const rows = standings().map(c => ({ name: c.isPlayer ? 'VOS' : c.name, color: '#' + c.color.toString(16).padStart(6, '0'), pts: c.points, me: c.isPlayer, out: c.wrecked || c.retired }));
  ui.board(label, bossOn ? '∞' : state === 'countdown' ? fmt(diff().roundTime) : fmt(run.left), !bossOn && run.left < 15 && state === 'play', rows);
  ui.boss(bossOn ? boss.ui() : null);
  ui.missions(M.state().current.map(m => ({ title: (MISSIONS.find(x => x.id === m.id) || { title: m.title }).title, kind: m.kind, status: m.status, progress: m.progress, target: (MISSIONS.find(x => x.id === m.id) || { target: 1 }).target })));
  if (powerBtn) powerBtn.style.opacity = P.slot ? '1' : '0.4';
  if (nitroBtn) nitroBtn.style.opacity = P.nitro > 5 ? '1' : '0.45';
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'dc-menu' });
const endScreen = screen('', { accent: ACCENT, id: 'dc-end' }); endScreen.hide();
const helpScreen = screen('', { accent: ACCENT, id: 'dc-help' }); helpScreen.hide();
const optScreen = screen('', { accent: ACCENT, id: 'dc-opts' }); optScreen.hide();
let newArmed = false;
function diffText() {
  const d = diff();
  return `Daño recibido ×${d.dmgTaken} · Agresión rival ${Math.round(d.aggro * 100)} % · Velocidad rival ×${d.rivalSpeed} · Vida rival ×${d.rivalHp} · Omega ${d.bossHp} PV, aviso ${d.bossTele} s · Ronda ${d.roundTime} s · Reparaciones ${d.repair} por ronda`;
}
function garageHTML() {
  const s = S();
  const bar = (v, max) => `<i style="--v:${Math.round(v / max * 100)}%"></i>`;
  return `<div class="dc-garage" role="radiogroup" aria-label="Vehículo">${Object.entries(CARS).map(([id, c]) => {
    const locked = id === 'omega' && !s.unlocked.omega;
    return `<button type="button" class="dc-car" role="radio" data-car="${id}" aria-checked="${s.car === id}" ${locked ? 'disabled' : ''}>
      <b>${locked ? '🔒 ' : ''}${c.name}</b><span>Vel.</span>${bar(c.maxSpeed, 30)}<span>Peso</span>${bar(c.mass, 2)}<span>Vida</span>${bar(c.hp, 150)}</button>`;
  }).join('')}</div><div class="dc-cardesc" data-cardesc>${CARS[s.car].perk}: ${CARS[s.car].desc}</div>`;
}
function showMenu() {
  state = 'menu'; ui.show(false); input.showTouch(false); closeTip(); cut = null; overlay = false;
  endScreen.hide(); helpScreen.hide(); optScreen.hide();
  const s = S(), cont = s.started && s.round >= 1;
  const R = ROUNDS[s.round - 1];
  newArmed = false;
  const tp = s.tour.pts;
  menu.show(`<span class="k3-kicker">DEMOLICIÓN VEHICULAR 3D</span><h1>DERBY DE CHATARRA</h1>
    <p>Embestí, derrapá, saltá y sobreviví en tres arenas. Sumá puntos de torneo ronda a ronda y enfrentá al Triturador Omega en la Gran Final.</p>
    ${cont ? `<div class="dc-menu-prog">Torneo en curso: Ronda ${s.round} · ${R.name} (${R.place}) · Tus puntos de torneo: <b>${tp.player}</b> · Destruidos: ${s.tour.wrecks}${s.wins ? ' · 🏆 ' + s.wins : ''}</div>`
      : s.wins ? `<div class="dc-menu-prog">🏆 Torneos ganados: ${s.wins} · Récord: ${s.bestScore}</div>` : ''}
    <div class="k3-btnrow"><button class="k3-b" data-go>${cont ? `▶ Continuar: ${R.name}` : '▶ Empezar torneo'}</button>${cont ? '<button class="k3-b alt" data-new>Nuevo torneo</button>' : ''}</div>
    ${garageHTML()}
    <div data-diff></div><div class="dc-dtab" data-dtab>${diffText()}</div>
    <div class="k3-btnrow"><button class="k3-b alt" data-opts>⚙ Controles y opciones</button><button class="k3-b alt" data-help>📖 Cómo jugar</button></div>
    <div class="dc-credit">CREADO POR <img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  const holder = /** @type {HTMLElement} */ (menu.el.querySelector('[data-diff]'));
  M.difficultyPicker(holder, { onChange: () => { const t = menu.el.querySelector('[data-dtab]'); if (t) t.textContent = diffText(); } });
  const want = (cont ? s.round : 1) + ':' + s.car + ':' + diffName();
  if (!arena || run.setupFor !== want) setupRound(cont ? s.round : 1);
  A.refresh();
}
menu.on('[data-go]', () => { sfx.click(); startRound(S().started ? S().round : 1); });
menu.on('[data-new]', () => {
  const b = /** @type {HTMLElement} */ (menu.el.querySelector('[data-new]'));
  if (!newArmed) { newArmed = true; b.textContent = '¿Abandonar el torneo? Tocá de nuevo'; return; }
  sfx.click(); newTournament(); startRound(1);
});
menu.el.addEventListener('click', e => {
  const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-car]'));
  if (!b || b.hasAttribute('disabled')) return;
  const id = /** @type {string} */ (b.dataset.car);
  S().car = /** @type {any} */ (id); persist(); sfx.click();
  menu.el.querySelectorAll('[data-car]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  const d = menu.el.querySelector('[data-cardesc]'); if (d) d.textContent = `${CARS[id].perk}: ${CARS[id].desc}`;
  if (arena && P) { const sp = arena.spawns[0]; cars.remove(P); makePlayer(); place(P, sp); run.setupFor = run.round + ':' + id + ':' + diffName(); }
});
function newTournament() {
  const s = S(); s.tour = structuredClone(SAVE_DEFAULTS.tour); s.round = 1; s.started = false; persist();
  session.deposito = {}; session.coliseo = {}; session.neon = {};
}
endScreen.on('[data-menu]', () => showMenu());
endScreen.on('[data-next]', () => { sfx.click(); startRound(S().round); });
endScreen.on('[data-retry]', () => { sfx.click(); startRound(run.round); });
endScreen.on('[data-new]', () => { sfx.click(); newTournament(); startRound(1); });

let fromPause = false;
function openHelp(pause) {
  fromPause = pause; overlay = pause;
  if (!pause) menu.hide();
  helpScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:32px">EL DERBY</h1>
    <ul class="k3-list">
      <li>🕹 <b>Manejar:</b> ${input.isTouch ? 'volante a la izquierda, ACEL y FRENO a la derecha' : 'W/↑ acelerar · S/↓ frenar/reversa · A/D o ←/→ girar'} · <b>Derrape:</b> ${K('drift')} · <b>Nitro:</b> ${K('nitro')} · <b>Potenciador:</b> ${K('power')}</li>
      <li>🎮 <b>Gamepad:</b> stick girar · RT/↑ acelerar · LT/↓ frenar · A/RB nitro · X potenciador · B derrape · Start pausa</li>
      <li>💥 <b>Daño:</b> pegá con el frente (×1,25) y cuidá costados (×1,15) y cola (×1,35). El diagrama muestra cada zona; el auto se abolla, humea y se prende fuego.</li>
      <li>🏆 <b>Torneo:</b> 3 rondas. Puntos de ronda = daño causado ×10, +500 por rival destruido, saltos, torres y +300 según tu vida al final. Terminá entre los ${ADVANCE_PLACE} primeros para pasar; ganás si sos 1º en puntos de torneo al final.</li>
      <li>⚡ <b>Potenciadores:</b> 🔥 nitro · 🧲 imán (atrae rivales) · 🛡 escudo (anula daño) · ✴ trampa (mina detrás tuyo) · 🔧 reparación (inmediata).</li>
      <li>🛣 <b>Rampas</b> (saltos acrobáticos), <b>contenedores móviles</b> (descarrilalos de frente) e <b>interruptores</b> que suben/bajan barreras (las eléctricas aturden).</li>
      <li>🏎 La Chispa (kart: frená o recibila de frente) · 🐂 El Toro (esquivá su carga) · 🛸 Dr. Hélice (salí de la sombra roja) · 🛡 Doña Tanque (pegale atrás).</li>
      <li>👹 <b>Triturador Omega:</b> F1 escudo frontal y cargas (hacelo chocar, mejor contra una barrera eléctrica); F2 imán triturador y salto sísmico.</li>
    </ul>
    <div class="k3-btnrow"><button class="k3-b" data-back>Volver</button><button class="k3-b alt" data-retut>Reactivar tutorial</button></div>`);
}
helpScreen.on('[data-back]', closeSub);
helpScreen.on('[data-retut]', () => { S().tutorial = { off: false, seen: {} }; persist(); toast('Tutorial reactivado', 1500); closeSub(); });
function closeSub() {
  helpScreen.hide(); optScreen.hide(); listening = '';
  if (fromPause && ACTIVE.has(state)) { overlay = false; A.pause(); return; }
  overlay = false;
  if (state === 'menu') showMenu();
}
let listening = '';
function openOptions(pause) {
  fromPause = pause; overlay = pause;
  if (!pause) menu.hide();
  const o = S().opts;
  const row = (id, name) => `<div class="dc-bind"><span>${name}</span><button type="button" data-bind="${id}">${listening === id ? 'Apretá una tecla…' : keyLabel(o.binds[id])}</button></div>`;
  optScreen.show(`<span class="k3-kicker">OPCIONES</span><h1 style="font-size:30px">CONTROLES</h1>
    <div class="dc-opts">
      ${row('nitro', 'Nitro')}${row('power', 'Usar potenciador')}${row('drift', 'Derrape (freno de mano)')}
      <label>Sensibilidad de dirección <input type="range" min="0.5" max="1.6" step="0.1" value="${o.sens}" data-sens aria-label="Sensibilidad de dirección"></label>
      <label>Aceleración automática <input type="checkbox" data-autogas ${o.autoGas ? 'checked' : ''}></label>
      <label>Cámara <select data-cam><option value="lejos"${o.cam === 'lejos' ? ' selected' : ''}>Lejos</option><option value="cerca"${o.cam === 'cerca' ? ' selected' : ''}>Cerca</option></select></label>
      <label>Movimiento (sacudidas y destellos) <select data-motion><option value="auto"${o.motion === 'auto' ? ' selected' : ''}>Según el sistema</option><option value="reduce"${o.motion === 'reduce' ? ' selected' : ''}>Reducido</option><option value="full"${o.motion === 'full' ? ' selected' : ''}>Completo</option></select></label>
      <div class="dc-small">Manejo: W/A/S/D o flechas (fijo). Gamepad: stick girar, RT acelerar, LT frenar, A nitro, X potenciador, B derrape, Start pausa. Sonido y calidad gráfica: botón ⚙/⏸ de la barra.</div>
    </div>
    <div class="k3-btnrow"><button class="k3-b" data-back>Listo</button><button class="k3-b alt" data-defaults>Valores por defecto</button></div>`);
}
optScreen.on('[data-back]', closeSub);
optScreen.on('[data-defaults]', () => { S().opts = structuredClone(SAVE_DEFAULTS.opts); persist(); openOptions(fromPause); });
optScreen.el.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-bind]'); if (b) { listening = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.bind); openOptions(fromPause); } });
optScreen.el.addEventListener('input', e => {
  const t = /** @type {HTMLInputElement} */ (e.target), o = S().opts;
  if (t.matches('[data-sens]')) o.sens = +t.value;
  if (t.matches('[data-autogas]')) o.autoGas = t.checked;
  if (t.matches('[data-cam]')) o.cam = /** @type {any} */ (t.value);
  if (t.matches('[data-motion]')) o.motion = /** @type {any} */ (t.value);
  persist();
});
optScreen.el.addEventListener('keydown', e => {
  if (!listening) return;
  e.preventDefault();
  const fixed = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyP', 'Escape'];
  if (!fixed.includes(e.code)) {
    const o = S().opts; for (const k in o.binds) if (o.binds[k] === e.code) o.binds[k] = o.binds[listening];
    o.binds[listening] = e.code; persist();
  }
  listening = ''; openOptions(fromPause);
}, true);
// gamepad A en menús: pulsa el botón enfocado
addEventListener('keydown', e => {
  if (e.code !== 'F13' || ACTIVE.has(state)) return;
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (el && el.closest('.k3-screen') && el.tagName === 'BUTTON') el.click();
});
game.root.addEventListener('pointerdown', () => { if (state === 'cutscene') cutSkip = true; });

/* ======================= gancho de pruebas ======================= */
const pub = c => c && ({ id: c.id, name: c.name, type: c.rtype || (c.isBoss ? 'jefe' : 'jugador'), x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +c.z.toFixed(3), yaw: +c.yaw.toFixed(3), speed: +c.speed.toFixed(3),
  hp: +c.hp.toFixed(2), maxHp: c.maxHp, points: c.points, wrecked: c.wrecked, retired: c.retired, grounded: c.grounded, air: +c.air.toFixed(3), state: c.ai ? c.ai.state : '', stun: c.stunT > 0,
  alert: !!c.alert, vuln: !!c.vuln, slot: c.slot, shield: c.shieldT > 0, magnet: c.magnetT > 0, boost: c.boostT > 0, nitro: +c.nitro.toFixed(1), zone: { ...c.zone }, mass: c.mass });
const hook = {
  get state() { return state; },
  get scene() { return arena ? arena.name : ''; },
  get arenaId() { return arena ? arena.id : ''; },
  get round() { return run.round; },
  get missions() { return M.state(); },
  get player() { return pub(P); },
  get hp() { return P ? P.hp : 0; }, get maxHp() { return P ? P.maxHp : 0; },
  get score() { return P ? P.points : 0; }, get tourScore() { return S().tour.score; },
  get timeLeft() { return run.left; }, get runTime() { return run.time; }, get simTime() { return game.simTime; }, get countdown() { return run.countdown; },
  get paused() { return game.paused; }, get overlay() { return overlay; },
  get tip() { return tipId; }, get big() { return ui.bigText; },
  get rivals() { return rivals.map(pub); },
  get stats() { return { stunts: run.stunts, towers: run.towers, wrecks: run.wrecks, repairs: run.repairs, powerTypes: [...run.powerTypes] }; },
  get standings() { return P ? standings().map(c => ({ id: c.isPlayer ? 'player' : c.id, points: c.points })) : []; },
  get result() { return run.result ? { kind: run.result.kind, place: run.result.place, reason: run.result.reason } : null; },
  get boss() { if (!boss) return null; const c = boss.car; return { phase: boss.phase, sub: boss.sub, hp: +c.hp.toFixed(1), maxHp: c.maxHp, x: +c.x.toFixed(2), z: +c.z.toFixed(2), stun: c.stunT > 0, shield: !!(c.shield && c.shield.visible), triggered: run.bossTriggered, stuns: boss.stuns, elecStuns: boss.elecStuns, wave: boss.wave.on, defeated: boss.defeated, retired: c.retired }; },
  get interactions() {
    if (!arena) return {};
    return {
      ramps: arena.ramps.map(r => ({ id: r.id, x: r.x, z: r.z, yaw: r.yaw, used: r.st.used, best: r.st.best, lit: r.st.used > 0 })),
      containers: arena.containers.map(c => ({ id: c.id, x: +c.box.x.toFixed(2), z: +c.box.z.toFixed(2), t: +c.t.toFixed(3), moving: c.moving, derailed: c.st.derailed })),
      switches: arena.switches.map(s => ({ id: s.id, x: s.x, z: s.z, on: s.on })),
      barriers: arena.barriers.map(b => ({ id: b.id, up: b.up, solid: b.box.on, anim: +b.anim.toFixed(2), elec: b.elec })),
      towers: arena.towers.map(t => ({ id: t.id, x: t.x, z: t.z, alive: t.alive })),
      pads: arena.pads.map(p => ({ x: p.x, z: p.z, type: p.type })),
      mines: arena.mines.length,
    };
  },
  get counts() { return { cars: cars.list.filter(c => !c.retired).length, wheels: cars.wheelCount, particles: fx.count, colliders: arena ? arena.boxes.length + arena.circles.length : 0, decor: arena ? arena.decor.reduce((n, d) => n + d.mesh.count, 0) : 0 }; },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...game.perf, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames: game.frames }; },
  get quality() { const q = QUAL[game.quality]; return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, particles: fx.cap, decor: q.decor, decorCount: arena ? arena.decor.reduce((n, d) => n + d.mesh.count, 0) : 0, fogFar: /** @type {any} */ (scene.fog).far, far: camera.far }; },
  get difficulty() { return { name: diffName(), ...diff() }; },
  get save() { return structuredClone(S()); },
  get session() { return structuredClone(session); },
};
if (DEBUG) {
  /** @type {any} */ (hook).debug = {
    goto(n) { startRound(n); run.countdown = 0.21; },
    skipCountdown() { run.countdown = 0.21; },
    simulate(sec) { dbg.stepping = true; try { game.simulate(sec); } finally { dbg.stepping = false; } },
    manual(on = true) { dbg.manual = on; },
    teleport(x, z, yaw) { P.x = x; P.z = z; P.y = arena.heightAt(x, z); if (yaw !== undefined) { P.yaw = yaw; cam.yaw = yaw; } P.vx = P.vz = P.vy = 0; P.yawRate = 0; P.grounded = true; cam.x = x - Math.sin(P.yaw) * 9; cam.z = z - Math.cos(P.yaw) * 9; },
    place(id, x, z, yaw) { const c = cars.list.find(o => o.id === id); if (!c) return false; c.x = x; c.z = z; c.y = arena.heightAt(x, z); if (yaw !== undefined) c.yaw = yaw; c.vx = c.vz = c.vy = 0; c.yawRate = 0; c.grounded = true; return true; },
    setSpeed(v) { P.vx = Math.sin(P.yaw) * v; P.vz = Math.cos(P.yaw) * v; },
    setHP(n) { P.hp = n; }, hurt(n) { damageCar(P, n, 'l', null, 'debug'); },
    rivalHP(id, n) { const c = rivals.find(o => o.id === id); if (c) c.hp = n; },
    give(type) { P.slot = type; },
    rivalState(id, st, t) { const c = rivals.find(o => o.id === id); if (!c) return false; c.stunT = 0; c.ai.state = st; c.ai.st = t ?? 1; if (st === 'charge') { c.ai.lockYaw = c.yaw; c.boostT = t ?? 2; } return true; },
    freezeAI(on = true) { dbg.freezeAI = on; }, god(on = true) { dbg.god = on; },
    wreck(id) { for (const c of rivals) if ((id === 'all' || c.id === id) && !c.wrecked) damageCar(c, 9999, 'l', P, 'debug'); },
    setTime(t) { run.left = t; },
    setPoints(id, n) { const c = id === 'player' ? P : rivals.find(o => o.id === id); if (c) c.points = n; },
    spawnBoss() { if (run.round !== 3) startRound(3); run.countdown = 0; state = 'play'; triggerBoss(); },
    skipCut() { if (cut) cut.t = cut.dur; },
    bossPhase(n) { if (!boss) return; if (!run.bossTriggered) this.spawnBoss(); if (cut) { const k = cut; cut = null; k.end(); } if (n === 2 && boss.phase === 1) { boss.car.hp = boss.car.maxHp * 0.55; boss.hurt(0.01); } },
    bossHit(n) { if (boss) boss.hurt(n); },
    bossCharge() { if (!boss) return; boss.car.stunT = 0; boss.sub = 'aim'; boss.st = 0.01; },
    bossAttack(kind) { if (!boss) return; boss.car.stunT = 0; if (kind === 'magnet') { boss.sub = 'magTele'; boss.st = 0.3; } else if (kind === 'jump') { boss.sub = 'jumpTele'; boss.st = 0.3; boss.tx = P.x; boss.tz = P.z; } },
    killBoss() { if (boss) boss.hurt(99999); },
    toggleSwitch(id) { const s = arena.switches.find(x => x.id === id); if (s) { arena.toggleSwitch(s); return true; } return false; },
    endRound() { endRound('time'); },
  };
}
W['__' + GAME_ID] = Object.freeze(hook);

/* ======================= arranque ======================= */
showMenu();
applyQuality();
game.start();
