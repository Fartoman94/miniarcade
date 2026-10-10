// @ts-check
/* Bastiones Elementales — datos del juego: torres, enemigos, mapas, oleadas, dificultad, calidad y misiones. */

export const ID = 'bastiones_elementales';
export const TITLE = 'BASTIONES ELEMENTALES';
export const ACCENT = '#8f7bff';
export const SAVE_KEY = ID + ':save';
export const SAVE_VERSION = 1;

/** Tamaño de baldosa (unidades de mundo) y grilla común a los tres mapas. */
export const TILE = 2;
export const COLS = 20, ROWS = 13;

/* ======================= torres ======================= */
/** dmg = daño por impacto · rate = disparos/s · range en unidades · cost por nivel (índice 0 = construir). */
export const TOWERS = {
  ballesta: {
    name: 'Ballesta', el: 'piedra', icon: '🏹', color: 0xd9c7a0, glow: 0xffe6a8, key: 'Digit1',
    desc: 'Virotes rápidos. Ataca aire y tierra (×1.5 a voladores). Floja contra blindados.',
    air: true, ground: true,
    lv: [
      { cost: 70, dmg: 16, rate: 1.25, range: 7.0 },
      { cost: 60, dmg: 26, rate: 1.45, range: 7.4 },
      { cost: 110, dmg: 40, rate: 1.7, range: 8.2, multi: 2 },
    ],
  },
  fuego: {
    name: 'Fuego', el: 'fuego', icon: '🔥', color: 0xff6a2a, glow: 0xffa040, key: 'Digit2',
    desc: 'Bolas de fuego con área y quemadura. Sólo tierra. Inútil contra imps.',
    air: false, ground: true,
    lv: [
      { cost: 100, dmg: 22, rate: 0.8, range: 6.4, splash: 2.2, burn: 8 },
      { cost: 90, dmg: 34, rate: 0.85, range: 6.8, splash: 2.4, burn: 12 },
      { cost: 150, dmg: 52, rate: 0.95, range: 7.4, splash: 2.9, burn: 18 },
    ],
  },
  hielo: {
    name: 'Hielo', el: 'hielo', icon: '❄️', color: 0x7fd8ff, glow: 0xbff0ff, key: 'Digit3',
    desc: 'Ralentiza y congela. Aire y tierra. No afecta al gólem de hielo.',
    air: true, ground: true,
    lv: [
      { cost: 90, dmg: 8, rate: 1.0, range: 6.6, slow: 0.4, freezeEvery: 4 },
      { cost: 80, dmg: 13, rate: 1.1, range: 7.0, slow: 0.5, freezeEvery: 4 },
      { cost: 140, dmg: 19, rate: 1.2, range: 7.6, slow: 0.6, freezeEvery: 3, splash: 1.6 },
    ],
  },
  rayo: {
    name: 'Rayo', el: 'rayo', icon: '⚡', color: 0xffe14a, glow: 0xfff3a0, key: 'Digit4',
    desc: 'Descarga en cadena que ignora la armadura. Aire y tierra.',
    air: true, ground: true,
    lv: [
      { cost: 120, dmg: 30, rate: 0.7, range: 7.0, chain: 2 },
      { cost: 100, dmg: 46, rate: 0.75, range: 7.4, chain: 3 },
      { cost: 170, dmg: 66, rate: 0.8, range: 8.0, chain: 4, stun: 0.3 },
    ],
  },
};
/** @typedef {keyof typeof TOWERS} TowerType */
export const TOWER_ORDER = /** @type {TowerType[]} */ (['ballesta', 'fuego', 'hielo', 'rayo']);
export const SELL_RATIO = 0.7;
export const PRIORITIES = ['primero', 'fuerte', 'cerca'];
export const PRIORITY_LABEL = { primero: 'Primero', fuerte: 'Más fuerte', cerca: 'Más cerca' };

/* ======================= enemigos ======================= */
/** mult = multiplicador de daño recibido por elemento (0 = inmune). */
export const ENEMIES = {
  trasgo: {
    name: 'Trasgo', hp: 62, speed: 2.7, bounty: 4, leak: 1, armor: 'Ligera', fly: false, r: 0.55,
    mult: { piedra: 1, fuego: 1, hielo: 1, rayo: 1 },
    tip: 'Infantería ligera: cualquier torre sirve.',
  },
  imp: {
    name: 'Imp volcánico', hp: 50, speed: 3.6, bounty: 5, leak: 1, armor: 'Ígnea', fly: false, r: 0.5,
    mult: { piedra: 1, fuego: 0, hielo: 1.5, rayo: 1 },
    tip: 'Inmune al fuego. Al ser herido salta hacia adelante y ataca cristales auxiliares. Congelado no puede saltar.',
  },
  golem: {
    name: 'Gólem de hielo', hp: 430, speed: 1.45, bounty: 18, leak: 3, armor: 'Gélida', fly: false, r: 0.95,
    mult: { piedra: 0.8, fuego: 1.6, hielo: 0.25, rayo: 0.9 },
    tip: 'No se ralentiza. Cada tanto congela la torre más cercana (anillo azul). Derretilo con fuego.',
  },
  caballero: {
    name: 'Caballero blindado', hp: 290, speed: 1.85, bounty: 14, leak: 2, armor: 'Pesada', fly: false, r: 0.75,
    mult: { piedra: 0.4, fuego: 0.7, hielo: 0.8, rayo: 1.2 },
    tip: 'Armadura pesada y escudo que levanta al recibir daño. El rayo la ignora; el choque térmico la rompe.',
  },
  volador: {
    name: 'Harpía de tormenta', hp: 100, speed: 3.1, bounty: 8, leak: 1, armor: 'Etérea', fly: true, r: 0.6,
    mult: { piedra: 1.5, fuego: 0, hielo: 1, rayo: 1 },
    tip: 'Vuela en línea recta al cristal ignorando caminos y puentes. El fuego no la alcanza.',
  },
};
/** @typedef {keyof typeof ENEMIES} EnemyType */

/* ======================= Titán ======================= */
export const TITAN = {
  hp: 12000, speed: 0.9, leak: 999, bounty: 400, score: 3000,
  phases: [
    { id: 'escarcha', name: 'Coraza de Escarcha', color: 0x8fe0ff, immune: 'hielo', weak: 'fuego' },
    { id: 'magma', name: 'Núcleo de Magma', color: 0xff6a2a, immune: 'fuego', weak: 'hielo' },
    { id: 'tormenta', name: 'Ojo de la Tormenta', color: 0xffe14a, immune: 'rayo', weak: 'piedra' },
  ],
  transition: 3.0, empEvery: 9, empRadius: 7.5, empStun: 2.5, empWarn: 1.6,
};

/* ======================= mapas ======================= */
/* Leyenda: S spawn · C cristal principal · # camino · P plataforma · a cristal auxiliar · L/M palanca del puente 0/1
   1/2 puente 0 (estado A/B) · 3/4 puente 1 (estado A/B) · ~ agua/lava · T árbol/roca grande · R roca · . terreno */
export const MAPS = [
  {
    id: 'glacial', name: 'Puente Glacial', kicker: 'ESCENARIO 1', icon: '❄️',
    blurb: 'Un río helado partido por un puente levadizo. Elegí por qué orilla pasan los invasores.',
    sky: 0xb8d3ea, fog: 0xc6dcee, ground: 0xe4edf5, ground2: 0xd2e0ec, path: 0x8aa0b8, water: 0x2f78b8, waterE: 0x0a2a4a,
    hemi: [0xeaf6ff, 0x5a7088, 1.5], sun: [0xfff4e0, 2.1], decor: 'pino', weather: 'nieve',
    grid: [
      'T..T..T..~~..T..T..T',
      '..P...P..~~...P..P..',
      '....#####11#####....',
      '..P.#..P.~~..P.#.P..',
      '....#....~~....#....',
      '.a..#..P.~~.P..#..a.',
      'S####...L~~....####C',
      '....#..P.~~.P..#....',
      '....#....~~....#....',
      '..P.#..P.~~..P.#.P..',
      '....#####22#####....',
      '..P...P..~~...P..P..',
      'T..T..T..~~..T..T..T',
    ],
    waves: [
      [['trasgo', 10, 1.3, 0]],
      [['trasgo', 14, 1.0, 0]],
      [['trasgo', 8, 1.1, 0], ['caballero', 2, 3, 6]],
      [['trasgo', 10, 1.0, 0], ['volador', 4, 1.6, 5]],
      [['golem', 2, 6, 0], ['trasgo', 10, 0.9, 3]],
      [['caballero', 5, 2.2, 0], ['trasgo', 10, 0.8, 4]],
      [['volador', 8, 1.1, 0], ['golem', 3, 5, 4]],
      [['trasgo', 12, 0.7, 0], ['caballero', 6, 1.8, 3], ['golem', 1, 0, 12, 0, 'elite']],
    ],
  },
  {
    id: 'lava', name: 'Paso de Lava', kicker: 'ESCENARIO 2', icon: '🌋', goldBonus: 60,
    blurb: 'Dos columnas de invasores bajan por la ceniza. Un puente de basalto cruza el río de lava.',
    sky: 0x2a1512, fog: 0x3a1a12, ground: 0x4a3a36, ground2: 0x3a2c2a, path: 0x7a675c, water: 0xff5a14, waterE: 0xff3a00,
    hemi: [0xffd0b0, 0x401810, 1.25], sun: [0xffb070, 1.9], decor: 'obsidiana', weather: 'brasas',
    grid: [
      'R..R....R...~~...R.R',
      'S######..P..~~..P...',
      '......#.....~~......',
      '..P...#..P..~~.P..a.',
      '......######11####..',
      '..P...#..P..~~.P.#..',
      '.a....#....L~~...##C',
      '..P...#..P..~~.P.#..',
      '......######22####..',
      '..P...#..P..~~.P....',
      '......#.....~~......',
      'S######..P..~~..P...',
      'R..R....R...~~...R.R',
    ],
    waves: [
      [['trasgo', 12, 1.0, 0, -1]],
      [['imp', 10, 1.0, 0, -1], ['trasgo', 6, 1.2, 5, -1]],
      [['caballero', 4, 2.5, 0, 0], ['imp', 8, 0.9, 2, 1]],
      [['trasgo', 14, 0.8, 0, -1], ['volador', 5, 1.5, 4, -1]],
      [['golem', 2, 5, 0, 0], ['imp', 12, 0.7, 3, -1]],
      [['caballero', 6, 1.8, 0, -1], ['trasgo', 10, 0.8, 4, -1]],
      [['volador', 10, 1.0, 0, -1], ['imp', 10, 0.7, 3, -1]],
      [['golem', 3, 4, 0, -1], ['caballero', 6, 1.6, 2, -1], ['imp', 8, 0.6, 6, -1]],
      [['imp', 16, 0.5, 0, -1], ['caballero', 8, 1.4, 3, -1], ['golem', 2, 4, 6, -1], ['caballero', 1, 0, 14, 1, 'elite']],
    ],
  },
  {
    id: 'trueno', name: 'Valle del Trueno', kicker: 'ESCENARIO 3', icon: '⛈️', goldBonus: 140,
    blurb: 'Dos puentes, dos palancas y un cielo que ruge. Acá despierta el Titán Elemental.',
    sky: 0x4a5870, fog: 0x55657c, ground: 0x6a9a50, ground2: 0x5a8a46, path: 0xa88c62, water: 0x2f6f96, waterE: 0x0a2440,
    hemi: [0xdfe8ff, 0x384a30, 1.35], sun: [0xfff0d8, 1.8], decor: 'roble', weather: 'tormenta',
    grid: [
      'T..TS.........S.T..T',
      '....#....P....#.....',
      '.P..#..P...P..#..P..',
      '...##############...',
      '...#.L..#.a#..M.#...',
      '.P.#.P..#..#..P.#.P.',
      '~~~1~~~~2~~4~~~~3~~~',
      '~~~1~~~~2~~4~~~~3~~~',
      '.a.#.P..#..#..P.#.a.',
      '...##############...',
      '.P..P....#...P..P...',
      '...P....P#P....P....',
      'T..T.....C.....T..T.',
    ],
    waves: [
      [['trasgo', 14, 1.0, 0, -1]],
      [['volador', 8, 1.2, 0, -1], ['trasgo', 8, 1.0, 4, -1]],
      [['imp', 12, 0.8, 0, -1], ['caballero', 4, 2.4, 4, -1]],
      [['golem', 3, 4, 0, -1], ['trasgo', 12, 0.8, 2, -1]],
      [['volador', 12, 0.9, 0, -1], ['imp', 8, 0.8, 4, -1]],
      [['caballero', 8, 1.6, 0, -1], ['golem', 2, 5, 5, -1]],
      [['imp', 16, 0.55, 0, -1], ['volador', 8, 1.0, 3, -1]],
      [['golem', 4, 3.5, 0, -1], ['caballero', 8, 1.4, 2, -1], ['trasgo', 12, 0.6, 5, -1]],
      [['volador', 12, 0.8, 0, -1], ['imp', 14, 0.5, 2, -1], ['caballero', 6, 1.4, 6, -1], ['golem', 3, 3, 9, -1]],
      [['titan', 1, 0, 0, 0], ['trasgo', 10, 1.0, 3, 1]],
    ],
  },
];

/* ======================= dificultad ======================= */
export const DIFFICULTY = {
  facil: { name: 'facil', label: 'Fácil', crystal: 30, hp: 0.75, speed: 0.9, gold: 280, reward: 1.2, moves: 4, between: 22, titan: 0.75, harvest: 1.2 },
  normal: { name: 'normal', label: 'Normal', crystal: 20, hp: 1, speed: 1, gold: 220, reward: 1, moves: 3, between: 16, titan: 1, harvest: 1 },
  dificil: { name: 'dificil', label: 'Difícil', crystal: 15, hp: 1.3, speed: 1.1, gold: 190, reward: 0.9, moves: 2, between: 12, titan: 1.3, harvest: 0.9 },
  extremo: { name: 'extremo', label: 'Extremo', crystal: 10, hp: 1.65, speed: 1.2, gold: 170, reward: 0.8, moves: 1, between: 10, titan: 1.6, harvest: 0.8 },
};

/* ======================= calidad ======================= */
export const QUALITY = {
  low: { particles: 160, decor: 0.45, fogFar: 70, lights: 0, waterAnim: false, weather: 60, bars: true },
  medium: { particles: 420, decor: 0.75, fogFar: 95, lights: 2, waterAnim: true, weather: 220, bars: true },
  high: { particles: 900, decor: 1, fogFar: 130, lights: 4, waterAnim: true, weather: 480, bars: true },
};

/* ======================= economía ======================= */
export const AUX = { hp: 40, charge: 13, gold: 30, regen: 2, imp: 6, touch: 1.2 };
export const WAVE_BONUS = (w) => 20 + 6 * w;

/* ======================= misiones ======================= */
export const MISSIONS = [
  { id: 'defender', kind: 'primary', title: 'Defendé el cristal principal', desc: 'Superá todas las oleadas de un escenario con el cristal en pie.', event: 'crystalDefended', target: 1 },
  { id: 'oleadas', kind: 'primary', title: 'Completá 10 oleadas', desc: 'Suma entre partidas: cada oleada superada cuenta.', event: 'wavesTotal', target: 10, mode: 'max' },
  { id: 'titan', kind: 'primary', title: 'Detené al Titán Elemental', desc: 'Derrotalo en el Valle del Trueno.', event: 'titanDown', target: 1 },
  { id: 'sinfuego', title: 'Ganá sin torres de fuego', desc: 'Superá un escenario sin construir ninguna torre de fuego.', event: 'mapWon', target: 1, failOn: 'fireBuilt', requireWin: true },
  { id: 'maximo', title: 'Mejorá tres torres al máximo', desc: 'Llevá tres torres al nivel III en una partida.', event: 'maxed', target: 3 },
  { id: 'auxiliares', title: 'Salvá todos los cristales auxiliares', desc: 'Superá un escenario sin perder ningún cristal auxiliar.', event: 'mapWon', target: 1, failOn: 'auxLost', requireWin: true },
  { id: 'cien', title: 'Derrotá cien enemigos', desc: 'En una sola partida.', event: 'kill', target: 100 },
  { id: 'sinergias', title: 'Encadená 15 sinergias', desc: 'Choque térmico, conducción o sobrecarga.', event: 'combo', target: 15 },
  { id: 'cosecha', title: 'Cosechá 8 cristales', desc: 'Tocá los cristales auxiliares cuando brillan.', event: 'harvest', target: 8 },
];
