// @ts-check
/* Corsarios del Abismo — datos: regiones (islas, muelles, cañones, tesoros, náufragos, enemigos), dificultad,
   calidad gráfica, misiones y formato del guardado. Convención de ejes: yaw 0 mira a +Z; adelante = (sin yaw, cos yaw). */

export const GAME_ID = 'corsarios_abismo';
export const TITLE = 'Corsarios del Abismo';
export const ACCENT = '#ffbe3d';
export const SAVE_VERSION = 1;

/** Dificultad: cambia daño, vida y puntería enemiga, precios y el jefe; nunca los controles. */
export const DIFF = {
  facil: { dmg: 0.6, hp: 0.8, reload: 1.35, spread: 1.6, bossHp: 650, sharkCd: 1.4, price: 0.75, kits: 2, gold: 1.25, hull: 130 },
  normal: { dmg: 1, hp: 1, reload: 1, spread: 1, bossHp: 900, sharkCd: 1, price: 1, kits: 1, gold: 1, hull: 100 },
  dificil: { dmg: 1.3, hp: 1.2, reload: 0.85, spread: 0.75, bossHp: 1150, sharkCd: 0.8, price: 1.2, kits: 1, gold: 0.9, hull: 100 },
  extremo: { dmg: 1.6, hp: 1.4, reload: 0.7, spread: 0.55, bossHp: 1400, sharkCd: 0.65, price: 1.5, kits: 0, gold: 0.8, hull: 90 },
};

/** Calidad: costo real de agua (vértices), partículas, decoración, niebla/distancia de dibujo y estela. */
export const QUAL = {
  low: { waterSeg: 72, waterSize: 380, particles: 140, decor: 0.4, fogMul: 0.7, far: 260, wakeEvery: 0.12, shoreFoam: 0 },
  medium: { waterSeg: 128, waterSize: 460, particles: 280, decor: 0.75, fogMul: 1, far: 380, wakeEvery: 0.07, shoreFoam: 1 },
  high: { waterSeg: 190, waterSize: 520, particles: 440, decor: 1, fogMul: 1.25, far: 480, wakeEvery: 0.045, shoreFoam: 1 },
};

/** Barcos: velocidades en m/s, giro en rad/s. */
export const SHIPS = {
  player: { len: 11, wid: 3.8, radius: 4.2, speed: 14, turn: 0.85, hp: 100, mast: 60, reload: 2.4, balls: 3 },
  goleta: { len: 12, wid: 3.6, radius: 4.4, speed: 10.5, turn: 0.6, hp: 120, mast: 50, reload: 3.4, balls: 3, gold: 70 },
  lancha: { len: 6.5, wid: 2.4, radius: 2.8, speed: 15, turn: 1.6, hp: 38, mast: 20, reload: 0, balls: 0, gold: 30 },
  galeon: { len: 24, wid: 7, radius: 9.5, speed: 8.5, turn: 0.42, hp: 900, mast: 999, reload: 4, balls: 7, gold: 0 },
};

export const PRICES = { hull: 30, mast: 25, kit: 40, cannons: [120, 220], armor: [100, 200] };
export const MAX_KITS = 3;

/**
 * Regiones. Islas: r = radio de costa (colisión), h = altura del centro, land = se puede desembarcar.
 * Todo en coordenadas del mundo. Los cofres/tesoros/cañones con `isl` están sobre esa isla.
 */
export const REGIONS = {
  bahia: {
    id: 'bahia', name: 'Bahía del Contrabandista', short: 'Bahía', idx: 1,
    env: { sky: [0x58a8e6, 0xbfe6f5], fog: 0xa9d6ea, fogNear: 120, fogFar: 330, sun: [0xfff1d6, 2.6], hemi: [0xcfeaff, 0x6a5a3a, 1.25], sunDir: [60, 90, 30], exposure: 1.05,
      water: { deep: 0x0b4f7a, shallow: 0x2bc4c4, foam: 0xffffff, amp: 0.55 }, sand: 0xe9d29a, grass: 0x5fae4a, rock: 0x8c8378 },
    wind: { dir: 0.5, str: 1 },
    spawn: { x: 6, z: -44, yaw: 0 }, gateSpawn: { x: 0, z: -150, yaw: 0 },
    islands: [
      { id: 'puerto', name: 'Puerto Contrabandista', x: 0, z: -84, r: 30, h: 5, land: true, palms: 10, huts: 6 },
      { id: 'loro', name: 'Isla del Loro', x: 78, z: 36, r: 16, h: 6, land: true, palms: 9, huts: 0 },
      { id: 'calavera', name: 'Cayo Calavera', x: -86, z: 46, r: 13, h: 5, land: true, palms: 4, huts: 0, skull: true },
      { id: 'roca1', name: 'Roca del Vigía', x: 108, z: -58, r: 7, h: 6, land: false, rock: true },
      { id: 'r2', name: 'Arrecife', x: 42, z: -18, r: 4.5, h: 3, land: false, rock: true },
      { id: 'r3', name: 'Arrecife', x: -44, z: -28, r: 5, h: 3.5, land: false, rock: true },
      { id: 'r4', name: 'Arrecife', x: -32, z: 112, r: 6, h: 4, land: false, rock: true },
      { id: 'r5', name: 'Arrecife', x: 122, z: 104, r: 5, h: 3.5, land: false, rock: true },
    ],
    docks: [{ id: 'b_muelle', name: 'Muelle del Contrabandista', isl: 'puerto', x: 6, z: -44, yaw: 0, pier: { x: 0, z0: -56, z1: -38 } }],
    lighthouses: [{ x: -16, z: -96 }],
    cannons: [{ id: 'b_k1', x: -82, z: 54, isl: 'calavera', hp: 60 }, { id: 'b_k2', x: 108, z: -58, isl: 'roca1', hp: 60 }],
    treasures: [{ id: 'b_t1', isl: 'loro', x: 82, z: 41, reward: 'fragment' }, { id: 'b_t2', isl: 'calavera', x: -91, z: 41, reward: 'gold', amount: 80 }],
    chests: [{ id: 'b_c1', isl: 'loro', x: 71, z: 30, reward: 'gold', amount: 60 }, { id: 'b_c2', isl: 'puerto', x: -10, z: -74, reward: 'kit', amount: 1 }],
    castaways: [{ id: 'b_n1', x: 26, z: 128 }, { id: 'b_n2', x: -122, z: -38 }],
    enemies: [{ type: 'goleta', x: -40, z: 98 }, { type: 'lancha', x: 70, z: 100 }, { type: 'lancha', x: 92, z: 116 }],
    gates: [{ id: 'g_bruma', to: 'bruma', x: 0, z: 172, need: 1, label: 'Corriente de la Bruma' }],
    cave: null, fort: null,
  },
  bruma: {
    id: 'bruma', name: 'Archipiélago de la Bruma', short: 'Bruma', idx: 2,
    env: { sky: [0x6f8790, 0xc8d4d0], fog: 0xaebdba, fogNear: 50, fogFar: 230, sun: [0xe8efe0, 1.7], hemi: [0xdbe6e2, 0x4a5048, 1.35], sunDir: [-40, 70, 50], exposure: 1.0,
      water: { deep: 0x1d4a55, shallow: 0x4f9a90, foam: 0xf2fffb, amp: 0.45 }, sand: 0xcfc6a2, grass: 0x4d7f52, rock: 0x6f7470 },
    wind: { dir: -0.9, str: 0.9 },
    spawn: { x: -19, z: -84, yaw: 0 }, gateSpawn: { x: 0, z: -158, yaw: 0 },
    islands: [
      { id: 'niebla', name: 'Puerto Niebla', x: -25, z: -112, r: 21, h: 5, land: true, palms: 5, huts: 4 },
      { id: 'eco', name: 'Isla del Eco', x: -96, z: 16, r: 20, h: 9, land: true, palms: 6, huts: 0, cave: true },
      { id: 'mastiles', name: 'Isla de los Mástiles', x: 86, z: 72, r: 15, h: 6, land: true, palms: 6, huts: 0, wrecks: true },
      { id: 'gemela', name: 'Isla Gemela', x: 42, z: -40, r: 11, h: 4.5, land: true, palms: 4, huts: 0 },
      { id: 'islote', name: 'Islote del Ahorcado', x: -42, z: 82, r: 10, h: 4.5, land: true, palms: 3, huts: 0 },
      { id: 'q1', name: 'Peñasco', x: 2, z: 30, r: 5, h: 5, land: false, rock: true },
      { id: 'q2', name: 'Peñasco', x: 112, z: -28, r: 6, h: 5, land: false, rock: true },
      { id: 'q3', name: 'Peñasco', x: -122, z: 102, r: 6, h: 6, land: false, rock: true },
      { id: 'q4', name: 'Peñasco', x: 32, z: 132, r: 5, h: 4, land: false, rock: true },
      { id: 'q5', name: 'Peñasco', x: -72, z: -58, r: 5, h: 4, land: false, rock: true },
      { id: 'q6', name: 'Peñasco', x: 132, z: 132, r: 5, h: 5, land: false, rock: true },
    ],
    docks: [{ id: 'r_muelle', name: 'Muelle de Puerto Niebla', isl: 'niebla', x: -19, z: -84, yaw: 0, pier: { x: -25, z0: -94, z1: -79 } }],
    lighthouses: [{ x: -38, z: -118 }, { x: 116, z: -28 }],
    cannons: [{ id: 'r_k1', x: 46, z: -35, isl: 'gemela', hp: 70 }, { id: 'r_k2', x: -38, z: 87, isl: 'islote', hp: 70 }],
    treasures: [{ id: 'r_t1', isl: 'mastiles', x: 90, z: 77, reward: 'fragment' }, { id: 'r_t2', isl: 'islote', x: -46, z: 78, reward: 'gold', amount: 100 }],
    chests: [{ id: 'r_c1', isl: 'eco', x: -97, z: 21.4, reward: 'fragment', cave: true }, { id: 'r_c2', isl: 'gemela', x: 38, z: -44, reward: 'gold', amount: 90 }],
    castaways: [{ id: 'r_n1', x: 60, z: 10 }, { id: 'r_n2', x: -62, z: 132 }, { id: 'r_n3', x: 122, z: -92 }],
    enemies: [{ type: 'goleta', x: 22, z: 64 }, { type: 'goleta', x: -72, z: -18 }, { type: 'lancha', x: 102, z: 22 }, { type: 'shark', x: 30, z: 100 }],
    gates: [{ id: 'g_coral', to: 'coral', x: 0, z: 176, need: 3, label: 'Corriente del Coral Negro' }],
    cave: { isl: 'eco', x: -97, z: 22, r: 4.5 }, fort: null,
  },
  coral: {
    id: 'coral', name: 'Fuerte de Coral Negro', short: 'Coral Negro', idx: 3,
    env: { sky: [0x241a3a, 0x8a4f6a], fog: 0x4a3550, fogNear: 70, fogFar: 260, sun: [0xffb08a, 1.9], hemi: [0x9a8ac0, 0x2a2030, 1.15], sunDir: [-70, 50, -40], exposure: 1.05,
      water: { deep: 0x0f1d33, shallow: 0x2f5a6a, foam: 0xe8f0ff, amp: 0.8 }, sand: 0x8f8478, grass: 0x3e4a3a, rock: 0x2c2a33 },
    wind: { dir: 2.4, str: 1.1 },
    spawn: { x: 0, z: -158, yaw: 0 }, gateSpawn: { x: 0, z: -158, yaw: 0 },
    islands: [
      { id: 'fuerte', name: 'Fuerte de Coral Negro', x: 0, z: 74, r: 33, h: 6, land: true, palms: 0, huts: 0, fort: true },
      { id: 'k1', name: 'Coral Negro', x: -72, z: 4, r: 8, h: 7, land: false, coral: true },
      { id: 'k2', name: 'Coral Negro', x: 74, z: -8, r: 9, h: 8, land: false, coral: true },
      { id: 'k3', name: 'Coral Negro', x: -60, z: -110, r: 7, h: 6, land: false, coral: true },
      { id: 'k4', name: 'Coral Negro', x: 66, z: -112, r: 6, h: 6, land: false, coral: true },
      { id: 'cala', name: 'Cala del Náufrago', x: -114, z: 84, r: 10, h: 4, land: true, palms: 4, huts: 0 },
      { id: 'faro', name: 'Faro Roto', x: 114, z: 92, r: 9, h: 5, land: false, rock: true },
    ],
    docks: [],
    lighthouses: [{ x: 114, z: 92, broken: true }],
    cannons: [
      { id: 'c_b1', x: -20, z: 54, isl: 'fuerte', hp: 90, battery: true }, { id: 'c_b2', x: 20, z: 54, isl: 'fuerte', hp: 90, battery: true },
      { id: 'c_b3', x: -20, z: 94, isl: 'fuerte', hp: 90, battery: true }, { id: 'c_b4', x: 20, z: 94, isl: 'fuerte', hp: 90, battery: true },
    ],
    treasures: [{ id: 'c_t1', isl: 'cala', x: -117, z: 88, reward: 'gold', amount: 150 }],
    chests: [{ id: 'c_c1', isl: 'cala', x: -110, z: 80, reward: 'kit', amount: 1 }],
    castaways: [{ id: 'c_n1', x: -124, z: -24 }],
    enemies: [{ type: 'lancha', x: -40, z: 2 }, { type: 'lancha', x: 40, z: -22 }, { type: 'lancha', x: 2, z: 14 }, { type: 'goleta', x: 84, z: 26 }, { type: 'shark', x: -60, z: -60 }],
    gates: [],
    cave: null,
    fort: { isl: 'fuerte', pier: { x: 0, z0: 42, z1: 28 }, dock: { x: 6, z: 32, yaw: 0 }, flag: { x: 0, z: 74 }, wall: 20 },
    boss: { x: 0, z: -48, arena: 70 },
  },
};
export const REGION_IDS = /** @type {const} */ (['bahia', 'bruma', 'coral']);
export const WORLD_R = 190;

/** Misiones: 3 principales (campaña) + secundarias rotativas. */
export const MISSIONS = [
  { id: 'm_mapa', kind: 'primary', title: 'Reunir los 3 fragmentos del mapa', desc: 'Cofres y tesoros enterrados de la Bahía y la Bruma.', event: 'fragment', target: 3 },
  { id: 'm_fuerte', kind: 'primary', title: 'Asaltar el Fuerte de Coral Negro', desc: 'Silenciá las 4 baterías, desembarcá y tomá la bandera.', event: 'fort', target: 1 },
  { id: 'm_almirante', kind: 'primary', title: 'Vencer al Almirante Espectral', desc: 'Hundí el galeón acorazado y recuperá su cofre.', event: 'admiral', target: 1 },
  { id: 's_naufragos', title: 'Rescatar 3 náufragos', desc: 'Acercate despacio a las balsas y tocá ACCIÓN.', event: 'rescue', target: 3 },
  { id: 's_cueva', title: 'Descubrir una cueva', desc: 'Hay una gruta escondida en la Isla del Eco.', event: 'cave', target: 1 },
  { id: 's_abordaje', title: 'Abordar una goleta', desc: 'Dejala con la bandera blanca y abordala.', event: 'board', target: 1 },
  { id: 's_mastil', title: 'Ganar una batalla sin perder el mástil', desc: 'Hundí o rendí a todos los que te atacan con el mástil en pie.', event: 'cleanBattle', target: 1 },
  { id: 's_tesoros', title: 'Desenterrar 3 tesoros', desc: 'Buscá las X rojas en la arena.', event: 'treasure', target: 3 },
  { id: 's_tiburon', title: 'Ahuyentar al tiburón gigante', desc: 'Disparale cuando salta fuera del agua.', event: 'shark', target: 1 },
  { id: 's_lanchas', title: 'Hundir 4 lanchas corsarias', desc: 'Recibilas de proa o barrelas de costado.', event: 'sinkLaunch', target: 4 },
];

const regionState = () => ({ dug: [], chests: [], cannons: [], rescued: [], cave: false, dock: false });
export const SAVE_DEFAULTS = {
  started: false,
  region: 'bahia',
  unlocked: ['bahia'],
  fragments: 0,
  fort: false,
  admiral: false,
  gold: 50,
  plunder: 0,
  kits: 1,
  up: { cannons: 0, armor: 0 },
  regions: { bahia: regionState(), bruma: regionState(), coral: regionState() },
  wins: 0,
  bestScore: 0,
  stats: { sunk: 0, shots: 0, hits: 0, rescued: 0, boarded: 0, treasures: 0 },
  tutorial: { off: false, seen: /** @type {Record<string,boolean>} */ ({}) },
  opts: { sens: 1, cam: 'lejos', motion: 'auto', aim: true, binds: { port: 'KeyQ', star: 'KeyE', act: 'Space', kit: 'KeyR' } },
};
export const newRegionState = regionState;

/** @param {string} code */
export function keyLabel(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ Space: 'Espacio', ShiftLeft: 'Shift', ShiftRight: 'Shift der.', ControlLeft: 'Ctrl', Enter: 'Enter', Tab: 'Tab' })[code] || code;
}
