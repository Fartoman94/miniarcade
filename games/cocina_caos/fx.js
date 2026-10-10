// @ts-check
/* Cocina del Caos — efectos y vistas reutilizables (todo con pools: nada se crea por cuadro):
   partículas, llamas, charcos, marcas de aviso, resaltado de la estación enfocada y vistas de ítems. */
import * as THREE from 'three';
import { MAT, Builder, mesh, ingGeo, plateGeo, dirtyGeo, extGeo, fireGeo, ringGeo, puddleGeo } from './models.js';

export function createFX(scene) {
  /* ---------- partículas ---------- */
  const PMAX = 300;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pGrav = new Float32Array(PMAX);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(0.5, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.24, map: dot, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -99;
  let pNext = 0, cap = 180, live = 0;
  const _c = new THREE.Color();
  function burst(x, y, z, color, n = 8, up = 2.5, grav = 7) {
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = pNext; pNext = (pNext + 1) % cap;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.6;
      pVel[i * 3] = Math.cos(a) * sp; pVel[i * 3 + 1] = up * (0.5 + Math.random()); pVel[i * 3 + 2] = Math.sin(a) * sp;
      pCol[i * 3] = _c.r; pCol[i * 3 + 1] = _c.g; pCol[i * 3 + 2] = _c.b; pLife[i] = 0.5 + Math.random() * 0.5; pGrav[i] = grav;
    }
  }
  /** humo/vapor que sube lento */
  function puff(x, y, z, color, n = 1) {
    _c.set(color);
    for (let k = 0; k < n; k++) {
      const i = pNext; pNext = (pNext + 1) % cap;
      pPos[i * 3] = x + (Math.random() - 0.5) * 0.3; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      pVel[i * 3] = (Math.random() - 0.5) * 0.3; pVel[i * 3 + 1] = 0.8 + Math.random() * 0.6; pVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      pCol[i * 3] = _c.r; pCol[i * 3 + 1] = _c.g; pCol[i * 3 + 2] = _c.b; pLife[i] = 0.9 + Math.random() * 0.6; pGrav[i] = -0.3;
    }
  }
  function updateParticles(dt) {
    live = 0;
    for (let i = 0; i < PMAX; i++) {
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt; live++;
      pVel[i * 3 + 1] -= pGrav[i] * dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.03) { pPos[i * 3 + 1] = 0.03; pVel[i * 3 + 1] *= -0.3; }
      if (pLife[i] <= 0) pPos[i * 3 + 1] = -99;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- llamas, charcos y marcas ---------- */
  const fires = []; for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(fireGeo, MAT.fire); m.visible = false; scene.add(m); fires.push(m); }
  const puddles = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(puddleGeo, MAT.puddle); m.visible = false; m.position.y = 0.012; m.renderOrder = 1; scene.add(m); puddles.push(m); }
  const marks = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(ringGeo, MAT.danger); m.visible = false; m.renderOrder = 2; scene.add(m); marks.push(m); }
  const bars = []; // barras de progreso sobre estaciones (picar/lavar/cocinar)
  const barBg = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthTest: false, toneMapped: false });
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.13), barBg); bg.renderOrder = 10;
    const fm = new THREE.MeshBasicMaterial({ color: 0x6be38a, depthTest: false, toneMapped: false });
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.08), fm); fg.position.z = 0.001; fg.renderOrder = 11;
    g.add(bg, fg); g.visible = false; scene.add(g); bars.push({ g, fg, fm });
  }
  /* ---------- resaltado de la estación enfocada ---------- */
  const hl = new THREE.Group(); hl.visible = false; scene.add(hl);
  const frameGeo = new Builder().box(1.22, 0.06, 0.06, 0xffffff, [0, 0, 0.6]).box(1.22, 0.06, 0.06, 0xffffff, [0, 0, -0.6]).box(0.06, 0.06, 1.22, 0xffffff, [0.6, 0, 0]).box(0.06, 0.06, 1.22, 0xffffff, [-0.6, 0, 0]).build();
  frameGeo.deleteAttribute('color');
  const frame = new THREE.Mesh(frameGeo, MAT.hl); frame.renderOrder = 5; hl.add(frame);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.16).rotateX(-Math.PI / 2), MAT.hlFill); fill.position.y = 0.01; hl.add(fill);
  const chevGeo = new Builder().cone(0.16, 0.28, 4, 0xffffff, [0, 0, 0], [Math.PI, Math.PI / 4, 0]).build(); chevGeo.deleteAttribute('color');
  const chev = new THREE.Mesh(chevGeo, MAT.hl); chev.renderOrder = 6; hl.add(chev);
  const hlRing = new THREE.Mesh(ringGeo, MAT.hl); hlRing.visible = false; scene.add(hlRing); // para roedores y derrames
  // guía del tutorial (flecha amarilla grande)
  const guide = new THREE.Mesh(new Builder().cone(0.28, 0.5, 4, 0xffffff, [0, 0, 0], [Math.PI, Math.PI / 4, 0]).build(), MAT.guide); guide.visible = false; scene.add(guide);

  /* ---------- vistas de ítems ---------- */
  const views = [];
  for (let i = 0; i < 44; i++) {
    const g = new THREE.Group(); g.visible = false;
    const main = mesh(plateGeo, MAT.base, true); g.add(main);
    const subs = []; for (let k = 0; k < 4; k++) { const s = mesh(plateGeo, MAT.base, false); s.visible = false; g.add(s); subs.push(s); }
    scene.add(g); views.push({ g, main, subs, key: '' });
  }
  let vi = 0;
  const OFF = [[0, 0], [0.1, 0.06], [-0.1, 0.06], [0, -0.11]];
  function itemKey(it) { return it.t === 'ing' ? 'i' + it.ing + it.st : it.t === 'plate' ? 'p' + it.items.join(',') : it.t === 'dirty' ? 'd' + Math.min(4, it.n) : 'e'; }
  /** Dibuja un ítem en (x,y,z) este cuadro. */
  function drawItem(it, x, y, z, yaw = 0, s = 1) {
    if (!it || vi >= views.length) return;
    const v = views[vi++];
    const k = itemKey(it);
    if (v.key !== k) {
      v.key = k;
      for (const sb of v.subs) sb.visible = false;
      if (it.t === 'ing') v.main.geometry = ingGeo(it.ing, it.st);
      else if (it.t === 'ext') v.main.geometry = extGeo;
      else if (it.t === 'dirty') { v.main.geometry = dirtyGeo; for (let j = 1; j < Math.min(4, it.n); j++) { const sb = v.subs[j - 1]; sb.geometry = dirtyGeo; sb.position.set(0, j * 0.055, 0); sb.scale.setScalar(1); sb.visible = true; } }
      else {
        v.main.geometry = plateGeo;
        const n = it.items.length;
        it.items.forEach((kk, j) => { const [ing, st] = kk.split(':'); const sb = v.subs[j]; sb.geometry = ingGeo(ing, st); const o = n === 1 ? [0, 0] : OFF[j]; sb.position.set(o[0], 0.05 + (ing === 'pan' ? 0 : n > 2 ? 0.02 * j : 0), o[1]); sb.scale.setScalar(n > 1 ? 0.8 : 1); sb.visible = true; });
      }
    }
    v.g.position.set(x, y, z); v.g.rotation.y = yaw; v.g.scale.setScalar(s); v.g.visible = true;
  }
  function beginFrame() { vi = 0; }
  function endFrame() { for (let i = vi; i < views.length; i++) if (views[i].g.visible) views[i].g.visible = false; }

  return {
    burst, puff, updateParticles, fires, puddles, marks, bars, hl, frame, chev, hlRing, guide, drawItem, beginFrame, endFrame,
    setCap(n) { cap = Math.min(PMAX, n); },
    get live() { return live; }, get views() { return vi; },
  };
}
