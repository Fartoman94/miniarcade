// @ts-check
/* HUD de cabina (DOM), marcadores en el espacio, radar, tutorial y pantallas del juego. */
import { screen } from '../../matelabs/kit3d.js';
import { ACCENT, SECTORS, DIFFICULTY, MISSIONS } from './config.js';

const CSS = `
:root{--ge:${ACCENT}}
html,body{margin:0;height:100%;overflow:hidden;background:#020409;overscroll-behavior:none;-webkit-tap-highlight-color:transparent}
.ge-hud{position:fixed;inset:0;pointer-events:none;z-index:30;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#eaf6ff}
.ge-hud[hidden]{display:none}
.ge-panel{background:linear-gradient(180deg,rgba(6,14,24,.78),rgba(6,12,20,.55));border:1px solid rgba(255,177,59,.28);border-radius:12px;
  box-shadow:0 0 0 1px rgba(0,0,0,.25),0 8px 24px rgba(0,0,0,.35);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.ge-status{position:absolute;top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));width:206px;padding:8px 10px 9px;display:grid;gap:5px}
.ge-score{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.ge-score b{font:400 20px/1 'Bungee',system-ui,sans-serif;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.ge-score small,.ge-lbl{font-size:9px;font-weight:800;letter-spacing:.2em;color:#9fb6c8}
.ge-bar{position:relative;height:9px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden}
.ge-bar i{position:absolute;inset:0;transform-origin:left;border-radius:5px}
.ge-row{display:grid;grid-template-columns:52px 1fr;align-items:center;gap:6px}
.ge-sh i{background:linear-gradient(90deg,#3fc8ff,#9ff0ff)}
.ge-hu i{background:linear-gradient(90deg,#ff8a2a,var(--ge))}
.ge-hu.low i{background:linear-gradient(90deg,#ff3040,#ff7a5a)}
.ge-mini{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ge-mini .ge-bar{height:5px}
.ge-bo i{background:#c8a6ff}.ge-en i{background:#7dffb0}
.ge-wpn{display:flex;gap:6px;font-size:10px;font-weight:800;letter-spacing:.06em;color:#cfe3f2}
.ge-wpn span{padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.08)}
.ge-wpn em{font-style:normal;color:var(--ge)}
.ge-obj{position:absolute;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(380px,calc(100vw - 460px));min-width:250px;padding:7px 12px 8px;text-align:center}
.ge-obj .ge-sec{font:400 11px 'Bungee',system-ui,sans-serif;letter-spacing:.12em;color:var(--ge)}
.ge-obj .ge-goal{font-size:13px;font-weight:700;line-height:1.3;margin-top:2px}
.ge-obj .ge-prog{font-size:11px;color:#bcd3e3;margin-top:2px;font-variant-numeric:tabular-nums}
.ge-sm{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:5px}
.ge-sm span{font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);white-space:nowrap}
.ge-sm span.done{background:rgba(40,140,70,.55);border-color:#6be38a}
.ge-sm span.failed{opacity:.45;text-decoration:line-through}
.ge-boss{margin-top:6px}
.ge-boss[hidden]{display:none}
.ge-boss .ge-bar{height:8px}.ge-boss .ge-bar i{background:linear-gradient(90deg,#ff3a4a,#ff9a5a)}
.ge-boss .ge-lbl{color:#ff9aa4}
.ge-radar{position:absolute;top:calc(max(6px,env(safe-area-inset-top)) + 44px);right:max(8px,env(safe-area-inset-right));width:104px;height:104px;border-radius:50%;
  background:radial-gradient(circle,rgba(10,30,40,.75),rgba(4,12,18,.8));border:1px solid rgba(255,177,59,.35)}
.ge-ret{position:absolute;left:0;top:0;width:46px;height:46px;margin:-23px 0 0 -23px;will-change:transform}
.ge-lead{position:absolute;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #ff5a5a;transform-origin:center;will-change:transform}
.ge-lead::after{content:"";position:absolute;inset:4px;background:#ff5a5a;border-radius:1px}
.ge-lead.ok{border-color:#7dffb0}.ge-lead.ok::after{background:#7dffb0}
.ge-tgt{position:absolute;left:0;top:0;will-change:transform}
.ge-tgt i{position:absolute;width:12px;height:12px;border:2px solid #ff6a6a}
.ge-tgt i:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}.ge-tgt i:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
.ge-tgt i:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}.ge-tgt i:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
.ge-tgt b{position:absolute;left:0;right:0;bottom:-10px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden}
.ge-tgt b u{position:absolute;inset:0;background:#ff6a6a;transform-origin:left}
.ge-tgt span{position:absolute;left:50%;top:-16px;transform:translateX(-50%);font-size:10px;font-weight:800;letter-spacing:.08em;color:#ffb0b0;white-space:nowrap}
.ge-mk{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:1px;will-change:transform;font-weight:800}
.ge-mk .ic{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:13px;background:rgba(4,10,18,.7);border:2px solid currentColor;line-height:1}
.ge-mk .d{font-size:9px;letter-spacing:.06em;color:#dfeefa;text-shadow:0 1px 3px #000;white-space:nowrap}
.ge-mk[hidden]{display:none}.ge-mk.edge .ic{border-style:dashed}
.ge-mk .ar{position:absolute;left:50%;top:50%;width:0;height:0;margin:-6px 0 0 -6px;border:6px solid transparent;border-left:9px solid currentColor;transform-origin:6px 6px}
.ge-scan{position:absolute;left:0;top:0;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;
  background:conic-gradient(var(--ge) calc(var(--p,0)*1turn),rgba(255,255,255,.12) 0);-webkit-mask:radial-gradient(closest-side,transparent 80%,#000 82%);mask:radial-gradient(closest-side,transparent 80%,#000 82%)}
.ge-hint{position:absolute;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));padding:8px 14px;border-radius:12px;
  background:rgba(6,12,20,.82);border:1px solid rgba(255,177,59,.4);font-size:13px;font-weight:700;text-align:center;opacity:0;transition:opacity .25s}
.ge-hint.on{opacity:1}
.ge-banner{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .35s;width:min(720px,calc(100vw - 32px))}
.ge-banner.on{opacity:1}
.ge-banner small{display:block;font-size:11px;font-weight:800;letter-spacing:.32em;color:var(--ge)}
.ge-banner b{display:block;font:400 clamp(24px,5.4vw,46px)/1.05 'Bungee',system-ui,sans-serif;text-shadow:0 0 24px rgba(255,140,40,.55),0 4px 0 rgba(0,0,0,.4)}
.ge-banner span{display:block;font-size:14px;font-weight:700;color:#d6e7f3;margin-top:6px}
.ge-banner.boss b{color:#ffb0b0;text-shadow:0 0 30px rgba(255,40,60,.7),0 4px 0 rgba(0,0,0,.4)}
.ge-vig{position:fixed;inset:0;pointer-events:none;z-index:29;opacity:0;background:radial-gradient(120% 90% at 50% 50%,transparent 55%,rgba(255,30,40,.55))}
.ge-warp{position:fixed;inset:0;pointer-events:none;z-index:29;opacity:0;background:radial-gradient(60% 60% at 50% 50%,rgba(255,255,255,.0),rgba(160,220,255,.5));transition:opacity .4s}
.ge-keys{position:absolute;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));font-size:10px;font-weight:700;color:#9fb6c8;letter-spacing:.04em;line-height:1.6;
  background:rgba(4,10,16,.5);padding:6px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.08)}
.ge-keys kbd{font:800 10px system-ui;padding:0 4px;border-radius:4px;background:rgba(255,255,255,.12);color:#fff}
.ge-wm{position:absolute;right:max(10px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));font:400 9px 'Bungee',system-ui,sans-serif;letter-spacing:.18em;color:rgba(255,255,255,.35)}
.ge-tut{position:fixed;left:50%;bottom:max(70px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:41;width:min(460px,calc(100vw - 24px));pointer-events:auto;
  padding:10px 12px;display:flex;gap:10px;align-items:center;font-family:system-ui,sans-serif;color:#fff}
.ge-tut[hidden]{display:none}
.ge-tut .st{font:400 18px 'Bungee',system-ui,sans-serif;color:var(--ge);min-width:34px;text-align:center}
.ge-tut p{margin:0;font-size:13px;line-height:1.35;flex:1}
.ge-tut p small{display:block;font-size:9px;font-weight:800;letter-spacing:.22em;color:#9fb6c8}
.ge-tut button{appearance:none;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:8px 10px;font:800 11px system-ui;cursor:pointer;touch-action:manipulation}
/* menú */
.ge-menu h1{font-size:clamp(30px,7vw,58px)!important;line-height:.95!important}
.ge-menu .k3-panel{width:min(600px,100%)}
.ge-mcol{display:flex;flex-direction:column;gap:12px;align-items:center;width:100%}
.ge-mleft .ge-credit{order:9}
@media (max-height:560px) and (min-width:640px){
  .ge-menu .k3-panel{width:min(900px,100%);flex-direction:row;align-items:center;gap:22px;text-align:left}
  .ge-mleft{align-items:flex-start;flex:0 0 36%}.ge-mright{flex:1;gap:8px}
  .ge-menu h1{font-size:clamp(28px,5.4vw,46px)!important}
  .ge-menu p.ge-sub{display:block!important;font-size:13px}
  .ge-mright .k3-b{padding:11px 16px;font-size:13px}
  .ge-camp{padding:6px 10px;font-size:11px}
}
.ge-menu h1 span{color:var(--ge)}
.ge-sectors{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.ge-sectors button{appearance:none;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;padding:9px 6px;cursor:pointer;font:700 11px system-ui;
  display:flex;flex-direction:column;gap:3px;align-items:center;touch-action:manipulation}
.ge-sectors button b{font:400 12px 'Bungee',system-ui,sans-serif;letter-spacing:.04em}
.ge-sectors button[aria-pressed="true"]{border-color:var(--ge);background:rgba(255,177,59,.16);box-shadow:0 0 0 1px var(--ge) inset}
.ge-sectors button:disabled{opacity:.42;cursor:not-allowed}
.ge-sectors button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.ge-camp{width:100%;font-size:12px;color:#cfe2ea;display:grid;gap:3px;text-align:left;background:rgba(0,0,0,.25);border-radius:10px;padding:8px 10px}
.ge-camp div{display:flex;justify-content:space-between;gap:8px}
.ge-dfx{font-size:11px;color:#9fb6c8;min-height:1.3em}
.ge-credit{display:flex;align-items:center;gap:6px;font:400 11px 'Bungee',system-ui,sans-serif;letter-spacing:.16em;color:#cfe2ea}
.ge-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(46,230,230,.55)}
.ge-credit small{font:800 9px system-ui;letter-spacing:.24em;color:#8fa6b5}
.ge-opt{width:100%;display:grid;gap:8px;text-align:left;font-size:13px}
.ge-opt label{display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(255,255,255,.05);border-radius:10px;padding:8px 10px}
.ge-opt input[type=range]{width:140px;accent-color:var(--ge)}
.ge-opt input[type=checkbox]{width:20px;height:20px;accent-color:var(--ge)}
.ge-map{width:100%;border-collapse:collapse;font-size:12px;text-align:left}
.ge-map td,.ge-map th{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
.ge-map th{font-size:10px;letter-spacing:.14em;color:#9fb6c8}
.ge-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.ge-stats div{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 4px;font-size:10px;font-weight:800;letter-spacing:.12em;color:#9fb6c8}
.ge-stats b{display:block;font:400 18px 'Bungee',system-ui,sans-serif;color:#fff;letter-spacing:0;margin-top:2px}
.ge-rec{color:var(--ge);font-weight:800;letter-spacing:.2em;font-size:12px}
.k3-touch .k3-btn{width:66px;height:66px;font-size:11px;letter-spacing:.04em}
.k3-touch .k3-btn[aria-label="fire"]{background:rgba(255,150,40,.42);border-color:rgba(255,190,90,.8)}
@media (pointer:coarse){.ge-keys{display:none}.ge-hint{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 160px)}.ge-tut{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 150px)}
  .ge-wm{right:50%;transform:translateX(50%)}}
@media (max-width:760px){
  .ge-status{width:176px;padding:6px 8px;gap:4px}.ge-score b{font-size:16px}
  .ge-obj{top:calc(max(8px,env(safe-area-inset-top)) + 150px);left:8px;right:8px;transform:none;width:auto;min-width:0;padding:5px 10px}
  .ge-obj .ge-goal{font-size:12px}
  .ge-radar{width:86px;height:86px}
}
@media (max-height:500px){
  .ge-status{width:176px;padding:5px 8px;gap:3px}.ge-score b{font-size:15px}.ge-wpn{display:none}
  .ge-obj{top:max(6px,env(safe-area-inset-top));left:50%;right:auto;transform:translateX(-50%);width:min(330px,calc(100vw - 420px));padding:4px 10px}
  .ge-obj .ge-goal{font-size:11px}.ge-sm span{font-size:9px;padding:1px 6px}
  .ge-radar{width:78px;height:78px;top:calc(max(6px,env(safe-area-inset-top)) + 42px)}
  .ge-banner{top:38%}
  .ge-menu .k3-panel{gap:7px}
}
@media (pointer:coarse) and (max-height:500px){.ge-hint{bottom:max(14px,env(safe-area-inset-bottom));max-width:calc(100vw - 420px)}.ge-tut{bottom:max(10px,env(safe-area-inset-bottom));width:calc(100vw - 400px)}}
@media (prefers-reduced-motion:reduce){.ge-hint,.ge-banner,.ge-warp{transition:none}}
`;

/** @param {{onStart:(sector:number)=>void, onOptions:()=>void, onTutorial:()=>void, onSkipTutorial:()=>void, isTouch:boolean}} h */
export function createUI(h) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const hud = document.createElement('div'); hud.className = 'ge-hud'; hud.hidden = true;
  hud.innerHTML = `
    <div class="ge-status ge-panel">
      <div class="ge-score"><small>PUNTOS</small><b data-k="score">0</b></div>
      <div class="ge-row"><span class="ge-lbl">ESCUDO</span><div class="ge-bar ge-sh"><i data-k="sh"></i></div></div>
      <div class="ge-row"><span class="ge-lbl">CASCO</span><div class="ge-bar ge-hu" data-k="hub"><i data-k="hu"></i></div></div>
      <div class="ge-mini"><div class="ge-row" style="grid-template-columns:auto 1fr"><span class="ge-lbl">TURBO</span><div class="ge-bar ge-bo"><i data-k="bo"></i></div></div>
        <div class="ge-row" style="grid-template-columns:auto 1fr"><span class="ge-lbl">LÁSER</span><div class="ge-bar ge-en"><i data-k="en"></i></div></div></div>
      <div class="ge-wpn"><span>PULSO <em data-k="pl">NV1</em></span><span>LÁSER <em data-k="ll">NV1</em></span></div>
    </div>
    <div class="ge-obj ge-panel"><div class="ge-sec" data-k="sec">SECTOR</div><div class="ge-goal" data-k="goal"></div><div class="ge-prog" data-k="prog"></div>
      <div class="ge-boss" data-k="boss" hidden><div class="ge-lbl" data-k="bossl">NÉMESIS</div><div class="ge-bar"><i data-k="bossb"></i></div></div>
      <div class="ge-sm" data-k="sm"></div></div>
    <canvas class="ge-radar" width="208" height="208" aria-hidden="true"></canvas>
    <div class="ge-marks"></div>
    <div class="ge-tgt" hidden><i></i><i></i><i></i><i></i><b><u></u></b><span></span></div>
    <div class="ge-scan" hidden></div>
    <svg class="ge-ret" viewBox="0 0 46 46" aria-hidden="true"><g fill="none" stroke="${ACCENT}" stroke-width="2"><circle cx="23" cy="23" r="12" opacity=".85"/><path d="M23 3v8M23 35v8M3 23h8M35 23h8"/></g><circle cx="23" cy="23" r="1.8" fill="#fff"/></svg>
    <div class="ge-lead" hidden></div>
    <div class="ge-hint" role="status" aria-live="polite"></div>
    <div class="ge-banner"><small></small><b></b><span></span></div>
    <div class="ge-keys"><kbd>WASD</kbd>/<kbd>mouse</kbd> pilotear · <kbd>Espacio</kbd>/<kbd>clic</kbd> pulso · <kbd>F</kbd>/<kbd>clic der.</kbd> láser · <kbd>Shift</kbd> turbo · <kbd>E</kbd> escanear · <kbd>Q</kbd> objetivo</div>
    <div class="ge-wm">CREADO POR MATELABS</div>`;
  document.body.appendChild(hud);
  const vig = document.createElement('div'); vig.className = 'ge-vig'; document.body.appendChild(vig);
  const warp = document.createElement('div'); warp.className = 'ge-warp'; document.body.appendChild(warp);
  const tut = document.createElement('div'); tut.className = 'ge-tut ge-panel'; tut.hidden = true;
  tut.innerHTML = `<div class="st" data-k="n">1/5</div><p><small>TUTORIAL</small><span data-k="t"></span></p><button type="button" data-skip>Saltar</button>`;
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) tut.addEventListener(t, e => e.stopPropagation());
  tut.querySelector('[data-skip]')?.addEventListener('click', e => { e.stopPropagation(); h.onSkipTutorial(); });
  document.body.appendChild(tut);

  const q = (/** @type {string} */ k) => /** @type {HTMLElement} */ (hud.querySelector(`[data-k="${k}"]`));
  const els = { score: q('score'), sh: q('sh'), hu: q('hu'), hub: q('hub'), bo: q('bo'), en: q('en'), pl: q('pl'), ll: q('ll'), sec: q('sec'), goal: q('goal'), prog: q('prog'), boss: q('boss'), bossl: q('bossl'), bossb: q('bossb'), sm: q('sm') };
  const radar = /** @type {HTMLCanvasElement} */ (hud.querySelector('.ge-radar'));
  const rctx = /** @type {CanvasRenderingContext2D} */ (radar.getContext('2d'));
  const ret = /** @type {HTMLElement} */ (hud.querySelector('.ge-ret'));
  const lead = /** @type {HTMLElement} */ (hud.querySelector('.ge-lead'));
  const tgt = /** @type {HTMLElement} */ (hud.querySelector('.ge-tgt'));
  const tgtBar = /** @type {HTMLElement} */ (tgt.querySelector('u'));
  const tgtLbl = /** @type {HTMLElement} */ (tgt.querySelector('span'));
  const scan = /** @type {HTMLElement} */ (hud.querySelector('.ge-scan'));
  const hint = /** @type {HTMLElement} */ (hud.querySelector('.ge-hint'));
  const banner = /** @type {HTMLElement} */ (hud.querySelector('.ge-banner'));
  const marksBox = /** @type {HTMLElement} */ (hud.querySelector('.ge-marks'));
  /** @type {{el:HTMLElement, ic:HTMLElement, d:HTMLElement, ar:HTMLElement, on:boolean, key:string}[]} */
  const marks = [];
  for (let i = 0; i < 16; i++) {
    const el = document.createElement('div'); el.className = 'ge-mk'; el.hidden = true;
    el.innerHTML = '<div class="ic"></div><div class="d"></div><div class="ar" hidden></div>';
    marksBox.appendChild(el);
    marks.push({ el, ic: /** @type {HTMLElement} */ (el.children[0]), d: /** @type {HTMLElement} */ (el.children[1]), ar: /** @type {HTMLElement} */ (el.children[2]), on: false, key: '' });
  }
  let hintT = 0, bannerT = 0, lastText = { score: '', goal: '', prog: '', sm: '', sec: '' };

  const setW = (/** @type {HTMLElement} */ el, /** @type {number} */ k) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})`; };
  const setT = (/** @type {'score'|'goal'|'prog'|'sm'|'sec'} */ key, /** @type {string} */ v, html = false) => { if (lastText[key] === v) return; lastText[key] = v; if (html) els[key].innerHTML = v; else els[key].textContent = v; };

  /* ---------- menús ---------- */
  const menu = screen('', { accent: ACCENT, id: 'ge-menu' }); menu.el.classList.add('ge-menu'); menu.hide();
  const opts = screen('', { accent: ACCENT, id: 'ge-opts' }); opts.hide();
  const end = screen('', { accent: ACCENT, id: 'ge-end' }); end.hide();
  const clear = screen('', { accent: ACCENT, id: 'ge-clear' }); clear.hide();

  return {
    hud, menu, opts, end, clear, tut, radar, rctx,
    showHud(v) { hud.hidden = !v; },
    /** @param {any} s */
    status(s) {
      setT('score', String(s.score));
      setW(els.sh, s.shield / 100); setW(els.hu, s.hull / 100); setW(els.bo, s.boost / 100); setW(els.en, s.energy / 100);
      els.hub.classList.toggle('low', s.hull < 35);
      const pl = 'NV' + s.pulseLv, ll = 'NV' + s.laserLv;
      if (els.pl.textContent !== pl) els.pl.textContent = pl;
      if (els.ll.textContent !== ll) els.ll.textContent = ll;
    },
    objective(sec, goal, prog) { setT('sec', sec); setT('goal', goal); setT('prog', prog); },
    /** @param {{title:string, progress:number, target:number, status:string}[]} list */
    secondaries(list) {
      const html = list.map(m => `<span class="${m.status}">${m.status === 'done' ? '✔' : m.status === 'failed' ? '✖' : '◆'} ${m.title}${m.target > 1 && m.status === 'active' ? ` ${Math.min(m.progress, m.target)}/${m.target}` : ''}</span>`).join('');
      setT('sm', html, true);
    },
    boss(show, label, k) { els.boss.hidden = !show; if (show) { if (els.bossl.textContent !== label) els.bossl.textContent = label; setW(els.bossb, k); } },
    /** Retícula (centro del disparo), rombo predictivo y corchetes del objetivo (coordenadas de pantalla en px). */
    reticle(x, y) { ret.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; },
    lead(show, x = 0, y = 0, ok = false) { lead.hidden = !show; if (show) { lead.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotate(45deg)`; lead.classList.toggle('ok', ok); } },
    target(show, x = 0, y = 0, size = 30, k = 1, label = '') {
      tgt.hidden = !show; if (!show) return;
      const s = Math.max(24, Math.min(140, size));
      tgt.style.width = tgt.style.height = s + 'px';
      tgt.style.transform = `translate3d(${(x - s / 2).toFixed(1)}px,${(y - s / 2).toFixed(1)}px,0)`;
      tgtBar.style.transform = `scaleX(${Math.max(0, k).toFixed(3)})`;
      if (tgtLbl.textContent !== label) tgtLbl.textContent = label;
    },
    scan(show, x = 0, y = 0, p = 0) { scan.hidden = !show; if (show) { scan.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; scan.style.setProperty('--p', p.toFixed(3)); } },
    /** @param {{x:number,y:number,edge:boolean,angle:number,icon:string,color:string,label:string}[]} list */
    markers(list) {
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i], it = list[i];
        if (!it) { if (m.on) { m.on = false; m.el.hidden = true; } continue; }
        if (!m.on) { m.on = true; m.el.hidden = false; }
        const key = it.icon + it.color + it.edge;
        if (m.key !== key) { m.key = key; m.ic.textContent = it.icon; m.el.style.color = it.color; m.el.classList.toggle('edge', it.edge); m.ar.hidden = !it.edge; }
        if (m.d.textContent !== it.label) m.d.textContent = it.label;
        m.el.style.transform = `translate3d(${(it.x - 14).toFixed(1)}px,${(it.y - 14).toFixed(1)}px,0)`;
        if (it.edge) m.ar.style.transform = `rotate(${it.angle.toFixed(3)}rad) translateX(20px)`;
      }
    },
    hint(text, ms = 2600) { hint.textContent = text; hint.classList.add('on'); clearTimeout(hintT); hintT = window.setTimeout(() => hint.classList.remove('on'), ms); },
    clearHint() { hint.classList.remove('on'); },
    banner(kicker, title, sub = '', ms = 2600, boss = false) {
      /** @type {HTMLElement} */ (banner.children[0]).textContent = kicker; /** @type {HTMLElement} */ (banner.children[1]).textContent = title; /** @type {HTMLElement} */ (banner.children[2]).textContent = sub;
      banner.classList.toggle('boss', boss); banner.classList.add('on'); clearTimeout(bannerT); bannerT = window.setTimeout(() => banner.classList.remove('on'), ms);
    },
    hideBanner() { banner.classList.remove('on'); },
    vignette(k) { vig.style.opacity = String(Math.max(0, Math.min(1, k))); },
    warp(on) { warp.style.opacity = on ? '1' : '0'; },
    tutorial(show, n = 0, total = 0, text = '') {
      tut.hidden = !show; if (!show) return;
      /** @type {HTMLElement} */ (tut.querySelector('[data-k="n"]')).textContent = `${n}/${total}`;
      /** @type {HTMLElement} */ (tut.querySelector('[data-k="t"]')).textContent = text;
    },
    menuHTML,
    optionsHTML,
    endHTML,
    clearHTML,
  };
}

/** @param {any} s save @param {number} selected @param {string} diff */
function menuHTML(s, selected, diff, best) {
  const sec = SECTORS.map((d, i) => {
    const locked = i + 1 > s.unlocked;
    const done = !!s.campaign[d.mission];
    return `<button type="button" data-sector="${i}" aria-pressed="${i === selected}" ${locked ? 'disabled aria-disabled="true"' : ''}><b>${i + 1}. ${d.short}</b><span>${locked ? '🔒 bloqueado' : done ? '✔ completado' : '▶ disponible'}</span></button>`;
  }).join('');
  const prim = MISSIONS.filter(m => m.kind === 'primary').map(m => `<div><span>${s.campaign[m.id] ? '✅' : '⬜'} ${m.title}</span></div>`).join('');
  return `<div class="ge-mcol ge-mleft"><span class="k3-kicker">SHOOTER ESPACIAL 3D · CAMPAÑA</span>
  <h1>GUARDIANES<br><span>ESTELARES</span></h1>
  <p class="ge-sub">Piloteá el caza Guardián: escoltá convoyes, derribá transmisores y enfrentá al Destructor Némesis en tres sectores.</p>
  <div class="ge-credit"><small>CREADO POR</small><img src="matelabs/mascota-128.webp" alt="">MATELABS</div></div>
  <div class="ge-mcol ge-mright"><div class="ge-sectors" role="group" aria-label="Sector inicial">${sec}</div>
  <div class="k3-btnrow"><button class="k3-b" type="button" data-go>▶ ${selected === 0 ? 'INICIAR CAMPAÑA' : 'JUGAR SECTOR ' + (selected + 1)}</button>
    <button class="k3-b alt" type="button" data-opts>⚙ CONTROLES</button><button class="k3-b alt" type="button" data-tut>? TUTORIAL</button></div>
  <div data-diff></div><div class="ge-dfx" data-dfx>${diffText(diff)}</div>
  <div class="ge-camp"><div><b>MISIONES PRINCIPALES</b><span>Récord: <b>${best}</b>${s.trophy ? ' · 🏆 Guardián' : ''}</span></div>${prim}</div></div>`;
}
/** @param {string} d */
export function diffText(d) {
  const t = /** @type {any} */ (DIFFICULTY)[d] || DIFFICULTY.normal;
  const pct = (/** @type {number} */ v) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
  return `Daño enemigo ${pct(t.enemyDmg)} · vida enemiga ${pct(t.enemyHp)} · cadencia ${pct(t.fireRate)} · escudo regenera a los ${t.regenDelay}s`;
}
/** @param {any} st settings @param {boolean} touch */
function optionsHTML(st, touch) {
  return `<span class="k3-kicker">CONTROLES Y OPCIONES</span><h1 style="font-size:clamp(26px,6vw,40px)">CABINA</h1>
  <div class="ge-opt">
    <label>Sensibilidad de giro <input type="range" min="0.5" max="1.6" step="0.1" value="${st.sens}" data-o="sens" aria-label="Sensibilidad"></label>
    <label>Invertir eje vertical <input type="checkbox" data-o="invertY" ${st.invertY ? 'checked' : ''}></label>
    <label>Dirigir con el mouse (PC) <input type="checkbox" data-o="mouseSteer" ${st.mouseSteer ? 'checked' : ''}></label>
    <label>Disparo asistido (dispara solo al alinear) <input type="checkbox" data-o="autoFire" ${st.autoFire ? 'checked' : ''}></label>
    <label>Reducir movimiento (sin sacudidas ni destellos) <input type="checkbox" data-o="calm" ${st.calm ? 'checked' : ''}></label>
  </div>
  <table class="ge-map"><tr><th>ACCIÓN</th><th>PC</th><th>${touch ? 'TÁCTIL' : 'TÁCTIL'}</th><th>GAMEPAD</th></tr>
    <tr><td>Pilotear</td><td>WASD / flechas / mouse</td><td>Stick izq.</td><td>Stick izq.</td></tr>
    <tr><td>Cañón de pulsos</td><td>Espacio / clic</td><td>FUEGO</td><td>A</td></tr>
    <tr><td>Láser secundario</td><td>F / clic derecho</td><td>LÁSER</td><td>X</td></tr>
    <tr><td>Turbo</td><td>Shift</td><td>TURBO</td><td>RB</td></tr>
    <tr><td>Escanear baliza</td><td>E (mantener)</td><td>SCAN</td><td>Y</td></tr>
    <tr><td>Cambiar objetivo</td><td>Q / Tab</td><td>automático</td><td>LB</td></tr>
    <tr><td>Pausa</td><td>Esc / P</td><td>⏸</td><td>Start</td></tr></table>
  <div class="k3-btnrow"><button class="k3-b" type="button" data-back>✓ LISTO</button></div>`;
}
function endHTML(o) {
  return `<span class="k3-kicker">${o.kicker}</span><h1 style="font-size:clamp(28px,7vw,52px)">${o.title}</h1><p>${o.text}</p>
  <div class="ge-stats"><div>PUNTOS<b>${o.score}</b></div><div>DERRIBOS<b>${o.kills}</b></div><div>CÁPSULAS<b>${o.capsules}</b></div></div>
  ${o.record ? '<div class="ge-rec">★ NUEVO RÉCORD ★</div>' : ''}
  ${o.extra || ''}
  <div class="k3-btnrow">${o.buttons}</div>
  <div class="ge-credit"><small>CREADO POR</small><img src="matelabs/mascota-128.webp" alt="">MATELABS</div>`;
}
function clearHTML(o) {
  return `<span class="k3-kicker">SECTOR ${o.n} DESPEJADO</span><h1 style="font-size:clamp(26px,6vw,46px)">${o.title}</h1><p>${o.text}</p>
  <div class="ge-stats"><div>PUNTOS<b>${o.score}</b></div><div>BONO<b>+${o.bonus}</b></div><div>ESCUDO<b>${o.clean ? 'INTACTO' : 'ROTO'}</b></div></div>
  <div class="k3-btnrow"><button class="k3-b" type="button" data-next>▶ SALTAR AL SECTOR ${o.n + 1}</button><button class="k3-b alt" type="button" data-menu>MENÚ</button></div>`;
}
