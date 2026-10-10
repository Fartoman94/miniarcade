// @ts-check
/* Granja de Runas — seres con comportamiento: topos traviesos, cuervos roba-semillas, espíritus del clima,
   animales de la granja y vecinos del pueblo con rutinas. Todo con pools (sin crear objetos por cuadro). */
import * as THREE from 'three';
import { rng } from '../../matelabs/kit3d.js';
import * as M from './models.js';
import { PLOT_POS, DECOR_POS, MARKET, FOREST } from './world.js';
import { ANIMALS } from './data.js';

const TAU = Math.PI * 2;

/** @param {any} G contexto del juego */
export function createCritters(G) {
  const r = rng(777);
  const farm = G.scenes.granja.group, market = G.scenes.mercado.group, forest = G.scenes.bosque.group;

  /* ---------------- topos traviesos ---------------- */
  const moles = [0, 1].map(() => {
    const m = M.makeMole(), mound = M.makeMound();
    m.visible = mound.visible = false; farm.add(m, mound);
    return { on: false, st: '', t: 0, plot: -1, x: 0, z: 0, mesh: m, mound, bite: 0 };
  });
  /* ---------------- cuervos ---------------- */
  const shadowGeo = new THREE.CircleGeometry(0.7, 14); shadowGeo.rotateX(-Math.PI / 2);
  const crows = [0, 1].map(() => {
    const c = M.makeCrow(), sh = new THREE.Mesh(shadowGeo, M.MAT.shadow.clone());
    c.group.visible = sh.visible = false; farm.add(c.group, sh);
    return { on: false, st: '', t: 0, plot: -1, x: 0, y: 0, z: 0, a: 0, mesh: c.group, wings: c.wings, shadow: sh };
  });
  /* ---------------- espíritus del clima ---------------- */
  const spirits = [0, 1, 2].map(i => {
    const sol = M.makeSpirit('sol'), hel = M.makeSpirit('helada');
    sol.group.visible = hel.group.visible = false;
    return { on: false, type: 'sol', st: '', t: 0, life: 0, plot: -1, x: 0, z: 0, tx: 0, tz: 0, calm: 0, scene: '', sol, hel, mesh: sol.group, halo: sol.halo };
  });
  /* ---------------- animales de la granja ---------------- */
  const animals = /** @type {Record<string, any>} */ ({});
  for (const k of Object.keys(ANIMALS)) {
    const m = M.makeAnimal(/** @type {any} */ (k)); m.visible = false; farm.add(m);
    const prod = M.makeProduct(ANIMALS[k].product); prod.visible = false; farm.add(prod);
    animals[k] = { key: k, mesh: m, prod, x: 14 + Object.keys(animals).length * 2.5, z: 2, tx: 15, tz: 2, t: 0, hop: 0, yaw: 0 };
  }
  // cabrita perdida del bosque (antes de adoptarla)
  const lostGoat = M.makeAnimal('cabra'); lostGoat.position.set(FOREST.cabra[0], 0, FOREST.cabra[1]); forest.add(lostGoat);

  /* ---------------- vecinos del pueblo con rutina ---------------- */
  const NPCS = [
    { id: 'tito', name: 'Don Tito', role: 'Semillas', look: { hat: 'straw', hatColor: 0xd9b04a, top: 0x6aa84f, bottom: 0x3e6aa8, beard: true, hair: 0x9a9a9a },
      plan: [[6, 'post'], [12, 'fuente'], [13.5, 'post'], [19.5, 'home']], post: [-11.6, -7.7], fuente: [-2.6, 3.1], home: 0 },
    { id: 'ines', name: 'Inés la herrera', role: 'Herrería', look: { hat: 'scarf', hatColor: 0xd9483b, top: 0x8a6a52, bottom: 0x4a4a55, apron: true, hair: 0x2b1b12 },
      plan: [[6, 'home'], [7.5, 'post'], [12.5, 'fuente'], [14, 'post'], [20, 'home']], post: [11.4, 6.8], fuente: [2.9, 2.4], home: 1 },
    { id: 'rosa', name: 'Abuela Rosa', role: 'Refugio y decoración', look: { hat: 'scarf', hatColor: 0xb197fc, top: 0xf59ac0, skirt: true, hair: 0xe0e0e0, apron: true },
      plan: [[6, 'post'], [11, 'deco'], [15, 'banco'], [16.5, 'post'], [20, 'home']], post: [-7, 8.4], deco: [-6.2, 10.6], banco: [6.6, 2.9], home: 2 },
    { id: 'tomas', name: 'Tomás', role: 'Almacén', look: { hat: 'cap', hatColor: 0xf08a24, top: 0xf4ecd8, bottom: 0x5a3a26, apron: true, hair: 0x6b3b1f },
      plan: [[6, 'post'], [13, 'fuente'], [14, 'post'], [21, 'home']], post: [11, -7.7], fuente: [2.4, -3.1], home: 3 },
  ];
  const npcs = NPCS.map((d, i) => {
    const p = M.makePerson(/** @type {any} */ (d.look));
    market.add(p.group);
    const home = MARKET.homes[d.home];
    return { ...d, p, x: d.post[0], z: d.post[1], yaw: 0, spot: 'post', walk: 0, homeXY: [home[0], home[1] + (home[1] < 0 ? 3 : -3)] };
  });

  /* ---------------- utilidades ---------------- */
  const plots = () => G.s.plots;
  const near = (x, z, d) => Math.hypot(G.player.x - x, G.player.z - z) < d;
  const protectedPlot = i => G.s.decor.some((d, k) => d === 'espantapajaros' && Math.hypot(DECOR_POS[k][0] - PLOT_POS[i][0], DECOR_POS[k][1] - PLOT_POS[i][1]) < 7.5);
  const dayTime = () => G.s.min >= 420 && G.s.min < 1230;
  const maxOf = () => (G.diffKey === 'dificil' || G.diffKey === 'extremo') ? 2 : 1;
  let pestT = 25, crowT = 18, spiritT = 40, forestSpiritT = 6;
  function targeted(i) { return moles.some(m => m.on && m.plot === i) || crows.some(c => c.on && c.plot === i) || spirits.some(s => s.on && s.plot === i); }
  function pick(list) { return list.length ? list[Math.floor(r() * list.length)] : -1; }

  function spawnPest(force = false) {
    const cand = []; plots().forEach((p, i) => { if (p.s === 'cultivo' && p.g >= 0.25 && p.g < 1 && !targeted(i)) cand.push(i); });
    if (force && !cand.length) plots().forEach((p, i) => { if (p.s === 'cultivo' && !targeted(i)) cand.push(i); });
    const i = pick(cand), m = moles.find(q => !q.on);
    if (i < 0 || !m) return false;
    Object.assign(m, { on: true, st: 'dig', t: 0, plot: i, x: PLOT_POS[i][0] + 1.05, z: PLOT_POS[i][1] + 0.9, bite: 0 });
    m.mound.position.set(m.x, 0, m.z); m.mound.visible = true; m.mesh.visible = false;
    G.sfx('dig');
    return true;
  }
  function spawnCrow(force = false) {
    const cand = []; plots().forEach((p, i) => { if (p.s === 'cultivo' && p.g < 0.25 && !targeted(i) && !protectedPlot(i)) cand.push(i); });
    const i = pick(cand), c = crows.find(q => !q.on);
    if (i < 0 || !c) return false;
    Object.assign(c, { on: true, st: 'circle', t: 0, plot: i, a: r() * TAU, y: 7 });
    c.mesh.visible = true; c.shadow.visible = false;
    G.sfx('caw');
    return true;
  }
  function spawnSpirit(scene, force = false) {
    const s = spirits.find(q => !q.on);
    if (!s) return false;
    const type = r() < 0.5 ? 'sol' : 'helada';
    s.sol.group.visible = s.hel.group.visible = false;
    const parent = scene === 'bosque' ? forest : farm;
    s.mesh = type === 'sol' ? s.sol.group : s.hel.group; s.halo = type === 'sol' ? s.sol.halo : s.hel.halo;
    parent.add(s.mesh);
    const b = G.scenes[scene].bounds;
    const sx = scene === 'bosque' ? -18 + r() * 34 : (r() < 0.5 ? -20 : 20), sz = scene === 'bosque' ? -16 + r() * 32 : -14 + r() * 26;
    Object.assign(s, { on: true, type, st: 'drift', t: 0, life: 42, plot: -1, x: sx, z: sz, tx: sx, tz: sz, calm: 0, scene });
    s.mesh.visible = true; s.mesh.position.set(sx, 2.4, sz);
    void b;
    return true;
  }

  /* ---------------- interactuables dinámicos ---------------- */
  const dyn = [];
  moles.forEach((m, k) => dyn.push({ id: 'topo' + k, kind: 'pest', get x() { return m.x; }, get z() { return m.z; }, r: 1.9, y: 0.8, scene: 'granja',
    live: () => m.on && (m.st === 'dig' || m.st === 'eat'), label: () => '🐾 Espantar al topo travieso', act: () => shooPest(m) }));
  crows.forEach((c, k) => dyn.push({ id: 'cuervo' + k, kind: 'crow', get x() { return PLOT_POS[c.plot] ? PLOT_POS[c.plot][0] : 0; }, get z() { return PLOT_POS[c.plot] ? PLOT_POS[c.plot][1] : 0; }, r: 2.4, y: 1, scene: 'granja',
    live: () => c.on && (c.st === 'dive' || c.st === 'peck'), label: () => '🐦‍⬛ ¡Ahuyentar al cuervo!', act: () => shooCrow(c) }));
  spirits.forEach((s, k) => dyn.push({ id: 'espiritu' + k, kind: 'spirit', get x() { return s.x; }, get z() { return s.z; }, r: 2.4, y: 2.4, hold: 1.2, get scene() { return s.scene; },
    live: () => s.on && s.st !== 'gone' && s.st !== 'caught', label: () => `${s.type === 'sol' ? '☀️' : '❄️'} Calmar al espíritu (mantené)`, act: () => {}, holdTick: (dt) => calmTick(s, dt), holdLevel: () => s.calm / 1.2 }));
  for (const a of Object.values(animals)) dyn.push({ id: 'animal_' + a.key, kind: 'animal', get x() { return a.x; }, get z() { return a.z; }, r: 1.9, y: 1, scene: 'granja',
    live: () => G.s.animals[a.key].own, label: () => G.animalLabel(a.key), act: () => G.animalAct(a.key, a) });
  dyn.push({ id: 'cabrita', kind: 'goat', x: FOREST.cabra[0], z: FOREST.cabra[1], r: 2.0, y: 1, scene: 'bosque', live: () => !G.s.animals.cabra.own,
    label: () => G.s.inv.zanahoria > 0 || G.s.inv.forraje > 0 ? '🐐 Convidarle comida y adoptarla' : '🐐 Cabrita perdida (traele forraje o una zanahoria)', act: () => G.adoptGoat() });
  for (const k of ['gallina', 'oveja']) dyn.push({ id: 'adoptar_' + k, kind: 'adopt', x: G.scenes.mercado.anchors.adopt[k].position.x, z: G.scenes.mercado.anchors.adopt[k].position.z, r: 2.2, y: 1, scene: 'mercado',
    live: () => !G.s.animals[k].own, label: () => `${ANIMALS[k].icon} Adoptar a ${ANIMALS[k].name} (${ANIMALS[k].price} 🪙)`, act: () => G.adopt(k) });
  for (const n of npcs) dyn.push({ id: 'npc_' + n.id, kind: 'npc', get x() { return n.x; }, get z() { return n.z; }, r: 3.0, y: 1.9, scene: 'mercado',
    live: () => n.spot !== 'home' || n.walk > 0, label: () => `💬 Hablar con ${n.name}`, act: () => G.talk(n) });

  function shooPest(m) { if (!m.on || m.st === 'flee') return; m.st = 'flee'; m.t = 0; m.mesh.visible = true; G.s.stats.shooPest++; G.sfx('shoo'); G.pop('¡Fuera, topo!', m.x, 1.4, m.z, '#ffd8a8'); G.burst(m.x, 0.4, m.z, 0x8a6a52, 10); }
  function shooCrow(c) { if (!c.on || c.st === 'flee' || c.st === 'leave') return; c.st = 'flee'; c.t = 0; G.s.stats.shooCrow++; G.sfx('caw'); G.pop('¡Shu, shu!', c.x, c.y + 1, c.z, '#e7f5ff'); }
  function calmTick(s, dt) {
    if (!s.on || s.st === 'caught') return;
    s.calm += dt;
    if (s.calm >= 1.2) {
      s.st = 'caught'; s.t = 0;
      G.s.inv.rocio++; G.s.stats.calm++;
      G.sfx('chime'); G.pop('+1 💧 rocío de espíritu', s.x, 2.8, s.z, '#a5e3ff'); G.burst(s.x, 2.4, s.z, s.type === 'sol' ? 0xffd27a : 0xa5e3ff, 18);
      G.tut && G.tut('calm');
    }
  }

  /* ---------------- actualización ---------------- */
  const tmp = new THREE.Vector3();
  function update(dt, t) {
    const scene = G.sceneName, storm = G.stormActive();
    const pm = G.D.pest;
    if (scene === 'granja' && !storm && G.mode === 'play') {
      if (dayTime()) {
        pestT -= dt; crowT -= dt; spiritT -= dt;
        const n = maxOf();
        if (pestT <= 0) { pestT = 46 * pm; if (moles.filter(m => m.on).length < n) spawnPest(); }
        if (crowT <= 0) { crowT = 34 * pm; if (crows.filter(c => c.on).length < n) spawnCrow(); }
        if (spiritT <= 0) { spiritT = 62 * pm; if (spirits.filter(s => s.on && s.scene === 'granja').length < n) spawnSpirit('granja'); }
      }
    }
    if (scene === 'bosque' && G.mode === 'play') {
      forestSpiritT -= dt;
      if (forestSpiritT <= 0) { forestSpiritT = 16; if (spirits.filter(s => s.on && s.scene === 'bosque').length < 2) spawnSpirit('bosque'); }
    }
    // topos
    for (const m of moles) {
      if (!m.on) continue;
      m.t += dt;
      const p = plots()[m.plot];
      if (m.st === 'dig') {
        m.mound.scale.set(1 + Math.sin(t * 22) * 0.12, 1 + Math.sin(t * 17) * 0.25, 1);
        if (m.t > 2.6) { m.st = 'eat'; m.t = 0; m.mesh.visible = true; }
      } else if (m.st === 'eat') {
        m.mesh.position.set(m.x, -0.1 + Math.abs(Math.sin(t * 9)) * 0.12, m.z);
        m.mesh.rotation.y = Math.atan2(PLOT_POS[m.plot][0] - m.x, PLOT_POS[m.plot][1] - m.z);
        m.bite += dt;
        if (m.bite > 3 && p && p.s === 'cultivo') { m.bite = 0; p.g = Math.max(0.25, p.g - 0.08); G.refreshPlot(m.plot, true); G.pop('ñam ñam', m.x, 1.2, m.z, '#ffd8a8'); G.sfx('nibble'); }
        if (m.t > 18 || !p || p.s !== 'cultivo') { m.st = 'flee'; m.t = 0; }
      } else if (m.st === 'flee') {
        m.mesh.position.set(m.x, Math.sin(Math.min(1, m.t / 0.7) * Math.PI) * 1.2 - m.t * 0.6, m.z);
        m.mesh.rotation.y += dt * 12;
        if (m.t > 1.0) { m.on = false; m.mesh.visible = m.mound.visible = false; }
      }
    }
    // cuervos
    for (const c of crows) {
      if (!c.on) continue;
      c.t += dt;
      const P = PLOT_POS[c.plot], p = plots()[c.plot];
      const flap = Math.sin(t * (c.st === 'peck' ? 4 : 14)) * (c.st === 'peck' ? 0.15 : 0.7);
      c.wings[0].rotation.z = flap; c.wings[1].rotation.z = -flap;
      if (c.st === 'circle') {
        c.a += dt * 1.3; c.x = P[0] + Math.cos(c.a) * 6; c.z = P[1] + Math.sin(c.a) * 6; c.y = 7;
        if (c.t > 3) { c.st = 'dive'; c.t = 0; c.shadow.visible = true; }
      } else if (c.st === 'dive') {
        const k = Math.min(1, c.t / G.D.telegraph);
        c.a += dt * 1.3 * (1 - k); const rad = 6 * (1 - k);
        c.x = P[0] + Math.cos(c.a) * rad; c.z = P[1] + Math.sin(c.a) * rad; c.y = 0.35 + 6.6 * (1 - k) * (1 - k);
        c.shadow.position.set(P[0], 0.3, P[1]); c.shadow.scale.setScalar(0.4 + k * 1.1);
        /** @type {any} */ (c.shadow.material).opacity = 0.15 + k * 0.35;
        if (near(P[0], P[1], 2.8)) shooCrow(c);
        else if (k >= 1) { c.st = 'peck'; c.t = 0; }
      } else if (c.st === 'peck') {
        c.y = 0.35 + Math.abs(Math.sin(t * 10)) * 0.08;
        if (near(P[0], P[1], 2.8)) shooCrow(c);
        else if (c.t > 2.6) {
          if (p && p.s === 'cultivo' && p.g < 0.25) { p.s = 'vacia'; p.crop = ''; p.g = 0; G.s.stats.cropsLost++; G.refreshPlot(c.plot, true); G.pop('¡Se llevó la semilla!', P[0], 1.6, P[1], '#ffb4a8'); G.sfx('steal'); }
          c.st = 'leave'; c.t = 0;
        }
      } else { // flee / leave
        c.y += dt * (c.st === 'flee' ? 7 : 4); c.x += Math.cos(c.a) * dt * 9; c.z += Math.sin(c.a) * dt * 9;
        c.shadow.visible = false;
        if (c.t > 2.2) { c.on = false; c.mesh.visible = false; }
      }
      if (c.on) { c.mesh.position.set(c.x, c.y, c.z); c.mesh.rotation.y = c.st === 'peck' ? 0.5 : -c.a + (c.st === 'circle' || c.st === 'dive' ? 0 : Math.PI / 2); }
    }
    // espíritus
    for (const s of spirits) {
      if (!s.on) continue;
      s.t += dt;
      if (s.scene !== scene) { s.mesh.visible = false; continue; }
      s.mesh.visible = true;
      if (s.st === 'caught' || s.st === 'gone') {
        const k = s.t / 0.8; s.mesh.scale.setScalar(Math.max(0.01, 1 - k)); s.mesh.position.y = 2.4 + k * 2;
        if (k >= 1) { s.on = false; s.mesh.visible = false; s.mesh.scale.setScalar(1); s.mesh.removeFromParent(); }
        continue;
      }
      s.life -= dt;
      // calmar: se desvanece si nadie lo sostiene
      s.calm = Math.max(0, s.calm - dt * 0.5);
      if (s.life <= 0) { s.st = 'gone'; s.t = 0; continue; }
      if (scene === 'granja' && s.st === 'drift' && s.plot < 0 && s.t > 1.5) {
        const cand = []; plots().forEach((p, i) => { if (p.s === 'cultivo' && !targeted(i) && (s.type === 'helada' ? !p.frost : p.w > 0)) cand.push(i); });
        const i = pick(cand);
        if (i >= 0) { s.plot = i; s.tx = PLOT_POS[i][0]; s.tz = PLOT_POS[i][1]; }
        else { s.tx = -12 + r() * 14; s.tz = -4 + r() * 9; s.t = 0; }
      } else if (scene === 'bosque' && Math.hypot(s.tx - s.x, s.tz - s.z) < 0.5) { s.tx = -18 + r() * 34; s.tz = -16 + r() * 32; }
      const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
      const speed = s.calm > 0 ? 0.3 : 1.3;
      if (s.st === 'drift') {
        if (d > 0.05) { s.x += dx / d * Math.min(d, speed * dt); s.z += dz / d * Math.min(d, speed * dt); }
        if (s.plot >= 0 && d < 0.4) { s.st = 'cast'; s.t = 0; }
      } else if (s.st === 'cast') {
        s.halo.rotation.z += dt * 6; s.halo.scale.setScalar(1 + Math.min(1, s.t / G.D.telegraph) * 0.6);
        if (s.t > G.D.telegraph) {
          const p = plots()[s.plot];
          if (p && p.s === 'cultivo') {
            if (s.type === 'sol') { p.w = 0; G.pop('☀️ ¡Se secó la tierra!', s.x, 1.6, s.z, '#ffd27a'); }
            else { p.frost = 1; G.pop('❄️ ¡Escarcha! Regá para derretirla', s.x, 1.6, s.z, '#a5e3ff'); }
            G.refreshPlot(s.plot, true); G.sfx(s.type === 'sol' ? 'dry' : 'frost');
            G.burst(s.x, 0.5, s.z, s.type === 'sol' ? 0xffc94d : 0xbfe9ff, 16);
          }
          s.halo.scale.setScalar(1); s.st = 'drift'; s.t = 0; s.plot = -1;
        }
      }
      s.mesh.position.set(s.x, 2.4 + Math.sin(t * 2 + s.life) * 0.25, s.z);
      s.mesh.rotation.y = Math.sin(t * 0.7) * 0.4;
      if (s.st !== 'cast') s.halo.rotation.z += dt * 1.5;
    }
    // animales de la granja
    const C0 = G.scenes.granja.anchors.corral;
    for (const a of Object.values(animals)) {
      const st = G.s.animals[a.key];
      a.mesh.visible = st.own; a.prod.visible = st.own && st.ready;
      if (!st.own) continue;
      a.t -= dt;
      if (a.t <= 0) { a.tx = C0.x0 + r() * (C0.x1 - C0.x0); a.tz = C0.z0 + r() * (C0.z1 - C0.z0); a.t = 3 + r() * 4; }
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.2 && a.hop <= 0) { a.x += dx / d * dt * 0.9; a.z += dz / d * dt * 0.9; a.yaw = Math.atan2(dx, dz); }
      a.hop = Math.max(0, a.hop - dt);
      a.mesh.position.set(a.x, a.hop > 0 ? Math.abs(Math.sin(a.hop * 9)) * 0.45 : Math.abs(Math.sin(t * 6 + a.x)) * (d > 0.2 ? 0.05 : 0), a.z);
      a.mesh.rotation.y = a.yaw;
      if (st.ready) a.prod.position.set(a.x + 0.7, 0, a.z + 0.4);
    }
    lostGoat.visible = !G.s.animals.cabra.own;
    if (lostGoat.visible && scene === 'bosque') { lostGoat.rotation.y = Math.atan2(G.player.x - FOREST.cabra[0], G.player.z - FOREST.cabra[1]); lostGoat.position.y = Math.abs(Math.sin(t * 3)) * 0.08; }
    for (const k of ['gallina', 'oveja']) { const m = G.scenes.mercado.anchors.adopt[k]; m.visible = !G.s.animals[k].own; if (m.visible && scene === 'mercado') { m.rotation.y = Math.sin(t * 0.6 + m.position.x) * 1.2; m.position.y = Math.abs(Math.sin(t * 2.5 + m.position.x)) * 0.06; } }
    // vecinos
    if (scene === 'mercado') updateNpcs(dt, t);
  }

  function spotOf(n) {
    const h = G.s.min / 60;
    let spot = n.plan[0][1];
    for (const [hh, sp] of n.plan) if (h >= hh) spot = sp;
    return spot;
  }
  function placeOf(n, spot) { return spot === 'home' ? n.homeXY : n[spot]; }
  function updateNpcs(dt, t) {
    for (const n of npcs) {
      const spot = spotOf(n);
      const tgt = placeOf(n, spot);
      const dx = tgt[0] - n.x, dz = tgt[1] - n.z, d = Math.hypot(dx, dz);
      n.spot = spot;
      if (d > 0.1) {
        n.walk = 1;
        const sp = Math.min(d, 2.2 * dt);
        n.x += dx / d * sp; n.z += dz / d * sp; n.yaw = Math.atan2(dx, dz);
        // esquivar la fuente
        const fd = Math.hypot(n.x, n.z); if (fd < 3.1) { n.x *= 3.1 / fd; n.z *= 3.1 / fd; }
      } else {
        n.walk = 0;
        // mirar a la jugadora si está cerca
        if (near(n.x, n.z, 5)) n.yaw += (Math.atan2(G.player.x - n.x, G.player.z - n.z) - n.yaw) * Math.min(1, dt * 4);
      }
      const vis = !(spot === 'home' && d <= 0.1);
      n.p.group.visible = vis;
      n.p.group.position.set(n.x, 0, n.z); n.p.group.rotation.y = n.yaw;
      const sw = n.walk ? Math.sin(t * 9 + n.x) * 0.6 : Math.sin(t * 1.5) * 0.05;
      n.p.legs[0].rotation.x = sw; n.p.legs[1].rotation.x = -sw; n.p.arms[0].rotation.x = -sw * 0.8; n.p.arms[1].rotation.x = sw * 0.8;
    }
  }

  function reset() {
    for (const m of moles) { m.on = false; m.mesh.visible = m.mound.visible = false; }
    for (const c of crows) { c.on = false; c.mesh.visible = c.shadow.visible = false; }
    for (const s of spirits) { s.on = false; s.mesh.visible = false; s.mesh.removeFromParent(); }
    pestT = 25; crowT = 18; spiritT = 40; forestSpiritT = 6;
  }
  /** Al llegar a la granja, ubicar las mascotas en el corral. */
  function placeAnimals() {
    const C0 = G.scenes.granja.anchors.corral; let i = 0;
    for (const a of Object.values(animals)) { a.x = C0.x0 + 2 + i * 2.5; a.z = 2 + (i % 2); a.tx = a.x; a.tz = a.z; a.t = 1 + i; i++; }
  }
  function hop(key) { animals[key].hop = 1.2; }

  return {
    update, reset, placeAnimals, hop, dyn, npcs, animals,
    spawn(kind) { return kind === 'pest' ? spawnPest(true) : kind === 'crow' ? spawnCrow(true) : spawnSpirit(G.sceneName === 'bosque' ? 'bosque' : 'granja', true); },
    npcStatus(id) { const n = npcs.find(q => q.id === id); return n ? { spot: n.spot, atPost: n.spot === 'post' && Math.hypot(n.x - n.post[0], n.z - n.post[1]) < 0.6, name: n.name } : null; },
    counts() {
      return { pests: moles.filter(m => m.on).length, crows: crows.filter(c => c.on).length, spirits: spirits.filter(s => s.on).length,
        animals: Object.keys(animals).filter(k => G.s.animals[k].own).length, npcsVisible: npcs.filter(n => n.p.group.visible).length };
    },
    debug() { return { moles: moles.map(m => ({ on: m.on, st: m.st, plot: m.plot })), crows: crows.map(c => ({ on: c.on, st: c.st, plot: c.plot })), spirits: spirits.map(s => ({ on: s.on, st: s.st, type: s.type, scene: s.scene, x: s.x, z: s.z, calm: s.calm })), npcs: npcs.map(n => ({ id: n.id, spot: n.spot, x: +n.x.toFixed(2), z: +n.z.toFixed(2) })) }; },
  };
}
