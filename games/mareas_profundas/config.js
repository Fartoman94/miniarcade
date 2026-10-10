// @ts-check
/* Mareas Profundas — tablas de diseño: dificultad, calidad, zonas, misiones y guardado. */

export const GAME_ID = 'mareas_profundas';
export const TITLE = 'Mareas Profundas';
export const ACCENT = '#ffb547';

/** Efectos reales de cada dificultad (nunca cambian los controles). */
export const DIFF = {
  facil:   { drain: 0.7,  o2: 0.65, dmg: 0.6, crash: 0.5, spd: 0.85, tel: 1.4,  sonarCost: 2,   cells: 25, rods: 2, valveT: 2.4, coreT: 5,  lungeEvery: 5.2, waveEvery: 4.4 },
  normal:  { drain: 1.0,  o2: 1.0,  dmg: 1.0, crash: 1.0, spd: 1.0,  tel: 1.0,  sonarCost: 3,   cells: 18, rods: 3, valveT: 2.8, coreT: 7,  lungeEvery: 4.2, waveEvery: 3.6 },
  dificil: { drain: 1.25, o2: 1.25, dmg: 1.3, crash: 1.3, spd: 1.15, tel: 0.85, sonarCost: 4,   cells: 14, rods: 3, valveT: 3.2, coreT: 8,  lungeEvery: 3.6, waveEvery: 3.1 },
  extremo: { drain: 1.5,  o2: 1.45, dmg: 1.6, crash: 1.6, spd: 1.3,  tel: 0.7,  sonarCost: 5,   cells: 11, rods: 4, valveT: 3.6, coreT: 9,  lungeEvery: 3.1, waveEvery: 2.7 },
};
/** @typedef {typeof DIFF.normal} Diff */

/** Costos por calidad (además del DPR y las sombras que maneja Kit3D). */
export const QUAL = {
  low:    { snow: 160,  rays: 0, fish: 36,  bioLights: 0, fogMul: 1.45, far: 95,  caustics: false, terrainSeg: 56 },
  medium: { snow: 520,  rays: 4, fish: 110, bioLights: 2, fogMul: 1.0,  far: 160, caustics: true,  terrainSeg: 80 },
  high:   { snow: 1100, rays: 7, fish: 200, bioLights: 4, fogMul: 0.82, far: 220, caustics: true,  terrainSeg: 96 },
};

/** Profundidad mostrada = base de la zona − y (metros). */
export const ZONES = {
  1: { name: 'Arrecifes Bioluminiscentes', short: 'Arrecifes', base: 0 },
  2: { name: 'Ciudad Sumergida', short: 'Ciudad', base: 60 },
  3: { name: 'Fosa Silenciosa', short: 'Fosa', base: 140 },
};
/** Límite de presión del casco según los módulos activados. */
export const RATING = { base: 80, reef: 150, city: 300 };

export const SPECIES = {
  linterna: 'Pez linterna', medusa: 'Medusa eléctrica', manta: 'Manta luminosa', tortuga: 'Tortuga de arrecife',
  anguila: 'Anguila guardiana', pulpo: 'Pulpo territorial', rape: 'Rape abisal', leviatan: 'Leviatán Abisal',
};

export const MISSIONS = [
  { id: 'fauna', kind: 'primary', title: 'Escaneá fauna', desc: 'Mantené USAR sobre 4 especies distintas para registrarlas.', event: 'scan', target: 4 },
  { id: 'caja', kind: 'primary', title: 'Recuperá la caja negra', desc: 'Está en el avión hundido de la Ciudad. Llevala al módulo de buceo.', event: 'blackbox', target: 1 },
  { id: 'faro', kind: 'primary', title: 'Activá el faro de la fosa', desc: 'Encendelo en el fondo de la Fosa Silenciosa y apagá el reactor.', event: 'faro', target: 1 },
  { id: 'fotos', title: 'Fotografiá cinco especies', desc: 'FOTO con la especie en cuadro y cerca.', event: 'photo', target: 5 },
  { id: 'ruina', title: 'Encontrá la ruina oculta', desc: 'Algo se esconde tras los escombros del arrecife.', event: 'ruin', target: 1 },
  { id: 'capsula', title: 'Recuperá la cápsula sin chocar', desc: 'Llevala al módulo de la Ciudad sin un solo golpe.', event: 'capsule', target: 1, failOn: 'capsuleCrash' },
  { id: 'bateria', title: 'Salí con 30% de batería', desc: 'Volvé a la superficie con al menos 30% de energía.', event: 'exitBattery', target: 30, mode: 'max', requireWin: true },
];

export const SAVE_VERSION = 1;
export const SAVE_DEFAULTS = {
  zone: 1,
  cp: 'start',
  started: false,
  modules: /** @type {Record<string, boolean>} */ ({}),
  probes: /** @type {Record<string, boolean>} */ ({}),
  debris: /** @type {Record<string, number>} */ ({}),
  doors: /** @type {Record<string, boolean>} */ ({}),
  blackbox: 'wreck',   // wreck | carried | delivered
  capsule: 'alley',    // alley | carried | delivered
  scanned: /** @type {string[]} */ ([]),
  photos: /** @type {string[]} */ ([]),
  cells: /** @type {string[]} */ ([]),
  ruin: false,
  bossPhase: 0,
  beacon: false,
  wins: 0,
  tutorial: { off: false, seen: /** @type {Record<string, boolean>} */ ({}) },
  opts: { sens: 1, invert: false, motion: 'auto', binds: { up: 'Space', down: 'ShiftLeft', sonar: 'KeyQ', use: 'KeyE', photo: 'KeyC', light: 'KeyL' } },
};
export const BIND_NAMES = { up: 'Subir', down: 'Bajar', sonar: 'Sonar', use: 'Usar / escanear', photo: 'Foto', light: 'Luz' };
/** Teclas del mando (sintetizadas por el SDK) por acción. */
export const PAD_KEYS = { up: 'F13', down: 'F17', sonar: 'F15', use: 'F14', photo: 'F16', light: 'F18' };

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
