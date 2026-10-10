// @ts-check
/* Reino del Alba — construcción de escenas: 4 zonas exteriores y 8 interiores separados (sub-escenas).
   Cada escena se arma a demanda (sólo una cargada a la vez), con lo estático fusionado en un draw call,
   vegetación instanciada, colisionadores AABB, puertas con bisagra y estado persistente, cofres, portales y anclas
   para las agendas de los NPC. La lógica de juego (qué hace cada objeto) vive en quests.js vía ctx.act/ctx.label. */
import * as THREE from 'three';
import { GeoBuilder, PAL, oakGeo, pineGeo, deadTreeGeo, wheatGeo, grassGeo, rockGeo, flowerGeo, doorLeafGeo, chestGeos } from './models.js';
import { col, colC, buildNav } from './physics.js';

export const SCENE_NAMES = {
  aldea: 'Aldea del Puente', castillo: 'Castillo del Alba', bosque: 'Bosque de las Runas', campos: 'Campos Dorados',
  herreria: 'Herrería de Bruno', taberna: 'Taberna El Alba', curandera: 'Casa de la Curandera', biblioteca: 'Biblioteca del Reino',
  trono: 'Sala del Trono', torre: 'Torre del Castillo', cueva: 'Cueva del Mineral', mazmorra: 'Mazmorra del Carcelero',
};
/** escena exterior a la que pertenece cada interior */
export const PARENT = { herreria: 'aldea', taberna: 'aldea', curandera: 'aldea', biblioteca: 'aldea', trono: 'castillo', torre: 'castillo', mazmorra: 'castillo', cueva: 'bosque' };
/** zonas vecinas (para que los NPC crucen de zona según su agenda) */
export const LINKS = { aldea: ['castillo', 'bosque', 'campos'], castillo: ['aldea'], bosque: ['aldea'], campos: ['aldea'] };
export const ZONES = ['aldea', 'castillo', 'bosque', 'campos'];

const ENV = {
  aldea: { bg: 0x9fd0ef, fog: 0xbfe0f0, sky: 0xdff1ff, ground: 0x6b8a4a, hemi: 1.15, sun: 0xfff0d0, sunI: 2.1, sunDir: [14, 22, 10], interior: false },
  castillo: { bg: 0xa9cbe6, fog: 0xc6dcea, sky: 0xe4f0ff, ground: 0x7a7a6a, hemi: 1.1, sun: 0xffeccc, sunI: 2.0, sunDir: [-10, 24, 12], interior: false },
  bosque: { bg: 0x51606a, fog: 0x4a5a58, sky: 0xb0c8c0, ground: 0x3a4a2a, hemi: 0.85, sun: 0xd8e0ff, sunI: 1.2, sunDir: [8, 20, -6], interior: false },
  campos: { bg: 0xa8d8f0, fog: 0xe8e0c0, sky: 0xfff4dc, ground: 0x8a7a40, hemi: 1.2, sun: 0xffe2a8, sunI: 2.2, sunDir: [16, 20, 6], interior: false },
  interior: { bg: 0x120c08, fog: 0x120c08, sky: 0xffd8a8, ground: 0x3a2a1a, hemi: 0.9, sun: 0xffd8a8, sunI: 0.9, sunDir: [4, 14, 6], interior: true },
  cueva: { bg: 0x08070c, fog: 0x0c0a12, sky: 0xa8c8e8, ground: 0x4a4050, hemi: 1.25, sun: 0xb0d8ff, sunI: 1.0, sunDir: [2, 14, 4], interior: true },
};

/** Rota un punto local (edificio mirando a +z) al mundo. */
function frame(x, z, facing) {
  const a = { S: 0, E: Math.PI / 2, N: Math.PI, W: -Math.PI / 2 }[facing] ?? 0;
  const c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return {
    a,
    /** @returns {[number, number]} */ p: (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c],
    /** AABB local → mundo */
    rect(lx0, lz0, lx1, lz1) { const [ax, az] = this.p(lx0, lz0), [bx, bz] = this.p(lx1, lz1); return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)]; },
  };
}

/** Escena vacía con utilidades de construcción. */
function newScene(id, kind, envKey, bounds) {
  const group = new THREE.Group(); group.name = 'scene:' + id;
  /** @type {any} */
  const scn = {
    id, kind, name: SCENE_NAMES[id], parent: PARENT[id] || null, env: { ...ENV[envKey] }, group, bounds,
    cols: /** @type {import('./physics.js').Col[]} */ ([]),
    b: new GeoBuilder(id.length * 7 + 3), g: new GeoBuilder(91),
    inters: /** @type {any[]} */ ([]), doors: /** @type {Record<string, any>} */ ({}), chests: /** @type {Record<string, any>} */ ({}),
    spawns: /** @type {Record<string, {x:number,z:number,ry:number}>} */ ({}), portals: /** @type {any[]} */ ([]),
    anchors: /** @type {Record<string, [number, number]>} */ ({}), lights: /** @type {{x:number,y:number,z:number,c:number}[]} */ ([]),
    enemySpawns: /** @type {any[]} */ ([]), map: { rects: /** @type {number[][]} */ ([]), water: /** @type {number[][]} */ ([]), marks: /** @type {any[]} */ ([]) },
    inst: /** @type {Record<string, {geo:THREE.BufferGeometry, solid:number[][], decor:number[][], kind:string}>} */ ({}),
    meshes: /** @type {Record<string, THREE.InstancedMesh>} */ ({}),
    tick: /** @type {((dt:number, t:number)=>void)[]} */ ([]),
    objs: /** @type {Record<string, any>} */ ({}),
    nav: null,
  };
  return scn;
}

/* ---------------- piezas comunes ---------------- */
function addCol(scn, c, mapIt = true) { scn.cols.push(c); if (mapIt && c.h >= 1 && c.tag !== 'water') scn.map.rects.push([c.x0, c.z0, c.x1, c.z1]); return c; }
function ground(scn, color, size = 100) { scn.b.box(0, -0.05, 0, size, 0.1, size, color, 0, 0.02); }
function path(scn, x0, z0, x1, z1, color = PAL.dirt) { scn.b.box((x0 + x1) / 2, 0.012, (z0 + z1) / 2, Math.abs(x1 - x0), 0.02, Math.abs(z1 - z0), color, 0, 0.03); }
function tree(scn, kind, x, z, solid = true, s = 1, ry = 0) {
  const t = scn.inst[kind]; if (!t) return;
  (solid ? t.solid : t.decor).push([x, z, s, ry]);
  if (solid) addCol(scn, colC(x, z, 0.7 * s, 0.7 * s, 3, 'tree'), false);
}
function useInst(scn, kind, geo) { scn.inst[kind] = { geo, solid: [], decor: [], kind }; }
/** límites invisibles de la zona con huecos para los portales */
function perimeter(scn, R, gaps) {
  const g = gaps || {};
  const side = (key, fn) => {
    const gp = g[key];
    if (!gp) { fn(-R - 1, R + 1); return; }
    fn(-R - 1, gp[0]); fn(gp[1], R + 1);
  };
  side('N', (a, b) => addCol(scn, col(a, -R - 1, b, -R, 3, 'bound'), false));
  side('S', (a, b) => addCol(scn, col(a, R, b, R + 1, 3, 'bound'), false));
  side('W', (a, b) => addCol(scn, col(-R - 1, a, -R, b, 3, 'bound'), false));
  side('E', (a, b) => addCol(scn, col(R, a, R + 1, b, 3, 'bound'), false));
  // tapas detrás de los portales (no se sale del mundo)
  for (const k in g) {
    const [a, b] = g[k];
    if (k === 'N') addCol(scn, col(a, -R - 3, b, -R - 2, 3, 'bound'), false);
    if (k === 'S') addCol(scn, col(a, R + 2, b, R + 3, 3, 'bound'), false);
    if (k === 'W') addCol(scn, col(-R - 3, a, -R - 2, b, 3, 'bound'), false);
    if (k === 'E') addCol(scn, col(R + 2, a, R + 3, b, 3, 'bound'), false);
  }
}
function edgePortal(scn, side, a, b, R, to, spawn) {
  const r = side === 'N' ? [a, -R - 2.2, b, -R + 0.6] : side === 'S' ? [a, R - 0.6, b, R + 2.2] : side === 'W' ? [-R - 2.2, a, -R + 0.6, b] : [R - 0.6, a, R + 2.2, b];
  const dir = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[side];
  scn.portals.push({ id: 'edge:' + to, x0: r[0], z0: r[1], x1: r[2], z1: r[3], to, spawn, dir, label: SCENE_NAMES[to] });
  scn.map.marks.push({ kind: 'exit', x: (r[0] + r[2]) / 2, z: (r[1] + r[3]) / 2, label: SCENE_NAMES[to] });
}
function lantern(scn, x, y, z) {
  scn.b.box(x, y + 0.25, z, 0.06, 0.5, 0.06, PAL.ironDark);
  scn.g.box(x, y - 0.1, z, 0.22, 0.28, 0.22, 0xffc260);
  scn.lights.push({ x, y: y - 0.2, z, c: 0xffb050 });
}
function lampPost(scn, x, z) {
  scn.b.cyl(x, 1.4, z, 0.08, 2.8, PAL.ironDark, 6); scn.b.box(x, 0.1, z, 0.4, 0.2, 0.4, PAL.stoneDark);
  scn.g.box(x, 2.95, z, 0.3, 0.36, 0.3, 0xffd27a); scn.b.cone(x, 3.25, z, 0.26, 0.24, PAL.ironDark, 6);
  scn.lights.push({ x, y: 2.8, z, c: 0xffc070 });
  addCol(scn, colC(x, z, 0.3, 0.3, 3, 'post'), false);
}
function torch(scn, x, y, z) { scn.b.box(x, y, z, 0.08, 0.5, 0.08, PAL.woodDark); scn.g.ico(x, y + 0.35, z, 0.14, 0xff9a3a, 1.4); scn.lights.push({ x, y: y + 0.4, z, c: 0xff8a30 }); }
function fence(scn, x0, z0, x1, z1, solid = true) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.6)), ry = -Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i <= n; i++) { const t = i / n; scn.b.box(x0 + (x1 - x0) * t, 0.5, z0 + (z1 - z0) * t, 0.14, 1, 0.14, PAL.woodDark); }
  scn.b.boxR((x0 + x1) / 2, 0.75, (z0 + z1) / 2, len, 0.1, 0.06, PAL.wood, 0, ry, 0); scn.b.boxR((x0 + x1) / 2, 0.4, (z0 + z1) / 2, len, 0.1, 0.06, PAL.wood, 0, ry, 0);
  if (solid) addCol(scn, col(Math.min(x0, x1) - 0.1, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, Math.max(z0, z1) + 0.1, 1, 'fence'));
}
function barrel(scn, x, z, solid = true) { scn.b.cyl(x, 0.45, z, 0.38, 0.9, PAL.woodLight, 8); scn.b.cyl(x, 0.2, z, 0.4, 0.06, PAL.ironDark, 8); scn.b.cyl(x, 0.72, z, 0.4, 0.06, PAL.ironDark, 8); if (solid) addCol(scn, colC(x, z, 0.8, 0.8, 1, 'prop'), false); }
function crate(scn, x, z, s = 0.8, ry = 0) { scn.b.box(x, s / 2, z, s, s, s, PAL.woodLight, ry); scn.b.box(x, s / 2, z, s + 0.02, 0.1, s + 0.02, PAL.wood, ry); addCol(scn, colC(x, z, s, s, 1, 'prop'), false); }

/* ---------------- puertas ---------------- */
/**
 * Puerta con bisagra real: el pivote está en el borde de la hoja; closed → opening → open (y closing → closed).
 * Colisión: la losa del vano está activa mientras no esté abierta; abierta, la hoja ocupa su lugar contra el lateral.
 * @param {any} ctx @param {any} scn
 * @param {{id:string, fr:any, hinge:[number,number], w:number, h:number, iron?:boolean, slab:number[], openCol:number[], label:string, to?:string, spawn?:string, trigger?:number[]}} o
 */
function makeDoor(ctx, scn, o) {
  const fr = o.fr, [hx, hz] = fr.p(o.hinge[0], o.hinge[1]);
  const pivot = new THREE.Group(); pivot.position.set(hx, 0, hz);
  const leaf = new THREE.Mesh(doorLeafGeo(o.w, o.h, o.iron ? 0x4a4e56 : PAL.wood, !!o.iron), ctx.mats.vc); leaf.castShadow = true;
  leaf.position.z = 0; pivot.add(leaf); scn.group.add(pivot);
  const r0 = fr.a, r1 = fr.a + Math.PI / 2;
  const sr = fr.rect(o.slab[0], o.slab[1], o.slab[2], o.slab[3]), orr = fr.rect(o.openCol[0], o.openCol[1], o.openCol[2], o.openCol[3]);
  const slab = addCol(scn, col(sr[0], sr[1], sr[2], sr[3], 3, 'door', o.id), false);
  const openC = addCol(scn, col(orr[0], orr[1], orr[2], orr[3], 2.4, 'doorleaf', o.id), false);
  const saved = ctx.S().doors[o.id];
  const d = {
    id: o.id, label: o.label, to: o.to, spawn: o.spawn, pivot, leaf,
    state: saved === 'open' ? 'open' : 'closed', t: saved === 'open' ? 1 : 0,
    x: 0, z: 0,
    sync() {
      pivot.rotation.y = r0 + (r1 - r0) * (d.t * d.t * (3 - 2 * d.t));
      slab.on = d.state !== 'open';
      openC.on = d.state === 'open';
    },
    /** abre o cierra (devuelve false si está bloqueada) */
    toggle() {
      if (d.state === 'opening' || d.state === 'closing') return true;
      if (d.state === 'closed') {
        const lock = ctx.doorLock(o.id, true);
        if (lock) { ctx.toast(lock, 2600); ctx.sfx.locked(); return false; }
        d.state = 'opening'; ctx.sfx.door(); ctx.emit('doorOpen', o.id);
      } else { d.state = 'closing'; slab.on = true; openC.on = false; ctx.sfx.door(); }
      return true;
    },
    update(dt) {
      if (d.state === 'opening') { d.t = Math.min(1, d.t + dt / 0.55); if (d.t >= 1) { d.state = 'open'; ctx.setDoor(o.id, 'open'); } d.sync(); }
      else if (d.state === 'closing') { d.t = Math.max(0, d.t - dt / 0.55); if (d.t <= 0) { d.state = 'closed'; ctx.setDoor(o.id, 'closed'); } d.sync(); }
    },
  };
  // punto de interacción: frente al centro del vano
  const [ix, iz] = fr.p(o.hinge[0] + o.w / 2, o.hinge[1]);
  d.x = ix; d.z = iz;
  d.sync();
  scn.doors[o.id + (scn.kind === 'interior' ? ':in' : '')] = d;
  scn.inters.push({
    id: 'door:' + o.id, kind: 'door', x: ix, z: iz, y: 1.2, r: 0.9, door: d,
    can: () => d.state !== 'opening' && d.state !== 'closing',
    label: () => d.state === 'open' ? (o.to ? (scn.kind === 'interior' ? o.label : `Entrar · ${o.label}`) : 'Cerrar puerta') : (ctx.doorLock(o.id) ? `🔒 ${o.label}` : `Abrir puerta · ${o.label}`),
    use: () => {
      if (d.state === 'open' && o.to) { ctx.usePortal('door:' + o.id); return; }
      d.toggle();
    },
  });
  if (o.trigger && o.to) {
    const tr = fr.rect(o.trigger[0], o.trigger[1], o.trigger[2], o.trigger[3]);
    scn.portals.push({ id: 'door:' + o.id, x0: tr[0], z0: tr[1], x1: tr[2], z1: tr[3], to: o.to, spawn: o.spawn, door: d, label: o.label });
  }
  scn.tick.push(dt => d.update(dt));
  scn.map.marks.push({ kind: 'door', x: ix, z: iz, label: o.label, id: o.id });
  return d;
}

/** Cofre persistente: locked → closed → opened → looted. Nunca vuelve a dar botín tras recargar. */
function makeChest(ctx, scn, id, x, z, ry, initial) {
  const st = ctx.S().chests[id] || initial;
  const g = chestGeos(initial === 'locked');
  const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry;
  const base = new THREE.Mesh(g.base, ctx.mats.vc), lidP = new THREE.Group(), lid = new THREE.Mesh(g.lid, ctx.mats.vc);
  base.castShadow = lid.castShadow = true;
  lidP.position.set(0, 0.6, -0.33); lid.position.set(0, 0, 0); lidP.add(lid); grp.add(base, lidP); scn.group.add(grp);
  addCol(scn, colC(x, z, Math.abs(Math.cos(ry)) > 0.5 ? 1.0 : 0.7, Math.abs(Math.cos(ry)) > 0.5 ? 0.7 : 1.0, 0.8, 'chest'), false);
  const c = {
    id, state: st, t: st === 'opened' || st === 'looted' ? 1 : 0, anim: false, grp,
    update(dt) { if (c.anim) { c.t = Math.min(1, c.t + dt / 0.5); if (c.t >= 1) c.anim = false; } lidP.rotation.x = -c.t * 1.9; },
  };
  scn.chests[id] = c;
  scn.inters.push({
    id: 'chest:' + id, kind: 'chest', x, z, y: 0.6, r: 0.8,
    label: () => ({ locked: '🔒 Cofre cerrado con llave', closed: 'Abrir cofre', opened: 'Tomar el contenido', looted: 'Cofre vacío' })[c.state],
    can: () => c.state !== 'looted',
    use: () => ctx.chestUse(c),
  });
  scn.tick.push(dt => c.update(dt));
  scn.map.marks.push({ kind: 'chest', x, z, id });
  return c;
}

/**
 * Edificio exterior. Si `interior` está, tiene un vano real con puerta abatible, linterna y portal; si no, la
 * puerta es decorativa (tablones cruzados, sin linterna) y sólo muestra un aviso claro de que no se entra.
 */
function building(ctx, scn, o) {
  const { x, z, w: W, d: D, h: H, facing } = o, fr = frame(x, z, facing), b = scn.b;
  const wall = o.wall ?? PAL.plaster, trim = o.trim ?? PAL.woodDark, roofC = o.roof ?? PAL.roofRed;
  const NW = 1.7, ND = 1.5;
  const bx = (lx0, lz0, lx1, lz1, y0, y1, c) => { const r = fr.rect(lx0, lz0, lx1, lz1); b.box((r[0] + r[2]) / 2, (y0 + y1) / 2, (r[1] + r[3]) / 2, r[2] - r[0], y1 - y0, r[3] - r[1], c); };
  const cl = (lx0, lz0, lx1, lz1, h = H, tag = 'building') => { const r = fr.rect(lx0, lz0, lx1, lz1); return addCol(scn, col(r[0], r[1], r[2], r[3], h, tag)); };
  // zócalo de piedra
  bx(-W / 2 - 0.1, -D / 2 - 0.1, W / 2 + 0.1, D / 2 + 0.1, 0, 0.5, o.base ?? PAL.stoneDark);
  if (o.interior) {
    bx(-W / 2, -D / 2, -NW / 2, D / 2, 0.5, H, wall); bx(NW / 2, -D / 2, W / 2, D / 2, 0.5, H, wall);
    bx(-NW / 2, -D / 2, NW / 2, D / 2 - ND, 0.5, H, wall); bx(-NW / 2, D / 2 - ND, NW / 2, D / 2, 2.55, H, wall);
    // vano oscuro (zaguán)
    bx(-NW / 2 + 0.02, D / 2 - ND, NW / 2 - 0.02, D / 2 - ND + 0.04, 0, 2.55, 0x1e140c);
    bx(-NW / 2, D / 2 - ND, -NW / 2 + 0.03, D / 2, 0, 2.55, 0x2a1c10); bx(NW / 2 - 0.03, D / 2 - ND, NW / 2, D / 2, 0, 2.55, 0x2a1c10);
    bx(-NW / 2, D / 2 - ND, NW / 2, D / 2, 0.0, 0.04, 0x3a2a18);
    // marco
    bx(-NW / 2 - 0.15, D / 2, -NW / 2, D / 2 + 0.12, 0, 2.7, trim); bx(NW / 2, D / 2, NW / 2 + 0.15, D / 2 + 0.12, 0, 2.7, trim); bx(-NW / 2 - 0.15, D / 2, NW / 2 + 0.15, D / 2 + 0.12, 2.55, 2.75, trim);
    cl(-W / 2, -D / 2, -NW / 2, D / 2); cl(NW / 2, -D / 2, W / 2, D / 2); cl(-NW / 2, -D / 2, NW / 2, D / 2 - ND);
    // linterna: indica que se puede entrar
    const [lx, lz] = fr.p(NW / 2 + 0.45, D / 2 + 0.25); lantern(scn, lx, 2.9, lz);
    makeDoor(ctx, scn, {
      id: o.id, fr, hinge: [-0.7, D / 2 - 0.08], w: 1.4, h: 2.45, iron: o.iron, label: o.label, to: o.interior, spawn: 'puerta',
      slab: [-NW / 2, D / 2 - 0.25, NW / 2, D / 2 + 0.05], openCol: [-0.82, D / 2 - 1.45, -0.62, D / 2 - 0.05],
      trigger: [-0.62, D / 2 - ND - 0.2, 0.62, D / 2 - ND + 0.75],
    });
    const [sx, sz] = fr.p(0, D / 2 + 1.9); scn.spawns['puerta:' + o.id] = { x: sx, z: sz, ry: fr.a };
    const [ax, az] = fr.p(0, D / 2 + 1.2); scn.anchors['puerta:' + o.id] = [ax, az];
    // cartel colgante con el color del oficio
    if (o.sign) { const [gx, gz] = fr.p(-NW / 2 - 0.9, D / 2 + 0.35); b.box(gx, 2.6, gz, 0.7, 0.5, 0.06, o.sign, fr.a); b.box(gx, 2.95, gz, 0.04, 0.3, 0.04, PAL.ironDark); }
  } else {
    bx(-W / 2, -D / 2, W / 2, D / 2, 0.5, H, wall);
    // puerta decorativa claramente trabada: tablones cruzados, sin linterna
    bx(-0.6, D / 2, 0.6, D / 2 + 0.08, 0.5, 2.6, 0x6a4a2c);
    const [cx, cz] = fr.p(0, D / 2 + 0.12);
    b.boxR(cx, 1.5, cz, 1.4, 0.16, 0.06, PAL.woodLight, 0, fr.a, 0.9); b.boxR(cx, 1.5, cz, 1.4, 0.16, 0.06, PAL.woodLight, 0, fr.a, -0.9);
    cl(-W / 2, -D / 2, W / 2, D / 2);
    const [ix, iz] = fr.p(0, D / 2 + 0.3);
    scn.inters.push({ id: 'deco:' + o.id, kind: 'deco', x: ix, z: iz, y: 1.2, r: 0.8, label: () => `🚫 ${o.label} (no se puede entrar)`, use: () => ctx.act('deco', o.id) });
  }
  // vigas (entramado)
  if (o.timber !== false) {
    bx(-W / 2 - 0.02, D / 2, W / 2 + 0.02, D / 2 + 0.06, H * 0.55, H * 0.55 + 0.16, trim);
    bx(-W / 2 - 0.06, D / 2 - 0.1, -W / 2 + 0.12, D / 2 + 0.06, 0.5, H, trim); bx(W / 2 - 0.12, D / 2 - 0.1, W / 2 + 0.06, D / 2 + 0.06, 0.5, H, trim);
  }
  // ventanas con luz cálida
  const win = (lx, lz, side) => { const [wx, wz] = fr.p(lx, lz); scn.g.box(wx, 1.75, wz, side ? 0.06 : 0.7, 0.8, side ? 0.7 : 0.06, 0xffd890, 0, 0); b.box(wx, 1.3, wz, side ? 0.16 : 0.9, 0.08, side ? 0.9 : 0.16, trim); };
  if (W >= 6) { win(-W / 2 + 1.2, D / 2 + 0.03, false); win(W / 2 - 1.2, D / 2 + 0.03, false); }
  win(-W / 2 - 0.03, 0, true); win(W / 2 + 0.03, 0, true);
  // techo
  const along = facing === 'E' || facing === 'W';
  const [rx, rz] = fr.p(0, 0);
  b.roof(rx, H, rz, (along ? D : W) + 0.7, (along ? W : D) + 0.9, o.roofH ?? Math.min(3, D * 0.42), roofC, along);
  if (o.chimney) { const [cx, cz] = fr.p(W / 2 - 1, -D / 4); b.box(cx, H + 1.2, cz, 0.7, 2.2, 0.7, PAL.stoneDark); }
}

/** Interior: habitación con paredes, piso, vano en la pared sur con puerta abatible hacia adentro y portal de salida. */
function room(ctx, scn, o) {
  const { w: W, d: D, h: H = 3.2 } = o, b = scn.b, fr = frame(0, 0, 'S');
  const wall = o.wall ?? PAL.plasterWarm, floor = o.floor ?? PAL.woodLight;
  b.box(0, -0.05, 0, W + 1, 0.1, D + 1, floor, 0, 0.03);
  for (let i = -W / 2 + 1; i < W / 2; i += 2) b.box(i, 0.005, 0, 0.04, 0.01, D, 0x7a5432, 0, 0); // tablas
  const t = 0.4;
  const wl = (x0, z0, x1, z1, c = wall) => { b.box((x0 + x1) / 2, H / 2, (z0 + z1) / 2, x1 - x0, H, z1 - z0, c); addCol(scn, col(x0, z0, x1, z1, H, 'wall')); };
  wl(-W / 2 - t, -D / 2 - t, W / 2 + t, -D / 2); // norte
  wl(-W / 2 - t, -D / 2, -W / 2, D / 2 + t); wl(W / 2, -D / 2, W / 2 + t, D / 2 + t); // oeste/este
  wl(-W / 2, D / 2, -0.85, D / 2 + t); wl(0.85, D / 2, W / 2, D / 2 + t); // sur, con vano
  b.box(0, (H + 2.5) / 2, D / 2 + t / 2, 1.7, H - 2.5, t, wall);
  b.box(0, 0.25, -D / 2 + 0.06, W, 0.5, 0.12, o.trim ?? PAL.woodDark); // zócalo
  // remate de las paredes (sin techo: la cámara mira desde arriba)
  b.box(0, H + 0.05, -D / 2 - t / 2, W + 2 * t, 0.1, t + 0.06, o.trim ?? PAL.woodDark); b.box(-W / 2 - t / 2, H + 0.05, 0, t + 0.06, 0.1, D + 2 * t, o.trim ?? PAL.woodDark); b.box(W / 2 + t / 2, H + 0.05, 0, t + 0.06, 0.1, D + 2 * t, o.trim ?? PAL.woodDark);
  // pasillo oscuro tras el vano y tope
  b.box(0, 1.3, D / 2 + 1.4, 1.8, 2.6, 0.1, 0x0a0705);
  addCol(scn, col(-1.2, D / 2 + 1.1, 1.2, D / 2 + 1.5, H, 'bound'), false);
  addCol(scn, col(-1.2, D / 2, -0.85, D / 2 + 1.5, H, 'bound'), false); addCol(scn, col(0.85, D / 2, 1.2, D / 2 + 1.5, H, 'bound'), false);
  const to = PARENT[scn.id];
  if (o.door !== false) {
    makeDoor(ctx, scn, {
      id: o.doorId, fr, hinge: [-0.7, D / 2 + 0.1], w: 1.4, h: 2.45, iron: o.iron, label: 'Salir · ' + SCENE_NAMES[to], to, spawn: 'puerta:' + o.doorId,
      slab: [-0.85, D / 2 - 0.05, 0.85, D / 2 + 0.3], openCol: [-0.82, D / 2 - 1.3, -0.62, D / 2 + 0.1],
      trigger: [-0.7, D / 2 + 0.25, 0.7, D / 2 + 1.2],
    });
  } else {
    scn.portals.push({ id: 'exit:' + scn.id, x0: -0.8, z0: D / 2 + 0.25, x1: 0.8, z1: D / 2 + 1.2, to, spawn: 'puerta:' + o.doorId, label: SCENE_NAMES[to] });
  }
  scn.spawns.puerta = { x: 0, z: D / 2 - 1.6, ry: Math.PI };
  scn.anchors.puerta = [0, D / 2 - 1.4];
  scn.room = { x0: -W / 2 + 0.35, z0: -D / 2 + 0.35, x1: W / 2 - 0.35, z1: D / 2 - 0.35 };
  scn.map.marks.push({ kind: 'exit', x: 0, z: D / 2 + 0.4, label: SCENE_NAMES[to] });
  return { W, D, H };
}

/* ======================= ZONAS ======================= */
function buildAldea(ctx) {
  const R = 40, scn = newScene('aldea', 'zone', 'aldea', { x0: -R, z0: -R, x1: R, z1: R }), b = scn.b, S = ctx.S();
  useInst(scn, 'oak', oakGeo()); useInst(scn, 'pine', pineGeo()); useInst(scn, 'grass', grassGeo()); useInst(scn, 'flower', flowerGeo());
  ground(scn, PAL.grass);
  // caminos
  path(scn, -2, -40, 2, 10); path(scn, -40, -1.8, 40, 1.8); path(scn, -2, 0, 2, 40);
  b.cyl(0, 0.013, 1, 8, 0.02, PAL.stoneLight, 8); // plaza empedrada
  // río y puente principal
  scn.b.box(0, -0.02, -24, 100, 0.02, 6, 0x6a8a5a, 0, 0);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(100, 6), ctx.mats.water); water.rotation.x = -Math.PI / 2; water.position.set(0, 0.04, -24); scn.group.add(water);
  addCol(scn, col(-R, -27, -2.3, -21, 0.3, 'water'), false); addCol(scn, col(2.3, -27, R, -21, 0.3, 'water'), false);
  scn.map.water.push([-R, -27, R, -21]);
  b.box(0, 0.12, -24, 4.6, 0.24, 7.4, PAL.stone); b.box(-2.35, 0.55, -24, 0.3, 0.7, 7.4, PAL.stoneLight); b.box(2.35, 0.55, -24, 0.3, 0.7, 7.4, PAL.stoneLight);
  // Puerta del Puente (se refuerza en la principal C)
  for (const sx of [-1, 1]) { b.box(sx * 3.4, 2.2, -19.5, 2, 4.4, 2, PAL.stone); b.cone(sx * 3.4, 5.0, -19.5, 1.5, 1.4, PAL.roofSlate, 6); addCol(scn, colC(sx * 3.4, -19.5, 2, 2, 4.4, 'wall')); }
  b.box(0, 4.0, -19.5, 4.8, 0.8, 1.6, PAL.stone);
  fence(scn, -40, -19.5, -4.5, -19.5, false); fence(scn, 4.5, -19.5, 40, -19.5, false);
  scn.objs.gateAldea = gateReinforce(ctx, scn, 'puerta_puente', 0, -18.6, 0, 'Puerta del Puente');
  // plaza: pozo y puestos del mercado
  b.cyl(0, 0.5, 0, 1.1, 1, PAL.stone, 8); b.cyl(0, 0.98, 0, 0.9, 0.06, 0x2a4a6a, 8); b.box(-0.9, 1.5, 0, 0.12, 2, 0.12, PAL.wood); b.box(0.9, 1.5, 0, 0.12, 2, 0.12, PAL.wood); b.roof(0, 2.4, 0, 2.4, 1.6, 0.7, PAL.roofRed);
  addCol(scn, colC(0, 0, 2.2, 2.2, 1.2, 'prop'));
  scn.inters.push({ id: 'pozo', kind: 'object', x: 0, z: 1.3, y: 1, r: 1, label: () => ctx.label('pozo'), use: () => ctx.act('pozo') });
  const stall = (x, z, c) => { b.box(x, 0.5, z, 2.6, 1, 1.2, PAL.woodLight); for (const sx of [-1.2, 1.2]) b.box(x + sx, 1.3, z - 0.5, 0.1, 2.6, 0.1, PAL.woodDark); b.boxR(x, 2.6, z, 2.9, 0.08, 1.8, c, 0.25, 0, 0); b.box(x - 0.6, 1.1, z, 0.4, 0.2, 0.4, 0xd04a3a); b.box(x + 0.4, 1.1, z, 0.5, 0.2, 0.4, 0xe8c050); addCol(scn, colC(x, z, 2.6, 1.2, 1, 'prop')); };
  stall(6, 5.5, 0xc0392b); stall(-6, 5.5, 0x2e86c1);
  crate(scn, 8.4, 5.2); barrel(scn, -8.6, 5.6); barrel(scn, 9, 2.6);
  lampPost(scn, 4.5, -3); lampPost(scn, -4.5, -3); lampPost(scn, 0, 12); lampPost(scn, 0, -14);
  // edificios con interior (vano real, linterna)
  building(ctx, scn, { id: 'herreria', label: 'Herrería', interior: 'herreria', x: -13, z: -9, w: 8, d: 7, h: 3.6, facing: 'S', wall: 0xcab79a, roof: PAL.roofSlate, chimney: true, sign: 0x3a3a40 });
  building(ctx, scn, { id: 'taberna', label: 'Taberna El Alba', interior: 'taberna', x: 13, z: -9, w: 9, d: 7, h: 4, facing: 'S', wall: PAL.plaster, roof: PAL.roofRed, chimney: true, sign: 0xb5482f });
  building(ctx, scn, { id: 'curandera', label: 'Casa de la Curandera', interior: 'curandera', x: -13, z: 11, w: 7, d: 6, h: 3.4, facing: 'N', wall: 0xdfe6c8, roof: PAL.roofGreen, sign: 0x4f9a4a });
  building(ctx, scn, { id: 'biblioteca', label: 'Biblioteca', interior: 'biblioteca', x: 13, z: 11, w: 8, d: 7, h: 4.2, facing: 'N', wall: 0xd8d0c0, roof: PAL.roofBlue, sign: 0x3e5f8a });
  // casas decorativas (puertas trabadas, sin prompt de entrar)
  building(ctx, scn, { id: 'casa_perez', label: 'Casa de los Pérez', x: -27, z: -6, w: 6, d: 5, h: 3.2, facing: 'E', roof: PAL.roofRed });
  building(ctx, scn, { id: 'casa_tomas', label: 'Casa de Tomás', x: -27, z: 7, w: 6, d: 5, h: 3.2, facing: 'E', roof: PAL.roofStraw, wall: PAL.plasterWarm });
  building(ctx, scn, { id: 'casa_luna', label: 'Casa de la familia Luna', x: 27, z: -5, w: 6, d: 5, h: 3.2, facing: 'W', roof: PAL.roofGreen });
  building(ctx, scn, { id: 'casa_rio', label: 'Casa del Río', x: 27, z: 8, w: 6, d: 5, h: 3.4, facing: 'W', roof: PAL.roofBlue, wall: PAL.plasterWarm });
  building(ctx, scn, { id: 'casa_sur', label: 'Casa de los Molina', x: 9, z: 24, w: 6, d: 5, h: 3.2, facing: 'W', roof: PAL.roofRed });
  // huerta
  b.box(-22, 0.06, 22, 8, 0.12, 6, 0x6a4a2a);
  for (let i = 0; i < 4; i++) b.box(-22, 0.15, 19.8 + i * 1.5, 7.2, 0.14, 0.5, 0x5a3a20);
  fence(scn, -26.5, 18.5, -17.5, 18.5); fence(scn, -26.5, 25.5, -17.5, 25.5); fence(scn, -26.5, 18.5, -26.5, 25.5);
  scn.objs.huerta = sprouts(ctx, scn, -22, 22, !!S.flags.sembrado);
  scn.inters.push({ id: 'huerta', kind: 'object', x: -17.6, z: 22, y: 0.6, r: 1.2, label: () => ctx.label('huerta'), use: () => ctx.act('huerta') });
  // molino
  b.cyl(24, 3, 24, 2.2, 6, PAL.plaster, 8); b.cone(24, 7, 24, 2.6, 2.2, PAL.roofRed, 8); b.box(24, 1.2, 26.25, 1.2, 2.4, 0.2, PAL.woodDark);
  addCol(scn, colC(24, 24, 4.2, 4.2, 6, 'building'));
  const blades = new THREE.Group(); blades.position.set(24, 5.2, 26.5);
  const bl = new GeoBuilder(77); bl.box(0, 0, 0, 0.5, 0.5, 0.4, PAL.woodDark);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; bl.boxR(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0.1, 4.2, 0.12, 0.08, PAL.wood, 0, 0, a); bl.boxR(Math.cos(a) * 2.6 + Math.cos(a + 1.57) * 0.45, Math.sin(a) * 2.6 + Math.sin(a + 1.57) * 0.45, 0.12, 3.2, 0.8, 0.04, 0xeee6d0, 0, 0, a); }
  const blMesh = new THREE.Mesh(bl.build(), ctx.mats.vc); blMesh.castShadow = true; blades.add(blMesh); scn.group.add(blades);
  if (!S.flags.molino) blades.rotation.z = 0.5;
  scn.objs.blades = blades;
  scn.tick.push(dt => { if (ctx.S().flags.molino) blades.rotation.z += dt * 0.8; });
  scn.inters.push({ id: 'molino', kind: 'object', x: 24, z: 27, y: 1.2, r: 1.2, label: () => ctx.label('molino'), use: () => ctx.act('molino') });
  makeChest(ctx, scn, 'reliquia', 20.5, 26.5, Math.PI / 2, 'locked');
  // árboles y decoración
  const r = ctx.rng(11);
  for (let i = 0; i < 70; i++) { const a = r() * Math.PI * 2, d = 34 + r() * 14; tree(scn, r() < 0.5 ? 'oak' : 'pine', Math.cos(a) * d, Math.sin(a) * d, false, 0.9 + r() * 0.6, r() * 6); }
  for (const [tx, tz] of [[-20, -14], [-6, -15], [6, -15], [20, -15], [-20, 4.5], [20, 4.5], [-8, 18], [16, 19], [-31, 16], [31, -15], [-33, -14], [33, 18], [-4, 30], [5, 33], [-14, 31], [15, 30]]) tree(scn, 'oak', tx, tz, true, 0.9 + r() * 0.3, r() * 6);
  for (let i = 0; i < 260; i++) { const x = (r() - 0.5) * 76, z = (r() - 0.5) * 76; if (Math.abs(x) < 3 || Math.abs(z) < 3 || (z > -28 && z < -20)) continue; (scn.inst.grass.decor).push([x, z, 0.8 + r() * 0.6, r() * 6]); }
  for (let i = 0; i < 60; i++) { const x = (r() - 0.5) * 70, z = (r() - 0.5) * 70; if (Math.abs(x) < 3 || Math.abs(z) < 3 || (z > -28 && z < -20)) continue; scn.inst.flower.decor.push([x, z, 1, r() * 6]); }
  perimeter(scn, R, { N: [-3, 3], E: [-3, 3], S: [-3, 3] });
  edgePortal(scn, 'N', -3, 3, R, 'castillo', 'sur'); edgePortal(scn, 'E', -3, 3, R, 'bosque', 'oeste'); edgePortal(scn, 'S', -3, 3, R, 'campos', 'norte');
  scn.spawns.inicio = { x: 0, z: 6, ry: Math.PI };
  scn.spawns.norte = { x: 0, z: -35, ry: 0 }; scn.spawns.este = { x: 35, z: 0, ry: -Math.PI / 2 }; scn.spawns.sur = { x: 0, z: 35, ry: Math.PI };
  Object.assign(scn.anchors, {
    plaza: [2.5, -1.5], pozo: [-1.6, 2.2], mercado: [6, 3.8], huerta: [-19.5, 20], puente: [4.2, -16.5], molino: [21.5, 21],
    banco: [-5, -3], casaTomas: [-23.5, 7], casaLuna: [-3, 9], calleE: [18, 0], calleO: [-18, 0], calleS: [0, 28], calleN: [0, -30],
  });
  return scn;
}

function buildCastillo(ctx) {
  const R = 40, scn = newScene('castillo', 'zone', 'castillo', { x0: -R, z0: -R, x1: R, z1: R }), b = scn.b;
  useInst(scn, 'oak', oakGeo(0x568f40)); useInst(scn, 'grass', grassGeo()); useInst(scn, 'flower', flowerGeo());
  ground(scn, 0x86a85a);
  path(scn, -2.5, 14, 2.5, 40, PAL.stoneLight); b.box(0, 0.012, -6, 40, 0.02, 44, PAL.stoneLight, 0, 0.02);
  // murallas
  const WH = 5.5, T = 1.6;
  const wseg = (x0, z0, x1, z1) => { b.box((x0 + x1) / 2, WH / 2, (z0 + z1) / 2, x1 - x0, WH, z1 - z0, PAL.stone); addCol(scn, col(x0, z0, x1, z1, WH, 'wall'));
    const horiz = x1 - x0 > z1 - z0, len = horiz ? x1 - x0 : z1 - z0;
    for (let i = 0.6; i < len; i += 1.6) b.box(horiz ? x0 + i : (x0 + x1) / 2, WH + 0.35, horiz ? (z0 + z1) / 2 : z0 + i, horiz ? 0.8 : T, 0.7, horiz ? T : 0.8, PAL.stoneLight); };
  wseg(-22, -30, 22, -30 + T); wseg(-22, -30, -22 + T, 16); wseg(22 - T, -30, 22, 16);
  wseg(-22, 16 - T, -3.2, 16); wseg(3.2, 16 - T, 22, 16);
  for (const [tx, tz] of [[-22, -30], [22, -30], [-22, 16], [22, 16]]) { b.cyl(tx, 4, tz, 2.4, 8, PAL.stone, 8); b.cone(tx, 9.4, tz, 2.9, 2.8, PAL.roofBlue, 8); addCol(scn, colC(tx, tz, 4.4, 4.4, 8, 'wall')); }
  // portón (siempre abierto, se refuerza en la principal C)
  for (const sx of [-1, 1]) { b.box(sx * 3.9, 3.6, 15.2, 1.6, 7.2, 2.4, PAL.stoneLight); addCol(scn, colC(sx * 3.9, 15.2, 1.6, 2.4, 7, 'wall')); }
  b.box(0, 6.4, 15.2, 6.4, 1.6, 2.4, PAL.stoneLight);
  b.box(-2.8, 2.3, 17.2, 0.2, 4.6, 0.2, PAL.woodDark); // hojas abiertas del portón contra el muro
  scn.objs.gateCastillo = gateReinforce(ctx, scn, 'porton', 0, 17.2, 0, 'Portón del castillo');
  lampPost(scn, -4, 20); lampPost(scn, 4, 20);
  // estandartes
  for (const sx of [-8, 8]) { b.box(sx, 4.4, 16.9, 1.2, 2.4, 0.06, PAL.cloth); b.box(sx, 4.9, 16.95, 0.5, 0.5, 0.06, PAL.gold); }
  // patio: fuente
  b.cyl(0, 0.35, -4, 2.6, 0.7, PAL.stoneLight, 8); b.cyl(0, 0.72, -4, 2.3, 0.04, 0x5aa0d0, 8); b.cyl(0, 1.3, -4, 0.3, 1.6, PAL.stone, 6); b.cyl(0, 2.1, -4, 0.8, 0.2, PAL.stone, 8);
  addCol(scn, colC(0, -4, 5, 5, 1, 'prop'));
  // jardín de la reina
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) b.ico(-10 + i * 1.2, 0.35, 8 + j * 1.4, 0.35, [0xe85a8a, 0xf2c14e, 0xb36ae0][(i + j) % 3]);
  b.box(-7.6, 0.2, 8.7, 6.5, 0.3, 3.4, 0x4a7a3a);
  // sala del trono (torreón norte, con interior)
  building(ctx, scn, { id: 'trono', label: 'Sala del Trono', interior: 'trono', x: 0, z: -23.5, w: 14, d: 10, h: 7, facing: 'S', wall: PAL.stoneLight, roof: PAL.roofBlue, base: PAL.stone, timber: false, roofH: 3.6, trim: PAL.stoneDark });
  // torre (bloqueada hasta tener la llave del alba)
  building(ctx, scn, { id: 'torre', label: 'Torre del castillo', interior: 'torre', x: -15.5, z: -8, w: 6, d: 6, h: 9, facing: 'E', wall: PAL.stone, roof: PAL.roofBlue, base: PAL.stoneDark, timber: false, roofH: 3.2, iron: true, trim: PAL.stoneDark });
  // mazmorra (entrada este, reja trabada hasta la principal C)
  building(ctx, scn, { id: 'mazmorra', label: 'Mazmorra', interior: 'mazmorra', x: 15.5, z: -8, w: 6, d: 6, h: 3.6, facing: 'W', wall: PAL.stoneDark, roof: PAL.roofSlate, base: 0x4a4540, timber: false, iron: true, trim: 0x3a3530 });
  // decorativos
  building(ctx, scn, { id: 'cocina', label: 'Cocina del castillo', x: -15, z: 7, w: 6, d: 5, h: 3.4, facing: 'E', wall: PAL.plasterWarm, roof: PAL.roofRed, chimney: true });
  building(ctx, scn, { id: 'guardia_torre', label: 'Cuerpo de guardia', x: 15, z: 7, w: 6, d: 5, h: 3.6, facing: 'W', wall: PAL.stoneLight, roof: PAL.roofSlate, timber: false });
  makeChest(ctx, scn, 'patio', 19.5, 12.5, -Math.PI / 2, 'closed');
  torch(scn, -2, 2.2, -18.2); torch(scn, 2, 2.2, -18.2);
  const r = ctx.rng(21);
  for (let i = 0; i < 46; i++) { const a = r() * Math.PI * 2, d = 32 + r() * 16; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (z > 20 && Math.abs(x) < 6) continue; tree(scn, 'oak', x, z, false, 1 + r() * 0.5, r() * 6); }
  for (const [tx, tz] of [[-10, 26], [10, 27], [-16, 33], [17, 32]]) tree(scn, 'oak', tx, tz, true, 1.1);
  for (let i = 0; i < 160; i++) { const x = (r() - 0.5) * 76, z = 18 + r() * 20; if (Math.abs(x) < 3.5) continue; scn.inst.grass.decor.push([x, z, 0.9, r() * 6]); }
  for (let i = 0; i < 30; i++) scn.inst.flower.decor.push([(r() - 0.5) * 60, 20 + r() * 16, 1, r() * 6]);
  perimeter(scn, R, { S: [-3, 3] });
  edgePortal(scn, 'S', -3, 3, R, 'aldea', 'norte');
  scn.spawns.sur = { x: 0, z: 35, ry: Math.PI };
  Object.assign(scn.anchors, { patio: [4, 5], porton: [4.8, 12.5], fuente: [3.2, -1.5], jardin: [-7.5, 6], ronda: [-12, -16], escalinata: [-3, -15], cuartel: [11, 7] });
  return scn;
}

function buildBosque(ctx) {
  const R = 40, scn = newScene('bosque', 'zone', 'bosque', { x0: -R, z0: -R, x1: R, z1: R }), b = scn.b, S = ctx.S();
  const healed = !!S.flags.altar;
  if (healed) Object.assign(scn.env, { bg: 0x8fc0d8, fog: 0x9ac8c0, sky: 0xe0f4e8, hemi: 1.1, sunI: 1.9, sun: 0xfff0c8 });
  useInst(scn, 'pine', pineGeo(healed ? 0x2e7a45 : 0x24503a)); useInst(scn, 'oak', oakGeo(healed ? 0x4f9a3a : 0x3a5a3a)); useInst(scn, 'dead', deadTreeGeo());
  useInst(scn, 'grass', grassGeo()); useInst(scn, 'rock', rockGeo());
  ground(scn, healed ? 0x5a8a3a : 0x3e5a30);
  path(scn, -40, -1.6, 0, 1.6, 0x7a6a4a); path(scn, -1.6, -30, 1.6, 0, 0x7a6a4a); path(scn, -20, -17, -1, -14.5, 0x7a6a4a); path(scn, 1, -13.5, 20, -11, 0x7a6a4a); path(scn, 4.8, 0, 7.2, 22, 0x7a6a4a); path(scn, -26, 17, -4, 19, 0x7a6a4a);
  // claro y altar
  b.cyl(0, 0.014, 0, 9, 0.02, healed ? 0x7aaa4a : 0x4a6a38, 8);
  b.cyl(0, 0.3, 0, 1.8, 0.6, PAL.stone, 6); b.box(0, 1.0, 0, 1.6, 0.9, 1.0, PAL.stoneLight); b.box(0, 1.5, 0, 2.0, 0.15, 1.3, PAL.stone);
  addCol(scn, colC(0, 0, 3.0, 2.4, 1.4, 'prop'));
  const altarGlow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshBasicMaterial({ color: healed ? 0xfff0a0 : 0x5a3a7a, toneMapped: false }));
  altarGlow.position.set(0, 2.0, 0); scn.group.add(altarGlow); scn.objs.altarGlow = altarGlow;
  scn.tick.push((dt, t) => { altarGlow.rotation.y += dt; altarGlow.position.y = 2.0 + Math.sin(t * 2) * 0.1; });
  scn.inters.push({ id: 'altar', kind: 'object', x: 0, z: 1.6, y: 1.2, r: 1.2, label: () => ctx.label('altar'), use: () => ctx.act('altar') });
  scn.lights.push({ x: 0, y: 2.4, z: 0, c: healed ? 0xfff0a0 : 0xb06aff });
  // tótems
  scn.objs.totems = {};
  [['totem1', -18, -16], ['totem2', 20, -12], ['totem3', 6, 22]].forEach(([id, x, z]) => {
    const tb = new GeoBuilder(61); tb.box(0, 1.2, 0, 0.9, 2.4, 0.9, 0x4a3a30); tb.box(0, 2.6, 0, 1.2, 0.5, 1.2, 0x3a2a24); tb.box(0, 0.15, 0, 1.6, 0.3, 1.6, PAL.stoneDark);
    const m = new THREE.Mesh(tb.build(), ctx.mats.vc); m.position.set(+x, 0, +z); m.castShadow = true; scn.group.add(m);
    const clean = !!ctx.S().flags[id];
    const gm = new THREE.MeshBasicMaterial({ color: clean ? 0x9af0ff : 0xb040ff, toneMapped: false });
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), gm); rune.position.set(+x, 1.4, +z + 0.47); scn.group.add(rune);
    addCol(scn, colC(+x, +z, 1.4, 1.4, 2.6, 'prop'));
    scn.objs.totems[id] = { mesh: m, rune, mat: gm, x: +x, z: +z };
    scn.inters.push({ id, kind: 'object', x: +x, z: +z + 1.2, y: 1.2, r: 1.1, label: () => ctx.label(id), use: () => ctx.act(id) });
    scn.lights.push({ x: +x, y: 1.6, z: +z + 0.8, c: clean ? 0x9af0ff : 0xb040ff });
    scn.anchors[id] = [+x, +z + 2.6];
  });
  // santuario en ruinas con el libro perdido
  for (const [cx, cz] of [[-27, 16], [-23, 16], [-27, 21], [-23, 21]]) { b.cyl(cx, 1.2, cz, 0.35, 2.4, PAL.stoneLight, 6); addCol(scn, colC(cx, cz, 0.7, 0.7, 2.4, 'prop'), false); }
  b.box(-25, 0.4, 18.5, 1.0, 0.8, 0.8, PAL.stone); addCol(scn, colC(-25, 18.5, 1.0, 0.8, 1, 'prop'));
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.38), new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.7 }));
  book.position.set(-25, 0.86, 18.5); book.visible = !S.picked.libro; scn.group.add(book); scn.objs.book = book;
  scn.inters.push({ id: 'libro', kind: 'item', x: -25, z: 19.4, y: 0.9, r: 1, can: () => !ctx.S().picked.libro, label: () => 'Tomar la Crónica del Alba', use: () => ctx.act('libro') });
  // cueva (entrada en un monte rocoso, sin puerta: es un pasaje)
  b.dodec(0, 3, -35, 7, PAL.caveDark, 0.7); b.dodec(-6, 2, -33, 4, PAL.cave, 0.7); b.dodec(6, 2, -33, 4, PAL.cave, 0.7);
  b.box(0, 1.4, -29.7, 2.6, 2.8, 0.3, 0x08060a);
  addCol(scn, col(-11, -40, -1.6, -29, 4)); addCol(scn, col(1.6, -40, 11, -29, 4)); addCol(scn, col(-1.6, -40, 1.6, -30.2, 4, 'bound'), false);
  scn.portals.push({ id: 'cueva', x0: -1.4, z0: -31, x1: 1.4, z1: -29.6, to: 'cueva', spawn: 'puerta', dir: [0, -1], label: 'Cueva del Mineral' });
  scn.map.marks.push({ kind: 'door', x: 0, z: -29.5, label: 'Cueva', id: 'cueva' });
  torch(scn, -2, 1.6, -28.8); torch(scn, 2, 1.6, -28.8);
  scn.spawns.cueva = { x: 0, z: -26.5, ry: 0 };
  // árboles densos (algunos sólidos marcan los senderos)
  const r = ctx.rng(31);
  const near = (x, z) => Math.hypot(x, z) < 11 || (Math.abs(z) < 4 && x < 0) || (Math.abs(x) < 4 && z < 0 && z > -30) || Math.hypot(x + 25, z - 18.5) < 5 ||
    [[-18, -16], [20, -12], [6, 22]].some(([a, c]) => Math.hypot(x - a, z - c) < 5) || (z > -18 && z < -10 && Math.abs(x) < 21) || (x > 3 && x < 9 && z > 0 && z < 23) || (z > 15 && z < 21 && x > -27 && x < 0) || (z < -26 && Math.abs(x) < 12);
  let placed = 0;
  for (let i = 0; i < 900 && placed < 120; i++) {
    const x = (r() - 0.5) * 74, z = (r() - 0.5) * 74; if (near(x, z)) continue;
    const kind = healed ? (r() < 0.6 ? 'pine' : 'oak') : (r() < 0.25 ? 'dead' : r() < 0.7 ? 'pine' : 'oak');
    tree(scn, kind, x, z, true, 0.9 + r() * 0.6, r() * 6); placed++;
  }
  for (let i = 0; i < 80; i++) { const a = r() * Math.PI * 2, d = 38 + r() * 12; tree(scn, 'pine', Math.cos(a) * d, Math.sin(a) * d, false, 1.2 + r() * 0.5, r() * 6); }
  for (let i = 0; i < 30; i++) { const x = (r() - 0.5) * 70, z = (r() - 0.5) * 70; if (near(x, z)) continue; tree(scn, 'rock', x, z, true, 0.8 + r(), r() * 6); }
  for (let i = 0; i < 220; i++) { const x = (r() - 0.5) * 76, z = (r() - 0.5) * 76; scn.inst.grass.decor.push([x, z, 1, r() * 6]); }
  perimeter(scn, R, { W: [-3, 3] });
  edgePortal(scn, 'W', -3, 3, R, 'aldea', 'este');
  scn.spawns.oeste = { x: -35, z: 0, ry: -Math.PI / 2 };
  scn.spawns.claro = { x: 0, z: 7, ry: 0 };
  Object.assign(scn.anchors, { claro: [3, 5], senda: [-20, 0], santuario: [-22, 18.5], cuevaBoca: [3, -25] });
  // enemigos: sombras hasta restaurar el altar
  if (!healed) scn.enemySpawns.push({ kind: 'sombra', x: -12, z: -1 }, { kind: 'sombra', x: 9, z: -14 }, { kind: 'sombra', x: 6, z: 12 }, { kind: 'sombra', x: -16, z: 18 });
  scn.bossSpot = { x: 0, z: -6 };
  return scn;
}

function buildCampos(ctx) {
  const R = 40, scn = newScene('campos', 'zone', 'campos', { x0: -R, z0: -R, x1: R, z1: R }), b = scn.b, S = ctx.S();
  useInst(scn, 'oak', oakGeo(0x6a9a3a)); useInst(scn, 'wheat', wheatGeo()); useInst(scn, 'grass', grassGeo());
  ground(scn, 0x9ab450);
  path(scn, -2, -40, 2, 12); path(scn, -12, 9, 12, 11.4);
  path(scn, 16, 8.5, 40, 11.5, 0xa0805a);
  // río y puente viejo (levadizo)
  b.box(14, -0.02, 0, 6, 0.02, 100, 0x6a8a4a, 0, 0);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4, 100), ctx.mats.water); water.rotation.x = -Math.PI / 2; water.position.set(14, 0.04, 0); scn.group.add(water);
  scn.map.water.push([12, -R, 16, R]);
  addCol(scn, col(12, -R, 16, 8.4, 0.3, 'water'), false); addCol(scn, col(12, 11.6, 16, R, 0.3, 'water'), false);
  const bridgeCol = addCol(scn, col(12, 8.4, 16, 11.6, 0.3, 'water', 'puente_viejo'), false);
  b.box(11.6, 1.2, 8.2, 0.5, 2.4, 0.5, PAL.woodDark); b.box(11.6, 1.2, 11.8, 0.5, 2.4, 0.5, PAL.woodDark); b.box(16.4, 0.6, 8.2, 0.5, 1.2, 0.5, PAL.woodDark); b.box(16.4, 0.6, 11.8, 0.5, 1.2, 0.5, PAL.woodDark);
  addCol(scn, colC(11.6, 8.2, 0.5, 0.5, 2.4, 'prop'), false); addCol(scn, colC(11.6, 11.8, 0.5, 0.5, 2.4, 'prop'), false);
  const deckP = new THREE.Group(); deckP.position.set(11.8, 0.1, 10);
  const db = new GeoBuilder(81); db.box(2.1, 0, 0, 4.2, 0.18, 3.2, PAL.woodLight); for (let i = 0; i < 6; i++) db.box(0.4 + i * 0.7, 0.1, 0, 0.08, 0.04, 3.2, PAL.woodDark);
  const deck = new THREE.Mesh(db.build(), ctx.mats.vc); deck.castShadow = true; deckP.add(deck); scn.group.add(deckP);
  const down = !!S.flags.puente;
  deckP.rotation.z = down ? 0 : 1.35; bridgeCol.on = !down;
  scn.objs.bridge = { deckP, col: bridgeCol, anim: 0 };
  scn.tick.push(dt => { const o = scn.objs.bridge; if (ctx.S().flags.puente && deckP.rotation.z > 0) { deckP.rotation.z = Math.max(0, deckP.rotation.z - dt * 0.9); if (deckP.rotation.z === 0) o.col.on = false; } });
  scn.objs.levers = {};
  [['palanca1', 9.5, 7], ['palanca2', 9.5, 13]].forEach(([id, x, z]) => {
    b.box(+x, 0.3, +z, 0.6, 0.6, 0.6, PAL.stoneDark);
    const p = new THREE.Group(); p.position.set(+x, 0.6, +z);
    const lm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x7a5a32 })); lm.position.y = 0.5; p.add(lm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc0392b })); knob.position.y = 1.0; p.add(knob);
    p.rotation.z = ctx.S().flags[id] ? -0.8 : 0.8; scn.group.add(p);
    addCol(scn, colC(+x, +z, 0.6, 0.6, 1, 'prop'), false);
    scn.objs.levers[id] = p;
    scn.inters.push({ id, kind: 'object', x: +x - 0.9, z: +z, y: 0.9, r: 0.9, label: () => ctx.label(id), use: () => ctx.act(id) });
  });
  // ruta de comercio (otra orilla)
  b.box(30, 0.6, 14, 3.2, 1.2, 1.8, PAL.woodLight); b.cyl(28.8, 0.5, 15.1, 0.5, 0.15, PAL.woodDark, 8); b.cyl(31.2, 0.5, 15.1, 0.5, 0.15, PAL.woodDark, 8);
  b.roof(30, 1.2, 14, 3.4, 2.2, 1.2, 0xe8dcc0); addCol(scn, colC(30, 14, 3.2, 1.8, 2, 'prop'));
  makeChest(ctx, scn, 'ruta', 33, 9, Math.PI, 'closed');
  crate(scn, 27, 13.2); barrel(scn, 33.6, 14.4);
  // establo y casa del campesino (decorativos, cerrados)
  building(ctx, scn, { id: 'establo', label: 'Establo', x: -17, z: 5, w: 8, d: 7, h: 4.2, facing: 'E', wall: 0xa0522d, roof: 0x8a3a24, trim: 0xe8e0d0 });
  building(ctx, scn, { id: 'casa_ramon', label: 'Casa de Ramón', x: -17, z: -14, w: 6, d: 5, h: 3.2, facing: 'E', roof: PAL.roofStraw, wall: PAL.plasterWarm });
  // parvas de heno (la perrita Canela se esconde en una)
  for (const [hx, hz] of [[-11.5, 1.2], [-10.5, 6.2]]) { b.cyl(hx, 0.7, hz, 1.1, 1.4, PAL.roofStraw, 8); b.cone(hx, 1.75, hz, 1.1, 0.7, PAL.roofStraw, 8); addCol(scn, colC(hx, hz, 2, 2, 1.6, 'prop')); }
  scn.inters.push({ id: 'canela', kind: 'object', x: -11.5, z: 2.6, y: 0.6, r: 1, can: () => !ctx.S().flags.canela, label: () => ctx.label('canela'), use: () => ctx.act('canela') });
  scn.anchors.canela = [-11.5, 2.8];
  // corral y animales
  fence(scn, -12, -26, -3, -26); fence(scn, -12, -18, -3, -18); fence(scn, -12, -26, -12, -18); fence(scn, -3, -26, -3, -23);
  scn.animals = [{ kind: 'oveja', x: -9, z: -22 }, { kind: 'oveja', x: -6, z: -20 }, { kind: 'oveja', x: -5, z: -24 }, { kind: 'vaca', x: -10, z: -19.5 }, { kind: 'vaca', x: -7, z: -24.5 }];
  scn.animalPen = { x0: -11.3, z0: -25.3, x1: -3.7, z1: -18.7 };
  // empalizada (tercera puerta de la principal C)
  for (const sx of [-1, 1]) { for (let i = 0; i < 9; i++) b.cyl(sx * (3.2 + i * 0.5), 1.3, -30, 0.24, 2.6, PAL.wood, 6); b.box(sx * 3, 1.8, -30, 0.6, 3.6, 0.6, PAL.woodDark); addCol(scn, col(sx > 0 ? 2.7 : -7.8, -30.3, sx > 0 ? 7.8 : -2.7, -29.7, 2.6, 'wall')); }
  fence(scn, -40, -30, -8, -30, false); fence(scn, 8, -30, 12, -30, false);
  scn.objs.gateCampos = gateReinforce(ctx, scn, 'empalizada', 0, -29, 0, 'Empalizada de los Campos');
  // campos de trigo (instanciados)
  const r = ctx.rng(41);
  const field = (x0, z0, x1, z1) => { b.box((x0 + x1) / 2, 0.02, (z0 + z1) / 2, x1 - x0, 0.04, z1 - z0, 0x8a6a3a, 0, 0.02); for (let x = x0 + 0.4; x < x1; x += 0.8) for (let z = z0 + 0.4; z < z1; z += 0.8) scn.inst.wheat.decor.push([x + (r() - 0.5) * 0.2, z + (r() - 0.5) * 0.2, 0.9 + r() * 0.3, r() * 6]); addCol(scn, col(x0, z0, x1, z1, 0.8, 'field'), false); scn.map.rects.push([x0, z0, x1, z1]); };
  field(-10, -10, -4, -3); field(4, -10, 10, -3); field(-10, 15, -3, 24); field(3, 15, 10, 24); field(18, -24, 30, -12); field(20, 18, 32, 28);
  for (const [tx, tz] of [[-14, -9], [-24, 0], [-24, 16], [20, 0], [24, -6], [36, 2]]) tree(scn, 'oak', tx, tz, true, 1.1);
  for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 36 + r() * 12; tree(scn, 'oak', Math.cos(a) * d, Math.sin(a) * d, false, 1 + r() * 0.5, r() * 6); }
  for (let i = 0; i < 200; i++) scn.inst.grass.decor.push([(r() - 0.5) * 76, (r() - 0.5) * 76, 1, r() * 6]);
  perimeter(scn, R, { N: [-3, 3] });
  edgePortal(scn, 'N', -3, 3, R, 'aldea', 'sur');
  scn.spawns.norte = { x: 0, z: -35, ry: 0 };
  Object.assign(scn.anchors, { campo: [-3, -6.5], arbol: [-13, -7.5], establo: [-12.5, 4.8], corral: [-1.2, -21], ruta: [28, 11], camino: [-6, 9.6] });
  return scn;
}

/* ======================= INTERIORES ======================= */
function buildHerreria(ctx) {
  const scn = newScene('herreria', 'interior', 'interior', { x0: -7, z0: -6, x1: 7, z1: 7 }), b = scn.b;
  room(ctx, scn, { w: 12, d: 10, doorId: 'herreria', wall: 0xb8a890, floor: 0x7a6a5a });
  // fragua
  b.box(3.6, 0.7, -3.8, 3, 1.4, 1.8, PAL.stoneDark); b.box(3.6, 2.6, -4.2, 1.6, 2.4, 1.0, PAL.stone); scn.g.box(3.6, 1.45, -3.6, 2.2, 0.12, 1.2, 0xff7a2a, 0, 0);
  addCol(scn, colC(3.6, -3.8, 3, 1.8, 1.4, 'prop'));
  scn.lights.push({ x: 3.6, y: 2, z: -3, c: 0xff7a2a });
  scn.inters.push({ id: 'fragua', kind: 'object', x: 3.6, z: -2.4, y: 1, r: 1.2, label: () => 'Mirar la fragua', use: () => ctx.act('fragua') });
  // yunque (fabricar la llave)
  b.box(-1.5, 0.3, -1.6, 0.8, 0.6, 0.6, PAL.woodDark); b.box(-1.5, 0.75, -1.6, 1.0, 0.3, 0.45, PAL.ironDark); b.cone(-0.85, 0.78, -1.6, 0.18, 0.4, PAL.ironDark, 6);
  addCol(scn, colC(-1.5, -1.6, 1.1, 0.7, 0.9, 'prop'));
  scn.inters.push({ id: 'yunque', kind: 'object', x: -1.5, z: -0.8, y: 0.9, r: 1.1, label: () => ctx.label('yunque'), use: () => ctx.act('yunque') });
  // herramientas y estantes
  b.box(-5.6, 1.6, -3, 0.2, 1.6, 2.4, PAL.wood); for (let i = 0; i < 4; i++) b.box(-5.4, 1.2 + i * 0.3, -3.9 + i * 0.6, 0.1, 0.6, 0.08, PAL.iron);
  b.box(-4.5, 0.45, 3.4, 2, 0.9, 1, PAL.woodLight); addCol(scn, colC(-4.5, 3.4, 2, 1, 1, 'prop'));
  barrel(scn, 5.2, 3.6); crate(scn, 5, 1.8);
  makeChest(ctx, scn, 'herreria', -4.6, -4.2, 0, 'closed');
  torch(scn, -5.7, 2, 1); torch(scn, 5.7, 2, 0);
  Object.assign(scn.anchors, { yunque: [-1.5, -0.2], fragua: [2.6, -2.2], fuelle: [5.2, -1.6], cama: [-4.6, 1.6], mostrador: [-3, 2.6] });
  return scn;
}
function buildTaberna(ctx) {
  const scn = newScene('taberna', 'interior', 'interior', { x0: -8, z0: -7, x1: 8, z1: 7.5 }), b = scn.b;
  room(ctx, scn, { w: 14, d: 11, doorId: 'taberna', wall: 0xd8c0a0, floor: 0x9a6a40 });
  // barra
  b.box(-1, 0.55, -3.2, 6, 1.1, 0.9, PAL.wood); b.box(-1, 1.12, -3.2, 6.2, 0.08, 1.0, PAL.woodLight); addCol(scn, colC(-1, -3.2, 6, 0.9, 1.1, 'prop'));
  b.box(-1, 1.6, -5.2, 6, 2.2, 0.4, PAL.woodDark); for (let i = 0; i < 8; i++) scn.g.box(-3.6 + i * 0.75, 1.9, -4.95, 0.18, 0.3, 0.18, [0x6ad06a, 0xd06a6a, 0xd0b06a][i % 3], 0, 0);
  barrel(scn, 4.6, -4.2); barrel(scn, 5.6, -4.2); barrel(scn, 5.1, -3.2, true);
  // mesas
  const table = (x, z) => { b.cyl(x, 0.75, z, 0.9, 0.1, PAL.woodLight, 8); b.cyl(x, 0.38, z, 0.12, 0.75, PAL.woodDark, 6); for (let i = 0; i < 3; i++) { const a = i * 2.1; b.cyl(x + Math.cos(a) * 1.25, 0.25, z + Math.sin(a) * 1.25, 0.25, 0.5, PAL.wood, 6); } scn.g.cyl(x + 0.2, 0.9, z, 0.08, 0.2, 0xffe0a0, 6); addCol(scn, colC(x, z, 1.6, 1.6, 0.8, 'prop')); };
  table(-4, 1); table(3.5, 1.5); table(3.8, 4.2);
  // cartel de misiones
  b.box(-6.75, 1.7, 0.5, 0.12, 1.4, 2, PAL.woodDark); for (let i = 0; i < 4; i++) b.box(-6.66, 1.45 + (i % 2) * 0.5, -0.1 + Math.floor(i / 2) * 0.9, 0.04, 0.4, 0.55, 0xf0e6c8, 0, 0);
  scn.inters.push({ id: 'cartel', kind: 'object', x: -5.8, z: 0.5, y: 1.6, r: 1.2, label: () => 'Leer el cartel de misiones', use: () => ctx.act('cartel') });
  scn.g.box(0, 3.0, 0, 0.6, 0.15, 0.6, 0xffd890, 0, 0); scn.lights.push({ x: 0, y: 2.6, z: 0, c: 0xffc070 });
  makeChest(ctx, scn, 'taberna', 6.2, -1.2, -Math.PI / 2, 'closed');
  torch(scn, -6.7, 2, -3); torch(scn, 6.7, 2, 3);
  Object.assign(scn.anchors, { barra: [-1, -2.2], mesa1: [-4, 2.6], mesa2: [3.5, 3], mesa3: [5.6, 3.3], chimenea: [5, -1.5], cartel: [-5.4, 1.8] });
  return scn;
}
function buildCurandera(ctx) {
  const scn = newScene('curandera', 'interior', 'interior', { x0: -6.5, z0: -5.5, x1: 6.5, z1: 6.5 }), b = scn.b, S = ctx.S();
  room(ctx, scn, { w: 11, d: 9, doorId: 'curandera', wall: 0xd8e0c0, floor: 0x8a7a5a });
  // caldero
  b.cyl(0, 0.45, -2, 0.75, 0.9, PAL.ironDark, 8); b.cyl(0, 0.92, -2, 0.62, 0.05, 0x6ad06a, 8); scn.g.cyl(0, 0.94, -2, 0.55, 0.02, 0x8af08a, 8);
  b.box(0, 0.08, -2, 1.6, 0.16, 1.6, PAL.stoneDark); addCol(scn, colC(0, -2, 1.6, 1.6, 1, 'prop'));
  scn.lights.push({ x: 0, y: 1.4, z: -2, c: 0x8af08a });
  scn.inters.push({ id: 'caldero', kind: 'object', x: 0, z: -0.8, y: 0.9, r: 1.1, label: () => ctx.label('caldero'), use: () => ctx.act('caldero') });
  // estantes con frascos
  b.box(-4.8, 1.4, -3.6, 1.2, 2.8, 0.5, PAL.wood); for (let i = 0; i < 9; i++) scn.g.box(-5.2 + (i % 3) * 0.4, 0.8 + Math.floor(i / 3) * 0.8, -3.4, 0.16, 0.3, 0.16, [0xa0f0a0, 0xf0a0d0, 0xa0d0f0][i % 3], 0, 0);
  addCol(scn, colC(-4.8, -3.6, 1.2, 0.6, 2.8, 'prop'));
  // receta en atril
  b.box(3.8, 0.5, -3.2, 0.5, 1.0, 0.5, PAL.woodDark); b.boxR(3.8, 1.05, -3.2, 0.8, 0.06, 0.6, 0xf0e6c8, -0.4, 0, 0); addCol(scn, colC(3.8, -3.2, 0.6, 0.6, 1, 'prop'));
  scn.inters.push({ id: 'receta', kind: 'object', x: 3.8, z: -2.2, y: 1, r: 1, label: () => 'Leer la receta', use: () => ctx.act('receta') });
  // hierbas recolectables (persistentes)
  scn.objs.herbs = {};
  [['hierba1', -4.6, 2.4], ['hierba2', 4.6, 2.2], ['hierba3', 4.4, 0]].forEach(([id, x, z]) => {
    b.cyl(+x, 0.3, +z, 0.4, 0.6, 0xa0603a, 8);
    const hb = new GeoBuilder(71); hb.ico(0, 0.9, 0, 0.35, 0x5ac05a, 1.2); hb.ico(0.15, 1.1, 0.1, 0.18, 0xe8f06a);
    const m = new THREE.Mesh(hb.build(), ctx.mats.vc); m.position.set(+x, 0, +z); m.visible = !S.picked[id]; scn.group.add(m);
    addCol(scn, colC(+x, +z, 0.8, 0.8, 0.6, 'prop'), false);
    scn.objs.herbs[id] = m;
    scn.inters.push({ id, kind: 'item', x: +x, z: +z + (z > 1 ? -0.9 : 0), y: 0.9, r: 0.9, can: () => !ctx.S().picked[id], label: () => 'Recolectar hierba de alba', use: () => ctx.act('hierba', id) });
  });
  b.box(-4.6, 0.3, -0.4, 1.6, 0.6, 0.9, 0xe0d0b0); // camastro
  torch(scn, -5.2, 2, 0.8); torch(scn, 5.2, 2, -1);
  Object.assign(scn.anchors, { caldero: [0, -0.6], estante: [-3.8, -2.4], receta: [2.8, -2.4], cama: [-3.2, 0.8] });
  return scn;
}
function buildBiblioteca(ctx) {
  const scn = newScene('biblioteca', 'interior', 'interior', { x0: -7.5, z0: -6.5, x1: 7.5, z1: 7 }), b = scn.b;
  room(ctx, scn, { w: 13, d: 11, h: 3.8, doorId: 'biblioteca', wall: 0xc8c0b0, floor: 0x6a4a30 });
  // estantes (pared norte y laterales)
  const shelf = (x, z, w, d) => { b.box(x, 1.5, z, w, 3, d, PAL.woodDark); for (let k = 0; k < 4; k++) for (let i = 0; i < Math.round(Math.max(w, d) * 3); i++) { const t = -Math.max(w, d) / 2 + 0.2 + i * 0.33; const c = [0x8a2a2a, 0x2a4a8a, 0x3a6a2a, 0x8a6a2a, 0x5a2a6a][(i * 3 + k) % 5]; if (w > d) b.box(x + t, 0.45 + k * 0.72, z + d / 2 - 0.05, 0.2, 0.5, 0.06, c, 0, 0.1); else b.box(x + d / 2 - 0.05, 0.45 + k * 0.72, z + t, 0.06, 0.5, 0.2, c, 0, 0.1); } addCol(scn, colC(x, z, w, d, 3, 'prop')); };
  shelf(-3.5, -5.1, 5, 0.6); shelf(3.5, -5.1, 5, 0.6); shelf(-6.1, 0, 0.6, 5); shelf(-2.5, 2.2, 3, 0.6); shelf(3.2, 2.2, 3, 0.6);
  scn.inters.push({ id: 'estante', kind: 'object', x: -3.5, z: -3.9, y: 1.4, r: 1.2, label: () => 'Hojear los estantes', use: () => ctx.act('estante') });
  // atril de lectura (pista de la reliquia)
  b.box(0, 0.5, -1.6, 0.6, 1.0, 0.6, PAL.woodDark); b.boxR(0, 1.05, -1.6, 0.9, 0.06, 0.6, 0xf0e6c8, -0.4, 0, 0); addCol(scn, colC(0, -1.6, 0.8, 0.7, 1, 'prop'));
  scn.inters.push({ id: 'atril', kind: 'object', x: 0, z: -0.6, y: 1, r: 1, label: () => ctx.label('atril'), use: () => ctx.act('atril') });
  b.cyl(5, 0.75, -1, 0.9, 0.08, PAL.woodLight, 8); b.cyl(5, 0.38, -1, 0.12, 0.75, PAL.woodDark, 6); addCol(scn, colC(5, -1, 1.6, 1.6, 0.8, 'prop'));
  makeChest(ctx, scn, 'biblioteca', 5.4, -3.6, 0, 'locked');
  scn.g.box(5, 0.95, -1, 0.15, 0.2, 0.15, 0xffe0a0, 0, 0); scn.lights.push({ x: 0, y: 2.8, z: 0, c: 0xffd8a0 });
  torch(scn, 6.2, 2.2, 2);
  Object.assign(scn.anchors, { atril: [0.9, -0.6], estantes: [2.2, -4.0], mesa: [5, 0.4], pasillo: [-1, 3.6] });
  return scn;
}
function buildTrono(ctx) {
  const scn = newScene('trono', 'interior', 'interior', { x0: -9, z0: -12.5, x1: 9, z1: 12.5 }), b = scn.b;
  room(ctx, scn, { w: 16, d: 22, h: 5.5, doorId: 'trono', wall: PAL.stoneLight, floor: 0x9a948a, trim: PAL.stone });
  b.box(0, 0.02, 0, 3, 0.03, 20, PAL.cloth, 0, 0); // alfombra
  b.box(0, 0.3, -9, 7, 0.6, 3.5, PAL.stone); b.box(0, 0.7, -9.5, 5, 0.2, 2.5, PAL.stoneLight); addCol(scn, col(-3.5, -11, 3.5, -7.6, 0.4, 'dais'), false);
  b.box(-0.9, 1.3, -10, 1.4, 1.2, 1.1, PAL.gold); b.box(-0.9, 2.4, -10.5, 1.4, 2, 0.3, PAL.cloth); b.box(0.9, 1.3, -10, 1.4, 1.2, 1.1, PAL.gold); b.box(0.9, 2.2, -10.5, 1.2, 1.6, 0.3, 0x7a3a8a);
  addCol(scn, col(-1.7, -10.7, 1.7, -9.4, 2, 'prop'));
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const z = -6 + i * 4.5; b.cyl(sx * 5, 2.75, z, 0.5, 5.5, PAL.stone, 8); addCol(scn, colC(sx * 5, z, 1, 1, 5.5, 'prop')); torch(scn, sx * 4.4, 2.4, z); }
  for (const sx of [-1, 1]) { b.box(sx * 7.75, 3.2, -6, 0.06, 3, 1.4, PAL.cloth); b.box(sx * 7.75, 3.5, -6, 0.07, 0.7, 0.7, PAL.gold); }
  scn.lights.push({ x: 0, y: 4, z: -8, c: 0xffe0b0 });
  Object.assign(scn.anchors, { trono: [-0.9, -8.7], reina: [0.9, -8.7], guardiaI: [-3.2, -6.4], guardiaD: [3.2, -6.4], capitan: [-2.4, -3], alfombra: [1.4, 3], galeria: [-6.5, 6], entrada: [2.2, 8.8] });
  scn.spawns.puerta = { x: 0, z: 9.4, ry: Math.PI };
  return scn;
}
function buildTorre(ctx) {
  const scn = newScene('torre', 'interior', 'interior', { x0: -6, z0: -6, x1: 6, z1: 6.5 }), b = scn.b, S = ctx.S();
  room(ctx, scn, { w: 10, d: 10, h: 4.5, doorId: 'torre', iron: true, wall: PAL.stone, floor: PAL.stoneDark, trim: PAL.stoneDark });
  // escalera decorativa
  for (let i = 0; i < 6; i++) b.box(4.2, 0.2 + i * 0.4, 3.5 - i * 0.8, 1.4, 0.4 + i * 0.8, 0.8, PAL.stone);
  addCol(scn, col(3.5, -1.3, 5, 4, 3, 'prop'));
  // celda con barrotes (se levantan al resolver el cerrojo)
  b.box(-2.5, 0.04, -3.4, 5, 0.06, 3, 0x4a4540);
  const bars = new THREE.Group(); bars.position.set(-2.5, 0, -1.9);
  const bb = new GeoBuilder(91); for (let i = 0; i < 11; i++) bb.box(-2.4 + i * 0.48, 1.6, 0, 0.1, 3.2, 0.1, PAL.ironDark); bb.box(0, 3.1, 0, 5, 0.16, 0.16, PAL.ironDark); bb.box(0, 0.6, 0, 5, 0.12, 0.12, PAL.ironDark);
  bars.add(new THREE.Mesh(bb.build(), ctx.mats.vc)); scn.group.add(bars);
  const open = !!S.flags.celda;
  const barCol = addCol(scn, col(-5, -2.05, 0.05, -1.75, 3, 'bars'), false);
  barCol.on = !open; bars.position.y = open ? 2.9 : 0;
  scn.objs.cell = { bars, col: barCol };
  scn.tick.push(dt => { if (ctx.S().flags.celda && bars.position.y < 2.9) { bars.position.y = Math.min(2.9, bars.position.y + dt * 1.8); if (bars.position.y > 2) barCol.on = false; } });
  addCol(scn, col(0.05, -5, 0.4, -1.75, 3, 'wall'));
  b.box(0.22, 1.5, -3.4, 0.35, 3, 3.3, PAL.stone);
  // cerrojo rúnico de tres discos (puzzle de la llave)
  scn.objs.dials = {};
  ['dial1', 'dial2', 'dial3'].forEach((id, i) => {
    const x = 1.4 + i * 0.9, z = -1.6;
    b.box(x, 0.6, z, 0.5, 1.2, 0.4, PAL.stoneDark);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.5, roughness: 0.4, flatShading: true }));
    disc.rotation.x = Math.PI / 2; disc.position.set(x, 1.4, z + 0.05); scn.group.add(disc);
    const sym = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); sym.position.set(x, 1.4, z + 0.12); scn.group.add(sym);
    scn.objs.dials[id] = { disc, sym };
    addCol(scn, colC(x, z, 0.5, 0.4, 1.2, 'prop'), false);
    scn.inters.push({ id, kind: 'object', x, z: z + 0.9, y: 1.3, r: 0.4, label: () => ctx.label(id), use: () => ctx.act('dial', id) });
  });
  makeChest(ctx, scn, 'torre', 4, -4.2, 0, 'locked');
  torch(scn, -4.7, 2.2, 1.5); torch(scn, 4.7, 2.2, -2);
  Object.assign(scn.anchors, { celda: [-2.5, -3.6], fuera: [-1.5, 1.0], cerrojo: [2.3, 0], escalera: [3, 3] });
  return scn;
}
function buildCueva(ctx) {
  const scn = newScene('cueva', 'interior', 'cueva', { x0: -15, z0: -15, x1: 15, z1: 15.5 }), b = scn.b, S = ctx.S();
  b.box(0, -0.05, 0, 32, 0.1, 32, PAL.caveDark, 0, 0.05);
  const wallR = (x0, z0, x1, z1) => { const r = ctx.rng(Math.round(x0 * 7 + z0)); const n = Math.max(2, Math.round(Math.max(x1 - x0, z1 - z0) / 2.2)); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; b.dodec(x0 + (x1 - x0) * t, 1.4, z0 + (z1 - z0) * t, 1.7 + r() * 0.6, i % 2 ? PAL.cave : PAL.caveDark, 1.4); } addCol(scn, col(x0 - 0.6, z0 - 0.6, x1 + 0.6, z1 + 0.6, 4, 'wall')); };
  wallR(-14, -14, 14, -14); wallR(-14, -14, -14, 14); wallR(14, -14, 14, 14); wallR(-14, 14, -3, 14); wallR(3, 14, 14, 14);
  // pilares interiores
  for (const [px, pz, s] of [[-6, -4, 1.6], [5, 2, 1.4], [-3, 6, 1.2], [7, -7, 1.3], [-8, 8, 1.1]]) { b.dodec(px, 1.6, pz, s, PAL.cave, 1.6); addCol(scn, colC(px, pz, s * 1.5, s * 1.5, 4, 'wall')); }
  // vetas de mineral (3)
  scn.objs.ores = {};
  [['mena1', -11, 5], ['mena2', 10, 8], ['mena3', 2, -11]].forEach(([id, x, z]) => {
    b.dodec(+x, 0.8, +z, 1.0, PAL.caveDark);
    const om = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0xffb84a, toneMapped: false }));
    om.position.set(+x + (x < 0 ? 0.6 : -0.6), 1.2, +z + (z < 0 ? 0.6 : -0.6)); om.visible = !S.picked[id]; scn.group.add(om);
    addCol(scn, colC(+x, +z, 1.6, 1.6, 1.6, 'prop'));
    scn.objs.ores[id] = om;
    scn.lights.push({ x: om.position.x, y: 1.4, z: om.position.z, c: 0xffb84a });
    const ix = +x + (x < 0 ? 1.6 : -1.6), iz = +z + (z < 0 ? 1.6 : -1.6);
    scn.inters.push({ id, kind: 'item', x: ix, z: iz, y: 1, r: 1, can: () => !ctx.S().picked[id], label: () => 'Picar mineral del alba', use: () => ctx.act('mena', id) });
  });
  // cristales luminosos
  for (const [cx, cz] of [[-12, -10], [12, -12], [-12, 12], [11, 12], [0, 0]]) { scn.g.cone(cx, 0.6, cz, 0.3, 1.2, 0x8af0ff); scn.lights.push({ x: cx, y: 1, z: cz, c: 0x7ad0ff }); }
  makeChest(ctx, scn, 'cueva', -11.5, -11, Math.PI / 4, 'closed');
  scn.portals.push({ id: 'exit:cueva', x0: -2.5, z0: 14.3, x1: 2.5, z1: 16.2, to: 'bosque', spawn: 'cueva', dir: [0, 1], label: 'Bosque de las Runas' });
  addCol(scn, col(-3, 16.2, 3, 17, 4, 'bound'), false); addCol(scn, col(-3.4, 14, -2.4, 17, 4, 'bound'), false); addCol(scn, col(2.4, 14, 3.4, 17, 4, 'bound'), false);
  scn.map.marks.push({ kind: 'exit', x: 0, z: 14.5, label: 'Bosque' });
  scn.spawns.puerta = { x: 0, z: 11.5, ry: Math.PI };
  scn.anchors.puerta = [0, 11];
  scn.room = { x0: -12.5, z0: -12.5, x1: 12.5, z1: 13.2 };
  scn.enemySpawns.push({ kind: 'sombra', x: -5, z: 0 }, { kind: 'sombra', x: 8, z: -2 });
  if (!S.flags.golem) scn.enemySpawns.push({ kind: 'golem', x: 3, z: -7 });
  return scn;
}
function buildMazmorra(ctx) {
  const scn = newScene('mazmorra', 'interior', 'cueva', { x0: -10, z0: -10, x1: 10, z1: 11 }), b = scn.b;
  room(ctx, scn, { w: 18, d: 18, h: 4.2, doorId: 'mazmorra', iron: true, wall: 0x6a645c, floor: 0x4a4540, trim: 0x3a3530 });
  for (let i = 0; i < 4; i++) { const x = -6.75 + i * 4.5; for (let j = 0; j < 7; j++) b.box(x - 1.6 + j * 0.5, 1.5, -7.4, 0.08, 3, 0.08, PAL.ironDark); b.box(x, 0.02, -8.2, 4, 0.04, 1.6, 0x3a3530); }
  addCol(scn, col(-9, -9, 9, -7.3, 3, 'bars'));
  for (const [px, pz] of [[-5, -2], [5, -2], [-5, 4], [5, 4]]) { b.box(px, 2.1, pz, 0.9, 4.2, 0.9, PAL.stoneDark); addCol(scn, colC(px, pz, 0.9, 0.9, 4.2, 'prop')); torch(scn, px, 2.3, pz + 0.55); }
  for (let i = 0; i < 6; i++) b.boxR(-8 + i * 3.2, 3.6, -6, 0.06, 1.2, 0.06, PAL.iron, 0.2, 0, 0.3);
  scn.lights.push({ x: 0, y: 3, z: 0, c: 0xff6a3a });
  scn.bossSpot = { x: 0, z: -3 };
  Object.assign(scn.anchors, { centro: [0, 1], aliado1: [-3, 6.5], aliado2: [3, 6.5], aliado3: [0, 7.4] });
  return scn;
}

/** Refuerzo de puerta (principal C): tablones y planchas de hierro que aparecen al reforzar. */
function gateReinforce(ctx, scn, id, x, z, ry, label) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
  const bb = new GeoBuilder(101);
  for (const sx of [-1, 1]) { bb.box(sx * 2.4, 1.4, 0, 0.6, 2.8, 0.5, PAL.woodDark); bb.box(sx * 2.4, 1.0, 0.3, 0.7, 0.3, 0.12, PAL.ironDark); bb.box(sx * 2.4, 2.0, 0.3, 0.7, 0.3, 0.12, PAL.ironDark); }
  bb.box(0, 3.0, 0, 5.4, 0.3, 0.4, PAL.woodDark);
  const m = new THREE.Mesh(bb.build(), ctx.mats.vc); g.add(m); scn.group.add(g);
  g.visible = !!(ctx.S().flags.gates || {})[id];
  scn.inters.push({ id: 'gate:' + id, kind: 'object', x: x + 1.6, z: z + 0.9, y: 1.2, r: 1.0, can: () => ctx.gateUsable(id), label: () => ctx.label('gate', id), use: () => ctx.act('gate', id) });
  scn.map.marks.push({ kind: 'gate', x, z, id });
  return { group: g, label };
}
/** Brotes en la huerta (aparecen al sembrar). */
function sprouts(ctx, scn, x, z, on) {
  const bb = new GeoBuilder(111);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { bb.box(x - 3 + j * 1.2, 0.35, z - 2.2 + i * 1.5, 0.08, 0.4, 0.08, PAL.grassDark); bb.ico(x - 3 + j * 1.2, 0.6, z - 2.2 + i * 1.5, 0.2, 0x5ac05a); }
  const m = new THREE.Mesh(bb.build(), ctx.mats.vc); m.visible = on; scn.group.add(m);
  return m;
}

const BUILDERS = { aldea: buildAldea, castillo: buildCastillo, bosque: buildBosque, campos: buildCampos, herreria: buildHerreria, taberna: buildTaberna, curandera: buildCurandera, biblioteca: buildBiblioteca, trono: buildTrono, torre: buildTorre, cueva: buildCueva, mazmorra: buildMazmorra };

/**
 * Construye una escena completa: fusiona lo estático, instancia la vegetación y arma la grilla de navegación.
 * @param {string} id @param {any} ctx
 */
export function buildScene(id, ctx) {
  const t0 = performance.now();
  const scn = BUILDERS[id](ctx);
  const st = new THREE.Mesh(scn.b.build(), ctx.mats.vc); st.receiveShadow = true; st.castShadow = true; st.name = 'static'; scn.group.add(st);
  if (!scn.g.empty) { const gm = new THREE.Mesh(scn.g.build(), ctx.mats.glow); gm.name = 'glow'; scn.group.add(gm); }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const k in scn.inst) {
    const t = scn.inst[k], all = t.solid.concat(t.decor);
    if (!all.length) { t.geo.dispose(); continue; }
    const im = new THREE.InstancedMesh(t.geo, ctx.mats.vc, all.length);
    all.forEach((a, i) => { e.set(0, a[3], 0); q.setFromEuler(e); m4.compose(p.set(a[0], 0, a[1]), q, s.set(a[2], a[2], a[2])); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.castShadow = k !== 'grass' && k !== 'wheat' && k !== 'flower'; im.receiveShadow = false;
    im.computeBoundingSphere();
    im.userData = { solid: t.solid.length, decor: t.decor.length, kind: k };
    scn.meshes[k] = im; scn.group.add(im);
  }
  const bd = scn.bounds, cell = scn.kind === 'zone' ? 1 : 0.5;
  scn.nav = buildNav(scn.cols.filter(c => c.tag !== 'door' && c.tag !== 'doorleaf'), { x0: bd.x0 - 1, z0: bd.z0 - 1, x1: bd.x1 + 1, z1: bd.z1 + 1 }, cell, 0.4);
  scn.buildMs = performance.now() - t0;
  return scn;
}

/** Ajusta la densidad de vegetación por calidad (sin tocar los árboles con colisión). */
export function applySceneQuality(scn, q) {
  for (const k in scn.meshes) {
    const im = scn.meshes[k], u = im.userData;
    const f = k === 'grass' || k === 'flower' ? q.grass : k === 'wheat' ? Math.max(0.5, q.trees) : q.trees;
    im.count = u.solid + Math.floor(u.decor * f);
    im.visible = im.count > 0;
  }
}
