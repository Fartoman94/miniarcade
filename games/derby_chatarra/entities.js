// @ts-check
/* Derby de Chatarra — autos: objeto de física + malla (cuerpo con abolladuras reales por zona, ruedas instanciadas,
   sombra, escudo, imán, alerta, estrellas de aturdimiento, llamas de nitro y marcador). */
import * as THREE from 'three';
import { carModel, wheelGeo, grinderGeo, shieldGeo, Builder } from './models.js';

const MAX_WHEELS = 64;
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const DAMAGED = new THREE.Color(0x3a2c24);

/** Textura radial para sombras de contacto. */
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
/** hash determinista por vértice */
const hash = i => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };

/** @param {THREE.Scene} scene */
export function createCars(scene) {
  const wheelMesh = new THREE.InstancedMesh(wheelGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), MAX_WHEELS);
  wheelMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); wheelMesh.count = 0; wheelMesh.castShadow = true; wheelMesh.frustumCulled = false;
  const blobTex = blobTexture();
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobMesh = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false }), 12);
  blobMesh.count = 0; blobMesh.frustumCulled = false; blobMesh.renderOrder = 1;
  scene.add(wheelMesh, blobMesh);
  // geometrías/materiales compartidos de efectos
  const shared = {
    bubbleG: new THREE.IcosahedronGeometry(1, 2),
    bubbleM: new THREE.MeshBasicMaterial({ color: 0x3ec8ff, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
    ringG: new THREE.TorusGeometry(1, 0.07, 4, 28).rotateX(Math.PI / 2),
    ringM: new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.8, toneMapped: false }),
    alertG: new Builder().box(0.32, 1.0, 0.32, 0xff2a2a, 0, 0.75, 0).box(0.34, 0.34, 0.34, 0xff2a2a, 0, 0, 0).build(),
    starG: new THREE.OctahedronGeometry(0.22, 0),
    starM: new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false }),
    flameG: new THREE.ConeGeometry(0.22, 1, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.5),
    flameM: new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, toneMapped: false }),
    markG: new THREE.ConeGeometry(0.42, 0.7, 3).rotateX(Math.PI),
    headG: new THREE.SphereGeometry(0.35, 8, 6),
    headM: new THREE.MeshBasicMaterial({ color: 0xfff7c0, toneMapped: false }),
    weakM: new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.6, toneMapped: false }),
    padM: new THREE.MeshBasicMaterial({ color: 0x7ff7ff, toneMapped: false }),
    alertM: new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false, vertexColors: true }),
  };
  /** @type {any[]} */
  const list = [];

  /**
   * @param {{id:string, name:string, model:string, color:number, spec:any, hp:number, isPlayer?:boolean, isBoss?:boolean, scale?:number, rtype?:string, markColor?:number}} o
   */
  function make(o) {
    const scale = o.scale || 1;
    const M = carModel(o.model, o.color);
    const geo = M.geo;
    const orig = /** @type {Float32Array} */ (geo.attributes.position.array).slice();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.25 });
    const body = new THREE.Mesh(geo, mat); body.castShadow = true; body.receiveShadow = true;
    const root = new THREE.Group(); root.add(body); root.scale.setScalar(scale);
    const fx = new THREE.Group(); // efectos (sin escalar con el auto)
    const R = o.spec.radius;
    const bubble = new THREE.Mesh(shared.bubbleG, shared.bubbleM); bubble.scale.set(R * 1.45, R * 1.0, R * 1.7); bubble.position.y = 0.9 * scale; bubble.visible = false;
    const ring = new THREE.Mesh(shared.ringG, shared.ringM); ring.scale.setScalar(R * 2.2); ring.position.y = 0.5; ring.visible = false;
    const ring2 = new THREE.Mesh(shared.ringG, shared.ringM); ring2.scale.setScalar(R * 3.2); ring2.position.y = 0.3; ring2.visible = false;
    const alert = new THREE.Mesh(shared.alertG, shared.alertM); alert.position.y = M.h * scale + 1.6; alert.visible = false;
    const stars = new THREE.Group(); for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(shared.starG, shared.starM); stars.add(st); } stars.position.y = M.h * scale + 0.6; stars.visible = false;
    const mark = new THREE.Mesh(shared.markG, new THREE.MeshBasicMaterial({ color: o.markColor ?? o.color, toneMapped: false })); mark.position.y = M.h * scale + 1.2;
    fx.add(bubble, ring, ring2, alert, stars, mark);
    // llamas de nitro (en el cuerpo, escalan con él)
    const flames = new THREE.Group();
    for (const sx of [-0.45, 0.45]) { const f = new THREE.Mesh(shared.flameG, shared.flameM); f.position.set(sx * M.wid / 2, 0.55, -M.len / 2 - 0.05); flames.add(f); }
    flames.visible = false; root.add(flames);
    // faros de telegrafía (embestida)
    const heads = new THREE.Group();
    for (const sx of [-0.6, 0.6]) { const h = new THREE.Mesh(shared.headG, shared.headM); h.position.set(sx * M.wid / 2, 0.9, M.len / 2 + 0.2); heads.add(h); }
    heads.visible = false; root.add(heads);
    // punto débil del blindado (tanque trasero)
    let weak = null;
    if (o.model === 'truck') { weak = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.1, 10).rotateZ(Math.PI / 2), shared.weakM); weak.position.set(0, 1.05, -2.85); root.add(weak); }
    // patas de levitación (volador)
    let pads = null;
    if (o.model === 'hover') {
      pads = new THREE.Group();
      for (const [x, z] of [[1.0, 1.1], [-1.0, 1.1], [1.0, -1.1], [-1.0, -1.1]]) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.34, 10).rotateX(Math.PI / 2), shared.padM); p.position.set(x, 0.4, z); pads.add(p); }
      root.add(pads);
    }
    // jefe / mini-omega: triturador y escudo
    let grinder = null, shield = null;
    if (o.model === 'monster') {
      grinder = new THREE.Mesh(grinderGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, metalness: 0.5, roughness: 0.4 }));
      grinder.position.set(0, 1.5, 3.0); root.add(grinder);
      if (o.isBoss) { shield = new THREE.Mesh(shieldGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, emissive: 0x1a6aa0, emissiveIntensity: 0.8, transparent: true, opacity: 0.9, side: THREE.DoubleSide })); shield.position.set(0, 2.0, 3.0); root.add(shield); }
    }
    scene.add(root, fx);
    const c = {
      id: o.id, name: o.name, isPlayer: !!o.isPlayer, isBoss: !!o.isBoss, rtype: o.rtype || '', model: o.model, color: o.color,
      spec: o.spec, mass: o.spec.mass, radius: R, maxHp: o.hp, hp: o.hp, scale, len: M.len * scale, h: M.h * scale,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, yawRate: 0, speed: 0, grounded: true, air: 0, spin: 0, onRamp: /** @type {any} */ (null), launchRamp: /** @type {any} */ (null),
      ctl: { throttle: 0, steer: 0, handbrake: false, nitro: false },
      nitro: 100, nitroOn: false, boostT: 0, shieldT: 0, magnetT: 0, stunT: 0, speedMul: 1, drift: false, hover: o.model === 'hover', manualY: false,
      wrecked: false, retired: false, points: 0, zone: { f: 0, b: 0, l: 0, r: 0 }, slot: '', slotT: 0, lastHitBy: /** @type {any} */ (null), lastHitT: 0,
      alert: false, vuln: false, invuln: 0, flashT: 0, smokeT: 0, fireT: 0, hitCd: 0, wreckT: 0, dentsDirty: false, ai: /** @type {any} */ (null),
      // render
      root, fx, body, mat, geo, orig, wheels: M.wheels, wheelSpin: 0, steerVis: 0, pitch: 0, roll: 0, bounce: 0, bounceV: 0,
      bubble, ring, ring2, alert3: alert, stars, mark, flames, heads, weak, pads, grinder, shield, modelLen: M.len, modelWid: M.wid,
    };
    list.push(c);
    return c;
  }

  /** Abolladuras reales: desplaza vértices según el daño de cada zona. @param {any} c */
  function applyDents(c) {
    const p = /** @type {Float32Array} */ (c.geo.attributes.position.array), o = c.orig, L = c.modelLen / 2, W = c.modelWid / 2;
    const z = c.zone;
    for (let i = 0; i < p.length; i += 3) {
      const x0 = o[i], y0 = o[i + 1], z0 = o[i + 2], h = hash(i), h2 = hash(i + 7);
      let x = x0, y = y0, zz = z0;
      const wf = Math.max(0, (z0 / L - 0.35) / 0.65), wb = Math.max(0, (-z0 / L - 0.35) / 0.65);
      const wr = Math.max(0, (-x0 / W - 0.3) / 0.7), wl = Math.max(0, (x0 / W - 0.3) / 0.7);
      zz -= wf * z.f * (0.35 + 0.45 * h) * L * 0.35; zz += wb * z.b * (0.35 + 0.45 * h) * L * 0.35;
      x += wr * z.r * (0.3 + 0.5 * h2) * W * 0.45; x -= wl * z.l * (0.3 + 0.5 * h2) * W * 0.45;
      const tot = (z.f * wf + z.b * wb + z.r * wr + z.l * wl);
      y -= tot * (h - 0.3) * 0.25 * (y0 > 0.8 ? 1 : 0.4);
      p[i] = x; p[i + 1] = y; p[i + 2] = zz;
    }
    c.geo.attributes.position.needsUpdate = true;
    c.geo.computeVertexNormals();
  }

  /**
   * Dibuja todos los autos (transformaciones, ruedas, sombras, efectos).
   * @param {number} t tiempo de juego @param {number} dt @param {(x:number,z:number)=>number} heightAt
   * @param {any} fxSys sistema de partículas @param {number} smokeEvery intervalo de humo según calidad
   */
  function render(t, dt, heightAt, fxSys, smokeEvery) {
    let wi = 0, bi = 0;
    for (const c of list) {
      if (!c.root.visible) continue;
      // inclinación por pendiente (en el piso) o por velocidad vertical (en el aire)
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw), hl = Math.max(1, c.len * 0.4);
      let pitchT = 0;
      if (c.grounded && !c.hover) pitchT = -Math.atan2(heightAt(c.x + s * hl, c.z + co * hl) - heightAt(c.x - s * hl, c.z - co * hl), hl * 2);
      else if (!c.grounded) pitchT = -Math.max(-0.6, Math.min(0.5, c.vy * 0.04));
      c.pitch += (pitchT - c.pitch) * Math.min(1, dt * (c.grounded ? 14 : 4));
      const lat = c.vx * co - c.vz * s;
      c.roll += ((c.grounded ? Math.max(-0.12, Math.min(0.12, lat * 0.012)) : 0) - c.roll) * Math.min(1, dt * 6);
      c.bounceV += (-c.bounce * 120 - c.bounceV * 10) * dt; c.bounce += c.bounceV * dt;
      const dmg = 1 - c.hp / c.maxHp;
      const wob = c.wrecked ? 0 : dmg > 0.6 ? Math.sin(t * 20 + c.x) * 0.012 * dmg : 0;
      c.root.position.set(c.x, c.y + c.bounce + (c.hover ? Math.sin(t * 3 + c.z) * 0.08 : 0), c.z);
      c.root.rotation.set(c.pitch + (c.wrecked ? 0.08 : 0), c.yaw, c.roll + wob + (c.wrecked ? 0.12 : 0), 'YXZ');
      c.root.updateMatrix(); c.root.updateMatrixWorld();
      c.fx.position.set(c.x, c.y, c.z);
      // abolladuras y color de daño
      if (c.dentsDirty) { c.dentsDirty = false; applyDents(c); }
      _c.setRGB(1, 1, 1).lerp(DAMAGED, c.wrecked ? 0.85 : dmg * 0.55);
      if (c.flashT > 0) { c.flashT -= dt; _c.setRGB(2.2, 2.2, 2.2); }
      c.mat.color.copy(_c);
      // ruedas
      c.wheelSpin += c.speed * dt / 0.45;
      c.steerVis += ((c.isPlayer || c.ai ? -c.ctl.steer * 0.45 : 0) - c.steerVis) * Math.min(1, dt * 10);
      for (const w of c.wheels) {
        if (wi >= MAX_WHEELS) break;
        const wobble = c.wrecked ? 0.3 : dmg > 0.5 ? Math.sin(t * 15 + w.z) * 0.1 * dmg : 0;
        _m.compose(_p.set(w.x, w.y, w.z), _q.setFromEuler(_e.set(c.wheelSpin, (w.steer ? c.steerVis : 0) + wobble, 0, 'YXZ')), _s.set(w.w, w.r, w.r));
        _m2.multiplyMatrices(c.root.matrixWorld, _m);
        wheelMesh.setMatrixAt(wi++, _m2);
      }
      // sombra
      if (bi < 12) {
        const gy = heightAt(c.x, c.z), hh = Math.max(0, c.y - gy), k = Math.max(0.35, 1 - hh * 0.12);
        _m.compose(_p.set(c.x, gy + 0.04, c.z), _q.setFromEuler(_e.set(0, c.yaw, 0)), _s.set(c.radius * 2.1 * k * (c.isBoss ? 1.1 : 1), 1, c.len * 1.15 * k));
        blobMesh.setMatrixAt(bi++, _m);
      }
      // efectos
      c.bubble.visible = c.shieldT > 0 && !c.wrecked;
      if (c.bubble.visible) c.bubble.rotation.y = t * 1.5;
      c.ring.visible = c.ring2.visible = c.magnetT > 0 && !c.wrecked;
      if (c.ring.visible) { const k = (t * 1.6) % 1; c.ring.scale.setScalar(c.radius * (1.4 + k * 4)); c.ring2.scale.setScalar(c.radius * (1.4 + ((k + 0.5) % 1) * 4)); }
      c.alert3.visible = c.alert && !c.wrecked && Math.sin(t * 18) > -0.3;
      c.alert3.rotation.y = t * 3;
      c.stars.visible = c.stunT > 0 && !c.wrecked;
      if (c.stars.visible) c.stars.children.forEach((st, i) => { const a = t * 4 + i * Math.PI / 2; st.position.set(Math.cos(a) * c.radius * 0.8, Math.sin(t * 6 + i) * 0.15, Math.sin(a) * c.radius * 0.8); });
      c.mark.visible = !c.wrecked && !c.retired && !c.isPlayer;
      c.mark.position.y = c.h + 1.2 + Math.sin(t * 3) * 0.12;
      c.flames.visible = c.nitroOn && !c.wrecked;
      if (c.flames.visible) c.flames.children.forEach(f => f.scale.set(1, 1, 0.7 + Math.random() * 0.8));
      c.heads.visible = c.alert && Math.sin(t * 22) > 0;
      if (c.weak) /** @type {THREE.MeshBasicMaterial} */ (c.weak.material).opacity = 0.35 + 0.35 * Math.abs(Math.sin(t * 4));
      if (c.pads) c.pads.visible = !c.wrecked && !c.vuln;
      if (c.grinder) c.grinder.rotation.x += dt * (c.grinderFast ? 22 : 6);
      // humo y fuego según el daño
      if (!c.retired) {
        c.smokeT -= dt;
        if (c.smokeT <= 0 && (dmg > 0.4 || c.wrecked)) {
          c.smokeT = smokeEvery * (c.wrecked ? 1.2 : dmg > 0.7 ? 0.8 : 1.6);
          const fx = c.x + s * c.len * 0.35, fz = c.z + co * c.len * 0.35;
          fxSys.smoke(fx, c.y + c.h * 0.7, fz, dmg > 0.7 || c.wrecked ? 0x3a3a3a : 0xb4b4b4, c.isBoss ? 1.0 : 0.45, 2.2);
          if ((dmg > 0.8 || c.wrecked) && !c.retired) fxSys.fire(fx, c.y + c.h * 0.6, fz);
        }
      }
    }
    wheelMesh.count = wi; wheelMesh.instanceMatrix.needsUpdate = true;
    blobMesh.count = bi; blobMesh.instanceMatrix.needsUpdate = true;
  }

  /** @param {any} c */
  function remove(c) {
    const i = list.indexOf(c); if (i >= 0) list.splice(i, 1);
    c.root.removeFromParent(); c.fx.removeFromParent();
    c.geo.dispose(); c.mat.dispose(); /** @type {any} */ (c.mark.material).dispose();
    c.root.traverse(/** @param {any} o */ o => { if (o === c.body) return; if (o.geometry && !Object.values(shared).includes(o.geometry)) o.geometry.dispose(); if (o.material && !Object.values(shared).includes(o.material)) o.material.dispose(); });
  }
  function clear() { while (list.length) remove(list[0]); }

  return { list, make, remove, clear, render, get wheelCount() { return wheelMesh.count; } };
}
