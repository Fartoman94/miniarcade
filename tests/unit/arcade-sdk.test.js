import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(import.meta.dirname, '../../matelabs/arcade.js'), 'utf8');
let ML, game;

beforeAll(() => {
  localStorage.clear();
  (0, eval)(src);
  ML = window.MLArcade;
  game = { active: false, paused: 0, resumed: 0, restarted: 0, muted: null, keys: [] };
  ML.init({
    id: 'clavado', isActive: () => game.active,
    onPause: () => game.paused++, onResume: () => game.resumed++, onRestart: () => game.restarted++,
    onMute: m => { game.muted = m; },
  });
  window.addEventListener('keydown', e => game.keys.push(e.code));
});
beforeEach(() => { if (ML.isPaused()) ML.resume(); game.active = false; game.keys.length = 0; });

describe('MLArcade SDK', () => {
  it('se expone una sola vez y no permite doble init', () => {
    expect(ML.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(() => ML.init({ id: 'otro' })).toThrow();
  });
  it('arma barra y menú de pausa', () => {
    expect(document.querySelector('.mla-bar')).not.toBeNull();
    expect(document.querySelector('.mla-pause').hidden).toBe(true);
    expect(document.querySelector('.mla-bar a').getAttribute('href')).toMatch(/index\.html$/);
  });
  it('no pausa si el juego no está activo', () => {
    expect(ML.pause()).toBe(false);
    expect(ML.isPaused()).toBe(false);
  });
  it('Escape pausa durante la partida y el juego no recibe la tecla', () => {
    game.active = true;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect(ML.isPaused()).toBe(true);
    expect(game.paused).toBeGreaterThan(0);
    expect(game.keys).not.toContain('Escape');
    expect(document.querySelector('.mla-pause').hidden).toBe(false);
  });
  it('en pausa bloquea la entrada al juego', () => {
    game.active = true; ML.pause();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(game.keys).toEqual([]);
    ML.resume();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(game.keys).toEqual(['Space']);
  });
  it('Reiniciar desde el menú llama onRestart sin onResume', () => {
    game.active = true; ML.pause();
    const before = game.resumed;
    document.querySelector('.mla-pause [data-a="restart"]').click();
    expect(game.restarted).toBe(1);
    expect(game.resumed).toBe(before);
    expect(ML.isPaused()).toBe(false);
  });
  it('pestaña oculta pausa automáticamente', () => {
    game.active = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ML.isPaused()).toBe(true);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
  it('silencio: avisa al juego y persiste', () => {
    ML.settings.set('muted', true);
    expect(game.muted).toBe(true);
    expect(JSON.parse(localStorage.getItem('ml:settings')).muted).toBe(true);
    ML.settings.set('muted', false);
    expect(game.muted).toBe(false);
  });
  it('puntajes: récord sólo sube y rechaza valores inválidos', () => {
    expect(ML.scores.submit(10)).toEqual({ best: 10, isRecord: true });
    expect(ML.scores.submit(4)).toEqual({ best: 10, isRecord: false });
    expect(ML.scores.submit(NaN).isRecord).toBe(false);
    expect(ML.scores.best()).toBe(10);
  });
  it('estadísticas: started/ended suman partidas y tiempo', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000); ML.started();
    now.mockReturnValue(4000); ML.ended({ score: 12 });
    now.mockRestore();
    const s = ML.stats('clavado');
    expect(s.plays).toBe(1);
    expect(s.timeMs).toBe(3000);
    expect(ML.scores.best()).toBe(12);
  });
  it('telemetría limitada a 200 eventos', () => {
    for (let i = 0; i < 250; i++) ML.track('x', { i });
    const tel = JSON.parse(localStorage.getItem('ml:telemetry'));
    expect(tel).toHaveLength(200);
    expect(tel.at(-1).i).toBe(249);
  });
  it('errores no capturados muestran un aviso y se registran', () => {
    ML.reportError(new Error('boom'));
    expect(document.querySelector('.mla-toast')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('ml:telemetry')).at(-1)).toMatchObject({ type: 'error', msg: 'boom' });
  });
  it('sin localStorage sigue funcionando', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    expect(() => ML.scores.submit(99)).not.toThrow();
    spy.mockRestore();
  });
});
