// @ts-check
/* GUARDIANES ESTELARES — constantes, tablas de dificultad/calidad, misiones y definición de sectores. */

export const ID = 'guardianes_estelares';
export const TITLE = 'GUARDIANES ESTELARES';
export const ACCENT = '#ffb13b';
export const SAVE_KEY = ID + ':save';
export const SAVE_VERSION = 2;

/** Tabla de dificultad: cada nivel cambia números reales del combate (nunca los controles). */
export const DIFFICULTY = {
  facil:   { label: 'Fácil',   enemyHp: 0.75, enemyDmg: 0.55, fireRate: 0.7,  regenDelay: 2.0, convoyHp: 1.5, waves: 0.75, bossHp: 0.75, assist: 9,  score: 0.8 },
  normal:  { label: 'Normal',  enemyHp: 1.0,  enemyDmg: 1.0,  fireRate: 1.0,  regenDelay: 3.0, convoyHp: 1.0, waves: 1.0,  bossHp: 1.0,  assist: 6,  score: 1.0 },
  dificil: { label: 'Difícil', enemyHp: 1.25, enemyDmg: 1.35, fireRate: 1.25, regenDelay: 4.0, convoyHp: 0.85, waves: 1.25, bossHp: 1.3,  assist: 4.5, score: 1.3 },
  extremo: { label: 'Extremo', enemyHp: 1.5,  enemyDmg: 1.75, fireRate: 1.5,  regenDelay: 5.0, convoyHp: 0.7, waves: 1.5,  bossHp: 1.6,  assist: 3.5, score: 1.7 },
};

/** Tabla de calidad: costos reales de render. */
export const QUALITY = {
  low:    { stars: 900,  asteroids: 0.45, crystals: 0.5, particles: 160, fogFar: 380, far: 520,  dust: 0,   shadows: false },
  medium: { stars: 2200, asteroids: 0.75, crystals: 0.8, particles: 360, fogFar: 560, far: 800,  dust: 120, shadows: false },
  high:   { stars: 4500, asteroids: 1.0,  crystals: 1.0, particles: 700, fogFar: 760, far: 1100, dust: 260, shadows: true },
};

/** Misiones (MLMissions): 3 principales del spec + 4 secundarias. */
export const MISSIONS = [
  { id: 'convoy', kind: 'primary', title: 'Salvar convoy mercante', desc: 'Escoltá el convoy por el Cinturón de asteroides hasta el portal.', event: 'convoySaved', target: 1 },
  { id: 'transmisores', kind: 'primary', title: 'Desactivar tres transmisores', desc: 'Escaneá cada baliza de frecuencia y destruí su transmisor en la estación Delta.', event: 'transmitterDown', target: 3 },
  { id: 'nemesis', kind: 'primary', title: 'Destruir el destructor Némesis', desc: 'Torretas, escudos y reactor: tres fases en la Nebulosa de cristales.', event: 'nemesisDown', target: 1 },
  { id: 'sin_escudo', short: 'Escudo intacto', title: 'Completar sector sin perder escudo', desc: 'Terminá un sector sin que tu escudo llegue a cero.', event: 'sectorClean', target: 1 },
  { id: 'capsulas', short: 'Cápsulas', title: 'Recuperar cinco cápsulas', desc: 'Atravesá cápsulas de rescate flotantes (hay 3 por sector).', event: 'capsule', target: 5 },
  { id: 'drones_laser', short: 'Drones con láser', title: 'Eliminar diez drones con láser', desc: 'Remate drones minadores con el láser secundario.', event: 'droneLaser', target: 10 },
  { id: 'cargueros', short: 'Cargueros', title: 'Salvar dos cargueros aliados', desc: 'Defendé los cargueros varados en la estación Delta.', event: 'freighterSaved', target: 2 },
];

/** Armas: nivel 1..3. */
export const WEAPONS = {
  pulse: [
    null,
    { rate: 7, dmg: 10, twin: false, speed: 170 },
    { rate: 8, dmg: 12, twin: true, speed: 185 },
    { rate: 10, dmg: 15, twin: true, speed: 200 },
  ],
  laser: [
    null,
    { dps: 42, range: 130, drain: 34 },
    { dps: 60, range: 160, drain: 30 },
    { dps: 85, range: 190, drain: 26 },
  ],
};

export const SHIP = {
  speed: 34, boost: 66, brake: 14, yawRate: 1.55, pitchRate: 1.25, accel: 2.6, turnResp: 5,
  shield: 100, hull: 100, regen: 22, boostMax: 100, boostDrain: 30, boostRegen: 16, energyRegen: 22,
};

export const ENEMY = {
  interceptor: { hp: 32, speed: 46, score: 120, radius: 3.2 },
  drone:       { hp: 26, speed: 16, score: 90,  radius: 2.8 },
  bomber:      { hp: 150, speed: 15, score: 350, radius: 6.5 },
  frigate:     { hp: 300, speed: 9,  score: 600, radius: 13 },
};

/** Sectores de la campaña. */
export const SECTORS = [
  {
    id: 'cinturon', name: 'Cinturón de asteroides', short: 'CINTURÓN', mission: 'convoy',
    goal: 'Escoltá al convoy hasta el portal de salto',
    sky: [0x06101f, 0x0b2340, 0x1a3b5c], fog: 0x0a1a2c, sun: 0xffe2b8, hemi: [0x9fc6ff, 0x221a14],
    radius: 450,
  },
  {
    id: 'delta', name: 'Orbital de la estación Delta', short: 'ESTACIÓN DELTA', mission: 'transmisores',
    goal: 'Escaneá las balizas y destruí los 3 transmisores',
    sky: [0x040a12, 0x0e2236, 0x2f4f63], fog: 0x0b1824, sun: 0xfff1d6, hemi: [0xbfe3ff, 0x101820],
    radius: 400,
  },
  {
    id: 'nebulosa', name: 'Nebulosa de cristales', short: 'NEBULOSA', mission: 'nemesis',
    goal: 'Resistí hasta que aparezca el destructor Némesis',
    sky: [0x120620, 0x3a1150, 0x7a2a7c], fog: 0x2a0f3a, sun: 0xffc6f0, hemi: [0xe0b0ff, 0x1a0820],
    radius: 400,
  },
];
