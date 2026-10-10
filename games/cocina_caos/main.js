// @ts-check
/* Cocina del Caos — juego principal (Kit3D + MLArcade + MLMissions).
   Bucle: tomar ingredientes → picar/hornear/olla → emplatar → servir por la cinta → lavar platos,
   contra reloj y con caos (fuego, derrames, roedores, eventos por cocina). 3 cocinas + Gran Banquete en 3 fases. */
import { createGame, createInput, createSave, screen, toast, clamp, lerp, rng, THREE } from '../../matelabs/kit3d.js';
import * as CF from './config.js';
import { MAT, THEMES, makeChef, makeHelper, makeRat, chefHatGeo, mesh } from './models.js';
import { buildKitchen } from './world.js';
import { createSim } from './sim.js';
import { createHelper, makePather, TASKS } from './helper.js';
import { createFX } from './fx.js';
import { SFX, MUSIC } from './sfx.js';
import * as UI from './ui.js';

const W = /** @type {any} */ (window);
const SDK = W.MLArcade, MM = W.MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const { ACCENT, TS, ING, RECIPES, KITCHENS, KITCHEN_ORDER, BANQUET } = CF;
const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));

/* ======================= guardado ======================= */
const save = createSave(CF.SAVE_KEY, CF.SAVE_VERSION, CF.defaults(), CF.migrate);
let SV = CF.sanitize(save.get());
function flush() { save.set(/** @type {any} */ (SV)); }
flush();

/* ======================= contexto ======================= */
/** @type {any} */
const G = {
  mode: 'loading', diffKey: MM.difficulty(CF.GAME_ID), D: CF.DIFFICULTY.normal, Q: CF.QUALITY.medium, quality: 'medium',
  kitchens: /** @type {Record<string, any>} */ ({}), K: null, sim: null, kitchenId: 'taberna', banquet: null, // {phase, stars:[], score}
  player: { x: 0, z: 0, yaw: Math.PI, vx: 0, vz: 0, hold: null, dash: 0, dashCd: 0, stun: 0, walk: 0, working: 0, moved: 0, act: 0 },
  cam: { x: 0, y: 10, z: 10, tx: 0, tz: 0, shake: 0, follow: false, dist: 14, pitch: 0.95 }, cut: null,
  focus: null, focusDesc: null, endKind: '', t: 0, events: [], virt: { tap: false, hold: false }, selKitchen: '', tut: null,
  RECIPES,
};
G.D = CF.DIFFICULTY[G.diffKey] || CF.DIFFICULTY.normal;

/* ======================= motor ======================= */
const HELP = [
  'Moverte: WASD / flechas · Táctil: joystick · Gamepad: stick',
  'ACCIÓN (E o Espacio · botón grande · A): agarrar, dejar, emplatar, servir. Mantenela para picar, lavar, limpiar y apagar fuego.',
  'Ayudante Pipo: Q cambia su encargo (o 1-4, botón 🧑‍🍳, X del gamepad): lavar · picar · emergencias · seguirte',
  'Impulso: Shift (⚡ · B del gamepad). La estación que mirás se marca con un marco y una flecha.',
  'Recetas: picá en la tabla, horneá en el horno, sopas en la olla (3 picados) y arroz (2). Emplatá con un plato limpio y ponelo en la CINTA.',
  'Pedidos arriba con su tiempo: si vence, es un pedido fallido. Muchos fallidos = derrota. Juntá estrellas para desbloquear cocinas.',
  'Fuego: usá el 🧯 extintor (o tus manos, más lento). Derrames: limpialos o resbalás. Roedores: tocalos para espantarlos.',
];
const g = createGame({
  id: CF.GAME_ID, title: 'Cocina del Caos', accent: ACCENT, help: HELP, toolbar: 'tr', background: 0x2b1d14, fov: 40, far: 140,
  gamepad: { a: 'Space', x: 'KeyQ', b: 'ShiftLeft', y: 'KeyE', lb: 'Digit1', rb: 'Digit2' },
  isActive: () => G.mode === 'play' || G.mode === 'cutscene',
  update, render,
  onRestart: restartShift,
  onQuality: applyQuality,
  actions: [
    { label: '📘 Ver tutorial de nuevo', fn: () => { if (G.mode === 'play') replayTutorial(); } },
    { label: '⌨ Controles', fn: () => { if (G.mode === 'play') openControls(); } },
    { label: '🏠 Menú principal', fn: () => toMenu() },
  ],
});
const { scene, camera, renderer } = g;
scene.fog = new THREE.Fog(0x2b1d14, 20, 55);
const input = createInput(g.root, { joystick: 'left', buttons: [{ id: 'act', label: 'ACCIÓN' }, { id: 'dash', label: '⚡' }, { id: 'help', label: '🧑‍🍳' }] });
input.showTouch(false);
const actBtn = /** @type {HTMLElement} */ (document.querySelector('.k3-btn[aria-label="act"]'));
const helpBtn = /** @type {HTMLElement} */ (document.querySelector('.k3-btn[aria-label="help"]'));

/* ---------- luces ---------- */
const hemi = new THREE.HemisphereLight(0xffe2b8, 0x4a3322, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd8a0, 2.0); sun.position.set(-6, 14, 9); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 40 }); sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const point = new THREE.PointLight(0xff9a4a, 12, 14, 1.6); point.position.set(0, 3, 0); scene.add(point);

/* ---------- efectos y personajes ---------- */
const fx = createFX(scene);
const chef = makeChef(SV.goldHat); scene.add(chef.group);
const pipo = makeHelper(); scene.add(pipo.group);
const shadowGeo = new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2);
const chefSh = new THREE.Mesh(shadowGeo, MAT.shadow); chefSh.position.y = 0.02; scene.add(chefSh);
const pipoSh = new THREE.Mesh(shadowGeo, MAT.shadow); pipoSh.position.y = 0.02; pipoSh.scale.setScalar(0.8); scene.add(pipoSh);
const ratMeshes = { a: [0, 1, 2, 3].map(() => { const m = makeRat(false); m.visible = false; scene.add(m); return m; }), b: [0, 1, 2, 3].map(() => { const m = makeRat(true); m.visible = false; scene.add(m); return m; }) };
const helper = createHelper(G);
G.helper = helper;

/* ---------- audio ---------- */
G.sfx = k => { const o = SFX[k]; if (o) g.audio.tone({ ...o, id: k, gap: o.gap ?? 0.05 }); };
let musicT = 0, musicStep = 0;
function music(dt) {
  if (!G.sim || G.mode !== 'play') return;
  musicT -= dt; if (musicT > 0) return;
  const m = MUSIC[G.K.def.theme]; const hurry = G.sim.S.time < 25;
  musicT = m.beat * (hurry ? 0.75 : 1); musicStep++;
  const bar = Math.floor(musicStep / 8) % 4;
  if (musicStep % 2 === 0) g.audio.tone({ f: m.bass[bar] / 2, d: 0.22, type: 'triangle', v: 0.035, id: 'mb' });
  if (musicStep % 8 !== 7 && (musicStep * 5) % 3 !== 1) g.audio.tone({ f: m.notes[(musicStep * 3 + bar * 2) % m.notes.length], d: 0.16, type: m.type, v: 0.02, id: 'mm' });
  if (G.K.def.theme === 'volcan' && musicStep % 4 === 0) g.audio.tone({ f: 70, d: 0.12, noise: true, v: 0.05, id: 'mk' });
}

/* ======================= calidad ======================= */
function applyQuality(q) {
  G.quality = q; G.Q = CF.QUALITY[q] || CF.QUALITY.medium;
  fx.setCap(G.Q.particles);
  sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  point.visible = G.Q.lights;
  applyFog();
  for (const k of Object.keys(G.kitchens)) { const st = G.kitchens[k].group.children.find(o => o.isPoints); if (st) st.geometry.setDrawRange(0, G.Q.stars); }
}
function applyFog() { scene.fog.near = G.Q.fog[0]; scene.fog.far = G.Q.fog[1]; camera.far = G.Q.fog[1] + 60; camera.updateProjectionMatrix(); }

/* ======================= cocinas ======================= */
function getKitchen(id) {
  if (!G.kitchens[id]) { const k = buildKitchen(KITCHENS[id], G.Q); k.group.visible = false; scene.add(k.group); G.kitchens[id] = k; applyQuality(G.quality); }
  return G.kitchens[id];
}
function showKitchen(id) {
  for (const k of Object.keys(G.kitchens)) G.kitchens[k].group.visible = false;
  const K = getKitchen(id); K.group.visible = true; G.K = K; G.kitchenId = id;
  const th = THEMES[K.def.theme];
  /** @type {THREE.Color} */ (scene.background).set(th.sky); scene.fog.color.set(th.fog);
  hemi.color.set(th.hemiSky); hemi.intensity = th.hemiI || 1.25; hemi.groundColor.set(th.hemiGround); sun.color.set(th.sun); point.color.set(th.accentLight);
  MAT.puddle.color.set(th.puddle);
  point.position.set(K.def.theme === 'volcan' ? 0 : -2, 3, K.def.theme === 'volcan' ? 0 : -1);
  G.path = makePather(K);
  fitCamera(true);
  return K;
}

/* ======================= turno ======================= */
let rand = rng(1);
function hooks() {
  return {
    sfx: k => G.sfx(k), burst: (x, y, z, c, n) => fx.burst(x, y, z, c, n), toast: t => toast(t, 2200),
    emit: (ev, v) => { MM.emit(ev, v); },
    event: ev => { G.events.push(ev); if (G.events.length > 80) G.events.shift(); tutEvent(ev); onSimEvent(ev); },
    orderIn: o => seatIn(o), orderOut: (o, ok, pts, perfect) => seatOut(o, ok, pts, perfect),
    chop: st => { if (Math.random() < 0.3) G.sfx('chop'); if (Math.random() < 0.25) fx.burst(st.x, st.top + 0.15, st.z, 0x9be07a, 1, 1.5); },
    wash: st => { G.sfx('wash'); if (Math.random() < 0.3) fx.puff(st.x, st.top + 0.2, st.z, 0xdff6ff, 1); },
    spray: (st, ext) => { G.sfx('foam'); if (Math.random() < 0.6) fx.burst(st.x, st.top + 0.4, st.z, ext ? 0xffffff : 0x9fd8ff, 2, 1.5); },
    shake: a => { if (!REDUCED) G.cam.shake = Math.max(G.cam.shake, a); },
    path: (x, z, tx, tz) => G.path(x, z, tx, tz),
    actors: () => [G.player, helper.A],
    telegraph: (type, ev, t) => telegraph(type, ev, t),
    chaosFired: t => { if (t === 'temblor') G.sfx('quake'); },
    royal: o => { UI.banner(`${RECIPES[o.recipe].name}: ¡vale doble!`, '👑 PEDIDO REAL', 2600, 'royal'); G.sfx('fanfare'); },
    end: S => onShiftEnd(S),
  };
}
function startShift(id, phase = null) {
  const K = showKitchen(id);
  rand = rng(1234 + KITCHEN_ORDER.indexOf(id) * 77 + (phase ? 999 : 0));
  G.sim = createSim(K, { D: G.D, banquet: phase, hooks: hooks(), rand });
  Object.assign(G.player, { x: K.spawn.x, z: K.spawn.z, yaw: Math.PI, vx: 0, vz: 0, hold: null, dash: 0, dashCd: 0, stun: 0, working: 0 });
  helper.reset(K.helperSpawn.x, K.helperSpawn.z);
  for (const s of K.seats) { s.cust.group.visible = false; s.card.visible = false; s.bar.visible = false; s.dish.visible = false; s.orderId = -1; s.leave = 0; s.pop = 0; }
  G.dishes = [];
  G.focus = null; G.endKind = ''; G.mode = 'play';
  fitCamera(true);
  UI.show('hud', true); input.showTouch(true); UI.invalidate(); UI.clearPops();
  UI.setText('hKitchen', `${K.def.icon} ${phase ? 'Banquete · ' + phase.name : K.def.name}`);
  UI.show('phase', !!phase);
  if (phase) UI.setText('phase', `👑 GRAN BANQUETE · ${phase.kicker} de 3 · estrellas ${G.banquet.stars.reduce((a, b) => a + b, 0)}/${G.D.banquetStars} necesarias`);
  updateHelperUI();
  if (!phase && !SV.tutorialDone && id === 'taberna') startTutorial();
  else { G.tut = null; UI.show('coach', false); UI.banner(K.def.hazards, K.def.name, 2800); }
  if (phase) { UI.banner(phase.rule, `👑 ${phase.kicker} · ${phase.name}`, 4200, 'royal'); G.sfx('horn'); }
  G.sfx('ui');
}

/* ---------- comensales y tickets 3D ---------- */
function drawTicket(seat, o) {
  const x = /** @type {CanvasRenderingContext2D} */ (seat.cv.getContext('2d')), r = RECIPES[o.recipe];
  x.clearRect(0, 0, 128, 128);
  x.fillStyle = o.royal ? '#fff3c4' : '#fffdf6'; x.strokeStyle = o.royal ? '#e0a820' : '#c9c2b0'; x.lineWidth = 6;
  x.beginPath(); x.roundRect ? x.roundRect(6, 6, 116, 116, 14) : x.rect(6, 6, 116, 116); x.fill(); x.stroke();
  x.fillStyle = '#ff5c7a'; x.fillRect(6, 6, 116, 14);
  x.font = '58px system-ui,"Apple Color Emoji","Segoe UI Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(r.icon, 64, 62);
  x.font = 'bold 15px system-ui,sans-serif'; x.fillStyle = '#3a2a20'; x.fillText(o.royal ? '👑 REAL' : r.steps + ' pasos', 64, 106);
  seat.tex.needsUpdate = true;
}
function seatIn(o) {
  const s = G.K.seats[o.seat]; if (!s) return;
  s.orderId = o.id; s.leave = 0; s.pop = 1; s.mood = 1;
  s.cust.group.visible = true; s.card.visible = true; s.bar.visible = true; s.dish.visible = false;
  drawTicket(s, o);
  G.sfx('clink');
}
function seatOut(o, ok, pts, perfect) {
  const s = G.K.seats[o.seat];
  if (s) {
    s.card.visible = false; s.bar.visible = false; s.leave = ok ? 2.6 : 1.6; s.happy = ok;
    if (ok) { s.dishItem = { t: 'plate', items: RECIPES[o.recipe].parts.slice() }; }
    else s.dishItem = null;
  }
  const sx = s ? s.x : 0, sz = s ? s.z : 0;
  if (ok) {
    UI.pop(`+${pts}${perfect ? ' ¡PERFECTO!' : ''}`, sx - 0.6, 2.4, sz, perfect ? '#ffe066' : '#9df7b0');
    fx.burst(sx - 0.7, 1.4, sz, perfect ? 0xffe066 : 0xff5c7a, 14);
    SV.served++; if (perfect) SV.stats.perfect++; flush();
  } else { UI.pop('😡 ¡Se fue sin comer!', sx - 0.6, 2.4, sz, '#ff8a8a'); }
}
function telegraph(type, ev, t) {
  const TXT = {
    ratas: ['🐀 ¡ROEDORES!', 'Se oyen chillidos en la ratonera…'], barril: ['🛢 ¡BARRIL PINCHADO!', 'Va a haber derrames donde ves la marca'],
    grasa: ['🔥 ¡GRASA AL ROJO!', 'Una estación de cocción se va a prender fuego'], erupcion: ['🌋 ¡ERUPCIÓN!', 'Cae lava sobre las estaciones marcadas'],
    temblor: ['💥 ¡TEMBLOR!', 'Se va a derramar aceite en las marcas'], grietas: ['♨ ¡GRIETAS!', 'Alejate de las grietas del piso: van a escupir vapor'],
    esclusa: ['🚨 ¡ESCLUSA!', 'La esclusa se abre: ¡agarrate! Te va a chupar hacia la izquierda'], gravedad: ['🪐 ¡GRAVEDAD CERO!', 'Todo va a patinar unos segundos'],
    meteoritos: ['☄ ¡METEORITOS!', 'Salpicaduras de baba espacial en las marcas'], wave: ['🎺 ¡OLEADA!', 'Llegan 3 comensales juntos'],
  };
  const tx = TXT[type] || ['⚠', type];
  UI.banner(tx[1], tx[0], t * 1000 + 600, 'warn');
  G.sfx(type === 'wave' ? 'horn' : 'alarm');
  G.chaosWarn = { type, t };
}
function onSimEvent(ev) { if (ev === 'fire') { SV.stats.fires++; } if (ev === 'ratShoo') SV.stats.rats++; if (ev.startsWith('burn')) SV.stats.burnt++; }

/* ======================= fin de turno, banquete ======================= */
const endScreen = screen('', { accent: ACCENT, id: 'ccEnd' }); endScreen.hide();
function starsHTML(n, of = 3) { let s = ''; for (let i = 0; i < of; i++) s += `<span class="st ${i < n ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.3}s">★</span>`; return `<div class="cc-stars" aria-label="${n} de ${of} estrellas">${s}</div>`; }
function onShiftEnd(S) {
  const id = G.kitchenId, D = G.D;
  G.player.hold = null; helper.A.hold = null;
  input.clear();
  if (G.banquet) return onPhaseEnd(S);
  const lost = !S.won && S.fails >= D.maxFails;
  SV.stats.shifts++;
  const b = SV.best[id]; b.score = Math.max(b.score, S.score); b.stars = Math.max(b.stars, S.stars || 0);
  let unlockedNow = '';
  const idx = KITCHEN_ORDER.indexOf(id);
  if (S.won && S.stars >= 1 && SV.unlocked < idx + 2) { SV.unlocked = idx + 2; unlockedNow = idx + 1 < 3 ? KITCHENS[KITCHEN_ORDER[idx + 1]].name : 'el Gran Banquete'; }
  flush();
  if (SV.unlocked >= 2) MM.emit('unlock2');
  if (S.won) { if (S.burnt === 0) MM.emit('noburn'); if (!S.dirtyFlag) MM.emit('clean'); }
  SDK.ended({ score: S.score });
  G.mode = 'end'; G.endKind = lost ? 'defeat' : S.stars >= 1 ? 'shift' : 'nostars';
  UI.show('hud', false); input.showTouch(false); UI.show('coach', false);
  G.sfx(lost ? 'lose' : S.stars ? 'fanfare' : 'fail');
  const next = KITCHEN_ORDER[idx + 1];
  const canNext = next && SV.unlocked >= idx + 2 ? next : (!next && SV.unlocked >= 4 ? 'banquete' : '');
  const stats = `<p class="cc-small">🍽 Servidos: <b>${S.served}</b> · ✨ Perfectos: <b>${S.perfect}</b> · ❌ Fallidos: <b>${S.fails}</b> · 🔁 Mejor racha: <b>${S.bestStreak}</b> · 🔥 Quemados: <b>${S.burnt}</b></p>`;
  const th = KITCHENS[id].stars;
  endScreen.show(`<span class="k3-kicker">${lost ? '¡LA COCINA COLAPSÓ!' : S.stars ? 'FIN DEL TURNO' : 'TURNO SIN ESTRELLAS'}</span>
    <h1>${lost ? 'Derrota' : KITCHENS[id].name}</h1>
    ${lost ? `<p>Demasiados pedidos fallidos (${S.fails}/${D.maxFails}). Los comensales se fueron furiosos… ¡a reorganizar la cocina!</p>` : starsHTML(S.stars)}
    <p class="cc-score">Puntaje: <b>${S.score}</b> · Récord: ${SV.best[id].score}</p>
    ${lost ? '' : `<p class="cc-small">Estrellas: ${th[0]} · ${th[1]} · ${th[2]} puntos</p>`}
    ${stats}
    ${unlockedNow ? `<p class="cc-unlock">🔓 ¡Desbloqueaste ${UI.esc(unlockedNow)}!</p>` : ''}
    <div class="k3-btnrow">
      ${canNext ? `<button class="k3-b" data-next="${canNext}">▶ ${canNext === 'banquete' ? 'Gran Banquete' : KITCHENS[canNext].name}</button>` : ''}
      <button class="k3-b ${canNext ? 'alt' : ''}" data-retry>↻ Reintentar</button><button class="k3-b alt" data-menu>Menú</button>
    </div>
    <div class="cc-credit">CREADO POR <img class="ml-ava" src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
}
function startBanquet() {
  G.banquet = { phase: 0, stars: [], scores: [] };
  G.mode = 'cutscene';
  menu.hide(); endScreen.hide();
  showKitchen('taberna');
  UI.show('hud', false); input.showTouch(false);
  G.cut = { t: 0, dur: REDUCED ? 2.5 : 6.5 };
  // la corte del Rey ya está sentada en el salón
  for (const s of G.K.seats) { s.cust.group.visible = true; s.cust.group.scale.setScalar(1); s.card.visible = false; s.bar.visible = false; s.orderId = -1; s.leave = 0; }
  UI.show('cut', true);
  UI.setHTML('cut', `<small>👑 EVENTO FINAL</small><b>EL GRAN BANQUETE</b><span>El Rey Glotón llega con toda su corte. Tres fases, tres cocinas, reglas nuevas en cada una. Necesitás <strong>${G.D.banquetStars} estrellas</strong> de 9.</span><em>${input.isTouch ? 'Tocá' : 'Apretá ACCIÓN'} para saltar</em>`);
  G.sfx('horn'); setTimeout(() => G.sfx('fanfare'), 700);
}
function endCutscene() {
  if (G.mode !== 'cutscene') return;
  G.cut = null; UI.show('cut', false);
  startShift(BANQUET[0].kitchen, BANQUET[0]);
}
function onPhaseEnd(S) {
  const B = G.banquet, ph = BANQUET[B.phase], D = G.D;
  const lost = S.fails >= D.maxFails;
  B.stars.push(S.stars || 0); B.scores.push(S.score);
  const total = B.stars.reduce((a, b) => a + b, 0), score = B.scores.reduce((a, b) => a + b, 0);
  UI.show('hud', false); input.showTouch(false);
  G.mode = 'end';
  if (lost) {
    G.endKind = 'defeat'; G.sfx('lose'); SDK.ended({ score });
    endScreen.show(`<span class="k3-kicker">GRAN BANQUETE · ${ph.kicker}</span><h1>¡Banquete arruinado!</h1>
      <p>Demasiados pedidos fallidos en «${ph.name}». El Rey Glotón se fue a comer a otro reino.</p>
      <p class="cc-score">Puntaje: <b>${score}</b></p>
      <div class="k3-btnrow"><button class="k3-b" data-banquet>↻ Reintentar el banquete</button><button class="k3-b alt" data-menu>Menú</button></div>`);
    G.banquet = null; return;
  }
  if (B.phase < BANQUET.length - 1) {
    G.endKind = 'phase';
    const nx = BANQUET[B.phase + 1];
    G.sfx('star');
    endScreen.show(`<span class="k3-kicker">${ph.kicker} SUPERADA · ${ph.name.toUpperCase()}</span>${starsHTML(S.stars)}
      <p class="cc-score">Puntaje de la fase: <b>${S.score}</b> · Estrellas totales: <b>${total}</b>/${D.banquetStars} necesarias</p>
      <h1 style="font-size:clamp(26px,6vw,40px)">${nx.kicker}: ${nx.name}</h1>
      <p>🔁 <b>Cambio de reglas:</b> ${UI.esc(nx.rule)}</p>
      <p class="cc-small">El banquete se muda a la ${KITCHENS[nx.kitchen].name}.</p>
      <div class="k3-btnrow"><button class="k3-b" data-phase>▶ ¡Vamos!</button><button class="k3-b alt" data-menu>Abandonar</button></div>`);
    return;
  }
  // final
  const won = total >= D.banquetStars;
  const b = SV.best.banquete; b.score = Math.max(b.score, score); b.stars = Math.max(b.stars, total);
  SDK.ended({ score });
  if (won) {
    const first = !SV.banquetWon;
    SV.banquetWon = true; SV.goldHat = true; flush();
    chef.hatMesh.geometry = chefHatGeo(true);
    MM.emit('banquete'); MM.runEnd({ won: true });
    G.endKind = 'victory'; G.sfx('fanfare'); setTimeout(() => G.sfx('star'), 500);
    endScreen.show(`<span class="k3-kicker">¡VICTORIA!</span><h1>Gran Banquete superado</h1>${starsHTML(total, 9)}
      <p>El Rey Glotón se desabrochó el cinturón y te nombró <b>Chef Real del Caos</b>.</p>
      <p class="cc-score">Puntaje total: <b>${score}</b> · Estrellas: ${total}/9</p>
      <p class="cc-unlock">🏆 Recompensa${first ? '' : ' (ya la tenías)'}: <b>Gorro dorado</b> para tu chef</p>
      <div class="k3-btnrow"><button class="k3-b" data-banquet>↻ Jugar otra vez</button><button class="k3-b alt" data-menu>Menú</button></div>
      <div class="cc-credit">CREADO POR <img class="ml-ava" src="matelabs/mascota-128.webp" alt="">MATELABS</div>`);
  } else {
    flush();
    G.endKind = 'defeat'; G.sfx('lose');
    endScreen.show(`<span class="k3-kicker">GRAN BANQUETE</span><h1>Faltaron estrellas</h1>${starsHTML(total, 9)}
      <p>Conseguiste ${total} de las ${D.banquetStars} estrellas que exigía el Rey. ¡Casi!</p>
      <p class="cc-score">Puntaje total: <b>${score}</b></p>
      <div class="k3-btnrow"><button class="k3-b" data-banquet>↻ Reintentar el banquete</button><button class="k3-b alt" data-menu>Menú</button></div>`);
  }
  G.banquet = null;
}
endScreen.on('[data-next]', () => {
  const b = /** @type {HTMLElement|null} */ (endScreen.el.querySelector('[data-next]')); const nx = b && b.dataset.next;
  endScreen.hide();
  if (nx === 'banquete') startBanquet(); else if (nx) { startShift(nx); SDK.started(); }
});
endScreen.on('[data-retry]', () => { endScreen.hide(); startShift(G.kitchenId); SDK.started(); });
endScreen.on('[data-phase]', () => { endScreen.hide(); G.banquet.phase++; startShift(BANQUET[G.banquet.phase].kitchen, BANQUET[G.banquet.phase]); SDK.started(); });
endScreen.on('[data-banquet]', () => { endScreen.hide(); if (!MM.state().running) MM.runStart(), syncMissions(); startBanquet(); SDK.started(); });
endScreen.on('[data-menu]', () => { endScreen.hide(); toMenu(); });

/* ======================= menú ======================= */
const menu = screen('', { accent: ACCENT, id: 'ccMenu' });
function cardHTML(id, i) {
  const k = KITCHENS[id], open = SV.unlocked > i, b = SV.best[id];
  return `<button type="button" class="cc-k ${open ? '' : 'locked'} ${G.selKitchen === id ? 'sel' : ''}" data-k="${id}" ${open ? '' : 'aria-disabled="true"'}>
    <span class="cc-ki">${open ? k.icon : '🔒'}</span><span class="cc-kt"><b>${k.name}</b><small>${open ? `${'★'.repeat(b.stars)}${'☆'.repeat(3 - b.stars)} · récord ${b.score}` : `Conseguí ★ en ${KITCHENS[KITCHEN_ORDER[i - 1]].short}`}</small></span></button>`;
}
function menuHTML() {
  const bq = SV.unlocked >= 4, bb = SV.best.banquete;
  return `<span class="k3-kicker">MATELABS PRESENTA</span><h1>Cocina<br>del Caos</h1>
    <p>Picá, horneá, emplatá y serví pedidos contra reloj mientras todo se prende fuego. Tres cocinas, un ayudante a tus órdenes y el Gran Banquete del Rey.</p>
    <div class="cc-kgrid">${KITCHEN_ORDER.map(cardHTML).join('')}
      <button type="button" class="cc-k royal ${bq ? '' : 'locked'} ${G.selKitchen === 'banquete' ? 'sel' : ''}" data-k="banquete" ${bq ? '' : 'aria-disabled="true"'}><span class="cc-ki">${bq ? '👑' : '🔒'}</span><span class="cc-kt"><b>Gran Banquete</b><small>${bq ? (SV.banquetWon ? `🏆 superado · ${bb.stars}/9 ★` : 'Evento final en 3 fases') : 'Conseguí ★ en las 3 cocinas'}</small></span></button>
    </div>
    <div class="k3-btnrow"><button class="k3-b" data-play>▶ Jugar · ${G.selKitchen === 'banquete' ? 'Gran Banquete' : KITCHENS[G.selKitchen].short}</button></div>
    <div id="ccDiff"></div><div id="ccDiffInfo" class="cc-small"></div>
    <div class="k3-btnrow"><button class="k3-b alt sm" data-help>❓ Cómo jugar</button><button class="k3-b alt sm" data-keys>⌨ Controles</button><button class="k3-b alt sm" data-mis>🎯 Misiones</button></div>
    <div class="cc-credit">CREADO POR <img class="ml-ava" src="matelabs/mascota-128.webp" alt="">MATELABS</div>`;
}
function diffInfo() { const d = G.D; return `Tiempo de pedidos ×${d.orderTime} · Pedidos cada ×${d.spawn} · Fallidos permitidos ${d.maxFails} · Caos cada ×${d.chaos} · Margen antes de quemar ×${d.burn} · Roedores ×${d.rats} · Banquete: ${d.banquetStars}★`; }
function defaultSel() { if (SV.unlocked >= 4 && !SV.banquetWon) return 'banquete'; return KITCHEN_ORDER[Math.min(2, SV.unlocked - 1)]; }
function showMenu() {
  G.mode = 'menu'; G.sim = null; G.banquet = null;
  if (!G.selKitchen) G.selKitchen = defaultSel();
  menu.show(menuHTML());
  MM.difficultyPicker($('ccDiff'), { title: 'DIFICULTAD', onChange: d => { G.diffKey = d; G.D = CF.DIFFICULTY[d]; $('ccDiffInfo').textContent = diffInfo(); } });
  $('ccDiffInfo').textContent = diffInfo();
  UI.show('hud', false); UI.show('coach', false); UI.show('cut', false); input.showTouch(false);
  showKitchen(G.selKitchen === 'banquete' ? 'taberna' : G.selKitchen);
  Object.assign(G.player, { x: G.K.spawn.x, z: G.K.spawn.z, hold: null }); helper.reset(G.K.helperSpawn.x, G.K.helperSpawn.z);
  G.menuSim = createSim(G.K, { D: G.D, banquet: null, hooks: { ...hooks(), sfx() {}, event() {}, emit() {}, toast() {}, orderIn() {}, orderOut() {}, telegraph() {}, end() {} }, rand: rng(3) });
  G.menuSim.S.frozen = true;
}
menu.el.addEventListener('click', e => {
  const k = /** @type {HTMLElement} */ (e.target).closest('[data-k]');
  if (k && !k.classList.contains('locked')) { G.selKitchen = /** @type {HTMLElement} */ (k).dataset.k; G.sfx('ui'); showMenu(); const b = /** @type {HTMLElement|null} */ (menu.el.querySelector(`[data-k="${G.selKitchen}"]`)); b && b.focus({ preventScroll: true }); }
  else if (k) { G.sfx('nope'); toast('🔒 ' + /** @type {HTMLElement} */ (k).querySelector('small').textContent); }
});
menu.on('[data-play]', () => play());
menu.on('[data-help]', () => UI.openPanel(`<div class="cc-ph"><h2 id="ccPT">❓ Cómo jugar</h2><button class="cc-x" data-close aria-label="Cerrar">✕</button></div><ul class="cc-list">${HELP.map(h => `<li>${UI.esc(h)}</li>`).join('')}</ul>${recipeTable()}`, () => {}));
menu.on('[data-keys]', () => openControls());
menu.on('[data-mis]', () => openMissions());
addEventListener('keydown', e => {
  if (G.mode === 'menu' && menu.visible && !UI.panelOpen() && e.code === 'Enter') { const a = document.activeElement; if (a && a.closest && a.closest('[data-k],.mlm-diff,[data-help],[data-keys],[data-mis]')) return; e.preventDefault(); play(); }
});
function recipeTable() {
  return `<h3 class="cc-h3">Recetas</h3><div class="cc-rec">${Object.entries(RECIPES).map(([id, r]) => `<div><span>${r.icon}</span><b>${UI.esc(r.name)}</b><small>${r.parts.map(p => { const [i, s] = p.split(':'); return ING[i].icon + (CF.STATE_BADGE[s] || ''); }).join(' + ')} · ${r.steps} pasos</small></div>`).join('')}</div>`;
}
function play() {
  menu.hide();
  G.diffKey = MM.difficulty(CF.GAME_ID); G.D = CF.DIFFICULTY[G.diffKey];
  if (MM.state().running) MM.runEnd({ won: false });
  MM.runStart(); syncMissions();
  SDK.started();
  if (G.selKitchen === 'banquete' && SV.unlocked >= 4) startBanquet();
  else startShift(G.selKitchen === 'banquete' ? 'taberna' : G.selKitchen);
}
function toMenu() {
  UI.closePanel(); endScreen.hide(); G.cut = null;
  if (G.sim && !G.sim.S.over) SDK.ended({ score: G.sim.S.score });
  if (MM.state().running) MM.runEnd({ won: false });
  G.selKitchen = '';
  showMenu();
}
function restartShift() {
  if (G.mode === 'menu' || G.mode === 'loading') return;
  UI.closePanel(); endScreen.hide();
  if (MM.state().running) MM.runEnd({ won: false });
  MM.runStart(); syncMissions(); SDK.started();
  if (G.banquet || G.mode === 'cutscene') { startBanquet(); return; }
  startShift(G.kitchenId);
  toast('↻ Turno reiniciado');
}

/* ======================= misiones ======================= */
MM.setup({ gameId: CF.GAME_ID, hud: 'none', primaryPerRun: 3, secondaryPerRun: 3, missions: [
  { id: 'ordenes8', kind: 'primary', title: 'Atender 8 órdenes', desc: 'Entregá 8 pedidos correctos (suma entre turnos)', event: 'served', target: 8 },
  { id: 'cocina2', kind: 'primary', title: 'Desbloquear la segunda cocina', desc: 'Conseguí al menos ★ en la Taberna del Reino', event: 'unlock2', target: 1 },
  { id: 'banquete', kind: 'primary', title: 'Superar el Gran Banquete', desc: 'Juntá las estrellas que pide el Rey en las 3 fases', event: 'banquete', target: 1 },
  { id: 'perfectos', title: 'Completar 3 pedidos perfectos', desc: 'Entregá con más de la mitad del tiempo restante', event: 'perfect', target: 3 },
  { id: 'sinquemar', title: 'No quemar ninguna receta', desc: 'Terminá un turno sin quemar nada', event: 'noburn', target: 1, failOn: 'burn' },
  { id: 'limpia', title: 'Mantener la cocina limpia', desc: 'Terminá un turno sin derrames viejos ni pilas de platos sucios', event: 'clean', target: 1, failOn: 'dirty' },
  { id: 'sinerror', title: 'Entregar 5 platos sin error', desc: '5 entregas correctas seguidas', event: 'streak', target: 5, mode: 'max' },
  { id: 'bombero', title: 'Apagar 3 incendios', desc: 'Con el extintor o a mano', event: 'fire_out', target: 3 },
  { id: 'roedores', title: 'Espantar 5 roedores', desc: 'Tocalos o pasales por encima', event: 'rat_shoo', target: 5 },
] });
/** Lleva el progreso de campaña (guardado del juego) a la partida actual de MLMissions sin repetir logros. */
function syncMissions() {
  const st = MM.state(), done = (st.achievements && st.achievements.done) || {};
  const prog = { ordenes8: Math.min(8, SV.served), cocina2: SV.unlocked >= 2 ? 1 : 0, banquete: SV.banquetWon ? 1 : 0 };
  const EV = { ordenes8: 'served', cocina2: 'unlock2', banquete: 'banquete' };
  for (const m of st.current) { const v = prog[m.id] || 0; if (v > 0 && !done[m.id]) MM.emit(EV[m.id], v); }
}
function openMissions() {
  const st = MM.state(), done = (st.achievements && st.achievements.done) || {};
  const all = ['ordenes8', 'cocina2', 'banquete', 'perfectos', 'sinquemar', 'limpia', 'sinerror', 'bombero', 'roedores'];
  const T = { ordenes8: ['★', 'Atender 8 órdenes', `${Math.min(8, SV.served)}/8`], cocina2: ['★', 'Desbloquear la segunda cocina', SV.unlocked >= 2 ? '✔' : ''], banquete: ['★', 'Superar el Gran Banquete', SV.banquetWon ? '✔' : ''],
    perfectos: ['◆', 'Completar 3 pedidos perfectos', ''], sinquemar: ['◆', 'No quemar ninguna receta (un turno)', ''], limpia: ['◆', 'Mantener la cocina limpia (un turno)', ''], sinerror: ['◆', 'Entregar 5 platos sin error', ''], bombero: ['◆', 'Apagar 3 incendios', ''], roedores: ['◆', 'Espantar 5 roedores', ''] };
  UI.openPanel(`<div class="cc-ph"><h2 id="ccPT">🎯 Misiones</h2><button class="cc-x" data-close aria-label="Cerrar">✕</button></div>
    <ul class="cc-mis">${all.map(id => `<li class="${done[id] ? 'done' : ''}" data-mid="${id}"><span>${done[id] ? '✅' : T[id][0]}</span><b>${T[id][1]}</b><small>${done[id] ? 'cumplida' : T[id][2]}</small></li>`).join('')}</ul>
    <p class="cc-small">★ principales (campaña) · ◆ secundarias: cada partida trae 3 para cumplir.</p>`, () => {});
}

/* ======================= controles (remapeo + sensibilidad) ======================= */
const KEYLBL = { act: 'Acción', helper: 'Encargo del ayudante', dash: 'Impulso' };
const keyName = c => c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : ({ Space: 'Espacio', ShiftLeft: 'Shift', ShiftRight: 'Shift der.', Enter: 'Enter', ControlLeft: 'Ctrl', Tab: 'Tab' })[c] || c;
let rebinding = '';
function openControls() {
  const prevMode = G.mode;
  if (G.mode === 'play') G.mode = 'dialog';
  const render = () => UI.openPanel(`<div class="cc-ph"><h2 id="ccPT">⌨ Controles</h2><button class="cc-x" data-close aria-label="Cerrar">✕</button></div>
    <p class="cc-small">Tocá una acción y apretá la tecla nueva. Espacio y Enter siempre funcionan como Acción. Gamepad: stick mover · A acción · X ayudante · B impulso · LB/RB encargo directo · Start pausa.</p>
    <div class="cc-keys">${Object.keys(KEYLBL).map(k => `<button type="button" data-rebind="${k}" class="${rebinding === k ? 'wait' : ''}"><span>${KEYLBL[k]}</span><kbd>${rebinding === k ? '…' : keyName(SV.keys[k])}</kbd></button>`).join('')}</div>
    <p class="cc-small">Sensibilidad del stick táctil / gamepad:</p>
    <div class="cc-keys row">${[[0.7, 'Suave'], [1, 'Normal'], [1.3, 'Rápida']].map(([v, l]) => `<button type="button" data-stick="${v}" aria-pressed="${SV.stick === v}">${l}</button>`).join('')}</div>
    <button type="button" class="cc-reset" data-keyreset>Restaurar teclas</button>`, () => { rebinding = ''; if (G.mode === 'dialog') G.mode = prevMode === 'dialog' ? 'play' : prevMode; });
  render();
  const panel = $('panel');
  panel.onclick = e => {
    const t = /** @type {HTMLElement} */ (e.target);
    const rb = t.closest('[data-rebind]'), sk = t.closest('[data-stick]');
    if (rb) { rebinding = /** @type {HTMLElement} */ (rb).dataset.rebind || ''; render(); }
    else if (sk) { SV.stick = Number(/** @type {HTMLElement} */ (sk).dataset.stick); flush(); render(); }
    else if (t.closest('[data-keyreset]')) { SV.keys = { ...CF.DEFAULT_KEYS }; flush(); render(); }
  };
  panel.onkeydown = e => {
    if (!rebinding || e.code === 'Escape' || e.code === 'Tab') return;
    e.preventDefault(); e.stopPropagation();
    const other = Object.keys(SV.keys).find(k => k !== rebinding && SV.keys[k] === e.code);
    if (other) SV.keys[other] = SV.keys[rebinding];
    SV.keys[rebinding] = e.code; rebinding = ''; flush(); render(); updateHelperUI();
  };
}

/* ======================= tutorial contextual ======================= */
const TUT = [
  { ev: 'move', txt: () => `${input.isTouch ? 'Mové el joystick' : 'Movete con WASD o las flechas'} para caminar por la cocina.` },
  { ev: 'take:lechuga', target: () => G.K.stations.find(s => s.id === 'nevera_lechuga'), txt: () => `Andá a la nevera de <b>lechuga</b> 🥬 (flecha amarilla). Cuando la mirás se marca: ${act()} para sacar una.` },
  { ev: 'chopped:lechuga', target: () => G.K.stations.find(s => s.type === 'board' && (!s.item || (s.item.ing === 'lechuga'))), txt: () => `Dejala en una <b>tabla de picar</b> y <b>mantené</b> ${act()} para picarla.` },
  { ev: 'takePlate', target: () => G.K.stations.find(s => s.type === 'rack'), txt: () => `Agarrá un <b>plato limpio</b> del escurridor 🍽.` },
  { ev: 'plate', target: () => G.K.stations.find(s => s.item && s.item.t === 'ing' && s.item.ing === 'lechuga'), txt: () => `Con el plato en la mano, mirá la lechuga picada y ${act()} para <b>emplatar</b>.` },
  { ev: 'served:ensalada_verde', target: () => G.K.conv[0], txt: () => `Poné el plato en la <b>cinta</b> 🛎: lo lleva a la ventanilla y se sirve solo.` },
  { ev: 'end', txt: () => `¡Primera ensalada servida! Mirá los <b>pedidos</b> arriba y su tiempo. Pipo 🧑‍🍳 te ayuda: ${input.isTouch ? 'botón 🧑‍🍳' : `<b>${keyName(SV.keys.helper)}</b>`} cambia su encargo. Cuidado con fuego, derrames y roedores. ¡Arranca el turno!` },
];
function act() { return input.isTouch ? '<b>ACCIÓN</b>' : `<b>${keyName(SV.keys.act)}</b>`; }
function startTutorial() {
  G.tut = { step: 0, t: 0 }; G.sim.S.frozen = true; G.sim.S.nextOrder = 999;
  G.sim.addOrder('ensalada_verde');
  coach();
}
function replayTutorial() { if (!G.sim) return; startShift('taberna'); SV.tutorialDone = false; startTutorial(); }
function coach() {
  if (!G.tut) { UI.show('coach', false); return; }
  const s = TUT[G.tut.step]; if (!s) { endTutorial(); return; }
  UI.setHTML('coachTx', s.txt()); UI.setText('coachStep', `TUTORIAL ${Math.min(G.tut.step + 1, 6)}/6`); UI.show('coach', true); G.tut.t = 0;
}
function tutEvent(ev) {
  if (!G.tut) return;
  const k = TUT.findIndex((t, i) => i >= G.tut.step && (t.ev === ev || (t.ev.startsWith('served') && ev.startsWith('served'))));
  if (k >= 0) { G.tut.step = k + 1; G.sfx('ui'); coach(); }
}
function endTutorial() {
  G.tut = null; SV.tutorialDone = true; flush(); UI.show('coach', false);
  if (G.sim) { G.sim.S.frozen = false; if (G.sim.S.nextOrder > 50) G.sim.S.nextOrder = 2; }
}
$('coachSkip').addEventListener('click', e => { e.stopPropagation(); endTutorial(); });
for (const t of ['pointerdown', 'mousedown', 'touchstart']) { $('coach').addEventListener(t, e => e.stopPropagation()); $('helperBar').addEventListener(t, e => e.stopPropagation()); }

/* ======================= ayudante: UI ======================= */
function updateHelperUI() {
  const t = TASKS.find(x => x.id === helper.task);
  UI.setHTML('helperBar', `<span class="hb-k">PIPO</span>${TASKS.map((x, i) => `<button type="button" data-task="${x.id}" class="${x.id === helper.task ? 'on' : ''}" title="${x.name} (${i + 1})" aria-label="Encargo: ${x.name}" aria-pressed="${x.id === helper.task}"><span>${x.icon}</span><kbd>${i + 1}</kbd></button>`).join('')}`);
  if (helpBtn) helpBtn.textContent = t ? t.icon : '🧑‍🍳';
}
$('helperBar').addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-task]'); if (b && G.mode === 'play') setTask(/** @type {HTMLElement} */ (b).dataset.task); });
function setTask(id) { if (helper.setTask(id)) { const t = TASKS.find(x => x.id === id); UI.pop(`${t.icon} ${t.name}`, helper.A.x, 2.2, helper.A.z, '#ffe066'); G.sfx('ui'); updateHelperUI(); } }
function cycleTask() { const i = TASKS.findIndex(x => x.id === helper.task); setTask(TASKS[(i + 1) % TASKS.length].id); }

/* ======================= cámara ======================= */
const _v = new THREE.Vector3(), _corner = new THREE.Vector3();
function fitCamera(snap) {
  const K = G.K; if (!K) return;
  const portrait = innerWidth < innerHeight;
  const pitch = portrait ? 1.22 : 0.98; G.cam.pitch = pitch;
  const minX = -K.halfW - 0.4, maxX = K.halfW + 3.6, minZ = -K.halfH - 0.4, maxZ = K.halfH + 0.4;
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2 + (portrait ? 0.4 : 0.6);
  const top = 0.66, bot = -0.82;
  let lo = 6, hi = 60;
  for (let it = 0; it < 18; it++) {
    const d = (lo + hi) / 2;
    camera.position.set(cx, Math.sin(pitch) * d, cz + Math.cos(pitch) * d); camera.lookAt(cx, 0, cz); camera.updateMatrixWorld();
    let ok = true;
    for (const x of [minX, maxX]) for (const z of [minZ, maxZ]) for (const y of [0, 1.6]) {
      _corner.set(x, y, z).project(camera);
      if (_corner.x < -0.97 || _corner.x > 0.97 || _corner.y > top || _corner.y < bot) ok = false;
    }
    if (ok) hi = d; else lo = d;
  }
  // en vertical el plano completo queda chico: se acerca y sigue al chef
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const maxD = (portrait ? 13 : 99) / 2 / Math.tan(hfov / 2) + 2;
  G.cam.follow = hi > maxD; G.cam.dist = Math.min(hi, maxD); G.cam.cx = cx; G.cam.cz = cz;
  if (snap) { G.cam.tx = G.cam.follow ? G.player.x : cx; G.cam.tz = G.cam.follow ? G.player.z : cz; }
  applyCam();
}
function applyCam() {
  const c = G.cam, d = c.dist;
  let sx = 0, sy = 0;
  if (c.shake > 0 && !REDUCED) { sx = (Math.random() - 0.5) * c.shake; sy = (Math.random() - 0.5) * c.shake; }
  camera.position.set(c.tx + sx, Math.sin(c.pitch) * d + sy, c.tz + Math.cos(c.pitch) * d);
  camera.lookAt(c.tx + sx * 0.5, 0, c.tz);
}
function updateCam(dt) {
  const c = G.cam;
  if (G.cut) {
    const k = G.cut.t / G.cut.dur, K = G.K, a = k * Math.PI * 0.7 - 0.6;
    camera.position.set(Math.sin(a) * 9 + 2, 4 + 5 * k, Math.cos(a) * 9 + 1); camera.lookAt(K.halfW + 1.5, 1, 0);
    return;
  }
  if (c.follow) {
    const K = G.K, mx = Math.max(0, K.halfW - 3.6), mz = Math.max(0, K.halfH - 2.4);
    c.tx = lerp(c.tx, clamp(G.player.x + 0.6, -mx, mx + 2), Math.min(1, dt * 4));
    c.tz = c.cz + 1.1; void mz;
  } else { c.tx = c.cx; c.tz = c.cz; }
  c.shake = Math.max(0, c.shake - dt * 1.6);
  applyCam();
}
addEventListener('resize', () => fitCamera(false));

/* ======================= control del chef ======================= */
const R = 0.33;
function collide(o) {
  const K = G.K;
  const cc = K.cellOf(o.x, o.z);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const c = cc.c + dc, rw = cc.rw + dr;
    if (!K.solid(c, rw)) continue;
    const x0 = K.X(c) - TS / 2, x1 = K.X(c) + TS / 2, z0 = K.Z(rw) - TS / 2, z1 = K.Z(rw) + TS / 2;
    const px = clamp(o.x, x0, x1), pz = clamp(o.z, z0, z1);
    const dx = o.x - px, dz = o.z - pz, d = Math.hypot(dx, dz);
    if (d < R) {
      if (d > 1e-5) { o.x = px + dx / d * R; o.z = pz + dz / d * R; if (o.vx !== undefined) { const nx = dx / d, nz = dz / d, vn = o.vx * nx + o.vz * nz; if (vn < 0) { o.vx -= vn * nx; o.vz -= vn * nz; } } }
      else { o.z = z1 + R; }
    }
  }
  o.x = clamp(o.x, -K.halfW + R, K.halfW - R); o.z = clamp(o.z, -K.halfH + R, K.halfH - R);
}
function pickFocus() {
  const P = G.player, K = G.K, sim = G.sim;
  const dx = Math.sin(P.yaw), dz = Math.cos(P.yaw);
  const px = P.x + dx * 0.85, pz = P.z + dz * 0.85;
  let best = null, bs = 0.95;
  for (const r of sim.S.rats) {
    const d = Math.hypot(r.x - P.x, r.z - P.z); if (d > 1.6) continue;
    const s = Math.hypot(r.x - px, r.z - pz) - 0.35; if (s < bs) { bs = s; best = { kind: 'rat', ref: r, x: r.x, z: r.z }; }
  }
  for (const st of K.stations) {
    if (Math.abs(st.x - P.x) > 1.9 || Math.abs(st.z - P.z) > 1.9) continue;
    const s = Math.hypot(st.x - px, st.z - pz); if (s < bs) { bs = s; best = { kind: 'station', ref: st, x: st.x, z: st.z }; }
  }
  for (const sp of sim.S.spills) {
    const s = Math.min(Math.hypot(sp.x - px, sp.z - pz), Math.hypot(sp.x - P.x, sp.z - P.z) + 0.1) + 0.12;
    if (s < bs) { bs = s; best = { kind: 'spill', ref: sp, x: sp.x, z: sp.z }; }
  }
  if (best && G.focus && best.ref === G.focus.ref) best = G.focus;
  G.focus = best;
  G.focusDesc = best ? sim.describe(P, best) : null;
}
const SHORT = [[/Picar/, 'PICAR'], [/Lavar/, 'LAVAR'], [/Limpiar/, 'LIMPIAR'], [/Apagar/, 'APAGAR'], [/Espantar/, '¡FUERA!'], [/Servir/, 'SERVIR'], [/Emplatar/, 'EMPLATAR'], [/Agarrar|Sacar/, 'AGARRAR'], [/Tirar|Vaciar/, 'TIRAR'], [/Echar|Hornear|Meter|Poner|Dejar|Devolver/, 'DEJAR']];
function playerControl(dt) {
  const P = G.player, sim = G.sim, K = G.K;
  const keys = SV.keys;
  P.stun = Math.max(0, P.stun - dt); P.dashCd = Math.max(0, P.dashCd - dt); P.dash = Math.max(0, P.dash - dt); P.act = Math.max(0, P.act - dt);
  // movimiento
  let ax = 0, az = 0;
  if (G.mode === 'play' && P.stun <= 0) {
    const a = input.axis(); let m = Math.hypot(a.x, a.y);
    if (m > 0.12) { const k = Math.min(1, m * (input.isTouch ? SV.stick : 1)) / m; ax = a.x * k; az = a.y * k; }
  }
  const zeroG = sim.zeroG;
  const cell = K.cellOf(P.x, P.z), tile = K.ch(cell.c, cell.rw);
  const onSpill = sim.S.spills.some(s => Math.hypot(s.x - P.x, s.z - P.z) < 0.55);
  const spd = CF.T.speed * (P.hold ? 0.94 : 1);
  const accel = zeroG ? 3.2 : onSpill ? 4 : 28;
  const tvx = ax * spd, tvz = az * spd;
  P.vx += (tvx - P.vx) * Math.min(1, accel * dt);
  P.vz += (tvz - P.vz) * Math.min(1, accel * dt);
  if (zeroG && !ax && !az) { P.vx *= 1 - 0.25 * dt; P.vz *= 1 - 0.25 * dt; }
  if (G.mode === 'play' && (input.hit(keys.dash, 'btn:dash') || input.button('dash') && P.dashCd <= 0) && P.dashCd <= 0 && P.stun <= 0) {
    P.dash = CF.T.dash; P.dashCd = CF.T.dashCd;
    const dx = Math.sin(P.yaw), dz = Math.cos(P.yaw); P.vx = dx * spd * 2.6; P.vz = dz * spd * 2.6; G.sfx('dash'); fx.burst(P.x, 0.2, P.z, 0xffffff, 5, 1);
  }
  let ex = 0, ez = 0;
  if (tile === '>' || tile === '<') ex += (tile === '>' ? 1 : -1) * 2.2;
  if (sim.suction) { ex -= 3.6; ez += (K.airlocks.length ? (K.airlocks.reduce((a, s) => a + s.z, 0) / K.airlocks.length - P.z) : 0) * 0.6; }
  P.x += (P.vx + ex) * dt; P.z += (P.vz + ez) * dt;
  collide(P);
  const moved = Math.hypot(P.vx, P.vz);
  P.walk = moved; P.moved += moved * dt;
  if (moved > 0.4 && P.stun <= 0) { const ty = Math.atan2(P.vx, P.vz); let dy = ty - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy * Math.min(1, dt * (zeroG ? 5 : 16)); }
  // grietas que escupen vapor
  if (sim.flareOn() && P.stun <= 0) for (const cr of K.cracks) if (Math.hypot(cr.x - P.x, cr.z - P.z) < 0.85) { P.stun = 1.1; P.vx = (P.x - cr.x) * 6; P.vz = (P.z - cr.z) * 6; G.sfx('stun'); fx.burst(P.x, 0.6, P.z, 0xffffff, 12); UI.pop('♨ ¡Quema!', P.x, 2.2, P.z, '#ffb4a8'); }
  // foco y acción
  pickFocus();
  if (G.mode !== 'play' || P.stun > 0) { P.working = 0; return; }
  const tapped = input.hit(keys.act, 'Space', 'Enter', 'btn:act') || G.virt.tap;
  const held = input.down(keys.act) || input.down('Space') || input.button('act') || G.virt.hold;
  G.virt.tap = false;
  const f = G.focus, d = G.focusDesc;
  P.working = 0;
  if (f && d) {
    if (tapped && d.mode === 'tap') { if (sim.tap(P, f)) P.act = 0.25; }
    else if (d.mode === 'work' && (held || tapped)) {
      const p = sim.work(P, f, tapped && !held ? 0.28 : dt);
      if (p >= 0) P.working = p < 1 ? 1 : 0;
      if (f.kind === 'rat' && tapped) sim.tap(P, f);
    }
    else if (tapped && f.kind === 'rat') sim.tap(P, f);
  } else if (tapped) G.sfx('nope');
  if (input.hit(keys.helper, 'btn:help')) cycleTask();
  for (let i = 0; i < 4; i++) if (input.hit('Digit' + (i + 1))) setTask(TASKS[i].id);
}

/* ======================= bucle ======================= */
function update(dt) {
  G.t += dt;
  if (G.mode === 'cutscene' && G.cut) {
    G.cut.t += dt;
    if (G.cut.t > 0.6 && input.hit(SV.keys.act, 'Space', 'Enter', 'btn:act')) G.cut.t = G.cut.dur;
    if (G.cut.t >= G.cut.dur) endCutscene();
    input.endStep(); return;
  }
  if (G.mode === 'play' && G.sim) {
    playerControl(dt);
    helper.update(dt);
    G.sim.step(dt);
    if (G.tut) { if (G.tut.step === 0 && G.player.moved > 1.6) tutEvent('move'); if (G.tut && G.tut.step >= TUT.length - 1) { G.tut.t += dt; if (G.tut.t > 7) endTutorial(); } }
    music(dt);
    if (G.chaosWarn) { G.chaosWarn.t -= dt; if (G.chaosWarn.t <= 0) G.chaosWarn = null; }
  } else if (G.mode === 'menu' && G.menuSim) {
    // la cocina de fondo del menú: Pipo pasea
    G.player.yaw += dt * 0.3;
  }
  input.endStep();
}

/* ======================= render ======================= */
const _p = new THREE.Vector3();
const project = (x, y, z) => { _p.set(x, y, z).project(camera); return { sx: (_p.x + 1) / 2 * innerWidth, sy: (1 - _p.y) / 2 * innerHeight, vis: _p.z < 1 }; };
let lastR = performance.now(), hudT = 0;
function animPerson(p, o, walk, t, carrying, working) {
  const sw = walk > 0.3 ? Math.sin(t * 13) * Math.min(1, walk / 3) * 0.7 : 0;
  p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw;
  if (working) { p.arms[0].rotation.x = -1.1 + Math.sin(t * 22) * 0.35; p.arms[1].rotation.x = -1.4 + Math.sin(t * 22 + 1.4) * 0.6; }
  else if (carrying) { p.arms[0].rotation.x = -1.25; p.arms[1].rotation.x = -1.25; }
  else { p.arms[0].rotation.x = -sw * 0.8; p.arms[1].rotation.x = sw * 0.8; }
  p.body.position.y = walk > 0.3 ? Math.abs(Math.sin(t * 13)) * 0.05 : Math.sin(t * 2) * 0.01;
  p.group.position.set(o.x, 0, o.z); p.group.rotation.y = o.yaw;
}
function render() {
  const now = performance.now(), rdt = Math.min(0.1, (now - lastR) / 1000); lastR = now;
  const K = G.K; if (!K) return;
  const sim = G.mode === 'menu' ? G.menuSim : G.sim;
  updateCam(rdt);
  K.update(G.t, rdt, 1);
  fx.updateParticles(rdt);
  fx.beginFrame();
  const P = G.player, t = G.t;
  // chef y ayudante
  chef.group.visible = G.mode !== 'menu'; chefSh.visible = chef.group.visible;
  animPerson(chef, P, P.walk, t, !!P.hold, P.working > 0);
  if (P.stun > 0) chef.group.rotation.y += Math.sin(t * 30) * 0.3;
  chefSh.position.set(P.x, 0.02, P.z);
  const A = helper.A;
  animPerson(pipo, A, A.walk, t + 1, !!A.hold, A.working > 0);
  pipoSh.position.set(A.x, 0.02, A.z);
  if (P.hold) fx.drawItem(P.hold, P.x + Math.sin(P.yaw) * 0.48, 0.98, P.z + Math.cos(P.yaw) * 0.48, P.yaw);
  if (A.hold) fx.drawItem(A.hold, A.x + Math.sin(A.yaw) * 0.38, 0.8, A.z + Math.cos(A.yaw) * 0.38, A.yaw, 0.85);
  if (sim) renderStations(sim, rdt, t);
  renderSeats(rdt, t);
  fx.endFrame();
  // foco
  const f = G.mode === 'play' ? G.focus : null, d = G.focusDesc;
  const hcol = d && d.ok ? 0xff5c7a : 0xffffff;
  MAT.hl.color.setHex(hcol); MAT.hlFill.color.setHex(hcol);
  if (f && f.kind === 'station') {
    const st = f.ref; fx.hl.visible = true; fx.hlRing.visible = false;
    fx.hl.position.set(st.x, st.type === 'pot' || st.type === 'oven' ? 0.95 : st.top + 0.01, st.z);
    const pul = 1 + Math.sin(t * 8) * 0.03; fx.frame.scale.set(pul, 1, pul);
    fx.chev.position.set(0, (st.type === 'pot' ? 1.2 : 0.95) + Math.sin(t * 5) * 0.08, 0); fx.chev.rotation.y = t * 2;
    MAT.hlFill.opacity = 0.18 + 0.12 * Math.sin(t * 8);
  } else if (f) {
    fx.hl.visible = false; fx.hlRing.visible = true; fx.hlRing.position.set(f.x, 0.03, f.z); fx.hlRing.scale.setScalar(1 + Math.sin(t * 8) * 0.08);
  } else { fx.hl.visible = false; fx.hlRing.visible = false; }
  // guía del tutorial
  const tg = G.tut && TUT[G.tut.step] && TUT[G.tut.step].target ? TUT[G.tut.step].target() : null;
  fx.guide.visible = !!tg && G.mode === 'play';
  if (tg) { fx.guide.position.set(tg.x, 2.1 + Math.sin(t * 4) * 0.2, tg.z); fx.guide.rotation.y = t * 2; }
  // roedores
  const rats = sim ? sim.S.rats : [], space = K.def.theme === 'espacial';
  const pool = space ? ratMeshes.b : ratMeshes.a, other = space ? ratMeshes.a : ratMeshes.b;
  other.forEach(m => { m.visible = false; });
  pool.forEach((m, i) => {
    const r = rats[i]; m.visible = !!r; if (!r) return;
    m.position.set(r.x, Math.abs(Math.sin(t * 18 + i)) * 0.05 + (r.hop > 0 ? Math.sin(r.hop * 8) * 0.25 : 0), r.z); m.rotation.y = r.yaw + (r.st === 'nibble' ? Math.sin(t * 25) * 0.25 : 0);
    if (r.carry) fx.drawItem(r.carry, r.x + Math.sin(r.yaw) * 0.25, 0.32, r.z + Math.cos(r.yaw) * 0.25, r.yaw, 0.7);
  });
  // efectos de caos sobre el piso
  if (sim) {
    sim.S.spills.forEach((s, i) => { const m = fx.puddles[i]; if (!m) return; m.visible = true; m.position.set(s.x, 0.012, s.z); m.scale.setScalar(Math.min(1, 0.4 + (1 - s.prog) * 0.6 + (s.age < 0.4 ? -0.4 + s.age : 0))); });
    for (let i = sim.S.spills.length; i < fx.puddles.length; i++) fx.puddles[i].visible = false;
    let mi = 0;
    const pend = sim.S.chaos.pending;
    if (pend) for (const tgt of pend.targets) { const m = fx.marks[mi++]; if (!m) break; m.visible = true; m.position.set(tgt.x, (tgt.top || 0) + 0.04, tgt.z); m.scale.setScalar(1.3 + Math.sin(t * 10) * 0.15); }
    if (sim.flareWarn() || sim.flareOn()) for (const cr of K.cracks) { const m = fx.marks[mi++]; if (!m) break; m.visible = true; m.position.set(cr.x, 0.04, cr.z); m.scale.setScalar(1.4); if (sim.flareOn() && Math.random() < 0.5) fx.puff(cr.x, 0.1, cr.z, 0xffffff, 2); }
    for (let i = mi; i < fx.marks.length; i++) fx.marks[i].visible = false;
    // esclusa
    for (const al of K.airlocks) { const open = sim.suction ? 1 : 0; al.parts.dA.position.z = lerp(al.parts.dA.position.z, al.parts.z0 - TS / 4 - open * 0.45, 0.15); al.parts.dB.position.z = lerp(al.parts.dB.position.z, al.parts.z0 + TS / 4 + open * 0.45, 0.15); al.parts.lamp.color.setHex(sim.suction || (G.chaosWarn && G.chaosWarn.type === 'esclusa') ? (Math.sin(t * 14) > 0 ? 0xff2020 : 0x551010) : 0x225522); if (sim.suction && Math.random() < 0.5) fx.puff(al.x + 0.4, 0.5 + Math.random(), al.z, 0xcfe8ff, 1); }
  }
  // HUD
  hudT -= rdt;
  if (hudT <= 0 && G.mode === 'play' && sim) { hudT = 0.1; updateHUD(sim); }
  UI.updatePops(project, rdt);
  // etiqueta del ayudante
  if (G.mode === 'play') {
    const s = project(A.x, 2.05, A.z), tsk = TASKS.find(x => x.id === A.task);
    $('pipoTag').style.transform = `translate(${s.sx.toFixed(0)}px,${s.sy.toFixed(0)}px) translate(-50%,-100%)`;
    UI.setText('pipoTag', `${tsk ? tsk.icon : ''} ${A.msg || ''}`);
  }
  UI.show('pipoTag', G.mode === 'play');
}
const _col = new THREE.Color();
function renderStations(sim, dt, t) {
  const K = G.K;
  let bi = 0, fi = 0;
  const bar = (x, y, z, p, col) => { const b = fx.bars[bi++]; if (!b) return; b.g.visible = true; b.g.position.set(x, y, z); b.g.quaternion.copy(camera.quaternion); b.fg.scale.x = Math.max(0.001, p); b.fg.position.x = -0.37 * (1 - p); b.fm.color.setHex(col); };
  for (const st of K.stations) {
    const P = st.parts;
    // ítem encima
    if (st.type !== 'conveyor' && st.type !== 'hatch' && st.item) fx.drawItem(st.item, st.x, st.top, st.z, 0, st.type === 'oven' ? 0.95 : 1);
    if (st.type === 'fridge' && P.lid) { P.lid.rotation.x = -Math.sin(Math.min(1, st.anim) * Math.PI) * 1.1; }
    if (st.type === 'trash' && P.lid) P.lid.rotation.x = -Math.sin(Math.min(1, st.anim) * Math.PI) * 1.4;
    if (st.type === 'board' && P.knife) { P.knife.position.y = P.knifeY + (st.anim > 0 ? Math.abs(Math.sin(t * 24)) * 0.18 : 0); if (st.prog > 0 && st.item) bar(st.x, st.top + 0.75, st.z, st.prog, 0x6be38a); }
    if (st.type === 'oven') {
      const it = st.item, on = it && it.t === 'ing';
      const heat = on ? (it.st === 'quemado' ? 0.3 : 1) : 0.15;
      P.mouth.color.setRGB(0.3 + heat * 0.7 + Math.sin(t * 9) * 0.05 * heat, 0.12 + heat * 0.33, 0.04);
      P.door.rotation.x = -Math.sin(Math.min(1, st.anim) * Math.PI) * 0.9;
      if (on && it.st === ING[it.ing].oven) bar(st.x, st.top + 0.75, st.z, st.prog, 0xffb02a);
      else if (on && it.st === 'asado' && st.burnT > 0) { const w = st.burnT / (CF.T.burn * G.D.burn); if (w > 0.35) bar(st.x, st.top + 0.75, st.z, w, Math.sin(t * 16) > 0 ? 0xff3b2f : 0xffe066); if (Math.random() < 0.08) fx.puff(st.x, st.top + 0.3, st.z, 0xdddddd, 1); }
      else if (on && it.st === 'quemado' && Math.random() < 0.4) fx.puff(st.x, st.top + 0.3, st.z, 0x222222, 1);
    }
    if (st.type === 'pot') {
      const p = st.pot, src = p.ing ? ING[p.ing] : null;
      P.flame.visible = p.state === 'cooking' || p.state === 'done' || p.state === 'burnt';
      P.soup.visible = p.n > 0;
      if (p.n > 0) {
        const need = src && src.pot ? src.pot.need : 3;
        P.soup.position.y = CF.COUNTER_H + 0.12 + 0.28 * (p.n / need);
        const col = p.state === 'burnt' ? 0x2a1a14 : p.ing === 'tomate' ? 0xd8402a : p.ing === 'hongo' ? 0x9a6a3a : 0xf4f1e6;
        P.soupMat.color.setHex(col);
      }
      const boil = p.state === 'cooking' || p.state === 'done';
      P.bub.count = boil ? 4 : 0;
      if (boil) { for (let i = 0; i < 4; i++) { const a = i * 1.7 + t * 0.5, ph = (t * 1.4 + i * 0.37) % 1; _m4.makeTranslation(st.x + Math.cos(a) * 0.15, P.soup.position.y + ph * 0.1, st.z + Math.sin(a) * 0.15); P.bub.setMatrixAt(i, _m4); } P.bub.instanceMatrix.needsUpdate = true; if (Math.random() < 0.15) fx.puff(st.x, st.top, st.z, 0xeeeeee, 1); }
      P.pot.rotation.z = p.state === 'done' ? Math.sin(t * 20) * 0.02 : 0;
      if (p.state === 'cooking') bar(st.x, st.top + 0.5, st.z, p.t / (CF.T.pot * G.D.cook), 0xffb02a);
      else if (p.state === 'done' && p.t > CF.T.burn * G.D.burn * 0.4) bar(st.x, st.top + 0.5, st.z, p.t / (CF.T.burn * G.D.burn * 1.2), Math.sin(t * 16) > 0 ? 0xff3b2f : 0xffe066);
      else if (p.state === 'filling') bar(st.x, st.top + 0.5, st.z, p.n / (src.pot.need), 0x7ad0ff);
      if (p.state === 'burnt' && Math.random() < 0.4) fx.puff(st.x, st.top, st.z, 0x222222, 1);
    }
    if (st.type === 'sink') {
      P.water.visible = st.dirty > 0; P.dishes.count = Math.min(6, st.dirty);
      for (let i = 0; i < P.dishes.count; i++) { _m4.makeTranslation(st.x, CF.COUNTER_H - 0.25 + i * 0.05, st.z); P.dishes.setMatrixAt(i, _m4); }
      P.dishes.instanceMatrix.needsUpdate = true;
      if (st.prog > 0 && st.dirty > 0) bar(st.x, CF.COUNTER_H + 0.75, st.z, st.prog, 0x7ad0ff);
    }
    if (st.type === 'rack') { P.plates.count = Math.min(8, st.clean); for (let i = 0; i < P.plates.count; i++) { _o3.position.set(st.x - 0.25 + i * 0.07, CF.COUNTER_H + 0.27, st.z); _o3.rotation.set(0, 0, Math.PI / 2 - 0.15); _o3.updateMatrix(); P.plates.setMatrixAt(i, _o3.matrix); } P.plates.instanceMatrix.needsUpdate = true; }
    if (st.type === 'return') { P.dishes.count = Math.min(8, st.dirty); for (let i = 0; i < P.dishes.count; i++) { _m4.makeTranslation(st.x, st.top + i * 0.055, st.z); P.dishes.setMatrixAt(i, _m4); } P.dishes.instanceMatrix.needsUpdate = true; }
    // fuego
    if (st.fire > 0) {
      const m = fx.fires[fi++]; if (m) { m.visible = true; m.position.set(st.x, Math.max(st.top, CF.COUNTER_H), st.z); const s = (1 - st.fireHP * 0.7) * (1 + Math.sin(t * 17 + st.c) * 0.12); m.scale.set(s, s * (1 + Math.sin(t * 23) * 0.15), s); m.rotation.y = t * 3; }
      if (Math.random() < 0.35) fx.burst(st.x, CF.COUNTER_H + 0.7, st.z, 0xff9a2a, 1, 1.8, -1);
      if (st.fireHP > 0) bar(st.x, CF.COUNTER_H + 1.2, st.z, st.fireHP, 0xffffff);
    }
    // marca de aviso
  }
  for (let i = fi; i < fx.fires.length; i++) fx.fires[i].visible = false;
  // cinta
  for (const e of sim.S.convItems) { const p = sim.convPos(e.s); fx.drawItem(e.item, p.x, p.y, p.z); }
  // limpieza: progreso en derrames
  for (const sp of sim.S.spills) if (sp.prog > 0) bar(sp.x, 0.9, sp.z, sp.prog, 0x7ad0ff);
  for (let i = bi; i < fx.bars.length; i++) fx.bars[i].g.visible = false;
}
const _m4 = new THREE.Matrix4(), _o3 = new THREE.Object3D();
function renderSeats(dt, t) {
  const K = G.K, sim = G.sim;
  for (const s of K.seats) {
    const g = s.cust.group;
    if (s.leave > 0) {
      s.leave -= dt;
      if (s.happy && s.dishItem) fx.drawItem(s.dishItem, s.x - 0.75, 0.82, s.z, 0, 0.9);
      g.position.y = -0.12 + (s.happy ? Math.abs(Math.sin(t * 9)) * 0.15 : 0);
      g.rotation.z = s.happy ? 0 : Math.sin(t * 20) * 0.08;
      if (s.leave < 0.5) g.scale.setScalar(Math.max(0.01, s.leave * 2));
      if (s.leave <= 0) { g.visible = false; g.scale.setScalar(1); s.orderId = -1; }
      continue;
    }
    if (s.orderId < 0 || !sim) continue;
    const o = sim.S.orders.find(x => x.id === s.orderId);
    if (!o) continue;
    if (s.pop > 0) { s.pop = Math.max(0, s.pop - dt * 3); g.scale.setScalar(1 - s.pop * 0.6); } else g.scale.setScalar(1);
    const f = Math.max(0, o.t / o.tMax);
    s.bar.scale.x = Math.max(0.01, f); s.bar.position.z = s.z; s.bar.material.color.setHex(f < 0.25 ? 0xff3b2f : f < 0.5 ? 0xffc93c : 0x6be38a);
    s.card.quaternion.copy(camera.quaternion); s.bar.quaternion.copy(camera.quaternion);
    s.card.position.y = 2.75 + Math.sin(t * 2 + s.z) * 0.05;
    g.rotation.z = f < 0.25 ? Math.sin(t * 16) * 0.05 : 0;
    g.position.y = -0.12;
  }
}

/* ---------- HUD ---------- */
function fmtT(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function updateHUD(sim) {
  const S = sim.S, D = G.D, th = G.banquet ? BANQUET[G.banquet.phase].stars : G.K.def.stars;
  UI.setText('hTime', '⏱ ' + fmtT(S.time));
  $('hTime').classList.toggle('hurry', S.time < 20 && !S.frozen);
  UI.setText('hScore', '⭐ ' + S.score);
  UI.setHTML('hFails', `${'✖'.repeat(S.fails)}<i>${'✖'.repeat(Math.max(0, D.maxFails - S.fails))}</i>`);
  const pct = Math.min(1, S.score / th[2]);
  /** @type {HTMLElement} */ ($('hStarFill')).style.width = (pct * 100).toFixed(1) + '%';
  const st = CF.starsOf(S.score, th);
  UI.setHTML('hStars', `<span style="left:${th[0] / th[2] * 100}%" class="${st >= 1 ? 'on' : ''}">★</span><span style="left:${th[1] / th[2] * 100}%" class="${st >= 2 ? 'on' : ''}">★</span><span style="left:100%" class="${st >= 3 ? 'on' : ''}">★</span>`);
  UI.renderTickets(S.orders);
  const d = G.focusDesc;
  const txt = d ? d.label : G.player.hold ? `Llevás: ${sim.itemName(G.player.hold)}` : '';
  UI.setText('prompt', txt); UI.show('prompt', !!txt);
  $('prompt').classList.toggle('ok', !!(d && d.ok));
  if (actBtn) {
    let short = 'ACCIÓN';
    if (d) for (const [re, w] of SHORT) if (re.test(d.label)) { short = w; break; }
    if (actBtn.textContent !== short) actBtn.textContent = short;
    actBtn.classList.toggle('ready', !!(d && d.ok));
  }
  // misiones compactas
  const ms = MM.state().current.map(m => `<li class="${m.status}"><span>${m.status === 'done' ? '✔' : m.status === 'failed' ? '✖' : m.kind === 'primary' ? '★' : '◆'}</span>${UI.esc(m.title)}${m.status === 'active' && m.progress ? ` <small>${Math.floor(Math.min(m.progress, 99))}</small>` : ''}</li>`).join('');
  UI.setHTML('missions', ms);
}

/* ======================= arranque ======================= */
UI.initPanel(); UI.initPops(12); UI.initTickets(5);
applyQuality(SDK.quality());
updateHelperUI();
showMenu();
g.start();
document.documentElement.dataset.ready = '1';


/* ======================= gancho de pruebas ======================= */
const itemSnap = it => (it ? JSON.parse(JSON.stringify(it)) : null);
const hook = {
  get state() { return G.mode; }, get scene() { return G.kitchenId; }, get endKind() { return G.endKind; },
  get banquet() { return G.banquet ? { phase: G.banquet.phase, stars: [...G.banquet.stars], scores: [...G.banquet.scores] } : null; },
  get player() { const P = G.player; return { x: +P.x.toFixed(3), z: +P.z.toFixed(3), yaw: +P.yaw.toFixed(3), stun: P.stun, hold: itemSnap(P.hold) }; },
  get hold() { return itemSnap(G.player.hold); },
  get hp() { return G.sim ? G.D.maxFails - G.sim.S.fails : null; },
  get score() { return G.sim ? G.sim.S.score : 0; },
  get shift() { if (!G.sim) return null; const S = G.sim.S; return { time: +S.time.toFixed(2), score: S.score, served: S.served, fails: S.fails, errors: S.errors, perfect: S.perfect, streak: S.streak, burnt: S.burnt, over: S.over, won: S.won, stars: S.stars || 0, frozen: S.frozen, dirtyFlag: S.dirtyFlag }; },
  get orders() { return G.sim ? G.sim.S.orders.map(o => ({ id: o.id, recipe: o.recipe, t: +o.t.toFixed(2), tMax: +o.tMax.toFixed(2), royal: o.royal, seat: o.seat })) : []; },
  get stations() { return G.K ? G.K.stations.map(s => ({ id: s.id, type: s.type, x: s.x, z: s.z, item: itemSnap(s.item), prog: +s.prog.toFixed(3), fire: s.fire, pot: s.pot ? { ...s.pot } : undefined, dirty: s.dirty, clean: s.clean, anim: s.anim, mark: s.mark })) : []; },
  station(id) { return this.stations.find(s => s.id === id) || null; },
  get conveyor() { return G.sim ? G.sim.S.convItems.map(e => ({ s: +e.s.toFixed(2), item: itemSnap(e.item) })) : []; },
  get focus() { return G.focus ? { kind: G.focus.kind, id: G.focus.kind === 'station' ? G.focus.ref.id : G.focus.kind, label: G.focusDesc ? G.focusDesc.label : '', ok: G.focusDesc ? G.focusDesc.ok : false, highlight: fx.hl.visible || fx.hlRing.visible } : null; },
  get spills() { return G.sim ? G.sim.S.spills.map(s => ({ c: s.c, rw: s.rw, x: s.x, z: s.z, prog: s.prog })) : []; },
  get rats() { return G.sim ? G.sim.S.rats.map(r => ({ x: r.x, z: r.z, st: r.st, carry: !!r.carry })) : []; },
  get chaos() { if (!G.sim) return null; const c = G.sim.S.chaos; return { next: c.next, pending: c.pending ? c.pending.type : '', zeroG: G.sim.zeroG, suction: !!G.sim.suction, flare: c.flare > 0 }; },
  get helper() { const A = helper.A; return { x: +A.x.toFixed(2), z: +A.z.toFixed(2), task: A.task, hold: itemSnap(A.hold), msg: A.msg, working: A.working > 0 }; },
  get events() { return [...G.events]; },
  get save() { return JSON.parse(JSON.stringify(SV)); },
  get missions() { return MM.state(); },
  get difficulty() { return { key: G.diffKey, ...G.D }; },
  get tutorial() { return G.tut ? { step: G.tut.step, visible: !$('coach').hidden } : { step: -1, visible: !$('coach').hidden }; },
  get counts() { return { rats: G.sim ? G.sim.S.rats.length : 0, spills: G.sim ? G.sim.S.spills.length : 0, fires: G.K ? G.K.stations.filter(s => s.fire > 0).length : 0, orders: G.sim ? G.sim.S.orders.length : 0, particles: fx.live, itemViews: fx.views, customers: G.K ? G.K.seats.filter(s => s.cust.group.visible).length : 0, kitchensBuilt: Object.keys(G.kitchens).length }; },
  get perf() { return { ...g.perf, quality: G.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, fogFar: scene.fog.far, particleCap: G.Q.particles, pointLight: point.visible, heapMB: /** @type {any} */ (performance).memory ? +(/** @type {any} */ (performance).memory.usedJSHeapSize / 1048576).toFixed(1) : null }; },
  get camera() { return { follow: G.cam.follow, dist: +G.cam.dist.toFixed(2) }; },
  get goldHat() { return SV.goldHat; },
  get simTime() { return g.simTime; }, get paused() { return g.paused; },
  /** posición en pantalla de una estación (para pruebas de toque) */
  screenOf(id) { const s = G.K && G.K.stations.find(x => x.id === id); if (!s) return null; const p = project(s.x, s.top, s.z); return { x: p.sx, y: p.sy }; },
};
if (DEBUG) Object.assign(hook, {
  simulate(sec) { g.simulate(sec); },
  goto(id) { if (MM.state().running === false) MM.runStart(); menu.hide(); endScreen.hide(); startShift(id); },
  banquetPhase(i) { menu.hide(); endScreen.hide(); if (!MM.state().running) MM.runStart(); G.banquet = { phase: i, stars: Array(i).fill(3), scores: Array(i).fill(200) }; startShift(BANQUET[i].kitchen, BANQUET[i]); },
  startBanquet() { if (!MM.state().running) MM.runStart(); startBanquet(); },
  skipCut() { G.cut && (G.cut.t = G.cut.dur); g.simulate(0.05); },
  tp(x, z) { G.player.x = x; G.player.z = z; G.player.vx = G.player.vz = 0; pickFocus(); },
  face(x, z) { G.player.yaw = Math.atan2(x - G.player.x, z - G.player.z); pickFocus(); },
  /** Pararse frente a una estación mirándola. */
  at(id) { const s = G.K.stations.find(x => x.id === id); if (!s) return false; G.player.x = s.x + s.fx * TS * 0.92; G.player.z = s.z + s.fz * TS * 0.92; G.player.vx = G.player.vz = 0; G.player.yaw = Math.atan2(s.x - G.player.x, s.z - G.player.z); pickFocus(); return G.focus && G.focus.ref === s; },
  /** Una pulsación de ACCIÓN por el mismo camino que el teclado. */
  act() { G.virt.tap = true; g.simulate(1 / 60); return G.focusDesc ? G.focusDesc.label : ''; },
  holdAct(sec) { G.virt.hold = true; g.simulate(sec); G.virt.hold = false; },
  give(it) { G.player.hold = it; },
  put(id, it) { const s = G.K.stations.find(x => x.id === id); if (s) s.item = it; },
  spawn(kind) { const sim = G.sim; if (kind === 'rat') return !!sim.spawnRat(); if (kind === 'spill') { const c = G.K.cellOf(G.player.x, G.player.z); return sim.addSpill(c.c + 1, c.rw) || sim.addSpill(c.c - 1, c.rw) || sim.addSpill(c.c, c.rw); } if (kind.startsWith('fire:')) return sim.ignite(G.K.stations.find(s => s.id === kind.slice(5))); if (kind.startsWith('order:')) return !!sim.addOrder(kind.slice(6)); return false; },
  startChaos(type) { G.sim.startChaos(type); },
  clearOrders() { G.sim.S.orders.length = 0; G.sim.S.nextOrder = 999; for (const s of G.K.seats) { s.cust.group.visible = false; s.card.visible = false; s.bar.visible = false; s.orderId = -1; } },
  noSpawn() { G.sim.S.noSpawn = true; G.sim.S.nextOrder = 1e9; G.sim.S.chaos.next = 1e9; G.sim.S.ratT = 1e9; },
  setScore(n) { G.sim.S.score = n; },
  deliverDirty(n) { G.sim.ret.dirty += n; },
  setTime(n) { G.sim.S.time = n; },
  setTask(id) { setTask(id); },
  unlock(n) { SV.unlocked = n; flush(); },
  endTut() { endTutorial(); },
  flush() { flush(); },
});
W['__' + CF.GAME_ID] = Object.freeze(hook);
