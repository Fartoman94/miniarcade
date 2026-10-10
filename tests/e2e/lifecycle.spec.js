// @ts-check
// Ciclo de vida: abrir/cerrar cada juego 10 veces y reiniciar la partida 10 veces sin acumular
// loops de requestAnimationFrame ni memoria. Sólo en escritorio (CDP para forzar el recolector).
import { test, expect } from '@playwright/test';
import { GAMES } from '../../games/registry.js';

// Cómo arrancar una partida en cada juego con entrada real (teclado o clic en su botón de modo).
const START = {
  clavado: async p => { await p.keyboard.press('Space'); },
  fruta_furia: async p => { await p.mouse.click(640, 400); },
  muerte_gloriosa: async p => { await p.keyboard.press('Enter'); },
  neon_survivor: async p => { await p.keyboard.press('Enter'); },
  salva_al_rey: async p => { await p.click('#modeMission'); },
  torre_infinita: async p => { await p.keyboard.press('Space'); },
  turbo_furia: async p => { await p.keyboard.press('Enter'); },
  valle_encantado: async p => { await p.click('#modeMission'); },
  academia_dragones: async p => { await p.keyboard.press('Enter'); },
  templo_ecos: async p => { await p.keyboard.press('Enter'); },
  guardianes_estelares: async p => { await p.keyboard.press('Enter'); },
  granja_runas: async p => { await p.keyboard.press('Enter'); },
  bastiones_elementales: async p => { await p.keyboard.press('Enter'); },
};

/** Cuenta callbacks de rAF por segundo para detectar loops duplicados. */
const RAF_PROBE = () => {
  const orig = window.requestAnimationFrame.bind(window);
  // @ts-ignore
  window.__raf = 0;
  window.requestAnimationFrame = cb => orig(t => { /** @type {any} */ (window).__raf++; cb(t); });
  try { sessionStorage.setItem('ml-intro:' + location.pathname, '1'); } catch (e) {}
};
async function rafRate(page, ms = 1500) {
  const a = await page.evaluate(() => /** @type {any} */ (window).__raf);
  const t0 = Date.now();
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => /** @type {any} */ (window).__raf);
  return (b - a) / ((Date.now() - t0) / 1000);
}
async function heapMB(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find(m => m.name === 'JSHeapUsedSize').value / 1048576;
}

test.describe('ciclo de vida', () => {
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile, 'CDP sólo en escritorio Chromium');

  test('portal ↔ juego 10 veces por juego: el portal no acumula memoria', async ({ page }) => {
    test.setTimeout(600_000);
    await page.addInitScript(RAF_PROBE);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto('/index.html?nosw');
    await page.waitForSelector('html[data-portal=ready]');
    const base = await heapMB(cdp);
    const after = [];
    for (let i = 0; i < 10; i++) {
      for (const g of GAMES) {
        await page.goto('/' + g.file);
        await page.waitForFunction(() => !!(/** @type {any} */ (window).MLArcade));
        await page.waitForTimeout(250);
        await page.goto('/index.html?nosw');
        await page.waitForSelector('html[data-portal=ready]');
      }
      after.push(await heapMB(cdp));
    }
    console.log('heap portal MB base', base.toFixed(2), 'por vuelta', after.map(x => x.toFixed(2)).join(' '));
    // Cada navegación crea un documento nuevo: el heap del portal debe volver a su nivel base.
    expect(Math.max(...after)).toBeLessThan(base * 1.5 + 2);
  });

  for (const g of GAMES) {
    test(`${g.id}: 10 reinicios sin loops duplicados ni memoria creciente`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.addInitScript(RAF_PROBE);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto('/' + g.file);
      await page.waitForFunction(() => !!(/** @type {any} */ (window).MLArcade));
      await page.waitForTimeout(800);
      await START[g.id](page);
      await page.waitForTimeout(800);
      await expect.poll(() => page.evaluate(() => {
        const A = /** @type {any} */ (window).MLArcade; return A.pause() || A.isPaused();
      }), { timeout: 20_000 }).toBe(true);
      await page.evaluate(() => { const b = /** @type {HTMLElement} */ (document.querySelector('.mla-pause [data-a="restart"]')); b.click(); });
      await page.waitForTimeout(600);
      const rate1 = await rafRate(page);
      const heap1 = await heapMB(cdp);
      for (let i = 0; i < 9; i++) {
        await expect.poll(() => page.evaluate(() => {
          const A = /** @type {any} */ (window).MLArcade; return A.pause() || A.isPaused();
        }), { timeout: 20_000 }).toBe(true);
        await page.evaluate(() => { const b = /** @type {HTMLElement} */ (document.querySelector('.mla-pause [data-a="restart"]')); b.click(); });
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(600);
      const rate10 = await rafRate(page);
      const heap10 = await heapMB(cdp);
      console.log(g.id, 'rAF/s', rate1.toFixed(1), '→', rate10.toFixed(1), '| heap MB', heap1.toFixed(2), '→', heap10.toFixed(2));
      // Un loop duplicado duplicaría la tasa de rAF; se tolera ruido de headless.
      expect(rate10).toBeLessThan(Math.max(rate1 * 1.5, rate1 + 30));
      expect(heap10).toBeLessThan(heap1 * 1.5 + 3);
      expect(errors).toEqual([]);
    });
  }
});
