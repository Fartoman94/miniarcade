// @ts-check
/* Portales Imposibles — matemática de teletransporte (pura, sin dependencias, sin asignaciones por cuadro).

   Cada portal tiene un marco ortonormal: p (centro), n (normal hacia afuera de la pared), u («arriba» del portal)
   y r = u × n (derecha vista desde el frente). Entrar por A y salir por B equivale a:
     local = (dot(x−pA, rA), dot(x−pA, uA), dot(x−pA, nA))
     local' = (−local.r, local.u, −local.n)          (giro de 180° alrededor de «arriba»)
     x' = pB + local'.r·rB + local'.u·uB + local'.n·nB
   Las direcciones (velocidad, mirada) usan lo mismo sin la traslación, así que la rapidez se conserva exacta:
   lo que cae a 12 m/s en un portal del piso sale a 12 m/s de un portal de pared («lanzamiento»). */

/** @typedef {{x:number,y:number,z:number}} V */
/** @typedef {{p:V, r:V, u:V, n:V}} Frame */

/** Marco a partir de posición, normal y un «arriba» aproximado (se ortogonaliza). @param {V} p @param {V} n @param {V} up @returns {Frame} */
export function makeFrame(p, n, up) {
  const nn = norm({ x: n.x, y: n.y, z: n.z });
  // arriba ortogonal a la normal
  const d = up.x * nn.x + up.y * nn.y + up.z * nn.z;
  const u = norm({ x: up.x - nn.x * d, y: up.y - nn.y * d, z: up.z - nn.z * d });
  const r = cross(u, nn);
  return { p: { x: p.x, y: p.y, z: p.z }, r, u, n: nn };
}
/** @param {V} a @param {V} b */
export function cross(a, b) { return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }; }
/** @param {V} v */
export function norm(v) { const l = Math.hypot(v.x, v.y, v.z) || 1; v.x /= l; v.y /= l; v.z /= l; return v; }

/** Coordenadas locales (r,u,n) de un punto respecto de un marco. @param {Frame} F @param {V} v @param {V} out */
export function toLocal(F, v, out) {
  const dx = v.x - F.p.x, dy = v.y - F.p.y, dz = v.z - F.p.z;
  const a = dx * F.r.x + dy * F.r.y + dz * F.r.z, b = dx * F.u.x + dy * F.u.y + dz * F.u.z, c = dx * F.n.x + dy * F.n.y + dz * F.n.z;
  out.x = a; out.y = b; out.z = c; return out;
}
/** Punto que entra por A → punto que sale por B. @param {Frame} A @param {Frame} B @param {V} v @param {V} out */
export function xfPoint(A, B, v, out) {
  const dx = v.x - A.p.x, dy = v.y - A.p.y, dz = v.z - A.p.z;
  const lr = -(dx * A.r.x + dy * A.r.y + dz * A.r.z), lu = dx * A.u.x + dy * A.u.y + dz * A.u.z, ln = -(dx * A.n.x + dy * A.n.y + dz * A.n.z);
  out.x = B.p.x + lr * B.r.x + lu * B.u.x + ln * B.n.x;
  out.y = B.p.y + lr * B.r.y + lu * B.u.y + ln * B.n.y;
  out.z = B.p.z + lr * B.r.z + lu * B.u.z + ln * B.n.z;
  return out;
}
/** Dirección/velocidad que entra por A → sale por B (conserva el módulo). @param {Frame} A @param {Frame} B @param {V} v @param {V} out */
export function xfDir(A, B, v, out) {
  const lr = -(v.x * A.r.x + v.y * A.r.y + v.z * A.r.z), lu = v.x * A.u.x + v.y * A.u.y + v.z * A.u.z, ln = -(v.x * A.n.x + v.y * A.n.y + v.z * A.n.z);
  out.x = lr * B.r.x + lu * B.u.x + ln * B.n.x;
  out.y = lr * B.r.y + lu * B.u.y + ln * B.n.y;
  out.z = lr * B.r.z + lu * B.u.z + ln * B.n.z;
  return out;
}
/** Matriz 4×4 (column-major, como THREE.Matrix4.elements) de A→B: M = F_B · diag(−1,1,−1) · F_A⁻¹.
 *  @param {Frame} A @param {Frame} B @param {number[]|Float32Array} e */
export function xfMatrix(A, B, e) {
  // columnas de la parte de rotación: imagen de los ejes del mundo
  const ex = xfDir(A, B, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  const ey = xfDir(A, B, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 });
  const ez = xfDir(A, B, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 });
  const t = xfPoint(A, B, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
  e[0] = ex.x; e[1] = ex.y; e[2] = ex.z; e[3] = 0;
  e[4] = ey.x; e[5] = ey.y; e[6] = ey.z; e[7] = 0;
  e[8] = ez.x; e[9] = ez.y; e[10] = ez.z; e[11] = 0;
  e[12] = t.x; e[13] = t.y; e[14] = t.z; e[15] = 1;
  return e;
}
/** Mirada (yaw, pitch) → vector. yaw 0 mira hacia −z; pitch positivo, hacia arriba. @param {number} yaw @param {number} pitch @param {V} out */
export function lookDir(yaw, pitch, out) {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c; out.y = Math.sin(pitch); out.z = -Math.cos(yaw) * c; return out;
}
/** Vector → (yaw, pitch). Si mira casi vertical conserva el yaw anterior. @param {V} d @param {number} prevYaw */
export function dirToYawPitch(d, prevYaw) {
  const h = Math.hypot(d.x, d.z);
  const pitch = Math.atan2(d.y, h);
  const yaw = h < 1e-4 ? prevYaw : Math.atan2(-d.x, -d.z);
  return { yaw, pitch };
}
/** Teletransporte completo de un cuerpo: posición, velocidad y mirada. Devuelve un objeto nuevo (para pruebas).
 *  @param {Frame} A @param {Frame} B @param {{pos:V, vel:V, yaw?:number, pitch?:number}} s */
export function teleport(A, B, s) {
  const pos = xfPoint(A, B, s.pos, { x: 0, y: 0, z: 0 });
  const vel = xfDir(A, B, s.vel, { x: 0, y: 0, z: 0 });
  let yaw = s.yaw ?? 0, pitch = s.pitch ?? 0;
  if (s.yaw !== undefined) {
    const f = xfDir(A, B, lookDir(yaw, pitch, { x: 0, y: 0, z: 0 }), { x: 0, y: 0, z: 0 });
    ({ yaw, pitch } = dirToYawPitch(f, yaw));
  }
  return { pos, vel, yaw, pitch };
}
