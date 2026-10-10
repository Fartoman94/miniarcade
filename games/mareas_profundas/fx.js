// @ts-check
/* Mareas Profundas — atmósfera submarina barata: cáusticas por shader, nieve marina, rayos de luz,
   partículas en pool (burbujas, chispas, tinta), pulso de sonar y marcadores de eco. Sin asignaciones por cuadro. */
import * as THREE from 'three';

/** Uniformes compartidos por todos los materiales con cáusticas. */
export const CAUSTIC_U = { uTime: { value: 0 }, uCaus: { value: 1 }, uTop: { value: 0 } };

const C_VERT_DECL = 'varying vec3 vCW;\n';
const C_VERT = `
{ vec4 cw = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  cw = instanceMatrix * cw;
#endif
  vCW = (modelMatrix * cw).xyz; }
`;
const C_FRAG_DECL = `
uniform float uTime; uniform float uCaus; uniform float uTop;
varying vec3 vCW;
float causF(vec2 p, float t) {
  p *= 0.3;
  float a = sin(p.x * 2.1 + sin(p.y * 1.7 + t * 0.8) * 1.3 + t * 0.6);
  float b = sin(p.y * 2.3 + sin(p.x * 1.4 - t * 0.7) * 1.4 - t * 0.5);
  float c = sin((p.x + p.y) * 1.6 + t * 0.9);
  float v = (a + b + c) / 3.0;
  return pow(1.0 - abs(v), 7.0);
}
`;
const C_FRAG = `
#ifdef CAUSTICS
{ float cd = clamp(1.0 - (uTop - vCW.y) / 75.0, 0.0, 1.0);
  gl_FragColor.rgb += vec3(0.45, 0.85, 1.0) * causF(vCW.xz, uTime) * uCaus * cd * cd; }
#endif
`;
/**
 * Agrega cáusticas animadas a un material de Three (Lambert/Standard/Basic). Se encienden con el define CAUSTICS.
 * @param {THREE.Material} m
 */
export function withCaustics(m) {
  /** @type {any} */ (m).defines = { ...(/** @type {any} */ (m).defines || {}), CAUSTICS: '' };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, CAUSTIC_U);
    sh.vertexShader = C_VERT_DECL + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + C_VERT);
    sh.fragmentShader = C_FRAG_DECL + sh.fragmentShader.replace('#include <fog_fragment>', C_FRAG + '\n#include <fog_fragment>');
  };
  m.userData.caustics = true;
  return m;
}
/** @param {THREE.Material} m @param {boolean} on */
export function setCausticsDefine(m, on) {
  const d = /** @type {any} */ (m).defines || {};
  const has = 'CAUSTICS' in d;
  if (on === has) return;
  if (on) d.CAUSTICS = ''; else delete d.CAUSTICS;
  /** @type {any} */ (m).defines = d; m.needsUpdate = true;
}

/** Textura circular suave generada en código. */
function dotTexture(ring = false) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  if (ring) {
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 5, 0, Math.PI * 2); g.fill();
  } else {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** Degradé vertical para los rayos de luz. */
function rayTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, 'rgba(255,255,255,0.9)'); v.addColorStop(0.5, 'rgba(255,255,255,0.35)'); v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v; g.fillRect(0, 0, 32, 128);
  const h = g.createLinearGradient(0, 0, 32, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = h; g.fillRect(0, 0, 32, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {()=>boolean} reduced
 */
export function createFx(scene, camera, reduced) {
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);
  const softTex = dotTexture(false), ringTex = dotTexture(true);

  /* ---------- nieve marina (envuelve a la cámara en el shader: cero costo de CPU) ---------- */
  const SNOW_MAX = 1100, BOX = 46;
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(SNOW_MAX * 3), ss = new Float32Array(SNOW_MAX);
  for (let i = 0; i < SNOW_MAX; i++) { sp[i * 3] = Math.random() * BOX; sp[i * 3 + 1] = Math.random() * BOX; sp[i * 3 + 2] = Math.random() * BOX; ss[i] = Math.random(); }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
  sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const snowU = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: BOX }, uColor: { value: new THREE.Color(0xbfe8ff) }, uPR: { value: 1 } };
  const snow = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: snowU, transparent: true, depthWrite: false,
    vertexShader: `uniform vec3 uCam; uniform float uTime; uniform float uBox; uniform float uPR; attribute float aSeed; varying float vA;
      void main(){ vec3 p = position + vec3(sin(uTime*0.3 + aSeed*6.0)*0.7, -uTime*(0.2 + aSeed*0.25), cos(uTime*0.23 + aSeed*4.0)*0.7);
        p = mod(p - uCam + uBox*0.5, uBox) - uBox*0.5 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
        gl_PointSize = (1.5 + aSeed * 2.5) * uPR * 12.0 / max(d, 0.6);
        vA = clamp(1.0 - d / (uBox * 0.5), 0.0, 1.0) * clamp(d * 0.5, 0.0, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c); if (r > 0.25) discard; gl_FragColor = vec4(uColor, vA * (1.0 - r * 4.0) * 0.75); }`,
  }));
  snow.frustumCulled = false; snow.renderOrder = 5; root.add(snow);
  let snowCount = 500;

  /* ---------- rayos de luz (geometría simple con degradé aditivo) ---------- */
  const RAYS_MAX = 7;
  const rayTex = rayTexture();
  const rayMat = new THREE.MeshBasicMaterial({ map: rayTex, color: 0x9fe8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const rayGeo = new THREE.PlaneGeometry(1, 1); rayGeo.translate(0, -0.5, 0);
  /** @type {{m:THREE.Mesh, ox:number, oz:number, w:number, h:number, ph:number}[]} */
  const rays = [];
  for (let i = 0; i < RAYS_MAX; i++) {
    const m = new THREE.Mesh(rayGeo, rayMat); m.renderOrder = 6; m.frustumCulled = false; root.add(m);
    rays.push({ m, ox: (Math.random() - 0.5) * 50, oz: (Math.random() - 0.5) * 50, w: 2.5 + Math.random() * 4, h: 26 + Math.random() * 24, ph: Math.random() * 6 });
  }
  let rayCount = 4, rayTop = 0, rayOn = true, rayStrength = 1;

  /* ---------- partículas en pool: burbujas/tinta (normales) y chispas (aditivas) ---------- */
  function pool(n, additive) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), al = new Float32Array(n), sz = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(al, 1)); g.setAttribute('aS', new THREE.BufferAttribute(sz, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const u = { uPR: { value: 1 }, uMap: { value: softTex } };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, vertexColors: true,
      vertexShader: `uniform float uPR; attribute float aA; attribute float aS; varying float vA; varying vec3 vC;
        void main(){ vC = color; vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aS * uPR * 300.0 / max(-mv.z, 0.5); }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); if (vA <= 0.0) discard; gl_FragColor = vec4(vC, t.a * vA); }`,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 7; root.add(pts);
    const P = { x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n), life: new Float32Array(n), max: new Float32Array(n), size: new Float32Array(n), grow: new Float32Array(n), rise: new Float32Array(n) };
    let next = 0;
    return {
      pts, u,
      /** @param {number} x @param {number} y @param {number} z @param {number} vx @param {number} vy @param {number} vz @param {number} life @param {number} size @param {number} color @param {number} [rise] @param {number} [grow] */
      spawn(x, y, z, vx, vy, vz, life, size, color, rise = 0, grow = 0) {
        const i = next; next = (next + 1) % n;
        P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.life[i] = life; P.max[i] = life; P.size[i] = size; P.rise[i] = rise; P.grow[i] = grow;
        const c = _col.setHex(color); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      },
      /** @param {number} dt */
      update(dt) {
        const drag = Math.exp(-1.8 * dt);
        for (let i = 0; i < n; i++) {
          if (P.life[i] <= 0) { if (al[i] !== 0) al[i] = 0; continue; }
          P.life[i] -= dt;
          P.vx[i] *= drag; P.vz[i] *= drag; P.vy[i] = P.vy[i] * drag + P.rise[i] * dt;
          P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
          const k = P.life[i] / P.max[i];
          pos[i * 3] = P.x[i] + (P.rise[i] > 0 ? Math.sin(P.life[i] * 9 + i) * 0.04 : 0); pos[i * 3 + 1] = P.y[i]; pos[i * 3 + 2] = P.z[i];
          al[i] = Math.max(0, Math.min(1, k * 2.5)); sz[i] = P.size[i] * (1 + (1 - k) * P.grow[i]);
        }
        g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true; g.attributes.aS.needsUpdate = true; g.attributes.color.needsUpdate = true;
      },
      clear() { P.life.fill(0); al.fill(0); g.attributes.aA.needsUpdate = true; },
      get alive() { let c = 0; for (let i = 0; i < n; i++) if (P.life[i] > 0) c++; return c; },
    };
  }
  const _col = new THREE.Color();
  const soft = pool(220, false);
  const glow = pool(200, true);

  /* ---------- pulso de sonar (esfera con borde fresnel) ---------- */
  const sonarU = { uColor: { value: new THREE.Color(0x4ff7e6) }, uOp: { value: 0 } };
  const sonar = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.ShaderMaterial({
    uniforms: sonarU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOp; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uColor, (f * 0.9 + 0.03) * uOp); }`,
  }));
  sonar.visible = false; sonar.renderOrder = 8; sonar.frustumCulled = false; root.add(sonar);
  const pulse = { on: false, x: 0, y: 0, z: 0, r: 0, max: 45, speed: 34 };

  /* ---------- marcadores de eco (sprites siempre visibles) ---------- */
  const MK = 28;
  /** @type {{s:THREE.Sprite, t:number, max:number, follow:any}[]} */
  const marks = [];
  for (let i = 0; i < MK; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: 0x4ff7e6, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false }));
    s.scale.setScalar(0.045); s.visible = false; s.renderOrder = 20; root.add(s);
    marks.push({ s, t: 0, max: 1, follow: null });
  }
  let mi = 0;

  /* ---------- sacudida de cámara ---------- */
  let shake = 0;

  const api = {
    root,
    get shakeAmt() { return reduced() ? 0 : shake; },
    /** @param {number} a */ shake(a) { shake = Math.max(shake, a); },
    /** @param {number} n */ setSnow(n) { snowCount = Math.min(SNOW_MAX, n); sg.setDrawRange(0, snowCount); },
    get snowCount() { return snowCount; },
    /** @param {number} color */ setSnowColor(color) { snowU.uColor.value.setHex(color); },
    /** @param {number} n @param {number} top @param {number} strength */ setRays(n, top, strength) { rayCount = Math.min(RAYS_MAX, n); rayTop = top; rayStrength = strength; rayOn = n > 0 && strength > 0; for (let i = 0; i < RAYS_MAX; i++) rays[i].m.visible = rayOn && i < rayCount; },
    get rayCount() { return rayOn ? rayCount : 0; },
    /** @param {number} pr */ setPixelRatio(pr) { snowU.uPR.value = pr; soft.u.uPR.value = pr; glow.u.uPR.value = pr; },
    /** Burbujas que suben. */
    bubbles(x, y, z, n, spread = 0.4, size = 0.12) { for (let i = 0; i < n; i++) soft.spawn(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.4, size * (0.6 + Math.random() * 0.8), 0xd8f4ff, 1.4, 0.3); },
    /** Chispas aditivas. */
    sparks(x, y, z, n, color, speed = 4, size = 0.18, life = 0.6) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, b = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6), c = Math.sqrt(1 - b * b); glow.spawn(x, y, z, Math.cos(a) * c * s, b * s, Math.sin(a) * c * s, life * (0.6 + Math.random() * 0.6), size, color); } },
    /** Nube de tinta / sedimento. */
    cloud(x, y, z, n, color, spread = 2, size = 0.9) { for (let i = 0; i < n; i++) soft.spawn(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, z + (Math.random() - 0.5) * spread, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 2, 2 + Math.random() * 1.5, size, color, 0, 1.5); },
    /** Inicia un pulso de sonar. */
    pulse(x, y, z, max = 45) { pulse.on = true; pulse.x = x; pulse.y = y; pulse.z = z; pulse.r = 0.5; pulse.max = max; sonar.visible = true; },
    get pulseR() { return pulse.on ? pulse.r : -1; },
    get pulsePos() { return pulse; },
    /** Marca un objeto detectado por el sonar. @param {{x:number,y:number,z:number}|THREE.Vector3} at @param {number} color @param {number} [dur] @param {any} [follow] */
    mark(at, color, dur = 4, follow = null) {
      const m = marks[mi]; mi = (mi + 1) % MK;
      m.s.position.set(at.x, at.y, at.z); /** @type {THREE.SpriteMaterial} */ (m.s.material).color.setHex(color); m.t = dur; m.max = dur; m.follow = follow; m.s.visible = true;
    },
    clearMarks() { for (const m of marks) { m.t = 0; m.s.visible = false; m.follow = null; } },
    /** @param {number} dt @param {THREE.Vector3} focus */
    update(dt, focus) {
      const t = CAUSTIC_U.uTime.value += dt;
      snowU.uTime.value = t; snowU.uCam.value.copy(camera.position);
      shake = Math.max(0, shake - dt * 1.6);
      // rayos: siguen a la cámara con desplazamientos fijos y un vaivén lento
      if (rayOn) for (let i = 0; i < rayCount; i++) {
        const r = rays[i], m = r.m;
        // copia del rayo (en una grilla de 50 m) más cercana al foco: quedan fijos en el mundo
        m.position.set(r.ox + Math.round((focus.x - r.ox) / 50) * 50, rayTop, r.oz + Math.round((focus.z - r.oz) / 50) * 50);
        m.scale.set(r.w, r.h, 1);
        m.rotation.set(0.16 + Math.sin(t * 0.13 + r.ph) * 0.05, Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z), 0.22);
      }
      rayMat.opacity = (0.11 + Math.sin(t * 0.7) * 0.03) * rayStrength;
      // pulso de sonar
      if (pulse.on) {
        pulse.r += pulse.speed * dt;
        const k = pulse.r / pulse.max;
        sonar.position.set(pulse.x, pulse.y, pulse.z); sonar.scale.setScalar(pulse.r);
        sonarU.uOp.value = Math.max(0, 1 - k) * 0.9;
        if (k >= 1) { pulse.on = false; sonar.visible = false; }
      }
      for (const m of marks) {
        if (m.t <= 0) continue;
        m.t -= dt;
        if (m.follow) m.s.position.set(m.follow.x, m.follow.y + (m.follow.mh || 0), m.follow.z);
        /** @type {THREE.SpriteMaterial} */ (m.s.material).opacity = Math.min(1, m.t / Math.min(1, m.max)) * (0.75 + Math.sin(t * 8) * 0.25);
        m.s.scale.setScalar(0.04 + (1 - Math.min(1, (m.max - m.t) * 3)) * 0.03);
        if (m.t <= 0) { m.s.visible = false; m.follow = null; }
      }
      soft.update(dt); glow.update(dt);
    },
    clear() { soft.clear(); glow.clear(); pulse.on = false; sonar.visible = false; api.clearMarks(); shake = 0; },
    get particles() { return soft.alive + glow.alive; },
  };
  api.setSnow(500);
  return api;
}
