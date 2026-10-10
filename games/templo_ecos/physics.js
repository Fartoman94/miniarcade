// @ts-check
/* Templo de los Ecos — colisiones AABB por ejes, rayos 2D/3D (luz, línea de visión). Sin asignaciones por cuadro. */

/** @typedef {{x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,on:boolean,tag:string,ref:any,dx:number,dy:number,dz:number,vt:number}} Col */
/** @typedef {{pos:{x:number,y:number,z:number}, vel:{x:number,y:number,z:number}, r:number, h:number, step:number,
 *   grounded:boolean, ground:Col|null, contact:Col|null, contactAx:string, contactDir:number}} Body */

/** @returns {Col} */
export function col(x0, y0, z0, x1, y1, z1, tag = 'wall', ref = null) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), on: true, tag, ref, dx: 0, dy: 0, dz: 0, vt: Math.max(y0, y1) };
}
/** Caja por centro (cy = base). */
export function colBox(cx, by, cz, w, h, d, tag = 'wall', ref = null) { return col(cx - w / 2, by, cz - d / 2, cx + w / 2, by + h, cz + d / 2, tag, ref); }

/** @param {Col} c */
function ov(c, x0, y0, z0, x1, y1, z1) { return c.on && c.x0 < x1 && c.x1 > x0 && c.y0 < y1 && c.y1 > y0 && c.z0 < z1 && c.z1 > z0; }

/** @returns {Body} */
export function body(r = 0.35, h = 1.6, step = 0.45) {
  return { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, r, h, step, grounded: false, ground: null, contact: null, contactAx: '', contactDir: 0 };
}

/** ¿El espacio está libre para un cuerpo? @param {Col[]} cols @param {Col|null} [skip] */
export function free(cols, x0, y0, z0, x1, y1, z1, skip = null) {
  for (let i = 0; i < cols.length; i++) { const c = cols[i]; if (c !== skip && ov(c, x0, y0, z0, x1, y1, z1)) return false; }
  return true;
}

/**
 * Mueve un cuerpo con gravedad ya aplicada en vel. Resuelve X, Z y luego Y.
 * @param {Col[]} cols @param {Body} b @param {number} dt
 */
export function moveBody(cols, b, dt) {
  const p = b.pos, v = b.vel, r = b.r, h = b.h;
  b.contact = null; b.contactAx = ''; b.contactDir = 0;
  const wasGrounded = b.grounded;
  // X
  let prev = p.x;
  p.x += v.x * dt;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!ov(c, p.x - r, p.y + 0.02, p.z - r, p.x + r, p.y + h, p.z + r)) continue;
    const rise = c.y1 - p.y;
    if (wasGrounded && rise > 0 && rise <= b.step && c.tag !== 'block' && free(cols, p.x - r, c.y1 + 0.01, p.z - r, p.x + r, c.y1 + h, p.z + r)) { p.y = c.y1; continue; }
    if (prev + r <= c.x0 + 0.05) { p.x = c.x0 - r - 1e-4; b.contactDir = 1; } else if (prev - r >= c.x1 - 0.05) { p.x = c.x1 + r + 1e-4; b.contactDir = -1; }
    else { p.x = prev; b.contactDir = Math.sign(v.x); }
    b.contact = c; b.contactAx = 'x';
  }
  // Z
  prev = p.z;
  p.z += v.z * dt;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!ov(c, p.x - r, p.y + 0.02, p.z - r, p.x + r, p.y + h, p.z + r)) continue;
    const rise = c.y1 - p.y;
    if (wasGrounded && rise > 0 && rise <= b.step && c.tag !== 'block' && free(cols, p.x - r, c.y1 + 0.01, p.z - r, p.x + r, c.y1 + h, p.z + r)) { p.y = c.y1; continue; }
    if (prev + r <= c.z0 + 0.05) { p.z = c.z0 - r - 1e-4; b.contactDir = 1; } else if (prev - r >= c.z1 - 0.05) { p.z = c.z1 + r + 1e-4; b.contactDir = -1; }
    else { p.z = prev; b.contactDir = Math.sign(v.z); }
    if (!b.contact || Math.abs(v.z) > Math.abs(v.x)) { b.contact = c; b.contactAx = 'z'; }
  }
  // Y
  prev = p.y;
  p.y += v.y * dt;
  b.grounded = false; b.ground = null;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!ov(c, p.x - r + 0.02, p.y, p.z - r + 0.02, p.x + r - 0.02, p.y + h, p.z + r - 0.02)) continue;
    if (v.y <= 0 && prev >= c.y1 - 0.35) { p.y = c.y1; v.y = 0; b.grounded = true; b.ground = c; }
    else if (v.y > 0 && prev + h <= c.y0 + 0.1) { p.y = c.y0 - h; v.y = 0; }
  }
}

/**
 * Rayo 2D (plano XZ, a la altura y) contra AABB. Devuelve la distancia o Infinity.
 * @param {Col} c
 */
export function rayBox2D(ox, oz, dx, dz, y, c) {
  if (!c.on || y < c.y0 || y > c.y1) return Infinity;
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) return Infinity; }
  else { let a = (c.x0 - ox) / dx, b = (c.x1 - ox) / dx; if (a > b) { const t = a; a = b; b = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) return Infinity; }
  else { let a = (c.z0 - oz) / dz, b = (c.z1 - oz) / dz; if (a > b) { const t = a; a = b; b = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  return tmax >= tmin && tmax > 1e-4 ? (tmin > 1e-4 ? tmin : Infinity) : Infinity;
}

/** Rayo 2D contra círculo. */
export function rayCircle(ox, oz, dx, dz, cx, cz, r) {
  const fx = ox - cx, fz = oz - cz;
  const b = fx * dx + fz * dz, c = fx * fx + fz * fz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc), t = -b - s;
  return t > 1e-3 ? t : Infinity;
}

/** Rayo 2D contra segmento (espejo). Devuelve distancia o Infinity. */
export function raySegment(ox, oz, dx, dz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return Infinity;
  const t = ((ax - ox) * ez - (az - oz) * ex) / den;
  const u = ((ax - ox) * dz - (az - oz) * dx) / den;
  return t > 1e-3 && u >= 0 && u <= 1 ? t : Infinity;
}

/** ¿Hay algo sólido entre a y b (a la altura y)? Ignora suelos (tag 'floor') y colisionadores pasados en skip. */
export function losBlocked(cols, ax, az, bx, bz, y = 1.2, skipTag = 'floor') {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 1e-4) return false;
  const ux = dx / len, uz = dz / len;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.tag === skipTag || c.tag === 'plat') continue;
    if (rayBox2D(ax, az, ux, uz, y, c) < len) return true;
  }
  return false;
}

/**
 * Fracción t∈(0,1] del segmento a→b donde entra en el volumen visible de una caja (o Infinity).
 * Usa la altura visible (vt), no la del colisionador, para la cámara.
 * @param {Col} c
 */
export function segBoxVisible(ax, ay, az, bx, by, bz, c) {
  const top = Math.min(c.y1, c.vt);
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const di = i === 0 ? bx - ax : i === 1 ? by - ay : bz - az, oi = i === 0 ? ax : i === 1 ? ay : az;
    const lo = i === 0 ? c.x0 : i === 1 ? c.y0 : c.z0, hi = i === 0 ? c.x1 : i === 1 ? top : c.z1;
    if (Math.abs(di) < 1e-9) { if (oi < lo || oi > hi) return Infinity; continue; }
    let a = (lo - oi) / di, b = (hi - oi) / di;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0 > 1e-3 ? t0 : Infinity;
}
