// @ts-check
/* Granja de Runas — interfaz DOM: HUD, paneles de tienda/diario, avisos flotantes, tutorial y fundidos.
   No conoce reglas de juego: recibe textos y filas ya armadas. */

const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export { esc };

/** Escribe sólo si cambió (evita relayouts por cuadro). */
const last = new Map();
export function setText(id, txt) { if (last.get(id) === txt) return; last.set(id, txt); $(id).textContent = txt; }
export function setHTML(id, html) { if (last.get(id) === html) return; last.set(id, html); $(id).innerHTML = html; }
export function show(id, v) { const el = $(id); if (el.hidden === !v) return; el.hidden = !v; }
export function invalidate() { last.clear(); }

/* ---------- panel modal (tiendas, diario, controles) ---------- */
/** @typedef {{icon?:string, title:string, sub?:string, btn?:string, ok?:boolean, fn?:()=>void, id?:string, tag?:string}} Row */
let panelClose = /** @type {(()=>void)|null} */ (null);
let panelRender = /** @type {(()=>{title:string, intro?:string, rows:Row[], foot?:string})|null} */ (null);
export function openPanel(render, onClose) {
  panelRender = render; panelClose = onClose;
  renderPanel();
  show('panel', true);
  const b = /** @type {HTMLElement|null} */ ($('panel').querySelector('.gr-row button:not([disabled]), .gr-x'));
  b && b.focus({ preventScroll: true });
}
export function renderPanel() {
  if (!panelRender) return;
  const p = panelRender();
  $('panel').innerHTML = `<div class="gr-card" role="dialog" aria-modal="true" aria-labelledby="grPT">
    <div class="gr-head"><h2 id="grPT">${esc(p.title)}</h2><button type="button" class="gr-x" aria-label="Cerrar">✕</button></div>
    ${p.intro ? `<p class="gr-intro">${p.intro}</p>` : ''}
    <div class="gr-rows">${p.rows.map((r, i) => `<div class="gr-row${r.tag ? ' ' + r.tag : ''}" ${r.id ? `data-id="${esc(r.id)}"` : ''}>
      <span class="gr-ic" aria-hidden="true">${r.icon || ''}</span><span class="gr-tx"><b>${esc(r.title)}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</span>
      ${r.btn ? `<button type="button" data-i="${i}" ${r.ok === false ? 'disabled' : ''}>${esc(r.btn)}</button>` : ''}</div>`).join('')}</div>
    ${p.foot ? `<div class="gr-foot">${p.foot}</div>` : ''}</div>`;
  /** @type {any} */ ($('panel'))._rows = p.rows;
}
export function closePanel() {
  if ($('panel').hidden) return;
  show('panel', false); $('panel').innerHTML = '';
  const fn = panelClose; panelClose = null; panelRender = null;
  fn && fn();
}
export const panelOpen = () => !$('panel').hidden;
export function initPanel() {
  const el = $('panel');
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(t, e => e.stopPropagation());
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } else if (e.code !== 'Tab') e.stopPropagation(); });
  el.addEventListener('click', e => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t === el || t.closest('.gr-x')) { closePanel(); return; }
    const b = t.closest('button[data-i]');
    if (!b) return;
    const row = /** @type {any} */ (el)._rows[Number(b.getAttribute('data-i'))];
    if (row && row.fn && row.ok !== false) { row.fn(); renderPanel(); const nb = /** @type {HTMLElement|null} */ (el.querySelector(`button[data-i="${b.getAttribute('data-i')}"]`)); nb && !nb.hasAttribute('disabled') && nb.focus({ preventScroll: true }); }
  });
}

/* ---------- textos flotantes (+monedas, ¡ñam!, etc.) ---------- */
const pops = [];
export function initPops(n = 10) {
  const root = $('pops');
  for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'gr-pop'; d.hidden = true; root.appendChild(d); pops.push({ el: d, t: 0, x: 0, y: 0, z: 0 }); }
}
/** @param {string} text @param {number} x @param {number} y @param {number} z @param {string} [color] */
export function pop(text, x, y, z, color = '#fff') {
  let p = pops.find(q => q.t <= 0) || pops.reduce((a, b) => (a.t < b.t ? a : b));
  p.t = 1.3; p.x = x; p.y = y; p.z = z; p.el.textContent = text; p.el.style.color = color; p.el.hidden = false;
}
/** @param {(x:number,y:number,z:number)=>{sx:number,sy:number,vis:boolean}} project @param {number} dt */
export function updatePops(project, dt) {
  for (const p of pops) {
    if (p.t <= 0) continue;
    p.t -= dt; p.y += dt * 1.2;
    if (p.t <= 0) { p.el.hidden = true; continue; }
    const s = project(p.x, p.y, p.z);
    p.el.style.transform = `translate(${s.sx.toFixed(0)}px,${s.sy.toFixed(0)}px) translate(-50%,-50%)`;
    p.el.style.opacity = String(Math.min(1, p.t * 1.6));
    p.el.hidden = !s.vis;
  }
}
export function clearPops() { for (const p of pops) { p.t = 0; p.el.hidden = true; } }

/* ---------- fundido entre escenarios ---------- */
export function fade(on, reduced) { const f = $('fade'); f.classList.toggle('on', on); f.style.transitionDuration = reduced ? '0s' : ''; }

/* ---------- banner grande (eventos) ---------- */
let bannerT = 0;
export function banner(kicker, title, ms = 2600) {
  const b = $('banner'); b.innerHTML = `<small>${esc(kicker)}</small>${esc(title)}`; b.classList.add('on');
  clearTimeout(bannerT); bannerT = window.setTimeout(() => b.classList.remove('on'), ms);
}
export function hideBanner() { $('banner').classList.remove('on'); }
