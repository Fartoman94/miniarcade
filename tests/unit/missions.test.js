import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let M;
const MISSIONS = [
  { id: 'p1', kind: 'primary', title: 'Llegá al nivel 3', event: 'level', target: 3, mode: 'max' },
  { id: 's1', title: 'Cortá 10 manzanas', event: 'apple', target: 10 },
  { id: 's2', title: 'Sin fallar', event: 'hit', target: 5, failOn: 'miss' },
  { id: 's3', title: 'Ganá la partida', event: 'win', target: 1, requireWin: true },
  { id: 's4', title: 'Sólo en difícil', event: 'x', target: 1, difficulties: ['dificil', 'extremo'] },
];

beforeAll(() => {
  localStorage.clear();
  (0, eval)(readFileSync(resolve(import.meta.dirname, '../../matelabs/missions.js'), 'utf8'));
  M = window.MLMissions;
  M.setup({ gameId: 'test', missions: MISSIONS, secondaryPerRun: 2 });
});
beforeEach(() => { if (M.state().running) M.runEnd(); });
/** Arranca partidas hasta que la misión pedida esté en juego (la rotación es determinista). */
function startWith(id) {
  for (let i = 0; i < 8; i++) { M.runStart(); if (M.state().current.some(c => c.id === id)) return; M.runEnd(); }
  throw new Error('la misión ' + id + ' nunca salió');
}

describe('MLMissions', () => {
  it('valida ids duplicados y targets inválidos', () => {
    expect(() => M.setup({ gameId: 'x', missions: [{ id: 'a', title: 'a', event: 'e', target: 1 }, { id: 'a', title: 'b', event: 'e', target: 1 }] })).toThrow(/duplicada/);
    expect(() => M.setup({ gameId: 'x', missions: [{ id: 'a', title: 'a', event: 'e', target: 0 }] })).toThrow(/target/);
    M.setup({ gameId: 'test', missions: MISSIONS, secondaryPerRun: 2 });
  });
  it('cada partida tiene la principal y 2 secundarias, sin las de otra dificultad', () => {
    M.runStart();
    const cur = M.state().current;
    expect(cur[0].id).toBe('p1');
    expect(cur).toHaveLength(3);
    expect(cur.map(c => c.id)).not.toContain('s4');
  });
  it('modo max y modo count, con aviso y logro persistente', () => {
    M.runStart();
    const ids = M.state().current.map(c => c.id);
    M.emit('level', 2); M.emit('level', 1);
    expect(M.state().current.find(c => c.id === 'p1')).toMatchObject({ progress: 2, status: 'active' });
    M.emit('level', 3);
    expect(M.state().current.find(c => c.id === 'p1').status).toBe('done');
    expect(JSON.parse(localStorage.getItem('ml:missions')).test.done.p1).toBe(1);
    if (ids.includes('s1')) { for (let i = 0; i < 10; i++) M.emit('apple'); expect(M.state().current.find(c => c.id === 's1').status).toBe('done'); }
  });
  it('failOn hace fallar la misión en la partida', () => {
    // forzar que s2 esté en juego: rotar hasta que salga
    startWith('s2');
    M.emit('hit'); M.emit('miss'); for (let i = 0; i < 5; i++) M.emit('hit');
    expect(M.state().current.find(c => c.id === 's2').status).toBe('failed');
  });
  it('requireWin sólo se cumple al ganar; lo pendiente falla al terminar', () => {
    startWith('s3');
    M.emit('win');
    expect(M.state().current.find(c => c.id === 's3').status).toBe('active');
    const sum = M.runEnd({ won: true });
    expect(sum.find(c => c.id === 's3').status).toBe('done');
    M.runStart(); const s = M.runEnd({ won: false });
    expect(s.every(c => c.status !== 'active')).toBe(true);
  });
  it('eventos fuera de partida se ignoran', () => {
    const before = JSON.stringify(M.state().current);
    M.emit('apple', 5);
    expect(JSON.stringify(M.state().current)).toBe(before);
  });
  it('prioriza secundarias nunca completadas', () => {
    localStorage.setItem('ml:missions', JSON.stringify({ test: { done: { s1: 3 }, runs: 0 } }));
    M.runStart();
    const sec = M.state().current.filter(c => c.kind !== 'primary').map(c => c.id);
    expect(sec).not.toContain('s1');
  });
  it('dificultad por juego: default normal, persiste, ignora valores inválidos y habilita misiones', () => {
    expect(M.difficulty()).toBe('normal');
    M.setDifficulty('dificil');
    expect(M.difficulty()).toBe('dificil');
    M.setDifficulty('imposible');
    expect(M.difficulty()).toBe('dificil');
    localStorage.setItem('ml:missions', JSON.stringify({ test: { done: { s1: 1, s2: 1, s3: 1 }, runs: 0 } }));
    M.runStart();
    expect(M.state().current.map(c => c.id)).toContain('s4');
    M.setDifficulty('normal');
  });
  it('selector de dificultad accesible', () => {
    const box = document.createElement('div'); document.body.appendChild(box);
    M.difficultyPicker(box);
    const btns = box.querySelectorAll('[role=radio]');
    expect(btns).toHaveLength(4);
    expect(box.querySelector('[aria-checked=true]').dataset.d).toBe('normal');
    box.querySelector('[role=radiogroup]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(M.difficulty()).toBe('dificil');
    btns[0].click();
    expect(M.difficulty()).toBe('facil');
    M.setDifficulty('normal');
  });
  it('progressOf para el portal', () => {
    localStorage.setItem('ml:missions', JSON.stringify({ test: { done: { p1: 2, s1: 1 }, runs: 5 } }));
    expect(M.progressOf('test', 5)).toEqual({ done: 2, total: 5 });
    expect(M.progressOf('otro', 3)).toEqual({ done: 0, total: 3 });
  });
});
