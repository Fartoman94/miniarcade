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

  test('táctil: deslizar dobla y el botón de nitro responde', async ({ page }, testInfo) => {
    test.skip(!isMobile(testInfo), 'sólo en el proyecto mobile');
    const { errors } = await openGame(page, 'turbo_furia.html');
    await startRun(page, true);
    const vp = page.viewportSize();
    const x0 = (await T(page)).playerX;
    // el dedo se mantiene hasta que el auto llegue (reloj del juego: con WebGL por software puede ir a pocos FPS)
    const x1 = await touchHoldUntil(page, vp.width - 20, vp.height / 2, () => window.__turbo.playerX > -1.75 + 2);
    expect(x1).toBeGreaterThan(x0 + 2);
    const x2 = await touchHoldUntil(page, 20, vp.height / 2, x => window.__turbo.playerX < x - 2, x1);
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
