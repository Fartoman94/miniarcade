// @ts-check
/* Mareas Profundas — HUD y paneles DOM: medidores (energía, casco, O₂, profundidad/presión), misiones, objetivo,
   radar de sonar, barra del Leviatán, retícula de escaneo, avisos y superposiciones (flash, tinta, golpe, fundido).
   Escrituras al DOM sólo cuando cambia algo. */

const CSS = `
html,body{margin:0;height:100%;overflow:hidden;background:#04121c;overscroll-behavior:none}
body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.mp-hud{position:fixed;z-index:30;pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,.8)}
.mp-hud[hidden]{display:none!important}
#mp-left{top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));width:min(270px,calc(100vw - 130px));display:flex;flex-direction:column;gap:6px}
#mp-gauges{padding:7px 9px 6px;border-radius:12px;background:rgba(3,16,26,.72);border:1px solid rgba(120,220,255,.22);display:grid;gap:4px}
.mp-g{display:grid;grid-template-columns:22px 1fr 36px;align-items:center;gap:6px;font:800 11px system-ui}
.mp-g b{font-weight:800;color:#bfe8f5;font-size:11px;text-align:center}
.mp-g span{text-align:right;font-variant-numeric:tabular-nums}
.mp-bar{height:7px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden}
.mp-bar i{display:block;height:100%;border-radius:5px;transition:width .15s}
.mp-g.e i{background:linear-gradient(90deg,#ffb547,#ffe08a)}.mp-g.h i{background:linear-gradient(90deg,#7fd0ff,#cff3ff)}.mp-g.o i{background:linear-gradient(90deg,#4ff7e6,#b6fff6)}
.mp-g.low span,.mp-g.low b{color:#ff6a5a}.mp-g.low i{background:#ff5a4a!important}
.mp-depth{display:flex;justify-content:space-between;gap:6px;font:800 11px system-ui;color:#cfe9f2;font-variant-numeric:tabular-nums}
.mp-depth.warn{color:#ff7a6a}
.mp-depth em{font-style:normal;color:#ffb547}
#mp-missions{display:flex;flex-direction:column;gap:3px}
.mp-m{display:flex;gap:5px;align-items:center;padding:3px 8px;border-radius:999px;background:rgba(3,16,26,.72);border:1px solid rgba(255,255,255,.12);font:700 11px/1.25 system-ui;max-width:100%;box-sizing:border-box}
.mp-m.primary{border-color:rgba(255,181,71,.55)}
.mp-m.done{background:rgba(20,80,50,.75);border-color:#6be38a}.mp-m.failed{opacity:.45;text-decoration:line-through}
.mp-m .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.mp-m .p{opacity:.85;font-variant-numeric:tabular-nums}
#mp-obj{padding:6px 9px;border-radius:10px;background:rgba(3,16,26,.62);font:700 12px/1.35 system-ui;color:#ffe2b0;white-space:pre-line}
#mp-obj:empty{display:none}
#mp-right{top:max(48px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));width:min(280px,46vw);display:flex;flex-direction:column;gap:6px;align-items:flex-end}
#mp-radar{width:112px;height:112px;border-radius:50%;background:rgba(2,14,22,.7);border:1px solid rgba(79,247,230,.35);box-shadow:0 0 18px rgba(79,247,230,.12) inset}
#mp-boss{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:12px;background:rgba(30,6,14,.82);border:1px solid rgba(255,120,120,.45)}
#mp-boss b{display:block;font:400 13px 'Bungee',system-ui,sans-serif;letter-spacing:.04em;color:#ffd2c8}
#mp-boss small{display:block;font:700 11px system-ui;color:#ffc9c0;margin:2px 0 5px}
#mp-boss .mp-bar i{background:linear-gradient(90deg,#4ff7e6,#ffe066)}
#mp-tip{pointer-events:auto;position:fixed;z-index:31;right:max(8px,env(safe-area-inset-right));top:calc(max(48px,env(safe-area-inset-top)) + 124px);width:min(300px,calc(100vw - 16px));box-sizing:border-box;padding:9px 11px;border-radius:12px;background:rgba(4,26,34,.92);border:1px solid rgba(79,247,230,.55);font:600 13px/1.4 system-ui,sans-serif;color:#dffcf8}
#mp-tip[hidden]{display:none}
#mp-tip .k{font:800 10px system-ui;letter-spacing:.22em;color:#4ff7e6;margin-bottom:3px}
#mp-tip .row{display:flex;gap:6px;margin-top:7px;justify-content:flex-end}
#mp-tip button{appearance:none;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;border-radius:9px;padding:6px 10px;font:700 12px system-ui;cursor:pointer;min-height:34px}
#mp-tip button.pri{background:#4ff7e6;color:#032220;border-color:#4ff7e6}
body.mp-boss-on #mp-tip{top:calc(max(48px,env(safe-area-inset-top)) + 196px)}
#mp-prompt{left:50%;transform:translateX(-50%);bottom:max(28px,env(safe-area-inset-bottom));padding:9px 16px;border-radius:999px;background:rgba(3,16,26,.86);
  border:1.5px solid #ffb547;font:800 14px system-ui,sans-serif;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
#mp-prompt.blocked{border-color:rgba(255,255,255,.3);color:#cfdde4;font-weight:700}
#mp-prompt kbd{display:inline-block;min-width:20px;padding:1px 6px;margin-right:6px;border-radius:6px;background:#ffb547;color:#1a1206;font:900 12px system-ui;text-align:center}
#mp-reticle{left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px}
#mp-reticle svg{width:100%;height:100%;overflow:visible}
#mp-reticle small{position:absolute;left:50%;top:70px;transform:translateX(-50%);white-space:nowrap;font:800 11px system-ui;color:#4ff7e6;letter-spacing:.08em}
#mp-title{left:50%;top:40%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .6s;width:min(640px,60vw)}
#mp-title.on{opacity:1}
#mp-title small{display:block;font:800 12px system-ui;letter-spacing:.35em;color:#ffb547}
#mp-title b{display:block;font:400 clamp(20px,4.2vw,40px)/1.1 'Bungee',system-ui,sans-serif;text-shadow:0 4px 0 rgba(0,0,0,.4),0 0 30px rgba(79,247,230,.6)}
.mp-ov{position:fixed;inset:0;pointer-events:none;opacity:0}
#mp-hurt{z-index:28;background:radial-gradient(120% 90% at 50% 50%,transparent 45%,rgba(255,40,30,.55));transition:opacity .35s}
#mp-hurt.on{opacity:1;transition:none}
#mp-flash{z-index:28;background:#fff;transition:opacity .45s}
#mp-flash.on{opacity:.85;transition:none}
#mp-ink{z-index:27;background:radial-gradient(70% 60% at 50% 50%,rgba(0,0,6,.75),rgba(0,0,6,.97));transition:opacity .8s}
#mp-ink.on{opacity:1;transition:opacity .15s}
#mp-dark{z-index:26;background:radial-gradient(60% 55% at 50% 52%,transparent 35%,rgba(0,4,10,.75));transition:opacity 1.2s}
#mp-fade{z-index:48;background:#02070c;transition:opacity .4s}
#mp-fade.on{opacity:1}
#mp-warn{left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:rgba(90,10,10,.85);border:1px solid #ff6a5a;font:800 12px system-ui;white-space:nowrap}
#mp-warn:empty{display:none}
.mp-menu-prog{font:700 12px system-ui;color:#cfe9f2;background:rgba(0,0,0,.28);border-radius:10px;padding:7px 10px;line-height:1.5}
.mp-dtab{font:600 12px/1.45 system-ui;color:#bcd9e2;max-width:48ch}
.mp-credit{margin-top:4px;font:800 11px system-ui;letter-spacing:.25em;color:#cfe9f2;display:flex;align-items:center;gap:6px;justify-content:center}
.mp-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(255,181,71,.7)}
.mp-opts{display:grid;gap:7px;width:100%;text-align:left;font:600 14px system-ui}
.mp-opts label,.mp-bind{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
.mp-opts input[type=range]{width:140px}
.mp-opts select,.mp-bind button{font:700 13px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.35);color:#fff;padding:6px 10px;min-height:34px}
.mp-bind button.wait{background:#ffb547;color:#1a1206}
.mp-small{font:600 12px/1.45 system-ui;color:#a9c8d2}
.k3-panel h1{font-size:clamp(28px,7vw,56px)!important}
.k3-btns{max-width:226px!important;gap:10px!important}
.k3-btn{width:64px!important;height:64px!important;font-size:11px!important;letter-spacing:.02em}
body.mp-touch #mp-prompt{bottom:calc(196px + env(safe-area-inset-bottom))}
body.mp-touch #mp-tip{left:50%;right:auto;transform:translateX(-50%);top:auto;bottom:calc(250px + env(safe-area-inset-bottom))}
@media (orientation:landscape){
  body.mp-touch #mp-prompt{bottom:max(14px,env(safe-area-inset-bottom));max-width:calc(100vw - 460px)}
  body.mp-touch #mp-tip{top:max(8px,env(safe-area-inset-top));bottom:auto;width:min(330px,calc(100vw - 600px))}
  body.mp-touch #mp-left{width:min(250px,30vw)}
}
@media (max-height:480px){#mp-radar{width:92px;height:92px}#mp-obj{font-size:11px}.mp-m{font-size:10px;padding:2px 7px}.k3-panel h1{font-size:30px!important}.k3-panel{gap:7px!important}.k3-panel p{font-size:13px}.k3-b{padding:10px 16px!important}.mp-dtab{display:none}
  body.mp-touch #mp-missions .mp-m:not(.primary){display:none}}
@media (max-width:600px){#mp-radar{width:96px;height:96px}#mp-left{top:calc(max(8px,env(safe-area-inset-top)) + 44px);width:calc(100vw - 124px)}}
@media (prefers-reduced-motion:reduce){#mp-title,#mp-fade,#mp-hurt,#mp-flash,#mp-ink,#mp-dark{transition:none!important}}
`;

/** @param {string} s */
export const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createUI() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, cls = 'mp-hud', parent = document.body) => { const e = document.createElement('div'); e.id = id; e.className = cls; parent.appendChild(e); return e; };
  const left = mk('mp-left'), right = mk('mp-right');
  const gauges = mk('mp-gauges', '', left), missions = mk('mp-missions', '', left), obj = mk('mp-obj', '', left);
  const radar = document.createElement('canvas'); radar.id = 'mp-radar'; radar.width = radar.height = 224; right.appendChild(radar);
  radar.setAttribute('aria-label', 'Radar de sonar'); radar.setAttribute('role', 'img');
  const boss = mk('mp-boss', '', right); boss.hidden = true;
  const tip = mk('mp-tip', ''); tip.hidden = true; tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');
  const prompt = mk('mp-prompt'), reticle = mk('mp-reticle'), title = mk('mp-title'), warn = mk('mp-warn');
  const hurtO = mk('mp-hurt', 'mp-ov'), flashO = mk('mp-flash', 'mp-ov'), inkO = mk('mp-ink', 'mp-ov'), darkO = mk('mp-dark', 'mp-ov'), fade = mk('mp-fade', 'mp-ov');
  reticle.innerHTML = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(79,247,230,.25)" stroke-width="3"/><circle data-arc cx="32" cy="32" r="26" fill="none" stroke="#4ff7e6" stroke-width="4" stroke-dasharray="0 999" transform="rotate(-90 32 32)" stroke-linecap="round"/><path d="M32 22v6M32 36v6M22 32h6M36 32h6" stroke="#4ff7e6" stroke-width="2"/></svg><small></small>`;
  const arc = /** @type {SVGCircleElement} */ (reticle.querySelector('[data-arc]')), retLabel = /** @type {HTMLElement} */ (reticle.querySelector('small'));
  gauges.innerHTML = `<div class="mp-g e"><b>⚡</b><div class="mp-bar"><i></i></div><span></span></div><div class="mp-g h"><b>🛡</b><div class="mp-bar"><i></i></div><span></span></div><div class="mp-g o"><b>O₂</b><div class="mp-bar"><i></i></div><span></span></div><div class="mp-depth"><span data-d></span><span data-s></span></div>`;
  const G = [...gauges.querySelectorAll('.mp-g')].map(g => ({ g, i: /** @type {HTMLElement} */ (g.querySelector('i')), s: /** @type {HTMLElement} */ (g.querySelector('span')) }));
  const depthRow = /** @type {HTMLElement} */ (gauges.querySelector('.mp-depth')), depthEl = /** @type {HTMLElement} */ (gauges.querySelector('[data-d]')), scoreEl = /** @type {HTMLElement} */ (gauges.querySelector('[data-s]'));
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) tip.addEventListener(t, e => e.stopPropagation());
  /** @type {((a:string)=>void)|null} */ let tipHandler = null;
  tip.addEventListener('click', e => { const b = /** @type {HTMLElement} */ (e.target).closest('[data-t]'); if (b && tipHandler) tipHandler(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.t)); });
  const last = { g: ['', '', ''], d: '', s: '', m: '', o: '', p: '', b: '', w: '', r: '' };
  reticle.hidden = true;
  let titleT = 0, hurtT = 0, flashT = 0;
  const rctx = /** @type {CanvasRenderingContext2D} */ (radar.getContext('2d'));
  function ret(k, label) {
    arc.setAttribute('stroke-dasharray', `${(k * 163.4).toFixed(1)} 999`);
    if (label !== last.r) { retLabel.textContent = label; last.r = label; }
  }
  return {
    els: { left, right, gauges, missions, obj, radar, boss, tip, prompt, reticle, title, warn, fade, ink: inkO, dark: darkO },
    /** @param {boolean} v */
    show(v) { left.hidden = right.hidden = !v; if (!v) { prompt.hidden = true; reticle.hidden = true; warn.textContent = ''; last.w = ''; } },
    /** @param {{energy:number,hull:number,o2:number,depth:number,limit:number,score:number}} s */
    gauges(s) {
      const vals = [s.energy, s.hull, s.o2];
      for (let k = 0; k < 3; k++) {
        const v = Math.max(0, Math.round(vals[k])), key = String(v);
        if (key !== last.g[k]) { G[k].i.style.width = v + '%'; G[k].s.textContent = v + '%'; G[k].g.classList.toggle('low', v <= 25); last.g[k] = key; }
      }
      const d = `${Math.round(s.depth)} m · límite <em>${s.limit} m</em>`;
      if (d !== last.d) { depthEl.innerHTML = d; depthRow.classList.toggle('warn', s.depth > s.limit); last.d = d; }
      const sc = `${s.score} pts`; if (sc !== last.s) { scoreEl.textContent = sc; last.s = sc; }
    },
    /** @param {{id:string,title:string,kind:string,status:string,progress:number,target:number}[]} list */
    missions(list) {
      const h = list.map(m => {
        const ic = m.status === 'done' ? '✔' : m.status === 'failed' ? '✖' : m.kind === 'primary' ? '★' : '◆';
        const p = m.target > 1 && m.status === 'active' ? `<span class="p">${Math.min(m.target, Math.floor(m.progress))}/${m.target}</span>` : '';
        return `<div class="mp-m ${m.kind === 'primary' ? 'primary' : ''} ${m.status}" data-m="${esc(m.id)}"><span>${ic}</span><span class="t">${esc(m.title)}</span>${p}</div>`;
      }).join('');
      if (h !== last.m) { missions.innerHTML = h; last.m = h; }
    },
    /** @param {string} s */
    objective(s) { if (s !== last.o) { obj.textContent = s; last.o = s; } },
    /** @param {string|null} key @param {string|null} label @param {boolean} [blocked] */
    prompt(key, label, blocked = false) {
      const h = label ? `${key ? `<kbd>${esc(key)}</kbd>` : ''}${esc(label)}` : '';
      const k = h + (blocked ? '#b' : '');
      if (k !== last.p) { prompt.innerHTML = h; prompt.hidden = !h; prompt.classList.toggle('blocked', blocked); last.p = k; }
    },
    /** @param {{label:string, frac:number}|null} b */
    boss(b) {
      const h = b ? `<b>LEVIATÁN ABISAL</b><small>${esc(b.label)}</small><div class="mp-bar"><i style="width:${Math.round(b.frac * 100)}%"></i></div>` : '';
      if (h !== last.b) { boss.innerHTML = h; boss.hidden = !b; document.body.classList.toggle('mp-boss-on', !!b); last.b = h; }
    },
    /** @param {string} s */
    warn(s) { if (s !== last.w) { warn.textContent = s; last.w = s; } },
    /** @param {number} k 0..1 @param {string} label */
    reticle(k, label) { reticle.hidden = !label; if (label) ret(k, label); },
    /** @param {string|null} html @param {(a:string)=>void} [onAction] */
    tip(html, onAction) {
      tipHandler = onAction || null;
      if (!html) { tip.hidden = true; tip.innerHTML = ''; return; }
      tip.innerHTML = `<div class="k">TUTORIAL</div><div>${html}</div><div class="row"><button type="button" data-t="skip">Saltar tutorial</button><button type="button" class="pri" data-t="ok">Entendido</button></div>`;
      tip.hidden = false;
    },
    get tipVisible() { return !tip.hidden; },
    /** @param {string} name @param {string} sub */
    title(name, sub) { title.innerHTML = `<small>${esc(sub)}</small><b>${esc(name)}</b>`; title.classList.add('on'); clearTimeout(titleT); titleT = window.setTimeout(() => title.classList.remove('on'), 2800); },
    hideTitle() { title.classList.remove('on'); },
    hurt() { hurtO.classList.add('on'); clearTimeout(hurtT); hurtT = window.setTimeout(() => hurtO.classList.remove('on'), 80); },
    /** @param {boolean} soft */
    flash(soft) { flashO.style.background = soft ? 'rgba(255,255,255,.35)' : '#fff'; flashO.classList.add('on'); clearTimeout(flashT); flashT = window.setTimeout(() => flashO.classList.remove('on'), 60); },
    /** @param {boolean} v */ ink(v) { inkO.classList.toggle('on', v); },
    /** @param {number} k */ dark(k) { darkO.style.opacity = String(k); },
    /** @param {boolean} v */ fade(v) { fade.classList.toggle('on', v); },
    /**
     * Radar: el frente del submarino apunta hacia arriba. Rango en metros.
     * @param {{x:number,z:number,yaw:number}} me @param {{x:number,z:number,color:string,a:number}[]} blips @param {number} sweep @param {number} pulseK
     * @param {{x:number,z:number}|null} goal
     */
    radar(me, blips, sweep, pulseK, goal, range = 55) {
      const c = rctx, W = 224, R = 108, cx = 112, cy = 112;
      c.clearRect(0, 0, W, W);
      c.strokeStyle = 'rgba(79,247,230,.18)'; c.lineWidth = 2;
      for (const k of [0.33, 0.66, 1]) { c.beginPath(); c.arc(cx, cy, R * k, 0, Math.PI * 2); c.stroke(); }
      c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
      // barrido
      const g = c.createConicGradient ? c.createConicGradient(sweep - Math.PI / 2, cx, cy) : null;
      if (g) { g.addColorStop(0, 'rgba(79,247,230,.35)'); g.addColorStop(0.12, 'rgba(79,247,230,0)'); g.addColorStop(1, 'rgba(79,247,230,0)'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); }
      if (pulseK >= 0) { c.strokeStyle = `rgba(79,247,230,${(1 - pulseK) * 0.9})`; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R * Math.min(1, pulseK * 45 / range), 0, Math.PI * 2); c.stroke(); }
      const s = Math.sin(me.yaw), co = Math.cos(me.yaw);
      const proj = (x, z) => { const dx = x - me.x, dz = z - me.z; const fx = dx * s + dz * co, rx = -(dx * co - dz * s); return [cx + (rx / range) * R, cy - (fx / range) * R]; };
      for (const b of blips) {
        let [px, py] = proj(b.x, b.z); const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
        if (d > R - 4) { px = cx + dx / d * (R - 4); py = cy + dy / d * (R - 4); }
        c.globalAlpha = Math.max(0, Math.min(1, b.a)); c.fillStyle = b.color; c.beginPath(); c.arc(px, py, 6, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
      if (goal) {
        const [px, py] = proj(goal.x, goal.z), dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1, a = Math.atan2(dy, dx);
        const rr = Math.min(R - 8, d);
        c.save(); c.translate(cx + dx / d * rr, cy + dy / d * rr); c.rotate(a); c.fillStyle = '#ffb547';
        c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.closePath(); c.fill(); c.restore();
      }
      // el submarino
      c.fillStyle = '#ffb547'; c.beginPath(); c.moveTo(cx, cy - 10); c.lineTo(cx - 7, cy + 8); c.lineTo(cx + 7, cy + 8); c.closePath(); c.fill();
    },
  };
}
