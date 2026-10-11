// Mateo: Ciudad de Altura — rivales originales y NO letales:
//  1) Dron de mantenimiento descontrolado: patrulla en el aire, se alerta, avisa (luz roja + pitido) y suelta una
//     descarga sobre el punto marcado. Se desactiva con el pulso de energía (cerca) o atrapándolo con el cable.
//  2) Ladrón caricaturesco (gorro y camiseta a rayas): roba y huye por las veredas; si lo alcanzás y usás el pulso,
//     se rinde y devuelve lo robado.
//  3) Autómata pesado de la obra: escudo frontal, avisa el pisotón con un anillo rojo; después queda expuesto por la
//     espalda: 3 pulsos lo apagan. Saltar esquiva la onda.
// Nada de sangre ni armas reales: chispas, estrellitas y apagado.
import * as THREE from 'three';
import { buildCharacter, npcStyle } from './rig.js';
import { buildClips } from './anims.js';
import { Batcher, prep } from './geo.js';
import { dampAngle, wrapAngle, rng } from './util.js';

function droneModel() {
  const b = new Batcher();
  b.add('p', prep(new THREE.SphereGeometry(0.55, 14, 10), 0xe8b81a), [0, 0, 0, 0, 0, 0, 1, 0.6, 1]);
  b.add('p', prep(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 16), 0x2a2d30), [0, -0.1, 0]);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    b.box('p', 0.9, 0.08, 0.12, x * 0.45, 0.05, z * 0.45, { color: 0x2a2d30 }, Math.atan2(x, z) + Math.PI / 2);
    b.add('p', prep(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 12), 0x9aa0a6), [x * 0.8, 0.14, z * 0.8]);
  }
  b.box('p', 0.18, 0.12, 0.5, 0, -0.3, 0.1, { color: 0x3a3a3a });
  const out = new THREE.Group();
  b.build({ p: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }) }, out, 'dron');
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x40ff80, toneMapped: false }));
  eye.position.set(0, -0.05, 0.5); out.add(eye);
  return { group: out, eye };
}
function robotModel() {
  const b = new Batcher();
  b.box('p', 2.0, 1.8, 1.4, 0, 2.3, 0, { color: 0xd28a1a });
  b.box('p', 1.1, 0.8, 1.0, 0, 3.6, 0.05, { color: 0xb8701a });
  b.box('p', 0.7, 0.18, 0.06, 0, 3.7, 0.56, { color: 0x111111 });
  for (const s of [-1, 1]) { b.box('p', 0.55, 1.4, 0.6, s * 0.55, 0.7, 0, { color: 0x4a4f55 }); b.box('p', 0.7, 0.3, 0.9, s * 0.55, 0.15, 0.1, { color: 0x2a2d30 }); b.box('p', 0.5, 1.6, 0.5, s * 1.3, 2.1, 0, { color: 0x4a4f55 }); }
  b.box('p', 2.2, 2.0, 0.25, 0, 2.2, 0.85, { color: 0x7f8c95 }); // escudo frontal
  b.box('p', 1.0, 0.8, 0.08, 0, 2.5, -0.74, { color: 0x222222 }); // panel trasero (marco)
  const g = new THREE.Group();
  b.build({ p: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }) }, g, 'automata');
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0x444444, toneMapped: false }));
  panel.position.set(0, 2.5, -0.79); g.add(panel);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0xff4020, toneMapped: false }));
  eye.position.set(0, 3.7, 0.6); g.add(eye);
  return { group: g, panel, eye };
}

export function createEnemies(scene, city, ctx) {
  const rand = rng(31337);
  const group = new THREE.Group(); group.name = 'rivales'; scene.add(group);
  const drones = [], thieves = [], robots = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, opacity: 0.8, toneMapped: false });
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false });

  function stars() { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), starMat); s.position.set(Math.cos(i * 2.1) * 0.4, 0, Math.sin(i * 2.1) * 0.4); g.add(s); } g.visible = false; return g; }

  /* ---------- drones ---------- */
  function spawnDrone(x, y, z, tag) {
    const m = droneModel(); group.add(m.group);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 24).rotateX(-Math.PI / 2), ringMat.clone()); ring.visible = false; group.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6, 1, true).translate(0, 0.5, 0), beamMat); beam.visible = false; group.add(beam);
    const st = stars(); m.group.add(st);
    const d = { kind: 'drone', tag, m, ring, beam, st, home: { x, y, z }, x, y, z, vx: 0, vz: 0, yaw: 0, state: 'patrol', t: rand() * 6, cd: 1 + rand() * 2, tx: 0, ty: 0, tz: 0, active: true, disabled: false, fall: 0, respawn: 0 };
    drones.push(d); return d;
  }
  /* ---------- ladrones ---------- */
  const thiefClips = new Map();
  function spawnThief(x, z, tag) {
    const st = { ...npcStyle(91), suit: 0x2a2a2a, panel: 0x2a2a2a, pantsColor: 0x3a3a50, hair: 0x1a1a1a, skin: 0xe0b090, hairStyle: 'short', simpleFace: true, child: false };
    const ch = buildCharacter(st);
    // gorro de lana y rayas blancas
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc0392b }));
    hat.position.set(0, 0.14, 0); ch.bones.head.add(hat);
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.04, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xf0f0f0 })); s.scale.z = 0.72; s.position.y = -0.05 + i * 0.1; ch.bones.chest.add(s); }
    const key = ch.bones.hips.position.y.toFixed(3);
    if (!thiefClips.has(key)) thiefClips.set(key, buildClips(ch.bones.hips.position.y));
    const clips = thiefClips.get(key), mixer = new THREE.AnimationMixer(ch.group), acts = {};
    for (const n of ['idle_look', 'run', 'sprint', 'stagger', 'crouch', 'celebrate', 'walk_forward']) acts[n] = mixer.clipAction(clips.find(c => c.name === n));
    acts.idle_look.play();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x2ecc71 })); bag.position.set(0, 0, -0.22); ch.bones.chest.add(bag); bag.visible = false;
    const s = stars(); s.position.y = 2.1; ch.group.add(s);
    group.add(ch.group);
    const t = { kind: 'thief', tag, ch, mixer, acts, anim: 'idle_look', bag, st: s, x, z, yaw: 0, state: 'idle', t: 0, active: true, carrying: false, speed: 5.8, path: null };
    ch.group.position.set(x, city.curb, z);
    thieves.push(t); return t;
  }
  function tplay(t, n) { if (t.anim === n) return; const a = t.acts[n], b = t.acts[t.anim]; a.reset().play(); b.crossFadeTo(a, 0.2, false); t.anim = n; }
  /* ---------- autómata ---------- */
  function spawnRobot(x, z, tag) {
    const m = robotModel(); group.add(m.group);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40).rotateX(-Math.PI / 2), ringMat.clone()); ring.visible = false; group.add(ring);
    const s = stars(); s.position.y = 4.5; m.group.add(s);
    const r = { kind: 'robot', tag, m, ring, st: s, home: { x, z }, x, z, yaw: Math.PI, state: 'idle', t: 0, hp: 3, active: true, disabled: false, cd: 2, groundY: city.curb };
    m.group.position.set(x, city.curb, z);
    robots.push(r); return r;
  }

  const PW = () => ctx.player();
  function disableDrone(d, how) {
    if (d.disabled) return; d.disabled = true; d.state = 'down'; d.fall = 0; d.ring.visible = false; d.beam.visible = false;
    d.m.eye.material.color.setHex(0x333333); d.st.visible = true;
    if (d.tag === 'amb') d.respawn = 45;
    ctx.fx.zap(d.x, d.y, d.z); ctx.sfx.stun();
    ctx.onEvent('droneDown', { tag: d.tag, how });
  }
  const api = {
    drones, thieves, robots, spawnDrone, spawnThief, spawnRobot,
    clear(tag) {
      for (const list of [drones, thieves, robots]) for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i]; if (tag && e.tag !== tag) continue;
        const g = e.m ? e.m.group : e.ch.group; g.removeFromParent();
        if (e.ring) e.ring.removeFromParent(); if (e.beam) e.beam.removeFromParent();
        list.splice(i, 1);
      }
    },
    /** pulso de energía de Mateo: desactiva/aturde lo que esté adelante */
    attack(P) {
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); let hits = 0;
      const inFront = (x, y, z, r) => { const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz); return d < r && Math.abs(y - (P.pos.y + 1)) < 3 && (d < 1.2 || (dx * fx + dz * fz) / d > 0.2); };
      for (const d of drones) if (d.active && !d.disabled && inFront(d.x, d.y, d.z, 3.6)) { disableDrone(d, 'pulse'); hits++; }
      for (const t of thieves) if (t.active && t.state !== 'caught' && inFront(t.x, city.curb + 1, t.z, 2.6)) { t.state = 'caught'; t.t = 0; t.st.visible = true; ctx.sfx.stun(); ctx.fx.zap(t.x, 1.6, t.z); ctx.onEvent('thiefCaught', { tag: t.tag, carrying: t.carrying }); hits++; }
      for (const r of robots) if (r.active && !r.disabled && inFront(r.x, r.groundY + 2, r.z, 3.4)) {
        const behind = Math.cos(wrapAngle(Math.atan2(P.pos.x - r.x, P.pos.z - r.z) - r.yaw)) < -0.2;
        if (behind || r.state === 'recover') {
          r.hp--; ctx.fx.zap(r.x, r.groundY + 2.5, r.z); ctx.sfx.stun(); hits++;
          if (r.hp <= 0) { r.disabled = true; r.state = 'off'; r.m.eye.material.color.setHex(0x222222); r.m.panel.material.color.setHex(0x222222); r.st.visible = true; r.ring.visible = false; ctx.onEvent('robotDown', { tag: r.tag }); }
          else ctx.onEvent('robotHit', { hp: r.hp });
        } else { ctx.fx.zap(r.x + Math.sin(r.yaw) * 1, r.groundY + 2.2, r.z + Math.cos(r.yaw) * 1); ctx.onEvent('shield', {}); }
      }
      return hits;
    },
    /** cable contra un dron cercano en la dirección de la cámara (lo atrapa y desactiva) */
    cableTarget(P, camYaw) {
      let best = null, bd = 1e9;
      for (const d of drones) {
        if (!d.active || d.disabled) continue;
        const dx = d.x - P.pos.x, dy = d.y - P.pos.y - 1, dz = d.z - P.pos.z, dist = Math.hypot(dx, dy, dz);
        if (dist > 26) continue;
        const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - camYaw));
        if (ang < 0.55 && dist < bd) { bd = dist; best = d; }
      }
      if (best) disableDrone(best, 'cable');
      return best;
    },
    update(dt, frozen) {
      const P = PW(); if (!P) return;
      for (const d of drones) {
        if (!d.active) continue;
        d.t += dt;
        if (d.disabled) {
          if (d.state === 'down') { d.fall += dt; const g = city.world.groundAt(d.x, d.z, d.y); d.y = Math.max(g + 0.4, d.y - dt * (2 + d.fall * 4)); d.st.rotation.y += dt * 4; if (d.y <= g + 0.41) d.state = 'landed'; }
          if (d.respawn > 0) { d.respawn -= dt; if (d.respawn <= 0) { d.disabled = false; d.state = 'patrol'; d.x = d.home.x; d.y = d.home.y; d.z = d.home.z; d.st.visible = false; d.m.eye.material.color.setHex(0x40ff80); } }
          continue;
        }
        if (frozen) continue;
        const dx = P.pos.x - d.x, dy = P.pos.y + 1 - d.y, dz = P.pos.z - d.z, dist = Math.hypot(dx, dy, dz);
        if (d.state === 'patrol') {
          const a = d.t * 0.4; const tx = d.home.x + Math.cos(a) * 9, tz = d.home.z + Math.sin(a) * 9;
          d.x += (tx - d.x) * Math.min(1, dt * 1.5); d.z += (tz - d.z) * Math.min(1, dt * 1.5); d.y += (d.home.y + Math.sin(d.t * 2) * 0.4 - d.y) * Math.min(1, dt * 2);
          d.m.eye.material.color.setHex(0x40ff80);
          if (dist < 24) { d.state = 'chase'; ctx.sfx.beep(); ctx.onEvent('droneAlert', { tag: d.tag }); }
        } else if (d.state === 'chase') {
          const want = 7, k = (dist - want) / Math.max(dist, 0.01);
          d.x += dx * k * Math.min(1, dt * 1.6); d.z += dz * k * Math.min(1, dt * 1.6); d.y += (P.pos.y + 5 - d.y) * Math.min(1, dt * 1.5);
          d.m.eye.material.color.setHex(0xffb020);
          d.cd -= dt;
          if (d.cd <= 0 && dist < 16) { d.state = 'tele'; d.t2 = 1.0; d.tx = P.pos.x; d.ty = P.pos.y; d.tz = P.pos.z; d.ring.visible = true; ctx.sfx.beep(); }
          if (dist > 45) d.state = 'patrol';
        } else if (d.state === 'tele') {
          d.t2 -= dt;
          d.m.eye.material.color.setHex(Math.floor(d.t2 * 12) % 2 ? 0xff2020 : 0x550000);
          d.ring.position.set(d.tx, d.ty + 0.05, d.tz); d.ring.scale.setScalar(1.2 - d.t2 * 0.4); d.ring.material.opacity = 0.35 + 0.4 * (1 - d.t2);
          if (d.t2 <= 0) {
            d.state = 'zap'; d.t2 = 0.25; d.ring.visible = false;
            const hit = Math.hypot(P.pos.x - d.tx, P.pos.z - d.tz) < 1.7 && Math.abs(P.pos.y - d.ty) < 1.8;
            d.beam.visible = true; d.beam.position.set(d.x, d.y, d.z);
            const bx = d.tx - d.x, by = d.ty - d.y, bz = d.tz - d.z, bl = Math.hypot(bx, by, bz);
            d.beam.scale.set(1, bl, 1); d.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx / bl, by / bl, bz / bl));
            if (hit) ctx.hurt(ctx.easy ? 5 : 10, d.x, d.z);
            ctx.fx.zap(d.tx, d.ty + 0.3, d.tz);
          }
        } else if (d.state === 'zap') { d.t2 -= dt; if (d.t2 <= 0) { d.beam.visible = false; d.state = 'chase'; d.cd = 2.2 + rand(); } }
        if (dist < 30 && Math.floor(d.t * 10) % 3 === 0) ctx.sfx.drone(Math.max(0, 1 - dist / 30));
      }
      for (const t of thieves) {
        if (!t.active) continue;
        t.t += dt;
        const dx = P.pos.x - t.x, dz = P.pos.z - t.z, dist = Math.hypot(dx, dz);
        if (t.state === 'caught') { tplay(t, 'crouch'); t.st.rotation.y += dt * 4; t.bag.visible = false; }
        else if (t.state === 'flee' && !frozen) {
          // huye por la vereda alejándose de Mateo; se mantiene en la grilla
          const ax = t.x - P.pos.x, az = t.z - P.pos.z, al = Math.hypot(ax, az) || 1;
          let fx = ax / al, fz = az / al;
          // preferir moverse sobre veredas/ejes: redondear a la dirección dominante
          if (Math.abs(fx) > Math.abs(fz)) { fx = Math.sign(fx); fz = 0; } else { fz = Math.sign(fz); fx = 0; }
          const nx = t.x + fx * t.speed * dt, nz = t.z + fz * t.speed * dt;
          const blocked = city.world.groundAt(nx, nz, 3) > 0.5 || Math.abs(nx) > city.half - 4 || Math.abs(nz) > city.half - 4;
          if (blocked) { // dobla
            const alt = [[fz, -fx], [-fz, fx]].find(([a, b]) => city.world.groundAt(t.x + a * 2, t.z + b * 2, 3) <= 0.5 && Math.abs(t.x + a * 4) < city.half - 4 && Math.abs(t.z + b * 4) < city.half - 4);
            if (alt) { t.x += alt[0] * t.speed * dt; t.z += alt[1] * t.speed * dt; t.yaw = dampAngle(t.yaw, Math.atan2(alt[0], alt[1]), 10, dt); }
          } else { t.x = nx; t.z = nz; t.yaw = dampAngle(t.yaw, Math.atan2(fx, fz), 10, dt); }
          tplay(t, 'sprint');
          t.bag.visible = t.carrying;
          if (dist > 120) { t.x = P.pos.x + fx * 40; t.z = P.pos.z + fz * 40; } // no se pierde: siempre a la vista
        } else if (t.state === 'idle') tplay(t, 'idle_look');
        t.ch.group.position.set(t.x, city.world.groundAt(t.x, t.z, 1), t.z); t.ch.group.rotation.y = t.yaw;
        t.mixer.update(dt);
      }
      for (const r of robots) {
        if (!r.active) continue;
        if (r.disabled) { r.st.rotation.y += dt * 3; continue; }
        if (frozen) continue;
        r.t += dt;
        const dx = P.pos.x - r.x, dz = P.pos.z - r.z, dist = Math.hypot(dx, dz);
        if (r.state === 'idle') { if (dist < 20) { r.state = 'approach'; ctx.onEvent('robotAlert', {}); } }
        else if (r.state === 'approach') {
          r.yaw = dampAngle(r.yaw, Math.atan2(dx, dz), 1.6, dt);
          if (dist > 4) { const nx = r.x + Math.sin(r.yaw) * 2 * dt, nz = r.z + Math.cos(r.yaw) * 2 * dt; if (Math.hypot(nx - r.home.x, nz - r.home.z) < 16) { r.x = nx; r.z = nz; } }
          r.cd -= dt;
          if (r.cd <= 0 && dist < 9) { r.state = 'tele'; r.t2 = 1.3; r.ring.visible = true; ctx.sfx.beep(); }
          if (dist > 32) r.state = 'idle';
        } else if (r.state === 'tele') {
          r.t2 -= dt; const k = 1 - r.t2 / 1.3;
          r.ring.position.set(r.x, r.groundY + 0.05, r.z); r.ring.scale.setScalar(6 * k); r.ring.material.opacity = 0.25 + 0.5 * k;
          r.m.group.position.y = r.groundY + Math.sin(k * Math.PI) * 0.6;
          if (r.t2 <= 0) {
            ctx.sfx.stomp(); ctx.fx.dust(r.x, r.groundY, r.z, 20); ctx.onEvent('stomp', {});
            if (dist < 6.2 && P.pos.y - r.groundY < 0.8) ctx.hurt(ctx.easy ? 8 : 15, r.x, r.z);
            r.state = 'recover'; r.t2 = 2.4; r.ring.visible = false; r.m.group.position.y = r.groundY;
          }
        } else if (r.state === 'recover') {
          r.t2 -= dt; r.m.panel.material.color.setHex(Math.floor(r.t2 * 8) % 2 ? 0x40ffd0 : 0x0a6050);
          if (r.t2 <= 0) { r.state = 'approach'; r.cd = 2.5; r.m.panel.material.color.setHex(0x444444); }
        }
        r.m.group.position.x = r.x; r.m.group.position.z = r.z; r.m.group.rotation.y = r.yaw;
      }
    },
    render(camera) {
      for (const d of drones) { if (!d.active) continue; d.m.group.position.set(d.x, d.y, d.z); d.m.group.rotation.y = Math.atan2(PW().pos.x - d.x, PW().pos.z - d.z); if (!d.disabled) d.m.group.children.forEach(() => {}); }
      void camera;
    },
    /** V2: zonas de peligro para que los vecinos se aparten (descarga anunciada, pisotón) */
    dangers() {
      const out = [];
      for (const d of drones) if (d.active && !d.disabled && (d.state === 'tele' || d.state === 'zap')) out.push({ x: d.tx, z: d.tz, r: 3 });
      for (const r of robots) if (r.active && !r.disabled && r.state === 'tele') out.push({ x: r.x, z: r.z, r: 6 });
      return out;
    },
    drawMap(c, X, Y) {
      for (const d of drones) if (d.active && !d.disabled) { c.fillStyle = '#ff5050'; c.beginPath(); c.arc(X(d.x), Y(d.z), 4, 0, 7); c.fill(); }
      for (const t of thieves) if (t.active && t.state === 'flee') { c.fillStyle = '#ff9a3a'; c.fillRect(X(t.x) - 4, Y(t.z) - 4, 8, 8); }
      for (const r of robots) if (r.active && !r.disabled) { c.fillStyle = '#ff3030'; c.fillRect(X(r.x) - 5, Y(r.z) - 5, 10, 10); }
    },
    info() {
      return {
        drones: drones.map(d => ({ tag: d.tag, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), state: d.state, disabled: d.disabled })),
        thieves: thieves.map(t => ({ tag: t.tag, x: +t.x.toFixed(2), z: +t.z.toFixed(2), state: t.state, carrying: t.carrying })),
        robots: robots.map(r => ({ tag: r.tag, x: +r.x.toFixed(2), z: +r.z.toFixed(2), state: r.state, hp: r.hp, disabled: r.disabled, yaw: +r.yaw.toFixed(2) })),
      };
    },
  };
  return api;
}
