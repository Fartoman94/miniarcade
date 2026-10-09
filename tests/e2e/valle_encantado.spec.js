// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

// El Valle Encantado (Three.js r128). En headless el WebGL es SwiftShader (CPU): el juego corre
// a pocos FPS y el dt está limitado a 33 ms, así que el tiempo de juego avanza más lento que el real.
// Por eso las esperas son por condición (waitForFunction) y no por tiempo fijo.

const FILE = 'valle_encantado.html?e2e';
const snap = page => page.evaluate(() => window.__valle.snap());
const until = (page, fn, arg, timeout = 40_000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

async function ready(page) {
  await until(page, () => !!(window.__valle && window.THREE && window.MLArcade));
  // al menos un cuadro dibujado
  await until(page, () => window.__valle.snap().time > 0.05);
}

/** Toca/clickea un botón con la entrada real del proyecto (tap en móvil). */
async function press(page, sel, isMobile) {
  if (isMobile) await page.tap(sel); else await page.click(sel);
}

test.describe('El Valle Encantado', () => {
  test('carga sin errores y con el decorado horneado', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const s = await snap(page);
    expect(s.state).toBe('menu');
    // antes eran ~490 draw calls por cuadro en el menú
    expect(s.calls).toBeGreaterThan(0);
    expect(s.calls).toBeLessThan(220);
    await expect(page.locator('#modeExplore')).toBeVisible();
    expectNoErrors(errors);
  });

  test('Proteger: arranca, avanza, pausa congela, reanuda y reinicia', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await press(page, '#modeMission', isMobile);
    await until(page, () => window.__valle.snap().state === 'play');
    expect((await sdk(page)).telemetry).toContain('start');
    await expect(page.locator('#hud')).toHaveClass(/show/);

    // la partida avanza
    const t0 = (await snap(page)).playTime;
    await until(page, t => window.__valle.snap().playTime > t + 0.3, t0);

    // primera oleada (se acorta la espera inicial) y enemigos en camino
    await page.evaluate(() => window.__valle.skipWait());
    await until(page, () => { const s = window.__valle.snap(); return s.wave === 1 && s.enemies + s.pending > 0; });
    await expect(page.locator('#waveInfo')).toHaveText('OLEADA 1');

    // pausa con Escape: estado idéntico durante 1 s
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await snap(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await snap(page);
    expect(b.time).toBe(a.time);
    expect(b.playTime).toBe(a.playTime);
    expect([b.px, b.pz, b.enemies, b.pending]).toEqual([a.px, a.pz, a.enemies, a.pending]);
    expect((await sdk(page)).paused).toBe(true);

    // reanudar continúa sin salto grande de tiempo
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await until(page, t => window.__valle.snap().playTime > t, b.playTime);
    const c = await snap(page);
    expect(c.playTime - b.playTime).toBeLessThan(0.5);

    // reiniciar desde el menú de pausa
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await until(page, () => { const s = window.__valle.snap(); return s.state === 'play' && !s.paused && s.wave === 0; });
    const r = await snap(page);
    expect(r.playTime).toBeLessThan(c.playTime + 0.5);
    expect(r.hearts).toBe(5);
    expect(r.enemies + r.pending).toBe(0);
    // y el bucle sigue vivo tras reiniciar
    await until(page, t => window.__valle.snap().time > t + 0.1, r.time);
    expectNoErrors(errors);
  });

  test('fin de partida guarda el récord y persiste tras recargar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await press(page, '#modeMission', isMobile);
    await until(page, () => window.__valle.snap().state === 'play');
    await page.evaluate(() => window.__valle.skipWait());
    await until(page, () => window.__valle.snap().wave === 1);
    await page.evaluate(() => window.__valle.hurt(5));
    await until(page, () => window.__valle.snap().state === 'over');
    await expect(page.locator('#over')).not.toHaveClass(/hidden/);
    await expect(page.locator('#stWave')).toHaveText('🌊 OLEADA 1');
    await expect(page.locator('#overBadge')).toBeVisible();
    const stored = await page.evaluate(() => ({
      sdk: JSON.parse(localStorage.getItem('ml:scores') || '{}').valle_encantado,
      legacy: localStorage.getItem('valle_best'),
    }));
    expect(stored).toEqual({ sdk: 1, legacy: '1' });
    expect((await sdk(page)).telemetry).toContain('end');

    await page.reload();
    await ready(page);
    await expect(page.locator('#menuBest')).toContainText('MEJOR OLEADA: 1');
    expect((await snap(page)).bestWave).toBe(1);

    expectNoErrors(errors);
  });

  test('Explorar: fragmentos, diálogo y final con resumen', async ({ page, isMobile }) => {
    test.setTimeout(150_000);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await press(page, '#modeExplore', isMobile);
    await until(page, () => window.__valle.snap().state === 'play');
    await expect(page.locator('#fragN')).toHaveText('0 / 12');

    // hablar con la Anciana Alba (está al lado del inicio) con el botón 💬
    await page.evaluate(() => window.__valle.goto(3, 5));
    await expect(page.locator('#promptBtn')).toBeVisible({ timeout: 30_000 });
    // el botón rebota (animación), así que en escritorio se usa la tecla E, como un jugador real
    if (isMobile) await page.locator('#promptBtn').tap({ force: true }); else await page.keyboard.press('KeyE');
    await expect(page.locator('#dialog')).toHaveClass(/show/);
    await expect(page.locator('#npcN')).toContainText('1 / 8');
    // pasar todo el diálogo con E
    for (let i = 0; i < 12 && await page.locator('#dialog.show').count(); i++) { await page.keyboard.press('KeyE'); await wait(page, 150); }
    await expect(page.locator('#dialog')).not.toHaveClass(/show/);

    // juntar los 12 fragmentos (se teletransporta al jugador, la recolección es la lógica real)
    for (let i = 0; i < 12; i++) {
      const [x, z] = await page.evaluate(() => window.__valle.fragPos()[0]);
      await page.evaluate(([x, z]) => window.__valle.goto(x + 0.5, z + 0.5), [x, z]);
      await until(page, n => window.__valle.snap().fragsFound > n, i);
    }
    await expect(page.locator('#fragN')).toHaveText('12 / 12');
    // acortar la celebración antes del resumen
    await page.evaluate(() => window.__valle.skipWait());
    await until(page, () => window.__valle.snap().state === 'over', undefined, 60_000);
    await expect(page.locator('#overTitle')).toHaveText('¡El valle brilla!');
    expect(await page.evaluate(() => +localStorage.getItem('valle_explore_best'))).toBeGreaterThan(0);

    // seguir paseando vuelve al juego
    await press(page, '#keepBtn', isMobile);
    await until(page, () => window.__valle.snap().state === 'play');
    expectNoErrors(errors);
  });

  test('desktop: teclado mueve y el clic golpea; el mouse no abre el joystick', async ({ page, isMobile }) => {
    test.skip(isMobile, 'sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.click('#modeExplore');
    await until(page, () => window.__valle.snap().state === 'play');
    const a = await snap(page);
    await page.keyboard.down('KeyW');
    await until(page, z => Math.abs(window.__valle.snap().pz - z) > 0.5, a.pz);
    await page.keyboard.up('KeyW');
    // clic en la mitad izquierda: golpe, sin joystick táctil
    const before = (await snap(page)).attacks;
    await page.mouse.click(200, 500);
    await until(page, n => window.__valle.snap().attacks > n, before);
    await expect(page.locator('#joy')).toBeHidden();
    // sonido: el botón de la barra silencia el juego
    await page.locator('.mla-bar button[aria-label="Sonido"]').click();
    expect((await snap(page)).muted).toBe(true);
    expectNoErrors(errors);
  });

  test('móvil: joystick táctil mueve y el botón ⚔️ golpea', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo móvil');
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.tap('#modeExplore');
    await until(page, () => window.__valle.snap().state === 'play');
    await expect(page.locator('#atkBtn')).toBeVisible();

    const a = await snap(page);
    // arrastre con el dedo en la mitad izquierda (eventos de puntero táctiles)
    await page.evaluate(() => {
      const c = document.getElementById('c');
      const ev = (t, x, y) => new PointerEvent(t, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true });
      c.dispatchEvent(ev('pointerdown', 100, 600));
      window.dispatchEvent(ev('pointermove', 100, 540));
    });
    await expect(page.locator('#joy')).toBeVisible();
    await until(page, ([x, z]) => { const s = window.__valle.snap(); return Math.hypot(s.px - x, s.pz - z) > 0.5; }, [a.px, a.pz]);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true })));
    await expect(page.locator('#joy')).toBeHidden();

    const n = (await snap(page)).attacks;
    await page.tap('#atkBtn');
    await until(page, k => window.__valle.snap().attacks > k, n);
    // un toque en la zona de cámara no debe golpear (antes el mousedown de compatibilidad lo hacía)
    await wait(page, 600);
    const n2 = (await snap(page)).attacks;
    await page.touchscreen.tap(330, 500);
    await wait(page, 600);
    expect((await snap(page)).attacks).toBe(n2);
    expectNoErrors(errors);
  });

  test('cambiar a viewport de celular no rompe el layout', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    for (const vp of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
      await page.setViewportSize(vp);
      await wait(page, 300);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: innerWidth,
        canvas: [document.getElementById('c').clientWidth, document.getElementById('c').clientHeight],
      }));
      expect(m.sw).toBeLessThanOrEqual(m.cw);
      expect(m.canvas).toEqual([vp.width, vp.height]);
      // los modos siempre son alcanzables (el menú se desplaza en pantallas bajas)
      await page.locator('#modeMission').scrollIntoViewIfNeeded();
      await expect(page.locator('#modeMission')).toBeInViewport();
    }
    // HUD de "Proteger" en vertical: las placas no se pisan con la barra del arcade
    await page.setViewportSize({ width: 412, height: 915 });
    await page.locator('#modeMission').scrollIntoViewIfNeeded();
    await page.locator('#modeMission').click();
    await until(page, () => window.__valle.snap().state === 'play');
    await wait(page, 500);
    const boxes = await page.evaluate(() => ['hearts', 'heartWrap', 'waveWrap'].map(id => document.getElementById(id).getBoundingClientRect().toJSON())
      .concat([document.querySelector('.mla-bar').getBoundingClientRect().toJSON()]));
    const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `${i}-${j}`).toBe(false);
    expectNoErrors(errors);
  });
});
