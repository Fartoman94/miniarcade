// @ts-check
/* Reino del Alba — tablas de diseño: dificultad, calidad, misiones, guardado y teclas. */

export const GAME_ID = 'reino_alba';
export const TITLE = 'Reino del Alba';
export const ACCENT = '#f2b544';

/** Efectos reales de cada dificultad (nunca cambian los controles). */
export const DIFF = {
  facil:   { hp: 8, enemyDmg: 1, enemySpeed: 0.8, enemyHp: 0.75, bossHp: 0.7, telegraph: 1.35, aggro: 7,  potionHeal: 4, price: 0.7, coinsLost: 0,    allyDmg: 2 },
  normal:  { hp: 6, enemyDmg: 1, enemySpeed: 1.0, enemyHp: 1.0,  bossHp: 1.0, telegraph: 1.0,  aggro: 9,  potionHeal: 3, price: 1.0, coinsLost: 0.1,  allyDmg: 1 },
  dificil: { hp: 5, enemyDmg: 1, enemySpeed: 1.15, enemyHp: 1.3, bossHp: 1.3, telegraph: 0.85, aggro: 11, potionHeal: 2, price: 1.3, coinsLost: 0.2,  allyDmg: 1 },
  extremo: { hp: 4, enemyDmg: 2, enemySpeed: 1.3, enemyHp: 1.6,  bossHp: 1.6, telegraph: 0.7,  aggro: 13, potionHeal: 2, price: 1.6, coinsLost: 0.3,  allyDmg: 1 },
};
/** @typedef {typeof DIFF.normal} Diff */

/** Costos por calidad (además del DPR y las sombras que maneja Kit3D). */
export const QUAL = {
  low:    { trees: 0.45, grass: 0,   fogNear: 14, fogFar: 46,  far: 70,  lights: 0, particles: 24, farNpcHz: 1, nearNpcR: 18 },
  medium: { trees: 0.75, grass: 0.5, fogNear: 22, fogFar: 70,  far: 110, lights: 2, particles: 48, farNpcHz: 2, nearNpcR: 26 },
  high:   { trees: 1.0,  grass: 1,   fogNear: 30, fogFar: 100, far: 150, lights: 4, particles: 64, farNpcHz: 4, nearNpcR: 34 },
};

/** Duración del día: horas de juego por segundo real (1 día ≈ 12 minutos). */
export const HOURS_PER_SEC = 24 / 720;

export const MISSIONS = [
  { id: 'llave_alba', kind: 'primary', title: 'La llave del alba', desc: 'Capitán → herrero → minerales de la cueva → llave → torre → rescate → rey.', event: 'mainA', target: 1 },
  { id: 'bosque_oscuro', kind: 'primary', title: 'El bosque oscuro', desc: 'Limpiá tres tótems, derrotá al Guardián y restaurá el altar.', event: 'mainB', target: 1 },
  { id: 'defensa_reino', kind: 'primary', title: 'La defensa del reino', desc: 'Reforzá 3 puertas, reuní aliados y derrotá al Carcelero.', event: 'mainC', target: 1 },
  { id: 'libro', title: 'Recuperar el libro', desc: 'La bibliotecaria perdió la Crónica del Alba en el bosque.', event: 'secLibro', target: 1 },
  { id: 'medicina', title: 'Entregar medicina', desc: 'Juntá hierbas, prepará el tónico y llevalo al campesino.', event: 'secMedicina', target: 1 },
  { id: 'semillas', title: 'Comprar semillas', desc: 'Comprale semillas al mercader y plantalas en la huerta.', event: 'secSemillas', target: 1 },
  { id: 'molino', title: 'Reparar el molino', desc: 'Llevá el engranaje del aprendiz al molino de la aldea.', event: 'secMolino', target: 1 },
  { id: 'mascota', title: 'Rescatar a Canela', desc: 'Encontrá la perrita del viajero en los Campos Dorados.', event: 'secMascota', target: 1 },
  { id: 'puente', title: 'Activar el puente viejo', desc: 'Accioná las dos palancas del puente de los Campos.', event: 'secPuente', target: 1 },
];

export const SAVE_VERSION = 1;
export const SAVE_DEFAULTS = {
  scene: 'aldea',
  spawn: 'inicio',
  time: 8,
  hp: 6,
  fame: 0,
  started: false,
  wins: 0,
  victory: false,
  inv: { coins: 15, ore: 0, potions: 1, herbs: 0, items: /** @type {Record<string, number>} */ ({}) },
  /** banderas del mundo (molino, puente, altar, puertas reforzadas, aliados…) */
  flags: /** @type {Record<string, any>} */ ({}),
  /** puertas: id → 'closed' | 'open' */
  doors: /** @type {Record<string, string>} */ ({}),
  /** cofres: id → 'locked' | 'closed' | 'opened' | 'looted' */
  chests: /** @type {Record<string, string>} */ ({}),
  /** misiones: id → etapa (0 = sin empezar; final = cantidad de etapas) */
  quests: /** @type {Record<string, number>} */ ({}),
  /** objetos del mundo ya recogidos (minerales, hierbas, libro…) */
  picked: /** @type {Record<string, boolean>} */ ({}),
  /** NPC: id → { talked, mood } (la ubicación sale de la agenda) */
  npcs: /** @type {Record<string, {talked:number}>} */ ({}),
  tutorial: { off: false, seen: /** @type {Record<string, boolean>} */ ({}) },
  opts: { sens: 1, invert: false, motion: 'auto' },
};
export const KEY_HELP = {
  pc: 'WASD mover · E/Enter interactuar · Espacio/J/clic atacar · Shift/K rodar · F poción · Q/R cámara · L diario',
  touch: 'Joystick · USAR · ⚔ atacar · ⤳ rodar · 🧪 poción · deslizá la cámara',
  gamepad: 'Stick mover · A usar · X atacar · B rodar · Y poción · LB/RB cámara · Select diario',
};
