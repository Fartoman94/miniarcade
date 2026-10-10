// @ts-check
/* GUARDIANES ESTELARES — shooter espacial 3D de MiniArcade (MateLabs).
   Bucle: pilotear con inercia arcade, fijar objetivos con la retícula predictiva, disparar (pulso + láser),
   usar asteroides/cristales como cobertura, activar balizas/torretas/docks y completar 3 sectores con jefe final. */
import * as THREE from 'three';
import { createGame, createInput, createSave, toast, clamp } from '../../matelabs/kit3d.js';
import { ID, TITLE, ACCENT, SAVE_KEY, SAVE_VERSION, DIFFICULTY, QUALITY, MISSIONS, WEAPONS, SHIP, ENEMY, SECTORS } from './config.js';
import * as M from './models.js';
import { createMaterials, buildSector } from './world.js';
import { createParticles, createFlashes, createPool, createLines, getDotTexture, releaseDotTexture } from './fx.js';
import { createEnemies } from './enemies.js';
import { createBoss } from './boss.js';
import { createUI, diffText } from './ui.js';
import { createSfx } from './sfx.js';

const A = /** @type {any} */ (window).MLArcade;
const MM = /** @type {any} */ (window).MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ======================= guardado ======================= */
const DEFAULTS = {
  unlocked: 1, best: 0, campaign: { convoy: false, transmisores: false, nemesis: false }, trophy: false, victories: 0, runs: 0,
  kills: 0, capsulesTotal: 0, lastSector: 0,
  settings: { sens: 1, invertY: false, mouseSteer: true, autoFire: false, calm: false, tutorialDone: false },
};
const save = createSave(SAVE_KEY, SAVE_VERSION, DEFAULTS, (old, v) => {
  // v1 (prototipo): { sector, best, tutorial }
  const o = old && typeof old === 'object' ? old : {};
  return { unlocked: Number(o.sector) || 1, best: Number(o.best) || 0, settings: { ...DEFAULTS.settings, tutorialDone: !!o.tutorial } };
});
/** Valida tipos y rangos: un guardado con forma rara nunca rompe el juego. */
function sanitize() {
  const d = /** @type {any} */ (save.get()), D = /** @type {any} */ (DEFAULTS);
  for (const k of Object.keys(d)) if (!(k in D)) delete d[k];
  const num = (v, def, lo, hi) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : def);
  d.unlocked = Math.round(num(d.unlocked, 1, 1, 3)); d.best = Math.round(num(d.best, 0, 0, 1e9));
  d.victories = num(d.victories, 0, 0, 1e6); d.runs = num(d.runs, 0, 0, 1e9); d.kills = num(d.kills, 0, 0, 1e9); d.capsulesTotal = num(d.capsulesTotal, 0, 0, 1e9);
  d.lastSector = Math.round(num(d.lastSector, 0, 0, 2)); d.trophy = d.trophy === true;
  const c = d.campaign && typeof d.campaign === 'object' ? d.campaign : {};
  d.campaign = { convoy: c.convoy === true, transmisores: c.transmisores === true, nemesis: c.nemesis === true };
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  d.settings = { sens: num(s.sens, 1, 0.5, 1.6), invertY: s.invertY === true, mouseSteer: s.mouseSteer !== false, autoFire: s.autoFire === true, calm: s.calm === true, tutorialDone: s.tutorialDone === true };
  if (d.campaign.transmisores) d.unlocked = Math.max(d.unlocked, 3); else if (d.campaign.convoy) d.unlocked = Math.max(d.unlocked, 2);
  save.flush();
}
sanitize();
const S = /** @type {typeof DEFAULTS} */ (save.get());
const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (!localStorage.getItem(SAVE_KEY + ':init')) { try { localStorage.setItem(SAVE_KEY + ':init', '1'); } catch (e) { /* nada */ } if (isTouchDevice && !S.settings.autoFire) { S.settings.autoFire = true; save.flush(); } }

/* ======================= estado ======================= */
const V = () => new THREE.Vector3();
const G = {
  state: 'menu', sectorIdx: 0, runStartSector: 0, menuSector: 0, score: 0, kills: 0, time: 0, realT: 0,
  diffId: 'normal', diff: DIFFICULTY.normal,
  stateT: 0, endReason: '', shake: 0, vign: 0,
  /** progreso de la sesión (persiste entre reintentos de la misma campaña) */
  session: /** @type {any} */ (null),
  checkpoint: /** @type {any} */ (null),
  sec: /** @type {any} */ ({}),
  tut: { on: false, step: 0, t: 0, acc: 0, shots: 0, forced: false },
  target: /** @type {any} */ (null), targetT: 0, lead: V(), leadOk: false, leadValid: false,
  hints: /** @type {Record<string, number>} */ ({}),
  bossLabel: '',
};
const P = {
  pos: V(), vel: V(), fwd: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), right: V(),
  yaw: 0, pitch: 0, roll: 0, yawRate: 0, pitchRate: 0, speed: SHIP.speed,
  shield: 100, hull: 100, boost: 100, energy: 100, regenT: 0, pulseLv: 1, laserLv: 1, fireCd: 0, laserOn: false, laserLen: 0, laserHit: false,
  hitCd: 0, alive: true, invuln: 0, docking: /** @type {any} */ (null), dockT: 0, scanTarget: /** @type {any} */ (null), flash: 0, shieldFlash: 0, boosting: false,
};

/* ======================= motor ======================= */
let input = /** @type {ReturnType<typeof createInput>} */ (/** @type {any} */ (null));
const game = createGame({
  id: ID, title: TITLE, accent: ACCENT, toolbar: 'tr', background: 0x02040a, fov: 62, far: 1200,
  help: [
    'Objetivo: completá los 3 sectores — convoy, transmisores y el Destructor Némesis.',
    'PC: WASD/flechas o mouse para pilotear · Espacio/clic pulso · F/clic derecho láser · Shift turbo · E escanear · Q objetivo.',
    'Táctil: stick izquierdo para pilotear · FUEGO, LÁSER, TURBO y SCAN · disparo asistido opcional en Controles.',
    'Gamepad: stick izq. · A pulso · X láser · RB turbo · Y escanear · LB objetivo · Start pausa.',
    'Apuntá al rombo ◇ (retícula predictiva): marca dónde va a estar el enemigo.',
    'Los asteroides y cristales bloquean disparos: usalos de cobertura. El escudo se regenera si no recibís daño.',
    'Balizas ◎: apuntá y mantené E. Torretas ⊕ y docks ✚: atravesá sus anillos.',
  ],
  gamepad: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'Space', x: 'KeyF', rb: 'ShiftLeft', y: 'KeyE', lb: 'KeyQ', rt: 'Space', lt: 'KeyF' },
  isActive: () => G.state === 'play' || G.state === 'intro' || G.state === 'cine' || G.state === 'dying',
  update, render, onRestart, onQuality,
  actions: [{ label: '🎓 Ver tutorial', fn: () => resumeAfterAction(() => startTutorial(true)) }],
});
const { scene, camera, renderer } = game;
const reducedMotion = () => prefersReduced || S.settings.calm;
const root = new THREE.Group(); root.name = 'dinamico'; scene.add(root);
scene.fog = new THREE.Fog(0x0a1a2c, 140, 560);
input = createInput(game.root, { joystick: 'left', buttons: [
  { id: 'fire', label: 'FUEGO', key: 'Space' }, { id: 'laser', label: 'LÁSER', key: 'KeyF' },
  { id: 'boost', label: 'TURBO', key: 'ShiftLeft' }, { id: 'scan', label: 'SCAN', key: 'KeyE' }] });
input.showTouch(false);

/* SDK: una acción del menú de pausa reanuda sin onResume; se re-sincroniza con pausa+reanudar inmediato. */
function resumeAfterAction(fn) { setTimeout(() => { if (A && A.pause()) A.resume(); fn(); }, 0); }

const mats = createMaterials();
const dotTex = getDotTexture();
const ctx = /** @type {any} */ ({
  THREE, scene, root, camera, mats, dotTex, quality: game.quality, player: P, diff: G.diff, W: null, fx: null,
  get reduced() { return reducedMotion(); },
});
const sfx = createSfx(game.audio, () => P.pos);
ctx.sfx = sfx;

// nave del jugador
const shipG = M.buildPlayerShip();
const ship = new THREE.Group();
const shipBody = new THREE.Mesh(shipG.body, mats.body); shipBody.castShadow = true;
const shipGlow = new THREE.Mesh(shipG.glow, mats.glow);
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const flameGeo = new THREE.ConeGeometry(0.42, 3, 8); flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, -1.5);
const flames = [1, -1].map(s => { const f = new THREE.Mesh(flameGeo, flameMat); f.position.set(s * 1.0, -0.05, -3.35); return f; });
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x66d8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shieldMat); shieldMesh.scale.set(4.4, 2.2, 5.2);
ship.add(shipBody, shipGlow, ...flames, shieldMesh);
root.add(ship);

// pools (se recrean por sector según calidad)
const pboltGeo = new THREE.CylinderGeometry(0.2, 0.2, 3.6, 5); pboltGeo.rotateX(Math.PI / 2);
const eboltGeo = new THREE.CylinderGeometry(0.24, 0.24, 3.4, 6); eboltGeo.rotateX(Math.PI / 2);
const pboltMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
const eboltMat = new THREE.MeshBasicMaterial({ color: 0xff3a6a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
const mineMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const torpGeo = M.buildTorpedo(), mineGeo = M.buildMine();
/** En «reducir movimiento» los destellos grandes se achican (sin fogonazos a pantalla completa). */
const fx = {
  pbolts: createPool(root, { count: 140, geometry: pboltGeo, material: pboltMat }),
  ebolts: createPool(root, { count: 180, geometry: eboltGeo, material: eboltMat }),
  torps: createPool(root, { count: 16, geometry: torpGeo, material: mats.body }),
  mines: createPool(root, { count: 48, geometry: mineGeo, material: mineMat, orient: false, scale: 1.3 }),
  lines: createLines(root, 64),
  parts: /** @type {ReturnType<typeof createParticles>} */ (/** @type {any} */ (null)),
  flashes: /** @type {ReturnType<typeof createFlashes>} */ (/** @type {any} */ (null)),
};
ctx.fx = fx;
fx.mines.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
for (let i = 0; i < 48; i++) fx.mines.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
function makeFxForQuality() {
  if (fx.parts) fx.parts.dispose(); if (fx.flashes) fx.flashes.dispose();
  const q = QUALITY[game.quality] || QUALITY.medium;
  fx.parts = createParticles(root, q.particles);
  fx.flashes = createFlashes(root, game.quality === 'low' ? 8 : 16, reducedMotion);
}
makeFxForQuality();

const enemies = createEnemies(ctx);
const boss = createBoss(ctx);

/* ======================= UI ======================= */
const ui = createUI({
  isTouch: input.isTouch,
  onStart: s => startRun(s),
  onOptions: () => openOptions(),
  onTutorial: () => startTutorial(true),
  onSkipTutorial: () => endTutorial(true),
});
MM.setup({ gameId: ID, missions: MISSIONS, secondaryPerRun: 4, hud: 'none' });
MM.on(/** @param {any} ev */ ev => { if (ev.type === 'complete') sfx.mission(); });

/* ======================= sector ======================= */
function loadSector(idx) {
  if (ctx.W) ctx.W.dispose();
  ctx.quality = game.quality;
  const q = QUALITY[game.quality] || QUALITY.medium;
  ctx.W = buildSector(ctx, idx);
  const W = ctx.W;
  scene.fog = new THREE.Fog(W.def.fog, 140, q.fogFar);
  camera.far = q.far; camera.updateProjectionMatrix();
  makeFxForQuality();
  enemies.clear(); boss.reset();
  for (const k of ['pbolts', 'ebolts', 'torps', 'mines']) /** @type {any} */ (fx)[k].clear();
  P.pos.copy(W.playerStart.pos); P.yaw = W.playerStart.yaw; P.pitch = W.playerStart.pitch; P.yawRate = P.pitchRate = P.roll = 0;
  updatePlayerBasis(); P.vel.copy(P.fwd).multiplyScalar(SHIP.speed); P.speed = SHIP.speed;
  snapCamera();
}
/** Aplica el estado de sesión (balizas, torretas, docks, cápsulas, transmisores, cargueros) al sector recién construido. */
function applySession(idx) {
  const W = ctx.W, st = G.session.sectors[idx];
  W.beacons.forEach((b, i) => { if (st.beacons[i]) { b.scanned = true; b.progress = 1; b.ringMat.color.setHex(0x5bff9a); } });
  W.turrets.forEach((t, i) => { if (st.turrets[i]) { t.active = true; t.boot = 1; t.ringMat.color.setHex(0x5bff9a); t.head.scale.setScalar(1); } });
  W.docks.forEach((d, i) => { if (st.docks[i]) { d.used = true; d.lightMat.color.setHex(0xff4a4a); } });
  W.capsules.forEach((c, i) => { if (st.capsules[i]) { c.taken = true; c.group.visible = false; } });
  if (idx === 0 || idx === 2) { if (W.beacons.some(b => b.scanned)) W.capsules.forEach(c => c.revealed = true); }
  const D = G.diff;
  W.freighters.forEach(f => { f.hp = f.max = 600 * D.convoyHp; });
  W.transmitters.forEach((t, i) => {
    t.hp = t.max = 130 * D.enemyHp;
    if (W.beacons[i] && W.beacons[i].scanned) { t.shielded = false; t.shield.visible = false; }
    if (st.transmitters[i]) { t.alive = false; t.mesh.visible = false; t.core.visible = false; t.shield.visible = false; }
  });
  W.stranded.forEach((f, i) => {
    f.hp = f.max = 320 * D.convoyHp;
    if (st.stranded[i] === 'saved') { f.saved = true; f.body.visible = f.glow.visible = false; }
  });
  if (W.esperanza) { W.esperanza.hp = W.esperanza.max = 700 * D.convoyHp; }
}
function newSession() {
  return { sectors: SECTORS.map((d, i) => ({ beacons: [], turrets: [], docks: [], capsules: [], transmitters: [], stranded: [] })), capsules: 0, droneLaser: 0, freighters: 0, kills: 0 };
}

/* ======================= ciclo de partida ======================= */
function startRun(sectorIdx) {
  if (sectorIdx + 1 > S.unlocked) return;
  G.diffId = MM.difficulty(); G.diff = /** @type {any} */ (DIFFICULTY)[G.diffId] || DIFFICULTY.normal; ctx.diff = G.diff;
  G.runStartSector = sectorIdx; G.session = newSession();
  G.score = 0; G.kills = 0;
  P.pulseLv = sectorIdx >= 1 ? 2 : 1; P.laserLv = sectorIdx >= 2 ? 2 : 1;
  S.runs++; S.lastSector = sectorIdx; save.flush();
  if (MM.state().running) MM.runEnd({ won: false });
  MM.runStart();
  A && A.started();
  ui.menu.hide(); ui.end.hide(); ui.clear.hide(); ui.opts.hide();
  beginSector(sectorIdx);
}
function beginSector(idx, retry = false) {
  G.sectorIdx = idx;
  G.checkpoint = { score: G.score, kills: G.kills, pulseLv: P.pulseLv, laserLv: P.laserLv };
  loadSector(idx);
  applySession(idx);
  G.sec = { t: 0, progress: 0, wave: 0, dirT: 10, started: false, lost: 0, done: false, bossOn: false, escort: false, escortT: 0, escortWave: 0, frigate: false,
    shieldBroken: false, alarm: false, stranded: [0, 0], clearT: 0, retry };
  P.shield = 100; P.hull = 100; P.boost = 100; P.energy = 100; P.alive = true; P.invuln = 0; P.docking = null; P.regenT = 0; P.flash = 0; P.laserOn = false; P.fireCd = 0;
  G.target = null; G.shake = 0;
  G.state = 'intro'; G.stateT = 0; G.time = 0;
  ui.showHud(true); input.showTouch(true);
  const d = SECTORS[idx];
  ui.banner(`SECTOR ${idx + 1} DE 3`, d.name.toUpperCase(), d.goal, 2600);
  sfx.warp();
  if (idx === 0 && (!S.settings.tutorialDone || G.tut.forced)) startTutorial(G.tut.forced);
  A && A.refresh && A.refresh();
}
function retrySector() {
  const c = G.checkpoint;
  G.score = c.score; G.kills = c.kills; P.pulseLv = c.pulseLv; P.laserLv = c.laserLv;
  ui.end.hide();
  if (MM.state().running) MM.runEnd({ won: false });
  MM.runStart();
  // la sesión continúa: se re-emite lo ya logrado para que las misiones de la partida lo cuenten
  if (G.session.capsules) MM.emit('capsule', G.session.capsules);
  if (G.session.droneLaser) MM.emit('droneLaser', G.session.droneLaser);
  if (G.session.freighters) MM.emit('freighterSaved', G.session.freighters);
  A && A.started();
  beginSector(G.sectorIdx, true);
}
function sectorComplete() {
  const W = ctx.W, s = G.sec;
  if (s.done) return; s.done = true;
  const bonus = Math.round((1500 + Math.max(0, 240 - s.t) * 5 + (s.shieldBroken ? 0 : 1000)) * G.diff.score);
  G.score += bonus;
  if (!s.shieldBroken) MM.emit('sectorClean');
  const mission = SECTORS[G.sectorIdx].mission;
  /** @type {any} */ (S.campaign)[mission] = true;
  S.unlocked = Math.max(S.unlocked, Math.min(3, G.sectorIdx + 2));
  save.flush();
  if (G.sectorIdx === 2) return victory();
  G.state = 'clear'; G.stateT = 0;
  input.showTouch(false); stopTutorialIfAny();
  const texts = ['El convoy cruzó el portal de salto. La estación Delta pide ayuda.', 'Los transmisores cayeron. Una señal masiva se acerca desde la nebulosa…'];
  ui.clear.show(ui.clearHTML({ n: G.sectorIdx + 1, title: SECTORS[G.sectorIdx].short, text: texts[G.sectorIdx], score: G.score, bonus, clean: !s.shieldBroken }));
  sfx.mission();
  A && A.refresh && A.refresh();
}
function victory() {
  G.state = 'victory'; G.stateT = 0;
  G.score += Math.round(5000 * G.diff.score);
  const rec = G.score > S.best; if (rec) S.best = G.score;
  S.victories++; S.trophy = true; S.kills += G.kills; save.flush();
  MM.runEnd({ won: true });
  A && A.ended({ score: G.score });
  input.showTouch(false); ui.showHud(false); stopTutorialIfAny();
  ui.end.show(ui.endHTML({ kicker: 'VICTORIA · CAMPAÑA COMPLETA', title: '¡GUARDIANES ESTELARES!', text: 'El reactor del Némesis estalló y el carguero Esperanza llegó al portal. La galaxia respira tranquila… por ahora.',
    score: G.score, kills: G.kills, capsules: G.session.capsules, record: rec,
    extra: '<div class="ge-rec">🏆 TROFEO: NÚCLEO NÉMESIS</div>',
    buttons: '<button class="k3-b" type="button" data-again>↻ JUGAR DE NUEVO</button><button class="k3-b alt" type="button" data-menu>MENÚ</button>' }));
  sfx.mission();
  A && A.refresh && A.refresh();
}
function gameOver(reason) {
  if (G.state === 'over') return;
  G.state = 'over'; G.stateT = 0; G.endReason = reason;
  const rec = G.score > S.best; if (rec) S.best = G.score;
  S.kills += G.kills; save.flush();
  MM.runEnd({ won: false });
  A && A.ended({ score: G.score });
  input.showTouch(false); ui.showHud(false); stopTutorialIfAny(); ui.vignette(0);
  const titles = { ship: 'NAVE DESTRUIDA', convoy: 'CONVOY PERDIDO', esperanza: 'CONVOY PERDIDO' };
  const texts = { ship: 'Tu caza Guardián no resistió. Las balizas escaneadas, torretas activas y docks usados se conservan al reintentar.', convoy: 'Cayeron dos cargueros del convoy. Interceptá torpedos y minas antes de que lleguen.', esperanza: 'El carguero Esperanza fue destruido antes de llegar al portal.' };
  ui.end.show(ui.endHTML({ kicker: `DERROTA · SECTOR ${G.sectorIdx + 1}`, title: /** @type {any} */ (titles)[reason], text: /** @type {any} */ (texts)[reason],
    score: G.score, kills: G.kills, capsules: G.session.capsules, record: rec,
    buttons: '<button class="k3-b" type="button" data-retry>↻ REINTENTAR SECTOR</button><button class="k3-b alt" type="button" data-menu>MENÚ</button>' }));
  sfx.lose();
  A && A.refresh && A.refresh();
}
function toMenu() {
  if (MM.state().running) MM.runEnd({ won: false });
  A && A.ended({ score: G.score });
  G.state = 'menu'; G.stateT = 0;
  ui.end.hide(); ui.clear.hide(); ui.opts.hide(); ui.showHud(false); input.showTouch(false); stopTutorialIfAny(); ui.vignette(0); ui.hideBanner();
  loadSector(G.menuSector);
  showMenu();
  A && A.refresh && A.refresh();
}
function onRestart() {
  // Reiniciar desde la pausa: campaña nueva desde el sector en que empezó esta partida
  ui.end.hide(); ui.clear.hide();
  startRun(G.runStartSector);
}
function onQuality(q) {
  ctx.quality = q;
  const Q = QUALITY[q] || QUALITY.medium;
  if (scene.fog) /** @type {THREE.Fog} */ (scene.fog).far = Q.fogFar;
  // el resto (estrellas, rocas, partículas) se aplica al construir el sector: en menú se reconstruye ya
  if (G.state === 'menu' && ctx.W) loadSector(G.menuSector);
}

/* ======================= menú ======================= */
function showMenu() {
  const sel = clamp(G.menuSector, 0, S.unlocked - 1);
  G.menuSector = sel;
  ui.menu.show(ui.menuHTML(S, sel, MM.difficulty(), Math.max(S.best, A ? A.scores.best(ID) : 0)));
  const box = /** @type {HTMLElement} */ (ui.menu.el.querySelector('[data-diff]'));
  MM.difficultyPicker(box, { onChange: (/** @type {string} */ d) => { const t = ui.menu.el.querySelector('[data-dfx]'); if (t) t.textContent = diffText(d); sfx.click(); } });
}
ui.menu.on('[data-go]', () => startRun(G.menuSector));
ui.menu.el.addEventListener('click', e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-sector]');
  if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
  const i = Number(/** @type {HTMLElement} */ (b).dataset.sector);
  if (i !== G.menuSector) { G.menuSector = i; loadSector(i); showMenu(); sfx.click(); }
});
ui.menu.on('[data-opts]', () => openOptions());
ui.menu.on('[data-tut]', () => { G.tut.forced = true; startRun(0); });
function openOptions() {
  ui.menu.hide();
  ui.opts.show(ui.optionsHTML(S.settings, input.isTouch));
}
ui.opts.el.addEventListener('input', e => {
  const el = /** @type {HTMLInputElement} */ (e.target), k = el.dataset.o; if (!k) return;
  const st = /** @type {any} */ (S.settings);
  st[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
  save.flush();
});
ui.opts.on('[data-back]', () => { ui.opts.hide(); if (G.state === 'menu') showMenu(); });
ui.end.on('[data-retry]', () => retrySector());
ui.end.on('[data-again]', () => startRun(0));
ui.end.on('[data-menu]', () => toMenu());
ui.clear.on('[data-next]', () => { ui.clear.hide(); input.showTouch(true); beginSector(G.sectorIdx + 1); });
ui.clear.on('[data-menu]', () => toMenu());
addEventListener('keydown', e => {
  if (e.repeat) return;
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && document.activeElement === document.body) {
    if (G.state === 'menu' && ui.menu.visible) { e.preventDefault(); startRun(G.menuSector); }
    else if (G.state === 'over' && G.stateT > 0.6) { e.preventDefault(); retrySector(); }
    else if (G.state === 'clear' && G.stateT > 0.6) { e.preventDefault(); ui.clear.hide(); input.showTouch(true); beginSector(G.sectorIdx + 1); }
  }
  if (e.code === 'Tab' && G.state === 'play') e.preventDefault();
  if (e.code === 'KeyH' && G.state === 'play') startTutorial(true);
});

/* ======================= tutorial ======================= */
const TUT = [
  { k: 'move', pc: 'Mové la nave con WASD / flechas o moviendo el mouse. Tiene inercia: anticipá los giros.', touch: 'Mové la nave con el stick izquierdo. Tiene inercia: anticipá los giros.' },
  { k: 'fire', pc: 'Disparo de pulso: Espacio o clic. Apuntá al rombo ◇: la retícula predictiva marca dónde va a estar el enemigo.', touch: 'Tocá FUEGO. Apuntá al rombo ◇: la retícula predictiva marca dónde va a estar el enemigo.' },
  { k: 'laser', pc: 'Láser secundario: F o clic derecho. Gasta energía y destroza drones (×3).', touch: 'Mantené LÁSER: gasta energía y destroza drones (×3).' },
  { k: 'boost', pc: 'Turbo con Shift. Tu escudo azul se recarga solo si dejás de recibir daño.', touch: 'Mantené TURBO para acelerar. Tu escudo azul se recarga solo si dejás de recibir daño.' },
  { k: 'scan', pc: 'Balizas ◎: apuntales y mantené E. Torretas ⊕ y docks ✚: atravesá sus anillos.', touch: 'Balizas ◎: apuntales y mantené SCAN. Torretas ⊕ y docks ✚: atravesá sus anillos.' },
];
function startTutorial(forced) {
  G.tut.on = true; G.tut.step = 0; G.tut.t = 0; G.tut.acc = 0; G.tut.shots = 0; G.tut.forced = !!forced;
  showTutStep();
}
function showTutStep() {
  const s = TUT[G.tut.step];
  ui.tutorial(true, G.tut.step + 1, TUT.length, input.isTouch ? s.touch : s.pc);
}
function tutAdvance() {
  G.tut.step++; G.tut.t = 0; G.tut.acc = 0; G.tut.shots = 0;
  sfx.pickup();
  if (G.tut.step >= TUT.length) endTutorial(false); else showTutStep();
}
function endTutorial(skipped) {
  if (!G.tut.on) return;
  G.tut.on = false; G.tut.forced = false; ui.tutorial(false);
  S.settings.tutorialDone = true; save.flush();
  if (G.state === 'play' || G.state === 'intro') ui.hint(skipped ? 'Tutorial salteado. Lo podés volver a ver desde la pausa o con H.' : '¡Listo, piloto! Protegé al convoy.', 2600);
}
function stopTutorialIfAny() { if (G.tut.on) { G.tut.on = false; ui.tutorial(false); } }
function tutUpdate(dt, ax, ay) {
  if (!G.tut.on || G.state !== 'play') return;
  const s = TUT[G.tut.step]; G.tut.t += dt;
  if (s.k === 'move') { G.tut.acc += (Math.abs(ax) + Math.abs(ay)) * dt; if (G.tut.acc > 0.9) tutAdvance(); }
  else if (s.k === 'fire') { if (G.tut.shots >= 6) tutAdvance(); }
  else if (s.k === 'laser') { if (P.laserOn) G.tut.acc += dt; if (G.tut.acc > 0.5) tutAdvance(); }
  else if (s.k === 'boost') { if (P.boosting) G.tut.acc += dt; if (G.tut.acc > 0.7) tutAdvance(); }
  else if (s.k === 'scan') { if (G.tut.t > 12 || (P.scanTarget && P.scanTarget.progress > 0.2)) tutAdvance(); }
}

/* ======================= utilidades ======================= */
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _cam = V(), _look = V(), _proj = V();
const UP = new THREE.Vector3(0, 1, 0);
function updatePlayerBasis() {
  const cp = Math.cos(P.pitch), sp = Math.sin(P.pitch), cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
  P.fwd.set(sy * cp, sp, cy * cp);
  P.up.set(-sy * sp, cp, -cy * sp);
  P.right.crossVectors(P.fwd, P.up).normalize(); // derecha en pantalla = -X local
}
function hint(key, text, cooldown = 9) {
  const now = G.realT;
  if ((G.hints[key] || -99) + cooldown > now) return;
  G.hints[key] = now; ui.hint(text, 2800);
}
ctx.hint = (/** @type {string} */ k) => {
  const T = { frigate: 'Blindaje frontal: flanqueá a la fragata y pegale al generador trasero.', cover: 'Te salvó la cobertura: escondete tras rocas y cristales.', emitter: 'Emisor cerrado: esperá a que se abra y brille.', reactor: 'Reactor blindado: disparale cuando se abran las compuertas.', transmitter: 'Transmisor con escudo: escaneá su baliza ◎ para bajarlo.' };
  hint(k, /** @type {any} */ (T)[k] || k);
};
function addScore(n, at) { G.score += Math.round(n * G.diff.score); }
ctx.addScore = addScore;
function shakeIt(k) { if (!reducedMotion()) G.shake = Math.min(1.2, G.shake + k); }

/** Puntos de aparición alrededor del jugador, preferentemente por delante (para que se los vea llegar). */
function spawnPos(out, near, min = 160, max = 230) {
  const W = ctx.W;
  for (let tries = 0; tries < 12; tries++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    _e.set(r * Math.cos(th), u * 0.45, r * Math.sin(th)).normalize();
    if (_e.dot(P.fwd) < -0.2) _e.addScaledVector(P.fwd, 1.2).normalize();
    out.copy(near).addScaledVector(_e, min + Math.random() * (max - min));
    if (out.length() > W.radius - 20) out.setLength(W.radius - 20);
    if (W.grid.hit(out, 8) < 0) return out;
  }
  return out;
}
/** @param {string} type @param {number} n @param {any} [o] */
function spawnGroup(type, n, o = {}) {
  const near = o.near || P.pos;
  const list = [];
  for (let i = 0; i < n; i++) {
    spawnPos(_f, near, o.min || 160, o.max || 230);
    const e = enemies.spawn(type, _f, o); if (e) list.push(e);
  }
  return list;
}
function waveCount(n) { return Math.max(1, Math.round(n * G.diff.waves)); }

/* objetivos aliados que los enemigos pueden atacar */
const _allies = /** @type {any[]} */ ([]);
ctx.allyTargets = (/** @type {any} */ e) => {
  _allies.length = 0;
  const W = ctx.W;
  if (G.sectorIdx === 0) { _allies.push(P, P); if (e.type !== 'interceptor' || Math.random() < 0.4) for (const f of W.freighters) if (f.alive && f.warp === 0) _allies.push(f); if (e.type === 'bomber') { _allies.length = 0; for (const f of W.freighters) if (f.alive) _allies.push(f); } }
  else if (G.sectorIdx === 1) {
    if (e.group >= 0 && W.stranded[e.group] && W.stranded[e.group].alive && !W.stranded[e.group].saved) { _allies.push(W.stranded[e.group]); if (e.type === 'interceptor') _allies.push(P); }
    else _allies.push(P);
  } else {
    if (G.sec.escort && W.esperanza.alive) { _allies.push(W.esperanza); if (e.type !== 'bomber') _allies.push(P, P); }
    else _allies.push(P);
  }
  if (!_allies.length) _allies.push(P);
  return _allies;
};
ctx.droneAnchor = (/** @type {any} */ e, /** @type {THREE.Vector3} */ out) => {
  const W = ctx.W;
  if (G.sectorIdx === 0 && W.path) { const u = clamp(G.sec.progress + 0.05 + Math.random() * 0.1, 0, 1); W.path.getPointAt(u, out); out.x += (Math.random() - 0.5) * 30; out.y += (Math.random() - 0.5) * 20; out.z += (Math.random() - 0.5) * 30; }
  else if (G.sectorIdx === 2 && G.sec.escort && W.esperanza) { out.copy(W.esperanza.pos).lerp(W.gate.pos, 0.3 + Math.random() * 0.3); out.y += (Math.random() - 0.5) * 30; }
  else { out.copy(P.pos).addScaledVector(P.fwd, 60 + Math.random() * 60); out.x += (Math.random() - 0.5) * 60; out.y += (Math.random() - 0.5) * 30; out.z += (Math.random() - 0.5) * 60; }
  if (out.length() > W.radius - 20) out.setLength(W.radius - 20);
};
ctx.bossShot = (/** @type {THREE.Vector3} */ from, /** @type {number} */ speed) => {
  _a.subVectors(P.pos, from); const t = _a.length() / speed; _a.addScaledVector(P.vel, t * 0.5).normalize();
  _a.x += (Math.random() - 0.5) * 0.05; _a.y += (Math.random() - 0.5) * 0.05;
  fx.ebolts.spawn(from, _a.normalize().multiplyScalar(speed), 4.5, 6 * G.diff.enemyDmg, 1);
  sfx.enemyShot(from);
};
ctx.bossLaunch = (/** @type {string} */ type, /** @type {number} */ n) => {
  if (enemies.count(type) >= 5) return;
  for (let i = 0; i < n; i++) { _a.copy(boss.pos).add(_b.set((Math.random() - 0.5) * 40, 20 + Math.random() * 10, (Math.random() - 0.5) * 40)); enemies.spawn(type, _a); }
};
ctx.onBossPhase = (/** @type {number} */ n) => {
  const L = { 2: ['FASE 2 · ESCUDOS', 'Los emisores ◆ sólo son vulnerables cuando se abren. Cuidado con el barrido rojo.'], 3: ['FASE 3 · REACTOR VULNERABLE', 'Disparale al reactor cuando abra sus compuertas. Cubrite del pulso.'], 4: ['¡REACTOR CRÍTICO!', 'El Némesis se desarma…'] };
  const l = /** @type {any} */ (L)[n];
  if (l) { ui.banner('DESTRUCTOR NÉMESIS', l[0], l[1], 3200, true); sfx.alarm(); shakeIt(0.6); }
  if (n === 2) { boss.emitterCycle = 0; boss.beam.cd = 4; }
  if (n === 3) { boss.reactor.cycle = 0; boss.pulse.cd = 5; }
  if (n === 4) { boss.deathT = 0; addScore(3000); }
};
ctx.onBossDead = () => {
  MM.emit('nemesisDown');
  S.campaign.nemesis = true; save.flush();
  P.shield = 100; P.hull = 100; P.pulseLv = 3; P.laserLv = 3;
  ui.banner('RECOMPENSA', 'NÚCLEO NÉMESIS', 'Reparación total y armas al nivel máximo. ¡Escoltá al Esperanza hasta el portal!', 3600);
  G.sec.escort = true; G.sec.escortT = 0; G.sec.escortWave = 0;
  ctx.W.esperanza.moving = true;
  shakeIt(1);
};
ctx.damagePlayer = damagePlayer;

/* ======================= daño ======================= */
function damagePlayer(amt, from, kind = 'hit') {
  if (!P.alive || P.invuln > 0 || G.state !== 'play') return;
  P.regenT = G.diff.regenDelay;
  if (P.shield > 0) {
    P.shield -= amt; P.shieldFlash = 1; sfx.shieldHit();
    if (P.shield <= 0) { P.hull += P.shield; P.shield = 0; G.sec.shieldBroken = true; sfx.shieldDown(); hint('shield', 'Escudo caído: alejate y cubrite para que se recargue.'); }
  } else { P.hull -= amt; sfx.hullHit(); G.sec.shieldBroken = true; }
  P.flash = 1; G.vign = Math.min(1, G.vign + (P.shield > 0 ? 0.25 : 0.6)); shakeIt(kind === 'beam' || kind === 'pulse' ? 0.9 : 0.35);
  if (from && (kind === 'pulse')) { _a.subVectors(P.pos, from).normalize(); P.vel.addScaledVector(_a, 40); }
  if (P.hull <= 0) { P.hull = 0; killPlayer(); }
}
function killPlayer() {
  P.alive = false;
  fx.parts.burst(P.pos, 90, 0xffa040, 40, 1.6); fx.parts.burst(P.pos, 30, 0xffffff, 20, 0.8);
  fx.flashes.spawn(P.pos, 60, 0xffc080, 1); sfx.boom(P.pos, 1); shakeIt(1.2);
  ship.visible = false;
  G.state = 'dying'; G.stateT = 0;
}
function damageAlly(f, amt, kind) {
  if (!f.alive) return;
  f.hp -= amt; f.flash = 1;
  if (f.hp <= 0) {
    f.hp = 0; f.alive = false; f.body.visible = f.glow.visible = false;
    fx.parts.burst(f.pos, 80, 0xffa040, 40, 1.6); fx.flashes.spawn(f.pos, 80, 0xffb070, 1); sfx.boom(f.pos, 1);
    const W = ctx.W;
    if (G.sectorIdx === 0) {
      G.sec.lost++;
      ui.hint(`Carguero ${f.name} destruido · quedan ${3 - G.sec.lost}`, 3000);
      if (G.sec.lost >= 2) loseLater('convoy');
    } else if (G.sectorIdx === 1) {
      ui.hint(`Perdimos al carguero ${f.name}.`, 3000);
      const i = W.stranded.indexOf(f); if (i >= 0) G.session.sectors[1].stranded[i] = 'lost';
    } else if (f === W.esperanza) loseLater('esperanza');
  }
}
function loseLater(reason) { G.sec.loseReason = reason; G.state = 'dying'; G.stateT = 0; }

ctx.onKill = (/** @type {any} */ e, /** @type {string} */ by) => {
  G.kills++; G.session.kills++;
  addScore(/** @type {any} */ (ENEMY)[e.type].score);
  sfx.boom(e.pos, e.type === 'frigate' ? 1 : e.type === 'bomber' ? 0.7 : 0.35);
  if (e.type === 'drone' && by === 'laser') { G.session.droneLaser++; MM.emit('droneLaser'); }
  if (G.target === e) G.target = null;
  if (e.pos.distanceTo(P.pos) < 60) shakeIt(e.type === 'frigate' ? 0.5 : 0.15);
};

/* ======================= entrada ======================= */
const mouse = { fire: false, laser: false, x: 0, y: 0, active: false, moved: 0 };
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') return;
  if (e.button === 0) mouse.fire = true; if (e.button === 2) mouse.laser = true;
});
addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') return; if (e.button === 0) mouse.fire = false; if (e.button === 2) mouse.laser = false; });
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const w = innerWidth, h = innerHeight, s = Math.min(w, h) * 0.36;
  mouse.x = clamp((e.clientX - w / 2) / s, -1, 1); mouse.y = clamp((e.clientY - h * 0.47) / s, -1, 1); mouse.active = true; mouse.moved = G.realT;
});
canvas.addEventListener('pointerleave', () => { mouse.active = false; });
addEventListener('blur', () => { mouse.fire = mouse.laser = false; mouse.active = false; });

/* ======================= simulación ======================= */
function update(dt) {
  G.realT += dt; G.stateT += dt;
  const W = ctx.W;
  if (!W) { input.endStep(); return; }
  if (G.state === 'menu' || G.state === 'over' || G.state === 'victory' || G.state === 'clear') {
    idleUpdate(dt);
    input.endStep(); return;
  }
  if (G.state === 'dying') {
    fx.parts.update(dt); fx.flashes.update(dt); enemies.update(dt); boss.update(dt); updateEnemyProjectiles(dt);
    G.shake = Math.max(0, G.shake - dt * 1.5);
    if (P.alive) { P.pos.addScaledVector(P.vel, dt); }
    camFollow(dt, true);
    if (G.stateT > 1.8) gameOver(G.sec.loseReason || 'ship');
    input.endStep(); return;
  }
  if (G.state === 'intro') {
    // entrada al sector: la nave avanza sola mientras la cámara pasa por delante
    P.pos.addScaledVector(P.fwd, SHIP.speed * dt); P.vel.copy(P.fwd).multiplyScalar(SHIP.speed);
    sectorAmbient(dt);
    camIntro(dt);
    if (G.stateT > 2.4 || (G.stateT > 0.7 && input.hit('Space', 'Enter', 'btn:fire'))) { G.state = 'play'; G.stateT = 0; }
    input.endStep(); return;
  }
  if (G.state === 'cine') {
    boss.update(dt); sectorAmbient(dt); fx.parts.update(dt); fx.flashes.update(dt);
    P.vel.multiplyScalar(0.96); P.pos.addScaledVector(P.vel, dt);
    camBoss(dt);
    if (G.stateT > 1.7 && boss.phase === 0.5) { boss.phase = 1; }
    if (G.stateT > 4.2 || (G.stateT > 1.8 && input.hit('Space', 'Enter', 'btn:fire'))) { if (boss.phase === 0.5) boss.phase = 1; G.state = 'play'; G.stateT = 0; ui.hint('Destruí las 4 torretas ◆ del Némesis. Avisan con una línea roja antes de disparar.', 4000); }
    input.endStep(); return;
  }
  // ---- en juego ----
  G.time += dt; G.sec.t += dt;
  const ax = playerUpdate(dt);
  sectorLogic(dt);
  interactables(dt);
  enemies.update(dt);
  boss.update(dt);
  updatePlayerProjectiles(dt);
  updateEnemyProjectiles(dt);
  fx.parts.update(dt); fx.flashes.update(dt);
  targeting(dt);
  tutUpdate(dt, ax.x, ax.y);
  camFollow(dt, false);
  G.shake = Math.max(0, G.shake - dt * 2.2); G.vign = Math.max(0, G.vign - dt * 1.4);
  input.endStep();
}

function idleUpdate(dt) {
  sectorAmbient(dt);
  fx.parts.update(dt); fx.flashes.update(dt);
  // la nave flota y la cámara gira lento alrededor
  const t = G.realT;
  P.pos.copy(ctx.W.playerStart.pos); P.pos.y += Math.sin(t * 1.2) * 0.6;
  P.yaw = ctx.W.playerStart.yaw; P.pitch = 0; P.roll = Math.sin(t * 0.8) * 0.12; updatePlayerBasis();
  const a = t * (reducedMotion() ? 0.05 : 0.12);
  _cam.set(Math.sin(a) * 20, 6 + Math.sin(t * 0.3) * 2, Math.cos(a) * 20).add(P.pos);
  camera.position.lerp(_cam, 1 - Math.exp(-dt * 3));
  camera.up.set(0, 1, 0); camera.lookAt(P.pos);
}
function sectorAmbient(dt) {
  const W = ctx.W, t = G.realT;
  for (const b of W.beacons) { b.dish.rotation.y += dt * (b.scanned ? 0.6 : 1.4 + b.progress * 6); b.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.04); }
  for (const tu of W.turrets) tu.ring.rotation.y += dt * (tu.active ? 0.3 : 1.2);
  for (const c of W.capsules) if (!c.taken) { c.group.rotation.y += dt * 0.8; c.group.rotation.z = Math.sin(t + c.pos.x) * 0.3; c.light.visible = Math.sin(t * 6 + c.pos.z) > -0.2; }
  for (const d of W.docks) { if (!d.used) d.lightMat.opacity = 0.25 + 0.15 * Math.sin(t * 3); }
  if (W.gate) W.gate.disc.rotation.z += dt * 0.5;
  if (W.station) { W.station.mesh.rotation.y += dt * 0.02; W.station.glow.rotation.y = W.station.mesh.rotation.y; }
  for (const tr of W.transmitters) if (tr.alive) { tr.core.rotation.y += dt * 2; tr.shield.rotation.y += dt * 0.3; }
  if (W.dust) W.dust.position.copy(P.pos).set(Math.round(P.pos.x / 120) * 120, Math.round(P.pos.y / 120) * 120, Math.round(P.pos.z / 120) * 120);
}

/** Movimiento de la nave: inercia arcade (velocidad angular y lineal suavizadas), turbo y colisiones. */
function playerUpdate(dt) {
  const W = ctx.W, st = S.settings;
  let ax = 0, ay = 0;
  if (P.alive && !P.docking) {
    const a = input.axis(); ax = a.x; ay = a.y;
    if (ax === 0 && ay === 0 && st.mouseSteer && mouse.active && !input.isTouch) {
      const dz = 0.08;
      ax = Math.abs(mouse.x) > dz ? (mouse.x - Math.sign(mouse.x) * dz) / (1 - dz) : 0;
      ay = Math.abs(mouse.y) > dz ? (mouse.y - Math.sign(mouse.y) * dz) / (1 - dz) : 0;
    }
  }
  const sens = st.sens;
  const tYaw = -ax * SHIP.yawRate * sens, tPitch = (st.invertY ? ay : -ay) * SHIP.pitchRate * sens;
  const k = Math.min(1, dt * SHIP.turnResp);
  P.yawRate += (tYaw - P.yawRate) * k; P.pitchRate += (tPitch - P.pitchRate) * k;
  // límite del sector: giro asistido hacia el centro
  const R = W.radius, dist = P.pos.length();
  if (dist > R) {
    hint('bounds', '⚠ Saliendo del sector: volvé a la zona de combate.', 5);
    _a.copy(P.pos).negate().normalize();
    const desiredYaw = Math.atan2(_a.x, _a.z);
    let dy = desiredYaw - P.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    P.yawRate += clamp(dy, -1, 1) * dt * 3; P.pitchRate += (Math.asin(clamp(_a.y, -1, 1)) - P.pitch) * dt * 2;
  }
  P.yaw += P.yawRate * dt; P.pitch = clamp(P.pitch + P.pitchRate * dt, -1.25, 1.25);
  if (Math.abs(P.pitch) >= 1.25) P.pitchRate *= 0.5;
  P.roll += ((-P.yawRate * 0.55) - P.roll) * Math.min(1, dt * 4);
  updatePlayerBasis();

  // velocidad: turbo / crucero
  const wantBoost = P.alive && !P.docking && (input.button('boost') || input.down('ShiftRight')) && P.boost > 2;
  P.boosting = wantBoost;
  if (wantBoost) P.boost = Math.max(0, P.boost - SHIP.boostDrain * dt); else P.boost = Math.min(SHIP.boostMax, P.boost + SHIP.boostRegen * dt);
  const tSpeed = P.docking ? 0 : wantBoost ? SHIP.boost : SHIP.speed;
  P.speed += (tSpeed - P.speed) * Math.min(1, dt * SHIP.accel);
  if (P.docking) {
    // atracado: la nave es llevada al centro del anillo
    P.dockT += dt;
    P.vel.multiplyScalar(0.9); P.pos.lerp(P.docking.pos, Math.min(1, dt * 3));
  } else {
    _a.copy(P.fwd).multiplyScalar(P.speed);
    P.vel.lerp(_a, Math.min(1, dt * 2.2));
  }
  P.pos.addScaledVector(P.vel, dt);
  if (dist > R + 60) P.pos.setLength(R + 60);
  // colisión con coberturas
  P.hitCd -= dt;
  const ci = W.grid.hit(P.pos, 2.2);
  if (ci >= 0) {
    const c = W.grid.covers[ci];
    _a.set(P.pos.x - c.x, P.pos.y - c.y, P.pos.z - c.z); const l = _a.length() || 1; _a.divideScalar(l);
    P.pos.set(c.x, c.y, c.z).addScaledVector(_a, c.r + 2.3);
    const vn = P.vel.dot(_a); if (vn < 0) P.vel.addScaledVector(_a, -vn * 1.6);
    if (P.hitCd <= 0) { P.hitCd = 0.7; damagePlayer(6, null, 'bump'); fx.parts.burst(P.pos, 12, 0xcfc2b0, 12, 0.6); hint('bump', 'Cuidado con las rocas: el choque daña el escudo.'); }
  }
  // colisión con el casco del jefe
  if (boss.phase >= 1 && boss.phase < 5) for (const h of boss.hullSpheres) {
    const rr = h.r + 2.5;
    if (h.world.distanceToSquared(P.pos) < rr * rr) { _a.subVectors(P.pos, h.world).normalize(); P.pos.copy(h.world).addScaledVector(_a, rr); P.vel.addScaledVector(_a, 30); if (P.hitCd <= 0) { P.hitCd = 0.9; damagePlayer(6, null, 'bump'); } }
  }
  // escudo
  P.regenT -= dt;
  if (P.regenT <= 0 && P.shield < 100) P.shield = Math.min(100, P.shield + SHIP.regen * dt);
  P.invuln = Math.max(0, P.invuln - dt); P.flash = Math.max(0, P.flash - dt * 4); P.shieldFlash = Math.max(0, P.shieldFlash - dt * 3);

  // armas
  P.fireCd -= dt;
  const wantFire = P.alive && !P.docking && (input.button('fire') || mouse.fire || (S.settings.autoFire && G.leadOk && G.target));
  const pw = WEAPONS.pulse[P.pulseLv];
  if (wantFire && P.fireCd <= 0) {
    P.fireCd = 1 / pw.rate;
    aimDir(_b);
    const muzzles = pw.twin ? [1.3, -1.3] : [0];
    for (const mx of muzzles) {
      _c.copy(P.pos).addScaledVector(P.fwd, 4).addScaledVector(P.right, mx).addScaledVector(P.up, -0.1);
      _d.copy(_b).multiplyScalar(pw.speed).add(P.vel);
      fx.pbolts.spawn(_c, _d, 1.7, pw.dmg, 0);
    }
    fx.flashes.spawn(_c.copy(P.pos).addScaledVector(P.fwd, 4.5), 3, 0xffd080, 0.08);
    sfx.shot();
    if (G.tut.on) G.tut.shots++;
  }
  const lw = WEAPONS.laser[P.laserLv];
  const wantLaser = P.alive && !P.docking && (input.button('laser') || mouse.laser);
  P.laserOn = false;
  if (wantLaser && P.energy > 3) {
    P.laserOn = true; P.energy = Math.max(0, P.energy - lw.drain * dt);
    laserTick(dt, lw);
    sfx.laser();
  } else P.energy = Math.min(100, P.energy + SHIP.energyRegen * dt);
  if (wantLaser && P.energy <= 3) hint('energy', 'Sin energía de láser: soltalo un momento para que se recargue.', 6);
  return { x: ax, y: ay };
}

/** Dirección de disparo con ayuda de puntería hacia el rombo predictivo. */
function aimDir(out) {
  out.copy(P.fwd);
  if (G.target && G.leadValid) {
    _e.subVectors(G.lead, P.pos).normalize();
    const ang = Math.acos(clamp(_e.dot(P.fwd), -1, 1)) * 180 / Math.PI;
    if (ang < G.diff.assist + (input.isTouch ? 3 : 0)) out.copy(_e);
  }
  return out;
}

/** Láser secundario: rayo instantáneo (hitscan) que se detiene en la primera cobertura o blanco. */
function laserTick(dt, lw) {
  const W = ctx.W;
  aimDir(_a);
  _c.copy(P.pos).addScaledVector(P.fwd, 4.2);
  let best = Math.min(lw.range, W.grid.ray(_c, _a, lw.range));
  let hitE = null, hitKind = '';
  const ray = (/** @type {THREE.Vector3} */ p, /** @type {number} */ r) => {
    const ox = p.x - _c.x, oy = p.y - _c.y, oz = p.z - _c.z, t = ox * _a.x + oy * _a.y + oz * _a.z;
    if (t < 0 || t > best) return -1;
    const d2 = ox * ox + oy * oy + oz * oz - t * t; return d2 < r * r ? t : -1;
  };
  for (const e of enemies.all) { if (!e.alive) continue; const t = ray(e.pos, /** @type {any} */ (ENEMY)[e.type].radius + 0.6); if (t >= 0) { best = t; hitE = e; hitKind = 'enemy'; } }
  for (const m of fx.mines.items) { if (!m.alive) continue; const t = ray(m.pos, 2.4); if (t >= 0) { best = t; hitE = m; hitKind = 'mine'; } }
  for (const m of fx.torps.items) { if (!m.alive) continue; const t = ray(m.pos, 2.2); if (t >= 0) { best = t; hitE = m; hitKind = 'torp'; } }
  for (const tr of W.transmitters) { if (!tr.alive) continue; const t = ray(tr.pos, tr.shielded ? 15 : 9); if (t >= 0) { best = t; hitE = tr; hitKind = 'tr'; } }
  if (boss.phase >= 1 && boss.phase < 4) {
    for (const p of boss.weakPoints(_wp)) { const t = ray(p, p === boss.reactor.world ? 7 : 5); if (t >= 0) { best = t; hitE = p; hitKind = 'boss'; } }
    for (const h of boss.hullSpheres) { const t = ray(h.world, h.r * 0.8); if (t >= 0 && t < best) { best = t; hitE = null; hitKind = 'hull'; } }
  }
  P.laserLen = best; P.laserHit = !!hitKind;
  _d.copy(_c).addScaledVector(_a, best);
  const dmg = lw.dps * dt;
  if (hitKind === 'enemy') enemies.damage(hitE, dmg, _a, 'laser');
  else if (hitKind === 'mine') explodeMine(hitE, false);
  else if (hitKind === 'torp') { hitE.alive = false; fx.parts.burst(hitE.pos, 16, 0xffa040, 18, 0.6); addScore(40); }
  else if (hitKind === 'tr') damageTransmitter(hitE, dmg, _d);
  else if (hitKind === 'boss') { const r = boss.hit(hitE, dmg, true); if (r === 'block') fx.parts.trail(_d, 0x9fd8ff, 0.2); }
  if (Math.random() < 0.5) fx.parts.trail(_d, hitKind ? 0xfff0a0 : 0x7dffb0, 0.25, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
}
const _wp = /** @type {THREE.Vector3[]} */ ([]);

/** Selección de objetivo + cálculo del punto de intercepción (retícula predictiva). */
const _cands = /** @type {any[]} */ ([]);
const _bossTargets = [0, 1, 2, 3].map(() => ({ pos: V(), vel: V(), alive: true, isBoss: true, label: 'NÉMESIS' }));
function targetables() {
  _cands.length = 0;
  for (const e of enemies.all) if (e.alive) _cands.push(e);
  if (boss.phase >= 1 && boss.phase < 4) { const wp = boss.weakPoints(_wp); wp.forEach((p, i) => { if (i < 4) { const bt = _bossTargets[i]; bt.pos.copy(p); bt.vel.copy(boss.vel); _cands.push(bt); } }); }
  for (const tr of ctx.W.transmitters) if (tr.alive && !tr.shielded) _cands.push(tr);
  return _cands;
}
function scoreCand(c) {
  _e.subVectors(c.pos, P.pos); const d = _e.length(); if (d > 360) return -1;
  const dot = _e.dot(P.fwd) / d; if (dot < 0.72) return -1;
  return dot * 2 - d / 400;
}
function targeting(dt) {
  const cands = targetables();
  if (G.target && (G.target.alive === false || !cands.includes(G.target) || scoreCand(G.target) < 0)) G.target = null;
  G.targetT -= dt;
  if (input.hit('KeyQ', 'Tab')) {
    // siguiente objetivo visible, ordenado por ángulo
    const vis = cands.filter(c => scoreCand(c) >= 0).sort((a, b) => scoreCand(b) - scoreCand(a));
    if (vis.length) { const i = vis.indexOf(G.target); G.target = vis[(i + 1) % vis.length]; G.targetT = 2.5; sfx.click(); }
  }
  if (G.targetT <= 0) {
    let best = null, bs = -1;
    for (const c of cands) { const s = scoreCand(c); if (s > bs) { bs = s; best = c; } }
    if (best && (!G.target || bs > scoreCand(G.target) + 0.25)) G.target = best;
    G.targetT = 0.25;
  }
  G.leadValid = false; G.leadOk = false;
  if (G.target) {
    const pw = WEAPONS.pulse[P.pulseLv];
    _a.subVectors(G.target.pos, P.pos);
    _b.copy(G.target.vel || _c.set(0, 0, 0)).sub(P.vel);
    const s = pw.speed, aa = _b.dot(_b) - s * s, bb = 2 * _a.dot(_b), cc = _a.dot(_a);
    const disc = bb * bb - 4 * aa * cc;
    let t = -1;
    if (Math.abs(aa) < 1e-6) t = -cc / bb; else if (disc >= 0) { const r1 = (-bb - Math.sqrt(disc)) / (2 * aa), r2 = (-bb + Math.sqrt(disc)) / (2 * aa); t = Math.min(r1, r2) > 0 ? Math.min(r1, r2) : Math.max(r1, r2); }
    if (t > 0 && t < 4) {
      G.lead.copy(G.target.pos).addScaledVector(_b, t);
      G.leadValid = true;
      _e.subVectors(G.lead, P.pos).normalize();
      const ang = Math.acos(clamp(_e.dot(P.fwd), -1, 1)) * 180 / Math.PI;
      G.leadOk = ang < G.diff.assist + (input.isTouch ? 3 : 0) && _a.length() < 280;
    }
  }
}

/* ---------- proyectiles ---------- */
function updatePlayerProjectiles(dt) {
  const W = ctx.W;
  for (const b of fx.pbolts.items) {
    if (!b.alive) continue;
    b.pos.addScaledVector(b.vel, dt); b.life -= dt; b.t += dt;
    if (b.life <= 0) { b.alive = false; continue; }
    if (W.grid.hit(b.pos, 0) >= 0) { b.alive = false; fx.parts.burst(b.pos, 5, 0xffd8a0, 10, 0.35); continue; }
    _d.copy(b.vel).normalize();
    let done = false;
    for (const e of enemies.all) {
      if (!e.alive) continue;
      const r = /** @type {any} */ (ENEMY)[e.type].radius + 0.9;
      if (e.pos.distanceToSquared(b.pos) < r * r) {
        const k = enemies.damage(e, b.dmg, _d, b.owner === 2 ? 'ally' : 'pulse');
        fx.parts.burst(b.pos, 6, k < 0.5 ? 0x8fd8ff : 0xffc080, 14, 0.35);
        if (k < 0.5) sfx.block(); else sfx.hit();
        if (k >= 1.6) fx.flashes.spawn(b.pos, 6, 0xff9a40, 0.2);
        b.alive = false; done = true; break;
      }
    }
    if (done) continue;
    for (const m of fx.mines.items) if (m.alive && m.pos.distanceToSquared(b.pos) < 7) { explodeMine(m, false); b.alive = false; done = true; break; }
    if (done) continue;
    for (const m of fx.torps.items) if (m.alive && m.pos.distanceToSquared(b.pos) < 6) { m.hp -= b.dmg; if (m.hp <= 0) { m.alive = false; fx.parts.burst(m.pos, 16, 0xffa040, 18, 0.6); fx.flashes.spawn(m.pos, 10, 0xffa040, 0.3); addScore(40); sfx.boom(m.pos, 0.2); } b.alive = false; done = true; break; }
    if (done) continue;
    for (const tr of W.transmitters) {
      if (!tr.alive) continue;
      const r = tr.shielded ? 15 : 9;
      const p = tr.shielded ? tr.shield.position : tr.pos;
      if (p.distanceToSquared(b.pos) < r * r) {
        if (tr.shielded) { fx.parts.burst(b.pos, 6, 0x66ccff, 10, 0.4); sfx.block(); if (b.owner === 0) ctx.hint('transmitter'); }
        else damageTransmitter(tr, b.dmg, b.pos);
        b.alive = false; done = true; break;
      }
    }
    if (done) continue;
    if (boss.phase >= 1 && boss.phase < 5) {
      const r = boss.hit(b.pos, b.dmg);
      if (r) { b.alive = false; fx.parts.burst(b.pos, 6, r === 'hit' ? 0xffc080 : 0x9fd8ff, 14, 0.35); if (r === 'hit') sfx.hit(); else sfx.block(); }
    }
  }
}
function damageTransmitter(tr, dmg, at) {
  tr.hp -= dmg; tr.flash = 1;
  fx.parts.trail(at, 0xff6070, 0.3);
  if (tr.hp <= 0 && tr.alive) {
    tr.alive = false; tr.mesh.visible = false; tr.core.visible = false; tr.shield.visible = false;
    fx.parts.burst(tr.pos, 70, 0xff6070, 40, 1.4); fx.flashes.spawn(tr.pos, 70, 0xff8090, 0.9); sfx.boom(tr.pos, 1);
    const i = ctx.W.transmitters.indexOf(tr); G.session.sectors[1].transmitters[i] = true;
    addScore(1200);
    MM.emit('transmitterDown');
    const left = ctx.W.transmitters.filter(t => t.alive).length;
    ui.banner('TRANSMISOR DESTRUIDO', left ? `QUEDAN ${left}` : 'RED ENEMIGA CAÍDA', left ? 'Escaneá la próxima baliza ◎' : '', 2200);
    shakeIt(0.4);
  }
}
function explodeMine(m, armed) {
  m.alive = false;
  fx.parts.burst(m.pos, armed ? 40 : 18, 0xff5a3a, armed ? 34 : 18, armed ? 0.9 : 0.5);
  fx.flashes.spawn(m.pos, armed ? 34 : 12, 0xff7050, armed ? 0.6 : 0.3);
  sfx.boom(m.pos, armed ? 0.5 : 0.2);
  if (!armed) { addScore(30); return; }
  const r2 = 17 * 17;
  if (P.pos.distanceToSquared(m.pos) < r2) damagePlayer(m.dmg, m.pos, 'mine');
  for (const f of ctx.W.freighters) if (f.alive && f.pos.distanceToSquared(m.pos) < 20 * 20) damageAlly(f, 45 * G.diff.enemyDmg, 'mine');
  if (ctx.W.esperanza && ctx.W.esperanza.alive && ctx.W.esperanza.pos.distanceToSquared(m.pos) < 20 * 20) damageAlly(ctx.W.esperanza, 45 * G.diff.enemyDmg, 'mine');
}
/** Bloques de aliados (cargueros) contra disparos: el carguero es largo, se prueba con 3 esferas. */
function allyHit(f, p, r) {
  if (!f.alive || f.warp > 0) return false;
  _e.set(0, 0, 1).applyQuaternion(f.body.quaternion);
  for (let k = -1; k <= 1; k++) { _f.copy(f.pos).addScaledVector(_e, k * 9); if (_f.distanceToSquared(p) < r * r) return true; }
  return false;
}
function alliesList() {
  const W = ctx.W; _allies.length = 0;
  for (const f of W.freighters) if (f.alive) _allies.push(f);
  for (const f of W.stranded) if (f.alive && !f.saved) _allies.push(f);
  if (W.esperanza && W.esperanza.alive) _allies.push(W.esperanza);
  return _allies;
}
function updateEnemyProjectiles(dt) {
  const W = ctx.W;
  const allies = alliesList();
  for (const b of fx.ebolts.items) {
    if (!b.alive) continue;
    b.pos.addScaledVector(b.vel, dt); b.life -= dt;
    if (b.life <= 0) { b.alive = false; continue; }
    if (W.grid.hit(b.pos, 0) >= 0) { b.alive = false; fx.parts.burst(b.pos, 4, 0xff7090, 8, 0.3); continue; }
    if (P.alive && b.pos.distanceToSquared(P.pos) < 3.2 * 3.2) { b.alive = false; damagePlayer(b.dmg, b.pos); fx.parts.burst(b.pos, 8, 0x8fe0ff, 12, 0.4); continue; }
    for (const f of allies) if (allyHit(f, b.pos, 5)) { b.alive = false; damageAlly(f, b.dmg, 'bolt'); fx.parts.burst(b.pos, 6, 0xffa070, 10, 0.4); break; }
  }
  // torpedos: guiados hacia su objetivo, se pueden derribar
  for (const tp of fx.torps.items) {
    if (!tp.alive) continue;
    tp.life -= dt; tp.t += dt;
    if (tp.life <= 0) { tp.alive = false; fx.parts.burst(tp.pos, 12, 0xffa040, 14, 0.5); continue; }
    const tg = tp.target && tp.target.alive !== false ? tp.target : P;
    _a.subVectors(tg.pos, tp.pos); const d = _a.length(); _a.divideScalar(d || 1);
    _b.copy(tp.vel).normalize().lerp(_a, Math.min(1, dt * 1.3)).normalize();
    tp.vel.copy(_b).multiplyScalar(Math.min(26, 14 + tp.t * 6));
    tp.pos.addScaledVector(tp.vel, dt);
    if (Math.random() < 0.6) fx.parts.trail(tp.pos, 0xff9a40, 0.5, -tp.vel.x * 0.1, -tp.vel.y * 0.1, -tp.vel.z * 0.1);
    if (W.grid.hit(tp.pos, 0) >= 0) { tp.alive = false; fx.parts.burst(tp.pos, 20, 0xffa040, 20, 0.7); sfx.boom(tp.pos, 0.3); continue; }
    if (tg === P ? d < 3.5 : allyHit(tg, tp.pos, 7)) {
      tp.alive = false; fx.parts.burst(tp.pos, 36, 0xffa040, 30, 0.9); fx.flashes.spawn(tp.pos, 30, 0xffa040, 0.6); sfx.boom(tp.pos, 0.7);
      if (tg === P) damagePlayer(28 * G.diff.enemyDmg, tp.pos, 'torp'); else damageAlly(tg, 48 * G.diff.enemyDmg, 'torp');
    }
  }
  // minas: se arman, avisan (parpadeo + pitido) y estallan
  for (const m of fx.mines.items) {
    if (!m.alive) continue;
    m.life -= dt; m.t += dt;
    if (m.life <= 0) { m.alive = false; continue; }
    if (m.state === 0 && m.t > 1.2) m.state = 1;
    if (m.state === 1) {
      let near = P.alive && P.pos.distanceToSquared(m.pos) < 15 * 15;
      for (const f of allies) if (!near && f.pos.distanceToSquared(m.pos) < 18 * 18) near = true;
      if (near) { m.state = 2; m.t = 0; }
    } else if (m.state === 2) {
      if (Math.floor(m.t * 8) !== Math.floor((m.t - dt) * 8)) { sfx.mineBeep(); fx.flashes.spawn(m.pos, 12 + m.t * 26, 0xff3030, 0.14); }
      if (m.t > 0.85) explodeMine(m, true);
    }
  }
}

/* ---------- interactivos ---------- */
function interactables(dt) {
  const W = ctx.W, st = G.session.sectors[G.sectorIdx];
  // balizas: raycast desde la nariz + mantener SCAN
  const scanning = P.alive && !P.docking && input.button('scan');
  P.scanTarget = null;
  let bestB = null, bestDot = 0.965;
  for (const b of W.beacons) {
    if (b.scanned) continue;
    _a.subVectors(b.pos, P.pos); const d = _a.length();
    if (d > 130) continue;
    const dot = _a.dot(P.fwd) / d;
    if (dot > bestDot && !W.grid.blocked(P.pos, b.pos, 0.7)) { bestDot = dot; bestB = b; }
  }
  if (bestB) {
    P.scanTarget = bestB;
    if (scanning) {
      bestB.progress = Math.min(1, bestB.progress + dt / 1.4); sfx.scanTick();
      if (bestB.progress >= 1) scanDone(bestB);
    } else if (!G.tut.on) hint('scanhint', input.isTouch ? 'Baliza en la mira: mantené SCAN.' : 'Baliza en la mira: mantené E para escanear.', 12);
  } else if (scanning && input.hit('KeyE', 'btn:scan')) hint('noscan', 'Apuntá a una baliza ◎ (cerca y sin rocas en medio) para escanear.', 4);
  for (const b of W.beacons) if (!b.scanned && b !== bestB) b.progress = Math.max(0, b.progress - dt * 0.25);

  // torretas aliadas: se activan atravesando su anillo; luego disparan solas
  W.turrets.forEach((t, i) => {
    if (!t.active) {
      if (P.alive && P.pos.distanceToSquared(t.ringPos) < 11 * 11) {
        t.active = true; t.boot = 0; st.turrets[i] = true; t.ringMat.color.setHex(0x5bff9a);
        sfx.turretOn(); ui.hint('Torreta aliada activada: dispara sola a los enemigos cercanos.', 2600); addScore(200);
        fx.parts.burst(t.ringPos, 30, 0x5bff9a, 20, 0.8);
      }
      return;
    }
    if (t.boot < 1) { t.boot = Math.min(1, t.boot + dt / 1.4); t.head.scale.setScalar(0.35 + 0.65 * t.boot); t.head.position.y = 2.6 + t.boot * 1.4; return; }
    t.cd -= dt;
    let best = null, bd = 170 * 170;
    for (const e of enemies.all) { if (!e.alive) continue; const d = e.pos.distanceToSquared(t.pos); if (d < bd) { bd = d; best = e; } }
    if (best) {
      _a.subVectors(best.pos, t.pos);
      t.head.rotation.y = Math.atan2(_a.x, _a.z); t.head.rotation.x = -Math.atan2(_a.y, Math.hypot(_a.x, _a.z)) * 0.6;
      if (t.cd <= 0 && !W.grid.blocked(t.pos, best.pos)) {
        t.cd = 0.5;
        const tt = Math.sqrt(bd) / 150; _b.copy(best.pos).addScaledVector(best.vel, tt).sub(t.pos).normalize();
        _c.copy(t.pos).addScaledVector(_b, 5).y += 1;
        fx.pbolts.spawn(_c, _b.multiplyScalar(150), 1.6, 9, 2);
        sfx.allyShot(t.pos);
      }
    } else t.head.rotation.y += dt * 0.4;
  });

  // docks de reparación: entrar al anillo → atraque, reparación y mejora de arma
  W.docks.forEach((d, i) => {
    if (P.docking === d) {
      d.armK = Math.min(1, d.armK + dt * 2);
      if (P.dockT > 0.5 && P.dockT < 2.0) { P.shield = Math.min(100, P.shield + dt * 90); P.hull = Math.min(100, P.hull + dt * 80); if (Math.random() < 0.5) fx.parts.trail(_a.copy(P.pos).add(_b.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6)), 0x5bff9a, 0.5); }
      if (P.dockT >= 2.2) {
        P.docking = null; d.used = true; st.docks[i] = true; d.lightMat.color.setHex(0xff4a4a); d.lightMat.opacity = 0.25;
        P.shield = 100; P.hull = 100;
        let up = '';
        if (P.pulseLv <= P.laserLv && P.pulseLv < 3) { P.pulseLv++; up = `PULSO NV${P.pulseLv}`; }
        else if (P.laserLv < 3) { P.laserLv++; up = `LÁSER NV${P.laserLv}`; }
        else { addScore(1000); up = '+1000 puntos'; }
        sfx.repair(); ui.banner('DOCK DE REPARACIÓN', 'NAVE REPARADA', 'Mejora: ' + up, 2200);
        P.vel.copy(P.fwd).multiplyScalar(SHIP.speed * 0.6); P.invuln = 1.5;
      }
    } else d.armK = Math.max(0, d.armK - dt * 1.5);
    d.arms.forEach((a, k) => { a.rotation.x = -d.armK * 0.9; });
    if (!d.used && !P.docking && P.alive && P.pos.distanceToSquared(d.pos) < 10 * 10) {
      P.docking = d; P.dockT = 0; sfx.dock(); ui.hint('Atracando… reparación en curso.', 2000);
    }
  });

  // cápsulas de rescate
  W.capsules.forEach((c, i) => {
    if (c.taken || !P.alive) return;
    if (P.pos.distanceToSquared(c.pos) < 7.5 * 7.5) {
      c.taken = true; c.group.visible = false; st.capsules[i] = true;
      G.session.capsules++; S.capsulesTotal++; save.flush();
      P.shield = Math.min(100, P.shield + 15); addScore(150);
      MM.emit('capsule');
      sfx.pickup(); fx.parts.burst(c.pos, 24, 0xffb13b, 16, 0.7);
      ui.hint(`Cápsula de rescate recuperada (${G.session.capsules} en la campaña)`, 2200);
    }
  });
}
function scanDone(b) {
  const W = ctx.W, st = G.session.sectors[G.sectorIdx];
  b.scanned = true; b.progress = 1; b.ringMat.color.setHex(0x5bff9a);
  st.beacons[W.beacons.indexOf(b)] = true;
  sfx.scanDone(); addScore(250);
  fx.parts.burst(b.pos, 30, 0x5bff9a, 18, 0.9);
  if (G.sectorIdx === 1 && b.link >= 0) {
    const tr = W.transmitters[b.link];
    if (tr && tr.alive) { tr.shielded = false; tr.shield.visible = false; fx.parts.burst(tr.shield.position, 60, 0x66ccff, 30, 1); }
    ui.banner('FRECUENCIA DECODIFICADA', `TRANSMISOR ${b.link + 1} SIN ESCUDO`, '¡Destruilo!', 2400);
  } else {
    W.capsules.forEach(c => c.revealed = true);
    const all = W.beacons.every(x => x.scanned);
    if (all) {
      let up = '';
      if (P.laserLv <= P.pulseLv && P.laserLv < 3) { P.laserLv++; up = `LÁSER NV${P.laserLv}`; } else if (P.pulseLv < 3) { P.pulseLv++; up = `PULSO NV${P.pulseLv}`; } else { addScore(800); up = '+800 puntos'; }
      ui.banner('DATOS DE BALIZAS COMPLETOS', 'MEJORA DE ARMA', up, 2400);
    } else ui.hint('Baliza escaneada: cápsulas de rescate marcadas en el radar.', 2600);
  }
}

/* ---------- lógica de cada sector ---------- */
const WAVES = [
  [{ at: 0.04, s: [['interceptor', 3]] }, { at: 0.14, s: [['drone', 2]] }, { at: 0.27, s: [['interceptor', 3], ['bomber', 1]] }, { at: 0.41, s: [['drone', 3], ['interceptor', 2]] },
    { at: 0.55, s: [['bomber', 2], ['interceptor', 2]] }, { at: 0.68, s: [['frigate', 1], ['drone', 2]] }, { at: 0.82, s: [['interceptor', 4], ['bomber', 1]] }],
  [{ at: 5, s: [['interceptor', 3]] }, { at: 22, s: [['drone', 3]] }, { at: 40, s: [['frigate', 1], ['interceptor', 2]] }, { at: 70, s: [['bomber', 1], ['interceptor', 3]] }, { at: 100, s: [['drone', 2], ['interceptor', 2]] }],
  [{ at: 4, s: [['interceptor', 3]] }, { at: 14, s: [['drone', 3]] }],
];
const ESCORT_WAVES = [{ at: 1, s: [['interceptor', 3], ['bomber', 1]] }, { at: 14, s: [['interceptor', 2], ['bomber', 1]] }, { at: 26, s: [['drone', 2], ['interceptor', 2]] }];

function runWaves(list, value, key, near) {
  const s = G.sec;
  while (s[key] < list.length && value >= list[s[key]].at) {
    const w = list[s[key]++];
    for (const [type, n] of w.s) {
      let o = { near };
      if (type === 'frigate') {
        const W = ctx.W;
        const prot = G.sectorIdx === 0 ? W.freighters.find(f => f.alive) : W.transmitters.find(t => t.alive) || null;
        o = { near: prot ? prot.pos : near, protect: prot, min: 90, max: 130 };
      }
      spawnGroup(type, type === 'frigate' ? 1 : waveCount(n), o);
    }
    if (s[key] > 1) sfx.alarm();
  }
}
function director(dt, active) {
  const s = G.sec;
  if (!active) return;
  s.dirT -= dt;
  if (s.dirT <= 0) { s.dirT = 13 / G.diff.waves; if (enemies.count() < 3) spawnGroup('interceptor', 2); }
}
function sectorLogic(dt) {
  const W = ctx.W, s = G.sec, D = G.diff;
  if (G.sectorIdx === 0) {
    // convoy: espera al tutorial (máx. 45 s) y avanza por la ruta
    const waiting = G.tut.on && s.t < 45;
    if (!waiting) {
      if (!s.started) { s.started = true; ui.hint('El convoy arranca: mantenete cerca y derribá lo que lo ataque.', 3000); }
      s.progress = Math.min(1, s.progress + 7.2 * dt / W.pathLen);
      runWaves(WAVES[0], s.progress, 'wave', W.freighters[0].pos);
      director(dt, s.progress < 0.95);
    }
    let lead = null;
    for (const f of W.freighters) {
      const u = clamp(s.progress - f.lag / W.pathLen, 0, 1);
      W.path.getPointAt(u, f.pos); W.path.getTangentAt(u, f.fwd);
      _a.crossVectors(f.fwd, UP).normalize(); f.pos.addScaledVector(_a, f.side);
      if (f.warp > 0) { f.warp += dt; f.pos.addScaledVector(f.fwd, f.warp * f.warp * 80); }
      f.body.position.copy(f.pos); f.glow.position.copy(f.pos);
      _b.copy(f.pos).add(f.fwd); f.body.lookAt(_b); f.glow.quaternion.copy(f.body.quaternion);
      f.flash = Math.max(0, f.flash - dt * 4);
      if (f.alive && !lead) lead = f;
    }
    if (s.progress >= 1 && !s.arrived) {
      s.arrived = true; s.arriveT = 0;
      W.freighters.forEach(f => { if (f.alive) f.warp = 0.01; }); sfx.warp(); if (!reducedMotion()) ui.warp(true);
      MM.emit('convoySaved'); addScore(2000);
      ui.banner('CONVOY A SALVO', 'SALTO COMPLETADO', '', 2000);
    }
    if (s.arrived) { s.arriveT += dt; if (s.arriveT > 1.6) { ui.warp(false); sectorComplete(); } }
  } else if (G.sectorIdx === 1) {
    runWaves(WAVES[1], s.t, 'wave', P.pos);
    director(dt, true);
    // cargueros varados: sus atacantes aparecen al acercarse o con el tiempo
    W.stranded.forEach((f, i) => {
      f.flash = Math.max(0, f.flash - dt * 4);
      if (f.saved || !f.alive) {
        if (f.warp > 0) { f.warp += dt; _a.set(0, 0, 1).applyQuaternion(f.body.quaternion); f.body.position.addScaledVector(_a, f.warp * f.warp * 200 * dt); f.glow.position.copy(f.body.position); if (f.warp > 1.5) { f.body.visible = f.glow.visible = false; f.warp = 0; } }
        return;
      }
      if (!f.spawned && (P.pos.distanceTo(f.pos) < 170 || s.t > (i ? 75 : 30))) {
        f.spawned = true;
        f.attackers = [...spawnGroup('bomber', 1, { near: f.pos, group: i, min: 80, max: 110 }), ...spawnGroup('interceptor', waveCount(2), { near: f.pos, group: i, min: 90, max: 130 })];
        ui.banner('¡AUXILIO!', `CARGUERO ${f.name} BAJO ATAQUE`, 'Derribá a sus atacantes', 2400); sfx.alarm();
      }
      if (f.spawned && f.attackers.every(e => !e.alive || e.group !== i)) {
        f.saved = true; f.warp = 0.01; G.session.sectors[1].stranded[i] = 'saved';
        G.session.freighters++; MM.emit('freighterSaved'); addScore(800); sfx.warp();
        ui.banner('CARGUERO A SALVO', f.name, `${G.session.freighters}/2 cargueros aliados salvados`, 2200);
      }
    });
    if (W.transmitters.every(t => !t.alive) && !s.doneT) { s.doneT = 0.01; }
    if (s.doneT) { s.doneT += dt; if (s.doneT > 1.6) sectorComplete(); }
  } else {
    const E = W.esperanza;
    E.flash = Math.max(0, E.flash - dt * 4);
    if (!s.bossOn) {
      runWaves(WAVES[2], s.t, 'wave', P.pos);
      if (s.t > 22 && !s.alarm) { s.alarm = true; ui.banner('ALERTA', 'SEÑAL MASIVA ENTRANTE', 'Algo enorme sale del hiperespacio…', 2600, true); sfx.alarm(); }
      if (s.t > 27) startBoss();
    }
    if (s.escort) {
      s.escortT += dt;
      runWaves(ESCORT_WAVES, s.escortT, 'escortWave', E.pos);
      director(dt, true);
      if (E.alive) {
        _a.subVectors(W.gate.pos, E.pos); const d = _a.length();
        if (d > 6) { _a.divideScalar(d); E.pos.addScaledVector(_a, Math.min(d, 11 * dt)); _b.copy(E.pos).add(_a); E.body.lookAt(_b); E.glow.quaternion.copy(E.body.quaternion); }
        E.glow.position.copy(E.pos);
        if (d < 14 && !s.arrived) { s.arrived = true; s.arriveT = 0; sfx.warp(); if (!reducedMotion()) ui.warp(true); E.warp = 0.01; }
      }
      if (s.arrived) { s.arriveT += dt; _a.set(0, 0, 1).applyQuaternion(E.body.quaternion); E.pos.addScaledVector(_a, s.arriveT * 120 * dt); E.glow.position.copy(E.pos); if (s.arriveT > 1.4) { ui.warp(false); E.body.visible = E.glow.visible = false; sectorComplete(); } }
    }
  }
}
function startBoss() {
  const s = G.sec; s.bossOn = true;
  boss.start(ctx.W.bossSpawn);
  G.state = 'cine'; G.stateT = 0;
  stopTutorialIfAny();
  ui.banner('JEFE', 'DESTRUCTOR NÉMESIS', 'Fase 1 · Torretas', 4000, true);
  sfx.warp(); setTimeout(() => sfx.alarm(), 600);
  // los enemigos sueltos se retiran (el combate empieza limpio)
  for (const e of enemies.all) if (e.alive) { e.alive = false; fx.flashes.spawn(e.pos, 10, 0x9fd8ff, 0.4); }
  if (!reducedMotion()) ui.warp(true); setTimeout(() => ui.warp(false), 500);
}

/* ======================= cámara ======================= */
let camFov = 62;
function baseFov() { return camera.aspect < 0.8 ? 78 : camera.aspect < 1.2 ? 70 : 62; }
function snapCamera() {
  _cam.copy(P.pos).addScaledVector(P.fwd, -19.5).addScaledVector(P.up, 5.6);
  camera.position.copy(_cam); camera.up.copy(P.up); _look.copy(P.pos).addScaledVector(P.fwd, 30); camera.lookAt(_look);
}
function camFollow(dt, dying) {
  const back = P.boosting ? 22 : 19.5;
  _cam.copy(P.pos).addScaledVector(P.fwd, -back).addScaledVector(P.up, 5.6);
  camera.position.lerp(_cam, 1 - Math.exp(-dt * (dying ? 1 : 9)));
  _look.copy(P.pos).addScaledVector(P.fwd, 30).addScaledVector(P.up, 3.2);
  camera.up.lerp(P.up, Math.min(1, dt * 6)).normalize();
  if (G.shake > 0 && !reducedMotion()) { const s = G.shake * 0.7; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; }
  camera.lookAt(_look);
  const tf = baseFov() + (P.boosting ? 9 : 0);
  camFov += (tf - camFov) * Math.min(1, dt * 4);
  if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }
}
function camIntro(dt) {
  const k = Math.min(1, G.stateT / 2.4), e = k * k * (3 - 2 * k);
  // de adelante-costado a la persecución
  _a.copy(P.pos).addScaledVector(P.fwd, 22).addScaledVector(P.right, 12).addScaledVector(P.up, 4);
  _b.copy(P.pos).addScaledVector(P.fwd, -19.5).addScaledVector(P.up, 5.6);
  camera.position.lerpVectors(_a, _b, reducedMotion() ? 1 : e);
  camera.up.copy(P.up);
  _look.copy(P.pos).addScaledVector(P.fwd, 30 * e);
  camera.lookAt(_look);
}
function camBoss(dt) {
  const k = Math.min(1, G.stateT / 4.2);
  _a.copy(boss.pos).sub(P.pos).normalize();
  _b.copy(P.pos).addScaledVector(_a, -30).add(_c.set(0, 14 + k * 6, 0));
  camera.position.lerp(_b, 1 - Math.exp(-dt * 3));
  camera.up.set(0, 1, 0);
  _look.copy(boss.pos);
  camera.lookAt(_look);
}

/* ======================= render (visual) ======================= */
let radarT = 0;
const _mk = /** @type {any[]} */ ([]);
const _mkPool = Array.from({ length: 16 }, () => ({ x: 0, y: 0, edge: false, angle: 0, icon: '', color: '', label: '' }));
function render() {
  const W = ctx.W; if (!W) return;
  W.skyGroup.position.copy(camera.position);
  // nave
  ship.position.copy(P.pos);
  ship.rotation.set(-P.pitch, P.yaw, P.roll, 'YXZ');
  const thr = P.docking ? 0.2 : P.boosting ? 1.6 : 0.8 + (P.speed - SHIP.speed) / 60;
  for (const f of flames) f.scale.set(1, 1, Math.max(0.2, thr * (0.85 + Math.random() * 0.3)));
  shieldMat.opacity = P.shieldFlash * 0.45 * (P.shield > 0 ? 1 : 0.3);
  ship.visible = P.alive || G.state === 'menu';
  // cargueros: destello al recibir daño
  enemies.sync();
  fx.pbolts.sync(); fx.ebolts.sync(); fx.torps.sync();
  // minas: parpadeo según estado
  for (let i = 0; i < fx.mines.items.length; i++) {
    const m = fx.mines.items[i]; if (!m.alive) continue;
    const blink = m.state === 0 ? (Math.sin(m.t * 10) > 0 ? 2 : 0.6) : m.state === 2 ? (Math.sin(m.t * 40) > 0 ? 6 : 1) : (Math.sin(m.t * 3) > 0.8 ? 4 : 1);
    _colTmp.setRGB(blink, blink * (m.state === 2 ? 0.2 : 0.5), blink * 0.2); fx.mines.mesh.setColorAt(i, _colTmp);
  }
  fx.mines.sync(); if (fx.mines.mesh.instanceColor) fx.mines.mesh.instanceColor.needsUpdate = true;
  // líneas: telegrafía, láser, escaneo, vínculos de fragata
  const L = fx.lines; L.begin();
  if (P.laserOn && P.alive) {
    _a.copy(P.pos).addScaledVector(P.fwd, 4.2); aimDir(_b); _c.copy(_a).addScaledVector(_b, P.laserLen);
    L.add(_a, _c, 0.32 + Math.random() * 0.08, 0x7dffb0, 1); L.add(_a, _c, 0.9, 0x2a8a5a, 0.6);
  }
  if (P.scanTarget && input.button('scan')) { _a.copy(P.pos).addScaledVector(P.fwd, 3); L.add(_a, P.scanTarget.pos, 0.12, 0xffb13b, 0.5 + 0.5 * Math.sin(G.realT * 20)); }
  if (P.docking) L.add(P.pos, P.docking.pos, 0.6, 0x5bff9a, 0.5);
  for (const e of enemies.all) {
    if (!e.alive) continue;
    if (e.type === 'interceptor' && e.state === 1 && e.target) { _a.copy(e.pos).addScaledVector(e.fwd, 3); L.add(_a, e.target.pos, 0.1 + e.tele * 0.12, 0xff2a2a, 0.3 + e.tele * 0.7); }
    if (e.type === 'bomber' && e.state === 1 && e.target) { _a.copy(e.pos).addScaledVector(e.fwd, 6); L.add(_a, e.target.pos, 0.2 + e.tele * 0.3, 0xff8a1a, 0.3 + e.tele * 0.7); }
    if (e.shielded) for (const f of enemies.all) if (f.alive && f.type === 'frigate' && f.pos.distanceToSquared(e.pos) < 6400) { L.add(f.pos, e.pos, 0.1, 0x55d8ff, 0.45); break; }
  }
  if (boss.phase === 1) for (const t of boss.turrets) if (t.alive && t.state === 1) L.add(t.world, P.pos, 0.12 + t.tele * 0.2, 0xff2030, 0.3 + t.tele * 0.7);
  if (boss.phase === 2 && boss.beam.state > 0) {
    const bm = boss.beam;
    if (bm.state === 1) { L.add(bm.from, bm.to, 1.2 + bm.t * 1.5, 0xff2030, 0.15 + 0.25 * (Math.sin(G.realT * 30) > 0 ? 1 : 0.4)); }
    else { L.add(bm.from, bm.to, 5, 0xff4050, 1); L.add(bm.from, bm.to, 9, 0x801020, 0.6); }
  }
  L.end();
  hudRender();
}
const _colTmp = new THREE.Color();

/** Proyección a pantalla. Devuelve false si está detrás de la cámara. */
function toScreen(p, out) {
  _proj.copy(p).project(camera);
  out.x = (_proj.x + 1) / 2 * innerWidth; out.y = (1 - _proj.y) / 2 * innerHeight;
  return _proj.z < 1 && _proj.z > -1;
}
const _sp = { x: 0, y: 0 }, _sp2 = { x: 0, y: 0 };
function hudRender() {
  const W = ctx.W;
  if (G.state !== 'play' && G.state !== 'intro' && G.state !== 'cine' && G.state !== 'dying') return;
  ui.status({ score: G.score, shield: P.shield, hull: P.hull, boost: P.boost, energy: P.energy, pulseLv: P.pulseLv, laserLv: P.laserLv });
  ui.vignette(reducedMotion() ? Math.min(0.35, G.vign) : G.vign + (P.hull < 30 && P.alive ? 0.25 + 0.15 * Math.sin(G.realT * 6) : 0));
  hudFrame++;
  if (hudFrame % 6 === 0) hudTexts();
  hudPointers();
}
let hudFrame = 0;
function hudTexts() {
  const W = ctx.W;
  // objetivo del sector
  const s = G.sec, d = SECTORS[G.sectorIdx];
  let goal = d.goal, prog = '';
  if (G.sectorIdx === 0) {
    const alive = W.freighters.filter(f => f.alive).length;
    goal = G.tut.on && !s.started ? 'Prepará la escolta: el convoy espera tu señal' : 'Escoltá al convoy hasta el portal de salto';
    prog = `Convoy ${alive}/3 · ruta ${Math.round(s.progress * 100)}% · ` + W.freighters.map(f => f.alive ? Math.round(f.hp / f.max * 100) + '%' : '✖').join(' ');
  } else if (G.sectorIdx === 1) {
    const left = W.transmitters.filter(t => t.alive).length;
    goal = left ? 'Escaneá las balizas ◎ y destruí los transmisores ✖' : 'Red enemiga caída';
    prog = `Transmisores ${3 - left}/3 · cargueros ${W.stranded.filter(f => f.saved).length}/2 salvados`;
  } else {
    if (s.escort) { goal = 'Escoltá al carguero Esperanza hasta el portal'; prog = `Esperanza ${Math.round(W.esperanza.hp / W.esperanza.max * 100)}% · portal a ${Math.round(W.esperanza.pos.distanceTo(W.gate.pos))} m`; }
    else if (s.bossOn) { const L = { 1: 'Destruí las 4 torretas ◆', 2: 'Destruí los 3 emisores ◆ cuando se abran', 3: 'Disparale al reactor cuando se abra', 4: '¡Se desarma!' }; goal = /** @type {any} */ (L)[Math.floor(boss.phase)] || 'Destructor Némesis'; prog = 'Fase ' + Math.min(3, Math.floor(boss.phase)) + ' de 3'; }
    else { goal = 'Resistí: algo se acerca'; prog = `Contacto en ${Math.max(0, Math.ceil(27 - s.t))} s`; }
  }
  ui.objective(`SECTOR ${G.sectorIdx + 1} · ${d.short}`, goal, prog);
  const showBoss = s.bossOn && boss.phase >= 1 && boss.phase < 5;
  if (showBoss) { const b = boss.bar(); ui.boss(true, ['', 'NÉMESIS · TORRETAS', 'NÉMESIS · EMISORES DE ESCUDO', 'NÉMESIS · REACTOR', 'NÉMESIS'][Math.floor(boss.phase)] || 'NÉMESIS', b.cur / b.max); } else ui.boss(false);
  const st = MM.state();
  ui.secondaries(st.current.filter(/** @param {any} m */ m => m.kind !== 'primary').map(/** @param {any} m */ m => { const def = /** @type {any} */ (MISSIONS.find(x => x.id === m.id) || { target: 1 }); return { title: def.short || m.title, progress: m.progress, target: def.target, status: m.status }; }));
}
function hudPointers() {

  // retícula: punto de impacto a 90 m
  _a.copy(P.pos).addScaledVector(P.fwd, 90);
  if (toScreen(_a, _sp)) ui.reticle(_sp.x, _sp.y);
  // objetivo + rombo predictivo
  if (G.target && P.alive) {
    const on = toScreen(G.target.pos, _sp2);
    if (on) {
      const dist = G.target.pos.distanceTo(P.pos), r = G.target.type ? /** @type {any} */ (ENEMY)[G.target.type].radius : 6;
      const size = r * 2 / dist * innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360)) * 1.6;
      const k = G.target.max ? G.target.hp / G.target.max : 1;
      const lbl = G.target.type ? { interceptor: 'INTERCEPTOR', drone: 'DRON MINADOR', bomber: 'BOMBARDERO', frigate: 'FRAGATA' }[/** @type {'drone'} */ (G.target.type)] : G.target.label || 'TRANSMISOR';
      ui.target(true, _sp2.x, _sp2.y, size, k, `${lbl} · ${Math.round(dist)} m`);
    } else ui.target(false);
    if (G.leadValid && toScreen(G.lead, _sp2)) ui.lead(true, _sp2.x, _sp2.y, G.leadOk); else ui.lead(false);
  } else { ui.target(false); ui.lead(false); }
  // escaneo
  if (P.scanTarget && toScreen(P.scanTarget.pos, _sp2)) ui.scan(true, _sp2.x, _sp2.y, P.scanTarget.progress); else ui.scan(false);
  markers();
  radarT -= 1;
  if (radarT <= 0) { radarT = 4; drawRadar(); }
}

function pushMarker(pos, icon, color, important, label) {
  if (_mk.length >= _mkPool.length) return;
  const m = _mkPool[_mk.length];
  _a.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  const w = innerWidth, h = innerHeight, mx = 26, portrait = h > w;
  const myT = portrait ? 250 : h < 520 ? 120 : 170, myB = input.isTouch ? (portrait ? 230 : 120) : 80;
  const dist = pos.distanceTo(P.pos);
  if (_a.z < 0 && toScreen(pos, _sp) && _sp.x > mx && _sp.x < w - mx && _sp.y > 40 && _sp.y < h - 40) {
    if (!important && dist > 380) return;
    m.x = _sp.x; m.y = _sp.y; m.edge = false;
  } else {
    if (!important) return;
    // flecha en el borde, en la dirección del objetivo
    let ang = Math.atan2(-_a.y, _a.x);
    if (_a.z > 0 && Math.abs(_a.x) < 1e-3 && Math.abs(_a.y) < 1e-3) ang = Math.PI / 2;
    const cx = w / 2, cy = h / 2, rx = w / 2 - mx - 14, ry = (h - myT - myB) / 2 - 14;
    const cyy = myT + (h - myT - myB) / 2;
    const c = Math.cos(ang), s = Math.sin(ang), k = Math.min(Math.abs(rx / (c || 1e-6)), Math.abs(ry / (s || 1e-6)));
    m.x = cx + c * k; m.y = cyy + s * k; m.edge = true; m.angle = ang;
  }
  m.icon = icon; m.color = color; m.label = label === undefined ? Math.round(dist) + ' m' : label;
  _mk.push(m);
}
function markers() {
  const W = ctx.W, s = G.sec; _mk.length = 0;
  if (G.state !== 'play') { ui.markers(_mk); return; }
  if (G.sectorIdx === 0) {
    for (const f of W.freighters) if (f.alive && f.warp === 0) pushMarker(f.pos, '▣', f.hp / f.max < 0.4 ? '#ff6a6a' : '#7dffb0', true, `${f.name} ${Math.round(f.hp / f.max * 100)}%`);
    if (s.progress > 0.75) pushMarker(W.gate.pos, '◯', '#6fd8ff', true, 'PORTAL');
  }
  if (G.sectorIdx === 1) {
    W.transmitters.forEach((t, i) => { if (t.alive) pushMarker(t.pos, '✖', t.shielded ? '#7fb8ff' : '#ff5a6a', true, t.shielded ? `T${i + 1} · escudo` : `T${i + 1} · ¡vulnerable!`); });
    for (const f of W.stranded) if (f.alive && !f.saved && f.spawned) pushMarker(f.pos, '▣', '#ffcf5a', true, `${f.name} ${Math.round(f.hp / f.max * 100)}%`);
  }
  if (G.sectorIdx === 2) {
    if (s.escort && W.esperanza.alive) { pushMarker(W.esperanza.pos, '▣', '#7dffb0', true, `ESPERANZA ${Math.round(W.esperanza.hp / W.esperanza.max * 100)}%`); pushMarker(W.gate.pos, '◯', '#ff7ae0', true, 'PORTAL'); }
    if (s.bossOn && boss.phase >= 1 && boss.phase < 4) for (const p of boss.weakPoints(_wp)) pushMarker(p, '◆', '#ff4a5a', true, '');
  }
  for (const b of W.beacons) if (!b.scanned) pushMarker(b.pos, '◎', '#ffb13b', G.sectorIdx === 1, undefined);
  for (const t of W.turrets) if (!t.active) pushMarker(t.ringPos, '⊕', '#6ab8ff', false, undefined);
  for (const d of W.docks) if (!d.used) pushMarker(d.pos, '✚', '#5bff9a', P.hull < 50, undefined);
  for (const c of W.capsules) if (!c.taken && (c.revealed || c.pos.distanceTo(P.pos) < 110)) pushMarker(c.pos, '✦', '#ffb13b', false, undefined);
  ui.markers(_mk);
}
function drawRadar() {
  const c = ui.rctx, W = ctx.W, S2 = 208, R = S2 / 2, range = 320;
  c.clearRect(0, 0, S2, S2);
  c.strokeStyle = 'rgba(255,177,59,.25)'; c.lineWidth = 2;
  c.beginPath(); c.arc(R, R, R * 0.5, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(R, 6); c.lineTo(R, S2 - 6); c.moveTo(6, R); c.lineTo(S2 - 6, R); c.stroke();
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw);
  const dot = (/** @type {THREE.Vector3} */ p, /** @type {string} */ col, /** @type {number} */ size, square = false) => {
    const dx = p.x - P.pos.x, dz = p.z - P.pos.z;
    // rotar para que "adelante" sea arriba (derecha de la nave = -X local)
    let x = -(dx * cy - dz * sy), y = -(dx * sy + dz * cy);
    let d = Math.hypot(x, y) / range * (R - 8);
    const a = Math.atan2(y, x); if (d > R - 8) d = R - 8;
    const px = R + Math.cos(a) * d, py = R + Math.sin(a) * d;
    const dy = p.y - P.pos.y;
    c.fillStyle = col; c.globalAlpha = Math.abs(dy) > 40 ? 0.55 : 1;
    if (square) c.fillRect(px - size, py - size, size * 2, size * 2); else { c.beginPath(); c.arc(px, py, size, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
  };
  for (const b of W.beacons) if (!b.scanned) dot(b.pos, '#ffb13b', 5, true);
  for (const cp of W.capsules) if (!cp.taken && cp.revealed) dot(cp.pos, '#ffd27a', 4);
  for (const d of W.docks) if (!d.used) dot(d.pos, '#5bff9a', 5, true);
  for (const f of W.freighters) if (f.alive) dot(f.pos, '#7dffb0', 6, true);
  for (const f of W.stranded) if (f.alive && !f.saved) dot(f.pos, '#ffcf5a', 6, true);
  if (W.esperanza && W.esperanza.alive) dot(W.esperanza.pos, '#7dffb0', 6, true);
  for (const t of W.transmitters) if (t.alive) dot(t.pos, t.shielded ? '#7fb8ff' : '#ff5a6a', 6, true);
  for (const e of enemies.all) if (e.alive) dot(e.pos, e.type === 'frigate' ? '#ff9ad0' : '#ff4a4a', e.type === 'frigate' || e.type === 'bomber' ? 6 : 4);
  if (boss.phase >= 1 && boss.phase < 5) dot(boss.pos, '#ff2040', 12);
  // jugador
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(R, R - 10); c.lineTo(R - 7, R + 8); c.lineTo(R + 7, R + 8); c.closePath(); c.fill();
}

/* ======================= arranque ======================= */
G.menuSector = clamp(S.lastSector, 0, S.unlocked - 1);
loadSector(G.menuSector);
showMenu();
game.start();
A && A.refresh && A.refresh();
addEventListener('pagehide', () => { try { if (MM.state().running) MM.runEnd({ won: false }); } catch (e) { /* nada */ } });
addEventListener('pagehide', () => { try { ctx.W && ctx.W.dispose(); enemies.dispose(); boss.dispose(); releaseDotTexture(); } catch (e) { /* nada */ } }, { once: true });

/* ======================= ganchos de prueba ======================= */
const hook = {
  get state() { return G.state; },
  get scene() { return ctx.W ? SECTORS[ctx.W.idx].id : ''; },
  get sector() { return G.sectorIdx; },
  get score() { return G.score; },
  get kills() { return G.kills; },
  get hp() { return { shield: Math.round(P.shield * 10) / 10, hull: Math.round(P.hull * 10) / 10 }; },
  get player() { return { x: P.pos.x, y: P.pos.y, z: P.pos.z, yaw: P.yaw, pitch: P.pitch, speed: P.speed, boost: P.boost, energy: P.energy, pulseLv: P.pulseLv, laserLv: P.laserLv, alive: P.alive, docking: !!P.docking, laserOn: P.laserOn }; },
  get missions() { return MM.state(); },
  get campaign() { return JSON.parse(JSON.stringify(S)); },
  get difficulty() { return { id: G.diffId, ...G.diff }; },
  get quality() { return game.quality; },
  get perf() { return { ...game.perf, frames: game.frames, heapMB: /** @type {any} */ (performance).memory ? Math.round(/** @type {any} */ (performance).memory.usedJSHeapSize / 1048576 * 10) / 10 : null }; },
  get counts() {
    const W = ctx.W;
    return { enemies: enemies.count(), interceptor: enemies.count('interceptor'), drone: enemies.count('drone'), bomber: enemies.count('bomber'), frigate: enemies.count('frigate'),
      pbolts: fx.pbolts.count(), ebolts: fx.ebolts.count(), mines: fx.mines.count(), torps: fx.torps.count(), particles: fx.parts.alive,
      asteroids: W ? W.asteroidCount : 0, covers: W ? W.coverCount : 0, stars: QUALITY[game.quality].stars };
  },
  get sec() { const s = G.sec; return { t: s.t, progress: s.progress, lost: s.lost || 0, bossOn: !!s.bossOn, escort: !!s.escort, shieldBroken: !!s.shieldBroken, started: !!s.started }; },
  get world() {
    const W = ctx.W; if (!W) return null;
    return {
      beacons: W.beacons.map(b => ({ scanned: b.scanned, progress: b.progress, x: b.pos.x, y: b.pos.y, z: b.pos.z })),
      turrets: W.turrets.map(t => ({ active: t.active, boot: t.boot, x: t.ringPos.x, y: t.ringPos.y, z: t.ringPos.z })),
      docks: W.docks.map(d => ({ used: d.used, x: d.pos.x, y: d.pos.y, z: d.pos.z })),
      capsules: W.capsules.map(c => ({ taken: c.taken, x: c.pos.x, y: c.pos.y, z: c.pos.z })),
      transmitters: W.transmitters.map(t => ({ alive: t.alive, shielded: t.shielded, hp: t.hp })),
      freighters: W.freighters.map(f => ({ alive: f.alive, hp: f.hp, max: f.max })),
      stranded: W.stranded.map(f => ({ alive: f.alive, saved: f.saved, spawned: f.spawned, hp: f.hp })),
      esperanza: W.esperanza ? { alive: W.esperanza.alive, hp: W.esperanza.hp, moving: W.esperanza.moving } : null,
    };
  },
  get boss() { return { phase: boss.phase, bar: boss.bar(), turrets: boss.turrets.filter(t => t.alive).length, emitters: boss.emitters.filter(e => e.alive).length, reactor: boss.reactor.hp, open: boss.reactor.open, emittersOpen: boss.emittersOpen, beam: boss.beam.state, pulse: boss.pulse.state }; },
  get tutorial() { return { on: G.tut.on, step: G.tut.step }; },
  get target() { return G.target ? { type: G.target.type || 'boss', leadValid: G.leadValid, leadOk: G.leadOk } : null; },
  get paused() { return game.paused; },
  get settings() { return { ...S.settings }; },
  get session() { return JSON.parse(JSON.stringify(G.session)); },
};
if (DEBUG) {
  Object.assign(hook, {
    debug: {
      simulate: (/** @type {number} */ s) => game.simulate(s),
      /** Ir a un sector (empieza partida si hace falta). */
      goto(/** @type {number} */ i) { if (G.state === 'menu' || !G.session) { S.unlocked = Math.max(S.unlocked, i + 1); startRun(i); } else beginSector(i); G.state = 'play'; G.stateT = 0; },
      play() { G.state = 'play'; G.stateT = 0; },
      skipTutorial() { endTutorial(true); },
      /** Coloca la nave a `dist` del punto mirando hacia él. */
      face(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, dist = 40) {
        _a.set(x, y, z); _b.subVectors(_a, P.pos).normalize(); if (!isFinite(_b.x)) _b.set(0, 0, 1);
        P.pos.copy(_a).addScaledVector(_b, -dist);
        P.yaw = Math.atan2(_b.x, _b.z); P.pitch = Math.asin(clamp(_b.y, -1, 1)); P.yawRate = P.pitchRate = 0; updatePlayerBasis();
        P.vel.set(0, 0, 0); P.speed = 0; snapCamera();
      },
      teleport(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) { P.pos.set(x, y, z); P.vel.set(0, 0, 0); snapCamera(); },
      spawn(/** @type {string} */ type, dist = 60) { _a.copy(P.pos).addScaledVector(P.fwd, dist); const e = enemies.spawn(type, _a); if (e) { e.cd = 99; e.cd2 = 99; } return !!e; },
      spawnAt(/** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) { const e = enemies.spawn(type, _a.set(x, y, z)); if (e) { e.cd = 99; e.cd2 = 99; } return !!e; },
      /** Impacto directo al punto débil actual, sin forzar su apertura (devuelve 'hit' | 'block' | null). */
      bossHit(/** @type {number} */ n) { const w = boss.weakPoints(_wp)[0]; return w ? boss.hit(w, n) : null; },
      killAll() { for (const e of enemies.all) if (e.alive) enemies.kill(e, 'debug'); },
      clearEnemies() { for (const e of enemies.all) e.alive = false; for (const k of ['ebolts', 'torps', 'mines']) /** @type {any} */ (fx)[k].clear(); },
      setHp(/** @type {number} */ shield, /** @type {number} */ hull) { P.shield = shield; P.hull = hull; },
      damage(/** @type {number} */ n) { damagePlayer(n, null, 'debug'); },
      invulnerable(/** @type {boolean} */ v) { P.invuln = v ? 1e9 : 0; },
      convoyProgress(/** @type {number} */ p) { G.sec.started = true; G.sec.progress = p; G.sec.wave = WAVES[0].filter(w => w.at <= p).length; },
      killFreighter(/** @type {number} */ i) { const f = ctx.W.freighters[i]; if (f) damageAlly(f, 1e6, 'debug'); },
      killEsperanza() { const f = ctx.W.esperanza; if (f) damageAlly(f, 1e6, 'debug'); },
      destroyTransmitter(/** @type {number} */ i) { const t = ctx.W.transmitters[i]; if (t) { t.shielded = false; damageTransmitter(t, 1e6, t.pos); } },
      spawnBoss() { if (G.sectorIdx !== 2) this.goto(2); G.sec.t = 27; G.sec.alarm = true; startBoss(); },
      bossPhase(/** @type {number} */ n) { boss.forcePhase(n); },
      bossDamage(/** @type {number} */ n) { if (boss.phase === 1) { const t = boss.turrets.find(x => x.alive); if (t) boss.hit(t.world, n); } else if (boss.phase === 2) { boss.emitterCycle = 0; boss.emittersOpen = true; const e = boss.emitters.find(x => x.alive); if (e) boss.hit(e.world, n); } else if (boss.phase === 3) { boss.reactor.open = 1; boss.hit(boss.reactor.world, n); } },
      escortArrive() { const E = ctx.W.esperanza; E.pos.copy(ctx.W.gate.pos).add(_a.set(5, 0, 0)); },
      setUpgrades(/** @type {number} */ p, /** @type {number} */ l) { P.pulseLv = clamp(p, 1, 3); P.laserLv = clamp(l, 1, 3); },
      lose() { killPlayer(); },
      three: { scene, camera, THREE },
      bossPos() { if (boss.phase < 1 || boss.phase >= 4) return null; const w = boss.weakPoints(_wp)[0]; return w ? { x: w.x, y: w.y, z: w.z } : null; },
      lead() { return G.target && G.leadValid ? { x: G.lead.x, y: G.lead.y, z: G.lead.z } : null; },
      enemies() { return enemies.all.filter(e => e.alive).map(e => ({ type: e.type, x: e.pos.x, y: e.pos.y, z: e.pos.z, hp: e.hp })); },
    },
  });
}
Object.defineProperty(window, '__' + ID, { value: Object.freeze(hook), configurable: false, writable: false });
