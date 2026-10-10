// @ts-check
/* Reino del Alba — HUD y paneles DOM: estado, objetivo, minimapa, aviso de interacción (tocable), diálogos con
   opciones, textos, tutorial, diario, títulos, fundido y destello. Sólo escribe al DOM cuando algo cambia. */

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#0d0a07;overscroll-behavior:none}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.ra-hud{position:fixed;z-index:30;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,.7)}
.ra-hud[hidden],.ra-p[hidden]{display:none!important}
#ra-status{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:5px;max-width:min(240px,48vw)}
.ra-row{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
.ra-chip{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:999px;background:rgba(20,14,8,.74);border:1px solid rgba(242,181,68,.3);font:800 12px system-ui,sans-serif;white-space:nowrap;height:22px;box-sizing:border-box}
.ra-hearts{font:900 14px system-ui;letter-spacing:-1px}.ra-hearts i{font-style:normal;color:#ff5b4d}.ra-hearts i.off{color:rgba(255,255,255,.22)}
.ra-zone{font:700 11px system-ui;color:#f6dfaa;opacity:.95}
#ra-journal-btn{pointer-events:auto;cursor:pointer;border:1px solid rgba(242,181,68,.55);background:rgba(20,14,8,.8);color:#fff;border-radius:10px;font:800 12px system-ui;padding:0 10px;min-height:32px;min-width:44px}
#ra-map{width:112px;height:112px;border-radius:12px;border:1px solid rgba(242,181,68,.4);background:rgba(10,8,6,.6)}
#ra-side{top:max(52px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));width:min(300px,44vw);display:flex;flex-direction:column;gap:6px}
.ra-p{padding:7px 10px;border-radius:12px;background:rgba(20,14,8,.82);border:1px solid rgba(242,181,68,.35);font:600 12px/1.38 system-ui}
#ra-obj b{display:block;font:800 10px system-ui;letter-spacing:.18em;color:#f2b544;margin-bottom:2px}
#ra-obj small{display:block;color:#cdb98e;margin-top:2px;font-weight:700}
#ra-boss b{display:block;font:400 13px 'Bungee',system-ui,sans-serif;color:#ffd2c8}
#ra-boss small{display:block;font:700 11px system-ui;color:#ffc9c0;margin:2px 0 5px}
.ra-bar{height:8px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}.ra-bar i{display:block;height:100%;background:linear-gradient(90deg,#ff6a3d,#ffd27a)}
#ra-tip{pointer-events:auto;border-color:rgba(127,240,255,.55);background:rgba(8,22,28,.92);color:#dffcf8;font-size:13px}
#ra-tip .k{font:800 10px system-ui;letter-spacing:.22em;color:#7ff0ff;margin-bottom:3px}
#ra-tip .r{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
.ra-btn{appearance:none;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:6px 12px;font:700 13px system-ui;cursor:pointer;min-height:36px}
.ra-btn.pri{background:#f2b544;color:#1a1206;border-color:#f2b544}
#ra-prompt{pointer-events:auto;cursor:pointer;left:50%;transform:translateX(-50%);bottom:max(26px,env(safe-area-inset-bottom));padding:10px 18px;border-radius:999px;background:rgba(20,14,8,.9);
  border:1.5px solid #f2b544;font:800 14px system-ui,sans-serif;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;min-height:44px;box-sizing:border-box;display:flex;align-items:center}
#ra-prompt kbd{display:inline-block;min-width:20px;padding:1px 6px;margin-right:8px;border-radius:6px;background:#f2b544;color:#1a1206;font:900 12px system-ui;text-align:center}
body.ra-touch #ra-prompt{bottom:calc(190px + env(safe-area-inset-bottom))}
@media (orientation:landscape){body.ra-touch #ra-prompt{bottom:calc(110px + env(safe-area-inset-bottom));left:max(170px,calc(env(safe-area-inset-left) + 170px));transform:none;max-width:calc(100vw - 540px)}body.ra-touch .k3-btns{max-width:330px}}
#ra-bubble{left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));padding:6px 12px;border-radius:12px;background:rgba(250,240,220,.92);color:#2a1c0c;font:700 13px system-ui;text-shadow:none;opacity:0;transition:opacity .3s;max-width:80vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ra-bubble.on{opacity:1}
body.ra-touch #ra-bubble{bottom:calc(250px + env(safe-area-inset-bottom))}
@media (orientation:landscape){body.ra-touch #ra-bubble{bottom:166px}}
#ra-dialog{pointer-events:auto;left:50%;transform:translateX(-50%);bottom:max(18px,env(safe-area-inset-bottom));width:min(620px,calc(100vw - 24px));box-sizing:border-box;padding:12px 14px 10px;border-radius:16px;
  background:linear-gradient(180deg,rgba(52,36,18,.97),rgba(28,19,10,.97));border:1.5px solid rgba(242,181,68,.7);cursor:pointer;text-shadow:none}
#ra-dialog h3{margin:0 0 4px;font:400 15px 'Bungee',system-ui,sans-serif;color:#f2b544;display:flex;gap:8px;align-items:center}
#ra-dialog h3 small{font:700 11px system-ui;color:#cdb98e;letter-spacing:.06em}
#ra-dialog p{margin:0;font:500 15px/1.5 system-ui;color:#fbecd0;min-height:44px}
#ra-dialog .n{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font:700 11px system-ui;color:#cdb98e;gap:8px;flex-wrap:wrap}
#ra-dialog .c{display:flex;gap:8px;flex-wrap:wrap}
#ra-text{pointer-events:auto;left:50%;top:max(70px,env(safe-area-inset-top));transform:translateX(-50%);width:min(520px,calc(100vw - 24px));box-sizing:border-box;padding:12px 14px 10px;border-radius:14px;
  background:linear-gradient(180deg,rgba(48,34,18,.96),rgba(26,18,10,.96));border:1px solid rgba(242,181,68,.6);font:500 14px/1.5 system-ui;color:#fbecd0;text-shadow:none}
#ra-text h3{margin:0 0 4px;font:400 14px 'Bungee',system-ui,sans-serif;color:#f2b544;padding-right:36px}
#ra-text p{margin:0}
#ra-text button{position:absolute;top:6px;right:6px;width:36px;height:36px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.3);color:#fff;font:800 14px system-ui;cursor:pointer}
#ra-title{left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .6s;width:90vw}
#ra-title.on{opacity:1}
#ra-title small{display:block;font:800 12px system-ui;letter-spacing:.35em;color:#f2b544}
#ra-title b{display:block;font:400 clamp(24px,6vw,50px)/1.05 'Bungee',system-ui,sans-serif;text-shadow:0 4px 0 rgba(0,0,0,.4),0 0 30px rgba(242,181,68,.6)}
#ra-flash{inset:0;z-index:29;background:radial-gradient(120% 90% at 50% 50%,transparent 45%,rgba(255,40,30,.55));opacity:0;transition:opacity .35s}
#ra-flash.on{opacity:1;transition:none}
#ra-fade{inset:0;z-index:48;background:#050302;opacity:0;transition:opacity .22s}
#ra-fade.on{opacity:1}
.ra-menu-prog{font:700 12px system-ui;color:#e8d6b4;background:rgba(0,0,0,.28);border-radius:10px;padding:7px 10px;line-height:1.5}
.ra-dtab{font:600 12px/1.45 system-ui;color:#d9c9a8;max-width:48ch}
.ra-credit{margin-top:4px;font:800 11px system-ui;letter-spacing:.25em;color:#e8d6b4;display:flex;align-items:center;gap:6px;justify-content:center}
.ra-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(242,181,68,.6)}
.ra-back{font:700 12px system-ui;color:#cdb98e;text-decoration:underline;cursor:pointer}
.ra-j{width:100%;display:grid;gap:6px;text-align:left;max-height:56vh;overflow:auto;padding-right:4px}
.ra-j div{padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.06);font:600 13px/1.4 system-ui}
.ra-j div.main{border-left:4px solid #f2b544}.ra-j div.done{opacity:.6}.ra-j div.locked{opacity:.45}
.ra-j b{display:block}.ra-j small{color:#cdb98e}
.ra-inv{font:600 13px system-ui;color:#e8d6b4}
.ra-opts{display:grid;gap:8px;width:100%;text-align:left;font:600 14px system-ui}
.ra-opts label{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.ra-opts select{font:700 13px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;padding:6px 10px;min-height:34px}
.k3-panel h1{font-size:clamp(28px,7vw,56px)!important}
@media (max-width:560px){#ra-map{width:92px;height:92px}#ra-side{width:min(260px,46vw)}.ra-p{font-size:11px;padding:6px 8px}#ra-dialog p{font-size:14px}}
@media (max-height:480px){#ra-title b{font-size:26px}#ra-map{width:84px;height:84px}#ra-side{top:max(48px,env(safe-area-inset-top));width:min(280px,34vw)}.k3-panel h1{font-size:30px!important}.k3-panel{gap:7px!important}.k3-panel p{font-size:13px}.k3-b{padding:10px 16px!important}.ra-dtab{display:none}#ra-dialog{bottom:8px}#ra-dialog p{min-height:0}#ra-tip:not([hidden]) ~ #ra-obj small{display:none}}
@media (prefers-reduced-motion:reduce){#ra-title,#ra-fade,#ra-flash,#ra-bubble{transition:none!important}}
`;

const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, extra = '') => { const e = document.createElement('div'); e.id = id; e.className = 'ra-hud ' + extra; document.body.appendChild(e); return e; };
  const status = mk('ra-status'), side = mk('ra-side'), prompt = mk('ra-prompt'), title = mk('ra-title'), flash = mk('ra-flash'), fade = mk('ra-fade');
  const text = mk('ra-text'), dialog = mk('ra-dialog'), bubble = mk('ra-bubble');
  status.innerHTML = `<div class="ra-row" id="ra-hearts"></div><div class="ra-row" id="ra-chips"></div><div class="ra-zone" id="ra-zone"></div><div class="ra-row"><canvas id="ra-map" width="112" height="112" aria-label="Minimapa"></canvas><button type="button" id="ra-journal-btn" aria-label="Diario">📜</button></div>`;
  const hearts = /** @type {HTMLElement} */ (status.querySelector('#ra-hearts')), chips = /** @type {HTMLElement} */ (status.querySelector('#ra-chips')), zone = /** @type {HTMLElement} */ (status.querySelector('#ra-zone'));
  const map = /** @type {HTMLCanvasElement} */ (status.querySelector('#ra-map')), jbtn = /** @type {HTMLElement} */ (status.querySelector('#ra-journal-btn'));
  const boss = document.createElement('div'); boss.id = 'ra-boss'; boss.className = 'ra-p'; boss.hidden = true;
  const tip = document.createElement('div'); tip.id = 'ra-tip'; tip.className = 'ra-p'; tip.hidden = true;
  const obj = document.createElement('div'); obj.id = 'ra-obj'; obj.className = 'ra-p';
  side.append(boss, tip, obj);
  status.hidden = side.hidden = prompt.hidden = text.hidden = dialog.hidden = true;
  text.setAttribute('role', 'dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-live', 'polite');
  tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite'); prompt.setAttribute('role', 'button');
  for (const el of [tip, text, dialog, prompt, jbtn]) for (const t of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(t, e => e.stopPropagation());
  let last = { hearts: '', chips: '', zone: '', prompt: '', boss: '', obj: '' };
  let textT = 0, titleT = 0, flashT = 0, bubbleT = 0;
  /** @type {((a:string)=>void)|null} */ let tipHandler = null;
  /** @type {((i:number)=>void)|null} */ let dialogHandler = null;
  /** @type {(()=>void)|null} */ let promptHandler = null;
  tip.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-t]'); if (b && tipHandler) tipHandler(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.t)); });
  text.addEventListener('click', e => { if (/** @type {HTMLElement} */ (e.target).closest('button')) text.hidden = true; });
  dialog.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-c]'); if (dialogHandler) dialogHandler(b ? +(/** @type {HTMLElement} */ (b).dataset.c || 0) : -1); });
  // pointerup (no click): en táctil el click sintético a veces se pierde tras otros toques
  let pDown = -1;
  prompt.addEventListener('pointerdown', e => { pDown = e.pointerId; });
  prompt.addEventListener('pointerup', e => { if (e.pointerId === pDown && promptHandler) { pDown = -1; promptHandler(); } });

  return {
    els: { status, side, prompt, title, flash, fade, text, dialog, boss, tip, obj, map, jbtn, bubble },
    /** @param {boolean} v */
    show(v) { status.hidden = side.hidden = !v; if (!v) { prompt.hidden = true; text.hidden = true; last.prompt = ''; } },
    /** @param {{hp:number,maxHp:number,coins:number,potions:number,fame:number,zone:string,clock:string}} s */
    status(s) {
      let h = '<span class="ra-chip ra-hearts" aria-label="vida">';
      for (let i = 0; i < s.maxHp; i++) h += `<i class="${i < s.hp ? '' : 'off'}">♥</i>`;
      h += '</span>';
      if (h !== last.hearts) { hearts.innerHTML = h; last.hearts = h; }
      const c = `<span class="ra-chip" aria-label="monedas">🪙 ${s.coins}</span><span class="ra-chip" aria-label="pociones">🧪 ${s.potions}</span><span class="ra-chip" aria-label="fama">⭐ ${s.fame}</span>`;
      if (c !== last.chips) { chips.innerHTML = c; last.chips = c; }
      const z = `${esc(s.zone)} · ${s.clock}`;
      if (z !== last.zone) { zone.textContent = z; last.zone = z; }
    },
    /** @param {string|null} key @param {string|null} label @param {()=>void} [onTap] */
    prompt(key, label, onTap) {
      promptHandler = onTap || null;
      const h = label ? `${key ? `<kbd>${esc(key)}</kbd>` : '👆 '}${esc(label)}` : '';
      if (h !== last.prompt) { prompt.innerHTML = h; prompt.hidden = !h; last.prompt = h; }
    },
    /** @param {{name:string,label:string,frac:number}|null} b */
    boss(b) {
      const h = b ? `<b>${esc(b.name)}</b><small>${esc(b.label)}</small><div class="ra-bar"><i style="width:${Math.round(b.frac * 100)}%"></i></div>` : '';
      if (h !== last.boss) { boss.innerHTML = h; boss.hidden = !b; last.boss = h; }
    },
    /** @param {{title:string,text:string,where:string,main?:boolean}} o */
    objective(o) {
      const h = `<b>${o.main ? '★ ' : '◆ '}${esc(o.title.toUpperCase())}</b>${esc(o.text)}${o.where ? `<small>📍 ${esc(o.where)}</small>` : ''}`;
      if (h !== last.obj) { obj.innerHTML = h; last.obj = h; }
    },
    /** @param {string|null} html @param {(a:string)=>void} [onAction] */
    tip(html, onAction) {
      tipHandler = onAction || null;
      if (!html) { tip.hidden = true; tip.innerHTML = ''; return; }
      tip.innerHTML = `<div class="k">TUTORIAL</div><div>${html}</div><div class="r"><button type="button" class="ra-btn" data-t="skip">Saltar tutorial</button><button type="button" class="ra-btn pri" data-t="ok">Entendido</button></div>`;
      tip.hidden = false;
    },
    get tipVisible() { return !tip.hidden; },
    /** @param {string} name @param {string} sub */
    title(name, sub) { title.innerHTML = `<small>${esc(sub)}</small><b>${esc(name)}</b>`; title.classList.add('on'); clearTimeout(titleT); titleT = window.setTimeout(() => title.classList.remove('on'), 2400); },
    flash() { flash.classList.add('on'); clearTimeout(flashT); flashT = window.setTimeout(() => flash.classList.remove('on'), 60); },
    /** @param {boolean} v */
    fade(v) { fade.classList.toggle('on', v); },
    /** @param {string} t @param {string} html */
    text(t, html) {
      text.innerHTML = `<h3>${esc(t)}</h3><p>${html}</p><button type="button" aria-label="Cerrar">✕</button>`; text.hidden = false;
      clearTimeout(textT); textT = window.setTimeout(() => { text.hidden = true; }, 10000);
    },
    hideText() { text.hidden = true; },
    get textVisible() { return !text.hidden; },
    /**
     * @param {{name:string,role:string,icon:string,text:string,idx:number,total:number,choices:{label:string}[]|null,touch:boolean}|null} d
     * @param {(i:number)=>void} [onAct]
     */
    dialog(d, onAct) {
      dialogHandler = onAct || null;
      if (!d) { dialog.hidden = true; dialog.innerHTML = ''; return; }
      const lastLine = d.idx >= d.total - 1;
      const ch = lastLine && d.choices ? `<div class="c">${d.choices.map((c, i) => `<button type="button" class="ra-btn${i === 0 ? ' pri' : ''}" data-c="${i}">${esc(c.label)}</button>`).join('')}</div>` : '';
      dialog.innerHTML = `<h3>${d.icon} ${esc(d.name)} <small>${esc(d.role.toUpperCase())}</small></h3><p>${d.text}</p><div class="n">${ch || `<span>${d.idx + 1}/${d.total}</span><span>${d.touch ? 'Tocá para seguir ▶' : 'E / Espacio para seguir ▶'}</span>`}</div>`;
      dialog.hidden = false;
    },
    get dialogVisible() { return !dialog.hidden; },
    /** @param {string} t */
    bubble(t) { bubble.textContent = t; bubble.classList.add('on'); clearTimeout(bubbleT); bubbleT = window.setTimeout(() => bubble.classList.remove('on'), 1800); },
    /** @param {()=>void} fn */
    onJournal(fn) { jbtn.addEventListener('click', fn); },
  };
}

/** Minimapa: capa estática por escena (dibujada una vez) + capa dinámica a baja frecuencia. */
export function createMinimap(canvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
  const bctx = /** @type {CanvasRenderingContext2D} */ (base.getContext('2d'));
  let sc = 1, ox = 0, oz = 0;
  const W = canvas.width;
  const tx = x => (x - ox) * sc, tz = z => (z - oz) * sc;
  return {
    /** @param {any} scn */
    setScene(scn) {
      const b = scn.bounds, span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
      sc = (W - 8) / span; ox = (b.x0 + b.x1) / 2 - (W / 2) / sc; oz = (b.z0 + b.z1) / 2 - (W / 2) / sc;
      bctx.clearRect(0, 0, W, W);
      bctx.fillStyle = scn.kind === 'zone' ? 'rgba(70,90,50,.55)' : 'rgba(60,46,30,.6)'; bctx.fillRect(tx(b.x0), tz(b.z0), (b.x1 - b.x0) * sc, (b.z1 - b.z0) * sc);
      bctx.fillStyle = 'rgba(80,150,210,.85)'; for (const r of scn.map.water) bctx.fillRect(tx(r[0]), tz(r[1]), (r[2] - r[0]) * sc, (r[3] - r[1]) * sc);
      bctx.fillStyle = 'rgba(225,210,180,.85)'; for (const r of scn.map.rects) bctx.fillRect(tx(r[0]), tz(r[1]), Math.max(1, (r[2] - r[0]) * sc), Math.max(1, (r[3] - r[1]) * sc));
      for (const m of scn.map.marks) {
        if (m.kind === 'door') { bctx.fillStyle = '#f2b544'; bctx.fillRect(tx(m.x) - 2.5, tz(m.z) - 2.5, 5, 5); }
        if (m.kind === 'exit') { bctx.fillStyle = '#ffffff'; bctx.beginPath(); bctx.arc(tx(m.x), tz(m.z), 3, 0, 6.3); bctx.fill(); }
      }
    },
    /** @param {{x:number,z:number,ry:number}} p @param {{x:number,z:number,c:string}[]} dots */
    draw(p, dots) {
      ctx.clearRect(0, 0, W, W); ctx.drawImage(base, 0, 0);
      for (const d of dots) { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(tx(d.x), tz(d.z), d.r || 2.4, 0, 6.3); ctx.fill(); }
      const x = tx(p.x), z = tz(p.z), s = Math.sin(p.ry), c = Math.cos(p.ry);
      ctx.fillStyle = '#7ff0ff'; ctx.strokeStyle = '#03141a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + s * 6, z + c * 6); ctx.lineTo(x + c * 3.5 - s * 3, z - s * 3.5 - c * 3); ctx.lineTo(x - c * 3.5 - s * 3, z + s * 3.5 - c * 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    },
  };
}
