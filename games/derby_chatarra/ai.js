// @ts-check
/* Derby de Chatarra — IA de los cuatro rivales. Cada uno tiene silueta, patrón y contrajuego propios:
   - kart veloz (La Chispa): ataca costados/cola en zigzag y huye después de pegar; esquiva tu frente.
   - camioneta ariete (El Toro): se planta, prende los faros y toca bocina (aviso) y carga en línea recta; si choca un muro queda aturdida.
   - auto volador prototipo (Dr. Hélice): levita, salta y cae sobre tu sombra marcada en rojo; al aterrizar recarga y queda vulnerable.
   - camión blindado (Doña Tanque): persecución lenta e imparable, blindado adelante y a los costados; tanque trasero débil. */

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/** @param {any} c @param {number} tx @param {number} tz */
function aim(c, tx, tz) {
  const dx = tx - c.x, dz = tz - c.z;
  const ang = wrap(Math.atan2(dx, dz) - c.yaw);
  return { steer: clamp(-ang * 2.6, -1, 1), ang, dist: Math.hypot(dx, dz) };
}

/** @param {any} c */
export function initAI(c) {
  c.ai = { state: c.rtype === 'volador' ? 'cruise' : 'hunt', t: 0, st: 0, target: null, retarget: 0, stuck: 0, rev: 0, revSteer: 0, cool: 1.5 + Math.random() * 2,
    hop: 4 + Math.random() * 3, flee: 0, side: Math.random() < 0.5 ? -1 : 1, lx: 0, lz: 0, lockYaw: 0, sx: 0, sz: 0, gT: 0, horn: false };
}

/**
 * @param {any} c @param {number} dt
 * @param {{cars:any[], player:any, arena:any, diff:any, rand:()=>number, telegraph:(c:any, kind:string, on:boolean, x?:number, z?:number)=>void, slam:(c:any)=>void, usePower:(c:any)=>void}} G
 */
export function updateAI(c, dt, G) {
  const ai = c.ai, ctl = c.ctl, A = G.arena;
  ctl.throttle = 0; ctl.steer = 0; ctl.handbrake = false; ctl.nitro = false;
  c.speedMul = G.diff.rivalSpeed;
  if (c.wrecked || c.retired) { c.alert = false; return; }
  ai.t += dt; ai.retarget -= dt; ai.cool -= dt;
  // objetivo: el jugador con probabilidad «agresión»; si no, el más cercano (la Chispa prefiere al más dañado)
  const T0 = ai.target;
  if (!T0 || T0.wrecked || T0.retired || ai.retarget <= 0) {
    ai.retarget = 2.5 + G.rand() * 2;
    const alive = G.cars.filter(o => o !== c && !o.wrecked && !o.retired && !o.isBoss);
    if (alive.length) {
      if (G.player && alive.includes(G.player) && G.rand() < G.diff.aggro * (ai.t < 6 ? 0.35 : 1)) ai.target = G.player;
      else {
        let best = null, bs = 1e9;
        for (const o of alive) { const sc = Math.hypot(o.x - c.x, o.z - c.z) + (c.rtype === 'kart' ? o.hp / o.maxHp * 30 : 0); if (sc < bs) { bs = sc; best = o; } }
        ai.target = best;
      }
    } else ai.target = null;
  }
  const T = ai.target;
  if (c.stunT > 0) { c.alert = false; if (c.rtype === 'ariete') { ai.state = 'hunt'; G.telegraph(c, 'lane', false); } return; }
  // usar potenciador
  if (c.slot) { c.slotT += dt; if (wantsPower(c, T) || c.slotT > 7) G.usePower(c); }
  if (!T) { const w = aim(c, Math.sin(ai.t * 0.3) * 20, Math.cos(ai.t * 0.3) * 20); ctl.steer = w.steer; ctl.throttle = 0.6; return; }
  const lead = clamp(Math.hypot(T.x - c.x, T.z - c.z) / Math.max(8, Math.abs(c.speed) + 4), 0, 1.2);
  const px = T.x + T.vx * lead, pz = T.z + T.vz * lead;

  if (c.rtype === 'kart') {
    if (ai.flee > 0) {
      ai.flee -= dt;
      const ax = c.x + (c.x - T.x) * 2, az = c.z + (c.z - T.z) * 2;
      const w = aim(c, ax, az); ctl.steer = w.steer; ctl.throttle = 1;
    } else {
      const ts = Math.sin(T.yaw), tc = Math.cos(T.yaw);
      const gx = px - ts * 2.6 - tc * ai.side * 2.2, gz = pz - tc * 2.6 + ts * ai.side * 2.2;
      const w = aim(c, gx, gz);
      ctl.steer = w.steer + (w.dist > 12 ? Math.sin(ai.t * 4.2) * 0.35 : 0);
      ctl.throttle = Math.abs(w.ang) > 1.6 && w.dist < 8 ? 0.4 : 1;
      if (w.dist < 20 && Math.abs(w.ang) < 0.25 && c.nitro > 45) ctl.nitro = true;
      // esquiva el frente del objetivo
      const fx = c.x - T.x, fz = c.z - T.z, fd = Math.hypot(fx, fz) || 1, facing = (fx * ts + fz * tc) / fd;
      if (facing > 0.8 && fd < 11) ctl.steer = clamp(ctl.steer + ai.side * 0.8, -1, 1);
    }
  } else if (c.rtype === 'ariete') {
    if (ai.state === 'hunt') {
      const w = aim(c, px, pz); ctl.steer = w.steer; ctl.throttle = 0.85;
      if (ai.cool <= 0 && w.dist > 9 && w.dist < 34 && Math.abs(w.ang) < 0.7 && c.grounded) {
        ai.state = 'aim'; ai.st = 0.95 * G.diff.bossTele; ai.horn = false;
      }
    } else if (ai.state === 'aim') {
      const w = aim(c, T.x, T.z); ctl.steer = w.steer; ctl.throttle = c.speed > 2 ? -0.6 : 0;
      c.alert = true; ai.st -= dt;
      G.telegraph(c, 'lane', true);
      if (!ai.horn) { ai.horn = true; G.telegraph(c, 'horn', true); }
      if (ai.st <= 0) { ai.state = 'charge'; ai.st = 2.0; ai.lockYaw = c.yaw; c.boostT = 2.0; c.alert = false; G.telegraph(c, 'lane', false); }
    } else if (ai.state === 'charge') {
      ctl.throttle = 1; ctl.steer = clamp(-wrap(ai.lockYaw - c.yaw) * 2, -0.3, 0.3);
      ai.st -= dt;
      if (ai.st <= 0) { ai.state = 'hunt'; ai.cool = 2.5 + G.rand() * 1.5; }
    }
    if (ai.state !== 'aim') c.alert = false;
  } else if (c.rtype === 'volador') {
    if (ai.state === 'cruise') {
      const w = aim(c, px, pz); ctl.steer = w.steer; ctl.throttle = 0.8;
      ai.hop -= dt;
      if (ai.hop <= 0 && w.dist < 30 && w.dist > 5) {
        ai.state = 'rise'; ai.st = 0.5; c.manualY = true; c.vx *= 0.3; c.vz *= 0.3; c.vy = 0;
        let lx = T.x + T.vx * 1.5, lz = T.z + T.vz * 1.5;
        if (!A.inside(lx, lz, 4)) { lx = T.x; lz = T.z; }
        ai.lx = lx; ai.lz = lz;
        G.telegraph(c, 'shadow', true, lx, lz);
      }
    } else if (ai.state === 'rise') {
      ai.st -= dt; c.vy = (6.5 - c.y) * 6; c.vx *= 0.9; c.vz *= 0.9;
      if (ai.st <= 0) { ai.state = 'glide'; ai.st = 1.25 * Math.max(0.7, G.diff.bossTele / 1.15); ai.gT = ai.st; ai.sx = c.x; ai.sz = c.z; }
    } else if (ai.state === 'glide') {
      ai.st -= dt;
      const k = 1 - Math.max(0, ai.st) / ai.gT;
      c.vx = (ai.lx - c.x) / Math.max(0.12, ai.st); c.vz = (ai.lz - c.z) / Math.max(0.12, ai.st);
      const vmax = 30; const vv = Math.hypot(c.vx, c.vz); if (vv > vmax) { c.vx *= vmax / vv; c.vz *= vmax / vv; }
      c.vy = k > 0.8 ? -26 : (6.5 - c.y) * 3;
      c.yaw += dt * 4;
      if (ai.st <= 0 || (k > 0.8 && c.y <= A.heightAt(c.x, c.z) + 0.5)) {
        c.manualY = false; c.y = A.heightAt(c.x, c.z) + 0.5; c.vx = c.vz = c.vy = 0;
        G.telegraph(c, 'shadow', false);
        G.slam(c);
        ai.state = 'recharge'; ai.st = 2.2; c.vuln = true;
      }
    } else if (ai.state === 'recharge') {
      ai.st -= dt; ctl.throttle = 0;
      if (ai.st <= 0) { ai.state = 'cruise'; c.vuln = false; ai.hop = (6 + G.rand() * 3) * (G.diff.bossTele / 1.15 + 0.2); }
    }
  } else if (c.rtype === 'blindado') {
    const w = aim(c, px, pz);
    if (Math.abs(w.ang) > 2.3 && w.dist < 9) { ctl.throttle = -0.8; ctl.steer = -w.steer; }
    else { ctl.steer = w.steer; ctl.throttle = 1; }
  }

  // evitar muros y obstáculos (no durante la carga del ariete ni el vuelo)
  const free = !(c.rtype === 'ariete' && ai.state === 'charge') && !c.manualY && ai.state !== 'recharge';
  if (free && ai.rev <= 0) {
    const s = Math.sin(c.yaw), co = Math.cos(c.yaw), look = 5 + Math.abs(c.speed) * 0.45;
    if (!A.inside(c.x + s * look, c.z + co * look, 3)) {
      const w = aim(c, 0, 0); ctl.steer = w.steer; ctl.throttle = Math.min(ctl.throttle, 0.7);
    } else {
      for (const o of A.circles) {
        if (!o.on || o.kind === 'post') continue;
        const dx = o.x - c.x, dz = o.z - c.z, fwd = dx * s + dz * co;
        if (fwd < 0 || fwd > look) continue;
        const lat = dx * -co + dz * s;
        if (Math.abs(lat) < o.r + c.radius + 0.6 && !(o.ref && o.ref === T)) { ctl.steer = clamp(ctl.steer + (lat > 0 ? -0.9 : 0.9), -1, 1); break; }
      }
      for (const hh of A.heights) {
        if (hh.type !== 'disc') continue;
        const dx = hh.x - c.x, dz = hh.z - c.z, fwd = dx * s + dz * co, lat = dx * -co + dz * s;
        if (fwd > 0 && fwd < look + hh.r && Math.abs(lat) < hh.r + 1 && c.y < hh.h - 0.5 && !A.rampAt(c.x + s * 4, c.z + co * 4)) ctl.steer = clamp(ctl.steer + (lat > 0 ? -0.8 : 0.8), -1, 1);
      }
    }
  }
  // atascado: marcha atrás un momento
  if (ai.rev > 0) { ai.rev -= dt; ctl.throttle = -1; ctl.steer = ai.revSteer; ctl.nitro = false; return; }
  if (!c.manualY && ctl.throttle > 0.3 && Math.abs(c.speed) < 1.5 && c.grounded && ai.state !== 'recharge') ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt * 2);
  if (ai.stuck > 1.0) {
    ai.stuck = 0; ai.rev = 0.9; ai.revSteer = ctl.steer >= 0 ? -1 : 1;
    if (c.rtype === 'ariete') { ai.state = 'hunt'; c.alert = false; G.telegraph(c, 'lane', false); }
  }
}

/** @param {any} c @param {any} T */
function wantsPower(c, T) {
  if (!T) return c.slotT > 2;
  const dx = T.x - c.x, dz = T.z - c.z, dist = Math.hypot(dx, dz), ang = Math.abs(wrap(Math.atan2(dx, dz) - c.yaw));
  if (c.slot === 'nitro') return ang < 0.3 && dist < 25;
  if (c.slot === 'iman') return dist < 13;
  if (c.slot === 'escudo') return c.hp < c.maxHp * 0.5 || c.slotT > 3;
  if (c.slot === 'trampa') return ang > 2.2 && dist < 16;
  return false;
}
