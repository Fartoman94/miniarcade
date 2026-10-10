// @ts-check
/* Carrera Vertical — tablas de diseño: dificultad, calidad, misiones, guardado y física. */

export const GAME_ID = 'carrera_vertical';
export const TITLE = 'Carrera Vertical';
export const ACCENT = '#ff7a2f';

/** Física del corredor (m, s). Se ajustó para que los saltos sean legibles: ~1.75 m de alto, ~7 m de largo al sprint. */
export const PHYS = {
  run: 7.6, sprint: 10.4, sprintAfter: 0.9, accel: 34, airAccel: 15, friction: 18,
  jump: 9.3, gUp: 24, gCut: 46, gDown: 31, maxFall: 34,
  slideTime: 0.72, slideH: 0.85, standH: 1.75, radius: 0.32, step: 0.38,
  wallrunTime: 1.05, wallrunG: 7, wallrunMin: 6.2, wallJumpOut: 6.6, wallJumpUp: 9.2,
  climbV: 7.2, climbTime: 0.5, mantleTime: 0.22,
  dash: 15.5, launch: 17.5, zipSpeed: 17, rollWindow: 0.3, hardLand: -19,
};

/** Efectos reales de cada dificultad (nunca cambian los controles). */
export const DIFF = {
  facil:   { fallPen: 3,  alarmPen: 1, detect: 0.85, turretWarn: 1.5,  barrier: 0.75, drone: 0.8,  bossChase: 6.6, captures: 4, limitMul: 1.6,  champMul: 1.15, reach: 2.5, coyote: 0.16, marker: true },
  normal:  { fallPen: 5,  alarmPen: 2, detect: 0.5,  turretWarn: 1.1,  barrier: 1.0,  drone: 1.0,  bossChase: 7.6, captures: 3, limitMul: 1.3,  champMul: 1.0,  reach: 2.3, coyote: 0.12, marker: true },
  dificil: { fallPen: 7,  alarmPen: 3, detect: 0.36, turretWarn: 0.85, barrier: 1.2,  drone: 1.2,  bossChase: 8.4, captures: 2, limitMul: 1.12, champMul: 0.95, reach: 2.1, coyote: 0.1,  marker: false },
  extremo: { fallPen: 10, alarmPen: 4, detect: 0.26, turretWarn: 0.65, barrier: 1.4,  drone: 1.35, bossChase: 9.0, captures: 1, limitMul: 1.0,  champMul: 0.9,  reach: 1.9, coyote: 0.08, marker: false },
};
/** @typedef {typeof DIFF.normal} Diff */

/** Costos por calidad (además del DPR y las sombras que maneja Kit3D). */
export const QUAL = {
  low:    { far: 170, fog: 0.55, skyline: 70,  particles: 90,  stars: 0,   glow: false, windowsLit: false },
  medium: { far: 270, fog: 0.8,  skyline: 170, particles: 240, stars: 220, glow: true,  windowsLit: true },
  high:   { far: 380, fog: 1.0,  skyline: 320, particles: 420, stars: 500, glow: true,  windowsLit: true },
};

export const MISSIONS = [
  { id: 'circuitos', kind: 'primary', title: 'Completá los tres circuitos', desc: 'Amanecer, Neón y Puerto: llegá a la meta de cada uno.', event: 'circuit', target: 3 },
  { id: 'campeonato', kind: 'primary', title: 'Batí un tiempo de campeonato', desc: 'Terminá un circuito por debajo del tiempo dorado.', event: 'champTime', target: 1 },
  { id: 'escape', kind: 'primary', title: 'Escapá del dron jefe', desc: 'Llegá a la meta del Circuito Maestro sin que te atrape.', event: 'escape', target: 1 },
  { id: 'relojes', title: 'Juntá cinco relojes', desc: 'Cada reloj descuenta 1 s de tu tiempo.', event: 'clock', target: 5 },
  { id: 'combo', title: 'Combo de movimiento ×4', desc: 'Encadená pared, deslizamiento, trepada, salto de pared…', event: 'combo', target: 4, mode: 'max' },
  { id: 'sincaer', title: 'Cruzá un sector sin caer', desc: 'De un punto de control al siguiente sin caerte.', event: 'cleanSector', target: 1 },
  { id: 'rutas', title: 'Usá dos rutas alternativas', desc: 'Buscá los grafitis con flecha: marcan atajos y rutas secretas.', event: 'altRoute', target: 2 },
  { id: 'fantasma', title: 'Ganale a tu fantasma', desc: 'Terminá un circuito más rápido que tu mejor marca.', event: 'beatGhost', target: 1 },
  { id: 'sigilo', title: 'Circuito sin alertas', desc: 'Llegá a la meta sin que te detecte ningún dron.', event: 'stealthFinish', target: 1, failOn: 'alarm' },
];

export const SAVE_VERSION = 1;
export const SAVE_DEFAULTS = {
  unlocked: 1,
  done: /** @type {Record<string, boolean>} */ ({}),
  best: /** @type {Record<string, number>} */ ({}),
  splits: /** @type {Record<string, number[]>} */ ({}),
  medals: /** @type {Record<string, number>} */ ({}),
  ghosts: /** @type {Record<string, {t:number, d:number[]}>} */ ({}),
  lastGhost: /** @type {Record<string, {t:number, d:number[]}>} */ ({}),
  clocks: /** @type {Record<string, string[]>} */ ({}),
  routes: /** @type {Record<string, string[]>} */ ({}),
  champion: false,
  escaped: false,
  wins: 0,
  runs: 0,
  last: 'amanecer',
  tutorial: { off: false, seen: /** @type {Record<string, boolean>} */ ({}) },
  opts: { sens: 1, invert: false, motion: 'auto', ghost: 'best', music: true, autocam: true, binds: { jump: 'Space', slide: 'ShiftLeft', action: 'KeyF', respawn: 'KeyR' } },
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
  return code;
}

/** Formato de tiempo mm:ss.d @param {number} t */
export function fmtTime(t) {
  if (!isFinite(t)) return '--:--.-';
  const neg = t < 0; t = Math.abs(t);
  const m = Math.floor(t / 60), s = t - m * 60;
  return (neg ? '-' : '') + `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
