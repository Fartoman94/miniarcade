// @ts-check
/* Reino del Alba — física cinemática simple: colisionadores AABB en el plano XZ (con altura para la cámara),
   círculos que se deslizan contra ellos, rayos y una grilla de navegación con A* para los NPC.
   Sin asignaciones por cuadro en los caminos calientes. */

/** @typedef {{x0:number,z0:number,x1:number,z1:number,h:number,on:boolean,tag:string,id:string}} Col */

/** @returns {Col} */
export function col(x0, z0, x1, z1, h = 3, tag = 'wall', id = '') {
  return { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, on: true, tag, id };
}
/** Caja por centro. */
export const colC = (cx, cz, w, d, h = 3, tag = 'wall', id = '') => col(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h, tag, id);

/**
 * Empuja un círculo fuera de los colisionadores (2 pasadas). Devuelve true si tocó algo.
 * @param {Col[]} cols @param {{x:number,z:number}} p @param {number} r
 */
export function pushOut(cols, p, r) {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (!c.on) continue;
      if (p.x + r <= c.x0 || p.x - r >= c.x1 || p.z + r <= c.z0 || p.z - r >= c.z1) continue;
      const qx = p.x < c.x0 ? c.x0 : p.x > c.x1 ? c.x1 : p.x;
      const qz = p.z < c.z0 ? c.z0 : p.z > c.z1 ? c.z1 : p.z;
      let dx = p.x - qx, dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1e-10) {
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2), k = (r - d) / d;
        p.x += dx * k; p.z += dz * k; hit = true;
      } else {
        // centro dentro de la caja: salir por el lado más cercano
        const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z;
        const m = Math.min(l, rr, t, b);
        if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r;
        hit = true;
      }
    }
  }
  return hit;
}

/**
 * Mueve un círculo en sub-pasos (nunca atraviesa paredes aunque vaya rápido).
 * @param {Col[]} cols @param {{x:number,z:number}} p @param {number} r @param {number} dx @param {number} dz
 */
export function moveCircle(cols, p, r, dx, dz) {
  const len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / (r * 0.5)));
  let hit = false;
  for (let i = 0; i < n; i++) { p.x += dx / n; p.z += dz / n; if (pushOut(cols, p, r)) hit = true; }
  return hit;
}

/** ¿Un círculo cabe libre en (x,z)? @param {Col[]} cols */
export function freeAt(cols, x, z, r) {
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!c.on) continue;
    const qx = x < c.x0 ? c.x0 : x > c.x1 ? c.x1 : x, qz = z < c.z0 ? c.z0 : z > c.z1 ? c.z1 : z;
    if ((x - qx) ** 2 + (z - qz) ** 2 < r * r) return false;
  }
  return true;
}

/** Rayo 2D contra AABB: distancia o Infinity. @param {Col} c */
export function rayBox(ox, oz, dx, dz, c) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < c.x0 || ox > c.x1) return Infinity; }
  else { let a = (c.x0 - ox) / dx, b = (c.x1 - ox) / dx; if (a > b) { const t = a; a = b; b = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  if (Math.abs(dz) < 1e-9) { if (oz < c.z0 || oz > c.z1) return Infinity; }
  else { let a = (c.z0 - oz) / dz, b = (c.z1 - oz) / dz; if (a > b) { const t = a; a = b; b = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
  return tmax >= tmin ? tmin : Infinity;
}

/** ¿Hay pared entre a y b? (ignora colisionadores bajos, h < minH) @param {Col[]} cols */
export function losBlocked(cols, ax, az, bx, bz, minH = 1.2) {
  const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
  if (len < 1e-4) return false;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (!c.on || c.h < minH || c.tag === 'door' || c.tag === 'doorleaf' || c.tag === 'bound' || c.tag === 'bars') continue;
    const t = rayBox(ax, az, dx / len, dz / len, c);
    if (t > 0.05 && t < len - 0.05) return true;
  }
  return false;
}

/**
 * Fracción t∈(0,1] del segmento 3D a→b donde entra en la caja (0..h de alto), o Infinity. Para la cámara.
 * @param {Col} c
 */
export function segBox3(ax, ay, az, bx, by, bz, c) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? ax : i === 1 ? ay : az, d = (i === 0 ? bx : i === 1 ? by : bz) - o;
    const lo = i === 0 ? c.x0 : i === 1 ? -1 : c.z0, hi = i === 0 ? c.x1 : i === 1 ? c.h : c.z1;
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a; if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return t0 > 1e-3 ? t0 : Infinity;
}

/* ======================= navegación (grilla + A*) ======================= */
/**
 * Grilla de ocupación construida una vez por escena (los NPC la usan para rodear paredes).
 * @param {Col[]} cols @param {{x0:number,z0:number,x1:number,z1:number}} b @param {number} cell @param {number} inflate
 */
export function buildNav(cols, b, cell, inflate) {
  const w = Math.ceil((b.x1 - b.x0) / cell), h = Math.ceil((b.z1 - b.z0) / cell);
  const grid = new Uint8Array(w * h);
  for (const c of cols) {
    if (!c.on || c.tag === 'trigger') continue;
    const i0 = Math.max(0, Math.floor((c.x0 - inflate - b.x0) / cell)), i1 = Math.min(w - 1, Math.floor((c.x1 + inflate - b.x0) / cell));
    const j0 = Math.max(0, Math.floor((c.z0 - inflate - b.z0) / cell)), j1 = Math.min(h - 1, Math.floor((c.z1 + inflate - b.z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * w + i] = 1;
  }
  const gScore = new Float32Array(w * h), from = new Int32Array(w * h), closed = new Uint8Array(w * h);
  const heap = new Int32Array(w * h * 4), fh = new Float32Array(w * h * 4);
  const toCell = (x, z) => [Math.max(0, Math.min(w - 1, Math.floor((x - b.x0) / cell))), Math.max(0, Math.min(h - 1, Math.floor((z - b.z0) / cell)))];
  const center = (i, j) => [b.x0 + (i + 0.5) * cell, b.z0 + (j + 0.5) * cell];
  /** celda libre más cercana (búsqueda en anillos) */
  function nearestFree(i, j) {
    if (!grid[j * w + i]) return [i, j];
    for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < w && jj < h && !grid[jj * w + ii]) return [ii, jj];
    }
    return [i, j];
  }
  /**
   * Camino de (ax,az) a (bx,bz): lista plana [x,z,x,z…] o null.
   * @returns {number[]|null}
   */
  function path(ax, az, bx, bz) {
    let [si, sj] = toCell(ax, az), [ti, tj] = toCell(bx, bz);
    [si, sj] = nearestFree(si, sj); [ti, tj] = nearestFree(ti, tj);
    const s = sj * w + si, t = tj * w + ti;
    gScore.fill(Infinity); closed.fill(0); from.fill(-1);
    let n = 0;
    const push = (id, f) => { let k = n++; heap[k] = id; fh[k] = f; while (k > 0) { const p = (k - 1) >> 1; if (fh[p] <= fh[k]) break; const ti2 = heap[p], tf = fh[p]; heap[p] = heap[k]; fh[p] = fh[k]; heap[k] = ti2; fh[k] = tf; k = p; } };
    const pop = () => { const top = heap[0]; n--; heap[0] = heap[n]; fh[0] = fh[n]; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < n && fh[l] < fh[m]) m = l; if (r < n && fh[r] < fh[m]) m = r; if (m === k) break; const ti2 = heap[m], tf = fh[m]; heap[m] = heap[k]; fh[m] = fh[k]; heap[k] = ti2; fh[k] = tf; k = m; } return top; };
    const hfn = id => { const i = id % w, j = (id / w) | 0; const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    gScore[s] = 0; push(s, hfn(s));
    let found = false, iter = 0;
    while (n > 0 && iter++ < w * h) {
      const cur = pop();
      if (cur === t) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % w, cj = (cur / w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const id = nj * w + ni;
        if (grid[id] || closed[id]) continue;
        if (di && dj && (grid[cj * w + ni] || grid[nj * w + ci])) continue; // sin cortar esquinas
        const g = gScore[cur] + (di && dj ? 1.414 : 1);
        if (g < gScore[id]) { gScore[id] = g; from[id] = cur; push(id, g + hfn(id)); }
      }
      if (n >= heap.length - 8) break;
    }
    if (!found) return null;
    const cells = [];
    for (let c = t; c !== -1 && c !== s; c = from[c]) cells.push(c);
    cells.reverse();
    // suavizado: saltear celdas en línea recta libre
    const out = [];
    let li = si, lj = sj;
    for (let k = 0; k < cells.length; k++) {
      const nxt = k + 1 < cells.length ? cells[k + 1] : -1;
      if (nxt !== -1 && lineFree(li, lj, nxt % w, (nxt / w) | 0)) continue;
      const ci = cells[k] % w, cj = (cells[k] / w) | 0;
      const [x, z] = center(ci, cj); out.push(x, z); li = ci; lj = cj;
    }
    if (out.length) { out[out.length - 2] = bx; out[out.length - 1] = bz; }
    return out;
  }
  function lineFree(i0, j0, i1, j1) {
    const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0)) * 2;
    for (let k = 1; k <= n; k++) {
      const i = Math.round(i0 + (i1 - i0) * k / n), j = Math.round(j0 + (j1 - j0) * k / n);
      if (grid[j * w + i]) return false;
    }
    return true;
  }
  return { w, h, cell, grid, path, blocked: (x, z) => { const [i, j] = toCell(x, z); return !!grid[j * w + i]; } };
}
