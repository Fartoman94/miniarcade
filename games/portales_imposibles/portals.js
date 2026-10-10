// @ts-check
/* Portales Imposibles — el par de portales: disparo y validación de superficie, cruce de cuerpos (posición, velocidad,
   mirada), rayos (láser) que atraviesan portales y la vista a través de cada portal.

   Vista a través del portal (decisión documentada en docs/games/portales_imposibles.md):
   - 'medium' y 'high': cada portal visible renderiza la escena una vez más desde una cámara virtual
     (cámara transformada por la matriz A→B) a un render target, con plano cercano oblicuo en el portal de salida
     para que no se dibuje lo que está detrás de la pared. La superficie del portal muestrea ese render target con
     coordenadas de pantalla. Costo: +1 pasada de escena por portal visible (≈ duplica las draw calls con un portal a
     la vista, triplica con los dos). Escala del RT: 0,5 (medium) y 0,85 con HalfFloat (high).
   - 'low': sin render targets: membrana animada (shader) del color del portal. Costo extra: 0 pasadas.
   Recursión: dentro de la vista de un portal, ese mismo portal se dibuja como membrana (evita el bucle de
   realimentación); el otro portal muestra su vista del cuadro anterior (un nivel de «recursión» gratis). */
import { THREE } from '../../matelabs/kit3d.js';
import { makeFrame, xfPoint, xfDir, xfMatrix, toLocal, lookDir, dirToYawPitch } from './portalmath.js';
import { makePortalMesh } from './models.js';
import { PORTAL, PCOL } from './config.js';
import { raycast, boxOverlap, depenetrate } from './physics.js';

const TUNNEL = 1.2;  // profundidad detrás del portal en la que se ignoran paredes
const _l = { x: 0, y: 0, z: 0 }, _o = { x: 0, y: 0, z: 0 }, _o2 = { x: 0, y: 0, z: 0 };

export function createPortals(ctx) {
  const { scene, camera, renderer } = ctx;
  const W = PORTAL.w, H = PORTAL.h;
  /** @typedef {{id:'A'|'B', placed:boolean, F:any, host:any, off:{x:number,y:number,z:number}, ignore:Set<any>, mesh:any, openT:number, rt:any, other:any, visibleRT:boolean, shotCount?:number}} Portal */
  /** @returns {Portal} */
  const mk = id => ({ id, placed: false, F: makeFrame({ x: 0, y: -50, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }), host: null, off: { x: 0, y: 0, z: 0 }, ignore: new Set(), mesh: makePortalMesh(id, W, H), openT: 0, rt: null, other: null, visibleRT: false });
  const A = mk('A'), B = mk('B');
  A.other = B; B.other = A;
  const P = { A, B };
  scene.add(A.mesh.group, B.mesh.group);
  const mAB = new THREE.Matrix4(), mBA = new THREE.Matrix4();
  let rtScale = 0, rtHalf = false;
  const vcam = new THREE.PerspectiveCamera();
  vcam.matrixAutoUpdate = false;
  const linked = () => A.placed && B.placed;
  let shots = 0; // disparos que dejaron un portal (para «sala con dos portales»)

  /* ---------- colocación ---------- */
  /** Calcula un marco válido para un portal sobre la cara `n` de la caja `host`, cerca del punto (hx,hy,hz). */
  function fit(which, host, hx, hy, hz, nx, ny, nz, dir, lists) {
    const n = { x: nx, y: ny, z: nz };
    let up;
    if (Math.abs(ny) > 0.5) {
      // piso o techo: «arriba» del portal = dirección del disparo en horizontal, alineada a un eje
      up = Math.abs(dir.x) > Math.abs(dir.z) ? { x: Math.sign(dir.x) || 1, y: 0, z: 0 } : { x: 0, y: 0, z: Math.sign(dir.z) || 1 };
    } else up = { x: 0, y: 1, z: 0 };
    const F = makeFrame({ x: hx, y: hy, z: hz }, n, up);
    // medias extensiones en ejes del mundo
    const ex = Math.abs(F.r.x) * W / 2 + Math.abs(F.u.x) * H / 2, ey = Math.abs(F.r.y) * W / 2 + Math.abs(F.u.y) * H / 2, ez = Math.abs(F.r.z) * W / 2 + Math.abs(F.u.z) * H / 2;
    const c = { x: hx, y: hy, z: hz };
    // cara del anfitrión
    const lim = [[host.x0, host.x1, ex, 'x'], [host.y0, host.y1, ey, 'y'], [host.z0, host.z1, ez, 'z']];
    for (const [a, b, e, k] of lim) {
      if ((k === 'x' && nx) || (k === 'y' && ny) || (k === 'z' && nz)) continue;
      if (b - a < e * 2 - 1e-3) return { err: 'small' };
      /** @type {any} */ (c)[k] = Math.min(b - e, Math.max(a + e, /** @type {any} */ (c)[k]));
    }
    // plano exacto de la cara
    if (nx) c.x = nx > 0 ? host.x1 : host.x0; if (ny) c.y = ny > 0 ? host.y1 : host.y0; if (nz) c.z = nz > 0 ? host.z1 : host.z0;
    // no superponerse con el otro portal sobre el mismo plano: correrse lo justo
    const o = P[which === 'A' ? 'B' : 'A'];
    if (o.placed && o.host === host && o.F.n.x === nx && o.F.n.y === ny && o.F.n.z === nz) {
      const ov = (k, e) => { const oe = Math.abs(o.F.r[k]) * W / 2 + Math.abs(o.F.u[k]) * H / 2; return { d: c[k] - o.F.p[k], need: e + oe + 0.02 }; };
      const axes = ['x', 'y', 'z'].filter(k => !((k === 'x' && nx) || (k === 'y' && ny) || (k === 'z' && nz)));
      const e2 = { x: ex, y: ey, z: ez };
      const sep = axes.some(k => { const v = ov(k, e2[k]); return Math.abs(v.d) >= v.need; });
      if (!sep) {
        // empujar sobre el eje de menor corrección que quede dentro de la cara
        let done = false;
        for (const k of axes.slice().sort((a, b) => (ov(a, e2[a]).need - Math.abs(ov(a, e2[a]).d)) - (ov(b, e2[b]).need - Math.abs(ov(b, e2[b]).d)))) {
          const v = ov(k, e2[k]), s = v.d >= 0 ? 1 : -1, want = o.F.p[k] + s * v.need;
          const a = k === 'x' ? host.x0 : k === 'y' ? host.y0 : host.z0, b = k === 'x' ? host.x1 : k === 'y' ? host.y1 : host.z1;
          if (want - e2[k] >= a - 1e-3 && want + e2[k] <= b + 1e-3) { c[k] = want; done = true; break; }
          const alt = o.F.p[k] - s * v.need;
          if (alt - e2[k] >= a - 1e-3 && alt + e2[k] <= b + 1e-3) { c[k] = alt; done = true; break; }
        }
        if (!done) return { err: 'overlap' };
      }
    }
    // nada sólido delante del portal (repisas, pedestales, puertas)
    const front = { x0: c.x - ex + 0.04, x1: c.x + ex - 0.04, y0: c.y - ey + 0.04, y1: c.y + ey - 0.04, z0: c.z - ez + 0.04, z1: c.z + ez - 0.04 };
    if (nx) { front.x0 = nx > 0 ? c.x + 0.01 : c.x - 0.3; front.x1 = nx > 0 ? c.x + 0.3 : c.x - 0.01; }
    if (ny) { front.y0 = ny > 0 ? c.y + 0.01 : c.y - 0.3; front.y1 = ny > 0 ? c.y + 0.3 : c.y - 0.01; }
    if (nz) { front.z0 = nz > 0 ? c.z + 0.01 : c.z - 0.3; front.z1 = nz > 0 ? c.z + 0.3 : c.z - 0.01; }
    for (const L of lists) for (const b of L) {
      if (!b.on || b === host || b.mat === 'trigger' || b.mat === 'grate' || b.mat === 'barrier' || b.cube || b.mat === 'player' || b.mat === 'sphere' || b.mat === 'turret') continue;
      if (boxOverlap(front, b)) return { err: 'blocked' };
    }
    return { F: makeFrame(c, n, up) };
  }

  /** Dispara un portal desde `o` en dirección `d`. Devuelve {ok, err?, x,y,z}. */
  function shoot(which, o, d, lists) {
    // el disparo atraviesa rejillas, campos y disparadores; se detiene en todo lo demás
    const h = raycast(o.x, o.y, o.z, d.x, d.y, d.z, 80, lists, c => c.mat === 'grate' || c.mat === 'trigger' || c.mat === 'field' || c.mat === 'barrier' || c.mat === 'player' || c.mat === 'sphere' || c.mat === 'turret');
    if (!h || !h.box) return { ok: false, err: 'none', x: o.x + d.x * 30, y: o.y + d.y * 30, z: o.z + d.z * 30 };
    const box = h.box, x = h.x, y = h.y, z = h.z, nx = h.nx, ny = h.ny, nz = h.nz;
    if (box.mat !== 'white') return { ok: false, err: box.mat === 'glass' ? 'glass' : 'surface', x, y, z, nx, ny, nz };
    const f = fit(which, box, x, y, z, nx, ny, nz, d, lists);
    if (!f.F) return { ok: false, err: f.err, x, y, z, nx, ny, nz };
    place(which, box, f.F);
    shots++;
    return { ok: true, x, y, z, nx, ny, nz };
  }
  /** Coloca un portal con un marco ya validado (lo usan el disparo y los ganchos de prueba). */
  function place(which, host, F) {
    const p = P[which];
    p.placed = true; p.F = F; p.host = host;
    p.off = { x: F.p.x - host.x0, y: F.p.y - host.y0, z: F.p.z - host.z0 };
    p.openT = 0;
    const g = p.mesh.group;
    g.visible = true;
    syncMesh(p);
    computeIgnore(p, ctx.lists());
    linkChanged();
  }
  function syncMesh(p) {
    const g = p.mesh.group, F = p.F;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(F.r.x, F.r.y, F.r.z), new THREE.Vector3(F.u.x, F.u.y, F.u.z), new THREE.Vector3(F.n.x, F.n.y, F.n.z));
    g.quaternion.setFromRotationMatrix(m);
    g.position.set(F.p.x, F.p.y, F.p.z);
    g.updateMatrixWorld(true);
  }
  function linkChanged() {
    const l = linked();
    A.mesh.uni.linked.value = B.mesh.uni.linked.value = l ? 1 : 0;
    if (l) { xfMatrix(A.F, B.F, mAB.elements); xfMatrix(B.F, A.F, mBA.elements); }
  }
  /** Cajas detrás del portal (enteramente detrás del plano y dentro del túnel) que se ignoran al cruzar. */
  function computeIgnore(p, lists) {
    p.ignore.clear();
    const F = p.F, n = F.n;
    const ex = Math.abs(F.r.x) * W / 2 + Math.abs(F.u.x) * H / 2, ey = Math.abs(F.r.y) * W / 2 + Math.abs(F.u.y) * H / 2, ez = Math.abs(F.r.z) * W / 2 + Math.abs(F.u.z) * H / 2;
    const t = { x0: F.p.x - ex, x1: F.p.x + ex, y0: F.p.y - ey, y1: F.p.y + ey, z0: F.p.z - ez, z1: F.p.z + ez };
    if (n.x > 0.5) { t.x0 = F.p.x - TUNNEL; t.x1 = F.p.x; } else if (n.x < -0.5) { t.x0 = F.p.x; t.x1 = F.p.x + TUNNEL; }
    if (n.y > 0.5) { t.y0 = F.p.y - TUNNEL; t.y1 = F.p.y; } else if (n.y < -0.5) { t.y0 = F.p.y; t.y1 = F.p.y + TUNNEL; }
    if (n.z > 0.5) { t.z0 = F.p.z - TUNNEL; t.z1 = F.p.z; } else if (n.z < -0.5) { t.z0 = F.p.z; t.z1 = F.p.z + TUNNEL; }
    for (const L of lists) for (const b of L) {
      if (b.cube || b.mat === 'trigger' || b.mat === 'player' || b.mat === 'sphere' || b.mat === 'turret') continue;
      if (!boxOverlap(t, b, 0.001)) continue;
      // la caja no debe asomar delante del plano
      const front = n.x > 0.5 ? b.x1 : n.x < -0.5 ? -b.x0 : n.y > 0.5 ? b.y1 : n.y < -0.5 ? -b.y0 : n.z > 0.5 ? b.z1 : -b.z0;
      const plane = n.x > 0.5 ? F.p.x : n.x < -0.5 ? -F.p.x : n.y > 0.5 ? F.p.y : n.y < -0.5 ? -F.p.y : n.z > 0.5 ? F.p.z : -F.p.z;
      if (front <= plane + 0.002) p.ignore.add(b);
    }
  }

  function clear(which) {
    for (const p of which ? [P[which]] : [A, B]) { p.placed = false; p.host = null; p.mesh.group.visible = false; p.ignore.clear(); }
    linkChanged();
  }

  /* ---------- cruce de cuerpos ---------- */
  /** Extensión del cuerpo proyectada sobre un eje. */
  const ext = (b, v) => Math.abs(v.x) * b.hx + Math.abs(v.y) * b.hy + Math.abs(v.z) * b.hz;
  /** ¿El cuerpo está alineado con la abertura del portal (puede pasar)? Devuelve la coordenada normal o NaN. */
  function inZone(p, b, magnet = false) {
    toLocal(p.F, b.pos, _l);
    const er = ext(b, p.F.r), eu = ext(b, p.F.u);
    const mr = Math.max(W / 2 - er + 0.15, W / 2 - 0.08), mu = Math.max(H / 2 - eu + 0.15, Math.min(H / 2 - 0.08, 0.4));
    if (Math.abs(_l.x) > mr || Math.abs(_l.y) > mu) return NaN;
    if (_l.z > 1.2 || _l.z < -0.9) return NaN;
    // imán suave: al acercarse, el cuerpo se alinea con la abertura para no rozar los bordes
    if (magnet && _l.z > 0 && _l.z < 0.9) {
      const F = p.F, vn = b.vel.x * F.n.x + b.vel.y * F.n.y + b.vel.z * F.n.z;
      if (vn < -0.2) {
        const lim = Math.max(0, W / 2 - er - 0.03), cr = Math.max(-0.035, Math.min(0.035, (Math.max(-lim, Math.min(lim, _l.x)) - _l.x)));
        b.pos.x += F.r.x * cr; b.pos.y += F.r.y * cr; b.pos.z += F.r.z * cr;
        const limU = Math.max(0, H / 2 - eu - 0.03);
        if (Math.abs(F.u.y) < 0.5) { const cu = Math.max(-0.035, Math.min(0.035, (Math.max(-limU, Math.min(limU, _l.y)) - _l.y))); b.pos.x += F.u.x * cu; b.pos.z += F.u.z * cu; }
      }
    }
    return _l.z;
  }
  /** Antes de mover: conjunto de cajas a ignorar y coordenadas normales previas. */
  function before(b, skip) {
    if (!linked()) { b._pz = null; return; }
    const za = inZone(A, b, true), zb = inZone(B, b, true);
    b._pza = za; b._pzb = zb;
    if (za === za) for (const c of A.ignore) skip.add(c);
    if (zb === zb) for (const c of B.ignore) skip.add(c);
  }
  /** Después de mover: si cruzó el plano dentro de la abertura, teletransporta. Devuelve el portal de entrada o null. */
  function after(b, onTeleport) {
    if (!linked()) return null;
    for (const p of [A, B]) {
      const prev = p === A ? b._pza : b._pzb;
      if (prev === undefined || prev !== prev || prev < 0) continue;
      const now = inZone(p, b);
      if (now === now && now < 0) { cross(b, p, p.other); onTeleport && onTeleport(p, p.other); return p; }
    }
    return null;
  }
  /** Teletransporta un cuerpo de `src` a `dst` (posición, velocidad) y lo ubica sin pisar la pared de salida. */
  function cross(b, src, dst) {
    xfPoint(src.F, dst.F, b.pos, _o); b.pos.x = _o.x; b.pos.y = _o.y; b.pos.z = _o.z;
    xfDir(src.F, dst.F, b.vel, _o2); b.vel.x = _o2.x; b.vel.y = _o2.y; b.vel.z = _o2.z;
    // acomodar dentro de la abertura de salida y delante del plano
    const F = dst.F;
    toLocal(F, b.pos, _l);
    const mr = Math.max(0, W / 2 - ext(b, F.r) - 0.02), mu = Math.max(0, H / 2 - ext(b, F.u) - 0.02), en = ext(b, F.n) + 0.03;
    const lr = Math.max(-mr, Math.min(mr, _l.x)), lu = Math.max(-mu, Math.min(mu, _l.y)), ln = Math.max(en, _l.z);
    b.pos.x = F.p.x + F.r.x * lr + F.u.x * lu + F.n.x * ln;
    b.pos.y = F.p.y + F.r.y * lr + F.u.y * lu + F.n.y * ln;
    b.pos.z = F.p.z + F.r.z * lr + F.u.z * lu + F.n.z * ln;
    // salida por un portal de piso con poca velocidad: un impulso mínimo para no volver a caer adentro
    const vn = b.vel.x * F.n.x + b.vel.y * F.n.y + b.vel.z * F.n.z;
    if (vn < 1.5) { const k = 1.5 - vn; b.vel.x += F.n.x * k; b.vel.y += F.n.y * k; b.vel.z += F.n.z * k; }
    b.grounded = false; b.ground = null;
    b._pza = b._pzb = NaN;
    depenetrate(b, { lists: ctx.lists(), skip: null });
  }
  /** Transforma una mirada (yaw/pitch) al cruzar. */
  function crossLook(src, dst, yaw, pitch) {
    const f = xfDir(src.F, dst.F, lookDir(yaw, pitch, _o), _o2);
    return dirToYawPitch(f, yaw);
  }

  /* ---------- rayos ---------- */
  /** ¿Un rayo (o,d) entra por algún portal antes de `maxT`? Devuelve {t, p} o null. */
  function rayPortal(ox, oy, oz, dx, dy, dz, maxT) {
    if (!linked()) return null;
    let best = null, bt = maxT;
    for (const p of [A, B]) {
      const n = p.F.n, den = dx * n.x + dy * n.y + dz * n.z;
      if (den > -1e-6) continue;
      const t = ((p.F.p.x - ox) * n.x + (p.F.p.y - oy) * n.y + (p.F.p.z - oz) * n.z) / den;
      if (t <= 1e-3 || t >= bt + 0.03) continue;
      _l.x = ox + dx * t; _l.y = oy + dy * t; _l.z = oz + dz * t;
      toLocal(p.F, _l, _o);
      const a = _o.x / (W / 2), c = _o.y / (H / 2);
      if (a * a + c * c > 1) continue;
      bt = t; best = p;
    }
    return best ? { t: bt, p: best } : null;
  }

  /* ---------- actualización ---------- */
  let time = 0;
  function update(dt) {
    time += dt;
    for (const p of [A, B]) {
      if (!p.placed) continue;
      p.openT = Math.min(1, p.openT + dt * 4);
      // portales sobre paneles móviles
      const h = p.host;
      if (h && (h.dx || h.dy || h.dz || h.moving)) {
        p.F.p.x = h.x0 + p.off.x; p.F.p.y = h.y0 + p.off.y; p.F.p.z = h.z0 + p.off.z;
        syncMesh(p);
      }
      if (h && !h.on) clear(p.id); // el anfitrión desapareció
    }
    if (linked()) { linkChanged(); computeIgnore(A, ctx.lists()); computeIgnore(B, ctx.lists()); }
    for (const p of [A, B]) { const u = p.mesh.uni; u.time.value = time; u.open.value = 0.15 + 0.85 * easeOut(p.openT); }
  }
  const easeOut = t => 1 - (1 - t) * (1 - t);

  /* ---------- render ---------- */
  const _sz = new THREE.Vector2(), _sph = new THREE.Sphere(), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4();
  const _plane = new THREE.Plane(), _plane2 = new THREE.Plane(), _v4 = new THREE.Vector4(), _q = new THREE.Vector4(), _n3 = new THREE.Vector3(), _p3 = new THREE.Vector3();
  function setQuality(scale, half) {
    rtScale = scale; rtHalf = half;
    for (const p of [A, B]) { if (p.rt) { p.rt.dispose(); p.rt = null; } }
    if (scale > 0) {
      for (const p of [A, B]) p.rt = new THREE.WebGLRenderTarget(4, 4, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: true });
    }
  }
  /** Plano cercano oblicuo (Lengyel), como en Reflector.js. */
  function oblique(cam, plane) {
    _plane.copy(plane).applyMatrix4(cam.matrixWorldInverse);
    _v4.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = cam.projectionMatrix.elements;
    _q.x = (Math.sign(_v4.x) + e[8]) / e[0];
    _q.y = (Math.sign(_v4.y) + e[9]) / e[5];
    _q.z = -1.0;
    _q.w = (1.0 + e[10]) / e[14];
    _v4.multiplyScalar(2.0 / _v4.dot(_q));
    e[2] = _v4.x; e[6] = _v4.y; e[10] = _v4.z + 1.0; e[14] = _v4.w;
  }
  /** Pasadas extra: una por portal visible. `hideForRT` oculta/muestra objetos (vista en 1.ª persona, cuerpo). */
  function renderViews(hideForRT) {
    let passes = 0;
    renderer.getDrawingBufferSize(_sz);
    for (const p of [A, B]) {
      p.visibleRT = false;
      const u = p.mesh.uni;
      u.res.value.copy(_sz);
      if (!linked() || !p.rt || rtScale <= 0) { u.useMap.value = 0; continue; }
      // ¿la cámara ve el frente del portal?
      const F = p.F;
      const side = (camera.position.x - F.p.x) * F.n.x + (camera.position.y - F.p.y) * F.n.y + (camera.position.z - F.p.z) * F.n.z;
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
      _sph.center.set(F.p.x, F.p.y, F.p.z); _sph.radius = H * 0.6;
      if (side < -0.05 || !_fr.intersectsSphere(_sph)) { u.useMap.value = 0; continue; }
      const w = Math.max(4, Math.floor(_sz.x * rtScale)), h = Math.max(4, Math.floor(_sz.y * rtScale));
      if (p.rt.width !== w || p.rt.height !== h) p.rt.setSize(w, h);
      // cámara virtual = M(p→otro) · cámara
      const M = p === A ? mAB : mBA;
      vcam.projectionMatrix.copy(camera.projectionMatrix);
      vcam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
      vcam.matrixWorld.multiplyMatrices(M, camera.matrixWorld);
      vcam.matrixWorldInverse.copy(vcam.matrixWorld).invert();
      const o = p.other.F;
      _n3.set(o.n.x, o.n.y, o.n.z); _p3.set(o.p.x - o.n.x * 0.02, o.p.y - o.n.y * 0.02, o.p.z - o.n.z * 0.02);
      _plane2.setFromNormalAndCoplanarPoint(_n3, _p3);
      oblique(vcam, _plane2);
      // dentro de esta vista, este portal se dibuja como membrana (sin realimentación)
      p.mesh.surface.visible = false;
      hideForRT(true);
      renderer.setRenderTarget(p.rt);
      renderer.clear();
      renderer.render(scene, vcam);
      renderer.setRenderTarget(null);
      hideForRT(false);
      p.mesh.surface.visible = true;
      u.map.value = p.rt.texture; u.useMap.value = 1;
      p.visibleRT = true; passes++;
    }
    return passes;
  }

  function dispose() {
    for (const p of [A, B]) {
      if (p.rt) p.rt.dispose();
      p.mesh.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      scene.remove(p.mesh.group);
    }
  }

  return {
    A, B, P, linked, shoot, place, fit, clear, before, after, cross, crossLook, rayPortal, update, setQuality, renderViews, dispose,
    get shots() { return shots; }, set shots(v) { shots = v; },
    get rtScale() { return rtScale; }, get rtHalf() { return rtHalf; },
    colors: PCOL,
    /** Estado legible (pruebas). */
    info() {
      const f = p => p.placed ? { x: +p.F.p.x.toFixed(3), y: +p.F.p.y.toFixed(3), z: +p.F.p.z.toFixed(3), n: [p.F.n.x, p.F.n.y, p.F.n.z].map(v => Math.round(v)), u: [p.F.u.x, p.F.u.y, p.F.u.z].map(v => Math.round(v)), host: p.host && p.host.mat, rt: p.visibleRT } : null;
      return { A: f(A), B: f(B), linked: linked(), shots };
    },
  };
}
