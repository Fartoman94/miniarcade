// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'muerte_gloriosa.html';
/** @param {import('@playwright/test').Page} page */
const mg = page => page.evaluate(() => {
  const g = /** @type {any} */ (window).__mg;
  return { state: g.state, lvl: g.lvl, deaths: g.deaths, best: g.best, paused: g.paused, x: g.P.x, y: g.P.y, time: g.time, goal: g.goal };
});

/** Arranca la partida con entrada real (clic/toque en JUGAR). */
async function start(page, isMobile) {
  await expect(page.locator('#playBtn')).toBeVisible();
  if (isMobile) await page.locator('#playBtn').tap(); else await page.locator('#playBtn').click();
  await expect.poll(async () => (await mg(page)).state).toBe('play');
}

test.describe('MUERTE GLORIOSA', () => {
  test.describe.configure({ timeout: 120_000 });
  test('carga sin errores y el SDK queda inicializado', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.mla-bar')).toHaveCount(1);
    expect(await page.evaluate(() => typeof window.MLArcade?.isPaused)).toBe('function');
    await wait(page, 500);
    expectNoErrors(errors);
  });

  test('jugar: el personaje avanza y el HUD se actualiza', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    const goal0 = await page.textContent('#goalD');
    const a = await mg(page);
    await page.keyboard.down('ArrowRight');
    await wait(page, 600);
    await page.keyboard.up('ArrowRight');
    const b = await mg(page);
    expect(b.x).toBeGreaterThan(a.x + 60);
    expect(await page.textContent('#goalD')).not.toBe(goal0);
    // salto con Espacio
    await page.keyboard.press('Space');
    await expect.poll(async () => (await mg(page)).y).toBeLessThan(470);
    expect((await sdk(page)).telemetry).toContain('start');
    expectNoErrors(errors);
  });

  test('Esc pausa y congela todo; reanudar continúa', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    await page.keyboard.down('ArrowRight');
    await wait(page, 250);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await mg(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await mg(page);
    expect(b).toEqual(a);
    await page.keyboard.up('ArrowRight');
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    await wait(page, 400);
    const c = await mg(page);
    expect(c.paused).toBe(false);
    expect(c.time).toBeGreaterThan(b.time);
    // la tecla soltada durante la pausa no queda "pegada": el personaje no sigue caminando solo
    const x1 = c.x; await wait(page, 400);
    expect(Math.abs((await mg(page)).x - x1)).toBeLessThan(15);
    expectNoErrors(errors);
  });

  test('reiniciar desde el menú de pausa reinicia la partida', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    // morir una vez en los pinchos del nivel 1
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await mg(page)).deaths, { timeout: 8000 }).toBe(1);
    await page.keyboard.up('ArrowRight');
    await expect(page.locator('#card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const s = await mg(page);
    expect(s.state).toBe('play');
    expect(s.deaths).toBe(0);
    expect(s.lvl).toBe(0);
    expect(s.x).toBeLessThan(140);
    await expect(page.locator('#card')).toBeHidden();
    await expect(page.locator('#dN')).toHaveText('0');
    expectNoErrors(errors);
  });

  test('muerte → cartel → tecla nueva reaparece (la repetición no lo saltea)', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await mg(page)).state, { timeout: 8000 }).toBe('card');
    // auto-repetición de la tecla que se venía apretando: no debe descartar el cartel
    await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', repeat: true })));
    await wait(page, 450);
    expect((await mg(page)).state).toBe('card');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('KeyX');
    await expect.poll(async () => (await mg(page)).state).toBe('play');
    expect((await mg(page)).deaths).toBe(1);
    expectNoErrors(errors);
  });

  test('completar los 6 niveles muestra el final y el récord persiste', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    for (let i = 0; i < 6; i++) {
      await expect.poll(async () => { const s = await mg(page); return s.state === 'play' && s.lvl === i; }, { timeout: 20000 }).toBe(true);
      // atajo de prueba: dejar al personaje en la meta
      await page.evaluate(() => { const g = /** @type {any} */ (window).__mg; g.P.x = g.goal; });
      await expect.poll(async () => (await mg(page)).state).not.toBe('play');
    }
    await expect.poll(async () => (await mg(page)).state, { timeout: 20000 }).toBe('over');
    await expect(page.locator('#over')).toBeVisible();
    await expect(page.locator('#oLvl')).toHaveText('6/6');
    expect((await sdk(page)).telemetry).toContain('end');
    await page.reload();
    await expect(page.locator('#mBest')).toContainText('6/6');
    const st = await page.evaluate(() => ({ legacy: localStorage.getItem('mg_best'), sdk: window.MLArcade.scores.best('muerte_gloriosa') }));
    expect(st).toEqual({ legacy: '6', sdk: 6 });
    expectNoErrors(errors);
  });

  test('récord parcial: botón SEGUIR arranca en el siguiente nivel', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.evaluate(() => localStorage.setItem('mg_best', '2'));
    await page.reload();
    await expect(page.locator('#mBest')).toHaveText('2/6');
    await expect(page.locator('#contBtn')).toBeVisible();
    await page.locator('#contBtn').click();
    await expect.poll(async () => (await mg(page)).lvl).toBe(2);
    await expect(page.locator('#lvlName')).toHaveText('NIVEL 3');
    expectNoErrors(errors);
  });

  test('cambiar a vista de celular no rompe el layout y el piso se ve', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    for (const vp of [{ width: 412, height: 839 }, { width: 863, height: 360 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await wait(page, 200);
      const r = await page.evaluate(() => {
        const v = /** @type {any} */ (window).__mg.view;
        const cv = /** @type {HTMLCanvasElement} */ (document.getElementById('cv'));
        return { groundY: (470 + v.OFFY) * v.VS, h: innerHeight, cssW: cv.clientWidth, w: innerWidth, sw: document.documentElement.scrollWidth, ratio: cv.width / cv.clientWidth };
      });
      expect(r.groundY).toBeLessThan(r.h - 30);
      expect(r.cssW).toBe(r.w);
      expect(r.sw).toBeLessThanOrEqual(r.w);
      expect(r.ratio).toBeLessThanOrEqual(2.01);
    }
    expectNoErrors(errors);
  });

  test('táctil: botones en pantalla, multitáctil y cartel de muerte', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo proyecto mobile');
    const { errors } = await openGame(page, FILE);
    await start(page, true);
    await expect(page.locator('#tcR')).toBeVisible();
    await expect(page.locator('#ctrl')).toBeHidden();
    // saltar tocando el botón
    await page.locator('#tcJ').tap();
    await expect.poll(async () => (await mg(page)).y).toBeLessThan(470);
    await wait(page, 900);
    // mantener ▶ con un dedo y tocar SALTAR con otro: soltar el segundo no frena al primero
    const x0 = (await mg(page)).x;
    await page.dispatchEvent('#tcR', 'pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true });
    await page.dispatchEvent('#tcJ', 'pointerdown', { pointerId: 12, pointerType: 'touch', bubbles: true });
    await page.dispatchEvent('#tcJ', 'pointerup', { pointerId: 12, pointerType: 'touch', bubbles: true });
    await wait(page, 300);
    expect((await mg(page)).x).toBeGreaterThan(x0 + 40);
    // seguir hasta morir y descartar el cartel tocándolo
    await expect.poll(async () => (await mg(page)).state, { timeout: 10000 }).toBe('card');
    await page.dispatchEvent('#tcR', 'pointerup', { pointerId: 11, pointerType: 'touch', bubbles: true });
    await wait(page, 400);
    await page.locator('#card').tap();
    await expect.poll(async () => (await mg(page)).state).toBe('play');
    await page.screenshot({ path: 'test-results/muerte_gloriosa-mobile.png' });
    expectNoErrors(errors);
  });

  test('silencio: el botón del menú y el del SDK comparten estado', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.locator('#muteBtn').click();
    await expect(page.locator('#muteBtn')).toContainText('NO');
    expect(await page.evaluate(() => window.MLArcade.settings.get('muted'))).toBe(true);
    await page.locator('.mla-bar button[aria-label="Sonido"]').click();
    await expect(page.locator('#muteBtn')).toContainText('SÍ');
    await page.reload();
    await expect(page.locator('#muteBtn')).toContainText('SÍ');
    expectNoErrors(errors);
  });
});
