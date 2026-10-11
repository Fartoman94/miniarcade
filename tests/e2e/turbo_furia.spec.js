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
  await page.waitForFunction(() => window.__turbo.state === 'countdown' || window.__turbo.state === 'playing');
  // la cuenta regresiva corre con tiempo real acotado (no se estira aunque el equipo dibuje a pocos FPS)
  await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
}

/** Toque sostenido hasta que se cumpla la condición (evaluada en la página), devuelve playerX al soltar. */
async function touchHoldUntil(page, x, y, cond, arg) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await page.waitForFunction(cond, arg, { timeout: 60_000 });
  const px = await page.evaluate(() => window.__turbo.playerX);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return px;
}

/** Apoya un dedo, lo desliza dx px en 8 pasos y lo mantiene hasta que se cumpla la condición; devuelve playerX al soltar. */
async function touchDragHoldUntil(page, x, y, dx, cond, arg) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y, id: 1 }] });
  await page.waitForFunction(cond, arg, { timeout: 60_000 });
  const px = await page.evaluate(() => window.__turbo.playerX);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  return px;
}

test.describe('TURBO FURIA', () => {
  // Este equipo tiene joysticks físicos conectados con entradas trabadas (/dev/input/js*): Chromium los ve y el SDK
  // los traduce a teclas. Las pruebas no deben depender del hardware, así que se ocultan los gamepads.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); } catch (e) {} });
  });
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
    await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
    expectNoErrors(errors);
  });

  test('fin de partida, récord persistente y volver a correr con teclado', async ({ page }, testInfo) => {
    const { errors } = await openGame(page, 'turbo_furia.html?test=1');
    await startRun(page, isMobile(testInfo));
    await wait(page, 2500);
    // con WebGL por software el juego puede ir a pocos FPS: esperar a tener puntos por reloj del juego, no por reloj de pared
    await expect.poll(() => page.evaluate(() => window.__turbo.score), { timeout: 60_000 }).toBeGreaterThan(0);
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
    await page.waitForFunction(() => ['countdown', 'playing'].includes(window.__turbo.state));

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

  test('táctil: deslizar dobla (relativo al dedo) y el botón de nitro responde', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'sólo en el proyecto mobile');
    const { errors } = await openGame(page, 'turbo_furia.html');
    await startRun(page, true);
    const vp = page.viewportSize();
    const x0 = (await T(page)).playerX;
    // dirección relativa: apoyar en el centro y deslizar a la derecha; el dedo se mantiene hasta que el auto llegue
    const x1 = await touchDragHoldUntil(page, vp.width / 2, vp.height / 2, 150, () => window.__turbo.playerX > -1.75 + 2);
    expect(x1).toBeGreaterThan(x0 + 2);
    const x2 = await touchDragHoldUntil(page, vp.width / 2, vp.height / 2, -150, x => window.__turbo.playerX < x - 2, x1);
    expect(x2).toBeLessThan(x1 - 2);
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

  /* ================= MiniArcade 3.0 ================= */
  const G = (page, fn, arg) => page.evaluate(fn, arg);
  const POLL = { timeout: 90_000, intervals: [100, 250, 500, 1000] };
  /** Abre con ?test=1, opcionalmente con localStorage precargado, y espera el garaje. */
  async function openTest(page, pre) {
    if (pre) await page.addInitScript(p => { if (!sessionStorage.getItem('tf-pre')) { for (const k in p) localStorage.setItem(k, p[k]); sessionStorage.setItem('tf-pre', '1'); } }, pre);
    const r = await openGame(page, 'turbo_furia.html?test=1');
    await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage', null, { timeout: 60_000 });
    return r;
  }
  /** Larga con Enter y espera el estado 'playing' (la cuenta usa tiempo real acotado). Deja la ruta vacía. */
  async function go(page, clear = true) {
    // Enter sobre un botón enfocado (modo/dificultad) lo activa a él; para largar, el foco vuelve al juego
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
    if (clear) await G(page, () => window.__turbo.clearTraffic());
  }

  test('misiones: principal y secundaria cumplidas, falla por choque y persisten al recargar', async ({ page }) => {
    test.setTimeout(240_000);
    // marcar el resto de las secundarias como hechas: la selección prioriza las nunca cumplidas → «2 km sin chocar» y «latas»
    const others = ['tf_clean', 'tf_near', 'tf_combo', 'tf_rival', 'tf_works', 'tf_nitro', 'tf_record'];
    const { errors } = await openTest(page, { 'ml:missions': JSON.stringify({ turbo_furia: { done: Object.fromEntries(others.map(i => [i, 1])), runs: 0 } }) });
    await expect(page.locator('.mlm-hud')).toBeHidden();
    await go(page);
    const cur = await G(page, () => MLMissions.state().current.map(m => m.id));
    expect(cur).toEqual(['tf_km3', 'tf_nocrash', 'tf_cans']);
    await expect(page.locator('.mlm-hud')).toBeVisible();
    // caso de falla: chocar antes de los 2 km
    expect(await G(page, () => window.__turbo.forceCrash())).toBe(true);
    await expect.poll(() => G(page, () => MLMissions.state().current.find(m => m.id === 'tf_nocrash').status), POLL).toBe('failed');
    // reiniciar desde el menú de pausa: cierra la partida (runEnd) y abre otra (runStart)
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
    await G(page, () => { window.__turbo.clearTraffic(); window.__turbo.setLane(1); });
    expect(await G(page, () => MLMissions.state().current.find(m => m.id === 'tf_nocrash').status)).toBe('active');
    // secundaria: 3 latas de nitro recogidas manejando por su carril
    for (let i = 0; i < 3; i++) {
      await G(page, () => window.__turbo.spawnCan(1, -25));
      await expect.poll(() => G(page, () => window.__turbo.runStats.cans), POLL).toBe(i + 1);
    }
    await expect.poll(() => G(page, () => MLMissions.state().current.find(m => m.id === 'tf_cans').status), POLL).toBe('done');
    // principal (3 km) y «2 km sin chocar»
    await G(page, () => window.__turbo.addDist(3050));
    await expect.poll(() => G(page, () => MLMissions.state().current.filter(m => m.status === 'done').length), POLL).toBe(3);
    await expect(page.locator('.mlm-toast')).toBeAttached();
    await page.reload();
    await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage', null, { timeout: 60_000 });
    const done = await G(page, () => MLMissions.state().achievements.done);
    expect(Object.keys(done)).toEqual(expect.arrayContaining(['tf_km3', 'tf_nocrash', 'tf_cans']));
    expectNoErrors(errors);
  });

  test('dificultad: teclado y toque, persiste y cambia parámetros reales', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const { errors } = await openTest(page);
    expect(await G(page, () => window.__turbo.diff.spawnMul)).toBe(1);   // Normal = balance original
    // teclado: foco en la opción marcada y flecha derecha
    await page.locator('#diffBox [data-d="normal"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#diffBox [data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    expect(await G(page, () => window.__turbo.vehicle)).toBe('rayo');   // las flechas del selector no cambian el vehículo
    expect(await G(page, () => window.__turbo.diff)).toMatchObject({ spawnMul: 0.82, cap: 15, invuln: 1.7 });
    // toque / clic
    if (isMobile(testInfo)) await page.locator('#diffBox [data-d="facil"]').tap();
    else await page.locator('#diffBox [data-d="facil"]').click();
    expect(await G(page, () => window.__turbo.difficulty)).toBe('facil');
    await page.reload();
    await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage', null, { timeout: 60_000 });
    await expect(page.locator('#diffBox [data-d="facil"]')).toHaveAttribute('aria-checked', 'true');
    await go(page);
    // en la carrera se aplica: invulnerabilidad tras choque más larga en Fácil
    await G(page, () => window.__turbo.forceCrash());
    const inv = await G(page, () => window.__turbo.invuln);
    expect(inv).toBeGreaterThan(2.0);
    expect(inv).toBeLessThanOrEqual(2.5);
    expectNoErrors(errors);
  });

  test('calidad: baja / alta cambian costos medibles del render', async ({ page }) => {
    test.setTimeout(120_000);
    const { errors } = await openTest(page);
    await go(page);
    await G(page, () => MLArcade.settings.set('quality', 'low'));
    const lo = await G(page, () => window.__turbo.quality);
    expect(lo).toMatchObject({ q: 'low', particleCap: 36, props: 8, speedLines: 0, shadows: false, phong: 'MeshLambertMaterial' });
    expect(lo.pixelRatio).toBeLessThanOrEqual(1);
    expect(lo.fogFar).toBe(360);
    await G(page, () => MLArcade.settings.set('quality', 'high'));
    const hi = await G(page, () => window.__turbo.quality);
    expect(hi).toMatchObject({ q: 'high', particleCap: 110, props: 24, speedLines: 56, shadows: true, shadowSize: 1024, phong: 'MeshPhongMaterial' });
    expect(hi.pixelRatio).toBeGreaterThanOrEqual(lo.pixelRatio);
    expect(hi.fogFar).toBe(600);
    await G(page, () => MLArcade.settings.set('quality', 'auto'));
    expectNoErrors(errors);
  });

  test('garaje: se dibuja a frecuencia reducida (menú encima) y la carrera en cada cuadro', async ({ page }) => {
    test.setTimeout(120_000);
    const { errors } = await openTest(page);
    // ≤ 30 dibujos por segundo en el garaje (con margen), sea cual sea la frecuencia de la pantalla
    const rate = await page.evaluate(() => new Promise(res => {
      const r0 = window.__turbo.perf.renders, t0 = performance.now();
      setTimeout(() => res((window.__turbo.perf.renders - r0) / ((performance.now() - t0) / 1000)), 3000);
    }));
    expect(rate).toBeGreaterThan(1);
    expect(rate).toBeLessThanOrEqual(33);
    await go(page);
    const r0 = await G(page, () => window.__turbo.perf);
    await expect.poll(() => G(page, () => window.__turbo.perf.frames), POLL).toBeGreaterThan(r0.frames + 20);
    const r1 = await G(page, () => window.__turbo.perf);
    expect(r1.renders - r0.renders).toBe(r1.frames - r0.frames);
    expectNoErrors(errors);
  });

  test('obras: se avisan, chocan en tu carril y suman al esquivarlas', async ({ page }) => {
    test.setTimeout(180_000);
    const { errors } = await openTest(page);
    await go(page);
    await G(page, () => window.__turbo.setLane(1));
    expect(await G(page, () => window.__turbo.spawnWorks(1, -90))).toBe(true);
    await expect(page.locator('#hazard')).toHaveClass(/show/, { timeout: 30_000 });
    await expect.poll(() => G(page, () => window.__turbo.lives), POLL).toBe(2);   // misma hitbox AABB de siempre
    await expect.poll(() => G(page, () => window.__turbo.works.length), POLL).toBe(0);
    await expect.poll(() => G(page, () => window.__turbo.invuln), POLL).toBe(0);
    await G(page, () => window.__turbo.setLane(1));
    await G(page, () => window.__turbo.spawnWorks(3, -70));
    await expect.poll(() => G(page, () => window.__turbo.runStats.works), POLL).toBe(1);
    expect(await G(page, () => window.__turbo.lives)).toBe(2);
    expectNoErrors(errors);
  });

  test('nitro: Shift gasta y acelera, la lata recarga 35', async ({ page }) => {
    test.setTimeout(150_000);
    const { errors } = await openTest(page);
    await go(page);
    await G(page, () => window.__turbo.setLane(1));
    await page.keyboard.down('Shift');
    await expect.poll(() => G(page, () => window.__turbo.nitroActive), POLL).toBe(true);
    await expect(page.locator('#nitroFx')).toHaveClass(/on/);
    await expect.poll(() => G(page, () => window.__turbo.nitro), POLL).toBeLessThan(60);
    const n = await G(page, () => window.__turbo.speed);
    expect(n).toBeGreaterThan(30);
    await page.keyboard.up('Shift');
    await expect(page.locator('#nitroFx')).not.toHaveClass(/on/);
    const before = await G(page, () => window.__turbo.nitro);
    await G(page, () => window.__turbo.spawnCan(1, -25));
    await expect.poll(() => G(page, () => window.__turbo.runStats.cans), POLL).toBe(1);
    expect(await G(page, () => window.__turbo.nitro)).toBeGreaterThanOrEqual(Math.min(100, before + 30));
    expectNoErrors(errors);
  });

  test('rival: aparece, se lo supera y da premio; el tráfico avisa antes de cambiar de carril', async ({ page }) => {
    test.setTimeout(180_000);
    const { errors } = await openTest(page);
    await go(page);
    await G(page, () => window.__turbo.setLane(0));
    expect(await G(page, () => window.__turbo.spawnRival())).toBe(true);
    const r = await G(page, () => window.__turbo.rival);
    expect(r).toMatchObject({ active: true, phase: 'passing' });
    expect(r.z).toBeGreaterThan(0);           // entra desde atrás
    // ponerlo adelante y lento en otro carril: el jugador lo pasa
    const s0 = await G(page, () => window.__turbo.score);
    await G(page, () => window.__turbo.setRival({ phase: 'ahead', z: 2.4, speed: 2, x: 5.25, lane: 3, t: 0 }));
    await expect.poll(() => G(page, () => window.__turbo.rival.phase), POLL).toBe('beaten');
    expect(await G(page, () => window.__turbo.score)).toBeGreaterThanOrEqual(s0 + 400);
    expect(await G(page, () => window.__turbo.lives)).toBe(3);
    // cambio de carril del tráfico con guiño previo
    await G(page, () => window.__turbo.spawnChanger(2, -100));
    await expect.poll(() => G(page, () => window.__turbo.changers), POLL).toBe(1);
    await expect.poll(() => G(page, () => window.__turbo.changers), POLL).toBe(0);
    expectNoErrors(errors);
  });

  test('duelo: ganar desbloquea COHETE 77; perder cuando el rival llega primero', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const { errors } = await openTest(page);
    if (isMobile(testInfo)) await page.locator('#modeRow [data-m="duelo"]').tap();
    else { await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); }
    expect(await G(page, () => window.__turbo.mode)).toBe('duelo');
    await go(page, false);
    expect(await G(page, () => window.__turbo.rival)).toMatchObject({ active: true, phase: 'duel' });
    await expect(page.locator('#duelBar')).toBeVisible();
    await G(page, () => window.__turbo.addDist(3000));
    await expect(page.locator('#over')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#overKicker')).toHaveText('¡GANASTE EL DUELO!');
    await expect(page.locator('#unlockBadge')).toContainText('COHETE 77');
    expect(await G(page, () => window.__turbo.unlocked)).toContain('cohete');
    await page.waitForTimeout(800);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
    await G(page, () => window.__turbo.setRival({ rd: 3001 }));
    await expect(page.locator('#over')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#overKicker')).toContainText('LLEGÓ PRIMERO');
    expectNoErrors(errors);
  });

  test('contrarreloj: el choque resta tiempo (no vidas) y termina al llegar a 0', async ({ page }, testInfo) => {
    test.setTimeout(150_000);
    const { errors } = await openTest(page);
    if (isMobile(testInfo)) await page.locator('#modeRow [data-m="contrarreloj"]').tap();
    else await page.locator('#modeRow [data-m="contrarreloj"]').click();
    await go(page);
    await expect(page.locator('#timeBig')).toBeVisible();
    await expect(page.locator('#hearts')).toBeHidden();
    const t0 = await G(page, () => window.__turbo.timeLeft);
    await G(page, () => window.__turbo.forceCrash());
    const t1 = await G(page, () => window.__turbo.timeLeft);
    expect(t0 - t1).toBeGreaterThanOrEqual(4.9);
    expect(await G(page, () => window.__turbo.lives)).toBe(3);
    expect(await G(page, () => window.__turbo.biome)).toBe('costa');
    await G(page, () => window.__turbo.setTime(0.2));
    await expect(page.locator('#over')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#overKicker')).toHaveText('¡SE ACABÓ EL TIEMPO!');
    expectNoErrors(errors);
  });

  test('garaje: migra el récord viejo, bloqueo/desbloqueo persistente y ranking local', async ({ page }) => {
    test.setTimeout(240_000);
    const { errors } = await openTest(page, { turbo_best: '777' });
    const prog = await G(page, () => window.__turbo.progress);
    expect(prog).toMatchObject({ v: 2, legacyBest: 777, migratedFrom: 'turbo_best' });
    await expect(page.locator('#best')).toHaveText('777');
    // HIPERNOVA X (índice 5) bloqueada: no larga
    await G(page, () => window.__turbo.select(5));
    await expect(page.locator('#goBtn')).toContainText('BLOQUEADO');
    await expect(page.locator('#vLock')).toContainText('8 km');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    expect(await G(page, () => window.__turbo.state)).toBe('garage');
    // correr con RAYO GT y recorrer 8 km → se desbloquea
    await G(page, () => window.__turbo.select(0));
    await go(page);
    await G(page, () => window.__turbo.addDist(8100));
    for (let i = 0; i < 3; i++) { await G(page, () => window.__turbo.forceCrash()); if (i < 2) await expect.poll(() => G(page, () => window.__turbo.invuln), POLL).toBe(0); }
    await expect(page.locator('#over')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#unlockBadge')).toContainText('HIPERNOVA X');
    await expect(page.locator('#overRank')).toContainText('#1 EN TU RANKING LOCAL');
    await page.reload();
    await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage', null, { timeout: 60_000 });
    expect(await G(page, () => window.__turbo.unlocked)).toContain('hipernova');
    await G(page, () => window.__turbo.select(5));
    await expect(page.locator('#goBtn')).toHaveText('¡A LA RUTA!');
    // ranking local (por vehículo / modo / dificultad), nunca "mundial"
    await G(page, () => window.__turbo.select(0));
    await page.keyboard.press('r');
    await expect(page.locator('#rankDlg')).toBeVisible();
    await expect(page.locator('#rkTable td.n').first()).toHaveText('1');
    await expect(page.locator('#rankDlg')).toContainText('No es un ranking mundial');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rankDlg')).toBeHidden();
    expectNoErrors(errors);
  });

  test('biomas día/noche y hitboxes de los modelos', async ({ page }) => {
    test.setTimeout(150_000);
    const { errors } = await openTest(page);
    // los modelos nuevos no exceden la hitbox (sólo las ruedas asoman, igual que antes)
    for (const b of await G(page, () => window.__turbo.modelBounds())) {
      expect(b.bw, b.id).toBeLessThanOrEqual(b.w + 0.3);
      expect(b.bl, b.id).toBeLessThanOrEqual(b.l + 0.45);
      expect(b.bw, b.id).toBeGreaterThan(b.w * 0.6);
    }
    await go(page);
    expect(await G(page, () => [window.__turbo.biome, window.__turbo.night])).toEqual(['desierto', 0]);
    await G(page, () => window.__turbo.addDist(3100));
    await expect.poll(() => G(page, () => window.__turbo.biome), POLL).toBe('costa');
    await G(page, () => window.__turbo.addDist(3000));
    await expect.poll(() => G(page, () => window.__turbo.night), POLL).toBe(1);
    expect(await G(page, () => window.__turbo.biome)).toBe('bosque');
    await expect(page.locator('#biomeTag')).toContainText('NOCHE');
    expectNoErrors(errors);
  });

  for (const vp of [{ n: 'desktop', w: 1280, h: 800 }, { n: 'vertical', w: 412, h: 915 }, { n: 'apaisado', w: 915, h: 412 }]) {
    test(`garaje usable en ${vp.n} ${vp.w}×${vp.h}`, async ({ page }) => {
      const { errors } = await openTest(page);
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const r = s => document.querySelector(s).getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, go: r('#goBtn'), plate: r('.g-plate'), diff: r('#diffBox') };
      });
      expect(m.sw).toBeLessThanOrEqual(vp.w);
      expect(m.plate.right).toBeLessThanOrEqual(vp.w + 1);
      expect(m.go.bottom).toBeLessThanOrEqual(vp.h);
      expect(m.diff.height).toBeGreaterThan(20);
      expectNoErrors(errors);
    });
  }
});

/* ================= Móvil (proyecto 'mobile', Pixel 7 con toque) ================= */
test.describe('TURBO FURIA · móvil', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'sólo en el proyecto mobile');
    await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); } catch (e) {} });
  });
  const SIZES = [[360, 640], [390, 844], [412, 915], [915, 412], [844, 390]];

  /** Cajas de la UI propia + barra del arcade + fichas de misiones (sólo lo visible). */
  const boxes = (page, sels) => page.evaluate(sels => {
    const out = {};
    for (const [k, s] of Object.entries(sels)) {
      out[k] = [...document.querySelectorAll(s)].filter(el => {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      }).map(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, id: el.id || el.className }; });
    }
    return { W: innerWidth, H: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, ...out };
  }, sels);
  const hit = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
  const inside = (a, W, H) => a.x >= -1 && a.y >= -1 && a.r <= W + 1 && a.b <= H + 1;

  for (const [w, h] of SIZES) {
    test(`matriz ${w}×${h}: garaje y carrera sin desbordes ni solapes, objetivos ≥ 44 px y largada sólo con toques`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: w, height: h });
      const { errors } = await openGame(page, 'turbo_furia.html?test=1');
      await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage', null, { timeout: 60_000 });
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await wait(page, 400);
      // ---- garaje ----
      const g = await boxes(page, { bar: '.mla-bar', top: '.g-top > *', arrows: '.g-arrow', plate: '.g-plate', go: '#goBtn', rank: '#rankBtn', btns: '#garage button, .mla-bar button' });
      expect(g.sw).toBeLessThanOrEqual(w);
      expect(g.sh).toBeLessThanOrEqual(h);
      const bar = g.bar[0];
      for (const el of [...g.top, ...g.arrows, ...g.plate]) {
        expect(inside(el, w, h), `${el.id} dentro de ${w}×${h}`).toBe(true);
        expect(hit(el, bar), `${el.id} no pisa la barra del arcade`).toBe(false);
      }
      for (const a of g.arrows) {
        expect(hit(a, g.plate[0]), 'flecha no pisa la ficha').toBe(false);
        for (const t of g.top) expect(hit(a, t), 'flecha no pisa el título').toBe(false);
      }
      for (const t of g.top) expect(hit(t, g.plate[0]), `${t.id} no queda debajo de la ficha`).toBe(false);
      for (const b of g.btns) expect(Math.min(b.w, b.h), `${b.id} ≥ 44 px`).toBeGreaterThanOrEqual(44);
      expect(g.go[0].h).toBeGreaterThanOrEqual(56);
      // el botón principal está a la vista y es lo que recibe el toque en su centro
      const go = g.go[0];
      expect(inside(go, w, h)).toBe(true);
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#goBtn') !== null, [go.x + go.w / 2, go.y + go.h / 2])).toBe(true);
      // ---- carrera, sólo con toques ----
      await page.locator('#goBtn').tap();
      await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
      await page.waitForFunction(() => document.querySelector('.mlm-hud') && !document.querySelector('.mlm-hud').hidden);
      await wait(page, 300);
      const p = await boxes(page, { bar: '.mla-bar', mlm: '.mlm-hud', tl: '.hud-tl', tr: '.hud-tr', speedo: '.speedo', pedals: '.pedal', toolBtns: '.mla-bar button' });
      expect(p.sw).toBeLessThanOrEqual(w);
      const own = [...p.tl, ...p.tr, ...p.speedo, ...p.pedals];
      for (const el of own) {
        expect(inside(el, w, h), `${el.id} dentro`).toBe(true);
        expect(hit(el, p.bar[0]), `${el.id} no pisa la barra`).toBe(false);
        expect(hit(el, p.mlm[0]), `${el.id} no pisa las misiones`).toBe(false);
      }
      for (const a of own) for (const b of own) if (a !== b) expect(hit(a, b), `${a.id} vs ${b.id}`).toBe(false);
      for (const b of [...p.pedals, ...p.toolBtns]) expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(44);
      for (const b of p.pedals) expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(56);
      // acción principal: doblar deslizando + nitro con otro dedo a la vez (multitáctil)
      await page.evaluate(() => { window.__turbo.clearTraffic(); window.__turbo.setLane(1); });
      const nb = p.pedals.find(b => b.id === 'nitroBtn');
      const cdp = await page.context().newCDPSession(page);
      const sx = w / 2, sy = h * 0.55;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 20 * i, y: sy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx + 120, y: sy, id: 1 }, { x: nb.x + nb.w / 2, y: nb.y + nb.h / 2, id: 2 }] });
      await page.waitForFunction(() => window.__turbo.playerX > 0.5 && window.__turbo.nitroActive, null, { timeout: 60_000 });
      await expect(page.locator('#nitroBtn')).toHaveClass(/on/);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await expect(page.locator('#nitroBtn')).not.toHaveClass(/on/);
      expectNoErrors(errors);
    });
  }

  test('gestos: sin user-scalable=no, superficie de juego sin gestos del navegador y un toque quieto no dobla', async ({ page }) => {
    test.setTimeout(120_000);
    const { errors } = await openGame(page, 'turbo_furia.html');
    const meta = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(meta).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe('none');
    await startRun(page, true);
    await page.evaluate(() => window.__turbo.clearTraffic && window.__turbo.clearTraffic());
    const x0 = (await T(page)).playerX;
    // toque sostenido sin deslizar en el borde derecho (antes: el auto saltaba a la posición del dedo)
    const vp = page.viewportSize();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: vp.width - 30, y: vp.height / 2, id: 1 }] });
    await wait(page, 900);
    const x1 = (await T(page)).playerX;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(Math.abs(x1 - x0)).toBeLessThan(0.3);
    // la página no se desplazó ni hizo zoom
    expect(await page.evaluate(() => [scrollX, scrollY, visualViewport ? visualViewport.scale : 1])).toEqual([0, 0, 1]);
    expectNoErrors(errors);
  });

  test('rotación a mitad de carrera: conserva el estado y reencuadra cámara, HUD y garaje', async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = await openGame(page, 'turbo_furia.html?test=1');
    await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage', null, { timeout: 60_000 });
    await page.locator('#goBtn').tap();
    await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
    await page.evaluate(() => window.__turbo.addDist(300));
    const a = await T(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await wait(page, 500);
    const b = await T(page);
    expect(b.state).toBe('playing');
    expect(b.lives).toBe(a.lives);
    expect(b.dist).toBeGreaterThanOrEqual(a.dist);
    const m = await page.evaluate(() => {
      const c = document.getElementById('c'); const r = s => document.querySelector(s).getBoundingClientRect();
      return { cw: c.clientWidth, ch: c.clientHeight, nitro: r('#nitroBtn'), speedo: r('.speedo') };
    });
    expect([m.cw, m.ch]).toEqual([844, 390]);
    expect(m.nitro.right).toBeLessThanOrEqual(844);
    expect(m.speedo.bottom).toBeLessThanOrEqual(m.nitro.top);
    // de vuelta al garaje en apaisado → vertical: las flechas siguen fuera de la ficha
    await page.evaluate(() => { const T = window.__turbo; T.forceCrash(); T.forceCrash(); T.forceCrash(); });
    await page.waitForFunction(() => window.__turbo.state === 'over', null, { timeout: 30_000 });
    await wait(page, 700);
    await page.locator('#garageBtn').tap();
    await page.setViewportSize({ width: 360, height: 640 });
    await wait(page, 400);
    const g = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { prev: r('#prevV'), plate: r('.g-plate') }; });
    expect(g.prev.bottom).toBeLessThanOrEqual(g.plate.top + 1);
    expectNoErrors(errors);
  });

  test('pantalla final y ranking entran en celular; un toque recién aparecida no rearranca', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 640 });
    const { errors } = await openGame(page, 'turbo_furia.html?test=1');
    await page.waitForFunction(() => window.__turbo && window.__turbo.state === 'garage', null, { timeout: 60_000 });
    await page.locator('#rankBtn').tap();
    const rk = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { card: r('.rk-card'), bar: r('.mla-bar'), close: r('#rkClose') }; });
    expect(rk.card.top).toBeGreaterThanOrEqual(rk.bar.bottom);
    expect(rk.card.bottom).toBeLessThanOrEqual(640);
    expect(rk.close.height).toBeGreaterThanOrEqual(44);
    await page.locator('#rkClose').tap();
    await page.locator('#goBtn').tap();
    await page.waitForFunction(() => window.__turbo.state === 'playing', null, { timeout: 60_000 });
    await page.evaluate(() => { const T = window.__turbo; T.forceCrash(); T.forceCrash(); T.forceCrash(); });
    await page.waitForFunction(() => window.__turbo.state === 'over', null, { timeout: 30_000 });
    // un dedo que venía apretando y suelta justo sobre «OTRA VEZ» no debe largar otra carrera
    await page.evaluate(() => document.getElementById('againBtn').click());
    expect((await T(page)).state).toBe('over');
    await wait(page, 700);
    const o = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { again: r('#againBtn'), garage: r('#garageBtn'), sw: document.documentElement.scrollWidth }; });
    expect(o.sw).toBeLessThanOrEqual(360);
    expect(o.again.bottom).toBeLessThanOrEqual(640);
    expect(o.again.height).toBeGreaterThanOrEqual(56);
    await page.locator('#againBtn').tap();
    await page.waitForFunction(() => ['countdown', 'playing'].includes(window.__turbo.state));
    expectNoErrors(errors);
  });

  test('segundo plano: al ocultarse la pestaña se pausa y el loop se detiene', async ({ page }) => {
    test.setTimeout(120_000);
    const { errors } = await openGame(page, 'turbo_furia.html');
    await startRun(page, true);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    expect((await T(page)).paused).toBe(true);
    const d1 = (await T(page)).dist;
    await wait(page, 600);
    expect((await T(page)).dist).toBe(d1);
    expectNoErrors(errors);
  });
});
