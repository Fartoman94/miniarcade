// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

/** Foto del estado del juego (ganchos de sólo lectura window.__turbo). */
const T = page => page.evaluate(() => {
  const t = window.__turbo;
  return { state: t.state, score: t.score, dist: t.dist, lives: t.lives, speed: t.speed, playerX: t.playerX, paused: t.paused, muted: t.muted, best: t.best };
});

const isMobile = testInfo => testInfo.project.name === 'mobile';

/** Arranca una carrera con entrada real (Enter en PC, toque en el botón en celular) y espera a que termine la cuenta. */
async function startRun(page, mobile) {
  await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage');
  if (mobile) await page.locator('#goBtn').tap();
  else await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__turbo.state === 'countdown');
  await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 15_000 });
}

/** Toque real (eventos touch de Chromium vía CDP) sostenido en (x,y) durante ms. */
async function touchHold(page, x, y, ms) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await wait(page, ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('TURBO FURIA', () => {
  test('carga sin errores y muestra el garaje con la barra del arcade', async ({ page }) => {
    const { errors } = await openGame(page, 'turbo_furia.html');
    await page.waitForFunction(() => window.__turbo && window.MLArcade);
    await expect(page.locator('#garage')).toBeVisible();
    await expect(page.locator('.mla-bar')).toBeVisible();
    await expect(page.locator('#vName')).toHaveText('RAYO GT');
    await wait(page, 800);
    expectNoErrors(errors);
  });

  test('carrera: avanza, pausa congela, reanuda y reinicia desde el menú', async ({ page }, testInfo) => {
    const { errors } = await openGame(page, 'turbo_furia.html');
    await startRun(page, isMobile(testInfo));
    await wait(page, 1500);
    const a = await T(page);
    expect(a.dist).toBeGreaterThan(0);
    expect(a.speed).toBeGreaterThan(5);

    // pausa con Escape: el estado no cambia durante 1 s
    await page.keyboard.press('Escape');
    expect((await sdk(page)).paused).toBe(true);
    await expect(page.locator('.mla-pause')).toBeVisible();
    const p1 = await T(page);
    await wait(page, 1000);
    const p2 = await T(page);
    expect(p2.dist).toBe(p1.dist);
    expect(p2.score).toBe(p1.score);
    expect(p2.paused).toBe(true);

    // reanudar: sigue avanzando, sin salto grande de distancia
    await page.locator('.mla-pause [data-a="resume"]').click();
    await wait(page, 600);
    const r = await T(page);
    expect(r.paused).toBe(false);
    expect(r.dist).toBeGreaterThan(p2.dist);
    expect(r.dist - p2.dist).toBeLessThan(80); // 600 ms a < 75 m/s; con salto de dt sería mucho más

    // reiniciar desde el menú de pausa: vuelve a la cuenta con distancia 0
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    const s = await T(page);
    expect(s.state).toBe('countdown');
    expect(s.dist).toBe(0);
    expect(s.lives).toBe(3);
    await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 15_000 });
    expectNoErrors(errors);
  });

  test('fin de partida, récord persistente y volver a correr con teclado', async ({ page }, testInfo) => {
    const { errors } = await openGame(page, 'turbo_furia.html?test=1');
    await startRun(page, isMobile(testInfo));
    await wait(page, 2500);
    for (let i = 0; i < 3; i++) expect(await page.evaluate(() => window.__turbo.forceCrash())).toBe(true);
    expect((await T(page)).state).toBe('dying');
    await expect(page.locator('#over')).toBeVisible({ timeout: 10_000 });
    await page.waitForFunction(() => window.__turbo.state === 'over');
    const score = Number(await page.locator('#overScore').textContent());
    expect(score).toBeGreaterThan(0);
    await expect(page.locator('#recordBadge')).toBeVisible();
    const ls = await page.evaluate(() => ({ legacy: localStorage.getItem('turbo_best'), sdk: JSON.parse(localStorage.getItem('ml:scores') || '{}').turbo_furia }));
    expect(Number(ls.legacy)).toBe(score);
    expect(ls.sdk).toBe(score);
    expect((await sdk(page)).telemetry).toEqual(expect.arrayContaining(['start', 'end', 'score']));

    // Enter en la pantalla final arranca otra carrera
    await wait(page, 800);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__turbo.state === 'countdown');

    await page.reload();
    await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage');
    await expect(page.locator('#best')).toHaveText(String(score));
    expectNoErrors(errors);
  });

  test('viewport de celular: sin scroll horizontal y canvas a pantalla completa', async ({ page }) => {
    const { errors } = await openGame(page, 'turbo_furia.html');
    await page.waitForFunction(() => window.__turbo);
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(page, 400);
    const m = await page.evaluate(() => {
      const c = document.getElementById('c').getBoundingClientRect();
      const bar = document.querySelector('.mla-bar').getBoundingClientRect();
      const hearts = document.getElementById('hearts').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, cw: c.width, ch: c.height, barBottom: bar.bottom, heartsTop: hearts.top };
    });
    expect(m.sw).toBeLessThanOrEqual(390);
    expect(m.cw).toBe(390);
    expect(m.ch).toBe(844);
    expect(m.heartsTop).toBeGreaterThanOrEqual(m.barBottom - 1); // la barra no tapa las vidas
    expectNoErrors(errors);
  });

  test('táctil: deslizar dobla y el botón de nitro responde', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'sólo en el proyecto mobile');
    const { errors } = await openGame(page, 'turbo_furia.html');
    await startRun(page, true);
    const vp = page.viewportSize();
    const x0 = (await T(page)).playerX;
    await touchHold(page, vp.width - 20, vp.height / 2, 900);
    const x1 = (await T(page)).playerX;
    expect(x1).toBeGreaterThan(x0 + 2);
    await touchHold(page, 20, vp.height / 2, 900);
    expect((await T(page)).playerX).toBeLessThan(x1 - 2);
    // nitro: el botón se ilumina mientras se mantiene
    const nb = await page.locator('#nitroBtn').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: nb.x + nb.width / 2, y: nb.y + nb.height / 2, id: 2 }] });
    await wait(page, 200);
    await expect(page.locator('#nitroBtn')).toHaveClass(/on/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#nitroBtn')).not.toHaveClass(/on/);
    expectNoErrors(errors);
  });

  test('sonido: el botón de la barra silencia el juego', async ({ page }) => {
    await openGame(page, 'turbo_furia.html');
    await page.waitForFunction(() => window.__turbo && document.querySelector('.mla-bar'));
    expect((await T(page)).muted).toBe(false);
    await page.locator('.mla-bar button[aria-label="Sonido"]').click();
    expect((await T(page)).muted).toBe(true);
  });
});
