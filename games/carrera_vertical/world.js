// @ts-check
/* Carrera Vertical — construye un circuito a partir de su definición (courses.js): geometría estática fusionada
   (fachadas texturizadas, techos, utilería, neón), colisionadores, cielo/horizonte y los elementos interactivos:
   paneles de impulso, tirolinas, plataformas elevadoras, puertas automáticas, relojes, puntos de control, rutas alternativas. */
import { THREE, rng } from '../../matelabs/kit3d.js';
import { col, createGrid, groundBelow, ov } from './physics.js';
import { geoBuilder, padGeo, padBaseGeo, clockGeo, graffitiTexture } from './models.js';
import { THEMES } from './courses.js';
import { makeDrone, makeBarrier, makeTurret } from './entities.js';
import { PHYS } from './config.js';

const _c = new THREE.Color();
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const shade = (hex, k) => { _c.set(hex); _c.multiplyScalar(k); return _c.getHex(); };
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

/** Recursos compartidos entre circuitos (se crean una vez). */
let shared = /** @type {any} */ (null);
function sharedRes() {
  if (shared) return shared;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const checker = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
    const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
  })();
  shared = {
    box, sphere,
    pad: padGeo(false), launch: padGeo(true), padBase: padBaseGeo(), clock: clockGeo(),
    graffiti: new THREE.MeshBasicMaterial({ map: graffitiTexture('#ff7a2f'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    checker: new THREE.MeshBasicMaterial({ map: checker, side: THREE.DoubleSide }),
    cpOff: new THREE.MeshBasicMaterial({ color: 0xdfe6ee, toneMapped: false, side: THREE.DoubleSide }),
    cpOn: new THREE.MeshBasicMaterial({ color: 0xff7a2f, toneMapped: false, side: THREE.DoubleSide }),
    lampOff: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    lampOn: new THREE.MeshBasicMaterial({ color: 0xff7a2f, toneMapped: false }),
    green: new THREE.MeshBasicMaterial({ color: 0x3dff8a, toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: 0xff3348, toneMapped: false }),
    amber: new THREE.MeshBasicMaterial({ color: 0xffb02e, toneMapped: false }),
    door: new THREE.MeshStandardMaterial({ color: 0xcfd9e2, roughness: 0.35, metalness: 0.55 }),
    doorStripe: new THREE.MeshBasicMaterial({ color: 0x46f0ff, toneMapped: false }),
    lift: new THREE.MeshStandardMaterial({ color: 0x3b4452, roughness: 0.6, metalness: 0.4 }),
    handle: new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.4, metalness: 0.5 }),
    sign: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8 }),
  };
  for (const k in shared) { const v = shared[k]; if (v && (v.isMaterial || v.isBufferGeometry)) v.userData.shared = true; }
  return shared;
}

/** Sesión: estados que persisten mientras la página está abierta (atajos abiertos, tirolinas descubiertas, usos). */
export const SESSION = { doorsUnlocked: /** @type {Record<string, boolean>} */ ({}), zipsFound: /** @type {Record<string, boolean>} */ ({}), uses: /** @type {Record<string, number>} */ ({}) };
const use = k => { SESSION.uses[k] = (SESSION.uses[k] || 0) + 1; };

/**
 * @param {any} def definición del circuito
 * @param {any} ctx contexto del juego
 */
export function buildCourse(def, ctx) {
  const R = sharedRes();
  const theme = /** @type {any} */ (THEMES)[def.theme];
  const mats = ctx.mats;
  const group = new THREE.Group(); group.name = 'course:' + def.id;
  const facade = geoBuilder(true), roof = geoBuilder(), prop = geoBuilder(), neonB = geoBuilder();
  /** @type {import('./physics.js').Col[]} */ const cols = [];
  const deep = theme.groundY - 45;
  const W = /** @type {any} */ ({
    def, theme, group, cols, grid: null, killY: 0, start: { x: 0, y: 0, z: 0, yaw: Math.PI }, cps: [], goal: null,
    pads: [], zips: [], lifts: [], doors: [], clocks: [], alts: [], drones: [], barriers: [], turrets: [], phaseCps: [],
    roofs: [], zMin: 0, zMax: 0, time: 0, dyn: [],
  });
  let minRoof = Infinity;
  const addCol = (c) => { cols.push(c); return c; };
  const R0 = rng(def.id.length * 977 + 13);
  const dynMesh = (geo, mat, parent = group) => { const m = new THREE.Mesh(geo, mat); parent.add(m); return m; };
  const deferred = /** @type {(()=>void)[]} */ ([]);

  /* ---------- piezas estáticas ---------- */
  function roofTop(x0, z0, x1, z1, h, rc) {
    // losetas de 4 m con un leve damero (lectura de velocidad y profundidad)
    const T = 4, nx = Math.max(1, Math.round((x1 - x0) / T)), nz = Math.max(1, Math.round((z1 - z0) / T));
    const rc2 = shade(rc, 0.93);
    if (nx * nz > 400) roof.quad(x0, h, z1, x1, h, z1, x1, h, z0, x0, h, z0, 0, 1, 0, rc);
    else for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a0 = x0 + (x1 - x0) * i / nx, a1 = x0 + (x1 - x0) * (i + 1) / nx, b0 = z0 + (z1 - z0) * j / nz, b1 = z0 + (z1 - z0) * (j + 1) / nz;
      roof.quad(a0, h, b1, a1, h, b1, a1, h, b0, a0, h, b0, 0, 1, 0, (i + j) % 2 ? rc2 : rc);
    }
    const t = 0.32, y = h + 0.012;
    const tc = theme.trim;
    prop.quad(x0, y, z1, x1, y, z1, x1, y, z1 - t, x0, y, z1 - t, 0, 1, 0, tc);
    prop.quad(x0, y, z0 + t, x1, y, z0 + t, x1, y, z0, x0, y, z0, 0, 1, 0, tc);
    prop.quad(x0, y, z1 - t, x0 + t, y, z1 - t, x0 + t, y, z0 + t, x0, y, z0 + t, 0, 1, 0, tc);
    prop.quad(x1 - t, y, z1 - t, x1, y, z1 - t, x1, y, z0 + t, x1 - t, y, z0 + t, 0, 1, 0, tc);
  }
  function building(x0, z0, x1, z1, h, tint, o = {}) {
    facade.box(x0, o.bottom ?? deep, z0, x1, h - 0.55, z1, tint, 51);
    prop.box(x0 - 0.14, h - 0.55, z0 - 0.14, x1 + 0.14, h, z1 + 0.14, shade(tint, 0.62), 59);
    const rc = o.roof ?? shade(theme.roof, 0.9 + hash(x0, z0) * 0.25);
    roofTop(x0 - 0.14, z0 - 0.14, x1 + 0.14, z1 + 0.14, h, rc);
    // pequeños respiraderos en las esquinas (decorado bajo, no estorban)
    if (!o.bare && (x1 - x0) > 6 && (z1 - z0) > 6) {
      prop.box(x0 + 0.6, h, z1 - 1.4, x0 + 1.2, h + 0.3, z1 - 0.8, 0x6b7280);
      prop.box(x1 - 1.3, h, z0 + 0.7, x1 - 0.7, h + 0.28, z0 + 1.3, 0x6b7280);
    }
    W.roofs.push({ x0, z0, x1, z1, h });
  }
  const B = {
    start(x, y, z, yaw = Math.PI) {
      W.start = { x, y, z, yaw };
      // línea de largada y arco
      neonB.box(x - 4, y + 0.015, z - 0.25, x + 4, y + 0.03, z + 0.25, 0xffffff);
      gateStatic(x, y, z - 5, 7.5, shade(theme.trim, 0.5), 5.6);
    },
    bld(x, zN, zF, w, h, o = {}) {
      const tint = o.tint ?? (o.warehouse ? 0x8a96a0 : theme.facades[Math.floor(hash(x, zN) * theme.facades.length)]);
      const x0 = x - w / 2, x1 = x + w / 2, z0 = Math.min(zN, zF), z1 = Math.max(zN, zF);
      building(x0, z0, x1, z1, h, tint, o);
      if (o.warehouse) { // techo a dos aguas bajo (sólo decorado en los bordes)
        for (let zz = z0 + 2; zz < z1 - 1; zz += 4) prop.box(x0 + 0.4, h, zz, x1 - 0.4, h + 0.08, zz + 0.25, 0x5f6b75);
      }
      addCol(col(x0, deep, z0, x1, h, z1, 'roof'));
      minRoof = Math.min(minRoof, h);
    },
    box(x, y, z, w, h, d, color, o = {}) {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      if (o.pent) building(x0, z0, x1, z1, y + h, color, { bare: true, bottom: y - 0.01, roof: shade(theme.roof, 1.05) });
      else prop.box(x0, y, z0, x1, y + h, z1, color);
      addCol(col(x0, y, z0, x1, y + h, z1, o.tag || 'box'));
    },
    ac(x, y, z, ry = 0) {
      const sw = Math.abs(Math.sin(ry)) > 0.5, w = sw ? 1.2 : 1.6, d = sw ? 1.6 : 1.2;
      prop.box(x - w / 2, y, z - d / 2, x + w / 2, y + 1.0, z + d / 2, 0xb8c0c8);
      prop.box(x - w / 2 - 0.02, y + 0.1, z - d / 2 - 0.02, x + w / 2 + 0.02, y + 0.18, z + d / 2 + 0.02, 0x8a939c);
      prop.disc(x, y + 1.01, z, 0.42, 10, 0x2a2f36);
      prop.box(x - 0.05, y + 1.0, z - 0.4, x + 0.05, y + 1.04, z + 0.4, 0x9aa3ad);
      addCol(col(x - w / 2, y, z - d / 2, x + w / 2, y + 1.0, z + d / 2, 'box'));
    },
    duct(x, y, z, w, h, d) {
      prop.box(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, 0xa9b2bb);
      for (let xx = x - w / 2 + 1; xx < x + w / 2; xx += 2) prop.box(xx, y - 0.02, z - d / 2 - 0.03, xx + 0.12, y + h + 0.03, z + d / 2 + 0.03, 0x7c858f);
      neonB.box(x - w / 2, y + h + 0.005, z - 0.06, x + w / 2, y + h + 0.02, z + 0.06, 0xffd23a);
      addCol(col(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, 'box'));
    },
    tank(x, y, z) { tank(x, y, z, true); },
    wall(x, y, z, w, h, d, o = {}) {
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      prop.box(x0, y, z0, x1, y + h, z1, 0x2a2f36);
      const face = o.arrows || -1, fx = face < 0 ? x0 - 0.02 : x1 + 0.02;
      const col1 = theme.neon[0], col2 = theme.neon[1 % theme.neon.length];
      // panel publicitario con borde de neón y flechas que indican «corré por acá»
      prop.box(face < 0 ? x0 - 0.04 : x1, y + 0.6, z0 + 0.3, face < 0 ? x0 : x1 + 0.04, y + h - 0.4, z1 - 0.3, shade(col2, 0.35));
      neonB.box(face < 0 ? fx - 0.04 : fx, y + 0.5, z0 + 0.2, face < 0 ? fx : fx + 0.04, y + 0.62, z1 - 0.2, col1);
      neonB.box(face < 0 ? fx - 0.04 : fx, y + h - 0.45, z0 + 0.2, face < 0 ? fx : fx + 0.04, y + h - 0.33, z1 - 0.2, col1);
      for (let zz = z1 - 1.5; zz > z0 + 1; zz -= 2.4) {
        const yy = y + h * 0.5 + 0.3, a = face < 0 ? fx - 0.05 : fx + 0.05;
        // chevrón apuntando a -z
        neonB.beam(a, yy + 0.55, zz, a, yy, zz - 0.7, 0.14, 0xffffff);
        neonB.beam(a, yy - 0.55, zz, a, yy, zz - 0.7, 0.14, 0xffffff);
      }
      addCol(col(x0, y, z0, x1, y + h, z1, 'wall'));
    },
    pad(x, y, z, yaw, kind = 'dash') {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; group.add(g);
      dynMesh(R.padBase, mats.prop, g);
      const top = dynMesh(kind === 'launch' ? R.launch : R.pad, kind === 'launch' ? mats.launchOn : mats.padOn, g);
      W.pads.push({ id: 'p' + W.pads.length, x, y, z, yaw, kind, dx: Math.sin(yaw), dz: Math.cos(yaw), cd: 0, top, uses: 0 });
    },
    zip(id, ax, ay, az, bx, by, bz) {
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      const handle = new THREE.Group(); group.add(handle);
      const hb = geoBuilder(); hb.box(-0.12, -0.05, -0.2, 0.12, 0.18, 0.2, 0xffd23a); hb.box(-0.03, -0.62, -0.03, 0.03, -0.05, 0.03, 0x2a2f36); hb.box(-0.4, -0.7, -0.04, 0.4, -0.6, 0.04, 0x2a2f36);
      handle.add(new THREE.Mesh(hb.build(), mats.prop));
      const lamp = dynMesh(R.box, SESSION.zipsFound[def.id + ':' + id] ? R.lampOn : R.lampOff);
      lamp.scale.set(0.35, 0.35, 0.35); lamp.position.set(ax + 0.9, ay + 0.75, az);
      const z = { id, a: { x: ax, y: ay, z: az }, b: { x: bx, y: by, z: bz }, len, dx: (bx - ax) / len, dy: (by - ay) / len, dz: (bz - az) / len, handle, lamp, t: 0, back: 0, busy: false, uses: 0 };
      W.zips.push(z);
      // cable y postes (los postes se apoyan en lo que haya debajo: se resuelve al final)
      prop.beam(ax, ay + 0.02, az, bx, by + 0.02, bz, 0.06, 0x23272d);
      deferred.push(() => {
        for (const [px, py, pz] of [[ax + 0.9, ay, az], [bx + 0.9, by, bz]]) {
          let g = groundBelow(cols, px, pz, py); if (!isFinite(g)) g = py - 8;
          prop.box(px - 0.12, g, pz - 0.12, px + 0.12, py + 0.6, pz + 0.12, 0x3b4452);
          prop.beam(px, py + 0.4, pz, px - 0.9, py + 0.05, pz, 0.1, 0x3b4452);
          prop.box(px - 0.3, g, pz - 0.3, px + 0.3, g + 0.15, pz + 0.3, 0xffd23a);
        }
      });
      zipHandle(z);
    },
    lift(id, x, y0, z, w, d, y1) {
      const g = new THREE.Group(); group.add(g);
      const lb = geoBuilder();
      lb.box(-w / 2, -0.4, -d / 2, w / 2, 0, d / 2, 0x3b4452, 63, 0x59636f);
      lb.box(-w / 2 - 0.02, -0.38, -d / 2 - 0.02, w / 2 + 0.02, -0.28, d / 2 + 0.02, 0xffd23a);
      g.add(new THREE.Mesh(lb.build(), mats.prop));
      const arrows = new THREE.Mesh(R.launch, mats.padOff); arrows.scale.set(w / 2.6, 1, d / 2.6); arrows.position.y = -0.04; g.add(arrows);
      g.position.set(x, y0, z);
      // rieles y marco superior
      for (const sx of [-1, 1]) {
        prop.box(x + sx * (w / 2 + 0.1) - 0.1, y0 - 0.4, z - 0.1, x + sx * (w / 2 + 0.1) + 0.1, y1 + 2.6, z + 0.1, 0xffd23a);
      }
      prop.box(x - w / 2 - 0.25, y1 + 2.6, z - 0.15, x + w / 2 + 0.25, y1 + 2.85, z + 0.15, 0xffd23a);
      neonB.box(x - 0.3, y1 + 2.45, z - 0.16, x + 0.3, y1 + 2.58, z + 0.16, 0x46f0ff);
      const c = addCol(col(x - w / 2, y0 - 0.4, z - d / 2, x + w / 2, y0, z + d / 2, 'lift'));
      W.lifts.push({ id, x, z, w, d, y0, y1, y: y0, state: 'down', wait: 0, idle: 0, col: c, g, arrows, trips: 0 });
    },
    door(id, x, y, z, w, axis = 'x', o = {}) {
      const h = o.h || 3.2;
      const panels = [];
      for (const s of [-1, 1]) {
        const pg = new THREE.Group(); group.add(pg);
        const p = dynMesh(R.box, R.door, pg); p.scale.set(axis === 'x' ? w / 2 : 0.22, h, axis === 'x' ? 0.22 : w / 2); p.position.y = h / 2;
        const st = dynMesh(R.box, o.speed ? R.amber : R.doorStripe, pg); st.scale.set(axis === 'x' ? w / 2 + 0.01 : 0.24, 0.12, axis === 'x' ? 0.24 : w / 2 + 0.01); st.position.y = h * 0.55;
        panels.push({ g: pg, s });
      }
      const light = dynMesh(R.box, R.green); light.scale.set(0.5, 0.18, 0.5); light.position.set(x, y + h + 0.15, z);
      // marco
      if (axis === 'x') { prop.box(x - w / 2 - 0.12, y, z - 0.2, x - w / 2, y + h, z + 0.2, 0x3b4452); prop.box(x + w / 2, y, z - 0.2, x + w / 2 + 0.12, y + h, z + 0.2, 0x3b4452); }
      else { prop.box(x - 0.2, y, z - w / 2 - 0.12, x + 0.2, y + h, z - w / 2, 0x3b4452); prop.box(x - 0.2, y, z + w / 2, x + 0.2, y + h, z + w / 2 + 0.12, 0x3b4452); }
      const c = addCol(axis === 'x' ? col(x - w / 2, y, z - 0.15, x + w / 2, y + h, z + 0.15, 'door') : col(x - 0.15, y, z - w / 2, x + 0.15, y + h, z + w / 2, 'door'));
      const d = { id, x, y, z, w, h, axis, open: 0, want: false, scan: 0, lockT: 0, speed: o.speed || 0, secure: !!o.secure, col: c, panels, light, opens: 0, denied: 0, unlocked: !!SESSION.doorsUnlocked[def.id + ':' + id] };
      W.doors.push(d); placeDoor(d);
    },
    drone(path, speed, o = {}) { W.drones.push(makeDrone(ctx, W, path, speed, o)); },
    barrier(id, x, y, z, w, mode, axis = 'x', o = {}) {
      // postes de seguridad (estáticos)
      for (const s of [-1, 1]) {
        const px = axis === 'x' ? x + s * (w / 2 + 0.2) : x, pz = axis === 'x' ? z : z + s * (w / 2 + 0.2);
        const zr = mode === 'sweep' ? (o.range || 3) + 0.4 : 0.25;
        prop.box(px - 0.22, y, pz - (axis === 'x' ? zr : 0.22), px + 0.22, y + 0.12, pz + (axis === 'x' ? zr : 0.22), 0x2a2f36);
        for (let k = 0; k < 6; k++) prop.box(px - 0.18, y + k * 0.4, pz - 0.18, px + 0.18, y + k * 0.4 + 0.4, pz + 0.18, k % 2 ? 0x1b1b1b : 0xffd23a);
      }
      W.barriers.push(makeBarrier(ctx, W, { id, x, y, z, w, mode, axis, ...o }));
    },
    turret(x, y, z) { prop.cyl(x, y, z, 0.9, 0.9, 0.12, 8, 0x2a2f36); W.turrets.push(makeTurret(ctx, W, x, y, z)); },
    clock(id, x, y, z) { W.clocks.push({ id, x, y, z, taken: false }); },
    cp(x, y, z, yaw = 0) {
      gateStatic(x, y, z, 6.4, 0x2c333d, 5.6);
      const banner = dynMesh(R.box, R.cpOff); banner.scale.set(6.0, 0.5, 0.06); banner.position.set(x, y + 5.25, z);
      W.cps.push({ i: W.cps.length, x, y, z, yaw: Math.PI, banner, reached: false });
    },
    goal(x, y, z) {
      gateStatic(x, y, z, 8.5, 0x1d2228, 6);
      const banner = dynMesh(R.box, R.checker); banner.scale.set(8.0, 0.9, 0.08); banner.position.set(x, y + 5.4, z);
      const big = dynMesh(R.clock, mats.clock); big.scale.setScalar(2.4); big.position.set(x, y + 8.4, z);
      neonB.box(x - 4, y + 0.015, z - 0.25, x + 4, y + 0.03, z + 0.25, 0xffd23a);
      W.goal = { x, y, z, big };
    },
    alt(id, name, box, sign) {
      W.alts.push({ id, name, c: col(box[0], box[1], box[2], box[3], box[4], box[5], 'ghost'), hit: false });
      if (sign) {
        const [sx, sy, sz, yaw] = sign;
        const m = dynMesh(new THREE.PlaneGeometry(2.4, 1.2), R.graffiti); m.position.set(sx, sy, sz); m.rotation.y = yaw;
        W.dyn.push(m.geometry);
      }
    },
    neon(x, y, z, w, h, color, yaw) {
      const cz = Math.cos(yaw), sz = Math.sin(yaw);
      _e.set(0, yaw, 0); _q.setFromEuler(_e);
      _p.set(x, y, z); _s.set(w + 0.4, h + 0.4, 0.2); _m4.compose(_p, _q, _s); prop.boxM(_m4, 0x16161c);
      const off = 0.12;
      // marco y tres barras de «letras»
      const put = (lx, ly, lw, lh) => { _p.set(x + cz * lx + sz * off, y + ly, z - sz * lx + cz * off); _s.set(lw, lh, 0.06); _m4.compose(_p, _q, _s); neonB.boxM(_m4, color); };
      put(0, h / 2, w, 0.1); put(0, -h / 2, w, 0.1); put(-w / 2, 0, 0.1, h); put(w / 2, 0, 0.1, h);
      const n = Math.max(2, Math.floor(w / 1.6));
      for (let i = 0; i < n; i++) put(-w / 2 + (i + 0.5) * (w / n), 0, w / n * 0.62, h * 0.5);
      if (ctx.glow()) { const gl = dynMesh(new THREE.PlaneGeometry(w + 3, h + 2.5), mats.glowAdd); gl.position.set(x + sz * 0.3, y, z + cz * 0.3); gl.rotation.y = yaw; /** @type {any} */ (gl.material); W.dyn.push(gl.geometry); gl.userData.glow = color; }
    },
    platform(x, y, z, w, d) { prop.box(x - w / 2, deep, z - d / 2, x + w / 2, y, z + d / 2, 0x8a8f96); roofTop(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y, 0x6e737a); addCol(col(x - w / 2, deep, z - d / 2, x + w / 2, y, z + d / 2, 'roof')); minRoof = Math.min(minRoof, y); },
    stack(x, zN, zF, w, n, o = {}) {
      const z0 = Math.min(zN, zF), z1 = Math.max(zN, zF), x0 = x - w / 2, x1 = x + w / 2, top = n * 2.6;
      prop.box(x0 - 0.3, deep, z0 - 0.3, x1 + 0.3, 0.3, z1 + 0.3, 0x6e737a); // muelle
      if (o.flat) { building(x0, z0, x1, z1, top, 0x8a96a0, { roof: 0x6e737a }); }
      else {
        const L = z1 - z0, cn = Math.max(1, Math.round(w / 2.6)), cw = w / cn;
        for (let k = 0; k < Math.ceil(n); k++) for (let i = 0; i < cn; i++) {
          const c = theme.containers[Math.floor(hash(x + i * 3.1, z0 + k * 7.7) * theme.containers.length)];
          container(x0 + i * cw + 0.03, k * 2.6, z0 + 0.03, x0 + (i + 1) * cw - 0.03, Math.min(top, (k + 1) * 2.6), z1 - 0.03, c, 'z');
        }
        void L;
        // borde superior visible
        roofTop(x0, z0, x1, z1, top + 0.001, shade(theme.containers[0], 0.75));
      }
      addCol(col(x0, deep, z0, x1, top, z1, 'roof'));
      minRoof = Math.min(minRoof, top);
    },
    crane(x, z, h, z0, z1, y) {
      const tx = x - 2.6, Y = 0xe0a42a;
      for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) prop.box(tx + ox - 0.15, deep, z + oz - 0.15, tx + ox + 0.15, h, z + oz + 0.15, Y);
      for (let yy = 0; yy < h; yy += 3.2) {
        prop.beam(tx - 1.2, yy, z - 1.2, tx + 1.2, yy + 3.2, z - 1.2, 0.1, Y); prop.beam(tx + 1.2, yy, z + 1.2, tx - 1.2, yy + 3.2, z + 1.2, 0.1, Y);
        prop.beam(tx - 1.2, yy, z + 1.2, tx - 1.2, yy + 3.2, z - 1.2, 0.1, Y); prop.beam(tx + 1.2, yy, z - 1.2, tx + 1.2, yy + 3.2, z + 1.2, 0.1, Y);
      }
      addCol(col(tx - 1.35, deep, z - 1.35, tx + 1.35, h, z + 1.35, 'box'));
      // cabina
      prop.box(tx - 1.6, y + 0.4, z - 1.6, tx + 1.6, y + 3.2, z + 1.6, 0xdedede); prop.box(tx - 1.62, y + 1.8, z - 1.62, tx + 1.62, y + 2.6, z + 1.62, 0x2a3a4a);
      // pasarela del brazo (caminable) con barandas finas
      const za = Math.min(z0, z1), zb = Math.max(z0, z1);
      prop.box(x - 1, y - 0.6, za, x + 1, y, zb, Y);
      roofTop(x - 1, za, x + 1, zb, y, 0x6b5a2a);
      for (let zz = za + 1; zz < zb; zz += 3) { prop.beam(x - 1, y - 0.6, zz, x - 1, y - 2.2, zz + 1.5, 0.1, Y); prop.beam(x + 1, y - 0.6, zz, x + 1, y - 2.2, zz + 1.5, 0.1, Y); }
      prop.box(x - 1, y - 2.3, za, x - 0.85, y - 2.1, zb, Y); prop.box(x + 0.85, y - 2.3, za, x + 1, y - 2.1, zb, Y);
      prop.beam(tx, h, z, x, y + 0.1, za, 0.08, 0x23272d); prop.beam(tx, h, z, x, y + 0.1, (za + zb) / 2, 0.08, 0x23272d);
      // contrapluma
      prop.box(x - 1, y - 0.6, zb, x + 1, y, zb + 12, Y); prop.box(x - 1.4, y, zb + 9, x + 1.4, y + 2.2, zb + 12, 0x6e737a);
      addCol(col(x - 1, y - 0.6, za, x + 1, y, zb + 12, 'roof'));
    },
    ship(x, zN, zF, w, deckY) {
      const z0 = Math.min(zN, zF), z1 = Math.max(zN, zF), x0 = x - w / 2, x1 = x + w / 2;
      prop.box(x0, deep, z0, x1, deckY - 0.8, z1, 0x7a2a26, 59);
      prop.box(x0 - 0.05, deckY - 0.8, z0 - 0.05, x1 + 0.05, deckY, z1 + 0.05, 0xe8e8e8, 59);
      prop.box(x0 - 0.06, theme.groundY - 0.2, z0 - 0.06, x1 + 0.06, theme.groundY + 0.6, z1 + 0.06, 0x1d2228);
      roofTop(x0, z0, x1, z1, deckY, 0x5a6a5a);
      // proa en punta (sólo visual, hacia +z)
      prop.beam(x, deckY - 0.4, z1 + 4, x0, deckY - 0.4, z1, 0.8, 0x7a2a26); prop.beam(x, deckY - 0.4, z1 + 4, x1, deckY - 0.4, z1, 0.8, 0x7a2a26);
      prop.box(x - 0.15, deckY, z0 + 3, x + 0.15, deckY + 9, z0 + 3.3, 0xdedede);
      addCol(col(x0, deep, z0, x1, deckY, z1, 'roof'));
      minRoof = Math.min(minRoof, deckY);
    },
    tunnel(x, y, zN, zF) {
      const z0 = Math.min(zN, zF), z1 = Math.max(zN, zF), x0 = x - 1.2, x1 = x + 1.2, c = 0x2f6fb5;
      prop.box(x0, y, z0, x0 + 0.2, y + 2.6, z1, c); prop.box(x1 - 0.2, y, z0, x1, y + 2.6, z1, c); prop.box(x0, y + 2.4, z0, x1, y + 2.6, z1, c);
      for (let zz = z0 + 0.5; zz < z1; zz += 0.9) { prop.box(x0 - 0.05, y, zz, x0, y + 2.6, zz + 0.3, shade(c, 0.75)); prop.box(x1, y, zz, x1 + 0.05, y + 2.6, zz + 0.3, shade(c, 0.75)); }
      prop.box(x0 + 0.2, y + 0.002, z0, x1 - 0.2, y + 0.01, z1, 0x1d2228);
      neonB.box(x0 + 0.25, y + 2.3, z0 + 0.5, x0 + 0.35, y + 2.38, z1 - 0.5, 0x46f0ff);
      addCol(col(x0, y, z0, x0 + 0.2, y + 2.6, z1, 'box')); addCol(col(x1 - 0.2, y, z0, x1, y + 2.6, z1, 'box')); addCol(col(x0, y + 2.4, z0, x1, y + 2.6, z1, 'box'));
    },
    /** rampa que sube hacia -z (de y0 en zN a y1 en zF): visual inclinado + escalones finos invisibles de 0.15 m */
    ramp(x, y0, zN, zF, w, y1, o = {}) {
      const x0 = x - w / 2, x1 = x + w / 2, L = zN - zF, rise = y1 - y0, n = Math.max(2, Math.ceil(rise / 0.15));
      const c1 = o.color ?? 0x8a939c, c2 = shade(c1, 0.7);
      // tablero inclinado y laterales
      prop.quad(x0, y0 + 0.02, zN, x1, y0 + 0.02, zN, x1, y1 + 0.02, zF, x0, y1 + 0.02, zF, 0, L / Math.hypot(L, rise), rise / Math.hypot(L, rise), c1);
      prop.quad(x1, y0 - 0.3, zN, x1, y1 - 0.3, zF, x1, y1 + 0.02, zF, x1, y0 + 0.02, zN, 1, 0, 0, c2);
      prop.quad(x0, y0 - 0.3, zN, x0, y0 + 0.02, zN, x0, y1 + 0.02, zF, x0, y1 - 0.3, zF, -1, 0, 0, c2);
      // franjas amarillas en los bordes y chevrones que marcan la subida
      neonB.beam(x0 + 0.1, y0 + 0.05, zN, x0 + 0.1, y1 + 0.05, zF, 0.12, 0xffd23a);
      neonB.beam(x1 - 0.1, y0 + 0.05, zN, x1 - 0.1, y1 + 0.05, zF, 0.12, 0xffd23a);
      for (let k = 1; k < 4; k++) { const t = k / 4, zz = zN - L * t, yy = y0 + rise * t + 0.05; neonB.beam(x - w * 0.3, yy - 0.02, zz + 0.25, x, yy + 0.04, zz - 0.25, 0.1, 0xffffff); neonB.beam(x + w * 0.3, yy - 0.02, zz + 0.25, x, yy + 0.04, zz - 0.25, 0.1, 0xffffff); }
      // soportes
      for (let k = 1; k <= 2; k++) { const zz = zN - L * k / 3, yy = y0 + rise * k / 3; prop.box(x - 0.12, y0 - 0.3, zz - 0.12, x + 0.12, yy - 0.3, zz + 0.12, c2); }
      for (let k = 0; k < n; k++) {
        const za = zN - L * k / n, zb = zN - L * (k + 1) / n, top = y0 + rise * (k + 0.5) / n;
        addCol(col(x0, y0 - 0.3, zb, x1, top, za, 'ramp'));
      }
    },
    phases(list) { W.phaseCps = list; },
    decor(o) { decor(o); },
  };

  function gateStatic(x, y, z, w, color, h = 4.2) {
    prop.box(x - w / 2 - 0.25, y, z - 0.25, x - w / 2 + 0.25, y + h, z + 0.25, color);
    prop.box(x + w / 2 - 0.25, y, z - 0.25, x + w / 2 + 0.25, y + h, z + 0.25, color);
    prop.box(x - w / 2 - 0.3, y + h, z - 0.3, x + w / 2 + 0.3, y + h + 0.5, z + 0.3, color);
    neonB.box(x - w / 2 - 0.31, y + h + 0.16, z - 0.31, x + w / 2 + 0.31, y + h + 0.32, z + 0.31, theme.neon[0]);
    neonB.box(x - w / 2 - 0.26, y + 0.4, z - 0.26, x - w / 2 + 0.26, y + 0.52, z + 0.26, theme.neon[0]);
    neonB.box(x + w / 2 - 0.26, y + 0.4, z - 0.26, x + w / 2 + 0.26, y + 0.52, z + 0.26, theme.neon[0]);
  }
  function tank(x, y, z, solid) {
    for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) prop.box(x + ox - 0.08, y, z + oz - 0.08, x + ox + 0.08, y + 1.6, z + oz + 0.08, 0x4a4f57);
    prop.cyl(x, y + 1.6, z, 1.15, 1.15, 2.0, 10, 0x8a6a4a);
    prop.cyl(x, y + 3.6, z, 1.2, 0.1, 0.7, 10, 0x6a4a34);
    for (let k = 0; k < 3; k++) prop.cyl(x, y + 1.9 + k * 0.6, z, 1.18, 1.18, 0.07, 10, 0x4a3524, false);
    if (solid) addCol(col(x - 1.15, y, z - 1.15, x + 1.15, y + 3.6, z + 1.15, 'box'));
  }
  function container(x0, y0, z0, x1, y1, z1, c, along, ribs = true) {
    prop.box(x0, y0, z0, x1, y1, z1, c);
    const dark = shade(c, 0.72);
    if (along === 'z' && ribs) for (let zz = z0 + 0.3; zz < z1 - 0.2; zz += 1.1) { prop.box(x0 - 0.04, y0 + 0.1, zz, x0, y1 - 0.1, zz + 0.25, dark); prop.box(x1, y0 + 0.1, zz, x1 + 0.04, y1 - 0.1, zz + 0.25, dark); }
    prop.box(x0 - 0.02, y0, z1 - 0.12, x1 + 0.02, y1, z1 + 0.02, dark);
  }
  function zipHandle(z) {
    const t = z.t;
    z.handle.position.set(z.a.x + z.dx * z.len * t, z.a.y + z.dy * z.len * t, z.a.z + z.dz * z.len * t);
    z.handle.rotation.y = Math.atan2(z.dx, z.dz);
  }
  function placeDoor(d) {
    const slide = d.open * (d.w / 2 + 0.05);
    for (const p of d.panels) {
      const off = p.s * (d.w / 4 + slide);
      if (d.axis === 'x') p.g.position.set(d.x + off, d.y, d.z); else p.g.position.set(d.x, d.y, d.z + off);
    }
  }

  /* ---------- decorado lejano ---------- */
  let sky = /** @type {any} */ (null), skyline = /** @type {any} */ (null), stars = /** @type {any} */ (null), disc = /** @type {any} */ (null), groundM = /** @type {any} */ (null);
  function decor(o) {
    const zMin = W.zMin, zMax = W.zMax;
    const r = rng(def.id.length * 31 + 7);
    // antenas y tanques sobre azoteas (sólo bordes)
    for (let i = 0; i < (o.antennas || 0); i++) {
      const rf = W.roofs[Math.floor(r() * W.roofs.length)]; if (!rf) break;
      const ax = r() < 0.5 ? rf.x0 + 0.5 : rf.x1 - 0.5, az = rf.z0 + 1 + r() * Math.max(0.5, rf.z1 - rf.z0 - 2);
      const hh = 2 + r() * 4;
      prop.box(ax - 0.06, rf.h, az - 0.06, ax + 0.06, rf.h + hh, az + 0.06, 0x3b4452);
      prop.box(ax - 0.5, rf.h + hh * 0.7, az - 0.03, ax + 0.5, rf.h + hh * 0.7 + 0.06, az + 0.03, 0x3b4452);
      neonB.box(ax - 0.08, rf.h + hh, az - 0.08, ax + 0.08, rf.h + hh + 0.16, az + 0.08, 0xff3348);
    }
    for (let i = 0; i < (o.signs || 0); i++) {
      const rf = W.roofs[Math.floor(r() * W.roofs.length)]; if (!rf) break;
      const side = r() < 0.5 ? -1 : 1, sx = side < 0 ? rf.x0 - 0.25 : rf.x1 + 0.25, sz = rf.z0 + 2 + r() * Math.max(1, rf.z1 - rf.z0 - 4), sy = rf.h - 3 - r() * 6;
      const c = theme.neon[Math.floor(r() * theme.neon.length)], ww = 2 + r() * 3;
      neonB.box(sx - 0.06, sy, sz - ww / 2, sx + 0.06, sy + 0.12, sz + ww / 2, c);
      neonB.box(sx - 0.06, sy - 1.6, sz - ww / 2, sx + 0.06, sy - 1.48, sz + ww / 2, c);
      neonB.box(sx - 0.05, sy - 1.3, sz - ww / 2 + 0.3, sx + 0.05, sy - 0.25, sz - ww / 2 + 0.45, c);
      neonB.box(sx - 0.05, sy - 1.3, sz - 0.1, sx + 0.05, sy - 0.25, sz + 0.1, c);
    }
    for (let i = 0; i < (o.containers || 0); i++) {
      const side = r() < 0.5 ? -1 : 1, cx = side * (26 + r() * 50), cz = zMax - r() * (zMax - zMin + 40), k = 1 + Math.floor(r() * 4);
      const c = theme.containers[Math.floor(r() * theme.containers.length)];
      container(cx - 1.2, theme.groundY, cz - 3, cx + 1.2, theme.groundY + k * 2.6, cz + 3, c, 'z', false);
    }
    for (let i = 0; i < (o.cranes || 0); i++) {
      const side = i % 2 ? -1 : 1, cx = side * (40 + r() * 30), cz = zMax - (i + 0.5) * (zMax - zMin) / (o.cranes || 1), hh = 34 + r() * 10;
      for (const [ox, oz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) prop.box(cx + ox - 0.2, theme.groundY, cz + oz - 0.2, cx + ox + 0.2, hh, cz + oz + 0.2, 0xe0a42a);
      prop.box(cx - 1.2, hh - 1, cz - 18, cx + 1.2, hh, cz + 10, 0xe0a42a);
      prop.box(cx - 2, hh - 4, cz - 2, cx + 2, hh - 1, cz + 2, 0xdedede);
    }
    for (let i = 0; i < (o.tanks || 0); i++) {
      const rf = W.roofs[Math.floor(r() * W.roofs.length)]; if (!rf || rf.x1 - rf.x0 < 10) continue;
      const tx = r() < 0.5 ? rf.x0 + 1.6 : rf.x1 - 1.6, tz = rf.z0 + 2 + r() * Math.max(0.5, rf.z1 - rf.z0 - 4);
      // sólo en los bordes laterales, lejos del centro del recorrido
      tank(tx, rf.h, tz, true);
    }
  }

  /* ---------- construir ---------- */
  def.build(B);
  for (const c of cols) { W.zMin = Math.min(W.zMin, c.z0); W.zMax = Math.max(W.zMax, c.z1); }
  deferred.forEach(f => f());
  W.killY = minRoof - 9;

  const mkStatic = (b, mat, shadow = true) => { if (!b.count) return null; const m = new THREE.Mesh(b.build(), mat); m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); return m; };
  W.staticMeshes = [mkStatic(facade, mats.facade), mkStatic(roof, mats.roof), mkStatic(prop, mats.prop), mkStatic(neonB, mats.neon, false)].filter(Boolean);

  // horizonte instanciado
  {
    const MAX = 320, r = rng(def.id.length * 101 + 3);
    skyline = new THREE.InstancedMesh(R.box, mats.skyline, MAX);
    const avg = W.roofs.reduce((a, b) => a + b.h, 0) / Math.max(1, W.roofs.length);
    for (let i = 0; i < MAX; i++) {
      const side = i % 2 ? -1 : 1;
      const far = r();
      let x = side * ((theme.sea ? 75 : 30) + far * far * 190), z = W.zMax + 80 - r() * (W.zMax - W.zMin + 300);
      if (i % 7 === 0) { x = (r() - 0.5) * 120; z = W.zMin - 40 - r() * 160; }
      const w = 8 + r() * 16, d = 8 + r() * 16;
      const top = theme.sea ? theme.groundY + 6 + r() * 26 : avg - 22 + r() * 42 + far * 20;
      const bot = theme.groundY - 30;
      _p.set(x, (top + bot) / 2, z); _s.set(w, top - bot, d); _q.identity(); _m4.compose(_p, _q, _s);
      skyline.setMatrixAt(i, _m4);
      _c.set(theme.facades[i % theme.facades.length]).multiplyScalar(0.55 + r() * 0.3);
      skyline.setColorAt(i, _c);
    }
    skyline.frustumCulled = false;
    group.add(skyline);
  }
  // suelo / mar
  groundM = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), mats.ground);
  groundM.rotation.x = -Math.PI / 2; groundM.position.set(0, theme.groundY, (W.zMin + W.zMax) / 2);
  group.add(groundM); W.dyn.push(groundM.geometry);
  // cielo (degradé por vértice), sol/luna y estrellas
  {
    const g = new THREE.SphereGeometry(1, 24, 14), pos = g.getAttribute('position'), cs = [];
    const c0 = new THREE.Color(theme.sky[0]), c1 = new THREE.Color(theme.sky[1]), c2 = new THREE.Color(theme.sky[2]);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0.12) _c.copy(c1).lerp(c0, Math.min(1, (y - 0.12) / 0.6)); else if (y > -0.05) _c.copy(c2).lerp(c1, (y + 0.05) / 0.17); else _c.copy(c2);
      cs.push(_c.r, _c.g, _c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
    sky = new THREE.Group();
    const dome = new THREE.Mesh(g, mats.sky); dome.renderOrder = -10; sky.add(dome);
    const dm = new THREE.MeshBasicMaterial({ color: theme.disc, fog: false, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false });
    disc = new THREE.Mesh(new THREE.CircleGeometry(1, 28), dm); disc.renderOrder = -9; sky.add(disc);
    const sd = new THREE.Vector3(theme.sunDir[0], theme.sunDir[1] * 0.35, theme.sunDir[2]).normalize();
    disc.position.copy(sd).multiplyScalar(0.9); disc.lookAt(0, 0, 0); disc.scale.setScalar(theme.discSize / 400);
    if (theme.stars) {
      const sp = [], r = rng(99);
      for (let i = 0; i < 500; i++) { const a = r() * Math.PI * 2, y = 0.15 + r() * 0.85, rr = Math.sqrt(1 - y * y); sp.push(Math.cos(a) * rr * 0.95, y * 0.95, Math.sin(a) * rr * 0.95); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
      stars.renderOrder = -9; sky.add(stars);
    }
    sky.traverse(o => { o.frustumCulled = false; });
    group.add(sky);
  }

  // relojes: una sola malla instanciada
  W.clockMesh = new THREE.InstancedMesh(R.clock, mats.clock, Math.max(1, W.clocks.length));
  W.clockMesh.frustumCulled = false; group.add(W.clockMesh);
  W.grid = createGrid(cols, 16);

  /* ---------- calidad ---------- */
  W.applyQuality = (q) => {
    skyline.count = q.skyline;
    if (stars) stars.geometry.setDrawRange(0, q.stars);
    group.traverse(o => { if (o.userData.glow) o.visible = q.glow; });
  };
  W.followSky = (cam, far) => { sky.position.copy(cam.position); sky.scale.setScalar(far * 0.9); };

  /* ---------- reinicio por carrera ---------- */
  W.resetRun = () => {
    for (const c of W.clocks) c.taken = false;
    for (const a of W.alts) a.hit = false;
    for (const cp of W.cps) { cp.reached = false; cp.banner.material = R.cpOff; }
    for (const p of W.pads) p.cd = 0;
    for (const z of W.zips) { z.t = 0; z.back = 0; z.busy = false; zipHandle(z); }
    for (const l of W.lifts) { l.y = l.y0; l.state = 'down'; l.wait = 0; l.col.y1 = l.y0; l.col.y0 = l.y0 - 0.4; l.g.position.y = l.y0; }
    for (const d of W.doors) { d.open = d.unlocked ? 1 : 0; d.lockT = 0; d.scan = 0; d.col.on = d.open < 0.75; placeDoor(d); }
    for (const e of W.drones) e.reset();
    for (const e of W.barriers) e.reset();
    for (const e of W.turrets) e.reset();
    W.time = 0;
  };

  /* ---------- actualización ---------- */
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion(), _cp = new THREE.Vector3(), _cs = new THREE.Vector3(), _ce = new THREE.Euler();
  /** @param {number} dt @param {any} P jugador (o null en menú) */
  W.update = (dt, P) => {
    W.time += dt;
    const t = W.time;
    // paneles
    for (const p of W.pads) {
      if (p.cd > 0) { p.cd -= dt; if (p.cd <= 0) p.top.material = p.kind === 'launch' ? mats.launchOn : mats.padOn; }
    }
    // tirolinas: la manija vuelve sola al inicio
    for (const z of W.zips) { if (!z.busy && z.t > 0) { z.back += dt; if (z.back > 1.2) { z.t = Math.max(0, z.t - dt * 0.35); zipHandle(z); } } }
    // ascensores
    for (const l of W.lifts) {
      const on = P && P.alive && P.body.grounded && P.body.ground === l.col;
      if (l.state === 'down') { if (on) { l.wait += dt; if (l.wait > 0.35) { l.state = 'up'; l.wait = 0; l.trips++; use(def.id + ':lift:' + l.id); ctx.onLift && ctx.onLift(l); } } else l.wait = 0; }
      else if (l.state === 'up') { l.y = Math.min(l.y1, l.y + dt * 3.4); if (l.y >= l.y1) { l.state = 'top'; l.idle = 0; ctx.sfx.liftStop(); } }
      else if (l.state === 'top') { if (on) l.idle = 0; else { l.idle += dt; if (l.idle > 1.6) l.state = 'down2'; } }
      else if (l.state === 'down2') { l.y = Math.max(l.y0, l.y - dt * 2.6); if (l.y <= l.y0) { l.state = 'down'; l.wait = 0; } }
      const prevTop = l.col.y1;
      l.col.y1 = l.y; l.col.y0 = l.y - 0.4; l.g.position.y = l.y;
      if (on && l.y !== prevTop) { P.body.pos.y = l.y; }
      l.arrows.material = l.state === 'up' || l.state === 'down2' ? mats.padOn : (l.state === 'down' ? mats.launchOn : mats.padOff);
    }
    // puertas automáticas (sensor de proximidad + rayo hacia la puerta)
    for (const d of W.doors) {
      let near = false, fast = true;
      if (P && P.alive) {
        const p = P.body.pos;
        const along = d.axis === 'x' ? p.z - d.z : p.x - d.x, lat = d.axis === 'x' ? p.x - d.x : p.z - d.z;
        const reach = d.speed ? 7.5 : 4.6;
        near = Math.abs(along) < reach && Math.abs(lat) < d.w / 2 + 1.3 && Math.abs(p.y - d.y) < 2.6;
        if (near && d.speed && !d.unlocked) {
          const sp = Math.hypot(P.body.vel.x, P.body.vel.z);
          fast = sp >= d.speed;
          if (fast && Math.abs(along) < 6.5) { d.unlocked = true; SESSION.doorsUnlocked[def.id + ':' + d.id] = true; ctx.onDoorUnlock && ctx.onDoorUnlock(d); }
        }
      }
      if (d.lockT > 0) d.lockT -= dt;
      const locked = d.lockT > 0 || (d.speed && !d.unlocked);
      if (near && !locked) {
        if (d.secure && d.open < 0.05) { d.scan += dt; if (d.scan < 0.55) near = false; }
        if (near && d.open < 0.05) { d.opens++; use(def.id + ':door:' + d.id); ctx.sfx.door(); }
      } else d.scan = 0;
      if (near && locked && d.speed && !fast && d.denied <= 0) { d.denied = 2; ctx.onDoorDenied && ctx.onDoorDenied(d); }
      d.denied -= dt;
      const want = near && !locked;
      const target = want || (d.unlocked && !d.lockT) ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * (target ? 3.2 : 1.6));
      d.col.on = d.open < 0.75;
      // no cerrar sobre el corredor
      if (P && d.col.on && P.alive) {
        const p = P.body.pos, c = d.col;
        if (ov(c, p.x - P.body.r, p.y, p.z - P.body.r, p.x + P.body.r, p.y + P.body.h, p.z + P.body.r)) { d.open = 0.8; d.col.on = false; }
      }
      placeDoor(d);
      d.light.material = locked ? (d.speed ? R.amber : R.red) : (d.open > 0.5 ? R.green : (d.scan > 0 ? R.amber : R.green));
    }
    // relojes (giran y flotan)
    for (let i = 0; i < W.clocks.length; i++) {
      const c = W.clocks[i];
      _cp.set(c.x, c.y + Math.sin(t * 2 + i) * 0.12, c.z);
      _ce.set(0, t * 2.2 + i, 0); _cq.setFromEuler(_ce); _cs.setScalar(c.taken ? 0.0001 : 1);
      _cm.compose(_cp, _cq, _cs); W.clockMesh.setMatrixAt(i, _cm);
    }
    W.clockMesh.count = W.clocks.length; W.clockMesh.instanceMatrix.needsUpdate = true;
    if (W.goal) W.goal.big.rotation.y = Math.sin(t * 0.6) * 0.5;
    // rivales
    for (const e of W.drones) e.update(dt, P);
    for (const e of W.barriers) e.update(dt, P);
    for (const e of W.turrets) e.update(dt, P);
  };

  /** Panel de impulso bajo los pies (o null). */
  W.padAt = (P) => {
    const p = P.body.pos;
    for (const pd of W.pads) { if (pd.cd > 0) continue; if (Math.abs(p.y - pd.y) < 0.35 && Math.hypot(p.x - pd.x, p.z - pd.z) < 1.35) return pd; }
    return null;
  };
  W.usePad = (pd) => { pd.cd = 0.9; pd.uses++; pd.top.material = mats.padOff; use(def.id + ':pad:' + pd.id); };
  /** Tirolina alcanzable (o null). */
  W.zipNear = (P) => {
    const p = P.body.pos, head = p.y + PHYS.standH;
    for (const z of W.zips) {
      if (z.busy) continue;
      // punto del cable más cercano en planta (0..0.85 del recorrido)
      const rx = p.x - z.a.x, rz = p.z - z.a.z, hl = Math.hypot(z.dx, z.dz) || 1;
      let t = (rx * z.dx + rz * z.dz) / (hl * hl) / z.len; t = Math.max(0, Math.min(0.85, t));
      const cx = z.a.x + z.dx * z.len * t, cy = z.a.y + z.dy * z.len * t, cz = z.a.z + z.dz * z.len * t;
      const dh = Math.hypot(p.x - cx, p.z - cz), dv = cy - head;
      if (dh < 1.25 && dv > -0.6 && dv < 1.45) return { z, t };
    }
    return null;
  };
  W.zipHandle = zipHandle;
  W.foundZip = (z) => { const k = def.id + ':' + z.id; if (!SESSION.zipsFound[k]) { SESSION.zipsFound[k] = true; } z.lamp.material = R.lampOn; use(k); };
  W.reachCp = (cp) => { cp.reached = true; cp.banner.material = R.cpOn; };
  W.lockdown = (sec) => { for (const d of W.doors) if (d.secure) { d.lockT = sec; } };

  W.dispose = () => {
    group.traverse(o => {
      const m = /** @type {any} */ (o);
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      if (m.material && !Array.isArray(m.material) && !m.material.userData.shared && m.material !== mats.prop) {
        const shared2 = Object.values(mats).includes(m.material) || Object.values(R).includes(m.material);
        if (!shared2) { for (const k in m.material) { const v = m.material[k]; if (v && v.isTexture) v.dispose(); } m.material.dispose(); }
      }
    });
    for (const e of [...W.drones, ...W.barriers, ...W.turrets]) e.dispose && e.dispose();
    group.removeFromParent();
  };
  return W;
}
