// @ts-check
/* Templo de los Ecos — nivel genérico: geometría estática fusionada, colisiones e interacciones
   (puertas selladas, placas de presión, bloques movibles, espejos giratorios, rayos de luz, plataformas
   temporizadas, braseros/checkpoints, códices, paredes secretas, reliquias, inscripciones, disparadores). */
import * as THREE from 'three';
import { GeoBuilder, PAL, makeDoor, makePlate, makeMirror, makeEmitter, makeReceptor, makeCodex, makeBrazier, makeRelic, doorFrameInto, glowMat } from './models.js';
import { col, colBox, free, rayBox2D, rayCircle, raySegment } from './physics.js';

export const BEAM_Y = 1.35;
const MAX_SEGS = 40;
const _v = new THREE.Vector3();
const _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

/** @typedef {import('./physics.js').Col} Col */
/** @typedef {{id:string, x:number, y:number, z:number, r?:number, label:()=>string, can?:()=>boolean, use:()=>void, key?:string}} Inter */

export class Level {
  /** @param {any} ctx @param {number} n @param {string} name */
  constructor(ctx, n, name) {
    this.ctx = ctx; this.n = n; this.name = name;
    this.group = new THREE.Group(); this.group.name = 'area' + n;
    /** @type {Col[]} */ this.cols = [];
    this.sb = new GeoBuilder(100 + n); this.gb = new GeoBuilder(200 + n);
    /** @type {Record<string, THREE.Matrix4[]>} */ this.inst = { statue0: [], statue1: [], column: [] };
    /** @type {Inter[]} */ this.inters = [];
    /** @type {Record<string, any>} */ this.doors = {};
    /** @type {Record<string, any>} */ this.plates = {};
    /** @type {Record<string, any>} */ this.blocks = {};
    /** @type {Record<string, any>} */ this.mirrors = {};
    /** @type {any[]} */ this.mirrorList = [];
    /** @type {any[]} */ this.emitters = [];
    /** @type {Record<string, any>} */ this.receptors = {};
    /** @type {any[]} */ this.platforms = [];
    /** @type {any[]} */ this.codices = [];
    /** @type {Record<string, any>} */ this.braziers = {};
    /** @type {Record<string, any>} */ this.walls = {};
    /** @type {any[]} */ this.triggers = [];
    /** @type {any[]} */ this.enemies = [];
    /** @type {((dt:number)=>void)[]} */ this.updaters = [];
    /** @type {((x:number,z:number,R:number)=>void)[]} */ this.pulseListeners = [];
    /** @type {any[]} */ this.beamTargets = [];
    /** @type {number[][]} */ this.lightSpots = [];
    /** @type {THREE.PointLight[]} */ this.lights = [];
    /** @type {THREE.Object3D[]} */ this.flickers = [];
    /** @type {Record<string, {x:number,y:number,z:number,ry:number}>} */ this.spawns = {};
    this.time = 0;
    this.segs = new Float32Array(MAX_SEGS * 4); this.segCount = 0;
    this.ends = new Float32Array(8 * 2); this.endCount = 0;
    this.pushT = 0;
    this.env = { bg: 0x1d1712, fog: 0x1d1712, sky: 0xffe2b0, ground: 0x40301f, hemi: 1.5, sun: 0xffd9a0, sunI: 1.6, sunDir: [6, 14, 8], dust: 0xffe0a8 };
    this.bounds = { x0: -40, x1: 40, z0: -40, z1: 40 };
  }
  get S() { return this.ctx.S(); }

  /* ======================= construcción ======================= */
  floor(x0, z0, x1, z1, y = 0, colors = [PAL.floorA, PAL.floorB], tile = 2) {
    this.cols.push(col(x0, y - 1.2, z0, x1, y, z1, 'floor'));
    for (let x = x0; x < x1 - 0.01; x += tile) for (let z = z0; z < z1 - 0.01; z += tile) {
      const w = Math.min(tile, x1 - x), d = Math.min(tile, z1 - z);
      const c = colors[(Math.round(x / tile) + Math.round(z / tile)) & 1];
      this.sb.box(x + w / 2, y - 0.2, z + d / 2, w - 0.07, 0.4, d - 0.07, c, 0.09, 0, false);
    }
    this.sb.box((x0 + x1) / 2, y - 0.75, (z0 + z1) / 2, x1 - x0, 0.7, z1 - z0, 0x3a2f25, 0.02, 0, false);
  }
  /** Muro de bloques (huella rectangular). El colisionador es alto para que nadie lo salte. */
  wall(x0, z0, x1, z1, h = 2.8, color = PAL.sand) {
    const wc = col(x0, -1, z0, x1, 10, z1, 'wall'); wc.vt = h + 0.2; this.cols.push(wc);
    const alongX = (x1 - x0) >= (z1 - z0), L = alongX ? x1 - x0 : z1 - z0, T = alongX ? z1 - z0 : x1 - x0;
    const rows = Math.max(1, Math.round(h / 0.7)), rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let s = (r & 1) ? -1 : 0;
      while (s < L - 0.01) {
        const a = Math.max(0, s), b = Math.min(L, s + 2), len = b - a;
        if (len > 0.05) {
          const mid = a + len / 2, y = r * rh + rh / 2;
          const c = (r === 0 && ((a * 7) | 0) % 3 === 0) ? PAL.moss : color;
          if (alongX) this.sb.box(x0 + mid, y, (z0 + z1) / 2, len - 0.06, rh - 0.06, T, c, 0.1, 0, false);
          else this.sb.box((x0 + x1) / 2, y, z0 + mid, T, rh - 0.06, len - 0.06, c, 0.1, 0, false);
        }
        s += 2;
      }
    }
    if (alongX) this.sb.box((x0 + x1) / 2, h + 0.1, (z0 + z1) / 2, L + 0.1, 0.2, T + 0.2, PAL.sandDark, 0.04, 0, false);
    else this.sb.box((x0 + x1) / 2, h + 0.1, (z0 + z1) / 2, T + 0.2, 0.2, L + 0.1, PAL.sandDark, 0.04, 0, false);
  }
  /** Caja sólida decorativa (pedestal, altar). */
  solid(cx, by, cz, w, h, d, color = PAL.stone) { this.cols.push(colBox(cx, by, cz, w, h, d, 'wall')); this.sb.box(cx, by + h / 2, cz, w, h, d, color); }
  statue(x, z, ry = 0, variant = 0) {
    _q.setFromEuler(_e.set(0, ry, 0));
    this.inst[variant % 2 ? 'statue1' : 'statue0'].push(new THREE.Matrix4().compose(_v.set(x, 0, z), _q, _s));
    this.cols.push(colBox(x, 0, z, 1.5, 3.8, 1.5, 'wall'));
  }
  column(x, z) {
    this.inst.column.push(new THREE.Matrix4().makeTranslation(x, 0, z));
    this.cols.push(colBox(x, 0, z, 1.15, 4.2, 1.15, 'wall'));
  }
  /** Antorcha de pared: soporte + llama + luz (según calidad). */
  torch(x, y, z, color = 0xffa23a) {
    this.sb.box(x, y - 0.3, z, 0.18, 0.5, 0.18, PAL.bronze, 0.05);
    this.sb.cyl(x, y, z, 0.2, 0.12, 0.2, 6, PAL.bronze);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 5), glowMat(color)); f.position.set(x, y + 0.3, z);
    this.group.add(f); this.flickers.push(f);
    this.lightSpots.push([x, y + 0.6, z, color, 9, 11]);
  }
  /** Rayo de sol decorativo (polvo en suspensión iluminado). */
  sunShaft(x, z, h = 7, w = 1.6) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.5), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.position.set(x, h / 2 - 0.1, z); m.rotation.z = 0.35; m.rotation.y = 0.5; m.renderOrder = 2;
    this.group.add(m);
  }

  /** @param {Inter} o */
  interact(o) { this.inters.push(o); return o; }
  trigger(x0, z0, x1, z1, onEnter, onExit = null, y0 = -5, y1 = 20) { const t = { x0, z0, x1, z1, y0, y1, onEnter, onExit, inside: false }; this.triggers.push(t); return t; }

  /* ---------- puertas selladas ---------- */
  door(id, x, z, alongX, o = {}) {
    const w = o.w ?? 3.6, h = o.h ?? 3.2, persist = o.persist !== false;
    const m = makeDoor(this.ctx.mats, w, h);
    m.group.position.set(x, 0, z); if (!alongX) m.group.rotation.y = Math.PI / 2;
    this.group.add(m.group);
    doorFrameInto(this.sb, x, z, w, h, alongX);
    const c = alongX ? colBox(x, -1, z, w, h + 7, 0.7, 'door') : colBox(x, -1, z, 0.7, h + 7, w, 'door');
    c.vt = h; this.cols.push(c);
    const d = { id, x, z, w, h, open: false, t: 0, col: c, slab: m.slab, sealMat: m.sealMat, persist, ready: false, group: m.group };
    if (persist && this.S.doors[id]) { d.open = true; d.t = 1; c.on = false; m.slab.visible = false; }
    this.doors[id] = d;
    return d;
  }
  openDoor(id, silent = false) {
    const d = this.doors[id]; if (!d || d.open) return;
    d.open = true;
    if (d.persist) { this.S.doors[id] = true; this.ctx.persist(); }
    if (!silent) { this.ctx.sfx.door(); this.ctx.fx.burst(d.x, 0.4, d.z, 0xcdb48a, 18, 3); this.ctx.fx.shake(0.25); }
  }
  closeDoor(id) {
    const d = this.doors[id]; if (!d || !d.open) return;
    d.open = false; d.col.on = true; d.slab.visible = true;
    if (d.persist) { delete this.S.doors[id]; this.ctx.persist(); }
    this.ctx.sfx.door();
  }

  /* ---------- placas de presión ---------- */
  plate(id, x, z, y = 0) {
    const m = makePlate(this.ctx.mats); m.group.position.set(x, y, z); this.group.add(m.group);
    const p = { id, x, y, z, down: false, t: 0, top: m.top, ringMat: m.ringMat, byPlayer: false, lockedOn: false };
    this.plates[id] = p;
    return p;
  }

  /* ---------- bloques movibles ---------- */
  block(id, x, z) {
    const saved = this.S.blocks[id];
    const bx = saved ? saved[0] : x, bz = saved ? saved[1] : z;
    const mesh = new THREE.Mesh(this.ctx.geos.block, this.ctx.mats.stone); mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.set(bx, 0, bz); this.group.add(mesh);
    const b = { id, x: bx, z: bz, hx: x, hz: z, mesh, moving: false, fx: 0, fz: 0, tx: 0, tz: 0, t: 0, col: /** @type {any} */ (null) };
    b.col = colBox(bx, 0, bz, 1.8, 1.8, 1.8, 'block', b);
    this.cols.push(b.col);
    this.blocks[id] = b;
    return b;
  }
  setBlock(b, x, z) {
    b.x = x; b.z = z; b.mesh.position.set(x, 0, z);
    b.col.x0 = x - 0.9; b.col.x1 = x + 0.9; b.col.z0 = z - 0.9; b.col.z1 = z + 0.9;
  }
  resetBlocks() {
    for (const id in this.blocks) {
      const b = this.blocks[id]; b.moving = false;
      this.setBlock(b, b.hx, b.hz); delete this.S.blocks[id];
      this.ctx.fx.burst(b.hx, 1, b.hz, 0x3fe8d6, 10, 2);
    }
    this.ctx.persist(); this.ctx.sfx.reset();
  }
  hasFloor(x, z) {
    for (const c of this.cols) if (c.on && c.tag === 'floor' && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && Math.abs(c.y1) < 0.1) return true;
    return false;
  }
  /** Empujar: el cuerpo choca contra un bloque y la entrada apunta en esa dirección. */
  tryPush(pb, ax, az, dt) {
    const c = pb.contact;
    if (!c || c.tag !== 'block' || !pb.grounded) { this.pushT = 0; return false; }
    const b = c.ref; if (b.moving) return true;
    let dx = 0, dz = 0;
    if (pb.contactAx === 'x' && Math.abs(ax) > 0.55 && Math.sign(ax) === pb.contactDir) dx = pb.contactDir * 2;
    else if (pb.contactAx === 'z' && Math.abs(az) > 0.55 && Math.sign(az) === pb.contactDir) dz = pb.contactDir * 2;
    if (!dx && !dz) { this.pushT = 0; return false; }
    this.pushT += dt;
    if (this.pushT < 0.28) return true;
    this.pushT = 0;
    const nx = b.x + dx, nz = b.z + dz;
    const ok = free(this.cols, nx - 0.85, 0.05, nz - 0.85, nx + 0.85, 1.75, nz + 0.85, b.col) && this.hasFloor(nx, nz);
    if (!ok) { this.ctx.sfx.bump(); return true; }
    b.moving = true; b.fx = b.x; b.fz = b.z; b.tx = nx; b.tz = nz; b.t = 0;
    this.ctx.sfx.push();
    this.ctx.emit('push');
    return true;
  }

  /* ---------- espejos giratorios + luz ---------- */
  mirror(id, x, z, idx0 = 0, o = {}) {
    const m = makeMirror(this.ctx.mats); m.group.position.set(x, 0, z); this.group.add(m.group);
    const persist = o.persist !== false;
    const idx = persist ? (this.S.mirrors[id] ?? idx0) : idx0;
    const mm = { id, x, z, idx, persist, ang: idx * Math.PI / 4, target: idx * Math.PI / 4, pivot: m.pivot, markMat: m.markMat, lit: false, turning: false, group: m.group, locked: false };
    m.pivot.rotation.y = mm.ang;
    this.cols.push(colBox(x, 0, z, 1.2, 2.3, 1.2, 'mirror', mm));
    this.mirrors[id] = mm; this.mirrorList.push(mm);
    this.interact({
      id: 'mirror:' + id, x, y: 1, z, r: 2.1, key: 'mirror',
      label: () => 'Girar espejo',
      can: () => !mm.locked && (o.can ? o.can() : true),
      use: () => this.rotateMirror(id),
    });
    return mm;
  }
  rotateMirror(id) {
    const m = this.mirrors[id]; if (!m) return;
    m.idx = (m.idx + 1) % 4; m.target += Math.PI / 4; m.turning = true;
    if (m.persist) { this.S.mirrors[id] = m.idx; this.ctx.persist(); }
    this.ctx.sfx.mirror(); this.ctx.emit('mirror');
  }
  /** @param {()=>boolean} [isOn] */
  emitter(id, x, z, ang, isOn = () => true) {
    const m = makeEmitter(this.ctx.mats); m.group.position.set(x, 0, z); m.group.rotation.y = ang; this.group.add(m.group);
    this.cols.push(colBox(x, 0, z, 1.3, 2.5, 1.3, 'emitter'));
    const e = { id, x, z, dx: Math.sin(ang), dz: Math.cos(ang), ox: x + Math.sin(ang) * 0.75, oz: z + Math.cos(ang) * 0.75, isOn, shutter: m.shutter, diskMat: m.diskMat, on: true };
    this.emitters.push(e);
    return e;
  }
  receptor(id, x, z, onLit) {
    const m = makeReceptor(this.ctx.mats); m.group.position.set(x, 0, z); this.group.add(m.group);
    this.cols.push(colBox(x, 0, z, 1.0, 1.4, 1.0, 'receptor'));
    const r = { id, x, z, r: 0.55, charge: 0, lit: false, crystal: m.crystal, mat: m.mat, hitNow: false, active: () => true, hit: (dt) => { r.charge += dt; } };
    this.beamTargets.push(r);
    this.updaters.push(dt => {
      if (!r.hitNow) r.charge = Math.max(0, r.charge - dt * 2);
      r.mat.emissiveIntensity = r.lit ? 2.2 : 0.25 + r.charge * 3;
      r.crystal.rotation.y += dt * (r.lit ? 2 : 0.5 + r.charge * 6);
      if (!r.lit && r.charge > 0.5) { r.lit = true; this.ctx.sfx.solve(); this.ctx.fx.burst(x, 1.7, z, 0x9fe9ff, 26, 4); onLit && onLit(); }
    });
    this.receptors[id] = r;
    return r;
  }
  traceBeams() {
    this.segCount = 0; this.endCount = 0;
    for (const m of this.mirrorList) m.lit = false;
    for (const t of this.beamTargets) t.hitNow = false;
    const cols = this.cols;
    for (const e of this.emitters) {
      const on = e.isOn(); e.on = on;
      if (!on) continue;
      let ox = e.ox, oz = e.oz, dx = e.dx, dz = e.dz; let last = null;
      for (let bounce = 0; bounce < 10 && this.segCount < MAX_SEGS; bounce++) {
        let best = 70, kind = 0, obj = null;
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          if (c.tag === 'floor' || c.tag === 'mirror' || c.tag === 'receptor' || c.tag === 'plat') continue;
          const t = rayBox2D(ox, oz, dx, dz, BEAM_Y, c); if (t < best) { best = t; kind = 1; obj = null; }
        }
        for (const m of this.mirrorList) {
          if (m === last) continue;
          const a = m.pivot.rotation.y, tx = Math.cos(a) * 0.68, tz = -Math.sin(a) * 0.68;
          const t = raySegment(ox, oz, dx, dz, m.x - tx, m.z - tz, m.x + tx, m.z + tz);
          if (t < best) { best = t; kind = 2; obj = m; }
        }
        for (const tg of this.beamTargets) {
          if (!tg.active()) continue;
          const t = rayCircle(ox, oz, dx, dz, tg.x, tg.z, tg.r); if (t < best) { best = t; kind = 3; obj = tg; }
        }
        const hx = ox + dx * best, hz = oz + dz * best, k = this.segCount * 4;
        this.segs[k] = ox; this.segs[k + 1] = oz; this.segs[k + 2] = hx; this.segs[k + 3] = hz; this.segCount++;
        if (kind === 2) {
          const a = obj.pivot.rotation.y, nx = Math.sin(a), nz = Math.cos(a), dot = dx * nx + dz * nz;
          obj.lit = true;
          if (Math.abs(dot) < 0.08) break;
          dx -= 2 * dot * nx; dz -= 2 * dot * nz; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
          ox = hx; oz = hz; last = obj; continue;
        }
        if (kind === 3) { obj.hitNow = true; obj.src = e.id; }
        if (this.endCount < 8) { this.ends[this.endCount * 2] = hx; this.ends[this.endCount * 2 + 1] = hz; this.endCount++; }
        break;
      }
    }
  }

  /* ---------- plataformas ---------- */
  timedPlatform(x, y, z, w, d, o = {}) {
    const b = new GeoBuilder(300 + this.platforms.length);
    b.box(0, -0.25, 0, w, 0.5, d, 0xc4a678, 0.05); b.box(0, -0.62, 0, w * 0.7, 0.3, d * 0.7, PAL.stoneDark, 0.05);
    b.box(0, 0.01, 0, w * 0.5, 0.02, 0.12, 0x3fe8d6, 0, 0, false); b.box(0, 0.01, 0, 0.12, 0.02, d * 0.5, 0x3fe8d6, 0, 0, false);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, transparent: true, opacity: 1, emissive: 0x000000 });
    const mesh = new THREE.Mesh(b.build(), mat); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; this.group.add(mesh);
    const c = colBox(x, y - 0.5, z, w, 0.5, d, 'plat');
    this.cols.push(c);
    const p = { kind: 'timed', x, y, z, col: c, mesh, mat, period: o.period ?? 3.4, on: o.on ?? 0.62, offset: o.offset ?? 0, solid: true, warn: false };
    this.platforms.push(p);
    return p;
  }
  movingPlatform(x, y, z, w, d, o = {}) {
    const b = new GeoBuilder(400 + this.platforms.length);
    b.box(0, -0.25, 0, w, 0.5, d, 0xb8b0a0, 0.05); b.box(0, -0.6, 0, w * 0.6, 0.3, d * 0.6, PAL.bronze, 0.05);
    const mesh = new THREE.Mesh(b.build(), this.ctx.mats.stone); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; this.group.add(mesh);
    const c = colBox(x, y - 0.5, z, w, 0.5, d, 'plat');
    this.cols.push(c);
    const p = { kind: 'move', x, y, z, w, d, col: c, mesh, ax: o.ax ?? 0, az: o.az ?? 1, amp: o.amp ?? 3, speed: o.speed ?? 0.8, phase: o.phase ?? 0, cx: x, cz: z };
    this.platforms.push(p);
    return p;
  }

  /* ---------- coleccionables, braseros, paredes secretas, reliquias ---------- */
  codex(id, x, y, z) {
    if (this.S.codices.includes(id)) return;
    const m = makeCodex(this.ctx.mats); m.group.position.set(x, y, z); this.group.add(m.group);
    this.codices.push({ id, x, y, z, group: m.group, taken: false });
  }
  brazier(id, x, z, sx, sz, ry = 0) {
    const m = makeBrazier(this.ctx.mats); m.group.position.set(x, 0, z); this.group.add(m.group);
    this.cols.push(colBox(x, 0, z, 0.8, 1.3, 0.8, 'wall'));
    const b = { id, x, z, flame: m.flame, ember: m.ember, lit: !!this.S.braziers[id] };
    m.flame.visible = b.lit;
    this.braziers[id] = b; this.flickers.push(m.flame);
    this.spawns[id] = { x: sx, y: 0, z: sz, ry };
    this.lightSpots.push([x, 2, z, 0xffa040, 7, 9]);
  }
  secretWall(id, x0, z0, x1, z1, room) {
    const c = col(x0, -1, z0, x1, 10, z1, 'secret'); c.vt = 2.8; this.cols.push(c);
    const b = new GeoBuilder(500 + Object.keys(this.walls).length);
    const alongX = (x1 - x0) >= (z1 - z0), L = alongX ? x1 - x0 : z1 - z0, T = alongX ? z1 - z0 : x1 - x0;
    for (let r = 0; r < 4; r++) for (let s = 0; s < L; s += 1) {
      const y = r * 0.7 + 0.35, m = s + 0.5 + ((r & 1) ? 0.25 : 0);
      if (m > L) continue;
      if (alongX) b.box(x0 + m, y, (z0 + z1) / 2, 0.92, 0.64, T, 0xb59a74, 0.14, 0, false); else b.box((x0 + x1) / 2, y, z0 + m, T, 0.64, 0.92, 0xb59a74, 0.14, 0, false);
    }
    const mesh = new THREE.Mesh(b.build(), this.ctx.mats.stone); this.group.add(mesh);
    const crack = new THREE.Mesh(new THREE.BoxGeometry(alongX ? L * 0.6 : T + 0.06, 0.08, alongX ? T + 0.06 : L * 0.6), glowMat(0x2aa89c));
    crack.position.set((x0 + x1) / 2, 1.4, (z0 + z1) / 2); crack.rotation[alongX ? 'z' : 'x'] = 0.5; this.group.add(crack);
    const crack2 = crack.clone(); crack2.position.y = 0.8; crack2.rotation[alongX ? 'z' : 'x'] = -0.4; this.group.add(crack2);
    const w = { id, x: (x0 + x1) / 2, z: (z0 + z1) / 2, x0, z0, x1, z1, col: c, mesh, cracks: [crack, crack2], broken: !!this.S.walls[id], t: 0 };
    if (w.broken) { c.on = false; mesh.visible = false; crack.visible = crack2.visible = false; }
    this.walls[id] = w;
    this.trigger(room[0], room[1], room[2], room[3], () => { if (w.broken) this.ctx.discoverSecret(id); });
    return w;
  }
  relic(kind, x, z, label, y = 0) {
    this.solid(x, y, z, 1.3, 1.1, 1.3, PAL.stone);
    this.sb.box(x, y + 1.18, z, 1.0, 0.16, 1.0, PAL.bronze);
    if (this.S.relics[kind]) return;
    const g = makeRelic(kind); g.position.set(x, y + 1.9, z); this.group.add(g);
    const it = this.interact({
      id: 'relic:' + kind, x, y: y + 1.2, z, r: 2.2, key: 'relic',
      label: () => label,
      can: () => !this.S.relics[kind],
      use: () => { g.visible = false; this.ctx.takeRelic(kind, x, z); },
    });
    this.updaters.push(dt => { if (g.visible) { g.rotation.y += dt * 1.5; g.position.y = y + 1.9 + Math.sin(this.time * 2) * 0.12; } });
    return it;
  }
  tablet(x, z, ry, title, text, onRead) {
    const b = this.sb;
    this.cols.push(colBox(x, 0, z, 1.2, 1.3, 1.2, 'wall'));
    b.add(new THREE.BoxGeometry(1.1, 1.2, 0.3), PAL.stone, [x, 0.6, z], [0.0, ry, 0]);
    b.add(new THREE.BoxGeometry(0.8, 0.06, 0.04), 0x3fe8d6, [x + Math.sin(ry) * 0.17, 0.9, z + Math.cos(ry) * 0.17], [0, ry, 0], [1, 1, 1], 0, false);
    b.add(new THREE.BoxGeometry(0.6, 0.06, 0.04), 0x3fe8d6, [x + Math.sin(ry) * 0.17, 0.7, z + Math.cos(ry) * 0.17], [0, ry, 0], [1, 1, 1], 0, false);
    return this.interact({ id: 'tablet:' + title, x, y: 1, z, r: 2.0, key: 'tablet', label: () => 'Leer inscripción', use: () => { this.ctx.showText(title, text); onRead && onRead(); } });
  }

  /* ======================= cierre ======================= */
  finalize() {
    const mats = this.ctx.mats, geos = this.ctx.geos;
    const stat = new THREE.Mesh(this.sb.build(), mats.stone); stat.receiveShadow = true; stat.castShadow = true; stat.name = 'static';
    this.group.add(stat);
    if (!this.gb.empty) this.group.add(new THREE.Mesh(this.gb.build(), mats.glowV));
    for (const k of /** @type {const} */ (['statue0', 'statue1', 'column'])) {
      const list = this.inst[k]; if (!list.length) continue;
      const im = new THREE.InstancedMesh(geos[k], mats.stone, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = im.receiveShadow = true; im.computeBoundingSphere();
      this.group.add(im);
    }
    const abyss = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x050405 }));
    abyss.rotation.x = -Math.PI / 2; abyss.position.y = -14; this.group.add(abyss);
    // luces puntuales: se crean hasta 6; la calidad decide cuántas se ven
    this.lightSpots.slice(0, 6).forEach(s => {
      const l = new THREE.PointLight(s[3], s[4], s[5], 1.6); l.position.set(s[0], s[1], s[2]); l.visible = false;
      this.group.add(l); this.lights.push(l);
    });
    this.ctx.scene.add(this.group);
  }
  /** @param {number} cap */
  applyLights(cap) { this.lights.forEach((l, i) => { l.visible = i < cap; }); }

  pulse(x, z, R) {
    for (const id in this.walls) {
      const w = this.walls[id]; if (w.broken) continue;
      const cx = Math.max(w.x0, Math.min(x, w.x1)), cz = Math.max(w.z0, Math.min(z, w.z1));
      if (Math.hypot(cx - x, cz - z) < R) {
        w.broken = true; w.col.on = false; w.t = 0;
        this.S.walls[id] = true; this.ctx.persist();
        this.ctx.sfx.crumble(); this.ctx.fx.burst(w.x, 1.2, w.z, 0xb59a74, 34, 5); this.ctx.fx.shake(0.4);
        this.ctx.toast('La pared agrietada se derrumbó');
      }
    }
    for (const e of this.enemies) e.onPulse && e.onPulse(x, z, R);
    for (const f of this.pulseListeners) f(x, z, R);
  }

  /* ======================= actualización ======================= */
  /** @param {number} dt @param {any} P jugador */
  update(dt, P) {
    this.time += dt;
    const t = this.time, S = this.S, ctx = this.ctx, px = P.body.pos.x, py = P.body.pos.y, pz = P.body.pos.z;
    // puertas
    for (const id in this.doors) {
      const d = this.doors[id];
      const goal = d.open ? 1 : 0;
      if (d.t !== goal) {
        d.t = goal > d.t ? Math.min(1, d.t + dt / 1.3) : Math.max(0, d.t - dt / 0.6);
        if (d.open && d.t > 0.55) d.col.on = false;
        d.slab.visible = d.t < 1;
      }
      d.slab.position.y = -d.t * (d.h + 0.2);
      d.sealMat.color.setHex(d.ready ? 0x3fe8d6 : 0xff8a3d);
    }
    // placas
    for (const id in this.plates) {
      const p = this.plates[id];
      let down = P.alive && P.body.grounded && Math.abs(px - p.x) < 0.95 && Math.abs(pz - p.z) < 0.95 && Math.abs(py - p.y) < 0.7;
      p.byPlayer = down;
      if (!down) for (const bid in this.blocks) { const b = this.blocks[bid]; if (!b.moving && Math.abs(b.x - p.x) < 0.5 && Math.abs(b.z - p.z) < 0.5) { down = true; break; } }
      if (p.lockedOn) down = true;
      if (down !== p.down) { p.down = down; ctx.sfx.plate(down); if (down) ctx.emit('plate'); }
      p.t += ((down ? 1 : 0) - p.t) * Math.min(1, dt * 12);
      p.top.position.y = 0.13 - p.t * 0.09;
      p.ringMat.color.setHex(down ? 0x3fe8d6 : 0x6a5a40);
    }
    // bloques
    for (const id in this.blocks) {
      const b = this.blocks[id]; if (!b.moving) continue;
      b.t = Math.min(1, b.t + dt / 0.35);
      const e = b.t * b.t * (3 - 2 * b.t);
      this.setBlock(b, b.fx + (b.tx - b.fx) * e, b.fz + (b.tz - b.fz) * e);
      if (b.t >= 1) { b.moving = false; this.setBlock(b, b.tx, b.tz); S.blocks[id] = [b.tx, b.tz]; ctx.persist(); ctx.fx.burst(b.tx, 0.2, b.tz, 0xcdb48a, 8, 1.5); }
    }
    // espejos
    for (const m of this.mirrorList) {
      if (m.ang !== m.target) {
        const step = dt * 3.2;
        m.ang = Math.abs(m.target - m.ang) <= step ? m.target : m.ang + Math.sign(m.target - m.ang) * step;
        m.pivot.rotation.y = m.ang; m.turning = m.ang !== m.target;
      }
      m.markMat.color.setHex(m.lit ? 0xffe08a : 0x3fe8d6);
    }
    // plataformas
    const mul = ctx.diff().platformMul, reduced = ctx.reduced();
    for (const p of this.platforms) {
      if (p.kind === 'timed') {
        const onT = Math.min(p.period - 0.6, p.period * p.on * mul), ph = (t + p.offset) % p.period;
        const solid = ph < onT, warn = solid && ph > onT - 0.75;
        p.solid = solid; p.warn = warn; p.col.on = solid;
        p.mat.opacity = solid ? (warn && !reduced ? 0.55 + 0.45 * Math.abs(Math.sin(t * 18)) : 1) : 0.14;
        p.mat.emissive.setHex(warn ? 0x8a3a00 : solid ? 0x000000 : 0x0a3a38);
        p.mat.depthWrite = solid;
      } else {
        const s = Math.sin(t * p.speed + p.phase) * p.amp;
        const nx = p.x + p.ax * s, nz = p.z + p.az * s;
        p.col.dx = nx - p.cx; p.col.dz = nz - p.cz; p.cx = nx; p.cz = nz;
        p.col.x0 = nx - p.w / 2; p.col.x1 = nx + p.w / 2; p.col.z0 = nz - p.d / 2; p.col.z1 = nz + p.d / 2;
        p.mesh.position.set(nx, p.y, nz);
      }
    }
    // códices
    for (const c of this.codices) {
      if (c.taken) continue;
      c.group.rotation.y += dt * 1.6; c.group.position.y = c.y + Math.sin(t * 2.4 + c.x) * 0.12;
      if (P.alive && Math.hypot(px - c.x, pz - c.z) < 1.15 && Math.abs(py + 0.9 - c.y) < 1.4) {
        c.taken = true; c.group.visible = false; ctx.collectCodex(c.id, c.x, c.y, c.z);
      }
    }
    // braseros (checkpoints)
    for (const id in this.braziers) {
      const b = this.braziers[id];
      if (P.alive && S.cp !== id && Math.hypot(px - b.x, pz - b.z) < 2.6 && Math.abs(py) < 1.5) {
        b.lit = true; b.flame.visible = true; S.cp = id; S.area = this.n; S.braziers[id] = true; ctx.persist(); ctx.onCheckpoint(id, b.x, b.z);
      }
    }
    for (let i = 0; i < this.flickers.length; i++) {
      const f = this.flickers[i]; if (!f.visible) continue;
      const k = reduced ? 1 : 0.85 + 0.2 * Math.sin(t * 13 + i * 2.1) * Math.sin(t * 7.3 + i);
      f.scale.set(1, k, 1);
    }
    // paredes secretas
    for (const id in this.walls) {
      const w = this.walls[id];
      if (w.broken && w.mesh.visible) {
        w.t += dt; w.mesh.position.y = -w.t * w.t * 6; w.cracks[0].visible = w.cracks[1].visible = false;
        if (w.t > 0.8) w.mesh.visible = false;
      } else if (!w.broken) {
        const s = 0.85 + 0.25 * Math.sin(t * 2.2);
        w.cracks[0].scale.setScalar(s); w.cracks[1].scale.setScalar(s);
      }
    }
    // disparadores
    for (const tr of this.triggers) {
      const inside = P.alive && px > tr.x0 && px < tr.x1 && pz > tr.z0 && pz < tr.z1 && py > tr.y0 && py < tr.y1;
      if (inside !== tr.inside) { tr.inside = inside; if (inside) tr.onEnter && tr.onEnter(); else tr.onExit && tr.onExit(); }
    }
    for (const f of this.updaters) f(dt);
    for (const e of this.enemies) e.update(dt, P);
    this.traceBeams();
    for (const tg of this.beamTargets) if (tg.hitNow) tg.hit(dt);
  }

  dispose() {
    this.ctx.scene.remove(this.group);
    this.group.traverse(/** @param {any} o */ o => {
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (!m.userData.shared) m.dispose();
    });
  }
}
