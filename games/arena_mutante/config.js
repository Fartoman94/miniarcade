// @ts-check
/* ARENA MUTANTE — constantes, tablas de dificultad/calidad, misiones, enemigos y mapas de las 3 arenas. */

export const ID = 'arena_mutante';
export const TITLE = 'ARENA MUTANTE';
export const ACCENT = '#a6ff2e';
export const SAVE_KEY = ID + ':save';
export const SAVE_VERSION = 2;
/** Tamaño de celda de los mapas (metros). */
export const CELL = 2;
export const WALL_H = 5.2;

/** Dificultad: cambia números reales del combate, nunca los controles. */
export const DIFFICULTY = {
  facil:   { label: 'Fácil',   enemyHp: 0.75, enemyDmg: 0.6,  enemySpeed: 0.9,  budget: 0.75, telegraph: 1.3,  regenCap: 1.0, scrap: 1.4, bossHp: 0.7,  score: 0.8 },
  normal:  { label: 'Normal',  enemyHp: 1.0,  enemyDmg: 1.0,  enemySpeed: 1.0,  budget: 1.0,  telegraph: 1.0,  regenCap: 0.6, scrap: 1.0, bossHp: 1.0,  score: 1.0 },
  dificil: { label: 'Difícil', enemyHp: 1.3,  enemyDmg: 1.35, enemySpeed: 1.08, budget: 1.3,  telegraph: 0.85, regenCap: 0.4, scrap: 0.85, bossHp: 1.3, score: 1.35 },
  extremo: { label: 'Extremo', enemyHp: 1.6,  enemyDmg: 1.75, enemySpeed: 1.15, budget: 1.6,  telegraph: 0.72, regenCap: 0.0, scrap: 0.7, bossHp: 1.65, score: 1.8 },
};

/** Calidad: costos reales de render (la sombra y el DPR los aplica Kit3D). */
export const QUALITY = {
  low:    { particles: 220, props: 0.35, fogFar: 46, far: 70,  lights: 0, tracers: 24, puddleSegs: 12, shadows: false },
  medium: { particles: 520, props: 0.7,  fogFar: 70, far: 110, lights: 2, tracers: 48, puddleSegs: 20, shadows: false },
  high:   { particles: 900, props: 1.0,  fogFar: 95, far: 150, lights: 4, tracers: 64, puddleSegs: 28, shadows: true },
};

/** Misiones (MLMissions): 3 principales del spec + 5 secundarias. */
export const MISSIONS = [
  { id: 'generadores', kind: 'primary', title: 'Restablecer tres generadores', desc: 'Búnker oxidado: mantené USAR en cada generador mientras resistís las hordas.', event: 'generator', target: 3 },
  { id: 'oleadas', kind: 'primary', title: 'Sobrevivir seis oleadas', desc: 'Estación eléctrica: el director de amenazas manda seis oleadas cada vez más duras.', event: 'waveSurvived', target: 6 },
  { id: 'extraccion', kind: 'primary', title: 'Llamar y alcanzar extracción', desc: 'Laboratorio tóxico: pedí el transporte, defendé su llegada, derrotá al Coloso y subí a bordo.', event: 'extracted', target: 1 },
  { id: 'superviviente', short: 'Superviviente', title: 'Salvar superviviente', desc: 'Liberalo de la cabina de control de la estación y mantenelo con vida hasta salir.', event: 'survivorSaved', target: 1, failOn: 'survivorDied' },
  { id: 'racha', short: 'Racha limpia', title: 'Derrotar 15 enemigos sin perder vida', desc: 'Encadená 15 bajas seguidas sin recibir daño.', event: 'cleanStreak', target: 15, mode: 'max' },
  { id: 'trampas', short: 'Trampas', title: 'Activar dos trampas', desc: 'Vapor, bobinas tesla o rociadores: activá dos trampas con USAR.', event: 'trapOn', target: 2 },
  { id: 'antidoto', short: 'Antídoto', title: 'Encontrar antídoto escondido', desc: 'Está detrás de una rejilla del laboratorio. Buscá el brillo verde.', event: 'antidote', target: 1 },
  { id: 'barricadas', short: 'Barricadas', title: 'Levantar tres barricadas', desc: 'Usá chatarra para levantar barricadas que frenen a los mutantes.', event: 'barricade', target: 3 },
];

export const PLAYER = {
  speed: 5.3, accel: 40, radius: 0.42, hp: 100,
  roll: { time: 0.42, iframes: 0.34, speed: 15.5, charges: 2, recharge: 1.5 },
  regenDelay: 5, regenRate: 4,
  pulse: { cd: 12, radius: 6.5, dmg: 25, push: 9, stun: 1.0, reveal: 4 },
  barricade: { cost: 4, hp: 170, max: 4 },
};

/** Arma: niveles de cada módulo (0..3). */
export const WEAPON = {
  dmg: [14, 18, 23, 29],
  mag: [24, 32, 40, 48],
  reload: [1.35, 1.2, 1.05, 0.9],
  rate: 8.5, spread: 0.012, range: 60,
};
/** Mejoras del banco de trabajo. */
export const UPGRADES = [
  { id: 'dmg', name: 'Cañón', desc: 'Daño del rifle', icon: '💥', cost: [6, 10, 15] },
  { id: 'mag', name: 'Cargador', desc: 'Más balas y recarga rápida', icon: '🔋', cost: [5, 9, 13] },
  { id: 'pulse', name: 'Pulso', desc: 'Recarga del pulso −25%', icon: '🌀', cost: [6, 10, 14] },
  { id: 'armor', name: 'Placas', desc: 'Vida máx. +25 y cura 25', icon: '🛡', cost: [7, 11, 16] },
];

export const ENEMY = {
  runner:  { name: 'Corredor', hp: 30,  speed: 6.1, dmg: 12, radius: 0.45, height: 1.5, score: 100, scrap: 1 },
  brute:   { name: 'Bruto', hp: 230, speed: 2.5, dmg: 24, radius: 0.95, height: 2.5, score: 400, scrap: 4 },
  spitter: { name: 'Escupidor tóxico', hp: 60, speed: 2.9, dmg: 14, radius: 0.6, height: 1.8, score: 200, scrap: 2 },
  stalker: { name: 'Acechador invisible', hp: 75, speed: 4.8, dmg: 17, radius: 0.5, height: 2.1, score: 300, scrap: 2 },
};
export const BOSS = { hp: 3300, tankHp: 340, coreMul: 1.0, bodyMul: 0.12 };

/* ======================= mapas =======================
   Leyenda (cada carácter = celda de 2 m):
   #  pared            .  piso              o  cobertura (destructible)   ~  pileta tóxica
   1-9 puertas         a-c generadores      T  trampa      C  caja de suministros
   W  banco de trabajo S  boca de mutantes  P  inicio      X  salida / ascensor
   V  superviviente    R  terminal de radio L  pista de aterrizaje
   Z  rejilla rompible A  antídoto escondido */
export const ARENAS = [
  {
    id: 'bunker', name: 'Búnker oxidado', short: 'BÚNKER', mission: 'generadores',
    goal: 'Restablecé los tres generadores',
    palette: { floor: [0x4a3a2c, 0x56442f], wall: 0x7a4a2a, trim: 0xd9a020, wall2: 0x5e3a22, fog: 0x1c120b, sky: 0x120b07, hemi: [0xffd9a8, 0x2a1a10], sun: 0xffd8a8, sunI: 1.7, hemiI: 1.8, glow: 0xffa040 },
    trapKind: 'vapor', spawnKind: 'vent', ceiling: 0x1a120c,
    map: [
      '##########################',
      '########....XX....########',
      '########..........########',
      '#############33###########',
      '#S....T#.o......o.#C....S#',
      '#......#..........#......#',
      '#..o...1....a.....2...o..#',
      '#......1..........2......#',
      '#.C....#...W......#....c.#',
      '#..b...#.o......o.#......#',
      '#......#..........#..T...#',
      '#S...C.#....P.....#.....S#',
      '########..........########',
      '########S...C....S########',
      '##########################',
    ],
    /** puerta → generadores que la energizan; exit: es la salida */
    doors: { 1: { gens: [0] }, 2: { gens: [1] }, 3: { gens: [0, 1, 2], exit: true } },
    /** orden de generadores: a, b, c */
    traps: [{ gen: 1 }, { gen: 2 }],
  },
  {
    id: 'estacion', name: 'Estación eléctrica', short: 'ESTACIÓN', mission: 'oleadas',
    goal: 'Sobreviví seis oleadas',
    palette: { floor: [0x2c333a, 0x343c44], wall: 0x3b4652, trim: 0x2ee6ff, wall2: 0x28313a, fog: 0x07101c, sky: 0x050b14, hemi: [0x9fd0ff, 0x10161e], sun: 0xc8e0ff, sunI: 1.6, hemiI: 1.6, glow: 0x4ad8ff },
    trapKind: 'tesla', spawnKind: 'hatch',
    map: [
      '############################',
      '############XXXX############',
      '############4444############',
      '#S....o......oo......o....S#',
      '#....##..............##....#',
      '#....##...T......T...##....#',
      '#..........o....o..........#',
      '#..o.....................o.#',
      '###2####.....##.....####3###',
      '#......#.....##.....#......#',
      '#.###..#............#..o...#',
      '#.#V#..o.....a......o....b.#',
      '#.#1#........P.............#',
      '#.......o...W....o..C......#',
      '#S..C....................CS#',
      '############################',
    ],
    doors: { 1: { gens: [0] }, 2: { gens: [1] }, 3: { gens: [1] }, 4: { gens: [], exit: true } },
    traps: [{ gen: 0 }, { gen: 0 }],
  },
  {
    id: 'laboratorio', name: 'Laboratorio tóxico', short: 'LABORATORIO', mission: 'extraccion',
    goal: 'Pedí la extracción desde la radio',
    palette: { floor: [0x9fb3b0, 0xb3c4c0], wall: 0xd8e2de, trim: 0x8b5cf6, wall2: 0x6f8a86, fog: 0x0d1a18, sky: 0x08120f, hemi: [0xd8fff0, 0x1a1028], sun: 0xf0fff8, sunI: 1.5, hemiI: 1.4, glow: 0x7dff3a },
    trapKind: 'rociador', spawnKind: 'tank',
    map: [
      '############################',
      '#S.........LLLL...........S#',
      '#..........LLLL............#',
      '#...o....o........o....o...#',
      '#####......................#',
      '#..R#....o..~~~~..o.....T..#',
      '#...1.......~~~~~~.........#',
      '#..C#..T....~~~~~~....o....#',
      '#####.......~~~~......a....#',
      '#......o......P......o.....#',
      '#..W......o......o.....#####',
      '#S...C.................Z.A.#',
      '############################',
    ],
    doors: { 1: { gens: [0] } },
    traps: [{ gen: 0 }, { gen: 0 }],
  },
];

/** Oleadas de la Estación eléctrica: presupuesto (puntos de amenaza) y tipos disponibles. */
export const STATION_WAVES = [
  { budget: 10, types: ['runner', 'runner', 'spitter'], gap: 1.6 },
  { budget: 15, types: ['runner', 'spitter', 'brute'], gap: 1.4 },
  { budget: 19, types: ['runner', 'spitter', 'stalker'], gap: 1.3, intro: 'stalker' },
  { budget: 23, types: ['runner', 'brute', 'stalker', 'spitter'], gap: 1.2 },
  { budget: 27, types: ['runner', 'spitter', 'stalker', 'brute'], gap: 1.05 },
  { budget: 33, types: ['runner', 'brute', 'stalker', 'spitter', 'brute'], gap: 0.95 },
];
/** Costo de amenaza por tipo (el director gasta el presupuesto de la oleada). */
export const THREAT = { runner: 1, spitter: 2, stalker: 2.5, brute: 4 };
