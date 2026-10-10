// @ts-check
/* Derby de Chatarra — física arcade: motor/frenos/agarre/derrape/nitro, rampas por campo de alturas, saltos,
   choques contra muros/obstáculos (cajas orientadas y círculos) y entre autos (impulso con masas). */

export const GRAV = 22;
const STEP = 0.6;

/** Zona del auto hacia una dirección (unitaria, desde el centro del auto): f frente, b cola, l/r costados. */
export function zoneOf(c, dx, dz) {
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  const f = dx * s + dz * co;
  if (f > 0.68) return 'f';
  if (f < -0.62) return 'b';
  return (dx * -co + dz * s) > 0 ? 'r' : 'l';
}

/**
 * Un paso de física de un auto.
 * @param {any} c @param {number} dt @param {any} A arena
 * @param {{onWall:(c:any, impact:number, dx:number, dz:number, obj:any)=>void, onLand:(c:any, air:number, vy:number, spin:number, ramp:any)=>void, onLaunch?:(c:any)=>void}} H
 */
export function stepCar(c, dt, A, H) {
  if (c.retired) return;
  const ctl = c.ctl, sp = c.spec;
  if (c.wrecked) {
    const k = Math.exp(-2.5 * dt); c.vx *= k; c.vz *= k; c.yawRate *= k; c.speed *= k;
    c.yaw += c.yawRate * dt;
    if (!c.grounded) { c.vy -= GRAV * dt; c.y += c.vy * dt; const h = A.heightAt(c.x, c.z); if (c.y <= h) { c.y = h; c.vy = 0; c.grounded = true; } }
    c.x += c.vx * dt; c.z += c.vz * dt; resolveStatic(c, A, H); return;
  }
  if (c.manualY) { // volador en el aire: lo mueve la IA
    c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
    resolveBounds(c, A, H, false);
    return;
  }
  const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
  let vf = c.vx * s + c.vz * co, vl = c.vx * co - c.vz * s;
  const zone = c.hover ? '' : A.zoneAt(c.x, c.z);
  if (zone === 'boost' && c.grounded) c.boostT = Math.max(c.boostT, 1.0);
  const nitroOn = !!ctl.nitro && c.nitro > 1;
  c.nitroOn = nitroOn || c.boostT > 0;
  const stun = c.stunT > 0;
  const maxS = sp.maxSpeed * c.speedMul * (c.nitroOn ? 1.42 : 1) * (zone === 'sand' ? 0.58 : 1);
  if (c.grounded) {
    const thr = stun ? 0 : ctl.throttle;
    const acc = sp.accel * (c.nitroOn ? 1.75 : 1);
    if (thr > 0) { if (vf < -0.5) vf += 30 * dt * thr; else if (vf < maxS) vf += acc * thr * dt * (1 - Math.max(0, vf) / maxS * 0.8); }
    else if (thr < 0) { if (vf > 0.5) vf += 32 * dt * thr; else if (vf > -maxS * 0.45) vf += acc * 0.7 * thr * dt; }
    else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4 * dt);
    if (vf > maxS) vf -= (vf - maxS) * Math.min(1, 2.5 * dt);
    if (vf < -maxS * 0.5) vf -= (vf + maxS * 0.5) * Math.min(1, 2.5 * dt);
    vf *= 1 - 0.04 * dt;
    let grip = sp.grip;
    const hb = !!ctl.handbrake && Math.abs(vf) > 6 && !stun;
    if (hb) grip = 1.3;
    if (zone === 'oil') grip = Math.min(grip, 0.8);
    if (stun) grip = 3;
    vl *= Math.exp(-grip * dt);
    c.drift = hb || Math.abs(vl) > 3.5;
    const k = Math.min(1, Math.abs(vf) / 5) * (1 - 0.3 * Math.min(1, Math.abs(vf) / sp.maxSpeed));
    const tgt = stun ? c.yawRate * 0.98 : -ctl.steer * sp.turn * k * (vf >= 0 ? 1 : -1) * (hb ? 1.45 : 1);
    c.yawRate += (tgt - c.yawRate) * Math.min(1, dt * (stun ? 2 : 9));
    c.vx = s * vf + co * vl; c.vz = co * vf - s * vl;
  } else {
    c.vy -= GRAV * dt;
    c.yawRate += (-ctl.steer * 2.6 - c.yawRate) * Math.min(1, dt * 4);
    c.spin += Math.abs(c.yawRate * dt);
    const k = 1 - 0.03 * dt; c.vx *= k; c.vz *= k;
  }
  c.yaw += c.yawRate * dt;
  c.speed = vf;
  if (nitroOn) c.nitro = Math.max(0, c.nitro - 30 * dt);
  else c.nitro = Math.min(100, c.nitro + dt * (5 * (sp.nitroRegen || 1) + (c.drift && sp.driftNitro && c.grounded ? 24 : 0)));
  if (c.boostT > 0) c.boostT -= dt;

  let nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
  if (c.hover) {
    c.x = nx; c.z = nz;
    const h = A.heightAt(c.x, c.z) + 0.5;
    c.y += (h - c.y) * Math.min(1, dt * 8); c.vy = 0; c.grounded = true;
  } else {
    const h = A.heightAt(nx, nz);
    if (h - c.y > STEP) { // paredón (costado de rampa, meseta): se bloquea por eje
      const bx = A.heightAt(nx, c.z) - c.y > STEP, bz = A.heightAt(c.x, nz) - c.y > STEP;
      let imp = 0, dx = 0, dz = 0;
      if (bx || !bz) { imp = Math.max(imp, Math.abs(c.vx)); dx = Math.sign(c.vx); nx = c.x; c.vx *= -0.3; }
      if (bz || !bx) { imp = Math.max(imp, Math.abs(c.vz)); dz = Math.sign(c.vz); nz = c.z; c.vz *= -0.3; }
      const l = Math.hypot(dx, dz) || 1;
      H.onWall(c, imp, dx / l, dz / l, { kind: 'cliff' });
    }
    c.x = nx; c.z = nz;
    const h2 = A.heightAt(c.x, c.z);
    if (c.grounded) {
      if (h2 >= c.y - 0.35) { c.vy = Math.max(-15, Math.min(15, (h2 - c.y) / dt)); c.y = h2; }
      else { c.grounded = false; c.air = 0; c.spin = 0; c.launchRamp = c.onRamp; H.onLaunch && H.onLaunch(c); }
    } else {
      c.y += c.vy * dt; c.air += dt;
      if (c.y <= h2) { const vy = c.vy; c.y = h2; c.vy = 0; c.grounded = true; H.onLand(c, c.air, -vy, c.spin, c.launchRamp); c.launchRamp = null; }
    }
    c.onRamp = c.grounded && c.y > 0.25 ? A.rampAt(c.x, c.z) : null;
  }
  resolveStatic(c, A, H);
}

/** @param {any} c @param {any} A @param {any} H @param {boolean} notify */
function resolveBounds(c, A, H, notify = true) {
  const r = c.radius, b = A.bounds;
  if (c.ignoreBounds) return;
  if (b.type === 'circle') {
    const d = Math.hypot(c.x, c.z), lim = b.r - r;
    if (d > lim) { const nx = -c.x / d, nz = -c.z / d; c.x = -nx * lim; c.z = -nz * lim; if (notify) bounce(c, nx, nz, 0, 0, WALL, H); }
  } else {
    for (const p of b.planes) {
      const dd = c.x * p.nx + c.z * p.nz - (p.d - r);
      if (dd > 0) { c.x -= p.nx * dd; c.z -= p.nz * dd; if (notify) bounce(c, -p.nx, -p.nz, 0, 0, WALL, H); }
    }
  }
}
const WALL = { kind: 'wall' };

/** Colisiones contra los límites y obstáculos de la arena. */
export function resolveStatic(c, A, H) {
  resolveBounds(c, A, H, true);
  const r = c.radius;
  for (const b of A.boxes) {
    if (!b.on || c.y > b.top - 0.3) continue;
    const dx = c.x - b.x, dz = c.z - b.z;
    if (Math.abs(dx) > b.hx + b.hz + r + 1 || Math.abs(dz) > b.hx + b.hz + r + 1) continue;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
    const cx = lx < -b.hx ? -b.hx : lx > b.hx ? b.hx : lx, cz = lz < -b.hz ? -b.hz : lz > b.hz ? b.hz : lz;
    const ex = lx - cx, ez = lz - cz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) continue;
    let nlx, nlz, pen;
    if (d2 > 1e-6) { const d = Math.sqrt(d2); nlx = ex / d; nlz = ez / d; pen = r - d; }
    else { const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz); if (px < pz) { nlx = Math.sign(lx) || 1; nlz = 0; pen = px + r; } else { nlz = Math.sign(lz) || 1; nlx = 0; pen = pz + r; } }
    const wx = nlx * b.c + nlz * b.s, wz = -nlx * b.s + nlz * b.c;
    c.x += wx * pen; c.z += wz * pen;
    bounce(c, wx, wz, b.vx || 0, b.vz || 0, b, H);
  }
  for (const o of A.circles) {
    if (!o.on || c.y > o.top - 0.3) continue;
    const dx = c.x - o.x, dz = c.z - o.z, rr = r + o.r, d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-8) continue;
    const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
    c.x = o.x + nx * rr; c.z = o.z + nz * rr;
    bounce(c, nx, nz, 0, 0, o, H);
  }
}

/** Rebote contra un obstáculo con normal (nx,nz) hacia el auto y velocidad propia del obstáculo. */
function bounce(c, nx, nz, ovx, ovz, obj, H) {
  const rel = (c.vx - ovx) * nx + (c.vz - ovz) * nz;
  if (rel >= 0) return;
  const e = obj.kind === 'elec' ? 0.9 : obj.kind === 'tower' ? 0.1 : 0.32;
  c.vx -= (1 + e) * rel * nx; c.vz -= (1 + e) * rel * nz;
  // roce tangencial
  const tx = -nz, tz = nx, vt = (c.vx - ovx) * tx + (c.vz - ovz) * tz;
  c.vx -= vt * tx * 0.12; c.vz -= vt * tz * 0.12;
  H.onWall(c, -rel, -nx, -nz, obj);
}

/**
 * Choques entre autos. Llama onHit(a, b, impacto, nx, nz) con n de a hacia b.
 * @param {any[]} cars @param {(a:any,b:any,imp:number,nx:number,nz:number)=>void} onHit
 */
export function collideCars(cars, onHit) {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.retired || a.manualY) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.retired || b.manualY || Math.abs(a.y - b.y) > 1.7) continue;
      const dx = b.x - a.x, dz = b.z - a.z, rr = a.radius + b.radius, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      const ma = a.wrecked ? 40 : a.mass, mb = b.wrecked ? 40 : b.mass, ia = 1 / ma, ib = 1 / mb, it = ia + ib;
      const pen = rr - d;
      a.x -= nx * pen * ia / it; a.z -= nz * pen * ia / it;
      b.x += nx * pen * ib / it; b.z += nz * pen * ib / it;
      const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (rel <= 0) continue;
      const e = (a.shieldT > 0 || b.shieldT > 0) ? 0.95 : 0.35;
      const jj = (1 + e) * rel / it;
      a.vx -= jj * ia * nx; a.vz -= jj * ia * nz;
      b.vx += jj * ib * nx; b.vz += jj * ib * nz;
      onHit(a, b, rel, nx, nz);
    }
  }
}
