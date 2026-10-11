// Mateo: Ciudad de Altura — V2 P3: CAMPAÑA encadenada (fase 10 del kit) sobre los sistemas reales del juego.
// Datos: game/data/misiones.json (6 misiones adaptadas del kit). Cada paso tiene un VERIFICADOR acá: un evento real del
// juego (salto, cable, súper salto, compra, trabajo, guardado, pantalla abierta, charla, estado del incidente) o una
// condición del estado (adentro/afuera, traje, kart, hora, distancia). Estados por misión: locked → available → active
// → completed (o failed → reintento automático). Empieza con un TUTORIAL REAL de controles (moverse, cámara, saltar,
// interactuar) y fuerza eventos CONTEXTUALES (robo en la plaza, incidente nocturno) sólo cuando corresponde.
// Persistente (save.campaign): misión y paso actuales, progreso del paso, estados, diario y distritos descubiertos.
// Recompensas ÚNICAS: monedas por transacción 'mis:<id>' (idempotente) + experiencia + reputación, en el mismo guardado
// que marca la misión cumplida (recargar a mitad nunca duplica premios). Reputación con niveles que los vecinos reconocen.

const INC_STATES = { investigar_incidente: ['pursuit', 'confront', 'recover', 'return', 'complete'], perseguir_ladron: ['confront', 'recover', 'return', 'complete'], inmovilizar_sin_violencia: ['recover', 'return', 'complete'], devolver_objeto: ['complete'], resolver_evento_nocturno: ['complete'] };
const FRUIT = ['manzana', 'fruta_mix', 'jugo'];
const END = ['complete', 'expired', 'escaped', 'cancelled'];
const DISTRICT_NAMES = { centro: 'Centro de Altura', sol: 'Barrio del Sol', puerto: 'Puerto' };

export const CAMPAIGN_STEPS = ['levantarse_de_cama', 'mirar_alrededor', 'saltar', 'abrir_ropero', 'salir_del_apartamento', 'correr', 'ir_a_la_plaza', 'hablar_con_vecino', 'comprar_una_fruta', 'regresar_apartamento', 'equipar_traje_m', 'hacer_salto_alto', 'balancearse_tres_veces', 'investigar_incidente', 'perseguir_ladron', 'inmovilizar_sin_violencia', 'devolver_objeto', 'ganar_creditos_actividades', 'visitar_concesionaria', 'comprar_o_pedir_vehiculo', 'conducir_a_casa', 'aparcar_en_garaje', 'esperar_atardecer', 'recorrer_azoteas', 'resolver_evento_nocturno', 'regresar_a_casa', 'guardar'];

/** estado inicial de la campaña (también lo usa save.js para sanear) */
export function campaignDefaults(questline) {
  return { status: Object.fromEntries(questline.map((m, i) => [m.id, i === 0 ? 'available' : 'locked'])), cur: null, step: 0, prog: { n: 0, roofs: [] }, done: {}, journal: [], fails: 0, visited: [], tier: 0 };
}

export function createCampaign(ctx) {
  const { data, save, ui, player, home, life, wardrobe, vehicles, incidents, economy, clock, city, people, sfx, fx } = ctx;
  const S = () => save.data;
  const C = () => S().campaign;
  const Q = data.questline, byId = Object.fromEntries(Q.map(m => [m.id, m])), tiers = data.reputationTiers;
  const P = () => player.P;
  const R = { inc: null, incState: '', retryT: 0, failT: 0, availT: 0, last: null, acc: 0, spawnT: 0, msg: '', extra: [], tries: 0 };
  const stats = { started: 0, completed: 0, failed: 0, steps: 0, forced: 0, rewards: 0 };

  /* ---------- lugares (todos son puntos reales del mapa; los de adentro usan la puerta si Mateo está afuera) ---------- */
  const store = id => life.stores.find(s => s.st.id === id).spot;
  const spot = id => { const s = home.spots.find(x => x.id === id); return { x: s.x, y: s.y || 0, z: s.z, inside: true }; };
  const door = () => ({ x: home.entry.x, y: home.entry.y || 0, z: home.entry.z });
  const plaza = () => ({ x: city.landmarks.plaza.x, y: 0, z: city.landmarks.plaza.z });
  const near = (a, r) => Math.hypot(P().pos.x - a.x, P().pos.z - a.z) < r;
  const isNight = () => { const h = clock.hour, f = S().settings.hora; return f === 'noche' || f === 'atardecer' || (f === 'ciclo' && (h >= 18.3 || h < 5.5)); };
  const repTotal = () => Object.values(S().rep).reduce((a, b) => a + Math.max(0, b), 0);
  const tierOf = r => { let i = 0; for (let k = 0; k < tiers.length; k++) if (r >= tiers[k].min) i = k; return i; };

  /** verificadores: cond() (estado), ev (evento real), meter (contador acumulado), target() (adónde ir) */
  const STEPS = {
    levantarse_de_cama: { meter: 'walk' },
    mirar_alrededor: { meter: 'look' },
    saltar: { ev: 'jump' },
    abrir_ropero: { ev: 'screen', match: k => k === 'wardrobe', target: () => spot('ropero') },
    salir_del_apartamento: { cond: () => !home.inside, target: () => spot('salir') },
    correr: { meter: 'sprint' },
    ir_a_la_plaza: { cond: () => !home.inside && near(plaza(), 16), target: plaza },
    hablar_con_vecino: { ev: 'talk', target: () => { const r = people.named.rulo; return { x: r.x, y: 0, z: r.z }; } },
    comprar_una_fruta: { ev: 'buy', match: d => d && FRUIT.includes(d.sku), target: () => store('kiosco_centro'), note: () => !clock.isOpen(storeDef('kiosco_centro').open) ? `(abre a las ${storeDef('kiosco_centro').open[0]}:00)` : economy.balance < 12 ? '(hacé un trabajo para juntar monedas)' : '' },
    regresar_apartamento: { cond: () => home.inside, target: door },
    equipar_traje_m: { cond: () => wardrobe.mode === 'hero' && !vehicles.driving },
    hacer_salto_alto: { ev: 'superJump', match: () => !home.inside, target: () => home.inside ? spot('salir') : null, note: () => wardrobe.mode !== 'hero' ? '(ponete el traje M)' : '' },
    balancearse_tres_veces: { ev: 'cable', match: () => !home.inside, count: true, target: () => home.inside ? spot('salir') : { x: city.landmarks.banco.x, y: 0, z: city.landmarks.banco.z } },
    investigar_incidente: { inc: 'bolso', where: plaza },
    perseguir_ladron: { inc: true }, inmovilizar_sin_violencia: { inc: true }, devolver_objeto: { inc: true },
    ganar_creditos_actividades: { ev: 'jobDone', target: () => life.job ? life.job.point : life.anchors.tablero },
    visitar_concesionaria: { cond: () => !home.inside && near(store('concesionaria_lumen'), 6), target: () => store('concesionaria_lumen'), note: () => clock.isOpen(storeDef('concesionaria_lumen').open) ? '' : `(abre a las ${storeDef('concesionaria_lumen').open[0]}:00)` },
    comprar_o_pedir_vehiculo: { cond: () => S().cars.owned.length > 0, target: () => store('concesionaria_lumen') },
    conducir_a_casa: { meter: 'drive', cond2: () => vehicles.driving && vehicles.kart && Math.hypot(vehicles.kart.x - home.garage.x, vehicles.kart.z - home.garage.z) < 14, target: () => vehicles.driving ? { x: home.garage.x, y: 0, z: home.garage.z } : vehicles.kart ? { x: vehicles.kart.x, y: 0, z: vehicles.kart.z } : home.inside ? spot('llavero') : { x: home.garage.sign.x, y: 0, z: home.garage.sign.z }, note: () => vehicles.driving ? '' : vehicles.kart ? '(subite al kart)' : '(traelo con las llaves del departamento o en el cartel del Garaje M)' },
    aparcar_en_garaje: { cond: () => !vehicles.driving && (vehicles.kart ? Math.hypot(vehicles.kart.x - home.garage.x, vehicles.kart.z - home.garage.z) < 12 : S().cars.owned.length > 0), target: () => ({ x: home.garage.x, y: 0, z: home.garage.z }) },
    esperar_atardecer: { cond: isNight, ev: 'sleep', match: d => d && d.h >= 18, target: () => home.inside ? spot('cama') : null, note: () => S().settings.hora === 'dia' ? '(la hora está fija de día en Ajustes: elegí «Ciclo» o dormí hasta la noche)' : '' },
    recorrer_azoteas: { meter: 'roofs', target: () => home.inside ? spot('salir') : null, note: () => wardrobe.mode !== 'hero' ? '(con el traje M llegás más alto)' : '' },
    resolver_evento_nocturno: { inc: 'fuga', where: () => ({ x: P().pos.x, y: 0, z: P().pos.z }) },
    regresar_a_casa: { cond: () => home.inside, target: door },
    guardar: { ev: 'saved', target: () => spot('cama') },
  };
  const storeDef = id => ctx.shops.stores.find(s => s.id === id);
  for (const m of Q) for (const s of m.steps) if (!STEPS[s.id]) console.warn('Paso de misión sin verificador:', s.id);

  /** completa los estados que falten (partida nueva o migrada): la primera disponible, las demás según la anterior */
  function normalize() {
    const st = C().status;
    Q.forEach((m, i) => { if (!st[m.id]) st[m.id] = i === 0 || st[Q[i - 1].id] === 'completed' ? 'available' : 'locked'; });
    if (C().cur && !byId[C().cur]) { C().cur = null; C().step = 0; }
  }
  normalize();
  const cur = () => C().cur ? byId[C().cur] : null;
  const curStep = () => { const m = cur(); return m ? m.steps[C().step] : null; };
  const firstIncStep = m => m.steps.findIndex(s => STEPS[s.id] && STEPS[s.id].inc && typeof STEPS[s.id].inc === 'string');

  /* ---------- diario y avisos ---------- */
  function journal(icon, text) {
    const j = C().journal; j.push({ d: clock.day, h: clock.label(), i: icon, t: String(text).slice(0, 90) }); if (j.length > 40) j.splice(0, j.length - 40);
  }
  function note(icon, text, kind = 'info') { ui.notify(icon, text, kind); }

  /* ---------- ciclo de vida de una misión ---------- */
  function activate(id) {
    const m = byId[id]; if (!m) return false;
    for (const k in C().status) if (C().status[k] === 'active' && k !== id) C().status[k] = 'available';
    C().status[id] = 'active'; C().cur = id; C().step = 0; C().prog = { n: 0, roofs: [] };
    R.inc = null; R.incState = ''; R.failT = 0;
    journal('★', `Empezó «${m.title}»`); stats.started++;
    save.flush();
    note('★', `Nueva misión: ${m.title}`, 'mission');
    if (m.intro) note('💬', m.intro, 'mission');
    enterStep();
    return true;
  }
  function enterStep() {
    const st = curStep(); if (!st) return;
    C().prog = { n: 0, roofs: [] }; R.last = null; R.spawnT = 0;
    if (!STEPS[st.id] || !STEPS[st.id].inc) { R.inc = null; R.incState = ''; releaseExtra(); }
    save.flush();
    const tx = stepText(st); if (tx.hint) note('👉', `${st.label}: ${tx.hint}`, 'hint');
    checkNow(); // si ya se cumple (p. ej. ya estaba de héroe) avanza sin esperar
  }
  function advance() {
    const m = cur(), st = curStep(); if (!m || !st) return;
    stats.steps++; sfx.checkpoint();
    C().step++;
    if (C().step >= m.steps.length) return complete(m);
    note('✔', `${st.label}`, 'step');
    enterStep();
  }
  function complete(m) {
    const st = C().status; if (st[m.id] === 'completed') return;
    st[m.id] = 'completed'; C().done[m.id] = { d: clock.day, h: clock.label() };
    C().cur = null; C().step = 0; C().prog = { n: 0, roofs: [] }; R.inc = null; releaseExtra();
    // recompensas únicas: la transacción 'mis:<id>' no se cobra dos veces (aunque se repita el código o se recargue)
    const paid = economy.earn({ transactionId: `mis:${m.id}`, credits: m.reward.credits, what: m.title });
    if (paid) { S().points += m.reward.xp; S().rep[m.district] = (S().rep[m.district] || 0) + m.reward.rep; stats.rewards++; }
    if (m.next && st[m.next] === 'locked') { st[m.next] = 'available'; R.availT = 4; }
    journal('🏆', `Cumpliste «${m.title}» · +${m.reward.credits} M · +${m.reward.xp} pts`);
    if (!m.next) journal('🌟', '¡Terminaste la historia de Ciudad de Altura!');
    save.flush(); stats.completed++;
    ui.big('¡MISIÓN CUMPLIDA!', `${m.title.toUpperCase()} · +${m.reward.credits} M · +${m.reward.xp} PTS`, 2.6); sfx.win(); fx.confetti(P().pos.x, P().pos.y + 2, P().pos.z);
    note('🏆', m.next ? `Cumpliste «${m.title}». Lo que sigue: «${byId[m.next].title}»` : '¡Historia completa! Seguí ayudando a los vecinos', 'mission');
    ctx.onEvent && ctx.onEvent('missionDone', m.id);
  }
  function fail(why) {
    const m = cur(); if (!m || C().status[m.id] !== 'active') return;
    C().status[m.id] = 'failed'; C().fails++; stats.failed++;
    journal('✖', `«${m.title}»: ${why}`); save.flush();
    note('✖', `Misión fallida: ${why}. Se reintenta en unos segundos`, 'fail'); sfx.denied();
    R.failT = 5; R.inc = null; R.incState = ''; releaseExtra(true);
  }
  function retry() {
    const m = cur(); if (!m) return;
    C().status[m.id] = 'active'; C().step = Math.max(0, firstIncStep(m)); R.failT = 0;
    journal('↻', `Reintento de «${m.title}»`); note('↻', `Otra oportunidad: ${m.steps[C().step].label}`, 'mission');
    enterStep();
  }

  /* ---------- verificación ---------- */
  function need(st) { return st.need || 1; }
  function bump(st, n = 1) {
    C().prog.n = Math.min(need(st), (C().prog.n || 0) + n);
    if (C().prog.n >= need(st) - 1e-6) advance();
  }
  function checkNow() {
    const m = cur(), st = curStep(); if (!m || !st || C().status[m.id] !== 'active') return;
    const def = STEPS[st.id]; if (!def) return;
    if (def.inc) { const ok = INC_STATES[st.id]; if (R.inc && ok.includes(R.incState)) advance(); return; }
    if (def.cond && !def.meter && def.cond()) return advance();
    if (def.meter === 'drive' && C().prog.n >= need(st) && def.cond2()) return advance();
  }
  /** eventos reales del juego (desde main: onEvent, pantallas de la vida civil, charla con vecinos, cámara) */
  function event(type, d) {
    if (type === 'incident' && R.inc && d && d.incidentId === R.inc) {
      R.incState = d.state;
      if (END.includes(d.state) && d.state !== 'complete') fail(d.state === 'escaped' ? 'el ladrón se escapó' : d.state === 'expired' ? 'se terminó el tiempo' : 'te alejaste del lugar');
      else checkNow();
      return;
    }
    const m = cur(), st = curStep(); if (!m || !st || C().status[m.id] !== 'active') return;
    const def = STEPS[st.id]; if (!def) return;
    if (type === 'look' && def.meter === 'look') { bump(st, d); return; }
    if (def.ev === type && (!def.match || def.match(d))) { if (def.count) bump(st); else advance(); }
  }

  /* ---------- incidentes contextuales de la campaña ---------- */
  function ensureIncident(st, dt) {
    const def = STEPS[st.id];
    if (R.inc || R.failT > 0 || typeof def.inc !== 'string') return;
    if (home.inside || vehicles.driving || wardrobe.mode !== 'hero') return;
    const at = def.where();
    if (Math.hypot(at.x - P().pos.x, at.z - P().pos.z) > 70) return;
    R.spawnT -= dt; if (R.spawnT > 0) return;
    // sin trabas: si no hay vecinos caminando cerca (calidad baja = pocos vecinos, de noche menos), primero se amplía el
    // radio y después la campaña trae a un vecino que pasea por la vereda de esa manzana (se libera al terminar el paso)
    R.tries = (R.tries || 0) + 1;
    if (R.tries >= 3 && !R.extra.length && people.acquireAmbient) { R.relT = 0; }
    if (R.tries >= 3 && !R.extra.length && people.acquireAmbient) R.extra = people.acquireAmbient(1, { cx: at.x, cz: at.z, seed: 77 + C().fails });
    const r = incidents.force(def.inc, { near: { x: at.x, z: at.z }, maxR: R.tries >= 2 ? 110 : 60 });
    if (r.ok) { R.inc = r.id; R.incState = 'approach'; R.tries = 0; stats.forced++; journal('🆘', st.id === 'resolver_evento_nocturno' ? 'Un vecino pide ayuda en la noche' : 'Un vecino pide ayuda en la Plaza Mayor'); }
    else R.spawnT = 2;
  }
  /** el vecino que trajo la campaña se va a los 4 s (alcanza para que agradezca); now = ya (falla, partida nueva) */
  function releaseExtra(now = false) { R.tries = 0; if (!now && R.extra.length) { R.relT = 4; return; } if (R.extra.length && people.releaseAmbient) people.releaseAmbient(R.extra); R.extra = []; R.relT = 0; }

  /* ---------- roofs (azoteas distintas) ---------- */
  const _l = [];
  function roofKey() {
    const Pl = P(); if (!Pl.grounded || Pl.pos.y < 6 || home.inside) return null;
    for (const b of city.world.near(Pl.pos.x - 0.3, Pl.pos.z - 0.3, Pl.pos.x + 0.3, Pl.pos.z + 0.3, _l)) if (b.kind === 'building' && Math.abs(b.maxY - Pl.pos.y) < 0.8 && Pl.pos.x > b.minX - 0.2 && Pl.pos.x < b.maxX + 0.2 && Pl.pos.z > b.minZ - 0.2 && Pl.pos.z < b.maxZ + 0.2) return `${Math.round((b.minX + b.maxX) / 2)},${Math.round((b.minZ + b.maxZ) / 2)}`;
    return null;
  }

  /* ---------- actualización ---------- */
  function update(dt, playing) {
    if (!playing) return;
    const Pl = P();
    // reintento tras fallar / activar la siguiente misión disponible
    if (R.failT > 0 && (R.failT -= dt) <= 0) retry();
    if (R.relT > 0 && (R.relT -= dt) <= 0) releaseExtra(true);
    if (!C().cur) {
      const nx = Q.find(m => C().status[m.id] === 'available');
      if (nx && (R.availT -= dt) <= 0) activate(nx.id);
    } else if (C().status[C().cur] === 'failed' && R.failT <= 0) retry(); // partida guardada en «falló»
    // medidores del paso (tutorial): caminar, correr, manejar, azoteas
    const m = cur(), st = curStep();
    const p = Pl.pos, last = R.last; R.last = { x: p.x, z: p.z };
    if (m && st && C().status[m.id] === 'active') {
      const def = STEPS[st.id] || {};
      const step = last ? Math.hypot(p.x - last.x, p.z - last.z) : 0, real = step < 1; // > 1 m por paso = teletransporte
      if (def.meter === 'walk' && real && Pl.grounded && !vehicles.driving) bump(st, step);
      if (def.meter === 'sprint' && Pl.grounded && !vehicles.driving && Pl.speed2d > 8.5) bump(st, dt);
      if (def.meter === 'drive') { if (vehicles.driving && real) C().prog.n = Math.min(need(st), (C().prog.n || 0) + step); if (C().prog.n >= need(st) && def.cond2()) advance(); }
      if (def.meter === 'roofs') { const k = roofKey(); if (k && !C().prog.roofs.includes(k)) { C().prog.roofs.push(k); note('🏙', `Azotea ${C().prog.roofs.length}/${need(st)}`, 'step'); bump(st); } }
      if (def.inc) { ensureIncident(st, dt); checkNow(); }
      R.acc += dt; if (R.acc > 0.25) { R.acc = 0; checkNow(); }
    }
    // contexto: distritos descubiertos y niveles de reputación (los gastos nunca bajan la reputación)
    R.disc = (R.disc || 0) + dt;
    if (R.disc > 1) {
      R.disc = 0;
      if (!home.inside) { const d = ctx.districtAt(p.x, p.z); if (d && !C().visited.includes(d)) { C().visited.push(d); journal('🧭', `Descubriste: ${DISTRICT_NAMES[d] || d}`); if (C().visited.length > 1) note('🧭', `Descubriste: ${DISTRICT_NAMES[d] || d}`, 'info'); save.flush(); } }
      const t = tierOf(repTotal());
      if (t > C().tier) { C().tier = t; journal('⭐', `Reputación: ahora sos «${tiers[t].name}»`); note('⭐', `¡Reputación! Ahora sos «${tiers[t].name}»`, 'rep'); save.flush(); }
      else if (t < C().tier) C().tier = t;
    }
  }

  /* ---------- objetivo, mapa y diario ---------- */
  function target() {
    const m = cur(), st = curStep(); if (!m || !st || C().status[m.id] !== 'active') return null;
    const def = STEPS[st.id]; if (!def) return null;
    let t = null;
    if (def.inc) { if (R.inc) { const it = incidents.target(); if (it) t = { x: it.x, y: it.y || 0, z: it.z }; } if (!t && typeof def.inc === 'string') t = def.where(); else if (!t) t = plaza(); }
    else if (def.target) t = def.target();
    if (!t) return null;
    // marcadores con interiores: algo de adentro visto desde afuera → la puerta; algo de afuera visto desde adentro → la salida
    if (t.inside && !home.inside) return { ...door(), via: 'door' };
    if (!t.inside && home.inside) return { ...spot('salir'), via: 'exit' };
    return t;
  }
  function stepText(st) {
    const def = STEPS[st.id] || {}, hint = ctx.touch ? st.tc : st.kb;
    let prog = '';
    if (def.meter === 'roofs') prog = ` (${C().prog.roofs.length}/${need(st)})`;
    else if (def.count) prog = ` (${C().prog.n || 0}/${need(st)})`;
    else if (def.meter === 'walk') prog = ` (${(C().prog.n || 0).toFixed(1)}/${need(st)} m)`;
    const extra = def.note ? def.note() : '';
    return { text: `${st.label}${prog}`, hint: `${extra}${extra && hint ? ' · ' : ''}${hint || ''}` };
  }
  function objective() {
    const m = cur(), st = curStep(); if (!m || !st) return null;
    const Pl = P(), t = target();
    if (C().status[m.id] === 'failed') return { kind: 'HISTORIA', name: '★ ' + m.title, step: 'Falló: en unos segundos tenés otra oportunidad', dist: null, dy: 0, time: null };
    const needSuit = m.mode === 'hero' && wardrobe.mode !== 'hero' && STEPS[st.id] && STEPS[st.id].inc && !home.inside;
    const tx = stepText(st);
    return { kind: 'HISTORIA', name: '★ ' + m.title, step: `${C().step + 1}/${m.steps.length} · ${needSuit ? `Ponete el traje M (${ctx.touch ? 'botón M' : 'T'}) y ` : ''}${tx.text}`, hint: tx.hint, dist: t ? Math.hypot(Pl.pos.x - t.x, Pl.pos.z - t.z) : null, dy: t ? (t.y || 0) - Pl.pos.y : 0, time: null };
  }
  const api = {
    data, stats, STEPS, byId,
    get questline() { return Q; },
    get state() { return C(); },
    begin() { normalize(); if (C().cur && byId[C().cur]) { const m = cur(); if (C().status[m.id] === 'failed') retry(); else { const fi = firstIncStep(m); if (fi >= 0 && C().step > fi && STEPS[m.steps[C().step].id].inc) { C().step = fi; save.flush(); } } } else if (!C().cur) R.availT = 1.5; },
    update, event, target, objective, activate, journal,
    tier: () => tiers[tierOf(repTotal())], repTotal, tiers,
    /** frase de un vecino que reconoce tu progreso (o null) */
    npcLine() { const t = tierOf(repTotal()); return t < 1 ? null : ['', '¡Hola, Mateo! Ya todos te conocen en el barrio.', '¡Gracias por ayudar a los vecinos, Mateo! Sos un gran ayudante.', '¡El héroe del barrio! Mi familia te manda saludos.', '¡El Guardián de Ciudad de Altura en persona! ¡Gracias por cuidarnos!'][t]; },
    /** partida nueva: el estado guardado ya se reinició; se limpia lo que vive sólo en memoria */
    reset() { releaseExtra(true); Object.assign(R, { inc: null, incState: '', retryT: 0, failT: 0, availT: 1.5, last: null, acc: 0, spawnT: 0 }); normalize(); },
    get incidentId() { return R.inc; },
    info() {
      const m = cur(), st = curStep();
      return { cur: C().cur, step: C().step, stepId: st ? st.id : '', status: { ...C().status }, prog: { n: +(C().prog.n || 0).toFixed(2), roofs: C().prog.roofs.slice() }, done: { ...C().done }, fails: C().fails, journal: C().journal.slice(), visited: C().visited.slice(), tier: tiers[tierOf(repTotal())].name, rep: repTotal(), inc: R.inc, incState: R.incState, failT: +R.failT.toFixed(2), target: target(), objective: objective(), stats: { ...stats }, unknownSteps: Q.flatMap(q => q.steps.map(s => s.id)).filter(id => !STEPS[id]), missions: Q.length, title: m ? m.title : '' };
    },
    /** pruebas: completa el paso actual como si se cumpliera (sólo ?debug) */
    debugStep() { if (cur()) advance(); },
  };
  return api;
}
