// @ts-check
/* ARENA MUTANTE — supervivencia 3D en tercera persona de MiniArcade (MateLabs).
   Bucle: explorar la arena, disparar con cámara al hombro, rodar para esquivar ataques telegrafiados,
   juntar chatarra (barricadas y mejoras), usar puertas con energía, cajas, generadores y trampas,
   y cumplir el objetivo de cada arena: generadores (búnker) → seis oleadas (estación) → extracción (laboratorio). */
import * as THREE from 'three';
import { createGame, createInput, createSave, clamp } from '../../matelabs/kit3d.js';
import { ID, TITLE, ACCENT, SAVE_KEY, SAVE_VERSION, DIFFICULTY, QUALITY, MISSIONS, PLAYER, WEAPON, UPGRADES, ENEMY, ARENAS, STATION_WAVES, THREAT, CELL } from './config.js';
import * as M from './models.js';
import { createMaterials, buildArena } from './world.js';
import { createParticles, createTelegraphs, createTracers, createPool } from './fx.js';
import { createEnemies, lerpAngle } from './enemies.js';
import { createBoss } from './boss.js';
import { createUI, diffText } from './ui.js';
import { createSfx } from './sfx.js';

const A = /** @type {any} */ (window).MLArcade;
const MM = /** @type {any} */ (window).MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouchDevice = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/* ======================= guardado ======================= */
const DEFAULTS = {
  unlocked: 1, best: 0, campaign: { generadores: false, oleadas: false, extraccion: false }, trophy: false, victories: 0, runs: 0, kills: 0, lastArena: 0,
  settings: { sens: 1, invertY: false, autoAim: isTouchDevice ? 'fuerte' : 'off', autoFire: isTouchDevice, calm: false, tutorialDone: false },
};
const save = createSave(SAVE_KEY, SAVE_VERSION, DEFAULTS, (old, v) => {
  // v1 (prototipo): { arena, best, tutorial }
  const o = old && typeof old === 'object' ? old : {};
  return { unlocked: Number(o.arena) || 1, best: Number(o.best) || 0, settings: { ...DEFAULTS.settings, tutorialDone: !!o.tutorial } };
});
/** Valida tipos y rangos: un guardado con forma rara nunca rompe el juego. */
function sanitize() {
  const d = /** @type {any} */ (save.get()), D = /** @type {any} */ (DEFAULTS);
  for (const k of Object.keys(d)) if (!(k in D)) delete d[k];
  const num = (v, def, lo, hi) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : def);
  d.unlocked = Math.round(num(d.unlocked, 1, 1, 3)); d.best = Math.round(num(d.best, 0, 0, 1e9));
  d.victories = num(d.victories, 0, 0, 1e6); d.runs = num(d.runs, 0, 0, 1e9); d.kills = num(d.kills, 0, 0, 1e9);
  d.lastArena = Math.round(num(d.lastArena, 0, 0, 2)); d.trophy = d.trophy === true;
  const c = d.campaign && typeof d.campaign === 'object' ? d.campaign : {};
  d.campaign = { generadores: c.generadores === true, oleadas: c.oleadas === true, extraccion: c.extraccion === true };
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  d.settings = { sens: num(s.sens, 1, 0.4, 2), invertY: s.invertY === true, autoAim: ['off', 'suave', 'fuerte'].includes(s.autoAim) ? s.autoAim : D.settings.autoAim,
    autoFire: typeof s.autoFire === 'boolean' ? s.autoFire : D.settings.autoFire, calm: s.calm === true, tutorialDone: s.tutorialDone === true };
  if (d.campaign.oleadas) d.unlocked = Math.max(d.unlocked, 3); else if (d.campaign.generadores) d.unlocked = Math.max(d.unlocked, 2);
  save.flush();
}
sanitize();
const S = /** @type {typeof DEFAULTS} */ (save.get());

/* ======================= estado ======================= */
const V = () => new THREE.Vector3();
const G = {
  state: 'menu', arenaIdx: 0, runStartArena: 0, menuArena: 0, score: 0, kills: 0, runTime: 0, realT: 0, streak: 0, bestStreak: 0,
  diffId: 'normal', diff: DIFFICULTY.normal, stateT: 0, endReason: '', shake: 0, scrap: 0,
  up: { dmg: 0, mag: 0, pulse: 0, armor: 0 },
  session: /** @type {any} */ (null), checkpoint: /** @type {any} */ (null),
  sec: /** @type {any} */ ({}),
  tut: { on: false, step: 0, t: 0, acc: 0, forced: false },
  hints: /** @type {Record<string, number>} */ ({}), seen: /** @type {Record<string, boolean>} */ ({}),
  queue: /** @type {string[]} */ ([]), qTimer: 0, qGap: 1.2, pending: /** @type {any[]} */ ([]), relief: 0, stress: 0, escape: /** @type {any} */ (null), escapeT: 0,
  cineT: 0, heartT: 0, lowT: 0,
};
const P = {
  pos: V(), vel: V(), knock: V(), yaw: Math.PI, pitch: 0.05, hp: 100, maxHp: 100, alive: true, invuln: 0,
  rollT: 0, rollDir: V(), rolls: 2, rollRecharge: 0, ammo: 24, reloadT: 0, fireCd: 0, pulseCd: 0, regenT: 0,
  zoom: false, firing: false, moveAmt: 0, phase: 0, hold: 0, holdTarget: /** @type {any} */ (null), antidote: false, recoil: 0, flash: 0,
  shots: 0, lookAcc: 0,
};

/* ======================= motor ======================= */
let input = /** @type {ReturnType<typeof createInput>} */ (/** @type {any} */ (null));
const game = createGame({
  id: ID, title: TITLE, accent: ACCENT, toolbar: 'tr', background: 0x120b07, fov: 62, far: 160,
  help: [
    'Objetivo: búnker (3 generadores) → estación (6 oleadas) → laboratorio (extracción y Coloso Radiactivo).',
    'PC: WASD mover · mouse apuntar (clic captura el cursor) o flechas · clic/J disparar · clic der./K mira · Espacio rodar · E usar · Q pulso · F barricada · R recargar.',
    'Táctil: stick izq. mover · stick der. apuntar · FUEGO (o disparo automático) · RODAR · USAR · PULSO · BARR.',
    'Gamepad: stick izq. mover · stick der. cámara · RT disparar · LT mira · A rodar · X usar · LB pulso · Y barricada · B recargar.',
    'Todos los ataques avisan: rojo = salto del corredor o embestida del bruto, verde = ácido del escupidor, siseo = acechador.',
    'Rodar te hace invulnerable un instante. El bruto tiene blindaje adelante: rodealo o hacelo chocar contra una pared.',
    'Chatarra 🔩: barricadas (F) y módulos de arma en el banco de trabajo 🔧. Las puertas con energía se abren y cierran con E.',
  ],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'Space', x: 'KeyE', y: 'KeyF', b: 'KeyR', lb: 'KeyQ', rb: 'KeyJ', rt: 'KeyJ', lt: 'KeyK' },
  isActive: () => ['play', 'cine', 'dying', 'craft'].includes(G.state),
  update, render, onRestart, onQuality,
  actions: [{ label: '🎓 Ver tutorial', fn: () => startTutorial(true) }],
});
const { scene, camera, renderer } = game;
renderer.toneMappingExposure = 1.25;
const reduced = () => prefersReduced || S.settings.calm;
const root = new THREE.Group(); root.name = 'dinamico'; scene.add(root);
scene.fog = new THREE.Fog(0x1c120b, 18, 70);
input = createInput(game.root, { joystick: 'left', buttons: [
  { id: 'fire', label: 'FUEGO', key: 'KeyJ' }, { id: 'roll', label: 'RODAR', key: 'Space' }, { id: 'use', label: 'USAR', key: 'KeyE' },
  { id: 'pulse', label: 'PULSO', key: 'KeyQ' }, { id: 'barr', label: 'BARR.', key: 'KeyF' }] });
input.showTouch(false);

const mats = createMaterials();
const ctx = /** @type {any} */ ({
  THREE, scene, root, camera, mats, quality: game.quality, player: P, diff: G.diff, W: null, fx: null, flow: { player: null, beacon: null },
  survivor: null, beacon: null, enemies: null,
  get reduced() { return reduced(); },
});
const sfx = createSfx(game.audio, () => P.pos);
ctx.sfx = sfx;

/* ---------- jugador ---------- */
const hm = M.buildHuman({ suit: 0x4a5a3a, vest: 0xc86a2a, helmet: 0x3a4a2a, visor: 0xa6ff2e });
const pg = new THREE.Group(); pg.name = 'sobreviviente';
const pBody = new THREE.Group();
const pTorso = new THREE.Mesh(hm.body, mats.vc); pTorso.castShadow = true;
const mkLeg = (/** @type {number} */ x) => { const g = new THREE.Group(); g.position.set(x, hm.legPivot[1], 0); const m = new THREE.Mesh(hm.leg, mats.vc); m.castShadow = true; g.add(m); return g; };
const pLegL = mkLeg(hm.legPivot[0]), pLegR = mkLeg(-hm.legPivot[0]);
const pGun = new THREE.Group(); pGun.position.fromArray(hm.gunPivot);
const pGunM = new THREE.Mesh(hm.gun, mats.vc); pGunM.castShadow = true; pGun.add(pGunM);
const flashMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const flashGeo = new THREE.IcosahedronGeometry(0.16, 0);
const muzzleFlash = new THREE.Mesh(flashGeo, flashMat); muzzleFlash.position.copy(hm.muzzle); muzzleFlash.scale.set(1, 1, 2.2); pGun.add(muzzleFlash);
pBody.add(pTorso, pLegL, pLegR, pGun);
pg.add(pBody);
const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
shadowBlob.position.y = 0.02; pg.add(shadowBlob);
root.add(pg);

/* ---------- superviviente (NPC) ---------- */
const sm = M.buildHuman({ suit: 0x7a8aa0, vest: 0xd8d8d8, helmet: 0xd9a020, visor: 0x38c8ff, skin: 0xb07a5a });
const sg = new THREE.Group(); sg.name = 'superviviente'; sg.visible = false;
const sBody = new THREE.Mesh(sm.body, mats.vc); sBody.castShadow = true;
const sLegL = new THREE.Group(), sLegR = new THREE.Group();
sLegL.position.set(sm.legPivot[0], sm.legPivot[1], 0); sLegR.position.set(-sm.legPivot[0], sm.legPivot[1], 0);
sLegL.add(new THREE.Mesh(sm.leg, mats.vc)); sLegR.add(new THREE.Mesh(sm.leg, mats.vc));
const sGun = new THREE.Group(); sGun.position.fromArray(sm.gunPivot); sGun.add(new THREE.Mesh(sm.gun, mats.vc));
sg.add(sBody, sLegL, sLegR, sGun); root.add(sg);
const SV = { pos: V(), alive: false, freed: false, following: false, hp: 80, max: 80, cd: 0, yaw: 0, phase: 0, saved: false, present: false };
ctx.survivor = SV;

/* ---------- transporte, baliza y pulso ---------- */
const transport = new THREE.Mesh(M.buildTransport(), mats.vc); transport.visible = false; transport.castShadow = true; root.add(transport);
const BC = { pos: V(), hp: 0, max: 400, active: false };
ctx.beacon = BC;
const barrGeo = M.buildBarricade();
const scrapGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
const scrapMat = new THREE.MeshStandardMaterial({ color: 0xd9a020, emissive: 0x6a4a00, metalness: 0.6, roughness: 0.4 });

/* ---------- efectos ---------- */
const fx = {
  sparks: /** @type {any} */ (null), gore: /** @type {any} */ (null),
  tele: createTelegraphs(root), tracers: /** @type {any} */ (null),
  scrap: createPool(root, { count: 48, geometry: scrapGeo, material: scrapMat, name: 'chatarra' }),
};
ctx.fx = fx;
function makeFx() {
  if (fx.sparks) fx.sparks.dispose(); if (fx.gore) fx.gore.dispose(); if (fx.tracers) fx.tracers.dispose();
  const q = QUALITY[game.quality] || QUALITY.medium;
  fx.sparks = createParticles(root, q.particles, true);
  fx.gore = createParticles(root, Math.round(q.particles * 0.6), false);
  fx.tracers = createTracers(root, q.tracers);
}
makeFx();
/** @type {{i:number, pos:THREE.Vector3, vel:THREE.Vector3, v:number, t:number, kind:string}[]} */
const pickups = [];

const enemies = createEnemies(ctx); ctx.enemies = enemies;
const boss = createBoss(ctx);
const flowP = new Float32Array(32 * 32), flowB = new Float32Array(32 * 32);
let flowT = 0;

/* ======================= UI ======================= */
const ui = createUI({ isTouch: input.isTouch, onSkipTutorial: () => endTutorial(true) });
MM.setup({ gameId: ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 5, hud: 'none' });
MM.on(/** @param {any} ev */ ev => {
  if (ev.type === 'complete') {
    sfx.mission();
    const id = ev.mission.id;
    if (id === 'generadores' || id === 'oleadas' || id === 'extraccion') { /** @type {any} */ (S.campaign)[id] = true; save.flush(); }
  }
});
const SHORT = { generadores: 'Generadores', oleadas: 'Oleadas', extraccion: 'Extracción' };

/* ======================= hooks del mundo (callbacks de enemigos/jefe) ======================= */
ctx.hooks = {
  hurtPlayer, hurtSurvivor, hurtBeacon,
  onKill(e, cause) {
    G.kills++; G.session.kills++;
    const st = /** @type {any} */ (ENEMY)[e.type];
    const bonus = cause === 'trap' ? 1.25 : 1;
    G.score += Math.round(st.score * G.diff.score * bonus);
    G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak);
    MM.emit('cleanStreak', G.streak);
    MM.emit('kill');
    dropScrap(e.pos, Math.max(1, Math.round(st.scrap * G.diff.scrap * (0.7 + Math.random() * 0.6))));
    if (Math.random() < 0.06) dropPickup(e.pos, 'med');
    sfx.kill();
    if (G.sec && G.sec.onKill) G.sec.onKill(e);
  },
  bashDoor(d, dmg, e) {
    d.hp -= dmg * G.diff.enemyDmg; d.bash = 0.25;
    sfx.bash(d.center); fx.sparks.burst(d.center.x, 1.5, d.center.z, 6, 0xffd08a, 4, 0.4, 6, 0.3);
    if (d.hp <= 0 && d.state === 'closed') {
      ctx.W.setDoorState(d, 'broken'); persistDoor(d);
      sfx.door(d.center); hint('door-broken', '¡Rompieron la puerta! Ya no se puede cerrar.', 6);
    }
  },
  breakBarricade(b, dmg) {
    if (!b.alive) return;
    b.hp -= dmg; b.hitT = 0.15;
    fx.gore.burst(b.pos.x, 0.8, b.pos.z, 5, 0x8a7a50, 3, 0.5, 12, 0.4);
    sfx.bash(b.pos);
    if (b.hp <= 0) destroyBarricade(b);
  },
  bruteStunned() { hint('brute-stun', '¡El bruto chocó! Disparale al tumor de la espalda (×1,6).', 20); },
  shake(k, from) { if (reduced()) return; const d = from ? Math.hypot(from.x - P.pos.x, from.z - P.pos.z) : 0; G.shake = Math.max(G.shake, k * Math.max(0.2, 1 - d / 30)); },
  coverDestroyed(c) { G.session.coversLost = (G.session.coversLost || 0) + 1; fx.gore.burst(c.pos.x, 0.7, c.pos.z, 16, 0x8a8a8a, 6, 0.8, 14, 0.5); },
  summon(n) { for (let i = 0; i < n; i++) G.queue.push('runner'); G.qGap = 0.4; hint('summon', 'El Coloso llama corredores desde la pileta.', 30); },
  tideWarn() { hint('tide', '⚠ Marea tóxica: salí del cuadrante amarillo antes de que se vuelva verde.', 15); },
  bossIntroDone() {
    G.state = 'play'; G.stateT = 0; ui.showHud(true); input.showTouch(true); ui.showRStick(true);
    G.sec.stage = 'boss';
    hint('boss1', 'Fase 1: los 3 tanques verdes son su punto débil. Rodá para esquivar el pisotón.', 0);
  },
  bossPhase(n) {
    if (n === 2) { ui.banner('FASE 2', 'MAREA TÓXICA', 'El núcleo del pecho quedó expuesto', 2600, true); sfx.roar(boss.B.pos, true); }
    if (n === 3) { ui.banner('FASE 3', 'FURIA RADIACTIVA', 'Salta sobre vos: mirá la sombra roja', 2600, true); sfx.roar(boss.B.pos, true); }
    G.score += Math.round(800 * G.diff.score);
  },
  bossDefeated,
};

/* ======================= sesión y partida ======================= */
function newSession() {
  return { arenas: ARENAS.map(() => ({ gens: [], doors: {}, crates: [], traps: [], grate: false, antidote: false })), kills: 0, survivor: '', coversLost: 0,
    gens: 0, waves: 0, traps: 0, barricades: 0 };
}
function loadArena(idx) {
  if (ctx.W) ctx.W.dispose();
  enemies.clear(); boss.reset();
  for (const b of barricades) { root.remove(b.mesh); } barricades.length = 0;
  fx.tele.clear(); fx.tracers.clear(); fx.sparks.clear(); fx.gore.clear();
  for (const p of pickups) fx.scrap.free(p.i); pickups.length = 0;
  G.queue.length = 0; G.pending.length = 0;
  ctx.quality = game.quality;
  const q = QUALITY[game.quality] || QUALITY.medium;
  ctx.W = buildArena(ctx, idx);
  const W = ctx.W, pal = W.def.palette;
  W.barricades = barricades;
  scene.background = new THREE.Color(pal.sky);
  scene.fog = new THREE.Fog(pal.fog, q.fogFar * 0.3, q.fogFar);
  camera.far = q.far; camera.updateProjectionMatrix();
  P.pos.copy(W.playerStart); P.vel.set(0, 0, 0); P.knock.set(0, 0, 0);
  P.yaw = idx === 2 ? Math.PI : Math.PI; P.pitch = 0.05;
  SV.present = !!W.survivorPos; sg.visible = false;
  transport.visible = false; BC.active = false;
  if (W.pad) BC.pos.copy(W.pad.beaconPos);
  flowT = 0;
}
function applySession(idx) {
  const W = ctx.W, st = G.session.arenas[idx];
  W.gens.forEach((g, i) => { if (st.gens[i]) { g.restored = true; g.progress = 1; g.lightMat.color.setHex(0x3aff6a); } });
  W.crates.forEach((c, i) => { if (st.crates[i]) { c.opened = true; c.t = 1; } });
  W.traps.forEach((t, i) => { t.uses = st.traps[i] || 0; });
  if (st.grate) W.breakGrate();
  if (W.antidote && st.antidote) { W.antidote.taken = true; W.antidote.mesh.visible = false; W.antidote.glow.visible = false; }
  updatePower(true);
  for (const d of W.doors) { const s = st.doors[d.id]; if (s && s !== 'locked' && d.state !== 'locked') { W.setDoorState(d, s); d.open = s === 'open' || s === 'broken' ? 1 : 0; } }
  // superviviente
  if (W.survivorPos) {
    SV.pos.copy(W.survivorPos); SV.hp = SV.max; SV.alive = G.session.survivor !== 'dead'; SV.freed = false; SV.following = false; SV.saved = G.session.survivor === 'saved';
    sg.visible = SV.alive && !SV.saved;
  } else { SV.alive = false; SV.following = false; sg.visible = false; }
}
function persistDoor(d) { if (G.session) G.session.arenas[G.arenaIdx].doors[d.id] = d.state; }

function startRun(arenaIdx) {
  if (arenaIdx + 1 > S.unlocked) return;
  G.diffId = MM.difficulty(); G.diff = /** @type {any} */ (DIFFICULTY)[G.diffId] || DIFFICULTY.normal; ctx.diff = G.diff;
  G.runStartArena = arenaIdx; G.session = newSession();
  G.score = 0; G.kills = 0; G.runTime = 0; G.streak = 0; G.bestStreak = 0;
  G.up = { dmg: arenaIdx >= 1 ? 1 : 0, mag: arenaIdx >= 2 ? 1 : 0, pulse: 0, armor: arenaIdx >= 2 ? 1 : 0 };
  G.scrap = arenaIdx * 5;
  G.hints = {}; G.seen = {};
  S.runs++; S.lastArena = arenaIdx; save.flush();
  if (MM.state().running) MM.runEnd({ won: false });
  MM.runStart();
  A && A.started();
  ui.menu.hide(); ui.end.hide(); ui.clear.hide(); ui.opts.hide(); ui.craft.hide();
  beginArena(arenaIdx);
}
function beginArena(idx, retry = false) {
  G.arenaIdx = idx;
  G.checkpoint = { score: G.score, kills: G.kills, scrap: G.scrap, up: { ...G.up }, runTime: G.runTime };
  loadArena(idx);
  applySession(idx);
  P.maxHp = PLAYER.hp + G.up.armor * 25; P.hp = P.maxHp; P.alive = true; P.invuln = 1.2; P.rollT = 0; P.rolls = PLAYER.roll.charges; P.reloadT = 0;
  P.ammo = WEAPON.mag[G.up.mag]; P.fireCd = 0; P.pulseCd = 0; P.regenT = 0; P.hold = 0; P.holdTarget = null; P.firing = false; P.zoom = false;
  G.shake = 0; G.relief = 0; G.stress = 0; G.escape = null; G.queue.length = 0; G.pending.length = 0;
  G.sec = setupArena(idx, retry);
  G.state = 'play'; G.stateT = 0;
  ui.showHud(true); input.showTouch(true); ui.showRStick(true);
  const d = ARENAS[idx];
  ui.banner(`ARENA ${idx + 1} DE 3`, d.name.toUpperCase(), d.goal, 2600);
  sfx.wave();
  if (idx === 0 && (!S.settings.tutorialDone || G.tut.forced)) startTutorial(G.tut.forced);
  snapCamera();
  A && A.refresh && A.refresh();
}
function retryArena() {
  const c = G.checkpoint;
  G.score = c.score; G.kills = c.kills; G.scrap = c.scrap; G.up = { ...c.up }; G.runTime = c.runTime; G.streak = 0;
  ui.end.hide();
  if (MM.state().running) MM.runEnd({ won: false });
  MM.runStart();
  // la sesión continúa: se re-emite lo ya logrado para que las misiones de la partida lo cuenten
  const s = G.session;
  if (s.gens) MM.emit('generator', s.gens);
  if (s.waves) MM.emit('waveSurvived', s.waves);
  if (s.traps) MM.emit('trapOn', s.traps);
  if (s.barricades) MM.emit('barricade', s.barricades);
  if (s.arenas[2].antidote) MM.emit('antidote');
  if (s.survivor === 'saved') MM.emit('survivorSaved');
  if (s.survivor === 'dead') MM.emit('survivorDied');
  A && A.started();
  beginArena(G.arenaIdx, true);
}
function arenaComplete() {
  const s = G.sec;
  if (s.done) return; s.done = true;
  const bonus = Math.round((1500 + Math.max(0, 300 - s.t) * 4) * G.diff.score);
  G.score += bonus;
  S.unlocked = Math.max(S.unlocked, Math.min(3, G.arenaIdx + 2));
  save.flush();
  if (G.arenaIdx === 2) return victory();
  G.state = 'clear'; G.stateT = 0;
  input.showTouch(false); ui.showRStick(false); stopTutorialIfAny(); exitPointer();
  const texts = ['Los tres generadores rugen y el ascensor te lleva a la superficie. La estación eléctrica es la única salida…',
    'Seis oleadas después, la compuerta se abre hacia el laboratorio. Desde ahí se puede pedir extracción.'];
  ui.clear.show(ui.clearHTML({ n: G.arenaIdx + 1, title: ARENAS[G.arenaIdx].short, text: texts[G.arenaIdx], score: G.score, bonus, kills: G.kills, next: ARENAS[G.arenaIdx + 1].short }));
  sfx.mission();
  A && A.refresh && A.refresh();
}
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function victory() {
  G.state = 'victory'; G.stateT = 0;
  G.score += Math.round((5000 + P.hp * 20) * G.diff.score);
  const rec = G.score > S.best; if (rec) S.best = G.score;
  S.victories++; S.trophy = true; S.kills += G.kills; save.flush();
  MM.emit('extracted');
  MM.runEnd({ won: true });
  A && A.ended({ score: G.score });
  input.showTouch(false); ui.showRStick(false); ui.showHud(false); stopTutorialIfAny(); exitPointer();
  ui.end.show(ui.endHTML({ kicker: 'VICTORIA · EXTRACCIÓN COMPLETA', title: '¡ESCAPASTE!', text: 'El transporte despega con el núcleo del Coloso a bordo. Atrás queda la arena… y lo que todavía se mueve en ella.',
    score: G.score, kills: G.kills, time: fmtTime(G.runTime), record: rec,
    extra: '<div class="am-rec">🏆 TROFEO: NÚCLEO DEL COLOSO</div>',
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
  input.showTouch(false); ui.showRStick(false); ui.showHud(false); stopTutorialIfAny(); ui.vignette(0); ui.toxic(0); exitPointer();
  const titles = { hp: 'CAÍSTE', extraction: 'EXTRACCIÓN FALLIDA' };
  const texts = { hp: 'Los mutantes te superaron. Generadores, puertas abiertas y cajas usadas se conservan al reintentar.',
    extraction: G.sec.failWhy === 'beacon' ? 'Destruyeron la baliza de aterrizaje: el transporte no pudo encontrarte.' : 'El transporte despegó sin vos. Corré a la pista apenas aterrice.' };
  ui.end.show(ui.endHTML({ kicker: `DERROTA · ARENA ${G.arenaIdx + 1}`, title: /** @type {any} */ (titles)[reason], text: /** @type {any} */ (texts)[reason],
    score: G.score, kills: G.kills, time: fmtTime(G.runTime), record: rec,
    buttons: '<button class="k3-b" type="button" data-retry>↻ REINTENTAR ARENA</button><button class="k3-b alt" type="button" data-menu>MENÚ</button>' }));
  sfx.lose();
  A && A.refresh && A.refresh();
}
function toMenu() {
  if (MM.state().running) MM.runEnd({ won: false });
  if (G.state !== 'over' && G.state !== 'victory') A && A.ended({ score: G.score });
  G.state = 'menu'; G.stateT = 0;
  ui.end.hide(); ui.clear.hide(); ui.opts.hide(); ui.craft.hide(); ui.showHud(false); input.showTouch(false); ui.showRStick(false);
  stopTutorialIfAny(); ui.vignette(0); ui.toxic(0); ui.hideBanner(); exitPointer();
  loadArena(G.menuArena);
  showMenu();
  A && A.refresh && A.refresh();
}
function onRestart() {
  ui.end.hide(); ui.clear.hide(); ui.craft.hide();
  startRun(G.runStartArena);
}
function onQuality(q) {
  ctx.quality = q;
  const Q = QUALITY[q] || QUALITY.medium;
  if (scene.fog) { /** @type {THREE.Fog} */ (scene.fog).far = Q.fogFar; /** @type {THREE.Fog} */ (scene.fog).near = Q.fogFar * 0.3; }
  camera.far = Q.far; camera.updateProjectionMatrix();
  if (ctx.W) { ctx.W.sun.castShadow = Q.shadows; ctx.W.lights.forEach((/** @type {any} */ l, /** @type {number} */ i) => { l.visible = i < Q.lights; }); }
  makeFx();
  if (G.state === 'menu' && ctx.W) loadArena(G.menuArena);
}

/* ======================= menú, opciones y banco ======================= */
function showMenu() {
  const sel = clamp(G.menuArena, 0, S.unlocked - 1);
  G.menuArena = sel;
  ui.menu.show(ui.menuHTML(S, sel, MM.difficulty(), Math.max(S.best, A ? A.scores.best(ID) : 0)));
  const box = /** @type {HTMLElement} */ (ui.menu.el.querySelector('[data-diff]'));
  MM.difficultyPicker(box, { onChange: (/** @type {string} */ d) => { const t = ui.menu.el.querySelector('[data-dfx]'); if (t) t.textContent = diffText(d); sfx.click(); } });
}
ui.menu.on('[data-go]', () => startRun(G.menuArena));
ui.menu.el.addEventListener('click', e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-arena]');
  if (!b || /** @type {HTMLButtonElement} */ (b).disabled) return;
  const i = Number(/** @type {HTMLElement} */ (b).dataset.arena);
  if (i !== G.menuArena) { G.menuArena = i; loadArena(i); showMenu(); sfx.click(); }
});
ui.menu.on('[data-opts]', () => openOptions());
ui.menu.on('[data-tut]', () => { G.tut.forced = true; startRun(0); });
function openOptions() { ui.menu.hide(); ui.opts.show(ui.optionsHTML(S.settings, input.isTouch)); }
ui.opts.el.addEventListener('input', e => {
  const el = /** @type {HTMLInputElement} */ (e.target), k = el.dataset.o; if (!k) return;
  const st = /** @type {any} */ (S.settings);
  st[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : Number(el.value);
  save.flush();
});
ui.opts.el.addEventListener('change', e => {
  const el = /** @type {HTMLSelectElement} */ (e.target); if (el.tagName !== 'SELECT' || !el.dataset.o) return;
  /** @type {any} */ (S.settings)[el.dataset.o] = el.value; save.flush();
});
ui.opts.on('[data-back]', () => { ui.opts.hide(); if (G.state === 'menu') showMenu(); });
ui.end.on('[data-retry]', () => retryArena());
ui.end.on('[data-again]', () => startRun(0));
ui.end.on('[data-menu]', () => toMenu());
ui.clear.on('[data-next]', () => nextArena());
ui.clear.on('[data-menu]', () => toMenu());
function nextArena() { ui.clear.hide(); beginArena(G.arenaIdx + 1); }
function openCraft() {
  G.state = 'craft'; input.clear(); exitPointer();
  ui.craft.show(ui.craftHTML(G.up, G.scrap));
  hint('craft', 'Los módulos duran toda la partida.', 60);
}
function closeCraft() { if (G.state !== 'craft') return; ui.craft.hide(); G.state = 'play'; input.clear(); }
function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id); if (!u) return false;
  const lv = /** @type {any} */ (G.up)[id]; if (lv >= 3) return false;
  const cost = u.cost[lv]; if (G.scrap < cost) { sfx.empty(); return false; }
  G.scrap -= cost; /** @type {any} */ (G.up)[id] = lv + 1;
  if (id === 'armor') { P.maxHp = PLAYER.hp + G.up.armor * 25; P.hp = Math.min(P.maxHp, P.hp + 25); }
  if (id === 'mag') P.ammo = WEAPON.mag[G.up.mag];
  MM.emit('upgrade');
  sfx.build();
  if (G.state === 'craft') ui.craft.show(ui.craftHTML(G.up, G.scrap));
  return true;
}
ui.craft.el.addEventListener('click', e => {
  const b = /** @type {HTMLElement} */ (e.target).closest('[data-up]');
  if (b && !(/** @type {HTMLButtonElement} */ (b).disabled)) buyUpgrade(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.up));
});
ui.craft.on('[data-close]', () => closeCraft());
const craftKeys = (/** @type {KeyboardEvent} */ e) => {
  if (G.state !== 'craft' || e.repeat) return;
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0) { e.preventDefault(); buyUpgrade(UPGRADES[n].id); }
  else if (e.code === 'KeyE' || e.code === 'Enter' && document.activeElement === document.body) { e.preventDefault(); closeCraft(); }
};
ui.craft.el.addEventListener('keydown', craftKeys);
addEventListener('keydown', craftKeys);

addEventListener('keydown', e => {
  if (e.repeat) return;
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && document.activeElement === document.body) {
    if (G.state === 'menu' && ui.menu.visible) { e.preventDefault(); startRun(G.menuArena); }
    else if (G.state === 'over' && G.stateT > 0.6) { e.preventDefault(); retryArena(); }
    else if (G.state === 'clear' && G.stateT > 0.6) { e.preventDefault(); nextArena(); }
  }
  if (e.code === 'KeyH' && G.state === 'play') startTutorial(true);
  if (e.code === 'Tab' && G.state === 'play') e.preventDefault();
});

/* ---------- mouse / puntero ---------- */
const canvas = renderer.domElement;
let mouseFire = false, locked = false, dragId = -1, dragX = 0, dragY = 0;
const lookAcc = { x: 0, y: 0 };
function exitPointer() { if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { /* nada */ } mouseFire = false; mouseZoomHeld = false; P.zoom = false; }
document.addEventListener('pointerlockchange', () => {
  const was = locked; locked = document.pointerLockElement === canvas;
  if (was && !locked) { mouseFire = false; mouseZoomHeld = false; if (G.state === 'play' && A && !A.isPaused()) A.pause(); }
});
game.root.addEventListener('contextmenu', e => e.preventDefault());
game.root.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  if (e.pointerType === 'mouse') {
    if (!locked && canvas.requestPointerLock && !DEBUG) {
      try { const r = /** @type {any} */ (canvas.requestPointerLock()); if (r && r.catch) r.catch(() => {}); } catch (err) { /* sin bloqueo */ }
    }
    if (e.button === 0) mouseFire = true;
    dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY;
  } else {
    // toque sobre el escenario: arrastrar para girar la cámara
    if (dragId === -1) { dragId = e.pointerId; dragX = e.clientX; dragY = e.clientY; }
  }
});
addEventListener('pointerup', e => {
  if (e.pointerType === 'mouse' && e.button === 0) mouseFire = false;
  if (e.pointerId === dragId) dragId = -1;
});
addEventListener('pointermove', e => {
  if (G.state !== 'play') return;
  if (locked) { lookAcc.x += e.movementX; lookAcc.y += e.movementY; return; }
  if (e.pointerId === dragId) { lookAcc.x += e.clientX - dragX; lookAcc.y += e.clientY - dragY; dragX = e.clientX; dragY = e.clientY; }
});
addEventListener('blur', () => { mouseFire = false; mouseZoomHeld = false; dragId = -1; });

/* ======================= tutorial ======================= */
const TUT = [
  { k: 'move', pc: 'Mové al sobreviviente con WASD.', touch: 'Mové al sobreviviente con el stick izquierdo.' },
  { k: 'look', pc: 'Apuntá con el mouse (hacé clic para capturarlo) o con las flechas.', touch: 'Apuntá arrastrando el stick derecho (o la pantalla).' },
  { k: 'fire', pc: 'Disparo: clic izquierdo o J. Clic derecho (K) acerca la mira al hombro.', touch: 'Tocá FUEGO. Con «disparo automático» dispara solo al tener un mutante en la mira.' },
  { k: 'roll', pc: 'Espacio: rodar. Sos invulnerable un instante: usalo cuando un ataque se ponga rojo.', touch: 'RODAR: sos invulnerable un instante. Usalo cuando un ataque se ponga rojo.' },
  { k: 'use', pc: 'Andá al generador ⚡ y mantené E para restablecerlo. Los mutantes van a venir.', touch: 'Andá al generador ⚡ y mantené USAR para restablecerlo. Los mutantes van a venir.' },
];
function startTutorial(forced) {
  if (G.state !== 'play' || G.arenaIdx !== 0) { if (G.state === 'play') hint('tut-only', 'El tutorial se juega en el Búnker. Empezá una partida desde la arena 1.', 0); return; }
  G.tut.on = true; G.tut.step = 0; G.tut.t = 0; G.tut.acc = 0; G.tut.forced = !!forced;
  showTutStep();
}
function showTutStep() { const s = TUT[G.tut.step]; ui.tutorial(true, G.tut.step + 1, TUT.length, input.isTouch ? s.touch : s.pc); }
function tutAdvance() {
  G.tut.step++; G.tut.t = 0; G.tut.acc = 0;
  sfx.pickup();
  if (G.tut.step >= TUT.length) endTutorial(false); else showTutStep();
}
function endTutorial(skipped) {
  if (!G.tut.on) return;
  G.tut.on = false; G.tut.forced = false; ui.tutorial(false);
  S.settings.tutorialDone = true; save.flush();
  if (G.state === 'play') ui.hint(skipped ? 'Tutorial salteado. Lo podés volver a ver desde la pausa o con H.' : '¡Listo! Restablecé los tres generadores.', 2600);
}
function stopTutorialIfAny() { if (G.tut.on) { G.tut.on = false; ui.tutorial(false); } }
function tutUpdate(dt, moveAmt, lookAmt) {
  if (!G.tut.on || G.state !== 'play') return;
  const s = TUT[G.tut.step]; G.tut.t += dt;
  if (s.k === 'move') { G.tut.acc += moveAmt * dt; if (G.tut.acc > 0.8) tutAdvance(); }
  else if (s.k === 'look') { G.tut.acc += lookAmt; if (G.tut.acc > 0.6) tutAdvance(); }
  else if (s.k === 'fire') { if (P.shots >= 4) tutAdvance(); }
  else if (s.k === 'roll') { if (P.rollT > 0) tutAdvance(); }
  else if (s.k === 'use') { const g = ctx.W.gens[0]; if ((g && (g.progress > 0.15 || g.restored)) || G.tut.t > 30) tutAdvance(); }
}

/* ======================= utilidades ======================= */
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _proj = V(), _pivot = V(), _fwd = V(), _right = V(), _aim = V(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V();
function hint(key, text, cooldown = 9) {
  const now = G.realT;
  if (cooldown === 0) { if (G.hints[key] !== undefined) return; }
  else if ((G.hints[key] ?? -99) + cooldown > now) return;
  G.hints[key] = now; ui.hint(text, 3200);
}
function camForward(out) { const cp = Math.cos(P.pitch); return out.set(Math.sin(P.yaw) * cp, Math.sin(P.pitch), Math.cos(P.yaw) * cp); }
function camRight(out) { return out.set(-Math.cos(P.yaw), 0, Math.sin(P.yaw)); }
let camDist = 5.0;
function snapCamera() { camDist = 5.0; placeCamera(1); }
function placeCamera(k) {
  const W = ctx.W;
  camRight(_right); camForward(_fwd);
  const zoom = P.zoom && G.state === 'play';
  // en vertical la cámara sube y se aleja: se ve más piso y menos techo
  const portrait = clamp((1 - camera.aspect) / 0.5, 0, 1);
  _pivot.set(P.pos.x, 1.95 + portrait * 1.3, P.pos.z).addScaledVector(_right, zoom ? 0.7 : 0.95 - portrait * 0.35);
  const want = (zoom ? 2.6 : 5.0) + portrait * 1.2;
  _b.copy(_fwd).negate();
  let d = want;
  if (W) { const h = W.raycast(_pivot, _b, want + 0.3, false, true); if (h.t < want + 0.3) d = Math.max(0.5, h.t - 0.3); }
  camDist += (d - camDist) * (d < camDist ? 1 : Math.min(1, k * 0.15));
  camera.position.copy(_pivot).addScaledVector(_b, camDist);
  // con la cámara empujada por una pared, sube un poco para no tapar la mira con el personaje
  camera.position.y += Math.max(0, want - camDist) * 0.18;
  if (camera.position.y < 0.3) camera.position.y = 0.3;
  _a.copy(_pivot).addScaledVector(_fwd, 12);
  if (portrait > 0) _a.y -= portrait * 1.3;
  camera.lookAt(_a);
  // en vertical (celular) se abre el FOV para no perder visión lateral
  const fov = (zoom ? 48 : 64) * clamp(1 / Math.max(0.01, camera.aspect), 1, 1.42);
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, k * 0.25); camera.updateProjectionMatrix(); }
  if (G.shake > 0 && !reduced()) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.5; camera.position.y += (Math.random() - 0.5) * G.shake * 0.5; }
}

/* ======================= combate del jugador ======================= */
/** Dirección de disparo (con autoapuntado opcional) en `out`. Devuelve el mutante asistido o null. */
function aimDirection(out) {
  camera.getWorldDirection(out); // la mira es el centro real de la cámara
  const mode = S.settings.autoAim;
  if (mode === 'off') return null;
  const cone = mode === 'fuerte' ? 0.2 : 0.1, pull = mode === 'fuerte' ? 1 : 0.6;
  let best = null, bestA = cone;
  for (const e of enemies.all) {
    if (!e.alive || e.state === 'spawn' || e.state === 'swell' || (e.type === 'stalker' && e.alpha < 0.5)) continue;
    _a.set(e.pos.x, e.height * 0.55, e.pos.z).sub(camera.position);
    const len = _a.length(); if (len > 32) continue;
    _a.multiplyScalar(1 / len);
    const ang = Math.acos(clamp(_a.dot(out), -1, 1));
    if (ang < bestA && ctx.W.los(P.pos, e.pos, 1.3)) { bestA = ang; best = e; }
  }
  if (best) {
    _a.set(best.pos.x, best.height * 0.55, best.pos.z).sub(camera.position).normalize();
    out.lerp(_a, pull).normalize();
  }
  return best;
}
function shoot() {
  const W = ctx.W;
  P.fireCd = 1 / WEAPON.rate; P.ammo--; P.shots++; P.recoil = 1; P.flash = 0.05;
  sfx.shot();
  aimDirection(_aim);
  const sp = WEAPON.spread * (P.zoom ? 0.35 : 1) * (P.moveAmt > 0.2 ? 1.6 : 1);
  _aim.x += (Math.random() - 0.5) * sp * 2; _aim.y += (Math.random() - 0.5) * sp * 2; _aim.z += (Math.random() - 0.5) * sp * 2; _aim.normalize();
  // el rayo arranca a la altura del jugador (no choca con cosas entre la cámara y él)
  _c.copy(camera.position).addScaledVector(_aim, Math.max(0, camDist - 0.2));
  const maxT = WEAPON.range;
  const hw = W.raycast(_c, _aim, maxT, false, true);
  let t = hw.t, kind = hw.kind, ref = hw.ref;
  const he = enemies.raycast(_c, _aim, maxT);
  let crit = false;
  if (he.t < t) { t = he.t; kind = 'enemy'; ref = he.e; crit = he.head; }
  const hb = boss.raycast(_c, _aim, maxT);
  if (hb.t < t) { t = hb.t; kind = 'boss:' + hb.part; ref = hb.ref; }
  const hitPoint = _d.copy(_c).addScaledVector(_aim, Math.min(t, maxT));
  // trazadora desde la boca del arma
  pGunM.updateMatrixWorld(true);
  _e.copy(hm.muzzle).applyMatrix4(pGunM.matrixWorld);
  fx.tracers.shot(_e, hitPoint, crit ? 0xffffff : 0xfff0a0, 0.045);
  const dmg = WEAPON.dmg[G.up.dmg];
  if (kind === 'enemy' && ref) {
    const r = enemies.damage(ref, dmg, P.pos, crit);
    fx.gore.burst(hitPoint.x, hitPoint.y, hitPoint.z, r === 'armor' ? 0 : 5, ref.type === 'stalker' ? 0x6a9aff : 0x8dff3a, 3, 0.4, 12, 0.3);
    if (r === 'armor') { fx.sparks.burst(hitPoint.x, hitPoint.y, hitPoint.z, 6, 0xffe08a, 4, 0.25, 6, 0.2); sfx.armor(); hint('armor', 'Blindaje frontal: rodeá al bruto o hacelo chocar contra una pared.', 14); }
    else sfx.hit(crit);
    ui.hitMarker(r === 'kill');
  } else if (kind.startsWith('boss:')) {
    const r = boss.hit(kind.slice(5), ref, dmg);
    fx.sparks.burst(hitPoint.x, hitPoint.y, hitPoint.z, r === 'armor' ? 4 : 8, r === 'armor' ? 0xffe08a : 0xb6ff3a, 4, 0.3, 6, 0.2);
    if (r === 'armor') { sfx.armor(); hint('boss-armor', boss.phase === 1 ? 'Casi no le hacés daño: apuntá a los tanques verdes.' : 'Apuntá al núcleo brillante del pecho.', 12); }
    else { sfx.hit(true); ui.hitMarker(r === 'tankDown'); }
  } else if (kind === 'grate' && ref) {
    ref.hp -= dmg;
    fx.sparks.burst(hitPoint.x, hitPoint.y, hitPoint.z, 6, 0xffe08a, 3, 0.3, 6, 0.2);
    if (ref.hp <= 0) breakGrate();
  } else if (t < maxT) {
    fx.sparks.burst(hitPoint.x, hitPoint.y, hitPoint.z, 4, 0xffd08a, 3, 0.25, 8, 0.3);
  }
  if (P.ammo <= 0) startReload();
}
function startReload() { if (P.reloadT > 0 || P.ammo >= WEAPON.mag[G.up.mag]) return; P.reloadT = WEAPON.reload[G.up.mag]; sfx.reload(); }
function breakGrate() {
  if (!ctx.W.breakGrate()) return;
  G.session.arenas[G.arenaIdx].grate = true;
  fx.gore.burst(ctx.W.grate.pos.x, 1.5, ctx.W.grate.pos.z, 16, 0x6f8a86, 5, 0.7, 12, 0.4);
  sfx.crate(); hint('grate', 'La rejilla cedió… algo verde brilla adentro.', 0);
}
function doPulse() {
  const lv = G.up.pulse;
  P.pulseCd = PLAYER.pulse.cd * (1 - 0.25 * lv);
  const pp = PLAYER.pulse;
  const n = enemies.pulse(P.pos, pp.radius, pp.dmg, pp.push, pp.stun, pp.reveal);
  fx.tele.zone(P.pos.x, P.pos.z, pp.radius, 0.35, 0xc08aff, true);
  fx.sparks.burst(P.pos.x, 1, P.pos.z, reduced() ? 10 : 30, 0xc08aff, 9, 0.5, 0, 0.1);
  sfx.pulse();
  if (ctx.W.grate && !ctx.W.grate.broken && ctx.W.grate.pos.distanceTo(P.pos) < pp.radius) breakGrate();
  if (n) MM.emit('pulseHit', n);
}

/* ---------- barricadas ---------- */
/** @type {any[]} */ const barricades = [];
function placeBarricade() {
  const W = ctx.W, cost = PLAYER.barricade.cost;
  if (G.scrap < cost) { hint('barr-cost', `Necesitás 🔩 ${cost} de chatarra para una barricada.`, 4); sfx.empty(); return false; }
  const yaw = Math.round(P.yaw / (Math.PI / 2)) * (Math.PI / 2);
  const fx0 = Math.sin(yaw), fz0 = Math.cos(yaw);
  const pos = new THREE.Vector3(P.pos.x + fx0 * 1.9, 0, P.pos.z + fz0 * 1.9);
  const along = Math.abs(fz0) > 0.5; // pared perpendicular a la mirada
  const hx = along ? 1.8 : 0.35, hz = along ? 0.35 : 1.8;
  // validar: ningún sólido debajo
  for (const [ox, oz] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, 0]]) {
    const i = W.cellIndex(pos.x + ox, pos.z + oz);
    if (i < 0 || W.solid(i) || W.grid[i] === 4) { hint('barr-bad', 'No hay lugar para la barricada ahí.', 3); sfx.empty(); return false; }
  }
  for (const b of barricades) if (b.alive && Math.abs(b.pos.x - pos.x) < b.hx + hx && Math.abs(b.pos.z - pos.z) < b.hz + hz) { hint('barr-bad', 'Ya hay una barricada ahí.', 3); return false; }
  const alive = barricades.filter(b => b.alive);
  if (alive.length >= PLAYER.barricade.max) destroyBarricade(alive[0], true);
  G.scrap -= cost;
  const mesh = new THREE.Mesh(barrGeo, mats.vc); mesh.castShadow = true; mesh.position.copy(pos); mesh.rotation.y = along ? 0 : Math.PI / 2; mesh.scale.x = 1.5;
  if (fz0 < -0.5 || fx0 < -0.5) mesh.rotation.y += Math.PI;
  root.add(mesh);
  const b = { pos, hx, hz, hp: PLAYER.barricade.hp, max: PLAYER.barricade.hp, alive: true, mesh, t: 0, hitT: 0 };
  barricades.push(b);
  W.recomputeExtraCost(); flowT = 0;
  G.session.barricades++;
  MM.emit('barricade');
  sfx.build();
  fx.gore.burst(pos.x, 0.5, pos.z, 10, 0x8a7a50, 3, 0.5, 12, 0.5);
  return true;
}
function destroyBarricade(b, silent = false) {
  if (!b.alive) return;
  b.alive = false; root.remove(b.mesh);
  const i = barricades.indexOf(b); if (i >= 0) barricades.splice(i, 1);
  if (!silent) { fx.gore.burst(b.pos.x, 0.6, b.pos.z, 20, 0x8a7a50, 5, 0.8, 12, 0.5); sfx.thud(b.pos); }
  if (ctx.W) { ctx.W.recomputeExtraCost(); flowT = 0; }
}

/* ---------- chatarra y botiquines ---------- */
function dropScrap(pos, n) { for (let k = 0; k < n; k++) dropPickup(pos, 'scrap'); }
function dropPickup(pos, kind) {
  const i = fx.scrap.alloc(); if (i < 0) { if (kind === 'scrap') G.scrap++; return; }
  const a = Math.random() * 6.28, s = 1.5 + Math.random() * 2;
  pickups.push({ i, pos: new THREE.Vector3(pos.x, 0.6, pos.z), vel: new THREE.Vector3(Math.cos(a) * s, 3 + Math.random() * 2, Math.sin(a) * s), v: 1, t: 0, kind });
  if (kind === 'med') fx.scrap.color(i, new THREE.Color(0.3, 2.2, 0.5)); else fx.scrap.color(i, new THREE.Color(1, 1, 1));
}
function updatePickups(dt) {
  for (let k = pickups.length - 1; k >= 0; k--) {
    const p = pickups[k]; p.t += dt;
    const dx = P.pos.x - p.pos.x, dz = P.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (p.t > 0.5 && d < 3.8) { const s = 12 * (1 - d / 4.5) + 3; p.vel.x = dx / d * s; p.vel.z = dz / d * s; p.vel.y = 0; p.pos.y += (0.8 - p.pos.y) * Math.min(1, dt * 8); }
    else { p.vel.y -= 14 * dt; p.vel.x *= 1 - dt * 2; p.vel.z *= 1 - dt * 2; }
    p.pos.addScaledVector(p.vel, dt);
    if (p.pos.y < 0.15) { p.pos.y = 0.15; p.vel.y *= -0.4; }
    if (p.t > 0.4 && d < 0.8) {
      if (p.kind === 'med') { P.hp = Math.min(P.maxHp, P.hp + 30); sfx.heal(); hint('med', '+30 de vida', 2); }
      else { G.scrap++; sfx.pickup(); }
      fx.scrap.free(p.i); pickups.splice(k, 1); continue;
    }
    if (p.t > 25) { fx.scrap.free(p.i); pickups.splice(k, 1); continue; }
    _q.setFromAxisAngle(_e.set(0.3, 1, 0.2).normalize(), p.t * 4);
    _m4.compose(p.pos, _q, _s.setScalar(p.kind === 'med' ? 1.8 : 1)); fx.scrap.set(p.i, _m4);
  }
}

/* ---------- daño ---------- */
function hurtPlayer(dmg, src, kind, continuous = false) {
  if (!P.alive || G.state !== 'play') return;
  if (P.invuln > 0 || (P.rollT > 0 && PLAYER.roll.time - P.rollT < PLAYER.roll.iframes)) { if (!continuous && P.rollT > 0) hint('dodge', '¡Esquivado!', 6); return; }
  P.hp -= dmg; P.regenT = 0;
  if (dmg >= 0.5 || !continuous) {
    G.streak = 0; MM.emit('hurt');
    sfx.hurt();
    G.stress += dmg;
    if (!continuous) { P.invuln = 0.35; ctx.hooks.shake(Math.min(0.5, dmg / 40)); }
    if (P.hold > 0 && P.holdTarget) P.hold = Math.max(0, P.hold - 0.12);
  } else { G.streak = 0; MM.emit('hurt'); }
  if (src) {
    camForward(_fwd);
    const a = Math.atan2(src.x - P.pos.x, src.z - P.pos.z) - Math.atan2(_fwd.x, _fwd.z);
    ui.damageDir(-a);
  }
  if (P.hp <= 0) killPlayer();
}
function killPlayer() {
  if (!P.alive) return;
  P.hp = 0; P.alive = false;
  G.state = 'dying'; G.stateT = 0; G.endReason = 'hp';
  input.showTouch(false); ui.showRStick(false); exitPointer();
  sfx.hurt(); fx.gore.burst(P.pos.x, 1, P.pos.z, 20, 0xa83a2a, 5, 0.8, 12, 0.4);
}
function hurtSurvivor(dmg) {
  if (!SV.alive || !SV.following) return;
  SV.hp -= dmg;
  fx.gore.burst(SV.pos.x, 1.2, SV.pos.z, 4, 0xa83a2a, 3, 0.4, 12, 0.3);
  hint('sv-hurt', '¡Están atacando al superviviente!', 8);
  if (SV.hp <= 0) {
    SV.alive = false; SV.following = false; sg.visible = false;
    G.session.survivor = 'dead'; MM.emit('survivorDied');
    fx.gore.burst(SV.pos.x, 1, SV.pos.z, 20, 0xa83a2a, 5, 0.8, 12, 0.4);
    ui.hint('El superviviente cayó…', 3000);
  }
}
function hurtBeacon(dmg) {
  if (!BC.active) return;
  BC.hp -= dmg;
  fx.sparks.burst(BC.pos.x, 1.6, BC.pos.z, 4, 0xff6a3a, 3, 0.3, 6, 0.3);
  hint('beacon-hurt', '¡Defendé la baliza de aterrizaje!', 8);
  if (BC.hp <= 0) { BC.hp = 0; BC.active = false; G.sec.failWhy = 'beacon'; G.state = 'dying'; G.stateT = 0; G.endReason = 'extraction'; input.showTouch(false); ui.showRStick(false); exitPointer(); }
}

/* ======================= interacciones ======================= */
/** Busca la interacción disponible más cercana. */
function findInteraction() {
  const W = ctx.W; let best = null, bestD = 1e9;
  const consider = (/** @type {any} */ obj, /** @type {THREE.Vector3} */ pos, /** @type {number} */ range, /** @type {string} */ kind, /** @type {string} */ text, ok = true, hold = 0, bias = 0) => {
    const d = Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z);
    if (d < range && d - bias < bestD) { bestD = d - bias; best = { obj, kind, text, ok, hold, pos }; }
  };
  for (const g of W.gens) if (!g.restored) consider(g, g.pos, 2.4, 'gen', 'Restablecer generador', true, 3.2);
  for (const c of W.crates) if (!c.opened) consider(c, c.pos, 2.0, 'crate', 'Abrir caja de suministros');
  for (const d of W.doors) {
    if (d.exit || d.state === 'broken') continue;
    if (d.state === 'locked') consider(d, d.center, 2.6, 'door', 'Puerta sin energía: restablecé su generador', false);
    else consider(d, d.center, 2.6, 'door', d.state === 'open' ? 'Cerrar puerta' : 'Abrir puerta');
  }
  for (const t of W.traps) {
    const powered = t.gen === null || t.gen === undefined || (W.gens[t.gen] && W.gens[t.gen].restored);
    const label = t.kind === 'vapor' ? 'trampa de vapor' : t.kind === 'tesla' ? 'bobina tesla' : 'rociador neutralizante';
    if (!powered) consider(t, t.console, 2.2, 'trap', `Sin energía: ${label}`, false);
    else if (t.state === 'idle') consider(t, t.console, 2.2, 'trap', `Activar ${label}`);
    else if (t.state === 'cooldown') consider(t, t.console, 2.2, 'trap', `Recargando ${label}…`, false);
  }
  if (W.workbench) consider(W.workbench, W.workbench.pos, 2.3, 'bench', 'Banco de trabajo: mejoras');
  if (W.terminal && !W.terminal.used && G.sec.stage === 'call') consider(W.terminal, W.terminal.pos, 2.3, 'radio', 'Pedir extracción por radio', true, 2.6);
  if (SV.present && SV.alive && !SV.freed && !SV.saved) {
    const door = W.doors.find((/** @type {any} */ d) => d.id === 1);
    consider(SV, SV.pos, 3.6, 'survivor', door && door.open > 0.8 ? 'Liberar superviviente' : 'Superviviente encerrado: energizá la cabina (generador ⚡)', !!(door && door.open > 0.8), 0, 2.5);
  }
  if (W.antidote && !W.antidote.taken && (!W.grate || W.grate.broken)) consider(W.antidote, W.antidote.pos, 1.8, 'antidote', 'Tomar antídoto');
  return best;
}
function interact(it) {
  const W = ctx.W, st = G.session.arenas[G.arenaIdx];
  if (!it.ok) { sfx.empty(); return; }
  if (it.kind === 'crate') {
    const c = it.obj; c.opened = true; st.crates[c.i] = true;
    const n = Math.round((4 + Math.random() * 3) * G.diff.scrap);
    dropScrap(_a.set(c.pos.x, 0, c.pos.z), n);
    if (Math.random() < 0.45 || P.hp < P.maxHp * 0.5) dropPickup(c.pos, 'med');
    G.score += 50; sfx.crate(); MM.emit('crate');
    fx.sparks.burst(c.pos.x, 0.8, c.pos.z, 12, 0xa6ff2e, 3, 0.5, 4, 0.5);
  } else if (it.kind === 'door') {
    const d = it.obj;
    // no cerrar con alguien adentro
    if (d.state === 'open') {
      for (const [c, r] of d.cells) {
        const x = W.cx(c), z = W.cz(r);
        if (Math.abs(P.pos.x - x) < 1.4 && Math.abs(P.pos.z - z) < 1.4) { hint('door-in', 'Salí del marco para cerrar la puerta.', 3); return; }
        for (const e of enemies.all) if (e.alive && Math.abs(e.pos.x - x) < 1.3 && Math.abs(e.pos.z - z) < 1.3) { hint('door-in', 'Hay un mutante en el marco.', 3); return; }
      }
      W.setDoorState(d, 'closed'); d.hp = d.maxHp;
    } else W.setDoorState(d, 'open');
    persistDoor(d); sfx.door(d.center); flowT = 0;
    MM.emit('door');
  } else if (it.kind === 'trap') {
    const t = it.obj; t.state = 'arming'; t.t = 0; t.uses++; st.traps[t.i] = t.uses;
    G.session.traps++; MM.emit('trapOn'); sfx.trap(t.kind);
    hint('trap-on', 'Trampa armada: atraé a los mutantes a la zona marcada.', 8);
  } else if (it.kind === 'bench') {
    openCraft();
  } else if (it.kind === 'survivor') {
    SV.freed = true; SV.following = true; G.session.survivor = 'following';
    sfx.heal(); ui.hint('Superviviente liberado: te sigue y dispara. Mantenelo con vida hasta salir de la estación.', 3600);
    MM.emit('survivorFreed');
  } else if (it.kind === 'antidote') {
    const a = W.antidote; a.taken = true; a.mesh.visible = false; a.glow.visible = false; st.antidote = true;
    P.antidote = true; P.hp = P.maxHp; sfx.heal(); MM.emit('antidote'); G.score += 400;
    ui.hint('ANTÍDOTO: vida completa y el daño tóxico se reduce a un tercio.', 3600);
  }
}
function completeHold(it) {
  const W = ctx.W, st = G.session.arenas[G.arenaIdx];
  if (it.kind === 'gen') {
    const g = it.obj; g.restored = true; g.progress = 1; g.lightMat.color.setHex(0x3aff6a); st.gens[g.i] = true;
    G.session.gens++; G.score += Math.round(300 * G.diff.score);
    MM.emit('generator');
    sfx.genOn(); fx.sparks.burst(g.pos.x, 1.8, g.pos.z, 24, 0xffd23a, 6, 0.7, 4, 0.4);
    updatePower(false);
    if (G.sec.onGen) G.sec.onGen(g);
  } else if (it.kind === 'radio') {
    W.terminal.used = true; sfx.radio();
    if (G.sec.onCall) G.sec.onCall();
  }
}
/** Recalcula qué puertas tienen energía. Las que la reciben por primera vez se abren solas. */
function updatePower(initial) {
  const W = ctx.W;
  for (const d of W.doors) {
    if (d.state !== 'locked') continue;
    if (d.gens.length === 0) continue; // salidas sin generador: las abre la lógica de la arena
    if (d.gens.every((/** @type {number} */ i) => W.gens[i] && W.gens[i].restored)) {
      W.setDoorState(d, 'open'); if (initial) d.open = 1; else { sfx.door(d.center); persistDoor(d); }
      if (!initial && !d.exit) hint('door-power', 'Puerta energizada: podés cerrarla con E para cortarle el paso a los mutantes.', 30);
    }
  }
  flowT = 0;
}
function updateTraps(dt) {
  const W = ctx.W;
  for (const t of W.traps) {
    t.t += dt;
    const powered = t.gen === null || t.gen === undefined || (W.gens[t.gen] && W.gens[t.gen].restored);
    if (t.state === 'idle') { t.lightMat.color.setHex(powered ? 0x3aff6a : 0x555555); t.zoneMat.opacity = powered ? 0.1 + 0.05 * Math.sin(G.realT * 3) : 0.04; }
    else if (t.state === 'arming') {
      t.lightMat.color.setHex(Math.sin(t.t * 20) > 0 ? 0xffd23a : 0x333333); t.zoneMat.opacity = 0.35;
      if (t.t > 1.0) { t.state = 'active'; t.t = 0; t.tick = 0; }
    } else if (t.state === 'active') {
      t.lightMat.color.setHex(0xff5a2a); t.zoneMat.opacity = 0.25 + 0.15 * Math.sin(t.t * 12);
      t.tick -= dt;
      if (t.kind === 'tesla') {
        if (t.tick <= 0) {
          t.tick = 0.35; let n = 0;
          for (const e of enemies.all) {
            if (!e.alive || n >= 3 || e.state === 'swell') continue;
            const d = Math.hypot(e.pos.x - t.pos.x, e.pos.z - t.pos.z); if (d > t.radius + 1.2) continue;
            n++;
            _a.set(t.pos.x, 2.4, t.pos.z); _b.set(e.pos.x, e.height * 0.6, e.pos.z);
            fx.tracers.shot(_a, _b, 0x9adfff, 0.08);
            fx.sparks.burst(_b.x, _b.y, _b.z, 6, 0x9adfff, 3, 0.25, 4, 0.2);
            if (e.type === 'stalker') e.revealed = Math.max(e.revealed, 2);
            if (enemies.damage(e, 24, t.pos) === 'kill') G.score += 30;
            sfx.zap(t.pos);
          }
        }
      } else {
        if (Math.random() < dt * 30) fx.sparks.plume(t.pos.x, 0.2, t.pos.z, 2, t.kind === 'vapor' ? 0xffc8a0 : 0xd8b8ff, t.radius * 1.6, 3, 0.9);
        for (const e of enemies.all) {
          if (!e.alive || e.state === 'swell') continue;
          if (Math.hypot(e.pos.x - t.pos.x, e.pos.z - t.pos.z) > t.radius) continue;
          e.hp -= 38 * dt; e.flash = 0.03;
          if (t.kind === 'rociador') { e.push.x -= (e.dir.x * e.speed * 0.5) * dt * 4; e.push.z -= (e.dir.z * e.speed * 0.5) * dt * 4; }
          if (e.type === 'stalker') e.revealed = Math.max(e.revealed, 1);
          if (e.hp <= 0) { if (e.type === 'spitter') enemies.startSwell(e); else enemies.kill(e, 'trap'); }
        }
      }
      if (t.t > 8) { t.state = 'cooldown'; t.t = 0; }
    } else if (t.state === 'cooldown') {
      t.lightMat.color.setHex(0x3a6aff); t.zoneMat.opacity = 0.05;
      if (t.t > 16) { t.state = 'idle'; t.t = 0; }
    }
  }
}

/* ======================= director de amenazas ======================= */
/** Pone en cola un grupo de mutantes. */
function queue(types, gap = 1.2) { G.queue.push(...types); G.qGap = gap; }
/** Compone una oleada gastando el presupuesto con los tipos permitidos. */
function compose(budget, types) {
  const out = []; let b = budget;
  let guard = 0;
  while (b > 0.5 && guard++ < 200) {
    const t = types[Math.floor(Math.random() * types.length)];
    const c = /** @type {any} */ (THREAT)[t];
    if (c > b + 0.6) { if (types.every(x => /** @type {any} */ (THREAT)[x] > b + 0.6)) break; continue; }
    out.push(t); b -= c;
  }
  return out;
}
function pickSpawn() {
  const W = ctx.W;
  camForward(_fwd);
  let cands = [];
  for (const s of W.spawns) {
    const i = W.cellIndex(s.pos.x, s.pos.z);
    if (i < 0 || !isFinite(flowP[i])) continue;
    const dx = s.pos.x - P.pos.x, dz = s.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    const inView = (dx * _fwd.x + dz * _fwd.z) / (d || 1) > 0.55;
    const score = (d >= 10 ? 10 : 0) + Math.min(d, 26) * 0.2 + (inView ? 0 : 3) + Math.random() * 3;
    cands.push({ s, score, d });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  return cands[0].s;
}
function updateDirector(dt, cap) {
  const W = ctx.W;
  // estrés: daño reciente + mutantes cerca. Con mucho estrés y poca vida, respiro + ruta de escape.
  G.stress = Math.max(0, G.stress - dt * 6);
  let near = 0; for (const e of enemies.all) if (e.alive && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < 8) near++;
  const stress = G.stress + near * 6;
  if (G.relief <= 0 && stress > 55 && P.hp < P.maxHp * 0.45) {
    G.relief = 5;
    // ruta de escape: puerta con energía más alejada de los mutantes
    let best = null, bestScore = -1e9;
    for (const d of W.doors) {
      if (d.state === 'locked' || d.exit) continue;
      const i = W.cellIndex(d.center.x, d.center.z); if (i < 0 || !isFinite(flowP[i])) continue;
      const dd = Math.hypot(d.center.x - P.pos.x, d.center.z - P.pos.z); if (dd > 26) continue;
      let crowd = 0; for (const e of enemies.all) if (e.alive && Math.hypot(e.pos.x - d.center.x, e.pos.z - d.center.z) < 7) crowd++;
      const sc = -crowd * 5 - dd * 0.3;
      if (sc > bestScore) { bestScore = sc; best = d; }
    }
    if (best) { G.escape = best; G.escapeT = 7; hint('escape', '¡Demasiados! Ruta de escape marcada 🏃: cruzá la puerta y cerrala con E.', 12); }
    else hint('escape2', '¡Respirá! Rodá, usá el pulso (Q) y alejate de la horda.', 12);
  }
  G.relief = Math.max(0, G.relief - dt);
  G.escapeT = Math.max(0, G.escapeT - dt); if (G.escapeT <= 0) G.escape = null;
  // aparición desde la cola
  G.qTimer -= dt;
  if (G.queue.length && G.qTimer <= 0 && G.relief <= 0 && enemies.count() + G.pending.length < cap) {
    const s = pickSpawn();
    if (s) {
      const type = /** @type {string} */ (G.queue.shift());
      s.warn = 0.9; sfx.spawn(s.pos);
      G.pending.push({ type, s, t: 0.85, target: G.sec.beaconTargets && (type === 'runner' || type === 'brute') && Math.random() < 0.45 ? 'beacon' : 'player' });
      G.qTimer = G.qGap * (0.7 + Math.random() * 0.6);
    } else G.qTimer = 0.5;
  }
  for (let k = G.pending.length - 1; k >= 0; k--) {
    const p = G.pending[k]; p.t -= dt;
    if (p.t <= 0) {
      G.pending.splice(k, 1);
      _a.set(p.s.pos.x + (Math.random() - 0.5) * 0.6, 0, p.s.pos.z + (Math.random() - 0.5) * 0.6);
      const e = enemies.spawn(p.type, _a, { target: p.target });
      if (e && !G.seen[p.type]) { G.seen[p.type] = true; introEnemy(p.type); }
    }
  }
}
function introEnemy(type) {
  const t = {
    runner: 'CORREDOR: rápido y frágil. Cuando se agacha en rojo, va a saltar: rodá de costado.',
    brute: 'BRUTO: blindado de frente. Su embestida se marca con una línea: esquivala y hacelo chocar contra una pared.',
    spitter: 'ESCUPIDOR: escupe ácido donde vas a estar (círculo verde). Al morir se infla: no lo mates cuerpo a cuerpo.',
    stalker: 'ACECHADOR INVISIBLE: escuchá el latido. Un tiro o el pulso (Q) lo revelan; sisea antes del zarpazo.',
  };
  ui.hint(/** @type {any} */ (t)[type], 4800);
}

/* ======================= arenas ======================= */
function setupArena(idx, retry) {
  const W = ctx.W;
  const sec = /** @type {any} */ ({ t: 0, done: false, stage: '', retry, failWhy: '', beaconTargets: false });
  if (idx === 0) {
    // BÚNKER: 3 generadores; cada uno dispara una horda. El tercero energiza el ascensor.
    sec.stage = 'gens'; sec.trickle = 9;
    sec.onGen = () => {
      const n = W.gens.filter((/** @type {any} */ g) => g.restored).length;
      if (n === 1) { queue(['runner', 'runner', 'runner', 'runner', 'spitter'].slice(0, Math.round(5 * G.diff.budget)), 1.1); ui.banner('HORDA', '¡El ruido los atrae!', 'Sobreviví y buscá el siguiente generador', 2200); }
      else if (n === 2) { queue(compose(10 * G.diff.budget, ['runner', 'runner', 'spitter', 'brute']), 1.0); ui.banner('HORDA', '¡Más mutantes!', 'El tercer generador está en el ala este', 2200); hint('gen2', 'El ala este se abrió. El último generador está ahí.', 0); }
      else if (n >= 3) { queue(compose(12 * G.diff.budget, ['runner', 'spitter', 'brute', 'runner']), 0.9); ui.banner('ENERGÍA TOTAL', '¡ASCENSOR ACTIVO!', 'Corré al ascensor del norte', 2600); sec.stage = 'lift'; }
      sfx.wave();
    };
    sec.update = (/** @type {number} */ dt) => {
      const n = W.gens.filter((/** @type {any} */ g) => g.restored).length;
      if (n >= 3 && sec.stage !== 'lift') sec.stage = 'lift';
      if (!G.tut.on || G.tut.step >= 3) {
        sec.trickle -= dt;
        if (sec.trickle <= 0 && enemies.count() < 4 && !G.queue.length) { sec.trickle = 10 + Math.random() * 6; queue(Math.random() < 0.3 ? ['runner', 'spitter'] : ['runner', 'runner'], 1.5); }
      }
      updateDirector(dt, 9);
      const exitDoor = W.doors.find((/** @type {any} */ d) => d.exit);
      if (sec.stage === 'lift' && exitDoor && exitDoor.open > 0.9 && W.exit && Math.hypot(P.pos.x - W.exit.pos.x, P.pos.z - W.exit.pos.z) < W.exit.radius) arenaComplete();
      if (W.exit) W.exit.ringMat.opacity = sec.stage === 'lift' ? 0.5 + 0.3 * Math.sin(G.realT * 5) : 0;
      const label = sec.stage === 'lift' ? 'Llegá al ascensor ⬆' : 'Restablecé los generadores ⚡';
      ui.objective('BÚNKER OXIDADO', label, `Generadores ${n}/3 · Mutantes ${enemies.count()}`);
    };
  } else if (idx === 1) {
    // ESTACIÓN: seis oleadas del director; el generador A energiza la cabina y las bobinas; B, las compuertas (rutas de escape).
    sec.stage = 'pre'; sec.wave = G.session.waves; sec.breakT = retry ? 6 : 10; sec.spawned = 0; sec.total = 0;
    if (sec.wave >= 6) { sec.stage = 'exit'; const ex = W.doors.find((/** @type {any} */ d) => d.exit); if (ex) { W.setDoorState(ex, 'open'); ex.open = 1; } }
    sec.onKill = () => {};
    sec.update = (/** @type {number} */ dt) => {
      if (sec.stage === 'pre' || sec.stage === 'break') {
        sec.breakT -= dt;
        if (sec.breakT <= 0) {
          const wdef = STATION_WAVES[sec.wave];
          const types = compose(wdef.budget * G.diff.budget, wdef.types);
          sec.total = types.length;
          queue(types, wdef.gap); sec.stage = 'wave';
          ui.banner(`OLEADA ${sec.wave + 1} DE 6`, sec.wave === 5 ? '¡LA ÚLTIMA!' : 'EL DIRECTOR ATACA', wdef.intro === 'stalker' ? 'Algo invisible se acerca…' : `${types.length} mutantes`, 2200);
          sfx.wave();
        }
      } else if (sec.stage === 'wave') {
        if (!G.queue.length && !G.pending.length && enemies.count() === 0) {
          sec.wave++; G.session.waves = sec.wave; MM.emit('waveSurvived');
          G.score += Math.round(500 * sec.wave * G.diff.score);
          if (sec.wave >= 6) {
            sec.stage = 'exit';
            const ex = W.doors.find((/** @type {any} */ d) => d.exit); if (ex) { W.setDoorState(ex, 'open'); persistDoor(ex); sfx.door(ex.center); }
            ui.banner('¡SEIS OLEADAS!', 'COMPUERTA ABIERTA', 'Salí por el norte hacia el laboratorio', 2800);
          } else { sec.stage = 'break'; sec.breakT = 7; ui.banner(`OLEADA ${sec.wave} SUPERADA`, 'RESPIRÁ', 'Juntá chatarra, levantá barricadas o mejorá el arma', 2200); }
        }
      } else if (sec.stage === 'exit') {
        if (W.exit && Math.hypot(P.pos.x - W.exit.pos.x, P.pos.z - W.exit.pos.z) < W.exit.radius + 0.6) {
          if (SV.alive && SV.following && !SV.saved) { SV.saved = true; G.session.survivor = 'saved'; MM.emit('survivorSaved'); G.score += Math.round(1500 * G.diff.score); }
          arenaComplete();
        }
      }
      if (W.exit) W.exit.ringMat.opacity = sec.stage === 'exit' ? 0.5 + 0.3 * Math.sin(G.realT * 5) : 0;
      updateDirector(dt, 7 + sec.wave * 1.5);
      const left = sec.stage === 'wave' ? G.queue.length + G.pending.length + enemies.count() : 0;
      const goal = sec.stage === 'exit' ? 'Salí por la compuerta norte ⬆' : sec.stage === 'wave' ? `Oleada ${sec.wave + 1}: resistí` : `Próxima oleada en ${Math.ceil(sec.breakT)} s`;
      ui.objective('ESTACIÓN ELÉCTRICA', goal, `Oleadas ${Math.min(6, sec.wave)}/6${sec.stage === 'wave' ? ` · Quedan ${left}` : ''}`);
    };
  } else {
    // LABORATORIO: energía → radio → defender la baliza → Coloso → transporte.
    sec.stage = W.gens[0] && W.gens[0].restored ? 'call' : 'power'; sec.trickle = 8; sec.eta = 45; sec.board = 30;
    sec.onGen = () => { sec.stage = 'call'; hint('lab-radio', 'La radio de la sala oeste tiene energía. Pedí la extracción.', 0); };
    sec.onCall = () => {
      sec.stage = 'defend'; sec.eta = 45; BC.active = true; BC.hp = BC.max = 400 * (G.diff.enemyHp > 1 ? 1 : 1.2);
      sec.beaconTargets = true; flowT = 0;
      queue(compose(9 * G.diff.budget, ['runner', 'runner', 'spitter', 'brute']), 1.0);
      ui.banner('EXTRACCIÓN SOLICITADA', 'DEFENDÉ LA BALIZA', 'El transporte llega en 45 s', 2600);
      sfx.wave();
    };
    sec.update = (/** @type {number} */ dt) => {
      if (sec.stage === 'power' || sec.stage === 'call') {
        sec.trickle -= dt;
        if (sec.trickle <= 0 && enemies.count() < 5 && !G.queue.length) { sec.trickle = 9 + Math.random() * 5; queue(compose(3 * G.diff.budget, ['runner', 'spitter', 'stalker']), 1.4); }
      } else if (sec.stage === 'defend') {
        sec.eta -= dt;
        if (Math.floor(sec.eta) % 12 === 0 && Math.floor(sec.eta + dt) % 12 !== 0 && sec.eta > 5) queue(compose(6 * G.diff.budget, ['runner', 'spitter', 'brute', 'stalker']), 0.9);
        if (sec.eta <= 0) startBossIntro();
      } else if (sec.stage === 'boss') {
        transport.visible = true;
        const a = G.realT * 0.4;
        transport.position.set(W.pad.pos.x + Math.cos(a) * 18, 16, W.pad.pos.z + Math.sin(a) * 18); transport.rotation.set(0, -a, 0.2);
        if (Math.random() < dt * 2) sfx.engine(transport.position);
      } else if (sec.stage === 'descend') {
        sec.descT += dt;
        const k = Math.min(1, sec.descT / 6);
        transport.position.set(W.pad.pos.x, 16 * (1 - k) * (1 - k) + 0.05, W.pad.pos.z); transport.rotation.set(0, Math.PI, 0);
        if (Math.random() < dt * 3) sfx.engine(transport.position);
        fx.sparks.plume(W.pad.pos.x, 0.2, W.pad.pos.z, 1, 0xd8d0c0, 6, 1, 0.8);
        if (k >= 1) { sec.stage = 'board'; sec.board = 30; ui.banner('¡A BORDO!', 'SUBÍ AL TRANSPORTE', '30 segundos', 2400); queue(compose(8 * G.diff.budget, ['runner', 'runner', 'stalker']), 0.5); }
      } else if (sec.stage === 'board') {
        sec.board -= dt;
        if (Math.hypot(P.pos.x - W.pad.pos.x, P.pos.z - W.pad.pos.z) < W.pad.radius) { arenaComplete(); return; }
        if (sec.board <= 0) { sec.failWhy = 'timer'; G.state = 'dying'; G.stateT = 0; G.endReason = 'extraction'; input.showTouch(false); ui.showRStick(false); exitPointer(); }
      }
      if (W.pad) W.pad.ringMat.opacity = sec.stage === 'board' ? 0.5 + 0.35 * Math.sin(G.realT * 6) : sec.stage === 'defend' ? 0.25 : 0;
      updateDirector(dt, sec.stage === 'boss' ? 6 : 10);
      // baliza visible en la UI
      const goals = { power: 'Restablecé el generador ⚡', call: 'Pedí la extracción en la radio 📡', defend: 'Defendé la baliza 🛡', boss: 'Derrotá al Coloso Radiactivo', descend: 'El transporte está bajando…', board: 'Subí al transporte ⬇', cine: 'Algo emerge de la pileta…' };
      const prog = sec.stage === 'defend' ? `Transporte en ${Math.ceil(sec.eta)} s · Baliza ${Math.ceil(BC.hp / BC.max * 100)}%` : sec.stage === 'board' ? `Despega en ${Math.ceil(sec.board)} s` : sec.stage === 'boss' ? `Fase ${boss.phase} de 3` : `Mutantes ${enemies.count()}`;
      ui.objective('LABORATORIO TÓXICO', /** @type {any} */ (goals)[sec.stage] || '', prog);
    };
  }
  return sec;
}
function startBossIntro() {
  const sec = G.sec;
  sec.stage = 'cine'; BC.active = false; sec.beaconTargets = false;
  for (const e of enemies.all) if (e.target === 'beacon') e.target = 'player';
  G.state = 'cine'; G.cineT = 0;
  input.showTouch(false); ui.showRStick(false); exitPointer();
  boss.start();
  ui.banner('¡ALERTA!', 'COLOSO RADIACTIVO', 'Destruye coberturas y altera la arena', 3200, true);
  hint('transport-wait', 'El transporte no puede aterrizar con el Coloso en pie.', 0);
}
function bossDefeated() {
  const W = ctx.W;
  G.score += Math.round(5000 * G.diff.score);
  P.hp = P.maxHp;
  MM.emit('bossDown');
  ui.banner('RECOMPENSA', 'NÚCLEO DEL COLOSO', 'Vida completa · +5000 · El transporte puede aterrizar', 3000, true);
  dropScrap(boss.B.pos, 10);
  G.sec.stage = 'descend'; G.sec.descT = 0;
  transport.visible = true;
  // limpiar la marea
  for (const q of boss.quads) { q.state = 'off'; q.m.visible = false; }
}

/* ======================= actualización ======================= */
function update(dt) {
  G.realT += dt; G.stateT += dt;
  const W = ctx.W; if (!W) return;
  if (G.state === 'menu' || G.state === 'clear' || G.state === 'over' || G.state === 'victory') {
    W.update(dt, G.realT);
    if (G.state === 'menu') {
      const a = G.realT * 0.08, R = Math.max(W.cols, W.rows) * 0.9;
      camera.position.set(Math.cos(a) * R, 26, Math.sin(a) * R); camera.lookAt(0, 0, 0);
      if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = 55; camera.updateProjectionMatrix(); }
    }
    input.endStep();
    return;
  }
  if (G.state === 'craft') { input.endStep(); return; }
  if (G.state === 'cine') {
    G.cineT += dt;
    boss.update(dt); fx.tele.update(dt); fx.sparks.update(dt); fx.gore.update(dt); W.update(dt, G.realT);
    // cámara cinemática hacia la pileta
    const c = W.poolCenter;
    const k = Math.min(1, G.cineT / 1.2);
    _a.set(c.x + 14, 7 + G.cineT * 0.6, c.z + 13);
    camera.position.lerp(_a, k * 0.08 + 0.02);
    camera.lookAt(c.x, 4 + Math.min(4, G.cineT), c.z);
    if (G.shake > 0 && !reduced()) camera.position.x += (Math.random() - 0.5) * G.shake * 0.4;
    G.shake = Math.max(0, G.shake - dt * 1.5);
    input.endStep();
    return;
  }
  const dying = G.state === 'dying';
  const sdt = dying ? dt * 0.35 : dt;
  if (dying && G.stateT > 1.4) { gameOver(G.endReason || 'hp'); return; }
  const sec = G.sec;
  sec.t += sdt; if (!dying) G.runTime += dt;
  // flujo de campos (4 veces por segundo)
  flowT -= sdt;
  if (flowT <= 0) {
    flowT = 0.25;
    W.flow(flowP, P.pos.x, P.pos.z); ctx.flow.player = flowP;
    if (BC.active) { W.flow(flowB, BC.pos.x, BC.pos.z); ctx.flow.beacon = flowB; } else ctx.flow.beacon = null;
  }
  if (!dying) updatePlayer(sdt);
  else { pBody.rotation.x = Math.min(1.5, pBody.rotation.x + dt * 2.5); placeCamera(1); }
  enemies.update(sdt);
  boss.update(sdt);
  updateSurvivor(sdt);
  updateTraps(sdt);
  updatePickups(sdt);
  if (!dying && sec.update) sec.update(sdt);
  W.update(sdt, G.realT);
  fx.tele.update(sdt); fx.tracers.update(sdt); fx.sparks.update(sdt); fx.gore.update(sdt);
  for (const b of barricades) { b.hitT = Math.max(0, b.hitT - sdt); b.mesh.position.x = b.pos.x + (b.hitT > 0 ? (Math.random() - 0.5) * 0.1 : 0); const k = b.hp / b.max; b.mesh.rotation.z = (1 - k) * 0.12; }
  for (const d of W.doors) d.bash = Math.max(0, (d.bash || 0) - sdt);
  G.shake = Math.max(0, G.shake - dt * 2.2);
  input.endStep();
}

function updatePlayer(dt) {
  const W = ctx.W;
  // cámara: mouse, flechas, stick derecho, gamepad
  const sens = S.settings.sens, inv = S.settings.invertY ? -1 : 1;
  const lx = lookAcc.x, ly = lookAcc.y; lookAcc.x = lookAcc.y = 0;
  let dyaw = -lx * 0.0026 * sens, dpitch = -ly * 0.0022 * sens * inv;
  const kx = (input.down('ArrowRight') ? 1 : 0) - (input.down('ArrowLeft') ? 1 : 0), ky = (input.down('ArrowUp') ? 1 : 0) - (input.down('ArrowDown') ? 1 : 0);
  dyaw -= kx * 2.4 * sens * dt; dpitch += ky * 1.6 * sens * dt * inv;
  const rs = ui.rs;
  if (rs.active) { dyaw -= rs.x * Math.abs(rs.x) * 3.0 * sens * dt; dpitch -= rs.y * Math.abs(rs.y) * 1.8 * sens * dt * inv; }
  const pad = readPad();
  if (pad) { dyaw -= pad.x * Math.abs(pad.x) * 3.0 * sens * dt; dpitch -= pad.y * Math.abs(pad.y) * 1.8 * sens * dt * inv; }
  // asistencia de cámara (táctil, autoapuntado fuerte): sigue al objetivo asistido
  if (input.isTouch && S.settings.autoAim === 'fuerte' && !rs.active && P.assist) {
    const e = P.assist; const want = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    dyaw += clamp(angDiff(want, P.yaw), -1, 1) * Math.min(1, dt * 2.5);
  }
  P.yaw += dyaw; P.pitch = clamp(P.pitch + dpitch, -0.55, 0.7);
  P.lookAcc = Math.abs(dyaw) + Math.abs(dpitch);
  // movimiento relativo a la cámara (WASD o stick; las flechas son de cámara)
  let ax = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0), ay = (input.down('KeyS') ? 1 : 0) - (input.down('KeyW') ? 1 : 0);
  if (!ax && !ay) {
    // axis() mezcla flechas y joystick: si coincide con las flechas (que acá son de cámara), no es movimiento
    const a = input.axis(), kl = Math.hypot(kx, ky) || 1;
    if (!(kx || ky) || Math.abs(a.x - kx / kl) > 0.01 || Math.abs(a.y + ky / kl) > 0.01) { ax = a.x; ay = a.y; }
  }
  const al = Math.hypot(ax, ay); if (al > 1) { ax /= al; ay /= al; }
  camRight(_right);
  const fx0 = Math.sin(P.yaw), fz0 = Math.cos(P.yaw);
  const mx = _right.x * ax + fx0 * -ay, mz = _right.z * ax + fz0 * -ay;
  P.moveAmt = Math.min(1, Math.hypot(ax, ay));
  // rodar
  P.rollRecharge -= dt;
  if (P.rolls < PLAYER.roll.charges && P.rollRecharge <= 0) { P.rolls++; P.rollRecharge = PLAYER.roll.recharge; }
  if (P.rollT <= 0 && P.rolls > 0 && input.hit('Space', 'btn:roll')) {
    P.rolls--; if (P.rollRecharge <= 0) P.rollRecharge = PLAYER.roll.recharge;
    P.rollT = PLAYER.roll.time;
    if (P.moveAmt > 0.1) P.rollDir.set(mx, 0, mz).normalize(); else P.rollDir.set(-fx0, 0, -fz0);
    P.reloadT = P.reloadT > 0 ? P.reloadT : 0;
    sfx.roll(); MM.emit('roll');
  }
  const speed = PLAYER.speed * (P.zoom ? 0.6 : 1) * (P.hold > 0 ? 0 : 1);
  if (P.rollT > 0) {
    P.rollT -= dt;
    const k = P.rollT / PLAYER.roll.time;
    P.vel.copy(P.rollDir).multiplyScalar(PLAYER.roll.speed * (0.45 + 0.55 * k));
  } else {
    const tx = mx * speed, tz = mz * speed;
    const acc = PLAYER.accel * dt;
    P.vel.x += clamp(tx - P.vel.x, -acc, acc); P.vel.z += clamp(tz - P.vel.z, -acc, acc);
  }
  P.pos.x += (P.vel.x + P.knock.x) * dt; P.pos.z += (P.vel.z + P.knock.z) * dt;
  P.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
  W.collide(P.pos, PLAYER.radius);
  P.phase += dt * Math.hypot(P.vel.x, P.vel.z) * 1.7;
  P.invuln = Math.max(0, P.invuln - dt);
  // peligros del piso: pileta, charcos, marea
  const ci = W.cellIndex(P.pos.x, P.pos.z);
  let tox = 0;
  if (ci >= 0 && W.grid[ci] === 4) tox = Math.max(tox, 10 * G.diff.enemyDmg);
  tox = Math.max(tox, enemies.puddleDps(P.pos.x, P.pos.z), boss.tideDps(P.pos.x, P.pos.z));
  if (tox > 0) {
    hurtPlayer(tox * dt * (P.antidote ? 0.33 : 1), null, 'toxic', true);
    hint('toxic', P.antidote ? 'Tóxico (el antídoto reduce el daño).' : '¡Zona tóxica! Salí del verde.', 6);
  }
  ui.toxic(tox > 0 ? 0.6 : 0);
  // regeneración fuera de combate
  P.regenT += dt;
  if (P.regenT > PLAYER.regenDelay && P.hp < P.maxHp * Math.max(G.diff.regenCap, 0.0001) && G.diff.regenCap > 0) P.hp = Math.min(P.maxHp * G.diff.regenCap, P.hp + PLAYER.regenRate * dt);
  // pulso
  P.pulseCd = Math.max(0, P.pulseCd - dt);
  if (input.hit('KeyQ', 'btn:pulse')) { if (P.pulseCd <= 0) doPulse(); else sfx.empty(); }
  // barricada
  if (input.hit('KeyF', 'btn:barr')) placeBarricade();
  if (G.scrap >= PLAYER.barricade.cost) hint('barr-tip', 'Tenés chatarra 🔩: F (o BARR.) levanta una barricada delante tuyo.', 0);
  // recarga y disparo
  if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.ammo = WEAPON.mag[G.up.mag]; P.reloadT = 0; } }
  if (input.hit('KeyR') && P.reloadT <= 0) startReload();
  P.zoom = input.down('KeyK') || mouseZoomHeld;
  P.fireCd -= dt;
  P.assist = null;
  const assisted = S.settings.autoAim !== 'off' ? peekAssist() : null;
  P.assist = assisted;
  let wantFire = mouseFire || input.button('fire') || input.down('KeyJ');
  if (!wantFire && input.isTouch && S.settings.autoFire && assisted && Math.hypot(assisted.pos.x - P.pos.x, assisted.pos.z - P.pos.z) < 26) wantFire = true;
  P.firing = wantFire;
  if (wantFire && P.rollT <= 0 && P.fireCd <= 0 && P.hold <= 0) {
    if (P.reloadT > 0) { /* recargando */ }
    else if (P.ammo > 0) shoot();
    else { startReload(); }
  }
  P.recoil = Math.max(0, P.recoil - dt * 10); P.flash = Math.max(0, P.flash - dt);
  // interacciones (tocar o mantener USAR)
  const it = findInteraction();
  if (it && it.hold) {
    if (input.button('use') && it.ok) {
      if (P.holdTarget !== it.obj) { P.holdTarget = it.obj; P.hold = 0; }
      P.hold += dt / it.hold;
      if (it.kind === 'gen') { it.obj.progress = Math.max(it.obj.progress, P.hold); sfx.gen(P.hold); }
      if (P.hold >= 1) { completeHold(it); P.hold = 0; P.holdTarget = null; }
    } else { if (P.holdTarget === it.obj && P.hold > 0) { P.hold = Math.max(0, P.hold - dt * 0.5); if (it.kind === 'gen') it.obj.progress = P.hold; } if (P.hold <= 0) P.holdTarget = null; }
    ui.prompt({ key: input.isTouch ? 'USAR' : 'E', text: it.text + (it.ok ? ' (mantener)' : ''), progress: P.holdTarget === it.obj ? P.hold : (it.kind === 'gen' ? it.obj.progress : 0), ok: it.ok });
  } else {
    if (P.hold > 0) { P.hold = 0; if (P.holdTarget && P.holdTarget.progress !== undefined && !P.holdTarget.restored) P.holdTarget.progress = 0; P.holdTarget = null; }
    if (it) {
      ui.prompt({ key: input.isTouch ? 'USAR' : 'E', text: it.text, ok: it.ok });
      if (input.hit('KeyE', 'btn:use')) interact(it);
    } else ui.prompt(null);
  }
  if (P.hp < P.maxHp * 0.3) { G.lowT -= dt; if (G.lowT <= 0) { G.lowT = 1; sfx.lowhp(); } }
  // latido del acechador
  let nearStalker = 99; for (const e of enemies.all) if (e.alive && e.type === 'stalker') nearStalker = Math.min(nearStalker, Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z));
  if (nearStalker < 10) { G.heartT -= dt; if (G.heartT <= 0) { G.heartT = 0.35 + nearStalker * 0.07; sfx.heart(1 - nearStalker / 10); } }
  tutUpdate(dt, P.moveAmt, P.lookAcc);
  placeCamera(dt * 60);
}
let mouseZoomHeld = false;
game.root.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 2) mouseZoomHeld = true; });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 2) mouseZoomHeld = false; });
/** Objetivo del autoapuntado sin disparar (para asistencia de cámara y disparo automático). */
function peekAssist() { return aimDirection(_f); }
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
const padAllowed = !(/** @type {any} */ (navigator).webdriver) || QS.has('gamepad');
function readPad() {
  if (!padAllowed || !navigator.getGamepads) return null;
  for (const gp of navigator.getGamepads()) {
    if (!gp) continue;
    const x = gp.axes[2] || 0, y = gp.axes[3] || 0;
    if (Math.abs(x) > 0.15 || Math.abs(y) > 0.15) return { x: Math.abs(x) > 0.15 ? x : 0, y: Math.abs(y) > 0.15 ? y : 0 };
  }
  return null;
}

function updateSurvivor(dt) {
  if (!SV.present || !SV.alive || SV.saved) return;
  const W = ctx.W;
  if (!SV.following) { SV.phase += dt * 0.5; return; }
  const dx = P.pos.x - SV.pos.x, dz = P.pos.z - SV.pos.z, d = Math.hypot(dx, dz);
  if (d > 2.6) {
    let dir = _a;
    if (d < 7 && W.los(SV.pos, P.pos, 1.0, true)) dir.set(dx / d, 0, dz / d);
    else if (W.flowDir(flowP, SV.pos, dir) < 0) dir.set(dx / d, 0, dz / d);
    const sp = Math.min(5.6, 3 + d * 0.4);
    SV.pos.addScaledVector(dir, sp * dt);
    SV.yaw = lerpAngle(SV.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 8));
    SV.phase += dt * sp * 1.7;
  }
  W.collide(SV.pos, 0.4);
  // dispara al mutante visible más cercano
  SV.cd -= dt;
  let best = null, bd = 13;
  for (const e of enemies.all) { if (!e.alive || e.state === 'spawn' || e.state === 'swell' || (e.type === 'stalker' && e.alpha < 0.5)) continue; const dd = Math.hypot(e.pos.x - SV.pos.x, e.pos.z - SV.pos.z); if (dd < bd) { bd = dd; best = e; } }
  if (best) {
    SV.yaw = lerpAngle(SV.yaw, Math.atan2(best.pos.x - SV.pos.x, best.pos.z - SV.pos.z), Math.min(1, dt * 10));
    if (SV.cd <= 0 && W.los(SV.pos, best.pos, 1.3)) {
      SV.cd = 0.55;
      _a.set(SV.pos.x, 1.4, SV.pos.z); _b.set(best.pos.x, best.height * 0.55, best.pos.z);
      fx.tracers.shot(_a, _b, 0x9adfff, 0.035);
      enemies.damage(best, 7, SV.pos);
      sfx.shot();
    }
  }
}

/* ======================= dibujo ======================= */
const _sp = V();
function render() {
  const W = ctx.W; if (!W) return;
  enemies.render(G.realT);
  boss.render(G.realT);
  // jugador
  pg.visible = G.state !== 'menu';
  pg.position.set(P.pos.x, 0, P.pos.z);
  pg.rotation.y = P.yaw;
  const walk = Math.sin(P.phase * 2.2) * Math.min(1, Math.hypot(P.vel.x, P.vel.z) / PLAYER.speed);
  pLegL.rotation.x = walk * 0.7; pLegR.rotation.x = -walk * 0.7;
  if (P.rollT > 0) { const k = 1 - P.rollT / PLAYER.roll.time; pBody.rotation.x = k * Math.PI * 2; pBody.position.y = Math.sin(k * Math.PI) * 0.25 - 0.3 * Math.sin(k * Math.PI); }
  else if (G.state !== 'dying') { pBody.rotation.x = 0; pBody.position.y = Math.abs(walk) * 0.04; }
  pGun.rotation.x = -P.pitch * 0.85 - P.recoil * 0.08;
  pGunM.position.z = -P.recoil * 0.06;
  flashMat.opacity = P.flash > 0 && !reduced() ? 1 : P.flash > 0 ? 0.4 : 0;
  muzzleFlash.rotation.z = Math.random() * 3;
  // superviviente
  if (SV.present && SV.alive && !SV.saved) {
    sg.visible = true; sg.position.copy(SV.pos); sg.rotation.y = SV.yaw;
    const w2 = SV.following ? Math.sin(SV.phase * 2.2) : 0;
    sLegL.rotation.x = w2 * 0.7; sLegR.rotation.x = -w2 * 0.7;
    sGun.rotation.x = SV.following ? 0 : 0.9 + Math.sin(G.realT * 2) * 0.1;
  } else sg.visible = false;
  if (G.state === 'menu' || G.state === 'clear' || G.state === 'over' || G.state === 'victory') return;
  // HUD
  const mag = WEAPON.mag[G.up.mag];
  const mods = UPGRADES.map(u => `<span>${u.icon}${/** @type {any} */ (G.up)[u.id]}</span>`).join('');
  ui.status({ hp: Math.max(0, P.hp), maxHp: P.maxHp, rolls: P.rolls, rollMax: PLAYER.roll.charges, pulse: 1 - P.pulseCd / (PLAYER.pulse.cd * (1 - 0.25 * G.up.pulse)),
    ammo: P.ammo, mag, reloading: P.reloadT > 0, reloadK: P.reloadT > 0 ? 1 - P.reloadT / WEAPON.reload[G.up.mag] : 0, scrap: G.scrap, score: G.score, mods });
  ui.vignette(P.hp < P.maxHp * 0.35 ? (reduced() ? 0.35 : 0.35 + 0.25 * Math.sin(G.realT * 6)) : 0);
  ui.fadeDamage(1 / 60);
  ui.zoom(P.zoom);
  ui.boss(boss.active || (boss.phase > 0 && boss.phase < 5), boss.phase === 1 ? 'COLOSO · TANQUES RADIACTIVOS' : boss.phase === 2 ? 'COLOSO · NÚCLEO EXPUESTO' : 'COLOSO · FURIA', boss.bar());
  const ms = MM.state().current.map((/** @type {any} */ m) => {
    const def = MISSIONS.find(x => x.id === m.id);
    return { title: /** @type {any} */ (SHORT)[m.id] || (def && /** @type {any} */ (def).short) || m.title, progress: m.progress, target: def ? def.target : 1, status: m.status, kind: m.kind };
  });
  ui.missions(ms);
  // marcadores
  const list = [];
  const add = (/** @type {THREE.Vector3} */ p, /** @type {number} */ y, /** @type {string} */ icon, /** @type {string} */ color, label = '') => {
    if (list.length >= 10) return;
    _sp.set(p.x, y, p.z).project(camera);
    const w = innerWidth, h = innerHeight;
    let x = (_sp.x * 0.5 + 0.5) * w, yy = (-_sp.y * 0.5 + 0.5) * h;
    const behind = _sp.z > 1;
    let edge = false;
    if (behind) { x = w - x; yy = h - 30; edge = true; }
    const m = 34;
    if (x < m || x > w - m || yy < m + 60 || yy > h - m) edge = true;
    x = clamp(x, m, w - m); yy = clamp(yy, m + 60, h - m);
    const d = Math.round(Math.hypot(p.x - P.pos.x, p.z - P.pos.z));
    list.push({ x, y: yy, edge, icon, color, label: label || d + ' m' });
  };
  const sec = G.sec;
  if (G.arenaIdx === 0) {
    if (sec.stage === 'lift' && W.exit) add(W.exit.pos, 1.5, '⬆', '#a6ff2e', 'ascensor');
    else for (const g of W.gens) if (!g.restored) add(g.pos, 2.3, '⚡', '#ffd23a');
  } else if (G.arenaIdx === 1) {
    for (const g of W.gens) if (!g.restored) add(g.pos, 2.3, '⚡', '#ffd23a');
    if (SV.present && SV.alive && !SV.freed && !SV.saved) add(SV.pos, 2.2, '🙋', '#6ad8ff', 'superviviente');
    if (sec.stage === 'exit' && W.exit) add(W.exit.pos, 1.5, '⬆', '#a6ff2e', 'salida');
  } else {
    if (sec.stage === 'power') for (const g of W.gens) if (!g.restored) add(g.pos, 2.3, '⚡', '#ffd23a');
    if (sec.stage === 'call' && W.terminal) add(W.terminal.pos, 2.0, '📡', '#38c8ff', 'radio');
    if (sec.stage === 'defend') add(BC.pos, 2.6, '🛡', '#ff8a3a', `baliza ${Math.ceil(BC.hp / BC.max * 100)}%`);
    if (sec.stage === 'board' && W.pad) add(W.pad.pos, 1.5, '⬇', '#a6ff2e', `transporte ${Math.ceil(sec.board)} s`);
  }
  if (G.escape) add(G.escape.center, 2.8, '🏃', '#ffffff', 'escape');
  if (W.workbench && G.scrap >= 6 && Math.hypot(W.workbench.pos.x - P.pos.x, W.workbench.pos.z - P.pos.z) < 22) add(W.workbench.pos, 1.8, '🔧', '#d9a020', 'mejoras');
  for (const c of W.crates) if (!c.opened && Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < 11) add(c.pos, 1.2, '📦', '#a6ff2e');
  ui.markers(list);
}

/* ======================= arranque ======================= */
G.menuArena = clamp(S.lastArena, 0, S.unlocked - 1);
loadArena(G.menuArena);
showMenu();
game.start();
A && A.refresh && A.refresh();
addEventListener('pagehide', () => { try { if (MM.state().running) MM.runEnd({ won: false }); } catch (e) { /* nada */ } });
addEventListener('pagehide', () => { try { ctx.W && ctx.W.dispose(); enemies.dispose(); boss.dispose(); } catch (e) { /* nada */ } }, { once: true });

/* ======================= ganchos de prueba ======================= */
const hook = {
  get state() { return G.state; },
  get scene() { return ctx.W ? ARENAS[ctx.W.idx].id : ''; },
  get arena() { return G.arenaIdx; },
  get score() { return G.score; },
  get kills() { return G.kills; },
  get hp() { return Math.round(P.hp * 10) / 10; },
  get player() { return { x: P.pos.x, z: P.pos.z, yaw: P.yaw, pitch: P.pitch, hp: P.hp, maxHp: P.maxHp, ammo: P.ammo, rolling: P.rollT > 0, rolls: P.rolls, pulseCd: P.pulseCd, alive: P.alive, zoom: P.zoom, shots: P.shots, antidote: P.antidote, scrap: G.scrap, up: { ...G.up }, dmg: WEAPON.dmg[G.up.dmg], mag: WEAPON.mag[G.up.mag] }; },
  get missions() { return MM.state(); },
  get campaign() { return JSON.parse(JSON.stringify(S)); },
  get difficulty() { return { id: G.diffId, ...G.diff }; },
  get quality() { return game.quality; },
  get perf() { return { ...game.perf, frames: game.frames, heapMB: /** @type {any} */ (performance).memory ? Math.round(/** @type {any} */ (performance).memory.usedJSHeapSize / 1048576 * 10) / 10 : null }; },
  get counts() {
    const W = ctx.W;
    return { enemies: enemies.count(), runner: enemies.count('runner'), brute: enemies.count('brute'), spitter: enemies.count('spitter'), stalker: enemies.count('stalker'),
      particles: fx.sparks.alive + fx.gore.alive, particleCap: QUALITY[game.quality].particles, props: W ? W.props : 0, lights: W ? W.lights.length : 0,
      shadows: !!(W && W.sun.castShadow), projectiles: enemies.projectiles, puddles: enemies.puddles, barricades: barricades.length, pickups: pickups.length,
      covers: W ? W.covers.filter((/** @type {any} */ c) => c.alive).length : 0, queue: G.queue.length + G.pending.length, telegraphs: fx.tele.count };
  },
  get sec() { const s = G.sec; return { t: s.t, stage: s.stage, wave: s.wave ?? null, eta: s.eta ?? null, board: s.board ?? null, done: !!s.done }; },
  get world() {
    const W = ctx.W; if (!W) return null;
    return {
      gens: W.gens.map((/** @type {any} */ g) => ({ restored: g.restored, progress: g.progress, x: g.pos.x, z: g.pos.z })),
      doors: W.doors.map((/** @type {any} */ d) => ({ id: d.id, state: d.state, open: d.open, hp: d.hp, x: d.center.x, z: d.center.z, exit: d.exit })),
      crates: W.crates.map((/** @type {any} */ c) => ({ opened: c.opened, x: c.pos.x, z: c.pos.z })),
      traps: W.traps.map((/** @type {any} */ t) => ({ state: t.state, kind: t.kind, uses: t.uses, x: t.pos.x, z: t.pos.z, cx: t.console.x, cz: t.console.z, gen: t.gen })),
      spawns: W.spawns.map((/** @type {any} */ s) => ({ x: s.pos.x, z: s.pos.z })),
      workbench: W.workbench ? { x: W.workbench.pos.x, z: W.workbench.pos.z } : null,
      terminal: W.terminal ? { x: W.terminal.pos.x, z: W.terminal.pos.z, used: W.terminal.used } : null,
      exit: W.exit ? { x: W.exit.pos.x, z: W.exit.pos.z } : null, pad: W.pad ? { x: W.pad.pos.x, z: W.pad.pos.z } : null,
      grate: W.grate ? { broken: W.grate.broken, x: W.grate.pos.x, z: W.grate.pos.z } : null,
      antidote: W.antidote ? { taken: W.antidote.taken, x: W.antidote.pos.x, z: W.antidote.pos.z } : null,
      survivor: SV.present ? { alive: SV.alive, freed: SV.freed, following: SV.following, saved: SV.saved, hp: SV.hp, x: SV.pos.x, z: SV.pos.z } : null,
      beacon: { active: BC.active, hp: BC.hp }, barricades: barricades.map(b => ({ hp: b.hp, x: b.pos.x, z: b.pos.z })),
      covers: W.covers.filter((/** @type {any} */ c) => c.alive).map((/** @type {any} */ c) => ({ x: c.pos.x, z: c.pos.z })),
    };
  },
  get boss() { return { phase: boss.phase, state: boss.state, bar: boss.bar(), tanks: boss.tanks.filter(t => t.alive).length, coreHp: boss.B.coreHp, atk: boss.B.atk, covers: boss.B.covers, tides: boss.quads.map(q => q.state), x: boss.B.pos.x, z: boss.B.pos.z }; },
  get tutorial() { return { on: G.tut.on, step: G.tut.step }; },
  get paused() { return game.paused; },
  get settings() { return { ...S.settings }; },
  get session() { return JSON.parse(JSON.stringify(G.session)); },
  get interaction() { const it = G.state === 'play' && ctx.W ? findInteraction() : null; return it ? { kind: it.kind, text: it.text, ok: it.ok } : null; },
};
if (DEBUG) {
  Object.assign(hook, {
    debug: {
      simulate: (/** @type {number} */ s) => game.simulate(s),
      /** Ir a una arena (empieza partida si hace falta). */
      goto(/** @type {number} */ i) { if (G.state === 'menu' || !G.session) { S.unlocked = Math.max(S.unlocked, i + 1); startRun(i); } else { ui.clear.hide(); ui.end.hide(); beginArena(i); } G.state = 'play'; },
      skipTutorial() { endTutorial(true); },
      teleport(/** @type {number} */ x, /** @type {number} */ z) { P.pos.set(x, 0, z); P.vel.set(0, 0, 0); snapCamera(); flowT = 0; },
      /** Coloca al jugador a `dist` del punto mirando hacia él. */
      face(/** @type {number} */ x, /** @type {number} */ z, dist = 2, y = 1) {
        const dx = x - P.pos.x, dz = z - P.pos.z, l = Math.hypot(dx, dz) || 1;
        P.pos.set(x - dx / l * dist, 0, z - dz / l * dist); P.vel.set(0, 0, 0);
        P.yaw = Math.atan2(dx, dz); P.pitch = 0; ctx.W.collide(P.pos, PLAYER.radius);
        // la mira es el centro de la cámara (al hombro): ajustar el yaw para que su rayo pase por el punto
        for (let k = 0; k < 4; k++) { _pivot.set(P.pos.x, 1.95, P.pos.z).addScaledVector(camRight(_right), 0.95); P.yaw = Math.atan2(x - _pivot.x, z - _pivot.z); }
        _pivot.set(P.pos.x, 1.95, P.pos.z).addScaledVector(camRight(_right), 0.95);
        P.pitch = Math.atan2(y - 1.95, Math.hypot(x - _pivot.x, z - _pivot.z)); snapCamera(); flowT = 0;
      },
      look(/** @type {number} */ yaw, /** @type {number} */ pitch) { P.yaw = yaw; P.pitch = pitch; snapCamera(); },
      spawn(/** @type {string} */ type, dist = 8, opts = {}) { camForward(_fwd); _a.set(P.pos.x + Math.sin(P.yaw) * dist, 0, P.pos.z + Math.cos(P.yaw) * dist); const e = enemies.spawn(type, _a, opts); if (e) { e.state = 'move'; e.t = 0; Object.assign(e, opts); } return !!e; },
      spawnAt(/** @type {string} */ type, /** @type {number} */ x, /** @type {number} */ z, opts = {}) { const e = enemies.spawn(type, _a.set(x, 0, z)); if (e) { e.state = 'move'; e.t = 0; Object.assign(e, opts); } return !!e; },
      enemies() { return enemies.all.filter(e => e.alive).map(e => ({ type: e.type, x: e.pos.x, z: e.pos.z, hp: e.hp, max: e.max, state: e.state, alpha: e.alpha, revealed: e.revealed, yaw: e.yaw })); },
      killAll() { for (const e of [...enemies.all]) if (e.alive) enemies.kill(e, 'debug'); },
      clearEnemies() { enemies.clear(); G.queue.length = 0; G.pending.length = 0; },
      freezeDirector(/** @type {boolean} */ v) { G.relief = v ? 1e9 : 0; },
      setHp(/** @type {number} */ hp) { P.hp = hp; },
      damage(/** @type {number} */ n) { P.invuln = 0; P.rollT = 0; hurtPlayer(n, null, 'debug'); },
      invulnerable(/** @type {boolean} */ v) { P.invuln = v ? 1e9 : 0; },
      setScrap(/** @type {number} */ n) { G.scrap = n; },
      restoreGen(/** @type {number} */ i) { const g = ctx.W.gens[i]; if (g && !g.restored) completeHold({ kind: 'gen', obj: g }); },
      callExtraction() { const W = ctx.W; if (W.gens[0] && !W.gens[0].restored) this.restoreGen(0); W.terminal.used = true; G.sec.onCall(); },
      setEta(/** @type {number} */ s) { G.sec.eta = s; },
      spawnBoss() { if (G.arenaIdx !== 2) this.goto(2); if (!G.sec.stage || G.sec.stage === 'power' || G.sec.stage === 'call') this.callExtraction(); G.sec.eta = 0.01; },
      bossDamage(/** @type {string} */ part, /** @type {number} */ n) {
        if (part === 'tanks') { for (const t of boss.tanks) if (t.alive) boss.hit('tank', t, n); return boss.phase; }
        return boss.hit(part, null, n);
      },
      bossPhase(/** @type {number} */ n) { if (n >= 2) for (const t of boss.tanks) if (t.alive) { t.alive = false; t.mesh.visible = false; } if (boss.phase < n) boss.toPhase(n); if (n === 3) boss.B.coreHp = Math.min(boss.B.coreHp, boss.B.coreMax * 0.44); },
      bossAttack(/** @type {string} */ k) { const B = boss.B; B.cd = 99; B.beamCd = 99; B.atk = ''; B.forced = k; return k; },
      waveSkip() { const s = G.sec; if (G.arenaIdx !== 1) return; enemies.clear(); G.queue.length = 0; G.pending.length = 0; if (s.stage === 'pre' || s.stage === 'break') s.breakT = 0; },
      lose() { killPlayer(); },
      board() { const W = ctx.W; if (W.pad) this.teleport(W.pad.pos.x, W.pad.pos.z); },
      openCrate(/** @type {number} */ i) { const c = ctx.W.crates[i]; if (c && !c.opened) interact({ kind: 'crate', obj: c, ok: true }); },
      three: { scene, camera, THREE, renderer },
      flowAt(/** @type {number} */ x, /** @type {number} */ z) { const i = ctx.W.cellIndex(x, z); return i < 0 ? null : flowP[i]; },
    },
  });
}
Object.defineProperty(window, '__' + ID, { value: Object.freeze(hook), configurable: false, writable: false });
