// @ts-check
/* Construcción de los 3 sectores: cielo, estrellas, cobertura (asteroides/cristales/estación), interactivos
   (balizas, torretas aliadas, docks, cápsulas, transmisores), cargueros y portal. */
import * as THREE from 'three';
import { rng } from '../../matelabs/kit3d.js';
import * as M from './models.js';
import { SECTORS, QUALITY } from './config.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

/** Materiales compartidos entre sectores (se liberan al salir). */
export function createMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.25 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0.02 }),
    crystal: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.25, metalness: 0.1, emissive: 0x3a1050, emissiveIntensity: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    shield: new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  };
}

/** Cuadrícula espacial de esferas de cobertura (estática por sector). */
function createCoverGrid(cell = 48) {
  /** @type {{x:number,y:number,z:number,r:number}[]} */ const covers = [];
  /** @type {Map<number, number[]>} */ const map = new Map();
  const key = (ix, iy, iz) => ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);
  return {
    covers,
    add(x, y, z, r) {
      const id = covers.length; covers.push({ x, y, z, r });
      const pad = r + 6;
      for (let ix = Math.floor((x - pad) / cell); ix <= Math.floor((x + pad) / cell); ix++)
        for (let iy = Math.floor((y - pad) / cell); iy <= Math.floor((y + pad) / cell); iy++)
          for (let iz = Math.floor((z - pad) / cell); iz <= Math.floor((z + pad) / cell); iz++) {
            const k = key(ix, iy, iz); let a = map.get(k); if (!a) map.set(k, a = []); a.push(id);
          }
    },
    /** Índice de la cobertura que contiene el punto (con margen) o -1. @param {THREE.Vector3} p */
    hit(p, pad = 0) {
      const a = map.get(key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell)));
      if (!a) return -1;
      for (const id of a) { const c = covers[id]; const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, rr = c.r + pad; if (dx * dx + dy * dy + dz * dz < rr * rr) return id; }
      return -1;
    },
    /** ¿El segmento a→b atraviesa alguna cobertura? (línea de visión) @param {THREE.Vector3} a @param {THREE.Vector3} b */
    blocked(a, b, shrink = 0.85) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
      if (L2 < 1e-6) return false;
      for (const c of covers) {
        let t = ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / L2;
        if (t <= 0.02 || t >= 0.98) continue;
        const px = a.x + dx * t - c.x, py = a.y + dy * t - c.y, pz = a.z + dz * t - c.z, rr = c.r * shrink;
        if (px * px + py * py + pz * pz < rr * rr) return true;
      }
      return false;
    },
    /** Distancia del rayo (origen o, dirección unitaria d) a la primera cobertura, o Infinity. */
    ray(o, d, maxLen) {
      let best = Infinity;
      for (const c of covers) {
        const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
        const t = ox * d.x + oy * d.y + oz * d.z;
        if (t < 0 || t - c.r > maxLen) continue;
        const d2 = ox * ox + oy * oy + oz * oz - t * t, rr = c.r * 0.9;
        if (d2 > rr * rr) continue;
        const th = t - Math.sqrt(rr * rr - d2);
        if (th > 0 && th < best) best = th;
      }
      return best;
    },
  };
}

/** Cielo degradado con nubes de nebulosa en colores por vértice. */
function buildSky(def, radius, seed) {
  const g = new THREE.SphereGeometry(radius, 32, 20);
  const pos = g.getAttribute('position'), col = new Float32Array(pos.count * 3);
  const c0 = new THREE.Color(def.sky[0]), c1 = new THREE.Color(def.sky[1]), c2 = new THREE.Color(def.sky[2]), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).normalize();
    const n = 0.5 + 0.5 * Math.sin(_v.x * 3.3 + seed) * Math.sin(_v.y * 4.1 + seed * 2) * Math.sin(_v.z * 2.7 - seed);
    const band = Math.exp(-Math.pow(_v.y * 2.2 - 0.3 * Math.sin(_v.x * 2 + seed), 2));
    c.copy(c0).lerp(c1, Math.min(1, band * 0.9 + n * 0.25)).lerp(c2, Math.max(0, n - 0.55) * 1.6 * band);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = -10; mesh.frustumCulled = false;
  return mesh;
}
function buildStars(count, radius, r) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos[i * 3] = s * Math.cos(th) * radius; pos[i * 3 + 1] = u * radius; pos[i * 3 + 2] = s * Math.sin(th) * radius;
    const b = 0.45 + r() * 0.55, warm = r();
    col[i * 3] = b * (warm > 0.8 ? 1 : 0.8); col[i * 3 + 1] = b * 0.9; col[i * 3 + 2] = b * (warm < 0.3 ? 0.75 : 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -9;
  return p;
}

/** Instancias de un tipo de roca/cristal. */
function instanced(geo, mat, list) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  list.forEach((a, i) => {
    _e.set(a.rx, a.ry, a.rz); _q.setFromEuler(_e); _s.set(a.s * (a.sx || 1), a.s * (a.sy || 1), a.s * (a.sz || 1));
    _m.compose(_v.set(a.x, a.y, a.z), _q, _s); mesh.setMatrixAt(i, _m);
  });
  mesh.count = list.length;
  mesh.computeBoundingSphere();
  return mesh;
}

/**
 * @param {any} ctx contexto del juego (mats, quality, session)
 * @param {number} idx índice de sector
 */
export function buildSector(ctx, idx) {
  const def = SECTORS[idx];
  const q = QUALITY[/** @type {'low'|'medium'|'high'} */ (ctx.quality)] || QUALITY.medium;
  const r = rng(1000 + idx * 77);
  const group = new THREE.Group(); group.name = 'sector-' + def.id;
  const mats = ctx.mats;
  /** @type {THREE.Material[]} */ const ownMats = [];
  const grid = createCoverGrid();
  const W = /** @type {any} */ ({
    idx, def, group, grid, radius: def.radius,
    beacons: [], turrets: [], docks: [], capsules: [], transmitters: [], freighters: [], stranded: [],
    gate: null, path: null, station: null, esperanza: null, planet: null,
    playerStart: { pos: new THREE.Vector3(), yaw: 0, pitch: 0 },
    asteroidCount: 0, coverCount: 0,
  });

  // cielo, estrellas, luces
  const far = q.far;
  // fondo que acompaña a la cámara (nunca se recorta con el plano lejano)
  const skyGroup = new THREE.Group(); skyGroup.name = 'cielo'; group.add(skyGroup); W.skyGroup = skyGroup;
  const sky = buildSky(def, far * 0.92, idx * 1.7 + 0.4); skyGroup.add(sky);
  const stars = buildStars(q.stars, far * 0.88, r); skyGroup.add(stars);
  const hemi = new THREE.HemisphereLight(def.hemi[0], def.hemi[1], 1.7); group.add(hemi);
  const sun = new THREE.DirectionalLight(def.sun, 2.4); sun.position.set(220, 260, 140);
  sun.castShadow = !!q.shadows;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = sc.bottom = -90; sc.right = sc.top = 90; sc.near = 10; sc.far = 700;
  }
  group.add(sun, sun.target);
  W.sun = sun;
  // estrella visible en la dirección de la luz
  const sunMat = new THREE.SpriteMaterial({ map: ctx.dotTex, color: def.sun, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  ownMats.push(sunMat);
  const sunSpr = new THREE.Sprite(sunMat); sunSpr.position.copy(sun.position).normalize().multiplyScalar(far * 0.8); sunSpr.scale.setScalar(far * 0.22); sunSpr.renderOrder = -8; skyGroup.add(sunSpr);
  const haloMat = new THREE.SpriteMaterial({ map: ctx.dotTex, color: def.sky[2], transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  ownMats.push(haloMat);
  const halo = new THREE.Sprite(haloMat); halo.position.copy(sunSpr.position); halo.scale.setScalar(far * 0.9); halo.renderOrder = -8; skyGroup.add(halo);
  const fill = new THREE.DirectionalLight(def.hemi[0], 0.9); fill.position.set(-200, -80, -160); group.add(fill);
  group.add(new THREE.AmbientLight(0x9aa8c0, 0.7));

  // polvo espacial cercano (sensación de velocidad) — sólo media/alta
  if (q.dust) {
    const n = q.dust, pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (r() * 2 - 1) * 60;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.35, color: 0xbfd8ff, transparent: true, opacity: 0.55, depthWrite: false });
    ownMats.push(m);
    W.dust = new THREE.Points(g, m); W.dust.frustumCulled = false; group.add(W.dust);
  }

  const add = (geo, mat, shadow = false) => { const m = new THREE.Mesh(geo, mat); if (shadow) { m.castShadow = true; m.receiveShadow = true; } group.add(m); return m; };
  const glowMesh = (geo) => { const m = new THREE.Mesh(geo, mats.glow); group.add(m); return m; };

  /* ---------- sector 1: cinturón ---------- */
  if (idx === 0) {
    const pts = [[-300, 0, -260], [-200, 20, -150], [-90, -10, -170], [10, 15, -60], [-20, -5, 70], [90, 10, 140], [200, 25, 120], [285, 20, 250]]
      .map(a => new THREE.Vector3(a[0], a[1], a[2]));
    W.path = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
    W.pathLen = W.path.getLength();
    const samples = W.path.getSpacedPoints(160);
    const nearPath = (x, y, z, pad) => { for (const s of samples) { const dx = s.x - x, dy = s.y - y, dz = s.z - z; if (dx * dx + dy * dy + dz * dz < pad * pad) return true; } return false; };
    const lists = [[], [], []];
    const total = Math.round(240 * q.asteroids);
    let tries = 0;
    while (lists[0].length + lists[1].length + lists[2].length < total && tries++ < 6000) {
      const big = r() < 0.12, s = big ? 12 + r() * 14 : r() < 0.5 ? 5 + r() * 6 : 2 + r() * 3;
      const a = r() * Math.PI * 2, d = 40 + Math.sqrt(r()) * 330;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = (r() * 2 - 1) * (big ? 45 : 70);
      if (nearPath(x, y, z, 24 + s * 1.2)) continue;
      const v = (lists[0].length + lists[1].length + lists[2].length) % 3;
      lists[v].push({ x, y, z, s, rx: r() * 6, ry: r() * 6, rz: r() * 6, sx: 0.8 + r() * 0.5, sy: 0.75 + r() * 0.4 });
      if (s >= 3) grid.add(x, y, z, s * 0.95);
    }
    lists.forEach((l, i) => { const m = instanced(M.buildAsteroid(1.3 + i * 0.9), mats.rock, l); m.castShadow = m.receiveShadow = !!q.shadows; group.add(m); });
    W.asteroidCount = lists[0].length + lists[1].length + lists[2].length;
    // convoy: 3 cargueros
    const tints = [0x2f7fc1, 0x2fa37a, 0xc18a2f];
    for (let i = 0; i < 3; i++) {
      const fm = M.buildFreighter(tints[i]);
      const body = add(fm.body, mats.body, true), glow = glowMesh(fm.glow);
      W.freighters.push({ body, glow, hp: 1, max: 1, alive: true, lag: i * 34, side: (i - 1) * 7, pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), warp: 0, flash: 0, name: ['ÁGUILA', 'COLIBRÍ', 'HORNERO'][i] });
    }
    // portal
    const gate = add(M.buildGate(), mats.body, true);
    const end = W.path.getPointAt(1), dir = W.path.getTangentAt(1);
    gate.position.copy(end).addScaledVector(dir, 30); gate.lookAt(_v.copy(gate.position).add(dir));
    W.gate = { mesh: gate, pos: gate.position.clone(), disc: addDisc(group, gate, ownMats, 0x6fd8ff) };
    // interactivos
    W.beacons = placeBeacons(group, mats, [[-170, 55, -40], [140, -40, -20], [40, 60, 230]], grid);
    W.turrets = placeTurrets(group, mats, [[-120, -30, -150], [130, -20, 170]], grid);
    W.docks = placeDocks(group, mats, [[-30, 40, -20]]);
    W.capsules = placeCapsules(group, mats, ownMats, [[-230, -40, -60], [60, -55, -190], [230, 60, 60]], ctx.dotTex);
    const s0 = W.path.getPointAt(0), t0 = W.path.getTangentAt(0);
    W.playerStart.pos.copy(s0).addScaledVector(t0, -45).add(_w.set(0, 6, 0));
    setYawPitch(W.playerStart, t0);
  }

  /* ---------- sector 2: estación Delta ---------- */
  if (idx === 1) {
    const st = M.buildStation();
    const station = add(st.body, mats.body, true); const sg = glowMesh(st.glow);
    W.station = { mesh: station, glow: sg };
    // cobertura de la estación: anillo, eje y módulos
    for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; grid.add(Math.cos(a) * 62, 0, Math.sin(a) * 62, 7.5); }
    for (let y = -48; y <= 48; y += 12) grid.add(0, y, 0, Math.abs(y) > 36 ? 9 : 12);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; grid.add(Math.cos(a) * 33, 0, Math.sin(a) * 33, 3); }
    // planeta
    const pk = far * 0.7 / 950; // planeta de fondo (acompaña a la cámara), proporcional al plano lejano
    const pg = new THREE.IcosahedronGeometry(520 * pk, 3);
    const pp = pg.getAttribute('position'), pc = new Float32Array(pp.count * 3), c = new THREE.Color();
    for (let i = 0; i < pp.count; i++) {
      _v.fromBufferAttribute(pp, i).normalize();
      const b = Math.sin(_v.y * 14 + Math.sin(_v.x * 5) * 1.5);
      c.setHSL(0.56 + b * 0.03, 0.45, 0.32 + b * 0.08);
      if (Math.sin(_v.x * 9 + _v.z * 7) > 0.7) c.setHSL(0.3, 0.35, 0.3);
      pc[i * 3] = c.r; pc[i * 3 + 1] = c.g; pc[i * 3 + 2] = c.b;
    }
    pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
    const pm = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, fog: false, depthWrite: false }); ownMats.push(pm);
    const planet = new THREE.Mesh(pg, pm); planet.position.set(-200, -760, -520).multiplyScalar(pk); planet.renderOrder = -7; skyGroup.add(planet);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(545 * pk, 32, 20), new THREE.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.12, side: THREE.BackSide, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    ownMats.push(/** @type {THREE.Material} */ (atm.material)); atm.position.copy(planet.position); skyGroup.add(atm);
    W.planet = planet;
    // escombros
    const lists = [[], []];
    const total = Math.round(90 * q.asteroids);
    for (let i = 0; i < total; i++) {
      const a = r() * Math.PI * 2, d = 140 + r() * 230, s = r() < 0.15 ? 9 + r() * 8 : 2.5 + r() * 4;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = (r() * 2 - 1) * 80;
      if (Math.hypot(x, y - 20, z - 260) < 45 + s) continue;
      lists[i % 2].push({ x, y, z, s, rx: r() * 6, ry: r() * 6, rz: r() * 6, sx: 0.8 + r() * 0.5, sy: 0.75 + r() * 0.4 });
      if (s >= 3) grid.add(x, y, z, s * 0.95);
    }
    lists.forEach((l, i) => group.add(instanced(M.buildAsteroid(0.9 + i * 1.4), mats.rock, l)));
    W.asteroidCount = lists[0].length + lists[1].length;
    // transmisores en 3 módulos (0°, 120°, 240°) — escudados hasta escanear su baliza
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2, x = Math.cos(a) * 62, z = Math.sin(a) * 62;
      const mesh = add(M.buildTransmitter(), mats.body, true); mesh.position.set(x, 17, z);
      const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(15, 2), mats.shield); shield.position.set(x, 19, z); group.add(shield);
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.4, 0), mats.glow); core.position.set(x, 33, z); group.add(core);
      W.transmitters.push({ mesh, shield, core, pos: new THREE.Vector3(x, 22, z), hp: 1, max: 1, alive: true, shielded: true, flash: 0 });
    }
    W.beacons = placeBeacons(group, mats, [[180, 40, 40], [-110, -50, 170], [-90, 60, -190]], grid);
    W.beacons.forEach((b, i) => { b.link = i; });
    W.turrets = placeTurrets(group, mats, [1, 3, 5].map(i => { const a = i / 6 * Math.PI * 2; return [Math.cos(a) * 62, 8, Math.sin(a) * 62]; }), null, true);
    W.docks = placeDocks(group, mats, [[0, 78, 0]]);
    W.capsules = placeCapsules(group, mats, ownMats, [[210, -60, -120], [-230, 30, 30], [60, 90, 250]], ctx.dotTex);
    // cargueros varados
    const spots = [[170, -18, 150], [-175, 25, -120]];
    spots.forEach((p, i) => {
      const fm = M.buildFreighter(i ? 0x8a5fd0 : 0xd05f6a);
      const body = add(fm.body, mats.body, true), glow = glowMesh(fm.glow);
      body.position.set(p[0], p[1], p[2]); glow.position.copy(body.position);
      body.lookAt(0, p[1], 0); glow.quaternion.copy(body.quaternion);
      grid.add(p[0], p[1], p[2], 6);
      W.stranded.push({ body, glow, pos: body.position, hp: 1, max: 1, alive: true, saved: false, spawned: false, attackers: [], warp: 0, flash: 0, name: i ? 'TERO' : 'CARDENAL' });
    });
    W.playerStart.pos.set(0, 20, 260);
    setYawPitch(W.playerStart, _w.set(0, -0.05, -1).normalize());
  }

  /* ---------- sector 3: nebulosa ---------- */
  if (idx === 2) {
    const list = [];
    const total = Math.round(130 * q.crystals);
    for (let i = 0; i < total; i++) {
      const a = r() * Math.PI * 2, d = 70 + Math.sqrt(r()) * 300, s = r() < 0.2 ? 9 + r() * 9 : 3 + r() * 5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = (r() * 2 - 1) * 70;
      if (Math.hypot(x + 150, z + 200) < 40 || Math.hypot(x - 230, z - 230) < 50) continue;
      // despejar la ruta del Esperanza hacia el portal y la órbita del Némesis
      const sx = 400, sz = 450, tt = Math.max(0, Math.min(1, ((x + 150) * sx + (z + 200) * sz) / (sx * sx + sz * sz)));
      if (Math.hypot(x - (-150 + sx * tt), z - (-200 + sz * tt)) < 26 + s && Math.abs(y - 15 * tt) < 30 + s) continue;
      const el = Math.sqrt((x / 150) ** 2 + (z / 115) ** 2);
      if (Math.abs(el - 1) < 0.3 && Math.abs(y - 10) < 45) continue;
      list.push({ x, y, z, s, rx: (r() - 0.5) * 0.9, ry: r() * 6, rz: (r() - 0.5) * 0.9 });
      grid.add(x, y + s * 0.4, z, s * 1.5); grid.add(x, y - s * 1.5, z, s * 1.0);
    }
    const cm = instanced(M.buildCrystal(), mats.crystal, list); cm.castShadow = !!q.shadows; group.add(cm);
    W.asteroidCount = list.length;
    // nubes de nebulosa: sprites grandes
    const cloudMat = new THREE.SpriteMaterial({ map: ctx.dotTex, color: 0xb04cd0, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    ownMats.push(cloudMat);
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(cloudMat); const a = r() * Math.PI * 2, d = 160 + r() * 300;
      s.position.set(Math.cos(a) * d, (r() - 0.5) * 140, Math.sin(a) * d); s.scale.setScalar(160 + r() * 200); group.add(s);
    }
    // carguero Esperanza, refugiado entre cristales
    const fm = M.buildFreighter(0xffb13b);
    const body = add(fm.body, mats.body, true), glow = glowMesh(fm.glow);
    body.position.set(-150, 0, -200); glow.position.copy(body.position);
    body.lookAt(230, 30, 230); glow.quaternion.copy(body.quaternion);
    W.esperanza = { body, glow, pos: body.position, hp: 1, max: 1, alive: true, moving: false, t: 0, flash: 0, warp: 0, name: 'ESPERANZA' };
    const gate = add(M.buildGate(), mats.body, true); gate.position.set(250, 30, 250); gate.lookAt(-150, 0, -200);
    W.gate = { mesh: gate, pos: gate.position.clone(), disc: addDisc(group, gate, ownMats, 0xff7ae0) };
    W.beacons = placeBeacons(group, mats, [[150, 50, -150], [-210, -40, 90]], grid);
    W.turrets = placeTurrets(group, mats, [[60, -45, -60], [-60, -40, 80]], grid);
    W.docks = placeDocks(group, mats, [[-120, 30, -120]]);
    W.capsules = placeCapsules(group, mats, ownMats, [[200, -50, 40], [-60, 70, -260], [-260, 10, 200]], ctx.dotTex);
    W.bossSpawn = new THREE.Vector3(0, 10, 0);
    W.playerStart.pos.set(-130, 15, -150);
    setYawPitch(W.playerStart, _w.set(0.7, 0, 0.7).normalize());
  }

  W.coverCount = grid.covers.length;
  ctx.scene.add(group);

  W.dispose = () => {
    ctx.scene.remove(group);
    const shared = new Set(Object.values(mats));
    /** @type {Set<any>} */ const seen = new Set();
    group.traverse(/** @param {any} o */ o => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) if (!shared.has(m) && !seen.has(m)) { seen.add(m); m.dispose(); }
    });
    sky.material.dispose(); /** @type {THREE.Material} */ (stars.material).dispose();
    ownMats.forEach(m => m.dispose());
    if (sun.shadow && sun.shadow.map) sun.shadow.map.dispose();
  };
  return W;
}

function setYawPitch(o, dir) { o.yaw = Math.atan2(dir.x, dir.z); o.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))); }

function addDisc(group, gate, ownMats, color) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  ownMats.push(m);
  const d = new THREE.Mesh(new THREE.CircleGeometry(28, 32), m); d.position.copy(gate.position); d.quaternion.copy(gate.quaternion); group.add(d);
  return d;
}

/** Balizas: base + plato giratorio + anillo de estado (glow). */
function placeBeacons(group, mats, list, grid) {
  return list.map(p => {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]);
    const base = new THREE.Mesh(M.buildBeacon(), mats.body); base.castShadow = true;
    const dish = new THREE.Mesh(M.buildBeaconDish(), mats.body); dish.position.y = 7;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb13b, transparent: true, opacity: 0.85, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.35, 6, 28), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 2;
    g.add(base, dish, ring); group.add(g);
    if (grid) grid.add(p[0], p[1] - 2, p[2], 3.5);
    return { group: g, dish, ring, ringMat, pos: new THREE.Vector3(p[0], p[1] + 4, p[2]), scanned: false, progress: 0, link: -1, pulse: 0 };
  });
}
/** Torretas aliadas: base fija, cabeza que gira y anillo de activación. */
function placeTurrets(group, mats, list, grid, onStation = false) {
  return list.map(p => {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]);
    const base = new THREE.Mesh(M.buildTurretBase(), mats.body); base.castShadow = true;
    const head = new THREE.Mesh(M.buildTurretHead(), mats.body); head.position.y = 2.6; head.scale.setScalar(0.35);
    const rock = onStation ? null : new THREE.Mesh(M.buildAsteroid(3.3), mats.rock);
    if (rock) { rock.scale.set(14, 9, 14); rock.position.y = -10; g.add(rock); }
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x5ab0ff, transparent: true, opacity: 0.8, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.45, 6, 32), ringMat); ring.position.y = 18;
    g.add(base, head, ring); group.add(g);
    if (grid && rock) grid.add(p[0], p[1] - 10, p[2], 11);
    return { group: g, head, ring, ringMat, pos: new THREE.Vector3(p[0], p[1] + 3, p[2]), ringPos: new THREE.Vector3(p[0], p[1] + 18, p[2]), active: false, boot: 0, cd: 0, aim: null };
  });
}
/** Docks de reparación: marco con anillo y 4 brazos que se cierran. */
function placeDocks(group, mats, list) {
  return list.map(p => {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]);
    const frame = new THREE.Mesh(M.buildDockFrame(), mats.body); frame.castShadow = true; g.add(frame);
    const arms = [];
    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group(); const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      piv.position.set(Math.cos(a) * 13.5, Math.sin(a) * 13.5, 0); piv.rotation.z = a - Math.PI / 2;
      const arm = new THREE.Mesh(M.buildDockArm(), mats.body); arm.rotation.x = 0; piv.add(arm); g.add(piv); arms.push(piv);
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x5bff9a, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const field = new THREE.Mesh(new THREE.CircleGeometry(10, 28), lightMat); g.add(field);
    group.add(g);
    return { group: g, arms, field, lightMat, pos: new THREE.Vector3(p[0], p[1], p[2]), used: false, busy: 0, armK: 0 };
  });
}
/** Cápsulas de rescate con luz intermitente. */
function placeCapsules(group, mats, ownMats, list, dotTex) {
  const lm = new THREE.SpriteMaterial({ map: dotTex, color: 0xff9a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  ownMats.push(lm);
  return list.map(p => {
    const g = new THREE.Group(); g.position.set(p[0], p[1], p[2]);
    const m = new THREE.Mesh(M.buildCapsule(), mats.body); m.scale.setScalar(1.4); g.add(m);
    const light = new THREE.Sprite(lm); light.scale.setScalar(3.2); light.position.y = 2.6; g.add(light);
    group.add(g);
    return { group: g, mesh: m, light, pos: new THREE.Vector3(p[0], p[1], p[2]), taken: false, revealed: false };
  });
}
