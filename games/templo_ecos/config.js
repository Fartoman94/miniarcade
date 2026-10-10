// @ts-check
/* Templo de los Ecos — tablas de diseño (dificultad, calidad, misiones, guardado). */

export const GAME_ID = 'templo_ecos';
export const TITLE = 'Templo de los Ecos';
export const ACCENT = '#f5b84a';

/** Efectos reales de cada dificultad (nunca cambian los controles). */
export const DIFF = {
  facil:   { hp: 5, flames: 9, enemySpeed: 0.8,  platformMul: 1.35, telegraph: 1.6,  parry: 0.42, drainTime: 2.6, orbInterval: 3.2, p1Hits: 3, p3Hits: 2, parMul: 1.4,  melody: 3, ecoCd: 0.8, doubleOrb: false },
  normal:  { hp: 4, flames: 5, enemySpeed: 1.0,  platformMul: 1.0,  telegraph: 1.2,  parry: 0.32, drainTime: 2.0, orbInterval: 2.6, p1Hits: 3, p3Hits: 2, parMul: 1.0,  melody: 4, ecoCd: 1.0, doubleOrb: false },
  dificil: { hp: 3, flames: 3, enemySpeed: 1.2,  platformMul: 0.85, telegraph: 0.95, parry: 0.26, drainTime: 1.6, orbInterval: 2.2, p1Hits: 4, p3Hits: 3, parMul: 0.85, melody: 5, ecoCd: 1.1, doubleOrb: true },
  extremo: { hp: 2, flames: 2, enemySpeed: 1.4,  platformMul: 0.7,  telegraph: 0.75, parry: 0.2,  drainTime: 1.3, orbInterval: 1.9, p1Hits: 4, p3Hits: 3, parMul: 0.75, melody: 6, ecoCd: 1.2, doubleOrb: true },
};
/** @typedef {typeof DIFF.normal} Diff */

/** Costos por calidad (además del DPR y las sombras que maneja Kit3D). */
export const QUAL = {
  low:    { particles: 60,  fogNear: 12, fogFar: 40, lights: 1, beamGlow: false, far: 70 },
  medium: { particles: 220, fogNear: 18, fogFar: 62, lights: 3, beamGlow: true,  far: 110 },
  high:   { particles: 420, fogNear: 24, fogFar: 90, lights: 6, beamGlow: true,  far: 160 },
};

/** Tiempo récord (s) por sala, multiplicado por parMul de la dificultad. */
export const PAR = { luz: 75, eco: 60, vacio: 55 };

export const MISSIONS = [
  { id: 'sello', kind: 'primary', title: 'Encontrá el Sello del Eco', desc: 'Está en el santuario del Vestíbulo de Estatuas.', event: 'sello', target: 1 },
  { id: 'salas', kind: 'primary', title: 'Resolvé las tres salas', desc: 'Luz, Eco y Vacío, en las Salas de Resonancia.', event: 'roomSolved', target: 3 },
  { id: 'corazon', kind: 'primary', title: 'Desactivá el Corazón del Templo', desc: 'Vencé al Guardián Eco sin perder la reliquia.', event: 'heartOff', target: 1 },
  { id: 'secretos', title: 'Descubrí dos salas secretas', desc: 'Las paredes agrietadas ceden ante el Eco.', event: 'secret', target: 2 },
  { id: 'sinpistas', title: 'Acertijo sin pistas', desc: 'Resolvé la Sala del Eco sin leer la tablilla de pistas.', event: 'riddleNoHint', target: 1, failOn: 'hintUsed' },
  { id: 'codices', title: 'Recogé seis códices', desc: 'Hay nueve escondidos en el templo.', event: 'codex', target: 6 },
  { id: 'record', title: 'Sala en tiempo récord', desc: 'Resolvé una sala antes del tiempo marcado.', event: 'roomRecord', target: 1 },
];

export const SAVE_VERSION = 1;
export const SAVE_DEFAULTS = {
  area: 1,
  cp: 'a1_inicio',
  relics: { sello: false, plumas: false },
  codices: /** @type {string[]} */ ([]),
  secrets: /** @type {string[]} */ ([]),
  rooms: /** @type {Record<string, boolean>} */ ({}),
  best: /** @type {Record<string, number>} */ ({}),
  mirrors: /** @type {Record<string, number>} */ ({}),
  doors: /** @type {Record<string, boolean>} */ ({}),
  blocks: /** @type {Record<string, [number, number]>} */ ({}),
  walls: /** @type {Record<string, boolean>} */ ({}),
  braziers: /** @type {Record<string, boolean>} */ ({}),
  score: 0,
  started: false,
  wins: 0,
  tutorial: { off: false, seen: /** @type {Record<string, boolean>} */ ({}) },
  opts: { sens: 1, invert: false, motion: 'auto', binds: { jump: 'Space', use: 'KeyE', eco: 'KeyF' } },
};

/** Etiqueta legible de un código de tecla. @param {string} code */
export function keyLabel(code) {
  if (!code) return '—';
  if (code === 'Space') return 'Espacio';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] || code;
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  return code;
}
