// @ts-check
/* Coloso Radiactivo — jefe del Laboratorio tóxico.
   Intro: emerge de la pileta tóxica (cámara cinemática).
   Fase 1 «Blindado»: sólo los 3 tanques radiactivos (hombros y espalda) reciben daño completo.
     Pisotón (anillo que se llena) y arranca coberturas para arrojarlas (círculo rojo en el piso).
     Si te escondés detrás de una cobertura, la rompe a propósito.
   Fase 2 «Marea tóxica» (sin tanques): altera la arena inundando cuadrantes (aviso amarillo → verde tóxico),
     expone el núcleo del pecho, barre con un rayo (línea de aviso) y llama corredores.
   Fase 3 «Furia» (núcleo < 45 %): ciclos más rápidos, salto aplastante sobre tu posición que destruye coberturas.
   Recompensa: núcleo del Coloso (puntos, cura total y trofeo) y el transporte puede aterrizar. */
import * as THREE from 'three';
import { BOSS } from './config.js';
import * as M from './models.js';
import { raySphere, lerpAngle } from './enemies.js';

export function createBoss(ctx) {
  const model = M.buildColossus();
  const tankGeo = M.buildTank(), coreGeo = M.buildCore();
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xc8ff4a, toneMapped: false });
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.1, emissive: 0x000000 });
  const g = new THREE.Group(); g.name = 'coloso'; g.visible = false;
  const body = new THREE.Mesh(model.body, bodyMat); body.castShadow = true;
  const mkLimb = (/** @type {THREE.BufferGeometry} */ geo, /** @type {number[]} */ piv) => { const p = new THREE.Group(); p.position.fromArray(piv); const m = new THREE.Mesh(geo, bodyMat); m.castShadow = true; p.add(m); return p; };
  const armL = mkLimb(model.arm, model.armPivot), armR = mkLimb(model.arm, [-model.armPivot[0], model.armPivot[1], model.armPivot[2]]);
  const legL = mkLimb(model.leg, model.legPivot), legR = mkLimb(model.leg, [-model.legPivot[0], model.legPivot[1], model.legPivot[2]]);
  const tankDefs = [[2.0, 7.9, -0.6, 0.3], [-2.0, 7.9, -0.6, -0.3], [0, 6.6, -1.6, 0]];
  const tanks = tankDefs.map(([x, y, z, rz]) => {
    const m = new THREE.Mesh(tankGeo, glowMat); m.position.set(x, y, z); m.rotation.z = rz; m.rotation.x = 0.4;
    return { mesh: m, hp: 0, max: 0, alive: true, local: new THREE.Vector3(x, y, z), world: new THREE.Vector3() };
  });
  const core = new THREE.Mesh(coreGeo, coreMat); core.position.set(0, 6.3, 1.35); core.visible = false;
  const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 1, 8, 1, true); beamGeo.rotateX(Math.PI / 2); beamGeo.translate(0, 0, 0.5);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xb6ff3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.visible = false; beam.frustumCulled = false;
  g.add(body, armL, armR, legL, legR, core, ...tanks.map(t => t.mesh));
  ctx.root.add(g); ctx.root.add(beam);

  // marea tóxica: 4 cuadrantes alrededor de la pileta
  const quadGeo = new THREE.PlaneGeometry(1, 1); quadGeo.rotateX(-Math.PI / 2);
  const quads = [0, 1, 2, 3].map(() => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(quadGeo, mat); m.position.y = 0.09; m.visible = false; ctx.root.add(m);
    return { m, mat, state: 'off', t: 0, x0: 0, x1: 0, z0: 0, z1: 0 };
  });

  const B = {
    phase: 0, state: 'off', t: 0, pos: new THREE.Vector3(), yaw: Math.PI, coreHp: 0, coreMax: 0,
    atk: '', atkT: 0, cd: 3, beamCd: 6, tideCd: 4, summonCd: 12, hideT: 0, lock: new THREE.Vector3(), beamYaw: 0, beamDir: 1,
    leapFrom: new THREE.Vector3(), leapTo: new THREE.Vector3(), flash: 0, stepT: 0, intro: 0, dead: false, tides: 0, covers: 0, forced: '',
  };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Vector3();

  function reset() {
    B.phase = 0; B.state = 'off'; B.t = 0; B.dead = false; g.visible = false; beam.visible = false; core.visible = false;
    for (const t of tanks) { t.alive = true; t.mesh.visible = true; }
    for (const q of quads) { q.state = 'off'; q.m.visible = false; q.mat.opacity = 0; }
    B.atk = ''; B.covers = 0; B.tides = 0;
  }
  function start() {
    const W = ctx.W, D = ctx.diff;
    reset();
    B.pos.copy(W.poolCenter || new THREE.Vector3()); B.pos.y = -10;
    B.yaw = Math.atan2(ctx.player.pos.x - B.pos.x, ctx.player.pos.z - B.pos.z);
    for (const t of tanks) { t.hp = t.max = BOSS.tankHp * D.bossHp; }
    B.coreHp = B.coreMax = BOSS.hp * 0.62 * D.bossHp;
    B.state = 'intro'; B.t = 0; B.phase = 1; g.visible = true;
    B.cd = 2.5; B.beamCd = 5; B.tideCd = 3; B.summonCd = 10;
    // cuadrantes según la pileta y los límites de la arena
    const c = B.pos, b = W.bounds;
    const rects = [[b.minX, c.x, b.minZ, c.z], [c.x, b.maxX, b.minZ, c.z], [b.minX, c.x, c.z, b.maxZ], [c.x, b.maxX, c.z, b.maxZ]];
    quads.forEach((q, i) => { const [x0, x1, z0, z1] = rects[i]; q.x0 = x0; q.x1 = x1; q.z0 = z0; q.z1 = z1; q.m.position.set((x0 + x1) / 2, 0.09, (z0 + z1) / 2); q.m.scale.set(x1 - x0, 1, z1 - z0); });
  }
  const tel = () => ctx.diff.telegraph;
  const speedK = () => B.phase >= 3 ? 0.68 : B.phase === 2 ? 0.85 : 1;

  function update(dt) {
    if (B.state === 'off' || B.state === 'dead') { updateTides(dt); return; }
    const P = ctx.player, W = ctx.W;
    B.t += dt; B.flash = Math.max(0, B.flash - dt);
    if (B.state === 'intro') {
      B.pos.y = Math.min(0, -10 + B.t * 3.4);
      if (Math.random() < 0.6) ctx.fx.sparks.plume(B.pos.x, 0.3, B.pos.z, 3, 0x9dff3a, 5, 3, 1.4);
      if (B.t > 1.2 && B.t - dt <= 1.2) ctx.sfx.roar(B.pos, true);
      ctx.hooks.shake(0.12, B.pos);
      if (B.t > 3.4) { B.pos.y = 0; B.state = 'fight'; B.t = 0; ctx.hooks.bossIntroDone(); }
      return;
    }
    if (B.state === 'dying') {
      B.pos.y -= dt * 1.2;
      if (Math.random() < dt * 10) { _v.set(B.pos.x + (Math.random() - 0.5) * 4, 2 + Math.random() * 6, B.pos.z + (Math.random() - 0.5) * 4); ctx.fx.sparks.burst(_v.x, _v.y, _v.z, 14, 0xb6ff3a, 7, 0.7, 4, 0.2); ctx.sfx.boom(_v); }
      if (B.t > 2.6) { B.state = 'dead'; B.phase = 5; g.visible = false; beam.visible = false; ctx.hooks.bossDefeated(); }
      return;
    }
    const dx = P.pos.x - B.pos.x, dz = P.pos.z - B.pos.z, dist = Math.hypot(dx, dz);
    // ataques
    if (B.atk === '') {
      // seguir al jugador sin pegarse
      const want = Math.atan2(dx, dz);
      B.yaw = lerpAngle(B.yaw, want, Math.min(1, dt * 1.6));
      if (dist > 10) {
        const sp = (B.phase >= 3 ? 2.6 : 1.7) * ctx.diff.enemySpeed;
        B.pos.x += Math.sin(B.yaw) * sp * dt; B.pos.z += Math.cos(B.yaw) * sp * dt; B.stepT += dt * sp;
      }
      W.collide(B.pos, 2.0, true);
      smashCoversAround(2.6);
      // ¿escondido detrás de una cobertura?
      const hidden = !W.los(B.pos, P.pos, 1.0) && W.los(B.pos, P.pos, 2.4, true);
      B.hideT = hidden ? B.hideT + dt : 0;
      B.cd -= dt; B.beamCd -= dt; B.summonCd -= dt;
      if (B.forced) { const f = B.forced; B.forced = ''; if (f === 'stomp') startStomp(); else if (f === 'throw') startThrow(false); else if (f === 'hide') startThrow(true); else if (f === 'beam') startBeam(); else if (f === 'leap') startLeap(); else if (f === 'tide') B.tideCd = 0; }
      else if (B.hideT > 1.8) { startThrow(true); B.hideT = 0; }
      else if (B.cd <= 0) {
        if (B.phase >= 2 && B.beamCd <= 0 && dist > 5) startBeam();
        else if (B.phase >= 3 && Math.random() < 0.45) startLeap();
        else if (dist < 8.5) startStomp();
        else startThrow(false);
      }
      if (B.phase >= 2 && B.summonCd <= 0) { B.summonCd = B.phase >= 3 ? 14 : 18; ctx.hooks.summon(B.phase >= 3 ? 4 : 3); }
    } else {
      B.atkT += dt;
      if (B.atk === 'stomp') {
        if (B.atkT > 1.1 * tel()) {
          const r = 7.6;
          ctx.fx.tele.zone(B.pos.x, B.pos.z, r + 1, 0.4, 0xffe08a, true);
          ctx.fx.gore.burst(B.pos.x, 0.3, B.pos.z, ctx.reduced ? 14 : 36, 0x6a5a4a, 9, 0.8, 14, 0.5);
          ctx.sfx.boom(B.pos); ctx.hooks.shake(0.6, B.pos);
          if (dist < r) { ctx.hooks.hurtPlayer(22 * ctx.diff.enemyDmg, B.pos, 'stomp'); P.knock.set(dx, 0, dz).normalize().multiplyScalar(10); }
          endAtk(2.2);
        }
      } else if (B.atk === 'throw') {
        B.yaw = lerpAngle(B.yaw, Math.atan2(B.lock.x - B.pos.x, B.lock.z - B.pos.z), Math.min(1, dt * 5));
        if (B.atkT > 0.9 * tel()) {
          _v.set(B.pos.x + Math.cos(B.yaw) * 2.4, 9, B.pos.z - Math.sin(B.yaw) * 2.4);
          const target = B.lock.clone();
          ctx.enemies.lob('rock', _v, target, 1.1, 24 * ctx.diff.enemyDmg, 2.3, 0, (/** @type {THREE.Vector3} */ at) => {
            for (const c of W.covers) if (c.alive && (c.pos.x - at.x) ** 2 + (c.pos.z - at.z) ** 2 < 2.4 * 2.4) { W.destroyCover(c); B.covers++; ctx.hooks.coverDestroyed(c); }
          });
          endAtk(2.0);
        }
      } else if (B.atk === 'beam') {
        if (B.atkT < 1.2 * tel()) {
          if (Math.random() < 0.5) ctx.fx.sparks.burst(B.pos.x + Math.sin(B.yaw) * 1.6, 7.9, B.pos.z + Math.cos(B.yaw) * 1.6, 2, 0xb6ff3a, 2, 0.3, 0, 0);
        } else {
          const k = (B.atkT - 1.2 * tel()) / 1.9;
          const ang = B.beamYaw + B.beamDir * (k - 0.5) * 1.5;
          B.yaw = ang;
          beam.visible = true;
          _o.set(B.pos.x + Math.sin(ang) * 1.6, 7.9, B.pos.z + Math.cos(ang) * 1.6);
          // el rayo baja hacia el piso a ~14 m y barre
          _w.set(Math.sin(ang), -0.33, Math.cos(ang)).normalize();
          let len = 26;
          const h = W.raycast(_o, _w, len);
          if (h.t < len) {
            len = h.t;
            if (h.kind === 'cover' && h.ref) { h.ref.hp -= 160 * dt; if (h.ref.hp <= 0) { W.destroyCover(h.ref); B.covers++; ctx.hooks.coverDestroyed(h.ref); } }
          }
          beam.position.copy(_o); beam.lookAt(_v.copy(_o).addScaledVector(_w, len)); beam.scale.set(1 + Math.sin(B.atkT * 40) * 0.2, 1 + Math.sin(B.atkT * 40) * 0.2, len);
          _v.copy(_o).addScaledVector(_w, len);
          if (Math.random() < 0.7) ctx.fx.sparks.burst(_v.x, Math.max(0.1, _v.y), _v.z, 3, 0xb6ff3a, 5, 0.4, 6, 0.4);
          // daño: distancia del jugador a la línea del rayo
          const px = P.pos.x - _o.x, py = 1.0 - _o.y, pz = P.pos.z - _o.z;
          const tt = Math.max(0, Math.min(len, px * _w.x + py * _w.y + pz * _w.z));
          const qx = _o.x + _w.x * tt - P.pos.x, qy = _o.y + _w.y * tt - 1.0, qz = _o.z + _w.z * tt - P.pos.z;
          if (qx * qx + qy * qy + qz * qz < 1.3 * 1.3) ctx.hooks.hurtPlayer(32 * ctx.diff.enemyDmg * dt, B.pos, 'beam', true);
          if (k >= 1) { beam.visible = false; endAtk(2.4); B.beamCd = B.phase >= 3 ? 7 : 10; }
        }
      } else if (B.atk === 'leap') {
        const dur = 1.3 * tel();
        if (B.atkT < 0.5 * dur) { /* agacharse */ }
        else {
          const k = Math.min(1, (B.atkT - 0.5 * dur) / (0.5 * dur));
          B.pos.lerpVectors(B.leapFrom, B.leapTo, k); B.pos.y = Math.sin(k * Math.PI) * 7;
          if (k >= 1) {
            B.pos.y = 0;
            ctx.sfx.boom(B.pos); ctx.hooks.shake(0.8, B.pos);
            ctx.fx.gore.burst(B.pos.x, 0.3, B.pos.z, ctx.reduced ? 14 : 40, 0x7a6a5a, 10, 0.9, 14, 0.6);
            const d2 = (P.pos.x - B.pos.x) ** 2 + (P.pos.z - B.pos.z) ** 2;
            if (d2 < 3.8 * 3.8) { ctx.hooks.hurtPlayer(35 * ctx.diff.enemyDmg, B.pos, 'leap'); P.knock.set(P.pos.x - B.pos.x, 0, P.pos.z - B.pos.z).normalize().multiplyScalar(12); }
            smashCoversAround(4.2);
            W.collide(B.pos, 2.0, true);
            endAtk(2.2);
          }
        }
      }
    }
    // marea tóxica
    if (B.phase >= 2) {
      B.tideCd -= dt;
      if (B.tideCd <= 0) {
        B.tideCd = B.phase >= 3 ? 8 : 10;
        const n = B.phase >= 3 ? 2 : 1;
        const pq = quadOf(P.pos.x, P.pos.z);
        const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        // siempre incluye el cuadrante del jugador (lo obliga a moverse), pero nunca los 4
        const pick = [pq, ...order.filter(i => i !== pq)].slice(0, n);
        for (const i of pick) { const q = quads[i]; if (q.state === 'off') { q.state = 'warn'; q.t = 0; q.m.visible = true; B.tides++; } }
        ctx.hooks.tideWarn();
      }
    }
    updateTides(dt);
  }
  function updateTides(dt) {
    for (const q of quads) {
      if (q.state === 'off') continue;
      q.t += dt;
      if (q.state === 'warn') {
        q.mat.color.setHex(0xffd23a); q.mat.opacity = 0.12 + 0.14 * (Math.sin(q.t * 14) > 0 ? 1 : 0);
        if (q.t > 2.5 * tel()) { q.state = 'toxic'; q.t = 0; }
      } else if (q.state === 'toxic') {
        q.mat.color.setHex(0x7dff3a); q.mat.opacity = 0.42 + 0.06 * Math.sin(q.t * 3);
        if (Math.random() < dt * 8) ctx.fx.sparks.plume(q.x0 + Math.random() * (q.x1 - q.x0), 0.1, q.z0 + Math.random() * (q.z1 - q.z0), 1, 0x7dff3a, 1, 0.8, 1.2);
        if (q.t > 6) { q.state = 'off'; q.m.visible = false; q.mat.opacity = 0; }
      }
    }
  }
  function quadOf(x, z) { const c = B.pos; return (x < (quads[0].x1) ? 0 : 1) + (z < quads[0].z1 ? 0 : 2); }
  /** Daño por segundo de la marea en un punto. */
  function tideDps(x, z) {
    for (const q of quads) if (q.state === 'toxic' && x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return 12 * ctx.diff.enemyDmg;
    return 0;
  }
  function endAtk(cd) { B.atk = ''; B.atkT = 0; B.cd = cd * speedK(); }
  function startStomp() { B.atk = 'stomp'; B.atkT = 0; ctx.fx.tele.zone(B.pos.x, B.pos.z, 7.6, 1.1 * tel(), 0xffb02a); ctx.sfx.growl(B.pos); }
  function startThrow(atCover) {
    const W = ctx.W, P = ctx.player;
    B.atk = 'throw'; B.atkT = 0;
    let target = null;
    if (atCover) {
      // cobertura que tapa al jugador: la más cercana a él entre ambos
      let best = 1e9;
      for (const c of W.covers) {
        if (!c.alive) continue;
        const d = (c.pos.x - P.pos.x) ** 2 + (c.pos.z - P.pos.z) ** 2;
        if (d < best && d < 12) { best = d; target = c.pos; }
      }
    }
    B.lock.copy(target || P.pos); B.lock.y = 0;
    ctx.fx.tele.zone(B.lock.x, B.lock.z, 2.3, 0.9 * tel() + 1.1, 0xff3a2a);
    ctx.sfx.growl(B.pos);
  }
  function startBeam() {
    const P = ctx.player;
    B.atk = 'beam'; B.atkT = 0; B.beamDir = Math.random() < 0.5 ? 1 : -1;
    B.beamYaw = Math.atan2(P.pos.x - B.pos.x, P.pos.z - B.pos.z);
    const a0 = B.beamYaw - B.beamDir * 0.75;
    ctx.fx.tele.line(B.pos.x, B.pos.z, a0, 22, 0.8, 1.2 * tel(), 0xb6ff3a);
    ctx.fx.tele.line(B.pos.x, B.pos.z, B.beamYaw + B.beamDir * 0.75, 22, 0.5, 1.2 * tel(), 0xb6ff3a);
    ctx.sfx.charge(B.pos);
  }
  function startLeap() {
    const P = ctx.player;
    B.atk = 'leap'; B.atkT = 0;
    B.leapFrom.copy(B.pos); B.leapTo.set(P.pos.x, 0, P.pos.z);
    ctx.fx.tele.zone(B.leapTo.x, B.leapTo.z, 3.8, 1.3 * tel(), 0xff3a2a);
    ctx.sfx.roar(B.pos);
  }
  function smashCoversAround(r) {
    const W = ctx.W;
    for (const c of W.covers) if (c.alive && (c.pos.x - B.pos.x) ** 2 + (c.pos.z - B.pos.z) ** 2 < r * r) {
      W.destroyCover(c); B.covers++; ctx.hooks.coverDestroyed(c);
      ctx.fx.gore.burst(c.pos.x, 0.6, c.pos.z, 18, 0x9aa0a0, 6, 0.8, 14, 0.5);
    }
  }

  /** Raycast contra tanques, núcleo y cuerpo. */
  const res = { t: Infinity, part: '', ref: /** @type {any} */ (null) };
  function raycast(o, d, maxT) {
    res.t = Infinity; res.part = ''; res.ref = null;
    if (!(B.state === 'fight') && !(B.state === 'intro' && B.t > 2)) return res;
    g.updateMatrixWorld(true);
    for (const t of tanks) {
      if (!t.alive) continue;
      t.mesh.getWorldPosition(t.world);
      const th = raySphere(o, d, t.world.x, t.world.y, t.world.z, 0.95);
      if (th < res.t && th <= maxT) { res.t = th; res.part = 'tank'; res.ref = t; }
    }
    if (B.phase >= 2) {
      core.getWorldPosition(_v);
      const th = raySphere(o, d, _v.x, _v.y, _v.z, 1.0);
      if (th < res.t && th <= maxT) { res.t = th; res.part = 'core'; res.ref = core; }
    }
    // cuerpo: torso, cabeza y piernas
    const cy = Math.cos(B.yaw), sy = Math.sin(B.yaw);
    const spheres = [[0, 6.2, 0, 2.2], [0, 7.9, 0.9, 0.9], [0, 4.4, 0, 1.6], [0.85, 2.0, 0, 0.9], [-0.85, 2.0, 0, 0.9]];
    for (const [lx, ly, lz, r] of spheres) {
      const wx = B.pos.x + lx * cy + lz * sy, wz = B.pos.z - lx * sy + lz * cy;
      const th = raySphere(o, d, wx, B.pos.y + ly, wz, r);
      if (th < res.t - 0.3 && th <= maxT) { res.t = th; res.part = 'body'; res.ref = null; }
    }
    return res;
  }
  /** Aplica daño a una parte. Devuelve 'tank' | 'tankDown' | 'core' | 'armor' | 'none'. */
  function hit(part, ref, amount) {
    if (B.state !== 'fight') return 'none';
    B.flash = 0.06;
    if (B.phase === 1) {
      if (part === 'tank' && ref && ref.alive) {
        ref.hp -= amount;
        if (ref.hp <= 0) {
          ref.alive = false; ref.mesh.visible = false;
          ref.mesh.getWorldPosition(_v);
          ctx.fx.sparks.burst(_v.x, _v.y, _v.z, ctx.reduced ? 16 : 40, 0xb6ff3a, 9, 0.9, 6, 0.2);
          ctx.sfx.boom(_v); ctx.hooks.shake(0.4, _v);
          if (tanks.every(t => !t.alive)) toPhase(2);
          return 'tankDown';
        }
        return 'tank';
      }
      // el cuerpo blindado apenas recibe daño (y se descuenta de los tanques vivos)
      const t = tanks.find(x => x.alive); if (t) { t.hp -= amount * BOSS.bodyMul; if (t.hp <= 0) return hit('tank', t, 0.01); }
      return 'armor';
    }
    const mul = part === 'core' ? BOSS.coreMul : 0.15;
    B.coreHp -= amount * mul;
    if (B.phase === 2 && B.coreHp < B.coreMax * 0.45) toPhase(3);
    if (B.coreHp <= 0) { die(); return 'core'; }
    return part === 'core' ? 'core' : 'armor';
  }
  function toPhase(n) {
    B.phase = n;
    if (n === 2) { core.visible = true; B.tideCd = 2; B.summonCd = 6; B.cd = 2; }
    ctx.hooks.bossPhase(n);
  }
  function die() {
    if (B.state === 'dying' || B.state === 'dead') return;
    B.state = 'dying'; B.t = 0; B.atk = ''; beam.visible = false; B.coreHp = 0;
    for (const q of quads) if (q.state !== 'off') { q.state = 'off'; q.m.visible = false; }
    ctx.sfx.roar(B.pos, true);
  }

  function render(time) {
    if (!g.visible) return;
    g.position.copy(B.pos); g.rotation.y = B.yaw;
    const walk = Math.sin(B.stepT * 1.4);
    let aL = walk * 0.3, aR = -walk * 0.3, lL = -walk * 0.35, lR = walk * 0.35;
    if (B.atk === 'stomp') { const k = Math.min(1, B.atkT / (1.1 * tel())); lL = -1.1 * Math.sin(k * Math.PI * 0.95); aL = aR = -0.5 * k; }
    if (B.atk === 'throw') { const k = Math.min(1, B.atkT / (0.9 * tel())); aL = -2.8 * k; }
    if (B.atk === 'beam') { aL = aR = -0.6; }
    if (B.atk === 'leap') { const k = Math.min(1, B.atkT / (1.3 * tel())); aL = aR = -2.5 * k; lL = lR = -0.6 * (1 - Math.abs(k - 0.5) * 2); }
    if (B.state === 'intro') { aL = aR = -2.6 + Math.min(1, B.t / 3) * 2.4; }
    if (B.state === 'dying') { aL = aR = 0.6; g.rotation.z = Math.min(0.5, B.t * 0.25); }
    else g.rotation.z = 0;
    armL.rotation.x = aL; armR.rotation.x = aR; legL.rotation.x = lL; legR.rotation.x = lR;
    bodyMat.emissive.setRGB(B.flash > 0 ? 0.5 : 0, B.flash > 0 ? 0.5 : B.phase >= 3 ? 0.08 + 0.06 * Math.sin(time * 8) : 0, B.flash > 0 ? 0.4 : 0);
    coreMat.color.setHSL(0.24, 1, 0.5 + 0.2 * Math.sin(time * 9));
    for (const t of tanks) if (t.alive) t.mesh.rotation.y = time * 0.8;
  }

  function dispose() {
    ctx.root.remove(g); ctx.root.remove(beam);
    for (const q of quads) { ctx.root.remove(q.m); q.mat.dispose(); }
    for (const x of [model.body, model.arm, model.leg, tankGeo, coreGeo, beamGeo, quadGeo]) x.dispose();
    for (const m of [glowMat, coreMat, bodyMat, beamMat]) m.dispose();
  }

  return {
    B, tanks, quads, start, reset, update, render, raycast, hit, tideDps, dispose, toPhase, die,
    get phase() { return B.phase; }, get state() { return B.state; },
    get active() { return B.state === 'intro' || B.state === 'fight' || B.state === 'dying'; },
    bar() {
      if (B.phase === 0 || B.phase >= 5) return 0;
      if (B.phase === 1) return 0.62 + 0.38 * tanks.reduce((a, t) => a + Math.max(0, t.hp), 0) / tanks.reduce((a, t) => a + t.max, 0);
      return 0.62 * Math.max(0, B.coreHp) / B.coreMax;
    },
  };
}
