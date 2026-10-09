// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'fruta_furia.html';
/** @param {import('@playwright/test').Page} page */
const snap = page => page.evaluate(() => /** @type {any} */ (window).__fruta.snap());

/** Toca/clickea en el centro (sirve para arrancar desde el menú). */
async function tapCenter(page, isMobile) {
  const vp = page.viewportSize() || { width: 800, height: 600 };
  if (isMobile) await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  else await page.mouse.click(vp.width / 2, vp.height / 2);
}

/** @type {WeakMap<object, any>} */
const cdps = new WeakMap();
/** Desliza con entrada real: mouse en desktop, eventos táctiles (CDP) en mobile. */
async function swipe(page, isMobile, x1, y1, x2, y2, steps = 6) {
  if (!isMobile) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps);
    await page.mouse.up();
    return;
  }
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps, id: 1 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Intenta cortar una fruta (nunca una bomba) hasta sumar puntos. */
async function sliceSomething(page, isMobile, tries = 60) {
  for (let t = 0; t < tries; t++) {
    const s = await snap(page);
    if (s.score > 0) return s;
    const vp = page.viewportSize() || { width: 800, height: 600 };
    const bombs = s.fruits.filter(f => f.type === 'bomba');
    // fruta visible y lejos de cualquier bomba; corte vertical en su columna
    // (la x cambia despacio, así el corte acierta aunque el juego vaya lento en CI)
    const f = s.fruits.filter(f => f.type !== 'bomba' && f.y > 120 && f.y < vp.height - 60)
      .find(f => bombs.every(b => Math.abs(b.x - f.x) > 80));
    if (f) await swipe(page, isMobile, f.x, Math.max(60, f.y - 160), f.x, Math.min(vp.height - 10, f.y + 160));
    else await wait(page, 100);
  }
  return snap(page);
}

test.describe('Fruta Furia', () => {
  test('carga sin errores y muestra el menú', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menu')).toBeVisible();
    await wait(page, 800);
    const s = await snap(page);
    expect(s.state).toBe('menu');
    expect(await page.evaluate(() => typeof window.MLArcade)).toBe('object');
    expectNoErrors(errors);
  });

  test('jugar, cortar, pausar, reanudar y reiniciar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await wait(page, 600);
    await tapCenter(page, !!isMobile);
    await expect(page.locator('#hud')).toHaveClass(/show/);
    let s = await snap(page);
    expect(s.state).toBe('playing');

    // el juego avanza y se puede cortar con entrada real
    s = await sliceSomething(page, !!isMobile);
    expect(s.score).toBeGreaterThan(0);
    expect(s.sliced).toBeGreaterThan(0);
    expect(await page.locator('#score').textContent()).toBe(String(s.score));

    // pausa con Escape: la simulación queda congelada
    await page.keyboard.press('Escape');
    expect((await sdk(page)).paused).toBe(true);
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await snap(page);
    await wait(page, 1000);
    const b = await snap(page);
    expect(b.time).toBe(a.time);
    expect(b.fruits).toEqual(a.fruits);
    // un deslizamiento durante la pausa no corta nada
    await page.keyboard.press('Escape');
    expect((await sdk(page)).paused).toBe(false);
    await wait(page, 300);
    const c = await snap(page);
    expect(c.time).toBeGreaterThan(b.time);
    // sin salto de tiempo al reanudar (dt acotado: ~0,3 s de juego en 0,3 s reales, nunca 1 s+)
    expect(c.time - b.time).toBeLessThan(0.6);

    // reiniciar desde el menú de pausa
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    const r = await snap(page);
    expect(r.state).toBe('playing');
    expect(r.score).toBe(0);
    expect(r.sliced).toBe(0);
    expect(r.misses).toBe(0);
    expect((await sdk(page)).paused).toBe(false);
    await wait(page, 300);
    expect((await snap(page)).time).toBeGreaterThan(r.time);
    expectNoErrors(errors);
  });

  test('fin de partida y récord persistente', async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    const { errors } = await openGame(page, FILE);
    await wait(page, 600);
    await tapCenter(page, !!isMobile);
    const s = await sliceSomething(page, !!isMobile);
    expect(s.score).toBeGreaterThan(0);
    // no cortar más: se escapan tres frutas (o una bomba explota sola si se cruza) -> fin
    await expect.poll(async () => (await snap(page)).state, { timeout: 45_000, intervals: [250] }).toBe('over');
    await expect(page.locator('#over')).toBeVisible();
    const fin = await snap(page);
    expect(await page.locator('#overScore').textContent()).toBe(String(fin.score));
    const tel = (await sdk(page)).telemetry;
    expect(tel).toContain('start');
    expect(tel).toContain('end');
    const stored = await page.evaluate(() => ({ legacy: localStorage.getItem('fruta_best'), sdk: JSON.parse(localStorage.getItem('ml:scores') || '{}').fruta_furia }));
    expect(Number(stored.legacy)).toBe(fin.score);
    expect(stored.sdk).toBe(fin.score);

    await page.reload();
    await wait(page, 500);
    await expect(page.locator('#menuBest')).toBeVisible();
    await expect(page.locator('#menuBest')).toContainText(String(fin.score));
    expect((await snap(page)).best).toBe(fin.score);
    expectNoErrors(errors);
  });

  test('la fruta sube a una altura visible en cualquier pantalla', async ({ page }) => {
    test.setTimeout(150_000);
    for (const vp of [{ width: 915, height: 412 }, { width: 1280, height: 1600 }]) {
      await page.setViewportSize(vp);
      const { errors } = await openGame(page, FILE);
      // Altura máxima prevista de cada fruta que sube: y - vy²/2G. Debe quedar dentro de la pantalla
      // y por encima de la mitad (antes: en 915x412 no pasaban del 79 % y en 1280x1600 se iban por arriba).
      // Se calcula a partir del estado, así no depende de la velocidad de la máquina ni del bot del menú.
      const apex = [];
      await expect.poll(async () => {
        const s = await snap(page);
        for (const f of s.fruits) if (f.vy < -50) apex.push((f.y - f.vy * f.vy / (2 * s.G)) / vp.height);
        return apex.length;
      }, { timeout: 30_000, intervals: [200] }).toBeGreaterThanOrEqual(3);
      expect(Math.min(...apex)).toBeGreaterThan(0.1);
      expect(Math.max(...apex)).toBeLessThan(0.55);
      expectNoErrors(errors);
    }
  });

  test('layout en viewport de celular', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.setViewportSize({ width: 390, height: 780 });
    await wait(page, 300);
    const m = await page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
      const bar = document.querySelector('.mla-bar');
      return { cw: c.clientWidth, ch: c.clientHeight, sw: document.documentElement.scrollWidth, bar: bar && bar.getBoundingClientRect().toJSON() };
    });
    expect(m.cw).toBe(390);
    expect(m.ch).toBe(780);
    expect(m.sw).toBeLessThanOrEqual(390);
    // la barra del arcade va abajo a la izquierda: no tapa puntos (arriba izq.) ni vidas (arriba der.)
    expect(m.bar && m.bar.top).toBeGreaterThan(780 / 2);
    expectNoErrors(errors);
  });
});
