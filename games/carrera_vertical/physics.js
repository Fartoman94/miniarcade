// @ts-check
/* Carrera Vertical — colisiones AABB por ejes con rejilla por Z (el recorrido avanza hacia -Z), sondas para
   pared/cornisa y rayos de cámara. Sin asignaciones por cuadro. */

/** @typedef {{x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,on:boolean,tag:string,ref:any,cam:boolean}} Col */
/** @typedef {{pos:{x:number,y:number,z:number}, vel:{x:number,y:number,z:number}, r:number, h:number, step:number,
 *   grounded:boolean, ground:Col|null, hitX:Col|null, hitZ:Col|null, nX:number, nZ:number, bonk:boolean}} Body */

/** @returns {Col} */
export function col(x0, y0, z0, x1, y1, z1, tag = 'box', ref = null) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), on: true, tag, ref, cam: true };
}

/** @returns {Body} */
export function body(r = 0.32, h = 1.75, step = 0.38) {
  return { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, r, h, step, grounded: false, ground: null, hitX: null, hitZ: null, nX: 0, nZ: 0, bonk: false };
}

/** @param {Col} c */
export function ov(c, x0, y0, z0, x1, y1, z1) { return c.on && c.x0 < x1 && c.x1 > x0 && c.y0 < y1 && c.y1 > y0 && c.z0 < z1 && c.z1 > z0; }

/** ¿El volumen está libre? @param {Col[]} cols @param {Col|null} [skip] */
export function free(cols, x0, y0, z0, x1, y1, z1, skip = null) {
  for (let i = 0; i < cols.length; i++) { const c = cols[i]; if (c !== skip && c.tag !== 'ghost' && ov(c, x0, y0, z0, x1, y1, z1)) return false; }
  return true;
}
/** Primer colisionador que toca el volumen (o null). @param {Col[]} cols */
export function hit(cols, x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < cols.length; i++) { const c = cols[i]; if (c.tag !== 'ghost' && ov(c, x0, y0, z0, x1, y1, z1)) return c; }
  return null;
}

/** Rejilla 1D por Z: cada celda guarda los colisionadores que tocan esa celda o sus vecinas. */
export function createGrid(cols, cell = 16) {
  let z0 = Infinity, z1 = -Infinity;
  for (const c of cols) { if (c.z0 < z0) z0 = c.z0; if (c.z1 > z1) z1 = c.z1; }
  if (!isFinite(z0)) { z0 = -1; z1 = 1; }
  z0 -= cell; z1 += cell;
  const n = Math.max(1, Math.ceil((z1 - z0) / cell));
  /** @type {Col[][]} */ const cells = [];
  for (let i = 0; i < n; i++) cells.push([]);
  for (const c of cols) {
    const a = Math.max(0, Math.floor((c.z0 - z0) / cell) - 1), b = Math.min(n - 1, Math.floor((c.z1 - z0) / cell) + 1);
    for (let i = a; i <= b; i++) cells[i].push(c);
  }
  const empty = /** @type {Col[]} */ ([]);
  return {
    /** @param {number} z */
    near(z) { const i = Math.floor((z - z0) / cell); return i < 0 || i >= n ? empty : cells[i]; },
    all: cols,
  };
}

/**
 * Mueve un cuerpo (la gravedad ya está en vel). Resuelve X, Z y luego Y. Guarda normales de pared tocadas.
 * @param {Col[]} cols @param {Body} b @param {number} dt
 */
export function moveBody(cols, b, dt) {
  const p = b.pos, v = b.vel, r = b.r, h = b.h;
  b.hitX = b.hitZ = null; b.nX = b.nZ = 0; b.bonk = false;
  const wasG = b.grounded;
  // X
  let prev = p.x;
  p.x += v.x * dt;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.tag === 'ghost' || !ov(c, p.x - r, p.y + 0.02, p.z - r, p.x + r, p.y + h, p.z + r)) continue;
    const rise = c.y1 - p.y;
    if (wasG && rise > 0 && rise <= b.step && free(cols, p.x - r, c.y1 + 0.01, p.z - r, p.x + r, c.y1 + h, p.z + r)) { p.y = c.y1; continue; }
    if (prev + r <= c.x0 + 0.06) { p.x = c.x0 - r - 1e-4; b.nX = -1; }
    else if (prev - r >= c.x1 - 0.06) { p.x = c.x1 + r + 1e-4; b.nX = 1; }
    else { p.x = prev; b.nX = -Math.sign(v.x); }
    if (v.x * b.nX < 0) v.x = 0;
    b.hitX = c;
  }
  // Z
  prev = p.z;
  p.z += v.z * dt;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.tag === 'ghost' || !ov(c, p.x - r, p.y + 0.02, p.z - r, p.x + r, p.y + h, p.z + r)) continue;
    const rise = c.y1 - p.y;
    if (wasG && rise > 0 && rise <= b.step && free(cols, p.x - r, c.y1 + 0.01, p.z - r, p.x + r, c.y1 + h, p.z + r)) { p.y = c.y1; continue; }
    if (prev + r <= c.z0 + 0.06) { p.z = c.z0 - r - 1e-4; b.nZ = -1; }
    else if (prev - r >= c.z1 - 0.06) { p.z = c.z1 + r + 1e-4; b.nZ = 1; }
    else { p.z = prev; b.nZ = -Math.sign(v.z); }
    if (v.z * b.nZ < 0) v.z = 0;
    b.hitZ = c;
  }
  // Y (los solapes se prueban contra la altura antes de acomodar, así dos techos al ras cuentan igual)
  prev = p.y;
  p.y += v.y * dt;
  b.grounded = false; b.ground = null;
  const py = p.y;
  let top = -Infinity, ceil = Infinity;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (c.tag === 'ghost' || !ov(c, p.x - r + 0.03, py, p.z - r + 0.03, p.x + r - 0.03, py + h, p.z + r - 0.03)) continue;
    if (v.y <= 0 && prev >= c.y1 - 0.32) { if (c.y1 > top || (c.y1 >= top && c.tag === 'lift')) { top = c.y1; b.ground = c; } }
    else if (v.y > 0 && prev + h <= c.y0 + 0.12) { if (c.y0 < ceil) ceil = c.y0; }
  }
  if (top > -Infinity) { p.y = top; v.y = 0; b.grounded = true; }
  else if (ceil < Infinity) { p.y = ceil - h; v.y = 0; b.bonk = true; }
}

/** Altura del techo más alto debajo de (x,z) por debajo de y (o -Infinity). @param {Col[]} cols */
export function groundBelow(cols, x, z, y) {
  let g = -Infinity;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!c.on || c.tag === 'ghost' || x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
    if (c.y1 <= y + 0.05 && c.y1 > g) g = c.y1;
  }
  return g;
}

/** Fracción t∈(0,1] del segmento a→b donde entra a la caja, o Infinity. @param {Col} c */
export function segBox(ax, ay, az, bx, by, bz, c) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const di = i === 0 ? bx - ax : i === 1 ? by - ay : bz - az, oi = i === 0 ? ax : i === 1 ? ay : az;
    const lo = i === 0 ? c.x0 : i === 1 ? c.y0 : c.z0, hi = i === 0 ? c.x1 : i === 1 ? c.y1 : c.z1;
    if (Math.abs(di) < 1e-9) { if (oi < lo || oi > hi) return Infinity; continue; }
    let a = (lo - oi) / di, bb = (hi - oi) / di;
    if (a > bb) { const t = a; a = bb; bb = t; }
    if (a > t0) t0 = a; if (bb < t1) t1 = bb;
    if (t0 > t1) return Infinity;
  }
  return t0 > 1e-3 ? t0 : Infinity;
}

/** ¿Hay algo sólido entre a y b? @param {Col[]} cols */
export function blocked(cols, ax, ay, az, bx, by, bz) {
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!c.on || c.tag === 'ghost') continue;
    if (segBox(ax, ay, az, bx, by, bz, c) < 0.98) return true;
  }
  return false;
}
