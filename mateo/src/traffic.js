// Mateo: Ciudad de Altura — tránsito: autos, furgonetas, taxis y colectivos que circulan por carriles (mano derecha),
// respetan los semáforos sincronizados (frenan en la línea de detención con rojo/amarillo), mantienen distancia con el
// de adelante, ceden el paso a peatones y a Mateo, doblan en los cruces con curvas suaves y nunca salen de la grilla.
// Render: InstancedMesh por tipo (carrocería con color por instancia + detalles), pocos draw calls.
import * as THREE from 'three';
import { Batcher, boxGeo, prep } from './geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './util.js';
import { poolMaterial } from './nightlights.js';

const TYPES = {
  auto: { len: 4.3, wid: 1.85, h: 1.45, vmax: 11, colors: [0xc0392b, 0x2f6db0, 0xe8e8e8, 0x2a2a2a, 0x7f8c8d, 0x27ae60, 0xf1c40f, 0x8e44ad] },
  taxi: { len: 4.4, wid: 1.85, h: 1.5, vmax: 11.5, colors: [0xf2c230] },
  furgon: { len: 5.2, wid: 2.05, h: 2.3, vmax: 9.5, colors: [0xf4f4f4, 0x3a6fa0, 0xd35400, 0x95a5a6] },
  colectivo: { len: 10.5, wid: 2.5, h: 3.1, vmax: 8.5, colors: [0x1a73a8, 0xe67e22] },
};

function carGeos(type) {
  const T = TYPES[type], L = T.len, W = T.wid, H = T.h;
  const body = [], det = new Batcher();
  const bodyMain = (w, h, d, x, y, z) => { const g = boxGeo(w, h, d, { tile: [1, 1] }); g.translate(x, y, z); body.push(g); };
  if (type === 'colectivo') {
    bodyMain(W, H - 0.5, L, 0, 0.35 + (H - 0.5) / 2, 0);
    for (const s of [-1, 1]) det.box('d', 0.03, 0.9, L * 0.82, s * (W / 2 + 0.01), H - 1.0, -0.2, { color: 0x1e2a36 });
    det.box('d', W * 0.9, 1.1, 0.03, 0, H - 1.0, L / 2 + 0.01, { color: 0x1e2a36 });
    det.box('d', W * 0.6, 0.35, 0.05, 0, H - 0.25, L / 2 + 0.02, { color: 0xffd34a });
  } else {
    bodyMain(W, H * 0.45, L, 0, 0.32 + H * 0.225, 0);
    const cl = type === 'furgon' ? L * 0.72 : L * 0.5, cz = type === 'furgon' ? -L * 0.1 : -L * 0.05;
    bodyMain(W * 0.92, H * 0.42, cl, 0, 0.32 + H * 0.45 + H * 0.21, cz);
    for (const s of [-1, 1]) det.box('d', 0.03, H * 0.3, cl * 0.86, s * (W * 0.46 + 0.01), 0.32 + H * 0.66, cz, { color: 0x1e2a36 });
    det.box('d', W * 0.84, H * 0.32, 0.03, 0, 0.32 + H * 0.66, cz + cl / 2 + 0.01, { color: 0x24323f });
    det.box('d', W * 0.84, H * 0.3, 0.03, 0, 0.32 + H * 0.66, cz - cl / 2 - 0.01, { color: 0x24323f });
    if (type === 'taxi') det.box('d', 0.6, 0.22, 0.3, 0, 0.32 + H * 0.9, cz, { color: 0xffffff });
  }
  for (const s of [-1, 1]) { det.box('d', 0.32, 0.18, 0.04, s * W * 0.35, 0.55, L / 2 + 0.01, { color: 0xfff6c8 }); det.box('d', 0.3, 0.16, 0.04, s * W * 0.35, 0.6, -L / 2 - 0.01, { color: 0xd02020 }); }
  det.box('d', W * 1.01, 0.14, L * 0.98, 0, 0.36, 0, { color: 0x222222 });
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) det.add('d', prep(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12).rotateZ(Math.PI / 2), 0x151515), [sx * (W / 2 - 0.1), 0.34, sz * L * 0.32]);
  const bg = mergeGeometries(body, false);
  const dg = mergeGeometries(det.map.get('d'), false);
  return { body: bg, det: dg };
}

export function createTraffic(scene, city, count, { sfx }) {
  const rand = rng(4242);
  const R = city.roads, RW = city.roadWidth, LANE = city.laneOffset, LIM = city.half;
  const group = new THREE.Group(); group.name = 'transito'; scene.add(group);
  const kinds = ['auto', 'auto', 'auto', 'taxi', 'furgon', 'auto', 'colectivo', 'auto', 'taxi', 'furgon'];
  const MAXC = 30;
  const meshes = {};
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4 });
  const detMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  for (const t of Object.keys(TYPES)) {
    const g = carGeos(t);
    const b = new THREE.InstancedMesh(g.body, bodyMat, MAXC), d = new THREE.InstancedMesh(g.det, detMat, MAXC);
    b.instanceMatrix.setUsage(THREE.DynamicDrawUsage); d.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    b.count = d.count = 0; b.castShadow = true; b.frustumCulled = d.frustumCulled = false;
    b.setColorAt(0, new THREE.Color());
    group.add(b, d); meshes[t] = { b, d, n: 0 };
  }
  // V2 P2: faros y luces traseras (material propio: de noche brillan) y charco de luz delante de cada auto de noche
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  for (const t of Object.keys(TYPES)) {
    const T = TYPES[t], lb = new Batcher();
    for (const s of [-1, 1]) { lb.box('l', 0.3, 0.16, 0.03, s * T.wid * 0.35, 0.55, T.len / 2 + 0.035, { color: 0xfff3c0 }); lb.box('l', 0.28, 0.14, 0.03, s * T.wid * 0.35, 0.6, -T.len / 2 - 0.035, { color: 0xff2a2a }); }
    const lm = new THREE.InstancedMesh(mergeGeometries(lb.map.get('l'), false), lightMat, MAXC);
    lm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); lm.count = 0; lm.frustumCulled = false; group.add(lm); meshes[t].l = lm;
  }
  const poolMat = poolMaterial(0xfff0c8);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.4, 7).rotateX(-Math.PI / 2), poolMat, MAXC);
  pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pools.count = 0; pools.frustumCulled = false; pools.visible = false; pools.renderOrder = 2; group.add(pools);
  let night = 0, base = count, factor = 1, densAcc = 0;
  const cars = [];
  const roadIdx = v => R.findIndex(r => Math.abs(r - v) < 0.5);

  function spawnCar(i) {
    const type = kinds[i % kinds.length], T = TYPES[type];
    const axis = rand() < 0.5 ? 'x' : 'z', line = R[1 + Math.floor(rand() * (R.length - 2))], dir = rand() < 0.5 ? 1 : -1;
    const s = (rand() - 0.5) * 2 * (LIM - 20);
    // V2: sin aparecer encimado a otro auto (antes podía nacer dentro de otro)
    let s2 = s;
    for (let k = 0; k < 30; k++) { const tx = axis === 'z' ? line - dir * LANE : s2, tz = axis === 'z' ? s2 : line + dir * LANE; if (!cars.some(o => Math.hypot(o.x - tx, o.z - tz) < 12)) break; s2 = (rand() - 0.5) * 2 * (LIM - 20); }
    const c = { id: i, type, T, axis, line, dir, s: s2, v: T.vmax * 0.6, color: T.colors[Math.floor(rand() * T.colors.length)], mode: 'lane', turn: null, x: 0, z: 0, yaw: 0, waitT: 0, honkT: 0, stopped: false, active: true };
    place(c); cars.push(c); return c;
  }
  function place(c) {
    if (c.axis === 'z') { c.x = c.line - c.dir * LANE; c.z = c.s; c.yaw = c.dir > 0 ? 0 : Math.PI; }
    else { c.x = c.s; c.z = c.line + c.dir * LANE; c.yaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  }
  /** próximo cruce hacia adelante (coordenada en el eje) */
  function nextInt(c) {
    let best = null;
    for (const r of R) { const d = (r - c.s) * c.dir; if (d > RW / 2 - 0.5 && (best === null || d < (best - c.s) * c.dir)) best = r; }
    return best;
  }
  function chooseTurn(c, si) {
    // opciones: seguir, derecha, izquierda (sin salir de la grilla)
    const opts = [];
    const ahead = si + c.dir * 64;
    if (Math.abs(ahead) <= LIM + 1) opts.push('straight', 'straight', 'straight');
    // derecha/izquierda: nuevo eje perpendicular sobre la calle que cruza en si
    const rightDir = c.axis === 'z' ? -c.dir : c.dir; // girar a la derecha en z+ va hacia x-
    const leftDir = -rightDir;
    const along = c.line; // nueva coordenada s inicial
    if (Math.abs(along + rightDir * 64) <= LIM + 1 || true) opts.push('right');
    if (Math.abs(along + leftDir * 64) <= LIM + 1 || true) opts.push('left');
    let o = opts[Math.floor(rand() * opts.length)];
    const nd = o === 'right' ? rightDir : o === 'left' ? leftDir : c.dir;
    if (o !== 'straight' && Math.abs(along + nd * 30) > LIM) o = opts.includes('straight') ? 'straight' : (o === 'right' ? 'left' : 'right');
    return o;
  }
  function startTurn(c, si, kind) {
    const newAxis = c.axis === 'z' ? 'x' : 'z';
    const rightDir = c.axis === 'z' ? -c.dir : c.dir, nd = kind === 'right' ? rightDir : -rightDir;
    // puntos: entrada (borde del cruce), esquina (intersección de carriles), salida
    const entry = lanePoint(c.axis, c.line, c.dir, si - c.dir * RW / 2);
    const newLine = si, newS0 = c.line;
    const exit = lanePoint(newAxis, newLine, nd, newS0 + nd * RW / 2);
    const corner = c.axis === 'z' ? { x: entry.x, z: exit.z } : { x: exit.x, z: entry.z };
    c.mode = 'turn'; c.turn = { p0: entry, p1: corner, p2: exit, u: 0, len: Math.hypot(corner.x - entry.x, corner.z - entry.z) + Math.hypot(exit.x - corner.x, exit.z - corner.z), newAxis, newLine, nd, newS: newS0 + nd * RW / 2 };
  }
  function exitPoint(c, si, kind) { const newAxis = c.axis === 'z' ? 'x' : 'z', rightDir = c.axis === 'z' ? -c.dir : c.dir, nd = kind === 'right' ? rightDir : -rightDir, s0 = c.line + nd * (RW / 2 + 2); return { ...lanePoint(newAxis, si, nd, s0), axis: newAxis, line: si, dir: nd, s: s0 }; }
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function lanePoint(axis, line, dir, s) { return axis === 'z' ? { x: line - dir * LANE, z: s } : { x: s, z: line + dir * LANE }; }

  for (let i = 0; i < count; i++) spawnCar(i);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0);
  let peds = [], pedFn = null;
  // V2: rectángulo orientado de un auto (centro, medio largo, medio ancho, ejes) para medir superposiciones reales
  const obb = c => ({ x: c.x, z: c.z, fx: Math.sin(c.yaw), fz: Math.cos(c.yaw), hl: c.T.len / 2, hw: c.T.wid / 2 });
  function overlap(a, b) {
    const axes = [[a.fx, a.fz], [a.fz, -a.fx], [b.fx, b.fz], [b.fz, -b.fx]], dx = b.x - a.x, dz = b.z - a.z;
    for (const [ax, az] of axes) {
      const ra = a.hl * Math.abs(a.fx * ax + a.fz * az) + a.hw * Math.abs(a.fz * ax - a.fx * az);
      const rb = b.hl * Math.abs(b.fx * ax + b.fz * az) + b.hw * Math.abs(b.fz * ax - b.fx * az);
      if (Math.abs(dx * ax + dz * az) > ra + rb) return false;
    }
    return true;
  }
  const stats = { pedYields: 0, overlapSteps: 0, maxOverlaps: 0 };
  const api = {
    cars,
    setPeds(list) { if (typeof list === 'function') pedFn = list; else peds = list; },
    stats,
    /** pares de autos superpuestos ahora mismo (rectángulos orientados) */
    overlaps() { const act = cars.filter(c => c.active), o = act.map(obb), out = []; for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) if (Math.hypot(act[i].x - act[j].x, act[i].z - act[j].z) < 12 && overlap(o[i], o[j])) out.push([act[i].id, act[j].id]); return out; },
    setDensity(n) { base = n; while (cars.length < Math.min(MAXC, n)) spawnCar(cars.length); for (let i = 0; i < cars.length; i++) cars[i].active = i < n; },
    /** V2 P2: nivel de noche 0..1 (faros) y factor de densidad por horario (de noche circulan menos autos) */
    setNight(k, densityFactor = 1) { night = k; factor = densityFactor; lightMat.color.setScalar(0.3 + 0.7 * k); poolMat.opacity = 0.3 * k; pools.visible = k > 0.02; },
    get night() { return night; },
    get target() { return Math.max(1, Math.round(base * factor)); },
    update(dt, P, frozen) {
      if (frozen) return;
      // V2 P2: densidad por horario sin «apariciones»: sólo se apaga/enciende un auto lejos de Mateo (> 90 m), uno por segundo
      densAcc += dt;
      if (densAcc > 1 && P) {
        densAcc = 0;
        const act = cars.filter(c => c.active), tgt = api.target, far = c => Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 90;
        if (act.length > tgt) { const c = act.find(far); if (c) c.active = false; }
        else if (act.length < tgt) { const c = cars.slice(0, base).find(c => !c.active && far(c) && !act.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 14)); if (c) c.active = true; }
      }
      if (pedFn) peds = pedFn();
      for (const c of cars) {
        if (!c.active) continue;
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        let vt = c.T.vmax;
        // semáforo y cruce
        if (c.mode === 'lane') {
          const si = nextInt(c);
          if (si !== null) {
            const stopS = si - c.dir * (RW / 2 + 3.8), dStop = (stopS - c.s) * c.dir;
            const go = city.canGo(c.axis) || (city.signal.state === 'yellow' && city.signal.phase === (c.axis === 'z' ? 'A' : 'B') && dStop < 4);
            if (!go && dStop > -0.5 && dStop < 30) vt = Math.min(vt, Math.max(0, (dStop - 0.3) * 0.9));
            if (!c.plan || c.plan.si !== si) c.plan = { si, kind: chooseTurn(c, si) };
            if (c.plan.kind !== 'straight' && (si - c.s) * c.dir <= RW / 2) startTurn(c, si, c.plan.kind);
          }
        }
        // distancia con autos, peatones y Mateo adelante
        const look = 6 + c.v * 1.2 + c.T.len / 2 + 5.3; // V2: antes 6 + v·1,2: a baja velocidad no «veía» a un colectivo detenido adelante y se le metía
        for (const o of cars) {
          if (o === c || !o.active) continue;
          const dx = o.x - c.x, dz = o.z - c.z, al = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
          if (al > 0 && al < look && lat < 2.2) vt = Math.min(vt, Math.max(0, (al - c.T.len / 2 - o.T.len / 2 - 2) * 1.2));
          // V2: conflicto en cruces y giros (rumbos distintos): si en 0,7 s los rectángulos se tocarían, cede el de id
          // mayor (o el que viene detrás de uno detenido) → sin superposiciones y sin bloqueo mutuo
          if (dx * dx + dz * dz < 400 && (o.id < c.id || o.v < 0.3) && Math.abs(wrap(o.yaw - c.yaw)) > 0.3) {
            const t = 0.7, a = obb(c), b = obb(o);
            a.x += fx * c.v * t; a.z += fz * c.v * t; a.hl += 0.6; a.hw += 0.4;
            b.x += Math.sin(o.yaw) * o.v * t; b.z += Math.cos(o.yaw) * o.v * t; b.hl += 0.6; b.hw += 0.4;
            if (overlap(a, b) && !overlap(obb(c), b)) { vt = 0; stats.conflictYields = (stats.conflictYields || 0) + 1; }
          }
        }
        // V2: antes de doblar, el carril de salida tiene que tener lugar (antes el auto doblaba encima del último de la cola)
        if (c.mode === 'lane' && c.plan && c.plan.kind !== 'straight') {
          const ex = c.plan.exit || (c.plan.exit = exitPoint(c, c.plan.si, c.plan.kind)), dEntry = (c.plan.si - c.s) * c.dir - RW / 2;
          const busy = o => o !== c && o.active && ((o.mode === 'lane' && o.axis === ex.axis && o.dir === ex.dir && o.line === ex.line && Math.abs(o.s - ex.s) < c.T.len / 2 + o.T.len / 2 + 1.5)
            || (o.mode === 'turn' && o.turn.newAxis === ex.axis && o.turn.nd === ex.dir && o.turn.newLine === ex.line));
          if (dEntry < 8 && dEntry > -0.5 && cars.some(busy)) vt = Math.min(vt, Math.max(0, (dEntry - 0.5) * 1.2));
        }
        let blockP = false;
        for (const p of peds) {
          const dx = p.x - c.x, dz = p.z - c.z, al = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
          if (al > 0 && al < look && lat < 2.4 + (p.r || 0)) { const v2 = Math.max(0, (al - c.T.len / 2 - 1.5 - (p.r || 0)) * 1.1); if (v2 < vt) { vt = v2; if (v2 < 1) stats.pedYields++; } }
        }
        if (P && P.pos.y < 2.5) {
          const dx = P.pos.x - c.x, dz = P.pos.z - c.z, al = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
          if (al > -1 && al < look && lat < 2.3) { vt = Math.min(vt, Math.max(0, (al - c.T.len / 2 - 1.2) * 1.1)); blockP = al < 8; }
        }
        // empujar a Mateo fuera del auto si se mete adentro (nunca lo atraviesa)
        if (P && P.pos.y < c.T.h + 0.3) {
          const dx = P.pos.x - c.x, dz = P.pos.z - c.z, al = dx * fx + dz * fz, lt = dx * fz - dz * fx;
          if (Math.abs(al) < c.T.len / 2 + 0.3 && Math.abs(lt) < c.T.wid / 2 + 0.3) {
            if (P.pos.y > c.T.h - 0.4 && P.vel.y <= 0) { P.pos.y = c.T.h; P.vel.y = 0; P.grounded = true; P.onCar = c; } // techo del auto
            else { const pushL = (c.T.wid / 2 + 0.32 - Math.abs(lt)) * Math.sign(lt || 1); P.pos.x += fz * pushL; P.pos.z -= fx * pushL; }
          }
        }
        if (blockP) { c.honkT += dt; if (c.honkT > 2.5) { c.honkT = 0; const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z); if (d < 25) sfx.horn(); } } else c.honkT = 0;
        c.v += Math.max(-14 * dt, Math.min(5 * dt, vt - c.v)); c.v = Math.max(0, c.v);
        c.stopped = c.v < 0.2;
        // avance
        if (c.mode === 'lane') {
          c.s += c.dir * c.v * dt; place(c);
          // fuera de la grilla (no debería pasar): reaparecer en una calle lejana
          if (Math.abs(c.s) > LIM + 8) { c.dir = -c.dir; place(c); }
        } else {
          const t = c.turn; t.u = Math.min(1, t.u + c.v * dt / Math.max(1, t.len));
          const u = t.u, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), d = u * u;
          const nx = a * t.p0.x + b * t.p1.x + d * t.p2.x, nz = a * t.p0.z + b * t.p1.z + d * t.p2.z;
          if (Math.hypot(nx - c.x, nz - c.z) > 1e-4) c.yaw = Math.atan2(nx - c.x, nz - c.z);
          c.x = nx; c.z = nz;
          if (u >= 1) { c.mode = 'lane'; c.axis = t.newAxis; c.line = t.newLine; c.dir = t.nd; c.s = t.newS; c.turn = null; c.plan = null; place(c); }
        }
      }
    },
    render() {
      for (const t in meshes) meshes[t].n = 0;
      let np = 0;
      for (const c of cars) {
        if (!c.active) continue;
        const M = meshes[c.type], i = M.n++;
        _m.compose(_p.set(c.x, 0, c.z), _q.setFromAxisAngle(_up, c.yaw), _s);
        M.b.setMatrixAt(i, _m); M.d.setMatrixAt(i, _m); M.l.setMatrixAt(i, _m); M.b.setColorAt(i, _c.setHex(c.color));
        if (night > 0.02) { const f = c.T.len / 2 + 3.6; _m.compose(_p.set(c.x + Math.sin(c.yaw) * f, 0.03, c.z + Math.cos(c.yaw) * f), _q, _s); pools.setMatrixAt(np++, _m); }
      }
      for (const t in meshes) { const M = meshes[t]; M.b.count = M.d.count = M.l.count = M.n; M.b.instanceMatrix.needsUpdate = M.d.instanceMatrix.needsUpdate = M.l.instanceMatrix.needsUpdate = true; if (M.b.instanceColor) M.b.instanceColor.needsUpdate = true; }
      pools.count = np; pools.instanceMatrix.needsUpdate = true;
    },
    info() {
      const act = cars.filter(c => c.active);
      return { count: act.length, stopped: act.filter(c => c.stopped).length, turning: act.filter(c => c.mode === 'turn').length, cars: act.map(c => ({ id: c.id, type: c.type, x: +c.x.toFixed(2), z: +c.z.toFixed(2), v: +c.v.toFixed(2), axis: c.axis, mode: c.mode, line: c.line, dir: c.dir })) };
    },
    /** prueba: ¿algún auto metido dentro de un edificio o fuera de la calzada? */
    audit(world) {
      const bad = [];
      for (const c of cars) if (c.active) { const g = world.groundAt(c.x, c.z, 50); if (g > 0.5) bad.push(c.id); }
      return bad;
    },
  };
  void roadIdx;
  return api;
}
