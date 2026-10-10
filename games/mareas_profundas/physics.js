// @ts-check
/* Mareas Profundas — colisiones simples: esfera contra terreno (campo de alturas), cajas alineadas y esferas.
   Sin asignaciones por cuadro: los resultados se escriben en objetos reutilizados. */

/** @typedef {{x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,on:boolean,tag?:string}} Box */
/** @typedef {{x:number,y:number,z:number,r:number,on:boolean,tag?:string}} Ball */
/** @typedef {{height:(x:number,z:number)=>number, ceil:number, floorMin:number, boxes:Box[], balls:Ball[], bound:{x0:number,x1:number,z0:number,z1:number}|{r:number}}} World */

export const hit = { impact: 0, nx: 0, ny: 0, nz: 0, any: false, tag: '', debris: '' };

/** Caja desde centro y medidas. */
export function box(cx, cy, cz, w, h, d, tag = '') { return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, z0: cz - d / 2, z1: cz + d / 2, on: true, tag }; }

/** Normal del terreno por diferencias finitas. @param {World} w */
export function terrainNormal(w, x, z, out) {
  const e = 0.6, hx = w.height(x + e, z) - w.height(x - e, z), hz = w.height(x, z + e) - w.height(x, z - e);
  let nx = -hx, ny = 2 * e, nz = -hz; const l = Math.hypot(nx, ny, nz) || 1;
  out.x = nx / l; out.y = ny / l; out.z = nz / l; return out;
}
const _n = { x: 0, y: 1, z: 0 };

/**
 * Resuelve una esfera contra el mundo. Modifica pos/vel; deja en `hit` la mayor velocidad de impacto.
 * @param {World} w @param {{x:number,y:number,z:number}} p @param {{x:number,y:number,z:number}} v @param {number} r @param {number} [bounce]
 */
export function collide(w, p, v, r, bounce = 0.25) {
  hit.impact = 0; hit.any = false; hit.tag = ''; hit.debris = '';
  // límites laterales
  const b = /** @type {any} */ (w.bound);
  if (b.r !== undefined) {
    const d = Math.hypot(p.x, p.z);
    if (d > b.r - r) { const nx = -p.x / d, nz = -p.z / d; p.x = -nx * (b.r - r); p.z = -nz * (b.r - r); resolve(v, nx, 0, nz, bounce, 'bound'); }
  } else {
    if (p.x < b.x0 + r) { p.x = b.x0 + r; resolve(v, 1, 0, 0, bounce, 'bound'); }
    if (p.x > b.x1 - r) { p.x = b.x1 - r; resolve(v, -1, 0, 0, bounce, 'bound'); }
    if (p.z < b.z0 + r) { p.z = b.z0 + r; resolve(v, 0, 0, 1, bounce, 'bound'); }
    if (p.z > b.z1 - r) { p.z = b.z1 - r; resolve(v, 0, 0, -1, bounce, 'bound'); }
  }
  // techo (superficie del mar o bóveda)
  if (p.y > w.ceil - r * 0.3) { p.y = w.ceil - r * 0.3; if (v.y > 0) v.y = 0; }
  // terreno
  const h = w.height(p.x, p.z);
  if (p.y - r < h) {
    terrainNormal(w, p.x, p.z, _n);
    p.y = h + r;
    resolve(v, _n.x, _n.y, _n.z, bounce, 'ground');
  }
  // cajas
  for (let i = 0; i < w.boxes.length; i++) {
    const c = w.boxes[i]; if (!c.on) continue;
    if (p.x + r < c.x0 || p.x - r > c.x1 || p.y + r < c.y0 || p.y - r > c.y1 || p.z + r < c.z0 || p.z - r > c.z1) continue;
    const cx = p.x < c.x0 ? c.x0 : p.x > c.x1 ? c.x1 : p.x, cy = p.y < c.y0 ? c.y0 : p.y > c.y1 ? c.y1 : p.y, cz = p.z < c.z0 ? c.z0 : p.z > c.z1 ? c.z1 : p.z;
    let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz; const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    let nx, ny, nz;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; nz = dz / d; p.x = cx + nx * r; p.y = cy + ny * r; p.z = cz + nz * r; }
    else {
      // centro dentro de la caja: salir por la cara más cercana
      const ex = [p.x - c.x0, c.x1 - p.x, p.y - c.y0, c.y1 - p.y, p.z - c.z0, c.z1 - p.z];
      let k = 0; for (let j = 1; j < 6; j++) if (ex[j] < ex[k]) k = j;
      nx = k === 0 ? -1 : k === 1 ? 1 : 0; ny = k === 2 ? -1 : k === 3 ? 1 : 0; nz = k === 4 ? -1 : k === 5 ? 1 : 0;
      if (k === 0) p.x = c.x0 - r; else if (k === 1) p.x = c.x1 + r; else if (k === 2) p.y = c.y0 - r; else if (k === 3) p.y = c.y1 + r; else if (k === 4) p.z = c.z0 - r; else p.z = c.z1 + r;
    }
    resolve(v, nx, ny, nz, bounce, c.tag || 'box');
  }
  // esferas
  for (let i = 0; i < w.balls.length; i++) {
    const s = w.balls[i]; if (!s.on) continue;
    const dx = p.x - s.x, dy = p.y - s.y, dz = p.z - s.z, rr = r + s.r, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rr * rr || d2 < 1e-8) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d;
    p.x = s.x + nx * rr; p.y = s.y + ny * rr; p.z = s.z + nz * rr;
    resolve(v, nx, ny, nz, bounce, s.tag || 'ball');
  }
  return hit;
}
function resolve(v, nx, ny, nz, bounce, tag) {
  const vn = v.x * nx + v.y * ny + v.z * nz;
  hit.any = true;
  if (tag.startsWith('debris:')) { hit.debris = tag; bounce = 0; }
  if (vn < 0) {
    v.x -= nx * vn * (1 + bounce); v.y -= ny * vn * (1 + bounce); v.z -= nz * vn * (1 + bounce);
    if (-vn > hit.impact) { hit.impact = -vn; hit.nx = nx; hit.ny = ny; hit.nz = nz; hit.tag = tag; }
  }
}

/** ¿El segmento a→b cruza alguna caja o el terreno? (línea de visión) @param {World} w */
export function blocked(w, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < w.boxes.length; i++) {
    const c = w.boxes[i]; if (!c.on) continue;
    let t0 = 0, t1 = 1;
    if (!slab(ax, dx, c.x0, c.x1)) continue; t0 = _s.t0; t1 = _s.t1;
    if (!slab(ay, dy, c.y0, c.y1)) continue; t0 = Math.max(t0, _s.t0); t1 = Math.min(t1, _s.t1); if (t0 > t1) continue;
    if (!slab(az, dz, c.z0, c.z1)) continue; t0 = Math.max(t0, _s.t0); t1 = Math.min(t1, _s.t1); if (t0 > t1) continue;
    return true;
  }
  for (let k = 1; k < 8; k++) { const t = k / 8; if (ay + dy * t < w.height(ax + dx * t, az + dz * t)) return true; }
  return false;
}
const _s = { t0: 0, t1: 1 };
function slab(a, d, lo, hi) {
  if (Math.abs(d) < 1e-9) { if (a < lo || a > hi) return false; _s.t0 = 0; _s.t1 = 1; return true; }
  let t0 = (lo - a) / d, t1 = (hi - a) / d; if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
  _s.t0 = Math.max(0, t0); _s.t1 = Math.min(1, t1); return _s.t0 <= _s.t1;
}

/** Distancia libre a lo largo de un segmento (para que la cámara no atraviese paredes). Devuelve fracción 0..1. @param {World} w */
export function freeFrac(w, ax, ay, az, bx, by, bz, margin = 0.6) {
  const n = 10;
  for (let k = 1; k <= n; k++) {
    const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
    if (y < w.height(x, z) + margin) return Math.max(0.15, (k - 1) / n);
    for (let i = 0; i < w.boxes.length; i++) {
      const c = w.boxes[i]; if (!c.on || c.tag === 'nocam') continue;
      if (x > c.x0 - margin && x < c.x1 + margin && y > c.y0 - margin && y < c.y1 + margin && z > c.z0 - margin && z < c.z1 + margin) return Math.max(0.15, (k - 1) / n);
    }
  }
  return 1;
}
