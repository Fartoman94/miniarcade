// @ts-check
/* MateLabs Arcade SDK — sistemas compartidos por todos los juegos de MiniArcade.

   Script clásico (no módulo) para que los juegos puedan llamar a MLArcade.init() de forma
   síncrona desde su propio <script>. Se carga en el <head> o antes del script del juego:
     <script src="matelabs/arcade.js"></script>

   Qué aporta, sin tocar las mecánicas de cada juego:
   - Barra flotante: volver al arcade, pausa, sonido, pantalla completa.
   - Pausa uniforme (Esc / P / Start del gamepad / pestaña oculta) con menú:
     Reanudar · Reiniciar · Cómo jugar · Volver al arcade. El juego sólo implementa
     onPause/onResume/onRestart; mientras está en pausa el SDK bloquea la entrada al juego.
   - Gamepad → teclado: traduce botones y stick a KeyboardEvent sintéticos según un mapa por juego.
   - Puntajes, estadísticas y ajustes compartidos en localStorage (con migración de la clave vieja).
   - Aislamiento de fallos: errores no capturados se registran y muestran un aviso con opciones.
   - Observabilidad: telemetría local (últimos 200 eventos) y medidor de FPS (?debug=1 o F3).

   Todo acceso a localStorage va en try/catch: en modo privado o sin almacenamiento el juego
   sigue funcionando, sólo sin persistencia. */
(() => {
  if (/** @type {any} */ (window).MLArcade) return;

  const me = /** @type {HTMLScriptElement|null} */ (document.currentScript);
  const BASE = me ? me.src.replace(/matelabs\/[^/]*$/, '') : './';
  const PORTAL = BASE + 'index.html';
  const VERSION = '1.0.0';

  /* ---------- almacenamiento seguro ---------- */
  const store = {
    /** @param {string} k @param {any} [d] */
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    /** @param {string} k @param {any} v */
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    /** @param {string} k */
    raw(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  };

  /* ---------- telemetría local ---------- */
  const TEL_KEY = 'ml:telemetry';
  /** @param {string} type @param {Record<string, any>} [data] */
  function track(type, data = {}) {
    const ev = { t: Date.now(), game: state.id || 'portal', type, ...data };
    const list = store.get(TEL_KEY, []);
    list.push(ev);
    store.set(TEL_KEY, list.slice(-200));
    if (state.debug) console.debug('[MLArcade]', type, data);
  }

  /* ---------- ajustes globales ---------- */
  const SET_KEY = 'ml:settings';
  /** @type {{muted:boolean, showFps:boolean}} */
  const settings = Object.assign({ muted: false, showFps: false }, store.get(SET_KEY, {}));
  /** @type {Set<(s: typeof settings) => void>} */
  const settingsListeners = new Set();

  /* ---------- estado ---------- */
  const qs = new URLSearchParams(location.search);
  const state = {
    id: '', title: '', paused: false, started: false, playStart: 0,
    debug: qs.has('debug'),
    /** @type {any} */ meta: null,
    /** @type {Omit<Required<InitOpts>,'onRestart'> & {onRestart: (()=>void)|null}} */ opts: /** @type {any} */ (null),
  };

  /** @typedef {{id:string, title?:string, help?:string[],
   *  isActive?:()=>boolean, onPause?:()=>void, onResume?:()=>void, onRestart?:()=>void, onExit?:()=>void,
   *  onMute?:(muted:boolean)=>void, toolbar?:'tl'|'tr'|'bl'|'br'|'none',
   *  gamepad?:Record<string,string>|false, pauseKeys?:string[], pauseOnBlur?:boolean, legacyBestKey?:string}} InitOpts */

  /* ---------- estilos ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .mla-bar{position:fixed;z-index:2147482000;display:flex;gap:6px;padding:6px;pointer-events:none;
    padding-top:max(6px,env(safe-area-inset-top));font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
  .mla-bar.tl{top:0;left:0;padding-left:max(6px,env(safe-area-inset-left))}
  .mla-bar.tr{top:0;right:0;padding-right:max(6px,env(safe-area-inset-right))}
  .mla-bar.bl{bottom:0;left:0;top:auto;padding-bottom:max(6px,env(safe-area-inset-bottom))}
  .mla-bar.br{bottom:0;right:0;top:auto;padding-bottom:max(6px,env(safe-area-inset-bottom))}
  .mla-btn{pointer-events:auto;width:34px;height:34px;border-radius:10px;border:1px solid rgba(255,255,255,.18);
    background:rgba(8,14,22,.55);color:#e8fbff;font-size:15px;line-height:1;display:grid;place-items:center;cursor:pointer;
    backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:background .15s,transform .1s;padding:0;text-decoration:none}
  .mla-btn:hover{background:rgba(46,230,230,.25)}
  .mla-btn:active{transform:scale(.92)}
  .mla-btn:focus-visible{outline:2px solid #2ee6e6;outline-offset:2px}
  .mla-btn[hidden]{display:none}
  .mla-pause{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;
    background:rgba(2,8,12,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;padding:16px}
  .mla-pause[hidden]{display:none}
  .mla-card{width:min(360px,100%);max-height:100%;overflow:auto;background:linear-gradient(180deg,#0e2430,#08141c);
    border:1px solid rgba(46,230,230,.3);border-radius:18px;padding:22px 20px;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 40px rgba(46,230,230,.12);
    display:flex;flex-direction:column;gap:10px;text-align:center}
  .mla-card h2{font-family:'Bungee',system-ui,sans-serif;font-weight:400;font-size:24px;letter-spacing:.04em;margin:0 0 4px}
  .mla-card small{color:#8fb9bd;letter-spacing:.2em;font-size:10px;font-weight:700}
  .mla-card button,.mla-card a{appearance:none;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;
    border-radius:12px;padding:12px 14px;font:700 14px system-ui,sans-serif;cursor:pointer;text-decoration:none;display:block}
  .mla-card button:hover,.mla-card a:hover,.mla-card button:focus-visible,.mla-card a:focus-visible{background:rgba(46,230,230,.2);outline:none;border-color:#2ee6e6}
  .mla-card .mla-primary{background:#2ee6e6;color:#04121a;border-color:#2ee6e6}
  .mla-card .mla-primary:hover,.mla-card .mla-primary:focus-visible{background:#7ff3f3}
  .mla-help{text-align:left;font-size:13px;line-height:1.5;color:#cfe9ec;background:rgba(0,0,0,.25);border-radius:10px;padding:10px 12px;margin:0}
  .mla-help li{margin-left:16px}
  .mla-help[hidden]{display:none}
  .mla-toast{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147482600;
    background:#2a0e12;border:1px solid #ff6b6b;color:#ffe3e3;border-radius:12px;padding:10px 12px;display:flex;gap:8px;align-items:center;
    font:600 13px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:calc(100vw - 32px)}
  .mla-toast button{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:6px 10px;font:700 12px system-ui;cursor:pointer}
  .mla-fps{position:fixed;left:6px;bottom:6px;z-index:2147482000;font:700 11px ui-monospace,monospace;color:#7fffd4;
    background:rgba(0,0,0,.6);padding:4px 6px;border-radius:6px;pointer-events:none;white-space:pre}
  .mla-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  `;
  document.head.appendChild(css);

  /* ---------- UI ---------- */
  /** @param {string} tag @param {Record<string,string>} attrs @param {string} [html] */
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  let bar = /** @type {HTMLElement|null} */ (null);
  let pauseEl = /** @type {HTMLElement|null} */ (null);
  let btnPause = /** @type {HTMLButtonElement|null} */ (null);
  let btnMute = /** @type {HTMLButtonElement|null} */ (null);

  function buildUI() {
    const pos = state.opts.toolbar;
    if (pos !== 'none') {
      bar = el('div', { class: 'mla-bar ' + pos, role: 'toolbar', 'aria-label': 'Controles del arcade' });
      const home = el('a', { class: 'mla-btn', href: PORTAL, title: 'Volver al arcade', 'aria-label': 'Volver al arcade' }, '⌂');
      home.addEventListener('click', () => track('exit', { via: 'toolbar' }));
      btnPause = /** @type {HTMLButtonElement} */ (el('button', { class: 'mla-btn', type: 'button', title: 'Pausa (Esc / P)', 'aria-label': 'Pausa' }, '⏸'));
      btnMute = /** @type {HTMLButtonElement} */ (el('button', { class: 'mla-btn', type: 'button', 'aria-label': 'Sonido' }));
      const fs = el('button', { class: 'mla-btn', type: 'button', title: 'Pantalla completa', 'aria-label': 'Pantalla completa' }, '⛶');
      btnPause.addEventListener('click', e => { e.stopPropagation(); togglePause(); });
      btnMute.addEventListener('click', e => { e.stopPropagation(); setSetting('muted', !settings.muted); });
      fs.addEventListener('click', e => { e.stopPropagation(); toggleFullscreen(); });
      // que los toques sobre la barra no lleguen al juego (muchos escuchan pointerdown en window)
      for (const t of ['pointerdown', 'mousedown', 'touchstart']) bar.addEventListener(t, e => e.stopPropagation());
      if (!document.fullscreenEnabled && !(/** @type {any} */ (document).webkitFullscreenEnabled)) fs.hidden = true;
      bar.append(home, btnPause, btnMute, fs);
      document.body.appendChild(bar);
      refreshButtons();
    }

    const help = (state.opts.help.length ? state.opts.help : defaultHelp()).map(h => `<li>${escapeHTML(h)}</li>`).join('');
    pauseEl = el('div', { class: 'mla-pause', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mla-ptitle', hidden: '' }, `
      <div class="mla-card">
        <small>${escapeHTML(state.title || state.id)}</small>
        <h2 id="mla-ptitle">PAUSA</h2>
        <button type="button" class="mla-primary" data-a="resume">▶ Reanudar</button>
        ${state.opts.onRestart ? '<button type="button" data-a="restart">↻ Reiniciar partida</button>' : ''}
        <button type="button" data-a="help" aria-expanded="false">? Cómo jugar</button>
        <ul class="mla-help" hidden>${help}</ul>
        <button type="button" data-a="mute"></button>
        <a href="${PORTAL}" data-a="exit">⌂ Volver al arcade</a>
      </div>`);
    pauseEl.addEventListener('click', e => {
      e.stopPropagation(); // el clic del menú no debe llegar a los listeners del juego en document/window
      const t = /** @type {HTMLElement} */ (e.target).closest('[data-a]');
      if (!t) { if (e.target === pauseEl) resume(); return; }
      const a = t.getAttribute('data-a');
      if (a === 'resume') resume();
      else if (a === 'restart') { resume(true); track('restart'); state.opts.onRestart && state.opts.onRestart(); }
      else if (a === 'help') { const u = /** @type {HTMLElement} */ (pauseEl && pauseEl.querySelector('.mla-help')); u.hidden = !u.hidden; t.setAttribute('aria-expanded', String(!u.hidden)); }
      else if (a === 'mute') setSetting('muted', !settings.muted);
      else if (a === 'exit') track('exit', { via: 'pause' });
    });
    document.body.appendChild(pauseEl);
    refreshButtons();
  }

  function defaultHelp() {
    const c = state.meta && state.meta.controls;
    if (!c) return ['Esc o P: pausa'];
    return [`PC: ${c.pc}`, `Táctil: ${c.touch}`, ...(c.gamepad ? [`Gamepad: ${c.gamepad}`] : []), 'Esc, P o Start: pausa'];
  }

  function refreshButtons() {
    if (btnMute) { btnMute.textContent = settings.muted ? '🔇' : '🔊'; btnMute.title = settings.muted ? 'Activar sonido' : 'Silenciar'; btnMute.setAttribute('aria-pressed', String(settings.muted)); }
    if (btnPause) { btnPause.hidden = !isActive() && !state.paused; }
    const m = pauseEl && pauseEl.querySelector('[data-a="mute"]');
    if (m) m.textContent = settings.muted ? '🔇 Sonido: NO' : '🔊 Sonido: SÍ';
  }

  /** @param {string} s */
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c); }

  /* ---------- pausa ---------- */
  function isActive() { try { return !!(state.opts && state.opts.isActive()); } catch (e) { return false; } }

  /** @param {string} [reason] */
  function pause(reason = 'user') {
    if (state.paused || !state.opts || !isActive()) return false;
    state.paused = true;
    try { state.opts.onPause(); } catch (e) { reportError(e); }
    if (pauseEl) { pauseEl.hidden = false; const b = /** @type {HTMLElement|null} */ (pauseEl.querySelector('.mla-primary')); b && b.focus({ preventScroll: true }); }
    track('pause', { reason });
    refreshButtons();
    return true;
  }
  /** @param {boolean} [silent] no llamar onResume (p. ej. porque se va a reiniciar) */
  function resume(silent = false) {
    if (!state.paused) return false;
    state.paused = false;
    if (pauseEl) pauseEl.hidden = true;
    if (!silent) { try { state.opts.onResume(); } catch (e) { reportError(e); } }
    refreshButtons();
    return true;
  }
  function togglePause() { return state.paused ? resume() : pause(); }

  // Mientras está en pausa, la entrada no llega al juego (salvo al menú de pausa y la barra).
  const BLOCK = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchmove', 'touchend', 'click', 'wheel', 'contextmenu'];
  /** @param {Event} e */
  function inputGate(e) {
    const target = /** @type {Node|null} */ (e.target instanceof Node ? e.target : null);
    if (e.type === 'keydown') {
      const ke = /** @type {KeyboardEvent} */ (e);
      if (state.opts && state.opts.pauseKeys.includes(ke.code) && !ke.repeat) {
        if (state.paused || isActive()) { e.stopImmediatePropagation(); e.preventDefault(); togglePause(); return; }
      }
      if (ke.code === 'F3') { e.preventDefault(); setSetting('showFps', !settings.showFps); return; }
    }
    if (!state.paused) return;
    if (target && ((pauseEl && pauseEl.contains(target)) || (bar && bar.contains(target)))) {
      // dejar que el menú funcione, pero que el juego no se entere
      if (e.type !== 'click') e.stopPropagation();
      return;
    }
    e.stopImmediatePropagation();
    if (e.cancelable && e.type !== 'keyup') e.preventDefault();
  }
  for (const t of BLOCK) addEventListener(t, inputGate, { capture: true, passive: false });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (pause('hidden')) track('autopause'); }
  });
  addEventListener('blur', () => { if (state.opts && state.opts.pauseOnBlur) pause('blur'); });

  /* ---------- ajustes ---------- */
  /** @param {'muted'|'showFps'} k @param {boolean} v */
  function setSetting(k, v) {
    settings[k] = v;
    store.set(SET_KEY, settings);
    if (k === 'muted' && state.opts) { try { state.opts.onMute(v); } catch (e) { reportError(e); } }
    if (k === 'showFps') fps.toggle(v);
    refreshButtons();
    settingsListeners.forEach(fn => fn(settings));
    track('setting', { k, v });
  }

  /* ---------- pantalla completa y orientación ---------- */
  async function toggleFullscreen() {
    const d = /** @type {any} */ (document);
    try {
      if (document.fullscreenElement || d.webkitFullscreenElement) {
        await (document.exitFullscreen ? document.exitFullscreen() : d.webkitExitFullscreen());
      } else {
        const r = /** @type {any} */ (document.documentElement);
        await (r.requestFullscreen ? r.requestFullscreen({ navigationUI: 'hide' }) : r.webkitRequestFullscreen());
        const want = state.meta && state.meta.orientation;
        const so = /** @type {any} */ (screen.orientation);
        if (want && want !== 'any' && so && so.lock) so.lock(want).catch(() => {});
      }
    } catch (e) { track('fullscreen-fail', { msg: String(e) }); }
  }

  /* ---------- gamepad → teclado ---------- */
  // Botones estándar (W3C "standard" mapping).
  const PAD = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
  const DEFAULT_PAD = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'Space', b: 'Escape' };
  /** @type {Record<string,string>} */
  const KEYNAME = { Space: ' ', Enter: 'Enter', Escape: 'Escape', ShiftLeft: 'Shift', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
  /** @type {Record<string, boolean>} */
  const padHeld = {};
  let padRAF = 0;
  /** @param {string} code @param {boolean} down */
  function synthKey(code, down) {
    const key = KEYNAME[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code);
    const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key, bubbles: true, cancelable: true });
    (document.activeElement && document.activeElement !== document.body ? document.activeElement : document).dispatchEvent(ev);
  }
  function pollPad() {
    padRAF = 0;
    const map = state.opts && state.opts.gamepad;
    if (!map) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    /** @type {Record<string, boolean>} */
    const now = {};
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      /** @param {number} i */
      const btn = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      for (const name in map) {
        let on = btn(/** @type {any} */ (PAD)[name] ?? -1);
        if (name === 'left') on = on || ax < -0.5;
        if (name === 'right') on = on || ax > 0.5;
        if (name === 'up') on = on || ay < -0.5;
        if (name === 'down') on = on || ay > 0.5;
        if (on) now[map[name]] = true;
      }
      if (btn(PAD.start) && !padHeld.__start) { togglePause(); }
      now.__start = btn(PAD.start) || !!now.__start;
    }
    for (const code in now) if (!padHeld[code] && code !== '__start') synthKey(code, true);
    for (const code in padHeld) if (!now[code] && code !== '__start') synthKey(code, false);
    for (const k in padHeld) delete padHeld[k];
    Object.assign(padHeld, now);
    if (Object.keys(now).length || anyPad()) padRAF = requestAnimationFrame(pollPad);
  }
  function anyPad() { return navigator.getGamepads && [...navigator.getGamepads()].some(Boolean); }
  addEventListener('gamepadconnected', e => { track('gamepad', { id: /** @type {GamepadEvent} */ (e).gamepad.id }); if (!padRAF) padRAF = requestAnimationFrame(pollPad); });

  /* ---------- puntajes y estadísticas ---------- */
  /** @param {string} [id] */
  function getBest(id = state.id) {
    const s = store.get('ml:scores', {});
    if (s[id] != null) return s[id];
    // migración: récord guardado por la versión anterior del juego
    // (init() puede pasar legacyBestKey para que funcione antes de que cargue el registro)
    const meta = lookupMeta(id);
    const key = (meta && meta.legacyBestKey) || (id === state.id && state.opts && state.opts.legacyBestKey);
    if (key) { const v = parseFloat(store.raw(key) || ''); if (!isNaN(v)) return v; }
    return 0;
  }
  /** @param {number} value @param {string} [id] */
  function submitScore(value, id = state.id) {
    if (typeof value !== 'number' || !isFinite(value)) return { best: getBest(id), isRecord: false };
    const s = store.get('ml:scores', {});
    const prev = getBest(id);
    const isRecord = value > prev;
    if (isRecord || s[id] == null) { s[id] = Math.max(prev, value); store.set('ml:scores', s); }
    track('score', { value, isRecord });
    return { best: Math.max(prev, value), isRecord };
  }
  /** @param {string} [id] */
  function getStats(id) {
    const all = store.get('ml:stats', {});
    return id ? (all[id] || { plays: 0, timeMs: 0, last: 0 }) : all;
  }
  function gameStarted() {
    if (state.started) gameEnded();
    state.started = true; state.playStart = performance.now();
    const all = store.get('ml:stats', {});
    const s = all[state.id] || { plays: 0, timeMs: 0, last: 0 };
    s.plays++; s.last = Date.now();
    all[state.id] = s; store.set('ml:stats', all);
    track('start');
    refreshButtons();
  }
  /** @param {{score?:number}} [info] */
  function gameEnded(info = {}) {
    if (!state.started) return;
    state.started = false;
    const dur = Math.round(performance.now() - state.playStart);
    const all = store.get('ml:stats', {});
    const s = all[state.id] || { plays: 0, timeMs: 0, last: 0 };
    s.timeMs += dur; all[state.id] = s; store.set('ml:stats', all);
    track('end', { dur, ...info });
    if (typeof info.score === 'number') submitScore(info.score);
    refreshButtons();
  }

  /* ---------- metadatos del registro (carga diferida) ---------- */
  /** @type {any[]|null} */
  let registry = null;
  /** @param {string} id */
  function lookupMeta(id) { return registry && registry.find(g => g.id === id); }
  const registryReady = import(BASE + 'games/registry.js').then(m => { registry = m.GAMES; return m; }).catch(e => { track('registry-fail', { msg: String(e) }); return null; });

  /* ---------- errores ---------- */
  let toastShown = false;
  /** @param {any} err */
  function reportError(err) {
    const msg = (err && (err.message || err.reason && err.reason.message)) || String(err);
    track('error', { msg: String(msg).slice(0, 300), src: err && err.filename ? `${err.filename}:${err.lineno}` : undefined });
    if (toastShown || !document.body) return;
    toastShown = true;
    const t = el('div', { class: 'mla-toast', role: 'alert' },
      `<span>⚠️ El juego tuvo un problema.</span><button type="button" data-a="reload">Reiniciar</button><button type="button" data-a="close">Seguir</button>`);
    t.addEventListener('click', e => {
      const a = /** @type {HTMLElement} */ (e.target).getAttribute('data-a');
      if (a === 'reload') location.reload();
      if (a === 'close') { t.remove(); toastShown = false; }
    });
    document.body.appendChild(t);
  }
  addEventListener('error', e => { if (e.error || e.message) reportError(e.error ? Object.assign(e.error, { filename: e.filename, lineno: e.lineno }) : e); });
  addEventListener('unhandledrejection', e => reportError(e.reason || e));

  /* ---------- medidor de FPS / perf ---------- */
  const fps = (() => {
    let box = /** @type {HTMLElement|null} */ (null), raf = 0, frames = 0, t0 = 0, worst = 0, last = 0;
    const perf = { fps: 0, worstMs: 0, samples: /** @type {number[]} */ ([]) };
    /** @type {any} */ (window).__mlPerf = perf;
    /** @param {number} t */
    function tick(t) {
      frames++; worst = Math.max(worst, t - last); last = t;
      if (t - t0 >= 1000) {
        perf.fps = Math.round(frames * 1000 / (t - t0)); perf.worstMs = Math.round(worst);
        perf.samples.push(perf.fps); if (perf.samples.length > 120) perf.samples.shift();
        const mem = /** @type {any} */ (performance).memory;
        if (box) box.textContent = `${perf.fps} fps · peor ${perf.worstMs}ms` + (mem ? `\n${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB heap` : '');
        frames = 0; worst = 0; t0 = t;
      }
      raf = requestAnimationFrame(tick);
    }
    return {
      /** @param {boolean} on */
      toggle(on) {
        if (on && !raf) { box = el('div', { class: 'mla-fps', 'aria-hidden': 'true' }, '…'); document.body.appendChild(box); t0 = last = performance.now(); raf = requestAnimationFrame(tick); }
        if (!on && raf) { cancelAnimationFrame(raf); raf = 0; box && box.remove(); box = null; }
      },
    };
  })();

  /* ---------- ciclo de vida ---------- */
  addEventListener('pagehide', () => {
    if (state.started) gameEnded();
    try { state.opts && state.opts.onExit(); } catch (e) { /* salir igual */ }
  });

  /* ---------- API pública ---------- */
  const API = {
    version: VERSION,
    /** @param {InitOpts} o */
    init(o) {
      if (state.opts) throw new Error('MLArcade.init() ya fue llamado');
      const noop = () => {};
      state.id = o.id;
      state.title = o.title || '';
      state.opts = /** @type {any} */ ({
        id: o.id, title: o.title || '', help: o.help || [], isActive: o.isActive || (() => false),
        onPause: o.onPause || noop, onResume: o.onResume || noop, onRestart: o.onRestart || null, onExit: o.onExit || noop,
        onMute: o.onMute || noop, toolbar: o.toolbar || 'tr', gamepad: o.gamepad === false ? false : Object.assign({}, DEFAULT_PAD, o.gamepad || {}),
        pauseKeys: o.pauseKeys || ['Escape', 'KeyP'], pauseOnBlur: !!o.pauseOnBlur, legacyBestKey: o.legacyBestKey || '',
      });
      const ready = () => {
        buildUI();
        if (settings.showFps || state.debug) fps.toggle(true);
      };
      if (document.body) ready(); else addEventListener('DOMContentLoaded', ready, { once: true });
      registryReady.then(() => {
        state.meta = lookupMeta(o.id) || null;
        if (!state.title && state.meta) state.title = state.meta.title;
        if (pauseEl && !state.opts.help.length) {
          const u = pauseEl.querySelector('.mla-help');
          if (u) u.innerHTML = defaultHelp().map(h => `<li>${escapeHTML(h)}</li>`).join('');
        }
      });
      // estado inicial del sonido
      if (settings.muted) queueMicrotask(() => { try { state.opts.onMute(true); } catch (e) { reportError(e); } });
      track('open');
      return API;
    },
    pause, resume, togglePause,
    isPaused: () => state.paused,
    /** Llamar cuando el jugador arranca una partida. */
    started: gameStarted,
    /** Llamar al terminar una partida (opcionalmente con el puntaje). */
    ended: gameEnded,
    refresh: refreshButtons,
    scores: { best: getBest, submit: submitScore },
    stats: getStats,
    settings: {
      /** @param {'muted'|'showFps'} k */ get: k => settings[k],
      set: setSetting,
      /** @param {(s: typeof settings) => void} fn */ on: fn => { settingsListeners.add(fn); return () => settingsListeners.delete(fn); },
    },
    track, reportError, toggleFullscreen,
    registry: () => registryReady,
    portalUrl: PORTAL,
  };
  /** @type {any} */ (window).MLArcade = API;
})();
