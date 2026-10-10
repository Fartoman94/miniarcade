// @ts-check
/* Academia de Dragones — rivales: murciélago sombrío, arpía aérea y autómata volador.
   Cada uno tiene silueta, patrón y contrajuego propios (ver docs/games/academia_dragones.md). */
import * as THREE from 'three';
import * as M from './models.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
export const HP = { bat: 2, harpy: 3, auto: 3 };
export const RADIUS = { bat: 3.2, harpy: 3.8, auto: 3.8 };

/** Geometrías compartidas (se crean una vez por partida). @param {any} mats */
export function createEnemyKit(mats) {
  const geos = {
    bat: M.batGeo(), batWing: M.batWingGeo(), batEye: M.batEyeGeo(),
    harpy: M.harpyGeo(), harpyWing: M.harpyWingGeo(), feather: M.featherGeo(),
    auto: M.autoGeo(), autoRing: M.autoRingGeo(), autoEye: M.autoEyeGeo(),
  };
  const featherMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return {
    geos, mats, featherMat,
    dispose() { Object.values(geos).forEach(g => g.dispose()); featherMat.dispose(); },
  };
}

/**
 * Administra los rivales de una región.
 * @param {any} kit @param {THREE.Scene} scene
 * @param {{player:any, fx:any, sfx:any, damage:(n:number,src:string)=>void, onKill:(kind:string,pos:THREE.Vector3)=>void, diff:any, reduced:boolean}} ctx
 */
export function createEnemies(kit, scene, ctx) {
  const group = new THREE.Group(); group.name = 'enemies'; scene.add(group);
  /** @type {any[]} */ const list = [];
  // plumas de arpía (pool)
  /** @type {any[]} */ const feathers = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(kit.geos.feather, kit.featherMat); m.visible = false; group.add(m);
    feathers.push({ mesh: m, pos: m.position, vel: new THREE.Vector3(), life: 0 });
  }
  const beamMat = new THREE.LineBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.8, toneMapped: false });

  function make(kind, x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const e = { kind, group: g, pos: g.position, home: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1),
      hp: HP[kind], alive: true, state: 'idle', t: 0, cd: 1 + Math.random() * 2, respawn: 0, phase: Math.random() * 6,
      wingL: /** @type {THREE.Object3D|null} */ (null), wingR: /** @type {THREE.Object3D|null} */ (null), eyeMat: /** @type {any} */ (null),
      ring: /** @type {THREE.Object3D|null} */ (null), beam: /** @type {THREE.Line|null} */ (null), aim: new THREE.Vector3(), hitFlash: 0, stunned: 0, frozen: false };
    if (kind === 'bat') {
      g.add(new THREE.Mesh(kit.geos.bat, kit.mats.vc));
      e.eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd0ff, toneMapped: false });
      g.add(new THREE.Mesh(kit.geos.batEye, e.eyeMat));
      e.wingR = new THREE.Mesh(kit.geos.batWing, kit.mats.vcDouble); e.wingR.position.set(0.6, 0.2, -0.2);
      e.wingL = new THREE.Mesh(kit.geos.batWing, kit.mats.vcDouble); e.wingL.position.set(-0.6, 0.2, -0.2); e.wingL.scale.x = -1;
      g.add(e.wingR, e.wingL); g.scale.setScalar(1.25);
    } else if (kind === 'harpy') {
      g.add(new THREE.Mesh(kit.geos.harpy, kit.mats.vc));
      e.wingR = new THREE.Mesh(kit.geos.harpyWing, kit.mats.vcDouble); e.wingR.position.set(0.5, 0.6, 0);
      e.wingL = new THREE.Mesh(kit.geos.harpyWing, kit.mats.vcDouble); e.wingL.position.set(-0.5, 0.6, 0); e.wingL.scale.x = -1;
      g.add(e.wingR, e.wingL); g.scale.setScalar(1.35);
      e.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff6fa8, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      const aura = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), e.eyeMat); g.add(aura); e.aura = aura;
    } else {
      g.add(new THREE.Mesh(kit.geos.auto, kit.mats.vc));
      e.ring = new THREE.Mesh(kit.geos.autoRing, kit.mats.vc); g.add(e.ring);
      e.eyeMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, toneMapped: false });
      g.add(new THREE.Mesh(kit.geos.autoEye, e.eyeMat));
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      e.beam = new THREE.Line(bg, beamMat); e.beam.visible = false; e.beam.frustumCulled = false; group.add(e.beam);
      g.scale.setScalar(1.3);
    }
    group.add(g);
    list.push(e);
    return e;
  }

  /** @param {{kind:string,x:number,y:number,z:number}[]} spawns @param {number} mult */
  function populate(spawns, mult) {
    const n = Math.max(1, Math.round(spawns.length * mult));
    for (let i = 0; i < n; i++) {
      const s = spawns[i % spawns.length], off = i >= spawns.length ? 18 : 0;
      make(s.kind, s.x + off, s.y + off * 0.3, s.z - off);
    }
  }

  function shootFeathers(e, target) {
    let fired = 0;
    for (let k = -2; k <= 2; k++) {
      const f = feathers.find(q => q.life <= 0); if (!f) break;
      f.pos.copy(e.pos);
      _v.subVectors(target, e.pos).normalize();
      _w.set(-_v.z, 0, _v.x).normalize();
      f.vel.copy(_v).addScaledVector(_w, k * 0.12).normalize().multiplyScalar(48);
      f.life = 3.2; f.mesh.visible = true; f.mesh.lookAt(_u.copy(f.pos).add(f.vel)); fired++;
    }
    return fired;
  }

  function killEnemy(e) {
    e.alive = false; e.group.visible = false; e.respawn = 30; e.state = 'idle';
    if (e.beam) e.beam.visible = false;
    ctx.fx.burst(e.pos.x, e.pos.y, e.pos.z, 26, e.kind === 'auto' ? 0xffb347 : e.kind === 'harpy' ? 0xff7fbf : 0xb08aff, 16, 0.9, 6);
    ctx.sfx.enemyDie();
    ctx.onKill(e.kind, e.pos);
  }

  /** Daño del aliento. Devuelve 'hit'|'armor'|'kill'|null. @param {any} e @param {number} dmg @param {string} element */
  function damage(e, dmg, element) {
    if (!e.alive) return null;
    if (e.kind === 'auto' && e.state !== 'overheat' && element !== 'tierra') {
      ctx.fx.burst(e.pos.x, e.pos.y, e.pos.z, 8, 0xffffff, 8, 0.3); ctx.sfx.armor(); return 'armor';
    }
    if (e.kind === 'harpy' && e.state === 'warn') { e.state = 'stun'; e.t = 1.6; } // contrajuego: golpearla mientras prepara las plumas
    e.hp -= dmg; e.hitFlash = 0.15;
    ctx.fx.burst(e.pos.x, e.pos.y, e.pos.z, 10, 0xffffff, 10, 0.35);
    if (e.hp <= 0) { killEnemy(e); return 'kill'; }
    ctx.sfx.enemyHit();
    return 'hit';
  }

  /** @param {number} dt @param {number} time */
  function update(dt, time) {
    const P = ctx.player, tele = ctx.diff.tele;
    for (const e of list) {
      if (!e.alive) {
        e.respawn -= dt;
        if (e.respawn <= 0 && P.pos.distanceTo(e.home) > 90) { e.alive = true; e.hp = HP[e.kind]; e.pos.copy(e.home); e.group.visible = true; e.state = 'idle'; e.cd = 2; }
        continue;
      }
      if (e.frozen) { e.vel.set(0, 0, 0); continue; } // sólo pruebas (?debug): blanco quieto y determinista
      e.t -= dt; e.cd -= dt; e.phase += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      const dist = e.pos.distanceTo(P.pos);
      const active = P.alive && dist < 180;
      if (e.kind === 'bat') {
        if (e.state === 'idle' || e.state === 'return') {
          // vuela en círculos alrededor de su percha
          _v.set(e.home.x + Math.cos(e.phase * 0.9) * 16, e.home.y + Math.sin(e.phase * 1.7) * 4, e.home.z + Math.sin(e.phase * 0.9) * 16);
          _w.subVectors(_v, e.pos); const l = _w.length();
          e.vel.lerp(_w.multiplyScalar(Math.min(28, l * 2) / Math.max(l, 0.001)), 1 - Math.exp(-dt * 3));
          if (e.state === 'idle' && active && dist < 80 && e.cd <= 0) { e.state = 'warn'; e.t = 0.85 * tele; ctx.sfx.screech(); }
          if (e.state === 'return' && e.pos.distanceTo(e.home) < 22) e.state = 'idle';
        } else if (e.state === 'warn') {
          e.vel.multiplyScalar(Math.exp(-dt * 4));
          if (e.t <= 0) { e.state = 'dive'; e.t = 1.6; _v.copy(P.pos).addScaledVector(P.vel, 0.45); e.dir.subVectors(_v, e.pos).normalize(); }
        } else if (e.state === 'dive') {
          e.vel.copy(e.dir).multiplyScalar(58);
          if (dist < RADIUS.bat + 1.6 && P.alive) { ctx.damage(12, 'murciélago'); e.state = 'return'; e.cd = 3; }
          if (e.t <= 0) { e.state = 'return'; e.cd = 2.5; }
        }
        e.eyeMat.color.setHex(e.state === 'warn' || e.state === 'dive' ? 0xff2020 : 0xffd0ff);
        const fl = Math.sin(time * (e.state === 'dive' ? 8 : 16) + e.phase) * 0.8;
        if (e.wingR && e.wingL) { e.wingR.rotation.z = fl; e.wingL.rotation.z = -fl; }
      } else if (e.kind === 'harpy') {
        if (e.state === 'stun') {
          e.vel.y -= 12 * dt; e.vel.multiplyScalar(Math.exp(-dt));
          if (e.t <= 0) { e.state = 'idle'; e.cd = 2.5; }
        } else if (e.state === 'warn') {
          e.vel.multiplyScalar(Math.exp(-dt * 3));
          if (e.t <= 0) { shootFeathers(e, _u.copy(P.pos).addScaledVector(P.vel, 0.5)); ctx.sfx.zap(); e.state = 'idle'; e.cd = 4.5; }
        } else {
          // acecho: se ubica arriba y detrás del jugador, a distancia
          const chase = active && dist < 150 && e.pos.distanceTo(e.home) < 260;
          if (chase) _v.copy(P.pos).addScaledVector(P.fwd, -28).add(_w.set(Math.sin(e.phase) * 14, 16, 0));
          else _v.set(e.home.x + Math.cos(e.phase * 0.5) * 20, e.home.y, e.home.z + Math.sin(e.phase * 0.5) * 20);
          _w.subVectors(_v, e.pos); const l = _w.length();
          e.vel.lerp(_w.multiplyScalar(Math.min(chase ? 46 : 18, l * 1.5) / Math.max(l, 0.001)), 1 - Math.exp(-dt * 2));
          if (chase && dist < 95 && e.cd <= 0) { e.state = 'warn'; e.t = 1.05 * tele; ctx.sfx.screech(); }
        }
        e.eyeMat.opacity = e.state === 'warn' ? 0.25 + 0.2 * Math.sin(time * 20) : e.state === 'stun' ? 0.15 : 0;
        const fl = e.state === 'warn' ? 1.1 : Math.sin(time * 7 + e.phase) * 0.7;
        if (e.wingR && e.wingL) { e.wingR.rotation.z = fl; e.wingL.rotation.z = -fl; }
      } else {
        // autómata
        if (e.state === 'idle') {
          _v.set(e.home.x + Math.cos(e.phase * 0.4) * 26, e.home.y + Math.sin(e.phase) * 3, e.home.z + Math.sin(e.phase * 0.4) * 26);
          _w.subVectors(_v, e.pos); const l = _w.length();
          e.vel.lerp(_w.multiplyScalar(Math.min(14, l * 1.2) / Math.max(l, 0.001)), 1 - Math.exp(-dt * 2));
          if (active && dist < 115 && e.cd <= 0) { e.state = 'lock'; e.t = 1.7 * tele; ctx.sfx.charge(); }
        } else if (e.state === 'lock') {
          e.vel.multiplyScalar(Math.exp(-dt * 4));
          if (e.t > 0.35) e.aim.copy(P.pos); // apunta y se fija 0,35 s antes de disparar: moverse lo esquiva
          if (e.t <= 0) {
            e.state = 'fire'; e.t = 0.3; ctx.sfx.zap();
            _v.subVectors(e.aim, e.pos).normalize(); e.dir.copy(_v);
            // impacto si el jugador está cerca de la línea del rayo
            _w.subVectors(P.pos, e.pos); const along = _w.dot(_v);
            if (along > 0 && along < 170 && P.alive) { _u.copy(e.pos).addScaledVector(_v, along); if (_u.distanceTo(P.pos) < 3.4) ctx.damage(20, 'autómata'); }
          }
        } else if (e.state === 'fire') {
          if (e.t <= 0) { e.state = 'overheat'; e.t = 2.8; }
        } else if (e.state === 'overheat') {
          e.vel.y = Math.sin(time * 3) * 1.5;
          if (e.t <= 0) { e.state = 'idle'; e.cd = 2.2; }
        }
        if (e.ring) e.ring.rotation.set(Math.PI / 2 + Math.sin(time) * 0.3, 0, time * (e.state === 'overheat' ? 0.5 : 4));
        e.eyeMat.color.setHex(e.state === 'overheat' ? 0xff8a20 : e.state === 'lock' || e.state === 'fire' ? 0xff3030 : 0x66ccff);
        if (e.beam) {
          const show = e.state === 'lock' || e.state === 'fire';
          e.beam.visible = show;
          if (show) {
            const a = /** @type {THREE.BufferAttribute} */ (e.beam.geometry.attributes.position);
            const end = e.state === 'fire' ? _u.copy(e.pos).addScaledVector(e.dir, 170) : e.aim;
            a.setXYZ(0, e.pos.x, e.pos.y, e.pos.z); a.setXYZ(1, end.x, end.y, end.z); a.needsUpdate = true;
            /** @type {any} */ (e.beam.material).opacity = e.state === 'fire' ? 1 : 0.35 + 0.3 * Math.sin(time * 30);
            beamMat.color.setHex(e.state === 'fire' ? 0xffe0a0 : 0xff3030);
          }
        }
      }
      e.pos.addScaledVector(e.vel, dt);
      // mirar hacia donde va (o al jugador si ataca)
      if (e.state === 'warn' || e.state === 'lock') _v.copy(P.pos); else _v.copy(e.pos).add(e.vel);
      if (_v.distanceToSquared(e.pos) > 0.01) e.group.lookAt(_v.x, _v.y, _v.z), e.group.rotateY(Math.PI);
      e.group.visible = e.hitFlash <= 0 || (Math.floor(time * 30) & 1) === 0;
    }
    // plumas
    for (const f of feathers) {
      if (f.life <= 0) continue;
      f.life -= dt; f.pos.addScaledVector(f.vel, dt);
      if (P.alive && f.pos.distanceToSquared(P.pos) < 2.8 * 2.8) { ctx.damage(9, 'arpía'); f.life = 0; }
      if (f.life <= 0) f.mesh.visible = false;
    }
  }

  return {
    list, group, populate, update, damage,
    counts() { const c = { bat: 0, harpy: 0, auto: 0, feathers: 0 }; for (const e of list) if (e.alive) c[e.kind]++; for (const f of feathers) if (f.life > 0) c.feathers++; return c; },
    clearShots() { for (const f of feathers) { f.life = 0; f.mesh.visible = false; } for (const e of list) { if (e.state !== 'idle') { e.state = 'idle'; e.cd = 3; } if (e.beam) e.beam.visible = false; } },
    dispose() {
      scene.remove(group);
      for (const e of list) { if (e.eyeMat) e.eyeMat.dispose(); if (e.aura) e.aura.geometry.dispose(); if (e.beam) e.beam.geometry.dispose(); }
      beamMat.dispose();
      list.length = 0;
    },
  };
}
