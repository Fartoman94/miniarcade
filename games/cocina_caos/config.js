// @ts-check
/* Cocina del Caos — datos y reglas puras (sin Three.js): ingredientes, recetas, cocinas, dificultad,
   calidad, guardado versionado y su saneamiento. */

export const GAME_ID = 'cocina_caos';
export const SAVE_KEY = GAME_ID + ':save';
export const SAVE_VERSION = 2;
export const ACCENT = '#ff5c7a';

/** Tamaño de una baldosa (m) y altura de la mesada. */
export const TS = 1.2;
export const COUNTER_H = 0.92;

/* ======================= ingredientes =======================
   chop: se pica en la tabla. oven: estado desde el que se hornea. pot: {from, need, out} receta de olla.
   finals: estados que se pueden emplatar. */
export const ING = {
  lechuga: { name: 'Lechuga', icon: '🥬', chop: true, finals: ['picado'] },
  tomate: { name: 'Tomate', icon: '🍅', chop: true, pot: { from: 'picado', need: 3, out: 'sopa_tomate' }, finals: ['picado'] },
  hongo: { name: 'Hongo', icon: '🍄', chop: true, pot: { from: 'picado', need: 3, out: 'sopa_hongo' }, finals: ['picado'] },
  pan: { name: 'Pan', icon: '🍞', finals: ['crudo'] },
  carne: { name: 'Carne', icon: '🥩', oven: 'crudo', finals: ['asado'] },
  queso: { name: 'Queso', icon: '🧀', chop: true, finals: ['picado'] },
  papa: { name: 'Papa', icon: '🥔', chop: true, oven: 'picado', finals: ['asado'] },
  pescado: { name: 'Pescado', icon: '🐟', chop: true, oven: 'crudo', finals: ['picado', 'asado'] },
  arroz: { name: 'Arroz', icon: '🍚', pot: { from: 'crudo', need: 2, out: 'arroz' }, finals: ['cocido'] },
  alga: { name: 'Alga', icon: '🌿', finals: ['crudo'] },
  sopa_tomate: { name: 'Sopa de tomate', icon: '🥣', finals: ['cocido'] },
  sopa_hongo: { name: 'Sopa de hongos', icon: '🍲', finals: ['cocido'] },
};
export const STATE_LABEL = { crudo: '', picado: 'picado', asado: 'asado', cocido: 'cocido', quemado: 'quemado' };
export const STATE_BADGE = { crudo: '', picado: '🔪', asado: '🔥', cocido: '🍲', quemado: '💀' };
/** @param {string} ing @param {string} st */
export const key = (ing, st) => ing + ':' + st;
/** Nombre legible de un ingrediente en un estado. */
export function ingName(ing, st) {
  const d = ING[ing]; if (!d) return ing;
  if (st === 'quemado') return d.name + (['lechuga', 'papa', 'carne'].includes(ing) ? ' quemada' : ' quemado');
  if (ing === 'arroz' && st === 'cocido') return 'Arroz cocido';
  if (ing === 'papa' && st === 'asado') return 'Papas fritas';
  if (ing === 'carne' && st === 'asado') return 'Carne asada';
  if (ing === 'pescado' && st === 'asado') return 'Pescado grillado';
  const fem = ['lechuga', 'papa', 'carne'].includes(ing);
  return d.name + (STATE_LABEL[st] ? ' ' + (fem ? STATE_LABEL[st].replace(/o$/, 'a') : STATE_LABEL[st]) : '');
}
/** Pasos de preparación de un componente (sin contar el emplatado). */
function partSteps(k) {
  const [ing, st] = k.split(':');
  const d = ING[ing];
  if (st === 'crudo') return 0;
  if (st === 'picado') return 1;
  if (st === 'asado') return 1 + (d && d.oven === 'picado' ? 1 : 0);
  if (st === 'cocido') {
    if (ing === 'arroz') return 1;
    const src = Object.values(ING).find(x => x.pot && x.pot.out === ing);
    return 1 + (src && src.pot.from === 'picado' ? 1 : 0);
  }
  return 1;
}

/* ======================= recetas (2 a 5 pasos) ======================= */
/** @type {Record<string,{name:string, icon:string, parts:string[], steps?:number}>} */
export const RECIPES = {
  ensalada_verde: { name: 'Ensalada verde', icon: '🥗', parts: ['lechuga:picado'] },
  ensalada_mixta: { name: 'Ensalada mixta', icon: '🥗', parts: ['lechuga:picado', 'tomate:picado'] },
  sopa_hongos: { name: 'Sopa de hongos', icon: '🍲', parts: ['sopa_hongo:cocido'] },
  sandwich: { name: 'Sándwich de carne', icon: '🥪', parts: ['pan:crudo', 'carne:asado'] },
  papas_volcan: { name: 'Papas volcánicas', icon: '🍟', parts: ['papa:asado'] },
  hamburguesa: { name: 'Hamburguesa de lava', icon: '🍔', parts: ['pan:crudo', 'carne:asado', 'queso:picado'] },
  sopa_tomate: { name: 'Sopa de tomate', icon: '🥣', parts: ['sopa_tomate:cocido'] },
  combo_lava: { name: 'Combo magma', icon: '🍖', parts: ['carne:asado', 'papa:asado'] },
  festin_volcan: { name: 'Festín del Rey', icon: '👑', parts: ['carne:asado', 'papa:asado', 'queso:picado'] },
  onigiri: { name: 'Onigiri lunar', icon: '🍙', parts: ['arroz:cocido', 'alga:crudo'] },
  sushi: { name: 'Sushi estelar', icon: '🍣', parts: ['arroz:cocido', 'pescado:picado', 'alga:crudo'] },
  pescado_orbital: { name: 'Pescado orbital', icon: '🐠', parts: ['pescado:asado', 'papa:asado'] },
  gran_orbital: { name: 'Gran Cena Orbital', icon: '👑', parts: ['pescado:asado', 'papa:asado', 'lechuga:picado'] },
};
for (const r of Object.values(RECIPES)) r.steps = r.parts.reduce((a, k) => a + partSteps(k), 0) + 1;

/** ¿Este ingrediente/estado se puede poner en un plato? */
export function plateable(ing, st) { const d = ING[ing]; return !!d && st !== 'quemado' && d.finals.includes(st); }
/** Receta que coincide exactamente con el contenido de un plato (o null). @param {string[]} items @param {string[]} [pool] */
export function matchRecipe(items, pool) {
  const s = [...items].sort().join('|');
  for (const id of pool || Object.keys(RECIPES)) if ([...RECIPES[id].parts].sort().join('|') === s) return id;
  return null;
}

/* ======================= cocinas =======================
   Leyenda: # mesada · . piso · T tabla de picar · O horno · P olla · S fregadero · D platos limpios ·
   R retorno de platos sucios · C inicio de la cinta · c cinta · X ventanilla de entrega · 1-6 neveras ·
   B basura · E extintor · H ratonera · W pared decorada · L lava · v grieta · > < pasillo móvil ·
   A esclusa · @ chef · h ayudante. Fila 0 = fondo. */
export const KITCHENS = {
  taberna: {
    id: 'taberna', name: 'Taberna del Reino', short: 'Taberna', icon: '🏰', theme: 'taberna',
    blurb: 'Cocina de piedra y madera del castillo. Ojo con los roedores traviesos y los barriles que gotean.',
    layout: [
      '#123#TT#OOP#',
      '#..........C',
      'S....##....c',
      'S....T4..@.c',
      'D....##....c',
      'R..h.......X',
      '#..........#',
      '#H#5E#B##W##',
    ],
    fridges: ['lechuga', 'tomate', 'hongo', 'pan', 'carne'],
    recipes: ['ensalada_verde', 'ensalada_mixta', 'sopa_hongos', 'sandwich'],
    weights: [3, 3, 2, 2],
    duration: 150, stars: [110, 240, 380], maxOrders: 4, spawn: 19, firstOrder: 2,
    chaos: ['ratas', 'barril', 'grasa'], ratEvery: 30, plates: 4,
    hazards: 'Roedores que roban comida de las mesadas · barriles que gotean (derrames) · grasa que se prende fuego',
  },
  volcan: {
    id: 'volcan', name: 'Cocina Volcánica', short: 'Volcán', icon: '🌋', theme: 'volcan',
    blurb: 'Una cocina tallada en un volcán: un río de lava la parte al medio. Cruzá por los puentes y cuidado con las erupciones.',
    layout: [
      '#12#TT#OOO#C',
      'S..........c',
      'S...v......c',
      'D......v...c',
      'LL.LLLL.LLLc',
      'R..........X',
      '#..h...@.v.#',
      '#34E#TPP#B5#',
    ],
    fridges: ['pan', 'carne', 'queso', 'papa', 'tomate'],
    recipes: ['papas_volcan', 'hamburguesa', 'sopa_tomate', 'combo_lava'],
    weights: [3, 2, 2, 2],
    duration: 165, stars: [120, 260, 420], maxOrders: 4, spawn: 20, firstOrder: 2,
    chaos: ['erupcion', 'temblor', 'grietas'], ratEvery: 0, plates: 4,
    hazards: 'Erupciones que prenden fuego las estaciones · grietas que escupen vapor · temblores que derraman aceite',
  },
  espacial: {
    id: 'espacial', name: 'Restaurante Espacial', short: 'Espacial', icon: '🚀', theme: 'espacial',
    blurb: 'Una estación orbital con pasillos móviles, una esclusa caprichosa y ratones lunares.',
    layout: [
      '#123#TT#OO#C',
      'A..........c',
      'A..>>>>>>..c',
      'S..........c',
      'S...#PP#...c',
      'D...#46#...X',
      'R.h.<<<<<@.#',
      '#H#E#B#5#TT#',
    ],
    fridges: ['pescado', 'arroz', 'alga', 'papa', 'lechuga', 'tomate'],
    recipes: ['onigiri', 'sushi', 'pescado_orbital', 'ensalada_mixta'],
    weights: [3, 2, 2, 2],
    duration: 180, stars: [130, 280, 450], maxOrders: 5, spawn: 19, firstOrder: 2,
    chaos: ['esclusa', 'gravedad', 'meteoritos'], ratEvery: 38, plates: 5,
    hazards: 'Esclusa que te chupa hacia el vacío · gravedad cero (todo patina) · meteoritos que salpican baba · ratones lunares',
  },
};
export const KITCHEN_ORDER = ['taberna', 'volcan', 'espacial'];

/* ======================= Gran Banquete (evento final, 3 fases) ======================= */
export const BANQUET = [
  { kitchen: 'taberna', name: 'Entradas', kicker: 'FASE 1', duration: 70, stars: [70, 150, 230], waves: true,
    rule: 'Los comensales llegan en OLEADAS anunciadas por el clarín: atendé toda la oleada antes de la próxima y ganás bonus.',
    recipes: ['ensalada_verde', 'ensalada_mixta', 'sandwich', 'sopa_hongos'] },
  { kitchen: 'volcan', name: 'Plato fuerte', kicker: 'FASE 2', duration: 80, stars: [80, 170, 260],
    rule: 'El Rey pide su FESTÍN (vale doble) y el volcán entra en erupción a ritmo fijo: mirá dónde cae la marca.',
    recipes: ['hamburguesa', 'combo_lava', 'papas_volcan'], royal: 'festin_volcan' },
  { kitchen: 'espacial', name: 'Gran final en órbita', kicker: 'FASE 3', duration: 80, stars: [90, 190, 290], zeroG: true, mult: 1.5,
    rule: 'GRAVEDAD CERO todo el tiempo y la esclusa se abre seguido. Cada plato vale ×1.5.',
    recipes: ['onigiri', 'sushi', 'pescado_orbital'], royal: 'gran_orbital' },
];

/* ======================= dificultad: tabla real de efectos ======================= */
export const DIFFICULTY = {
  facil: { label: 'Fácil', orderTime: 1.4, spawn: 1.3, maxFails: 6, chaos: 1.6, burn: 1.6, cook: 0.85, rats: 0.6, banquetStars: 3, telegraph: 4 },
  normal: { label: 'Normal', orderTime: 1, spawn: 1, maxFails: 4, chaos: 1, burn: 1, cook: 1, rats: 1, banquetStars: 4, telegraph: 3 },
  dificil: { label: 'Difícil', orderTime: 0.85, spawn: 0.85, maxFails: 3, chaos: 0.75, burn: 0.75, cook: 1.1, rats: 1.3, banquetStars: 5, telegraph: 2.5 },
  extremo: { label: 'Extremo', orderTime: 0.7, spawn: 0.72, maxFails: 2, chaos: 0.55, burn: 0.6, cook: 1.2, rats: 1.6, banquetStars: 6, telegraph: 2 },
};

/* ======================= calidad gráfica ======================= */
export const QUALITY = {
  low: { particles: 90, decor: 0.4, fog: [16, 40], stars: 250, embers: 0, lights: false },
  medium: { particles: 180, decor: 0.75, fog: [20, 55], stars: 600, embers: 30, lights: true },
  high: { particles: 300, decor: 1, fog: [26, 70], stars: 1200, embers: 60, lights: true },
};

/* ======================= tiempos base (s) ======================= */
export const T = {
  chop: 1.5, wash: 1.6, clean: 1.4, cook: 6.5, pot: 8, burn: 7, fireAfterBurn: 5, fireSpread: 9,
  plateReturn: 6, conveyor: 1.1, extinguish: 1.1, extinguishBare: 2.6, dash: 0.18, dashCd: 0.7,
  speed: 4.4, helperSpeed: 3.2,
};
/** Tiempo de un pedido según los pasos. */
export const orderTime = steps => 32 + steps * 11;

/* ======================= guardado ======================= */
export const DEFAULT_KEYS = { act: 'KeyE', helper: 'KeyQ', dash: 'ShiftLeft' };
export function defaults() {
  return {
    unlocked: 1, // 1 taberna · 2 volcán · 3 espacial · 4 banquete
    best: { taberna: { score: 0, stars: 0 }, volcan: { score: 0, stars: 0 }, espacial: { score: 0, stars: 0 }, banquete: { score: 0, stars: 0 } },
    served: 0, banquetWon: false, goldHat: false, tutorialDone: false,
    keys: { ...DEFAULT_KEYS }, stick: 1, // sensibilidad del stick (0.7 · 1 · 1.3)
    stats: { perfect: 0, burnt: 0, fires: 0, rats: 0, shifts: 0 },
  };
}
const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
/** Normaliza cualquier dato guardado (tolera tipos rotos). @param {any} s */
export function sanitize(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  const o = d;
  o.unlocked = Math.round(num(s.unlocked, 1, 1, 4));
  if (s.best && typeof s.best === 'object') for (const k of Object.keys(o.best)) {
    const b = s.best[k]; if (b && typeof b === 'object') o.best[k] = { score: Math.round(num(b.score, 0, 0, 1e7)), stars: Math.round(num(b.stars, 0, 0, 9)) };
  }
  o.served = Math.round(num(s.served, 0, 0, 1e7));
  o.banquetWon = s.banquetWon === true; o.goldHat = s.goldHat === true || o.banquetWon;
  o.tutorialDone = s.tutorialDone === true;
  if (s.keys && typeof s.keys === 'object') for (const k of Object.keys(o.keys)) if (typeof s.keys[k] === 'string' && /^[A-Za-z0-9]{2,20}$/.test(s.keys[k])) o.keys[k] = s.keys[k];
  if (new Set(Object.values(o.keys)).size !== 3) o.keys = { ...DEFAULT_KEYS };
  o.stick = [0.7, 1, 1.3].includes(s.stick) ? s.stick : 1;
  if (s.stats && typeof s.stats === 'object') for (const k of Object.keys(o.stats)) o.stats[k] = Math.round(num(s.stats[k], 0, 0, 1e7));
  // coherencia: no puede haber récord en una cocina bloqueada
  if (o.best.volcan.stars > 0) o.unlocked = Math.max(o.unlocked, 2);
  if (o.best.espacial.stars > 0) o.unlocked = Math.max(o.unlocked, 3);
  return o;
}
/** v1 guardaba { level, record, orders }. @param {any} old @param {number} from */
export function migrate(old, from) {
  if (from === 1 && old && typeof old === 'object') {
    const d = defaults();
    d.unlocked = Math.round(num(old.level, 1, 1, 4));
    d.served = Math.round(num(old.orders, 0, 0, 1e7));
    d.best.taberna.score = Math.round(num(old.record, 0, 0, 1e7));
    return d;
  }
  return defaults();
}
/** Estrellas de un puntaje según umbrales. */
export const starsOf = (score, th) => (score >= th[2] ? 3 : score >= th[1] ? 2 : score >= th[0] ? 1 : 0);
