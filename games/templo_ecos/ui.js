// @ts-check
/* Templo de los Ecos — HUD y paneles DOM (sin tocar la UI compartida). Escrituras al DOM sólo cuando cambia algo. */

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#120d0a;overscroll-behavior:none}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.te-hud{position:fixed;z-index:30;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,.7)}
.te-hud[hidden]{display:none!important}
#te-status{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));display:flex;gap:8px;align-items:center;flex-wrap:wrap;
  max-width:calc(100vw - 190px);font:800 13px system-ui,sans-serif;height:32px;overflow:hidden}
.te-chip{display:flex;align-items:center;gap:3px;padding:4px 8px;border-radius:999px;background:rgba(14,10,6,.72);border:1px solid rgba(255,214,140,.25);height:24px;box-sizing:border-box;white-space:nowrap}
.te-heart{color:#ff5b4d}.te-heart.off{color:rgba(255,255,255,.22)}
.te-gem{color:#7ffff0}.te-gem.off{color:rgba(255,255,255,.2)}
.te-eco{color:#3fe8d6}.te-eco.cd{color:#557}
#te-side{top:max(48px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));width:min(320px,44vw);display:flex;flex-direction:column;gap:6px;align-items:stretch}
#te-boss{padding:7px 10px;border-radius:12px;background:rgba(30,6,14,.82);border:1px solid rgba(255,120,120,.45)}
#te-boss b{display:block;font:400 13px 'Bungee',system-ui,sans-serif;letter-spacing:.04em;color:#ffd2c8}
#te-boss small{display:block;font:700 11px system-ui;color:#ffc9c0;margin:2px 0 5px}
.te-bar{height:8px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}.te-bar i{display:block;height:100%;background:linear-gradient(90deg,#ff6a3d,#ffd27a);transition:width .2s}
#te-tip{pointer-events:auto;padding:9px 11px;border-radius:12px;background:rgba(8,26,28,.9);border:1px solid rgba(63,232,214,.55);font:600 13px/1.4 system-ui,sans-serif;color:#dffcf8}
#te-tip .te-tip-k{font:800 10px system-ui;letter-spacing:.22em;color:#3fe8d6;margin-bottom:3px}
#te-tip .te-tip-row{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
#te-tip button{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:6px 10px;font:700 12px system-ui;cursor:pointer;min-height:32px}
#te-tip button.pri{background:#3fe8d6;color:#062220;border-color:#3fe8d6}
#te-obj{padding:6px 10px;border-radius:10px;background:rgba(14,10,6,.6);font:700 12px/1.35 system-ui;color:#ffe9c2}
#te-obj:empty{display:none}
#te-prompt{left:50%;transform:translateX(-50%);bottom:max(28px,env(safe-area-inset-bottom));padding:9px 16px;border-radius:999px;background:rgba(14,10,6,.85);
  border:1.5px solid #f5b84a;font:800 14px system-ui,sans-serif;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis}
#te-prompt kbd{display:inline-block;min-width:20px;padding:1px 6px;margin-right:6px;border-radius:6px;background:#f5b84a;color:#1a1206;font:900 12px system-ui;text-align:center}
body.te-touch #te-prompt{bottom:calc(196px + env(safe-area-inset-bottom))}
@media (orientation:landscape){body.te-touch #te-prompt{bottom:max(18px,env(safe-area-inset-bottom));max-width:calc(100vw - 420px)}}
#te-title{left:50%;top:34%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .6s}
#te-title.on{opacity:1}
#te-title small{display:block;font:800 12px system-ui;letter-spacing:.35em;color:#f5b84a}
#te-title b{display:block;font:400 clamp(26px,6vw,52px)/1.05 'Bungee',system-ui,sans-serif;text-shadow:0 4px 0 rgba(0,0,0,.4),0 0 30px rgba(245,184,74,.6)}
#te-flash{inset:0;z-index:29;background:radial-gradient(120% 90% at 50% 50%,transparent 45%,rgba(255,40,30,.55));opacity:0;transition:opacity .35s}
#te-flash.on{opacity:1;transition:none}
#te-fade{inset:0;z-index:48;background:#050302;opacity:0;transition:opacity .35s}
#te-fade.on{opacity:1}
#te-text{pointer-events:auto;left:50%;bottom:max(90px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(520px,calc(100vw - 32px));padding:12px 14px 10px;border-radius:14px;
  background:linear-gradient(180deg,rgba(48,34,18,.95),rgba(26,18,10,.95));border:1px solid rgba(245,184,74,.6);font:500 14px/1.5 system-ui;color:#fbecd0;box-sizing:border-box}
#te-text h3{margin:0 0 4px;font:400 14px 'Bungee',system-ui,sans-serif;color:#f5b84a;letter-spacing:.03em}
#te-text p{margin:0}
#te-text button{position:absolute;top:6px;right:6px;width:34px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.3);color:#fff;font:800 14px system-ui;cursor:pointer}
body.te-touch #te-text{bottom:auto;top:max(160px,env(safe-area-inset-top))}
#te-note{left:50%;top:22%;transform:translate(-50%,0);font:900 46px system-ui;opacity:0;transition:opacity .5s;text-align:center}
#te-note.on{opacity:1;transition:none}
#te-note small{display:block;font:800 12px system-ui;letter-spacing:.2em}
.te-menu-prog{font:700 12px system-ui;color:#e8d6b4;background:rgba(0,0,0,.28);border-radius:10px;padding:7px 10px;line-height:1.5}
.te-dtab{font:600 12px/1.45 system-ui;color:#d9c9a8;max-width:46ch}
.te-credit{margin-top:4px;font:800 11px system-ui;letter-spacing:.25em;color:#e8d6b4;display:flex;align-items:center;gap:6px;justify-content:center}
.te-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(245,184,74,.6)}
.te-opts{display:grid;gap:8px;width:100%;text-align:left;font:600 14px system-ui}
.te-opts label,.te-bind{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.te-opts input[type=range]{width:140px}
.te-opts select,.te-bind button{font:700 13px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;padding:6px 10px;min-height:34px}
.te-bind button.wait{background:#f5b84a;color:#1a1206}
.te-small{font:600 12px/1.45 system-ui;color:#cdbb98}
.k3-panel h1{font-size:clamp(28px,7vw,56px)!important}
@media (max-height:480px){#te-tip:not([hidden]) ~ #te-obj{display:none}.k3-panel h1{font-size:30px!important}.k3-panel{gap:7px!important}.k3-panel p{font-size:13px}.k3-b{padding:10px 16px!important}.te-dtab{display:none}}
@media (prefers-reduced-motion:reduce){#te-title,#te-fade,#te-flash,#te-note{transition:none!important}}
`;

/** @param {string} s */
const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, extra = '') => { const e = document.createElement('div'); e.id = id; e.className = 'te-hud ' + extra; document.body.appendChild(e); return e; };
  const status = mk('te-status'), side = mk('te-side'), prompt = mk('te-prompt'), title = mk('te-title'), flash = mk('te-flash'), fade = mk('te-fade'), text = mk('te-text'), note = mk('te-note');
  const boss = document.createElement('div'); boss.id = 'te-boss'; boss.hidden = true;
  const tip = document.createElement('div'); tip.id = 'te-tip'; tip.hidden = true;
  const obj = document.createElement('div'); obj.id = 'te-obj';
  side.append(boss, tip, obj);
  status.hidden = side.hidden = prompt.hidden = text.hidden = true;
  text.setAttribute('role', 'dialog');
  tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) { tip.addEventListener(t, e => e.stopPropagation()); text.addEventListener(t, e => e.stopPropagation()); }
  let last = { status: '', prompt: '', boss: '', obj: '' };
  let textT = 0, titleT = 0, noteT = 0, flashT = 0;
  /** @type {((a:string)=>void)|null} */ let tipHandler = null;
  tip.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-t]'); if (b && tipHandler) tipHandler(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.t)); });
  text.addEventListener('click', e => { if (/** @type {HTMLElement} */ (e.target).closest('button')) { text.hidden = true; } });

  return {
    els: { status, side, prompt, title, flash, fade, text, note, boss, tip, obj },
    /** @param {boolean} v */
    show(v) { status.hidden = side.hidden = !v; if (!v) { prompt.hidden = true; text.hidden = true; } },
    /** @param {{hp:number,maxHp:number,flames:number,integrity:number|null,score:number,eco:number|null,ecoKey:string}} s */
    status(s) {
      let h = '<span class="te-chip" aria-label="vida">';
      for (let i = 0; i < s.maxHp; i++) h += `<span class="te-heart${i < s.hp ? '' : ' off'}">♥</span>`;
      h += `</span><span class="te-chip" aria-label="llamas">🔥${s.flames}</span>`;
      if (s.integrity !== null) { h += '<span class="te-chip" aria-label="reliquia">'; for (let i = 0; i < 3; i++) h += `<span class="te-gem${i < s.integrity ? '' : ' off'}">◆</span>`; h += '</span>'; }
      if (s.eco !== null) h += `<span class="te-chip te-eco${s.eco < 1 ? ' cd' : ''}" aria-label="eco">◎ ${esc(s.ecoKey)}</span>`;
      h += `<span class="te-chip" aria-label="puntos">${s.score}</span>`;
      if (h !== last.status) { status.innerHTML = h; last.status = h; }
    },
    /** @param {string|null} key @param {string|null} label */
    prompt(key, label) {
      const h = label ? `${key ? `<kbd>${esc(key)}</kbd>` : ''}${esc(label)}` : '';
      if (h !== last.prompt) { prompt.innerHTML = h; prompt.hidden = !h; last.prompt = h; }
    },
    /** @param {{label:string, frac:number}|null} b */
    boss(b) {
      const h = b ? `<b>GUARDIÁN ECO</b><small>${esc(b.label)}</small><div class="te-bar"><i style="width:${Math.round(b.frac * 100)}%"></i></div>` : '';
      if (h !== last.boss) { boss.innerHTML = h; boss.hidden = !b; last.boss = h; }
    },
    /** @param {string} s */
    objective(s) { if (s !== last.obj) { obj.textContent = s; last.obj = s; } },
    /** @param {string|null} html @param {(a:string)=>void} [onAction] */
    tip(html, onAction) {
      tipHandler = onAction || null;
      if (!html) { tip.hidden = true; tip.innerHTML = ''; return; }
      tip.innerHTML = `<div class="te-tip-k">TUTORIAL</div><div>${html}</div><div class="te-tip-row"><button type="button" data-t="skip">Saltar tutorial</button><button type="button" class="pri" data-t="ok">Entendido</button></div>`;
      tip.hidden = false;
    },
    get tipVisible() { return !tip.hidden; },
    /** @param {string} name @param {string} sub */
    title(name, sub) { title.innerHTML = `<small>${esc(sub)}</small><b>${esc(name)}</b>`; title.classList.add('on'); clearTimeout(titleT); titleT = window.setTimeout(() => title.classList.remove('on'), 2600); },
    flash() { flash.classList.add('on'); clearTimeout(flashT); flashT = window.setTimeout(() => flash.classList.remove('on'), 60); },
    /** @param {boolean} v */
    fade(v) { fade.classList.toggle('on', v); },
    /** @param {string} t @param {string} html */
    text(t, html) {
      text.innerHTML = `<h3>${esc(t)}</h3><p>${html}</p><button type="button" aria-label="Cerrar">✕</button>`; text.hidden = false;
      clearTimeout(textT); textT = window.setTimeout(() => { text.hidden = true; }, 9000);
    },
    hideText() { text.hidden = true; },
    /** @param {string} glyph @param {number} color @param {string} name */
    note(glyph, color, name) {
      const c = '#' + color.toString(16).padStart(6, '0');
      note.innerHTML = `<span style="color:${c}">${glyph}</span><small style="color:${c}">${esc(name.toUpperCase())}</small>`;
      note.classList.add('on'); clearTimeout(noteT); noteT = window.setTimeout(() => note.classList.remove('on'), 420);
    },
  };
}
