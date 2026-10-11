// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'clavado.html';
// Con SwiftShader y la máquina cargada, Chromium headless a veces deja de entregar cuadros
// (requestAnimationFrame) durante varios segundos: los tiempos de espera son holgados a propósito.
const T = 20_000;
/** @param {import('@playwright/test').Page} page */
const S = page => page.evaluate(() => /** @type {any} */ (window).__clavado.snap());

/** Entrada real: toque en móvil, Espacio en PC. */
async function press(page, hasTouch) {
  if (hasTouch) await page.touchscreen.tap(200, 600);
  else await page.keyboard.press('Space');
}

async function start(page, hasTouch) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado) && !!(/** @type {any} */ (window).MLArcade));
  await press(page, hasTouch);
  await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
}

/** Lanza un cuchillo cuando está listo y espera a que se clave. */
async function stickOne(page, hasTouch) {
  await page.waitForFunction(() => /** @type {any} */ (window).__clavado.snap().knifeState === 'ready', null, { polling: 100, timeout: T });
  const before = (await S(page)).stuck;
  await press(page, hasTouch);
  await expect.poll(async () => (await S(page)).stuck, { timeout: T }).toBe(before + 1);
}

/** Fuerza que el próximo cuchillo choque contra uno clavado y espera la pantalla final. */
async function breakKnife(page, hasTouch) {
  await page.waitForFunction(() => /** @type {any} */ (window).__clavado.snap().knifeState === 'ready', null, { polling: 100, timeout: T });
  await page.evaluate(() => /** @type {any} */ (window).__clavado.forceNextHit());
  await press(page, hasTouch);
  await expect(page.locator('#over')).not.toHaveClass(/hidden/, { timeout: T });
}

// El host de pruebas tiene gamepads físicos que Chromium headless también ve: el botón A (→ Espacio) arrancaba
// partidas solas. El SDK ya los ignora con navigator.webdriver; esto queda como doble resguardo.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true }); } catch (e) {} });
});

test.describe('¡Clavado!', () => {
  test('carga sin errores, la demo del menú gira y la barra no tapa el HUD', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#menu .blink')).toHaveText(/TOCÁ PARA JUGAR/);
    const a = await S(page);
    expect(a.state).toBe('menu');
    await expect.poll(async () => (await S(page)).theta, { timeout: T }).not.toBe(a.theta);
    await expect(page.locator('.mla-bar.tr')).toBeVisible();
    expectNoErrors(errors);
  });

  test('arranca con entrada real, clava cuchillos y suma puntos', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    expect((await S(page)).score).toBe(0);
    await stickOne(page, hasTouch);
    const s = await S(page);
    expect(s.score).toBeGreaterThan(0);
    expect(s.throwsLeft).toBe(5);
    await expect(page.locator('#score')).not.toHaveText('0');
    expect((await sdk(page)).telemetry).toContain('start');
    // la barra del arcade no se superpone con el puntaje ni con el nivel
    const bar = await page.locator('.mla-bar').boundingBox();
    for (const sel of ['#score', '#level']) {
      const b = await page.locator(sel).boundingBox();
      const overlap = bar && b && bar.x < b.x + b.width && b.x < bar.x + bar.width && bar.y < b.y + b.height && b.y < bar.y + bar.height;
      expect(overlap, sel + ' tapado por la barra').toBeFalsy();
    }
    expectNoErrors(errors);
  });

  test('Escape congela el juego y reanudar continúa', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await S(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await S(page);
    expect(b.theta).toBe(a.theta);
    expect(b.time).toBe(a.time);
    // la entrada al juego queda bloqueada durante la pausa (tecla que no es del menú)
    await page.evaluate(() => (/** @type {HTMLElement} */ (document.activeElement)).blur());
    await page.keyboard.press('Space');
    const g = await S(page);
    expect(g.knifeState).toBe(a.knifeState);
    expect(g.stuck).toBe(a.stuck);
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(async () => (await S(page)).theta, { timeout: T }).not.toBe(b.theta);
    const c = await S(page);
    // sin salto de tiempo al reanudar (dt acotado): avanzó como mucho lo que duró la espera
    expect(c.time - b.time).toBeLessThan(0.5);
    expectNoErrors(errors);
  });

  test('reiniciar desde la pausa reinicia la partida', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await stickOne(page, hasTouch);
    expect((await S(page)).score).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const s = await S(page);
    expect(s.state).toBe('playing');
    expect(s.score).toBe(0);
    expect(s.level).toBe(1);
    expect(s.stuck).toBe(0);
    expect(s.paused).toBe(false);
    await expect.poll(async () => (await S(page)).time, { timeout: T }).toBeGreaterThan(s.time); // el bucle sigue vivo
    expectNoErrors(errors);
  });

  test('romper un cuchillo termina la partida una sola vez, guarda el récord y persiste', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await page.addInitScript(() => {
      /** @type {any} */ (window).__ended = 0;
      addEventListener('DOMContentLoaded', () => {
        const ML = /** @type {any} */ (window).MLArcade; const orig = ML.ended;
        ML.ended = (/** @type {any} */ i) => { /** @type {any} */ (window).__ended++; return orig(i); };
      });
    });
    await page.reload();
    await start(page, hasTouch);
    await stickOne(page, hasTouch);
    await breakKnife(page, hasTouch);
    const s = await S(page);
    expect(s.state).toBe('over');
    const score = s.score;
    expect(score).toBeGreaterThan(0);
    // el cuchillo roto no sigue sumando ni dispara varios game over (bug del original)
    await wait(page, 1200);
    expect((await S(page)).score).toBe(score);
    expect(await page.evaluate(() => /** @type {any} */ (window).__ended)).toBe(1);
    await expect(page.locator('#overScore')).toHaveText(String(score));
    await expect(page.locator('#recordBadge')).toBeVisible();
    const stored = await page.evaluate(() => ({ legacy: localStorage.getItem('clavado_best'), ml: JSON.parse(localStorage.getItem('ml:scores') || '{}').clavado }));
    expect(Number(stored.legacy)).toBe(score);
    expect(stored.ml).toBe(score);
    // otra vez con entrada real
    await press(page, hasTouch);
    await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
    // el récord sobrevive a la recarga
    await page.reload();
    await expect(page.locator('#menuBest')).toHaveText('TU RÉCORD · ' + score);
    expect((await S(page)).best).toBe(score);
    expectNoErrors(errors);
  });

  test('vista móvil: redimensionar no rompe el layout', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.setViewportSize({ width: 360, height: 640 });
    await expect.poll(() => page.evaluate(() => /** @type {HTMLCanvasElement} */ (document.getElementById('c')).clientWidth), { timeout: T }).toBe(360);
    const dims = await page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
      return { cw: c.clientWidth, ch: c.clientHeight, sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    expect(dims.cw).toBe(360);
    expect(dims.ch).toBe(640);
    expect(dims.sw).toBeLessThanOrEqual(dims.iw);
    await stickOne(page, hasTouch);
    expectNoErrors(errors);
  });

  test('toque en pantalla lanza el cuchillo (móvil)', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'sólo en el proyecto móvil');
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado));
    await page.touchscreen.tap(150, 500);
    await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
    await stickOne(page, true);
    // tocar la barra del arcade no lanza cuchillos
    await page.waitForFunction(() => /** @type {any} */ (window).__clavado.snap().knifeState === 'ready', null, { polling: 100, timeout: T });
    const n = (await S(page)).stuck;
    const box = await page.locator('.mla-bar .mla-btn[aria-label="Sonido"]').boundingBox();
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await wait(page, 400);
    expect((await S(page)).stuck).toBe(n);
    expectNoErrors(errors);
  });
});

/* ---------------- MiniArcade 3.0 ---------------- */
const DBG = FILE + '?debug';
/** @param {import('@playwright/test').Page} page @param {string} fn @param {any} [arg] */
const dbg = (page, fn, arg) => page.evaluate(([f, a]) => /** @type {any} */ (window).__clavado.debug[f](a), [fn, arg]);
const MS = page => page.evaluate(() => /** @type {any} */ (window).MLMissions.state());
const ready = page => page.waitForFunction(() => /** @type {any} */ (window).__clavado.snap().knifeState === 'ready', null, { polling: 100, timeout: T });

/** Lanza con entrada real apuntando a un ángulo local exacto del tronco (giro congelado con el gancho de depuración). */
async function throwAt(page, hasTouch, local) {
  await ready(page);
  await dbg(page, 'setSpin', 0);
  await dbg(page, 'aim', local);
  const before = await S(page);
  await press(page, hasTouch);
  await expect.poll(async () => { const s = await S(page); return s.knifeState !== 'fly' && (s.stuck !== before.stuck || s.deflects !== before.deflects || s.state !== before.state || s.level !== before.level); }, { timeout: T }).toBe(true);
}
/** Lanza a un hueco libre (lejos de cuchillos, placas y manzanas). */
async function throwFree(page, hasTouch) {
  await ready(page);
  await dbg(page, 'setSpin', 0);
  await dbg(page, 'aimFree');
  const before = await S(page);
  await press(page, hasTouch);
  await expect.poll(async () => { const s = await S(page); return s.throwsLeft !== before.throwsLeft || s.level !== before.level || (s.boss && before.boss && s.boss.left !== before.boss.left) || s.state !== before.state; }, { timeout: T }).toBe(true);
}
async function startDbg(page, hasTouch) {
  const r = await openGame(page, DBG);
  await start(page, hasTouch);
  return r;
}

test.describe('¡Clavado! 3.0', () => {
  test('choque cuchillo-cuchillo con la matemática angular real (umbral 0,105 rad)', async ({ page, hasTouch }) => {
    const { errors } = await startDbg(page, hasTouch);
    await throwAt(page, hasTouch, 1.0);
    let s = await S(page);
    expect(s.stuck).toBe(1);
    expect(s.stuckAngles[0]).toBeCloseTo(1.0, 6);
    await throwAt(page, hasTouch, 1.11); // 0,11 rad: entra (es un roce)
    s = await S(page);
    expect(s.state).toBe('playing');
    expect(s.stuck).toBe(2);
    expect(s.nearMisses).toBe(1);
    await throwAt(page, hasTouch, 0.90); // 0,10 rad del primero: se rompe
    await expect(page.locator('#over')).not.toHaveClass(/hidden/, { timeout: T });
    s = await S(page);
    expect(s.state).toBe('over');
    expect(s.stuck).toBe(2);
    expectNoErrors(errors);
  });

  test('patrones de giro: cambios de sentido (flip, oleaje) y frenadas (arranca-frena)', async ({ page, hasTouch }) => {
    // necesita varios segundos de tiempo de juego; con la máquina cargada headless entrega pocos cuadros (dt acotado)
    test.setTimeout(300_000);
    const { errors } = await startDbg(page, hasTouch);
    for (const [lv, mode] of [[4, 'flip'], [11, 'surge']]) {
      await dbg(page, 'setLevel', lv);
      expect((await S(page)).mode).toBe(mode);
      const seen = new Set();
      await expect.poll(async () => { const o = (await S(page)).omega; seen.add(Math.sign(o)); return seen.has(1) && seen.has(-1); }, { timeout: 90_000, intervals: [250], message: 'cambio de sentido en el nivel ' + lv }).toBe(true);
    }
    await dbg(page, 'setLevel', 9);
    expect((await S(page)).mode).toBe('stopgo');
    let mn = 9, mx = -9;
    await expect.poll(async () => { const o = (await S(page)).omega; mn = Math.min(mn, o); mx = Math.max(mx, o); return mn <= 0.02 && mx > 0.5; }, { timeout: 90_000, intervals: [250] }).toBe(true);
    expect(mn).toBeGreaterThanOrEqual(0); // nunca gira hacia atrás
    expectNoErrors(errors);
  });

  test('placas: acero rebota sin gastar el cuchillo, el hielo se rompe en 2 golpes', async ({ page, hasTouch }) => {
    const { errors } = await startDbg(page, hasTouch);
    await dbg(page, 'setLevel', 3);
    let s = await S(page);
    expect(s.plates.map(p => p.type)).toEqual(['steel']);
    expect(s.goal.type).toBe('clean');
    const left = s.throwsLeft, stuck = s.stuck, score = s.score;
    await throwAt(page, hasTouch, s.plates[0].c);
    s = await S(page);
    expect(s.deflects).toBe(1);
    expect(s.throwsLeft).toBe(left);
    expect(s.stuck).toBe(stuck);
    expect(s.score).toBe(score);
    expect(s.combo).toBe(0);
    expect(s.state).toBe('playing');
    expect(s.goal.failed).toBe(true);
    await ready(page); // el cuchillo vuelve a estar listo
    await throwFree(page, hasTouch);
    expect((await S(page)).stuck).toBe(stuck + 1);
    // hielo (nieve)
    await dbg(page, 'setLevel', 6);
    s = await S(page);
    expect(s.biome).toBe('nieve');
    expect(s.plates.map(p => p.type)).toEqual(['ice']);
    const c = s.plates[0].c;
    await throwAt(page, hasTouch, c);
    expect((await S(page)).plates[0].hp).toBe(1);
    await throwAt(page, hasTouch, c);
    s = await S(page);
    expect(s.plates.length).toBe(0);
    expect(s.deflects).toBe(3);
    await throwAt(page, hasTouch, c); // sin placa: ahora se clava ahí
    expect((await S(page)).stuckAngles.some(a => Math.abs(a - c) < 1e-6)).toBe(true);
    expectNoErrors(errors);
  });

  test('compuertas: abren y cierran solas; abierta se traba con el cuchillo, cerrada rebota', async ({ page, hasTouch }) => {
    const { errors } = await startDbg(page, hasTouch);
    await dbg(page, 'setLevel', 4);
    let s = await S(page);
    expect(s.plates.map(p => p.type)).toEqual(['shutter', 'shutter']);
    const seen = new Set();
    await expect.poll(async () => { seen.add((await S(page)).plates[0].solid); return seen.size; }, { timeout: 30_000, intervals: [100] }).toBe(2);
    await page.evaluate(() => { const d = /** @type {any} */ (window).__clavado.debug; d.forcePlate(0, 'open'); d.forcePlate(1, 'closed'); });
    s = await S(page);
    await throwAt(page, hasTouch, s.plates[0].c);
    s = await S(page);
    expect(s.plates[0].jammed).toBe(true);
    expect(s.jams).toBe(1);
    expect(s.deflects).toBe(0);
    await throwAt(page, hasTouch, s.plates[1].c);
    s = await S(page);
    expect(s.deflects).toBe(1);
    expect(s.plates[1].jammed).toBe(false);
    expectNoErrors(errors);
  });

  test('tronco jefe: 3 fases, suelta los cuchillos entre fases, se derriba y paga la recompensa', async ({ page, hasTouch }) => {
    test.setTimeout(240_000);
    const { errors } = await startDbg(page, hasTouch);
    expect((await MS(page)).current[0].id).toBe('p_boss1');
    await dbg(page, 'setLevel', 5);
    let s = await S(page);
    expect(s.boss).toMatchObject({ name: 'ROBLE MILENARIO', phase: 0, phases: 3, total: 14, left: 14 });
    const phasesSeen = new Set([0]);
    let guard = 0, scoreBefore = 0;
    while ((await S(page)).bossesDefeated === 0 && guard++ < 30) {
      s = await S(page);
      if (s.boss) { phasesSeen.add(s.boss.phase); scoreBefore = s.score; }
      if (s.state !== 'playing') { await wait(page, 200); continue; }
      await throwFree(page, hasTouch);
      const a = await S(page);
      if (a.boss && a.boss.breaking) expect(a.stuck).toBe(0); // los cuchillos saltan al cambiar de fase
    }
    s = await S(page);
    expect(s.bossesDefeated).toBe(1);
    expect([...phasesSeen].sort()).toEqual([0, 1, 2]);
    expect(s.lastBossBonus).toBe(200 * 1 + 100 * 3);
    expect(s.score - scoreBefore).toBeGreaterThanOrEqual(500);
    await expect.poll(async () => (await S(page)).level, { timeout: 60_000 }).toBe(6);
    s = await S(page);
    expect(s.biome).toBe('nieve');
    expect(s.boss).toBe(null);
    const m = await MS(page);
    expect(m.current.find(x => x.id === 'p_boss1').status).toBe('done');
    expect(m.achievements.done.p_boss1).toBe(1);
    expectNoErrors(errors);
  });

  test('misiones: secundaria cumplida, secundaria fallada (failOn) y persistencia', async ({ page, hasTouch }) => {
    const { errors } = await startDbg(page, hasTouch);
    let m = await MS(page);
    expect(m.running).toBe(true);
    expect(m.current.map(x => x.id)).toEqual(['p_boss1', 's_graze', 's_armor']);
    await expect(page.locator('.mlm-hud [data-m="s_graze"]')).toBeVisible();
    for (const a of [1.0, 1.15, 0.85, 1.3]) await throwAt(page, hasTouch, a);
    expect((await S(page)).nearMisses).toBe(3);
    m = await MS(page);
    expect(m.current.find(x => x.id === 's_graze').status).toBe('done');
    await expect(page.locator('.mlm-hud [data-m="s_graze"]')).toHaveClass(/done/);
    // rebotar en una placa hace fallar «sin rebotes»
    await dbg(page, 'setLevel', 3);
    await throwAt(page, hasTouch, (await S(page)).plates[0].c);
    m = await MS(page);
    expect(m.current.find(x => x.id === 's_armor').status).toBe('failed');
    // reiniciar desde la pausa cierra la partida y abre otra
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    m = await MS(page);
    expect(m.running).toBe(true);
    expect(m.achievements.runs).toBe(2);
    // persistencia
    await page.reload();
    await page.waitForFunction(() => !!(/** @type {any} */ (window).MLMissions));
    m = await MS(page);
    expect(m.achievements.done.s_graze).toBe(1);
    expect(m.achievements.done.s_armor).toBeUndefined();
    expectNoErrors(errors);
  });

  test('dificultad: teclado y toque en el menú, persiste y cambia la velocidad real', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado));
    const picker = page.locator('#menu .mlm-diff');
    await expect(picker).toBeVisible();
    expect((await S(page)).base).toBeCloseTo(0.89, 6); // Normal = balance original del nivel 1
    await picker.locator('[aria-checked="true"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(picker.locator('[data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    let s = await S(page);
    expect(s.difficulty).toBe('dificil');
    expect(s.base).toBeCloseTo(0.89 * 1.15, 6);
    expect(s.state).toBe('menu'); // elegir no arranca la partida
    if (hasTouch) await picker.locator('[data-d="facil"]').tap(); else await picker.locator('[data-d="facil"]').click();
    s = await S(page);
    expect(s.difficulty).toBe('facil');
    expect(s.state).toBe('menu');
    await page.reload();
    await expect(page.locator('#menu .mlm-diff [data-d="facil"]')).toHaveAttribute('aria-checked', 'true');
    await start(page, hasTouch);
    s = await S(page);
    expect(s.difficulty).toBe('facil');
    expect(s.base).toBeCloseTo(0.89 * 0.8, 6);
    expect(s.comboWindow).toBe(1.8);
    expectNoErrors(errors);
  });

  test('calidad: baja/alta cambian resolución, partículas, capas y sombras', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    let s = await S(page);
    expect(s).toMatchObject({ quality: 'low', dprCap: 1, partCap: 70, ambient: 6, layers: 1, shadows: false });
    const dims = await page.evaluate(() => ({ iw: innerWidth, dpr: devicePixelRatio }));
    expect(s.canvasW).toBe(Math.round(dims.iw * Math.min(dims.dpr, 1)));
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    s = await S(page);
    expect(s).toMatchObject({ quality: 'high', dprCap: 2, partCap: 340, ambient: 28, layers: 3, shadows: true });
    expect(s.canvasW).toBe(Math.round(dims.iw * Math.min(dims.dpr, 2)));
    // el botón del menú de pausa también la cambia (alta → automática)
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="quality"]').click();
    await expect(page.locator('.mla-pause [data-a="quality"]')).toContainText('Automática');
    await page.locator('.mla-pause [data-a="resume"]').click();
    await stickOne(page, hasTouch);
    expect((await S(page)).parts).toBeLessThanOrEqual((await S(page)).partCap);
    expectNoErrors(errors);
  });

  test('reto del nivel: cortar la manzana del nivel 1 paga +100 una sola vez', async ({ page, hasTouch }) => {
    const { errors } = await startDbg(page, hasTouch);
    let s = await S(page);
    expect(s.goal).toMatchObject({ type: 'apples', done: false });
    await expect(page.locator('#goal')).toContainText('Cortá la manzana');
    await throwAt(page, hasTouch, s.appleAngles[0]);
    s = await S(page);
    expect(s.apples).toBe(0);
    expect(s.goal.done).toBe(true);
    expect(s.goalsDone).toBe(1);
    expect(s.score).toBe(50 + 100 + 10);
    await expect(page.locator('#goal')).toHaveClass(/done/);
    await throwFree(page, hasTouch);
    expect((await S(page)).goalsDone).toBe(1);
    expectNoErrors(errors);
  });

  test('biomas por etapa y reinicio limpio desde un jefe', async ({ page, hasTouch }) => {
    const { errors } = await startDbg(page, hasTouch);
    for (const [lv, biome, kinds] of [[11, 'volcan', ['shutter']], [17, 'cristal', ['steel', 'ice', 'shutter']], [10, 'nieve', null]]) {
      await dbg(page, 'setLevel', lv);
      const s = await S(page);
      expect(s.biome).toBe(biome);
      await expect(page.locator('#stage')).not.toHaveText('BOSQUE');
      if (kinds) expect(s.plates.map(p => p.type)).toEqual(kinds);
      else expect(s.boss.name).toBe('ABETO DE HIELO');
    }
    await throwFree(page, hasTouch);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    const s = await S(page);
    expect(s).toMatchObject({ state: 'playing', level: 1, score: 0, boss: null, biome: 'bosque', deflects: 0, bossesDefeated: 0, plates: [] });
    await expect(page.locator('#stage')).toHaveText('BOSQUE');
    expectNoErrors(errors);
  });
});

/* ---------------- Móvil (proyecto 'mobile', Pixel 7) ---------------- */
const SIZES = [[360, 640], [390, 844], [412, 915], [915, 412], [844, 390]];
/** @param {number[]} a @param {number[]} b */
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** Rectángulos [x0,y0,x1,y1] de elementos visibles. */
const rects = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].filter(e => {
  const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
  return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
}).map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }), sel);

test.describe('¡Clavado! móvil', () => {
  test.beforeEach(({ hasTouch }) => { test.skip(!hasTouch, 'sólo en el proyecto móvil'); });

  test('matriz de pantallas: menú, HUD, misiones y cuchillo sin superposiciones; partida sólo con toques', async ({ page }) => {
    test.setTimeout(150_000);
    const { errors } = await openGame(page, DBG);
    for (const [w, h] of SIZES) {
      const tag = `${w}×${h}`;
      await page.setViewportSize({ width: w, height: h });
      await page.reload();
      await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado));
      await expect.poll(async () => (await S(page)).layout.W, { timeout: T }).toBe(w);
      // menú: sin scroll, todo dentro de la pantalla y nada pisando la barra del arcade ni el selector
      const sc = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight]);
      expect(sc[0], tag + ' scroll horizontal').toBeLessThanOrEqual(sc[2]);
      expect(sc[1], tag + ' scroll vertical').toBeLessThanOrEqual(sc[3]);
      const bar = (await rects(page, '.mla-bar'))[0];
      const diff = (await rects(page, '#diffBox .mlm-diff'))[0];
      const menuEls = await rects(page, '#menu > :not(#diffBox):not(.foot)');
      for (const r of [...menuEls, diff]) {
        expect(r[0] >= 0 && r[1] >= 0 && r[2] <= w + 0.5 && r[3] <= h + 0.5, tag + ' fuera de pantalla ' + r).toBe(true);
        expect(hit(r, bar), tag + ' tapado por la barra ' + r).toBe(false);
      }
      for (const r of menuEls) expect(hit(r, diff), tag + ' pisa el selector ' + r).toBe(false);
      // objetivos táctiles
      for (const r of await rects(page, '#diffBox button, .mla-bar .mla-btn')) expect(Math.min(r[2] - r[0], r[3] - r[1]), tag + ' objetivo chico').toBeGreaterThanOrEqual(44);
      const play = page.locator('#playBtn');
      await expect(play).toBeVisible();
      const pb = /** @type {any} */ (await play.boundingBox());
      expect(pb.height, tag + ' botón principal').toBeGreaterThanOrEqual(56);
      // texto de juego legible
      const fs = await page.evaluate(() => ['#goal', '#stage', '#playBtn'].map(s => parseFloat(getComputedStyle(/** @type {Element} */ (document.querySelector(s))).fontSize)));
      for (const f of fs) expect(f, tag + ' texto chico').toBeGreaterThanOrEqual(12);

      // arranque y lanzamiento con toques reales
      await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
      await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
      await ready(page);
      await dbg(page, 'setSpin', 0);
      await dbg(page, 'aimFree');
      const before = (await S(page)).stuck;
      await page.touchscreen.tap(w / 2, h * 0.5);
      await expect.poll(async () => (await S(page)).stuck, { timeout: T }).toBe(before + 1);

      // nivel jefe: barra del jefe + 3 chips de misiones, contra cuchillo, HUD y barra del arcade
      await dbg(page, 'setLevel', 5);
      await expect(page.locator('.mlm-hud')).toBeVisible();
      const L = (await S(page)).layout;
      expect(L.KY + 96, tag + ' el soporte del cuchillo se sale').toBeLessThanOrEqual(h);
      const lane = [L.CX - 9, L.CY + L.R - 13, L.CX + 9, L.KY + 96]; // recorrido del cuchillo
      const boss = [L.CX - L.bossBarW / 2 - 2, L.bossBarY - 18, L.CX + L.bossBarW / 2 + 2, L.bossBarY + 10];
      const chips = await rects(page, '.mlm-hud .mlm-m');
      expect(chips.length).toBeGreaterThan(0);
      const hudEls = await rects(page, '#hud .lvl > *, #score, #hud .label');
      const bar2 = (await rects(page, '.mla-bar'))[0];
      for (const c of chips) {
        expect(c[0] >= 0 && c[2] <= w + 0.5 && c[3] <= h + 0.5, tag + ' chip fuera de pantalla').toBe(true);
        expect(hit(c, lane), tag + ' chip tapa el cuchillo').toBe(false);
        expect(hit(c, boss), tag + ' chip tapa la barra del jefe').toBe(false);
        expect(hit(c, bar2), tag + ' chip bajo la barra del arcade').toBe(false);
        for (const e of hudEls) expect(hit(c, e), tag + ' chip sobre el HUD').toBe(false);
      }
      for (const e of hudEls) expect(hit(e, bar2), tag + ' HUD bajo la barra del arcade').toBe(false);
      expect(hit(boss, bar2), tag + ' barra del jefe bajo la barra del arcade').toBe(false);
      for (const e of hudEls) expect(hit(e, boss), tag + ' barra del jefe sobre el HUD').toBe(false);
      const chipFont = await page.evaluate(() => parseFloat(getComputedStyle(/** @type {Element} */ (document.querySelector('.mlm-m'))).fontSize));
      expect(chipFont, tag).toBeGreaterThanOrEqual(12);
    }
    expectNoErrors(errors);
  });

  test('girar el teléfono a mitad de partida conserva el estado y reubica el encuadre', async ({ page }) => {
    const { errors } = await startDbg(page, true);
    await throwFree(page, true);
    const a = await S(page);
    await page.setViewportSize({ width: 839, height: 412 });
    await expect.poll(async () => (await S(page)).layout.W, { timeout: T }).toBe(839);
    const b = await S(page);
    expect(b).toMatchObject({ state: 'playing', score: a.score, stuck: a.stuck, level: a.level, throwsLeft: a.throwsLeft });
    expect(b.layout.KY + 96).toBeLessThanOrEqual(412);
    await throwFree(page, true);
    await page.setViewportSize({ width: 412, height: 839 });
    await expect.poll(async () => (await S(page)).layout.W, { timeout: T }).toBe(412);
    expect((await S(page)).state).toBe('playing');
    expect((await S(page)).canvasW).toBe(Math.round(412 * (await S(page)).dpr));
    expectNoErrors(errors);
  });

  test('menú táctil: elegir dificultad (o errarle por poco) no arranca; el botón principal sí', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado));
    const btn = page.locator('#diffBox button', { hasText: 'Difícil' });
    const bb = /** @type {any} */ (await btn.boundingBox());
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await expect(btn).toHaveAttribute('aria-checked', 'true');
    // toque en la franja del selector, al lado de los botones
    const box = /** @type {any} */ (await page.locator('#diffBox').boundingBox());
    await page.touchscreen.tap(box.x + 4, box.y + box.height / 2);
    await wait(page, 300);
    expect((await S(page)).state).toBe('menu');
    const pb = /** @type {any} */ (await page.locator('#playBtn').boundingBox());
    await page.touchscreen.tap(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await expect.poll(async () => (await S(page)).state, { timeout: T }).toBe('playing');
    expect((await S(page)).difficulty).toBe('dificil');
    await page.evaluate(() => /** @type {any} */ (window).MLMissions.setDifficulty('normal'));
    expectNoErrors(errors);
  });

  test('gestos: sin bloqueo de zoom en el viewport, el lienzo no hace pan/zoom y la calidad automática es media', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__clavado));
    const r = await page.evaluate(() => ({
      meta: document.querySelector('meta[name=viewport]')?.getAttribute('content'),
      ta: getComputedStyle(/** @type {Element} */ (document.getElementById('c'))).touchAction,
    }));
    expect(r.meta).not.toMatch(/user-scalable=no|maximum-scale/);
    expect(r.ta).toBe('none');
    const s = await S(page);
    expect(s.quality).toBe('medium');
    expect(s.dpr).toBeLessThanOrEqual(1.5);
    expectNoErrors(errors);
  });
});
