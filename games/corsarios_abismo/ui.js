// @ts-check
/* Corsarios del Abismo — HUD DOM: casco/mástil/velas, oro/kits/fragmentos, objetivo, misiones, carta náutica
   (minimapa con viento), recargas de babor/estribor, aviso de acción, barra del jefe, consejos, textos grandes
   y el minijuego de abordaje. Sólo escribe al DOM si algo cambió. */

const A = '#ffbe3d';
const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#06121c;overscroll-behavior:none}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.ca-hud{position:fixed;z-index:30;pointer-events:none;text-shadow:0 2px 5px rgba(0,0,0,.7)}
.ca-hud[hidden]{display:none!important}
.ca-panel{background:linear-gradient(180deg,rgba(14,28,40,.86),rgba(8,16,24,.76));border:1px solid rgba(255,190,61,.32);border-radius:12px;box-sizing:border-box}
#ca-status{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));width:204px;padding:7px 9px;font:800 11px system-ui,sans-serif}
.ca-reg{font:400 11.5px 'Bungee',system-ui,sans-serif;color:${A};letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ca-bar{position:relative;height:11px;margin:4px 0 3px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden}
.ca-bar i{position:absolute;inset:0 auto 0 0;transition:width .15s}
.ca-bar b{position:absolute;left:6px;top:-1px;font:900 9px/13px system-ui;letter-spacing:.12em;color:#fff}
.ca-bar.hull i{background:linear-gradient(90deg,#ff4a2a,#ffd23a 45%,#5ee07a)}
.ca-bar.mast i{background:linear-gradient(90deg,#c0392b,#e8d6a8)}.ca-bar.mast.lost i{background:#5a2020}
.ca-row{display:flex;gap:7px;align-items:center;justify-content:space-between;margin-top:3px;font-variant-numeric:tabular-nums}
.ca-sail{display:flex;gap:2px;align-items:flex-end}.ca-sail span{width:7px;border-radius:2px;background:rgba(255,255,255,.18)}
.ca-sail span:nth-child(1){height:5px}.ca-sail span:nth-child(2){height:8px}.ca-sail span:nth-child(3){height:11px}.ca-sail span:nth-child(4){height:14px}
.ca-sail span.on{background:${A}}
.ca-obj{margin-top:5px;font:700 10.5px/1.3 system-ui;color:#ffe9b8;border-top:1px solid rgba(255,255,255,.12);padding-top:4px}
#ca-mis{top:calc(max(8px,env(safe-area-inset-top)) + 128px);left:max(8px,env(safe-area-inset-left));width:204px;display:flex;flex-direction:column;gap:3px}
.ca-m{display:flex;gap:5px;align-items:center;padding:2px 7px;border-radius:999px;background:rgba(6,14,22,.72);border:1px solid rgba(255,255,255,.12);font:700 10.5px/1.3 system-ui}
.ca-m.p{border-color:rgba(255,190,61,.55)}.ca-m.done{background:rgba(30,90,40,.75);border-color:#6be38a}.ca-m.failed{opacity:.45;text-decoration:line-through}
.ca-m .t{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ca-m .n{opacity:.85;font-variant-numeric:tabular-nums}
#ca-map{top:max(50px,calc(env(safe-area-inset-top) + 44px));right:max(8px,env(safe-area-inset-right));width:136px;padding:4px;text-align:center}
#ca-map canvas{display:block;width:128px;height:128px}
#ca-map small{display:block;font:800 9px system-ui;letter-spacing:.14em;margin-top:2px;white-space:nowrap}
#ca-map small.fav{color:#7ee35a}#ca-map small.con{color:#ff8a6a}
#ca-reload{left:50%;transform:translateX(-50%);bottom:max(14px,env(safe-area-inset-bottom));display:flex;gap:14px}
.ca-rl{width:150px;padding:5px 8px;font:800 10px system-ui;letter-spacing:.14em;text-align:center}
.ca-rl i{display:block;height:7px;margin-top:4px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}
.ca-rl i::after{content:'';display:block;height:100%;width:var(--p,100%);background:${A}}
.ca-rl.ready{border-color:${A};box-shadow:0 0 12px rgba(255,190,61,.35)}
.ca-rl.aim{color:#ffe08a}
#ca-prompt{left:50%;transform:translateX(-50%);bottom:calc(max(14px,env(safe-area-inset-bottom)) + 52px);padding:8px 14px;font:800 13px system-ui;white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis;text-align:center}
#ca-prompt kbd{display:inline-block;padding:1px 7px;margin-right:6px;border-radius:6px;background:${A};color:#1a1204;font:900 12px system-ui;text-shadow:none}
#ca-prompt .pg{display:block;height:5px;margin-top:5px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden}
#ca-prompt .pg::after{content:'';display:block;height:100%;width:var(--p,0%);background:${A}}
#ca-boss{top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(360px,calc(100vw - 460px));min-width:220px;padding:6px 10px;background:rgba(8,30,24,.88);border-color:rgba(92,255,176,.6)}
#ca-boss b{display:block;font:400 12px 'Bungee',system-ui,sans-serif;color:#bfffe4}
#ca-boss small{display:block;font:800 9px system-ui;letter-spacing:.14em;color:#8affc8;margin:2px 0 4px}
#ca-boss .ca-bar{margin:0}#ca-boss .ca-bar i{background:linear-gradient(90deg,#1aa874,#7affc8)}
#ca-tip{pointer-events:auto;left:50%;transform:translateX(-50%);top:max(10px,env(safe-area-inset-top));width:min(420px,calc(100vw - 470px));min-width:240px;box-sizing:border-box;padding:9px 11px;border-radius:12px;
  background:rgba(12,24,34,.94);border:1px solid rgba(255,190,61,.6);font:600 13px/1.4 system-ui,sans-serif;color:#f4ead2}
#ca-tip .k{font:800 10px system-ui;letter-spacing:.22em;color:${A};margin-bottom:3px}
#ca-tip .r{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
#ca-tip button{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:6px 10px;font:700 12px system-ui;cursor:pointer;min-height:34px}
#ca-tip button.pri{background:${A};color:#1a1204;border-color:${A}}
#ca-big{left:50%;top:34%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .3s;white-space:nowrap}
#ca-big.on{opacity:1;transition:none}
#ca-big b{display:block;font:400 clamp(26px,7vw,64px)/1 'Bungee',system-ui,sans-serif;color:#fff;text-shadow:0 4px 0 rgba(0,0,0,.45),0 0 26px rgba(255,190,61,.7)}
#ca-big small{display:block;margin-top:6px;font:800 13px system-ui;letter-spacing:.25em;color:${A}}
#ca-flash{inset:0;z-index:29;background:radial-gradient(120% 90% at 50% 50%,transparent 45%,rgba(255,40,20,.5));opacity:0;transition:opacity .35s}
#ca-flash.on{opacity:1;transition:none}
#ca-fade{inset:0;z-index:48;background:#03080d;opacity:0;transition:opacity .45s}
#ca-fade.on{opacity:1}
#ca-qte{pointer-events:auto;left:50%;top:58%;transform:translate(-50%,-50%);width:min(380px,90vw);padding:12px 14px;text-align:center;z-index:35}
#ca-qte h3{margin:0 0 6px;font:400 16px 'Bungee',system-ui,sans-serif;color:${A}}
#ca-qte .trk{position:relative;height:22px;border-radius:11px;background:rgba(255,255,255,.12);overflow:hidden;margin:8px 0}
#ca-qte .zone{position:absolute;top:0;bottom:0;background:rgba(110,230,120,.55);border-left:2px solid #7ee35a;border-right:2px solid #7ee35a}
#ca-qte .ndl{position:absolute;top:-2px;bottom:-2px;width:6px;margin-left:-3px;background:#fff;border-radius:3px;box-shadow:0 0 8px #fff}
#ca-qte .dots{font:900 18px system-ui;letter-spacing:.3em}
#ca-qte p{margin:0;font:600 12px system-ui;color:#e8dcc0}
body.ca-touch #ca-reload{display:none}
@media (min-width:761px){body.ca-bossbar #ca-tip{top:calc(max(10px,env(safe-area-inset-top)) + 70px)}}
body.ca-touch #ca-mis .ca-m:not(.p){display:none}
body.ca-touch #ca-prompt{bottom:calc(max(24px,env(safe-area-inset-bottom)) + 186px)}
@media (max-height:500px){#ca-mis{display:none}body.ca-touch #ca-prompt{bottom:calc(max(10px,env(safe-area-inset-bottom)) + 8px)}#ca-map canvas{width:96px;height:96px}#ca-map{width:104px}}
@media (max-width:760px){#ca-tip{width:calc(100vw - 24px);top:auto;bottom:calc(240px + env(safe-area-inset-bottom))}#ca-boss{top:calc(max(8px,env(safe-area-inset-top)) + 184px);width:calc(100vw - 24px)}}
@media (max-width:760px) and (max-height:500px){#ca-tip{width:min(380px,calc(100vw - 420px));bottom:auto;top:8px}}
@media (min-width:761px) and (max-height:500px){#ca-tip{width:min(380px,calc(100vw - 440px));top:8px}#ca-boss{top:8px;width:min(300px,calc(100vw - 480px))}}
.ca-menu-prog{font:700 12px system-ui;color:#f2e6c8;background:rgba(0,0,0,.3);border-radius:10px;padding:7px 10px;line-height:1.5}
.ca-dtab{font:600 11.5px/1.45 system-ui;color:#e2d6b8;max-width:54ch}
.ca-credit{margin-top:2px;font:800 11px system-ui;letter-spacing:.25em;color:#f2e6c8;display:flex;align-items:center;gap:6px;justify-content:center}
.ca-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(255,190,61,.6)}
.ca-opts{display:grid;gap:7px;width:100%;text-align:left;font:600 14px system-ui}
.ca-opts label,.ca-bind{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.ca-opts input[type=range]{width:130px}
.ca-opts select,.ca-bind button{font:700 13px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;padding:6px 10px;min-height:34px}
.ca-small{font:600 12px/1.45 system-ui;color:#d8ccae}
.ca-shop{display:grid;gap:7px;width:100%}
.ca-shop button{display:flex;justify-content:space-between;align-items:center;gap:8px;appearance:none;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:#fff;border-radius:12px;padding:10px 12px;font:700 13.5px system-ui;cursor:pointer;text-align:left;min-height:44px}
.ca-shop button:disabled{opacity:.42;cursor:not-allowed}
.ca-shop button b{font:900 13px system-ui;color:${A};white-space:nowrap}
.ca-shop button:focus-visible{outline:2px solid ${A};outline-offset:2px}
.ca-table{width:100%;border-collapse:collapse;font:700 13px system-ui;text-align:left}
.ca-table td{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.1)}.ca-table td.n{text-align:right;font-variant-numeric:tabular-nums}
.k3-panel h1{font-size:clamp(28px,7vw,56px)!important}
.k3-touch .k3-joy{width:142px;height:142px;border:7px solid rgba(160,110,60,.75);background:radial-gradient(circle,rgba(0,0,0,.15) 30%,rgba(255,255,255,.06) 31%,transparent 60%);box-shadow:0 0 0 2px rgba(0,0,0,.3)}
.k3-touch .k3-joy::before{content:'TIMÓN · VELAS';position:absolute;left:0;right:0;top:-18px;text-align:center;font:800 10px system-ui;letter-spacing:.16em;color:rgba(255,255,255,.7)}
.k3-touch .k3-joy::after{content:'';position:absolute;inset:-12px;border-radius:50%;background:repeating-conic-gradient(rgba(160,110,60,.85) 0 6deg,transparent 6deg 45deg);-webkit-mask:radial-gradient(circle,transparent 62%,#000 63%,#000 70%,transparent 71%);mask:radial-gradient(circle,transparent 62%,#000 63%,#000 70%,transparent 71%);pointer-events:none}
.k3-touch .k3-joy i{background:rgba(255,190,61,.55)}
.k3-touch .k3-btn{font-size:11px;letter-spacing:.04em;--p:100%;background:conic-gradient(rgba(255,190,61,.55) var(--p),rgba(10,14,22,.6) 0)}
.k3-touch .k3-btn[aria-label=act]{background:rgba(40,110,160,.65)}.k3-touch .k3-btn[aria-label=kit]{background:rgba(40,130,70,.6)}
.k3-touch .k3-btn.dim{opacity:.45}
@media (max-height:480px){.k3-panel h1{font-size:28px!important}.k3-panel{gap:6px!important}.k3-panel p{font-size:12.5px}.k3-b{padding:9px 14px!important}.ca-dtab{display:none}}
@media (prefers-reduced-motion:reduce){#ca-big,#ca-fade,#ca-flash{transition:none!important}}
`;

const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, extra = '') => { const e = document.createElement('div'); e.id = id; e.className = 'ca-hud ' + extra; document.body.appendChild(e); return e; };
  const status = mk('ca-status', 'ca-panel'), mis = mk('ca-mis'), map = mk('ca-map', 'ca-panel'), reload = mk('ca-reload'), prompt = mk('ca-prompt', 'ca-panel'),
    boss = mk('ca-boss', 'ca-panel'), tip = mk('ca-tip'), big = mk('ca-big'), flash = mk('ca-flash'), fade = mk('ca-fade'), qte = mk('ca-qte', 'ca-panel');
  status.innerHTML = `<div class="ca-reg"></div>
    <div class="ca-bar hull" role="meter" aria-label="Casco"><i></i><b>CASCO</b></div>
    <div class="ca-bar mast" role="meter" aria-label="Mástil"><i></i><b>MÁSTIL</b></div>
    <div class="ca-row"><span class="ca-sail" title="Velas"><span></span><span></span><span></span><span></span></span><span data-k="spd"></span><span data-k="gold"></span><span data-k="kits"></span><span data-k="frag"></span></div>
    <div class="ca-obj"></div>`;
  map.innerHTML = '<canvas width="256" height="256" aria-label="Carta náutica"></canvas><small></small>';
  reload.innerHTML = '<div class="ca-rl ca-panel" data-s="L">◀ BABOR <i></i></div><div class="ca-rl ca-panel" data-s="R">ESTRIBOR ▶<i></i></div>';
  boss.innerHTML = '<b></b><small></small><div class="ca-bar"><i></i></div>';
  big.innerHTML = '<b></b><small></small>';
  qte.innerHTML = '<h3>¡AL ABORDAJE!</h3><p data-q></p><div class="trk"><div class="zone"></div><div class="ndl"></div></div><div class="dots"></div>';
  const q = (el, s) => /** @type {HTMLElement} */ (el.querySelector(s));
  const E = {
    reg: q(status, '.ca-reg'), hullI: q(status, '.hull i'), mast: q(status, '.mast'), mastI: q(status, '.mast i'), sail: [...status.querySelectorAll('.ca-sail span')],
    spd: q(status, '[data-k=spd]'), gold: q(status, '[data-k=gold]'), kits: q(status, '[data-k=kits]'), frag: q(status, '[data-k=frag]'), obj: q(status, '.ca-obj'),
    canvas: /** @type {HTMLCanvasElement} */ (q(map, 'canvas')), wind: q(map, 'small'), rl: { L: q(reload, '[data-s=L]'), R: q(reload, '[data-s=R]') },
    bossN: q(boss, 'b'), bossL: q(boss, 'small'), bossI: q(boss, 'i'), bigB: q(big, 'b'), bigS: q(big, 'small'),
    qZone: q(qte, '.zone'), qNdl: q(qte, '.ndl'), qDots: q(qte, '.dots'), qP: q(qte, '[data-q]'),
  };
  const ctx2 = /** @type {CanvasRenderingContext2D} */ (E.canvas.getContext('2d'));
  tip.hidden = true; tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');
  boss.hidden = true; prompt.hidden = true; qte.hidden = true;
  for (const el of [tip, qte]) for (const t of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(t, e => e.stopPropagation());
  const cache = /** @type {Record<string,string>} */ ({});
  const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
  let bigT = 0, flashT = 0, tipCb = /** @type {((a:string)=>void)|null} */ (null);
  tip.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-t]'); if (b && tipCb) tipCb(/** @type {string} */ (b.getAttribute('data-t'))); });
  let shown = false;

  return {
    els: { status, mis, map, reload, prompt, boss, tip, big, qte },
    /** @param {boolean} on */
    show(on) { shown = on; status.hidden = mis.hidden = map.hidden = reload.hidden = !on; if (!on) { tip.hidden = true; big.classList.remove('on'); prompt.hidden = true; boss.hidden = true; qte.hidden = true; cache.pr = ''; cache.bv = ''; } },
    get shown() { return shown; },
    /** @param {any} s */
    status(s) {
      set('reg', s.region, v => E.reg.textContent = v);
      set('hull', String(Math.round(s.hull / s.maxHull * 100)), v => { E.hullI.style.width = v + '%'; status.querySelector('.hull')?.setAttribute('aria-valuenow', v); });
      set('mast', s.mastLost ? 'x' : String(Math.round(s.mast / s.maxMast * 100)), v => { E.mastI.style.width = (v === 'x' ? 100 : v) + '%'; E.mast.classList.toggle('lost', v === 'x'); /** @type {HTMLElement} */ (E.mast.querySelector('b')).textContent = v === 'x' ? 'MÁSTIL ROTO' : 'MÁSTIL'; });
      set('sail', String(s.sailN), v => E.sail.forEach((x, i) => x.classList.toggle('on', i < +v)));
      set('spd', s.knots + ' nd', v => E.spd.textContent = v);
      set('gold', '💰' + s.gold, v => E.gold.textContent = v);
      set('kits', '🩹' + s.kits, v => E.kits.textContent = v);
      set('frag', '🗺' + s.frag + '/3', v => E.frag.textContent = v);
      set('obj', s.objective, v => E.obj.textContent = v);
    },
    /** @param {{title:string, kind:string, status:string, progress:number, target:number}[]} list */
    missions(list) {
      const h = list.map(m => `<div class="ca-m ${m.kind === 'primary' ? 'p' : ''} ${m.status}"><span>${m.status === 'done' ? '✔' : m.status === 'failed' ? '✖' : m.kind === 'primary' ? '★' : '◆'}</span><span class="t">${esc(m.title)}</span>${m.target > 1 ? `<span class="n">${Math.min(m.progress, m.target)}/${m.target}</span>` : ''}</div>`).join('');
      set('mis', h, v => mis.innerHTML = v);
    },
    /** @param {{L:number,R:number}} p 0..1 cargado @param {{L:boolean,R:boolean}} aim */
    reload(p, aim) {
      for (const k of /** @type {const} */ (['L', 'R'])) {
        set('rl' + k, String(Math.round(p[k] * 100)), v => { E.rl[k].style.setProperty('--p', v + '%'); E.rl[k].classList.toggle('ready', v === '100'); });
        set('ra' + k, aim[k] ? '1' : '', v => E.rl[k].classList.toggle('aim', !!v));
      }
    },
    /** @param {string|null} html @param {number} [prog] */
    prompt(html, prog = -1) {
      set('pr', html || '', v => { prompt.hidden = !v; if (v) prompt.innerHTML = v + '<span class="pg"></span>'; cache.pp = ''; });
      if (html) { const pg = /** @type {HTMLElement} */ (prompt.querySelector('.pg')); set('pp', String(Math.round(prog * 100)), v => { pg.style.display = prog >= 0 ? 'block' : 'none'; pg.style.setProperty('--p', v + '%'); }); }
    },
    /** @param {{name:string,hp:number,max:number,label:string}|null} b */
    boss(b) {
      set('bv', b ? '1' : '', v => { boss.hidden = !v; document.body.classList.toggle('ca-bossbar', !!v); });
      if (!b) return;
      set('bn', b.name, v => E.bossN.textContent = v);
      set('bl', b.label, v => E.bossL.textContent = v);
      set('bh', String(Math.round(b.hp / b.max * 1000) / 10), v => E.bossI.style.width = v + '%');
    },
    /** Carta náutica. @param {any} m */
    map(m) {
      const c = ctx2, W = 256, k = W / 2 / 200;
      c.clearRect(0, 0, W, W);
      c.save(); c.translate(W / 2, W / 2);
      c.fillStyle = 'rgba(16,52,78,.85)'; c.beginPath(); c.arc(0, 0, W / 2 - 2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,190,61,.45)'; c.lineWidth = 3; c.stroke();
      // ejes: x del mundo → derecha invertida (estribor) para que coincida con la cámara mirando al norte (+Z arriba)
      const X = x => -x * k, Y = z => -z * k;
      for (const i of m.islands) { c.fillStyle = i.rock ? '#6a6660' : i.coral ? '#3a2a48' : '#d8c48a'; c.beginPath(); c.arc(X(i.x), Y(i.z), Math.max(3, i.r * k), 0, 7); c.fill(); if (!i.rock && !i.coral) { c.fillStyle = '#5a9a48'; c.beginPath(); c.arc(X(i.x), Y(i.z), Math.max(1.5, i.r * k * 0.6), 0, 7); c.fill(); } }
      for (const g of m.gates) { c.strokeStyle = g.active ? '#ffbe3d' : '#7a8a98'; c.lineWidth = 3; c.beginPath(); c.arc(X(g.x), Y(g.z), 8, 0, 7); c.stroke(); }
      for (const d of m.docks) { c.fillStyle = '#ffbe3d'; c.font = '900 18px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⚓', X(d.x), Y(d.z)); }
      for (const t of m.marks) { c.strokeStyle = '#ff3a2a'; c.lineWidth = 3; const x = X(t.x), y = Y(t.z); c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke(); }
      for (const n of m.castaways) { c.fillStyle = '#fff27a'; c.beginPath(); c.arc(X(n.x), Y(n.z), 4, 0, 7); c.fill(); }
      for (const e of m.enemies) { c.fillStyle = e.boss ? '#5cffb0' : '#ff4a3a'; c.beginPath(); c.arc(X(e.x), Y(e.z), e.boss ? 7 : 4, 0, 7); c.fill(); }
      if (m.goal) { c.fillStyle = '#ffe27a'; c.font = '900 20px system-ui'; c.fillText('★', X(m.goal.x), Y(m.goal.z)); }
      // jugador
      c.save(); c.translate(X(m.px), Y(m.pz)); c.rotate(-m.pyaw);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 4); c.lineTo(-6, 7); c.closePath(); c.fill(); c.restore();
      // viento
      c.save(); c.rotate(-m.wind); c.translate(0, W / 2 - 18);
      c.fillStyle = '#bfe6ff'; c.beginPath(); c.moveTo(0, -10); c.lineTo(8, 6); c.lineTo(0, 1); c.lineTo(-8, 6); c.closePath(); c.fill(); c.restore();
      c.restore();
      set('wind', m.windLabel, v => { E.wind.textContent = v; E.wind.className = m.windEff > 0.8 ? 'fav' : m.windEff < 0.55 ? 'con' : ''; });
    },
    /** @param {string|null} html @param {(a:string)=>void} [cb] */
    tip(html, cb) {
      tipCb = cb || null;
      if (!html) { tip.hidden = true; cache.tip = ''; return; }
      set('tip', html, v => { tip.innerHTML = `<div class="k">CONSEJO DEL CONTRAMAESTRE</div><div>${v}</div><div class="r"><button type="button" data-t="skip">No mostrar más</button><button type="button" class="pri" data-t="ok">Entendido</button></div>`; });
      tip.hidden = false;
    },
    /** @param {{on:boolean, zone?:[number,number], needle?:number, hits?:number, need?:number, text?:string}} o */
    qte(o) {
      qte.hidden = !o.on; if (!o.on) return;
      const z = o.zone || [0.4, 0.6];
      E.qZone.style.left = z[0] * 100 + '%'; E.qZone.style.width = (z[1] - z[0]) * 100 + '%';
      E.qNdl.style.left = (o.needle || 0) * 100 + '%';
      set('qd', '⚔'.repeat(o.hits || 0) + '·'.repeat(Math.max(0, (o.need || 3) - (o.hits || 0))), v => E.qDots.textContent = v);
      set('qp', o.text || '', v => E.qP.textContent = v);
    },
    /** @param {string} text @param {string} [sub] @param {number} [sec] */
    big(text, sub = '', sec = 1.4) { E.bigB.textContent = text; E.bigS.textContent = sub; big.classList.add('on'); bigT = sec; },
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
