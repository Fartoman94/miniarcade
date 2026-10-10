// @ts-check
/* Mareas Profundas — juego principal: estados, minisubmarino, recursos (energía, casco, O₂, presión), sonar, escaneo,
   fotos, interacciones, zonas, Leviatán, misiones, guardado, menús, tutorial y gancho de pruebas. */
import { createGame, createInput, createSave, screen, toast, clamp, THREE } from '../../matelabs/kit3d.js';
import { GAME_ID, TITLE, ACCENT, DIFF, QUAL, ZONES, RATING, SPECIES, MISSIONS, SAVE_VERSION, SAVE_DEFAULTS, BIND_NAMES, PAD_KEYS, keyLabel } from './config.js';
import { createMaterials, makeSub, blackBoxGeo, capsuleGeo } from './models.js';
import { collide, hit, freeFrac } from './physics.js';
import { BUILDERS } from './world.js';
import { createBoss } from './boss.js';
import { createFx, setCausticsDefine, CAUSTIC_U } from './fx.js';
import { createSfx } from './sfx.js';
import { createUI, esc } from './ui.js';

const W = /** @type {any} */ (window);
const A = W.MLArcade, M = W.MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const ROMAN = ['', 'I', 'II', 'III'];

/* ======================= guardado ======================= */
const save = createSave(GAME_ID + ':save', SAVE_VERSION, structuredClone(SAVE_DEFAULTS), old => old || {});
/** Repara datos con forma inválida (guardado viejo, editado o a medias): nunca bloquea la partida. */
function sanitize() {
  const s = /** @type {any} */ (save.get()), D = /** @type {any} */ (SAVE_DEFAULTS);
  for (const k in D) {
    const dv = D[k], v = s[k];
    if (Array.isArray(dv)) s[k] = Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
    else if (dv && typeof dv === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (typeof v !== typeof dv) s[k] = dv;
  }
  for (const k in s) if (!(k in D) && k !== 'ascended') delete s[k];
  s.ascended = !!s.ascended;
  if (![1, 2, 3].includes(s.zone)) { s.zone = 1; s.cp = 'start'; }
  if (typeof s.cp !== 'string' || !['start', 'entry', 'module', 'ascent', 'trench', 'arena'].includes(s.cp)) s.cp = s.zone === 1 ? 'start' : 'entry';
  if (!['wreck', 'carried', 'delivered'].includes(s.blackbox)) s.blackbox = 'wreck';
  if (!['alley', 'carried', 'delivered'].includes(s.capsule)) s.capsule = 'alley';
  if (s.blackbox === 'carried') s.blackbox = 'wreck';
  if (s.capsule === 'carried') s.capsule = 'alley';
  for (const k of ['modules', 'probes', 'doors']) { const o = {}; for (const id in s[k]) if (s[k][id] === true) o[id] = true; s[k] = o; }
  const deb = {}; for (const id in s.debris) { const v = +s.debris[id]; if (isFinite(v)) deb[id] = clamp(v, -6, 6); } s.debris = deb;
  s.scanned = [...new Set(s.scanned.filter(x => x in SPECIES))];
  s.photos = [...new Set(s.photos.filter(x => x in SPECIES))];
  if (![0, 1, 2, 3].includes(s.bossPhase)) s.bossPhase = 0;
  if (!isFinite(s.wins) || s.wins < 0) s.wins = 0;
  s.tutorial = { off: !!s.tutorial.off, seen: (s.tutorial.seen && typeof s.tutorial.seen === 'object' && !Array.isArray(s.tutorial.seen)) ? s.tutorial.seen : {} };
  const o = s.opts, dO = D.opts;
  s.opts = {
    sens: typeof o.sens === 'number' && o.sens >= 0.3 && o.sens <= 2.5 ? o.sens : 1,
    invert: !!o.invert,
    motion: ['auto', 'reduce', 'full'].includes(o.motion) ? o.motion : 'auto',
    binds: { ...dO.binds },
  };
  if (o.binds && typeof o.binds === 'object') for (const k in dO.binds) if (typeof o.binds[k] === 'string' && o.binds[k]) s.opts.binds[k] = o.binds[k];
}
sanitize(); save.flush();
const S = () => /** @type {any} */ (save.get());
const persist = () => save.flush();
let persistT = 0;
const persistSoon = () => { persistT = 0.5; };
const binds = () => S().opts.binds;

/* ======================= misiones y dificultad ======================= */
M.setup({ gameId: GAME_ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 4, hud: 'none' });
const diffName = () => /** @type {keyof typeof DIFF} */ (M.difficulty(GAME_ID));
const diff = () => DIFF[diffName()] || DIFF.normal;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => { const m = S().opts.motion; return m === 'reduce' || (m === 'auto' && reducedMQ.matches); };
const qual = () => QUAL[game.quality] || QUAL.medium;

/* ======================= juego base ======================= */
const ACTIVE = new Set(['play', 'cutscene', 'dead', 'transition']);
let state = 'menu';
const game = createGame({
  id: GAME_ID, title: TITLE, toolbar: 'tr', background: 0x0b5f80, fov: 62, far: 160,
  help: ['W/S o joystick: avanzar y retroceder · A/D: girar', 'Espacio / Shift: subir y bajar', 'E: usar (sondas, válvulas, carga, módulos) · mantener E apuntando a una especie: escanear',
    'Q: pulso de sonar · C: foto · L: encender/apagar los focos', 'Arrastrar el mouse o el dedo: mirar alrededor', 'Las teclas se cambian en «Controles y accesibilidad»', 'Esc, P o Start: pausa'],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: PAD_KEYS.use, b: PAD_KEYS.sonar, x: PAD_KEYS.photo, y: PAD_KEYS.light, rb: PAD_KEYS.up, lb: PAD_KEYS.down },
  isActive: () => ACTIVE.has(state),
  update, onRestart, onQuality: () => applyQuality(),
  actions: [
    { label: '📖 Cómo jugar y tutorial', fn: () => openHelp(true) },
    { label: '⚙ Controles y accesibilidad', fn: () => openOptions(true) },
    { label: '⚓ Volver al menú del barco', fn: exitToMenu },
  ],
});
const { scene, camera, renderer } = game;
scene.fog = new THREE.FogExp2(0x0b5f80, 0.02);
const mats = createMaterials();
const hemi = new THREE.HemisphereLight(0x9fe6ff, 0x1a4a5a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xcff6ff, 1.5); sun.position.set(10, 40, 8); scene.add(sun, sun.target);
const fx = createFx(scene, camera, reduced);
const sfx = createSfx(game.audio, () => !game.paused);
const ui = createUI();

/* ======================= submarino ======================= */
const SUB = makeSub(mats);
scene.add(SUB.group);
SUB.body.castShadow = true;
const spot = new THREE.SpotLight(0xfff0cc, 70, 46, 0.52, 0.55, 1.2);
spot.position.set(0, -0.3, 1.2); SUB.group.add(spot);
const spotTarget = new THREE.Object3D(); spotTarget.position.set(0, -2.5, 12); SUB.group.add(spotTarget); spot.target = spotTarget;
spot.shadow.mapSize.set(512, 512); spot.shadow.bias = -0.002;
const fill = new THREE.PointLight(0xffd8a0, 3, 7, 1.5); fill.position.set(0, 1.5, 0); SUB.group.add(fill);
const cargoMeshes = { blackbox: new THREE.Mesh(blackBoxGeo(), mats.world), capsule: new THREE.Mesh(capsuleGeo(), mats.world) };
for (const k in cargoMeshes) { const m = /** @type {any} */ (cargoMeshes)[k]; m.visible = false; SUB.hook.add(m); }
const RAD = 0.95;
const P = {
  pos: SUB.group.position, vel: new THREE.Vector3(), yaw: Math.PI, roll: 0, pitch: 0,
  energy: 100, hull: 100, o2: 100, light: true, alive: false, inv: 0, hook: SUB.hook,
  /** @type {any} */ docked: null, dockT: 0, carrying: /** @type {string|null} */ (null),
  sonarCd: 0, photoCd: 0, scanK: 0, /** @type {any} */ scanTarget: null, thrust: 0, vert: 0, prop: 0,
  get vulnerable() { return state === 'play' && P.inv <= 0 && P.alive && !P.docked; },
};
let input = createInput(game.root, {
  joystick: 'left', look: true,
  buttons: [{ id: 'sonar', label: 'SONAR' }, { id: 'use', label: 'USAR' }, { id: 'down', label: 'BAJAR' }, { id: 'light', label: 'LUZ' }, { id: 'photo', label: 'FOTO' }, { id: 'up', label: 'SUBIR' }],
});
if (input.isTouch) document.body.classList.add('mp-touch');
input.showTouch(false);
const btnEl = id => /** @type {HTMLElement|null} */ (document.querySelector(`.k3-btn[aria-label="${id}"]`));
const useBtn = btnEl('use'), sonarBtn = btnEl('sonar'), lightBtn = btnEl('light');

/* ======================= partida ======================= */
const run = { score: 0, time: 0, deadT: 0, transT: 0, transTo: 1, transSpawn: '', crashes: 0, hurts: 0, photosRun: 0, victT: 0, why: '', lastDepthWarn: 0, inkT: 0, dark: 0, darkWant: 0, whale: 6 };
/** @type {any} */ let level = null;
/** @type {any} */ let boss = null;
/** @type {any} */ let cur = null;
/** @type {any} */ let cut = null;
let tipId = '', tipT = 0, moved = 0, cutSkip = false;
const cam = { yaw: 0, pitch: 0.28, lookYaw: 0, lookPitch: 0, idle: 0, menuA: 0, dist: 8, pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
const emit = (ev, v) => M.emit(ev, v);
function addScore(n) { run.score += Math.round(n); }
const limit = () => S().modules.city ? RATING.city : S().modules.reef ? RATING.reef : RATING.base;
const depth = () => (level ? ZONES[level.n].base : 0) - P.pos.y;
const fwd = new THREE.Vector3();

/** Contexto que usan zonas, criaturas y jefe. */
const ctx = {
  THREE, scene, mats, S, persist, persistSoon, diff, reduced, sfx, fx, emit, qual,
  get player() { return P; },
  get world() { return level.world; },
  hurt, carrying: () => P.carrying,
  ink(sec) { if (reduced()) { ui.ink(true); run.inkT = sec * 0.6; } else { ui.ink(true); run.inkT = sec; } tip('octo'); },
  dock, travel, grab,
  takeCell(id, x, y, z) {
    const s = S(); if (s.cells.includes(id)) return; s.cells.push(id); persist();
    P.energy = Math.min(100, P.energy + diff().cells); addScore(50); sfx.cell(); fx.sparks(x, y, z, 18, 0x9dffb0, 4, 0.2, 0.5);
    toast(`🔋 Célula de energía +${diff().cells}%`, 1300); emit('cell');
  },
  activateProbe(id, x, y, z) {
    const s = S(); if (s.probes[id]) return; s.probes[id] = true; persist();
    sfx.probe(); fx.sparks(x, y, z, 24, 0x4ff7e6, 5, 0.22, 0.7); fx.bubbles(x, y - 1, z, 14, 1.5, 0.2);
    const n = ['p1', 'p2', 'p3'].filter(k => s.probes[k]).length;
    addScore(150); emit('probe');
    toast(n < 3 ? `📡 Sonda científica activa (${n}/3)` : '📡 ¡Las 3 sondas triangularon la puerta acuática! Ya se abre', 2600);
    if (n === 3) { sfx.gate(); setTimeout(() => level && level.n === 1 && tip('gate'), 900); }
  },
  debrisCleared(id) { addScore(120); emit('debris'); toast(id === 'ruina' ? '🪨 Despejaste la entrada de una cámara de piedra…' : '🪨 Despejaste el panel de la puerta hidráulica', 2200); sfx.secret(); },
  openDoor(id) { const s = S(); if (s.doors[id]) return; s.doors[id] = true; persist(); sfx.door(); addScore(150); emit('door'); toast('⚙ Puerta hidráulica abierta', 1800); fx.shake(0.15); },
  findRuin() {
    const s = S(); if (s.ruin) return; s.ruin = true; persist();
    emit('ruin'); addScore(400); sfx.secret(); toast('🏛 ¡Encontraste la ruina oculta! Un altar más viejo que la ciudad', 2800);
    ui.title('RUINA OCULTA', 'DESCUBRIMIENTO');
  },
  startBoss, onBossPhase, onBossHit() { fx.shake(0.4); },
  onValve(n) { addScore(250); toast(`🔧 Válvula cerrada (${n}/3)`, 1500); emit('valve'); },
  onRod(kind, n, need) { if (kind === 'grab') { toast('Barra de control enganchada: llevala a la consola del faro', 2000); P.carrying = 'rod'; } else { P.carrying = null; addScore(300); toast(`⚛ Barra insertada (${n}/${need})`, 1600); emit('rod'); } },
  onPhaseClear(n) { sfx.roar(); fx.shake(0.5); ui.title(n < 3 ? `FASE ${n} SUPERADA` : 'REACTOR APAGADO', 'LEVIATÁN ABISAL'); addScore(500); },
  onReactorOff() { sfx.victory(); toast('El reactor se apagó: el Leviatán se calma y vuelve a la oscuridad', 3000); },
  onBossDone,
  onLightLure() { tip('boss2light'); },
  onWaveTell(b) { if (!reduced()) fx.shake(0.12); toast(b === 'alta' ? '⚠ Onda en la banda ALTA: ¡bajá!' : '⚠ Onda en la banda BAJA: ¡subí!', 1300); },
  setDark(k) { run.darkWant = k; },
  flickerBeacon() { if (level && level.beacon) level.beacon.flicker = 2.5; },
};

/* ======================= tutorial contextual ======================= */
const K = id => input.isTouch ? ({ up: 'SUBIR', down: 'BAJAR', sonar: 'SONAR', use: 'USAR', photo: 'FOTO', light: 'LUZ' })[id] : keyLabel(binds()[id]);
const TIPS = {
  move: () => input.isTouch ? 'Avanzá y girá con el <b>joystick</b>. <b>SUBIR</b> y <b>BAJAR</b> cambian la profundidad. Arrastrá la pantalla para mirar.' : `<b>W/S</b> avanzar y retroceder, <b>A/D</b> girar, <b>${K('up')}</b>/<b>${K('down')}</b> subir y bajar. Arrastrá el mouse para mirar.`,
  module: () => `Acoplá en el <b>módulo de buceo</b> con <b>${K('use')}</b>: recarga energía y O₂, repara el casco, guarda tu avance y <b>sube el límite de presión</b>.`,
  probe: () => `Activá las <b>3 sondas científicas</b> con <b>${K('use')}</b>: triangulan la <b>puerta acuática</b> hacia la Ciudad.`,
  sonar: () => `<b>${K('sonar')}</b> lanza un <b>pulso de sonar</b>: los ecos marcan sondas, células, criaturas y objetivos en el radar. Cuesta energía.`,
  scan: () => `Mantené <b>${K('use')}</b> con una especie en la mira para <b>escanearla</b>. Cada especie nueva suma a la misión de fauna.`,
  photo: () => `<b>${K('photo')}</b> saca una <b>foto</b> de las especies en cuadro. El flash ahuyenta a algunos depredadores…`,
  jelly: () => `La <b>medusa eléctrica</b> brilla antes de descargar: alejate. <b>Tu luz las atrae</b> (<b>${K('light')}</b> apaga los focos).`,
  light: () => `<b>${K('light')}</b> apaga los focos: ahorrás energía y los drones te ven desde menos distancia, pero ves menos.`,
  drone: () => `¡Un <b>dron</b> te detectó! Cortá la línea de visión tras un edificio o <b>aturdilo con el sonar</b>.`,
  eel: () => `La <b>anguila</b> avisa con los ojos rojos antes de embestir en línea recta. Un <b>pulso de sonar</b> la espanta un rato.`,
  debris: () => 'Los <b>escombros</b> se empujan con el casco: avanzá contra ellos y seguí empujando de costado.',
  cargo: () => `Llevá la carga al <b>módulo de buceo</b> y acoplá con <b>${K('use')}</b> para entregarla.`,
  capsule: () => 'Misión: llevá la cápsula <b>sin chocar</b> contra nada. Despacio por el callejón de columnas.',
  pressure: () => 'Superaste el <b>límite de presión</b>: el casco cruje y se daña. Acoplá en un módulo para reforzarlo.',
  octo: () => `Territorio del <b>pulpo</b>: marca un círculo rojo antes de golpear y suelta tinta. <b>${K('photo')}</b> lo ahuyenta con el flash.`,
  gate: () => `La <b>puerta acuática</b> está abierta: ubicate sobre ella y apretá <b>${K('use')}</b> para descender.`,
  boss1: () => 'El Leviatán marca un <b>carril rojo</b> antes de embestir: salí del carril. Mientras tanto, <b>cerrá las 3 válvulas</b> de los pilares (quedate cerca).',
  boss2: () => `Todo quedó a oscuras: el Leviatán <b>caza por sonido y luz</b>. Un <b>pulso de sonar</b> revela las barras pero atrae su mordida: hacé ping, <b>alejate</b>, después recogé las barras y llevalas a la consola. Apagá la luz (<b>${K('light')}</b>).`,
  boss2light: () => `¡Tu <b>luz</b> lo atrae! Apagala con <b>${K('light')}</b> y alejate del círculo rojo.`,
  boss3: () => `Iniciá el apagado en la <b>consola</b> y quedate cerca. Las ondas de cola barren una <b>banda de profundidad</b>: cambiá de altura con <b>${K('up')}</b>/<b>${K('down')}</b>.`,
  ascend: () => 'El faro abrió una <b>corriente ascendente</b> junto al faro: entrá y volvé a la superficie, junto al barco.',
};
function tip(id) {
  const t = S().tutorial;
  if (t.off || t.seen[id] || tipId === id || state === 'menu') return;
  t.seen[id] = true; persist();
  tipId = id; tipT = 14;
  ui.tip(TIPS[id](), a => { if (a === 'skip') { S().tutorial.off = true; persist(); toast('Tutorial desactivado (lo podés reactivar desde «Cómo jugar»)', 2200); } closeTip(); });
  emit('tutorial');
}
function closeTip() { tipId = ''; ui.tip(null); }

/* ======================= zonas ======================= */
function loadZone(n, spawnKey, silent = false) {
  if (level) level.dispose();
  fx.clear(); cur = null; boss = null; P.docked = null;
  level = BUILDERS[n](ctx);
  if (n === 3) {
    boss = createBoss(level, ctx);
    level.boss = boss;
    level.ents.push(boss.ent);
    level.inters.push(...boss.inters);
    const C = level.console;
    level.inters.push({ id: 'console:beacon', kind: 'console', x: C.x, y: C.y, z: C.z, r: 6, can: () => !S().beacon && !boss.active, label: () => 'Encender el faro de la fosa', use: () => startBoss() });
  }
  applyEnv();
  const s = S(); s.zone = n; if (spawnKey) s.cp = spawnKey; persist();
  placeAtSpawn();
  applyQuality();
  if (!silent) { ui.title(ZONES[n].name, ROMAN[n] + ' · ZONA'); emit('zone', n); }
  if (n === 3 && !silent && s.bossPhase > 0 && !s.beacon && state !== 'menu') resumeBoss(s.bossPhase);
}
function applyEnv() {
  const e = level.env;
  /** @type {THREE.Color} */ (scene.background).setHex(e.bg); /** @type {any} */ (scene.fog).color.setHex(e.fog);
  hemi.color.setHex(e.sky); hemi.groundColor.setHex(e.ground);
  sun.color.setHex(e.sun);
  fx.setSnowColor(e.snow);
  CAUSTIC_U.uTop.value = e.top; CAUSTIC_U.uCaus.value = e.caus;
  run.dark = run.darkWant = 0;
}
function placeAtSpawn() {
  const s = S();
  let sp = level.spawns[s.cp];
  if (!sp) { sp = level.spawns.entry || level.spawns.start; s.cp = level.spawns.entry ? 'entry' : 'start'; }
  P.pos.set(sp.x, sp.y, sp.z); P.vel.set(0, 0, 0); P.yaw = sp.yaw;
  cam.yaw = P.yaw; cam.lookYaw = cam.lookPitch = 0;
  fwd.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  cam.pos.set(P.pos.x - fwd.x * 8, P.pos.y + 2.5, P.pos.z - fwd.z * 8); cam.tgt.copy(P.pos);
}
function applyQuality() {
  const q = qual();
  fx.setSnow(q.snow);
  fx.setPixelRatio(renderer.getPixelRatio());
  camera.far = q.far; camera.updateProjectionMatrix();
  for (const m of [mats.world, mats.coral, mats.surface]) setCausticsDefine(m, q.caustics && !!level && level.env.caus > 0);
  spot.castShadow = game.quality === 'high';
  if (level) { level.applyQuality(q); fx.setRays(level.env.rays > 0 ? q.rays : 0, level.env.top, level.env.rays); }
  fogTick(0);
}
function fogTick(dt) {
  if (!level) return;
  run.dark += (run.darkWant - run.dark) * Math.min(1, dt * 1.2);
  const e = level.env, q = qual();
  /** @type {any} */ (scene.fog).density = e.density * q.fogMul * (1 + run.dark * 0.6);
  hemi.intensity = e.hemi * (1 - run.dark * 0.75);
  sun.intensity = e.sunI * (1 - run.dark * 0.9);
  ui.dark(run.dark * 0.8);
}

/* ======================= ciclo de partida ======================= */
function startRun(fresh) {
  if (fresh) {
    const keep = { opts: S().opts, tutorial: S().tutorial, wins: S().wins };
    save.reset(); Object.assign(save.get(), structuredClone(keep)); sanitize(); persist();
    emit('newGame');
  }
  const s = S(); s.started = true;
  if (s.blackbox === 'carried') s.blackbox = 'wreck';
  if (s.capsule === 'carried') s.capsule = 'alley';
  persist();
  run.score = 0; run.time = 0; run.crashes = 0; run.hurts = 0; run.photosRun = 0; run.inkT = 0; run.why = '';
  P.energy = 100; P.hull = 100; P.o2 = 100; P.inv = 1; P.alive = true; P.light = true; P.carrying = null; P.docked = null;
  P.sonarCd = 0; P.photoCd = 0; P.scanK = 0;
  cut = null; closeTip(); ui.ink(false);
  state = 'play';
  menu.hide(); endScreen.hide(); helpScreen.hide(); optScreen.hide();
  loadZone(s.zone, s.cp);
  ui.show(true); input.showTouch(true); input.clear();
  M.runStart();
  if (s.scanned.length) emit('scan', s.scanned.length);
  if (s.blackbox === 'delivered') emit('blackbox');
  if (s.beacon) emit('faro');
  if (s.photos.length) emit('photo', s.photos.length);
  if (s.ruin) emit('ruin');
  if (s.capsule === 'delivered') emit('capsule');
  A.started();
  moved = 0;
  setTimeout(() => tip('move'), 400);
}
function endRun(won) { M.runEnd({ won }); A.ended({ score: run.score }); }
function onRestart() {
  if (state === 'menu') return;
  endRun(false);
  startRun(false);
}
function exitToMenu() {
  if (ACTIVE.has(state)) { A.pause(); A.resume(); }
  if (ACTIVE.has(state)) endRun(false);
  state = 'menu'; showMenu();
}

/** Daño de criaturas/jefe: casco, energía y empujón. */
function hurt(n, fx_, fy, fz, kind, o = {}) {
  if (!P.vulnerable) return;
  const D = diff();
  P.hull -= n * D.dmg; P.energy -= (o.energy || 0) * D.dmg; P.inv = 0.9; run.hurts++;
  const dx = P.pos.x - fx_, dy = P.pos.y - fy, dz = P.pos.z - fz, l = Math.hypot(dx, dy, dz) || 1, k = o.knock ?? 6;
  P.vel.x += dx / l * k; P.vel.y += dy / l * k * 0.6; P.vel.z += dz / l * k;
  if (!reduced()) ui.hurt();
  fx.shake(0.35); sfx.hurt(); emit('hurt', 1); emit('hurt_' + kind);
  if (P.carrying === 'capsule') { emit('capsuleCrash'); toast('💥 ¡La cápsula se golpeó!', 1500); }
  fx.sparks(P.pos.x, P.pos.y, P.pos.z, 14, 0xffd27a, 4, 0.18, 0.4);
  checkDeath(kind);
}
function checkDeath(kind) {
  if (state !== 'play') return;
  if (P.hull <= 0) die('hull', kind);
  else if (P.energy <= 0) die('energy', kind);
}
function die(why, kind) {
  if (state !== 'play') return;
  P.alive = false; P.hull = Math.max(0, P.hull); P.energy = Math.max(0, P.energy);
  state = 'dead'; run.deadT = 1.8; run.why = why;
  sfx.explode(); emit('death');
  fx.bubbles(P.pos.x, P.pos.y, P.pos.z, 40, 2.5, 0.3); fx.sparks(P.pos.x, P.pos.y, P.pos.z, 30, 0xffb547, 6, 0.3, 0.8);
  toast(why === 'hull' ? '💥 El casco cedió' : '🔋 Te quedaste sin energía', 2000);
  void kind;
}
/** Retoma el combate en la fase guardada (tras una derrota no hay que repetir lo ya superado). */
function resumeBoss(phase) {
  if (!boss) return;
  const sp = level.spawns.arena; P.pos.set(sp.x, sp.y, sp.z); P.yaw = sp.yaw;
  boss.start(); boss.sub = 'fight'; boss.startPhase(phase);
  state = 'play';
}
const _cl = new THREE.Vector3(0, -80, 0);
function startBoss() {
  if (state !== 'play' || !boss || boss.active) return;
  state = 'cutscene'; cutSkip = false; closeTip();
  boss.start(); ctx.flickerBeacon();
  ui.title('LEVIATÁN ABISAL', 'EL FARO DESPERTÓ ALGO');
  sfx.roar(); setTimeout(() => sfx.roar(), 1500);
  emit('bossStart');
  cut = {
    t: 0, dur: reduced() ? 2.6 : 5.2,
    step(dt) {
      boss.intro(dt * (reduced() ? 1.8 : 1));
      const k = Math.min(1, cut.t / cut.dur), h = boss.headPos;
      camera.position.set(Math.sin(0.4 + k * 0.5) * 30, -90 + k * 4, Math.cos(0.4 + k * 0.5) * 30);
      _cl.lerp(h, Math.min(1, dt * 3)); camera.lookAt(_cl);
      if (k > 0.4) fx.shake(0.05);
    },
    end() { boss.sub = 'fight'; boss.startPhase(1); state = 'play'; },
  };
}
function onBossPhase(n) {
  tip('boss' + n);
  ui.title(n === 1 ? 'FASE 1 · EMBESTIDAS' : n === 2 ? 'FASE 2 · CAZA A CIEGAS' : 'FASE 3 · APAGADO DEL REACTOR', 'LEVIATÁN ABISAL');
  toast(n === 1 ? 'Esquivá los carriles rojos y cerrá las 3 válvulas' : n === 2 ? 'Oscuridad total: el sonar revela las barras… y atrae al Leviatán' : 'Iniciá el apagado en la consola y esquivá las ondas cambiando de altura', 3200);
  emit('bossPhase', n);
}
function onBossDone() {
  const s = S(); s.beacon = true; s.bossPhase = 0; persist();
  run.darkWant = 0;
  emit('faro'); addScore(2000);
  ui.title('FARO DE LA FOSA ENCENDIDO', 'RECOMPENSA: CORRIENTE ASCENDENTE');
  toast('🌟 ¡El faro ilumina la fosa! Entrá en la corriente ascendente para volver', 3200);
  setTimeout(() => tip('ascend'), 1500);
}
function victory() {
  state = 'victory'; P.alive = false; ui.hideTitle();
  input.showTouch(false); ui.show(false); ui.ink(false);
  const s = S();
  const bat = Math.round(P.energy);
  addScore(3000 + bat * 20 + Math.round(P.hull) * 10);
  emit('exitBattery', bat);
  s.wins++; s.ascended = false; s.zone = 1; s.cp = 'start'; persist();
  const best = A.scores.best(GAME_ID);
  endRun(true);
  const rec = run.score >= best;
  sfx.victory();
  endScreen.show(`<span class="k3-kicker">EXPEDICIÓN CUMPLIDA</span><h1>¡VICTORIA!</h1>
    <p>El faro de la fosa vuelve a brillar y el minisubmarino emerge junto al barco. La tripulación aplaude desde cubierta.</p>
    <div class="mp-menu-prog">Puntos: <b>${run.score}</b>${rec ? ' · ¡NUEVO RÉCORD!' : ` · Récord: ${Math.max(best, run.score)}`}<br>Tiempo: ${fmtTime(run.time)} · Batería al salir: ${bat}% · Casco: ${Math.round(P.hull)}%<br>Especies escaneadas: ${s.scanned.length} · Fotografiadas: ${s.photos.length} · Ruina: ${s.ruin ? 'sí' : 'no'}</div>
    <p class="mp-small">Recompensa: casco dorado para tu submarino y el mar abierto para seguir explorando.</p>
    <div class="k3-btnrow"><button class="k3-b" data-menu>⚓ Menú del barco</button><button class="k3-b alt" data-new>Nueva expedición</button></div>`);
}
function defeat() {
  state = 'defeat'; P.alive = false; ui.hideTitle();
  input.showTouch(false); ui.show(false); ui.ink(false);
  const s = S();
  if (P.carrying === 'blackbox') s.blackbox = 'wreck';
  if (P.carrying === 'capsule') s.capsule = 'alley';
  P.carrying = null; persist();
  endRun(false);
  endScreen.show(`<span class="k3-kicker">${run.why === 'hull' ? 'EL CASCO CEDIÓ' : 'SIN ENERGÍA'}</span><h1>DERROTA</h1>
    <p>${run.why === 'hull' ? 'La presión y los golpes vencieron al casco.' : 'La batería llegó a cero y el submarino quedó a la deriva.'} Tus sondas, puertas, descubrimientos y módulos siguen guardados.</p>
    <div class="mp-menu-prog">Puntos de esta inmersión: <b>${run.score}</b> · Tiempo: ${fmtTime(run.time)}</div>
    <div class="k3-btnrow"><button class="k3-b" data-retry>↻ Reintentar desde el último punto</button><button class="k3-b alt" data-menu>⚓ Menú</button></div>`);
}
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

/* ======================= acciones ======================= */
function dock(Mo) {
  if (P.docked || state !== 'play') return;
  P.docked = Mo; P.dockT = 0; P.vel.set(0, 0, 0);
  const s = S(), first = !s.modules[Mo.id];
  s.modules[Mo.id] = true; s.zone = level.n; s.cp = 'module'; persist();
  sfx.dock(); emit('dock');
  if (first) { addScore(100); toast(`⚓ Módulo acoplado · límite de presión: ${limit()} m · punto de control`, 2600); }
  else toast('⚓ Acoplado: recargando y reparando', 1500);
  if (P.carrying === 'blackbox' || P.carrying === 'capsule') deliver(P.carrying);
}
function undock() { if (!P.docked) return; P.docked = null; P.inv = 0.5; sfx.undock(); P.vel.y = 2; }
function deliver(kind) {
  const s = S();
  if (kind === 'blackbox') { s.blackbox = 'delivered'; emit('blackbox'); addScore(800); toast('📦 ¡Caja negra recuperada! El código abre la puerta de la Fosa', 3000); }
  else { s.capsule = 'delivered'; emit('capsule'); addScore(500); toast('🛟 ¡Cápsula de escape entregada!', 2400); }
  P.carrying = null; persist(); sfx.deliver();
}
function grab(kind) {
  if (P.carrying) return;
  const s = S();
  if (kind === 'blackbox') s.blackbox = 'carried'; else s.capsule = 'carried';
  P.carrying = kind; persist(); sfx.grab(); emit('grab_' + kind);
  toast(kind === 'blackbox' ? '📦 Caja negra enganchada: llevala al módulo de buceo' : '🛟 Cápsula enganchada: ¡sin chocar hasta el módulo!', 2400);
  tip(kind === 'capsule' ? 'capsule' : 'cargo');
}
function travel(to, spawn) {
  if (state !== 'play') return;
  if (P.carrying === 'blackbox' || P.carrying === 'capsule') { toast('Entregá la carga en el módulo antes de cambiar de zona', 1800); sfx.denied(); return; }
  state = 'transition'; run.transT = 0.55; run.transTo = to; run.transSpawn = spawn; ui.fade(true); sfx.gate();
}
function ascend() {
  if (state !== 'play') return;
  S().ascended = true; persist();
  emit('ascend'); travel(1, 'ascent');
}
/** @type {any} */ (ctx).ascend = ascend;
function sonar() {
  const D = diff();
  if (P.sonarCd > 0) { sfx.denied(); return; }
  if (P.energy <= D.sonarCost + 0.5) { sfx.denied(); toast('Energía insuficiente para el sonar', 1200); return; }
  P.sonarCd = 1.5; P.energy -= D.sonarCost;
  fx.pulse(P.pos.x, P.pos.y, P.pos.z, 48); sfx.ping(); emit('sonar');
  pings.length = 0; pingI = 0;
  const px = P.pos.x, py = P.pos.y, pz = P.pos.z;
  for (const t of level.targets) { if (t.alive && !t.alive()) continue; const d = Math.hypot(t.x - px, t.y - py, t.z - pz); if (d < 48) pings.push({ d, t, e: null }); }
  for (const e of level.ents) { if (e.kind === 'leviathan' && !(boss && boss.active)) continue; const d = e.pos.distanceTo(P.pos); if (d < 48) pings.push({ d, t: null, e }); }
  pings.sort((a, b) => a.d - b.d);
  if (boss && boss.active) boss.sonar(px, py, pz);
  tip('sonar');
}
/** @type {{d:number,t:any,e:any}[]} */ const pings = []; let pingI = 0;
const BLIPS = Array.from({ length: 48 }, () => ({ x: 0, z: 0, color: '#4ff7e6', a: 0, t: 0 })); let blipI = 0;
function blip(x, z, color, dur = 5) { const b = BLIPS[blipI]; blipI = (blipI + 1) % BLIPS.length; b.x = x; b.z = z; b.color = color; b.t = dur; b.a = 1; }
const HEX = c => '#' + c.toString(16).padStart(6, '0');
function pingStep() {
  const r = fx.pulseR;
  if (r < 0) { pingI = pings.length; return; }
  while (pingI < pings.length && pings[pingI].d <= r) {
    const p = pings[pingI++];
    if (p.t) { fx.mark(p.t.follow || p.t, p.t.color, 5); blip(p.t.x, p.t.z, HEX(p.t.color)); }
    else {
      const e = p.e, hostile = ['jelly', 'eel', 'drone', 'octopus', 'leviathan', 'angler'].includes(e.kind);
      const color = hostile ? 0xff5a4a : 0x4ff7e6;
      fx.mark(e.pos, color, 4, e); blip(e.pos.x, e.pos.z, HEX(color), 4);
      if (e.sonar && e.sonar(P.pos.x, P.pos.y, P.pos.z)) { emit('sonarStun'); if (e.kind === 'drone') toast('📡 ¡Dron aturdido!', 1000); if (e.kind === 'eel') toast('📡 La anguila se escondió', 1000); }
    }
    sfx.echo();
  }
}
const _ndc = new THREE.Vector3();
function photo() {
  if (P.photoCd > 0) return;
  P.photoCd = 1.2; P.energy -= 1;
  ui.flash(reduced()); sfx.photo(); emit('photoShot');
  fwd.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  fx.sparks(P.pos.x + fwd.x * 1.4, P.pos.y, P.pos.z + fwd.z * 1.4, 10, 0xffffff, 6, 0.3, 0.25);
  const s = S(); const got = [];
  for (const e of level.ents) {
    const d = e.pos.distanceTo(P.pos);
    if (e.flash && d < 20 && e.flash(P.pos.x, P.pos.y, P.pos.z)) { emit('flashScare'); if (e.kind === 'octopus') toast('📸 ¡El flash ahuyentó al pulpo!', 1500); }
    if (!e.species || !e.scannable || d > 24 + (e.size || 1)) continue;
    _ndc.copy(e.pos).project(camera);
    if (_ndc.z > 1 || Math.abs(_ndc.x) > 0.95 || Math.abs(_ndc.y) > 0.95) continue;
    if (!s.photos.includes(e.species) && !got.includes(e.species)) got.push(e.species);
  }
  if (got.length) {
    for (const sp of got) { s.photos.push(sp); emit('photo'); addScore(150); }
    persist();
    toast(`📷 ${got.map(g => /** @type {any} */ (SPECIES)[g]).join(', ')} · ${s.photos.length}/${Object.keys(SPECIES).length} especies fotografiadas`, 2200);
  } else toast('📷 Foto sin especies nuevas en cuadro', 1000);
}

/* ======================= actualización ======================= */
const prevVel = new THREE.Vector3();
let frozen = false, simulating = false;
function update(dt) {
  if (frozen && !simulating) { input.takeLook(); return; }
  if (state === 'menu' || state === 'victory' || state === 'defeat') {
    menuCamera(dt);
    if (level) level.update(dt, ctx);
    fx.update(dt, camera.position);
    SUB.group.visible = state !== 'menu';
    input.takeLook(); input.endStep();
    return;
  }
  SUB.group.visible = state !== 'dead' || run.deadT > 1.2;
  P.inv -= dt; P.sonarCd -= dt; P.photoCd -= dt;
  if (persistT > 0) { persistT -= dt; if (persistT <= 0) persist(); }
  if (run.inkT > 0) { run.inkT -= dt; if (run.inkT <= 0) ui.ink(false); }
  if (state === 'play') { run.time += dt; control(dt); }
  else if (state === 'dead') { run.deadT -= dt; P.vel.y -= dt * 2; P.pos.addScaledVector(P.vel, dt); if (run.deadT <= 0) defeat(); }
  else if (state === 'transition') {
    run.transT -= dt;
    if (run.transT <= 0) { loadZone(run.transTo, run.transSpawn); state = 'play'; ui.fade(false); if (run.transTo === 1 && S().ascended) { toast('🌊 ¡Volviste a los Arrecifes! Subí hasta el barco', 2600); } }
  } else if (state === 'cutscene' && cut) {
    if (input.hit('Space', 'Enter', binds().use, PAD_KEYS.use, 'btn:use') || cutSkip) { cut.t = cut.dur; cutSkip = false; }
    cut.t += dt; cut.step(dt);
    if (cut.t >= cut.dur) { const c = cut; cut = null; c.end(); }
  }
  if (level) level.update(dt, ctx);
  if (boss) boss.update(dt, P);
  pingStep();
  fogTick(dt);
  animateSub(dt);
  if (state !== 'cutscene') updateCamera(dt); else input.takeLook();
  fx.update(dt, P.pos);
  hudTick(dt);
  // ambiente: cantos lejanos
  run.whale -= dt; if (run.whale <= 0) { run.whale = 14 + Math.random() * 12; if (level && level.n !== 2) sfx.whale(); }
  input.endStep();
}

function control(dt) {
  const D = diff(), bd = binds(), a = input.axis();
  const upH = input.down(bd.up) || input.down(PAD_KEYS.up) || input.button('up');
  const dnH = input.down(bd.down) || input.down(PAD_KEYS.down) || input.button('down');
  // acoplado: recarga y repara; cualquier mando o USAR suelta
  if (P.docked) {
    const Mo = P.docked; P.dockT += dt;
    P.pos.x += (Mo.dock.x - P.pos.x) * Math.min(1, dt * 3); P.pos.y += (Mo.dock.y - P.pos.y) * Math.min(1, dt * 3); P.pos.z += (Mo.dock.z - P.pos.z) * Math.min(1, dt * 3);
    P.vel.set(0, 0, 0);
    P.energy = Math.min(100, P.energy + 14 * dt); P.hull = Math.min(100, P.hull + 7 * dt); P.o2 = Math.min(100, P.o2 + 22 * dt);
    if (Math.random() < dt * 6) fx.bubbles(P.pos.x, P.pos.y + 1, P.pos.z, 1, 1, 0.14);
    if (P.dockT > 0.6 && (Math.abs(a.y) > 0.3 || upH || dnH || input.hit(bd.use, PAD_KEYS.use, 'btn:use'))) undock();
    cur = null; P.scanK = 0; ui.reticle(0, '');
    if (input.hit(bd.light, PAD_KEYS.light, 'btn:light')) toggleLight();
    if (Math.abs(a.x) > 0.2) P.yaw -= a.x * 1.6 * dt;
    return;
  }
  // timón y empuje
  P.yaw -= a.x * 1.85 * dt;
  const thrust = -a.y; P.thrust = thrust;
  fwd.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  const acc = thrust > 0 ? 9.5 : 6;
  P.vel.addScaledVector(fwd, thrust * acc * dt);
  const vert = (upH ? 1 : 0) - (dnH ? 1 : 0); P.vert = vert;
  P.vel.y += vert * 6.5 * dt;
  const drag = Math.exp(-1.35 * dt); P.vel.multiplyScalar(drag);
  if (Math.abs(thrust) > 0.1 || vert) moved += dt;
  prevVel.copy(P.vel);
  P.pos.addScaledVector(P.vel, dt);
  const h = collide(level.world, P.pos, P.vel, RAD, 0.3);
  if (h.any) {
    if (h.tag.startsWith('debris:')) { /* los escombros no dañan: se empujan */ }
    else if (h.impact > 3.2) {
      const dmg = (h.impact - 3.2) * 7 * D.crash;
      P.hull -= dmg; run.crashes++; emit('crash'); sfx.crash(h.impact); fx.shake(Math.min(0.5, h.impact * 0.06)); if (!reduced()) ui.hurt();
      fx.cloud(P.pos.x - h.nx * RAD, P.pos.y - h.ny * RAD, P.pos.z - h.nz * RAD, 6, 0x8a7a5a, 1.5, 0.8);
      if (P.carrying === 'capsule') { emit('capsuleCrash'); toast('💥 ¡Chocaste con la cápsula!', 1500); }
      checkDeath('crash');
    } else if (h.impact > 1.2) { sfx.bump(); if (P.carrying === 'capsule' && h.impact > 1.8) { emit('capsuleCrash'); toast('💥 ¡La cápsula golpeó algo!', 1500); } }
  }
  // escombros: se empujan si el casco está en contacto y el submarino avanza hacia ellos
  if (Math.abs(thrust) > 0.15) for (const id in level.debris) {
    const d = level.debris[id], c = d.col;
    const cx = clamp(P.pos.x, c.x0, c.x1), cy = clamp(P.pos.y, c.y0, c.y1), cz = clamp(P.pos.z, c.z0, c.z1);
    const dist = Math.hypot(P.pos.x - cx, P.pos.y - cy, P.pos.z - cz);
    if (dist < RAD + 0.25 && ((cx - P.pos.x) * fwd.x + (cz - P.pos.z) * fwd.z) * Math.sign(thrust) > 0 && d.push(fwd.x * thrust * 3, fwd.z * thrust * 3, dt)) tip('debris');
  }
  // recursos
  const eDrain = (0.07 + 0.16 * Math.abs(thrust) + 0.06 * Math.abs(vert) + (P.light ? 0.05 : 0)) * D.drain;
  P.energy -= eDrain * dt;
  const surf = level.env.surface && P.pos.y > -1.6;
  if (surf) P.o2 = Math.min(100, P.o2 + 25 * dt);
  else P.o2 = Math.max(0, P.o2 - 0.26 * D.o2 * dt);
  if (P.o2 <= 0) P.energy -= 1.5 * dt; // electrólisis de emergencia
  const dep = depth(), lim = limit();
  if (dep > lim) { P.hull -= (dep - lim) * 0.08 * dt; if (Math.random() < dt * 0.6) { sfx.creak(); fx.shake(0.08); } tip('pressure'); }
  checkDeath('drain');
  if (state !== 'play') return;
  // interactuables
  cur = null; let best = 1e9, bestBlocked = null;
  for (const o of level.inters) {
    const d = Math.hypot(o.x - P.pos.x, o.y - P.pos.y, o.z - P.pos.z);
    if (d > (o.r ?? 4) || d >= best) continue;
    if (o.can && !o.can()) continue;
    best = d; cur = o; bestBlocked = o.blocked ? o.blocked() : null;
  }
  if (cur) { cur.blockedNow = bestBlocked; if (cur.kind === 'module' && level.n === 1) tip('module'); if (cur.kind === 'probe') tip('probe'); if (cur.kind === 'debris') tip('debris'); }
  const useHit = input.hit(bd.use, PAD_KEYS.use, 'btn:use');
  const useHeld = input.down(bd.use) || input.down(PAD_KEYS.use) || input.button('use');
  if (cur && !cur.push && useHit) {
    if (cur.blockedNow) { sfx.denied(); toast(cur.blockedNow, 1600); }
    else if (cur.use) { sfx.click(); cur.use(); emit('interact'); }
  }
  // escaneo de fauna: mantener USAR con una especie nueva en la mira
  scanStep(dt, !cur && useHeld);
  if (input.hit(bd.sonar, PAD_KEYS.sonar, 'btn:sonar')) sonar();
  if (input.hit(bd.photo, PAD_KEYS.photo, 'btn:photo')) photo();
  if (input.hit(bd.light, PAD_KEYS.light, 'btn:light')) toggleLight();
  // avisos de criaturas (tutorial contextual)
  for (const e of level.ents) {
    if (e.kind === 'jelly' && e.state === 'charge' && e.pos.distanceTo(P.pos) < 7) tip('jelly');
    else if (e.kind === 'eel' && e.state === 'tell') tip('eel');
    else if (e.kind === 'drone' && (e.state === 'alert' || e.state === 'chase')) tip('drone');
  }
  if (level.n === 2 && run.time > 4) tip('light');
  if (run.time > 25 && level.n === 1) tip('sonar');
  // victoria: con el faro encendido, volver a la superficie junto al barco
  if (level.n === 1 && S().ascended && S().beacon && P.pos.y > -2.6 && Math.hypot(P.pos.x - level.boat.x, P.pos.z - level.boat.z) < 11) startVictory();
}
function toggleLight() { P.light = !P.light; sfx.light(P.light); emit(P.light ? 'lightOn' : 'lightOff'); toast(P.light ? '💡 Focos encendidos' : '🌑 Focos apagados', 900); }
const _dir = new THREE.Vector3();
function scanStep(dt, held) {
  const s = S();
  fwd.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  let best = null, bd = 1e9;
  for (const e of level.ents) {
    if (!e.species || !e.scannable || s.scanned.includes(e.species)) continue;
    _dir.subVectors(e.pos, P.pos); const d = _dir.length(); if (d > 18 + (e.size || 1) || d < 0.01) continue;
    const cos = (_dir.x * fwd.x + _dir.z * fwd.z) / Math.max(0.01, Math.hypot(_dir.x, _dir.z));
    if (cos < 0.86 || Math.abs(_dir.y) > d * 0.7 + (e.size || 1)) continue;
    if (d < bd) { bd = d; best = e; }
  }
  if (best && best !== P.scanTarget) P.scanK = 0;
  P.scanTarget = best;
  if (best) {
    tip('scan');
    if (held) { P.scanK += dt / 1.1; if (Math.random() < dt * 5) sfx.scan(); }
    else P.scanK = Math.max(0, P.scanK - dt);
    ui.reticle(Math.min(1, P.scanK), (held ? 'ESCANEANDO: ' : `${input.isTouch ? 'MANTENÉ USAR' : 'MANTENÉ ' + keyLabel(binds().use)} · `) + /** @type {any} */ (SPECIES)[best.species].toUpperCase());
    if (P.scanK >= 1) {
      s.scanned.push(best.species); persist(); P.scanK = 0;
      emit('scan'); addScore(200); sfx.scanDone(); fx.mark(best.pos, 0x9dffb0, 2.5, best);
      toast(`🧬 Especie registrada: ${/** @type {any} */ (SPECIES)[best.species]} (${s.scanned.length}/4)`, 2200);
      if (s.scanned.length === 1) setTimeout(() => tip('photo'), 2400);
    }
  } else { P.scanK = 0; ui.reticle(0, ''); }
}
function startVictory() {
  if (state !== 'play') return;
  state = 'cutscene'; cutSkip = false; closeTip();
  sfx.victory(); fx.bubbles(P.pos.x, P.pos.y, P.pos.z, 30, 3, 0.3);
  ui.title('¡A LA SUPERFICIE!', 'MAREAS PROFUNDAS');
  const x0 = P.pos.x, z0 = P.pos.z;
  cut = {
    t: 0, dur: reduced() ? 1.4 : 3,
    step(dt) { const k = Math.min(1, cut.t / cut.dur); P.pos.y += (0.2 - P.pos.y) * Math.min(1, dt * 2); camera.position.set(x0 + 10 - k * 4, -4 + k * 9, z0 - 14); camera.lookAt(x0, 0, z0 + 6); },
    end() { victory(); },
  };
}
function animateSub(dt) {
  const g = SUB.group;
  let d = P.yaw - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += d * Math.min(1, dt * 10);
  const sp = Math.hypot(P.vel.x, P.vel.z);
  P.roll += ((-(input.axis().x) * 0.25 * Math.min(1, sp / 3)) - P.roll) * Math.min(1, dt * 4);
  P.pitch += ((-P.vel.y * 0.07) - P.pitch) * Math.min(1, dt * 4);
  g.rotation.z = P.roll; g.rotation.x = P.pitch + (state === 'dead' ? 0.6 : 0);
  if (state === 'play' && !P.docked) g.position.y += Math.sin(run.time * 1.6) * 0.002;
  P.prop += dt * (2 + Math.abs(P.thrust) * 22); SUB.prop.rotation.z = P.prop;
  const on = P.light && state !== 'dead';
  spot.visible = on; SUB.cone.visible = on; fill.intensity = on ? 3 : 1;
  /** @type {any} */ (SUB.lamps.material).color.setHex(on ? 0xffffff : 0x333333);
  if (state === 'play' && Math.abs(P.thrust) > 0.2 && Math.random() < dt * 14) { fwd.set(Math.sin(P.yaw), 0, Math.cos(P.yaw)); fx.bubbles(P.pos.x - fwd.x * 1.7, P.pos.y, P.pos.z - fwd.z * 1.7, 1, 0.3, 0.1); }
  if (state === 'play' && Math.abs(P.thrust) > 0.1) sfx.engine(Math.abs(P.thrust));
  for (const k in cargoMeshes) /** @type {any} */ (cargoMeshes)[k].visible = P.carrying === k;
  SUB.body.material = mats.sub;
  /** @type {any} */ (mats.sub).emissive?.setHex(S().wins > 0 ? 0x3a2a00 : 0x000000);
}
const _ct = new THREE.Vector3(), _cd = new THREE.Vector3();
function updateCamera(dt) {
  const lk = input.takeLook(), o = S().opts;
  if (Math.abs(lk.dx) + Math.abs(lk.dy) > 0.5) { cam.idle = 0; cam.lookYaw -= lk.dx * 0.006 * o.sens; cam.lookPitch = clamp(cam.lookPitch + lk.dy * 0.004 * o.sens * (o.invert ? -1 : 1), -0.5, 0.9); }
  else { cam.idle += dt; if (cam.idle > 1.6 && (Math.abs(P.thrust) > 0.1 || cam.idle > 4)) { cam.lookYaw *= Math.exp(-2 * dt); cam.lookPitch *= Math.exp(-2 * dt); } }
  cam.lookYaw = Math.atan2(Math.sin(cam.lookYaw), Math.cos(cam.lookYaw));
  let d = P.yaw - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); cam.yaw += d * Math.min(1, dt * 4);
  const yaw = cam.yaw + cam.lookYaw;
  let pitch = cam.pitch + cam.lookPitch;
  const want = camera.aspect < 0.8 ? 9.5 : 7.5;
  _ct.set(P.pos.x, P.pos.y + 1.1, P.pos.z);
  _cd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  let f = state === 'play' ? freeFrac(level.world, _ct.x, _ct.y, _ct.z, _ct.x + _cd.x * want, _ct.y + _cd.y * want, _ct.z + _cd.z * want, 0.5) : 1;
  // si una pared tapa la cámara, probar desde más arriba antes de acercarla
  if (f < 0.7) {
    const p2 = Math.min(1.25, pitch + 0.55), cx = -Math.sin(yaw) * Math.cos(p2), cy = Math.sin(p2), cz = -Math.cos(yaw) * Math.cos(p2);
    const f2 = freeFrac(level.world, _ct.x, _ct.y, _ct.z, _ct.x + cx * want, _ct.y + cy * want, _ct.z + cz * want, 0.5);
    if (f2 > f + 0.15) { f = f2; _cd.set(cx, cy, cz); }
  }
  const allowed = want * f;
  cam.dist = allowed < cam.dist ? allowed : cam.dist + (allowed - cam.dist) * Math.min(1, dt * 2.5);
  const tx = _ct.x + _cd.x * cam.dist, ty = Math.min(level.world.ceil - 0.5, _ct.y + _cd.y * cam.dist), tz = _ct.z + _cd.z * cam.dist;
  const k = Math.min(1, dt * 8);
  cam.pos.x += (tx - cam.pos.x) * k; cam.pos.y += (ty - cam.pos.y) * k; cam.pos.z += (tz - cam.pos.z) * k;
  const sh = fx.shakeAmt * 0.5;
  camera.position.set(cam.pos.x + (Math.random() - 0.5) * sh, cam.pos.y + (Math.random() - 0.5) * sh, cam.pos.z + (Math.random() - 0.5) * sh);
  camera.lookAt(_ct.x + Math.sin(yaw) * 3, _ct.y + 0.2, _ct.z + Math.cos(yaw) * 3);
  sun.position.set(P.pos.x + 10, P.pos.y + 40, P.pos.z + 8); sun.target.position.copy(P.pos);
}
const MENU = { 1: [0, -16, 0, 26, -8], 2: [0, -44, 0, 30, -30], 3: [0, -70, 0, 34, -60] };
function menuCamera(dt) {
  cam.menuA += dt * (reduced() ? 0 : 0.05);
  const f = MENU[level ? level.n : 1];
  camera.position.set(f[0] + Math.sin(cam.menuA) * f[3], f[4], f[2] + Math.cos(cam.menuA) * f[3]);
  camera.lookAt(f[0], f[1], f[2]);
}

/* ======================= HUD ======================= */
function goal() {
  if (!level) return null;
  const s = S(), n = level.n;
  if (n === 1) {
    if (s.ascended && s.beacon) return level.boat;
    const pr = ['p1', 'p2', 'p3'].filter(k => !s.probes[k]).map(k => level.probes[k]);
    if (pr.length) { let b = pr[0], bd = 1e9; for (const p of pr) { const d = Math.hypot(p.x - P.pos.x, p.z - P.pos.z); if (d < bd) { bd = d; b = p; } } return b; }
    return { x: 0, z: -48 };
  }
  if (n === 2) {
    if (P.carrying === 'blackbox' || P.carrying === 'capsule') return level.module;
    if (s.blackbox !== 'delivered') {
      if (!s.doors.d1) return { x: 9, z: 27 };
      if (!s.doors.d2) return level.debris.panel && !level.debris.panel.cleared ? { x: -9, z: -15 } : { x: -9, z: -17 };
      return { x: 12, z: -44 };
    }
    return { x: 26, z: -50 };
  }
  if (s.beacon) return level.current;
  return { x: 0, z: 7 };
}
function objective() {
  if (!level) return '';
  const s = S(), n = level.n;
  if (P.docked) return `⚓ Acoplado: recargando… ${input.isTouch ? 'mové el joystick' : 'avanzá o apretá ' + keyLabel(binds().use)} para soltar`;
  if (n === 1) {
    if (s.ascended && s.beacon) return 'Objetivo: subí a la superficie junto al barco';
    const np = ['p1', 'p2', 'p3'].filter(k => s.probes[k]).length;
    if (np < 3) return `Objetivo: activá las sondas científicas (${np}/3)` + (!s.modules.reef ? '\nConsejo: acoplá en el módulo de buceo' : '');
    return 'Objetivo: descendé por la puerta acuática';
  }
  if (n === 2) {
    if (P.carrying === 'blackbox') return 'Objetivo: llevá la caja negra al módulo de buceo';
    if (P.carrying === 'capsule') return 'Objetivo: llevá la cápsula al módulo sin chocar';
    if (s.blackbox !== 'delivered') {
      if (!s.doors.d1) return 'Objetivo: abrí la puerta hidráulica del distrito sur';
      if (!s.doors.d2) return 'Objetivo: abrí la puerta hidráulica del norte' + (level.debris.panel && !level.debris.panel.cleared ? '\n(los escombros tapan el panel)' : '');
      return 'Objetivo: recuperá la caja negra del avión hundido';
    }
    return 'Objetivo: descendé a la Fosa Silenciosa' + (!s.modules.city ? '\nAcoplá en el módulo: la fosa supera tu límite' : '');
  }
  if (boss && boss.active) return '';
  if (s.beacon) return 'Objetivo: entrá en la corriente ascendente';
  return 'Objetivo: encendé el faro en el fondo de la fosa';
}
let hudAcc = 0, radarSweep = 0;
function hudTick(dt) {
  hudAcc += dt; radarSweep += dt * 2.2;
  for (const b of BLIPS) if (b.t > 0) { b.t -= dt; b.a = Math.min(1, b.t / 1.5); }
  if (tipId) { tipT -= dt; if (tipT <= 0 || (tipId === 'move' && moved > 5)) closeTip(); }
  if (hudAcc < 0.1) return;
  hudAcc = 0;
  ui.gauges({ energy: P.energy, hull: P.hull, o2: P.o2, depth: depth(), limit: limit(), score: run.score });
  ui.missions(M.state().current);
  ui.objective(objective());
  const show = state === 'play' && cur;
  ui.prompt(show && !cur.push && !cur.blockedNow ? (input.isTouch ? 'USAR' : keyLabel(binds().use)) : null, show ? (cur.blockedNow || cur.label()) : null, !!(show && (cur.push || cur.blockedNow)));
  ui.boss(boss && boss.active && boss.phase > 0 ? boss.ui() : null);
  const w = P.o2 <= 0 ? '⚠ SIN OXÍGENO: la batería alimenta la electrólisis' : depth() > limit() ? '⚠ PRESIÓN: el casco se está dañando' : P.energy < 15 ? '⚠ BATERÍA CRÍTICA' : P.hull < 20 ? '⚠ CASCO CRÍTICO' : '';
  ui.warn(state === 'play' ? w : '');
  if (w && state === 'play') sfx.warn();
  const vis = BLIPS.filter(b => b.t > 0);
  if (level && level.module) vis.push({ x: level.module.x, z: level.module.z, color: '#ffb547', a: 0.55, t: 1 });
  const pk = fx.pulseR >= 0 ? fx.pulseR / 48 : -1;
  ui.radar({ x: P.pos.x, z: P.pos.z, yaw: P.yaw }, vis, radarSweep, pk, goal());
  if (useBtn) { const on = !!(cur && !cur.push && !cur.blockedNow) || !!P.scanTarget; useBtn.style.borderColor = on ? '#ffb547' : ''; useBtn.style.background = on ? 'rgba(255,181,71,.35)' : ''; }
  if (sonarBtn) sonarBtn.style.opacity = P.sonarCd > 0 ? '0.45' : '1';
  if (lightBtn) lightBtn.style.background = P.light ? 'rgba(255,240,200,.3)' : '';
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'mp-menu' });
const endScreen = screen('', { accent: ACCENT, id: 'mp-end' }); endScreen.hide();
const helpScreen = screen('', { accent: ACCENT, id: 'mp-help' }); helpScreen.hide();
const optScreen = screen('', { accent: ACCENT, id: 'mp-opts' }); optScreen.hide();
let newArmed = false;
function diffText() {
  const d = diff();
  return `Consumo de batería ×${d.drain} · Oxígeno ×${d.o2} · Daño ×${d.dmg} · Choques ×${d.crash} · Criaturas ×${d.spd} · Avisos ×${d.tel} · Sonar ${d.sonarCost}% · Células +${d.cells}% · Barras del Leviatán ${d.rods}`;
}
function showMenu() {
  state = 'menu'; ui.show(false); input.showTouch(false); closeTip(); cut = null; ui.ink(false); ui.boss(null); ui.hideTitle();
  endScreen.hide(); helpScreen.hide(); optScreen.hide();
  if (boss) boss.hide();
  const s = S(), cont = s.started;
  newArmed = false;
  const np = ['p1', 'p2', 'p3'].filter(k => s.probes[k]).length;
  menu.show(`<span class="k3-kicker">EXPLORACIÓN SUBMARINA 3D</span><h1>MAREAS PROFUNDAS</h1>
    <p>Piloteá un minisubmarino por arrecifes que brillan, una ciudad hundida y una fosa en silencio. Usá el sonar, escaneá fauna, recuperá la caja negra y encendé el faro… si el Leviatán te deja.</p>
    ${cont ? `<div class="mp-menu-prog">${ROMAN[s.zone]} · ${ZONES[s.zone].name} · Sondas ${np}/3 · Caja negra ${s.blackbox === 'delivered' ? '✔' : '—'} · Faro ${s.beacon ? '✔' : '—'} · Especies ${s.scanned.length}${s.wins ? ' · 🏆 ' + s.wins : ''}</div>` : ''}
    <div class="k3-btnrow"><button class="k3-b" data-go>${cont ? '▶ Continuar inmersión' : '▶ Comenzar inmersión'}</button>${cont ? '<button class="k3-b alt" data-new>Nueva expedición</button>' : ''}</div>
    <div data-diff></div><div class="mp-dtab" data-dtab>${diffText()}</div>
    <div class="k3-btnrow"><button class="k3-b alt" data-opts>⚙ Controles y opciones</button><button class="k3-b alt" data-help>📖 Cómo jugar</button></div>
    <div class="mp-credit">CREADO POR <img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  const holder = /** @type {HTMLElement} */ (menu.el.querySelector('[data-diff]'));
  M.difficultyPicker(holder, { onChange: () => { const t = menu.el.querySelector('[data-dtab]'); if (t) t.textContent = diffText(); } });
  const want = cont ? s.zone : 1;
  if (!level || level.n !== want) loadZone(want, cont ? s.cp : 'start', true);
  SUB.group.visible = false;
  A.refresh && A.refresh();
}
menu.on('[data-go]', () => { sfx.click(); startRun(false); });
menu.on('[data-new]', () => {
  const b = /** @type {HTMLElement} */ (menu.el.querySelector('[data-new]'));
  if (!newArmed) { newArmed = true; b.textContent = '¿Borrar el progreso? Tocá de nuevo'; return; }
  sfx.click(); startRun(true);
});
menu.on('[data-help]', () => openHelp(false));
menu.on('[data-opts]', () => openOptions(false));
endScreen.on('[data-menu]', () => showMenu());
endScreen.on('[data-new]', () => startRun(true));
endScreen.on('[data-retry]', () => startRun(false));

let fromPause = false;
function openHelp(pause) {
  fromPause = pause;
  if (!pause) menu.hide();
  helpScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:30px">LA INMERSIÓN</h1>
    <ul class="k3-list">
      <li>🕹 <b>Pilotear:</b> ${input.isTouch ? 'joystick (adelante/atrás y girar) · SUBIR/BAJAR' : `W/S avanzar, A/D girar, ${K('up')}/${K('down')} subir y bajar`} · arrastrá para mirar</li>
      <li>⚡ <b>Energía</b> (motor, focos, sonar) y 🛡 <b>casco</b>: si alguno llega a 0, perdés. O₂ en cero consume batería. Pasar el <b>límite de presión</b> daña el casco.</li>
      <li>⚓ <b>Módulos de buceo:</b> acoplá con ${K('use')} para recargar, reparar, guardar y subir el límite de presión.</li>
      <li>📡 <b>Sonar</b> (${K('sonar')}): pulso con ecos en el radar; espanta anguilas y aturde drones. 🧬 <b>Escanear:</b> mantené ${K('use')} con una especie en la mira. 📷 <b>Foto</b> (${K('photo')}) · 💡 <b>Luz</b> (${K('light')}).</li>
      <li>🔧 <b>Interacciones:</b> sondas científicas, escombros (se empujan con el casco), puertas hidráulicas (válvulas), caja negra y cápsula (se enganchan y se entregan en el módulo), puertas acuáticas entre zonas.</li>
      <li>🪼 <b>Medusa eléctrica:</b> la atrae la luz y brilla antes de descargar. 🐍 <b>Anguila:</b> ojos rojos → embestida recta; el sonar la espanta. 🤖 <b>Dron:</b> cono de luz; escondete o aturdilo. 🐙 <b>Pulpo:</b> círculo rojo → golpe; la foto lo ahuyenta.</li>
      <li>🐉 <b>Leviatán Abisal:</b> esquivá sus carriles, cerrá válvulas, buscá las barras a oscuras con el sonar y apagá el reactor esquivando ondas por altura.</li>
      <li>🎮 <b>Mando:</b> stick mover · A usar · B sonar · X foto · Y luz · RB subir · LB bajar · Start pausa</li>
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
  const row = id => `<div class="mp-bind"><span>${/** @type {any} */ (BIND_NAMES)[id]}</span><button type="button" data-bind="${id}" class="${listening === id ? 'wait' : ''}">${listening === id ? 'Apretá una tecla…' : keyLabel(o.binds[id])}</button></div>`;
  optScreen.show(`<span class="k3-kicker">OPCIONES</span><h1 style="font-size:30px">CONTROLES</h1>
    <div class="mp-opts">
      ${['up', 'down', 'use', 'sonar', 'photo', 'light'].map(row).join('')}
      <label>Sensibilidad de cámara <input type="range" min="0.4" max="2" step="0.1" value="${o.sens}" data-sens aria-label="Sensibilidad de cámara"></label>
      <label>Invertir cámara vertical <input type="checkbox" data-invert ${o.invert ? 'checked' : ''}></label>
      <label>Movimiento (sacudidas y destellos) <select data-motion><option value="auto"${o.motion === 'auto' ? ' selected' : ''}>Según el sistema</option><option value="reduce"${o.motion === 'reduce' ? ' selected' : ''}>Reducido</option><option value="full"${o.motion === 'full' ? ' selected' : ''}>Completo</option></select></label>
      <div class="mp-small">Mover: WASD/flechas · Mirar: arrastrar · Mando: A usar, B sonar, X foto, Y luz, RB subir, LB bajar, Start pausa. Sonido y calidad gráfica: botón ⏸ de la barra.</div>
    </div>
    <div class="k3-btnrow"><button class="k3-b" data-back>Listo</button><button class="k3-b alt" data-defaults>Valores por defecto</button></div>`);
}
optScreen.on('[data-back]', closeSub);
optScreen.on('[data-defaults]', () => { S().opts = structuredClone(SAVE_DEFAULTS.opts); persist(); openOptions(fromPause); });
optScreen.el.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-bind]'); if (b) { listening = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.bind); openOptions(fromPause); } });
optScreen.el.addEventListener('input', e => {
  const t = /** @type {HTMLInputElement} */ (e.target), o = S().opts;
  if (t.matches('[data-sens]')) o.sens = +t.value;
  if (t.matches('[data-invert]')) o.invert = t.checked;
  if (t.matches('[data-motion]')) o.motion = /** @type {any} */ (t.value);
  persist();
});
optScreen.el.addEventListener('keydown', e => {
  if (!listening) return;
  e.preventDefault();
  const reserved = ['Escape', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyP', 'Tab', 'Enter'];
  if (!reserved.includes(e.code)) {
    const o = S().opts; for (const k in o.binds) if (o.binds[k] === e.code) o.binds[k] = o.binds[listening];
    o.binds[listening] = e.code; persist();
  }
  listening = ''; openOptions(fromPause);
}, true);
// mando: A en los menús pulsa el botón enfocado
addEventListener('keydown', e => {
  if (e.code !== PAD_KEYS.use || ACTIVE.has(state)) return;
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (el && el.closest('.k3-screen') && el.tagName === 'BUTTON') el.click();
});
game.root.addEventListener('pointerdown', () => { if (state === 'cutscene') cutSkip = true; });

/* ======================= gancho de pruebas ======================= */
const r3 = v => Math.round(v * 1000) / 1000;
const hook = {
  get state() { return state; },
  get scene() { return level ? level.name : ''; },
  get zone() { return level ? level.n : 0; },
  get missions() { return M.state(); },
  get player() { return { x: r3(P.pos.x), y: r3(P.pos.y), z: r3(P.pos.z), yaw: r3(P.yaw), vx: r3(P.vel.x), vy: r3(P.vel.y), vz: r3(P.vel.z), light: P.light, docked: P.docked ? P.docked.id : null, carrying: P.carrying, alive: P.alive }; },
  get energy() { return r3(P.energy); }, get hull() { return r3(P.hull); }, get o2() { return r3(P.o2); }, get hp() { return r3(P.hull); },
  get depth() { return r3(depth()); }, get limit() { return limit(); },
  get score() { return run.score; }, get runTime() { return r3(run.time); }, get simTime() { return game.simTime; },
  get paused() { return game.paused; }, get tip() { return tipId; }, get prompt() { return cur ? (cur.blockedNow || cur.label()) : ''; }, get promptId() { return cur ? cur.id : ''; },
  get scan() { return { target: P.scanTarget ? P.scanTarget.species : null, k: r3(P.scanK) }; },
  get counts() {
    if (!level) return {};
    const k = kind => level.ents.filter(e => e.kind === kind).length;
    return { ents: level.ents.length, jellies: k('jelly'), drones: k('drone'), eels: k('eel'), octopus: k('octopus'), anglers: k('angler'), schools: k('school'), colliders: level.world.boxes.length + level.world.balls.length, inters: level.inters.length, cells: level.cells.filter(c => !c.t.done).length, particles: fx.particles, fish: level.schools ? level.schools.count : 0 };
  },
  get creatures() { return level ? level.ents.map(e => ({ kind: e.kind, species: e.species, state: e.state, x: r3(e.pos.x), y: r3(e.pos.y), z: r3(e.pos.z) })) : []; },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...game.perf, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames: game.frames }; },
  get quality() { const q = qual(); return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, snow: fx.snowCount, rays: fx.rayCount, fish: level && level.schools ? level.schools.count : 0, lights: level ? level.lights.filter(l => l.visible).length : 0, fogDensity: r3(/** @type {any} */ (scene.fog).density * 1000) / 1000, far: camera.far, caustics: q.caustics, terrainSeg: level ? level.terrainSeg : 0 }; },
  get difficulty() { return { name: diffName(), ...diff() }; },
  get boss() { return boss ? { active: boss.active, phase: boss.phase, sub: boss.sub, mode: boss.mode, valves: boss.valves.map(v => ({ k: r3(v.k), on: v.on, done: v.done })), rods: boss.rods.map(r => ({ state: r.state, x: r.x, y: r.y, z: r.z })), inserted: boss.inserted, need: boss.rodsNeeded, carried: boss.carried, shutdown: boss.shutdown, coreK: r3(boss.coreK), lunges: boss.lunges, strikes: boss.strikes, waves: boss.waves, hits: boss.hits, head: { x: r3(boss.headPos.x), y: r3(boss.headPos.y), z: r3(boss.headPos.z) }, target: { x: r3(boss.target.x), y: r3(boss.target.y), z: r3(boss.target.z) }, bandY: boss.bandY, waveOn: boss.waveOn } : null; },
  get puzzle() {
    if (!level) return {};
    const o = /** @type {any} */ ({ probes: {}, debris: {}, doors: {}, gates: {} });
    for (const k in level.probes) o.probes[k] = level.probes[k].on;
    for (const k in level.debris) o.debris[k] = { off: r3(level.debris[k].off), cleared: level.debris[k].cleared };
    for (const k in level.doors) o.doors[k] = { open: level.doors[k].open, k: r3(level.doors[k].k), solid: level.doors[k].col.on };
    for (const k in level.gates) o.gates[k] = level.gates[k].open;
    o.blackbox = S().blackbox; o.capsule = S().capsule; o.ruin = S().ruin; o.beacon = S().beacon;
    return o;
  },
  get save() { return structuredClone(S()); },
};
if (DEBUG) {
  /** @type {any} */ (hook).debug = {
    goto(n, sp) { if (state === 'menu') startRun(false); loadZone(n, sp || (n === 1 ? 'start' : 'entry')); state = 'play'; P.alive = true; },
    simulate(sec) { simulating = true; try { game.simulate(sec); } finally { simulating = false; } },
    /** Congela el bucle real: sólo avanza con simulate() (pruebas deterministas). */
    freeze(v = true) { frozen = !!v; },
    teleport(x, y, z, yaw) { P.pos.set(x, y, z); P.vel.set(0, 0, 0); if (yaw !== undefined) P.yaw = yaw; P.docked = null; cam.pos.set(x, y + 3, z - 6); },
    at(id, dx = 0, dy = 0, dz = 0) { const o = level.inters.find(i => i.id === id); if (!o) return null; this.teleport(o.x + dx, o.y + dy, o.z + dz); return { x: o.x, y: o.y, z: o.z }; },
    face(x, y, z) { P.yaw = Math.atan2(x - P.pos.x, z - P.pos.z); cam.yaw = P.yaw; },
    setRes(o) { if (o.energy !== undefined) P.energy = o.energy; if (o.hull !== undefined) P.hull = o.hull; if (o.o2 !== undefined) P.o2 = o.o2; },
    use(id) { const o = level.inters.find(i => i.id === id); if (o && o.use && (!o.can || o.can())) { o.use(); return true; } return false; },
    probes() { for (const k of ['p1', 'p2', 'p3']) ctx.activateProbe(k, 0, -20, 0); },
    give(kind) { if (kind === 'reef' || kind === 'city' || kind === 'trench') { S().modules[kind] = true; persist(); } else if (kind === 'blackbox') { S().blackbox = 'delivered'; persist(); emit('blackbox'); } else if (kind === 'beacon') { S().beacon = true; persist(); } },
    spawnBoss() { this.goto(3, 'entry'); this.teleport(0, -92, 12, Math.PI); startBoss(); },
    skipCut() { if (cut) cut.t = cut.dur; },
    bossPhase(n) { if (!boss.active) boss.start(); cut = null; boss.sub = 'fight'; boss.startPhase(n); state = 'play'; },
    clearPhase() { const B = boss; if (B.phase === 1) B.valves.forEach(v => { v.done = true; }); else if (B.phase === 2) B.inserted = B.rodsNeeded; else if (B.phase === 3) { B.shutdown = true; B.coreK = 1; } },
    revealRods() { boss.rods.forEach(r => { r.rev = 30; r.state = 'revealed'; }); },
    sonar() { P.sonarCd = 0; sonar(); },
    hurt(n) { P.inv = 0; hurt(n, P.pos.x + 1, P.pos.y, P.pos.z, 'debug', { knock: 1 }); },
    ascend() { S().beacon = true; persist(); ascend(); },
    lookBoss(dist = 0.25) { const h = boss.headPos; this.teleport(h.x * dist, -88, h.z * dist); this.face(h.x, h.y, h.z); },
    victoryNow() { S().beacon = true; S().ascended = true; persist(); startVictory(); },
  };
}
W['__' + GAME_ID] = Object.freeze(hook);

/* ======================= arranque ======================= */
showMenu();
applyQuality();
game.start();
void esc;
