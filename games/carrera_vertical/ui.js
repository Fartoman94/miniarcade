// @ts-check
/* Carrera Vertical — HUD y paneles DOM propios. Escribe al DOM sólo cuando cambia algo. */

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#140c10;overscroll-behavior:none}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.cv-hud{position:fixed;z-index:30;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,.65)}
.cv-hud[hidden]{display:none!important}
#cv-top{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:5px;width:min(300px,calc(100vw - 210px))}
#cv-top>*:not(#cv-tip){max-width:230px}
#cv-time{font:400 28px/1 'Bungee',system-ui,sans-serif;letter-spacing:.02em;display:flex;align-items:baseline;gap:8px;white-space:nowrap}
#cv-time small{font:800 13px system-ui;letter-spacing:0}
#cv-time .pen{color:#ff6b5d}.cv-good{color:#6bff9e}.cv-bad{color:#ff7a6b}
.cv-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cv-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:rgba(14,10,16,.72);border:1px solid rgba(255,170,120,.28);font:800 12px system-ui;white-space:nowrap}
.cv-cp{letter-spacing:2px;color:#ffb98a}
#cv-speed{height:6px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden;width:100%}
#cv-speed i{display:block;height:100%;width:0;background:linear-gradient(90deg,#46f0ff,#ff7a2f);transition:width .1s linear}
#cv-boss{padding:6px 9px;border-radius:12px;background:rgba(40,6,12,.82);border:1px solid rgba(255,90,90,.5)}
#cv-boss b{display:block;font:400 12px 'Bungee',system-ui,sans-serif;color:#ffd0c8;letter-spacing:.03em}
#cv-boss small{display:block;font:700 11px system-ui;color:#ffc2b8;margin:2px 0 4px}
#cv-boss .bar{height:7px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden}
#cv-boss .bar i{display:block;height:100%;background:linear-gradient(90deg,#ff3348,#ffd23a)}
#cv-combo{left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .25s}
#cv-combo.on{opacity:1;transition:none}
#cv-combo b{display:block;font:400 clamp(22px,5vw,40px)/1 'Bungee',system-ui,sans-serif;color:#ffb02e;text-shadow:0 3px 0 rgba(0,0,0,.35),0 0 24px rgba(255,122,47,.7)}
#cv-combo small{display:block;font:800 12px system-ui;letter-spacing:.25em;color:#fff}
#cv-center{left:50%;top:52%;transform:translate(-50%,-50%);text-align:center;font:400 clamp(48px,14vw,110px)/1 'Bungee',system-ui,sans-serif;color:#fff;
  text-shadow:0 6px 0 rgba(0,0,0,.35),0 0 40px rgba(255,122,47,.8)}
#cv-center:empty{display:none}
#cv-title{left:50%;top:31%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .5s;width:min(92vw,640px)}
#cv-title.on{opacity:1}
#cv-title small{display:block;font:800 12px system-ui;letter-spacing:.35em;color:#ff9a5c}
#cv-title b{display:block;font:400 clamp(24px,6vw,48px)/1.05 'Bungee',system-ui,sans-serif;text-shadow:0 4px 0 rgba(0,0,0,.4),0 0 30px rgba(255,122,47,.55)}
#cv-prompt{left:50%;transform:translateX(-50%);bottom:max(26px,env(safe-area-inset-bottom));padding:8px 16px;border-radius:999px;background:rgba(14,10,16,.86);
  border:1.5px solid #ff7a2f;font:800 14px system-ui;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis}
#cv-prompt kbd{display:inline-block;min-width:20px;padding:1px 6px;margin-right:6px;border-radius:6px;background:#ff7a2f;color:#1a0d06;font:900 12px system-ui;text-align:center}
body.cv-touch #cv-prompt{bottom:calc(196px + env(safe-area-inset-bottom))}
#cv-tip{pointer-events:auto;position:relative;z-index:31;margin-top:4px;
  padding:9px 11px;border-radius:12px;background:rgba(24,12,8,.92);border:1px solid rgba(255,122,47,.6);font:600 13px/1.4 system-ui;color:#ffeee2;box-sizing:border-box}
#cv-tip .k{font:800 10px system-ui;letter-spacing:.22em;color:#ff9a5c;margin-bottom:3px}
#cv-tip .r{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
#cv-tip button{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:6px 10px;font:700 12px system-ui;cursor:pointer;min-height:32px}
#cv-tip button.pri{background:#ff7a2f;color:#1a0d06;border-color:#ff7a2f}
#cv-tip[hidden]{display:none}
@media (orientation:portrait){body.cv-touch #cv-tip{position:fixed;top:auto;left:16px;right:16px;width:auto;bottom:calc(250px + env(safe-area-inset-bottom));margin:0}}
#cv-flash{inset:0;z-index:29;box-shadow:inset 0 0 0 0 rgba(255,40,50,0);transition:box-shadow .35s}
#cv-flash.on{box-shadow:inset 0 0 90px 18px rgba(255,40,50,.6);transition:none}
#cv-speedfx{inset:0;z-index:28;background:radial-gradient(ellipse at center,transparent 55%,rgba(255,255,255,.16) 100%);opacity:0}
#cv-fade{inset:0;z-index:48;background:#0b0608;opacity:0;transition:opacity .3s}
#cv-fade.on{opacity:1}
.cv-menu-prog{font:700 12px system-ui;color:#ffe2cf;background:rgba(0,0,0,.28);border-radius:10px;padding:7px 10px;line-height:1.5}
.cv-dtab{font:600 12px/1.45 system-ui;color:#e8cdbd;max-width:50ch}
.cv-credit{margin-top:4px;font:800 11px system-ui;letter-spacing:.25em;color:#ffe2cf;display:flex;align-items:center;gap:6px;justify-content:center}
.cv-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(255,122,47,.6)}
.cv-courses{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%}
.cv-course{appearance:none;text-align:left;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;padding:9px 10px;cursor:pointer;
  font:600 12px/1.35 system-ui;display:flex;flex-direction:column;gap:2px;min-height:64px}
.cv-course b{font:400 13px 'Bungee',system-ui,sans-serif;letter-spacing:.02em}
.cv-course .m{color:#ffcf8a}
.cv-course[aria-pressed="true"]{border-color:#ff7a2f;background:rgba(255,122,47,.18);box-shadow:0 0 0 1px #ff7a2f inset}
.cv-course[disabled]{opacity:.45;cursor:not-allowed}
.cv-course:focus-visible{outline:2px solid #fff;outline-offset:2px}
.cv-opts{display:grid;gap:8px;width:100%;text-align:left;font:600 14px system-ui}
.cv-opts label,.cv-bind{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.cv-opts input[type=range]{width:140px}
.cv-opts select,.cv-bind button{font:700 13px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;padding:6px 10px;min-height:34px}
.cv-bind button.wait{background:#ff7a2f;color:#1a0d06}
.cv-small{font:600 12px/1.45 system-ui;color:#e3c6b4}
.cv-res{display:grid;grid-template-columns:auto auto;gap:3px 14px;font:700 13px system-ui;text-align:left;background:rgba(0,0,0,.28);border-radius:10px;padding:9px 12px}
.cv-res span:nth-child(odd){color:#e3c6b4;font-weight:600}
.cv-medal{font:400 15px 'Bungee',system-ui,sans-serif;letter-spacing:.03em}
.k3-panel h1{font-size:clamp(28px,7vw,56px)!important}
@media (max-height:520px){.k3-panel h1{font-size:28px!important}.k3-panel{gap:7px!important}.k3-panel p{font-size:12px}.k3-b{padding:10px 16px!important}.cv-dtab{display:none}.cv-course{min-height:0;padding:6px 8px}.cv-course span:not(.m){display:none}
  #cv-time{font-size:22px}#cv-tip{font-size:12px;padding:7px 9px}#cv-tip .r{margin-top:4px}}
@media (prefers-reduced-motion:reduce){#cv-title,#cv-fade,#cv-flash,#cv-combo{transition:none!important}}
`;

const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, extra = '') => { const e = document.createElement('div'); e.id = id; e.className = 'cv-hud ' + extra; document.body.appendChild(e); return e; };
  const top = mk('cv-top'), combo = mk('cv-combo'), center = mk('cv-center'), title = mk('cv-title'), prompt = mk('cv-prompt'), flash = mk('cv-flash'), speedfx = mk('cv-speedfx'), fade = mk('cv-fade');
  top.innerHTML = '<div id="cv-time"></div><div class="cv-row" id="cv-chips"></div><div id="cv-speed" aria-hidden="true"><i></i></div><div id="cv-boss" hidden></div>';
  const timeEl = /** @type {HTMLElement} */ (top.querySelector('#cv-time')), chips = /** @type {HTMLElement} */ (top.querySelector('#cv-chips'));
  const speedBar = /** @type {HTMLElement} */ (top.querySelector('#cv-speed i')), bossEl = /** @type {HTMLElement} */ (top.querySelector('#cv-boss'));
  const tip = document.createElement('div'); tip.id = 'cv-tip'; tip.hidden = true; tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite'); top.appendChild(tip);
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) tip.addEventListener(t, e => e.stopPropagation());
  top.hidden = prompt.hidden = true;
  const last = { time: '', chips: '', prompt: '', boss: '', speed: -1, center: '' };
  let comboT = 0, titleT = 0, flashT = 0;
  /** @type {((a:string)=>void)|null} */ let tipHandler = null;
  tip.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-t]'); if (b && tipHandler) tipHandler(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.t)); });
  return {
    els: { top, combo, center, title, prompt, flash, fade, tip, bossEl },
    /** @param {boolean} v */
    show(v) { top.hidden = !v; if (!v) { prompt.hidden = true; last.prompt = ''; prompt.innerHTML = ''; combo.classList.remove('on'); } },
    /** @param {{time:string, delta:string, deltaGood:boolean, pen:string, cps:string, clocks:number, total:number, speed:number}} s */
    status(s) {
      const h = `${esc(s.time)}${s.delta ? `<small class="${s.deltaGood ? 'cv-good' : 'cv-bad'}">${esc(s.delta)}</small>` : ''}${s.pen ? `<small class="${s.pen[0] === '−' ? 'cv-good' : 'pen'}">${esc(s.pen)}</small>` : ''}`;
      if (h !== last.time) { timeEl.innerHTML = h; last.time = h; }
      const c = `<span class="cv-chip cv-cp" aria-label="puntos de control">${s.cps}</span><span class="cv-chip" aria-label="relojes">⏱ ${s.clocks}/${s.total}</span>`;
      if (c !== last.chips) { chips.innerHTML = c; last.chips = c; }
      const sp = Math.round(s.speed * 100);
      if (sp !== last.speed) { speedBar.style.width = sp + '%'; last.speed = sp; }
    },
    /** @param {string|null} key @param {string|null} label */
    prompt(key, label) {
      const h = label ? `${key ? `<kbd>${esc(key)}</kbd>` : ''}${esc(label)}` : '';
      if (h !== last.prompt) { prompt.innerHTML = h; prompt.hidden = !h; last.prompt = h; }
    },
    /** @param {{name:string, phase:string, gap:number, caps:number, maxCaps:number}|null} b */
    boss(b) {
      const h = b ? `<b>VIGÍA MAYOR · ${esc(b.phase)}</b><small>Distancia ${Math.round(b.gap)} m · Capturas ${b.caps}/${b.maxCaps}</small><div class="bar"><i style="width:${Math.round(Math.min(1, b.gap / 34) * 100)}%"></i></div>` : '';
      if (h !== last.boss) { bossEl.innerHTML = h; bossEl.hidden = !b; last.boss = h; }
    },
    /** @param {number} n @param {string} name */
    combo(n, name) {
      combo.innerHTML = `<b>×${n}</b><small>${esc(name)}</small>`; combo.classList.add('on');
      clearTimeout(comboT); comboT = window.setTimeout(() => combo.classList.remove('on'), 900);
    },
    /** @param {string} t */
    center(t) { if (t !== last.center) { center.textContent = t; last.center = t; } },
    /** @param {string} name @param {string} sub @param {number} [ms] */
    title(name, sub, ms = 2400) { title.innerHTML = `<small>${esc(sub)}</small><b>${esc(name)}</b>`; title.classList.add('on'); clearTimeout(titleT); titleT = window.setTimeout(() => title.classList.remove('on'), ms); },
    hideTitle() { title.classList.remove('on'); },
    flash() { flash.classList.add('on'); clearTimeout(flashT); flashT = window.setTimeout(() => flash.classList.remove('on'), 80); },
    /** @param {number} k 0..1 */
    speedFx(k) { speedfx.style.opacity = String(Math.round(k * 20) / 20); },
    /** @param {boolean} v */
    fade(v) { fade.classList.toggle('on', v); },
    /** @param {string|null} html @param {(a:string)=>void} [onAction] */
    tip(html, onAction) {
      tipHandler = onAction || null;
      if (!html) { tip.hidden = true; tip.innerHTML = ''; return; }
      tip.innerHTML = `<div class="k">TUTORIAL</div><div>${html}</div><div class="r"><button type="button" data-t="skip">Saltar tutorial</button><button type="button" class="pri" data-t="ok">Entendido</button></div>`;
      tip.hidden = false;
    },
    get tipVisible() { return !tip.hidden; },
  };
}
