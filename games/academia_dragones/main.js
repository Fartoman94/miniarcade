// @ts-check
/* Academia de Dragones — juego principal: estados, vuelo, cámara, regiones, pruebas, misiones, UI y ganchos de prueba. */
import { createGame, createInput, createSave, screen, toast, clamp, THREE } from '../../matelabs/kit3d.js';
import { ID, TITLE, ACCENT, SAVE_VERSION, DRAGONS, ELEMENT_MULT, DIFF, QUALITY, REGION_NAME, MISSIONS, SCORE } from './config.js';
import * as Mo from './models.js';
import { buildRegion } from './world.js';
import { createParticles, createSfx } from './fx.js';
import { createEnemyKit, createEnemies, RADIUS } from './enemies.js';
import { createBoss } from './boss.js';

const W = /** @type {any} */ (window);
const MLA = W.MLArcade, MLM = W.MLMissions;
const DEBUG = new URLSearchParams(location.search).has('debug');
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/* ======================= guardado ======================= */
const DEFAULTS = {
  campaign: { markers: /** @type {number[]} */ ([]), graduated: false, courseDone: false, raceDone: false, rescueDone: false, region: 'picos' },
  eggs: /** @type {string[]} */ ([]), dragon3: false, bossDefeated: false, best: 0, wins: 0, dragon: 'brisa', tutorial: false,
  bestCourse: 0, bestRace: 0,
  settings: { sens: 1, invert: false, assist: 'auto', shake: true },
};
const save = createSave(ID + ':save', SAVE_VERSION, DEFAULTS, () => structuredClone(DEFAULTS));
function sanitizeSave() {
  const d = /** @type {any} */ (save.get());
  const c = d.campaign && typeof d.campaign === 'object' ? d.campaign : {};
  const bool = v => v === true;
  d.campaign = {
    markers: Array.isArray(c.markers) ? [...new Set(c.markers.filter(n => Number.isInteger(n) && n >= 0 && n < 5))].sort() : [],
    graduated: bool(c.graduated), courseDone: bool(c.courseDone), raceDone: bool(c.raceDone), rescueDone: bool(c.rescueDone),
    region: ['picos', 'lago', 'volcan', 'tormenta'].includes(c.region) ? c.region : 'picos',
  };
  // las marcas deben ser consecutivas (0..n-1)
  const mk = d.campaign.markers; let n = 0; while (mk.includes(n)) n++; d.campaign.markers = Array.from({ length: n }, (_, i) => i);
  d.eggs = Array.isArray(d.eggs) ? d.eggs.filter(e => ['picos', 'lago', 'volcan'].includes(e)) : [];
  d.eggs = [...new Set(d.eggs)];
  d.dragon3 = bool(d.dragon3) || d.eggs.length >= 3;
  d.bossDefeated = bool(d.bossDefeated);
  d.best = Number.isFinite(d.best) && d.best > 0 ? Math.floor(d.best) : 0;
  d.wins = Number.isFinite(d.wins) && d.wins > 0 ? Math.floor(d.wins) : 0;
  d.bestCourse = Number.isFinite(d.bestCourse) && d.bestCourse > 0 ? d.bestCourse : 0;
  d.bestRace = Number.isFinite(d.bestRace) && d.bestRace > 0 ? d.bestRace : 0;
  d.tutorial = bool(d.tutorial);
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  d.settings = { sens: clamp(Number(s.sens) || 1, 0.5, 1.6), invert: bool(s.invert), assist: ['auto', 'on', 'off'].includes(s.assist) ? s.assist : 'auto', shake: s.shake !== false };
  if (!DRAGONS.some(x => x.id === d.dragon) || (d.dragon === 'ascua' && !d.dragon3)) d.dragon = 'brisa';
  // coherencia de la campaña (nunca dejar un bloqueo irreversible)
  if (d.campaign.markers.length < 5 && d.campaign.graduated) d.campaign.markers = [0, 1, 2, 3, 4];
  if (d.campaign.courseDone) d.campaign.graduated = true;
  if (d.campaign.graduated) { d.campaign.courseDone = true; d.campaign.markers = [0, 1, 2, 3, 4]; }
  save.flush();
}
sanitizeSave();
const SV = () => /** @type {typeof DEFAULTS} */ (save.get());
const trialsDone = () => { const c = SV().campaign; return (c.courseDone ? 1 : 0) + (c.raceDone ? 1 : 0) + (c.rescueDone ? 1 : 0); };
const continueRegion = () => { const u = unlocked(); return u.tormenta ? 'tormenta' : u.volcan ? 'volcan' : u.lago ? 'lago' : 'picos'; };
const unlocked = () => { const c = SV().campaign; return { picos: true, lago: c.graduated, volcan: c.raceDone, tormenta: c.rescueDone }; };

/* ======================= misiones ======================= */
MLM.setup({ gameId: ID, missions: MISSIONS, secondaryPerRun: 2, hud: 'none' });

/* ======================= estado ======================= */
/** @type {'menu'|'play'|'falling'|'travel'|'intro'|'outro'|'over'|'win'} */
let state = 'menu';
let sceneName = 'picos';
/** @type {any} */ let region = null;
/** @type {any} */ let enemies = null;
/** @type {any} */ let boss = null;
/** @type {any} */ let rival = null;
let score = 0, lives = 3, diffId = MLM.difficulty(), diff = DIFF[diffId], runActive = false, time = 0;
let qName = /** @type {'low'|'medium'|'high'} */ ('medium');
const run = {
  ringIdx: 0, courseActive: false, courseT: 0, courseRock: 0, raceActive: false, raceT: 0, rivalU: 0, rivalIdx: 0,
  nests: /** @type {Record<string,'nest'|'carried'|'delivered'>} */ ({}), carrying: /** @type {any[]} */ ([]), inns: /** @type {Record<string,boolean>} */ ({}),
  checkpoint: /** @type {{id?:string, pos:THREE.Vector3, yaw:number}|null} */ (null), shiny: false, kills: 0, rescued: 0, streak: 0, academy: 100,
  rockCd: 0, innCd: 0, fallT: 0, fallMsg: '', travelT: 0, travelTo: '', introT: 0, outroT: 0, bannerT: 0, portalOpen: false, rescueRun: 0, bounds: 0, deaths: 0,
};

/* ======================= motor ======================= */
const help = [
  'Girar: A/D o ←/→ · Subir/bajar el morro: W/S o ↑/↓',
  'Ascenso: Espacio o E · Descenso: C o Q · Turbo: Shift o K (gasta energía)',
  'Aliento: F, J o clic · Táctil: joystick + botones ▲ ▼ 🔥 ⚡',
  'Gamepad: stick dirección · A subir · B bajar · X/RT aliento · RB/LT turbo · Start pausa',
  'Seguí la flecha dorada: marcadores, aros, nidos, posadas y portales.',
  'Sin energía o al caer: volvés al último punto de control (posada) y perdés una vida.',
];
const game = createGame({
  id: ID, title: TITLE, accent: ACCENT, help, toolbar: 'tr', background: 0x1b2a4a, fov: 62, far: 700,
  gamepad: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'Space', b: 'KeyC', x: 'KeyF', y: 'KeyF', rb: 'ShiftLeft', lt: 'ShiftLeft', rt: 'KeyF', lb: 'KeyC' },
  isActive: () => state === 'play' || state === 'falling' || state === 'travel' || state === 'intro' || state === 'outro',
  update, render, onRestart: () => startRun(sceneName === 'tormenta' ? 'tormenta' : sceneName, true),
  onQuality: q => applyQuality(q),
  actions: [{ label: '🎓 Ver tutorial', fn: () => startTutorial(true) }, { label: '☰ Menú del juego', fn: () => toMenu() }],
});
const { scene, camera, renderer } = game;
const sfx = createSfx(game.audio);
const mats = Mo.makeMaterials();
const fx = createParticles(scene);
const enemyKit = createEnemyKit(mats);
const input = createInput(game.root, { joystick: 'left', buttons: [{ id: 'up', label: '▲', key: 'Space' }, { id: 'down', label: '▼', key: 'KeyC' }, { id: 'fire', label: '🔥', key: 'KeyF' }, { id: 'boost', label: '⚡', key: 'ShiftLeft' }] });
input.showTouch(false);
// botones táctiles con nombres accesibles en castellano
document.querySelectorAll('.k3-btn').forEach(b => {
  const n = { up: 'Subir', down: 'Bajar', fire: 'Aliento', boost: 'Turbo' }[/** @type {string} */ (b.getAttribute('aria-label'))];
  if (n) { b.setAttribute('data-btn', /** @type {string} */ (b.getAttribute('aria-label'))); b.setAttribute('aria-label', n); }
});
let mouseFire = false;
game.root.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0 && state === 'play') mouseFire = true; });

/* ======================= jugador ======================= */
const P = {
  pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1), ext: new THREE.Vector3(),
  yaw: 0, pitch: 0, roll: 0, speed: 30, energy: 100, maxEnergy: 100, alive: true, invuln: 0, boosting: false, breathCd: 0, charged: false,
  def: DRAGONS[0], mult: ELEMENT_MULT.viento, flapT: 0, hurtT: 0, turn: 0, vert: 0, rockHits: 0,
};
/** @type {any} */ let dragon = null;
const playerGroup = new THREE.Group(); scene.add(playerGroup);
function setDragon(id) {
  const def = DRAGONS.find(d => d.id === id) || DRAGONS[0];
  if (dragon) { playerGroup.remove(dragon.group); dragon.body.geometry.dispose(); dragon.wingR.geometry.dispose(); }
  dragon = Mo.makeDragon(def, mats); playerGroup.add(dragon.group);
  P.def = def; P.mult = ELEMENT_MULT[def.element]; P.maxEnergy = Math.round(100 * def.resist);
  P.energy = Math.min(P.energy, P.maxEnergy);
  for (const c of run.carrying) dragon.seat.add(c.mesh);
}
// flecha guía (apunta al objetivo actual)
const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false, transparent: true, opacity: 0.9, depthTest: false }));
arrow.renderOrder = 5; scene.add(arrow);

// proyectiles del aliento (pool)
const boltMats = { viento: new THREE.MeshBasicMaterial({ color: 0xc8f4ff, toneMapped: false }), tierra: new THREE.MeshBasicMaterial({ color: 0xc8a26a, toneMapped: false }), fuego: new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }), charged: new THREE.MeshBasicMaterial({ color: 0x8affd8, toneMapped: false }) };
const boltGeo = new THREE.IcosahedronGeometry(0.9, 0);
const bolts = Array.from({ length: 16 }, () => { const m = new THREE.Mesh(boltGeo, boltMats.viento); m.visible = false; scene.add(m); return { mesh: m, pos: m.position, vel: new THREE.Vector3(), life: 0, dmg: 1, el: 'viento', charged: false }; });

// rival de carrera (Nube) — se crea en el lago
const RIVAL_DEF = { body: 0xc9cfda, belly: 0xf4f6fa, wing: 0x6f7a8f, horn: 0x333a48, element: 'viento' };

/* ======================= temporales (sin asignaciones por cuadro) ======================= */
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 120, 220), camLook = new THREE.Vector3(), renderPos = new THREE.Vector3();
let camShake = 0, fovNow = 62, lastRender = 0;

/* ======================= HUD ======================= */
const H = {
  hud: $('adHud'), score: $('adScore'), lives: $('adLives'), energy: $('adEnergy'), energyBar: $('adEnergyBar'), obj: $('adObj'), region: $('adRegion'),
  objText: $('adObjText'), mis: $('adMis'), boss: $('adBoss'), phase: $('adPhase'), bossHp: $('adBossHp'), acad: $('adAcad'), carry: $('adCarry'),
  warn: $('adWarn'), tip: $('adTip'), tipText: $('adTipText'), tipSkip: $('adTipSkip'), banner: $('adBanner'), fade: $('adFade'), hurt: $('adHurt'),
};
let hudT = 0, lastScoreShown = -1;
const cache = { obj: '', lives: '', mis: '', carry: '' };
function setText(el, key, txt) { if (cache[key] !== txt) { cache[key] = txt; el.textContent = txt; } }
function banner(title, sub = '', secs = 2.4) {
  H.banner.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`; H.banner.hidden = false; run.bannerT = secs;
}
function addScore(n) { score += Math.round(n); }

/* ======================= tutorial ======================= */
const TUT = [
  { k: 'turn', pc: 'Girá con A / D o ← / →.', touch: 'Arrastrá el joystick a los costados para girar.' },
  { k: 'vert', pc: 'Subí y bajá: W / S (morro) o Espacio / C (aleteo y picada).', touch: 'Subí y bajá con ▲ y ▼ (o el joystick arriba/abajo).' },
  { k: 'boost', pc: 'Turbo: mantené Shift o K. Gasta energía, que se recarga planeando.', touch: 'Mantené ⚡ para el turbo. Gasta energía.' },
  { k: 'fire', pc: 'Aliento: F, J o clic. Derriba rivales y enciende faroles.', touch: 'Tocá 🔥 para lanzar tu aliento.' },
  { k: 'goal', pc: 'Seguí la flecha dorada hasta la primera columna de luz.', touch: 'Seguí la flecha dorada hasta la primera columna de luz.' },
];
const tut = { step: -1, acc: 0 };
function startTutorial(force = false) {
  if (state !== 'play' && !force) return;
  tut.step = 0; tut.acc = 0; showTip();
}
function showTip() {
  if (tut.step < 0 || tut.step >= TUT.length) { H.tip.hidden = true; return; }
  const s = TUT[tut.step];
  H.tipText.textContent = `${tut.step + 1}/${TUT.length} · ${input.isTouch ? s.touch : s.pc}`;
  H.tip.hidden = false;
}
function endTutorial() { tut.step = -1; H.tip.hidden = true; if (!SV().tutorial) save.set({ tutorial: true }); }
H.tipSkip.addEventListener('click', e => { e.stopPropagation(); endTutorial(); });
H.tipSkip.addEventListener('pointerdown', e => e.stopPropagation());
function tutorialStep(dt) {
  if (tut.step < 0) return;
  const k = TUT[tut.step].k;
  let ok = false;
  if (k === 'turn') ok = Math.abs(P.turn) > 0.4;
  else if (k === 'vert') ok = Math.abs(P.vert) > 0.4;
  else if (k === 'boost') ok = P.boosting;
  else if (k === 'fire') ok = P.breathCd > 0;
  else ok = SV().campaign.markers.length > 0 || sceneName !== 'picos';
  tut.acc = ok ? tut.acc + dt : Math.max(0, tut.acc - dt * 0.5);
  if (tut.acc > (k === 'fire' ? 0.05 : k === 'goal' ? 0.01 : 0.35)) {
    tut.step++; tut.acc = 0; sfx.ui();
    if (tut.step >= TUT.length) endTutorial(); else showTip();
  }
}

/* ======================= calidad ======================= */
function applyQuality(q) {
  qName = q; const Q = QUALITY[q];
  camera.far = Q.far; camera.updateProjectionMatrix();
  fx.setLimit(Q.particles);
  if (region) {
    region.applyQuality(q, Q);
    if (region.setMirror) region.setMirror(Q.mirror);
    const p = region.palette;
    scene.fog = new THREE.Fog(p.fog, p.fogN * Q.fog, Math.min(p.fogF * Q.fog, Q.far * 0.96));
  }
}

/* ======================= regiones ======================= */
function disposeRegion() {
  if (enemies) { enemies.dispose(); enemies = null; }
  if (boss) { boss.dispose(); boss = null; }
  if (rival) { scene.remove(rival.group); rival.body.geometry.dispose(); rival.wingR.geometry.dispose(); rival = null; }
  if (region) { region.dispose(); region = null; }
  for (const b of bolts) { b.life = 0; b.mesh.visible = false; }
  fx.clear();
}

/** @param {string} kind */
function loadRegion(kind) {
  disposeRegion();
  sceneName = kind;
  const Q = QUALITY[qName];
  region = buildRegion(kind, { scene, renderer, mats, q: Q, ringScale: diff.ring, reduced: reducedMQ.matches });
  // estado de la sesión
  run.ringIdx = 0; run.courseActive = false; run.courseT = 0; run.courseRock = 0; run.raceActive = false; run.raceT = 0; run.rivalU = 0; run.rivalIdx = 0;
  run.checkpoint = null; run.portalOpen = false; run.academy = 100;
  for (const c of run.carrying) c.mesh.removeFromParent();
  run.carrying.length = 0;
  for (const n of region.nests) { if (!(n.id in run.nests) || run.nests[n.id] === 'carried') run.nests[n.id] = 'nest'; refreshNest(n); }
  for (const e of region.eggs) e.group.visible = e.shiny ? !run.shiny : !SV().eggs.includes(e.id);
  for (const it of region.inns) { it.active = !!run.inns[it.id]; refreshInn(it); }
  if (kind === 'picos' && SV().campaign.markers.length >= 5) run.courseActive = true;
  refreshMarkers(); refreshRings();
  updatePortal();
  // rivales
  enemies = createEnemies(enemyKit, scene, { player: P, fx, sfx, damage: hurtPlayer, onKill, diff, reduced: reducedMQ.matches });
  enemies.populate(region.enemySpawns, diff.enemies);
  if (kind === 'lago') {
    rival = Mo.makeDragon(RIVAL_DEF, mats); rival.group.scale.setScalar(0.95); scene.add(rival.group);
    rival.curve = new THREE.CatmullRomCurve3(region.rings.map(r => r.pos.clone()), false, 'centripetal');
    rival.len = rival.curve.getLength();
    placeRivalAtStart();
  }
  if (kind === 'tormenta') {
    boss = createBoss(scene, mats, { player: P, fx, sfx, damage: hurtPlayer, diff, reduced: reducedMQ.matches, height: region.height, academy: new THREE.Vector3(0, 70, 0),
      onPhase: p => { banner(p === 2 ? 'FASE 2' : 'FASE 3', p === 2 ? 'OJO DEL CICLÓN · pasá por los aros de calma y golpeá la cabeza aturdida' : 'FURIA · rayos, orbes y embestidas', 3); },
      onDefeated: onBossDefeated, damageAcademy: n => { run.academy = Math.max(0, run.academy - n); toast('¡Un orbe golpeó la academia!', 1400); if (run.academy <= 0) gameOver('La academia cayó ante la tormenta'); },
      onOrbPop: () => { addScore(SCORE.orb); }, hemi: region.hemi });
  }
  resetPlayer(region.start.pos, region.start.yaw);
  applyQuality(qName);
  camPos.copy(P.pos).add(_v.set(0, 8, 26)); camLook.copy(P.pos);
}

function resetPlayer(pos, yaw) {
  P.pos.copy(pos); P.prev.copy(pos); P.yaw = yaw; P.pitch = 0; P.roll = 0; P.speed = 30 * P.def.speed; P.vel.set(0, 0, 0); P.ext.set(0, 0, 0);
  P.energy = P.maxEnergy; P.alive = true; P.invuln = 2; P.boosting = false; P.charged = false;
  forwardFrom(P.yaw, P.pitch, P.fwd);
}
function forwardFrom(yaw, pitch, out) { const cp = Math.cos(pitch); return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp); }

function refreshMarkers() {
  if (!region) return;
  const done = SV().campaign.markers.length;
  region.markers.forEach((m, i) => {
    const st = i < done ? 'done' : i === done ? 'next' : 'pend';
    m.colMat.color.setHex(st === 'done' ? 0x6be38a : st === 'next' ? 0xffc94a : 0x7fd7ff);
    m.colMat.opacity = st === 'done' ? 0.12 : st === 'next' ? 0.32 : 0.12;
    if (m.lamp) /** @type {any} */ (m.lamp.material).color.setHex(i < done ? 0xffd34d : 0x445566);
    if (m.band) m.band.visible = i >= done;
  });
}
function refreshRings() {
  if (!region) return;
  const active = run.courseActive || sceneName === 'lago';
  region.rings.forEach((r, i) => {
    r.mesh.visible = active;
    r.mesh.material = i < run.ringIdx ? region.ringMats.done : i === run.ringIdx ? region.ringMats.next : region.ringMats.pend;
    r.mesh.scale.setScalar(i === run.ringIdx ? 1.12 : 1);
  });
}
function refreshNest(n) {
  const st = run.nests[n.id];
  n.creature.visible = st === 'nest'; n.beacon.visible = st === 'nest';
}
function refreshInn(it) {
  it.lampMat.color.setHex(it.active ? 0xffd34d : 0x556677);
}
function regionTrialDone(kind = sceneName) {
  const c = SV().campaign;
  return kind === 'picos' ? c.courseDone : kind === 'lago' ? c.raceDone : kind === 'volcan' ? c.rescueDone : false;
}
function updatePortal() { if (!region) return; run.portalOpen = regionTrialDone() && sceneName !== 'tormenta'; region.portal.visible = run.portalOpen; }

/* ======================= partida ======================= */
function emitPersisted() {
  MLM.emit('trials', trialsDone());
  if (SV().dragon3) MLM.emit('dragon3');
}
/** @param {string} kind @param {boolean} [restart] */
function startRun(kind, restart = false) {
  if (runActive) finishRun(false);
  diffId = MLM.difficulty(); diff = DIFF[diffId];
  lives = diff.lives; score = 0;
  run.nests = {}; run.inns = {}; run.shiny = false; run.kills = 0; run.rescued = 0; run.rescueRun = 0; run.deaths = 0; run.streak = 0;
  P.rockHits = 0;
  setDragon(SV().dragon);
  MLM.runStart(); runActive = true;
  MLA.started();
  emitPersisted();
  hideScreens();
  loadRegion(kind);
  H.hud.hidden = false; input.showTouch(true);
  state = 'play';
  MLA.refresh();
  if (kind === 'tormenta') beginBossIntro();
  else banner(REGION_NAME[kind].toUpperCase(), regionSubtitle(kind));
  if (kind === 'picos' && !SV().tutorial) startTutorial(); else { tut.step = -1; H.tip.hidden = true; }
  if (restart) toast('Partida reiniciada', 1200);
  H.fade.style.opacity = '0';
}
function regionSubtitle(kind) {
  return kind === 'picos' ? 'ENTRENAMIENTO Y CIRCUITO DE AROS' : kind === 'lago' ? 'CARRERA DE LOS ESPEJOS' : kind === 'volcan' ? 'RESCATE EN EL VOLCÁN' : '';
}
/** @param {boolean} won */
function finishRun(won) {
  if (!runActive) return;
  runActive = false;
  MLM.runEnd({ won });
  MLA.ended({ score });
  if (score > SV().best) save.set({ best: score });
}
function gameOver(msg) {
  if (state === 'over' || state === 'win') return;
  state = 'over'; P.alive = false; sfx.lose();
  finishRun(false);
  H.tip.hidden = true; input.showTouch(false);
  endScreen.show(endHTML(false, msg)); MLA.refresh();
}
function onBossDefeated() {
  const first = !SV().bossDefeated;
  addScore(SCORE.boss + lives * 500 + Math.round(run.academy) * 20);
  save.set({ bossDefeated: true, wins: SV().wins + 1 });
  MLM.emit('bossDefeated');
  banner('¡ACADEMIA SALVADA!', first ? 'LA SERPIENTE DE TORMENTA SE DISIPÓ' : 'OTRA VEZ, ¡GUARDIÁN!', 3);
  sfx.win();
  if (!reducedMQ.matches) for (let i = 0; i < 6; i++) fx.burst((Math.random() - 0.5) * 80, 110 + Math.random() * 40, (Math.random() - 0.5) * 80, 30, [0xffc94a, 0x8affd8, 0xff9f43][i % 3], 22, 1.4, 4);
  state = 'outro'; run.outroT = 3.2;
}
function victory() {
  state = 'win'; finishRun(true);
  H.tip.hidden = true; input.showTouch(false);
  endScreen.show(endHTML(true, '')); MLA.refresh();
}
function toMenu() {
  if (runActive) finishRun(false);
  state = 'menu'; H.hud.hidden = true; H.tip.hidden = true; H.banner.hidden = true; input.showTouch(false); H.fade.style.opacity = '0';
  endScreen.hide(); MLA.refresh();
  if (!region || sceneName === 'tormenta') loadRegion('picos');
  P.invuln = 0;
  showMenu();
}

/* ======================= daño, caídas y reaparición ======================= */
function hurtPlayer(amount, src) {
  if (!P.alive || P.invuln > 0 || state !== 'play') return;
  const dmg = amount * diff.damage / P.def.resist;
  P.energy -= dmg; P.invuln = 0.9; P.hurtT = 0.4;
  sfx.hit(); if (SV().settings.shake && !reducedMQ.matches) camShake = Math.min(1, camShake + 0.5);
  fx.burst(P.pos.x, P.pos.y, P.pos.z, 10, 0xff6a5a, 10, 0.5);
  run.streak = 0;
  if (P.energy <= 0) { P.energy = 0; fall(`Sin energía (${src})`); }
}
function fall(msg) {
  if (!P.alive) return;
  P.alive = false; state = 'falling'; run.fallT = 1.5; run.fallMsg = msg; run.deaths++;
  sfx.fall(); toast(msg, 1600);
  // las crías vuelven a su nido; la carrera vuelve a la largada
  for (const c of run.carrying) { run.nests[c.nest.id] = 'nest'; refreshNest(c.nest); c.mesh.removeFromParent(); }
  run.carrying.length = 0;
  if (run.raceActive) { run.raceActive = false; run.ringIdx = 0; placeRivalAtStart(); refreshRings(); }
  if (enemies) enemies.clearShots();
  if (boss) boss.clearHazards();
}
function respawn() {
  lives--;
  if (lives <= 0) { gameOver(run.fallMsg); return; }
  const cp = run.checkpoint || region.start;
  resetPlayer(cp.pos, cp.yaw);
  P.invuln = 2.5;
  camPos.copy(P.pos).add(_v.set(Math.sin(P.yaw) * 20, 8, Math.cos(P.yaw) * 20));
  state = 'play';
  banner(`${'❤'.repeat(lives)}`, run.checkpoint ? 'DE VUELTA EN LA POSADA' : 'DE VUELTA AL INICIO', 1.6);
}

/* ======================= vuelo ======================= */
function assistOn() { const a = SV().settings.assist; return a === 'on' || (a === 'auto' && input.isTouch); }

function updatePlayer(dt) {
  const st = SV().settings, ax = input.axis();
  const sens = st.sens;
  let turn = ax.x * sens;
  let vert = -ax.y * (st.invert ? -1 : 1) * sens;
  if (input.button('up') || input.down('KeyE')) vert += 1;
  if (input.button('down') || input.down('KeyQ')) vert -= 1;
  vert = clamp(vert, -1, 1); turn = clamp(turn, -1.3, 1.3);
  P.turn = turn; P.vert = vert;
  const assist = assistOn();
  // asistencia: imán suave hacia el aro/objetivo cercano que está adelante, y evitar el suelo
  if (assist && state === 'play') {
    const tg = objectiveTarget();
    if (tg) {
      _v.subVectors(tg, P.pos); const d = _v.length();
      if (d < 90 && d > 4) {
        _v.divideScalar(d);
        if (_v.dot(P.fwd) > 0.75) {
          const wantYaw = Math.atan2(-_v.x, -_v.z); let dy = wantYaw - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          if (Math.abs(turn) < 0.2) P.yaw += clamp(dy, -1, 1) * dt * 0.9;
          if (Math.abs(vert) < 0.2) vert += clamp(Math.asin(clamp(_v.y, -1, 1)) * 1.4, -0.6, 0.6);
        }
      }
    }
  }
  const ground = Math.max(region.height(P.pos.x, P.pos.z), region.floorY);
  const clearance = P.pos.y - ground;
  if ((assist || clearance < 6) && clearance < 14 && vert <= 0.1) vert = Math.max(vert, (14 - clearance) / 14 * 0.8);
  // cabeceo con nivelación automática
  const targetPitch = vert * 0.78;
  const rate = vert === 0 ? (assist ? 3.2 : 1.8) : 3.4;
  P.pitch += (targetPitch - P.pitch) * (1 - Math.exp(-dt * rate));
  P.yaw -= turn * 1.55 * dt;
  P.roll += (turn * 0.85 - P.roll) * (1 - Math.exp(-dt * 4));
  // turbo y energía
  const wantBoost = (input.button('boost') || input.down('ShiftRight') || input.down('KeyK')) && P.energy > 4;
  if (wantBoost && !P.boosting) sfx.boost();
  P.boosting = wantBoost;
  const base = 30 * P.def.speed;
  let target = base * (P.boosting ? 1.6 : 1) - P.pitch * 14;
  P.speed += (target - P.speed) * (1 - Math.exp(-dt * 1.6));
  // corrientes ascendentes y viento del ciclón
  P.ext.multiplyScalar(Math.exp(-dt * 2));
  let inUpdraft = false;
  for (const u of region.updrafts) if ((P.pos.x - u.x) ** 2 + (P.pos.z - u.z) ** 2 < u.r * u.r && P.pos.y < 200) { P.ext.y += 30 * dt; inUpdraft = true; }
  if (boss && boss.S.phase >= 2 && boss.S.active) {
    const d = Math.hypot(P.pos.x, P.pos.z);
    if (d > 110) { P.ext.x -= P.pos.x / d * 9 * dt; P.ext.z -= P.pos.z / d * 9 * dt; }
  }
  if (P.boosting) P.energy -= 9 * dt;
  else P.energy = Math.min(P.maxEnergy, P.energy + (inUpdraft ? 9 : 3.2) * diff.regen * dt);
  if (P.energy <= 0) { P.energy = 0; fall('Te quedaste sin energía'); return; }
  forwardFrom(P.yaw, P.pitch, P.fwd);
  P.prev.copy(P.pos);
  P.vel.copy(P.fwd).multiplyScalar(P.speed).add(P.ext);
  P.pos.addScaledVector(P.vel, dt);
  // límites: techo y borde de la región
  if (P.pos.y > 255) { P.pos.y = 255; if (P.pitch > 0) P.pitch *= 0.9; }
  const dc = Math.hypot(P.pos.x, P.pos.z);
  if (dc > 440) {
    const wantYaw = Math.atan2(P.pos.x, P.pos.z); let dy = wantYaw - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    P.yaw += clamp(dy, -1, 1) * dt * 1.6;
    if (dc > 470) { P.pos.x *= 470 / dc; P.pos.z *= 470 / dc; }
    if (run.bounds <= 0) { toast('Límite de la región: volvé hacia el centro', 1500); run.bounds = 4; }
  }
  run.bounds -= dt;
  // suelo letal (mar de nubes, agua, lava)
  if (P.pos.y < region.floorY + 1.2) {
    fall(region.floorKind === 'nubes' ? '¡Caíste al mar de nubes!' : region.floorKind === 'agua' ? '¡Al agua! Los dragones de aire no nadan' : '¡Cuidado con la lava!');
    return;
  }
  // terreno: rebote con daño
  const h = region.height(P.pos.x, P.pos.z);
  if (P.pos.y < h + 1.8) {
    P.pos.y = h + 2.2; P.pitch = 0.5; P.speed *= 0.6;
    rockHit(14, 'ladera');
  }
  // obstáculos (peñascos, cristales, arcos, academia)
  for (const o of region.obstacles) {
    if (o.type === 's') {
      const dx = P.pos.x - o.x, dy = P.pos.y - o.y, dz = P.pos.z - o.z, rr = o.r + 1.8, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1; P.pos.set(o.x + dx / d * (rr + 0.1), o.y + dy / d * (rr + 0.1), o.z + dz / d * (rr + 0.1));
        P.speed *= 0.65; if (o.rock) rockHit(10, 'peñasco');
      }
    } else if (P.pos.y > (o.y0 ?? 0) - 1.8 && P.pos.y < (o.y1 ?? 0) + 1.8) {
      const dx = P.pos.x - o.x, dz = P.pos.z - o.z, rr = o.r + 1.8, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        if (P.pos.y > (o.y1 ?? 0) - 1) P.pos.y = (o.y1 ?? 0) + 1.9;
        else { const d = Math.sqrt(d2) || 1; P.pos.x = o.x + dx / d * (rr + 0.1); P.pos.z = o.z + dz / d * (rr + 0.1); }
        P.speed *= 0.65; if (o.rock) rockHit(10, 'roca');
      }
    }
  }
  // aliento
  P.breathCd -= dt;
  if ((input.hit('KeyF', 'KeyJ', 'btn:fire') || mouseFire) && P.breathCd <= 0) breathe();
  mouseFire = false;
  P.invuln -= dt; P.hurtT -= dt;
  P.flapT += dt * (P.boosting ? 1.6 : 1) * (1 + Math.max(0, vert) * 0.8);
  if (vert > 0.5 && Math.sin(P.flapT * 7) > 0.95) sfx.flap();
}
function rockHit(dmg, src) {
  if (run.rockCd > 0) return;
  run.rockCd = 0.8; P.rockHits++;
  if (run.courseActive || run.raceActive) run.courseRock++;
  sfx.rock();
  hurtPlayer(dmg, src);
  fx.burst(P.pos.x, P.pos.y, P.pos.z, 12, 0xb8b0a0, 9, 0.6, 8);
}

function breathe() {
  const el = P.def.element, cost = 2.5;
  if (P.energy < cost) return;
  P.energy -= cost; P.breathCd = 0.33;
  const n = el === 'viento' ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const b = bolts.find(q => q.life <= 0); if (!b) break;
    // boca a partir del estado de simulación (no de la pose del último render): determinista
    _v.copy(P.pos).addScaledVector(P.fwd, 6.2); _v.y += 1.35 * Math.cos(P.pitch);
    b.pos.copy(_v);
    _w.set(-P.fwd.z, 0, P.fwd.x).normalize();
    b.vel.copy(P.fwd).addScaledVector(_w, n > 1 ? (k ? 0.05 : -0.05) : 0).normalize().multiplyScalar(el === 'tierra' ? 85 : 100).add(P.vel);
    b.life = 1.15; b.el = el; b.charged = P.charged; b.dmg = P.def.power * (P.charged ? 3 : 1);
    b.mesh.material = P.charged ? boltMats.charged : boltMats[el]; b.mesh.visible = true;
    b.mesh.scale.setScalar(el === 'tierra' ? 1.3 : P.charged ? 1.6 : 1);
  }
  if (P.charged) { P.charged = false; toast('¡Aliento cargado!', 900); }
  sfx.breath(el);
}

function updateBolts(dt) {
  const assist = assistOn();
  for (const b of bolts) {
    if (b.life <= 0) continue;
    b.life -= dt;
    // asistencia de puntería: curva leve hacia el blanco más cercano en un cono
    if (assist || b.life > 0.9) {
      const tg = nearestBoltTarget(b.pos, b.vel);
      if (tg) { const sp = b.vel.length(); _v.subVectors(tg, b.pos).normalize().multiplyScalar(sp); b.vel.lerp(_v, assist ? 0.12 : 0.05); }
    }
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.rotation.x += dt * 9; b.mesh.rotation.y += dt * 7;
    if ((game.frames & 1) === 0) fx.trail(b.pos.x, b.pos.y, b.pos.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, b.charged ? 0x8affd8 : b.el === 'fuego' ? 0xff7a2a : b.el === 'tierra' ? 0xb08a5a : 0xbfefff, 0.35);
    let hit = false;
    // rivales
    if (enemies) for (const e of enemies.list) {
      if (!e.alive) continue;
      if (e.pos.distanceToSquared(b.pos) < (RADIUS[e.kind] + 1) ** 2) {
        enemies.damage(e, b.dmg * (P.mult[e.kind] || 1), b.el); hit = true; break;
      }
    }
    // farol del marcador de aliento
    if (!hit && sceneName === 'picos' && region.markers.length) {
      const idx = SV().campaign.markers.length, m = region.markers[idx];
      if (m && m.type === 'breath' && _v.set(m.x, m.y, m.z).distanceToSquared(b.pos) < 5 * 5) { completeMarker(idx); hit = true; }
    }
    // jefe
    if (!hit && boss) {
      const r = boss.tryHit(b.pos, b.dmg * P.mult.boss);
      if (r) { hit = true; if (r === 'scale' || r === 'head') addScore(r === 'head' ? 150 : 100); }
    }
    if (!hit && b.pos.y < region.height(b.pos.x, b.pos.z)) hit = true;
    if (hit || b.life <= 0) { b.life = 0; b.mesh.visible = false; if (hit) fx.burst(b.pos.x, b.pos.y, b.pos.z, 8, 0xffffff, 8, 0.3); }
  }
}
function nearestBoltTarget(pos, vel) {
  let best = null, bestD = 1e9;
  const sp = vel.length() || 1;
  const consider = (p) => {
    _t.subVectors(p, pos); const d = _t.length(); if (d > 130 || d < 1) return;
    const c = _t.dot(vel) / (d * sp); if (c < 0.93) return;
    if (d < bestD) { bestD = d; best = p; }
  };
  if (enemies) for (const e of enemies.list) if (e.alive) consider(e.pos);
  if (boss && boss.S.active) {
    for (const o of boss.orbs) if (o.alive) consider(o.pos);
    if (boss.S.mode === 'stunned') consider(boss.S.pos);
    for (const sc of boss.scales) if (sc.mesh.visible) consider(sc.mesh.position);
  }
  if (sceneName === 'picos' && region.markers.length) { const m = region.markers[SV().campaign.markers.length]; if (m && m.type === 'breath') consider(_u.set(m.x, m.y, m.z)); }
  return best;
}

function onKill(kind, pos) {
  run.kills++; addScore(SCORE[kind] || 100); MLM.emit('enemy');
}

/* ======================= interactivos ======================= */
const _ringPt = new THREE.Vector3();
function updateRings() {
  if (!region.rings.length) return;
  const racing = sceneName === 'lago';
  if (!run.courseActive && !racing) return;
  const r = region.rings[run.ringIdx]; if (!r) return;
  _v.subVectors(P.prev, r.pos); const d0 = _v.dot(r.normal);
  _w.subVectors(P.pos, r.pos); const d1 = _w.dot(r.normal);
  if ((d0 < 0) !== (d1 < 0)) {
    const t = d0 / (d0 - d1);
    _ringPt.copy(P.prev).lerp(P.pos, t);
    if (_ringPt.distanceTo(r.pos) < region.ringR + 0.6) passRing();
    else if (_ringPt.distanceTo(r.pos) < region.ringR + 10) { sfx.miss(); run.streak = 0; }
  }
}
function passRing() {
  const r = region.rings[run.ringIdx];
  run.streak++;
  sfx.ring(run.streak);
  fx.burst(r.pos.x, r.pos.y, r.pos.z, 22, 0xffc94a, 14, 0.7);
  addScore(SCORE.ring + Math.min(10, run.streak) * 10);
  if (sceneName === 'lago' && run.ringIdx === 0 && !run.raceActive) {
    run.raceActive = true; run.raceT = 0; run.courseRock = 0; run.rivalU = 0;
    banner('¡LARGARON!', 'GANALE A NUBE EN LA CARRERA DE LOS ESPEJOS', 1.6);
  }
  if (sceneName === 'picos' && run.ringIdx === 0) { run.courseT = 0; run.courseRock = 0; }
  run.ringIdx++;
  if (run.ringIdx >= region.rings.length) {
    if (sceneName === 'picos') courseComplete(); else raceWon();
  }
  refreshRings();
}
function courseComplete() {
  const c = SV().campaign, first = !c.courseDone, t = run.courseT;
  addScore(SCORE.trial + Math.max(0, 90 - t) * 15);
  if (run.courseRock === 0) MLM.emit('cleanCircuit');
  if (!SV().bestCourse || t < SV().bestCourse) save.set({ bestCourse: Math.round(t * 10) / 10 });
  if (first) {
    c.courseDone = true; c.graduated = true; save.flush();
    MLM.emit('graduate'); MLM.emit('trials', trialsDone());
    banner('¡GRADUADO!', 'APRENDIZ DE LA ACADEMIA · SE ABRIÓ EL PORTAL AL LAGO', 3);
  } else banner('CIRCUITO SUPERADO', `${t.toFixed(1)} s${run.courseRock === 0 ? ' · SIN TOCAR ROCA' : ''}`, 2.4);
  sfx.win();
  run.ringIdx = 0; run.courseT = 0; run.courseRock = 0;
  updatePortal();
}
function raceWon() {
  const c = SV().campaign, first = !c.raceDone, t = run.raceT;
  run.raceActive = false;
  addScore(SCORE.trial + Math.max(0, 100 - t) * 15);
  if (run.courseRock === 0) MLM.emit('cleanCircuit');
  if (!SV().bestRace || t < SV().bestRace) save.set({ bestRace: Math.round(t * 10) / 10 });
  if (first) { c.raceDone = true; save.flush(); MLM.emit('trials', trialsDone()); banner('¡LE GANASTE A NUBE!', 'PRUEBA SUPERADA · PORTAL AL VOLCÁN ABIERTO', 3); }
  else banner('¡CARRERA GANADA!', `${t.toFixed(1)} s`, 2.4);
  sfx.win();
  run.ringIdx = 0; placeRivalAtStart(); refreshRings(); updatePortal();
}
function raceLost() {
  run.raceActive = false; run.ringIdx = 0; sfx.lose();
  banner('NUBE GANÓ', 'VOLVÉ AL ARO DE LARGADA PARA LA REVANCHA', 2.6);
  placeRivalAtStart(); refreshRings();
}
function placeRivalAtStart() {
  if (!rival) return;
  run.rivalU = 0; run.rivalIdx = 0;
  rival.curve.getPointAt(0, rival.group.position); rival.group.position.x += 6;
}
function updateRival(dt) {
  if (!rival) return;
  const g = rival.group;
  if (run.raceActive) {
    run.raceT += dt;
    const speed = 31 * diff.rival;
    run.rivalU = Math.min(1, run.rivalU + speed * dt / rival.len);
    rival.curve.getPointAt(run.rivalU, _v);
    rival.curve.getTangentAt(Math.min(0.999, run.rivalU + 0.001), _w);
    _u.set(-_w.z, 0, _w.x).normalize().multiplyScalar(6);
    g.position.copy(_v).add(_u);
    g.lookAt(_t.copy(g.position).add(_w)); g.rotateY(Math.PI);
    run.rivalIdx = Math.min(region.rings.length, Math.floor(run.rivalU * (region.rings.length - 1) + 0.0001) + (run.rivalU >= 1 ? 1 : 0));
    if (run.rivalU >= 1) raceLost();
  } else {
    g.position.y += Math.sin(time * 2) * 0.02;
    _v.copy(region.rings[1].pos); g.lookAt(_v); g.rotateY(Math.PI);
  }
  Mo.flap(rival, time, 0.7, run.raceActive ? 9 : 5);
}

function completeMarker(i) {
  const c = SV().campaign; if (c.markers.includes(i)) return;
  c.markers.push(i); save.flush();
  const m = region.markers[i];
  sfx.marker(); addScore(SCORE.marker);
  fx.burst(m.x, m.y, m.z, 40, 0xffc94a, 20, 1.0);
  refreshMarkers();
  if (c.markers.length >= 5) {
    run.courseActive = true; run.ringIdx = 0; refreshRings();
    banner('¡ENTRENAMIENTO COMPLETO!', 'AHORA EL CIRCUITO DE AROS: SEGUÍ LOS AROS DORADOS', 3);
  } else toast(`Marcador ${c.markers.length}/5 ✔ · ${region.markers[c.markers.length].label}`, 2200);
}
const markerHint = { t: 0 };
function updateMarkers(dt) {
  if (sceneName !== 'picos') return;
  const idx = SV().campaign.markers.length; if (idx >= 5) return;
  const m = region.markers[idx];
  const dh = Math.hypot(P.pos.x - m.x, P.pos.z - m.z);
  markerHint.t -= dt;
  if (dh < 9.5 && Math.abs(P.pos.y - m.y) < 36) {
    let ok = false, hint = '';
    if (m.type === 'pass') ok = true;
    else if (m.type === 'climb') { ok = P.pos.y >= m.need; hint = '¡Más alto! Pasá por encima del anillo dorado'; }
    else if (m.type === 'dive') { ok = P.vel.y < -8; hint = 'Entrá en picada: bajá con fuerza (S, ↓ o ▼)'; }
    else if (m.type === 'boost') { ok = P.boosting; hint = 'Mantené el turbo mientras la atravesás'; }
    else if (m.type === 'breath') { hint = 'Lanzá tu aliento al farol del centro'; }
    if (ok) completeMarker(idx);
    else if (hint && markerHint.t <= 0) { toast(hint, 1600); markerHint.t = 2.5; }
  }
}
function updateEggs() {
  for (const e of region.eggs) {
    if (!e.group.visible) continue;
    if (e.pos.distanceToSquared(P.pos) < 8 * 8 || _v.copy(e.pos).setY(e.pos.y + 1.5).distanceToSquared(P.pos) < 8 * 8) collectEgg(e);
  }
}
function collectEgg(e) {
  e.group.visible = false; sfx.egg();
  fx.burst(e.pos.x, e.pos.y + 2, e.pos.z, 36, e.shiny ? 0xff9fe0 : 0xffd34d, 16, 1.1);
  if (e.shiny) { run.shiny = true; addScore(SCORE.shiny); MLM.emit('shinyEgg'); banner('¡HUEVO BRILLANTE!', 'UN TESORO DEL LAGO DE ESPEJOS', 2.2); return; }
  const d = SV(); if (!d.eggs.includes(e.id)) d.eggs.push(e.id);
  addScore(SCORE.egg);
  if (d.eggs.length >= 3 && !d.dragon3) {
    d.dragon3 = true; save.flush(); MLM.emit('dragon3');
    banner('¡NACIÓ ASCUA!', 'TERCER DRAGÓN DESBLOQUEADO (ELEGILO EN EL MENÚ)', 3);
  } else { save.flush(); toast(`Huevo dorado ${d.eggs.length}/3`, 1800); }
}
function updateNests(dt) {
  for (const n of region.nests) {
    if (run.nests[n.id] !== 'nest' || run.carrying.length >= 3) continue;
    if (n.pos.distanceToSquared(P.pos) < 12 * 12 || _v.copy(n.pos).setY(n.pos.y + 3).distanceToSquared(P.pos) < 12 * 12) {
      run.nests[n.id] = 'carried'; refreshNest(n);
      const mesh = new THREE.Mesh(n.creature.geometry, mats.vc); mesh.scale.setScalar(0.8); mesh.position.set((run.carrying.length - 1) * 1.1, 0, run.carrying.length * 0.8);
      dragon.seat.add(mesh);
      run.carrying.push({ nest: n, mesh, heat: 0 });
      sfx.pick(); fx.burst(n.pos.x, n.pos.y + 2, n.pos.z, 20, 0x9cff8a, 10, 0.8);
      toast(`¡Rescataste una ${Mo.CREATURES[n.kind].name}! Llevala a la posada flotante`, 2400);
    }
  }
  // calor del volcán: las crías se asustan si tardás demasiado
  if (sceneName === 'volcan') {
    const lim = 60 * diff.heat;
    for (let i = run.carrying.length - 1; i >= 0; i--) {
      const c = run.carrying[i]; c.heat += dt;
      if (c.heat > lim) { run.nests[c.nest.id] = 'nest'; refreshNest(c.nest); c.mesh.removeFromParent(); run.carrying.splice(i, 1); toast('La cría se asustó con el calor y volvió al nido', 2200); sfx.miss(); }
    }
  }
}
function updateInns(dt) {
  run.innCd -= dt;
  for (const it of region.inns) {
    if (it.pos.distanceToSquared(P.pos) > 26 * 26) continue;
    if (!it.active) {
      it.active = true; run.inns[it.id] = true; refreshInn(it);
      sfx.inn(); addScore(SCORE.inn);
      fx.burst(it.pos.x, it.pos.y + 8, it.pos.z, 30, 0xffd36b, 14, 1);
      toast('Posada activada: nuevo punto de control y energía llena', 2200);
    }
    if (!run.checkpoint || run.checkpoint.id !== it.id) {
      const yaw = Math.atan2(it.pos.x, it.pos.z);
      run.checkpoint = { id: it.id, pos: new THREE.Vector3(it.pos.x - Math.sin(yaw) * 30, it.pos.y + 14, it.pos.z - Math.cos(yaw) * 30), yaw };
    }
    if (run.innCd <= 0 && P.energy < P.maxEnergy - 1) { P.energy = P.maxEnergy; run.innCd = 3; sfx.inn(); }
    // entregar crías
    if (run.carrying.length) {
      for (const c of run.carrying) {
        run.nests[c.nest.id] = 'delivered'; c.mesh.removeFromParent();
        run.rescued++; addScore(SCORE.rescue); MLM.emit('rescue');
      }
      fx.burst(it.pos.x, it.pos.y + 6, it.pos.z, 40, 0x9cff8a, 16, 1.2); sfx.rescue();
      run.carrying.length = 0;
      if (sceneName === 'volcan') {
        const del = region.nests.filter(n => run.nests[n.id] === 'delivered').length;
        if (del >= region.nests.length) rescueTrialDone();
        else toast(`Crías a salvo: ${del}/${region.nests.length}`, 2000);
      } else toast('¡Cría a salvo en la posada!', 2000);
    }
  }
}
function rescueTrialDone() {
  const c = SV().campaign, first = !c.rescueDone;
  addScore(SCORE.trial);
  if (first) { c.rescueDone = true; save.flush(); MLM.emit('trials', trialsDone()); banner('¡RESCATE COMPLETO!', '¡TORMENTA SOBRE LA ACADEMIA! CRUZÁ EL PORTAL', 3.2); }
  else banner('¡RESCATE COMPLETO!', 'TODAS LAS CRÍAS A SALVO', 2.4);
  sfx.win(); updatePortal();
}
function updateGeysers(dt) {
  for (const g of region.geysers) {
    g.t -= dt;
    if (g.phase === 'idle' && g.t <= 0) { g.phase = 'warn'; g.t = 1.7 * diff.tele; if (P.pos.distanceTo(g.group.position) < 120) sfx.rumble(); }
    else if (g.phase === 'warn') {
      g.warnMat.opacity = 0.35 + 0.35 * Math.sin(time * 16);
      if (g.t <= 0) { g.phase = 'erupt'; g.t = 2.2; g.col.visible = true; g.warnMat.opacity = 0; if (P.pos.distanceTo(g.group.position) < 160) sfx.geyser(); }
    } else if (g.phase === 'erupt') {
      const k = Math.min(1, (2.2 - g.t) / 0.3);
      g.col.scale.set(1, g.height * k, 1);
      if ((game.frames & 3) === 0) fx.trail(g.x + (Math.random() - 0.5) * 6, g.y + g.height * k * Math.random(), g.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8, 10, (Math.random() - 0.5) * 8, 0xffa040, 0.8);
      if (P.alive && Math.hypot(P.pos.x - g.x, P.pos.z - g.z) < 6.5 && P.pos.y < g.y + g.height * k && P.pos.y > g.y - 2) { hurtPlayer(18, 'géiser'); P.ext.y += 25; }
      if (g.t <= 0) { g.phase = 'idle'; g.t = 3 + Math.random() * 3; g.col.visible = false; }
    }
  }
}
function updatePortalTravel() {
  if (!run.portalOpen) return;
  if (region.portal.position.distanceToSquared(P.pos) < 17 * 17) {
    const next = sceneName === 'picos' ? 'lago' : sceneName === 'lago' ? 'volcan' : 'tormenta';
    state = 'travel'; run.travelT = 1.2; run.travelTo = next; sfx.portal();
    fx.burst(P.pos.x, P.pos.y, P.pos.z, 40, 0xfff2b0, 20, 1);
  }
}

/* ======================= jefe ======================= */
function beginBossIntro() {
  state = 'intro'; run.introT = 5.2;
  banner('SERPIENTE DE TORMENTA', 'DEFENDÉ LA ACADEMIA · ESPACIO / TOCÁ PARA SALTAR', 4.5);
  sfx.roar();
}

/* ======================= objetivo y flecha ======================= */
const _target = new THREE.Vector3();
function objectiveTarget() {
  if (!region) return null;
  if (sceneName === 'picos') {
    const idx = SV().campaign.markers.length;
    if (idx < 5) { const m = region.markers[idx]; return _target.set(m.x, m.type === 'climb' ? m.need + 3 : m.y, m.z); }
    if (run.carrying.length) return _target.copy(region.inns[0].pos).setY(region.inns[0].pos.y + 8);
    if (run.portalOpen && run.ringIdx === 0) return _target.copy(region.portal.position);
    if (region.rings[run.ringIdx]) return _target.copy(region.rings[run.ringIdx].pos);
  }
  if (sceneName === 'lago') {
    if (run.carrying.length && !run.raceActive) return _target.copy(region.inns[0].pos).setY(region.inns[0].pos.y + 8);
    if (run.portalOpen && !run.raceActive) return _target.copy(region.portal.position);
    return region.rings[run.ringIdx] ? _target.copy(region.rings[run.ringIdx].pos) : null;
  }
  if (sceneName === 'volcan' && !regionTrialDone()) {
    if (run.carrying.length) return _target.copy(region.inns[0].pos).setY(region.inns[0].pos.y + 8);
    let best = null, bd = 1e9;
    for (const n of region.nests) if (run.nests[n.id] === 'nest') { const d = n.pos.distanceToSquared(P.pos); if (d < bd) { bd = d; best = n; } }
    if (best) return _target.copy(best.pos).setY(best.pos.y + 4);
  }
  if (run.carrying.length && region.inns.length) return _target.copy(region.inns[0].pos).setY(region.inns[0].pos.y + 8);
  if (sceneName === 'tormenta' && boss) {
    if (boss.S.mode === 'stunned') return _target.copy(boss.S.pos);
    if (boss.S.mode === 'tired') for (const sc of boss.scales) if (sc.mesh.visible) return _target.copy(sc.mesh.position);
    return _target.copy(boss.S.pos);
  }
  if (run.portalOpen) return _target.copy(region.portal.position);
  if (sceneName === 'picos' && run.courseActive && region.rings[run.ringIdx]) return _target.copy(region.rings[run.ringIdx].pos);
  return null;
}
function objectiveText() {
  const c = SV().campaign;
  if (sceneName === 'picos') {
    const idx = c.markers.length;
    if (idx < 5) return `Entrenamiento ${idx}/5 · ${region.markers[idx].label}`;
    if (run.portalOpen && run.ringIdx === 0) return '¡Graduado! Cruzá el portal dorado al Lago (o repetí el circuito)';
    return `Circuito de aros ${run.ringIdx}/${region.rings.length}${run.ringIdx > 0 ? ` · ${run.courseT.toFixed(1)} s` : ''}${run.courseRock === 0 && run.ringIdx > 0 ? ' · sin rocas' : ''}`;
  }
  if (sceneName === 'lago') {
    if (run.raceActive) return `Carrera: aro ${run.ringIdx}/${region.rings.length} · Nube ${run.rivalIdx}/${region.rings.length} · ${run.raceT.toFixed(1)} s`;
    if (run.portalOpen) return 'Prueba superada · Cruzá el portal al Volcán (o corré de nuevo)';
    return 'Carrera de los Espejos: cruzá el aro dorado de largada';
  }
  if (sceneName === 'volcan') {
    const del = region.nests.filter(n => run.nests[n.id] === 'delivered').length;
    if (run.portalOpen && del >= region.nests.length) return '¡La academia está en peligro! Cruzá el portal';
    return `Rescate: ${del}/${region.nests.length} crías en la posada${run.carrying.length ? ' · ¡llevalas antes de que se asusten!' : ' · buscá los nidos con luz verde'}`;
  }
  return '';
}

/* ======================= bucle ======================= */
function update(dt) {
  time += dt;
  if (!region) { input.endStep(); return; }
  if (state === 'menu' || state === 'over' || state === 'win') {
    // vuelo de exhibición alrededor de la academia
    const a = time * 0.22;
    P.prev.copy(P.pos);
    P.pos.set(Math.cos(a) * 85, 112 + Math.sin(time * 0.6) * 6, Math.sin(a) * 85);
    P.yaw = Math.PI - a; P.pitch = Math.cos(time * 0.6) * 0.08; P.roll = -0.35;
    forwardFrom(P.yaw, P.pitch, P.fwd); P.vert = 0; P.turn = 0;
    region.update(dt, time, camera.position, P.pos, camera.far);
    fx.update(dt);
    input.endStep();
    return;
  }
  if (run.bannerT > 0) { run.bannerT -= dt; if (run.bannerT <= 0) H.banner.hidden = true; }
  run.rockCd -= dt;
  if (state === 'intro') {
    run.introT -= dt;
    if (input.hit('Space', 'Enter', 'KeyF', 'btn:fire', 'btn:up') || mouseFire) run.introT = Math.min(run.introT, 0.01);
    mouseFire = false;
    if (boss) boss.update(dt, time);
    if (run.introT <= 0) { if (boss) boss.skipIntro(); state = 'play'; H.banner.hidden = true; toast('Esquivá las columnas rojas y golpeá las escamas brillantes', 2600); }
  } else if (state === 'play') {
    updatePlayer(dt);
    if (state === 'play') {
      updateRings(); updateMarkers(dt); updateEggs(); updateNests(dt); updateInns(dt);
      if (region.geysers.length) updateGeysers(dt);
      updatePortalTravel();
      tutorialStep(dt);
      if (run.courseActive && run.ringIdx > 0 && sceneName === 'picos') run.courseT += dt;
    }
    if (boss) boss.update(dt, time);
  } else if (state === 'falling') {
    run.fallT -= dt;
    P.prev.copy(P.pos);
    P.pos.y -= 22 * dt; P.roll += dt * 6; P.pitch = Math.max(-1.2, P.pitch - dt * 2);
    if (boss) boss.update(dt, time);
    if (run.fallT <= 0) respawn();
  } else if (state === 'travel') {
    run.travelT -= dt;
    P.prev.copy(P.pos); P.pos.addScaledVector(P.fwd, 40 * dt);
    H.fade.style.opacity = String(clamp(1 - run.travelT / 1.2, 0, 1));
    if (run.travelT <= 0) {
      const next = run.travelTo;
      loadRegion(next);
      H.fade.style.opacity = '0';
      if (next === 'tormenta') beginBossIntro(); else { state = 'play'; banner(REGION_NAME[next].toUpperCase(), regionSubtitle(next), 2.6); }
    }
  } else if (state === 'outro') {
    run.outroT -= dt;
    P.prev.copy(P.pos); P.pitch += (0.15 - P.pitch) * dt; P.roll *= 1 - dt; forwardFrom(P.yaw, P.pitch, P.fwd);
    P.pos.addScaledVector(P.fwd, 26 * dt); P.flapT += dt;
    if (run.outroT <= 0) victory();
  }
  if (enemies && (state === 'play' || state === 'falling')) enemies.update(dt, time);
  if (state === 'play' || state === 'falling' || state === 'outro') { updateBolts(dt); updateRival(dt); }
  region.update(dt, time, camera.position, P.pos, camera.far);
  fx.update(dt);
  camShake = Math.max(0, camShake - dt * 2.5);
  input.endStep();
}

function render(alpha) {
  const now = performance.now();
  const rdt = Math.min(0.1, lastRender ? (now - lastRender) / 1000 : 0.016); lastRender = now;
  renderPos.copy(P.prev).lerp(P.pos, alpha);
  // dragón
  if (dragon) {
    const g = dragon.group;
    g.position.copy(renderPos);
    g.rotation.set(0, 0, 0); g.rotation.order = 'YXZ';
    g.rotation.y = P.yaw; g.rotation.x = P.pitch; g.rotation.z = -P.roll;
    const amp = state === 'falling' ? 1.2 : P.vert > 0.3 || P.boosting ? 0.85 : 0.35;
    Mo.flap(dragon, P.flapT, amp, P.vert > 0.3 || P.boosting ? 11 : 5);
    g.visible = !(P.invuln > 0 && state === 'play' && (Math.floor(now / 90) & 1) === 0 && P.hurtT > 0);
  }
  // flecha guía
  const tg = (state === 'play') ? objectiveTarget() : null;
  arrow.visible = !!tg;
  if (tg) {
    arrow.position.copy(renderPos).addScaledVector(P.fwd, 7); arrow.position.y += 4.5;
    arrow.lookAt(tg);
    /** @type {any} */ (arrow.material).opacity = 0.75 + Math.sin(now / 200) * 0.2;
  }
  // cámara
  const portrait = camera.aspect < 1;
  if (state === 'menu' || state === 'over' || state === 'win') {
    const a = time * 0.05;
    _v.set(Math.cos(a) * 190, 150, Math.sin(a) * 190);
    camPos.lerp(_v, 1 - Math.exp(-rdt * 2)); camLook.lerp(_w.set(0, 95, 0), 1 - Math.exp(-rdt * 3));
  } else if (state === 'intro' && boss) {
    _v.set(0, 105, 120); camPos.lerp(_v, 1 - Math.exp(-rdt * 2));
    camLook.lerp(boss.S.pos, 1 - Math.exp(-rdt * 3));
  } else {
    const back = (portrait ? 21 : 15) + (P.speed - 30) * 0.12;
    _w.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    _v.copy(renderPos).addScaledVector(_w, -back); _v.y += (portrait ? 7 : 5) - P.pitch * 5;
    const gy = Math.max(region.height(_v.x, _v.z), region.floorY) + 3;
    if (_v.y < gy) _v.y = gy;
    camPos.lerp(_v, 1 - Math.exp(-rdt * (state === 'falling' ? 2 : 6)));
    _u.copy(renderPos).addScaledVector(P.fwd, 14); _u.y += 1.5;
    camLook.lerp(_u, 1 - Math.exp(-rdt * 10));
  }
  camera.position.copy(camPos);
  if (camShake > 0) camera.position.add(_t.set((Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake));
  camera.lookAt(camLook);
  const fovT = (portrait ? 72 : 62) + (P.boosting && state === 'play' ? 9 : 0);
  if (Math.abs(fovNow - fovT) > 0.05) { fovNow += (fovT - fovNow) * (1 - Math.exp(-rdt * 4)); camera.fov = fovNow; camera.updateProjectionMatrix(); }
  // HUD a 10 Hz
  hudT -= rdt;
  if (hudT <= 0 && state !== 'menu') { hudT = 0.1; drawHud(); }
  // daño: viñeta roja (sin destellos con movimiento reducido)
  H.hurt.style.opacity = P.hurtT > 0 ? String(reducedMQ.matches ? 0.35 : Math.min(1, P.hurtT * 2.5)) : '0';
}

function drawHud() {
  if (H.hud.hidden) return;
  if (score !== lastScoreShown) { H.score.textContent = String(score); if (!reducedMQ.matches && lastScoreShown >= 0) { H.score.classList.remove('pop'); void H.score.offsetWidth; H.score.classList.add('pop'); } lastScoreShown = score; }
  setText(H.lives, 'lives', '❤'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, diff.lives - lives)));
  const e = P.energy / P.maxEnergy;
  H.energy.style.width = (e * 100).toFixed(1) + '%';
  H.energyBar.classList.toggle('low', e < 0.3);
  const isBoss = sceneName === 'tormenta' && boss;
  H.boss.hidden = !isBoss; H.obj.hidden = !!isBoss;
  if (isBoss) {
    H.bossHp.style.width = (boss.S.hp / boss.S.maxHp * 100).toFixed(1) + '%';
    H.acad.style.width = run.academy.toFixed(1) + '%';
    setText(H.phase, 'phase', boss.S.mode === 'tired' ? `FASE ${boss.S.phase} · ¡ESCAMAS EXPUESTAS!` : boss.S.mode === 'stunned' ? `FASE ${boss.S.phase} · ¡CABEZA ATURDIDA!` : `FASE ${boss.S.phase}`);
  } else {
    setText(H.region, 'region', REGION_NAME[sceneName].toUpperCase());
    setText(H.objText, 'obj', objectiveText());
  }
  // misiones de la partida
  const cur = MLM.state().current;
  const mis = cur.map(m => `<span class="${m.kind === 'primary' ? 'p' : ''} ${m.status}">${m.status === 'done' ? '✔' : m.kind === 'primary' ? '★' : '◆'} ${m.title}${m.status === 'active' && MISSIONS.find(x => x.id === m.id)?.target > 1 ? ` ${Math.min(m.progress, /** @type {any} */ (MISSIONS.find(x => x.id === m.id)).target)}/${/** @type {any} */ (MISSIONS.find(x => x.id === m.id)).target}` : ''}</span>`).join('');
  if (cache.mis !== mis) { cache.mis = mis; H.mis.innerHTML = mis; }
  const carry = run.carrying.length ? `🐣 ${run.carrying.length} cría${run.carrying.length > 1 ? 's' : ''}${sceneName === 'volcan' ? ` · calor ${Math.max(0, Math.ceil(60 * diff.heat - Math.max(...run.carrying.map(c => c.heat))))} s` : ''}` : '';
  H.carry.hidden = !carry || !!isBoss; setText(H.carry, 'carry', carry);
  const clearance = P.pos.y - Math.max(region.height(P.pos.x, P.pos.z), region.floorY);
  H.warn.hidden = !(state === 'play' && clearance < 12 && P.vel.y < 0);
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'adMenu' });
const subScreen = screen('', { accent: ACCENT, id: 'adSub' }); subScreen.hide();
const endScreen = screen('', { accent: ACCENT, id: 'adEnd' }); endScreen.hide();
function hideScreens() { menu.hide(); subScreen.hide(); endScreen.hide(); }

function diffInfo(id) { const d = DIFF[id]; return `Vidas ${d.lives} · daño ×${d.damage} · rivales ×${d.enemies} · jefe ×${d.bossHp} · aros ×${d.ring} · Nube ×${d.rival}`; }
function menuHTML() {
  const d = SV(), c = d.campaign, u = unlocked();
  const next = continueRegion();
  const cards = DRAGONS.map(x => {
    const locked = x.id === 'ascua' && !d.dragon3;
    const bar = v => `<i style="width:${Math.round(v / 1.45 * 100)}%"></i>`;
    return `<button type="button" class="ad-drag" data-dragon="${x.id}" aria-pressed="${d.dragon === x.id}" ${locked ? 'disabled' : ''}>
      <span class="i">${locked ? '🔒' : x.icon}</span><b>${x.name}</b>
      <span class="st"><span>Vel.</span>${bar(x.speed)}<span>Resist.</span>${bar(x.resist)}<span>Poder</span>${bar(x.power)}</span>
      <small>${locked ? `Juntá los 3 huevos dorados (${d.eggs.length}/3)` : `${x.element} · ${x.desc}`}</small></button>`;
  }).join('');
  return `<span class="k3-kicker">MATELABS · AVENTURA AÉREA</span>
    <h1>ACADEMIA DE<br>DRAGONES</h1>
    <p class="ad-hide-short">Volá entre picos, lagos y volcanes: superá las pruebas de la academia, rescatá crías y defendela de la Serpiente de Tormenta.</p>
    <div class="ad-dragons" role="group" aria-label="Elegí tu dragón">${cards}</div>
    <div id="adDiff"></div><div class="ad-diffinfo" id="adDiffInfo">${diffInfo(MLM.difficulty())}</div>
    <div class="k3-btnrow">
      <button type="button" class="k3-b" id="adStart" data-go>▶ ${trialsDone() || c.markers.length ? 'Continuar' : 'Volar'}${next !== 'picos' ? ` · ${REGION_NAME[next]}` : ''}</button>
      <button type="button" class="k3-b alt" data-regions>🗺 Regiones</button>
      <button type="button" class="k3-b alt" data-settings>⚙ Ajustes</button>
      <button type="button" class="k3-b alt" data-help>? Cómo jugar</button>
    </div>
    <div class="ad-prog">Pruebas ${trialsDone()}/3 · Huevos ${d.eggs.length}/3 · ${d.bossDefeated ? '🏆 Academia salvada' : 'Serpiente: invicta'} · Récord ${Math.max(d.best, MLA.scores.best(ID) || 0)}</div>
    <div class="ad-credit"><span>CREADO POR</span><img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`;
}
function showMenu() {
  menu.show(menuHTML());
  MLM.difficultyPicker(/** @type {HTMLElement} */ (menu.el.querySelector('#adDiff')), { onChange: d => { diffId = d; diff = DIFF[d]; const i = menu.el.querySelector('#adDiffInfo'); if (i) i.textContent = diffInfo(d); } });
  /** @type {HTMLElement} */ (menu.el.querySelector('#adStart')).focus({ preventScroll: true });
}
menu.el.addEventListener('click', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  const dg = t.closest('[data-dragon]');
  if (dg && !(/** @type {HTMLButtonElement} */ (dg)).disabled) { save.set({ dragon: /** @type {string} */ (dg.getAttribute('data-dragon')) }); setDragon(SV().dragon); sfx.ui(); showMenu(); return; }
  if (t.closest('[data-go]')) { startRun(continueRegion()); return; }
  if (t.closest('[data-regions]')) { showRegions(); return; }
  if (t.closest('[data-settings]')) { showSettings(); return; }
  if (t.closest('[data-help]')) { showHelp(); return; }
});
addEventListener('keydown', e => {
  if (state === 'menu' && !menu.el.hidden && e.code === 'Enter' && (!document.activeElement || document.activeElement === document.body)) { e.preventDefault(); startRun(continueRegion()); }
});

function showRegions() {
  const u = unlocked(), c = SV().campaign;
  const R = [['picos', 'Entrenamiento y circuito de aros', c.courseDone], ['lago', 'Carrera contra Nube', c.raceDone], ['volcan', 'Rescate de crías entre géiseres', c.rescueDone], ['tormenta', 'Jefe final: Serpiente de Tormenta', SV().bossDefeated]];
  menu.hide();
  subScreen.show(`<span class="k3-kicker">REGIONES</span><h1 style="font-size:34px">MAPA</h1>
    <div class="ad-regs">${R.map(([id, sub, done]) => `<button type="button" class="ad-reg" data-reg="${id}" ${u[id] ? '' : 'disabled'}>${u[id] ? (done ? '✅' : '▶') : '🔒'} ${REGION_NAME[id]}<small>${u[id] ? sub : 'Superá la prueba anterior para desbloquear'}</small></button>`).join('')}</div>
    <div class="k3-btnrow"><button type="button" class="k3-b alt" data-back>← Volver</button></div>`);
  /** @type {HTMLElement} */ (subScreen.el.querySelector('[data-back]')).focus();
}
function showSettings() {
  const s = SV().settings;
  menu.hide();
  subScreen.show(`<span class="k3-kicker">AJUSTES DE VUELO</span><h1 style="font-size:34px">AJUSTES</h1>
    <div class="ad-form">
      <label>Sensibilidad <input type="range" id="adSens" min="0.5" max="1.6" step="0.1" value="${s.sens}" aria-label="Sensibilidad"></label>
      <label>Invertir eje vertical (estilo avión) <input type="checkbox" id="adInvert" ${s.invert ? 'checked' : ''}></label>
      <label>Asistencia de vuelo <select id="adAssist" aria-label="Asistencia de vuelo">
        <option value="auto" ${s.assist === 'auto' ? 'selected' : ''}>Automática (sí en táctil)</option><option value="on" ${s.assist === 'on' ? 'selected' : ''}>Siempre</option><option value="off" ${s.assist === 'off' ? 'selected' : ''}>Nunca</option></select></label>
      <label>Sacudidas de cámara <input type="checkbox" id="adShake" ${s.shake ? 'checked' : ''} ${reducedMQ.matches ? 'disabled' : ''}></label>
    </div>
    <table class="ad-map"><tbody>
      <tr><td>Girar</td><td>A/D · ←/→ · joystick · stick</td></tr>
      <tr><td>Morro arriba/abajo</td><td>W/S · ↑/↓ · joystick (se nivela solo al soltar)</td></tr>
      <tr><td>Subir / bajar</td><td>Espacio o E / C o Q · ▲ / ▼ · A / B</td></tr>
      <tr><td>Turbo</td><td>Shift o K · ⚡ · RB / LT</td></tr>
      <tr><td>Aliento</td><td>F, J o clic · 🔥 · X / RT</td></tr>
      <tr><td>Pausa</td><td>Esc o P · ⏸ · Start</td></tr>
    </tbody></table>
    <p style="font-size:12px">La asistencia nivela antes, evita el suelo, curva el aliento hacia el blanco y atrae suavemente hacia el próximo aro. Calidad gráfica y sonido: botón ⚙ de arriba.</p>
    <div class="k3-btnrow"><button type="button" class="k3-b" data-back>✓ Listo</button></div>`);
  const f = subScreen.el;
  const upd = () => {
    const sens = Number(/** @type {HTMLInputElement} */ (f.querySelector('#adSens')).value);
    save.set({ settings: { sens, invert: /** @type {HTMLInputElement} */ (f.querySelector('#adInvert')).checked, assist: /** @type {HTMLSelectElement} */ (f.querySelector('#adAssist')).value, shake: /** @type {HTMLInputElement} */ (f.querySelector('#adShake')).checked } });
  };
  f.querySelectorAll('input,select').forEach(x => x.addEventListener('change', upd));
}
function showHelp() {
  menu.hide();
  subScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:34px">LA ACADEMIA</h1>
    <ul class="k3-list">
      <li>🎯 <b>Picos Nubosos:</b> 5 marcadores de entrenamiento y el circuito de aros → te graduás.</li>
      <li>🏁 <b>Lago de Espejos:</b> carrera contra Nube por aros y arcos de piedra.</li>
      <li>🌋 <b>Volcán Dormido:</b> rescatá 3 crías de los nidos y llevalas a la posada antes de que se asusten.</li>
      <li>⛈ <b>Final:</b> la Serpiente de Tormenta ataca la academia. Esquivá los rayos telegrafiados, reventá los orbes y golpeá sus puntos débiles.</li>
      <li>🏠 <b>Posadas flotantes:</b> punto de control, energía llena y entrega de crías.</li>
      <li>🥚 <b>Huevos dorados:</b> uno por región; con los 3 nace Ascua, el tercer dragón.</li>
      <li>🦇 Murciélago: avisa con ojos rojos y se tira en picada (corréte de la línea). 🪶 Arpía: abre las alas antes de tirar plumas (golpeala en ese momento). ⚙ Autómata: apunta con un láser, esquivalo y pegale mientras se recalienta.</li>
      <li>⚡ Turbo y aliento gastan energía; se recarga planeando y en las corrientes ascendentes. Sin energía o si caés, perdés una vida.</li>
    </ul>
    <div class="k3-btnrow"><button type="button" class="k3-b" data-tut>🎓 Repetir tutorial</button><button type="button" class="k3-b alt" data-back>← Volver</button></div>`);
}
subScreen.el.addEventListener('click', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.closest('[data-back]')) { subScreen.hide(); showMenu(); return; }
  if (t.closest('[data-tut]')) { save.set({ tutorial: false }); subScreen.hide(); startRun('picos'); return; }
  const r = t.closest('[data-reg]');
  if (r && !(/** @type {HTMLButtonElement} */ (r)).disabled) { subScreen.hide(); startRun(/** @type {string} */ (r.getAttribute('data-reg'))); }
});

function endHTML(won, msg) {
  const best = Math.max(SV().best, MLA.scores.best(ID) || 0);
  const mis = MLM.state().current.map(m => `<li>${m.status === 'done' ? '✅' : '❌'} ${m.title}</li>`).join('');
  return `<span class="k3-kicker">${won ? 'VICTORIA' : 'DERROTA'}</span>
    <h1 style="font-size:clamp(30px,7vw,52px)">${won ? '¡ACADEMIA<br>SALVADA!' : 'SIN ENERGÍA'}</h1>
    <p>${won ? 'La Serpiente de Tormenta se disipó y la academia te nombra Guardián de los Cielos.' : (msg || 'Tu dragón necesita descansar.') + ' Podés reintentar desde esta región: tu progreso de campaña está guardado.'}</p>
    <div class="ad-endstats"><span>Puntos</span><b id="adEndScore">${score}</b><span>Récord</span><b>${best}</b><span>Rivales espantados</span><b>${run.kills}</b><span>Crías rescatadas</span><b>${run.rescued}</b><span>Pruebas superadas</span><b>${trialsDone()}/3</b></div>
    <ul class="k3-list">${mis}</ul>
    <div class="k3-btnrow"><button type="button" class="k3-b" data-retry>${won ? '↻ Volar otra vez' : '↻ Reintentar'}</button><button type="button" class="k3-b alt" data-menu>☰ Menú</button></div>
    <div class="ad-credit"><span>CREADO POR</span><img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`;
}
endScreen.el.addEventListener('click', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.closest('[data-retry]')) { endScreen.hide(); startRun(state === 'win' ? continueRegion() : sceneName); }
  else if (t.closest('[data-menu]')) toMenu();
});

/* ======================= arranque ======================= */
setDragon(SV().dragon);
loadRegion('picos');
showMenu();
game.start();
reducedMQ.addEventListener?.('change', () => { if (reducedMQ.matches) camShake = 0; });

/* ======================= gancho de pruebas ======================= */
const hook = {
  get state() { return state; },
  get scene() { return sceneName; },
  get missions() { return MLM.state(); },
  get player() { return { pos: { x: P.pos.x, y: P.pos.y, z: P.pos.z }, yaw: P.yaw, pitch: P.pitch, speed: P.speed, energy: P.energy, maxEnergy: P.maxEnergy, alive: P.alive, boosting: P.boosting, dragon: P.def.id, carrying: run.carrying.length, invuln: P.invuln }; },
  get hp() { return P.energy; },
  get lives() { return lives; },
  get score() { return score; },
  get difficulty() { return { id: diffId, ...diff }; },
  get quality() { return { name: qName, far: camera.far, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, clouds: region ? region.clouds.count : 0, particleLimit: QUALITY[qName].particles, mirror: !!(region && region.mirror) }; },
  get counts() {
    const e = enemies ? enemies.counts() : { bat: 0, harpy: 0, auto: 0, feathers: 0 };
    return { ...e, enemies: enemies ? enemies.list.length : 0, rings: region ? region.rings.length : 0, ringIdx: run.ringIdx, markersDone: SV().campaign.markers.length,
      bolts: bolts.filter(b => b.life > 0).length, particles: fx.alive, obstacles: region ? region.obstacles.length : 0,
      nests: region ? region.nests.map(n => ({ id: n.id, state: run.nests[n.id] })) : [], inns: region ? region.inns.map(i => ({ id: i.id, active: i.active })) : [],
      eggs: region ? region.eggs.map(e => ({ id: e.id, visible: e.group.visible })) : [], geysers: region ? region.geysers.map(g => g.phase) : [] };
  },
  get run() { return { courseActive: run.courseActive, courseT: run.courseT, courseRock: run.courseRock, raceActive: run.raceActive, raceT: run.raceT, rivalU: run.rivalU, portalOpen: run.portalOpen, academy: run.academy, kills: run.kills, rescued: run.rescued, checkpoint: !!run.checkpoint, tutorialStep: tut.step }; },
  get boss() { return boss ? { hp: boss.S.hp, maxHp: boss.S.maxHp, phase: boss.S.phase, mode: boss.S.mode, weak: boss.weakPoints, strikes: boss.strikesActive, orbs: boss.orbsActive, pos: { x: boss.S.pos.x, y: boss.S.pos.y, z: boss.S.pos.z } } : null; },
  get save() { return structuredClone(SV()); },
  get perf() { return { ...game.perf, frames: game.frames, heapMB: /** @type {any} */ (performance).memory ? +(/** @type {any} */ (performance).memory.usedJSHeapSize / 1048576).toFixed(1) : null }; },
  get paused() { return game.paused; },
  get simTime() { return game.simTime; },
};
if (DEBUG) Object.assign(hook, {
  simulate: (s) => game.simulate(s),
  goto: (kind) => { if (!runActive) startRun(kind); else { loadRegion(kind); if (kind === 'tormenta') beginBossIntro(); else state = 'play'; } },
  teleport: (x, y, z, yaw = 0) => { P.pos.set(x, y, z); P.prev.set(x, y, z); P.yaw = yaw; P.pitch = 0; forwardFrom(P.yaw, 0, P.fwd); camPos.set(x + Math.sin(yaw) * 20, y + 6, z + Math.cos(yaw) * 20); },
  /** Coloca al jugador justo antes del próximo aro, mirando hacia él. */
  toNextRing: () => { const r = region.rings[run.ringIdx]; if (!r) return false; _v.copy(r.pos).addScaledVector(r.normal, -10); P.pos.copy(_v); P.prev.copy(_v); P.yaw = Math.atan2(-r.normal.x, -r.normal.z); P.pitch = Math.asin(clamp(r.normal.y, -1, 1)); P.speed = 30; forwardFrom(P.yaw, P.pitch, P.fwd); return true; },
  toMarker: (i) => { const m = region.markers[i ?? SV().campaign.markers.length]; if (!m) return false; P.pos.set(m.x, m.y, m.z + 30); P.prev.copy(P.pos); P.yaw = 0; P.pitch = 0; forwardFrom(0, 0, P.fwd); return true; },
  completeMarkers: () => { for (let i = SV().campaign.markers.length; i < 5; i++) completeMarker(i); },
  completeTrial: () => { if (sceneName === 'picos') { if (SV().campaign.markers.length < 5) hook.completeMarkers(); run.courseActive = true; run.ringIdx = region.rings.length - 1; passRing(); } else if (sceneName === 'lago') { run.raceActive = true; run.ringIdx = region.rings.length - 1; passRing(); } else if (sceneName === 'volcan') { for (const n of region.nests) run.nests[n.id] = 'delivered'; rescueTrialDone(); } },
  setEnergy: (n) => { P.energy = n; },
  setInvuln: (n) => { P.invuln = n; },
  hurt: (n) => hurtPlayer(n, 'prueba'),
  kill: () => fall('Prueba: caída'),
  hitBoss: (n) => { if (boss) boss.hurt(n); },
  spawnBoss: () => { if (!runActive) startRun('tormenta'); else { loadRegion('tormenta'); beginBossIntro(); } },
  skipIntro: () => { run.introT = 0.001; },
  setAcademy: (n) => { run.academy = n; },
  damageAcademy: (n) => { run.academy = Math.max(0, run.academy - n); if (run.academy <= 0) gameOver('La academia cayó ante la tormenta'); },
  addScore: (n) => addScore(n),
  setLives: (n) => { lives = n; },
  rival: (u) => { run.rivalU = u; },
  toPos: (what) => {
    let p = null;
    if (what === 'egg') p = region.eggs.find(e => e.group.visible && !e.shiny)?.pos;
    if (what === 'shiny') p = region.eggs.find(e => e.shiny)?.pos;
    if (what === 'nest') p = region.nests.find(n => run.nests[n.id] === 'nest')?.pos;
    if (what === 'inn') p = region.inns[0]?.pos;
    if (what === 'portal') p = region.portal.position;
    if (what === 'geyser') { const g = region.geysers[0]; p = g ? g.group.position : null; }
    if (!p) return false;
    P.pos.set(p.x, p.y + (what === 'geyser' ? 20 : 3), p.z + (what === 'portal' ? 0 : 0)); P.prev.copy(P.pos); return true;
  },
  enemies: () => enemies.list.map(e => ({ kind: e.kind, state: e.state, alive: e.alive, hp: e.hp, pos: { x: e.pos.x, y: e.pos.y, z: e.pos.z } })),
  enemyAhead: (kind) => { const e = enemies.list.find(q => q.kind === kind && q.alive); if (!e) return false; P.pos.copy(e.pos).add(_v.set(0, 0, 25)); P.prev.copy(P.pos); P.yaw = 0; P.pitch = 0; forwardFrom(0, 0, P.fwd); e.cd = 99; e.state = kind === 'auto' ? 'overheat' : 'idle'; e.t = 99; e.vel.set(0, 0, 0); e.frozen = true; return true; },
  forceEnemy: (kind, st) => { const e = enemies.list.find(q => q.kind === kind && q.alive); if (!e) return null; P.pos.copy(e.pos).add(_v.set(0, 0, 40)); P.prev.copy(P.pos); P.yaw = 0; forwardFrom(0, 0, P.fwd); e.cd = 0; e.frozen = false; e.state = 'idle'; e.home.copy(e.pos); return e.state; },
  fire: () => { P.breathCd = 0; breathe(); },
});
Object.defineProperty(window, '__' + ID, { value: Object.freeze(hook), writable: false, configurable: false });
