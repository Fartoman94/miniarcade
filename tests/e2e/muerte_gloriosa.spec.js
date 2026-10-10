// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'muerte_gloriosa.html';
/** @param {import('@playwright/test').Page} page */
const mg = page => page.evaluate(() => {
  const g = /** @type {any} */ (window).__mg;
  return { state: g.state, lvl: g.lvl, deaths: g.deaths, best: g.best, paused: g.paused, x: g.P.x, y: g.P.y, time: g.time, goal: g.goal };
});

/** Arranca la partida con entrada real (clic/toque en JUGAR). */
async function start(page, isMobile) {
  await expect(page.locator('#playBtn')).toBeVisible();
  if (isMobile) await page.locator('#playBtn').tap(); else await page.locator('#playBtn').click();
  await expect.poll(async () => (await mg(page)).state).toBe('play');
}

/** Deja al personaje justo antes de los pinchos del nivel 1 (x=430): la muerte llega en < 1 s de juego,
 *  también en runners lentos de CI (antes caminaba desde x=120 con un tope de 8 s). */
const nearSpikes = page => page.evaluate(() => { const g = /** @type {any} */ (window).__mg; g.P.x = 360; });

test.describe('MUERTE GLORIOSA', () => {
  test.describe.configure({ timeout: 120_000 });
  // un gamepad real conectado a la máquina de pruebas inyecta teclas (R, Espacio) a través del SDK:
  // las pruebas no deben depender del hardware del host
  test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true }); } catch (e) {} }); });
  test('carga sin errores y el SDK queda inicializado', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.mla-bar')).toHaveCount(1);
    expect(await page.evaluate(() => typeof window.MLArcade?.isPaused)).toBe('function');
    await wait(page, 500);
    expectNoErrors(errors);
  });

  test('jugar: el personaje avanza y el HUD se actualiza', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    const goal0 = await page.textContent('#goalD');
    const a = await mg(page);
    await page.keyboard.down('ArrowRight');
    // headless puede frenar los cuadros bajo carga: se espera el avance en vez de medir 600 ms fijos
    await expect.poll(async () => (await mg(page)).x, { timeout: 10000 }).toBeGreaterThan(a.x + 60);
    await page.keyboard.up('ArrowRight');
    expect(await page.textContent('#goalD')).not.toBe(goal0);
    // salto con Espacio
    await page.keyboard.press('Space');
    await expect.poll(async () => (await mg(page)).y).toBeLessThan(470);
    expect((await sdk(page)).telemetry).toContain('start');
    expectNoErrors(errors);
  });

  test('Esc pausa y congela todo; reanudar continúa', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    await page.keyboard.down('ArrowRight');
    await wait(page, 250);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await mg(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await mg(page);
    expect(b).toEqual(a);
    await page.keyboard.up('ArrowRight');
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    await wait(page, 400);
    const c = await mg(page);
    expect(c.paused).toBe(false);
    expect(c.time).toBeGreaterThan(b.time);
    // la tecla soltada durante la pausa no queda "pegada": el personaje no sigue caminando solo
    const x1 = c.x; await wait(page, 400);
    expect(Math.abs((await mg(page)).x - x1)).toBeLessThan(15);
    expectNoErrors(errors);
  });

  test('reiniciar desde el menú de pausa reinicia la partida', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    // morir una vez en los pinchos del nivel 1
    await nearSpikes(page);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await mg(page)).deaths, { timeout: 30000 }).toBe(1);
    await page.keyboard.up('ArrowRight');
    await expect(page.locator('#card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const s = await mg(page);
    expect(s.state).toBe('play');
    expect(s.deaths).toBe(0);
    expect(s.lvl).toBe(0);
    expect(s.x).toBeLessThan(140);
    await expect(page.locator('#card')).toBeHidden();
    await expect(page.locator('#dN')).toHaveText('0');
    expectNoErrors(errors);
  });

  test('muerte → cartel → tecla nueva reaparece (la repetición no lo saltea)', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    await nearSpikes(page);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await mg(page)).state, { timeout: 30000 }).toBe('card');
    // auto-repetición de la tecla que se venía apretando: no debe descartar el cartel
    await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', repeat: true })));
    await wait(page, 450);
    expect((await mg(page)).state).toBe('card');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('KeyX');
    await expect.poll(async () => (await mg(page)).state).toBe('play');
    expect((await mg(page)).deaths).toBe(1);
    expectNoErrors(errors);
  });

  test('completar los 6 niveles muestra el final y el récord persiste', async ({ page }) => {
    test.setTimeout(300_000); // 6 festejos de 1,6 s de juego: en runners cargados el rAF se frena
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    for (let i = 0; i < 6; i++) {
      await expect.poll(async () => { const s = await mg(page); return s.state === 'play' && s.lvl === i; }, { timeout: 60000 }).toBe(true);
      // atajo de prueba: dejar al personaje en la meta
      await page.evaluate(() => { const g = /** @type {any} */ (window).__mg; g.P.x = g.goal; });
      await expect.poll(async () => (await mg(page)).state).not.toBe('play');
    }
    await expect.poll(async () => (await mg(page)).state, { timeout: 60000 }).toBe('over');
    await expect(page.locator('#over')).toBeVisible();
    await expect(page.locator('#oLvl')).toHaveText('6/6');
    expect((await sdk(page)).telemetry).toContain('end');
    await page.reload();
    await expect(page.locator('#mBest')).toContainText('6/6');
    const st = await page.evaluate(() => ({ legacy: localStorage.getItem('mg_best'), sdk: window.MLArcade.scores.best('muerte_gloriosa') }));
    expect(st).toEqual({ legacy: '6', sdk: 6 });
    expectNoErrors(errors);
  });

  test('récord parcial: botón SEGUIR arranca en el siguiente nivel', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.evaluate(() => localStorage.setItem('mg_best', '2'));
    await page.reload();
    await expect(page.locator('#mBest')).toHaveText('2/6');
    await expect(page.locator('#contBtn')).toBeVisible();
    await page.locator('#contBtn').click();
    await expect.poll(async () => (await mg(page)).lvl).toBe(2);
    await expect(page.locator('#lvlName')).toHaveText('NIVEL 3');
    expectNoErrors(errors);
  });

  test('cambiar a vista de celular no rompe el layout y el piso se ve', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    for (const vp of [{ width: 412, height: 839 }, { width: 863, height: 360 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await wait(page, 200);
      const r = await page.evaluate(() => {
        const v = /** @type {any} */ (window).__mg.view;
        const cv = /** @type {HTMLCanvasElement} */ (document.getElementById('cv'));
        return { groundY: (470 + v.OFFY) * v.VS, h: innerHeight, cssW: cv.clientWidth, w: innerWidth, sw: document.documentElement.scrollWidth, ratio: cv.width / cv.clientWidth };
      });
      expect(r.groundY).toBeLessThan(r.h - 30);
      expect(r.cssW).toBe(r.w);
      expect(r.sw).toBeLessThanOrEqual(r.w);
      expect(r.ratio).toBeLessThanOrEqual(2.01);
    }
    expectNoErrors(errors);
  });

  test('táctil: botones en pantalla, multitáctil y cartel de muerte', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo proyecto mobile');
    const { errors } = await openGame(page, FILE);
    await start(page, true);
    await expect(page.locator('#tcR')).toBeVisible();
    await expect(page.locator('#ctrl')).toBeHidden();
    // saltar tocando el botón
    await page.locator('#tcJ').tap();
    await expect.poll(async () => (await mg(page)).y).toBeLessThan(470);
    await wait(page, 900);
    // mantener ▶ con un dedo y tocar SALTAR con otro: soltar el segundo no frena al primero
    const x0 = (await mg(page)).x;
    await page.dispatchEvent('#tcR', 'pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true });
    await page.dispatchEvent('#tcJ', 'pointerdown', { pointerId: 12, pointerType: 'touch', bubbles: true });
    await page.dispatchEvent('#tcJ', 'pointerup', { pointerId: 12, pointerType: 'touch', bubbles: true });
    await wait(page, 300);
    expect((await mg(page)).x).toBeGreaterThan(x0 + 40);
    // seguir hasta morir y descartar el cartel tocándolo
    await nearSpikes(page);
    await expect.poll(async () => (await mg(page)).state, { timeout: 30000 }).toBe('card');
    await page.dispatchEvent('#tcR', 'pointerup', { pointerId: 11, pointerType: 'touch', bubbles: true });
    await wait(page, 400);
    // el cartel ignora toques antes de 0,3 s de juego: bajo carga se reintenta el toque
    await expect.poll(async () => { await page.locator('#card').tap(); return (await mg(page)).state; }, { timeout: 30000 }).toBe('play');
    await page.screenshot({ path: 'test-results/muerte_gloriosa-mobile.png' });
    expectNoErrors(errors);
  });

  test('silencio: el botón del menú y el del SDK comparten estado', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.locator('#muteBtn').click();
    await expect(page.locator('#muteBtn')).toContainText('NO');
    expect(await page.evaluate(() => window.MLArcade.settings.get('muted'))).toBe(true);
    await page.locator('.mla-bar button[aria-label="Sonido"]').click();
    await expect(page.locator('#muteBtn')).toContainText('SÍ');
    await page.reload();
    await expect(page.locator('#muteBtn')).toContainText('SÍ');
    expectNoErrors(errors);
  });

  /* ---------- personaje Mati Octo (matelabs/characters.js) ---------- */
  /** @param {import('@playwright/test').Page} page */
  const ch = page => page.evaluate(() => {
    const g = /** @type {any} */ (window).__mg;
    return { char: g.char, drawn: g.charDrawn, load: g.charLoad, pose: g.pose, poseState: g.poseState, collider: g.collider, state: g.state };
  });
  const card = (page, id) => page.locator(`#charPick [role="radio"][data-char="${id}"]`);

  test('Mati: el selector se opera con flechas o toque y la elección persiste', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#charPick [role="radiogroup"]')).toBeVisible();
    await expect(card(page, 'clasico')).toHaveAttribute('aria-checked', 'true');
    expect((await ch(page)).char).toBe('clasico');
    if (isMobile) {
      await card(page, 'mati').tap();
    } else {
      await card(page, 'clasico').focus();
      await page.keyboard.press('ArrowRight');
      await expect(card(page, 'mati')).toBeFocused();
    }
    await expect(card(page, 'mati')).toHaveAttribute('aria-checked', 'true');
    // las flechas/toques del selector no arrancan la partida
    expect((await ch(page)).state).toBe('menu');
    await page.reload();
    await expect(card(page, 'mati')).toHaveAttribute('aria-checked', 'true');
    expect((await ch(page)).char).toBe('mati');
    if (!isMobile) {
      await card(page, 'mati').focus();
      await page.keyboard.press('ArrowLeft');
      await expect(card(page, 'clasico')).toHaveAttribute('aria-checked', 'true');
      expect((await ch(page)).char).toBe('clasico');
    }
    expectNoErrors(errors);
  });

  test('Mati: la partida usa sus poses según el estado y el colisionador no cambia', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, !!isMobile);
    const classic = await ch(page);
    expect(classic.drawn).toBe('clasico');
    // volver al menú con otro personaje
    await page.evaluate(() => { localStorage.setItem('ml:character', JSON.stringify({ muerte_gloriosa: 'mati' })); });
    await page.reload();
    await start(page, !!isMobile);
    await expect.poll(async () => (await ch(page)).drawn, { timeout: 15000 }).toBe('mati');
    const m = await ch(page);
    expect(m.collider).toEqual(classic.collider);
    expect(m.collider).toEqual({ w: 26, h: 54 });
    await expect.poll(async () => (await ch(page)).pose, { timeout: 10000 }).toBe('idle');
    // correr: estado lógico 'run' y se ve la pose de correr (alterna con quieto para simular el paso)
    const right = isMobile ? '#tcR' : null;
    if (right) await page.dispatchEvent(right, 'pointerdown', { pointerId: 21, pointerType: 'touch', isPrimary: true, bubbles: true });
    else await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await ch(page)).poseState, { timeout: 10000 }).toBe('run');
    await expect.poll(async () => (await ch(page)).pose, { timeout: 10000 }).toBe('run');
    // saltar: pose de salto en el aire
    await page.evaluate(() => { const g = /** @type {any} */ (window).__mg; g.P.vy = -720; g.P.y = 460; g.P.onGround = false; });
    await expect.poll(async () => (await ch(page)).pose, { timeout: 10000 }).toBe('jump');
    // sigue muriendo en los pinchos del nivel 1 (mismas trampas, mismo colisionador)
    await nearSpikes(page);
    await expect.poll(async () => {
      // un 'blur' suelta las entradas a propósito (bug #9): se vuelve a apretar ▶ en cada sondeo
      if (right) await page.dispatchEvent(right, 'pointerdown', { pointerId: 21, pointerType: 'touch', isPrimary: true, bubbles: true });
      else await page.keyboard.down('ArrowRight');
      return (await mg(page)).deaths;
    }, { timeout: 30000 }).toBeGreaterThanOrEqual(1);
    if (right) await page.dispatchEvent(right, 'pointerup', { pointerId: 21, pointerType: 'touch', bubbles: true });
    else await page.keyboard.up('ArrowRight');
    expectNoErrors(errors);
  });

  test('Mati: si fallan los sprites, se juega con el clásico y se avisa', async ({ page, isMobile }) => {
    await page.route(/matelabs\/characters\//, r => r.abort());
    await page.addInitScript(() => { localStorage.setItem('ml:character', JSON.stringify({ muerte_gloriosa: 'mati' })); });
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#charMsg')).toContainText('clásico');
    await expect(page.locator('#charPick .mlc-err')).toBeVisible();
    await start(page, !!isMobile);
    await expect.poll(async () => (await ch(page)).load, { timeout: 15000 }).toBe('failed');
    const c = await ch(page);
    expect(c.char).toBe('mati');
    expect(c.drawn).toBe('clasico');
    expect(c.pose).toBe('classic');
    const x0 = (await mg(page)).x;
    if (isMobile) await page.dispatchEvent('#tcR', 'pointerdown', { pointerId: 31, pointerType: 'touch', isPrimary: true, bubbles: true });
    else await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await mg(page)).x, { timeout: 10000 }).toBeGreaterThan(x0 + 60);
    if (isMobile) await page.dispatchEvent('#tcR', 'pointerup', { pointerId: 31, pointerType: 'touch', bubbles: true });
    else await page.keyboard.up('ArrowRight');
    // los únicos errores aceptables son los de los recursos abortados a propósito
    expectNoErrors(errors.filter(e => !/Failed to load resource|ERR_FAILED/.test(e)));
    expect(errors.filter(e => e.startsWith('pageerror'))).toEqual([]);
  });

  /* ---------------- MiniArcade 3.0 ---------------- */
  const DBG = FILE + '?debug=1';
  /** @param {import('@playwright/test').Page} page @param {string} body */
  const ev = (page, body, arg) => page.evaluate(new Function('arg', 'const g = window.__mg; ' + body), arg);
  const ms = page => page.evaluate(() => window.MLMissions.state());

  test('misiones: principal + secundaria por juego real con ganchos, persisten tras recargar', async ({ page, isMobile }) => {
    test.setTimeout(240_000);
    const { errors } = await openGame(page, DBG);
    await start(page, !!isMobile);
    let st = await ms(page);
    // partida nueva sin historial: la principal y las 2 primeras secundarias (rotación determinista)
    expect(st.current.map(m => m.id)).toEqual(['p_tres', 's_intocable', 's_pollo']);
    await expect(page.locator('.mlm-hud')).toBeVisible();
    // pollo de oro del nivel 1: está detrás del punto de partida, hay que saltar
    await ev(page, 'g.P.x = 50; g.P.y = 410; g.P.vy = 0; g.P.onGround = false;');
    await expect.poll(async () => (await ms(page)).current.find(m => m.id === 's_pollo').status).toBe('done');
    expect(await ev(page, 'return g.secrets')).toContain('s0');
    // superar 3 niveles sin morir (atajo: dejar al personaje en la meta)
    for (let i = 0; i < 3; i++) {
      await expect.poll(async () => { const s = await mg(page); return s.state === 'play' && s.lvl === i; }, { timeout: 60000 }).toBe(true);
      await ev(page, 'g.P.x = g.goal;');
    }
    await expect.poll(async () => (await ms(page)).current.find(m => m.id === 'p_tres').status, { timeout: 20000 }).toBe('done');
    st = await ms(page);
    expect(st.current.find(m => m.id === 's_intocable').status).toBe('done');
    // también cuenta como "nivel sin morir"
    expect(await ev(page, 'return g.clean')).toEqual([0, 1, 2]);
    await page.reload();
    const ach = await page.evaluate(() => JSON.parse(localStorage.getItem('ml:missions')).muerte_gloriosa.done);
    expect(Object.keys(ach).sort()).toEqual(['p_tres', 's_intocable', 's_pollo']);
    await expect(page.locator('#mSecrets')).toHaveText('1/8');
    await expect(page.locator('#mClean')).toHaveText('3/10');
    expectNoErrors(errors);
  });

  test('misiones: «Intocable» (failOn) falla al morir', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await start(page, !!isMobile);
    await nearSpikes(page);
    await ev(page, 'g.P.vx = 260; g.P.x = 425;');
    await expect.poll(async () => (await mg(page)).deaths, { timeout: 30000 }).toBe(1);
    const st = await ms(page);
    expect(st.current.find(m => m.id === 's_intocable').status).toBe('failed');
    expect(st.current.find(m => m.id === 'p_tres').status).toBe('active');
    expect(await ev(page, 'return g.runKinds')).toEqual(['spikes']);
    expectNoErrors(errors);
  });

  test('dificultad: selector con teclado o toque, persiste y cambia parámetros reales', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    const btn = d => page.locator(`#diffPick [role="radio"][data-d="${d}"]`);
    await expect(btn('normal')).toHaveAttribute('aria-checked', 'true');
    expect(await ev(page, 'return g.diffCfg.anvilG')).toBe(2600); // Normal = balance original
    if (isMobile) await btn('extremo').tap();
    else { await btn('normal').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); }
    await expect(btn('extremo')).toHaveAttribute('aria-checked', 'true');
    expect((await mg(page)).state).toBe('menu'); // elegir no arranca la partida
    await page.reload();
    await expect(btn('extremo')).toHaveAttribute('aria-checked', 'true');
    await start(page, !!isMobile);
    const c = await ev(page, 'return g.diffCfg');
    expect(c).toMatchObject({ anvilG: 3400, crushOpen: 1.3, cps: false });
    // Extremo: sin banderas de control en el Acto 2
    await ev(page, 'g.debug.goto(6);');
    expect(await ev(page, 'return g.cps')).toEqual([]);
    // un yunque cae más rápido que en Normal: medido en tiempo de juego
    await ev(page, 'g.debug.goto(0); g.debug.god(true); g.P.x = 690;');
    await expect.poll(() => ev(page, 'return g.traps[1].falling || g.traps[1].used'), { timeout: 10000 }).toBe(true);
    expectNoErrors(errors);
  });

  test('calidad: baja/media/alta cambian DPR, tope de partículas y capas de parallax', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await start(page, false);
    const read = () => ev(page, 'return { q: g.quality, dpr: g.view.DPR, cap: g.counts.partCap, layers: g.counts.layers, drawn: g.counts.layersDrawn, glow: g.qcfg.glow }');
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    for (const [q, cap, layers] of [['low', 60, 1], ['medium', 180, 2], ['high', 400, 3]]) {
      await page.evaluate(q => window.MLArcade.settings.set('quality', q), q);
      await expect.poll(async () => (await read()).q).toBe(q);
      const r = await read();
      expect(r.cap).toBe(cap);
      expect(r.layers).toBe(layers);
      expect(r.dpr).toBe(Math.min({ low: 1, medium: 1.5, high: 2 }[q], dpr));
      expect(r.glow).toBe(q !== 'low');
      await expect.poll(async () => (await read()).drawn).toBeGreaterThanOrEqual(layers);
    }
    // el tope se respeta: una explosión grande en baja no pasa de 60 partículas
    await page.evaluate(() => window.MLArcade.settings.set('quality', 'low'));
    await nearSpikes(page);
    await ev(page, 'g.P.x = 430;');
    await expect.poll(async () => (await ev(page, 'return g.counts.parts'))).toBeGreaterThan(0);
    expect(await ev(page, 'return g.counts.parts')).toBeLessThanOrEqual(60);
    expectNoErrors(errors);
  });

  /* Cada nivel nuevo se completa con un recorrido guionado (autopiloto de ?debug: mantener ▶, saltar en
     posiciones fijas y esperar a que una prensa/sierra esté segura). Sin morir ni una vez. */
  for (const [lvl, name, diff] of [[6, 'EL PISO ES OPCIONAL', 'normal'], [7, 'LA GRÚA LOCA', 'normal'], [8, 'LA FÁBRICA DE PRENSAS', 'normal'], [9, 'LA APLANADORA', 'normal'], [9, 'LA APLANADORA', 'extremo'], [7, 'LA GRÚA LOCA', 'extremo']]) {
    test(`nivel ${lvl + 1} «${name}» (${diff}) se puede completar sin morir`, async ({ page, isMobile }) => {
      test.setTimeout(260_000);
      test.skip(!!isMobile && diff !== 'normal', 'extremo: sólo escritorio');
      await page.addInitScript(d => localStorage.setItem('ml:difficulty', JSON.stringify({ muerte_gloriosa: d })), diff);
      const { errors } = await openGame(page, DBG);
      await ev(page, 'g.debug.goto(arg); g.debug.speed(4); g.debug.autoplay(true);', lvl);
      await expect.poll(async () => { const s = await mg(page); return s.deaths > 0 ? 'MURIÓ' : (s.lvl !== lvl || s.state === 'win') ? 'ok' : s.state; },
        { timeout: 200000 }).toBe('ok');
      const v = await ev(page, 'return { deaths: g.deaths, visit: g.visit }');
      expect(v.deaths).toBe(0);
      if (lvl === 7 || lvl === 9) expect(v.visit.boss).toBe(true); // jefe ambiental superado
      if (lvl === 6 || lvl === 8) expect(v.visit.secret).toBe(true); // el guion pasa por la ruta del pollo
      expectNoErrors(errors);
    });
  }

  test('acto 2: se desbloquea al terminar el acto 1 y arranca en el nivel 7', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#act2Btn')).toBeHidden();
    await page.evaluate(() => localStorage.setItem('mg_best', '6'));
    await page.reload();
    await expect(page.locator('#act2Btn')).toBeVisible();
    await expect(page.locator('#mBest2')).toHaveText('0/4');
    if (isMobile) await page.locator('#act2Btn').tap(); else await page.locator('#act2Btn').click();
    await expect.poll(async () => (await mg(page)).lvl).toBe(6);
    await expect(page.locator('#lvlName')).toHaveText('NIVEL 7');
    await expect(page.locator('#best')).toHaveText('ACTO 2: 0/4');
    // las misiones del acto 2 suman las de jefe y banderas
    const st = await page.evaluate(() => window.MLMissions.state());
    expect(st.running).toBe(true);
    expectNoErrors(errors);
  });

  test('mecánicas nuevas: pozo, piedra que se rompe, bandera de control y meta que huye', async ({ page }) => {
    test.setTimeout(300_000);
    const { errors } = await openGame(page, DBG);
    await page.locator('#playBtn').click();
    await ev(page, 'g.debug.goto(6); g.debug.speed(3);');
    // pozo: caer = muerte "fall" (antes inalcanzable)
    await ev(page, 'g.P.x = 560; g.P.y = 480; g.P.onGround = false; g.P.sup = null;');
    await expect.poll(async () => (await ev(page, 'return g.state + ":" + g.P.cause'))).toMatch(/^(dying|card):fall$/);
    // piedra rajada: tiembla y se cae a los DF.crumble s de pisarla, y vuelve a aparecer
    await ev(page, 'g.debug.goto(6); g.debug.god(true); const p = g.plats[0]; g.P.x = p.x + 50; g.P.y = p.y - 2; g.P.vy = 10; g.P.onGround = false;');
    await expect.poll(() => ev(page, 'return g.plats[0].trig')).toBe(true);
    await ev(page, 'g.debug.teleport(700);'); // fuera del pozo para seguir mirando la piedra
    await expect.poll(() => ev(page, 'return g.plats[0].fall || g.plats[0].gone')).toBe(true);
    await expect.poll(() => ev(page, 'return g.plats[0].gone === false && g.plats[0].trig === false'), { timeout: 60000 }).toBe(true);
    // bandera de control: al pasarla queda guardada y al morir se vuelve ahí
    await ev(page, 'g.debug.goto(6); g.P.x = 1290;');
    await ev(page, 'g.P.x = 1310;');
    await expect.poll(() => ev(page, 'return g.cpX')).toBe(1300);
    await ev(page, 'g.P.x = 1420; g.P.y = 470;'); // debajo del yunque
    await expect.poll(async () => (await mg(page)).state, { timeout: 60000 }).toBe('card');
    await expect.poll(async () => { await page.keyboard.press('KeyX'); return (await mg(page)).state; }, { timeout: 30000 }).toBe('play');
    expect(Math.round((await mg(page)).x)).toBe(1300);
    // la meta sale corriendo cuando te acercás
    expect(await ev(page, 'return g.goal')).toBe(2700);
    await ev(page, 'g.debug.god(true); g.debug.teleport(2600);');
    await expect.poll(() => ev(page, 'return g.goal'), { timeout: 60000 }).toBe(3250);
    expectNoErrors(errors);
  });

  test('mecánicas nuevas: prensa (aviso + golpe), cinta, plataforma móvil y sierra en riel', async ({ page }) => {
    test.setTimeout(300_000);
    const { errors } = await openGame(page, DBG);
    await page.locator('#playBtn').click();
    await ev(page, 'g.debug.goto(8); g.debug.speed(2);');
    // cinta transportadora: quieto encima, te lleva para atrás
    await ev(page, 'g.debug.teleport(380);');
    await expect.poll(async () => (await mg(page)).x).toBeLessThan(340);
    // plataforma móvil: parado encima, sube y baja con ella
    await ev(page, 'g.debug.god(true); const p = g.plats[0]; g.P.x = p.x + 60; g.P.y = p.y - 1; g.P.vy = 10; g.P.onGround = false;');
    const ys = new Set();
    await expect.poll(async () => { const r = await ev(page, 'return { on: g.P.onGround, y: Math.round(g.P.y), py: Math.round(g.plats[0].y) }'); if (r.on) ys.add(r.y); return r.on && r.y === r.py && ys.size > 3; }, { timeout: 60000 }).toBe(true);
    // prensa: primero avisa (warn) y después baja; si te quedás abajo te aplasta
    await ev(page, 'g.debug.speed(1); g.debug.teleport(600);');
    const c0 = 'g.traps.find(t => t.id === "c0")';
    // esperar a que esté arriba y recién abierta, y pararse debajo
    await expect.poll(() => ev(page, `const t = ${c0}; return t.by <= 211 && !t.warn`), { timeout: 60000, intervals: [30] }).toBe(true);
    await ev(page, 'g.debug.god(false); g.P.inv = 0; g.debug.teleport(735);');
    const seen = { warn: false };
    await expect.poll(async () => { const r = await ev(page, `const t = ${c0}; return { warn: t.warn, st: g.state }`); if (r.warn) seen.warn = true; return r.st; }, { timeout: 60000, intervals: [30] }).not.toBe('play');
    expect(seen.warn).toBe(true);
    expect(await ev(page, 'return g.P.cause')).toBe('crusher');
    // sierra en riel
    await ev(page, 'g.debug.goto(8); g.debug.speed(2); g.debug.teleport(1800);');
    await expect.poll(() => ev(page, 'return g.P.cause + ":" + g.state'), { timeout: 60000 }).toMatch(/^saw:(dying|card)$/);
    expectNoErrors(errors);
  });

  test('jefes ambientales: la grúa apunta, deja caer y se apaga; la aplanadora alcanza al que se queda quieto', async ({ page }) => {
    test.setTimeout(300_000);
    const { errors } = await openGame(page, DBG);
    await page.locator('#playBtn').click();
    await ev(page, 'g.debug.goto(7); g.debug.speed(2); g.debug.teleport(1100);');
    // se activa, marca el objetivo (aviso) y suelta el yunque donde estabas parado
    await expect.poll(() => ev(page, 'return g.boss.on')).toBe(true);
    await expect.poll(() => ev(page, 'return g.boss.st'), { timeout: 60000, intervals: [30] }).toBe('tele');
    const tx = await ev(page, 'return Math.round(g.boss.tx)');
    expect(Math.abs(tx - 1100)).toBeLessThan(5);
    await expect.poll(async () => (await ev(page, 'return g.state + ":" + g.P.cause')), { timeout: 60000 }).toMatch(/^(dying|card):crane$/);
    // apagarla: tocar el botón del final
    await ev(page, 'g.debug.goto(7); g.debug.god(true); g.debug.teleport(2950); g.P.vx = 0;');
    await ev(page, 'g.P.x = 3030;');
    await expect.poll(() => ev(page, 'return g.boss.dead')).toBe(true);
    expect(await ev(page, 'return g.visit.boss')).toBe(true);
    await expect(page.locator('#bossBar')).toBeHidden();
    // aplanadora: si no corrés, te alcanza
    await ev(page, 'g.debug.goto(9); g.debug.god(false); g.debug.speed(3);');
    await expect(page.locator('#bossBar')).toContainText('APLANADORA', { timeout: 60000 });
    await expect.poll(async () => (await ev(page, 'return g.state + ":" + g.P.cause')), { timeout: 90000 }).toMatch(/^(dying|card):roller$/);
    expectNoErrors(errors);
  });
});
