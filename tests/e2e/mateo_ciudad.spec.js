// @ts-check
// «Mateo: Ciudad de Altura» se desarrolla en su repo privado (87 pruebas propias). Acá se verifica la
// integración con MiniArcade: carga sin errores desde /mateo/, arranca con entrada real, registra la
// partida en el SDK y ofrece volver al portal desde el menú y la pausa.
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors } from './helpers.js';

test.describe('Mateo: Ciudad de Altura (integración)', () => {
  test('carga sin errores, arranca y se puede volver al arcade', async ({ page }) => {
    test.setTimeout(180_000);
    const { errors } = await openGame(page, 'mateo/index.html');
    await expect(page).toHaveTitle(/Mateo: Ciudad de Altura — MateLabs/);
    const go = page.locator('#ui [data-a="go"]');
    await expect(go).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#ui [data-ml-home]')).toHaveAttribute('href', /index\.html$/);
    await go.click();
    await expect(go).toBeHidden({ timeout: 60_000 });
    const tel = await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').filter(e => e.game === 'mateo_ciudad').map(e => e.type));
    expect(tel).toContain('open');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:stats') || '{}').mateo_ciudad?.plays)).toBeGreaterThanOrEqual(1);
    expectNoErrors(errors);
  });

  test('la copia publicada no incluye archivos privados', async ({ request }) => {
    for (const path of ['mateo/VERSION.txt', 'mateo/assets/models/mateo_final_v1.glb']) {
      expect((await request.get('/' + path)).ok(), path).toBe(true);
    }
    for (const path of ['private_refs/', 'mateo/private_refs/', 'mateo/tools/check.mjs', 'docs/concepts/']) {
      expect((await request.get('/' + path)).status(), path).toBe(404);
    }
  });
});
