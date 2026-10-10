// @ts-check
/* Derby de Chatarra — los tres escenarios: geometría estática fusionada, colisionadores, alturas (rampas y meseta),
   contenedores móviles, interruptores de barreras, torres de cajas, potenciadores, minas y decoración por calidad. */
import * as THREE from 'three';
import { Builder, vmat, shade, crateGeo, containerGeo, powerGeo, mineGeo } from './models.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
export const ARENA_NAMES = { deposito: 'Depósito Industrial', coliseo: 'Coliseo Desértico', neon: 'Arenas Neón' };

/** Cuña de rampa: sube de 0 (u=-hl) a h (u=+hl) a lo largo de +Z local. */
function wedgeGeo(hw, hl, h) {
  const g = new THREE.BoxGeometry(hw * 2, 1, hl * 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) > 0 ? h * (p.getZ(i) + hl) / (2 * hl) : 0);
  g.computeVertexNormals();
  return g;
}
/** Piso de baldosas (dos triángulos por baldosa, color por baldosa). */
function tileFloor(w, d, nx, nz, fn) {
  const pos = [], col = [];
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const x0 = -w / 2 + ix * w / nx, x1 = x0 + w / nx, z0 = -d / 2 + iz * d / nz, z1 = z0 + d / nz;
    pos.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0);
    _c.setHex(fn(ix, iz, (x0 + x1) / 2, (z0 + z1) / 2)).convertSRGBToLinear();
    for (let k = 0; k < 6; k++) col.push(_c.r, _c.g, _c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** Piso polar (anillos × sectores). */
function polarFloor(R, nr, ns, fn) {
  const pos = [], col = [];
  for (let ir = 0; ir < nr; ir++) for (let is = 0; is < ns; is++) {
    const r0 = R * ir / nr, r1 = R * (ir + 1) / nr, a0 = is / ns * TAU, a1 = (is + 1) / ns * TAU;
    const p = (r, a) => [Math.cos(a) * r, 0, Math.sin(a) * r];
    const A = p(r0, a0), B = p(r1, a0), C = p(r1, a1), D = p(r0, a1);
    pos.push(...A, ...C, ...B, ...A, ...D, ...C);
    _c.setHex(fn(ir, is)).convertSRGBToLinear();
    for (let k = 0; k < 6; k++) col.push(_c.r, _c.g, _c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** Cielo degradado (cúpula con color por vértice). */
function skyDome(top, horizon, bottom) {
  const g = new THREE.SphereGeometry(420, 20, 14);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  const a = new THREE.Color(top).convertSRGBToLinear(), b = new THREE.Color(horizon).convertSRGBToLinear(), c = new THREE.Color(bottom).convertSRGBToLinear();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 420;
    if (y >= 0) _c.copy(b).lerp(a, Math.pow(y, 0.6)); else _c.copy(b).lerp(c, Math.min(1, -y * 4));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  return m;
}
/** Textura procedural de grilla neón. */
function neonGridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = '#0b0618'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#120a26'; g.fillRect(8, 8, 240, 240);
  g.shadowColor = '#ff3cc8'; g.shadowBlur = 12; g.strokeStyle = '#ff4fd8'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 252);
  g.shadowColor = '#3cf0ff'; g.strokeStyle = 'rgba(60,240,255,.55)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(128, 2); g.lineTo(128, 254); g.moveTo(2, 128); g.lineTo(254, 128); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(12, 12); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/**
 * @param {'deposito'|'coliseo'|'neon'} id
 * @param {{session:any, q:any, repairs:number, padRespawn:number, rand:()=>number}} ctx
 */
export function createArena(id, ctx) {
  const R = ctx.rand;
  const group = new THREE.Group();
  const mats = { v: vmat(), glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) };
  const S = new Builder(), N = new Builder();
  const sess = ctx.session;
  sess.ramps = sess.ramps || {}; sess.containers = sess.containers || {}; sess.switches = sess.switches || {};

  const A = {
    id, name: ARENA_NAMES[id], group, time: 0,
    /** @type {{type:'planes', planes:{nx:number,nz:number,d:number}[]}|{type:'circle', r:number}} */ bounds: /** @type {any} */ (null),
    env: /** @type {any} */ (null),
    /** @type {any[]} */ boxes: [], /** @type {any[]} */ circles: [], /** @type {any[]} */ heights: [],
    /** @type {any[]} */ ramps: [], /** @type {any[]} */ containers: [], /** @type {any[]} */ switches: [], /** @type {any[]} */ barriers: [],
    /** @type {any[]} */ towers: [], /** @type {any[]} */ pads: [], /** @type {any[]} */ zones: [], /** @type {{x:number,z:number,yaw:number}[]} */ spawns: [],
    /** @type {any[]} */ mines: [], /** @type {{mesh:THREE.InstancedMesh, full:number}[]} */ decor: [],
    /** @type {any} */ gate: null, repairsLeft: ctx.repairs, crowd: /** @type {THREE.Object3D|null} */ (null), cheer: 0,
    heightAt, zoneAt, rampAt, inside,
    update, applyQuality, destroyTower, toggleSwitch, derail, dropMine, dispose,
  };

  /* ---------- consultas ---------- */
  function heightAt(x, z) {
    let h = 0;
    for (const r of A.heights) {
      const dx = x - r.x, dz = z - r.z;
      if (r.type === 'ramp') {
        const u = dx * r.s + dz * r.c, v = dx * r.c - dz * r.s;
        if (v <= r.hw && v >= -r.hw && u >= -r.hl && u <= r.hl) { const hh = r.h * (u + r.hl) / (2 * r.hl); if (hh > h) h = hh; }
      } else if (dx * dx + dz * dz <= r.r * r.r && r.h > h) h = r.h;
    }
    return h;
  }
  function rampAt(x, z) {
    for (const r of A.ramps) { const dx = x - r.x, dz = z - r.z, u = dx * r.s + dz * r.c, v = dx * r.c - dz * r.s; if (Math.abs(v) <= r.hw + 0.3 && Math.abs(u) <= r.hl + 0.3) return r; }
    return null;
  }
  function zoneAt(x, z) {
    for (const q of A.zones) { const dx = x - q.x, dz = z - q.z; if (dx * dx + dz * dz < q.r * q.r) return q.kind; }
    return '';
  }
  function inside(x, z, m) {
    const b = A.bounds;
    if (b.type === 'circle') return Math.hypot(x, z) < b.r - m;
    for (const p of b.planes) if (x * p.nx + z * p.nz > p.d - m) return false;
    return true;
  }

  /* ---------- piezas ---------- */
  function spawnRing(r, angs) { for (const a of angs) { const x = Math.cos(a * Math.PI / 180) * r, z = Math.sin(a * Math.PI / 180) * r; A.spawns.push({ x, z, yaw: Math.atan2(-x, -z) }); } }
  function addRamp(rid, x, z, yaw, hw, hl, h, color = 0x8a8f96) {
    const s = Math.sin(yaw), c = Math.cos(yaw);
    S.add(wedgeGeo(hw, hl, h), color, [x, 0, z, 0, yaw, 0]);
    // costados y franjas de peligro sobre la pendiente
    const pitch = -Math.atan2(h, 2 * hl);
    for (let k = 0; k < 4; k++) {
      const u = -hl + 1.0 + k * (2 * hl - 1.8) / 3, y = h * (u + hl) / (2 * hl) + 0.04;
      S.add(new THREE.BoxGeometry(hw * 1.7, 0.05, 0.5), k % 2 ? 0x1b1b1b : 0xffc21a, [x + s * u, y, z + c * u, pitch, yaw, 0, 1, 1, 1, 'YXZ']);
    }
    // luces de borde (se encienden al usarla: estado de la sesión)
    const L = new Builder();
    for (let k = 0; k < 5; k++) {
      const u = -hl + 0.6 + k * (2 * hl - 1.2) / 4, y = h * (u + hl) / (2 * hl) + 0.12;
      for (const v of [-hw + 0.15, hw - 0.15]) L.box(0.22, 0.18, 0.22, 0xffffff, x + s * u + c * v, y, z + c * u - s * v);
    }
    const lm = new THREE.MeshBasicMaterial({ color: 0x555555, toneMapped: false });
    const lights = new THREE.Mesh(L.build(), lm); group.add(lights);
    const st = sess.ramps[rid] || (sess.ramps[rid] = { used: 0, best: 0 });
    const ramp = { id: rid, x, z, yaw, s, c, hw, hl, h, type: 'ramp', lights, lm, st, pulse: 0 };
    A.heights.push(ramp); A.ramps.push(ramp);
    return ramp;
  }
  function addBox(x, z, hx, hz, rot, top, kind = 'wall', extra = {}) {
    const b = { x, z, hx, hz, rot, c: Math.cos(rot), s: Math.sin(rot), top, on: true, kind, vx: 0, vz: 0, ...extra };
    A.boxes.push(b); return b;
  }
  function addCircle(x, z, r, top, kind = 'post', extra = {}) { const c = { x, z, r, top, on: true, kind, ...extra }; A.circles.push(c); return c; }
  /** contenedor que se desliza entre dos puntos por un riel */
  function addContainer(cid, ax, az, bx, bz, color, len = 12, speed = 4) {
    const rot = Math.atan2(-(bz - az), bx - ax); // eje largo local X a lo largo del riel
    const dist = Math.hypot(bx - ax, bz - az);
    // riel
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, rl = dist + len;
    for (const off of [-0.9, 0.9]) S.add(new THREE.BoxGeometry(rl, 0.1, 0.18), 0x3a3a3a, [mx - Math.sin(rot) * off, 0.05, mz - Math.cos(rot) * off, 0, rot, 0]);
    for (let k = 0; k <= Math.floor(rl / 2); k++) { const t = -rl / 2 + k * 2; S.add(new THREE.BoxGeometry(0.3, 0.06, 2.4), 0x5a4a3a, [mx + Math.cos(rot) * t, 0.03, mz - Math.sin(rot) * t, 0, rot, 0]); }
    for (const off of [-1.6, 1.6]) S.add(new THREE.BoxGeometry(rl, 0.04, 0.25), 0xffc21a, [mx - Math.sin(rot) * off, 0.02, mz - Math.cos(rot) * off, 0, rot, 0]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.25, color, emissive: id === 'neon' ? color : 0x000000, emissiveIntensity: id === 'neon' ? 0.35 : 0 });
    const mesh = new THREE.Mesh(containerGeo(len), mat); mesh.castShadow = mesh.receiveShadow = true;
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.35, 8), new THREE.MeshBasicMaterial({ color: 0xffa020, toneMapped: false }));
    beacon.position.set(len / 2 - 0.8, 2.8, 0); mesh.add(beacon);
    const beacon2 = beacon.clone(); beacon2.material = beacon.material; beacon2.position.x = -len / 2 + 0.8; mesh.add(beacon2);
    group.add(mesh);
    const st = sess.containers[cid] || (sess.containers[cid] = { derailed: false, t: 0 });
    const box = addBox(ax, az, len / 2, 1.3, rot, 2.6, 'container');
    const C = { id: cid, ax, az, bx, bz, rot, len, speed, t: st.t, dir: 1, wait: 0.5, st, mesh, beacon, box, smokeT: 0, moving: false };
    box.ref = C;
    placeContainer(C, 0);
    A.containers.push(C);
    return C;
  }
  function placeContainer(C, dt) {
    const x = C.ax + (C.bx - C.ax) * C.t, z = C.az + (C.bz - C.az) * C.t;
    if (dt > 0) { C.box.vx = (x - C.box.x) / dt; C.box.vz = (z - C.box.z) / dt; }
    C.box.x = x; C.box.z = z;
    C.mesh.position.set(x, C.st.derailed ? -0.15 : 0, z);
    C.mesh.rotation.set(0, C.rot + (C.st.derailed ? 0.28 : 0), C.st.derailed ? 0.1 : 0);
    if (C.st.derailed) { C.box.rot = C.rot + 0.28; C.box.c = Math.cos(C.box.rot); C.box.s = Math.sin(C.box.rot); C.box.vx = C.box.vz = 0; }
  }
  /** barrera que sube y baja (hierro o eléctrica) */
  function addBarrier(bid, x, z, hx, rot, elec, startUp = false) {
    const hgt = elec ? 1.8 : 2.2;
    const B = new Builder();
    if (elec) {
      B.box(hx * 2, hgt * 0.85, 0.12, 0xffffff, 0, hgt * 0.45, 0);
    } else {
      for (let k = 0; k <= Math.round(hx * 2 / 0.7); k++) B.box(0.14, hgt, 0.14, 0x3a3d42, -hx + k * 0.7, hgt / 2, 0);
      B.box(hx * 2, 0.18, 0.18, 0x55595e, 0, hgt - 0.2, 0); B.box(hx * 2, 0.18, 0.18, 0x55595e, 0, hgt * 0.45, 0);
      for (let k = 0; k <= Math.round(hx * 2 / 0.7); k++) B.cone(0.1, 0.35, 4, 0x8a8f96, -hx + k * 0.7, hgt + 0.15, 0);
    }
    const mat = elec ? new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x3cf0ff, transparent: true, opacity: 0.55, toneMapped: false, side: THREE.DoubleSide, depthWrite: false }) : mats.v;
    const mesh = new THREE.Mesh(B.build(), mat);
    mesh.position.set(x, 0, z); mesh.rotation.y = rot; group.add(mesh);
    // postes fijos y ranura en el piso
    for (const sx of [-1, 1]) {
      const px = x + Math.cos(rot) * sx * (hx + 0.35), pz = z - Math.sin(rot) * sx * (hx + 0.35);
      S.cyl(0.42, 0.5, hgt + 0.3, 8, elec ? 0x1a1a2a : 0xd8a820, px, (hgt + 0.3) / 2, pz);
      (elec ? N : S).cyl(0.3, 0.3, 0.25, 8, elec ? 0x3cf0ff : 0x222222, px, hgt + 0.42, pz);
      addCircle(px, pz, 0.5, hgt + 0.6, 'post');
    }
    S.add(new THREE.BoxGeometry(hx * 2, 0.04, 0.5), 0x1a1a1a, [x, 0.02, z, 0, rot, 0]);
    const st = sess.switches['b:' + bid];
    const up = st === undefined ? startUp : st;
    const box = addBox(x, z, hx, 0.35, rot, hgt, elec ? 'elec' : 'barrier');
    const bar = { id: bid, x, z, hx, rot, elec, up, anim: up ? 1 : 0, hgt, mesh, box, mat };
    box.on = up; box.ref = bar;
    mesh.position.y = up ? 0 : -hgt - 0.1;
    A.barriers.push(bar);
    return bar;
  }
  function addSwitch(sid, x, z, targets, label) {
    S.cyl(1.9, 2.1, 0.12, 16, 0x2a2c30, x, 0.06, z);
    S.cyl(2.1, 2.1, 0.05, 16, 0xffc21a, x, 0.03, z);
    const btnMat = new THREE.MeshStandardMaterial({ color: 0xd8302a, emissive: 0x6a0a08, roughness: 0.5 });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.28, 16), btnMat); btn.position.set(x, 0.2, z); group.add(btn);
    // poste con lámpara indicadora
    S.box(0.18, 2.6, 0.18, 0x3a3a3a, x + 2.3, 1.3, z);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false })); lamp.position.set(x + 2.3, 2.75, z); group.add(lamp);
    const on = targets.some(b => b.up);
    const sw = { id: sid, x, z, r: 2.0, targets, label, on, btn, btnMat, lamp, cool: 0, inside: false, press: 0 };
    paintSwitch(sw);
    A.switches.push(sw);
    return sw;
  }
  function paintSwitch(sw) {
    sw.btnMat.color.setHex(sw.on ? 0x3ad35a : 0xd8302a); sw.btnMat.emissive.setHex(sw.on ? 0x0a5a1a : 0x6a0a08);
    /** @type {THREE.MeshBasicMaterial} */ (sw.lamp.material).color.setHex(sw.on ? 0x4dff6a : 0xff3020);
  }
  function addTower(tid, x, z) {
    const crates = [];
    const sz = 1.15;
    for (let ly = 0; ly < 4; ly++) for (let i = 0; i < 4; i++) {
      const ox = (i % 2 - 0.5) * sz * 1.02, oz = (Math.floor(i / 2) - 0.5) * sz * 1.02;
      crates.push({ x: x + ox, y: sz / 2 + ly * sz, z: z + oz, vx: 0, vy: 0, vz: 0, rx: 0, ry: (R() - 0.5) * 0.25, rz: 0, wx: 0, wy: 0, wz: 0, fly: false, idx: 0 });
    }
    const col = addCircle(x, z, 1.75, 4.6, 'tower');
    const T = { id: tid, x, z, alive: true, crates, col, t: 0 };
    col.ref = T;
    S.cyl(2.0, 2.0, 0.05, 12, 0x5a4a3a, x, 0.02, z);
    A.towers.push(T);
    return T;
  }
  function addPad(x, z) {
    S.cyl(1.6, 1.8, 0.16, 12, 0x2a2c30, x, 0.08, z);
    N.add(new THREE.TorusGeometry(1.45, 0.08, 4, 20), 0xb8f52a, [x, 0.18, z, Math.PI / 2, 0, 0]);
    const mesh = new THREE.Mesh(powerGeos.nitro, mats.v); mesh.position.set(x, 1.3, z); mesh.castShadow = true; group.add(mesh);
    const P = { x, z, type: '', t: 0.5 + R() * 2, mesh };
    mesh.visible = false;
    A.pads.push(P);
    return P;
  }
  function addZone(x, z, r, kind) {
    if (kind === 'oil') {
      S.cyl(r, r, 0.03, 14, 0x0e0c12, x, 0.015, z);
      S.cyl(r * 0.55, r * 0.6, 0.035, 10, 0x2a2240, x + r * 0.2, 0.02, z - r * 0.1);
    } else if (kind === 'sand') {
      for (let k = 0; k < 4; k++) S.add(new THREE.TorusGeometry(r * (0.3 + k * 0.22), 0.12, 3, 24), shade(0xc9a46a, 0.75 - k * 0.04), [x, 0.03, z, Math.PI / 2, 0, 0]);
      S.cyl(r, r, 0.02, 18, 0xb08a52, x, 0.01, z);
    } else if (kind === 'boost') {
      S.cyl(r + 0.3, r + 0.3, 0.03, 16, 0x101020, x, 0.015, z);
      for (let k = 0; k < 3; k++) N.add(new THREE.TorusGeometry(r * (0.4 + k * 0.28), 0.08, 3, 20), k % 2 ? 0xff4fd8 : 0x3cf0ff, [x, 0.06, z, Math.PI / 2, 0, 0]);
    }
    A.zones.push({ x, z, r, kind });
  }
  /** decoración instanciada cuyo conteo depende de la calidad */
  function decor(geo, mat, list, colorFn) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((d, i) => {
      _m.compose(_p.set(d[0], d[1], d[2]), _q.setFromEuler(_e.set(0, d[3] || 0, 0)), _s.set(d[4] || 1, d[5] || 1, d[6] || 1));
      mesh.setMatrixAt(i, _m);
      if (colorFn) mesh.setColorAt(i, _c.setHex(colorFn(i)));
    });
    mesh.frustumCulled = false;
    group.add(mesh); A.decor.push({ mesh, full: list.length });
    return mesh;
  }
  const powerGeos = { nitro: powerGeo('nitro'), iman: powerGeo('iman'), escudo: powerGeo('escudo'), trampa: powerGeo('trampa'), repair: powerGeo('repair') };
  const mineG = mineGeo();
  const crateG = crateGeo();

  /* ====================== ESCENARIOS ====================== */
  if (id === 'deposito') buildDeposito(); else if (id === 'coliseo') buildColiseo(); else buildNeon();

  function buildDeposito() {
    const HX = 46, HZ = 34;
    A.bounds = { type: 'planes', planes: [{ nx: 1, nz: 0, d: HX }, { nx: -1, nz: 0, d: HX }, { nx: 0, nz: 1, d: HZ }, { nx: 0, nz: -1, d: HZ }] };
    A.env = { bg: 0xaab7c0, fog: 0xb8b3a6, sky: [0x5f86a8, 0xe0d7c4, 0x8a8478], hemi: [0xeef4fa, 0x6a6258, 1.6], sun: [0xffe6c4, 2.6], sunDir: [30, 55, 20], exposure: 1.0 };
    S.parts.push(tileFloor(140, 110, 28, 22, (ix, iz, x, z) => {
      const inArena = Math.abs(x) < HX + 2 && Math.abs(z) < HZ + 2;
      const n = ((ix * 7 + iz * 13) % 5) / 5;
      return inArena ? shade(0xb0ada4, 0.88 + n * 0.14) : shade(0x7f7a70, 0.9 + n * 0.1);
    }));
    // pintura: círculo central y franjas
    S.add(new THREE.TorusGeometry(9, 0.25, 3, 40), 0xf2f0e6, [0, 0.02, 0, Math.PI / 2, 0, 0]);
    S.add(new THREE.TorusGeometry(4, 0.2, 3, 30), 0xffc21a, [0, 0.02, 0, Math.PI / 2, 0, 0]);
    for (let k = -5; k <= 5; k++) S.box(2.2, 0.03, 0.5, k % 2 ? 0x1b1b1b : 0xffc21a, k * 4, 0.015, HZ - 1.2, 0.6);
    for (let k = -5; k <= 5; k++) S.box(2.2, 0.03, 0.5, k % 2 ? 0x1b1b1b : 0xffc21a, k * 4, 0.015, -HZ + 1.2, 0.6);
    // muralla de contenedores (instanciados, con color por instancia)
    const contCols = [0xb8432f, 0x2f6fb8, 0x3f8f4a, 0xd8892a, 0x2a9a9a, 0x7a4fa0, 0x9a9a9a];
    const wall = [];
    for (let i = 0; i < 9; i++) for (const sz of [-1, 1]) for (let t = 0; t < 2; t++) if (t === 0 || R() < 0.7) wall.push([-48 + i * 12, t * 2.6, sz * (HZ + 1.5), 0]);
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) for (let t = 0; t < 2; t++) if (t === 0 || R() < 0.7) wall.push([sx * (HX + 1.5), t * 2.6, -30 + i * 12, Math.PI / 2]);
    const wm = new THREE.InstancedMesh(containerGeo(12), vmat({ metalness: 0.3 }), wall.length);
    wall.forEach((d, i) => { _m.compose(_p.set(d[0], d[1], d[2]), _q.setFromEuler(_e.set(0, d[3], 0)), _s.set(1, 1, 1)); wm.setMatrixAt(i, _m); wm.setColorAt(i, _c.setHex(contCols[Math.floor(R() * contCols.length)])); });
    wm.castShadow = wm.receiveShadow = true; group.add(wm);
    // grúa pórtico
    for (const x of [-22, 22]) for (const z of [-HZ - 8, -HZ - 18]) { S.box(1.2, 26, 1.2, 0xf2c12e, x, 13, z); }
    S.box(46, 2, 2, 0xf2c12e, 0, 26, -HZ - 8); S.box(46, 2, 2, 0xf2c12e, 0, 26, -HZ - 18);
    S.box(4, 3, 12, 0x333333, 6, 24.5, -HZ - 13); S.box(0.15, 14, 0.15, 0x222222, 6, 16, -HZ - 13);
    for (let k = 0; k < 10; k++) S.box(0.25, 0.25, 9.6, 0xd8a820, -20 + k * 4.4, 13, -HZ - 13, 0, 0.8);
    // torres de iluminación
    for (const [x, z] of [[-50, -38], [50, -38], [-50, 38], [50, 38]]) {
      S.cyl(0.35, 0.5, 22, 6, 0x555a60, x, 11, z);
      S.box(3.4, 1.2, 0.6, 0x333333, x, 22.4, z);
      N.box(3.0, 0.8, 0.1, 0xfff4d0, x - Math.sign(x) * 0.0, 22.4, z - Math.sign(z) * 0.36);
    }
    // pilas de neumáticos (colisionan)
    for (const [x, z] of [[-41, -29], [41, -29], [-41, 29], [41, 29]]) {
      for (let k = 0; k < 4; k++) S.add(new THREE.TorusGeometry(0.9, 0.42, 6, 12), 0x1d1d20, [x + (k % 2) * 0.3, 0.4 + k * 0.62, z, Math.PI / 2, 0, 0]);
      addCircle(x, z, 1.5, 2.6, 'tires');
    }
    // barriles sueltos (decoración junto a la muralla)
    const barrels = [];
    for (let i = 0; i < 26; i++) { const sx = R() < 0.5 ? -1 : 1; barrels.push([sx * (HX + 4 + R() * 6), 0.6, -40 + R() * 80, R() * 3]); }
    const bg = new Builder().cyl(0.45, 0.45, 1.2, 10, 0xffffff).cyl(0.47, 0.47, 0.08, 10, 0x333333, 0, 0.3).cyl(0.47, 0.47, 0.08, 10, 0x333333, 0, -0.3).build();
    decor(bg, vmat(), barrels, i => [0x2f6fb8, 0xd8402a, 0x3f8f4a, 0xe0b02a][i % 4]);
    // chatarra apilada fuera de la muralla
    const scrap = [];
    for (let i = 0; i < 40; i++) { const a = R() * TAU, r = 62 + R() * 30; scrap.push([Math.cos(a) * r, 0.5, Math.sin(a) * r * 0.8, R() * 3, 2 + R() * 3, 1 + R() * 2.5, 2 + R() * 3]); }
    decor(new THREE.IcosahedronGeometry(1, 0), vmat({ vertexColors: false, color: 0xffffff }), scrap, () => [0x7a4a2a, 0x5a5a5a, 0x8a6a3a, 0x4a3a2a][Math.floor(R() * 4)]);
    // interactivos
    addRamp('d_r1', -22, -2, Math.PI / 2, 2.6, 3.6, 2.5);
    addRamp('d_r2', 22, 2, -Math.PI / 2, 2.6, 3.6, 2.5);
    addContainer('d_c1', -22, 13, 2, 13, 0xd8602a);
    addContainer('d_c2', 22, -13, -2, -13, 0x2a7ad8);
    const bc = addBarrier('d_b1', 0, 0, 6.5, Math.PI / 2, false, false);
    addSwitch('d_s1', -30, 22, [bc], 'Barrera central');
    addTower('d_t1', -36, -22); addTower('d_t2', 36, 22); addTower('d_t3', 8, -26);
    addZone(-26, -26, 4, 'oil'); addZone(14, 24, 3.6, 'oil');
    for (const [x, z] of [[-38, 10], [38, -10], [12, 22], [-12, -22], [28, -26]]) addPad(x, z);
    A.spawns.push({ x: 0, z: 21, yaw: Math.PI }, { x: -38, z: -26, yaw: Math.atan2(38, 26) }, { x: 38, z: -26, yaw: Math.atan2(-38, 26) }, { x: -38, z: 26, yaw: Math.atan2(38, -26) }, { x: 38, z: 26, yaw: Math.atan2(-38, -26) });
  }

  function buildColiseo() {
    const RR = 42;
    A.bounds = { type: 'circle', r: RR };
    A.env = { bg: 0xf0d2a0, fog: 0xecc994, sky: [0x3a86d6, 0xf6d9a6, 0xc8a070], hemi: [0xfff0d8, 0x8a6a44, 1.3], sun: [0xfff0cc, 2.5], sunDir: [-25, 60, 18], exposure: 1.0 };
    S.parts.push(polarFloor(RR + 2, 9, 40, (ir, is) => shade(0xd8b47a, 0.88 + ((ir * 3 + is * 7) % 5) * 0.035 - (ir === 5 ? 0.06 : 0))));
    S.parts.push(polarFloor(160, 1, 40, () => 0xc9a46a).translate(0, -0.02, 0));
    // muro y tribunas escalonadas
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = (i + 0.5) / segs * TAU, ca = Math.cos(a), sa = Math.sin(a), w = TAU * (RR + 0.7) / segs + 0.1;
      S.add(new THREE.BoxGeometry(w, 4.2, 1.4), i % 5 === 0 ? 0xa8875a : 0xc49d68, [ca * (RR + 0.7), 2.1, sa * (RR + 0.7), 0, -a + Math.PI / 2, 0]);
      S.add(new THREE.BoxGeometry(w * 0.5, 2.4, 0.2), 0x5a3f28, [ca * (RR - 0.05), 1.6, sa * (RR - 0.05), 0, -a + Math.PI / 2, 0]);
      for (let t = 0; t < 4; t++) {
        const r = RR + 2.2 + t * 2.4, ww = TAU * r / segs + 0.15;
        S.add(new THREE.BoxGeometry(ww, 1.4, 2.4), shade(0xb89466, 1 - t * 0.05), [ca * r, 4.4 + t * 1.4, sa * r, 0, -a + Math.PI / 2, 0]);
      }
      if (i % 4 === 0) { S.box(0.4, 4, 0.4, 0x6a4a2a, ca * (RR + 12), 12, sa * (RR + 12)); S.add(new THREE.BoxGeometry(2.2, 1.6, 0.08), i % 8 ? 0xd8402a : 0x2a6ad8, [ca * (RR + 12) + sa * 1.2, 13, sa * (RR + 12) - ca * 1.2, 0, -a, 0]); }
    }
    // público (instanciado, se mueve al festejar)
    const crowd = [];
    for (let i = 0; i < 700; i++) { const t = Math.floor(R() * 4), a = R() * TAU, r = RR + 2.2 + t * 2.4 + (R() - 0.5) * 1.2; crowd.push([Math.cos(a) * r, 5.6 + t * 1.4, Math.sin(a) * r, -a, 0.55, 0.9 + R() * 0.3, 0.45]); }
    const cg = new Builder().box(1, 1, 1, 0xffffff).sphere(0.42, 0xe8c09a, 0, 0.8, 0, 1, 1, 1, 0).build();
    A.crowd = decor(cg, vmat(), crowd, () => [0xd8402a, 0x2a6ad8, 0xf2c12e, 0x3fa04a, 0xf2f0e6, 0x9a4fd0][Math.floor(R() * 6)]);
    // dunas lejanas
    const dunes = [];
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + R() * 0.2, r = 110 + R() * 50; dunes.push([Math.cos(a) * r, -2, Math.sin(a) * r, R() * 3, 30 + R() * 25, 8 + R() * 10, 22 + R() * 20]); }
    decor(new THREE.IcosahedronGeometry(1, 1), vmat({ vertexColors: false, color: 0xd9b27a }), dunes);
    // meseta central con rampas
    S.cyl(7, 7.4, 2.4, 14, 0x9a7a52, 0, 1.2, 0);
    S.cyl(7.02, 7.02, 0.12, 14, 0xd8b47a, 0, 2.42, 0);
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; S.box(1.2, 0.5, 0.7, 0x7a5a3a, Math.cos(a) * 7.1, 0.25 + (k % 2) * 0.9, Math.sin(a) * 7.1, -a); }
    A.heights.push({ type: 'disc', x: 0, z: 0, r: 7, h: 2.4 });
    addRamp('c_rn', 0, 10.4, Math.PI, 2.6, 3.6, 2.4, 0x9a7a52);
    addRamp('c_rs', 0, -10.4, 0, 2.6, 3.6, 2.4, 0x9a7a52);
    addRamp('c_k1', -28, 0, Math.PI / 2, 2.4, 3.2, 2.2);
    addRamp('c_k2', 28, 0, -Math.PI / 2, 2.4, 3.2, 2.2);
    // columnas
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, x = Math.cos(a) * 25, z = Math.sin(a) * 25;
      S.cyl(1.3, 1.5, 8, 10, 0xd2b58a, x, 4, z); S.box(3.2, 0.8, 3.2, 0xb8976a, x, 8.4, z); S.box(3.4, 0.6, 3.4, 0xa8875a, x, 0.3, z);
      addCircle(x, z, 1.7, 9, 'pillar');
    }
    // rastrillos de hierro + interruptores
    const g1 = addBarrier('c_g1', 0, 20, 7, 0, false, false);
    const g2 = addBarrier('c_g2', 0, -20, 7, 0, false, false);
    addSwitch('c_s1', -22, 24, [g1], 'Rastrillo norte');
    addSwitch('c_s2', 22, -24, [g2], 'Rastrillo sur');
    addZone(30, 22, 4.5, 'sand'); addZone(-30, -22, 4.5, 'sand');
    addTower('c_t1', -33, -8); addTower('c_t2', 33, 8); addTower('c_t3', -10, 33);
    for (const [x, z] of [[-4, -30], [20, -31], [-34, 16], [34, -16], [12, 14]]) addPad(x, z);
    spawnRing(32, [-90, -30, 210, 40, 140]);
  }

  function buildNeon() {
    const AP = 40;
    const planes = [];
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; planes.push({ nx: Math.cos(a), nz: Math.sin(a), d: AP }); }
    A.bounds = { type: 'planes', planes };
    A.env = { bg: 0x0a0418, fog: 0x1a0a30, sky: [0x05020f, 0x3a1060, 0x0a0418], hemi: [0xb8b0ff, 0x5a2a6a, 1.9], sun: [0xc8d4ff, 1.7], sunDir: [-20, 50, -30], exposure: 1.1 };
    const tex = neonGridTexture();
    const fm = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.35, metalness: 0.4 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(48, 8, Math.PI / 8).rotateX(-Math.PI / 2), fm); floor.receiveShadow = true; group.add(floor);
    const out = new THREE.Mesh(new THREE.CircleGeometry(220, 24).rotateX(-Math.PI / 2).translate(0, -0.05, 0), new THREE.MeshStandardMaterial({ color: 0x07040f, roughness: 0.9 })); group.add(out);
    mats.floorTex = tex; mats.floor = fm; mats.out = /** @type {any} */ (out.material);
    // muros del octógono con tiras de neón (el norte tiene el portón del jefe)
    const side = 2 * AP * Math.tan(Math.PI / 8) + 0.6;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, x = Math.cos(a) * (AP + 0.7), z = Math.sin(a) * (AP + 0.7), ry = -a + Math.PI / 2;
      if (k === 2) {
        for (const sx of [-1, 1]) { const off = sx * (side / 4 + 2.6); S.add(new THREE.BoxGeometry(side / 2 - 5.2, 3.2, 1.4), 0x1a1630, [off, 1.6, z, 0, ry, 0]); N.add(new THREE.BoxGeometry(side / 2 - 5.2, 0.18, 1.45), 0xff4fd8, [off, 3.0, z, 0, ry, 0]); }
        S.box(1.2, 7, 1.6, 0x2a2440, -5.6, 3.5, z); S.box(1.2, 7, 1.6, 0x2a2440, 5.6, 3.5, z); S.box(12.4, 1.2, 1.6, 0x2a2440, 0, 7.4, z);
        N.box(10, 0.3, 0.2, 0xff3040, 0, 6.6, z - 0.8);
        continue;
      }
      S.add(new THREE.BoxGeometry(side, 3.2, 1.4), 0x1a1630, [x, 1.6, z, 0, ry, 0]);
      N.add(new THREE.BoxGeometry(side, 0.18, 1.45), k % 2 ? 0x3cf0ff : 0xff4fd8, [x, 3.0, z, 0, ry, 0]);
      N.add(new THREE.BoxGeometry(side, 0.1, 1.45), k % 2 ? 0xff4fd8 : 0x3cf0ff, [x, 1.0, z, 0, ry, 0]);
      for (let t = 0; t < 3; t++) { const r = AP + 3 + t * 2.6; S.add(new THREE.BoxGeometry(2 * r * Math.tan(Math.PI / 8) + 1, 1.6, 2.6), shade(0x231c3a, 1 - t * 0.12), [Math.cos(a) * r, 3.6 + t * 1.6, Math.sin(a) * r, 0, ry, 0]); }
    }
    // portón del jefe
    const gm = new THREE.Mesh(new Builder().box(10, 6, 0.6, 0x2a2a3a, 0, 3, 0).box(10.2, 0.4, 0.7, 0xff3040, 0, 5.2, 0).box(10.2, 0.4, 0.7, 0xff3040, 0, 0.8, 0).box(0.4, 5, 0.7, 0xffc21a, 0, 3, 0).build(), mats.v);
    gm.position.set(0, 0, AP + 0.5); group.add(gm);
    A.gate = { mesh: gm, open: 0, want: 0, x: 0, z: AP + 0.5 };
    // ciudad de fondo: edificios + franjas luminosas
    const bl = [], strips = [];
    for (let i = 0; i < 70; i++) {
      const a = R() * TAU, r = 75 + R() * 110, h = 14 + R() * 60, w = 8 + R() * 12;
      bl.push([Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r, -a, w, h, w]);
      for (let s = 0; s < 3; s++) strips.push([Math.cos(a) * (r - w / 2 - 0.2), 4 + R() * (h - 6), Math.sin(a) * (r - w / 2 - 0.2), -a + Math.PI / 2, 0.3 + R() * 0.5, 0.25 + R() * 0.6, w * (0.4 + R() * 0.5)]);
    }
    decor(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x120c22, roughness: 0.8 }), bl);
    decor(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), strips, () => [0xff4fd8, 0x3cf0ff, 0xb8f52a, 0xffb020][Math.floor(R() * 4)]);
    addRamp('n_r1', -18, -6, Math.PI / 2, 2.8, 4.0, 3.0, 0x2a2440);
    addRamp('n_r2', 18, 6, -Math.PI / 2, 2.8, 4.0, 3.0, 0x2a2440);
    addContainer('n_c1', -27, -12, -27, 12, 0x2ad8e8, 8, 4.5);
    addContainer('n_c2', 27, 12, 27, -12, 0xe82ad0, 8, 4.5);
    const e1 = addBarrier('n_e1', 0, 15, 8, 0, true, false);
    const e2 = addBarrier('n_e2', 0, -15, 8, 0, true, false);
    addSwitch('n_s1', -12, 27, [e1], 'Barrera eléctrica norte');
    addSwitch('n_s2', 12, -27, [e2], 'Barrera eléctrica sur');
    addZone(-24, 22, 2.4, 'boost'); addZone(24, -22, 2.4, 'boost');
    addTower('n_t1', -28, -20); addTower('n_t2', 28, 20); addTower('n_t3', 0, 0);
    for (const [x, z] of [[-34, 6], [34, -6], [-8, 31], [8, -31], [0, -8]]) addPad(x, z);
    spawnRing(30, [-90, 0, 180, 50, -130]);
  }

  /* ---------- ensamblado ---------- */
  const staticMesh = new THREE.Mesh(S.build(), mats.v); staticMesh.receiveShadow = true; staticMesh.castShadow = true; group.add(staticMesh);
  const glowMesh = new THREE.Mesh(N.build(), mats.glow); group.add(glowMesh);
  group.add(skyDome(A.env.sky[0], A.env.sky[1], A.env.sky[2]));
  // cajas de las torres: un solo InstancedMesh
  const nCr = A.towers.reduce((n, t) => n + t.crates.length, 0);
  const crateMesh = new THREE.InstancedMesh(crateG, vmat(), Math.max(1, nCr));
  crateMesh.castShadow = crateMesh.receiveShadow = true; crateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let ci = 0;
  for (const T of A.towers) for (const c of T.crates) { c.idx = ci++; setCrate(c); crateMesh.setColorAt(c.idx, _c.setHex(id === 'neon' ? [0x6a5cff, 0xff6ad8, 0x3cf0ff][c.idx % 3] : shade(0xffffff, 0.85 + (c.idx % 3) * 0.08))); }
  crateMesh.count = nCr; group.add(crateMesh);
  function setCrate(c) { _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(c.rx, c.ry, c.rz)), _s.set(1.15, 1.15, 1.15)); crateMesh.setMatrixAt(c.idx, _m); }
  // minas (pool)
  const mineMesh = new THREE.InstancedMesh(mineG, vmat(), 16); mineMesh.count = 0; mineMesh.frustumCulled = false; group.add(mineMesh);
  applyQuality(ctx.q);

  /* ---------- acciones ---------- */
  function destroyTower(T, dirx, dirz, speed) {
    if (!T.alive) return false;
    T.alive = false; T.col.on = false; T.t = 0;
    for (const c of T.crates) {
      c.fly = true;
      const ox = c.x - T.x, oz = c.z - T.z;
      c.vx = dirx * speed * (0.45 + R() * 0.5) + ox * 3 + (R() - 0.5) * 4;
      c.vz = dirz * speed * (0.45 + R() * 0.5) + oz * 3 + (R() - 0.5) * 4;
      c.vy = 3 + R() * 6 + c.y * 0.8;
      c.wx = (R() - 0.5) * 9; c.wy = (R() - 0.5) * 9; c.wz = (R() - 0.5) * 9;
    }
    return true;
  }
  function toggleSwitch(sw) {
    sw.on = !sw.on; sw.press = 0.35;
    for (const b of sw.targets) { b.up = sw.on; sess.switches['b:' + b.id] = b.up; }
    paintSwitch(sw);
  }
  function derail(C) {
    if (C.st.derailed) return false;
    C.st.derailed = true; C.moving = false;
    /** @type {THREE.MeshBasicMaterial} */ (C.beacon.material).color.setHex(0x222222);
    placeContainer(C, 0);
    return true;
  }
  function dropMine(x, z, owner) {
    if (A.mines.length >= 16) A.mines.shift();
    A.mines.push({ x, z, owner, arm: 0.7, life: 30 });
  }

  /* ---------- actualización ---------- */
  /**
   * @param {number} dt
   * @param {any[]} cars
   * @param {{onPickup:(pad:any, car:any)=>boolean, onSwitch:(sw:any, car:any)=>void, onMine:(mine:any, car:any)=>void, player:any}} H
   */
  function update(dt, cars, H) {
    A.time += dt;
    const t = A.time;
    for (const C of A.containers) {
      if (C.st.derailed) { C.box.vx = C.box.vz = 0; continue; }
      const prevT = C.t;
      if (C.wait > 0) { C.wait -= dt; C.box.vx = C.box.vz = 0; C.moving = false; }
      else {
        const dist = Math.hypot(C.bx - C.ax, C.bz - C.az);
        C.t += C.dir * C.speed * dt / dist;
        if (C.t >= 1) { C.t = 1; C.dir = -1; C.wait = 1.6; } else if (C.t <= 0) { C.t = 0; C.dir = 1; C.wait = 1.6; }
        C.moving = true;
      }
      C.st.t = C.t;
      if (C.t !== prevT || C.wait > 0) placeContainer(C, dt);
      C.beacon.visible = C.moving ? (Math.sin(t * 14) > 0) : true;
      /** @type {THREE.MeshBasicMaterial} */ (C.beacon.material).color.setHex(C.moving ? 0xffa020 : 0x664010);
    }
    for (const b of A.barriers) {
      const want = b.up ? 1 : 0;
      if (b.anim !== want) { b.anim += Math.sign(want - b.anim) * dt * 1.8; if (Math.abs(b.anim - want) < 0.02) b.anim = want; }
      b.box.on = b.anim > 0.5;
      b.mesh.position.y = (b.anim - 1) * (b.hgt + 0.1);
      b.mesh.visible = b.anim > 0.01;
      if (b.elec) b.mat.opacity = 0.35 + 0.3 * Math.abs(Math.sin(t * 9 + b.x));
    }
    for (const sw of A.switches) {
      sw.cool -= dt; sw.press = Math.max(0, sw.press - dt);
      sw.btn.position.y = 0.2 - (sw.press > 0 ? 0.14 : 0);
      const p = H.player;
      const inside = !!p && !p.wrecked && p.y < 1.2 && Math.hypot(p.x - sw.x, p.z - sw.z) < sw.r + 0.6;
      if (inside && !sw.inside && sw.cool <= 0) { sw.cool = 1.0; toggleSwitch(sw); H.onSwitch(sw, p); }
      sw.inside = inside;
      sw.lamp.scale.setScalar(1 + 0.15 * Math.sin(t * 6));
    }
    for (const r of A.ramps) {
      r.pulse = Math.max(0, r.pulse - dt);
      const used = r.st.used > 0;
      r.lm.color.setHex(r.pulse > 0 ? (Math.sin(t * 30) > 0 ? 0xffffff : 0xb8f52a) : used ? 0xb8f52a : (Math.sin(t * 3 + r.x) > 0.6 ? 0xffc21a : 0x5a5030));
    }
    for (const P of A.pads) {
      if (!P.type) {
        P.t -= dt;
        if (P.t <= 0) {
          const opts = ['nitro', 'nitro', 'iman', 'iman', 'escudo', 'escudo', 'trampa', 'trampa'];
          if (A.repairsLeft > 0) opts.push('repair', 'repair', 'repair');
          P.type = opts[Math.floor(R() * opts.length)];
          P.mesh.geometry = /** @type {any} */ (powerGeos)[P.type]; P.mesh.visible = true;
        }
        continue;
      }
      P.mesh.rotation.y = t * 2; P.mesh.position.y = 1.3 + Math.sin(t * 3 + P.x) * 0.2;
      for (const c of cars) {
        if (c.wrecked || c.retired || c.isBoss || c.y > 2.5) continue;
        if ((c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 5.3) {
          if (H.onPickup(P, c)) { if (P.type === 'repair') A.repairsLeft--; P.type = ''; P.t = ctx.padRespawn; P.mesh.visible = false; }
          break;
        }
      }
    }
    // minas
    let mi = 0;
    for (let i = A.mines.length - 1; i >= 0; i--) {
      const M = A.mines[i];
      M.arm -= dt; M.life -= dt;
      if (M.life <= 0) { A.mines.splice(i, 1); continue; }
      if (M.arm <= 0) for (const c of cars) {
        if (c.wrecked || c.retired || c.y > 1.5 || (c === M.owner && M.arm > -1.2)) continue;
        if ((c.x - M.x) ** 2 + (c.z - M.z) ** 2 < (c.radius + 0.8) ** 2) { H.onMine(M, c); A.mines.splice(i, 1); break; }
      }
    }
    for (const M of A.mines) {
      _m.compose(_p.set(M.x, 0, M.z), _q.setFromEuler(_e.set(0, t * (M.arm > 0 ? 0 : 3), 0)), _s.setScalar(M.arm > 0 ? 0.7 : 1 + 0.08 * Math.sin(t * 12)));
      mineMesh.setMatrixAt(mi++, _m);
    }
    mineMesh.count = mi; mineMesh.instanceMatrix.needsUpdate = true;
    // cajas que vuelan
    let dirty = false;
    for (const T of A.towers) {
      if (T.alive) continue;
      T.t += dt;
      for (const c of T.crates) {
        if (!c.fly) continue;
        dirty = true;
        c.vy -= 22 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
        if (c.y < 0.55) { c.y = 0.55; c.vy *= -0.3; c.vx *= 0.7; c.vz *= 0.7; c.wx *= 0.6; c.wy *= 0.6; c.wz *= 0.6; if (Math.abs(c.vy) < 1 && Math.hypot(c.vx, c.vz) < 0.6) { c.fly = false; c.rx = Math.round(c.rx / (Math.PI / 2)) * Math.PI / 2; c.rz = Math.round(c.rz / (Math.PI / 2)) * Math.PI / 2; } }
        if (!inside(c.x, c.z, 0.6)) { c.vx *= -0.4; c.vz *= -0.4; c.x = Math.max(-80, Math.min(80, c.x)); }
        setCrate(c);
      }
      if (T.t > 6) for (const c of T.crates) if (c.fly) { c.fly = false; c.y = 0.55; setCrate(c); dirty = true; }
    }
    if (dirty) crateMesh.instanceMatrix.needsUpdate = true;
    if (A.gate) {
      const g = A.gate; g.open += (g.want - g.open) * Math.min(1, dt * 1.5);
      g.mesh.position.y = -g.open * 6.2;
    }
    if (A.crowd) { A.cheer = Math.max(0, A.cheer - dt); A.crowd.position.y = A.cheer > 0 ? Math.abs(Math.sin(t * 12)) * 0.35 : Math.abs(Math.sin(t * 2)) * 0.05; }
    if (mats.floorTex) mats.floor.emissiveIntensity = 0.75 + 0.15 * Math.sin(t * 1.7);
  }

  function applyQuality(q) {
    for (const d of A.decor) d.mesh.count = Math.max(1, Math.round(d.full * q.decor));
    if (mats.floorTex) { const an = q.decor < 0.5 ? 1 : q.decor < 1 ? 2 : 4; if (mats.floorTex.anisotropy !== an) { mats.floorTex.anisotropy = an; mats.floorTex.needsUpdate = true; } }
  }
  function dispose() {
    group.traverse(/** @param {any} o */ o => {
      if (o.geometry && !Object.values(powerGeos).includes(o.geometry)) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    Object.values(powerGeos).forEach(g => g.dispose());
    group.removeFromParent();
  }
  return A;
}
