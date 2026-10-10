// @ts-check
/* Carrera Vertical — control del corredor: carrera con impulso, salto con búfer y coyote, deslizamiento, rodada,
   carrera por pared (con imán suave), salto de pared, trepada, cornisa/salto de obstáculo asistidos, tirolina,
   paneles y aturdimiento. Todo en pasos fijos de 1/60 s, sin asignaciones por cuadro. */
import { PHYS } from './config.js';
import { body, moveBody, free, hit } from './physics.js';

const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function createPlayer(ctx) {
  const b = body(PHYS.radius, PHYS.standH, PHYS.step);
  const P = {
    body: b, mode: 'move', alive: true, inv: 0, face: Math.PI, sprintT: 0, coyote: 0, jumpBuf: 0, slideBuf: 0,
    slideT: 0, rollT: 0, stunT: 0, wallGrace: 0.12, zipCd: 0, slowT: 0, wallT: 0, wallCd: 0, climbT: 0, climbUsed: false, launched: false,
    wall: { nx: 0, nz: 0, c: /** @type {any} */ (null), side: 0 }, lastWall: /** @type {any} */ (null),
    mantle: { t: 0, d: 0.2, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, sp: 0, dx: 0, dz: 0 },
    zip: { z: /** @type {any} */ (null), t: 0, speed: 0 },
    airT: 0, phase: 0, landT: 0, fallFrom: 0, stepT: 0, hidden: false,
    get sliding() { return P.mode === 'slide' || P.mode === 'roll'; },
    get speed() { return Math.hypot(b.vel.x, b.vel.z); },
    reset(x, y, z, yaw) {
      b.pos.x = x; b.pos.y = y; b.pos.z = z; b.vel.x = b.vel.y = b.vel.z = 0; b.h = PHYS.standH; b.grounded = false; b.ground = null;
      P.mode = 'move'; P.face = yaw; P.sprintT = 0; P.coyote = 0; P.jumpBuf = 0; P.slideBuf = 0; P.stunT = 0; P.slowT = 0; P.inv = 0.6;
      P.wallCd = 0; P.climbUsed = false; P.launched = false; P.lastWall = null; P.zip.z = null; P.alive = true; P.airT = 0;
    },
    /** golpe de un peligro (barrera, torreta, jefe) */
    hit(dx, dz, power, stun = 0.45, slow = 0) {
      if (P.inv > 0 || !P.alive) return false;
      if (P.mode === 'zip') detachZip(0.3);
      b.vel.x = dx * power; b.vel.z = dz * power; b.vel.y = Math.max(b.vel.y, 3.2);
      P.mode = 'stun'; P.stunT = stun; P.slowT = Math.max(P.slowT, slow); P.inv = 1.1; P.sprintT = 0;
      if (b.h !== PHYS.standH && canStand()) b.h = PHYS.standH;
      ctx.breakCombo();
      return true;
    },
    step, detachZip,
  };

  function cols() { return ctx.W().grid.near(b.pos.z); }
  function canStand() { const r = b.r; return free(cols(), b.pos.x - r, b.pos.y + 0.05, b.pos.z - r, b.pos.x + r, b.pos.y + PHYS.standH, b.pos.z + r); }
  function stand() { if (b.h !== PHYS.standH && canStand()) { b.h = PHYS.standH; return true; } return b.h === PHYS.standH; }

  /** cornisa o salto de obstáculo asistido */
  function tryMantle(dx, dz, minRise, maxRise, dur, vault) {
    const r = b.r, p = b.pos, cs = cols();
    const px = p.x + dx * 0.45, pz = p.z + dz * 0.45;
    let best = null;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.on || c.tag === 'ghost' || c.tag === 'door') continue;
      if (!(c.x0 < px + r && c.x1 > px - r && c.z0 < pz + r && c.z1 > pz - r)) continue;
      const rise = c.y1 - p.y;
      if (rise <= minRise || rise > maxRise || c.y0 > p.y + b.h) continue;
      if (!best || c.y1 > best.y1) best = c;
    }
    if (!best) return false;
    const top = best.y1;
    let tx = p.x + dx * 0.75, tz = p.z + dz * 0.75;
    tx = Math.max(best.x0 + r * 0.6, Math.min(best.x1 - r * 0.6, tx)); tz = Math.max(best.z0 + r * 0.6, Math.min(best.z1 - r * 0.6, tz));
    if (!free(cs, tx - r, top + 0.02, tz - r, tx + r, top + PHYS.standH * (vault ? 0.55 : 0.9), tz + r)) return false;
    // que no haya algo entre medio por encima de la cabeza (techo bajo)
    if (!free(cs, p.x - r, p.y + b.h, p.z - r, p.x + r, top + 0.6, p.z + r, best)) return false;
    const M = P.mantle;
    M.t = 0; M.d = dur; M.fx = p.x; M.fy = p.y; M.fz = p.z; M.tx = tx; M.ty = top; M.tz = tz;
    M.sp = Math.max(Math.hypot(b.vel.x, b.vel.z), vault ? PHYS.run : 4.5); M.dx = dx; M.dz = dz;
    P.mode = 'mantle'; b.vel.y = 0; b.h = PHYS.standH;
    ctx.move(vault ? 'vault' : 'mantle'); ctx.sfx.mantle();
    return true;
  }
  function detachZip(up = 6.5) {
    const z = P.zip.z; if (!z) return;
    const s = P.zip.speed;
    b.vel.x = z.dx * s * 0.9; b.vel.z = z.dz * s * 0.9; b.vel.y = Math.max(z.dy * s, 0) + up;
    z.busy = false; z.back = 0; P.zip.z = null; P.mode = 'move'; P.zipCd = 0.7; b.grounded = false; P.launched = false; P.climbUsed = false; P.lastWall = null;
  }
  function startWall(c, nx, nz, s) {
    const sp = Math.hypot(b.vel.x, b.vel.z);
    // quitar la componente hacia la pared y conservar la de avance
    const dot = b.vel.x * nx + b.vel.z * nz;
    b.vel.x -= nx * dot; b.vel.z -= nz * dot;
    const al = Math.hypot(b.vel.x, b.vel.z) || 1, want = Math.max(sp, PHYS.wallrunMin + 0.6);
    b.vel.x = b.vel.x / al * want; b.vel.z = b.vel.z / al * want;
    b.vel.y = Math.max(Math.min(b.vel.y, 5), 2.6);
    P.mode = 'wall'; P.wallT = PHYS.wallrunTime; P.wallGrace = 0.12; P.wall.nx = nx; P.wall.nz = nz; P.wall.c = c; P.wall.side = s; P.lastWall = c;
    P.launched = false;
    ctx.move('wall'); ctx.sfx.wall();
  }
  /** sonda lateral: colisionador a `dist` del lado s (1 der, -1 izq) respecto de la dirección (ux,uz) */
  function sideProbe(ux, uz, s, dist) {
    const rx = -uz * s, rz = ux * s, r = b.r, p = b.pos;
    const px = p.x + rx * dist, pz = p.z + rz * dist;
    const c = hit(cols(), px - r, p.y + 0.5, pz - r, px + r, p.y + b.h - 0.25, pz + r);
    if (!c || c.tag === 'lift' || c.tag === 'door') return null;
    if (c.y1 < p.y + 1.25) return null;
    return c;
  }

  /**
   * @param {number} dt
   * @param {{mx:number,mz:number,ml:number,jumpHit:boolean,jumpHeld:boolean,slideHit:boolean,slideHeld:boolean,actionHit:boolean}} inp
   */
  function step(dt, inp) {
    const W = ctx.W(), d = ctx.diff(), p = b.pos, v = b.vel;
    P.inv -= dt; P.zipCd -= dt; P.slowT -= dt; P.slideBuf -= dt; P.wallCd -= dt; P.landT -= dt;
    if (inp.slideHit) P.slideBuf = PHYS.rollWindow;
    if (inp.jumpHit) P.jumpBuf = 0.14; else P.jumpBuf -= dt;
    const want = inp.ml > 0.15;
    const slowMul = P.slowT > 0 ? 0.62 : 1;

    if (P.mode === 'mantle') {
      const M = P.mantle; M.t += dt;
      const k = Math.min(1, M.t / M.d), ky = Math.min(1, k * 1.6);
      p.x = M.fx + (M.tx - M.fx) * k * k; p.z = M.fz + (M.tz - M.fz) * k * k;
      p.y = M.fy + (M.ty - M.fy) * (1 - (1 - ky) * (1 - ky));
      v.x = v.z = 0; v.y = 0;
      if (k >= 1) {
        p.x = M.tx; p.y = M.ty; p.z = M.tz;
        const s = M.sp * 0.92;
        v.x = M.dx * s; v.z = M.dz * s; b.grounded = true; P.mode = 'move'; P.coyote = d.coyote; P.climbUsed = false; P.lastWall = null;
      }
      return;
    }
    if (P.mode === 'zip') {
      const Z = P.zip, z = Z.z;
      Z.speed = Math.min(PHYS.zipSpeed, Z.speed + dt * 14);
      Z.t += Z.speed * dt / z.len;
      const t = Math.min(1, Z.t);
      z.t = t; ctx.W().zipHandle(z);
      p.x = z.a.x + z.dx * z.len * t; p.y = z.a.y + z.dy * z.len * t - 2.0; p.z = z.a.z + z.dz * z.len * t;
      v.x = z.dx * Z.speed; v.y = z.dy * Z.speed; v.z = z.dz * Z.speed;
      P.face = Math.atan2(z.dx, z.dz);
      ctx.sfx.zip();
      if (P.jumpBuf > 0) { P.jumpBuf = 0; detachZip(6.5); ctx.sfx.jump(); return; }
      if (t >= 1) { detachZip(0.5); return; }
      return;
    }

    // ---------- movimiento horizontal ----------
    const sp = Math.hypot(v.x, v.z);
    if (P.mode === 'stun') {
      P.stunT -= dt;
      if (b.grounded) { const f = Math.max(0, 1 - dt * 6); v.x *= f; v.z *= f; }
      if (P.stunT <= 0) P.mode = 'move';
    } else if (P.mode === 'slide' || P.mode === 'roll') {
      const ns = Math.max(0, sp - dt * (P.mode === 'roll' ? 1 : 3.2));
      if (sp > 0.01) {
        let ux = v.x / sp, uz = v.z / sp;
        if (want) { const k = Math.min(1, dt * 2.2); ux += (inp.mx - ux) * k; uz += (inp.mz - uz) * k; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l; }
        v.x = ux * ns; v.z = uz * ns;
      }
      if (P.mode === 'slide') P.slideT -= dt; else P.rollT -= dt;
      const done = P.mode === 'slide' ? (P.slideT <= 0 || ns < 2.4) : P.rollT <= 0;
      if (done) {
        if (stand()) { P.mode = 'move'; if (sp < PHYS.run * 0.5 && want) P.sprintT = 0; }
        else { const l = Math.hypot(v.x, v.z) || 1, m = Math.max(2.4, l); v.x = v.x / l * m; v.z = v.z / l * m; if (P.mode === 'roll') { P.mode = 'slide'; P.slideT = 0.2; } }
      }
    } else if (P.mode === 'move' || P.mode === 'climb') {
      if (b.grounded && want && inp.ml > 0.6) P.sprintT += dt; else if (b.grounded && !want) P.sprintT = 0;
      const base = P.sprintT > PHYS.sprintAfter ? PHYS.sprint : PHYS.run;
      const maxSp = base * Math.min(1, inp.ml * 1.15) * slowMul;
      if (P.mode === 'move') {
        if (b.grounded) {
          if (want && sp > maxSp + 0.4) {
            // impulso por encima del tope (paneles, deslizamiento): se conserva y se gira con suavidad
            const ns = Math.max(maxSp, sp - dt * 5.5);
            let ux = v.x / sp, uz = v.z / sp; const k = Math.min(1, dt * 7);
            ux += (inp.mx - ux) * k; uz += (inp.mz - uz) * k; const l = Math.hypot(ux, uz) || 1;
            v.x = ux / l * ns; v.z = uz / l * ns;
          } else {
            const tx = want ? inp.mx * maxSp : 0, tz = want ? inp.mz * maxSp : 0;
            const dx = tx - v.x, dz = tz - v.z, dl = Math.hypot(dx, dz);
            const a = (want ? PHYS.accel : PHYS.friction) * dt;
            if (dl <= a) { v.x = tx; v.z = tz; } else { v.x += dx / dl * a; v.z += dz / dl * a; }
          }
        } else if (want) {
          const cap = Math.max(sp, maxSp * 0.85);
          v.x += inp.mx * PHYS.airAccel * dt; v.z += inp.mz * PHYS.airAccel * dt;
          const ns = Math.hypot(v.x, v.z); if (ns > cap) { v.x = v.x / ns * cap; v.z = v.z / ns * cap; }
        }
      }
    }
    // ---------- carrera por pared ----------
    if (P.mode === 'wall') {
      P.wallT -= dt;
      const n = P.wall;
      let ax = -n.nz, az = n.nx; if (ax * v.x + az * v.z < 0) { ax = -ax; az = -az; }
      const along = Math.max(PHYS.wallrunMin, Math.abs(ax * v.x + az * v.z));
      v.x = ax * along - n.nx * 0.9; v.z = az * along - n.nz * 0.9;
      v.y -= PHYS.wallrunG * dt;
      ctx.sfx.wall();
      let end = P.wallT <= 0;
      { // ¿sigue la pared al costado? (pequeña gracia para saltar justo en el borde)
        const r = b.r, px = p.x - n.nx * 0.42, pz = p.z - n.nz * 0.42;
        const c = hit(cols(), px - r, p.y + 0.4, pz - r, px + r, p.y + b.h - 0.3, pz + r);
        if (!c) { P.wallGrace -= dt; if (P.wallGrace <= 0) end = true; } else P.wallGrace = 0.12;
      }
      if (P.jumpBuf > 0) {
        P.jumpBuf = 0;
        v.x = ax * along * 0.92 + n.nx * PHYS.wallJumpOut; v.z = az * along * 0.92 + n.nz * PHYS.wallJumpOut; v.y = PHYS.wallJumpUp;
        P.mode = 'move'; P.wallCd = 0.22; P.climbUsed = false;
        ctx.move('wallJump'); ctx.sfx.wallJump(); ctx.fx.burst(p.x - n.nx * 0.3, p.y + 1, p.z - n.nz * 0.3, 0xffffff, 6, 2);
        end = false;
      } else if (want && inp.mx * n.nx + inp.mz * n.nz > 0.8) { end = true; }
      if (end && P.mode === 'wall') { P.mode = 'move'; v.x += n.nx * 1.6; v.z += n.nz * 1.6; v.y = Math.min(v.y, 1); P.wallCd = 0.15; }
    }
    // ---------- trepada ----------
    if (P.mode === 'climb') {
      P.climbT -= dt;
      v.y = P.climbT > 0.08 ? PHYS.climbV : Math.min(v.y, PHYS.climbV * 0.4);
      v.x = -P.wall.nx * 1.2; v.z = -P.wall.nz * 1.2;
      ctx.sfx.climb();
      if (P.jumpBuf > 0) { // salto de espaldas a la pared
        P.jumpBuf = 0; v.x = P.wall.nx * PHYS.wallJumpOut; v.z = P.wall.nz * PHYS.wallJumpOut; v.y = PHYS.wallJumpUp * 0.92;
        P.mode = 'move'; P.wallCd = 0.22; P.face = Math.atan2(P.wall.nx, P.wall.nz);
        ctx.move('wallJump'); ctx.sfx.wallJump();
      } else if (tryMantle(-P.wall.nx, -P.wall.nz, 0.2, d.reach, PHYS.mantleTime, false)) return;
      else if (P.climbT <= 0) { P.mode = 'move'; v.x = P.wall.nx * 1.5; v.z = P.wall.nz * 1.5; }
    }

    // ---------- salto ----------
    P.coyote = b.grounded ? d.coyote : P.coyote - dt;
    if (P.jumpBuf > 0 && P.coyote > 0 && (P.mode === 'move' || P.mode === 'slide' || P.mode === 'roll')) {
      const fromSlide = P.mode !== 'move';
      if (!fromSlide || stand()) {
        v.y = PHYS.jump; P.coyote = 0; P.jumpBuf = 0; b.grounded = false; P.launched = false;
        if (fromSlide) { const s = Math.hypot(v.x, v.z), ns = s * 1.1 + 0.6; if (s > 0.1) { v.x = v.x / s * ns; v.z = v.z / s * ns; } P.mode = 'move'; ctx.move('slideJump'); }
        ctx.sfx.jump(); ctx.emit('jump');
      }
    }
    // ---------- deslizamiento ----------
    if (P.mode === 'move' && b.grounded && P.slideBuf > 0 && sp > 4) {
      P.slideBuf = 0; P.mode = 'slide'; P.slideT = PHYS.slideTime; b.h = PHYS.slideH;
      const ns = Math.max(sp, PHYS.run) * 1.1; v.x = v.x / sp * ns; v.z = v.z / sp * ns;
      ctx.move('slide'); ctx.sfx.slide(); ctx.fx.dust(p.x, p.y, p.z, 5);
    }
    // ---------- gravedad ----------
    if (P.mode !== 'wall' && P.mode !== 'climb') {
      const g = v.y > 0 ? (P.launched || inp.jumpHeld || P.mode === 'stun' ? PHYS.gUp : PHYS.gCut) : PHYS.gDown;
      v.y = Math.max(-PHYS.maxFall, v.y - g * dt);
    }
    if (v.y <= 0) P.launched = false;
    // ---------- integrar ----------
    const wasG = b.grounded, vyBefore = v.y;
    if (b.grounded && b.ground && b.ground.tag === 'lift') { /* el ascensor ya acomodó la altura */ }
    moveBody(cols(), b, dt);
    if (b.bonk && P.mode === 'climb') { P.mode = 'move'; }
    // aterrizaje
    if (b.grounded && !wasG) {
      P.climbUsed = false; P.lastWall = null; P.airT = 0;
      if (P.mode === 'wall' || P.mode === 'climb') P.mode = 'move';
      if (vyBefore < PHYS.hardLand) {
        if (P.slideBuf > 0 && P.mode !== 'stun') { P.mode = 'roll'; P.rollT = 0.42; b.h = PHYS.slideH; const s = Math.hypot(v.x, v.z), ns = Math.max(s, PHYS.run * 0.9); if (s > 0.1) { v.x = v.x / s * ns; v.z = v.z / s * ns; } else { v.x = Math.sin(P.face) * ns; v.z = Math.cos(P.face) * ns; } ctx.move('roll'); ctx.sfx.roll(); }
        else if (P.mode !== 'stun') { P.mode = 'stun'; P.stunT = 0.38; v.x *= 0.3; v.z *= 0.3; P.sprintT = 0; ctx.sfx.hardLand(); ctx.fx.shake(0.22); ctx.breakCombo(); ctx.emit('hardLand'); }
        ctx.fx.dust(p.x, p.y, p.z, 10);
      } else {
        if (vyBefore < -6) { ctx.fx.dust(p.x, p.y, p.z, 5); ctx.sfx.land(); }
        if (inp.slideHeld && P.mode === 'move' && Math.hypot(v.x, v.z) > 4.5) P.slideBuf = 0.05;
      }
      P.landT = 0.18;
    }
    if (!b.grounded) P.airT += dt;
    // ---------- en el aire: pared, trepada, cornisa ----------
    if (!b.grounded && P.mode === 'move') {
      const s2 = Math.hypot(v.x, v.z);
      let dx = 0, dz = 0;
      if (want) { dx = inp.mx; dz = inp.mz; } else if (s2 > 0.5) { dx = v.x / s2; dz = v.z / s2; }
      // cornisa: lo primero (es lo más «asistido»)
      let done = false;
      if ((dx || dz) && (want || s2 > 2)) done = tryMantle(dx, dz, 0.25, d.reach, PHYS.mantleTime, false);
      // carrera por pared
      if (!done && s2 > PHYS.wallrunMin * 0.85 && P.wallCd <= 0 && v.y < 7) {
        const ux = v.x / s2, uz = v.z / s2;
        for (const s of [1, -1]) {
          const c = sideProbe(ux, uz, s, 0.36);
          if (c && c !== P.lastWall) {
            const rx = -uz * s, rz = ux * s;
            let nx = 0, nz = 0;
            if (Math.abs(rx) >= Math.abs(rz)) nx = -sign(rx); else nz = -sign(rz);
            if (Math.abs(ux * nx + uz * nz) < 0.62 && !(want && inp.mx * nx + inp.mz * nz > 0.6)) { startWall(c, nx, nz, s); done = true; break; }
          } else if (!c) {
            // imán suave hacia paneles de carrera
            const c2 = sideProbe(ux, uz, s, 1.15);
            if (c2 && c2.tag === 'wall' && c2 !== P.lastWall) { const rx = -uz * s, rz = ux * s; v.x += rx * 10 * dt; v.z += rz * 10 * dt; }
          }
        }
      }
      // trepada vertical
      if (!done && want && !P.climbUsed && v.y > -7 && P.wallCd <= 0) {
        const r = b.r, fx = p.x + dx * 0.42, fz = p.z + dz * 0.42;
        const c = hit(cols(), fx - r, p.y + 0.6, fz - r, fx + r, p.y + b.h - 0.1, fz + r);
        if (c && c.tag !== 'lift' && c.tag !== 'door' && c.y1 > p.y + 1.4) {
          let nx = 0, nz = 0;
          if (Math.abs(dx) >= Math.abs(dz)) nx = -sign(dx); else nz = -sign(dz);
          if (dx * -nx + dz * -nz > 0.6) {
            P.mode = 'climb'; P.climbT = PHYS.climbTime; P.climbUsed = true; P.wall.nx = nx; P.wall.nz = nz; P.wall.c = c;
            v.y = PHYS.climbV; P.face = Math.atan2(-nx, -nz);
            ctx.move('climb'); ctx.sfx.climb();
          }
        }
      }
    }
    // ---------- en el piso: salto de obstáculo ----------
    if (b.grounded && P.mode === 'move' && want && sp > 3.2) {
      if (tryMantle(inp.mx, inp.mz, b.step + 0.02, 1.35, 0.17, true)) return;
    }
    // ---------- paneles ----------
    if (b.grounded && (P.mode === 'move' || P.mode === 'slide' || P.mode === 'roll')) {
      const pd = W.padAt(P);
      if (pd) {
        W.usePad(pd);
        stand(); P.mode = 'move';
        if (pd.kind === 'launch') { v.y = PHYS.launch; v.x = pd.dx * 7 + v.x * 0.2; v.z = pd.dz * 7 + v.z * 0.2; P.launched = true; ctx.move('launch'); ctx.sfx.launch(); }
        else { v.x = pd.dx * PHYS.dash; v.z = pd.dz * PHYS.dash; v.y = 3.6; P.sprintT = 9; ctx.move('boost'); ctx.sfx.dash(); }
        b.grounded = false; P.coyote = 0;
        ctx.fx.ring(pd.x, pd.y + 0.1, pd.z, pd.kind === 'launch' ? 0xffd23a : 0x46f0ff, 2.4, 0.4);
        ctx.fx.burst(pd.x, pd.y + 0.2, pd.z, pd.kind === 'launch' ? 0xffd23a : 0x46f0ff, 14, 4);
        ctx.emit('pad');
      }
    }
    // ---------- tirolina ----------
    if ((P.mode === 'move' || P.mode === 'wall') && P.zipCd <= 0) {
      const zn = W.zipNear(P);
      if (zn && ((!b.grounded && v.y < 8) || inp.actionHit || P.jumpBuf > 0)) {
        P.mode = 'zip'; P.zip.z = zn.z; P.zip.t = zn.t; P.zip.speed = Math.max(8, Math.hypot(v.x, v.z));
        zn.z.busy = true; b.h = PHYS.standH; P.jumpBuf = 0;
        W.foundZip(zn.z);
        ctx.move('zip'); ctx.sfx.zipOn(); ctx.emit('zip');
      }
    }
    // pasos
    if (b.grounded && P.mode === 'move' && sp > 1) { P.stepT -= dt * sp; if (P.stepT <= 0) { P.stepT = 2.4; ctx.sfx.step(); } }
    if (sp > 0.6 && (P.mode === 'move' || P.mode === 'slide' || P.mode === 'roll' || P.mode === 'wall')) {
      const want2 = Math.atan2(v.x, v.z);
      let dd = want2 - P.face; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      P.face += dd * Math.min(1, dt * 14);
    }
  }
  return P;
}
