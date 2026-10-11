// Mateo: Ciudad de Altura — entrada unificada: teclado + mouse (con bloqueo de puntero), táctil (joystick flotante a la
// izquierda, arrastre de cámara a la derecha, botones grandes con multitouch) y gamepad estándar.
// El juego lee un estado por paso: ejes de movimiento, delta de cámara y botones (mantenido / flanco de bajada / subida).
import { clamp } from './util.js';

export const DEFAULT_KEYS = { jump: 'Space', cable: 'KeyF', action: 'KeyE', sprint: 'ShiftLeft', guard: 'KeyQ', dodge: 'KeyC', kick: 'KeyR', crouch: 'KeyX', map: 'KeyM', pause: 'Escape', suit: 'KeyT', inv: 'KeyI' };
const BTN = ['jump', 'cable', 'action', 'sprint', 'guard', 'dodge', 'kick', 'crouch', 'pause', 'map', 'suit', 'inv'];

export function createInput(canvas, ui, opts) {
  const keys = new Set();
  const held = Object.fromEntries(BTN.map(b => [b, false]));
  const down = Object.fromEntries(BTN.map(b => [b, false]));   // flanco de bajada desde el último paso
  const up = Object.fromEntries(BTN.map(b => [b, false]));     // flanco de subida
  const touchHeld = Object.fromEntries(BTN.map(b => [b, false]));
  const look = { dx: 0, dy: 0 };
  const joy = { x: 0, y: 0, active: false };
  let sprintToggle = false;
  let binds = { ...DEFAULT_KEYS, ...(opts.binds || {}) };
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  let enabled = true;

  function press(b, v) {
    if (v && !held[b]) down[b] = true;
    if (!v && held[b]) up[b] = true;
    held[b] = v;
  }
  function syncKeys() {
    for (const b of BTN) {
      const k = binds[b];
      let v = keys.has(k) || touchHeld[b];
      if (b === 'sprint') v = v || keys.has('ShiftRight');
      if (b === 'cable') v = v || mouseCable;
      if (b === 'pause') v = v || keys.has('KeyP');
      press(b, v);
    }
  }
  let mouseCable = false, zoomAcc = 0;
  const onKey = e => {
    if (!enabled) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.type === 'keydown') keys.add(e.code); else keys.delete(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    syncKeys();
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  // perder el foco o esconder la pestaña: soltar TODO (teclas, mouse, arrastres, joystick, pellizco, botones táctiles)
  function releaseAll() {
    keys.clear(); mouseCable = false; dragM = false; look.dx = look.dy = 0; zoomAcc = 0;
    for (const b of BTN) touchHeld[b] = false;
    sprintToggle = false;
    resetTouchPointers();
    syncKeys();
  }
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // mouse: clic bloquea el puntero; con el puntero bloqueado, clic izquierdo = cable
  canvas.addEventListener('mousedown', e => {
    if (!enabled || isTouch) return;
    if (e.button !== 0) return;
    if (document.pointerLockElement !== canvas) { try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* sin bloqueo */ } return; }
    mouseCable = true; syncKeys();
  });
  addEventListener('mouseup', e => { if (e.button === 0 && mouseCable) { mouseCable = false; syncKeys(); } });
  addEventListener('mousemove', e => { if (enabled && document.pointerLockElement === canvas) { look.dx += e.movementX; look.dy += e.movementY; } });
  // sin bloqueo (o en pruebas): arrastrar con botón derecho/medio también mueve la cámara
  var dragM = false, lx = 0, ly = 0; // (var: releaseAll se declara antes)
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 2) { dragM = true; lx = e.clientX; ly = e.clientY; } });
  addEventListener('pointermove', e => {
    if (!dragM || e.pointerType !== 'mouse') return;
    if (!(e.buttons & 6)) { dragM = false; return; } // el botón se soltó fuera de la ventana: no seguir girando
    look.dx += e.clientX - lx; look.dy += e.clientY - ly; lx = e.clientX; ly = e.clientY;
  });
  // zoom de cámara: rueda del mouse (o + / − del teclado)
  canvas.addEventListener('wheel', e => { if (!enabled) return; e.preventDefault(); zoomAcc -= Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.12; }, { passive: false });
  addEventListener('keydown', e => { if (!enabled || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return; if (e.code === 'Equal' || e.code === 'NumpadAdd') zoomAcc += 0.12; else if (e.code === 'Minus' || e.code === 'NumpadSubtract') zoomAcc -= 0.12; });
  addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 2) dragM = false; });

  /* ---------- táctil ---------- */
  const tc = ui.touch; // { root, joyBase, joyKnob, buttons: {jump, cable, action, sprint}, lookZone }
  let joyId = -1, jx0 = 0, jy0 = 0, lookId = -1, tlx = 0, tly = 0, pinchId = -1, px = 0, py = 0, pinchD = 0;
  const R = 58;
  function resetTouchPointers() {
    joyId = -1; lookId = -1; pinchId = -1; joy.x = joy.y = 0; joy.active = false;
    tc.joyKnob.style.transform = ''; tc.joyBase.classList.remove('on');
    tc.root.querySelectorAll('[data-btn]').forEach(b => b.classList.remove('on', 'lock'));
  }
  tc.root.addEventListener('pointerdown', e => {
    if (!enabled) return;
    const btn = /** @type {HTMLElement} */ (e.target).closest('[data-btn]');
    if (btn) {
      const b = btn.getAttribute('data-btn');
      btn.setPointerCapture(e.pointerId); btn.classList.add('on');
      if (b === 'sprint' && opts.sprintToggle()) { sprintToggle = !sprintToggle; touchHeld.sprint = sprintToggle; btn.classList.toggle('lock', sprintToggle); }
      else touchHeld[b] = true;
      if (navigator.vibrate && opts.haptics()) navigator.vibrate(8);
      syncKeys(); e.preventDefault(); return;
    }
    if (e.clientX < innerWidth * 0.42 && joyId === -1) {
      joyId = e.pointerId; jx0 = e.clientX; jy0 = e.clientY; joy.active = true;
      tc.joyBase.style.transform = `translate(${jx0 - R}px,${jy0 - R}px)`; tc.joyBase.classList.add('on');
      tc.root.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    if (lookId === -1) { lookId = e.pointerId; tlx = e.clientX; tly = e.clientY; tc.root.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    // segundo dedo en la zona de cámara: pellizco para acercar/alejar
    if (pinchId === -1) { pinchId = e.pointerId; px = e.clientX; py = e.clientY; pinchD = Math.hypot(px - tlx, py - tly); tc.root.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  tc.root.addEventListener('pointermove', e => {
    if (e.pointerId === joyId) {
      let dx = (e.clientX - jx0) / R, dy = (e.clientY - jy0) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      const dz = 0.12, m = Math.hypot(dx, dy);
      const k = m < dz ? 0 : (m - dz) / (1 - dz) / (m || 1);
      joy.x = dx * k; joy.y = dy * k;
      tc.joyKnob.style.transform = `translate(${dx * R * 0.6}px,${dy * R * 0.6}px)`;
    } else if (e.pointerId === lookId || e.pointerId === pinchId) {
      if (pinchId !== -1) { // con dos dedos sólo se hace zoom (no gira)
        if (e.pointerId === lookId) { tlx = e.clientX; tly = e.clientY; } else { px = e.clientX; py = e.clientY; }
        const d = Math.hypot(px - tlx, py - tly);
        if (pinchD > 20 && d > 20) zoomAcc += Math.log(d / pinchD);
        pinchD = d;
      } else { look.dx += (e.clientX - tlx) * 1.4; look.dy += (e.clientY - tly) * 1.4; tlx = e.clientX; tly = e.clientY; }
    }
  });
  const endTouch = e => {
    const btn = /** @type {HTMLElement} */ (e.target).closest?.('[data-btn]');
    if (btn) { const b = btn.getAttribute('data-btn'); btn.classList.remove('on'); if (!(b === 'sprint' && opts.sprintToggle())) touchHeld[b] = false; syncKeys(); return; }
    if (e.pointerId === joyId) { joyId = -1; joy.x = joy.y = 0; joy.active = false; tc.joyKnob.style.transform = ''; tc.joyBase.classList.remove('on'); }
    if (e.pointerId === pinchId) pinchId = -1;
    if (e.pointerId === lookId) { if (pinchId !== -1) { lookId = pinchId; tlx = px; tly = py; pinchId = -1; } else lookId = -1; }
  };
  tc.root.addEventListener('pointerup', endTouch); tc.root.addEventListener('pointercancel', endTouch); tc.root.addEventListener('lostpointercapture', endTouch);

  /* ---------- gamepad ---------- */
  const pad = { x: 0, y: 0, lx: 0, ly: 0, b: {} };
  function pollPad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...gps].find(Boolean);
    if (!gp || !gp.connected || (navigator.webdriver && !new URLSearchParams(location.search).has('gamepad'))) { pad.x = pad.y = pad.lx = pad.ly = 0; pad.b = {}; pad.on = false; return; }
    pad.on = true;
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    pad.x = dz(gp.axes[0] || 0); pad.y = dz(gp.axes[1] || 0); pad.lx = dz(gp.axes[2] || 0); pad.ly = dz(gp.axes[3] || 0);
    const p = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
    pad.b = { jump: p(0), action: p(2), dodge: p(1), kick: p(3), guard: p(6), cable: p(5) || p(7), sprint: p(4) || p(10), pause: p(9), crouch: p(11) };
  }

  return {
    isTouch,
    get binds() { return binds; },
    setBinds(b) { binds = { ...DEFAULT_KEYS, ...b }; syncKeys(); },
    /** Llamar una vez por cuadro de render (lee el gamepad). dt en segundos: el giro con stick no depende de los FPS. */
    poll(dt = 1 / 60) {
      const had = pad.on;
      pollPad();
      // con o sin mando se recalcula todo: si el mando se desconecta con un botón apretado, ese botón se suelta
      if (pad.on || had) for (const b of BTN) { const v = !!pad.b[b] || keys.has(binds[b]) || touchHeld[b] || (b === 'cable' && mouseCable) || (b === 'sprint' && keys.has('ShiftRight')) || (b === 'pause' && keys.has('KeyP')); press(b, v); }
      const k = Math.min(0.1, dt) * 60;
      if (pad.lx || pad.ly) { look.dx += pad.lx * 14 * k; look.dy += pad.ly * 10 * k; }
    },
    /** zoom acumulado (positivo = acercar) desde el último paso */
    takeZoom() { const z = zoomAcc; zoomAcc = 0; return z; },
    releaseAll,
    get pad() { return { ...pad, b: { ...pad.b } }; },
    /** Eje de movimiento: x derecha, y adelante (+1 = adelante). */
    axis() {
      let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      if (joy.active) { x = joy.x; y = -joy.y; }
      if (pad.x || pad.y) { x = pad.x; y = -pad.y; }
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y, mag: Math.min(1, l), analog: joy.active || !!(pad.x || pad.y) };
    },
    held: b => held[b], pressed: b => down[b], released: b => up[b],
    takeLook() { const r = { dx: look.dx, dy: look.dy }; look.dx = look.dy = 0; return r; },
    consume(b) { down[b] = false; },
    endStep() { for (const b of BTN) { down[b] = false; up[b] = false; } },
    setEnabled(v) { enabled = v; if (!v) { keys.clear(); mouseCable = false; for (const b of BTN) { touchHeld[b] = false; } joy.x = joy.y = 0; syncKeys(); } },
    clear() { keys.clear(); mouseCable = false; dragM = false; zoomAcc = 0; look.dx = look.dy = 0; for (const b of BTN) { touchHeld[b] = false; held[b] = false; down[b] = false; up[b] = false; } sprintToggle = false; resetTouchPointers(); },
    get joy() { return joy; },
    clamp,
  };
}
