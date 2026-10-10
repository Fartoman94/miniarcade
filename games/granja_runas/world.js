// @ts-check
/* Granja de Runas — los tres escenarios (granja, mercado del pueblo, bosque de semillas raras).
   Cada escenario es un THREE.Group con: colisionadores (círculos), límites, salidas y "anclas"
   (posiciones y mallas que la lógica del juego usa para sus interacciones). */
import * as THREE from 'three';
import { rng } from '../../matelabs/kit3d.js';
import * as M from './models.js';

const { Builder, MAT, C, mesh } = M;

/** Suelo low-poly pintado por vértice (caminos, variación) y con lomas fuera del área jugable. */
function makeGround(size, seg, bounds, paint, seed) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, r = rng(seed), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const out = Math.max(bounds.x0 - x, x - bounds.x1, bounds.z0 - z, z - bounds.z1, 0);
    pos.setY(i, out > 0 ? Math.min(6, out * 0.35) * (0.6 + r() * 0.8) : 0);
  }
  const ng = g.toNonIndexed(); g.dispose();
  const p2 = ng.attributes.position, col = new Float32Array(p2.count * 3);
  for (let i = 0; i < p2.count; i += 3) {
    const cx = (p2.getX(i) + p2.getX(i + 1) + p2.getX(i + 2)) / 3, cz = (p2.getZ(i) + p2.getZ(i + 1) + p2.getZ(i + 2)) / 3;
    c.set(paint(cx, cz, r()));
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (ng.getAttribute('uv')) ng.deleteAttribute('uv');
  ng.computeVertexNormals();
  const m = new THREE.Mesh(ng, MAT.ground); m.receiveShadow = true;
  return m;
}
/** distancia de un punto a un segmento */
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function pathPaint(paths, grassA, grassB, dirt, width = 1.3) {
  return (x, z, rr) => {
    for (const p of paths) for (let i = 0; i < p.length - 1; i++) { const d = segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]); if (d < width) return d < width * 0.6 || rr < 0.5 ? dirt : grassB; }
    return rr < 0.5 ? grassA : grassB;
  };
}

/** InstancedMesh a partir de una lista de transformaciones (x,z,rotY,escala). Orden barajado para poder recortar por calidad. */
function instanced(geo, mat, list, seed, cast = true) {
  const r = rng(seed);
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const o = new THREE.Object3D();
  list.forEach((t, i) => { o.position.set(t[0], t[4] || 0, t[1]); o.rotation.set(0, t[2] || 0, 0); o.scale.setScalar(t[3] || 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  im.count = list.length; im.userData.total = list.length;
  im.castShadow = cast; im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}
/** Disperso determinista evitando zonas. */
function scatter(seed, n, x0, x1, z0, z1, avoid) {
  const r = rng(seed), out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    if (avoid(x, z)) continue;
    out.push([x, z, r() * Math.PI * 2, 0.75 + r() * 0.6]);
  }
  return out;
}
function fenceLine(list, ax, az, bx, bz) {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2)), rot = -Math.atan2(bz - az, bx - ax);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; list.push([ax + (bx - ax) * t, az + (bz - az) * t, rot, 1]); }
}

/** @typedef {{x:number,z:number,r:number}} Circle */
/** @typedef {{name:string, title:string, group:THREE.Group, colliders:Circle[], bounds:{x0:number,x1:number,z0:number,z1:number}, exits:{x:number,z:number,r:number,to:string,label:string}[], spawn:Record<string,number[]>, flora:THREE.InstancedMesh[], anchors:any, fog:number, anim:(t:number,dt:number,night:number)=>void}} SceneDef */

/* ============================== GRANJA ============================== */
export const PLOT_POS = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) PLOT_POS.push([-9.6 + c * 2.6, -2 + r * 2.6]);
export const GREEN_POS = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) GREEN_POS.push([-8.2 + c * 2.2, -13.1 + r * 2.2]);
export const DECOR_POS = [[-12.8, 0.6], [1.0, 5.6], [2.6, -8.4], [10.2, -8.6]];
export const STORM_POS = {
  bells: [[-13.4, -4.6], [-8.6, 7.0], [1.9, -4.8]],
  rods: [[-13.2, -1.6], [-5.7, -5.0], [-3.2, 6.6]],
  gates: [[-12.6, 3.4], [1.4, 3.4]],
};

/** @returns {SceneDef} */
export function buildFarm() {
  const group = new THREE.Group(); group.name = 'granja';
  const bounds = { x0: -24, x1: 24, z0: -20, z1: 22 };
  const paths = [[[0, 24], [0, 10], [4, 4], [6, -8.5]], [[0, 10], [-6, 7.5], [-23, 6], [-30, 6]], [[4, 4], [14, 2]], [[-6, 7.5], [-6, -8.6]]];
  group.add(makeGround(90, 80, bounds, pathPaint(paths, 0x7fbf5a, 0x88c661, 0xc29a62), 11));
  const colliders = [];
  const anchors = {};
  // casa, granero, pozo, molino
  const house = M.makeHouse(); house.position.set(6, 0, -12); group.add(house);
  anchors.windows = house.children[1];
  colliders.push({ x: 6, z: -12, r: 2.6 }, { x: 4.2, z: -12, r: 2.4 }, { x: 7.8, z: -12, r: 2.4 });
  const barn = M.makeBarn(); barn.position.set(17, 0, -11); group.add(barn);
  colliders.push({ x: 17, z: -11, r: 2.6 }, { x: 15.2, z: -11, r: 2.4 }, { x: 18.8, z: -11, r: 2.4 }, { x: 13.8, z: -10, r: 0.9 });
  const well = M.makeWell(); well.position.set(2.6, 0, 0.6); group.add(well); colliders.push({ x: 2.6, z: 0.6, r: 1.1 });
  const mill = M.makeMill(); mill.group.position.set(-15, 0, -12); group.add(mill.group); colliders.push({ x: -15, z: -12, r: 1.7 });
  anchors.mill = mill;
  const gh = M.makeGreenhouse(); gh.group.position.set(-6, 0, -12); group.add(gh.group);
  anchors.greenhouse = gh;
  // poste de cartel de obra del invernadero
  const sign = M.makeSign(C.rune); sign.position.set(-6, 0, -8.6); group.add(sign);
  // corral (cerco) + comederos
  const fence = [];
  fenceLine(fence, 11, -4, 23, -4); fenceLine(fence, 23, -4, 23, 9); fenceLine(fence, 23, 9, 11, 9); fenceLine(fence, 11, 9, 11, 5); fenceLine(fence, 11, 0, 11, -4);
  // cerco perimetral de la granja (con huecos para las salidas)
  fenceLine(fence, -24, 21, -2, 21); fenceLine(fence, 2, 21, 24, 21); fenceLine(fence, 24, 21, 24, 9);
  fenceLine(fence, -24, 21, -24, 8); fenceLine(fence, -24, 4, -24, -19);
  group.add(instanced(M.makeFenceSegment(), MAT.base, fence, 5));
  for (const f of fence) colliders.push({ x: f[0], z: f[1], r: 0.7 });
  const trough = mesh(M.makePen()); trough.position.set(20.5, 0, 2); group.add(trough);
  anchors.corral = { x0: 12.5, x1: 21.5, z0: -2.5, z1: 7.5 };
  // salidas (carteles)
  const s1 = M.makeSign(0xf6d04d); s1.position.set(2.6, 0, 19.5); group.add(s1);
  const s2 = M.makeSign(C.pine2); s2.position.set(-21.5, 0, 8.6); s2.rotation.y = Math.PI / 2; group.add(s2);
  // parcelas (instanciadas: el color de cada una muestra seca / regada / helada)
  const plotGeo = M.plotGeo();
  const all = [...PLOT_POS, ...GREEN_POS];
  const plots = new THREE.InstancedMesh(plotGeo, MAT.base, all.length);
  const o = new THREE.Object3D();
  all.forEach((p, i) => { o.position.set(p[0], 0, p[1]); o.scale.set(i >= PLOT_POS.length ? 0.95 : 1, 1, i >= PLOT_POS.length ? 0.95 : 1); o.updateMatrix(); plots.setMatrixAt(i, o.matrix); plots.setColorAt(i, new THREE.Color(C.soil)); });
  plots.receiveShadow = true; group.add(plots);
  anchors.plots = plots;
  // mallas de cultivo, maleza, lona y vida (una por parcela; se cambia la geometría según la etapa)
  anchors.crop = []; anchors.weed = []; anchors.tarp = []; anchors.mark = [];
  const weedGeo = M.makeWeeds(false), rockGeo = M.makeWeeds(true);
  anchors.weedGeo = weedGeo; anchors.rockGeo = rockGeo;
  const tarpGeo = new Builder().box(2.1, 0.06, 2.1, 0xffffff, [0, 0.95, 0]).box(0.08, 0.95, 0.08, 0xffffff, [1, 0.47, 1]).box(0.08, 0.95, 0.08, 0xffffff, [-1, 0.47, 1]).box(0.08, 0.95, 0.08, 0xffffff, [1, 0.47, -1]).box(0.08, 0.95, 0.08, 0xffffff, [-1, 0.47, -1]).build();
  tarpGeo.deleteAttribute('color');
  const markGeo = new THREE.RingGeometry(1.05, 1.3, 4, 1); markGeo.rotateX(-Math.PI / 2); markGeo.rotateY(Math.PI / 4);
  all.forEach((p, i) => {
    const cm = mesh(M.cropGeo('nabo', 0)); cm.position.set(p[0], 0.15, p[1]); cm.visible = false; group.add(cm); anchors.crop.push(cm);
    if (i < PLOT_POS.length) {
      const w = mesh(weedGeo); w.position.set(p[0], 0.1, p[1]); w.visible = false; group.add(w); anchors.weed.push(w);
      const t = new THREE.Mesh(tarpGeo, MAT.tarp); t.position.set(p[0], 0, p[1]); t.visible = false; t.castShadow = true; group.add(t); anchors.tarp.push(t);
      const mk = new THREE.Mesh(markGeo, MAT.danger); mk.position.set(p[0], 0.25, p[1]); mk.visible = false; group.add(mk); anchors.mark.push(mk);
    }
  });
  // ranuras de decoración (marcador de piedra)
  anchors.decorSlots = DECOR_POS.map(p => {
    const base = mesh(new Builder().cyl(0.7, 0.8, 0.12, 8, C.stone, [0, 0.06, 0]).build()); base.position.set(p[0], 0, p[1]); group.add(base);
    const holder = new THREE.Group(); holder.position.set(p[0], 0.12, p[1]); group.add(holder);
    colliders.push({ x: p[0], z: p[1], r: 0.55 });
    return holder;
  });
  // utilería del evento de tormenta (oculta hasta el evento)
  const storm = new THREE.Group(); storm.visible = false; group.add(storm);
  anchors.storm = storm;
  const bellCols = [0xff6b6b, 0x74c0fc, 0xffe066];
  anchors.bells = STORM_POS.bells.map((p, i) => { const b = M.makeBell(bellCols[i]); b.group.position.set(p[0], 0, p[1]); storm.add(b.group); return b; });
  anchors.rods = STORM_POS.rods.map(p => { const r = M.makeRod(); r.group.position.set(p[0], 0, p[1]); storm.add(r.group); return r; });
  anchors.gates = STORM_POS.gates.map(p => { const g = M.makeGate(); g.group.position.set(p[0], 0, p[1]); storm.add(g.group); return g; });
  const flood = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 3.4), MAT.water); flood.rotation.x = -Math.PI / 2; flood.position.set(-5.7, 0.02, 3.2); flood.visible = false; storm.add(flood);
  anchors.flood = flood;
  // flora instanciada (recortable por calidad)
  const busy = (x, z) => (x > -12 && x < 0.5 && z > -4 && z < 5.5) || Math.hypot(x - 6, z - 12 + 24) < 0 || (x > -11 && x < -1 && z > -16 && z < -8)
    || (x > 1 && x < 11 && z > -16 && z < -7) || (x > 12 && x < 23 && z > -14 && z < 9) || Math.abs(x) < 2 && z > 8 || (x < -16 && x > -19 && z > -15 && z < -9)
    || Math.hypot(x - 2.6, z - 0.6) < 2 || DECOR_POS.some(p => Math.hypot(x - p[0], z - p[1]) < 1.5) || STORM_POS.bells.concat(STORM_POS.rods, STORM_POS.gates).some(p => Math.hypot(x - p[0], z - p[1]) < 1.4);
  const grass = instanced(M.makeGrassTuft(), MAT.foliage, scatter(21, 420, -23, 23, -19, 21, busy), 2, false);
  const flowers = [0xf59ac0, 0xffe066, 0xffffff, 0xb197fc].map((c, i) => instanced(M.makeFlower(c), MAT.base, scatter(30 + i, 45, -23, 23, -19, 21, busy), 3 + i, false));
  // árboles alrededor (fuera del área de juego) y algunos adentro
  const treeList = scatter(41, 70, -40, 40, -36, 40, (x, z) => x > -25 && x < 25 && z > -21 && z < 23).concat([[-20, -2, 0, 1.1], [21, 14, 1, 1], [-18, 16, 2, 1.2], [9, 15, 0.4, 0.9], [-21, -16, 1, 1]]);
  const trees = instanced(M.makeTree(), MAT.foliage, treeList, 7);
  for (const t of treeList) if (t[0] > -25 && t[0] < 25 && t[1] > -21 && t[1] < 23) colliders.push({ x: t[0], z: t[1], r: 0.7 });
  const rocks = instanced(M.makeRock(), MAT.base, [[-22, 18, 1, 1], [22, -18, 2, 1.2], [-8, 18, 0.3, 0.8], [15, 18, 2, 1]], 8);
  for (const p of [[-22, 18], [22, -18], [-8, 18], [15, 18]]) colliders.push({ x: p[0], z: p[1], r: 0.9 });
  group.add(grass, trees, rocks, ...flowers);
  const flora = [grass, ...flowers];
  return {
    name: 'granja', title: 'Granja de la Abuela Runa', group, colliders, bounds, fog: 1,
    exits: [{ x: 0, z: 21.7, r: 1.7, to: 'mercado', label: 'Al mercado del pueblo' }, { x: -23.7, z: 6, r: 1.7, to: 'bosque', label: 'Al bosque de semillas raras' }],
    spawn: { inicio: [-3, 8], mercado: [0, 19], bosque: [-21, 6], casa: [6, -8.6] },
    flora, anchors,
    anim(t) { mill.blades.rotation.z = anchors.millOn ? t * 1.2 : 0; },
  };
}

/* ============================== MERCADO ============================== */
export const MARKET = {
  shelves: [[-15.2, -10.4], [-12.8, -10.4], [-10.4, -10.4], [-8.0, -10.4]],
  sellStall: [11, -6], merchantShelf: [14.6, -10.2], forge: [12, 9], refugio: [-12, 9], deco: [-6.2, 12.4], board: [-5, -5.5], feria: [0, 12],
  homes: [[-18, -15], [18, -15], [-19, 15], [19, 15]],
  fountain: [0, 0],
};
/** @returns {SceneDef} */
export function buildMarket() {
  const group = new THREE.Group(); group.name = 'mercado';
  const bounds = { x0: -21, x1: 21, z0: -18.5, z1: 18 };
  const paint = (x, z, rr) => {
    const d = Math.hypot(x, z);
    if (d < 9 || (Math.abs(x) < 2 && z < 0)) return rr < 0.5 ? 0xd8cbb0 : 0xd0c2a6; // empedrado
    if (Math.abs(z) < 2 || Math.abs(x) < 2) return rr < 0.5 ? 0xd2c3a3 : 0xcabb9a;
    return rr < 0.5 ? 0x7fbf5a : 0x88c661;
  };
  group.add(makeGround(90, 80, bounds, paint, 12));
  const colliders = [], anchors = {};
  group.add(M.makeFountain()); colliders.push({ x: 0, z: 0, r: 2.7 });
  // casitas del pueblo (fondo) y sus puertas: destino de las rutinas nocturnas
  MARKET.homes.forEach((h, i) => { const c = M.makeHouse(); c.position.set(h[0], 0, h[1]); c.rotation.y = h[1] < 0 ? 0 : Math.PI; c.scale.setScalar(0.85); group.add(c); colliders.push({ x: h[0] - 1.5, z: h[1], r: 2.2 }, { x: h[0] + 1.5, z: h[1], r: 2.2 }); if (i === 0) anchors.homeWindows = c.children[1]; });
  // tienda de semillas de Don Tito: puesto + estantes con bolsitas (stock visible)
  const stallB = M.makeStall(0x4f9a45, C.white); const tito = mesh(stallB.build()); tito.position.set(-11.6, 0, -6.5); group.add(tito);
  colliders.push({ x: -12.6, z: -6.5, r: 1.1 }, { x: -10.6, z: -6.5, r: 1.1 });
  const shelfGeo = M.makeShelf();
  const sackCols = [0xb067c9, C.carrot, C.wheat, C.pumpkin];
  anchors.sacks = MARKET.shelves.map((p, i) => {
    const s = mesh(shelfGeo); s.position.set(p[0], 0, p[1]); group.add(s); colliders.push({ x: p[0], z: p[1], r: 0.8 });
    const sacks = new THREE.InstancedMesh(M.makeSack(sackCols[i]), MAT.base, 6);
    const o = new THREE.Object3D();
    for (let k = 0; k < 6; k++) { o.position.set(p[0] - 0.5 + (k % 3) * 0.5, [0.54, 1.14, 1.74][Math.floor(k / 3)] + 0.0, p[1] + 0.05); o.updateMatrix(); sacks.setMatrixAt(k, o.matrix); }
    group.add(sacks); return sacks;
  });
  // almacén de Tomás: mostrador de venta + estantería a abastecer (10 huecos)
  const sb = M.makeStall(0xf08a24, C.apron); const sell = mesh(sb.build()); sell.position.set(11, 0, -6.5); group.add(sell);
  colliders.push({ x: 10, z: -6.5, r: 1.1 }, { x: 12, z: -6.5, r: 1.1 });
  const mShelf = mesh(new Builder().box(4.2, 0.1, 0.7, C.woodLight, [0, 0.6, 0]).box(4.2, 0.1, 0.7, C.woodLight, [0, 1.3, 0]).box(4.2, 2, 0.06, C.wood, [0, 1, -0.33]).box(0.1, 2, 0.7, C.woodDark, [-2.1, 1, 0]).box(0.1, 2, 0.7, C.woodDark, [2.1, 1, 0]).build());
  mShelf.position.set(MARKET.merchantShelf[0], 0, MARKET.merchantShelf[1]); group.add(mShelf);
  colliders.push({ x: 13.2, z: -10.2, r: 0.9 }, { x: 16, z: -10.2, r: 0.9 }, { x: 14.6, z: -10.2, r: 0.9 });
  const goods = new THREE.InstancedMesh(new Builder().box(0.55, 0.42, 0.45, C.woodLight, [0, 0.21, 0]).ball(0.17, C.carrot, [-0.1, 0.48, 0]).ball(0.17, C.wheat, [0.12, 0.47, 0.05]).build(), MAT.base, 10);
  { const o = new THREE.Object3D(); for (let k = 0; k < 10; k++) { o.position.set(MARKET.merchantShelf[0] - 1.6 + (k % 5) * 0.8, k < 5 ? 0.66 : 1.36, MARKET.merchantShelf[1] + 0.05); o.updateMatrix(); goods.setMatrixAt(k, o.matrix); } }
  goods.count = 0; group.add(goods); anchors.goods = goods;
  // herrería de Inés
  const forge = M.makeForge(); forge.position.set(MARKET.forge[0], 0, MARKET.forge[1]); forge.rotation.y = Math.PI; group.add(forge);
  colliders.push({ x: 12, z: 9.2, r: 1.3 }, { x: 10.4, z: 8.7, r: 0.6 });
  anchors.forgeGlow = forge.children[1];
  // refugio de animales de la Abuela Rosa (corralito) + puesto de decoración
  const pen = [];
  fenceLine(pen, -16, 6, -8, 6); fenceLine(pen, -16, 6, -16, 13); fenceLine(pen, -16, 13, -8, 13); fenceLine(pen, -8, 13, -8, 10);
  group.add(instanced(M.makeFenceSegment(), MAT.base, pen, 9));
  for (const f of pen) colliders.push({ x: f[0], z: f[1], r: 0.6 });
  const rpen = mesh(M.makePen()); rpen.position.set(-14, 0, 11.5); group.add(rpen);
  const db = M.makeStall(0xb197fc, C.white); const deco = mesh(db.build()); deco.position.set(MARKET.deco[0], 0, MARKET.deco[1] + 1.2); deco.rotation.y = Math.PI; group.add(deco);
  colliders.push({ x: -7.2, z: 13.6, r: 1.1 }, { x: -5.2, z: 13.6, r: 1.1 });
  anchors.decoShow = ['farol', 'banco', 'maceta'].map((k, i) => { const d = M.makeDecor(k); d.scale.setScalar(0.45); d.position.set(MARKET.deco[0] - 1 + i, 1.05, MARKET.deco[1] + 1.1); group.add(d); return d; });
  // animales en adopción
  anchors.adopt = {};
  for (const [k, p] of [['gallina', [-13.5, 8.5]], ['oveja', [-10.5, 10]]]) { const a = M.makeAnimal(/** @type {any} */ (k)); a.position.set(p[0], 0, p[1]); group.add(a); anchors.adopt[k] = a; }
  // tablero de pedidos
  const board = M.makeBoard(); board.position.set(MARKET.board[0], 0, MARKET.board[1]); board.rotation.y = 0.5; group.add(board);
  colliders.push({ x: MARKET.board[0], z: MARKET.board[1], r: 1.1 });
  // carpa de la feria
  const tent = M.makeTent(); tent.position.set(MARKET.feria[0], 0, MARKET.feria[1]); tent.rotation.y = Math.PI; group.add(tent);
  colliders.push({ x: 0, z: 12, r: 2.8 }, { x: -1, z: 9.1, r: 0.9 }, { x: 1, z: 9.1, r: 0.9 });
  anchors.ribbon = mesh(new Builder().cyl(0.35, 0.35, 0.06, 10, 0x3b82c4, [0, 0, 0], [Math.PI / 2, 0, 0]).box(0.18, 0.5, 0.04, 0x3b82c4, [-0.12, -0.4, 0], [0, 0, 0.3]).box(0.18, 0.5, 0.04, 0x3b82c4, [0.12, -0.4, 0], [0, 0, -0.3]).ball(0.12, C.yellow, [0, 0, 0.04]).build(), MAT.base, false);
  anchors.ribbon.position.set(0, 2.1, 9.35); anchors.ribbon.visible = false; group.add(anchors.ribbon);
  // faroles y bancos de la plaza
  for (const [x, z] of [[-4, 4], [4, 4], [-4, -4], [4, -4]]) { const f = M.makeDecor('farol'); f.position.set(x * 1.6, 0, z * 1.6); group.add(f); colliders.push({ x: x * 1.6, z: z * 1.6, r: 0.35 }); }
  for (const [x, z, r] of [[6.6, 1.5, -Math.PI / 2], [-6.6, -1.5, Math.PI / 2]]) { const b = M.makeDecor('banco'); b.position.set(x, 0, z); b.rotation.y = r; group.add(b); colliders.push({ x, z, r: 0.8 }); }
  // salida + flora
  const s = M.makeSign(C.wheat); s.position.set(2.6, 0, -16.5); s.rotation.y = Math.PI; group.add(s);
  const busy = (x, z) => Math.hypot(x, z) < 10 || Math.abs(x) < 2.5 || Math.abs(z) < 2.5 || (x < -6 && x > -17 && z > -12 && z < -4) || (x > 8 && x < 18 && z > -12 && z < -4)
    || (x > 8 && x < 15 && z > 6 && z < 12) || (x < -7 && x > -17 && z > 5 && z < 14) || (Math.abs(x) < 4 && z > 8) || MARKET.homes.some(h => Math.hypot(x - h[0], z - h[1]) < 4.5);
  const grass = instanced(M.makeGrassTuft(), MAT.foliage, scatter(51, 260, -20, 20, -18, 17, busy), 4, false);
  const flowers = instanced(M.makeFlower(0xf59ac0), MAT.base, scatter(52, 60, -20, 20, -18, 17, busy), 5, false);
  const treeList = scatter(53, 60, -40, 40, -36, 40, (x, z) => x > -22 && x < 22 && z > -19 && z < 19).concat([[-19, 0, 0, 1], [19, 2, 1, 1.1], [-19.5, 9, 0, 0.9], [19, -4, 1, 0.9]]);
  group.add(grass, flowers, instanced(M.makeTree(), MAT.foliage, treeList, 6));
  for (const p of [[-19, 0], [19, 2], [-19.5, 9], [19, -4]]) colliders.push({ x: p[0], z: p[1], r: 0.7 });
  // límites con cerco bajo
  const fence = []; fenceLine(fence, -21, -18.5, -2, -18.5); fenceLine(fence, 2, -18.5, 21, -18.5);
  group.add(instanced(M.makeFenceSegment(), MAT.base, fence, 10));
  return {
    name: 'mercado', title: 'Mercado del pueblo', group, colliders, bounds, fog: 1,
    exits: [{ x: 0, z: -18.3, r: 1.7, to: 'granja', label: 'A la granja' }],
    spawn: { granja: [0, -16], inicio: [0, -16] },
    flora: [grass, flowers], anchors,
    anim(t, dt, night) { if (anchors.forgeGlow) anchors.forgeGlow.scale.y = 1 + Math.sin(t * 7) * 0.15; },
  };
}

/* ============================== BOSQUE ============================== */
export const FOREST = {
  bushes: [[-6, -14], [8, -12], [-16, 2], [5, 14], [-3, 6]],
  logs: [[12, 6, 0.4], [-10, 14, 1.2], [14, -16, 2.1], [-18, -6, 0.9]],
  crystals: [[-17, -16], [17, 16], [-20, 15]],
  shrine: [-4, -4], cabra: [10, 15],
};
/** @returns {SceneDef} */
export function buildForest() {
  const group = new THREE.Group(); group.name = 'bosque';
  const bounds = { x0: -23, x1: 24, z0: -21, z1: 21 };
  const paths = [[[30, 0], [16, 1], [6, -2], [-4, -4]], [[6, -2], [5, 12]], [[-4, -4], [-15, 2]]];
  group.add(makeGround(90, 80, bounds, pathPaint(paths, 0x4f8f4a, 0x57974e, 0x8f6e48, 1.2), 13));
  const colliders = [], anchors = {};
  // arroyo con piedras-puente
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(3, 46, 1, 8), MAT.water); stream.rotation.x = -Math.PI / 2; stream.rotation.z = 0.25; stream.position.set(-10, 0.03, 0); group.add(stream);
  const TAN = Math.tan(0.25), FORD = -0.6, streamX = z => -10 + z * TAN;
  anchors.streamX = streamX;
  const ca = Math.cos(0.25), sa = Math.sin(0.25), stones = [];
  for (let i = 0; i < 4; i++) { const k = (i - 1.5) * 0.9; stones.push([streamX(FORD) + k * ca, FORD - k * sa, i, 0.45, 0]); }
  group.add(instanced(new Builder().dodec(0.55, C.stone, [0, 0.05, 0], [1, 0.35, 1]).build(), MAT.base, stones, 3));
  // el arroyo bloquea el paso salvo en el vado de piedras
  for (let z = -22; z <= 22; z += 1.1) { if (Math.abs(z - FORD) < 1.5) continue; colliders.push({ x: streamX(z), z, r: 1.15 }); }
  const sh = M.makeShrine(); sh.group.position.set(FOREST.shrine[0], 0, FOREST.shrine[1]); group.add(sh.group);
  colliders.push({ x: FOREST.shrine[0], z: FOREST.shrine[1], r: 1.0 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; colliders.push({ x: FOREST.shrine[0] + Math.cos(a) * 2.6, z: FOREST.shrine[1] + Math.sin(a) * 2.6, r: 0.4 }); }
  anchors.shrineGlow = sh.glow;
  const rb = M.makeRuneBush();
  anchors.bushes = FOREST.bushes.map(p => { const g = new THREE.Group(); g.add(mesh(rb.geo)); const gl = mesh(rb.glow, MAT.glow, false); g.add(gl); g.position.set(p[0], 0, p[1]); group.add(g); colliders.push({ x: p[0], z: p[1], r: 0.8 }); return { group: g, glow: gl }; });
  const logGeo = M.makeLog();
  anchors.logs = FOREST.logs.map(p => { const l = mesh(logGeo); l.position.set(p[0], 0, p[1]); l.rotation.y = p[2]; group.add(l); return l; });
  const cr = M.makeCrystal();
  anchors.crystals = FOREST.crystals.map(p => { const g = new THREE.Group(); g.add(mesh(cr.geo)); g.add(mesh(cr.glow, MAT.glow, false)); g.position.set(p[0], 0, p[1]); group.add(g); colliders.push({ x: p[0], z: p[1], r: 0.7 }); return g; });
  const busy = (x, z) => { for (const p of paths) for (let i = 0; i < p.length - 1; i++) if (segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]) < 2.4) return true;
    return Math.abs(x - anchors.streamX(z)) < 2.3 || Math.hypot(x - FOREST.shrine[0], z - FOREST.shrine[1]) < 4.5
      || FOREST.bushes.concat(FOREST.crystals, FOREST.logs.map(l => [l[0], l[1]]), [FOREST.cabra]).some(p => Math.hypot(x - p[0], z - p[1]) < 2.8); };
  const pinesIn = scatter(61, 38, -22, 22, -20, 20, busy);
  const pinesOut = scatter(62, 120, -42, 42, -40, 40, (x, z) => x > -24 && x < 25 && z > -22 && z < 22);
  const pines = instanced(M.makePine(), MAT.foliage, pinesIn.concat(pinesOut), 11);
  for (const p of pinesIn) colliders.push({ x: p[0], z: p[1], r: 0.6 * p[3] });
  const mushCols = [0xd9483b, 0xb197fc, 0xf6d04d];
  const mush = mushCols.map((c, i) => instanced(M.makeMushroom(c), MAT.base, scatter(70 + i, 22, -22, 22, -20, 20, busy), 12 + i, false));
  const ferns = instanced(M.makeGrassTuft(), MAT.foliage, scatter(75, 380, -22, 22, -20, 20, busy).map(t => [t[0], t[1], t[2], t[3] * 1.6]), 13, false);
  group.add(pines, ferns, ...mush);
  // luciérnagas (puntos que brillan de noche)
  const ff = new THREE.BufferGeometry(); const fr = rng(80), fp = new Float32Array(60 * 3);
  for (let i = 0; i < 60; i++) { fp[i * 3] = -20 + fr() * 40; fp[i * 3 + 1] = 0.6 + fr() * 2.2; fp[i * 3 + 2] = -18 + fr() * 36; }
  ff.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const fireflies = new THREE.Points(ff, new THREE.PointsMaterial({ color: 0xd9ff8a, size: 0.35, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(fireflies); anchors.fireflies = fireflies;
  const s = M.makeSign(C.straw); s.position.set(21.5, 0, -2.6); s.rotation.y = -Math.PI / 2; group.add(s);
  return {
    name: 'bosque', title: 'Bosque de semillas raras', group, colliders, bounds, fog: 0.72,
    exits: [{ x: 23.7, z: 0, r: 1.8, to: 'granja', label: 'A la granja' }],
    spawn: { granja: [21, 0], inicio: [21, 0] },
    flora: [ferns, ...mush], anchors,
    anim(t, dt, night) {
      fireflies.visible = night > 0.15; fireflies.material.opacity = night * 0.9;
      fireflies.position.y = Math.sin(t * 0.8) * 0.25;
      sh.glow.rotation.y = t * 0.3;
      for (const b of anchors.bushes) b.glow.rotation.y = t * 0.4;
    },
  };
}
