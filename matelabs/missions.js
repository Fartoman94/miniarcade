// @ts-check
/* MateLabs Missions — misiones por partida, logros persistentes y dificultad, compartidos por los juegos.

   Script clásico: window.MLMissions. El juego NO conoce la UI de misiones: sólo emite eventos.

     MLMissions.setup({ gameId, missions: [...], secondaryPerRun: 2, hud: 'top' })
     MLMissions.runStart()                 // al empezar cada partida
     MLMissions.emit('perfectHit')         // eventos del juego (valor opcional: emit('combo', 7))
     MLMissions.runEnd({ won: true })      // al terminar (gana, pierde o abandona)

   Tipos de misión:
   - mode 'count' (por defecto): suma los valores del evento hasta llegar a `target`.
   - mode 'max': toma el mayor valor recibido (p. ej. combo máximo, altura).
   - failOn: eventos que la hacen fallar en esta partida (p. ej. «sin perder vidas»).
   - requireWin: sólo se cumple si la partida termina con { won: true } (se evalúa en runEnd).
   Cada partida tiene la misión principal (kind 'primary') y hasta `secondaryPerRun` secundarias, elegidas
   rotando y priorizando las que nunca se completaron. Las completadas quedan como logros (ml:missions).

   Dificultad: MLMissions.difficulty() → 'facil'|'normal'|'dificil'|'extremo' (por juego, ml:difficulty).
   Cada juego decide qué cambia con cada nivel (velocidades, ventanas de precisión, patrones), nunca los controles. */
(() => {
  if (/** @type {any} */ (window).MLMissions) return;

  /** @typedef {{id:string, kind?:'primary'|'secondary', title:string, desc?:string, event:string, target:number,
   *   mode?:'count'|'max', failOn?:string|string[], requireWin?:boolean, difficulties?:string[]}} Mission */
  /** @typedef {{status:'active'|'done'|'failed', progress:number}} RunState */

  const DIFFS = /** @type {const} */ (['facil', 'normal', 'dificil', 'extremo']);
  const DIFF_LABEL = { facil: 'Fácil', normal: 'Normal', dificil: 'Difícil', extremo: 'Extremo' };
  const M_KEY = 'ml:missions', D_KEY = 'ml:difficulty';
  const store = {
    /** @param {string} k @param {any} d */
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    /** @param {string} k @param {any} v */
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const A = () => /** @type {any} */ (window).MLArcade;
  /** @param {string} s */
  const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {Record<string,string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const S = {
    gameId: '',
    /** @type {Mission[]} */ all: [],
    /** @type {Mission[]} */ current: [],
    /** @type {Record<string, RunState>} */ run: {},
    running: false,
    secondaryPerRun: 2,
    hud: 'top',
    /** @type {Set<(ev:{type:string, mission:Mission})=>void>} */ listeners: new Set(),
  };

  /* ---------- persistencia ---------- */
  function saved() {
    const all = store.get(M_KEY, {});
    return all[S.gameId] || { done: {}, runs: 0 };
  }
  /** @param {any} data */
  function save(data) { const all = store.get(M_KEY, {}); all[S.gameId] = data; store.set(M_KEY, all); }

  /** @param {string} [gameId] */
  function difficulty(gameId = S.gameId) {
    const d = store.get(D_KEY, {})[gameId];
    return DIFFS.includes(d) ? d : 'normal';
  }
  /** @param {string} d @param {string} [gameId] */
  function setDifficulty(d, gameId = S.gameId) {
    if (!DIFFS.includes(/** @type {any} */ (d))) return;
    const all = store.get(D_KEY, {}); all[gameId] = d; store.set(D_KEY, all);
    if (A()) A().track('difficulty', { d });
    dispatchEvent(new CustomEvent('mlmissions:difficulty', { detail: { gameId, difficulty: d } }));
  }

  /* ---------- selección por partida ---------- */
  function pickForRun() {
    const d = difficulty();
    const ok = /** @param {Mission} m */ m => !m.difficulties || m.difficulties.includes(d);
    const prim = S.all.filter(m => m.kind === 'primary' && ok(m));
    const sec = S.all.filter(m => m.kind !== 'primary' && ok(m));
    const data = saved();
    // primero las nunca completadas; dentro de cada grupo se rota según cantidad de partidas
    const rot = data.runs % Math.max(1, sec.length);
    const rotated = sec.slice(rot).concat(sec.slice(0, rot));
    rotated.sort((a, b) => (data.done[a.id] ? 1 : 0) - (data.done[b.id] ? 1 : 0));
    const primary = prim.find(m => !data.done[m.id]) || prim[0];
    return [...(primary ? [primary] : []), ...rotated.slice(0, S.secondaryPerRun)];
  }

  /* ---------- UI: HUD + aviso + sección de pausa ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .mlm-hud{position:fixed;z-index:2147481000;pointer-events:none;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;
    display:flex;flex-direction:column;gap:3px;max-width:min(300px,46vw)}
  .mlm-hud.top{top:max(6px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);align-items:center}
  .mlm-hud.tl{top:max(48px,env(safe-area-inset-top));left:8px}.mlm-hud.tr{top:max(48px,env(safe-area-inset-top));right:8px;align-items:flex-end}
  .mlm-hud.bl{bottom:max(56px,env(safe-area-inset-bottom));left:8px}.mlm-hud.br{bottom:max(56px,env(safe-area-inset-bottom));right:8px;align-items:flex-end}
  .mlm-hud[hidden]{display:none}
  .mlm-m{display:flex;align-items:center;gap:6px;padding:3px 8px;border-radius:999px;background:rgba(4,12,18,.78);
    border:1px solid rgba(255,255,255,.14);font-size:11px;font-weight:700;line-height:1.25}
  .mlm-m.primary{border-color:rgba(255,217,61,.55)}
  .mlm-m .ic{font-size:11px}
  .mlm-m .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
  .mlm-m .p{opacity:.8;font-variant-numeric:tabular-nums}
  .mlm-m.done{background:rgba(26,90,40,.7);border-color:#6be38a}
  .mlm-m.failed{opacity:.45;text-decoration:line-through}
  .mlm-toast{position:fixed;left:50%;top:22%;transform:translate(-50%,-8px);z-index:2147481500;pointer-events:none;opacity:0;
    padding:10px 16px;border-radius:14px;background:linear-gradient(180deg,#1d4a2a,#0f2a18);border:1.5px solid #6be38a;color:#eaffef;
    font:800 14px system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.45);transition:opacity .25s,transform .25s}
  .mlm-toast.on{opacity:1;transform:translate(-50%,0)}
  .mlm-toast small{display:block;font-size:10px;letter-spacing:.2em;opacity:.8}
  .mlm-sec{text-align:left;background:rgba(0,0,0,.25);border-radius:10px;padding:10px 12px;font-size:13px;color:#dff3f5}
  .mlm-sec h3{margin:0 0 6px;font-size:11px;letter-spacing:.2em;color:#8fb9bd}
  .mlm-sec li{list-style:none;margin:4px 0;display:flex;gap:6px}
  .mlm-sec li b{font-weight:700}
  .mlm-sec .mlm-ach{margin-top:6px;font-size:11px;color:#8fb9bd}
  .mlm-diff{display:flex;flex-direction:column;gap:6px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff}
  .mlm-diff-t{font-size:10px;font-weight:800;letter-spacing:.24em;opacity:.75}
  .mlm-diff-row{display:flex;gap:6px;flex-wrap:wrap}
  .mlm-diff button{padding:7px 12px;border-radius:999px;border:1.5px solid rgba(255,255,255,.25);background:rgba(0,0,0,.28);color:#fff;
    font:700 12px system-ui,sans-serif;cursor:pointer;touch-action:manipulation}
  .mlm-diff button[aria-checked="true"]{background:#fff;color:#111;border-color:#fff}
  .mlm-diff button:focus-visible{outline:2px solid #2ee6e6;outline-offset:2px}
  @media (max-height:480px){.mlm-hud.top{top:4px}.mlm-m{font-size:10px;padding:2px 7px}}
  @media (prefers-reduced-motion:reduce){.mlm-toast{transition:none}}
  `;
  document.head.appendChild(css);

  let hud = /** @type {HTMLElement|null} */ (null);
  let toast = /** @type {HTMLElement|null} */ (null);
  let live = /** @type {HTMLElement|null} */ (null);
  const pauseSec = document.createElement('div');
  pauseSec.className = 'mlm-sec';

  function ensureUI() {
    if (!document.body) return;
    if (!hud && S.hud !== 'none') {
      hud = document.createElement('div');
      hud.className = 'mlm-hud ' + S.hud;
      hud.setAttribute('aria-hidden', 'true'); // la info accesible va por la región aria-live y el menú de pausa
      hud.hidden = true;
      document.body.appendChild(hud);
    }
    if (!toast) {
      toast = document.createElement('div'); toast.className = 'mlm-toast'; toast.setAttribute('aria-hidden', 'true');
      live = document.createElement('div'); live.setAttribute('aria-live', 'polite'); live.className = 'mla-sr';
      live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)';
      document.body.append(toast, live);
    }
  }

  /** @param {Mission} m */
  function fmt(m) {
    const r = S.run[m.id] || { status: 'active', progress: 0 };
    const p = Math.min(r.progress, m.target);
    return { r, p, txt: m.target > 1 ? `${Math.floor(p)}/${m.target}` : '' };
  }
  function renderHUD() {
    if (!hud) return;
    hud.hidden = !S.running || !S.current.length;
    hud.innerHTML = S.current.map(m => {
      const { r, txt } = fmt(m);
      const ic = r.status === 'done' ? '✔' : r.status === 'failed' ? '✖' : m.kind === 'primary' ? '★' : '◆';
      return `<div class="mlm-m ${m.kind === 'primary' ? 'primary' : ''} ${r.status}" data-m="${esc(m.id)}"><span class="ic">${ic}</span><span class="t">${esc(m.title)}</span>${txt ? `<span class="p">${txt}</span>` : ''}</div>`;
    }).join('');
  }
  function renderPause() {
    const data = saved();
    const total = S.all.length, done = S.all.filter(m => data.done[m.id]).length;
    pauseSec.innerHTML = `<h3>MISIONES${S.running ? ' DE ESTA PARTIDA' : ''}</h3><ul style="margin:0;padding:0">${
      (S.running ? S.current : S.all.filter(m => m.kind === 'primary')).map(m => {
        const { r, txt } = fmt(m);
        const st = r.status === 'done' ? '✅' : r.status === 'failed' ? '❌' : '⬜';
        return `<li><span aria-hidden="true">${st}</span><span><b>${esc(m.title)}</b>${txt ? ` · ${txt}` : ''}${m.desc ? `<br><small style="opacity:.75">${esc(m.desc)}</small>` : ''}<span class="mla-sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"> ${r.status === 'done' ? 'completada' : r.status === 'failed' ? 'fallida' : 'en curso'}</span></span></li>`;
      }).join('')}</ul><div class="mlm-ach">🏅 Logros de este juego: ${done}/${total} · Dificultad: ${DIFF_LABEL[difficulty()]}</div>`;
  }
  let toastT = 0;
  /** @param {string} title @param {string} kicker */
  function showToast(title, kicker) {
    ensureUI();
    if (!toast || !live) return;
    toast.innerHTML = `<small>${esc(kicker)}</small>${esc(title)}`;
    toast.classList.add('on');
    live.textContent = `${kicker}: ${title}`;
    clearTimeout(toastT);
    toastT = window.setTimeout(() => toast && toast.classList.remove('on'), 2200);
  }

  /* ---------- lógica ---------- */
  /** @param {Mission} m */
  function complete(m) {
    const r = S.run[m.id];
    if (!r || r.status !== 'active') return;
    r.status = 'done';
    const data = saved();
    const first = !data.done[m.id];
    data.done[m.id] = (data.done[m.id] || 0) + 1;
    save(data);
    showToast(m.title, m.kind === 'primary' ? '★ MISIÓN PRINCIPAL CUMPLIDA' : first ? '◆ NUEVO LOGRO' : '◆ MISIÓN CUMPLIDA');
    if (A()) A().track('mission', { id: m.id, first });
    S.listeners.forEach(fn => fn({ type: 'complete', mission: m }));
  }
  /** @param {Mission} m */
  function fail(m) {
    const r = S.run[m.id];
    if (!r || r.status !== 'active') return;
    r.status = 'failed';
    S.listeners.forEach(fn => fn({ type: 'fail', mission: m }));
  }

  /** @param {string} type @param {number} [value] */
  function emit(type, value = 1) {
    if (!S.running) return;
    let changed = false;
    for (const m of S.current) {
      const r = S.run[m.id];
      if (r.status !== 'active') continue;
      const fails = Array.isArray(m.failOn) ? m.failOn : m.failOn ? [m.failOn] : [];
      if (fails.includes(type)) { fail(m); changed = true; continue; }
      if (m.event !== type) continue;
      const v = Number(value) || 0;
      r.progress = m.mode === 'max' ? Math.max(r.progress, v) : r.progress + v;
      changed = true;
      if (r.progress >= m.target && !m.requireWin) complete(m);
    }
    if (changed) { renderHUD(); }
  }

  function runStart() {
    S.current = pickForRun();
    S.run = Object.fromEntries(S.current.map(m => [m.id, /** @type {RunState} */ ({ status: 'active', progress: 0 })]));
    S.running = true;
    const data = saved(); data.runs = (data.runs || 0) + 1; save(data);
    ensureUI(); renderHUD(); renderPause();
  }
  /** @param {{won?:boolean}} [o] */
  function runEnd(o = {}) {
    if (!S.running) return summary();
    for (const m of S.current) {
      const r = S.run[m.id];
      if (r.status !== 'active') continue;
      if (m.requireWin && o.won && r.progress >= m.target) complete(m);
      else fail(m);
    }
    S.running = false;
    renderHUD(); renderPause();
    return summary();
  }
  function summary() {
    return S.current.map(m => ({ id: m.id, title: m.title, kind: m.kind || 'secondary', ...S.run[m.id] }));
  }

  /**
   * Selector de dificultad accesible (radio group). Ponerlo en el menú del juego, no durante la partida.
   * @param {HTMLElement} container @param {{onChange?:(d:string)=>void, title?:string, levels?:string[]}} [o]
   */
  function difficultyPicker(container, o = {}) {
    const levels = (o.levels || DIFFS).filter(d => DIFFS.includes(/** @type {any} */ (d)));
    const wrap = document.createElement('div');
    wrap.className = 'mlm-diff';
    const tid = 'mlm-dt-' + S.gameId;
    wrap.innerHTML = `<div class="mlm-diff-t" id="${tid}">${esc(o.title || 'DIFICULTAD')}</div><div class="mlm-diff-row" role="radiogroup" aria-labelledby="${tid}">${
      levels.map(d => `<button type="button" role="radio" data-d="${d}">${DIFF_LABEL[/** @type {'normal'} */ (d)]}</button>`).join('')}</div>`;
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown']) wrap.addEventListener(t, e => e.stopPropagation());
    const btns = /** @type {HTMLButtonElement[]} */ ([...wrap.querySelectorAll('[data-d]')]);
    const sync = () => { const cur = difficulty(); btns.forEach(b => { const on = b.dataset.d === cur; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); };
    /** @param {string} d @param {boolean} [focus] */
    const choose = (d, focus) => { setDifficulty(d); sync(); renderPause(); if (focus) { const b = btns.find(x => x.dataset.d === d); b && b.focus(); } o.onChange && o.onChange(d); };
    wrap.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-d]'); if (b) choose(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.d)); });
    wrap.addEventListener('keydown', e => {
      const k = /** @type {KeyboardEvent} */ (e).key;
      if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(k)) return;
      e.preventDefault();
      const i = levels.indexOf(difficulty()), dir = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
      choose(levels[(i + dir + levels.length) % levels.length], true);
    });
    sync();
    container.appendChild(wrap);
    return wrap;
  }

  /**
   * @param {{gameId:string, missions:Mission[], secondaryPerRun?:number, hud?:'top'|'tl'|'tr'|'bl'|'br'|'none'}} o
   */
  function setup(o) {
    S.gameId = o.gameId;
    S.all = o.missions.map(m => ({ kind: 'secondary', mode: 'count', ...m }));
    S.secondaryPerRun = o.secondaryPerRun ?? 2;
    S.hud = o.hud || 'top';
    const ids = new Set();
    for (const m of S.all) {
      if (ids.has(m.id)) throw new Error('misión duplicada: ' + m.id);
      ids.add(m.id);
      if (!(m.target > 0)) throw new Error('target inválido en ' + m.id);
    }
    const ready = () => { ensureUI(); renderPause(); if (A()) A().addPauseSection(pauseSec); };
    if (document.body) ready(); else addEventListener('DOMContentLoaded', ready, { once: true });
    return API;
  }

  const API = {
    setup, runStart, runEnd, emit, difficulty, setDifficulty, difficultyPicker,
    levels: DIFFS, labels: DIFF_LABEL,
    /** @param {(ev:{type:string, mission:Mission})=>void} fn */
    on: fn => { S.listeners.add(fn); return () => S.listeners.delete(fn); },
    /** Estado de sólo lectura (para HUD propios y pruebas). */
    state: () => ({ running: S.running, current: summary(), achievements: saved(), difficulty: difficulty() }),
    /** Logros guardados de cualquier juego (para el portal). @param {string} gameId @param {number} total */
    progressOf: (gameId, total) => { const d = store.get(M_KEY, {})[gameId]; return { done: d ? Object.keys(d.done || {}).length : 0, total }; },
  };
  /** @type {any} */ (window).MLMissions = API;
})();
