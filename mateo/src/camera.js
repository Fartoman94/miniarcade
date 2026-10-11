// Mateo: Ciudad de Altura — director de cámara en tercera persona (V2). Brazo con resorte sobre el hombro derecho:
// pivote = pies + altura + hombro; la distancia sale de un barrido de esfera (physics.sphereCast) contra fachadas,
// parapetos y equipos (se acerca en el acto y se aleja suave). Al final la cámara se empuja fuera de cualquier sólido
// (postes y árboles incluidos), así nunca se ve el interior de una pared. Lo que igual tape a Mateo (postes, árboles,
// balcones, toldos) se "tramará" con el recorte de oclusión (occlusion.js) sólo mientras lo tape.
// Estados: caminar, aire, pared, cable, interior (distancia corta y pitch acotado) y charla. Zoom (rueda / pellizco /
// ajuste), FOV base configurable y FOV por velocidad (desactivable con movimiento reducido), auto-alineación opcional.
import * as THREE from 'three';
import { clamp, damp, dampAngle } from './util.js';

/** parámetros por estado: distancia, altura del pivote, hombro, delta de FOV */
export const CAM_MODES = {
  walk: { dist: 3.7, height: 1.45, shoulder: 0.42, fov: 0 },
  air: { dist: 4.2, height: 1.45, shoulder: 0.35, fov: 2 },
  wall: { dist: 4.4, height: 1.4, shoulder: 0.0, fov: 2 },
  swing: { dist: 5.4, height: 1.6, shoulder: 0.2, fov: 4 },
  interior: { dist: 2.9, height: 1.4, shoulder: 0.38, fov: -4 },
  talk: { dist: 2.7, height: 1.4, shoulder: 0.55, fov: -6 },
  car: { dist: 6.0, height: 1.9, shoulder: 0.0, fov: 4 }, // V2 P2: cámara de persecución del kart
};
const CAST_R = 0.3;      // radio del barrido (mayor que el plano cercano: 0,1 m × FOV ≈ 0,12 m)
const NEAR_R = 0.18;     // radio con el que se empuja la cámara fuera de sólidos
const MIN_DIST = 0.75;
const castFilter = b => b.kind !== 'pole' && b.kind !== 'tree' && b.kind !== 'curb' && b.kind !== 'fence' && b.kind !== 'trampoline';
const solidFilter = b => b.kind !== 'curb' && b.kind !== 'trampoline';
const occFilter = b => b.kind !== 'curb';

export function createCamera(camera, world, settings, opts = {}) {
  const interiors = opts.interiors || [];
  const extra = opts.camWorld || null; // toldos/balcones: sólo bloquean a la cámara
  const cast = (ox, oy, oz, dx, dy, dz, far, r, f) => { const a = world.sphereCast(ox, oy, oz, dx, dy, dz, far, r, f), b = extra && extra.sphereCast(ox, oy, oz, dx, dy, dz, far, r); return !a ? b : !b ? a : a.t <= b.t ? a : b; };
  const occ = opts.occlusion || null;
  const C = {
    yaw: Math.PI, pitch: 0.22, dist: CAM_MODES.walk.dist, curDist: CAM_MODES.walk.dist, fov: 60, idle: 0, zoom: 1, zoomT: 1,
    shoulder: CAM_MODES.walk.shoulder, height: CAM_MODES.walk.height, mode: 'walk', interior: null, pushed: false, occluded: 0,
    pos: new THREE.Vector3(), target: new THREE.Vector3(), pivot: new THREE.Vector3(), shake: 0, snap: true,
  };
  const prm = { ...CAM_MODES.walk };
  const _b = new THREE.Vector3();
  function interiorAt(P) {
    for (const it of interiors) if (Math.abs(P.pos.x - it.x) < it.w / 2 + 0.2 && Math.abs(P.pos.z - it.z) < it.d / 2 + 0.2 && P.pos.y > it.y - 0.6 && P.pos.y < it.y + it.h - 1) return it;
    return null;
  }
  return {
    C,
    get yaw() { return C.yaw; }, get pitch() { return C.pitch; }, get cableHold() { return settings().cableMode === 'hold'; },
    look(dx, dy) {
      const s = settings(); const k = 0.0032 * s.sensitivity;
      if (dx || dy) C.idle = 0;
      C.yaw -= dx * k; C.pitch = clamp(C.pitch + dy * k * (s.invertY ? -1 : 1), -0.55, C.interior ? 0.75 : 1.15);
    },
    /** zoom relativo (+ acerca, − aleja); se guarda como multiplicador de distancia 0,7–1,6 */
    zoom(delta) { if (!delta) return; C.zoomT = clamp(C.zoomT * Math.exp(-delta), 0.7, 1.6); C.idle = 0; },
    setZoom(z) { C.zoomT = C.zoom = clamp(z, 0.7, 1.6); },
    snapBehind(yaw) { C.yaw = yaw; C.pitch = 0.22; C.snap = true; },
    /** @param {any} P estado del jugador */
    update(dt, P) {
      const s = settings();
      C.idle += dt;
      const sp = Math.hypot(P.vel.x, P.vel.z), tot = Math.hypot(P.vel.x, P.vel.y, P.vel.z);
      // modo según estado
      C.interior = interiorAt(P);
      C.mode = P.driving ? 'car' : P.talking ? 'talk' : C.interior ? 'interior' : P.state === 'swing' ? 'swing' : P.state === 'wallrun' ? 'wall' : !P.grounded && P.airTime > 0.35 ? 'air' : 'walk';
      const M = CAM_MODES[C.mode], kb = C.snap ? 1e3 : 3.2;
      for (const k of ['dist', 'height', 'shoulder', 'fov']) prm[k] = damp(prm[k], M[k], kb, dt);
      if (C.interior) C.pitch = Math.min(C.pitch, 0.75);
      // auto-alineación detrás del movimiento (si el jugador no toca la cámara)
      if (P.driving) { if (C.idle > 0.8) C.yaw = dampAngle(C.yaw, P.yaw, sp > 0.5 || C.idle > 2 ? 3.2 : 0.8, dt); C.pitch = damp(C.pitch, 0.2, C.idle > 0.8 ? 2 : 0, dt); } // persecución: detrás del kart
      else if (s.autoCam && C.idle > 2.2 && sp > 3 && P.state !== 'wallrun' && !C.interior) C.yaw = dampAngle(C.yaw, Math.atan2(P.vel.x, P.vel.z), 1.2, dt);
      const dyn = s.reducedMotion ? 0 : 1, portrait = camera.aspect < 0.8;
      C.zoom = damp(C.zoom, C.zoomT, 10, dt);
      const want = (prm.dist + Math.min(1.6, tot * 0.055) * dyn + (portrait ? 0.9 : 0)) * (C.interior ? Math.min(1, C.zoom) : C.zoom);
      C.dist = C.snap ? want : damp(C.dist, want, 3, dt);
      // objetivo: pies + altura (la altura se suaviza; saltos grandes o teletransportes la ajustan de golpe)
      const ty = P.pos.y + prm.height + (P.state === 'swing' ? 0.2 : 0);
      const jump = Math.hypot(P.pos.x - C.target.x, P.pos.z - C.target.z) > 6 || Math.abs(C.target.y - ty) > 3;
      if (jump) C.snap = true;
      C.target.set(P.pos.x, C.snap ? ty : damp(C.target.y, ty, 14, dt), P.pos.z);
      // hombro: barrido desde la cabeza hacia la derecha de la cámara para no meter el pivote en una pared
      const rx = -Math.cos(C.yaw), rz = Math.sin(C.yaw);
      const sh = prm.shoulder * (portrait ? 0.4 : 1);
      let shFree = sh;
      if (sh > 0.01) { const h = cast(C.target.x, C.target.y, C.target.z, rx, 0, rz, sh, 0.22, castFilter); if (h) shFree = Math.max(0, h.t - 0.02); }
      C.shoulder = shFree < C.shoulder || C.snap ? shFree : damp(C.shoulder, shFree, 4, dt);
      C.pivot.set(C.target.x + rx * C.shoulder, C.target.y, C.target.z + rz * C.shoulder);
      // brazo: barrido de esfera desde el pivote hacia atrás
      // si atrás hay una pared muy cerca (Mateo de espaldas a la fachada) el brazo sube por encima de la cabeza
      let lastHit = null;
      const arm = pitch => { const cp = Math.cos(pitch), dx = -Math.sin(C.yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(C.yaw) * cp; const h = cast(C.pivot.x, C.pivot.y, C.pivot.z, dx, dy, dz, C.dist, CAST_R, castFilter); lastHit = h; return h ? h.t : C.dist; };
      let lift = 0, free = arm(C.pitch);
      const baseHit = lastHit;
      // pared pegada atrás: el brazo se desliza a lo largo de la pared (vista de perfil) si el jugador no está girando
      if (baseHit && baseHit.inside) { // el pivote ya roza la caja: normal = cara más cercana en planta
        const b = baseHit.box, px = C.pivot.x, pz = C.pivot.z, e = [px - b.minX, b.maxX - px, pz - b.minZ, b.maxZ - pz], m = Math.min(...e), i = e.indexOf(m);
        baseHit.nx = i === 0 ? -1 : i === 1 ? 1 : 0; baseHit.nz = i === 2 ? -1 : i === 3 ? 1 : 0; baseHit.ny = 0;
      }
      if (free < 1.3 && baseHit && Math.abs(baseHit.ny) < 0.5 && C.idle > 0.3 && C.dist > 1.6) {
        const nx = baseHit.nx, nz = baseHit.nz, ax = -Math.sin(C.yaw), az = -Math.cos(C.yaw), dn = ax * nx + az * nz;
        let tx = ax - nx * dn, tz = az - nz * dn; const tl = Math.hypot(tx, tz);
        if (tl < 0.05) { tx = -nz; tz = nx; } else { tx /= tl; tz /= tl; }
        // si Mateo se mueve, el brazo queda detrás del movimiento (coincide con la auto-alineación, no pelean)
        if (sp > 1 && tx * P.vel.x + tz * P.vel.z > 0) { tx = -tx; tz = -tz; }
        C.yaw = dampAngle(C.yaw, Math.atan2(-tx, -tz), 3, dt); C.slide = true;
      } else C.slide = false;
      if (free < 1.6 && C.dist > 1.6) for (const add of [0.45, 0.8]) { const p2 = Math.min(1.3, C.pitch + add), f2 = arm(p2); if (f2 > free + 0.4) { free = f2; lift = p2 - C.pitch; } if (free >= 1.6) break; }
      C.lift = C.snap ? lift : damp(C.lift || 0, lift, lift > (C.lift || 0) ? 12 : 2.5, dt);
      const pe = C.pitch + C.lift;
      const cp = Math.cos(pe), dirx = -Math.sin(C.yaw) * cp, diry = Math.sin(pe), dirz = -Math.cos(C.yaw) * cp;
      if (Math.abs(C.lift - lift) > 0.02) free = arm(pe);
      free = Math.max(Math.min(MIN_DIST, C.dist), free);
      C.curDist = free < C.curDist || C.snap ? free : damp(C.curDist, free, 3.5, dt);
      C.pos.set(C.pivot.x + dirx * C.curDist, C.pivot.y + diry * C.curDist, C.pivot.z + dirz * C.curDist);
      // piso: nunca por debajo del suelo que haya bajo la cámara
      const gy = world.groundAt(C.pos.x, C.pos.z, C.pos.y + 0.5);
      if (C.pos.y < gy + 0.35) C.pos.y = gy + 0.35;
      // última defensa: fuera de cualquier sólido (incluye postes/árboles que el brazo ignora a propósito)
      C.pushed = world.pushOut(C.pos, NEAR_R, solidFilter);
      if (extra && extra.pushOut(C.pos, NEAR_R)) C.pushed = true;
      if (C.pushed) world.pushOut(C.pos, NEAR_R, solidFilter);
      // nunca dentro de Mateo: si el brazo quedó casi en su eje, la cámara pasa por encima de la cabeza
      const hd = Math.hypot(C.pos.x - P.pos.x, C.pos.z - P.pos.z);
      if (hd < 0.6 && C.pos.y < P.pos.y + 2.2) { C.pos.y = P.pos.y + 2.2 + (0.6 - hd); C.overHead = true; } else C.overHead = false;
      camera.position.copy(C.pos);
      if (C.shake > 0 && !s.reducedMotion) { C.shake = Math.max(0, C.shake - dt * 2); camera.position.x += (Math.random() - 0.5) * C.shake * 0.3; camera.position.y += (Math.random() - 0.5) * C.shake * 0.3; }
      // mirar al pivote: Mateo queda un poco a la izquierda y por debajo del centro (se ve hacia dónde va)
      camera.lookAt(C.pivot.x, C.pivot.y + 0.1 - (portrait ? 0.6 : 0), C.pivot.z); // vertical: Mateo sube hacia el centro (abajo van avisos y botones)
      const fov = (s.fov || 60) + (portrait ? 8 : 0) + prm.fov + Math.min(12, Math.max(0, tot - 6) * 0.6) * dyn;
      C.fov = C.snap ? fov : damp(C.fov, fov, 3, dt);
      if (Math.abs(camera.fov - C.fov) > 0.05) { camera.fov = C.fov; camera.updateProjectionMatrix(); }
      C.snap = false;
      // cono de oclusión: de la cámara a una esfera que envuelve a Mateo (centro a 0,65 m, radio 0,8 m)
      // el tramado sólo se enciende si algo (también postes, árboles y toldos) cruza la línea cámara → Mateo
      if (occ) {
        let blocked = false;
        if (s.occlusionFade !== false) for (const hy of [0.25, 0.7, 1.15]) {
          const dx = P.pos.x - C.pos.x, dy = P.pos.y + hy - C.pos.y, dz = P.pos.z - C.pos.z, L = Math.hypot(dx, dy, dz) - 0.35;
          if (L <= 0) continue;
          const f = world.sphereCast(C.pos.x, C.pos.y, C.pos.z, dx / (L + 0.35), dy / (L + 0.35), dz / (L + 0.35), L, 0.1, occFilter) || (extra && extra.sphereCast(C.pos.x, C.pos.y, C.pos.z, dx / (L + 0.35), dy / (L + 0.35), dz / (L + 0.35), L, 0.1));
          if (f) { blocked = true; break; }
        }
        C.occluded = s.occlusionFade === false ? 0 : blocked ? 0.6 : Math.max(0, C.occluded - dt); // se mantiene 0,6 s para no parpadear
        occ.update(camera.position, _b.set(P.pos.x, P.pos.y + 0.65, P.pos.z), 0.8, C.occluded > 0 ? 1 : 0);
      }
    },
    kick(a) { C.shake = Math.max(C.shake, a); },
  };
}
