// Mateo: Ciudad de Altura — V2 P2: utilidades para muebles y carteles. Carga los 12 GLB «proxy» del kit
// (game/assets/proxy, mobiliario original low-poly con color por vértice) como plantillas: cada uso es un clon que
// COMPARTE geometría y material (entrar/salir del departamento no crea geometrías nuevas). Carteles de texto con
// canvas (nombre del comercio, «ABIERTO/CERRADO», «CASA DE MATEO»).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PROXY_NAMES = ['cama_departamento', 'heladera_departamento', 'maceta_departamento', 'mesa_comedor', 'mesada_cocina', 'puerta_apartamento', 'puesto_de_comida', 'ropero_mateo', 'silla_simple', 'sofa_departamento', 'caja_registradora', 'banco_plaza_nuevo'];

/** carga las plantillas; si alguna falla se usa una caja de color (el juego sigue) y se informa en `missing` */
export async function loadProxies() {
  const loader = new GLTFLoader(), out = { missing: [] };
  await Promise.all(PROXY_NAMES.map(async n => {
    try {
      const g = await loader.loadAsync(new URL(`../assets/proxy/${n}.glb`, import.meta.url).href);
      const root = g.scene;
      // suelo en y = 0 y centro horizontal en 0 (el README del kit lo promete; se fuerza por las dudas)
      const bb = new THREE.Box3().setFromObject(root), c = bb.getCenter(new THREE.Vector3());
      const wrap = new THREE.Group(); root.position.set(-c.x, -bb.min.y, -c.z); wrap.add(root); wrap.name = n;
      wrap.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      out[n] = { tpl: wrap, size: bb.getSize(new THREE.Vector3()) };
    } catch (e) { out.missing.push(n); }
  }));
  return out;
}
/** instancia (clon que comparte geometría/material) de una plantilla, o una caja si no cargó */
export function place(proxies, name, x, y, z, ry = 0, fallback = [1, 1, 1, 0x999999]) {
  const p = proxies[name];
  let o;
  if (p) o = p.tpl.clone(true);
  else { o = new THREE.Mesh(new THREE.BoxGeometry(fallback[0], fallback[1], fallback[2]).translate(0, fallback[1] / 2, 0), new THREE.MeshStandardMaterial({ color: fallback[3] })); }
  o.position.set(x, y, z); o.rotation.y = ry;
  return o;
}
/** tamaño (x,y,z) de una plantilla rotada ry (múltiplos de 90°) */
export function footprint(proxies, name, ry = 0, fallback = [1, 1, 1]) {
  const s = proxies[name] ? proxies[name].size : new THREE.Vector3(...fallback);
  const q = Math.round(ry / (Math.PI / 2)) % 2 !== 0;
  return q ? [s.z, s.y, s.x] : [s.x, s.y, s.z];
}

/** textura de cartel: líneas [{text, size, color, weight}] sobre fondo de color */
export function signTexture(lines, { w = 512, h = 128, bg = '#1f6f9f', border = '#ffffff' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const draw = (L, bgc = bg) => {
    g.fillStyle = bgc; g.fillRect(0, 0, w, h);
    g.strokeStyle = border; g.lineWidth = Math.max(4, h * 0.05); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    const total = L.reduce((a, l) => a + l.size * 1.15, 0); let y = (h - total) / 2;
    for (const l of L) { g.font = `${l.weight || 800} ${l.size}px system-ui, sans-serif`; g.fillStyle = l.color || '#fff'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(l.text, w / 2, y + l.size * 0.08, w * 0.94); y += l.size * 1.15; }
  };
  draw(lines);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { tex, redraw(L, bgc) { draw(L, bgc); tex.needsUpdate = true; } };
}
