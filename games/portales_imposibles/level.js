// @ts-check
/* Portales Imposibles — motor de nivel: constructor de salas (cajas con huecos, paneles blancos), geometría
   fusionada por material y los sistemas interactivos: cubos (peso y prisma), botones de piso, pedestales
   (interruptores), puertas (normales y temporizadas), emisores y paneles de energía (láser), campos de gravedad,
   ácido, rejillas emancipadoras, dispensadores, paneles móviles, cristales, torretas y esferas supervisoras. */
import { THREE } from '../../matelabs/kit3d.js';
import { box, body, moveBody, overlaps, boxOverlap, raycast, rayBox, depenetrate } from './physics.js';
import { boxesGeometry, cubeGeo, buttonBaseGeo, pedestalGeo, doorHalfGeo, emitterGeo, receptorGeo, turretGeo, sphereGeo } from './models.js';
import { xfPoint, xfDir } from './portalmath.js';
import { PHYS } from './config.js';

/** Estado de sesión (sobrevive a cambiar de escenario dentro de la misma página): interruptores, compuertas abiertas, etc. */
const SESSION = /** @type {Record<string, any>} */ ({});

/** Divide una pared (coordenadas a, y) alrededor de huecos rectangulares. */
function wallPieces(a0, a1, y0, y1, holes) {
  const out = [];
  const hs = holes.slice().sort((p, q) => p.a0 - q.a0);
  let a = a0;
  for (const h of hs) {
    if (h.a0 > a) out.push([a, h.a0, y0, y1]);
    if (h.y0 > y0) out.push([h.a0, h.a1, y0, h.y0]);
    if (h.y1 < y1) out.push([h.a0, h.a1, h.y1, y1]);
    a = Math.max(a, h.a1);
  }
  if (a < a1) out.push([a, a1, y0, y1]);
  return out;
}

export function createLevel(ctx, n, env) {
  const { scene, M, portals } = ctx;
  const root = new THREE.Group(); root.name = 'level' + n; scene.add(root);
  if (!SESSION[n]) SESSION[n] = {};
  const mem = SESSION[n];
  const statics = /** @type {any[]} */ ([]);
  const dyn = /** @type {any[]} */ ([]);
  const actors = /** @type {any[]} */ ([]);
  const triggers = /** @type {any[]} */ ([]);
  const L = {
    n, env, root, statics, dyn, actors, triggers, mem, time: 0, killY: -30,
    rooms: /** @type {any[]} */ ([]), room: /** @type {Record<string, any>} */ ({}),
    cubes: /** @type {any[]} */ ([]), buttons: /** @type {any[]} */ ([]), switches: /** @type {any[]} */ ([]), doors: /** @type {any[]} */ ([]),
    emitters: /** @type {any[]} */ ([]), receptors: /** @type {any[]} */ ([]), turrets: /** @type {any[]} */ ([]), spheres: /** @type {any[]} */ ([]),
    crystals: /** @type {any[]} */ ([]), lifts: /** @type {any[]} */ ([]), acids: /** @type {any[]} */ ([]), fizzlers: /** @type {any[]} */ ([]),
    dispensers: /** @type {any[]} */ ([]), movers: /** @type {any[]} */ ([]), lights: /** @type {any[]} */ ([]), ghosts: /** @type {any[]} */ ([]),
    customs: /** @type {((dt:number, P:any)=>void)[]} */ ([]),
    spawns: /** @type {Record<string, {x:number,y:number,z:number,yaw:number}>} */ ({}),
    segs: new Float32Array(24 * 6), segCount: 0,
    boss: /** @type {any} */ (null),
    playerBox: box(0, -50, 0, 0.6, -48.3, 0.6, 'player'),
  };
  actors.push(L.playerBox);
  const lists = [statics, dyn];
  const listsAll = [statics, dyn, actors];
  L.lists = () => lists;

  /* ======================= construcción ======================= */
  function solid(x0, y0, z0, x1, y1, z1, mat = 'metal', o = {}) {
    const b = box(x0, y0, z0, x1, y1, z1, mat);
    if (o.draw === false) b.noDraw = true;
    if (o.dyn) dyn.push(b); else statics.push(b);
    return b;
  }
  L.solid = solid;
  /** Panel blanco (apto para portales) de 6 cm sobre una cara. */
  L.white = (x0, y0, z0, x1, y1, z1) => solid(x0, y0, z0, x1, y1, z1, 'white');
  /** Sala cerrada: interior [x0,x1]×[y0,y1]×[z0,z1], paredes de `t`. holes: {side:'n'|'s'|'e'|'w', a0,a1,y0,y1}; open: lados omitidos. */
  L.shell = (x0, x1, y0, y1, z0, z1, o = {}) => {
    const t = o.t ?? 0.6, holes = o.holes || [], open = o.open || [], mat = o.mat || 'metal';
    if (!open.includes('floor')) solid(x0 - t, y0 - t, z0 - t, x1 + t, y0, z1 + t, o.floorMat || mat);
    if (!open.includes('ceil')) solid(x0 - t, y1, z0 - t, x1 + t, y1 + t, z1 + t, mat);
    const side = (s, fn) => { if (open.includes(s)) return; for (const p of wallPieces(s === 'n' || s === 's' ? x0 - t : z0 - t, s === 'n' || s === 's' ? x1 + t : z1 + t, y0, y1, holes.filter(h => h.side === s))) fn(p); };
    side('n', p => solid(p[0], p[2], z0 - t, p[1], p[3], z0, mat));
    side('s', p => solid(p[0], p[2], z1, p[1], p[3], z1 + t, mat));
    side('w', p => solid(x0 - t, p[2], p[0], x0, p[3], p[1], mat));
    side('e', p => solid(x1, p[2], p[0], x1 + t, p[3], p[1], mat));
  };
  /** Franja luminosa decorativa (no colisiona). */
  const trims = [];
  L.trim = (x0, y0, z0, x1, y1, z1) => { trims.push(box(x0, y0, z0, x1, y1, z1, 'trim')); };
  L.light = (x, y, z, color, intensity = 18, dist = 22) => {
    const l = new THREE.PointLight(color, intensity * 3, dist * 1.3, 1.2); l.position.set(x, y, z); root.add(l); L.lights.push(l); return l;
  };
  L.addSpawn = (id, x, y, z, yaw) => { L.spawns[id] = { x, y, z, yaw }; };
  /** Resplandor del vacío (fondo de abismos y pozos): plano aditivo con la grilla de los paneles. */
  L.voidGlow = (x0, z0, x1, z1, y, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color, map: M.tex.white, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); root.add(m);
    return m;
  };

  /** Sala lógica: límites, punto de inicio, pistas y reinicio. */
  L.addRoom = (def) => {
    const r = {
      ...def, bounds: box(def.bounds[0], def.bounds[1], def.bounds[2], def.bounds[3], def.bounds[4], def.bounds[5], 'trigger'),
      gravity: def.gravity ?? 1, cubes: [], turrets: [], spheres: [], switches: [], doors: [], dispensers: [], ghostMeshes: [],
      exitDoor: null, solvedNow: false,
    };
    L.rooms.push(r); L.room[r.id] = r;
    L.addSpawn(r.id, def.spawn[0], def.spawn[1], def.spawn[2], def.spawn[3]);
    return r;
  };
  L.roomAt = (x, y, z) => {
    for (const r of L.rooms) { const b = r.bounds; if (x > b.x0 && x < b.x1 && y > b.y0 - 2 && y < b.y1 + 2 && z > b.z0 && z < b.z1) return r; }
    return null;
  };
  /** Marcas fantasma de la pista 3 (dónde va cada portal). */
  L.ghost = (room, which, x, y, z, nx, ny, nz, upx = 0, upy = 1, upz = 0) => {
    const g = new THREE.Mesh(new THREE.CircleGeometry(1, 24), which === 'A' ? M.ghostA : M.ghostB);
    g.scale.set(0.62, 1.0, 1);
    const nn = new THREE.Vector3(nx, ny, nz), uu = new THREE.Vector3(upx, upy, upz), rr = new THREE.Vector3().crossVectors(uu, nn);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rr, uu, nn));
    g.position.set(x + nx * 0.04, y + ny * 0.04, z + nz * 0.04);
    g.visible = false; root.add(g); room.ghostMeshes.push(g);
  };

  /* ---------- cubos ---------- */
  const cubeGeos = { weight: cubeGeo(false), prism: cubeGeo(true) };
  const prismGlass = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  L.cube = (room, kind, x, y, z, o = {}) => {
    const b = body(0.35, 0.35, 0.35);
    b.pos.x = x; b.pos.y = y; b.pos.z = z;
    const bx = box(x - 0.35, y - 0.35, z - 0.35, x + 0.35, y + 0.35, z + 0.35, 'cube');
    bx.cube = true;
    b.self = bx;
    const mesh = new THREE.Mesh(cubeGeos[kind], kind === 'prism' ? M.vc : M.cube);
    if (kind === 'prism') mesh.add(new THREE.Mesh(prismGlass, M.prism));
    mesh.castShadow = true; mesh.receiveShadow = true;
    root.add(mesh);
    const c = {
      id: o.id || ('cube' + L.cubes.length), kind, room, body: b, box: bx, mesh, home: { x, y, z }, facing: { x: o.fx ?? 0, y: 0, z: o.fz ?? -1 },
      held: false, alive: !o.hidden, respawnT: 0, dissolveT: 0, lastSpeed: 0, dispenser: null, sleep: 0,
    };
    bx.ref = c;
    if (!c.alive) { bx.on = false; mesh.visible = false; }
    dyn.push(bx); L.cubes.push(c); if (room) room.cubes.push(c);
    return c;
  };
  function cubeReset(c, alive) {
    const b = c.body;
    b.pos.x = c.home.x; b.pos.y = c.home.y; b.pos.z = c.home.z; b.vel.x = b.vel.y = b.vel.z = 0;
    c.held = false; c.alive = alive; c.respawnT = 0; c.dissolveT = 0; c.box.on = alive; c.mesh.visible = alive; c.mesh.scale.setScalar(1);
    if (ctx.onCubeReset) ctx.onCubeReset(c);
    syncCube(c);
  }
  L.cubeReset = cubeReset;
  /** El cubo se desintegra (ácido, rejilla, vacío) y vuelve a su lugar. */
  function cubeDissolve(c, why) {
    if (!c.alive || c.dissolveT > 0) return;
    c.dissolveT = 0.5; c.box.on = false;
    if (c.held && ctx.dropHeld) ctx.dropHeld(false);
    ctx.fx.burst(c.body.pos.x, c.body.pos.y, c.body.pos.z, why === 'acid' ? 0x8dff5a : 0x7fd2ff, 18, 2.5, 2);
    ctx.sfx.fizzle();
  }
  L.cubeDissolve = cubeDissolve;
  function syncCube(c) {
    const p = c.body.pos, bx = c.box;
    bx.x0 = p.x - 0.35; bx.x1 = p.x + 0.35; bx.y0 = p.y - 0.35; bx.y1 = p.y + 0.35; bx.z0 = p.z - 0.35; bx.z1 = p.z + 0.35;
    c.mesh.position.set(p.x, p.y, p.z);
    c.mesh.rotation.y = Math.atan2(-c.facing.x, -c.facing.z);
  }
  L.syncCube = syncCube;

  /* ---------- dispensador ---------- */
  L.dispenser = (room, cube, x, ytop, z, ybottom) => {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, ytop - ybottom, 12, 1, true), M.glass);
    tube.position.set(x, (ytop + ybottom) / 2, z); root.add(tube);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.06, 6, 16), M.dark); ring.rotation.x = Math.PI / 2; ring.position.set(x, ybottom, z); root.add(ring);
    const d = { room, cube, x, z, y: ybottom - 0.4, auto: true, enabled: () => true };
    cube.dispenser = d; cube.home = { x, y: ybottom - 0.4, z };
    L.dispensers.push(d); if (room) room.dispensers.push(d);
    return d;
  };
  L.dispense = (d) => {
    cubeReset(d.cube, true);
    ctx.fx.burst(d.x, d.y, d.z, 0xffffff, 10, 1.5, 0); ctx.sfx.drop();
  };

  /* ---------- botón de piso ---------- */
  const btnBase = buttonBaseGeo();
  const btnTopGeo = new THREE.CylinderGeometry(0.62, 0.66, 0.1, 20);
  L.button = (room, id, x, y, z) => {
    const base = new THREE.Mesh(btnBase, M.vc); base.position.set(x, y, z); base.receiveShadow = true; root.add(base);
    const topMat = new THREE.MeshStandardMaterial({ color: 0xd8333f, emissive: 0x7a0a12, emissiveIntensity: 0.8, roughness: 0.4 });
    const top = new THREE.Mesh(btnTopGeo, topMat); top.position.set(x, y + 0.2, z); root.add(top);
    solid(x - 0.75, y, z - 0.75, x + 0.75, y + 0.12, z + 0.75, 'metal', { draw: false });
    const b = { id, room, x, y: y + 0.12, z, r: 0.8, active: false, top, topMat, by: '' };
    L.buttons.push(b);
    return b;
  };

  /* ---------- pedestal (interruptor) ---------- */
  const pedGeo = pedestalGeo();
  L.pedestal = (room, id, x, y, z, label, o = {}) => {
    const m = new THREE.Mesh(pedGeo, M.vc); m.position.set(x, y, z); m.castShadow = true; root.add(m);
    const btnMat = new THREE.MeshStandardMaterial({ color: 0x3b82ff, emissive: 0x1d4fd0, emissiveIntensity: 1, roughness: 0.35 });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), btnMat); knob.position.set(x, y + 0.98, z); root.add(knob);
    solid(x - 0.3, y, z - 0.3, x + 0.3, y + 1.0, z + 0.3, 'metal', { draw: false });
    const s = {
      id, room, x, y: y + 1.0, z, label, kind: o.kind || 'once', dur: o.dur || 0, active: false, timer: 0, cool: 0, knob, btnMat,
      enabled: o.enabled || (() => true), onUse: o.onUse || (() => {}), r: o.r ?? 1.9,
    };
    s.use = () => {
      if (s.cool > 0) return false;
      if (!s.enabled()) { ctx.sfx.denied(); if (o.deniedText) ctx.toast(o.deniedText, 1800); return false; }
      s.cool = 0.4; ctx.sfx.switchOn();
      if (s.kind === 'toggle') s.active = !s.active; else s.active = true;
      if (s.kind === 'timed') s.timer = s.dur * ctx.diff().doorMul;
      mem['sw:' + id] = s.active;
      s.onUse(s);
      ctx.emit('switch');
      return true;
    };
    s.reset = () => { s.active = false; s.timer = 0; };
    L.switches.push(s); if (room) room.switches.push(s);
    return s;
  };

  /* ---------- puertas ---------- */
  /** Puerta corrediza en un hueco. axis: 'x' (pared norte/sur) o 'z' (pared este/oeste). */
  L.door = (room, id, x0, y0, z0, x1, y1, z1, axis, want, o = {}) => {
    const b = solid(x0, y0, z0, x1, y1, z1, 'door', { dyn: true, draw: false });
    const w = axis === 'x' ? (x1 - x0) : (z1 - z0), h = y1 - y0;
    const g = doorHalfGeo(w / 2, h);
    const mL = new THREE.Mesh(g, M.vc), mR = new THREE.Mesh(g, M.vc);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    for (const m of [mL, mR]) { m.position.set(cx, cy, cz); if (axis === 'z') m.rotation.y = Math.PI / 2; m.castShadow = true; root.add(m); }
    // marco con luces de estado
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xff3344 });
    const lamps = [];
    const nl = o.timed ? 6 : 1;
    for (let i = 0; i < nl; i++) {
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.1), o.timed ? new THREE.MeshBasicMaterial({ color: 0xff3344 }) : lampMat);
      const off = (i - (nl - 1) / 2) * 0.26;
      if (axis === 'x') lm.position.set(cx + off, y1 + 0.18, cz); else lm.position.set(cx, y1 + 0.18, cz + off);
      root.add(lm); lamps.push(lm);
    }
    const d = { id, room, box: b, axis, w, open: 0, want, forced: false, timed: !!o.timed, timer: 0, dur: o.dur || 0, mL, mR, cx, cy, cz, lamps, wasOpen: false, tickT: 0 };
    b.ref = d;
    L.doors.push(d); if (room) room.doors.push(d);
    return d;
  };

  /* ---------- láser ---------- */
  const emGeo = emitterGeo();
  L.emitter = (room, id, x, y, z, dx, dy, dz, on = () => true) => {
    const m = new THREE.Mesh(emGeo, M.vc);
    m.position.set(x - dx * 0.18, y - dy * 0.18, z - dz * 0.18);
    m.lookAt(x - dx * 5, y - dy * 5, z - dz * 5);
    root.add(m);
    const e = { id, room, x, y, z, dx, dy, dz, on, mesh: m };
    L.emitters.push(e);
    return e;
  };
  L.receptor = (room, id, x0, y0, z0, x1, y1, z1, face) => {
    const b = solid(x0, y0, z0, x1, y1, z1, 'receptor', { draw: false });
    const w = face === 'x' ? z1 - z0 : x1 - x0, h = face === 'y' ? z1 - z0 : y1 - y0;
    const m = new THREE.Mesh(receptorGeo(Math.max(0.3, w), Math.max(0.3, h)), M.vc);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    if (face === 'x') m.rotation.y = Math.PI / 2; if (face === 'y') m.rotation.x = -Math.PI / 2;
    root.add(m);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x552030 });
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.2, w * 0.7), Math.max(0.2, h * 0.7)), lensMat);
    lens.position.copy(m.position);
    if (face === 'x') { lens.rotation.y = Math.PI / 2; } if (face === 'y') lens.rotation.x = -Math.PI / 2;
    // asomar la lente hacia el frente (ambos lados para paneles sueltos)
    const lens2 = lens.clone(); lens2.rotation.y += Math.PI; if (face === 'y') { lens2.rotation.set(Math.PI / 2, 0, 0); }
    const off = 0.1;
    if (face === 'x') { lens.position.x += off; lens2.position.x -= off; } else if (face === 'y') { lens.position.y += off; lens2.position.y -= off; } else { lens.position.z += off; lens2.position.z -= off; }
    root.add(lens, lens2);
    const r = { id, room, box: b, active: false, hitT: 0, lensMat, latch: false, total: 0, wasActive: false };
    b.ref = r;
    L.receptors.push(r);
    return r;
  };

  /* ---------- campos de gravedad, ácido, rejillas ---------- */
  L.lift = (room, id, x0, y0, z0, x1, y1, z1, on) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), M.field);
    mesh.scale.set((x1 - x0) / 2, y1 - y0, (z1 - z0) / 2); mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    root.add(mesh);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 0.14, 20), new THREE.MeshStandardMaterial({ color: 0x2b2238, emissive: 0x8a4dff, emissiveIntensity: 0.6 }));
    base.scale.set((x1 - x0) / 2, 1, (z1 - z0) / 2); base.position.set((x0 + x1) / 2, y0 + 0.07, (z0 + z1) / 2); root.add(base);
    const f = { id, room, box: box(x0, y0, z0, x1, y1, z1, 'trigger'), on, mesh, base, top: y1, active: false };
    L.lifts.push(f);
    return f;
  };
  L.acid = (x0, y0, z0, x1, y1, z1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), M.acid);
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y1, (z0 + z1) / 2); root.add(m);
    solid(x0, y0 - 0.6, z0, x1, y0, z1, 'dark');
    const a = { box: box(x0, y0 - 1, z0, x1, y1, z1, 'trigger'), mesh: m, top: y1 };
    L.acids.push(a);
    return a;
  };
  L.fizzler = (x0, y0, z0, x1, y1, z1) => {
    const w = Math.max(x1 - x0, z1 - z0), h = y1 - y0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.fizz);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); if (z1 - z0 > x1 - x0) m.rotation.y = Math.PI / 2;
    root.add(m);
    const f = { box: box(x0, y0, z0, x1, y1, z1, 'trigger'), mesh: m };
    L.fizzlers.push(f);
    return f;
  };
  L.trigger = (x0, y0, z0, x1, y1, z1, fn, o = {}) => {
    const t = { box: box(x0, y0, z0, x1, y1, z1, 'trigger'), fn, once: o.once !== false, fired: false, inside: false };
    triggers.push(t);
    return t;
  };

  /* ---------- paneles móviles ---------- */
  /** path(t) devuelve el desplazamiento {x,y,z} del panel respecto de su posición base. */
  L.mover = (x0, y0, z0, x1, y1, z1, mat, path) => {
    const b = solid(x0, y0, z0, x1, y1, z1, mat, { dyn: true, draw: false });
    b.moving = true;
    const g = boxesGeometry([{ x0: 0, y0: 0, z0: 0, x1: x1 - x0, y1: y1 - y0, z1: z1 - z0 }]);
    const m = new THREE.Mesh(g, mat === 'white' ? M.white : M.metal); m.receiveShadow = true; root.add(m);
    // carril con luz de acento
    const mv = { box: b, base: { x: x0, y: y0, z: z0 }, size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 }, path, mesh: m, t: 0, speed: 1, active: true };
    L.movers.push(mv);
    return mv;
  };

  /* ---------- cristales ---------- */
  const crystalGeo = new THREE.OctahedronGeometry(0.28, 0);
  L.crystal = (room, id, x, y, z) => {
    const m = new THREE.Mesh(crystalGeo, M.crystal); m.position.set(x, y, z); m.scale.set(1, 1.5, 1); root.add(m);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 20), new THREE.MeshBasicMaterial({ color: 0xc8a6ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    halo.position.set(x, y, z); root.add(halo);
    const c = { id, room, x, y, z, taken: ctx.S().crystals.includes(id), mesh: m, halo };
    if (c.taken) { m.visible = false; halo.visible = false; }
    L.crystals.push(c);
    return c;
  };

  /* ---------- torretas ---------- */
  const tGeo = turretGeo();
  L.turret = (room, id, x, y, z, yaw) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; root.add(g);
    const shell = new THREE.Mesh(tGeo, M.vc); shell.castShadow = true; g.add(shell);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat); eye.position.set(0, 1.1, -0.25); g.add(eye);
    const b = body(0.3, 0.65, 0.3);
    b.pos.x = x; b.pos.y = y + 0.65; b.pos.z = z;
    const bx = box(x - 0.3, y, z - 0.3, x + 0.3, y + 1.3, z + 0.3, 'turret');
    b.self = bx; dyn.push(bx);
    const t = { id, room, home: { x, y, z, yaw }, yaw, group: g, eye, eyeMat, body: b, box: bx, state: 'idle', alert: 0, fireCd: 0, down: false, downT: 0, falling: false, alarmT: 0, scan: 0 };
    bx.ref = t;
    L.turrets.push(t); if (room) room.turrets.push(t);
    return t;
  };
  function turretReset(t) {
    const h = t.home;
    t.yaw = h.yaw; t.state = 'idle'; t.alert = 0; t.fireCd = 0; t.down = false; t.downT = 0; t.falling = false; t.flew = false; t.fallT = 0;
    t.body.pos.x = h.x; t.body.pos.y = h.y + 0.65; t.body.pos.z = h.z; t.body.vel.x = t.body.vel.y = t.body.vel.z = 0;
    t.group.position.set(h.x, h.y, h.z); t.group.rotation.set(0, h.yaw, 0); t.eyeMat.color.setHex(0xff2a3a);
    syncTurretBox(t);
  }
  function syncTurretBox(t) {
    const p = t.body.pos, bx = t.box;
    if (t.down) { bx.x0 = p.x - 0.55; bx.x1 = p.x + 0.55; bx.z0 = p.z - 0.55; bx.z1 = p.z + 0.55; bx.y0 = p.y - 0.65; bx.y1 = p.y - 0.15; }
    else { bx.x0 = p.x - 0.3; bx.x1 = p.x + 0.3; bx.z0 = p.z - 0.3; bx.z1 = p.z + 0.3; bx.y0 = p.y - 0.65; bx.y1 = p.y + 0.65; }
  }
  /** Tumba una torreta (cubo, láser, portal bajo sus patas o empujón por la espalda). */
  L.knockTurret = (t, how) => {
    if (t.down) return;
    t.down = true; t.downT = 0; t.state = 'down'; t.alert = 0; t.eyeMat.color.setHex(0x331114);
    ctx.sfx.turretDown(); ctx.fx.burst(t.body.pos.x, t.body.pos.y + 0.3, t.body.pos.z, 0xffffff, 14, 2.4);
    ctx.onTurretDown && ctx.onTurretDown(t, how);
  };

  /* ---------- esferas supervisoras ---------- */
  const sGeo = sphereGeo();
  const coneGeo = new THREE.ConeGeometry(1, 1, 18, 1, true); coneGeo.translate(0, -0.5, 0);
  const gazeGeo = new THREE.CircleGeometry(1, 28); gazeGeo.rotateX(-Math.PI / 2);
  L.sphere = (room, id, path, floorY, speed = 1.5) => {
    const g = new THREE.Group(); root.add(g);
    const shell = new THREE.Mesh(sGeo, M.vc); g.add(shell);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), eyeMat); eye.position.set(0, -0.05, -0.47); g.add(eye);
    const coneMat = M.cone.clone(), gazeMat = M.gaze.clone();
    const cone = new THREE.Mesh(coneGeo, coneMat); root.add(cone);
    const gaze = new THREE.Mesh(gazeGeo, gazeMat); root.add(gaze);
    const bx = box(0, 0, 0, 1, 1, 1, 'sphere');
    actors.push(bx);
    const s = { id, room, path, floorY, speed, seg: 0, u: 0, pos: { x: path[0][0], y: path[0][1], z: path[0][2] }, yaw: 0, state: 'patrol', scan: 0, stunT: 0, baitT: 0, coolT: 0, gx: 0, gz: 0,
      group: g, eyeMat, cone, coneMat, gaze, gazeMat, box: bx, bob: Math.random() * 6, bait: /** @type {any} */ (null) };
    bx.ref = s;
    L.spheres.push(s); if (room) room.spheres.push(s);
    return s;
  };
  function sphereReset(s) { s.seg = 0; s.u = 0; s.state = 'patrol'; s.scan = 0; s.stunT = 0; s.baitT = 0; s.coolT = 0; s.pos.x = s.path[0][0]; s.pos.y = s.path[0][1]; s.pos.z = s.path[0][2]; s.bait = null; }
  L.stunSphere = (s) => { if (s.state === 'stun') { s.stunT = 8; return; } s.state = 'stun'; s.stunT = 8; s.scan = 0; ctx.sfx.stun(); ctx.fx.burst(s.pos.x, s.pos.y, s.pos.z, 0xfff1a8, 16, 2.5, 1); ctx.emit('sphereStun'); };

  /* ======================= finalizar (mallas fusionadas) ======================= */
  L.finalize = () => {
    const by = {};
    for (const b of statics) { if (b.noDraw) continue; (by[b.mat] = by[b.mat] || []).push(b); }
    if (trims.length) by.trim = trims;
    const matOf = { metal: M.metal, white: M.white, glass: M.glass, grate: M.grate, hazard: M.hazard, dark: M.dark, trim: M.trim };
    L.meshes = [];
    for (const k in by) {
      const mat = /** @type {any} */ (matOf)[k] || M.metal;
      const mesh = new THREE.Mesh(boxesGeometry(by[k], k === 'hazard' ? 1 : 0.5), mat);
      mesh.receiveShadow = k !== 'glass' && k !== 'trim'; mesh.castShadow = k === 'metal' || k === 'white';
      if (k === 'glass') mesh.renderOrder = 2;
      root.add(mesh); L.meshes.push(mesh);
    }
    // estado de sesión
    for (const s of L.switches) if (mem['sw:' + s.id] && s.kind !== 'timed') s.active = true;
  };
  L.applyQuality = (q) => {
    L.lights.forEach((l, i) => { l.visible = i < q.lights; l.castShadow = false; });
  };

  /* ======================= reinicio de sala ======================= */
  L.resetRoom = (r) => {
    for (const c of r.cubes) cubeReset(c, !c.dispenser || !!mem['disp:' + c.id]);
    for (const t of r.turrets) turretReset(t);
    for (const s of r.spheres) sphereReset(s);
    for (const s of r.switches) if (s.kind === 'timed' || s.kind === 'momentary') s.reset();
    for (const d of r.doors) if (d.timed) d.timer = 0;
    if (r.onReset) r.onReset();
  };

  /* ======================= actualización ======================= */
  const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
  const passBeam = c => c.mat === 'grate' || c.mat === 'trigger' || c.mat === 'field' || c.mat === 'barrier';
  const S = { lists: listsAll, skip: /** @type {Set<any>} */ (new Set()) };

  function stepBodyPortals(b, dt, onTp, extraSkip = null) {
    S.skip.clear();
    if (extraSkip) S.skip.add(extraSkip);
    portals.before(b, S.skip);
    moveBody(b, S, dt);
    return portals.after(b, onTp);
  }
  L.stepBodyPortals = stepBodyPortals;

  /** Gravedad de sala + campos de elevación. Devuelve true si el cuerpo está en un campo activo. */
  L.applyFields = (b, dt, gscale = 1) => {
    let inLift = false;
    for (const f of L.lifts) {
      if (!f.active) continue;
      const fb = f.box;
      if (b.pos.x > fb.x0 && b.pos.x < fb.x1 && b.pos.z > fb.z0 && b.pos.z < fb.z1 && b.pos.y - b.hy < fb.y1 && b.pos.y + b.hy > fb.y0) {
        inLift = true;
        const target = f.top - b.hy - 0.6; // flota cerca del tope
        const want = Math.max(-1.5, Math.min(4.2, (target - b.pos.y) * 2.2));
        b.vel.y += (want - b.vel.y) * Math.min(1, dt * 5);
        // leve centrado
        b.vel.x += (((fb.x0 + fb.x1) / 2 - b.pos.x) * 0.6) * dt; b.vel.z += (((fb.z0 + fb.z1) / 2 - b.pos.z) * 0.6) * dt;
      }
    }
    if (!inLift) b.vel.y -= PHYS.g * gscale * dt;
    if (b.vel.y < -30) b.vel.y = -30;
    return inLift;
  };
  /** ¿El cuerpo tocó ácido o cayó al vacío? */
  L.hazardAt = (b) => {
    if (b.pos.y < L.killY) return 'fall';
    for (const a of L.acids) { const ab = a.box; if (b.pos.x > ab.x0 && b.pos.x < ab.x1 && b.pos.z > ab.z0 && b.pos.z < ab.z1 && b.pos.y - b.hy < a.top - 0.05 && b.pos.y > ab.y0) return 'acid'; }
    return null;
  };
  L.inFizzler = (b) => {
    for (const f of L.fizzlers) if (overlaps(b, f.box)) return f;
    return null;
  };

  /** Cubos: física, portales, campos, ácido, rejillas y respawn. */
  function updateCubes(dt, P) {
    for (const c of L.cubes) {
      if (!c.alive) {
        if (c.dispenser && mem['disp:' + c.id] && c.respawnT > 0) { c.respawnT -= dt; if (c.respawnT <= 0) L.dispense(c.dispenser); }
        continue;
      }
      if (c.dissolveT > 0) {
        c.dissolveT -= dt; c.mesh.scale.setScalar(Math.max(0.05, c.dissolveT * 2));
        if (c.dissolveT <= 0) {
          const back = !c.dispenser || mem['disp:' + c.id];
          cubeReset(c, false);
          if (back) { c.respawnT = 1.2; if (!c.dispenser) { c.respawnT = 0; cubeReset(c, true); ctx.fx.burst(c.home.x, c.home.y, c.home.z, 0xffffff, 10, 1.5, 0); } }
        }
        continue;
      }
      if (c.held) { syncCube(c); continue; }
      const b = c.body, room = c.room;
      const g = room ? room.gravity : 1;
      L.applyFields(b, dt, g);
      // fricción en el piso
      if (b.grounded) { const k = Math.max(0, 1 - dt * 8); b.vel.x *= k; b.vel.z *= k; }
      if (b.grounded && b.ground && b.ground.moving) { b.pos.x += b.ground.dx; b.pos.y += b.ground.dy; b.pos.z += b.ground.dz; }
      const vy = b.vel.y;
      c.lastSpeed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
      const tp = stepBodyPortals(b, dt, (src, dst) => {
        xfDir(src.F, dst.F, c.facing, _d); snapFacing(c, _d);
        ctx.fx.spray(b.pos.x, b.pos.y, b.pos.z, dst.F.n.x, dst.F.n.y, dst.F.n.z, dst.id === 'A' ? 0x7fd2ff : 0xffb066, 6, 2);
        if (ctx.onCubeTeleport) ctx.onCubeTeleport(c, src, dst);
      });
      void tp;
      if (b.grounded && vy < -4) ctx.sfx.thud();
      syncCube(c);
      const hz = L.hazardAt(b);
      if (hz) { cubeDissolve(c, hz); continue; }
      if (L.inFizzler(b)) { cubeDissolve(c, 'fizz'); continue; }
    }
    void P;
  }
  function snapFacing(c, d) {
    if (Math.abs(d.x) > Math.abs(d.z)) { c.facing.x = Math.sign(d.x) || 1; c.facing.z = 0; } else { c.facing.x = 0; c.facing.z = Math.sign(d.z) || -1; }
    c.facing.y = 0;
  }
  L.snapFacing = snapFacing;

  /** Botones de piso: se hunden con un cubo o con el sujeto. */
  function updateButtons(dt, P) {
    for (const bt of L.buttons) {
      let by = '';
      const pb = P.body;
      if (P.alive && Math.hypot(pb.pos.x - bt.x, pb.pos.z - bt.z) < bt.r && Math.abs(pb.pos.y - pb.hy - bt.y) < 0.3) by = 'player';
      for (const c of L.cubes) {
        if (!c.alive || c.held || c.dissolveT > 0) continue;
        const cb = c.body;
        if (Math.hypot(cb.pos.x - bt.x, cb.pos.z - bt.z) < bt.r && Math.abs(cb.pos.y - 0.35 - bt.y) < 0.3) { by = 'cube'; break; }
      }
      const act = by !== '';
      if (act !== bt.active) {
        bt.active = act; ctx.sfx.button(act);
        bt.topMat.color.setHex(act ? 0x41e07a : 0xd8333f); bt.topMat.emissive.setHex(act ? 0x0f7a35 : 0x7a0a12);
        if (act) ctx.emit('button');
      }
      bt.by = by;
      const ty = bt.y + (act ? 0.02 : 0.08);
      bt.top.position.y += (ty - bt.top.position.y) * Math.min(1, dt * 12);
    }
  }

  /** Puertas: abren según su condición; las temporizadas cuentan hacia atrás con luces y tic-tac. */
  function updateDoors(dt, P) {
    for (const d of L.doors) {
      if (d.timed && d.timer > 0) {
        d.timer -= dt; d.tickT -= dt;
        if (d.tickT <= 0) { ctx.sfx.tick(d.timer < 1.5); d.tickT = d.timer < 1.5 ? 0.25 : 0.5; }
      }
      const want = d.forced || (d.timed ? d.timer > 0 : !!d.want());
      let target = want ? 1 : 0;
      // no aplasta: si algo ocupa el vano, se queda abierta
      if (!want && d.open > 0.05) {
        const bx = d.box;
        const pb = P.body;
        if (pb.pos.x + pb.hx > bx.x0 - 0.05 && pb.pos.x - pb.hx < bx.x1 + 0.05 && pb.pos.z + pb.hz > bx.z0 - 0.05 && pb.pos.z - pb.hz < bx.z1 + 0.05 && pb.pos.y - pb.hy < bx.y1 && pb.pos.y + pb.hy > bx.y0) target = d.open;
        for (const c of L.cubes) { if (!c.alive) continue; const cb = c.box; if (boxOverlap(cb, bx, -0.05)) target = d.open; }
      }
      const sp = 2.6;
      d.open += Math.max(-sp * dt, Math.min(sp * dt, target - d.open));
      d.box.on = d.open < 0.85;
      if (want !== d.wasOpen) { d.wasOpen = want; ctx.sfx.door(want); }
      const k = d.open * d.w * 0.5;
      if (d.axis === 'x') { d.mL.position.x = d.cx - d.w / 4 - k; d.mR.position.x = d.cx + d.w / 4 + k; }
      else { d.mL.position.z = d.cz - d.w / 4 - k; d.mR.position.z = d.cz + d.w / 4 + k; }
      // luces: verde abierta, roja cerrada; temporizada: barra que se vacía
      if (d.timed) {
        const frac = d.timer > 0 ? d.timer / Math.max(0.01, d.dur * ctx.diff().doorMul) : 0;
        d.lamps.forEach((lm, i) => /** @type {any} */ (lm.material).color.setHex(d.timer > 0 && i < Math.ceil(frac * d.lamps.length) ? 0xffc23a : 0xff3344));
      } else /** @type {any} */ (d.lamps[0].material).color.setHex(want ? 0x45ff8a : 0xff3344);
    }
  }

  const _op = { x: 0, y: 0, z: 0 }, _od = { x: 0, y: 0, z: 0 };
  function seg(k, ax, ay, az, bx, by, bz) { const o = k * 6, a = L.segs; a[o] = ax; a[o + 1] = ay; a[o + 2] = az; a[o + 3] = bx; a[o + 4] = by; a[o + 5] = bz; }
  /** Láseres: trazado con rebotes en portales y cubos prisma; energiza paneles, aturde esferas, tumba torretas y quema. */
  function traceBeams(dt, P) {
    let k = 0;
    for (const r of L.receptors) r.hitNow = false;
    let playerHit = false;
    for (const e of L.emitters) {
      if (!e.on()) continue;
      let ox = e.x, oy = e.y, oz = e.z, dx = e.dx, dy = e.dy, dz = e.dz;
      let lastCube = null;
      for (let bounce = 0; bounce < 7 && k < 24; bounce++) {
        const h = raycast(ox, oy, oz, dx, dy, dz, 90, listsAll, c => passBeam(c) || (lastCube && c === lastCube.box) || (c.cube && c.ref && c.ref.held));
        const maxT = h ? h.t : 90;
        const pr = portals.rayPortal(ox, oy, oz, dx, dy, dz, maxT);
        if (pr) {
          const hx = ox + dx * pr.t, hy = oy + dy * pr.t, hz = oz + dz * pr.t;
          seg(k++, ox, oy, oz, hx, hy, hz);
          _o.x = hx; _o.y = hy; _o.z = hz; _d.x = dx; _d.y = dy; _d.z = dz;
          const src = pr.p, dst = src.other;
          const op = xfPoint(src.F, dst.F, _o, _op), od = xfDir(src.F, dst.F, _d, _od);
          ox = op.x + od.x * 0.02; oy = op.y + od.y * 0.02; oz = op.z + od.z * 0.02; dx = od.x; dy = od.y; dz = od.z;
          lastCube = null;
          continue;
        }
        const hx = ox + dx * maxT, hy = oy + dy * maxT, hz = oz + dz * maxT;
        seg(k++, ox, oy, oz, hx, hy, hz);
        if (!h || !h.box) break;
        const bx = h.box, ref = bx.ref;
        if (bx.mat === 'receptor' && ref) { ref.hitNow = true; break; }
        if (bx.cube && ref && ref.kind === 'prism') {
          // el prisma reemite desde su centro hacia donde apunta
          const p = ref.body.pos;
          ox = p.x; oy = p.y; oz = p.z; dx = ref.facing.x; dy = 0; dz = ref.facing.z; lastCube = ref;
          seg(k++, hx, hy, hz, p.x, p.y, p.z);
          continue;
        }
        if (bx.mat === 'player') { playerHit = true; break; }
        if (bx.mat === 'sphere' && ref) { L.stunSphere(ref); break; }
        if (bx.mat === 'turret' && ref && !ref.down) { L.knockTurret(ref, 'laser'); break; }
        if (k % 3 === 0) ctx.fx.burst(hx, hy, hz, 0xff4060, 1, 1.2, 0, 0.25);
        break;
      }
    }
    L.segCount = k;
    for (const r of L.receptors) {
      if (r.hitNow) { r.hitT = 0.15; r.total += dt; } else r.hitT -= dt;
      r.active = r.latch || r.hitT > 0;
      if (r.active !== r.wasActive) {
        r.wasActive = r.active; ctx.sfx.receptor(r.active);
        r.lensMat.color.setHex(r.active ? 0xff6a7d : 0x552030);
        if (r.active) ctx.emit('receptor');
      }
    }
    if (playerHit && P.alive) ctx.laserBurn(dt);
  }

  /** Línea de visión libre entre dos puntos (paredes, puertas, cubos). */
  function los(ax, ay, az, bx, by, bz, ignore = null) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.hypot(dx, dy, dz);
    const h = raycast(ax, ay, az, dx / l, dy / l, dz / l, l - 0.05, lists, c => c === ignore || c.mat === 'grate' || c.mat === 'trigger' || c.mat === 'turret' || c.mat === 'barrier');
    return !h;
  }
  L.los = los;

  /** Torretas: cono de visión, aviso (puntero rojo) y ráfagas; se tumban con cubos, láser, portales o por la espalda. */
  function updateTurrets(dt, P) {
    const d = ctx.diff();
    for (const t of L.turrets) {
      const b = t.body;
      if (t.falling) {
        // cae por un portal: física simple con cruce
        b.vel.y -= PHYS.g * dt; if (b.vel.y < -30) b.vel.y = -30;
        t.box.on = false;
        t.fallT = (t.fallT || 0) + dt;
        // tras unos segundos (p. ej. rebotando entre dos portales de piso) cae sin cruzar más portales
        if (t.fallT > 3) { S.skip.clear(); moveBody(b, S, dt); }
        else stepBodyPortals(b, dt, () => { if (!t.flew) { t.flew = true; L.knockTurret(t, 'portal'); } });
        t.box.on = true;
        if (b.grounded || b.pos.y < L.killY || t.fallT > 8) { t.falling = false; t.fallT = 0; if (!t.down) L.knockTurret(t, 'portal'); }
        if (b.pos.y < L.killY) { b.pos.y = L.killY + 5; b.vel.y = 0; }
        t.group.position.set(b.pos.x, b.pos.y - 0.65, b.pos.z); t.group.rotation.x += dt * 6;
        syncTurretBox(t);
        continue;
      }
      if (t.down) {
        t.downT = Math.min(1, t.downT + dt * 3);
        t.group.rotation.z = t.downT * Math.PI / 2;
        t.group.position.set(b.pos.x, b.pos.y - 0.65 + t.downT * 0.3, b.pos.z);
        syncTurretBox(t);
        continue;
      }
      // golpe de cubo
      for (const c of L.cubes) {
        if (!c.alive || c.held) continue;
        if (boxOverlap(c.box, t.box, -0.06) && c.lastSpeed > 2.2) { L.knockTurret(t, 'cube'); break; }
      }
      if (t.down) continue;
      // ¿hay un portal de piso debajo?
      for (const p of [portals.A, portals.B]) {
        if (!p.placed || !portals.linked() || p.F.n.y < 0.5) continue;
        if (Math.abs(p.F.p.y - (b.pos.y - 0.65)) > 0.15) continue;
        const lx = Math.abs(b.pos.x - p.F.p.x), lz = Math.abs(b.pos.z - p.F.p.z);
        const ex = Math.abs(p.F.r.x) * 0.62 + Math.abs(p.F.u.x) * 1.02, ez = Math.abs(p.F.r.z) * 0.62 + Math.abs(p.F.u.z) * 1.02;
        if (lx < ex && lz < ez) { t.falling = true; t.flew = false; b.vel.x = b.vel.z = 0; b.vel.y = -1; ctx.toast('¡La torreta cayó por el portal!', 1400); }
      }
      if (t.falling) continue;
      // visión
      const ex = b.pos.x, ey = b.pos.y + 0.45, ez = b.pos.z;
      const pb = P.body, px = pb.pos.x, py = pb.pos.y + 0.3, pz = pb.pos.z;
      const dx = px - ex, dz = pz - ez, dist = Math.hypot(dx, dz);
      const fx = -Math.sin(t.yaw), fz = -Math.cos(t.yaw);
      const cos = dist > 0.01 ? (dx * fx + dz * fz) / dist : 1;
      const seen = P.alive && P.vulnerable && dist < 15 && cos > 0.74 && Math.abs(py - ey) < 6 && los(ex, ey, ez, px, py, pz);
      t.alert = seen ? Math.min(1, t.alert + dt / d.turretAim) : Math.max(0, t.alert - dt * 0.8);
      if (seen) {
        // gira apenas hacia el objetivo
        const want = Math.atan2(-dx, -dz); let dd = want - t.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        t.yaw += dd * Math.min(1, dt * 1.5); t.group.rotation.y = t.yaw;
        ctx.fx.sight(ex + fx * 0.3, ey + 0.1, ez + fz * 0.3, px, py, pz);
        if (t.state === 'idle') { t.state = 'alert'; ctx.sfx.turretAlert(); ctx.onTurretSpot && ctx.onTurretSpot(t); }
      } else if (t.alert <= 0) t.state = 'idle';
      t.eyeMat.color.setHex(t.alert > 0.98 ? 0xffffff : t.alert > 0 ? 0xff7a3a : 0xff2a3a);
      if (t.alert >= 1 && seen) {
        t.fireCd -= dt;
        if (t.fireCd <= 0) {
          t.fireCd = d.turretRate; t.state = 'fire';
          ctx.sfx.turretFire();
          ctx.fx.spray(ex + fx * 0.35, ey, ez + fz * 0.35, fx, 0, fz, 0xffd27a, 4, 3);
          ctx.hurt(d.turretDmg, ex, ez, 'turret');
        }
      } else t.fireCd = Math.min(t.fireCd, 0.2);
    }
  }

  /** Esferas supervisoras: patrulla, foco de mirada en el piso, escaneo con aviso y pulso que borra portales. */
  function updateSpheres(dt, P) {
    const d = ctx.diff();
    for (const s of L.spheres) {
      s.bob += dt;
      const fy = s.floorY;
      if (s.state === 'stun') {
        s.stunT -= dt;
        s.group.rotation.y += dt * 3; s.group.rotation.z = Math.sin(s.bob * 6) * 0.3;
        s.eyeMat.color.setHex(0x333333); s.cone.visible = false; s.gaze.visible = false;
        s.group.position.set(s.pos.x, s.pos.y - 0.6 + Math.sin(s.bob * 2) * 0.05, s.pos.z);
        if (s.stunT <= 0) { s.state = 'patrol'; s.group.rotation.z = 0; }
        syncSphereBox(s);
        continue;
      }
      // movimiento a lo largo del recorrido
      const moving = s.state === 'patrol';
      const a = s.path[s.seg], b2 = s.path[(s.seg + 1) % s.path.length];
      const sl = Math.hypot(b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]) || 1;
      if (moving) { s.u += dt * s.speed / sl; if (s.u >= 1) { s.u = 0; s.seg = (s.seg + 1) % s.path.length; } }
      const a2 = s.path[s.seg], b3 = s.path[(s.seg + 1) % s.path.length];
      s.pos.x = a2[0] + (b3[0] - a2[0]) * s.u; s.pos.y = a2[1] + (b3[1] - a2[1]) * s.u; s.pos.z = a2[2] + (b3[2] - a2[2]) * s.u;
      let wantYaw = Math.atan2(-(b3[0] - a2[0]), -(b3[2] - a2[2]));
      // foco: adelante en el piso, o sobre el señuelo
      let gx = s.pos.x - Math.sin(s.yaw) * 2.6, gz = s.pos.z - Math.cos(s.yaw) * 2.6;
      // ¿un cubo suelto en el foco? lo mira (señuelo)
      if (s.state === 'patrol') {
        for (const c of L.cubes) {
          if (!c.alive || c.held || c.room !== s.room) continue;
          if (Math.hypot(c.body.pos.x - gx, c.body.pos.z - gz) < d.sphereRadius && c.body.grounded) { s.state = 'bait'; s.baitT = 4; s.bait = c; ctx.sfx.sphereScan(); ctx.emit('sphereBait'); break; }
        }
      }
      if (s.state === 'bait' && s.bait) {
        s.baitT -= dt; gx = s.bait.body.pos.x; gz = s.bait.body.pos.z;
        wantYaw = Math.atan2(-(gx - s.pos.x), -(gz - s.pos.z));
        if (s.baitT <= 0 || !s.bait.alive || s.bait.held) { s.state = 'patrol'; s.bait = null; s.coolT = 2; }
      }
      let dy = wantYaw - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * Math.min(1, dt * 3);
      s.gx = gx; s.gz = gz;
      // un láser que pasa rozándola la encandila (queda aturdida)
      if (s.state === 'patrol' || s.state === 'scan') {
        const r = 1.15, gx2 = s.pos.x, gy = s.pos.y, gz2 = s.pos.z;
        for (let k = 0; k < L.segCount; k++) {
          const o = k * 6, a0 = L.segs[o], a1 = L.segs[o + 1], a2 = L.segs[o + 2], b0 = L.segs[o + 3], b1 = L.segs[o + 4], b2 = L.segs[o + 5];
          const vx = b0 - a0, vy = b1 - a1, vz = b2 - a2, l2 = vx * vx + vy * vy + vz * vz || 1;
          const t = Math.max(0, Math.min(1, ((gx2 - a0) * vx + (gy - a1) * vy + (gz2 - a2) * vz) / l2));
          const qx = a0 + vx * t - gx2, qy = a1 + vy * t - gy, qz = a2 + vz * t - gz2;
          if (qx * qx + qy * qy + qz * qz < r * r) { L.stunSphere(s); break; }
        }
        if (s.state === 'stun') { syncSphereBox(s); continue; }
      }
      if (s.coolT > 0) s.coolT -= dt;
      // ¿el sujeto está en el foco?
      const pb = P.body;
      const inGaze = P.alive && s.state !== 'bait' && s.coolT <= 0 && Math.hypot(pb.pos.x - gx, pb.pos.z - gz) < d.sphereRadius && Math.abs(pb.pos.y - pb.hy - fy) < 2.5 && los(s.pos.x, s.pos.y - 0.5, s.pos.z, pb.pos.x, pb.pos.y, pb.pos.z);
      if (inGaze) {
        if (s.state === 'patrol') { s.state = 'scan'; ctx.onSphereSpot && ctx.onSphereSpot(s); }
        s.scan = Math.min(1, s.scan + dt / d.sphereScan);
        if (Math.floor(s.scan * 8) !== Math.floor((s.scan - dt / d.sphereScan) * 8)) ctx.sfx.sphereScan();
        if (s.scan >= 1) {
          // pulso: borra los portales y empuja
          ctx.sfx.spherePulse(); ctx.fx.ring(s.pos.x, fy + 0.1, s.pos.z, 0xfff1a8, 6, 0.6);
          ctx.onSpherePulse && ctx.onSpherePulse(s);
          s.scan = 0; s.state = 'patrol'; s.coolT = 3;
        }
      } else if (s.state === 'scan') { s.scan = Math.max(0, s.scan - dt * 0.7); if (s.scan <= 0) s.state = 'patrol'; }
      // visual
      s.group.position.set(s.pos.x, s.pos.y + Math.sin(s.bob * 2) * 0.08, s.pos.z);
      s.group.rotation.set(0, s.yaw, 0);
      const k = s.scan, alarm = s.state === 'scan';
      const col = alarm ? (k > 0.66 ? 0xff3344 : 0xffa040) : s.state === 'bait' ? 0x9fd8ff : 0xfff1a8;
      s.eyeMat.color.setHex(col); s.coneMat.color.setHex(col); s.gazeMat.color.setHex(col);
      s.gazeMat.opacity = alarm ? 0.35 + 0.3 * Math.abs(Math.sin(s.bob * (6 + k * 14))) : 0.32;
      s.cone.visible = true; s.gaze.visible = true;
      const hgt = Math.max(0.5, s.pos.y - fy);
      const cx = (s.pos.x + gx) / 2, cz = (s.pos.z + gz) / 2;
      s.cone.position.set(s.pos.x, s.pos.y, s.pos.z);
      // cono que apunta del ojo al foco
      const vx = gx - s.pos.x, vy = fy - s.pos.y, vz = gz - s.pos.z, vl = Math.hypot(vx, vy, vz);
      s.cone.scale.set(d.sphereRadius, vl, d.sphereRadius);
      s.cone.quaternion.setFromUnitVectors(_UP_NEG, _tmpV.set(vx / vl, vy / vl, vz / vl));
      s.gaze.position.set(gx, fy + 0.03, gz); s.gaze.scale.setScalar(d.sphereRadius);
      void cx; void cz; void hgt;
      syncSphereBox(s);
    }
  }
  const _UP_NEG = new THREE.Vector3(0, -1, 0), _tmpV = new THREE.Vector3();
  function syncSphereBox(s) { const b = s.box; b.x0 = s.pos.x - 0.5; b.x1 = s.pos.x + 0.5; b.y0 = s.pos.y - 0.5; b.y1 = s.pos.y + 0.5; b.z0 = s.pos.z - 0.5; b.z1 = s.pos.z + 0.5; }

  function updateMovers(dt) {
    for (const m of L.movers) {
      if (m.active) m.t += dt * m.speed;
      const o = m.path(m.t);
      const b = m.box;
      const nx = m.base.x + o.x, ny = m.base.y + o.y, nz = m.base.z + o.z;
      b.dx = nx - b.x0; b.dy = ny - b.y0; b.dz = nz - b.z0;
      b.x0 = nx; b.y0 = ny; b.z0 = nz; b.x1 = nx + m.size.x; b.y1 = ny + m.size.y; b.z1 = nz + m.size.z;
      m.mesh.position.set(nx, ny, nz);
    }
  }

  L.update = (dt, P) => {
    L.time += dt;
    // caja del sujeto para láseres, cubos y visión
    const pb = P.body, bx = L.playerBox;
    if (P.alive) { bx.x0 = pb.pos.x - pb.hx; bx.x1 = pb.pos.x + pb.hx; bx.y0 = pb.pos.y - pb.hy; bx.y1 = pb.pos.y + pb.hy; bx.z0 = pb.pos.z - pb.hz; bx.z1 = pb.pos.z + pb.hz; bx.on = true; }
    else bx.on = false;
    updateMovers(dt);
    for (const s of L.switches) { if (s.cool > 0) s.cool -= dt; if (s.kind === 'timed' && s.timer > 0) { s.timer -= dt; if (s.timer <= 0) s.active = false; } s.btnMat.emissive.setHex(!s.enabled() ? 0x3a0d10 : s.active ? 0x18c050 : 0x1d4fd0); s.btnMat.color.setHex(!s.enabled() ? 0x6a2228 : s.active ? 0x3fe07a : 0x3b82ff); }
    updateDoors(dt, P);
    for (const f of L.lifts) {
      const on = !!f.on(); if (on !== f.active) { f.active = on; if (on) ctx.sfx.lift(); }
      f.mesh.visible = on; /** @type {any} */ (f.base.material).emissiveIntensity = on ? 1.4 : 0.15;
      if (on) M.tex.field.offset.y = -L.time * 0.6;
    }
    updateCubes(dt, P);
    updateButtons(dt, P);
    traceBeams(dt, P);
    updateTurrets(dt, P);
    updateSpheres(dt, P);
    for (const c of L.crystals) {
      if (c.taken) continue;
      c.mesh.rotation.y += dt * 1.6; c.mesh.position.y = c.y + Math.sin(L.time * 2 + c.x) * 0.08; c.halo.lookAt(ctx.camera.position);
      if (P.alive && Math.hypot(pb.pos.x - c.x, pb.pos.y - c.y, pb.pos.z - c.z) < 1.15) { c.taken = true; c.mesh.visible = false; c.halo.visible = false; ctx.collectCrystal(c); }
    }
    for (const a of L.acids) { M.tex.acid.offset.x = L.time * 0.03; M.tex.acid.offset.y = L.time * 0.02; void a; }
    for (const f of L.fizzlers) /** @type {any} */ (f.mesh.material).opacity = 0.14 + 0.06 * Math.sin(L.time * 7);
    for (const t of triggers) {
      const inside = P.alive && overlaps(pb, t.box);
      if (inside && !t.inside && (!t.once || !t.fired)) { t.fired = true; t.fn(); }
      t.inside = inside;
    }
    for (const fn of L.customs) fn(dt, P);
    if (L.boss) L.boss.update(dt, P);
  };

  /** Interactuable en la mira (pedestales, cubos, torretas por la espalda). */
  const R1 = { kind: '', ref: null, label: '' }, R2 = { kind: '', ref: null, label: '' };
  let rFlip = false;
  const res = (kind, ref, label) => { rFlip = !rFlip; const r = rFlip ? R1 : R2; r.kind = kind; r.ref = ref; r.label = label; return r; };
  L.interactAt = (ex, ey, ez, fx, fy, fz, P) => {
    let best = null, bd = 1e9;
    for (const s of L.switches) {
      const dx = s.x - ex, dy = s.y - 0.1 - ey, dz = s.z - ez, d = Math.hypot(dx, dy, dz);
      if (d > s.r + 0.6) continue;
      const cos = (dx * fx + dy * fy + dz * fz) / d;
      if (cos > 0.6 && d < bd) { best = res('switch', s, s.enabled() ? s.label : s.label + ' (sin energía)'); bd = d; }
    }
    const h = raycast(ex, ey, ez, fx, fy, fz, 2.6, listsAll, c => c.mat === 'trigger' || c.mat === 'player' || c.mat === 'grate' || c.mat === 'field');
    if (h && h.box && h.box.cube && h.box.ref && h.box.ref.alive && h.t < bd) { best = res('cube', h.box.ref, h.box.ref.kind === 'prism' ? 'Agarrar cubo prisma' : 'Agarrar cubo'); bd = h.t; }
    // cubo cercano en el centro de la vista (más fácil en celular)
    if (!best || best.kind !== 'cube') {
      for (const c of L.cubes) {
        if (!c.alive || c.held || c.dissolveT > 0) continue;
        const dx = c.body.pos.x - ex, dy = c.body.pos.y - ey, dz = c.body.pos.z - ez, d = Math.hypot(dx, dy, dz);
        if (d > 2.3 || d >= bd) continue;
        if ((dx * fx + dy * fy + dz * fz) / d > 0.86 && los(ex, ey, ez, c.body.pos.x, c.body.pos.y, c.body.pos.z, c.box)) { best = res('cube', c, c.kind === 'prism' ? 'Agarrar cubo prisma' : 'Agarrar cubo'); bd = d; }
      }
    }
    // torreta: también por proximidad (fácil en celular), sólo desde atrás
    for (const t of L.turrets) {
      if (t.down || t.falling) continue;
      const dx = t.body.pos.x - P.body.pos.x, dz = t.body.pos.z - P.body.pos.z, d = Math.hypot(dx, dz);
      if (d > 1.8) continue;
      const tfx = -Math.sin(t.yaw), tfz = -Math.cos(t.yaw);
      const behind = (-dx * tfx + -dz * tfz) / d < 0.2;
      if (behind && d < bd + 0.5) { best = res('turret', t, 'Empujar torreta'); bd = d; }
    }
    return best;
  };

  L.counts = () => ({
    statics: statics.length, dyn: dyn.length, cubes: L.cubes.filter(c => c.alive).length, turrets: L.turrets.length, turretsUp: L.turrets.filter(t => !t.down).length,
    spheres: L.spheres.length, beams: L.segCount, receptors: L.receptors.filter(r => r.active).length, crystals: L.crystals.filter(c => !c.taken).length,
    lights: L.lights.filter(l => l.visible).length, meshes: L.meshes ? L.meshes.length : 0,
  });

  L.dispose = () => {
    scene.remove(root);
    root.traverse(o => {
      const a = /** @type {any} */ (o);
      if (a.geometry) a.geometry.dispose();
      if (a.material && !Object.values(M).includes(a.material)) a.material.dispose();
    });
  };
  void depenetrate; void rayBox;
  return L;
}
