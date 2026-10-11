// Mateo: Ciudad de Altura — V2 P2: el departamento de Mateo (fase 06 del kit).
// AFUERA: una casa identificable del Barrio Las Glicinas (la de la esquina de la Avenida Prisma) con puerta real que se
// abre y se cierra, placa «CASA DE MATEO» y, en la dársena de enfrente, el «Garaje M» (lugar físico para el kart).
// ADENTRO: un sub-escenario cargado aparte (lejos de la ciudad, a 300 m de altura sobre el mar): al entrar se agrega a la
// escena con sus colisiones y la ciudad se OCULTA (no se dibuja ni se simula); al salir se quita (mismas geometrías
// cacheadas: entrar/salir no pierde memoria). Muebles funcionales: ropero, heladera, mesada/mesa (comer), cama (dormir y
// guardar), sofá (sentarse), escritorio (cartelera de trabajos), baño (lavarse las manos), llavero (garaje) y puerta.
// Puntos de entrada/salida verificados fuera de toda geometría.
import * as THREE from 'three';
import { place, footprint, signTexture } from './props.js';

export const HOME_O = { x: 290, y: 300, z: -235 }; // centro del piso del departamento (sub-escenario)
const W = 11, D = 9, H = 3.0, T = 0.2; // medidas interiores y espesor de muros

/**
 * @param {any} o { scene, world, city, hero, proxies, interiorLights, keep: Object3D[], open(kind, arg), fx, sfx }
 */
export function createHome(o) {
  const { scene, world, city, proxies } = o;
  /* ---------- la casa en la ciudad ---------- */
  // la casa del lote noroeste de la manzana (5,4): frente al sur, sobre la Avenida Prisma
  const house = city.houses.filter(h => h.block && h.block[0] === 5 && h.block[1] === 4).sort((a, b) => (a.x + a.z) - (b.x + b.z))[0];
  const doorX = house.x, faceZ = house.z - house.d / 2; // cara sur de la casa
  const gy = world.groundAt(doorX, faceZ - 1.2, 2);
  const outside = { x: doorX, y: gy, z: faceZ - 1.45, yaw: Math.PI }; // punto seguro afuera (jardín, frente a la puerta)
  const ext = new THREE.Group(); ext.name = 'casa_mateo_exterior'; scene.add(ext);
  const darkM = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
  const hall = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.15), darkM); hall.position.set(doorX, gy + 1.08, faceZ - 0.13); hall.rotation.y = Math.PI; ext.add(hall);
  // marco + hoja con bisagra (la hoja gira hacia afuera)
  const frameM = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 }), leafM = new THREE.MeshStandardMaterial({ color: 0x2f5f9f, roughness: 0.5 });
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.16), frameM); f.position.set(doorX + sx * 0.64, gy + 1.15, faceZ - 0.1); ext.add(f); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.16), frameM); top.position.set(doorX, gy + 2.3, faceZ - 0.1); ext.add(top);
  const hinge = new THREE.Group(); hinge.position.set(doorX + 0.56, gy, faceZ - 0.16); ext.add(hinge);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.12, 0.06), leafM); leaf.position.set(-0.55, 1.07, 0); hinge.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8c64a, metalness: 0.6, roughness: 0.3 })); knob.position.set(-0.98, 1.0, -0.06); hinge.add(knob);
  const plate = signTexture([{ text: 'M', size: 64, color: '#ffffff' }], { w: 128, h: 128, bg: '#d63031' });
  const mPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: plate.tex })); mPlate.position.set(-0.55, 1.62, -0.035); mPlate.rotation.y = Math.PI; hinge.add(mPlate);
  const sign = signTexture([{ text: 'CASA DE MATEO', size: 44, color: '#1f2c52' }, { text: '★ Barrio Las Glicinas ★', size: 26, color: '#2f6db0', weight: 600 }], { w: 512, h: 128, bg: '#fff6dc', border: '#d63031' });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: sign.tex })); plaque.position.set(doorX - 1.65, gy + 1.85, faceZ - 0.03); plaque.rotation.y = Math.PI; ext.add(plaque);
  // Garaje M: la dársena libre frente a la casa (Avenida Prisma) con una «M» pintada y su cartel
  const bay = city.parkingBays.filter(b => b.axis === 'x' && b.z > 64 && !city.parkedBoxes.some(p => Math.hypot((p.minX + p.maxX) / 2 - b.x, (p.minZ + p.maxZ) / 2 - b.z) < 1)).sort((a, b) => Math.hypot(a.x - doorX, a.z - faceZ) - Math.hypot(b.x - doorX, b.z - faceZ))[0];
  const garage = { x: bay.x, z: bay.z, yaw: Math.PI / 2,  // mirando al este: el sentido del carril norte de la avenida
    sign: { x: bay.x - 3.4, z: bay.z + 3.0 } };
  const gm = signTexture([{ text: 'M', size: 90, color: '#ffffff' }], { w: 128, h: 128, bg: '#2f6db0', border: '#ffffff' });
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: gm.tex, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  paint.position.set(bay.x, 0.02, bay.z); ext.add(paint);
  const gs = signTexture([{ text: 'GARAJE M', size: 48, color: '#ffffff' }, { text: 'Kart de Mateo · Taller', size: 26, color: '#ffe27a', weight: 600 }], { w: 512, h: 128, bg: '#2f6db0' });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), new THREE.MeshStandardMaterial({ color: 0x8a8f96 })); post.position.set(garage.sign.x, 1.3, garage.sign.z); ext.add(post);
  const gsm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.04), [frameM, frameM, frameM, frameM, new THREE.MeshBasicMaterial({ map: gs.tex }), new THREE.MeshBasicMaterial({ map: gs.tex })]); gsm.position.set(garage.sign.x, 2.55, garage.sign.z); ext.add(gsm);
  ext.traverse(m => { if (m.isMesh) m.castShadow = false; });

  /* ---------- el sub-escenario interior ---------- */
  const O = HOME_O, inner = new THREE.Group(); inner.name = 'departamento_mateo';
  const boxes = []; // colisiones (se agregan/quitan del mundo)
  const solid = (cx, cy, cz, w, h, d) => boxes.push({ minX: O.x + cx - w / 2, maxX: O.x + cx + w / 2, minY: O.y + cy, maxY: O.y + cy + h, minZ: O.z + cz - d / 2, maxZ: O.z + cz + d / 2 });
  const M = {
    floor: new THREE.MeshStandardMaterial({ color: 0xc09060, roughness: 0.7 }), wall: new THREE.MeshStandardMaterial({ color: 0xf3e6d0, roughness: 0.9 }),
    blue: new THREE.MeshStandardMaterial({ color: 0xcfe3f5, roughness: 0.9 }), ceil: new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.95 }),
    base: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), tile: new THREE.MeshStandardMaterial({ color: 0xdfeff0, roughness: 0.4 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.6 }), white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), win: new THREE.MeshBasicMaterial({ color: 0x9fd0ff, toneMapped: false }), frame: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
  };
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(O.x + x, O.y + y, O.z + z); m.rotation.y = ry; m.receiveShadow = true; inner.add(m); return m; };
  // piso, cielorraso, muros (la pared sur tiene el hueco de la puerta)
  add(new THREE.BoxGeometry(W + 2 * T, 0.3, D + 2 * T), M.floor, 0, -0.15, 0); solid(0, -1, 0, W + 2 * T, 1, D + 2 * T);
  add(new THREE.BoxGeometry(W + 2 * T, 0.2, D + 2 * T), M.ceil, 0, H + 0.1, 0); solid(0, H, 0, W + 2 * T, 0.6, D + 2 * T);
  const wall = (x, z, w, d, mat = M.wall) => { add(new THREE.BoxGeometry(w, H, d), mat, x, H / 2, z); solid(x, 0, z, w, H, d); };
  wall(0, D / 2 + T / 2, W + 2 * T, T, M.blue); wall(-W / 2 - T / 2, 0, T, D); wall(W / 2 + T / 2, 0, T, D, M.blue);
  const dw = 1.3, segW = W / 2 + T - dw / 2; wall(-(dw / 2 + segW / 2), -D / 2 - T / 2, segW, T); wall(dw / 2 + segW / 2, -D / 2 - T / 2, segW, T);
  add(new THREE.BoxGeometry(dw, H - 2.3, T), M.wall, 0, 2.3 + (H - 2.3) / 2, -D / 2 - T / 2); solid(0, 2.3, -D / 2 - T / 2, dw, H - 2.3, T);
  // puerta interior (cerrada: la hoja tapa el hueco; se «abre» al salir)
  const iLeaf = add(new THREE.BoxGeometry(1.15, 2.25, 0.06), leafM, 0, 1.125, -D / 2 - 0.02);
  solid(0, 0, -D / 2 - T / 2 - 0.05, dw, 2.3, T + 0.1);
  // zócalos
  for (const [x, z, w, d] of [[0, D / 2 - 0.02, W, 0.04], [-W / 2 + 0.02, 0, 0.04, D], [W / 2 - 0.02, 0, 0.04, D]]) add(new THREE.BoxGeometry(w, 0.12, d), M.base, x, 0.06, z);
  // ventanas (paneles que siguen el color del cielo) en las paredes oeste, norte y este
  const windows = [];
  for (const [x, z, ry] of [[-W / 2 + 0.01, -1.6, Math.PI / 2], [-1.2, D / 2 - 0.01, Math.PI], [W / 2 - 0.01, 1.8, -Math.PI / 2]]) {
    const g = new THREE.Group(); g.position.set(O.x + x, O.y + 1.65, O.z + z); g.rotation.y = ry; inner.add(g);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), M.win); g.add(pane); windows.push(pane);
    for (const [fx, fy, fw, fh] of [[0, 0.58, 1.62, 0.07], [0, -0.58, 1.62, 0.07], [-0.78, 0, 0.07, 1.2], [0.78, 0, 0.07, 1.2], [0, 0, 0.05, 1.1]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.05), M.frame); f.position.set(fx, fy, 0.02); g.add(f); }
  }
  // lámparas de techo (emisivas) + luces prestadas de los interiores de la ciudad
  for (const [x, z] of [[-2.6, 0.8], [3.2, 0.6]]) add(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 16), M.lamp, x, H - 0.05, z);
  const lightSpots = [[-2.6, H - 0.4, 0.8], [3.2, H - 0.4, 0.6]];

  // muebles (GLB proxy del kit) y sus colisiones
  const furn = (name, x, z, ry, pad = 0.04, fb) => { const ob = place(proxies, name, O.x + x, O.y, O.z + z, ry, fb); inner.add(ob); const [fw, fh, fd] = footprint(proxies, name, ry, fb); solid(x, 0, z, fw + pad, fh, fd + pad); return { ob, fw, fh, fd }; };
  const sofa = furn('sofa_departamento', -W / 2 + 0.5, -1.7, Math.PI / 2);
  const fridge = furn('heladera_departamento', -W / 2 + 0.48, D / 2 - 0.42, Math.PI);
  const counter = furn('mesada_cocina', -W / 2 + 1.0 + 0.9 + 0.42, D / 2 - 0.4, Math.PI);
  const table = furn('mesa_comedor', -2.4, 1.6, 0);
  furn('silla_simple', -3.25, 1.6, Math.PI / 2, -0.15); furn('silla_simple', -1.55, 1.6, -Math.PI / 2, -0.15);
  const bed = furn('cama_departamento', W / 2 - 0.85, D / 2 - 1.08, Math.PI);
  const ward = furn('ropero_mateo', 1.7, D / 2 - 0.33, Math.PI);
  // escritorio (madera) con silla y la cartelera de trabajos sobre la pared este
  add(new THREE.BoxGeometry(0.62, 0.06, 1.3), M.wood, W / 2 - 0.36, 0.74, -0.1); for (const [dx, dz] of [[-0.26, -0.6], [0.26, -0.6], [-0.26, 0.6], [0.26, 0.6]]) add(new THREE.BoxGeometry(0.05, 0.72, 0.05), M.wood, W / 2 - 0.36 + dx, 0.36, -0.1 + dz);
  solid(W / 2 - 0.36, 0, -0.1, 0.66, 0.78, 1.34);
  furn('silla_simple', W / 2 - 1.05, -0.1, Math.PI / 2, -0.15);
  const board = signTexture([{ text: 'TRABAJOS DEL BARRIO', size: 34, color: '#1f2c52' }, { text: 'cartas · jardín · fotos · compras', size: 22, color: '#2f6db0', weight: 600 }], { w: 512, h: 128, bg: '#fff6dc', border: '#e8b81a' });
  const bm = add(new THREE.PlaneGeometry(1.3, 0.33), new THREE.MeshBasicMaterial({ map: board.tex }), W / 2 - 0.02, 1.55, -0.1, -Math.PI / 2); bm.receiveShadow = false;
  // baño (esquina sureste): tabique con abertura, lavatorio e inodoro
  const bx0 = 2.6;
  add(new THREE.BoxGeometry(0.12, H, 2.3), M.wall, bx0, H / 2, -D / 2 + 1.15); solid(bx0, 0, -D / 2 + 1.15, 0.12, H, 2.3);
  add(new THREE.BoxGeometry(1.4, H, 0.12), M.wall, bx0 + 0.7, H / 2, -D / 2 + 2.3); solid(bx0 + 0.7, 0, -D / 2 + 2.3, 1.4, H, 0.12); // abertura de 1,5 m hacia el este
  add(new THREE.BoxGeometry(W / 2 - bx0, 0.02, 2.3), M.tile, (bx0 + W / 2) / 2, 0.011, -D / 2 + 1.15);
  add(new THREE.BoxGeometry(0.5, 0.85, 0.42), M.white, W / 2 - 0.3, 0.425, -D / 2 + 0.55); solid(W / 2 - 0.3, 0, -D / 2 + 0.55, 0.5, 0.85, 0.42);
  add(new THREE.BoxGeometry(0.42, 0.42, 0.6), M.white, bx0 + 0.5, 0.21, -D / 2 + 0.4); solid(bx0 + 0.5, 0, -D / 2 + 0.4, 0.42, 0.45, 0.6);
  // llavero junto a la puerta
  add(new THREE.BoxGeometry(0.42, 0.28, 0.04), M.wood, 1.15, 1.45, -D / 2 + 0.02);
  // decoración comprada en «Mi Rinconcito» (aparece si está en home.decor)
  const decor = {
    alfombra_nube: (() => { const m = add(new THREE.CircleGeometry(1.25, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeaf4ff, roughness: 1 }), -3.1, 0.012, -1.7); m.scale.set(1.3, 1, 0.9); return m; })(),
    lampara_estrella: (() => { const g = new THREE.Group(); g.position.set(O.x - W / 2 + 0.45, O.y, O.z - 3.1); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.5, 8), M.wood); pole.position.y = 0.75; const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffe27a })); star.position.y = 1.62; g.add(pole, star); inner.add(g); return g; })(),
    planta_maceta: (() => { const g = place(proxies, 'maceta_departamento', O.x - 0.3, O.y, O.z + D / 2 - 0.35, 0, [0.46, 0.4, 0.46, 0x6b8f3a]); inner.add(g); const leafs = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: 0x3f9a4a })); leafs.position.y = 0.62; g.add(leafs); return g; })(),
  };
  for (const k in decor) decor[k].visible = false;
  inner.traverse(m => { if (m.isMesh) m.castShadow = false; });

  const L = (x, z) => ({ x: O.x + x, y: O.y, z: O.z + z });
  const spawns = { door: { ...L(0, -D / 2 + 1.25), yaw: 0 }, bed: { ...L(W / 2 - 2.15, D / 2 - 1.5), yaw: -Math.PI / 2 } };
  const seats = { sofa: { ...L(-W / 2 + 0.75, -1.7), yaw: Math.PI / 2 } };
  // puntos de interacción (dentro del área libre; radio r)
  const spots = [
    { id: 'salir', label: 'Salir a la calle 🚪', ...L(0, -D / 2 + 0.85), r: 1.3, act: () => o.request('exit') },
    { id: 'llavero', label: 'Llaves del kart (garaje) 🔑', ...L(1.2, -D / 2 + 0.7), r: 0.75, act: () => o.open('garage') },
    { id: 'ropero', label: 'Abrir el ropero 👕', ...L(1.7, D / 2 - 1.1), r: 1.1, act: () => o.open('wardrobe') },
    { id: 'heladera', label: 'Abrir la heladera 🧊', ...L(-W / 2 + 0.5, D / 2 - 1.25), r: 1.0, act: () => o.open('fridge') },
    { id: 'mesa', label: 'Comer algo 🍽', ...L(-2.4, 0.55), r: 1.0, act: () => o.open('eat') },
    { id: 'mesada', label: 'Comer algo 🍽', ...L(-2.5, D / 2 - 1.2), r: 0.9, act: () => o.open('eat') },
    { id: 'cama', label: 'Dormir y guardar 🛏', ...L(W / 2 - 2.0, D / 2 - 1.2), r: 1.1, act: () => o.open('bed') },
    { id: 'sofa', label: 'Sentarse en el sofá 🛋', ...L(-W / 2 + 1.5, -1.7), r: 1.0, act: () => o.request('sit', seats.sofa) },
    { id: 'escritorio', label: 'Ver los trabajos del barrio 📋', ...L(W / 2 - 1.5, -0.95), r: 0.9, act: () => o.open('jobs') },
    { id: 'lavatorio', label: 'Lavarse las manos 🫧', ...L(W / 2 - 0.5, -D / 2 + 1.35), r: 0.9, act: () => o.request('wash') },
  ];
  const entry = { id: 'entrar', label: 'Entrar a casa 🏠', x: doorX, y: gy, z: faceZ - 0.95, r: 1.4, act: () => o.request('enter') };

  /* ---------- estado ---------- */
  let inside = false, enters = 0, exits = 0, doorT = 0, doorOpen = 0;
  const hidden = [];
  const keep = new Set([inner, ...o.keep]);
  const lightSave = [];
  function showCity(on) {
    if (!on) { hidden.length = 0; for (const c of scene.children) if (!keep.has(c) && c.visible) { c.visible = false; hidden.push(c); } }
    else { for (const c of hidden) c.visible = true; hidden.length = 0; }
  }
  const api = {
    house, outside, garage, spawns, seats, spots, entry, O, size: { W, D, H },
    get inside() { return inside; },
    get group() { return inner; },
    /** área del interior para la cámara (modo «interior») */
    interior: { id: 'depto', name: 'Departamento de Mateo', x: O.x, z: O.z, y: O.y, w: W, d: D, h: H, light: [O.x, O.y + H - 0.4, O.z] },
    /** entra: agrega el sub-escenario y sus colisiones, oculta la ciudad, presta las luces; devuelve el punto de aparición */
    enter(spawn = 'door') {
      if (inside) return spawns[spawn] || spawns.door;
      inside = true; enters++;
      scene.add(inner);
      for (const b of boxes) b.ref = world.add(b, 'prop', { home: true });
      showCity(false);
      o.interiorLights.forEach((l, i) => { lightSave[i] = l.position.clone(); const s = lightSpots[i % lightSpots.length]; l.position.set(O.x + s[0], O.y + s[1], O.z + s[2]); });
      iLeaf.visible = true;
      return spawns[spawn] || spawns.door;
    },
    /** sale: quita el sub-escenario y sus colisiones, muestra la ciudad, devuelve las luces; devuelve el punto de salida */
    exit() {
      if (!inside) return outside;
      inside = false; exits++;
      world.remove(boxes.map(b => b.ref).filter(Boolean)); for (const b of boxes) b.ref = null;
      inner.removeFromParent();
      showCity(true);
      o.interiorLights.forEach((l, i) => { if (lightSave[i]) l.position.copy(lightSave[i]); });
      doorT = 0.9; // la puerta de calle queda abierta un momento y se cierra
      return outside;
    },
    /** puerta de calle: se abre al acercarse/usar y se cierra sola */
    openDoor(t = 0.9) { doorT = t; },
    update(dt) {
      doorT = Math.max(0, doorT - dt);
      const want = doorT > 0 ? 1 : 0; doorOpen += (want - doorOpen) * Math.min(1, dt * 9);
      hinge.rotation.y = -doorOpen * 1.45;
    },
    get doorOpen() { return doorOpen; },
    /** interactivos cercanos según dónde está Mateo */
    targets() { return inside ? spots : [entry]; },
    setDecor(list) { for (const k in decor) decor[k].visible = list.includes(k); },
    /** color de las ventanas según la hora (cielo de día, naranja al atardecer, azul noche) */
    setSky(hour) { const h = hour, c = M.win.color; if (h >= 7.5 && h < 17.5) c.setHex(0x9fd0ff); else if (h >= 17.5 && h < 20) c.setHex(0xf0a070); else if (h >= 5.5 && h < 7.5) c.setHex(0xe8b0a0); else c.setHex(0x1b2a50); },
    info() { return { inside, enters, exits, boxes: boxes.length, inWorld: world.boxes.filter(b => b.home).length, hidden: hidden.length, sceneHas: !!inner.parent, decor: Object.keys(decor).filter(k => decor[k].visible), doorOpen: +doorOpen.toFixed(2), missingProxies: proxies.missing.slice() }; },
    /** ¿algún punto de aparición/salida o asiento está dentro de un sólido? (prueba) */
    audit(solidAt) { const out = {}; for (const [k, p] of Object.entries({ ...spawns, outside })) out[k] = solidAt(p.x, p.y + 0.6, p.z); return out; },
  };
  void sofa; void fridge; void counter; void table; void bed; void ward; void windows;
  return api;
}
