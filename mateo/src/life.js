// Mateo: Ciudad de Altura — V2 P2: vida civil (fases 06/07/08 del kit). Une departamento, vestuario, economía,
// comercios, comida, trabajos del barrio y garaje del kart: interactivos cercanos (aviso + ACCIÓN), pantallas
// (tienda, ropero con vista 3D que gira, heladera, comer, cama, garaje/taller, trabajos, mochila) y el estado de la
// partida. Todo lo que se compra/cobra pasa por la economía (transacciones atómicas e idempotentes).
import * as THREE from 'three';
import { esc } from './util.js';
import { signTexture } from './props.js';

const STEP_R = 1.7;

export function createLife(o) {
  const { DATA, save, ui, scene, world, city, player, clock, economy, wardrobe, home, vehicles, fx, sfx } = o;
  const S = () => save.data;
  const P = () => player.P;
  const ev = (t, d) => { if (o.onEvent) o.onEvent(t, d); }; // V2 P3: la campaña escucha compras, trabajos, pantallas y guardados
  const items = DATA.shops.items;
  const storeById = Object.fromEntries(DATA.shops.stores.map(s => [s.id, s]));
  /** catálogo único: comida/decoración, prendas, karts y mejoras (lo que no está acá no se puede comprar) */
  function catalog(sku) {
    if (items[sku]) return { ...items[sku], sku };
    if (wardrobe.items[sku]) return { ...wardrobe.items[sku], type: 'clothes', icon: '👕', sku };
    if (vehicles.defs[sku]) return { ...vehicles.defs[sku], type: 'vehicle', icon: '🏎', sku };
    if (vehicles.modDefs[sku]) return { ...vehicles.modDefs[sku], type: 'vehicle_mod', icon: '🔧', sku };
    return null;
  }
  const rep = () => Object.values(S().rep).reduce((a, b) => a + Math.max(0, b), 0);
  const ownedClothes = id => !!(wardrobe.items[id] && wardrobe.items[id].start) || S().wardrobe.owned.includes(id);

  /* ---------- lugares: comercios (frente de local real + cartel propio), cartelera, trabajos ---------- */
  function freeSpot(x, z, maxR = 4) {
    for (let r = 0; r <= maxR; r += 0.5) for (let a = 0; a < 6.28; a += r ? 0.5 / r : 7) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, y = Math.max(0, world.groundAt(px, pz, 2));
      if (world.hasFloor(px, pz) && !o.solidAt(px, y + 0.6, pz).length && !o.solidAt(px + 0.3, y + 0.6, pz).length && !o.solidAt(px - 0.3, y + 0.6, pz).length) return { x: px, y, z: pz };
    }
    return { x, y: 0, z };
  }
  const signs = new THREE.Group(); signs.name = 'carteles_comercios'; scene.add(signs);
  const stores = [];
  for (const st of DATA.shops.stores) {
    let spot, sx, sz, ry, n;
    if (st.at.garage) { spot = freeSpot(home.garage.sign.x + 1.2, home.garage.sign.z); stores.push({ st, spot, sign: null }); continue; }
    if (st.at.kiosk) { n = st.at.face; sx = st.at.x; sz = st.at.z + 0.86; spot = freeSpot(st.at.x, st.at.z + 1.9, 2); ry = 0; }
    else {
      const f = city.shops.filter(s => s.nx === st.at.face[0] && s.nz === st.at.face[1]).sort((a, b) => Math.hypot(a.x - st.at.x, a.z - st.at.z) - Math.hypot(b.x - st.at.x, b.z - st.at.z))[0];
      n = [f.nx, f.nz]; sx = f.x + f.nx * 0.07; sz = f.z + f.nz * 0.07; ry = Math.atan2(f.nx, f.nz);
      spot = freeSpot(f.x + f.nx * 2.0, f.z + f.nz * 2.0, 2);
    }
    const tex = signTexture([{ text: st.name.toUpperCase(), size: 46 }, { text: `${st.open[0]}:00 a ${st.open[1]}:00`, size: 26, weight: 600, color: '#ffe27a' }], { w: 512, h: 128, bg: st.type === 'food' ? '#2e8b57' : st.type === 'vehicle' ? '#2f6db0' : st.type === 'decor' ? '#b05a8a' : '#c0392b' });
    const W = st.at.kiosk ? 2.4 : 7.2, H = st.at.kiosk ? 0.6 : 1.3;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex.tex }));
    panel.position.set(sx, st.at.kiosk ? 3.25 : 4.05, sz); panel.rotation.y = ry; signs.add(panel);
    const oc = signTexture([{ text: 'ABIERTO', size: 44, color: '#ffffff' }], { w: 256, h: 64, bg: '#2e8b57' });
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ map: oc.tex, toneMapped: false }));
    lamp.position.set(sx + (n ? n[0] * 0.01 : 0), st.at.kiosk ? 2.85 : 3.35, sz + (n ? n[1] * 0.01 : 0)); lamp.rotation.y = ry; signs.add(lamp);
    stores.push({ st, spot, sign: panel, oc, open: null });
  }
  // cartelera del barrio en el jardín de la casa (trabajos)
  const boardSpot = freeSpot(home.outside.x - 2.2, home.outside.z, 1.5);
  {
    const t = signTexture([{ text: 'CARTELERA DEL BARRIO', size: 34, color: '#1f2c52' }, { text: 'Trabajos y favores · monedas M', size: 22, color: '#2f6db0', weight: 600 }], { w: 512, h: 128, bg: '#fff6dc', border: '#e8b81a' });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a5a32 })); post.position.set(boardSpot.x, boardSpot.y + 0.75, boardSpot.z + 0.5); signs.add(post);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: t.tex, side: THREE.DoubleSide })); b.position.set(boardSpot.x, boardSpot.y + 1.5, boardSpot.z + 0.5); b.rotation.y = Math.PI; signs.add(b);
  }
  // puntos de los trabajos (anclas con nombre → lugares libres reales)
  const doorFront = h => ({ x: h.x, z: h.z - h.d / 2 - 1.4 });
  const vec = city.houses.filter(h => h.block && h.block[0] === 5 && h.block[1] === 4 && h !== home.house && Math.abs(h.z - home.house.z) < 1).sort((a, b) => a.x - b.x).map(doorFront);
  const north = city.houses.filter(h => h.block && h.block[0] === 5 && h.block[1] === 3).sort((a, b) => (b.z - a.z) || (b.x - a.x))[0];
  const pl = city.landmarks.plaza, mercado = stores.find(s => s.st.id === 'mercado_prisma');
  const anchors = {
    tablero: boardSpot,
    puerta_vecina_1: freeSpot(vec[0].x, vec[0].z, 1.5), puerta_vecina_2: freeSpot(vec[1].x, vec[1].z, 1.5),
    puerta_vecina_3: freeSpot(north.x, north.z + north.d / 2 + 1.4, 1.5),
    plaza_regadera: freeSpot(pl.x + 6, pl.z - 6), plaza_planta_1: freeSpot(pl.x - 13, pl.z + 9), plaza_planta_2: freeSpot(pl.x + 12, pl.z + 12), plaza_planta_3: freeSpot(pl.x - 10, pl.z - 13),
    foto_fuente: freeSpot(pl.x + 9, pl.z + 2), foto_avenida: freeSpot(40, 73.5), foto_glicinas: freeSpot(136, 74),
    mercado: mercado.spot,
  };
  // marcador del paso actual del trabajo (columna de luz verde + aro)
  const mk = new THREE.Group(); mk.visible = false; scene.add(mk);
  mk.add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7dffa0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending })));
  mk.children[0].position.y = 20;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7dffa0, toneMapped: false })); ring.position.y = 0.1; mk.add(ring);

  /* ---------- estado ---------- */
  const jobs = Object.fromEntries(DATA.jobs.jobs.map(j => [j.id, j]));
  let job = null; // { id, step }
  let screen = '', preview = false, msg = '', lastBuy = { key: '', t: -1e9, tx: '' };
  const st = { eats: 0, buys: 0, jobsDone: 0, sleeps: 0, modeChanges: 0, washes: 0, sits: 0 };
  const jobState = id => S().jobs[id] || { runs: 0, last: -1e9 };
  const jobReady = id => clock.minutes - jobState(id).last >= jobs[id].cooldownGameMinutes;

  function startJob(id) {
    if (job || !jobs[id] || !jobReady(id)) return false;
    job = { id, step: 0 }; sfx.checkpoint(); ui.toast(`📋 ${jobs[id].name}: ${jobs[id].steps[0].label}`, 2600); return true;
  }
  function jobPoint() { if (!job) return null; const a = anchors[jobs[job.id].steps[job.step].anchor]; return a; }
  function advanceJob() {
    const j = jobs[job.id], a = jobPoint(); fx.sparkle(a.x, a.y + 1, a.z, 0x7dffa0, 10); sfx.checkpoint();
    job.step++;
    if (job.step >= j.steps.length) {
      const s0 = jobState(j.id), runs = s0.runs + 1;
      S().jobs[j.id] = { runs, last: clock.minutes };
      // cobra UNA vez por vuelta: id = trabajo + número de vuelta (reintentos y recargas no vuelven a pagar)
      const paid = economy.earn({ transactionId: `job:${j.id}:${runs}`, credits: j.reward, what: j.name });
      S().rep.centro = (S().rep.centro || 0) + 2; save.flush();
      ui.big('¡TRABAJO CUMPLIDO!', `${j.name.toUpperCase()} · +${paid ? j.reward : 0} M`, 2.4); sfx.win();
      job = null; st.jobsDone++; ev('jobDone', j.id);
    } else ui.toast('✔ ' + j.steps[job.step].label, 2000);
  }

  /* ---------- comida ---------- */
  function eat(sku, from = 'inv') {
    const it = items[sku]; if (!it || it.type !== 'food') return { ok: false, reason: 'no es comida' };
    if (!economy.consume(sku, 1, from)) return { ok: false, reason: 'no tenés' };
    const F = DATA.shops.food, before = P().health, gain = it.energy * F.energyToHealth;
    P().health = Math.min(100, P().health + gain); S().buff.fed = F.buffSeconds; save.flush();
    player.oneShot('celebrate', 0.9); fx.sparkle(P().pos.x, P().pos.y + 1.2, P().pos.z, 0xffd34a, 8); sfx.checkpoint(); st.eats++;
    ui.toast(`${it.icon} ¡Rico! +${Math.round(P().health - before)} de energía · energía extra ${F.buffSeconds} s`, 2400);
    return { ok: true, gain: P().health - before };
  }

  /* ---------- modo civil / héroe ---------- */
  function setMode(m, silent = false) {
    if (vehicles.driving && m === 'hero') { if (!silent) ui.toast('Bajá del kart para ponerte el traje', 1800); return false; }
    if (!wardrobe.setMode(m)) return false;
    S().mode = wardrobe.mode; P().civil = wardrobe.mode === 'civil'; save.flush(); st.modeChanges++;
    if (!silent) {
      player.oneShot('double_jump', 0.45); fx.ring(P().pos.x, P().pos.y + 0.05, P().pos.z, wardrobe.mode === 'hero' ? 0xd63031 : 0x7ff6ff, 2.2); fx.sparkle(P().pos.x, P().pos.y + 1, P().pos.z, 0xffffff, 12); sfx.whoosh(0.7);
      ui.toast(wardrobe.mode === 'hero' ? '🦸 ¡Traje M! Súper salto, cable, paredes y combate' : '👕 Ropa civil: caminar, comprar, trabajos y kart', 2200);
    }
    return true;
  }
  const toggleMode = () => setMode(wardrobe.mode === 'hero' ? 'civil' : 'hero');

  /* ---------- compras ---------- */
  function priceOf(store, sku) { const p = store.products.find(x => x.sku === sku); return p ? p.price : null; }
  /** compra con un id de transacción (el botón trae el suyo: un doble clic no cobra dos veces) */
  function buy(storeId, sku, tx) {
    const store = storeById[storeId]; if (!store) return { ok: false, reason: 'unknown' };
    if (!clock.isOpen(store.open)) return { ok: false, reason: 'closed' };
    const price = priceOf(store, sku); if (price === null) return { ok: false, reason: 'unknown' };
    const def = catalog(sku); if (!def) return { ok: false, reason: 'unknown' };
    let to = 'none', apply = null;
    if (def.type === 'food') to = 'inv';
    else if (def.type === 'clothes') { if (ownedClothes(sku)) return { ok: false, reason: 'owned' }; apply = () => S().wardrobe.owned.push(sku); }
    else if (def.type === 'furniture') { if (S().home.decor.includes(sku)) return { ok: false, reason: 'owned' }; apply = () => { S().home.decor.push(sku); home.setDecor(S().home.decor); }; }
    else if (def.type === 'vehicle') { if (S().cars.owned.some(c => c.sku === sku)) return { ok: false, reason: 'owned' }; if (S().cars.owned.length >= DATA.vehicles.garage.slots) return { ok: false, reason: 'garage_full' }; apply = () => vehicles.addOwned(sku); }
    else if (def.type === 'vehicle_mod') {
      const c = S().cars.owned.find(x => x.uid === S().cars.active); if (!c) return { ok: false, reason: 'no_car' };
      if (sku === 'reparacion' ? c.health >= 100 : sku !== 'pintura_metalizada' && c.mods.includes(sku)) return { ok: false, reason: 'owned' };
      const pal = DATA.vehicles.paints, next = pal[(pal.indexOf(c.color || vehicles.defs[c.sku].color) + 1) % pal.length];
      apply = () => vehicles.applyMod(sku, sku === 'pintura_metalizada' ? next : null);
    }
    const r = economy.buy({ transactionId: tx, sku, price, quantity: 1, to, apply, what: `${def.name || sku} (${store.name})` });
    if (r.ok && !r.duplicate) { st.buys++; sfx.checkpoint(); ev('buy', { sku, store: storeId, type: def.type }); }
    return r;
  }
  const REASON = { funds: 'No te alcanzan las monedas', closed: 'Está cerrado', owned: 'Ya lo tenés', garage_full: 'El garaje está lleno (3 lugares)', no_car: 'Primero necesitás un kart', unknown: 'Ese producto no existe', invalid: 'Compra inválida', full: 'La mochila está llena de eso' };

  /* ---------- pantallas ---------- */
  const money = () => `<span class="pill">🪙 ${economy.balance} M</span>`;
  const food = where => Object.entries(S()[where]).filter(([k]) => items[k] && items[k].type === 'food');
  const row = (icon, name, sub, btns) => `<li class="lrow"><span class="ic">${icon}</span><span class="tx"><b>${esc(name)}</b>${sub ? `<br><small>${sub}</small>` : ''}</span><span class="bt">${btns}</span></li>`;
  const btn = (attrs, label, alt = false, dis = false) => `<button class="b sm${alt ? ' alt' : ''}"${dis ? ' disabled' : ''} ${attrs}>${label}</button>`;
  function render() {
    const s = S(); let h = '';
    const note = msg ? `<p class="msg">${esc(msg)}</p>` : '';
    if (screen.startsWith('shop:')) {
      const store = storeById[screen.slice(5)], open = clock.isOpen(store.open);
      h = `<h2>${esc(store.name)}</h2><p class="small">${open ? 'Abierto' : 'Cerrado'} · ${store.open[0]}:00 a ${store.open[1]}:00 · ${money()}</p>${note}<ul class="list llist">` + store.products.map(p => {
        const d = catalog(p.sku), have = d.type === 'food' ? `tenés ${economy.count(p.sku)}` : d.type === 'clothes' ? (ownedClothes(p.sku) ? 'ya la tenés' : 'prenda') : d.type === 'furniture' ? (s.home.decor.includes(p.sku) ? 'ya está en tu casa' : 'para tu departamento') : d.type === 'vehicle' ? (s.cars.owned.some(c => c.sku === p.sku) ? 'ya es tuyo' : `velocidad ${d.speed} · ${d.style}`) : esc(d.name);
        return row(d.icon, d.name || p.sku, `${p.price} M · ${have}${d.energy ? ` · +${d.energy * DATA.shops.food.energyToHealth} energía` : ''}`, btn(`data-l="buy" data-store="${store.id}" data-sku="${p.sku}" data-tx="${economy.newTx('buy')}"`, 'Comprar', false, !open || economy.balance < p.price));
      }).join('') + `</ul>`;
    } else if (screen === 'wardrobe') {
      const c = wardrobe.civil, slot = (k, t) => `<div class="wslot"><b>${t}</b><div class="chips">${DATA.wardrobe.civil[k].filter(i => ownedClothes(i.id)).map(i => `<button class="chip${c[k] === i.id ? ' on' : ''}" data-l="equip" data-id="${i.id}"><i style="background:${i.color || '#555'}"></i>${esc(i.name)}</button>`).join('')}</div></div>`;
      h = `<h2>ROPERO</h2><div class="btns">${btn('data-l="mode" data-m="civil"', '👕 Ropa civil', wardrobe.mode !== 'civil')}${btn('data-l="mode" data-m="hero"', '🦸 Traje de héroe', wardrobe.mode !== 'hero')}</div>${note}
        ${slot('top', 'Remera / buzo')}${slot('pants', 'Pantalón')}${slot('shoes', 'Zapatillas')}${slot('accessory', 'Accesorio')}
        <div class="wslot"><b>Trajes M (reputación ${rep()})</b><div class="chips">${DATA.wardrobe.heroSuits.map(x => { const lock = rep() < x.unlockReputation; return `<button class="chip${wardrobe.suit === x.id ? ' on' : ''}"${lock ? ' disabled' : ''} data-l="suit" data-id="${x.id}"><i style="background:${x.suit};border-color:${x.accent}"></i>${esc(x.name)}${lock ? ` 🔒${x.unlockReputation}` : ''}</button>`; }).join('')}</div></div>
        <p class="small">Girá la vista: Mateo se muestra de frente y da la vuelta. Nada de marcas ni trajes de otros: el traje M es original.</p>`;
    } else if (screen === 'fridge') {
      const list = (where, other, lbl) => food(where).map(([k, n]) => row(items[k].icon, items[k].name, `×${n}`, btn(`data-l="move" data-sku="${k}" data-from="${where}" data-to="${other}"`, lbl, true) + btn(`data-l="eat" data-sku="${k}" data-from="${where}"`, 'Comer'))).join('') || '<li class="lrow"><small>vacía</small></li>';
      h = `<h2>HELADERA</h2>${note}<div class="cols"><div><b>Heladera</b><ul class="list llist">${list('fridge', 'inv', 'A la mochila')}</ul></div><div><b>Mochila</b><ul class="list llist">${list('inv', 'fridge', 'Guardar')}</ul></div></div>`;
    } else if (screen === 'eat' || screen === 'inv') {
      const all = [...food('inv').map(([k, n]) => [k, n, 'inv']), ...(home.inside ? food('fridge').map(([k, n]) => [k, n, 'fridge']) : [])];
      h = `<h2>${screen === 'eat' ? 'COMER ALGO' : 'MOCHILA'}</h2><p class="small">Energía ${Math.round(P().health)}/100 · ${money()}</p>${note}<ul class="list llist">${all.map(([k, n, w]) => row(items[k].icon, items[k].name, `×${n} · ${w === 'inv' ? 'mochila' : 'heladera'} · +${items[k].energy * DATA.shops.food.energyToHealth} energía`, btn(`data-l="eat" data-sku="${k}" data-from="${w}"`, 'Comer'))).join('') || '<li class="lrow"><small>No tenés comida: comprá en el Kiosco de la Plaza o en el Mercado Prisma.</small></li>'}</ul>
        ${screen === 'inv' ? `<p class="small">Últimos movimientos: ${economy.ledger.slice(-4).reverse().map(e => `${e.delta > 0 ? '+' : ''}${e.delta} M ${esc(e.what)}`).join(' · ') || '—'}</p>` : ''}`;
    } else if (screen === 'bed') {
      h = `<h2>CAMA</h2><p>Son las ${clock.label()} del día ${clock.day}. Dormir recupera toda la energía y guarda la partida.</p>${note}<div class="btns" style="flex-direction:column">${btn('data-l="sleep" data-h="8"', '🌅 Dormir hasta la mañana (8:00)')}${btn('data-l="sleep" data-h="20"', '🌙 Dormir hasta la noche (20:00)', true)}${btn('data-l="savegame"', '💾 Sólo guardar', true)}</div>`;
    } else if (screen === 'garage') {
      const cars = s.cars.owned, act = cars.find(c => c.uid === s.cars.active), taller = storeById.taller_urbano, open = clock.isOpen(taller.open), atGarage = Math.hypot(P().pos.x - home.garage.x, P().pos.z - home.garage.z) < 12;
      h = `<h2>GARAJE M</h2><p class="small">${money()} · ${cars.length}/${DATA.vehicles.garage.slots} karts</p>${note}<ul class="list llist">${cars.map(c => row('🏎', vehicles.defs[c.sku].name, `estado ${Math.round(c.health)}% ${c.mods.length ? '· ' + c.mods.map(m => vehicles.modDefs[m].name).join(', ') : ''}`, btn(`data-l="active" data-uid="${c.uid}"`, c.uid === s.cars.active ? '★ Activo' : 'Elegir', c.uid !== s.cars.active))).join('') || '<li class="lrow"><small>Todavía no tenés kart: los venden en «Autos Lumen · Karts».</small></li>'}</ul>
        <div class="btns">${btn('data-l="call"', '📍 Traer el kart al Garaje M', false, !act)}${btn('data-l="store"', '🅿 Guardar en el garaje', true, !vehicles.kart)}</div>
        ${atGarage && act ? `<h3>Taller de la Avenida ${open ? '' : '(cerrado)'}</h3><ul class="list llist">${taller.products.map(p => row('🔧', vehicles.modDefs[p.sku].name, `${p.price} M`, btn(`data-l="buy" data-store="taller_urbano" data-sku="${p.sku}" data-tx="${economy.newTx('buy')}"`, 'Pagar', false, !open || economy.balance < p.price))).join('')}</ul>` : `<p class="small">Las mejoras se hacen en el Taller, junto al Garaje M.</p>`}`;
    } else if (screen === 'jobs') {
      h = `<h2>TRABAJOS DEL BARRIO</h2><p class="small">Favores opcionales para vecinos · pagan monedas M · ${money()}</p>${note}<ul class="list llist">${DATA.jobs.jobs.map(j => { const js = jobState(j.id), ready = jobReady(j.id), cur = job && job.id === j.id, wait = Math.ceil((j.cooldownGameMinutes - (clock.minutes - js.last)) / 60);
        return row('📋', j.name, `${j.reward} M · hecho ${js.runs} ${js.runs === 1 ? 'vez' : 'veces'}${!ready ? ` · vuelve en ${wait} h` : ''}`, cur ? btn(`data-l="abandon"`, 'Dejar', true) : btn(`data-l="job" data-id="${j.id}"`, 'Hacer', false, !ready || !!job)); }).join('')}</ul>`;
    }
    ui.screen(`<div class="life">${h}<div class="btns"><button class="b" data-l="close">Listo</button></div></div>`);
  }
  function open(kind) { screen = kind; msg = ''; preview = kind === 'wardrobe'; if (preview) P().yaw = home.inside ? Math.PI : P().yaw; o.openScreen(); render(); ev('screen', kind); } // ropero: Mateo se da vuelta hacia la habitación (la cámara lo muestra de frente)
  ui.onScreen('[data-l]', t => {
    if (!screen) return;
    const a = t.getAttribute('data-l'), d = t.dataset;
    msg = '';
    if (a === 'close') { screen = ''; preview = false; o.closeScreen(); return; }
    // V2 P3 (B-25): tras comprar, la tarjeta se redibuja con botones NUEVOS (id de transacción nuevo): el segundo toque de
    // un doble toque caía en el botón nuevo y cobraba otra vez. Un segundo «Comprar» del mismo producto antes de 0,5 s
    // es el mismo gesto: usa el id de la compra anterior (idempotente: no cobra de nuevo)
    if (a === 'buy') { const now = performance.now(), key = d.store + ':' + d.sku; if (lastBuy.key === key && now - lastBuy.t < 500) d.tx = lastBuy.tx; else lastBuy = { key, t: now, tx: d.tx }; }
    if (a === 'buy') { const r = buy(d.store, d.sku, d.tx); msg = r.ok ? (r.duplicate ? 'Ya estaba pagado' : `¡Listo! Te quedan ${economy.balance} M`) : REASON[r.reason] || r.reason; if (r.ok && !r.duplicate && catalog(d.sku).type === 'vehicle') msg += ' · Tu kart te espera en el Garaje M (frente a tu casa)'; }
    else if (a === 'equip') { if (ownedClothes(d.id)) { wardrobe.equip(d.id); S().wardrobe.civil = wardrobe.civil; if (wardrobe.mode !== 'civil') setMode('civil', true); save.flush(); } }
    else if (a === 'suit') { const x = wardrobe.suits[d.id]; if (x && rep() >= x.unlockReputation) { wardrobe.setSuit(d.id); S().wardrobe.suit = d.id; if (wardrobe.mode !== 'hero') setMode('hero', true); save.flush(); } }
    else if (a === 'mode') setMode(d.m, true);
    else if (a === 'move') { if (!economy.move(d.sku, d.from, d.to)) msg = 'No se pudo'; }
    else if (a === 'eat') { const r = eat(d.sku, d.from); msg = r.ok ? `¡Rico! Energía ${Math.round(P().health)}` : r.reason; }
    else if (a === 'sleep') { sleep(+d.h); msg = `¡Buen día! Son las ${clock.label()} · partida guardada`; }
    else if (a === 'savegame') { save.flush(); msg = 'Partida guardada'; ev('saved', {}); }
    else if (a === 'active') { vehicles.setActive(+d.uid); save.flush(); }
    else if (a === 'call') { const r = vehicles.callToGarage(); msg = r.ok ? 'El kart está en el Garaje M, frente a tu casa' : 'No se pudo: ' + r.reason; }
    else if (a === 'store') { const r = vehicles.store(); msg = r.ok ? 'Kart guardado' : 'No se pudo: ' + r.reason; }
    else if (a === 'job') { if (startJob(d.id)) { screen = ''; preview = false; o.closeScreen(); return; } }
    else if (a === 'abandon') { job = null; }
    render();
  });
  function sleep(h) {
    clock.advanceTo(h); S().clock.hour = clock.hour; S().clock.day = clock.day; P().health = 100; st.sleeps++;
    o.applyTime(); save.flush(); sfx.checkpoint();
    ev('sleep', { h }); ev('saved', {});
  }

  /* ---------- interactivos ---------- */
  function targets() {
    const out = [], Pl = P();
    if (vehicles.driving) return [{ id: 'bajar', label: 'Bajar del kart', act: () => o.request('carExit') }];
    for (const t of home.targets()) out.push(t);
    if (home.inside) return out;
    if (vehicles.near(Pl)) out.push({ id: 'kart', label: 'Subir al kart 🏎', x: vehicles.kart.x, y: vehicles.kart.y, z: vehicles.kart.z, r: 2.6, act: () => o.request('carEnter') });
    for (const s of stores) out.push({ id: 'shop:' + s.st.id, label: s.st.at.garage ? 'Garaje M y taller 🔧' : (clock.isOpen(s.st.open) ? `Comprar en ${s.st.name} 🛒` : `${s.st.name}: cerrado (abre ${s.st.open[0]}:00)`), ...s.spot, r: 2.0, act: () => { if (s.st.at.garage) open('garage'); else if (clock.isOpen(s.st.open)) open('shop:' + s.st.id); else { ui.toast(`🔒 ${s.st.name} está cerrado. Abre a las ${s.st.open[0]}:00`, 2000); sfx.denied(); } } });
    out.push({ id: 'tablero', label: 'Cartelera del barrio 📋', ...boardSpot, r: 1.6, act: () => open('jobs') });
    if (job) { const a = jobPoint(), s0 = jobs[job.id].steps[job.step]; out.unshift({ id: 'job', label: s0.prompt, ...a, r: STEP_R, act: advanceJob }); }
    return out;
  }
  function interactTarget() {
    const Pl = P(); let best = null, bd = 1e9;
    for (const t of targets()) {
      if (t.x === undefined) return t;
      const d = Math.hypot(t.x - Pl.pos.x, t.z - Pl.pos.z); if (d < t.r && Math.abs((t.y || 0) - Pl.pos.y) < 2 && d < bd) { bd = d; best = t; }
    }
    // el paso del trabajo tiene prioridad si estás en su radio
    return best;
  }

  let acc = 0;
  const api = {
    catalog, buy, eat, setMode, toggleMode, startJob, open, sleep, stores, anchors, targets, interactTarget,
    get screen() { return screen; }, get preview() { return preview; },
    /** la pantalla se cerró desde afuera (Esc, pausa) */
    forceClose() { screen = ''; preview = false; },
    get job() { return job ? { ...job, point: jobPoint() } : null; },
    get stats() { return { ...st }; },
    /** carga el estado guardado en el modelo y la casa */
    load() { wardrobe.load({ mode: S().mode, civil: S().wardrobe.civil, suit: S().wardrobe.suit }); P().civil = wardrobe.mode === 'civil'; home.setDecor(S().home.decor); },
    update(dt) {
      if (S().buff.fed > 0) S().buff.fed = Math.max(0, S().buff.fed - dt);
      P().regenK = S().buff.fed > 0 ? DATA.shops.food.buffRegenMultiplier : 1;
      acc += dt;
      if (acc > 0.5) { acc = 0; for (const s of stores) if (s.oc) { const op = clock.isOpen(s.st.open); if (op !== s.open) { s.open = op; s.oc.redraw([{ text: op ? 'ABIERTO' : 'CERRADO', size: 44, color: '#ffffff' }], op ? '#2e8b57' : '#7a2f2f'); } } }
      const a = jobPoint(); mk.visible = !!a && !home.inside; if (a) { mk.position.set(a.x, a.y, a.z); ring.rotation.y += dt; }
    },
    objective() {
      if (!job) return null; const j = jobs[job.id], a = jobPoint(), Pl = P();
      return { kind: 'TRABAJO', name: '📋 ' + j.name, step: j.steps[job.step].label, dist: Math.hypot(a.x - Pl.pos.x, a.z - Pl.pos.z), dy: a.y - Pl.pos.y, time: null };
    },
    drawMap(c, X, Y) {
      const hx = home.outside.x, hz = home.outside.z;
      c.fillStyle = '#ffcf3f'; c.fillRect(X(hx) - 6, Y(hz) - 6, 12, 12); c.fillStyle = '#1a1204'; c.font = '900 10px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⌂', X(hx), Y(hz));
      for (const s of stores) { c.fillStyle = clock.isOpen(s.st.open) ? '#7dffa0' : '#888'; c.beginPath(); c.arc(X(s.spot.x), Y(s.spot.z), 4, 0, 7); c.fill(); }
      if (vehicles.kart && !vehicles.driving) { c.fillStyle = '#6ff3ff'; c.fillRect(X(vehicles.kart.x) - 4, Y(vehicles.kart.z) - 3, 8, 6); }
      const a = jobPoint(); if (a) { c.strokeStyle = '#7dffa0'; c.lineWidth = 3; c.beginPath(); c.arc(X(a.x), Y(a.z), 8, 0, 7); c.stroke(); }
    },
    info() { return { mode: wardrobe.mode, balance: economy.balance, inv: { ...S().inv }, fridge: { ...S().fridge }, job: api.job, jobs: { ...S().jobs }, stats: { ...st }, economy: economy.stats, screen, fed: +S().buff.fed.toFixed(1), stores: stores.map(s => ({ id: s.st.id, x: +s.spot.x.toFixed(2), z: +s.spot.z.toFixed(2), open: clock.isOpen(s.st.open) })), anchors: Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }])), rep: rep() }; },
    /** pruebas: completa el paso actual del trabajo como si Mateo llegara y apretara ACCIÓN */
    debugJobStep() { if (job) advanceJob(); },
  };
  return api;
}
