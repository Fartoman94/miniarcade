// @ts-check
/* Corsarios del Abismo — juego principal: campaña de 3 regiones (Bahía del Contrabandista, Archipiélago de la Bruma,
   Fuerte de Coral Negro), navegación con viento e inercia, andanadas, desembarco a pie (cofres, tesoros, cueva,
   sabotaje de cañones, toma del fuerte), muelles con mercado, abordaje, jefe con fases, misiones, guardado,
   menús, tutorial contextual y ganchos de prueba (window.__corsarios_abismo; ayudas de depuración sólo con ?debug). */
import { createGame, createInput, createSave, screen, toast, clamp, rng, THREE } from '../../matelabs/kit3d.js';
import { GAME_ID, TITLE, ACCENT, DIFF, QUAL, REGIONS, MISSIONS, SAVE_VERSION, SAVE_DEFAULTS, PRICES, MAX_KITS, SHIPS, keyLabel, newRegionState } from './config.js';
import { createWater, waveHeight, sea } from './water.js';
import { createRegion } from './world.js';
import { createShip, stepShip, poseShip, collideShips, createBalls, fireBroadside, hullDist, hitZone, arcPoints, elevationFor, MAX_RANGE } from './ships.js';
import { createEnemies } from './enemies.js';
import { createBoss } from './boss.js';
import { captainModel, Builder, vmat, glowMat } from './models.js';
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
const IDS = ['bahia', 'bruma', 'coral'];
const arrOfStr = (v, ok) => Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && (!ok || ok.includes(x))))] : [];
/** Repara datos con forma inválida (viejo, editado o a medias): nunca bloquea la partida. */
function sanitize() {
  const s = /** @type {any} */ (save.get()), D = /** @type {any} */ (SAVE_DEFAULTS);
  for (const k in D) {
    const dv = D[k], v = s[k];
    if (Array.isArray(dv)) { if (!Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (dv && typeof dv === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (typeof v !== typeof dv) s[k] = structuredClone(dv);
  }
  for (const k in s) if (!(k in D)) delete s[k];
  if (!IDS.includes(s.region)) s.region = 'bahia';
  s.unlocked = arrOfStr(s.unlocked, IDS); if (!s.unlocked.includes('bahia')) s.unlocked.unshift('bahia');
  if (!s.unlocked.includes(s.region)) s.region = 'bahia';
  const int = (v, lo, hi) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : lo;
  s.fragments = int(s.fragments, 0, 3); s.gold = int(s.gold, 0, 99999); s.plunder = int(s.plunder, 0, 9999999); s.kits = int(s.kits, 0, MAX_KITS);
  s.wins = int(s.wins, 0, 9999); s.bestScore = int(s.bestScore, 0, 9999999);
  s.up = { cannons: int(s.up.cannons, 0, 2), armor: int(s.up.armor, 0, 2) };
  for (const id of IDS) {
    const r = s.regions[id] && typeof s.regions[id] === 'object' && !Array.isArray(s.regions[id]) ? s.regions[id] : {};
    s.regions[id] = { ...newRegionState(), dug: arrOfStr(r.dug), chests: arrOfStr(r.chests), cannons: arrOfStr(r.cannons), rescued: arrOfStr(r.rescued), cave: r.cave === true, dock: r.dock === true };
  }
  for (const k of Object.keys(s.regions)) if (!IDS.includes(k)) delete s.regions[k];
  for (const k of Object.keys(D.stats)) s.stats[k] = int(s.stats[k], 0, 9999999);
  for (const k of Object.keys(s.stats)) if (!(k in D.stats)) delete s.stats[k];
  s.fort = s.fort === true && s.fragments >= 3; s.admiral = s.admiral === true && s.fort; s.started = s.started === true;
  if (s.region === 'coral' && s.fragments < 3) s.region = 'bruma';
  s.tutorial = { off: s.tutorial.off === true, seen: s.tutorial.seen && typeof s.tutorial.seen === 'object' && !Array.isArray(s.tutorial.seen) ? s.tutorial.seen : {} };
  const o = s.opts, dO = D.opts;
  s.opts = {
    sens: typeof o.sens === 'number' && o.sens >= 0.5 && o.sens <= 1.6 ? o.sens : 1,
    cam: ['lejos', 'cerca'].includes(o.cam) ? o.cam : 'lejos',
    motion: ['auto', 'reduce', 'full'].includes(o.motion) ? o.motion : 'auto',
    aim: o.aim !== false,
    binds: { ...dO.binds, ...(o.binds && typeof o.binds === 'object' && !Array.isArray(o.binds) ? o.binds : {}) },
  };
  for (const k of Object.keys(dO.binds)) if (typeof s.opts.binds[k] !== 'string' || !s.opts.binds[k]) s.opts.binds[k] = dO.binds[k];
  for (const k of Object.keys(s.opts.binds)) if (!(k in dO.binds)) delete s.opts.binds[k];
}
sanitize(); save.flush();
const S = () => /** @type {typeof SAVE_DEFAULTS} */ (save.get());
const persist = () => save.flush();
const binds = () => S().opts.binds;
const CAMPAIGN_KEYS = ['region', 'unlocked', 'fragments', 'fort', 'admiral', 'gold', 'plunder', 'kits', 'up', 'regions', 'started'];
const snapshot = () => structuredClone(Object.fromEntries(CAMPAIGN_KEYS.map(k => [k, /** @type {any} */ (S())[k]])));

/* ======================= misiones y dificultad ======================= */
M.setup({ gameId: GAME_ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 2, hud: 'none' });
const diffName = () => /** @type {keyof typeof DIFF} */ (M.difficulty(GAME_ID));
const diff = () => DIFF[diffName()] || DIFF.normal;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => { const m = S().opts.motion; return m === 'reduce' || (m === 'auto' && reducedMQ.matches); };
const emit = (ev, v) => M.emit(ev, v);

/* ======================= juego base ======================= */
const ACTIVE = new Set(['sail', 'foot', 'docked', 'board', 'cutscene', 'sinking', 'travel']);
let state = 'menu';
let overlay = false;
const game = createGame({
  id: GAME_ID, title: TITLE, toolbar: 'tr', background: 0x06121c, fov: 58, far: 480,
  help: ['W/S o ↑/↓: subir y bajar velas (el barco tiene inercia) · A/D o ←/→: timón', 'Q: andanada por BABOR (izquierda) · E: por ESTRIBOR (derecha)',
    'Espacio: acción (desembarcar, atracar, rescatar, abordar, cavar, abrir) · R: kit de reparación', 'A pie: W/A/S/D caminar · Espacio interactuar', 'El viento a favor (flecha en la carta) te da más velocidad', 'Esc, P o Start: pausa'],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', lb: 'F13', rb: 'F14', lt: 'F13', rt: 'F14', a: 'F15', x: 'F16' },
  isActive: () => ACTIVE.has(state),
  update, render, onRestart, onQuality: () => applyQuality(),
  actions: [
    { label: '📖 Cómo jugar y tutorial', fn: () => openHelp(true) },
    { label: '⚙ Controles y accesibilidad', fn: () => openOptions(true) },
    { label: '🏴‍☠️ Volver al menú del juego', fn: exitToMenu },
  ],
});
const { scene, camera, renderer } = game;
scene.fog = new THREE.Fog(0xa9d6ea, 120, 330);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const water = createWater(scene);
const fx = createFx(scene, reduced);
const sfx = createSfx(game.audio);
const ui = createUI();
const balls = createBalls(scene);
const rand = rng(Date.now() & 0xffff);

const input = createInput(game.root, {
  joystick: 'left',
  buttons: [{ id: 'kit', label: 'KIT' }, { id: 'act', label: 'ACCIÓN' }, { id: 'port', label: '◀ BABOR' }, { id: 'star', label: 'ESTRIB. ▶' }],
});
if (input.isTouch) document.body.classList.add('ca-touch');
input.showTouch(false);
const tbtn = id => /** @type {HTMLElement|null} */ (document.querySelector(`.k3-btn[aria-label="${id}"]`));

/* ======================= entidades persistentes ======================= */
/** @type {any} */ let world = null;
/** @type {any} */ let P = null;
/** @type {any} */ let enemies = null;
/** @type {any} */ let boss = null;
/** @type {any} */ let checkpoint = null;
const cap = captainModel(); scene.add(cap.group); cap.group.visible = false;
const dinghy = (() => { const b = new Builder(); b.box(1.6, 0.5, 3.0, 0x7a5a32, 0, 0.1, 0); b.box(1.3, 0.1, 2.6, 0xb08a5a, 0, 0.36, 0); b.cyl(0.04, 0.04, 2.4, 4, 0x5a3a20, 0, 0.5, 0.2, 0, 0, Math.PI / 2 - 0.3); const m = new THREE.Mesh(b.build(), vmat()); scene.add(m); m.visible = false; return m; })();
const foot = { x: 0, z: 0, y: 0, yaw: 0, isl: /** @type {any} */ (null), camYaw: 0, walk: 0, dx: 0, dz: 0, act: 0, dig: 0 };
const aimLines = ['L', 'R'].map(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 3), 3)); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffbe3d, transparent: true, opacity: 0.8, depthWrite: false })); l.frustumCulled = false; l.visible = false; l.renderOrder = 5; scene.add(l); return l; });
const chestFloat = { mesh: /** @type {any} */ (null), ring: /** @type {any} */ (null), x: 0, z: 0, on: false };

const run = { time: 0, scoreStart: 0, moved: 0, battle: { on: false, mast: false, kills: 0, quiet: 0 }, gateMsgT: 0, coastMsg: false, aim: { L: /** @type {any} */ (null), R: /** @type {any} */ (null) }, kills: 0,
  qte: /** @type {any} */ (null), dock: /** @type {any} */ (null), dockT: 0, action: /** @type {any} */ (null), holdT: 0, result: /** @type {any} */ (null), travelT: 0, travelTo: '', sinkT: 0, endT: 0, bossTriggered: false, waveSfxT: 0, creakT: 0, bossFog: 0 };
/** @type {any} */ let cut = null;
let tipId = '', tipT = 0, cutSkip = false;
const dbg = { freeze: false, god: false };
const cam = { x: 0, y: 20, z: -60, yaw: 0, lx: 0, ly: 0, lz: 0, orbit: 0, fov: 58 };

/* ======================= tutorial contextual ======================= */
const K = id => input.isTouch ? ({ port: '◀ BABOR', star: 'ESTRIB. ▶', act: 'ACCIÓN', kit: 'KIT' })[id] : keyLabel(binds()[id]);
const TIPS = {
  sail: () => input.isTouch ? 'Empujá el <b>TIMÓN</b> hacia arriba para <b>subir velas</b> y hacia los costados para girar. El barco tiene <b>inercia</b>: anticipá las curvas.' : '<b>W/↑</b> sube velas y <b>S/↓</b> las baja (el barco tiene <b>inercia</b>). <b>A/D</b> mueven el timón. Con el <b>viento a favor</b> (flecha en la carta) vas más rápido.',
  fire: () => `<b>${K('port')}</b> dispara por <b>babor</b> (izquierda) y <b>${K('star')}</b> por <b>estribor</b> (derecha). Poné al enemigo de costado: la <b>guía dorada</b> marca la parábola. Cada banda recarga por separado.`,
  land: () => `Frená cerca de la costa y tocá <b>${K('act')}</b> para <b>desembarcar</b>. A pie podés abrir cofres, cavar tesoros y clavar cañones.`,
  dig: () => `¡Una <b>X</b>! Mantené <b>${K('act')}</b> encima para cavar el tesoro.`,
  dock: () => `En el <b>muelle</b> reparás casco y mástil, comprás kits y mejoras, y viajás entre regiones ya descubiertas.`,
  goleta: () => 'Goleta pirata: cuando sus <b>troneras brillan naranja</b> va a disparar de costado. <b>Cruzale la proa o la popa</b>: ahí no puede apuntarte.',
  lancha: () => 'Carril rojo: la <b>lancha corsaria</b> va a embestir. <b>Recibila de proa</b> (te hace la mitad y se rompe) o <b>barrela de costado</b> mientras apunta.',
  cannon: () => `Círculo rojo = <b>mortero</b> de un cañón de costa. Cambiá rumbo o velocidad. También podés desembarcar y <b>clavarlo</b> con ${K('act')}.`,
  shark: () => '¡<b>Tiburón gigante</b>! Te rodea y embiste (ondas rojas = aviso). Navegando rápido falla. Cuando <b>salta</b> queda expuesto: ¡disparale!',
  surrender: () => `¡<b>Bandera blanca</b>! Acercate despacio y tocá <b>${K('act')}</b> para <b>abordarla</b>. Si le seguís tirando, se hunde.`,
  mast: () => `<b>Mástil roto</b>: navegás más lento. Usá un <b>kit</b> (${K('kit')}) o repará en un muelle.`,
  gate: () => 'Las <b>corrientes</b> te llevan a la próxima región cuando tenés los <b>fragmentos del mapa</b> necesarios.',
  fort: () => 'El <b>Fuerte de Coral Negro</b> tiene 4 baterías. Silencialas a cañonazos y después <b>desembarcá en su muelle</b> para izar tu bandera.',
  boss: () => '<b>Fase 1</b>: el casco está blindado. Cuando sus <b>troneras brillan verde</b> ese costado queda expuesto (×1,6). La <b>popa</b> siempre recibe daño.',
  boss2: () => '<b>Fase 2</b>: está <b>etéreo</b> (inmune). Destruí los <b>cañones encantados</b> de las rocas para materializarlo. Esquivá su carril verde.',
  boss3: () => '<b>Fase 3</b>: <b>remolino</b>. Mantenete lejos del centro con velas arriba y seguí disparando.',
};
function tip(id) {
  const t = S().tutorial;
  if (t.off || t.seen[id] || tipId || !ACTIVE.has(state) || state === 'cutscene') return;
  t.seen[id] = true; persist();
  tipId = id; tipT = 10;
  ui.tip(TIPS[id](), a => { if (a === 'skip') { S().tutorial.off = true; persist(); toast('Tutorial desactivado (reactivalo desde «Cómo jugar»)', 2200); } closeTip(); });
}
function closeTip() { tipId = ''; ui.tip(null); }

/* ======================= regiones ======================= */
function maxHull() { return diff().hull + 25 * S().up.armor; }
function makePlayer(x, z, yaw, keep) {
  const prev = P;
  if (P) { P.model.group.removeFromParent(); disposeObj(P.model.group); }
  P = createShip('player', scene, { x, z, yaw, rand });
  P.maxHp = maxHull(); P.hp = keep && prev ? Math.min(P.maxHp, prev.hp) : P.maxHp;
  if (keep && prev) { P.mast = prev.mast; P.mastLost = prev.mastLost; }
  P.balls = SHIPS.player.balls + S().up.cannons; P.reloadMax = SHIPS.player.reload - 0.15 * S().up.cannons;
  P.y = waveHeight(x, z);
}
function disposeObj(o) { o.traverse(x => { if (x.geometry) x.geometry.dispose(); if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach(m => m.dispose()); }); }
function teardown() {
  if (boss) { boss.dispose(); boss = null; }
  if (enemies) { enemies.dispose(); enemies = null; }
  if (world) { world.dispose(); world = null; }
  if (chestFloat.mesh) { chestFloat.mesh.removeFromParent(); chestFloat.ring.removeFromParent(); chestFloat.mesh = null; chestFloat.on = false; }
  balls.clear(); fx.clear(); fx.dropMarkers();
  sea.whirl.s = 0;
}
/** Construye una región (sin enemigos si `peaceful`, para el fondo del menú). */
function buildRegion(id, spawnKind, peaceful, keepShip) {
  teardown();
  const s = S();
  world = createRegion(id, { rs: s.regions[id], rand, q: QUAL[game.quality] });
  scene.add(world.group);
  const e = world.env;
  /** @type {THREE.Fog} */ (scene.fog).color.setHex(e.fog);
  hemi.color.setHex(e.hemi[0]); hemi.groundColor.setHex(e.hemi[1]); hemi.intensity = e.hemi[2];
  sun.color.setHex(e.sun[0]); sun.intensity = e.sun[1];
  renderer.toneMappingExposure = e.exposure;
  water.setEnv(e, e.sunDir); water.setIslands(world.islands);
  const sp = spawnKind === 'gate' ? world.R.gateSpawn : world.R.spawn;
  makePlayer(sp.x, sp.z, sp.yaw, keepShip);
  enemies = createEnemies({ scene, world, balls, fx, sfx, diff, player: () => P, onFoot: () => state === 'foot' || state === 'docked' || state === 'board', rand, hooks: AIH });
  if (!peaceful) {
    for (const d of world.R.enemies) {
      if (world.R.fort && S().fort && d.type !== 'shark' && d.type !== 'lancha') continue;
      enemies.spawn(d);
    }
  }
  for (const g of world.gates) g.active = S().fragments >= g.need;
  if (world.fort && S().fort) captureFortVisual();
  applyQuality();
  run.bossTriggered = false;
}
function enterRegion(id, via) {
  const s = S();
  buildRegion(id, via === 'gate' ? 'gate' : 'spawn', false, via === 'gate' || via === 'travel');
  s.region = /** @type {any} */ (id); if (!s.unlocked.includes(id)) s.unlocked.push(id); s.started = true; persist();
  checkpoint = snapshot();
  state = 'sail'; P.sail = 0; P.sailCur = 0;
  run.battle = { on: false, mast: false, kills: 0, quiet: 0 };
  cam.yaw = P.yaw; placeCamBehind();
  ui.show(true); input.showTouch(true); input.clear();
  ui.big(world.R.name.toUpperCase(), `REGIÓN ${world.R.idx} DE 3`, 2.4);
  if (id === 'coral') setTimeout(() => tip('fort'), 2500);
  hudTick(1);
}

/* ======================= ciclo de partida ======================= */
function startCampaign() {
  closeSubs(); menu.hide(); endScreen.hide();
  run.time = 0; run.kills = 0; run.result = null;
  M.runStart();
  const s = S();
  if (s.fragments) emit('fragment', s.fragments);
  if (s.fort) emit('fort');
  run.scoreStart = s.plunder;
  A.started();
  enterRegion(s.started ? s.region : 'bahia', 'start');
  setTimeout(() => tip('sail'), 600);
}
function endRun(won) {
  M.runEnd({ won });
  A.ended({ score: S().plunder });
}
function restoreCheckpoint() { if (!checkpoint) return; const s = /** @type {any} */ (S()); for (const k of CAMPAIGN_KEYS) s[k] = structuredClone(checkpoint[k]); persist(); }
function onRestart() {
  if (!ACTIVE.has(state)) return;
  endRun(false);
  restoreCheckpoint();
  cut = null; run.qte = null; ui.qte({ on: false }); marketScreen.hide(); overlay = false;
  M.runStart(); const s = S(); if (s.fragments) emit('fragment', s.fragments); if (s.fort) emit('fort');
  A.started(); run.time = 0;
  enterRegion(s.region, 'start');
}
function exitToMenu() {
  if (ACTIVE.has(state)) endRun(false);
  overlay = false;
  showMenu();
}

/* ======================= economía y recompensas ======================= */
function addGold(n, x, y, z) {
  n = Math.round(n * diff().gold);
  const s = S(); s.gold += n; s.plunder += n; persist();
  if (x !== undefined) fx.gold(x, y, z);
  sfx.coins();
  return n;
}
function gainFragment() {
  const s = S(); s.fragments = Math.min(3, s.fragments + 1); persist();
  emit('fragment'); sfx.fragment();
  ui.big('¡FRAGMENTO DEL MAPA!', `${s.fragments} DE 3`, 2.2);
  if (world) for (const g of world.gates) { const was = g.active; g.active = s.fragments >= g.need; if (g.active && !was) { toast(`🌀 Se abrió la ${g.label}`, 2600); sfx.portal(); } }
  addGold(30);
}
function reward(kind, amount, x, y, z) {
  if (kind === 'fragment') gainFragment();
  else if (kind === 'kit') { const s = S(); if (s.kits < MAX_KITS) { s.kits++; persist(); toast('🩹 ¡Kit de reparación!', 1500); sfx.repair(); } else { const g = addGold(40, x, y, z); toast(`💰 +${g} oro (kits al máximo)`, 1500); } }
  else { const g = addGold(amount || 50, x, y, z); ui.big(`+${g} ORO`, 'BOTÍN', 1.3); }
}

/* ======================= daño ======================= */
function hurtPlayer(dmg, part = 'hull', src = null) {
  if (!P || P.sinking || !P.alive || dbg.god || state === 'travel' || state === 'cutscene') return;
  dmg *= 1 - 0.12 * S().up.armor;
  if (part === 'mast' && !P.mastLost) {
    P.mast -= dmg * 1.3;
    fx.splinters(P.x, P.y + 6, P.z, 6, 0xe8d6a8);
    if (P.mast <= 0) { P.mast = 0; P.mastLost = true; run.battle.mast = true; sfx.crack(); ui.big('¡MÁSTIL ROTO!', 'MENOS VELOCIDAD', 1.6); emit('mastLost'); tip('mast'); }
    dmg *= 0.35;
  }
  P.hp -= dmg; P.flashT = 0.1;
  sfx.hurt(); fx.shake(Math.min(0.7, dmg * 0.04));
  if (!reduced() && dmg > 5) ui.flash();
  fx.splinters(P.x + (Math.random() - 0.5) * 3, P.y + 2, P.z + (Math.random() - 0.5) * 6, 5);
  if (P.hp <= 0) { P.hp = 0; playerSinks(); }
  void src;
}
function damageShip(s, dmg, part) {
  if (!s.alive || s.sinking) return;
  if (part === 'mast' && !s.mastLost) { s.mast -= dmg * 1.4; if (s.mast <= 0) { s.mast = 0; s.mastLost = true; fx.splinters(s.x, s.y + 7, s.z, 8, 0xe8d6a8); } dmg *= 0.5; }
  s.hp -= dmg; s.flashT = 0.1;
  fx.splinters(s.x, s.y + 1.6, s.z, 4, s.model ? 0x5a4030 : 0x8a5a32);
  sfx.hit(0.8);
  if (s.hp <= 0) sinkShip(s);
}
function sinkShip(s) {
  s.hp = 0; s.sinking = true; s.sinkT = 0; s.surrender = false;
  if (s.model.white) s.model.white.visible = false;
  if (s.ai && s.ai.lane) s.ai.lane.visible = false;
  fx.explosion(s.x, s.y + 2, s.z, s.kind === 'lancha' ? 0.8 : 1.2); sfx.sink();
  const g = addGold(s.spec.gold, s.x, s.y + 3, s.z);
  S().stats.sunk++; persist();
  run.kills++; run.battle.kills++;
  if (s.kind === 'lancha') emit('sinkLaunch');
  emit('sink');
  ui.big('¡HUNDIDO!', `${s.kind === 'lancha' ? 'LANCHA CORSARIA' : 'GOLETA PIRATA'} · +${g} ORO`, 1.6);
}
function destroyCannon(c, how) {
  if (c.destroyed) return;
  c.destroyed = true; c.turret.visible = false; c.rubble.visible = true; c.hp = 0;
  if (c.marker) c.marker.visible = false; c.tele = 0;
  fx.explosion(c.x, c.y + 1, c.z, 1.1); sfx.crack();
  const rs = S().regions[world.id]; if (!rs.cannons.includes(c.id)) rs.cannons.push(c.id); persist();
  const g = addGold(c.battery ? 50 : 40, c.x, c.y + 2, c.z);
  emit('cannon');
  ui.big(how === 'spike' ? '¡CAÑÓN CLAVADO!' : '¡CAÑÓN DESTRUIDO!', `+${g} ORO`, 1.5);
  if (c.battery) {
    const left = world.cannons.filter(k => k.battery && !k.destroyed).length;
    if (left === 0) { toast('🏰 ¡Baterías silenciadas! Desembarcá en el muelle del fuerte', 3000); sfx.bell(); }
    else toast(`🏰 Baterías restantes: ${left}`, 1600);
  }
}
function hurtShark(sh, dmg) {
  if (!sh.alive || sh.fled) return;
  sh.hp -= dmg; sh.flashT = 0.15; fx.splash(sh.x, sh.z, 0.6); fx.sparkle(sh.x, sh.y + 1, sh.z, 0xff5040, 4); sfx.bite();
  if (sh.hp <= 0) { sh.fled = true; sh.state = 'flee'; sh.ring.visible = false; emit('shark'); run.battle.kills++; const g = addGold(80, sh.x, 1, sh.z); ui.big('¡TIBURÓN AHUYENTADO!', `+${g} ORO`, 1.8); }
}

/* ======================= ganchos de IA ======================= */
const AIH = {
  toast: (t, ms) => toast(t, ms || 1800),
  engage(s) {
    if (!run.battle.on) run.battle = { on: true, mast: P.mastLost, kills: 0, quiet: 0 };
    tip(s.kind === 'goleta' ? 'goleta' : 'fire');
    if (s.kind === 'goleta') setTimeout(() => tip('fire'), 4000); else if (s.kind === 'lancha') setTimeout(() => tip('fire'), 200);
  },
  fire(s, side, target, spectral) {
    const r = fireBroadside(s, side, balls, target, { spread: diff().spread * (spectral ? 1.4 : 1), dmg: (spectral ? 9 : 8) * diff().dmg, spectral });
    for (const b of r.out) fx.muzzle(b.x, b.y, b.z, r.rx, r.rz, spectral ? 0x5cffb0 : 0xffc070);
    const d = Math.hypot(P.x - s.x, P.z - s.z);
    if (d < 80) sfx.volley(Math.min(4, s.balls)); else sfx.far();
    s.vx -= r.rx * 0.8; s.vz -= r.rz * 0.8;
  },
  surrender(s) {
    toast('🏳 ¡La goleta se rinde! Acercate despacio y abordala', 2400); tip('surrender'); sfx.bell();
    run.battle.kills++;
  },
  laneWarn() { tip('lancha'); },
  cannonTele() { tip('cannon'); },
  sharkSeen() { tip('shark'); if (!run.battle.on) run.battle = { on: true, mast: P.mastLost, kills: 0, quiet: 0 }; },
  sharkTele() { },
  sharkBite(sh) { hurtPlayer(14 * diff().dmg, Math.random() < 0.3 ? 'mast' : 'hull', sh); fx.splash(sh.x, sh.z, 1.6); sfx.bite(); P.vx += Math.sin(sh.yaw) * 4; P.vz += Math.cos(sh.yaw) * 4; ui.big('¡MORDIDA!', 'DISPARALE CUANDO SALTA', 1.2); },
  sharkMiss() { },
};
const BH = {
  toast: (t, ms) => toast(t, ms || 2000),
  fire: (s, side, tgt, spectral) => AIH.fire(s, side, tgt, true),
  phase(n) {
    ui.big(n === 2 ? 'FASE 2' : 'FASE 3', n === 2 ? 'CAÑONES ENCANTADOS' : 'FURIA DEL ABISMO', 2.2);
    if (n === 2) setTimeout(() => tip('boss2'), 1500); else { setTimeout(() => tip('boss3'), 1500); sea.amp = world.env.water.amp * 1.7; }
    fx.shake(0.6);
  },
  dying() { ui.big('¡SE HUNDE!', 'EL ALMIRANTE ESPECTRAL', 2.6); },
  defeated(x, z) { spawnAdmiralChest(x, z); },
  ram(s) { hurtPlayer(20 * diff().dmg, 'hull', s); P.vx += Math.sin(s.yaw) * 9; P.vz += Math.cos(s.yaw) * 9; fx.explosion(P.x, P.y + 1, P.z, 0.6, 0x5cffb0); },
  ramTele() { toast('👻 ¡Carril verde! El galeón va a embestir', 1500); },
  broadsideTele() { },
};

/* ======================= combate del jugador ======================= */
/** Blanco más conveniente en el arco de un costado. */
function aimTarget(side) {
  const rx = -Math.cos(P.yaw) * side, rz = Math.sin(P.yaw) * side, sideYaw = Math.atan2(rx, rz);
  let best = null, bs = 1e9;
  const consider = (x, z, vx, vz, w, y = 0.8) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
    if (d > MAX_RANGE * 0.98 || d < 5) return;
    const off = Math.abs(wrap(Math.atan2(dx, dz) - sideYaw));
    if (off > 0.62) return;
    const sc = d * (1 + off * 1.5) * w;
    if (sc < bs) { const fl = d / 30; bs = sc; best = { x: x + vx * fl * 0.8, z: z + vz * fl * 0.8, y, d }; }
  };
  for (const s of enemies.ships) if (s.alive && !s.sinking && !s.boarded) consider(s.x, s.z, Math.sin(s.yaw) * s.speed + s.vx, Math.cos(s.yaw) * s.speed + s.vz, s.surrender ? 3 : 1);
  for (const sh of enemies.sharks) if (sh.alive && !sh.fled && (sh.exposed || sh.state === 'tele')) consider(sh.x, sh.z, 0, 0, 0.6);
  for (const c of world.cannons) if (!c.destroyed) consider(c.x, c.z, 0, 0, 1.1, c.y + 0.9);
  if (boss && boss.state === 'fight') {
    const s = boss.ship; if (!boss.ethereal) consider(s.x - Math.sin(s.yaw) * s.len * 0.3, s.z - Math.cos(s.yaw) * s.len * 0.3, Math.sin(s.yaw) * s.speed, Math.cos(s.yaw) * s.speed, 0.8);
    for (const c of boss.cannons) if (c.alive) consider(c.x, c.z, 0, 0, 0.7, c.turret.position.y + 0.8);
  }
  return best;
}
function playerFire(side) {
  const k = side > 0 ? 'R' : 'L';
  if (P.reload[k] > 0) { sfx.empty(); return false; }
  const tgt = S().opts.aim ? aimTarget(side) : null;
  const r = fireBroadside(P, side, balls, tgt, { spread: 1, dmg: 14 });
  for (const b of r.out) fx.muzzle(b.x, b.y, b.z, r.rx, r.rz);
  P.reload[k] = P.reloadMax;
  P.roll += -side * 0.06; P.vx -= r.rx * 0.6; P.vz -= r.rz * 0.6;
  sfx.volley(P.balls); fx.shake(0.18);
  S().stats.shots++;
  emit('fire');
  return true;
}
function useKit() {
  const s = S();
  if (s.kits <= 0) { toast('No tenés kits de reparación (comprá en el muelle)', 1500); sfx.denied(); return false; }
  if (P.hp >= P.maxHp - 0.5 && !P.mastLost && P.mast >= P.maxMast) { toast('El barco está sano', 1200); return false; }
  s.kits--; persist();
  P.hp = Math.min(P.maxHp, P.hp + 35);
  if (P.mastLost) { P.mastLost = false; P.mast = P.maxMast * 0.4; } else P.mast = Math.min(P.maxMast, P.mast + P.maxMast * 0.4);
  sfx.repair(); fx.sparkle(P.x, P.y + 3, P.z, 0x7ee35a, 12);
  ui.big('¡REPARADO!', '+35 CASCO', 1.1);
  emit('kit');
  return true;
}

/** Resolución de impactos de balas. */
function ballHit(b) {
  const wy = waveHeight(b.x, b.z);
  if (b.team === 'player') {
    for (const s of enemies.ships) {
      if (!s.alive || s.sinking || s.boarded) continue;
      if (b.y < s.y + s.model.top && b.y > s.y - 1.2 && hullDist(s, b.x, b.z) < s.wid * 0.5 + 0.5) {
        damageShip(s, b.dmg, b.y > s.y + s.model.deckY + 2.5 ? 'mast' : 'hull'); impact(b, s); return true;
      }
    }
    if (boss && (boss.state === 'fight') && b.y < boss.ship.y + boss.ship.model.top && hullDist(boss.ship, b.x, b.z) < boss.ship.wid * 0.5 + 0.6) {
      const mul = boss.zoneMul(b.x, b.z);
      if (mul === 0) { fx.sparkle(b.x, b.y, b.z, 0x5cffb0, 3); return false; }
      const dealt = boss.hurt(b.dmg * mul);
      if (mul < 0.5) { fx.sparkle(b.x, b.y, b.z, 0xb0c0c8, 4); sfx.hit(0.4); if (!run.armorMsg) { run.armorMsg = true; toast('🛡 ¡Blindaje! Apuntá a las troneras verdes o a la popa', 1800); } }
      else { fx.splinters(b.x, b.y, b.z, 5, 0x24312d); sfx.hit(1); }
      S().stats.hits++; void dealt;
      return true;
    }
    if (boss) for (const c of boss.cannons) if (c.alive && Math.hypot(b.x - c.x, b.z - c.z) < 3 && Math.abs(b.y - c.turret.position.y) < 3.2) { boss.hitCannon(c, b.dmg); fx.sparkle(b.x, b.y, b.z, 0x5cffb0, 6); sfx.hit(0.7); return true; }
    for (const sh of enemies.sharks) {
      if (!sh.alive || sh.fled) continue;
      const d = Math.hypot(b.x - sh.x, b.z - sh.z);
      if (sh.exposed && d < 4 && Math.abs(b.y - sh.y) < 3) { hurtShark(sh, b.dmg * 1.5); return true; }
      if (!sh.exposed && d < 2.2 && b.y < wy + 0.8) { hurtShark(sh, b.dmg * 0.4); return true; }
    }
    for (const c of world.cannons) {
      if (c.destroyed) continue;
      if (Math.hypot(b.x - c.x, b.z - c.z) < 2.8 && Math.abs(b.y - (c.y + 0.8)) < 2.6) {
        c.hp -= b.dmg; c.flash = 0.15; fx.splinters(b.x, b.y, b.z, 4, 0x6f6a62); sfx.hit(0.7); S().stats.hits++;
        if (c.hp <= 0) destroyCannon(c, 'shot');
        return true;
      }
    }
  } else if (P && P.alive && !P.sinking) {
    if (b.y < P.y + P.model.top && b.y > P.y - 1.2 && hullDist(P, b.x, b.z) < P.wid * 0.5 + 0.45) {
      hurtPlayer(b.dmg, (b.y > P.y + P.model.deckY + 2.5 || Math.random() < 0.2) ? 'mast' : 'hull', b.owner);
      fx.explosion(b.x, b.y, b.z, b.spectral ? 0.5 : 0.35, b.spectral ? 0x5cffb0 : 0xff8a2a);
      return true;
    }
  }
  const gh = world.heightAt(b.x, b.z);
  if (gh > wy && b.y < gh) { fx.smoke(b.x, gh + 0.3, b.z, 0x8a7a5a, 1.3); fx.splinters(b.x, gh + 0.3, b.z, 3, 0x8a7a5a); return true; }
  if (b.y < wy) {
    fx.splash(b.x, b.z, b.big > 1.2 ? 1.3 : 0.8);
    const near = Math.hypot(b.x - cam.x, b.z - cam.z);
    if (near < 70) sfx.splash(Math.max(0.2, 1 - near / 70));
    if (b.mortar && b.team === 'enemy' && P && !P.sinking && hullDist(P, b.x, b.z) < P.wid * 0.5 + 3.2) hurtPlayer(b.dmg * 0.6, 'hull', b.owner);
    return true;
  }
  return false;
}
function impact(b, s) { fx.explosion(b.x, b.y, b.z, 0.35); S().stats.hits++; void s; }

/* ======================= acciones contextuales ======================= */
const pk = () => input.isTouch ? 'ACCIÓN' : keyLabel(binds().act);
/** @returns {{label:string, hold?:number, fn?:()=>void, warn?:boolean}|null} */
function seaAction() {
  const slow = Math.abs(P.speed) < 4.8;
  const need = label => ({ label: `Bajá velas (${input.isTouch ? 'timón abajo' : 'S'}) para ${label}`, warn: true });
  if (chestFloat.on && Math.hypot(P.x - chestFloat.x, P.z - chestFloat.z) < 10) return { label: 'Recuperar el Cofre del Almirante', fn: recoverChest };
  for (const s of enemies.ships) if (s.surrender && !s.boarded && hullDist(s, P.x, P.z) < 11) return slow || Math.abs(P.speed) < 6.5 ? { label: 'Abordar la goleta', fn: () => startBoard(s) } : need('abordar');
  for (const c of world.castaways) if (!c.rescued && Math.hypot(P.x - c.x, P.z - c.z) < 9) return slow ? { label: 'Rescatar al náufrago', fn: () => rescue(c) } : need('rescatar');
  for (const d of world.docks) if (Math.hypot(P.x - d.x, P.z - d.z) < 10) return slow ? { label: `Atracar en ${d.name}`, fn: () => dockIn(d) } : need('atracar');
  if (world.fort && !world.fort.captured) {
    const fd = world.R.fort.dock;
    if (Math.hypot(P.x - fd.x, P.z - fd.z) < 11) {
      if (world.cannons.some(c => c.battery && !c.destroyed)) return { label: 'Silenciá las 4 baterías antes de desembarcar', warn: true };
      return slow ? { label: 'Desembarcar en el muelle del fuerte', fn: () => goFoot(world.islById[world.fort.isl], fd.x - 6, fd.z) } : need('desembarcar');
    }
  }
  const isl = world.landableNear(P.x, P.z, 8.5);
  if (isl && !isl.fort) return slow ? { label: `Desembarcar en ${isl.name}`, fn: () => goFoot(isl) } : need('desembarcar');
  return null;
}
function footAction() {
  const fd = Math.hypot(foot.x - dinghy.position.x, foot.z - dinghy.position.z);
  if (fd < 3) return { label: 'Volver al barco', fn: backToShip };
  for (const c of world.chests) if (!c.opened && Math.hypot(foot.x - c.x, foot.z - c.z) < 2.4) return { label: 'Abrir el cofre', fn: () => openChest(c) };
  for (const t of world.treasures) if (!t.dug && Math.hypot(foot.x - t.x, foot.z - t.z) < 2.3) return { label: 'Cavar el tesoro (mantené)', hold: 1.2, fn: () => digTreasure(t) };
  for (const c of world.cannons) if (!c.destroyed && Math.hypot(foot.x - c.x, foot.z - c.z) < 3.6) return { label: 'Clavar el cañón (mantené)', hold: 1.5, fn: () => destroyCannon(c, 'spike') };
  if (world.fort && !world.fort.captured && Math.hypot(foot.x - world.fort.flagPos.x, foot.z - world.fort.flagPos.z) < 3.2) return { label: 'Izar tu bandera (mantené)', hold: 2, fn: captureFort };
  return null;
}

function rescue(c) {
  c.rescued = true; c.group.visible = false;
  const rs = S().regions[world.id]; if (!rs.rescued.includes(c.id)) rs.rescued.push(c.id);
  S().stats.rescued++; persist();
  P.hp = Math.min(P.maxHp, P.hp + 10);
  const g = addGold(25, c.x, 1.5, c.z);
  emit('rescue'); sfx.rescue(); fx.ring(c.x, c.z, 1, 7, 1, 0xfff27a);
  ui.big('¡NÁUFRAGO A BORDO!', `+${g} ORO · +10 CASCO`, 1.6);
}
function dockIn(d) {
  state = 'docked'; run.dock = d; run.dockT = 0; d.docked = true; d.anim = 2.5;
  d.visited = true; S().regions[world.id].dock = true; persist();
  P.sail = 0; sfx.bell(); input.clear();
  ui.prompt(null);
  emit('dock');
}
function leaveDock() {
  const d = run.dock; if (!d) return;
  marketScreen.hide(); d.docked = false; run.dock = null;
  state = 'sail'; P.sail = 0.35; P.speed = 2; P.yaw = d.yaw; input.clear();
  sfx.sail(true);
}
function goFoot(isl, lx, lz) {
  state = 'foot'; foot.isl = isl;
  let ax = lx, az = lz;
  if (ax === undefined) { const a = Math.atan2(P.x - isl.x, P.z - isl.z); ax = isl.x + Math.sin(a) * isl.r * 0.86; az = isl.z + Math.cos(a) * isl.r * 0.86; }
  foot.x = ax; foot.z = /** @type {number} */ (az); foot.y = world.heightAt(foot.x, foot.z);
  foot.yaw = Math.atan2(isl.x - foot.x, isl.z - foot.z); foot.camYaw = foot.yaw; foot.dig = 0;
  const da = Math.atan2(foot.x - isl.x, foot.z - isl.z);
  dinghy.position.set(foot.x + Math.sin(da) * 2.6, Math.max(0.1, world.heightAt(foot.x + Math.sin(da) * 2.6, foot.z + Math.cos(da) * 2.6)) + 0.1, foot.z + Math.cos(da) * 2.6);
  if (lx !== undefined) dinghy.position.set(lx + 2.5, 1.3, /** @type {number} */ (lz));
  dinghy.rotation.y = da; dinghy.visible = true;
  cap.group.visible = true; P.sail = 0; P.speed *= 0.3;
  sfx.splash(0.6); input.clear();
  emit('land');
  ui.big(isl.name.toUpperCase(), 'EN TIERRA FIRME', 1.4);
}
function backToShip() {
  state = 'sail'; cap.group.visible = false; dinghy.visible = false; foot.isl = null; input.clear();
  sfx.splash(0.6);
}
function openChest(c) {
  c.opened = true; c.opening = true;
  const rs = S().regions[world.id]; if (!rs.chests.includes(c.id)) rs.chests.push(c.id); persist();
  sfx.chest(); fx.sparkle(c.x, c.y + 1, c.z, 0xffe27a, 14);
  setTimeout(() => { c.gold.visible = false; }, 1200);
  reward(c.reward, c.amount, c.x, c.y + 1.2, c.z);
  emit('chest');
}
function digTreasure(t) {
  t.dug = true; t.mark.visible = false; t.hole.visible = true; t.rise = 0;
  const rs = S().regions[world.id]; if (!rs.dug.includes(t.id)) rs.dug.push(t.id);
  S().stats.treasures++; persist();
  t.chest = world.makeChest(t.x + 1.4, t.y, t.z, 0.4, false); t.chest.g.position.y = t.y - 1; t.chest.opening = false;
  setTimeout(() => { if (t.chest) t.chest.opening = true; }, 900);
  fx.smoke(t.x, t.y + 0.3, t.z, 0xc8b07a, 1.6); sfx.chest();
  reward(t.reward, t.amount, t.x, t.y + 1.2, t.z);
  emit('treasure');
}
function captureFortVisual() {
  const f = world.fort; f.captured = true;
  /** @type {any} */ (f.flag.material).color.setHex(0xffbe3d);
}
function captureFort() {
  captureFortVisual();
  S().fort = true; persist();
  emit('fort'); sfx.win();
  ui.big('¡FUERTE CAPTURADO!', 'EL MAR SE OSCURECE…', 2.5);
  addGold(200, world.fort.flagPos.x, world.fort.gy + 3, world.fort.flagPos.z);
  setTimeout(() => { if (state === 'foot') backToShip(); }, 1800);
}
/* ---------- abordaje (minijuego de sincronización) ---------- */
function startBoard(s) {
  state = 'board'; P.sail = 0; P.speed *= 0.2; input.clear();
  run.qte = { s, needle: 0, dir: 1, hits: 0, need: 3, zone: newZone(0), t: 0, cool: 0 };
  sfx.board(); ui.big('¡AL ABORDAJE!', '', 1.0);
}
function newZone(h) { const w = Math.max(0.12, 0.24 - h * 0.035 - (diffName() === 'extremo' ? 0.04 : 0)); const a = 0.08 + Math.random() * (0.84 - w); return [a, a + w]; }
function boardPress() {
  const q = run.qte; if (!q || q.cool > 0) return;
  if (q.needle >= q.zone[0] && q.needle <= q.zone[1]) {
    q.hits++; sfx.clash(); fx.sparkle(q.s.x, q.s.y + 3, q.s.z, 0xffffff, 8);
    if (q.hits >= q.need) { finishBoard(true); return; }
    q.zone = newZone(q.hits);
  } else { sfx.miss(); hurtPlayer(5 * diff().dmg, 'hull'); q.cool = 0.4; }
}
function finishBoard(ok) {
  const q = run.qte; run.qte = null; ui.qte({ on: false });
  if (!ok) { state = 'sail'; return; }
  const s = q.s; s.boarded = true; s.surrender = false; s.model.white.visible = false;
  /** @type {any} */ (s.model.flag.material).color.setHex(0xffbe3d);
  s.sail = 0;
  S().stats.boarded++; persist();
  const g = addGold(130, s.x, s.y + 3, s.z);
  const k = S(); if (k.kits < MAX_KITS) { k.kits++; persist(); }
  emit('board'); sfx.win();
  ui.big('¡GOLETA ABORDADA!', `+${g} ORO · +1 KIT`, 2);
  state = 'sail';
  setTimeout(() => { if (s.model) { s.sinking = true; s.sinkT = 0; } }, 6000);
}

/* ---------- jefe ---------- */
function triggerBoss() {
  if (boss || !world || world.id !== 'coral') return;
  run.bossTriggered = true;
  boss = createBoss({ scene, arena: world.R.boss, fx, sfx, diff, balls, rand, hooks: BH });
  const s = boss.ship;
  s.y = -16; s.x = world.R.boss.x; s.z = world.R.boss.z + 10; s.yaw = Math.atan2(P.x - s.x, P.z - s.z);
  state = 'cutscene'; closeTip(); input.clear();
  sfx.ghost(); setTimeout(() => sfx.roar(), 900);
  ui.big('ALMIRANTE ESPECTRAL', 'GALEÓN ACORAZADO CON CAÑONES ENCANTADOS', 3.6);
  cut = { t: 0, dur: 5.2, end() { boss.startFight(); state = 'sail'; setTimeout(() => tip('boss'), 600); emit('bossStart'); } };
}
function spawnAdmiralChest(x, z) {
  S().admiral = true; persist();
  emit('admiral');
  const base = world.makeChest(x, 0, z, 0, false); base.g.scale.setScalar(1.8);
  chestFloat.mesh = base.g; chestFloat.chest = base; chestFloat.x = x; chestFloat.z = z; chestFloat.on = true;
  chestFloat.ring = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 30, 20, 1, true), glowMat(0x7affc8, { opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  chestFloat.ring.position.set(x, 15, z); scene.add(chestFloat.ring);
  ui.big('¡ALMIRANTE DERROTADO!', 'RECUPERÁ SU COFRE', 3);
  sfx.win();
  sea.amp = world.env.water.amp;
}
function recoverChest() {
  chestFloat.on = false; chestFloat.chest.opening = true;
  sfx.chest(); fx.gold(chestFloat.x, 2, chestFloat.z, 30);
  const g = addGold(500, chestFloat.x, 2, chestFloat.z);
  emit('chestAdmiral');
  victory(g);
}

/* ---------- fin ---------- */
function playerSinks() {
  if (state === 'sinking') return;
  state = 'sinking'; P.sinking = true; P.sinkT = 0; run.sinkT = 3.4;
  sfx.sink(); fx.explosion(P.x, P.y + 2, P.z, 1.2);
  ui.big('¡A PIQUE!', '', 2.5); closeTip();
  if (run.qte) { run.qte = null; ui.qte({ on: false }); }
}
function defeat() {
  state = 'defeat'; input.showTouch(false); ui.show(false);
  endRun(false);
  run.result = { kind: 'defeat' };
  sfx.lose();
  endScreen.show(`<span class="k3-kicker">BARCO HUNDIDO</span><h1>¡A PIQUE!</h1>
    <p>El ${world.R.name} se tragó tu barco. Volvés al punto de entrada de la región con el progreso que tenías al llegar (fragmentos, oro y mejoras).</p>
    <div class="ca-menu-prog">Botín total: <b>${S().plunder}</b> · Hundidos en esta partida: ${run.kills} · Fragmentos: ${S().fragments}/3</div>
    <div class="k3-btnrow"><button class="k3-b" data-retry>↻ Reintentar la región</button><button class="k3-b alt" data-menu>🏴‍☠️ Menú</button></div>`);
}
function victory(chestGold) {
  state = 'victory'; input.showTouch(false); ui.show(false); closeTip();
  const s = S();
  const total = s.plunder;
  s.wins++; s.bestScore = Math.max(s.bestScore, total); persist();
  M.runEnd({ won: true }); A.ended({ score: total });
  run.result = { kind: 'victory', score: total };
  const st = s.stats;
  // campaña cumplida: se reinicia el progreso (logros, récord, estadísticas y opciones quedan)
  for (const k of CAMPAIGN_KEYS) /** @type {any} */ (s)[k] = structuredClone(/** @type {any} */ (SAVE_DEFAULTS)[k]);
  s.kits = diff().kits; persist();
  sfx.win();
  endScreen.show(`<span class="k3-kicker">COFRE DEL ALMIRANTE RECUPERADO · +${chestGold} ORO</span><h1>¡VICTORIA!</h1>
    <p>El Almirante Espectral descansa en el abismo y su cofre es tuyo. Sos la leyenda de los tres mares.</p>
    <table class="ca-table"><tr><td>Botín total</td><td class="n"><b>${total}</b></td></tr><tr><td>Barcos hundidos (total)</td><td class="n">${st.sunk}</td></tr>
    <tr><td>Náufragos rescatados</td><td class="n">${st.rescued}</td></tr><tr><td>Tesoros desenterrados</td><td class="n">${st.treasures}</td></tr><tr><td>Récord</td><td class="n">${s.bestScore}</td></tr></table>
    <div class="k3-btnrow"><button class="k3-b" data-new>⛵ Nueva campaña</button><button class="k3-b alt" data-menu>🏴‍☠️ Menú</button></div>`);
}

/* ======================= actualización ======================= */
function update(dt) {
  if (overlay) { input.endStep(); return; }
  water.update(dt, camera, camera.far);
  if (!ACTIVE.has(state)) {
    if (world) world.update(dt);
    if (P) stepShip(P, dt, world, world.R.wind, {});
    fx.update(dt, camera);
    orbitCamera(dt);
    input.endStep(); ui.tick(dt);
    return;
  }
  run.time += dt;
  const wind = world.R.wind;
  if (state === 'cutscene' && cut) {
    if (input.hit('Space', 'Enter', 'F15', 'btn:act', binds().act) || cutSkip) { cut.t = Math.max(cut.t, cut.dur - 0.01); cutSkip = false; }
    cut.t += dt;
    const k = Math.min(1, cut.t / (cut.dur * 0.8));
    boss.ship.y = -16 + 16 * (1 - Math.pow(1 - k, 3));
    run.bossFog = Math.min(1, run.bossFog + dt * 0.4);
    P.sail = 0; P.steer = 0; stepShip(P, dt, world, wind, {});
    boss.update(dt, P, false);
    if (Math.random() < 0.8) fx.churn(boss.ship.x + (Math.random() - 0.5) * 20, boss.ship.z + (Math.random() - 0.5) * 30, 3);
    world.update(dt); fx.update(dt, camera); ui.tick(dt);
    cutCamera(dt);
    if (cut.t >= cut.dur) { const c = cut; cut = null; boss.ship.y = 0; c.end(); }
    input.endStep();
    return;
  }
  if (state === 'travel') {
    run.travelT -= dt;
    P.sail = 1; P.steer = 0; stepShip(P, dt, world, wind, {});
    fx.update(dt, camera); followCamera(dt);
    if (run.travelT <= 0) { const to = run.travelTo; ui.fade(false); enterRegion(to, 'gate'); }
    input.endStep(); return;
  }
  // timers del jugador
  P.reload.L = Math.max(0, P.reload.L - dt); P.reload.R = Math.max(0, P.reload.R - dt);
  if (P.scrapeT > 0) P.scrapeT -= dt;
  if (state === 'sail') playerSail(dt);
  else if (state === 'foot') { P.sail = 0; P.steer = 0; playerFoot(dt); }
  else if (state === 'docked') { P.sail = 0; P.steer = 0; dockedStep(dt); }
  else if (state === 'board') { P.sail = 0; P.steer = 0; boardStep(dt); }
  else if (state === 'sinking') { run.sinkT -= dt; if (run.sinkT <= 0) { defeat(); input.endStep(); return; } }

  // mundo
  if (state !== 'docked') stepShip(P, dt, world, wind, { onCoast: coastHit });
  else { const d = run.dock; run.dockT += dt; const k = Math.min(1, dt * 2); P.x += (d.x - P.x) * k; P.z += (d.z - P.z) * k; P.yaw += wrap(d.yaw - P.yaw) * k; P.speed = 0; stepShip(P, 0, world, wind, {}); }
  enemies.update(dt, dbg.freeze);
  for (const s of enemies.ships) {
    if (!s.alive) continue;
    stepShip(s, dt, world, wind, {});
    if (s.sinking && s.sinkT > 5) { s.alive = false; s.model.group.visible = false; }
  }
  if (boss) {
    if (dbg.freeze && boss.state === 'fight') { boss.ship.sail = 0; boss.ship.steer = 0; } else boss.update(dt, P, state === 'foot');
    if (boss.ship.alive) stepShip(boss.ship, dt, world, wind, {});
  }
  const all = [P, ...enemies.ships.filter(s => s.alive && !s.sinking)];
  if (boss && boss.ship.alive && !boss.ship.sinking && !boss.ethereal) all.push(boss.ship);
  collideShips(all, onShipHit);
  whirlpool(dt);
  balls.update(dt, ballHit);
  world.update(dt);
  fx.update(dt, camera);
  wakes(dt);
  // fin de batalla limpia (secundaria «sin perder el mástil»)
  const bt = run.battle;
  if (bt.on) {
    const eng = enemies.engaged() + (boss && boss.state === 'fight' ? 1 : 0);
    if (eng === 0) { bt.quiet += dt; if (bt.quiet > 2.5) { bt.on = false; if (bt.kills > 0 && !bt.mast && !P.mastLost) { emit('cleanBattle'); toast('⚓ ¡Batalla ganada sin perder el mástil!', 2200); } } }
    else bt.quiet = 0;
  }
  // corrientes
  if (state === 'sail') for (const g of world.gates) {
    const d = Math.hypot(P.x - g.x, P.z - g.z);
    if (d < 30) tip('gate');
    if (d < 9) {
      if (g.active) { state = 'travel'; run.travelT = 1.2; run.travelTo = g.to; ui.fade(true); sfx.portal(); emit('gate'); closeTip(); }
      else if (run.gateMsgT <= 0) { run.gateMsgT = 4; toast(`🔒 ${g.label}: necesitás ${g.need} fragmento${g.need > 1 ? 's' : ''} del mapa (tenés ${S().fragments})`, 2400); sfx.denied(); }
    }
  }
  run.gateMsgT -= dt;
  // jefe: aparece al acercarse a su arena con el fuerte tomado
  if (world.id === 'coral' && S().fort && !S().admiral && !boss && state === 'sail' && Math.hypot(P.x - world.R.boss.x, P.z - world.R.boss.z) < 95) triggerBoss();
  // niebla del jefe
  const fogF = /** @type {THREE.Fog} */ (scene.fog);
  if (boss && boss.state !== 'dead') run.bossFog = Math.min(1, run.bossFog + dt * 0.3); else run.bossFog = Math.max(0, run.bossFog - dt * 0.3);
  if (run.bossFog > 0) fogF.color.setHex(world.env.fog).lerp(_green, run.bossFog * 0.6);
  // sonidos ambientales
  run.waveSfxT -= dt; if (run.waveSfxT <= 0) { run.waveSfxT = 1.6 + Math.random(); sfx.wave(); }
  run.creakT -= dt; if (run.creakT <= 0) { run.creakT = 3 + Math.random() * 3; if (Math.abs(P.speed) > 2) sfx.creak(); }
  if (state === 'foot') footCamera(dt); else if (state === 'board') boardCamera(dt); else if (state === 'sinking') sinkCamera(dt); else followCamera(dt);
  contextTips(dt);
  ui.tick(dt);
  hudTick(dt);
  input.endStep();
}
const _green = new THREE.Color(0x1e4a3a);

function playerSail(dt) {
  const a = input.axis(), o = S().opts;
  // timón: x>0 (derecha) gira a estribor (el yaw decrece hacia la derecha con la cámara detrás)
  P.steer = clamp(-a.x * o.sens, -1.3, 1.3);
  const before = P.sail;
  if (Math.abs(a.y) > 0.25) P.sail = clamp(P.sail - a.y * dt * 1.2, 0, 1);
  if (Math.abs(P.sail - before) > 0 && (P.sail === 0 || P.sail === 1 || Math.round(P.sail * 4) !== Math.round(before * 4))) sfx.sail(P.sail > before);
  P.row = P.sail < 0.02 && a.y > 0.5 ? 1 : 0;
  if (input.hit(binds().port, 'F13', 'btn:port')) playerFire(-1);
  if (input.hit(binds().star, 'F14', 'btn:star')) playerFire(1);
  if (input.hit(binds().kit, 'F16', 'btn:kit')) useKit();
  run.action = seaAction();
  if (run.action && run.action.fn && input.hit(binds().act, 'F15', 'btn:act')) { const f = run.action.fn; run.action = null; f(); }
  run.moved += Math.abs(P.speed) * dt;
  // guía de puntería
  for (const side of [-1, 1]) {
    const k = side > 0 ? 'R' : 'L';
    run.aim[k] = o.aim ? aimTarget(side) : null;
  }
}
function playerFoot(dt) {
  const a = input.axis();
  const f = { x: Math.sin(foot.camYaw), z: Math.cos(foot.camYaw) }, r = { x: -Math.cos(foot.camYaw), z: Math.sin(foot.camYaw) };
  let mx = (f.x * -a.y + r.x * a.x), mz = (f.z * -a.y + r.z * a.x);
  const l = Math.hypot(mx, mz);
  const sp = 6.5;
  if (l > 0.1) {
    mx /= Math.max(1, l); mz /= Math.max(1, l);
    const nx = foot.x + mx * sp * dt, nz = foot.z + mz * sp * dt;
    foot.yaw = Math.atan2(mx, mz);
    foot.x = nx; foot.z = nz; foot.walk += dt * 9 * Math.min(1, l);
    if (Math.sin(foot.walk) * Math.sin(foot.walk - dt * 9) < 0) sfx.step();
  }
  // límites: dentro de la isla y fuera de las murallas del fuerte
  const isl = foot.isl, dx = foot.x - isl.x, dz = foot.z - isl.z, d = Math.hypot(dx, dz), max = isl.r * 0.9;
  if (d > max) { foot.x = isl.x + dx / d * max; foot.z = isl.z + dz / d * max; }
  if (world.fort && isl.fort) fortWalls(foot);
  foot.y = world.heightAt(foot.x, foot.z);
  // cueva
  const cv = world.cave;
  if (cv && !cv.found && Math.hypot(foot.x - cv.x, foot.z - cv.z) < cv.r) {
    cv.found = true; S().regions[world.id].cave = true; persist();
    emit('cave'); sfx.bell(); ui.big('¡CUEVA DESCUBIERTA!', 'LA GRUTA DEL ECO', 2); fx.sparkle(cv.x, cv.y + 1, cv.z, 0x9ad8ff, 14);
  }
  run.action = footAction();
  const act = run.action, holding = input.down(binds().act) || input.down('F15') || input.button('act');
  if (act && act.fn) {
    if (act.hold) {
      if (holding) { foot.dig += dt; foot.act += dt * 12; if (Math.floor(foot.dig * 4) !== Math.floor((foot.dig - dt) * 4)) { sfx.dig(); fx.smoke(foot.x + Math.sin(foot.yaw), foot.y + 0.2, foot.z + Math.cos(foot.yaw), 0xc8b07a, 0.7); } if (foot.dig >= act.hold) { foot.dig = 0; const fn = act.fn; run.action = null; fn(); } }
      else foot.dig = Math.max(0, foot.dig - dt * 2);
    } else if (input.hit(binds().act, 'F15', 'btn:act')) { const fn = act.fn; run.action = null; fn(); }
  } else foot.dig = 0;
  // pose del capitán
  cap.group.position.set(foot.x, foot.y, foot.z); cap.group.rotation.y = foot.yaw;
  const sw = l > 0.1 ? Math.sin(foot.walk) * 0.6 : 0;
  cap.legL.rotation.x = sw; cap.legR.rotation.x = -sw;
  cap.arm.rotation.x = foot.dig > 0 ? -1.2 + Math.sin(foot.act) * 0.8 : -sw * 0.6;
}
function fortWalls(p) {
  const f = world.R.fort, isl = world.islById[f.isl], Wl = f.wall, cx = isl.x, cz = isl.z, t = 1.4;
  const lx = p.x - cx, lz = p.z - cz;
  if (Math.abs(lz) < Wl + t && Math.abs(Math.abs(lx) - Wl) < t) p.x = cx + Math.sign(lx) * (Math.abs(lx) < Wl ? Wl - t : Wl + t);
  if (Math.abs(lx) < Wl + t && Math.abs(lz - Wl) < t) p.z = cz + (lz < Wl ? Wl - t : Wl + t);
  if (Math.abs(lx) < Wl + t && Math.abs(lx) > 4.2 && Math.abs(lz + Wl) < t) p.z = cz + (lz < -Wl ? -Wl - t : -Wl + t);
}
function dockedStep(dt) {
  if (run.dockT > 1.1 && !marketScreen.visible && !overlay) showMarket();
  void dt;
}
function boardStep(dt) {
  const q = run.qte; if (!q) { state = 'sail'; return; }
  q.t += dt; q.cool = Math.max(0, q.cool - dt);
  if (input.hit(binds().act, 'F15', 'btn:act', 'Enter')) boardPress(); // se evalúa la aguja que el jugador está viendo
  if (!run.qte) return;
  const sp = 0.9 + q.hits * 0.28;
  q.needle += q.dir * sp * dt; if (q.needle > 1) { q.needle = 1; q.dir = -1; } if (q.needle < 0) { q.needle = 0; q.dir = 1; }
  if (run.qte) ui.qte({ on: true, zone: run.qte.zone, needle: run.qte.needle, hits: run.qte.hits, need: run.qte.need, text: `Tocá ${pk()} cuando la aguja esté en la zona verde (${run.qte.hits}/${run.qte.need})` });
  // mantener los barcos juntos
  if (run.qte) { const s = run.qte.s; s.speed *= 0.9; P.speed *= 0.9; }
}
function coastHit(s, impact) {
  if (s !== P || impact < 4 || P.scrapeT > 0) return;
  P.scrapeT = 0.8;
  hurtPlayer((impact - 4) * 1.6 + 2, 'hull');
  sfx.crack(); fx.splinters(P.x + Math.sin(P.yaw) * 4, P.y + 1, P.z + Math.cos(P.yaw) * 4, 6);
  if (!run.coastMsg) { run.coastMsg = true; toast('🪨 ¡Cuidado con las rocas! El roce rompe el casco', 1800); }
}
function onShipHit(a, b, rel) {
  for (const [x, y] of [[a, b], [b, a]]) {
    if (x.kind === 'lancha' && x.ai && x.ai.state === 'dash' && y === P) {
      const zone = hitZone(P, x.x, x.z);
      hurtPlayer(12 * diff().dmg * (zone === 'bow' ? 0.5 : 1), 'hull', x);
      damageShip(x, zone === 'bow' ? 30 : 10, 'hull');
      x.ai.state = 'evade'; x.ai.t = 2.4; x.ai.cd = 3.5;
      fx.explosion((x.x + P.x) / 2, 1.5, (x.z + P.z) / 2, 0.5);
      if (zone === 'bow') ui.big('¡DE PROA!', 'LA LANCHA SE ROMPIÓ', 1.1);
      return;
    }
  }
  if (a === P || b === P) {
    const o = a === P ? b : a;
    if (rel > 3) { damageShip(o, rel * 1.6, 'hull'); hurtPlayer(rel * 0.6, 'hull'); sfx.crack(); }
  }
}
function whirlpool(dt) {
  const w = sea.whirl; if (w.s <= 0) return;
  for (const s of [P, ...enemies.ships]) {
    if (!s.alive || s.sinking) continue;
    const dx = w.x - s.x, dz = w.z - s.z, d = Math.hypot(dx, dz) || 1;
    if (d > w.r * 1.3) continue;
    const k = (1 - Math.min(1, d / (w.r * 1.3))) * w.s;
    s.vx += (dx / d * 4.5 + dz / d * 3) * k * dt * 2.2; s.vz += (dz / d * 4.5 - dx / d * 3) * k * dt * 2.2;
    if (s === P && d < 9) { hurtPlayer(10 * dt, 'hull'); if (Math.random() < 0.3) fx.churn(P.x, P.z, 2); }
  }
  if (Math.random() < 0.5 * w.s) { const a = Math.random() * 6.28, r = Math.random() * w.r; fx.churn(w.x + Math.cos(a) * r, w.z + Math.sin(a) * r, 2.2); }
}
function wakes(dt) {
  const q = QUAL[game.quality];
  const ships = [P, ...enemies.ships.filter(s => s.alive && !s.sinking)];
  if (boss && boss.ship.alive && !boss.ship.sinking) ships.push(boss.ship);
  for (const s of ships) {
    const sp = Math.abs(s.speed);
    if (sp < 1.2) continue;
    s.wakeT -= dt;
    if (s.wakeT > 0) continue;
    s.wakeT = q.wakeEvery * (s === P ? 1 : 1.6);
    const fx0 = Math.sin(s.yaw), fz0 = Math.cos(s.yaw), rx = -fz0, rz = fx0;
    const bx = s.x - fx0 * s.len * 0.48, bz = s.z - fz0 * s.len * 0.48;
    fx.wake(bx + rx * s.wid * 0.3, bz + rz * s.wid * 0.3, 1 + sp * 0.06, 2.2);
    fx.wake(bx - rx * s.wid * 0.3, bz - rz * s.wid * 0.3, 1 + sp * 0.06, 2.2);
    if (sp > 6) { const px = s.x + fx0 * s.len * 0.48, pz = s.z + fz0 * s.len * 0.48; fx.spray(px, s.y + 0.6, pz, fx0 * sp * 0.5, fz0 * sp * 0.5, 1); fx.wake(px + rx * s.wid * 0.5, pz + rz * s.wid * 0.5, 0.9, 1.4); fx.wake(px - rx * s.wid * 0.5, pz - rz * s.wid * 0.5, 0.9, 1.4); }
  }
}
function contextTips(dt) {
  if (tipId) { tipT -= dt; if (tipT <= 0 || (tipId === 'sail' && run.moved > 60)) closeTip(); return; }
  if (state === 'sail') {
    if (run.moved > 30 && world.landableNear(P.x, P.z, 18)) tip('land');
    for (const d of world.docks) if (Math.hypot(P.x - d.x, P.z - d.z) < 30 && run.time > 20) tip('dock');
  } else if (state === 'foot') {
    for (const t of world.treasures) if (!t.dug && Math.hypot(foot.x - t.x, foot.z - t.z) < 8) tip('dig');
  }
}

/* ======================= render y cámara ======================= */
const _arc = new Float32Array(22 * 3);
let rTime = 0;
function render() {
  rTime = performance.now() / 1000;
  if (P) poseShip(P, rTime);
  if (enemies) for (const s of enemies.ships) if (s.alive) {
    poseShip(s, rTime);
    for (const k of ['L', 'R']) { const pm = k === 'R' ? s.model.ports.neg : s.model.ports.pos; if (!pm) continue; const o = s.tele[k] > 0 ? 0.5 + 0.5 * Math.sin(rTime * 25) : 0; pm.visible = o > 0; /** @type {any} */ (pm.material).opacity = o; }
  }
  if (boss && boss.ship.alive) poseShip(boss.ship, rTime);
  if (chestFloat.mesh) { chestFloat.mesh.position.y = waveHeight(chestFloat.x, chestFloat.z) - 0.2; chestFloat.mesh.rotation.z = Math.sin(rTime * 1.4) * 0.08; chestFloat.ring.visible = chestFloat.on; }
  // guía de puntería
  for (let i = 0; i < 2; i++) {
    const k = i ? 'R' : 'L', side = i ? 1 : -1, line = aimLines[i], tg = run.aim[k];
    line.visible = state === 'sail' && !!tg && !!P && !P.sinking;
    if (!line.visible) continue;
    const rx = -Math.cos(P.yaw) * side, rz = Math.sin(P.yaw) * side;
    let dirYaw = Math.atan2(rx, rz); const dx = tg.x - P.x, dz = tg.z - P.z;
    dirYaw += clamp(wrap(Math.atan2(dx, dz) - dirYaw), -0.45, 0.45);
    arcPoints(P.x + rx * (P.wid / 2 + 0.5), P.y + P.model.portY, P.z + rz * (P.wid / 2 + 0.5), dirYaw, elevationFor(Math.min(MAX_RANGE, Math.hypot(dx, dz)), (tg.y ?? 0.8) - (P.y + P.model.portY)), 22, _arc);
    const pa = /** @type {THREE.BufferAttribute} */ (line.geometry.attributes.position); pa.array.set(_arc); pa.needsUpdate = true;
    /** @type {any} */ (line.material).color.setHex(P.reload[k] > 0 ? 0x8a8a8a : 0xffbe3d);
    /** @type {any} */ (line.material).opacity = P.reload[k] > 0 ? 0.35 : 0.85;
  }
}
function placeCamBehind() { const d = 26; cam.x = P.x - Math.sin(cam.yaw) * d; cam.z = P.z - Math.cos(cam.yaw) * d; cam.y = 10; cam.lx = P.x; cam.ly = 2; cam.lz = P.z; }
function setFov(f) { cam.fov += (f - cam.fov) * 0.1; if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); } }
function applyCam(dt, tx, ty, tz, lx, ly, lz, k = 5) {
  const a = Math.min(1, dt * k);
  cam.x += (tx - cam.x) * a; cam.y += (ty - cam.y) * a; cam.z += (tz - cam.z) * a;
  cam.lx += (lx - cam.lx) * Math.min(1, dt * 8); cam.ly += (ly - cam.ly) * Math.min(1, dt * 8); cam.lz += (lz - cam.lz) * Math.min(1, dt * 8);
  const sh = fx.shakeAmt * 0.5;
  const cy = Math.max(cam.y, waveHeight(cam.x, cam.z) + 1.5, world ? world.heightAt(cam.x, cam.z) + 3 : 0);
  camera.position.set(cam.x + (Math.random() - 0.5) * sh, cy + (Math.random() - 0.5) * sh, cam.z + (Math.random() - 0.5) * sh);
  camera.lookAt(cam.lx, cam.ly, cam.lz);
  sun.target.position.set(cam.lx, 0, cam.lz); const sd = world ? world.env.sunDir : [60, 90, 30]; sun.position.set(cam.lx + sd[0], sd[1], cam.lz + sd[2]);
}
function followCamera(dt) {
  const portrait = camera.aspect < 0.85, o = S().opts, sp = Math.abs(P.speed);
  cam.yaw += wrap(P.yaw - cam.yaw) * Math.min(1, dt * 2.2);
  const bossOn = boss && boss.state === 'fight';
  let dist = (o.cam === 'cerca' ? 19 : 25) + sp * 0.35 + (portrait ? 9 : 0) + (bossOn ? 9 : 0);
  let h = (o.cam === 'cerca' ? 8 : 10) + (portrait ? 6 : 0) + (bossOn ? 5 : 0);
  // la cámara no se mete en las islas: se acerca y sube
  for (let i = 0; i < 8 && world.heightAt(P.x - Math.sin(cam.yaw) * dist, P.z - Math.cos(cam.yaw) * dist) > -1; i++) { dist *= 0.82; h += 1.6; }
  applyCam(dt, P.x - Math.sin(cam.yaw) * dist, P.y + h, P.z - Math.cos(cam.yaw) * dist, P.x + Math.sin(P.yaw) * 7, P.y + 2.5, P.z + Math.cos(P.yaw) * 7, 4);
  setFov(58 + Math.min(8, sp * 0.4) + (portrait ? 10 : 0));
}
function footCamera(dt) {
  const portrait = camera.aspect < 0.85;
  const d = portrait ? 12 : 10, h = portrait ? 16 : 13;
  applyCam(dt, foot.x - Math.sin(foot.camYaw) * d, foot.y + h, foot.z - Math.cos(foot.camYaw) * d, foot.x, foot.y + 0.8, foot.z, 4);
  setFov(50 + (portrait ? 12 : 0));
}
function boardCamera(dt) {
  const q = run.qte; const s = q ? q.s : P;
  const mx = (s.x + P.x) / 2, mz = (s.z + P.z) / 2, a = P.yaw + Math.PI / 2;
  applyCam(dt, mx + Math.sin(a) * 18, 9, mz + Math.cos(a) * 18, mx, 3, mz, 3);
}
function sinkCamera(dt) { cam.orbit += dt * 0.4; applyCam(dt, P.x + Math.sin(cam.orbit) * 22, 9, P.z + Math.cos(cam.orbit) * 22, P.x, P.y + 1, P.z, 2); }
function cutCamera(dt) {
  const s = boss.ship; cam.orbit += dt * 0.25;
  applyCam(dt, s.x + Math.sin(cam.orbit) * 46, 14, s.z + Math.cos(cam.orbit) * 46, s.x, s.y + 6, s.z, 2);
  setFov(52);
}
function orbitCamera(dt) {
  cam.orbit += dt * (reduced() ? 0 : 0.05);
  const portrait = camera.aspect < 0.85;
  const cx = P ? P.x : 0, cz = P ? P.z : 0, r = portrait ? 40 : 30;
  applyCam(1, cx + Math.sin(cam.orbit) * r, portrait ? 22 : 14, cz + Math.cos(cam.orbit) * r, cx, 3, cz, 1);
  setFov(58);
}
function applyQuality() {
  const q = QUAL[game.quality] || QUAL.medium;
  water.applyQuality(q);
  const f = /** @type {THREE.Fog} */ (scene.fog);
  if (world) { f.near = world.env.fogNear * q.fogMul; f.far = Math.min(q.far * 0.95, world.env.fogFar * q.fogMul); world.applyQuality(q); }
  camera.far = q.far; camera.updateProjectionMatrix();
  fx.setCap(q.particles);
  fx.setWake(game.quality === 'low' ? 0.7 : 1);
}

/* ======================= HUD ======================= */
let hudAcc = 0, mapAcc = 0;
function objective() {
  const s = S(), id = world.id;
  const tr = id2 => world.treasures.find(t => t.id === id2), ch = id2 => world.chests.find(c => c.id === id2);
  if (chestFloat.on) return { t: 'Recuperá el Cofre del Almirante', g: chestFloat };
  if (boss && boss.state === 'fight') return { t: 'Hundí al Almirante Espectral', g: boss.ship };
  if (id === 'bahia') {
    const t = tr('b_t1');
    if (s.fragments < 1 && t && !t.dug) return { t: 'Fragmento: cavá la X de la Isla del Loro', g: t };
    return { t: 'Navegá a la Corriente de la Bruma (norte)', g: world.gates[0] };
  }
  if (id === 'bruma') {
    if (s.fragments >= 3) return { t: 'Corriente del Coral Negro (norte)', g: world.gates[0] };
    const c = ch('r_c1'), t = tr('r_t1');
    if (c && !c.opened) return { t: 'Fragmento: explorá la cueva de la Isla del Eco', g: c };
    if (t && !t.dug) return { t: 'Fragmento: cavá la X de la Isla de los Mástiles', g: t };
    if (s.fragments < 1) return { t: 'Te falta el fragmento de la Bahía (viajá desde un muelle)', g: world.docks[0] };
    return { t: 'Explorá el archipiélago', g: null };
  }
  if (!s.fort) {
    const left = world.cannons.filter(c => c.battery && !c.destroyed);
    if (left.length) return { t: `Silenciá las baterías del fuerte (${4 - left.length}/4)`, g: left[0] };
    return { t: 'Desembarcá en el muelle del fuerte e izá tu bandera', g: world.R.fort.dock };
  }
  return { t: 'Buscá al Almirante Espectral (sur del fuerte)', g: world.R.boss };
}
function hudTick(dt) {
  hudAcc += dt; mapAcc += dt;
  if (hudAcc < 0.1 || !P || !world) return;
  hudAcc = 0;
  const s = S(), ob = objective();
  ui.status({ region: world.R.name, hull: Math.max(0, P.hp), maxHull: P.maxHp, mast: P.mast, maxMast: P.maxMast, mastLost: P.mastLost, sailN: Math.round(P.sail * 4), knots: Math.max(0, Math.round(P.speed * 1.94)), gold: s.gold, kits: s.kits, frag: s.fragments, objective: '🧭 ' + ob.t });
  ui.missions(M.state().current.map(m => { const d = MISSIONS.find(x => x.id === m.id) || { title: m.title, target: 1 }; return { title: d.title, kind: m.kind, status: m.status, progress: m.progress, target: d.target }; }));
  ui.reload({ L: 1 - P.reload.L / P.reloadMax, R: 1 - P.reload.R / P.reloadMax }, { L: !!run.aim.L, R: !!run.aim.R });
  for (const [id, k] of [['port', 'L'], ['star', 'R']]) { const b = tbtn(id); if (b) b.style.setProperty('--p', Math.round((1 - P.reload[k] / P.reloadMax) * 100) + '%'); }
  const kb = tbtn('kit'); if (kb) kb.classList.toggle('dim', s.kits <= 0);
  ui.els.reload.hidden = state !== 'sail';
  const act = run.action;
  if ((state === 'sail' || state === 'foot') && act) ui.prompt(`${act.warn ? '⚠ ' : `<kbd>${pk()}</kbd>`}${act.label}`, act.hold ? foot.dig / act.hold : -1);
  else ui.prompt(null);
  ui.boss(boss && boss.state === 'fight' ? { name: 'ALMIRANTE ESPECTRAL', hp: boss.hp, max: boss.maxHp, label: boss.label() } : null);
  if (mapAcc > 0.2) {
    mapAcc = 0;
    const eff = Math.round(((1 + Math.cos(P.yaw - world.R.wind.dir)) / 2) * 100) / 100;
    ui.map({
      islands: world.islands, gates: world.gates, docks: world.docks, castaways: world.castaways.filter(c => !c.rescued),
      marks: world.treasures.filter(t => !t.dug), enemies: [...enemies.ships.filter(e => e.alive && !e.sinking && !e.boarded).map(e => ({ x: e.x, z: e.z })), ...enemies.sharks.filter(x => x.alive && !x.fled && x.y > -1.6).map(x => ({ x: x.x, z: x.z })), ...(boss && boss.ship.alive ? [{ x: boss.ship.x, z: boss.ship.z, boss: true }] : [])],
      goal: ob.g, px: P.x, pz: P.z, pyaw: P.yaw, wind: world.R.wind.dir, windEff: 0.42 + 0.58 * eff,
      windLabel: eff > 0.7 ? 'VIENTO A FAVOR' : eff < 0.3 ? 'VIENTO EN CONTRA' : 'VIENTO DE TRAVÉS',
    });
  }
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'ca-menu' });
const endScreen = screen('', { accent: ACCENT, id: 'ca-end' }); endScreen.hide();
const helpScreen = screen('', { accent: ACCENT, id: 'ca-help' }); helpScreen.hide();
const optScreen = screen('', { accent: ACCENT, id: 'ca-opts' }); optScreen.hide();
const marketScreen = screen('', { accent: ACCENT, id: 'ca-market' }); marketScreen.hide();
let newArmed = false;
function diffText() {
  const d = diff();
  return `Daño enemigo ×${d.dmg} · Vida enemiga ×${d.hp} · Recarga enemiga ×${d.reload} · Puntería ${d.spread < 1 ? 'precisa' : d.spread > 1 ? 'torpe' : 'normal'} (dispersión ×${d.spread}) · Almirante ${d.bossHp} PV · Casco ${d.hull} · Precios ×${d.price} · Oro ×${d.gold} · Kits iniciales ${d.kits}`;
}
function closeSubs() { helpScreen.hide(); optScreen.hide(); }
function showMenu() {
  state = 'menu'; ui.show(false); input.showTouch(false); closeTip(); cut = null; overlay = false; run.qte = null; ui.qte({ on: false });
  endScreen.hide(); closeSubs(); marketScreen.hide(); ui.fade(false);
  cap.group.visible = false; dinghy.visible = false;
  const s = S(), cont = s.started;
  newArmed = false;
  const R = /** @type {any} */ (REGIONS)[s.region];
  menu.show(`<span class="k3-kicker">AVENTURA NAVAL 3D</span><h1>CORSARIOS DEL ABISMO</h1>
    <p>Navegá con el viento, cañoneá de costado, desembarcá en islas, desenterrá tesoros y reuní el mapa para enfrentar al Almirante Espectral.</p>
    ${cont ? `<div class="ca-menu-prog">Campaña en curso: <b>${R.name}</b> · 🗺 ${s.fragments}/3 · 💰 ${s.gold} · ${s.fort ? '🏰 Fuerte tomado' : '🏰 Fuerte en pie'}${s.wins ? ' · 🏆 ' + s.wins : ''}</div>`
      : s.wins ? `<div class="ca-menu-prog">🏆 Campañas ganadas: ${s.wins} · Récord de botín: ${s.bestScore}</div>` : ''}
    <div class="k3-btnrow"><button class="k3-b" data-go>${cont ? `▶ Continuar: ${R.short}` : '▶ Zarpar'}</button>${cont ? '<button class="k3-b alt" data-new>Nueva campaña</button>' : ''}</div>
    <div data-diff></div><div class="ca-dtab" data-dtab>${diffText()}</div>
    <div class="k3-btnrow"><button class="k3-b alt" data-opts>⚙ Controles y opciones</button><button class="k3-b alt" data-help>📖 Cómo jugar</button></div>
    <div class="ca-credit">CREADO POR <img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  const holder = /** @type {HTMLElement} */ (menu.el.querySelector('[data-diff]'));
  M.difficultyPicker(holder, { onChange: () => { const t = menu.el.querySelector('[data-dtab]'); if (t) t.textContent = diffText(); if (s.kits === undefined) return; } });
  const want = cont ? s.region : 'bahia';
  if (!world || world.id !== want) buildRegion(want, 'spawn', true, false);
  else { makePlayer(world.R.spawn.x, world.R.spawn.z, world.R.spawn.yaw, false); if (enemies) enemies.clear(); balls.clear(); if (boss) { boss.dispose(); boss = null; } }
  run.bossFog = 0;
  A.refresh();
}
menu.on('[data-go]', () => { sfx.click(); const s = S(); if (!s.started) { s.kits = diff().kits; persist(); } startCampaign(); });
menu.on('[data-new]', () => {
  const b = /** @type {HTMLElement} */ (menu.el.querySelector('[data-new]'));
  if (!newArmed) { newArmed = true; b.textContent = '¿Abandonar la campaña? Tocá de nuevo'; return; }
  sfx.click(); newCampaign(); startCampaign();
});
menu.on('[data-opts]', () => openOptions(false));
menu.on('[data-help]', () => openHelp(false));
function newCampaign() { const s = /** @type {any} */ (S()); for (const k of CAMPAIGN_KEYS) s[k] = structuredClone(/** @type {any} */ (SAVE_DEFAULTS)[k]); s.kits = diff().kits; persist(); if (world) teardown(); world = null; }
endScreen.on('[data-menu]', () => showMenu());
endScreen.on('[data-retry]', () => { sfx.click(); restoreCheckpoint(); endScreen.hide(); M.runStart(); const s = S(); if (s.fragments) emit('fragment', s.fragments); if (s.fort) emit('fort'); A.started(); enterRegion(s.region, 'start'); });
endScreen.on('[data-new]', () => { sfx.click(); endScreen.hide(); newCampaign(); startCampaign(); });

/* ---------- mercado ---------- */
function marketItems() {
  const s = S(), p = diff().price;
  const hullC = Math.max(5, Math.round((P.maxHp - P.hp) * 0.35 * p)), mastC = Math.round(((P.maxMast - P.mast) * 0.4 + (P.mastLost ? 15 : 0)) * p);
  const cl = s.up.cannons, al = s.up.armor;
  return [
    { id: 'hull', label: `🔨 Reparar casco (${Math.round(P.hp)}/${P.maxHp})`, cost: hullC, ok: P.hp < P.maxHp - 0.5 },
    { id: 'mast', label: `⛵ Reparar mástil${P.mastLost ? ' (roto)' : ''}`, cost: Math.max(5, mastC), ok: P.mastLost || P.mast < P.maxMast - 0.5 },
    { id: 'kit', label: `🩹 Kit de reparación (${s.kits}/${MAX_KITS})`, cost: Math.round(PRICES.kit * p), ok: s.kits < MAX_KITS },
    { id: 'cannons', label: cl < 2 ? `💣 Más cañones: +1 bala y recarga más rápida (Nv ${cl + 1})` : '💣 Cañones al máximo', cost: cl < 2 ? Math.round(PRICES.cannons[cl] * p) : 0, ok: cl < 2 },
    { id: 'armor', label: al < 2 ? `🛡 Blindaje: +25 casco y −12 % daño (Nv ${al + 1})` : '🛡 Blindaje al máximo', cost: al < 2 ? Math.round(PRICES.armor[al] * p) : 0, ok: al < 2 },
  ];
}
function showMarket() {
  const s = S(), d = run.dock;
  const items = marketItems();
  const travel = s.unlocked.filter(id => id !== world.id).map(id => `<button type="button" data-travel="${id}"><span>🧭 Navegar a ${/** @type {any} */ (REGIONS)[id].name}</span><b>gratis</b></button>`).join('');
  marketScreen.show(`<span class="k3-kicker">${d.name.toUpperCase()}</span><h1 style="font-size:32px">MERCADO</h1>
    <div class="ca-menu-prog">💰 <b>${s.gold}</b> oro · Casco ${Math.round(P.hp)}/${P.maxHp} · Mástil ${P.mastLost ? 'roto' : Math.round(P.mast / P.maxMast * 100) + ' %'} · 🩹 ${s.kits} · 💣 Nv ${s.up.cannons} · 🛡 Nv ${s.up.armor}</div>
    <div class="ca-shop">${items.map(it => `<button type="button" data-buy="${it.id}" ${!it.ok || s.gold < it.cost ? 'disabled' : ''}><span>${it.label}</span><b>${it.ok ? it.cost + ' oro' : '—'}</b></button>`).join('')}${travel}</div>
    <div class="k3-btnrow"><button class="k3-b" data-leave>⛵ Zarpar</button></div>`);
}
marketScreen.on('[data-leave]', () => { sfx.click(); leaveDock(); });
marketScreen.el.addEventListener('click', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  const b = /** @type {HTMLElement|null} */ (t.closest('[data-buy]'));
  const tv = /** @type {HTMLElement|null} */ (t.closest('[data-travel]'));
  if (tv) { sfx.portal(); marketScreen.hide(); if (run.dock) run.dock.docked = false; run.dock = null; enterRegion(/** @type {string} */ (tv.dataset.travel), 'travel'); return; }
  if (!b || b.hasAttribute('disabled')) return;
  buy(/** @type {string} */ (b.dataset.buy));
});
function buy(id) {
  const s = S(), it = marketItems().find(x => x.id === id);
  if (!it || !it.ok || s.gold < it.cost) { sfx.denied(); return false; }
  s.gold -= it.cost;
  if (id === 'hull') P.hp = P.maxHp;
  if (id === 'mast') { P.mast = P.maxMast; P.mastLost = false; }
  if (id === 'kit') s.kits++;
  if (id === 'cannons') { s.up.cannons++; P.balls = SHIPS.player.balls + s.up.cannons; P.reloadMax = SHIPS.player.reload - 0.15 * s.up.cannons; }
  if (id === 'armor') { s.up.armor++; const k = P.hp / P.maxHp; P.maxHp = maxHull(); P.hp = Math.max(P.hp, P.maxHp * k); }
  persist(); sfx.repair(); emit('buy');
  if (run.dock) run.dock.anim = 1.5;
  showMarket();
  return true;
}

/* ---------- ayuda y opciones ---------- */
let fromPause = false;
function openHelp(pause) {
  fromPause = pause; overlay = pause;
  if (!pause) menu.hide();
  helpScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:30px">EL OFICIO CORSARIO</h1>
    <ul class="k3-list">
      <li>⛵ <b>Navegar:</b> ${input.isTouch ? 'timón (izquierda): arriba/abajo velas, costados girar' : 'W/S subir/bajar velas · A/D timón'}. Hay <b>inercia</b> y el <b>viento</b> manda: de popa vas al 100 %, de proa al 42 %.</li>
      <li>💣 <b>Andanadas:</b> ${K('port')} babor · ${K('star')} estribor. Cada banda recarga sola. La guía dorada muestra la parábola hacia el blanco más cercano en ese costado.</li>
      <li>🏝 <b>A tierra:</b> frená cerca de una isla y ${K('act')}. A pie: cofres, <b>X</b> (cavar manteniendo), cañones de costa (clavarlos) y la <b>cueva</b> de la Isla del Eco.</li>
      <li>⚓ <b>Muelles:</b> reparar, kits (${K('kit')}), más cañones, blindaje y viajes entre regiones descubiertas. 🛟 Rescatá <b>náufragos</b> de sus balsas.</li>
      <li>🏴‍☠️ <b>Goleta:</b> troneras naranjas = andanada; cruzale proa o popa. Bandera blanca = abordala. <b>Lancha:</b> carril rojo = embestida; recibila de proa. <b>Cañón de costa:</b> círculo rojo = mortero. <b>Tiburón:</b> disparale cuando salta.</li>
      <li>🗺 <b>Campaña:</b> 3 fragmentos del mapa abren las corrientes. Tomá el Fuerte de Coral Negro y vencé al <b>Almirante Espectral</b> (F1 troneras verdes y popa · F2 cañones encantados · F3 remolino). Recuperá su cofre para ganar.</li>
      <li>🎮 <b>Gamepad:</b> stick timón/velas · LB/LT babor · RB/RT estribor · A acción · X kit · Start pausa.</li>
    </ul>
    <div class="k3-btnrow"><button class="k3-b" data-back>Volver</button><button class="k3-b alt" data-retut>Reactivar tutorial</button></div>`);
}
helpScreen.on('[data-back]', closeSub);
helpScreen.on('[data-retut]', () => { S().tutorial = { off: false, seen: {} }; persist(); toast('Tutorial reactivado', 1500); closeSub(); });
function closeSub() {
  closeSubs(); listening = '';
  if (fromPause && ACTIVE.has(state)) { overlay = false; A.pause(); return; }
  overlay = false;
  if (state === 'menu') showMenu();
}
let listening = '';
function openOptions(pause) {
  fromPause = pause; overlay = pause;
  if (!pause) menu.hide();
  const o = S().opts;
  const row = (id, name) => `<div class="ca-bind"><span>${name}</span><button type="button" data-bind="${id}">${listening === id ? 'Apretá una tecla…' : keyLabel(o.binds[id])}</button></div>`;
  optScreen.show(`<span class="k3-kicker">OPCIONES</span><h1 style="font-size:30px">CONTROLES</h1>
    <div class="ca-opts">
      ${row('port', 'Andanada babor')}${row('star', 'Andanada estribor')}${row('act', 'Acción')}${row('kit', 'Kit de reparación')}
      <label>Sensibilidad del timón <input type="range" min="0.5" max="1.6" step="0.1" value="${o.sens}" data-sens aria-label="Sensibilidad del timón"></label>
      <label>Ayuda de puntería <input type="checkbox" data-aim ${o.aim ? 'checked' : ''}></label>
      <label>Cámara <select data-cam><option value="lejos"${o.cam === 'lejos' ? ' selected' : ''}>Lejos</option><option value="cerca"${o.cam === 'cerca' ? ' selected' : ''}>Cerca</option></select></label>
      <label>Movimiento (sacudidas y destellos) <select data-motion><option value="auto"${o.motion === 'auto' ? ' selected' : ''}>Según el sistema</option><option value="reduce"${o.motion === 'reduce' ? ' selected' : ''}>Reducido</option><option value="full"${o.motion === 'full' ? ' selected' : ''}>Completo</option></select></label>
      <div class="ca-small">Velas y timón: W/A/S/D o flechas (fijo). Gamepad: stick timón y velas, LB babor, RB estribor, A acción, X kit, Start pausa. Sonido y calidad gráfica: botón ⚙/⏸ de la barra.</div>
    </div>
    <div class="k3-btnrow"><button class="k3-b" data-back>Listo</button><button class="k3-b alt" data-defaults>Valores por defecto</button></div>`);
}
optScreen.on('[data-back]', closeSub);
optScreen.on('[data-defaults]', () => { S().opts = structuredClone(SAVE_DEFAULTS.opts); persist(); openOptions(fromPause); });
optScreen.el.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-bind]'); if (b) { listening = /** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.bind); openOptions(fromPause); } });
optScreen.el.addEventListener('input', e => {
  const t = /** @type {HTMLInputElement} */ (e.target), o = S().opts;
  if (t.matches('[data-sens]')) o.sens = +t.value;
  if (t.matches('[data-aim]')) o.aim = t.checked;
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
  if (e.code !== 'F15' || (ACTIVE.has(state) && !marketScreen.visible)) return;
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (el && el.closest('.k3-screen') && el.tagName === 'BUTTON') el.click();
});
game.root.addEventListener('pointerdown', () => { if (state === 'cutscene') cutSkip = true; });

/* ======================= gancho de pruebas ======================= */
const r2 = v => Math.round(v * 1000) / 1000;
const pubShip = s => s && ({ kind: s.kind, x: r2(s.x), z: r2(s.z), y: r2(s.y), yaw: r2(s.yaw), speed: r2(s.speed), sail: r2(s.sail), sailCur: r2(s.sailCur), hp: r2(s.hp), maxHp: s.maxHp, mast: r2(s.mast), mastLost: s.mastLost,
  reload: { L: r2(s.reload.L), R: r2(s.reload.R) }, balls: s.balls, alive: s.alive, sinking: s.sinking, surrender: !!s.surrender, boarded: !!s.boarded, state: s.ai ? s.ai.state : '', aggro: !!(s.ai && s.ai.aggro), tele: { L: s.tele.L > 0, R: s.tele.R > 0 } });
const hook = {
  get state() { return state; },
  get scene() { return world ? world.name : ''; },
  get region() { return world ? world.id : ''; },
  get missions() { return M.state(); },
  get player() { return pubShip(P); },
  get hp() { return P ? P.hp : 0; }, get maxHp() { return P ? P.maxHp : 0; },
  get score() { return S().plunder; }, get gold() { return S().gold; }, get fragments() { return S().fragments; },
  get foot() { return state === 'foot' ? { x: r2(foot.x), z: r2(foot.z), y: r2(foot.y), island: foot.isl ? foot.isl.id : '', dig: r2(foot.dig) } : null; },
  get action() { return run.action ? run.action.label : ''; },
  get runTime() { return run.time; }, get simTime() { return game.simTime; },
  get paused() { return game.paused; }, get overlay() { return overlay; },
  get tip() { return tipId; }, get big() { return ui.bigText; },
  get wind() { return world ? { ...world.R.wind } : null; },
  get aim() { return { L: !!run.aim.L, R: !!run.aim.R }; },
  get enemies() { return enemies ? enemies.ships.map(pubShip) : []; },
  get sharks() { return enemies ? enemies.sharks.map(s => ({ x: r2(s.x), z: r2(s.z), y: r2(s.y), hp: r2(s.hp), state: s.state, exposed: !!s.exposed, fled: s.fled, alive: s.alive })) : []; },
  get battle() { return { ...run.battle }; },
  get qte() { return run.qte ? { hits: run.qte.hits, zone: run.qte.zone, needle: r2(run.qte.needle) } : null; },
  get docked() { return state === 'docked' ? run.dock.id : ''; },
  get interactions() {
    if (!world) return {};
    return {
      docks: world.docks.map(d => ({ id: d.id, x: d.x, z: d.z, visited: d.visited, docked: !!d.docked, lit: d.visited })),
      cannons: world.cannons.map(c => ({ id: c.id, x: c.x, z: c.z, hp: c.hp, destroyed: c.destroyed, battery: !!c.battery, tele: c.tele > 0, yaw: r2(c.yaw), seen: !!c.seen })),
      treasures: world.treasures.map(t => ({ id: t.id, x: t.x, z: t.z, dug: t.dug, reward: t.reward, chestUp: t.chest ? r2(t.rise || 0) : 0 })),
      chests: world.chests.map(c => ({ id: c.id, x: c.x, z: c.z, opened: c.opened, open: r2(c.open), reward: c.reward })),
      castaways: world.castaways.map(c => ({ id: c.id, x: c.x, z: c.z, rescued: c.rescued })),
      gates: world.gates.map(g => ({ id: g.id, to: g.to, x: g.x, z: g.z, active: g.active, need: g.need })),
      cave: world.cave ? { x: world.cave.x, z: world.cave.z, found: world.cave.found } : null,
      fort: world.fort ? { captured: world.fort.captured, batteries: world.cannons.filter(c => c.battery && !c.destroyed).length, dock: world.R.fort.dock, flag: world.fort.flagPos } : null,
      islands: world.islands.map(i => ({ id: i.id, x: i.x, z: i.z, r: i.r, land: !!i.land })),
    };
  },
  get boss() { if (!boss) return null; const s = boss.ship; return { phase: boss.phase, state: boss.state, hp: r2(s.hp), maxHp: s.maxHp, x: r2(s.x), z: r2(s.z), y: r2(s.y), ethereal: boss.ethereal, cannons: boss.cannons.filter(c => c.alive).length, portsOpen: { L: boss.portsOpen.L > 0, R: boss.portsOpen.R > 0 }, whirl: r2(sea.whirl.s), defeated: boss.defeated, ram: boss.ramState || '' }; },
  get chest() { return { on: chestFloat.on, x: chestFloat.x, z: chestFloat.z }; },
  get result() { return run.result; },
  get counts() { return { enemies: enemies ? enemies.ships.filter(s => s.alive).length : 0, sharks: enemies ? enemies.sharks.filter(s => s.alive).length : 0, balls: balls.count, particles: fx.count, islands: world ? world.islands.length : 0, decor: world ? world.decorCount : 0, waterVerts: water.verts }; },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...game.perf, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames: game.frames }; },
  get quality() { const q = QUAL[game.quality]; return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, particles: fx.cap, waterVerts: water.verts, decor: q.decor, decorCount: world ? world.decorCount : 0, fogFar: /** @type {any} */ (scene.fog).far, far: camera.far }; },
  get difficulty() { return { name: diffName(), ...diff() }; },
  get save() { return structuredClone(S()); },
};
if (DEBUG) {
  /** @type {any} */ (hook).debug = {
    simulate(sec) { game.simulate(sec); },
    goto(id) { if (!ACTIVE.has(state)) { M.runStart(); A.started(); } const s = S(); if (id === 'coral') s.fragments = Math.max(3, s.fragments); if (id !== 'bahia' && s.fragments < 1) s.fragments = 1; persist(); closeSubs(); menu.hide(); endScreen.hide(); marketScreen.hide(); enterRegion(id, 'gate'); },
    teleport(x, z, yaw) { P.x = x; P.z = z; if (yaw !== undefined) { P.yaw = yaw; cam.yaw = yaw; } P.vx = P.vz = 0; P.speed = 0; placeCamBehind(); },
    setSail(v) { P.sail = v; P.sailCur = v; }, setSpeed(v) { P.speed = v; },
    gold(n) { S().gold = n; persist(); }, fragments(n) { S().fragments = n; persist(); if (world) for (const g of world.gates) g.active = n >= g.need; },
    hurt(n, part) { hurtPlayer(n, part || 'hull'); }, setHull(n) { P.hp = n; }, freeze(on = true) { dbg.freeze = on; }, god(on = true) { dbg.god = on; },
    damageEnemy(i, n, part) { const s = enemies.ships[i]; if (s) damageShip(s, n, part || 'hull'); },
    placeEnemy(i, x, z, yaw) { const s = enemies.ships[i]; if (!s) return; s.x = x; s.z = z; if (yaw !== undefined) s.yaw = yaw; s.speed = 0; s.vx = s.vz = 0; },
    enemyState(i, st, t) { const s = enemies.ships[i]; if (!s) return; s.ai.state = st; s.ai.t = t ?? 1; s.ai.aggro = true; s.ai.cd = 0; },
    placeShark(i, x, z) { const s = enemies.sharks[i]; if (s) { s.x = x; s.z = z; } },
    sharkState(i, st, t) { const s = enemies.sharks[i]; if (!s) return; s.state = st; s.t = t ?? 1; s.jump = 0; s.hitDone = false; },
    hurtShark(i, n) { const s = enemies.sharks[i]; if (s) hurtShark(s, n); },
    cannonFire(id) { const c = world.cannons.find(k => k.id === id); if (c) c.cd = 0; },
    destroyCannon(id) { const c = world.cannons.find(k => k.id === id); if (c) destroyCannon(c, 'shot'); },
    destroyBatteries() { for (const c of world.cannons) if (c.battery) destroyCannon(c, 'shot'); },
    fire(side) { return playerFire(side); },
    act() { const a = state === 'foot' ? footAction() : seaAction(); if (a && a.fn) { a.fn(); return a.label; } return ''; },
    footTo(x, z) { foot.x = x; foot.z = z; foot.y = world.heightAt(x, z); },
    spawnBoss() { if (!world || world.id !== 'coral') this.goto('coral'); S().fort = true; if (world.fort) captureFortVisual(); triggerBoss(); },
    skipCut() { if (cut) cut.t = cut.dur; },
    bossPhase(n) { if (!boss) this.spawnBoss(); if (cut) { const c = cut; cut = null; boss.ship.y = 0; c.end(); } if (n >= 2 && boss.phase === 1) boss.hurt(boss.ship.hp - boss.ship.maxHp * 0.59); if (n >= 3 && boss.phase === 2) { boss.cannons.forEach(c => boss.hitCannon(c, 999)); boss.hurt(boss.ship.hp - boss.ship.maxHp * 0.24); } },
    bossHit(n) { if (boss) return boss.hurt(n); return 0; },
    placeBoss(x, z, yaw) { if (!boss) return; const s = boss.ship; s.x = x; s.z = z; if (yaw !== undefined) s.yaw = yaw; s.speed = 0; },
    bossTele(side) { if (!boss) return; boss.teleT = 0; boss.ship.reload.L = boss.ship.reload.R = 0; boss.teleT = 1.6; boss.teleSide = side; boss.portsOpen[side > 0 ? 'R' : 'L'] = 3.1; },
    killBoss() { if (boss) boss.hurt(1e9); },
    sinkMe() { hurtPlayer(9999); },
    aim(on) { S().opts.aim = !!on; persist(); },
    /** detiene/reanuda el loop en tiempo real: con false, sólo avanza simulate() (pruebas deterministas) */
    loop(on) { if (on) game.start(); else game.stop(); },
  };
}
W['__' + GAME_ID] = Object.freeze(hook);

/* ======================= arranque ======================= */
showMenu();
applyQuality();
game.start();
