// @ts-check
/* Portales Imposibles — HUD y paneles DOM. Escribe al DOM sólo cuando cambia algo. */

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#0c1520;overscroll-behavior:none}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.pi-hud{position:fixed;z-index:30;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,.7)}
.pi-hud[hidden]{display:none!important}
#pi-cross{left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px}
#pi-cross i{position:absolute;inset:0;border-radius:50%;border:3px solid transparent}
#pi-cross .a{border-left-color:rgba(53,182,255,.35);transform:rotate(45deg)}
#pi-cross .b{border-right-color:rgba(255,138,36,.35);transform:rotate(45deg)}
#pi-cross .a.on{border-left-color:#35b6ff;filter:drop-shadow(0 0 4px #35b6ff)}
#pi-cross .b.on{border-right-color:#ff8a24;filter:drop-shadow(0 0 4px #ff8a24)}
#pi-cross b{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%;background:#fff;box-shadow:0 0 4px #000}
#pi-cross.hot b{width:8px;height:8px;margin:-4px;background:#9b7bff}
#pi-side{top:max(48px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));width:min(300px,44vw);display:flex;flex-direction:column;gap:6px;align-items:stretch}
#pi-status{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;font:800 12px system-ui,sans-serif}
.pi-chip{display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:999px;background:rgba(8,12,22,.75);border:1px solid rgba(155,123,255,.3);height:22px;box-sizing:border-box;white-space:nowrap}
.pi-hp{color:#ff5b6b}.pi-hp.off{color:rgba(255,255,255,.2)}
#pi-room{pointer-events:auto;padding:6px 8px 6px 10px;border-radius:12px;background:rgba(8,12,22,.78);border:1px solid rgba(155,123,255,.35);display:flex;align-items:center;gap:6px;font:700 12px/1.25 system-ui}
#pi-room .t{flex:1;min-width:0}
#pi-room .t b{display:block;font:400 12px 'Bungee',system-ui,sans-serif;letter-spacing:.03em;color:#e2d8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pi-room .t small{display:block;color:#b9c6dd;font-variant-numeric:tabular-nums;white-space:nowrap}
#pi-room .t small.late{color:#ffb38a}
#pi-room button{appearance:none;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.07);color:#fff;border-radius:9px;min-width:36px;height:34px;font:800 14px system-ui;cursor:pointer;padding:0 6px}
#pi-room button:active{transform:scale(.94)}
#pi-boss{padding:7px 10px;border-radius:12px;background:rgba(24,8,34,.85);border:1px solid rgba(255,122,224,.5)}
#pi-boss b{display:block;font:400 13px 'Bungee',system-ui,sans-serif;letter-spacing:.04em;color:#ffd6f6}
#pi-boss small{display:block;font:700 11px/1.3 system-ui;color:#f6c9ec;margin:2px 0 5px}
.pi-bar{height:8px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}.pi-bar i{display:block;height:100%;background:linear-gradient(90deg,#9b7bff,#ff7ae0);transition:width .2s}
.pi-card{pointer-events:auto;padding:9px 11px;border-radius:12px;background:rgba(10,10,30,.9);border:1px solid rgba(155,123,255,.6);font:600 13px/1.4 system-ui,sans-serif;color:#e8e2ff}
.pi-card .k{font:800 10px system-ui;letter-spacing:.22em;color:#b9a4ff;margin-bottom:3px}
.pi-card .row{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
.pi-card button{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:6px 10px;font:700 12px system-ui;cursor:pointer;min-height:32px}
.pi-card button.pri{background:#9b7bff;color:#120a2a;border-color:#9b7bff}
#pi-hint{border-color:rgba(255,214,102,.7);background:rgba(28,22,8,.9);color:#fff3cf}
#pi-hint .k{color:#ffd666}
#pi-obj{padding:6px 10px;border-radius:10px;background:rgba(8,12,22,.6);font:700 12px/1.35 system-ui;color:#d9e6ff}
#pi-obj:empty{display:none}
#pi-prompt{left:50%;transform:translateX(-50%);top:calc(50% + 34px);padding:7px 14px;border-radius:999px;background:rgba(8,12,22,.82);border:1.5px solid #9b7bff;font:800 13px system-ui,sans-serif;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis}
#pi-prompt kbd{display:inline-block;min-width:18px;padding:1px 6px;margin-right:6px;border-radius:6px;background:#9b7bff;color:#120a2a;font:900 12px system-ui;text-align:center}
#pi-title{left:50%;top:38%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .6s;width:min(92vw,700px)}
#pi-title.on{opacity:1}
#pi-title small{display:block;font:800 12px system-ui;letter-spacing:.35em;color:#b9a4ff}
#pi-title b{display:block;font:400 clamp(24px,6vw,50px)/1.05 'Bungee',system-ui,sans-serif;text-shadow:0 4px 0 rgba(0,0,0,.4),0 0 30px rgba(155,123,255,.7)}
#pi-flash{inset:0;z-index:29;background:radial-gradient(120% 90% at 50% 50%,transparent 45%,rgba(255,40,60,.55));opacity:0;transition:opacity .35s}
#pi-flash.on{opacity:1;transition:none}
#pi-fade{inset:0;z-index:48;background:#04040a;opacity:0;transition:opacity .35s}
#pi-fade.on{opacity:1}
body.pi-touch .k3-btn[aria-label="a"]{background:rgba(53,182,255,.38);border-color:#35b6ff}
body.pi-touch .k3-btn[aria-label="b"]{background:rgba(255,138,36,.38);border-color:#ff8a24}
body.pi-touch .k3-btn{width:66px;height:66px;font-size:11px}
body.pi-touch #pi-prompt{top:auto;bottom:calc(178px + env(safe-area-inset-bottom))}
@media (orientation:landscape){body.pi-touch #pi-prompt{bottom:max(14px,env(safe-area-inset-bottom));max-width:calc(100vw - 440px)}}
@media (max-height:480px){#pi-side{width:min(270px,36vw);gap:4px}.pi-card{font-size:12px;padding:6px 9px}#pi-obj{display:none}
  #pi-tip,#pi-hint{position:fixed;left:50%;transform:translateX(-50%);top:max(8px,env(safe-area-inset-top));width:min(340px,36vw);box-sizing:border-box}
  #pi-hint:not([hidden]) ~ #pi-tip{display:none}}
.pi-menu-prog{font:700 12px system-ui;color:#d9d2ff;background:rgba(0,0,0,.28);border-radius:10px;padding:7px 10px;line-height:1.5}
.pi-dtab{font:600 12px/1.45 system-ui;color:#c9c2e8;max-width:46ch}
.pi-credit{margin-top:4px;font:800 11px system-ui;letter-spacing:.25em;color:#d9d2ff;display:flex;align-items:center;gap:6px;justify-content:center}
.pi-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(155,123,255,.7)}
.pi-opts{display:grid;gap:7px;width:100%;text-align:left;font:600 14px system-ui}
.pi-opts label,.pi-bind{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.pi-opts input[type=range]{width:130px}
.pi-opts select,.pi-bind button{font:700 13px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;padding:6px 10px;min-height:34px}
.pi-small{font:600 12px/1.45 system-ui;color:#c2bce0}
.k3-b[disabled]{opacity:.4;cursor:not-allowed}
.pi-tt{display:grid;gap:6px;width:100%}
.pi-tt button{display:flex;justify-content:space-between;gap:8px;align-items:center;text-align:left}
.pi-tt button small{font:700 11px system-ui;opacity:.8}
.k3-panel h1{font-size:clamp(28px,7vw,56px)!important}
@media (max-height:480px){.k3-panel h1{font-size:30px!important}.k3-panel{gap:7px!important}.k3-panel p{font-size:13px}.k3-b{padding:10px 16px!important}.pi-dtab{display:none}}
`;

export function createUI() {
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  const mk = (id, html = '', cls = 'pi-hud') => { const e = document.createElement('div'); e.id = id; e.className = cls; e.innerHTML = html; e.hidden = true; document.body.appendChild(e); return e; };
  const els = {
    cross: mk('pi-cross', '<i class="a"></i><i class="b"></i><b></b>'),
    side: mk('pi-side', `<div id="pi-status"></div>
      <div id="pi-room"><div class="t"><b></b><small></small></div><button type="button" data-ui="hint" aria-label="Pedir pista" title="Pista (H)">💡</button><button type="button" data-ui="reset" aria-label="Reiniciar sala" title="Reiniciar sala (R)">↺</button></div>
      <div id="pi-boss" hidden><b></b><small></small><div class="pi-bar"><i></i></div></div>
      <div id="pi-hint" class="pi-card" hidden></div>
      <div id="pi-tip" class="pi-card" hidden></div>
      <div id="pi-obj"></div>`),
    prompt: mk('pi-prompt'),
    title: mk('pi-title'),
    flash: mk('pi-flash'),
    fade: mk('pi-fade'),
  };
  els.title.hidden = false; els.flash.hidden = false; els.fade.hidden = false;
  const q = sel => /** @type {HTMLElement} */ (document.querySelector(sel));
  const st = q('#pi-status'), roomB = q('#pi-room .t b'), roomS = q('#pi-room .t small'), boss = q('#pi-boss'), tipEl = q('#pi-tip'), hintEl = q('#pi-hint'), obj = q('#pi-obj');
  const bossB = q('#pi-boss b'), bossS = q('#pi-boss small'), bossI = q('#pi-boss i');
  const crossA = q('#pi-cross .a'), crossB = q('#pi-cross .b');
  // los toques sobre el HUD no llegan al juego
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) els.side.addEventListener(t, e => e.stopPropagation());
  const handlers = /** @type {Record<string, ()=>void>} */ ({});
  els.side.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-ui]'); if (b) { const fn = handlers[/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.ui)]; fn && fn(); } });
  let last = { st: '', room: '', roomS: '', boss: '', prompt: '', obj: '', cross: '' };
  let tipCb = /** @type {any} */ (null), titleT = 0;
  tipEl.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-t]'); if (b && tipCb) tipCb(/** @type {HTMLElement} */ (b).dataset.t); });
  hintEl.addEventListener('click', e => { if (/** @type {HTMLElement} */ (e.target).closest('[data-h]')) hintEl.hidden = true; });
  return {
    els,
    on(name, fn) { handlers[name] = fn; },
    show(v) { els.cross.hidden = !v; els.side.hidden = !v; if (!v) { els.prompt.hidden = true; } },
    status(o) {
      const hp = Array.from({ length: o.maxHp }, (_, i) => `<span class="pi-hp${i < o.hp ? '' : ' off'}">♥</span>`).join('');
      const h = `<span class="pi-chip" title="Vida">${hp}</span><span class="pi-chip" title="Respaldos">🧬 ${o.lives}</span><span class="pi-chip" title="Cristales">💎 ${o.crystals}/${o.total}</span>${o.score !== undefined ? `<span class="pi-chip" title="Puntos">★ ${o.score}</span>` : ''}`;
      if (h !== last.st) { st.innerHTML = h; last.st = h; }
    },
    room(name, sub, late) {
      if (name !== last.room) { roomB.textContent = name; last.room = name; }
      const k = sub + (late ? '!' : '');
      if (k !== last.roomS) { roomS.textContent = sub; roomS.classList.toggle('late', !!late); last.roomS = k; }
    },
    cross(a, b, hot) {
      const k = `${a}${b}${hot}`; if (k === last.cross) return; last.cross = k;
      crossA.classList.toggle('on', !!a); crossB.classList.toggle('on', !!b); els.cross.classList.toggle('hot', !!hot);
    },
    prompt(key, label) {
      const k = label ? `${key}|${label}` : '';
      if (k === last.prompt) return; last.prompt = k;
      if (!label) { els.prompt.hidden = true; return; }
      els.prompt.innerHTML = `${key ? `<kbd>${key}</kbd>` : ''}${label}`; els.prompt.hidden = false;
    },
    boss(b) {
      if (!b) { if (last.boss) { boss.hidden = true; last.boss = ''; } return; }
      const k = `${b.name}|${b.label}|${Math.round(b.p * 100)}`;
      if (k === last.boss) return; last.boss = k;
      boss.hidden = false; bossB.textContent = b.name; bossS.textContent = b.label; bossI.style.width = Math.round(Math.max(0, Math.min(1, b.p)) * 100) + '%';
    },
    objective(t) { if (t !== last.obj) { obj.textContent = t; last.obj = t; } },
    tip(html, cb) {
      tipCb = cb || null;
      if (!html) { tipEl.hidden = true; return; }
      tipEl.innerHTML = `<div class="k">TUTORIAL</div><div>${html}</div><div class="row"><button type="button" data-t="skip">Saltar tutorial</button><button type="button" class="pri" data-t="ok">Entendido</button></div>`;
      tipEl.hidden = false;
    },
    hint(text, stage) {
      if (!text) { hintEl.hidden = true; return; }
      hintEl.innerHTML = `<div class="k">PISTA ${stage}/3</div><div>${text}</div><div class="row"><button type="button" data-h="x">Cerrar</button></div>`;
      hintEl.hidden = false;
    },
    title(big, small, ms = 2200) {
      els.title.innerHTML = `<small>${small || ''}</small><b>${big}</b>`; els.title.classList.add('on');
      clearTimeout(titleT); titleT = window.setTimeout(() => els.title.classList.remove('on'), ms);
    },
    flash() { els.flash.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => els.flash.classList.remove('on'))); },
    fade(on) { els.fade.classList.toggle('on', !!on); },
  };
}
