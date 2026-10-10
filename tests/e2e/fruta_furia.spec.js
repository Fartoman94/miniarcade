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
    await expect.poll(async () => (await snap(page)).time, { timeout: 15_000 }).toBeGreaterThan(r.time);
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
    test.setTimeout(200_000);
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
      }, { timeout: 60_000, intervals: [200] }).toBeGreaterThanOrEqual(3);
      expect(Math.min(...apex)).toBeGreaterThan(0.1);
      expect(Math.max(...apex)).toBeLessThan(0.55);
      expectNoErrors(errors);
    }
  });

  test('layout en viewport de celular', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.setViewportSize({ width: 390, height: 780 });
    // con la máquina cargada el evento resize puede tardar: esperar a que el canvas lo tome
    await expect.poll(() => page.evaluate(() => document.getElementById('c')?.clientWidth), { timeout: 15_000 }).toBe(390);
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

/* ---------------- MiniArcade 3.0 ---------------- */
const DBG = 'fruta_furia.html?debug=1';
/** Arranca una partida con los lanzamientos automáticos frenados (sólo aparece lo que pone la prueba). */
async function startHeld(page, isMobile) {
  await wait(page, 500);
  await tapCenter(page, isMobile);
  await expect.poll(async () => (await snap(page)).state, { timeout: 10_000 }).toBe('playing');
  await page.evaluate(() => { const d = /** @type {any} */ (window).__fruta.debug; d.hold(); d.clear(); });
}
/** Pone una fruta quieta en (fx, fy) relativo a la pantalla. */
const put = (page, type, fx, fy) => page.evaluate(([t, x, y]) => /** @type {any} */ (window).__fruta.debug.spawn(t, innerWidth * x, innerHeight * y), [type, fx, fy]);
/** Corte horizontal real a la altura fy (relativa). */
async function hswipe(page, isMobile, fy, x1 = 0.05, x2 = 0.95) {
  const vp = page.viewportSize() || { width: 800, height: 600 };
  await swipe(page, isMobile, vp.width * x1, vp.height * fy, vp.width * x2, vp.height * fy, 14);
}
/** Repite el tajo real (hasta 4 veces) hasta que se cumpla la condición: en CI cargado un gesto puede llegar tarde. */
async function swipeUntil(page, isMobile, fy, cond) {
  for (let i = 0; i < 4; i++) {
    await hswipe(page, isMobile, fy);
    try { await expect.poll(cond, { timeout: 6_000 }).toBe(true); return; } catch (e) { if (i === 3) throw e; }
  }
}
const mstate = page => page.evaluate(() => /** @type {any} */ (window).MLMissions.state());
const mOf = (st, id) => st.current.find(m => m.id === id);

test.describe('Fruta Furia 3.0', () => {
  test('misiones: principal (jefe) y secundaria (combo) cumplidas, «Intacto» falla, persisten', async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    const { errors } = await openGame(page, DBG);
    await startHeld(page, !!isMobile);
    let st = await mstate(page);
    expect(st.running).toBe(true);
    expect(st.current.map(m => m.id)).toEqual(['p_boss', 's_intact', 's_combo']);

    // combo ×4: cuatro frutas en fila, un solo tajo real
    for (const fx of [0.2, 0.4, 0.6, 0.8]) await put(page, 'manzana', fx, 0.5);
    await swipeUntil(page, !!isMobile, 0.5, async () => mOf(await mstate(page), 's_combo').status === 'done');
    expect((await snap(page)).sliced).toBe(4);

    // «Intacto» (failOn lifeLost): un petardo tocado quita una vida y la hace fallar
    await put(page, 'petardo', 0.5, 0.3);
    await swipeUntil(page, !!isMobile, 0.3, async () => (await snap(page)).misses === 1);
    expect((await snap(page)).state).toBe('playing');
    expect(mOf(await mstate(page), 's_intact').status).toBe('failed');

    // principal: Sandía Gigante con 2 de vida, dos tajos reales
    await page.evaluate(() => { const d = /** @type {any} */ (window).__fruta.debug; d.boss(2, 60); d.bossNow(); });
    for (let i = 0; i < 6 && (await snap(page)).boss; i++) {
      const b = (await snap(page)).boss;
      const vp = page.viewportSize() || { width: 800, height: 600 };
      await swipe(page, !!isMobile, b.x - b.r * 1.6, b.y, b.x + b.r * 1.6, b.y, 14);
      if (b.x < 0 || b.x > vp.width) break;
    }
    await expect.poll(async () => (await snap(page)).bossKills, { timeout: 10_000 }).toBe(1);
    expect(mOf(await mstate(page), 'p_boss').status).toBe('done');

    await page.reload();
    await wait(page, 500);
    const ach = (await mstate(page)).achievements.done;
    expect(ach.p_boss).toBeGreaterThanOrEqual(1);
    expect(ach.s_combo).toBeGreaterThanOrEqual(1);
    expect(ach.s_intact).toBeUndefined();
    expectNoErrors(errors);
  });

  test('dificultad: teclado y toque, persiste y cambia parámetros', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await wait(page, 500);
    const radios = page.locator('#diffBox [role="radio"]');
    await expect(radios).toHaveCount(4);
    expect((await snap(page)).diff).toBe('normal');
    const normalD = (await snap(page)).D;
    expect(normalD).toMatchObject({ speed: 1, spawn: 1, bomb: 1, bombAt: 8, bossHp: 16 });
    // teclado: flecha a la derecha desde Normal → Difícil
    await page.locator('#diffBox [data-d="normal"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#diffBox [data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    expect((await snap(page)).state).toBe('menu'); // elegir no arranca la partida
    expect((await snap(page)).D.spawn).toBeLessThan(1);
    // toque/clic: Fácil
    if (isMobile) await page.locator('#diffBox [data-d="facil"]').tap();
    else await page.locator('#diffBox [data-d="facil"]').click();
    expect((await snap(page)).state).toBe('menu');
    const f = (await snap(page)).D;
    expect(f.speed).toBeLessThan(1);
    expect(f.bossHp).toBeLessThan(normalD.bossHp);
    await page.reload();
    await wait(page, 500);
    expect((await snap(page)).diff).toBe('facil');
    await expect(page.locator('#diffBox [data-d="facil"]')).toHaveAttribute('aria-checked', 'true');
    expectNoErrors(errors);
  });

  test('calidad: baja/media/alta cambian DPR, tope de partículas y manchas', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await startHeld(page, !!isMobile);
    const setQ = q => page.evaluate(q2 => /** @type {any} */ (window).MLArcade.settings.set('quality', q2), q);
    await setQ('low');
    let s = await snap(page);
    expect(s.q).toMatchObject({ tier: 'low', dpr: 1, partCap: 120, stains: 0, flies: 0 });
    expect(s.q.canvasW).toBe(page.viewportSize()?.width);
    // muchas frutas cortadas: las partículas nunca pasan el tope
    for (const fy of [0.3, 0.45, 0.6]) for (const fx of [0.15, 0.35, 0.55, 0.75]) await put(page, 'sandia', fx, fy);
    for (const fy of [0.3, 0.45, 0.6]) await hswipe(page, !!isMobile, fy);
    s = await snap(page);
    expect(s.sliced).toBeGreaterThanOrEqual(8);
    expect(s.parts).toBeLessThanOrEqual(120);
    expect(s.stainsN).toBe(0);
    await setQ('high');
    s = await snap(page);
    expect(s.q).toMatchObject({ tier: 'high', partCap: 520, stains: 22, flies: 14, parallax: true });
    await setQ('medium');
    s = await snap(page);
    expect(s.q).toMatchObject({ tier: 'medium', partCap: 260, stains: 10 });
    expect(s.q.dpr).toBeLessThanOrEqual(1.5);
    expectNoErrors(errors);
  });

  test('frutas especiales: helada (cámara lenta), ananá gigante (3 tajos), dorada', async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    const { errors } = await openGame(page, DBG);
    await startHeld(page, !!isMobile);
    await put(page, 'helada', 0.5, 0.4);
    await swipeUntil(page, !!isMobile, 0.4, async () => (await snap(page)).slow);
    let s = await snap(page);
    expect(s.score).toBe(20);
    await expect.poll(async () => (await snap(page)).ts, { timeout: 8_000 }).toBeLessThan(0.8);
    // la cámara lenta se termina sola
    await expect.poll(async () => (await snap(page)).ts, { timeout: 30_000, intervals: [300] }).toBeGreaterThan(0.95);

    // ananá: cada tajo resta uno; con el tercero se parte (sigue quieto para la prueba)
    await put(page, 'gigante', 0.5, 0.5);
    const hp = async () => ((await snap(page)).fruits.find(f => f.type === 'gigante') || { hp: 0 }).hp;
    await swipeUntil(page, !!isMobile, 0.5, async () => (await hp()) === 2);
    await swipeUntil(page, !!isMobile, 0.5, async () => (await hp()) === 1);
    await swipeUntil(page, !!isMobile, 0.5, async () => (await hp()) === 0);
    s = await snap(page);
    expect(s.score).toBe(20 + 5 + 5 + 40);

    await put(page, 'dorada', 0.5, 0.5);
    await swipeUntil(page, !!isMobile, 0.5, async () => (await snap(page)).score === 120);
    expect(s.misses).toBe(0);
    expectNoErrors(errors);
  });

  test('bombas: aviso previo, petardo resta una vida, bomba termina la partida', async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    const { errors } = await openGame(page, DBG);
    await startHeld(page, !!isMobile);
    // aviso: la bomba no entra al juego hasta que termina el aviso de abajo
    await page.evaluate(() => /** @type {any} */ (window).__fruta.debug.launch('bomba', innerWidth / 2));
    let s = await snap(page);
    expect(s.warns.length).toBe(1);
    expect(s.warns[0].type).toBe('bomba');
    expect(s.fruits.filter(f => f.type === 'bomba').length).toBe(0);
    await expect.poll(async () => (await snap(page)).fruits.filter(f => f.type === 'bomba').length, { timeout: 8_000 }).toBe(1);
    // dejarla pasar sin tocarla no penaliza
    await expect.poll(async () => (await snap(page)).fruits.length, { timeout: 20_000 }).toBe(0);
    expect((await snap(page)).misses).toBe(0);
    expect((await snap(page)).state).toBe('playing');

    await put(page, 'petardo', 0.5, 0.5);
    await swipeUntil(page, !!isMobile, 0.5, async () => (await snap(page)).misses === 1);
    expect((await snap(page)).state).toBe('playing');
    await expect(page.locator('#lives i.lost')).toHaveCount(1);

    await put(page, 'bomba', 0.5, 0.5);
    await swipeUntil(page, !!isMobile, 0.5, async () => ['boom', 'over'].includes((await snap(page)).state));
    await expect.poll(async () => (await snap(page)).state, { timeout: 10_000 }).toBe('over');
    await expect(page.locator('#overKicker')).toContainText('BOMBA');
    // desde el fin se vuelve al menú (para cambiar la dificultad)
    await wait(page, 600);
    await page.locator('#btnMenu').click();
    await expect.poll(async () => (await snap(page)).state).toBe('menu');
    await expect(page.locator('#menu')).toBeVisible();
    expect((await mstate(page)).running).toBe(false);
    expectNoErrors(errors);
  });

  test('Sandía Gigante: aparece en la oleada 4, recibe tajos, se escapa sin penalizar', async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    const { errors } = await openGame(page, DBG);
    await startHeld(page, !!isMobile);
    for (let i = 0; i < 4; i++) await page.evaluate(() => /** @type {any} */ (window).__fruta.debug.wave());
    let s = await snap(page);
    expect(s.wave).toBe(4);
    expect(s.boss).not.toBeNull();
    expect(s.boss.max).toBe(16); // Normal
    await page.evaluate(() => { const d = /** @type {any} */ (window).__fruta.debug; d.clear(); d.bossNow(); });
    for (let i = 0; i < 4 && (await snap(page)).boss.hp === 16; i++) {
      const b = (await snap(page)).boss;
      await swipe(page, !!isMobile, b.x - b.r * 1.6, b.y, b.x + b.r * 1.6, b.y, 14);
      await expect.poll(async () => (await snap(page)).boss.hp, { timeout: 6_000 }).toBeLessThan(16).catch(() => {});
    }
    const hit = await snap(page);
    expect(hit.boss.hp).toBeLessThan(16);
    expect(hit.score).toBe(5 * (16 - hit.boss.hp)); // 5 puntos por tajo
    // tiempo agotado: se va, sin perder vidas, y vuelven los lanzamientos
    await page.evaluate(() => { const d = /** @type {any} */ (window).__fruta.debug; d.boss(16, 0.5); d.bossNow(); });
    await expect.poll(async () => (await snap(page)).boss, { timeout: 20_000 }).toBeNull();
    s = await snap(page);
    expect(s.misses).toBe(0);
    expect(s.bossKills).toBe(0);
    expectNoErrors(errors);
  });

  test('multitáctil: dos dedos cortan a la vez, cada uno con su tajo', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto táctil');
    const { errors } = await openGame(page, DBG);
    await startHeld(page, true);
    await put(page, 'naranja', 0.5, 0.3);
    await put(page, 'limon', 0.5, 0.7);
    const vp = page.viewportSize() || { width: 400, height: 800 };
    const cdp = await page.context().newCDPSession(page);
    const pts = k => [{ x: vp.width * (0.1 + 0.8 * k), y: vp.height * 0.3, id: 1 }, { x: vp.width * (0.9 - 0.8 * k), y: vp.height * 0.7, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(0) });
    let maxSw = 0;
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(i / 12) });
      if (i === 6) maxSw = (await snap(page)).swipes;
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(maxSw).toBe(2);
    await expect.poll(async () => (await snap(page)).sliced, { timeout: 8_000 }).toBe(2);
    expect((await snap(page)).swipes).toBe(0);
    expectNoErrors(errors);
  });
});
