// @ts-check
/* Granja de Runas — datos y reglas puras (sin Three.js): cultivos, estaciones, economía, pedidos,
   dificultad, guardado versionado y su saneamiento. Todo determinista (sin Math.random). */
import { rng } from '../../matelabs/kit3d.js';

export const GAME_ID = 'granja_runas';
export const SAVE_KEY = GAME_ID + ':save';
export const SAVE_VERSION = 2;

/** Minutos de juego por segundo real. Día jugable 6:00→24:00 = 1080 min = 135 s. */
export const MIN_PER_SEC = 8;
export const DAY_START = 360, DAY_END = 1440, SLEEP_FROM = 1080;
export const DAYS_PER_SEASON = 3;
export const SEASONS = [
  { id: 'primavera', name: 'Primavera', icon: '🌸' },
  { id: 'verano', name: 'Verano', icon: '☀️' },
  { id: 'otono', name: 'Otoño', icon: '🍂' },
  { id: 'invierno', name: 'Invierno', icon: '❄️' },
];
/** @param {number} day */
export const seasonOf = day => Math.floor((day - 1) / DAYS_PER_SEASON) % 4;

/* ---------- cultivos ----------
   grow: minutos de juego regados para madurar. mult: multiplicador de crecimiento por estación. */
export const CROPS = {
  nabo: { name: 'Nabo rúnico', icon: '🟣', seed: 5, sell: 16, grow: 300, mult: [1.2, 1, 1, 0.8] },
  zanahoria: { name: 'Zanahoria', icon: '🥕', seed: 10, sell: 30, grow: 480, mult: [1.1, 1.2, 1, 0.7] },
  trigo: { name: 'Trigo dorado', icon: '🌾', seed: 6, sell: 18, grow: 420, mult: [1, 1.3, 1.1, 0.6] },
  calabaza: { name: 'Calabaza', icon: '🎃', seed: 20, sell: 75, grow: 900, mult: [0.9, 1, 1.4, 0.6] },
  arcoiris: { name: 'Flor arcoíris', icon: '🌈', seed: 0, sell: 160, grow: 600, mult: [1, 1, 1, 1] },
};
export const SEED_ORDER = ['nabo', 'zanahoria', 'trigo', 'calabaza', 'arcoiris'];
/** Objetos del inventario: nombre e ícono. */
export const ITEMS = {
  nabo: ['Nabo', '🟣'], zanahoria: ['Zanahoria', '🥕'], trigo: ['Trigo', '🌾'], calabaza: ['Calabaza', '🎃'], arcoiris: ['Flor arcoíris', '🌈'],
  harina: ['Harina', '🥖'], huevo: ['Huevo', '🥚'], lana: ['Lana', '🧶'], leche: ['Leche de cabra', '🥛'],
  madera: ['Madera', '🪵'], cristal: ['Cristal rúnico', '💎'], fragmento: ['Fragmento de runa', '✨'], rocio: ['Rocío de espíritu', '💧'],
  forraje: ['Forraje', '🌿'], runa: ['Runa de tormenta', '🌀'],
};
export const SELLABLE = ['nabo', 'zanahoria', 'trigo', 'calabaza', 'arcoiris', 'harina', 'huevo', 'lana', 'leche'];
export const BASE_PRICE = { nabo: 16, zanahoria: 30, trigo: 18, calabaza: 75, arcoiris: 160, harina: 55, huevo: 22, lana: 40, leche: 32 };
export const ANIMALS = {
  gallina: { name: 'Gallina Pochi', icon: '🐔', price: 40, product: 'huevo', where: 'mercado' },
  oveja: { name: 'Oveja Nube', icon: '🐑', price: 90, product: 'lana', where: 'mercado' },
  cabra: { name: 'Cabrita Runa', icon: '🐐', price: 0, product: 'leche', where: 'bosque' },
};
export const TOOLS = {
  regadera: { name: 'Regadera', icon: '🚿', levels: [{ cap: 4 }, { cap: 8, cost: 80, cristal: 1 }, { cap: 14, cost: 180, cristal: 3 }] },
  azada: { name: 'Azada', icon: '⛏️', levels: [{ hits: 2 }, { hits: 1, cost: 90, madera: 3 }, { hits: 1, cost: 200, cristal: 2, madera: 4 }] },
  botas: { name: 'Botas', icon: '🥾', levels: [{ speed: 4.6 }, { speed: 5.6, cost: 70 }, { speed: 6.6, cost: 160, madera: 2 }] },
};
/** Requisitos de la Feria de Cosechas (misión principal 2). */
export const FERIA_REQ = { zanahoria: 4, trigo: 5, calabaza: 2, huevo: 1 };
/** Requisitos del Invernadero Mágico (misión principal 3). */
export const INV_REQ = { madera: 8, cristal: 4, monedas: 200, runa: 1 };
export const MILL_REQ = { madera: 6, cristal: 2, monedas: 60 };
export const MERCHANT_TARGET = 10;

/* ---------- dificultad: tabla real de efectos ---------- */
export const DIFFICULTY = {
  facil: { growth: 1.3, price: 1.2, pest: 1.7, energy: 0.7, telegraph: 4.2, rescue: 0.4, label: 'Fácil' },
  normal: { growth: 1, price: 1, pest: 1, energy: 1, telegraph: 3.0, rescue: 0.5, label: 'Normal' },
  dificil: { growth: 0.85, price: 0.9, pest: 0.75, energy: 1.2, telegraph: 2.4, rescue: 0.55, label: 'Difícil' },
  extremo: { growth: 0.7, price: 0.8, pest: 0.55, energy: 1.4, telegraph: 1.8, rescue: 0.6, label: 'Extremo' },
};

/* ---------- calidad gráfica ---------- */
export const QUALITY = {
  low: { fog: [26, 58], flora: 0.35, particles: 60, rain: 250 },
  medium: { fog: [34, 85], flora: 0.7, particles: 140, rain: 600 },
  high: { fog: [45, 120], flora: 1, particles: 240, rain: 1100 },
};

export const PLOTS = 12, GREEN_PLOTS = 6, DECOR_SLOTS = 4;

/* ---------- guardado ---------- */
function plotsDefault() {
  const out = [];
  for (let i = 0; i < PLOTS; i++) out.push({ s: i === 5 || i === 6 ? 'vacia' : (i % 3 === 1 ? 'roca' : 'maleza'), crop: '', g: 0, w: 0, frost: 0, hits: 0 });
  return out;
}
export function defaults() {
  return {
    seed: 20261010, day: 1, min: DAY_START, coins: 40, energy: 100, earned: 0, scene: 'granja',
    px: -3, pz: 8,
    inv: { nabo: 0, zanahoria: 0, trigo: 0, calabaza: 0, arcoiris: 0, harina: 0, huevo: 0, lana: 0, leche: 0, madera: 0, cristal: 0, fragmento: 0, rocio: 0, forraje: 2, runa: 0 },
    seeds: { nabo: 5, zanahoria: 0, trigo: 3, calabaza: 0, arcoiris: 0 },
    seedSel: 'nabo', water: 0,
    tools: { regadera: 0, azada: 0, botas: 0 },
    plots: plotsDefault(),
    green: Array.from({ length: GREEN_PLOTS }, () => ({ s: 'vacia', crop: '', g: 0, w: 0, frost: 0, hits: 0 })),
    animals: { gallina: { own: false, fed: false, ready: false }, oveja: { own: false, fed: false, ready: false }, cabra: { own: false, fed: false, ready: false } },
    decor: /** @type {string[]} */ (['', '', '', '']), decorInv: { farol: 0, banco: 0, maceta: 0, espantapajaros: 0 },
    mill: false, merchant: 0,
    feria: { done: false, got: { zanahoria: 0, trigo: 0, calabaza: 0, huevo: 0 } },
    inv3: { done: false, got: { madera: 0, cristal: 0, monedas: 0, runa: 0 } },
    huerta: { cleared: 0, harvested: 0, done: false },
    orders: { day: 0, list: /** @type {{who:string,item:string,qty:number,reward:number,done:boolean}[]} */ ([]) },
    stock: { day: 0, nabo: 6, zanahoria: 5, trigo: 6, calabaza: 3 },
    forest: { day: 0, bush: [true, true, true, true, true], log: [true, true, true, true], crystal: [true, true, true] },
    sold: { day: 0, n: /** @type {Record<string,number>} */ ({}) },
    storm: { state: 'none', day: 0, tries: 0, best: 0 },
    flags: { rainbow: false, victory: false, animalsDone: false, merchantDone: false, millDone: false },
    stats: { harvest: 0, shooPest: 0, shooCrow: 0, calm: 0, orders: 0, faints: 0, cropsLost: 0 },
    tutorial: { done: false, step: 0 },
    keys: { usar: 'KeyE', semilla: 'KeyQ', camIzq: 'KeyZ', camDer: 'KeyX', diario: 'KeyJ' },
    /** sensibilidad de cámara (paso de giro y suavizado): 0.6 · 1 · 1.5 */
    sens: 1,
    best: 0,
  };
}
/** @typedef {ReturnType<typeof defaults>} SaveData */

/** Migración desde la v1 (prototipo: sin invernadero ni teclas configurables). @param {any} old @param {number} from */
export function migrate(old, from) {
  const d = defaults();
  if (!old || typeof old !== 'object') return d;
  if (from === 1) {
    // v1 guardaba las monedas como `money` y no tenía `keys` ni `green`
    if (typeof old.money === 'number') old.coins = old.money;
    delete old.money;
  }
  return sanitize(Object.assign(d, old));
}

const isNum = v => typeof v === 'number' && isFinite(v);
/** Repara datos fuera de forma (un guardado editado o a medio escribir no debe romper el juego). @param {any} s */
export function sanitize(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  for (const k of Object.keys(d)) {
    const dv = /** @type {any} */ (d)[k], sv = s[k];
    if (sv === undefined || sv === null || typeof sv !== typeof dv || Array.isArray(dv) !== Array.isArray(sv)) s[k] = dv;
    else if (typeof dv === 'object' && !Array.isArray(dv)) {
      for (const kk of Object.keys(dv)) if (typeof sv[kk] !== typeof dv[kk] || (typeof dv[kk] === 'number' && !isNum(sv[kk]))) sv[kk] = dv[kk];
    }
  }
  if (s.plots.length !== PLOTS || s.plots.some(p => !p || typeof p.s !== 'string')) s.plots = d.plots;
  if (s.green.length !== GREEN_PLOTS || s.green.some(p => !p || typeof p.s !== 'string')) s.green = d.green;
  for (const p of [...s.plots, ...s.green]) {
    if (!['maleza', 'roca', 'vacia', 'cultivo'].includes(p.s)) p.s = 'vacia';
    if (p.s === 'cultivo' && !CROPS[p.crop]) { p.s = 'vacia'; p.crop = ''; }
    for (const k of ['g', 'w', 'frost', 'hits']) if (!isNum(p[k])) p[k] = 0;
  }
  if (!Array.isArray(s.decor) || s.decor.length !== DECOR_SLOTS) s.decor = d.decor;
  if (!['granja', 'mercado', 'bosque'].includes(s.scene)) s.scene = 'granja';
  if (!SEED_ORDER.includes(s.seedSel)) s.seedSel = 'nabo';
  s.day = Math.max(1, Math.floor(s.day)); s.min = Math.min(DAY_END - 1, Math.max(DAY_START, s.min));
  if (![0.6, 1, 1.5].includes(s.sens)) s.sens = 1;
  s.coins = Math.max(0, Math.floor(s.coins)); s.energy = Math.min(100, Math.max(0, s.energy));
  for (const t of Object.keys(TOOLS)) s.tools[t] = Math.min(2, Math.max(0, Math.floor(s.tools[t])));
  if (!['none', 'pending', 'done'].includes(s.storm.state)) s.storm.state = 'none';
  return s;
}

/* ---------- economía ---------- */
/** Precio de venta: base × dificultad × demanda estacional determinista × saturación del día × decoración. */
export function sellPrice(s, item, diffPrice) {
  const base = BASE_PRICE[item] || 0;
  const season = seasonOf(s.day);
  // demanda: cada producto tiene su estación preferida (+20%) y la opuesta (-15%)
  const fav = { nabo: 3, zanahoria: 0, trigo: 1, calabaza: 2, arcoiris: -1, harina: 3, huevo: 0, lana: 3, leche: 1 }[item] ?? -1;
  const demand = fav < 0 ? 1 : season === fav ? 1.2 : season === (fav + 2) % 4 ? 0.85 : 1;
  const soldToday = s.sold.day === s.day ? (s.sold.n[item] || 0) : 0;
  const sat = Math.max(0.6, 1 - soldToday * 0.05);
  const decor = 1 + 0.03 * s.decor.filter(Boolean).length;
  return Math.max(1, Math.round(base * diffPrice * demand * sat * decor));
}

const WHO = ['Doña Rosa', 'Don Tito', 'Inés la herrera', 'Tomás', 'La maestra Clara', 'El cartero Beto'];
/** Pedidos del tablero: se renuevan cada 2 días, deterministas según la semilla y el día. */
export function makeOrders(s) {
  const period = Math.floor((s.day - 1) / 2);
  const r = rng(s.seed + period * 7919);
  const pool = s.mill ? ['nabo', 'zanahoria', 'trigo', 'calabaza', 'huevo', 'harina'] : ['nabo', 'zanahoria', 'trigo', 'calabaza', 'huevo'];
  const list = [];
  for (let i = 0; i < 3; i++) {
    const item = pool[Math.floor(r() * pool.length)];
    const qty = item === 'calabaza' ? 1 + Math.floor(r() * 2) : item === 'huevo' || item === 'harina' ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 3);
    const reward = Math.round(BASE_PRICE[item] * qty * 1.6 + 10);
    list.push({ who: WHO[Math.floor(r() * WHO.length)], item, qty, reward, done: false });
  }
  return { day: period, list };
}

/** Puntaje de granja (récord): lo ganado + misiones + tormenta. */
export function scoreOf(s) {
  return Math.round(s.earned + (s.huerta.done ? 150 : 0) + (s.feria.done ? 250 : 0) + (s.inv3.done ? 400 : 0)
    + (s.flags.rainbow ? 80 : 0) + (s.flags.millDone ? 80 : 0) + (s.flags.animalsDone ? 80 : 0) + (s.flags.merchantDone ? 80 : 0)
    + s.storm.best * 15);
}

/** Texto de hora 24 h. @param {number} min */
export function clock(min) { const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
