// @ts-check
/* Carrera Vertical — juego principal: estados, cámara, carrera (cronómetro, fantasmas, checkpoints), misiones,
   guardado, menús, tutorial y ganchos de prueba. */
import { createGame, createInput, createSave, screen, toast, clamp, THREE } from '../../matelabs/kit3d.js';
import { GAME_ID, TITLE, ACCENT, DIFF, QUAL, MISSIONS, SAVE_VERSION, SAVE_DEFAULTS, PHYS, keyLabel, fmtTime } from './config.js';
import { COURSES, THEMES, courseById, courseIndex } from './courses.js';
import { createMaterials, makeRunner, poseRunner } from './models.js';
import { buildCourse, SESSION } from './world.js';
import { createBoss } from './boss.js';
import { createPlayer } from './player.js';
import { groundBelow, segBox } from './physics.js';
import { createFx } from './fx.js';
import { createSfx } from './sfx.js';
import { createUI } from './ui.js';

const Wn = /** @type {any} */ (window);
const A = Wn.MLArcade, M = Wn.MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const MOVE_NAMES = { wall: 'PARED', wallJump: 'SALTO DE PARED', climb: 'TREPADA', mantle: 'CORNISA', vault: 'SALTO DE VALLA', slide: 'DESLIZ', slideJump: 'SALTO LARGO', roll: 'RODADA', zip: 'TIROLINA', boost: 'IMPULSO', launch: 'LANZADOR' };
const MEDALS = ['', 'BRONCE', 'PLATA', 'ORO'];

/* ======================= guardado ======================= */
const save = createSave(GAME_ID + ':save', SAVE_VERSION, structuredClone(SAVE_DEFAULTS), old => old || {});
/** Repara datos con forma inválida: nunca bloquea la partida. */
function sanitize() {
  const s = /** @type {any} */ (save.get()), D = /** @type {any} */ (SAVE_DEFAULTS);
  for (const k in D) {
    const dv = D[k], v = s[k];
    if (dv && typeof dv === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (typeof v !== typeof dv) s[k] = dv;
  }
  for (const k in s) if (!(k in D)) delete s[k];
  const ids = COURSES.map(c => c.id);
  s.unlocked = Math.max(1, Math.min(COURSES.length, Math.floor(+s.unlocked || 1)));
  if (!ids.includes(s.last)) s.last = 'amanecer';
  const num = (o, ok) => { const r = {}; for (const k of ids) if (o && typeof o[k] === typeof ok && (typeof ok !== 'number' || (isFinite(o[k]) && o[k] > 0))) r[k] = o[k]; return r; };
  s.done = num(s.done, true); s.best = num(s.best, 1); s.medals = num(s.medals, 1);
  for (const k of ['splits']) { const r = {}; for (const id of ids) if (Array.isArray(s[k][id])) r[id] = s[k][id].filter(x => isFinite(x)); s[k] = r; }
  for (const k of ['ghosts', 'lastGhost']) { const r = {}; for (const id of ids) { const g = s[k][id]; if (g && isFinite(g.t) && Array.isArray(g.d) && g.d.length % 5 === 0 && g.d.every(x => Number.isFinite(x))) r[id] = g; } s[k] = r; }
  for (const k of ['clocks', 'routes']) { const r = {}; for (const id of ids) if (Array.isArray(s[k][id])) r[id] = s[k][id].filter(x => typeof x === 'string'); s[k] = r; }
  s.tutorial = { off: !!s.tutorial.off, seen: (s.tutorial.seen && typeof s.tutorial.seen === 'object' && !Array.isArray(s.tutorial.seen)) ? s.tutorial.seen : {} };
  const o = s.opts, dO = D.opts;
  s.opts = {
    sens: typeof o.sens === 'number' && o.sens >= 0.3 && o.sens <= 2.5 ? o.sens : 1,
    invert: !!o.invert, autocam: o.autocam !== false, music: o.music !== false,
    motion: ['auto', 'reduce', 'full'].includes(o.motion) ? o.motion : 'auto',
    ghost: ['best', 'last', 'off'].includes(o.ghost) ? o.ghost : 'best',
    binds: { ...dO.binds, ...(o.binds && typeof o.binds === 'object' ? o.binds : {}) },
  };
  for (const k of ['jump', 'slide', 'action', 'respawn']) if (typeof s.opts.binds[k] !== 'string' || !s.opts.binds[k]) s.opts.binds[k] = dO.binds[k];
  for (const k of ['wins', 'runs']) if (!isFinite(s[k]) || s[k] < 0) s[k] = 0;
  // el desbloqueo nunca queda por detrás de lo completado (sin bloqueos irreversibles)
  ids.forEach((id, i) => { if (s.done[id]) s.unlocked = Math.max(s.unlocked, Math.min(ids.length, i + 2)); });
}
sanitize(); save.flush();
const S = () => /** @type {typeof SAVE_DEFAULTS} */ (save.get());
const persist = () => save.flush();
const binds = () => S().opts.binds;

/* ======================= misiones y dificultad ======================= */
M.setup({ gameId: GAME_ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 2, hud: 'tr' });
const diffName = () => /** @type {keyof typeof DIFF} */ (M.difficulty(GAME_ID));
const diff = () => DIFF[diffName()] || DIFF.normal;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => { const m = S().opts.motion; return m === 'reduce' || (m === 'auto' && reducedMQ.matches); };
const emit = (ev, v) => M.emit(ev, v);

/* ======================= juego base ======================= */
const ACTIVE = new Set(['intro', 'count', 'play', 'fall', 'finish']);
let state = 'menu';
const game = createGame({
  id: GAME_ID, title: TITLE, toolbar: 'tr', background: 0x140c10, fov: 62, far: 300,
  help: ['WASD/flechas o joystick: correr (el sprint llega solo)', 'Espacio / SALTO: saltar · contra una pared alta: trepar · junto a un panel: correr por la pared',
    'Shift / DESLIZ: deslizarte (antes de caer de alto: rodada)', 'F / ACCIÓN: colgarte de la tirolina · R: volver al punto de control',
    'Arrastrar mouse/dedo o Q/E: mirar (la cámara vuelve sola)', 'Gamepad: A saltar · B deslizar · X acción · Y punto de control · LB/RB cámara', 'Esc, P o Start: pausa'],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'F13', b: 'F14', x: 'F15', y: 'F16', lb: 'KeyQ', rb: 'KeyE' },
  isActive: () => ACTIVE.has(state),
  update, onRestart, onQuality: () => applyQuality(),
  actions: [
    { label: '📖 Cómo jugar y tutorial', fn: () => openHelp(true) },
    { label: '⚙ Controles y accesibilidad', fn: () => openOptions(true) },
    { label: '↩ Volver al punto de control', fn: () => { if (state === 'play') respawnRequest(); } },
    { label: '🏙 Volver al menú de circuitos', fn: exitToMenu },
  ],
});
const { scene, camera, renderer } = game;
scene.fog = new THREE.Fog(0xf0cbb0, 70, 300);
const mats = createMaterials();
Object.values(mats).forEach(m => { if (m && m.isMaterial) m.userData.shared = true; });
const hemi = new THREE.HemisphereLight(0xfff0dd, 0x6b5a50, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd6a0, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 });
sun.shadow.bias = -0.0012;
scene.add(sun, sun.target);
// luz que acompaña al corredor en escenarios oscuros (lectura de la silueta de noche)
const pLight = new THREE.PointLight(0xa8eeff, 0, 14, 1.6); scene.add(pLight);
const fx = createFx(scene, reduced);
const sfx = createSfx(game.audio);
const ui = createUI();

/* ======================= corredor, fantasma y marcadores ======================= */
const RM = makeRunner(mats.runner);
const RG = makeRunner(mats.ghost);
RG.group.traverse(o => { o.castShadow = false; /** @type {any} */ (o).renderOrder = 3; });
scene.add(RM.group, RG.group);
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 18).rotateX(-Math.PI / 2), mats.blob); blob.renderOrder = 1; scene.add(blob);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 24).rotateX(-Math.PI / 2), mats.marker); marker.renderOrder = 1; scene.add(marker);
let W = /** @type {any} */ (null), boss = /** @type {any} */ (null);

let input = createInput(game.root, { joystick: 'left', look: true, buttons: [{ id: 'jump', label: 'SALTO' }, { id: 'slide', label: 'DESLIZ' }, { id: 'action', label: 'ACCIÓN' }] });
if (input.isTouch) document.body.classList.add('cv-touch');
input.showTouch(false);
const actBtn = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="action"]'));

/* ======================= carrera ======================= */
const run = {
  course: /** @type {any} */ (COURSES[0]), clock: 0, pen: 0, bonus: 0, cp: -1, splits: /** @type {number[]} */ ([]), falls: 0, fallsInSector: 0, alarms: 0,
  combo: 0, comboT: 0, lastMove: '', maxCombo: 0, routes: 0, clocks: 0, score: 0, stateT: 0, countN: 0, rec: /** @type {number[]} */ ([]), recT: 0,
  ghost: /** @type {{t:number,d:number[]}|null} */ (null), hadBest: 0, captures: 0, hits: 0, lastDelta: '', deltaGood: true, deltaT: 0, penT: 0, penTxt: '',
  result: /** @type {any} */ (null), defeatWhy: '', hardLands: 0,
};
const time = () => run.clock + run.pen - run.bonus;
const limit = () => run.course.limit * diff().limitMul;
const champ = c => c.champ * diff().champMul;
const parT = c => c.par * diff().champMul;

/* ======================= contexto compartido ======================= */
const ctx = {
  THREE, scene, mats, sfx, fx, emit, diff, reduced,
  glow: () => (QUAL[game.quality] || QUAL.medium).glow,
  W: () => W,
  get player() { return P; },
  move(kind) {
    if (run.comboT > 0 && kind !== run.lastMove) run.combo++;
    else if (run.comboT <= 0) run.combo = 1;
    run.lastMove = kind; run.comboT = 2.6;
    run.maxCombo = Math.max(run.maxCombo, run.combo);
    run.score += 20 * run.combo;
    if (state === 'play') emit('combo', run.combo);
    if (run.combo >= 2) { ui.combo(run.combo, /** @type {any} */ (MOVE_NAMES)[kind] || ''); sfx.combo(run.combo); }
    if (kind === 'roll') tipSeen('roll');
  },
  breakCombo() { run.combo = 0; run.comboT = 0; run.lastMove = ''; },
  alarm(drone) {
    if (state !== 'play') return;
    const d = diff();
    run.pen += d.alarmPen; run.alarms++; showPen(`+${d.alarmPen} s`);
    W.lockdown(3);
    sfx.alarm(); if (!reduced()) ui.flash();
    ctx.breakCombo();
    emit('alarm');
    toast(`🚨 ¡Te detectó un dron! +${d.alarmPen} s · puertas de seguridad trabadas 3 s`, 1800);
    void drone;
  },
  hit(kind, dx, dz, power) {
    if (state !== 'play') return;
    const ok = P.hit(dx, dz, power, kind === 'turret' ? 0.35 : 0.45, kind === 'turret' ? 1.2 : 0);
    if (!ok) return;
    run.hits++;
    if (kind === 'barrier') { sfx.zap(); fx.burst(P.body.pos.x, P.body.pos.y + 1.1, P.body.pos.z, 0xff4a2a, 12, 4); }
    else { sfx.stunHit(); fx.burst(P.body.pos.x, P.body.pos.y + 1.1, P.body.pos.z, 0xff3348, 10, 3); toast('⚡ ¡Aturdido! Vas más lento un momento', 1200); }
    if (!reduced()) ui.flash();
    fx.shake(0.25);
    emit(kind + 'Hit');
  },
  bossHit(kind, dx, dz) {
    if (state !== 'play') return;
    if (!P.hit(dx, dz, kind === 'mine' ? 7 : 2.5, 0.6, 0.6)) return;
    run.hits++; sfx.zap(); if (!reduced()) ui.flash(); fx.shake(0.35);
    toast(kind === 'mine' ? '💥 ¡Mina de pulso!' : '⚡ ¡El barrido te alcanzó! El Vigía se acerca', 1400);
    emit('bossHit');
  },
  bossCapture() { if (state === 'play') capture(); },
  onBossPhase(n) {
    ui.title(n === 2 ? 'FASE 2 · BLOQUEO' : 'FASE 3 · SOBRECARGA', 'VIGÍA MAYOR', 2200);
    toast(n === 2 ? '¡Se adelanta! Esquivá los círculos rojos: son minas de pulso' : '¡Sobrecarga! Te persigue más rápido: no frenes', 2600);
    sfx.roar(); fx.shake(0.4); emit('bossPhase', n);
  },
  onLift() { sfx.lift(); emit('lift'); },
  onDoorUnlock(d) { sfx.unlock(); toast('⚡ ¡Puerta exprés desbloqueada para toda la sesión!', 2000); emit('doorUnlock'); void d; },
  onDoorDenied() { sfx.denied(); toast('Puerta exprés: llegá al sprint (sin frenar) para abrirla', 1600); },
};
const P = createPlayer(ctx);

/* ======================= tutorial contextual ======================= */
const K = id => input.isTouch ? ({ jump: 'SALTO', slide: 'DESLIZ', action: 'ACCIÓN', respawn: '↩' })[id] : keyLabel(binds()[id]);
const TIPS = {
  move: () => input.isTouch ? 'Corré con el <b>joystick</b>: el sprint llega solo si no frenás. La cámara te sigue; arrastrá el dedo para mirar.' : 'Corré con <b>WASD</b>: el sprint llega solo si no frenás. La cámara te sigue; arrastrá el mouse o usá <b>Q/E</b> para mirar.',
  jump: () => `Saltá con <b>${K('jump')}</b>. Si llegás justo, te agarrás de la cornisa sola. Mantené apretado para saltar más alto.`,
  vault: () => 'Corré contra obstáculos bajos: los <b>saltás sin frenar</b>.',
  climb: () => `Contra una pared alta, saltá con <b>${K('jump')}</b> y seguí empujando: <b>trepás</b> y subís a la cornisa.`,
  wall: () => `Saltá junto a los <b>paneles con flechas</b>: corrés por la pared. <b>${K('jump')}</b> otra vez para impulsarte hacia el otro lado.`,
  dash: () => 'Los <b>paneles celestes</b> te impulsan hacia adelante. Los <b>amarillos</b> te lanzan hacia arriba.',
  zip: () => `Debajo del cable, saltá o apretá <b>${K('action')}</b> para colgarte de la <b>tirolina</b>. Saltá para soltarte antes.`,
  lift: () => 'Parate sobre la <b>plataforma elevadora</b>: sube sola y baja cuando te vas.',
  door: () => 'Las <b>puertas automáticas</b> se abren al acercarte. La de seguridad escanea medio segundo y se traba si suena una alarma.',
  drone: () => `Evitá el <b>foco del dron</b> o pasalo <b>deslizándote</b> (${K('slide')}): si te detecta, suma tiempo.`,
  barrier: () => `<b>Barrera láser</b>: deslizate (${K('slide')}) por debajo o saltala cuando baja. Si te toca, te frena.`,
  turret: () => 'La <b>torreta</b> marca con un láser antes de disparar: cortá la línea de visión o deslizate para esquivar el pulso.',
  roll: () => `Caíste de muy alto. Apretá <b>${K('slide')}</b> justo antes de tocar el piso para <b>rodar</b> sin perder velocidad.`,
  ghost: () => 'El corredor celeste es tu <b>fantasma</b>: repite tu mejor carrera. Ganale para batir tu récord.',
  boss: () => `<b>Saltá</b> las líneas rojas del barrido y no frenes: si el Vigía te alcanza, te atrapa. ${K('respawn')} te devuelve al último punto de control.`,
  alt: () => 'Los <b>grafitis «ATAJO»</b> marcan rutas alternativas: suelen pedir más habilidad, pero ahorran tiempo.',
};
let tipId = '', tipT = 0, moved = 0;
function tip(id) {
  const t = S().tutorial;
  if (t.off || t.seen[id] || tipId === id || state !== 'play') return;
  t.seen[id] = true; persist();
  tipId = id; tipT = 10;
  ui.tip(/** @type {any} */ (TIPS)[id](), a => { if (a === 'skip') { S().tutorial.off = true; persist(); toast('Tutorial desactivado (lo reactivás desde «Cómo jugar»)', 2200); } closeTip(); });
  emit('tutorial');
}
function tipSeen(id) { const t = S().tutorial; if (!t.seen[id]) { t.seen[id] = true; } }
function closeTip() { tipId = ''; ui.tip(null); }
let tipScanT = 0;
function tipScan(dt) {
  tipScanT -= dt; if (tipScanT > 0) return; tipScanT = 0.25;
  if (tipId || S().tutorial.off) return;
  const p = P.body.pos, near = (x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
  for (const pd of W.pads) if (near(pd.x, pd.z, 7) && Math.abs(pd.y - p.y) < 3) return tip('dash');
  for (const z of W.zips) if (near(z.a.x, z.a.z, 7)) return tip('zip');
  for (const l of W.lifts) if (near(l.x, l.z, 6) && Math.abs(l.y - p.y) < 3) return tip('lift');
  for (const d of W.doors) if (near(d.x, d.z, 7) && Math.abs(d.y - p.y) < 3) return tip('door');
  for (const e of W.barriers) if (near(e.x, e.z, 7) && Math.abs(e.y - p.y) < 3) return tip('barrier');
  for (const e of W.drones) if (near(e.sx, e.sz, 9)) return tip('drone');
  for (const e of W.turrets) if (e.state === 'aim') return tip('turret');
  if (W.alts.length && S().tutorial.seen.jump) for (const a of W.alts) if (near((a.c.x0 + a.c.x1) / 2, (a.c.z0 + a.c.z1) / 2, 16)) return tip('alt');
  // borde de azotea adelante → saltar; pared adelante → trepar; obstáculo bajo → valla
  if (P.body.grounded && P.speed > 2) {
    const ux = P.body.vel.x / P.speed, uz = P.body.vel.z / P.speed, cols = W.grid.near(p.z);
    const g2 = groundBelow(cols, p.x + ux * 3, p.z + uz * 3, p.y + 0.2);
    if (g2 < p.y - 2.5) return tip('jump');
    for (const c of cols) {
      if (c.tag === 'ghost' || c.tag === 'ramp' || c.tag === 'roof' && c.y1 <= p.y + 0.4) continue;
      const fx2 = p.x + ux * 3, fz2 = p.z + uz * 3;
      if (fx2 > c.x0 && fx2 < c.x1 && fz2 > c.z0 && fz2 < c.z1 && c.y0 < p.y + 1) {
        const rise = c.y1 - p.y;
        if (rise > 0.4 && rise <= 1.35) return tip('vault');
        if (rise > 2.6 && rise < 7) return tip(c.tag === 'wall' ? 'wall' : 'climb');
      }
    }
    for (const c of cols) if (c.tag === 'wall' && Math.hypot((c.x0 + c.x1) / 2 - p.x, (c.z0 + c.z1) / 2 - p.z) < 9) return tip('wall');
  }
}

/* ======================= cargar circuito ======================= */
function loadCourse(id) {
  const def = courseById(id);
  if (W && W.def.id === def.id) return;
  if (boss) { boss.dispose(); boss = null; }
  if (W) W.dispose();
  fx.clear();
  W = buildCourse(def, ctx);
  scene.add(W.group);
  if (def.boss) boss = createBoss(ctx, W);
  const th = W.theme;
  scene.fog.color.setHex(th.fog); /** @type {any} */ (scene.background).setHex(th.fog);
  hemi.color.setHex(th.hemiSky); hemi.groundColor.setHex(th.hemiGround); hemi.intensity = th.hemiI;
  sun.color.setHex(th.sun); sun.intensity = th.sunI;
  pLight.color.setHex(th.playerLight || 0xffffff); pLight.intensity = th.playerLight ? (def.id === 'neon' ? 26 : 10) : 0;
  mats.ground.color.setHex(th.ground);
  /** @type {any} */ (mats.ground).roughness = th.sea ? 0.35 : 1; /** @type {any} */ (mats.ground).metalness = th.sea ? 0.3 : 0;
  applyQuality();
  W.resetRun();
}
function applyQuality() {
  const q = QUAL[game.quality] || QUAL.medium;
  const th = W ? W.theme : THEMES.dawn;
  const f = /** @type {THREE.Fog} */ (scene.fog);
  f.near = th.fogNear * q.fog; f.far = Math.min(th.fogFar * q.fog, q.far * 0.95);
  camera.far = q.far; camera.updateProjectionMatrix();
  mats.facade.emissiveIntensity = th.emissive * (q.windowsLit ? 1 : 0.45);
  mats.skyline.emissiveIntensity = th.emissive * (q.windowsLit ? 0.9 : 0.4);
  fx.setCap(q.particles);
  if (W) W.applyQuality(q);
}

/* ======================= ciclo de carrera ======================= */
function startRun(id) {
  const def = courseById(id || S().last);
  if (courseIndex(def.id) + 1 > S().unlocked && !DEBUG) return;
  loadCourse(def.id);
  W.resetRun();
  const s = S(); s.last = def.id; s.runs++; persist();
  run.course = def; run.clock = 0; run.pen = 0; run.bonus = 0; run.cp = -1; run.splits = []; run.falls = 0; run.fallsInSector = 0; run.alarms = 0;
  run.combo = 0; run.comboT = 0; run.lastMove = ''; run.maxCombo = 0; run.routes = 0; run.clocks = 0; run.score = 0; run.rec = []; run.recT = 0;
  run.captures = 0; run.hits = 0; run.lastDelta = ''; run.penT = 0; run.result = null; run.defeatWhy = ''; run.hardLands = 0;
  const g = s.opts.ghost === 'off' ? null : (s.opts.ghost === 'last' ? (s.lastGhost[def.id] || s.ghosts[def.id]) : s.ghosts[def.id]);
  run.ghost = g || null; run.hadBest = s.best[def.id] || 0;
  P.reset(W.start.x, W.start.y + 0.02, W.start.z, W.start.yaw);
  cam.yaw = W.start.yaw + Math.PI; cam.pitch = 0.3; cam.lookT = 9; cam.dist = 6;
  cam.tx = W.start.x; cam.ty = W.start.y + 1.4; cam.tz = W.start.z;
  closeTip(); fx.clear();
  menu.hide(); endScreen.hide(); helpScreen.hide(); optScreen.hide();
  ui.show(true); input.showTouch(true); input.clear(); ui.fade(false);
  M.runStart();
  // progreso de campaña ya logrado (las metas acumulativas no se pierden entre sesiones)
  const doneN = COURSES.slice(0, 3).filter(c => s.done[c.id]).length; if (doneN) emit('circuit', doneN);
  if (Object.values(s.medals).some(m => m >= 3)) emit('champTime');
  if (s.escaped) emit('escape');
  A.started();
  moved = 0;
  if (boss) { boss.start(); state = 'intro'; run.stateT = 0; A.refresh(); ui.title('VIGÍA MAYOR', 'CIRCUITO MAESTRO · EL GRAN EVENTO', 3800); sfx.roar(); }
  else beginCountdown();
}
function beginCountdown() { state = 'count'; run.stateT = 0; run.countN = 4; A.refresh(); ui.title(run.course.name, `${['I', 'II', 'III', 'FINAL'][courseIndex(run.course.id)]} · ${run.ghost ? 'FANTASMA ' + fmtTime(run.ghost.t) : 'SIN FANTASMA'}`, 1500); }
function endRun(won) {
  M.runEnd({ won });
  A.ended({ score: Math.max(0, Math.round(run.result ? run.result.score : run.score)) });
}
function onRestart() {
  if (!ACTIVE.has(state)) return;
  endRun(false);
  startRun(run.course.id);
}
function exitToMenu() {
  if (ACTIVE.has(state)) { A.pause(); A.resume(); }
  if (ACTIVE.has(state)) endRun(false);
  if (boss) boss.stop();
  state = 'menu'; showMenu();
}
function respawnRequest() { if (state !== 'play') return; startFall(false); }
function startFall(fell = true) {
  if (state !== 'play') return;
  if (P.mode === 'zip') P.detachZip(0);
  state = 'fall'; run.stateT = 0; ui.fade(true);
  if (fell) {
    const d = diff();
    run.pen += d.fallPen; run.falls++; run.fallsInSector++; showPen(`+${d.fallPen} s`);
    sfx.fall(); emit('fall'); ctx.breakCombo();
    toast(`¡Caíste! +${d.fallPen} s · volvés al punto de control`, 1500);
  }
}
function capture() {
  run.captures++;
  sfx.capture(); fx.shake(0.5); if (!reduced()) ui.flash();
  emit('captured');
  if (run.captures >= diff().captures) { defeat('captured'); return; }
  const d = diff();
  run.pen += d.fallPen; showPen(`+${d.fallPen} s`);
  toast(`🛸 ¡El Vigía te atrapó! (${run.captures}/${d.captures}) · +${d.fallPen} s`, 2000);
  state = 'fall'; run.stateT = 0; ui.fade(true); ctx.breakCombo();
}
function respawn() {
  const cp = run.cp >= 0 ? W.cps[run.cp] : null;
  const sp = cp ? { x: cp.x, y: cp.y, z: cp.z, yaw: Math.PI } : W.start;
  P.reset(sp.x, sp.y + 0.02, sp.z, sp.yaw);
  cam.yaw = sp.yaw + Math.PI; cam.lookT = 9; cam.tx = sp.x; cam.ty = sp.y + 1.4; cam.tz = sp.z;
  if (boss) boss.resetAt(run.cp, sp.z);
  state = 'play'; ui.fade(false);
}
function showPen(t) { run.penTxt = t; run.penT = 1.6; }
function reachCp(cp) {
  W.reachCp(cp); run.cp = cp.i;
  run.splits[cp.i] = time();
  const best = S().splits[run.course.id];
  if (best && isFinite(best[cp.i])) { const dd = time() - best[cp.i]; run.lastDelta = (dd >= 0 ? '+' : '−') + Math.abs(dd).toFixed(1); run.deltaGood = dd < 0; run.deltaT = 3.5; }
  sfx.checkpoint(); fx.burst(cp.x, cp.y + 2, cp.z, 0xff7a2f, 22, 4);
  toast(`◆ Punto de control ${cp.i + 1}/${W.cps.length} · ${fmtTime(time())}${run.lastDelta ? ' (' + run.lastDelta + ')' : ''}`, 1500);
  emit('checkpoint');
  if (run.fallsInSector === 0) emit('cleanSector');
  run.fallsInSector = 0;
  if (boss) boss.setPhase(Math.min(3, cp.i + 2));
}
function finish() {
  if (state !== 'play') return;
  const def = run.course, s = S(), final = time(), idx = courseIndex(def.id);
  const gold = champ(def), silver = parT(def);
  const medal = final <= gold ? 3 : final <= silver ? 2 : 1;
  const prevBest = s.best[def.id] || 0, record = !prevBest || final < prevBest;
  run.recT = 99; recordGhost(true);
  const ghostData = { t: +final.toFixed(2), d: run.rec.slice() };
  s.lastGhost[def.id] = ghostData;
  if (record) { s.best[def.id] = +final.toFixed(2); s.ghosts[def.id] = ghostData; s.splits[def.id] = run.splits.map(x => +x.toFixed(2)); }
  const firstDone = !s.done[def.id];
  s.done[def.id] = true; s.unlocked = Math.max(s.unlocked, Math.min(COURSES.length, idx + 2));
  s.medals[def.id] = Math.max(s.medals[def.id] || 0, medal);
  if (def.boss) { s.escaped = true; if (medal >= 3) s.champion = true; s.wins++; }
  persist();
  if (firstDone && idx < 3) emit('circuit');
  if (medal >= 3) emit('champTime');
  if (prevBest && final < prevBest) emit('beatGhost');
  if (W.drones.length && run.alarms === 0) emit('stealthFinish');
  if (def.boss) emit('escape');
  const score = Math.round(1000 + Math.max(0, limit() - final) * 20 + run.clocks * 100 + run.maxCombo * 60 + run.routes * 150 + (medal >= 3 ? 500 : medal * 120) + (def.boss ? 2500 : 0) + run.score * 0.2);
  run.result = { final, medal, record, prevBest, score, firstDone, gold, silver };
  state = 'finish'; run.stateT = 0;
  sfx.finish(); if (record) setTimeout(() => sfx.record(), 600);
  fx.burst(P.body.pos.x, P.body.pos.y + 2, P.body.pos.z, 0xffd23a, 40, 6); fx.ring(P.body.pos.x, P.body.pos.y + 0.1, P.body.pos.z, 0xff7a2f, 6, 0.6);
  ui.title(def.boss ? '¡ESCAPASTE!' : '¡META!', fmtTime(final) + (record ? ' · NUEVO RÉCORD' : ''), 2400);
  if (boss) { sfx.crash(); }
}
function showResult() {
  state = 'result'; input.showTouch(false); ui.show(false); ui.hideTitle(); closeTip();
  endRun(true); A.refresh();
  const r = run.result, def = run.course, s = S(), idx = courseIndex(def.id);
  const next = COURSES[idx + 1];
  const allDone = COURSES.slice(0, 3).every(c => s.done[c.id]);
  const big = def.boss;
  endScreen.show(`<span class="k3-kicker">${big ? 'CIRCUITO MAESTRO' : def.name.toUpperCase()}</span><h1>${big ? (r.medal >= 3 ? '¡CAMPEÓN VERTICAL!' : '¡ESCAPASTE!') : '¡META!'}</h1>
    <p>${big ? (r.medal >= 3 ? 'Dejaste atrás al Vigía Mayor y batiste el tiempo de campeonato. La ciudad es tuya.' : 'El Vigía Mayor se sobrecargó y cayó. Ahora batí el tiempo de campeonato.') : r.record ? '¡Nuevo récord! Tu fantasma ahora corre esta marca.' : 'Seguí afinando la ruta: los atajos y los combos ahorran segundos.'}</p>
    <div class="cv-res"><span>Tiempo</span><span>${fmtTime(r.final)}${r.record ? ' ★' : ''}</span>
      <span>Medalla</span><span class="cv-medal" style="color:${['', '#d08a4a', '#cfd8e0', '#ffd23a'][r.medal]}">${MEDALS[r.medal]}</span>
      <span>Oro / Plata</span><span>${fmtTime(r.gold)} / ${fmtTime(r.silver)}</span>
      <span>Mejor marca</span><span>${fmtTime(s.best[def.id])}</span>
      <span>Penalización · Relojes</span><span>+${run.pen} s · −${run.bonus} s (${run.clocks})</span>
      <span>Combo máx. · Atajos</span><span>×${run.maxCombo} · ${run.routes}</span>
      <span>Puntos</span><span>${r.score}</span></div>
    ${big ? '<p class="cv-small">Recompensa: buzo dorado de campeón y el título en el menú.</p>' : (r.firstDone && next ? `<p class="cv-small">🔓 Desbloqueaste: <b>${next.name}</b>${next.boss ? ' — la final contra el dron jefe' : ''}</p>` : '')}
    <div class="k3-btnrow">${next && s.unlocked > idx + 1 ? `<button class="k3-b" data-next>▶ ${next.short}</button>` : ''}<button class="k3-b${next && s.unlocked > idx + 1 ? ' alt' : ''}" data-retry>↻ Reintentar</button><button class="k3-b alt" data-menu>🏙 Circuitos</button></div>
    ${!big && allDone && !s.escaped ? '<p class="cv-small">Completaste los tres distritos: el <b>Circuito Maestro</b> te espera.</p>' : ''}`);
  applySkin();
}
function defeat(why) {
  if (state === 'defeat') return;
  run.defeatWhy = why;
  state = 'defeat'; input.showTouch(false); ui.show(false); ui.hideTitle(); closeTip(); ui.fade(false);
  if (boss) boss.stop();
  sfx.fail();
  endRun(false); A.refresh();
  endScreen.show(`<span class="k3-kicker">${run.course.name.toUpperCase()}</span><h1>${why === 'captured' ? '¡TE ATRAPÓ!' : '¡TIEMPO AGOTADO!'}</h1>
    <p>${why === 'captured' ? 'El Vigía Mayor te alcanzó demasiadas veces. Saltá los barridos y no frenes en las minas.' : `Superaste el límite de ${fmtTime(limit())}. Las caídas y las alarmas suman segundos: probá otra ruta.`}</p>
    <div class="cv-menu-prog">Tiempo: ${fmtTime(time())} · Caídas: ${run.falls} · Alarmas: ${run.alarms}${boss ? ` · Capturas: ${run.captures}` : ''}</div>
    <div class="k3-btnrow"><button class="k3-b" data-retry>↻ Reintentar</button><button class="k3-b alt" data-menu>🏙 Circuitos</button></div>`);
}

/* ======================= fantasma ======================= */
function recordGhost(force = false) {
  run.recT += 1 / 60;
  if (!force && run.recT < 0.1) return;
  run.recT = 0;
  if (run.rec.length > 5 * 10 * 400) return;
  const p = P.body.pos;
  run.rec.push(Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.z * 10), Math.round(P.face * 100), poseCode());
}
function poseCode() {
  switch (P.mode) {
    case 'slide': return 2; case 'roll': return 6; case 'wall': return P.wall.side > 0 ? 7 : 3; case 'zip': return 4; case 'climb': case 'mantle': return 5;
    default: return P.body.grounded ? 0 : 1;
  }
}
function updateGhost(t) {
  const g = run.ghost;
  if (!g || S().opts.ghost === 'off' || state === 'menu' || state === 'intro') { RG.group.visible = false; return; }
  const n = g.d.length / 5; if (n < 2) { RG.group.visible = false; return; }
  const f = Math.min(n - 1.001, t * 10), i = Math.floor(f), k = f - i, a = i * 5, b = a + 5, d = g.d;
  RG.group.visible = true;
  RG.group.position.set((d[a] + (d[b] - d[a]) * k) / 10, (d[a + 1] + (d[b + 1] - d[a + 1]) * k) / 10, (d[a + 2] + (d[b + 2] - d[a + 2]) * k) / 10);
  let fa = d[a + 3] / 100, fb = d[b + 3] / 100, dd = Math.atan2(Math.sin(fb - fa), Math.cos(fb - fa));
  RG.group.rotation.y = fa + dd * k;
  const pc = d[a + 4], sp = Math.hypot(d[b] - d[a], d[b + 2] - d[a + 2]);
  RG.phase += sp * 0.12;
  poseRunner(RG, pc === 7 ? 3 : pc, sp, RG.phase, pc === 7 ? 1 : -1, d[b + 1] - d[a + 1]);
}

/* ======================= actualización ======================= */
const cam = { yaw: 0, pitch: 0.3, dist: 6, tx: 0, ty: 0, tz: 0, lookT: 9, roll: 0, menuA: 0, fov: 62 };
let bot = /** @type {any} */ (null), dbgFreeze = false;
/** piloto automático (sólo ?debug): sigue puntos de paso con acciones; la física y las reglas son las reales */
function botInput() {
  const p = P.body.pos, wp = bot.route[bot.i];
  const o = { mx: 0, mz: 0, ml: 0, jumpHit: false, jumpHeld: bot.hold > 0, slideHit: false, slideHeld: false, actionHit: false, respawnHit: false };
  bot.hold -= 1 / 60;
  if (!wp) return o;
  const dx = wp[0] - p.x, dz = wp[1] - p.z, d = Math.hypot(dx, dz);
  if (d < (wp[3] || 0.9)) {
    const act = wp[2];
    if (act === 'jump') { o.jumpHit = true; o.jumpHeld = true; bot.hold = 0.35; }
    if (act === 'slide') { o.slideHit = true; o.slideHeld = true; }
    if (act === 'action') o.actionHit = true;
    if (act === 'wait') { if ((bot.w = (bot.w || 0) + 1 / 60) < (wp[4] || 1)) return o; bot.w = 0; }
    bot.i++;
  }
  if (d > 0.01) { o.mx = dx / d; o.mz = dz / d; o.ml = 1; }
  if (wp[2] === 'wait' && d < (wp[3] || 0.9)) o.ml = 0;
  return o;
}
function readInput() {
  if (bot) return botInput();
  const a = input.axis(), bd = binds();
  const yaw = cam.yaw, fxv = -Math.sin(yaw), fzv = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = rx * a.x + fxv * -a.y, mz = rz * a.x + fzv * -a.y;
  const ml = Math.min(1, Math.hypot(mx, mz));
  if (ml > 0.001) { const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
  return {
    mx, mz, ml,
    jumpHit: input.hit(bd.jump, 'F13', 'btn:jump'), jumpHeld: input.down(bd.jump) || input.down('F13') || input.button('jump'),
    slideHit: input.hit(bd.slide, 'KeyC', 'ControlLeft', 'F14', 'btn:slide'), slideHeld: input.down(bd.slide) || input.down('KeyC') || input.down('F14') || input.button('slide'),
    actionHit: input.hit(bd.action, 'F15', 'btn:action'),
    respawnHit: input.hit(bd.respawn, 'F16'),
  };
}
function update(dt) {
  W && W.update(dt, state === 'play' ? P : null);
  if (boss) {
    if (state === 'play') boss.update(dt, P);
    else if (state === 'finish' && run.course.boss) boss.crash(dt);
    else boss.update(dt, null);
  }
  fx.update(dt);
  if (state === 'menu' || state === 'result' || state === 'defeat') {
    menuCamera(dt);
    RM.group.visible = state !== 'menu'; blob.visible = marker.visible = false; RG.group.visible = false;
    input.takeLook(); input.endStep();
    return;
  }
  RM.group.visible = true;
  run.stateT += dt;
  if (state === 'intro') {
    const k = Math.min(1, run.stateT / (reduced() ? 2 : 4));
    boss.intro(k);
    const a = 0.6 - k * 0.9;
    camera.position.set(W.start.x + Math.sin(a) * 15, W.start.y + 4 + k * 3, W.start.z - 12 + Math.cos(a) * 4);
    camera.lookAt(W.start.x, W.start.y + 3 + k * 8, W.start.z + 18);
    if (input.hit('Space', 'Enter', binds().jump, 'F13', 'btn:jump') || run.stateT > (reduced() ? 2 : 4.2)) { ui.hideTitle(); beginCountdown(); }
    poseRunner(RM, 0, 0, run.stateT * 4);
    placeRunner();
  } else if (state === 'count') {
    const n = Math.max(0, 3 - Math.floor(run.stateT / 0.7));
    if (n !== run.countN) { run.countN = n; if (n > 0) sfx.count(false); }
    ui.center(n > 0 ? String(n) : '');
    if (run.stateT >= 2.1) { state = 'play'; ui.center('¡YA!'); sfx.count(true); setTimeout(() => { if (ui.els.center.textContent === '¡YA!') ui.center(''); }, 650); setTimeout(() => tip('move'), 400); if (run.ghost) setTimeout(() => tip('ghost'), 5000); if (boss) setTimeout(() => tip('boss'), 1200); }
    P.phase += dt * 3; poseRunner(RM, 0, 0, P.phase); placeRunner();
    updateCamera(dt, readInput());
  } else if (state === 'play') {
    const inp = readInput();
    run.clock += dt;
    if (inp.respawnHit) { respawnRequest(); }
    else {
      if (!dbgFreeze) P.step(dt, inp);
      if (inp.ml > 0.2) moved += dt;
      if (tipId === 'move' && moved > 2.5) closeTip();
      playChecks(dt, inp);
    }
    animatePlayer(dt);
    updateCamera(dt, inp);
    recordGhost();
    tipScan(dt);
    if (time() > limit() && state === 'play') defeat('time');
    sfx.music(dt, S().opts.music, boss ? (boss.phase === 3 ? 1 : 0.6) : Math.min(1, P.speed / 14));
  } else if (state === 'fall') {
    if (run.stateT > 0.75) respawn();
    updateCamera(dt, readInput());
  } else if (state === 'finish') {
    const dur = run.course.boss ? 3.2 : 1.8;
    P.body.vel.x *= 0.9; P.body.vel.z *= 0.9;
    const a = run.stateT * 0.7 + cam.yaw;
    const p = P.body.pos;
    camera.position.set(p.x + Math.sin(a) * 5.5, p.y + 2.2, p.z + Math.cos(a) * 5.5);
    camera.lookAt(p.x, p.y + (run.course.boss ? 3 : 1.2), p.z);
    if (run.course.boss && boss) camera.lookAt(boss.grp.position.x * 0.3 + p.x * 0.7, p.y + 3, boss.grp.position.z * 0.3 + p.z * 0.7);
    poseRunner(RM, 5, 0, run.stateT * 6); RM.armL.rotation.x = RM.armR.rotation.x = -2.8; placeRunner();
    if (run.stateT >= dur) showResult();
  }
  updateGhost(run.clock);
  run.comboT -= dt; if (run.comboT <= 0 && run.combo) { run.combo = 0; run.lastMove = ''; }
  if (tipId) { tipT -= dt; if (tipT <= 0) closeTip(); }
  hudTick(dt);
  input.endStep();
}
function playChecks(dt, inp) {
  const p = P.body.pos;
  if (p.y < W.killY) { startFall(true); return; }
  // checkpoints y meta
  for (const cp of W.cps) if (!cp.reached && Math.hypot(cp.x - p.x, cp.z - p.z) < 3.8 && Math.abs(cp.y - p.y) < 3.2) reachCp(cp);
  const g = W.goal; if (g && Math.hypot(g.x - p.x, g.z - p.z) < 4 && Math.abs(g.y - p.y) < 3) { finish(); return; }
  // relojes
  for (const c of W.clocks) {
    if (c.taken) continue;
    if (Math.hypot(c.x - p.x, c.y - (p.y + 0.9), c.z - p.z) < 1.3) {
      c.taken = true; run.bonus += 1; run.clocks++; run.score += 100;
      const sv = S(), list = sv.clocks[run.course.id] || (sv.clocks[run.course.id] = []);
      if (!list.includes(c.id)) { list.push(c.id); persist(); }
      sfx.clock(); fx.burst(c.x, c.y, c.z, 0xffc93a, 16, 3); fx.ring(c.x, c.y, c.z, 0xffd23a, 1.6, 0.3);
      showPen('−1 s'); emit('clock');
    }
  }
  // rutas alternativas
  for (const a of W.alts) {
    if (a.hit) continue;
    const c = a.c, y = p.y + 0.9;
    if (p.x > c.x0 && p.x < c.x1 && y > c.y0 && y < c.y1 && p.z > c.z0 && p.z < c.z1) {
      a.hit = true; run.routes++; run.score += 150;
      const sv = S(), list = sv.routes[run.course.id] || (sv.routes[run.course.id] = []);
      if (!list.includes(a.id)) { list.push(a.id); persist(); }
      sfx.alt(); toast(`↗ Ruta alternativa: ${a.name}`, 1800); emit('altRoute');
    }
  }
  // efectos de velocidad
  const sp = P.speed;
  if (!reduced() && sp > 11 && (QUAL[game.quality] || QUAL.medium).particles > 100 && Math.random() < dt * 30) fx.wind(p.x, p.y, p.z, P.body.vel.x, P.body.vel.y, P.body.vel.z);
  if (P.mode === 'slide' && Math.random() < dt * 25) fx.dust(p.x, p.y, p.z, 1);
  if (P.mode === 'wall' && Math.random() < dt * 20) fx.trail(p.x - P.wall.nx * 0.3, p.y + 0.2, p.z - P.wall.nz * 0.3, 0xffffff);
  if (P.mode === 'stun' && P.body.grounded && P.stunT > 0.3 && run.lastMove !== 'hard') { run.hardLands++; }
  if (run.hardLands === 1 && !S().tutorial.seen.roll) tip('roll');
  void inp;
}
function placeRunner() {
  const p = P.body.pos;
  RM.group.position.set(p.x, p.y, p.z);
  RM.group.rotation.y = P.face;
  const cols = W.grid.near(p.z);
  const gy = groundBelow(cols, p.x, p.z, p.y + 0.05);
  blob.visible = isFinite(gy) && P.mode !== 'zip';
  if (blob.visible) { blob.position.set(p.x, gy + 0.03, p.z); blob.scale.setScalar(Math.max(0.35, 1 - (p.y - gy) * 0.08)); }
  const air = !P.body.grounded && P.mode !== 'zip' && P.mode !== 'wall' && isFinite(gy) && p.y - gy > 1.2;
  marker.visible = air && diff().marker;
  if (marker.visible) { marker.position.set(p.x, gy + 0.05, p.z); /** @type {any} */ (marker.material).opacity = Math.min(0.75, 0.25 + (p.y - gy) * 0.05); }
}
function animatePlayer(dt) {
  const sp = P.speed;
  let pose = 0, side = 0;
  switch (P.mode) {
    case 'slide': pose = 2; break; case 'roll': pose = 6; break; case 'wall': pose = 3; side = P.wall.side; break; case 'zip': pose = 4; break;
    case 'climb': case 'mantle': pose = 5; break; case 'stun': pose = 1; break;
    default: pose = P.body.grounded ? 0 : 1;
  }
  if (pose === 6) P.phase += dt * 15; else P.phase += dt * (pose === 0 ? Math.max(sp, 0.4) * 1.18 : pose === 5 ? 9 : pose === 3 ? sp * 1.2 : 3);
  poseRunner(RM, pose, sp, P.phase, side, P.body.vel.y);
  placeRunner();
  // chispa de inmunidad tras un golpe
  RM.group.visible = !(P.inv > 0.2 && P.mode === 'stun' && Math.sin(P.inv * 40) > 0.5 && !reduced());
}
const _off = new THREE.Vector3();
function updateCamera(dt, inp) {
  const lk = input.takeLook(), o = S().opts;
  if (Math.abs(lk.dx) + Math.abs(lk.dy) > 0.5) { cam.yaw -= lk.dx * 0.0055 * o.sens; cam.pitch = clamp(cam.pitch + lk.dy * 0.004 * o.sens * (o.invert ? -1 : 1), -0.05, 1.05); cam.lookT = 0; }
  if (input.down('KeyQ')) { cam.yaw += 2.3 * dt * o.sens; cam.lookT = 0; }
  if (input.down('KeyE')) { cam.yaw -= 2.3 * dt * o.sens; cam.lookT = 0; }
  cam.lookT += dt;
  const p = P.body.pos, sp = P.speed;
  // cámara automática detrás de la dirección de carrera
  if (o.autocam && cam.lookT > 1.1 && (state === 'play' || state === 'count')) {
    let want = P.face + Math.PI;
    if (P.mode === 'zip' && P.zip.z) want = Math.atan2(P.zip.z.dx, P.zip.z.dz) + Math.PI;
    if (sp > 1.5 || P.mode === 'zip') {
      const dd = Math.atan2(Math.sin(want - cam.yaw), Math.cos(want - cam.yaw));
      // no girar de golpe cuando el corredor va hacia la cámara (marcha atrás): se respeta su elección
      const rate = Math.abs(dd) > 2.4 ? 0.6 : 2.0 + Math.min(2, sp / 6);
      cam.yaw += dd * Math.min(1, dt * rate);
    }
    if (cam.lookT > 2) cam.pitch += (0.3 + (P.body.grounded ? 0 : -0.04) - cam.pitch) * Math.min(1, dt * 1.5);
  }
  const k = Math.min(1, dt * 10), ky = Math.min(1, dt * (P.body.grounded || P.mode === 'wall' ? 7 : 4));
  const ahead = Math.min(1.8, sp * 0.12);
  const fx2 = P.body.vel.x / (sp || 1), fz2 = P.body.vel.z / (sp || 1);
  cam.tx += (p.x + fx2 * ahead - cam.tx) * k; cam.tz += (p.z + fz2 * ahead - cam.tz) * k; cam.ty += (p.y + 1.45 - cam.ty) * ky;
  const portrait = camera.aspect < 0.8;
  const want = (portrait ? 7.4 : 5.8) + Math.min(2.2, sp * 0.12);
  const pitch = cam.pitch;
  _off.set(Math.sin(cam.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(cam.yaw) * Math.cos(pitch));
  // acercar si algo tapa
  let tmin = 1;
  const cols = W.grid.near(cam.tz);
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!c.on || c.tag === 'ghost' || (c.x1 - c.x0 < 1.6 && c.z1 - c.z0 < 1.6)) continue;
    const t = segBox(cam.tx, cam.ty, cam.tz, cam.tx + _off.x * want, cam.ty + _off.y * want, cam.tz + _off.z * want, c);
    if (t < tmin) tmin = t;
  }
  const allowed = Math.max(1.6, want * tmin - 0.35);
  cam.dist = allowed < cam.dist ? allowed : cam.dist + (allowed - cam.dist) * Math.min(1, dt * 2.2);
  const sh = reduced() ? 0 : fx.shakeAmt * 0.4;
  camera.position.set(cam.tx + _off.x * cam.dist + (Math.random() - 0.5) * sh, cam.ty + _off.y * cam.dist + (Math.random() - 0.5) * sh, cam.tz + _off.z * cam.dist);
  camera.lookAt(cam.tx, cam.ty + 0.15, cam.tz);
  const rollWant = !reduced() && P.mode === 'wall' ? -P.wall.side * 0.09 : 0;
  cam.roll += (rollWant - cam.roll) * Math.min(1, dt * 6);
  if (cam.roll) camera.rotateZ(cam.roll);
  const fovWant = reduced() ? 62 : 62 + clamp((sp - 8) * 1.3, 0, 10);
  if (Math.abs(fovWant - cam.fov) > 0.05) { cam.fov += (fovWant - cam.fov) * Math.min(1, dt * 4); camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  ui.speedFx(reduced() ? 0 : clamp((sp - 10.5) / 6, 0, 1));
  followLights();
  void inp;
}
function followLights() {
  const th = W.theme, sd = th.sunDir;
  sun.target.position.set(cam.tx, cam.ty, cam.tz);
  pLight.position.set(P.body.pos.x, P.body.pos.y + 2.6, P.body.pos.z + 1.2);
  sun.position.set(cam.tx - sd[0] * 0.6, cam.ty + Math.abs(sd[1]) * 1.2 + 20, cam.tz - sd[2] * 0.6);
  W.followSky(camera, camera.far);
}
function menuCamera(dt) {
  cam.menuA += dt * (reduced() ? 0 : 0.07);
  if (!W) return;
  const s = W.start, a = cam.menuA;
  if (state === 'menu') {
    camera.position.set(s.x + Math.sin(a) * 20, s.y + 9 + Math.sin(a * 0.7) * 2, s.z - 26 + Math.cos(a) * 30);
    camera.lookAt(s.x, s.y + 2, s.z - 30);
    cam.tx = s.x; cam.ty = s.y; cam.tz = s.z - 26;
  } else {
    const p = P.body.pos;
    camera.position.set(p.x + Math.sin(a * 2) * 7, p.y + 3, p.z + Math.cos(a * 2) * 7);
    camera.lookAt(p.x, p.y + 1.2, p.z);
    cam.tx = p.x; cam.ty = p.y; cam.tz = p.z;
    poseRunner(RM, 0, 0, a * 20); placeRunner(); blob.visible = false;
  }
  if (camera.fov !== 62) { camera.fov = 62; cam.fov = 62; camera.updateProjectionMatrix(); }
  ui.speedFx(0);
  followLights();
}

/* ======================= HUD ======================= */
let hudAcc = 0;
function hudTick(dt) {
  hudAcc += dt;
  if (run.penT > 0) run.penT -= dt;
  if (run.deltaT > 0) run.deltaT -= dt;
  if (hudAcc < 0.1) return;
  hudAcc = 0;
  if (state !== 'play' && state !== 'count' && state !== 'fall' && state !== 'intro') return;
  const cps = W.cps.map(c => (c.reached ? '◆' : '◇')).join('');
  ui.status({ time: fmtTime(time()), delta: run.deltaT > 0 ? run.lastDelta : '', deltaGood: run.deltaGood, pen: run.penT > 0 ? run.penTxt : '', cps: cps + ' ⚑', clocks: run.clocks, total: W.clocks.length, speed: clamp(P.speed / 16, 0, 1) });
  // acción contextual
  let label = null, key = null;
  if (state === 'play') {
    const zn = P.mode === 'move' ? W.zipNear(P) : null;
    if (P.mode === 'zip') { label = 'Saltá para soltarte'; key = input.isTouch ? '' : keyLabel(binds().jump); }
    else if (zn && P.body.grounded) { label = 'Colgarte de la tirolina'; key = input.isTouch ? '' : keyLabel(binds().action); }
    else if (time() > limit() - 15) { label = `⏱ ¡Quedan ${Math.max(0, Math.ceil(limit() - time()))} s!`; }
    if (actBtn) { const on = !!zn || P.mode === 'zip'; actBtn.style.borderColor = on ? '#ff7a2f' : ''; actBtn.style.background = on ? 'rgba(255,122,47,.4)' : ''; }
  }
  ui.prompt(key, label);
  ui.boss(boss && boss.active && state !== 'intro' ? { name: 'VIGÍA MAYOR', phase: boss.phaseName, gap: boss.gap, caps: run.captures, maxCaps: diff().captures } : null);
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'cv-menu' });
const endScreen = screen('', { accent: ACCENT, id: 'cv-end' }); endScreen.hide();
const helpScreen = screen('', { accent: ACCENT, id: 'cv-help' }); helpScreen.hide();
const optScreen = screen('', { accent: ACCENT, id: 'cv-opts' }); optScreen.hide();
let selected = S().last;
function diffText() {
  const d = diff();
  return `Caída +${d.fallPen} s · Alarma +${d.alarmPen} s · Detección ${d.detect} s · Aviso de torreta ${d.turretWarn} s · Barreras ×${d.barrier} · Drones ×${d.drone} · Vigía ${d.bossChase} m/s, ${d.captures} captura${d.captures > 1 ? 's' : ''} · Límite ×${d.limitMul} · Oro ×${d.champMul} · Alcance de cornisa ${d.reach} m${d.marker ? ' · marca de aterrizaje' : ''}`;
}
function courseCards() {
  const s = S();
  return COURSES.map((c, i) => {
    const locked = i + 1 > s.unlocked;
    const md = s.medals[c.id] || 0;
    const info = locked ? (c.boss ? '🔒 Completá los 3 distritos' : '🔒 Terminá el anterior') : (s.best[c.id] ? `Récord ${fmtTime(s.best[c.id])}` : 'Sin récord');
    return `<button type="button" class="cv-course" data-course="${c.id}" aria-pressed="${c.id === selected}" ${locked ? 'disabled' : ''}><b>${c.boss ? '★ ' : ''}${c.short.toUpperCase()}</b><span>${info}</span><span class="m">${md ? '🏅 ' + MEDALS[md] : ''} ⏱ ${(s.clocks[c.id] || []).length} · ↗ ${(s.routes[c.id] || []).length}</span></button>`;
  }).join('');
}
function showMenu() {
  state = 'menu'; ui.show(false); input.showTouch(false); closeTip(); ui.center(''); ui.hideTitle(); ui.fade(false);
  endScreen.hide(); helpScreen.hide(); optScreen.hide();
  const s = S();
  if (courseIndex(selected) + 1 > s.unlocked) selected = COURSES[s.unlocked - 1].id;
  const c = courseById(selected);
  const doneN = COURSES.filter(x => s.done[x.id]).length;
  menu.show(`<span class="k3-kicker">PARKOUR URBANO 3D</span><h1>CARRERA VERTICAL</h1>
    <p>${s.champion ? '🏆 <b>Campeón Vertical</b> · ' : ''}Corré por las azoteas, por las paredes y por los cables. Batí tus fantasmas y escapá del dron jefe.</p>
    <div class="k3-btnrow"><button class="k3-b" data-go>▶ Correr: ${c.short}</button></div>
    <div class="cv-courses" role="group" aria-label="Circuitos">${courseCards()}</div>
    <div class="cv-menu-prog">Circuitos ${doneN}/${COURSES.length} · ${c.blurb}</div>
    <div data-diff></div><div class="cv-dtab" data-dtab>${diffText()}</div>
    <div class="k3-btnrow"><button class="k3-b alt" data-opts>⚙ Controles y opciones</button><button class="k3-b alt" data-help>📖 Cómo jugar</button></div>
    <div class="cv-credit">CREADO POR <img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  const holder = /** @type {HTMLElement} */ (menu.el.querySelector('[data-diff]'));
  M.difficultyPicker(holder, { onChange: () => { const t = menu.el.querySelector('[data-dtab]'); if (t) t.textContent = diffText(); } });
  loadCourse(selected);
  P.reset(W.start.x, W.start.y, W.start.z, W.start.yaw);
  if (boss) boss.stop();
  A.refresh();
}
menu.on('[data-go]', () => { sfx.click(); startRun(selected); });
menu.el.addEventListener('click', e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-course]');
  if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
  selected = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.course); sfx.click(); showMenu();
  const f = /** @type {HTMLElement|null} */ (menu.el.querySelector(`[data-course="${selected}"]`)); f && f.focus({ preventScroll: true });
});
menu.on('[data-help]', () => openHelp(false));
menu.on('[data-opts]', () => openOptions(false));
endScreen.on('[data-menu]', () => showMenu());
endScreen.on('[data-retry]', () => startRun(run.course.id));
endScreen.on('[data-next]', () => { const n = COURSES[courseIndex(run.course.id) + 1]; if (n) { selected = n.id; startRun(n.id); } });

let fromPause = false;
function openHelp(pause) {
  fromPause = pause;
  if (!pause) menu.hide();
  helpScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:32px">PARKOUR</h1>
    <ul class="k3-list">
      <li>🏃 <b>Correr:</b> ${input.isTouch ? 'joystick' : 'WASD o flechas'}; si no frenás llega el <b>sprint</b>. <b>Mirar:</b> arrastrar ${input.isTouch ? 'el dedo' : 'el mouse o Q/E'} (la cámara vuelve sola).</li>
      <li>⤴ <b>Saltar:</b> ${K('jump')} (mantené para más altura) · <b>Deslizar:</b> ${K('slide')} · <b>Acción:</b> ${K('action')} · <b>Punto de control:</b> ${K('respawn')}</li>
      <li>🧱 <b>Parkour asistido:</b> te agarrás solo de las cornisas cercanas, saltás obstáculos bajos corriendo, trepás paredes altas saltando contra ellas y corrés por los paneles con flechas.</li>
      <li>🪂 <b>Rodada:</b> ${K('slide')} justo antes de caer de alto: no perdés velocidad. <b>Salto largo:</b> saltá mientras te deslizás.</li>
      <li>🔀 <b>Interacciones:</b> tirolinas, plataformas elevadoras, puertas automáticas (la exprés sólo al sprint) y paneles de impulso/lanzamiento.</li>
      <li>🛸 <b>Rivales:</b> drones con foco (te suman tiempo), barreras láser (deslizate o saltá), torretas que aturden (cortá la línea de visión).</li>
      <li>⏱ <b>Tiempo:</b> caer suma segundos y volvés al punto de control; cada reloj resta 1 s. Tu mejor carrera queda como <b>fantasma</b>.</li>
      <li>🏆 <b>Campaña:</b> 3 distritos y el Circuito Maestro contra el Vigía Mayor (3 fases). Oro = tiempo de campeonato.</li>
      <li>🎮 <b>Gamepad:</b> stick mover · A saltar · B deslizar · X acción · Y punto de control · LB/RB cámara · Start pausa.</li>
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
  const row = (id, name) => `<div class="cv-bind"><span>${name}</span><button type="button" data-bind="${id}" class="${listening === id ? 'wait' : ''}">${listening === id ? 'Apretá una tecla…' : keyLabel(o.binds[id])}</button></div>`;
  const sel = (key, opts) => `<select data-${key}>${opts.map(([v, l]) => `<option value="${v}"${/** @type {any} */ (o)[key] === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  optScreen.show(`<span class="k3-kicker">OPCIONES</span><h1 style="font-size:30px">CONTROLES</h1>
    <div class="cv-opts">
      ${row('jump', 'Saltar')}${row('slide', 'Deslizar / rodar')}${row('action', 'Acción (tirolina)')}${row('respawn', 'Volver al punto de control')}
      <label>Sensibilidad de cámara <input type="range" min="0.4" max="2" step="0.1" value="${o.sens}" data-sens aria-label="Sensibilidad de cámara"></label>
      <label>Invertir cámara vertical <input type="checkbox" data-invert ${o.invert ? 'checked' : ''}></label>
      <label>Cámara automática detrás del corredor <input type="checkbox" data-autocam ${o.autocam ? 'checked' : ''}></label>
      <label>Fantasma ${sel('ghost', [['best', 'Mejor carrera'], ['last', 'Carrera anterior'], ['off', 'Apagado']])}</label>
      <label>Música (pulso) <input type="checkbox" data-music ${o.music ? 'checked' : ''}></label>
      <label>Movimiento (sacudidas, destellos, FOV) ${sel('motion', [['auto', 'Según el sistema'], ['reduce', 'Reducido'], ['full', 'Completo']])}</label>
      <div class="cv-small">Mover: WASD/flechas · Cámara: Q/E o arrastrar · Gamepad: A saltar, B deslizar, X acción, Y punto de control, LB/RB cámara, Start pausa. Sonido y calidad gráfica: menú ⏸ de la barra.</div>
    </div>
    <div class="k3-btnrow"><button class="k3-b" data-back>Listo</button><button class="k3-b alt" data-defaults>Valores por defecto</button></div>`);
}
optScreen.on('[data-back]', closeSub);
optScreen.on('[data-defaults]', () => { S().opts = structuredClone(SAVE_DEFAULTS.opts); persist(); openOptions(fromPause); });
optScreen.el.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-bind]'); if (b) { listening = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.bind); openOptions(fromPause); } });
optScreen.el.addEventListener('input', e => {
  const t = /** @type {HTMLInputElement} */ (e.target), o = /** @type {any} */ (S().opts);
  if (t.matches('[data-sens]')) o.sens = +t.value;
  if (t.matches('[data-invert]')) o.invert = t.checked;
  if (t.matches('[data-autocam]')) o.autocam = t.checked;
  if (t.matches('[data-music]')) o.music = t.checked;
  if (t.matches('[data-ghost]')) o.ghost = t.value;
  if (t.matches('[data-motion]')) o.motion = t.value;
  persist();
});
optScreen.el.addEventListener('keydown', e => {
  if (!listening) return;
  e.preventDefault();
  const reserved = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'KeyP', 'Escape'];
  if (!reserved.includes(e.code)) {
    const o = /** @type {any} */ (S().opts); for (const k in o.binds) if (o.binds[k] === e.code) o.binds[k] = o.binds[listening];
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
game.root.addEventListener('pointerdown', () => { if (state === 'intro') run.stateT = 99; });
function applySkin() {
  // recompensa del jefe: buzo dorado
  const gold = S().champion;
  RM.torso.traverse(o => { const m = /** @type {any} */ (o); if (m.isMesh) m.material = gold ? goldMat : mats.runner; });
  RM.armL.traverse(o => { const m = /** @type {any} */ (o); if (m.isMesh) m.material = gold ? goldMat : mats.runner; });
  RM.armR.traverse(o => { const m = /** @type {any} */ (o); if (m.isMesh) m.material = gold ? goldMat : mats.runner; });
}
const goldMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffe08a, roughness: 0.35, metalness: 0.55, flatShading: true, emissive: 0x3a2a00, emissiveIntensity: 0.5 });

/* ======================= gancho de pruebas ======================= */
const hook = {
  get state() { return state; },
  get scene() { return W ? W.def.name : ''; },
  get course() { return W ? W.def.id : ''; },
  get missions() { return M.state(); },
  get player() { const b = P.body; return { x: +b.pos.x.toFixed(3), y: +b.pos.y.toFixed(3), z: +b.pos.z.toFixed(3), vx: +b.vel.x.toFixed(2), vy: +b.vel.y.toFixed(2), vz: +b.vel.z.toFixed(2), grounded: b.grounded, mode: P.mode, speed: +P.speed.toFixed(2), face: +P.face.toFixed(3), h: b.h, alive: P.alive }; },
  get hp() { return boss && boss.active ? diff().captures - run.captures : null; },
  get score() { return Math.round(run.result ? run.result.score : run.score); },
  get time() { return +time().toFixed(3); }, get clock() { return +run.clock.toFixed(3); }, get pen() { return run.pen; }, get bonus() { return run.bonus; },
  get simTime() { return game.simTime; }, get paused() { return game.paused; },
  get run() { return { cp: run.cp, falls: run.falls, alarms: run.alarms, combo: run.combo, maxCombo: run.maxCombo, routes: run.routes, clocks: run.clocks, captures: run.captures, hits: run.hits, limit: limit(), result: run.result, defeat: run.defeatWhy, splits: run.splits.slice(), ghostT: run.ghost ? run.ghost.t : null, recLen: run.rec.length }; },
  get tip() { return tipId; }, get prompt() { return ui.els.prompt.textContent || ''; },
  get camYaw() { return cam.yaw; },
  get counts() {
    if (!W) return {};
    return { colliders: W.cols.length, drones: W.drones.length, barriers: W.barriers.length, turrets: W.turrets.length, pads: W.pads.length, zips: W.zips.length, lifts: W.lifts.length, doors: W.doors.length, clocks: W.clocks.filter(c => !c.taken).length, cps: W.cps.length, particles: fx.live, alts: W.alts.length };
  },
  get interactions() {
    if (!W) return {};
    return {
      pads: W.pads.map(p => ({ id: p.id, kind: p.kind, uses: p.uses, ready: p.cd <= 0 })),
      zips: W.zips.map(z => ({ id: z.id, t: +z.t.toFixed(3), busy: z.busy, uses: SESSION.uses[W.def.id + ':' + z.id] || 0, found: !!SESSION.zipsFound[W.def.id + ':' + z.id] })),
      lifts: W.lifts.map(l => ({ id: l.id, state: l.state, y: +l.y.toFixed(2), y0: l.y0, y1: l.y1, trips: l.trips })),
      doors: W.doors.map(d => ({ id: d.id, open: +d.open.toFixed(2), solid: d.col.on, locked: d.lockT > 0, unlocked: d.unlocked, opens: d.opens, speed: d.speed, secure: d.secure })),
      session: { ...SESSION.uses },
    };
  },
  get enemies() {
    if (!W) return {};
    return {
      drones: W.drones.map(e => ({ x: +e.x.toFixed(2), z: +e.z.toFixed(2), sx: +e.sx.toFixed(2), sz: +e.sz.toFixed(2), gy: e.gy, meter: +e.meter.toFixed(2), alarms: e.alarms, alarmT: +e.alarmT.toFixed(2) })),
      barriers: W.barriers.map(e => ({ id: e.id, mode: e.mode, by: +e.by.toFixed(2), bz: +e.bz.toFixed(2), hits: e.hits })),
      turrets: W.turrets.map(e => ({ state: e.state, fired: e.fired, shots: e.shots.filter(s => s.on).length })),
    };
  },
  get boss() { return boss ? { active: boss.active, phase: boss.phase, gap: +boss.gap.toFixed(2), bz: +boss.bz.toFixed(2), captures: run.captures, sweeps: boss.sweeps, sweepHits: boss.sweepHits, mines: boss.minesDropped, mineHits: boss.mineHits, sweepOn: boss.sweep.on, sweepZ: boss.sweep.z, sweepGy: boss.sweep.gy, minesOn: boss.mines.filter(m => m.on).map(m => ({ x: m.x, y: m.y, z: m.z })) } : null; },
  get ghostVisible() { return RG.group.visible; },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...game.perf, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames: game.frames }; },
  get quality() { const q = QUAL[game.quality]; return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, particles: fx.cap, skyline: W ? W.group.children.find(c => /** @type {any} */ (c).isInstancedMesh && c !== W.clockMesh)?.count : 0, far: camera.far, fogFar: /** @type {any} */ (scene.fog).far, glow: q.glow, stars: q.stars }; },
  get difficulty() { return { name: diffName(), ...diff() }; },
  get save() { return structuredClone(S()); },
  get session() { return structuredClone(SESSION); },
};
if (DEBUG) {
  /** @type {any} */ (hook).debug = {
    goto(id) { startRun(id); if (state === 'intro') { ui.hideTitle(); beginCountdown(); } run.stateT = 99; update(1 / 60); },
    simulate(sec) { game.simulate(sec); },
    teleport(x, y, z, yaw) { P.reset(x, y, z, yaw ?? Math.PI); cam.tx = x; cam.ty = y + 1.4; cam.tz = z; if (yaw !== undefined) cam.yaw = yaw + Math.PI; },
    place(x, y, z) { const b = P.body.pos; b.x = x; b.y = y; b.z = z; },
    /** pasos de simulación sin dibujar, anotando los modos del corredor; se detiene si z baja de zStop */
    trace(sec, zStop = -Infinity) {
      const modes = new Set(), n = Math.round(sec * 60); let minY = Infinity, maxY = -Infinity, steps = 0;
      for (let i = 0; i < n; i++) { update(1 / 60); steps++; modes.add(P.mode); minY = Math.min(minY, P.body.pos.y); maxY = Math.max(maxY, P.body.pos.y); if (P.body.pos.z <= zStop) break; }
      game.draw(1);
      return { modes: [...modes], minY, maxY, steps, p: { x: P.body.pos.x, y: P.body.pos.y, z: P.body.pos.z, mode: P.mode, h: P.body.h, vy: P.body.vel.y, speed: P.speed } };
    },
    setVel(x, y, z) { P.body.vel.x = x; P.body.vel.y = y; P.body.vel.z = z; },
    setMode(m) { P.mode = m; dbgFreeze = m === 'slide'; if (m === 'slide') P.body.h = PHYS.slideH; else P.body.h = PHYS.standH; },
    setTime(t) { run.clock = t; },
    reachCp(i) { const cp = W.cps[i]; if (cp && !cp.reached) reachCp(cp); },
    finish() { const g = W.goal; P.reset(g.x, g.y + 0.05, g.z, Math.PI); },
    unlockAll() { const s = S(); s.unlocked = COURSES.length; persist(); },
    complete(ids) { const s = S(); for (const id of ids) s.done[id] = true; sanitize(); persist(); },
    bossPhase(n) { if (boss) boss.setPhase(n); },
    bossCapture() { if (boss) capture(); },
    bossSweepNow() { if (boss) boss.atkT = 0; },
    alarm() { if (W.drones[0]) ctx.alarm(W.drones[0]); },
    hit(kind) { P.inv = 0; ctx.hit(kind || 'barrier', 0, 1, 4); },
    fall() { P.body.pos.y = W.killY - 1; },
    combo(n) { const ks = Object.keys(MOVE_NAMES); for (let i = 0; i < n; i++) ctx.move(ks[i % ks.length]); },
    clocksAll() { for (const c of W.clocks) { if (!c.taken) { P.reset(c.x, c.y - 0.9, c.z, P.face); playChecks(0, null); } } },
    pathOf(name) { return W[name]; },
    stopLoop() { game.stop(); },
    autopilot(route) { bot = route ? { route, i: 0, hold: 0 } : null; },
    get botIndex() { return bot ? bot.i : -1; },
  };
}
Wn['__' + GAME_ID] = Object.freeze(hook);

/* ======================= arranque ======================= */
applySkin();
showMenu();
applyQuality();
game.start();
