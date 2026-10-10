import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAMES, CATEGORIES, getGame, gameForPath } from '../../games/registry.js';
import { filterGames, recommend, bestText, fmtTime, totals, validateEntry, norm, sortKey } from '../../matelabs/catalog.js';

const noInfo = () => ({ best: 0, plays: 0, timeMs: 0, last: 0 });
const base = { cat: 'todos', query: '', sort: 'featured', favs: new Set(), info: noInfo, categories: CATEGORIES };

describe('registro de juegos', () => {
  it('cada entrada es válida y su archivo existe', () => {
    for (const g of GAMES) {
      expect(validateEntry(g), g.id).toEqual([]);
      expect(existsSync(resolve(import.meta.dirname, '../..', g.file)), g.file).toBe(true);
      expect(CATEGORIES[g.category], g.id).toBeTruthy();
    }
  });
  it('ids y archivos son únicos', () => {
    expect(new Set(GAMES.map(g => g.id)).size).toBe(GAMES.length);
    expect(new Set(GAMES.map(g => g.file)).size).toBe(GAMES.length);
  });
  it('getGame y gameForPath', () => {
    expect(getGame('clavado').file).toBe('clavado.html');
    expect(gameForPath('/sub/NEON_SURVIVOR.html').id).toBe('neon_survivor');
    expect(gameForPath('/nada.html')).toBeUndefined();
  });
  it('validateEntry detecta errores', () => {
    expect(validateEntry({ id: 'X Y', accent: 'rojo', score: 'mucho' }).length).toBeGreaterThan(3);
  });
});

describe('catálogo', () => {
  it('sin filtros devuelve todo en el orden del registro', () => {
    expect(filterGames(GAMES, base).list.map(g => g.id)).toEqual(GAMES.map(g => g.id));
  });
  it('filtra por categoría', () => {
    const { list } = filterGames(GAMES, { ...base, cat: 'carreras' });
    expect(list.map(g => g.id)).toEqual(['turbo_furia']);
  });
  it('favoritos', () => {
    const { list } = filterGames(GAMES, { ...base, cat: 'favoritos', favs: new Set(['torre_infinita', 'clavado']) });
    expect(list.map(g => g.id)).toEqual(['clavado', 'torre_infinita']);
  });
  it('búsqueda sin tildes, por varias palabras y por tecnología', () => {
    expect(filterGames(GAMES, { ...base, query: 'VALLE encantádo' }).list.map(g => g.id)).toEqual(['valle_encantado']);
    expect(filterGames(GAMES, { ...base, query: 'three' }).list.length).toBe(3);
    expect(filterGames(GAMES, { ...base, query: 'zzzz' }).list).toEqual([]);
  });
  it('ordena por más jugados y por recientes', () => {
    const info = g => ({ ...noInfo(), plays: g.id === 'fruta_furia' ? 9 : g.id === 'clavado' ? 2 : 0, last: g.id === 'turbo_furia' ? 99 : 0 });
    expect(filterGames(GAMES, { ...base, info, sort: 'played' }).list.slice(0, 2).map(g => g.id)).toEqual(['fruta_furia', 'clavado']);
    expect(filterGames(GAMES, { ...base, info, sort: 'recent' }).list[0].id).toBe('turbo_furia');
  });
  it('A→Z ignora signos de exclamación', () => {
    const ids = filterGames(GAMES, { ...base, sort: 'az' }).list.map(g => g.id);
    expect(ids[0]).toBe('clavado');
    expect(sortKey('¡SALVA AL REY!')).toBe('salva al rey');
  });
  it('recomienda la misma categoría primero y nunca el mismo juego', () => {
    const recs = recommend(getGame('clavado'), GAMES, noInfo);
    expect(recs).toHaveLength(3);
    expect(recs.map(g => g.id)).not.toContain('clavado');
    expect(recs.slice(0, 2).every(g => g.category === 'reflejos')).toBe(true);
  });
  it('bestText / fmtTime / totals / norm', () => {
    expect(bestText(getGame('clavado'), 0)).toBe('—');
    expect(bestText(getGame('clavado'), 42)).toBe('42 puntos');
    expect(bestText(getGame('salva_al_rey'), 3)).toBe('oleada 3');
    expect(bestText(getGame('muerte_gloriosa'), 3)).toBe('3 niveles superados');
    expect(fmtTime(10_000)).toBe('< 1 min');
    expect(fmtTime(125 * 60_000)).toBe('2 h 5 min');
    expect(totals(GAMES, g => ({ ...noInfo(), plays: 1, timeMs: 10 }))).toEqual({ plays: GAMES.length, timeMs: GAMES.length * 10, tried: GAMES.length });
    expect(norm('Ñandú ÁRBOL')).toBe('nandu arbol');
  });
});

describe('filtro 3D', () => {
  it('devuelve sólo los juegos con Three.js/WebGL', () => {
    const ids = filterGames(GAMES, { ...base, cat: '3d' }).list.map(g => g.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain('turbo_furia');
    expect(ids).not.toContain('clavado');
  });
});
