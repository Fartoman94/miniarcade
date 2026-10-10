// @ts-check
/* BASTIONES ELEMENTALES — tower defense 3D de MiniArcade (MateLabs).
   Bucle: construir torres elementales en plataformas, combinarlas (sinergias), desviar la ruta con palancas de puente,
   cosechar cristales auxiliares y resistir las oleadas de 3 escenarios hasta detener al Titán Elemental. */
import * as THREE from 'three';
import { createGame, createInput, createSave, toast, clamp, lerp, disposeTree } from '../../matelabs/kit3d.js';
import {
  ID, TITLE, ACCENT, SAVE_KEY, SAVE_VERSION, TILE, MAPS, TOWERS, TOWER_ORDER, ENEMIES, DIFFICULTY, QUALITY, MISSIONS,
  AUX, WAVE_BONUS, PRIORITIES, TITAN,
} from './config.js';
import { createMaterials } from './models.js';
import { buildWorld, toWorld, tileOf } from './world.js';
import { createFx } from './fx.js';
import { createEnemies } from './enemies.js';
import { createTowers } from './towers.js';
import { createBoss } from './boss.js';
import { createUI, keyName } from './ui.js';
import { createSfx } from './sfx.js';

const A = /** @type {any} */ (window).MLArcade;
const MM = /** @type {any} */ (window).MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_BINDS = { wave: 'Space', speed: 'KeyT', upgrade: 'KeyU', sell: 'KeyX' };

/* ======================= guardado ======================= */
const DEFAULTS = {
  unlocked: 1, mapSel: 0, wavesTotal: 0, defended: false, titan: false, wins: 0, runs: 0, kills: 0, best: /** @type {any[]} */ ([null, null, null]),
  checkpoint: /** @type {any} */ (null),
  settings: { pan: 1, zoom: 1, invert: false, motion: 'auto', ranges: false, binds: { ...DEFAULT_BINDS } },
  tutorial: { done: false },
};
const save = createSave(SAVE_KEY, SAVE_VERSION, DEFAULTS);
function sanitize() {
  const d = /** @type {any} */ (save.get());
  for (const k of Object.keys(d)) if (!(k in DEFAULTS)) delete d[k];
  const num = (v, def, lo, hi) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : def);
  d.unlocked = Math.round(num(d.unlocked, 1, 1, 3)); d.mapSel = Math.round(num(d.mapSel, 0, 0, 2));
  d.wavesTotal = Math.round(num(d.wavesTotal, 0, 0, 1e6)); d.wins = num(d.wins, 0, 0, 1e6); d.runs = num(d.runs, 0, 0, 1e9); d.kills = num(d.kills, 0, 0, 1e9);
  d.defended = d.defended === true; d.titan = d.titan === true;
  const b = Array.isArray(d.best) ? d.best : [];
  d.best = [0, 1, 2].map(i => { const x = b[i]; return x && typeof x === 'object' ? { waves: Math.round(num(x.waves, 0, 0, 20)), won: x.won === true, score: Math.round(num(x.score, 0, 0, 1e9)) } : null; });
  if (d.mapSel >= d.unlocked) d.mapSel = d.unlocked - 1;
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const bi = s.binds && typeof s.binds === 'object' ? s.binds : {};
  const okKey = v => typeof v === 'string' && /^(Key[A-Z]|Digit[0-9]|Space|Enter|Tab|ShiftLeft|Backspace)$/.test(v) && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyP', 'KeyR', 'KeyZ', 'KeyC', 'Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(v);
  d.settings = {
    pan: num(s.pan, 1, 0.5, 2), zoom: num(s.zoom, 1, 0.5, 2), invert: s.invert === true, motion: ['auto', 'on', 'off'].includes(s.motion) ? s.motion : 'auto', ranges: s.ranges === true,
    binds: { wave: okKey(bi.wave) ? bi.wave : DEFAULT_BINDS.wave, speed: okKey(bi.speed) ? bi.speed : DEFAULT_BINDS.speed, upgrade: okKey(bi.upgrade) ? bi.upgrade : DEFAULT_BINDS.upgrade, sell: okKey(bi.sell) ? bi.sell : DEFAULT_BINDS.sell },
  };
  d.tutorial = { done: !!(d.tutorial && d.tutorial.done === true) };
  const c = d.checkpoint;
  if (c && (typeof c !== 'object' || !(c.map >= 0 && c.map < 3) || !(c.wave >= 0 && c.wave < MAPS[c.map].waves.length) || !Array.isArray(c.towers) || typeof c.gold !== 'number' || c.map >= d.unlocked)) d.checkpoint = null;
  save.flush();
}
sanitize();
const S = /** @type {typeof DEFAULTS} */ (save.get());
const reduced = () => S.settings.motion === 'on' || (S.settings.motion === 'auto' && prefersReduced);

/* ======================= estado ======================= */
const G = {
  state: 'menu', map: S.mapSel, gold: 0, crystal: 20, crystalMax: 20, score: 0, kills: 0, runTime: 0,
  diffId: 'normal', diff: DIFFICULTY.normal,
  waveIdx: 0, wavesDone: 0, phase: 'prep', countdown: 0, clock: 0, speed: 1, moves: 3,
  /** @type {{total:number, spawned:number, alive:number, done:boolean, titan:boolean}[]} */ waves: [],
  /** @type {{t:number,type:string,spawn:number,elite:boolean,wave:number}[]} */ queue: [],
  fireBuilt: false, auxLost: false, maxed: 0, combos: 0, harvests: 0, leaks: 0,
  /** @type {{kind:string, ref:any}|null} */ sel: null, moveTower: /** @type {any} */ (null),
  overlay: '', shake: 0, endT: 0, endWon: false, rerouteT: 0, thunderT: 8, flashT: 0,
  tut: { on: false, step: 0, waitT: 0 },
  /** @type {{t:number, fn:()=>void}[]} */ later: [],
  lastInput: 'mouse', record: false, enterUsed: false,
};

/* ======================= motor ======================= */
const game = createGame({
  id: ID, title: TITLE, accent: ACCENT, toolbar: 'tr', background: 0x0d0a1a, fov: 50, far: 260,
  help: [
    'Objetivo: que ninguna oleada llegue al cristal 💎. Superá los 3 escenarios y detené al Titán Elemental.',
    'Tocá/hacé clic en una plataforma ◇ para construir: Ballesta, Fuego, Hielo o Rayo. Tocá una torre para mejorarla, venderla o reubicarla.',
    'Sinergias: fuego+hielo = choque térmico · hielo+rayo = conducción · fuego+rayo = sobrecarga.',
    'Palancas ⚙: giran el puente y cambian la ruta enemiga. Cristales 💠: tocá los que brillan para cosechar esencia.',
    'PC: arrastrar/WASD mover · rueda o Z/C zoom · Q/E o clic derecho girar · 1-4 torres · U mejorar · X vender · Espacio oleada · T velocidad.',
    'Táctil: un dedo mueve, pellizco hace zoom, dos dedos giran · botones ▶▶ oleada y x2 velocidad.',
    'Gamepad: stick mueve · A elegir (retícula) · B cerrar · X mejorar · Y oleada · LB/RB girar · LT/RT zoom.',
  ],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'Enter', b: 'Backspace', x: 'KeyU', y: 'Space', lb: 'KeyQ', rb: 'KeyE', lt: 'KeyZ', rt: 'KeyC', select: 'KeyT' },
  isActive: () => G.state === 'play' || G.state === 'cine',
  update, render, onRestart, onQuality,
  actions: [
    { label: '❓ Cómo jugar y tutorial', fn: () => openOverlay('help') },
    { label: '🎮 Controles', fn: () => openOverlay('opts') },
  ],
});
const { scene, camera, renderer } = game;
const input = createInput(game.root, { buttons: [
  { id: 'wave', label: '▶▶', key: 'Space' }, { id: 'speed', label: 'x1', key: 'KeyT' },
  { id: 'rotl', label: '⟲', key: 'KeyQ' }, { id: 'rotr', label: '⟳', key: 'KeyE' }] });
input.showTouch(false);
const sfx = createSfx(game.audio);
const mats = createMaterials();

// luces y cielo
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.4); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-18, 30, 14); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 22, bottom: -22, near: 1, far: 80 }); sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
scene.fog = new THREE.Fog(0x000000, 40, 120);

const fx = createFx(scene, reduced);
const ctx = /** @type {any} */ ({
  THREE, scene, mats, camera, fx, sfx, W: null, qcfg: QUALITY.medium,
  get diff() { return G.diff; },
  popup, later: (t, fn) => G.later.push({ t, fn }), banner: (k, t, sub, boss) => ui.banner(k, t, sub, boss),
  shake: a => { if (!reduced()) G.shake = Math.max(G.shake, a); },
  onKill, onLeak, onCombo, hurtAux, onTitanDown, reroute, telegraphReroute, spawnNear, emitPhase: p => MM.emit('titanPhase', p + 1),
});
const enemies = createEnemies(ctx); ctx.enemies = enemies;
const towers = createTowers(ctx); ctx.towers = towers;
const boss = createBoss(ctx); ctx.boss = boss;

// selección, hover y alcance
const selRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.18, 40), mats.ring); selRing.rotation.x = -Math.PI / 2; selRing.position.y = 0.36; selRing.visible = false; selRing.renderOrder = 4; scene.add(selRing);
const hoverMat = mats.ring.clone(); hoverMat.opacity = 0.35;
const hoverRing = new THREE.Mesh(selRing.geometry, hoverMat); hoverRing.rotation.x = -Math.PI / 2; hoverRing.position.y = 0.34; hoverRing.visible = false; scene.add(hoverRing);
const rangeDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mats.range); rangeDisc.rotation.x = -Math.PI / 2; rangeDisc.position.y = 0.06; rangeDisc.visible = false; rangeDisc.renderOrder = 1; scene.add(rangeDisc);
const rangeEdge = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), mats.rangeEdge); rangeEdge.rotation.x = -Math.PI / 2; rangeEdge.position.y = 0.07; rangeEdge.visible = false; scene.add(rangeEdge);
const allRangeGeo = new THREE.RingGeometry(0.97, 1, 64); allRangeGeo.rotateX(-Math.PI / 2);
const allRanges = new THREE.InstancedMesh(allRangeGeo, mats.rangeEdge, 24); allRanges.count = 0; allRanges.frustumCulled = false; scene.add(allRanges);
let previewType = '';

/* ======================= UI ======================= */
const ui = createUI({ isTouch: input.isTouch, on: onUi });
MM.setup({ gameId: ID, missions: MISSIONS, primaryPerRun: 3, secondaryPerRun: 3, hud: 'none' });
MM.on(/** @param {any} ev */ ev => { if (ev.type === 'complete') { sfx.harvest(); } refreshMissions(); });
ui.setKeys(S.settings.binds);

/* ======================= cámara ======================= */
const cam = { x: 0, z: 0, dist: 40, yaw: 0, tx: 0, tz: 0, tdist: 40, tyaw: 0, orbit: false, focus: /** @type {any} */ (null) };
const DMIN = 12, DMAX = 74;
const pitchOf = d => lerp(0.86, 1.12, clamp((d - DMIN) / (DMAX - DMIN), 0, 1));
function fitDist(yaw) {
  const vf = THREE.MathUtils.degToRad(camera.fov), asp = Math.max(0.3, camera.aspect);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
  const portrait = Math.abs(Math.sin(yaw)) > 0.7;
  const wx = portrait ? 26 : 40, wz = portrait ? 40 : 26;
  const p = 1.0;
  const d1 = (wx / 2 + 1.5) / Math.tan(hf / 2), d2 = (wz / 2 * Math.sin(p) + 2) / Math.tan(vf / 2);
  return clamp(Math.max(d1, d2) * 1.02 + (portrait ? 8 : 0), DMIN, DMAX);
}
function frameMap(instant = false) {
  const portrait = innerHeight > innerWidth * 1.05;
  cam.tyaw = portrait ? Math.PI / 2 : 0;
  cam.tdist = fitDist(cam.tyaw); cam.tx = portrait ? 6 : 0; cam.tz = portrait ? 0 : 1.5;
  if (instant) { cam.x = cam.tx; cam.z = cam.tz; cam.dist = cam.tdist; cam.yaw = cam.tyaw; }
}
function applyCamera() {
  const p = pitchOf(cam.dist);
  let sx = 0, sz = 0;
  if (G.shake > 0) { sx = (Math.random() - 0.5) * G.shake; sz = (Math.random() - 0.5) * G.shake; }
  camera.position.set(cam.x + Math.sin(cam.yaw) * Math.cos(p) * cam.dist + sx, Math.sin(p) * cam.dist, cam.z + Math.cos(cam.yaw) * Math.cos(p) * cam.dist + sz);
  camera.lookAt(cam.x + sx * 0.5, 0, cam.z + sz * 0.5);
  camera.updateMatrixWorld();
}
function clampCam() {
  const W = ctx.W; if (!W) return;
  cam.tx = clamp(cam.tx, W.bounds.x0 + 2, W.bounds.x1 - 2); cam.tz = clamp(cam.tz, W.bounds.z0 + 2, W.bounds.z1 - 2);
  cam.tdist = clamp(cam.tdist, DMIN, DMAX);
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
/** Punto del suelo (o a la altura h) bajo una posición de pantalla. */
function groundAt(cx, cy, h = 0) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  plane.constant = -h;
  return ray.ray.intersectPlane(plane, hitP) ? { x: hitP.x, z: hitP.z } : null;
}
const _proj = new THREE.Vector3();
function toScreen(x, y, z) {
  _proj.set(x, y, z).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + (_proj.x + 1) / 2 * r.width, y: r.top + (1 - _proj.y) / 2 * r.height, vis: _proj.z < 1 && _proj.z > -1 };
}

/* ======================= entrada: puntero ======================= */
const pointers = new Map();
let gesture = /** @type {any} */ (null);
const el = game.root;
el.addEventListener('contextmenu', e => e.preventDefault());
el.addEventListener('pointerdown', e => {
  if (G.state !== 'play' && G.state !== 'cine') return;
  G.lastInput = e.pointerType === 'touch' ? 'touch' : 'mouse';
  ui.setReticle(false);
  try { el.setPointerCapture(e.pointerId); } catch (_) { /* nada */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), btn: e.button, type: e.pointerType });
  if (G.state === 'cine') { skipCine(); return; }
  startGesture();
});
el.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse' && G.state === 'play') hoverAt(e.clientX, e.clientY); return; }
  p.x = e.clientX; p.y = e.clientY;
  if (Math.hypot(p.x - p.sx, p.y - p.sy) > (p.type === 'touch' ? 12 : 7)) p.moved = true;
  moveGesture();
});
const endPointer = (/** @type {PointerEvent} */ e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  pointers.delete(e.pointerId);
  const tap = gesture && gesture.n === 1 && !gesture.multi && !p.moved && performance.now() - p.t < 700 && e.type === 'pointerup' && p.btn === 0;
  if (tap && G.state === 'play') pickAt(e.clientX, e.clientY);
  startGesture();
};
el.addEventListener('pointerup', endPointer); el.addEventListener('pointercancel', endPointer);
el.addEventListener('wheel', e => {
  if (G.state !== 'play') return;
  e.preventDefault();
  cam.tdist *= 1 + clamp(e.deltaY, -120, 120) * 0.0011 * S.settings.zoom;
  clampCam();
}, { passive: false });

function startGesture() {
  const ps = [...pointers.values()];
  if (!ps.length) { gesture = null; return; }
  const n = ps.length;
  const mx = ps.reduce((a, p) => a + p.x, 0) / n, my = ps.reduce((a, p) => a + p.y, 0) / n;
  applyCamera();
  const g0 = groundAt(mx, my);
  gesture = { n, multi: (gesture && gesture.multi && n > 0) || n > 1, mx, my, gx: g0 ? g0.x : 0, gz: g0 ? g0.z : 0,
    d: n > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, a: n > 1 ? Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x) : 0, rot: n === 1 && ps[0].btn === 2, lx: mx };
}
function moveGesture() {
  if (!gesture) return;
  const ps = [...pointers.values()];
  if (ps.length !== gesture.n) { startGesture(); return; }
  const n = ps.length;
  const mx = ps.reduce((a, p) => a + p.x, 0) / n, my = ps.reduce((a, p) => a + p.y, 0) / n;
  if (n === 1 && !ps[0].moved) return;
  if (gesture.rot) {
    cam.tyaw -= (mx - gesture.lx) * 0.008 * S.settings.pan; cam.yaw = cam.tyaw; gesture.lx = mx;
    return;
  }
  if (n > 1) {
    const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), a = Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x);
    if (gesture.d > 10) { cam.tdist = clamp(cam.tdist * gesture.d / Math.max(10, d), DMIN, DMAX); cam.dist = cam.tdist; }
    let da = a - gesture.a; da = Math.atan2(Math.sin(da), Math.cos(da));
    cam.tyaw += da; cam.yaw = cam.tyaw;
    gesture.d = d; gesture.a = a;
  }
  // arrastre «agarrando» el suelo: el punto tomado queda bajo el dedo
  applyCamera();
  const g = groundAt(mx, my);
  if (g) {
    const k = S.settings.invert ? -1 : 1, s = S.settings.pan;
    cam.tx += (gesture.gx - g.x) * k * s; cam.tz += (gesture.gz - g.z) * k * s;
    clampCam(); cam.x = cam.tx; cam.z = cam.tz; applyCamera();
    const g2 = groundAt(mx, my); if (g2) { gesture.gx = g2.x + (gesture.gx - g.x) * (1 - k * s); gesture.gz = g2.z + (gesture.gz - g.z) * (1 - k * s); if (k * s === 1) { gesture.gx = g2.x; gesture.gz = g2.z; } }
    const g3 = groundAt(mx, my); if (g3 && k * s === 1) { gesture.gx = g3.x; gesture.gz = g3.z; }
  }
}

/* ======================= selección ======================= */
/** Candidatos bajo un punto de pantalla: se prueba el rayo a varias alturas (torres altas, cristales). */
function pickAt(cx, cy) {
  const W = ctx.W; if (!W) return;
  const touch = G.lastInput === 'touch';
  /** @type {{kind:string, ref:any, d:number}|null} */ let best = null;
  const consider = (kind, ref, x, z, hs, rad) => {
    for (const h of hs) {
      const g = groundAt(cx, cy, h); if (!g) continue;
      const d = Math.hypot(g.x - x, g.z - z);
      if (d < rad && (!best || d < best.d)) best = { kind, ref, d };
    }
  };
  const tol = touch ? 1.6 : 1.25;
  for (const p of W.pads) consider(p.tower ? 'tower' : 'pad', p.tower || p, p.x, p.z, p.tower ? [0.3, 1.2, 2.2, 3.0] : [0.3], tol);
  for (const l of W.levers) consider('lever', l, l.x, l.z, [0.3, 1.0], tol);
  for (const a of W.aux) consider('aux', a, a.x, a.z, [0.3, 1.2, 2.0], tol);
  consider('crystal', W.crystal, W.crystal.x, W.crystal.z, [0.3, 1.5, 3.0], tol + 0.6);
  if (G.moveTower) {
    if (best && best.kind === 'pad') { doRelocate(G.moveTower, best.ref); return; }
    if (best && best.kind === 'tower' && best.ref === G.moveTower) { cancelMove(); return; }
    toast('Elegí una plataforma libre'); sfx.denied(); return;
  }
  if (!best) { if (G.sel) { select(null); } return; }
  activate(best.kind, best.ref);
}
function activate(kind, ref) {
  if (kind === 'lever') { toggleLever(ref); return; }
  if (kind === 'aux' && ref.alive && ref.charge >= 1) { harvest(ref); return; }
  select({ kind, ref });
}
function select(s) {
  G.sel = s; previewType = '';
  if (!s) { ui.hidePanel(); return; }
  sfx.select();
  refreshPanel(true);
  if (s.kind === 'tower') tutEvent('selectTower');
}
let panelRefreshT = 0;
function refreshPanel(force = false) {
  const s = G.sel; if (!s) return;
  if (!force && panelRefreshT > 0) return;
  panelRefreshT = 0.25;
  const focused = document.querySelector('#be-panel .kf');
  const fi = focused ? [...document.querySelectorAll('#be-panel .be-pbtn')].indexOf(focused) : -1;
  if (s.kind === 'pad') { if (s.ref.tower) { G.sel = { kind: 'tower', ref: s.ref.tower }; return refreshPanel(true); } ui.showPanel('pad', { gold: G.gold }); }
  else if (s.kind === 'tower') { if (!towers.list.includes(s.ref)) { select(null); return; } ui.showPanel('tower', { tower: s.ref, gold: G.gold, sell: towers.sellValue(s.ref), moves: G.moves, binds: S.settings.binds }); }
  else if (s.kind === 'aux') ui.showPanel('aux', { aux: s.ref, gold: G.gold, harvest: harvestValue() });
  else if (s.kind === 'crystal') ui.showPanel('crystal', { hp: G.crystal, max: G.crystalMax });
  if (fi >= 0) { const b = document.querySelectorAll('#be-panel .be-pbtn')[fi]; if (b) b.classList.add('kf'); }
}
function hoverAt(cx, cy) {
  const g = groundAt(cx, cy);
  hoverRing.visible = false;
  if (!g || !ctx.W) return;
  let bestD = 1.3, hp = null;
  for (const p of ctx.W.pads) { const d = Math.hypot(p.x - g.x, p.z - g.z); if (d < bestD) { bestD = d; hp = p; } }
  for (const o of [...ctx.W.levers, ...ctx.W.aux]) { const d = Math.hypot(o.x - g.x, o.z - g.z); if (d < bestD) { bestD = d; hp = o; } }
  if (hp) { hoverRing.visible = true; hoverRing.position.set(hp.x, 0.34, hp.z); }
  el.style.cursor = hp ? 'pointer' : 'grab';
}

/* ======================= acciones de juego ======================= */
function buildTower(pad, type) {
  const T = /** @type {any} */ (TOWERS)[type];
  if (!pad || pad.tower) return false;
  if (G.gold < T.lv[0].cost) { toast(`Te falta esencia: ${T.name} cuesta ${T.lv[0].cost}`); sfx.denied(); return false; }
  G.gold -= T.lv[0].cost;
  const t = towers.build(pad, type);
  sfx.build(); fx.burst(pad.x, 0.8, pad.z, T.color, 18, 3.5); fx.ring(pad.x, pad.z, T.color, 0.4, 2.2, 0.5);
  if (type === 'fuego') { G.fireBuilt = true; MM.emit('fireBuilt'); }
  MM.emit('build');
  tutEvent('build');
  select({ kind: 'tower', ref: t });
  return true;
}
function upgradeTower(t) {
  const c = towers.upgradeCost(t);
  if (t.lv >= 2) { toast('Esta torre ya está al máximo'); sfx.denied(); return false; }
  if (G.gold < c) { toast(`Te falta esencia: la mejora cuesta ${c}`); sfx.denied(); return false; }
  G.gold -= c; towers.upgrade(t); sfx.upgrade();
  if (t.lv === 2) { G.maxed++; MM.emit('maxed'); popup(t.pad, t.top + 2, '¡NIVEL MÁXIMO!', '#ffd23a'); }
  tutEvent('upgrade');
  refreshPanel(true);
  return true;
}
function sellTower(t) {
  const v = towers.sell(t); G.gold += v; sfx.sell();
  popup(t.pad, 2, `+${v}`, '#ffd23a');
  select(null);
}
function startMove(t) {
  if (G.moves <= 0) { toast('No te quedan reubicaciones en este escenario'); sfx.denied(); return; }
  G.moveTower = t; ui.hidePanel(); ui.setMove(true);
}
function cancelMove() { G.moveTower = null; ui.setMove(false); if (G.sel) refreshPanel(true); }
function doRelocate(t, pad) {
  if (pad.tower) { toast('Esa plataforma está ocupada'); sfx.denied(); return; }
  towers.relocate(t, pad); G.moves--; sfx.move();
  G.moveTower = null; ui.setMove(false);
  MM.emit('relocate');
  select({ kind: 'tower', ref: t });
}
function cyclePrio(t) { t.prio = PRIORITIES[(PRIORITIES.indexOf(t.prio) + 1) % PRIORITIES.length]; sfx.click(); refreshPanel(true); }
const harvestValue = () => Math.round(AUX.gold * G.diff.harvest);
function harvest(a) {
  if (!a.alive || a.charge < 1) return false;
  a.charge = 0;
  const v = harvestValue();
  G.gold += v; G.harvests++;
  sfx.harvest(); fx.burst(a.x, 1.4, a.z, 0x7dffd0, 18, 3.5); fx.ring(a.x, a.z, 0x7dffd0, 0.4, 2.4, 0.5);
  popup(a, 2.6, `+${v} ESENCIA`, '#7dffd0');
  MM.emit('harvest');
  tutEvent('harvest');
  if (G.sel && G.sel.ref === a) refreshPanel(true);
  return true;
}
function repairAux(a) {
  if (!a.alive || a.hp >= a.max) return;
  if (G.gold < 20) { toast('Te falta esencia (20)'); sfx.denied(); return; }
  G.gold -= 20; a.hp = a.max; sfx.upgrade(); fx.burst(a.x, 1, a.z, 0x7dffd0, 10, 2); refreshPanel(true);
}
function restoreAux(a) {
  if (a.alive) return;
  if (G.gold < 80) { toast('Te falta esencia (80)'); sfx.denied(); return; }
  G.gold -= 80; a.alive = true; a.hp = a.max * 0.6; a.charge = 0; a.core.visible = true; a.ring.visible = true; a.shards.visible = false;
  sfx.build(); fx.burst(a.x, 1, a.z, 0x7dffd0, 16, 3); refreshPanel(true);
}
function hurtAux(a, dmg) {
  if (!a.alive || G.state !== 'play') return;
  a.hp -= dmg; a.threat = 0.6;
  if (a.hitT <= 0) { a.hitT = 0.4; sfx.auxHit(); }
  if (a.hp <= 0) {
    a.alive = false; a.hp = 0; a.charge = 0; a.core.visible = false; a.ring.visible = false; a.shards.visible = true;
    fx.burst(a.x, 1.2, a.z, 0x7dffd0, 26, 4.5); sfx.auxLost(); ctx.shake(0.3);
    G.auxLost = true; MM.emit('auxLost');
    ui.banner('CRISTAL AUXILIAR', '¡PERDIDO!', 'Podés restaurarlo por 80 de esencia', false, 2000);
    if (G.sel && G.sel.ref === a) refreshPanel(true);
  }
}
function toggleLever(l) {
  const W = ctx.W, b = W.bridges[l.bridge];
  if (b.lock > 0) { toast(`El Titán bloqueó esta palanca (${Math.ceil(b.lock)} s)`); sfx.denied(); return false; }
  if (l.cool > 0) { toast(`La palanca se está recargando (${Math.ceil(l.cool)} s)`); sfx.denied(); return false; }
  const tiles = [...b.tiles[0], ...b.tiles[1]];
  const onBridge = enemies.list.some(e => e.alive && !e.fly && tiles.some(([c, r]) => (e.tc === c && e.tr === r) || Math.hypot(e.x - toWorld(c, r).x, e.z - toWorld(c, r).z) < 1.6));
  if (onBridge) { toast('¡Hay enemigos sobre el puente! Esperá a que crucen.'); sfx.denied(); return false; }
  const st = 1 - b.state;
  if (!W.canSet(l.bridge, st)) { toast('Así los enemigos quedarían sin camino'); sfx.denied(); return false; }
  W.setBridge(l.bridge, st);
  l.cool = 10; sfx.lever(); ctx.shake(0.15);
  fx.burst(l.x, 1.2, l.z, 0xffd23a, 10, 2.5);
  popup(l, 2.2, 'RUTA CAMBIADA', '#ffe08a');
  MM.emit('lever');
  tutEvent('lever');
  return true;
}
function reroute() {
  const W = ctx.W;
  for (const b of W.bridges) { W.setBridge(b.i, 1 - b.state); b.lock = 25; }
  for (const l of W.levers) l.cool = 0;
  G.rerouteT = 4;
  ui.banner('¡DESVÍO!', 'EL TITÁN GIRÓ LOS PUENTES', 'Las palancas quedan bloqueadas 25 s', true, 2600);
  sfx.lever();
}
function telegraphReroute(dur) {
  G.rerouteT = dur + 4;
  toast('⚠ El Titán va a desviar la ruta: preparate');
}
function spawnNear(type, T, i) {
  const wi = G.waves.findIndex(w => w.titan);
  const a = i / 4 * Math.PI * 2;
  const e = enemies.spawn(type, 0, { wave: wi, at: { x: T.x + Math.cos(a) * 2.5, z: T.z + Math.sin(a) * 2.5 } });
  if (e && wi >= 0) { G.waves[wi].alive++; G.waves[wi].total++; G.waves[wi].spawned++; }
}

/* ======================= oleadas ======================= */
function canCall() {
  if (G.state !== 'play' || G.waveIdx >= G.waves.length) return false;
  if (G.phase === 'prep' || G.phase === 'countdown') return true;
  // llamada anticipada: cuando ya salieron todos los de la oleada en curso
  return G.queue.length === 0 && !G.waves.some(w => w.titan && !w.done && w.spawned > 0);
}
function callWave() {
  if (!canCall()) { sfx.denied(); return false; }
  let bonus = 0;
  if (G.phase === 'countdown') bonus = Math.ceil(G.countdown);
  else if (G.phase === 'active') bonus = 10;
  if (bonus > 0) { G.gold += bonus; ui.popup(innerWidth / 2, 90, `+${bonus} por adelantarte`, '#ffd23a'); }
  startWave(G.waveIdx);
  return true;
}
function startWave(i) {
  const def = MAPS[G.map].waves[i];
  G.waveIdx = i + 1; G.phase = 'active'; G.countdown = 0;
  const w = G.waves[i]; w.spawned = 0; w.alive = 0; w.done = false;
  let total = 0;
  for (const grp of def) {
    const [type, n, gap, delay, sp = 0, tag] = /** @type {any} */ (grp);
    for (let k = 0; k < n; k++) {
      G.queue.push({ t: G.clock + delay + k * gap, type, spawn: sp === -1 ? k % Math.max(1, ctx.W.spawns.length) : sp, elite: tag === 'elite', wave: i });
      total++;
    }
  }
  G.queue.sort((a, b) => a.t - b.t);
  w.total = total;
  const isTitan = def.some(g => g[0] === 'titan');
  w.titan = isTitan;
  sfx.wave();
  if (!isTitan) ui.banner(`OLEADA ${i + 1} DE ${G.waves.length}`, waveTitle(def), waveSub(def), false, 2000);
  tutEvent('wave');
  MM.emit('waveStart', i + 1);
}
const NAMES = { trasgo: 'trasgos', imp: 'imps', golem: 'gólems', caballero: 'caballeros', volador: 'harpías', titan: 'TITÁN' };
function waveTitle(def) {
  const elite = def.some(g => g[5] === 'elite');
  return elite ? '¡OLEADA FINAL CON ÉLITE!' : def.length > 2 ? 'OLEADA MIXTA' : def.map(g => /** @type {any} */ (NAMES)[g[0]]).join(' + ').toUpperCase();
}
function waveSub(def) { return def.map(g => `${g[1]} ${/** @type {any} */ (NAMES)[g[0]]}`).join(' · '); }
function processQueue() {
  while (G.queue.length && G.queue[0].t <= G.clock) {
    const q = /** @type {any} */ (G.queue.shift());
    const w = G.waves[q.wave];
    if (q.type === 'titan') { boss.start(q.spawn); w.alive++; w.spawned++; startCine(); continue; }
    const e = enemies.spawn(q.type, q.spawn, { elite: q.elite, wave: q.wave });
    if (e) { w.alive++; w.spawned++; } else { w.total--; }
  }
}
function enemyGone(e) {
  const w = G.waves[e.wave];
  if (!w) return;
  w.alive--;
  checkWave(e.wave);
}
function checkWave(i) {
  const w = G.waves[i];
  if (w.done || w.alive > 0 || w.spawned < w.total || G.queue.some(q => q.wave === i)) return;
  w.done = true;
  G.wavesDone++;
  const bonus = Math.round(WAVE_BONUS(i + 1) * G.diff.reward);
  G.gold += bonus; G.score += 100 * (i + 1);
  S.wavesTotal++; save.flush();
  MM.emit('wavesTotal', S.wavesTotal);
  sfx.cleared();
  if (G.wavesDone >= G.waves.length) { winMap(); return; }
  ui.banner(`OLEADA ${i + 1} SUPERADA`, `+${bonus} ESENCIA`, '', false, 1700);
  if (i === 0) tutEvent('cleared');
  if (!G.waves.some(x => !x.done && x.spawned > 0) && G.queue.length === 0) {
    G.phase = 'countdown'; G.countdown = G.diff.between;
    saveCheckpoint();
  }
}

/* ======================= eventos de combate ======================= */
function onKill(e) {
  const v = Math.round(e.def.bounty * G.diff.reward * (e.elite ? 4 : 1));
  G.gold += v; G.score += e.def.bounty * 10 * (e.elite ? 4 : 1); G.kills++;
  if (Math.random() < 0.35 || e.elite || e.type === 'golem') popup(e, 1.8 * e.scale, `+${v}`, '#ffd23a');
  sfx.coin();
  MM.emit('kill');
  if (e.elite) { ui.banner('¡ÉLITE DERROTADO!', `+${v} ESENCIA`, '', false, 1500); ctx.shake(0.3); }
  enemyGone(e);
}
function onLeak(e) {
  if (G.state !== 'play') { if (!e.isBoss) enemyGone(e); return; }
  const dmg = e.isBoss ? 999 : e.def.leak * (e.elite ? 2 : 1);
  G.crystal -= dmg; G.leaks++;
  sfx.leak(); ui.hurtFlash(); ctx.shake(0.5);
  const cr = ctx.W.crystal;
  fx.burst(cr.x, 2.4, cr.z, 0xff5a8a, 16, 4);
  popup(cr, 4, `-${Math.min(dmg, G.crystalMax)} 💎`, '#ff8aa0');
  MM.emit('leak');
  if (!e.isBoss) enemyGone(e);
  if (G.crystal <= 0) { G.crystal = 0; loseMap(); }
}
function onCombo(kind) { G.combos++; MM.emit('combo'); sfx.combo(); tutEvent('combo'); void kind; }
function onTitanDown() {
  G.score += TITAN.score; G.gold += Math.round(TITAN.bounty * G.diff.reward);
  MM.emit('titanDown');
  S.titan = true; save.flush();
  ui.banner('¡TITÁN ELEMENTAL DERROTADO!', `+${TITAN.score} PUNTOS`, 'Recompensa: Corona Elemental', true, 3000);
  const wi = G.waves.findIndex(w => w.titan);
  if (wi >= 0) { G.waves[wi].alive--; checkWave(wi); }
}

/* ======================= cinemática del Titán ======================= */
function startCine() {
  G.state = 'cine';
  const T = boss.T;
  cam.focus = { x: T.x, z: T.z, dist: 26 };
  ui.banner('GRAN EVENTO', 'TITÁN ELEMENTAL', 'Cambia de inmunidad en cada fase · tocá para seguir', true, 4000);
  sfx.roar(); ctx.shake(0.8);
  select(null);
}
function skipCine() {
  if (G.state !== 'cine') return;
  boss.S.introT = 0; boss.S.rise = 1;
  endCine();
}
function endCine() { G.state = 'play'; cam.focus = null; ui.banner('FASE 1', TITAN.phases[0].name.toUpperCase(), 'Inmune al hielo · débil al fuego', true, 2200); }

/* ======================= partida ======================= */
function loadMap(i) {
  if (ctx.W) { if (ctx.W.crystal.crown) disposeTree(ctx.W.crystal.crown); ctx.W.dispose(); }
  enemies.clear(); towers.clear(); towers.clearShots(); boss.reset(); fx.clear();
  ctx.qcfg = QUALITY[game.quality] || QUALITY.medium;
  const def = MAPS[i];
  ctx.W = buildWorld(ctx, def);
  scene.background = new THREE.Color(def.sky);
  /** @type {THREE.Fog} */ (scene.fog).color.set(def.fog);
  hemi.color.set(def.hemi[0]); hemi.groundColor.set(def.hemi[1]); hemi.intensity = def.hemi[2];
  sun.color.set(def.sun[0]); sun.intensity = def.sun[1];
  applyQualityLive();
  fx.setWeather(def.weather, ctx.qcfg.weather);
  ui.clearMarks();
  if (S.titan) addCrown();
}
/** Recompensa permanente por vencer al Titán: corona dorada sobre el cristal principal. */
function addCrown() {
  const cr = ctx.W.crystal;
  const g = new THREE.Group(); g.name = 'corona'; g.position.y = 4.6;
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, emissive: 0x6a4a00, metalness: 0.8, roughness: 0.3, flatShading: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 6, 24), gold); ring.rotation.x = Math.PI / 2; g.add(ring);
  const gem = new THREE.OctahedronGeometry(0.2, 0);
  [0x8fe0ff, 0xff6a2a, 0xffe14a, 0xb9a8ff, 0x7dffd0].forEach((c, i) => {
    const a = i / 5 * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 4), gold); spike.position.set(Math.cos(a) * 0.75, 0.25, Math.sin(a) * 0.75); g.add(spike);
    const m = new THREE.Mesh(gem, new THREE.MeshBasicMaterial({ color: c, toneMapped: false })); m.position.set(Math.cos(a) * 0.75, 0.58, Math.sin(a) * 0.75); g.add(m);
  });
  cr.group.add(g); cr.crown = g;
}
function applyQualityLive() {
  const q = ctx.qcfg = QUALITY[game.quality] || QUALITY.medium;
  const f = /** @type {THREE.Fog} */ (scene.fog); f.near = q.fogFar * 0.55; f.far = q.fogFar;
  camera.far = q.fogFar + 40; camera.updateProjectionMatrix();
  fx.setCap(q.particles);
  if (ctx.W) fx.setWeather(ctx.W.def.weather, q.weather);
}
function startMap(i, fromCheckpoint = false) {
  G.diffId = MM.difficulty(); G.diff = /** @type {any} */ (DIFFICULTY)[G.diffId] || DIFFICULTY.normal;
  const cp = fromCheckpoint && S.checkpoint && S.checkpoint.map === i ? S.checkpoint : null;
  G.map = i; S.mapSel = i;
  loadMap(i);
  const D = cp ? (/** @type {any} */ (DIFFICULTY)[cp.diff] || G.diff) : G.diff;
  G.diff = D; G.diffId = D.name;
  Object.assign(G, {
    state: 'play', gold: D.gold + (MAPS[i].goldBonus || 0), crystal: D.crystal, crystalMax: D.crystal, score: 0, kills: 0, runTime: 0, waveIdx: 0, wavesDone: 0,
    phase: 'prep', countdown: 0, clock: 0, speed: 1, moves: D.moves, queue: [], fireBuilt: false, auxLost: false, maxed: 0, combos: 0, harvests: 0, leaks: 0,
    sel: null, moveTower: null, overlay: '', shake: 0, endT: 0, rerouteT: 0, later: [], record: false,
  });
  G.waves = MAPS[i].waves.map(() => ({ total: 0, spawned: 0, alive: 0, done: false, titan: false }));
  enemies.resetKills();
  if (cp) {
    Object.assign(G, { gold: cp.gold, crystal: cp.crystal, score: cp.score, kills: cp.kills, waveIdx: cp.wave, wavesDone: cp.wave, moves: cp.moves, fireBuilt: cp.fireBuilt, auxLost: cp.auxLost, maxed: cp.maxed || 0 });
    for (let k = 0; k < cp.wave; k++) G.waves[k].done = true;
    for (const t of cp.towers) { const pad = ctx.W.pads[t.pad]; if (!pad || pad.tower || !(t.type in TOWERS)) continue; const tw = towers.build(pad, t.type, true); tw.invested = t.inv || 0; for (let l = 0; l < Math.min(2, t.lv | 0); l++) towers.upgrade(tw); tw.invested = t.inv || tw.invested; tw.prio = PRIORITIES.includes(t.prio) ? t.prio : 'primero'; tw.riseT = 0; }
    (cp.bridges || []).forEach((st, bi) => { if (ctx.W.bridges[bi] && st !== ctx.W.bridges[bi].state) ctx.W.setBridge(bi, st, true); });
    (cp.aux || []).forEach((a, ai) => { const x = ctx.W.aux[ai]; if (!x) return; x.hp = clamp(a.hp, 0, x.max); x.alive = !!a.alive && x.hp > 0; x.charge = clamp(a.charge || 0, 0, 1); if (!x.alive) { x.core.visible = false; x.ring.visible = false; x.shards.visible = true; } });
  }
  fx.clear();
  ui.menu.hide(); ui.end.hide(); ui.help.hide(); ui.opts.hide();
  ui.show(true); ui.hidePanel(); ui.setMove(false);
  input.showTouch(true);
  frameMap(true);
  S.runs++; save.flush();
  MM.runStart();
  MM.emit('wavesTotal', S.wavesTotal);
  if (G.fireBuilt) MM.emit('fireBuilt');
  if (G.auxLost) MM.emit('auxLost');
  for (let k = 0; k < G.maxed; k++) MM.emit('maxed');
  refreshMissions();
  A && A.started();
  ui.banner(MAPS[i].kicker + (cp ? ` · OLEADA ${cp.wave + 1}` : ''), MAPS[i].name.toUpperCase(), cp ? 'Partida retomada' : MAPS[i].blurb, false, 2600);
  if (!S.tutorial.done && i === 0 && !cp) startTutorial();
  else ui.tip(0, 0, '');
  if (!cp) saveCheckpoint();
}
function saveCheckpoint() {
  if (G.state !== 'play') return;
  S.checkpoint = {
    map: G.map, wave: G.waveIdx, gold: G.gold, crystal: G.crystal, score: G.score, kills: G.kills, moves: G.moves, diff: G.diffId,
    fireBuilt: G.fireBuilt, auxLost: G.auxLost, maxed: G.maxed,
    towers: towers.list.map(t => ({ pad: t.pad.i, type: t.type, lv: t.lv, prio: t.prio, inv: t.invested })),
    bridges: ctx.W.bridges.map(b => b.state), aux: ctx.W.aux.map(a => ({ hp: Math.round(a.hp), alive: a.alive, charge: +a.charge.toFixed(2) })),
  };
  save.flush();
}
function finishRun(won) {
  const summary = MM.runEnd({ won });
  A && A.ended({ score: G.score });
  const best = S.best[G.map] || { waves: 0, won: false, score: 0 };
  G.record = G.score > (best.score || 0);
  S.best[G.map] = { waves: Math.max(best.waves, G.wavesDone), won: best.won || won, score: Math.max(best.score || 0, G.score) };
  S.kills += G.kills;
  return summary;
}
function winMap() {
  G.state = 'victory'; G.endWon = true;
  S.wins++; S.defended = true;
  if (G.map + 2 > S.unlocked) S.unlocked = Math.min(3, G.map + 2);
  S.checkpoint = null;
  G.score += Math.round(G.crystal * 50);
  MM.emit('crystalDefended'); MM.emit('mapWon');
  const summary = finishRun(true);
  save.flush();
  sfx.win();
  input.showTouch(false); ui.hidePanel(); ui.setMove(false);
  fx.burst(ctx.W.crystal.x, 3, ctx.W.crystal.z, 0xc8bcff, 50, 6, 1, 1.5, 1.2);
  setTimeout(() => showEnd(true, summary), 900);
}
function loseMap() {
  if (G.state !== 'play' && G.state !== 'cine') return;
  G.state = 'defeat'; G.endWon = false;
  const summary = finishRun(false);
  save.flush();
  sfx.lose();
  input.showTouch(false); ui.hidePanel(); ui.setMove(false);
  const cr = ctx.W.crystal; cr.core.visible = false; fx.burst(cr.x, 2.5, cr.z, 0xb9a8ff, 60, 7, 1, 1.8, 1.4);
  setTimeout(() => showEnd(false, summary), 900);
}
function showEnd(won, summary) {
  if (G.state !== 'victory' && G.state !== 'defeat') return;
  ui.show(false);
  ui.showEnd({ won, final: won && G.map === 2, mapName: MAPS[G.map].name, score: G.score, wavesDone: G.wavesDone, waves: G.waves.length, kills: G.kills, crystal: G.crystal,
    missions: summary || [], record: G.record, next: won && G.map < 2 ? MAPS[G.map + 1].name : '' });
}
function toMenu() {
  if (G.state === 'play' || G.state === 'cine') { saveCheckpoint(); finishRun(false); }
  G.state = 'menu'; ui.show(false); ui.end.hide(); ui.tip(0, 0, ''); ui.hidePanel(); input.showTouch(false);
  loadMap(G.map = S.mapSel);
  frameMap(true); cam.tdist *= 1.08;
  showMenu();
}
function showMenu() {
  const md = MM.state().achievements.done || {};
  const done = MISSIONS.filter(m => md[m.id]).length;
  const camp = `<span>🏅 Misiones ${done}/${MISSIONS.length}</span><span>🌊 Oleadas ${S.wavesTotal}</span><span>${S.titan ? '👑 Titán vencido' : '⚔️ Titán invicto'}</span><span>★ ${A ? A.scores.best(ID) : 0}</span>`;
  ui.showMenu({ map: S.mapSel, unlocked: S.unlocked, best: S.best, checkpoint: S.checkpoint, camp });
}
function onRestart() {
  // reiniciar desde la pausa: escenario actual desde la oleada 1
  if (G.state === 'play' || G.state === 'cine') finishRun(false);
  S.checkpoint = null;
  startMap(G.map, false);
}
function onQuality(q) {
  void q;
  if (G.state === 'menu' || !ctx.W) { if (ctx.W) loadMap(G.map); }
  else applyQualityLive();
}

/* ======================= tutorial ======================= */
const TUT = [
  { id: 'build', pc: 'Hacé clic en una plataforma ◇ y elegí una torre (o tecla 1-4). Empezá por una Ballesta cerca del camino.', touch: 'Tocá una plataforma ◇ y elegí una torre. Empezá por una Ballesta cerca del camino.' },
  { id: 'wave', pc: 'Cuando estés listo, llamá la oleada con ▶ OLEADA o Espacio. Las flechas del piso muestran la ruta.', touch: 'Cuando estés listo, llamá la oleada con el botón ▶▶. Las flechas del piso muestran la ruta.' },
  { id: 'harvest', pc: 'Los cristales auxiliares 💠 cargan esencia: cuando brillen, hacé clic para cosechar.', touch: 'Los cristales auxiliares 💠 cargan esencia: cuando brillen, tocalos para cosechar.' },
  { id: 'selectTower', pc: 'Hacé clic en una torre para mejorarla, venderla, reubicarla o cambiar a quién apunta.', touch: 'Tocá una torre para mejorarla, venderla, reubicarla o cambiar a quién apunta.' },
  { id: 'lever', pc: 'La palanca ⚙ gira el puente: los enemigos cambian de ruta. Probala para llevarlos hacia tus torres.', touch: 'La palanca ⚙ gira el puente: los enemigos cambian de ruta. Tocala para llevarlos hacia tus torres.' },
  { id: 'combo', pc: 'Combiná elementos: fuego + hielo = choque térmico · hielo + rayo = conducción · fuego + rayo = sobrecarga.', touch: 'Combiná elementos: fuego + hielo = choque térmico · hielo + rayo = conducción · fuego + rayo = sobrecarga.' },
];
function startTutorial() { G.tut = { on: true, step: 0, waitT: 0 }; showTip(); }
function showTip() {
  const s = TUT[G.tut.step];
  if (!G.tut.on || !s) { ui.tip(0, 0, ''); return; }
  ui.tip(G.tut.step + 1, TUT.length, input.isTouch ? s.touch : s.pc);
}
function tutEvent(id) {
  if (!G.tut.on) return;
  const s = TUT[G.tut.step]; if (!s) return;
  const match = s.id === id || (s.id === 'selectTower' && id === 'upgrade');
  if (!match) return;
  nextTip();
}
function nextTip() {
  G.tut.step++;
  if (G.tut.step >= TUT.length) { endTutorial(false); return; }
  showTip();
}
function endTutorial(skipped) {
  G.tut.on = false; ui.tip(0, 0, '');
  S.tutorial.done = true; save.flush();
  if (skipped) toast('Tutorial salteado: lo podés repetir desde «Cómo jugar»');
}

/* ======================= superposiciones (ayuda/controles) ======================= */
function openOverlay(which) {
  G.overlay = which;
  if (which === 'help') ui.showHelp({ binds: S.settings.binds });
  else ui.showOpts({ settings: S.settings });
}
function closeOverlay() {
  const was = G.overlay;
  G.overlay = '';
  ui.help.hide(); ui.opts.hide();
  if (G.state === 'menu') { showMenu(); return; }
  // vuelve al menú de pausa
  if ((G.state === 'play' || G.state === 'cine') && A && was) A.pause();
}
let binding = '';
function onUi(action, arg) {
  if (action === 'close') { select(null); return; }
  if (action === 'build' && G.sel && G.sel.kind === 'pad') { buildTower(G.sel.ref, arg); return; }
  if (action === 'upgrade' && G.sel && G.sel.kind === 'tower') { upgradeTower(G.sel.ref); return; }
  if (action === 'sell' && G.sel && G.sel.kind === 'tower') { sellTower(G.sel.ref); return; }
  if (action === 'move' && G.sel && G.sel.kind === 'tower') { startMove(G.sel.ref); return; }
  if (action === 'prio' && G.sel && G.sel.kind === 'tower') { cyclePrio(G.sel.ref); return; }
  if (action === 'harvest' && G.sel && G.sel.kind === 'aux') { harvest(G.sel.ref); return; }
  if (action === 'repair' && G.sel && G.sel.kind === 'aux') { repairAux(G.sel.ref); return; }
  if (action === 'restore' && G.sel && G.sel.kind === 'aux') { restoreAux(G.sel.ref); return; }
  if (action === 'cancelMove') { cancelMove(); return; }
  if (action === 'wave') { callWave(); return; }
  if (action === 'speed') { toggleSpeed(); return; }
  if (action === 'tutOk') { nextTip(); return; }
  if (action === 'tutSkip') { endTutorial(true); return; }
  if (action === 'opt') {
    const { k, v } = arg; /** @type {any} */ (S.settings)[k] = v; save.flush();
    if (k === 'ranges' && !v) allRanges.count = 0;
    return;
  }
  // menús
  if (action === 'm:map') { const i = Number(arg); if (i < S.unlocked) { S.mapSel = i; G.map = i; save.flush(); loadMap(i); frameMap(true); cam.tdist *= 1.08; showMenu(); sfx.select(); } return; }
  if (action === 'm:diff') { ui.diffText(); return; }
  if (action === 'm:play') { S.checkpoint = S.checkpoint && S.checkpoint.map === S.mapSel ? null : S.checkpoint; startMap(S.mapSel, false); return; }
  if (action === 'm:continue') { startMap(S.mapSel, true); return; }
  if (action === 'm:help') { openOverlay('help'); return; }
  if (action === 'm:opts') { openOverlay('opts'); return; }
  if (action === 'm:closeHelp' || action === 'm:closeOpts') { closeOverlay(); return; }
  if (action === 'm:retut') {
    S.tutorial.done = false; save.flush();
    if (G.state === 'play') { startTutorial(); }
    toast('El tutorial se mostrará ' + (G.state === 'play' ? 'ahora' : 'al empezar el Puente Glacial'));
    closeOverlay();
    return;
  }
  if (action === 'm:bind') {
    binding = String(arg);
    const b = ui.opts.el.querySelector(`[data-m="bind"][data-v="${binding}"]`); if (b) { b.classList.add('wait'); b.textContent = 'Apretá una tecla…'; }
    return;
  }
  if (action === 'm:resetBinds') { S.settings.binds = { ...DEFAULT_BINDS }; save.flush(); ui.setKeys(S.settings.binds); ui.showOpts({ settings: S.settings }); return; }
  if (action === 'm:retry') { S.checkpoint = null; startMap(G.map, false); return; }
  if (action === 'm:next') { S.mapSel = Math.min(2, G.map + 1); startMap(S.mapSel, false); return; }
  if (action === 'm:menu') { toMenu(); return; }
}
addEventListener('keydown', e => {
  if (!binding) return;
  e.preventDefault(); e.stopPropagation();
  const code = e.code;
  const banned = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyP', 'KeyR', 'KeyZ', 'KeyC', 'Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];
  if (banned.includes(code) || !/^(Key[A-Z]|Digit[0-9]|Space|Enter|Tab|ShiftLeft|Backspace)$/.test(code)) { toast(`${keyName(code)} está reservada`); }
  else {
    const binds = /** @type {any} */ (S.settings.binds);
    for (const k in binds) if (binds[k] === code && k !== binding) binds[k] = binds[binding];
    binds[binding] = code; save.flush(); ui.setKeys(S.settings.binds);
  }
  binding = '';
  ui.showOpts({ settings: S.settings });
}, true);
// navegación del panel con teclado/gamepad: directa (cada pulsación cuenta aunque caigan varias en un mismo paso)
addEventListener('keydown', e => {
  if (binding || G.state !== 'play' || G.overlay || !ui.panelOpen || e.repeat) return;
  if (['ArrowLeft', 'KeyA'].includes(e.code)) ui.panelNav(-1);
  else if (['ArrowRight', 'KeyD'].includes(e.code)) ui.panelNav(1);
  else if (e.code === 'Enter' && ui.panelActivate()) G.enterUsed = true;
});
function toggleSpeed() { G.speed = G.speed > 1 ? 1 : 2; sfx.click(); }

/* ======================= loop ======================= */
function update(dt) {
  if (G.overlay) { input.endStep(); return; }
  // cámara por teclado (también en menú no)
  if (G.state === 'play' || G.state === 'cine') handleKeys(dt);
  const steps = G.state === 'play' ? G.speed : 1;
  for (let s = 0; s < steps; s++) tick(dt);
  input.endStep(); G.enterUsed = false;
}
function tick(dt) {
  const W = ctx.W;
  if (W) W.update(dt, reduced());
  for (let i = G.later.length - 1; i >= 0; i--) { const l = G.later[i]; l.t -= dt; if (l.t <= 0) { G.later.splice(i, 1); l.fn(); } }
  if (G.state === 'cine') {
    boss.update(dt);
    if (boss.S.introT <= 0) endCine();
    return;
  }
  if (G.state !== 'play') { enemies.update(0); return; }
  G.runTime += dt; G.clock += dt;
  processQueue();
  enemies.update(dt);
  boss.update(dt);
  towers.update(dt);
  // cristales auxiliares
  for (const a of W.aux) {
    if (!a.alive) continue;
    if (a.threat <= 0) a.hp = Math.min(a.max, a.hp + AUX.regen * dt);
    const was = a.charge;
    a.charge = Math.min(1, a.charge + dt / AUX.charge);
    if (was < 1 && a.charge >= 1 && G.tut.on && TUT[G.tut.step] && TUT[G.tut.step].id === 'harvest') showTip();
  }
  for (const l of W.levers) l.cool = Math.max(0, l.cool - dt);
  for (const b of W.bridges) b.lock = Math.max(0, b.lock - dt);
  if (G.phase === 'countdown') { G.countdown -= dt; if (G.countdown <= 0) startWave(G.waveIdx); }
  if (G.rerouteT > 0) { G.rerouteT -= dt; W.chevMat.color.setHex(G.rerouteT > 0 ? 0xff4a5a : 0xfff4d0); }
  // tutorial: los pasos que dependen del mapa avanzan solos si no aplican
  if (G.tut.on) {
    const s = TUT[G.tut.step];
    if (s && s.id === 'harvest' && !W.aux.some(a => a.alive)) nextTip();
    if (s && s.id === 'lever' && !W.levers.length) nextTip();
    if (s && s.id === 'combo') { G.tut.waitT += dt; if (G.tut.waitT > 14) nextTip(); }
    if (s && s.id === 'selectTower' && G.wavesDone < 1 && G.waveIdx > 0) { /* espera a que termine la primera oleada */ }
  }
  // truenos (Valle del Trueno)
  if (W.def.weather === 'tormenta' && !reduced()) {
    G.thunderT -= dt;
    if (G.thunderT <= 0) { G.thunderT = 7 + Math.random() * 9; G.flashT = 0.18; sfx.thunder(); }
  }
  if (G.flashT > 0) { G.flashT -= dt; hemi.intensity = W.def.hemi[2] * (G.flashT > 0 ? 2.6 : 1); }
}
function handleKeys(dt) {
  const B = S.settings.binds;
  const panelOpen = ui.panelOpen;
  const ax = input.axis();
  const kb = Math.abs(ax.x) + Math.abs(ax.y) > 0;
  if (kb && G.lastInput !== 'pad') { G.lastInput = 'keys'; }
  if (kb && !panelOpen) {
    const s = 22 * dt * S.settings.pan * (cam.dist / 40);
    const fx_ = ax.x, fz = ax.y;
    cam.tx += (Math.cos(cam.yaw) * fx_ + Math.sin(cam.yaw) * fz) * s;
    cam.tz += (-Math.sin(cam.yaw) * fx_ + Math.cos(cam.yaw) * fz) * s;
    clampCam();
    ui.setReticle(true);
  }
  if (input.any('KeyQ') || input.button('rotl')) cam.tyaw += dt * 1.6;
  if (input.any('KeyE') || input.button('rotr')) cam.tyaw -= dt * 1.6;
  if (input.any('KeyZ', 'Minus', 'NumpadSubtract')) cam.tdist = clamp(cam.tdist * (1 + dt * 1.2 * S.settings.zoom), DMIN, DMAX);
  if (input.any('KeyC', 'Equal', 'NumpadAdd')) cam.tdist = clamp(cam.tdist * (1 - dt * 1.2 * S.settings.zoom), DMIN, DMAX);
  if (G.state !== 'play') { if (input.hit('Enter', 'Space')) skipCine(); return; }
  if (input.hit(B.wave) || input.hit('btn:wave')) callWave();
  if (input.hit(B.speed) || input.hit('btn:speed')) toggleSpeed();
  if (input.hit('Backspace')) { if (G.moveTower) cancelMove(); else select(null); }
  if (input.hit('Enter') && !G.enterUsed) {
    { pickAt(innerWidth / 2, innerHeight / 2); ui.setReticle(true); G.lastInput = 'keys'; }
  }
  const sel = G.sel;
  TOWER_ORDER.forEach((k, i) => { if (input.hit('Digit' + (i + 1), 'Numpad' + (i + 1)) && sel && sel.kind === 'pad') buildTower(sel.ref, k); });
  if (sel && sel.kind === 'tower') {
    if (input.hit(B.upgrade)) upgradeTower(sel.ref);
    else if (input.hit(B.sell)) sellTower(sel.ref);
    else if (input.hit('KeyR')) startMove(sel.ref);
  }
}

let rt = 0;
function render() {
  const dt = Math.min(0.05, game.frames ? 1 / 60 : 0);
  rt += 1 / 60;
  panelRefreshT -= 1 / 60;
  // cámara suave
  if (G.state === 'menu') cam.tyaw += 0.0012;
  if (cam.focus) { cam.tx = cam.focus.x; cam.tz = cam.focus.z; cam.tdist = cam.focus.dist; }
  const k = 0.16;
  cam.x += (cam.tx - cam.x) * k; cam.z += (cam.tz - cam.z) * k; cam.dist += (cam.tdist - cam.dist) * k;
  let dy = cam.tyaw - cam.yaw; cam.yaw += dy * k;
  G.shake = Math.max(0, G.shake - 1 / 60 * 2);
  applyCamera();
  { const f = /** @type {THREE.Fog} */ (scene.fog), q = ctx.qcfg; f.near = cam.dist + q.fogFar * 0.15; f.far = cam.dist + q.fogFar * 0.75; const cf = f.far + 30; if (Math.abs(camera.far - cf) > 2) { camera.far = cf; camera.updateProjectionMatrix(); } }
  if (ctx.W && ctx.W.crystal.crown) ctx.W.crystal.crown.rotation.y += 0.01;
  sun.position.set(cam.x - 18, 30, cam.z + 14); sun.target.position.set(cam.x, 0, cam.z);
  enemies.render(camera);
  towers.render(1 / 60, reduced());
  boss.render(1 / 60, reduced());
  fx.update(1 / 60, cam);
  void dt;
  if (G.state === 'play' || G.state === 'cine') renderHud();
}
function renderHud() {
  const W = ctx.W;
  input.showTouch(G.state === 'play' && !ui.panelOpen && !G.moveTower);
  const can = canCall();
  const next = G.waveIdx < G.waves.length;
  const waveText = G.phase === 'prep' ? 'PREPARÁ LA DEFENSA' : G.phase === 'countdown' ? `OLEADA ${G.waveIdx + 1} EN ${Math.ceil(G.countdown)} s` : boss.active ? 'TITÁN ELEMENTAL' : `OLEADA ${G.waveIdx} EN CURSO`;
  const waveSub = next && G.phase !== 'active' ? waveSub_(MAPS[G.map].waves[G.waveIdx]) : (n => `${n} enemigo${n === 1 ? '' : 's'} en el mapa`)(enemies.counts().total);
  ui.setHud({
    crystal: G.crystal, crystalMax: G.crystalMax, gold: G.gold, wave: Math.max(G.wavesDone, G.waveIdx), waves: G.waves.length, score: G.score,
    waveText, waveSub, speed: G.speed, canCall: can,
    callLabel: !next ? '✔ ÚLTIMA' : G.phase === 'countdown' ? `▶ OLEADA (+${Math.ceil(G.countdown)})` : '▶ OLEADA', callShort: G.phase === 'countdown' ? `▶▶\n+${Math.ceil(G.countdown)}` : '▶▶',
  });
  ui.setBoss(boss.info());
  if (panelRefreshT <= 0 && G.sel) refreshPanel();
  // marcadores de cristales auxiliares y palancas
  for (const a of W.aux) {
    const s = toScreen(a.x, 2.6, a.z);
    const ready = a.alive && a.charge >= 1;
    const html = a.alive ? `<span class="b">${ready ? '✨ +' + harvestValue() : '💠 ' + Math.floor(a.charge * 100) + '%'}</span><span class="hp"><i style="transform:scaleX(${(a.hp / a.max).toFixed(2)})"></i></span>` : '<span class="b">💥 roto</span>';
    ui.mark('aux' + a.i, s.x, s.y, s.vis, html, ready ? 'ready' : a.alive ? '' : 'dead');
  }
  for (const l of W.levers) {
    const b = W.bridges[l.bridge], s = toScreen(l.x, 1.9, l.z);
    const txt = b.lock > 0 ? `🔒 ${Math.ceil(b.lock)}s` : l.cool > 0 ? `⚙ ${Math.ceil(l.cool)}s` : '⚙ PALANCA';
    ui.mark('lev' + l.i, s.x, s.y, s.vis, `<span class="b">${txt}</span>`, 'lever' + (b.lock > 0 ? ' lock' : ''));
  }
  // selección y alcance
  const sel = G.sel;
  const selPos = sel ? (sel.kind === 'tower' ? sel.ref.pad : sel.ref) : null;
  selRing.visible = !!selPos;
  if (selPos) { selRing.position.set(selPos.x, 0.36, selPos.z); selRing.scale.setScalar(sel && sel.kind === 'crystal' ? 2 : 1 + Math.sin(rt * 5) * 0.04); }
  let range = 0, rx = 0, rz = 0;
  if (sel && sel.kind === 'tower') { range = towers.stats(sel.ref).range; rx = sel.ref.pad.x; rz = sel.ref.pad.z; }
  const hb = /** @type {HTMLElement|null} */ (document.querySelector('#be-panel .be-pbtn:hover, #be-panel .be-pbtn.kf'));
  if (sel && sel.kind === 'pad' && hb && hb.dataset.v) { range = /** @type {any} */ (TOWERS)[hb.dataset.v].lv[0].range; rx = sel.ref.x; rz = sel.ref.z; }
  if (G.moveTower) { range = towers.stats(G.moveTower).range; rx = G.moveTower.pad.x; rz = G.moveTower.pad.z; }
  rangeDisc.visible = rangeEdge.visible = range > 0;
  if (range > 0) { rangeDisc.position.set(rx, 0.06, rz); rangeDisc.scale.setScalar(range); rangeEdge.position.set(rx, 0.07, rz); rangeEdge.scale.setScalar(range); }
  if (S.settings.ranges) {
    let n = 0;
    for (const t of towers.list) { if (n >= 24) break; const r = towers.stats(t).range; allRanges.setMatrixAt(n++, _rm.makeScale(r, 1, r).setPosition(t.pad.x, 0.07, t.pad.z)); }
    allRanges.count = n; allRanges.instanceMatrix.needsUpdate = true;
  }
  // plataformas: runas libres brillan (más si se puede construir algo)
  const minCost = 70;
  const pulse = 0.55 + Math.sin(rt * 3) * 0.25;
  const c = _rc;
  W.pads.forEach((p, i) => {
    if (p.tower) c.setRGB(0.25, 0.22, 0.35);
    else if (G.moveTower) c.setRGB(0.5 * pulse + 0.3, 1 * pulse, 0.7 * pulse + 0.2);
    else if (G.gold >= minCost) c.setRGB(0.56 * pulse + 0.25, 0.48 * pulse + 0.2, 1 * pulse);
    else c.setRGB(0.35, 0.32, 0.45);
    W.runeMesh.setColorAt(i, c);
  });
  if (W.runeMesh.instanceColor) W.runeMesh.instanceColor.needsUpdate = true;
}
const _rm = new THREE.Matrix4(), _rc = new THREE.Color();
const waveSub_ = def => def ? waveSub(def) : '';
/** Texto flotante sobre un objeto del mundo (o = {x, z}, h = altura). */
function popup(o, h, text, color) { const s = toScreen(o.x, h, o.z); if (s.vis) ui.popup(s.x, s.y, text, color); }

function refreshMissions() {
  const st = MM.state();
  const all = st.current.map(c => ({ ...c, target: (MISSIONS.find(m => m.id === c.id) || { target: 1 }).target }));
  ui.setMissions(all);
}

/* ======================= arranque ======================= */
loadMap(G.map);
frameMap(true); cam.tdist *= 1.08;
showMenu();
game.start();
addEventListener('resize', () => { if (G.state === 'menu') { frameMap(); cam.tdist *= 1.08; } });

/* ======================= gancho de pruebas ======================= */
function routeFrom(si) { if (!ctx.W || !ctx.W.spawns[si]) return []; const W = ctx.W, out = []; let c = W.spawns[si].c, r = W.spawns[si].r; for (let i = 0; i < 80; i++) { out.push([c, r]); const n = W.next(c, r); if (!n) break; c = n.c; r = n.r; } return out; }
const hook = {
  get state() { return G.state; },
  get scene() { return ctx.W ? ctx.W.def.name : ''; },
  get mapIndex() { return G.map; },
  get phase() { return G.phase; },
  get wave() { return G.waveIdx; },
  get wavesDone() { return G.wavesDone; },
  get waves() { return G.waves.length; },
  get countdown() { return G.countdown; },
  get gold() { return G.gold; },
  get crystal() { return G.crystal; },
  get crystalMax() { return G.crystalMax; },
  get hp() { return G.crystal; },
  get score() { return G.score; },
  get kills() { return G.kills; },
  get runTime() { return +G.runTime.toFixed(4); },
  get simTime() { return +game.simTime.toFixed(4); },
  get paused() { return A ? A.isPaused() : false; },
  get speed() { return G.speed; },
  get moves() { return G.moves; },
  get overlay() { return G.overlay; },
  get selected() { const s = G.sel; return s ? { kind: s.kind, pad: s.kind === 'pad' ? s.ref.i : s.kind === 'tower' ? s.ref.pad.i : -1, index: s.ref.i ?? -1 } : null; },
  get panel() { return ui.panelOpen ? ui.panelKind : ''; },
  get moving() { return !!G.moveTower; },
  get towers() { return towers.list.map(t => ({ pad: t.pad.i, type: t.type, lv: t.lv + 1, prio: t.prio, frozen: t.frozenT > 0, stunned: t.stunT > 0, kills: t.kills, shots: t.shots, x: t.pad.x, z: t.pad.z })); },
  get enemies() {
    const by = {}; for (const e of enemies.list) if (e.alive) by[e.type] = (by[e.type] || 0) + 1;
    return { ...enemies.counts(), byType: by, list: enemies.list.filter(e => e.alive).slice(0, 80).map(e => ({ type: e.type, hp: Math.round(e.hp), max: Math.round(e.max), x: +e.x.toFixed(2), z: +e.z.toFixed(2), fly: e.fly, slow: e.slowT > 0, frozen: e.freezeT > 0, burn: e.burnT > 0, shield: e.shieldT > 0, shred: e.shredT > 0, state: e.state, blink: !!e.blinkUsed, tile: [e.tc, e.tr], remain: +e.remain.toFixed(1), elite: !!e.elite })) };
  },
  get bridges() { return ctx.W ? ctx.W.bridges.map(b => ({ state: b.state, lock: +b.lock.toFixed(1) })) : []; },
  get levers() { return ctx.W ? ctx.W.levers.map(l => ({ cool: +l.cool.toFixed(1), bridge: l.bridge })) : []; },
  get aux() { return ctx.W ? ctx.W.aux.map(a => ({ hp: +a.hp.toFixed(1), max: a.max, charge: +a.charge.toFixed(2), alive: a.alive })) : []; },
  get pads() { return ctx.W ? ctx.W.pads.map(p => ({ i: p.i, x: p.x, z: p.z, tower: p.tower ? p.tower.type : null })) : []; },
  get route() { return routeFrom(0); },
  get routes() { return ctx.W ? ctx.W.spawns.map((_, i) => routeFrom(i)) : []; },
  get boss() { return boss.info(); },
  get missions() { return MM.state(); },
  get difficulty() { return { ...G.diff, name: G.diffId }; },
  get quality() {
    const q = ctx.qcfg;
    const decor = ctx.W ? ctx.W.decor.reduce((a, m) => a + m.count, 0) : 0;
    return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, particles: q.particles, decor, lights: ctx.W ? ctx.W.lights.length : 0, fogFar: q.fogFar, weather: q.weather };
  },
  get perf() { return { ...game.perf, frames: game.frames, heapMB: /** @type {any} */ (performance).memory ? +(/** @type {any} */ (performance).memory.usedJSHeapSize / 1048576).toFixed(1) : null }; },
  get camera() { return { x: +cam.x.toFixed(2), z: +cam.z.toFixed(2), dist: +cam.dist.toFixed(2), yaw: +cam.yaw.toFixed(3) }; },
  get player() { return { x: +cam.x.toFixed(2), z: +cam.z.toFixed(2) }; },
  get tutorial() { return { on: G.tut.on, step: G.tut.step, id: G.tut.on && TUT[G.tut.step] ? TUT[G.tut.step].id : '' }; },
  get combos() { return G.combos; },
  get counts() { return { enemies: enemies.counts().total, towers: towers.list.length, shots: towers.shots(), particles: fx.count() }; },
  get save() { return JSON.parse(JSON.stringify(S)); },
  /** Coordenadas de pantalla de un objeto (para pruebas con toques/clics reales). */
  screenOf(kind, i = 0) {
    const W = ctx.W; if (!W) return null;
    applyCamera();
    const o = kind === 'pad' ? W.pads[i] : kind === 'lever' ? W.levers[i] : kind === 'aux' ? W.aux[i] : kind === 'crystal' ? W.crystal : kind === 'tower' ? towers.list[i] && towers.list[i].pad : null;
    if (!o) return null;
    const h = kind === 'tower' ? 1.2 : kind === 'aux' ? 0.9 : kind === 'crystal' ? 1.5 : kind === 'lever' ? 0.6 : 0.3;
    const s = toScreen(o.x, h, o.z);
    return { x: Math.round(s.x), y: Math.round(s.y), vis: s.vis && s.x > 0 && s.y > 0 && s.x < innerWidth && s.y < innerHeight };
  },
};
if (DEBUG) {
  /** @type {any} */ (hook).debug = {
    simulate: s => game.simulate(s),
    goto: i => { startMap(clamp(i | 0, 0, 2), false); return G.state; },
    unlockAll: () => { S.unlocked = 3; save.flush(); },
    setGold: n => { G.gold = n; },
    setCrystal: n => { G.crystal = n; if (n <= 0) loseMap(); },
    spawn: (type, n = 1, sp = 0) => { for (let i = 0; i < n; i++) { const e = enemies.spawn(type, sp, { wave: -1 }); if (e) e.wave = -1; } return enemies.counts().total; },
    startWave: i => { G.waveIdx = i; for (let k = 0; k < i; k++) G.waves[k].done = true; G.wavesDone = i; callWave(); },
    killAll: () => { for (const e of [...enemies.list]) if (e.alive && !e.isBoss) enemies.damage(e, 1e6, 'combo'); },
    clearWaves: () => {
      for (const q of G.queue) { const w = G.waves[q.wave]; if (w) w.total--; }
      G.queue.length = 0;
      for (const e of [...enemies.list]) if (e.alive && !e.isBoss) enemies.damage(e, 1e6, 'combo');
      G.waves.forEach((w, i) => { if (!w.done && w.spawned > 0) checkWave(i); });
    },
    spawnBoss: () => { const wi = MAPS[G.map].waves.findIndex(w => w.some(g => g[0] === 'titan')); if (wi < 0) return false; G.waveIdx = wi; for (let k = 0; k < wi; k++) G.waves[k].done = true; G.wavesDone = wi; G.phase = 'countdown'; callWave(); G.clock += 0.01; processQueue(); return true; },
    skipCine: () => skipCine(),
    bossPhase: p => boss.debugPhase(p),
    bossHp: f => { boss.T.hp = boss.T.max * f; },
    hurtBoss: n => enemies.damage(boss.T, n, 'combo'),
    hitBoss: (el, n) => +enemies.damage(boss.T, n, el).toFixed(2),
    /** Daña al enemigo vivo número i (orden de la lista del gancho) con un elemento. */
    hurtEnemy: (i, n, el) => { const e = enemies.list.filter(x => x.alive)[i]; return e ? +enemies.damage(e, n, el).toFixed(2) : -1; },
    status: (i, kind) => { const e = enemies.list.filter(x => x.alive)[i]; if (!e) return false; if (kind === 'slow') enemies.slow(e, 0.5, 3); else if (kind === 'freeze') enemies.freeze(e, 2); else if (kind === 'burn') enemies.burn(e, 5, 3); return true; },
    winMap: () => { for (const w of G.waves) w.done = true; G.wavesDone = G.waves.length - 1; G.waves[G.waves.length - 1].done = false; G.waves[G.waves.length - 1].alive = 0; G.waves[G.waves.length - 1].spawned = G.waves[G.waves.length - 1].total = 0; G.queue.length = 0; checkWave(G.waves.length - 1); },
    loseMap: () => { G.crystal = 0; loseMap(); },
    build: (pad, type) => buildTower(ctx.W.pads[pad], type),
    upgrade: pad => { const t = ctx.W.pads[pad].tower; return t ? upgradeTower(t) : false; },
    upgradeAll: () => towers.list.forEach(t => { while (t.lv < 2) { towers.upgrade(t); if (t.lv === 2) { G.maxed++; MM.emit('maxed'); } } }),
    charge: i => { const a = ctx.W.aux[i]; if (a) a.charge = 1; },
    hurtAux: (i, n) => { const a = ctx.W.aux[i]; if (a) hurtAux(a, n); },
    setSpeed: n => game.setSpeed(n),
    camTo: (x, z, d) => { cam.tx = cam.x = x; cam.tz = cam.z = z; if (d) cam.tdist = cam.dist = d; applyCamera(); },
    emit: (ev, v) => MM.emit(ev, v),
  };
}
Object.defineProperty(window, '__' + ID, { value: Object.freeze(hook), configurable: false, writable: false });
