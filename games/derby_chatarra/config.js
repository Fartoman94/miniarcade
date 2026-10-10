// @ts-check
/* Derby de Chatarra — tablas de diseño: vehículos, rivales, rondas, dificultad, calidad, misiones y guardado. */

export const GAME_ID = 'derby_chatarra';
export const TITLE = 'Derby de Chatarra';
export const ACCENT = '#b8f52a';

/** Vehículos del jugador: masas, velocidades y habilidades (perk) distintas. */
export const CARS = {
  escarabajo: { name: 'Escarabajo', model: 'beetle', color: 0xf2b33d, mass: 1.0, hp: 100, maxSpeed: 26, accel: 21, grip: 8, turn: 2.5, radius: 1.35,
    nitroRegen: 1.6, frontDmg: 1.0, frontArmor: 1.0, perk: 'Nitro rápido', desc: 'Equilibrado. Su nitro se recarga un 60 % más rápido.' },
  pison: { name: 'Pisón', model: 'pickup', color: 0x6b9a3a, mass: 1.6, hp: 135, maxSpeed: 23, accel: 16, grip: 7, turn: 2.15, radius: 1.5,
    nitroRegen: 1.0, frontDmg: 1.4, frontArmor: 0.6, perk: 'Paragolpes reforzado', desc: 'Pesado y lento. Su frente pega ×1,4 y recibe ×0,6.' },
  saeta: { name: 'Saeta', model: 'coupe', color: 0x2fb3ff, mass: 0.75, hp: 80, maxSpeed: 29.5, accel: 25, grip: 9.5, turn: 2.85, radius: 1.25,
    nitroRegen: 1.0, frontDmg: 1.0, frontArmor: 1.0, driftNitro: true, perk: 'Derrape cargado', desc: 'Liviano y rapidísimo. Derrapar llena el nitro.' },
  omega: { name: 'Mini-Omega', model: 'monster', color: 0xc8402f, mass: 1.9, hp: 150, maxSpeed: 24, accel: 17, grip: 7.5, turn: 2.2, radius: 1.6,
    nitroRegen: 1.1, frontDmg: 1.8, frontArmor: 0.7, magnetImmune: true, locked: true, perk: 'Triturador', desc: 'Recompensa del Triturador Omega: frente ×1,8 e inmune a imanes.' },
};
/** @typedef {keyof typeof CARS} CarId */

/** Los cuatro rivales del torneo (siempre los mismos pilotos: hay tabla de posiciones). */
export const RIVALS = {
  chispa: { name: 'La Chispa', type: 'kart', model: 'kart', color: 0xffd23a, mass: 0.6, hp: 60, maxSpeed: 27, accel: 24, grip: 9, turn: 3.1, radius: 1.1,
    frontDmg: 0.9, frontArmor: 1.2, icon: '🏎', counter: 'Frená de golpe o pegale de frente: es frágil.' },
  toro: { name: 'El Toro', type: 'ariete', model: 'ram', color: 0xc0392b, mass: 1.5, hp: 120, maxSpeed: 23, accel: 16, grip: 7.5, turn: 2.0, radius: 1.5,
    frontDmg: 1.3, frontArmor: 0.4, icon: '🐂', counter: 'Esquivá su carga: si choca contra un muro queda aturdido.' },
  helice: { name: 'Dr. Hélice', type: 'volador', model: 'hover', color: 0x9b6bff, mass: 0.9, hp: 80, maxSpeed: 22, accel: 18, grip: 6, turn: 2.4, radius: 1.3,
    frontDmg: 1.0, frontArmor: 1.0, icon: '🛸', counter: 'Salí de la sombra roja; pegale cuando aterriza y recarga.' },
  tanque: { name: 'Doña Tanque', type: 'blindado', model: 'truck', color: 0x7a8a5c, mass: 2.4, hp: 200, maxSpeed: 16.5, accel: 10, grip: 8, turn: 1.55, radius: 1.85,
    frontDmg: 1.2, frontArmor: 0.35, sideArmor: 0.35, rearMul: 2.2, icon: '🛡', counter: 'Blindada adelante y a los costados: pegale en el tanque de atrás.' },
};
/** @typedef {keyof typeof RIVALS} RivalId */
export const RIVAL_IDS = /** @type {RivalId[]} */ (['chispa', 'toro', 'helice', 'tanque']);

/** Jefe: Triturador Omega. */
export const BOSS = { name: 'Triturador Omega', mass: 6, radius: 3.1, maxSpeed: 30 };

/** Rondas del torneo (una por arena). */
export const ROUNDS = [
  { n: 1, arena: 'deposito', name: 'Clasificatoria', place: 'Depósito Industrial' },
  { n: 2, arena: 'coliseo', name: 'Semifinal', place: 'Coliseo Desértico' },
  { n: 3, arena: 'neon', name: 'Gran Final', place: 'Arenas Neón', boss: true },
];
/** Puntos de torneo por puesto en cada ronda. */
export const PLACE_POINTS = [10, 7, 5, 3, 1];
/** Puesto mínimo para pasar de ronda. */
export const ADVANCE_PLACE = 3;

/** Efectos reales de cada dificultad (nunca cambian los controles). */
export const DIFF = {
  facil:   { dmgTaken: 0.65, aggro: 0.3,  rivalSpeed: 0.88, rivalHp: 0.8,  bossHp: 450, bossTele: 1.5,  padRespawn: 6,  roundTime: 100, repair: 3, magnetPull: 10 },
  normal:  { dmgTaken: 1.0,  aggro: 0.45, rivalSpeed: 1.0,  rivalHp: 1.0,  bossHp: 600, bossTele: 1.15, padRespawn: 8,  roundTime: 90,  repair: 2, magnetPull: 13 },
  dificil: { dmgTaken: 1.25, aggro: 0.6,  rivalSpeed: 1.07, rivalHp: 1.15, bossHp: 750, bossTele: 0.95, padRespawn: 10, roundTime: 90,  repair: 1, magnetPull: 15 },
  extremo: { dmgTaken: 1.5,  aggro: 0.75, rivalSpeed: 1.14, rivalHp: 1.3,  bossHp: 900, bossTele: 0.75, padRespawn: 12, roundTime: 80,  repair: 0, magnetPull: 17 },
};
/** @typedef {typeof DIFF.normal} Diff */

/** Costos por calidad (además del DPR y las sombras que maneja Kit3D). */
export const QUAL = {
  low:    { particles: 90,  decor: 0.35, fogNear: 45, fogFar: 120, far: 140, smokeEvery: 0.16 },
  medium: { particles: 240, decor: 0.7,  fogNear: 70, fogFar: 190, far: 230, smokeEvery: 0.08 },
  high:   { particles: 420, decor: 1.0,  fogNear: 90, fogFar: 260, far: 300, smokeEvery: 0.05 },
};

/** Potenciadores. `use` = se guarda en la ranura y se activa con la tecla; repair es instantáneo. */
export const POWERS = {
  nitro:  { name: 'Nitro', icon: '🔥', color: 0xff7a1a, dur: 3.2 },
  iman:   { name: 'Imán', icon: '🧲', color: 0xff3b5c, dur: 5.5 },
  escudo: { name: 'Escudo', icon: '🛡', color: 0x3ec8ff, dur: 5 },
  trampa: { name: 'Trampa', icon: '✴', color: 0xffe14a, dur: 0 },
  repair: { name: 'Reparación', icon: '🔧', color: 0x4dff88, dur: 0 },
};
export const POWER_TYPES = ['nitro', 'iman', 'escudo', 'trampa'];

export const MISSIONS = [
  { id: 'clasificatoria', kind: 'primary', title: 'Ganá la clasificatoria', desc: 'Terminá 1º la Ronda 1 en el Depósito Industrial.', event: 'qualifyWin', target: 1 },
  { id: 'destruir5', kind: 'primary', title: 'Destruí cinco rivales', desc: 'Dejalos fuera de combate (cuenta todo el torneo).', event: 'wreck', target: 5 },
  { id: 'omega', kind: 'primary', title: 'Derrotá al Triturador Omega', desc: 'El gran evento de la Gran Final, en las Arenas Neón.', event: 'omega', target: 1 },
  { id: 'saltos', title: 'Hacé tres saltos acrobáticos', desc: 'Más de 0,7 s en el aire saliendo de una rampa.', event: 'stunt', target: 3 },
  { id: 'sinreparar', title: 'Sobreviví sin reparación', desc: 'Terminá una ronda en pie sin agarrar llaves 🔧.', event: 'noRepairRound', target: 1 },
  { id: 'potenciadores', title: 'Usá tres tipos de potenciador', desc: 'Imán, nitro, escudo o trampa.', event: 'powerType', target: 3 },
  { id: 'torres', title: 'Destruí dos torres de cajas', desc: 'Embestilas a más de 25 km/h.', event: 'tower', target: 2 },
];

export const SAVE_VERSION = 1;
export const SAVE_DEFAULTS = {
  started: false,
  round: 1,
  car: 'escarabajo',
  unlocked: { omega: false },
  /** torneo en curso: puntos de torneo antes de la ronda actual (instantánea para reintentar) */
  tour: { pts: { player: 0, chispa: 0, toro: 0, helice: 0, tanque: 0 }, places: /** @type {number[]} */ ([]), wrecks: 0, score: 0, qualified: false },
  wins: 0,
  bestScore: 0,
  stats: { stunts: 0, towers: 0, wrecks: 0, rounds: 0 },
  tutorial: { off: false, seen: /** @type {Record<string, boolean>} */ ({}) },
  opts: { sens: 1, autoGas: false, motion: 'auto', cam: 'lejos', binds: { nitro: 'ShiftLeft', power: 'KeyE', drift: 'Space' } },
};

/** Etiqueta legible de un código de tecla. @param {string} code */
export function keyLabel(code) {
  if (!code) return '—';
  if (code === 'Space') return 'Espacio';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return /** @type {any} */ ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' })[code] || code;
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  return code;
}
