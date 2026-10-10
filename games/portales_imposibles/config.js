// @ts-check
/* Portales Imposibles — tablas de diseño: dificultad, calidad, salas, misiones y guardado. */

export const GAME_ID = 'portales_imposibles';
export const TITLE = 'Portales Imposibles';
export const ACCENT = '#9b7bff';
/** Colores de los dos portales (A azul, B naranja). */
export const PCOL = { A: 0x35b6ff, B: 0xff8a24 };

/** Física del sujeto de prueba (metros, segundos). */
export const PHYS = { g: 16, speed: 5.2, airAccel: 9, jump: 6.2, halfW: 0.3, halfH: 0.85, eye: 0.62, killFallSpeed: 99 };
/** Tamaño de los portales (ancho × alto). */
export const PORTAL = { w: 1.25, h: 2.05 };

/** Efectos reales de cada dificultad (nunca cambian los controles). */
export const DIFF = {
  facil:   { lives: 9, hp: 4, turretAim: 1.5,  turretRate: 0.75, turretDmg: 1, sphereScan: 2.4, sphereRadius: 1.9, doorMul: 1.5, parMul: 1.4,  shardEvery: 4.4, shardWarn: 1.7, nodeTime: 0.8, pulseEvery: 7.5, acidRise: 0.10, cubes: 3 },
  normal:  { lives: 6, hp: 3, turretAim: 1.0,  turretRate: 0.55, turretDmg: 1, sphereScan: 1.6, sphereRadius: 2.2, doorMul: 1.0, parMul: 1.0,  shardEvery: 3.4, shardWarn: 1.3, nodeTime: 1.2, pulseEvery: 6.0, acidRise: 0.14, cubes: 3 },
  dificil: { lives: 4, hp: 3, turretAim: 0.7,  turretRate: 0.45, turretDmg: 1, sphereScan: 1.1, sphereRadius: 2.5, doorMul: 0.8, parMul: 0.85, shardEvery: 2.7, shardWarn: 1.05, nodeTime: 1.6, pulseEvery: 5.0, acidRise: 0.18, cubes: 3 },
  extremo: { lives: 2, hp: 2, turretAim: 0.5,  turretRate: 0.35, turretDmg: 2, sphereScan: 0.8, sphereRadius: 2.8, doorMul: 0.65, parMul: 0.75, shardEvery: 2.2, shardWarn: 0.85, nodeTime: 2.0, pulseEvery: 4.2, acidRise: 0.22, cubes: 3 },
};
/** @typedef {typeof DIFF.normal} Diff */

/** Costos por calidad (además del DPR y las sombras de Kit3D).
 *  portalRT: escala del render target de cada portal respecto del búfer de dibujo (0 = sin render target: membrana animada). */
export const QUAL = {
  low:    { portalRT: 0,    rtHalfFloat: false, fogNear: 14, fogFar: 46,  far: 70,  particles: 50,  lights: 1 },
  medium: { portalRT: 0.5,  rtHalfFloat: false, fogNear: 22, fogFar: 75,  far: 110, particles: 160, lights: 3 },
  high:   { portalRT: 0.85, rtHalfFloat: true,  fogNear: 30, fogFar: 120, far: 160, particles: 320, lights: 5 },
};

/** Salas del complejo. `par` = tiempo objetivo (s), multiplicado por parMul de la dificultad. */
export const ROOMS = [
  { id: '1-1', scen: 1, name: 'Primer Paso', par: 45 },
  { id: '1-2', scen: 1, name: 'Peso Muerto', par: 80 },
  { id: '1-3', scen: 1, name: 'Salto de Fe', par: 75 },
  { id: '2-1', scen: 2, name: 'Ascensor Gravitatorio', par: 120 },
  { id: '2-2', scen: 2, name: 'Sala del Generador', par: 200 },
  { id: '3-1', scen: 3, name: 'Antesala Prismática', par: 80 },
  { id: '3-B', scen: 3, name: 'Núcleo Fractal', par: 240 },
];
export const ROOM = Object.fromEntries(ROOMS.map(r => [r.id, r]));
export const SCEN_NAMES = { 1: 'Laboratorio Azul', 2: 'Salas de Gravedad', 3: 'Núcleo Prismático' };
export const CRYSTALS = ['c11', 'c12', 'c13', 'c21', 'c22', 'c31'];

export const MISSIONS = [
  { id: 'salas', kind: 'primary', title: 'Resolvé las tres salas iniciales', desc: 'Primer Paso, Peso Muerto y Salto de Fe, en el Laboratorio Azul.', event: 'labRoom', target: 3 },
  { id: 'generador', kind: 'primary', title: 'Restaurá el generador', desc: 'Llevá energía a los dos paneles del generador y bajá la palanca.', event: 'generator', target: 1 },
  { id: 'salida', kind: 'primary', title: 'Salí del Núcleo Fractal', desc: 'Desarmá el Núcleo en sus tres fases y cruzá el portal de salida.', event: 'escape', target: 1 },
  { id: 'dosportales', title: 'Sala con dos portales', desc: 'Resolvé una sala disparando sólo dos portales.', event: 'twoPortals', target: 1 },
  { id: 'cristales', title: 'Obtené todos los cristales', desc: 'Hay seis, uno escondido en cada sala.', event: 'crystal', target: 6, mode: 'max' },
  { id: 'sinpistas', title: 'Dos salas sin pistas', desc: 'Resolvé dos salas sin pedir ninguna pista en ellas.', event: 'noHintRoom', target: 2 },
  { id: 'tiempo', title: 'Sala en tiempo objetivo', desc: 'Terminá una sala antes del tiempo marcado (también vale en Contrarreloj).', event: 'parRoom', target: 1 },
  { id: 'torretas', title: 'Tumbá tres torretas', desc: 'Con un cubo, un láser, un portal bajo sus patas o empujándolas por la espalda.', event: 'turretDown', target: 3 },
];

export const SAVE_VERSION = 1;
export const SAVE_DEFAULTS = {
  scen: 1,
  room: '1-1',
  solved: /** @type {Record<string, boolean>} */ ({}),
  best: /** @type {Record<string, number>} */ ({}),
  crystals: /** @type {string[]} */ ([]),
  generator: false,
  bossDone: false,
  started: false,
  wins: 0,
  goldGun: false,
  bestRun: 0,
  tutorial: { off: false, seen: /** @type {Record<string, boolean>} */ ({}) },
  opts: { sens: 1, invert: false, motion: 'auto', fov: 72, binds: { jump: 'Space', use: 'KeyE', portalA: 'KeyQ', portalB: 'KeyF', hint: 'KeyH', reset: 'KeyR' } },
};
export const BIND_NAMES = { jump: 'Saltar', use: 'Usar / agarrar', portalA: 'Portal azul', portalB: 'Portal naranja', hint: 'Pista', reset: 'Reiniciar sala' };

/** Etiqueta legible de un código de tecla. @param {string} code */
export function keyLabel(code) {
  if (!code) return '—';
  if (code === 'Space') return 'Espacio';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return /** @type {any} */ ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' })[code] || code;
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  return code;
}
