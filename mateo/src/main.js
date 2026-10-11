// Mateo: Ciudad de Altura — arranque y bucle principal (paso fijo 60 Hz con render variable), estados del juego
// (menú, juego, pausa, diálogo), guardado, ajustes y gancho de pruebas window.__mateo (ayudas sólo con ?debug).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEngine, autoQuality, freeAfterUpload } from './engine.js';
import { createMaterials } from './textures.js';
import { createCity } from './city.js';
import { createInput, DEFAULT_KEYS } from './input.js';
import { buildCharacter, MATEO, createFace } from './rig.js';
import { buildClips, CLIP_NAMES } from './anims.js';
import { createPlayer, TUNE } from './player.js';
import { createCamera } from './camera.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { createSave } from './save.js';
import { createTraffic } from './traffic.js';
import { createPeople } from './people.js';
import { createEnemies } from './enemies.js';
import { createQuests } from './quests.js';
import { createMenus } from './menus.js';
import { createOcclusion } from './occlusion.js';
import { createPerfMon } from './perf.js';
import { createProbe } from './qa_probe.js';
import { loadData } from './data.js';
import { createDistrictSol } from './district_sol.js';
import { createStreaming } from './streaming.js';
import { createNav } from './nav.js';
import { createVillains } from './villains.js';
import { createCombat } from './combat.js';
import { createIncidents } from './incidents.js';
import { buildExtraClips } from './anims.js';
import { createClock } from './clock.js';
import { createNightLights } from './nightlights.js';
import { createWardrobe } from './wardrobe.js';
import { createEconomy } from './economy.js';
import { createHome } from './home.js';
import { createVehicles } from './vehicles.js';
import { createLife } from './life.js';
import { loadProxies } from './props.js';
import { createCampaign } from './campaign.js';
import { createMapView } from './mapa.js';
import { clamp, esc } from './util.js';

const QS = new URLSearchParams(location.search);
const DEBUG = QS.has('debug');
const save = createSave();
const S = () => save.data;
const settings = () => S().settings;

/* ---------- motor ---------- */
const qSetting = () => (QS.get('quality') || settings().quality);
const qFixed = () => !!QS.get('quality') && QS.get('quality') !== 'auto'; // ?quality=… fija la calidad (pruebas)
const resolveQ = () => { const q = qSetting(); return q === 'auto' ? autoQuality() : q; };
const engine = createEngine(document.getElementById('scene'), resolveQ());
const { scene, camera, renderer } = engine;
const ui = createUI(document.getElementById('ui'));
const audio = createAudio(() => settings().muted ? 0 : settings().volume);
const fx = createFx(scene, () => settings().reducedMotion);
const mats = createMaterials(renderer, engine.quality);
const occlusion = createOcclusion(); occlusion.apply(mats);
const DATA = await loadData();
const SOL = DATA.districts.find(d => d.id === 'sol');
const city = createCity(mats, engine.quality, { west: SOL });
scene.add(city.group);
freeAfterUpload(city.group); // V2 P3: memoria JS (la ciudad estática no se vuelve a leer en la CPU)
// luces de interiores (Banco, Centro Comunitario); V2 P2: el departamento las «toma prestadas» mientras Mateo está
// adentro (la ciudad queda oculta) → mismo número de luces en la escena, sin recompilar materiales
const interiorLights = city.interiors.map(it => { const l = new THREE.PointLight(0xfff1d8, 90, 34, 2); l.position.set(it.light[0], it.light[1], it.light[2]); scene.add(l); return l; });
// V2 P2: reloj del mundo y luces de la noche (charcos de luz bajo los faroles)
const clock = createClock({ startHour: DATA.clock.startHour, realMinutesPerDay: settings().dayMinutes || DATA.clock.cycleRealMinutes, segments: DATA.clock.segments, lights: DATA.clock.lights });
clock.restore(S().clock);
const nightLights = createNightLights(scene, city.lamps);
const proxiesP = loadProxies(); // muebles del departamento (12 GLB proxy del kit), en paralelo con Mateo
const npcDist = () => Math.min(150, Math.round(engine.preset.fogFar * 0.33));
const perfmon = createPerfMon({ getQuality: () => engine.quality, setQuality: q => { engine.applyQuality(q); traffic && traffic.setDensity(engine.preset.traffic); people && (people.setDensity(engine.preset.people), people.setViewDist(npcDist())); fx.setCap(engine.preset.particles); }, setScale: k => engine.setRenderScale(k), touch: matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window });
const input = createInput(renderer.domElement, ui, { binds: settings().binds, sprintToggle: () => input.isTouch, haptics: () => settings().haptics });

/* ---------- Mateo: GLB exportado (rig + clips) con respaldo procedural ---------- */
const MODEL_URL = new URL('../assets/models/mateo_final_v1.glb', import.meta.url).href;
let hero = null, heroSource = 'procedural';
async function loadHero() {
  if (!QS.has('procedural')) {
    try {
      const g = await new GLTFLoader().loadAsync(MODEL_URL);
      const missing = CLIP_NAMES.filter(n => !g.animations.find(a => a.name === n));
      const bones = {}; g.scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
      if (missing.length === 0 && bones.head && bones.hand_R) {
        const face = { lids: [], mouth: null, brows: [] }, wrist = { L: null, R: null }, by = n => g.scene.getObjectByName(n);
        face.lids = [by('parpado_R'), by('parpado_L')].filter(Boolean); face.brows = [by('ceja_R'), by('ceja_L')].filter(Boolean);
        const mouth = by('boca'); if (mouth && !mouth.morphTargetInfluences) { mouth.traverse(o => { if (o.isMesh && o.morphTargetInfluences) face.mouth = o; }); } else face.mouth = mouth;
        wrist.L = by('muneca_L'); wrist.R = by('muneca_R');
        g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        if (face.lids.length === 2 && face.brows.length === 2 && face.mouth && face.mouth.morphTargetInfluences && face.mouth.morphTargetInfluences.length === 3 && wrist.R) {
          hero = { group: g.scene, face, wrist, clips: g.animations, bones };
          heroSource = 'glb';
          return;
        }
      }
      console.warn('GLB de Mateo incompleto, uso el procedural', missing);
    } catch (e) { console.warn('No se pudo cargar el GLB de Mateo; uso el modelo procedural', e && e.message); }
  }
  const ch = buildCharacter(MATEO);
  hero = { group: ch.group, face: ch.face, wrist: ch.wrist, clips: buildClips(ch.bones.hips.position.y), bones: ch.bones };
  heroSource = 'procedural';
}

/* ---------- estado ---------- */
let state = 'loading';   // loading | menu | play | pause | dialog
let player = null, cam = null, traffic = null, people = null, enemies = null, quests = null, menus = null;
let district = null, streaming = null, nav = null, villains = null, combat = null, incidents = null;
let wardrobe = null, economy = null, home = null, vehicles = null, life = null, lampK = 0, hMax = 0, blockedT = 0;
let campaign = null, mapView = null, journalTab = '';
const run = { time: 0, points: 0 };
const debug = { freeze: false };

/* ---------- auditoría de colisiones (sólo ?debug): saltos de posición y Mateo dentro de sólidos ---------- */
const track = { on: false, prev: new THREE.Vector3(), steps: 0, maxJump: 0, jumps: [], inside: [], respawns: 0, skip: 0, list: [] };
const SOLIDS = new Set(['building', 'prop', 'parapet', 'fountain', 'beam', 'fence', 'car']);
function solidAt(x, y, z, r = 0.05) { const out = []; for (const b of city.world.near(x - 1, z - 1, x + 1, z + 1, track.list)) if (SOLIDS.has(b.kind) && x > b.minX + r && x < b.maxX - r && z > b.minZ + r && z < b.maxZ - r && y > b.minY + r && y < b.maxY - r) out.push(b.kind + (b.landmark ? ':' + b.landmark : '')); return out; }
function trackStep(dt) {
  const P = player.P; track.steps++;
  if (track.skip > 0) { track.skip--; return; }
  const d = P.pos.distanceTo(track.prev), allowed = Math.hypot(P.vel.x, P.vel.y, P.vel.z) * dt * 1.6 + TUNE.step + 0.05;
  track.maxJump = Math.max(track.maxJump, d);
  if (d > allowed && track.jumps.length < 20) track.jumps.push({ d: +d.toFixed(3), allowed: +allowed.toFixed(3), x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), state: P.state });
  const ins = solidAt(P.pos.x, P.pos.y + 0.6, P.pos.z);
  if (ins.length && track.inside.length < 20) track.inside.push({ kinds: ins, x: +P.pos.x.toFixed(2), y: +P.pos.y.toFixed(2), z: +P.pos.z.toFixed(2), state: P.state });
}
function onEvent(type, d) {
  if (type === 'respawn' || type === 'water') { track.respawns++; track.skip = 1; }
  if (quests) quests.event(type, d);
  if (type === 'superJump' && d.power > 0.6) cam.kick(0.25);
  if (type === 'hurt') { ui.hit(settings().reducedMotion); cam.kick(0.4); }
  if (type === 'noAnchor') ui.toast('Sin anclaje: apuntá hacia un edificio alto', 1200);
  if (type === 'respawn') ui.toast('Mateo volvió a un lugar seguro', 1600);
  if (type === 'water') { ui.toast('💦 ¡Splash! Mateo vuelve al muelle', 1800); audio.whoosh(1); }
  if (type === 'chain') audio.whoosh(0.6);
  if (type === 'bounce') ui.toast('🤸 ¡Cama elástica!', 900);
  if (type === 'droneDown' && incidents) incidents.onDroneDown(d.tag);
  if (type === 'exhausted') { ui.toast('😮‍💨 Mateo se cansó: descansa un momento en un lugar seguro', 2400); if (incidents) incidents.onExhausted(); }
  if (type === 'dodged') audio.whoosh(0.8);
  if (type === 'guardBlock') { audio.land(0.6); }
  if (type === 'villainBlocked') ui.toast('🛡 ¡Se cubre! Probá el golpe cargado (mantené ACCIÓN), el cable o pegale después de su empujón', 1600);
  if (type === 'villainSurrender') audio.checkpoint();
  // V2 P2: los incidentes resueltos también pagan monedas M (una vez por incidente: id = número de incidente resuelto)
  if (type === 'incident' && d.state === 'complete' && economy) { const n = S().stats.incidents; if (economy.earn({ transactionId: `inc:${n}`, credits: 20, what: 'Ayudaste a un vecino' })) ui.toast('🪙 +20 M por ayudar a un vecino', 2000); }
  if (type === 'civilBlocked' && blockedT <= 0) { blockedT = 3; ui.toast(`Eso es del traje de héroe: apretá ${input.isTouch ? 'el botón M' : 'T'} para cambiarte`, 2200); audio.denied(); }
  if (type === 'carHit' && d.health < 30) ui.toast('🔧 El kart está muy abollado: llevalo al taller del Garaje M', 2000);
  if (campaign) campaign.event(type, d); // V2 P3: la campaña escucha los sucesos reales del juego
}

async function boot() {
  await loadHero();
  scene.add(hero.group);
  const face = createFace(hero.face);
  // V2: capas de animación nuevas (combate) generadas sobre el mismo esqueleto; los 39 clips del GLB no se tocan
  player = createPlayer({ world: city.world, model: hero, clips: [...hero.clips, ...buildExtraClips(hero.bones.hips.position.y)], face, sfx: audio, fx, scene, onEvent });
  cam = createCamera(camera, city.world, settings, { interiors: city.interiors, occlusion, camWorld: city.camWorld });
  cam.setZoom(settings().camZoom || 1);
  traffic = createTraffic(scene, city, engine.preset.traffic, { sfx: audio });
  people = createPeople(scene, city, engine.preset.people, { sfx: audio });
  // V2 P1: Barrio del Sol con streaming por manzana, redes peatonal/vial y peatones que frenan a los autos
  district = createDistrictSol(SOL, { mats, world: city.world, scene, people });
  streaming = createStreaming({ sectors: district.sectors, ...(SOL.streaming || {}) });
  nav = createNav(city, district);
  // V2 P1: villanos con IA, combate no letal y director de incidentes
  villains = createVillains(scene, city, { nav, world: city.world, fx, sfx: audio, onEvent, hurt: (n, x, z) => player.damage(settings().easy ? Math.ceil(n / 2) : n, x, z), cars: () => traffic.cars.filter(c => c.active), player: () => player && player.P, seed: 9091 });
  traffic.setPeds(() => people.onRoad().concat(villains.onRoad()));
  enemies = createEnemies(scene, city, { sfx: audio, fx, player: () => player.P, hurt: (n, x, z) => player.damage(n, x, z), onEvent, get easy() { return settings().easy; } });
  { const pt = city.landmarks.puerto; enemies.spawnDrone(pt.x - 10, 12, -40, 'amb'); enemies.spawnDrone(pt.x + 20, 16, 60, 'amb'); }
  quests = createQuests({ save, ui, city, people, enemies, player, fx, sfx: audio, scene, touch: input.isTouch, onEvent: (t, d) => { if (t === 'points') run.points += d; if (t === 'talk' && campaign) campaign.event('talk', d); }, repLine: () => campaign ? campaign.npcLine() : null });
  combat = createCombat({ player, input, villains, enemies, people, fx, sfx: audio, scene, onEvent, settings });
  player.setDamageFilter(combat.filterDamage);
  incidents = createIncidents({ data: DATA.incidents, city, nav, people, villains, enemies, player, ui, sfx: audio, fx, save, scene, carryAnchor: () => hero.wrist.R || hero.group, quality: () => engine.quality, districtAt, dayPhase: dayPhaseName, questActive: () => !!quests.info().active, touch: input.isTouch, onEvent });
  menus = createMenus({ ui, save, input, audio, engine, startGame, resume, quests, applySettings, toMenu, openJournal: t => openJournal(t) });
  // V2 P2: identidad y simulación: vestuario, economía, departamento, karts y vida civil
  const proxies = await proxiesP;
  wardrobe = createWardrobe({ hero, data: DATA.wardrobe });
  economy = createEconomy({ save, catalog: sku => life ? life.catalog(sku) : null });
  home = createHome({ scene, world: city.world, city, hero, proxies, interiorLights, keep: [hero.group, engine.sky, engine.hemi, engine.sun, engine.sun.target, ...interiorLights], open: k => life.open(k), request: (k, a) => homeRequest(k, a), fx, sfx: audio });
  city.interiors.push(home.interior);
  vehicles = createVehicles({ scene, world: city.world, save, data: DATA.vehicles, garage: home.garage, traffic, people, villains, fx, sfx: audio, onEvent, solidAt });
  traffic.setPeds(() => people.onRoad().concat(villains.onRoad(), vehicles.asPed()));
  life = createLife({ DATA, save, ui, scene, world: city.world, city, player, clock, economy, wardrobe, home, vehicles, fx, sfx: audio, solidAt, openScreen, closeScreen: resume, applyTime, request: (k, a) => homeRequest(k, a), onEvent: (t, d) => campaign && campaign.event(t, d) });
  life.load();
  // V2 P3: campaña encadenada (tutorial de controles, eventos contextuales, diario, reputación) y mapa con ruta
  campaign = createCampaign({ data: DATA.missions, shops: DATA.shops, save, ui, player, home, life, wardrobe, vehicles, incidents, economy, clock, city, people, sfx: audio, fx, touch: input.isTouch, districtAt });
  mapView = createMapView({ city, district, nav, home, life, vehicles, incidents, quests, campaign, player, clock, people });
  ui.E.map.addEventListener('click', e => { e.stopPropagation(); if (state === 'play') openJournal('mapa'); });
  for (const t of ['pointerdown', 'touchstart', 'mousedown']) ui.E.map.addEventListener(t, e => e.stopPropagation());
  vehicles.restore();
  ui.E.suit.addEventListener('click', e => { e.stopPropagation(); if (state === 'play') life.toggleMode(); });
  ui.E.inv.addEventListener('click', e => { e.stopPropagation(); if (state === 'play') life.open('inv'); });
  for (const b of [ui.E.suit, ui.E.inv]) for (const t of ['pointerdown', 'touchstart']) b.addEventListener(t, e => e.stopPropagation());
  const p = S().pos;
  if (p) streaming.ensure(p[0], p[2]);
  if (p && S().started && city.world.hasFloor(p[0], p[2]) && solidAt(p[0], p[1] + 0.6, p[2]).length && vehicles.kart) { const e = vehicles.exitSpot(); if (e) { p[0] = e.x; p[1] = e.y; p[2] = e.z; } } // al lado del kart estacionado
  if (p && S().started && city.world.hasFloor(p[0], p[2]) && !solidAt(p[0], p[1] + 0.6, p[2]).length) player.teleport(p[0], p[1] + 0.2, p[2]); else player.teleport(city.landmarks.plaza.x - 6, 0.5, city.landmarks.plaza.z - 26);
  cam.snapBehind(Math.PI * 0.1);
  engine.refreshEnv(); // V2 P3: mapa de entorno según la calidad, ya con todos los materiales de la ciudad creados
  if (S().home.inside) enterHome('bed', true); // la partida quedó adentro del departamento (o es una partida nueva)
  applySettings();
  state = 'menu'; menus.main();
  loop.start();
}

function startGame(fresh) {
  audio.unlock();
  if (fresh) {
    if (vehicles.driving) leaveKart(true);
    save.resetProgress(); incidents.cancelAll('nueva partida'); villains.clearAll(); vehicles.despawn(); clock.restore(S().clock); life.load(); applyTime();
    if (home.inside) home.exit();
    player.teleport(city.landmarks.plaza.x - 6, 0.5, city.landmarks.plaza.z - 26); quests.reset();
    if (S().home.inside) enterHome('bed', true); // V2 P2: una partida nueva empieza de civil, en el departamento
    campaign.reset();
  }
  S().started = true; save.flush();
  ui.hideScreen(); ui.show(true); ui.showTouch(input.isTouch); input.clear();
  state = 'play';
  quests.begin();
  campaign.begin();
}
function toMenu() { state = 'menu'; ui.show(false); ui.showTouch(false); input.clear(); audio.resume(); menus.main(); }
function pause() { if (state !== 'play' && state !== 'dialog') return; state = 'pause'; input.clear(); audio.suspend(); ui.showTouch(false); menus.pause(); if (document.pointerLockElement) document.exitPointerLock(); }
/** V2 P2: pantallas de la vida civil (tienda, ropero, heladera…): pausan el juego y el reloj */
function openScreen() { if (state !== 'play' && state !== 'dialog') return; state = 'pause'; ui.E.toast.classList.remove('on'); ui.rotateHint(false); input.clear(); ui.show(false); ui.showTouch(false); if (document.pointerLockElement) document.exitPointerLock(); }
/* ---------- V2 P3: mapa completo, diario y campaña (M, tocar el minimapa o Pausa → Mapa y diario) ---------- */
function openJournal(tab = 'mapa') {
  if (state === 'play' || state === 'dialog') openScreen(); else if (state !== 'pause') return;
  state = 'pause'; journalTab = tab; renderJournal();
}
function renderJournal() {
  const s = S(), f = s.settings.mapFilters, cs = campaign.info(), tabs = [['mapa', '🗺 Mapa'], ['diario', '📔 Diario'], ['historia', '★ Historia']];
  let h = `<h2>${{ mapa: 'MAPA DE LA CIUDAD', diario: 'DIARIO DE MATEO', historia: 'HISTORIA' }[journalTab]}</h2><div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button class="b sm alt${journalTab === k ? ' on' : ''}" role="tab" aria-selected="${journalTab === k}" data-j="tab" data-t="${k}">${t}</button>`).join('')}</div>`;
  if (journalTab === 'mapa') {
    const leg = [['lugares', '#ffcf3f', 'Casa, garaje y kart'], ['tiendas', '#7dffa0', 'Comercios (gris: cerrado)'], ['misiones', '#6ff3ff', 'Objetivos y vecinos con «!»'], ['ayuda', '#ff5a4a', 'Vecinos que piden ayuda']];
    h += `<div class="mapwrap"><canvas id="fullmap" width="750" height="550" role="img" aria-label="Mapa completo de Ciudad de Altura: norte arriba"></canvas></div>
      <div class="legend" aria-label="Leyenda y filtros">${leg.map(([k, c, t]) => `<label><input type="checkbox" data-j="filter" data-f="${k}"${f[k] ? ' checked' : ''}><i style="background:${c}"></i>${t}</label>`).join('')}<label><i style="background:#6ff3ff;border-radius:2px"></i>Mateo</label></div>
      <ul class="list jlist" aria-label="Lugares">${mapView.places(f).map(p => `<li>${p.i} ${esc(p.t)}</li>`).join('') || '<li>Sin lugares con estos filtros</li>'}</ul>`;
  } else if (journalTab === 'diario') {
    const tier = campaign.tier(), next = campaign.tiers.find(t => t.min > campaign.repTotal());
    h += `<p class="small">Experiencia ${s.points} pts · Nivel ${quests.level} · Reputación ${campaign.repTotal()} («${esc(tier.name)}»${next ? `, próximo: «${esc(next.name)}» con ${next.min}` : ''})<br>Centro ${s.rep.centro} · Barrio del Sol ${s.rep.sol} · Puerto ${s.rep.puerto} · Vecinos ayudados ${s.stats.incidents} · Trabajos ${Object.values(s.jobs).reduce((a, j) => a + j.runs, 0)} · 🪙 ${economy.balance} M</p>
      <ul class="list jlist">${cs.journal.slice().reverse().map(e => `<li>${esc(e.i)} ${esc(e.t)} <small>· día ${e.d}, ${esc(e.h)}</small></li>`).join('') || '<li>Todavía no hay entradas</li>'}</ul>`;
  } else {
    const ST = { locked: '🔒 BLOQUEADA', available: 'DISPONIBLE', active: 'EN CURSO', completed: '✔ CUMPLIDA', failed: '✖ FALLÓ' };
    h += `<ul class="list jlist">${campaign.questline.map(m => { const st = cs.status[m.id]; const steps = st === 'active' || st === 'failed' ? `<ol class="steps">${m.steps.map((x, i) => `<li class="${i < cs.step ? 'ok' : i === cs.step ? 'now' : ''}">${i < cs.step ? '✔ ' : ''}${esc(x.label)}</li>`).join('')}</ol>` : '';
      return `<li class="q mrow ${st}"><span>${m.mode === 'hero' ? '🦸' : '👕'}</span><span><b>${esc(m.title)}</b><br><small>+${m.reward.credits} M · +${m.reward.xp} pts${cs.done[m.id] ? ` · día ${cs.done[m.id].d}` : ''}</small>${steps}</span><span class="st">${ST[st]}</span></li>`; }).join('')}</ul>
      <p class="small">Misiones de los vecinos (Profe Lía y compañía): Pausa → Misiones de vecinos.</p>`;
  }
  ui.screen(`<div class="life journal">${h}<div class="btns"><button class="b" data-j="close">Volver al juego</button></div></div>`);
  const cv = document.getElementById('fullmap'); if (cv) mapView.drawFull(cv, f);
}
ui.onScreen('[data-j]', t => {
  if (!journalTab) return;
  const a = t.getAttribute('data-j');
  if (a === 'close') { journalTab = ''; resume(); return; }
  if (a === 'tab') { journalTab = t.dataset.t; renderJournal(); }
});
ui.E.scr.addEventListener('change', e => { const t = /** @type {HTMLInputElement} */ (e.target); if (journalTab && t.dataset && t.dataset.j === 'filter') { S().settings.mapFilters[t.dataset.f] = t.checked; save.flush(); renderJournal(); } });
function resume() { journalTab = ''; if (life && life.screen) life.forceClose(); ui.hideScreen(); ui.show(true); ui.showTouch(input.isTouch); input.clear(); audio.resume(); state = quests && quests.inDialog ? 'dialog' : 'play'; loop.resetClock(); }
/* ---------- V2 P2: departamento y kart ---------- */
function enterHome(spawn = 'door', silent = false) {
  if (vehicles.driving) return false;
  incidents.cancelAll('Mateo entró a su casa');
  if (!silent) { ui.fade(); audio.land(0.4); }
  hMax = player.P.stats.maxHeight;
  const sp = home.enter(spawn);
  player.teleport(sp.x, sp.y + 0.05, sp.z); player.P.yaw = sp.yaw; player.P.seat = null;
  player.P.lastSafe.set(home.outside.x, home.outside.y + 0.05, home.outside.z); // lo que se guarda es la puerta de calle
  cam.snapBehind(sp.yaw); track.skip = 2;
  S().home.inside = true; S().pos = [+home.outside.x.toFixed(2), +home.outside.y.toFixed(2), +home.outside.z.toFixed(2)]; save.flush();
  return true;
}
function exitHome(silent = false) {
  if (!home.inside) return false;
  if (!silent) { ui.fade(); audio.land(0.4); }
  player.P.seat = null;
  const p = home.exit();
  streaming.ensure(p.x, p.z);
  player.teleport(p.x, p.y + 0.05, p.z); player.P.yaw = p.yaw; player.P.stats.maxHeight = hMax;
  cam.snapBehind(p.yaw); track.skip = 2;
  S().home.inside = false; save.flush();
  return true;
}
function leaveKart(force = false) {
  const r = vehicles.exit(force);
  if (r.fail) { ui.toast(r.fail, 1500); return false; }
  const P = player.P; P.driving = false; P.seatVis = null;
  player.teleport(r.x, r.y, r.z); P.yaw = r.yaw; track.skip = 2;
  return true;
}
function homeRequest(kind, arg) {
  const P = player.P;
  if (kind === 'enter') return enterHome('door');
  if (kind === 'exit') return exitHome();
  if (kind === 'sit') { P.seat = { ...arg, y: arg.y + 0.02, standX: P.pos.x, standY: P.pos.y, standZ: P.pos.z }; ui.toast('🛋 Mateo descansa un rato (moverse para levantarse)', 1800); return true; }
  if (kind === 'wash') { audio.checkpoint(); fx.sparkle(P.pos.x, P.pos.y + 1, P.pos.z, 0xbfe8ff, 10); ui.toast('🫧 ¡Manos limpias!', 1400); return true; }
  if (kind === 'carEnter') { if (!vehicles.enter(P)) return false; if (wardrobe.mode === 'hero') life.setMode('civil', true); P.driving = true; P.seat = null; cam.C.idle = 9; ui.toast(input.isTouch ? '🏎 Joystick: acelerar y girar · SALTO: freno de mano · ACCIÓN: bajar' : '🏎 W/S acelerar y frenar · A/D girar · Espacio: freno de mano · E: bajar', 2800); return true; }
  if (kind === 'carExit') return leaveKart();
  return false;
}
/** V2: distrito de un punto (centro, Barrio del Sol, puerto) y franja horaria para horarios de NPC e incidentes */
function districtAt(x, z) { const r = SOL.rect; if (x < r[1] && x >= r[0] - 2 && z >= r[2] && z <= r[3]) return 'sol'; if (x > 199 && Math.abs(z) <= 130) return 'puerto'; return 'centro'; }
/** franja para horarios de NPC/incidentes ('dia'|'atardecer'|'noche'); el amanecer cuenta como «atardecer» (poca gente) */
function dayPhaseName() { const h = settings().hora; if (h !== 'ciclo') return h; const p = clock.phase; return p === 'amanecer' ? 'atardecer' : p; }
/** V2 P2: aplica la hora del reloj (ciclo) o un modo fijo (el reloj queda en esa hora: comercios coherentes) */
function applyTime() {
  const h = settings().hora;
  clock.setRate(settings().dayMinutes || DATA.clock.cycleRealMinutes);
  let w;
  if (h === 'ciclo') w = engine.setHour(clock.hour);
  else { w = engine.setTime(h); const fh = DATA.clock.fixedHours[h]; if (fh !== undefined && Math.abs(clock.hour - fh) > 1e-3) clock.setHour(fh); }
  run.dayPhase = (((clock.hour - 12) / 24) % 1 + 1) % 1; // compatibilidad: 0 = mediodía
  lampK = h === 'ciclo' ? clock.lampLevel : h === 'noche' ? 1 : h === 'atardecer' ? 0.5 : 0;
  nightLights.set(lampK);
  if (home) home.setSky(clock.hour);
  if (vehicles) vehicles.setNight(lampK);
  if (traffic) traffic.setNight(lampK, h === 'ciclo' && clock.phase === 'noche' ? DATA.clock.trafficNightFactor : 1);
  if (people) people.setSchedule(dayPhaseName());
  for (const k of ['glass0', 'glass1', 'glass2', 'office', 'brick', 'stucco']) mats[k].emissiveIntensity = w * 0.9;
  mats.shops.emissiveIntensity = w * 0.8; mats.signs.emissiveIntensity = w * 0.45;
}
function applySettings() {
  const s = settings();
  applyTime();
  input.setBinds(s.binds);
  audio.setVolume(s.muted ? 0 : s.volume);
  document.documentElement.style.setProperty('--btn', Math.round(72 * s.buttonScale) + 'px');
  const q = resolveQ(); if (q !== engine.quality && !(qSetting() === 'auto' && perfmon.adapt.enabled)) { engine.applyQuality(q); traffic && traffic.setDensity(engine.preset.traffic); people && people.setDensity(engine.preset.people); }
  if (people) people.setViewDist(npcDist());
  // «Automática» (sin ?quality fijo): arranca con la heurística del equipo y se adapta con los FPS medidos
  const auto = qSetting() === 'auto' && !qFixed();
  if (auto !== perfmon.adapt.enabled) perfmon.setAuto(auto, autoQuality());
  if (!auto) engine.setRenderScale(1);
  if (cam) cam.setZoom(s.camZoom || 1);
  ui.perf(s.showPerf);
  fx.setCap(engine.preset.particles);
}
ui.E.pause.addEventListener('click', e => { e.stopPropagation(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('keydown', e => { if (e.code === 'F3' || (e.code === 'KeyP' && e.shiftKey)) { e.preventDefault(); settings().showPerf = !settings().showPerf; save.flush(); ui.perf(settings().showPerf); } });

/* ---------- bucle ---------- */
const STEP = 1 / 60;
let acc = 0, last = 0, simTime = 0, frames = 0;
const perf = { frameMs: 0, updateMs: 0, renderMs: 0, calls: 0, tris: 0, fps: 0 };
let fpsAcc = 0, fpsN = 0;
function update(dt) {
  const playing = state === 'play' || state === 'dialog';
  if (playing) {
    if (input.pressed('pause')) { pause(); input.endStep(); return; }
    run.time += dt;
    const lk = input.takeLook(), ly0 = cam.C.yaw, lp0 = cam.C.pitch; cam.look(lk.dx, lk.dy);
    if ((lk.dx || lk.dy) && campaign) campaign.event('look', Math.abs(Math.atan2(Math.sin(cam.C.yaw - ly0), Math.cos(cam.C.yaw - ly0))) + Math.abs(cam.C.pitch - lp0)); // tutorial: la cámara la movió el jugador
    const zm = input.takeZoom(); if (zm) { cam.zoom(zm); zoomDirty = 1.5; }
    if (zoomDirty > 0 && (zoomDirty -= dt) <= 0) { settings().camZoom = +cam.C.zoomT.toFixed(2); save.flush(); }
    if (state === 'dialog') { player.P.talking = true; if (input.pressed('action') || input.pressed('jump')) quests.advanceDialog(); }
    else player.P.talking = false;
    player.P.canGlide = S().unlocked.glide;
    const P = player.P, driving = vehicles.driving, civil = P.civil;
    blockedT -= dt;
    // V2 P2: traje (T / botón M) y mochila (I / botón 🎒)
    if (state === 'play' && input.pressed('suit')) life.toggleMode();
    if (state === 'play' && input.pressed('inv')) { life.open('inv'); input.endStep(); return; }
    if (driving) { /* el kart usa los ejes; el cable y el combate no existen manejando */ }
    else if (input.pressed('cable') && civil && !P.rope && state === 'play') { /* lo avisa el jugador (civilBlocked) */ }
    else if (input.pressed('cable') && !player.P.rope && state === 'play' && enemies.cableTarget(player.P, cam.yaw)) { input.consume('cable'); player.oneShot('grapple_shoot_right', 0.3); audio.cable(); }
    else if (input.pressed('cable') && !player.P.rope && state === 'play' && combat.tryBind(cam.yaw)) input.consume('cable'); // V2: cable inmovilizador sobre un villano
    if (track.on) track.prev.copy(player.P.pos);
    if (driving) {
      const r = vehicles.step(dt, input, P);
      P.driving = true;
      if (r && r.splash) { vehicles.despawn(); S().cars.out = null; P.driving = false; P.seatVis = null; player.teleport(home.outside.x, home.outside.y + 0.05, home.outside.z); fx.splash(P.pos.x, 0, P.pos.z); ui.toast('💦 ¡Splash! El kart volvió al garaje y Mateo a su casa', 2400); save.flush(); }
      else player.drive(dt, vehicles.seat());
    } else { P.driving = false; P.seatVis = null; player.step(dt, input, cam); }
    if (home.inside) P.stats.maxHeight = hMax; // el sub-escenario está a 300 m: no cuenta como récord de altura
    if (track.on && !driving) trackStep(dt);
    // V2: ACCIÓN = devolver (incidente) / hablar (misiones) / golpe del combate (con ventanas, no a distancia)
    // V2 P2: + casa, comercios, trabajos y kart (antes que las misiones); el golpe sólo en modo héroe
    if (state === 'play' && input.pressed('action')) { const it = incidents.interactTarget(), lt = !it && life.interactTarget(), t = it || lt || quests.interactTarget(); if (it) incidents.interact(it); else if (lt) lt.act(); else if (t) quests.interact(t); else if (!civil && !driving) combat.press('punch'); }
    combat.update(dt, cam, state === 'play' && !civil && !vehicles.driving && !home.inside);
    if (input.pressed('map') && state === 'play') { openJournal('mapa'); input.endStep(); return; }
    player.preview(dt, cam);
    cam.update(dt, player.P);
  } else {
    // menú: la cámara orbita la plaza
    const L = city.landmarks.plaza, t = performance.now() * 0.00005;
    camera.position.set(L.x + Math.sin(t) * 70, 38, L.z + Math.cos(t) * 70); camera.lookAt(L.x, 12, L.z);
    occlusion.update(camera.position, camera.position, 0, 0);
  }
  city.update(dt);
  const away = !!(home && home.inside); // adentro del departamento la ciudad está oculta y en pausa
  if (player && !away) streaming.update(dt, player.P.pos.x, player.P.pos.z);
  if (home) { home.update(dt); if (playing) life.update(dt); }
  // V2 P2: el reloj sólo corre jugando (pausa, menús, tiendas y pestaña oculta lo detienen); se aplica cada 0,5 s
  if (playing && settings().hora === 'ciclo') { clock.update(dt); S().clock.hour = clock.hour; S().clock.day = clock.day; }
  if (Math.floor(simTime * 2) !== Math.floor((simTime - dt) * 2)) applyTime();
  traffic.update(dt, player.P, debug.freeze || away);
  people.update(dt, player.P, debug.freeze || away);
  enemies.update(dt, debug.freeze || !playing || away);
  villains.update(dt, debug.freeze || !playing || away);
  if (playing && !away) incidents.update(dt, state);
  if (campaign) campaign.update(dt, state === 'play');
  people.setDanger(villains.dangers().concat(enemies.dangers()));
  quests.update(dt, state);
  if (state === 'dialog' !== quests.inDialog && playing) state = quests.inDialog ? 'dialog' : 'play';
  fx.update(dt, camera);
  ui.tick(dt);
  hud(dt);
  input.endStep();
  simTime += dt;
}
let hudAcc = 0, mapAcc = 0, perfAcc = 0, zoomDirty = 0;
function hud(dt) {
  hudAcc += dt; mapAcc += dt;
  if (hudAcc < 0.1 || !player) return; hudAcc = 0;
  const P = player.P;
  ui.status({ money: economy.balance, clock: `🕙 ${clock.label()}`, mode: wardrobe.mode, health: P.health, charge: P.charging ? Math.max(0.02, P.charge) : combat.C.state === 'charge' ? Math.max(0.02, combat.C.charge) : 0, medals: quests.medalCount, medalsTotal: quests.medalTotal, points: S().points + run.points, level: 'NIVEL ' + quests.level });
  const io = incidents.objective(), qo = quests.objective(P), jo = life.objective(), co = campaign.objective();
  if (io && P.civil && ['alert', 'pursuit', 'confront'].includes(incidents.focus() && incidents.focus().state)) io.step = `Ponete el traje (${input.isTouch ? 'botón M' : 'T'}) y ayudá: ${io.step}`;
  // prioridad: vecino que pide ayuda > trabajo > misión de un vecino (V1) > historia (V2 P3) > explorar
  ui.objective(io && (io.engaged || !quests.info().active) ? io : jo || (quests.info().active ? qo : co || qo));
  ui.combat(input.isTouch && state === 'play' && incidents.combatNear);
  const deg = ((-cam.yaw * 180 / Math.PI) % 360 + 360) % 360, dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  ui.compass('◆ ' + dirs[Math.round(deg / 45) % 8]);
  if (state === 'play') {
    const t = incidents.interactTarget() || life.interactTarget() || quests.interactTarget();
    const k = input.isTouch ? 'ACCIÓN' : (S().settings.binds.action || 'KeyE').replace('Key', '');
    ui.prompt(t ? `<kbd>${k}</kbd>${esc(t.label)}` : P.charging ? `Soltá ${input.isTouch ? 'SALTO' : 'Espacio'} para el súper salto` : '');
  } else ui.prompt('');
  ui.rotateHint(input.isTouch && innerHeight > innerWidth * 1.15);
  if (mapAcc > 0.2) { const mdt = mapAcc; mapAcc = 0; ui.map((c, W) => home.inside ? drawHomeMap(c, W) : drawMap(c, W, mdt)); }
  perfAcc += 0.1; if (perfAcc >= 0.5 && settings().showPerf) { perfAcc = 0; const st = perfmon.stats(); ui.perfText(`${st.fps.toFixed(0)} FPS · p50 ${st.p50} · p95 ${st.p95} ms\n${{ low: 'baja', medium: 'media', high: 'alta' }[engine.quality]}${perfmon.adapt.enabled ? ' (auto)' : ''} · res ×${engine.renderScale.toFixed(2)} · ${perf.calls} llamadas`); }
  audio.setSpeed(clamp((Math.hypot(P.vel.x, P.vel.y, P.vel.z) - 6) / 30, 0, 1));
}
function drawMap(c, W, dt = 0.2) {
  // V2 P3 (B-23): norte del minimapa = adonde mira la cámara (antes quedaba girado 180°: lo de adelante se veía abajo)
  const P = player.P, sc = W / 2 / 110, cx = W / 2, cy = W / 2, rot = cam.yaw;
  c.save(); c.fillStyle = '#25384d'; c.fillRect(0, 0, W, W);
  c.translate(cx, cy); c.rotate(rot);
  const X = x => -(x - P.pos.x) * sc, Y = z => -(z - P.pos.z) * sc;
  c.fillStyle = '#3d5368';
  for (const r of city.roads) { c.fillRect(X(r) - city.roadWidth * sc / 2, -W, city.roadWidth * sc, W * 2); c.fillRect(-W, Y(r) - city.roadWidth * sc / 2, W * 2, city.roadWidth * sc); }
  if (district) {
    c.fillStyle = '#3d5368';
    const rw = city.roadWidth * sc, zA = district.roadsZ[0], zB = district.roadsZ[district.roadsZ.length - 1], xE = district.roadsX[district.roadsX.length - 1];
    for (const z of district.roadsZ) c.fillRect(X(-199), Y(z) - rw / 2, X(xE) - X(-199), rw);
    for (const x of district.roadsX) c.fillRect(X(x) - rw / 2, Y(zA), rw, Y(zB) - Y(zA));
    c.fillStyle = '#d9b48a'; for (const h of district.mapRects()) c.fillRect(X(h.x) - h.w * sc / 2, Y(h.z) - h.d * sc / 2, h.w * sc, h.d * sc);
  }
  for (const b of city.buildings) { c.fillStyle = b.type === 'tower' ? '#8fb3cf' : b.type === 'brick' ? '#b9806a' : '#a9b2ba'; c.fillRect(X(b.x) - b.w * sc / 2, Y(b.z) - b.d * sc / 2, b.w * sc, b.d * sc); }
  const L = city.landmarks;
  c.fillStyle = '#2f6f99'; c.fillRect(X(300) - 800 * sc, -W, 800 * sc, W * 2); c.fillStyle = '#8f8a80'; c.fillRect(X(300), Y(130), (300 - 200) * sc, 260 * sc);
  c.fillStyle = '#5aa05a'; c.fillRect(X(L.parque.x) - 22 * sc, Y(L.parque.z) - 22 * sc, 44 * sc, 44 * sc);
  c.fillStyle = '#e8dcc0'; c.beginPath(); c.arc(X(L.plaza.x), Y(L.plaza.z), 8 * sc, 0, 7); c.fill();
  quests.drawMap(c, X, Y, sc);
  life.drawMap(c, X, Y);
  incidents.drawMap(c, X, Y);
  enemies.drawMap(c, X, Y);
  mapView.drawMini(c, X, Y, W, dt); // ruta y objetivo (flecha en el borde si queda lejos; ▲/▼ si está arriba o abajo)
  c.restore();
  // jugador (centro): su rumbo relativo a la cámara
  c.save(); c.translate(cx, cy); c.rotate(cam.yaw - P.yaw);
  c.fillStyle = '#6ff3ff'; c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.restore();
}
/** minimapa adentro: plano del departamento */
function drawHomeMap(c, W) {
  const P = player.P, { W: w, D: d } = home.size, sc = W / (w + 3), O = home.O;
  c.fillStyle = '#25384d'; c.fillRect(0, 0, W, W);
  c.save(); c.translate(W / 2, W / 2); c.rotate(cam.yaw);
  const X = x => -(x - O.x) * sc, Y = z => -(z - O.z) * sc;
  c.fillStyle = '#c09060'; c.fillRect(X(O.x + w / 2), Y(O.z + d / 2), w * sc, d * sc);
  for (const s of home.spots) { c.fillStyle = '#ffcf3f'; c.beginPath(); c.arc(X(s.x), Y(s.z), 4, 0, 7); c.fill(); }
  const tg = campaign.target(); if (tg && Math.abs(tg.y - P.pos.y) < 20) { c.strokeStyle = '#6ff3ff'; c.lineWidth = 3; c.beginPath(); c.arc(X(tg.x), Y(tg.z), 9, 0, 7); c.stroke(); } // objetivo adentro (ropero, cama, salida)
  c.translate(X(P.pos.x), Y(P.pos.z)); c.rotate(-P.yaw); c.fillStyle = '#6ff3ff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.fill();
  c.restore();
}
const _pv = new THREE.Vector3();
function render(draw = true) {
  // V2 P2: ropero → vista 3D de Mateo que gira (la tarjeta queda a un costado)
  if (state === 'pause' && life && life.preview && player) {
    const P = player.P, a = P.yaw + Math.sin(performance.now() * 0.0007) * 1.1, r = camera.aspect < 0.8 ? 3.4 : 2.5;
    camera.position.set(P.pos.x + Math.sin(a) * r, P.pos.y + 1.05, P.pos.z + Math.cos(a) * r);
    const rx = Math.cos(a), rz = -Math.sin(a), k = camera.aspect < 0.8 ? 0 : 0.75;
    camera.lookAt(_pv.set(P.pos.x + rx * k, P.pos.y + (camera.aspect < 0.8 ? -0.35 : 0.75), P.pos.z + rz * k)); // vertical: Mateo arriba, la tarjeta abajo
  }
  if (player) { player.render(camera, state === 'play' && settings().reticle); engine.follow(player.P.pos.x, player.P.pos.z); }
  traffic && traffic.render(); people && people.render(camera); enemies && enemies.render(camera); combat && combat.render();
  if (!draw) return;
  const t0 = performance.now();
  engine.render();
  perf.renderMs = performance.now() - t0; perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles;
}
const loop = {
  raf: 0, stopped: false,
  start() { if (!this.raf && !this.stopped) { last = 0; this.raf = requestAnimationFrame(frame); } },
  stop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },
  resetClock() { last = 0; },
};
function frame(now, synthetic = false, draw = true) {
  if (!synthetic) { loop.raf = 0; if (loop.stopped) return; }
  const raw = (now - (last || now)) / 1000, dt = Math.min(0.1, raw); last = now;
  perf.frameMs = dt * 1000; fpsAcc += dt; fpsN++; if (fpsAcc > 1) { perf.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if (!synthetic && state === 'play' && raw > 0 && raw < 5 && !document.hidden) { perfmon.record(raw * 1000); perfmon.tick(raw); }
  input.poll(dt);
  const t0 = performance.now();
  if (state !== 'pause' && state !== 'loading') { acc += dt; let n = 0; while (acc >= STEP && n < 6) { update(STEP); acc -= STEP; n++; } if (n >= 6) acc = 0; }
  else if (state === 'pause') { input.endStep(); if (input.pressed('pause') || (journalTab && input.pressed('map'))) resume(); }
  perf.updateMs = performance.now() - t0;
  render(draw);
  frames++;
  if (!synthetic) loop.raf = requestAnimationFrame(frame);
}
addEventListener('keydown', e => { if (state === 'pause' && (e.code === 'Escape' || e.code === 'KeyP') && !menus.subOpen) resume(); });

/* ---------- gancho de pruebas ---------- */
function zoneHas(x, z, m = 0) { const Z = city.zone, P = city.P_BLOCK, h = city.half; return x >= Z.bx0 * P - h - m && x <= (Z.bx1 + 1) * P - h + m && z >= Z.bz0 * P - h - m && z <= (Z.bz1 + 1) * P - h + m; }
const r3 = v => Math.round(v * 1000) / 1000;
let probeObj = null;
const hook = {
  get state() { return state; },
  get heroSource() { return heroSource; },
  get clipNames() { return hero ? hero.clips.map(c => c.name) : []; },
  get player() { if (!player) return null; const P = player.P; return { x: r3(P.pos.x), y: r3(P.pos.y), z: r3(P.pos.z), vx: r3(P.vel.x), vy: r3(P.vel.y), vz: r3(P.vel.z), speed: r3(P.speed2d), state: P.state, grounded: P.grounded, health: P.health, charging: P.charging, charge: r3(P.charge), rope: P.rope ? { x: r3(P.rope.x), y: r3(P.rope.y), z: r3(P.rope.z), len: r3(P.rope.len) } : null, anim: P.anim, oneShot: P.oneShot, gliding: P.gliding, wallClimb: !!P.wall.climb, yaw: r3(P.yaw), stats: { ...P.stats } }; },
  get camera() { return { yaw: r3(cam.C.yaw), pitch: r3(cam.C.pitch), dist: r3(cam.C.curDist), want: r3(cam.C.dist), zoom: r3(cam.C.zoomT), shoulder: r3(cam.C.shoulder), lift: r3(cam.C.lift || 0), slide: !!cam.C.slide, overHead: !!cam.C.overHead, idle: r3(cam.C.idle), mode: cam.C.mode, interior: cam.C.interior ? cam.C.interior.id : null, pushed: cam.C.pushed, occlusion: occlusion.on, x: r3(camera.position.x), y: r3(camera.position.y), z: r3(camera.position.z), fov: r3(camera.fov) }; },
  get input() { return { joy: { ...input.joy }, pad: input.pad, held: Object.fromEntries(['jump', 'cable', 'action', 'sprint'].map(b => [b, input.held(b)])) }; },
  get city() { return { ...city.stats(), landmarks: city.landmarks, signal: { ...city.signal }, medals: city.medalSpots.length }; },
  get traffic() { return traffic ? { ...traffic.info(), stats: { ...traffic.stats } } : null; },
  get streaming() { return streaming ? streaming.info() : null; },
  get district() { return district ? { rect: district.rect, roadsX: district.roadsX, roadsZ: district.roadsZ, blocks: district.blocks.map(b => ({ id: b.id, cx: b.cx, cz: b.cz, park: !!b.park, houses: b.houses.length })), permBoxes: district.permBoxes.length } : null; },
  get zone() { return { zone: city.zone, detail: { ...city.detail }, shops: city.shops.length, parkingBays: city.parkingBays.length, parked: city.parkedBoxes.length, trees: city.trees.length, benches: city.benches.length, houses: city.houses.length, lampsZone: city.lamps.filter(l => zoneHas(l[0], l[2])).length, treesZone: city.trees.filter(t => zoneHas(t[0], t[1])).length, shopsZone: city.shops.filter(s => zoneHas(s.x, s.z)).length, awningsZone: city.camWorld.boxes.filter(b => b.kind === 'awning' && zoneHas((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2)).length, signalsZone: city.intersections.filter(i => zoneHas(i.x, i.z, 8)).length }; },
  get people() { return people ? people.info() : null; },
  get enemies() { return enemies ? enemies.info() : null; },
  get villains() { return villains ? villains.info() : null; },
  get combat() { return combat ? combat.info() : null; },
  get incidents() { return incidents ? incidents.info() : null; },
  get quests() { return quests ? quests.info() : null; },
  get questStep() { return quests ? quests.stepPoint() : null; },
  get save() { return structuredClone(S()); },
  get perf() { const m = /** @type {any} */ (performance).memory; return { ...perf, ...perfmon.stats(), heapMB: m ? +(m.usedJSHeapSize / 1048576).toFixed(1) : null, frames, simTime: r3(simTime), geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs ? renderer.info.programs.length : null }; },
  get quality() { return { q: engine.quality, dpr: renderer.getPixelRatio(), scale: engine.renderScale, auto: perfmon.adapt, shadows: renderer.shadowMap.enabled, fogFar: scene.fog.far, far: camera.far, traffic: traffic ? traffic.info().count : 0, people: people ? people.info().count : 0, particles: engine.preset.particles }; },
  get ui() { return { big: ui.bigText, prompt: ui.E.prompt.hidden ? '' : ui.E.prompt.textContent, dialog: ui.E.dialog.hidden ? '' : ui.E.dialog.textContent, screen: ui.screenOpen }; },
  get tune() { return { ...TUNE }; },
  get life() { return life ? life.info() : null; },
  get campaign() { return campaign ? campaign.info() : null; },
  get map() { return mapView ? { route: mapView.routePts, goal: mapView.goal(), journal: journalTab, notes: ui.notes, notesLog: ui.notesLog } : null; },
  get home() { return home ? home.info() : null; },
  get wardrobe() { return wardrobe ? wardrobe.info() : null; },
  get vehicles() { return vehicles ? vehicles.info() : null; },
  get time() { return { ...engine.time, phase: run.dayPhase || 0, glass: mats.glass0.emissiveIntensity, hour: +clock.hour.toFixed(3), day: clock.day, minutes: +clock.minutes.toFixed(2), clockPhase: clock.phase, schedule: dayPhaseName(), lamps: +nightLights.level.toFixed(2), headlights: traffic ? +traffic.night.toFixed(2) : 0, trafficTarget: traffic ? traffic.target : 0, label: clock.label(), paused: state !== 'play' && state !== 'dialog' }; },
  get locomotion() { return player ? { stride: player.stride, ...player.loco } : null; },
  get animWeights() { if (!player) return {}; const o = {}; for (const [k, a] of Object.entries(player.actions)) { const w = a.getEffectiveWeight(); if (a.isRunning() || (a.enabled && a.isScheduled() && w > 0.001)) o[k] = +w.toFixed(3); } return o; },
};
if (DEBUG) {
  /** @type {any} */ (hook).debug = {
    _three() { return { scene, renderer, camera, THREE, city, engine, people, traffic, villains }; },
    simulate(sec, draw = true) { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) update(STEP); render(draw); },
    /** corre el bucle real (acumulador + pasos fijos + render) con cuadros sintéticos de ms milisegundos */
    frames(count, ms, draw = false) { let t = last || 1000; for (let i = 0; i < count; i++) { t += ms; frame(t, true, draw); } render(true); },
    probe() { if (!probeObj) probeObj = createProbe({ renderer, scene, camera, hero, world: city.world, occlusionMaterial: () => occlusion.patch(new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, toneMapped: false })) }); return { ...probeObj.visibility(), inside: probeObj.cameraInside() }; },
    /** alimenta la telemetría con cuadros de ms y evalúa el modo automático (determinista) */
    feedPerf(ms, seconds) { const n = Math.round(seconds * 1000 / ms); for (let i = 0; i < n; i++) { perfmon.record(ms); perfmon.tick(ms / 1000); } return { q: engine.quality, scale: engine.renderScale, adapt: perfmon.adapt }; },
    setAutoQuality(on, upTo = 'high') { perfmon.setAuto(on, upTo); },
    loop(on) { if (on) { loop.stopped = false; loop.start(); } else { loop.stopped = true; loop.stop(); } },
    teleport(x, y, z) { streaming.ensure(x, z); player.teleport(x, y, z); track.skip = 1; },
    /** mueve a Mateo sin tocar su último punto seguro (como si hubiera llegado saltando) */
    place(x, y, z) { streaming.ensure(x, z); player.P.pos.set(x, y, z); player.P.vel.set(0, 0, 0); player.P.visY = y; track.skip = 1; },
    track(on = true) { Object.assign(track, { on, steps: 0, maxJump: 0, jumps: [], inside: [], respawns: 0, skip: 1 }); },
    get tracked() { return { steps: track.steps, maxJump: +track.maxJump.toFixed(3), jumps: track.jumps, inside: track.inside, respawns: track.respawns }; },
    solidAt(x, y, z) { return solidAt(x, y, z); },
    hasFloor(x, z) { return city.world.hasFloor(x, z); },
    setVel(x, y, z) { player.P.vel.set(x, y, z); },
    face(yaw) { player.P.yaw = yaw; },
    look(yaw, pitch) { cam.C.yaw = yaw; if (pitch !== undefined) cam.C.pitch = pitch; },
    freeze(on = true) { debug.freeze = on; },
    hurt(n) { player.damage(n, player.P.pos.x + 1, player.P.pos.z); },
    setHealth(n) { player.P.health = n; },
    findAnchor() { return player.findAnchor(cam.yaw, cam.pitch); },
    ray(ox, oy, oz, dx, dy, dz, far) { const h = city.world.raycast(ox, oy, oz, dx, dy, dz, far); return h && { x: h.x, y: h.y, z: h.z, t: h.t, kind: h.box.kind, nx: h.nx, nz: h.nz }; },
    anchorAt(x, y, z) { player.attach({ x, y, z, nx: 0, ny: 0, nz: 0, t: 10 }); },
    quest: id => quests.debugStart(id),
    completeStep: () => quests.debugStep(),
    medal: i => quests.debugMedal(i),
    setHora(h) { settings().hora = h; save.flush(); applySettings(); },
    /** V2 P2: pone el reloj en la hora h (mismo día) y aplica luces/horarios */
    setHour(h) { clock.setHour(h); S().clock.hour = clock.hour; applyTime(); },
    advanceTo(h) { clock.advanceTo(h); S().clock.hour = clock.hour; S().clock.day = clock.day; applyTime(); },
    set(k, v) { settings()[k] = v; save.flush(); applySettings(); },
    give: pts => { S().points += pts; save.flush(); },
    validateCity() { return nav.validate(city.world); },
    /** fuerza un incidente (tipo, cerca de x,z opcional) y devuelve {ok, id | reason} */
    incident(type, x, z) { return incidents.force(type, x !== undefined ? { near: { x, z } } : {}); },
    incidentSeed(n) { incidents.seed(n); villains.reseed(n * 7 + 1); },
    incidentNext(t) { incidents.setNext(t); },
    cancelIncidents() { incidents.cancelAll('debug'); },
    /** villano suelto para probar el combate: tipo, posición y estado inicial */
    villain(type, x, z, st = 'confront') { const v = villains.spawn(type, x, z, { yaw: Math.atan2(player.P.pos.x - x, player.P.pos.z - z) }); v.state = st; return v.id; },
    clearVillains() { villains.clearAll(); },
    sceneStats() { const g = new Set(); let meshes = 0; scene.traverse(o => { if (o.geometry) { g.add(o.geometry.uuid); meshes++; } }); return { meshes, sceneGeometries: g.size, rendererGeometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
    unloadSectors() { streaming.unloadAll(); },
    trafficOverlaps() { return traffic.overlaps(); },
    /** V2 P2: arranque «clásico» de las pruebas V1/P0/P1: de héroe, afuera, en la plaza (como antes de P2) */
    // V2 P3 (B-28): también reinicia el reloj de «cámara quieta» (autoCam): antes dependía de cuántos cuadros reales corrían
    // antes de detener el bucle → la cámara se alineaba sola en otro momento y las trayectorias de las pruebas cambiaban con la carga
    classicStart() { cam.C.idle = 0; if (vehicles.driving) leaveKart(true); life.setMode('hero', true); if (home.inside) { exitHome(true); player.teleport(city.landmarks.plaza.x - 6, 0.5, city.landmarks.plaza.z - 26); cam.snapBehind(Math.PI * 0.1); track.skip = 1; } save.flush(); }, // una partida guardada afuera conserva su posición (como antes)
    enterHome(spawn = 'door') { return enterHome(spawn); },
    exitHome() { return exitHome(); },
    setMode(m) { return life.setMode(m); },
    giveMoney(n) { return economy.earn({ transactionId: economy.newTx('debug'), credits: n, what: 'debug' }); },
    buy(store, sku, tx) { return life.buy(store, sku, tx || economy.newTx('dbg')); },
    eat(sku, from = 'inv') { return life.eat(sku, from); },
    startJob(id) { return life.startJob(id); },
    jobStep() { life.debugJobStep(); },
    callKart() { return vehicles.callToGarage(); },
    leaveKart(force = false) { return leaveKart(force); },
    /** mueve el kart (estacionado o manejado) a (x,z) con rumbo yaw: prueba de colisiones y de peatones */
    placeKart(x, z, yaw) { const k = vehicles.kart; if (!k || !vehicles.driving) return false; k.x = x; k.z = z; k.yaw = yaw; k.v = k.vx = k.vz = 0; k.y = Math.max(0, city.world.groundAt(x, z, 2)); streaming.ensure(x, z); player.P.pos.set(x, k.y, z); return true; }, // sólo manejando (el estacionado tiene su caja de colisión)
    homeAudit() { return home.audit(solidAt); },
    homeSpot(id) { const s = id === 'entrar' ? home.entry : id === 'outside' ? home.outside : id === 'garage' ? { ...home.garage, y: 0 } : id === 'garageSign' ? life.stores.find(x => x.st.id === 'taller_urbano').spot : home.spots.find(x => x.id === id); return s ? { x: s.x, y: s.y || 0, z: s.z } : null; },
    /** cuenta objetos de la escena, geometrías y cajas de colisión (pruebas de fugas) */
    leakStats() { const g = new Set(); let meshes = 0, objs = 0; scene.traverse(o => { objs++; if (o.geometry) { g.add(o.geometry.uuid); meshes++; } }); return { objs, meshes, sceneGeometries: g.size, rendererGeometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, boxes: city.world.boxes.length, children: scene.children.length, lights: scene.children.filter(o => o.isLight).length }; },
    openLife(k) { life.open(k); },
    /** V2 P3: campaña — completa el paso actual (atajo de prueba) / activa una misión / abre el mapa o el diario */
    campaignStep() { campaign.debugStep(); return campaign.info(); },
    campaignActivate(id) { return campaign.activate(id); },
    openJournal(tab = 'mapa') { openJournal(tab); return journalTab; },
    cityRaw() { return { shops: city.shops, houses: city.houses.map(h => ({ x: h.x, z: h.z, w: h.w, d: h.d, h: h.h, block: h.block })), bays: city.parkingBays, parked: city.parkedBoxes.map(b => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 })), roads: city.roads, roadWidth: city.roadWidth }; },
  };
}
/** @type {any} */ (window).__mateo = Object.freeze(hook);

boot().catch(e => { console.error(e); ui.screen(`<h2>Error al iniciar</h2><p>${esc(e.message)}</p>`); });
