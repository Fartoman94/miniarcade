// Mateo: Ciudad de Altura — controlador del héroe (paso fijo 60 Hz).
// Estados: ground (quieto/caminar/trotar/correr/sprint/carga de súper salto), air (salto, doble salto, planeo, caída),
// wallrun (correr por paredes) y wallclimb (trepar), swing (cable de energía con péndulo y conservación de impulso),
// stunned (golpe), talk (diálogo). Coyote time y jump buffer de 120 ms. Colisión cápsula contra AABB (physics.js).
import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from './util.js';
import { LOOPING } from './anims.js';

export const TUNE = {
  walk: 3.2, run: 7.4, sprint: 12.5, accel: 38, decel: 30, airAccel: 10, airMax: 9.5,
  jump: 9.8, doubleJump: 9.2, superMin: 13, superMax: 26, superCharge: 0.75, gravity: 27, maxFall: 48,
  glideFall: 3.6, glideSpeed: 11, coyote: 0.12, buffer: 0.12,
  wallMinSpeed: 4.5, wallTime: 1.6, wallGrav: 0.32, climbSpeed: 6.5,
  ropeMin: 7, ropeMax: 70, swingForce: 13, swingMax: 40, releaseBoostUp: 7.5, releaseBoostFwd: 4, anchorMinRise: 4,
  r: 0.32, h: 1.2, step: 0.42,
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

export function createPlayer({ world, model, clips, face, sfx, fx, scene, onEvent }) {
  const mixer = new THREE.AnimationMixer(model.group);
  const actions = {};
  for (const c of clips) {
    const a = mixer.clipAction(c);
    if (!LOOPING[c.name]) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions[c.name] = a;
  }
  const P = {
    pos: new THREE.Vector3(0, 0.2, 0), vel: new THREE.Vector3(), yaw: 0, state: 'ground', grounded: true,
    coyote: 0, buffer: 0, jumpHeld: 0, charging: false, charge: 0, doubleUsed: false, gliding: false,
    wall: { nx: 0, nz: 0, t: 0, side: 1, cool: 0, box: null }, climb: 0,
    rope: null, ropeCool: 0, health: 100, iframe: 0, stun: 0, attackT: 0, attackCd: 0,
    airTime: 0, fallSpeed: 0, landT: 0, anim: '', oneShot: '', oneShotT: 0, speed2d: 0, lastSafe: new THREE.Vector3(0, 0.2, 0), safeT: 0,
    stats: { jumps: 0, superJumps: 0, doubleJumps: 0, swings: 0, releases: 0, wallruns: 0, landings: 0, maxHeight: 0, airTime: 0 },
    anchorPreview: null, talking: false, visY: 0.2,
    // V2 P1 combate: guardia, escala de movimiento mientras pega, impulso de esquiva, invulnerabilidad, pausa de impacto
    guard: false, combatMove: 1, dashT: 0, dodgeIF: 0, hitstop: 0, chargeAtk: false, sinceHurt: 99, exhausted: 0,
    // V2 P2: modo civil (sin cable, súper salto, doble salto, planeo ni paredes), asiento (sofá/kart) y regeneración por comida
    civil: false, seat: null, regenK: 1, civilBlocked: 0,
  };
  let damageFilter = null;
  const res = {};

  /* ---------- cable (visual) ---------- */
  const ropeMat = new THREE.MeshBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: 0.95, toneMapped: false });
  const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6, 1, true).translate(0, 0.5, 0), ropeMat);
  const ropeGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x2ad8ff, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  ropeMesh.visible = ropeGlow.visible = false; ropeMesh.frustumCulled = ropeGlow.frustumCulled = false;
  scene.add(ropeMesh, ropeGlow);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: 0x7ff6ff, transparent: true, opacity: 0.85, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
  reticle.renderOrder = 10; reticle.visible = false; scene.add(reticle);
  const anchorDot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbffcff, toneMapped: false }));
  anchorDot.visible = false; scene.add(anchorDot);

  /* ---------- animación ---------- */
  // Locomoción mezclada (V2): reposo, caminar, trotar, correr y sprint suenan juntos con pesos por velocidad y FASE
  // COMPARTIDA (los 4 ciclos usan la misma convención de paso), y la fase avanza según el largo de zancada medido en
  // cada clip → los pies acompañan al piso (menos patinaje) y no hay saltos de pose al cruzar umbrales de velocidad.
  const GAIT = ['walk_forward', 'jog', 'run', 'sprint'], LOCO = ['idle_breath', ...GAIT];
  const CADENCE = { walk_forward: 2.0, jog: 2.4, run: 2.7, sprint: 3.1 }; // ciclos por segundo máximos
  const stride = measureStrides();
  const loco = { on: false, ramp: 0, phase: 0, w: {} };
  let cur = '';
  function play(name, fade = 0.18, ts = 1, force = false) {
    const a = actions[name]; if (!a) return;
    a.timeScale = ts;
    if (cur === name && !force) return;
    if (loco.on) { // salir de la mezcla de locomoción: todas sus pistas se desvanecen a la vez
      loco.on = false;
      for (const n of LOCO) { const x = actions[n]; if (x && x !== a && x.getEffectiveWeight() > 0) x.fadeOut(fade); }
      a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play(); a.fadeIn(Math.max(0.01, fade));
    } else {
      const prev = actions[cur];
      a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play();
      if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
      else if (prev === a) a.fadeIn(0.01);
    }
    cur = name; P.anim = name;
  }
  /** mide la velocidad «natural» (m/s) de cada ciclo de paso: recorrido del pie hacia atrás durante el apoyo */
  function measureStrides() {
    const out = {}, foot = model.bones && (model.bones.foot_L || model.bones.foot_l);
    const fallback = { walk_forward: 2.2, jog: 4.4, run: 7.0, sprint: 11.0 };
    if (!foot) return { ...fallback, src: 'tabla' };
    const m2 = new THREE.AnimationMixer(model.group), g = model.group, save = g.position.clone(), rot = g.rotation.y;
    g.position.set(0, 0, 0); g.rotation.y = 0;
    for (const n of GAIT) {
      const c = clips.find(k => k.name === n); if (!c) { out[n] = fallback[n]; continue; }
      const a = m2.clipAction(c); a.play();
      const zs = [], ys = [];
      for (let i = 0; i < 32; i++) { m2.setTime(c.duration * i / 32); g.updateMatrixWorld(true); foot.getWorldPosition(_v); zs.push(_v.z); ys.push(_v.y); }
      a.stop(); m2.uncacheAction(c, g);
      // el pie va de adelante hacia atrás durante el apoyo (≈ medio ciclo): velocidad ≈ 2 × recorrido / duración
      const v = 2 * (Math.max(...zs) - Math.min(...zs)) / c.duration;
      void ys;
      out[n] = v > 0.3 ? +v.toFixed(2) : fallback[n];
    }
    m2.uncacheRoot(g); g.position.copy(save); g.rotation.y = rot;
    // orden creciente garantizado
    for (let i = 1; i < GAIT.length; i++) if (out[GAIT[i]] <= out[GAIT[i - 1]] + 0.3) out[GAIT[i]] = out[GAIT[i - 1]] + 0.3;
    out.src = 'medido';
    return out;
  }
  function locomotion(dt, s) {
    if (!loco.on) {
      const prev = actions[cur]; if (prev && !LOCO.includes(cur)) prev.fadeOut(0.2);
      loco.on = true; loco.ramp = 0; loco.s = s;
      for (const n of LOCO) { const a = actions[n]; if (!a) continue; a.reset(); a.enabled = true; a.play(); a.setEffectiveWeight(0); a.timeScale = n === 'idle_breath' ? 1 : 0; }
      cur = '__loco';
    }
    loco.ramp = Math.min(1, loco.ramp + dt / 0.2);
    // parámetro de mezcla suavizado (~0,12 s): Mateo acelera muy rápido y sin esto la pose cambiaría en 2 cuadros
    loco.s = damp(loco.s ?? s, s, 8, dt);
    const sb = loco.s;
    // pesos: reposo → caminar entre 0,2 y 1,0 m/s; luego por tramos entre las velocidades naturales de cada ciclo
    const w = loco.w; for (const n of LOCO) w[n] = 0;
    const idleK = clamp((sb - 0.15) / 1.5, 0, 1);
    w.idle_breath = 1 - idleK;
    if (idleK > 0) {
      // cada ciclo domina cerca de su velocidad de juego (Mateo es más rápido que su zancada real: héroe de caricatura)
      const v = [Math.max(1, stride.walk_forward), TUNE.walk, TUNE.run * 0.88, TUNE.sprint * 0.88];
      if (sb <= v[0]) w.walk_forward = idleK;
      else if (sb >= v[3]) w.sprint = idleK;
      else for (let i = 0; i < 3; i++) if (sb <= v[i + 1]) { const k = (sb - v[i]) / (v[i + 1] - v[i]); w[GAIT[i]] = idleK * (1 - k); w[GAIT[i + 1]] = idleK * k; break; }
    }
    // fase: ciclos por segundo = velocidad / largo de zancada mezclado (largo = velocidad natural × duración)
    let L = 0, wg = 0;
    for (const n of GAIT) if (w[n] > 0) { const c = actions[n].getClip(); L += w[n] * stride[n] * c.duration; wg += w[n]; }
    // a baja velocidad el pie queda clavado (zancada medida); arriba se limita la cadencia para que no "pedalee"
    let cap = 0; for (const n of GAIT) cap += (w[n] || 0) * CADENCE[n];
    if (wg > 0.001) { L /= wg; cap /= wg; loco.phase = (loco.phase + dt * Math.min(Math.max(s, 0.6) / Math.max(0.3, L), cap)) % 1; loco.rate = Math.min(Math.max(s, 0.6) / Math.max(0.3, L), cap); }
    let best = 'idle_breath';
    for (const n of LOCO) {
      const a = actions[n]; if (!a) continue;
      if (n !== 'idle_breath') a.time = loco.phase * a.getClip().duration;
      a.setEffectiveWeight(loco.ramp * w[n]);
      if (w[n] > w[best]) best = n;
    }
    P.anim = best;
  }
  function oneShot(name, dur, fade = 0.08) { P.oneShot = name; P.oneShotT = dur; play(name, fade, 1, true); }

  /* ---------- búsqueda de anclaje ---------- */
  /** Elige el mejor punto de anclaje: rayos en abanico hacia adelante/arriba según la cámara. */
  function findAnchor(camYaw, camPitch) {
    const ox = P.pos.x, oy = P.pos.y + 1.0, oz = P.pos.z;
    let best = null, bestScore = -1e9;
    const moveYaw = P.speed2d > 2 ? Math.atan2(P.vel.x, P.vel.z) : camYaw;
    for (const baseYaw of [camYaw, moveYaw]) for (const dy of [0, -0.35, 0.35, -0.7, 0.7, -1.0, 1.0, -1.25, 1.25]) for (const el of [0.55, 0.8, 1.05, 0.38, 1.3]) {
      const yaw = baseYaw + dy, ce = Math.cos(el + Math.max(-0.2, camPitch * 0.3));
      const dx = Math.sin(yaw) * ce, dz = Math.cos(yaw) * ce, dyv = Math.sin(el);
      const hit = world.raycast(ox, oy, oz, dx, dyv, dz, TUNE.ropeMax, b => b.kind === 'building' || b.kind === 'beam');
      if (!hit || hit.y < P.pos.y + TUNE.anchorMinRise || hit.t < TUNE.ropeMin) continue;
      const rise = hit.y - P.pos.y;
      const ahead = Math.cos(wrapAngle(yaw - camYaw));
      const hd = Math.hypot(hit.x - P.pos.x, hit.z - P.pos.z);
      const score = ahead * 30 - Math.abs(hit.t - 26) * 0.6 + Math.min(rise, 30) * 0.5 - Math.abs(dy) * 7 - Math.max(0, hd * 0.7 - rise) * 1.5;
      if (score > bestScore) { bestScore = score; best = hit; }
    }
    return best;
  }
  function attach(hit) {
    const ax = hit.x - hit.nx * 0.05, ay = hit.y, az = hit.z - hit.nz * 0.05;
    const d = Math.hypot(ax - P.pos.x, ay - (P.pos.y + 1), az - P.pos.z);
    const rise = ay - P.pos.y;
    // largo objetivo: que en el punto más bajo del péndulo Mateo quede sobre el piso; el cable se recoge rápido hasta ahí (tirón)
    const target = Math.max(TUNE.ropeMin, Math.min(d * 0.92, rise - 1.3));
    P.rope = { x: ax, y: ay, z: az, len: d, target, t: 0 };
    P.state = 'swing'; P.gliding = false; P.charging = false;
    if (P.grounded) { P.vel.y = Math.max(P.vel.y, 6.5); P.pos.y += 0.05; P.grounded = false; }
    P.stats.swings++; P.doubleUsed = false;
    const side = ((ax - P.pos.x) * Math.cos(P.yaw) - (az - P.pos.z) * Math.sin(P.yaw)) > 0 ? 'left' : 'right';
    oneShot('grapple_shoot_' + side, 0.2);
    sfx.cable(); fx && fx.zap(ax, ay, az);
    onEvent('cable', { x: ax, y: ay, z: az });
  }
  function release(boost) {
    if (!P.rope) return;
    P.rope = null; P.state = 'air'; P.ropeCool = 0.18;
    if (boost) {
      const hs = Math.hypot(P.vel.x, P.vel.z) || 1;
      P.vel.x += P.vel.x / hs * TUNE.releaseBoostFwd; P.vel.z += P.vel.z / hs * TUNE.releaseBoostFwd;
      P.vel.y = Math.max(P.vel.y, 0) + TUNE.releaseBoostUp;
      oneShot('web_release_flip', 0.55); sfx.whoosh(1);
    }
    P.stats.releases++;
    onEvent('release', { boost, speed: Math.hypot(P.vel.x, P.vel.y, P.vel.z) });
  }

  /* ---------- paso de simulación ---------- */
  function step(dt, inp, cam) {
    const T = TUNE;
    P.iframe = Math.max(0, P.iframe - dt); P.attackCd = Math.max(0, P.attackCd - dt); P.ropeCool = Math.max(0, P.ropeCool - dt);
    P.wall.cool = Math.max(0, P.wall.cool - dt); P.landT = Math.max(0, P.landT - dt);
    if (P.oneShot) { P.oneShotT -= dt; if (P.oneShotT <= 0) P.oneShot = ''; }
    const ax = inp.axis(), camYaw = cam.yaw;
    // dirección deseada relativa a la cámara (adelante = hacia donde mira la cámara)
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    let wx = fx * ax.y + rx * ax.x, wz = fz * ax.y + rz * ax.x;
    const wl = Math.hypot(wx, wz); if (wl > 1e-3) { wx /= wl; wz /= wl; }
    const mag = ax.mag;
    // V2 P2: sentado (sofá): cualquier movimiento o SALTO lo levanta
    if (P.seat) {
      if (mag > 0.3 || inp.pressed('jump')) { const s0 = P.seat; P.seat = null; P.pos.set(s0.standX, s0.standY, s0.standZ); P.visY = P.pos.y; onEvent('stand', {}); }
      else { P.pos.set(P.seat.x, P.seat.y, P.seat.z); P.visY = P.seat.y; P.vel.set(0, 0, 0); P.yaw = P.seat.yaw; P.grounded = true; P.state = 'ground'; P.speed2d = 0; play('sit', 0.3); mixer.update(dt); face.update(dt); P.sinceHurt += dt; if (P.health < 100) P.health = Math.min(100, P.health + 6 * dt); return; }
    }
    if (P.talking) { P.vel.x = damp(P.vel.x, 0, 12, dt); P.vel.z = damp(P.vel.z, 0, 12, dt); }

    if (P.stun > 0) { P.stun -= dt; }
    // ---- entradas de salto ----
    if (inp.pressed('jump')) { P.buffer = T.buffer; P.jumpHeld = 0; }
    if (!P.grounded && P.buffer <= 0) P.airBuffered = false;
    if (inp.held('jump')) P.jumpHeld += dt;
    P.buffer = Math.max(0, P.buffer - dt);
    P.coyote = P.grounded ? T.coyote : Math.max(0, P.coyote - dt);

    // ---- cable ----
    if (inp.pressed('cable') && P.civil && !P.rope) { P.civilBlocked++; onEvent('civilBlocked', { what: 'cable' }); }
    else if (inp.pressed('cable') && P.stun <= 0 && !P.talking) {
      if (P.rope) {
        // encadenar: si hay un anclaje nuevo más adelante, el cable salta a ese punto sin perder impulso
        const h = !cam.cableHold && P.speed2d > 6 ? findAnchor(Math.atan2(P.vel.x, P.vel.z), 0.2) : null;
        if (h && Math.hypot(h.x - P.rope.x, h.z - P.rope.z) > 8) { P.stats.chains = (P.stats.chains || 0) + 1; attach(h); onEvent('chain', {}); }
        else release(false);
      }
      else if (P.ropeCool <= 0) { const h = findAnchor(camYaw, cam.pitch); if (h) attach(h); else { sfx.denied(); onEvent('noAnchor', {}); } }
    }
    if (P.rope && inp.released('cable') && cam.cableHold) release(false);

    // ---- estados ----
    if (P.state === 'swing' && P.rope) stepSwing(dt, wx, wz, mag, inp);
    else if (P.state === 'wallrun') stepWall(dt, wx, wz, mag, inp);
    else stepMove(dt, wx, wz, mag, inp);

    // ---- integración con colisiones ----
    const wasGround = P.grounded, vyBefore = P.vel.y;
    world.moveCapsule(P.pos, P.vel, dt, { r: T.r, h: T.h, step: T.step, grounded: wasGround }, res);
    P.grounded = res.ground;
    if (P.grounded && !wasGround) land(-vyBefore);
    if (P.grounded) { P.doubleUsed = false; P.gliding = false; if (P.state === 'air' || P.state === 'wallrun') P.state = 'ground'; if (P.rope) release(false); P.airTime = 0; }
    else { P.airTime += dt; P.stats.airTime += dt; if (P.state === 'ground') P.state = 'air'; }
    P.stats.maxHeight = Math.max(P.stats.maxHeight, P.pos.y);
    // pared: entrar a correr por la pared
    if (!P.grounded && P.state === 'air' && res.wall && P.wall.cool <= 0 && !P.talking) {
      const along = Math.abs(P.vel.x * -res.wallNz + P.vel.z * res.wallNx);
      const into = -(wx * res.wallNx + wz * res.wallNz);
      if (!P.civil && (along > T.wallMinSpeed || (into > 0.6 && mag > 0.5)) && res.wallBox && res.wallBox.kind === 'building' && res.wallBox.maxY - P.pos.y > 1.6) startWall(res, into);
    }
    if (P.state === 'wallrun' && !res.wall) { // se acabó la pared: ¿llegamos al borde superior? trepar al techo
      const top = P.wall.box ? P.wall.box.maxY : 0;
      if (P.wall.climb && top - P.pos.y < 1.6 && top - P.pos.y > -0.5) { P.vel.y = 7.5; P.vel.x -= P.wall.nx * 4; P.vel.z -= P.wall.nz * 4; onEvent('mantle', {}); }
      P.state = 'air'; P.wall.cool = 0.25;
    }
    // respawn de seguridad
    if (P.pos.y < -15 || !Number.isFinite(P.pos.x)) respawn();
    else if (P.pos.y < -1.3 && !world.hasFloor(P.pos.x, P.pos.z) && !P.rope) { fx && fx.splash && fx.splash(P.pos.x, -1.5, P.pos.z); onEvent('water', {}); respawn(); }
    P.safeT += dt; if (P.grounded && P.safeT > 1 && res.groundBox == null && world.safeFloor(P.pos.x, P.pos.z, 3)) { P.lastSafe.copy(P.pos); P.safeT = 0; }
    P.speed2d = Math.hypot(P.vel.x, P.vel.z);
    // orientación del modelo
    if (P.state === 'wallrun') P.yaw = dampAngle(P.yaw, Math.atan2(P.vel.x, P.vel.z), 14, dt);
    else if (P.state === 'swing' && P.speed2d > 1) P.yaw = dampAngle(P.yaw, Math.atan2(P.vel.x, P.vel.z), 6, dt);
    else if (P.speed2d > 0.6 && !P.talking) P.yaw = dampAngle(P.yaw, Math.atan2(P.vel.x, P.vel.z), P.grounded ? 14 : 5, dt);
    // presentación: los escalones (cordones, escaleras) se suavizan sólo en el modelo, nunca en la colisión
    const dy = P.pos.y - P.visY;
    P.visY = P.grounded && dy > 0 && dy < 0.5 ? P.visY + dy * (1 - Math.exp(-22 * dt)) : P.pos.y;
    // V2: recuperación de energía fuera de peligro (juego no letal)
    P.sinceHurt += dt; if (P.sinceHurt > 5 && P.health < 100) P.health = Math.min(100, P.health + 4 * (P.regenK || 1) * dt);
    animate(dt, mag);
    if (P.hitstop > 0) P.hitstop -= dt; else mixer.update(dt); // pausa de impacto corta
    face.update(dt);
  }

  function stepMove(dt, wx, wz, mag, inp) {
    const T = TUNE;
    const sprint = inp.held('sprint');
    if (P.grounded && P.dashT > 0) { // esquiva: conserva el impulso, sin control ni salto
      P.dashT -= dt; P.vel.y = Math.min(P.vel.y, 0) - 2 * dt; P.vel.x *= Math.exp(-2.5 * dt); P.vel.z *= Math.exp(-2.5 * dt);
      return;
    }
    if (P.grounded) {
      P.vel.y = Math.min(P.vel.y, 0) - 2 * dt; // pegado al piso (escaleras/cordones)
      // súper salto: quieto, mantener SALTO carga (Mateo se agacha) y al soltar salta más alto
      if (inp.pressed('jump') && P.stun <= 0 && !P.talking) {
        if (P.airBuffered) { P.airBuffered = false; doJump(); }
        else if (P.speed2d < 1.2 && mag < 0.2 && !P.civil) { P.charging = true; P.charge = 0; }
        else doJump();
      } else if (P.airBuffered && P.buffer > 0) { P.airBuffered = false; doJump(); }
      if (P.charging) { P.charge = Math.min(1, Math.max(0, P.jumpHeld - 0.15) / T.superCharge); if (mag > 0.4) { P.charging = false; doJump(); } }
      let target = (mag < 0.55 && P.analogWalk !== false ? T.walk + (T.run - T.walk) * Math.max(0, (mag - 0.25) / 0.3) : sprint ? T.sprint : T.run) * mag;
      if (P.charging || P.talking || P.stun > 0) target = Math.min(target, P.stun > 0 ? 0 : T.walk * 0.5);
      target *= P.combatMove; // V2: más lento mientras pega, carga o se cubre
      const tvx = wx * target, tvz = wz * target;
      const acc = target > P.speed2d ? T.accel : T.decel;
      const dvx = tvx - P.vel.x, dvz = tvz - P.vel.z, dl = Math.hypot(dvx, dvz), mx = acc * dt;
      if (dl > mx) { P.vel.x += dvx / dl * mx; P.vel.z += dvz / dl * mx; } else { P.vel.x = tvx; P.vel.z = tvz; }
      if (P.charging && inp.released('jump')) {
        P.charging = false;
        if (P.charge < 0.08) doJump();
        else { const k = P.charge; P.vel.y = T.superMin + (T.superMax - T.superMin) * k; P.grounded = false; P.coyote = 0; P.buffer = 0; P.stats.superJumps++; P.jumpT = 9; oneShot('super_jump', 0.45); sfx.superJump(k); fx && fx.ring(P.pos.x, P.pos.y + 0.05, P.pos.z, 0x7ff6ff); onEvent('superJump', { power: k }); }
        P.charge = 0;
      }
    } else {
      P.charging = false; P.charge = 0;
      // control aéreo
      const tvx = wx * T.airMax * mag, tvz = wz * T.airMax * mag;
      if (mag > 0.05) {
        const proj = P.vel.x * wx + P.vel.z * wz;
        if (proj < T.airMax || P.speed2d < T.airMax) { P.vel.x += (tvx - P.vel.x) * Math.min(1, T.airAccel * dt * 0.25) + wx * T.airAccel * dt * 0.5; P.vel.z += (tvz - P.vel.z) * Math.min(1, T.airAccel * dt * 0.25) + wz * T.airAccel * dt * 0.5; }
      }
      // coyote / buffer / doble salto / altura variable
      P.jumpT = (P.jumpT || 0) + dt;
      if (inp.pressed('jump') && P.coyote > 0 && P.stun <= 0) doJump();
      else if (inp.pressed('jump') && P.vel.y < 0 && P.pos.y - world.groundAt(P.pos.x, P.pos.z, P.pos.y) < 1.4 && P.doubleUsed) { P.airBuffered = true; }
      else if (inp.pressed('jump') && !P.doubleUsed && P.coyote <= 0 && P.stun <= 0 && P.civil) { P.civilBlocked++; onEvent('civilBlocked', { what: 'doble salto' }); P.doubleUsed = true; }
      else if (inp.pressed('jump') && !P.doubleUsed && P.coyote <= 0 && P.stun <= 0) {
        P.doubleUsed = true; P.vel.y = Math.max(P.vel.y, T.doubleJump); P.buffer = 0; P.stats.doubleJumps++;
        oneShot('double_jump', 0.45); sfx.jump(1.2); fx && fx.ring(P.pos.x, P.pos.y, P.pos.z, 0xffffff); onEvent('doubleJump', {});
      }
      // planeo: mantener SALTO cayendo (después del doble salto)
      P.gliding = !P.civil && P.canGlide !== false && inp.held('jump') && P.vel.y < -2 && P.doubleUsed && P.jumpHeld > 0.25;
      P.vel.y -= T.gravity * dt * (inp.held('jump') && P.vel.y > 0 && P.jumpT < 0.32 ? 0.5 : 1);
      if (P.gliding) { P.vel.y = Math.max(P.vel.y, -T.glideFall); const hs = P.speed2d || 1, f = Math.max(hs, T.glideSpeed); const dx = mag > 0.1 ? wx : P.vel.x / hs, dz = mag > 0.1 ? wz : P.vel.z / hs; P.vel.x = damp(P.vel.x, dx * f, 2, dt); P.vel.z = damp(P.vel.z, dz * f, 2, dt); }
      P.vel.y = Math.max(P.vel.y, -T.maxFall);
    }
  }
  function doJump() {
    P.vel.y = TUNE.jump + Math.min(2.5, P.speed2d * 0.12); P.grounded = false; P.coyote = 0; P.buffer = 0; P.charging = false; P.jumpT = 0; P.airBuffered = false; P.stats.jumps++;
    oneShot('start_jump', 0.18); sfx.jump(1); onEvent('jump', {});
  }
  function startWall(r, into) {
    P.state = 'wallrun'; P.wall.nx = r.wallNx; P.wall.nz = r.wallNz; P.wall.t = 0; P.wall.box = r.wallBox;
    // dirección a lo largo de la pared que coincide con la velocidad
    let tx = -r.wallNz, tz = r.wallNx; if (tx * P.vel.x + tz * P.vel.z < 0) { tx = -tx; tz = -tz; }
    const along = P.vel.x * tx + P.vel.z * tz;
    P.wall.climb = along < 3.5 && into > 0.5;
    P.wall.tx = tx; P.wall.tz = tz;
    P.wall.side = (tx * -P.wall.nz + tz * P.wall.nx) < 0 ? 1 : -1; // 1 = pared a la izquierda
    P.vel.y = Math.max(P.vel.y, P.wall.climb ? TUNE.climbSpeed : 3.5);
    P.doubleUsed = false; P.stats.wallruns++;
    sfx.step(1.2); onEvent('wallrun', { climb: P.wall.climb });
  }
  function stepWall(dt, wx, wz, mag, inp) {
    const T = TUNE, W = P.wall;
    W.t += dt;
    if (W.climb) {
      P.vel.x = -W.nx * 2; P.vel.z = -W.nz * 2; P.vel.y = T.climbSpeed;
      if (mag < 0.2 || (wx * -W.nx + wz * -W.nz) < 0.2) { P.state = 'air'; W.cool = 0.3; }
    } else {
      const sp = Math.max(9, P.vel.x * W.tx + P.vel.z * W.tz);
      P.vel.x = W.tx * sp - W.nx * 1.5; P.vel.z = W.tz * sp - W.nz * 1.5;
      P.vel.y -= T.gravity * T.wallGrav * dt;
      if ((wx * W.nx + wz * W.nz) > 0.7) { P.state = 'air'; W.cool = 0.3; } // empujar hacia afuera suelta
    }
    if (W.t > (W.climb ? 3 : T.wallTime)) { P.state = 'air'; W.cool = 0.35; }
    if (inp.pressed('jump')) { // salto de pared
      P.vel.x = W.nx * 8 + (W.climb ? 0 : W.tx * 6); P.vel.z = W.nz * 8 + (W.climb ? 0 : W.tz * 6); P.vel.y = T.jump * 1.05;
      P.state = 'air'; W.cool = 0.35; P.doubleUsed = false; P.buffer = 0;
      oneShot('double_jump', 0.45); sfx.jump(1.1); onEvent('wallJump', {});
    }
  }
  function stepSwing(dt, wx, wz, mag, inp) {
    const T = TUNE, R = P.rope;
    R.t += dt;
    P.vel.y -= T.gravity * dt;
    // fuerza del jugador tangente a la cuerda (bombear)
    if (mag > 0.05) {
      const ax = P.pos.x - R.x, ay = P.pos.y + 1 - R.y, az = P.pos.z - R.z, al = Math.hypot(ax, ay, az) || 1;
      let px = wx, py = 0, pz = wz; const dot = (px * ax + py * ay + pz * az) / al; px -= dot * ax / al; py -= dot * ay / al; pz -= dot * az / al;
      P.vel.x += px * T.swingForce * dt * mag; P.vel.y += py * T.swingForce * dt * mag; P.vel.z += pz * T.swingForce * dt * mag;
    }
    // el cable se recoge hasta el largo objetivo (tirón inicial); cerca del piso se acorta más para no arrastrar
    R.len = Math.max(R.target, R.len - 15 * dt);
    const gy = world.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.5);
    if (P.pos.y - gy < 1.6 && P.vel.y < 0) R.len = Math.max(T.ropeMin, R.len - 6 * dt);
    // restricción de péndulo: si la cuerda queda tensa se elimina la velocidad radial hacia afuera (conserva la tangencial)
    // y se corrige la posición con una velocidad acotada (sin teletransportes ni energía extra)
    const nx = P.pos.x + P.vel.x * dt, ny = P.pos.y + 1 + P.vel.y * dt, nz = P.pos.z + P.vel.z * dt;
    const dx = nx - R.x, dy = ny - R.y, dz = nz - R.z, d = Math.hypot(dx, dy, dz);
    if (d > R.len) {
      const ux = dx / d, uy = dy / d, uz = dz / d, vr = P.vel.x * ux + P.vel.y * uy + P.vel.z * uz;
      if (vr > 0) { P.vel.x -= vr * ux; P.vel.y -= vr * uy; P.vel.z -= vr * uz; }
      const over = Math.min(d - R.len, 14 * dt);
      P.vel.x -= ux * over / dt; P.vel.y -= uy * over / dt; P.vel.z -= uz * over / dt;
    }
    const sp = Math.hypot(P.vel.x, P.vel.y, P.vel.z); if (sp > T.swingMax) P.vel.multiplyScalar(T.swingMax / sp);
    // soltar: salto (con impulso), o automáticamente si pasamos muy por encima del anclaje
    if (inp.pressed('jump')) release(true);
    else if (P.pos.y + 1 > R.y - 0.5 && R.t > 0.4) release(false);
    else if (R.t > 12) release(false);
  }
  function land(impact) {
    P.stats.landings++;
    if (res.groundBox && res.groundBox.kind === 'trampoline' && P.state !== 'swing') { // cama elástica: rebote alto
      P.vel.y = Math.max(16, impact * 0.9); P.grounded = false; P.doubleUsed = false; P.stats.bounces = (P.stats.bounces || 0) + 1;
      oneShot('double_jump', 0.45); sfx.superJump(0.5); onEvent('bounce', {}); return;
    }
    if (P.state === 'swing') return;
    const hard = impact > 22, roll = impact > 14 && P.speed2d > 6;
    if (hard) { oneShot('hard_land', 0.35); sfx.land(1.4); fx && fx.dust(P.pos.x, P.pos.y, P.pos.z, 14); P.landT = 0.25; }
    else if (roll) { oneShot('roll_land', 0.5); sfx.land(1); fx && fx.dust(P.pos.x, P.pos.y, P.pos.z, 8); }
    else if (impact > 4) { oneShot('soft_land', 0.18); sfx.land(0.6); }
    onEvent('land', { impact, roof: P.pos.y > 3 });
  }
  function respawn() {
    if (!world.safeFloor(P.lastSafe.x, P.lastSafe.z, 3)) P.lastSafe.set(P.lastSafe.x > 200 ? 250 : -40, 0.3, 0);
    P.pos.copy(P.lastSafe); P.pos.y += 0.2; P.visY = P.pos.y; P.vel.set(0, 0, 0); P.rope = null; P.state = 'air';
    onEvent('respawn', {});
  }

  function animate(dt, mag) {
    if (P.oneShot) return;
    const s = P.speed2d;
    if (P.stun > 0) return play('stagger', 0.1);
    if (P.talking) return play('talk', 0.25);
    if (P.state === 'swing') return play(P.rope && P.rope.len > 26 ? 'swing_2hand' : 'swing_1hand', 0.2, 0.8 + Math.min(1, s / 30));
    if (P.state === 'wallrun') return play(P.wall.climb ? 'wall_climb' : (P.wall.side > 0 ? 'wall_run_left' : 'wall_run_right'), 0.12);
    if (!P.grounded) {
      if (P.gliding) return play('air_glide', 0.25);
      if (P.vel.y > 4) return play('ascend', 0.2);
      if (P.vel.y > -3) return play('jump_apex', 0.2);
      return play('fall', 0.3);
    }
    if (P.charging) return play('super_jump_charge', 0.15);
    if (P.chargeAtk) return play('charge_windup', 0.1);
    if (P.guard) return play('guard', 0.1);
    if (s < 0.4 && mag > 0.1) return play('turn_in_place', 0.25);
    locomotion(dt, s);
  }

  /* ---------- ataque no letal y daño ---------- */
  function attack() {
    if (P.attackCd > 0 || P.stun > 0) return false;
    P.attackCd = 0.45; oneShot('stun_attack', 0.42); sfx.pulse(); fx && fx.pulse(P.pos.x + Math.sin(P.yaw) * 1.2, P.pos.y + 0.9, P.pos.z + Math.cos(P.yaw) * 1.2);
    return true;
  }
  function damage(n, fromX, fromZ) {
    if (P.iframe > 0) return false;
    if (damageFilter) { // V2: guardia de frente / esquiva con invulnerabilidad
      n = damageFilter(n, fromX, fromZ);
      if (n <= 0) { const dx = P.pos.x - fromX, dz = P.pos.z - fromZ, l = Math.hypot(dx, dz) || 1; P.vel.x += dx / l * 2.5; P.vel.z += dz / l * 2.5; fx && fx.ring(P.pos.x, P.pos.y + 0.05, P.pos.z, 0x7ff6ff, 1.5); return false; }
    }
    P.sinceHurt = 0;
    P.health = Math.max(0, P.health - n); P.iframe = 1.2;
    const dx = P.pos.x - fromX, dz = P.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    P.vel.x += dx / l * 6; P.vel.z += dz / l * 6; P.vel.y = Math.max(P.vel.y, 4);
    if (P.rope) release(false);
    P.stun = 0.45; oneShot('hit_react', 0.35); face.set('surprised'); setTimeout(() => face.set('smile'), 900);
    sfx.hurt(); onEvent('hurt', { n });
    // sin energía: Mateo se cansa y vuelve a un lugar seguro con algo de energía (nunca «muere»)
    if (P.health <= 0) { P.exhausted++; onEvent('exhausted', {}); respawn(); P.health = 60; P.stun = 0; }
    return true;
  }

  /** Actualiza el cable visual y la retícula de anclaje (cada cuadro de render). */
  function render(cam, showPreview) {
    const g = model.group;
    if (P.seatVis) { g.position.set(P.seatVis.x, P.seatVis.y, P.seatVis.z); g.rotation.y = P.seatVis.yaw; }
    else { g.position.set(P.pos.x, P.visY, P.pos.z); g.rotation.y = P.yaw; }
    g.visible = P.iframe <= 0 || Math.floor(P.iframe * 12) % 2 === 0;
    if (P.rope) {
      const w = model.wrist.R || model.wrist.L; w.getWorldPosition(_v);
      _w.set(P.rope.x, P.rope.y, P.rope.z).sub(_v);
      const len = _w.length();
      for (const m of [ropeMesh, ropeGlow]) { m.visible = true; m.position.copy(_v); m.scale.set(1, len, 1); m.quaternion.copy(_q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _w.normalize())); }
      anchorDot.visible = true; anchorDot.position.set(P.rope.x, P.rope.y, P.rope.z);
      reticle.visible = false;
    } else {
      ropeMesh.visible = ropeGlow.visible = false; anchorDot.visible = false;
      const a = showPreview ? P.anchorPreview : null;
      reticle.visible = !!a;
      if (a) { reticle.position.set(a.x + a.nx * 0.08, a.y + a.ny * 0.08, a.z + a.nz * 0.08); reticle.lookAt(cam.position); const k = 1 + 0.12 * Math.sin(performance.now() * 0.01); reticle.scale.setScalar(k * Math.max(1, a.t / 14)); }
    }
  }
  let previewAcc = 0;
  /** V2 P2: Mateo sentado en el kart (sin física propia: la posición la pone el kart) */
  function drive(dt, seat) {
    P.seatVis = seat; P.charging = false; P.rope = null; P.gliding = false;
    play('sit', 0.25); mixer.update(dt); face.update(dt);
  }
  return {
    P, mixer, actions, step, render, drive, attack, damage, release, attach, findAnchor, respawn, oneShot, play,
    setDamageFilter(fn) { damageFilter = fn; },
    /** recalcula el anclaje sugerido cada 0,1 s (retícula de aptitud) */
    preview(dt, cam) { previewAcc += dt; if (previewAcc > 0.1) { previewAcc = 0; P.anchorPreview = P.rope || P.civil ? null : findAnchor(cam.yaw, cam.pitch); } },
    get stride() { return { ...stride }; },
    get loco() { return { on: loco.on, phase: +loco.phase.toFixed(3), w: { ...loco.w } }; },
    teleport(x, y, z) { P.visY = y; P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.rope = null; P.state = 'air'; P.lastSafe.set(x, y, z); },
    dispose() { for (const m of [ropeMesh, ropeGlow, reticle, anchorDot]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } },
  };
}
