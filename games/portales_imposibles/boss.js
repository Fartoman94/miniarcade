// @ts-check
/* Portales Imposibles — el Núcleo Fractal: gran evento final en tres fases con portales móviles.
   Intro: el Núcleo se ensambla (cinemática salteable) y la compuerta se cierra.
   Fase 1 · ESCUDO PRISMÁTICO: tres pilares sostienen el escudo; cada uno necesita `nodeTime` s de láser. El láser
     entra por el panel fijo del fondo y sale por un panel móvil (oeste/este/norte) que se frena frente a cada pilar.
     Ataque con aviso: esquirlas que caen donde marca un anillo rojo.
   Fase 2 · SOBRECARGA (cambio de reglas): el Núcleo baja al pozo y abre la corona; el piso se electrifica por
     sectores (aviso naranja → descarga). Hay que dejar caer 3 cubos de carga por el portal del techo móvil cuando
     pasa sobre el Núcleo (la corona se ilumina cuando está alineado).
   Fase 3 · COLAPSO: se abre el portal de salida en la plataforma alta; el ácido fractal sube y cada pocos segundos
     un pulso (con aviso) borra tus portales. Cruzar el portal de salida = victoria. Morir reinicia sólo la fase. */
import { THREE } from '../../matelabs/kit3d.js';
import { fractalGeo, makePortalMesh } from './models.js';

export function createBoss(ctx, L, a, room, o) {
  const { M } = ctx;
  const C = { x: a.X(0), y: a.Y(6), z: a.Z(-14) };
  const g = new THREE.Group(); g.position.set(C.x, C.y, C.z); L.root.add(g);
  const inner = new THREE.Mesh(fractalGeo(0), M.core), outer = new THREE.Mesh(fractalGeo(1), M.core);
  g.add(inner, outer);
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(3.1, 1), M.shield); g.add(shield);
  const coreLight = new THREE.PointLight(0x9b7bff, 30, 18, 1.6); g.add(coreLight);
  // haz de la corona (alineación del techo)
  const crownBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 18, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9b7bff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  crownBeam.visible = false; L.root.add(crownBeam);
  // pilares del escudo
  const nodeDefs = [{ id: 'n1', x: -9, z: -14, face: 'x' }, { id: 'n2', x: 9, z: -14, face: 'x' }, { id: 'n3', x: 0, z: -24, face: 'z' }];
  const nodes = nodeDefs.map(n => {
    const col = a.solid(n.x - 0.4, 0, n.z - 0.4, n.x + 0.4, 1, n.z + 0.4, 'dark');
    const r = a.receptor(room, n.id, n.x - 0.7, 1, n.z - 0.7, n.x + 0.7, 3, n.z + 0.7, n.face);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), M.crystal); crystal.scale.set(1, 2, 1); crystal.position.set(a.X(n.x), 4.1, a.Z(n.z)); L.root.add(crystal);
    const tether = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), new THREE.MeshBasicMaterial({ color: 0xc8a6ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    L.root.add(tether);
    return { ...n, col, r, crystal, tether, broken: false };
  });
  // esquirlas (aviso + caída)
  const ringGeo = new THREE.RingGeometry(1.1, 1.35, 28); ringGeo.rotateX(-Math.PI / 2);
  const shardGeo = new THREE.ConeGeometry(0.35, 2.2, 5); shardGeo.rotateX(Math.PI);
  const shards = Array.from({ length: 4 }, () => {
    const ring = new THREE.Mesh(ringGeo, M.ring.clone()); ring.visible = false; L.root.add(ring);
    const sh = new THREE.Mesh(shardGeo, M.crystal); sh.visible = false; L.root.add(sh);
    return { ring, sh, t: 0, warn: 0, x: 0, y: 0, z: 0, on: false, fall: 0 };
  });
  // sectores electrificados (fase 2)
  const secDefs = [[-14, 0, -28, -14], [0, 14, -28, -14], [-14, 0, -14, 0], [0, 14, -14, 0]];
  const sectors = secDefs.map(([x0, x1, z0, z1]) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat); m.rotation.x = -Math.PI / 2;
    m.position.set(a.X((x0 + x1) / 2), 0.05, a.Z((z0 + z1) / 2)); m.visible = false; L.root.add(m);
    return { x0: a.X(x0), x1: a.X(x1), z0: a.Z(z0), z1: a.Z(z1), m, mat };
  });
  // ácido fractal (fase 3)
  const acid = L.acid(a.X(-14), -8.6, a.Z(-28), a.X(14), -3, a.Z(0));
  const ACID0 = -3;
  // portal de salida
  const exitP = makePortalMesh('A', 1.5, 2.3);
  exitP.uni.col.value = new THREE.Color(0xd9b8ff); /** @type {any} */ (exitP.ring.material).color.setHex(0xf0e0ff);
  exitP.mat.side = THREE.DoubleSide;
  exitP.group.position.set(a.X(-11.5), 9.2, a.Z(-24.3)); exitP.group.visible = false; L.root.add(exitP.group);
  // dispensador de cubos de carga
  const cubeB = a.cube(room, 'weight', 12, 6, -8, { id: 'cubeB', hidden: true });
  const disp = a.dispenser(room, cubeB, 12, 17.5, -8, 5);
  a.pedestal(room, 'pbd', 11.4, 0, -1.6, 'Pedir cubo de carga', {
    kind: 'once', enabled: () => B.phase === 2, deniedText: 'El dispensador sólo funciona en la fase de sobrecarga',
    onUse: () => { L.mem['disp:cubeB'] = true; L.dispense(disp); },
  });

  const B = {
    phase: 0, sub: '', locked: false, hits: 0, t: 0, shardT: 2, secT: 2, secIdx: -1, secState: 'idle', pulseT: 0, pulseWarn: 0,
    transT: 0, toPhase: 0, coreY: 6, acidY: ACID0, introDone: false, nodes, shards, sectors, aligned: false, hurtT: 0,
    /** Al entrar a la arena. */
    trigger() {
      if (ctx.S().bossDone) { if (B.phase === 0) B.setDone(); return; }
      if (B.phase !== 0 || ctx.state() !== 'play') return;
      B.locked = true; B.phase = -1; // intro
      ctx.bossIntro(B);
    },
    /** Paso de la cinemática (k de 0 a 1). */
    intro(k) {
      const s = 0.3 + 0.7 * Math.min(1, k * 1.3);
      inner.scale.setScalar(s); outer.scale.setScalar(s * (0.6 + 0.4 * k)); shield.scale.setScalar(Math.max(0.01, k));
      g.rotation.y += 0.04;
    },
    startPhase(n) {
      B.phase = n; B.sub = ''; B.t = 0; B.shardT = 2.5; B.secT = 2; B.secState = 'idle'; B.secIdx = -1; B.pulseT = ctx.diff().pulseEvery; B.pulseWarn = 0;
      inner.scale.setScalar(1); outer.scale.setScalar(1);
      for (const s of shards) { s.on = false; s.ring.visible = false; s.sh.visible = false; }
      for (const s of sectors) { s.m.visible = false; }
      o.mpc.active = n === 2;
      if (n === 1) { shield.visible = true; B.coreY = 6; for (const nd of nodes) { if (!nd.broken) nd.r.total = 0; } }
      if (n === 2) { shield.visible = false; B.coreY = 0.6; }
      if (n === 3) { shield.visible = false; B.coreY = 0.6; B.acidY = ACID0; exitP.group.visible = true; }
      ctx.onBossPhase(n);
    },
    setDone() {
      B.phase = 4; B.locked = false; shield.visible = false; g.visible = false; crownBeam.visible = false; exitP.group.visible = true; coreLight.intensity = 6;
      for (const nd of nodes) { nd.broken = true; nd.r.box.on = false; nd.crystal.visible = false; nd.tether.visible = false; }
      B.acidY = ACID0;
    },
    /** Muerte del sujeto durante la pelea: se reinicia la fase actual. */
    resetPhase() {
      if (B.phase >= 1 && B.phase <= 3) B.startPhase(B.phase);
      if (B.sub === 'trans') B.startPhase(B.toPhase);
      if (B.phase === 2 && cubeB.alive) L.cubeReset(cubeB, false);
    },
    breakNode(nd) {
      if (nd.broken) return;
      nd.broken = true; nd.r.box.on = false; nd.crystal.visible = false; nd.tether.visible = false;
      ctx.sfx.node(); ctx.fx.burst(nd.crystal.position.x, 3, nd.crystal.position.z, 0xc8a6ff, 40, 5); ctx.fx.shake(0.4);
      const left = nodes.filter(n => !n.broken).length;
      ctx.toast(left ? `¡Pilar destruido! Quedan ${left}` : '¡El escudo prismático se rompió!', 2000);
      ctx.emit('bossNode');
      if (!left) B.transition(2);
    },
    transition(to) {
      B.sub = 'trans'; B.toPhase = to; B.transT = 2.4;
      ctx.sfx.bossRoar(); ctx.fx.shake(0.6); ctx.fx.burst(C.x, B.coreY + C.y - 6, C.z, 0xffffff, 60, 7);
      for (const s of shards) { s.on = false; s.ring.visible = false; s.sh.visible = false; }
    },
    hitCore() {
      B.hits++;
      ctx.sfx.node(); ctx.fx.burst(C.x, 1.5, C.z, 0xffb3e6, 50, 6); ctx.fx.ring(C.x, 0.5, C.z, 0xff7ae0, 6, 0.6); ctx.fx.shake(0.45);
      ctx.toast(B.hits < 3 ? `¡Sobrecarga ${B.hits}/3!` : '¡El Núcleo colapsa! Corré al portal de salida', 2200);
      ctx.emit('bossHit');
      if (B.hits >= 3) B.transition(3);
    },
    update(dt, P) {
      B.t += dt;
      // visual del núcleo
      inner.rotation.y += dt * 0.7; inner.rotation.x += dt * 0.3; outer.rotation.y -= dt * 0.35; outer.rotation.z += dt * 0.2;
      shield.rotation.y += dt * 0.2;
      const cy = C.y - 6 + B.coreY + Math.sin(B.t * 1.4) * 0.15;
      g.position.y += (cy - g.position.y) * Math.min(1, dt * 2);
      for (const nd of nodes) {
        if (nd.broken) continue;
        const p = nd.crystal.position, k = Math.min(1, nd.r.total / ctx.diff().nodeTime);
        nd.crystal.rotation.y += dt * (1 + k * 6); nd.crystal.scale.set(1 + k * 0.3, 2 - k * 0.6, 1 + k * 0.3);
        nd.tether.position.set((p.x + g.position.x) / 2, (p.y + g.position.y) / 2, (p.z + g.position.z) / 2);
        const dx = g.position.x - p.x, dy = g.position.y - p.y, dz = g.position.z - p.z, len = Math.hypot(dx, dy, dz);
        nd.tether.scale.set(1, len, 1); nd.tether.quaternion.setFromUnitVectors(_Y, _v.set(dx / len, dy / len, dz / len));
        nd.tether.visible = B.phase === 1 || B.phase === 0 || B.phase === -1;
      }
      acid.top = B.acidY; acid.mesh.position.y = B.acidY;
      acid.mesh.visible = B.phase === 3 && B.sub !== 'trans';
      exitP.uni.time.value = B.t; exitP.uni.open.value = 1;
      if (B.phase === 4) { exitPortalCheck(P); return; }
      if (B.phase <= 0) return;
      if (B.sub === 'trans') {
        B.transT -= dt;
        if (B.toPhase === 2) { shield.scale.setScalar(Math.max(0.01, B.transT / 2.4)); }
        if (B.transT <= 0) B.startPhase(B.toPhase);
        return;
      }
      const d = ctx.diff();
      // ---- esquirlas con aviso (fases 1 y 2) ----
      if (B.phase === 1 || B.phase === 2) {
        B.shardT -= dt;
        if (B.shardT <= 0 && P.alive) {
          B.shardT = d.shardEvery * (B.phase === 2 ? 1.35 : 1);
          const s = shards.find(x => !x.on);
          if (s) {
            const pb = P.body.pos;
            s.on = true; s.warn = d.shardWarn; s.fall = 0; s.x = pb.x + P.body.vel.x * 0.25; s.z = pb.z + P.body.vel.z * 0.25; s.y = Math.max(0, pb.y - P.body.hy) + 0.04;
            s.ring.position.set(s.x, s.y, s.z); s.ring.visible = true; s.ring.scale.setScalar(1.4);
            ctx.sfx.warn();
          }
        }
        for (const s of shards) {
          if (!s.on) continue;
          if (s.warn > 0) {
            s.warn -= dt; const k = 1 - s.warn / d.shardWarn;
            s.ring.scale.setScalar(1.4 - k * 0.4); /** @type {any} */ (s.ring.material).opacity = 0.35 + 0.5 * Math.abs(Math.sin(k * 12));
            if (s.warn <= 0) { s.sh.visible = true; s.fall = 0.22; }
            continue;
          }
          s.fall -= dt;
          s.sh.position.set(s.x, s.y + 1.1 + Math.max(0, s.fall) * 40, s.z);
          if (s.fall <= 0) {
            s.on = false; s.ring.visible = false; s.sh.visible = false;
            ctx.sfx.shard(); ctx.fx.burst(s.x, s.y + 0.3, s.z, 0xc8a6ff, 16, 3.5); ctx.fx.shake(0.15);
            const pb = P.body.pos;
            if (P.alive && Math.hypot(pb.x - s.x, pb.z - s.z) < 1.3 && Math.abs(pb.y - P.body.hy - s.y) < 1.2) ctx.hurt(1, s.x, s.z, 'shard');
          }
        }
      }
      // ---- fase 1: pilares ----
      if (B.phase === 1) {
        for (const nd of nodes) if (!nd.broken && nd.r.total >= d.nodeTime) B.breakNode(nd);
      }
      // ---- fase 2: sectores electrificados y cubos al núcleo ----
      if (B.phase === 2) {
        B.secT -= dt;
        if (B.secT <= 0) {
          if (B.secState === 'idle' || B.secState === 'active') {
            if (B.secIdx >= 0) sectors[B.secIdx].m.visible = false;
            // la mitad de las veces, el sector donde estás
            const pb = P.body.pos;
            const mine = sectors.findIndex(s => pb.x > s.x0 && pb.x < s.x1 && pb.z > s.z0 && pb.z < s.z1);
            B.secIdx = mine >= 0 && Math.random() < 0.5 ? mine : Math.floor(Math.random() * 4);
            B.secState = 'warn'; B.secT = 1.6; const s = sectors[B.secIdx]; s.m.visible = true; s.mat.color.setHex(0xff9a2e); ctx.sfx.warn();
          } else if (B.secState === 'warn') { B.secState = 'active'; B.secT = 2.6; sectors[B.secIdx].mat.color.setHex(0x9fe6ff); }
          else { B.secState = 'idle'; B.secT = 1.8; }
          if (B.secState === 'idle' && B.secIdx >= 0) sectors[B.secIdx].m.visible = false;
        }
        if (B.secIdx >= 0) {
          const s = sectors[B.secIdx];
          s.mat.opacity = B.secState === 'warn' ? 0.25 + 0.25 * Math.abs(Math.sin(B.t * 10)) : B.secState === 'active' ? 0.45 + 0.2 * Math.random() : 0;
          if (B.secState === 'active') {
            const pb = P.body.pos;
            B.hurtT -= dt;
            if (P.alive && pb.x > s.x0 && pb.x < s.x1 && pb.z > s.z0 && pb.z < s.z1 && pb.y - P.body.hy < 0.35 && B.hurtT <= 0) { B.hurtT = 0.6; ctx.hurt(1, pb.x, pb.z, 'shock'); }
            if (Math.random() < 0.3) ctx.fx.burst(s.x0 + Math.random() * (s.x1 - s.x0), 0.1, s.z0 + Math.random() * (s.z1 - s.z0), 0x9fe6ff, 2, 2, 4, 0.3);
          }
        }
        // alineación del techo móvil con el núcleo
        const mb = o.mpc.box, mx = (mb.x0 + mb.x1) / 2, mz = (mb.z0 + mb.z1) / 2;
        B.aligned = Math.hypot(mx - C.x, mz - C.z) < 2.6;
        crownBeam.visible = true; crownBeam.position.set(C.x, 9, C.z);
        /** @type {any} */ (crownBeam.material).opacity = B.aligned ? 0.4 + 0.2 * Math.sin(B.t * 20) : 0.08;
        if (B.aligned && Math.floor(B.t * 3) !== Math.floor((B.t - dt) * 3)) ctx.sfx.charge(0.8);
        // cubos que caen en la corona
        for (const c of L.cubes) {
          if (!c.alive || c.held || c.dissolveT > 0) continue;
          const p = c.body.pos;
          if (Math.hypot(p.x - C.x, p.z - C.z) < 3.0 && p.y < 4 && p.y > -4) { L.cubeDissolve(c, 'core'); B.hitCore(); }
        }
      } else crownBeam.visible = false;
      // ---- fase 3: colapso ----
      if (B.phase === 3) {
        B.acidY = Math.min(6.5, B.acidY + d.acidRise * dt);
        B.pulseT -= dt;
        if (B.pulseT <= 1.2 && B.pulseWarn === 0) { B.pulseWarn = 1; ctx.sfx.warn(); }
        if (B.pulseWarn) { ctx.sfx.charge(1 - Math.max(0, B.pulseT) / 1.2); /** @type {any} */ (M.core).emissiveIntensity = 0.9 + 3 * (1 - Math.max(0, B.pulseT) / 1.2); }
        if (B.pulseT <= 0) {
          B.pulseT = d.pulseEvery; B.pulseWarn = 0; /** @type {any} */ (M.core).emissiveIntensity = 0.9;
          ctx.fx.ring(C.x, 1, C.z, 0xffffff, 26, 0.8); ctx.sfx.spherePulse();
          ctx.clearPortals('pulse');
        }
        exitPortalCheck(P);
      }
    },
    ui() {
      if (B.phase <= 0 || B.phase === 4) return null;
      const ph = B.sub === 'trans' ? B.toPhase : B.phase;
      if (ph === 1) return { name: 'NÚCLEO FRACTAL', label: 'Fase 1 · Escudo prismático: quemá los pilares con láser', p: nodes.filter(n => n.broken).length / 3 + nodes.filter(n => !n.broken).reduce((s, n) => s + Math.min(1, n.r.total / ctx.diff().nodeTime), 0) / 3 * 0.33 };
      if (ph === 2) return { name: 'NÚCLEO FRACTAL', label: `Fase 2 · Sobrecarga: cubos al Núcleo desde el techo (${B.hits}/3)`, p: B.hits / 3 };
      return { name: 'COLAPSO', label: 'Fase 3 · ¡Escapá por el portal de salida antes de que suba el ácido!', p: Math.max(0, Math.min(1, (B.acidY - ACID0) / (0 - ACID0))) };
    },
  };
  const _Y = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
  function exitPortalCheck(P) {
    const pb = P.body.pos, ep = exitP.group.position;
    if (P.alive && Math.abs(pb.x - ep.x) < 0.9 && Math.abs(pb.z - ep.z) < 0.6 && pb.y > ep.y - 1.6 && pb.y < ep.y + 1.2) ctx.escape();
  }
  B.exitPos = () => exitP.group.position;
  B.core = g; B.cubeB = cubeB;
  if (ctx.S().bossDone) B.setDone();
  return B;
}
