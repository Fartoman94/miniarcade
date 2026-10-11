// Mateo: Ciudad de Altura — oclusión: lo que tapa a Mateo se vuelve "rejilla" (tramado de puntos) sólo mientras lo tapa.
// Cada fragmento de los materiales de la ciudad que cae dentro del cono cámara → Mateo (la silueta de una esfera que lo
// envuelve) y por delante de él se descarta con un patrón Bayer 4×4 (≤ 80 %: el obstáculo se sigue intuyendo). No toca
// colisiones, sombras (el material de sombra es otro) ni el piso (asfalto, veredas, pasto, techos y líneas quedan fuera).
import * as THREE from 'three';

const EXCLUDE = new Set(['asphalt', 'sidewalk', 'grass', 'roof', 'lines', 'water', 'glow']);
const VERT_DECL = 'varying vec3 vOccW;\n';
const VERT_BODY = `
#ifdef USE_INSTANCING
  vOccW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vOccW = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;
const FRAG_DECL = `varying vec3 vOccW; uniform vec3 uOccA; uniform vec3 uOccB; uniform float uOccR; uniform float uOccOn;
const float OCC_BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
`;
const FRAG_BODY = `
  if (uOccOn > 0.0) {
    vec3 ab = uOccB - uOccA; float l2 = max(dot(ab, ab), 1e-4);
    float t = dot(vOccW - uOccA, ab) / l2;
    // sólo lo que está DELANTE de Mateo: más cerca de la cámara que el frente de su cuerpo (≈ 0,4 m antes del centro)
    float tMax = 1.0 - 0.4 / sqrt(l2);
    if (t > 0.03 && t < tMax) {
      float d = length(vOccW - (uOccA + ab * t)), r = uOccR * t;
      float k = (1.0 - smoothstep(r * 0.72, r, d)) * smoothstep(tMax, tMax - 0.08, t) * 0.8 * uOccOn;
      ivec2 g = ivec2(mod(gl_FragCoord.xy, 4.0));
      if (k > (OCC_BAYER[g.y * 4 + g.x] + 0.5) / 16.0) discard;
    }
  }
`;

export function createOcclusion() {
  const uniforms = { uOccA: { value: new THREE.Vector3() }, uOccB: { value: new THREE.Vector3(0, -1000, 0) }, uOccR: { value: 0.85 }, uOccOn: { value: 0 } };
  function patch(m) {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
      sh.fragmentShader = FRAG_DECL + sh.fragmentShader.replace('void main() {', 'void main() {\n' + FRAG_BODY);
    };
    const key = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : () => '';
    m.customProgramCacheKey = () => key() + '|occ1';
    m.needsUpdate = true;
    return m;
  }
  return {
    uniforms,
    /** aplica el recorte a los materiales de la ciudad (excepto pisos) */
    apply(mats) { const out = []; for (const [k, m] of Object.entries(mats)) if (!EXCLUDE.has(k) && m && m.isMaterial) { patch(m); out.push(k); } return out; },
    patch,
    /** cono desde la cámara (a) hasta la esfera que envuelve a Mateo (centro b, radio r) */
    update(a, b, r, on) { uniforms.uOccA.value.copy(a); uniforms.uOccB.value.copy(b); uniforms.uOccR.value = r; uniforms.uOccOn.value = on; },
    get on() { return uniforms.uOccOn.value; },
  };
}
