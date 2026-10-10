// @ts-check
/* Portales Imposibles — física de cajas alineadas a los ejes (AABB): cuerpos, barrido por ejes con subpasos,
   escalones bajos, y raycast por «slabs». Sin asignaciones por cuadro. */

/** @typedef {{x0:number,y0:number,z0:number,x1:number,y1:number,z1:number,on:boolean,mat:string,ref?:any,dx?:number,dy?:number,dz?:number,id?:number}} Box */
/** @typedef {{pos:{x:number,y:number,z:number}, vel:{x:number,y:number,z:number}, hx:number, hy:number, hz:number,
 *   grounded:boolean, ground:Box|null, step:number, hitWall:boolean, landV:number, self?:Box|null}} Body */

let boxId = 1;
/** @returns {Box} */
export function box(x0, y0, z0, x1, y1, z1, mat = 'metal', ref = null) {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), on: true, mat, ref, dx: 0, dy: 0, dz: 0, id: boxId++ };
}
/** @returns {Body} */
export function body(hx, hy, hz, step = 0) {
  return { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, hx, hy, hz, grounded: false, ground: null, step, hitWall: false, landV: 0, self: null };
}
const EPS = 1e-4;
/** @param {Body} b @param {Box} c */
export function overlaps(b, c) {
  return b.pos.x - b.hx < c.x1 - EPS && b.pos.x + b.hx > c.x0 + EPS && b.pos.y - b.hy < c.y1 - EPS && b.pos.y + b.hy > c.y0 + EPS && b.pos.z - b.hz < c.z1 - EPS && b.pos.z + b.hz > c.z0 + EPS;
}
/** ¿Las cajas se tocan? @param {Box} a @param {Box} c */
export function boxOverlap(a, c, m = 0) {
  return a.x0 < c.x1 - m && a.x1 > c.x0 + m && a.y0 < c.y1 - m && a.y1 > c.y0 + m && a.z0 < c.z1 - m && a.z1 > c.z0 + m;
}

/** Recorre todas las cajas sólidas que afectan a un cuerpo. Se arma una vez por paso desde el juego.
 *  @typedef {{lists: Box[][], skip: Set<Box>|null}} Solids */

/** @param {Box} c @param {Solids} S @param {Body} b */
function usable(c, S, b) { return c.on && c !== b.self && !(S.skip && S.skip.has(c)) && c.mat !== 'trigger'; }

/** ¿Hay lugar libre para el cuerpo en su posición actual? @param {Body} b @param {Solids} S */
export function free(b, S) {
  for (const L of S.lists) for (const c of L) if (usable(c, S, b) && overlaps(b, c)) return false;
  return true;
}

/** @param {Body} b @param {Solids} S @param {0|1|2} axis @param {number} d */
function moveAxis(b, S, axis, d) {
  if (d === 0) return;
  const p = b.pos;
  if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
  for (const L of S.lists) for (const c of L) {
    if (!usable(c, S, b) || !overlaps(b, c)) continue;
    if (axis === 1) {
      if (d < 0) { p.y = c.y1 + b.hy + EPS; if (b.vel.y < 0) { b.landV = -b.vel.y; b.vel.y = 0; } b.grounded = true; b.ground = c; }
      else { p.y = c.y0 - b.hy - EPS; if (b.vel.y > 0) b.vel.y = 0; }
      continue;
    }
    // escalón bajo: subirlo si hay lugar (sólo cuerpos con step y apoyados)
    const feet = p.y - b.hy;
    if (b.step > 0 && b.grounded && c.y1 - feet > 0 && c.y1 - feet <= b.step) {
      const oy = p.y; p.y = c.y1 + b.hy + EPS;
      if (free(b, S)) continue;
      p.y = oy;
    }
    b.hitWall = true;
    if (axis === 0) { p.x = d > 0 ? c.x0 - b.hx - EPS : c.x1 + b.hx + EPS; b.vel.x = 0; }
    else { p.z = d > 0 ? c.z0 - b.hz - EPS : c.z1 + b.hz + EPS; b.vel.z = 0; }
  }
}

/** Integra la velocidad con colisiones (subpasos para que nada atraviese paredes a alta velocidad).
 *  @param {Body} b @param {Solids} S @param {number} dt */
export function moveBody(b, S, dt) {
  const v = b.vel;
  const maxD = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt;
  const n = Math.min(12, Math.max(1, Math.ceil(maxD / 0.18)));
  const wasG = b.grounded;
  b.grounded = false; b.ground = null; b.hitWall = false; b.landV = 0;
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    // con el piso de la iteración anterior se permite subir escalones
    if (i === 0) b.grounded = wasG;
    moveAxis(b, S, 0, v.x * h);
    moveAxis(b, S, 2, v.z * h);
    if (i === 0) b.grounded = false;
    moveAxis(b, S, 1, v.y * h);
  }
  // apoyado aunque no se mueva verticalmente: sondeo corto hacia abajo
  if (!b.grounded && v.y <= 0) {
    const oy = b.pos.y; b.pos.y -= 0.03;
    for (const L of S.lists) for (const c of L) if (usable(c, S, b) && overlaps(b, c)) { b.grounded = true; b.ground = c; break; }
    b.pos.y = oy;
  }
}

/** Saca al cuerpo de cualquier caja que lo esté pisando (puertas que se cierran, paneles móviles), por el lado más corto.
 *  @param {Body} b @param {Solids} S */
export function depenetrate(b, S) {
  for (let k = 0; k < 3; k++) {
    let moved = false;
    for (const L of S.lists) for (const c of L) {
      if (!usable(c, S, b) || !overlaps(b, c)) continue;
      const p = b.pos;
      const opts = [
        [c.x1 + b.hx + EPS - p.x, 0], [c.x0 - b.hx - EPS - p.x, 0],
        [c.y1 + b.hy + EPS - p.y, 1], [c.y0 - b.hy - EPS - p.y, 1],
        [c.z1 + b.hz + EPS - p.z, 2], [c.z0 - b.hz - EPS - p.z, 2],
      ];
      let best = opts[0];
      for (const o of opts) if (Math.abs(o[0]) < Math.abs(best[0])) best = o;
      if (best[1] === 0) p.x += best[0]; else if (best[1] === 1) p.y += best[0]; else p.z += best[0];
      moved = true;
    }
    if (!moved) return;
  }
}

/** Resultado reutilizable de raycast. */
export const HIT = { t: 0, box: /** @type {Box|null} */ (null), nx: 0, ny: 0, nz: 0, x: 0, y: 0, z: 0 };
/** Intersección rayo-caja (slab). Devuelve t de entrada o -1, y deja la normal en N. */
const N = { x: 0, y: 0, z: 0 };
/** @param {Box} c */
export function rayBox(ox, oy, oz, dx, dy, dz, c, maxT) {
  let tmin = 0, tmax = maxT, nx = 0, ny = 0, nz = 0;
  // eje x
  if (Math.abs(dx) < 1e-9) { if (ox <= c.x0 || ox >= c.x1) return -1; }
  else {
    const inv = 1 / dx; let t1 = (c.x0 - ox) * inv, t2 = (c.x1 - ox) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = s; ny = 0; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy <= c.y0 || oy >= c.y1) return -1; }
  else {
    const inv = 1 / dy; let t1 = (c.y0 - oy) * inv, t2 = (c.y1 - oy) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = s; nz = 0; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz <= c.z0 || oz >= c.z1) return -1; }
  else {
    const inv = 1 / dz; let t1 = (c.z0 - oz) * inv, t2 = (c.z1 - oz) * inv, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmin <= 0) return -1; // el origen está adentro
  N.x = nx; N.y = ny; N.z = nz;
  return tmin;
}
/** Raycast contra listas de cajas. `pass(box)` devuelve true para las que el rayo atraviesa.
 *  @param {Box[][]} lists @param {(c:Box)=>boolean} pass */
export function raycast(ox, oy, oz, dx, dy, dz, maxT, lists, pass) {
  let best = maxT, hit = null, nx = 0, ny = 0, nz = 0;
  for (const L of lists) for (const c of L) {
    if (!c.on || pass(c)) continue;
    const t = rayBox(ox, oy, oz, dx, dy, dz, c, best);
    if (t > 0 && t < best) { best = t; hit = c; nx = N.x; ny = N.y; nz = N.z; }
  }
  HIT.t = best; HIT.box = hit; HIT.nx = nx; HIT.ny = ny; HIT.nz = nz;
  HIT.x = ox + dx * best; HIT.y = oy + dy * best; HIT.z = oz + dz * best;
  return hit ? HIT : null;
}
