// @ts-check
/* Cocina del Caos — interfaz DOM: HUD, tickets de pedidos, avisos flotantes, banner, paneles y tutorial.
   No conoce reglas de juego: recibe textos ya armados. Escribe en el DOM sólo si algo cambió. */
import { RECIPES, ING, STATE_BADGE } from './config.js';

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
export const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const last = new Map();
export function setText(id, t) { if (last.get(id) === t) return; last.set(id, t); $(id).textContent = t; }
export function setHTML(id, h) { if (last.get(id) === h) return; last.set(id, h); $(id).innerHTML = h; }
export function show(id, v) { const el = $(id); if (el.hidden === !v) return; el.hidden = !v; }
export function invalidate() { last.clear(); }

/* ---------- tickets ---------- */
const tk = [];
export function initTickets(n = 5) {
  const root = $('tickets');
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'tk'; d.hidden = true;
    d.innerHTML = '<div class="tk-h"><span class="tk-i"></span><span class="tk-n"></span></div><div class="tk-p"></div><div class="tk-b"><i></i></div>';
    root.appendChild(d); tk.push({ el: d, id: -1, w: -1, cls: '' });
  }
}
function partHTML(p) {
  const [ing, st] = p.split(':');
  const d = ING[ing]; if (!d) return '';
  return `<span class="tk-c" title="${esc(d.name)}">${d.icon}${STATE_BADGE[st] ? `<b>${STATE_BADGE[st]}</b>` : ''}</span>`;
}
/** @param {any[]} orders */
export function renderTickets(orders) {
  for (let i = 0; i < tk.length; i++) {
    const t = tk[i], o = orders[i];
    if (!o) { if (!t.el.hidden) { t.el.hidden = true; t.id = -1; } continue; }
    if (t.id !== o.id) {
      t.id = o.id; const r = RECIPES[o.recipe];
      t.el.querySelector('.tk-i').textContent = r.icon;
      t.el.querySelector('.tk-n').textContent = (o.royal ? '👑 ' : '') + r.name;
      t.el.querySelector('.tk-p').innerHTML = r.parts.map(partHTML).join('') + `<span class="tk-s">${r.steps} pasos</span>`;
      t.el.classList.toggle('royal', !!o.royal);
      t.el.classList.remove('in'); void t.el.offsetWidth; t.el.classList.add('in');
      t.el.hidden = false; t.w = -1;
    }
    const f = Math.max(0, o.t / o.tMax), w = Math.round(f * 100);
    if (w !== t.w) { t.w = w; const bar = /** @type {HTMLElement} */ (t.el.querySelector('.tk-b i')); bar.style.width = w + '%'; const cls = f < 0.25 ? 'low' : f < 0.5 ? 'mid' : ''; if (cls !== t.cls) { t.cls = cls; t.el.classList.toggle('low', cls === 'low'); t.el.classList.toggle('mid', cls === 'mid'); } }
  }
}

/* ---------- textos flotantes ---------- */
const pops = [];
export function initPops(n = 10) { const root = $('pops'); for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'cc-pop'; d.hidden = true; root.appendChild(d); pops.push({ el: d, t: 0, x: 0, y: 0, z: 0 }); } }
export function pop(text, x, y, z, color = '#fff') {
  const p = pops.find(q => q.t <= 0) || pops.reduce((a, b) => (a.t < b.t ? a : b));
  p.t = 1.3; p.x = x; p.y = y; p.z = z; p.el.textContent = text; p.el.style.color = color; p.el.hidden = false;
}
export function updatePops(project, dt) {
  for (const p of pops) {
    if (p.t <= 0) continue;
    p.t -= dt; p.y += dt * 1.1;
    if (p.t <= 0) { p.el.hidden = true; continue; }
    const s = project(p.x, p.y, p.z);
    p.el.style.transform = `translate(${s.sx.toFixed(0)}px,${s.sy.toFixed(0)}px) translate(-50%,-50%)`;
    p.el.style.opacity = String(Math.min(1, p.t * 1.6));
  }
}
export function clearPops() { for (const p of pops) { p.t = 0; p.el.hidden = true; } }

/* ---------- banner ---------- */
let bannerT = 0;
export function banner(kicker, title, ms = 2400, cls = '') {
  const b = $('banner'); b.className = cls; b.innerHTML = `${esc(title)}<small>${esc(kicker)}</small>`; b.classList.add('on');
  clearTimeout(bannerT); bannerT = window.setTimeout(() => b.classList.remove('on'), ms);
}
export function hideBanner() { $('banner').classList.remove('on'); }

/* ---------- panel modal ---------- */
let panelClose = /** @type {(()=>void)|null} */ (null);
export function openPanel(html, onClose) {
  panelClose = onClose || null;
  $('panel').innerHTML = `<div class="cc-card" role="dialog" aria-modal="true" aria-labelledby="ccPT">${html}</div>`;
  show('panel', true);
  const b = /** @type {HTMLElement|null} */ ($('panel').querySelector('button'));
  b && b.focus({ preventScroll: true });
}
export function closePanel() { if ($('panel').hidden) return; show('panel', false); $('panel').innerHTML = ''; const f = panelClose; panelClose = null; f && f(); }
export const panelOpen = () => !$('panel').hidden;
export function initPanel() {
  const el = $('panel');
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(t, e => e.stopPropagation());
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } else if (e.code !== 'Tab' && e.code !== 'Enter' && e.code !== 'Space') e.stopPropagation(); });
  el.addEventListener('click', e => { const t = /** @type {HTMLElement} */ (e.target); if (t === el || t.closest('[data-close]')) closePanel(); });
}
