// @ts-check
/* Derby de Chatarra — HUD DOM: vida + diagrama de daño por zonas, nitro, ranura de potenciador, misiones,
   reloj de ronda, tabla de posiciones, barra del jefe, consejos y textos grandes. Escribe al DOM sólo si algo cambió. */

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#14110e;overscroll-behavior:none}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.dc-hud{position:fixed;z-index:30;pointer-events:none;text-shadow:0 2px 5px rgba(0,0,0,.7)}
.dc-hud[hidden]{display:none!important}
#dc-status{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));width:196px;padding:7px 8px;border-radius:12px;box-sizing:border-box;
  background:linear-gradient(180deg,rgba(20,18,14,.82),rgba(12,10,8,.72));border:1px solid rgba(184,245,42,.28);font:800 12px system-ui,sans-serif}
.dc-top{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.dc-name{font:400 12px 'Bungee',system-ui,sans-serif;letter-spacing:.03em;color:#b8f52a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-spd{font-variant-numeric:tabular-nums;color:#ffe9b0;white-space:nowrap}
.dc-hp{position:relative;height:13px;margin:5px 0 6px;border-radius:7px;background:rgba(255,255,255,.12);overflow:hidden}
.dc-hp i{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#ff4a2a,#ffd23a 45%,#7ee35a);transition:width .15s}
.dc-hp b{position:absolute;right:6px;top:-1px;font:900 11px system-ui;color:#fff}
.dc-row{display:flex;gap:8px;align-items:center}
.dc-diag{width:30px;height:48px;flex:none}
.dc-col{flex:1;display:flex;flex-direction:column;gap:5px;min-width:0}
.dc-lbl{font:800 9px system-ui;letter-spacing:.18em;opacity:.75}
.dc-nitro{height:8px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden}
.dc-nitro i{display:block;height:100%;background:linear-gradient(90deg,#ff7a1a,#ffd23a)}
.dc-nitro.on i{background:linear-gradient(90deg,#ffd23a,#fff)}
.dc-slot{width:40px;height:40px;flex:none;border-radius:10px;border:1.5px dashed rgba(255,255,255,.3);display:grid;place-items:center;font-size:20px;position:relative;background:rgba(0,0,0,.25)}
.dc-slot.full{border:1.5px solid #b8f52a;background:rgba(184,245,42,.15)}
.dc-slot small{position:absolute;bottom:-4px;right:-4px;font:900 9px system-ui;background:#b8f52a;color:#12160a;border-radius:5px;padding:1px 4px;text-shadow:none}
.dc-fx{display:flex;gap:4px;font-size:11px;min-height:14px}
#dc-mis{top:calc(max(8px,env(safe-area-inset-top)) + 112px);left:max(8px,env(safe-area-inset-left));width:196px;display:flex;flex-direction:column;gap:3px}
.dc-m{display:flex;gap:5px;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(8,8,6,.7);border:1px solid rgba(255,255,255,.12);font:700 10.5px/1.3 system-ui}
.dc-m.p{border-color:rgba(255,210,58,.5)}.dc-m.done{background:rgba(30,90,30,.75);border-color:#7ee35a}.dc-m.failed{opacity:.45;text-decoration:line-through}
.dc-m .t{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dc-m .n{opacity:.85;font-variant-numeric:tabular-nums}
#dc-side{top:max(48px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));width:min(196px,44vw);display:flex;flex-direction:column;gap:5px}
#dc-timer{padding:5px 9px;border-radius:12px;background:rgba(14,12,8,.8);border:1px solid rgba(255,255,255,.18);display:flex;justify-content:space-between;align-items:center;gap:6px}
#dc-timer small{font:800 9px system-ui;letter-spacing:.16em;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#dc-timer b{font:400 18px 'Bungee',system-ui,sans-serif;font-variant-numeric:tabular-nums}
#dc-timer.warn b{color:#ff6a4a}
#dc-board{display:flex;flex-direction:column;gap:2px}
.dc-b{display:flex;align-items:center;gap:5px;padding:2px 7px;border-radius:8px;background:rgba(10,8,6,.66);font:700 11px system-ui;white-space:nowrap}
.dc-b .d{width:8px;height:8px;border-radius:50%;flex:none}.dc-b .nm{flex:1;overflow:hidden;text-overflow:ellipsis}.dc-b .pt{font-variant-numeric:tabular-nums;opacity:.9}
.dc-b.me{background:rgba(184,245,42,.22);border:1px solid rgba(184,245,42,.6)}.dc-b.out{opacity:.5}.dc-b.out .nm{text-decoration:line-through}
#dc-boss{padding:6px 9px;border-radius:12px;background:rgba(40,8,8,.85);border:1px solid rgba(255,90,60,.6)}
#dc-boss b{display:block;font:400 12px 'Bungee',system-ui,sans-serif;color:#ffd2c8}
#dc-boss small{display:block;font:800 9px system-ui;letter-spacing:.14em;color:#ffb0a0;margin:2px 0 4px}
.dc-bar{height:9px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}.dc-bar i{display:block;height:100%;background:linear-gradient(90deg,#ff3a2a,#ffb020);transition:width .2s}
#dc-tip{pointer-events:auto;left:50%;transform:translateX(-50%);top:max(10px,env(safe-area-inset-top));width:min(420px,calc(100vw - 440px));min-width:240px;box-sizing:border-box;padding:9px 11px;border-radius:12px;
  background:rgba(16,22,8,.92);border:1px solid rgba(184,245,42,.6);font:600 13px/1.4 system-ui,sans-serif;color:#effcd8}
#dc-tip .k{font:800 10px system-ui;letter-spacing:.22em;color:#b8f52a;margin-bottom:3px}
#dc-tip .r{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
#dc-tip button{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:6px 10px;font:700 12px system-ui;cursor:pointer;min-height:32px}
#dc-tip button.pri{background:#b8f52a;color:#12160a;border-color:#b8f52a}
@media (max-width:760px){#dc-tip{width:calc(100vw - 24px);top:auto;bottom:calc(200px + env(safe-area-inset-bottom))}}
@media (max-width:760px) and (max-height:500px){#dc-tip{width:min(380px,calc(100vw - 440px));bottom:auto;top:8px}}
@media (min-width:761px) and (max-height:500px){#dc-tip{width:min(380px,calc(100vw - 440px));top:8px}}
#dc-big{left:50%;top:36%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .25s;white-space:nowrap}
#dc-big.on{opacity:1;transition:none}
#dc-big b{display:block;font:400 clamp(30px,8vw,72px)/1 'Bungee',system-ui,sans-serif;color:#fff;text-shadow:0 4px 0 rgba(0,0,0,.45),0 0 26px rgba(184,245,42,.7)}
#dc-big small{display:block;margin-top:6px;font:800 13px system-ui;letter-spacing:.25em;color:#b8f52a}
#dc-flash{inset:0;z-index:29;background:radial-gradient(120% 90% at 50% 50%,transparent 45%,rgba(255,40,20,.55));opacity:0;transition:opacity .35s}
#dc-flash.on{opacity:1;transition:none}
#dc-fade{inset:0;z-index:48;background:#050403;opacity:0;transition:opacity .35s}
#dc-fade.on{opacity:1}
body.dc-touch #dc-mis .dc-m:not(.p){display:none}
@media (max-height:500px){#dc-mis{display:none}}
.dc-menu-prog{font:700 12px system-ui;color:#e8e2c8;background:rgba(0,0,0,.3);border-radius:10px;padding:7px 10px;line-height:1.5}
.dc-dtab{font:600 11.5px/1.45 system-ui;color:#d8d2b8;max-width:52ch}
.dc-credit{margin-top:2px;font:800 11px system-ui;letter-spacing:.25em;color:#e8e2c8;display:flex;align-items:center;gap:6px;justify-content:center}
.dc-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(184,245,42,.6)}
.dc-garage{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;width:100%}
.dc-car{appearance:none;border:1.5px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);color:#fff;border-radius:12px;padding:6px 5px;cursor:pointer;text-align:left;font:700 11px system-ui;display:flex;flex-direction:column;gap:3px;min-width:0}
.dc-car[aria-checked=true]{border-color:#b8f52a;background:rgba(184,245,42,.16)}
.dc-car[disabled]{opacity:.45;cursor:not-allowed}
.dc-car b{font:400 11px 'Bungee',system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-car i{display:block;height:4px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}.dc-car i::after{content:'';display:block;height:100%;width:var(--v);background:#b8f52a}
.dc-car span{font:600 9.5px system-ui;opacity:.75;display:flex;justify-content:space-between}
.dc-cardesc{font:600 12px system-ui;color:#d8eab8;min-height:16px}
.dc-opts{display:grid;gap:7px;width:100%;text-align:left;font:600 14px system-ui}
.dc-opts label,.dc-bind{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.dc-opts input[type=range]{width:130px}
.dc-opts select,.dc-bind button{font:700 13px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;padding:6px 10px;min-height:34px}
.dc-small{font:600 12px/1.45 system-ui;color:#cfc8ac}
.dc-table{width:100%;border-collapse:collapse;font:700 13px system-ui;text-align:left}
.dc-table td,.dc-table th{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.1)}
.dc-table th{font:800 10px system-ui;letter-spacing:.15em;opacity:.7}
.dc-table tr.me{background:rgba(184,245,42,.16)}
.dc-table td.n{text-align:right;font-variant-numeric:tabular-nums}
.k3-panel h1{font-size:clamp(28px,7vw,56px)!important}
.k3-touch .k3-joy{width:142px;height:142px;border:6px solid rgba(255,255,255,.28);background:radial-gradient(circle,transparent 52%,rgba(255,255,255,.07) 53%)}
.k3-touch .k3-joy::before{content:'VOLANTE';position:absolute;left:0;right:0;top:-18px;text-align:center;font:800 10px system-ui;letter-spacing:.2em;color:rgba(255,255,255,.6)}
.k3-touch .k3-joy i{background:rgba(184,245,42,.45)}
.k3-touch .k3-btn[aria-label=gas]{background:rgba(60,140,30,.6)}.k3-touch .k3-btn[aria-label=brake]{background:rgba(150,40,30,.6)}
.k3-touch .k3-btn[aria-label=nitro]{background:rgba(200,110,20,.55)}.k3-touch .k3-btn[aria-label=power]{background:rgba(40,90,160,.55)}
@media (max-height:480px){.k3-panel h1{font-size:28px!important}.k3-panel{gap:6px!important}.k3-panel p{font-size:12.5px}.k3-b{padding:9px 14px!important}.dc-dtab{display:none}}
@media (prefers-reduced-motion:reduce){#dc-big,#dc-fade,#dc-flash{transition:none!important}}
`;

const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const zoneColor = v => v < 0.25 ? '#6fe35a' : v < 0.5 ? '#c8e33a' : v < 0.75 ? '#ffb020' : '#ff3b2a';

export function createUI() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, extra = '') => { const e = document.createElement('div'); e.id = id; e.className = 'dc-hud ' + extra; document.body.appendChild(e); return e; };
  const status = mk('dc-status'), mis = mk('dc-mis'), side = mk('dc-side'), tip = mk('dc-tip'), big = mk('dc-big'), flash = mk('dc-flash'), fade = mk('dc-fade');
  status.innerHTML = `<div class="dc-top"><span class="dc-name"></span><span class="dc-spd"></span></div>
    <div class="dc-hp" role="meter" aria-label="Vida del vehículo"><i></i><b></b></div>
    <div class="dc-row">
      <svg class="dc-diag" viewBox="0 0 40 64" aria-hidden="true"><rect x="5" y="3" width="30" height="58" rx="9" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
        <rect data-z="f" x="9" y="6" width="22" height="11" rx="4"/><rect data-z="b" x="9" y="47" width="22" height="11" rx="4"/>
        <rect data-z="l" x="8" y="20" width="7" height="24" rx="3"/><rect data-z="r" x="25" y="20" width="7" height="24" rx="3"/>
        <rect x="16" y="22" width="8" height="12" rx="2" fill="rgba(140,200,255,.35)"/></svg>
      <div class="dc-col"><div class="dc-lbl">NITRO</div><div class="dc-nitro"><i></i></div><div class="dc-fx"></div></div>
      <div class="dc-slot" aria-label="Potenciador"></div>
    </div>`;
  side.innerHTML = `<div id="dc-timer"><small></small><b></b></div><div id="dc-board"></div><div id="dc-boss" hidden><b></b><small></small><div class="dc-bar"><i></i></div></div>`;
  big.innerHTML = '<b></b><small></small>';
  const q = (el, s) => /** @type {HTMLElement} */ (el.querySelector(s));
  const E = {
    name: q(status, '.dc-name'), spd: q(status, '.dc-spd'), hpI: q(status, '.dc-hp i'), hpB: q(status, '.dc-hp b'), hp: q(status, '.dc-hp'),
    nitro: q(status, '.dc-nitro'), nitroI: q(status, '.dc-nitro i'), fx: q(status, '.dc-fx'), slot: q(status, '.dc-slot'),
    zones: /** @type {Record<string, SVGRectElement>} */ ({}),
    timer: q(side, '#dc-timer'), timerL: q(side, '#dc-timer small'), timerT: q(side, '#dc-timer b'), board: q(side, '#dc-board'),
    boss: q(side, '#dc-boss'), bossN: q(side, '#dc-boss b'), bossL: q(side, '#dc-boss small'), bossI: q(side, '#dc-boss i'),
    bigB: q(big, 'b'), bigS: q(big, 'small'),
  };
  status.querySelectorAll('[data-z]').forEach(r => { E.zones[/** @type {string} */ (r.getAttribute('data-z'))] = /** @type {SVGRectElement} */ (r); });
  tip.hidden = true; tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) tip.addEventListener(t, e => e.stopPropagation());
  const cache = /** @type {Record<string,string>} */ ({});
  const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
  let bigT = 0, flashT = 0, tipCb = /** @type {((a:string)=>void)|null} */ (null);
  tip.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-t]'); if (b && tipCb) tipCb(/** @type {string} */ (b.getAttribute('data-t'))); });

  return {
    els: { status, mis, side, tip, big },
    /** @param {boolean} on */
    show(on) { status.hidden = mis.hidden = side.hidden = !on; if (!on) { tip.hidden = true; big.classList.remove('on'); } },
    /** @param {{name:string, speed:number, hp:number, max:number, nitro:number, nitroOn:boolean, slot:string, slotIcon:string, slotKey:string, zone:any, fx:string}} s */
    status(s) {
      set('name', s.name, v => E.name.textContent = v);
      set('spd', Math.round(Math.abs(s.speed) * 3.6) + ' km/h', v => E.spd.textContent = v);
      const pct = Math.max(0, Math.round(s.hp / s.max * 100));
      set('hp', String(pct), v => { E.hpI.style.width = v + '%'; E.hpB.textContent = String(Math.ceil(s.hp)); E.hp.setAttribute('aria-valuenow', v); });
      set('ni', String(Math.round(s.nitro)), v => E.nitroI.style.width = v + '%');
      set('nion', s.nitroOn ? '1' : '', v => E.nitro.classList.toggle('on', !!v));
      set('slot', s.slot + s.slotKey, () => { E.slot.innerHTML = s.slot ? `${s.slotIcon}<small>${esc(s.slotKey)}</small>` : ''; E.slot.classList.toggle('full', !!s.slot); });
      set('fx', s.fx, v => E.fx.textContent = v);
      for (const k of ['f', 'b', 'l', 'r']) set('z' + k, zoneColor(s.zone[k]), v => E.zones[k].setAttribute('fill', v));
    },
    /** @param {{title:string, kind:string, status:string, progress:number, target:number}[]} list */
    missions(list) {
      const h = list.map(m => `<div class="dc-m ${m.kind === 'primary' ? 'p' : ''} ${m.status}"><span>${m.status === 'done' ? '✔' : m.status === 'failed' ? '✖' : m.kind === 'primary' ? '★' : '◆'}</span><span class="t">${esc(m.title)}</span>${m.target > 1 ? `<span class="n">${Math.min(m.progress, m.target)}/${m.target}</span>` : ''}</div>`).join('');
      set('mis', h, v => mis.innerHTML = v);
    },
    /** @param {string} label @param {string} time @param {boolean} warn @param {{name:string,color:string,pts:number,me:boolean,out:boolean}[]} rows */
    board(label, time, warn, rows) {
      set('tl', label, v => E.timerL.textContent = v);
      set('tt', time, v => E.timerT.textContent = v);
      set('tw', warn ? '1' : '', v => E.timer.classList.toggle('warn', !!v));
      const h = rows.map((r, i) => `<div class="dc-b ${r.me ? 'me' : ''} ${r.out ? 'out' : ''}"><span>${i + 1}</span><span class="d" style="background:${r.color}"></span><span class="nm">${esc(r.name)}</span><span class="pt">${r.pts}</span></div>`).join('');
      set('bd', h, v => E.board.innerHTML = v);
    },
    /** @param {{name:string,hp:number,max:number,label:string}|null} b */
    boss(b) {
      set('bv', b ? '1' : '', v => E.boss.hidden = !v);
      if (!b) return;
      set('bn', b.name, v => E.bossN.textContent = v);
      set('bl', b.label, v => E.bossL.textContent = v);
      set('bh', String(Math.round(b.hp / b.max * 1000) / 10), v => E.bossI.style.width = v + '%');
    },
    /** @param {string|null} html @param {(a:string)=>void} [cb] */
    tip(html, cb) {
      tipCb = cb || null;
      if (!html) { tip.hidden = true; cache.tip = ''; return; }
      set('tip', html, v => { tip.innerHTML = `<div class="k">CONSEJO</div><div>${v}</div><div class="r"><button type="button" data-t="skip">No mostrar más</button><button type="button" class="pri" data-t="ok">Entendido</button></div>`; });
      tip.hidden = false;
    },
    /** @param {string} text @param {string} [sub] @param {number} [sec] */
    big(text, sub = '', sec = 1.2) { E.bigB.textContent = text; E.bigS.textContent = sub; big.classList.add('on'); bigT = sec; },
    flash() { flash.classList.add('on'); flashT = 0.12; },
    /** @param {boolean} on */
    fade(on) { fade.classList.toggle('on', on); },
    /** @param {number} dt */
    tick(dt) {
      if (bigT > 0) { bigT -= dt; if (bigT <= 0) big.classList.remove('on'); }
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.classList.remove('on'); }
    },
    get bigText() { return big.classList.contains('on') ? E.bigB.textContent : ''; },
  };
}
