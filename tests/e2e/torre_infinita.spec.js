// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'torre_infinita.html';
const T = page => page.evaluate(() => {
  const t = /** @type {any} */ (window).__torre;
  return { state: t.state, score: t.score, rows: t.rows, curX: t.curX, paused: t.paused, best: t.best };
});

/** Entrada real según el proyecto: toque en móvil, Espacio en PC. */
async function press(page, hasTouch) {
  if (hasTouch) await page.touchscreen.tap(200, 420);
  else await page.keyboard.press('Space');
}

/** Espera a que el bloque pase cerca del centro de la torre y lo suelta (siempre apoya). */
async function dropNearCenter(page, hasTouch) {
  await page.waitForFunction(() => {
    const t = /** @type {any} */ (window).__torre;
    return t.state === 'playing' && Math.abs(t.curX) < 30;
  }, null, { timeout: 8000, polling: 'raf' });
  await press(page, hasTouch);
}

async function start(page, hasTouch) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre) && !!(/** @type {any} */ (window).MLArcade));
  await press(page, hasTouch);
  await expect.poll(async () => (await T(page)).state).toBe('playing');
}

test.describe('Torre Infinita', () => {
  test('carga sin errores y la demo del menú corre', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#menu .blink')).toHaveText(/TOCÁ PARA EMPEZAR/);
    const a = await T(page);
    expect(a.state).toBe('menu');
    await wait(page, 600);
    const b = await T(page);
    expect(b.curX).not.toBe(a.curX); // el bloque de la demo se mueve
    await expect(page.locator('.mla-bar.bl')).toBeVisible();
    expectNoErrors(errors);
  });

  test('arranca con entrada real, apila bloques y avanza el puntaje', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    const s0 = await T(page);
    expect(s0.rows).toBe(1);
    expect(s0.score).toBe(0);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    expect((await T(page)).score).toBeGreaterThan(0);
    await expect(page.locator('#score')).not.toHaveText('0');
    expect((await sdk(page)).telemetry).toContain('start');
    expectNoErrors(errors);
  });

  test('mantener Espacio apretado (autorepetición) no suelta más bloques', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    await page.evaluate(() => {
      for (let i = 0; i < 8; i++) dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }));
    });
    const s = await T(page);
    expect(s.rows).toBe(1);
    expect(s.state).toBe('playing');
    expectNoErrors(errors);
  });

  test('Esc pausa y congela la simulación; reanudar sigue', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await T(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await T(page);
    expect(b).toEqual(a);
    // la entrada al juego está bloqueada durante la pausa (Espacio sobre el foco del menú = Reanudar,
    // por eso se despacha sobre el body, como si el foco estuviera en el juego)
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })));
    expect((await T(page)).rows).toBe(a.rows);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await wait(page, 300);
    const c = await T(page);
    expect(c.paused).toBe(false);
    expect(c.curX).not.toBe(a.curX);
    // sin salto de dt: en 300 ms el bloque no puede haber recorrido más de lo que da su velocidad máxima
    expect(Math.abs(c.curX - a.curX)).toBeLessThan(page.viewportSize().width * 2);
    expectNoErrors(errors);
  });

  test('Reiniciar desde el menú de pausa resetea la partida', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const s = await T(page);
    expect(s).toMatchObject({ state: 'playing', rows: 1, score: 0, paused: false });
    await wait(page, 300);
    expect((await T(page)).curX).not.toBe(s.curX);
    expectNoErrors(errors);
  });

  test('fin de partida, récord guardado y persistente tras recargar', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    const score = (await T(page)).score;
    // soltar apenas aparece el siguiente bloque (todavía fuera de la torre) = fallo total
    await press(page, hasTouch);
    await expect.poll(async () => (await T(page)).state).toBe('over');
    await expect(page.locator('#over')).toBeVisible();
    await expect(page.locator('#overScore')).toHaveText(String(score));
    await expect(page.locator('#recordBadge')).toBeVisible();
    const stored = await page.evaluate(() => ({
      legacy: localStorage.getItem('torre_best'),
      ml: JSON.parse(localStorage.getItem('ml:scores') || '{}').torre_infinita,
    }));
    expect(Number(stored.legacy)).toBe(score);
    expect(stored.ml).toBe(score);
    expect((await sdk(page)).telemetry).toContain('end');

    // otra vez desde la pantalla final
    await wait(page, 700);
    await press(page, hasTouch);
    await expect.poll(async () => (await T(page)).state).toBe('playing');

    await page.reload();
    await expect(page.locator('#menuBest')).toHaveText(`TU RÉCORD · ${score}`);
    expect((await T(page)).best).toBe(score);
    expectNoErrors(errors);
  });

  test('el récord viejo (torre_best) se migra', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('torre_best', '17'); sessionStorage.setItem('seeded', '1'); } });
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menuBest')).toHaveText('TU RÉCORD · 17');
    expect(await page.evaluate(() => /** @type {any} */ (window).MLArcade.scores.best())).toBe(17);
    expectNoErrors(errors);
  });

  test('viewport de celular: canvas a pantalla completa, sin scroll y sin choques con el HUD', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await page.setViewportSize({ width: 390, height: 780 });
    await start(page, hasTouch);
    await wait(page, 200);
    const m = await page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
      const r = el => el.getBoundingClientRect();
      const ov = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const bar = r(document.querySelector('.mla-bar'));
      const hudBoxes = ['score', 'best'].map(id => r(document.getElementById(id)));
      return {
        cssW: c.clientWidth, cssH: c.clientHeight, bw: c.width, iw: innerWidth, ih: innerHeight,
        dpr: Math.min(devicePixelRatio, 2),
        scrollW: document.documentElement.scrollWidth,
        barOverHud: hudBoxes.some(h => ov(bar, h)),
        barOverMark: ov(bar, r(document.querySelector('.watermark'))),
      };
    });
    expect(m.cssW).toBe(m.iw);
    expect(m.cssH).toBe(m.ih);
    expect(m.bw).toBe(Math.round(m.iw * m.dpr));
    expect(m.scrollW).toBeLessThanOrEqual(m.iw);
    expect(m.barOverHud).toBe(false);
    expect(m.barOverMark).toBe(false);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    expectNoErrors(errors);
  });

  test('táctil: un toque arranca y suelta bloques', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'solo en el proyecto móvil');
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre));
    await page.touchscreen.tap(150, 500);
    await expect.poll(async () => (await T(page)).state).toBe('playing');
    await dropNearCenter(page, true);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    // tocar la barra del arcade no suelta bloques
    const rows = (await T(page)).rows;
    const mute = page.locator('.mla-bar button[aria-label="Sonido"]');
    const box = await mute.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect((await T(page)).rows).toBe(rows);
    expect(await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.get('muted'))).toBe(true);
    expectNoErrors(errors);
  });
});
