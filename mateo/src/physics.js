// Mateo: Ciudad de Altura — mundo de colisiones: cajas alineadas (AABB) en una grilla espacial, cápsula vertical
// del personaje con sub-pasos (sin atravesar paredes a alta velocidad), escalón automático, aterrizaje en techos,
// golpe de cabeza, contactos de pared (para correr por paredes) y rayos (cable, cámara).

const CELL = 16;
export class World {
  constructor() { this.boxes = []; this.grid = new Map(); this._nextId = 0; this.bound = { minX: -205, maxX: 205, minZ: -205, maxZ: 205 }; this.waterX = 1e9; this.floors = null; }
  /**
   * ¿hay piso firme (calle/muelle) en (x,z)? Si hay rectángulos de piso (floors) sólo ellos son tierra y el resto es
   * agua (V2: antes sólo se miraba x y había un piso invisible al norte/sur del muelle).
   */
  hasFloor(x, z = 0) {
    if (this.floors) { for (const f of this.floors) if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return true; return false; }
    return x < this.waterX;
  }
  /** piso firme con margen m en las cuatro direcciones (punto seguro para reaparecer) */
  safeFloor(x, z, m = 3) { return this.hasFloor(x + m, z) && this.hasFloor(x - m, z) && this.hasFloor(x, z + m) && this.hasFloor(x, z - m); }
  /** @param {{minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number}} b */
  add(b, kind = 'building', extra = {}) {
    const box = { ...b, kind, id: this._nextId++, ...extra };
    this.boxes.push(box);
    for (let i = Math.floor(b.minX / CELL); i <= Math.floor(b.maxX / CELL); i++)
      for (let k = Math.floor(b.minZ / CELL); k <= Math.floor(b.maxZ / CELL); k++) {
        const key = i * 4096 + k; let l = this.grid.get(key); if (!l) this.grid.set(key, l = []); l.push(box);
      }
    return box;
  }
  /** quita cajas (streaming de sectores): de la lista y de la grilla espacial */
  remove(list) {
    if (!list || !list.length) return 0;
    const dead = new Set(list.map(b => b.id));
    for (const b of list) for (let i = Math.floor(b.minX / CELL); i <= Math.floor(b.maxX / CELL); i++)
      for (let k = Math.floor(b.minZ / CELL); k <= Math.floor(b.maxZ / CELL); k++) {
        const key = i * 4096 + k, l = this.grid.get(key); if (!l) continue;
        const f = l.filter(x => !dead.has(x.id)); if (f.length) this.grid.set(key, f); else this.grid.delete(key);
      }
    const n = this.boxes.length; this.boxes = this.boxes.filter(x => !dead.has(x.id));
    return n - this.boxes.length;
  }
  /** caja con centro/medidas */
  addBox(x, y, z, w, h, d, kind, extra) { return this.add({ minX: x - w / 2, maxX: x + w / 2, minY: y, maxY: y + h, minZ: z - d / 2, maxZ: z + d / 2 }, kind, extra); }
  near(minX, minZ, maxX, maxZ, out) {
    out.length = 0; const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++)
      for (let k = Math.floor(minZ / CELL); k <= Math.floor(maxZ / CELL); k++) {
        const l = this.grid.get(i * 4096 + k); if (!l) continue;
        for (const b of l) if (!seen.has(b.id)) { seen.add(b.id); out.push(b); }
      }
    return out;
  }
  /** Altura del suelo bajo (x,z) considerando cajas cuyo techo está por debajo de yMax. */
  groundAt(x, z, yMax = 1e9) {
    let h = this.hasFloor(x, z) ? 0 : -30;
    for (const b of this.near(x, z, x, z, this._tmp || (this._tmp = [])))
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.maxY <= yMax + 0.01 && b.maxY > h) h = b.maxY;
    return h;
  }
  /**
   * Mueve una cápsula (pos = pies) con velocidad vel durante dt. Devuelve contactos.
   * o: {r, h, step, grounded}
   */
  moveCapsule(pos, vel, dt, o, res) {
    res.ground = false; res.wall = false; res.wallNx = 0; res.wallNz = 0; res.ceiling = false; res.groundBox = null; res.wallBox = null; res.stepped = false;
    const dist = Math.hypot(vel.x, vel.y, vel.z) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.22));
    const sdt = dt / n, list = this._list || (this._list = []);
    for (let s = 0; s < n; s++) {
      // horizontal
      pos.x += vel.x * sdt; pos.z += vel.z * sdt;
      this.near(pos.x - o.r - 1, pos.z - o.r - 1, pos.x + o.r + 1, pos.z + o.r + 1, list);
      for (const b of list) {
        if (b.maxY <= pos.y + 0.001 || b.minY >= pos.y + o.h) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= o.r * o.r) continue;
        // escalón: si el techo de la caja está a poca altura y estábamos en el piso, subir
        const rise = b.maxY - pos.y;
        if (rise > 0 && rise <= o.step && (o.grounded || vel.y <= 0)) { pos.y = b.maxY; res.stepped = true; continue; }
        let d = Math.sqrt(d2);
        if (d < 1e-5) { // centro adentro: salir por la cara más cercana
          const ex = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z], m = Math.min(...ex), i = ex.indexOf(m);
          dx = i === 0 ? -1 : i === 1 ? 1 : 0; dz = i === 2 ? -1 : i === 3 ? 1 : 0; d = 0;
          pos.x += dx * (m + o.r); pos.z += dz * (m + o.r);
        } else { dx /= d; dz /= d; pos.x += dx * (o.r - d); pos.z += dz * (o.r - d); }
        const vn = vel.x * dx + vel.z * dz;
        if (vn < 0) { vel.x -= vn * dx; vel.z -= vn * dz; }
        res.wall = true; res.wallNx = dx; res.wallNz = dz; res.wallBox = b;
      }
      // vertical
      const py = pos.y;
      pos.y += vel.y * sdt;
      this.near(pos.x - o.r, pos.z - o.r, pos.x + o.r, pos.z + o.r, list);
      for (const b of list) {
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        if (dx * dx + dz * dz >= (o.r * 0.92) ** 2) continue;
        if (vel.y <= 0 && py >= b.maxY - 0.05 && pos.y < b.maxY) { pos.y = b.maxY; vel.y = 0; res.ground = true; res.groundBox = b; }
        else if (vel.y > 0 && py + o.h <= b.minY + 0.05 && pos.y + o.h > b.minY) { pos.y = b.minY - o.h; vel.y = 0; res.ceiling = true; }
      }
      if (pos.y <= 0 && this.hasFloor(pos.x, pos.z)) { pos.y = 0; if (vel.y < 0) vel.y = 0; res.ground = true; }
    }
    // apoyo: pisar sin moverse verticalmente también cuenta
    if (!res.ground && vel.y <= 0) { const g = this.groundAt(pos.x, pos.z, pos.y + 0.02); if (pos.y - g < 0.03) { pos.y = g; res.ground = true; } }
    const B = this.bound;
    if (pos.x < B.minX) { pos.x = B.minX; res.wall = true; res.wallNx = 1; res.wallNz = 0; } else if (pos.x > B.maxX) { pos.x = B.maxX; res.wall = true; res.wallNx = -1; res.wallNz = 0; }
    if (pos.z < B.minZ) { pos.z = B.minZ; res.wall = true; res.wallNx = 0; res.wallNz = 1; } else if (pos.z > B.maxZ) { pos.z = B.maxZ; res.wall = true; res.wallNx = 0; res.wallNz = -1; }
    return res;
  }
  /**
   * Barrido de esfera (radio rad) contra las cajas: rayo contra cada caja inflada en rad (suma de Minkowski aproximada
   * por una caja; es conservadora en las esquinas, nunca deja pasar la esfera a través de una cara).
   * Si el origen ya está dentro de una caja inflada devuelve t = 0 e inside = true.
   */
  sphereCast(ox, oy, oz, dx, dy, dz, far, rad, filter) {
    let best = null;
    const minX = Math.min(ox, ox + dx * far) - rad, maxX = Math.max(ox, ox + dx * far) + rad, minZ = Math.min(oz, oz + dz * far) - rad, maxZ = Math.max(oz, oz + dz * far) + rad;
    const list = this.near(minX, minZ, maxX, maxZ, this._sl || (this._sl = []));
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (const b of list) {
      if (filter && !filter(b)) continue;
      const mn = [b.minX - rad, b.minY - rad, b.minZ - rad], mx = [b.maxX + rad, b.maxY + rad, b.maxZ + rad];
      let t0 = 0, t1 = far, ok = true, n = -1, sgn = 0;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) { ok = false; break; } continue; }
        let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a], s = -1;
        if (ta > tb) { const t = ta; ta = tb; tb = t; s = 1; }
        if (ta > t0) { t0 = ta; n = a; sgn = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (!ok || (best && t0 >= best.t)) continue;
      best = { t: t0, box: b, nx: n === 0 ? sgn : 0, ny: n === 1 ? sgn : 0, nz: n === 2 ? sgn : 0, inside: n < 0 };
    }
    return best;
  }
  /** Saca un punto (esfera de radio rad) de las cajas que lo contienen, por la cara más cercana (o por arriba). */
  pushOut(p, rad, filter) {
    let moved = false;
    for (const b of this.near(p.x - rad, p.z - rad, p.x + rad, p.z + rad, this._pl || (this._pl = []))) {
      if (filter && !filter(b)) continue;
      if (p.x <= b.minX - rad || p.x >= b.maxX + rad || p.y <= b.minY - rad || p.y >= b.maxY + rad || p.z <= b.minZ - rad || p.z >= b.maxZ + rad) continue;
      const ex = [p.x - (b.minX - rad), b.maxX + rad - p.x, p.z - (b.minZ - rad), b.maxZ + rad - p.z, b.maxY + rad - p.y];
      const m = Math.min(...ex), i = ex.indexOf(m);
      if (i === 0) p.x -= m; else if (i === 1) p.x += m; else if (i === 2) p.z -= m; else if (i === 3) p.z += m; else p.y += m;
      moved = true;
    }
    return moved;
  }
  /** Rayo contra cajas (método de losas). Devuelve {t, box, nx, ny, nz, x, y, z} o null. */
  raycast(ox, oy, oz, dx, dy, dz, far, filter) {
    let best = null;
    const minX = Math.min(ox, ox + dx * far), maxX = Math.max(ox, ox + dx * far), minZ = Math.min(oz, oz + dz * far), maxZ = Math.max(oz, oz + dz * far);
    const list = far > 120 ? this.boxes : this.near(minX, minZ, maxX, maxZ, this._rl || (this._rl = []));
    for (const b of list) {
      if (filter && !filter(b)) continue;
      let t0 = 0, t1 = far, n = -1, sgn = 0;
      const o = [ox, oy, oz], d = [dx, dy, dz], mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
      let ok = true;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) { ok = false; break; } continue; }
        let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a], s = -1;
        if (ta > tb) { const t = ta; ta = tb; tb = t; s = 1; }
        if (ta > t0) { t0 = ta; n = a; sgn = s; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
      if (!ok || n < 0 || (best && t0 >= best.t)) continue;
      best = { t: t0, box: b, nx: n === 0 ? sgn : 0, ny: n === 1 ? sgn : 0, nz: n === 2 ? sgn : 0, x: ox + dx * t0, y: oy + dy * t0, z: oz + dz * t0 };
    }
    return best;
  }
}
