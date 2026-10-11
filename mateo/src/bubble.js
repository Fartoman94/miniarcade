// Mateo: Ciudad de Altura — globos de diálogo sobre la cabeza (vecinos, víctimas, testigos, villanos que se rinden).
// Sprite con textura de canvas, cacheada por texto (pocos textos distintos), sin asignaciones por cuadro.
import * as THREE from 'three';

const cache = new Map();
function tex(text, color) {
  const k = color + '|' + text; if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 30;
  g.font = `800 ${fs}px system-ui,sans-serif`;
  const w = Math.min(560, Math.ceil(g.measureText(text).width) + 36), h = 64;
  c.width = w; c.height = h + 14;
  g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3;
  const r = 18; g.beginPath(); g.moveTo(r, 0); g.lineTo(w - r, 0); g.quadraticCurveTo(w, 0, w, r); g.lineTo(w, h - r); g.quadraticCurveTo(w, h, w - r, h); g.lineTo(w / 2 + 10, h); g.lineTo(w / 2, h + 12); g.lineTo(w / 2 - 10, h); g.lineTo(r, h); g.quadraticCurveTo(0, h, 0, h - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0); g.fill(); g.stroke();
  g.fillStyle = '#14202e'; g.font = `800 ${fs}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 1, w - 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const o = { t, aspect: c.width / c.height }; cache.set(k, o); return o;
}

/** Globo reutilizable atado a un objeto 3D. say(texto, segundos, color) / tick(dt) / hide() */
export function createBubble(parent, height = 2.3) {
  const mat = new THREE.SpriteMaterial({ depthTest: false, transparent: true });
  const sp = new THREE.Sprite(mat); sp.visible = false; sp.renderOrder = 12; sp.position.y = height; parent.add(sp);
  let left = 0, text = '';
  return {
    get text() { return sp.visible ? text : ''; },
    say(t, sec = 3, color = '#ffffff') { const o = tex(t, color); mat.map = o.t; mat.needsUpdate = true; sp.scale.set(0.62 * o.aspect, 0.62, 1); sp.visible = true; left = sec; text = t; },
    tick(dt) { if (left > 0) { left -= dt; if (left <= 0) sp.visible = false; } },
    hide() { sp.visible = false; left = 0; },
    dispose() { sp.removeFromParent(); mat.dispose(); },
  };
}
