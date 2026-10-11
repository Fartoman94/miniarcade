// Mateo: Ciudad de Altura — texturas: mapas PBR del kit (albedo/normal/rugosidad) y fachadas procedurales en canvas
// (vidrio con parteluces, oficinas con bandas, ladrillo con ventanas y alféizares, vivienda revocada, locales con
// vidrieras y carteles ficticios). Todo es original y se genera en el navegador.
import * as THREE from 'three';
import { rng } from './util.js';

const loader = new THREE.TextureLoader();
const BASE = new URL('../assets/textures/', import.meta.url).href;

function kit(name, aniso) {
  const set = {};
  for (const k of ['albedo', 'normal', 'roughness']) {
    const t = loader.load(`${BASE}${name}_${k}.png`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (k === 'albedo') t.colorSpace = THREE.SRGBColorSpace;
    set[k] = t;
  }
  return set;
}

function canvasTex(w, h, draw, aniso, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  return t;
}

/** Vidrio: 4 vanos × 4 pisos por textura (12 m × 14 m). */
function glass(seed, tint) {
  return (g, W, H) => {
    const r = rng(seed), bw = W / 4, fh = H / 4;
    g.fillStyle = '#2b3542'; g.fillRect(0, 0, W, H);
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
      const x = bx * bw, y = fy * fh;
      const gr = g.createLinearGradient(x, y, x + bw * 0.6, y + fh);
      const lit = r() < 0.12, k = 0.85 + r() * 0.3;
      gr.addColorStop(0, `rgba(${200 * k | 0},${225 * k | 0},${240 * k | 0},1)`);
      gr.addColorStop(0.45, tint);
      gr.addColorStop(1, `rgba(${40 * k | 0},${62 * k | 0},${86 * k | 0},1)`);
      g.fillStyle = gr; g.fillRect(x + 5, y + 5, bw - 10, fh * 0.78 - 5);
      if (lit) { g.fillStyle = 'rgba(255,226,160,.45)'; g.fillRect(x + 8, y + fh * 0.35, bw - 16, fh * 0.4); }
      if (r() < 0.3) { g.fillStyle = 'rgba(230,236,240,.35)'; g.fillRect(x + 6, y + 6, bw - 12, fh * (0.15 + r() * 0.3)); } // cortinas
      g.fillStyle = '#3d4855'; g.fillRect(x, y + fh * 0.78, bw, fh * 0.22); // antepecho
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 7, y + 7, 3, fh * 0.7);
    }
    g.fillStyle = '#9aa7b3'; for (let bx = 0; bx <= 4; bx++) g.fillRect(bx * bw - 3, 0, 6, H);
    for (let fy = 0; fy <= 4; fy++) g.fillRect(0, fy * fh - 2, W, 4);
  };
}
/** Oficinas: hormigón claro con bandas de ventanas (3 vanos × 4 pisos = 9 m × 14 m). */
function office(seed) {
  return (g, W, H) => {
    const r = rng(seed), fh = H / 4, bw = W / 3;
    g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 2, 2); }
    for (let fy = 0; fy < 4; fy++) {
      const y = fy * fh;
      g.fillStyle = '#b9b5ac'; g.fillRect(0, y + fh * 0.86, W, fh * 0.14);
      for (let bx = 0; bx < 3; bx++) {
        const x = bx * bw;
        const lit = r() < 0.15;
        g.fillStyle = lit ? '#e8d6a2' : '#5a7286'; g.fillRect(x + 10, y + fh * 0.18, bw - 20, fh * 0.56);
        g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 12, y + fh * 0.2, bw - 24, fh * 0.12);
        g.fillStyle = '#4b5560'; g.fillRect(x + bw / 2 - 2, y + fh * 0.18, 4, fh * 0.56);
        g.fillStyle = '#efece6'; g.fillRect(x + 6, y + fh * 0.74, bw - 12, 6);
      }
    }
  };
}
/** Ladrillo con ventanas de marco blanco (3 vanos × 4 pisos = 9 m × 12.8 m). */
function brick(seed, base) {
  return (g, W, H) => {
    const r = rng(seed), fh = H / 4, bw = W / 3;
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 10) for (let x = (y / 10) % 2 ? -12 : 0; x < W; x += 24) {
      const k = 0.85 + r() * 0.3; g.fillStyle = `rgba(${150 * k | 0},${70 * k | 0},${52 * k | 0},.55)`; g.fillRect(x + 1, y + 1, 22, 8);
    }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 3; bx++) {
      const x = bx * bw + bw * 0.24, y = fy * fh + fh * 0.2, w = bw * 0.52, h = fh * 0.58;
      g.fillStyle = '#f1ece2'; g.fillRect(x - 5, y - 5, w + 10, h + 10);
      const lit = r() < 0.12;
      g.fillStyle = lit ? '#f0d79a' : '#3e5163'; g.fillRect(x, y, w, h);
      g.fillStyle = '#f1ece2'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.45, w, 4);
      g.fillStyle = '#cfc6b6'; g.fillRect(x - 8, y + h + 4, w + 16, 7);
      if (r() < 0.25) { g.fillStyle = '#5d8c4a'; g.fillRect(x - 2, y + h - 6, w + 4, 8); } // macetas
    }
  };
}
/** Vivienda revocada con persianas (3 vanos × 4 pisos). */
function stucco(seed) {
  return (g, W, H) => {
    const r = rng(seed), fh = H / 4, bw = W / 3;
    g.fillStyle = '#f2ece2'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(90,70,50,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 3, 3); }
    for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 3; bx++) {
      const x = bx * bw + bw * 0.27, y = fy * fh + fh * 0.18, w = bw * 0.46, h = fh * 0.62;
      g.fillStyle = '#ffffff'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
      g.fillStyle = r() < 0.15 ? '#f2d9a0' : '#4c5f70'; g.fillRect(x, y, w, h);
      const sh = r() < 0.5;
      if (sh) { g.fillStyle = '#6f8f6a'; g.fillRect(x - 14, y, 12, h); g.fillRect(x + w + 2, y, 12, h); }
      g.fillStyle = '#d9d0c0'; g.fillRect(x - 6, y + h + 3, w + 12, 6);
    }
  };
}
/** Mapa de ventanas encendidas para la noche (negro + ventanas cálidas en las mismas posiciones del diseño diurno). */
function night(seed, cols, rows, [rx, ry, rw, rh], p) {
  return (g, W, H) => {
    const r = rng(seed * 7 + 1), bw = W / cols, fh = H / rows;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (r() > p) continue;
      const k = 0.6 + r() * 0.4, warm = r() < 0.8;
      g.fillStyle = warm ? `rgb(${255 * k | 0},${205 * k | 0},${130 * k | 0})` : `rgb(${150 * k | 0},${200 * k | 0},${255 * k | 0})`;
      g.fillRect(x * bw + bw * rx, y * fh + fh * ry, bw * rw, fh * rh);
    }
  };
}
const SHOPS = [['PANADERÍA LUCERO', '#c0392b'], ['KIOSCO ALTURA', '#1f6f9f'], ['FARMACIA SOL', '#2e8b57'], ['LIBRERÍA NUBE', '#7b4fa0'],
  ['CAFÉ DEL MATE', '#8a5a2b'], ['HELADOS PINGÜI', '#e07ab0'], ['BICIS RUEDA', '#e08a1e'], ['VERDULERÍA OMBÚ', '#4f9a2f']];
/** Locales: atlas 4×2 de vidrieras con cartel (cada celda = un frente de local). */
function shops(g, W, H) {
  const cw = W / 4, ch = H / 2;
  SHOPS.forEach(([name, col], i) => {
    const x = (i % 4) * cw, y = Math.floor(i / 4) * ch;
    g.fillStyle = '#e9e4da'; g.fillRect(x, y, cw, ch);
    g.fillStyle = col; g.fillRect(x + 6, y + 8, cw - 12, ch * 0.2);
    g.fillStyle = '#fff'; g.font = `900 ${Math.round(ch * 0.085)}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, x + cw / 2, y + 8 + ch * 0.1, cw - 24);
    const gx = x + 12, gy = y + ch * 0.3, gw = cw - 24, gh = ch * 0.66;
    const gr = g.createLinearGradient(gx, gy, gx + gw, gy + gh); gr.addColorStop(0, '#b9d4e2'); gr.addColorStop(0.5, '#4c6578'); gr.addColorStop(1, '#2b3a47');
    g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
    g.fillStyle = 'rgba(255,230,170,.35)'; g.fillRect(gx + 6, gy + gh * 0.45, gw * 0.55, gh * 0.5);
    g.fillStyle = '#3b3b3b'; g.fillRect(gx + gw * 0.66, gy + gh * 0.12, gw * 0.26, gh * 0.88); // puerta
    g.fillStyle = '#9ec2d4'; g.fillRect(gx + gw * 0.68, gy + gh * 0.16, gw * 0.22, gh * 0.5);
    g.fillStyle = '#ffd34a'; g.fillRect(gx + gw * 0.86, gy + gh * 0.6, 5, 5);
    g.fillStyle = '#7b7b7b'; for (let k = 0; k < 3; k++) g.fillRect(gx + 4 + k * (gw * 0.2), gy, 3, gh);
  });
}
/** Señalética: atlas de carteles de calles, landmarks, reloj y emblema M. */
function signs(g, W, H) {
  const cw = W / 4, ch = H / 4;
  const cell = (i, fn) => { const x = (i % 4) * cw, y = Math.floor(i / 4) * ch; g.save(); g.translate(x, y); fn(cw, ch); g.restore(); };
  const txt = (s, size, col, y) => { g.fillStyle = col; g.font = `900 ${size}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, cw / 2, y, cw - 16); };
  const names = ['AV. DEL VIENTO', 'CALLE NUBE', 'AV. CENTRAL', 'CALLE FAROL'];
  names.forEach((n, i) => cell(i, (w, h) => { g.fillStyle = '#1f5f3f'; g.fillRect(4, h * 0.3, w - 8, h * 0.4); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(10, h * 0.33, w - 20, h * 0.34); txt(n, h * 0.17, '#fff', h / 2); }));
  cell(4, (w, h) => { g.fillStyle = '#1b2b3e'; g.fillRect(0, 0, w, h); txt('BANCO CENTRAL', h * 0.16, '#ffd34a', h / 2); });
  cell(5, (w, h) => { g.fillStyle = '#0f2236'; g.fillRect(0, 0, w, h); txt('TORRE ALTURA', h * 0.16, '#8ae9ff', h / 2); });
  cell(6, (w, h) => { g.fillStyle = '#f4efe6'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.46, 0, 7); g.fill(); g.strokeStyle = '#2b2b2b'; g.lineWidth = 6; g.stroke();
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.fillStyle = '#2b2b2b'; g.fillRect(w / 2 + Math.cos(a) * h * 0.38 - 3, h / 2 + Math.sin(a) * h * 0.38 - 3, 6, 6); }
    g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2, h * 0.2); g.moveTo(w / 2, h / 2); g.lineTo(w * 0.68, h / 2); g.stroke(); });
  cell(7, (w, h) => { g.fillStyle = '#c0392b'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `900 ${h * 0.7}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', w / 2, h * 0.55); });
  cell(8, (w, h) => { g.fillStyle = '#2c3e50'; g.fillRect(0, 0, w, h); txt('PLAZA MAYOR', h * 0.15, '#fff', h / 2); });
  cell(9, (w, h) => { g.fillStyle = '#2e6b3a'; g.fillRect(0, 0, w, h); txt('PARQUE DEL OMBÚ', h * 0.13, '#fff', h / 2); });
  cell(10, (w, h) => { g.fillStyle = '#f2b81d'; g.fillRect(0, 0, w, h); txt('OBRA · CUIDADO', h * 0.14, '#1a1a1a', h / 2); g.fillStyle = '#1a1a1a'; for (let k = 0; k < 6; k++) g.fillRect(k * w / 6, h * 0.82, w / 12, h * 0.18); });
  cell(11, (w, h) => { g.fillStyle = '#1a73a8'; g.fillRect(0, 0, w, h); txt('PARADA 12', h * 0.16, '#fff', h * 0.4); txt('Línea 5 · 33', h * 0.11, '#dff', h * 0.68); });
  cell(12, (w, h) => { g.fillStyle = '#3a2f5a'; g.fillRect(0, 0, w, h); txt('CENTRO COMUNITARIO', h * 0.11, '#ffe2a8', h / 2); });
  cell(13, (w, h) => { g.fillStyle = '#e8eef2'; g.fillRect(0, 0, w, h); txt('TORRE DEL RELOJ', h * 0.13, '#2a3a4a', h / 2); });
  cell(14, (w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff7eb3'); gr.addColorStop(1, '#7afcff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); txt('¡VOLÁ ALTO!', h * 0.18, '#1a1a40', h / 2); });
  cell(15, (w, h) => { g.fillStyle = '#123a5a'; g.fillRect(0, 0, w, h); txt('PUERTO DE ALTURA', h * 0.12, '#ffd34a', h / 2); });
}

/** V2: segundo atlas de señalética (zona de referencia, Barrio del Sol, tránsito). Celdas 4×4. */
export const SIGN2 = { prisma: 0, glicinas: 1, sol: 2, parking: 3, pare: 4, peatones: 5, cafe: 6, amistad: 7, bienvenidos: 8, buzon: 9, info: 10, bici: 11, diarios: 12, helados: 13, flores: 14, panaderia: 15 };
function signs2(g, W, H) {
  const cw = W / 4, ch = H / 4;
  const cell = (i, fn) => { const x = (i % 4) * cw, y = Math.floor(i / 4) * ch; g.save(); g.translate(x, y); fn(cw, ch); g.restore(); };
  const txt = (s, size, col, y) => { g.fillStyle = col; g.font = `900 ${size}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, cw / 2, y, cw - 16); };
  const plate = (bg, t, size, col) => (w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); txt(t, size, col, h / 2); };
  cell(0, plate('#1f5f3f', 'AVENIDA PRISMA', 30, '#fff'));
  cell(1, plate('#1f5f3f', 'BARRIO LAS GLICINAS', 22, '#fff'));
  cell(2, plate('#c26a1a', 'BARRIO DEL SOL', 30, '#fff'));
  cell(3, (w, h) => { g.fillStyle = '#1f4fa0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `900 ${h * 0.7}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('E', w / 2, h * 0.55); });
  cell(4, (w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#c0281c'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; g.lineTo(w / 2 + Math.cos(a) * w * 0.46, h / 2 + Math.sin(a) * h * 0.46); } g.fill(); txt('PARE', h * 0.26, '#fff', h / 2); });
  cell(5, (w, h) => { g.fillStyle = '#1f6fc0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w - 14, h - 14); g.lineTo(14, h - 14); g.closePath(); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(w / 2, h * 0.42, h * 0.06, 0, 7); g.fill(); g.fillRect(w / 2 - 6, h * 0.5, 12, h * 0.22); g.fillRect(w * 0.36, h * 0.8, w * 0.28, 8); });
  cell(6, plate('#8a5a2b', 'CAFÉ DEL MATE', 30, '#ffe7c4'));
  cell(7, plate('#2e6b3a', 'PARQUE DE LA AMISTAD', 22, '#fff'));
  cell(8, (w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffcf6a'); gr.addColorStop(1, '#f07a3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); txt('BIENVENIDOS', h * 0.14, '#3a1a08', h * 0.36); txt('BARRIO DEL SOL', h * 0.15, '#3a1a08', h * 0.62); });
  cell(9, (w, h) => { g.fillStyle = '#e8b81a'; g.fillRect(0, 0, w, h); txt('CORREO', h * 0.2, '#1a1a1a', h / 2); });
  cell(10, plate('#2c3e50', 'i · PLANO', 30, '#fff'));
  cell(11, plate('#e08a1e', 'BICIS', 34, '#fff'));
  cell(12, plate('#34495e', 'DIARIOS', 34, '#fff'));
  cell(13, plate('#e07ab0', 'HELADOS', 34, '#fff'));
  cell(14, plate('#4f9a2f', 'FLORES', 34, '#fff'));
  cell(15, plate('#c0392b', 'PANADERÍA', 30, '#fff'));
}

/** Crea el conjunto de materiales del mundo. aniso según calidad. */
export function createMaterials(renderer, quality) {
  const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), quality === 'low' ? 2 : 8);
  const K = {
    asphalt: kit('asfalto_urbano', aniso), concrete: kit('hormigon_acera', aniso), grass: kit('cesped_parque', aniso),
    brickPBR: kit('ladrillo_rojizo', aniso), metal: kit('metal_cepillado', aniso), roof: kit('techo_grava', aniso),
  };
  const nrm = quality !== 'low';
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const glassMats = [glass(11, '#7fa6c4'), glass(23, '#86b8b0'), glass(37, '#9aa9c9')].map(f => canvasTex(512, 512, f, aniso));
  const nightTex = {
    glass: [11, 23, 37].map(sd => canvasTex(256, 256, night(sd, 4, 4, [0.04, 0.04, 0.92, 0.72], 0.45), aniso)),
    office: canvasTex(192, 256, night(5, 3, 4, [0.12, 0.18, 0.76, 0.56], 0.4), aniso),
    brick: canvasTex(192, 256, night(9, 3, 4, [0.24, 0.2, 0.52, 0.58], 0.5), aniso),
    stucco: canvasTex(192, 256, night(13, 3, 4, [0.27, 0.18, 0.46, 0.62], 0.5), aniso),
    shops: canvasTex(256, 128, (g, W, H) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); for (let i = 0; i < 8; i++) { const x = (i % 4) * W / 4, y = Math.floor(i / 4) * H / 2; g.fillStyle = '#ffd890'; g.fillRect(x + 6, y + H * 0.17, W / 4 - 12, H * 0.32); g.fillStyle = '#ffffff'; g.fillRect(x + 4, y + 4, W / 4 - 8, H * 0.09); } }, aniso, false),
  };
  const mats = {
    asphalt: std({ map: K.asphalt.albedo, normalMap: nrm ? K.asphalt.normal : null, roughnessMap: K.asphalt.roughness, roughness: 1 }),
    sidewalk: std({ map: K.concrete.albedo, normalMap: nrm ? K.concrete.normal : null, roughnessMap: K.concrete.roughness, roughness: 1 }),
    grass: std({ map: K.grass.albedo, normalMap: nrm ? K.grass.normal : null, roughness: 1 }),
    roof: std({ map: K.roof.albedo, normalMap: nrm ? K.roof.normal : null, roughness: 1 }),
    metal: std({ map: K.metal.albedo, normalMap: nrm ? K.metal.normal : null, metalness: 0.55, roughness: 0.45 }),
    trim: std({ roughness: 0.8 }),
    paint: std({ roughness: 0.6 }),
    glass0: std({ map: glassMats[0], roughness: 0.22, metalness: 0.35, emissiveMap: nightTex.glass[0], emissive: 0xffffff, emissiveIntensity: 0 }),
    glass1: std({ map: glassMats[1], roughness: 0.22, metalness: 0.35, emissiveMap: nightTex.glass[1], emissive: 0xffffff, emissiveIntensity: 0 }),
    glass2: std({ map: glassMats[2], roughness: 0.22, metalness: 0.35, emissiveMap: nightTex.glass[2], emissive: 0xffffff, emissiveIntensity: 0 }),
    office: std({ map: canvasTex(384, 512, office(5), aniso), roughness: 0.75, emissiveMap: nightTex.office, emissive: 0xffffff, emissiveIntensity: 0 }),
    brick: std({ map: canvasTex(384, 512, brick(9, '#a5503a'), aniso), normalMap: nrm ? K.brickPBR.normal : null, roughness: 0.9, emissiveMap: nightTex.brick, emissive: 0xffffff, emissiveIntensity: 0 }),
    stucco: std({ map: canvasTex(384, 512, stucco(13), aniso), roughness: 0.9, emissiveMap: nightTex.stucco, emissive: 0xffffff, emissiveIntensity: 0 }),
    shops: std({ map: canvasTex(1024, 512, shops, aniso, false), roughness: 0.5, emissiveMap: nightTex.shops, emissive: 0xffffff, emissiveIntensity: 0 }),
    signs: (() => { const t = canvasTex(1024, 1024, signs, aniso, false); return std({ map: t, roughness: 0.6, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0 }); })(),
    signs2: (() => { const t = canvasTex(1024, 1024, signs2, aniso, false); return std({ map: t, roughness: 0.6, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0 }); })(),
    lines: std({ roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x3f8fb0, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.85 }),
  };
  return mats;
}
export const SHOP_COUNT = SHOPS.length;
/** Rect UV de una celda del atlas de locales (4×2). */
export function shopRect(i) { i %= SHOPS.length; const u = (i % 4) / 4, v = 1 - (Math.floor(i / 4) + 1) / 2; return [u, v, u + 0.25, v + 0.5]; }
/** Rect UV de una celda del atlas de carteles (4×4). */
export function signRect(i) { const u = (i % 4) / 4, v = 1 - (Math.floor(i / 4) + 1) / 4; return [u, v, u + 0.25, v + 0.25]; }
