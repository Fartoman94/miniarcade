// @ts-check
/* Academia de Dragones — construcción de las regiones (terreno, cielo, decorado e interactivos).
   Cada región devuelve datos (posiciones, colisiones, cursos de aros) y mallas; la lógica de juego
   (qué pasa al tocar cada cosa) vive en main.js. */
import * as THREE from 'three';
import { rng } from '../../matelabs/kit3d.js';
import * as M from './models.js';
import { dotTexture } from './fx.js';

/* ======================= ruido ======================= */
function hash2(i, j, s) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, z, s) => vnoise(x, z, s) * 0.55 + vnoise(x * 2.1, z * 2.1, s + 1) * 0.3 + vnoise(x * 4.3, z * 4.3, s + 2) * 0.15;
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

/* ======================= alturas por región ======================= */
const PICOS_PEAKS = [[0, 0, 70, 150], [220, -160, 115, 140], [-240, -120, 100, 130], [-180, 220, 125, 150], [260, 200, 90, 120],
  [60, -330, 105, 130], [-340, 40, 85, 110], [340, -20, 95, 110], [150, 330, 80, 100], [-110, -330, 90, 110]];
function hPicos(x, z) {
  let h = -40 + fbm(x * 0.006, z * 0.006, 1) * 22;
  for (let i = 0; i < PICOS_PEAKS.length; i++) {
    const p = PICOS_PEAKS[i], d = Math.hypot(x - p[0], z - p[1]);
    if (d >= p[3]) continue;
    let ph;
    if (i === 0) ph = d < 36 ? 70 : -40 + 110 * smooth(1 - (d - 36) / (p[3] - 36)) + (fbm(x * 0.04, z * 0.04, 5) - 0.5) * 10 * (d > 40 ? 1 : 0);
    else { const t = 1 - d / p[3]; ph = -40 + (p[2] + 40) * smooth(t) * (0.85 + 0.15 * t) + (fbm(x * 0.03, z * 0.03, 5) - 0.5) * 16 * t; }
    if (ph > h) h = ph;
  }
  return h;
}
const LAGO_ISLANDS = [[90, -60, 55, 38], [-120, 80, 60, 52], [40, 160, 38, 22], [-60, -170, 50, 44], [210, 40, 40, 30], [-230, -150, 45, 34]];
function hLago(x, z) {
  const d = Math.hypot(x, z);
  const rim = smooth((d - 250) / 170) * 140;
  let h = -18 + rim + (fbm(x * 0.008, z * 0.008, 3) - 0.5) * 20 * (0.3 + rim / 140);
  for (const p of LAGO_ISLANDS) {
    const di = Math.hypot(x - p[0], z - p[1]);
    if (di < p[2]) { const ph = -18 + (p[3] + 18) * smooth(1 - di / p[2]) + (fbm(x * 0.05, z * 0.05, 8) - 0.5) * 6; if (ph > h) h = ph; }
  }
  return h;
}
function hVolcan(x, z) {
  const d = Math.hypot(x, z);
  let cone = d < 270 ? 160 * Math.pow(1 - d / 270, 1.5) : 0;
  if (d < 48) cone -= (1 - d / 48) * (1 - d / 48) * 55;
  let base = 12 + fbm(x * 0.007, z * 0.007, 9) * 30;
  const r = Math.abs(vnoise(x * 0.004 + 3.1, z * 0.004, 4) - 0.5);
  if (r < 0.07 && d > 120) base -= 22 * (1 - r / 0.07);
  return Math.max(base, cone + 6 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 8);
}

/* ======================= paletas ======================= */
const PAL = {
  picos: { top: 0x3f86e0, hor: 0xc5e6ff, bot: 0xf4f8ff, fog: 0xcfe4fb, fogN: 140, fogF: 560, hemi: [0xe4f2ff, 0x6b7c8e, 1.35], sun: [0xfff0d4, 2.4], sunDir: [-0.45, 0.75, 0.35] },
  lago: { top: 0x4c5fc9, hor: 0xffc9b0, bot: 0xffe6d6, fog: 0xf0cfc6, fogN: 140, fogF: 540, hemi: [0xffe2d2, 0x5a6a8a, 1.25], sun: [0xffd09a, 2.3], sunDir: [0.6, 0.45, -0.5] },
  volcan: { top: 0x24162c, hor: 0xc0543a, bot: 0x3a1a16, fog: 0x6b3a32, fogN: 80, fogF: 430, hemi: [0xffb48c, 0x2a1010, 1.0], sun: [0xff9c70, 1.9], sunDir: [0.3, 0.55, 0.6] },
  tormenta: { top: 0x121826, hor: 0x46566c, bot: 0x2a3444, fog: 0x3a4658, fogN: 60, fogF: 380, hemi: [0x9fb0d0, 0x1a1f28, 0.95], sun: [0xa8b8d8, 1.1], sunDir: [-0.3, 0.8, 0.2] },
};

function terrainColor(kind, h, slope, x, z) {
  const n = fbm(x * 0.05, z * 0.05, 7) * 0.12;
  if (kind === 'picos' || kind === 'tormenta') {
    if (h > 95 - n * 40 && slope > 0.6) return [0.95, 0.97, 1.0];
    if (slope < 0.6) return [0.48 + n, 0.47 + n, 0.5 + n];
    if (h > 40) return [0.42 + n, 0.62 + n, 0.36];
    return [0.36 + n, 0.55 + n, 0.32];
  }
  if (kind === 'lago') {
    if (h < 3) return [0.86 + n, 0.78 + n, 0.6];
    if (slope < 0.55) return [0.55 + n, 0.52 + n, 0.56 + n];
    if (h > 90) return [0.92, 0.9, 0.96];
    return [0.38 + n, 0.6 + n, 0.42];
  }
  // volcán
  if (h < 9) return [0.25 + n, 0.12, 0.08];
  if (h > 120) return [0.32 + n, 0.25 + n, 0.24];
  if (slope < 0.6) return [0.2 + n, 0.16 + n, 0.16];
  return [0.3 + n, 0.22 + n * 0.5, 0.18];
}

function buildTerrain(kind, hfn, segs, size = 1000) {
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, hfn(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = terrainColor(kind, pos.getY(i), nor.getY(i), pos.getX(i), pos.getZ(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }));
  m.receiveShadow = true;
  return m;
}

function buildSky(p) {
  const g = new THREE.SphereGeometry(1, 24, 14);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color(p.top), hor = new THREE.Color(p.hor), bot = new THREE.Color(p.bot), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(bot, Math.min(1, -y * 3));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

function lavaTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#c2310f'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 140; i++) {
      const r = hash2(i, 1, 9), a = hash2(i, 2, 9), b = hash2(i, 3, 9);
      x.fillStyle = r > 0.6 ? '#ffd24a' : r > 0.3 ? '#ff7a1a' : '#7a1608';
      x.globalAlpha = 0.55; x.beginPath(); x.arc(a * 128, b * 128, 3 + r * 10, 0, Math.PI * 2); x.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ======================= layout de cada región ======================= */
const LAYOUT = {
  picos: {
    start: [70, 105, 175], yaw: 0.78,
    markers: [
      { type: 'pass', x: -30, y: 95, z: 70, label: 'Atravesá la columna de luz' },
      { type: 'climb', x: -110, y: 120, z: 10, need: 138, label: 'Subí por encima de la marca alta' },
      { type: 'dive', x: -150, y: 85, z: -80, label: 'Atravesala en picada' },
      { type: 'boost', x: -60, y: 92, z: -160, label: 'Atravesala con turbo' },
      { type: 'breath', x: 50, y: 100, z: -120, label: 'Encendé el farol con tu aliento' },
    ],
    course: { kind: 'circuit', pts: [[70, 100, 70], [150, 108, 0], [205, 118, -85], [140, 98, -200], [40, 106, -255], [-60, 116, -235], [-150, 124, -165], [-215, 108, -40], [-185, 100, 80], [-95, 96, 155], [0, 102, 185], [85, 100, 140]] },
    eggs: [{ id: 'picos', x: -340, z: 40, onGround: true }],
    nests: [{ id: 'picos-n1', x: -180, z: 220, onGround: true, kind: 'cabrita' }],
    inns: [{ id: 'picos-inn', x: 130, y: 112, z: 180 }],
    updrafts: [[110, -60], [-120, -30], [-30, -230]],
    portal: [0, 150, -40],
    enemies: [['bat', 300, 125, -40], ['bat', 285, 130, -80], ['bat', -210, 145, 250], ['bat', -170, 150, 270], ['bat', 330, 120, 30]],
    islands: 10, rocks: 34,
  },
  lago: {
    start: [0, 60, 260], yaw: 0,
    course: { kind: 'race', pts: [[0, 38, 175], [0, 14, 70, 1], [70, 28, -20], [150, 36, -100], [130, 14, -190, 1], [40, 30, -255], [-60, 42, -235], [-150, 14, -130, 1], [-215, 34, -30], [-200, 46, 80], [-120, 30, 160], [-45, 26, 215], [0, 30, 205]] },
    eggs: [{ id: 'lago', x: 170, z: 290, onGround: true }, { id: 'brillante', x: -150, z: 115, onGround: true, shiny: true }],
    nests: [{ id: 'lago-n1', x: -60, z: -170, onGround: true, kind: 'grifito' }],
    inns: [{ id: 'lago-inn', x: 70, y: 70, z: 120 }],
    portal: [0, 95, -60],
    enemies: [['harpy', -100, 90, -100], ['harpy', 140, 92, 60], ['harpy', 0, 100, -200], ['bat', -220, 60, 120], ['bat', 220, 70, -60]],
    crystals: 16, rocks: 14,
  },
  volcan: {
    start: [0, 130, 390], yaw: 0,
    nests: [{ id: 'volcan-n1', x: -140, z: 70, onGround: true, kind: 'zorrito' }, { id: 'volcan-n2', x: 160, z: -40, onGround: true, kind: 'zorrito' }, { id: 'volcan-n3', x: 30, z: -175, onGround: true, kind: 'zorrito' }],
    eggs: [{ id: 'volcan', x: 0, z: 0, onGround: true }],
    inns: [{ id: 'volcan-inn', x: 0, y: 150, z: 300 }],
    portal: [0, 200, 240],
    geysers: [[-90, 200], [120, 150], [-200, -80], [210, -150], [-60, -260], [90, -280], [0, 0]],
    enemies: [['auto', -150, 110, 120], ['auto', 190, 110, -10], ['auto', 60, 120, -200], ['auto', -60, 140, -60], ['bat', -240, 70, 240], ['bat', 250, 80, 200], ['harpy', 0, 170, 120]],
    pillars: 18, rocks: 12,
  },
};

/**
 * Construye una región. `kind` = 'picos'|'lago'|'volcan'|'tormenta' (tormenta reutiliza Picos con otra luz).
 * @param {string} kind @param {{scene:THREE.Scene, renderer:THREE.WebGLRenderer, mats:any, q:any, ringScale:number, reduced:boolean}} o
 */
export function buildRegion(kind, o) {
  const base = kind === 'tormenta' ? 'picos' : kind;
  const L = LAYOUT[base], P = PAL[kind];
  const hfn = base === 'picos' ? hPicos : base === 'lago' ? hLago : hVolcan;
  const group = new THREE.Group(); group.name = 'region-' + kind;
  const disposables = /** @type {{dispose:()=>void}[]} */ ([]);
  const R = rng(base === 'picos' ? 11 : base === 'lago' ? 22 : 33);
  const mats = o.mats;

  // cielo y luces
  const sky = buildSky(P); group.add(sky);
  const hemi = new THREE.HemisphereLight(P.hemi[0], P.hemi[1], P.hemi[2]); group.add(hemi);
  const sun = new THREE.DirectionalLight(P.sun[0], P.sun[1]);
  const sunDir = new THREE.Vector3(...P.sunDir).normalize();
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -70; sc.right = sc.top = 70; sc.near = 1; sc.far = 400; sun.shadow.bias = -0.0008;
  group.add(sun, sun.target);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(30, 20), new THREE.MeshBasicMaterial({ color: kind === 'volcan' ? 0xff8a50 : kind === 'tormenta' ? 0x8090b0 : 0xfff6d8, fog: false, toneMapped: false, transparent: true, opacity: kind === 'tormenta' ? 0.25 : 0.95 }));
  sunDisc.renderOrder = -9; group.add(sunDisc);

  const floorKind = base === 'picos' ? 'nubes' : base === 'lago' ? 'agua' : 'lava';
  const floorY = base === 'picos' ? 10 : base === 'lago' ? 0 : 6;

  // terreno
  const terrain = buildTerrain(kind, hfn, o.q.terrain); group.add(terrain);
  /** @type {{type:'s'|'c', x:number, y:number, z:number, r:number, y0?:number, y1?:number, rock?:boolean}[]} */
  const obstacles = [];
  const avoid = /** @type {number[][]} */ ([]); // puntos a mantener despejados (aros, marcadores, etc.)
  const ground = (x, z) => hfn(x, z);
  const clearY = (x, y, z, m = 16) => Math.max(y, hfn(x, z) + m, floorY + m);

  // suelo letal: mar de nubes, agua espejo o lava
  /** @type {THREE.Mesh|null} */ let lava = null;
  /** @type {any} */ let mirror = null;
  /** @type {THREE.Mesh|null} */ let waterMesh = null;
  if (floorKind === 'nubes') {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: kind === 'tormenta' ? 0x5a6578 : 0xf4f7fb, roughness: 1, emissive: kind === 'tormenta' ? 0x101828 : 0x8796ad, emissiveIntensity: 0.35 }));
    sea.position.y = floorY - 1; group.add(sea);
  } else if (floorKind === 'agua') {
    const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1).rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x78b8d8, roughness: 0.08, metalness: 0.55, envMapIntensity: 1.2 }));
    water.position.y = floorY + 0.05; group.add(water); waterMesh = water;
    // reflejo barato: entorno PMREM a partir del cielo
    const pm = new THREE.PMREMGenerator(o.renderer);
    const envScene = new THREE.Scene(); envScene.add(buildSky(P));
    const rt = pm.fromScene(envScene, 0.02);
    /** @type {any} */ (water.material).envMap = rt.texture;
    disposables.push(rt, pm); envScene.traverse(x => { const a = /** @type {any} */ (x); if (a.geometry) a.geometry.dispose(); if (a.material) a.material.dispose(); });
  } else {
    const tex = lavaTexture(); disposables.push(tex);
    lava = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, toneMapped: false, fog: true }));
    lava.position.y = floorY; group.add(lava);
  }

  // ---------- aros (curso) ----------
  const ringR = 7.5 * o.ringScale;
  /** @type {any[]} */ const rings = [];
  const ringG = M.ringGeo(ringR);
  const ringMats = {
    next: new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false }),
    pend: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    done: new THREE.MeshBasicMaterial({ color: 0x6be38a, transparent: true, opacity: 0.35 }),
  };
  if (L.course && kind !== 'tormenta') {
    const pts = L.course.pts.map(p => new THREE.Vector3(p[0], clearY(p[0], p[1], p[2], p[3] ? 12 : 18), p[2]));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const n = new THREE.Vector3().subVectors(b, a); n.y *= 0.5; n.normalize();
      const mesh = new THREE.Mesh(ringG, ringMats.pend);
      mesh.position.copy(pts[i]); mesh.lookAt(pts[i].clone().add(n));
      group.add(mesh);
      rings.push({ pos: pts[i], normal: n, mesh, arch: !!L.course.pts[i][3] });
      avoid.push([pts[i].x, pts[i].y, pts[i].z]);
      if (L.course.pts[i][3]) {
        // arco de piedra sobre el lago, alineado con el aro
        const arch = new THREE.Mesh(M.archGeo(26), mats.vc);
        arch.position.set(pts[i].x, 0, pts[i].z);
        arch.lookAt(pts[i].x + n.x, 0, pts[i].z + n.z);
        arch.castShadow = true; arch.receiveShadow = true;
        group.add(arch);
        const side = new THREE.Vector3(n.z, 0, -n.x).normalize();
        for (let k = 0; k <= 8; k++) {
          const ang = k / 8 * Math.PI, sx = Math.cos(ang) * 26, sy = Math.sin(ang) * 26;
          obstacles.push({ type: 's', x: pts[i].x + side.x * sx, y: sy, z: pts[i].z + side.z * sx, r: 4.2, rock: true });
        }
      }
    }
  }

  // ---------- marcadores de entrenamiento ----------
  /** @type {any[]} */ const markers = [];
  if (L.markers && kind !== 'tormenta') {
    const baseG = M.beaconBaseGeo();
    const colG = new THREE.CylinderGeometry(9, 9, 70, 20, 1, true);
    const bandG = new THREE.TorusGeometry(9.5, 0.5, 4, 28).rotateX(Math.PI / 2);
    const lampG = M.paint(new THREE.OctahedronGeometry(2.4, 0), 0xffffff, 0);
    for (const m of L.markers) {
      const y = clearY(m.x, m.y, m.z, 22);
      const g = new THREE.Group(); g.position.set(m.x, y, m.z);
      const isl = new THREE.Mesh(M.islandGeo(0x9fd28a), mats.vc); isl.scale.set(8, 6, 8); isl.position.y = -36; g.add(isl);
      const b = new THREE.Mesh(baseG, mats.vc); b.position.y = -35; g.add(b);
      const colMat = new THREE.MeshBasicMaterial({ color: 0x7fd7ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
      const col = new THREE.Mesh(colG, colMat); g.add(col);
      let band = null, lamp = null;
      if (m.type === 'climb') { band = new THREE.Mesh(bandG, new THREE.MeshBasicMaterial({ color: 0xffd34d, toneMapped: false })); band.position.y = m.need - y; g.add(band); }
      if (m.type === 'breath') { lamp = new THREE.Mesh(lampG, new THREE.MeshBasicMaterial({ color: 0x445566, toneMapped: false })); g.add(lamp); }
      group.add(g);
      markers.push({ ...m, y, group: g, col, colMat, band, lamp, base: b });
      avoid.push([m.x, y, m.z]);
    }
  }

  // ---------- posadas flotantes ----------
  /** @type {any[]} */ const inns = [];
  for (const it of (L.inns || [])) {
    const g = new THREE.Group(); g.position.set(it.x, clearY(it.x, it.y, it.z, 26), it.z);
    const mesh = new THREE.Mesh(M.innGeo(), mats.vc); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(7, 0.55, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false }));
    hoop.position.set(0, 9, -9); g.add(hoop);
    const flag = new THREE.Mesh(M.flagGeo(0x8a8f99), mats.vcDouble); flag.position.set(-6.5, 7.6, -2); g.add(flag);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x556677, toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), lampMat); lamp.position.set(7, 4.4, -4); g.add(lamp);
    group.add(g);
    inns.push({ id: it.id, pos: g.position, group: g, hoop, flag, lampMat, active: false });
    obstacles.push({ type: 's', x: g.position.x, y: g.position.y - 5, z: g.position.z + 1, r: 9, rock: false });
    avoid.push([g.position.x, g.position.y, g.position.z]);
  }

  // ---------- nidos ----------
  /** @type {any[]} */ const nests = [];
  const nestG = M.nestGeo();
  for (const n of (L.nests || [])) {
    const gy = Math.max(ground(n.x, n.z), floorY) + 0.6;
    const g = new THREE.Group(); g.position.set(n.x, gy, n.z);
    g.add(new THREE.Mesh(nestG, mats.vc));
    const cr = new THREE.Mesh(M.creatureGeo(n.kind), mats.vc); cr.position.y = 0.8; g.add(cr);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 40, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x9cff8a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    beacon.position.y = 21; g.add(beacon);
    group.add(g);
    nests.push({ ...n, pos: g.position, group: g, creature: cr, beacon });
    avoid.push([n.x, gy, n.z]);
  }

  // ---------- huevos ----------
  /** @type {any[]} */ const eggs = [];
  for (const e of (L.eggs || [])) {
    const gy = Math.max(ground(e.x, e.z), floorY) + 1.5;
    const g = new THREE.Group(); g.position.set(e.x, gy, e.z);
    const egg = new THREE.Mesh(M.eggGeo(e.shiny ? 0xbff6ff : 0xffd34d, e.shiny ? 0xff8fd8 : 0xffffff), e.shiny ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : mats.vc);
    g.add(egg);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 4, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: e.shiny ? 0xff9fe0 : 0xffd34d, toneMapped: false }));
    halo.position.y = 0.4; g.add(halo);
    group.add(g);
    eggs.push({ ...e, pos: g.position, group: g, egg, halo });
    avoid.push([e.x, gy, e.z]);
  }

  // ---------- corrientes ascendentes (Picos) ----------
  /** @type {any[]} */ const updrafts = [];
  if (L.updrafts) {
    const uG = new THREE.CylinderGeometry(13, 13, 180, 18, 1, true);
    const swirlG = new THREE.TorusGeometry(12, 0.35, 4, 24).rotateX(Math.PI / 2);
    const uMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
    const sMat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, opacity: 0.5, depthWrite: false });
    for (const [x, z] of L.updrafts) {
      const g = new THREE.Group(); g.position.set(x, 90, z);
      g.add(new THREE.Mesh(uG, uMat));
      const swirls = [];
      for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(swirlG, sMat); s.position.y = -80 + k * 45; g.add(s); swirls.push(s); }
      group.add(g);
      updrafts.push({ x, z, r: 13, group: g, swirls });
    }
  }

  // ---------- géiseres (Volcán) ----------
  /** @type {any[]} */ const geysers = [];
  if (L.geysers) {
    const ventG = M.paint(new THREE.CylinderGeometry(5, 7, 3, 10), 0x2a1a14);
    const warnG = new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2);
    const colG = new THREE.CylinderGeometry(4, 6, 1, 12, 1, true).translate(0, 0.5, 0);
    let k = 0;
    for (const [x, z] of L.geysers) {
      const gy = Math.max(ground(x, z), floorY) + 0.5;
      const g = new THREE.Group(); g.position.set(x, gy, z);
      g.add(new THREE.Mesh(ventG, mats.vc));
      const warnMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      const warn = new THREE.Mesh(warnG, warnMat); warn.position.y = 1.7; g.add(warn);
      const colMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide });
      const col = new THREE.Mesh(colG, colMat); col.visible = false; g.add(col);
      group.add(g);
      geysers.push({ x, z, y: gy, group: g, warn, warnMat, col, phase: 'idle', t: 2 + (k++) * 1.3, h: 0, height: 95 });
    }
  }

  // ---------- portal de viaje ----------
  const portal = new THREE.Group();
  if (L.portal) {
    const pp = L.portal; portal.position.set(pp[0], clearY(pp[0], pp[1], pp[2], 30), pp[2]);
    const ring = new THREE.Mesh(M.portalGeo(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(15, 32), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    portal.add(ring, disc); portal.userData.ring = ring; portal.userData.disc = disc;
    portal.visible = false; group.add(portal);
    avoid.push([portal.position.x, portal.position.y, portal.position.z]);
  }

  // ---------- academia ----------
  /** @type {THREE.Object3D|null} */ let academy = null;
  if (base === 'picos') {
    academy = new THREE.Mesh(M.academyGeo(), mats.vc); academy.position.set(0, 70, 0);
    academy.castShadow = true; academy.receiveShadow = true; group.add(academy);
    obstacles.push({ type: 'c', x: 0, y: 0, z: 0, r: 12, y0: 60, y1: 124 });
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; obstacles.push({ type: 'c', x: Math.cos(a) * 27, y: 0, z: Math.sin(a) * 27, r: 6, y0: 60, y1: 104 }); }
    obstacles.push({ type: 'c', x: 0, y: 0, z: 0, r: 29, y0: 60, y1: 79 });
    const fl = new THREE.Mesh(M.flagGeo(0xff9f43), mats.vcDouble); fl.position.set(0, 118, 0); group.add(fl);
    academy.userData.flag = fl;
  }

  // ---------- decorado: islas flotantes y peñascos (Picos/Tormenta) ----------
  const tmpM = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(), tv = new THREE.Vector3(), ts = new THREE.Vector3();
  const farFromAvoid = (x, y, z, d) => avoid.every(a => (a[0] - x) ** 2 + (a[1] - y) ** 2 + (a[2] - z) ** 2 > d * d) && Math.hypot(x, z) > 70;
  const ringPath = (x, y, z, d) => {
    for (let i = 0; i < rings.length; i++) {
      const a = rings[i].pos, b = rings[(i + 1) % rings.length].pos;
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / l2));
      const dx = a.x + abx * t - x, dy = a.y + aby * t - y, dz = a.z + abz * t - z;
      if (dx * dx + dy * dy + dz * dz < d * d) return true;
    }
    return false;
  };
  function scatter(count, minR, maxR, yMin, yMax, sMin, sMax, clearance, place) {
    let tries = 0, n = 0;
    while (n < count && tries++ < count * 40) {
      const a = R() * Math.PI * 2, d = minR + R() * (maxR - minR);
      const x = Math.cos(a) * d, z = Math.sin(a) * d, s = sMin + R() * (sMax - sMin), y = yMin + R() * (yMax - yMin);
      if (y - s < ground(x, z) + 6 || !farFromAvoid(x, y, z, clearance + s) || ringPath(x, y, z, clearance * 0.6 + s)) continue;
      place(x, y, z, s); n++;
    }
    return n;
  }

  if (base === 'picos') {
    const rockG = M.rockGeo(0x7d8592, 0xb2bac4, 2);
    const rocks = new THREE.InstancedMesh(rockG, mats.vc, L.rocks); rocks.castShadow = true;
    let ri = 0;
    scatter(L.rocks, 80, 430, 60, 165, 4, 11, 26, (x, y, z, s) => {
      te.set(R() * 3, R() * 3, R() * 3); tq.setFromEuler(te);
      rocks.setMatrixAt(ri++, tmpM.compose(tv.set(x, y, z), tq, ts.set(s, s * 0.8, s)));
      obstacles.push({ type: 's', x, y, z, r: s * 0.95, rock: true });
    });
    rocks.count = ri; group.add(rocks);
    const islG = M.islandGeo(kind === 'tormenta' ? 0x5f8a5a : 0x86cf6e);
    const isl = new THREE.InstancedMesh(islG, mats.vc, L.islands); isl.castShadow = true; isl.receiveShadow = true;
    const pineG = M.pineGeo(kind === 'tormenta' ? 0x2f5a3a : 0x3f8a4f);
    const pines = new THREE.InstancedMesh(pineG, mats.vc, L.islands * 4); pines.castShadow = true;
    let ii = 0, pi = 0;
    scatter(L.islands, 120, 420, 70, 150, 14, 24, 40, (x, y, z, s) => {
      isl.setMatrixAt(ii++, tmpM.compose(tv.set(x, y, z), tq.identity(), ts.set(s, s * 0.9, s)));
      obstacles.push({ type: 's', x, y: y - s * 0.55, z, r: s * 0.95, rock: true });
      for (let k = 0; k < 4; k++) {
        const a = k * 1.7 + x, dd = s * (0.2 + 0.15 * k);
        te.set(0, a, 0); tq.setFromEuler(te);
        pines.setMatrixAt(pi++, tmpM.compose(tv.set(x + Math.cos(a) * dd, y + 0.1, z + Math.sin(a) * dd), tq, ts.set(2.2 + k * 0.3, 2.2 + k * 0.4, 2.2 + k * 0.3)));
      }
    });
    isl.count = ii; pines.count = pi; group.add(isl, pines);
    // pinos en las laderas
    const slopePines = new THREE.InstancedMesh(pineG, mats.vc, 160); let sp = 0;
    for (let i = 0; i < 600 && sp < 160; i++) {
      const x = (R() - 0.5) * 900, z = (R() - 0.5) * 900, h = ground(x, z);
      if (h < 18 || h > 85 || Math.hypot(x, z) < 45) continue;
      te.set(0, R() * 6, 0); tq.setFromEuler(te); const s = 2.4 + R() * 2;
      slopePines.setMatrixAt(sp++, tmpM.compose(tv.set(x, h - 0.5, z), tq, ts.set(s, s, s)));
    }
    slopePines.count = sp; group.add(slopePines);
  }
  if (base === 'lago') {
    const cryG = M.crystalGeo();
    const cry = new THREE.InstancedMesh(cryG, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.15, metalness: 0.3, emissive: 0x2a5a8a, emissiveIntensity: 0.35 }), L.crystals);
    let ci = 0;
    // anillo de cristales que esconde el huevo brillante
    const shiny = eggs.find(e => e.shiny);
    if (shiny) for (let k = 0; k < 7; k++) {
      const a = k / 7 * Math.PI * 2, x = shiny.pos.x + Math.cos(a) * 12, z = shiny.pos.z + Math.sin(a) * 12, gy = ground(x, z) - 2, hh = 26 + (k % 3) * 8;
      te.set(0.15 * Math.cos(a), a, 0.15 * Math.sin(a)); tq.setFromEuler(te);
      cry.setMatrixAt(ci++, tmpM.compose(tv.set(x, gy, z), tq, ts.set(3, hh, 3)));
      obstacles.push({ type: 'c', x, y: 0, z, r: 3.5, y0: gy, y1: gy + hh });
    }
    const avoidBackup = avoid.slice(); avoid.length = 0; avoid.push(...avoidBackup.filter(a => !shiny || a[0] !== shiny.pos.x));
    scatter(L.crystals - 7, 60, 300, 0, 0, 3, 6, 30, (x, y, z, s) => {
      const hh = 25 + R() * 45, gy = Math.min(ground(x, z), 0) - 2;
      te.set(0, R() * 3, 0); tq.setFromEuler(te);
      cry.setMatrixAt(ci++, tmpM.compose(tv.set(x, gy, z), tq, ts.set(s, hh, s)));
      obstacles.push({ type: 'c', x, y: 0, z, r: s * 1.1, y0: gy, y1: gy + hh });
    });
    cry.count = ci; group.add(cry);
    const pineG = M.pineGeo(0x2f7a55);
    const pines = new THREE.InstancedMesh(pineG, mats.vc, 220); let sp = 0;
    for (let i = 0; i < 900 && sp < 220; i++) {
      const x = (R() - 0.5) * 950, z = (R() - 0.5) * 950, h = ground(x, z);
      if (h < 4 || h > 100) continue;
      te.set(0, R() * 6, 0); tq.setFromEuler(te); const s = 2.4 + R() * 2.4;
      pines.setMatrixAt(sp++, tmpM.compose(tv.set(x, h - 0.5, z), tq, ts.set(s, s, s)));
    }
    pines.count = sp; group.add(pines);
    const rockG = M.rockGeo(0x6f7c86, 0xaeb9c2, 5);
    const rocks = new THREE.InstancedMesh(rockG, mats.vc, L.rocks); let ri = 0;
    scatter(L.rocks, 80, 330, 30, 90, 4, 8, 34, (x, y, z, s) => {
      te.set(R() * 3, R() * 3, 0); tq.setFromEuler(te);
      rocks.setMatrixAt(ri++, tmpM.compose(tv.set(x, y, z), tq, ts.set(s, s, s)));
      obstacles.push({ type: 's', x, y, z, r: s * 0.95, rock: true });
    });
    rocks.count = ri; group.add(rocks);
  }
  if (base === 'volcan') {
    const pilG = M.pillarGeo();
    const pil = new THREE.InstancedMesh(pilG, mats.vc, L.pillars); let pi = 0;
    scatter(L.pillars, 120, 420, 0, 0, 5, 9, 30, (x, y, z, s) => {
      const gy = Math.max(ground(x, z), floorY) - 3, hh = 40 + R() * 70;
      pil.setMatrixAt(pi++, tmpM.compose(tv.set(x, gy + hh / 2, z), tq.identity(), ts.set(s, hh, s)));
      obstacles.push({ type: 'c', x, y: 0, z, r: s * 0.95, y0: gy, y1: gy + hh, rock: true });
    });
    pil.count = pi; group.add(pil);
    const rockG = M.rockGeo(0x2a2220, 0x6b4a3a, 9);
    const rocks = new THREE.InstancedMesh(rockG, mats.vc, L.rocks); let ri = 0;
    scatter(L.rocks, 100, 400, 90, 190, 4, 9, 30, (x, y, z, s) => {
      te.set(R() * 3, R() * 3, 0); tq.setFromEuler(te);
      rocks.setMatrixAt(ri++, tmpM.compose(tv.set(x, y, z), tq, ts.set(s, s, s)));
      obstacles.push({ type: 's', x, y, z, r: s * 0.95, rock: true });
    });
    rocks.count = ri; group.add(rocks);
    // resplandor del cráter
    const glow = new THREE.Mesh(new THREE.CircleGeometry(30, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a20, toneMapped: false }));
    glow.position.set(0, ground(0, 0) + 1.2, 0); group.add(glow);
  }

  // ---------- nubes instanciadas ----------
  const cloudMax = 140;
  const clouds = new THREE.InstancedMesh(M.cloudGeo(), mats.cloud, cloudMax);
  const cloudData = [];
  for (let i = 0; i < cloudMax; i++) {
    const a = R() * Math.PI * 2, d = 40 + Math.sqrt(R()) * 480;
    const y = base === 'picos' ? (i % 3 === 0 ? 150 + R() * 70 : floorY - 2 + R() * 10) : base === 'lago' ? 150 + R() * 90 : 170 + R() * 80;
    const s = base === 'picos' && y < 40 ? 2.2 + R() * 2.5 : 1.4 + R() * 2;
    cloudData.push({ x: Math.cos(a) * d, y, z: Math.sin(a) * d, s, sp: 0.6 + R() * 1.2 });
  }
  if (kind === 'volcan' || kind === 'tormenta') /** @type {any} */ (clouds).material = new THREE.MeshStandardMaterial({ color: kind === 'volcan' ? 0x4a3a3a : 0x5a6474, flatShading: true, roughness: 1, emissive: kind === 'volcan' ? 0x401812 : 0x10141c, emissiveIntensity: 0.6 });
  group.add(clouds);
  function placeClouds(t) {
    for (let i = 0; i < clouds.count; i++) {
      const c = cloudData[i];
      let x = c.x + t * c.sp * 2; if (x > 520) x -= 1040;
      clouds.setMatrixAt(i, tmpM.compose(tv.set(x, c.y, c.z), tq.identity(), ts.set(c.s, c.s * 0.8, c.s)));
    }
    clouds.instanceMatrix.needsUpdate = true;
  }

  // ---------- partículas ambientales (copos, luciérnagas, brasas, lluvia) ----------
  const AMAX = 420;
  const aPos = new Float32Array(AMAX * 3);
  for (let i = 0; i < AMAX; i++) { aPos[i * 3] = (R() - 0.5) * 160; aPos[i * 3 + 1] = (R() - 0.5) * 100; aPos[i * 3 + 2] = (R() - 0.5) * 160; }
  const aGeo = new THREE.BufferGeometry(); aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  const aColor = kind === 'volcan' ? 0xff9a3a : kind === 'lago' ? 0xfff2a0 : kind === 'tormenta' ? 0xaabbdd : 0xffffff;
  const ambient = new THREE.Points(aGeo, new THREE.PointsMaterial({ color: aColor, map: dotTexture(), size: kind === 'tormenta' ? 0.45 : kind === 'lago' ? 0.9 : 0.6, transparent: true, opacity: kind === 'picos' ? 0.6 : 0.8, depthWrite: false, toneMapped: false, blending: kind === 'picos' ? THREE.NormalBlending : THREE.AdditiveBlending }));
  ambient.frustumCulled = false; group.add(ambient);
  const aVel = kind === 'volcan' ? [0.4, 3, 0.2] : kind === 'tormenta' ? [-6, -45, 3] : kind === 'lago' ? [0.5, 0.4, 0.3] : [-1.5, -1.2, 0.5];

  // ---------- spawns de rivales ----------
  const enemySpawns = (L.enemies || []).map(e => ({ kind: e[0], x: e[1], y: clearY(e[1], e[2], e[3], 24), z: e[3] }));

  o.scene.add(group);

  const region = {
    kind, base, group, height: hfn, floorY, floorKind, palette: P,
    start: { pos: new THREE.Vector3(L.start[0], clearY(L.start[0], L.start[1], L.start[2], 30), L.start[2]), yaw: L.yaw },
    obstacles, rings, ringR, ringMats, markers, inns, nests, eggs, updrafts, geysers, portal, academy, enemySpawns,
    clouds, ambient, sun, sunDir, hemi, sky, sunDisc, terrain, lava, mirror, water: waterMesh, /** @type {any} */ setMirror: null,
    courseKind: L.course ? L.course.kind : null,
    /** @param {'low'|'medium'|'high'} _q @param {any} q */
    applyQuality(_q, q) {
      clouds.count = Math.min(cloudMax, q.clouds); placeClouds(0);
      ambient.geometry.setDrawRange(0, Math.min(AMAX, q.ambient));
      sun.castShadow = !!q.shadows;
    },
    /** Animaciones del entorno. @param {number} dt @param {number} t @param {THREE.Vector3} cam */
    update(dt, t, cam, focus, far) {
      sky.position.copy(cam); sky.scale.setScalar(far * 0.85);
      sunDisc.position.copy(cam).addScaledVector(sunDir, far * 0.75); sunDisc.lookAt(cam);
      sun.position.copy(focus).addScaledVector(sunDir, 160); sun.target.position.copy(focus);
      if ((Math.floor(t * 10) & 1) === 0) placeClouds(t);
      // partículas ambientales alrededor de la cámara
      const n = ambient.geometry.drawRange.count === Infinity ? AMAX : Math.min(AMAX, ambient.geometry.drawRange.count);
      for (let i = 0; i < n; i++) {
        let x = aPos[i * 3] + aVel[0] * dt + Math.sin(t + i) * 0.02, y = aPos[i * 3 + 1] + aVel[1] * dt, z = aPos[i * 3 + 2] + aVel[2] * dt;
        if (x > 80) x -= 160; else if (x < -80) x += 160;
        if (y > 50) y -= 100; else if (y < -50) y += 100;
        if (z > 80) z -= 160; else if (z < -80) z += 160;
        aPos[i * 3] = x; aPos[i * 3 + 1] = y; aPos[i * 3 + 2] = z;
      }
      ambient.position.copy(cam);
      ambient.geometry.attributes.position.needsUpdate = true;
      if (lava) { const map = /** @type {any} */ (lava.material).map; map.offset.x = t * 0.01; map.offset.y = t * 0.006; }
      for (const u of updrafts) for (let k = 0; k < u.swirls.length; k++) { const s = u.swirls[k]; s.position.y = -80 + ((t * 18 + k * 45) % 180); s.rotation.y = t; }
      for (const m of markers) { m.col.rotation.y = t * 0.4; if (m.lamp) m.lamp.rotation.y = t * 2; }
      for (const it of inns) { it.flag.rotation.y = Math.sin(t * 2 + it.pos.x) * 0.25; it.hoop.rotation.z = t * 0.5; }
      for (const e of eggs) { if (e.group.visible) { e.egg.position.y = Math.sin(t * 2.4) * 0.5 + 0.4; e.egg.rotation.y = t; e.halo.scale.setScalar(1 + Math.sin(t * 3) * 0.1); } }
      if (portal.visible) { portal.userData.ring.rotation.z = t * 0.6; portal.userData.disc.rotation.z = -t; portal.lookAt(cam.x, portal.position.y, cam.z); }
      if (academy) academy.userData.flag.rotation.y = Math.sin(t * 1.7) * 0.3;
    },
    disposed: false,
    dispose() {
      region.disposed = true;
      o.scene.remove(group);
      group.traverse(x => {
        const a = /** @type {any} */ (x);
        if (a.geometry) a.geometry.dispose();
        if (a.material && a.material !== mats.vc && a.material !== mats.vcDouble && a.material !== mats.cloud && a.material !== mats.glow) {
          if (a.material.map && a.material.map !== dotTexture()) a.material.map.dispose();
          a.material.dispose();
        }
        if (a.isReflector) a.dispose();
      });
      sun.dispose(); hemi.dispose();
      disposables.forEach(d => d.dispose());
    },
  };
  // espejo real del lago sólo en calidad alta (cuesta un render extra de la escena por cuadro)
  if (floorKind === 'agua') region.setMirror = async (on) => setMirror(region, on, o, group, P);
  return region;
}

/** Activa/desactiva el espejo del lago (Reflector). Calidad alta = espejo real; media/baja = brillo de entorno. */
async function setMirror(region, on, o, group, P) {
  if (region.disposed) return;
  if (on && !region.mirror) {
    const { Reflector } = await import('three/addons/objects/Reflector.js');
    if (region.disposed || region.mirror) return;
    const r = new Reflector(new THREE.PlaneGeometry(1400, 1400), { textureWidth: 512, textureHeight: 512, color: 0x8fa3b8, multisample: 0 });
    r.rotation.x = -Math.PI / 2; r.position.y = region.floorY;
    group.add(r); region.mirror = r;
    if (region.water) { const m = region.water.material; m.transparent = true; m.opacity = 0.42; m.depthWrite = false; m.needsUpdate = true; }
  } else if (!on && region.mirror) {
    group.remove(region.mirror); region.mirror.dispose(); region.mirror.geometry.dispose(); region.mirror = null;
    if (region.water) { const m = region.water.material; m.transparent = false; m.opacity = 1; m.depthWrite = true; m.needsUpdate = true; }
  }
}

export { hPicos, hLago, hVolcan };
