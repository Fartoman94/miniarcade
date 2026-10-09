// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'clavado.html';
// Con SwiftShader y la máquina cargada, Chromium headless a veces deja de entregar cuadros
// (requestAnimationFrame) durante varios segundos: los tiempos de espera son holgados a propósito.
const T = 20_000;
/** @param {import('@playwright/test').Page} page */
const S = page => page.evaluate(() => /** @type {any} */ (window).__clavado.snap());

/** Entrada real: toque en móvil, Espacio en PC. */
async function press(page, hasTouch) {
  if (hasTouch) await page.touchscreen.tap(200, 600);
  else await page.keyboard.press('Space');
}

async function start(page, hasTouch) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado) && !!(/** @type {any} */ (window).MLArcade));
  await press(page, hasTouch);
  await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
}

/** Lanza un cuchillo cuando está listo y espera a que se clave. */
async function stickOne(page, hasTouch) {
  await page.waitForFunction(() => /** @type {any} */ (window).__clavado.snap().knifeState === 'ready', null, { polling: 100, timeout: T });
  const before = (await S(page)).stuck;
  await press(page, hasTouch);
  await expect.poll(async () => (await S(page)).stuck, { timeout: T }).toBe(before + 1);
}

/** Fuerza que el próximo cuchillo choque contra uno clavado y espera la pantalla final. */
async function breakKnife(page, hasTouch) {
  await page.waitForFunction(() => /** @type {any} */ (window).__clavado.snap().knifeState === 'ready', null, { polling: 100, timeout: T });
  await page.evaluate(() => /** @type {any} */ (window).__clavado.forceNextHit());
  await press(page, hasTouch);
  await expect(page.locator('#over')).not.toHaveClass(/hidden/, { timeout: T });
}

test.describe('¡Clavado!', () => {
  test('carga sin errores, la demo del menú gira y la barra no tapa el HUD', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#menu .blink')).toHaveText(/TOCÁ PARA JUGAR/);
    const a = await S(page);
    expect(a.state).toBe('menu');
    await expect.poll(async () => (await S(page)).theta, { timeout: T }).not.toBe(a.theta);
    await expect(page.locator('.mla-bar.tr')).toBeVisible();
    expectNoErrors(errors);
  });

  test('arranca con entrada real, clava cuchillos y suma puntos', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    expect((await S(page)).score).toBe(0);
    await stickOne(page, hasTouch);
    const s = await S(page);
    expect(s.score).toBeGreaterThan(0);
    expect(s.throwsLeft).toBe(5);
    await expect(page.locator('#score')).not.toHaveText('0');
    expect((await sdk(page)).telemetry).toContain('start');
    // la barra del arcade no se superpone con el puntaje ni con el nivel
    const bar = await page.locator('.mla-bar').boundingBox();
    for (const sel of ['#score', '#level']) {
      const b = await page.locator(sel).boundingBox();
      const overlap = bar && b && bar.x < b.x + b.width && b.x < bar.x + bar.width && bar.y < b.y + b.height && b.y < bar.y + bar.height;
      expect(overlap, sel + ' tapado por la barra').toBeFalsy();
    }
    expectNoErrors(errors);
  });

  test('Escape congela el juego y reanudar continúa', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await S(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await S(page);
    expect(b.theta).toBe(a.theta);
    expect(b.time).toBe(a.time);
    // la entrada al juego queda bloqueada durante la pausa (tecla que no es del menú)
    await page.evaluate(() => (/** @type {HTMLElement} */ (document.activeElement)).blur());
    await page.keyboard.press('Space');
    const g = await S(page);
    expect(g.knifeState).toBe(a.knifeState);
    expect(g.stuck).toBe(a.stuck);
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(async () => (await S(page)).theta, { timeout: T }).not.toBe(b.theta);
    const c = await S(page);
    // sin salto de tiempo al reanudar (dt acotado): avanzó como mucho lo que duró la espera
    expect(c.time - b.time).toBeLessThan(0.5);
    expectNoErrors(errors);
  });

  test('reiniciar desde la pausa reinicia la partida', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await stickOne(page, hasTouch);
    expect((await S(page)).score).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const s = await S(page);
    expect(s.state).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.stuck).toBe(0);
    expect(s.paused).toBe(false);
    await expect.poll(async () => (await S(page)).time, { timeout: T }).toBeGreaterThan(s.time); // el bucle sigue vivo
    expectNoErrors(errors);
  });

  test('romper un cuchillo termina la partida una sola vez, guarda el récord y persiste', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await page.addInitScript(() => {
      /** @type {any} */ (window).__ended = 0;
      addEventListener('DOMContentLoaded', () => {
        const ML = /** @type {any} */ (window).MLArcade; const orig = ML.ended;
        ML.ended = (/** @type {any} */ i) => { /** @type {any} */ (window).__ended++; return orig(i); };
      });
    });
    await page.reload();
    await start(page, hasTouch);
    await stickOne(page, hasTouch);
    await breakKnife(page, hasTouch);
    const s = await S(page);
    expect(s.state).toBe('over');
    const score = s.score;
    expect(score).toBeGreaterThan(0);
    // el cuchillo roto no sigue sumando ni dispara varios game over (bug del original)
    await wait(page, 1200);
    expect((await S(page)).score).toBe(score);
    expect(await page.evaluate(() => /** @type {any} */ (window).__ended)).toBe(1);
    await expect(page.locator('#overScore')).toHaveText(String(score));
    await expect(page.locator('#recordBadge')).toBeVisible();
    const stored = await page.evaluate(() => ({ legacy: localStorage.getItem('clavado_best'), ml: JSON.parse(localStorage.getItem('ml:scores') || '{}').clavado }));
    expect(Number(stored.legacy)).toBe(score);
    expect(stored.ml).toBe(score);
    // otra vez con entrada real
    await press(page, hasTouch);
    await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
    // el récord sobrevive a la recarga
    await page.reload();
    await expect(page.locator('#menuBest')).toHaveText('TU RÉCORD · ' + score);
    expect((await S(page)).best).toBe(score);
    expectNoErrors(errors);
  });

  test('vista móvil: redimensionar no rompe el layout', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.setViewportSize({ width: 360, height: 640 });
    await wait(page, 300);
    const dims = await page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
      return { cw: c.clientWidth, ch: c.clientHeight, sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    expect(dims.cw).toBe(360);
    expect(dims.ch).toBe(640);
    expect(dims.sw).toBeLessThanOrEqual(dims.iw);
    await stickOne(page, hasTouch);
    expectNoErrors(errors);
  });

  test('toque en pantalla lanza el cuchillo (móvil)', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'sólo en el proyecto móvil');
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado));
    await page.touchscreen.tap(150, 500);
    await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
    await stickOne(page, true);
    // tocar la barra del arcade no lanza cuchillos
    await page.waitForFunction(() => /** @type {any} */ (window).__clavado.snap().knifeState === 'ready', null, { polling: 100, timeout: T });
    const n = (await S(page)).stuck;
    const box = await page.locator('.mla-bar .mla-btn[aria-label="Sonido"]').boundingBox();
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await wait(page, 400);
    expect((await S(page)).stuck).toBe(n);
    expectNoErrors(errors);
  });
});
