// @ts-check
/* Carrera Vertical — modelos low-poly procedurales: constructor de geometría con color por vértice,
   texturas de fachada generadas en canvas, corredor articulado, drones, torretas, dron jefe y utilería. */
import { THREE } from '../../matelabs/kit3d.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
const UNIT = [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]];
// caras del cubo unidad: índices de esquina (sentido antihorario visto desde afuera) y normal
const FACES = [
  { i: [1, 2, 6, 5], n: [1, 0, 0] }, { i: [4, 7, 3, 0], n: [-1, 0, 0] },
  { i: [3, 7, 6, 2], n: [0, 1, 0] }, { i: [0, 1, 5, 4], n: [0, -1, 0] },
  { i: [5, 6, 7, 4], n: [0, 0, 1] }, { i: [0, 3, 2, 1], n: [0, 0, -1] },
];

/** Constructor de geometría: triángulos sueltos con color por vértice (y UV de mundo opcional). */
export function geoBuilder(withUV = false) {
  /** @type {number[]} */ const P = [], N = [], C = [], U = [];
  function tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, r, g, b) {
    P.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    N.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    C.push(r, g, b, r, g, b, r, g, b);
  }
  const api = {
    /** cuadrilátero (a,b,c,d en sentido antihorario) */
    quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, hex, uv) {
      _c.set(hex);
      tri(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, _c.r, _c.g, _c.b);
      tri(ax, ay, az, cx, cy, cz, dx, dy, dz, nx, ny, nz, _c.r, _c.g, _c.b);
      if (withUV) { if (uv) U.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]); else for (let i = 0; i < 12; i++) U.push(0); }
    },
    /** caja alineada a ejes por esquinas. faces: máscara (bit0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z). top: color de la tapa */
    box(x0, y0, z0, x1, y1, z1, hex, faces = 63, top = -1) {
      const X = [x0, x1], Y = [y0, y1], Z = [z0, z1];
      for (let f = 0; f < 6; f++) {
        if (!(faces & (1 << f))) continue;
        const F = FACES[f], q = F.i.map(k => UNIT[k]);
        const pt = q.map(u => [X[u[0] > 0 ? 1 : 0], Y[u[1] > 0 ? 1 : 0], Z[u[2] > 0 ? 1 : 0]]);
        let uv = null;
        if (withUV) {
          // UV de mundo: fachadas a 4 m por mosaico
          uv = [];
          for (const p of pt) { const hor = F.n[0] !== 0 ? p[2] : p[0]; uv.push((F.n[0] > 0 || F.n[2] < 0 ? -hor : hor) / 4, p[1] / 4); }
          if (F.n[1] !== 0) { uv = []; for (const p of pt) uv.push(p[0] / 4, p[2] / 4); }
        }
        api.quad(pt[0][0], pt[0][1], pt[0][2], pt[1][0], pt[1][1], pt[1][2], pt[2][0], pt[2][1], pt[2][2], pt[3][0], pt[3][1], pt[3][2], F.n[0], F.n[1], F.n[2], f === 2 && top >= 0 ? top : hex, uv);
      }
      return api;
    },
    /** caja por centro (cy = centro) con rotación opcional (yaw, pitch, roll) */
    boxC(cx, cy, cz, w, h, d, hex, ry = 0, rx = 0, rz = 0) {
      if (!ry && !rx && !rz) return api.box(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, hex);
      _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(cx, cy, cz); _s.set(w, h, d);
      _m.compose(_p, _q, _s);
      return api.boxM(_m, hex);
    },
    /** caja unidad transformada por una matriz */
    boxM(m, hex) {
      _nm.getNormalMatrix(m);
      for (const F of FACES) {
        const pts = F.i.map(k => _v.set(UNIT[k][0], UNIT[k][1], UNIT[k][2]).applyMatrix4(m).toArray());
        _n.set(F.n[0], F.n[1], F.n[2]).applyMatrix3(_nm).normalize();
        api.quad(pts[0][0], pts[0][1], pts[0][2], pts[1][0], pts[1][1], pts[1][2], pts[2][0], pts[2][1], pts[2][2], pts[3][0], pts[3][1], pts[3][2], _n.x, _n.y, _n.z, hex, null);
      }
      return api;
    },
    /** caja que une dos puntos (vigas, cables gruesos) */
    beam(ax, ay, az, bx, by, bz, t, hex) {
      const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
      _p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      _v.set(dx / len, dy / len, dz / len);
      _q.setFromUnitVectors(_n.set(0, 1, 0), _v);
      _s.set(t, len, t);
      _m.compose(_p, _q, _s);
      return api.boxM(_m, hex);
    },
    /** prisma vertical de n lados (cilindro low-poly) */
    cyl(cx, y0, cz, r0, r1, h, n, hex, capTop = true, capBot = false) {
      _c.set(hex);
      const r = _c.r, g = _c.g, b = _c.b;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
        const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
        const nx = Math.cos(am), nz = Math.sin(am);
        tri(cx + x0 * r0, y0, cz + z0 * r0, cx + x1 * r1, y0 + h, cz + z1 * r1, cx + x1 * r0, y0, cz + z1 * r0, nx, 0, nz, r, g, b);
        tri(cx + x0 * r0, y0, cz + z0 * r0, cx + x0 * r1, y0 + h, cz + z0 * r1, cx + x1 * r1, y0 + h, cz + z1 * r1, nx, 0, nz, r, g, b);
        if (withUV) for (let k = 0; k < 12; k++) U.push(0);
        if (capTop) { tri(cx, y0 + h, cz, cx + x1 * r1, y0 + h, cz + z1 * r1, cx + x0 * r1, y0 + h, cz + z0 * r1, 0, 1, 0, r, g, b); if (withUV) for (let k = 0; k < 6; k++) U.push(0); }
        if (capBot) { tri(cx, y0, cz, cx + x0 * r0, y0, cz + z0 * r0, cx + x1 * r0, y0, cz + z1 * r0, 0, -1, 0, r, g, b); if (withUV) for (let k = 0; k < 6; k++) U.push(0); }
      }
      return api;
    },
    /** disco horizontal */
    disc(cx, cy, cz, rad, n, hex, down = false) {
      _c.set(hex);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        if (down) tri(cx, cy, cz, cx + Math.cos(a0) * rad, cy, cz + Math.sin(a0) * rad, cx + Math.cos(a1) * rad, cy, cz + Math.sin(a1) * rad, 0, -1, 0, _c.r, _c.g, _c.b);
        else tri(cx, cy, cz, cx + Math.cos(a1) * rad, cy, cz + Math.sin(a1) * rad, cx + Math.cos(a0) * rad, cy, cz + Math.sin(a0) * rad, 0, 1, 0, _c.r, _c.g, _c.b);
        if (withUV) for (let k = 0; k < 6; k++) U.push(0);
      }
      return api;
    },
    get count() { return P.length / 3; },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      if (withUV) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    },
  };
  return api;
}

/* ======================= texturas de fachada ======================= */
/** Canvas de ventanas: color (claro, se tiñe por vértice) + emisivo (sólo ventanas encendidas). */
export function facadeTextures(seed = 7) {
  const S = 256, cols = 4, rows = 4;
  const base = document.createElement('canvas'); base.width = base.height = S;
  const emi = document.createElement('canvas'); emi.width = emi.height = S;
  const b = /** @type {CanvasRenderingContext2D} */ (base.getContext('2d')), e = /** @type {CanvasRenderingContext2D} */ (emi.getContext('2d'));
  let a = seed >>> 0; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  b.fillStyle = '#e9e4dc'; b.fillRect(0, 0, S, S);
  // bandas de losa entre pisos
  b.fillStyle = '#cfc8bd'; for (let r = 0; r < rows; r++) b.fillRect(0, r * S / rows, S, 6);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  const cw = S / cols, rh = S / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cw + cw * 0.18, y = r * rh + rh * 0.24, w = cw * 0.64, h = rh * 0.56;
    const lit = rnd() < 0.38;
    b.fillStyle = lit ? '#ffe2a8' : '#3a4656'; b.fillRect(x, y, w, h);
    b.fillStyle = lit ? '#f7c97a' : '#2b3442'; b.fillRect(x, y + h * 0.55, w, h * 0.45);
    b.fillStyle = 'rgba(255,255,255,.18)'; b.fillRect(x + 3, y + 3, w * 0.3, h * 0.35);
    b.fillStyle = '#b9b2a6'; b.fillRect(x + w / 2 - 1.5, y, 3, h); b.fillRect(x - 3, y + h, w + 6, 4);
    if (lit) { const hue = rnd() < 0.25 ? '#7fe8ff' : rnd() < 0.2 ? '#ff7ad9' : '#ffd28a'; e.fillStyle = hue; e.fillRect(x, y, w, h); }
  }
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t; };
  return { map: mk(base), emissive: mk(emi) };
}

/** Textura de franjas (barreras, bordes de seguridad). */
export function stripeTexture(c1 = '#ffd23a', c2 = '#1b1b1b') {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  g.fillStyle = c2; g.fillRect(0, 0, 64, 64); g.fillStyle = c1;
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 80, 64); g.lineTo(i + 64, 64); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Textura del grafiti de ruta alternativa (flecha + texto). */
export function graffitiTexture(color = '#ff7a2f') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  g.clearRect(0, 0, 256, 128);
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(24, 96); g.quadraticCurveTo(110, 20, 200, 52); g.stroke();
  g.beginPath(); g.moveTo(232, 60); g.lineTo(184, 26); g.lineTo(186, 84); g.closePath(); g.fill();
  g.font = '900 30px system-ui,sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 6;
  g.strokeText('ATAJO', 34, 120); g.fillText('ATAJO', 34, 120);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ======================= materiales compartidos ======================= */
export function createMaterials() {
  const tex = facadeTextures(11);
  const stripes = stripeTexture();
  const m = {
    tex, stripes,
    facade: new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.map, emissiveMap: tex.emissive, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.82, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02, flatShading: true }),
    prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15, flatShading: true }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    runner: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, flatShading: true }),
    ghost: new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.32, depthWrite: false }),
    stripe: new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }),
    glowAdd: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
    beamRed: new THREE.MeshBasicMaterial({ color: 0xff3348, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    padOn: new THREE.MeshBasicMaterial({ color: 0x46f0ff, toneMapped: false }),
    padOff: new THREE.MeshBasicMaterial({ color: 0x1d4b55, toneMapped: false }),
    launchOn: new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false }),
    cable: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.5, metalness: 0.7 }),
    clock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6, emissive: 0x6b4a00, emissiveIntensity: 0.6, flatShading: true }),
    blob: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    marker: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    spot: new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.26, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    spotRed: new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    cone: new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }),
    sky: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
    ground: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 1 }),
    skyline: new THREE.MeshStandardMaterial({ map: tex.map.clone(), emissiveMap: tex.emissive.clone(), emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.9 }),
    particle: new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false }),
  };
  for (const k of ['map', 'emissiveMap']) { const t = /** @type {any} */ (m.skyline)[k]; t.repeat.set(3, 6); t.needsUpdate = true; }
  return m;
}

/* ======================= corredor ======================= */
/** Corredor articulado (7 mallas que comparten material) con poses procedurales. */
export function makeRunner(mat, colors = { hood: 0xff7a2f, pants: 0x27303d, skin: 0xe0a77a, shoe: 0xf4f4f4, hair: 0x2a1a12, trim: 0x1d1d1d }) {
  const g = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; g.add(hips);
  // torso + cabeza + mochila
  const tb = geoBuilder();
  tb.box(-0.22, 0, -0.13, 0.22, 0.58, 0.13, colors.hood);
  tb.box(-0.23, 0.42, -0.14, 0.23, 0.5, 0.14, colors.trim); // franja
  tb.box(-0.15, 0.04, -0.24, 0.15, 0.42, -0.12, 0x3b4452); // mochila
  tb.box(-0.09, 0.3, -0.27, 0.09, 0.38, -0.23, colors.hood);
  tb.box(-0.06, 0.58, -0.06, 0.06, 0.66, 0.06, colors.skin); // cuello
  tb.box(-0.14, 0.66, -0.15, 0.14, 0.95, 0.14, colors.skin); // cabeza
  tb.box(-0.15, 0.86, -0.16, 0.15, 0.99, 0.15, colors.hair); // pelo
  tb.box(-0.15, 0.7, -0.16, 0.15, 0.88, -0.1, colors.hair);
  tb.box(-0.16, 0.84, 0.05, 0.16, 0.9, 0.26, colors.hood); // visera
  tb.box(-0.11, 0.76, 0.14, 0.11, 0.81, 0.16, 0x16222c); // anteojos
  tb.box(-0.16, 0.58, -0.17, 0.16, 0.72, 0.06, colors.hood); // capucha baja
  const torso = new THREE.Mesh(tb.build(), mat); hips.add(torso);
  const limb = (len, w, c1, c2, foot) => {
    const b = geoBuilder();
    b.box(-w / 2, -len * 0.52, -w / 2, w / 2, 0, w / 2, c1);
    b.box(-w / 2 * 0.9, -len, -w / 2 * 0.9, w / 2 * 0.9, -len * 0.52, w / 2 * 0.9, c2);
    if (foot) b.box(-w / 2 - 0.01, -len - 0.08, -w / 2 - 0.02, w / 2 + 0.01, -len + 0.02, w / 2 + 0.14, foot);
    return b.build();
  };
  const armGeo = limb(0.6, 0.12, colors.hood, colors.skin, 0);
  const thighGeo = (() => { const b = geoBuilder(); b.box(-0.085, -0.47, -0.09, 0.085, 0, 0.09, colors.pants); return b.build(); })();
  const shinGeo = (() => { const b = geoBuilder(); b.box(-0.075, -0.4, -0.08, 0.075, 0, 0.08, colors.pants); b.box(-0.085, -0.5, -0.1, 0.085, -0.38, 0.2, colors.shoe); b.box(-0.086, -0.52, -0.1, 0.086, -0.48, 0.21, 0x9aa3ad); return b.build(); })();
  const mk = (geo, x, y, z, parent) => { const pv = new THREE.Group(); pv.position.set(x, y, z); const me = new THREE.Mesh(geo, mat); pv.add(me); parent.add(pv); return pv; };
  const armL = mk(armGeo, -0.29, 0.52, 0, hips), armR = mk(armGeo, 0.29, 0.52, 0, hips);
  const thighL = mk(thighGeo, -0.11, 0, 0, hips), thighR = mk(thighGeo, 0.11, 0, 0, hips);
  const shinL = mk(shinGeo, 0, -0.47, 0, thighL), shinR = mk(shinGeo, 0, -0.47, 0, thighR);
  g.traverse(o => { if (/** @type {any} */ (o).isMesh) { o.castShadow = true; } });
  return { group: g, hips, torso, armL, armR, thighL, thighR, shinL, shinR, phase: 0 };
}

/** Aplica una pose al corredor. pose: 0 correr/quieto, 1 aire, 2 deslizar, 3 pared, 4 tirolina, 5 trepar, 6 rodar
 * @param {ReturnType<typeof makeRunner>} R @param {number} pose @param {number} speed @param {number} phase @param {number} side lado de la pared (-1/1) */
export function poseRunner(R, pose, speed, phase, side = 0, vy = 0) {
  const s = Math.sin(phase), c = Math.cos(phase);
  const k = Math.min(1, speed / 9);
  R.hips.position.y = 0.95; R.hips.rotation.set(0, 0, 0); R.torso.rotation.set(0, 0, 0);
  R.armL.rotation.set(0, 0, 0); R.armR.rotation.set(0, 0, 0);
  if (pose === 0) {
    if (speed < 0.4) { // quieto: respiración
      R.thighL.rotation.x = R.thighR.rotation.x = 0; R.shinL.rotation.x = R.shinR.rotation.x = 0.04;
      R.armL.rotation.z = -0.12; R.armR.rotation.z = 0.12; R.torso.rotation.x = Math.sin(phase * 0.25) * 0.03;
      return;
    }
    R.thighL.rotation.x = s * 1.0 * k; R.thighR.rotation.x = -s * 1.0 * k;
    R.shinL.rotation.x = (0.25 + Math.max(0, -c) * 1.4) * k; R.shinR.rotation.x = (0.25 + Math.max(0, c) * 1.4) * k;
    R.armL.rotation.x = -s * 1.1 * k; R.armR.rotation.x = s * 1.1 * k;
    R.armL.rotation.z = -0.1; R.armR.rotation.z = 0.1;
    R.torso.rotation.x = 0.18 * k; R.hips.position.y = 0.95 + Math.abs(c) * 0.06 * k;
  } else if (pose === 1) {
    const up = vy > 0 ? 1 : 0;
    R.thighL.rotation.x = up ? 1.1 : 0.5; R.thighR.rotation.x = up ? -0.3 : 0.2;
    R.shinL.rotation.x = up ? 1.5 : 0.8; R.shinR.rotation.x = up ? 0.6 : 0.4;
    R.armL.rotation.x = -1.6; R.armR.rotation.x = 0.4; R.armL.rotation.z = -0.4; R.armR.rotation.z = 0.5;
    R.torso.rotation.x = 0.12;
  } else if (pose === 2) {
    R.hips.position.y = 0.38; R.hips.rotation.x = -0.75;
    R.thighL.rotation.x = 1.5; R.shinL.rotation.x = 0.1; R.thighR.rotation.x = 0.9; R.shinR.rotation.x = 1.6;
    R.armL.rotation.x = -0.4; R.armL.rotation.z = -0.9; R.armR.rotation.x = 0.6; R.armR.rotation.z = 1.1;
    R.torso.rotation.x = 0.2;
  } else if (pose === 3) {
    R.hips.rotation.z = -side * 0.42;
    R.thighL.rotation.x = s * 1.1; R.thighR.rotation.x = -s * 1.1;
    R.shinL.rotation.x = 0.3 + Math.max(0, -c) * 1.4; R.shinR.rotation.x = 0.3 + Math.max(0, c) * 1.4;
    if (side > 0) { R.armR.rotation.z = 1.2; R.armL.rotation.x = -s; } else { R.armL.rotation.z = -1.2; R.armR.rotation.x = s; }
    R.torso.rotation.x = 0.15;
  } else if (pose === 4) {
    R.armL.rotation.x = R.armR.rotation.x = Math.PI; R.armL.rotation.z = 0.15; R.armR.rotation.z = -0.15;
    R.thighL.rotation.x = 0.9 + Math.sin(phase * 0.5) * 0.15; R.thighR.rotation.x = 0.5; R.shinL.rotation.x = 1.2; R.shinR.rotation.x = 1.0;
    R.hips.position.y = 0.6;
  } else if (pose === 5) {
    R.armL.rotation.x = -2.4 - s * 0.5; R.armR.rotation.x = -2.4 + s * 0.5;
    R.thighL.rotation.x = 0.9 + s * 0.6; R.thighR.rotation.x = 0.9 - s * 0.6; R.shinL.rotation.x = R.shinR.rotation.x = 1.2;
    R.torso.rotation.x = -0.1;
  } else if (pose === 6) {
    R.hips.position.y = 0.5; R.hips.rotation.x = phase;
    R.thighL.rotation.x = R.thighR.rotation.x = 1.9; R.shinL.rotation.x = R.shinR.rotation.x = 2.2;
    R.armL.rotation.x = R.armR.rotation.x = -1.2;
  }
}

/* ======================= rivales ======================= */
export function droneGeo() {
  const b = geoBuilder();
  b.cyl(0, -0.22, 0, 0.55, 0.5, 0.42, 8, 0x2c333d, true, true);
  b.cyl(0, 0.2, 0, 0.42, 0.2, 0.18, 8, 0xe9eef2);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a), z = Math.sin(a);
    b.beam(x * 0.4, 0, z * 0.4, x * 1.05, 0.05, z * 1.05, 0.1, 0x3b4452);
    b.cyl(x * 1.1, 0.0, z * 1.1, 0.1, 0.1, 0.18, 6, 0x1d2228);
    b.disc(x * 1.1, 0.2, z * 1.1, 0.42, 10, 0x9fb2c2);
  }
  b.box(-0.3, -0.33, 0.35, 0.3, -0.12, 0.5, 0x1d2228);
  return b.build();
}
export function droneEyeGeo() { const b = geoBuilder(); b.box(-0.18, -0.3, 0.48, 0.18, -0.14, 0.56, 0xffffff); b.disc(0, -0.25, 0, 0.22, 8, 0xffffff, true); return b.build(); }

export function turretGeo() {
  const b = geoBuilder();
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; b.beam(0, 1.1, 0, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8, 0.1, 0x3b4452); }
  b.cyl(0, 0.9, 0, 0.3, 0.3, 0.35, 8, 0x222831);
  return b.build();
}
export function turretHeadGeo() {
  const b = geoBuilder();
  b.box(-0.36, -0.26, -0.4, 0.36, 0.28, 0.3, 0xdfe5ea);
  b.box(-0.37, 0.12, -0.41, 0.37, 0.2, 0.31, 0xff7a2f);
  b.box(-0.09, -0.08, 0.3, 0.09, 0.1, 0.95, 0x2a2f36);
  b.cyl(0, 0.28, -0.1, 0.25, 0.05, 0.25, 6, 0x9aa3ad);
  b.box(-0.2, -0.1, 0.28, -0.12, 0.0, 0.34, 0x1d2228);
  return b.build();
}

/** Dron jefe (≈7 m de envergadura). */
export function bossGeo() {
  const b = geoBuilder();
  b.cyl(0, -1.1, 0, 1.9, 2.3, 1.2, 8, 0x262c35, true, true);
  b.cyl(0, 0.1, 0, 2.3, 1.4, 0.8, 8, 0x3b4452);
  b.cyl(0, 0.9, 0, 1.4, 0.5, 0.5, 8, 0xd8dee4);
  b.box(-2.6, -0.5, -0.5, 2.6, -0.1, 0.5, 0xff3348);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a), z = Math.sin(a);
    b.beam(x * 1.8, 0.1, z * 1.8, x * 3.6, 0.4, z * 3.6, 0.45, 0x2c333d);
    b.cyl(x * 3.8, -0.1, z * 3.8, 0.9, 0.9, 0.55, 10, 0x1d2228, true, true);
  }
  b.box(-0.15, 1.4, -0.15, 0.15, 3.0, 0.15, 0x9aa3ad);
  b.box(-0.7, -1.9, 0.6, 0.7, -1.1, 1.6, 0x1d2228); // cañón
  b.box(-0.35, -1.6, 1.5, 0.35, -1.25, 2.6, 0x2a2f36);
  return b.build();
}
export function bossRotorGeo() { const b = geoBuilder(); for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; b.disc(Math.cos(a) * 3.8, 0.5, Math.sin(a) * 3.8, 1.9, 14, 0xb8c8d6); } return b.build(); }
export function bossEyeGeo() { const b = geoBuilder(); b.cyl(0, -1.45, 0, 1.0, 0.7, 0.36, 10, 0xffffff, false, true); b.box(-0.9, -0.95, 1.75, 0.9, -0.55, 2.0, 0xffffff); return b.build(); }

/* ======================= utilería interactiva ======================= */
export function padGeo(launch = false) {
  const b = geoBuilder();
  // chevrones apuntando a +z (se rota según la dirección)
  for (let i = 0; i < 3; i++) {
    const z = -0.8 + i * 0.7;
    b.quad(-0.9, 0.06, z, -0.9, 0.06, z + 0.25, 0, 0.06, z + 0.75, 0, 0.06, z + 0.5, 0, 1, 0, 0xffffff);
    b.quad(0, 0.06, z + 0.5, 0, 0.06, z + 0.75, 0.9, 0.06, z + 0.25, 0.9, 0.06, z, 0, 1, 0, 0xffffff);
  }
  if (launch) b.disc(0, 0.065, 0, 0.5, 10, 0xffffff);
  return b.build();
}
export function padBaseGeo() { const b = geoBuilder(); b.box(-1.2, 0, -1.4, 1.2, 0.05, 1.4, 0x1d2228); b.box(-1.25, 0, -1.45, 1.25, 0.04, -1.3, 0xffd23a); b.box(-1.25, 0, 1.3, 1.25, 0.04, 1.45, 0xffd23a); return b.build(); }

export function clockGeo() {
  const b = geoBuilder();
  // reloj de bolsillo: disco vertical (eje z) con aro, corona y agujas
  const n = 14, R = 0.42;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    b.quad(Math.cos(a1) * R, Math.sin(a1) * R, 0.08, Math.cos(a0) * R, Math.sin(a0) * R, 0.08, Math.cos(a0) * R, Math.sin(a0) * R, -0.08, Math.cos(a1) * R, Math.sin(a1) * R, -0.08, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2), 0, 0xffc93a);
    b.quad(0, 0, 0.09, Math.cos(a0) * R * 0.86, Math.sin(a0) * R * 0.86, 0.09, Math.cos(a1) * R * 0.86, Math.sin(a1) * R * 0.86, 0.09, 0, 0, 0.09, 0, 0, 1, 0xfff6dc);
    b.quad(0, 0, -0.09, Math.cos(a1) * R * 0.86, Math.sin(a1) * R * 0.86, -0.09, Math.cos(a0) * R * 0.86, Math.sin(a0) * R * 0.86, -0.09, 0, 0, -0.09, 0, 0, -1, 0xfff6dc);
    b.quad(Math.cos(a1) * R * 0.86, Math.sin(a1) * R * 0.86, 0.085, Math.cos(a0) * R * 0.86, Math.sin(a0) * R * 0.86, 0.085, Math.cos(a0) * R, Math.sin(a0) * R, 0.085, Math.cos(a1) * R, Math.sin(a1) * R, 0.085, 0, 0, 1, 0xffb000);
  }
  b.box(-0.06, R, -0.06, 0.06, R + 0.12, 0.06, 0xffc93a);
  b.box(-0.025, 0, 0.095, 0.025, 0.28, 0.11, 0x222222);
  b.box(0, -0.025, 0.095, 0.2, 0.025, 0.11, 0x222222);
  return b.build();
}

/** Arco de checkpoint/meta (se tiñe por vértice). */
export function gateGeo(w = 6, h = 4.2, color = 0x2c333d, accent = 0xff7a2f) {
  const b = geoBuilder();
  b.box(-w / 2 - 0.25, 0, -0.25, -w / 2 + 0.25, h, 0.25, color);
  b.box(w / 2 - 0.25, 0, -0.25, w / 2 + 0.25, h, 0.25, color);
  b.box(-w / 2 - 0.3, h, -0.3, w / 2 + 0.3, h + 0.6, 0.3, color);
  b.box(-w / 2 - 0.31, h + 0.18, -0.31, w / 2 + 0.31, h + 0.42, 0.31, accent);
  b.box(-w / 2 - 0.26, 0.4, -0.26, -w / 2 + 0.26, 0.55, 0.26, accent);
  b.box(w / 2 - 0.26, 0.4, -0.26, w / 2 + 0.26, 0.55, 0.26, accent);
  return b.build();
}
