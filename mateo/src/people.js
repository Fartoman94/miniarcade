// Mateo: Ciudad de Altura — vecinos: caminan por las veredas alrededor de las manzanas, cruzan por las sendas
// peatonales sólo cuando el semáforo lo permite (esperan en la esquina), saludan/festejan cuando Mateo aterriza cerca,
// y los personajes con nombre dan misiones (marcador ! / ? sobre la cabeza). Animación con LOD por distancia.
// V2 P1 — roles y horarios: VECINO (camina), CORREDOR (trota de día), COMERCIANTE (en la puerta de su local mientras
// está abierto), PASEANTE (sentado en un banco de día), vecinos del Barrio del Sol (streaming) y roles dinámicos de los
// incidentes: VÍCTIMA (pide ayuda, espera, agradece) y TESTIGO (señala al villano). Todos reaccionan al peligro: se
// apartan o se cubren cuando hay una pelea o una huida cerca y vuelven a su rutina cuando termina. Nunca reciben daño.
import * as THREE from 'three';
import { buildCharacter, npcStyle } from './rig.js';
import { buildClips, buildExtraClips } from './anims.js';
import { createBubble } from './bubble.js';
import { rng, dampAngle } from './util.js';

function markerTex(ch, bg) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = bg; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#1a1204'; g.font = '900 40px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 35);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createPeople(scene, city, count, { sfx }) {
  const rand = rng(777);
  const group = new THREE.Group(); group.name = 'vecinos'; scene.add(group);
  const E = city.walkE || ((city.roads[1] - city.roads[0] - city.roadWidth) / 2 - city.sidewalk / 2); // línea de caminata (V2: 22,4 m, libre de mobiliario)
  const N = city.roads.length - 1, P = city.roads[1] - city.roads[0], half = city.half;
  const center = i => (i + 0.5) * P - half;
  const clipCache = new Map();
  const people = [];
  const markers = { give: new THREE.SpriteMaterial({ map: markerTex('!', '#ffcf3f'), depthTest: false }), turn: new THREE.SpriteMaterial({ map: markerTex('?', '#6ff3ff'), depthTest: false }) };

  function make(style, x, z) {
    const ch = buildCharacter({ ...style, simpleFace: true });
    const hy = ch.bones.hips.position.y;
    const key = hy.toFixed(3);
    if (!clipCache.has(key)) clipCache.set(key, [...buildClips(hy), ...buildExtraClips(hy)]);
    const clips = clipCache.get(key);
    const mixer = new THREE.AnimationMixer(ch.group);
    const acts = {}; for (const n of ['walk_forward', 'idle_breath', 'idle_look', 'talk', 'celebrate', 'point', 'hit_react', 'jog', 'help_wave', 'cower', 'sit']) { const c = clips.find(k => k.name === n); acts[n] = mixer.clipAction(c); if (n === 'point' || n === 'hit_react') { acts[n].setLoop(THREE.LoopOnce, 1); acts[n].clampWhenFinished = true; } }
    acts.walk_forward.play();
    ch.group.position.set(x, city.curb, z);
    group.add(ch.group);
    return { ch, mixer, acts, anim: 'walk_forward', x, z, y: city.curb, yaw: 0, speed: 1.2 + rand() * 0.4, lodT: 0, react: 0, role: 'vecino', dens: true, sched: true, dyn: null, scared: false, calmT: 0, hurry: 1, adult: !style.child };
  }
  function play(p, n, fade = 0.25) { if (p.anim === n) return; const a = p.acts[n], b = p.acts[p.anim]; a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play(); b.crossFadeTo(a, fade, false); p.anim = n; }
  const walkAnim = p => p.role === 'corredor' ? 'jog' : 'walk_forward';

  /* ---------- peatones que recorren veredas ---------- */
  function spawnWalker(i) {
    const bx = Math.floor(rand() * N), bz = Math.floor(rand() * N);
    const p = make(npcStyle(1000 + i * 37), 0, 0);
    p.kind = 'walker'; p.bx = bx; p.bz = bz; p.corner = Math.floor(rand() * 4); p.cw = rand() < 0.5 ? 1 : -1; p.t = rand();
    p.cross = null; p.wait = 0; p.pause = 0; p.active = true;
    const a = cornerPos(p, p.corner), b = cornerPos(p, (p.corner + p.cw + 4) % 4);
    p.x = a.x + (b.x - a.x) * p.t; p.z = a.z + (b.z - a.z) * p.t;
    p.acts.walk_forward.timeScale = p.speed / 1.2;
    people.push(p); return p;
  }
  const CORN = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  function cornerPos(p, k) { return { x: center(p.bx) + CORN[k][0] * E, z: center(p.bz) + CORN[k][1] * E }; }
  for (let i = 0; i < count; i++) spawnWalker(i);

  /* ---------- V2: roles con horario (corredores, comerciantes, paseantes) ---------- */
  const rr = rng(888);
  const inZone = (x, z) => city.zone ? x >= city.zone.bx0 * P - half && x <= (city.zone.bx1 + 1) * P - half && z >= city.zone.bz0 * P - half && z <= (city.zone.bz1 + 1) * P - half : true;
  const joggers = [], shopkeepers = [], sitters = [];
  function spawnJogger(i) { const p = spawnWalker(2000 + i); p.role = 'corredor'; p.speed = 2.6 + rr() * 0.5; p.acts.jog.timeScale = p.speed / 3.2; return p; }
  function spawnShopkeeper(shop, i) {
    const p = make(npcStyle(3000 + i * 41), 0, 0);
    p.kind = 'comerciante'; p.role = 'comerciante'; p.shop = shop; p.active = true;
    const side = i % 2 ? 1.7 : -1.7;
    p.home = { x: shop.x + shop.nx * 0.45 + (shop.nz ? side : 0), z: shop.z + shop.nz * 0.45 + (shop.nx ? side : 0), yaw: Math.atan2(shop.nx, shop.nz) };
    p.x = p.home.x; p.z = p.home.z; p.yaw = p.home.yaw; p.ch.group.position.set(p.x, p.y, p.z); p.ch.group.rotation.y = p.yaw;
    play(p, 'idle_look', 0); people.push(p); shopkeepers.push(p); return p;
  }
  function spawnSitter(b, i) {
    const p = make(npcStyle(4000 + i * 29), 0, 0);
    p.kind = 'paseante'; p.role = 'paseante'; p.active = true;
    p.home = { x: b.x + Math.sin(b.ry) * 0.05, z: b.z + Math.cos(b.ry) * 0.05, yaw: b.ry };
    p.x = p.home.x; p.z = p.home.z; p.yaw = p.home.yaw; p.ch.group.position.set(p.x, p.y, p.z); p.ch.group.rotation.y = p.yaw;
    play(p, 'sit', 0); people.push(p); sitters.push(p); return p;
  }
  {
    const nJ = Math.max(1, Math.round(count * 0.12)), nS = Math.max(3, Math.round(count * 0.4)), nB = Math.max(2, Math.round(count * 0.2));
    for (let i = 0; i < nJ; i++) spawnJogger(i);
    // comerciantes: primero los locales que dan a la Avenida Prisma (eje comercial de la zona), después el resto
    const ave = city.roads[4], onAve = s => s.nz !== 0 && Math.abs(s.z - ave) < 12;
    const shops = (city.shops || []).filter(s => inZone(s.x, s.z) || onAve(s)).sort((a, b) => (onAve(b) - onAve(a)) || a.x - b.x || a.z - b.z);
    const nAve = shops.filter(onAve).length;
    for (let i = 0; i < nS && shops.length; i++) { const k = i < Math.ceil(nS * 0.6) ? Math.floor(rr() * Math.max(1, Math.min(nAve - i, shops.length))) : Math.floor(rr() * shops.length); spawnShopkeeper(shops.splice(k, 1)[0], i); }
    const benches = (city.benches || []).filter(b => inZone(b.x, b.z)).sort((a, b) => a.x - b.x || a.z - b.z);
    for (let i = 0; i < nB && benches.length; i++) spawnSitter(benches.splice(Math.floor(rr() * benches.length), 1)[0], i);
  }
  /** horarios: fracción visible de cada rol según la hora (los que «se fueron a casa» no se simulan ni dibujan) */
  const SCHED = { vecino: { dia: 1, atardecer: 0.85, noche: 0.45 }, corredor: { dia: 1, atardecer: 0.5, noche: 0 }, comerciante: { dia: 1, atardecer: 1, noche: 0 }, paseante: { dia: 1, atardecer: 0.6, noche: 0 } };
  let phase = 'dia';
  function refresh(p) { const on = (p.dens && p.sched) || !!p.dyn; if (p.kind === 'ambient') return; p.active = on; if (!on) p.ch.group.visible = false; }
  function applySchedule() {
    const groups = {}; for (const p of people) if (SCHED[p.role] && p.kind !== 'named' && p.kind !== 'ambient') (groups[p.role] ||= []).push(p);
    for (const [role, list] of Object.entries(groups)) { const n = Math.round(list.length * SCHED[role][phase]); list.forEach((p, i) => { p.sched = i < n; refresh(p); }); }
  }
  applySchedule();

  /* ---------- V2: peligro, roles dinámicos (víctima/testigo) y globos ---------- */
  let dangers = [], viewDist = 170;
  const helpMat = new THREE.SpriteMaterial({ map: markerTex('!', '#ff6b5a'), depthTest: false });
  function bubbleOf(p) { return p.bubble || (p.bubble = createBubble(p.ch.group, p.adult ? 2.35 : 1.75)); }
  function helpMark(p, on) { if (!p.help && !on) return; if (!p.help) { p.help = new THREE.Sprite(helpMat); p.help.scale.set(0.7, 0.7, 1); p.help.position.y = p.adult ? 2.9 : 2.2; p.help.renderOrder = 9; p.ch.group.add(p.help); } p.help.visible = on; }
  function reverse(p) { p.corner = (p.corner + p.cw + 4) % 4; p.cw = -p.cw; p.waiting = false; p.wantCross = null; }
  /** devuelve true si la reacción reemplaza la rutina en este paso */
  function react(p, dt) {
    let nd = 1e9; for (const g of dangers) { const d = Math.hypot(g.x - p.x, g.z - p.z) - g.r; if (d < nd) nd = d; }
    if (nd < 5) {
      if (!p.scared) { p.scared = true; stats.scared++; p.hurry = 1.8; if ((p.kind === 'walker' || p.kind === 'ambient') && !p.cross) reverse(p); bubbleOf(p).say(rr() < 0.5 ? '¡Uy!' : '¡Cuidado!', 1.4, '#ffe2d6'); }
      p.calmT = 0;
    } else if (p.scared) { p.calmT += dt; if (p.calmT > 2) { p.scared = false; p.hurry = 1; stats.calmed++; } }
    if (!p.scared || p.cross) return false;
    if (nd < 1.5 || p.kind === 'comerciante' || p.kind === 'paseante' || p.kind === 'named') { play(p, 'cower', 0.2); return true; }
    return false;
  }
  function dynUpdate(p, dt) {
    const o = p.dynO || {};
    p.dynT += dt;
    if (o.look) { const t = o.look(); if (t) { p.yaw = dampAngle(p.yaw, Math.atan2(t.x - p.x, t.z - p.z), 5, dt); p.ch.group.rotation.y = p.yaw; } }
    if (p.dyn === 'victima') play(p, p.dynT < 0.8 ? 'hit_react' : 'help_wave', 0.15);
    else if (p.dyn === 'testigo') play(p, p.dynT < 2.5 ? 'point' : 'idle_look', 0.2);
    else if (p.dyn === 'espera') play(p, 'idle_look');
    else if (p.dyn === 'agradecido') { play(p, 'celebrate'); if (p.dynT > (o.sec || 3)) api.release(p); }
  }

  /* ---------- personajes con nombre (misiones) ---------- */
  const named = {};
  function spawnNamed(def) {
    const st = { ...npcStyle(def.seed || 5), ...(def.style || {}) };
    const p = make(st, def.x, def.z);
    p.kind = 'named'; p.id = def.id; p.name = def.name; p.yaw = def.yaw || 0; p.y = def.y ?? city.curb; p.active = true;
    p.ch.group.position.set(def.x, p.y, def.z); p.ch.group.rotation.y = p.yaw;
    play(p, 'idle_look', 0);
    const sp = new THREE.Sprite(markers.give); sp.scale.set(0.8, 0.8, 1); sp.position.set(0, (st.child ? 1.6 : 2.25), 0); sp.renderOrder = 9; p.ch.group.add(sp); p.marker = sp;
    named[def.id] = p; people.push(p);
    return p;
  }

  /* ---------- V2: vecinos del streaming (Barrio del Sol): pasean alrededor de su manzana; pool reutilizable ---------- */
  const ambientPool = [];
  function acquireAmbient(n, { cx, cz, E: e = E, seed = 1 }) {
    const r = rng(seed * 7 + 3), out = [];
    for (let i = 0; i < n; i++) {
      let p = ambientPool.find(q => !q.inUse);
      if (!p) { p = make(npcStyle(5000 + ambientPool.length * 53), 0, 0); p.kind = 'ambient'; ambientPool.push(p); people.push(p); }
      p.inUse = true; p.active = true; p.ch.group.visible = true; p.dyn = null; p.scared = false; p.hurry = 1;
      p.ring = { cx, cz, e }; p.corner = Math.floor(r() * 4); p.cw = r() < 0.5 ? 1 : -1; p.speed = 1.1 + r() * 0.4; p.pause = 0; p.react = 0; p.cross = null; p.wait = 0;
      const a = ringCorner(p, p.corner), b = ringCorner(p, (p.corner + p.cw + 4) % 4), t = r();
      p.x = a.x + (b.x - a.x) * t; p.z = a.z + (b.z - a.z) * t; p.y = city.curb;
      p.ch.group.position.set(p.x, p.y, p.z); p.acts.walk_forward.timeScale = p.speed / 1.2;
      out.push(p);
    }
    return out;
  }
  function releaseAmbient(list) { for (const p of list || []) { if (p.dyn) { p.dyn = null; p.dynO = null; helpMark(p, false); if (p.bubble) p.bubble.hide(); } p.inUse = false; p.active = false; p.ch.group.visible = false; } }
  function ringCorner(p, k) { return { x: p.ring.cx + CORN[k][0] * p.ring.e, z: p.ring.cz + CORN[k][1] * p.ring.e }; }
  function ringWalk(p, dt, d) {
    if (p.react > 0) { p.react -= dt; play(p, 'celebrate'); return; }
    if (p.pause > 0) { p.pause -= dt; play(p, 'idle_look'); return; }
    const b = ringCorner(p, (p.corner + p.cw + 4) % 4), dx = b.x - p.x, dz = b.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.15) { p.corner = (p.corner + p.cw + 4) % 4; if (rand() < 0.2) p.pause = 1.5; return; }
    p.x += dx / dist * Math.min(dist, p.speed * p.hurry * dt); p.z += dz / dist * Math.min(dist, p.speed * p.hurry * dt);
    p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 8, dt);
    p.ch.group.position.set(p.x, p.y, p.z); p.ch.group.rotation.y = p.yaw;
    play(p, 'walk_forward'); void d;
  }

  const stats = { crossStarts: 0, illegalStarts: 0, waits: 0, maxWait: 0, scared: 0, calmed: 0, roles: {} };
  let frame = 0;
  const api = {
    people, named, spawnNamed, acquireAmbient, releaseAmbient, stats, shopkeepers, sitters, joggers,
    /** hora del día: 'dia' | 'atardecer' | 'noche' */
    setSchedule(ph) { if (ph !== phase) { phase = ph; applySchedule(); } },
    get phase() { return phase; },
    setDanger(list) { dangers = list; },
    /** V2: distancia de dibujo de los vecinos según la calidad (los lejanos son diminutos y cuestan vértices con piel) */
    setViewDist(d) { viewDist = d; },
    /** vecinos (también los de nombre) dentro de r: para proteger civiles del combate */
    near(x, z, r) { return people.filter(p => p.active && Math.hypot(p.x - x, p.z - z) < r); },
    /** civil disponible más cercano (para víctima / testigo de un incidente) */
    pick(x, z, maxR, kinds = ['walker', 'ambient'], exclude = null) {
      let best = null, bd = maxR;
      for (const p of people) {
        if (!p.active || p.dyn || p.cross || p.scared || !kinds.includes(p.kind) || p === exclude) continue;
        if (p.kind === 'walker' && p.role === 'corredor') continue;
        const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; }
      }
      return best;
    },
    assign(p, role, o = {}) { p.dyn = role; p.dynT = 0; p.dynO = o; p.waiting = false; p.pause = 0; p.react = 0; p.scared = false; if (o.say) bubbleOf(p).say(o.say, o.sec || 3.5, o.color || '#ffffff'); helpMark(p, !!o.mark); refresh(p); stats.roles[role] = (stats.roles[role] || 0) + 1; },
    release(p) { if (!p || !p.dyn) return; p.dyn = null; p.dynO = null; helpMark(p, false); if (p.home) { p.x = p.home.x; p.z = p.home.z; p.yaw = p.home.yaw; p.ch.group.position.set(p.x, p.y, p.z); p.ch.group.rotation.y = p.yaw; play(p, p.kind === 'paseante' ? 'sit' : 'idle_look'); } refresh(p); },
    say(p, t, sec = 3, color) { bubbleOf(p).say(t, sec, color); },
    setMarker(id, kind) { const p = named[id]; if (!p) return; p.marker.visible = !!kind; if (kind) p.marker.material = markers[kind]; },
    setDensity(n) { while (people.filter(p => p.kind === 'walker' && p.role === 'vecino').length < n) spawnWalker(people.length); let k = 0; for (const p of people) if (p.kind === 'walker' && p.role === 'vecino') { p.dens = k++ < n; refresh(p); } applySchedule(); },
    /** posiciones para que los autos cedan el paso (sólo los que están en la calzada) */
    onRoad() { return people.filter(p => p.active && p.cross).map(p => ({ x: p.x, z: p.z })); },
    update(dt, Pl, frozen) {
      frame++;
      for (const p of people) {
        if (!p.active) continue;
        const dx = Pl ? Pl.pos.x - p.x : 1e3, dz = Pl ? Pl.pos.z - p.z : 1e3, d = Math.hypot(dx, dz);
        p.ch.group.visible = d < viewDist;
        if (p.bubble) p.bubble.tick(dt);
        if (p.dyn) dynUpdate(p, dt);
        else if (!frozen && react(p, dt)) { /* reacción en lugar de la rutina */ }
        else if (p.kind === 'comerciante') { play(p, (Math.floor((performance.now() / 1000 + p.home.x) / 6) % 3) ? 'idle_look' : 'idle_breath'); }
        else if (p.kind === 'paseante') { play(p, 'sit'); }
        else if (p.kind === 'named') {
          if (d < 9) p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 4, dt);
          if (p.talking) play(p, 'talk'); else if (p.react > 0) { p.react -= dt; play(p, 'celebrate'); } else play(p, d < 9 ? 'idle_breath' : 'idle_look');
          p.ch.group.rotation.y = p.yaw;
          p.marker.position.y = (p.marker.userData.y0 ??= p.marker.position.y) + Math.sin(performance.now() * 0.004) * 0.08;
        } else if (p.kind === 'ambient') { if (!frozen) ringWalk(p, dt, d); }
        else if (!frozen) walk(p, dt, d);
        // LOD de animación
        p.lodT += dt;
        const every = d < 40 ? 0 : d < 90 ? 0.1 : 0.25;
        if (p.ch.group.visible && p.lodT >= every) { p.mixer.update(p.lodT); p.lodT = 0; }
      }
    },
    /** reacción cuando Mateo aterriza cerca */
    cheer(x, z) { for (const p of people) if (p.active && Math.hypot(p.x - x, p.z - z) < 10 && !p.cross) { p.react = 1.6; p.pause = 1.6; } },
    render() { },
    info() { const a = people.filter(p => p.active); return { roles: { vecino: a.filter(p => p.role === 'vecino' && p.kind === 'walker').length, corredor: a.filter(p => p.role === 'corredor').length, comerciante: a.filter(p => p.kind === 'comerciante').length, paseante: a.filter(p => p.kind === 'paseante').length, barrio: a.filter(p => p.kind === 'ambient').length, conNombre: Object.keys(named).length, victima: a.filter(p => p.dyn === 'victima' || p.dyn === 'espera').length, testigo: a.filter(p => p.dyn === 'testigo').length }, scared: a.filter(p => p.scared).length, phase, count: a.filter(p => p.kind === 'walker').length, ambient: a.filter(p => p.kind === 'ambient').length, ambientPool: ambientPool.length, named: Object.keys(named), crossing: a.filter(p => p.cross).length, waiting: a.filter(p => p.waiting).length, stats: { ...stats }, list: a.map(p => ({ kind: p.kind, id: p.id || '', x: +p.x.toFixed(2), z: +p.z.toFixed(2), cross: !!p.cross })) }; },
  };
  function walk(p, dt, d) {
    if (p.react > 0) { p.react -= dt; play(p, 'celebrate'); return; }
    if (p.pause > 0) { p.pause -= dt; play(p, d < 12 ? 'idle_look' : 'idle_breath'); return; }
    let tx, tz;
    if (p.cross) {
      // cruzando: si el semáforo cambia a mitad de camino, termina de cruzar
      tx = p.cross.x; tz = p.cross.z;
    } else {
      const nk = (p.corner + p.cw + 4) % 4, b = cornerPos(p, nk);
      tx = b.x; tz = b.z;
    }
    const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    if (dist < 0.15) {
      if (p.cross) { p.bx = p.cross.bx; p.bz = p.cross.bz; p.corner = p.cross.corner; p.cross = null; p.y = city.curb; }
      else {
        p.corner = (p.corner + p.cw + 4) % 4;
        // en la esquina: a veces cruza a la manzana vecina. V2: si el semáforo no lo permite ESPERA en la esquina
        // (antes daba media vuelta y recorría toda la cuadra: casi nunca llegaba a cruzar)
        if (rand() < 0.45) {
          const [sx, sz] = CORN[p.corner];
          const opts = [];
          if (p.bx + sx >= 0 && p.bx + sx < N) opts.push({ bx: p.bx + sx, bz: p.bz, axis: 'z' });
          if (p.bz + sz >= 0 && p.bz + sz < N) opts.push({ bx: p.bx, bz: p.bz + sz, axis: 'x' });
          const o = opts[Math.floor(rand() * opts.length)];
          if (o) { p.wantCross = o; p.waiting = true; p.wait = 0; stats.waits++; }
        }
      }
      return;
    }
    if (p.waiting) { // esperando en la esquina, mirando la calle
      const o = p.wantCross, [sx, sz] = CORN[p.corner];
      if (city.canCross(o.axis)) {
        const k = CORN.findIndex(c => c[0] === (o.bx !== p.bx ? -sx : sx) && c[1] === (o.bz !== p.bz ? -sz : sz));
        p.cross = { bx: o.bx, bz: o.bz, corner: k, x: center(o.bx) + CORN[k][0] * E, z: center(o.bz) + CORN[k][1] * E, axis: o.axis };
        p.wait = 0; p.wantCross = null; p.waiting = false; p.y = 0.02; stats.crossStarts++;
        if (!city.canCross(o.axis)) stats.illegalStarts++;
      } else {
        p.wait += dt; stats.maxWait = Math.max(stats.maxWait, p.wait);
        const ty = o.axis === 'z' ? Math.atan2(o.bx > p.bx ? 1 : -1, 0) : Math.atan2(0, o.bz > p.bz ? 1 : -1);
        p.yaw = dampAngle(p.yaw, ty, 6, dt); p.ch.group.rotation.y = p.yaw;
        play(p, 'idle_look');
        if (p.wait > 40) { p.waiting = false; p.wantCross = null; p.wait = 0; } // se cansa y sigue por su vereda
        return;
      }
      return;
    }
    const sp = p.speed * (p.cross ? 1.25 : 1) * p.hurry;
    p.x += dx / dist * Math.min(dist, sp * dt); p.z += dz / dist * Math.min(dist, sp * dt);
    p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 8, dt);
    p.ch.group.position.set(p.x, p.y, p.z); p.ch.group.rotation.y = p.yaw;
    play(p, walkAnim(p));
    if (d < 3 && rand() < 0.002) sfx.talk();
  }
  return api;
}
