// @ts-check
/* Academia de Dragones — Serpiente de Tormenta (jefe final, 3 fases).
   Fase 1 «Tormenta»: rayos telegrafiados (columnas rojas) y orbes que van hacia la academia; tras dos
     andanadas se agota y muestra 3 escamas brillantes (ventana de vulnerabilidad).
   Fase 2 «Ojo del ciclón» (≤60 %): el viento te arrastra hacia la academia; embiste en línea recta
     marcada con chispas y queda aturdida (cabeza vulnerable). Aros de calma recargan y cargan el aliento.
   Fase 3 «Furia» (≤25 %): alterna rayos más rápidos, embestidas y orbes. */
import * as THREE from 'three';
import * as M from './models.js';

const SEGS = 34, SEG_LEN = 4.5, TRAIL = 220;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

/**
 * @param {THREE.Scene} scene @param {any} mats
 * @param {{player:any, fx:any, sfx:any, damage:(n:number,src:string)=>void, diff:any, reduced:boolean, height:(x:number,z:number)=>number,
 *   academy:THREE.Vector3, onPhase:(p:number)=>void, onDefeated:()=>void, damageAcademy:(n:number)=>void, onOrbPop:()=>void, hemi:THREE.HemisphereLight}} ctx
 */
export function createBoss(scene, mats, ctx) {
  const group = new THREE.Group(); group.name = 'boss'; scene.add(group);
  const geos = { head: M.serpentHeadGeo(), eyes: M.serpentEyesGeo(), seg: M.serpentSegGeo(), scale: M.scaleGeo() };
  const bossMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.15, emissive: 0x1d2f66, emissiveIntensity: 0.6 });
  const head = new THREE.Group();
  head.add(new THREE.Mesh(geos.head, bossMat));
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false });
  head.add(new THREE.Mesh(geos.eyes, eyeMat));
  const headGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe36b, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const headGlow = new THREE.Mesh(new THREE.SphereGeometry(6.5, 12, 8), headGlowMat); head.add(headGlow);
  head.scale.setScalar(1.25);
  group.add(head);
  const body = new THREE.InstancedMesh(geos.seg, bossMat, SEGS); body.castShadow = true; body.frustumCulled = false; group.add(body);
  const scaleMat = new THREE.MeshBasicMaterial({ color: 0xffe36b, toneMapped: false });
  const scaleIdx = [7, 15, 23];
  const scales = scaleIdx.map(i => { const m = new THREE.Mesh(geos.scale, scaleMat); m.visible = false; group.add(m); return { mesh: m, seg: i, hit: false }; });

  // rastro de la cabeza (los segmentos lo siguen)
  const trail = Array.from({ length: TRAIL }, () => new THREE.Vector3());
  let trailHead = 0, trailCount = TRAIL;

  // telegrafías de rayos + rayos
  const colG = new THREE.CylinderGeometry(7, 7, 260, 16, 1, true);
  const strikes = Array.from({ length: 6 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const col = new THREE.Mesh(colG, mat); col.visible = false; group.add(col);
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    const bolt = new THREE.Line(bg, new THREE.LineBasicMaterial({ color: 0xeaf6ff, toneMapped: false })); bolt.visible = false; bolt.frustumCulled = false; group.add(bolt);
    return { col, mat, bolt, x: 0, z: 0, t: 0, state: 'off' };
  });
  // orbes de tormenta
  const orbG = new THREE.IcosahedronGeometry(2.4, 1);
  const orbMat = new THREE.MeshBasicMaterial({ color: 0xb48cff, toneMapped: false });
  const orbs = Array.from({ length: 5 }, () => { const m = new THREE.Mesh(orbG, orbMat); m.visible = false; group.add(m); return { mesh: m, pos: m.position, alive: false }; });
  // aros de calma (fase 2+)
  const calmG = new THREE.TorusGeometry(8, 0.6, 6, 28);
  const calmMat = new THREE.MeshBasicMaterial({ color: 0x8affd8, toneMapped: false, transparent: true, opacity: 0.9 });
  const calms = [0, 1, 2].map(i => { const m = new THREE.Mesh(calmG, calmMat); m.visible = false; group.add(m); return { mesh: m, pos: m.position, cd: 0, ang: i * 2.1 }; });
  // línea de embestida
  const lineG = new THREE.BufferGeometry(); lineG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const chargeLine = new THREE.Line(lineG, new THREE.LineDashedMaterial({ color: 0xffe36b, dashSize: 3, gapSize: 2, toneMapped: false })); chargeLine.visible = false; chargeLine.frustumCulled = false; group.add(chargeLine);

  const S = {
    hp: 40 * ctx.diff.bossHp, maxHp: 40 * ctx.diff.bossHp, phase: 1, mode: 'intro', t: 5, ang: 0,
    pos: head.position, vel: new THREE.Vector3(), dir: new THREE.Vector3(), stormT: 4, volleys: 0, orbT: 7, chargeT: 4, hitThisCharge: false,
    flash: 0, dead: false, active: true, headHits: 0,
  };
  S.pos.set(90, -30, 0);
  for (const p of trail) p.copy(S.pos);

  function setPhase(p) { if (p === S.phase) return; S.phase = p; ctx.onPhase(p); ctx.sfx.roar(); if (p >= 2) calms.forEach(c => { c.mesh.visible = true; c.cd = 0; }); }

  function volley(n) {
    const P = ctx.player; let k = 0;
    for (const s of strikes) {
      if (k >= n) break;
      if (s.state !== 'off') continue;
      const lead = k === 0 ? 0 : 1.2;
      s.x = P.pos.x + P.vel.x * lead + (k === 0 ? 0 : (Math.random() - 0.5) * 50);
      s.z = P.pos.z + P.vel.z * lead + (k === 0 ? 0 : (Math.random() - 0.5) * 50);
      s.t = (S.phase === 3 ? 1.2 : 1.55) * ctx.diff.tele; s.state = 'warn';
      s.col.position.set(s.x, 120, s.z); s.col.visible = true; s.mat.opacity = 0.1;
      k++;
    }
    ctx.sfx.warn();
  }
  function strike(s) {
    s.state = 'bolt'; s.t = 0.28; s.col.visible = false;
    const a = /** @type {THREE.BufferAttribute} */ (s.bolt.geometry.attributes.position);
    const gy = Math.max(ctx.height(s.x, s.z), 10);
    for (let i = 0; i < 14; i++) { const y = 250 - (250 - gy) * (i / 13); a.setXYZ(i, s.x + (i && i < 13 ? (Math.random() - 0.5) * 9 : 0), y, s.z + (i && i < 13 ? (Math.random() - 0.5) * 9 : 0)); }
    a.needsUpdate = true; s.bolt.visible = true;
    ctx.sfx.thunder();
    if (!ctx.reduced) S.flash = 0.25;
    ctx.fx.burst(s.x, Math.max(gy, ctx.player.pos.y - 10), s.z, 14, 0xdff4ff, 18, 0.5);
    const P = ctx.player;
    if (P.alive && Math.hypot(P.pos.x - s.x, P.pos.z - s.z) < 7.5) ctx.damage(22, 'rayo');
  }
  function spawnOrb() {
    const o = orbs.find(q => !q.alive); if (!o) return;
    o.alive = true; o.pos.copy(S.pos); o.mesh.visible = true; ctx.sfx.charge();
  }

  /** @param {number} dt @param {number} time */
  function update(dt, time) {
    if (!S.active) return;
    const P = ctx.player, A = ctx.academy;
    S.t -= dt;
    // movimiento según modo
    if (S.mode === 'intro') {
      S.ang += dt * 0.6;
      _v.set(Math.cos(S.ang) * 90, -20 + (1 - Math.max(0, S.t) / 5) * 120, Math.sin(S.ang) * 90);
      S.vel.subVectors(_v, S.pos).multiplyScalar(2.5);
      if (S.t <= 0) { S.mode = 'circle'; ctx.sfx.roar(); }
    } else if (S.mode === 'circle' || S.mode === 'tired') {
      const speed = S.mode === 'tired' ? 8 : S.phase === 3 ? 40 : 32, R = 125;
      S.ang += speed / R * dt;
      _v.set(A.x + Math.cos(S.ang) * R, 92 + Math.sin(S.ang * 2) * 16, A.z + Math.sin(S.ang) * R);
      _w.subVectors(_v, S.pos); const l = _w.length() || 1;
      S.vel.lerp(_w.multiplyScalar(Math.min(speed * 1.6, l * 2) / l), 1 - Math.exp(-dt * 2));
      if (S.mode === 'tired' && S.t <= 0) { S.mode = 'circle'; scales.forEach(s => { s.mesh.visible = false; s.hit = false; }); }
      if (S.mode === 'circle') {
        // fase 1 y 3: rayos; tras 2 andanadas, se agota
        if (S.phase !== 2) {
          S.stormT -= dt;
          if (S.stormT <= 0) {
            volley(S.phase === 3 ? 4 : 5); S.volleys++; S.stormT = S.phase === 3 ? 4.2 : 5.5;
            if (S.volleys >= 2) { S.volleys = 0; S.mode = 'tired'; S.t = 6.5; S.stormT = 7.5; scales.forEach(s => { s.mesh.visible = true; s.hit = false; }); ctx.sfx.roar(); }
          }
          S.orbT -= dt;
          if (S.orbT <= 0) { spawnOrb(); S.orbT = S.phase === 3 ? 7 : 9.5; }
        }
        if (S.phase >= 2) {
          S.chargeT -= dt;
          if (S.chargeT <= 0 && S.mode === 'circle') { S.mode = 'aim'; S.t = 1.7 * ctx.diff.tele; }
        }
      }
    } else if (S.mode === 'aim') {
      S.vel.multiplyScalar(Math.exp(-dt * 3));
      _v.copy(P.pos).addScaledVector(P.vel, 0.3);
      S.dir.subVectors(_v, S.pos).normalize();
      const a = /** @type {THREE.BufferAttribute} */ (lineG.attributes.position);
      a.setXYZ(0, S.pos.x, S.pos.y, S.pos.z); _w.copy(S.pos).addScaledVector(S.dir, 170); a.setXYZ(1, _w.x, _w.y, _w.z); a.needsUpdate = true;
      chargeLine.computeLineDistances(); chargeLine.visible = true;
      if (Math.random() < 0.5) ctx.fx.trail(S.pos.x + S.dir.x * 20 * Math.random() * 8, S.pos.y + S.dir.y * 20 * Math.random() * 8, S.pos.z + S.dir.z * 20 * Math.random() * 8, 0, 0, 0, 0xffe36b, 0.4);
      if (S.t <= 0) { S.mode = 'charge'; S.t = 1.8; S.hitThisCharge = false; chargeLine.visible = false; ctx.sfx.roar(); }
    } else if (S.mode === 'charge') {
      S.vel.copy(S.dir).multiplyScalar(88);
      if (S.t <= 0) { S.mode = 'stunned'; S.t = 3.6; S.headHits = 0; ctx.sfx.thunder(); }
    } else if (S.mode === 'stunned') {
      S.vel.multiplyScalar(Math.exp(-dt * 2)); S.vel.y -= 2 * dt;
      if (S.t <= 0) { S.mode = 'circle'; S.chargeT = S.phase === 3 ? 6 : 5; }
    } else if (S.mode === 'dying') {
      S.vel.set(0, -14, 0);
      if (Math.random() < 0.6) { const i = Math.floor(Math.random() * SEGS); const p = trail[(trailHead - i * Math.round(SEG_LEN / 1) + TRAIL * 8) % TRAIL]; ctx.fx.burst(p.x, p.y, p.z, 6, 0x9fd8ff, 14, 0.8); }
      if (S.t <= 0) { S.mode = 'dead'; S.active = false; group.visible = false; ctx.onDefeated(); return; }
    }
    // no atravesar el terreno ni irse lejos
    const gy = ctx.height(S.pos.x, S.pos.z) + 14;
    S.pos.addScaledVector(S.vel, dt);
    if (S.mode !== 'intro' && S.mode !== 'dying' && S.pos.y < Math.max(gy, 30)) { S.pos.y = Math.max(gy, 30); if (S.vel.y < 0) S.vel.y = 0; }
    if (S.pos.length() > 320) S.pos.multiplyScalar(320 / S.pos.length());

    // orientación de la cabeza
    _w.copy(S.mode === 'aim' ? S.dir : S.vel); if (_w.lengthSq() < 0.01) _w.set(0, 0, -1);
    _v.copy(S.pos).add(_w); head.lookAt(_v); head.rotateY(Math.PI);
    if (S.mode === 'stunned') head.rotateX(-0.4);
    // rastro: guardar un punto cada SEG_LEN/3
    const last = trail[trailHead];
    if (last.distanceToSquared(S.pos) > 1.4 * 1.4) { trailHead = (trailHead + 1) % TRAIL; trail[trailHead].copy(S.pos); trailCount = Math.min(TRAIL, trailCount + 1); }
    for (let i = 0; i < SEGS; i++) {
      const k = Math.min(trailCount - 1, (i + 1) * 3), p = trail[(trailHead - k + TRAIL) % TRAIL], q = trail[(trailHead - Math.min(trailCount - 1, k + 1) + TRAIL) % TRAIL];
      _w.subVectors(q, p); if (_w.lengthSq() < 1e-4) _w.set(0, 0, 1);
      _w.normalize(); _m.lookAt(_w, _s.set(0, 0, 0), _up); _q.setFromRotationMatrix(_m);
      const sc = 1.25 * (1 - i / SEGS * 0.65);
      _m.compose(p, _q, _s.set(sc, sc, sc)); body.setMatrixAt(i, _m);
      for (const s of scales) if (s.seg === i) { s.mesh.position.copy(p); s.mesh.position.y += 4.5 * sc; s.mesh.rotation.y = time * 3; }
    }
    body.instanceMatrix.needsUpdate = true;
    // daño por contacto
    if (P.alive && S.mode !== 'intro' && S.mode !== 'dying') {
      const hitR = S.mode === 'charge' ? 7 : 5.5;
      let touching = S.pos.distanceToSquared(P.pos) < hitR * hitR;
      if (!touching) for (let i = 0; i < SEGS; i += 3) { const p = trail[(trailHead - Math.min(trailCount - 1, (i + 1) * 3) + TRAIL) % TRAIL]; if (p.distanceToSquared(P.pos) < 4.5 * 4.5) { touching = true; break; } }
      if (touching && !(S.mode === 'charge' && S.hitThisCharge)) { ctx.damage(S.mode === 'charge' ? 26 : 12, 'serpiente'); if (S.mode === 'charge') S.hitThisCharge = true; }
    }
    // rayos
    for (const s of strikes) {
      if (s.state === 'off') continue;
      s.t -= dt;
      if (s.state === 'warn') { s.mat.opacity = 0.12 + (1 - s.t / 1.6) * 0.35 + (Math.sin(time * 30) * 0.05); if (s.t <= 0) strike(s); }
      else if (s.state === 'bolt' && s.t <= 0) { s.state = 'off'; s.bolt.visible = false; }
    }
    // orbes hacia la academia
    for (const o of orbs) {
      if (!o.alive) continue;
      _v.set(A.x, A.y + 30, A.z).sub(o.pos); const d = _v.length();
      o.pos.addScaledVector(_v.normalize(), 13 * dt);
      o.mesh.rotation.y += dt * 3; o.mesh.scale.setScalar(1 + Math.sin(time * 8) * 0.15);
      if (P.alive && o.pos.distanceToSquared(P.pos) < 5 * 5) { popOrb(o); continue; }
      if (d < 16) { o.alive = false; o.mesh.visible = false; ctx.damageAcademy(12 * ctx.diff.damage); ctx.fx.burst(o.pos.x, o.pos.y, o.pos.z, 30, 0xb48cff, 18, 1); ctx.sfx.thunder(); }
    }
    // aros de calma
    if (S.phase >= 2) for (const c of calms) {
      c.ang += dt * 0.25;
      c.pos.set(A.x + Math.cos(c.ang) * 70, 105 + Math.sin(c.ang * 3) * 10, A.z + Math.sin(c.ang) * 70);
      c.mesh.lookAt(A.x, c.pos.y, A.z); c.mesh.rotateY(Math.PI / 2);
      if (c.cd > 0) { c.cd -= dt; c.mesh.visible = c.cd <= 0; continue; }
      if (P.alive && c.pos.distanceToSquared(P.pos) < 9 * 9) { c.cd = 10; c.mesh.visible = false; P.charged = true; P.energy = Math.min(P.maxEnergy, P.energy + 30); ctx.sfx.rescue(); ctx.fx.burst(c.pos.x, c.pos.y, c.pos.z, 24, 0x8affd8, 14, 0.8); }
    }
    // brillo de vulnerabilidad
    headGlowMat.opacity = S.mode === 'stunned' ? 0.3 + 0.15 * Math.sin(time * 10) : 0;
    eyeMat.color.setHex(S.mode === 'stunned' ? 0xffe36b : S.mode === 'aim' || S.mode === 'charge' ? 0xff4040 : 0x9fe8ff);
    if (S.flash > 0) { S.flash -= dt; ctx.hemi.intensity = 0.95 + S.flash * 6; } else ctx.hemi.intensity = 0.95;
  }

  function popOrb(o) { o.alive = false; o.mesh.visible = false; ctx.fx.burst(o.pos.x, o.pos.y, o.pos.z, 20, 0xb48cff, 14, 0.7); ctx.onOrbPop(); }

  function hurt(n) {
    if (S.mode === 'dying' || S.mode === 'dead' || S.mode === 'intro') return;
    S.hp = Math.max(0, S.hp - n);
    ctx.fx.burst(S.pos.x, S.pos.y, S.pos.z, 16, 0xffe36b, 16, 0.6);
    const r = S.hp / S.maxHp;
    if (S.hp <= 0) { S.mode = 'dying'; S.t = 3.2; scales.forEach(s => s.mesh.visible = false); chargeLine.visible = false; strikes.forEach(s => { s.state = 'off'; s.col.visible = false; s.bolt.visible = false; }); orbs.forEach(o => { o.alive = false; o.mesh.visible = false; }); ctx.sfx.roar(); return; }
    if (r <= 0.25) setPhase(3); else if (r <= 0.6) setPhase(2);
  }

  /** Impacto de un proyectil del jugador. Devuelve qué golpeó. @param {THREE.Vector3} p @param {number} dmg */
  function tryHit(p, dmg) {
    if (!S.active || S.mode === 'dying') return null;
    for (const o of orbs) if (o.alive && o.pos.distanceToSquared(p) < 4.2 * 4.2) { popOrb(o); return 'orb'; }
    for (const s of scales) if (s.mesh.visible && !s.hit && s.mesh.position.distanceToSquared(p) < 4.8 * 4.8) {
      s.hit = true; s.mesh.visible = false; hurt(dmg * 2); ctx.sfx.enemyHit();
      if (scales.every(x => x.hit)) { S.mode = 'circle'; S.t = 0; }
      return 'scale';
    }
    if (S.pos.distanceToSquared(p) < 8 * 8) {
      if (S.mode === 'stunned' && S.headHits < 3) {
        S.headHits++; hurt(dmg * 5); ctx.sfx.enemyHit();
        if (S.headHits >= 3 && S.mode === 'stunned') S.t = Math.min(S.t, 0.6); // se recupera antes: la cabeza se protege
        return 'head';
      }
      ctx.sfx.armor(); return 'armor';
    }
    for (let i = 0; i < SEGS; i += 2) { const q = trail[(trailHead - Math.min(trailCount - 1, (i + 1) * 3) + TRAIL) % TRAIL]; if (q.distanceToSquared(p) < 5 * 5) { ctx.sfx.armor(); return 'armor'; } }
    return null;
  }

  return {
    S, head, group, hurt, tryHit, setPhase, scales, orbs, update,
    skipIntro() { if (S.mode === 'intro') S.t = Math.min(S.t, 0.01); },
    get weakPoints() { return scales.filter(s => s.mesh.visible).length + (S.mode === 'stunned' ? 1 : 0); },
    get strikesActive() { return strikes.filter(s => s.state !== 'off').length; },
    get orbsActive() { return orbs.filter(o => o.alive).length; },
    clearHazards() { strikes.forEach(s => { s.state = 'off'; s.col.visible = false; s.bolt.visible = false; }); orbs.forEach(o => { o.alive = false; o.mesh.visible = false; }); chargeLine.visible = false; if (S.mode === 'aim' || S.mode === 'charge') { S.mode = 'circle'; S.chargeT = 4; } },
    dispose() {
      scene.remove(group);
      Object.values(geos).forEach(g => g.dispose());
      [bossMat, eyeMat, headGlowMat, scaleMat, orbMat, calmMat, chargeLine.material].forEach(m => /** @type {any} */ (m).dispose());
      headGlow.geometry.dispose(); colG.dispose(); orbG.dispose(); calmG.dispose(); lineG.dispose(); body.dispose();
      strikes.forEach(s => { s.mat.dispose(); s.bolt.geometry.dispose(); /** @type {any} */ (s.bolt.material).dispose(); });
    },
  };
}
