// @ts-check
/* Personajes seleccionables de MiniArcade (hoy: Clásico y Mati Octo).

   Script clásico. Expone window.MLChars:
   - get(gameId) / set(gameId, charId): elección persistida por juego (ml:character).
   - loadMeshes(THREE): carga diferida de las 3 poses GLB → {idle, run, jump} (THREE.Mesh, Y arriba,
     base en y=0, mirando a +Z, altura 1). Se cachea la promesa: una sola descarga por página.
   - loadSprites(): sprites pre-renderizados de las mismas poses (para juegos 2D) → {idle, run, jump, turn[]}.
   - picker(container, opts): selector accesible (radio group) con vista previa giratoria y opción de
     desactivar la animación.

   Los GLB son POSES ESTÁTICAS (sin esqueleto ni animaciones): los juegos alternan de forma discreta
   entre quieto / correr / saltar según su estado, no hay animación esquelética.

   Lector GLB propio y mínimo (una malla, POSITION + COLOR_0 + índices), en vez de GLTFLoader:
   ahorra una dependencia de ~100 KB y no cambia nada para estos archivos. Si el archivo no se puede
   leer, loadMeshes() rechaza la promesa y el juego sigue con su personaje clásico. */
(() => {
  if (/** @type {any} */ (window).MLChars) return;
  const me = /** @type {HTMLScriptElement|null} */ (document.currentScript);
  const DIR = (me ? me.src.replace(/[^/]*$/, '') : 'matelabs/') + 'characters/';
  const KEY = 'ml:character', PREV_KEY = 'ml:character-preview-anim';
  const POSES = /** @type {const} */ (['idle', 'run', 'jump']);

  const CHARS = [
    { id: 'clasico', name: 'Clásico', desc: 'El personaje original del juego.' },
    { id: 'mati', name: 'Mati Octo', desc: 'El pulpo robot de MateLabs, con su mate.' },
  ];

  const store = {
    /** @param {string} k @param {any} d */
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    /** @param {string} k @param {any} v */
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };

  /** @param {string} gameId */
  function get(gameId) { const m = store.get(KEY, {}); return CHARS.some(c => c.id === m[gameId]) ? m[gameId] : 'clasico'; }
  /** @param {string} gameId @param {string} id */
  function set(gameId, id) {
    const m = store.get(KEY, {}); m[gameId] = id; store.set(KEY, m);
    const A = /** @type {any} */ (window).MLArcade; if (A) A.track('character', { id });
    dispatchEvent(new CustomEvent('mlchars:change', { detail: { gameId, id } }));
  }

  /* ---------- GLB → THREE.Mesh ---------- */
  /** @param {ArrayBuffer} buf @param {any} THREE */
  function parseGLB(buf, THREE) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('GLB inválido');
    let off = 12, json = null, bin = null;
    while (off < dv.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      const chunk = buf.slice(off + 8, off + 8 + len);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004E4942) bin = chunk;
      off += 8 + len;
    }
    if (!json || !bin) throw new Error('GLB sin JSON o BIN');
    const prim = json.meshes[0].primitives[0];
    const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    /** @param {number} i */
    const read = i => {
      const a = json.accessors[i], v = json.bufferViews[a.bufferView];
      const n = a.count * SIZES[/** @type {'SCALAR'} */ (a.type)];
      const start = (v.byteOffset || 0) + (a.byteOffset || 0);
      const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[/** @type {5126} */ (a.componentType)];
      if (!T) throw new Error('tipo de componente no soportado: ' + a.componentType);
      if (v.byteStride && v.byteStride !== T.BYTES_PER_ELEMENT * SIZES[/** @type {'SCALAR'} */ (a.type)]) throw new Error('byteStride intercalado no soportado');
      return { arr: new T(bin.slice(start, start + n * T.BYTES_PER_ELEMENT)), a };
    };
    const g = new THREE.BufferGeometry();
    const pos = read(prim.attributes.POSITION).arr;
    // Los GLB vienen con Z arriba y la cara hacia -Y: se pasa a Y arriba y cara hacia +Z (convención de los juegos).
    for (let i = 0; i < pos.length; i += 3) { const y = pos[i + 1], z = pos[i + 2]; pos[i + 1] = z; pos[i + 2] = -y; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (prim.attributes.COLOR_0 != null) {
      const c = read(prim.attributes.COLOR_0);
      const comps = SIZES[/** @type {'VEC3'} */ (c.a.type)];
      const out = new Float32Array(c.a.count * 3);
      const arr = /** @type {any} */ (c.arr); const norm = arr instanceof Float32Array ? 1 : arr instanceof Uint8Array ? 255 : 65535;
      for (let i = 0; i < c.a.count; i++) for (let k = 0; k < 3; k++) {
        // los colores del GLB están en sRGB lineal según la spec; r128 sin outputEncoding los muestra tal cual
        out[i * 3 + k] = c.arr[i * comps + k] / norm;
      }
      g.setAttribute('color', new THREE.BufferAttribute(out, 3));
    }
    if (prim.indices != null) g.setIndex(new THREE.BufferAttribute(read(prim.indices).arr, 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  }

  /** @type {Promise<any>|null} */
  let meshesP = null;
  /** Carga las tres poses normalizadas (altura 1, base en y=0, centradas en XZ). @param {any} THREE */
  function loadMeshes(THREE) {
    if (meshesP) return meshesP;
    const t0 = performance.now();
    meshesP = Promise.all(POSES.map(p => fetch(DIR + `mati_octo_${p}.glb`).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} al cargar ${p}`);
      return r.arrayBuffer();
    }))).then(bufs => {
      const geos = bufs.map(b => parseGLB(b, THREE));
      // Escala y centro comunes tomados de la pose quieta: al cambiar de pose no hay saltos de posición.
      const bb = geos[0].boundingBox, h = bb.max.y - bb.min.y;
      const cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
      // Material compartido por las tres poses: colores por vértice, sombreado plano low-poly
      // (Phong: en r128 MeshLambertMaterial no admite flatShading y avisa por consola).
      const mat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 12, specular: 0x222222 });
      /** @type {Record<string, any>} */
      const out = { material: mat, height: 1 };
      geos.forEach((g, i) => {
        g.translate(-cx, -bb.min.y, -cz);
        g.scale(1 / h, 1 / h, 1 / h);
        g.computeBoundingBox(); g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat);
        m.name = 'mati_' + POSES[i];
        out[POSES[i]] = m;
      });
      const A = /** @type {any} */ (window).MLArcade;
      if (A) A.track('character-load', { ms: Math.round(performance.now() - t0) });
      return out;
    }).catch(err => {
      meshesP = null; // permitir reintentar
      const A = /** @type {any} */ (window).MLArcade;
      if (A) A.track('character-fail', { msg: String(err && err.message || err) });
      throw err;
    });
    return meshesP;
  }

  /* ---------- sprites 2D pre-renderizados ---------- */
  /** @type {Promise<any>|null} */
  let spritesP = null;
  /** @param {string} src */
  const img = src => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('no se pudo cargar ' + src)); i.src = src; });
  function loadSprites() {
    if (spritesP) return spritesP;
    spritesP = Promise.all([...POSES.map(p => img(DIR + `mati_${p}.webp`)), img(DIR + 'mati_turn.webp')])
      .then(([idle, run, jump, turn]) => ({ idle, run, jump, turn, turnFrames: 16 }))
      .catch(err => { spritesP = null; throw err; });
    return spritesP;
  }

  /* ---------- selector ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .mlc{display:flex;flex-direction:column;gap:6px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff}
  .mlc-title{font-size:10px;font-weight:800;letter-spacing:.24em;opacity:.75}
  .mlc-row{display:flex;gap:8px;flex-wrap:wrap}
  .mlc-card{position:relative;display:flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:12px;cursor:pointer;
    border:1.5px solid rgba(255,255,255,.22);background:rgba(0,0,0,.28);color:#fff;font:700 13px system-ui,sans-serif;text-align:left;
    transition:border-color .15s,background .15s,transform .1s;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
  .mlc-card:hover{background:rgba(255,255,255,.1)}
  .mlc-card:active{transform:scale(.97)}
  .mlc-card[aria-checked="true"]{border-color:#2ee6e6;background:rgba(46,230,230,.16);box-shadow:0 0 14px rgba(46,230,230,.3)}
  .mlc-card:focus-visible{outline:2px solid #2ee6e6;outline-offset:2px}
  .mlc-card small{display:block;font-weight:600;font-size:10px;opacity:.7;letter-spacing:.04em}
  .mlc-prev{width:46px;height:46px;border-radius:10px;background:radial-gradient(circle at 50% 40%,#123642,#06121a);display:grid;place-items:center;font-size:24px;overflow:hidden;flex:0 0 auto}
  .mlc-prev canvas{width:46px;height:46px}
  .mlc-anim{align-self:flex-start;background:none;border:none;color:#fff;opacity:.7;font:600 11px system-ui,sans-serif;cursor:pointer;padding:2px 0;text-decoration:underline}
  .mlc-anim:focus-visible{outline:2px solid #2ee6e6}
  .mlc-err{font-size:11px;color:#ffb4b4}
  `;
  document.head.appendChild(css);

  /**
   * Selector de personaje accesible.
   * @param {HTMLElement} container
   * @param {{gameId:string, classicIcon?:string, classicName?:string, onChange?:(id:string)=>void, title?:string}} opts
   */
  function picker(container, opts) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animate = store.get(PREV_KEY, !reduced);
    let current = get(opts.gameId);
    const wrap = document.createElement('div');
    wrap.className = 'mlc';
    wrap.innerHTML = `<div class="mlc-title" id="mlc-t-${opts.gameId}">${opts.title || 'PERSONAJE'}</div>
      <div class="mlc-row" role="radiogroup" aria-labelledby="mlc-t-${opts.gameId}"></div>
      <button type="button" class="mlc-anim"></button><div class="mlc-err" hidden></div>`;
    const row = /** @type {HTMLElement} */ (wrap.querySelector('.mlc-row'));
    const animBtn = /** @type {HTMLButtonElement} */ (wrap.querySelector('.mlc-anim'));
    const err = /** @type {HTMLElement} */ (wrap.querySelector('.mlc-err'));
    /** @type {HTMLButtonElement[]} */
    const cards = CHARS.map(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mlc-card'; b.setAttribute('role', 'radio'); b.dataset.char = c.id;
      const name = c.id === 'clasico' ? (opts.classicName || c.name) : c.name;
      b.setAttribute('aria-label', `${name}: ${c.desc}`);
      b.innerHTML = `<span class="mlc-prev" aria-hidden="true">${c.id === 'clasico' ? (opts.classicIcon || '🙂') : '<canvas width="92" height="92"></canvas>'}</span><span>${name}<small>${c.id === 'mati' ? 'MateLabs' : 'Original'}</small></span>`;
      row.appendChild(b);
      return b;
    });
    // Los clics y teclas del selector no deben llegar al juego (muchos arrancan con cualquier toque).
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown']) wrap.addEventListener(t, e => e.stopPropagation());

    function sync() {
      cards.forEach(b => { const on = b.dataset.char === current; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
      animBtn.textContent = animate ? '⏸ Detener giro de la vista previa' : '▶ Girar vista previa';
      animBtn.setAttribute('aria-pressed', String(!animate));
    }
    /** @param {string} id @param {boolean} [focus] */
    function choose(id, focus) {
      if (id === current) return;
      current = id; set(opts.gameId, id); sync();
      if (focus) { const b = cards.find(x => x.dataset.char === id); b && b.focus(); }
      if (id === 'mati') loadSprites().catch(() => {}); // precarga al elegir
      opts.onChange && opts.onChange(id);
    }
    row.addEventListener('click', e => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-char]');
      if (b) choose(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.char));
    });
    row.addEventListener('keydown', e => {
      const i = cards.findIndex(b => b.dataset.char === current);
      const k = /** @type {KeyboardEvent} */ (e).key;
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(k)) {
        e.preventDefault();
        const d = k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1;
        choose(/** @type {string} */ (cards[(i + d + cards.length) % cards.length].dataset.char), true);
      }
    });
    animBtn.addEventListener('click', () => { animate = !animate; store.set(PREV_KEY, animate); sync(); });

    // Vista previa: giro con los cuadros pre-renderizados del modelo 3D (sin cargar Three.js).
    const cv = /** @type {HTMLCanvasElement|null} */ (wrap.querySelector('canvas'));
    // Sólo se descarga la tira de giro (~36 KB) cuando la tarjeta es visible; las poses del juego
    // se descargan recién al elegir a Mati.
    let raf = 0, frame = 0, last = 0;
    /** @type {Promise<HTMLImageElement>|null} */
    let previewP = null;
    const startPreview = () => (previewP ||= img(DIR + 'mati_turn.webp')).then(turn => {
      if (!cv) return;
      const sp = { turn, turnFrames: 16 };
      const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
      const fw = sp.turn.width / sp.turnFrames, fh = sp.turn.height;
      /** @param {number} t */
      const draw = t => {
        raf = 0;
        if (!wrap.isConnected) return;
        if (animate && t - last > 70) { frame = (frame + 1) % sp.turnFrames; last = t; }
        ctx.clearRect(0, 0, 92, 92);
        // se recorta el margen vacío del cuadro para que el personaje llene la miniatura
        ctx.drawImage(sp.turn, frame * fw + fw * .16, fh * .1, fw * .68, fh * .68, 0, 0, 92, 92);
        if (animate && !document.hidden) raf = requestAnimationFrame(draw);
      };
      draw(0);
      animBtn.addEventListener('click', () => { if (animate && !raf) raf = requestAnimationFrame(draw); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden && animate && !raf) raf = requestAnimationFrame(draw); });
    }).catch(() => { err.hidden = false; err.textContent = 'No se pudo cargar la vista previa de Mati Octo (se puede elegir igual).'; });
    if (cv && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); startPreview(); } });
      io.observe(cv);
    } else startPreview();

    sync();
    container.appendChild(wrap);
    return { get: () => current, el: wrap };
  }

  /** @type {any} */ (window).MLChars = { list: CHARS, get, set, loadMeshes, loadSprites, picker, parseGLB, dir: DIR };
})();
