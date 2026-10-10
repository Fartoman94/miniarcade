// @ts-check
/* Portales Imposibles — juego principal: estados, sujeto de prueba en primera persona, pistola de portales,
   cámara, misiones, guardado, contrarreloj, menús, tutorial, pistas y ganchos de prueba. */
import { createGame, createInput, createSave, screen, toast, clamp, THREE } from '../../matelabs/kit3d.js';
import { GAME_ID, TITLE, ACCENT, DIFF, QUAL, MISSIONS, SAVE_VERSION, SAVE_DEFAULTS, ROOMS, ROOM, SCEN_NAMES, CRYSTALS, PHYS, BIND_NAMES, keyLabel } from './config.js';
import { createMaterials, makeGun, playerBodyGeo } from './models.js';
import { body as mkBody, raycast, depenetrate } from './physics.js';
import { createPortals } from './portals.js';
import { SCENARIOS } from './levels.js';
import { createFx } from './fx.js';
import { createSfx } from './sfx.js';
import { createUI } from './ui.js';
import * as PM from './portalmath.js';

const W = /** @type {any} */ (window);
const A = W.MLArcade, M = W.MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');

/* ======================= guardado ======================= */
const save = createSave(GAME_ID + ':save', SAVE_VERSION, structuredClone(SAVE_DEFAULTS), (old) => old || {});
/** Repara datos con forma inválida (guardado viejo, editado o a medias): nunca bloquea la partida. */
function sanitize() {
  const s = /** @type {any} */ (save.get()), D = /** @type {any} */ (SAVE_DEFAULTS);
  for (const k in D) {
    const dv = D[k], v = s[k];
    if (Array.isArray(dv)) { s[k] = Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; }
    else if (dv && typeof dv === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (typeof v !== typeof dv) s[k] = dv;
  }
  for (const k in s) if (!(k in D)) delete s[k];
  if (![1, 2, 3].includes(s.scen)) s.scen = 1;
  if (!ROOM[s.room] || ROOM[s.room].scen !== s.scen) s.room = ROOMS.find(r => r.scen === s.scen)?.id || '1-1';
  s.crystals = [...new Set(s.crystals.filter(c => CRYSTALS.includes(c)))];
  const solved = {}; for (const k in s.solved) if (ROOM[k] && s.solved[k] === true) solved[k] = true; s.solved = solved;
  const best = {}; for (const k in s.best) if (ROOM[k] && typeof s.best[k] === 'number' && isFinite(s.best[k]) && s.best[k] > 0) best[k] = s.best[k]; s.best = best;
  s.tutorial = { off: !!s.tutorial.off, seen: (s.tutorial.seen && typeof s.tutorial.seen === 'object' && !Array.isArray(s.tutorial.seen)) ? s.tutorial.seen : {} };
  const o = s.opts, dO = D.opts;
  s.opts = {
    sens: typeof o.sens === 'number' && o.sens >= 0.3 && o.sens <= 2.5 ? o.sens : 1,
    invert: !!o.invert,
    motion: ['auto', 'reduce', 'full'].includes(o.motion) ? o.motion : 'auto',
    fov: typeof o.fov === 'number' && o.fov >= 60 && o.fov <= 95 ? o.fov : 72,
    binds: { ...dO.binds, ...(o.binds && typeof o.binds === 'object' ? o.binds : {}) },
  };
  for (const k in dO.binds) if (typeof s.opts.binds[k] !== 'string' || !s.opts.binds[k]) s.opts.binds[k] = dO.binds[k];
  for (const k in s.opts.binds) if (!(k in dO.binds)) delete s.opts.binds[k];
  if (!isFinite(s.wins) || s.wins < 0) s.wins = 0;
  if (!isFinite(s.bestRun) || s.bestRun < 0) s.bestRun = 0;
}
sanitize(); save.flush();
const S = () => /** @type {typeof SAVE_DEFAULTS} */ (save.get());
const persist = () => save.flush();
const binds = () => S().opts.binds;

/* ======================= misiones y dificultad ======================= */
M.setup({ gameId: GAME_ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 2, hud: 'tl' });
const diffName = () => /** @type {keyof typeof DIFF} */ (M.difficulty(GAME_ID));
const diff = () => DIFF[diffName()] || DIFF.normal;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => { const m = S().opts.motion; return m === 'reduce' || (m === 'auto' && reducedMQ.matches); };

/* ======================= juego base ======================= */
const ACTIVE = new Set(['play', 'cutscene', 'dead', 'transition']);
let state = 'menu';
const game = createGame({
  id: GAME_ID, title: TITLE, toolbar: 'tr', background: 0x0c1520, fov: S().opts.fov, far: 160,
  help: ['WASD o joystick: moverte · mouse (clic para capturarlo), flechas o arrastrar: mirar', 'Clic izquierdo / Q: portal AZUL · clic derecho / F: portal NARANJA (sólo en paneles blancos)',
    'E: usar pedestales, agarrar/soltar cubos, empujar torretas por la espalda · Espacio: saltar', 'H: pista por etapas · R: reiniciar la sala (nunca te quedás trabado)',
    'Táctil: tocá un punto de la pantalla para disparar ahí el portal que falta (o el más viejo)', 'Las teclas se cambian en «Controles y accesibilidad»', 'Esc, P o Start: pausa'],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'F13', x: 'F14', y: 'F15', b: 'F16', select: 'F17', lb: 'ArrowLeft', rb: 'ArrowRight', lt: 'ArrowDown', rt: 'ArrowUp' },
  isActive: () => ACTIVE.has(state),
  update, render, onRestart, onQuality: () => applyQuality(),
  actions: [
    { label: '💡 Pedir pista', fn: () => { if (state === 'play') askHint(); } },
    { label: '↺ Reiniciar sala', fn: () => { if (state === 'play') resetRoomByPlayer(); } },
    { label: '📖 Cómo jugar y tutorial', fn: () => openHelp(true) },
    { label: '⚙ Controles y accesibilidad', fn: () => openOptions(true) },
    { label: '🧪 Volver al menú del laboratorio', fn: exitToMenu },
  ],
});
const { scene, camera, renderer } = game;
renderer.info.autoReset = false;
renderer.shadowMap.autoUpdate = false;
scene.add(camera);
scene.fog = new THREE.Fog(0x0c1520, 22, 75);
const mats = createMaterials();
const hemi = new THREE.HemisphereLight(0xe4f0ff, 0x3d4858, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -0.0012;
scene.add(sun, sun.target);
const fx = createFx(scene, mats, reduced);
const sfx = createSfx(game.audio);
const ui = createUI();
ui.on('hint', () => askHint());
ui.on('reset', () => resetRoomByPlayer());

/* ======================= sujeto de prueba ======================= */
const P = {
  body: mkBody(PHYS.halfW, PHYS.halfH, PHYS.halfW, 0.36),
  yaw: 0, pitch: 0, alive: false, hp: 3, maxHp: 3, inv: 0, regenT: 0, burnT: 0, jumpBuf: 0, coyote: 0, stepT: 0, bob: 0,
  held: /** @type {any} */ (null), shotCd: 0, useCd: 0, lastShot: 'B', placedOrder: /** @type {string[]} */ ([]),
  get vulnerable() { return state === 'play' && P.inv <= 0 && P.alive; },
};
const gun = makeGun(mats); camera.add(gun.group);
const bodyMesh = new THREE.Mesh(playerBodyGeo(), mats.vc); bodyMesh.visible = false; scene.add(bodyMesh);
let input = createInput(game.root, { joystick: 'left', buttons: [{ id: 'a', label: 'AZUL' }, { id: 'b', label: 'NARANJA' }, { id: 'use', label: 'USAR' }, { id: 'jump', label: 'SALTO' }] });
if (input.isTouch) document.body.classList.add('pi-touch');
input.showTouch(false);
const useBtn = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="use"]'));

/* ======================= partida ======================= */
const run = {
  mode: 'campaign', score: 0, time: 0, lives: 6, deaths: 0, deadT: 0, transT: 0, transTo: 0,
  roomId: '', roomT: /** @type {Record<string, number>} */ ({}), shots: /** @type {Record<string, number>} */ ({}), hints: /** @type {Record<string, number>} */ ({}), hintsTotal: 0,
  tt: /** @type {any} */ (null), ttGen: false, idleT: 0, burnAcc: 0,
};
/** @type {any} */ let level = null;
/** @type {any} */ let cur = null;
/** @type {any} */ let cut = null;
let tipId = '', tipT = 0, moved = 0, cutSkip = false;
const cam = { menuA: 0, shakeX: 0, shakeY: 0 };
const emit = (ev, v) => M.emit(ev, v);
const addScore = n => { run.score += Math.round(n); };
const genOn = () => run.mode === 'tt' && run.tt && run.tt.room === '2-2' ? run.ttGen : S().generator;

/** Contexto compartido con niveles, portales y jefe. */
const ctx = {
  THREE, scene, camera, renderer, M: mats, S, persist, diff, reduced, sfx, fx, emit,
  get player() { return P; },
  state: () => state,
  lists: () => level ? level.lists() : [[], []],
  toast: (t, ms) => toast(t, ms || 2000),
  hurt, laserBurn,
  get portals() { return portals; },
  collectCrystal(c) {
    const s = S(); if (!s.crystals.includes(c.id)) s.crystals.push(c.id); persist();
    emit('crystal', s.crystals.length); addScore(250); sfx.crystal(); fx.burst(c.x, c.y, c.z, 0xc8a6ff, 24, 3, 1);
    toast(`💎 Cristal ${s.crystals.length}/${CRYSTALS.length}`, 1600);
  },
  solveRoom, restoreGenerator, nextScenario, escape, bossIntro, clearPortals, genOn,
  onBossPhase(n) {
    const names = { 1: 'FASE 1 · ESCUDO PRISMÁTICO', 2: 'FASE 2 · SOBRECARGA', 3: 'FASE 3 · COLAPSO' };
    ui.title(/** @type {any} */ (names)[n], 'NÚCLEO FRACTAL', 2600);
    toast(n === 1 ? 'Quemá los tres pilares con el láser' : n === 2 ? '¡Nuevas reglas! El piso se electrifica: llevá cubos al Núcleo desde el techo' : '¡Colapso! Escapá antes de que suba el ácido', 3000);
    tip(n === 1 ? 'boss1' : n === 2 ? 'boss2' : 'boss3');
    emit('bossPhase', n);
  },
  onTurretDown(t, how) { emit('turretDown'); addScore(150); toast(how === 'push' ? 'Torreta tumbada por la espalda' : how === 'cube' ? '¡Torreta tumbada con un cubo!' : how === 'laser' ? 'El láser tumbó la torreta' : 'Torreta fuera de servicio', 1500); },
  onTurretSpot() { tip('turret'); },
  onSphereSpot() { tip('sphere'); },
  onSpherePulse(s) {
    const had = portals.A.placed || portals.B.placed;
    clearPortals('sphere');
    if (diffName() === 'dificil' || diffName() === 'extremo') hurt(1, s.pos.x, s.pos.z, 'sphere');
    if (had) toast('¡Una esfera supervisora te detectó y borró los portales!', 2200);
    emit('spotted');
  },
  dropHeld,
};
const portals = createPortals(ctx);

/* ======================= tutorial contextual ======================= */
const K = id => input.isTouch ? ({ jump: 'SALTO', use: 'USAR', portalA: 'AZUL', portalB: 'NARANJA', hint: '💡', reset: '↺' })[id] : keyLabel(binds()[id]);
const TIPS = {
  move: () => input.isTouch ? 'Movete con el <b>joystick</b> y arrastrá el dedo para mirar.' : 'Movete con <b>WASD</b>. Hacé <b>clic</b> en la pantalla para capturar el mouse y mirar (o usá las flechas).',
  portal: () => input.isTouch ? 'Botones <b>AZUL</b> y <b>NARANJA</b>: disparan a la mira. También podés <b>tocar un punto</b> de la pantalla. Sólo se pegan a los <b>paneles blancos</b>.' : `<b>Clic izquierdo</b> (o ${K('portalA')}) dispara el portal <b style="color:#35b6ff">azul</b>, <b>clic derecho</b> (o ${K('portalB')}) el <b style="color:#ff8a24">naranja</b>. Sólo se pegan a <b>paneles blancos</b>.`,
  through: () => 'Con los dos portales puestos, <b>caminá a través</b>: entrás por uno y salís por el otro, con tu misma velocidad.',
  cube: () => `Mirá un cubo y apretá <b>${K('use')}</b> para agarrarlo; otra vez para soltarlo. Los cubos también cruzan portales.`,
  button: () => 'Los <b>botones rojos</b> del piso se activan con peso: un cubo o vos.',
  switch: () => `Acercate a un <b>pedestal</b> y apretá <b>${K('use')}</b>. Algunos abren compuertas <b>temporizadas</b>: ¡corré!`,
  laser: () => 'El <b>láser</b> quema, pero atraviesa portales. Llevalo hasta un <b>panel de energía</b> para encenderlo.',
  lift: () => 'Los <b>campos de gravedad</b> violetas te elevan (a vos y a los cubos) cuando tienen energía.',
  turret: () => `¡<b>Torreta</b>! Cortá su línea de visión. Se tumba con un cubo, con el láser, con un portal bajo sus patas o empujándola por la espalda (<b>${K('use')}</b>).`,
  sphere: () => 'Una <b>esfera supervisora</b> te está escaneando: salí de su foco de luz o te borra los portales. El láser la aturde y un cubo suelto la distrae.',
  fling: () => '<b>Lanzamiento:</b> lo que cae rápido en un portal sale rápido del otro. La altura es velocidad.',
  moving: () => 'Ese panel blanco <b>se mueve</b>: el portal viaja con él.',
  gravity: () => 'En esta sala la <b>gravedad es reducida</b>: saltás más alto y los lanzamientos llegan más lejos.',
  hint: () => `¿Trabado? Pedí una <b>pista</b> con <b>${K('hint')}</b> (o 💡). Son por etapas. ${K('reset')} reinicia la sala.`,
  boss1: () => 'El láser entra por el panel blanco fijo del fondo. Sacalo por un panel <b>móvil</b>: cuando se frena frente a un <b>pilar</b>, lo quema. ¡Esquivá los anillos rojos!',
  boss2: () => 'Pedí un <b>cubo de carga</b> en el pedestal. Portal en el <b>piso blanco</b> y en el <b>techo móvil</b>: soltá el cubo cuando el haz violeta marque que el techo está sobre el Núcleo.',
  boss3: () => 'El ácido sube. Usá un panel bajo y el panel de la <b>plataforma alta</b> (noroeste). Los <b>pulsos</b> del Núcleo borran tus portales: mirá el brillo.',
};
function tip(id) {
  const t = S().tutorial;
  if (t.off || t.seen[id] || tipId === id || state === 'menu' || run.mode === 'tt') return;
  t.seen[id] = true; persist();
  tipId = id; tipT = 14;
  ui.tip(/** @type {any} */ (TIPS)[id](), a => { if (a === 'skip') { S().tutorial.off = true; persist(); toast('Tutorial desactivado (lo reactivás desde «Cómo jugar»)', 2200); } closeTip(); });
  emit('tutorial');
}
function closeTip() { tipId = ''; ui.tip(null); }

/* ======================= escenarios ======================= */
function loadScenario(n, spawnId) {
  if (level) { dropHeld(false); level.dispose(); }
  portals.clear();
  fx.clear(); cur = null;
  level = SCENARIOS[n](ctx);
  level.finalize();
  P.body.self = level.playerBox;
  const e = level.env;
  /** @type {any} */ (scene.background).setHex(e.bg); /** @type {any} */ (scene.fog).color.setHex(e.fog);
  hemi.color.setHex(e.sky); hemi.groundColor.setHex(e.ground); hemi.intensity = e.hemi;
  sun.color.setHex(e.sun); sun.intensity = e.sunI;
  mats.trim.emissive.setHex(e.trim); mats.metal.color.setHex(e.metal); mats.white.color.setHex(e.white);
  fx.setDustColor(e.dust);
  // salas resueltas: su salida queda abierta (salvo la sala de contrarreloj)
  for (const r of level.rooms) if (r.exitDoor) r.exitDoor.forced = !!S().solved[r.id] && !(run.mode === 'tt' && run.tt && run.tt.room === r.id);
  applyQuality();
  placeAt(spawnId);
  run.roomId = '';
}
function placeAt(spawnId) {
  const sp = level.spawns[spawnId] || level.spawns.start;
  const b = P.body; b.pos.x = sp.x; b.pos.y = sp.y + 0.02; b.pos.z = sp.z; b.vel.x = b.vel.y = b.vel.z = 0; b.ground = null; b.grounded = false;
  P.yaw = sp.yaw; P.pitch = 0;
}
function applyQuality() {
  const q = QUAL[game.quality] || QUAL.medium;
  const f = /** @type {THREE.Fog} */ (scene.fog); f.near = q.fogNear; f.far = q.fogFar;
  camera.far = q.far; camera.updateProjectionMatrix();
  if (portals.rtScale !== q.portalRT || portals.rtHalf !== q.rtHalfFloat) portals.setQuality(q.portalRT, q.rtHalfFloat);
  fx.setCap(q.particles);
  if (level) level.applyQuality(q);
}

/* ======================= ciclo de partida ======================= */
function resetRunState() {
  const d = diff();
  run.score = 0; run.time = 0; run.lives = run.mode === 'tt' ? Infinity : d.lives; run.deaths = 0; run.roomT = {}; run.shots = {}; run.hints = {}; run.hintsTotal = 0; run.roomId = ''; run.idleT = 0; run.ttGen = false;
  P.maxHp = d.hp; P.hp = d.hp; P.inv = 0; P.alive = true; P.held = null; P.regenT = 0; P.burnT = 0; P.placedOrder = [];
  cut = null; closeTip(); ui.hint(null);
}
function startRun(fresh) {
  if (fresh) {
    const keep = { opts: S().opts, tutorial: S().tutorial, wins: S().wins, bestRun: S().bestRun, best: S().best, goldGun: S().goldGun };
    save.reset(); Object.assign(save.get(), structuredClone(keep)); sanitize(); persist();
    emit('newGame');
  }
  run.mode = 'campaign'; run.tt = null;
  const s = S(); s.started = true; persist();
  resetRunState();
  const room = ROOM[s.room];
  loadScenario(s.scen, room && level_hasStart(s.room) ? s.room : 'start');
  beginPlay();
  M.runStart();
  // progreso guardado que cuenta para las misiones de esta partida
  const lab = ['1-1', '1-2', '1-3'].filter(k => s.solved[k]).length; if (lab) emit('labRoom', lab);
  if (s.generator) emit('generator');
  if (s.bossDone) emit('escape');
  if (s.crystals.length) emit('crystal', s.crystals.length);
  A.started();
  setTimeout(() => tip('move'), 300);
}
function level_hasStart(id) { return id !== '1-1' && id !== '2-1' && id !== '3-1'; }
function startTT(roomId) {
  const r = ROOM[roomId]; if (!r) return;
  run.mode = 'tt'; run.tt = { room: roomId, t0: 0 };
  resetRunState();
  loadScenario(r.scen, level_hasStart(roomId) ? roomId : 'start');
  beginPlay();
  run.tt.t0 = run.time;
  M.runStart();
  A.started();
  ui.title(r.name, '⏱ CONTRARRELOJ', 2000);
}
function beginPlay() {
  state = 'play';
  menu.hide(); endScreen.hide(); helpScreen.hide(); optScreen.hide(); ttScreen.hide();
  ui.show(true); input.showTouch(true); input.clear();
  gun.group.visible = true; applyGunColor();
  moved = 0;
}
function endRun(won) {
  M.runEnd({ won });
  A.ended({ score: run.score });
}
function onRestart() {
  if (state === 'menu' || state === 'victory' || state === 'defeat' || state === 'ttresult') return;
  endRun(false);
  if (run.mode === 'tt') startTT(run.tt.room); else startRun(false);
}
function exitToMenu() {
  if (ACTIVE.has(state)) { A.pause(); A.resume(); }
  if (ACTIVE.has(state)) endRun(false);
  releaseLock();
  state = 'menu'; showMenu();
}

/* ======================= daño, muerte y reinicio de sala ======================= */
function hurt(n, fromX, fromZ, kind) {
  if (!P.vulnerable) return;
  P.hp -= n; P.inv = 0.45; P.regenT = 4;
  const b = P.body, dx = b.pos.x - fromX, dz = b.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
  b.vel.x += dx / l * 2.5; b.vel.z += dz / l * 2.5;
  if (!reduced()) ui.flash();
  fx.shake(0.25); sfx.hurt(); emit('hurt');
  if (P.hp <= 0) die(kind);
}
function laserBurn(dt) {
  if (!P.vulnerable && P.inv > 0) return;
  P.burnT -= dt;
  if (P.burnT <= 0) {
    P.burnT = 0.45;
    const b = P.body;
    hurt(1, b.pos.x - b.vel.x, b.pos.z - b.vel.z, 'laser');
    b.vel.x *= -0.8; b.vel.z *= -0.8;
    fx.burst(b.pos.x, b.pos.y + 0.4, b.pos.z, 0xff4060, 8, 2);
    sfx.laserHit();
  }
}
function die(kind) {
  if (state !== 'play') return;
  dropHeld(false);
  run.deaths++; P.alive = false; P.hp = 0;
  if (run.lives !== Infinity) run.lives--;
  state = 'dead'; run.deadT = 1.3;
  if (kind === 'acid') sfx.acid(); else sfx.die();
  emit('death');
  ui.fade(true);
  const why = kind === 'acid' ? 'El ácido te disolvió' : kind === 'fall' ? 'Caíste al vacío' : kind === 'turret' ? 'Las torretas te alcanzaron' : kind === 'laser' ? 'El láser te quemó' : kind === 'shock' ? 'Te electrocutaste' : 'Sujeto descartado';
  toast(run.lives > 0 ? `${why}. Se restablece la sala (🧬 ${run.lives === Infinity ? '∞' : run.lives})` : `${why}. No quedan respaldos`, 2000);
}
function respawn() {
  if (run.lives <= 0) { defeat(); return; }
  const r = currentRoom();
  if (r) { level.resetRoom(r); }
  portals.clear();
  if (level.boss && r && r.id === '3-B') level.boss.resetPhase();
  placeAt(r ? r.id : 'start');
  if (r && r.id === '1-1' || r && r.id === '2-1' || r && r.id === '3-1') placeAt('start');
  P.alive = true; P.hp = P.maxHp; P.inv = 1.2; state = 'play';
  setTimeout(() => ui.fade(false), 60);
}
function currentRoom() { return level && (level.room[run.roomId] || null); }
function resetRoomByPlayer() {
  const r = currentRoom();
  if (!r || state !== 'play') { sfx.denied(); return; }
  if (r.id === '3-B' && level.boss && level.boss.phase >= 1 && level.boss.phase <= 3) { toast('En la pelea, reiniciar la sala vuelve a empezar la fase', 1800); }
  dropHeld(false);
  level.resetRoom(r); portals.clear();
  if (level.boss && r.id === '3-B') level.boss.resetPhase();
  placeAt(level_hasStart(r.id) ? r.id : 'start');
  sfx.clearP(); ui.fade(true); setTimeout(() => ui.fade(false), 150);
  toast('↺ Sala restablecida', 1200);
  emit('roomReset');
}
function clearPortals(why) {
  if (!portals.A.placed && !portals.B.placed) return;
  portals.clear(); P.placedOrder = [];
  sfx.clearP();
  if (why === 'fizz') emit('fizzled');
}

/* ======================= salas ======================= */
function roomStart(id) {
  run.roomId = id;
  if (run.roomT[id] === undefined) { run.roomT[id] = run.time; run.shots[id] = 0; run.hints[id] = 0; }
  if (run.mode === 'campaign' && S().room !== id) { S().room = id; persist(); }
  const r = ROOM[id];
  if (!S().solved[id] || run.mode === 'tt') ui.title(r.name, `SALA ${id}`, 1800);
  run.idleT = 0;
  if (id === '1-1') setTimeout(() => tip('portal'), 2500);
  if (id === '1-3') setTimeout(() => tip('fling'), 1500);
  if (id === '2-2') setTimeout(() => tip('gravity'), 1500);
  if (id === '3-1') setTimeout(() => tip('moving'), 1500);
}
function solveRoom(id) {
  const r = ROOM[id], s = S();
  if (run.mode === 'tt') { if (run.tt && id === run.tt.room) finishTT(); return; }
  if (s.solved[id]) return;
  s.solved[id] = true;
  const lr = level && level.room[id]; if (lr && lr.exitDoor) lr.exitDoor.forced = true;
  const start = run.roomT[id], el = start === undefined ? Infinity : run.time - start, par = r.par * diff().parMul;
  if (isFinite(el)) s.best[id] = Math.min(s.best[id] || Infinity, Math.round(el * 10) / 10);
  persist();
  if (r.scen === 1) emit('labRoom');
  emit('roomSolved');
  const shots = run.shots[id] ?? 99, hints = run.hints[id] ?? 0;
  let bonus = 1000 + (isFinite(el) ? Math.max(0, par - el) * 15 : 0);
  if (shots <= 2) { emit('twoPortals'); bonus += 200; }
  if (!hints && isFinite(el)) { emit('noHintRoom'); bonus += 300; }
  if (isFinite(el) && el <= par) { emit('parRoom'); setTimeout(() => toast('⏱ ¡Tiempo objetivo!', 1600), 1300); }
  addScore(bonus); sfx.solve();
  toast(`✔ ${r.name} resuelta${isFinite(el) ? ' · ' + fmtTime(el) : ''}${shots <= 2 ? ' · 2 portales' : ''}`, 2400);
  if (run.roomId === id) run.roomId = '';
  ui.hint(null);
}
function restoreGenerator() {
  if (genOn()) return;
  if (run.mode === 'tt') { run.ttGen = true; }
  else { S().generator = true; persist(); emit('generator'); addScore(1500); }
  sfx.generator(); fx.shake(0.4); ui.title('GENERADOR RESTAURADO', 'SALAS DE GRAVEDAD', 2600);
  toast('⚡ El generador volvió a la vida. La salida está abierta.', 2600);
}
function nextScenario(n) {
  if (state !== 'play' || run.mode === 'tt') return;
  state = 'transition'; run.transT = 0.6; run.transTo = n; ui.fade(true);
  dropHeld(false);
}
function bossIntro(B) {
  if (state !== 'play') return;
  state = 'cutscene'; cutSkip = false; closeTip(); dropHeld(false);
  ui.title('NÚCLEO FRACTAL', 'EL GRAN EVENTO', 3200); sfx.bossRoar();
  const core = B.core.position;
  cut = {
    t: 0, dur: reduced() ? 2.2 : 4.4,
    step(dt) {
      const k = Math.min(1, cut.t / cut.dur), ang = -0.9 + k * 1.6, r = 13 - k * 3;
      B.intro(k);
      camera.position.set(core.x + Math.sin(ang) * r, 3 + k * 4, core.z + Math.cos(ang) * r);
      camera.lookAt(core.x, core.y, core.z);
      if (k > 0.6) fx.shake(0.02);
      void dt;
    },
    end() { B.startPhase(1); state = 'play'; emit('bossStart'); },
  };
}
function escape() {
  if (state !== 'play' || run.mode === 'tt') return;
  state = 'victory'; P.alive = false;
  const s = S();
  const first = !s.bossDone;
  s.bossDone = true; s.wins++; s.goldGun = true; s.solved['3-B'] = true; persist();
  emit('escape');
  addScore(5000 + Math.max(0, run.lives) * 300 + s.crystals.length * 200);
  s.bestRun = Math.max(s.bestRun, run.score); persist();
  sfx.victory(); fx.burst(P.body.pos.x, P.body.pos.y, P.body.pos.z, 0xd9b8ff, 60, 6);
  input.showTouch(false); ui.show(false); releaseLock();
  const best = A.scores.best(GAME_ID);
  endRun(true);
  const rec = run.score >= best;
  endScreen.show(`<span class="k3-kicker">SISTEMA RESTAURADO</span><h1>¡LIBRE!</h1>
    <p>Desarmaste el Núcleo Fractal y cruzaste el portal de salida. El complejo vuelve a respirar.</p>
    <div class="pi-menu-prog">Puntos: <b>${run.score}</b>${rec ? ' · ¡NUEVO RÉCORD!' : ` · Récord: ${Math.max(best, run.score)}`}<br>Tiempo: ${fmtTime(run.time)} · Respaldos: ${run.lives} · Cristales: ${s.crystals.length}/${CRYSTALS.length} · Pistas: ${run.hintsTotal}</div>
    <p class="pi-small">${first ? 'Recompensa: tu pistola de portales ahora es <b>dorada</b>. ' : ''}La Contrarreloj queda abierta para todas las salas que resolviste.</p>
    <div class="k3-btnrow"><button class="k3-b" data-menu>🧪 Menú del laboratorio</button><button class="k3-b alt" data-tt>⏱ Contrarreloj</button></div>`);
}
function defeat() {
  state = 'defeat'; P.alive = false;
  input.showTouch(false); ui.show(false); releaseLock(); ui.fade(false);
  endRun(false);
  endScreen.show(`<span class="k3-kicker">PRUEBA FALLIDA</span><h1>DERROTA</h1>
    <p>Se acabaron los respaldos del sujeto de prueba. Las salas resueltas, el generador y los cristales siguen guardados.</p>
    <div class="pi-menu-prog">Puntos de esta partida: <b>${run.score}</b> · Tiempo: ${fmtTime(run.time)} · Sala: ${ROOM[S().room].name}</div>
    <div class="k3-btnrow"><button class="k3-b" data-retry>↻ Reintentar desde la sala</button><button class="k3-b alt" data-menu>🧪 Menú</button></div>`);
}
function finishTT() {
  const id = run.tt.room, r = ROOM[id], s = S();
  const t = Math.round((run.time - run.tt.t0) * 10) / 10, par = r.par * diff().parMul;
  const prev = s.best[id];
  const rec = !prev || t < prev;
  if (rec) { s.best[id] = t; persist(); }
  if (t <= par) emit('parRoom');
  if (!run.hints[id]) emit('noHintRoom');
  if ((run.shots[id] ?? 99) <= 2) emit('twoPortals');
  run.score = Math.round(Math.max(100, (par * 2 - t) * 20));
  state = 'ttresult'; P.alive = false;
  sfx.solve(); input.showTouch(false); ui.show(false); releaseLock();
  endRun(true);
  endScreen.show(`<span class="k3-kicker">⏱ CONTRARRELOJ · ${r.name.toUpperCase()}</span><h1>${fmtTime(t, true)}</h1>
    <p>${t <= par ? '¡Bajo el tiempo objetivo!' : 'Tiempo objetivo: ' + fmtTime(par, true)}${rec ? ' · ¡Nuevo mejor tiempo!' : ` · Mejor: ${fmtTime(prev, true)}`}</p>
    <div class="k3-btnrow"><button class="k3-b" data-ttagain>↻ Otra vez</button><button class="k3-b alt" data-tt>Elegir sala</button><button class="k3-b alt" data-menu>🧪 Menú</button></div>`);
}
function fmtTime(t, dec = false) { if (!isFinite(t)) return '—'; const m = Math.floor(t / 60), s = t % 60; return `${m}:${(dec ? s.toFixed(1) : String(Math.floor(s))).padStart(dec ? 4 : 2, '0')}`; }

/* ======================= portales: disparo ======================= */
const _f = { x: 0, y: 0, z: 0 }, _e = { x: 0, y: 0, z: 0 };
const _muzzle = new THREE.Vector3();
function eye(out) { out.x = P.body.pos.x; out.y = P.body.pos.y + PHYS.eye; out.z = P.body.pos.z; return out; }
function fire(which, dir) {
  if (P.shotCd > 0 || state !== 'play' || !P.alive) return null;
  P.shotCd = 0.22;
  eye(_e);
  const d = dir || PM.lookDir(P.yaw, P.pitch, _f);
  const res = portals.shoot(which, _e, d, level.lists());
  P.lastShot = which;
  gun.group.updateMatrixWorld(true); _muzzle.set(0, 0, -0.3).applyMatrix4(gun.group.matrixWorld);
  fx.tracer(which, _muzzle.x, _muzzle.y, _muzzle.z, res.x, res.y, res.z);
  if (which === 'A') sfx.shootA(); else sfx.shootB();
  gun.core.material.color.setHex(which === 'A' ? 0x35b6ff : 0xff8a24);
  if (!reduced()) gun.group.position.z = -0.27;
  const col = which === 'A' ? 0x35b6ff : 0xff8a24;
  if (res.ok) {
    sfx.open(which); fx.burst(res.x, res.y, res.z, col, 16, 2.6, 0, 0.5);
    P.placedOrder = P.placedOrder.filter(w => w !== which); P.placedOrder.push(which);
    if (run.roomId) run.shots[run.roomId] = (run.shots[run.roomId] || 0) + 1;
    emit('portal');
    if (portals.linked()) tip('through');
  } else if (res.err !== 'none') {
    sfx.fizzle(); fx.burst(res.x, res.y, res.z, 0xaaaaaa, 8, 1.6, 3, 0.4);
    const msg = { surface: 'Esa superficie no acepta portales: sólo los paneles blancos', small: 'No entra un portal ahí', blocked: 'Algo tapa ese lugar', glass: 'El vidrio no deja pasar el disparo', overlap: 'Se superpone con el otro portal' }[res.err];
    if (msg) failMsg(msg);
  }
  return res;
}
let failT = 0;
function failMsg(m) { if (game.simTime - failT > 2.5) { failT = game.simTime; toast(m, 1400); } }
function applyGunColor() {
  const gold = S().goldGun;
  const c = gun.body.geometry.getAttribute('color');
  void c;
  gun.body.material = gold ? goldMat : mats.vc;
}
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 0.8, roughness: 0.3, vertexColors: true });

/* ======================= cubos en la mano ======================= */
function grab(c) {
  if (P.held || !c.alive) return;
  P.held = c; c.held = true; c.through = null;
  sfx.grab(); emit('grab');
}
function dropHeld(toss = true) {
  const c = P.held; if (!c) return;
  P.held = null; c.held = false; c.through = null;
  if (toss) {
    const b = c.body;
    PM.lookDir(P.yaw, P.pitch, _f);
    b.vel.x = P.body.vel.x + _f.x * 1.5; b.vel.y = Math.max(P.body.vel.y, 0) + _f.y * 1.5; b.vel.z = P.body.vel.z + _f.z * 1.5;
    // el prisma queda apuntando hacia donde mirás
    if (c.kind === 'prism') level.snapFacing(c, { x: -Math.sin(P.yaw), y: 0, z: -Math.cos(P.yaw) });
    sfx.drop();
  }
  emit('drop');
}
const _t = { x: 0, y: 0, z: 0 }, _t2 = { x: 0, y: 0, z: 0 };
function updateHeld(dt) {
  const c = P.held; if (!c) return;
  if (!c.alive || c.dissolveT > 0) { P.held = null; c.held = false; return; }
  eye(_e); PM.lookDir(P.yaw, P.pitch, _f);
  // objetivo delante de la mira, sin atravesar paredes
  let dist = 1.55;
  const h = raycast(_e.x, _e.y, _e.z, _f.x, _f.y, _f.z, dist + 0.4, level.lists(), x => x === c.box || x.mat === 'trigger' || x.mat === 'grate' || x.cube || x.mat === 'barrier');
  if (h && !(portals.linked())) dist = Math.max(0.6, h.t - 0.45);
  else if (h) {
    // si el rayo choca contra la pared de un portal, el objetivo puede quedar «dentro» del túnel
    const host = h.box; if (host !== portals.A.host && host !== portals.B.host) dist = Math.max(0.6, h.t - 0.45);
  }
  _t.x = _e.x + _f.x * dist; _t.y = _e.y + _f.y * dist - 0.15; _t.z = _e.z + _f.z * dist;
  if (c.through) { PM.xfPoint(c.through.from.F, c.through.to.F, _t, _t2); _t.x = _t2.x; _t.y = _t2.y; _t.z = _t2.z; }
  const b = c.body;
  const dx = _t.x - b.pos.x, dy = _t.y - b.pos.y, dz = _t.z - b.pos.z, d = Math.hypot(dx, dy, dz);
  if (d > 3.2) { dropHeld(false); return; }
  const k = 14, mx = 18;
  b.vel.x = clamp(dx * k, -mx, mx); b.vel.y = clamp(dy * k, -mx, mx); b.vel.z = clamp(dz * k, -mx, mx);
  level.stepBodyPortals(b, dt, (src, dst) => {
    c.through = c.through ? null : { from: src, to: dst };
    const fd = PM.xfDir(src.F, dst.F, c.facing, { x: 0, y: 0, z: 0 }); level.snapFacing(c, fd);
  }, level.playerBox);
  if (c.kind === 'prism' && !c.through) level.snapFacing(c, { x: -Math.sin(P.yaw), y: 0, z: -Math.cos(P.yaw) });
  level.syncCube(c);
  if (level.inFizzler(b)) level.cubeDissolve(c, 'fizz');
}

/* ======================= actualización ======================= */
function update(dt) {
  if (state === 'menu' || state === 'victory' || state === 'defeat' || state === 'ttresult') {
    menuCamera(dt);
    if (level) { const pidle = Pidle; level.update(dt, pidle); }
    portals.update(dt);
    fx.update(dt, camera.position.x, camera.position.y, camera.position.z);
    if (level) fx.setBeams(level.segs, level.segCount);
    input.takeLook(); input.endStep();
    return;
  }
  P.inv -= dt; P.shotCd -= dt; P.useCd -= dt;
  if (state === 'play') { run.time += dt; control(dt); }
  else if (state === 'dead') { run.deadT -= dt; if (run.deadT <= 0) respawn(); }
  else if (state === 'transition') {
    run.transT -= dt;
    if (run.transT <= 0) {
      const n = run.transTo;
      S().scen = n; S().room = ROOMS.find(r => r.scen === n).id; persist();
      loadScenario(n, 'start'); state = 'play'; ui.fade(false);
      ui.title(SCEN_NAMES[n], `ESCENARIO ${['', 'I', 'II', 'III'][n]}`, 2600);
      emit('scenario', n);
    }
  } else if (state === 'cutscene' && cut) {
    if (input.hit('Space', 'Enter', binds().use, binds().jump, 'F13', 'btn:jump', 'btn:use') || cutSkip) { cut.t = cut.dur; cutSkip = false; }
    cut.t += dt; cut.step(dt);
    if (cut.t >= cut.dur) { const c = cut; cut = null; c.end(); }
  }
  gun.group.visible = state === 'play' || state === 'dead';
  if (level) level.update(dt, P);
  portals.update(dt);
  fx.update(dt, P.body.pos.x, P.body.pos.y, P.body.pos.z);
  if (level) fx.setBeams(level.segs, level.segCount);
  if (state !== 'cutscene') updateCamera(dt); else input.takeLook();
  hudTick(dt);
  input.endStep();
}
const Pidle = { body: mkBody(0.3, 0.85, 0.3), alive: false, vulnerable: false };
Pidle.body.pos.y = -999;

function moveAxis() {
  const kx = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0), ky = (input.down('KeyS') ? 1 : 0) - (input.down('KeyW') ? 1 : 0);
  const arrows = input.any('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight');
  if (arrows) { const l = Math.hypot(kx, ky) || 1; return { x: kx / (l > 1 ? l : 1), y: ky / (l > 1 ? l : 1) }; }
  return input.axis();
}
function control(dt) {
  const b = P.body, bd = binds(), o = S().opts;
  // mirar con teclado / gamepad
  const tr = 2.4 * o.sens;
  if (input.down('ArrowLeft')) P.yaw += tr * dt;
  if (input.down('ArrowRight')) P.yaw -= tr * dt;
  if (input.down('ArrowUp')) P.pitch += tr * 0.7 * dt * (o.invert ? -1 : 1);
  if (input.down('ArrowDown')) P.pitch -= tr * 0.7 * dt * (o.invert ? -1 : 1);
  const lk = input.takeLook(); void lk;
  P.yaw += lookAcc.x; P.pitch += lookAcc.y; lookAcc.x = lookAcc.y = 0;
  P.pitch = clamp(P.pitch, -1.45, 1.45);
  // movimiento
  const a = moveAxis();
  const fx0 = -Math.sin(P.yaw), fz0 = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let mx = rx * a.x + fx0 * -a.y, mz = rz * a.x + fz0 * -a.y;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const room = currentRoom(), g = room ? room.gravity : 1;
  if (b.grounded) {
    const k = Math.min(1, dt * 12);
    b.vel.x += (mx * PHYS.speed - b.vel.x) * k; b.vel.z += (mz * PHYS.speed - b.vel.z) * k;
  } else if (ml > 0.1) {
    // control aéreo que nunca frena un lanzamiento
    const sp0 = Math.hypot(b.vel.x, b.vel.z);
    b.vel.x += mx * PHYS.airAccel * dt; b.vel.z += mz * PHYS.airAccel * dt;
    const sp1 = Math.hypot(b.vel.x, b.vel.z), cap = Math.max(sp0, PHYS.speed);
    if (sp1 > cap) { b.vel.x *= cap / sp1; b.vel.z *= cap / sp1; }
  }
  if (ml > 0.15 && b.grounded) moved += ml * PHYS.speed * dt;
  // salto con búfer y coyote
  if (input.hit(bd.jump, 'F13', 'btn:jump')) P.jumpBuf = 0.13; else P.jumpBuf -= dt;
  P.coyote = b.grounded ? 0.1 : P.coyote - dt;
  if (P.jumpBuf > 0 && P.coyote > 0) { b.vel.y = PHYS.jump; P.coyote = 0; P.jumpBuf = 0; sfx.jump(); emit('jump'); }
  const inLift = level.applyFields(b, dt, g);
  if (b.grounded && b.ground && b.ground.moving) { b.pos.x += b.ground.dx; b.pos.y += b.ground.dy; b.pos.z += b.ground.dz; }
  if (b.grounded && b.ground && b.ground.mat === 'door') { /* nada */ }
  const vy = b.vel.y, wasG = b.grounded;
  const held = P.held;
  if (held) held.box.on = false;
  const tp = level.stepBodyPortals(b, dt, (src, dst) => {
    const r = portals.crossLook(src, dst, P.yaw, P.pitch); P.yaw = r.yaw; P.pitch = clamp(r.pitch, -1.45, 1.45);
    sfx.teleport(); emit('teleport');
    const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    if (sp > 9) emit('fling', Math.round(sp));
    fx.spray(b.pos.x, b.pos.y, b.pos.z, dst.F.n.x, dst.F.n.y, dst.F.n.z, dst.id === 'A' ? 0x7fd2ff : 0xffb066, 10, 3);
    if (held) held.through = held.through ? null : { from: dst, to: src };
  });
  if (held) held.box.on = held.alive;
  void tp; void inLift;
  if (b.grounded && !wasG && vy < -7) { sfx.land(); if (vy < -12) fx.shake(0.12); }
  if (b.grounded && ml > 0.3) { P.stepT -= dt; if (P.stepT <= 0) { sfx.step(); P.stepT = 0.36; } P.bob += dt * 9; }
  // sala actual
  const r = level.roomAt(b.pos.x, b.pos.y, b.pos.z);
  if (r && r.id !== run.roomId) roomStart(r.id);
  if (r && !S().solved[r.id]) { run.idleT += dt; if (run.idleT > 75) tip('hint'); }
  // peligros
  const hz = level.hazardAt(b);
  if (hz) { die(hz); return; }
  if (level.inFizzler(b) && (portals.A.placed || portals.B.placed)) clearPortals('fizz');
  // portales
  if (input.hit(bd.portalA, 'F14', 'btn:a') || mouseFire === 'A') fire('A');
  if (input.hit(bd.portalB, 'F15', 'btn:b') || mouseFire === 'B') fire('B');
  if (tapFire) { fire(tapFire.w, tapFire.d); tapFire = null; }
  mouseFire = '';
  // usar / agarrar
  updateHeld(dt);
  eye(_e); PM.lookDir(P.yaw, P.pitch, _f);
  cur = P.held ? null : level.interactAt(_e.x, _e.y, _e.z, _f.x, _f.y, _f.z, P);
  if (input.hit(bd.use, 'F16', 'btn:use') && P.useCd <= 0) {
    P.useCd = 0.2;
    if (P.held) dropHeld(true);
    else if (cur) {
      if (cur.kind === 'switch') cur.ref.use();
      else if (cur.kind === 'cube') grab(cur.ref);
      else if (cur.kind === 'turret') level.knockTurret(cur.ref, 'push');
      emit('interact');
    } else sfx.denied();
  }
  if (input.hit(bd.hint, 'F17')) askHint();
  if (input.hit(bd.reset)) resetRoomByPlayer();
  // pistas contextuales del tutorial
  const near = (list, d, fn) => { for (const x of list) { if (fn(x) < d) return true; } return false; };
  if (near(level.cubes, 3, c => c.alive ? Math.hypot(c.body.pos.x - b.pos.x, c.body.pos.z - b.pos.z) : 99)) tip('cube');
  if (near(level.buttons, 3.2, x => Math.hypot(x.x - b.pos.x, x.z - b.pos.z) + Math.abs(x.y - b.pos.y) * 0.5)) tip('button');
  if (near(level.switches, 3, x => Math.hypot(x.x - b.pos.x, x.z - b.pos.z) + Math.abs(x.y - b.pos.y) * 0.5)) tip('switch');
  if (near(level.emitters, 7, x => Math.hypot(x.x - b.pos.x, x.z - b.pos.z))) tip('laser');
  if (near(level.lifts, 4, x => Math.hypot((x.box.x0 + x.box.x1) / 2 - b.pos.x, (x.box.z0 + x.box.z1) / 2 - b.pos.z))) tip('lift');
  // regeneración
  if (P.regenT > 0) P.regenT -= dt; else if (P.hp < P.maxHp) { P.hp++; P.regenT = 2; }
}

/* ======================= mirada (mouse, táctil) ======================= */
const lookAcc = { x: 0, y: 0 };
let mouseFire = '', /** @type {any} */ tapFire = null, lockFailed = false;
const canvas = renderer.domElement;
const locked = () => document.pointerLockElement === canvas;
function releaseLock() { if (locked()) document.exitPointerLock(); }
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
document.addEventListener('pointerlockchange', () => {
  // si se suelta el mouse en plena partida (Esc del navegador), se pausa
  if (!locked() && state === 'play' && !A.isPaused()) A.pause();
});
addEventListener('mousemove', e => {
  if (!locked() || state !== 'play') return;
  const o = S().opts, k = 0.0022 * o.sens;
  lookAcc.x -= e.movementX * k; lookAcc.y -= e.movementY * k * (o.invert ? -1 : 1);
});
let drag = /** @type {any} */ (null);
game.root.addEventListener('contextmenu', e => e.preventDefault());
game.root.addEventListener('pointerdown', e => {
  if (state === 'cutscene') { cutSkip = true; return; }
  if (state !== 'play') return;
  if (e.pointerType === 'mouse') {
    if (locked()) { mouseFire = e.button === 2 ? 'B' : e.button === 0 ? 'A' : ''; return; }
    if (!lockFailed && !QS.has('nolock')) {
      try { const p = /** @type {any} */ (canvas.requestPointerLock()); if (p && p.catch) p.catch(() => { lockFailed = true; }); } catch (err) { lockFailed = true; }
    }
    // sin captura: arrastrar mira, clic corto dispara
  }
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), type: e.pointerType, btn: e.button, moved: 0 };
});
game.root.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id || state !== 'play') return;
  const o = S().opts, k = (drag.type === 'mouse' ? 0.0045 : 0.0055) * o.sens;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  lookAcc.x -= dx * k; lookAcc.y -= dy * k * (o.invert ? -1 : 1);
});
const endDrag = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const short = performance.now() - drag.t < 280 && drag.moved < 14;
  if (short && state === 'play' && !locked()) {
    if (drag.type === 'mouse') { if (lockFailed || QS.has('nolock')) mouseFire = drag.btn === 2 ? 'B' : 'A'; }
    else {
      // toque: disparar al punto tocado el portal que falta (o el más viejo)
      const w = !portals.A.placed ? 'A' : !portals.B.placed ? 'B' : (P.placedOrder[0] || 'A');
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector3(((drag.sx - r.left) / r.width) * 2 - 1, -((drag.sy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
      tapFire = { w, d: { x: ndc.x, y: ndc.y, z: ndc.z } };
    }
  }
  drag = null;
};
game.root.addEventListener('pointerup', endDrag);
game.root.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) drag = null; });

/* ======================= cámara ======================= */
function updateCamera(dt) {
  const b = P.body, o = S().opts;
  const bob = reduced() ? 0 : Math.sin(P.bob) * 0.035 * (b.grounded ? Math.min(1, Math.hypot(b.vel.x, b.vel.z) / PHYS.speed) : 0);
  const sh = fx.shakeAmt * 0.25;
  camera.position.set(b.pos.x + (Math.random() - 0.5) * sh, b.pos.y + PHYS.eye + bob + (Math.random() - 0.5) * sh, b.pos.z);
  camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  if (camera.fov !== o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld(true);
  // retroceso del arma
  gun.group.position.z += (-0.32 - gun.group.position.z) * Math.min(1, dt * 10);
  gun.group.position.y = -0.16 + bob * 0.5;
  // el cuerpo (visible sólo a través de los portales)
  bodyMesh.position.set(b.pos.x, b.pos.y, b.pos.z); bodyMesh.rotation.y = P.yaw;
  // sol que acompaña
  const e = level ? level.env.sunDir : [6, 18, 8];
  sun.target.position.set(b.pos.x, b.pos.y, b.pos.z); sun.position.set(b.pos.x + e[0], b.pos.y + e[1], b.pos.z + e[2]);
}
function menuCamera(dt) {
  cam.menuA += dt * (reduced() ? 0 : 0.12);
  const r = level ? level.rooms[0] : null;
  const bb = r ? r.bounds : { x0: -6, x1: 6, y0: 0, y1: 8, z0: -14, z1: 0 };
  const cx = (bb.x0 + bb.x1) / 2, cz = (bb.z0 + bb.z1) / 2, cy = bb.y0 + (bb.y1 - bb.y0) * 0.45;
  camera.position.set(cx + Math.sin(cam.menuA) * 3.2, cy + 1.2, cz + (bb.z1 - bb.z0) * 0.42);
  camera.lookAt(cx + Math.sin(cam.menuA * 0.7) * 2, cy, cz - 2);
  camera.updateMatrixWorld(true);
  gun.group.visible = false;
  sun.target.position.set(cx, 0, cz); sun.position.set(cx + 6, 18, cz + 8);
}

/* ======================= render (vistas de portal) ======================= */
let rtPasses = 0;
function hideForRT(on) { gun.group.visible = !on && (state === 'play' || state === 'dead'); bodyMesh.visible = on && P.alive && state !== 'menu'; }
function render() {
  renderer.info.reset();
  renderer.shadowMap.needsUpdate = true;
  rtPasses = portals.renderViews(hideForRT);
  hideForRT(false);
}

/* ======================= pistas ======================= */
function askHint() {
  const r = currentRoom();
  if (!r || state !== 'play') { sfx.denied(); return; }
  const n = Math.min(3, (run.hints[r.id] || 0) + 1);
  run.hints[r.id] = n; run.hintsTotal++;
  ui.hint(r.hints[n - 1], n);
  r.ghostMeshes.forEach(g => { g.visible = n >= 3; });
  sfx.hint(); emit('hintUsed');
}

/* ======================= HUD ======================= */
function objective() {
  if (!level) return '';
  const id = run.roomId, s = S();
  if (run.mode === 'tt') return `Contrarreloj: resolvé «${ROOM[run.tt.room].name}» lo más rápido posible.`;
  const B = level.boss;
  if (id === '3-B' && B) {
    if (s.bossDone) return 'El Núcleo está desarmado. El portal de salida sigue abierto.';
    if (B.phase === 0) return 'Avanzá hacia el Núcleo Fractal.';
    return '';
  }
  if (id && s.solved[id]) return 'Sala resuelta: seguí por la puerta abierta.';
  const T = { '1-1': 'Llegá a la puerta sobre el borde alto.', '1-2': 'Poné peso sobre el botón rojo para abrir la puerta.', '1-3': 'Cruzá el ácido hasta la plataforma de salida.',
    '2-1': 'Encendé el campo de gravedad y llevá el cubo al botón de la galería.', '2-2': 'Encendé los dos paneles del generador y bajá la palanca.', '3-1': 'Cruzá el abismo usando el panel móvil.' };
  return /** @type {any} */ (T)[id] || (level.n === 1 ? 'Entrá al Laboratorio Azul.' : level.n === 2 ? 'Entrá a las Salas de Gravedad.' : 'Entrá al Núcleo Prismático.');
}
let hudAcc = 0;
function hudTick(dt) {
  hudAcc += dt;
  if (tipId) { tipT -= dt; if (tipT <= 0 || (tipId === 'move' && moved > 6)) closeTip(); }
  if (hudAcc < 0.1) return;
  hudAcc = 0;
  const s = S();
  ui.status({ hp: Math.max(0, P.hp), maxHp: P.maxHp, lives: run.lives === Infinity ? '∞' : Math.max(0, run.lives), crystals: s.crystals.length, total: CRYSTALS.length, score: run.score });
  const id = run.roomId || (level ? (level.rooms[0] || {}).id : '');
  const r = ROOM[id];
  if (r) {
    const t0 = run.mode === 'tt' ? run.tt.t0 : run.roomT[id];
    const el = t0 === undefined ? 0 : run.time - t0, par = r.par * diff().parMul;
    const solved = run.mode !== 'tt' && s.solved[id];
    ui.room(`${id} · ${r.name}`, solved ? `✔ resuelta${s.best[id] ? ' · mejor ' + fmtTime(s.best[id], true) : ''}` : `⏱ ${fmtTime(el)} / objetivo ${fmtTime(par)}${run.hints[id] ? ' · 💡' + run.hints[id] : ''}`, !solved && el > par);
  }
  ui.cross(portals.A.placed, portals.B.placed, !!cur);
  const useKey = input.isTouch ? '' : keyLabel(binds().use);
  ui.prompt(state === 'play' ? (P.held ? useKey : cur ? useKey : '') : '', state === 'play' ? (P.held ? 'Soltar cubo' : cur ? cur.label : null) : null);
  ui.boss(level && level.boss && run.roomId === '3-B' ? level.boss.ui() : null);
  ui.objective(objective());
  if (useBtn) { const on = !!cur || !!P.held; useBtn.style.borderColor = on ? ACCENT : ''; useBtn.style.background = on ? 'rgba(155,123,255,.45)' : ''; }
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'pi-menu' });
const endScreen = screen('', { accent: ACCENT, id: 'pi-end' }); endScreen.hide();
const helpScreen = screen('', { accent: ACCENT, id: 'pi-help' }); helpScreen.hide();
const optScreen = screen('', { accent: ACCENT, id: 'pi-opts' }); optScreen.hide();
const ttScreen = screen('', { accent: ACCENT, id: 'pi-tt' }); ttScreen.hide();
let newArmed = false;
function diffText() {
  const d = diff();
  return `Respaldos ${d.lives} · Vida ${d.hp} ♥ · Torretas apuntan en ${d.turretAim}s · Esferas escanean en ${d.sphereScan}s · Compuertas ×${d.doorMul} · Tiempo objetivo ×${d.parMul} · Pilares ${d.nodeTime}s de láser · Pulso del Núcleo cada ${d.pulseEvery}s`;
}
function showMenu() {
  state = 'menu'; ui.show(false); input.showTouch(false); closeTip(); cut = null; ui.hint(null); ui.fade(false);
  endScreen.hide(); helpScreen.hide(); optScreen.hide(); ttScreen.hide();
  const s = S(), cont = s.started;
  const solvedN = ROOMS.filter(r => s.solved[r.id]).length;
  newArmed = false;
  menu.show(`<span class="k3-kicker">PUZLES DE PORTALES 3D</span><h1>PORTALES IMPOSIBLES</h1>
    <p>Dos portales, una pistola y un complejo de pruebas que no quiere que salgas. Lo que entra por uno sale por el otro… con la misma velocidad.</p>
    ${cont ? `<div class="pi-menu-prog">${SCEN_NAMES[s.scen]} · Sala ${ROOM[s.room].name} · Resueltas ${solvedN}/${ROOMS.length} · 💎 ${s.crystals.length}/${CRYSTALS.length}${s.wins ? ' · 🏆 ' + s.wins : ''}</div>` : ''}
    <div class="k3-btnrow"><button class="k3-b" data-go>${cont ? '▶ Continuar' : '▶ Empezar la prueba'}</button>${cont ? '<button class="k3-b alt" data-new>Nueva partida</button>' : ''}</div>
    <div data-diff></div><div class="pi-dtab" data-dtab>${diffText()}</div>
    <div class="k3-btnrow"><button class="k3-b alt" data-tt ${solvedN ? '' : 'disabled title="Resolvé una sala primero"'}>⏱ Contrarreloj</button><button class="k3-b alt" data-opts>⚙ Controles</button><button class="k3-b alt" data-help>📖 Cómo jugar</button></div>
    <div class="pi-credit">CREADO POR <img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  const holder = /** @type {HTMLElement} */ (menu.el.querySelector('[data-diff]'));
  M.difficultyPicker(holder, { onChange: () => { const t = menu.el.querySelector('[data-dtab]'); if (t) t.textContent = diffText(); } });
  const want = cont ? s.scen : 1;
  if (!level || level.n !== want) loadScenario(want, 'start');
  gun.group.visible = false;
  A.refresh();
}
menu.on('[data-go]', () => { sfx.click(); startRun(false); });
menu.on('[data-new]', () => {
  const b = /** @type {HTMLElement} */ (menu.el.querySelector('[data-new]'));
  if (!newArmed) { newArmed = true; b.textContent = '¿Borrar el progreso? Tocá de nuevo'; return; }
  sfx.click(); startRun(true);
});
menu.on('[data-help]', () => openHelp(false));
menu.on('[data-opts]', () => openOptions(false));
menu.on('[data-tt]', () => openTT());
endScreen.on('[data-menu]', () => showMenu());
endScreen.on('[data-retry]', () => startRun(false));
endScreen.on('[data-tt]', () => openTT());
endScreen.on('[data-ttagain]', () => { if (run.tt) startTT(run.tt.room); });

function openTT() {
  const s = S();
  menu.hide(); endScreen.hide();
  const rows = ROOMS.filter(r => r.id !== '3-B').map(r => {
    const ok = s.solved[r.id], best = s.best[r.id], par = r.par * diff().parMul;
    return `<button class="k3-b alt" data-room="${r.id}" ${ok ? '' : 'disabled'}><span>${r.id} · ${r.name}</span><small>${ok ? `mejor ${best ? fmtTime(best, true) : '—'} · objetivo ${fmtTime(par)}` : '🔒 sin resolver'}</small></button>`;
  }).join('');
  ttScreen.show(`<span class="k3-kicker">MODO</span><h1 style="font-size:32px">CONTRARRELOJ</h1>
    <p>Elegí una sala que ya resolviste y bajá tu tiempo. Las pistas y los portales cuentan para las misiones.</p>
    <div class="pi-tt">${rows}</div>
    <div class="k3-btnrow"><button class="k3-b" data-back>Volver</button></div>`);
}
ttScreen.el.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-room]'); if (b && !(/** @type {any} */ (b)).disabled) { sfx.click(); startTT(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.room)); } });
ttScreen.on('[data-back]', () => { ttScreen.hide(); showMenu(); });

let fromPause = false;
function openHelp(pause) {
  fromPause = pause;
  if (!pause) menu.hide();
  helpScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:30px">EL COMPLEJO</h1>
    <ul class="k3-list">
      <li>🕹 <b>Moverte:</b> ${input.isTouch ? 'joystick izquierdo' : 'WASD'} · <b>Mirar:</b> ${input.isTouch ? 'arrastrar el dedo' : 'mouse (clic para capturarlo), flechas o arrastrar'}</li>
      <li>🔵🟠 <b>Portales:</b> ${input.isTouch ? 'botones AZUL y NARANJA, o tocá un punto de la pantalla' : `clic izq./${K('portalA')} azul · clic der./${K('portalB')} naranja`}. Sólo en <b>paneles blancos</b>; el metal, el vidrio y lo que esté tapado no sirven.</li>
      <li>🧊 <b>Cubos:</b> ${K('use')} agarra y suelta. Aprietan botones, tumban torretas y distraen esferas. El <b>prisma</b> desvía el láser hacia donde apunta.</li>
      <li>🔴 <b>Botones</b> de piso (peso) · 🔷 <b>pedestales</b> (${K('use')}) · ⏱ <b>compuertas temporizadas</b> · ⚡ <b>paneles de energía</b> (láser).</li>
      <li>🚀 <b>Lanzamiento:</b> la velocidad se conserva al cruzar. Caer de alto en un portal del piso te dispara lejos por el otro.</li>
      <li>🎯 <b>Torretas:</b> te apuntan con un puntero rojo antes de disparar. 👁 <b>Esferas supervisoras:</b> si te escanean, borran tus portales.</li>
      <li>💡 <b>Pistas</b> por etapas (${K('hint')}) y ↺ <b>reiniciar sala</b> (${K('reset')}): nunca quedás trabado. Caer o morir restablece la sala y gasta un respaldo 🧬.</li>
      <li>🎮 <b>Gamepad:</b> stick mover · LB/RB girar · LT/RT mirar abajo/arriba · A saltar · X azul · Y naranja · B usar · Select pista · Start pausa</li>
    </ul>
    <div class="k3-btnrow"><button class="k3-b" data-back>Volver</button><button class="k3-b alt" data-retut>Reactivar tutorial</button></div>`);
}
helpScreen.on('[data-back]', closeSub);
helpScreen.on('[data-retut]', () => { S().tutorial = { off: false, seen: {} }; persist(); toast('Tutorial reactivado', 1500); closeSub(); });
function closeSub() {
  helpScreen.hide(); optScreen.hide(); listening = '';
  if (fromPause && ACTIVE.has(state)) { A.pause(); return; }
  if (state === 'menu') showMenu();
}
let listening = '';
function openOptions(pause) {
  fromPause = pause;
  if (!pause) menu.hide();
  const o = S().opts;
  const row = id => `<div class="pi-bind"><span>${/** @type {any} */ (BIND_NAMES)[id]}</span><button type="button" data-bind="${id}" class="${listening === id ? 'wait' : ''}">${listening === id ? 'Apretá una tecla…' : keyLabel(o.binds[id])}</button></div>`;
  optScreen.show(`<span class="k3-kicker">OPCIONES</span><h1 style="font-size:28px">CONTROLES</h1>
    <div class="pi-opts">
      ${Object.keys(BIND_NAMES).map(row).join('')}
      <label>Sensibilidad <input type="range" min="0.4" max="2" step="0.1" value="${o.sens}" data-sens aria-label="Sensibilidad de la mirada"></label>
      <label>Campo de visión <input type="range" min="60" max="95" step="1" value="${o.fov}" data-fov aria-label="Campo de visión"></label>
      <label>Invertir mirada vertical <input type="checkbox" data-invert ${o.invert ? 'checked' : ''}></label>
      <label>Movimiento (sacudidas y destellos) <select data-motion><option value="auto"${o.motion === 'auto' ? ' selected' : ''}>Según el sistema</option><option value="reduce"${o.motion === 'reduce' ? ' selected' : ''}>Reducido</option><option value="full"${o.motion === 'full' ? ' selected' : ''}>Completo</option></select></label>
      <div class="pi-small">Mover: WASD · Mirar: mouse, flechas o arrastrar · Gamepad: X azul, Y naranja, A saltar, B usar, LB/RB girar, LT/RT mirar, Select pista, Start pausa. Sonido y calidad gráfica: botón ⚙/⏸ de la barra.</div>
    </div>
    <div class="k3-btnrow"><button class="k3-b" data-back>Listo</button><button class="k3-b alt" data-defaults>Valores por defecto</button></div>`);
}
optScreen.on('[data-back]', closeSub);
optScreen.on('[data-defaults]', () => { S().opts = structuredClone(SAVE_DEFAULTS.opts); persist(); openOptions(fromPause); });
optScreen.el.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-bind]'); if (b) { listening = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.bind); openOptions(fromPause); } });
optScreen.el.addEventListener('input', e => {
  const t = /** @type {HTMLInputElement} */ (e.target), o = S().opts;
  if (t.matches('[data-sens]')) o.sens = +t.value;
  if (t.matches('[data-fov]')) o.fov = +t.value;
  if (t.matches('[data-invert]')) o.invert = t.checked;
  if (t.matches('[data-motion]')) o.motion = /** @type {any} */ (t.value);
  persist();
});
optScreen.el.addEventListener('keydown', e => {
  if (!listening) return;
  e.preventDefault();
  const reserved = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyP', 'Escape'];
  if (!reserved.includes(e.code)) {
    const o = S().opts; for (const k in o.binds) if (o.binds[k] === e.code) o.binds[k] = o.binds[listening];
    o.binds[listening] = e.code; persist();
  }
  listening = ''; openOptions(fromPause);
}, true);
// gamepad / teclado en menús: A pulsa el botón enfocado; arriba/abajo mueve el foco
addEventListener('keydown', e => {
  if (ACTIVE.has(state)) return;
  const scr = [menu, endScreen, helpScreen, optScreen, ttScreen].find(x => x.visible);
  if (!scr) return;
  if (e.code === 'F13') { const el = /** @type {HTMLElement|null} */ (document.activeElement); if (el && scr.el.contains(el) && (el.tagName === 'BUTTON')) el.click(); return; }
  if (['KeyS', 'KeyW', 'KeyD', 'KeyA'].includes(e.code)) {
    const btns = /** @type {HTMLElement[]} */ ([...scr.el.querySelectorAll('button:not([disabled])')]);
    if (!btns.length) return;
    const i = btns.indexOf(/** @type {any} */ (document.activeElement));
    const nx = btns[(i + (e.code === 'KeyS' || e.code === 'KeyD' ? 1 : -1) + btns.length) % btns.length];
    nx.focus();
  }
});

/* ======================= gancho de pruebas ======================= */
const r3 = v => Math.round(v * 1000) / 1000;
const hook = {
  get state() { return state; },
  get scene() { return level ? level.name : ''; },
  get scen() { return level ? level.n : 0; },
  get room() { return run.roomId; },
  get mode() { return run.mode; },
  get missions() { return M.state(); },
  get player() { const b = P.body; return { x: r3(b.pos.x), y: r3(b.pos.y), z: r3(b.pos.z), vx: r3(b.vel.x), vy: r3(b.vel.y), vz: r3(b.vel.z), yaw: r3(P.yaw), pitch: r3(P.pitch), grounded: b.grounded, alive: P.alive }; },
  get hp() { return P.hp; }, get maxHp() { return P.maxHp; }, get lives() { return run.lives; },
  get score() { return run.score; }, get runTime() { return run.time; }, get simTime() { return game.simTime; },
  get paused() { return game.paused; },
  get portals() { return portals.info(); },
  get held() { return P.held ? P.held.id : null; },
  get tip() { return tipId; }, get prompt() { return cur ? cur.label : ''; },
  get hints() { return { ...run.hints }; },
  get tt() { return run.tt ? { ...run.tt } : null; },
  get counts() { return level ? { ...level.counts(), particles: fx.particles, rtPasses } : {}; },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...game.perf, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames: game.frames, rtPasses }; },
  get quality() { const q = QUAL[game.quality]; return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, portalRT: portals.rtScale, rtHalfFloat: portals.rtHalf, particles: fx.dustCount, lights: level ? level.lights.filter(l => l.visible).length : 0, fogFar: /** @type {any} */ (scene.fog).far, far: camera.far, cap: q.particles }; },
  get difficulty() { return { name: diffName(), ...diff() }; },
  get boss() { const B = level && level.boss; return B ? { phase: B.phase, sub: B.sub, hits: B.hits, nodes: B.nodes.map(n => ({ id: n.id, broken: n.broken, total: r3(n.r.total) })), acidY: r3(B.acidY), locked: B.locked, aligned: B.aligned, pulseT: r3(B.pulseT) } : null; },
  get puzzle() {
    if (!level) return {};
    const o = /** @type {any} */ ({ buttons: {}, doors: {}, receptors: {}, switches: {}, lifts: {}, turrets: {}, spheres: {}, cubes: {}, crystals: {} });
    for (const b of level.buttons) o.buttons[b.id] = b.active;
    for (const d of level.doors) o.doors[d.id] = { open: r3(d.open), timer: r3(Math.max(0, d.timer)), forced: d.forced };
    for (const r of level.receptors) o.receptors[r.id] = r.active;
    for (const s of level.switches) o.switches[s.id] = { active: s.active, enabled: !!s.enabled() };
    for (const f of level.lifts) o.lifts[f.id] = f.active;
    for (const t of level.turrets) o.turrets[t.id] = { down: t.down, alert: r3(t.alert), state: t.state, falling: t.falling };
    for (const s of level.spheres) o.spheres[s.id] = { state: s.state, scan: r3(s.scan), x: r3(s.pos.x), z: r3(s.pos.z), gx: r3(s.gx), gz: r3(s.gz), y: r3(s.pos.y) };
    for (const c of level.cubes) o.cubes[c.id] = { alive: c.alive, held: c.held, x: r3(c.body.pos.x), y: r3(c.body.pos.y), z: r3(c.body.pos.z), facing: [c.facing.x, c.facing.z] };
    for (const c of level.crystals) o.crystals[c.id] = c.taken;
    o.generator = genOn();
    return o;
  },
  get save() { return structuredClone(S()); },
  /** Matemática de teletransporte (pura) para pruebas unitarias desde page.evaluate. */
  math: Object.freeze({ makeFrame: PM.makeFrame, xfPoint: PM.xfPoint, xfDir: PM.xfDir, xfMatrix: PM.xfMatrix, teleport: PM.teleport, lookDir: PM.lookDir, dirToYawPitch: PM.dirToYawPitch, toLocal: PM.toLocal }),
};
if (DEBUG) {
  const findRoomSpawn = id => level_hasStart(id) ? id : 'start';
  /** @type {any} */ (hook).debug = {
    goto(scen, roomId) {
      if (!ACTIVE.has(state)) startRun(false);
      const rid = roomId || ROOMS.find(r => r.scen === scen).id;
      if (!level || level.n !== scen) loadScenario(scen, findRoomSpawn(rid)); else placeAt(findRoomSpawn(rid));
      state = 'play'; P.alive = true; cut = null; ui.fade(false);
      if (level.room[rid]) { const sp = level.spawns[rid]; if (findRoomSpawn(rid) === 'start') void sp; }
    },
    simulate(sec) { game.simulate(sec); },
    teleport(x, y, z, yaw, pitch) { const b = P.body; b.pos.x = x; b.pos.y = y; b.pos.z = z; b.vel.x = b.vel.y = b.vel.z = 0; if (yaw !== undefined) P.yaw = yaw; if (pitch !== undefined) P.pitch = pitch; b.grounded = false; },
    look(yaw, pitch) { P.yaw = yaw; P.pitch = pitch; },
    setVel(x, y, z) { P.body.vel.x = x; P.body.vel.y = y; P.body.vel.z = z; },
    /** Dispara un portal desde un punto en una dirección (mismo código que la pistola). */
    shootFrom(which, x, y, z, dx, dy, dz) { const l = Math.hypot(dx, dy, dz); return portals.shoot(which, { x, y, z }, { x: dx / l, y: dy / l, z: dz / l }, level.lists()); },
    fireAt(which, yaw, pitch) { P.yaw = yaw; P.pitch = pitch; P.shotCd = 0; return fire(which); },
    clearPortals() { portals.clear(); },
    solveRoom(id) { solveRoom(id); },
    setHP(n) { P.hp = n; }, setLives(n) { run.lives = n; },
    hurt(n) { P.inv = 0; hurt(n, P.body.pos.x + 1, P.body.pos.z, 'debug'); },
    give(id) { const c = level.crystals.find(x => x.id === id); if (c && !c.taken) { c.taken = true; c.mesh.visible = false; c.halo.visible = false; ctx.collectCrystal(c); } },
    grab(id) { const c = level.cubes.find(x => x.id === id); if (c) grab(c); return !!c; },
    drop() { dropHeld(true); },
    cubeTo(id, x, y, z, fx0, fz0) { const c = level.cubes.find(q => q.id === id); if (!c) return false; if (c.held) dropHeld(false); level.cubeReset(c, true); c.body.pos.x = x; c.body.pos.y = y; c.body.pos.z = z; if (fx0 !== undefined) { c.facing.x = fx0; c.facing.z = fz0; } level.syncCube(c); return true; },
    use(id) { const s = level.switches.find(x => x.id === id); return s ? s.use() : false; },
    knock(id) { const t = level.turrets.find(x => x.id === id); if (t) level.knockTurret(t, 'debug'); },
    stun(id) { const s = level.spheres.find(x => x.id === id); if (s) level.stunSphere(s); },
    setGenerator(v) { S().generator = !!v; persist(); },
    spawnBoss() { this.goto(3, '3-B'); this.teleport(6.4, 0.9, -32, 0, 0); game.simulate(0.1); },
    skipCut() { if (cut) cut.t = cut.dur; },
    bossPhase(n) { const B = level.boss; if (B.phase === 0) { B.locked = true; } cut = null; state = 'play'; B.startPhase(n); },
    breakNodes() { for (const n of level.boss.nodes) level.boss.breakNode(n); },
    bossHit() { level.boss.hitCore(); },
    escape() { escape(); },
    resetRoom() { resetRoomByPlayer(); },
    hint() { askHint(); },
    tip(id) { tip(id); },
    beams() { return Array.from(level.segs.slice(0, level.segCount * 6)).map(r3); },
  };
}
W['__' + GAME_ID] = Object.freeze(hook);

/* ======================= arranque ======================= */
showMenu();
applyQuality();
game.start();
void depenetrate;
