// @ts-check
/* Portales Imposibles — los tres escenarios: Laboratorio Azul (3 salas), Salas de Gravedad (2 salas) y Núcleo
   Prismático (antesala + arena del Núcleo Fractal). Coordenadas en metros; cada sala se arma con offsets locales. */
import { THREE } from '../../matelabs/kit3d.js';
import { createLevel } from './level.js';
import { generatorGeo } from './models.js';
import { createBoss } from './boss.js';

export const ENVS = {
  1: { bg: 0x0c1520, fog: 0x0c1520, sky: 0xe4f0ff, ground: 0x3d4858, hemi: 2.3, sun: 0xffffff, sunI: 2.2, sunDir: [6, 18, 8], trim: 0x6fb8ff, metal: 0xa9b8cc, white: 0xffffff, dust: 0xbfd8ff },
  2: { bg: 0x120c1c, fog: 0x120c1c, sky: 0xe9ddff, ground: 0x2b2238, hemi: 2.0, sun: 0xf3e6ff, sunI: 1.9, sunDir: [-6, 18, 6], trim: 0xb57bff, metal: 0x8f86a8, white: 0xf3eeff, dust: 0xd3b8ff },
  3: { bg: 0x08060e, fog: 0x08060e, sky: 0xffe6fb, ground: 0x221a33, hemi: 1.8, sun: 0xfff0ff, sunI: 1.7, sunDir: [4, 20, -6], trim: 0xff7ae0, metal: 0x77738c, white: 0xfff5fb, dust: 0xffc8f0 },
};

/** Envoltorio con offset para escribir cada sala en coordenadas locales. */
function at(L, o) {
  const X = x => x + o.x, Y = y => y + o.y, Z = z => z + o.z;
  const B6 = (a) => [X(a[0]), Y(a[1]), Z(a[2]), X(a[3]), Y(a[4]), Z(a[5])];
  return {
    X, Y, Z,
    solid: (x0, y0, z0, x1, y1, z1, mat, op) => L.solid(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), mat, op),
    white: (x0, y0, z0, x1, y1, z1) => L.white(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1)),
    hazard: (x0, y0, z0, x1, y1, z1) => L.solid(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), 'hazard'),
    trim: (x0, y0, z0, x1, y1, z1) => L.trim(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1)),
    shell: (x0, x1, y0, y1, z0, z1, op = {}) => L.shell(X(x0), X(x1), Y(y0), Y(y1), Z(z0), Z(z1), {
      ...op, holes: (op.holes || []).map(h => ({ side: h.side, a0: (h.side === 'n' || h.side === 's') ? X(h.a0) : Z(h.a0), a1: (h.side === 'n' || h.side === 's') ? X(h.a1) : Z(h.a1), y0: Y(h.y0), y1: Y(h.y1) })),
    }),
    light: (x, y, z, c, i, d) => L.light(X(x), Y(y), Z(z), c, i, d),
    room: (def) => L.addRoom({ ...def, bounds: B6(def.bounds), spawn: [X(def.spawn[0]), Y(def.spawn[1]), Z(def.spawn[2]), def.spawn[3]] }),
    ghost: (r, w, x, y, z, nx, ny, nz, ux, uy, uz) => L.ghost(r, w, X(x), Y(y), Z(z), nx, ny, nz, ux, uy, uz),
    cube: (r, k, x, y, z, op) => L.cube(r, k, X(x), Y(y), Z(z), op),
    dispenser: (r, c, x, yt, z, yb) => L.dispenser(r, c, X(x), Y(yt), Z(z), Y(yb)),
    button: (r, id, x, y, z) => L.button(r, id, X(x), Y(y), Z(z)),
    pedestal: (r, id, x, y, z, label, op) => L.pedestal(r, id, X(x), Y(y), Z(z), label, op),
    door: (r, id, x0, y0, z0, x1, y1, z1, axis, want, op) => L.door(r, id, X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), axis, want, op),
    emitter: (r, id, x, y, z, dx, dy, dz, on) => L.emitter(r, id, X(x), Y(y), Z(z), dx, dy, dz, on),
    receptor: (r, id, x0, y0, z0, x1, y1, z1, face) => L.receptor(r, id, X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), face),
    lift: (r, id, x0, y0, z0, x1, y1, z1, on) => L.lift(r, id, X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), on),
    acid: (x0, y0, z0, x1, y1, z1) => L.acid(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1)),
    fizzler: (x0, y0, z0, x1, y1, z1) => L.fizzler(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1)),
    trigger: (x0, y0, z0, x1, y1, z1, fn, op) => L.trigger(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), fn, op),
    mover: (x0, y0, z0, x1, y1, z1, mat, path) => L.mover(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), mat, path),
    crystal: (r, id, x, y, z) => L.crystal(r, id, X(x), Y(y), Z(z)),
    turret: (r, id, x, y, z, yaw) => L.turret(r, id, X(x), Y(y), Z(z), yaw),
    sphere: (r, id, path, fy, sp) => L.sphere(r, id, path.map(p => [X(p[0]), Y(p[1]), Z(p[2])]), Y(fy), sp),
  };
}

/** Recorrido por fotogramas clave (ida y vuelta) con suavizado y pausas. keys: [[desplazamiento, segundos de viaje, pausa]]. */
export function kpath(keys, axis) {
  const seq = [];
  let T = 0;
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i], b = keys[(i + 1) % keys.length];
    seq.push({ t0: T, t1: T + a[1], from: a[0], to: b[0] }); T += a[1];
    if (a[2]) { seq.push({ t0: T, t1: T + a[2], from: b[0], to: b[0] }); T += a[2]; }
  }
  const out = { x: 0, y: 0, z: 0 };
  return (t) => {
    const tt = ((t % T) + T) % T;
    let v = keys[0][0];
    for (const s of seq) if (tt >= s.t0 && tt < s.t1) { const k = (tt - s.t0) / (s.t1 - s.t0), e = k * k * (3 - 2 * k); v = s.from + (s.to - s.from) * e; break; }
    out.x = axis === 'x' ? v : 0; out.y = axis === 'y' ? v : 0; out.z = axis === 'z' ? v : 0;
    return out;
  };
}

/** Elevador entre escenarios: tubo de luz y disparador. */
function elevator(L, a, x0, x1, y0, y1, z0, z1, toScen, ctx) {
  a.shell(x0, x1, y0, y1, z0, z1, { open: ['s'] });
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, y1 - y0, 20, 1, true), L.env.trim === 0x6fb8ff ? ctx.M.fizz : ctx.M.field);
  tube.position.set(a.X(cx), a.Y((y0 + y1) / 2), a.Z(cz)); L.root.add(tube);
  a.light(cx, y1 - 0.5, cz, L.env.trim, 14, 8);
  a.trigger(cx - 1, y0, cz - 1, cx + 1, y0 + 2, cz + 1, () => ctx.nextScenario(toScen));
}

/** Zona de arranque (cápsula) al sur de la primera sala. */
function startPod(L, a, ctx) {
  a.shell(-2, 2, 0, 3.2, 0, 4, { holes: [{ side: 'n', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }] });
  a.trim(-2, 3.0, 3.95, 2, 3.1, 4);
  a.light(0, 2.8, 2, L.env.trim, 8, 7);
  void ctx;
}

/* ======================= Escenario 1: Laboratorio Azul ======================= */
function scen1(ctx) {
  const L = createLevel(ctx, 1, ENVS[1]);
  L.name = 'Laboratorio Azul'; L.killY = -14;
  const P = () => ctx.player.body.pos;
  let a = at(L, { x: 0, y: 0, z: 0 });
  startPod(L, a, ctx);
  L.addSpawn('start', 0, 0.9, 2.6, 0);

  // ---- Sala 1-1: Primer Paso ----
  const r1 = a.room({ id: '1-1', bounds: [-6, 0, -14, 6, 8, 0], spawn: [0, 0.9, 2.6, 0],
    hints: ['El borde está demasiado alto para saltar. ¿Y si una pared fuera una puerta?',
      'Los portales sólo se pegan a los paneles BLANCOS. Hay uno abajo a la izquierda y otro arriba, sobre el borde.',
      'Azul en el panel bajo de la izquierda, naranja en el panel alto de la derecha. Caminá a través del azul.'] });
  a.shell(-6, 6, 0, 8, -14, 0, { holes: [{ side: 's', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }, { side: 'n', a0: -1.2, a1: 1.2, y0: 4, y1: 6.8 }, { side: 'e', a0: -5.5, a1: -3.5, y0: 3, y1: 5.6 }] });
  a.solid(-6, 0, -14, 6, 4, -9);
  a.hazard(-6, 3.75, -9.03, 6, 4, -8.98);
  a.white(-6, 0, -7, -5.94, 3, -2);
  a.white(5.94, 4, -13.5, 6, 7.2, -9.5);
  a.white(-2, 0, -7.5, 2, 0.06, -3.5);
  // nicho del cristal
  a.shell(6.6, 8.6, 3, 5.6, -5.5, -3.5, { t: 0.4, open: ['w'] });
  a.solid(6, 2.6, -5.5, 6.6, 3, -3.5);
  a.white(8.54, 3, -5.5, 8.6, 5.6, -3.5);
  a.crystal(r1, 'c11', 7.5, 3.9, -4.5);
  a.trim(-6, 7.55, -14, -5.95, 7.65, 0); a.trim(5.95, 7.55, -14, 6, 7.65, 0); a.trim(-6, 3.5, -8.99, 6, 3.6, -8.95);
  a.light(0, 7, -4, 0xdfeeff, 26, 20); a.light(0, 7.5, -11.5, 0x9fd0ff, 16, 14); a.light(7.6, 5.2, -4.5, 0xc8a6ff, 6, 5);
  r1.exitDoor = a.door(r1, 'd11', -1.2, 4, -14.6, 1.2, 6.8, -14, 'x', () => P().y > 4.4 && P().z < -9 + 0.0 - 0 && P().z > -15 - 0.5);
  a.ghost(r1, 'A', -5.94, 1.03, -4.5, 1, 0, 0); a.ghost(r1, 'B', 5.94, 5.1, -11.5, -1, 0, 0);
  // pasillo 1-1 → 1-2
  a.shell(-1.2, 1.2, 4, 6.8, -20, -14.6, { open: ['n', 's'] });
  a.fizzler(-1.2, 4, -17.25, 1.2, 6.8, -17.1);
  a.trim(-1.2, 6.6, -20, -1.15, 6.7, -14.6); a.trim(1.15, 6.6, -20, 1.2, 6.7, -14.6);
  a.trigger(-1.2, 4, -16.8, 1.2, 6.8, -15.2, () => ctx.solveRoom('1-1'));

  // ---- Sala 1-2: Peso Muerto ----
  a = at(L, { x: 0, y: 4, z: -20.6 });
  const r2 = a.room({ id: '1-2', bounds: [-7, 0, -14, 7, 7, 0], spawn: [0, 0.9, 1.0, 0],
    hints: ['La puerta se abre con peso sobre el botón. El cubo está en la jaula… pero los disparos atraviesan las rejillas.',
      'Apretá el pedestal para soltar un cubo en la jaula. Un portal en el panel de la jaula y otro afuera te dejan entrar y salir con él.',
      'Azul en el panel del fondo de la jaula (a través de la rejilla), naranja en el panel de la derecha. Entrá, agarrá el cubo con USAR y volvé.'] });
  a.shell(-7, 7, 0, 7, -14, 0, { holes: [{ side: 's', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }, { side: 'n', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }] });
  a.solid(-3.05, 0, -12, -2.95, 3.2, -7.95, 'grate'); a.solid(-7, 0, -8.05, -2.95, 3.2, -7.95, 'grate');
  a.solid(-7, 3.15, -12, -2.95, 3.25, -7.95, 'grate');
  a.white(-7, 0, -11.6, -6.94, 3, -8.4);
  a.white(6.94, 0, -6, 7, 3, -2);
  a.solid(3, 0, -2, 7, 3.5, 0); a.hazard(3, 3.3, -2.03, 7, 3.5, -1.98);
  a.white(3.4, 3.5, -0.06, 6.6, 6.5, 0);
  a.crystal(r2, 'c12', 5, 4.4, -1.0);
  const cube12 = a.cube(r2, 'weight', -5, 2.6, -10, { id: 'cube12', hidden: true });
  const disp12 = a.dispenser(r2, cube12, -5, 7, -10, 3.15);
  void disp12;
  if (L.mem['disp:cube12']) L.cubeReset(cube12, true);
  a.pedestal(r2, 'p12', -5, 0, -3, 'Soltar un cubo en la jaula', { kind: 'once', onUse: () => { L.mem['disp:cube12'] = true; L.dispense(cube12.dispenser); } });
  const b12 = a.button(r2, 'b12', 3, 0, -7);
  r2.exitDoor = a.door(r2, 'd12', -1.2, 0, -14.6, 1.2, 2.8, -14, 'x', () => b12.active);
  a.ghost(r2, 'A', -6.94, 1.03, -10, 1, 0, 0); a.ghost(r2, 'B', 6.94, 1.03, -4, -1, 0, 0);
  a.trim(-7, 6.55, -14, -6.95, 6.65, 0); a.trim(6.95, 6.55, -14, 7, 6.65, 0);
  a.light(0, 6.5, -4, 0xdfeeff, 24, 18); a.light(-5, 6, -10, 0x9fd0ff, 12, 10); a.light(5, 6.2, -10, 0xdfeeff, 10, 12);
  a.shell(-1.2, 1.2, 0, 2.8, -20, -14.6, { open: ['n', 's'] });
  a.fizzler(-1.2, 0, -17.25, 1.2, 2.8, -17.1);
  a.trigger(-1.2, 0, -16.8, 1.2, 2.8, -15.2, () => ctx.solveRoom('1-2'));

  // ---- Sala 1-3: Salto de Fe ----
  a = at(L, { x: 0, y: -6, z: -41.2 });
  const r3 = a.room({ id: '1-3', bounds: [-8, 0, -26, 8, 14, 0], spawn: [0, 10.9, 1.0, 0],
    hints: ['Lo que entra rápido, sale rápido. La altura se convierte en velocidad.',
      'Un portal en el piso blanco del foso y otro en el panel blanco de la pared de entrada, detrás tuyo. Después, tirate al foso desde arriba.',
      'Azul en el piso del foso, naranja en el panel de la pared de entrada (a la izquierda de la puerta). Saltá desde el borde y caé en el azul. Si caés sin plan, el campo violeta te sube.'] });
  a.shell(-8, 8, 0, 14, -26, 0, { holes: [{ side: 's', a0: -1.2, a1: 1.2, y0: 10, y1: 12.8 }, { side: 'n', a0: -1.2, a1: 1.2, y0: 1, y1: 3.8 }, { side: 'w', a0: -21, a1: -19, y0: 1, y1: 3.8 }] });
  a.solid(-8, 0, -4, 8, 10, 0); a.hazard(-8, 9.75, -4.03, 8, 10, -3.98);
  // panel de salida del lanzamiento: pared de entrada, sobre el borde (mira al norte)
  a.white(-7.6, 10, -0.06, -4.4, 13, 0);
  a.white(-2.5, 0, -9.5, 2.5, 0.06, -4.5);
  // campo de gravedad de rescate: si caés al foso, te devuelve arriba
  a.lift(r3, 'l13', 5, 0, -7, 7.6, 11.6, -4.05, () => true);
  a.acid(-8, 0, -17, 8, 0.5, -10);
  a.solid(-8, 0, -26, 8, 1, -17); a.hazard(-8, 0.75, -17.03, 8, 1, -16.98);
  a.white(1.5, 1, -22.5, 4.5, 1.06, -19.5);
  a.turret(r3, 't13', 3, 1.06, -21, Math.PI);
  const dt13 = a.door(r3, 'dt13', -8.6, 1, -21, -8, 3.8, -19, 'z', null, { timed: true, dur: 4.5 });
  const openT = () => { dt13.timer = dt13.dur * ctx.diff().doorMul; };
  a.pedestal(r3, 'p13a', 6, 1, -24, 'Abrir compuerta (temporizada)', { kind: 'timed', dur: 4.5, onUse: openT });
  a.shell(-12.6, -8.6, 1, 4, -22, -18, { t: 0.5, open: ['e'] });
  a.pedestal(r3, 'p13b', -12, 1, -18.7, 'Abrir compuerta', { kind: 'timed', dur: 4.5, onUse: openT });
  a.crystal(r3, 'c13', -11.6, 2.0, -20.8);
  a.light(-10.6, 3.6, -20, 0xc8a6ff, 6, 6);
  const zx13 = a.Z(-16.5), y13a = a.Y(1.2), y13b = a.Y(5);
  r3.exitDoor = a.door(r3, 'd13', -1.2, 1, -26.6, 1.2, 3.8, -26, 'x', () => P().z < zx13 && P().y > y13a && P().y < y13b);
  a.ghost(r3, 'A', 0, 0.06, -7, 0, 1, 0, 0, 0, -1); a.ghost(r3, 'B', -6, 11.5, -0.06, 0, 0, -1);
  a.trim(-8, 13.55, -26, -7.95, 13.65, 0); a.trim(7.95, 13.55, -26, 8, 13.65, 0); a.trim(-8, 0.55, -17.02, 8, 0.62, -16.97);
  a.light(0, 13, -6, 0xdfeeff, 30, 22); a.light(0, 12, -20, 0x9fd0ff, 24, 20); a.light(0, 3, -13.5, 0x8dff5a, 16, 16);
  a.shell(-1.2, 1.2, 1, 3.8, -32, -26.6, { open: ['n', 's'] });
  a.fizzler(-1.2, 1, -29.25, 1.2, 3.8, -29.1);
  a.trigger(-1.2, 1, -28.8, 1.2, 3.8, -27.2, () => ctx.solveRoom('1-3'));
  elevator(L, a, -2, 2, 1, 4.6, -36, -32, 2, ctx);

  return L;
}

/* ======================= Escenario 2: Salas de Gravedad ======================= */
function scen2(ctx) {
  const L = createLevel(ctx, 2, ENVS[2]);
  L.name = 'Salas de Gravedad'; L.killY = -10;
  let a = at(L, { x: 0, y: 0, z: 0 });
  startPod(L, a, ctx);
  L.addSpawn('start', 0, 0.9, 2.6, 0);

  // ---- Sala 2-1: Ascensor Gravitatorio ----
  const r1 = a.room({ id: '2-1', bounds: [-8, 0, -18, 8, 13, 0], spawn: [0, 0.9, 2.6, 0],
    hints: ['El campo violeta está apagado: le falta energía. El panel de energía está en el frente de la galería.',
      'El láser pega en la pared de la izquierda. Si lo hacés entrar por un portal ahí, sale por el otro: que salga mirando a la galería.',
      'Azul donde pega el láser (pared izquierda), naranja en el panel de la pared del fondo, a la izquierda de la entrada. Después subí con el cubo.'] });
  a.shell(-8, 8, 0, 13, -18, 0, { holes: [{ side: 's', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }, { side: 'n', a0: -1.2, a1: 1.2, y0: 8, y1: 10.8 }] });
  a.solid(-8, 0, -18, 8, 8, -12); a.hazard(-8, 7.75, -12.03, 8, 8, -11.98);
  const r21 = a.receptor(r1, 'r21', -7, 0.4, -12, -1, 2.9, -11.8, 'z');
  a.emitter(r1, 'e21', 7.6, 1.6, -6, -1, 0, 0);
  a.white(-8, 0, -7.8, -7.94, 3.2, -4.2);
  a.white(-6.2, 0, -0.06, -1.8, 3.2, 0);
  a.lift(r1, 'l21', 2, 0, -11.9, 5.5, 10.8, -8.5, () => r21.active);
  a.cube(r1, 'weight', 5, 0.4, -3, { id: 'cube21' });
  const b21 = a.button(r1, 'b21', -4, 8, -15);
  r1.exitDoor = a.door(r1, 'd21', -1.2, 8, -18.6, 1.2, 10.8, -18, 'x', () => b21.active);
  a.sphere(r1, 's21', [[-4.5, 3.4, -2.5], [4.5, 3.4, -2.5], [4.5, 3.4, -7.5], [-4.5, 3.4, -7.5]], 0, 1.3);
  a.solid(6.5, 9, -4, 8, 9.4, -1); a.white(7.94, 9.4, -4, 8, 12.4, -1);
  a.crystal(r1, 'c21', 7.2, 10.2, -2.5);
  a.ghost(r1, 'A', -7.94, 1.6, -6, 1, 0, 0); a.ghost(r1, 'B', -4, 1.6, -0.06, 0, 0, -1);
  a.trim(-8, 12.55, -18, -7.95, 12.65, 0); a.trim(7.95, 12.55, -18, 8, 12.65, 0); a.trim(-8, 7.5, -11.99, 8, 7.6, -11.95);
  a.light(0, 12, -5, 0xe9ddff, 26, 22); a.light(0, 12, -15, 0xb57bff, 18, 16); a.light(3.75, 1, -10, 0x8a4dff, 10, 9);
  a.shell(-1.2, 1.2, 8, 10.8, -24, -18.6, { open: ['n', 's'] });
  a.fizzler(-1.2, 8, -21.25, 1.2, 10.8, -21.1);
  a.trigger(-1.2, 8, -20.8, 1.2, 10.8, -19.2, () => ctx.solveRoom('2-1'));

  // ---- Sala 2-2: Sala del Generador (gravedad reducida) ----
  a = at(L, { x: 0, y: 8, z: -24.6 });
  const r2 = a.room({ id: '2-2', bounds: [-10, 0, -22, 10, 13, 0], spawn: [0, 0.9, 1.0, 0], gravity: 0.55,
    hints: ['El generador necesita energía en DOS paneles a la vez: uno bajo, en su frente, y otro arriba, en su techo.',
      'El cubo PRISMA (en la plataforma alta de la derecha) desvía el láser hacia donde apunta. El otro láser puede bajar del techo por un portal.',
      'Prisma en el piso, sobre la línea del láser bajo, apuntando al generador. Azul donde pega el otro láser (pared de entrada, izquierda), naranja en el panel del techo.'] });
  a.shell(-10, 10, 0, 13, -22, 0, { holes: [{ side: 's', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }, { side: 'n', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }] });
  a.solid(-1.7, 0, -12.7, 1.7, 5.6, -9.3, 'dark', { draw: false });
  const gen = new THREE.Mesh(generatorGeo(), ctx.M.vc); gen.position.set(a.X(0), a.Y(0), a.Z(-11)); L.root.add(gen);
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x222233, emissive: 0x3a2266, emissiveIntensity: 0.4 });
  const bands = [1.6, 3.6].map(y => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.18, 24, 1, true), bandMat); m.position.set(a.X(0), a.Y(y), a.Z(-11)); L.root.add(m); return m; });
  void bands;
  const rga = a.receptor(r2, 'rga', -1.2, 0.05, -9.3, 1.2, 1.1, -9.1, 'z');
  const rgb = a.receptor(r2, 'rgb', -1.6, 5.6, -12.6, 1.6, 5.8, -9.4, 'y');
  a.emitter(r2, 'ega', -9.6, 0.4, -5, 1, 0, 0);
  a.emitter(r2, 'egb', -6, 2.0, -21.6, 0, 0, 1);
  a.white(-7.8, 0, -0.06, -4.2, 3.4, 0);
  a.white(-1.6, 12.94, -12.6, 1.6, 13, -9.4);
  a.solid(6, 0, -20, 10, 5, -15); a.hazard(6, 4.75, -15.03, 10, 5, -14.98);
  a.white(9.94, 5, -19.5, 10, 8, -15.5);
    a.cube(r2, 'prism', 8, 5.4, -17.5, { id: 'prism22', fx: -1, fz: 0 });
  const S = ctx.S;
  a.pedestal(r2, 'pg', 2.8, 0, -7.6, 'Bajar la palanca del generador', {
    kind: 'once', enabled: () => ctx.genOn() || (rga.active && rgb.active), deniedText: 'Faltan paneles de energía: ' + 'necesita los dos encendidos a la vez',
    onUse: () => ctx.restoreGenerator(),
  });
  r2.exitDoor = a.door(r2, 'd22', -1.2, 0, -22.6, 1.2, 2.8, -22, 'x', () => ctx.genOn());
  const circle = []; for (let i = 0; i < 12; i++) { const t = -i / 12 * Math.PI * 2; circle.push([Math.sin(t) * 4.2, 3.8, -11 + Math.cos(t) * 4.2]); }
  a.sphere(r2, 's22a', circle, 0, 1.25);
  a.sphere(r2, 's22b', [[-7, 3.4, -3.2], [7, 3.4, -3.2]], 0, 1.5);
  a.solid(-10, 8.6, -20, -8.5, 9, -16); a.white(-10, 9, -19.8, -9.94, 12, -16.2);
  a.crystal(r2, 'c22', -9.3, 9.8, -18);
  a.ghost(r2, 'A', -6, 2.0, -0.06, 0, 0, -1); a.ghost(r2, 'B', 0, 12.94, -11, 0, -1, 0, 0, 0, -1);
  a.trim(-10, 12.55, -22, -9.95, 12.65, 0); a.trim(9.95, 12.55, -22, 10, 12.65, 0);
  a.light(0, 12, -5, 0xe9ddff, 26, 22); a.light(0, 9, -11, 0xb57bff, 22, 18); a.light(0, 12, -19, 0xe9ddff, 18, 16); a.light(8, 8, -17.5, 0x8ff3ff, 8, 8);
  // restaurado: bandas encendidas
  L.customs.push((dt) => {
    const on = ctx.genOn();
    bandMat.emissive.setHex(on ? 0x9b7bff : 0x3a2266); bandMat.emissiveIntensity = on ? 1.6 + Math.sin(L.time * 4) * 0.4 : 0.4;
    gen.rotation.y += dt * (on ? 0.6 : 0.02);
    rga.latch = rgb.latch = on;
  });
  a.shell(-1.2, 1.2, 0, 2.8, -28, -22.6, { open: ['n', 's'] });
  a.fizzler(-1.2, 0, -25.25, 1.2, 2.8, -25.1);
  a.trigger(-1.2, 0, -24.8, 1.2, 2.8, -23.2, () => ctx.solveRoom('2-2'));
  elevator(L, a, -2, 2, 0, 3.6, -32, -28, 3, ctx);
  return L;
}

/* ======================= Escenario 3: Núcleo Prismático ======================= */
function scen3(ctx) {
  const L = createLevel(ctx, 3, ENVS[3]);
  L.name = 'Núcleo Prismático'; L.killY = -8;
  const P = () => ctx.player.body.pos;
  let a = at(L, { x: 0, y: 0, z: 0 });
  startPod(L, a, ctx);
  L.addSpawn('start', 0, 0.9, 2.6, 0);

  // ---- Sala 3-1: Antesala Prismática ----
  const r1 = a.room({ id: '3-1', bounds: [-9, -10, -20, 9, 10, 0], spawn: [0, 0.9, 2.6, 0],
    hints: ['El abismo no se salta. Del otro lado hay un panel blanco… que no se queda quieto.',
      'Un portal en la pared de entrada y el otro en el panel móvil del fondo: el portal viaja con el panel.',
      'Azul en el panel de la pared de entrada (izquierda), naranja en el panel móvil. Cruzá cuando el naranja quede sobre el piso firme.'] });
  a.shell(-9, 9, -10, 10, -20, 0, { open: ['floor'], holes: [{ side: 's', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }, { side: 'n', a0: 5.2, a1: 7.6, y0: 0, y1: 2.8 }] });
  a.solid(-9, -0.6, -5, 9, 0, 0); a.hazard(-9, -0.25, -5.03, 9, 0, -4.98);
  a.solid(-9, -0.6, -20, 9, 0, -14); a.hazard(-9, -0.25, -14.02, 9, 0, -13.97);
  a.white(-8, 0, -0.06, -4, 3, 0);
  a.white(-9, 0, -5, -8.94, 3, -1);
  L.voidGlow(-9, -14, 9, -5, -9.5, 0x8a4dff);
  const o31 = { x: 0, y: 0, z: 0 };
  const m31 = a.mover(-8.6, 0, -20, -6, 3, -19.92, 'white', (t) => { o31.x = 5.3 * (1 - Math.cos(t * Math.PI * 2 / 12)); return o31; });
  void m31;
  a.emitter(r1, 'e31', 8.6, 1.5, -4.6, -1, 0, 0);
  const r31 = a.receptor(r1, 'r31', -8.4, 0.2, -15, -5.2, 2.8, -14.8, 'z');
  // vitrina del cristal: se abre con el panel de energía
  const caseBox = a.solid(-8.5, 0, -19, -6.5, 2, -17, 'glass', { draw: false });
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), ctx.M.glass); caseMesh.position.set(a.X(-7.5), a.Y(1), a.Z(-18)); L.root.add(caseMesh);
  a.crystal(r1, 'c31', -7.5, 0.9, -18);
  L.customs.push(() => { if (r31.active) L.mem.case31 = true; const open = !!L.mem.case31; caseBox.on = !open; caseMesh.visible = !open; });
  a.white(2.8, 0, -17.7, 5.2, 0.06, -15.3);
  a.turret(r1, 't31', 4, 0.06, -16.5, Math.PI);
  a.cube(r1, 'weight', 6, 0.4, -2.2, { id: 'cube31' });
  a.sphere(r1, 's31', [[-7, 3.4, -2.0], [7, 3.4, -2.0]], 0, 1.5);
  r1.exitDoor = a.door(r1, 'd31', 5.2, 0, -20.6, 7.6, 2.8, -20, 'x', () => P().z < -13.8 && P().y > -0.5);
  a.ghost(r1, 'A', -6, 1.03, -0.06, 0, 0, -1); a.ghost(r1, 'B', -5, 1.03, -19.9, 0, 0, 1);
  a.trim(-9, 9.55, -20, -8.95, 9.65, 0); a.trim(8.95, 9.55, -20, 9, 9.65, 0); a.trim(-9, -0.02, -19.98, 9, 0.06, -19.93);
  a.light(0, 9, -3, 0xffe6fb, 22, 18); a.light(0, 9, -17, 0xff9ae8, 20, 18); a.light(0, -6, -9.5, 0x8a4dff, 18, 14);
  a.shell(5.2, 7.6, 0, 2.8, -26, -20.6, { open: ['n', 's'] });
  a.fizzler(5.2, 0, -23.25, 7.6, 2.8, -23.1);
  a.trigger(5.2, 0, -22.8, 7.6, 2.8, -21.2, () => ctx.solveRoom('3-1'));

  // ---- Arena: Núcleo Fractal ----
  a = at(L, { x: 6.4, y: 0, z: -26.6 });
  const rb = a.room({ id: '3-B', bounds: [-14, 0, -28, 14, 18, 0], spawn: [0, 0.9, -1.2, 0],
    hints: ['Fase 1: los tres pilares sostienen el escudo. Cada uno necesita láser un rato.',
      'El láser pega en el panel fijo del fondo (izquierda). Sacalo por un panel móvil: cuando se frena frente a un pilar, lo quema.',
      'Fase 2: dispensá un cubo, poné un portal en el piso blanco y otro en el panel móvil del techo. Soltá el cubo cuando el techo esté sobre el Núcleo. Fase 3: subí a la plataforma del portal de salida.'] });
  a.shell(-14, 14, -8, 18, -28, 0, { open: ['floor'], holes: [{ side: 's', a0: -1.2, a1: 1.2, y0: 0, y1: 2.8 }] });
  a.solid(-14, -0.6, -28, 14, 0, -18); a.solid(-14, -0.6, -10, 14, 0, 0);
  a.solid(-14, -0.6, -18, -4, 0, -10); a.solid(4, -0.6, -18, 14, 0, -10);
  a.solid(-4.6, -8, -18.6, 4.6, -0.6, -18); a.solid(-4.6, -8, -10, 4.6, -0.6, -9.4);
  a.solid(-4.6, -8, -18, -4, -0.6, -10); a.solid(4, -8, -18, 4.6, -0.6, -10);
  a.hazard(-4.3, -0.05, -18.3, 4.3, 0.02, -18); a.hazard(-4.3, -0.05, -10, 4.3, 0.02, -9.7);
  L.voidGlow(a.X(-4), a.Z(-18), a.X(4), a.Z(-10), -7.5, 0xff7ae0);
  // barrera alrededor del pozo (deja pasar disparos y láseres, no cuerpos)
  a.solid(-4.6, 0, -18.6, 4.6, 12, -18.5, 'barrier', { draw: false }); a.solid(-4.6, 0, -9.5, 4.6, 12, -9.4, 'barrier', { draw: false });
  a.solid(-4.6, 0, -18.6, -4.5, 12, -9.4, 'barrier', { draw: false }); a.solid(4.5, 0, -18.6, 4.6, 12, -9.4, 'barrier', { draw: false });
  // paneles fijos
  a.white(-7, 0, -28, -3, 3.2, -27.94);
  a.white(-11, 0, -0.06, -7, 3.2, 0); a.white(7, 0, -0.06, 11, 3.2, 0);
  a.white(8, 0, -6, 11, 0.06, -3);
  // plataforma de salida (noroeste)
  a.solid(-14, 0, -28, -9, 8, -24); a.hazard(-14, 7.75, -24.03, -9, 8, -23.98);
  a.white(-14, 8, -27.6, -13.94, 11, -24.4);
  // paneles móviles (pared oeste, este, norte y techo)
  const mp1 = a.mover(-14, 0, -24, -13.92, 3, -21.4, 'white', kpath([[0, 4, 2.5], [8.7, 4, 1], [16, 4, 2.5], [8.7, 4, 1]], 'z'));
  const mp2 = a.mover(13.92, 0, -24, 14, 3, -21.4, 'white', kpath([[16, 4, 2.5], [8.7, 4, 1], [0, 4, 2.5], [8.7, 4, 1]], 'z'));
  const mp3 = a.mover(-2, 0, -28, 0.6, 3, -27.92, 'white', kpath([[0.7, 5, 1], [12, 5, 2.5]], 'x'));
  const mpc = a.mover(-12, 17.92, -15.5, -9, 18, -12.5, 'white', kpath([[0, 2.6, 1.6], [10.5, 2.6, 0.6], [21, 2.6, 1.6], [10.5, 2.6, 0.6]], 'x'));
  a.emitter(rb, 'eb1', -5, 2.0, -0.4, 0, 0, -1);
  a.trim(-14, 17.55, -28, -13.95, 17.65, 0); a.trim(13.95, 17.55, -28, 14, 17.65, 0); a.trim(-14, 3.1, -27.99, 14, 3.2, -27.94);
  a.light(0, 16, -6, 0xffe6fb, 30, 28); a.light(0, 16, -22, 0xff9ae8, 26, 24); a.light(-11, 10, -26, 0xffffff, 12, 10); a.light(0, -4, -14, 0x9b7bff, 22, 16);
  rb.entryDoor = a.door(rb, 'dbe', -1.2, 0, 0, 1.2, 2.8, 0.6, 'x', () => !L.boss || !L.boss.locked);
  L.boss = createBoss(ctx, L, a, rb, { mp1, mp2, mp3, mpc, P });
  a.trigger(-12, 0, -24, 12, 6, -3, () => L.boss.trigger(), { once: false });
  return L;
}

export const SCENARIOS = { 1: scen1, 2: scen2, 3: scen3 };
