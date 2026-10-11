// Mateo: Ciudad de Altura — sonda de QA (sólo con ?debug): mide cuánto de Mateo se ve REALMENTE en pantalla.
// Dos pasadas a un render target chico: (A) sólo Mateo en magenta → silueta completa; (B) la escena en negro (con el
// mismo recorte de oclusión que ve el jugador) + Mateo en magenta con prueba de profundidad → silueta visible.
// visible = píxeles(B) / píxeles(A). También informa altura en pantalla y si la cámara quedó dentro de un sólido.
import * as THREE from 'three';

const SOLID = new Set(['building', 'parapet', 'prop', 'fountain', 'fence', 'beam', 'trampoline', 'pole', 'tree']);

export function createProbe({ renderer, scene, camera, hero, world, occlusionMaterial }) {
  const W = 192;
  let rt = null, H = 108, buf = null;
  const magenta = new THREE.MeshBasicMaterial({ color: 0xff00ff, fog: false, toneMapped: false });
  const black = occlusionMaterial ? occlusionMaterial() : new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, toneMapped: false });
  const heroMeshes = []; hero.group.traverse(o => { if (o.isMesh) heroMeshes.push(o); });
  function ensure() {
    const h = Math.max(24, Math.round(W / Math.max(0.2, camera.aspect)));
    if (!rt || h !== H) { if (rt) rt.dispose(); H = h; rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true }); buf = new Uint8Array(W * H * 4); }
  }
  function count() {
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    let n = 0, minY = H, maxY = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (buf[i] > 200 && buf[i + 1] < 60 && buf[i + 2] > 200) { n++; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    return { n, h: maxY >= minY ? (maxY - minY + 1) / H : 0 };
  }
  /** Mide la visibilidad de Mateo desde la cámara actual. */
  function visibility() {
    ensure();
    camera.updateMatrixWorld();
    const mats = heroMeshes.map(m => m.material), vis = scene.children.map(o => o.visible);
    const prevRT = renderer.getRenderTarget(), prevAuto = renderer.autoClear, prevBg = scene.background, prevOv = scene.overrideMaterial;
    const shadows = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
    scene.background = null;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1);
    // A: sólo Mateo
    for (const m of heroMeshes) m.material = magenta;
    scene.children.forEach(o => { o.visible = o === hero.group; });
    // (dos veces: el primer cuadro tras simular sin dibujar puede usar huesos del cuadro anterior)
    renderer.clear(); renderer.render(scene, camera); renderer.clear(); renderer.render(scene, camera);
    const A = count();
    // B: escena (negra, con recorte) y luego Mateo con prueba de profundidad
    scene.children.forEach((o, i) => { o.visible = vis[i] && o !== hero.group && !o.userData.skipProbe; });
    const odd = []; scene.traverse(o => { if ((o.isSprite || o.isPoints || o.isLine) && o.visible) { odd.push(o); o.visible = false; } });
    scene.overrideMaterial = black; renderer.clear(); renderer.render(scene, camera);
    for (const o of odd) o.visible = true;
    scene.overrideMaterial = null; renderer.autoClear = false;
    scene.children.forEach(o => { o.visible = o === hero.group; });
    renderer.render(scene, camera);
    const B = count();
    // restaurar
    renderer.autoClear = prevAuto; renderer.setRenderTarget(prevRT); renderer.shadowMap.enabled = shadows;
    scene.children.forEach((o, i) => { o.visible = vis[i]; }); scene.background = prevBg; scene.overrideMaterial = prevOv;
    heroMeshes.forEach((m, i) => { m.material = mats[i]; });
    return { onScreen: A.n > 0, ratio: A.n ? B.n / A.n : 0, px: A.n, screenH: A.h };
  }
  /** ¿La cámara (con el radio del plano cercano) quedó dentro de alguna caja sólida? */
  function cameraInside(rad = 0.12) {
    const p = camera.position, out = [];
    for (const b of world.near(p.x - 1, p.z - 1, p.x + 1, p.z + 1, [])) {
      if (!SOLID.has(b.kind)) continue;
      if (p.x > b.minX - rad && p.x < b.maxX + rad && p.y > b.minY - rad && p.y < b.maxY + rad && p.z > b.minZ - rad && p.z < b.maxZ + rad) {
        // sólo cuenta si el punto está realmente dentro (no apenas rozando una cara por fuera del radio)
        const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX), dy = Math.max(b.minY - p.y, 0, p.y - b.maxY), dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
        if (Math.hypot(dx, dy, dz) < rad) out.push(b.kind);
      }
    }
    return out;
  }
  return { visibility, cameraInside };
}
