// @ts-check
/* Cocina del Caos — Pipo, el pinche: ayudante con encargos seleccionables (IA simple con máquina de estados)
   y buscador de caminos por baldosas (BFS) que comparten el ayudante y los roedores. */
import { ING, TS } from './config.js';

/** BFS sobre baldosas transitables. Devuelve centros de baldosa desde la siguiente a la de inicio hasta la destino. */
export function makePather(K) {
  const N = K.W * K.H, prev = new Int32Array(N), queue = new Int32Array(N);
  return function path(x, z, tx, tz) {
    const a = K.cellOf(x, z), b = K.cellOf(tx, tz);
    const clampC = c => Math.max(0, Math.min(K.W - 1, c)), clampR = r => Math.max(0, Math.min(K.H - 1, r));
    const s = clampR(a.rw) * K.W + clampC(a.c), g = clampR(b.rw) * K.W + clampC(b.c);
    prev.fill(-1); prev[s] = s;
    let h = 0, t = 0; queue[t++] = s;
    while (h < t) {
      const i = queue[h++]; if (i === g) break;
      const c = i % K.W, r = (i / K.W) | 0;
      for (let k = 0; k < 4; k++) {
        const nc = c + (k === 0 ? 1 : k === 1 ? -1 : 0), nr = r + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nc < 0 || nr < 0 || nc >= K.W || nr >= K.H) continue;
        const j = nr * K.W + nc;
        if (prev[j] !== -1 || (!K.walkable(nc, nr) && j !== g)) continue;
        prev[j] = i; queue[t++] = j;
      }
    }
    if (prev[g] === -1) return null;
    const out = [];
    for (let i = g; i !== s; i = prev[i]) out.push({ x: K.X(i % K.W), z: K.Z((i / K.W) | 0) });
    out.reverse();
    if (out.length) out.pop(); // la última baldosa la resuelve el destino exacto
    return out;
  };
}

export const TASKS = [
  { id: 'lavar', icon: '🧼', name: 'Lavar platos', desc: 'Junta los platos sucios y los lava' },
  { id: 'picar', icon: '🔪', name: 'Picar ingredientes', desc: 'Prepara lo que piden los pedidos abiertos' },
  { id: 'limpiar', icon: '🧯', name: 'Emergencias', desc: 'Apaga fuegos, limpia derrames y corre roedores' },
  { id: 'seguir', icon: '🤝', name: 'Seguirte', desc: 'Te acompaña sin tocar nada' },
];

/** @param {any} G contexto (sim, K, path, player, fx) */
export function createHelper(G) {
  const A = { x: 0, z: 0, yaw: 0, hold: /** @type {any} */ (null), slow: 1.35, task: 'lavar', st: 'idle', goal: /** @type {any} */ (null), path: /** @type {any} */ (null), pi: 0, walk: 0, think: 0, busy: 0, stuck: 0, lx: 0, lz: 0, working: 0, msg: '' };
  const sim = () => G.sim, K = () => G.K;
  function reset(x, z) { Object.assign(A, { x, z, yaw: 0, hold: null, st: 'idle', goal: null, path: null, pi: 0, think: 0, busy: 0, working: 0 }); }
  function setTask(id) { if (!TASKS.some(t => t.id === id) || A.task === id) return false; A.task = id; drop(); A.goal = null; A.path = null; A.think = 0; return true; }

  /** Lugar de acceso a una estación (baldosa de piso enfrente). */
  const access = st => ({ x: st.x + st.fx * TS, z: st.z + st.fz * TS });
  function goTo(x, z, then) { A.goal = { x, z, then }; A.path = G.path(A.x, A.z, x, z); A.pi = 0; if (!A.path) { A.goal = null; return false; } return true; }
  function goStation(st, then) { const p = access(st); return goTo(p.x, p.z, () => { A.yaw = Math.atan2(st.x - A.x, st.z - A.z); then(st); }); }
  function drop() {
    if (!A.hold) return;
    const S = sim(); const free = K().stations.filter(s => s.type === 'counter' && !s.item && s.fire === 0);
    if (A.hold.t === 'dirty' && S.ret) { S.ret.dirty += A.hold.n; A.hold = null; return; }
    if (free.length) { const s = free.reduce((a, b) => (Math.hypot(a.x - A.x, a.z - A.z) < Math.hypot(b.x - A.x, b.z - A.z) ? a : b)); s.item = A.hold; }
    A.hold = null;
  }

  /* ---------- decisiones por encargo ---------- */
  function neededChop() {
    const S = sim().S, need = new Map();
    for (const o of S.orders) for (const p of G.RECIPES[o.recipe].parts) {
      const [ing, st] = p.split(':');
      if (st === 'picado' || (st === 'asado' && ING[ing] && ING[ing].oven === 'picado')) need.set(ing, (need.get(ing) || 0) + 1);
      if (st === 'cocido') { const src = Object.keys(ING).find(k => ING[k].pot && ING[k].pot.out === ing && ING[k].pot.from === 'picado'); if (src) need.set(src, (need.get(src) || 0) + ING[src].pot.need); }
    }
    // descontar lo que ya está en la cocina
    for (const s of K().stations) {
      const it = s.item; if (it && it.t === 'ing' && need.has(it.ing) && it.st !== 'quemado') need.set(it.ing, need.get(it.ing) - 1);
      if (s.pot && s.pot.ing && need.has(s.pot.ing)) need.set(s.pot.ing, need.get(s.pot.ing) - s.pot.n);
    }
    const prepared = K().stations.filter(s => s.item && s.item.t === 'ing' && s.item.st === 'picado').length;
    if (prepared >= 4) return null;
    for (const [ing, n] of need) if (n > 0 && K().stations.some(s => s.type === 'fridge' && s.ing === ing)) return ing;
    return null;
  }
  function think() {
    const S = sim(), k = K();
    if (A.task === 'seguir') { const P = G.player; const d = Math.hypot(P.x - A.x, P.z - A.z); if (d > 2.2) goTo(P.x - Math.sin(P.yaw) * 1.3, P.z - Math.cos(P.yaw) * 1.3, () => {}); A.msg = 'Te sigo, jefe'; return; }
    if (A.task === 'limpiar') {
      const fire = k.stations.filter(s => s.fire > 0).sort((a, b) => Math.hypot(a.x - A.x, a.z - A.z) - Math.hypot(b.x - A.x, b.z - A.z))[0];
      if (fire) { A.msg = '¡Fuego! Voy'; goStation(fire, st => { A.working = 0.01; A.workTg = { kind: 'station', ref: st }; }); return; }
      const sp = S.S.spills[0];
      if (sp) { A.msg = 'Limpio el derrame'; goTo(sp.x, sp.z, () => { A.working = 0.01; A.workTg = { kind: 'spill', ref: sp }; }); return; }
      const rat = S.S.rats.find(r => r.st !== 'flee' || r.carry);
      if (rat) { A.msg = '¡Fuera, roedor!'; goTo(rat.x, rat.z, () => {}); A.chase = rat; return; }
      A.msg = 'Todo en orden'; return;
    }
    if (A.task === 'lavar') {
      if (A.hold && A.hold.t === 'dirty') { const sink = k.stations.find(s => s.type === 'sink' && s.fire === 0); if (sink) { A.msg = 'Al fregadero'; goStation(sink, st => { sim().tap(A, { kind: 'station', ref: st }); }); } return; }
      if (A.hold) { drop(); return; }
      const sink = k.stations.find(s => s.type === 'sink' && s.dirty > 0 && s.fire === 0);
      if (sink) { A.msg = 'Lavando'; goStation(sink, st => { A.working = 0.01; A.workTg = { kind: 'station', ref: st }; }); return; }
      if (S.ret && S.ret.dirty > 0 && S.ret.fire === 0) { A.msg = 'Busco los platos sucios'; goStation(S.ret, st => { sim().tap(A, { kind: 'station', ref: st }); }); return; }
      A.msg = 'No hay platos sucios'; return;
    }
    if (A.task === 'picar') {
      if (A.hold && A.hold.t === 'ing' && A.hold.st === 'crudo' && ING[A.hold.ing].chop) {
        const boards = k.stations.filter(s => s.type === 'board' && !s.item && s.fire === 0);
        if (!boards.length) { A.msg = 'No hay tabla libre'; drop(); return; }
        const b = boards.reduce((a, c) => (Math.hypot(a.x - A.x, a.z - A.z) < Math.hypot(c.x - A.x, c.z - A.z) ? a : c));
        A.msg = 'Pico ' + ING[A.hold.ing].name.toLowerCase();
        goStation(b, st => { if (sim().tap(A, { kind: 'station', ref: st })) { A.working = 0.01; A.workTg = { kind: 'station', ref: st }; } });
        return;
      }
      if (A.hold) { drop(); return; }
      const ing = neededChop();
      if (!ing) { A.msg = 'Nada para picar'; return; }
      const fr = k.stations.find(s => s.type === 'fridge' && s.ing === ing && s.fire === 0);
      if (fr) { A.msg = 'Busco ' + ING[ing].name.toLowerCase(); goStation(fr, st => { sim().tap(A, { kind: 'station', ref: st }); }); }
    }
  }

  function update(dt) {
    const lx = A.x, lz = A.z;
    if (A.working > 0) {
      const tg = A.workTg;
      const p = sim().work(A, tg, dt);
      A.working += dt;
      if (p < 0 || p >= 1 || A.working > 8 || (tg.kind === 'station' && tg.ref.fire === 0 && A.task === 'limpiar')) { A.working = 0; A.workTg = null; A.think = 0.25; }
      A.walk = 0;
      return;
    }
    if (A.goal) {
      let arrived = false;
      if (A.chase) { A.goal.x = A.chase.x; A.goal.z = A.chase.z; if (!sim().S.rats.includes(A.chase)) { A.chase = null; A.goal = null; A.think = 0.2; return; } }
      if (A.path && A.pi < A.path.length) { const p = A.path[A.pi]; if (step(p.x, p.z, dt)) A.pi++; }
      else arrived = step(A.goal.x, A.goal.z, dt);
      if (arrived) { const g = A.goal; A.goal = null; A.chase = null; g.then && g.then(); A.think = 0.35; }
      // atascado: replanear
      const mv = Math.hypot(A.x - lx, A.z - lz);
      A.stuck = mv < dt * 0.3 ? A.stuck + dt : 0;
      if (A.stuck > 1.5) { A.stuck = 0; A.goal = null; A.path = null; A.think = 0.3; }
    } else {
      A.think -= dt;
      if (A.think <= 0) { A.think = 0.6; think(); }
    }
    A.walk = Math.hypot(A.x - lx, A.z - lz) / Math.max(dt, 1e-4);
  }
  function step(tx, tz, dt) {
    const dx = tx - A.x, dz = tz - A.z, d = Math.hypot(dx, dz);
    if (d < 0.08) return true;
    const sp = 3.2 * (sim().zeroG ? 0.75 : 1), s = Math.min(d, sp * dt);
    A.x += dx / d * s; A.z += dz / d * s;
    const ty = Math.atan2(dx, dz); let dy = ty - A.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); A.yaw += dy * Math.min(1, dt * 12);
    return d < 0.1;
  }
  return { A, reset, setTask, update, drop, get task() { return A.task; } };
}
