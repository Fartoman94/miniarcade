// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

// WebGL corre por CPU (SwiftShader) en headless: todo lo que depende del tiempo de juego se
// espera con expect.poll y márgenes amplios.
const FILE = 'Salva_al_rey.html?debug=1';
const snap = page => page.evaluate(() => /** @type {any} */ (window).__rey.snap());

async function open(page) {
  const r = await openGame(page, FILE);
  await expect(page.locator('#modeMission')).toBeVisible();
  await page.waitForFunction(() => /** @type {any} */ (window).__rey && /** @type {any} */ (window).MLArcade);
  return r;
}

async function startMission(page, isMobile) {
  if (isMobile) await page.tap('#modeMission'); else await page.click('#modeMission');
  await expect.poll(async () => (await snap(page)).state).toBe('play');
  await expect(page.locator('#menu')).toHaveClass(/hidden/);
}

test('carga sin errores y muestra el menú con el escenario fusionado', async ({ page }) => {
  const { errors } = await open(page);
  await wait(page, 1200);
  const s = await snap(page);
  expect(s.state).toBe('menu');
  // el pueblo estático se fusiona por material: muchas menos llamadas de dibujo que las ~350 originales
  expect(s.calls).toBeGreaterThan(0);
  expect(s.calls).toBeLessThan(160);
  expect(s.pixelRatio).toBeLessThanOrEqual(2);
  expectNoErrors(errors);
});

test('partida: arranca con input real, avanza, pausa congela y reanuda', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  expect((await sdk(page)).telemetry).toContain('start');

  // el tiempo de juego avanza
  const t0 = (await snap(page)).playTime;
  await expect.poll(async () => (await snap(page)).playTime).toBeGreaterThan(t0 + 0.1);

  if (!isMobile) {
    // moverse con el teclado (W = hacia adelante según la cámara)
    const z0 = (await snap(page)).pz;
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await snap(page)).pz, { timeout: 20_000 }).toBeLessThan(z0 - 0.3);
    await page.keyboard.up('KeyW');
  }

  // pausa con Escape: estado idéntico durante 1 s
  await page.keyboard.press('Escape');
  await expect(page.locator('.mla-pause')).toBeVisible();
  expect((await sdk(page)).paused).toBe(true);
  const a = await snap(page);
  await wait(page, 1000);
  const b = await snap(page);
  expect(b.paused).toBe(true);
  expect(b.time).toBe(a.time);
  expect(b.playTime).toBe(a.playTime);
  expect([b.px, b.pz, b.camYaw]).toEqual([a.px, a.pz, a.camYaw]);

  // reanudar sin salto de tiempo
  await page.keyboard.press('Escape');
  await expect(page.locator('.mla-pause')).toBeHidden();
  await expect.poll(async () => (await snap(page)).playTime).toBeGreaterThan(b.playTime);
  expect((await snap(page)).playTime - b.playTime).toBeLessThan(1.5);
  expectNoErrors(errors);
});

test('reiniciar desde el menú de pausa resetea la partida', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await page.evaluate(() => /** @type {any} */ (window).__rey.hurt(2));
  await expect.poll(async () => (await snap(page)).playTime).toBeGreaterThan(0.3);
  expect((await snap(page)).hearts).toBe(3);

  await page.keyboard.press('Escape');
  await page.locator('.mla-pause [data-a="restart"]').click();
  await expect(page.locator('.mla-pause')).toBeHidden();
  const s = await snap(page);
  expect(s.state).toBe('play');
  expect(s.hearts).toBe(5);
  expect(s.score).toBe(0);
  expect(s.playTime).toBeLessThan(0.3);
  expect(s.paused).toBe(false);
  expectNoErrors(errors);
});

test('los monstruos dañan el portón y, sin portón, al rey', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await page.evaluate(() => { const r = /** @type {any} */ (window).__rey; r.teleport(30, 20); r.spawn('gollum', 4); r.near(); });
  await expect.poll(async () => (await snap(page)).gateHP, { timeout: 30_000 }).toBeLessThan(100);
  await page.evaluate(() => /** @type {any} */ (window).__rey.gate(200));
  expect((await snap(page)).gateAlive).toBe(false);
  await expect.poll(async () => (await snap(page)).kingHP, { timeout: 40_000 }).toBeLessThan(100);
  expectNoErrors(errors);
});

test('fin de partida, récord guardado y persistente tras recargar', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await page.evaluate(() => { const r = /** @type {any} */ (window).__rey; r.setWave(3); r.hurt(5); });
  expect((await snap(page)).state).toBe('dying');
  await expect(page.locator('#over')).not.toHaveClass(/hidden/, { timeout: 30_000 });
  await expect(page.locator('#overBadge')).toBeVisible();
  await expect(page.locator('#stWave')).toContainText('OLEADA 3/10');
  expect((await sdk(page)).telemetry).toContain('end');
  const stored = await page.evaluate(() => ({
    legacy: localStorage.getItem('rey_best'),
    sdk: JSON.parse(localStorage.getItem('ml:scores') || '{}').salva_al_rey,
  }));
  expect(stored).toEqual({ legacy: '3', sdk: 3 });

  // la pausa no está disponible fuera de la partida
  await page.keyboard.press('Escape');
  await expect(page.locator('.mla-pause')).toBeHidden();

  await page.reload();
  await expect(page.locator('#menuBest')).toContainText('MEJOR OLEADA: 3');
  expectNoErrors(errors);
});

test('reiniciar durante la caída no termina la partida nueva', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await page.evaluate(() => /** @type {any} */ (window).__rey.hurt(5));
  await page.keyboard.press('Escape');
  await expect(page.locator('.mla-pause')).toBeVisible();
  await page.locator('.mla-pause [data-a="restart"]').click();
  const t0 = (await snap(page)).playTime;
  await expect.poll(async () => (await snap(page)).playTime, { timeout: 30_000 }).toBeGreaterThan(t0 + 1.6);
  expect((await snap(page)).state).toBe('play');
  await expect(page.locator('#over')).toHaveClass(/hidden/);
  expectNoErrors(errors);
});

test('el botón de sonido del arcade silencia el juego', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  const btn = page.locator('.mla-bar button[aria-label="Sonido"]');
  await btn.click();
  expect((await snap(page)).muted).toBe(true);
  await btn.click();
  expect((await snap(page)).muted).toBe(false);
  expectNoErrors(errors);
});

test('layout en viewport de celular: sin scroll ni HUD encimado', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await startMission(page, isMobile);
  await wait(page, 600);
  const m = await page.evaluate(() => {
    const r = sel => document.querySelector(sel).getBoundingClientRect();
    const c = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
    const over = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const tl = r('.hud-tl'), mid = r('.hud-c'), tr = r('.hud-tr'), bar = r('.mla-bar');
    return {
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      canvasW: c.clientWidth, canvasH: c.clientHeight,
      overlaps: [over(tl, mid), over(tr, mid), over(tl, tr), over(bar, mid), over(bar, tr), over(bar, tl)],
    };
  });
  expect(m.scrollW).toBeLessThanOrEqual(m.innerW);
  expect([m.canvasW, m.canvasH]).toEqual([412, 915]);
  expect(m.overlaps).toEqual([false, false, false, false, false, false]);
  expectNoErrors(errors);
});

test('táctil: joystick mueve al caballero y el botón ⚔️ golpea', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'sólo en el proyecto móvil');
  const { errors } = await open(page);
  await startMission(page, true);
  await expect(page.locator('#atkBtn')).toBeVisible();
  const vp = page.viewportSize();
  const cdp = await page.context().newCDPSession(page);
  const x = Math.round(vp.width * 0.2), y = Math.round(vp.height * 0.7);
  const z0 = (await snap(page)).pz;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 30, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 60, id: 1 }] });
  await expect(page.locator('#joy')).toBeVisible();
  await expect.poll(async () => (await snap(page)).pz, { timeout: 20_000 }).toBeLessThan(z0 - 0.3);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#joy')).toBeHidden();

  await page.tap('#atkBtn');
  await expect.poll(async () => (await snap(page)).atkCd).toBeGreaterThan(0);
  await page.tap('#jumpBtn');
  await expect.poll(async () => (await snap(page)).jumpY).toBeGreaterThan(0);
  expectNoErrors(errors);
});

test('celular apaisado: los botones de modo entran en pantalla y arrancan la partida', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await page.setViewportSize({ width: 915, height: 412 });
  await expect(page.locator('#modeMission')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#modeExplore')).toBeInViewport({ ratio: 1 });
  if (isMobile) await page.tap('#modeExplore'); else await page.click('#modeExplore');
  await expect.poll(async () => (await snap(page)).state).toBe('play');
  expect((await snap(page)).mode).toBe('explorar');
  expectNoErrors(errors);
});

test('modo exploración: "Menú del juego" en la pausa vuelve al menú de modos', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  if (isMobile) await page.tap('#modeExplore'); else await page.click('#modeExplore');
  await expect.poll(async () => (await snap(page)).state).toBe('play');
  await page.keyboard.press('Escape');
  await expect(page.locator('.mla-pause')).toBeVisible();
  await page.getByRole('button', { name: '☰ Menú del juego' }).click();
  await expect(page.locator('.mla-pause')).toBeHidden();
  await expect.poll(async () => (await snap(page)).state).toBe('menu');
  await expect(page.locator('#modeMission')).toBeVisible();
  const t0 = (await snap(page)).time;
  await wait(page, 600);
  expect((await snap(page)).time).toBeGreaterThan(t0); // el loop del menú sigue vivo
  expectNoErrors(errors);
});

/* ================= Personaje Mati Octo ================= */
const MATI_RE = /matelabs\/characters\/.*\.(glb|webp)(\?|$)/;
const preferMati = page => page.addInitScript(() => {
  try { localStorage.setItem('ml:character', JSON.stringify({ salva_al_rey: 'mati' })); } catch (e) { /* */ }
});
const heroBox = page => page.evaluate(() => /** @type {any} */ (window).__rey.heroBox());

test('selector de héroe: por defecto Caballero, sin pedir los GLB, operable con flechas y tap, y persiste', async ({ page, isMobile }) => {
  const glbs = [];
  page.on('request', r => { if (/\.glb(\?|$)/.test(r.url())) glbs.push(r.url()); });
  const { errors } = await open(page);
  const cards = page.locator('#charPick [role="radio"]');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('#charPick [data-char="clasico"]')).toHaveAttribute('aria-checked', 'true');
  await wait(page, 800);
  expect(glbs).toEqual([]); // carga diferida: con el clásico no se baja el modelo 3D
  expect((await snap(page)).char).toBe('clasico');

  // teclado: flechas dentro del radiogroup
  await page.locator('#charPick [data-char="clasico"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#charPick [data-char="mati"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#charPick [data-char="mati"]')).toBeFocused();
  await expect.poll(async () => (await snap(page)).char, { timeout: 20_000 }).toBe('mati');
  expect(glbs.length).toBe(3);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#charPick [data-char="clasico"]')).toHaveAttribute('aria-checked', 'true');
  expect((await snap(page)).char).toBe('clasico');
  expect((await snap(page)).state).toBe('menu'); // las teclas del selector no llegan al juego

  // tap / clic
  if (isMobile) await page.tap('#charPick [data-char="mati"]'); else await page.click('#charPick [data-char="mati"]');
  await expect(page.locator('#charPick [data-char="mati"]')).toHaveAttribute('aria-checked', 'true');
  expect((await snap(page)).state).toBe('menu');

  await page.reload();
  await page.waitForFunction(() => /** @type {any} */ (window).__rey);
  await expect(page.locator('#charPick [data-char="mati"]')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await snap(page)).char, { timeout: 20_000 }).toBe('mati');
  expectNoErrors(errors);
});

test('partida con Mati: escala del caballero, pies en el piso, espada y poses según el estado', async ({ page, isMobile }) => {
  await preferMati(page);
  const { errors } = await open(page);
  await expect.poll(async () => (await snap(page)).char, { timeout: 20_000 }).toBe('mati');
  await startMission(page, isMobile);
  await expect.poll(async () => (await snap(page)).pose).toBe('idle');
  const b = await heroBox(page);
  expect(b.maxY - b.minY).toBeGreaterThan(1.9);
  expect(b.maxY - b.minY).toBeLessThan(2.15);
  expect(Math.abs(b.minY - b.groundY)).toBeLessThan(0.08); // pies en el piso (hay un leve "respirar")
  expect(b.swordIn).toBe(true);

  // correr: la pose alterna corriendo ↔ quieto mientras se mueve
  const seen = new Set();
  await page.keyboard.down('KeyW');
  await expect.poll(async () => { const s = await snap(page); seen.add(s.pose); return seen.has('run'); }, { timeout: 20_000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await snap(page)).pose, { timeout: 20_000 }).toBe('idle');

  // salto: pose en el aire
  if (isMobile) await page.tap('#jumpBtn'); else await page.keyboard.press('Space');
  await expect.poll(async () => (await snap(page)).pose, { timeout: 20_000, intervals: [30, 50, 80] }).toBe('jump');
  await expect.poll(async () => (await snap(page)).pose, { timeout: 20_000 }).toBe('idle');

  // golpe: la espada sigue en el pivote y el ataque funciona
  await page.keyboard.press('KeyJ');
  await expect.poll(async () => (await snap(page)).atkCd).toBeGreaterThan(0);
  expect((await heroBox(page)).swordIn).toBe(true);

  // daño (parpadeo + tinte) y caída final siguen funcionando
  await page.evaluate(() => /** @type {any} */ (window).__rey.hurt(1));
  expect((await snap(page)).hearts).toBe(4);
  await page.evaluate(() => /** @type {any} */ (window).__rey.hurt(5));
  expect((await snap(page)).state).toBe('dying');
  await expect(page.locator('#over')).not.toHaveClass(/hidden/, { timeout: 30_000 });
  expectNoErrors(errors);
});

test('collider idéntico con Caballero y con Mati', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  const pushOut = async () => {
    await startMission(page, isMobile);
    // dentro del collider del portón: el empuje depende solo del radio del héroe
    await page.evaluate(() => /** @type {any} */ (window).__rey.teleport(0.4, -27.2));
    await expect.poll(async () => (await snap(page)).pz, { timeout: 20_000 }).toBeGreaterThan(-26);
    const s = await snap(page);
    return { r: s.playerR, x: +s.px.toFixed(3), z: +s.pz.toFixed(3) };
  };
  const classic = await pushOut();
  expect((await snap(page)).char).toBe('clasico');
  await page.evaluate(() => /** @type {any} */ (window).MLChars.set('salva_al_rey', 'mati'));
  await page.reload();
  await page.waitForFunction(() => /** @type {any} */ (window).__rey);
  await expect.poll(async () => (await snap(page)).char, { timeout: 20_000 }).toBe('mati');
  const mati = await pushOut();
  expect(classic.r).toBe(0.5);
  expect(mati).toEqual(classic);
  expectNoErrors(errors);
});

test('si fallan los archivos de Mati, se juega con el Caballero y se avisa', async ({ page, isMobile }) => {
  await page.route(MATI_RE, r => r.abort());
  await preferMati(page);
  const { errors } = await open(page);
  await expect(page.locator('#charMsg')).toHaveClass(/show/, { timeout: 20_000 });
  await expect(page.locator('#charMsg')).toContainText('seguís con el caballero');
  expect((await snap(page)).char).toBe('clasico');
  await startMission(page, isMobile);
  const t0 = (await snap(page)).playTime;
  await expect.poll(async () => (await snap(page)).playTime).toBeGreaterThan(t0 + 0.2);
  expect((await snap(page)).pose).toBe('caballero');
  // los únicos errores permitidos son los de las descargas que el test abortó a propósito
  expectNoErrors(errors.filter(e => !/Failed to load resource: net::ERR_FAILED/.test(e)));
});
