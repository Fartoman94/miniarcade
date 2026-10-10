// @ts-check
/* Granja de Runas — juego principal (Kit3D + MLArcade + MLMissions).
   Bucle: plantar → regar → cosechar → vender/pedidos → mejorar herramientas → misiones → Estación de Tormentas → invernadero. */
import { createGame, createInput, createSave, screen, toast, clamp, lerp, rng, THREE } from '../../matelabs/kit3d.js';
import * as D from './data.js';
import * as M from './models.js';
import { buildFarm, buildMarket, buildForest, PLOT_POS, GREEN_POS, DECOR_POS, MARKET, FOREST } from './world.js';
import { createCritters } from './critters.js';
import { createStorm } from './storm.js';
import * as UI from './ui.js';

const W = /** @type {any} */ (window);
const SDK = W.MLArcade, MM = W.MLMissions;
const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ACCENT = '#86efac';
const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));

/* ======================= guardado ======================= */
const save = createSave(D.SAVE_KEY, D.SAVE_VERSION, D.defaults(), D.migrate);
let S = D.sanitize(save.get());
/** Copia del amanecer (para «Reiniciar partida» = reiniciar el día). */
let dawn = JSON.stringify(S);
const hasProgress = () => S.day > 1 || S.min > D.DAY_START + 5 || S.huerta.cleared > 0 || S.coins !== D.defaults().coins;
function flush() { save.set(/** @type {any} */ (S)); }
function setSave(obj) { S = D.sanitize(obj); G.s = S; save.set(/** @type {any} */ (S)); }

/* ======================= contexto ======================= */
/** @type {any} */
const G = {
  mode: 'loading', s: S, diffKey: MM.difficulty(D.GAME_ID), D: D.DIFFICULTY.normal, Q: D.QUALITY.medium, quality: 'medium',
  scenes: /** @type {Record<string, any>} */ ({}), sceneName: 'granja', scene: null,
  player: { x: -3, z: 8, yaw: Math.PI, speed: 0, walk: 0, action: '', actT: 0, stun: 0, moved: 0 },
  cam: { yaw: 0, yawT: 0, x: 0, y: 10, z: 10, shake: 0 }, camOverride: null,
  t: 0, focus: null, auto: null, moveTo: null, hold: 0, endKind: '', trans: null,
};
G.D = D.DIFFICULTY[G.diffKey] || D.DIFFICULTY.normal;

/* ======================= motor ======================= */
const HELP = [
  'Moverte: WASD / flechas · Táctil: joystick · También: clic/toque en el suelo o en un objeto para ir y usarlo',
  'Usar / interactuar: E o Espacio (botón USAR) · mantené apretado para calmar espíritus',
  'Semilla: Q o Tab (botón 🌱) · 1-5 elige directo · Cámara: Z / X (botón ⟲) · Diario: J (📖)',
  'Gamepad: stick mover · A usar · X semilla · LB/RB cámara · Y diario · Start pausa',
  'Las plantas crecen sólo con agua. Llená la regadera en el pozo. Dormí en tu casa desde las 18:00.',
  'Las teclas se cambian en ⌨ Controles (menú de pausa o menú principal).',
];
const g = createGame({
  id: D.GAME_ID, title: 'Granja de Runas', accent: ACCENT, help: HELP, toolbar: 'tr', background: 0x9fd3f0, fov: 50, far: 400,
  gamepad: { a: 'Space', x: 'Tab', y: 'KeyI', lb: 'Comma', rb: 'Period', b: 'Escape' },
  isActive: () => G.mode === 'play' || G.mode === 'cutscene' || G.mode === 'transition',
  update, render,
  onRestart: restartDay,
  onQuality: applyQuality,
  // Nota: el SDK reanuda «en silencio» antes de una acción propia (sin onResume), así que kick() vuelve a arrancar el bucle del Kit3D.
  actions: [
    { label: '📖 Diario y misiones', fn: () => { kick(); if (G.mode === 'play') openDiary(); } },
    { label: '📘 Ver tutorial de nuevo', fn: () => { kick(); S.tutorial = { done: false, step: 0 }; G.player.moved = 0; coach(); } },
    { label: '⌨ Controles', fn: () => { kick(); if (G.mode === 'play') openControls(); } },
    { label: '🏠 Menú principal', fn: () => { kick(); toMenu(); } },
  ],
});
const { scene, camera, renderer } = g;
/** Reanuda el bucle del Kit3D tras una acción del menú de pausa (pausa+reanuda real, sin cambiar el estado). */
function kick() { if (SDK.pause()) SDK.resume(); }
G.g = g;
scene.fog = new THREE.Fog(0x9fd3f0, 40, 100);
const input = createInput(g.root, { joystick: 'left', buttons: [{ id: 'act', label: 'USAR' }, { id: 'seed', label: '🌱' }, { id: 'cam', label: '⟲' }, { id: 'diary', label: '📖' }] });
input.showTouch(false);

/* ---------- luces y cielo ---------- */
const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x5f7f4f, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 }); sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const clouds = (() => {
  const b = new M.Builder(); b.ball(3, 0xffffff, [0, 0, 0], [1.6, 0.6, 1], 1).ball(2.4, 0xffffff, [2.8, 0.3, 0], [1.3, 0.6, 1], 1).ball(2.2, 0xffffff, [-2.6, 0.2, 0.4], [1.3, 0.6, 1], 1);
  const im = new THREE.InstancedMesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, fog: false }), 8);
  const r = rng(5), o = new THREE.Object3D();
  im.userData.c = []; for (let i = 0; i < 8; i++) im.userData.c.push([-90 + r() * 180, 34 + r() * 10, -90 + r() * 120, 0.6 + r() * 0.8]);
  im.userData.o = o; scene.add(im);
  im.userData.c.forEach((c, i) => { o.position.set(c[0], c[1], c[2]); o.scale.setScalar(c[3] * 1.6); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.computeBoundingSphere(); im.frustumCulled = false;
  return im;
})();

/* ---------- partículas (pool) ---------- */
const PMAX = 240;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(c); return t; })();
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.28, map: dot, vertexColors: true, transparent: true, depthWrite: false }));
particles.frustumCulled = false; scene.add(particles);
for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -99;
let pNext = 0;
const _col = new THREE.Color();
G.burst = (x, y, z, color, n = 10) => {
  const cap = G.Q.particles; _col.set(color);
  for (let k = 0; k < n; k++) {
    const i = pNext; pNext = (pNext + 1) % cap;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.2;
    pVel[i * 3] = Math.cos(a) * sp; pVel[i * 3 + 1] = 2 + Math.random() * 3; pVel[i * 3 + 2] = Math.sin(a) * sp;
    pCol[i * 3] = _col.r; pCol[i * 3 + 1] = _col.g; pCol[i * 3 + 2] = _col.b; pLife[i] = 0.7 + Math.random() * 0.5;
  }
};
function updateParticles(dt) {
  let live = 0;
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt; live++;
    pVel[i * 3 + 1] -= 9 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.05) { pPos[i * 3 + 1] = 0.05; pVel[i * 3 + 1] *= -0.3; }
    if (pLife[i] <= 0) pPos[i * 3 + 1] = -99;
  }
  G.liveParticles = live;
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

/* ---------- lluvia (segmentos reciclados) ---------- */
const RMAX = 1100;
const rGeo = new THREE.BufferGeometry(); const rPos = new Float32Array(RMAX * 6);
rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
const rain = new THREE.LineSegments(rGeo, new THREE.LineBasicMaterial({ color: 0xbcd6f0, transparent: true, opacity: 0.55 }));
rain.frustumCulled = false; rain.visible = false; scene.add(rain);
{ const r = rng(9); for (let i = 0; i < RMAX; i++) { const x = -20 + r() * 40, y = r() * 18, z = -20 + r() * 40; rPos.set([x, y, z, x, y - 0.6, z], i * 6); } }
function updateRain(dt, on, wind) {
  rain.visible = on;
  if (!on) return;
  const n = G.Q.rain; rGeo.setDrawRange(0, n * 2);
  const cx = G.player.x, cz = G.player.z;
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    let y = rPos[o + 1] - 24 * dt;
    let x = rPos[o] + wind * dt * 8;
    if (y < 0) { y = 14 + (i % 7); x = cx - 20 + ((i * 37) % 40); rPos[o + 2] = cz - 20 + ((i * 53) % 40); }
    if (x > cx + 22) x -= 44; else if (x < cx - 22) x += 44;
    rPos[o] = x; rPos[o + 1] = y; rPos[o + 3] = x - wind * 0.35; rPos[o + 4] = y - 0.7; rPos[o + 5] = rPos[o + 2];
  }
  rGeo.attributes.position.needsUpdate = true;
}

/* ---------- escenarios ---------- */
G.scenes.granja = buildFarm(); G.scenes.mercado = buildMarket(); G.scenes.bosque = buildForest();
for (const k of Object.keys(G.scenes)) { G.scenes[k].group.visible = false; scene.add(G.scenes[k].group); }
const FA = G.scenes.granja.anchors, MA = G.scenes.mercado.anchors, BA = G.scenes.bosque.anchors;
// decoraciones precreadas por ranura (sin crear objetos al jugar)
const decorModels = FA.decorSlots.map(holder => { const o = {}; for (const k of Object.keys(M.DECOR)) { const m = M.makeDecor(k); m.visible = false; holder.add(m); o[k] = m; } return o; });

/* ---------- jugadora ---------- */
const hero = M.makePerson({ hat: 'straw', top: 0x5aa86b, skirt: true, braid: true, apron: true, hair: 0xb5651d });
scene.add(hero.group);
const tools = M.makeTools();
for (const k of Object.keys(tools)) { const t = tools[k]; t.visible = false; t.position.set(0, -0.5, 0.12); hero.arms[1].add(t); }
const heroShadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12).rotateX(-Math.PI / 2), M.MAT.shadow); heroShadow.position.y = 0.03; scene.add(heroShadow);
const focusRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 24).rotateX(-Math.PI / 2), M.MAT.ring); focusRing.visible = false; scene.add(focusRing);
const walkMark = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.4, 16).rotateX(-Math.PI / 2), M.MAT.ring); walkMark.visible = false; scene.add(walkMark);

/* ---------- sistemas ---------- */
G.ui = UI;
G.toast = (t, ms) => toast(t, ms);
G.pop = (t, x, y, z, c) => UI.pop(t, x, y, z, c);
G.shake = a => { if (!REDUCED) G.cam.shake = Math.max(G.cam.shake, a); };
G.flash = () => { if (REDUCED) return; const f = $('flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); };
G.zap = () => { S.energy = Math.max(1, S.energy - 8); G.player.stun = 1.4; G.pop('¡Zap! Te aturdió el rayo', G.player.x, 2.4, G.player.z, '#fff3bf'); };
G.stormActive = () => storm.S.active;
G.skipPressed = () => input.hit(S.keys.usar, 'Space', 'Enter', 'btn:act');
G.emitLocal = (ev, v) => { /* gancho para pruebas y tutorial */ G.lastEvent = ev + (v !== undefined ? ':' + v : ''); };
G.refreshPlot = refreshPlot;
G.animalLabel = animalLabel; G.animalAct = animalAct; G.adopt = adopt; G.adoptGoat = adoptGoat; G.talk = talk;
G.tut = tutEvent;
G.onStormEnd = onStormEnd;
const critters = createCritters(G); G.critters = critters;
const storm = createStorm(G); G.storm = storm;

/* ---------- audio ---------- */
const SFX = {
  dig: { f: 140, f2: 80, d: 0.18, noise: true, v: 0.12 }, hoe: { f: 200, d: 0.09, noise: true, v: 0.16 }, water: { f: 900, d: 0.3, noise: true, v: 0.06 },
  plant: { f: 520, f2: 760, d: 0.12, type: 'sine', v: 0.12 }, harvest: { f: 620, f2: 980, d: 0.16, type: 'triangle', v: 0.16 },
  coin: { f: 1320, f2: 1760, d: 0.12, type: 'square', v: 0.06 }, buy: { f: 660, f2: 880, d: 0.1, type: 'triangle', v: 0.12 },
  shoo: { f: 380, f2: 220, d: 0.2, type: 'square', v: 0.08 }, caw: { f: 330, f2: 210, d: 0.22, type: 'sawtooth', v: 0.06 },
  nibble: { f: 900, d: 0.04, type: 'square', v: 0.04 }, steal: { f: 300, f2: 120, d: 0.35, type: 'sawtooth', v: 0.07 },
  chime: { f: 1050, f2: 1580, d: 0.4, type: 'sine', v: 0.12 }, dry: { f: 500, f2: 200, d: 0.3, type: 'sine', v: 0.08 }, frost: { f: 1800, f2: 900, d: 0.3, type: 'sine', v: 0.06 },
  thunder: { f: 60, d: 1.1, noise: true, v: 0.3 }, wind: { f: 200, d: 0.8, noise: true, v: 0.06 }, gust: { f: 120, d: 0.5, noise: true, v: 0.18 },
  lost: { f: 300, f2: 150, d: 0.3, type: 'triangle', v: 0.1 }, tarp: { f: 240, d: 0.12, noise: true, v: 0.1 }, charge: { f: 400, f2: 1600, d: 0.35, type: 'sawtooth', v: 0.06 },
  gate: { f: 160, f2: 90, d: 0.3, type: 'square', v: 0.06 }, splash: { f: 700, d: 0.35, noise: true, v: 0.1 },
  bell0: { f: 523, d: 0.7, type: 'sine', v: 0.18 }, bell1: { f: 659, d: 0.7, type: 'sine', v: 0.18 }, bell2: { f: 784, d: 0.7, type: 'sine', v: 0.18 },
  fanfare: { f: 523, f2: 1046, d: 0.6, type: 'triangle', v: 0.16 }, ui: { f: 880, d: 0.05, type: 'sine', v: 0.06 }, chop: { f: 160, d: 0.12, noise: true, v: 0.2 },
  mine: { f: 1400, f2: 900, d: 0.12, type: 'square', v: 0.07 }, happy: { f: 700, f2: 1200, d: 0.2, type: 'sine', v: 0.12 }, sleep: { f: 440, f2: 220, d: 0.9, type: 'sine', v: 0.1 },
};
G.sfx = k => { const o = SFX[k]; if (o) g.audio.tone({ ...o, id: k, gap: 0.06 }); };
const PENTA = [392, 440, 523, 587, 659, 784, 880];
let musicT = 0, musicStep = 0;
function music(dt) {
  musicT -= dt;
  if (musicT > 0) return;
  const night = S.min > 1200;
  musicT = night ? 0.9 : 0.55;
  musicStep++;
  if (storm.S.active) { if (musicStep % 4 === 0) g.audio.tone({ f: 110, d: 0.8, type: 'sine', v: 0.04, id: 'm' }); return; }
  if (night) { if (musicStep % 3 === 0) g.audio.tone({ f: 4200 + (musicStep % 5) * 120, d: 0.04, type: 'square', v: 0.008, id: 'm' }); return; }
  const bar = Math.floor(musicStep / 8) % 4, k = (musicStep * 3 + bar * 2) % PENTA.length;
  if (musicStep % 8 !== 7) g.audio.tone({ f: PENTA[k] * (bar === 2 ? 0.75 : 1), d: 0.45, type: 'sine', v: 0.028, id: 'm' });
  if (musicStep % 4 === 0) g.audio.tone({ f: PENTA[bar] / 2, d: 0.9, type: 'triangle', v: 0.02, id: 'mb' });
}

/* ======================= calidad ======================= */
function applyQuality(q) {
  G.quality = q; G.Q = D.QUALITY[q] || D.QUALITY.medium;
  for (const k of Object.keys(G.scenes)) for (const im of G.scenes[k].flora) im.count = Math.max(1, Math.round(im.userData.total * G.Q.flora));
  sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  clouds.visible = q !== 'low';
  applyFog();
}
function applyFog() {
  const f = G.Q.fog, k = G.scene ? G.scene.fog : 1;
  scene.fog.near = f[0] * k * (storm.S.active ? 0.6 : 1); scene.fog.far = f[1] * k * (storm.S.active ? 0.7 : 1);
  camera.far = scene.fog.far + 30; camera.updateProjectionMatrix();
}

/* ======================= tiempo, luz y estaciones ======================= */
const SKY = [
  [360, 0xf6c6a0, 0xffe0c0, 0x6a5a7a, 0.9, 0xffb07a, 1.2],
  [480, 0x9fd3f0, 0xe8f4ff, 0x5f7f4f, 1.1, 0xfff1d6, 2.2],
  [960, 0x8ecbf0, 0xe8f4ff, 0x5f7f4f, 1.1, 0xfff1d6, 2.2],
  [1110, 0xf2a07a, 0xffd0b0, 0x5a4a6a, 0.95, 0xff9a5a, 1.4],
  [1230, 0x26304f, 0x6a7ab0, 0x1a2030, 0.6, 0x9fb4ff, 0.5],
  [1440, 0x1a2240, 0x5a6aa0, 0x151a28, 0.55, 0x9fb4ff, 0.45],
];
const cA = new THREE.Color(), cB = new THREE.Color(), cSky = new THREE.Color(), cStorm = new THREE.Color(0x4a5468), cRain = new THREE.Color(0x8a9aae);
const SEASON_TINT = [[0xffffff, 0xffffff], [0xfff2c8, 0xfff4d0], [0xffb877, 0xf5d6a8], [0xd6e6f2, 0xeef4ff]];
function nightK() { return S.min < 420 ? Math.max(0, (420 - S.min) / 60) * 0.3 : S.min > 1110 ? Math.min(1, (S.min - 1110) / 120) : 0; }
function applyTime() {
  const m = S.min;
  let i = 0; while (i < SKY.length - 2 && m >= SKY[i + 1][0]) i++;
  const a = SKY[i], b = SKY[i + 1], k = clamp((m - a[0]) / (b[0] - a[0]), 0, 1);
  const st = storm.S.active ? 0.75 : isRain() ? 0.45 : 0;
  cSky.copy(cA.set(a[1])).lerp(cB.set(b[1]), k); if (st) cSky.lerp(storm.S.active ? cStorm : cRain, st);
  /** @type {THREE.Color} */ (scene.background).copy(cSky);
  scene.fog.color.copy(cSky);
  hemi.color.copy(cA.set(a[2])).lerp(cB.set(b[2]), k); hemi.groundColor.copy(cA.set(a[3])).lerp(cB.set(b[3]), k);
  hemi.intensity = lerp(a[4], b[4], k) * (1 - st * 0.55);
  sun.color.copy(cA.set(a[5])).lerp(cB.set(b[5]), k); sun.intensity = lerp(a[6], b[6], k) * (1 - st * 0.9);
  const day = clamp((m - 360) / 720, 0, 1), ang = Math.PI * (0.1 + day * 0.8);
  sun.position.set(G.player.x + Math.cos(ang) * 30, Math.max(8, Math.sin(ang) * 32), G.player.z + 14);
  sun.target.position.set(G.player.x, 0, G.player.z);
  const night = nightK();
  /** @type {any} */ (M.MAT.glow).color.setScalar(0.75 + night * 0.6);
  // estaciones suaves: el último tercio de cada estación mezcla con la siguiente
  const fd = (S.day - 1) + (m - 360) / 1080, sIdx = Math.floor(fd / D.DAYS_PER_SEASON) % 4, frac = (fd % D.DAYS_PER_SEASON) / D.DAYS_PER_SEASON;
  const blend = clamp((frac - 0.66) / 0.34, 0, 1), nIdx = (sIdx + 1) % 4;
  M.MAT.foliage.color.copy(cA.set(SEASON_TINT[sIdx][0])).lerp(cB.set(SEASON_TINT[nIdx][0]), blend);
  M.MAT.ground.color.copy(cA.set(SEASON_TINT[sIdx][1])).lerp(cB.set(SEASON_TINT[nIdx][1]), blend);
}
function isRain(day = S.day) { return D.seasonOf(day) !== 1 && day > 2 && rng(S.seed + day * 13)() < 0.22; }

/* ======================= parcelas ======================= */
const plotList = i => (i < D.PLOTS ? S.plots[i] : S.green[i - D.PLOTS]);
const stageOf = p => (p.g >= 1 ? 3 : p.g >= 0.6 ? 2 : p.g >= 0.25 ? 1 : 0);
const C_DRY = new THREE.Color(M.C.soil), C_WET = new THREE.Color(M.C.soilWet), C_WILD = new THREE.Color(0x7a6a48), C_FROST = new THREE.Color(0xcfe6f5);
const bounce = new Float32Array(D.PLOTS + D.GREEN_PLOTS);
function refreshPlot(i, b = false) {
  const p = plotList(i);
  const crop = FA.crop[i];
  if (i < D.PLOTS) {
    const w = FA.weed[i];
    w.visible = p.s === 'maleza' || p.s === 'roca';
    if (w.visible) { w.geometry = p.s === 'roca' ? FA.rockGeo : FA.weedGeo; const need = needHits(p); w.scale.setScalar(1 - (p.hits / need) * 0.45); }
  }
  const c = p.s === 'maleza' || p.s === 'roca' ? C_WILD : p.frost ? C_FROST : p.w > 0 ? C_WET : C_DRY;
  FA.plots.setColorAt(i, c); if (FA.plots.instanceColor) FA.plots.instanceColor.needsUpdate = true;
  crop.visible = p.s === 'cultivo';
  if (crop.visible) {
    crop.geometry = M.cropGeo(p.crop, stageOf(p));
    crop.userData.stage = stageOf(p);
    const hp = storm.S.active && i < D.PLOTS && storm.riskOf(i) ? storm.hpOf(i) : 2;
    crop.rotation.z = hp === 1 ? 0.35 : 0; crop.scale.y = hp <= 0 ? 0.25 : 1;
  }
  if (b) bounce[i] = 0.35;
}
function refreshAll() {
  for (let i = 0; i < D.PLOTS + D.GREEN_PLOTS; i++) refreshPlot(i);
  FA.plots.count = S.inv3.done ? D.PLOTS + D.GREEN_PLOTS : D.PLOTS;
  for (let k = 0; k < D.GREEN_PLOTS; k++) if (!S.inv3.done) FA.crop[D.PLOTS + k].visible = false;
  // invernadero por etapas
  const gh = FA.greenhouse, got = S.inv3.got;
  gh.frame.visible = got.madera >= D.INV_REQ.madera || S.inv3.done;
  gh.glass.visible = (gh.frame.visible && got.cristal >= D.INV_REQ.cristal) || S.inv3.done;
  gh.runes.visible = S.inv3.done;
  FA.mill.broken.visible = !S.mill; FA.millOn = S.mill;
  S.decor.forEach((d, k) => { for (const key of Object.keys(decorModels[k])) decorModels[k][key].visible = key === d; });
  // mercado
  ['nabo', 'zanahoria', 'trigo', 'calabaza'].forEach((c, k) => { MA.sacks[k].count = Math.min(6, stockOf(c)); });
  MA.goods.count = Math.min(10, S.merchant);
  MA.ribbon.visible = S.feria.done;
  // bosque
  ensureForestDay();
  BA.logs.forEach((l, k) => { l.visible = S.forest.log[k]; });
  BA.crystals.forEach((c, k) => { c.visible = S.forest.crystal[k]; });
  BA.bushes.forEach((b, k) => { b.glow.visible = S.forest.bush[k]; });
}
function needHits(p) { return D.TOOLS.azada.levels[S.tools.azada].hits + (p.s === 'roca' ? 1 : 0); }
function stockOf(c) { if (S.stock.day !== S.day) { Object.assign(S.stock, { day: S.day, nabo: 6, zanahoria: 5, trigo: 6, calabaza: 3 }); } return S.stock[c]; }
function ensureForestDay() { if (S.forest.day !== S.day) { S.forest.day = S.day; S.forest.bush = [true, true, true, true, true]; S.forest.log = [true, true, true, true]; S.forest.crystal = [true, true, true]; } }

/** crecimiento determinista: minutos de juego regados × estación × dificultad */
function growPlots(dMin) {
  const season = D.seasonOf(S.day), rainy = isRain();
  for (let i = 0; i < D.PLOTS + D.GREEN_PLOTS; i++) {
    const green = i >= D.PLOTS;
    if (green && !S.inv3.done) continue;
    const p = plotList(i);
    if (p.s !== 'cultivo') continue;
    if (rainy && !green && !storm.S.active) { if (p.w < 1) { p.w = 1; p.frost = 0; } }
    if (p.w <= 0 || p.frost || p.g >= 1) continue;
    const cd = D.CROPS[p.crop];
    const sm = green ? Math.max(1, cd.mult[season]) * 1.25 : cd.mult[season];
    const before = stageOf(p);
    p.g = Math.min(1, p.g + dMin / cd.grow * sm * G.D.growth);
    p.w = Math.max(0, p.w - dMin / (green ? 900 : 600));
    const after = stageOf(p);
    if (after !== before || p.w <= 0) refreshPlot(i, after !== before);
    if (after === 3 && before !== 3 && (G.sceneName === 'granja')) { const P = green ? GREEN_POS[i - D.PLOTS] : PLOT_POS[i]; G.pop(`¡${cd.name} lista!`, P[0], 1.4, P[1], ACCENT); G.burst(P[0], 0.6, P[1], 0xfff3bf, 8); }
  }
}

/* ======================= acciones de la jugadora ======================= */
function spend(cost) {
  const c = Math.max(1, Math.round(cost * G.D.energy));
  S.energy = Math.max(0, S.energy - c);
  if (S.energy <= 0) { faint(); return false; }
  if (S.energy <= 20 && S.energy + c > 20) toast('⚡ Te queda poca energía: comé algo o andá a dormir');
  return true;
}
function act(kind, dur = 0.45) { G.player.action = kind; G.player.actT = dur; }
function plotAction(i) {
  const green = i >= D.PLOTS, p = plotList(i), P = green ? GREEN_POS[i - D.PLOTS] : PLOT_POS[i];
  if (!green && storm.S.active) { const sa = storm.plotAction(i); if (sa) return sa; if (storm.S.phase > 0) return { label: p.s === 'cultivo' ? (storm.hpOf(i) > 0 ? `🌾 Cultivo en riesgo (${storm.hpOf(i)}/2)` : '🥀 Se perdió') : null, act: () => {} }; }
  if (p.s === 'maleza' || p.s === 'roca') {
    const need = needHits(p);
    return { label: `⛏ Limpiar ${p.s === 'roca' ? 'piedras y maleza' : 'maleza'} (${p.hits}/${need})`, act: () => {
      if (!spend(S.tools.azada ? 3 : 5)) return;
      act('hoe'); G.sfx('hoe'); G.burst(P[0], 0.3, P[1], p.s === 'roca' ? 0xa9a59b : 0x6e8f3a, 12);
      p.hits++;
      tutEvent('clear');
      if (p.hits >= need) {
        p.s = 'vacia'; p.hits = 0; S.huerta.cleared++;
        G.pop('¡Parcela restaurada!', P[0], 1.4, P[1], ACCENT);
        if (S.huerta.cleared <= 6) MM.emit('huerta');
        checkHuerta();
      }
      refreshPlot(i, true);
    } };
  }
  if (p.s === 'vacia') {
    const sel = S.seedSel;
    if (S.seeds[sel] <= 0) {
      const any = D.SEED_ORDER.find(k => S.seeds[k] > 0);
      if (!any) return { label: '🌱 No tenés semillas (comprá en el mercado)', act: () => toast('Las semillas se compran en los estantes de Don Tito, en el mercado') };
      return { label: `🌱 Plantar ${D.CROPS[any].name} (${S.seeds[any]})`, act: () => { S.seedSel = any; plant(i, any, P); } };
    }
    return { label: `🌱 Plantar ${D.CROPS[sel].name} (${S.seeds[sel]})`, act: () => plant(i, sel, P) };
  }
  if (p.s === 'cultivo') {
    const cd = D.CROPS[p.crop];
    if (p.g >= 1) return { label: `🧺 Cosechar ${cd.name}`, act: () => harvest(i, p, P) };
    if (p.w <= 0.02 || p.frost) {
      if (p.crop === 'arcoiris') {
        return S.inv.rocio > 0 ? { label: `💧 Regar con rocío de espíritu (${S.inv.rocio})`, act: () => { S.inv.rocio--; waterPlot(i, p, P); } }
          : { label: '💧 La flor arcoíris sólo bebe rocío de espíritu (calmá un espíritu)', act: () => toast('Calmá un espíritu del clima (mantené USAR cerca) para conseguir rocío') };
      }
      if (S.water > 0) return { label: `💧 ${p.frost ? 'Derretir la escarcha regando' : 'Regar'} (${S.water})`, act: () => { S.water--; waterPlot(i, p, P); } };
      return { label: '💧 Regadera vacía: llenala en el pozo', act: () => toast('El pozo está al lado de los surcos 💧') };
    }
    return { label: `🌿 ${cd.name}: ${Math.floor(p.g * 100)}% · regada`, act: () => { G.pop('🌿', P[0], 1, P[1]); } };
  }
  return { label: null, act: () => {} };
}
function plant(i, crop, P) {
  const p = plotList(i);
  if (S.seeds[crop] <= 0 || !spend(1)) return;
  S.seeds[crop]--; Object.assign(p, { s: 'cultivo', crop, g: 0, w: 0, frost: 0, hits: 0 });
  act('plant'); G.sfx('plant'); G.burst(P[0], 0.2, P[1], 0x8a5a3b, 8); refreshPlot(i, true); tutEvent('plant');
}
function waterPlot(i, p, P) {
  if (!spend(1)) return;
  p.w = 1; p.frost = 0; act('water', 0.6); G.sfx('water'); G.burst(P[0], 0.6, P[1], 0x5fb6d9, 14); refreshPlot(i, true); tutEvent('water');
}
function harvest(i, p, P) {
  if (!spend(1)) return;
  const n = p.crop === 'trigo' ? 2 : 1, crop = p.crop;
  S.inv[crop] += n; S.stats.harvest++;
  Object.assign(p, { s: 'vacia', crop: '', g: 0, w: p.w, frost: 0 });
  act('harvest'); G.sfx('harvest'); G.burst(P[0], 0.7, P[1], 0xfff3bf, 12);
  G.pop(`+${n} ${D.ITEMS[crop][1]}`, P[0], 1.4, P[1], '#fff');
  if (S.huerta.harvested < 4) { S.huerta.harvested++; MM.emit('huerta'); checkHuerta(); }
  if (crop === 'arcoiris' && !S.flags.rainbow) { S.flags.rainbow = true; MM.emit('rainbow'); UI.banner('◆ MISIÓN SECUNDARIA', '¡Floreció la flor arcoíris!'); }
  refreshPlot(i, true);
}
function checkHuerta() {
  if (!S.huerta.done && S.huerta.cleared >= 6 && S.huerta.harvested >= 4) {
    S.huerta.done = true; S.coins += 60; S.earned += 60;
    UI.banner('★ MISIÓN PRINCIPAL', 'Huerta restaurada · +60 🪙', 3200); G.sfx('fanfare');
    syncCampaign(); flush();
  }
}
function gainCoins(n, x, z) { S.coins += n; S.earned += n; G.sfx('coin'); if (x !== undefined) G.pop(`+${n} 🪙`, x, 2, z, '#ffe066'); }

/* ---------- animales ---------- */
function animalLabel(k) {
  const a = S.animals[k], A = D.ANIMALS[k];
  if (a.ready) return `🧺 Recoger ${D.ITEMS[A.product][0].toLowerCase()} de ${A.name}`;
  if (!a.fed) return S.inv.forraje > 0 ? `🌿 Darle forraje a ${A.name} (${S.inv.forraje})` : S.inv.trigo > 0 ? `🌾 Darle trigo a ${A.name} (${S.inv.trigo})` : `🌿 ${A.name} tiene hambre (forraje en el refugio)`;
  return `💚 Acariciar a ${A.name}`;
}
function animalAct(k, ent) {
  const a = S.animals[k], A = D.ANIMALS[k];
  if (a.ready) { a.ready = false; S.inv[A.product]++; G.sfx('harvest'); G.pop(`+1 ${D.ITEMS[A.product][1]}`, ent.x, 1.6, ent.z); act('harvest'); return; }
  if (!a.fed) {
    if (S.inv.forraje > 0) S.inv.forraje--; else if (S.inv.trigo > 0) S.inv.trigo--; else { toast('Comprá forraje en el refugio de la Abuela Rosa (mercado)'); return; }
    if (!spend(1)) return;
    a.fed = true; critters.hop(k); act('harvest'); G.sfx('happy'); G.burst(ent.x, 1.2, ent.z, 0xf59ac0, 10); G.pop('¡Ñam! 💕 (mañana deja regalo)', ent.x, 1.8, ent.z, '#ffc9de');
    tutEvent('feed');
    return;
  }
  critters.hop(k); G.sfx('happy'); G.pop('💚', ent.x, 1.6, ent.z);
}
function adopt(k) {
  const A = D.ANIMALS[k];
  if (S.animals[k].own) return;
  if (S.coins < A.price) { toast(`Necesitás ${A.price} 🪙 para adoptar a ${A.name}`); return; }
  S.coins -= A.price; S.animals[k].own = true; G.sfx('happy');
  UI.banner('🏡 ADOPCIÓN', `${A.name} se muda a tu corral`, 2400);
  afterAdopt();
}
function adoptGoat() {
  if (S.animals.cabra.own) return;
  if (S.inv.zanahoria > 0) S.inv.zanahoria--; else if (S.inv.forraje > 0) S.inv.forraje--; else { toast('La cabrita tiene hambre: traele forraje o una zanahoria'); return; }
  S.animals.cabra.own = true; G.sfx('happy'); G.burst(FOREST.cabra[0], 1, FOREST.cabra[1], 0xf59ac0, 14);
  UI.banner('🐐 ¡NUEVA AMIGA!', 'La Cabrita Runa se va a vivir a tu granja', 2600);
  afterAdopt();
}
function afterAdopt() {
  MM.emit('adopt');
  const n = Object.values(S.animals).filter(a => a.own).length;
  if (n >= 3 && !S.flags.animalsDone) { S.flags.animalsDone = true; UI.banner('◆ MISIÓN SECUNDARIA', 'Adoptaste tres animales'); }
  critters.placeAnimals(); flush();
}

/* ======================= interactuables por escenario ======================= */
function I(o) { return Object.assign({ r: 1.7, y: 1, live: () => true }, o); }
const INTER = { granja: [], mercado: [], bosque: [] };
// granja
PLOT_POS.forEach((p, i) => INTER.granja.push(I({ id: 'parcela' + i, kind: 'plot', x: p[0], z: p[1], r: 1.75, y: 0.6, label: () => plotAction(i).label, act: () => plotAction(i).act() })));
GREEN_POS.forEach((p, k) => INTER.granja.push(I({ id: 'invernadero' + k, kind: 'plot', x: p[0], z: p[1], r: 1.5, y: 0.6, live: () => S.inv3.done, label: () => plotAction(D.PLOTS + k).label, act: () => plotAction(D.PLOTS + k).act() })));
INTER.granja.push(I({ id: 'pozo', kind: 'well', x: 2.6, z: 0.6, r: 2.0, y: 1.5, label: () => { const cap = D.TOOLS.regadera.levels[S.tools.regadera].cap; return S.water >= cap ? `💧 Regadera llena (${S.water}/${cap})` : `💧 Llenar la regadera (${S.water}/${cap})`; },
  act: () => { const cap = D.TOOLS.regadera.levels[S.tools.regadera].cap; if (S.water >= cap) return; S.water = cap; act('water', 0.5); G.sfx('splash'); G.burst(2.6, 1.2, 0.6, 0x5fb6d9, 10); tutEvent('fill'); } }));
INTER.granja.push(I({ id: 'casa', kind: 'house', x: 6, z: -9.2, r: 1.9, y: 1.6, label: () => S.min >= D.SLEEP_FROM ? '🛏 Dormir hasta mañana' : '🏠 Casa: comer algo (dormís desde las 18:00)', act: () => openHouse() }));
INTER.granja.push(I({ id: 'molino', kind: 'mill', x: -15, z: -9.8, r: 2.0, y: 1.5, label: () => S.mill ? `🌾→🥖 Moler trigo en harina (${S.inv.trigo} 🌾)` : `🛠 Reparar el molino (${D.MILL_REQ.madera}🪵 ${D.MILL_REQ.cristal}💎 ${D.MILL_REQ.monedas}🪙)`, act: () => millAct() }));
INTER.granja.push(I({ id: 'obra', kind: 'build', x: -6, z: -8.4, r: 1.9, y: 1.6, label: () => S.inv3.done ? '✨ Invernadero mágico (plantá adentro)' : '🏗 Obra del invernadero: aportar materiales', act: () => S.inv3.done ? toast('Adentro las plantas crecen más rápido, sin plagas ni estaciones') : openGreenhouse() }));
DECOR_POS.forEach((p, k) => INTER.granja.push(I({ id: 'deco' + k, kind: 'decor', x: p[0], z: p[1], r: 1.7, y: 1, label: () => S.decor[k] ? `🎀 Cambiar decoración (${M.DECOR[S.decor[k]].name})` : Object.values(S.decorInv).some(v => v > 0) ? '🎀 Colocar decoración' : '🎀 Lugar para decorar (comprá en el mercado)', act: () => openDecor(k) })));
INTER.granja.push(...storm.inter);
// mercado
['nabo', 'zanahoria', 'trigo', 'calabaza'].forEach((c, k) => INTER.mercado.push(I({ id: 'estante_' + c, kind: 'shelf', x: MARKET.shelves[k][0], z: MARKET.shelves[k][1] + 0.9, r: 1.5, y: 1.4,
  label: () => stockOf(c) > 0 ? `🛒 Semillas de ${D.CROPS[c].name}: ${D.CROPS[c].seed} 🪙 (quedan ${stockOf(c)})` : `🛒 ${D.CROPS[c].name}: agotado hasta mañana`, act: () => buySeed(c, k) })));
INTER.mercado.push(I({ id: 'venta', kind: 'shop', x: 11, z: -4.9, r: 1.9, y: 1.4, label: () => npcHere('tomas') ? '💰 Vender cosecha a Tomás' : `💰 Almacén: ${whereIs('tomas')}`, act: () => npcHere('tomas') ? openSell() : toast(`Tomás ${whereIs('tomas')}: hablale ahí`) }));
INTER.mercado.push(I({ id: 'estanteria', kind: 'stock', x: MARKET.merchantShelf[0], z: MARKET.merchantShelf[1] + 1, r: 1.7, y: 1.4, label: () => S.merchant >= D.MERCHANT_TARGET ? '📦 Estantería de Tomás: ¡llena!' : `📦 Abastecer la estantería de Tomás (${S.merchant}/${D.MERCHANT_TARGET})`, act: () => stockShelf() }));
INTER.mercado.push(I({ id: 'herreria', kind: 'shop', x: 12, z: 7.2, r: 1.9, y: 1.4, label: () => npcHere('ines') ? '🔨 Mejorar herramientas con Inés' : `🔨 Herrería: Inés ${whereIs('ines')}`, act: () => npcHere('ines') ? openForge() : toast(`Inés ${whereIs('ines')}: hablale ahí`) }));
INTER.mercado.push(I({ id: 'decoracion', kind: 'shop', x: MARKET.deco[0], z: MARKET.deco[1], r: 1.9, y: 1.4, label: () => '🎀 Puesto de la Abuela Rosa: decoración y forraje', act: () => openRosa() }));
INTER.mercado.push(I({ id: 'pedidos', kind: 'board', x: MARKET.board[0] + 0.6, z: MARKET.board[1] + 1.1, r: 1.8, y: 1.6, label: () => { const n = ordersNow().list.filter(o => !o.done).length; return `📋 Tablero de pedidos (${n} abiertos)`; }, act: () => openOrders() }));
INTER.mercado.push(I({ id: 'feria', kind: 'fair', x: 0, z: 8.3, r: 1.9, y: 1.4, label: () => S.feria.done ? '🏅 Feria de Cosechas: ¡ganaste la cinta azul!' : S.huerta.done ? '🎪 Feria de Cosechas: entregar productos' : '🎪 Feria de Cosechas (primero restaurá tu huerta)', act: () => openFeria() }));
// bosque
FOREST.bushes.forEach((p, k) => INTER.bosque.push(I({ id: 'arbusto' + k, kind: 'bush', x: p[0], z: p[1], r: 1.9, y: 1, label: () => (ensureForestDay(), S.forest.bush[k]) ? '✨ Recolectar fragmento de runa' : '🌿 Arbusto rúnico (vuelve a brillar mañana)',
  act: () => { if (!S.forest.bush[k]) return; S.forest.bush[k] = false; S.inv.fragmento++; if (k >= 3) { S.seeds.calabaza++; G.pop('+1 semilla de calabaza', p[0], 2, p[1], '#ffd8a8'); } act('harvest'); G.sfx('chime'); G.burst(p[0], 1, p[1], 0xc4a7ff, 14); G.pop('+1 ✨', p[0], 1.6, p[1], '#e5dbff'); refreshAll(); } })));
FOREST.logs.forEach((p, k) => INTER.bosque.push(I({ id: 'tronco' + k, kind: 'log', x: p[0], z: p[1], r: 2.0, y: 0.6, live: () => (ensureForestDay(), S.forest.log[k]), label: () => '🪓 Cortar leña (+2 🪵)',
  act: () => { if (!spend(8)) return; S.forest.log[k] = false; S.inv.madera += 2; act('chop', 0.55); G.sfx('chop'); G.shake(0.08); G.burst(p[0], 0.6, p[1], 0xb07a4a, 14); G.pop('+2 🪵', p[0], 1.4, p[1]); refreshAll(); } })));
FOREST.crystals.forEach((p, k) => INTER.bosque.push(I({ id: 'cristal' + k, kind: 'crystal', x: p[0], z: p[1], r: 1.9, y: 1, live: () => (ensureForestDay(), S.forest.crystal[k]), label: () => '⛏ Picar cristal rúnico (+1 💎)',
  act: () => { if (!spend(10)) return; S.forest.crystal[k] = false; S.inv.cristal++; act('hoe', 0.55); G.sfx('mine'); G.burst(p[0], 0.8, p[1], 0x7df9ff, 16); G.pop('+1 💎', p[0], 1.6, p[1], '#a5f3fc'); refreshAll(); } })));
INTER.bosque.push(I({ id: 'santuario', kind: 'shrine', x: FOREST.shrine[0], z: FOREST.shrine[1] + 1.6, r: 1.9, y: 1.6, label: () => `🔮 Santuario: 3 ✨ → semilla arcoíris (tenés ${S.inv.fragmento} ✨)`,
  act: () => { if (S.inv.fragmento < 3) { toast('Juntá 3 fragmentos ✨ en los arbustos rúnicos del bosque'); return; } S.inv.fragmento -= 3; S.seeds.arcoiris++; G.sfx('fanfare'); G.burst(FOREST.shrine[0], 1.6, FOREST.shrine[1], 0xc4a7ff, 24); UI.banner('🔮 SANTUARIO', 'Obtuviste una semilla arcoíris'); } }));
const DYN_SCENES = critters.dyn;

/* ---------- tiendas y paneles ---------- */
function npcHere(id) { const st = critters.npcStatus(id); return !!st && st.spot === 'post'; }
function whereIs(id) { const st = critters.npcStatus(id); if (!st) return ''; return st.spot === 'home' ? 'ya se fue a su casa (vuelve a las 8:00)' : st.spot === 'fuente' ? 'está almorzando en la fuente' : st.spot === 'banco' ? 'descansa en el banco de la plaza' : st.spot === 'deco' ? 'atiende el puesto de decoración' : 'está en su puesto'; }
function openPanel(render) { G.mode = 'dialog'; input.clear(); G.auto = null; UI.openPanel(render, () => { if (G.mode === 'dialog') G.mode = 'play'; flush(); }); }
function buySeed(c, k) {
  const price = D.CROPS[c].seed;
  if (stockOf(c) <= 0) { toast('Agotado: Don Tito repone mañana'); return; }
  if (S.coins < price) { toast(`Te faltan monedas (${price} 🪙)`); return; }
  S.coins -= price; S.stock[c]--; S.seeds[c]++; S.seedSel = c;
  G.sfx('buy'); act('harvest', 0.3);
  const P = MARKET.shelves[k]; G.pop(`+1 semilla ${D.ITEMS[c][1]}`, P[0], 2.2, P[1], '#fff'); refreshAll();
  shelfShake = { k, t: 0.3 };
}
let shelfShake = { k: -1, t: 0 };
function sellRows() {
  const rows = [];
  for (const it of D.SELLABLE) {
    const n = S.inv[it]; if (n <= 0) continue;
    const pr = D.sellPrice(S, it, G.D.price);
    rows.push({ icon: D.ITEMS[it][1], title: `${D.ITEMS[it][0]} ×${n}`, sub: `${pr} 🪙 c/u ${pr > D.BASE_PRICE[it] * G.D.price ? '· ¡buena demanda!' : ''}`, btn: 'Vender 1', id: 'vender_' + it, fn: () => sellOne(it) });
  }
  return rows;
}
function sellOne(it) {
  const pr = D.sellPrice(S, it, G.D.price);
  if (S.inv[it] <= 0) return;
  S.inv[it]--; if (S.sold.day !== S.day) S.sold = { day: S.day, n: {} };
  S.sold.n[it] = (S.sold.n[it] || 0) + 1;
  gainCoins(pr); G.emitLocal('sell', it);
}
function openSell() {
  openPanel(() => {
    const rows = sellRows();
    return { title: '💰 Almacén de Tomás', intro: rows.length ? 'Los precios cambian con la estación y bajan si vendés mucho de lo mismo el mismo día.' : 'No tenés nada para vender todavía. ¡Cosechá y volvé!',
      rows: rows.length ? [{ icon: '🧺', title: 'Vender todo', sub: `≈ ${D.SELLABLE.reduce((a, it) => a + S.inv[it] * D.sellPrice(S, it, G.D.price), 0)} 🪙 (baja un poco por saturación)`, btn: 'Vender todo', id: 'vender_todo', fn: () => { for (const it of D.SELLABLE) while (S.inv[it] > 0) sellOne(it); } }, ...rows] : [],
      foot: `Tenés ${S.coins} 🪙` };
  });
}
function stockShelf() {
  if (S.merchant >= D.MERCHANT_TARGET) { toast('¡La estantería ya está llena! Gracias, dice Tomás'); return; }
  const it = ['nabo', 'zanahoria', 'trigo', 'calabaza', 'harina'].filter(k => S.inv[k] > 0).sort((a, b) => S.inv[b] - S.inv[a])[0];
  if (!it) { toast('Tomás necesita verduras o harina para abastecer su almacén'); return; }
  S.inv[it]--; S.merchant++;
  const pay = Math.round(D.BASE_PRICE[it] * 1.3 * G.D.price);
  gainCoins(pay, MARKET.merchantShelf[0], MARKET.merchantShelf[1]);
  MM.emit('stock'); act('harvest', 0.35); G.sfx('buy'); refreshAll();
  if (S.merchant >= D.MERCHANT_TARGET && !S.flags.merchantDone) { S.flags.merchantDone = true; UI.banner('◆ MISIÓN SECUNDARIA', '¡El almacén de Tomás está abastecido!'); G.sfx('fanfare'); }
}
function openForge() {
  openPanel(() => ({
    title: '🔨 Herrería de Inés', intro: 'Mejorá tus herramientas: la regadera carga más agua, la azada limpia de un golpe y las botas te hacen más rápida.',
    rows: Object.keys(D.TOOLS).map(t => {
      const T = D.TOOLS[t], lv = S.tools[t], next = T.levels[lv + 1];
      if (!next) return { icon: T.icon, title: `${T.name} nivel ${lv + 1} (máximo)`, sub: 'No se puede mejorar más' };
      const cost = `${next.cost} 🪙${next.madera ? ` · ${next.madera} 🪵` : ''}${next.cristal ? ` · ${next.cristal} 💎` : ''}`;
      const ok = S.coins >= next.cost && S.inv.madera >= (next.madera || 0) && S.inv.cristal >= (next.cristal || 0);
      const what = t === 'regadera' ? `capacidad ${next.cap}` : t === 'azada' ? 'limpia de un golpe y gasta menos' : `velocidad ${next.speed}`;
      return { icon: T.icon, title: `${T.name} → nivel ${lv + 2}`, sub: `${what} · ${cost}`, btn: 'Mejorar', ok, id: 'mejorar_' + t, fn: () => {
        S.coins -= next.cost; S.inv.madera -= next.madera || 0; S.inv.cristal -= next.cristal || 0; S.tools[t]++; G.sfx('fanfare'); G.emitLocal('upgrade', t);
        if (t === 'regadera') S.water = Math.min(S.water, D.TOOLS.regadera.levels[S.tools.regadera].cap);
      } };
    }), foot: `Tenés ${S.coins} 🪙 · ${S.inv.madera} 🪵 · ${S.inv.cristal} 💎`,
  }));
}
function openRosa() {
  openPanel(() => ({
    title: '🎀 Puesto de la Abuela Rosa', intro: whereIs('rosa') === 'ya se fue a su casa (vuelve a las 8:00)' ? 'Rosa dejó una cajita para pagar: se puede comprar igual.' : '«¿Viste qué lindo queda un farolito al lado de los surcos?»',
    rows: [
      { icon: '🌿', title: 'Forraje para animales', sub: '5 🪙 · alimenta un animal por día', btn: 'Comprar', ok: S.coins >= 5, id: 'comprar_forraje', fn: () => { S.coins -= 5; S.inv.forraje++; G.sfx('buy'); } },
      ...Object.keys(M.DECOR).map(k => ({ icon: M.DECOR[k].icon, title: M.DECOR[k].name + (S.decorInv[k] ? ` (tenés ${S.decorInv[k]})` : ''), sub: `${M.DECOR[k].price} 🪙${k === 'espantapajaros' ? ' · espanta cuervos cerca de los surcos' : ' · +3% al precio de venta'}`,
        btn: 'Comprar', ok: S.coins >= M.DECOR[k].price, id: 'comprar_' + k, fn: () => { S.coins -= M.DECOR[k].price; S.decorInv[k]++; G.sfx('buy'); G.emitLocal('buyDecor', k); } })),
    ], foot: `Tenés ${S.coins} 🪙 · Los animales para adoptar están en el corralito`,
  }));
}
function openDecor(k) {
  openPanel(() => ({
    title: '🎀 Decorar la granja', intro: 'Las decoraciones suben un 3% tus precios de venta. El espantapájaros protege los surcos cercanos de los cuervos.',
    rows: [
      ...Object.keys(M.DECOR).map(d => ({ icon: M.DECOR[d].icon, title: M.DECOR[d].name, sub: S.decor[k] === d ? 'Colocado acá' : `Tenés ${S.decorInv[d]}`, btn: S.decor[k] === d ? '' : 'Colocar', ok: S.decorInv[d] > 0, id: 'colocar_' + d,
        fn: () => { if (S.decor[k]) S.decorInv[S.decor[k]]++; S.decorInv[d]--; S.decor[k] = d; decorPop[k] = 0.5; G.sfx('happy'); refreshAll(); G.emitLocal('decor', d); } })),
      ...(S.decor[k] ? [{ icon: '📦', title: 'Guardar la decoración', btn: 'Guardar', id: 'guardar', fn: () => { S.decorInv[S.decor[k]]++; S.decor[k] = ''; refreshAll(); } }] : []),
    ],
  }));
}
const decorPop = new Float32Array(4);
function ordersNow() { const want = Math.floor((S.day - 1) / 2); if (S.orders.day !== want || S.orders.list.length !== 3) S.orders = D.makeOrders(S); return S.orders; }
function openOrders() {
  openPanel(() => ({
    title: '📋 Pedidos del pueblo', intro: 'Los pedidos se renuevan cada dos días. Pagan bastante más que el almacén.',
    rows: ordersNow().list.map((o, k) => ({ icon: D.ITEMS[o.item][1], title: `${o.who}: ${o.qty} × ${D.ITEMS[o.item][0]}`, sub: o.done ? '✔ entregado' : `Paga ${o.reward} 🪙 · tenés ${S.inv[o.item]}`, btn: o.done ? '' : 'Entregar', ok: !o.done && S.inv[o.item] >= o.qty, id: 'pedido' + k,
      fn: () => { S.inv[o.item] -= o.qty; o.done = true; S.stats.orders++; gainCoins(o.reward); G.emitLocal('order'); } })),
  }));
}
function openFeria() {
  if (S.feria.done) { toast('¡Ya ganaste la feria! La cinta azul brilla en la carpa'); return; }
  if (!S.huerta.done) { toast('La intendenta Marga sólo acepta canastas de huertas restauradas: terminá «Restaurar la huerta» primero', 3600); return; }
  openPanel(() => ({
    title: '🎪 Feria de Cosechas', intro: 'La intendenta Marga juzga la mejor canasta del pueblo. Entregá todo lo pedido (de a poco también vale).',
    rows: Object.keys(D.FERIA_REQ).map(it => { const need = D.FERIA_REQ[it], got = S.feria.got[it];
      return { icon: D.ITEMS[it][1], title: `${D.ITEMS[it][0]}: ${got}/${need}`, sub: got >= need ? '✔ completo' : `tenés ${S.inv[it]}`, btn: got >= need ? '' : 'Entregar', ok: got < need && S.inv[it] > 0, id: 'feria_' + it,
        fn: () => { const n = Math.min(need - got, S.inv[it]); S.inv[it] -= n; S.feria.got[it] += n; G.sfx('buy'); checkFeria(); } }; }),
  }));
}
function checkFeria() {
  if (S.feria.done) return;
  if (Object.keys(D.FERIA_REQ).every(k => S.feria.got[k] >= D.FERIA_REQ[k])) {
    S.feria.done = true; gainCoins(250); MM.emit('feria'); syncCampaign(); refreshAll();
    S.storm = { state: 'pending', day: S.day + 1, tries: S.storm.tries, best: S.storm.best };
    UI.closePanel();
    UI.banner('★ ¡CINTA AZUL!', 'Ganaste la Feria de Cosechas · +250 🪙', 3600); G.sfx('fanfare');
    setTimeout(() => toast('⛈ Pronóstico: mañana a las 9:00 llega la Estación de Tormentas a tu granja', 4200), 1500);
    flush(); checkVictory();
  }
}
function openGreenhouse() {
  openPanel(() => {
    const got = S.inv3.got, R = D.INV_REQ;
    const row = (k, icon, title, have, fn) => ({ icon, title: `${title}: ${got[k]}/${R[k]}`, sub: got[k] >= R[k] ? '✔ listo' : `tenés ${have}`, btn: got[k] >= R[k] ? '' : 'Aportar', ok: got[k] < R[k] && have > 0, id: 'obra_' + k, fn });
    return { title: '🏗 Invernadero mágico', intro: 'Un invernadero con runas donde las plantas crecen más rápido y ninguna estación ni plaga las alcanza. Le falta la energía de una <b>Runa de tormenta</b>.',
      rows: [
        row('madera', '🪵', 'Madera', S.inv.madera, () => { const n = Math.min(R.madera - got.madera, S.inv.madera); S.inv.madera -= n; got.madera += n; G.sfx('chop'); afterBuild(); }),
        row('cristal', '💎', 'Cristal rúnico', S.inv.cristal, () => { const n = Math.min(R.cristal - got.cristal, S.inv.cristal); S.inv.cristal -= n; got.cristal += n; G.sfx('mine'); afterBuild(); }),
        row('monedas', '🪙', 'Monedas', S.coins, () => { const n = Math.min(R.monedas - got.monedas, S.coins); S.coins -= n; got.monedas += n; G.sfx('coin'); afterBuild(); }),
        { ...row('runa', '🌀', 'Runa de tormenta', S.inv.runa, () => { S.inv.runa--; got.runa = 1; G.sfx('chime'); afterBuild(); }), sub: got.runa >= 1 ? '✔ lista' : S.inv.runa ? 'tenés 1' : S.storm.state === 'none' ? 'se consigue al sobrevivir la Estación de Tormentas (llega después de la feria)' : S.storm.state === 'pending' ? `la tormenta llega el día ${S.storm.day} a las 9:00` : 'tenés 0' },
      ] };
  });
}
function afterBuild() {
  const got = S.inv3.got, R = D.INV_REQ;
  refreshAll();
  if (!S.inv3.done && Object.keys(R).every(k => got[k] >= R[k])) {
    S.inv3.done = true; refreshAll(); MM.emit('invernadero'); syncCampaign();
    UI.closePanel();
    UI.banner('★ MISIÓN PRINCIPAL', '¡Invernadero mágico construido!', 3600); G.sfx('fanfare');
    G.burst(-6, 3, -12, 0x7df9ff, 40);
    flush(); checkVictory();
  }
}
function millAct() {
  if (!S.mill) {
    const R = D.MILL_REQ;
    if (S.inv.madera < R.madera || S.inv.cristal < R.cristal || S.coins < R.monedas) { toast(`Para reparar el molino: ${R.madera} 🪵, ${R.cristal} 💎 y ${R.monedas} 🪙 (tenés ${S.inv.madera} 🪵, ${S.inv.cristal} 💎, ${S.coins} 🪙)`, 3200); return; }
    S.inv.madera -= R.madera; S.inv.cristal -= R.cristal; S.coins -= R.monedas; S.mill = true;
    act('hoe', 0.6); G.sfx('fanfare'); G.burst(-15, 4, -10.5, 0xfff3bf, 20); refreshAll();
    if (!S.flags.millDone) { S.flags.millDone = true; MM.emit('mill'); UI.banner('◆ MISIÓN SECUNDARIA', '¡El molino vuelve a girar! Ahora podés moler trigo'); }
    flush(); return;
  }
  if (S.inv.trigo <= 0) { toast('Traé trigo 🌾 para moler harina (vale mucho más)'); return; }
  S.inv.trigo--; S.inv.harina++; act('harvest', 0.4); G.sfx('buy'); G.pop('+1 🥖 harina', -15, 2.5, -10, '#fff3bf');
}
function openHouse() {
  if (S.min >= D.SLEEP_FROM) { sleep(); return; }
  openPanel(() => ({
    title: '🏠 Tu casa', intro: `Energía ${Math.round(S.energy)}/100. Podés dormir desde las 18:00 (son las ${D.clock(S.min)}).`,
    rows: [...foodRows(), { icon: '🛏', title: 'Dormir', sub: 'Disponible desde las 18:00', btn: 'Dormir', ok: false }],
  }));
}
function foodRows() {
  const F = [['nabo', 15], ['zanahoria', 20], ['huevo', 18], ['leche', 22], ['calabaza', 45]];
  return F.map(([it, e]) => ({ icon: D.ITEMS[it][1], title: `Comer ${D.ITEMS[it][0].toLowerCase()} (+${e} ⚡)`, sub: `tenés ${S.inv[it]}`, btn: 'Comer', ok: S.inv[it] > 0 && S.energy < 100, id: 'comer_' + it,
    fn: () => { S.inv[it]--; S.energy = Math.min(100, S.energy + Number(e)); G.sfx('happy'); } }));
}
function talk(n) {
  const h = S.min / 60;
  const lines = {
    tito: h < 12 ? '«¡Buen día, piba! Las semillas están en los estantes; dejá las monedas en la cajita.»' : '«La calabaza pide paciencia, pero en otoño crece que da gusto.»',
    ines: '«¿Esa regadera chiquita todavía? Traeme cristal rúnico del bosque y te la agrando.»',
    rosa: S.animals.gallina.own ? '«¿Cómo anda Pochi? Un poco de forraje por día y te deja un huevito.»' : '«Pochi necesita un hogar. ¿Te la llevás? Te va a dar huevos para la feria.»',
    tomas: S.merchant < D.MERCHANT_TARGET ? `«Tengo la estantería vacía (${S.merchant}/${D.MERCHANT_TARGET}). Si me traés verduras te las pago bien.»` : '«¡Gracias a vos tengo el almacén lleno!»',
  };
  G.sfx('ui');
  if (n.id === 'tomas') { openSell(); return toast(lines.tomas, 3000); }
  if (n.id === 'ines') { openForge(); return toast(lines.ines, 3000); }
  if (n.id === 'rosa') { openRosa(); return toast(lines.rosa, 3000); }
  openPanel(() => ({ title: `💬 ${n.name}`, intro: lines.tito, rows: ['nabo', 'zanahoria', 'trigo', 'calabaza'].map((c, k) => ({ icon: D.ITEMS[c][1], title: `Semillas de ${D.CROPS[c].name}`, sub: `${D.CROPS[c].seed} 🪙 · quedan ${stockOf(c)}`, btn: 'Comprar', ok: stockOf(c) > 0 && S.coins >= D.CROPS[c].seed, fn: () => buySeed(c, k) })) }));
}

/* ---------- diario ---------- */
function mainMissions() {
  const f = S.feria.got, R = D.FERIA_REQ, b = S.inv3.got, IR = D.INV_REQ;
  return [
    { id: 'huerta', title: 'Restaurar la huerta', done: S.huerta.done, sub: `Limpiá parcelas ${Math.min(6, S.huerta.cleared)}/6 · Cosechá ${Math.min(4, S.huerta.harvested)}/4` },
    { id: 'feria', title: 'Completar la Feria de Cosechas', done: S.feria.done, sub: (S.huerta.done ? '' : 'Después de la huerta · ') + Object.keys(R).map(k => `${D.ITEMS[k][1]} ${f[k]}/${R[k]}`).join(' · ') + ' (carpa del mercado)' },
    { id: 'invernadero', title: 'Construir el invernadero mágico', done: S.inv3.done, sub: `🪵 ${b.madera}/${IR.madera} · 💎 ${b.cristal}/${IR.cristal} · 🪙 ${b.monedas}/${IR.monedas} · 🌀 ${b.runa}/1` },
  ];
}
function sideMissions() {
  const own = Object.values(S.animals).filter(a => a.own).length;
  return [
    { id: 'animales', title: 'Adoptar tres animales', done: S.flags.animalsDone, sub: `${own}/3 · gallina y oveja en el refugio, la cabrita está perdida en el bosque` },
    { id: 'arcoiris', title: 'Cultivar la flor arcoíris', done: S.flags.rainbow, sub: '3 ✨ en el santuario del bosque → semilla; se riega sólo con rocío de espíritu' },
    { id: 'molino', title: 'Reparar el molino', done: S.flags.millDone, sub: `${D.MILL_REQ.madera} 🪵 · ${D.MILL_REQ.cristal} 💎 · ${D.MILL_REQ.monedas} 🪙` },
    { id: 'mercader', title: 'Abastecer el almacén de Tomás', done: S.flags.merchantDone, sub: `${S.merchant}/${D.MERCHANT_TARGET} productos` },
  ];
}
function openDiary() {
  openPanel(() => {
    const inv = Object.keys(D.ITEMS).filter(k => S.inv[k] > 0).map(k => `${D.ITEMS[k][1]} ${S.inv[k]}`).join(' · ') || 'vacío';
    const seeds = D.SEED_ORDER.filter(k => S.seeds[k] > 0).map(k => `${D.ITEMS[k][1]} ${S.seeds[k]}`).join(' · ') || 'sin semillas';
    const se = D.SEASONS[D.seasonOf(S.day)];
    return { title: '📖 Diario de la granja', intro: `Día ${S.day} · ${se.icon} ${se.name} · ${D.clock(S.min)} · ${isRain() ? '🌧 hoy llueve (riega solo)' : '☀️ sin lluvia'}${S.storm.state === 'pending' ? ` · ⛈ tormenta el día ${S.storm.day}` : ''}`,
      rows: [
        ...mainMissions().map(m => ({ icon: m.done ? '✅' : '★', title: m.title, sub: m.sub, tag: m.done ? 'done' : 'main' })),
        ...sideMissions().map(m => ({ icon: m.done ? '✅' : '◆', title: m.title, sub: m.sub, tag: m.done ? 'done' : '' })),
        { icon: '🎒', title: 'Mochila', sub: inv }, { icon: '🌱', title: 'Semillas', sub: seeds },
        { icon: '🔧', title: 'Herramientas', sub: Object.keys(D.TOOLS).map(t => `${D.TOOLS[t].icon} ${D.TOOLS[t].name} nv ${S.tools[t] + 1}`).join(' · ') },
        ...foodRows().filter(r => S.inv[r.id.slice(6)] > 0),
      ], foot: `Puntaje de granja: ${D.scoreOf(S)} · Récord: ${SDK.scores.best(D.GAME_ID) ?? 0}` };
  });
}
/* ---------- controles configurables ---------- */
const KEYLBL = { usar: 'Usar / interactuar', semilla: 'Cambiar semilla', camIzq: 'Girar cámara ←', camDer: 'Girar cámara →', diario: 'Diario' };
const keyName = c => c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : ({ Space: 'Espacio', Tab: 'Tab', Enter: 'Enter', Comma: ',', Period: '.', ShiftLeft: 'Shift' })[c] || c;
let rebinding = '';
function openControls(fromMenu = false) {
  const render = () => ({ title: '⌨ Controles', intro: 'Tocá «Cambiar» y apretá la tecla nueva. Siempre funcionan también: Espacio (usar), Tab (semilla), , y . (cámara), I (diario), WASD/flechas.',
    rows: Object.keys(KEYLBL).map(k => ({ icon: '⌨', title: KEYLBL[k], sub: rebinding === k ? 'Apretá una tecla…' : `Tecla: ${keyName(S.keys[k])}`, btn: rebinding === k ? 'Esperando…' : 'Cambiar', id: 'tecla_' + k, fn: () => { rebinding = k; } }))
      .concat([{ icon: '🎥', title: 'Sensibilidad de cámara', sub: `${({ 0.6: 'Baja (giro de 27°)', 1: 'Media (giro de 45°)', 1.5: 'Alta (giro de 68°)' })[S.sens]}`, btn: 'Cambiar', id: 'sensibilidad', fn: () => { S.sens = S.sens === 0.6 ? 1 : S.sens === 1 ? 1.5 : 0.6; flush(); } },
        { icon: '↺', title: 'Restaurar teclas por defecto', btn: 'Restaurar', id: 'teclas_def', fn: () => { S.keys = { ...D.defaults().keys }; flush(); } }]) });
  if (fromMenu) { UI.openPanel(render, () => { rebinding = ''; flush(); }); return; }
  openPanel(render);
}
addEventListener('keydown', e => {
  if (rebinding) {
    if (e.code === 'Escape') { rebinding = ''; UI.renderPanel(); return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyP'].includes(e.code)) { toast('Esa tecla ya se usa para moverse o pausar'); return; }
    e.preventDefault(); e.stopPropagation();
    for (const k of Object.keys(S.keys)) if (S.keys[k] === e.code) S.keys[k] = S.keys[rebinding];
    S.keys[rebinding] = e.code; rebinding = ''; flush(); UI.renderPanel();
    return;
  }
  if (e.code === 'Tab' && (G.mode === 'play')) e.preventDefault();
}, true);

/* ======================= escenas y transición ======================= */
const SCENE_YAW = { granja: 0, mercado: Math.PI, bosque: Math.PI / 2 };
function setScene(name, spawnKey) {
  for (const k of Object.keys(G.scenes)) G.scenes[k].group.visible = k === name;
  G.sceneName = name; G.scene = G.scenes[name]; S.scene = name;
  const sp = G.scene.spawn[spawnKey] || G.scene.spawn.inicio;
  if (spawnKey !== 'keep') { G.player.x = sp[0]; G.player.z = sp[1]; }
  G.cam.yaw = G.cam.yawT = SCENE_YAW[name];
  G.player.yaw = G.cam.yaw + Math.PI;
  G.focus = null; G.auto = null; G.moveTo = null;
  focusRing.visible = false; walkMark.visible = false;
  if (name === 'granja') critters.placeAnimals();
  applyFog(); applyTime(); snapCam();
  UI.clearPops();
  G.emitLocal('scene', name);
}
function goScene(to) {
  if (G.trans) return;
  G.trans = { to, from: G.sceneName, t: 0 };
  G.mode = 'transition'; UI.fade(true, REDUCED);
}
function tickTransition(dt) {
  const tr = G.trans; tr.t += dt;
  if (tr.t >= (REDUCED ? 0 : 0.35) && !tr.swapped) {
    tr.swapped = true; setScene(tr.to, tr.from); flush(); UI.fade(false, REDUCED);
    UI.banner('', G.scene.title, 1600);
    if (tr.to === 'bosque') tip('bosque', 'En el bosque: fragmentos ✨ en arbustos brillantes, leña 🪵, cristal 💎 y una cabrita perdida…');
    if (tr.to === 'mercado') tip('mercado', 'Mercado: semillas en los estantes de Don Tito, venta en el almacén de Tomás, pedidos en el tablero y la feria en la carpa.');
  }
  if (tr.t >= (REDUCED ? 0.05 : 0.7)) { G.trans = null; G.mode = 'play'; }
}
const tipsShown = new Set();
function tip(k, text) { if (tipsShown.has(k) || !S.tutorial.done) return; tipsShown.add(k); setTimeout(() => toast(text, 4200), 900); }

/* ======================= cámara ======================= */
const _v = new THREE.Vector3();
function camDist() { return (innerWidth < innerHeight ? 15.5 : 12.5) * (storm.S.active ? 1.12 : 1); }
const camH = () => (storm.S.active ? 0.6 : 0.78);
function snapCam() { const d = camDist(); G.cam.x = G.player.x + Math.sin(G.cam.yaw) * d; G.cam.z = G.player.z + Math.cos(G.cam.yaw) * d; G.cam.y = d * camH(); }
function updateCam(dt) {
  G.cam.yaw += (G.cam.yawT - G.cam.yaw) * Math.min(1, dt * 6 * S.sens);
  const d = camDist(), tx = G.player.x + Math.sin(G.cam.yaw) * d, tz = G.player.z + Math.cos(G.cam.yaw) * d, ty = d * camH();
  const k = Math.min(1, dt * 5);
  G.cam.x += (tx - G.cam.x) * k; G.cam.z += (tz - G.cam.z) * k; G.cam.y += (ty - G.cam.y) * k;
  G.cam.shake = Math.max(0, G.cam.shake - dt);
}
function applyCam() {
  const o = G.camOverride;
  if (o) { camera.position.set(o.x, o.y, o.z); camera.lookAt(o.lx, o.ly, o.lz); return; }
  const sh = G.cam.shake > 0 ? G.cam.shake * 0.6 : 0;
  camera.position.set(G.cam.x + (sh ? Math.sin(G.t * 60) * sh : 0), G.cam.y, G.cam.z + (sh ? Math.cos(G.t * 53) * sh : 0));
  camera.lookAt(G.player.x, 1.2, G.player.z);
}

/* ======================= entrada: tocar/clic para ir y usar ======================= */
let pd = null;
g.root.addEventListener('pointerdown', e => { pd = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
g.root.addEventListener('pointerup', e => {
  if (!pd || pd.id !== e.pointerId) return;
  const moved = Math.hypot(e.clientX - pd.x, e.clientY - pd.y), dt = performance.now() - pd.t; pd = null;
  if (moved < 14 && dt < 600) tapAt(e.clientX, e.clientY, e.pointerType === 'touch');
});
const raycaster = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
function tapAt(cx, cy, touch) {
  if (G.mode !== 'play') return;
  const w = innerWidth, h = innerHeight;
  let best = null, bd = touch ? 60 : 44;
  for (const it of liveInteractables()) {
    _v.set(it.x, it.y, it.z).project(camera);
    if (_v.z > 1) continue;
    const sx = (_v.x + 1) / 2 * w, sy = (1 - _v.y) / 2 * h, d = Math.hypot(sx - cx, sy - cy);
    if (d < bd) { bd = d; best = it; }
  }
  if (best) { G.auto = best; G.moveTo = null; walkMark.visible = false; return; }
  ndc.set(cx / w * 2 - 1, -(cy / h) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(plane, hit)) {
    const b = G.scene.bounds;
    G.moveTo = { x: clamp(hit.x, b.x0, b.x1), z: clamp(hit.z, b.z0, b.z1) }; G.auto = null;
    walkMark.position.set(G.moveTo.x, 0.05, G.moveTo.z); walkMark.visible = true;
  }
}
const liveBuf = [];
function liveInteractables() {
  liveBuf.length = 0;
  for (const it of INTER[G.sceneName]) if (it.live()) liveBuf.push(it);
  for (const it of DYN_SCENES) if (it.scene === G.sceneName && it.live()) liveBuf.push(it);
  return liveBuf;
}

/* ======================= bucle ======================= */
let focusTick = 0, saveT = 0, idleT = 0, lastPX = 0, lastPZ = 0, stuckT = 0, stormWarnT = 0;
function update(dt) {
  G.t += dt;
  if (G.mode === 'transition') { tickTransition(dt); input.endStep(); return; }
  if (G.mode !== 'play' && G.mode !== 'cutscene') { input.endStep(); return; }
  const P = G.player;
  if (G.mode === 'play') {
    // tiempo de juego
    const dMin = dt * D.MIN_PER_SEC * (storm.S.active ? 0.25 : 1);
    S.min += dMin;
    growPlots(dMin);
    if (S.min >= D.DAY_END) { passOut(); input.endStep(); return; }
    // tormenta programada
    if (S.storm.state === 'pending' && !storm.S.active && S.day >= S.storm.day && S.min >= 540) {
      if (G.sceneName === 'granja') { storm.start(); input.endStep(); return; }
      stormWarnT -= dt; if (stormWarnT <= 0) { stormWarnT = 25; toast('⛈ ¡La Estación de Tormentas llegó a tu granja! Volvé a rescatar la cosecha', 3600); }
    }
    playerControl(dt);
    // enfoque (cada 6 pasos)
    if (++focusTick % 6 === 0) pickFocus();
    // acciones
    const usePressed = input.hit(S.keys.usar, 'Space', 'Enter', 'btn:act');
    const useHeld = input.down(S.keys.usar) || input.down('Space') || input.button('act');
    if (G.focus && G.focus.hold) {
      if ((useHeld || G.auto === G.focus) && P.stun <= 0 && G.focus.live()) { G.focus.holdTick(dt); act('calm', 0.1); }
    } else if (usePressed && G.focus) { G.queued = G.focus; G.queuedT = 0.8; }
    // la acción se encola si la animación anterior no terminó (no se pierden toques)
    if (G.queued) { G.queuedT -= dt; if (G.queuedT <= 0 || G.queued !== G.focus) G.queued = null; else if (P.actT <= 0 && P.stun <= 0) { const it = G.queued; G.queued = null; doAct(it); } }
    if (input.hit(S.keys.semilla, 'Tab', 'btn:seed')) cycleSeed(1);
    for (let k = 1; k <= 5; k++) if (input.hit('Digit' + k)) selectSeed(D.SEED_ORDER[k - 1]);
    if (input.hit(S.keys.camIzq, 'Comma')) G.cam.yawT -= Math.PI / 4 * S.sens;
    if (input.hit(S.keys.camDer, 'Period', 'btn:cam')) G.cam.yawT += Math.PI / 4 * S.sens;
    if (input.hit(S.keys.diario, 'KeyI', 'btn:diary')) { input.endStep(); openDiary(); return; }
    // salidas
    if (!storm.S.active) for (const ex of G.scene.exits) if (Math.hypot(P.x - ex.x, P.z - ex.z) < ex.r) { goScene(ex.to); break; }
    music(dt);
    saveT += dt; if (saveT > 15) { saveT = 0; S.px = P.x; S.pz = P.z; flush(); }
  }
  critters.update(dt, G.t);
  storm.update(dt, G.t);
  if (storm.S.active && storm.S.stun > 0) P.stun = Math.max(P.stun, storm.S.stun);
  updateParticles(dt);
  updateRain(dt, isRain() || storm.S.active, storm.S.active ? (storm.S.phase === 1 ? 2.5 : 1) : 0.3);
  animate(dt);
  updateCam(dt);
  tutTick(dt);
  input.endStep();
}

function playerControl(dt) {
  const P = G.player;
  P.stun = Math.max(0, P.stun - dt);
  P.actT = Math.max(0, P.actT - dt);
  let ax = 0, az = 0;
  const a = input.axis();
  if (P.stun <= 0 && P.actT <= 0) {
    if (a.x || a.y) { G.auto = null; G.moveTo = null; walkMark.visible = false; }
    const yaw = G.cam.yaw;
    // adelante = alejarse de la cámara
    ax = Math.cos(yaw) * a.x + Math.sin(yaw) * a.y; az = -Math.sin(yaw) * a.x + Math.cos(yaw) * a.y;
    // ir hasta un objetivo tocado
    const tgt = G.auto ? { x: G.auto.x, z: G.auto.z, r: G.auto.r - 0.35 } : G.moveTo ? { x: G.moveTo.x, z: G.moveTo.z, r: 0.25 } : null;
    if (tgt && !(a.x || a.y)) {
      const dx = tgt.x - P.x, dz = tgt.z - P.z, d = Math.hypot(dx, dz);
      if (d <= Math.max(0.3, tgt.r)) {
        if (G.auto) { const it = G.auto; P.yaw = Math.atan2(dx, dz); G.focus = it; if (!it.hold) { G.auto = null; if (it.live()) doAct(it); } else if (!it.live()) G.auto = null; }
        else { G.moveTo = null; walkMark.visible = false; }
      } else { ax = dx / d; az = dz / d; }
      // atascada contra algo: desistir
      stuckT = Math.hypot(P.x - lastPX, P.z - lastPZ) < dt * 0.5 && (ax || az) ? stuckT + dt : 0;
      if (stuckT > 1.2) { G.auto = null; G.moveTo = null; walkMark.visible = false; stuckT = 0; }
    }
  }
  lastPX = P.x; lastPZ = P.z;
  const l = Math.hypot(ax, az);
  const speed = D.TOOLS.botas.levels[S.tools.botas].speed * (S.energy < 15 ? 0.75 : 1) * (storm.S.active && storm.S.phase === 2 && storm.S.flood > 0.5 ? 0.8 : 1);
  if (l > 0.05) {
    const s = Math.min(1, l);
    P.x += ax / l * s * speed * dt; P.z += az / l * s * speed * dt;
    const ty = Math.atan2(ax, az); let dy = ty - P.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    P.yaw += dy * Math.min(1, dt * 12);
    P.walk += dt * speed * 2.2; P.speed = s; P.moved += s * speed * dt;
  } else P.speed = 0;
  // empuje del viento en fase 1
  if (storm.S.active && storm.S.phase === 1 && storm.S.gust.tele) P.x += Math.sin(G.t * 3) * dt * 0.4;
  // colisiones
  for (const c of G.scene.colliders) {
    const dx = P.x - c.x, dz = P.z - c.z, rr = c.r + 0.42, d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; P.x += dx * k; P.z += dz * k; }
  }
  const b = G.scene.bounds;
  P.x = clamp(P.x, b.x0 + 0.45, b.x1 - 0.45); P.z = clamp(P.z, b.z0 + 0.45, b.z1 - 0.45);
}

function pickFocus() {
  const P = G.player, fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  let best = null, bs = 1e9;
  for (const it of liveInteractables()) {
    const dx = it.x - P.x, dz = it.z - P.z, d = Math.hypot(dx, dz);
    if (d > it.r) continue;
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    const sc = d - dot * 0.9;
    if (sc < bs) { bs = sc; best = it; }
  }
  if (G.auto && G.auto.live() && Math.hypot(G.auto.x - P.x, G.auto.z - P.z) <= G.auto.r) best = G.auto;
  G.focus = best;
  G.focusLabel = best ? best.label() : '';
  if (best && !G.focusLabel) { G.focus = null; }
}
function doAct(it) {
  if (!it || !it.live()) return;
  const P = G.player; P.yaw = Math.atan2(it.x - P.x, it.z - P.z);
  it.act();
  G.focusLabel = it.label ? it.label() : '';
  G.emitLocal('act', it.id);
}
function cycleSeed(dir) {
  const own = D.SEED_ORDER.filter(k => S.seeds[k] > 0);
  const list = own.length ? own : D.SEED_ORDER;
  const i = list.indexOf(S.seedSel);
  S.seedSel = list[(i + dir + list.length) % list.length];
  G.sfx('ui'); tutEvent('seed');
}
function selectSeed(k) { if (k) { S.seedSel = k; G.sfx('ui'); } }

/* ---------- animación de personajes y objetos ---------- */
function animate(dt) {
  const P = G.player, h = hero;
  h.group.position.set(P.x, 0, P.z); h.group.rotation.y = P.yaw;
  heroShadow.position.set(P.x, 0.03, P.z);
  const sw = P.speed > 0 ? Math.sin(P.walk * 2.4) * 0.7 * P.speed : 0;
  h.legs[0].rotation.x = sw; h.legs[1].rotation.x = -sw;
  h.arms[0].rotation.x = -sw * 0.8; h.arms[0].rotation.z = 0;
  let armR = sw * 0.8, bodyY = P.speed > 0 ? Math.abs(Math.sin(P.walk * 2.4)) * 0.06 : 0, armRz = 0;
  for (const k of Object.keys(tools)) tools[k].visible = false;
  if (P.actT > 0) {
    const k = P.actT;
    if (P.action === 'hoe' || P.action === 'chop') { const ph = 1 - k / 0.55; armR = -2.6 + ph * 3.2; (P.action === 'hoe' ? tools.hoe : tools.axe).visible = true; }
    else if (P.action === 'water') { armR = -1.25; tools.can.visible = true; tools.can.rotation.z = -0.6 - Math.sin(G.t * 12) * 0.1; }
    else if (P.action === 'calm') { armR = -2.7; h.arms[0].rotation.x = -2.7; }
    else { armR = -1.1; h.arms[0].rotation.x = -1.1; bodyY = -0.12; if (P.action === 'harvest') tools.basket.visible = true; }
  }
  if (P.stun > 0) { armRz = Math.sin(G.t * 20) * 0.4; h.group.rotation.y = P.yaw + Math.sin(G.t * 14) * 0.3; }
  h.arms[1].rotation.x = armR; h.arms[1].rotation.z = armRz;
  h.group.position.y = bodyY;
  // rebote de cultivos
  for (let i = 0; i < bounce.length; i++) {
    const c = FA.crop[i];
    if (bounce[i] > 0) { bounce[i] = Math.max(0, bounce[i] - dt); const s = 1 + Math.sin(bounce[i] * 18) * bounce[i] * 0.8; c.scale.x = c.scale.z = s; }
    else if (c.visible) { c.rotation.y = Math.sin(G.t * 1.3 + i) * 0.08; }
  }
  for (let k = 0; k < 4; k++) if (decorPop[k] > 0) { decorPop[k] = Math.max(0, decorPop[k] - dt); FA.decorSlots[k].scale.setScalar(1 + Math.sin(decorPop[k] * 14) * decorPop[k]); }
  if (shelfShake.t > 0) { shelfShake.t -= dt; const s = MA.sacks[shelfShake.k]; s.position.y = Math.abs(Math.sin(shelfShake.t * 30)) * 0.05; }
  // anillo de enfoque
  if (G.focus && G.mode === 'play') { focusRing.visible = true; focusRing.position.set(G.focus.x, 0.06, G.focus.z); const s = 1 + Math.sin(G.t * 6) * 0.08; focusRing.scale.setScalar(s * (G.focus.kind === 'plot' ? 1.25 : 1)); }
  else focusRing.visible = false;
  if (walkMark.visible) walkMark.scale.setScalar(1 + Math.sin(G.t * 8) * 0.15);
  // escena
  G.scene.anim(G.t, dt, nightK());
  // nubes
  const cd = clouds.userData.c, o = clouds.userData.o;
  for (let i = 0; i < cd.length; i++) { const c = cd[i]; c[0] += dt * c[3]; if (c[0] > 100) c[0] = -100; o.position.set(c[0], c[1], c[2]); o.scale.setScalar(c[3] * 1.6); o.updateMatrix(); clouds.setMatrixAt(i, o.matrix); }
  clouds.instanceMatrix.needsUpdate = true;
  applyTime();
}

/* ---------- render: HUD y textos flotantes ---------- */
let hudT = 0, lastRender = performance.now();
const _p = new THREE.Vector3();
const projectFn = (x, y, z) => { _p.set(x, y, z).project(camera); return { sx: (_p.x + 1) / 2 * innerWidth, sy: (1 - _p.y) / 2 * innerHeight, vis: _p.z < 1 }; };
function render() {
  const now = performance.now(), rdt = Math.min(0.1, (now - lastRender) / 1000); lastRender = now;
  if (G.mode === 'menu' || G.mode === 'loading') {
    const t = now / 1000 * 0.06;
    camera.position.set(-4 + Math.sin(t) * 24, 13, 2 + Math.cos(t) * 24); camera.lookAt(-4, 0, -2);
    return;
  }
  applyCam();
  UI.updatePops(projectFn, rdt);
  if (now - hudT > 120) { hudT = now; updateHUD(); }
}
const hasTouch = input.isTouch;
function updateHUD() {
  const se = D.SEASONS[D.seasonOf(S.day)];
  UI.setText('hDay', `Día ${S.day} · ${se.icon} ${se.name}`);
  UI.setText('hClock', `${S.min >= 1110 ? '🌙' : '☀️'} ${D.clock(S.min)}${isRain() ? ' 🌧' : ''}`);
  UI.setText('hCoins', `🪙 ${S.coins}`);
  UI.setText('hWater', `💧 ${S.water}/${D.TOOLS.regadera.levels[S.tools.regadera].cap}`);
  const sd = S.seedSel;
  UI.setText('hSeed', `${D.ITEMS[sd][1]} ${D.CROPS[sd].name} ×${S.seeds[sd]}`);
  const e = $('hEnergy'); e.style.width = `${Math.round(S.energy)}%`; e.classList.toggle('low', S.energy < 25);
  UI.setText('hEnTx', `⚡ ${Math.round(S.energy)}`);
  // misión y tutorial siempre debajo de la placa de estado (su alto cambia según el ancho)
  const top = Math.round($('stat').getBoundingClientRect().bottom + 6) + 'px';
  if ($('quest').style.top !== top) { $('quest').style.top = top; $('coach').style.top = top; }
  // misión actual
  const main = mainMissions().find(m => !m.done);
  const side = sideMissions().filter(m => m.done).length;
  const stormNote = S.storm.state === 'pending' ? `<div class="qs">⛈ Tormenta: día ${S.storm.day} a las 9:00</div>` : '';
  UI.setHTML('quest', main ? `<div class="qk">★ MISIÓN</div><b>${UI.esc(main.title)}</b><div class="qs">${UI.esc(main.sub)}</div>${stormNote}<div class="qs">◆ Secundarias ${side}/4 · 📖 diario</div>`
    : `<div class="qk">★ ¡GRANJA COMPLETA!</div><b>Seguí cultivando a tu ritmo</b><div class="qs">◆ Secundarias ${side}/4</div>`);
  UI.show('quest', !storm.S.active && !(!S.tutorial.done && G.mode === 'play'));
  // indicación de interacción
  let pr = '';
  if (G.focus && G.focusLabel && (G.mode === 'play')) {
    const k = hasTouch ? 'USAR' : keyName(S.keys.usar);
    pr = `<span class="key">${k}</span> ${UI.esc(G.focusLabel)}`;
    if (G.focus.hold) pr += `<span class="hold"><i style="width:${Math.round((G.focus.holdLevel() || 0) * 100)}%"></i></span>`;
  } else if (G.mode === 'play') {
    for (const ex of G.scene.exits) if (Math.hypot(G.player.x - ex.x, G.player.z - ex.z) < 6) { pr = `➜ ${UI.esc(ex.label)}`; break; }
  }
  UI.setHTML('prompt', pr); UI.show('prompt', !!pr);
  // tormenta
  if (storm.S.active && storm.S.phase > 0) {
    const st = storm.stats();
    const ph = st.phase >= 4 ? 'La tormenta se aleja…' : `Fase ${st.phase}/3 · ${storm.PHASES[st.phase]}`;
    UI.setText('sTitle', `⛈ ${ph}`);
    const info = st.phase === 1 ? `Lonas: ${st.tarps} · Ráfaga ${Math.min(st.gust + 1, st.gusts)}/${st.gusts}` : st.phase === 2 ? `Agua ${Math.round(st.flood * 100)}% · Compuertas ${st.gates.filter(Boolean).length}/2 · Pararrayos ${st.rods.filter(r => r > 0).length}/3` : st.phase === 3 ? (st.showing ? 'Escuchá la melodía…' : `Melodía ${st.input}/${st.seqLen}`) : '';
    UI.setText('sInfo', `🌾 A salvo ${st.alive}/${st.atRisk} · ${info}`);
    $('sBar').style.width = `${st.atRisk ? Math.round(st.alive / st.atRisk * 100) : 100}%`;
    $('sBar').classList.toggle('low', st.atRisk > 0 && st.alive / st.atRisk < G.D.rescue);
  }
  UI.show('stormHud', storm.S.active && storm.S.phase > 0);
}

/* ======================= días, sueño y desmayo ======================= */
function newDay(opts = {}) {
  S.day++; S.min = opts.min ?? D.DAY_START; S.energy = opts.energy ?? 100;
  for (const k of Object.keys(S.animals)) { const a = S.animals[k]; if (a.own && a.fed) { a.ready = true; } a.fed = false; }
  ensureForestDay(); stockOf('nabo'); ordersNow();
  critters.reset();
  setScene(opts.scene || 'granja', opts.spawn || 'casa');
  refreshAll();
  const se = D.SEASONS[D.seasonOf(S.day)];
  if ((S.day - 1) % D.DAYS_PER_SEASON === 0) UI.banner('NUEVA ESTACIÓN', `${se.icon} ${se.name}`, 2600);
  else UI.banner(`DÍA ${S.day}`, `${se.icon} ${se.name}${isRain() ? ' · 🌧 lluvia' : ''}`, 2000);
  if (S.storm.state === 'pending' && S.storm.day === S.day) setTimeout(() => toast('⛈ Hoy a las 9:00 llega la Estación de Tormentas. ¡Preparate en la granja!', 4000), 1200);
  S.px = G.player.x; S.pz = G.player.z;
  flush(); dawn = JSON.stringify(S);
  G.emitLocal('day', S.day);
}
function sleep() {
  G.sfx('sleep');
  UI.fade(true, REDUCED); G.mode = 'transition'; G.trans = { to: 'granja', from: 'casa', t: 0, swapped: true };
  newDay();
  setTimeout(() => UI.fade(false, REDUCED), REDUCED ? 0 : 450);
  toast('Dormiste como un tronco. ⚡ Energía al máximo');
}
function passOut() {
  const lost = Math.floor(S.coins * 0.05);
  S.coins -= lost;
  newDay({ energy: 80 });
  toast(`Se hizo muy tarde y te quedaste dormida en el camino (−${lost} 🪙). Acordate de dormir en casa.`, 4200);
}
function faint() {
  if (G.mode === 'end') return;
  const lost = Math.floor(S.coins * 0.1);
  S.coins -= lost; S.stats.faints++;
  G.endKind = 'faint'; G.mode = 'end'; UI.hideBanner();
  input.clear();
  endScreen.show(`<span class="k3-kicker">SIN ENERGÍA</span><h1>¡Te desmayaste!</h1>
    <p>Trabajaste de más. La Abuela Rosa te encontró y te llevó a tu casa. Perdiste <b>${lost} 🪙</b> en el camino, pero tu granja sigue intacta.</p>
    <p class="gr-small">Mañana arrancás con 70 de energía. Tip: comé algo desde el 📖 diario o en tu casa.</p>
    <div class="k3-btnrow"><button class="k3-b" data-cont>Seguir al día siguiente</button><button class="k3-b alt" data-menu>Menú</button></div>`);
  flush();
}
function onStormEnd(r) {
  G.endKind = r.win ? 'stormWin' : 'stormLoss'; G.mode = 'end'; UI.hideBanner();
  input.clear();
  applyFog();
  if (r.win) {
    endScreen.show(`<span class="k3-kicker">ESTACIÓN DE TORMENTAS SUPERADA</span><h1>¡Cosecha rescatada!</h1>
      <p>Salvaste <b>${r.saved} de ${r.total}</b> cultivos. El pueblo te regaló <b>${r.coins} 🪙</b> y la <b>🌀 Runa de tormenta</b> que necesitás para el invernadero mágico.</p>
      <p class="gr-small">El trigo comunal que rescataste quedó para vos: cosechalo.</p>
      <div class="k3-btnrow"><button class="k3-b" data-cont>Seguir</button></div>`);
  } else {
    endScreen.show(`<span class="k3-kicker">LA TORMENTA GANÓ ESTA VEZ</span><h1>Se perdió la cosecha</h1>
      <p>Sólo quedaron <b>${r.saved} de ${r.total}</b> cultivos a salvo (necesitabas ${Math.ceil(r.total * G.D.rescue)}). Las plantas perdidas se replantan, nada es para siempre.</p>
      <p class="gr-small">La tormenta vuelve el día ${S.storm.day} a las 9:00. Tip: en la fase 1 cubrí los surcos marcados en rojo; en la 2 cargá los pararrayos y abrí las dos compuertas.</p>
      <div class="k3-btnrow"><button class="k3-b" data-cont>Seguir</button><button class="k3-b alt" data-menu>Menú</button></div>`);
  }
  flush();
}
function checkVictory() {
  if (!(S.feria.done && S.inv3.done) || S.flags.victory) return;
  S.flags.victory = true;
  const score = D.scoreOf(S);
  S.best = Math.max(S.best, score);
  MM.runEnd({ won: true }); SDK.ended({ score });
  G.endKind = 'victory'; G.mode = 'end';
  UI.closePanel(); setTimeout(UI.hideBanner, 500);
  setTimeout(() => endScreen.show(`<span class="k3-kicker">¡VICTORIA!</span><h1>Granja de Runas</h1>
    <p>Ganaste la Feria de Cosechas y el invernadero mágico brilla sobre tu granja. ¡El pueblo entero vino a festejar!</p>
    <p class="gr-score">Puntaje de granja: <b>${score}</b> · Día ${S.day}</p>
    <p class="gr-small">Misiones secundarias: ${sideMissions().filter(m => m.done).length}/4 · Cultivos cosechados: ${S.stats.harvest}</p>
    <div class="k3-btnrow"><button class="k3-b" data-cont>Seguir cultivando</button><button class="k3-b alt" data-menu>Menú</button></div>
    <div class="gr-credit">CREADO POR <img class="ml-ava" src="matelabs/mascota-128.webp" alt="">MATELABS</div>`), 600);
  flush();
}

/* ======================= menú, fin y ciclo de vida ======================= */
const endScreen = screen('', { accent: ACCENT, id: 'grEnd' }); endScreen.hide();
endScreen.on('[data-cont]', () => {
  endScreen.hide();
  if (G.endKind === 'faint') { newDay({ energy: 70, min: 480 }); }
  if (G.endKind === 'victory') { MM.runStart(); syncMissions(); SDK.started(); }
  G.endKind = ''; G.mode = 'play';
});
endScreen.on('[data-menu]', () => { endScreen.hide(); if (G.endKind === 'faint') newDay({ energy: 70, min: 480 }); G.endKind = ''; toMenu(); });

const menu = screen('', { accent: ACCENT, id: 'grMenu' });
function menuHTML() {
  const best = SDK.scores.best(D.GAME_ID);
  const cont = hasProgress();
  return `<span class="k3-kicker">MATELABS PRESENTA</span><h1>Granja de<br>Runas</h1>
    <p>Plantá, regá y cosechá en tu granja mágica. Vendé en el mercado del pueblo, buscá semillas raras en el bosque, ganá la Feria de Cosechas y sobreviví a la Estación de Tormentas para construir el invernadero de runas.</p>
    <div class="k3-btnrow">
      ${cont ? `<button class="k3-b" data-go="cont">▶ Continuar · Día ${S.day}</button><button class="k3-b alt" data-go="new">🌱 Nueva granja</button>` : '<button class="k3-b" data-go="new">▶ Jugar</button>'}
    </div>
    <div id="grDiff"></div>
    <div id="grDiffInfo" class="gr-small"></div>
    <div class="k3-btnrow"><button class="k3-b alt sm" data-help>❓ Cómo jugar</button><button class="k3-b alt sm" data-keys>⌨ Controles</button></div>
    ${best ? `<p class="gr-small">🏆 Récord: ${best} puntos de granja</p>` : ''}
    <div class="gr-credit">CREADO POR <img class="ml-ava" src="matelabs/mascota-128.webp" alt="">MATELABS</div>`;
}
function diffInfo() {
  const d = G.D;
  return `Crecimiento ×${d.growth} · Precios ×${d.price} · Plagas cada ×${d.pest} · Gasto de energía ×${d.energy} · Aviso de peligro ${d.telegraph}s · Rescate mínimo ${Math.round(d.rescue * 100)}%`;
}
function showMenu() {
  G.mode = 'menu';
  menu.show(menuHTML());
  MM.difficultyPicker(/** @type {HTMLElement} */ (document.getElementById('grDiff')), { title: 'DIFICULTAD', onChange: d => { G.diffKey = d; G.D = D.DIFFICULTY[d]; $('grDiffInfo').textContent = diffInfo(); } });
  $('grDiffInfo').textContent = diffInfo();
  UI.show('hud', false); input.showTouch(false);
  setScene('granja', 'inicio');
}
let confirmNew = false;
menu.on('[data-go="cont"]', () => startPlay(false));
menu.on('[data-go="new"]', () => {
  if (hasProgress() && !confirmNew) { confirmNew = true; const b = /** @type {HTMLElement} */ (menu.el.querySelector('[data-go="new"]')); b.textContent = '¿Seguro? Se borra tu granja · Tocá de nuevo'; return; }
  confirmNew = false; startPlay(true);
});
menu.on('[data-help]', () => UI.openPanel(() => ({ title: '❓ Cómo jugar', intro: 'Una granja tranquila: no hay forma de perder para siempre. Si te quedás sin energía te desmayás y perdés un poco de plata; si la tormenta gana, vuelve en dos días.', rows: HELP.map(h => ({ icon: '•', title: h })) }), () => {}));
menu.on('[data-keys]', () => openControls(true));
addEventListener('keydown', e => { if (G.mode === 'menu' && !UI.panelOpen() && (e.code === 'Enter') && menu.visible) { e.preventDefault(); startPlay(!hasProgress()); } });

function startPlay(fresh) {
  if (fresh) { setSave(D.defaults()); }
  G.diffKey = MM.difficulty(D.GAME_ID); G.D = D.DIFFICULTY[G.diffKey];
  menu.hide();
  dawn = JSON.stringify(S);
  setScene(fresh ? 'granja' : S.scene, fresh ? 'inicio' : 'keep');
  if (!fresh) { G.player.x = S.px; G.player.z = S.pz; snapCam(); }
  refreshAll(); critters.reset(); critters.placeAnimals();
  UI.show('hud', true); input.showTouch(true); UI.invalidate();
  G.mode = 'play';
  MM.runStart(); syncMissions(); syncCampaign(); SDK.started();
  if (!S.tutorial.done) coach();
  G.emitLocal('start');
}
function toMenu() {
  if (storm.S.active) { storm.cleanup(); S.storm.state = 'pending'; S.storm.day = Math.max(S.storm.day, S.day); restoreDawnPlots(); }
  UI.closePanel();
  S.px = G.player.x; S.pz = G.player.z; flush();
  if (MM.state().running) MM.runEnd({ won: false });
  SDK.ended({ score: D.scoreOf(S) });
  showMenu();
}
function restoreDawnPlots() { try { const d = JSON.parse(dawn); S.plots = d.plots; } catch (e) { /* nada */ } }
function restartDay() {
  if (G.mode === 'menu') return;
  storm.cleanup(); critters.reset(); UI.closePanel(); endScreen.hide();
  try { setSave(JSON.parse(dawn)); } catch (e) { setSave(D.defaults()); }
  G.diffKey = MM.difficulty(D.GAME_ID); G.D = D.DIFFICULTY[G.diffKey];
  setScene(S.scene, 'keep'); G.player.x = S.px; G.player.z = S.pz; snapCam();
  refreshAll(); critters.placeAnimals();
  G.mode = 'play'; G.endKind = '';
  if (MM.state().running) MM.runEnd({ won: false });
  MM.runStart(); syncMissions(); SDK.started();
  toast(`Día ${S.day} reiniciado desde el amanecer`);
  G.emitLocal('restart');
}
/** Lleva el progreso de campaña a la partida actual de MLMissions (sin repetir logros ya obtenidos). */
function syncMissions() {
  const st = MM.state(), done = (st.achievements && st.achievements.done) || {};
  const prog = { huerta: S.huerta.done ? 10 : Math.min(6, S.huerta.cleared) + Math.min(4, S.huerta.harvested), feria: S.feria.done ? 1 : 0, invernadero: S.inv3.done ? 1 : 0,
    animales: Object.values(S.animals).filter(a => a.own).length, arcoiris: S.flags.rainbow ? 1 : 0, molino: S.mill ? 1 : 0, mercader: S.merchant };
  const EV = { huerta: 'huerta', feria: 'feria', invernadero: 'invernadero', animales: 'adopt', arcoiris: 'rainbow', molino: 'mill', mercader: 'stock' };
  for (const m of st.current) { const v = prog[m.id] || 0; if (v > 0 && !done[m.id]) MM.emit(EV[m.id], v); }
}
/** MLMissions sigue una sola principal por partida: si la campaña ya cumplió la principal en curso,
 *  se la marca y se rota a la siguiente (sin volver a sumar progreso parcial). */
const PRIMS = ['huerta', 'feria', 'invernadero'];
function campaignDone(id) { return id === 'huerta' ? S.huerta.done : id === 'feria' ? S.feria.done : id === 'invernadero' ? S.inv3.done : false; }
function syncCampaign() {
  for (let k = 0; k < 3; k++) {
    const st = MM.state(); if (!st.running) return;
    const cur = st.current.find(m => m.kind === 'primary');
    if (!cur || !campaignDone(cur.id)) return;
    if (!(st.achievements.done || {})[cur.id]) MM.emit(cur.id, 99);
    if (PRIMS.every(p => (MM.state().achievements.done || {})[p])) return;
    MM.runEnd({ won: false }); MM.runStart(); syncMissions();
  }
}
MM.setup({ gameId: D.GAME_ID, hud: 'none', secondaryPerRun: 4, missions: [
  { id: 'huerta', kind: 'primary', title: 'Restaurar la huerta', desc: 'Limpiá 6 parcelas y cosechá 4 cultivos', event: 'huerta', target: 10 },
  { id: 'feria', kind: 'primary', title: 'Completar la Feria de Cosechas', desc: 'Entregá la canasta pedida en la carpa del mercado', event: 'feria', target: 1 },
  { id: 'invernadero', kind: 'primary', title: 'Construir el invernadero mágico', desc: 'Madera, cristal, monedas y la Runa de tormenta', event: 'invernadero', target: 1 },
  { id: 'animales', title: 'Adoptar tres animales', desc: 'Gallina, oveja y la cabrita perdida del bosque', event: 'adopt', target: 3 },
  { id: 'arcoiris', title: 'Cultivar la flor arcoíris', desc: 'Semilla del santuario, regada con rocío de espíritu', event: 'rainbow', target: 1 },
  { id: 'molino', title: 'Reparar el molino', desc: 'Madera, cristal y monedas', event: 'mill', target: 1 },
  { id: 'mercader', title: 'Abastecer el almacén de Tomás', desc: 'Llevale 10 productos', event: 'stock', target: 10 },
] });

/* ======================= tutorial contextual ======================= */
const TUT = [
  { txt: () => `${hasTouch ? 'Mové el joystick' : 'Movete con WASD o las flechas'} — o ${hasTouch ? 'tocá' : 'hacé clic en'} el suelo o en un objeto para ir hasta ahí.`, ev: 'move' },
  { txt: () => `Acercate a una parcela con maleza (anillo verde) y ${hasTouch ? 'tocá USAR' : `apretá ${keyName(S.keys.usar)}`} para limpiarla.`, ev: 'clear' },
  { txt: () => `Plantá una semilla en una parcela limpia. Cambiás de semilla con ${hasTouch ? '🌱' : keyName(S.keys.semilla)}.`, ev: 'plant' },
  { txt: () => 'Llená la regadera en el pozo 💧 y regá lo que plantaste. ¡Sin agua no crece!', ev: 'water' },
  { txt: () => 'Muy bien. Las plantas maduran mientras estén regadas. Vendé en el mercado (salida sur) y seguí las misiones del 📖 diario. Ojo con topos, cuervos y espíritus del clima.', ev: 'end' },
];
let tutT = 0;
function coach() {
  if (S.tutorial.done) { UI.show('coach', false); return; }
  const st = TUT[S.tutorial.step]; if (!st) { endTut(); return; }
  UI.setText('coachTx', st.txt()); UI.show('coach', true); tutT = 0;
}
function tutEvent(ev) {
  if (S.tutorial.done) return;
  // los pasos pueden cumplirse en otro orden: se salta al siguiente del paso cumplido
  const k = TUT.findIndex((t, i) => i >= S.tutorial.step && t.ev === ev);
  if (k >= 0) { S.tutorial.step = k + 1; G.sfx('ui'); coach(); }
}
function tutTick(dt) {
  if (S.tutorial.done || G.mode !== 'play') return;
  if (S.tutorial.step === 0 && G.player.moved > 2.5) tutEvent('move');
  if (S.tutorial.step === 4) { tutT += dt; if (tutT > 9) endTut(); }
}
function endTut() { S.tutorial.done = true; S.tutorial.step = TUT.length; UI.show('coach', false); flush(); }
$('coachSkip').addEventListener('click', e => { e.stopPropagation(); endTut(); });
for (const t of ['pointerdown', 'mousedown', 'touchstart']) { $('coach').addEventListener(t, e => e.stopPropagation()); $('bDiary').addEventListener(t, e => e.stopPropagation()); $('bSeed').addEventListener(t, e => e.stopPropagation()); }
$('bDiary').addEventListener('click', () => { if (G.mode === 'play') openDiary(); });
$('bSeed').addEventListener('click', () => { if (G.mode === 'play') cycleSeed(1); });

/* ======================= arranque ======================= */
UI.initPanel(); UI.initPops(12);
applyQuality(SDK.quality());
refreshAll();
addEventListener('pagehide', () => { if (G.mode !== 'menu' && G.mode !== 'loading') { S.px = G.player.x; S.pz = G.player.z; flush(); } });
showMenu();
g.start();
document.documentElement.dataset.ready = '1';

/* ======================= gancho de pruebas ======================= */
const hook = {
  get state() { return G.mode; }, get scene() { return G.sceneName; }, get endKind() { return G.endKind; },
  get player() { return { x: +G.player.x.toFixed(3), z: +G.player.z.toFixed(3), yaw: +G.player.yaw.toFixed(3), stun: G.player.stun }; },
  get hp() { return S.energy; }, get energy() { return S.energy; }, get score() { return D.scoreOf(S); },
  get time() { return { day: S.day, min: +S.min.toFixed(2), season: D.SEASONS[D.seasonOf(S.day)].id, rain: isRain() }; },
  get coins() { return S.coins; }, get water() { return S.water; }, get seedSel() { return S.seedSel; },
  get inv() { return { ...S.inv }; }, get seeds() { return { ...S.seeds }; }, get tools() { return { ...S.tools }; },
  get plots() { return S.plots.map(p => ({ s: p.s, crop: p.crop, g: +p.g.toFixed(3), w: +p.w.toFixed(3), frost: p.frost, hits: p.hits })); },
  get green() { return S.green.map(p => ({ s: p.s, crop: p.crop, g: +p.g.toFixed(3) })); },
  get animals() { return JSON.parse(JSON.stringify(S.animals)); }, get decor() { return [...S.decor]; },
  get animalPos() { const o = {}; for (const k of Object.keys(critters.animals)) { const a = critters.animals[k]; o[k] = { x: a.x, z: a.z, visible: a.mesh.visible, hop: a.hop }; } return o; },
  get market() { return { sacks: MA.sacks.map(m => m.count), goods: MA.goods.count, ribbon: MA.ribbon.visible, stock: { ...S.stock } }; },
  get visuals() { return { focusRing: focusRing.visible, prompt: $('prompt').hidden ? '' : $('prompt').textContent, weedsVisible: FA.weed.map(w => w.visible), cropVisible: FA.crop.map(c => c.visible), tarps: FA.tarp.map(t => t.visible), marks: FA.mark.map(m => m.visible), millSpinning: !!FA.millOn, greenhouse: { frame: FA.greenhouse.frame.visible, glass: FA.greenhouse.glass.visible, runes: FA.greenhouse.runes.visible }, decorVisible: decorModels.map(o => Object.keys(o).find(k => o[k].visible) || '') }; },
  get campaign() { return { huerta: { ...S.huerta }, feria: S.feria.done, feriaGot: { ...S.feria.got }, invernadero: S.inv3.done, invGot: { ...S.inv3.got }, mill: S.mill, merchant: S.merchant, flags: { ...S.flags }, storm: { ...S.storm }, main: mainMissions(), side: sideMissions() }; },
  get missions() { return MM.state(); },
  get focus() { return G.focus ? { id: G.focus.id, label: G.focusLabel } : null; },
  get counts() { return { ...critters.counts(), particles: G.liveParticles || 0, rain: rain.visible ? G.Q.rain : 0, flora: G.scene ? G.scene.flora.reduce((a, f) => a + f.count, 0) : 0 }; },
  get perf() { return { ...g.perf, quality: G.quality, pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled, fogFar: scene.fog.far, heapMB: /** @type {any} */ (performance).memory ? +(/** @type {any} */ (performance).memory.usedJSHeapSize / 1048576).toFixed(1) : null }; },
  get difficulty() { return { key: G.diffKey, ...G.D }; },
  get storm() { return storm.stats(); },
  get tutorial() { return { ...S.tutorial, visible: !$('coach').hidden }; },
  get critters() { return critters.debug(); },
  get lastEvent() { return G.lastEvent; },
  get simTime() { return g.simTime; },
  get paused() { return g.paused; },
  ids() { return liveInteractables().map(i => i.id); },
  /** posición en pantalla de un objeto interactuable (para pruebas de tocar/clic) */
  screenOf(id) { const it = liveInteractables().find(i => i.id === id); if (!it) return null; const p = projectFn(it.x, it.y, it.z); return { x: p.sx, y: p.sy, vis: p.vis }; },
};
if (DEBUG) Object.assign(hook, {
  goto(name) { setScene(name, G.sceneName); refreshAll(); },
  simulate(sec) { g.simulate(sec); },
  tp(x, z) { G.player.x = x; G.player.z = z; snapCam(); pickFocus(); },
  face(x, z) { G.player.yaw = Math.atan2(x - G.player.x, z - G.player.z); pickFocus(); },
  set(o) { for (const k of Object.keys(o)) { if (typeof o[k] === 'object' && !Array.isArray(o[k]) && S[k] && typeof S[k] === 'object') Object.assign(S[k], o[k]); else S[k] = o[k]; } refreshAll(); },
  act(id) { const it = [...INTER.granja, ...INTER.mercado, ...INTER.bosque, ...DYN_SCENES].find(i => i.id === id); if (!it) return false; if (!it.live()) return 'not-live'; doAct(it); return it.label ? it.label() : true; },
  growAll() { for (let i = 0; i < D.PLOTS + D.GREEN_PLOTS; i++) { const p = plotList(i); if (p.s === 'cultivo') { p.g = 1; refreshPlot(i); } } },
  setTime(min) { S.min = min; applyTime(); },
  newDay() { newDay(); },
  spawn(kind) { return critters.spawn(kind); },
  startStorm() { if (G.sceneName !== 'granja') setScene('granja', G.sceneName); S.storm.state = 'pending'; S.storm.day = S.day; storm.start(); },
  stormSkip() { storm.skip(); },
  stormEnd(win) { storm.forceEnd(win); },
  stormRing(k) { storm.ring(k); }, stormSeq() { return storm.seq; },
  faint() { S.energy = 1; spend(5); },
  flush() { flush(); }, dawn() { return dawn.length; },
  openDiary() { openDiary(); }, closePanel() { UI.closePanel(); },
});
W['__' + D.GAME_ID] = Object.freeze(hook);
