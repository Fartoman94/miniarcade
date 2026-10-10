// @ts-check
/* Efectos y pools: partículas (1 draw call), destellos, proyectiles instanciados, líneas de aviso y haz láser.
   Todo se reserva al crear el sector: en el bucle no se crean objetos. */
import * as THREE from 'three';

const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Textura de punto radial (canvas) compartida. */
let dotTex = /** @type {THREE.Texture|null} */ (null);
export function getDotTexture() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.85)'); gr.addColorStop(0.6, 'rgba(255,255,255,.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c); dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}
export function releaseDotTexture() { if (dotTex) { dotTex.dispose(); dotTex = null; } }

/* ---------------- partículas ---------------- */
/** @param {THREE.Object3D} parent @param {number} n */
export function createParticles(parent, n) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3), life = new Float32Array(n), max = new Float32Array(n), base = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -99999;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.PointsMaterial({ size: 1.6, map: getDotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  parent.add(pts);
  let head = 0, alive = 0;
  return {
    get alive() { return alive; },
    /** @param {THREE.Vector3} p @param {number} count @param {number} color @param {number} speed @param {number} lifeS @param {THREE.Vector3} [inherit] */
    burst(p, count, color, speed, lifeS, inherit) {
      _c.setHex(color);
      for (let k = 0; k < count; k++) {
        const i = head; head = (head + 1) % n;
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), sp = speed * (0.35 + Math.random() * 0.65);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        vel[i * 3] = r * Math.cos(th) * sp + (inherit ? inherit.x * 0.5 : 0);
        vel[i * 3 + 1] = u * sp + (inherit ? inherit.y * 0.5 : 0);
        vel[i * 3 + 2] = r * Math.sin(th) * sp + (inherit ? inherit.z * 0.5 : 0);
        const l = lifeS * (0.5 + Math.random() * 0.5);
        life[i] = l; max[i] = l;
        const j = 0.8 + Math.random() * 0.4;
        base[i * 3] = _c.r * j; base[i * 3 + 1] = _c.g * j; base[i * 3 + 2] = _c.b * j;
      }
    },
    /** Estela (una partícula con velocidad dada). */
    trail(p, color, lifeS, vx = 0, vy = 0, vz = 0) {
      const i = head; head = (head + 1) % n; _c.setHex(color);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      life[i] = lifeS; max[i] = lifeS; base[i * 3] = _c.r; base[i * 3 + 1] = _c.g; base[i * 3 + 2] = _c.b;
    },
    /** @param {number} dt */
    update(dt) {
      alive = 0;
      for (let i = 0; i < n; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -99999; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        alive++;
        const d = 1 - dt * 1.6;
        vel[i * 3] *= d; vel[i * 3 + 1] *= d; vel[i * 3 + 2] *= d;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = life[i] / max[i];
        col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    clear() { life.fill(0); for (let i = 0; i < n; i++) { pos[i * 3 + 1] = -99999; } col.fill(0); geo.attributes.position.needsUpdate = true; },
    dispose() { parent.remove(pts); geo.dispose(); mat.dispose(); },
  };
}

/* ---------------- destellos (sprites aditivos) ---------------- */
/** @param {THREE.Object3D} parent @param {number} n */
export function createFlashes(parent, n, calm = () => false) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.SpriteMaterial({ map: getDotTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const s = new THREE.Sprite(m); s.visible = false; parent.add(s);
    items.push({ s, m, t: 0, d: 1, size: 1 });
  }
  let head = 0;
  return {
    /** @param {THREE.Vector3} p @param {number} size @param {number} color @param {number} [d] */
    spawn(p, size, color, d = 0.45) {
      if (calm()) size = Math.min(size, 40);
      const it = items[head]; head = (head + 1) % n;
      it.s.position.copy(p); it.t = 0; it.d = d; it.size = size; it.m.color.setHex(color); it.s.visible = true; it.s.scale.setScalar(size * 0.3);
    },
    /** @param {number} dt */
    update(dt) {
      for (const it of items) {
        if (!it.s.visible) continue;
        it.t += dt; const k = it.t / it.d;
        if (k >= 1) { it.s.visible = false; continue; }
        it.s.scale.setScalar(it.size * (0.3 + k * 0.9)); it.m.opacity = 1 - k;
      }
    },
    clear() { items.forEach(it => it.s.visible = false); },
    dispose() { items.forEach(it => { parent.remove(it.s); it.m.dispose(); }); },
  };
}

/* ---------------- proyectiles instanciados ---------------- */
/**
 * @param {THREE.Object3D} parent
 * @param {{count:number, geometry:THREE.BufferGeometry, material:THREE.Material, orient?:boolean, scale?:number}} o
 */
export function createPool(parent, o) {
  const mesh = new THREE.InstancedMesh(o.geometry, o.material, o.count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  parent.add(mesh);
  /** @type {{alive:boolean, pos:THREE.Vector3, vel:THREE.Vector3, life:number, dmg:number, owner:number, hp:number, t:number, target:any, state:number, spin:number}[]} */
  const items = [];
  for (let i = 0; i < o.count; i++) { items.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, dmg: 0, owner: 0, hp: 0, t: 0, target: null, state: 0, spin: Math.random() * 6 }); mesh.setMatrixAt(i, ZERO); }
  let head = 0;
  const sc = o.scale || 1;
  return {
    mesh, items,
    /** @param {THREE.Vector3} p @param {THREE.Vector3} v */
    spawn(p, v, life, dmg, owner = 0) {
      for (let k = 0; k < o.count; k++) {
        const i = (head + k) % o.count, it = items[i];
        if (it.alive) continue;
        head = (i + 1) % o.count;
        it.alive = true; it.pos.copy(p); it.vel.copy(v); it.life = life; it.dmg = dmg; it.owner = owner; it.t = 0; it.state = 0; it.target = null; it.hp = 1;
        return it;
      }
      return null;
    },
    count() { let c = 0; for (const it of items) if (it.alive) c++; return c; },
    sync() {
      let last = -1;
      for (let i = 0; i < o.count; i++) {
        const it = items[i];
        if (!it.alive) { mesh.setMatrixAt(i, ZERO); continue; }
        last = i;
        if (o.orient !== false && it.vel.lengthSq() > 1e-6) { _v.copy(it.vel).normalize(); _q.setFromUnitVectors(Z, _v); }
        else { _q.setFromAxisAngle(Y, it.spin + it.t * 1.5); }
        _s.setScalar(sc); _m.compose(it.pos, _q, _s); mesh.setMatrixAt(i, _m);
      }
      mesh.count = last + 1;
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { items.forEach(it => it.alive = false); this.sync(); },
    dispose() { parent.remove(mesh); mesh.dispose(); },
  };
}

/* ---------------- líneas de aviso (telegrafía) ---------------- */
/** Cilindros finos instanciados con color aditivo (negro = invisible). @param {THREE.Object3D} parent @param {number} n */
export function createLines(parent, n) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  const black = new THREE.Color(0, 0, 0);
  for (let i = 0; i < n; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, black); }
  parent.add(mesh);
  let used = 0;
  return {
    mesh,
    begin() { used = 0; },
    /** @param {THREE.Vector3} a @param {THREE.Vector3} b @param {number} width @param {number} color @param {number} k intensidad 0..1 */
    add(a, b, width, color, k) {
      if (used >= n) return;
      _v.subVectors(b, a); const len = _v.length(); if (len < 1e-3) return;
      _v.divideScalar(len); _q.setFromUnitVectors(Y, _v); _s.set(width, len, width);
      _m.compose(a, _q, _s); mesh.setMatrixAt(used, _m);
      _c.setHex(color).multiplyScalar(k); mesh.setColorAt(used, _c); used++;
    },
    end() {
      for (let i = used; i < n; i++) mesh.setMatrixAt(i, ZERO);
      mesh.count = Math.max(used, 0);
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    get used() { return used; },
    dispose() { parent.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
}
