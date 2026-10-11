// Mateo: Ciudad de Altura — V2 P2: karts eléctricos de paseo (fase 09 del kit, con un encuadre apto para un
// protagonista niño: vehículos de juguete de velocidad limitada, sin marcas reales). Comprar en «Autos Lumen · Karts»,
// llamar al Garaje M (dársena frente a la casa), subir/bajar por proximidad, manejo arcade (acelerar, frenar, reversa,
// giro y derrape con freno de mano), cámara de persecución, colisiones con la ciudad (cápsula contra las mismas cajas
// que Mateo) y con el tránsito (rectángulos orientados), daño NO gráfico (abolladuras = barra de estado, humito y
// menos velocidad; se repara en el taller), frenado automático ante peatones (nunca se atropella a nadie) y los autos
// del tránsito frenan ante el kart. Persistencia: karts comprados, kart activo, dónde quedó estacionado y su estado.
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from './util.js';
import { poolMaterial } from './nightlights.js';

const _v = new THREE.Vector3();
const hex = h => typeof h === 'string' ? parseInt(h.slice(1), 16) : h;

/** malla del kart (procedural, original): chasis bajo, paragolpes, asiento, volante, barra antivuelco, 4 ruedas, faros */
function buildKart(def, color, metal) {
  const g = new THREE.Group(); g.name = 'kart_' + def.id;
  const body = new THREE.MeshStandardMaterial({ color: hex(color), roughness: metal ? 0.25 : 0.45, metalness: metal ? 0.65 : 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 }), chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.3, metalness: 0.7 });
  const seatM = new THREE.MeshStandardMaterial({ color: 0x1f2c52, roughness: 0.7 });
  const fam = def.style === 'familiar', sport = def.style === 'deportivo';
  const L = fam ? 2.7 : 2.3, Wd = fam ? 1.5 : 1.35;
  const m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  m(new THREE.BoxGeometry(Wd * 0.86, 0.16, L * 0.92), body, 0, 0.3, 0);                                   // piso/chasis
  m(new THREE.BoxGeometry(Wd * 0.9, 0.26, L * 0.3), body, 0, 0.47, L * 0.3);                              // trompa
  if (sport) m(new THREE.BoxGeometry(Wd * 0.5, 0.06, 0.42), body, 0, 0.92, -L * 0.48);                   // alerón
  m(new THREE.BoxGeometry(Wd * 0.98, 0.14, 0.18), dark, 0, 0.32, L * 0.5);                                 // paragolpes
  m(new THREE.BoxGeometry(Wd * 0.98, 0.14, 0.18), dark, 0, 0.32, -L * 0.5);
  m(new THREE.BoxGeometry(0.5, 0.12, 0.5), seatM, 0, 0.44, -L * 0.12);                                     // asiento
  m(new THREE.BoxGeometry(0.5, 0.5, 0.1), seatM, 0, 0.7, -L * 0.12 - 0.27);                                // respaldo
  if (fam) { m(new THREE.BoxGeometry(0.5, 0.12, 0.45), seatM, 0, 0.44, -L * 0.36); m(new THREE.BoxGeometry(Wd * 0.9, 0.06, L * 0.62), body, 0, 1.45, -L * 0.18); for (const sx of [-1, 1]) for (const sz of [0.12, -0.48]) m(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), chrome, sx * Wd * 0.42, 0.95, L * sz); } // techito familiar
  else { const bar = m(new THREE.TorusGeometry(0.38, 0.035, 6, 12, Math.PI), chrome, 0, 0.82, -L * 0.12 - 0.36); bar.rotation.y = 0; }
  const wheel = m(new THREE.TorusGeometry(0.14, 0.03, 6, 14), dark, 0, 0.78, L * 0.08); wheel.rotation.x = -1.0; // volante
  m(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), dark, 0, 0.64, L * 0.14).rotation.x = -1.0;
  const wheels = [];
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.22, 14).rotateZ(Math.PI / 2), dark); w.position.set(sx * Wd * 0.5, 0.24, sz * L * 0.34); w.castShadow = true; g.add(w); wheels.push(w); }
  // la «M» original en la trompa
  const mm = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shape = new THREE.Shape(); const s = 0.12; shape.moveTo(-s, -s); shape.lineTo(-s, s); shape.lineTo(0, 0.1 * s); shape.lineTo(s, s); shape.lineTo(s, -s); shape.lineTo(s * 0.6, -s); shape.lineTo(s * 0.6, s * 0.25); shape.lineTo(0, -s * 0.55); shape.lineTo(-s * 0.6, s * 0.25); shape.lineTo(-s * 0.6, -s); shape.closePath();
  const M = new THREE.Mesh(new THREE.ShapeGeometry(shape), mm); M.rotation.x = -Math.PI / 2 + 0.25; M.position.set(0, 0.61, L * 0.33); g.add(M);
  // faros (brillan de noche) y charco de luz delantero
  const lightM = new THREE.MeshBasicMaterial({ color: 0xfff3c0, toneMapped: false }), tailM = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
  for (const sx of [-1, 1]) { m(new THREE.BoxGeometry(0.2, 0.1, 0.03), lightM, sx * Wd * 0.3, 0.52, L * 0.45 + 0.02); m(new THREE.BoxGeometry(0.18, 0.08, 0.03), tailM, sx * Wd * 0.34, 0.4, -L * 0.5 - 0.1); }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 6).rotateX(-Math.PI / 2), poolMaterial(0xfff0c8)); pool.position.set(0, 0.05, L / 2 + 3.2); pool.visible = false; pool.renderOrder = 2; g.add(pool);
  return { g, L, W: Wd, wheels, body, lightM, pool, seatZ: -L * 0.12 };
}

/**
 * @param {any} o { scene, world, save, data (vehiculos.json), garage:{x,z,yaw}, traffic, people, villains, fx, sfx, onEvent, solidAt }
 */
export function createVehicles(o) {
  const { scene, world, save, data } = o;
  const S = () => save.data.cars;
  const defs = Object.fromEntries(data.vehicles.map(v => [v.id, v]));
  const modDefs = Object.fromEntries(data.mods.map(m => [m.sku, m]));
  let kart = null; // kart en el mundo: { uid, def, mesh, x, y, z, yaw, v, vel, box, health, ... }
  let driving = false, night = 0;
  const stats = { enters: 0, exits: 0, hits: 0, carHits: 0, pedBrakes: 0, spawns: 0, despawns: 0, maxSpeed: 0, splash: 0, refused: 0 };
  const pos = new THREE.Vector3(), vel = new THREE.Vector3(), res = {};
  const owned = uid => S().owned.find(c => c.uid === uid) || null;

  function tune(car) {
    const d = defs[car.sku]; const k = { speed: d.speed, acc: d.acceleration, brake: d.brake, turn: d.turn };
    for (const m of car.mods) { const e = modDefs[m] && modDefs[m].effect; if (!e) continue; if (e.brake) k.brake *= e.brake; if (e.acceleration) k.acc *= e.acceleration; }
    if (car.health < 25) k.speed *= 0.55; // muy abollado: anda despacito hasta pasar por el taller
    return k;
  }
  function despawn() {
    if (!kart) return;
    if (kart.box) world.remove([kart.box]);
    kart.mesh.g.removeFromParent();
    const mats = new Set(); kart.mesh.g.traverse(m => { if (m.isMesh) { m.geometry.dispose(); mats.add(m.material); } }); for (const x of mats) x.dispose(); // la textura del charco de luz es compartida: no se libera
    kart = null; stats.despawns++;
  }
  /** crea el kart en (x,z,yaw); estacionado = con caja de colisión (Mateo no lo atraviesa) */
  function spawn(car, x, z, yaw) {
    despawn();
    const def = defs[car.sku]; if (!def) return null;
    const mesh = buildKart(def, car.color || def.color, car.mods.includes('pintura_metalizada'));
    scene.add(mesh.g);
    const y = Math.max(0, world.groundAt(x, z, 2));
    kart = { uid: car.uid, car, def, mesh, x, y, z, yaw, v: 0, steer: 0, vx: 0, vz: 0, vy: 0, box: null, smokeT: 0, hitT: 0 };
    park(); place(); stats.spawns++;
    return kart;
  }
  function park() { if (!kart) return; if (kart.box) world.remove([kart.box]); const c = Math.abs(Math.cos(kart.yaw)) > 0.7, L = kart.mesh.L, Wd = kart.mesh.W; kart.box = world.addBox(kart.x, kart.y, kart.z, c ? Wd : L, 0.95, c ? L : Wd, 'car', { kart: true }); }
  function unpark() { if (kart && kart.box) { world.remove([kart.box]); kart.box = null; } }
  function place() { const g = kart.mesh.g; g.position.set(kart.x, kart.y, kart.z); g.rotation.y = kart.yaw; }
  const obbOf = (x, z, yaw, hl, hw) => ({ x, z, fx: Math.sin(yaw), fz: Math.cos(yaw), hl, hw });
  /** separación mínima (eje y profundidad) entre dos rectángulos orientados o null si no se tocan */
  function sat(a, b) {
    const axes = [[a.fx, a.fz], [a.fz, -a.fx], [b.fx, b.fz], [b.fz, -b.fx]], dx = b.x - a.x, dz = b.z - a.z;
    let best = null;
    for (const [ax, az] of axes) {
      const ra = a.hl * Math.abs(a.fx * ax + a.fz * az) + a.hw * Math.abs(a.fz * ax - a.fx * az);
      const rb = b.hl * Math.abs(b.fx * ax + b.fz * az) + b.hw * Math.abs(b.fz * ax - b.fx * az);
      const d = dx * ax + dz * az, ov = ra + rb - Math.abs(d);
      if (ov <= 0) return null;
      if (!best || ov < best.ov) best = { ov, ax: d > 0 ? -ax : ax, az: d > 0 ? -az : az };
    }
    return best;
  }
  /** lugar libre al costado/atrás/adelante del kart para bajar */
  function exitSpot() {
    if (!kart) return null;
    const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw), rx = fz, rz = -fx, W2 = kart.mesh.W / 2 + 0.75, L2 = kart.mesh.L / 2 + 0.8;
    for (const [ox, oz] of [[-rx * W2, -rz * W2], [rx * W2, rz * W2], [-fx * L2, -fz * L2], [fx * L2, fz * L2]]) {
      const x = kart.x + ox, z = kart.z + oz, y = Math.max(0, world.groundAt(x, z, kart.y + 1));
      if (!world.hasFloor(x, z) || Math.abs(y - kart.y) > 0.6) continue;
      if (o.solidAt(x, y + 0.6, z).length) continue;
      return { x, y: y + 0.05, z, yaw: kart.yaw };
    }
    return null;
  }

  const api = {
    defs, modDefs, stats,
    get kart() { return kart; },
    get driving() { return driving; },
    /** restaura al cargar: el kart activo estacionado donde quedó (o nada si está guardado en el garaje) */
    restore() { const c = S().out && owned(S().out.uid); if (c) spawn(c, S().out.x, S().out.z, S().out.yaw); },
    /** compra (la economía cobra; esto sólo registra el kart): devuelve el nuevo kart del garaje */
    addOwned(sku) { const c = { uid: ++S().seq, sku, color: null, mods: [], health: 100 }; S().owned.push(c); if (!S().active) S().active = c.uid; return c; },
    owned: () => S().owned.slice(),
    setActive(uid) { if (owned(uid)) { S().active = uid; return true; } return false; },
    /** llama al kart activo a la dársena del garaje (si está libre) */
    callToGarage() {
      const c = owned(S().active); if (!c) return { ok: false, reason: 'sin kart' };
      if (driving) return { ok: false, reason: 'manejando' };
      const g = o.garage;
      const busy = (o.traffic.cars || []).some(t => t.active && Math.hypot(t.x - g.x, t.z - g.z) < 3.5) || o.people.near(g.x, g.z, 2.2).length > 0;
      if (busy) { stats.refused++; return { ok: false, reason: 'la dársena está ocupada' }; }
      spawn(c, g.x, g.z, g.yaw); S().out = { uid: c.uid, x: g.x, z: g.z, yaw: g.yaw }; save.flush();
      return { ok: true };
    },
    /** guarda el kart en el garaje (desaparece de la calle); sólo si está cerca de la dársena */
    store() { if (!kart || driving) return { ok: false, reason: 'no hay kart' }; if (Math.hypot(kart.x - o.garage.x, kart.z - o.garage.z) > 10) return { ok: false, reason: 'traelo hasta el Garaje M' }; despawn(); S().out = null; save.flush(); return { ok: true }; },
    near(P, r = 2.6) { return kart && !driving && Math.abs(P.pos.y - kart.y) < 1.5 && Math.hypot(P.pos.x - kart.x, P.pos.z - kart.z) < r; },
    /** subir: Mateo se sienta en el kart (el kart deja de ser obstáculo y pasa a moverse) */
    enter(P) { if (!kart || driving) return false; unpark(); driving = true; stats.enters++; kart.v = 0; kart.vx = kart.vz = 0; P.vel.set(0, 0, 0); o.sfx.land(0.5); o.onEvent('carEnter', { uid: kart.uid }); return true; },
    /** bajar: sólo frenado y con lugar libre; devuelve el punto donde baja o {fail} */
    exit(force = false) {
      if (!kart || !driving) return { fail: 'no estás en el kart' };
      if (!force && Math.abs(kart.v) > 2.2) return { fail: 'Frená para bajar' };
      const sp = exitSpot(); if (!sp) return { fail: 'No hay lugar para bajar acá' };
      driving = false; kart.v = 0; park(); stats.exits++;
      S().out = { uid: kart.uid, x: +kart.x.toFixed(2), z: +kart.z.toFixed(2), yaw: +kart.yaw.toFixed(3) }; save.flush();
      o.onEvent('carExit', { uid: kart.uid });
      return sp;
    },
    exitSpot,
    /** paso fijo mientras se maneja: entrada → física arcade → colisiones → estado */
    step(dt, inp, P) {
      const k = kart, car = k.car, t = tune(car);
      const ax = inp.axis(), thr = clamp(ax.y, -1, 1), steerIn = clamp(ax.x, -1, 1), hand = inp.held('jump');
      const fwd = k.v;
      // acelerar / frenar / reversa
      if (thr > 0.05) k.v += (fwd < -0.3 ? t.brake : t.acc) * thr * dt;
      else if (thr < -0.05) k.v -= (fwd > 0.3 ? t.brake : t.acc * 0.7) * -thr * dt;
      else { k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), (1.6 + Math.abs(k.v) * 0.25) * dt); }
      if (hand) k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), t.brake * 0.45 * dt);
      k.v = clamp(k.v, -t.speed * 0.4, t.speed);
      // peatones adelante (y villanos en la calzada): frenado automático — nunca se atropella a nadie
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), dir = Math.sign(k.v) || 1;
      let lim = Infinity;
      const peds = o.people.near(k.x, k.z, 14).concat(o.villains.onRoad ? o.villains.onRoad() : []);
      for (const p of peds) {
        const dx = p.x - k.x, dz = p.z - k.z, al = (dx * fx + dz * fz) * dir, lat = Math.abs(dx * fz - dz * fx);
        if (al > -0.3 && al < 3 + Math.abs(k.v) * 0.9 && lat < k.mesh.W / 2 + 0.9) lim = Math.min(lim, Math.max(0, (al - k.mesh.L / 2 - 0.9) * 1.6));
      }
      if (lim < Math.abs(k.v)) { if (Math.abs(k.v) > 0.5 && lim < 0.6) stats.pedBrakes++; k.v = Math.sign(k.v) * lim; }
      // giro (más cerrado con freno de mano: derrape) con agarre lateral
      k.steer = damp(k.steer, steerIn, 10, dt);
      const sp = Math.abs(k.v), grip = hand && sp > 3 ? 2.2 : 9;
      const yawRate = -k.steer * t.turn * clamp(sp / 3.5, 0, 1) * Math.sign(k.v || 1) * (1 - 0.3 * sp / t.speed) * (hand && sp > 3 ? 1.45 : 1);
      k.yaw = wrapAngle(k.yaw + yawRate * dt);
      const tvx = Math.sin(k.yaw) * k.v, tvz = Math.cos(k.yaw) * k.v;
      k.vx = damp(k.vx, tvx, grip, dt); k.vz = damp(k.vz, tvz, grip, dt);
      k.vy -= 27 * dt;
      // colisiones con la ciudad: cápsula (mismas cajas que Mateo; cordones de 18 cm se suben)
      pos.set(k.x, k.y, k.z); vel.set(k.vx, k.vy, k.vz);
      const before = Math.hypot(k.vx, k.vz);
      world.moveCapsule(pos, vel, dt, { r: 0.8, h: 1.0, step: 0.3, grounded: true }, res);
      let impact = 0;
      if (res.wall) { const into = -(k.vx * res.wallNx + k.vz * res.wallNz); if (into > 0) impact = into; k.v *= 0.35; vel.x += res.wallNx * 0.5; vel.z += res.wallNz * 0.5; }
      k.x = pos.x; k.y = pos.y; k.z = pos.z; k.vx = vel.x; k.vz = vel.z; k.vy = res.ground ? 0 : vel.y;
      // autos del tránsito: empujar afuera y frenar
      const me = obbOf(k.x, k.z, k.yaw, k.mesh.L / 2, k.mesh.W / 2);
      for (const c of o.traffic.cars) {
        if (!c.active || Math.hypot(c.x - k.x, c.z - k.z) > 9) continue;
        const r = sat(me, obbOf(c.x, c.z, c.yaw, c.T.len / 2, c.T.wid / 2));
        if (r) { k.x += r.ax * r.ov; k.z += r.az * r.ov; me.x = k.x; me.z = k.z; impact = Math.max(impact, Math.hypot(k.vx - Math.sin(c.yaw) * c.v, k.vz - Math.cos(c.yaw) * c.v) * 0.8); k.v *= 0.3; k.vx *= 0.3; k.vz *= 0.3; stats.carHits++; }
      }
      // daño no gráfico: abolladuras (estado), chispitas y sonido; nunca se rompe del todo
      k.hitT = Math.max(0, k.hitT - dt);
      if (impact > 3 && k.hitT <= 0) {
        const dmg = Math.min(30, Math.round((impact - 3) * 4)); car.health = Math.max(5, car.health - dmg); k.hitT = 0.5; stats.hits++;
        o.fx.sparkle(k.x + fx * k.mesh.L / 2, k.y + 0.5, k.z + fz * k.mesh.L / 2, 0xfff2a0, 8); o.sfx.land(1.1); o.onEvent('carHit', { dmg, health: car.health });
      }
      if (car.health < 60) { k.smokeT -= dt; if (k.smokeT <= 0) { k.smokeT = car.health < 25 ? 0.25 : 0.7; o.fx.dust(k.x - fx * k.mesh.L * 0.45, k.y + 0.5, k.z - fz * k.mesh.L * 0.45, 2); } }
      // agua: el kart vuelve al garaje (Mateo con él)
      if (k.y < -1.3 && !world.hasFloor(k.x, k.z)) { stats.splash++; return { splash: true }; }
      stats.maxSpeed = Math.max(stats.maxSpeed, Math.hypot(k.vx, k.vz));
      void before;
      // ruedas y volante
      for (const w of k.mesh.wheels) w.rotation.x += k.v * dt / 0.24;
      place();
      // Mateo sentado: la posición del jugador ES la del kart (cámara, streaming, minimapa, tránsito que frena)
      P.pos.set(k.x, k.y, k.z); P.vel.set(k.vx, 0, k.vz); P.yaw = k.yaw; P.grounded = true; P.state = 'ground'; P.speed2d = Math.hypot(k.vx, k.vz); P.rope = null;
      S().out = { uid: k.uid, x: +k.x.toFixed(2), z: +k.z.toFixed(2), yaw: +k.yaw.toFixed(3) };
      return null;
    },
    /** asiento: dónde se dibuja Mateo (encima del asiento, mirando adelante) */
    seat() { if (!kart) return null; const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw), z = kart.mesh.seatZ; return { x: kart.x + fx * z, y: kart.y + 0.42, z: kart.z + fz * z, yaw: kart.yaw }; },
    /** taller: aplica una mejora / pintura / reparación al kart activo (la economía ya cobró) */
    applyMod(sku, paint) {
      const c = owned(S().active); if (!c) return false;
      if (sku === 'reparacion') c.health = 100;
      else if (sku === 'pintura_metalizada') { if (!c.mods.includes(sku)) c.mods.push(sku); if (paint) c.color = paint; }
      else if (!c.mods.includes(sku)) c.mods.push(sku);
      if (kart && kart.uid === c.uid) { const { x, z, yaw } = kart, wasDriving = driving; spawn(c, x, z, yaw); if (wasDriving) { driving = true; unpark(); } }
      return true;
    },
    setNight(k) { night = k; if (kart) { kart.mesh.lightM.color.setScalar(0.35 + 0.65 * k); kart.mesh.pool.visible = k > 0.05 && driving; kart.mesh.pool.material.opacity = 0.45 * k; } },
    /** obstáculo para los autos del tránsito (frenan ante el kart, manejado o estacionado en la calle) */
    asPed() { return kart && driving ? [{ x: kart.x, z: kart.z, r: 1.2 }] : []; },
    info() {
      const k = kart, c = k && k.car;
      return { owned: S().owned.map(x => ({ uid: x.uid, sku: x.sku, health: Math.round(x.health), mods: x.mods.slice(), color: x.color })), active: S().active, out: S().out, driving, kart: k ? { uid: k.uid, sku: k.def.id, x: +k.x.toFixed(2), y: +k.y.toFixed(2), z: +k.z.toFixed(2), yaw: +k.yaw.toFixed(3), v: +k.v.toFixed(2), speed: +Math.hypot(k.vx, k.vz).toFixed(2), health: Math.round(c.health), parkedBox: !!k.box } : null, stats: { ...stats }, night };
    },
    despawn,
  };
  void _v; void dampAngle;
  return api;
}
