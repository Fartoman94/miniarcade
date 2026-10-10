// @ts-check
/* MateLabs Kit3D — base común para los juegos 3D nuevos de MiniArcade (Three.js moderno, módulos ES).

   Cada juego nuevo es una página propia con un import map:
     <script type="importmap">{"imports":{"three":"./vendor/three-0.186.1/build/three.module.js",
                                          "three/addons/":"./vendor/three-0.186.1/addons/"}}</script>
     <script src="matelabs/arcade.js"></script> <script src="matelabs/missions.js"></script>
     <script type="module"> import { createGame } from './matelabs/kit3d.js'; ... </script>

   Qué resuelve (para que cada juego se concentre en su mecánica):
   - renderer + escena + cámara, tamaño y DPR según la calidad del SDK (low/medium/high);
   - loop de paso fijo (1/60 s) con render variable, integrado con la pausa del SDK y el ciclo de vida;
   - entrada unificada: teclado, puntero, joystick táctil y botones táctiles configurables;
   - audio sintetizado con ganancia maestra (respeta el silencio global);
   - carga de GLB cacheada (con arreglo de colores por vértice y normales de los modelos del paquete);
   - guardado versionado con recuperación de datos corruptos;
   - pantallas (menú, fin, tutorial), avisos y liberación de recursos al salir.
   Ningún juego está obligado a usar todo: son piezas independientes. */
import * as THREE from 'three';

const A = () => /** @type {any} */ (window).MLArcade;
const M = () => /** @type {any} */ (window).MLMissions;

/* ======================= guardado versionado ======================= */
/**
 * @template T
 * @param {string} key clave de localStorage
 * @param {number} version versión del esquema
 * @param {T} defaults valores por defecto
 * @param {(old:any, fromVersion:number)=>T} [migrate] migra datos de versiones anteriores
 */
export function createSave(key, version, defaults, migrate) {
  /** @type {T} */
  let data = structuredClone(defaults);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'number') throw new Error('formato');
      if (parsed.v === version) data = { ...structuredClone(defaults), ...parsed.d };
      else if (migrate) data = { ...structuredClone(defaults), ...migrate(parsed.d, parsed.v) };
    }
  } catch (e) {
    // dato corrupto: se descarta (se guarda una copia para diagnóstico) y se sigue con los valores por defecto
    try { const bad = localStorage.getItem(key); if (bad) localStorage.setItem(key + ':corrupto', bad); } catch (_) { /* nada */ }
    if (A()) A().track('save-corrupt', { key });
  }
  return {
    get: () => data,
    /** @param {Partial<T>} patch */
    set(patch) { Object.assign(/** @type {any} */ (data), patch); this.flush(); },
    flush() { try { localStorage.setItem(key, JSON.stringify({ v: version, d: data })); } catch (e) { /* sin almacenamiento */ } },
    reset() { data = structuredClone(defaults); this.flush(); },
  };
}

/* ======================= audio ======================= */
export function createAudio() {
  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {GainNode|null} */ let master = null;
  let muted = !!(A() && A().settings.get('muted'));
  const last = new Map();
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  /**
   * Tono sintetizado. Se descarta si el mismo id sonó hace menos de `gap` segundos (evita saturar).
   * @param {{f?:number, f2?:number, d?:number, type?:OscillatorType, v?:number, gap?:number, id?:string, noise?:boolean}} o
   */
  function tone(o) {
    if (muted) return;
    const c = ensure(); if (!c || !master) return;
    const now = c.currentTime, id = o.id || '';
    if (id && now - (last.get(id) || -1) < (o.gap ?? 0.04)) return;
    if (id) last.set(id, now);
    const d = o.d ?? 0.15, g = c.createGain();
    g.gain.setValueAtTime(o.v ?? 0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + d);
    g.connect(master);
    if (o.noise) {
      const len = Math.max(1, Math.floor(c.sampleRate * d)), buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf; src.connect(g); src.start(now); src.onended = () => g.disconnect();
      return;
    }
    const osc = c.createOscillator(); osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f ?? 440, now);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), now + d);
    osc.connect(g); osc.start(now); osc.stop(now + d + 0.02);
    osc.onended = () => { osc.disconnect(); g.disconnect(); };
  }
  return {
    tone,
    /** @param {boolean} m */
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    resume() { if (ctx && ctx.state === 'suspended' && !muted) ctx.resume().catch(() => {}); },
    close() { if (ctx) { ctx.close().catch(() => {}); ctx = null; master = null; } },
    get ctx() { return ctx; },
  };
}

/* ======================= entrada ======================= */
/**
 * @param {HTMLElement} root contenedor del juego (para los controles táctiles)
 * @param {{joystick?:boolean|'left'|'right', buttons?:{id:string,label:string,key?:string}[], look?:boolean}} [opts]
 */
export function createInput(root, opts = {}) {
  const keys = new Set();
  const pressed = new Set(); // flancos: teclas apretadas en este cuadro
  const touch = { x: 0, y: 0, active: false };
  const look = { dx: 0, dy: 0 };
  const buttons = new Map();
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.type === 'keydown') { if (!e.repeat) pressed.add(e.code); keys.add(e.code); }
    else keys.delete(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };
  const onBlur = () => { keys.clear(); touch.x = touch.y = 0; touch.active = false; buttons.forEach(b => b.down = false); };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey); addEventListener('blur', onBlur);

  // controles táctiles
  const ui = document.createElement('div');
  ui.className = 'k3-touch';
  ui.innerHTML = `<style>
    .k3-touch{position:fixed;inset:0;pointer-events:none;z-index:40}
    .k3-joy{position:absolute;bottom:max(24px,env(safe-area-inset-bottom));width:132px;height:132px;border-radius:50%;
      background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.25);pointer-events:auto;touch-action:none}
    .k3-joy.left{left:max(20px,env(safe-area-inset-left))}.k3-joy.right{right:max(20px,env(safe-area-inset-right))}
    .k3-joy i{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px;border-radius:50%;background:rgba(255,255,255,.35)}
    .k3-btns{position:absolute;right:max(16px,env(safe-area-inset-right));bottom:max(28px,env(safe-area-inset-bottom));display:flex;flex-wrap:wrap-reverse;gap:12px;
      justify-content:flex-end;max-width:220px;pointer-events:none}
    .k3-btn{pointer-events:auto;touch-action:none;width:68px;height:68px;border-radius:50%;border:2px solid rgba(255,255,255,.35);
      background:rgba(10,14,22,.55);color:#fff;font:800 13px system-ui,sans-serif;display:grid;place-items:center;user-select:none;-webkit-user-select:none}
    .k3-btn.on{background:rgba(46,230,230,.4)}
    .k3-touch[hidden]{display:none}
  </style>`;
  /** @type {HTMLElement|null} */ let joyEl = null;
  if (opts.joystick) {
    joyEl = document.createElement('div');
    joyEl.className = 'k3-joy ' + (opts.joystick === 'right' ? 'right' : 'left');
    joyEl.innerHTML = '<i></i>';
    ui.appendChild(joyEl);
    const knob = /** @type {HTMLElement} */ (joyEl.firstElementChild);
    let id = -1;
    const move = (/** @type {PointerEvent} */ e) => {
      if (e.pointerId !== id || !joyEl) return;
      const r = joyEl.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      touch.x = dx; touch.y = dy; touch.active = true;
      knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
    };
    joyEl.addEventListener('pointerdown', e => { id = e.pointerId; joyEl && joyEl.setPointerCapture(id); move(e); e.preventDefault(); });
    joyEl.addEventListener('pointermove', move);
    const end = (/** @type {PointerEvent} */ e) => { if (e.pointerId !== id) return; id = -1; touch.x = touch.y = 0; touch.active = false; knob.style.transform = ''; };
    joyEl.addEventListener('pointerup', end); joyEl.addEventListener('pointercancel', end);
  }
  if (opts.buttons && opts.buttons.length) {
    const wrap = document.createElement('div'); wrap.className = 'k3-btns'; ui.appendChild(wrap);
    for (const b of opts.buttons) {
      const el = document.createElement('div'); el.className = 'k3-btn'; el.textContent = b.label; el.setAttribute('role', 'button'); el.setAttribute('aria-label', b.id);
      const st = { down: false, el, key: b.key || '' };
      buttons.set(b.id, st);
      el.addEventListener('pointerdown', e => { st.down = true; el.classList.add('on'); pressed.add('btn:' + b.id); e.preventDefault(); el.setPointerCapture(e.pointerId); });
      const up = () => { st.down = false; el.classList.remove('on'); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      wrap.appendChild(el);
    }
  }
  // arrastre de cámara (táctil fuera de los controles, o mouse con botón derecho/izquierdo según el juego)
  if (opts.look) {
    let lid = -1, lx = 0, ly = 0;
    root.addEventListener('pointerdown', e => { if (lid !== -1) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    root.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; look.dx += e.clientX - lx; look.dy += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
    const lend = (/** @type {PointerEvent} */ e) => { if (e.pointerId === lid) lid = -1; };
    root.addEventListener('pointerup', lend); root.addEventListener('pointercancel', lend);
  }
  ui.hidden = !isTouch;
  document.body.appendChild(ui);

  return {
    isTouch,
    /** @param {string} code */ down: code => keys.has(code),
    /** @param {...string} codes */ any: (...codes) => codes.some(c => keys.has(c)),
    /** Flanco de bajada (una vez por pulsación) de teclas o botones ('btn:id'). @param {...string} codes */
    hit: (...codes) => codes.some(c => pressed.has(c)),
    /** @param {string} id */ button: id => { const b = buttons.get(id); return !!(b && b.down) || !!(b && b.key && keys.has(b.key)); },
    /** Eje de movimiento combinado (WASD/flechas + joystick), x derecha, y abajo (pantalla). */
    axis() {
      let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      if (touch.active) { x = touch.x; y = touch.y; }
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },
    /** Desplazamiento acumulado de cámara desde la última lectura. */
    takeLook() { const r = { dx: look.dx, dy: look.dy }; look.dx = look.dy = 0; return r; },
    /** Llamar al final de cada paso de simulación. */
    endStep() { pressed.clear(); },
    clear: onBlur,
    /** @param {boolean} v */ showTouch(v) { ui.hidden = !v || !isTouch; },
    dispose() { removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); removeEventListener('blur', onBlur); ui.remove(); },
  };
}

/* ======================= carga de modelos ======================= */
/** @type {Map<string, Promise<any>>} */
const glbCache = new Map();
/**
 * Carga un GLB (cacheado) y devuelve un clon listo para usar.
 * Los GLB del paquete MiniArcade traen colores por vértice sin normales: se corrigen acá.
 * @param {string} url
 */
export async function loadGLB(url) {
  if (!glbCache.has(url)) {
    glbCache.set(url, import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url)).then(g => {
      g.scene.traverse(/** @param {any} o */ o => {
        if (!o.isMesh) return;
        if (!o.geometry.getAttribute('normal')) o.geometry.computeVertexNormals();
        const hasColor = !!o.geometry.getAttribute('color');
        const old = o.material;
        o.material = new THREE.MeshStandardMaterial({ color: hasColor ? 0xffffff : (old.color || 0xcccccc), vertexColors: hasColor, roughness: .8, metalness: .05, flatShading: true });
        old.dispose && old.dispose();
        o.castShadow = o.receiveShadow = true;
      });
      return g;
    }).catch(err => { glbCache.delete(url); throw err; }));
  }
  const g = await /** @type {Promise<any>} */ (glbCache.get(url));
  return g.scene.clone(true);
}

/* ======================= liberar recursos ======================= */
/** @param {THREE.Object3D} root */
export function disposeTree(root) {
  root.traverse(/** @param {any} o */ o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
      m.dispose();
    }
  });
}

/* ======================= UI: pantallas, HUD, avisos ======================= */
const UI_CSS = `
.k3-screen{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;
  background:radial-gradient(80% 70% at 50% 40%,rgba(10,16,28,.72),rgba(2,4,8,.92));color:#fff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;overflow:auto}
.k3-screen[hidden]{display:none}
.k3-panel{width:min(560px,100%);display:flex;flex-direction:column;gap:12px;text-align:center;align-items:center;margin:auto}
.k3-panel h1{font:400 clamp(34px,8vw,64px)/1 'Bungee',system-ui,sans-serif;margin:0;letter-spacing:.02em;text-shadow:0 4px 0 rgba(0,0,0,.35),0 0 30px var(--k3-accent,#2ee6e6)}
.k3-panel p{margin:0;line-height:1.5;color:#cfe2ea;max-width:46ch}
.k3-panel .k3-kicker{font-size:11px;font-weight:800;letter-spacing:.3em;color:var(--k3-accent,#2ee6e6)}
.k3-btnrow{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.k3-b{appearance:none;border:none;border-radius:14px;padding:14px 22px;font:400 15px 'Bungee',system-ui,sans-serif;cursor:pointer;background:var(--k3-accent,#2ee6e6);color:#06121a}
.k3-b.alt{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.25)}
.k3-b:focus-visible{outline:3px solid #fff;outline-offset:3px}
.k3-list{list-style:none;padding:0;margin:0;text-align:left;font-size:14px;color:#dbe8ee;display:grid;gap:4px}
.k3-hud{position:fixed;z-index:30;pointer-events:none;color:#fff;font:800 14px system-ui,sans-serif;text-shadow:0 2px 6px rgba(0,0,0,.6)}
.k3-toast{position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:45;pointer-events:none;padding:10px 18px;border-radius:14px;
  background:rgba(6,12,20,.82);border:1px solid rgba(255,255,255,.2);color:#fff;font:800 15px system-ui,sans-serif;opacity:0;transition:opacity .25s;text-align:center;max-width:90vw}
.k3-toast.on{opacity:1}
.k3-load{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:#05080e;color:#9fd;font:700 13px system-ui;letter-spacing:.2em}
@media (prefers-reduced-motion:reduce){.k3-toast{transition:none}}
`;
let uiCss = false;
function ensureUiCss() { if (uiCss) return; uiCss = true; const s = document.createElement('style'); s.textContent = UI_CSS; document.head.appendChild(s); }

/** Pantalla superpuesta (menú, fin, tutorial). Devuelve el elemento y helpers. */
export function screen(html, { accent = '#2ee6e6', id = '' } = {}) {
  ensureUiCss();
  const el = document.createElement('div');
  el.className = 'k3-screen'; if (id) el.id = id;
  el.style.setProperty('--k3-accent', accent);
  el.innerHTML = `<div class="k3-panel">${html}</div>`;
  // mientras se ve, los toques/teclas sobre la pantalla no llegan al juego
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'keydown']) el.addEventListener(t, e => { if (!el.hidden) e.stopPropagation(); });
  document.body.appendChild(el);
  return {
    el,
    /** @param {string} [h] */ show(h) { if (h !== undefined) /** @type {HTMLElement} */ (el.firstElementChild).innerHTML = h; el.hidden = false; const b = /** @type {HTMLElement|null} */ (el.querySelector('.k3-b')); b && b.focus({ preventScroll: true }); },
    hide() { el.hidden = true; if (el.contains(document.activeElement)) /** @type {HTMLElement} */ (document.activeElement).blur(); },
    get visible() { return !el.hidden; },
    /** @param {string} sel @param {()=>void} fn */ on(sel, fn) { el.addEventListener('click', e => { if (/** @type {HTMLElement} */ (e.target).closest(sel)) fn(); }); },
  };
}

let toastEl = /** @type {HTMLElement|null} */ (null), toastT = 0;
/** @param {string} text @param {number} [ms] */
export function toast(text, ms = 1800) {
  ensureUiCss();
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'k3-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
  toastEl.textContent = text; toastEl.classList.add('on');
  clearTimeout(toastT); toastT = window.setTimeout(() => toastEl && toastEl.classList.remove('on'), ms);
}

/** @param {string} css posición inline (ej. 'top:12px;left:12px') */
export function hud(css) { ensureUiCss(); const el = document.createElement('div'); el.className = 'k3-hud'; el.style.cssText = css; document.body.appendChild(el); return el; }

/* ======================= juego ======================= */
/**
 * Crea la base de un juego 3D integrada con el SDK.
 * @param {{
 *  id:string, title:string, accent?:string, help?:string[], toolbar?:'tl'|'tr'|'bl'|'br',
 *  gamepad?:Record<string,string>|false, background?:number, fov?:number, far?:number,
 *  isActive:()=>boolean, onRestart?:()=>void, actions?:{label:string,fn:()=>void}[],
 *  update:(dt:number)=>void, render?:(alpha:number)=>void, onQuality?:(q:'low'|'medium'|'high')=>void,
 *  legacyBestKey?:string
 * }} o
 */
export function createGame(o) {
  if (A() && !A().requireWebGL({ needsThree: false })) throw new Error('sin WebGL');
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;touch-action:none';
  document.body.prepend(root);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap fue retirado en 0.186
  root.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', o.title);
  const scene = new THREE.Scene();
  if (o.background !== undefined) scene.background = new THREE.Color(o.background);
  const camera = new THREE.PerspectiveCamera(o.fov ?? 55, 1, 0.1, o.far ?? 600);
  const audio = createAudio();
  /** @type {'low'|'medium'|'high'} */ let quality = A() ? A().quality() : 'medium';

  function applySize() {
    const w = innerWidth, h = innerHeight;
    const cap = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(() => { applySize(); if (paused) draw(1); });
  ro.observe(root);
  renderer.shadowMap.enabled = quality === 'high';
  applySize();

  // loop de paso fijo con render variable
  const STEP = 1 / 60;
  let acc = 0, last = 0, raf = 0, paused = false, exited = false, frames = 0, simTime = 0;
  let speed = 1; // sólo pruebas: multiplica pasos por cuadro (?debug)
  const perf = { frameMs: 0, updateMs: 0, renderMs: 0, calls: 0, tris: 0 };
  function draw(alpha) {
    const t0 = performance.now();
    if (o.render) o.render(alpha);
    renderer.render(scene, camera);
    perf.renderMs = performance.now() - t0;
    perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles;
  }
  function frame(now) {
    raf = 0;
    if (exited || paused) return;
    const dt = Math.min(0.25, (now - (last || now)) / 1000); last = now;
    perf.frameMs = dt * 1000;
    acc += dt * speed;
    let steps = 0;
    const t0 = performance.now();
    while (acc >= STEP && steps < 8 * speed) { o.update(STEP); simTime += STEP; acc -= STEP; steps++; }
    if (steps >= 8 * speed) acc = 0; // no intentar recuperar demoras enormes (pestaña lenta)
    perf.updateMs = performance.now() - t0;
    draw(acc / STEP);
    frames++;
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && !exited) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  const api = {
    THREE, renderer, scene, camera, root, audio,
    get quality() { return quality; },
    get paused() { return paused; },
    get simTime() { return simTime; },
    get frames() { return frames; },
    perf, start, stop, draw,
    /** sólo debug/pruebas */
    setSpeed(n) { speed = Math.max(1, Math.min(8, n | 0)); },
    /** Paso manual de simulación (pruebas deterministas). @param {number} seconds */
    simulate(seconds) { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) { o.update(STEP); simTime += STEP; } draw(1); },
    dispose() { exited = true; stop(); ro.disconnect(); disposeTree(scene); renderer.dispose(); audio.close(); },
  };

  if (A()) {
    A().init({
      id: o.id, title: o.title, help: o.help || [], toolbar: o.toolbar || 'tr',
      gamepad: o.gamepad === undefined ? undefined : o.gamepad, legacyBestKey: o.legacyBestKey,
      isActive: o.isActive,
      onPause() { paused = true; stop(); audio.suspend(); },
      onResume() { paused = false; audio.resume(); start(); },
      onRestart() { paused = false; audio.resume(); o.onRestart && o.onRestart(); start(); },
      onExit() { api.dispose(); },
      onMute(m) { audio.setMuted(m); },
      onQuality(q) {
        quality = q;
        renderer.shadowMap.enabled = q === 'high';
        scene.traverse(/** @param {any} x */ x => { if (x.material) { const ms = Array.isArray(x.material) ? x.material : [x.material]; ms.forEach(m => m.needsUpdate = true); } });
        applySize();
        o.onQuality && o.onQuality(q);
        if (paused) draw(1);
      },
      // el SDK reanuda «en silencio» antes de una acción propia: acá se relanza el loop y el audio
      actions: (o.actions || []).map(a => ({ label: a.label, fn() { paused = false; audio.resume(); start(); a.fn(); } })),
    });
  }
  // volver desde bfcache
  addEventListener('pageshow', e => { if (e.persisted && exited) location.reload(); });
  return api;
}

/** Utilidades pequeñas */
export const clamp = (/** @type {number} */ v, /** @type {number} */ a, /** @type {number} */ b) => v < a ? a : v > b ? b : v;
export const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;
/** PRNG determinista (mulberry32) para niveles y pruebas reproducibles. @param {number} seed */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { THREE };
