// @ts-check
/* Portal de MiniArcade: catálogo, búsqueda, categorías, favoritos, seguir jugando,
   estadísticas y ficha de cada juego con recomendaciones. Todo sale de games/registry.js. */
import { GAMES, CATEGORIES } from '../games/registry.js';
import { filterGames, recommend, bestText, fmtTime, totals } from './catalog.js';

/** @typedef {import('../games/registry.js').GameMeta} GameMeta */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const ML = /** @type {any} */ (window).MLArcade;
const FAV_KEY = 'ml:favs', VIEW_KEY = 'ml:portal-view';
const store = {
  /** @param {string} k @param {any} d */
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  /** @param {string} k @param {any} v */
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
};
/** @param {string} s */
const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {Record<string,string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** @param {string} hex @param {number} a */
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
/** @param {GameMeta} g */
const vars = g => `--glow:${g.accent};--glow-soft:${hexA(g.accent, .15)};--accent-bg:${hexA(g.accent, .12)};--accent-text:${g.accent}`;

await ML.registry(); // asegura la migración de récords guardados por versiones anteriores
const favs = new Set(/** @type {string[]} */ (store.get(FAV_KEY, [])).filter(id => GAMES.some(g => g.id === id)));
const saved = store.get(VIEW_KEY, {});
let cat = saved.cat && (saved.cat === 'todos' || saved.cat === 'favoritos' || CATEGORIES[saved.cat]) ? saved.cat : 'todos';
let sort = ['featured', 'played', 'recent', 'az'].includes(saved.sort) ? saved.sort : 'featured';
let query = '';
/** @type {HTMLSelectElement} */ ($('sort')).value = sort;

/** @param {GameMeta} g */
const info = g => ({ best: ML.scores.best(g.id), ...ML.stats(g.id) });

function renderChips() {
  const list = [['todos', 'Todos'], ...Object.entries(CATEGORIES).filter(([k]) => GAMES.some(g => g.category === k)), ['favoritos', '♥ Favoritos']];
  $('chips').innerHTML = list.map(([k, v]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${k === cat}">${esc(v)}</button>`).join('');
}

function renderMe() {
  const t = totals(GAMES, info);
  const me = $('me');
  if (!t.plays) { me.hidden = true; return; }
  me.hidden = false;
  me.innerHTML = `<div><b>${t.plays}</b><span>PARTIDAS</span></div><div><b>${fmtTime(t.timeMs)}</b><span>JUGADO</span></div><div><b>${t.tried}/${GAMES.length}</b><span>PROBADOS</span></div>`;
}

function renderContinue() {
  const recent = GAMES.map(g => ({ g, s: info(g) })).filter(x => x.s.last).sort((a, b) => b.s.last - a.s.last).slice(0, 4);
  $('continueSec').hidden = !recent.length;
  $('continue').innerHTML = recent.map(({ g, s }) =>
    `<a class="mini" href="${g.file}" style="${vars(g)}"><i aria-hidden="true">${g.icon}</i><span><b>${esc(g.title)}</b><small>Récord: ${esc(bestText(g, s.best))}</small></span></a>`).join('');
}

/** @param {GameMeta} g @param {ReturnType<typeof info>} s @param {number} i */
function card(g, s, i) {
  const fav = favs.has(g.id);
  return `<article class="card" style="${vars(g)};animation-delay:${i * .05}s" data-id="${g.id}">
    <div class="card-top"><div class="icon-wrap" aria-hidden="true">${g.icon}</div>
      <button type="button" class="fav" data-fav="${g.id}" aria-pressed="${fav}" aria-label="${fav ? 'Quitar de' : 'Agregar a'} favoritos: ${esc(g.title)}">${fav ? '♥' : '♡'}</button></div>
    <div class="grow"><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p></div>
    <div class="tags"><span class="tag">${esc(CATEGORIES[g.category])}</span>${g.tags.map((t, j) => `<span class="tag${j === 0 ? ' highlight' : ''}">${esc(t)}</span>`).join('')}</div>
    ${s.plays ? `<div class="mystats"><span>Récord <b>${esc(bestText(g, s.best))}</b></span><span>Partidas <b>${s.plays}</b></span></div>` : ''}
    <div class="actions"><a class="play-btn" href="${g.file}">▶ JUGAR</a><button type="button" class="info-btn" data-info="${g.id}" aria-label="Ver ficha de ${esc(g.title)}">Ficha</button></div>
  </article>`;
}

function renderGrid() {
  const { list, stats } = filterGames(GAMES, { cat, query, sort, favs, info, categories: CATEGORIES });
  $('grid').innerHTML = list.length ? list.map((g, i) => card(g, stats[g.id], i)).join('')
    : `<p class="empty">${cat === 'favoritos' && !query ? 'Todavía no marcaste favoritos. Tocá ♡ en un juego.' : 'No encontramos juegos con esa búsqueda.'}</p>`;
  $('count').textContent = `${list.length} juego${list.length === 1 ? '' : 's'}`;
}

/** @param {string} id */
function toggleFav(id) {
  favs.has(id) ? favs.delete(id) : favs.add(id);
  store.set(FAV_KEY, [...favs]);
  ML.track('fav', { id, on: favs.has(id) });
  renderGrid();
  if (/** @type {HTMLDialogElement} */ ($('detail')).open) openDetail(id, true);
}
function persist() { store.set(VIEW_KEY, { cat, sort }); }

/** @param {string} id @param {boolean} [keep] */
function openDetail(id, keep = false) {
  const g = GAMES.find(x => x.id === id); if (!g) return;
  const s = info(g), d = /** @type {HTMLDialogElement} */ ($('detail'));
  d.setAttribute('style', vars(g));
  const fav = favs.has(g.id);
  d.innerHTML = `<button type="button" class="d-close" data-close aria-label="Cerrar">✕</button>
    <div class="d-head"><div class="icon-wrap" aria-hidden="true">${g.icon}</div><div><small>${esc(CATEGORIES[g.category]).toUpperCase()} · ${esc(g.tech)}</small><h2 id="dTitle">${esc(g.title)}</h2></div></div>
    <div class="d-body">
      <p>${esc(g.description)}</p>
      <div><h3>CONTROLES</h3><dl class="ctrl"><dt>PC</dt><dd>${esc(g.controls.pc)}</dd><dt>Táctil</dt><dd>${esc(g.controls.touch)}</dd>${g.controls.gamepad ? `<dt>Gamepad</dt><dd>${esc(g.controls.gamepad)}</dd>` : ''}<dt>Pausa</dt><dd>Esc, P o el botón ⏸</dd></dl></div>
      <div><h3>TUS NÚMEROS</h3><div class="d-stats"><div><b>${esc(bestText(g, s.best))}</b><span>RÉCORD</span></div><div><b>${s.plays}</b><span>PARTIDAS</span></div><div><b>${s.timeMs ? fmtTime(s.timeMs) : '—'}</b><span>TIEMPO</span></div></div></div>
      ${g.heavy ? '<p style="font-size:13px;color:#9a9aa8">ℹ️ Juego 3D: la primera vez descarga Three.js (~600 KB).</p>' : ''}
      <div class="actions"><a class="play-btn" href="${g.file}">▶ JUGAR</a><button type="button" class="info-btn" data-fav="${g.id}" aria-pressed="${fav}">${fav ? '♥ Favorito' : '♡ Favorito'}</button></div>
      <div><h3>TE PUEDE GUSTAR</h3><div class="recs">${recommend(g, GAMES, info).map(r => `<button type="button" data-info="${r.id}"><span aria-hidden="true">${r.icon}</span>${esc(r.title)}</button>`).join('')}</div></div>
    </div>`;
  if (!d.open) d.showModal();
  if (!keep && location.hash !== '#/juego/' + id) history.replaceState(null, '', '#/juego/' + id);
  ML.track('detail', { id });
}

$('chips').addEventListener('click', e => {
  const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-cat]')); if (!b) return;
  cat = b.dataset.cat || 'todos'; persist(); renderChips(); renderGrid();
});
$('grid').addEventListener('click', e => {
  const t = /** @type {HTMLElement} */ (e.target);
  const f = /** @type {HTMLElement|null} */ (t.closest('[data-fav]'));
  if (f) { toggleFav(f.dataset.fav || ''); return; }
  const i = /** @type {HTMLElement|null} */ (t.closest('[data-info]'));
  if (i) openDetail(i.dataset.info || '');
});
let qTimer = 0;
$('q').addEventListener('input', e => {
  query = /** @type {HTMLInputElement} */ (e.target).value;
  clearTimeout(qTimer);
  qTimer = window.setTimeout(() => { renderGrid(); if (query) ML.track('search', { q: query.slice(0, 40) }); }, 120);
});
$('sort').addEventListener('change', e => { sort = /** @type {HTMLSelectElement} */ (e.target).value; persist(); renderGrid(); });
$('detail').addEventListener('click', e => {
  const d = /** @type {HTMLDialogElement} */ ($('detail')), t = /** @type {HTMLElement} */ (e.target);
  if (t === d || t.closest('[data-close]')) { d.close(); return; }
  const f = /** @type {HTMLElement|null} */ (t.closest('[data-fav]')); if (f) { toggleFav(f.dataset.fav || ''); return; }
  const i = /** @type {HTMLElement|null} */ (t.closest('[data-info]')); if (i) openDetail(i.dataset.info || '');
});
$('detail').addEventListener('close', () => { if (location.hash.startsWith('#/juego/')) history.replaceState(null, '', location.pathname + location.search); });
function route() { const m = location.hash.match(/^#\/juego\/([\w-]+)/); if (m) openDetail(m[1]); }
addEventListener('hashchange', route);
// Al volver desde un juego con el botón Atrás (bfcache) los números se actualizan.
addEventListener('pageshow', e => { if (e.persisted) { renderMe(); renderContinue(); renderGrid(); } });

renderChips(); renderMe(); renderContinue(); renderGrid(); route();
document.documentElement.dataset.portal = 'ready';

// Service worker: caché de archivos estáticos para cargas repetidas y modo sin conexión.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !new URLSearchParams(location.search).has('nosw')) {
  navigator.serviceWorker.register('sw.js').catch(err => ML.track('sw-fail', { msg: String(err) }));
}
