// @ts-check
/* Lógica pura del catálogo (sin DOM): filtros, búsqueda, orden y recomendaciones.
   La usa matelabs/portal.js y la prueban tests/unit/catalog.test.js. */

/** @typedef {import('../games/registry.js').GameMeta} GameMeta */
/** @typedef {{best:number, plays:number, timeMs:number, last:number}} GameInfo */

/** Normaliza para buscar sin tildes ni mayúsculas. @param {string} s */
export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Título ordenable: sin signos (¡, !) ni tildes. @param {string} s */
export const sortKey = s => norm(s).replace(/[^a-z0-9 ]/g, '').trim();

/**
 * @param {GameMeta[]} games
 * @param {{cat:string, query:string, sort:string, favs:Set<string>, info:(g:GameMeta)=>GameInfo, categories:Record<string,string>}} o
 */
export function filterGames(games, { cat, query, sort, favs, info, categories }) {
  const q = norm(query.trim());
  let list = games.filter(g => cat === 'todos' || (cat === 'favoritos' ? favs.has(g.id) : cat === '3d' ? /three\.js|webgl/i.test(g.tech) : g.category === cat));
  if (q) {
    const words = q.split(/\s+/);
    list = list.filter(g => {
      const hay = norm([g.title, g.description, g.tech, categories[g.category] || '', ...g.tags, g.controls.pc, g.controls.touch].join(' '));
      return words.every(w => hay.includes(w));
    });
  }
  /** @type {Record<string, GameInfo>} */
  const s = Object.fromEntries(list.map(g => [g.id, info(g)]));
  list = list.slice();
  if (sort === 'played') list.sort((a, b) => s[b.id].plays - s[a.id].plays);
  else if (sort === 'recent') list.sort((a, b) => s[b.id].last - s[a.id].last);
  else if (sort === 'az') list.sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));
  return { list, stats: s };
}

/**
 * Recomendaciones: misma categoría pesa más, después juegos que todavía no probó, después misma tecnología.
 * Empates: se respeta el orden del registro (estable).
 * @param {GameMeta} game @param {GameMeta[]} games @param {(g:GameMeta)=>GameInfo} info @param {number} [n]
 */
export function recommend(game, games, info, n = 3) {
  return games.filter(x => x.id !== game.id)
    .map((x, i) => ({ x, i, w: (x.category === game.category ? 3 : 0) + (info(x).plays ? 0 : 2) + (x.tech === game.tech ? 1 : 0) }))
    .sort((a, b) => b.w - a.w || a.i - b.i).slice(0, n).map(r => r.x);
}

/** Texto del récord según el tipo de puntaje. @param {GameMeta} g @param {number} best */
export function bestText(g, best) {
  if (!best || g.score === 'none') return '—';
  return g.score === 'level' ? `${g.scoreLabel} ${best}` : `${best} ${g.scoreLabel}`;
}

/** @param {number} ms */
export function fmtTime(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return '< 1 min';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Totales globales del jugador. @param {GameMeta[]} games @param {(g:GameMeta)=>GameInfo} info */
export function totals(games, info) {
  const all = games.map(info);
  return {
    plays: all.reduce((a, s) => a + s.plays, 0),
    timeMs: all.reduce((a, s) => a + s.timeMs, 0),
    tried: all.filter(s => s.plays).length,
  };
}

/** Valida una entrada del registro; devuelve la lista de problemas (vacía si está bien). @param {any} g */
export function validateEntry(g) {
  const errs = [];
  for (const k of ['id', 'file', 'title', 'icon', 'accent', 'category', 'tech', 'description']) if (typeof g[k] !== 'string' || !g[k]) errs.push(`falta ${k}`);
  if (g.id && !/^[a-z0-9_]+$/.test(g.id)) errs.push('id inválido');
  if (g.accent && !/^#[0-9a-f]{6}$/i.test(g.accent)) errs.push('accent debe ser #rrggbb');
  if (!Array.isArray(g.tags)) errs.push('tags debe ser lista');
  if (!g.controls || !g.controls.pc || !g.controls.touch) errs.push('controls.pc y controls.touch son obligatorios');
  if (!['high', 'level', 'none'].includes(g.score)) errs.push('score inválido');
  return errs;
}
