// @ts-check
/* Academia de Dragones — efectos: partículas en pool, proyectiles de aliento y sonidos sintetizados. */
import * as THREE from 'three';

const MAX = 520;

/** Textura redonda suave para puntos (evita los cuadrados de PointsMaterial). */
let dot = /** @type {THREE.CanvasTexture|null} */ (null);
export function dotTexture() {
  if (dot) return dot;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  if (x) { const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); }
  dot = new THREE.CanvasTexture(c);
  return dot;
}

/** Sistema de partículas en pool (un solo draw call). */
export function createParticles(scene) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3), base = new Float32Array(MAX * 3), life = new Float32Array(MAX), max = new Float32Array(MAX), grav = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -1e5;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 1.3, map: dotTexture(), alphaTest: 0.01, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  scene.add(pts);
  let limit = 300, next = 0, alive = 0;
  const c = new THREE.Color();
  return {
    points: pts,
    get alive() { return alive; },
    /** @param {number} n */ setLimit(n) { limit = Math.max(16, Math.min(MAX, n)); },
    /** @param {number} x @param {number} y @param {number} z @param {number} n @param {number} color @param {number} [speed] @param {number} [lifeS] @param {number} [g] */
    burst(x, y, z, n, color, speed = 10, lifeS = 0.8, g = 0) {
      c.set(color);
      for (let k = 0; k < n; k++) {
        const i = next; next = (next + 1) % limit;
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * (0.35 + Math.random() * 0.65);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        vel[i * 3] = Math.cos(a) * r * s; vel[i * 3 + 1] = u * s; vel[i * 3 + 2] = Math.sin(a) * r * s;
        base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b;
        life[i] = max[i] = lifeS * (0.6 + Math.random() * 0.4); grav[i] = g;
      }
    },
    /** Rastro: una partícula con velocidad dada. */
    trail(x, y, z, vx, vy, vz, color, lifeS = 0.4) {
      const i = next; next = (next + 1) % limit; c.set(color);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b; life[i] = max[i] = lifeS; grav[i] = 0;
    },
    /** @param {number} dt */
    update(dt) {
      alive = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0 || i >= limit) { life[i] = 0; pos[i * 3 + 1] = -1e5; continue; }
        alive++;
        vel[i * 3 + 1] -= grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = life[i] / max[i];
        col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    clear() { for (let i = 0; i < MAX; i++) { life[i] = 0; pos[i * 3 + 1] = -1e5; } alive = 0; },
    dispose() { scene.remove(pts); geo.dispose(); mat.dispose(); },
  };
}

/** Sonidos del juego (todos sintetizados con createAudio().tone). @param {{tone:(o:any)=>void}} audio */
export function createSfx(audio) {
  const t = audio.tone;
  return {
    flap() { t({ f: 110, f2: 70, d: 0.12, type: 'sine', v: 0.08, id: 'flap', gap: 0.25 }); },
    breath(el) {
      if (el === 'fuego') { t({ noise: true, d: 0.25, v: 0.12, id: 'br', gap: 0.08 }); t({ f: 220, f2: 90, d: 0.2, type: 'sawtooth', v: 0.05 }); }
      else if (el === 'tierra') t({ f: 160, f2: 60, d: 0.18, type: 'square', v: 0.09, id: 'br', gap: 0.08 });
      else { t({ noise: true, d: 0.18, v: 0.08, id: 'br', gap: 0.08 }); t({ f: 600, f2: 900, d: 0.12, type: 'sine', v: 0.05 }); }
    },
    ring(n) { t({ f: 660 + Math.min(10, n) * 40, f2: 990 + Math.min(10, n) * 50, d: 0.18, type: 'triangle', v: 0.14, id: 'ring', gap: 0.05 }); },
    miss() { t({ f: 300, f2: 180, d: 0.25, type: 'sawtooth', v: 0.07, id: 'miss', gap: 0.3 }); },
    marker() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => t({ f, d: 0.16, type: 'triangle', v: 0.13 }), i * 70)); },
    egg() { [880, 1175, 1568].forEach((f, i) => setTimeout(() => t({ f, d: 0.22, type: 'sine', v: 0.14 }), i * 90)); },
    pick() { t({ f: 520, f2: 780, d: 0.2, type: 'triangle', v: 0.13, id: 'pick' }); },
    rescue() { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => t({ f, d: 0.2, type: 'triangle', v: 0.13 }), i * 80)); },
    inn() { t({ f: 330, f2: 660, d: 0.35, type: 'sine', v: 0.13, id: 'inn' }); },
    hit() { t({ f: 140, f2: 50, d: 0.3, type: 'sawtooth', v: 0.16, id: 'hurt', gap: 0.2 }); t({ noise: true, d: 0.15, v: 0.1 }); },
    rock() { t({ noise: true, d: 0.3, v: 0.16, id: 'rock', gap: 0.25 }); t({ f: 90, f2: 40, d: 0.3, type: 'square', v: 0.08 }); },
    enemyHit() { t({ f: 420, f2: 200, d: 0.12, type: 'square', v: 0.09, id: 'eh', gap: 0.05 }); },
    enemyDie() { t({ f: 700, f2: 120, d: 0.35, type: 'sawtooth', v: 0.1, id: 'ed', gap: 0.08 }); },
    armor() { t({ f: 1400, f2: 1200, d: 0.08, type: 'square', v: 0.06, id: 'arm', gap: 0.1 }); },
    screech() { t({ f: 1800, f2: 900, d: 0.3, type: 'sawtooth', v: 0.05, id: 'scr', gap: 0.4 }); },
    charge() { t({ f: 200, f2: 1200, d: 0.9, type: 'sine', v: 0.06, id: 'chg', gap: 0.6 }); },
    zap() { t({ f: 1600, f2: 200, d: 0.25, type: 'square', v: 0.08, id: 'zap', gap: 0.1 }); },
    thunder() { t({ noise: true, d: 0.9, v: 0.22, id: 'thu', gap: 0.2 }); t({ f: 60, f2: 30, d: 0.8, type: 'sine', v: 0.2 }); },
    roar() { t({ f: 90, f2: 45, d: 1.4, type: 'sawtooth', v: 0.16, id: 'roar', gap: 1 }); t({ noise: true, d: 1.1, v: 0.1 }); },
    geyser() { t({ noise: true, d: 0.7, v: 0.12, id: 'gey', gap: 0.5 }); },
    rumble() { t({ f: 50, f2: 40, d: 0.5, type: 'sine', v: 0.1, id: 'rum', gap: 0.6 }); },
    warn() { t({ f: 880, d: 0.08, type: 'square', v: 0.05, id: 'warn', gap: 0.5 }); },
    boost() { t({ f: 200, f2: 500, d: 0.35, type: 'sawtooth', v: 0.06, id: 'boost', gap: 0.5 }); },
    portal() { t({ f: 300, f2: 1200, d: 0.8, type: 'sine', v: 0.14, id: 'portal' }); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => t({ f, d: 0.3, type: 'triangle', v: 0.15 }), i * 140)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => t({ f, d: 0.35, type: 'triangle', v: 0.14 }), i * 160)); },
    fall() { t({ f: 500, f2: 80, d: 0.9, type: 'sine', v: 0.14, id: 'fall' }); },
    ui() { t({ f: 700, d: 0.06, type: 'triangle', v: 0.08, id: 'ui', gap: 0.05 }); },
  };
}
