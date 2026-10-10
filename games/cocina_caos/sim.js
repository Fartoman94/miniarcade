// @ts-check
/* Cocina del Caos — reglas de un turno de cocina: estaciones, cocción, pedidos, cinta, platos,
   fuego, derrames, roedores y eventos de caos. El chef y el ayudante usan exactamente las mismas
   funciones (describe / tap / work), así que las pruebas por gancho recorren el camino real. */
import { ING, RECIPES, T, TS, key, ingName, plateable, matchRecipe, orderTime, starsOf } from './config.js';

/** @typedef {{t:'ing', ing:string, st:string} | {t:'plate', items:string[]} | {t:'dirty', n:number} | {t:'ext'}} Item */

let ORDER_ID = 1;
const FIRE_STATIONS = new Set(['counter', 'board', 'oven', 'pot', 'rack', 'trash', 'fridge', 'return', 'sink']);

/**
 * @param {any} K cocina construida (world.buildKitchen)
 * @param {any} opt {D (dificultad), banquet (fase o null), hooks, rand}
 */
export function createSim(K, opt) {
  const D = opt.D, ph = opt.banquet || null, hk = opt.hooks, rand = opt.rand;
  const def = K.def;
  const S = {
    time: ph ? ph.duration : def.duration, duration: ph ? ph.duration : def.duration, elapsed: 0,
    score: 0, served: 0, fails: 0, errors: 0, streak: 0, bestStreak: 0, perfect: 0, burnt: 0, fires: 0, spillsMade: 0, ratsShooed: 0,
    dirtyFlag: false, over: false, won: false, frozen: false,
    orders: /** @type {any[]} */ ([]), nextOrder: def.firstOrder, convItems: /** @type {any[]} */ ([]), returns: /** @type {any[]} */ ([]),
    spills: /** @type {any[]} */ ([]), rats: /** @type {any[]} */ ([]),
    chaos: { next: (ph ? 8 : 22) * D.chaos, idx: 0, pending: /** @type {any} */ (null), zeroG: 0, suction: 0, flare: 0, flareWarn: 0, shake: 0 },
    ratT: def.ratEvery ? def.ratEvery * 0.7 / D.rats : 0,
    wave: { next: 4, telegraph: 0, ids: /** @type {number[]} */ ([]), n: 0, cleared: 0 },
    royalT: 5, recipes: ph ? ph.recipes : def.recipes,
    log: /** @type {string[]} */ ([]),
  };
  const recipePool = S.recipes;
  const rack = K.stations.filter(s => s.type === 'rack');
  const ret = K.stations.find(s => s.type === 'return');
  const extHome = K.stations.find(s => s.id === 'mesada_extintor');
  rack.forEach((r, i) => { r.clean = i === 0 ? def.plates : 0; });
  for (const s of K.stations) { s.item = null; s.prog = 0; s.fire = 0; s.fireHP = 0; s.fireT = 0; s.burnT = 0; s.mark = 0; if (s.pot) Object.assign(s.pot, { ing: '', n: 0, t: 0, state: 'empty' }); if (s.type === 'sink') s.dirty = 0; if (s.type === 'return') s.dirty = 0; s.anim = 0; }
  if (extHome) extHome.item = { t: 'ext' };

  const say = (ev) => { S.log.push(ev); if (S.log.length > 60) S.log.shift(); hk.event && hk.event(ev); };
  const near = (st, d = 0.3) => [st.x + st.fx * d, st.z + st.fz * d];

  /* ======================= describir / tocar / trabajar ======================= */
  /** Texto contextual y tipo de acción para un actor frente a un objetivo. */
  function describe(actor, tg) {
    if (!tg) return null;
    const H = actor.hold;
    if (tg.kind === 'rat') return { label: '🐀 ¡Espantar roedor!', mode: 'tap', ok: true };
    if (tg.kind === 'spill') return { label: `🧽 Limpiar derrame${tg.ref.prog > 0 ? ` ${Math.round(tg.ref.prog * 100)}%` : ''} (mantener)`, mode: 'work', ok: true };
    const st = tg.ref;
    if (st.fire > 0) return H && H.t === 'ext' ? { label: '🧯 ¡Apagar el fuego! (mantener)', mode: 'work', ok: true } : { label: '🔥 Apagar a mano (lento) · mejor con el 🧯', mode: 'work', ok: true };
    switch (st.type) {
      case 'fridge':
        if (!H) return { label: `${ING[st.ing].icon} Sacar ${ING[st.ing].name.toLowerCase()} de la nevera`, mode: 'tap', ok: true };
        if (H.t === 'ing' && H.ing === st.ing && H.st === 'crudo') return { label: '↩ Devolver a la nevera', mode: 'tap', ok: true };
        return { label: '✋ Tenés las manos ocupadas', mode: 'tap', ok: false };
      case 'board': case 'counter': case 'hatch': case 'conveyor': {
        const it = st.type === 'conveyor' || st.type === 'hatch' ? convAt(st) : st.item;
        const conv = st.type === 'conveyor' || st.type === 'hatch';
        if (st.type === 'board' && it && it.t === 'ing' && it.st === 'crudo' && ING[it.ing].chop && !H) return { label: `🔪 Picar ${ING[it.ing].name.toLowerCase()} ${Math.round(st.prog * 100)}% (mantener)`, mode: 'work', ok: true };
        if (!H && it) return { label: `✋ Agarrar ${itemName(it)}`, mode: 'tap', ok: true };
        if (H && !it) {
          if (conv) {
            if (H.t === 'ext') return { label: '🚫 El extintor no se sirve', mode: 'tap', ok: false };
            if (H.t === 'plate' && H.items.length) { const rid = matchRecipe(H.items, recipePool); return { label: rid ? `🛎 Servir ${RECIPES[rid].name} (cinta)` : '🛎 Servir… (¡no coincide con ninguna receta!)', mode: 'tap', ok: true }; }
            return { label: `➡ Poner ${itemName(H)} en la cinta`, mode: 'tap', ok: true };
          }
          if (st.type === 'board' && H.t === 'ing' && H.st === 'crudo' && ING[H.ing].chop) return { label: `🔪 Poner ${ING[H.ing].name.toLowerCase()} en la tabla`, mode: 'tap', ok: true };
          return { label: `⬇ Dejar ${itemName(H)}`, mode: 'tap', ok: true };
        }
        if (H && it) {
          if (H.t === 'plate' && it.t === 'ing') return plateLabel(H, it);
          if (H.t === 'ing' && it.t === 'plate') return plateLabel(it, H);
          return { label: '✋ Ocupado: ya hay algo ahí', mode: 'tap', ok: false };
        }
        return { label: st.type === 'board' ? '🔪 Tabla de picar (traé algo para picar)' : conv ? '🛎 Cinta de entrega: poné un plato' : '▫ Mesada vacía', mode: 'tap', ok: false };
      }
      case 'oven': {
        const it = st.item;
        if (!it) {
          if (H && H.t === 'ing' && ING[H.ing].oven === H.st) return { label: `🔥 Hornear ${ingName(H.ing, H.st).toLowerCase()}`, mode: 'tap', ok: true };
          if (H && H.t === 'ing' && ING[H.ing].oven) return { label: `🔪 Primero picá ${ING[H.ing].name.toLowerCase()}`, mode: 'tap', ok: false };
          return { label: H ? '🚫 Eso no va al horno' : '🔥 Horno vacío', mode: 'tap', ok: false };
        }
        const pct = it.st === ING[it.ing].oven ? ` ${Math.round(st.prog * 100)}%` : '';
        if (!H) return { label: `✋ Sacar ${ingName(it.ing, it.st).toLowerCase()}${pct}`, mode: 'tap', ok: true };
        if (H.t === 'plate') return plateLabel(H, it);
        return { label: '✋ Manos ocupadas', mode: 'tap', ok: false };
      }
      case 'pot': {
        const p = st.pot, src = potSource(p.ing);
        if (p.state === 'burnt') return H ? { label: '💀 Olla quemada: vaciala con las manos libres', mode: 'tap', ok: false } : { label: '🗑 Vaciar la olla quemada', mode: 'tap', ok: true };
        if (p.state === 'done') return H && H.t === 'plate' ? { label: `🥣 Servir ${ingName(src.pot.out, 'cocido').toLowerCase()} en el plato`, mode: 'tap', ok: H.items.length < 4 } : { label: `🍲 ¡${ingName(src.pot.out, 'cocido')} lista! Traé un plato`, mode: 'tap', ok: false };
        if (H && H.t === 'ing' && ING[H.ing].pot) {
          const pd = ING[H.ing].pot;
          if (H.st !== pd.from) return { label: `🔪 Primero picá ${ING[H.ing].name.toLowerCase()}`, mode: 'tap', ok: false };
          if (p.ing && p.ing !== H.ing) return { label: `🚫 La olla tiene ${ING[p.ing].name.toLowerCase()}`, mode: 'tap', ok: false };
          if (p.n >= pd.need) return { label: '🚫 La olla está llena', mode: 'tap', ok: false };
          return { label: `🍲 Echar a la olla (${p.n + 1}/${pd.need})`, mode: 'tap', ok: true };
        }
        if (p.state === 'cooking') return { label: `🍲 Cocinando ${Math.round(p.t / potTime() * 100)}%`, mode: 'tap', ok: false };
        if (p.state === 'filling') return { label: `🍲 Olla: ${p.n}/${ING[p.ing].pot.need} ${ING[p.ing].name.toLowerCase()}`, mode: 'tap', ok: false };
        return { label: H ? '🚫 Eso no va en la olla' : '🍲 Olla vacía (sopa: 3 picados · arroz: 2)', mode: 'tap', ok: false };
      }
      case 'sink':
        if (H && H.t === 'dirty') return { label: `🧼 Meter ${H.n} plato${H.n > 1 ? 's' : ''} sucio${H.n > 1 ? 's' : ''} al fregadero`, mode: 'tap', ok: true };
        if (!H && st.dirty > 0) return { label: `🧼 Lavar platos ${Math.round(st.prog * 100)}% · quedan ${st.dirty} (mantener)`, mode: 'work', ok: true };
        return { label: st.dirty > 0 ? '🧼 Soltá lo que tenés para lavar' : '🧼 Fregadero vacío', mode: 'tap', ok: false };
      case 'rack':
        if (!H && st.clean > 0) return { label: `🍽 Agarrar plato limpio (${st.clean})`, mode: 'tap', ok: true };
        if (H && H.t === 'plate' && !H.items.length) return { label: '🍽 Devolver plato limpio', mode: 'tap', ok: true };
        if (H && st.item == null && st.clean === 0 && H.t !== 'plate') return { label: `⬇ Dejar ${itemName(H)}`, mode: 'tap', ok: true };
        return { label: st.clean ? '🍽 Platos limpios' : '🍽 ¡No hay platos limpios! Lavá en el fregadero', mode: 'tap', ok: false };
      case 'return':
        if (!H && st.dirty > 0) return { label: `🍽 Agarrar ${st.dirty} plato${st.dirty > 1 ? 's' : ''} sucio${st.dirty > 1 ? 's' : ''}`, mode: 'tap', ok: true };
        if (H && H.t === 'dirty') return { label: '⬇ Dejar los platos sucios', mode: 'tap', ok: true };
        return { label: '🍽 Retorno de platos sucios', mode: 'tap', ok: false };
      case 'trash':
        if (H && H.t === 'ing') return { label: `🗑 Tirar ${itemName(H)}`, mode: 'tap', ok: true };
        if (H && H.t === 'plate' && H.items.length) return { label: '🗑 Vaciar el plato', mode: 'tap', ok: true };
        return { label: '🗑 Basura', mode: 'tap', ok: false };
    }
    return null;
  }
  function plateLabel(plate, ing) {
    if (ing.st === 'quemado') return { label: '💀 Está quemado: a la basura', mode: 'tap', ok: false };
    if (!plateable(ing.ing, ing.st)) return { label: ING[ing.ing].chop && ing.st === 'crudo' ? `🔪 Primero picá ${ING[ing.ing].name.toLowerCase()}` : `🔥 ${ING[ing.ing].name} todavía no está listo`, mode: 'tap', ok: false };
    if (plate.items.length >= 4) return { label: '🍽 El plato está lleno', mode: 'tap', ok: false };
    return { label: `🍽 Emplatar ${ingName(ing.ing, ing.st).toLowerCase()}`, mode: 'tap', ok: true };
  }
  function itemName(it) {
    if (!it) return '';
    if (it.t === 'ing') return ingName(it.ing, it.st).toLowerCase();
    if (it.t === 'plate') { const rid = matchRecipe(it.items, Object.keys(RECIPES)); return rid ? RECIPES[rid].name.toLowerCase() : it.items.length ? 'el plato' : 'el plato limpio'; }
    if (it.t === 'dirty') return 'los platos sucios';
    return 'el extintor';
  }
  const potSource = ing => ING[ing] || { pot: { out: 'sopa_tomate' } };
  const potTime = () => T.pot * D.cook;

  /** Acción instantánea. Devuelve true si hizo algo. */
  function tap(actor, tg) {
    const d = describe(actor, tg);
    if (!d) return false;
    if (tg.kind === 'rat') { shoo(tg.ref, actor); return true; }
    if (d.mode === 'work') { work(actor, tg, 0.28); return true; } // tocar también avanza (accesible: no hace falta mantener)
    if (!d.ok) { hk.sfx('nope'); return false; }
    const st = tg.ref, H = actor.hold;
    switch (st.type) {
      case 'fridge':
        if (!H) { actor.hold = { t: 'ing', ing: st.ing, st: 'crudo' }; st.anim = 1; hk.sfx('fridge'); hk.burst(st.x, st.top + 0.3, st.z, 0xdff6ff, 6); say('take:' + st.ing); }
        else { actor.hold = null; st.anim = 1; hk.sfx('drop'); }
        return true;
      case 'board': case 'counter': case 'hatch': case 'conveyor': {
        const conv = st.type === 'conveyor' || st.type === 'hatch';
        const it = conv ? convAt(st) : st.item;
        if (!H && it) { if (conv) { S.convItems.splice(S.convItems.indexOf(convEntry(st)), 1); } else { st.item = null; st.prog = 0; } actor.hold = it; hk.sfx('pick'); say('pick:' + st.id); return true; }
        if (H && !it) {
          if (conv) { S.convItems.push({ item: H, s: st.convIndex }); actor.hold = null; hk.sfx('belt'); say('conveyor'); }
          else { st.item = H; actor.hold = null; st.prog = 0; hk.sfx('drop'); say('place:' + st.id); }
          return true;
        }
        if (H && it) {
          if (H.t === 'plate' && it.t === 'ing') { H.items.push(key(it.ing, it.st)); if (conv) S.convItems.splice(S.convItems.indexOf(convEntry(st)), 1); else st.item = null; hk.sfx('plate'); say('plate'); return true; }
          if (H.t === 'ing' && it.t === 'plate') { it.items.push(key(H.ing, H.st)); actor.hold = null; hk.sfx('plate'); say('plate'); return true; }
        }
        return false;
      }
      case 'oven':
        if (!st.item && H) { st.item = H; actor.hold = null; st.prog = 0; st.burnT = 0; st.anim = 1; hk.sfx('oven'); say('oven'); return true; }
        if (st.item && !H) { actor.hold = st.item; st.item = null; st.prog = 0; st.burnT = 0; st.anim = 1; hk.sfx('pick'); return true; }
        if (st.item && H && H.t === 'plate') { H.items.push(key(st.item.ing, st.item.st)); st.item = null; st.prog = 0; st.burnT = 0; st.anim = 1; hk.sfx('plate'); say('plate'); return true; }
        return false;
      case 'pot': {
        const p = st.pot;
        if (p.state === 'burnt') { Object.assign(p, { ing: '', n: 0, t: 0, state: 'empty' }); hk.sfx('trash'); hk.burst(st.x, st.top, st.z, 0x333333, 10); return true; }
        if (p.state === 'done' && H && H.t === 'plate') { H.items.push(key(ING[p.ing].pot.out, 'cocido')); Object.assign(p, { ing: '', n: 0, t: 0, state: 'empty' }); hk.sfx('plate'); say('plate'); return true; }
        if (H && H.t === 'ing') { p.ing = H.ing; p.n++; actor.hold = null; p.state = p.n >= ING[H.ing].pot.need ? 'cooking' : 'filling'; p.t = 0; hk.sfx('splash'); hk.burst(st.x, st.top, st.z, 0xbfe8ff, 8); say('pot'); return true; }
        return false;
      }
      case 'sink': if (H && H.t === 'dirty') { st.dirty += H.n; actor.hold = null; hk.sfx('splash'); say('sink'); return true; } return false;
      case 'rack':
        if (!H && st.clean > 0) { st.clean--; actor.hold = { t: 'plate', items: [] }; hk.sfx('plateTake'); say('takePlate'); return true; }
        if (H && H.t === 'plate') { st.clean++; actor.hold = null; hk.sfx('drop'); return true; }
        if (H && !st.item) { st.item = H; actor.hold = null; return true; }
        return false;
      case 'return':
        if (!H && st.dirty > 0) { actor.hold = { t: 'dirty', n: st.dirty }; st.dirty = 0; hk.sfx('plateTake'); say('takeDirty'); return true; }
        if (H && H.t === 'dirty') { st.dirty += H.n; actor.hold = null; hk.sfx('drop'); return true; }
        return false;
      case 'trash':
        if (H && H.t === 'ing') actor.hold = null; else if (H && H.t === 'plate') H.items.length = 0; else return false;
        st.anim = 1; hk.sfx('trash'); say('trash'); return true;
    }
    return false;
  }

  /** Trabajo sostenido (picar, lavar, limpiar, apagar). Devuelve el progreso 0..1 o -1 si no aplica. */
  function work(actor, tg, dt) {
    if (!tg) return -1;
    if (tg.kind === 'spill') {
      const sp = tg.ref; sp.prog += dt / T.clean;
      if (Math.random() < 0.3) hk.burst(sp.x, 0.2, sp.z, 0xbfe8ff, 1);
      hk.sfx('scrub');
      if (sp.prog >= 1) { S.spills.splice(S.spills.indexOf(sp), 1); hk.sfx('sparkle'); hk.burst(sp.x, 0.3, sp.z, 0xffffff, 10); say('spillClean'); }
      return Math.min(1, sp.prog);
    }
    if (tg.kind !== 'station') return -1;
    const st = tg.ref, H = actor.hold;
    if (st.fire > 0) {
      const rate = H && H.t === 'ext' ? T.extinguish : T.extinguishBare;
      st.fireHP += dt / rate;
      hk.spray(st, H && H.t === 'ext');
      if (st.fireHP >= 1) { st.fire = 0; st.fireHP = 0; st.fireT = 0; S.fires++; hk.sfx('foam'); hk.burst(st.x, st.top + 0.4, st.z, 0xffffff, 16); hk.emit('fire_out'); say('fireOut:' + st.id); }
      return Math.min(1, st.fireHP);
    }
    if (st.type === 'board' && !H && st.item && st.item.t === 'ing' && st.item.st === 'crudo' && ING[st.item.ing].chop) {
      st.prog += dt / (T.chop * (actor.slow || 1)); st.anim = 1;
      hk.chop(st);
      if (st.prog >= 1) { st.item.st = 'picado'; st.prog = 0; hk.sfx('chopDone'); hk.burst(st.x, st.top + 0.2, st.z, 0x9be07a, 8); say('chopped:' + st.item.ing); }
      return Math.min(1, st.prog);
    }
    if (st.type === 'sink' && !H && st.dirty > 0) {
      st.prog += dt / (T.wash * (actor.slow || 1)); st.anim = 1;
      hk.wash(st);
      if (st.prog >= 1) {
        st.prog = 0; st.dirty--;
        const r = rack.reduce((a, b) => (!a || b.clean < a.clean ? b : a), null) || rack[0];
        if (r) r.clean++;
        hk.sfx('clean'); hk.burst(st.x, st.top + 0.3, st.z, 0xbfe8ff, 10); say('washed');
      }
      return Math.min(1, st.prog);
    }
    return -1;
  }

  /* ======================= cinta ======================= */
  function convEntry(st) { return S.convItems.find(e => Math.abs(e.s - st.convIndex) < 0.5) || null; }
  function convAt(st) { const e = convEntry(st); return e ? e.item : null; }
  function convPos(s) {
    const c = K.conv, i = Math.min(c.length - 1, Math.floor(s)), f = s - i, a = c[i], b = c[Math.min(c.length - 1, i + 1)];
    return { x: a.x + (b.x - a.x) * f, y: a.top, z: a.z + (b.z - a.z) * f };
  }
  function updateConveyor(dt) {
    const end = K.conv.length - 1;
    for (let i = S.convItems.length - 1; i >= 0; i--) {
      const e = S.convItems[i];
      // no se encima con el de adelante
      const ahead = S.convItems.find(o => o !== e && o.s > e.s && o.s - e.s < 0.95);
      if (!ahead) e.s = Math.min(end, e.s + dt / T.conveyor);
      if (e.s >= end) { S.convItems.splice(i, 1); deliver(e.item); }
    }
  }

  /* ======================= pedidos ======================= */
  function pickRecipe() {
    const pool = recipePool, w = ph ? pool.map(() => 1) : def.weights;
    let tot = 0; for (const x of w) tot += x;
    let r = rand() * tot;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
    return pool[0];
  }
  function freeSeat() { const used = new Set(S.orders.map(o => o.seat)); for (let i = 0; i < K.seats.length; i++) if (!used.has(i) && !(K.seats[i].leave > 0)) return i; return -1; }
  function addOrder(recipe, extra = {}) {
    const seat = freeSeat(); if (seat < 0) return null;
    const r = RECIPES[recipe];
    const tMax = orderTime(r.steps) * D.orderTime * (extra.royal ? 1.35 : ph ? 0.9 : 1);
    const o = { id: ORDER_ID++, recipe, t: tMax, tMax, seat, royal: !!extra.royal, wave: extra.wave || 0, born: S.elapsed };
    S.orders.push(o);
    hk.orderIn(o); say('order:' + recipe);
    return o;
  }
  function updateOrders(dt) {
    for (let i = S.orders.length - 1; i >= 0; i--) {
      const o = S.orders[i];
      o.t -= dt;
      if (o.t <= 0) {
        S.orders.splice(i, 1); S.fails++; S.streak = 0;
        hk.orderOut(o, false); hk.sfx('fail'); say('fail:' + o.recipe); hk.emit('order_fail');
        if (S.fails >= D.maxFails && !S.over) { endShift(false); return; }
      }
    }
    if (ph && ph.waves) {
      const w = S.wave;
      if (w.telegraph > 0) { w.telegraph -= dt; if (w.telegraph <= 0) spawnWave(); }
      else { w.next -= dt; if (w.next <= 0) { w.telegraph = D.telegraph; w.next = 21 * D.spawn; hk.telegraph('wave', null, D.telegraph); } }
      return;
    }
    if (S.noSpawn) return;
    S.nextOrder -= dt;
    const max = def.maxOrders;
    if (S.nextOrder <= 0) {
      const ramp = Math.min(1, S.elapsed / S.duration);
      S.nextOrder = def.spawn * D.spawn * (1 - 0.25 * ramp) * (ph ? 0.85 : 1);
      if (S.orders.length < max) addOrder(pickRecipe());
    }
    if (S.orders.length === 0 && S.nextOrder > 3) S.nextOrder = 3;
    if (ph && ph.royal) {
      S.royalT -= dt;
      if (S.royalT <= 0) { S.royalT = 34; if (!S.orders.some(o => o.royal)) { const o = addOrder(ph.royal, { royal: true }); if (o) hk.royal(o); } }
    }
  }
  function spawnWave() {
    const w = S.wave; w.n++;
    const n = 3;
    for (let k = 0; k < n; k++) { const o = addOrder(pickRecipe(), { wave: w.n }); if (o) w.ids.push(o.id); }
    hk.sfx('horn');
  }
  function deliver(item) {
    if (item.t === 'dirty') { ret.dirty += item.n; return; }
    if (item.t === 'ing') { S.errors++; S.streak = 0; hk.toast('😖 ¡Eso iba en un plato! Se perdió.'); hk.sfx('error'); hk.emit('error'); say('error:ing'); return; }
    if (item.t !== 'plate') return;
    const rid = matchRecipe(item.items, recipePool);
    const cands = rid ? S.orders.filter(o => o.recipe === rid) : [];
    if (!cands.length || !item.items.length) {
      S.errors++; S.streak = 0; S.score = Math.max(0, S.score - 10);
      hk.toast(item.items.length ? '❌ Pedido equivocado: nadie pidió eso (−10)' : '❌ ¡Mandaste un plato vacío!');
      hk.sfx('error'); hk.emit('error'); say('error:' + (rid || 'nada'));
      S.returns.push({ t: T.plateReturn });
      return;
    }
    const o = cands.reduce((a, b) => (a.t < b.t ? a : b));
    S.orders.splice(S.orders.indexOf(o), 1);
    const r = RECIPES[o.recipe], frac = Math.max(0, o.t / o.tMax);
    const base = 20 * r.steps, tip = Math.round(base * 0.6 * frac), perfect = frac >= 0.5;
    S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
    const mult = (o.royal ? 2 : 1) * (ph && ph.mult ? ph.mult : 1);
    const pts = Math.round((base + tip + (perfect ? 10 : 0) + 5 * Math.min(5, S.streak - 1)) * mult);
    S.score += pts; S.served++;
    if (perfect) S.perfect++;
    hk.orderOut(o, true, pts, perfect); hk.sfx('ding');
    hk.emit('served'); if (perfect) hk.emit('perfect'); hk.emit('streak', S.streak);
    say('served:' + o.recipe + (perfect ? ':perfect' : ''));
    S.returns.push({ t: T.plateReturn });
    // oleada completa
    if (o.wave) {
      const w = S.wave;
      if (!S.orders.some(x => x.wave === o.wave)) { const b = Math.round(40 * (ph && ph.mult ? ph.mult : 1)); S.score += b; w.cleared++; hk.toast(`🎺 ¡Oleada completa! +${b}`); hk.sfx('fanfare'); }
    }
  }

  /* ======================= cocción ======================= */
  function updateCooking(dt) {
    for (const st of K.stations) {
      if (st.type === 'oven' && st.item && st.item.t === 'ing' && st.fire === 0) {
        const it = st.item, d = ING[it.ing];
        if (it.st === d.oven) { st.prog += dt / (T.cook * D.cook); if (st.prog >= 1) { it.st = 'asado'; st.prog = 0; st.burnT = 0; hk.sfx('ready'); hk.burst(st.x, st.top + 0.3, st.z, 0xffe066, 8); say('cooked:' + it.ing); } }
        else if (it.st === 'asado') { st.burnT += dt; warn(st, st.burnT, T.burn * D.burn); if (st.burnT >= T.burn * D.burn) { it.st = 'quemado'; st.burnT = 0; burnt(st); } }
        else if (it.st === 'quemado') { st.burnT += dt; if (st.burnT >= T.fireAfterBurn) ignite(st); }
      }
      if (st.type === 'pot' && st.fire === 0) {
        const p = st.pot;
        if (p.state === 'cooking') { p.t += dt; if (p.t >= potTime()) { p.state = 'done'; p.t = 0; hk.sfx('ready'); say('potDone:' + p.ing); } }
        else if (p.state === 'done') { p.t += dt; warn(st, p.t, T.burn * D.burn * 1.2); if (p.t >= T.burn * D.burn * 1.2) { p.state = 'burnt'; p.t = 0; burnt(st); } }
        else if (p.state === 'burnt') { p.t += dt; if (p.t >= T.fireAfterBurn) { ignite(st); p.t = -999; } }
      }
    }
  }
  function warn(st, t, lim) { st.warn = t / lim; if (t > lim * 0.55) hk.sfx('beep'); }
  function burnt(st) { S.burnt++; hk.sfx('burn'); hk.burst(st.x, st.top + 0.4, st.z, 0x222222, 14); hk.toast('💨 ¡Se quemó! Tiralo antes de que se prenda fuego'); hk.emit('burn'); say('burn:' + st.id); }

  /* ======================= fuego ======================= */
  function ignite(st) {
    if (!st || st.fire > 0 || !FIRE_STATIONS.has(st.type)) return false;
    st.fire = 1; st.fireHP = 0; st.fireT = 0; st.burnT = -999; // ya ardió: no se vuelve a prender sola
    if (st.item && st.item.t === 'ing') st.item.st = 'quemado';
    hk.sfx('fire'); hk.shake(0.12); say('fire:' + st.id); hk.emit('fire');
    return true;
  }
  function updateFire(dt) {
    for (const st of K.stations) {
      if (st.fire <= 0) continue;
      st.fireT += dt;
      st.fireHP = Math.max(0, st.fireHP - dt * 0.08);
      if (st.fireT >= T.fireSpread) {
        st.fireT = 0;
        const nb = K.stations.filter(o => o.fire === 0 && FIRE_STATIONS.has(o.type) && Math.abs(o.c - st.c) + Math.abs(o.rw - st.rw) === 1);
        if (nb.length) ignite(nb[Math.floor(rand() * nb.length)]);
      }
    }
  }

  /* ======================= derrames ======================= */
  function addSpill(c, rw) {
    if (!K.walkable(c, rw) || S.spills.some(s => s.c === c && s.rw === rw) || S.spills.length >= 6) return false;
    S.spills.push({ c, rw, x: K.X(c), z: K.Z(rw), prog: 0, age: 0, warned: false });
    S.spillsMade++; hk.sfx('splat'); say('spill'); return true;
  }
  function randomFloor(avoid) {
    for (let k = 0; k < 40; k++) {
      const c = 1 + Math.floor(rand() * (K.W - 2)), rw = 1 + Math.floor(rand() * (K.H - 2));
      if (K.walkable(c, rw) && K.ch(c, rw) !== '>' && K.ch(c, rw) !== '<' && !(avoid && avoid(c, rw))) return { c, rw };
    }
    return null;
  }
  function updateSpills(dt) {
    for (const s of S.spills) { s.age += dt; if (s.age > 14 && !s.warned) { s.warned = true; S.dirtyFlag = true; hk.emit('dirty'); hk.toast('🧽 Ese derrame ya lleva mucho: ¡la cocina está sucia!'); } }
    if (ret && ret.dirty >= 5 && !S.dirtyFlag) { S.dirtyFlag = true; hk.emit('dirty'); hk.toast('🍽 Se apilan los platos sucios: ¡la cocina está sucia!'); }
  }

  /* ======================= roedores ======================= */
  function spawnRat() {
    if (!K.holes.length || S.rats.length >= 4) return null;
    const h = K.holes[Math.floor(rand() * K.holes.length)];
    const rt = { x: h.ox, z: h.oz, hx: h.ox, hz: h.oz, st: 'out', target: null, carry: null, t: 0, path: null, pi: 0, yaw: 0, id: ORDER_ID++, spd: 2.3, hop: 0 };
    S.rats.push(rt); hk.sfx('squeak'); say('rat'); return rt;
  }
  function ratTarget() {
    const c = K.stations.filter(s => (s.type === 'counter' || s.type === 'board' || s.type === 'oven') && s.item && (s.item.t === 'ing' || (s.item.t === 'plate' && s.item.items.length)) && s.fire === 0 && !S.rats.some(r => r.target === s));
    return c.length ? c[Math.floor(rand() * c.length)] : null;
  }
  function shoo(rt, actor) {
    if (rt.st === 'flee' && !rt.carry) return;
    if (rt.carry) { const back = rt.target && !rt.target.item ? rt.target : K.stations.find(s => s.type === 'counter' && !s.item && s.fire === 0); if (back) back.item = rt.carry; rt.carry = null; hk.toast('🐀 ¡Recuperaste la comida!'); }
    rt.st = 'flee'; rt.path = null; rt.spd = 3.4; rt.hop = 0.4;
    S.ratsShooed++; hk.sfx('squeakHi'); hk.burst(rt.x, 0.3, rt.z, 0xffffff, 8); hk.emit('rat_shoo'); say('ratShoo');
    void actor;
  }
  function moveToward(o, tx, tz, spd, dt) {
    const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const st = Math.min(d, spd * dt); o.x += dx / d * st; o.z += dz / d * st; o.yaw = Math.atan2(dx, dz);
    return d < 0.12;
  }
  function followPath(o, tx, tz, dt) {
    if (!o.path) { o.path = hk.path(o.x, o.z, tx, tz) || []; o.pi = 0; }
    if (o.pi < o.path.length) { const p = o.path[o.pi]; if (moveToward(o, p.x, p.z, o.spd, dt)) o.pi++; return false; }
    return moveToward(o, tx, tz, o.spd, dt);
  }
  function updateRats(dt) {
    for (let i = S.rats.length - 1; i >= 0; i--) {
      const r = S.rats[i]; r.t += dt; r.hop = Math.max(0, r.hop - dt);
      if (r.st === 'out') {
        if (!r.target || !r.target.item) { r.target = ratTarget(); r.path = null; if (!r.target) { if (r.t > 6) { r.st = 'flee'; r.path = null; } continue; } }
        const [ax, az] = near(r.target, TS * 0.75);
        if (followPath(r, ax, az, dt)) { r.st = 'nibble'; r.t = 0; hk.sfx('squeak'); }
      } else if (r.st === 'nibble') {
        r.yaw = Math.atan2(r.target.x - r.x, r.target.z - r.z);
        if (!r.target.item) { r.st = 'out'; r.target = null; continue; }
        if (r.t >= 1.8) { r.carry = r.target.item; r.target.item = null; r.target.prog = 0; r.st = 'flee'; r.path = null; r.spd = 2.6; hk.sfx('steal'); hk.toast('🐀 ¡Un roedor se llevó comida! Alcanzalo'); say('ratSteal'); }
      } else if (r.st === 'flee') {
        if (followPath(r, r.hx, r.hz, dt)) { S.rats.splice(i, 1); if (r.carry) say('ratEscaped'); }
      }
      // pasar por encima del roedor también lo espanta
      for (const a of hk.actors()) if (Math.hypot(a.x - r.x, a.z - r.z) < 0.55 && (r.st !== 'flee' || r.carry)) shoo(r, a);
    }
    if (def.ratEvery) {
      S.ratT -= dt;
      if (S.ratT <= 0) { S.ratT = def.ratEvery / D.rats * (0.8 + rand() * 0.4); spawnRat(); }
    }
  }

  /* ======================= caos ======================= */
  function nextChaosType() {
    if (ph && ph.kitchen === 'volcan') return 'erupcion';
    if (ph && ph.kitchen === 'espacial') return 'esclusa';
    const list = def.chaos; return list[(S.chaos.idx++) % list.length];
  }
  function updateChaos(dt) {
    const ch = S.chaos;
    if (ch.zeroG > 0) ch.zeroG -= dt;
    if (ch.suction > 0) ch.suction -= dt;
    if (ch.flareWarn > 0) { ch.flareWarn -= dt; if (ch.flareWarn <= 0) { ch.flare = 2.4; hk.sfx('steam'); } }
    if (ch.flare > 0) ch.flare -= dt;
    if (ch.pending) {
      ch.pending.t -= dt;
      if (ch.pending.t <= 0) { fireChaos(ch.pending); ch.pending = null; }
      return;
    }
    ch.next -= dt;
    if (ch.next <= 0) {
      const every = ph ? (ph.kitchen === 'volcan' ? 15 : ph.kitchen === 'espacial' ? 19 : 30) : 26;
      ch.next = every * D.chaos * (ph ? 1 : 0.85 + rand() * 0.3);
      if (ph && ph.kitchen === 'taberna') return; // la fase 1 usa oleadas, no caos
      startChaos(nextChaosType());
    }
  }
  function startChaos(type) {
    const ev = { type, t: D.telegraph, targets: /** @type {any[]} */ ([]) };
    if (type === 'erupcion' || type === 'grasa') {
      const pool = K.stations.filter(s => s.fire === 0 && (type === 'grasa' ? (s.type === 'oven' || s.type === 'pot') : FIRE_STATIONS.has(s.type) && s.type !== 'fridge'));
      const n = type === 'erupcion' ? (D.chaos < 0.8 ? 2 : 1) : 1;
      for (let k = 0; k < n && pool.length; k++) { const s = pool.splice(Math.floor(rand() * pool.length), 1)[0]; s.mark = ev.t; ev.targets.push(s); }
    } else if (type === 'barril' || type === 'temblor' || type === 'meteoritos') {
      const n = type === 'meteoritos' ? 3 : 2;
      for (let k = 0; k < n; k++) { const f = randomFloor((c, rw) => ev.targets.some(t => t.c === c && t.rw === rw)); if (f) ev.targets.push({ c: f.c, rw: f.rw, x: K.X(f.c), z: K.Z(f.rw), mark: ev.t }); }
    } else if (type === 'grietas') {
      S.chaos.flareWarn = ev.t;
    }
    S.chaos.pending = ev;
    hk.telegraph(type, ev, ev.t); say('chaos:' + type);
  }
  function fireChaos(ev) {
    const t = ev.type;
    if (t === 'ratas') { const n = 2 + (D.rats > 1.2 ? 1 : 0); for (let k = 0; k < n; k++) spawnRat(); }
    else if (t === 'erupcion' || t === 'grasa') { for (const s of ev.targets) { s.mark = 0; ignite(s); hk.burst(s.x, s.top + 0.5, s.z, 0xff7a2a, 18); } hk.shake(0.25); }
    else if (t === 'barril' || t === 'temblor' || t === 'meteoritos') { for (const f of ev.targets) addSpill(f.c, f.rw); if (t !== 'barril') hk.shake(t === 'temblor' ? 0.5 : 0.3); S.chaos.shake = t === 'temblor' ? 1.2 : 0.5; }
    else if (t === 'esclusa') { S.chaos.suction = 5; hk.sfx('wind'); }
    else if (t === 'gravedad') { S.chaos.zeroG = 9; hk.sfx('float'); }
    hk.chaosFired(t);
  }

  /* ======================= paso de simulación ======================= */
  function step(dt) {
    if (S.over) return;
    if (!S.frozen) {
      S.time -= dt; S.elapsed += dt;
      updateOrders(dt); if (S.over) return;
      updateChaos(dt);
      if (S.time <= 0) { S.time = 0; endShift(true); return; }
    }
    updateCooking(dt); updateFire(dt); updateConveyor(dt); updateRats(dt); updateSpills(dt);
    for (const s of K.stations) { if (s.mark > 0) s.mark = Math.max(0, s.mark - dt); if (s.anim > 0) s.anim = Math.max(0, s.anim - dt * 1.6); }
    for (let i = S.returns.length - 1; i >= 0; i--) { S.returns[i].t -= dt; if (S.returns[i].t <= 0) { S.returns.splice(i, 1); if (ret) { ret.dirty++; hk.sfx('clink'); } } }
  }
  function endShift(timeUp) {
    S.over = true;
    const th = ph ? ph.stars : def.stars;
    S.won = timeUp && S.fails < D.maxFails;
    S.stars = S.won ? starsOf(S.score, th) : 0;
    hk.end(S);
  }

  return {
    S, K, describe, tap, work, step, ignite, addSpill, spawnRat, startChaos, addOrder, deliver, convPos, convAt, itemName, endShift, shoo,
    get zeroG() { return (ph && ph.zeroG) || S.chaos.zeroG > 0; },
    get suction() { return S.chaos.suction > 0 || false; },
    flareOn: () => S.chaos.flare > 0, flareWarn: () => S.chaos.flareWarn > 0,
    recipes: recipePool, rack, ret, extHome,
  };
}
