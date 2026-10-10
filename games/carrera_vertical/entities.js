// @ts-check
/* Carrera Vertical — rivales y desafíos: drones de vigilancia (foco que detecta), barreras móviles (láser que sube/baja
   o barre) y torretas no letales (mira telegrafiada y pulso aturdidor). Sin asignaciones por cuadro. */
import { THREE } from '../../matelabs/kit3d.js';
import { groundBelow, blocked } from './physics.js';
import { droneGeo, droneEyeGeo, turretGeo, turretHeadGeo } from './models.js';

const _v = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
let geos = /** @type {any} */ (null);
function G() {
  if (geos) return geos;
  geos = {
    drone: droneGeo(), eye: droneEyeGeo(), turret: turretGeo(), head: turretHeadGeo(),
    cone: new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0),
    disc: new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2),
    ring: new THREE.RingGeometry(0.92, 1, 32).rotateX(-Math.PI / 2),
    bar: new THREE.BoxGeometry(1, 1, 1),
    ball: new THREE.IcosahedronGeometry(0.32, 1),
  };
  for (const k in geos) geos[k].userData.shared = true;
  return geos;
}

/** Cápsula vertical del corredor contra un punto. */
function capsuleDist(P, x, y, z) {
  const p = P.body.pos, y0 = p.y + 0.3, y1 = p.y + P.body.h - 0.3;
  const cy = Math.max(y0, Math.min(y1, y));
  return Math.hypot(x - p.x, y - cy, z - p.z);
}

/* ======================= dron de vigilancia ======================= */
export function makeDrone(ctx, W, path, speed, o = {}) {
  const g = G(), mats = ctx.mats;
  const grp = new THREE.Group(); W.group.add(grp);
  const body = new THREE.Mesh(g.drone, mats.prop); body.castShadow = true; grp.add(body);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0, toneMapped: false });
  const eye = new THREE.Mesh(g.eye, eyeMat); grp.add(eye);
  const coneMat = mats.cone.clone(), spotMat = mats.spot.clone();
  const cone = new THREE.Mesh(g.cone, coneMat); W.group.add(cone);
  const spot = new THREE.Mesh(g.disc, spotMat); spot.renderOrder = 2; W.group.add(spot);
  const ring = new THREE.Mesh(g.ring, spotMat); ring.renderOrder = 2; W.group.add(ring);
  const RAD = o.radius || 2.4;
  // largo de cada tramo
  const segs = path.map((p, i) => { const q = path[(i + 1) % path.length]; return Math.hypot(q[0] - p[0], q[2] - p[2]); });
  const loop = path.length > 2;
  const D = {
    kind: 'drone', path, speed, seg: 0, f: 0, dir: 1, x: path[0][0], y: path[0][1], z: path[0][2], sx: 0, sz: 0, gy: 0,
    meter: 0, alarmT: 0, alarms: 0, t: Math.random() * 5, grp, eyeMat, spotMat, coneMat,
    reset() { D.seg = 0; D.f = 0; D.dir = 1; D.meter = 0; D.alarmT = 0; },
    update(dt, P) {
      const sp = speed * ctx.diff().drone;
      D.t += dt;
      // avanzar por el recorrido (bucle o ida y vuelta)
      const n = path.length;
      let rem = sp * dt;
      for (let guard = 0; guard < 4 && rem > 0; guard++) {
        const i = D.seg, j = loop ? (i + 1) % n : (D.dir > 0 ? i + 1 : i - 1);
        const a = path[i], b = path[j], L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        const left = (1 - D.f) * L;
        if (rem < left) { D.f += rem / L; rem = 0; }
        else { rem -= left; D.f = 0; D.seg = j; if (!loop && (j === n - 1 || j === 0)) D.dir = j === 0 ? 1 : -1; }
      }
      void segs;
      const i = D.seg, j = loop ? (i + 1) % n : (D.dir > 0 ? Math.min(n - 1, i + 1) : Math.max(0, i - 1));
      const a = path[i], b = path[j];
      D.x = a[0] + (b[0] - a[0]) * D.f; D.z = a[2] + (b[2] - a[2]) * D.f;
      D.y = a[1] + Math.sin(D.t * 1.7) * 0.25;
      const hx = b[0] - a[0], hz = b[2] - a[2], hl = Math.hypot(hx, hz) || 1;
      grp.position.set(D.x, D.y, D.z);
      grp.rotation.y = Math.atan2(hx, hz);
      grp.rotation.z = Math.sin(D.t * 2.3) * 0.06;
      // foco: barre en perpendicular al rumbo
      const sw = Math.sin(D.t * 1.25) * 2.4;
      D.sx = D.x + (-hz / hl) * sw; D.sz = D.z + (hx / hl) * sw;
      let gy = groundBelow(W.grid.near(D.sz), D.sx, D.sz, D.y - 0.6);
      if (!isFinite(gy)) gy = D.y - 9;
      D.gy = gy;
      spot.position.set(D.sx, gy + 0.04, D.sz); spot.scale.setScalar(RAD); ring.position.copy(spot.position); ring.scale.setScalar(RAD);
      // cono desde el dron hasta el foco
      _v.set(D.x - D.sx, D.y - 0.3 - gy, D.z - D.sz);
      const len = _v.length(); _v.multiplyScalar(1 / len);
      cone.position.set(D.x, D.y - 0.3, D.z); _q.setFromUnitVectors(_u, _v); cone.quaternion.copy(_q); cone.scale.set(RAD, len, RAD);
      // detección
      if (D.alarmT > 0) D.alarmT -= dt;
      let inside = false;
      if (P && P.alive && D.alarmT <= 0) {
        const p = P.body.pos;
        if (Math.hypot(p.x - D.sx, p.z - D.sz) < RAD && p.y > gy - 1.2 && p.y < gy + 3 && !P.sliding) {
          inside = !blocked(W.grid.near(p.z), D.x, D.y - 0.4, D.z, p.x, p.y + 1.2, p.z);
        }
      }
      if (inside) D.meter += dt / ctx.diff().detect; else D.meter = Math.max(0, D.meter - dt * 0.9);
      if (D.meter >= 1) { D.meter = 0; D.alarmT = 4; D.alarms++; ctx.alarm(D); }
      const k = D.alarmT > 0 ? 1 : D.meter;
      spotMat.color.setRGB(1, 0.94 - k * 0.74, 0.69 - k * 0.6); spotMat.opacity = 0.22 + k * 0.25;
      coneMat.color.copy(spotMat.color);
      eyeMat.color.copy(spotMat.color);
      if (inside && D.meter > 0.05) ctx.sfx.scan();
    },
    dispose() { eyeMat.dispose(); coneMat.dispose(); spotMat.dispose(); },
  };
  return D;
}

/* ======================= barrera móvil ======================= */
export function makeBarrier(ctx, W, o) {
  const g = G(), mats = ctx.mats;
  const barMat = new THREE.MeshBasicMaterial({ color: 0xff4a2a, toneMapped: false });
  const bar = new THREE.Mesh(g.bar, barMat); W.group.add(bar);
  const glow = new THREE.Mesh(g.bar, mats.glowAdd); glow.userData.glow = 1; W.group.add(glow);
  const along = o.axis === 'x';
  const Bz = {
    kind: 'barrier', id: o.id, mode: o.mode, x: o.x, y: o.y, z: o.z, w: o.w, t: o.phase || 0, by: 0, bz: o.z, bx: o.x, hits: 0, cool: 0,
    reset() { Bz.t = o.phase || 0; Bz.cool = 0; },
    update(dt, P) {
      Bz.t += dt * (o.speed || 1) * ctx.diff().barrier;
      if (o.mode === 'lift') { Bz.by = o.y + 0.25 + (Math.sin(Bz.t * 1.6) + 1) / 2 * 1.9; Bz.bz = o.z; Bz.bx = o.x; }
      else { Bz.by = o.y + 1.12; const off = Math.sin(Bz.t * 1.1) * (o.range || 3); if (along) { Bz.bz = o.z + off; Bz.bx = o.x; } else { Bz.bx = o.x + off; Bz.bz = o.z; } }
      const th = 0.24;
      bar.position.set(Bz.bx, Bz.by + th / 2, Bz.bz);
      bar.scale.set(along ? o.w : 0.16, th, along ? 0.16 : o.w);
      glow.position.copy(bar.position); glow.scale.set(along ? o.w : 0.7, 0.75, along ? 0.7 : o.w);
      const pulse = 0.75 + Math.sin(W.time * 18) * 0.25;
      barMat.color.setRGB(1, 0.3 * pulse, 0.16);
      if (Bz.cool > 0) Bz.cool -= dt;
      if (P && P.alive && Bz.cool <= 0 && P.inv <= 0) {
        const p = P.body.pos, r = P.body.r;
        const x0 = along ? o.x - o.w / 2 : Bz.bx - 0.12, x1 = along ? o.x + o.w / 2 : Bz.bx + 0.12;
        const z0 = along ? Bz.bz - 0.12 : o.z - o.w / 2, z1 = along ? Bz.bz + 0.12 : o.z + o.w / 2;
        if (p.x + r > x0 && p.x - r < x1 && p.z + r > z0 && p.z - r < z1 && p.y < Bz.by + th && p.y + P.body.h > Bz.by) {
          Bz.cool = 1; Bz.hits++;
          const vz = P.body.vel.z, vx = P.body.vel.x;
          ctx.hit('barrier', along ? 0 : -Math.sign(vx || 1), along ? -Math.sign(vz || -1) : 0, 5);
        }
      }
    },
    dispose() { barMat.dispose(); },
  };
  return Bz;
}

/* ======================= torreta no letal ======================= */
export function makeTurret(ctx, W, x, y, z) {
  const g = G(), mats = ctx.mats;
  const base = new THREE.Mesh(g.turret, mats.prop); base.position.set(x, y, z); base.castShadow = true; W.group.add(base);
  const head = new THREE.Group(); head.position.set(x, y + 1.45, z); W.group.add(head);
  const hm = new THREE.Mesh(g.head, mats.prop); hm.castShadow = true; head.add(hm);
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false });
  const laser = new THREE.Mesh(g.bar, laserMat); laser.visible = false; W.group.add(laser);
  const shots = [0, 1, 2].map(() => { const m = new THREE.Mesh(g.ball, mats.beamRed); m.visible = false; W.group.add(m); return { m, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }; });
  const RANGE = 19.5, SPEED = 20;
  const T = {
    kind: 'turret', x, y, z, state: 'idle', t: 0, yaw: 0, fired: 0, shots,
    reset() { T.state = 'idle'; T.t = 0; laser.visible = false; for (const s of shots) { s.on = false; s.m.visible = false; } },
    update(dt, P) {
      const mx = x, my = y + 1.45, mz = z;
      let see = false, px = 0, py = 0, pz = 0;
      if (P && P.alive) {
        const p = P.body.pos; px = p.x; py = p.y + (P.sliding ? 0.5 : 1.1); pz = p.z;
        const d = Math.hypot(px - mx, py - my, pz - mz);
        see = d < RANGE && !blocked(W.grid.near((mz + pz) / 2), mx, my + 0.2, mz, px, py, pz);
      }
      if (see) { const want = Math.atan2(px - mx, pz - mz); let dd = want - T.yaw; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); T.yaw += dd * Math.min(1, dt * 7); }
      else T.yaw += dt * 0.4;
      head.rotation.y = T.yaw;
      const warn = ctx.diff().turretWarn;
      if (T.state === 'idle') { laser.visible = false; if (see) { T.state = 'aim'; T.t = 0; ctx.sfx.turretLock(); } }
      else if (T.state === 'aim') {
        T.t += dt;
        if (!see) { T.state = 'idle'; laser.visible = false; }
        else {
          // mira telegrafiada: amarillo → rojo; parpadea al final
          const k = Math.min(1, T.t / warn);
          laser.visible = !(k > 0.8 && Math.sin(T.t * 50) > 0);
          const dx = px - mx, dy = py - my, dz = pz - mz, L = Math.hypot(dx, dy, dz);
          laser.position.set(mx + dx / 2, my + dy / 2, mz + dz / 2);
          _v.set(dx / L, dy / L, dz / L); _q.setFromUnitVectors(_u, _v); laser.quaternion.copy(_q);
          laser.scale.set(0.035 + k * 0.03, L, 0.035 + k * 0.03);
          laserMat.color.setRGB(1, 0.82 - k * 0.7, 0.23 - k * 0.1);
          if (T.t >= warn) {
            const s = shots.find(q => !q.on);
            if (s) {
              const lead = Math.min(0.35, L / SPEED);
              const tx = px + P.body.vel.x * lead, ty = py, tz = pz + P.body.vel.z * lead;
              const ex = tx - mx, ey = ty - my, ez = tz - mz, el = Math.hypot(ex, ey, ez) || 1;
              s.on = true; s.x = mx; s.y = my; s.z = mz; s.vx = ex / el * SPEED; s.vy = ey / el * SPEED; s.vz = ez / el * SPEED; s.life = 2.4; s.m.visible = true;
              T.fired++; ctx.sfx.turretFire();
            }
            T.state = 'cd'; T.t = 0; laser.visible = false;
          }
        }
      } else if (T.state === 'cd') { T.t += dt; if (T.t > 1.5) T.state = 'idle'; }
      for (const s of shots) {
        if (!s.on) continue;
        s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.life -= dt;
        s.m.position.set(s.x, s.y, s.z); s.m.rotation.y += dt * 9;
        if (s.life <= 0) { s.on = false; s.m.visible = false; continue; }
        if (P && P.alive && P.inv <= 0) {
          const d = capsuleDist(P, s.x, s.y, s.z), top = P.body.pos.y + P.body.h;
          if (d < 0.6 && s.y < top + 0.2) {
            s.on = false; s.m.visible = false;
            const l = Math.hypot(s.vx, s.vz) || 1;
            ctx.hit('turret', s.vx / l, s.vz / l, 4.5);
            continue;
          }
        }
        // choca con paredes/techos
        const cs = W.grid.near(s.z);
        for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (c.on && c.tag !== 'ghost' && s.x > c.x0 && s.x < c.x1 && s.y > c.y0 && s.y < c.y1 && s.z > c.z0 && s.z < c.z1) { s.on = false; s.m.visible = false; ctx.fx.burst(s.x, s.y, s.z, 0xff5a3a, 6, 2); break; } }
      }
    },
    dispose() { laserMat.dispose(); },
  };
  return T;
}
