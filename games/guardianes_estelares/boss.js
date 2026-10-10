// @ts-check
/* Jefe: Destructor Némesis.
   Fase 1 TORRETAS: 4 torretas que avisan (brillo + línea roja) antes de cada ráfaga.
   Fase 2 ESCUDOS: burbuja que absorbe disparos; 3 emisores sólo vulnerables cuando se abren; «barrido» con aviso.
   Fase 3 REACTOR: escudo caído; el reactor se expone por ciclos; «pulso del reactor» con esfera de aviso (cubrirse).
   Fase 4: explosión en cadena → recompensa. */
import * as THREE from 'three';
import * as M from './models.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/** @param {any} ctx */
export function createBoss(ctx) {
  const { mats } = ctx;
  const group = new THREE.Group(); group.name = 'nemesis'; group.visible = false;
  const hullG = M.buildNemesisHull();
  const hull = new THREE.Mesh(hullG.body, mats.body); hull.castShadow = hull.receiveShadow = true;
  const hullGlow = new THREE.Mesh(hullG.glow, mats.glow);
  group.add(hull, hullGlow);
  const turretGeo = M.buildBossTurret(), emitterGeo = M.buildEmitter(), ventGeo = M.buildVent();
  const turMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.3, emissive: 0xff2020, emissiveIntensity: 0 });

  const turrets = [[8, 5, 40], [-8, 5, 40], [20, 0.2, -26], [-20, 0.2, -26]].map((p, i) => {
    const mat = turMat.clone();
    const mesh = new THREE.Mesh(turretGeo, mat); mesh.position.set(p[0], p[1], p[2]); mesh.scale.setScalar(1.4); group.add(mesh);
    return { mesh, mat, local: new THREE.Vector3(p[0], p[1] + 3, p[2]), world: new THREE.Vector3(), hp: 1, max: 1, alive: true, state: 0, st: 0, cd: 1 + i * 0.7, tele: 0, burst: 0, flash: 0 };
  });
  const emMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0.2, emissive: 0x2ad8ff, emissiveIntensity: 0.2 });
  const emitters = [[[0, 26, -24], [0, 0, 0]], [[24, 0, 10], [0, 0, -Math.PI / 2]], [[-24, 0, 10], [0, 0, Math.PI / 2]]].map(([p, r]) => {
    const mat = emMat.clone();
    const mesh = new THREE.Mesh(emitterGeo, mat); mesh.position.set(p[0], p[1], p[2]); mesh.rotation.set(r[0], r[1], r[2]); mesh.scale.setScalar(1.3); group.add(mesh);
    const tip = new THREE.Vector3(0, 7, 0).applyEuler(mesh.rotation).multiplyScalar(1.3).add(mesh.position);
    return { mesh, mat, local: tip, world: new THREE.Vector3(), hp: 1, max: 1, alive: true, flash: 0 };
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(5.5, 1), coreMat); core.position.set(0, 7, -52); group.add(core);
  const vents = [1, -1].map(s => { const v = new THREE.Mesh(ventGeo, mats.body); v.position.set(s * 4.6, 8.6, -52); group.add(v); return v; });
  const reactor = { local: new THREE.Vector3(0, 7, -52), world: new THREE.Vector3(), hp: 1, max: 1, open: 0, cycle: 0, flash: 0 };
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x55c8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), shieldMat); shield.scale.set(24, 27, 84); shield.position.set(0, 4, -2); group.add(shield);
  const pulseMat = new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, wireframe: false });
  const pulse = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), pulseMat); pulse.visible = false; ctx.root.add(pulse);
  const hullSpheres = []; for (let z = -62; z <= 70; z += 12) hullSpheres.push({ local: new THREE.Vector3(0, 0, z), world: new THREE.Vector3(), r: z > 50 ? 9 : 14 });
  ctx.root.add(group);

  const B = {
    group, turrets, emitters, reactor, shield, hullSpheres,
    phase: 0, t: 0, theta: 0, introT: 0, speedK: 1,
    beam: { state: 0, t: 0, cd: 6, from: new THREE.Vector3(), to: new THREE.Vector3(), dir: new THREE.Vector3(), hit: false },
    pulse: { state: 0, t: 0, cd: 7, r: 0 },
    spawnCd: 12, emitterCycle: 0, emittersOpen: false, deathT: 0, center: new THREE.Vector3(0, 10, 0),
    pos: group.position, fwd: new THREE.Vector3(0, 0, 1), vel: new THREE.Vector3(),

    /** Reinicia y hace la entrada (warp). */
    start(center) {
      B.center.copy(center); B.phase = 0.5; B.t = 0; B.introT = 0; B.theta = 0; B.speedK = 1;
      const hp = ctx.diff.bossHp;
      for (const t of turrets) { t.alive = true; t.mesh.visible = true; t.hp = t.max = 150 * hp; t.state = 0; t.cd = 1 + Math.random() * 2; t.tele = 0; t.flash = 0; t.mat.emissiveIntensity = 0; }
      for (const e of emitters) { e.alive = true; e.mesh.visible = true; e.hp = e.max = 110 * hp; e.flash = 0; }
      reactor.hp = reactor.max = 560 * hp; reactor.open = 0; reactor.cycle = 0;
      B.beam.state = 0; B.beam.cd = 5; B.pulse.state = 0; B.pulse.cd = 6; B.spawnCd = 14; B.emitterCycle = 0;
      shieldMat.opacity = 0; pulse.visible = false; group.visible = true; core.visible = true; group.scale.set(1, 1, 1);
      B.place(0); B.updateWorld();
    },
    reset() { B.phase = 0; group.visible = false; pulse.visible = false; },
    pathPoint(th, out) { return out.set(B.center.x + Math.cos(th) * 150, B.center.y + Math.sin(th * 2) * 14, B.center.z + Math.sin(th) * 115); },
    place(th) {
      B.pathPoint(th, group.position); B.pathPoint(th + 0.05, _a);
      B.fwd.subVectors(_a, group.position).normalize();
      group.lookAt(_a);
    },
    updateWorld() {
      group.updateMatrixWorld(true);
      for (const t of turrets) t.world.copy(t.local).applyMatrix4(group.matrixWorld);
      for (const e of emitters) e.world.copy(e.local).applyMatrix4(group.matrixWorld);
      reactor.world.copy(reactor.local).applyMatrix4(group.matrixWorld);
      for (const h of hullSpheres) h.world.copy(h.local).applyMatrix4(group.matrixWorld);
    },
    /** @param {number} dt */
    update(dt) {
      if (B.phase === 0 || B.phase === 5) return;
      B.t += dt;
      const P = ctx.player, D = ctx.diff;
      if (B.phase === 0.5) {
        // entrada: llega estirado desde lejos (warp) y se asienta
        B.introT += dt;
        const k = Math.min(1, B.introT / 1.6), e = 1 - Math.pow(1 - k, 3);
        B.place(0);
        _a.copy(B.fwd).multiplyScalar(-500 * (1 - e)); group.position.add(_a);
        group.scale.set(1, 1, 1 + 6 * (1 - e));
        B.updateWorld();
        return;
      }
      if (B.phase === 4) {
        B.deathT += dt;
        if (Math.random() < dt * 14) { const h = hullSpheres[Math.floor(Math.random() * hullSpheres.length)]; _a.copy(h.world).add(_b.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10)); ctx.fx.parts.burst(_a, 18, 0xff8a3a, 30, 1); ctx.fx.flashes.spawn(_a, 30, 0xffa060, 0.6); ctx.sfx.boom(_a, 0.6); }
        group.rotation.z += dt * 0.15; group.position.y -= dt * 3;
        if (B.deathT > 3.2) { B.phase = 5; group.visible = false; ctx.fx.flashes.spawn(group.position, 260, 0xfff0d0, 1.4); ctx.fx.parts.burst(group.position, 160, 0xffb070, 90, 2.2); ctx.onBossDead(); }
        B.updateWorld();
        return;
      }
      // movimiento por la elipse
      B.theta += dt * 0.05 * B.speedK;
      B.place(B.theta);
      B.vel.copy(B.fwd).multiplyScalar(7 * B.speedK);
      B.updateWorld();
      _inv.copy(group.matrixWorld).invert();

      for (const t of turrets) t.flash = Math.max(0, t.flash - dt * 5);
      for (const e of emitters) e.flash = Math.max(0, e.flash - dt * 5);
      reactor.flash = Math.max(0, reactor.flash - dt * 5);

      if (B.phase === 1) {
        for (const t of turrets) {
          if (!t.alive) continue;
          // apuntar la torreta (giro sobre su eje local)
          _a.copy(P.pos).applyMatrix4(_inv); t.mesh.rotation.y = Math.atan2(_a.x - t.mesh.position.x, _a.z - t.mesh.position.z);
          const dist = t.world.distanceTo(P.pos);
          // sólo dispara si el jugador está del lado de la torreta (el casco tapa el resto)
          _b.subVectors(P.pos, t.world).normalize(); _a.set(0, 1, 0).applyQuaternion(group.quaternion);
          const side = t.local.y > 2 ? _b.dot(_a) > -0.25 : true;
          if (t.state === 0) { t.cd -= dt; if (t.cd <= 0 && dist < 280 && side && !ctx.W.grid.blocked(t.world, P.pos)) { t.state = 1; t.st = 1.0; } }
          else if (t.state === 1) { t.st -= dt; t.tele = 1 - t.st / 1.0; if (t.st <= 0) { t.state = 2; t.burst = 3; t.st = 0; } }
          else { t.st -= dt; if (t.st <= 0) { ctx.bossShot(t.world, 78); t.burst--; t.st = 0.18; if (t.burst <= 0) { t.state = 0; t.tele = 0; t.cd = (2.8 + Math.random() * 1.8) / D.fireRate; } } }
          t.mat.emissiveIntensity = t.tele * 2.2 + t.flash * 1.5;
        }
        B.spawnCd -= dt;
        if (B.spawnCd <= 0) { B.spawnCd = 20 / D.waves; ctx.bossLaunch('interceptor', 2); }
      }
      if (B.phase === 2) {
        shieldMat.opacity = Math.min(0.22, shieldMat.opacity + dt * 0.2);
        // ciclo de emisores: abiertos 6 s (vulnerables), cerrados 4,5 s; titilan 1 s antes de cerrarse
        B.emitterCycle += dt;
        const cyc = B.emitterCycle % 10.5;
        B.emittersOpen = cyc < 6;
        const warn = cyc > 5 && cyc < 6 ? (Math.sin(B.t * 30) > 0 ? 1 : 0.3) : 1;
        for (const e of emitters) {
          if (!e.alive) continue;
          e.mat.emissiveIntensity = (B.emittersOpen ? 2.2 * warn : 0.15) + e.flash * 2;
          e.mesh.scale.setScalar(B.emittersOpen ? 1.3 : 1.1);
        }
        // barrido: aviso 1,6 s, haz 1 s
        const bm = B.beam;
        if (bm.state === 0) { bm.cd -= dt; if (bm.cd <= 0) { bm.state = 1; bm.t = 0; bm.hit = false; bm.from.set(0, 20, -14).applyMatrix4(group.matrixWorld); bm.dir.subVectors(P.pos, bm.from).normalize(); ctx.sfx.charge(); } }
        else if (bm.state === 1) {
          bm.t += dt; bm.from.set(0, 20, -14).applyMatrix4(group.matrixWorld);
          _a.subVectors(P.pos, bm.from).normalize(); bm.dir.lerp(_a, Math.min(1, dt * 0.9)).normalize(); // sigue lento: se puede esquivar
          bm.to.copy(bm.from).addScaledVector(bm.dir, 420);
          if (bm.t >= 1.6) { bm.state = 2; bm.t = 0; ctx.sfx.beam(); }
        } else if (bm.state === 2) {
          bm.t += dt; bm.from.set(0, 20, -14).applyMatrix4(group.matrixWorld); bm.to.copy(bm.from).addScaledVector(bm.dir, 420);
          if (!bm.hit) {
            _a.subVectors(P.pos, bm.from); const along = _a.dot(bm.dir);
            if (along > 0 && along < 420) {
              _b.copy(bm.from).addScaledVector(bm.dir, along);
              const cover = ctx.W.grid.ray(bm.from, bm.dir, along);
              if (_b.distanceTo(P.pos) < 7.5 && cover > along) { bm.hit = true; ctx.damagePlayer(32 * D.enemyDmg, bm.from, 'beam'); }
            }
          }
          if (bm.t >= 1.0) { bm.state = 0; bm.cd = 8.5 / D.fireRate; }
        }
        B.spawnCd -= dt;
        if (B.spawnCd <= 0) { B.spawnCd = 18 / D.waves; ctx.bossLaunch('drone', 2); }
      }
      if (B.phase === 3) {
        shieldMat.opacity = Math.max(0, shieldMat.opacity - dt * 0.4);
        B.speedK = 1.5;
        reactor.cycle += dt;
        const cyc = reactor.cycle % 9;
        const target = cyc < 5 ? 1 : 0;
        reactor.open += (target - reactor.open) * Math.min(1, dt * 4);
        vents[0].position.x = 4.6 + reactor.open * 9; vents[1].position.x = -4.6 - reactor.open * 9;
        coreMat.color.setRGB(1 + reactor.flash * 2 + reactor.open, 0.35 + reactor.open * 0.3, 0.16);
        core.scale.setScalar(1 + Math.sin(B.t * 8) * 0.06 * reactor.open);
        // pulso del reactor: esfera de aviso que crece 2,2 s y luego estalla (cubrirse tras cristales o alejarse)
        const pl = B.pulse;
        if (pl.state === 0) { pl.cd -= dt; if (pl.cd <= 0) { pl.state = 1; pl.t = 0; ctx.sfx.charge(); } }
        else {
          pl.t += dt; const k = Math.min(1, pl.t / 2.2);
          pulse.visible = true; pulse.position.copy(reactor.world); pl.r = 8 + k * 112; pulse.scale.setScalar(pl.r);
          pulseMat.opacity = ctx.reduced ? 0.12 : 0.08 + 0.1 * (0.5 + 0.5 * Math.sin(pl.t * (8 + k * 20)));
          if (pl.t >= 2.2) {
            pl.state = 0; pl.cd = 11 / D.fireRate; pulse.visible = false;
            ctx.fx.flashes.spawn(reactor.world, 220, 0xff4050, 0.7); ctx.sfx.boom(reactor.world, 1);
            const d = P.pos.distanceTo(reactor.world);
            if (d < 120 && !ctx.W.grid.blocked(reactor.world, P.pos, 0.8)) ctx.damagePlayer(30 * D.enemyDmg, reactor.world, 'pulse');
            else if (d < 120) ctx.hint('cover');
          }
        }
        B.spawnCd -= dt;
        if (B.spawnCd <= 0) { B.spawnCd = 16 / D.waves; ctx.bossLaunch('interceptor', 2); }
      }
    },
    /**
     * Prueba de impacto de un proyectil del jugador. Devuelve 'hit' | 'block' | null.
     * @param {THREE.Vector3} p @param {number} dmg @param {boolean} [laser]
     */
    hit(p, dmg, laser = false) {
      if (B.phase < 1 || B.phase >= 4) return null;
      if (B.phase === 1) for (const t of turrets) if (t.alive && t.world.distanceToSquared(p) < 30) { t.hp -= dmg; t.flash = 1; if (t.hp <= 0) killTurret(t); return 'hit'; }
      if (B.phase === 2) for (const e of emitters) if (e.alive && e.world.distanceToSquared(p) < 36) {
        if (!B.emittersOpen) { ctx.hint('emitter'); return 'block'; }
        e.hp -= dmg; e.flash = 1; if (e.hp <= 0) killEmitter(e); return 'hit';
      }
      if (B.phase === 3 && reactor.world.distanceToSquared(p) < 64) {
        if (reactor.open < 0.6) { ctx.hint('reactor'); return 'block'; }
        reactor.hp -= dmg; reactor.flash = 1;
        if (reactor.hp <= 0) { reactor.hp = 0; B.phase = 4; B.deathT = 0; ctx.onBossPhase(4); }
        return 'hit';
      }
      if (B.phase === 2) { _a.copy(p).applyMatrix4(_inv.copy(group.matrixWorld).invert()); _a.sub(shield.position); if ((_a.x / 24) ** 2 + (_a.y / 27) ** 2 + (_a.z / 84) ** 2 < 1) return 'block'; }
      for (const h of hullSpheres) if (h.world.distanceToSquared(p) < h.r * h.r) return 'block';
      return null;
    },
    /** Totales de la fase actual (para la barra del HUD). */
    bar() {
      if (B.phase === 1) return { cur: turrets.reduce((s, t) => s + Math.max(0, t.alive ? t.hp : 0), 0), max: turrets.reduce((s, t) => s + t.max, 0) };
      if (B.phase === 2) return { cur: emitters.reduce((s, e) => s + Math.max(0, e.alive ? e.hp : 0), 0), max: emitters.reduce((s, e) => s + e.max, 0) };
      if (B.phase === 3) return { cur: Math.max(0, reactor.hp), max: reactor.max };
      return { cur: 0, max: 1 };
    },
    /** Puntos débiles visibles para marcadores. */
    weakPoints(out) {
      out.length = 0;
      if (B.phase === 1) for (const t of turrets) { if (t.alive) out.push(t.world); }
      if (B.phase === 2) for (const e of emitters) { if (e.alive) out.push(e.world); }
      if (B.phase === 3) out.push(reactor.world);
      return out;
    },
    /** Fuerza una fase (debug). @param {number} n */
    forcePhase(n) {
      if (n >= 2) for (const t of turrets) if (t.alive) { t.alive = false; t.mesh.visible = false; }
      if (n >= 3) for (const e of emitters) if (e.alive) { e.alive = false; e.mesh.visible = false; }
      B.phase = n; ctx.onBossPhase(n);
    },
    dispose() {
      ctx.root.remove(group, pulse);
      [hullG.body, hullG.glow, turretGeo, emitterGeo, ventGeo, core.geometry, shield.geometry, pulse.geometry].forEach(g => g.dispose());
      [turMat, emMat, coreMat, shieldMat, pulseMat, ...turrets.map(t => t.mat), ...emitters.map(e => e.mat)].forEach(m => m.dispose());
    },
  };
  function killTurret(t) {
    t.alive = false; t.mesh.visible = false;
    ctx.fx.parts.burst(t.world, 40, 0xff7a3a, 36, 1.2); ctx.fx.flashes.spawn(t.world, 40, 0xffa060, 0.7); ctx.sfx.boom(t.world, 0.8);
    ctx.addScore(400, t.world);
    if (turrets.every(x => !x.alive)) { B.phase = 2; B.emitterCycle = 0; B.beam.cd = 4; B.spawnCd = 10; ctx.onBossPhase(2); }
  }
  function killEmitter(e) {
    e.alive = false; e.mesh.visible = false;
    ctx.fx.parts.burst(e.world, 40, 0x7fe6ff, 36, 1.2); ctx.fx.flashes.spawn(e.world, 40, 0x9ff0ff, 0.7); ctx.sfx.boom(e.world, 0.8);
    ctx.addScore(500, e.world);
    if (emitters.every(x => !x.alive)) { B.phase = 3; reactor.cycle = 0; B.pulse.cd = 5; B.spawnCd = 10; B.beam.state = 0; ctx.fx.parts.burst(group.position, 120, 0x66d0ff, 70, 1.6); ctx.onBossPhase(3); }
  }
  return B;
}
