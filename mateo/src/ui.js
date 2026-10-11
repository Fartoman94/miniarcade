// Mateo: Ciudad de Altura — interfaz: HUD (energía, carga de súper salto, medallas, objetivo con distancia y tiempo,
// minimapa con brújula, aviso de acción, mensajes, diálogos subtitulados), pantallas (inicio, pausa, ajustes, ayuda con
// pictogramas, misiones) y controles táctiles. Escribe al DOM sólo cuando algo cambia.
import { esc } from './util.js';

export function createUI(root) {
  root.innerHTML = `
  <div id="hud-status" class="hud panel" hidden><div class="nm"><span class="badgeM">M</span>MATEO <span id="hs-lvl" style="margin-left:auto;font-size:11px;opacity:.8"></span></div>
    <div class="bar" id="hs-bar" role="meter" aria-label="Energía"><i></i></div><div class="charge" id="hs-charge" hidden><i></i></div>
    <div class="row"><span id="hs-medals">🏅 0/20</span><span id="hs-pts">0 pts</span></div>
    <div class="row"><span id="hs-money" title="Monedas M (de juego)">🪙 0 M</span><span id="hs-clock">🕙 10:00</span><span id="hs-mode" class="mode"></span></div></div>
  <div id="hud-obj" class="hud panel" hidden><div class="k">MISIÓN</div><b id="ho-name"></b><div id="ho-step"></div><div class="hint" id="ho-hint"></div><div class="d" id="ho-dist"></div><div class="tm" id="ho-time"></div></div>
  <div id="hud-map" class="hud" hidden title="Mapa completo (M)"><canvas width="300" height="300" aria-label="Minimapa: tocalo para abrir el mapa completo"></canvas></div>
  <div id="hud-notify" class="hud" role="status" aria-live="polite"></div>
  <div id="hud-compass" class="hud" hidden></div>
  <button id="btn-pause" aria-label="Pausa" title="Pausa (Esc)" hidden>❚❚</button>
  <button id="btn-suit" class="sbtn" aria-label="Cambiar traje" title="Traje / ropa civil (T)" hidden>M</button>
  <button id="btn-inv" class="sbtn" aria-label="Mochila" title="Mochila (I)" hidden>🎒</button>
  <div id="fade"></div>
  <div id="hud-prompt" class="hud panel" hidden></div>
  <div id="hud-toast" class="hud panel" role="status" aria-live="polite"></div>
  <div id="hud-big" class="hud"><b></b><small></small></div>
  <div id="hud-dialog" class="hud panel" hidden role="dialog" aria-live="polite"><div class="av"></div><div><div class="who"></div><p></p></div><div class="nx"></div></div>
  <div id="hud-hit" class="hud"></div>
  <div id="hud-perf" class="hud panel" hidden aria-hidden="true"></div>
  <div id="hud-rot" class="hud panel" hidden>📱↻ Girá el teléfono para ver mejor la ciudad</div>
  <div id="touch" hidden><div id="joyHint">MOVER</div><div id="joy"><i></i></div>
    <div id="tbtns"><button data-btn="action" aria-label="Acción">✦<small>ACCIÓN</small></button><button data-btn="sprint" aria-label="Correr">»<small>CORRER</small></button>
    <button data-btn="cable" aria-label="Cable">◉<small>CABLE</small></button><button data-btn="jump" aria-label="Saltar">⤒<small>SALTO</small></button></div>
    <div id="tcombat"><button data-btn="guard" aria-label="Guardia">🛡<small>GUARDIA</small></button><button data-btn="dodge" aria-label="Esquivar">↺<small>ESQUIVA</small></button><button data-btn="kick" aria-label="Patada">✸<small>PATADA</small></button></div></div>
  <div id="scr" class="scr" hidden><div class="card"></div></div>`;
  const $ = s => /** @type {HTMLElement} */ (root.querySelector(s));
  const E = {
    status: $('#hud-status'), bar: $('#hs-bar'), barI: $('#hs-bar i'), charge: $('#hs-charge'), chargeI: $('#hs-charge i'), medals: $('#hs-medals'), pts: $('#hs-pts'), lvl: $('#hs-lvl'),
    obj: $('#hud-obj'), oName: $('#ho-name'), oStep: $('#ho-step'), oHint: $('#ho-hint'), oDist: $('#ho-dist'), oTime: $('#ho-time'),
    money: $('#hs-money'), clock: $('#hs-clock'), mode: $('#hs-mode'), suit: $('#btn-suit'), inv: $('#btn-inv'), fade: $('#fade'),
    notify: $('#hud-notify'), map: $('#hud-map'), canvas: /** @type {HTMLCanvasElement} */ ($('#hud-map canvas')), compass: $('#hud-compass'), pause: $('#btn-pause'),
    prompt: $('#hud-prompt'), toast: $('#hud-toast'), big: $('#hud-big'), bigB: $('#hud-big b'), bigS: $('#hud-big small'),
    dialog: $('#hud-dialog'), dWho: $('#hud-dialog .who'), dP: $('#hud-dialog p'), dAv: $('#hud-dialog .av'), dNx: $('#hud-dialog .nx'), hit: $('#hud-hit'), rot: $('#hud-rot'), perf: $('#hud-perf'),
    touch: $('#touch'), joy: $('#joy'), actLabel: $('#tbtns [data-btn="action"] small'), joyK: $('#joy i'), scr: $('#scr'), card: $('#scr .card'),
  };
  const ctx = /** @type {CanvasRenderingContext2D} */ (E.canvas.getContext('2d'));
  const cache = {};
  const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
  let toastT = 0, bigT = 0, hitT = 0;
  const notes = []; // V2 P3: avisos apilados (misión, paso cumplido, reputación, distrito descubierto)
  const notesLog = [];
  for (const t of ['pointerdown', 'mousedown', 'touchstart']) { E.scr.addEventListener(t, e => e.stopPropagation()); E.dialog.addEventListener(t, e => e.stopPropagation()); }

  return {
    E, touch: { root: E.touch, joyBase: E.joy, joyKnob: E.joyK },
    /** @param {boolean} on */
    show(on) { for (const k of ['status', 'obj', 'map', 'compass', 'pause', 'suit', 'inv', 'notify']) E[k].hidden = !on; if (!on) { E.prompt.hidden = true; E.dialog.hidden = true; cache.pr = ''; } },
    showTouch(on) { E.touch.hidden = !on; },
    /** V2: botones de combate contextuales (aparecen con un villano cerca) */
    combat(on) { set('cb', on ? '1' : '', v => { E.touch.classList.toggle('combat', !!v); E.actLabel.textContent = v ? 'GOLPE' : 'ACCIÓN'; }); },

    /** panel de rendimiento (Ajustes → Mostrar rendimiento, o F3) */
    perf(on) { E.perf.hidden = !on; },
    perfText(t) { set('pf', t, v => { E.perf.textContent = v; }); },
    status(s) {
      set('hp', String(Math.round(s.health)), v => { E.barI.style.width = v + '%'; E.bar.classList.toggle('low', +v < 35); E.bar.setAttribute('aria-valuenow', v); });
      set('ch', s.charge > 0 ? String(Math.round(s.charge * 100)) : '', v => { E.charge.hidden = !v; if (v) E.chargeI.style.width = v + '%'; });
      set('md', `🏅 ${s.medals}/${s.medalsTotal}`, v => E.medals.textContent = v);
      set('pt', `${s.points} pts`, v => E.pts.textContent = v);
      set('lv', s.level, v => E.lvl.textContent = v);
      // V2 P2: monedas, reloj y modo (civil / héroe)
      if (s.money !== undefined) set('mn', `🪙 ${s.money} M`, v => E.money.textContent = v);
      if (s.clock) set('ck', s.clock, v => E.clock.textContent = v);
      if (s.mode) set('mo', s.mode, v => { E.mode.textContent = v === 'hero' ? 'HÉROE' : 'CIVIL'; E.mode.className = 'mode ' + v; E.suit.classList.toggle('civil', v === 'civil'); });
    },
    objective(o) {
      set('on', o ? o.name : '', v => { E.obj.hidden = !v; E.oName.textContent = v; });
      set('ok', o && o.kind ? o.kind : 'MISIÓN', v => { E.obj.querySelector('.k').textContent = v; E.obj.classList.toggle('inc', v !== 'MISIÓN' && v !== 'HISTORIA'); E.obj.classList.toggle('story', v === 'HISTORIA'); });
      if (!o) return;
      set('os', o.step || '', v => E.oStep.textContent = v);
      set('oh', o.hint || '', v => { E.oHint.textContent = v; E.oHint.hidden = !v; });
      set('od', o.dist != null ? `▲ ${Math.round(o.dist)} m${o.dy > 4 ? ' · ↑ ' + Math.round(o.dy) + ' m arriba' : o.dy < -4 ? ' · ↓ abajo' : ''}` : '', v => E.oDist.textContent = v);
      set('ot', o.time != null ? (o.time > 0 ? `⏱ ${o.time.toFixed(1)} s` : '') : '', v => E.oTime.textContent = v);
    },
    compass(text) { set('cp', text, v => E.compass.textContent = v); },
    /** dibuja el minimapa: draw(ctx, W) */
    map(draw) { ctx.clearRect(0, 0, 300, 300); draw(ctx, 300); },
    prompt(html) { set('pr', html || '', v => { E.prompt.hidden = !v; E.prompt.innerHTML = v; }); },
    toast(t, ms = 2400) { E.toast.textContent = t; E.toast.classList.add('on'); toastT = ms / 1000; },
    big(t, s = '', sec = 1.6) { E.bigB.textContent = t; E.bigS.textContent = s; E.big.classList.add('on'); bigT = sec; },
    hit(reduced) { if (reduced) return; E.hit.classList.add('on'); hitT = 0.15; },
    dialog(d) {
      if (!d) { E.dialog.hidden = true; cache.dl = ''; return; }
      set('dl', d.who + d.text, () => { E.dWho.textContent = d.who; E.dP.textContent = d.text; E.dAv.textContent = d.icon || d.who[0]; E.dAv.style.background = d.color || '#2f6db0'; E.dNx.textContent = d.hint || ''; });
      E.dialog.hidden = false;
    },
    /** fundido a negro corto (entrar/salir de casa, dormir): sólo visual, la lógica no espera */
    fade() { E.fade.classList.remove('on'); void E.fade.offsetWidth; E.fade.classList.add('on'); },
    /** V2 P3: aviso apilado (no pisa al mensaje central ni a los demás); se va solo a los 3,5 s de juego */
    notify(icon, text, kind = 'info') {
      const el = document.createElement('div'); el.className = 'note panel ' + kind;
      const i = document.createElement('span'); i.className = 'ni'; i.textContent = icon; const t = document.createElement('span'); t.textContent = text;
      el.append(i, t); E.notify.prepend(el); notes.push({ el, t: 3.5 });
      while (notes.length > 3) notes.shift().el.remove();
      notesLog.push(text); if (notesLog.length > 30) notesLog.shift();
    },
    get notes() { return notes.map(n => n.el.textContent); },
    get notesLog() { return notesLog.slice(); },
    rotateHint(on) { set('rot', on ? '1' : '', v => E.rot.hidden = !v); },
    tick(dt) {
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) E.toast.classList.remove('on'); }
      if (bigT > 0) { bigT -= dt; if (bigT <= 0) E.big.classList.remove('on'); }
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) E.hit.classList.remove('on'); }
      for (let k = notes.length - 1; k >= 0; k--) if ((notes[k].t -= dt) <= 0) { notes[k].el.remove(); notes.splice(k, 1); }
    },
    get bigText() { return E.big.classList.contains('on') ? E.bigB.textContent : ''; },
    /** pantalla genérica */
    screen(html) { E.card.innerHTML = html; E.scr.classList.toggle('side', html.includes('class="life"') && html.includes('ROPERO')); E.scr.hidden = false; const b = /** @type {HTMLElement|null} */ (E.card.querySelector('.b')); b && b.focus({ preventScroll: true }); },
    hideScreen() { E.scr.hidden = true; if (E.scr.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur(); },
    get screenOpen() { return !E.scr.hidden; },
    onScreen(sel, fn) { E.scr.addEventListener('click', e => { const t = /** @type {HTMLElement} */ (e.target).closest(sel); if (t) fn(t); }); },
    esc,
  };
}
