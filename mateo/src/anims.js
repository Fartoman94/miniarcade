// Mateo: Ciudad de Altura — 39 clips de animación esquelética generados por poses clave (sin root motion: el
// desplazamiento lo hace el controlador; la cadera sólo sube/baja). Nombres explícitos según prompts/01.
// Convenciones (personaje mira a +Z): brazo/pierna hacia adelante = rotX negativa; flexión de rodilla = rotX positiva;
// codo = rotX negativa; inclinar el torso adelante = rotX positiva; abrir brazo izquierdo = rotZ positiva.
import * as THREE from 'three';

const D = Math.PI / 180;
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
const sin = Math.sin, cos = Math.cos, TAU = Math.PI * 2;

/** pose base relajada (brazos un poco separados del cuerpo) */
function base(p = {}) {
  return {
    hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
    upperarm_L: [0, 0, 5], lowerarm_L: [-8, 0, 0], hand_L: [0, 0, 0], upperarm_R: [0, 0, -5], lowerarm_R: [-8, 0, 0], hand_R: [0, 0, 0],
    upperleg_L: [0, 0, 1], lowerleg_L: [0, 0, 0], foot_L: [0, 0, 0], upperleg_R: [0, 0, -1], lowerleg_R: [0, 0, 0], foot_R: [0, 0, 0],
    clavicle_L: [0, 0, 0], clavicle_R: [0, 0, 0], toes_L: [0, 0, 0], toes_R: [0, 0, 0], _y: 0, ...p,
  };
}
/** ciclo de locomoción paramétrico: amp de piernas/brazos, inclinación, rebote y flexión */
function gait(t, o) {
  const a = t * TAU, s = sin(a), c = cos(a);
  const legA = o.leg, armA = o.arm;
  const kneeL = Math.max(0, -sin(a - 0.6)) * o.knee + o.kneeBase, kneeR = Math.max(0, sin(a - 0.6)) * o.knee + o.kneeBase;
  return base({
    hips: [o.lean * 0.3, s * o.twist * 0.5, 0], spine: [o.lean * 0.4, -s * o.twist * 0.4, 0], chest: [o.lean * 0.5, -s * o.twist, 0], head: [-o.lean * 0.7, s * o.twist * 0.6, 0],
    upperleg_L: [-s * legA - o.legBase, 0, 2], lowerleg_L: [kneeL, 0, 0], foot_L: [s * legA * 0.35 - kneeL * 0.25, 0, 0],
    upperleg_R: [s * legA - o.legBase, 0, -2], lowerleg_R: [kneeR, 0, 0], foot_R: [-s * legA * 0.35 - kneeR * 0.25, 0, 0],
    upperarm_L: [s * armA, 0, o.armOut], lowerarm_L: [-o.elbow - Math.max(0, s) * o.elbowSwing, 0, 0],
    upperarm_R: [-s * armA, 0, -o.armOut], lowerarm_R: [-o.elbow - Math.max(0, -s) * o.elbowSwing, 0, 0],
    _y: -Math.abs(c) * o.bob + o.drop,
  });
}
const G = {
  walk: { leg: 28, arm: 24, knee: 45, kneeBase: 6, legBase: 0, lean: 4, twist: 6, armOut: 7, elbow: 12, elbowSwing: 10, bob: 0.025, drop: 0 },
  jog: { leg: 38, arm: 40, knee: 70, kneeBase: 12, legBase: 4, lean: 10, twist: 9, armOut: 9, elbow: 60, elbowSwing: 15, bob: 0.04, drop: -0.02 },
  run: { leg: 48, arm: 55, knee: 95, kneeBase: 15, legBase: 6, lean: 16, twist: 11, armOut: 10, elbow: 80, elbowSwing: 15, bob: 0.05, drop: -0.03 },
  sprint: { leg: 58, arm: 68, knee: 115, kneeBase: 20, legBase: 8, lean: 24, twist: 12, armOut: 12, elbow: 90, elbowSwing: 10, bob: 0.06, drop: -0.05 },
};
const mix = (a, b, k) => { const o = {}; for (const key in a) o[key] = key === '_y' ? a._y + (b._y - a._y) * k : a[key].map((v, i) => v + (b[key][i] - v) * k); return o; };
const ease = k => k * k * (3 - 2 * k);

/** Poses reutilizables */
const P = {
  crouch: base({ hips: [10, 0, 0], spine: [12, 0, 0], chest: [10, 0, 0], head: [-18, 0, 0], upperleg_L: [-75, 0, 6], lowerleg_L: [120, 0, 0], foot_L: [-45, 0, 0], upperleg_R: [-75, 0, -6], lowerleg_R: [120, 0, 0], foot_R: [-45, 0, 0], upperarm_L: [-30, 0, 18], lowerarm_L: [-40, 0, 0], upperarm_R: [-30, 0, -18], lowerarm_R: [-40, 0, 0], _y: -0.22 }),
  air: base({ spine: [-4, 0, 0], upperleg_L: [-35, 0, 6], lowerleg_L: [60, 0, 0], upperleg_R: [-10, 0, -6], lowerleg_R: [25, 0, 0], upperarm_L: [-20, 0, 50], lowerarm_L: [-30, 0, 0], upperarm_R: [-20, 0, -50], lowerarm_R: [-30, 0, 0] }),
  tuck: base({ hips: [20, 0, 0], spine: [20, 0, 0], chest: [15, 0, 0], head: [-10, 0, 0], upperleg_L: [-110, 0, 8], lowerleg_L: [130, 0, 0], upperleg_R: [-110, 0, -8], lowerleg_R: [130, 0, 0], upperarm_L: [-60, 0, 20], lowerarm_L: [-70, 0, 0], upperarm_R: [-60, 0, -20], lowerarm_R: [-70, 0, 0], _y: 0.15 }),
  fall: base({ spine: [-10, 0, 0], chest: [-8, 0, 0], head: [12, 0, 0], upperleg_L: [-25, 0, 10], lowerleg_L: [45, 0, 0], upperleg_R: [5, 0, -10], lowerleg_R: [30, 0, 0], upperarm_L: [0, 0, 110], lowerarm_L: [-20, 0, 0], upperarm_R: [0, 0, -110], lowerarm_R: [-20, 0, 0] }),
  reachL: base({ chest: [-5, 10, 0], upperarm_L: [-160, 0, 15], lowerarm_L: [-5, 0, 0], hand_L: [-20, 0, 0], upperarm_R: [-10, 0, -35], lowerarm_R: [-40, 0, 0], upperleg_L: [-30, 0, 4], lowerleg_L: [50, 0, 0], upperleg_R: [-10, 0, -4], lowerleg_R: [30, 0, 0] }),
};
const mirror = p => { const o = {}; for (const k in p) { if (k === '_y') { o._y = p._y; continue; } const m = k.endsWith('_L') ? k.slice(0, -2) + '_R' : k.endsWith('_R') ? k.slice(0, -2) + '_L' : k; o[m] = [p[k][0], -p[k][1], -p[k][2]]; } return o; };
P.reachR = mirror(P.reachL);

/** Definición de clips: [nombre, duración, loop, fn(t∈[0,1]) → pose] */
const CLIPS = [
  ['idle_breath', 2.4, true, t => base({ chest: [-2 - sin(t * TAU) * 2, 0, 0], head: [2 + sin(t * TAU) * 1.5, 0, 0], upperarm_L: [2, 0, 8 + sin(t * TAU) * 1.5], upperarm_R: [2, 0, -8 - sin(t * TAU) * 1.5], _y: sin(t * TAU) * 0.004 })],
  ['idle_look', 4, true, t => base({ head: [0, sin(t * TAU) * 45, sin(t * TAU) * 4], neck: [0, sin(t * TAU) * 15, 0], chest: [-2, sin(t * TAU) * 8, 0], upperarm_L: [0, 0, 10], upperarm_R: [0, 0, -10] })],
  ['walk_forward', 1.0, true, t => gait(t, G.walk)],
  ['walk_back', 1.1, true, t => gait(1 - t, { ...G.walk, leg: 22, lean: -3 })],
  ['strafe_left', 0.9, true, t => { const p = gait(t, { ...G.walk, leg: 12 }); const s = sin(t * TAU) * 18; p.upperleg_L[2] = 4 + Math.max(0, s); p.upperleg_R[2] = -4 + Math.min(0, s) * 0.5; p.chest[1] = 12; return p; }],
  ['strafe_right', 0.9, true, t => { const p = gait(t, { ...G.walk, leg: 12 }); const s = sin(t * TAU) * 18; p.upperleg_R[2] = -4 - Math.max(0, s); p.upperleg_L[2] = 4 - Math.min(0, s) * 0.5; p.chest[1] = -12; return p; }],
  ['jog', 0.75, true, t => gait(t, G.jog)],
  ['run', 0.62, true, t => gait(t, G.run)],
  ['sprint', 0.5, true, t => gait(t, G.sprint)],
  ['turn_in_place', 0.8, true, t => { const p = gait(t * 2 % 1, { ...G.walk, leg: 10, arm: 8, knee: 25 }); p.hips[1] = 20; return p; }],
  ['start_jump', 0.2, false, t => mix(P.crouch, P.air, ease(t))],
  ['ascend', 0.6, true, t => { const p = mix(P.air, P.tuck, 0.2); p.upperarm_L[2] += sin(t * TAU) * 6; p.upperarm_R[2] -= sin(t * TAU) * 6; return p; }],
  ['jump_apex', 0.4, false, t => mix(P.air, P.tuck, sin(t * Math.PI) * 0.6)],
  ['fall', 0.6, true, t => { const p = { ...P.fall }; p.upperarm_L = [sin(t * TAU) * 10, 0, 105]; p.upperarm_R = [-sin(t * TAU) * 10, 0, -105]; p.upperleg_L = [-25 + sin(t * TAU) * 12, 0, 10]; p.upperleg_R = [5 - sin(t * TAU) * 12, 0, -10]; return p; }],
  ['super_jump_charge', 0.5, true, t => { const p = { ...P.crouch, _y: -0.26 - sin(t * TAU) * 0.01 }; p.upperarm_L = [20, 0, 25 + sin(t * TAU * 2) * 3]; p.upperarm_R = [20, 0, -25 - sin(t * TAU * 2) * 3]; return p; }],
  ['super_jump', 0.5, false, t => { const up = base({ spine: [-8, 0, 0], head: [-15, 0, 0], upperarm_L: [-175, 0, 10], lowerarm_L: [0, 0, 0], upperarm_R: [-175, 0, -10], lowerarm_R: [0, 0, 0], upperleg_L: [5, 0, 2], lowerleg_L: [10, 0, 0], upperleg_R: [5, 0, -2], lowerleg_R: [10, 0, 0], foot_L: [40, 0, 0], foot_R: [40, 0, 0] }); return t < 0.3 ? mix(P.crouch, up, ease(t / 0.3)) : mix(up, P.air, ease((t - 0.3) / 0.7) * 0.6); }],
  ['double_jump', 0.5, false, t => { const p = mix(P.tuck, P.air, ease(Math.max(0, t - 0.6) / 0.4)); p.hips = [-360 * ease(Math.min(1, t / 0.8)), 0, 0]; return p; }],
  ['soft_land', 0.25, false, t => mix(mix(base(), P.crouch, 0.45), base(), ease(t))],
  ['hard_land', 0.5, false, t => mix(P.crouch, base(), ease(Math.max(0, t - 0.35) / 0.65))],
  ['roll_land', 0.6, false, t => { const p = mix(P.tuck, base(), ease(Math.max(0, t - 0.7) / 0.3)); p.hips = [360 * ease(Math.min(1, t / 0.75)), 0, 0]; p._y -= sin(t * Math.PI) * 0.35; return p; }],
  ['crouch', 1.6, true, t => { const p = { ...P.crouch }; p.head = [-18, sin(t * TAU) * 10, 0]; return p; }],
  ['wall_run_left', 0.5, true, t => { const p = gait(t, { ...G.run, armOut: 4 }); p.hips[2] = 28; p.spine[2] = 6; p.upperarm_L = [-40, 0, 70]; p.lowerarm_L = [-10, 0, 0]; return p; }],
  ['wall_run_right', 0.5, true, t => { const p = gait(t, { ...G.run, armOut: 4 }); p.hips[2] = -28; p.spine[2] = -6; p.upperarm_R = [-40, 0, -70]; p.lowerarm_R = [-10, 0, 0]; return p; }],
  ['wall_climb', 0.7, true, t => { const s = sin(t * TAU); return base({ spine: [-15, 0, 0], chest: [-10, 0, 0], head: [-25, 0, 0], upperarm_L: [-150 - s * 25, 0, 20], lowerarm_L: [-30 + s * 25, 0, 0], upperarm_R: [-150 + s * 25, 0, -20], lowerarm_R: [-30 - s * 25, 0, 0], upperleg_L: [-60 + s * 30, 0, 10], lowerleg_L: [80 - s * 30, 0, 0], upperleg_R: [-60 - s * 30, 0, -10], lowerleg_R: [80 + s * 30, 0, 0] }); }],
  ['grapple_shoot_left', 0.35, false, t => mix(base(), P.reachL, ease(Math.min(1, t * 2.5)))],
  ['grapple_shoot_right', 0.35, false, t => mix(base(), P.reachR, ease(Math.min(1, t * 2.5)))],
  ['grapple_pull', 0.5, true, t => { const p = { ...P.reachR }; p.lowerarm_R = [-40 - sin(t * TAU) * 20, 0, 0]; p.chest = [-10, -10, 0]; return p; }],
  ['swing_1hand', 1.2, true, t => { const s = sin(t * TAU); const p = { ...P.reachR }; p.upperleg_L = [-50 + s * 30, 0, 8]; p.lowerleg_L = [70 - s * 20, 0, 0]; p.upperleg_R = [-20 - s * 25, 0, -8]; p.lowerleg_R = [40 + s * 25, 0, 0]; p.upperarm_L = [-30 + s * 30, 0, 60]; p.spine = [-6 + s * 8, 0, 0]; return p; }],
  ['swing_2hand', 1.2, true, t => { const s = sin(t * TAU); return base({ spine: [-8 + s * 10, 0, 0], head: [-10, 0, 0], upperarm_L: [-165, 0, 8], lowerarm_L: [-10, 0, 0], upperarm_R: [-165, 0, -8], lowerarm_R: [-10, 0, 0], upperleg_L: [-40 + s * 35, 0, 6], lowerleg_L: [60, 0, 0], upperleg_R: [-40 + s * 35, 0, -6], lowerleg_R: [60, 0, 0] }); }],
  ['swing_kick', 0.5, false, t => { const k = sin(Math.min(1, t * 1.6) * Math.PI); const p = { ...P.reachR }; p.upperleg_L = [-90 * k, 0, 6]; p.lowerleg_L = [10, 0, 0]; p.upperleg_R = [-80 * k, 0, -6]; p.lowerleg_R = [15, 0, 0]; p.spine = [-15 * k, 0, 0]; return p; }],
  ['web_release_flip', 0.6, false, t => { const p = mix(P.tuck, P.air, ease(Math.max(0, t - 0.7) / 0.3)); p.hips = [-360 * ease(Math.min(1, t / 0.85)), 0, 0]; p.upperarm_L = [-60, 0, 80]; p.upperarm_R = [-60, 0, -80]; return p; }],
  ['air_glide', 1.0, true, t => { const s = sin(t * TAU); return base({ hips: [60, 0, s * 4], spine: [10, 0, 0], head: [-50, 0, 0], upperarm_L: [0, 0, 95 + s * 4], lowerarm_L: [0, 0, 0], upperarm_R: [0, 0, -95 - s * 4], lowerarm_R: [0, 0, 0], upperleg_L: [10, 0, 10], lowerleg_L: [25, 0, 0], upperleg_R: [10, 0, -10], lowerleg_R: [25, 0, 0] }); }],
  ['dash', 0.35, false, t => { const p = gait(0.25, G.sprint); p.chest[0] += 15 * sin(t * Math.PI); p.upperarm_L = [40, 0, 30]; p.upperarm_R = [40, 0, -30]; return p; }],
  ['stun_attack', 0.45, false, t => { const k = t < 0.35 ? ease(t / 0.35) : 1 - ease((t - 0.35) / 0.65) * 0.8; return base({ chest: [8 * k, -35 * k, 0], spine: [4 * k, -15 * k, 0], upperarm_R: [-85 * k, 0, -10], lowerarm_R: [-10, 0, 0], hand_R: [-20 * k, 0, 0], upperarm_L: [-20 * k, 0, 35], lowerarm_L: [-60 * k, 0, 0], upperleg_L: [-25 * k, 0, 4], lowerleg_L: [30 * k, 0, 0], upperleg_R: [15 * k, 0, -4], lowerleg_R: [10 * k, 0, 0], _y: -0.05 * k }); }],
  ['hit_react', 0.4, false, t => { const k = sin(t * Math.PI); return base({ chest: [-20 * k, 10 * k, 0], head: [-15 * k, 0, 0], upperarm_L: [-30 * k, 0, 40 * k + 8], upperarm_R: [-30 * k, 0, -40 * k - 8], _y: -0.03 * k }); }],
  ['stagger', 0.8, false, t => { const s = sin(t * TAU * 1.5) * (1 - t); return base({ spine: [-12 * (1 - t), 0, s * 15], head: [10 * s, 0, 0], upperarm_L: [0, 0, 40 * (1 - t) + 8], upperarm_R: [0, 0, -40 * (1 - t) - 8], upperleg_L: [-15 * s, 0, 4], upperleg_R: [15 * s, 0, -4] }); }],
  ['celebrate', 1.2, true, t => { const s = sin(t * TAU * 2); return base({ chest: [-8, 0, 0], head: [-12, s * 10, 0], upperarm_L: [-170 + s * 10, 0, 20], lowerarm_L: [-10, 0, 0], upperarm_R: [-170 - s * 10, 0, -20], lowerarm_R: [-10, 0, 0], _y: Math.abs(sin(t * TAU)) * 0.12, upperleg_L: [-10, 0, 4], lowerleg_L: [20, 0, 0], upperleg_R: [-10, 0, -4], lowerleg_R: [20, 0, 0] }); }],
  ['talk', 1.6, true, t => { const s = sin(t * TAU); return base({ head: [sin(t * TAU * 2) * 4, s * 8, 0], chest: [-2, s * 4, 0], upperarm_R: [-35 - s * 10, 0, -15], lowerarm_R: [-70 + s * 15, 0, 0], hand_R: [0, 0, s * 20], upperarm_L: [-10, 0, 12], lowerarm_L: [-20, 0, 0] }); }],
  ['point', 1.0, false, t => { const k = ease(Math.min(1, t * 3)); return base({ chest: [0, -15 * k, 0], head: [0, -20 * k, 0], upperarm_R: [-85 * k, -20 * k, -10], lowerarm_R: [-5, 0, 0], hand_R: [0, 0, 0] }); }],
];
export const CLIP_NAMES = CLIPS.map(c => c[0]);

/**
 * V2 P1: capas procedurales NUEVAS sobre el mismo esqueleto (no se agregan al GLB: los 39 clips originales quedan
 * intactos). Combate de Mateo (golpe, cruzado, patada, guardia, esquiva, carga y golpe cargado, cable inmovilizador) y
 * reacciones de vecinos y villanos (pedir ayuda, cubrirse, sentarse, manos arriba, empujón con anticipación, arrebato).
 */
const EXTRA = [
  ['punch_jab', 0.32, false, t => { const k = t < 0.25 ? -ease(t / 0.25) * 0.25 : t < 0.5 ? ease((t - 0.25) / 0.25) : 1 - ease((t - 0.5) / 0.5); return base({ chest: [4 * k, -22 * k, 0], spine: [2 * k, -10 * k, 0], upperarm_R: [-88 * k, 0, -8], lowerarm_R: [-70 + 68 * Math.max(0, k), 0, 0], hand_R: [0, 0, 0], upperarm_L: [-50, 0, 25], lowerarm_L: [-110, 0, 0], upperleg_L: [-18, 0, 4], lowerleg_L: [20, 0, 0], upperleg_R: [12, 0, -4], lowerleg_R: [10, 0, 0], _y: -0.03 }); }],
  ['punch_cross', 0.34, false, t => { const k = t < 0.25 ? -ease(t / 0.25) * 0.25 : t < 0.5 ? ease((t - 0.25) / 0.25) : 1 - ease((t - 0.5) / 0.5); return base({ chest: [4 * k, 26 * k, 0], spine: [2 * k, 12 * k, 0], upperarm_L: [-88 * k, 0, 8], lowerarm_L: [-70 + 68 * Math.max(0, k), 0, 0], upperarm_R: [-50, 0, -25], lowerarm_R: [-110, 0, 0], upperleg_L: [-15, 0, 4], lowerleg_L: [18, 0, 0], upperleg_R: [14, 0, -4], lowerleg_R: [12, 0, 0], _y: -0.03 }); }],
  ['kick_front', 0.5, false, t => { const k = t < 0.3 ? ease(t / 0.3) * 0.5 : t < 0.55 ? 0.5 + ease((t - 0.3) / 0.25) * 0.5 : 1 - ease((t - 0.55) / 0.45); return base({ spine: [-12 * k, 0, 0], chest: [-6 * k, 0, 0], upperleg_R: [-100 * k, 0, -4], lowerleg_R: [90 * (1 - k) * Math.min(1, k * 3), 0, 0], foot_R: [-30 * k, 0, 0], upperleg_L: [8 * k, 0, 4], lowerleg_L: [12 * k, 0, 0], upperarm_L: [-30, 0, 45 * k + 10], lowerarm_L: [-60, 0, 0], upperarm_R: [20 * k, 0, -45 * k - 10], lowerarm_R: [-50, 0, 0] }); }],
  ['guard', 1.0, true, t => { const s = sin(t * TAU) * 2; return base({ hips: [6, 0, 0], spine: [8, 0, 0], chest: [6, 0, 0], head: [-10, 0, 0], upperarm_L: [-62 + s, 0, 22], lowerarm_L: [-118, 0, 0], hand_L: [-10, 0, 0], upperarm_R: [-62 - s, 0, -22], lowerarm_R: [-118, 0, 0], hand_R: [-10, 0, 0], upperleg_L: [-22, 0, 8], lowerleg_L: [34, 0, 0], upperleg_R: [-6, 0, -8], lowerleg_R: [20, 0, 0], _y: -0.06 }); }],
  ['dodge_roll', 0.42, false, t => { const p = mix(P.tuck, base(), ease(Math.max(0, t - 0.7) / 0.3)); p.hips = [360 * ease(Math.min(1, t / 0.8)), 0, 0]; p._y -= sin(t * Math.PI) * 0.3; return p; }],
  ['charge_windup', 0.6, true, t => { const s = sin(t * TAU * 2) * 3; return base({ hips: [8, -20, 0], spine: [10, -20, 0], chest: [6, -25, 0], head: [-14, 30, 0], upperarm_R: [25 + s, 0, -40], lowerarm_R: [-110, 0, 0], hand_R: [-30, 0, 0], upperarm_L: [-70, 0, 30], lowerarm_L: [-80, 0, 0], upperleg_L: [-38, 0, 8], lowerleg_L: [50, 0, 0], upperleg_R: [14, 0, -8], lowerleg_R: [24, 0, 0], _y: -0.1 }); }],
  ['charged_strike', 0.55, false, t => { const k = t < 0.3 ? ease(t / 0.3) : 1 - ease((t - 0.45) / 0.55) * (t > 0.45 ? 1 : 0); return base({ hips: [6, 10 * k, 0], spine: [10 * k, 15 * k, 0], chest: [8 * k, 15 * k, 0], upperarm_R: [-95 * k, 0, -6], lowerarm_R: [-6, 0, 0], hand_R: [-40 * k, 0, 0], upperarm_L: [-95 * k, 0, 6], lowerarm_L: [-6, 0, 0], hand_L: [-40 * k, 0, 0], upperleg_L: [-40 * k, 0, 6], lowerleg_L: [35 * k, 0, 0], upperleg_R: [20 * k, 0, -6], lowerleg_R: [8, 0, 0], _y: -0.08 * k }); }],
  ['cable_bind', 0.45, false, t => { const k = ease(Math.min(1, t * 3)) * (t > 0.7 ? 1 - ease((t - 0.7) / 0.3) * 0.6 : 1); return base({ chest: [-4 * k, 0, 0], upperarm_L: [-92 * k, 10 * k, 4], lowerarm_L: [-4, 0, 0], hand_L: [-30 * k, 0, 0], upperarm_R: [-92 * k, -10 * k, -4], lowerarm_R: [-4, 0, 0], hand_R: [-30 * k, 0, 0], upperleg_L: [-20 * k, 0, 4], lowerleg_L: [22 * k, 0, 0] }); }],
  ['help_wave', 1.0, true, t => { const s = sin(t * TAU); return base({ chest: [-6, 0, 0], head: [-10, s * 12, 0], upperarm_L: [-165, 0, 25 + s * 18], lowerarm_L: [-20, 0, 0], upperarm_R: [-165, 0, -25 + s * 18], lowerarm_R: [-20, 0, 0], _y: Math.abs(s) * 0.03 }); }],
  ['cower', 1.2, true, t => { const s = sin(t * TAU) * 2; return base({ hips: [12, 0, 0], spine: [22, 0, 0], chest: [16, 0, 0], head: [10, 0, 0], upperarm_L: [-140 + s, 0, 40], lowerarm_L: [-120, 0, 0], upperarm_R: [-140 - s, 0, -40], lowerarm_R: [-120, 0, 0], upperleg_L: [-60, 0, 6], lowerleg_L: [95, 0, 0], foot_L: [-30, 0, 0], upperleg_R: [-60, 0, -6], lowerleg_R: [95, 0, 0], foot_R: [-30, 0, 0], _y: -0.22 }); }],
  ['sit', 2.4, true, t => { const s = sin(t * TAU); return base({ hips: [0, 0, 0], spine: [-4, 0, 0], head: [4 + s * 2, s * 10, 0], upperleg_L: [-88, 0, 6], lowerleg_L: [88, 0, 0], upperleg_R: [-88, 0, -6], lowerleg_R: [88, 0, 0], upperarm_L: [-20, 0, 12], lowerarm_L: [-50, 0, 0], upperarm_R: [-20, 0, -12], lowerarm_R: [-50, 0, 0], _y: -0.36 }); }],
  ['hands_up', 1.0, true, t => { const s = sin(t * TAU) * 3; return base({ chest: [-4, 0, 0], head: [6, s * 3, 0], upperarm_L: [-10, 0, 150 + s], lowerarm_L: [0, 0, -60], upperarm_R: [-10, 0, -150 - s], lowerarm_R: [0, 0, 60], upperleg_L: [-20, 0, 4], lowerleg_L: [40, 0, 0], upperleg_R: [-20, 0, -4], lowerleg_R: [40, 0, 0], _y: -0.06 }); }],
  ['shove_windup', 0.8, true, t => { const s = sin(t * TAU * 2) * 3; return base({ hips: [-6, 0, 0], spine: [-12, 0, 0], chest: [-10, 0, 0], head: [8, 0, 0], upperarm_L: [30 + s, 0, 40], lowerarm_L: [-100, 0, 0], upperarm_R: [30 - s, 0, -40], lowerarm_R: [-100, 0, 0], upperleg_L: [-30, 0, 8], lowerleg_L: [40, 0, 0], upperleg_R: [10, 0, -8], lowerleg_R: [20, 0, 0], _y: -0.08 }); }],
  ['shove', 0.4, false, t => { const k = t < 0.35 ? ease(t / 0.35) : 1 - ease((t - 0.35) / 0.65) * 0.7; return base({ spine: [14 * k, 0, 0], chest: [10 * k, 0, 0], upperarm_L: [-90 * k, 0, 14], lowerarm_L: [-10, 0, 0], hand_L: [-50 * k, 0, 0], upperarm_R: [-90 * k, 0, -14], lowerarm_R: [-10, 0, 0], hand_R: [-50 * k, 0, 0], upperleg_L: [-35 * k, 0, 6], lowerleg_L: [30 * k, 0, 0], upperleg_R: [15 * k, 0, -6], _y: -0.05 * k }); }],
  ['snatch', 0.6, false, t => { const k = t < 0.45 ? ease(t / 0.45) : 1 - ease((t - 0.45) / 0.55); return base({ chest: [10 * k, -20 * k, 0], spine: [8 * k, -10 * k, 0], upperarm_R: [-80 * k, 0, -10], lowerarm_R: [-20, 0, 0], hand_R: [-30 * k, 0, 0], upperleg_L: [-25 * k, 0, 4], lowerleg_L: [30 * k, 0, 0] }); }],
];
export const EXTRA_NAMES = EXTRA.map(c => c[0]);
/** Clips nuevos (V2) para un esqueleto con los mismos nombres de hueso: Mateo (GLB o procedural) y vecinos/villanos. */
export function buildExtraClips(hipsY, scale = 1) { return buildList(EXTRA, hipsY, scale); }

/** Genera los AnimationClip para un esqueleto (nombres de hueso estándar). hipsY = altura de cadera en reposo. */
export function buildClips(hipsY, scale = 1) { return buildList(CLIPS, hipsY, scale); }
function buildList(list, hipsY, scale) {
  const clips = [];
  for (const [name, dur, loop, fn] of list) {
    const n = loop ? 24 : 16, times = [], tracks = {}, ypos = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, pose = fn(loop ? t % 1 : t);
      times.push(t * dur);
      for (const bone in pose) {
        if (bone === '_y') continue;
        const [x, y, z] = pose[bone];
        _q.setFromEuler(_e.set(x * D, y * D, z * D, 'XYZ'));
        (tracks[bone] ||= []).push(_q.x, _q.y, _q.z, _q.w);
      }
      ypos.push(0, hipsY + (pose._y || 0) * scale, 0);
    }
    // continuidad de cuaterniones (evita giros por el camino largo)
    for (const b in tracks) { const a = tracks[b]; for (let i = 4; i < a.length; i += 4) if (a[i] * a[i - 4] + a[i + 1] * a[i - 3] + a[i + 2] * a[i - 2] + a[i + 3] * a[i - 1] < 0) for (let k = 0; k < 4; k++) a[i + k] *= -1; }
    const kt = Object.entries(tracks).map(([b, v]) => new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, v));
    kt.push(new THREE.VectorKeyframeTrack('hips.position', times, ypos));
    const clip = new THREE.AnimationClip(name, dur, kt);
    clip.userData = { loop };
    clips.push(clip);
  }
  return clips;
}
export const LOOPING = Object.fromEntries([...CLIPS, ...EXTRA].map(c => [c[0], c[2]]));
