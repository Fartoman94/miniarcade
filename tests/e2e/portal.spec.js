// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

test.describe('portal', () => {
  test('carga el catálogo completo sin errores', async ({ page }) => {
    const { errors } = await openGame(page, 'index.html?nosw');
    await page.waitForSelector('html[data-portal=ready]');
    await expect(page.locator('#grid article.card')).toHaveCount(8);
    await expect(page).toHaveTitle(/MateLabs/);
    expectNoErrors(errors);
  });

  test('buscador, categorías y orden', async ({ page }) => {
    await openGame(page, 'index.html?nosw');
    await page.waitForSelector('html[data-portal=ready]');
    await page.fill('#q', 'torre');
    await expect(page.locator('#grid article.card')).toHaveCount(1);
    await page.fill('#q', 'qwerty');
    await expect(page.locator('.empty')).toBeVisible();
    await page.fill('#q', '');
    await page.click('[data-cat=carreras]');
    await expect(page.locator('#grid article.card h3')).toHaveText(['TURBO FURIA']);
    await page.click('[data-cat=todos]');
    await page.selectOption('#sort', 'az');
    await expect(page.locator('#grid article.card h3').first()).toHaveText('¡CLAVADO!');
  });

  test('favoritos persisten tras recargar', async ({ page }) => {
    await openGame(page, 'index.html?nosw');
    await page.waitForSelector('html[data-portal=ready]');
    await page.click('[data-fav=valle_encantado]');
    await page.reload();
    await page.waitForSelector('html[data-portal=ready]');
    await page.click('[data-cat=favoritos]');
    await expect(page.locator('#grid article.card')).toHaveCount(1);
    await expect(page.locator('[data-fav=valle_encantado]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('ficha por URL con recomendaciones y récord migrado', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('torre_best', '17'));
    await openGame(page, 'index.html?nosw#/juego/torre_infinita');
    await page.waitForSelector('html[data-portal=ready]');
    const d = page.locator('dialog#detail');
    await expect(d).toBeVisible();
    await expect(d.locator('h2')).toHaveText('TORRE INFINITA');
    await expect(d.locator('.d-stats')).toContainText('17');
    await expect(d.locator('.recs button')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    expect(await page.evaluate(() => location.hash)).toBe('');
  });

  test('intro de marca: aparece, se saltea y no vuelve en la misma sesión', async ({ page }) => {
    await openGame(page, 'index.html?nosw', { intro: true });
    await expect(page.locator('#ml-intro')).toBeVisible();
    await page.waitForTimeout(500);
    await page.mouse.click(10, 10);
    // el salteo es síncrono: en el mismo pointerdown la intro pasa a 'ml-out' (antes de los 3,4 s automáticos).
    // La remoción del nodo usa un setTimeout y headless a veces demora los timers, por eso se espera con margen.
    await expect(page.locator('#ml-intro')).toHaveClass(/ml-out/, { timeout: 1000 });
    await expect(page.locator('#ml-intro')).toHaveCount(0, { timeout: 10_000 });
    await page.reload();
    await page.waitForTimeout(200);
    await expect(page.locator('#ml-intro')).toHaveCount(0);
  });

  test('sin scroll horizontal en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openGame(page, 'index.html?nosw');
    await page.waitForSelector('html[data-portal=ready]');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(360);
  });
});

test('service worker: el portal abre sin conexión tras la primera visita', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'SW probado en Chromium');
  await openGame(page, 'index.html');
  await page.waitForSelector('html[data-portal=ready]');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la segunda carga ya pasa por el SW y llena la caché del código
  await page.waitForSelector('html[data-portal=ready]');
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('html[data-portal=ready]', { timeout: 10_000 });
  await expect(page.locator('#grid article.card')).toHaveCount(8);
  await context.setOffline(false);
});
