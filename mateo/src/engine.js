// Mateo: Ciudad de Altura — renderer, escena, cielo con degradé y sol, luces (sol con sombra que sigue a Mateo),
// mapa de entorno generado del propio cielo (reflejos en vidrios) y presets gráficos Auto/Bajo/Medio/Alto.
import * as THREE from 'three';

export const PRESETS = {
  low: { dpr: 0.85, shadows: false, shadowSize: 0, fogFar: 260, far: 420, antialias: false, particles: 120, traffic: 10, people: 10, drawSky: true },
  medium: { dpr: 1.25, shadows: true, shadowSize: 1024, fogFar: 380, far: 560, antialias: true, particles: 220, traffic: 18, people: 18, drawSky: true },
  high: { dpr: 2, shadows: true, shadowSize: 2048, fogFar: 480, far: 700, antialias: true, particles: 360, traffic: 26, people: 26, drawSky: true },
};
/**
 * V2 P3: la geometría ESTÁTICA (ciudad) no se vuelve a leer en la CPU (las colisiones son cajas AABB propias, no hay
 * Raycaster sobre mallas): una vez subida a la GPU se sueltan sus arreglos en JS (≈ 25 MB menos de memoria JS).
 * Antes se calculan las esferas/cajas de recorte. No usar en mallas que se modifiquen, se descarguen o se clonen.
 */
export function freeAfterUpload(root) {
  const seen = new Set();
  function drop() { this.array = new this.array.constructor(0); }
  root.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.geometry) return;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingBox) g.computeBoundingBox();
    for (const a of [...Object.values(g.attributes), g.index]) if (a && !a.isInterleavedBufferAttribute && !seen.has(a)) { seen.add(a); a.onUpload(drop); }
  });
  return seen.size;
}
export function autoQuality() {
  const nav = navigator, mem = nav.deviceMemory || 4, cores = nav.hardwareConcurrency || 4, touch = matchMedia('(pointer: coarse)').matches;
  if (mem <= 2 || cores <= 2) return 'low';
  if (touch || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export function createEngine(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  scene.fog = new THREE.Fog(0xbfd9e8, 120, 380);
  // cielo
  const skyU = { top: { value: new THREE.Color(0x4f8fd6) }, bot: { value: new THREE.Color(0xd8ecf4) }, sun: { value: new THREE.Vector3(0.45, 0.62, 0.35).normalize() }, sunCol: { value: new THREE.Color(1, 0.9, 0.7) }, night: { value: 0 },
    moon: { value: new THREE.Vector3(-0.3, 0.7, -0.4).normalize() }, moonK: { value: 0 } }; // V2 P2: luna (ciclo con reloj)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, bot, sun, sunCol, moon; uniform float night, moonK; varying vec3 vP;
      void main(){ float y = max(vP.y, 0.0); vec3 c = mix(bot, top, pow(y, 0.6)); float s = max(dot(normalize(vP), sun), 0.0);
        c += sunCol * (pow(s, 900.0) * 4.0 + pow(s, 16.0) * 0.18);
        if (moonK > 0.0) { float m = max(dot(normalize(vP), moon), 0.0); c += vec3(0.85, 0.9, 1.0) * moonK * (smoothstep(0.99955, 0.99975, m) * 1.6 + pow(m, 60.0) * 0.12); }
        if (night > 0.0) { vec3 d = normalize(vP); vec2 g = floor(vec2(atan(d.z, d.x) * 180.0, d.y * 260.0)); float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453); c += vec3(step(0.996, h) * night * smoothstep(0.05, 0.3, d.y)); }
        // nubes suaves
        float n = sin(vP.x * 9.0 + vP.z * 4.0) * sin(vP.z * 7.0 - vP.x * 3.0) * 0.5 + 0.5; c = mix(c, vec3(1.0), smoothstep(0.75, 1.0, n) * smoothstep(0.05, 0.3, vP.y) * 0.35);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xdff1ff, 0x8a8576, 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60; sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
  // V2 P3: el reflejo del cielo (mapa de entorno PMREM) se muestreaba en TODOS los materiales PBR y era ~40 % del costo
  // por píxel en GPU lentas (medido con SwiftShader). Alta: en todo; media: sólo en lo metálico (vidrios, metal, agua);
  // baja: en nada (el ambiente sube un poco para compensar).
  let envK = 0.55, envMode = 'all'; const envMats = new Set();
  // ambientes horarios (día, atardecer, noche) y ciclo interpolado
  const TIMES = {
    dia: { top: 0x4f8fd6, bot: 0xd8ecf4, sun: 0xfff0dc, si: 2.6, dir: [0.45, 0.62, 0.35], hs: 0xdff1ff, hg: 0x8a8576, hi: 1.25, fog: 0xbfd9e8, exp: 1.05, env: 0.55, win: 0, night: 0, sunVis: 0xffe6b0 },
    atardecer: { top: 0x3b4f8f, bot: 0xffa66b, sun: 0xffa060, si: 1.9, dir: [0.8, 0.2, 0.3], hs: 0xffc8a0, hg: 0x5a4a50, hi: 0.9, fog: 0xe8a888, exp: 1.1, env: 0.4, win: 0.45, night: 0, sunVis: 0xff9a50 },
    noche: { top: 0x05081a, bot: 0x1b2a4a, sun: 0x9ab4ff, si: 0.45, dir: [-0.3, 0.7, -0.4], hs: 0x4a6090, hg: 0x202030, hi: 0.45, fog: 0x141c30, exp: 1.25, env: 0.15, win: 1, night: 1, sunVis: 0xdfe8ff },
    // V2 P2: amanecer (sólo en el ciclo con reloj)
    amanecer: { top: 0x4a64a8, bot: 0xf4b890, sun: 0xffc49a, si: 1.3, dir: [-0.8, 0.18, 0.3], hs: 0xd9c4c8, hg: 0x4e4858, hi: 0.8, fog: 0xd6b4a8, exp: 1.12, env: 0.32, win: 0.4, night: 0.1, sunVis: 0xffb070 },
  };
  /** V2 P2: claves del ciclo por hora del reloj (interpolación suave entre claves consecutivas) */
  const KEYS = [[0, 'noche'], [4.6, 'noche'], [6.2, 'amanecer'], [8.2, 'dia'], [16.2, 'dia'], [18.6, 'atardecer'], [20.4, 'noche'], [24, 'noche']];
  const _a = new THREE.Color(), _b = new THREE.Color();
  const lc = (k, x, y, t) => _a.setHex(x).lerp(_b.setHex(y), t);
  let timeState = { name: 'dia', win: 0 };
  function mixTime(A, B, t) {
    skyU.top.value.copy(lc('top', A.top, B.top, t)); skyU.bot.value.copy(lc('bot', A.bot, B.bot, t)); skyU.sunCol.value.copy(lc('s', A.sunVis, B.sunVis, t)); skyU.night.value = A.night + (B.night - A.night) * t;
    sun.color.copy(lc('sun', A.sun, B.sun, t)); sun.intensity = A.si + (B.si - A.si) * t;
    hemi.color.copy(lc('hs', A.hs, B.hs, t)); hemi.groundColor.copy(lc('hg', A.hg, B.hg, t)); hemi.intensity = (A.hi + (B.hi - A.hi) * t) * (envMode === 'none' ? 1.12 : envMode === 'metal' ? 1.05 : 1);
    scene.fog.color.copy(lc('f', A.fog, B.fog, t)); renderer.toneMappingExposure = A.exp + (B.exp - A.exp) * t; envK = A.env + (B.env - A.env) * t; scene.environmentIntensity = envK; for (const m of envMats) m.envMapIntensity = envK;
    sunDir.set(A.dir[0] + (B.dir[0] - A.dir[0]) * t, A.dir[1] + (B.dir[1] - A.dir[1]) * t, A.dir[2] + (B.dir[2] - A.dir[2]) * t).normalize(); skyU.sun.value.copy(sunDir);
    return A.win + (B.win - A.win) * t;
  }

  // entorno para reflejos (a partir de una escena con el cielo)
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = sky.clone(); envSky.scale.setScalar(50); envScene.add(envSky);
  const grd = new THREE.Mesh(new THREE.CircleGeometry(40, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6f7a80 })); grd.position.y = -2; envScene.add(grd);
  const envTex = pm.fromScene(envScene, 0.02).texture;
  scene.environment = envTex;
  scene.environmentIntensity = envK;
  pm.dispose();

  let preset = PRESETS[quality] || PRESETS.medium, qName = quality, rScale = 1;
  function applyQuality(q) {
    qName = q; preset = PRESETS[q] || PRESETS.medium;
    renderer.shadowMap.enabled = preset.shadows;
    sun.castShadow = preset.shadows;
    if (preset.shadows && sun.shadow.mapSize.x !== preset.shadowSize) { sun.shadow.mapSize.set(preset.shadowSize, preset.shadowSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    scene.fog.far = preset.fogFar; scene.fog.near = preset.fogFar * 0.3;
    camera.far = preset.far; camera.updateProjectionMatrix();
    refreshEnv(false);
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
    resize();
  }
  /** reparte el mapa de entorno según la calidad (llamar también después de crear materiales nuevos) */
  function refreshEnv(touch = true) {
    envMode = qName === 'high' ? 'all' : qName === 'medium' ? 'metal' : 'none';
    scene.environment = envMode === 'all' ? envTex : null;
    for (const m of envMats) { m.envMap = null; if (touch) m.needsUpdate = true; }
    envMats.clear();
    if (envMode === 'metal') scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial && m.metalness >= 0.3 && !envMats.has(m)) { envMats.add(m); m.envMap = envTex; m.envMapIntensity = envK; if (touch) m.needsUpdate = true; } });
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.dpr) * rScale);
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  applyQuality(quality);
  return {
    renderer, scene, camera, sun, hemi, sky,
    get quality() { return qName; }, get preset() { return preset; }, get renderScale() { return rScale; },
    applyQuality, resize, refreshEnv, get envMode() { return envMode; },
    /** resolución interna relativa (0,5–1): sólo el lienzo 3D, el HUD es DOM y no cambia */
    setRenderScale(k) { const v = Math.max(0.5, Math.min(1, k)); if (v !== rScale) { rScale = v; resize(); } },
    follow(x, z) {
      // a gran altura la bruma se aleja para ver la ciudad desde arriba
      const hy = Math.max(0, camera.position.y - 20); scene.fog.far = preset.fogFar + hy * 2.2; scene.fog.near = preset.fogFar * 0.3 + hy * 1.5; sun.target.position.set(x, 0, z); sun.position.set(x + sunDir.x * 200, sunDir.y * 200, z + sunDir.z * 200); sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 0.9); },
    render() { renderer.render(scene, camera); },
    /** 'dia'|'atardecer'|'noche' o 'ciclo' con fase 0..1 (0 = mediodía). Devuelve el nivel de ventanas encendidas 0..1. */
    setTime(name, phase = 0) {
      let w;
      if (name !== 'ciclo') w = mixTime(TIMES[name] || TIMES.dia, TIMES[name] || TIMES.dia, 0);
      else {
        const p = ((phase % 1) + 1) % 1, seq = [['dia', 0.45], ['atardecer', 0.1], ['noche', 0.35], ['atardecer', 0.1]];
        let acc = 0, i = 0; while (i < seq.length - 1 && p > acc + seq[i][1]) { acc += seq[i][1]; i++; }
        const t = Math.min(1, (p - acc) / seq[i][1]), A = TIMES[seq[i][0]], B = TIMES[seq[(i + 1) % seq.length][0]];
        w = mixTime(A, B, t < 0.7 ? 0 : (t - 0.7) / 0.3);
      }
      skyU.moonK.value = 0; // modos fijos: el disco del «sol» de la noche ya es la luna (como en V1)
      timeState = { name, win: w };
      return w;
    },
    /**
     * V2 P2: ciclo continuo por hora del reloj (0–24): cielo, sol que sale por el este y se pone por el oeste, luna de
     * noche (la luz direccional pasa a ser la luna), niebla, exposición y ventanas. Devuelve ventanas encendidas 0..1.
     */
    setHour(h) {
      h = ((h % 24) + 24) % 24;
      let i = 0; while (i < KEYS.length - 2 && h >= KEYS[i + 1][0]) i++;
      const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1], t0 = (h - h0) / Math.max(1e-6, h1 - h0), t = t0 * t0 * (3 - 2 * t0);
      const w = mixTime(TIMES[a], TIMES[b], t);
      // arco solar: 6 h este (−X), 12 h arriba, 18 h oeste (+X); de noche la luz direccional es la luna (opuesta)
      // de día (6:00–19:12) el sol recorre medio arco; de noche (10,8 h) sigue por debajo del horizonte
      const SR = 6, SS = 19.2, dayU = (h - SR) / (SS - SR), nightU = (((h - SS) % 24) + 24) % 24 / (24 - (SS - SR));
      const th = h >= SR && h <= SS ? dayU * Math.PI : Math.PI + nightU * Math.PI, sy = Math.sin(th);
      const sd = new THREE.Vector3(-Math.cos(th) * 0.85, sy, 0.35).normalize();
      skyU.sun.value.copy(sd);
      const day = THREE.MathUtils.smoothstep(sy, -0.12, 0.1);
      skyU.sunCol.value.multiplyScalar(day);
      const md = new THREE.Vector3(Math.cos(th) * 0.6, Math.max(0.25, -sy), -0.45).normalize();
      skyU.moon.value.copy(md); skyU.moonK.value = 1 - day;
      // la luz direccional: sol (alto al mediodía, bajo al atardecer) o luna; nunca por debajo del horizonte (sombras)
      if (day > 0.5) sunDir.set(sd.x, Math.max(0.16, sd.y), sd.z).normalize(); else sunDir.copy(md);
      timeState = { name: 'ciclo', win: w, hour: +h.toFixed(3), key: t < 0.5 ? a : b, sunUp: day > 0.5, moon: +(1 - day).toFixed(2) };
      return w;
    },
    get time() { return timeState; },
  };
}
