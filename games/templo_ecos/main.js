// @ts-check
/* Templo de los Ecos — juego principal: estados, jugadora, cámara, misiones, guardado, menús y ganchos de prueba. */
import { createGame, createInput, createSave, screen, toast, clamp, THREE } from '../../matelabs/kit3d.js';
import { GAME_ID, TITLE, ACCENT, DIFF, QUAL, MISSIONS, SAVE_VERSION, SAVE_DEFAULTS, PAR, keyLabel } from './config.js';
import { createMaterials, statueGeo, columnGeo, blockGeo, makePlayer } from './models.js';
import { body, moveBody, segBoxVisible } from './physics.js';
import { buildArea1, buildArea2, buildArea3, AREA_NAMES } from './areas.js';
import { BEAM_Y } from './level.js';
import { createFx } from './fx.js';
import { createSfx } from './sfx.js';
import { createUI } from './ui.js';

const W = /** @type {any} */ (window);
const A = W.MLArcade, M = W.MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const ROMAN = ['', 'I', 'II', 'III'];
const ROOM_NAMES = { luz: 'Sala de Luz', eco: 'Sala del Eco', vacio: 'Sala del Vacío' };

/* ======================= guardado ======================= */
const save = createSave(GAME_ID + ':save', SAVE_VERSION, structuredClone(SAVE_DEFAULTS), (old) => old || {});
/** Repara datos con forma inválida (guardado viejo, editado o a medias): nunca bloquea la partida. */
function sanitize() {
  const s = /** @type {any} */ (save.get()), D = /** @type {any} */ (SAVE_DEFAULTS);
  for (const k in D) {
    const dv = D[k], v = s[k];
    if (Array.isArray(dv)) { if (!Array.isArray(v)) s[k] = []; else s[k] = v.filter(x => typeof x === 'string'); }
    else if (dv && typeof dv === 'object') { if (!v || typeof v !== 'object' || Array.isArray(v)) s[k] = structuredClone(dv); }
    else if (typeof v !== typeof dv) s[k] = dv;
  }
  for (const k in s) if (!(k in D)) delete s[k];
  if (![1, 2, 3].includes(s.area)) { s.area = 1; s.cp = 'a1_inicio'; }
  s.relics = { sello: !!s.relics.sello, plumas: !!s.relics.plumas };
  s.tutorial = { off: !!s.tutorial.off, seen: (s.tutorial.seen && typeof s.tutorial.seen === 'object') ? s.tutorial.seen : {} };
  const o = s.opts, dO = D.opts;
  s.opts = {
    sens: typeof o.sens === 'number' && o.sens >= 0.3 && o.sens <= 2.5 ? o.sens : 1,
    invert: !!o.invert,
    motion: ['auto', 'reduce', 'full'].includes(o.motion) ? o.motion : 'auto',
    binds: { ...dO.binds, ...(o.binds && typeof o.binds === 'object' ? o.binds : {}) },
  };
  for (const k of ['jump', 'use', 'eco']) if (typeof s.opts.binds[k] !== 'string' || !s.opts.binds[k]) s.opts.binds[k] = dO.binds[k];
  for (const k of ['rooms', 'best', 'mirrors', 'doors', 'blocks', 'walls', 'braziers']) if (!s[k] || typeof s[k] !== 'object' || Array.isArray(s[k])) s[k] = {};
  if (!isFinite(s.score)) s.score = 0;
}
sanitize(); save.flush();
const S = () => /** @type {typeof SAVE_DEFAULTS} */ (save.get());
const persist = () => save.flush();
const binds = () => S().opts.binds;

/* ======================= misiones y dificultad ======================= */
M.setup({ gameId: GAME_ID, missions: MISSIONS, secondaryPerRun: 4, hud: 'tl' });
const diffName = () => /** @type {keyof typeof DIFF} */ (M.difficulty(GAME_ID));
const diff = () => DIFF[diffName()] || DIFF.normal;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => { const m = S().opts.motion; return m === 'reduce' || (m === 'auto' && reducedMQ.matches); };

/* ======================= juego base ======================= */
const ACTIVE = new Set(['play', 'cutscene', 'dead', 'transition']);
let state = 'menu';
const game = createGame({
  id: GAME_ID, title: TITLE, toolbar: 'tr', background: 0x2b2117, fov: 50, far: 160,
  help: ['WASD/flechas o joystick: moverte', 'Espacio: saltar (doble salto con las Plumas del Viento)', 'E: interactuar (espejos, cristales, reliquias, inscripciones)',
    'F: Eco (con el Sello): derrumba grietas, destruye arañas, repele espectros y devuelve rayos', 'Arrastrar el mouse/dedo o Q/R: girar la cámara', 'Las teclas se cambian en «Controles y accesibilidad»', 'Esc, P o Start: pausa'],
  gamepad: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'F13', x: 'F14', b: 'F15', lb: 'KeyQ', rb: 'KeyR' },
  isActive: () => ACTIVE.has(state),
  update, onRestart, onQuality: () => applyQuality(),
  actions: [
    { label: '📖 Cómo jugar y tutorial', fn: () => openHelp(true) },
    { label: '⚙ Controles y accesibilidad', fn: () => openOptions(true) },
    { label: '🏛 Volver al menú del templo', fn: exitToMenu },
  ],
});
const { scene, camera, renderer } = game;
scene.fog = new THREE.Fog(0x2b2117, 18, 62);
const mats = createMaterials();
Object.values(mats).forEach(m => { m.userData.shared = true; });
const geos = { statue0: statueGeo(0), statue1: statueGeo(1), column: columnGeo(4.2), block: blockGeo() };
Object.values(geos).forEach(g => { g.userData.shared = true; });
const hemi = new THREE.HemisphereLight(0xffe6b8, 0x4a3524, 1.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd8a0, 1.9);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
sun.shadow.bias = -0.0015;
scene.add(sun, sun.target);
const fx = createFx(scene, mats, reduced);
const sfx = createSfx(game.audio);
const ui = createUI();

/* ======================= jugadora ======================= */
const PM = makePlayer(mats);
scene.add(PM.group, PM.blob);
const P = {
  body: body(0.35, 1.6, 0.45), alive: false, hp: 4, maxHp: 4, inv: 0, knock: 0, face: Math.PI, jumpBuf: 0, coyote: 0, jumps: 0,
  ecoCd: 0, stepT: 0, fallV: 0, walk: 0, pushing: false, slow: 0,
  get vulnerable() { return state === 'play' && P.inv <= 0 && P.alive; },
};
const Pidle = { body: P.body, alive: false, vulnerable: false };
let input = createInput(game.root, {
  joystick: 'left', look: true,
  buttons: [{ id: 'jump', label: 'SALTO' }, { id: 'use', label: 'USAR' }, { id: 'eco', label: 'ECO' }],
});
if (input.isTouch) document.body.classList.add('te-touch');
input.showTouch(false);
const ecoBtn = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="eco"]'));
const useBtn = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="use"]'));

/* ======================= partida ======================= */
const run = { score: 0, time: 0, flames: 5, roomT: /** @type {Record<string, number>} */ ({}), curRoom: '', deaths: 0, transT: 0, transTo: 0, transSpawn: '', deadT: 0, deadFell: false };
/** @type {any} */ let level = null;
/** @type {any} */ let cur = null; // interactuable en foco
/** @type {any} */ let cut = null; // cinemática
let tipId = '', tipT = 0, moved = 0, cutSkip = false;
const cam = { yaw: 0, pitch: 0.86, tx: 0, ty: 1, tz: 0, menuA: 0, dist: 10 };

const emit = (ev, v) => M.emit(ev, v);
function addScore(n) { run.score += Math.round(n); }

/** Contexto que usan niveles, enemigos y jefe. */
const ctx = {
  THREE, scene, mats, geos, S, persist, diff, reduced, sfx, fx, emit, addScore,
  get player() { return P; },
  toast: (t, ms) => toast(t, ms || 2000),
  tip: id => tip(id),
  hurt, persistNow: persist,
  showText: (t, html) => { ui.text(t, html); emit('read'); },
  noteCue: c => ui.note(c.glyph, c.color, c.name),
  collectCodex(id, x, y, z) {
    const s = S(); if (s.codices.includes(id)) return;
    s.codices.push(id); persist();
    emit('codex'); addScore(150); sfx.codex(); fx.burst(x, y, z, 0xffc35a, 20, 3);
    toast(`📜 Códice ${s.codices.length}/9`, 1600);
  },
  discoverSecret(id) {
    const s = S(); if (s.secrets.includes(id)) return;
    s.secrets.push(id); persist();
    emit('secret'); addScore(300); sfx.solve(); toast(`🗝 ¡Sala secreta descubierta! (${s.secrets.length}/2)`, 2200);
  },
  takeRelic(kind, x, z) {
    const s = S(); s.relics[kind] = true; persist();
    sfx.relic(); fx.burst(x, 1.9, z, kind === 'sello' ? 0x3fe8d6 : 0xa9f3ff, 40, 5); fx.ring(x, 0.2, z, 0x3fe8d6, 6, 0.8); fx.shake(0.3);
    addScore(500);
    if (kind === 'sello') { emit('sello'); toast('✦ ¡Sello del Eco! Ahora podés emitir un Eco', 2600); tip('eco'); }
    else { emit('plumas'); toast('✦ ¡Plumas del Viento! Doble salto desbloqueado', 2600); tip('double'); }
    level.onRelic && level.onRelic(kind);
  },
  onCheckpoint(id, x, z) { sfx.checkpoint(); fx.burst(x, 1.6, z, 0xffa040, 18, 2.5); toast('🔥 Brasero encendido: punto de control', 1600); emit('checkpoint'); },
  roomStart(id) { if (run.roomT[id] === undefined) run.roomT[id] = run.time; run.curRoom = id; if (id === 'luz') tip('mirror'); },
  solveRoom(id) {
    const s = S(); if (s.rooms[id]) return;
    s.rooms[id] = true;
    const start = run.roomT[id], el = start === undefined ? Infinity : run.time - start, par = PAR[id] * diff().parMul;
    if (isFinite(el)) { s.best[id] = Math.min(s.best[id] || Infinity, Math.round(el * 10) / 10); }
    persist();
    emit('roomSolved'); addScore(500 + (isFinite(el) ? Math.max(0, par - el) * 10 : 0)); sfx.solve();
    const n = ['luz', 'eco', 'vacio'].filter(k => s.rooms[k]).length;
    toast(`✔ ${ROOM_NAMES[id]} resuelta (${n}/3)${isFinite(el) ? ' · ' + fmtTime(el) : ''}`, 2400);
    if (isFinite(el) && el <= par) { emit('roomRecord'); setTimeout(() => toast('⏱ ¡Tiempo récord!', 1800), 1200); }
    if (n === 3) setTimeout(() => toast('El sello central del hub despertó', 2200), 2600);
    if (run.curRoom === id) run.curRoom = '';
  },
  gotoArea(n, spawn) { if (state !== 'play') return; state = 'transition'; run.transT = 0.45; run.transTo = n; run.transSpawn = spawn; ui.fade(true); },
  startBoss,
  onBossPhase(to) {
    toast(to === 2 ? '¡Escudo de fragmentos! Pisá una placa y girá su espejo hacia el Guardián' : '¡El Corazón quedó expuesto! Devolvé sus rayos con el Eco', 3000);
    if (to === 2) tip('boss2'); if (to === 3) tip('boss3');
    ui.title(to === 2 ? 'FASE 2 · RESONADORES' : 'FASE 3 · CORAZÓN', 'GUARDIÁN ECO');
  },
  onBossDefeated() { toast('¡El Guardián cayó! Desactivá el Corazón del Templo', 3000); },
  onRelicDrain(n) {
    if (n > 0) { toast(`⚠ ¡La reliquia se agrieta! (${n}/3) Cubrite tras un pilar o usá el Eco`, 2000); if (!reduced()) ui.flash(); }
    else { toast('Sacrificaste la reliquia: el templo te devuelve al inicio de la fase', 2600); die('relic'); }
  },
  heartOff,
};

/* ======================= tutorial contextual ======================= */
const K = id => input.isTouch ? ({ jump: 'SALTO', use: 'USAR', eco: 'ECO' })[id] : keyLabel(binds()[id]);
const TIPS = {
  move: () => input.isTouch ? 'Movete con el <b>joystick</b>. Arrastrá el dedo por la pantalla para girar la cámara.' : 'Movete con <b>WASD</b> o flechas. Arrastrá el mouse o usá <b>Q/R</b> para girar la cámara.',
  interact: () => `Acercate a algo que brille y apretá <b>${K('use')}</b> para interactuar.`,
  push: () => 'Caminá contra un bloque para <b>empujarlo</b> una baldosa. ¿Se trabó? Usá el altar de reinicio junto a la entrada.',
  plates: () => 'Las <b>placas</b> se hunden con peso: un bloque o vos. Activá las tres a la vez.',
  sanctum: () => 'La puerta del santuario quedó abierta para siempre. Adentro te espera el <b>Sello del Eco</b>.',
  eco: () => `<b>${K('eco')}</b> emite un <b>Eco</b>: derrumba paredes agrietadas, destruye arañas, repele espectros y aturde centinelas por la espalda.`,
  timed: () => 'Las plataformas <b>parpadean</b> antes de desaparecer. Si caés, volvés al último <b>brasero</b>.',
  double: () => `Con las Plumas del Viento podés <b>saltar dos veces</b> (${K('jump')} en el aire).`,
  mirror: () => `Girá los <b>espejos</b> con <b>${K('use')}</b> para llevar la luz hasta el cristal. La luz disuelve espectros.`,
  boss: () => `Cuando el Guardián te apunte, apretá <b>${K('eco')}</b> justo cuando el rayo esté cerca para <b>devolverlo</b>.`,
  boss2: () => 'Pisá la placa de un resonador para abrir su luz y girá el espejo hacia el Guardián. <b>Saltá</b> las ondas y escondete tras un pilar del drenaje violeta.',
  boss3: () => `Devolvé los rayos con <b>${K('eco')}</b>. ¡Cuidado: ahora son más rápidos!`,
};
function tip(id) {
  const t = S().tutorial;
  if (t.off || t.seen[id] || tipId === id || state === 'menu') return;
  t.seen[id] = true; persist();
  tipId = id; tipT = 12;
  ui.tip(TIPS[id](), a => { if (a === 'skip') { S().tutorial.off = true; persist(); toast('Tutorial desactivado (lo podés reactivar desde «Cómo jugar»)', 2200); } closeTip(); });
  emit('tutorial');
}
function closeTip() { tipId = ''; ui.tip(null); }

/* ======================= áreas ======================= */
function loadArea(n, spawnId, silent = false) {
  if (level) level.dispose();
  fx.clear(); cur = null;
  level = [buildArea1, buildArea2, buildArea3][n - 1](ctx);
  level.finalize();
  const e = level.env;
  /** @type {any} */ (scene.background).setHex(e.bg); /** @type {any} */ (scene.fog).color.setHex(e.fog);
  hemi.color.setHex(e.sky); hemi.groundColor.setHex(e.ground); hemi.intensity = e.hemi;
  sun.color.setHex(e.sun); sun.intensity = e.sunI;
  fx.setDustColor(e.dust);
  applyQuality();
  const s = S(); s.area = n;
  if (spawnId) s.cp = spawnId;
  persist();
  placeAtSpawn();
  if (!silent) { ui.title(AREA_NAMES[n], ROMAN[n] + ' · ESCENARIO'); emit('area', n); }
}
function placeAtSpawn() {
  const s = S();
  let sp = level.spawns[s.cp];
  if (level.boss && level.boss.active) sp = level.spawns.a3_arena;
  if (!sp) { const k = Object.keys(level.spawns)[0]; sp = level.spawns[k]; s.cp = k; }
  const b = P.body; b.pos.x = sp.x; b.pos.y = sp.y + 0.05; b.pos.z = sp.z; b.vel.x = b.vel.y = b.vel.z = 0; b.ground = null; b.grounded = false;
  P.face = sp.ry; cam.yaw = sp.ry + Math.PI; cam.tx = sp.x; cam.ty = sp.y + 1.2; cam.tz = sp.z;
  if (s.braziers && level.braziers[s.cp]) { level.braziers[s.cp].lit = true; level.braziers[s.cp].flame.visible = true; }
}
function applyQuality() {
  const q = QUAL[game.quality] || QUAL.medium;
  const f = /** @type {THREE.Fog} */ (scene.fog); f.near = q.fogNear; f.far = q.fogFar;
  camera.far = q.far; camera.updateProjectionMatrix();
  fx.setDust(q.particles); fx.setBeamGlow(q.beamGlow);
  if (level) level.applyLights(q.lights);
}

/* ======================= ciclo de partida ======================= */
function startRun(fresh) {
  if (fresh) {
    const keep = { opts: S().opts, tutorial: S().tutorial, wins: S().wins };
    save.reset(); Object.assign(save.get(), structuredClone(keep)); sanitize(); persist();
    emit('newGame');
  }
  const s = S(); s.started = true; persist();
  const d = diff();
  run.score = 0; run.time = 0; run.flames = d.flames; run.roomT = {}; run.curRoom = ''; run.deaths = 0;
  P.maxHp = d.hp; P.hp = d.hp; P.inv = 0; P.ecoCd = 0; P.alive = true; P.jumps = 0; P.knock = 0;
  cut = null; closeTip();
  loadArea(s.area, s.cp);
  state = 'play';
  menu.hide(); endScreen.hide(); helpScreen.hide(); optScreen.hide();
  ui.show(true); input.showTouch(true); input.clear();
  M.runStart();
  if (s.relics.sello) emit('sello');
  const rooms = ['luz', 'eco', 'vacio'].filter(k => s.rooms[k]).length; if (rooms) emit('roomSolved', rooms);
  if (s.codices.length) emit('codex', s.codices.length);
  if (s.secrets.length) emit('secret', s.secrets.length);
  if (s.bossDone) emit('heartOff');
  A.started();
  moved = 0;
  setTimeout(() => tip('move'), 300);
}
function endRun(won) {
  M.runEnd({ won });
  A.ended({ score: run.score });
}
function onRestart() {
  if (state === 'menu') return;
  endRun(false);
  startRun(false);
}
function exitToMenu() {
  // la acción del menú de pausa deja el bucle detenido: se reanuda a través del SDK antes de cambiar de estado
  if (ACTIVE.has(state)) { A.pause(); A.resume(); }
  if (ACTIVE.has(state)) endRun(false);
  state = 'menu'; showMenu();
}
function hurt(n, fromX, fromZ, kind, knock = 5) {
  if (!P.vulnerable) return;
  P.hp -= n; P.inv = 1.1;
  const b = P.body, dx = b.pos.x - fromX, dz = b.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
  b.vel.x = dx / l * knock; b.vel.z = dz / l * knock; b.vel.y = 4.5; P.knock = 0.28;
  if (!reduced()) ui.flash();
  fx.shake(0.3); sfx.hurt(); emit('hurt');
  if (P.hp <= 0) die(kind);
}
function die(kind) {
  if (state !== 'play') return;
  run.flames--; run.deaths++; P.alive = false; P.hp = 0;
  state = 'dead'; run.deadT = 1.5; run.deadFell = false;
  sfx.die(); emit('death');
  fx.burst(P.body.pos.x, 1, P.body.pos.z, 0xffd27a, 24, 3);
  toast(run.flames > 0 ? `Te desvaneciste… volvés al brasero (🔥 ${run.flames})` : 'Se apagó tu última llama', 2000);
}
function fallOut() {
  sfx.fall(); emit('fall');
  P.hp -= 1;
  if (P.hp <= 0) { P.alive = true; state = 'play'; die('fall'); return; }
  P.alive = false; state = 'dead'; run.deadT = 0.9; run.deadFell = true;
  toast('¡Caíste! Volvés al último brasero', 1500);
}
function respawn() {
  if (run.flames <= 0) { defeat(); return; }
  ui.fade(true);
  setTimeout(() => ui.fade(false), 250);
  if (!run.deadFell) P.hp = P.maxHp;
  if (level.boss && level.boss.active) { level.boss.startPhase(level.boss.sub === 'trans' ? level.boss.toPhase : level.boss.phase); }
  placeAtSpawn();
  P.alive = true; P.inv = 1.5; P.knock = 0; state = 'play';
  for (const e of level.enemies) if (e.kind === 'sentinel') e.reset();
}
function startBoss() {
  if (state !== 'play') return;
  level.closeDoor('a3_puerta');
  state = 'cutscene'; cutSkip = false; closeTip();
  const B = level.boss; B.introT = 0;
  ui.title('GUARDIÁN ECO', 'EL GRAN EVENTO'); sfx.roar();
  cut = {
    t: 0, dur: reduced() ? 2.2 : 4.4,
    step(dt) {
      B.intro(dt * (reduced() ? 2 : 1));
      const k = Math.min(1, cut.t / cut.dur), a = -0.7 + k * 1.3;
      camera.position.set(Math.sin(a) * 14, 2.5 + k * 4.5, Math.cos(a) * 14);
      camera.lookAt(0, 2.5 + k * 2.5, 0);
      if (k > 0.5) fx.shake(0.02);
    },
    end() { B.guardY = 0; B.startPhase(1); state = 'play'; tip('boss'); emit('bossStart'); },
  };
}
const C_TEAL = new THREE.Color(0x3fe8d6), C_TEAL2 = new THREE.Color(0x1fa89c);
function heartOff() {
  const B = level.boss;
  emit('heartOff'); addScore(3000 + run.flames * 300 + P.hp * 100);
  S().bossDone = true; S().wins++; persist();
  state = 'cutscene'; cutSkip = false;
  sfx.victory(); fx.ring(0, 1, 0, 0x3fe8d6, 16, 1.6); fx.burst(0, 2, 0, 0x7ffff0, 60, 7);
  const h = level.heart;
  cut = {
    t: 0, dur: reduced() ? 2 : 3.6,
    step(dt) {
      const k = Math.min(1, cut.t / cut.dur);
      h.mat.color.lerp(C_TEAL, dt * 2); h.mat.emissive.lerp(C_TEAL2, dt * 2);
      (level.floorGlyphs || []).forEach(g => g.material.color.lerp(C_TEAL, dt * 2));
      hemi.intensity = level.env.hemi + k * 0.8;
      camera.position.set(Math.sin(k * 1.2) * (8 + k * 6), 3 + k * 9, Math.cos(k * 1.2) * (8 + k * 6));
      camera.lookAt(0, 2, 0);
    },
    end() { victory(); },
  };
  void B;
}
function victory() {
  state = 'victory'; P.alive = false; ui.els.title.classList.remove('on');
  input.showTouch(false); ui.show(false);
  const best = A.scores.best(GAME_ID);
  endRun(true);
  const s = S(), rec = run.score >= best;
  endScreen.show(`<span class="k3-kicker">TEMPLO REACTIVADO</span><h1>¡VICTORIA!</h1>
    <p>El Corazón del Templo se apagó y la reliquia sigue intacta. Los ecos vuelven a cantar.</p>
    <div class="te-menu-prog">Puntos: <b>${run.score}</b>${rec ? ' · ¡NUEVO RÉCORD!' : ` · Récord: ${Math.max(best, run.score)}`}<br>Tiempo: ${fmtTime(run.time)} · Llamas: ${run.flames} · Códices: ${s.codices.length}/9 · Secretos: ${s.secrets.length}/2</div>
    <p class="te-small">Recompensa: tu farol ahora brilla dorado y el templo queda abierto para buscar lo que falte.</p>
    <div class="k3-btnrow"><button class="k3-b" data-menu>🏛 Menú del templo</button><button class="k3-b alt" data-new>Nueva expedición</button></div>`);
}
function defeat() {
  state = 'defeat'; P.alive = false; ui.els.title.classList.remove('on');
  input.showTouch(false); ui.show(false);
  endRun(false);
  endScreen.show(`<span class="k3-kicker">EL TEMPLO TE RECLAMÓ</span><h1>DERROTA</h1>
    <p>Te quedaste sin llamas. Tus reliquias, salas resueltas y códices siguen guardados.</p>
    <div class="te-menu-prog">Puntos de esta partida: <b>${run.score}</b> · Tiempo: ${fmtTime(run.time)}</div>
    <div class="k3-btnrow"><button class="k3-b" data-retry>↻ Reintentar desde el brasero</button><button class="k3-b alt" data-menu>🏛 Menú</button></div>`);
}
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

/* ======================= actualización ======================= */
const _sunOff = new THREE.Vector3();
function update(dt) {
  if (state === 'menu' || state === 'victory' || state === 'defeat') {
    menuCamera(dt);
    if (level) { level.update(dt, Pidle); if (level.boss) level.boss.update(dt, Pidle); }
    fx.update(dt, camFocus); drawBeams();
    PM.group.visible = PM.blob.visible = false;
    input.takeLook(); input.endStep();
    return;
  }
  PM.group.visible = PM.blob.visible = true;
  P.inv -= dt; P.ecoCd -= dt;
  if (state === 'play') { run.time += dt; control(dt); }
  else if (state === 'dead') { run.deadT -= dt; if (run.deadT <= 0) respawn(); }
  else if (state === 'transition') {
    run.transT -= dt;
    if (run.transT <= 0) { loadArea(run.transTo, run.transSpawn); state = 'play'; ui.fade(false); }
  } else if (state === 'cutscene' && cut) {
    if (input.hit('Space', 'Enter', binds().use, binds().jump, 'F13', 'F14', 'btn:jump', 'btn:use') || cutSkip) { cut.t = cut.dur; cutSkip = false; }
    cut.t += dt; cut.step(dt);
    if (cut.t >= cut.dur) { const c = cut; cut = null; c.end(); }
  }
  if (level) { level.update(dt, P); if (level.boss) level.boss.update(dt, P); }
  fx.update(dt, P.body.pos); drawBeams();
  animatePlayer(dt);
  if (state !== 'cutscene') updateCamera(dt); else input.takeLook();
  hudTick(dt);
  input.endStep();
}
function drawBeams() { if (level) fx.beams(level.segs, level.segCount, level.ends, level.endCount, BEAM_Y); }

function control(dt) {
  const b = P.body, a = input.axis(), bd = binds();
  const yaw = cam.yaw, fxv = -Math.sin(yaw), fzv = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let mx = rx * a.x + fxv * -a.y, mz = rz * a.x + fzv * -a.y;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const speed = 5.6;
  if (P.knock > 0) P.knock -= dt;
  else { const k = Math.min(1, dt * (b.grounded ? 14 : 6)); b.vel.x += (mx * speed - b.vel.x) * k; b.vel.z += (mz * speed - b.vel.z) * k; }
  if (ml > 0.15) { P.face = Math.atan2(mx, mz); moved += ml * speed * dt; }
  // salto (con búfer y tiempo de coyote) y doble salto
  if (input.hit(bd.jump, 'F13', 'btn:jump')) P.jumpBuf = 0.13; else P.jumpBuf -= dt;
  P.coyote = b.grounded ? 0.1 : P.coyote - dt;
  if (P.jumpBuf > 0) {
    if (P.coyote > 0) { b.vel.y = 8.4; P.coyote = 0; P.jumpBuf = 0; P.jumps = 1; sfx.jump(); emit('jump'); }
    else if (S().relics.plumas && P.jumps < 2) { b.vel.y = 7.8; P.jumps = 2; P.jumpBuf = 0; sfx.djump(); fx.ring(b.pos.x, b.pos.y + 0.1, b.pos.z, 0xa9f3ff, 1.6, 0.35); emit('doubleJump'); }
  }
  const holding = input.down(bd.jump) || input.down('F13') || input.button('jump');
  if (!holding && b.vel.y > 3 && P.jumps > 0) b.vel.y -= 38 * dt;
  b.vel.y = Math.max(-30, b.vel.y - 25 * dt);
  if (b.grounded && b.ground && (b.ground.dx || b.ground.dz)) { b.pos.x += b.ground.dx; b.pos.z += b.ground.dz; }
  const wasG = b.grounded, vy = b.vel.y;
  moveBody(level.cols, b, dt);
  if (b.grounded) { P.jumps = 0; if (!wasG && vy < -7) { sfx.land(); fx.burst(b.pos.x, b.pos.y + 0.05, b.pos.z, 0xcdb48a, 6, 1.5); } }
  P.pushing = level.tryPush(b, mx, mz, dt);
  if (b.grounded && ml > 0.3) { P.stepT -= dt; if (P.stepT <= 0) { sfx.step(); P.stepT = 0.32; } }
  if (b.pos.y < -7) { fallOut(); return; }
  // interactuar
  cur = null; let bestD = 1e9;
  for (const o of level.inters) {
    const d = Math.hypot(o.x - b.pos.x, o.z - b.pos.z);
    if (d < (o.r ?? 1.8) && d < bestD && Math.abs(b.pos.y + 1 - o.y) < 2.2 && (!o.can || o.can())) { cur = o; bestD = d; }
  }
  if (cur) tip('interact');
  if (cur && input.hit(bd.use, 'F14', 'btn:use')) { sfx.click(); cur.use(); emit('interact'); }
  // eco
  if (input.hit(bd.eco, 'F15', 'btn:eco')) eco();
  // pistas contextuales
  if (level.n === 1) {
    for (const id in level.blocks) { const bl = level.blocks[id]; if (Math.hypot(bl.x - b.pos.x, bl.z - b.pos.z) < 3) { tip('push'); break; } }
    for (const id in level.plates) { const pl = level.plates[id]; if (Math.hypot(pl.x - b.pos.x, pl.z - b.pos.z) < 2.5) { tip('plates'); break; } }
  }
}
function eco() {
  if (!S().relics.sello) { sfx.denied(); toast('Todavía no tenés el Sello del Eco', 1200); return; }
  if (P.ecoCd > 0) { sfx.denied(); return; }
  P.ecoCd = diff().ecoCd;
  const b = P.body;
  sfx.eco(); fx.ring(b.pos.x, b.pos.y + 0.15, b.pos.z, 0x3fe8d6, 4.6, 0.45); fx.ring(b.pos.x, b.pos.y + 1.0, b.pos.z, 0x7ffff0, 3.2, 0.35);
  level.pulse(b.pos.x, b.pos.z, 4.5);
  emit('eco');
}
function animatePlayer(dt) {
  const b = P.body, g = PM.group;
  g.position.set(b.pos.x, b.pos.y, b.pos.z);
  let d = P.face - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y += d * Math.min(1, dt * 14);
  const sp = Math.hypot(b.vel.x, b.vel.z);
  P.walk += dt * sp * 2.1;
  const sw = b.grounded ? Math.sin(P.walk) * Math.min(1, sp / 4) * 0.7 : 0.4;
  PM.legL.rotation.x = sw; PM.legR.rotation.x = b.grounded ? -sw : -0.3;
  PM.body.position.y = b.grounded ? Math.abs(Math.sin(P.walk)) * 0.05 * Math.min(1, sp / 4) : 0;
  PM.body.rotation.x = P.pushing ? 0.25 : 0;
  PM.flame.scale.setScalar(0.9 + Math.sin(level ? level.time * 17 : 0) * 0.15);
  /** @type {any} */ (PM.flame.material).color.setHex(S().wins > 0 ? 0xffe14a : 0xffd27a);
  PM.ring.visible = !!S().relics.sello;
  /** @type {any} */ (PM.ring.material).color.setHex(P.ecoCd > 0 ? 0x2a5a58 : 0x3fe8d6);
  g.visible = P.alive || state !== 'dead' ? !(P.inv > 0 && state === 'play' && Math.sin(P.inv * 30) > 0.3 && !reduced()) : false;
  // sombra de contacto
  let gy = -50;
  for (const c of level.cols) { if (c.on && b.pos.x > c.x0 && b.pos.x < c.x1 && b.pos.z > c.z0 && b.pos.z < c.z1 && c.y1 <= b.pos.y + 0.05 && c.y1 > gy) gy = c.y1; }
  PM.blob.visible = gy > -50 && P.alive; PM.blob.position.set(b.pos.x, gy + 0.03, b.pos.z);
  const h = Math.max(0, b.pos.y - gy); PM.blob.scale.setScalar(Math.max(0.4, 1 - h * 0.15));
}
const camFocus = new THREE.Vector3();
function updateCamera(dt) {
  const lk = input.takeLook(), o = S().opts;
  if (state === 'play') {
    cam.yaw -= lk.dx * 0.0055 * o.sens;
    cam.pitch = clamp(cam.pitch + lk.dy * 0.004 * o.sens * (o.invert ? -1 : 1), 0.42, 1.25);
    if (input.down('KeyQ')) cam.yaw += 2.2 * dt * o.sens;
    if (input.down('KeyR')) cam.yaw -= 2.2 * dt * o.sens;
  }
  const b = P.body, k = Math.min(1, dt * 9);
  const B = level && level.boss, lock = B && B.phase >= 1 && B.phase <= 3;
  // en el combate, la cámara encuadra a la exploradora y al Guardián (se puede seguir ajustando a mano)
  let fxp = b.pos.x, fzp = b.pos.z, fy = b.pos.y + 1.2, want = camera.aspect < 0.8 ? 12.5 : 10;
  if (lock) {
    const goal = Math.atan2(b.pos.x, b.pos.z), dd = Math.atan2(Math.sin(goal - cam.yaw), Math.cos(goal - cam.yaw));
    if (Math.abs(lk.dx) < 1 && !input.down('KeyQ') && !input.down('KeyR')) cam.yaw += dd * Math.min(1, dt * 2.6);
    fxp = b.pos.x * 0.62; fzp = b.pos.z * 0.62; fy = b.pos.y + 2.4; want += 3.5;
  }
  cam.tx += (fxp - cam.tx) * k; cam.ty += (fy - cam.ty) * Math.min(1, dt * 5); cam.tz += (fzp - cam.tz) * k;
  const pitch = lock ? Math.min(cam.pitch, 0.72) : cam.pitch;
  const ox = Math.sin(cam.yaw) * Math.cos(pitch), oy = Math.sin(pitch), oz = Math.cos(cam.yaw) * Math.cos(pitch);
  // la cámara se acerca si un muro visible tapa a la exploradora (y se aleja de a poco)
  let tmin = 1;
  for (const c of level.cols) {
    if (!c.on || c.tag === 'floor' || c.tag === 'plat' || c.vt <= c.y0 || Math.max(c.x1 - c.x0, c.z1 - c.z0) < 2.5) continue;
    const t = segBoxVisible(cam.tx, cam.ty, cam.tz, cam.tx + ox * want, cam.ty + oy * want, cam.tz + oz * want, c);
    if (t < tmin) tmin = t;
  }
  const allowed = Math.max(2.2, want * tmin - 0.4);
  cam.dist = allowed < cam.dist ? allowed : cam.dist + (allowed - cam.dist) * Math.min(1, dt * 2.5);
  const dist = cam.dist;
  const sh = fx.shakeAmt * 0.35;
  camera.position.set(
    cam.tx + ox * dist + (Math.random() - 0.5) * sh,
    cam.ty + oy * dist + (Math.random() - 0.5) * sh,
    cam.tz + oz * dist);
  camera.lookAt(cam.tx, cam.ty, cam.tz);
  camFocus.set(cam.tx, cam.ty, cam.tz);
  followSun(cam.tx, cam.tz);
}
function followSun(x, z) {
  const e = level ? level.env.sunDir : [6, 14, 8];
  sun.target.position.set(x, 0, z); sun.position.set(x + e[0], e[1], z + e[2]);
  void _sunOff;
}
const MENU_FOCUS = { 1: [0, 1, 4, 15], 2: [0, 1, -4, 16], 3: [0, 3, 0, 18] };
function menuCamera(dt) {
  cam.menuA += dt * (reduced() ? 0 : 0.08);
  const f = MENU_FOCUS[level ? level.n : 1];
  camera.position.set(f[0] + Math.sin(cam.menuA) * f[3], 7.5, f[2] + Math.cos(cam.menuA) * f[3]);
  camera.lookAt(f[0], f[1], f[2]);
  camFocus.set(f[0], f[1], f[2]);
  followSun(f[0], f[2]);
}

/* ======================= HUD ======================= */
function objective() {
  const s = S(), n = level ? level.n : 1;
  if (n === 1) {
    if (!s.relics.sello) return level.doors.a1_santuario && level.doors.a1_santuario.open ? 'Objetivo: tomá el Sello del Eco en el santuario' : 'Objetivo: hundí las tres placas para abrir el santuario';
    return 'Objetivo: cruzá el abismo y abrí el portal con el Sello';
  }
  if (n === 2) {
    const rs = ['luz', 'eco', 'vacio'];
    const solved = rs.filter(k => s.rooms[k]).length;
    let t = solved < 3 ? `Salas: ${rs.map(k => (s.rooms[k] ? '✔ ' : '· ') + ROOM_NAMES[k].replace('Sala de ', '').replace('Sala del ', '')).join('  ')}` : 'Objetivo: descendé por el sello central del hub';
    if (run.curRoom && !s.rooms[run.curRoom] && run.roomT[run.curRoom] !== undefined) {
      const el = run.time - run.roomT[run.curRoom], par = PAR[run.curRoom] * diff().parMul;
      t += `\n⏱ ${fmtTime(el)} (récord bajo ${fmtTime(par)})`;
    }
    return t;
  }
  const B = level.boss;
  if (s.bossDone) return 'El templo está reactivado. Buscá los códices y secretos que falten.';
  if (B.phase === 0) return 'Objetivo: enfrentá al Guardián en la Cámara';
  if (B.phase === 4) return 'Objetivo: desactivá el Corazón del Templo';
  return '';
}
let hudAcc = 0;
function hudTick(dt) {
  hudAcc += dt;
  if (tipId) { tipT -= dt; if (tipT <= 0 || (tipId === 'move' && moved > 6)) closeTip(); }
  if (hudAcc < 0.1) return;
  hudAcc = 0;
  const B = level && level.boss, s = S();
  ui.status({ hp: Math.max(0, P.hp), maxHp: P.maxHp, flames: run.flames, integrity: B && B.active ? B.integrity : null, score: run.score, eco: s.relics.sello ? (P.ecoCd > 0 ? 0 : 1) : null, ecoKey: input.isTouch ? 'ECO' : keyLabel(binds().eco) });
  ui.prompt(cur && state === 'play' ? (input.isTouch ? '' : keyLabel(binds().use)) : null, cur && state === 'play' ? cur.label() : null);
  ui.boss(B && B.active ? B.ui() : null);
  ui.objective(objective());
  if (ecoBtn) { ecoBtn.style.opacity = s.relics.sello ? (P.ecoCd > 0 ? '0.45' : '1') : '0.3'; }
  if (useBtn) { useBtn.style.borderColor = cur ? '#f5b84a' : ''; useBtn.style.background = cur ? 'rgba(245,184,74,.35)' : ''; }
}

/* ======================= pantallas ======================= */
const menu = screen('', { accent: ACCENT, id: 'te-menu' });
const endScreen = screen('', { accent: ACCENT, id: 'te-end' }); endScreen.hide();
const helpScreen = screen('', { accent: ACCENT, id: 'te-help' }); helpScreen.hide();
const optScreen = screen('', { accent: ACCENT, id: 'te-opts' }); optScreen.hide();
let newArmed = false;
function diffText() {
  const d = diff();
  return `Vida ${d.hp} ♥ · Llamas ${d.flames} · Enemigos ×${d.enemySpeed} · Plataformas ×${d.platformMul} · Aviso del Guardián ${d.telegraph}s · Ventana de reflejo ${d.parry}s · Melodía de ${d.melody} notas`;
}
function showMenu() {
  state = 'menu'; ui.show(false); input.showTouch(false); closeTip(); cut = null;
  endScreen.hide(); helpScreen.hide(); optScreen.hide();
  const s = S(), cont = s.started;
  const rooms = ['luz', 'eco', 'vacio'].filter(k => s.rooms[k]).length;
  newArmed = false;
  menu.show(`<span class="k3-kicker">PUZLES Y AVENTURA 3D</span><h1>TEMPLO DE LOS ECOS</h1>
    <p>Guiá la luz con espejos, repetí melodías de cristal, cruzá plataformas que se desvanecen y devolvé los rayos del Guardián sin sacrificar la reliquia.</p>
    ${cont ? `<div class="te-menu-prog">${ROMAN[s.area]} · ${AREA_NAMES[s.area]} · Salas ${rooms}/3 · Códices ${s.codices.length}/9 · Secretos ${s.secrets.length}/2${s.wins ? ' · 🏆 ' + s.wins : ''}</div>` : ''}
    <div class="k3-btnrow"><button class="k3-b" data-go>${cont ? '▶ Continuar expedición' : '▶ Comenzar expedición'}</button>${cont ? '<button class="k3-b alt" data-new>Nueva expedición</button>' : ''}</div>
    <div data-diff></div><div class="te-dtab" data-dtab>${diffText()}</div>
    <div class="k3-btnrow"><button class="k3-b alt" data-opts>⚙ Controles y opciones</button><button class="k3-b alt" data-help>📖 Cómo jugar</button></div>
    <div class="te-credit">CREADO POR <img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  const holder = /** @type {HTMLElement} */ (menu.el.querySelector('[data-diff]'));
  M.difficultyPicker(holder, { onChange: () => { const t = menu.el.querySelector('[data-dtab]'); if (t) t.textContent = diffText(); } });
  // fondo del menú: el escenario guardado
  const want = cont ? s.area : 1;
  if (!level || level.n !== want) loadArea(want, cont ? s.cp : 'a1_inicio', true);
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
endScreen.on('[data-menu]', () => showMenu());
endScreen.on('[data-new]', () => startRun(true));
endScreen.on('[data-retry]', () => startRun(false));

let fromPause = false;
function openHelp(pause) {
  fromPause = pause;
  if (!pause) menu.hide();
  helpScreen.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:32px">EL TEMPLO</h1>
    <ul class="k3-list">
      <li>🕹 <b>Moverte:</b> ${input.isTouch ? 'joystick izquierdo' : 'WASD o flechas'} · <b>Cámara:</b> arrastrar ${input.isTouch ? 'el dedo' : 'el mouse'}${input.isTouch ? '' : ' o Q/R'}</li>
      <li>⤴ <b>Saltar:</b> ${K('jump')} · <b>Interactuar:</b> ${K('use')} · <b>Eco:</b> ${K('eco')}</li>
      <li>🎮 <b>Gamepad:</b> stick/cruceta mover · A saltar · X interactuar · B eco · LB/RB cámara · Start pausa</li>
      <li>🪞 <b>Espejos:</b> giralos para llevar la luz al cristal. 🔘 <b>Placas:</b> se hunden con bloques o con vos.</li>
      <li>🎵 <b>Cristales:</b> escuchá a la Estatua Cantora y repetí la melodía (cada nota tiene color, forma y sonido).</li>
      <li>🔥 <b>Braseros:</b> son puntos de control. Si caés o te quedás sin vida volvés al último, gastando una llama.</li>
      <li>🗿 <b>Centinela:</b> escondete de su cono o hacelo chocar. 🕷 <b>Araña:</b> un Eco la destruye. 👻 <b>Espectro:</b> el Eco lo repele y la luz lo disuelve.</li>
      <li>👁 <b>Guardián Eco:</b> devolvé sus rayos con el Eco, guiá la luz de los resonadores y cuidá la reliquia del drenaje violeta.</li>
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
  const row = (id, name) => `<div class="te-bind"><span>${name}</span><button type="button" data-bind="${id}">${listening === id ? 'Apretá una tecla…' : keyLabel(o.binds[id])}</button></div>`;
  optScreen.show(`<span class="k3-kicker">OPCIONES</span><h1 style="font-size:30px">CONTROLES</h1>
    <div class="te-opts">
      ${row('jump', 'Saltar')}${row('use', 'Interactuar')}${row('eco', 'Eco')}
      <label>Sensibilidad de cámara <input type="range" min="0.4" max="2" step="0.1" value="${o.sens}" data-sens aria-label="Sensibilidad de cámara"></label>
      <label>Invertir cámara vertical <input type="checkbox" data-invert ${o.invert ? 'checked' : ''}></label>
      <label>Movimiento (sacudidas y destellos) <select data-motion><option value="auto"${o.motion === 'auto' ? ' selected' : ''}>Según el sistema</option><option value="reduce"${o.motion === 'reduce' ? ' selected' : ''}>Reducido</option><option value="full"${o.motion === 'full' ? ' selected' : ''}>Completo</option></select></label>
      <div class="te-small">Mover: WASD/flechas · Cámara: Q/R o arrastrar · Gamepad: A saltar, X interactuar, B eco, LB/RB cámara, Start pausa. Sonido y calidad gráfica: botón ⚙/⏸ de la barra.</div>
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
  if (e.code !== 'Escape' && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyR', 'KeyP'].includes(e.code)) {
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
// en la cinemática, un toque la salta
game.root.addEventListener('pointerdown', () => { if (state === 'cutscene') cutSkip = true; });

/* ======================= gancho de pruebas ======================= */
const hook = {
  get state() { return state; },
  get scene() { return level ? level.name : ''; },
  get area() { return level ? level.n : 0; },
  get missions() { return M.state(); },
  get player() { const b = P.body.pos; return { x: +b.x.toFixed(3), y: +b.y.toFixed(3), z: +b.z.toFixed(3), grounded: P.body.grounded, alive: P.alive, face: P.face }; },
  get hp() { return P.hp; }, get maxHp() { return P.maxHp; }, get flames() { return run.flames; },
  get score() { return run.score; }, get runTime() { return run.time; }, get simTime() { return game.simTime; },
  get paused() { return game.paused; },
  get tip() { return tipId; }, get prompt() { return cur ? cur.label() : ''; },
  get camYaw() { return cam.yaw; },
  get counts() {
    if (!level) return {};
    return { enemies: level.enemies.length, alive: level.enemies.filter(e => !e.dead && e.state !== 'gone').length, colliders: level.cols.length, interactables: level.inters.length, beams: level.segCount, codices: level.codices.filter(c => !c.taken).length, orbs: level.boss ? level.boss.orbCount : 0 };
  },
  get enemies() { return level ? level.enemies.map(e => ({ kind: e.kind, state: e.state, dead: !!e.dead })) : []; },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...game.perf, heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames: game.frames }; },
  get quality() { return { q: game.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, particles: fx.dustCount, lights: level ? level.lights.filter(l => l.visible).length : 0, fogFar: /** @type {any} */ (scene.fog).far, beamGlow: QUAL[game.quality].beamGlow }; },
  get difficulty() { return { name: diffName(), ...diff() }; },
  get boss() { const B = level && level.boss; return B ? { phase: B.phase, sub: B.sub, hp: B.hp, shards: B.shards, p3: B.p3, integrity: B.integrity, drain: B.drain, reflects: B.reflects, orbs: B.orbs.filter(o => o.on).map(o => ({ x: +o.x.toFixed(2), y: +o.y.toFixed(2), z: +o.z.toFixed(2), back: o.back })), heartY: +B.heartY.toFixed(2) } : null; },
  get puzzle() {
    if (!level) return {};
    const o = /** @type {any} */ ({ plates: {}, doors: {}, mirrors: {}, blocks: {}, receptors: {}, walls: {}, platforms: level.platforms.map(p => p.kind === 'timed' ? p.solid : true) });
    for (const k in level.plates) o.plates[k] = level.plates[k].down;
    for (const k in level.doors) o.doors[k] = level.doors[k].open;
    for (const k in level.mirrors) o.mirrors[k] = level.mirrors[k].idx;
    for (const k in level.blocks) o.blocks[k] = [level.blocks[k].x, level.blocks[k].z];
    for (const k in level.receptors) o.receptors[k] = level.receptors[k].lit;
    for (const k in level.walls) o.walls[k] = level.walls[k].broken;
    if (level.echo) o.echo = { state: level.echo.state, input: level.echo.input, len: level.echo.melody.length, melody: DEBUG ? level.echo.melody.slice() : undefined, hint: level.echo.hint };
    return o;
  },
  get save() { return structuredClone(S()); },
};
if (DEBUG) {
  /** @type {any} */ (hook).debug = {
    goto(n, cp) { if (state === 'menu') startRun(false); loadArea(n, cp || ({ 1: 'a1_inicio', 2: 'a2_inicio', 3: 'a3_inicio' })[n]); state = 'play'; P.alive = true; },
    simulate(sec) { game.simulate(sec); },
    teleport(x, y, z) { const b = P.body.pos; b.x = x; b.y = y; b.z = z; P.body.vel.x = P.body.vel.y = P.body.vel.z = 0; cam.tx = x; cam.tz = z; },
    setHP(n) { P.hp = n; }, setFlames(n) { run.flames = n; },
    give(kind) { ctx.takeRelic(kind, P.body.pos.x, P.body.pos.z); },
    solveRoom(id) { ctx.solveRoom(id); },
    openDoor(id) { level.openDoor(id); },
    use(id) { const o = level.inters.find(i => i.id === id); if (o) o.use(); return !!o; },
    rotateMirror(id) { level.rotateMirror(id); },
    pulse() { eco(); },
    hurt(n) { P.inv = 0; hurt(n, P.body.pos.x + 1, P.body.pos.z, 'debug', 2); },
    spawnBoss() { this.goto(3, 'a3_inicio'); this.teleport(0, 0, 10); },
    bossPhase(n) { const B = level.boss; if (B.phase === 0) { level.closeDoor('a3_puerta'); B.guardY = 0; } B.startPhase(n); state = 'play'; cut = null; },
    bossHit() { level.boss.damage(); },
    killBoss() { level.boss.defeat(); },
    strike(i) { const o = level.inters.find(x => x.id === 'crystal:' + i); if (o) o.use(); },
    skipCut() { if (cut) cut.t = cut.dur; },
    reflectAll() { const B = level.boss; for (const o of B.orbs) if (o.on) o.back = true; },
  };
}
W['__' + GAME_ID] = Object.freeze(hook);

/* ======================= arranque ======================= */
showMenu();
applyQuality();
game.start();
