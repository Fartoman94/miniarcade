// @ts-check
/* Bastiones Elementales — interfaz DOM: HUD, panel de selección, marcadores, avisos, tutorial y pantallas (menú, ayuda, controles, fin). */
import { screen } from '../../matelabs/kit3d.js';
import { ACCENT, TOWERS, TOWER_ORDER, ENEMIES, MAPS, DIFFICULTY, PRIORITY_LABEL, TITAN } from './config.js';

const CSS = `
:root{--be:${ACCENT};--be2:#5ce1ff;--bebg:rgba(14,10,30,.8)}
html,body{margin:0;height:100%;overflow:hidden;background:#0d0a1a;overscroll-behavior:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.be-hud{position:fixed;inset:0;pointer-events:none;z-index:30;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#f2eeff}
.be-hud[hidden]{display:none}
.be-card{box-sizing:border-box;background:linear-gradient(180deg,rgba(24,18,46,.86),rgba(14,10,30,.76));border:1px solid rgba(143,123,255,.35);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.be-status{position:absolute;top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));padding:7px 10px;display:grid;gap:5px;width:200px}
.be-row{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.be-row .ic{width:18px;text-align:center}
.be-row b{font:400 17px/1 'Bungee',system-ui,sans-serif;letter-spacing:.02em}
.be-mrow{font-size:11px}
.be-row small{font-size:9px;letter-spacing:.18em;color:#b9b0e0;margin-left:auto}
.be-bar{position:relative;flex:1;height:10px;border-radius:6px;background:rgba(255,255,255,.1);overflow:hidden}
.be-bar i{position:absolute;inset:0;transform-origin:left;background:linear-gradient(90deg,#8f7bff,#d0c4ff);border-radius:6px;transition:transform .2s}
.be-bar.low i{background:linear-gradient(90deg,#ff3a5a,#ff9a7a)}
.be-gold b{color:#ffd23a}
.be-mis{position:absolute;top:calc(max(8px,env(safe-area-inset-top)) + 112px);left:max(8px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:3px;max-width:230px}
.be-mis span{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;background:rgba(10,8,22,.78);border:1px solid rgba(255,255,255,.14);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.be-mis span.p{border-color:rgba(255,210,58,.55)}
.be-mis span.done{background:rgba(30,100,50,.75);border-color:#6be38a}
.be-mis span.failed{opacity:.45;text-decoration:line-through}
.be-top{position:absolute;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;width:min(380px,calc(100vw - 470px));min-width:220px}
.be-wave{padding:6px 14px;text-align:center;font-size:12px;font-weight:800;letter-spacing:.06em}
.be-wave b{display:block;font:400 14px 'Bungee',system-ui,sans-serif;color:var(--be);letter-spacing:.08em}
.be-boss{width:100%;padding:6px 10px}
.be-boss[hidden]{display:none}
.be-boss .be-bar{height:10px}.be-boss .be-bar i{background:linear-gradient(90deg,var(--ph,#8fe0ff),#fff)}
.be-boss .t{display:flex;justify-content:space-between;font-size:10px;font-weight:800;letter-spacing:.12em;margin-bottom:4px;color:#ffd0d8}
.be-boss .t em{font-style:normal;color:var(--ph,#8fe0ff)}
.be-act{position:absolute;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));display:flex;gap:8px;pointer-events:auto}
.be-act button,.be-pbtn{appearance:none;border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(18,14,36,.85);color:#fff;font:800 13px system-ui,sans-serif;padding:10px 14px;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;gap:6px}
.be-act button:hover,.be-pbtn:hover:not(:disabled){border-color:var(--be);background:rgba(60,46,120,.85)}
.be-act button.go{background:linear-gradient(180deg,#9d8bff,#6a52f0);border-color:#c8bcff}
.be-act button.go.ready{animation:bepulse 1.2s infinite}
.be-act button:focus-visible,.be-pbtn:focus-visible,.be-pbtn.kf{outline:3px solid #fff;outline-offset:2px}
@keyframes bepulse{50%{box-shadow:0 0 0 6px rgba(143,123,255,.35)}}
.be-panel{position:absolute;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(560px,calc(100vw - 300px));min-width:300px;padding:10px 12px;pointer-events:auto;display:flex;flex-direction:column;gap:8px}
.be-panel[hidden]{display:none}
.be-ph{display:flex;align-items:center;gap:8px}
.be-ph h3{margin:0;font:400 15px 'Bungee',system-ui,sans-serif;letter-spacing:.04em;flex:1}
.be-ph h3 small{font:800 10px system-ui;letter-spacing:.16em;color:#b9b0e0;margin-left:6px}
.be-x{appearance:none;border:none;background:rgba(255,255,255,.1);color:#fff;width:34px;height:34px;border-radius:10px;font:800 16px system-ui;cursor:pointer}
.be-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.be-grid.three{grid-template-columns:repeat(3,1fr)}
.be-pbtn{flex-direction:column;justify-content:center;gap:2px;padding:8px 4px;min-height:58px;font-size:12px;text-align:center}
.be-pbtn .i{font-size:20px;line-height:1}
.be-pbtn .c{font:800 11px system-ui;color:#ffd23a}
.be-pbtn .k{font:700 9px system-ui;color:#9a90c8;letter-spacing:.06em}
.be-pbtn:disabled{opacity:.42;cursor:not-allowed}
.be-pbtn.poor .c{color:#ff7a7a}
.be-pbtn.sell .c{color:#7dffb0}
.be-desc{font-size:12px;color:#d6d0f2;line-height:1.35;min-height:2.7em}
.be-stats{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:#d6d0f2}
.be-stats b{color:#fff}
.be-tip{position:absolute;left:50%;top:calc(max(8px,env(safe-area-inset-top)) + 64px);transform:translateX(-50%);width:min(440px,calc(100vw - 24px));padding:10px 12px;display:flex;gap:10px;align-items:center;pointer-events:auto;z-index:2}
.be-tip[hidden],.be-hud.pan .be-tip{display:none}
.be-mrow{display:none!important}
.be-tip .n{font:400 18px 'Bungee',system-ui,sans-serif;color:var(--be);min-width:30px;text-align:center}
.be-tip p{margin:0;font-size:13px;line-height:1.35;flex:1;font-weight:600}
.be-tip p small{display:block;font-size:9px;font-weight:800;letter-spacing:.22em;color:#b9b0e0}
.be-tip button{appearance:none;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:8px 10px;font:800 11px system-ui;cursor:pointer;touch-action:manipulation;white-space:nowrap}
.be-banner{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .35s;width:min(720px,calc(100vw - 32px))}
.be-banner.on{opacity:1}
.be-banner small{display:block;font-size:11px;font-weight:800;letter-spacing:.32em;color:var(--be)}
.be-banner b{display:block;font:400 clamp(24px,5.4vw,46px)/1.05 'Bungee',system-ui,sans-serif;text-shadow:0 0 24px rgba(143,123,255,.6),0 4px 0 rgba(0,0,0,.4)}
.be-banner span{display:block;font-size:14px;font-weight:700;color:#e0dcf6;margin-top:6px;text-shadow:0 2px 6px #000}
.be-banner.boss b{color:#ffd0d8;text-shadow:0 0 30px rgba(255,60,90,.7),0 4px 0 rgba(0,0,0,.4)}
.be-mk{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:2px;will-change:transform;pointer-events:none}
.be-mk[hidden]{display:none}
.be-mk .b{font:800 11px system-ui;padding:2px 7px;border-radius:999px;background:rgba(10,8,22,.8);border:1px solid rgba(125,255,208,.6);white-space:nowrap;color:#d8fff0}
.be-mk.ready .b{background:#1d8a64;border-color:#9affd8;color:#fff;animation:bepulse 1s infinite}
.be-mk.dead .b{border-color:#ff6a6a;color:#ffb0b0}
.be-mk.lever .b{border-color:rgba(255,210,58,.7);color:#ffe8a0}
.be-mk.lever.lock .b{border-color:#ff5a5a;color:#ffb0b0}
.be-mk .hp{width:44px;height:5px;border-radius:3px;background:rgba(0,0,0,.6);overflow:hidden}
.be-mk .hp i{display:block;height:100%;background:#7dffd0;transform-origin:left}
.be-pop{position:absolute;left:0;top:0;font:900 13px system-ui;letter-spacing:.06em;white-space:nowrap;text-shadow:0 2px 4px #000,0 0 8px rgba(0,0,0,.6);pointer-events:none;opacity:0}
.be-pop.on{animation:bepop 1.1s ease-out forwards}
@keyframes bepop{0%{opacity:0;translate:-50% 0}15%{opacity:1}100%{opacity:0;translate:-50% -46px}}
.be-ret{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px;border:2px solid rgba(255,255,255,.8);border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.4)}
.be-ret::after{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px;background:#fff;border-radius:50%}
.be-ret[hidden]{display:none}
.be-keys{position:absolute;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));font-size:10.5px;font-weight:700;color:#c8c0ea;line-height:1.65;background:rgba(10,8,22,.55);padding:6px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.08)}
.be-keys kbd{font:800 10px system-ui;padding:0 4px;border-radius:4px;background:rgba(255,255,255,.14);color:#fff}
.be-move{position:absolute;left:50%;bottom:max(14px,env(safe-area-inset-bottom));transform:translateX(-50%);padding:8px 12px;display:flex;gap:10px;align-items:center;pointer-events:auto;font-size:13px;font-weight:700}
.be-move[hidden]{display:none}
.be-flash{position:fixed;inset:0;pointer-events:none;z-index:29;background:radial-gradient(120% 90% at 50% 50%,transparent 50%,rgba(255,40,80,.55));opacity:0;transition:opacity .3s}
.be-flash.on{opacity:1;transition:none}
/* pantallas */
.be-menu .k3-panel{width:min(620px,100%);gap:10px}
.be-menu h1{font-size:clamp(30px,7.4vw,56px)!important;line-height:.95!important}
.be-menu h1 span{color:var(--be);display:block}
.be-ml,.be-mr{display:flex;flex-direction:column;gap:10px;align-items:center;width:100%}
.be-maps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.be-maps button{appearance:none;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;padding:9px 6px;cursor:pointer;font:700 11px system-ui;display:flex;flex-direction:column;gap:3px;align-items:center;touch-action:manipulation}
.be-maps button b{font:400 11.5px 'Bungee',system-ui,sans-serif;letter-spacing:.03em}
.be-maps button .ic{font-size:22px}
.be-maps button[aria-pressed="true"]{border-color:var(--be);background:rgba(143,123,255,.2);box-shadow:0 0 0 1px var(--be) inset}
.be-maps button:disabled{opacity:.42;cursor:not-allowed}
.be-maps button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.be-blurb{font-size:12.5px!important;color:#cfc8ee!important;min-height:2.6em}
.be-dfx{font-size:11px;color:#b9b0e0;min-height:1.3em}
.be-camp{width:100%;font-size:12px;color:#d6d0f2;display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;background:rgba(0,0,0,.25);border-radius:10px;padding:7px 10px}
.be-credit{display:flex;align-items:center;gap:6px;font:400 11px 'Bungee',system-ui,sans-serif;letter-spacing:.16em;color:#d6d0f2}
.be-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(46,230,230,.55)}
.be-scr .k3-panel{width:min(640px,100%)}
.be-tbl{width:100%;border-collapse:collapse;font-size:12px;text-align:left}
.be-tbl td,.be-tbl th{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
.be-tbl th{font-size:10px;letter-spacing:.14em;color:#b9b0e0}
.be-h{font:400 13px 'Bungee',system-ui,sans-serif;letter-spacing:.08em;color:var(--be);margin:6px 0 0;align-self:flex-start}
.be-opt{width:100%;display:grid;gap:8px;text-align:left;font-size:13px}
.be-opt label,.be-opt .r{display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(255,255,255,.05);border-radius:10px;padding:8px 10px}
.be-opt input[type=range]{width:150px;accent-color:var(--be)}
.be-opt input[type=checkbox]{width:20px;height:20px;accent-color:var(--be)}
.be-opt select,.be-opt .bind{font:700 12px system-ui;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:6px 10px;cursor:pointer;min-width:88px}
.be-opt .bind.wait{border-color:var(--be);color:var(--be)}
.be-endstats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%}
.be-endstats div{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 4px;font-size:10px;font-weight:800;letter-spacing:.12em;color:#b9b0e0}
.be-endstats b{display:block;font:400 18px 'Bungee',system-ui,sans-serif;color:#fff;letter-spacing:0;margin-top:2px}
.be-endm{width:100%;text-align:left;font-size:12.5px;display:grid;gap:3px;background:rgba(0,0,0,.25);border-radius:10px;padding:8px 10px}
.be-rec{color:#ffd23a;font-weight:800;letter-spacing:.2em;font-size:12px}
.k3-touch .k3-btn{width:64px;height:64px;font-size:12px;letter-spacing:.02em;text-align:center;line-height:1.1}
.k3-touch .k3-btn[aria-label="wave"]{background:rgba(110,85,240,.6);border-color:#c8bcff}
@media (pointer:coarse){.be-keys{display:none}.be-act{display:none}}
@media (max-width:760px),(max-height:520px){.be-mis{display:none}.be-mrow{display:flex!important}}
@media (max-width:760px){
  .be-status{width:168px;padding:6px 8px;gap:3px}.be-row{font-size:12px}.be-row b{font-size:14px}
  .be-top{top:calc(max(8px,env(safe-area-inset-top)) + 46px);left:auto;right:max(8px,env(safe-area-inset-right));transform:none;width:auto;min-width:0;max-width:calc(100vw - 196px);align-items:flex-end}
  .be-wave{padding:5px 10px;font-size:11px}.be-wave b{font-size:12px}
  .be-boss{width:min(210px,calc(100vw - 196px))}
  .be-mis{top:calc(max(8px,env(safe-area-inset-top)) + 96px);max-width:170px}.be-mis span{font-size:9.5px;padding:2px 7px}
  .be-panel{width:calc(100vw - 16px);min-width:0;left:8px;right:8px;transform:none;padding:8px}
  .be-grid{gap:5px}.be-pbtn{min-height:54px;font-size:11px;padding:6px 2px}
  .be-tip{top:auto;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 168px)}
  .be-maps button{padding:7px 4px}.be-maps button b{font-size:10px}
  .be-endstats{grid-template-columns:repeat(2,1fr)}
}
@media (max-height:520px){
  .be-status{width:168px;padding:5px 8px;gap:2px}.be-row{font-size:11.5px}.be-row b{font-size:13px}
  .be-top{top:max(6px,env(safe-area-inset-top));left:50%;right:auto;transform:translateX(-50%);width:min(300px,calc(100vw - 420px));max-width:none;align-items:center}
  .be-mis{top:calc(max(6px,env(safe-area-inset-top)) + 84px);max-width:170px}.be-mis span{font-size:9px;padding:1px 6px}
  .be-panel{left:auto;right:auto;left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 200px));padding:7px 9px;gap:5px}
  .be-pbtn{min-height:48px}.be-desc{min-height:0;font-size:11px}
  .be-tip{top:auto;bottom:max(10px,env(safe-area-inset-bottom));width:min(380px,calc(100vw - 400px))}
  .be-menu .k3-panel{width:min(900px,100%);display:grid;grid-template-columns:1fr 1.25fr;gap:8px 20px;text-align:left;align-items:center}
  .be-menu .be-ml,.be-menu .be-mr{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
  .be-menu .be-mr{align-items:stretch}
  .be-menu h1{font-size:clamp(26px,5vw,40px)!important}
  .be-menu .k3-b{padding:11px 16px;font-size:13px}
  .be-camp{justify-content:flex-start}
  .be-banner{top:40%}
}
@media (pointer:coarse) and (max-height:520px){.be-panel{width:min(520px,calc(100vw - 340px));left:max(150px,env(safe-area-inset-left));transform:none}}
@media (prefers-reduced-motion:reduce){.be-banner,.be-flash{transition:none}.be-act button.go.ready,.be-mk.ready .b{animation:none}.be-pop.on{animation-duration:.01s;opacity:0}}
`;

const esc = s => String(s).replace(/[&<>"']/g, c => /** @type {any} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ROMAN = ['I', 'II', 'III'];
export const keyName = code => code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : ({ Space: 'Espacio', Enter: 'Enter', ShiftLeft: 'Shift', Backspace: '⌫', Tab: 'Tab' })[code] || code;

/** @param {{isTouch:boolean, on:(action:string, arg?:any)=>void}} o */
export function createUI(o) {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const hud = document.createElement('div'); hud.className = 'be-hud'; hud.hidden = true; hud.id = 'be-hud';
  hud.innerHTML = `
    <div class="be-status be-card" id="be-status">
      <div class="be-row" title="Cristal principal"><span class="ic">💎</span><div class="be-bar" id="be-cbar"><i></i></div><b id="be-chp">20</b></div>
      <div class="be-row be-gold"><span class="ic">💰</span><b id="be-gold">0</b><small>ESENCIA</small></div>
      <div class="be-row"><span class="ic">🌊</span><b id="be-wn">0/8</b><small id="be-sc">0 PTS</small></div>
      <div class="be-row be-mrow"><span class="ic">🎯</span><span id="be-mc">misiones</span></div>
    </div>
    <div class="be-mis" id="be-mis"></div>
    <div class="be-top"><div class="be-wave be-card" id="be-wave"><b>PREPARÁ LA DEFENSA</b><span></span></div>
      <div class="be-boss be-card" id="be-boss" hidden><div class="t"><span>TITÁN ELEMENTAL</span><em id="be-bph">FASE 1</em></div><div class="be-bar"><i></i></div></div></div>
    <div class="be-act" id="be-act"><button type="button" data-a="speed" title="Velocidad">⏩ x1</button><button type="button" class="go" data-a="wave">▶ OLEADA</button></div>
    <div class="be-keys" id="be-keys"></div>
    <div class="be-panel be-card" id="be-panel" hidden role="dialog" aria-label="Selección"></div>
    <div class="be-move be-card" id="be-move" hidden><span>Elegí una plataforma libre para reubicar la torre</span><button type="button" class="be-x" data-a="cancelMove" aria-label="Cancelar">✕</button></div>
    <div class="be-tip be-card" id="be-tip" hidden><span class="n">1</span><p></p><button type="button" data-t="ok">OK</button><button type="button" data-t="skip">Saltar tutorial</button></div>
    <div class="be-banner" id="be-banner"><small></small><b></b><span></span></div>
    <div id="be-marks"></div><div id="be-pops"></div>
    <div class="be-ret" id="be-ret" hidden></div>`;
  document.body.appendChild(hud);
  const flash = document.createElement('div'); flash.className = 'be-flash'; document.body.appendChild(flash);
  const $ = sel => /** @type {HTMLElement} */ (hud.querySelector(sel));
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'wheel']) {
    for (const sel of ['#be-panel', '#be-tip', '#be-act', '#be-move']) $(sel).addEventListener(t, e => e.stopPropagation(), { passive: true });
  }
  hud.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-a],[data-t]');
    if (!b || /** @type {any} */ (b).disabled) return;
    if (b.hasAttribute('data-t')) { o.on(b.getAttribute('data-t') === 'skip' ? 'tutSkip' : 'tutOk'); return; }
    o.on(/** @type {string} */ (b.getAttribute('data-a')), b.getAttribute('data-v'));
  });

  /* ---------- HUD ---------- */
  let lastHud = '';
  function setHud(s) {
    const key = [s.crystal, s.crystalMax, s.gold, s.wave, s.waves, s.score, s.waveText, s.waveSub, s.speed, s.canCall, s.callLabel].join('|');
    if (key === lastHud) return;
    lastHud = key;
    $('#be-chp').textContent = String(Math.max(0, Math.ceil(s.crystal)));
    const cb = $('#be-cbar'); /** @type {HTMLElement} */ (cb.firstElementChild).style.transform = `scaleX(${Math.max(0, s.crystal / s.crystalMax)})`;
    cb.classList.toggle('low', s.crystal / s.crystalMax < 0.35);
    $('#be-gold').textContent = String(s.gold);
    $('#be-wn').textContent = `${s.wave}/${s.waves}`;
    $('#be-sc').textContent = `${s.score} PTS`;
    const w = $('#be-wave'); /** @type {HTMLElement} */ (w.firstElementChild).textContent = s.waveText; /** @type {HTMLElement} */ (w.lastElementChild).textContent = s.waveSub;
    const sp = /** @type {HTMLButtonElement} */ ($('#be-act [data-a="speed"]')); sp.textContent = s.speed > 1 ? '⏩ x2' : '▶ x1';
    const go = /** @type {HTMLButtonElement} */ ($('#be-act [data-a="wave"]')); go.disabled = !s.canCall; go.textContent = s.callLabel; go.classList.toggle('ready', s.canCall);
    go.style.opacity = s.canCall ? '1' : '.5';
    const tw = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="wave"]'));
    if (tw) { tw.textContent = s.canCall ? (s.callShort || '▶▶') : '…'; tw.style.opacity = s.canCall ? '1' : '.45'; }
    const ts = /** @type {HTMLElement|null} */ (document.querySelector('.k3-btn[aria-label="speed"]'));
    if (ts) ts.textContent = s.speed > 1 ? 'x2' : 'x1';
  }
  function setMissions(list) {
    const done = list.filter(m => m.status === 'done').length, failed = list.filter(m => m.status === 'failed').length;
    $('#be-mc').textContent = `Misiones ${done}/${list.length}${failed ? ` · ${failed} ✖` : ''}`;
    $('#be-mis').innerHTML = list.map(m => `<span class="${m.kind === 'primary' ? 'p' : ''} ${m.status}" title="${esc(m.title)}">${m.status === 'done' ? '✔' : m.status === 'failed' ? '✖' : m.kind === 'primary' ? '★' : '◆'} ${esc(m.title)}${m.target > 1 && m.status === 'active' ? ` ${Math.floor(Math.min(m.progress, m.target))}/${m.target}` : ''}</span>`).join('');
  }
  function setBoss(info) {
    const b = $('#be-boss');
    b.hidden = !info || !info.active;
    if (!info || !info.active) return;
    const ph = TITAN.phases[info.phase - 1];
    b.style.setProperty('--ph', '#' + ph.color.toString(16).padStart(6, '0'));
    $('#be-bph').textContent = info.transition ? 'CAMBIANDO…' : `F${info.phase} · INMUNE ${info.immune.toUpperCase()}`;
    /** @type {HTMLElement} */ (b.querySelector('.be-bar i')).style.transform = `scaleX(${info.hp / info.max})`;
  }
  function setKeys(binds) {
    $('#be-keys').innerHTML = `<kbd>clic</kbd> elegir · <kbd>arrastrar</kbd>/<kbd>WASD</kbd> mover · <kbd>rueda</kbd> zoom · <kbd>Q</kbd><kbd>E</kbd> girar<br>` +
      `<kbd>1-4</kbd> torre · <kbd>${keyName(binds.upgrade)}</kbd> mejorar · <kbd>${keyName(binds.sell)}</kbd> vender · <kbd>${keyName(binds.wave)}</kbd> oleada · <kbd>${keyName(binds.speed)}</kbd> velocidad`;
  }

  /* ---------- panel ---------- */
  const panel = $('#be-panel');
  let panelKind = '';
  function towerButtons(gold, banned) {
    return TOWER_ORDER.map((k, i) => {
      const T = /** @type {any} */ (TOWERS)[k], c = T.lv[0].cost, poor = gold < c;
      return `<button type="button" class="be-pbtn ${poor ? 'poor' : ''}" data-a="build" data-v="${k}" data-desc="${esc(T.desc)}" ${banned === k ? 'disabled' : ''} aria-label="Construir ${T.name} (${c})"><span class="i">${T.icon}</span>${T.name}<span class="c">💰 ${c}</span><span class="k">${o.isTouch ? '' : 'tecla ' + (i + 1)}</span></button>`;
    }).join('');
  }
  /** @param {string} kind @param {any} d */
  function showPanel(kind, d) {
    panelKind = kind;
    let h = '';
    if (kind === 'pad') {
      h = `<div class="be-ph"><h3>Plataforma<small>CONSTRUIR</small></h3><button type="button" class="be-x" data-a="close" aria-label="Cerrar">✕</button></div>
        <div class="be-grid">${towerButtons(d.gold)}</div><div class="be-desc">${o.isTouch ? 'Tocá una torre para construirla.' : 'Elegí una torre (1-4). Pasá el mouse para ver su descripción.'}</div>`;
    } else if (kind === 'tower') {
      const t = d.tower, T = t.def, s = T.lv[t.lv];
      const up = t.lv < 2 ? T.lv[t.lv + 1].cost : 0;
      const extra = t.type === 'fuego' ? `Área <b>${s.splash}</b> · Quema <b>${s.burn}/s</b>` : t.type === 'hielo' ? `Frena <b>${Math.round(s.slow * 100)}%</b> · Congela cada <b>${s.freezeEvery}</b>` : t.type === 'rayo' ? `Cadena <b>${s.chain}</b>${s.stun ? ' · Aturde' : ''}` : `Aire <b>×1.5</b>${s.multi ? ' · Doble virote' : ''}`;
      h = `<div class="be-ph"><h3>${T.icon} ${T.name} ${ROMAN[t.lv]}<small>${t.kills} BAJAS</small></h3><button type="button" class="be-x" data-a="close" aria-label="Cerrar">✕</button></div>
        <div class="be-stats"><span>Daño <b>${s.dmg}</b></span><span>Cadencia <b>${s.rate}/s</b></span><span>Alcance <b>${s.range}</b></span><span>${extra}</span>${t.frozenT > 0 ? '<span style="color:#9ae0ff">❄ congelada</span>' : ''}${t.stunT > 0 ? '<span style="color:#ffe14a">⚡ aturdida</span>' : ''}</div>
        <div class="be-grid">
          <button type="button" class="be-pbtn ${d.gold < up ? 'poor' : ''}" data-a="upgrade" ${t.lv >= 2 ? 'disabled' : ''} aria-label="Mejorar"><span class="i">⬆️</span>${t.lv >= 2 ? 'MÁXIMO' : 'Mejorar a ' + ROMAN[t.lv + 1]}<span class="c">${t.lv >= 2 ? '' : '💰 ' + up}</span><span class="k">${o.isTouch ? '' : keyName(d.binds.upgrade)}</span></button>
          <button type="button" class="be-pbtn sell" data-a="sell" aria-label="Vender"><span class="i">💰</span>Vender<span class="c">+${d.sell}</span><span class="k">${o.isTouch ? '' : keyName(d.binds.sell)}</span></button>
          <button type="button" class="be-pbtn" data-a="move" ${d.moves <= 0 ? 'disabled' : ''} aria-label="Reubicar"><span class="i">↔️</span>Reubicar<span class="c" style="color:#c8bcff">${d.moves} restantes</span><span class="k">${o.isTouch ? '' : 'R'}</span></button>
          <button type="button" class="be-pbtn" data-a="prio" aria-label="Prioridad"><span class="i">🎯</span>Apunta a<span class="c" style="color:#fff">${/** @type {any} */ (PRIORITY_LABEL)[t.prio]}</span></button>
        </div>`;
    } else if (kind === 'aux') {
      const a = d.aux;
      h = `<div class="be-ph"><h3>💠 Cristal auxiliar<small>${a.alive ? Math.ceil(a.hp) + '/' + a.max + ' VIDA' : 'DESTRUIDO'}</small></h3><button type="button" class="be-x" data-a="close" aria-label="Cerrar">✕</button></div>
        <div class="be-desc">${a.alive ? `Genera esencia: cuando brilla, tocalo para cosechar. Carga ${Math.floor(a.charge * 100)}%. Los enemigos que pasan cerca lo drenan; los imps lo atacan.` : 'Se rompió. Podés restaurarlo para que vuelva a producir (la misión de salvarlos ya no cuenta).'}</div>
        <div class="be-grid three">
          <button type="button" class="be-pbtn" data-a="harvest" ${a.alive && a.charge >= 1 ? '' : 'disabled'}><span class="i">✨</span>Cosechar<span class="c">+${d.harvest}</span></button>
          <button type="button" class="be-pbtn ${d.gold < 20 ? 'poor' : ''}" data-a="repair" ${a.alive && a.hp < a.max ? '' : 'disabled'}><span class="i">🛠️</span>Reparar<span class="c">💰 20</span></button>
          <button type="button" class="be-pbtn ${d.gold < 80 ? 'poor' : ''}" data-a="restore" ${a.alive ? 'disabled' : ''}><span class="i">♻️</span>Restaurar<span class="c">💰 80</span></button>
        </div>`;
    } else if (kind === 'crystal') {
      h = `<div class="be-ph"><h3>💎 Cristal principal<small>${Math.ceil(d.hp)}/${d.max}</small></h3><button type="button" class="be-x" data-a="close" aria-label="Cerrar">✕</button></div>
        <div class="be-desc">Si llega a cero, perdés. Cada enemigo que lo alcanza le saca vida (los grandes, más). El Titán lo destruye de un golpe: frenalo antes.</div>`;
    }
    panel.innerHTML = h;
    panel.hidden = false; hud.classList.add('pan');
    panel.querySelectorAll('[data-desc]').forEach(b => {
      const show = () => { const dd = panel.querySelector('.be-desc'); if (dd) dd.textContent = /** @type {HTMLElement} */ (b).dataset.desc || ''; };
      b.addEventListener('pointerenter', show); b.addEventListener('focus', show);
    });
  }
  function hidePanel() { panel.hidden = true; panelKind = ''; panel.innerHTML = ''; hud.classList.remove('pan'); }
  /** Navegación por teclado/gamepad dentro del panel. @param {number} dir */
  function panelNav(dir) {
    const bs = /** @type {HTMLButtonElement[]} */ ([...panel.querySelectorAll('button.be-pbtn')]);
    if (!bs.length) return;
    let i = bs.findIndex(b => b.classList.contains('kf'));
    bs.forEach(b => b.classList.remove('kf'));
    i = (i + dir + bs.length) % bs.length;
    bs[i].classList.add('kf');
    const dd = panel.querySelector('.be-desc'); if (dd && bs[i].dataset.desc) dd.textContent = bs[i].dataset.desc || '';
  }
  function panelActivate() { const b = /** @type {HTMLButtonElement|null} */ (panel.querySelector('button.be-pbtn.kf')); if (b && !b.disabled) { b.click(); return true; } return false; }

  /* ---------- marcadores, avisos ---------- */
  const marks = $('#be-marks');
  /** @type {Map<string, HTMLElement>} */ const markEls = new Map();
  function mark(id, x, y, visible, html, cls) {
    let el = markEls.get(id);
    if (!el) { el = document.createElement('div'); el.className = 'be-mk'; marks.appendChild(el); markEls.set(id, el); }
    el.hidden = !visible;
    if (!visible) return;
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    if (el.dataset.c !== cls) { el.className = 'be-mk ' + cls; el.dataset.c = cls; }
    el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
  }
  function clearMarks() { markEls.forEach(e => e.remove()); markEls.clear(); }
  const pops = Array.from({ length: 12 }, () => { const e = document.createElement('div'); e.className = 'be-pop'; $('#be-pops').appendChild(e); return e; });
  let popI = 0;
  function popup(x, y, text, color) {
    const e = pops[popI = (popI + 1) % pops.length];
    e.classList.remove('on'); void e.offsetWidth;
    e.textContent = text; e.style.color = color || '#fff'; e.style.left = x + 'px'; e.style.top = y + 'px';
    e.classList.add('on');
  }
  let bannerT = 0;
  function banner(kicker, title, sub = '', boss = false, ms = 2400) {
    const b = $('#be-banner');
    /** @type {HTMLElement} */ (b.children[0]).textContent = kicker; /** @type {HTMLElement} */ (b.children[1]).textContent = title; /** @type {HTMLElement} */ (b.children[2]).textContent = sub;
    b.classList.toggle('boss', boss); b.classList.add('on');
    clearTimeout(bannerT); bannerT = window.setTimeout(() => b.classList.remove('on'), ms);
  }
  let flashT = 0;
  function hurtFlash() { flash.classList.add('on'); clearTimeout(flashT); flashT = window.setTimeout(() => flash.classList.remove('on'), 120); }

  /* ---------- tutorial ---------- */
  function tip(n, total, text) {
    const t = $('#be-tip');
    if (!text) { t.hidden = true; return; }
    /** @type {HTMLElement} */ (t.querySelector('.n')).textContent = `${n}/${total}`;
    /** @type {HTMLElement} */ (t.querySelector('p')).innerHTML = `<small>TUTORIAL</small>${text}`;
    t.hidden = false;
  }

  /* ---------- pantallas ---------- */
  const menu = screen('', { accent: ACCENT, id: 'be-menu' }); menu.el.classList.add('be-menu'); menu.hide();
  const help = screen('', { accent: ACCENT, id: 'be-help' }); help.el.classList.add('be-scr'); help.hide();
  const opts = screen('', { accent: ACCENT, id: 'be-opts' }); opts.el.classList.add('be-scr'); opts.hide();
  const end = screen('', { accent: ACCENT, id: 'be-end' }); end.el.classList.add('be-scr'); end.hide();
  for (const s of [menu, help, opts, end]) s.el.addEventListener('click', e => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-m]');
    if (b && !/** @type {any} */ (b).disabled) o.on('m:' + b.getAttribute('data-m'), b.getAttribute('data-v'));
  });

  /** @param {any} d */
  function showMenu(d) {
    const map = MAPS[d.map];
    const cp = d.checkpoint && d.checkpoint.map === d.map ? d.checkpoint : null;
    menu.show(`
      <div class="be-ml">
        <span class="k3-kicker">TOWER DEFENSE 3D · ESTRATEGIA</span>
        <h1>BASTIONES <span>ELEMENTALES</span></h1>
        <p class="be-blurb">${esc(map.blurb)}</p>
        <div class="be-camp" id="be-camp">${d.camp}</div>
        <div class="be-credit"><img src="matelabs/favicon.png" alt="" width="22" height="22"> CREADO POR MATELABS</div>
      </div>
      <div class="be-mr">
        <div class="be-maps" role="group" aria-label="Escenario">${MAPS.map((m, i) => `<button type="button" data-m="map" data-v="${i}" aria-pressed="${i === d.map}" ${i < d.unlocked ? '' : 'disabled'}><span class="ic">${i < d.unlocked ? m.icon : '🔒'}</span><b>${esc(m.name)}</b><span>${d.best[i] ? (d.best[i].won ? '✔ superado' : 'récord: oleada ' + d.best[i].waves) : m.waves.length + ' oleadas'}</span></button>`).join('')}</div>
        <div id="be-diff"></div>
        <div class="be-dfx" id="be-dfx"></div>
        <div class="k3-btnrow">${cp ? `<button type="button" class="k3-b" data-m="continue" data-go>Continuar · oleada ${cp.wave + 1}</button><button type="button" class="k3-b alt" data-m="play">Nueva partida</button>` : `<button type="button" class="k3-b" data-m="play" data-go>Defender ${esc(map.name)}</button>`}</div>
        <div class="k3-btnrow"><button type="button" class="k3-b alt" data-m="help">Cómo jugar</button><button type="button" class="k3-b alt" data-m="opts">Controles</button></div>
      </div>`);
    const MM = /** @type {any} */ (window).MLMissions;
    if (MM) MM.difficultyPicker(/** @type {HTMLElement} */ (menu.el.querySelector('#be-diff')), { onChange: () => o.on('m:diff') });
    diffText();
  }
  function diffText() {
    const MM = /** @type {any} */ (window).MLMissions;
    const D = /** @type {any} */ (DIFFICULTY)[MM ? MM.difficulty() : 'normal'] || DIFFICULTY.normal;
    const el = menu.el.querySelector('#be-dfx');
    if (el) el.textContent = `Cristal ${D.crystal} · Vida enemiga ×${D.hp} · Esencia inicial ${D.gold} · Reubicaciones ${D.moves} · Pausa ${D.between} s`;
  }

  function showHelp(d) {
    const ctl = [
      ['Elegir / construir', 'Clic izquierdo', 'Tocar', 'A (retícula central)'],
      ['Mover cámara', 'Arrastrar · WASD / flechas', 'Arrastrar un dedo', 'Stick izquierdo'],
      ['Zoom', 'Rueda · Z / C', 'Pellizcar', 'LT / RT'],
      ['Girar cámara', 'Clic derecho + arrastrar · Q / E', 'Girar con dos dedos · ⟲ ⟳', 'LB / RB'],
      ['Torres', '1 Ballesta · 2 Fuego · 3 Hielo · 4 Rayo', 'Botones del panel', '◀ ▶ en el panel + A'],
      ['Mejorar · Vender · Reubicar', `${keyName(d.binds.upgrade)} · ${keyName(d.binds.sell)} · R`, 'Botones del panel', 'X mejorar · ◀ ▶ + A'],
      ['Llamar oleada · Velocidad', `${keyName(d.binds.wave)} · ${keyName(d.binds.speed)}`, '▶▶ · x2', 'Y · Select'],
      ['Cerrar panel · Pausa', 'Clic fuera · Esc / P', '✕ · ⏸', 'B · Start'],
    ];
    help.show(`<span class="k3-kicker">CÓMO JUGAR</span><h1 style="font-size:clamp(24px,6vw,40px)">DEFENDÉ EL CRISTAL</h1>
      <p>Construí torres en las plataformas ◇, frená las oleadas y no dejes que lleguen al cristal 💎. Superá todas las oleadas de un escenario para desbloquear el siguiente. En el Valle del Trueno espera el <b>Titán Elemental</b>.</p>
      <div class="be-h">CONTROLES</div>
      <table class="be-tbl"><tr><th></th><th>PC</th><th>TÁCTIL</th><th>GAMEPAD</th></tr>${ctl.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}</table>
      <div class="be-h">TORRES</div>
      <table class="be-tbl">${TOWER_ORDER.map(k => { const T = /** @type {any} */ (TOWERS)[k]; return `<tr><td>${T.icon} <b>${T.name}</b></td><td>${esc(T.desc)}</td><td>💰${T.lv[0].cost}</td></tr>`; }).join('')}</table>
      <div class="be-h">SINERGIAS</div>
      <table class="be-tbl"><tr><td>🔥+❄️ <b>Choque térmico</b></td><td>Fuego sobre un enemigo frenado (o hielo sobre uno en llamas): daño extra y le rompe la armadura 4.5 s.</td></tr>
      <tr><td>❄️+⚡ <b>Conducción</b></td><td>Rayo sobre un enemigo frenado o congelado: ×1.6 de daño y un salto más de cadena.</td></tr>
      <tr><td>🔥+⚡ <b>Sobrecarga</b></td><td>Rayo sobre un enemigo en llamas: explota y daña a los de alrededor.</td></tr></table>
      <div class="be-h">ENEMIGOS</div>
      <table class="be-tbl">${Object.values(ENEMIES).map(e => `<tr><td><b>${e.name}</b><br><small>${e.armor}</small></td><td>${esc(e.tip)}</td></tr>`).join('')}
      <tr><td><b>Titán Elemental</b></td><td>3 fases: inmune al hielo → al fuego (fuerza los puentes y bloquea las palancas) → al rayo (pulso que aturde torres; anillo amarillo). Antes de cada cambio se detiene y avisa.</td></tr></table>
      <div class="be-h">MAPA INTERACTIVO</div>
      <p style="text-align:left">⚙ <b>Palancas</b>: tocá una palanca para girar su puente y cambiar la ruta de los enemigos (enfriamiento 10 s; no funciona con enemigos encima). 💠 <b>Cristales auxiliares</b>: tocá los que brillan para cosechar esencia. ↔️ <b>Reubicar</b>: mové una torre a otra plataforma (cantidad limitada por escenario).</p>
      <div class="k3-btnrow"><button type="button" class="k3-b" data-m="closeHelp">Entendido</button><button type="button" class="k3-b alt" data-m="retut">Repetir tutorial</button></div>`);
  }

  function showOpts(d) {
    const s = d.settings;
    const bind = (k, label) => `<div class="r"><span>${label}</span><button type="button" class="bind" data-m="bind" data-v="${k}">${keyName(s.binds[k])}</button></div>`;
    opts.show(`<span class="k3-kicker">CONTROLES Y OPCIONES</span><h1 style="font-size:clamp(24px,6vw,40px)">CONTROLES</h1>
      <div class="be-opt">
        <label>Sensibilidad de cámara <input type="range" min="0.5" max="2" step="0.1" value="${s.pan}" data-o="pan"></label>
        <label>Velocidad de zoom <input type="range" min="0.5" max="2" step="0.1" value="${s.zoom}" data-o="zoom"></label>
        <label>Invertir arrastre <input type="checkbox" data-o="invert" ${s.invert ? 'checked' : ''}></label>
        <label>Movimiento reducido (sin sacudidas ni destellos) <select data-o="motion"><option value="auto" ${s.motion === 'auto' ? 'selected' : ''}>Auto</option><option value="on" ${s.motion === 'on' ? 'selected' : ''}>Sí</option><option value="off" ${s.motion === 'off' ? 'selected' : ''}>No</option></select></label>
        <label>Mostrar alcance de todas las torres <input type="checkbox" data-o="ranges" ${s.ranges ? 'checked' : ''}></label>
        ${bind('wave', 'Llamar oleada')}${bind('speed', 'Velocidad x1/x2')}${bind('upgrade', 'Mejorar torre')}${bind('sell', 'Vender torre')}
      </div>
      <div class="be-h">GAMEPAD</div>
      <table class="be-tbl"><tr><td>Stick / cruceta</td><td>mover cámara (o elegir en el panel)</td></tr><tr><td>A</td><td>elegir lo que está bajo la retícula / confirmar</td></tr><tr><td>B</td><td>cerrar panel</td></tr><tr><td>X</td><td>mejorar</td></tr><tr><td>Y</td><td>llamar oleada</td></tr><tr><td>LB / RB</td><td>girar cámara</td></tr><tr><td>LT / RT</td><td>zoom</td></tr><tr><td>Select · Start</td><td>velocidad · pausa</td></tr></table>
      <p style="font-size:12px">Sonido y calidad gráfica: botón ⚙/⏸ de la barra superior.</p>
      <div class="k3-btnrow"><button type="button" class="k3-b" data-m="closeOpts">Listo</button><button type="button" class="k3-b alt" data-m="resetBinds">Teclas por defecto</button></div>`);
    opts.el.querySelectorAll('[data-o]').forEach(inp => inp.addEventListener('change', () => {
      const el = /** @type {HTMLInputElement} */ (inp), k = el.dataset.o;
      o.on('opt', { k, v: el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value });
    }));
  }

  /** @param {any} d */
  function showEnd(d) {
    const title = d.won ? (d.final ? '¡TITÁN DETENIDO!' : '¡BASTIÓN ASEGURADO!') : 'EL CRISTAL CAYÓ';
    end.show(`<span class="k3-kicker">${esc(d.mapName.toUpperCase())} · ${d.won ? 'VICTORIA' : 'DERROTA'}</span>
      <h1 style="font-size:clamp(28px,7vw,52px)">${title}</h1>
      <p>${d.won ? (d.final ? 'El Valle del Trueno vuelve a la calma. Recompensa: +' + TITAN.score + ' puntos y la Corona Elemental sobre tu cristal.' : 'Todas las oleadas fueron rechazadas. ¡El siguiente escenario te espera!') : `Resististe ${d.wavesDone} de ${d.waves} oleadas. Probá otra combinación de torres o desviá la ruta con las palancas.`}</p>
      ${d.record ? '<div class="be-rec">★ NUEVO RÉCORD ★</div>' : ''}
      <div class="be-endstats"><div>PUNTOS<b>${d.score}</b></div><div>OLEADAS<b>${d.wavesDone}/${d.waves}</b></div><div>BAJAS<b>${d.kills}</b></div><div>CRISTAL<b>${Math.max(0, Math.ceil(d.crystal))}</b></div></div>
      <div class="be-endm">${d.missions.map(m => `<div>${m.status === 'done' ? '✅' : m.status === 'failed' ? '❌' : '⬜'} ${esc(m.title)}</div>`).join('')}</div>
      <div class="k3-btnrow">${d.won && d.next ? `<button type="button" class="k3-b" data-m="next" data-retry>Siguiente: ${esc(d.next)}</button>` : ''}<button type="button" class="k3-b ${d.won && d.next ? 'alt' : ''}" data-m="retry" ${d.won && d.next ? '' : 'data-retry'}>Reintentar</button><button type="button" class="k3-b alt" data-m="menu">Menú</button></div>`);
  }

  return {
    hud, menu, help, opts, end, setHud, setMissions, setBoss, setKeys, showPanel, hidePanel, panelNav, panelActivate,
    get panelKind() { return panelKind; }, get panelOpen() { return !panel.hidden; },
    mark, clearMarks, popup, banner, hurtFlash, tip, showMenu, diffText, showHelp, showOpts, showEnd,
    setMove(on) { $('#be-move').hidden = !on; },
    setReticle(on) { $('#be-ret').hidden = !on; },
    show(on) { hud.hidden = !on; },
  };
}
