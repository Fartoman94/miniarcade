// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'NEON_SURVIVOR.html';
/** Estado del juego vía el hook de sólo lectura window.__neon. */
const N = page => page.evaluate(() => {
  const n = /** @type {any} */ (window).__neon;
  return { state: n.state, score: n.score, time: n.time, level: n.level, pending: n.pending, enemies: n.enemies,
    px: n.px, py: n.py, hp: n.hp, best: n.best, looping: n.looping, muted: n.muted };
});

async function ready(page) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__neon) && !!(/** @type {any} */ (window).MLArcade));
}
/** Arranca con entrada real: toque en móvil, clic en PC. */
async function start(page, hasTouch) {
  await ready(page);
  if (hasTouch) await page.tap('#playBtn'); else await page.click('#playBtn');
  await expect.poll(async () => (await N(page)).state).toBe('play');
  await expect(page.locator('#overlay')).toBeHidden();
}
/** Arrastre táctil real (eventos touch de Chromium vía CDP). */
async function drag(page, from, to, steps = 10, holdMs = 400) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + (to[0] - from[0]) * i / steps, y = from[1] + (to[1] - from[1]) * i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await wait(page, 30);
  }
  await wait(page, holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Sin enemigos que molesten (para medir movimiento de forma determinista). */
// (las variables del juego son `let` globales: se acceden por nombre, no como window.x)
const godMode = page => page.evaluate('player.hp = player.maxHp = 1e9; spawnTimer = 1e12; enemies.length = 0;');

test.describe('Neon Survivor', () => {
  test('carga sin errores, menú visible y barra del SDK abajo a la derecha', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#ovTitle')).toHaveText('NEON SURVIVOR');
    await expect(page.locator('#bestScore')).toHaveText(/Mejor puntaje: \d+/);
    await expect(page.locator('.mla-bar.br')).toBeVisible();
    expect((await N(page)).state).toBe('menu');
    expect((await N(page)).looping).toBe(false); // el menú no quema CPU
    expectNoErrors(errors);
  });

  test('arranca con entrada real y la partida avanza', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    // poll: con la CPU saturada (SwiftShader) los FPS bajan y el juego entra en cámara lenta a propósito
    await expect.poll(async () => (await N(page)).time, { timeout: 15000 }).toBeGreaterThan(1);
    // total de enemigos generados (los vivos pueden ser 0 si el jugador ya los mató a todos)
    expect(await page.evaluate(() => /** @type {any} */ (window).__neon.spawned)).toBeGreaterThan(0);
    await expect(page.locator('#timer')).not.toHaveText('00:00');
    expect((await sdk(page)).telemetry).toContain('start');
    expectNoErrors(errors);
  });

  test('teclado: WASD mueve al jugador a velocidad independiente de los Hz', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'sólo PC');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    await godMode(page);
    const p0 = (await N(page)).px;
    await page.keyboard.down('d');
    // medir sólo mientras la tecla está apretada (evita la latencia de down/up con la CPU cargada)
    await expect.poll(async () => (await N(page)).px).toBeGreaterThan(p0);
    const a = await N(page);
    await wait(page, 1000);
    const b = await N(page);
    await page.keyboard.up('d');
    const dx = b.px - a.px, dt = b.time - a.time;
    expect(dx).toBeGreaterThan(10);
    // 3.2 px por paso de 1/60 s = 192 px por segundo de juego
    expect(dx / dt).toBeGreaterThan(170);
    expect(dx / dt).toBeLessThan(215);
    expectNoErrors(errors);
  });

  test('táctil: el joystick flotante mueve al jugador', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'sólo móvil');
    const { errors } = await openGame(page, FILE);
    await start(page, true);
    await godMode(page);
    const a = await N(page);
    await drag(page, [200, 600], [280, 600]);
    const b = await N(page);
    expect(b.px - a.px).toBeGreaterThan(40);
    expect(Math.abs(b.py - a.py)).toBeLessThan(20);
    expectNoErrors(errors);
  });

  test('Esc pausa y congela todo; Esc reanuda sin salto', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await wait(page, 1200);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    expect((await sdk(page)).paused).toBe(true);
    const a = await N(page);
    await wait(page, 1000);
    const b = await N(page);
    expect(b).toEqual(a);
    expect(b.looping).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await wait(page, 600);
    const c = await N(page);
    expect(c.time).toBeGreaterThan(a.time);
    expect(c.time).toBeLessThan(a.time + 1.2); // no recupera el segundo que estuvo en pausa
    expectNoErrors(errors);
  });

  test('botón de pausa de la barra funciona (táctil o clic)', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    const btn = page.locator('.mla-bar button[aria-label="Pausa"]');
    if (hasTouch) await btn.tap(); else await btn.click();
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await N(page);
    await wait(page, 500);
    expect((await N(page)).time).toBe(a.time);
    const resume = page.locator('.mla-pause [data-a="resume"]');
    if (hasTouch) await resume.tap(); else await resume.click();
    await expect.poll(async () => (await N(page)).time).toBeGreaterThan(a.time);
    expectNoErrors(errors);
  });

  test('Reiniciar desde el menú de pausa reinicia la partida', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.evaluate('score = 777');
    await expect.poll(async () => (await N(page)).time, { timeout: 15000 }).toBeGreaterThan(1);
    const before = await N(page);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const after = await N(page);
    expect(after.state).toBe('play');
    expect(after.score).toBe(0);
    expect(after.time).toBeLessThan(0.5);
    expect(after.level).toBe(1);
    expect((await sdk(page)).telemetry).toContain('restart');
    // un solo bucle vivo: el tiempo de juego avanza a ritmo real, no al doble
    const t0 = after.time;
    await wait(page, 1000);
    const dt = (await N(page)).time - t0;
    expect(dt).toBeGreaterThan(0.1);
    expect(dt).toBeLessThan(1.3);
    expectNoErrors(errors);
  });

  test('subir varios niveles juntos da una mejora por nivel', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await godMode(page);
    // orbe de XP que alcanza para pasar del nivel 1 al 3 (8 + 11 = 19)
    await page.evaluate('orbs.push({ x: player.x, y: player.y, vx: 0, vy: 0, value: 19, r: 5, dead: false })');
    await expect.poll(async () => (await N(page)).state).toBe('levelup');
    expect((await N(page)).pending).toBe(2);
    await expect(page.locator('#cards .card')).toHaveCount(3);
    await expect(page.locator('#luTitle')).toContainText('2 mejoras');
    await wait(page, 350);
    if (hasTouch) await page.locator('#cards .card').first().tap(); else await page.keyboard.press('1');
    await expect.poll(async () => (await N(page)).pending).toBe(1);
    await wait(page, 350);
    if (hasTouch) await page.locator('#cards .card').nth(1).tap();
    else { await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); }
    await expect.poll(async () => (await N(page)).state).toBe('play');
    await expect(page.locator('#levelUp')).toBeHidden();
    expect((await N(page)).level).toBe(3);
    await expect(page.locator('#lvl')).toHaveText('3');
    expectNoErrors(errors);
  });

  test('game over, récord guardado y persistente tras recargar', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.evaluate(`score = 4321; player.hp = 1; player.invul = 0;
      enemies.push({ x: player.x, y: player.y, r: 14, hp: 50, maxHp: 50, speed: 0, dmg: 10, xp: 1, score: 10, color: '#f55', tier: 1, id: -1 });`);
    await expect.poll(async () => (await N(page)).state).toBe('over');
    await expect(page.locator('#overlay')).toBeVisible();
    await expect(page.locator('#ovTitle')).toHaveText('GAME OVER');
    await expect(page.locator('#ovMsg')).toContainText('4321');
    await expect(page.locator('#ovMsg')).toContainText('NUEVO RÉCORD');
    await expect(page.locator('#playBtn')).toHaveText('REINTENTAR');
    const stored = await page.evaluate(() => ({ legacy: localStorage.getItem('neonBest'),
      sdk: JSON.parse(localStorage.getItem('ml:scores') || '{}').neon_survivor }));
    expect(stored).toEqual({ legacy: '4321', sdk: 4321 });
    expect((await sdk(page)).telemetry).toContain('end');
    await page.reload();
    await ready(page);
    await expect(page.locator('#bestScore')).toHaveText('Mejor puntaje: 4321');
    // reintentar arranca otra partida desde cero
    if (hasTouch) await page.tap('#playBtn'); else await page.keyboard.press('Enter');
    await expect.poll(async () => (await N(page)).state).toBe('play');
    expect((await N(page)).score).toBe(0);
    expectNoErrors(errors);
  });

  test('récord viejo (clave neonBest) se respeta', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('neonBest', '999'); sessionStorage.setItem('seeded', '1'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#bestScore')).toHaveText('Mejor puntaje: 999');
    expectNoErrors(errors);
  });

  test('mute de la barra llega al audio del juego', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    const btn = page.locator('.mla-bar button[aria-label="Sonido"]');
    if (hasTouch) await btn.tap(); else await btn.click();
    expect((await N(page)).muted).toBe(true);
    if (hasTouch) await btn.tap(); else await btn.click();
    expect((await N(page)).muted).toBe(false);
    expectNoErrors(errors);
  });

  test('cambiar a viewport de celular no rompe el layout', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.setViewportSize({ width: 360, height: 640 });
    await wait(page, 300);
    const m = await page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
      const ui = document.getElementById('ui').getBoundingClientRect(), tm = document.getElementById('timer').getBoundingClientRect();
      const n = /** @type {any} */ (window).__neon;
      return { cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height, scrollW: document.documentElement.scrollWidth,
        uiRight: ui.right, timerLeft: tm.left, px: n.px, py: n.py };
    });
    expect(m.cssW).toBe(360);
    expect(m.cssH).toBe(640);
    expect(m.scrollW).toBeLessThanOrEqual(360);
    expect(m.uiRight).toBeLessThan(m.timerLeft); // HUD izquierdo y reloj no se pisan
    expect(m.px).toBeLessThanOrEqual(360);
    expect(m.py).toBeLessThanOrEqual(640);
    // la barra del SDK queda dentro de la pantalla
    const bar = await page.locator('.mla-bar').boundingBox();
    expect(bar && bar.x + bar.width).toBeLessThanOrEqual(361);
    expectNoErrors(errors);
  });
});
