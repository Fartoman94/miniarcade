// Mateo: Ciudad de Altura — V2 P3: minimapa con RUTA y mapa completo con barrios, comercios, leyenda y filtros.
//  · Ruta: camino por la red peatonal real (nav.js, Dijkstra) desde Mateo hasta el objetivo actual (incidente, trabajo,
//    misión V1 o historia); se recalcula cada 1 s o si el objetivo cambia. Con el kart usa la misma red (veredas = calles).
//  · Marcadores dinámicos: si el objetivo queda fuera del minimapa, una flecha en el borde con la distancia; ↑/↓ si está
//    arriba (techo) o abajo; objetivos de adentro del departamento se marcan en la puerta (y al revés, la salida).
//  · Mapa completo (M o tocar el minimapa): norte arriba (la brújula del juego), distritos con nombre, calles, edificios,
//    comercios abiertos/cerrados, casa, Garaje M, kart, vecinos con misión, incidentes y objetivo; leyenda accesible con
//    filtros (se guardan en Ajustes). Debajo, la lista de lugares en texto (lectores de pantalla).

const WORLD = { x0: -410, x1: 340, z0: -275, z1: 275 }; // isla del centro + Barrio del Sol (hasta x = −404) + Puerto
const DNAME = { centro: 'CENTRO DE ALTURA', sol: 'BARRIO DEL SOL', puerto: 'PUERTO' };

export function createMapView(o) {
  const { city, district, nav, home, life, vehicles, incidents, quests, campaign, player } = o;
  const R = { pts: null, key: '', t: 0 };
  /** objetivo actual (el mismo orden que el HUD) */
  function goal() {
    const io = incidents.focus() && incidents.target();
    if (io && (incidents.focus().engaged || !quests.info().active)) return { x: io.x, y: io.y || 0, z: io.z, kind: 'ayuda' };
    const j = life.job; if (j && j.point) return { x: j.point.x, y: j.point.y || 0, z: j.point.z, kind: 'trabajo' };
    if (quests.info().active) { const t = quests.targetPoint(); return t ? { x: t.x, y: t.y || 0, z: t.z, kind: 'mision' } : null; }
    const t = campaign.target(); if (t) return { x: t.x, y: t.y || 0, z: t.z, kind: 'historia', via: t.via };
    return null;
  }
  function route(dt) {
    R.t -= dt;
    const g = goal(), P = player.P;
    if (!g || home.inside) { R.pts = null; R.key = ''; return null; }
    const key = `${Math.round(g.x)},${Math.round(g.z)}`;
    if (R.t > 0 && key === R.key && R.pts) { R.pts[0] = { x: P.pos.x, z: P.pos.z }; return R.pts; }
    R.t = 1; R.key = key;
    const d = Math.hypot(g.x - P.pos.x, g.z - P.pos.z);
    if (d < 25) { R.pts = [{ x: P.pos.x, z: P.pos.z }, { x: g.x, z: g.z }]; return R.pts; }
    const a = nav.nearest(P.pos.x, P.pos.z), b = nav.nearest(g.x, g.z);
    const ids = a >= 0 && b >= 0 ? nav.path(a, b) : null;
    R.pts = [{ x: P.pos.x, z: P.pos.z }, ...(ids || []).map(i => ({ x: nav.nodes[i].x, z: nav.nodes[i].z })), { x: g.x, z: g.z }];
    // no volver hacia atrás: si el primer nodo queda más lejos del objetivo que Mateo, se saltea
    if (R.pts.length > 2) { const n1 = R.pts[1], dn = Math.hypot(n1.x - g.x, n1.z - g.z); if (dn > d) R.pts.splice(1, 1); }
    return R.pts;
  }
  /** dibuja ruta + objetivo en el minimapa (ya rotado); X/Y: mundo → minimapa; W: tamaño del lienzo */
  function drawMini(c, X, Y, W, dt) {
    const pts = route(dt), g = goal(), P = player.P;
    if (pts && pts.length > 1) {
      c.strokeStyle = 'rgba(111,243,255,.85)'; c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round'; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(X(pts[0].x), Y(pts[0].z)); for (const p of pts.slice(1)) c.lineTo(X(p.x), Y(p.z)); c.stroke(); c.setLineDash([]);
    }
    if (!g || home.inside) return;
    const gx = X(g.x), gy = Y(g.z), r = Math.hypot(gx, gy), lim = W / 2 - 14;
    const col = g.kind === 'ayuda' ? '#ff6b5a' : g.kind === 'trabajo' ? '#7dffa0' : '#6ff3ff';
    if (r > lim) { // fuera del minimapa: flecha en el borde
      const k = lim / r; c.save(); c.translate(gx * k, gy * k); c.rotate(Math.atan2(gy, gx) + Math.PI / 2);
      c.fillStyle = col; c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 5); c.lineTo(-8, 5); c.closePath(); c.fill(); c.restore();
    } else { c.fillStyle = col; c.beginPath(); c.arc(gx, gy, 7, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    const dy = (g.y || 0) - P.pos.y;
    if (Math.abs(dy) > 4) { const k = r > lim ? lim / r * 0.78 : 1; c.save(); c.translate(gx * k, gy * k); c.fillStyle = '#fff'; c.font = '900 16px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(dy > 0 ? '▲' : '▼', 0, -16); c.restore(); }
  }

  /* ---------- mapa completo ---------- */
  function drawFull(cv, filters) {
    const c = cv.getContext('2d'), Wd = cv.width, Hd = cv.height, sc = Math.min(Wd / (WORLD.x1 - WORLD.x0), Hd / (WORLD.z1 - WORLD.z0));
    // norte (+z) arriba, este (−x) a la derecha: igual que la brújula y el minimapa mirando al norte
    const X = x => (WORLD.x1 - x) * sc, Y = z => (WORLD.z1 - z) * sc, P = player.P;
    c.fillStyle = '#2f6f99'; c.fillRect(0, 0, Wd, Hd);
    // tierra firme
    c.fillStyle = '#3a4c5e'; for (const f of city.world.floors || []) c.fillRect(X(f.maxX), Y(f.maxZ), (f.maxX - f.minX) * sc, (f.maxZ - f.minZ) * sc);
    c.fillStyle = '#4c6276'; const rw = city.roadWidth * sc;
    const cx0 = city.roads[0], cx1 = city.roads[city.roads.length - 1];
    for (const r of city.roads) { c.fillRect(X(r) - rw / 2, Y(cx1), rw, (cx1 - cx0) * sc); c.fillRect(X(cx1), Y(r) - rw / 2, (cx1 - cx0) * sc, rw); }
    if (district) {
      const zA = district.roadsZ[0], zB = district.roadsZ[district.roadsZ.length - 1], xE = district.roadsX[district.roadsX.length - 1];
      for (const z of district.roadsZ) c.fillRect(X(-199), Y(z) - rw / 2, (-199 - xE) * sc, rw);
      for (const x of district.roadsX) c.fillRect(X(x) - rw / 2, Y(zB), rw, (zB - zA) * sc);
      c.fillStyle = '#d9b48a'; for (const h of district.mapRects()) c.fillRect(X(h.x + h.w / 2), Y(h.z + h.d / 2), h.w * sc, h.d * sc);
    }
    for (const b of city.buildings) { c.fillStyle = b.type === 'tower' ? '#8fb3cf' : b.type === 'brick' ? '#b9806a' : '#a9b2ba'; c.fillRect(X(b.x + b.w / 2), Y(b.z + b.d / 2), b.w * sc, b.d * sc); }
    const L = city.landmarks;
    c.fillStyle = '#8f8a80'; c.fillRect(X(300), Y(130), 100 * sc, 260 * sc);
    c.fillStyle = '#5aa05a'; c.fillRect(X(L.parque.x + 22), Y(L.parque.z + 22), 44 * sc, 44 * sc);
    c.fillStyle = '#e8dcc0'; c.beginPath(); c.arc(X(L.plaza.x), Y(L.plaza.z), 9 * sc, 0, 7); c.fill();
    // nombres de los distritos (descubiertos o no: es la ciudad de Mateo)
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = "900 15px system-ui"; c.lineWidth = 4; c.strokeStyle = 'rgba(10,20,34,.85)'; c.fillStyle = '#fff';
    const label = (t, x, z) => { c.strokeText(t, X(x), Y(z)); c.fillText(t, X(x), Y(z)); };
    label(DNAME.centro, 0, 196); label(DNAME.sol, -318, 152); label(DNAME.puerto, 262, 150);
    const dot = (x, z, col, r = 5) => { c.fillStyle = col; c.beginPath(); c.arc(X(x), Y(z), r, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.5; c.stroke(); };
    if (filters.lugares) {
      c.fillStyle = '#ffcf3f'; c.fillRect(X(home.outside.x) - 7, Y(home.outside.z) - 7, 14, 14); c.fillStyle = '#1a1204'; c.font = '900 12px system-ui'; c.fillText('⌂', X(home.outside.x), Y(home.outside.z) + 1);
      c.fillStyle = '#6ff3ff'; c.font = '900 11px system-ui'; c.fillText('M', X(home.garage.x), Y(home.garage.z));
      if (vehicles.kart && !vehicles.driving) { c.fillStyle = '#6ff3ff'; c.fillRect(X(vehicles.kart.x) - 5, Y(vehicles.kart.z) - 4, 10, 8); }
    }
    if (filters.tiendas) for (const s of life.stores) dot(s.spot.x, s.spot.z, o.clock.isOpen(s.st.open) ? '#7dffa0' : '#888', 5);
    if (filters.misiones) {
      for (const n of quests.D.npcs) { const p = o.people.named[n.id]; if (p && p.marker.visible && !p.y) dot(p.x, p.z, '#ffcf3f', 5); }
      const t = campaign.target(); if (t) { c.strokeStyle = '#6ff3ff'; c.lineWidth = 3; c.beginPath(); c.arc(X(t.x), Y(t.z), 9, 0, 7); c.stroke(); }
      const j = life.job; if (j && j.point) { c.strokeStyle = '#7dffa0'; c.lineWidth = 3; c.beginPath(); c.arc(X(j.point.x), Y(j.point.z), 9, 0, 7); c.stroke(); }
    }
    if (filters.ayuda) for (const inc of incidents.active) { if (inc.state === 'approach') continue; dot(inc.loc.x, inc.loc.z, '#ff5a4a', 6); }
    // Mateo (afuera: su posición; adentro: la puerta de su casa)
    const px = home.inside ? home.outside.x : P.pos.x, pz = home.inside ? home.outside.z : P.pos.z;
    c.save(); c.translate(X(px), Y(pz)); c.rotate(-P.yaw + Math.PI); c.fillStyle = '#6ff3ff'; c.strokeStyle = '#0b1626'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath(); c.fill(); c.stroke(); c.restore();
    // brújula
    c.fillStyle = '#fff'; c.font = '900 13px system-ui'; c.fillText('N ▲', Wd - 26, 16);
  }
  /** lista de lugares en texto (accesible) con el mismo filtro */
  function places(filters) {
    const out = [];
    if (filters.lugares) { out.push({ i: '⌂', t: 'Tu casa (Barrio Las Glicinas, sobre la Avenida Prisma)' }); out.push({ i: 'M', t: 'Garaje M (frente a tu casa)' }); }
    if (filters.tiendas) for (const s of life.stores) out.push({ i: '🛒', t: `${s.st.name} · ${o.clock.isOpen(s.st.open) ? 'abierto' : 'cerrado'} (${s.st.open[0]}:00 a ${s.st.open[1]}:00)` });
    if (filters.ayuda) for (const inc of incidents.active) if (inc.state !== 'approach') out.push({ i: '🆘', t: `${inc.def.name} (${DNAME[inc.loc.district] || inc.loc.district})` });
    return out;
  }
  return { goal, route, drawMini, drawFull, places, get routePts() { return R.pts ? R.pts.map(p => ({ x: +p.x.toFixed(1), z: +p.z.toFixed(1) })) : null; } };
}
