// @ts-check
/* Portales Imposibles — texturas procedurales (canvas), materiales compartidos y modelos low-poly hechos en código:
   pistola de portales, marcos y superficies de portal, cubos, botones, pedestales, puertas, emisores y receptores
   de láser, torretas, esferas supervisoras, cristales, generador, Núcleo Fractal y el cuerpo del sujeto de prueba. */
import { THREE } from '../../matelabs/kit3d.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PCOL } from './config.js';

/* ======================= texturas ======================= */
function canvasTex(size, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function noise(g, s, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); } }

/** Paneles blancos (aptos para portales): 2×2 baldosas por textura (1 m cada una). */
const whiteTex = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#eef1f3'; g.fillRect(0, 0, s, s);
  const h = s / 2;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const gr = g.createLinearGradient(i * h, j * h, i * h + h, j * h + h);
    gr.addColorStop(0, '#f7f9fa'); gr.addColorStop(1, '#dde2e6');
    g.fillStyle = gr; g.fillRect(i * h + 3, j * h + 3, h - 6, h - 6);
  }
  noise(g, s, 900, 0.05);
  g.strokeStyle = '#9aa3ab'; g.lineWidth = 4;
  for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * h, 0); g.lineTo(k * h, s); g.stroke(); g.beginPath(); g.moveTo(0, k * h); g.lineTo(s, k * h); g.stroke(); }
});
/** Metal oscuro (no apto): placas con ranuras y remaches. */
const metalTex = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#5b6470'; g.fillRect(0, 0, s, s);
  const q = s / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? '#646d79' : '#58616c'; g.fillRect(i * q + 2, j * (s / 2) + 2, q - 4, s / 2 - 4);
  }
  noise(g, s, 1400, 0.08);
  g.strokeStyle = '#262b33'; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); }
  g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(s, 0); g.stroke();
  g.fillStyle = '#2d333c';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) for (const [a, b] of [[8, 8], [q - 8, 8], [8, s / 2 - 8], [q - 8, s / 2 - 8]]) { g.beginPath(); g.arc(i * q + a, j * s / 2 + b, 2.5, 0, 7); g.fill(); }
});
/** Rejilla: deja pasar disparos y láseres, no personas ni cubos. */
const grateTex = () => canvasTex(128, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.strokeStyle = '#c8d3dc'; g.lineWidth = 5;
  for (let i = 0; i <= 8; i++) { const p = i * s / 8; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
});
const hazardTex = () => canvasTex(128, (g, s) => {
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1b1d22';
  for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * s / 2, s); g.lineTo(i * s / 2 + s / 4, s); g.lineTo(i * s / 2 + s / 4 + s, 0); g.lineTo(i * s / 2 + s, 0); g.closePath(); g.fill(); }
});
const acidTex = () => canvasTex(128, (g, s) => {
  g.fillStyle = '#2f8a16'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${150 + Math.random() * 100},255,${60 + Math.random() * 60},${0.15 + Math.random() * 0.4})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 9, 0, 7); g.fill(); }
});
const fieldTex = () => canvasTex(64, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 4, 0, 6, s);
});

/* ======================= materiales ======================= */
export function createMaterials() {
  const tex = { white: whiteTex(), metal: metalTex(), grate: grateTex(), hazard: hazardTex(), acid: acidTex(), field: fieldTex() };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    tex,
    white: std({ map: tex.white, roughness: 0.62, metalness: 0.02 }),
    metal: std({ map: tex.metal, roughness: 0.55, metalness: 0.45 }),
    grate: std({ map: tex.grate, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false }),
    hazard: std({ map: tex.hazard, roughness: 0.6 }),
    trim: std({ color: 0x111111, emissive: 0x7aa8ff, emissiveIntensity: 1.4, roughness: 0.4 }),
    dark: std({ color: 0x23272e, roughness: 0.7, metalness: 0.4 }),
    acid: std({ map: tex.acid, color: 0x9dff66, emissive: 0x2e8f12, emissiveIntensity: 0.9, roughness: 0.25, transparent: true, opacity: 0.92 }),
    field: new THREE.MeshBasicMaterial({ map: tex.field, color: 0xb57bff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    fizz: new THREE.MeshBasicMaterial({ map: tex.field, color: 0x6fc8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    cube: std({ vertexColors: true, roughness: 0.5, metalness: 0.15 }),
    prism: new THREE.MeshPhysicalMaterial({ color: 0x8ff3ff, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.1, emissive: 0x1d6f7a, emissiveIntensity: 0.6 }),
    vc: std({ vertexColors: true, roughness: 0.55, metalness: 0.2 }),
    vcFlat: std({ vertexColors: true, roughness: 0.6, metalness: 0.1, flatShading: true }),
    glowA: new THREE.MeshBasicMaterial({ color: PCOL.A }),
    glowB: new THREE.MeshBasicMaterial({ color: PCOL.B }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a3a }),
    green: new THREE.MeshBasicMaterial({ color: 0x45ff8a }),
    beam: new THREE.MeshBasicMaterial({ color: 0xff3d5a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    beamGlow: new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    sight: new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
    cone: new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    gaze: new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    crystal: std({ color: 0xc8a6ff, emissive: 0x8f5cff, emissiveIntensity: 1.3, roughness: 0.15, metalness: 0.1, flatShading: true }),
    ghostA: new THREE.MeshBasicMaterial({ color: PCOL.A, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    ghostB: new THREE.MeshBasicMaterial({ color: PCOL.B, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }),
    ring: new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    core: std({ color: 0xffffff, vertexColors: true, emissive: 0x6a3cff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3, flatShading: true }),
    shield: new THREE.MeshBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, wireframe: true }),
  };
  return M;
}

/* ======================= utilidades de geometría ======================= */
/** Pinta una geometría con un color por vértice y la deja lista para fusionar. */
function paint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return g;
}
function at(geo, x, y, z, rx = 0, ry = 0, rz = 0) { geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z); return geo; }
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);

/* ======================= geometrías de mundo ======================= */
/** Geometría fusionada de un conjunto de cajas con UV en espacio de mundo (la textura se repite cada 2 m). */
export function boxesGeometry(boxes, uvScale = 0.5) {
  const pos = [], nor = [], uv = [], idx = [];
  let v = 0;
  const face = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, u0, v0, u1, v1) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 4; i++) nor.push(nx, ny, nz);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
  };
  const s = uvScale;
  for (const b of boxes) {
    const { x0, y0, z0, x1, y1, z1 } = b;
    // +x / -x
    face(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, z1 * s, y0 * s, z0 * s, y1 * s);
    face(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, z0 * s, y0 * s, z1 * s, y1 * s);
    // +y / -y
    face(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, x0 * s, -z1 * s, x1 * s, -z0 * s);
    face(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, x0 * s, z0 * s, x1 * s, z1 * s);
    // +z / -z
    face(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, x0 * s, y0 * s, x1 * s, y1 * s);
    face(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, -x1 * s, y0 * s, -x0 * s, y1 * s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ======================= portal ======================= */
const PORTAL_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const PORTAL_FS = `
uniform sampler2D map; uniform vec2 res; uniform float time; uniform vec3 col; uniform float useMap; uniform float open; uniform float linked;
varying vec2 vUv;
void main(){
  vec2 c = vUv * 2.0 - 1.0; float r = length(c);
  if (r > open) discard;
  vec3 base;
  if (useMap > 0.5) {
    base = texture2D(map, gl_FragCoord.xy / res).rgb;
  } else {
    float a = atan(c.y, c.x);
    float s = sin(a * 3.0 + r * 9.0 - time * 3.2) * 0.5 + 0.5;
    float s2 = sin(a * 5.0 - r * 6.0 + time * 2.1) * 0.5 + 0.5;
    base = col * (0.18 + 0.45 * s * s2 + 0.35 * (1.0 - r)) * (linked > 0.5 ? 1.0 : 0.55);
  }
  float edge = smoothstep(open - 0.16, open, r);
  base = mix(base, col * 2.4, edge);
  gl_FragColor = vec4(base, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** Malla de un portal: aro brillante + superficie (render target o membrana animada). */
export function makePortalMesh(which, w, h) {
  const col = new THREE.Color(which === 'A' ? PCOL.A : PCOL.B);
  const group = new THREE.Group();
  const uni = { map: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, col: { value: col }, useMap: { value: 0 }, open: { value: 1 }, linked: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: PORTAL_VS, fragmentShader: PORTAL_FS });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  surface.position.z = 0.012;
  group.add(surface);
  // aro: elipse de segmentos
  const ringGeo = new THREE.TorusGeometry(1, 0.055, 6, 40); ringGeo.scale(w / 2, h / 2, 1);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6) }));
  ring.position.z = 0.02; group.add(ring);
  // resplandor exterior
  const haloGeo = new THREE.RingGeometry(1, 1.22, 40); haloGeo.scale(w / 2, h / 2, 1);
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.z = 0.015; group.add(halo);
  group.visible = false;
  return { group, surface, ring, halo, uni, mat };
}

/* ======================= pistola de portales (vista en primera persona) ======================= */
export function makeGun(M) {
  const parts = [
    paint(at(C(0.07, 0.09, 0.42, 10), 0, 0, 0, Math.PI / 2), 0xf2f4f6),
    paint(at(C(0.095, 0.095, 0.12, 10), 0, 0, 0.12, Math.PI / 2), 0x2a2f37),
    paint(at(B(0.06, 0.16, 0.1), 0, -0.1, 0.1), 0x2a2f37),
    paint(at(B(0.03, 0.03, 0.16), 0.07, 0.05, -0.24, 0, 0, 0.3), 0x2a2f37),
    paint(at(B(0.03, 0.03, 0.16), -0.07, 0.05, -0.24, 0, 0, -0.3), 0x2a2f37),
    paint(at(B(0.03, 0.03, 0.16), 0, -0.08, -0.24), 0x2a2f37),
    paint(at(C(0.04, 0.06, 0.06, 10), 0, 0, -0.22, Math.PI / 2), 0xd8dde2),
  ];
  const geo = mergeGeometries(parts); parts.forEach(p => p.dispose());
  const body = new THREE.Mesh(geo, M.vc);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: PCOL.A }));
  core.position.set(0, 0, -0.27);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.3), core.material);
  stripe.position.set(0, 0.075, -0.02);
  const g = new THREE.Group(); g.add(body, core, stripe);
  g.scale.setScalar(0.5);
  g.position.set(0.17, -0.16, -0.32);
  g.rotation.y = 0.08;
  g.traverse(o => { o.renderOrder = 10; });
  return { group: g, core, body };
}

/* ======================= cubos ======================= */
export function cubeGeo(prism) {
  const s = 0.7, parts = [];
  if (!prism) {
    parts.push(paint(B(s * 0.94, s * 0.94, s * 0.94), 0xc9ced3));
    // esquinas reforzadas
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) parts.push(paint(at(B(0.2, 0.2, 0.2), x * 0.26, y * 0.26, z * 0.26), 0x80878f));
    // centros de cara con anillo de acento
    for (const [x, y, z, rx, ry] of [[0, 0, 0.34, 0, 0], [0, 0, -0.34, 0, 0], [0.34, 0, 0, 0, Math.PI / 2], [-0.34, 0, 0, 0, Math.PI / 2], [0, 0.34, 0, 0, 0], [0, -0.34, 0, 0, 0]]) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 12), x, y, z, rx + (z !== 0 ? Math.PI / 2 : 0), ry, x !== 0 ? Math.PI / 2 : 0), 0x7a5cff));
    }
  } else {
    // marco del cubo prisma (el vidrio va aparte)
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      parts.push(paint(at(B(s, 0.07, 0.07), 0, a * 0.315, b * 0.315), 0x4e5862));
      parts.push(paint(at(B(0.07, s, 0.07), a * 0.315, 0, b * 0.315), 0x4e5862));
      parts.push(paint(at(B(0.07, 0.07, s), a * 0.315, b * 0.315, 0), 0x4e5862));
    }
    // flecha de salida (cara −z local)
    parts.push(paint(at(new THREE.ConeGeometry(0.12, 0.2, 4), 0, 0, -0.38, -Math.PI / 2), 0xff3d5a));
  }
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

/* ======================= botón de piso, pedestal, puerta ======================= */
export function buttonBaseGeo() {
  const parts = [paint(C(0.85, 0.95, 0.12, 20), 0x2a2f37), paint(at(C(0.72, 0.72, 0.04, 20), 0, 0.07, 0), 0x89929b)];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); g.translate(0, 0.06, 0); return g;
}
export function pedestalGeo() {
  const parts = [paint(C(0.2, 0.28, 0.9, 10), 0xe8ecef), paint(at(C(0.3, 0.3, 0.08, 12), 0, 0.46, 0), 0x2a2f37), paint(at(C(0.32, 0.36, 0.08, 12), 0, -0.42, 0), 0x2a2f37)];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); g.translate(0, 0.45, 0); return g;
}
/** Mitad de una puerta corrediza (ancho w, alto h). */
export function doorHalfGeo(w, h) {
  const parts = [paint(B(w, h, 0.18), 0xd9dee2), paint(at(B(w * 0.9, 0.12, 0.2), 0, h * 0.28, 0), 0x2a2f37), paint(at(B(w * 0.9, 0.12, 0.2), 0, -h * 0.28, 0), 0x2a2f37)];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

/* ======================= láser ======================= */
export function emitterGeo() {
  const parts = [paint(B(0.7, 0.7, 0.35), 0x3a414b), paint(at(C(0.22, 0.26, 0.25, 12), 0, 0, -0.28, Math.PI / 2), 0x23272e), paint(at(B(0.76, 0.1, 0.38), 0, 0.3, 0), 0xf2c230)];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}
export function receptorGeo(w, h) {
  const parts = [paint(B(w, h, 0.18), 0x3a414b), paint(at(B(w * 0.8, h * 0.8, 0.2), 0, 0, 0.02), 0x1a1d22)];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

/* ======================= torreta ======================= */
export function turretGeo() {
  const parts = [
    paint(at(new THREE.CapsuleGeometry(0.26, 0.55, 4, 10), 0, 0.95, 0), 0xf3f5f7),
    paint(at(B(0.06, 0.6, 0.5), 0.27, 0.95, 0), 0x2b3038), paint(at(B(0.06, 0.6, 0.5), -0.27, 0.95, 0), 0x2b3038),
    paint(at(C(0.025, 0.03, 0.75, 5), 0, 0.33, 0.22, -0.35), 0x2b3038),
    paint(at(C(0.025, 0.03, 0.75, 5), 0.2, 0.33, -0.13, 0.25, 0, 0.3), 0x2b3038),
    paint(at(C(0.025, 0.03, 0.75, 5), -0.2, 0.33, -0.13, 0.25, 0, -0.3), 0x2b3038),
  ];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

/* ======================= esfera supervisora ======================= */
export function sphereGeo() {
  const parts = [
    paint(new THREE.SphereGeometry(0.46, 14, 10), 0x40464f),
    paint(at(new THREE.TorusGeometry(0.58, 0.05, 6, 24), 0, 0, 0, Math.PI / 2), 0xd7dde2),
    paint(at(new THREE.SphereGeometry(0.47, 14, 6, 0, Math.PI * 2, 0, 0.5), 0, 0, 0), 0xe7ebee),
    paint(at(B(0.12, 0.12, 0.3), 0.6, 0, 0), 0x2b3038), paint(at(B(0.12, 0.12, 0.3), -0.6, 0, 0), 0x2b3038),
  ];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

/* ======================= generador ======================= */
export function generatorGeo() {
  const parts = [
    paint(C(1.9, 2.2, 0.8, 20), 0x3a414b),
    paint(at(C(1.4, 1.6, 4.6, 20), 0, 2.7, 0), 0xdfe4e8),
    paint(at(C(1.7, 1.7, 0.3, 20), 0, 1.6, 0), 0x2a2f37), paint(at(C(1.7, 1.7, 0.3, 20), 0, 3.6, 0), 0x2a2f37),
    paint(at(C(1.9, 1.5, 0.6, 20), 0, 5.2, 0), 0x3a414b),
  ];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

/* ======================= Núcleo Fractal ======================= */
export function fractalGeo(level) {
  const parts = [];
  const add = (r, x, y, z, hex) => parts.push(paint(at(new THREE.IcosahedronGeometry(r, 0), x, y, z), hex));
  add(1.2, 0, 0, 0, 0xf4eaff);
  if (level > 0) {
    const vs = new THREE.IcosahedronGeometry(1.9, 0).getAttribute('position');
    const seen = new Set();
    for (let i = 0; i < vs.count; i++) {
      const k = `${vs.getX(i).toFixed(2)},${vs.getY(i).toFixed(2)},${vs.getZ(i).toFixed(2)}`; if (seen.has(k)) continue; seen.add(k);
      add(0.42, vs.getX(i), vs.getY(i), vs.getZ(i), i % 2 ? 0xa6f0ff : 0xffb3e6);
    }
  }
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}

/* ======================= cuerpo del sujeto (sólo visible a través de los portales) ======================= */
export function playerBodyGeo() {
  const parts = [
    paint(at(new THREE.CapsuleGeometry(0.24, 0.62, 4, 10), 0, 0.15, 0), 0xff9a3c),
    paint(at(new THREE.SphereGeometry(0.17, 10, 8), 0, 0.7, 0), 0xf0c9a8),
    paint(at(B(0.5, 0.12, 0.3), 0, -0.05, 0), 0xe8ecef),
    paint(at(C(0.09, 0.08, 0.6, 6), 0.12, -0.5, 0), 0xff9a3c), paint(at(C(0.09, 0.08, 0.6, 6), -0.12, -0.5, 0), 0xff9a3c),
    paint(at(B(0.12, 0.1, 0.22), 0.12, -0.8, -0.04), 0xe8ecef), paint(at(B(0.12, 0.1, 0.22), -0.12, -0.8, -0.04), 0xe8ecef),
    paint(at(C(0.06, 0.08, 0.42, 8), 0.24, 0.2, -0.2, Math.PI / 2), 0xf2f4f6),
  ];
  const g = mergeGeometries(parts); parts.forEach(p => p.dispose()); return g;
}
