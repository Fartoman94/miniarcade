// @ts-check
/* Academia de Dragones — datos de diseño: dragones, dificultad, calidad, misiones y puntaje. */

export const ID = 'academia_dragones';
export const TITLE = 'Academia de Dragones';
export const ACCENT = '#ff9f43';
export const SAVE_VERSION = 1;

/** Dragones: velocidad (multiplica la velocidad crucero), resistencia (energía máxima y daño recibido)
 *  y elemento (multiplicador de daño contra cada tipo de rival). */
export const DRAGONS = [
  { id: 'brisa', name: 'Brisa', element: 'viento', icon: '🌀', speed: 1.15, resist: 0.9, power: 1.0,
    body: 0x4fb8e0, belly: 0xd8f3ff, wing: 0x2a6f9e, horn: 0xf4f1e0, desc: 'Rápida y ágil. Su ráfaga de viento derriba murciélagos de un soplo.' },
  { id: 'musgo', name: 'Musgo', element: 'tierra', icon: '🪨', speed: 0.92, resist: 1.4, power: 1.15,
    body: 0x5f9a3c, belly: 0xd8d29a, wing: 0x7a5a32, horn: 0xe8dcc0, desc: 'Lento pero durísimo. Su bala de piedra parte la coraza de los autómatas.' },
  { id: 'ascua', name: 'Ascua', element: 'fuego', icon: '🔥', speed: 1.05, resist: 1.1, power: 1.3,
    body: 0xd9482b, belly: 0xffc56b, wing: 0x7a1d1d, horn: 0x2b1b14, desc: 'Equilibrada y feroz. Su fuego quema arpías y hiere más a la Serpiente.', locked: true },
];

/** Multiplicador de daño del aliento según elemento → rival. */
export const ELEMENT_MULT = {
  viento: { bat: 2, harpy: 1, auto: 1, boss: 1 },
  tierra: { bat: 1, harpy: 1, auto: 2, boss: 1.1 },
  fuego: { bat: 1.5, harpy: 2, auto: 1.2, boss: 1.4 },
};

/** Tabla de dificultad (efectos reales; nunca cambia los controles). */
export const DIFF = {
  facil:   { label: 'Fácil',   lives: 5, damage: 0.6, enemies: 0.6, bossHp: 0.75, regen: 1.4, ring: 1.3, rival: 0.82, heat: 1.4, tele: 1.3 },
  normal:  { label: 'Normal',  lives: 3, damage: 1.0, enemies: 1.0, bossHp: 1.0,  regen: 1.0, ring: 1.0, rival: 1.0,  heat: 1.0, tele: 1.0 },
  dificil: { label: 'Difícil', lives: 3, damage: 1.3, enemies: 1.3, bossHp: 1.25, regen: 0.85, ring: 0.9, rival: 1.08, heat: 0.85, tele: 0.85 },
  extremo: { label: 'Extremo', lives: 2, damage: 1.6, enemies: 1.6, bossHp: 1.5,  regen: 0.7, ring: 0.8, rival: 1.15, heat: 0.7, tele: 0.72 },
};

/** Calidad gráfica: distancia de dibujo, niebla, nubes instanciadas, partículas, sombras y espejo del lago. */
export const QUALITY = {
  low:    { far: 340, fog: 0.75, clouds: 36,  particles: 140, ambient: 120, shadows: false, mirror: false, terrain: 96 },
  medium: { far: 520, fog: 1.0,  clouds: 80,  particles: 300, ambient: 260, shadows: false, mirror: false, terrain: 128 },
  high:   { far: 700, fog: 1.25, clouds: 140, particles: 520, ambient: 420, shadows: true,  mirror: true,  terrain: 160 },
};

export const REGIONS = ['picos', 'lago', 'volcan'];
export const REGION_NAME = { picos: 'Picos Nubosos', lago: 'Lago de Espejos', volcan: 'Volcán Dormido', tormenta: 'Academia en tormenta' };

/** Misiones (MLMissions): 3 principales + 5 secundarias. */
export const MISSIONS = [
  { id: 'graduarse', kind: 'primary', title: 'Graduarse de aprendiz', desc: 'Superá los 5 marcadores de entrenamiento y el circuito de aros de los Picos Nubosos.', event: 'graduate', target: 1 },
  { id: 'tres_pruebas', kind: 'primary', title: 'Dominar tres pruebas aéreas', desc: 'Circuito de aros, Carrera de los Espejos y Rescate del Volcán.', event: 'trials', target: 3, mode: 'max' },
  { id: 'proteger', kind: 'primary', title: 'Proteger la academia de tormenta', desc: 'Derrotá a la Serpiente de Tormenta antes de que destruya la academia.', event: 'bossDefeated', target: 1 },
  { id: 'huevo_brillante', title: 'Encontrar huevo brillante', desc: 'Está escondido en el Lago de Espejos, entre cristales.', event: 'shinyEgg', target: 1 },
  { id: 'rescatar_dos', title: 'Rescatar dos criaturas', desc: 'Llevá crías de los nidos a una posada flotante.', event: 'rescue', target: 2 },
  { id: 'sin_roca', title: 'Superar circuito sin tocar roca', desc: 'Terminá el circuito de aros o la carrera sin chocar peñascos.', event: 'cleanCircuit', target: 1 },
  { id: 'tercer_dragon', title: 'Desbloquear tercer dragón', desc: 'Juntá los 3 huevos dorados (uno por región) para que nazca Ascua.', event: 'dragon3', target: 1 },
  { id: 'cazador', title: 'Espantar 6 rivales', desc: 'Murciélagos, arpías o autómatas.', event: 'enemy', target: 6 },
];

export const SCORE = { ring: 50, marker: 120, egg: 250, shiny: 600, rescue: 300, inn: 80, bat: 100, harpy: 160, auto: 200, trial: 1000, orb: 60, boss: 5000 };
