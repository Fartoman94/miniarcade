// Mateo: Ciudad de Altura — guardado local versionado (autoguardado) con migración y recuperación de datos corruptos.
// Clave: 'mateo-ciudad:save'. Si el JSON está roto se copia a 'mateo-ciudad:save:corrupto' y se arranca de cero.
// V2 P2 (versión 2): modo civil/héroe, billetera con libro de transacciones (ids idempotentes), mochila y heladera,
// vestuario, departamento (adentro/afuera, decoración), reloj del mundo, trabajos, karts y comida. Migración 1 → 2:
// las partidas V1 eran de héroe y empezaban en la plaza: conservan todo, quedan en modo héroe y afuera del departamento.
// V2 P3 (versión 3): campaña encadenada (misión y paso actuales, progreso del paso, estados, diario, distritos
// descubiertos, nivel de reputación) y filtros del mapa. Migración 2 → 3: todo se conserva y la campaña empieza de cero.
import { DEFAULT_KEYS } from './input.js';

export const SAVE_KEY = 'mateo-ciudad:save';
export const SAVE_VERSION = 3;
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DEFAULTS = {
  started: false, pos: null, points: 0, medals: [], quests: {}, unlocked: { glide: false },
  stats: { playTime: 0, swings: 0, superJumps: 0, rescued: 0, drones: 0, thieves: 0, automatons: 0, incidents: 0 },
  // V2 P1: reputación local por distrito y cantidad de incidentes resueltos por tipo (sólo se guarda lo COMPLETADO)
  rep: { centro: 0, sol: 0, puerto: 0 }, inc: { bolso: 0, comercio: 0, fuga: 0, dron: 0 },
  // V2 P2: identidad y simulación (ver arriba). Una partida nueva empieza de civil, adentro del departamento.
  mode: 'civil',
  wallet: { balance: 300, processed: [], ledger: [] },
  inv: {}, fridge: {},
  wardrobe: { owned: [], civil: { top: 'remera_blanca', pants: 'pantalon_azul', shoes: 'zapatillas_blancas', accessory: 'ninguno' }, suit: 'heroe_m_azul' },
  home: { inside: true, decor: [] },
  clock: { hour: 10, day: 1 },
  jobs: {},
  cars: { owned: [], active: null, out: null, seq: 0 },
  buff: { fed: 0 },
  // V2 P3: campaña (los estados de cada misión los completa campaign.js con game/data/misiones.json)
  campaign: { status: {}, cur: null, step: 0, prog: { n: 0, roofs: [] }, done: {}, journal: [], fails: 0, visited: [], tier: 0 },
  settings: { quality: 'auto', sensitivity: 1, invertY: false, autoCam: true, reducedMotion: reduced, volume: 0.8, muted: false, cableMode: 'toggle', buttonScale: 1, haptics: true, reticle: true, easy: false, autoTarget: true, incidents: true, hora: 'ciclo', dayMinutes: 24, camZoom: 1, fov: 60, occlusionFade: true, showPerf: false, mapFilters: { tiendas: true, misiones: true, ayuda: true, lugares: true }, binds: { ...DEFAULT_KEYS } },
};
const QUEST_STATUS = ['locked', 'available', 'active', 'complete'];
// V2 P3 (B-24): el Barrio del Sol llega hasta x = −404 (distritos.json); antes el saneo descartaba todo lo guardado al oeste
// de x = −275 (posición y kart estacionado) y la partida volvía a la plaza. El juego valida después piso firme y sólidos.
const WORLD_MIN_X = -410;

function sanitize(d) {
  const D = structuredClone(DEFAULTS);
  const o = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  const num = (v, lo, hi, def) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
  const out = D;
  out.started = o.started === true;
  // V2: rectángulo del mundo (antes un círculo de 210 m descartaba el Puerto y las esquinas de la ciudad)
  out.pos = Array.isArray(o.pos) && o.pos.length === 3 && o.pos.every(Number.isFinite) && o.pos[0] > WORLD_MIN_X && o.pos[0] < 340 && Math.abs(o.pos[2]) < 275 && o.pos[1] >= 0 && o.pos[1] < 200 ? o.pos : null;
  out.points = Math.round(num(o.points, 0, 1e9, 0));
  out.medals = Array.isArray(o.medals) ? [...new Set(o.medals.filter(n => Number.isInteger(n) && n >= 0 && n < 200))] : [];
  if (o.quests && typeof o.quests === 'object' && !Array.isArray(o.quests)) for (const [id, q] of Object.entries(o.quests)) {
    if (!/^[a-z0-9_]{1,30}$/.test(id) || !q || typeof q !== 'object') continue;
    out.quests[id] = { status: QUEST_STATUS.includes(q.status) ? q.status : 'available', step: Math.round(num(q.step, 0, 50, 0)), best: num(q.best, 0, 1e5, 0) || 0, times: Math.round(num(q.times, 0, 1e5, 0)) };
  }
  if (o.unlocked && typeof o.unlocked === 'object') for (const k of Object.keys(D.unlocked)) out.unlocked[k] = o.unlocked[k] === true;
  if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(D.stats)) out.stats[k] = num(o.stats[k], 0, 1e9, 0);
  if (o.rep && typeof o.rep === 'object') for (const k of Object.keys(D.rep)) out.rep[k] = Math.round(num(o.rep[k], -100, 1e6, 0));
  if (o.inc && typeof o.inc === 'object') for (const k of Object.keys(D.inc)) out.inc[k] = Math.round(num(o.inc[k], 0, 1e6, 0));
  // V2 P2
  const ID = v => typeof v === 'string' && /^[a-z0-9_]{1,40}$/.test(v);
  const counts = (m, max = 99) => { const r = {}; if (m && typeof m === 'object' && !Array.isArray(m)) for (const [k, v] of Object.entries(m)) if (ID(k) && Number.isInteger(v) && v > 0) r[k] = Math.min(max, v); return r; };
  out.mode = o.mode === 'hero' ? 'hero' : o.mode === 'civil' ? 'civil' : D.mode;
  const w = o.wallet && typeof o.wallet === 'object' ? o.wallet : null;
  if (w) {
    out.wallet.balance = Number.isSafeInteger(w.balance) && w.balance >= 0 ? Math.min(w.balance, 1e7) : D.wallet.balance;
    out.wallet.processed = Array.isArray(w.processed) ? [...new Set(w.processed.filter(x => typeof x === 'string' && x.length < 80))].slice(-400) : [];
    out.wallet.ledger = Array.isArray(w.ledger) ? w.ledger.filter(e => e && typeof e === 'object' && typeof e.id === 'string' && Number.isSafeInteger(e.delta)).slice(-40).map(e => ({ id: e.id, delta: e.delta, what: String(e.what || '').slice(0, 40), bal: Number.isSafeInteger(e.bal) ? e.bal : 0 })) : [];
  }
  out.inv = counts(o.inv); out.fridge = counts(o.fridge);
  const wr = o.wardrobe && typeof o.wardrobe === 'object' ? o.wardrobe : {};
  out.wardrobe.owned = Array.isArray(wr.owned) ? [...new Set(wr.owned.filter(ID))].slice(0, 60) : [];
  if (wr.civil && typeof wr.civil === 'object') for (const k of ['top', 'pants', 'shoes', 'accessory']) if (ID(wr.civil[k])) out.wardrobe.civil[k] = wr.civil[k];
  if (ID(wr.suit)) out.wardrobe.suit = wr.suit;
  const hm = o.home && typeof o.home === 'object' ? o.home : {};
  out.home.inside = typeof hm.inside === 'boolean' ? hm.inside : D.home.inside;
  out.home.decor = Array.isArray(hm.decor) ? [...new Set(hm.decor.filter(ID))].slice(0, 12) : [];
  if (o.clock && typeof o.clock === 'object') { out.clock.hour = num(o.clock.hour, 0, 23.999, 10); out.clock.day = Math.round(num(o.clock.day, 1, 1e6, 1)); }
  if (o.jobs && typeof o.jobs === 'object' && !Array.isArray(o.jobs)) for (const [k, j] of Object.entries(o.jobs)) if (ID(k) && j && typeof j === 'object') out.jobs[k] = { runs: Math.round(num(j.runs, 0, 1e6, 0)), last: num(j.last, -1e9, 1e12, -1e9) };
  const cr = o.cars && typeof o.cars === 'object' ? o.cars : {};
  out.cars.owned = Array.isArray(cr.owned) ? cr.owned.filter(c => c && ID(c.sku) && Number.isInteger(c.uid)).slice(0, 6).map(c => ({ uid: c.uid, sku: c.sku, color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : null, mods: Array.isArray(c.mods) ? [...new Set(c.mods.filter(ID))] : [], health: num(c.health, 0, 100, 100) })) : [];
  out.cars.seq = Math.round(num(cr.seq, 0, 1e6, out.cars.owned.reduce((m, c) => Math.max(m, c.uid), 0)));
  out.cars.active = out.cars.owned.some(c => c.uid === cr.active) ? cr.active : null;
  const co = cr.out;
  out.cars.out = co && out.cars.owned.some(c => c.uid === co.uid) && [co.x, co.z, co.yaw].every(Number.isFinite) && co.x > WORLD_MIN_X && co.x < 340 && Math.abs(co.z) < 275 ? { uid: co.uid, x: co.x, z: co.z, yaw: co.yaw } : null;
  if (o.buff && typeof o.buff === 'object') out.buff.fed = num(o.buff.fed, 0, 3600, 0);
  // V2 P3: campaña (se descarta lo que no tenga forma válida; nunca se inventan misiones cumplidas)
  const cp = o.campaign && typeof o.campaign === 'object' && !Array.isArray(o.campaign) ? o.campaign : {};
  const MST = ['locked', 'available', 'active', 'completed', 'failed'];
  if (cp.status && typeof cp.status === 'object') for (const [k, v] of Object.entries(cp.status)) if (ID(k) && MST.includes(v)) out.campaign.status[k] = v;
  out.campaign.cur = ID(cp.cur) && out.campaign.status[cp.cur] && ['active', 'failed'].includes(out.campaign.status[cp.cur]) ? cp.cur : null;
  out.campaign.step = out.campaign.cur ? Math.round(num(cp.step, 0, 30, 0)) : 0;
  const pg = cp.prog && typeof cp.prog === 'object' ? cp.prog : {};
  out.campaign.prog = out.campaign.cur ? { n: num(pg.n, 0, 1e4, 0), roofs: Array.isArray(pg.roofs) ? [...new Set(pg.roofs.filter(r => typeof r === 'string' && /^-?\d+,-?\d+$/.test(r)))].slice(0, 10) : [] } : { n: 0, roofs: [] };
  if (cp.done && typeof cp.done === 'object') for (const [k, v] of Object.entries(cp.done)) if (ID(k) && out.campaign.status[k] === 'completed' && v && typeof v === 'object') out.campaign.done[k] = { d: Math.round(num(v.d, 1, 1e6, 1)), h: String(v.h || '').slice(0, 8) };
  out.campaign.journal = Array.isArray(cp.journal) ? cp.journal.filter(e => e && typeof e === 'object' && typeof e.t === 'string').slice(-40).map(e => ({ d: Math.round(num(e.d, 1, 1e6, 1)), h: String(e.h || '').slice(0, 8), i: String(e.i || '•').slice(0, 4), t: e.t.slice(0, 90) })) : [];
  out.campaign.fails = Math.round(num(cp.fails, 0, 1e6, 0));
  out.campaign.visited = Array.isArray(cp.visited) ? [...new Set(cp.visited.filter(v => ['centro', 'sol', 'puerto'].includes(v)))] : [];
  out.campaign.tier = Math.round(num(cp.tier, 0, 10, 0));
  const s = o.settings && typeof o.settings === 'object' ? o.settings : {};
  out.settings = {
    quality: ['auto', 'low', 'medium', 'high'].includes(s.quality) ? s.quality : 'auto',
    sensitivity: num(s.sensitivity, 0.3, 3, 1), invertY: s.invertY === true, autoCam: s.autoCam !== false,
    reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : reduced,
    volume: num(s.volume, 0, 1, 0.8), muted: s.muted === true, cableMode: ['toggle', 'hold'].includes(s.cableMode) ? s.cableMode : 'toggle',
    buttonScale: num(s.buttonScale, 0.8, 1.4, 1), haptics: s.haptics !== false, reticle: s.reticle !== false, easy: s.easy === true, autoTarget: s.autoTarget !== false, incidents: s.incidents !== false, hora: ['dia', 'atardecer', 'noche', 'ciclo'].includes(s.hora) ? s.hora : 'ciclo', dayMinutes: [12, 24, 48].includes(s.dayMinutes) ? s.dayMinutes : 24,
    camZoom: num(s.camZoom, 0.7, 1.6, 1), fov: num(s.fov, 50, 80, 60), occlusionFade: s.occlusionFade !== false, showPerf: s.showPerf === true,
    mapFilters: Object.fromEntries(['tiendas', 'misiones', 'ayuda', 'lugares'].map(k => [k, !(s.mapFilters && s.mapFilters[k] === false)])),
    binds: { ...DEFAULT_KEYS },
  };
  if (s.binds && typeof s.binds === 'object') for (const k of Object.keys(DEFAULT_KEYS)) if (typeof s.binds[k] === 'string' && /^[A-Za-z0-9]+$/.test(s.binds[k])) out.settings.binds[k] = s.binds[k];
  return out;
}
/** migraciones por versión (v0 = guardado del prototipo sin versión; v1 = V1/V2 P0–P1) */
export function migrate(d, from) {
  if (from < 1) d = { started: !!d.started, points: d.score || 0 };
  // v1 → v2: era una partida de héroe que empezaba en la plaza; sin billetera ni vestuario (quedan los valores iniciales)
  if (from < 2) d = { ...d, mode: 'hero', home: { inside: false, decor: [] }, settings: { ...(d.settings || {}), hora: d.settings && d.settings.hora ? d.settings.hora : 'dia' } };
  // v2 → v3: se conserva todo; la campaña (nueva) arranca desde la primera misión
  if (from < 3) d = { ...d, campaign: undefined };
  return d;
}

export function createSave() {
  let data = structuredClone(DEFAULTS), recovered = false, migratedFrom = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') throw new Error('formato');
      const v = typeof p.v === 'number' ? p.v : 0;
      data = sanitize(v === SAVE_VERSION ? p.d : migrate(p.d || p, v));
      if (v !== SAVE_VERSION) { migratedFrom = v; try { localStorage.setItem(`${SAVE_KEY}:v${v}`, raw); } catch (_) { /* sin lugar: igual se migra */ } } // respaldo de la versión anterior
    }
  } catch (e) {
    try { const bad = localStorage.getItem(SAVE_KEY); if (bad) localStorage.setItem(SAVE_KEY + ':corrupto', bad); } catch (_) { /* nada */ }
    data = structuredClone(DEFAULTS); recovered = true;
  }
  const api = {
    get data() { return data; },
    get recovered() { return recovered; },
    get migratedFrom() { return migratedFrom; },
    flush() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, d: data })); } catch (e) { /* sin almacenamiento */ } },
    resetProgress() { const st = data.settings; data = structuredClone(DEFAULTS); data.settings = st; api.flush(); },
  };
  api.flush();
  return api;
}
