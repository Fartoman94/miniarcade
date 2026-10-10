// @ts-check
/* Reino del Alba — juego principal: estados, jugador cinemático, cámara que no atraviesa paredes, interacción por
   rayo + proximidad, transiciones exterior/interior con fundido, día y noche, guardado versionado, menús,
   misiones del SDK y ganchos de prueba. */
import { createGame, createInput, createSave, screen, toast, clamp, rng, THREE } from '../../matelabs/kit3d.js';
import { GAME_ID, TITLE, ACCENT, DIFF, QUAL, MISSIONS, SAVE_VERSION, SAVE_DEFAULTS, HOURS_PER_SEC, KEY_HELP } from './config.js';
import { createMaterials, makeHumanoid, animateRig, makeQuad, animateQuad } from './models.js';
import { moveCircle, freeAt, segBox3, losBlocked } from './physics.js';
import { buildScene, applySceneQuality, SCENE_NAMES, PARENT, ZONES } from './world.js';
import { createNPCs, NPC_DEFS, ROLES } from './npcs.js';
import { createQuests, QUEST_ORDER } from './quests.js';
import { createCombat } from './combat.js';
import { createFx } from './fx.js';
import { createSfx } from './sfx.js';
import { createUI, createMinimap } from './ui.js';

const W = /** @type {any} */ (window);
const A = W.MLArcade, M = W.MLMissions;
const DEBUG = new URLSearchParams(location.search).has('debug');

/* ======================= guardado ======================= */
const save = createSave(GAME_ID + ':save', SAVE_VERSION, structuredClone(SAVE_DEFAULTS), old => old || {});
const SCENES = ['aldea', 'castillo', 'bosque', 'campos', 'herreria', 'taberna', 'curandera', 'biblioteca', 'trono', 'torre', 'cueva', 'mazmorra'];
/** Repara datos con forma inválida (editados, a medias o de otra versión): nunca bloquea la partida. */
function sanitize() {
  const s = /** @type {any} */ (save.get()), D = /** @type {any} */ (SAVE_DEFAULTS);
  for (const k in D) {
    const dv = D[k], v = s[k];
    if (dv && typeof dv === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (typeof v !== typeof dv || (typeof v === 'number' && !isFinite(v))) s[k] = dv;
  }
  for (const k in s) if (!(k in D)) delete s[k];
  if (!SCENES.includes(s.scene) || s.scene === 'mazmorra') { s.scene = 'aldea'; s.spawn = 'inicio'; }
  s.time = ((s.time % 24) + 24) % 24;
  const inv = s.inv, dI = D.inv;
  for (const k of ['coins', 'ore', 'potions', 'herbs']) inv[k] = Math.max(0, Math.min(9999, Math.floor(Number.isFinite(inv[k]) ? inv[k] : dI[k])));
  if (!inv.items || typeof inv.items !== 'object' || Array.isArray(inv.items)) inv.items = {};
  for (const k in inv.items) if (!Number.isFinite(inv.items[k]) || inv.items[k] < 0) delete inv.items[k];
  for (const k in s.doors) if (s.doors[k] !== 'open' && s.doors[k] !== 'closed') delete s.doors[k];
  for (const k in s.chests) if (!['locked', 'closed', 'opened', 'looted'].includes(s.chests[k])) delete s.chests[k];
  for (const k in s.quests) if (!Number.isFinite(s.quests[k]) || s.quests[k] < 0) delete s.quests[k]; else s.quests[k] = Math.floor(s.quests[k]);
  for (const k in s.picked) s.picked[k] = !!s.picked[k];
  for (const k in s.npcs) if (!s.npcs[k] || typeof s.npcs[k] !== 'object') delete s.npcs[k];
  const f = s.flags;
  if (f.dials && !(Array.isArray(f.dials) && f.dials.length === 3 && f.dials.every(v => v >= 0 && v < 4))) f.dials = [0, 0, 0];
  if (f.code && !(Array.isArray(f.code) && f.code.length === 3 && f.code.every(v => v >= 0 && v < 4))) delete f.code;
  for (const k of ['gates', 'aliados']) if (f[k] && (typeof f[k] !== 'object' || Array.isArray(f[k]))) f[k] = {};
  s.tutorial = { off: !!(s.tutorial && s.tutorial.off), seen: s.tutorial && s.tutorial.seen && typeof s.tutorial.seen === 'object' ? s.tutorial.seen : {} };
  s.opts = { sens: Number.isFinite(s.opts.sens) && s.opts.sens >= 0.3 && s.opts.sens <= 2.5 ? s.opts.sens : 1, invert: !!s.opts.invert, motion: ['auto', 'reduce', 'full'].includes(s.opts.motion) ? s.opts.motion : 'auto' };
}
sanitize(); save.flush();
const S = () => /** @type {any} */ (save.get());
const persist = () => { S().hp = P.hp; save.flush(); };

/* ======================= misiones y dificultad ======================= */
M.setup({ gameId: GAME_ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 6, hud: 'none' });
const diffName = () => /** @type {keyof typeof DIFF} */ (M.difficulty(GAME_ID));
const diff = () => DIFF[diffName()] || DIFF.normal;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => { const m = S().opts.motion; return m === 'reduce' || (m === 'auto' && reducedMQ.matches); };

/* ======================= base ======================= */
const ACTIVE = new Set(['play', 'dialog', 'transition', 'dying']);
let state = 'menu';
const game = createGame({
  id: GAME_ID, title: TITLE, toolbar: 'tr', background: 0x9fd0ef, fov: 55, far: 150,
  help: ['WASD/flechas o joystick: moverte', 'E/Enter o USAR: interactuar, hablar, abrir puertas y cofres', 'Espacio, J o clic: atacar · Shift o K: rodar (esquiva)',
    'F: tomar una poción · L o 📜: diario de misiones', 'Arrastrar mouse/dedo o Q/R: girar la cámara', 'Esc, P o Start: pausa'],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'KeyE', x: 'KeyJ', b: 'KeyK', y: 'KeyF', lb: 'KeyQ', rb: 'KeyR', select: 'KeyL' },
  isActive: () => ACTIVE.has(state),
  update, onRestart, onQuality: () => applyQuality(),
  actions: [
    { label: '📜 Diario de misiones', fn: () => openJournal() },
    { label: '📖 Cómo jugar y tutorial', fn: () => openHelp(true) },
    { label: '🏰 Volver al menú del reino', fn: exitToMenu },
  ],
});
const { scene, camera, renderer } = game;
scene.fog = new THREE.Fog(0xbfe0f0, 22, 70);
const mats = createMaterials();
Object.values(mats).forEach(m => { m.userData.shared = true; });
const blobGeo = new THREE.CircleGeometry(0.45, 12); blobGeo.userData.shared = true;
const hemi = new THREE.HemisphereLight(0xdff1ff, 0x6b8a4a, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 2);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -0.0012;
scene.add(sun, sun.target);
const plights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffb050, 0, 9, 1.6); l.userData.base = 0; scene.add(l); return l; });
const fx = createFx(scene, reduced);
const sfx = createSfx(game.audio, (fn, ms) => setTimeout(fn, ms));
const ui = createUI();
const minimap = createMinimap(ui.els.map);
const rand = rng((Date.now() & 0xffff) ^ 0x5eed);

/* ======================= jugador ======================= */
const PR = makeHumanoid(mats, { shirt: 0x3e6fb0, pants: 0x4a3a2a, hair: 0x6a3a1a, extra: ['belt', 'cape'], extraColor: 0xf2b544, weapon: 'sword', hairStyle: 'short' });
const pBlob = new THREE.Mesh(blobGeo, mats.blob); pBlob.rotation.x = -Math.PI / 2; pBlob.position.y = 0.02; PR.root.add(pBlob);
scene.add(PR.root);
const focusRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.85, 28).rotateX(-Math.PI / 2), mats.focus); focusRing.visible = false; scene.add(focusRing);
const P = {
  x: 0, z: 0, ry: 0, vx: 0, vz: 0, hp: 6, maxHp: 6, alive: true, inv: 0, atkCd: 0, atkT: 0, atkHit: false, rollT: 0, rollCd: 0, rdx: 0, rdz: 0,
  knockT: 0, kx: 0, kz: 0, stepT: 0, moving: 0,
};
const R_PLAYER = 0.36;
let input = createInput(game.root, {
  joystick: 'left', look: true,
  buttons: [{ id: 'use', label: 'USAR' }, { id: 'atk', label: '⚔' }, { id: 'roll', label: '⤳' }, { id: 'potion', label: '🧪' }],
});
if (input.isTouch) document.body.classList.add('ra-touch');
input.showTouch(false);
const useBtn = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="use"]'));
// clic del mouse (sin arrastrar) = atacar
let clickAtk = false;
{ let dx = 0, dy = 0, t0 = 0;
  game.root.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; dx = e.clientX; dy = e.clientY; t0 = performance.now(); });
  game.root.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; if (Math.hypot(e.clientX - dx, e.clientY - dy) < 6 && performance.now() - t0 < 350) clickAtk = true; }); }

/* ======================= partida ======================= */
const run = { time: 0, transitions: 0, lastTransMs: 0, deaths: 0, kills: 0 };
/** @type {any} */ let scn = null;
/** @type {any} */ let focus = null;
/** @type {any} */ let trans = null;
/** @type {any} */ let dlg = null;
let armed = false, dyingT = 0, tipId = '', tipT = 0, moved = 0, bubbleCd = 0, hudAcc = 0, lightAcc = 0, mapAcc = 0;
const cam = { yaw: Math.PI, pitch: 0.78, tx: 0, ty: 1.4, tz: 0, dist: 9, menuA: 0 };
/** temporizadores en tiempo de simulación (deterministas con simulate) */
/** @type {{t:number, fn:()=>void}[]} */ let timers = [];
const later = (sec, fn) => { timers.push({ t: sec, fn }); };
const emit = (ev, v) => { M.emit(ev, v); };

/* contexto compartido con mundo, NPC, misiones y combate */
const G = /** @type {any} */ ({
  THREE, scene, mats, blobGeo, sfx, fx, S, persist, diff, rand, later,
  rng: seed => rng(seed),
  get player() { return P; },
  scn: () => scn, sceneId: () => (scn ? scn.id : ''),
  hour: () => S().time, time: () => run.time,
  qual: () => QUAL[game.quality] || QUAL.medium,
  toast: (t, ms) => toast(t, ms || 2000),
  text: (t, h) => { ui.text(t, h); },
  banner: (k, t) => ui.title(t, k),
  emit,
  addFame(n) { S().fame += n; },
  addCoins(n) { S().inv.coins += n; sfx.coin(); },
  heal(n) { P.hp = Math.min(P.maxHp, P.hp + n); sfx.heal(); fx.burst(P.x, 1.2, P.z, 0x8af08a, 10, 2); },
  raiseMaxHp() { P.maxHp = maxHp(); P.hp = P.maxHp; },
  // mundo
  doorLock: (id, apply) => Q.doorLock(id, apply),
  setDoor(id, st) { S().doors[id] = st; persist(); },
  chestUse: c => Q.chestUse(c),
  act: (id, arg) => Q.act(id, arg),
  label: (id, arg) => Q.label(id, arg),
  gateUsable: id => Q.gateUsable(id),
  usePortal,
  // NPC
  npcOverride: id => Q.npcOverride(id),
  npcMarker: id => Q.npcMarker(id),
  anchorOf(sceneId, anchor) { if (!scn || scn.id !== sceneId) return null; return scn.anchors[anchor] || null; },
  exitToward,
  canBubble: () => state === 'play' && bubbleCd <= 0,
  bubble(id) { const d = NPC_DEFS[id]; bubbleCd = 6; ui.bubble(`${d.icon} ${d.name}: ${GREET[id] ? GREET[id](S()) : '¡Hola!'}`); sfx.talk(); },
  // combate
  hurtPlayer, onEnemyKilled: (k, e) => { run.kills++; Q.onEnemyKilled(k, e); }, onBossDefeated: k => Q.onBossDefeated(k),
  onBossPhase, onBossNear(k) { if (k === 'golem' && !S().tutorial.seen.golem) { S().tutorial.seen.golem = true; toast('⚠ ¡Un gólem de cristal! Esquivá sus golpes rodando (Shift / ⤳)', 2600); } },
  allyStrike,
  spawnBoss, restoreForest, spawnDog, dogHome, showGate, syncDials, victory,
});
const npcs = createNPCs(G); G.npcs = npcs;
const Q = createQuests(G);
const combat = createCombat(G); G.combat = combat;
const maxHp = () => diff().hp + (S().inv.items.amuleto ? 1 : 0);

const GREET = {
  herrero: () => '¡Cuidado con las chispas!', tabernera: () => '¡Pasá, que hay guiso!', guardia: () => 'Todo tranquilo en el puente.', capitan: () => '¡Firmes, aventurero!',
  rey: () => 'Bienvenido a mi sala.', reina: () => 'Qué lindo día para el jardín.', curandera: () => '¿Te duele algo, querido?', bibliotecaria: () => 'Shhh… hola.',
  mercader: () => '¡Ofertas, ofertas!', campesino: s => (s.quests.medicina || 0) < 4 ? 'Cof, cof…' : '¡Buen día!', aprendiz: () => '¡Hola! ¿Viste mi engranaje?', viajero: s => s.flags.canela ? '¡Canela!' : '¿Viste una perrita?',
  tomas: s => s.flags.celda ? '¡Gracias!' : '¡Sacame de acá!', guardia_real1: () => 'Alto… ah, sos vos.', guardia_real2: () => 'Por el rey.',
};

/* ======================= tutorial contextual ======================= */
const TIPS = {
  move: () => input.isTouch ? 'Movete con el <b>joystick</b>. Arrastrá el dedo por la pantalla para girar la cámara.' : 'Movete con <b>WASD</b> o flechas. Arrastrá el mouse o usá <b>Q/R</b> para girar la cámara.',
  interact: () => input.isTouch ? 'Cuando aparece el aviso abajo, tocalo (o <b>USAR</b>) para interactuar.' : 'Mirá hacia algo y apretá <b>E</b> para interactuar.',
  door: () => 'Las puertas con <b>farol</b> se pueden abrir y entrar. Las que tienen <b>tablones cruzados</b> están trabadas.',
  talk: () => 'Los <b>!</b> dorados ofrecen misiones y los <b>◆</b> celestes esperan una entrega. Hablá con todos.',
  combat: () => input.isTouch ? '¡Sombras! Atacá con <b>⚔</b> y esquivá rodando con <b>⤳</b> cuando el piso se pone rojo.' : '¡Sombras! Atacá con <b>Espacio/J/clic</b> y rodá con <b>Shift</b> cuando el piso se pone rojo.',
  potion: () => `Te queda poca vida: tomá una <b>poción</b> con ${input.isTouch ? '🧪' : '<b>F</b>'}.`,
  journal: () => `Tu <b>diario</b> (📜${input.isTouch ? '' : ' o L'}) muestra todas las misiones y dónde seguir.`,
};
function tip(id) {
  const t = S().tutorial;
  if (t.off || t.seen[id] || tipId === id || state !== 'play') return;
  t.seen[id] = true; persist();
  tipId = id; tipT = 11;
  ui.tip(TIPS[id](), a => { if (a === 'skip') { S().tutorial.off = true; persist(); toast('Tutorial desactivado (se reactiva desde «Cómo jugar»)', 2200); } closeTip(); });
  emit('tutorial');
}
function closeTip() { tipId = ''; ui.tip(null); }

/* ======================= escenas ======================= */
function disposeGroup(g) {
  g.traverse(o => {
    const any = /** @type {any} */ (o);
    if (any.geometry && !any.geometry.userData.shared) any.geometry.dispose();
    const ms = Array.isArray(any.material) ? any.material : any.material ? [any.material] : [];
    for (const m of ms) if (!m.userData.shared) m.dispose();
  });
}
function loadScene(id, spawnName, silent = false) {
  const t0 = performance.now();
  if (scn) { scene.remove(scn.group); disposeGroup(scn.group); }
  focus = null; dlg = null; ui.dialog(null); combat.clear(); fx.clear();
  scn = buildScene(id, G);
  scene.add(scn.group);
  const e = scn.env;
  /** @type {any} */ (scene.background).setHex(e.bg); /** @type {any} */ (scene.fog).color.setHex(e.fog);
  applyQuality();
  S().scene = id === 'mazmorra' ? 'castillo' : id; S().spawn = id === 'mazmorra' ? 'puerta:mazmorra' : spawnName;
  placeAtSpawn(spawnName);
  npcs.onSceneLoaded();
  combat.loadScene(scn);
  Q.onSceneLoaded(id);
  placeDog(true); placeAnimals();
  syncDials();
  minimap.setScene(scn);
  armed = false;
  persist();
  run.lastTransMs = performance.now() - t0;
  if (!silent) { ui.title(scn.name, scn.kind === 'zone' ? 'ZONA' : 'INTERIOR'); emit('visit', 1); visited(id); }
}
function visited(id) { const f = S().flags; f.visited = f.visited || {}; if (!f.visited[id]) { f.visited[id] = 1; emit('explore'); } }
function placeAtSpawn(name) {
  let sp = scn.spawns[name];
  if (!sp) { const k = Object.keys(scn.spawns)[0]; sp = scn.spawns[k]; }
  // spawn seguro: si está ocupado, busca el punto libre más cercano en espiral
  let x = sp.x, z = sp.z;
  if (!freeAt(scn.cols, x, z, R_PLAYER + 0.05)) {
    outer: for (let r = 0.5; r <= 5; r += 0.5) for (let a = 0; a < 16; a++) { const tx = sp.x + Math.cos(a * 0.39) * r, tz = sp.z + Math.sin(a * 0.39) * r; if (freeAt(scn.cols, tx, tz, R_PLAYER + 0.05)) { x = tx; z = tz; break outer; } }
  }
  P.x = x; P.z = z; P.ry = sp.ry; P.vx = P.vz = 0; P.rollT = 0; P.knockT = 0;
  cam.yaw = sp.ry + Math.PI; cam.tx = x; cam.tz = z; cam.dist = scn.kind === 'zone' ? 9 : 6.5;
}
function exitToward(sceneId, hop) {
  if (!scn || scn.id !== sceneId) return null;
  if (PARENT[hop] === sceneId) return scn.anchors['puerta:' + hop] || (hop === 'cueva' ? scn.anchors.cuevaBoca : null);
  if (PARENT[sceneId] === hop) return scn.anchors.puerta || [scn.spawns.puerta.x, scn.spawns.puerta.z];
  const E = { aldea: { castillo: 'norte', bosque: 'este', campos: 'sur' }, castillo: { aldea: 'sur' }, bosque: { aldea: 'oeste' }, campos: { aldea: 'norte' } };
  const sp = scn.spawns[(E[sceneId] || {})[hop]];
  return sp ? [sp.x, sp.z] : null;
}
function applyQuality() {
  const q = QUAL[game.quality] || QUAL.medium;
  const f = /** @type {THREE.Fog} */ (scene.fog);
  const inside = scn && scn.env.interior;
  f.near = inside ? 14 : q.fogNear; f.far = inside ? 40 : q.fogFar;
  camera.far = q.far; camera.updateProjectionMatrix();
  if (scn) applySceneQuality(scn, q);
  fx.setCap(q.particles);
  plights.forEach((l, i) => { l.visible = i < q.lights; });
  lightAcc = 1;
}
/** luz del día: color e intensidad según la hora (sólo exteriores) */
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function applyDaylight() {
  if (!scn) return;
  const e = scn.env, h = S().time;
  let k = 1; // 1 = pleno día, 0 = noche
  if (!e.interior) {
    if (h < 5 || h >= 21) k = 0; else if (h < 7) k = (h - 5) / 2; else if (h >= 19) k = 1 - (h - 19) / 2;
  }
  const night = 1 - k;
  hemi.intensity = e.hemi * (0.45 + 0.55 * k); sun.intensity = e.sunI * (0.15 + 0.85 * k);
  hemi.color.setHex(e.sky); hemi.groundColor.setHex(e.ground);
  sun.color.setHex(e.sun).lerp(_c1.setHex(0x8aa0ff), night * 0.6);
  /** @type {any} */ (scene.background).setHex(e.bg).lerp(_c2.setHex(0x0e1428), e.interior ? 0 : night * 0.85);
  /** @type {any} */ (scene.fog).color.copy(scene.background);
  for (const l of plights) l.intensity = l.userData.base * (e.interior ? 1 : 0.35 + night * 1.2);
}
function updateLights() {
  const q = QUAL[game.quality] || QUAL.medium;
  if (!scn) return;
  const L = scn.lights.slice().sort((a, b) => ((a.x - P.x) ** 2 + (a.z - P.z) ** 2) - ((b.x - P.x) ** 2 + (b.z - P.z) ** 2));
  plights.forEach((l, i) => {
    const s = L[i];
    if (!s || i >= q.lights) { l.visible = false; return; }
    l.visible = true; l.position.set(s.x, s.y, s.z); l.color.setHex(s.c); l.userData.base = 6; l.distance = scn.env.interior ? 10 : 12;
  });
  applyDaylight();
}

/* ======================= transiciones ======================= */
function usePortal(portalId) {
  if (state !== 'play' || trans) return false;
  const p = scn.portals.find(o => o.id === portalId);
  if (!p) return false;
  if (p.door && p.door.state !== 'open') return false;
  startTransition(p.to, p.spawn);
  return true;
}
function startTransition(to, spawn) {
  if (trans) return; // evita transiciones dobles
  state = 'transition'; trans = { t: 0, to, spawn, loaded: false };
  ui.fade(true); ui.prompt(null, null); focusRing.visible = false; closeTip();
  sfx.door();
}
function stepTransition(dt) {
  trans.t += dt;
  if (!trans.loaded && trans.t >= 0.26) { trans.loaded = true; loadScene(trans.to, trans.spawn); run.transitions++; ui.fade(false); }
  if (trans.loaded && trans.t >= 0.46) { trans = null; state = 'play'; }
}
function checkPortals() {
  let inAny = false;
  for (const p of scn.portals) {
    if (P.x < p.x0 || P.x > p.x1 || P.z < p.z0 || P.z > p.z1) continue;
    inAny = true;
    if (!armed) continue;
    if (p.door && p.door.state !== 'open') continue;
    if (p.dir && (P.vx * p.dir[0] + P.vz * p.dir[1]) < 0.2) continue;
    startTransition(p.to, p.spawn);
    return;
  }
  if (!inAny) armed = true;
}

/* ======================= ciclo de partida ======================= */
function startRun(fresh) {
  if (fresh) {
    const keep = { opts: S().opts, tutorial: S().tutorial, wins: S().wins };
    save.reset(); Object.assign(save.get(), structuredClone(keep)); sanitize(); persist();
    emit('newGame');
  }
  const s = S(); s.started = true;
  P.maxHp = maxHp(); P.hp = fresh || !(s.hp > 0) ? P.maxHp : Math.min(P.maxHp, s.hp);
  P.alive = true; P.inv = 0; P.atkCd = 0; P.rollT = 0; P.rollCd = 0;
  run.time = 0; run.deaths = 0; run.kills = 0; timers = [];
  closeTip(); dlg = null; ui.dialog(null); trans = null;
  loadScene(s.scene, s.spawn);
  state = 'play';
  menu.hide(); endScreen.hide(); helpScreen.hide(); optScreen.hide(); journalScreen.hide();
  ui.show(true); input.showTouch(true); input.clear(); ui.fade(false);
  M.runStart();
  for (const q of QUEST_ORDER) if (Q.done(q)) emit(Q.QUESTS[q].event);
  A.started();
  moved = 0;
  later(0.4, () => tip('move'));
  persist();
}
function endRun(won) { M.runEnd({ won }); A.ended({ score: S().fame }); }
function onRestart() {
  if (!ACTIVE.has(state)) return;
  endRun(false);
  // reiniciar: vuelve a la plaza con vida completa (el progreso del reino se conserva)
  S().scene = 'aldea'; S().spawn = 'inicio'; S().hp = 0;
  startRun(false);
}
function exitToMenu() {
  if (ACTIVE.has(state)) { A.pause(); A.resume(); }
  if (ACTIVE.has(state)) endRun(false);
  persist();
  showMenu();
}
let godMode = false, manualMode = false;
function hurtPlayer(n, fromX, fromZ) {
  if (godMode) return;
  if (state !== 'play' || !P.alive || P.inv > 0 || P.rollT > 0.06) return;
  P.hp -= n; P.inv = 0.9;
  const dx = P.x - fromX, dz = P.z - fromZ, l = Math.hypot(dx, dz) || 1;
  P.kx = dx / l * 7; P.kz = dz / l * 7; P.knockT = 0.18;
  if (!reduced()) ui.flash();
  fx.shake(0.25); sfx.hurt(); emit('hurt');
  if (P.hp <= 2 && P.hp > 0 && S().inv.potions > 0) tip('potion');
  if (P.hp <= 0) die();
}
function die() {
  P.hp = 0; P.alive = false; state = 'dying'; dyingT = 1.3; run.deaths++;
  sfx.defeat(); emit('death'); fx.burst(P.x, 1, P.z, 0xffd27a, 20, 3);
  ui.dialog(null); dlg = null;
}
function defeat() {
  state = 'defeat'; ui.show(false); input.showTouch(false); ui.title('', ''); focusRing.visible = false;
  endRun(false);
  const lost = Math.floor(S().inv.coins * diff().coinsLost);
  S().inv.coins -= lost; S().scene = 'aldea'; S().spawn = 'inicio'; S().hp = 0; save.flush();
  endScreen.show(`<span class="k3-kicker">EL REINO TE ESPERA</span><h1>TE DESMAYASTE</h1>
    <p>Los aldeanos te llevaron a la plaza. ${lost ? `Perdiste ${lost} 🪙 en la caída.` : 'No perdiste nada.'} Tus misiones, puertas y cofres siguen como los dejaste.</p>
    <div class="ra-menu-prog">⭐ Fama: <b>${S().fame}</b> · Enemigos vencidos: ${run.kills}</div>
    <div class="k3-btnrow"><button class="k3-b" data-retry>↻ Despertar en la aldea</button><button class="k3-b alt" data-menu>🏰 Menú</button></div>`);
}
function victory() {
  if (S().victory || state === 'victory') return;
  S().victory = true; S().wins++; S().fame += 1000; persist();
  state = 'victory'; ui.show(false); input.showTouch(false); focusRing.visible = false; dlg = null; ui.dialog(null);
  sfx.victory(); endRun(true);
  const done = QUEST_ORDER.filter(q => Q.done(q)).length;
  endScreen.show(`<span class="k3-kicker">EL ALBA VUELVE A BRILLAR</span><h1>¡VICTORIA!</h1>
    <p>Rescataste a Tomás, sanaste el Bosque de las Runas y derrotaste a Malvor, el Carcelero. El rey te nombró <b>Protector del Alba</b>.</p>
    <div class="ra-menu-prog">⭐ Fama: <b>${S().fame}</b> · Misiones: ${done}/9 · Cofres: ${Object.values(S().chests).filter(v => v === 'looted').length}/8</div>
    <p style="font-size:13px">Recompensa: tu capa ahora brilla dorada. Podés seguir explorando para terminar lo que falte.</p>
    <div class="k3-btnrow"><button class="k3-b" data-retry>🗺 Seguir explorando</button><button class="k3-b alt" data-menu>🏰 Menú</button></div>`);
}
function onBossPhase(kind, ph) {
  const T = { guardian: { 2: ['FASE 2 · ESCUDO DE RUNAS', 'Destruí los fuegos fatuos para romper el escudo. ¡Cuidado con las raíces!'], 3: ['FASE 3 · FURIA DEL BOSQUE', '¡Más rápido y con más raíces! Rodá a tiempo.'] },
    carcelero: { 2: ['FASE 2 · CADENAS Y ALIADOS', '¡Tus aliados atacan al Carcelero! Alejate de su giro.'] } };
  const t = T[kind] && T[kind][ph]; if (!t) return;
  ui.title(t[0], kind === 'guardian' ? 'GUARDIÁN DEL BOSQUE' : 'MALVOR, EL CARCELERO'); toast(t[1], 3000); emit('bossPhase', ph);
}
function spawnBoss(kind) {
  if (!scn || combat.boss && !combat.boss.dead) return;
  if (kind === 'guardian' && scn.id !== 'bosque') return;
  if (kind === 'carcelero' && scn.id !== 'mazmorra') return;
  const sp = scn.bossSpot;
  combat.spawn(kind, sp.x, sp.z);
  ui.title(kind === 'guardian' ? 'GUARDIÁN DEL BOSQUE' : 'MALVOR, EL CARCELERO', 'JEFE'); sfx.roar(); fx.shake(0.3);
  if (kind === 'carcelero') { const d = scn.doors['mazmorra:in']; if (d && d.state === 'open') d.toggle(); }
  emit('bossStart');
}
function allyStrike(boss) {
  const allies = npcs.inScene().filter(n => (S().flags.aliados || {})[n.id]);
  if (!allies.length) return;
  const n = allies[Math.floor(rand() * allies.length)];
  n.rig.atk = 0.3; n.ry = Math.atan2(boss.x - n.x, boss.z - n.z);
  fx.line(n.x, n.z, (boss.x - n.x) / (Math.hypot(boss.x - n.x, boss.z - n.z) || 1), (boss.z - n.z) / (Math.hypot(boss.x - n.x, boss.z - n.z) || 1), Math.hypot(boss.x - n.x, boss.z - n.z));
  if (combat.damage(boss, diff().allyDmg, n.x, n.z)) toast(`💪 ¡${NPC_DEFS[n.id].name} golpea al Carcelero!`, 1400);
}
function restoreForest() { later(1.6, () => { if (state === 'play' && scn && scn.id === 'bosque') startTransition('bosque', 'claro'); }); }
function showGate(id) {
  const key = { puerta_puente: 'gateAldea', porton: 'gateCastillo', empalizada: 'gateCampos' }[id];
  if (scn && scn.objs[key]) scn.objs[key].group.visible = true;
}
function syncDials() {
  if (!scn || !scn.objs.dials) return;
  const v = S().flags.dials || [0, 0, 0];
  ['dial1', 'dial2', 'dial3'].forEach((id, i) => { const o = scn.objs.dials[id]; o.disc.rotation.y = v[i] * Math.PI / 2; o.sym.material.color.setHex(Q.SYMS[v[i]].c); });
}

/* ======================= perrita Canela y animales ======================= */
const dog = makeQuad(mats, { color: 0xc07a3a, headColor: 0xc8844a, ear: 0x8a4a2a, snout: 0xe8c8a0, size: 0.55, legColor: 0xa86a32 });
dog.root.visible = false; scene.add(dog.root);
const D = { x: 0, z: 0, ry: 0, mode: 'none' };
function placeDog(snapIt) {
  const f = S().flags, q = Q.stage('mascota');
  D.mode = f.canela && q < 3 ? 'follow' : q >= 3 && scn.id === 'aldea' ? 'home' : 'none';
  if (D.mode === 'none') { dog.root.visible = false; return; }
  dog.root.visible = true;
  if (snapIt) { if (D.mode === 'follow') { D.x = P.x - 1; D.z = P.z + 1; } else { D.x = 0.6; D.z = 3.6; } }
}
function spawnDog() { placeDog(true); }
function dogHome() { placeDog(true); }
function updateDog(dt) {
  if (D.mode === 'none') return;
  let tx = 0.6, tz = 3.6;
  if (D.mode === 'follow') { tx = P.x - Math.sin(P.ry) * 1.4; tz = P.z - Math.cos(P.ry) * 1.4; }
  else { const n = npcs.get('viajero'); if (n && n.scene === 'aldea') { tx = n.x + 1; tz = n.z + 0.6; } }
  const dx = tx - D.x, dz = tz - D.z, d = Math.hypot(dx, dz);
  let sp = 0;
  if (d > 0.4) { sp = Math.min(6, d * 2.5); const p = { x: D.x, z: D.z }; moveCircle(scn.cols, p, 0.25, dx / d * sp * dt, dz / d * sp * dt); D.x = p.x; D.z = p.z; D.ry = Math.atan2(dx, dz); }
  if (d > 12) { D.x = tx; D.z = tz; }
  dog.root.position.set(D.x, 0, D.z); dog.root.rotation.y = D.ry; animateQuad(dog, dt, sp);
}
/** @type {any[]} */ let animals = [];
const animalRigs = { oveja: /** @type {any[]} */ ([]), vaca: /** @type {any[]} */ ([]) };
function placeAnimals() {
  for (const k in animalRigs) animalRigs[k].forEach(r => { r.root.visible = false; r.used = false; });
  animals = [];
  if (!scn.animals) return;
  for (const a of scn.animals) {
    let r = animalRigs[a.kind].find(x => !x.used);
    if (!r) { r = a.kind === 'oveja' ? makeQuad(mats, { color: 0xeeeae0, headColor: 0x3a3a3a, ear: 0x3a3a3a, snout: 0x3a3a3a, wool: true, size: 0.9, legColor: 0x3a3a3a }) : makeQuad(mats, { color: 0xf2efe6, spots: true, headColor: 0xf2efe6, snout: 0xe8a8a0, ear: 0xd8d0c0, horns: true, size: 1.35, legColor: 0xd8d0c0 }); scene.add(r.root); animalRigs[a.kind].push(r); }
    r.used = true; r.root.visible = true;
    animals.push({ r, x: a.x, z: a.z, tx: a.x, tz: a.z, t: rand() * 3, ry: rand() * 6 });
  }
}
function updateAnimals(dt) {
  const pen = scn.animalPen;
  for (const a of animals) {
    a.t -= dt;
    if (a.t <= 0 && pen) { a.t = 3 + rand() * 4; a.tx = pen.x0 + rand() * (pen.x1 - pen.x0); a.tz = pen.z0 + rand() * (pen.z1 - pen.z0); }
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz); let sp = 0;
    if (d > 0.2) { sp = 0.6; a.x += dx / d * sp * dt; a.z += dz / d * sp * dt; a.ry = Math.atan2(dx, dz); }
    a.r.root.position.set(a.x, 0, a.z); a.r.root.rotation.y = a.ry; animateQuad(a.r, dt, sp);
  }
}

/* ======================= actualización ======================= */
function update(dt) {
  for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); t.fn(); } }
  if (state === 'journal') { input.takeLook(); input.endStep(); return; }
  if (state === 'menu' || state === 'defeat' || state === 'victory') {
    menuCamera(dt);
    if (scn) { for (const f of scn.tick) f(dt, run.time); npcs.update(dt); }
    PR.root.visible = false;
    fx.update(dt);
    input.takeLook(); input.endStep();
    return;
  }
  PR.root.visible = true;
  run.time += dt; P.inv -= dt; P.atkCd -= dt; P.rollCd -= dt; bubbleCd -= dt;
  S().time = (S().time + HOURS_PER_SEC * dt) % 24;
  if (state === 'play') control(dt);
  else if (state === 'dialog') dialogInput();
  else if (state === 'transition') stepTransition(dt);
  else if (state === 'dying') { dyingT -= dt; PR.body.rotation.x = Math.min(1.4, PR.body.rotation.x + dt * 2); if (dyingT <= 0) { PR.body.rotation.x = 0; defeat(); } }
  if (scn) for (const f of scn.tick) f(dt, run.time);
  npcs.update(dt);
  combat.update(dt, P, state !== 'play');
  updateDog(dt); if (animals.length) updateAnimals(dt);
  fx.update(dt);
  animatePlayer(dt);
  if (state !== 'transition') updateCamera(dt);
  lightAcc += dt; if (lightAcc > 0.5) { lightAcc = 0; updateLights(); }
  hudTick(dt);
  input.endStep();
}

function control(dt) {
  const a = input.axis(), yaw = cam.yaw;
  const fxv = -Math.sin(yaw), fzv = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = rx * a.x + fxv * -a.y, mz = rz * a.x + fzv * -a.y;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const speed = 5.2;
  // rodar
  if (input.hit('ShiftLeft', 'ShiftRight', 'KeyK', 'btn:roll') && P.rollCd <= 0) {
    P.rollT = 0.34; P.rollCd = 0.75;
    const dx = ml > 0.1 ? mx / ml : Math.sin(P.ry), dz = ml > 0.1 ? mz / ml : Math.cos(P.ry);
    P.rdx = dx; P.rdz = dz; P.ry = Math.atan2(dx, dz); sfx.roll(); emit('roll');
  }
  let vx, vz;
  if (P.knockT > 0) { P.knockT -= dt; vx = P.kx; vz = P.kz; }
  else if (P.rollT > 0) { P.rollT -= dt; vx = P.rdx * 10.5; vz = P.rdz * 10.5; }
  else { const k = Math.min(1, dt * 14); P.vx += (mx * speed - P.vx) * k; P.vz += (mz * speed - P.vz) * k; vx = P.vx; vz = P.vz; }
  if (P.rollT <= 0 && P.knockT <= 0 && ml > 0.15) { P.ry = Math.atan2(mx, mz); moved += ml * speed * dt; }
  const bx = P.x, bz = P.z;
  const pos = { x: P.x, z: P.z };
  moveCircle(scn.cols, pos, R_PLAYER, vx * dt, vz * dt);
  P.x = pos.x; P.z = pos.z;
  // velocidad real (para disparar portales sólo si el jugador empuja hacia ellos)
  P.vx = (P.x - bx) / dt; P.vz = (P.z - bz) / dt;
  if (P.rollT > 0 || P.knockT > 0) { P.vx = vx; P.vz = vz; }
  P.moving = Math.hypot(P.x - bx, P.z - bz) / dt;
  if (P.moving > 1 && (P.stepT -= dt) <= 0) { sfx.step(); P.stepT = 0.33; }
  // atacar
  if ((input.hit('Space', 'KeyJ', 'btn:atk') || clickAtk) && P.atkCd <= 0 && P.rollT <= 0) {
    P.atkCd = 0.42; P.atkT = 0.12; P.atkHit = false; PR.atk = 0.3; sfx.swing(); emit('swing');
  }
  clickAtk = false;
  if (P.atkT > 0) { P.atkT -= dt; if (P.atkT <= 0 && !P.atkHit) { P.atkHit = true; const n = combat.playerAttack(P.x, P.z, P.ry); if (n) emit('hit', n); } }
  // poción
  if (input.hit('KeyF', 'btn:potion')) usePotion();
  // diario
  if (input.hit('KeyL', 'Tab')) { openJournal(); return; }
  // interacción
  focus = findFocus();
  if (focus && input.hit('KeyE', 'Enter', 'NumpadEnter', 'btn:use')) interact();
  checkPortals();
  // pistas contextuales
  if (focus) { tip(focus.kind === 'door' ? 'door' : focus.kind === 'npc' ? 'talk' : 'interact'); }
  if (combat.enemies.some(e => !e.dead && e.state !== 'idle' && e.state !== 'wander')) tip('combat');
  if (S().quests.A >= 1 && run.time > 20) tip('journal');
}
function usePotion() {
  const s = S();
  if (s.inv.potions <= 0) { toast('No tenés pociones (Fermín vende en el mercado)', 1600); sfx.denied(); return; }
  if (P.hp >= P.maxHp) { toast('Tu vida está completa', 1200); return; }
  s.inv.potions--; G.heal(diff().potionHeal); emit('potion'); persist();
}

/* ---------- interacción: rayo a 2.4 u + proximidad (táctil) ---------- */
const REACH = 2.4;
/** @type {any[]} */ const npcInters = [];
function npcInteractables() {
  npcInters.length = 0;
  for (const n of npcs.inScene()) {
    if (!n.rig.root.visible) continue;
    npcInters.push({ id: 'npc:' + n.id, kind: 'npc', npc: n.id, x: n.x, z: n.z, y: 1.4, r: 0.75, label: () => `Hablar con ${NPC_DEFS[n.id].name}` });
  }
  return npcInters;
}
function findFocus() {
  const fx0 = Math.sin(P.ry), fz0 = Math.cos(P.ry);
  let best = null, bestScore = Infinity;
  const consider = list => {
    for (const o of list) {
      if (o.can && !o.can()) continue;
      const dx = o.x - P.x, dz = o.z - P.z, d = Math.hypot(dx, dz);
      if (d > REACH + (o.r || 0.7)) continue;
      const along = dx * fx0 + dz * fz0, perp = Math.abs(dx * fz0 - dz * fx0);
      let score = Infinity;
      if (along > -0.2 && along <= REACH + 0.3 && perp <= (o.r || 0.7)) score = along;              // rayo frontal
      else if (d <= REACH && along / Math.max(d, 1e-3) > 0.3) score = 3 + d;                          // cono de proximidad
      else if (d <= 1.25) score = 6 + d;                                                              // muy cerca, cualquier dirección
      if (score < bestScore && !losBlocked(scn.cols, P.x, P.z, o.x, o.z, 1.6)) { best = o; bestScore = score; }
    }
  };
  consider(scn.inters); consider(npcInteractables());
  return best;
}
function interact() {
  const o = focus; if (!o) return false;
  sfx.click(); emit('interact');
  if (o.kind === 'npc') { talk(o.npc); return true; }
  o.use();
  return true;
}

/* ---------- diálogo ---------- */
function talk(id) {
  const d = Q.dialogueFor(id);
  dlg = { npc: id, lines: d.lines, i: 0, choices: d.choices };
  npcs.setTalking(id, true);
  const n = npcs.get(id); P.ry = Math.atan2(n.x - P.x, n.z - P.z);
  state = 'dialog'; input.showTouch(false); ui.prompt(null, null); focusRing.visible = false;
  showLine();
}
function showLine() {
  const def = NPC_DEFS[dlg.npc];
  ui.dialog({ name: def.name, role: def.role, icon: def.icon, text: dlg.lines[dlg.i], idx: dlg.i, total: dlg.lines.length, choices: dlg.choices, touch: input.isTouch }, c => advance(c));
  sfx.talk();
}
function advance(choice = -1) {
  if (!dlg) return;
  const lastLine = dlg.i >= dlg.lines.length - 1;
  if (!lastLine) { dlg.i++; showLine(); return; }
  if (dlg.choices) { if (choice < 0) choice = 0; const c = dlg.choices[choice]; dlg.choices = null; if (c) c.fn(); }
  closeDialog();
}
function closeDialog() {
  if (!dlg) return;
  npcs.setTalking(dlg.npc, false); dlg = null; ui.dialog(null);
  if (state === 'dialog') { state = 'play'; input.showTouch(true); input.clear(); }
}
function dialogInput() {
  if (!dlg) { state = 'play'; return; }
  const last = dlg.i >= dlg.lines.length - 1;
  if (last && dlg.choices) {
    if (input.hit('Digit1', 'Numpad1')) advance(0); else if (input.hit('Digit2', 'Numpad2', 'Escape')) advance(1);
    else if (input.hit('KeyE', 'Enter', 'Space', 'btn:use')) advance(0);
    return;
  }
  if (input.hit('KeyE', 'Enter', 'Space', 'KeyJ', 'btn:use', 'btn:atk')) advance();
}

/* ---------- presentación del jugador y cámara ---------- */
function animatePlayer(dt) {
  PR.root.position.set(P.x, 0, P.z);
  let d = P.ry - PR.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  PR.root.rotation.y += d * Math.min(1, dt * 14);
  if (state !== 'dying') {
    animateRig(PR, dt, P.moving, P.moving > 0.3 ? 'walk' : 'idle');
    PR.body.rotation.x = P.rollT > 0 ? (0.34 - P.rollT) / 0.34 * Math.PI * 2 : 0;
    PR.body.position.y = P.rollT > 0 ? 0.3 - Math.abs(P.rollT - 0.17) : PR.body.position.y;
  }
  PR.root.visible = !(P.inv > 0 && state === 'play' && Math.sin(P.inv * 30) > 0.4 && !reduced());
  if (focus && state === 'play') {
    focusRing.visible = true; focusRing.position.set(focus.x, 0.05, focus.z);
    focusRing.scale.setScalar(focus.kind === 'npc' ? 1 : 0.9 + Math.sin(run.time * 5) * 0.06);
  } else focusRing.visible = false;
}
function updateCamera(dt) {
  const lk = input.takeLook(), o = S().opts;
  if (state === 'play' || state === 'dialog') {
    cam.yaw -= lk.dx * 0.006 * o.sens;
    cam.pitch = clamp(cam.pitch + lk.dy * 0.004 * o.sens * (o.invert ? -1 : 1), 0.35, 1.2);
    if (input.down('KeyQ')) cam.yaw += 2.1 * dt * o.sens;
    if (input.down('KeyR')) cam.yaw -= 2.1 * dt * o.sens;
  }
  const k = Math.min(1, dt * 10);
  cam.tx += (P.x - cam.tx) * k; cam.tz += (P.z - cam.tz) * k; cam.ty = 1.4;
  const inside = scn.kind === 'interior';
  let want = (inside ? 11 : 9.5) * (camera.aspect < 0.8 ? 1.2 : 1) + (combat.boss && !combat.boss.dead ? 2.5 : 0);
  const pitch = inside ? Math.max(cam.pitch, 1.08) : cam.pitch;
  let ox = Math.sin(cam.yaw) * Math.cos(pitch), oy = Math.sin(pitch), oz = Math.cos(cam.yaw) * Math.cos(pitch);
  // interiores sin techo: la cámara se queda dentro de la habitación (sube por encima de las paredes, nunca las cruza)
  if (inside && scn.room) {
    const rm = scn.room;
    let hx = ox * want, hz = oz * want, k = 1;
    if (cam.tx + hx > rm.x1) k = Math.min(k, (rm.x1 - cam.tx) / hx); if (cam.tx + hx < rm.x0) k = Math.min(k, (rm.x0 - cam.tx) / hx);
    if (cam.tz + hz > rm.z1) k = Math.min(k, (rm.z1 - cam.tz) / hz); if (cam.tz + hz < rm.z0) k = Math.min(k, (rm.z0 - cam.tz) / hz);
    k = Math.max(0.04, Math.min(1, k));
    hx *= k; hz *= k; const vy = oy * want;
    want = Math.hypot(hx, vy, hz); ox = hx / want; oy = vy / want; oz = hz / want;
  }
  // la cámara nunca atraviesa paredes: se acerca hasta el primer muro entre el jugador y la posición deseada
  let tmin = 1;
  for (const c of scn.cols) {
    if (!c.on || c.h < 1.5 || c.tag === 'tree' || c.tag === 'prop' || c.tag === 'water' || c.tag === 'field' || c.tag === 'fence' || c.tag === 'post' || c.tag === 'doorleaf') continue;
    const t = segBox3(cam.tx, cam.ty, cam.tz, cam.tx + ox * want, cam.ty + oy * want, cam.tz + oz * want, c);
    if (t < tmin) tmin = t;
  }
  const allowed = Math.max(0.6, want * tmin - 0.35);
  cam.dist = allowed < cam.dist ? allowed : cam.dist + (allowed - cam.dist) * Math.min(1, dt * 2.5);
  const sh = fx.shakeAmt * 0.3;
  camera.position.set(cam.tx + ox * cam.dist + (rand() - 0.5) * sh, cam.ty + oy * cam.dist + (rand() - 0.5) * sh, cam.tz + oz * cam.dist);
  // en interiores mira un poco hacia adelante: se ve más habitación y menos vacío detrás de la pared
  if (inside) { const hl = Math.hypot(ox, oz) || 1; camera.lookAt(cam.tx - ox / hl * 1.8, cam.ty - 0.4, cam.tz - oz / hl * 1.8); camera.position.x -= ox / hl * 1.2; camera.position.z -= oz / hl * 1.2; }
  else camera.lookAt(cam.tx, cam.ty, cam.tz);
  const e = scn.env.sunDir;
  sun.target.position.set(cam.tx, 0, cam.tz); sun.position.set(cam.tx + e[0], e[1], cam.tz + e[2]);
}
function menuCamera(dt) {
  cam.menuA += dt * (reduced() ? 0 : 0.05);
  const r = scn && scn.kind === 'zone' ? 26 : 9;
  camera.position.set(Math.sin(cam.menuA) * r, scn && scn.kind === 'zone' ? 14 : 7, Math.cos(cam.menuA) * r);
  camera.lookAt(0, 1, 0);
  sun.target.position.set(0, 0, 0); sun.position.set(14, 22, 10);
}

/* ======================= HUD ======================= */
function hudTick(dt) {
  if (tipId) { tipT -= dt; if (tipT <= 0 || (tipId === 'move' && moved > 8)) closeTip(); }
  hudAcc += dt; mapAcc += dt;
  if (hudAcc >= 0.1) {
    hudAcc = 0;
    const s = S(), h = s.time, hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
    const icon = h >= 6 && h < 19 ? '☀' : '☾';
    ui.status({ hp: Math.max(0, P.hp), maxHp: P.maxHp, coins: s.inv.coins, potions: s.inv.potions, fame: s.fame, zone: scn ? scn.name : '', clock: `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` });
    const showP = focus && state === 'play';
    ui.prompt(showP ? (input.isTouch ? '' : 'E') : null, showP ? focus.label() : null, () => { if (state === 'play' && focus) interact(); });
    const B = combat.boss;
    ui.boss(B && !B.dead ? { name: B.kind === 'guardian' ? 'GUARDIÁN DEL BOSQUE' : 'MALVOR, EL CARCELERO', label: B.shield ? `Fase ${B.phase} · ¡escudo! destruí los fuegos fatuos` : `Fase ${B.phase}`, frac: Math.max(0, B.hp / B.maxHp) } : null);
    ui.objective(Q.objective());
    if (useBtn) { useBtn.style.borderColor = focus ? '#f2b544' : ''; useBtn.style.background = focus ? 'rgba(242,181,68,.38)' : ''; }
  }
  if (mapAcc >= 0.2 && scn) {
    mapAcc = 0;
    const dots = [];
    for (const n of npcs.inScene()) dots.push({ x: n.x, z: n.z, c: n.marker === 'available' ? '#ffd34a' : n.marker === 'turnIn' ? '#8fe8ff' : '#e8e0d0', r: n.marker !== 'none' ? 3.2 : 2.2 });
    for (const e of combat.enemies) if (!e.dead) dots.push({ x: e.x, z: e.z, c: '#ff5a5a', r: e === combat.boss ? 4 : 2.4 });
    for (const id in scn.chests) if (scn.chests[id].state !== 'looted') dots.push({ x: scn.chests[id].grp.position.x, z: scn.chests[id].grp.position.z, c: '#c0803a', r: 2 });
    minimap.draw({ x: P.x, z: P.z, ry: P.ry }, dots);
  }
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'ra-menu' });
const endScreen = screen('', { accent: ACCENT, id: 'ra-end' }); endScreen.hide();
const helpScreen = screen('', { accent: ACCENT, id: 'ra-help' }); helpScreen.hide();
const optScreen = screen('', { accent: ACCENT, id: 'ra-opts' }); optScreen.hide();
const journalScreen = screen('', { accent: ACCENT, id: 'ra-journal' }); journalScreen.hide();
let newArmed = false;
function diffText() {
  const d = diff();
  return `Vida ${d.hp} ♥ · Daño enemigo ${d.enemyDmg} · Velocidad enemiga ×${d.enemySpeed} · Vida de jefes ×${d.bossHp} · Aviso de ataques ×${d.telegraph} · Poción +${d.potionHeal} ♥ · Precios ×${d.price}`;
}
function showMenu() {
  state = 'menu'; ui.show(false); input.showTouch(false); closeTip(); dlg = null; ui.dialog(null); trans = null; ui.fade(false); focusRing.visible = false;
  endScreen.hide(); helpScreen.hide(); optScreen.hide(); journalScreen.hide();
  const s = S(), cont = s.started;
  const done = QUEST_ORDER.filter(q => Q.done(q)).length;
  newArmed = false;
  menu.show(`<span class="k3-kicker">AVENTURA DE EXPLORACIÓN 3D</span><h1>REINO DEL ALBA</h1>
    <p>Recorré la aldea, el castillo, el bosque y los campos; entrá a las casas, hablá con su gente y rescatá al reino del Carcelero.</p>
    ${cont ? `<div class="ra-menu-prog">📍 ${SCENE_NAMES[s.scene] || ''} · Misiones ${done}/9 · ⭐ ${s.fame}${s.wins ? ' · 🏆 ' + s.wins : ''}</div>` : ''}
    <div class="k3-btnrow"><button class="k3-b" data-go>${cont ? '▶ Continuar' : '▶ Comenzar la aventura'}</button>${cont ? '<button class="k3-b alt" data-new>Nueva partida</button>' : ''}</div>
    <div data-diff></div><div class="ra-dtab" data-dtab>${diffText()}</div>
    <div class="k3-btnrow"><button class="k3-b alt" data-help>📖 Cómo jugar</button><button class="k3-b alt" data-opts>⚙ Opciones</button></div>
    <a class="ra-back" href="Salva_al_rey.html">⟵ Volver a ¡Salva al Rey!</a>
    <div class="ra-credit">CREADO POR <img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  const holder = /** @type {HTMLElement} */ (menu.el.querySelector('[data-diff]'));
  M.difficultyPicker(holder, { onChange: () => { const t = menu.el.querySelector('[data-dtab]'); if (t) t.textContent = diffText(); P.maxHp = maxHp(); } });
  const want = cont ? s.scene : 'aldea';
  if (!scn || scn.id !== want) loadScene(want, cont ? s.spawn : 'inicio', true);
  A.refresh();
}
menu.on('[data-go]', () => { sfx.click(); startRun(false); });
menu.on('[data-new]', () => {
  const b = /** @type {HTMLElement} */ (menu.el.querySelector('[data-new]'));
  if (!newArmed) { newArmed = true; b.textContent = '¿Borrar el progreso? Tocá de nuevo'; return; }
  sfx.click(); startRun(true);
});
menu.on('[data-help]', () => openHelp(false));
menu.on('[data-opts]', () => openOptions());
endScreen.on('[data-menu]', () => showMenu());
endScreen.on('[data-retry]', () => startRun(false));

let fromPause = false;
function openHelp(pause) {
  fromPause = pause;
  if (!pause) menu.hide();
  helpScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:32px">EL REINO</h1>
    <ul class="k3-list">
      <li>🕹 <b>Moverte:</b> ${input.isTouch ? 'joystick izquierdo · arrastrá el dedo para la cámara' : 'WASD o flechas · arrastrá el mouse o Q/R para la cámara'}</li>
      <li>👆 <b>Interactuar:</b> ${input.isTouch ? 'tocá el aviso de abajo o USAR' : 'E o Enter'} — hablar, abrir puertas y cofres, recolectar.</li>
      <li>⚔ <b>Atacar:</b> ${input.isTouch ? '⚔' : 'Espacio, J o clic'} · <b>Rodar:</b> ${input.isTouch ? '⤳' : 'Shift o K'} (sos invulnerable al rodar) · <b>Poción:</b> ${input.isTouch ? '🧪' : 'F'}</li>
      <li>🎮 <b>Gamepad:</b> A usar · X atacar · B rodar · Y poción · LB/RB cámara · Select diario · Start pausa</li>
      <li>🏠 <b>Puertas:</b> las que tienen <b>farol</b> se abren (cerrada → abriéndose → abierta) y llevan a un interior. Las de <b>tablones cruzados</b> están trabadas.</li>
      <li>❗ <b>NPC:</b> el <b>!</b> dorado ofrece una misión; el <b>◆</b> celeste espera una entrega. Cada uno tiene su agenda: el diario dice dónde está.</li>
      <li>🔴 <b>Peligro:</b> el piso rojo avisa un ataque. Salí del área o rodá a tiempo.</li>
      <li>💾 Todo se guarda solo: puertas, cofres, misiones y NPC.</li>
    </ul>
    <div class="k3-btnrow"><button class="k3-b" data-back>Volver</button><button class="k3-b alt" data-retut>Reactivar tutorial</button></div>`);
}
helpScreen.on('[data-back]', closeSub);
helpScreen.on('[data-retut]', () => { S().tutorial = { off: false, seen: {} }; persist(); toast('Tutorial reactivado', 1500); closeSub(); });
function closeSub() {
  helpScreen.hide(); optScreen.hide();
  if (fromPause && ACTIVE.has(state)) { A.pause(); return; }
  if (state === 'menu') showMenu();
}
function openOptions() {
  fromPause = false; menu.hide();
  const o = S().opts;
  optScreen.show(`<span class="k3-kicker">OPCIONES</span><h1 style="font-size:30px">CONTROLES</h1>
    <div class="ra-opts">
      <label>Sensibilidad de cámara <input type="range" min="0.4" max="2" step="0.1" value="${o.sens}" data-sens aria-label="Sensibilidad de cámara"></label>
      <label>Invertir cámara vertical <input type="checkbox" data-invert ${o.invert ? 'checked' : ''}></label>
      <label>Movimiento (sacudidas y destellos) <select data-motion><option value="auto"${o.motion === 'auto' ? ' selected' : ''}>Según el sistema</option><option value="reduce"${o.motion === 'reduce' ? ' selected' : ''}>Reducido</option><option value="full"${o.motion === 'full' ? ' selected' : ''}>Completo</option></select></label>
      <div class="ra-dtab">Sonido y calidad gráfica: botón ⚙ de la barra. ${KEY_HELP.pc}</div>
    </div>
    <div class="k3-btnrow"><button class="k3-b" data-back>Listo</button></div>`);
}
optScreen.on('[data-back]', closeSub);
optScreen.el.addEventListener('input', e => {
  const t = /** @type {HTMLInputElement} */ (e.target), o = S().opts;
  if (t.matches('[data-sens]')) o.sens = +t.value;
  if (t.matches('[data-invert]')) o.invert = t.checked;
  if (t.matches('[data-motion]')) o.motion = /** @type {any} */ (t.value);
  persist();
});
function openJournal() {
  if (state !== 'play') return;
  state = 'journal'; input.showTouch(false); ui.prompt(null, null); focusRing.visible = false;
  const J = Q.journal(), s = S(), it = s.inv.items;
  const ITEM = { llaveAlba: '🗝 Llave del Alba', llaveBronce: '🔑 Llave de bronce', refuerzos: '🔩 Refuerzos', semillas: '🌾 Semillas', engranaje: '⚙ Engranaje', cronica: '📕 Crónica del Alba', tonico: '🧪 Tónico del alba', amuleto: '📿 Amuleto del alba', reliquia: '✦ Reliquia del Alba' };
  const inv = Object.keys(it).filter(k => it[k] > 0).map(k => (ITEM[k] || k) + (it[k] > 1 ? ' ×' + it[k] : ''));
  if (s.inv.ore) inv.push(`⛏ Mineral ×${s.inv.ore}`); if (s.inv.herbs) inv.push(`🌿 Hierbas ×${s.inv.herbs}`);
  journalScreen.show(`<span class="k3-kicker">DIARIO</span><h1 style="font-size:30px">MISIONES</h1>
    <div class="ra-j">${J.map(q => `<div class="${q.main ? 'main' : ''} ${q.done ? 'done' : ''} ${q.locked ? 'locked' : ''}" data-q="${q.id}"><b>${q.main ? '★' : '◆'} ${q.title} ${q.done ? '✔' : `(${q.stage}/${q.total})`}</b>${q.text}${q.where ? `<br><small>📍 ${q.where}</small>` : ''}</div>`).join('')}</div>
    <div class="ra-inv">Mochila: ${inv.length ? inv.join(' · ') : 'vacía'} · 🪙 ${s.inv.coins} · 🧪 ${s.inv.potions}</div>
    <div class="k3-btnrow"><button class="k3-b" data-close>Cerrar (L)</button></div>`);
  emit('journal');
}
journalScreen.on('[data-close]', closeJournal);
journalScreen.el.addEventListener('keydown', e => { if (e.code === 'KeyL' || e.code === 'Tab' || e.code === 'Escape') { e.preventDefault(); closeJournal(); } });
function closeJournal() {
  journalScreen.hide();
  if (state === 'journal') { state = 'play'; input.showTouch(true); input.clear(); }
}
ui.onJournal(() => { if (state === 'play') openJournal(); });
// gamepad A (KeyE) en menús: pulsa el botón enfocado
addEventListener('keydown', e => {
  if (e.code !== 'KeyE' || ACTIVE.has(state)) return;
  const el = /** @type {HTMLElement|null} */ (document.activeElement);
  if (el && el.closest('.k3-screen') && el.tagName === 'BUTTON') el.click();
});

/* ======================= gancho de pruebas ======================= */
const hook = {
  get state() { return state; },
  get scene() { return scn ? scn.id : ''; },
  get sceneKind() { return scn ? scn.kind : ''; },
  get sceneName() { return scn ? scn.name : ''; },
  get missions() { return M.state(); },
  get quests() { const o = {}; for (const q of QUEST_ORDER) o[q] = { stage: Q.stage(q), done: Q.done(q), total: Q.QUESTS[q].stages.length }; return o; },
  get player() { return { x: +P.x.toFixed(3), z: +P.z.toFixed(3), ry: +P.ry.toFixed(3), hp: P.hp, maxHp: P.maxHp, alive: P.alive, rolling: P.rollT > 0 }; },
  get hp() { return P.hp; }, get maxHp() { return P.maxHp; },
  get score() { return S().fame; }, get coins() { return S().inv.coins; }, get inv() { return structuredClone(S().inv); },
  get runTime() { return run.time; }, get simTime() { return game.simTime; }, get paused() { return game.paused; },
  get hour() { return S().time; },
  get transitions() { return run.transitions; }, get lastTransitionMs() { return run.lastTransMs; }, get buildMs() { return scn ? scn.buildMs : 0; },
  get tip() { return tipId; },
  get focus() { return focus ? { id: focus.id, kind: focus.kind, label: focus.label() } : null; },
  get dialog() { return dlg ? { npc: dlg.npc, i: dlg.i, total: dlg.lines.length, line: dlg.lines[dlg.i], choices: dlg.choices ? dlg.choices.map(c => c.label) : null } : null; },
  get camDist() { return cam.dist; }, get camYaw() { return cam.yaw; },
  get camera() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z }; },
  get npcs() { return Object.values(npcs.list).map(n => ({ id: n.id, role: n.def.role, name: n.def.name, scene: n.scene, state: n.state, x: +n.x.toFixed(2), z: +n.z.toFixed(2), ry: +n.ry.toFixed(3), marker: n.marker, talking: n.talking, extra: !!n.def.extra })); },
  get roles() { return ROLES.slice(); },
  get doors() { if (!scn) return {}; const o = {}; for (const k in scn.doors) o[k] = { state: scn.doors[k].state, t: +scn.doors[k].t.toFixed(2), rot: +scn.doors[k].pivot.rotation.y.toFixed(3) }; return o; },
  get chests() { if (!scn) return {}; const o = {}; for (const k in scn.chests) o[k] = scn.chests[k].state; return o; },
  get portals() { return scn ? scn.portals.map(p => ({ id: p.id, to: p.to })) : []; },
  get interactables() { return scn ? scn.inters.map(i => ({ id: i.id, kind: i.kind, label: i.label() })) : []; },
  get enemies() { return combat.enemies.map(e => ({ kind: e.kind, hp: e.hp, state: e.state, dead: e.dead, x: +e.x.toFixed(2), z: +e.z.toFixed(2) })); },
  get boss() { const B = combat.boss; return B ? { kind: B.kind, phase: B.phase, hp: B.hp, maxHp: B.maxHp, shield: !!B.shield, dead: B.dead, state: B.state } : null; },
  get counts() {
    if (!scn) return {};
    let inst = 0; for (const k in scn.meshes) inst += scn.meshes[k].count;
    return { npcs: npcs.inScene().length, enemies: combat.alive(), colliders: scn.cols.length, interactables: scn.inters.length, portals: scn.portals.length, doors: Object.keys(scn.doors).length, chests: Object.keys(scn.chests).length, instances: inst, particles: fx.count, telegraphs: combat.teleCount };
  },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...game.perf, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames: game.frames }; },
  get quality() { const q = QUAL[game.quality]; let inst = 0; if (scn) for (const k in scn.meshes) inst += scn.meshes[k].count; return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, lights: plights.filter(l => l.visible).length, instances: inst, fogFar: /** @type {any} */ (scene.fog).far, particleCap: fx.cap, farNpcHz: q.farNpcHz }; },
  get difficulty() { return { name: diffName(), ...diff() }; },
  get save() { return structuredClone(S()); },
  get code() { return DEBUG ? (S().flags.code || null) : undefined; },
  get room() { return scn && scn.room ? { ...scn.room } : null; },
  get loadedScenes() { return scene.children.filter(c => c.name.startsWith('scene:')).length; },
  get toastText() { const t = document.querySelector('.k3-toast'); return t ? t.textContent : ''; },
};
if (DEBUG) {

  /** @type {any} */ (hook).debug = {
    goto(id, spawn) { if (state === 'menu') startRun(false); trans = null; loadScene(id, spawn || Object.keys(buildSpawnNames(id))[0] || 'puerta'); state = 'play'; P.alive = true; },
    simulate(sec) { game.simulate(sec); },
    teleport(x, z) { P.x = x; P.z = z; P.vx = P.vz = 0; cam.tx = x; cam.tz = z; },
    face(ry) { P.ry = ry; },
    /** coloca al jugador mirando al objetivo (id de interactuable, 'npc:<id>' o 'door:<id>') */
    approach(id) {
      let o = scn.inters.find(i => i.id === id);
      if (!o && id.startsWith('npc:')) { const n = npcs.get(id.slice(4)); if (n && n.scene === scn.id) o = { x: n.x, z: n.z }; }
      if (!o) return false;
      // prueba puntos alrededor del objetivo hasta que el rayo de interacción lo elija a él
      for (const r of [1.2, 1.6, 2.0]) for (let a = 0; a < 16; a++) {
        const ang = a * Math.PI / 8, x = o.x + Math.sin(ang) * r, z = o.z + Math.cos(ang) * r;
        if (!freeAt(scn.cols, x, z, R_PLAYER + 0.02) || losBlocked(scn.cols, x, z, o.x, o.z, 1.6)) continue;
        P.x = x; P.z = z; P.vx = P.vz = 0; P.ry = Math.atan2(o.x - x, o.z - z); cam.tx = x; cam.tz = z;
        focus = findFocus();
        if (focus && focus.id === id) return true;
      }
      return false;
    },
    interact() { if (state !== 'play') return false; focus = findFocus(); return interact(); },
    use(id) { if (!this.approach(id)) return false; return this.interact(); },
    /** va a la escena del NPC, se acerca y lo saluda (mismo camino que la tecla E) */
    talk(id) {
      const n = npcs.get(id); if (!n) return false;
      if (state === 'dialog') closeDialog();
      if (n.scene !== scn.id) this.goto(n.scene);
      if (!this.approach('npc:' + id)) return false;
      return this.interact();
    },
    advance(c = -1) { advance(c); },
    finishDialog() { let g = 0; while (dlg && g++ < 20) advance(0); },
    closeDialog() { closeDialog(); },
    portal(id) { const p = scn.portals.find(o => o.id === id); if (!p) return false; if (p.door && p.door.state !== 'open') return false; startTransition(p.to, p.spawn); return true; },
    give(item, n = 1) { const it = S().inv.items; it[item] = (it[item] || 0) + n; persist(); },
    setInv(k, v) { S().inv[k] = v; persist(); },
    setHP(n) { P.hp = n; }, setHour(h) { S().time = h; npcs.placeAll(); },
    hurt(n) { P.inv = 0; P.rollT = 0; hurtPlayer(n, P.x + 1, P.z); },
    killAll() { for (const e of combat.enemies) if (!e.dead && e !== combat.boss) combat.kill(e); },
    killMinions() { for (const e of combat.enemies) if (!e.dead && e.minion) combat.kill(e); },
    bossHit(n = 1) { const B = combat.boss; if (B) for (let i = 0; i < n; i++) { if (B.state === 'roar') B.t = 0, B.state = 'chase'; combat.damage(B, 1, B.x + 1, B.z); } },
    golem() { return combat.enemies.find(e => e.kind === 'golem') ? 1 : 0; },
    hitEnemy(kind, n = 1) { const e = combat.enemies.find(x => x.kind === kind && !x.dead); if (e) for (let i = 0; i < n; i++) combat.damage(e, 1, e.x + 1, e.z); return !!e; },
    setDials(a) { S().flags.dials = a.slice(); syncDials(); },
    door(id) { const d = scn.doors[id] || scn.doors[id + ':in']; if (d) d.toggle(); return !!d; },
    dial(i) { return this.use('dial' + i); },
    victory() { victory(); },
    /** tiempo manual: detiene el bucle real; sólo avanza con simulate() (pruebas deterministas en CI lento) */
    manual(on = true) { manualMode = !!on; if (on) game.stop(); else game.start(); },
    god(on = true) { godMode = !!on; },
    setCam(yaw, pitch) { cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; },
    /** ¿el NPC está en un lugar libre (sin pisar paredes)? */
    npcFree(id) { const n = npcs.get(id); return !!n && freeAt(scn.cols.filter(c => c.tag !== 'door' && c.tag !== 'doorleaf'), n.x, n.z, 0.2); },
    /** ¿el segmento cámara→jugador cruza algún muro? */
    camClear() { for (const c of scn.cols) { if (!c.on || c.h < 1.5 || c.tag === 'tree' || c.tag === 'prop' || c.tag === 'water' || c.tag === 'field' || c.tag === 'fence' || c.tag === 'post' || c.tag === 'doorleaf') continue; const t = segBox3(cam.tx, cam.ty, cam.tz, camera.position.x, camera.position.y, camera.position.z, c); if (t < 0.97) return false; } return true; },
    defeatNow() { P.inv = 0; P.rollT = 0; hurtPlayer(99, P.x + 1, P.z); },
  };
}
/** nombres de spawns de una escena (para goto sin argumento) */
function buildSpawnNames(id) { return ({ aldea: { inicio: 1 }, castillo: { sur: 1 }, bosque: { oeste: 1 }, campos: { norte: 1 } })[id] || { puerta: 1 }; }
W['__' + GAME_ID] = Object.freeze(hook);

/* ======================= arranque ======================= */
showMenu();
applyQuality();
game.start();
void ZONES; void rng;
