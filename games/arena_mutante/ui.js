// @ts-check
/* HUD (DOM), marcadores, retícula, avisos, tutorial, stick derecho táctil y pantallas del juego. */
import { screen } from '../../matelabs/kit3d.js';
import { ACCENT, ARENAS, DIFFICULTY, MISSIONS, UPGRADES } from './config.js';

const CSS = `
:root{--am:${ACCENT};--am-red:#ff4a4a}
html,body{margin:0;height:100%;overflow:hidden;background:#0a0705;overscroll-behavior:none;-webkit-tap-highlight-color:transparent}
.am-hud{position:fixed;inset:0;pointer-events:none;z-index:30;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#f1f7e6}
.am-hud[hidden]{display:none}
.am-panel{background:linear-gradient(180deg,rgba(14,18,10,.82),rgba(10,12,8,.6));border:1px solid rgba(166,255,46,.28);border-radius:12px;
  box-shadow:0 8px 24px rgba(0,0,0,.35)}
.am-status{position:absolute;top:max(8px,env(safe-area-inset-top));left:max(8px,env(safe-area-inset-left));width:214px;padding:8px 10px 9px;display:grid;gap:6px}
.am-row{display:flex;align-items:center;gap:7px}
.am-lbl{font-size:9px;font-weight:800;letter-spacing:.18em;color:#a9b89a}
.am-hp{position:relative;flex:1;height:14px;border-radius:7px;background:rgba(255,255,255,.1);overflow:hidden}
.am-hp i{position:absolute;inset:0;transform-origin:left;background:linear-gradient(90deg,#3fdc5a,var(--am));border-radius:7px}
.am-hp.low i{background:linear-gradient(90deg,#ff3040,#ff8a5a)}
.am-hp b{position:absolute;inset:0;display:grid;place-items:center;font-size:10px;font-weight:900;color:#08100a;text-shadow:none;letter-spacing:.04em}
.am-pips{display:flex;gap:4px}.am-pips span{width:16px;height:6px;border-radius:3px;background:rgba(255,255,255,.15)}.am-pips span.on{background:#6ad8ff}
.am-pulse{position:relative;width:56px;height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
.am-pulse i{position:absolute;inset:0;transform-origin:left;background:#c08aff}
.am-pulse.ready i{background:#e3c8ff}
.am-res{display:flex;justify-content:space-between;align-items:baseline;gap:6px}
.am-ammo{font:400 20px/1 'Bungee',system-ui,sans-serif;font-variant-numeric:tabular-nums}
.am-ammo small{font:700 11px system-ui;color:#a9b89a}
.am-ammo.rl{color:#ffd23a}
.am-scrap{font-size:13px;font-weight:800}
.am-score{font-size:11px;font-weight:800;color:#cfe0bf;letter-spacing:.06em}
.am-mods{display:flex;gap:4px;font-size:9px;font-weight:800;color:#cfe0bf}
.am-mods span{padding:1px 5px;border-radius:5px;background:rgba(255,255,255,.07)}
.am-obj{position:absolute;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(400px,calc(100vw - 500px));min-width:260px;padding:7px 12px 8px;text-align:center}
.am-obj .am-sec{font:400 11px 'Bungee',system-ui,sans-serif;letter-spacing:.12em;color:var(--am)}
.am-obj .am-goal{font-size:13px;font-weight:800;line-height:1.3;margin-top:2px}
.am-obj .am-prog{font-size:11px;color:#c6d6b8;margin-top:2px;font-variant-numeric:tabular-nums}
.am-sm{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;margin-top:5px}
.am-sm span{font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);white-space:nowrap}
.am-sm span.primary{border-color:rgba(255,217,61,.5)}
.am-sm span.done{background:rgba(40,140,70,.55);border-color:#6be38a}
.am-sm span.failed{opacity:.45;text-decoration:line-through}
.am-boss{margin-top:6px}.am-boss[hidden]{display:none}
.am-boss .am-bar{position:relative;height:9px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden}
.am-boss .am-bar i{position:absolute;inset:0;transform-origin:left;background:linear-gradient(90deg,#7dff3a,#e8ff6a)}
.am-boss .am-bar u{position:absolute;top:0;bottom:0;left:62%;width:2px;background:rgba(0,0,0,.6)}
.am-boss .am-lbl{color:#d8ff9a;margin-bottom:3px}
.am-ret{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px}
.am-ret.zoom{transform:scale(.75)}
.am-hitm{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;transition:opacity .12s}
.am-hitm.on{opacity:1;transition:none}
.am-hitm.kill path{stroke:#ff4a4a}
.am-prompt{position:absolute;left:50%;top:60%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:13px;font-weight:800;white-space:nowrap}
.am-prompt[hidden]{display:none}
.am-prompt kbd{font:900 12px system-ui;padding:2px 7px;border-radius:6px;background:var(--am);color:#0a1206}
.am-prompt .am-pbar{width:70px;height:6px;border-radius:3px;background:rgba(255,255,255,.15);overflow:hidden;position:relative}
.am-prompt .am-pbar i{position:absolute;inset:0;transform-origin:left;background:var(--am)}
.am-prompt.no kbd{background:#666;color:#ddd}
.am-mk{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:1px;will-change:transform;font-weight:800}
.am-mk .ic{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:13px;background:rgba(10,12,8,.75);border:2px solid currentColor;line-height:1}
.am-mk .d{font-size:9px;letter-spacing:.06em;color:#eef6e2;text-shadow:0 1px 3px #000;white-space:nowrap}
.am-mk[hidden]{display:none}.am-mk.edge .ic{border-style:dashed}
.am-dmg{position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px 0 0 -110px;border-radius:50%;opacity:0;
  background:conic-gradient(from -20deg,rgba(255,40,40,.75) 0 40deg,transparent 40deg);-webkit-mask:radial-gradient(closest-side,transparent 78%,#000 80%,#000 96%,transparent 98%);mask:radial-gradient(closest-side,transparent 78%,#000 80%,#000 96%,transparent 98%)}
.am-hint{position:absolute;left:50%;bottom:calc(max(22px,env(safe-area-inset-bottom)) + 52px);transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));padding:8px 14px;border-radius:12px;
  background:rgba(10,12,8,.85);border:1px solid rgba(166,255,46,.4);font-size:13px;font-weight:700;text-align:center;opacity:0;transition:opacity .25s}
.am-hint.on{opacity:1}
.am-banner{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .35s;width:min(720px,calc(100vw - 32px))}
.am-banner.on{opacity:1}
.am-banner small{display:block;font-size:11px;font-weight:800;letter-spacing:.32em;color:var(--am)}
.am-banner b{display:block;font:400 clamp(24px,5.4vw,46px)/1.05 'Bungee',system-ui,sans-serif;text-shadow:0 0 24px rgba(140,255,40,.45),0 4px 0 rgba(0,0,0,.45)}
.am-banner span{display:block;font-size:14px;font-weight:700;color:#e3eed6;margin-top:6px;text-shadow:0 2px 6px #000}
.am-banner.boss b{color:#d8ff6a;text-shadow:0 0 30px rgba(140,255,40,.8),0 4px 0 rgba(0,0,0,.45)}
.am-vig{position:fixed;inset:0;pointer-events:none;z-index:29;opacity:0;background:radial-gradient(120% 90% at 50% 50%,transparent 55%,rgba(255,30,40,.6))}
.am-tox{position:fixed;inset:0;pointer-events:none;z-index:29;opacity:0;background:radial-gradient(120% 90% at 50% 50%,transparent 50%,rgba(120,255,40,.45))}
.am-keys{position:absolute;left:max(10px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));font-size:10px;font-weight:700;color:#b6c4a8;letter-spacing:.03em;line-height:1.6;
  background:rgba(8,10,6,.55);padding:6px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.08);max-width:520px}
.am-keys kbd{font:800 10px system-ui;padding:0 4px;border-radius:4px;background:rgba(255,255,255,.14);color:#fff}
.am-wm{position:absolute;right:max(10px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom));font:400 9px 'Bungee',system-ui,sans-serif;letter-spacing:.18em;color:rgba(255,255,255,.38)}
.am-tut{position:fixed;left:50%;bottom:max(70px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:41;width:min(470px,calc(100vw - 24px));pointer-events:auto;
  padding:10px 12px;display:flex;gap:10px;align-items:center;font-family:system-ui,sans-serif;color:#fff}
.am-tut[hidden]{display:none}
.am-tut .st{font:400 18px 'Bungee',system-ui,sans-serif;color:var(--am);min-width:34px;text-align:center}
.am-tut p{margin:0;font-size:13px;line-height:1.35;flex:1}
.am-tut p small{display:block;font-size:9px;font-weight:800;letter-spacing:.22em;color:#a9b89a}
.am-tut button{appearance:none;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.08);color:#fff;border-radius:10px;padding:8px 10px;font:800 11px system-ui;cursor:pointer;touch-action:manipulation}
.am-rstick{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(24px,env(safe-area-inset-bottom));width:132px;height:132px;border-radius:50%;z-index:40;
  background:rgba(255,255,255,.07);border:2px solid rgba(166,255,46,.35);touch-action:none;pointer-events:auto}
.am-rstick[hidden]{display:none}
.am-rstick i{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px;border-radius:50%;background:rgba(166,255,46,.32)}
.am-rstick span{position:absolute;left:0;right:0;top:-18px;text-align:center;font:800 9px system-ui;letter-spacing:.2em;color:rgba(255,255,255,.55)}
/* botones táctiles: a la izquierda del stick derecho */
body .k3-touch .k3-btns{right:calc(max(20px,env(safe-area-inset-right)) + 144px);bottom:max(20px,env(safe-area-inset-bottom));max-width:216px;gap:8px}
body .k3-touch .k3-btn{width:62px;height:62px;font-size:10px;letter-spacing:.03em}
body .k3-touch .k3-btn[aria-label="fire"]{background:rgba(255,120,40,.45);border-color:rgba(255,170,90,.85)}
body .k3-touch .k3-btn[aria-label="roll"]{background:rgba(80,180,255,.35)}
body .k3-touch .k3-btn[aria-label="use"]{background:rgba(166,255,46,.32)}
@media (orientation:portrait) and (pointer:coarse){
  body .k3-touch .k3-btns{right:max(14px,env(safe-area-inset-right));bottom:calc(max(24px,env(safe-area-inset-bottom)) + 146px);max-width:210px}
}
/* menú */
.am-menu h1{font-size:clamp(32px,7.4vw,62px)!important;line-height:.95!important}
.am-menu .k3-panel{width:min(620px,100%)}
.am-mcol{display:flex;flex-direction:column;gap:11px;align-items:center;width:100%}
@media (max-height:560px) and (min-width:640px){
  .am-menu .k3-panel{width:min(920px,100%);flex-direction:row;align-items:center;gap:22px;text-align:left}
  .am-mleft{align-items:flex-start;flex:0 0 36%}.am-mright{flex:1;gap:7px}
  .am-menu h1{font-size:clamp(28px,5.4vw,46px)!important}
  .am-mright .k3-b{padding:10px 15px;font-size:13px}
  .am-camp{padding:6px 10px;font-size:11px}
}
.am-menu h1 span{color:var(--am)}
.am-arenas{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.am-arenas button{appearance:none;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:#fff;padding:9px 6px;cursor:pointer;font:700 11px system-ui;
  display:flex;flex-direction:column;gap:3px;align-items:center;touch-action:manipulation}
.am-arenas button b{font:400 12px 'Bungee',system-ui,sans-serif;letter-spacing:.04em}
.am-arenas button[aria-pressed="true"]{border-color:var(--am);background:rgba(166,255,46,.14);box-shadow:0 0 0 1px var(--am) inset}
.am-arenas button:disabled{opacity:.42;cursor:not-allowed}
.am-arenas button:focus-visible{outline:2px solid #fff;outline-offset:2px}
.am-camp{width:100%;font-size:12px;color:#d6e4c8;display:grid;gap:3px;text-align:left;background:rgba(0,0,0,.28);border-radius:10px;padding:8px 10px}
.am-camp div{display:flex;justify-content:space-between;gap:8px}
.am-dfx{font-size:11px;color:#a9b89a;min-height:1.3em;text-align:center}
.am-credit{display:flex;align-items:center;gap:6px;font:400 11px 'Bungee',system-ui,sans-serif;letter-spacing:.16em;color:#dfe9d2}
.am-credit img{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1.5px rgba(166,255,46,.6)}
.am-credit small{font:800 9px system-ui;letter-spacing:.24em;color:#97a68a}
.am-opt{width:100%;display:grid;gap:7px;text-align:left;font-size:13px}
.am-opt label{display:flex;justify-content:space-between;align-items:center;gap:10px;background:rgba(255,255,255,.05);border-radius:10px;padding:7px 10px}
.am-opt input[type=range]{width:140px;accent-color:var(--am)}
.am-opt input[type=checkbox]{width:20px;height:20px;accent-color:var(--am)}
.am-opt select{background:#1a2214;color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:5px 8px;font:700 12px system-ui}
.am-map{width:100%;border-collapse:collapse;font-size:12px;text-align:left}
.am-map td,.am-map th{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
.am-map th{font-size:10px;letter-spacing:.14em;color:#a9b89a}
.am-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.am-stats div{background:rgba(255,255,255,.06);border-radius:10px;padding:8px 4px;font-size:10px;font-weight:800;letter-spacing:.12em;color:#a9b89a}
.am-stats b{display:block;font:400 18px 'Bungee',system-ui,sans-serif;color:#fff;letter-spacing:0;margin-top:2px}
.am-rec{color:var(--am);font-weight:800;letter-spacing:.2em;font-size:12px}
.am-craft-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;width:100%}
.am-craft-grid button{appearance:none;text-align:left;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;padding:10px;cursor:pointer;
  display:grid;gap:3px;font:600 12px system-ui;touch-action:manipulation}
.am-craft-grid button b{font:400 13px 'Bungee',system-ui,sans-serif}
.am-craft-grid button em{font-style:normal;color:var(--am);font-weight:800}
.am-craft-grid button:disabled{opacity:.45;cursor:not-allowed}
.am-craft-grid button:focus-visible{outline:2px solid #fff}
.am-lv{display:flex;gap:3px}.am-lv i{width:14px;height:5px;border-radius:2px;background:rgba(255,255,255,.18)}.am-lv i.on{background:var(--am)}
@media (pointer:coarse){.am-keys,.am-wm{display:none}.am-hint{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 160px)}.am-tut{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 160px)}}
@media (orientation:portrait) and (pointer:coarse){.am-hint{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 300px)}.am-tut{bottom:calc(max(22px,env(safe-area-inset-bottom)) + 300px)}.am-prompt{top:56%}}
@media (max-width:760px){
  .am-status{width:178px;padding:6px 8px;gap:4px}.am-ammo{font-size:16px}.am-mods{display:none}
  .am-obj{top:calc(max(8px,env(safe-area-inset-top)) + 112px);left:8px;right:8px;transform:none;width:auto;min-width:0;padding:5px 10px}
  .am-obj .am-goal{font-size:12px}
  .am-sm span:not(.primary){display:none}
  .am-banner{top:44%}
}
@media (max-height:500px){
  .am-status{width:178px;padding:5px 8px;gap:3px}.am-ammo{font-size:15px}.am-mods,.am-score{display:none}
  .am-obj{top:max(6px,env(safe-area-inset-top));left:50%;right:auto;transform:translateX(-50%);width:min(340px,calc(100vw - 440px));min-width:220px;padding:4px 10px}
  .am-obj .am-goal{font-size:11px}.am-sm span{font-size:9px;padding:1px 6px}.am-sm{margin-top:3px}.am-sm span:not(.primary){display:none}
  .am-banner{top:36%}
  .am-menu .k3-panel{gap:7px}
}
@media (pointer:coarse) and (max-height:500px){.am-hint{bottom:auto;top:calc(max(6px,env(safe-area-inset-top)) + 118px);max-width:min(460px,calc(100vw - 440px));font-size:12px;padding:6px 10px}.am-tut{bottom:max(10px,env(safe-area-inset-bottom));width:calc(100vw - 560px);min-width:260px}.am-prompt{top:64%}}
@media (prefers-reduced-motion:reduce){.am-hint,.am-banner,.am-hitm{transition:none}}
`;

/** @param {{onSkipTutorial:()=>void, isTouch:boolean}} h */
export function createUI(h) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const hud = document.createElement('div'); hud.className = 'am-hud'; hud.hidden = true;
  hud.innerHTML = `
    <div class="am-status am-panel">
      <div class="am-row"><span class="am-lbl">VIDA</span><div class="am-hp" data-k="hpb"><i data-k="hp"></i><b data-k="hpn">100</b></div></div>
      <div class="am-row"><span class="am-lbl">RODAR</span><div class="am-pips" data-k="pips"><span></span><span></span></div><span class="am-lbl" style="margin-left:auto">PULSO</span><div class="am-pulse" data-k="pulb"><i data-k="pul"></i></div></div>
      <div class="am-res"><div class="am-ammo" data-k="ammo">24<small>/24</small></div><div class="am-scrap" title="Chatarra">🔩 <span data-k="scrap">0</span></div></div>
      <div class="am-res"><div class="am-mods" data-k="mods"></div><div class="am-score" data-k="score">0 PTS</div></div>
    </div>
    <div class="am-obj am-panel"><div class="am-sec" data-k="sec">ARENA</div><div class="am-goal" data-k="goal"></div><div class="am-prog" data-k="prog"></div>
      <div class="am-boss" data-k="boss" hidden><div class="am-lbl" data-k="bossl">COLOSO RADIACTIVO</div><div class="am-bar"><i data-k="bossb"></i><u></u></div></div>
      <div class="am-sm" data-k="sm"></div></div>
    <div class="am-marks"></div>
    <svg class="am-ret" viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="${ACCENT}" stroke-width="2.2" stroke-linecap="round"><path d="M20 4v8M20 28v8M4 20h8M28 20h8"/></g><circle cx="20" cy="20" r="1.8" fill="#fff"/>
      <circle class="am-rl" cx="20" cy="20" r="14" fill="none" stroke="#ffd23a" stroke-width="3" stroke-dasharray="88" stroke-dashoffset="88" transform="rotate(-90 20 20)"/></svg>
    <svg class="am-hitm" viewBox="0 0 26 26" aria-hidden="true"><path d="M3 3l6 6M23 3l-6 6M3 23l6-6M23 23l-6-6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>
    <div class="am-dmg"></div>
    <div class="am-prompt am-panel" hidden><kbd data-k="pk">E</kbd><span data-k="pt"></span><div class="am-pbar" data-k="pbw"><i data-k="pb"></i></div></div>
    <div class="am-hint" role="status" aria-live="polite"></div>
    <div class="am-banner"><small></small><b></b><span></span></div>
    <div class="am-keys"><kbd>WASD</kbd> mover · <kbd>mouse</kbd> apuntar (clic para capturar) · <kbd>clic</kbd>/<kbd>J</kbd> disparar · <kbd>clic der.</kbd> mira · <kbd>Espacio</kbd> rodar · <kbd>E</kbd> usar · <kbd>Q</kbd> pulso · <kbd>F</kbd> barricada · <kbd>R</kbd> recargar · <kbd>flechas</kbd> cámara</div>
    <div class="am-wm">CREADO POR MATELABS</div>`;
  document.body.appendChild(hud);
  const vig = document.createElement('div'); vig.className = 'am-vig'; document.body.appendChild(vig);
  const tox = document.createElement('div'); tox.className = 'am-tox'; document.body.appendChild(tox);
  const tut = document.createElement('div'); tut.className = 'am-tut am-panel'; tut.hidden = true;
  tut.innerHTML = `<div class="st" data-k="n">1/5</div><p><small>TUTORIAL</small><span data-k="t"></span></p><button type="button" data-skip>Saltar</button>`;
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) tut.addEventListener(t, e => e.stopPropagation());
  tut.querySelector('[data-skip]')?.addEventListener('click', e => { e.stopPropagation(); h.onSkipTutorial(); });
  document.body.appendChild(tut);
  // stick derecho (apuntar) para táctil
  const rstick = document.createElement('div'); rstick.className = 'am-rstick'; rstick.hidden = true; rstick.setAttribute('aria-label', 'apuntar');
  rstick.innerHTML = '<span>APUNTAR</span><i></i>';
  document.body.appendChild(rstick);
  const rs = { x: 0, y: 0, active: false };
  {
    const knob = /** @type {HTMLElement} */ (rstick.querySelector('i'));
    let id = -1;
    const move = (/** @type {PointerEvent} */ e) => {
      if (e.pointerId !== id) return;
      const r = rstick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      rs.x = dx; rs.y = dy; rs.active = true;
      knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
    };
    rstick.addEventListener('pointerdown', e => { id = e.pointerId; rstick.setPointerCapture(id); move(e); e.preventDefault(); e.stopPropagation(); });
    rstick.addEventListener('pointermove', move);
    const end = (/** @type {PointerEvent} */ e) => { if (e.pointerId !== id) return; id = -1; rs.x = rs.y = 0; rs.active = false; knob.style.transform = ''; };
    rstick.addEventListener('pointerup', end); rstick.addEventListener('pointercancel', end);
  }

  const q = (/** @type {string} */ k) => /** @type {HTMLElement} */ (hud.querySelector(`[data-k="${k}"]`));
  const els = { hp: q('hp'), hpb: q('hpb'), hpn: q('hpn'), pips: q('pips'), pul: q('pul'), pulb: q('pulb'), ammo: q('ammo'), scrap: q('scrap'), mods: q('mods'), score: q('score'),
    sec: q('sec'), goal: q('goal'), prog: q('prog'), boss: q('boss'), bossl: q('bossl'), bossb: q('bossb'), sm: q('sm'), pk: q('pk'), pt: q('pt'), pb: q('pb'), pbw: q('pbw') };
  const ret = /** @type {HTMLElement} */ (hud.querySelector('.am-ret'));
  const rl = /** @type {SVGElement} */ (hud.querySelector('.am-rl'));
  const hitm = /** @type {HTMLElement} */ (hud.querySelector('.am-hitm'));
  const dmg = /** @type {HTMLElement} */ (hud.querySelector('.am-dmg'));
  const prompt = /** @type {HTMLElement} */ (hud.querySelector('.am-prompt'));
  const hint = /** @type {HTMLElement} */ (hud.querySelector('.am-hint'));
  const banner = /** @type {HTMLElement} */ (hud.querySelector('.am-banner'));
  const marksBox = /** @type {HTMLElement} */ (hud.querySelector('.am-marks'));
  /** @type {{el:HTMLElement, ic:HTMLElement, d:HTMLElement, on:boolean, key:string}[]} */
  const marks = [];
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('div'); el.className = 'am-mk'; el.hidden = true;
    el.innerHTML = '<div class="ic"></div><div class="d"></div>';
    marksBox.appendChild(el);
    marks.push({ el, ic: /** @type {HTMLElement} */ (el.children[0]), d: /** @type {HTMLElement} */ (el.children[1]), on: false, key: '' });
  }
  /** @type {Record<string,string>} */ const last = {};
  let hintT = 0, bannerT = 0, hitT = 0, dmgA = 0;
  const setW = (/** @type {HTMLElement} */ el, /** @type {number} */ k) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})`; };
  const setT = (/** @type {string} */ key, /** @type {HTMLElement} */ el, /** @type {string} */ v, html = false) => { if (last[key] === v) return; last[key] = v; if (html) el.innerHTML = v; else el.textContent = v; };

  const menu = screen('', { accent: ACCENT, id: 'am-menu' }); menu.el.classList.add('am-menu'); menu.hide();
  const opts = screen('', { accent: ACCENT, id: 'am-opts' }); opts.hide();
  const end = screen('', { accent: ACCENT, id: 'am-end' }); end.hide();
  const clear = screen('', { accent: ACCENT, id: 'am-clear' }); clear.hide();
  const craft = screen('', { accent: ACCENT, id: 'am-craft' }); craft.hide();

  return {
    hud, menu, opts, end, clear, craft, tut, rstick, rs,
    showHud(v) { hud.hidden = !v; },
    showRStick(v) { rstick.hidden = !(v && h.isTouch); if (rstick.hidden) { rs.x = rs.y = 0; rs.active = false; } },
    /** @param {any} s */
    status(s) {
      setW(els.hp, s.hp / s.maxHp); setT('hpn', els.hpn, String(Math.ceil(s.hp)));
      els.hpb.classList.toggle('low', s.hp < s.maxHp * 0.3);
      const pips = s.rolls + '/' + s.rollMax;
      if (last.pips !== pips) { last.pips = pips; els.pips.innerHTML = Array.from({ length: s.rollMax }, (_, i) => `<span class="${i < s.rolls ? 'on' : ''}"></span>`).join(''); }
      setW(els.pul, s.pulse); els.pulb.classList.toggle('ready', s.pulse >= 1);
      setT('ammo', els.ammo, s.reloading ? `RECARGA<small> ${Math.round(s.reloadK * 100)}%</small>` : `${s.ammo}<small>/${s.mag}</small>`, true);
      els.ammo.classList.toggle('rl', !!s.reloading);
      rl.setAttribute('stroke-dashoffset', s.reloading ? String(88 * (1 - s.reloadK)) : '88');
      setT('scrap', els.scrap, String(s.scrap));
      setT('score', els.score, `${s.score} PTS`);
      setT('mods', els.mods, s.mods, true);
    },
    objective(sec, goal, prog) { setT('sec', els.sec, sec); setT('goal', els.goal, goal); setT('prog', els.prog, prog); },
    /** @param {{title:string, progress:number, target:number, status:string, kind:string}[]} list */
    missions(list) {
      const html = list.map(m => `<span class="${m.status} ${m.kind === 'primary' ? 'primary' : ''}">${m.status === 'done' ? '✔' : m.status === 'failed' ? '✖' : m.kind === 'primary' ? '★' : '◆'} ${m.title}${m.target > 1 && m.status === 'active' ? ` ${Math.floor(Math.min(m.progress, m.target))}/${m.target}` : ''}</span>`).join('');
      setT('sm', els.sm, html, true);
    },
    boss(show, label, k) { els.boss.hidden = !show; if (show) { setT('bossl', els.bossl, label); setW(els.bossb, k); } },
    zoom(v) { ret.classList.toggle('zoom', v); },
    hitMarker(kill) { hitm.classList.toggle('kill', !!kill); hitm.classList.add('on'); clearTimeout(hitT); hitT = window.setTimeout(() => hitm.classList.remove('on'), kill ? 180 : 90); },
    /** Indicador de daño: ángulo en radianes relativo a la cámara (0 = adelante). */
    damageDir(angle) { dmgA = 1; dmg.style.transform = `rotate(${angle.toFixed(3)}rad)`; dmg.style.opacity = '1'; },
    fadeDamage(dt) { if (dmgA > 0) { dmgA = Math.max(0, dmgA - dt * 1.5); dmg.style.opacity = dmgA.toFixed(2); } },
    /** @param {null|{key:string, text:string, progress?:number, ok?:boolean}} p */
    prompt(p) {
      if (!p) { if (!prompt.hidden) prompt.hidden = true; return; }
      prompt.hidden = false;
      setT('pk', els.pk, p.key); setT('pt', els.pt, p.text);
      prompt.classList.toggle('no', p.ok === false);
      els.pbw.style.display = p.progress !== undefined ? '' : 'none';
      if (p.progress !== undefined) setW(els.pb, p.progress);
    },
    /** @param {{x:number,y:number,edge:boolean,icon:string,color:string,label:string}[]} list */
    markers(list) {
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i], it = list[i];
        if (!it) { if (m.on) { m.on = false; m.el.hidden = true; } continue; }
        if (!m.on) { m.on = true; m.el.hidden = false; }
        const key = it.icon + it.color + it.edge;
        if (m.key !== key) { m.key = key; m.ic.textContent = it.icon; m.el.style.color = it.color; m.el.classList.toggle('edge', it.edge); }
        if (m.d.textContent !== it.label) m.d.textContent = it.label;
        m.el.style.transform = `translate3d(${(it.x - 15).toFixed(1)}px,${(it.y - 15).toFixed(1)}px,0)`;
      }
    },
    hint(text, ms = 2800) { hint.textContent = text; hint.classList.add('on'); clearTimeout(hintT); hintT = window.setTimeout(() => hint.classList.remove('on'), ms); },
    banner(kicker, title, sub = '', ms = 2600, boss = false) {
      /** @type {HTMLElement} */ (banner.children[0]).textContent = kicker; /** @type {HTMLElement} */ (banner.children[1]).textContent = title; /** @type {HTMLElement} */ (banner.children[2]).textContent = sub;
      banner.classList.toggle('boss', boss); banner.classList.add('on'); clearTimeout(bannerT); bannerT = window.setTimeout(() => banner.classList.remove('on'), ms);
    },
    hideBanner() { banner.classList.remove('on'); },
    vignette(k) { vig.style.opacity = String(Math.max(0, Math.min(1, k)).toFixed(2)); },
    toxic(k) { tox.style.opacity = String(Math.max(0, Math.min(1, k)).toFixed(2)); },
    tutorial(show, n = 0, total = 0, text = '') {
      tut.hidden = !show; if (!show) return;
      /** @type {HTMLElement} */ (tut.querySelector('[data-k="n"]')).textContent = `${n}/${total}`;
      /** @type {HTMLElement} */ (tut.querySelector('[data-k="t"]')).textContent = text;
    },
    menuHTML, optionsHTML, endHTML, clearHTML, craftHTML,
  };
}

const credit = '<div class="am-credit"><small>CREADO POR</small><img src="matelabs/mascota-128.webp" alt="">MATELABS</div>';
/** @param {any} s save @param {number} selected @param {string} diff @param {number} best */
function menuHTML(s, selected, diff, best) {
  const ar = ARENAS.map((d, i) => {
    const locked = i + 1 > s.unlocked;
    const done = !!s.campaign[d.mission];
    return `<button type="button" data-arena="${i}" aria-pressed="${i === selected}" ${locked ? 'disabled aria-disabled="true"' : ''}><b>${i + 1}. ${d.short}</b><span>${locked ? '🔒 bloqueada' : done ? '✔ superada' : '▶ disponible'}</span></button>`;
  }).join('');
  const prim = MISSIONS.filter(m => m.kind === 'primary').map(m => `<div><span>${s.campaign[m.id] ? '✅' : '⬜'} ${m.title}</span></div>`).join('');
  return `<div class="am-mcol am-mleft"><span class="k3-kicker">SUPERVIVENCIA 3D · TERCERA PERSONA</span>
  <h1>ARENA<br><span>MUTANTE</span></h1>
  <p class="am-sub">Restablecé la energía del búnker, aguantá seis oleadas en la estación y escapá del laboratorio… si el Coloso Radiactivo te deja.</p>
  ${credit}</div>
  <div class="am-mcol am-mright"><div class="am-arenas" role="group" aria-label="Arena inicial">${ar}</div>
  <div class="k3-btnrow"><button class="k3-b" type="button" data-go>▶ ${selected === 0 ? 'EMPEZAR' : 'JUGAR ARENA ' + (selected + 1)}</button>
    <button class="k3-b alt" type="button" data-opts>⚙ CONTROLES</button><button class="k3-b alt" type="button" data-tut>? TUTORIAL</button></div>
  <div data-diff></div><div class="am-dfx" data-dfx>${diffText(diff)}</div>
  <div class="am-camp"><div><b>MISIONES PRINCIPALES</b><span>Récord: <b>${best}</b>${s.trophy ? ' · 🏆 Núcleo del Coloso' : ''}</span></div>${prim}</div></div>`;
}
/** @param {string} d */
export function diffText(d) {
  const t = /** @type {any} */ (DIFFICULTY)[d] || DIFFICULTY.normal;
  const pct = (/** @type {number} */ v) => (v >= 1 ? '+' : '') + Math.round((v - 1) * 100) + '%';
  return `Daño mutante ${pct(t.enemyDmg)} · vida mutante ${pct(t.enemyHp)} · hordas ${pct(t.budget)} · avisos ${pct(t.telegraph)} · regenerás hasta ${Math.round(t.regenCap * 100)}%`;
}
/** @param {any} st @param {boolean} touch */
function optionsHTML(st, touch) {
  const sel = (/** @type {string} */ v) => ['off', 'suave', 'fuerte'].map(o => `<option value="${o}" ${v === o ? 'selected' : ''}>${o === 'off' ? 'Apagado' : o === 'suave' ? 'Suave' : 'Fuerte'}</option>`).join('');
  return `<span class="k3-kicker">CONTROLES Y OPCIONES</span><h1 style="font-size:clamp(26px,6vw,40px)">EQUIPO</h1>
  <div class="am-opt">
    <label>Sensibilidad de cámara <input type="range" min="0.4" max="2" step="0.1" value="${st.sens}" data-o="sens" aria-label="Sensibilidad"></label>
    <label>Invertir eje vertical <input type="checkbox" data-o="invertY" ${st.invertY ? 'checked' : ''}></label>
    <label>Autoapuntado <select data-o="autoAim" aria-label="Autoapuntado">${sel(st.autoAim)}</select></label>
    <label>Disparo automático al apuntar (táctil) <input type="checkbox" data-o="autoFire" ${st.autoFire ? 'checked' : ''}></label>
    <label>Reducir movimiento (sin sacudidas ni destellos) <input type="checkbox" data-o="calm" ${st.calm ? 'checked' : ''}></label>
  </div>
  <table class="am-map"><tr><th>ACCIÓN</th><th>PC</th><th>TÁCTIL</th><th>GAMEPAD</th></tr>
    <tr><td>Mover</td><td>WASD</td><td>Stick izq.</td><td>Stick izq.</td></tr>
    <tr><td>Apuntar / cámara</td><td>Mouse (clic captura) · flechas</td><td>Stick der.</td><td>Stick der.</td></tr>
    <tr><td>Disparar</td><td>Clic izq. / J</td><td>FUEGO o automático</td><td>RT</td></tr>
    <tr><td>Mira al hombro</td><td>Clic der. / K</td><td>—</td><td>LT</td></tr>
    <tr><td>Rodar (evasión)</td><td>Espacio</td><td>RODAR</td><td>A</td></tr>
    <tr><td>Usar / mantener</td><td>E</td><td>USAR</td><td>X</td></tr>
    <tr><td>Pulso</td><td>Q</td><td>PULSO</td><td>LB</td></tr>
    <tr><td>Barricada</td><td>F</td><td>BARR.</td><td>Y</td></tr>
    <tr><td>Recargar</td><td>R</td><td>automático</td><td>B</td></tr>
    <tr><td>Pausa</td><td>Esc / P</td><td>⏸</td><td>Start</td></tr></table>
  <div class="k3-btnrow"><button class="k3-b" type="button" data-back>✓ LISTO</button></div>`;
}
function endHTML(o) {
  return `<span class="k3-kicker">${o.kicker}</span><h1 style="font-size:clamp(28px,7vw,52px)">${o.title}</h1><p>${o.text}</p>
  <div class="am-stats"><div>PUNTOS<b>${o.score}</b></div><div>BAJAS<b>${o.kills}</b></div><div>TIEMPO<b>${o.time}</b></div></div>
  ${o.record ? '<div class="am-rec">★ NUEVO RÉCORD ★</div>' : ''}
  ${o.extra || ''}
  <div class="k3-btnrow">${o.buttons}</div>
  ${credit}`;
}
function clearHTML(o) {
  return `<span class="k3-kicker">ARENA ${o.n} SUPERADA</span><h1 style="font-size:clamp(26px,6vw,46px)">${o.title}</h1><p>${o.text}</p>
  <div class="am-stats"><div>PUNTOS<b>${o.score}</b></div><div>BONO<b>+${o.bonus}</b></div><div>BAJAS<b>${o.kills}</b></div></div>
  <div class="k3-btnrow"><button class="k3-b" type="button" data-next>▶ SEGUIR A ${o.next}</button><button class="k3-b alt" type="button" data-menu>MENÚ</button></div>`;
}
/** @param {Record<string,number>} lv @param {number} scrap */
function craftHTML(lv, scrap) {
  const items = UPGRADES.map((u, i) => {
    const l = lv[u.id] || 0, maxed = l >= 3, cost = maxed ? 0 : u.cost[l];
    return `<button type="button" data-up="${u.id}" ${maxed || scrap < cost ? 'disabled' : ''}><b>${u.icon} ${i + 1}. ${u.name}</b><span>${u.desc}</span>
      <span class="am-lv">${[0, 1, 2].map(k => `<i class="${k < l ? 'on' : ''}"></i>`).join('')}</span><em>${maxed ? 'MÁXIMO' : `🔩 ${cost}`}</em></button>`;
  }).join('');
  return `<span class="k3-kicker">BANCO DE TRABAJO · 🔩 ${scrap} CHATARRA</span><h1 style="font-size:clamp(24px,5vw,38px)">MÓDULOS DE ARMA</h1>
  <div class="am-craft-grid">${items}</div>
  <p style="font-size:12px">Teclas 1-4 para comprar · E para volver. Las mejoras duran toda la partida.</p>
  <div class="k3-btnrow"><button class="k3-b" type="button" data-close>✓ LISTO</button></div>`;
}
