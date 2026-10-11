// Mateo: Ciudad de Altura — redes de navegación separadas (V2 P1):
//  · red PEATONAL: anillo de vereda por manzana (esquinas y medios sobre la línea de caminata, libre de mobiliario) y
//    cruces por las sendas peatonales (con semáforo en el centro; sin tránsito en el Barrio del Sol), más el enlace
//    centro ↔ barrio por las veredas de las calles E-O.
//  · red VIAL: cruces (nodos) y tramos de calle (aristas con dos carriles), centro + barrio.
// Validador de continuidad: conectividad de ambas redes, sin calles sin salida, sin tramos tapados por sólidos, sin
// tramos sobre el agua, sin manzanas vacías. Búsqueda de huida para los villanos (alejarse de Mateo por la vereda).

const SOLID = new Set(['building', 'prop', 'pole', 'tree', 'fence', 'fountain', 'parapet', 'beam', 'car']);

export function createNav(city, district) {
  const E = city.walkE, R = city.roads, P = city.P_BLOCK, N = city.N;
  const nodes = [], adj = [];
  const key = new Map();
  const node = (x, z, info = {}) => { const k = `${Math.round(x * 10)},${Math.round(z * 10)}`; if (key.has(k)) return key.get(k); const n = { id: nodes.length, x, z, ...info }; nodes.push(n); adj.push([]); key.set(k, n.id); return n.id; };
  const edge = (a, b, kind, extra = {}) => { if (a === b || adj[a].some(e => e.to === b)) return; const len = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); adj[a].push({ to: b, kind, len, ...extra }); adj[b].push({ to: a, kind, len, ...extra }); };
  const CORN = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  // manzanas: [cx, cz, distrito, señal]
  const blocks = [];
  for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) blocks.push({ id: `c_${bx}_${bz}`, cx: city.blockCenter(bx), cz: city.blockCenter(bz), d: 'centro', bx, bz });
  if (district) for (const b of district.blocks) blocks.push({ id: b.id, cx: b.cx, cz: b.cz, d: 'sol' });
  const ring = new Map();
  for (const b of blocks) {
    const ids = [];
    for (let k = 0; k < 4; k++) {
      const [sx, sz] = CORN[k], [tx, tz] = CORN[(k + 1) % 4];
      ids.push(node(b.cx + sx * E, b.cz + sz * E, { block: b.id, d: b.d, corner: k }));
      ids.push(node(b.cx + (sx + tx) / 2 * E, b.cz + (sz + tz) / 2 * E, { block: b.id, d: b.d }));
    }
    for (let i = 0; i < ids.length; i++) edge(ids[i], ids[(i + 1) % ids.length], 'walk');
    ring.set(b.id, ids);
  }
  const cornerOf = (b, sx, sz) => ring.get(b.id)[CORN.findIndex(c => c[0] === sx && c[1] === sz) * 2];
  const byPos = new Map(blocks.map(b => [`${b.d}:${Math.round(b.cx)},${Math.round(b.cz)}`, b]));
  const at = (d, x, z) => byPos.get(`${d}:${Math.round(x)},${Math.round(z)}`);
  // cruces entre manzanas vecinas (mismo distrito): sendas peatonales
  for (const b of blocks) for (const [sx, sz] of CORN) {
    const nx = at(b.d, b.cx + sx * P, b.cz), nz = at(b.d, b.cx, b.cz + sz * P);
    if (nx) edge(cornerOf(b, sx, sz), cornerOf(nx, -sx, sz), 'cross', { axis: 'z', signal: b.d === 'centro' });
    if (nz) edge(cornerOf(b, sx, sz), cornerOf(nz, sx, -sz), 'cross', { axis: 'x', signal: b.d === 'centro' });
  }
  // enlace centro ↔ Barrio del Sol: por la vereda de las calles E-O (cruza la última calle del centro con semáforo)
  if (district) for (const b of blocks) if (b.d === 'centro' && b.bx === 0) for (const sz of [-1, 1]) {
    const zl = b.cz + sz * E, tgt = district.blocks.find(o => Math.abs(o.cz - b.cz) < 1 && Math.abs(o.cx - district.roadsX[0] + P / 2) < 1);
    if (!tgt) continue;
    const a = cornerOf(b, -1, sz), m1 = node(R[0] - city.roadWidth / 2 - 2.6, zl, { d: 'enlace' }), m2 = node(district.roadsX[0] + city.roadWidth / 2 + 2.6, zl, { d: 'enlace' });
    edge(a, m1, 'cross', { axis: 'z', signal: true }); edge(m1, m2, 'walk'); edge(m2, cornerOf({ id: tgt.id }, 1, sz), 'cross', { axis: 'z', signal: false });
  }

  /* ---------- red vial ---------- */
  const rn = [], radj = [], rkey = new Map();
  const rnode = (x, z, d) => { const k = `${x},${z}`; if (rkey.has(k)) return rkey.get(k); rn.push({ id: rn.length, x, z, d }); radj.push([]); rkey.set(k, rn.length - 1); return rn.length - 1; };
  const redge = (a, b) => { if (!radj[a].includes(b)) { radj[a].push(b); radj[b].push(a); } };
  for (let i = 0; i < R.length; i++) for (let j = 0; j < R.length; j++) {
    const a = rnode(R[i], R[j], 'centro');
    if (i + 1 < R.length) redge(a, rnode(R[i + 1], R[j], 'centro'));
    if (j + 1 < R.length) redge(a, rnode(R[i], R[j + 1], 'centro'));
  }
  if (district) {
    const X = district.roadsX, Z = district.roadsZ;
    for (let i = 0; i < X.length; i++) for (let j = 0; j < Z.length; j++) {
      const a = rnode(X[i], Z[j], 'sol');
      if (i + 1 < X.length) redge(a, rnode(X[i + 1], Z[j], 'sol'));
      if (j + 1 < Z.length) redge(a, rnode(X[i], Z[j + 1], 'sol'));
    }
    for (const z of Z) if (R.includes(z)) redge(rnode(R[0], z, 'centro'), rnode(X[0], z, 'sol'));
  }

  function nearest(x, z, filter) { let best = -1, bd = 1e9; for (const n of nodes) { if (filter && !filter(n)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n.id; } } return best; }
  /** siguiente nodo para huir de (px,pz): maximiza la distancia, evita volver atrás y los cruces con rojo/autos cerca */
  function fleeNext(cur, prev, px, pz, ok, rand = Math.random) {
    let best = -1, bs = -1e9;
    for (const e of adj[cur]) {
      if (e.to === prev && adj[cur].length > 1) continue;
      if (e.kind === 'cross' && ok && !ok(e, nodes[cur], nodes[e.to])) continue;
      const n = nodes[e.to], s = Math.hypot(n.x - px, n.z - pz) - Math.hypot(nodes[cur].x - px, nodes[cur].z - pz) + rand() * 3;
      if (s > bs) { bs = s; best = e.to; }
    }
    return best >= 0 ? best : prev;
  }
  /** camino más corto (Dijkstra) entre dos nodos peatonales */
  function path(a, b) {
    const dist = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
    dist[a] = 0;
    for (;;) {
      let u = -1, du = Infinity; for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
      if (u < 0 || u === b) break; done[u] = 1;
      for (const e of adj[u]) if (du + e.len < dist[e.to]) { dist[e.to] = du + e.len; prev[e.to] = u; }
    }
    if (!Number.isFinite(dist[b])) return null;
    const out = []; for (let v = b; v >= 0; v = prev[v]) out.unshift(v); return out;
  }

  function reach(n, adjOf) { const seen = new Uint8Array(n), st = [0]; seen[0] = 1; let c = 1; while (st.length) { const u = st.pop(); for (const v of adjOf(u)) if (!seen[v]) { seen[v] = 1; c++; st.push(v); } } return c; }
  /** validador de continuidad (sólo lo que está cargado en el mundo de colisiones cuenta como obstáculo) */
  function validate(world) {
    const blockedPed = [], wetPed = [], tmp = [];
    for (let a = 0; a < nodes.length; a++) for (const e of adj[a]) {
      if (e.to < a) continue;
      const A = nodes[a], B = nodes[e.to], n = Math.max(2, Math.ceil(e.len / 0.5));
      for (let i = 0; i <= n; i++) {
        const x = A.x + (B.x - A.x) * i / n, z = A.z + (B.z - A.z) * i / n;
        if (!world.hasFloor(x, z)) { wetPed.push({ a, b: e.to, x: +x.toFixed(1), z: +z.toFixed(1) }); break; }
        const hit = world.near(x - 0.5, z - 0.5, x + 0.5, z + 0.5, tmp).find(b => SOLID.has(b.kind) && b.maxY > 0.3 && b.minY < 1.8 && x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3);
        if (hit) { blockedPed.push({ a, b: e.to, x: +x.toFixed(1), z: +z.toFixed(1), kind: hit.kind }); break; }
      }
    }
    const blockedRoad = [], wetRoad = [];
    for (let a = 0; a < rn.length; a++) for (const b of radj[a]) {
      if (b < a) continue;
      const A = rn[a], B = rn[b], len = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / len, uz = (B.z - A.z) / len;
      for (let t = 0; t <= len; t += 1) for (const lane of [-city.laneOffset, city.laneOffset]) {
        const x = A.x + ux * t - uz * lane, z = A.z + uz * t + ux * lane;
        if (!world.hasFloor(x, z)) { wetRoad.push({ a, b, x, z }); continue; }
        const hit = world.near(x - 1.2, z - 1.2, x + 1.2, z + 1.2, tmp).find(o => SOLID.has(o.kind) && o.maxY > 0.3 && o.minY < 2.5 && x > o.minX - 1.0 && x < o.maxX + 1.0 && z > o.minZ - 1.0 && z < o.maxZ + 1.0);
        if (hit) blockedRoad.push({ a, b, x: +x.toFixed(1), z: +z.toFixed(1), kind: hit.kind });
      }
    }
    const deadEnds = rn.filter(n => radj[n.id].length < 2).map(n => ({ x: n.x, z: n.z }));
    const empty = blocks.filter(b => b.d === 'centro' && !city.special[`${b.bx},${b.bz}`] && !city.buildings.some(o => Math.abs(o.x - b.cx) < 25 && Math.abs(o.z - b.cz) < 25)).map(b => b.id);
    return {
      ped: { nodes: nodes.length, edges: adj.reduce((s, l) => s + l.length, 0) / 2, reachable: reach(nodes.length, u => adj[u].map(e => e.to)), crossings: adj.reduce((s, l) => s + l.filter(e => e.kind === 'cross').length, 0) / 2, blocked: blockedPed.slice(0, 20), blockedCount: blockedPed.length, wet: wetPed.slice(0, 10), wetCount: wetPed.length },
      road: { nodes: rn.length, edges: radj.reduce((s, l) => s + l.length, 0) / 2, reachable: reach(rn.length, u => radj[u]), deadEnds, blocked: blockedRoad.slice(0, 20), blockedCount: blockedRoad.length, wetCount: wetRoad.length },
      emptyBlocks: empty, blocks: blocks.length,
    };
  }
  return { nodes, adj, blocks, roadNodes: rn, roadAdj: radj, nearest, fleeNext, path, validate };
}
