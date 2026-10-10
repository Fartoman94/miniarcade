// @ts-check
/* Corsarios del Abismo — mar y cielo escritos en código.
   - Mar: plano subdividido que sigue a la cámara (anclado a su grilla para que no «nade»), olas por suma de senos
     calculadas en el vertex shader y la MISMA función en CPU (waveHeight) para que barcos, balsas y espuma floten igual.
     El fragment shader agrega profundidad por color, fresnel con el cielo, brillo del sol, espuma en crestas,
     espuma de costa animada alrededor de cada isla y el remolino del jefe. Niebla de Three.js incluida.
   - Cielo: domo con degradé y halo del sol (un draw call). */
import * as THREE from 'three';

/** [dirección (rad), longitud de onda, amplitud relativa, fase] */
const WAVES = [[0.3, 34, 0.42, 0], [1.9, 21, 0.28, 1.7], [-1.0, 13, 0.18, 4.1], [2.8, 7.5, 0.1, 2.3]];
const W = WAVES.map(([a, l, amp, ph]) => { const k = Math.PI * 2 / l; return { dx: Math.cos(a), dz: Math.sin(a), k, a: amp, w: Math.sqrt(9.8 * k) * 0.85, ph }; });
const MAX_ISL = 16;

export const sea = { amp: 0.55, time: 0, whirl: { x: 0, z: 0, s: 0, r: 40 } };

/** Altura del mar en (x,z) en el instante actual (idéntica al shader). */
export function waveHeight(x, z) {
  let h = 0;
  const t = sea.time;
  for (let i = 0; i < 4; i++) { const w = W[i]; h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph); }
  h *= sea.amp;
  const wh = sea.whirl;
  if (wh.s > 0) { const dx = x - wh.x, dz = z - wh.z, d2 = dx * dx + dz * dz; h -= wh.s * 3 * Math.exp(-d2 / (wh.r * wh.r * 0.15)); }
  return h;
}

const VERT = /* glsl */`
uniform float uTime, uAmp;
uniform vec4 uW[4];
uniform vec2 uWP[4];
uniform vec4 uWhirl;
uniform vec4 uIsl[${MAX_ISL}];
uniform int uIslN;
varying vec3 vWorld; varying vec3 vN; varying float vH; varying float vSd;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = 0.0, gx = 0.0, gz = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 w = uW[i];
    float ph = w.z * (w.x * wp.x + w.y * wp.z) - uWP[i].x * uTime + uWP[i].y;
    h += w.w * sin(ph);
    float c = w.w * w.z * cos(ph);
    gx += c * w.x; gz += c * w.y;
  }
  h *= uAmp; gx *= uAmp; gz *= uAmp;
  if (uWhirl.z > 0.0) {
    vec2 d = wp.xz - uWhirl.xy; float r2 = uWhirl.w * uWhirl.w * 0.15;
    float e = uWhirl.z * 3.0 * exp(-dot(d, d) / r2);
    h -= e; gx += e * 2.0 * d.x / r2; gz += e * 2.0 * d.y / r2;
  }
  wp.y += h;
  vN = normalize(vec3(-gx, 1.0, -gz));
  vWorld = wp.xyz; vH = h;
  float sd = 1000.0;
  for (int i = 0; i < ${MAX_ISL}; i++) { if (i >= uIslN) break; sd = min(sd, length(wp.xz - uIsl[i].xy) - uIsl[i].z); }
  vSd = sd;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */`
uniform float uTime, uAmp, uShore;
uniform vec3 uDeep, uShallow, uFoam, uSky, uSunDir, uSunCol;
uniform vec4 uWhirl;
varying vec3 vWorld; varying vec3 vN; varying float vH; varying float vSd;
#include <fog_pars_fragment>
void main() {
  float sd = vSd;
  vec2 p = vWorld.xz;
  // ondulación barata (sumas de senos) en vez de ruido por hash: rinde mucho mejor en GPUs flojas
  float n1 = 0.5 + 0.25 * (sin(p.x * 0.31 + uTime * 0.4 + sin(p.y * 0.21)) + sin(p.y * 0.27 - uTime * 0.3 + p.x * 0.11));
  float n2 = 0.5 + 0.25 * (sin(p.x * 1.1 - uTime * 1.3 + p.y * 0.4 + n1 * 3.0) + sin(p.y * 1.37 + uTime * 0.9 - p.x * 0.3));
  vec3 N = normalize(vN + vec3((n2 - 0.5) * 0.22, 0.0, (n1 - 0.5) * 0.22));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  float hh = clamp(0.5 + vH / max(uAmp, 0.05) * 0.45, 0.0, 1.0);
  vec3 col = mix(uDeep, uShallow, hh * 0.55);
  col = mix(col, uShallow * 1.12, smoothstep(16.0, 0.5, sd) * 0.85);
  col = mix(col, uSky, clamp(fres * 0.75, 0.0, 0.85));
  vec3 R = reflect(-uSunDir, N);
  float spec = pow(max(dot(R, V), 0.0), 120.0) * 2.2 + pow(max(dot(R, V), 0.0), 18.0) * 0.12;
  float crest = smoothstep(0.62, 1.0, vH / max(uAmp, 0.05) * 0.95 + (n2 - 0.5) * 0.55) * 0.75;
  float shore = 0.0;
  if (uShore > 0.5) {
    float band = smoothstep(3.2, 0.2, sd) * (0.55 + 0.45 * sin(sd * 2.6 - uTime * 2.2 + n1 * 5.0));
    shore = max(band * smoothstep(-0.6, 0.4, sd), smoothstep(0.9, 0.1, abs(sd - 0.2)) * 0.9);
    shore *= 0.6 + 0.4 * n2;
  } else {
    shore = smoothstep(1.2, 0.0, abs(sd)) * 0.7;
  }
  float whirl = 0.0;
  if (uWhirl.z > 0.0) {
    vec2 d = p - uWhirl.xy; float r = length(d);
    float s = sin(atan(d.y, d.x) * 5.0 + r * 0.32 - uTime * 3.2 + n1 * 2.0);
    whirl = smoothstep(0.55, 0.95, s) * smoothstep(uWhirl.w, uWhirl.w * 0.2, r) * uWhirl.z;
    col *= 1.0 - 0.5 * uWhirl.z * smoothstep(uWhirl.w * 0.5, 0.0, r);
  }
  col = mix(col, uFoam, clamp(crest + shore + whirl, 0.0, 1.0));
  gl_FragColor = vec4(col + uSunCol * spec, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * @param {THREE.Scene} scene
 */
export function createWater(scene) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uAmp: { value: 0.55 }, uShore: { value: 1 },
    uW: { value: W.map(w => new THREE.Vector4(w.dx, w.dz, w.k, w.a)) },
    uWP: { value: W.map(w => new THREE.Vector2(w.w, w.ph)) },
    uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() }, uSunCol: { value: new THREE.Color(1, 1, 1) },
    uIsl: { value: Array.from({ length: MAX_ISL }, () => new THREE.Vector4(0, 0, 0, 0)) }, uIslN: { value: 0 },
    uWhirl: { value: new THREE.Vector4(0, 0, 0, 40) },
  }]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true });
  /** @type {THREE.Mesh} */
  let mesh = /** @type {any} */ (null);
  let size = 460, seg = 128;
  function build(sz, sg) {
    if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    size = sz; seg = sg;
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.receiveShadow = false; mesh.name = 'mar';
    scene.add(mesh);
  }
  build(size, seg);

  /* cielo */
  const skyU = { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sun: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, bot, sun, sunCol; varying vec3 vP;
      void main(){ float y = clamp(vP.y, -0.2, 1.0); vec3 c = mix(bot, top, pow(max(y, 0.0), 0.55));
        float s = max(dot(normalize(vP), sun), 0.0); c += sunCol * (pow(s, 1800.0) * 2.5 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'cielo';
  scene.add(sky);

  return {
    get mesh() { return mesh; }, sky, mat,
    get verts() { return (seg + 1) * (seg + 1); },
    /** @param {any} env */
    setEnv(env, sunDir) {
      const w = env.water;
      uniforms.uDeep.value.setHex(w.deep); uniforms.uShallow.value.setHex(w.shallow); uniforms.uFoam.value.setHex(w.foam);
      uniforms.uSky.value.setHex(env.sky[1]);
      uniforms.uSunDir.value.set(sunDir[0], sunDir[1], sunDir[2]).normalize();
      uniforms.uSunCol.value.setHex(env.sun[0]);
      skyU.top.value.setHex(env.sky[0]); skyU.bot.value.setHex(env.sky[1]); skyU.sun.value.copy(uniforms.uSunDir.value); skyU.sunCol.value.setHex(env.sun[0]);
      sea.amp = w.amp;
    },
    /** @param {{x:number,z:number,r:number}[]} isl */
    setIslands(isl) {
      const n = Math.min(MAX_ISL, isl.length);
      for (let i = 0; i < n; i++) uniforms.uIsl.value[i].set(isl[i].x, isl[i].z, isl[i].r, 0);
      uniforms.uIslN.value = n;
    },
    /** @param {any} q */
    applyQuality(q) { if (q.waterSeg !== seg || q.waterSize !== size) build(q.waterSize, q.waterSeg); uniforms.uShore.value = q.shoreFoam; },
    /** @param {number} dt @param {THREE.Camera} cam @param {number} far */
    update(dt, cam, far) {
      sea.time += dt;
      uniforms.uTime.value = sea.time; uniforms.uAmp.value = sea.amp;
      const wh = sea.whirl; uniforms.uWhirl.value.set(wh.x, wh.z, wh.s, wh.r);
      const cell = size / seg;
      mesh.position.set(Math.round(cam.position.x / cell) * cell, 0, Math.round(cam.position.z / cell) * cell);
      sky.position.copy(cam.position); sky.scale.setScalar(far * 0.9);
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); sky.geometry.dispose(); /** @type {any} */ (sky.material).dispose(); },
  };
}
