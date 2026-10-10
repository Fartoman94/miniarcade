// @ts-check
/* Corsarios del Abismo — física naval arcade (vela con inercia, timón con momento, viento, flotación sobre las olas),
   colisiones barco-barco y barco-costa, y balas de cañón balísticas en pool (andanadas de costado con recarga).
   Ejes: adelante = (sin yaw, cos yaw); estribor (derecha) = (-cos yaw, sin yaw); babor = -estribor. */
import * as THREE from 'three';
import { SHIPS, WORLD_R } from './config.js';
import { shipModel } from './models.js';
import { waveHeight } from './water.js';

export const G = 18;            // gravedad de las balas
export const V0 = 34;           // velocidad de salida
export const MAX_RANGE = V0 * V0 / G * 0.98;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param {'player'|'goleta'|'lancha'|'galeon'} kind
 * @param {THREE.Object3D} parent
 * @param {{x:number,z:number,yaw:number, hpMul?:number, rand?:()=>number}} o
 */
export function createShip(kind, parent, o) {
  const spec = SHIPS[kind];
  const model = shipModel(kind, o.rand);
  parent.add(model.group);
  const hp = Math.round(spec.hp * (o.hpMul || 1));
  return {
    kind, spec, model, team: kind === 'player' ? 'player' : 'enemy',
    x: o.x, z: o.z, yaw: o.yaw, y: 0, pitch: 0, roll: 0, heel: 0,
    speed: 0, yawRate: 0, vx: 0, vz: 0, steer: 0, row: 0,
    sail: kind === 'player' ? 0 : 0.6, sailCur: kind === 'player' ? 0 : 0.6, speedMul: 1, turnMul: 1,
    hp, maxHp: hp, mast: spec.mast, maxMast: spec.mast, mastLost: false,
    reload: { L: 0, R: 0 }, reloadMax: spec.reload, balls: spec.balls,
    radius: spec.radius, len: spec.len, wid: spec.wid,
    alive: true, sinking: false, sinkT: 0, flashT: 0, scrapeT: 0, wakeT: 0, smokeT: 0,
    tele: { L: 0, R: 0 }, surrender: false, boarded: false, ai: /** @type {any} */ (null), dead: false, last: { x: o.x, z: o.z },
  };
}
/** @typedef {ReturnType<typeof createShip>} Ship */

/** Eficiencia del viento según el ángulo entre rumbo y hacia dónde sopla (1 = de popa, 0.42 = de proa). */
export function windEff(yaw, wind) { return 0.42 + 0.58 * (1 + Math.cos(yaw - wind.dir)) / 2; }

/**
 * Integra un barco. hooks.onCoast(ship, impact, isl) al tocar costa.
 * @param {Ship} s @param {number} dt @param {any} world @param {{dir:number,str:number}} wind @param {{onCoast?:Function}} hooks
 */
export function stepShip(s, dt, world, wind, hooks) {
  if (s.sinking) {
    s.sinkT += dt;
    s.speed *= Math.exp(-dt * 1.2);
    s.x += Math.sin(s.yaw) * s.speed * dt; s.z += Math.cos(s.yaw) * s.speed * dt;
    s.y = waveHeight(s.x, s.z) - s.sinkT * s.sinkT * 0.9;
    s.roll += dt * 0.35 * (s.kind === 'galeon' ? 0.5 : 1); s.pitch += dt * 0.12;
    return;
  }
  const spec = s.spec;
  s.sailCur += Math.sign(s.sail - s.sailCur) * Math.min(Math.abs(s.sail - s.sailCur), dt * 0.7);
  const mastF = s.mastLost ? 0.45 : 0.62 + 0.38 * s.mast / s.maxMast;
  let target = spec.speed * s.sailCur * windEff(s.yaw, wind) * (0.85 + 0.15 * wind.str) * mastF * s.speedMul;
  if (s.row && s.sailCur < 0.08) target = -2.2 * s.row;
  const k = target > s.speed ? 0.55 : 0.38;
  s.speed += (target - s.speed) * (1 - Math.exp(-dt * k));
  const steerK = 0.32 + 0.68 * Math.min(1, Math.abs(s.speed) / 6);
  const tgtRate = s.steer * spec.turn * s.turnMul * steerK * (s.speed < -0.5 ? -1 : 1);
  s.yawRate += (tgtRate - s.yawRate) * (1 - Math.exp(-dt * 2.2));
  s.yaw = wrap(s.yaw + s.yawRate * dt);
  s.vx *= Math.exp(-dt * 1.6); s.vz *= Math.exp(-dt * 1.6);
  s.last.x = s.x; s.last.z = s.z;
  s.x += (Math.sin(s.yaw) * s.speed + s.vx) * dt;
  s.z += (Math.cos(s.yaw) * s.speed + s.vz) * dt;
  // borde del mundo: arrecife invisible con corriente que devuelve
  const d = Math.hypot(s.x, s.z);
  if (d > WORLD_R) { s.x *= WORLD_R / d; s.z *= WORLD_R / d; s.speed *= 0.96; s.vx -= s.x / d * 3 * dt; s.vz -= s.z / d * 3 * dt; s.outT = (s.outT || 0) + dt; } else s.outT = 0;
  // costa
  const bx = s.x, bz = s.z;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), off = s.len * 0.28;
  // dos círculos (proa y popa) para un casco alargado
  for (const sg of [1, -1]) {
    const c = { x: s.x + fx * off * sg, z: s.z + fz * off * sg };
    const isl = world.pushOut(c, s.wid * 0.62);
    if (isl) { s.x += c.x - (s.x + fx * off * sg); s.z += c.z - (s.z + fz * off * sg); }
  }
  const moved = Math.hypot(s.x - bx, s.z - bz);
  if (moved > 0.0005) {
    const impact = Math.abs(s.speed);
    s.speed *= Math.exp(-dt * 6);
    if (hooks.onCoast) hooks.onCoast(s, impact);
  }
  // flotación
  const sx = -Math.cos(s.yaw), sz = Math.sin(s.yaw), L = s.len * 0.4, Wd = s.wid * 0.5;
  const hb = waveHeight(s.x + fx * L, s.z + fz * L), hs = waveHeight(s.x - fx * L, s.z - fz * L);
  const hr = waveHeight(s.x + sx * Wd, s.z + sz * Wd), hl = waveHeight(s.x - sx * Wd, s.z - sz * Wd);
  const damp = s.kind === 'galeon' ? 0.5 : 1;
  s.y += ((hb + hs + hr + hl) / 4 - (s.kind === 'galeon' ? 0.4 : 0.2) - s.y) * Math.min(1, dt * 6);
  s.pitch += (Math.atan2(hb - hs, 2 * L) * damp - s.pitch) * Math.min(1, dt * 5);
  s.heel += (-s.yawRate * Math.abs(s.speed) * 0.03 - s.heel) * Math.min(1, dt * 3);
  s.roll += (Math.atan2(hr - hl, 2 * Wd) * 0.6 * damp + s.heel - s.roll) * Math.min(1, dt * 5);
}

/** Aplica la pose al modelo (con un poco de inclinación por retroceso). @param {Ship} s */
export function poseShip(s, t) {
  const g = s.model.group;
  g.position.set(s.x, s.y, s.z);
  g.rotation.set(0, 0, 0);
  g.rotateY(s.yaw); g.rotateX(-s.pitch); g.rotateZ(s.roll);
  const furl = 0.18 + 0.82 * s.sailCur;
  for (const sl of s.model.sails) { sl.scale.set(1, s.mastLost && sl === s.model.sails[s.model.sails.length - 1] ? 0.15 : furl, 0.3 + 0.7 * s.sailCur); }
  s.model.flag.rotation.y = Math.PI / 2 + Math.sin(t * 6 + s.x) * 0.25;
}

/** Colisiones entre barcos (círculos proa/popa). onHit(a,b,rel,nx,nz). @param {Ship[]} list */
export function collideShips(list, onHit) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (!a.alive || !b.alive || a.sinking || b.sinking) continue;
    const dx0 = b.x - a.x, dz0 = b.z - a.z;
    if (dx0 * dx0 + dz0 * dz0 > (a.len + b.len) ** 2) continue;
    let best = null;
    for (const sa of [0.28, -0.28, 0]) for (const sb of [0.28, -0.28, 0]) {
      const ax = a.x + Math.sin(a.yaw) * a.len * sa, az = a.z + Math.cos(a.yaw) * a.len * sa;
      const bx = b.x + Math.sin(b.yaw) * b.len * sb, bz = b.z + Math.cos(b.yaw) * b.len * sb;
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 0.01, min = (a.wid + b.wid) * 0.6;
      if (d < min && (!best || min - d > best.pen)) best = { pen: min - d, nx: dx / d, nz: dz / d };
    }
    if (!best) continue;
    const ma = a.spec.len, mb = b.spec.len, tot = ma + mb;
    a.x -= best.nx * best.pen * mb / tot; a.z -= best.nz * best.pen * mb / tot;
    b.x += best.nx * best.pen * ma / tot; b.z += best.nz * best.pen * ma / tot;
    const va = Math.sin(a.yaw) * a.speed * best.nx + Math.cos(a.yaw) * a.speed * best.nz;
    const vb = Math.sin(b.yaw) * b.speed * best.nx + Math.cos(b.yaw) * b.speed * best.nz;
    const rel = va - vb;
    if (rel > 0.5) {
      const imp = rel * 0.8;
      a.vx -= best.nx * imp * mb / tot; a.vz -= best.nz * imp * mb / tot;
      b.vx += best.nx * imp * ma / tot; b.vz += best.nz * imp * ma / tot;
      a.speed *= 0.6; b.speed *= 0.8;
      onHit(a, b, rel, best.nx, best.nz);
    }
  }
}

/** Distancia de un punto (x,z) a la línea de crujía del barco. @param {Ship} s */
export function hullDist(s, x, z) {
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), h = s.len * 0.45;
  let t = (x - s.x) * fx + (z - s.z) * fz; t = Math.max(-h, Math.min(h, t));
  return Math.hypot(x - (s.x + fx * t), z - (s.z + fz * t));
}
/** ¿Qué parte del casco golpea un punto? 'bow'|'stern'|'side'. */
export function hitZone(s, x, z) {
  const t = ((x - s.x) * Math.sin(s.yaw) + (z - s.z) * Math.cos(s.yaw)) / (s.len * 0.5);
  return t > 0.6 ? 'bow' : t < -0.55 ? 'stern' : 'side';
}

/** Elevación para alcanzar distancia d (tiro bajo). */
export function elevationFor(d, dy = 0) {
  const v2 = V0 * V0, disc = v2 * v2 - G * (G * d * d + 2 * dy * v2);
  if (disc < 0 || d < 0.1) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (G * d));
}

/* ======================= balas ======================= */
const MAXB = 120;
/**
 * @param {THREE.Scene} scene
 */
export function createBalls(scene) {
  const geo = new THREE.IcosahedronGeometry(0.32, 1);
  const dark = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.6 }), MAXB);
  const spec = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x7affc8, toneMapped: false }), MAXB);
  for (const m of [dark, spec]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false; scene.add(m); }
  /** @type {any[]} */
  const list = [];
  const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
  for (let i = 0; i < MAXB; i++) list.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, team: '', owner: null, dmg: 0, spectral: false, big: 1, life: 0, home: null, mortar: false });
  return {
    list,
    get count() { return list.reduce((n, b) => n + (b.alive ? 1 : 0), 0); },
    /** @param {Partial<typeof list[0]>} o */
    spawn(o) {
      const b = list.find(x => !x.alive); if (!b) return null;
      Object.assign(b, { alive: true, life: 6, spectral: false, big: 1, home: null, mortar: false, ...o });
      return b;
    },
    clear() { for (const b of list) b.alive = false; },
    /** Integra y llama hit(b) para resolver impactos (devuelve true si la bala se consumió). */
    update(dt, hit) {
      for (const b of list) {
        if (!b.alive) continue;
        b.life -= dt;
        if (b.home && b.home.alive) { // bala espectral teledirigida (suave)
          const dx = b.home.x - b.x, dz = b.home.z - b.z, d = Math.hypot(dx, dz) || 1, sp = Math.hypot(b.vx, b.vz);
          b.vx += (dx / d * sp - b.vx) * Math.min(1, dt * 0.9); b.vz += (dz / d * sp - b.vz) * Math.min(1, dt * 0.9);
          b.vy = (waveHeight(b.x, b.z) + 1.4 - b.y) * 2;
        } else b.vy -= G * dt;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (b.life <= 0 || hit(b)) b.alive = false;
      }
      let nd = 0, ns = 0;
      for (const b of list) {
        if (!b.alive) continue;
        _m.compose(_p.set(b.x, b.y, b.z), _q, _s.setScalar(b.big));
        if (b.spectral) spec.setMatrixAt(ns++, _m); else dark.setMatrixAt(nd++, _m);
      }
      dark.count = nd; spec.count = ns;
      dark.instanceMatrix.needsUpdate = true; spec.instanceMatrix.needsUpdate = true;
    },
    dispose() { for (const m of [dark, spec]) { m.removeFromParent(); m.geometry.dispose(); /** @type {any} */ (m.material).dispose(); } },
  };
}

/**
 * Andanada de costado. side: +1 estribor (derecha), -1 babor (izquierda).
 * target: punto {x,z} para calcular elevación y desvío (o null: alcance por defecto).
 * @param {Ship} s @param {number} side @param {any} balls @param {{x:number,z:number}|null} target @param {{spread:number, dmg:number, spectral?:boolean, range?:number}} o
 */
export function fireBroadside(s, side, balls, target, o) {
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  const rx = -Math.cos(s.yaw) * side, rz = Math.sin(s.yaw) * side; // dirección del costado
  let dirYaw = Math.atan2(rx, rz), dist = o.range || 34;
  if (target) {
    const dx = target.x - s.x, dz = target.z - s.z;
    dist = Math.min(MAX_RANGE, Math.hypot(dx, dz));
    const want = Math.atan2(dx, dz), diff = wrap(want - dirYaw);
    dirYaw += Math.max(-0.45, Math.min(0.45, diff));
  }
  const elev = elevationFor(dist, target && target.y !== undefined ? target.y - (s.y + s.model.portY) : 0);
  const n = s.balls, ports = s.model.portZ.length ? s.model.portZ : [0];
  const out = [];
  for (let i = 0; i < n; i++) {
    const pz = ports[Math.round(i / Math.max(1, n - 1) * (ports.length - 1))] + (n > ports.length ? (i % 2 ? 0.5 : -0.5) : 0);
    const y0 = s.y + s.model.portY;
    const px = s.x + fx * pz + rx * (s.wid / 2 + 0.5), pzz = s.z + fz * pz + rz * (s.wid / 2 + 0.5);
    const ey = dirYaw + (Math.random() - 0.5) * 0.06 * o.spread, ee = elev + (Math.random() - 0.5) * 0.05 * o.spread;
    const h = Math.cos(ee) * V0;
    const b = balls.spawn({ x: px, y: y0, z: pzz, vx: Math.sin(ey) * h + fx * s.speed * 0.5, vy: Math.sin(ee) * V0, vz: Math.cos(ey) * h + fz * s.speed * 0.5,
      team: s.team, owner: s, dmg: o.dmg, spectral: !!o.spectral, big: s.kind === 'galeon' ? 1.6 : 1 });
    if (b) out.push(b);
  }
  return { out, dirYaw, elev, rx, rz, fx, fz };
}

/** Puntos de la parábola de una andanada (para la guía de puntería). */
export function arcPoints(x, y, z, yawDir, elev, n, outArr) {
  const h = Math.cos(elev) * V0, vy = Math.sin(elev) * V0, T = 2 * vy / G + 0.15;
  for (let i = 0; i < n; i++) {
    const t = T * i / (n - 1);
    outArr[i * 3] = x + Math.sin(yawDir) * h * t; outArr[i * 3 + 1] = Math.max(-0.5, y + vy * t - G * t * t / 2); outArr[i * 3 + 2] = z + Math.cos(yawDir) * h * t;
  }
}
