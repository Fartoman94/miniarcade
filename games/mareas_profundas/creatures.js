// @ts-check
/* Mareas Profundas — fauna y rivales. Cada criatura tiene silueta, patrón y contrajuego propios:
   - medusa eléctrica: la atrae tu luz; se carga (brilla) y descarga en un radio → alejate o apagá la luz.
   - anguila guardiana: acecha en un caño y embiste en línea recta tras un aviso → un pulso de sonar la espanta.
   - dron submarino: patrulla con reflector; si te ve, alerta y embiste → escondete, apagá la luz o aturdilo con sonar.
   - pulpo territorial: defiende su guarida con golpes de tentáculo señalizados y tinta → el flash de FOTO lo ahuyenta.
   Ambiente: cardúmenes de peces linterna (instanciados), manta, tortuga y rapes abisales. */
import * as THREE from 'three';
import { fishGeo, mantaGeo, turtleGeo, anglerGeo, jellyGeos, eelGeos, makeDrone as droneModel, octopusGeos } from './models.js';
import { collide, blocked } from './physics.js';

const _o = new THREE.Object3D(), _v = new THREE.Vector3(), _c = new THREE.Color();
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** @typedef {{kind:string, species:string, pos:THREE.Vector3, mh:number, size:number, state:string, scannable:boolean, sonar?:(x:number,y:number,z:number)=>boolean, flash?:(x:number,y:number,z:number)=>boolean}} Ent */

/* ======================= cardúmenes (instanciados) ======================= */
/**
 * @param {THREE.Group} root @param {any} mats
 * @param {{x:number,y:number,z:number,rx:number,ry:number,rz:number,speed:number}[]} schools
 * @param {number} color @param {number} tail
 */
export function makeSchools(root, mats, schools, color = 0x9fe8ff, tail = 0x4ff7e6, max = 220) {
  const mesh = new THREE.InstancedMesh(fishGeo(color, tail), mats.creature, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  root.add(mesh);
  const n = max, ph = new Float32Array(n), rad = new Float32Array(n), hgt = new Float32Array(n), spd = new Float32Array(n);
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  for (let i = 0; i < n; i++) { ph[i] = Math.random() * 6.28; rad[i] = 1 + Math.random() * 3.5; hgt[i] = (Math.random() - 0.5) * 3; spd[i] = 0.8 + Math.random() * 0.6; }
  /** @type {Ent[]} */
  const ents = schools.map(s => ({ kind: 'school', species: 'linterna', pos: new THREE.Vector3(s.x, s.y, s.z), mh: 1.5, size: 4, state: 'swim', scannable: true, s }));
  let count = Math.min(n, 110), t = 0;
  return {
    mesh, ents,
    /** @param {number} c */ setCount(c) { count = Math.min(n, c); mesh.count = count; },
    get count() { return count; },
    /** @param {number} dt @param {{x:number,y:number,z:number}} pl */
    update(dt, pl) {
      t += dt;
      for (const e of ents) { const s = /** @type {any} */ (e).s; e.pos.set(s.x + Math.sin(t * s.speed * 0.2) * s.rx, s.y + Math.sin(t * s.speed * 0.31) * s.ry, s.z + Math.cos(t * s.speed * 0.17) * s.rz); }
      const S = ents.length;
      for (let i = 0; i < count; i++) {
        const c = ents[i % S].pos, a = t * spd[i] + ph[i];
        let x = c.x + Math.cos(a) * rad[i], y = c.y + hgt[i] + Math.sin(a * 1.7) * 0.4, z = c.z + Math.sin(a) * rad[i];
        const dx = x - pl.x, dy = y - pl.y, dz = z - pl.z, d = Math.hypot(dx, dy, dz);
        if (d < 4.5 && d > 0.01) { const k = (4.5 - d) / d; x += dx * k; y += dy * k * 0.5; z += dz * k; }
        _o.position.set(x, y, z);
        const vx = x - px[i], vz = z - pz[i];
        if (vx * vx + vz * vz > 1e-6) _o.rotation.set(0, Math.atan2(vx, vz), 0);
        px[i] = x; py[i] = y; pz[i] = z;
        _o.updateMatrix(); mesh.setMatrixAt(i, _o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ======================= fauna pasiva ======================= */
/** Manta luminosa que planea en círculos. */
export function makeManta(root, mats, cx, cy, cz, r) {
  const m = new THREE.Mesh(mantaGeo(), mats.creature); root.add(m);
  /** @type {Ent & {update:(dt:number)=>void}} */
  const e = {
    kind: 'manta', species: 'manta', pos: m.position, mh: 1.2, size: 3, state: 'glide', scannable: true,
    update(dt) { const t = (e.t = (e.t || 0) + dt) * 0.18; m.position.set(cx + Math.cos(t) * r, cy + Math.sin(t * 2.3) * 2, cz + Math.sin(t) * r); m.rotation.set(Math.sin(t * 5) * 0.08, -t + Math.PI, Math.sin(t * 6) * 0.25); },
  };
  return e;
}
export function makeTurtle(root, mats, pts) {
  const m = new THREE.Mesh(turtleGeo(), mats.creature); root.add(m);
  let i = 0, t = 0; m.position.set(pts[0][0], pts[0][1], pts[0][2]);
  /** @type {any} */
  const e = {
    kind: 'turtle', species: 'tortuga', pos: m.position, mh: 1, size: 1.6, state: 'swim', scannable: true,
    update(dt) {
      t += dt;
      const w = pts[i]; _v.set(w[0] - m.position.x, w[1] - m.position.y, w[2] - m.position.z);
      const d = _v.length(); if (d < 1.5) i = (i + 1) % pts.length;
      _v.normalize().multiplyScalar(1.4 * dt); m.position.add(_v);
      const yaw = Math.atan2(_v.x, _v.z); let dd = yaw - m.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); m.rotation.y += dd * Math.min(1, dt * 2);
      m.rotation.z = Math.sin(t * 2) * 0.1;
    },
  };
  return e;
}
/** Rapes abisales: su señuelo brilla; si te acercás de frente, muerden. Con la luz apagada no te notan. */
export function makeAnglers(root, mats, list, lights) {
  const geo = anglerGeo();
  const lureMat = new THREE.MeshBasicMaterial({ color: 0xa8ffef });
  const lureGeo = new THREE.SphereGeometry(0.16, 8, 6);
  return list.map(([x, y, z], k) => {
    const g = new THREE.Group(); g.position.set(x, y, z); root.add(g);
    g.add(new THREE.Mesh(geo, mats.creature));
    const lure = new THREE.Mesh(lureGeo, lureMat); lure.position.set(0, 0.9, 1.15); g.add(lure);
    let light = null;
    if (k < lights) { light = new THREE.PointLight(0x7fffe0, 6, 9, 1.6); light.position.copy(lure.position); g.add(light); }
    const home = new THREE.Vector3(x, y, z);
    /** @type {any} */
    const e = {
      kind: 'angler', species: 'rape', pos: g.position, mh: 1.2, size: 1.4, state: 'lure', scannable: true, cd: 0, t: Math.random() * 5, light,
      update(dt, ctx) {
        e.t += dt; e.cd -= dt;
        const P = ctx.player, d = dist3(P.pos, g.position);
        if (P.light && d < 14 && e.cd <= 0) { _v.subVectors(P.pos, g.position).normalize().multiplyScalar(1.1 * ctx.diff().spd * dt); g.position.add(_v); e.state = 'hunt'; }
        else { _v.subVectors(home, g.position).multiplyScalar(0.3 * dt); g.position.add(_v); g.position.y += Math.sin(e.t * 0.8) * 0.004; e.state = 'lure'; }
        g.rotation.y = Math.atan2(P.pos.x - g.position.x, P.pos.z - g.position.z) * (e.state === 'hunt' ? 1 : 0) + (e.state === 'hunt' ? 0 : Math.sin(e.t * 0.3) * 0.8);
        lure.scale.setScalar(0.8 + Math.sin(e.t * 3) * 0.25);
        if (d < 2.4 && e.cd <= 0 && P.vulnerable) { ctx.hurt(8, g.position.x, g.position.y, g.position.z, 'rape', { energy: 0, knock: 4 }); e.cd = 3; ctx.sfx.bite(); }
      },
      flash() { e.cd = 4; return false; },
    };
    return e;
  });
}

/* ======================= medusas eléctricas (instanciadas) ======================= */
/** @param {[number,number,number][]} list */
export function makeJellies(root, list) {
  const { bell, tent } = jellyGeos();
  const n = list.length;
  const bellMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false });
  const tentMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const bells = new THREE.InstancedMesh(bell, bellMat, Math.max(1, n)), tents = new THREE.InstancedMesh(tent, tentMat, Math.max(1, n));
  bells.count = tents.count = n; bells.frustumCulled = tents.frustumCulled = false; bells.renderOrder = tents.renderOrder = 4;
  for (let i = 0; i < n; i++) { bells.setColorAt(i, _c.setHex(0xff7fe0)); tents.setColorAt(i, _c); }
  root.add(bells, tents);
  /** @type {any[]} */
  const ents = list.map(([x, y, z], i) => ({
    kind: 'jelly', species: 'medusa', pos: new THREE.Vector3(x, y, z), home: new THREE.Vector3(x, y, z), origin: new THREE.Vector3(x, y, z),
    mh: 1.2, size: 1.2, state: 'drift', scannable: true, t: 0, glow: 0, ph: i * 1.7, zaps: 0,
  }));
  let time = 0;
  return {
    ents, bells, tents,
    /** @param {number} dt @param {any} ctx */
    update(dt, ctx) {
      time += dt;
      const P = ctx.player, D = ctx.diff();
      for (let i = 0; i < n; i++) {
        const e = ents[i], d = dist3(P.pos, e.pos);
        // la luz las atrae (sin alejarse demasiado de su zona)
        if (P.light && d < 15 && e.state === 'drift' && P.alive) { _v.subVectors(P.pos, e.home); const l = _v.length(); if (l > 0.5) e.home.addScaledVector(_v, (0.55 * D.spd * dt) / l); }
        else { _v.subVectors(e.origin, e.home); e.home.addScaledVector(_v, Math.min(1, dt * 0.08)); }
        if (e.home.distanceTo(e.origin) > 20) { _v.subVectors(e.home, e.origin).setLength(20); e.home.copy(e.origin).add(_v); }
        const pulse = Math.max(0, Math.sin(time * 1.6 + e.ph));
        e.pos.set(e.home.x + Math.sin(time * 0.3 + e.ph) * 0.6, e.home.y + Math.sin(time * 0.8 + e.ph) * 1.2 + pulse * 0.3, e.home.z + Math.cos(time * 0.27 + e.ph) * 0.6);
        if (e.state === 'drift') { e.glow = Math.max(0, e.glow - dt); if (d < 5.5 && P.vulnerable) { e.state = 'charge'; e.t = 0.95 * D.tel; ctx.sfx.crackle(); } }
        else if (e.state === 'charge') {
          e.t -= dt; e.glow = Math.min(1, e.glow + dt * 1.6);
          if (e.t <= 0) {
            e.state = 'cool'; e.t = 2.8; e.zaps++;
            ctx.fx.sparks(e.pos.x, e.pos.y, e.pos.z, 26, 0xc9a0ff, 7, 0.25, 0.4); ctx.sfx.zap();
            if (d < 4.4) ctx.hurt(10, e.pos.x, e.pos.y, e.pos.z, 'medusa', { energy: 6, knock: 5 });
          }
        } else { e.t -= dt; e.glow = Math.max(0, e.glow - dt * 0.8); if (e.t <= 0) e.state = 'drift'; }
        const sq = 1 - pulse * 0.18;
        _o.position.copy(e.pos); _o.rotation.set(Math.sin(time * 0.5 + e.ph) * 0.15, 0, Math.cos(time * 0.4 + e.ph) * 0.15); _o.scale.set(1 / sq, sq, 1 / sq);
        _o.updateMatrix(); bells.setMatrixAt(i, _o.matrix);
        _o.scale.set(1, 1 + pulse * 0.25, 1); _o.updateMatrix(); tents.setMatrixAt(i, _o.matrix);
        const flick = e.state === 'charge' ? (Math.sin(time * 40) > 0 ? 1 : 0.6) : 1;
        const g = (0.55 + e.glow * 1.8) * flick;
        _c.setRGB(1.0 * g * (1 - e.glow * 0.4), 0.45 * g + e.glow * 0.9, 0.9 * g + e.glow * 0.4);
        bells.setColorAt(i, _c); tents.setColorAt(i, _c);
      }
      bells.instanceMatrix.needsUpdate = tents.instanceMatrix.needsUpdate = true;
      if (bells.instanceColor) bells.instanceColor.needsUpdate = true; if (tents.instanceColor) tents.instanceColor.needsUpdate = true;
    },
  };
}

/* ======================= anguila guardiana ======================= */
/**
 * @param {THREE.Group} root @param {any} mats
 * @param {{x:number,y:number,z:number,dx:number,dy:number,dz:number,len?:number}} den
 */
export function makeEel(root, mats, den) {
  const G = eelGeos();
  const SEG = 9;
  const segs = new THREE.InstancedMesh(G.seg, mats.creature, SEG); segs.frustumCulled = false; root.add(segs);
  const head = new THREE.Mesh(G.head, mats.creature); root.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
  const eyes = new THREE.Mesh(G.eyes, eyeMat); head.add(eyes);
  const dir = new THREE.Vector3(den.dx, den.dy, den.dz).normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  const base = new THREE.Vector3(den.x, den.y, den.z);
  const L = den.len || 9;
  /** @type {any} */
  const e = {
    kind: 'eel', species: 'anguila', pos: new THREE.Vector3().copy(base), mh: 1.2, size: 1.5, state: 'peek', ext: 1.2, t: 0, time: Math.random() * 5,
    lunges: 0, hits: 0, base, dir, L,
    get scannable() { return e.ext > 0.4; },
    update(dt, ctx) {
      const P = ctx.player, D = ctx.diff();
      e.time += dt; e.t -= dt;
      _v.subVectors(P.pos, base);
      const s = _v.dot(dir), lat = Math.sqrt(Math.max(0, _v.lengthSq() - s * s));
      const inLane = s > 0 && s < L + 1.5 && lat < 2.8 && P.vulnerable;
      let target = e.ext, speed = 4;
      if (e.state === 'peek') { target = 1.2; if (inLane && e.t <= 0) { e.state = 'tell'; e.t = 0.75 * D.tel; ctx.sfx.hiss(); } }
      else if (e.state === 'tell') { target = 1.6; if (e.t <= 0) { e.state = 'lunge'; e.lunges++; e.hitThis = false; } }
      else if (e.state === 'lunge') {
        target = L; speed = 22 * D.spd;
        if (!e.hitThis && P.vulnerable && dist3(P.pos, e.pos) < 2.0) { e.hitThis = true; e.hits++; ctx.hurt(18, e.pos.x, e.pos.y, e.pos.z, 'anguila', { energy: 0, knock: 9 }); ctx.sfx.bite(); }
        if (e.ext >= L - 0.1) { e.state = 'retract'; }
      } else if (e.state === 'retract') { target = 1.2; speed = 5; if (e.ext <= 1.3) { e.state = 'peek'; e.t = 1.2; } }
      else if (e.state === 'scared') { target = -1.8; speed = 8; if (e.t <= 0) { e.state = 'peek'; e.t = 0.8; } }
      e.ext += Math.sign(target - e.ext) * Math.min(Math.abs(target - e.ext), speed * dt);
      // cabeza y cuerpo a lo largo del caño, con ondulación lateral
      const wig = e.state === 'lunge' ? 0.15 : 0.35;
      e.pos.copy(base).addScaledVector(dir, e.ext).addScaledVector(side, Math.sin(e.time * 3) * wig * Math.min(1, Math.max(0, e.ext) / 2));
      head.position.copy(e.pos);
      head.lookAt(_v.copy(e.pos).add(dir));
      eyeMat.color.setHex(e.state === 'tell' || e.state === 'lunge' ? 0xff3030 : e.state === 'scared' ? 0x445566 : 0xffe066);
      for (let i = 0; i < SEG; i++) {
        const k = e.ext - 0.9 - i * 0.75;
        _o.position.copy(base).addScaledVector(dir, k).addScaledVector(side, Math.sin(e.time * 3 - i * 0.7) * wig * Math.min(1, Math.max(0, k) / 2));
        _o.lookAt(_v.copy(_o.position).add(dir)); _o.scale.setScalar(1 - i * 0.07); _o.updateMatrix(); segs.setMatrixAt(i, _o.matrix);
      }
      segs.instanceMatrix.needsUpdate = true;
    },
    sonar(x, y, z) { if (Math.hypot(x - e.pos.x, y - e.pos.y, z - e.pos.z) < 30) { e.state = 'scared'; e.t = 6; return true; } return false; },
  };
  return e;
}

/* ======================= dron submarino ======================= */
/** @param {THREE.Group} root @param {any} mats @param {number[][]} wps */
export function makeDrone(root, mats, wps) {
  const D = droneModel(mats); root.add(D.group);
  D.group.position.set(wps[0][0], wps[0][1], wps[0][2]);
  const vel = new THREE.Vector3();
  /** @type {any} */
  const e = {
    kind: 'drone', species: '', pos: D.group.position, mh: 1.2, size: 1.2, state: 'patrol', scannable: false, wp: 1, t: 0, yaw: 0, lost: 0, seenT: 0, rams: 0, scanT: 0, beep: 0,
    update(dt, ctx) {
      const P = ctx.player, Df = ctx.diff(), p = e.pos, W = ctx.world;
      e.t -= dt;
      let tx = p.x, ty = p.y, tz = p.z, sp = 0;
      const d = dist3(P.pos, p);
      const canSee = () => {
        const range = P.light ? 17 : 8.5;
        if (d > range || !P.alive) return false;
        _v.subVectors(P.pos, p).normalize();
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
        if (_v.x * fx + _v.z * fz < Math.cos(0.62) && d > 3.5) return false;
        return !blocked(W, p.x, p.y, p.z, P.pos.x, P.pos.y, P.pos.z);
      };
      if (e.state === 'patrol' || e.state === 'return') {
        const w = wps[e.wp]; tx = w[0]; ty = w[1]; tz = w[2]; sp = 3 * Df.spd;
        if (Math.hypot(tx - p.x, ty - p.y, tz - p.z) < 1.5) { e.wp = (e.wp + 1) % wps.length; e.state = 'patrol'; }
        e.scanT -= dt;
        if (e.scanT <= 0) { e.scanT = 0.2; if (P.vulnerable && canSee()) { e.state = 'alert'; e.t = 0.85 * Df.tel; ctx.sfx.alarm(); ctx.emit('droneAlert'); } }
      } else if (e.state === 'alert') {
        tx = P.pos.x; ty = P.pos.y; tz = P.pos.z; sp = 0.3;
        e.beep -= dt; if (e.beep <= 0) { e.beep = 0.25; ctx.sfx.beep(); }
        if (e.t <= 0) { e.state = 'chase'; e.t = 9; e.lost = 0; }
      } else if (e.state === 'chase') {
        tx = P.pos.x; ty = P.pos.y; tz = P.pos.z; sp = 5.6 * Df.spd;
        e.scanT -= dt; if (e.scanT <= 0) { e.scanT = 0.25; if (blocked(W, p.x, p.y, p.z, P.pos.x, P.pos.y, P.pos.z)) e.lost += 0.25; else e.lost = 0; }
        if (d < 2.3 && P.vulnerable) { e.rams++; ctx.hurt(12, p.x, p.y, p.z, 'dron', { energy: 5, knock: 8 }); ctx.sfx.clang(); e.state = 'recoil'; e.t = 1.4; _v.subVectors(p, P.pos).normalize(); vel.copy(_v).multiplyScalar(6); }
        if (e.lost > 3 || e.t <= 0 || !P.alive) { e.state = 'return'; }
      } else if (e.state === 'recoil') { sp = 0; if (e.t <= 0) { e.state = 'chase'; e.t = 6; } }
      else if (e.state === 'jammed') {
        sp = 0; vel.y -= 1.2 * dt; if (Math.random() < dt * 8) ctx.fx.sparks(p.x, p.y, p.z, 2, 0x9fe8ff, 2, 0.12, 0.3);
        if (e.t <= 0) e.state = 'return';
      }
      if (sp > 0) {
        _v.set(tx - p.x, ty - p.y, tz - p.z); const l = _v.length();
        if (l > 0.01) { _v.multiplyScalar(1 / l); vel.lerp(_v.multiplyScalar(sp), Math.min(1, dt * 2.5)); }
        const yaw = Math.atan2(tx - p.x, tz - p.z); let dd = yaw - e.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); e.yaw += dd * Math.min(1, dt * 3);
      } else if (e.state === 'alert') { const yaw = Math.atan2(tx - p.x, tz - p.z); let dd = yaw - e.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); e.yaw += dd * Math.min(1, dt * 5); vel.multiplyScalar(Math.exp(-3 * dt)); }
      else vel.multiplyScalar(Math.exp(-1.5 * dt));
      p.addScaledVector(vel, dt);
      collide(W, p, vel, 1.0, 0.2);
      D.group.rotation.set(Math.sin(e.t * 2) * 0.05, e.yaw, 0);
      const col = e.state === 'alert' || e.state === 'chase' ? 0xff3a3a : e.state === 'jammed' ? 0x334455 : 0x66ffe0;
      D.eyeMat.color.setHex(col); D.coneMat.color.setHex(col);
      D.coneMat.opacity = e.state === 'jammed' ? 0 : (e.state === 'chase' || e.state === 'alert' ? 0.12 : 0.07);
    },
    sonar(x, y, z) { if (Math.hypot(x - e.pos.x, y - e.pos.y, z - e.pos.z) < 32) { e.state = 'jammed'; e.t = 3.5; return true; } return false; },
  };
  return e;
}

/* ======================= pulpo territorial ======================= */
/** @param {THREE.Group} root @param {{x:number,y:number,z:number,ry:number,R?:number}} lair */
export function makeOctopus(root, lair) {
  const G = octopusGeos();
  const mantleMat = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x8a6a5a, flatShading: true, emissive: 0x000000 });
  const tentMat = new THREE.MeshLambertMaterial({ color: 0x8a6a5a, flatShading: true });
  const g = new THREE.Group(); g.position.set(lair.x, lair.y, lair.z); g.rotation.y = lair.ry; root.add(g);
  const mantle = new THREE.Mesh(G.mantle, mantleMat); g.add(mantle);
  const TN = 8, TS = 5;
  const tents = new THREE.InstancedMesh(G.seg, tentMat, TN * TS); tents.frustumCulled = false; root.add(tents);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.6, 28), ringMat); ring.rotation.x = -Math.PI / 2; ring.visible = false; root.add(ring);
  const home = new THREE.Vector3(lair.x, lair.y, lair.z);
  const target = new THREE.Vector3();
  const R = lair.R || 14;
  const C_REST = new THREE.Color(0x6a5a52), C_ANGRY = new THREE.Color(0xff3a2a), C_FLEE = new THREE.Color(0xd8c8b0);
  const base = new THREE.Vector3(), tip = new THREE.Vector3();
  /** @type {any} */
  const e = {
    kind: 'octopus', species: 'pulpo', pos: g.position, mh: 2.6, size: 2.5, state: 'rest', scannable: true, t: 0, time: 0, slams: 0, inks: 0, flees: 0, strike: 0, inflate: 0, R,
    update(dt, ctx) {
      const P = ctx.player, D = ctx.diff();
      e.time += dt; e.t -= dt;
      const d = dist3(P.pos, home), inside = d < R && P.vulnerable;
      let colT = C_REST, inf = 0;
      if (e.state === 'rest') { if (inside) { e.state = 'warn'; e.t = 1.4 * D.tel; ctx.sfx.growl(); ctx.emit('octoWarn'); } }
      else if (e.state === 'warn') {
        colT = C_ANGRY; inf = 1;
        if (!inside && d > R * 1.1) e.state = 'rest';
        else if (e.t <= 0) e.state = d < 7 ? 'ink' : 'aim', e.t = e.state === 'ink' ? 0.2 : 0.9 * D.tel, target.copy(P.pos);
      } else if (e.state === 'aim') {
        colT = C_ANGRY; inf = 1; ring.visible = true; ring.position.copy(target); ringMat.opacity = 0.4 + Math.sin(e.time * 20) * 0.25;
        if (e.t <= 0) { e.state = 'slam'; e.t = 0.35; e.slams++; ring.visible = false; ctx.sfx.slam(); ctx.fx.cloud(target.x, target.y, target.z, 8, 0x4a5a6a, 3, 1.2); ctx.fx.shake(0.25);
          if (P.vulnerable && P.pos.distanceTo(target) < 3.6) ctx.hurt(22, target.x, target.y - 1, target.z, 'pulpo', { energy: 0, knock: 10 }); }
      } else if (e.state === 'slam') { colT = C_ANGRY; inf = 0.6; if (e.t <= 0) { e.state = 'cool'; e.t = 1.6; } }
      else if (e.state === 'ink') {
        colT = C_ANGRY; inf = 0.3;
        if (e.t <= 0) { e.inks++; ctx.fx.cloud(g.position.x, g.position.y + 1, g.position.z, 26, 0x0a0a14, 5, 1.6); ctx.ink(2.6); ctx.sfx.ink();
          _v.subVectors(P.pos, home).setLength(9); P.vel.add(_v); e.state = 'cool'; e.t = 2.0; }
      } else if (e.state === 'cool') { colT = C_ANGRY; inf = 0.3; if (e.t <= 0) e.state = inside ? 'warn' : 'rest', e.t = 0.6 * D.tel; }
      else if (e.state === 'flee') { colT = C_FLEE; inf = -0.4; if (e.t <= 0) e.state = 'rest'; }
      if (e.state !== 'aim') ring.visible = false;
      // la guarida: se esconde al huir
      const goal = e.state === 'flee' ? -1.6 : 0;
      g.position.y += (home.y + goal - g.position.y) * Math.min(1, dt * 3);
      e.inflate += (inf - e.inflate) * Math.min(1, dt * 4);
      mantle.scale.setScalar(1 + e.inflate * 0.18 + Math.sin(e.time * 1.5) * 0.03);
      mantleMat.color.lerp(colT, Math.min(1, dt * 4)); tentMat.color.copy(mantleMat.color);
      mantleMat.emissive.setRGB(e.inflate > 0.5 ? 0.25 : 0, 0, 0);
      g.rotation.y = e.state === 'rest' || e.state === 'flee' ? lair.ry : Math.atan2(P.pos.x - g.position.x, P.pos.z - g.position.z);
      // tentáculos: ondulan; en el golpe, el primero se estira hasta el objetivo
      let k = 0;
      for (let ti = 0; ti < TN; ti++) {
        const a = ti / TN * Math.PI * 2 + g.rotation.y;
        base.set(g.position.x + Math.cos(a) * 0.9, g.position.y + 0.2, g.position.z + Math.sin(a) * 0.9);
        const reach = (e.state === 'slam' || e.state === 'aim') && ti === 0;
        if (reach) { if (e.state === 'slam') tip.copy(target); else tip.copy(base).lerp(target, 0.25); }
        for (let si = 0; si < TS; si++) {
          if (reach) { _o.position.copy(base).lerp(tip, si / TS); _o.lookAt(tip); _o.scale.set(1.2 - si * 0.18, 1.2 - si * 0.18, base.distanceTo(tip) / TS / 0.8); }
          else {
            const wav = Math.sin(e.time * 2 + ti + si * 0.8) * 0.5;
            const rr = 0.9 + si * 0.7;
            _o.position.set(g.position.x + Math.cos(a + wav * 0.2) * rr, g.position.y + 0.1 - si * 0.12 + wav * 0.2 * si, g.position.z + Math.sin(a + wav * 0.2) * rr);
            _o.lookAt(g.position.x + Math.cos(a) * (rr + 1), _o.position.y - 0.1, g.position.z + Math.sin(a) * (rr + 1));
            _o.scale.setScalar(1 - si * 0.16);
          }
          _o.updateMatrix(); tents.setMatrixAt(k++, _o.matrix);
        }
      }
      tents.instanceMatrix.needsUpdate = true;
    },
    flash(x, y, z) {
      if (Math.hypot(x - home.x, y - home.y, z - home.z) < 18 && e.state !== 'flee') { e.state = 'flee'; e.t = 8; e.flees++; ring.visible = false; return true; }
      return false;
    },
  };
  return e;
}
