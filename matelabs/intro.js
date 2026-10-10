/* MateLabs — intro de marca compartida por el hub y todos los juegos.
   Uso: <script src="matelabs/intro.js" data-game="NOMBRE" data-accent="#hex"></script>
   justo después de <body>. Se muestra una vez por sesión y por página; se salta
   tocando o con cualquier tecla. Mientras está activa bloquea la entrada al juego
   y al terminar emite el evento "matelabs:intro-done" en window. */
(() => {
  const me = document.currentScript;
  const base = me.src.replace(/[^/]*$/, '');
  const game = me.dataset.game || '';
  const accent = me.dataset.accent || '#2ee6e6';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Fuente + favicon de MateLabs */
  if (!document.querySelector('link[href*="family=Bungee"]')) {
    const f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Bungee&display=swap';
    document.head.appendChild(f);
  }
  if (!document.querySelector('link[rel~="icon"]')) {
    const ic = document.createElement('link');
    ic.rel = 'icon'; ic.type = 'image/png'; ic.href = base + 'favicon.png';
    document.head.appendChild(ic);
  }

  /* Estilos: créditos (siempre) + intro */
  const css = document.createElement('style');
  css.textContent = `
  .ml-ava{display:inline-block;width:1.3em;height:1.3em;border-radius:50%;vertical-align:-.3em;margin-right:.4em;
    box-shadow:0 0 0 1.5px rgba(46,230,230,.55),0 0 12px rgba(46,230,230,.4)}
  #ml-intro{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:clamp(10px,2.4vh,20px);overflow:hidden;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:none;
    background:radial-gradient(70% 60% at 50% 42%,#0b2a36 0%,#04121a 48%,#010508 100%);color:#fff;
    font-family:'Bungee','Space Grotesk',system-ui,sans-serif;transition:opacity .55s ease,transform .55s ease}
  #ml-intro.ml-out{opacity:0;transform:scale(1.06);pointer-events:none}
  #ml-intro::before{content:"";position:absolute;inset:-50%;opacity:.16;pointer-events:none;
    background-image:linear-gradient(rgba(46,230,230,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(46,230,230,.35) 1px,transparent 1px);
    background-size:44px 44px;transform:perspective(600px) rotateX(62deg) translateY(18%);
    -webkit-mask:radial-gradient(closest-side,#000,transparent);mask:radial-gradient(closest-side,#000,transparent);
    animation:mlGrid 6s linear infinite}
  @keyframes mlGrid{to{background-position:0 44px,0 0}}
  #ml-intro::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.25;
    background:repeating-linear-gradient(0deg,rgba(0,0,0,.35) 0 1px,transparent 1px 3px)}
  .ml-stage{position:relative;width:clamp(150px,34vmin,250px);aspect-ratio:1;animation:mlDrop .9s cubic-bezier(.2,1.5,.35,1) both}
  .ml-ring{position:absolute;inset:-9%;border-radius:50%;
    background:conic-gradient(from 0deg,transparent 0 55%,rgba(46,230,230,.15) 70%,#2ee6e6 92%,#e9ffff 100%);
    -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));
    mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));
    animation:mlSpin 1.6s linear infinite;filter:drop-shadow(0 0 8px #2ee6e6)}
  .ml-ring.r2{inset:-16%;opacity:.45;animation-duration:2.8s;animation-direction:reverse}
  .ml-glow{position:absolute;inset:-6%;border-radius:50%;background:radial-gradient(closest-side,rgba(46,230,230,.45),transparent 72%);
    animation:mlPulse 1.8s ease-in-out infinite}
  .ml-float{position:absolute;inset:0;animation:mlFloat 2.6s ease-in-out .9s infinite}
  .ml-float img{width:100%;height:100%;border-radius:50%;display:block}
  .ml-float::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;
    background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.28) 50%,transparent 65%);background-size:250% 100%;
    background-position:150% 0;animation:mlShine 1.1s ease .75s both}
  .ml-word{display:flex;font-size:clamp(34px,8.5vw,68px);letter-spacing:.06em;line-height:1;
    text-shadow:0 0 18px rgba(46,230,230,.55),0 4px 0 #062a33}
  .ml-word span{display:inline-block;animation:mlLetter .5s cubic-bezier(.2,1.6,.4,1) both}
  .ml-word .ml-labs{color:#2ee6e6}
  .ml-sub{font-family:'Space Grotesk',system-ui,sans-serif;font-weight:700;font-size:12px;letter-spacing:.6em;
    margin-right:-.6em;color:rgba(220,250,255,.8);animation:mlFade .6s ease 1.25s both}
  .ml-game{font-size:clamp(22px,5.6vw,40px);color:var(--ml-accent);letter-spacing:.03em;text-align:center;padding:0 16px;
    text-shadow:0 0 22px var(--ml-accent);animation:mlGame .7s cubic-bezier(.2,1.4,.3,1) 1.55s both}
  .ml-bar{position:absolute;left:50%;bottom:clamp(44px,8vh,70px);width:min(220px,50vw);height:3px;transform:translateX(-50%);
    border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}
  .ml-bar i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#2ee6e6,var(--ml-accent));
    transform-origin:left;animation:mlBar var(--ml-dur) linear both;box-shadow:0 0 10px #2ee6e6}
  .ml-skip{position:absolute;bottom:clamp(16px,3.5vh,30px);font-family:'Space Grotesk',system-ui,sans-serif;font-size:10px;
    font-weight:700;letter-spacing:.32em;color:rgba(255,255,255,.4);animation:mlFade .6s ease .9s both}
  @keyframes mlDrop{from{transform:translateY(-30px) scale(.55);opacity:0;filter:blur(8px)}to{transform:none;opacity:1;filter:none}}
  @keyframes mlSpin{to{transform:rotate(360deg)}}
  @keyframes mlPulse{50%{transform:scale(1.12);opacity:.65}}
  @keyframes mlFloat{50%{transform:translateY(-7px) rotate(-1.5deg)}}
  @keyframes mlShine{to{background-position:-60% 0}}
  @keyframes mlLetter{from{transform:translateY(26px) scale(.4);opacity:0}to{transform:none;opacity:1}}
  @keyframes mlFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes mlGame{from{opacity:0;transform:scale(.7);letter-spacing:.3em}to{opacity:1;transform:none}}
  @keyframes mlBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @media (prefers-reduced-motion:reduce){#ml-intro *,#ml-intro::before{animation-duration:.01s!important;animation-delay:0s!important;animation-iteration-count:1!important}}
  `;
  document.head.appendChild(css);

  /* Una vez por sesión y por página */
  const key = 'ml-intro:' + location.pathname;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}

  const dur = reduced ? 1400 : 3400;
  const el = document.createElement('div');
  el.id = 'ml-intro';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'MateLabs presenta' + (game ? ' ' + game : ''));
  el.style.setProperty('--ml-accent', accent);
  el.style.setProperty('--ml-dur', dur + 'ms');
  const letters = (s, cls, d0) => [...s].map((c, i) =>
    `<span class="${cls}" style="animation-delay:${(d0 + i * .06).toFixed(2)}s">${c}</span>`).join('');
  el.innerHTML = `
    <div class="ml-stage">
      <div class="ml-glow"></div><div class="ml-ring r2"></div><div class="ml-ring"></div>
      <div class="ml-float"><img src="${base}mascota.webp" alt="Mascota de MateLabs" draggable="false"></div>
    </div>
    <div class="ml-word">${letters('MATE', '', .55)}${letters('LABS', 'ml-labs', .79)}</div>
    <div class="ml-sub">PRESENTA</div>
    ${game ? `<div class="ml-game"></div>` : ''}
    <div class="ml-bar"><i></i></div>
    <div class="ml-skip">TOCÁ PARA SALTAR</div>`;
  if (game) el.querySelector('.ml-game').textContent = game;
  (document.body || document.documentElement).appendChild(el);

  /* Bloquear la entrada al juego mientras dura la intro */
  const t0 = performance.now();
  let done = false, released = true;
  const release = () => { if (released) return; released = true; evs.forEach(t => removeEventListener(t, block, { capture: true })); };
  const evs = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'];
  const block = e => {
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
    if (!done && (e.type === 'pointerdown' || e.type === 'keydown') && performance.now() - t0 > 350) finish();
    // fin del gesto que saltó la intro: liberar la entrada cuando termine este evento
    else if (done && (e.type === 'click' || e.type === 'keyup' || e.type === 'touchend')) queueMicrotask(release);
  };
  evs.forEach(t => addEventListener(t, block, { capture: true, passive: false }));
  const timer = setTimeout(finish, dur);

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.classList.add('ml-out');
    el.style.pointerEvents = 'none';
    /* Seguir bloqueando hasta que se suelte el toque/tecla que saltó la intro (así su pointerup/click/keyup
       no llega al juego). Se libera por evento y, como respaldo, por tiempo: algunos navegadores headless
       demoran los timers varios segundos después de un clic. */
    released = false;
    setTimeout(release, 450);
    let gone = false;
    const remove = () => { if (gone) return; gone = true; el.remove(); dispatchEvent(new Event('matelabs:intro-done')); };
    el.addEventListener('transitionend', e => { if (e.target === el && e.propertyName === 'opacity') remove(); });
    setTimeout(remove, 700);
  }
})();
