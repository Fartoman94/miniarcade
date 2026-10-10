// @ts-check
/* Mareas Profundas — Leviatán Abisal: evento final en tres fases (sin disparos).
   F1 «Embestidas»: el Leviatán marca un carril rojo y embiste; mientras tanto cerrás 3 válvulas de refrigeración.
   F2 «Caza a ciegas» (cambio de reglas): se apaga todo; el Leviatán caza por sonido y luz. El sonar revela las barras
       de control escondidas, pero atrae su mordida al punto del pulso: hacé ping, alejate, recogé e insertá las barras.
   F3 «Apagado del reactor»: quedate junto a la consola mientras la secuencia avanza y esquivá las ondas de cola
       cambiando de profundidad (banda baja / banda alta).
   Recompensa: el Leviatán se calma y se va, el faro se enciende y se abre la corriente ascendente. */
import * as THREE from 'three';
import { leviathanGeos, rodGeo, coreGeo } from './models.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _o = new THREE.Object3D(), _q = new THREE.Quaternion();
const N = 26, TR = 600, SP = 1.55;

/** @param {any} L nivel de la fosa @param {any} ctx */
export function createBoss(L, ctx) {
  const G = leviathanGeos();
  const root = new THREE.Group(); root.name = 'leviatan'; L.root.add(root);
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x14303e });
  const spotMat = new THREE.MeshBasicMaterial({ color: 0x4ff7e6, fog: false });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x4ff7e6, fog: false });
  const head = new THREE.Group(); root.add(head);
  head.add(new THREE.Mesh(G.head, bodyMat));
  head.add(new THREE.Mesh(G.eyes, eyeMat));
  const glowL = new THREE.PointLight(0x4ff7e6, 0, 34, 1.4); L.root.add(glowL);
  const segs = new THREE.InstancedMesh(G.seg, bodyMat, N); segs.frustumCulled = false; root.add(segs);
  const spots = new THREE.InstancedMesh(G.spot, spotMat, N); spots.frustumCulled = false; root.add(spots);
  const tail = new THREE.Mesh(G.tail, bodyMat); root.add(tail);
  // telegrafías
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const lane = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), laneMat); lane.visible = false; lane.renderOrder = 9; root.add(lane);
  const colMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 26, 18, 1, true), colMat); column.visible = false; column.renderOrder = 9; root.add(column);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 4.8, 40, 1, true), bandMat); band.visible = false; band.renderOrder = 9; root.add(band);
  const waveMat = new THREE.MeshBasicMaterial({ color: 0xffb0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const wave = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4.8, 40, 1, true), waveMat); wave.visible = false; wave.renderOrder = 9; root.add(wave);
  // núcleo del reactor y barras de control
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a });
  const core = new THREE.Mesh(coreGeo(), coreMat); core.position.set(0, -103, 0); root.add(core);
  const rodG = rodGeo();
  const rodMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
  const valveGlow = L.pillars.map(p => { const m = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 4, 14), new THREE.MeshBasicMaterial({ color: 0xff4040 })); m.position.set(p.x, -94.6, p.z); m.rotation.x = Math.PI / 2; root.add(m); return m; });

  const trail = new Float32Array(TR * 3);
  let tHead = 0, tCount = 0;
  const hv = new THREE.Vector3(); // velocidad de la cabeza
  const hp = head.position; hp.set(0, -170, -10);
  const lastPush = new THREE.Vector3().copy(hp);
  function resetTrail() { for (let i = 0; i < TR; i++) { trail[i * 3] = hp.x; trail[i * 3 + 1] = hp.y - i * 0.3; trail[i * 3 + 2] = hp.z; } tHead = 0; tCount = TR; lastPush.copy(hp); }
  resetTrail();

  const C = L.console;
  /** @type {any} */
  const B = {
    active: false, phase: 0, sub: 'idle', t: 0, mode: 'orbit', modeT: 0, ang: 0, introT: 0,
    valves: L.pillars.map((p, i) => ({ i, x: p.x, z: p.z, k: 0, on: false, done: false })),
    rods: /** @type {any[]} */ ([]), carried: -1, inserted: 0, rodsNeeded: 3,
    shutdown: false, coreK: 0, bandY: 0, waveR: 0, waveOn: false, hits: 0, lunges: 0, strikes: 0, waves: 0, dark: 0,
    target: new THREE.Vector3(), from: new THREE.Vector3(), dir: new THREE.Vector3(), dashLen: 0, dashed: 0, hitThis: false,
    ent: { kind: 'leviathan', species: 'leviatan', pos: hp, mh: 3, size: 6, state: 'idle', get scannable() { return B.active && B.phase > 0; } },
    get headPos() { return hp; },
    /** Etiqueta y fracción para la barra del HUD. */
    ui() {
      if (B.phase === 1) return { label: `Fase 1 · Embestidas — válvulas ${B.valves.filter(v => v.done).length}/3`, frac: B.valves.reduce((a, v) => a + (v.done ? 1 : v.k), 0) / 3 };
      if (B.phase === 2) return { label: `Fase 2 · Caza a ciegas — barras ${B.inserted}/${B.rodsNeeded}${B.carried >= 0 ? ' (llevás una)' : ''}`, frac: B.inserted / B.rodsNeeded };
      if (B.phase === 3) return { label: B.shutdown ? `Fase 3 · Apagado del reactor — ${Math.floor(B.coreK * 100)}%` : 'Fase 3 · Iniciá el apagado en la consola', frac: B.coreK };
      return { label: 'El Leviatán despierta…', frac: 0 };
    },
    /** Cinemática de entrada: el Leviatán sube de la oscuridad y rodea el faro. */
    intro(dt) {
      B.introT += dt;
      const k = Math.min(1, B.introT / 4.2), a = -2.2 + k * 3.2;
      _v.set(Math.cos(a) * (24 + (1 - k) * 30), -62 - k * 24, Math.sin(a) * (24 + (1 - k) * 30));
      steerTo(_v, 26, dt, 4);
      eyeMat.color.setHex(k > 0.6 ? 0xff3a3a : 0x4ff7e6);
      if (Math.random() < dt * 30) ctx.fx.bubbles(hp.x, hp.y, hp.z, 2, 3, 0.25);
      animateBody(dt);
    },
    start() {
      B.active = true; B.phase = 0; B.sub = 'intro'; B.introT = 0; root.visible = true;
      hp.set(Math.cos(-2.2) * 56, -60, Math.sin(-2.2) * 56); hv.set(0, 0, 10); resetTrail();
      B.rodsNeeded = ctx.diff().rods;
    },
    /** @param {number} n */
    startPhase(n) {
      B.phase = n; B.sub = 'fight'; B.t = 0; B.mode = 'orbit'; B.modeT = n === 1 ? 2.5 : 2; B.hitThis = false;
      lane.visible = column.visible = band.visible = wave.visible = false; B.waveOn = false;
      ctx.S().bossPhase = n; ctx.persist();
      if (n === 1) { for (const v of B.valves) { v.on = false; v.k = 0; v.done = false; } ctx.setDark(0); }
      if (n === 2) {
        B.inserted = 0; B.carried = -1; ctx.setDark(1); ctx.flickerBeacon();
        for (const r of B.rods) { root.remove(r.m); }
        B.rods = [];
        const angs = [0.7, 2.6, 4.4, 5.6].slice(0, B.rodsNeeded);
        for (let i = 0; i < angs.length; i++) {
          const a = angs[i], m = new THREE.Mesh(rodG, rodMat); m.position.set(Math.cos(a) * 20, -99.3, Math.sin(a) * 20); m.rotation.z = Math.PI / 2; m.rotation.y = a; root.add(m);
          B.rods.push({ i, m, x: m.position.x, y: m.position.y, z: m.position.z, state: 'hidden', rev: 0 });
        }
      }
      if (n === 3) { B.shutdown = false; B.coreK = 0; ctx.setDark(0.45); B.modeT = 2.4; }
      ctx.onBossPhase(n);
    },
    /** @param {number} dt */
    update(dt, P) {
      if (!B.active) { root.visible = false; glowL.intensity = 0; return; }
      root.visible = true; glowL.intensity = B.phase === 2 ? 6 : 26; glowL.color.copy(eyeMat.color); glowL.position.copy(hp); glowL.position.y += 3;
      const D = ctx.diff();
      B.t += dt; B.modeT -= dt;
      if (B.sub === 'intro') return;
      if (B.sub === 'outro') {
        B.t2 = (B.t2 || 0) + dt;
        _v.set(Math.sin(B.t2 * 0.6) * 20, -40 + B.t2 * 14, -60); steerTo(_v, 22, dt, 2);
        eyeMat.color.lerp(_w.set(0.3, 1, 0.9), dt);
        animateBody(dt);
        if (B.t2 > 4.5) { B.active = false; B.sub = 'gone'; root.visible = false; ctx.onBossDone(); }
        return;
      }
      const pp = P.pos;
      // ---------- F1: embestidas + válvulas ----------
      if (B.sub !== 'fight') { /* transición */ }
      else if (B.phase === 1) {
        for (const v of B.valves) {
          valveGlow[v.i].material.color.setHex(v.done ? 0x4fff7a : v.on ? (Math.sin(B.t * 12) > 0 ? 0xffe066 : 0xff8040) : 0xff4040);
          if (!v.done && Math.random() < dt * 8) ctx.fx.bubbles(v.x, -94.2, v.z, 1, 0.6, 0.18);
          if (v.on && !v.done) {
            const d = Math.hypot(pp.x - v.x, pp.y + 94.6, pp.z - v.z);
            if (d < 5.5) { v.k = Math.min(1, v.k + dt / D.valveT); if (Math.random() < dt * 6) ctx.sfx.valve(); }
            if (v.k >= 1) { v.done = true; v.on = false; ctx.onValve(B.valves.filter(x => x.done).length); }
          }
        }
        lungeAI(dt, P, D, false);
        if (B.valves.every(v => v.done)) { B.sub = 'trans'; B.t = 0; lane.visible = false; ctx.onPhaseClear(1); }
      }
      // ---------- F2: caza a ciegas ----------
      else if (B.phase === 2) {
        for (const r of B.rods) {
          if (r.state === 'hidden' || r.state === 'revealed') {
            r.rev -= dt; r.state = r.rev > 0 ? 'revealed' : 'hidden';
            rodMat.emissive.setHex(0x000000);
            r.m.scale.setScalar(r.state === 'revealed' ? 1.25 + Math.sin(B.t * 8) * 0.1 : 1);
            r.m.visible = true;
          } else if (r.state === 'carried') { P.hook.getWorldPosition(r.m.position); r.m.rotation.set(0, P.yaw, Math.PI / 2); }
          else if (r.state === 'inserted') { r.m.position.set(C.x - 1.2 + r.slot * 1.2, -96.6, C.z - 0.6); r.m.rotation.set(0, 0, 0); }
        }
        rodMat.emissive.setHex(B.rods.some(r => r.state === 'revealed') ? 0x1a8a80 : 0x000000);
        huntAI(dt, P, D);
        if (B.inserted >= B.rodsNeeded) { B.sub = 'trans'; B.t = 0; column.visible = false; ctx.onPhaseClear(2); }
      }
      // ---------- F3: apagado del reactor ----------
      else if (B.phase === 3) {
        core.position.y += (-95.5 - core.position.y) * Math.min(1, dt * 1.5);
        core.rotation.y += dt * (1 + B.coreK * 4);
        coreMat.color.setRGB(1, 0.48 + B.coreK * 0.5, 0.23 + B.coreK * 0.7);
        if (B.shutdown) {
          const near = Math.hypot(pp.x - C.x, pp.z - C.z) < 7.5 && pp.y < -83;
          if (near && P.alive) B.coreK = Math.min(1, B.coreK + dt / D.coreT);
          B.near = near;
          if (B.coreK >= 1) { B.sub = 'trans'; B.t = 0; band.visible = wave.visible = false; ctx.onPhaseClear(3); }
        }
        // el Leviatán se enrosca alrededor y azota con la cola
        _v.set(Math.cos(B.t * 0.35) * 33, -80 + Math.sin(B.t * 0.7) * 3, Math.sin(B.t * 0.35) * 33);
        steerTo(_v, 11, dt, 2.2);
        waveAI(dt, P, D);
      }
      if (B.sub === 'trans') {
        // pausa entre fases: el Leviatán ruge y se aleja
        _v.set(Math.cos(B.t) * 34, -78, Math.sin(B.t) * 34); steerTo(_v, 14, dt, 2);
        lane.visible = column.visible = false;
        if (B.t > 3.2) {
          if (B.phase < 3) B.startPhase(B.phase + 1);
          else { B.sub = 'outro'; B.t2 = 0; ctx.onReactorOff(); }
        }
      }
      eyeMat.color.setHex(B.phase === 2 ? (B.mode === 'tell' ? 0xff3030 : 0x2a6a70) : (B.mode === 'tell' || B.mode === 'dash') ? 0xff3030 : 0xffa040);
      animateBody(dt);
    },
    /** Usar una válvula (F1). */
    useValve(i) { const v = B.valves[i]; if (!v || v.done) return; v.on = true; ctx.sfx.valve(); },
    /** Pulso de sonar: revela barras y atrae al Leviatán (F2). */
    sonar(x, y, z) {
      if (!B.active) return false;
      if (B.phase === 2) {
        for (const r of B.rods) if ((r.state === 'hidden' || r.state === 'revealed') && Math.hypot(r.x - x, r.z - z) < 45) { r.rev = 7; r.state = 'revealed'; ctx.fx.mark(r.m.position, 0x4ff7e6, 7); }
        if (B.mode === 'orbit' || B.mode === 'recover') { B.target.set(x, y, z); B.mode = 'tell'; B.modeT = 1.6 * ctx.diff().tel; B.lure = 'sonar'; ctx.sfx.roar(); }
        return true;
      }
      return false;
    },
    grabRod(i) { const r = B.rods[i]; if (!r || r.state !== 'revealed' || B.carried >= 0) return; r.state = 'carried'; B.carried = i; ctx.sfx.grab(); ctx.onRod('grab'); },
    insertRod() { if (B.carried < 0) return; const r = B.rods[B.carried]; r.state = 'inserted'; r.slot = B.inserted; B.inserted++; B.carried = -1; ctx.sfx.insert(); ctx.onRod('insert', B.inserted, B.rodsNeeded); },
    dropRod() { if (B.carried < 0) return; const r = B.rods[B.carried]; r.state = 'hidden'; r.rev = 0; r.m.position.set(r.x, r.y, r.z); r.m.rotation.set(0, 0, Math.PI / 2); B.carried = -1; },
    beginShutdown() { if (B.phase === 3 && !B.shutdown) { B.shutdown = true; ctx.sfx.insert(); } },
    hide() { B.active = false; root.visible = false; lane.visible = column.visible = band.visible = wave.visible = false; ctx.setDark(0); },
    /** Interactuables propios de la pelea. */
    inters: /** @type {any[]} */ ([]),
  };

  // interactuables del evento (se agregan al nivel; sólo se ofrecen en la fase que corresponde)
  B.valves.forEach((v, i) => B.inters.push({ id: 'valve:' + i, kind: 'valve', x: v.x, y: -94, z: v.z, r: 5, can: () => B.active && B.phase === 1 && B.sub === 'fight' && !v.done && !v.on, label: () => 'Cerrar válvula de refrigeración', use: () => B.useValve(i) }));
  for (let i = 0; i < 4; i++) B.inters.push({ id: 'rod:' + i, kind: 'rod', get x() { return B.rods[i] ? B.rods[i].x : 999; }, get y() { return B.rods[i] ? B.rods[i].y + 1 : 999; }, get z() { return B.rods[i] ? B.rods[i].z : 999; }, r: 4.5,
    can: () => B.active && B.phase === 2 && !!B.rods[i] && B.rods[i].state === 'revealed', blocked: () => (B.carried >= 0 ? 'Ya llevás una barra: insertala en la consola' : null), label: () => 'Recoger barra de control', use: () => B.grabRod(i) });
  B.inters.push({ id: 'console:insert', kind: 'console', x: C.x, y: C.y, z: C.z, r: 5.5, can: () => B.active && B.phase === 2 && B.carried >= 0, label: () => 'Insertar barra de control', use: () => B.insertRod() });
  B.inters.push({ id: 'console:shutdown', kind: 'console', x: C.x, y: C.y, z: C.z, r: 6, can: () => B.active && B.phase === 3 && B.sub === 'fight' && !B.shutdown, label: () => 'Iniciar el apagado del reactor', use: () => B.beginShutdown() });

  /* ---------- movimiento ---------- */
  function steerTo(t, speed, dt, turn) {
    _v.subVectors(t, hp); const l = _v.length();
    if (l > 0.01) _v.multiplyScalar(speed / l * Math.min(1, l / 4));
    hv.lerp(_v, Math.min(1, dt * turn));
    hp.addScaledVector(hv, dt);
  }
  function animateBody(dt) {
    // rastro: se agrega un punto cada SP/3 m recorridos
    if (hp.distanceToSquared(lastPush) > (SP / 3) * (SP / 3)) {
      tHead = (tHead + 1) % TR; trail[tHead * 3] = hp.x; trail[tHead * 3 + 1] = hp.y; trail[tHead * 3 + 2] = hp.z; lastPush.copy(hp);
    }
    if (hv.lengthSq() > 0.01) { _w.copy(hp).add(hv); head.lookAt(_w); }
    const wig = B.t * 3;
    for (let i = 0; i < N; i++) {
      const idx = ((tHead - (i + 1) * 3 - 1) % TR + TR) % TR, nx = ((idx + 2) % TR);
      _o.position.set(trail[idx * 3], trail[idx * 3 + 1], trail[idx * 3 + 2]);
      _w.set(trail[nx * 3], trail[nx * 3 + 1], trail[nx * 3 + 2]);
      if (_w.distanceToSquared(_o.position) > 1e-4) _o.lookAt(_w);
      const s = 1.35 - i * 0.038; _o.scale.set(s * 1.6, s * 1.6, s * 1.25 + Math.sin(wig - i * 0.5) * 0.04);
      _o.updateMatrix(); segs.setMatrixAt(i, _o.matrix); spots.setMatrixAt(i, _o.matrix);
      if (i === N - 1) { tail.position.copy(_o.position); tail.quaternion.copy(_o.quaternion); tail.scale.setScalar(s * 1.6); }
    }
    segs.instanceMatrix.needsUpdate = spots.instanceMatrix.needsUpdate = true;
    spotMat.color.setHex(B.phase === 2 ? 0x0a3a40 : B.phase === 3 ? 0xff9a6a : 0x4ff7e6);
    void _q;
  }
  /** Embestida con carril telegrafiado (F1 y respuesta a luz/sonar en F2). */
  function lungeAI(dt, P, D, fromHunt) {
    const pp = P.pos;
    if (B.mode === 'orbit' || B.mode === 'recover') {
      B.ang += dt * 0.3 * D.spd;
      _v.set(Math.cos(B.ang) * 32, -84 + Math.sin(B.ang * 2) * 5, Math.sin(B.ang) * 32);
      steerTo(_v, 12 * D.spd, dt, 2);
      if (B.modeT <= 0 && !fromHunt && P.alive) {
        B.mode = 'tell'; B.modeT = 1.25 * D.tel; B.target.copy(pp); ctx.sfx.roar();
      }
    } else if (B.mode === 'tell') {
      // la cabeza apunta, el carril se ilumina
      hv.multiplyScalar(Math.exp(-3 * dt));
      hp.addScaledVector(hv, dt);
      B.from.copy(hp); B.dir.subVectors(B.target, hp); const len = B.dir.length(); B.dir.normalize(); B.dashLen = len + 14;
      _w.copy(hp).addScaledVector(B.dir, B.dashLen / 2);
      lane.visible = true; lane.position.copy(_w); lane.lookAt(_v.copy(_w).add(B.dir)); lane.scale.set(5.5, 5.5, B.dashLen);
      laneMat.opacity = 0.06 + (1 - B.modeT / (1.25 * D.tel)) * 0.16 + Math.sin(B.t * 25) * 0.04;
      head.lookAt(B.target);
      if (B.modeT <= 0) { B.mode = 'dash'; B.dashed = 0; B.hitThis = false; B.lunges++; ctx.sfx.dash(); }
    } else if (B.mode === 'dash') {
      const step = 34 * D.spd * dt; B.dashed += step; hp.addScaledVector(B.dir, step); hv.copy(B.dir).multiplyScalar(34);
      laneMat.opacity = 0.22;
      if (!B.hitThis && P.vulnerable && pp.distanceTo(hp) < 3.6) { B.hitThis = true; B.hits++; ctx.hurt(22, hp.x, hp.y, hp.z, 'leviatan', { energy: 4, knock: 14 }); ctx.onBossHit(); }
      if (Math.random() < dt * 30) ctx.fx.bubbles(hp.x, hp.y, hp.z, 3, 3, 0.25);
      if (B.dashed >= B.dashLen) { B.mode = 'recover'; B.modeT = D.lungeEvery; lane.visible = false; }
    }
  }
  /** F2: caza por sonido (pulsos) y luz (faro del submarino). */
  function huntAI(dt, P, D) {
    const pp = P.pos;
    if (B.mode === 'orbit' || B.mode === 'recover') {
      B.ang += dt * 0.22;
      _v.set(Math.cos(B.ang) * 34, -74, Math.sin(B.ang) * 34); steerTo(_v, 10, dt, 1.6);
      // con la luz encendida te encuentra solo
      if (P.light && P.alive && B.modeT <= 0) { B.target.copy(pp); B.mode = 'tell'; B.modeT = 1.6 * D.tel; B.lure = 'light'; ctx.sfx.roar(); ctx.onLightLure(); }
      column.visible = false;
    } else if (B.mode === 'tell') {
      column.visible = true; column.position.set(B.target.x, B.target.y, B.target.z); colMat.opacity = 0.1 + (1 - B.modeT / (1.6 * D.tel)) * 0.22 + Math.sin(B.t * 22) * 0.04;
      if (Math.random() < dt * 25) ctx.fx.bubbles(B.target.x + (Math.random() - 0.5) * 6, B.target.y - 8, B.target.z + (Math.random() - 0.5) * 6, 2, 1, 0.22);
      // se acomoda para morder desde abajo
      _v.set(B.target.x, B.target.y - 18, B.target.z); steerTo(_v, 26, dt, 3);
      if (B.modeT <= 0) { B.mode = 'dash'; B.from.copy(hp); B.dir.subVectors(B.target, hp).normalize(); B.dashLen = hp.distanceTo(B.target) + 10; B.dashed = 0; B.hitThis = false; B.strikes++; ctx.sfx.dash(); }
    } else if (B.mode === 'dash') {
      const step = 32 * dt; B.dashed += step; hp.addScaledVector(B.dir, step); hv.copy(B.dir).multiplyScalar(32);
      if (!B.hitThis && P.vulnerable && pp.distanceTo(hp) < 4.6) { B.hitThis = true; B.hits++; ctx.hurt(25, hp.x, hp.y, hp.z, 'leviatan', { energy: 4, knock: 14 }); ctx.onBossHit(); if (B.carried >= 0) B.dropRod(); }
      if (B.dashed >= B.dashLen) { B.mode = 'recover'; B.modeT = 4.5; column.visible = false; }
    }
  }
  /** F3: ondas de cola en una banda de profundidad (baja o alta). */
  function waveAI(dt, P, D) {
    const pp = P.pos;
    if (!B.waveOn && B.modeT <= 0) {
      B.bandY = Math.random() < 0.5 ? -96 : -89.5; B.waveOn = true; B.waveT = 1.3 * D.tel; B.waveR = 1; B.waveHit = false;
      band.visible = true; band.position.set(0, B.bandY, 0); ctx.sfx.rumble(); ctx.onWaveTell(B.bandY > -93 ? 'alta' : 'baja');
    }
    if (B.waveOn) {
      if (B.waveT > 0) { B.waveT -= dt; bandMat.opacity = 0.06 + Math.sin(B.t * 20) * 0.04 + (1 - B.waveT) * 0.08; }
      else {
        band.visible = false; wave.visible = true; B.waveR += 20 * D.spd * dt;
        wave.position.set(0, B.bandY, 0); wave.scale.set(B.waveR, 1, B.waveR); waveMat.opacity = Math.max(0, 0.5 - B.waveR / 90);
        const rp = Math.hypot(pp.x, pp.z);
        if (!B.waveHit && P.vulnerable && Math.abs(pp.y - B.bandY) < 2.6 && Math.abs(rp - B.waveR) < 1.8) { B.waveHit = true; B.hits++; ctx.hurt(18, 0, B.bandY, 0, 'leviatan', { energy: 0, knock: 10 }); ctx.onBossHit(); }
        if (B.waveR > 42) { B.waveOn = false; wave.visible = false; B.modeT = D.waveEvery; B.waves++; }
      }
    }
  }
  root.visible = false;
  return B;
}
