// Mateo: Ciudad de Altura — V2 P2: luces de la noche baratas (sin luces reales: el kit pide en móvil materiales
// emisivos). Charcos de luz bajo los faroles (una sola InstancedMesh aditiva) que se encienden con el reloj
// (lampLevel 0..1), y la textura radial compartida para los faros de los autos y del kart.
import * as THREE from 'three';

let _tex = null;
/** degradé radial blanco → transparente (charco de luz) */
export function poolTexture() {
  if (_tex) return _tex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _tex = new THREE.CanvasTexture(c); _tex.colorSpace = THREE.SRGBColorSpace;
  return _tex;
}
export function poolMaterial(color, opacity = 0) {
  return new THREE.MeshBasicMaterial({ map: poolTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
}

/** @param {THREE.Scene} scene @param {number[][]} lamps [[x, yCabeza, z], …] */
export function createNightLights(scene, lamps) {
  const geo = new THREE.PlaneGeometry(7.5, 7.5).rotateX(-Math.PI / 2);
  const mat = poolMaterial(0xffd9a0);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, lamps.length));
  const m = new THREE.Matrix4();
  lamps.forEach((l, i) => { m.makeTranslation(l[0], 0.215, l[2]); mesh.setMatrixAt(i, m); });
  mesh.count = lamps.length; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 2; mesh.name = 'charcos_de_luz';
  scene.add(mesh);
  let level = 0;
  return {
    mesh,
    /** k = 0..1 (farolas apagadas → encendidas) */
    set(k) { level = k; mat.opacity = 0.65 * k; mesh.visible = k > 0.01; },
    get level() { return level; },
    get count() { return lamps.length; },
  };
}
