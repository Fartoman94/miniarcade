// @ts-check
/* Derby de Chatarra — volante táctil propio (reemplaza al joystick genérico de Kit3D en celulares).
   - Zona grande en la mitad izquierda: se apoya el pulgar en cualquier lado (sin salto inicial: la dirección
     es relativa al punto donde tocaste) y se arrastra en horizontal; el eje vertical se ignora.
   - El ancla «sigue» al dedo si te pasás del tope, así volver al centro o contravolantear es inmediato.
   - Zona muerta chica y curva suave cerca del centro para correcciones finas; el dibujo del volante gira
     con la dirección y aparece debajo del pulgar.
   - Vibración corta opcional (navigator.vibrate) en los botones táctiles. */

const SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" stroke-width="9"/>
<circle cx="50" cy="50" r="11" fill="currentColor"/><path d="M50 50 L12 44 M50 50 L88 44 M50 50 L50 92" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
<rect x="45" y="3" width="10" height="11" rx="3" fill="#b8f52a"/></svg>`;

/**
 * @param {HTMLElement} layer contenedor táctil de Kit3D (.k3-touch): se oculta junto con los botones
 * @param {{haptics:()=>boolean}} o
 */
export function createWheel(layer, o) {
  const zone = document.createElement('div');
  zone.className = 'dc-wheelzone';
  zone.setAttribute('role', 'slider');
  zone.setAttribute('aria-label', 'Volante');
  zone.setAttribute('aria-valuemin', '-100'); zone.setAttribute('aria-valuemax', '100'); zone.setAttribute('aria-valuenow', '0');
  zone.innerHTML = `<div class="dc-wheel">${SVG}<span>VOLANTE</span></div>`;
  layer.appendChild(zone);
  const wheel = /** @type {HTMLElement} */ (zone.firstElementChild);
  const R = 58;       // px de arrastre para llegar al tope
  const DEAD = 0.05;  // zona muerta
  const st = { x: 0, active: false, id: -1, ax: 0 };
  const draw = () => {
    wheel.style.setProperty('--rot', (st.x * 120).toFixed(1) + 'deg');
    zone.setAttribute('aria-valuenow', String(Math.round(st.x * 100)));
  };
  /** @param {PointerEvent} e */
  const move = e => {
    if (e.pointerId !== st.id) return;
    let dx = e.clientX - st.ax;
    if (dx > R) { st.ax = e.clientX - R; dx = R; } else if (dx < -R) { st.ax = e.clientX + R; dx = -R; }
    let v = dx / R;
    const a = Math.abs(v);
    v = a < DEAD ? 0 : Math.sign(v) * Math.pow((a - DEAD) / (1 - DEAD), 1.25);
    st.x = v; draw();
  };
  zone.addEventListener('pointerdown', e => {
    if (st.id !== -1) return;
    st.id = e.pointerId; st.ax = e.clientX; st.active = true; st.x = 0;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
    const r = zone.getBoundingClientRect();
    // el dibujo del volante aparece bajo el pulgar (dentro de la zona)
    const h = wheel.offsetWidth / 2;
    const cx = Math.min(r.width - h, Math.max(h, e.clientX - r.left)), cy = Math.min(r.height - h, Math.max(h, e.clientY - r.top));
    wheel.style.left = (cx - h) + 'px'; wheel.style.top = (cy - h) + 'px'; wheel.style.bottom = 'auto';
    wheel.classList.add('on'); draw();
    e.preventDefault();
  });
  zone.addEventListener('pointermove', move);
  /** @param {PointerEvent} e */
  const end = e => {
    if (e.pointerId !== st.id) return;
    st.id = -1; st.active = false; st.x = 0;
    wheel.classList.remove('on'); wheel.style.left = wheel.style.top = wheel.style.bottom = ''; draw();
  };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end); zone.addEventListener('lostpointercapture', end);
  addEventListener('blur', () => { st.id = -1; st.active = false; st.x = 0; wheel.classList.remove('on'); draw(); });

  // vibración corta al apretar cualquier botón táctil (si el usuario no la apagó)
  layer.addEventListener('pointerdown', e => {
    if (/** @type {HTMLElement} */ (e.target).closest('.k3-btn')) buzz(8);
  }, true);
  /** @param {number|number[]} ms */
  function buzz(ms) {
    if (!o.haptics()) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (err) { /* sin soporte */ }
  }
  return {
    get x() { return st.x; },
    get active() { return st.active; },
    reset() { st.id = -1; st.active = false; st.x = 0; wheel.classList.remove('on'); draw(); },
    buzz,
    el: zone,
  };
}
