// @ts-check
/* Efectos: partículas (Points), trazadoras, avisos telegráficos en el piso (anillos, rellenos y líneas),
   charcos tóxicos y proyectiles instanciados. Todo con pools fijos: nada se crea por cuadro. */
import * as THREE from 'three';

let dotTex = /** @type {THREE.Texture|null} */ (null), dotRefs = 0;
function getDot() {
  if (!dotTex) {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  }
  dotRefs++;
  return dotTex;
}
function releaseDot() { if (--dotRefs <= 0 && dotTex) { dotTex.dispose(); dotTex = null; dotRefs = 0; } }

/** Sistema de partículas. additive: chispas/brillos; normal: sangre/escombros. */
export function createParticles(parent, max, additive) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3), life = new Float32Array(max), maxLife = new Float32Array(max), base = new Float32Array(max * 3), grav = new Float32Array(max);
  for (let i = 0; i < max; i++) pos[i * 3 + 1] = -999;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = new THREE.PointsMaterial({ size: additive ? 0.32 : 0.22, map: getDot(), vertexColors: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false, sizeAttenuation: true, alphaTest: additive ? 0 : 0.15 });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = additive ? 'chispas' : 'restos';
  parent.add(pts);
  let head = 0, alive = 0;
  const _c = new THREE.Color();
  return {
    get alive() { return alive; },
    /** @param {number} x @param {number} y @param {number} z @param {number} n @param {number} color @param {number} speed @param {number} lifeT @param {number} [g] @param {number} [up] */
    burst(x, y, z, n, color, speed, lifeT, g = 9, up = 0.5) {
      _c.setHex(color);
      for (let k = 0; k < n; k++) {
        const i = head; head = (head + 1) % max;
        if (life[i] <= 0) alive++;
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.5, s = speed * (0.35 + Math.random() * 0.65);
        vel[i * 3] = Math.cos(a) * Math.cos(e) * s; vel[i * 3 + 1] = Math.abs(Math.sin(e)) * s + up * speed; vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        const j = 0.75 + Math.random() * 0.4;
        base[i * 3] = _c.r * j; base[i * 3 + 1] = _c.g * j; base[i * 3 + 2] = _c.b * j;
        life[i] = maxLife[i] = lifeT * (0.6 + Math.random() * 0.6); grav[i] = g;
      }
    },
    /** Partículas que suben lento (vapor, gas). */
    plume(x, y, z, n, color, spread, rise, lifeT) {
      _c.setHex(color);
      for (let k = 0; k < n; k++) {
        const i = head; head = (head + 1) % max;
        if (life[i] <= 0) alive++;
        pos[i * 3] = x + (Math.random() - 0.5) * spread; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
        vel[i * 3] = (Math.random() - 0.5) * 0.6; vel[i * 3 + 1] = rise * (0.6 + Math.random() * 0.6); vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        base[i * 3] = _c.r; base[i * 3 + 1] = _c.g; base[i * 3 + 2] = _c.b;
        life[i] = maxLife[i] = lifeT * (0.6 + Math.random() * 0.6); grav[i] = -0.3;
      }
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -999; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        n++;
        vel[i * 3 + 1] -= grav[i] * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.03) { pos[i * 3 + 1] = 0.03; vel[i * 3] *= 0.6; vel[i * 3 + 2] *= 0.6; vel[i * 3 + 1] *= -0.25; }
        const k = additive ? life[i] / maxLife[i] : 1;
        col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
      }
      alive = n;
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    clear() { life.fill(0); for (let i = 0; i < max; i++) pos[i * 3 + 1] = -999; alive = 0; geo.attributes.position.needsUpdate = true; },
    dispose() { parent.remove(pts); geo.dispose(); mat.dispose(); releaseDot(); },
  };
}

/** Pool instanciado genérico (proyectiles, charcos, marcas). */
export function createPool(parent, { count, geometry, material, name = '' }) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.name = name;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
  parent.add(mesh);
  const used = new Uint8Array(count);
  let n = 0;
  mesh.visible = false; // un pool vacío no genera draw call
  return {
    mesh,
    get count() { return n; },
    alloc() { for (let i = 0; i < count; i++) if (!used[i]) { used[i] = 1; n++; mesh.visible = true; return i; } return -1; },
    free(i) { if (i < 0 || !used[i]) return; used[i] = 0; n--; mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; if (!n) mesh.visible = false; },
    /** @param {number} i @param {THREE.Matrix4} m */ set(i, m) { mesh.setMatrixAt(i, m); mesh.instanceMatrix.needsUpdate = true; },
    color(i, c) { mesh.setColorAt(i, c); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; },
    clear() { used.fill(0); n = 0; mesh.visible = false; for (let i = 0; i < count; i++) mesh.setMatrixAt(i, zero); mesh.instanceMatrix.needsUpdate = true; },
    dispose() { parent.remove(mesh); mesh.dispose(); },
  };
}

/** Avisos telegráficos en el piso: anillo + relleno que crece hasta el impacto, y líneas (cargas, rayos). */
export function createTelegraphs(parent) {
  const ringG = new THREE.RingGeometry(0.92, 1, 32); ringG.rotateX(-Math.PI / 2);
  const discG = new THREE.CircleGeometry(1, 28); discG.rotateX(-Math.PI / 2);
  const lineG = new THREE.PlaneGeometry(1, 1); lineG.rotateX(-Math.PI / 2); lineG.translate(0, 0, 0.5);
  const mk = (/** @type {number} */ op) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const ringM = mk(0.9), discM = mk(0.35), lineM = mk(0.45);
  const rings = createPool(parent, { count: 40, geometry: ringG, material: ringM, name: 'avisos' });
  const discs = createPool(parent, { count: 40, geometry: discG, material: discM, name: 'avisos-relleno' });
  const lines = createPool(parent, { count: 12, geometry: lineG, material: lineM, name: 'avisos-linea' });
  /** @type {{x:number,z:number,r:number,t:number,dur:number,ri:number,di:number,y:number,expand:boolean}[]} */
  const zones = [];
  /** @type {{li:number,t:number,dur:number}[]} */
  const lineList = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), Y = new THREE.Vector3(0, 1, 0);
  function setZone(z) {
    const k = Math.min(1, z.t / z.dur);
    const rr = z.expand ? z.r * Math.max(0.05, k) : z.r;
    m4.compose(p.set(z.x, z.y, z.z), q.identity(), s.set(rr, 1, rr)); rings.set(z.ri, m4);
    if (z.di >= 0) { const f = z.r * Math.max(0.02, k); m4.compose(p.set(z.x, z.y - 0.005, z.z), q.identity(), s.set(f, 1, f)); discs.set(z.di, m4); }
  }
  return {
    /** Zona circular: relleno crece de 0 a r en `dur` s (o el anillo se expande si expand). Devuelve índice o -1. */
    zone(x, z, r, dur, color, expand = false, y = 0.07) {
      const ri = rings.alloc(); if (ri < 0) return -1;
      const di = expand ? -1 : discs.alloc();
      c.setHex(color); rings.color(ri, c); if (di >= 0) discs.color(di, c);
      const zz = { x, z, r, t: 0, dur, ri, di, y, expand };
      zones.push(zz); setZone(zz);
      return zones.length - 1;
    },
    /** Línea en el piso desde (x,z) con ángulo yaw, largo y ancho, durante dur s. */
    line(x, z, yaw, len, width, dur, color) {
      const li = lines.alloc(); if (li < 0) return;
      c.setHex(color); lines.color(li, c);
      q.setFromAxisAngle(Y, yaw); m4.compose(p.set(x, 0.08, z), q, s.set(width, 1, len)); lines.set(li, m4);
      lineList.push({ li, t: 0, dur });
    },
    update(dt) {
      for (let i = zones.length - 1; i >= 0; i--) {
        const z = zones[i]; z.t += dt;
        if (z.t >= z.dur) { rings.free(z.ri); discs.free(z.di); zones.splice(i, 1); continue; }
        setZone(z);
      }
      for (let i = lineList.length - 1; i >= 0; i--) { const l = lineList[i]; l.t += dt; if (l.t >= l.dur) { lines.free(l.li); lineList.splice(i, 1); } }
      lineM.opacity = 0.3 + 0.25 * Math.abs(Math.sin(performance.now() * 0.012));
    },
    get count() { return zones.length + lineList.length; },
    clear() { zones.length = 0; lineList.length = 0; rings.clear(); discs.clear(); lines.clear(); },
    dispose() { rings.dispose(); discs.dispose(); lines.dispose(); ringG.dispose(); discG.dispose(); lineG.dispose(); ringM.dispose(); discM.dispose(); lineM.dispose(); },
  };
}

/** Trazadoras de disparo (cajas finas estiradas, aditivas). */
export function createTracers(parent, max) {
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pool = createPool(parent, { count: max, geometry: g, material: mat, name: 'trazadoras' });
  /** @type {{i:number,t:number}[]} */ const live = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), d = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), c = new THREE.Color();
  return {
    pool,
    shot(a, b, color = 0xfff0a0, w = 0.05) {
      const i = pool.alloc(); if (i < 0) return;
      d.subVectors(b, a); const len = d.length(); if (len < 0.01) { pool.free(i); return; }
      d.multiplyScalar(1 / len); q.setFromUnitVectors(Z, d);
      m4.compose(a, q, s.set(w, w, len)); pool.set(i, m4); pool.color(i, c.setHex(color));
      live.push({ i, t: 0.06 });
    },
    update(dt) { for (let k = live.length - 1; k >= 0; k--) { live[k].t -= dt; if (live[k].t <= 0) { pool.free(live[k].i); live.splice(k, 1); } } },
    clear() { live.length = 0; pool.clear(); },
    dispose() { pool.dispose(); g.dispose(); mat.dispose(); },
  };
}

export const releaseFx = releaseDot;
