// @ts-check
// Navegación repetida portal → juego → portal por todos los juegos, dos vueltas.
// Comprueba que cada juego carga, que el botón "volver al arcade" del SDK funciona y que no hay errores.
import { test, expect } from '@playwright/test';
import { expectNoErrors } from './helpers.js';
import { GAMES } from '../../games/registry.js';

test('navegación repetida entre todos los juegos', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('pageerror', e => errors.push(`${page.url()} pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${page.url()} console: ${m.text()}`); });
  await page.addInitScript(() => { try { sessionStorage.setItem('ml-intro:' + location.pathname, '1'); } catch (e) {} });
  await page.goto('/index.html?nosw');
  for (let round = 0; round < 2; round++) {
    for (const g of GAMES) {
      await page.waitForSelector('html[data-portal=ready]');
      await page.locator(`article[data-id="${g.id}"] .play-btn`).click();
      await page.waitForURL('**/' + g.file);
      await page.waitForFunction(() => !!window.MLArcade && !!document.querySelector('.mla-bar a, .mla-pause a'));
      await page.waitForTimeout(400);
      const home = page.locator('.mla-bar a').first();
      if (await home.isVisible()) await home.click(); else await page.goto('/index.html?nosw');
      await page.waitForURL(/index\.html/);
    }
  }
  expectNoErrors(errors);
});
