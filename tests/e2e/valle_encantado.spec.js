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

// ---------- Personaje seleccionable: Mati Octo ----------
const pickMati = page => page.addInitScript(() => {
  try { if (!sessionStorage.getItem('pick-once')) { sessionStorage.setItem('pick-once', '1'); localStorage.setItem('ml:character', JSON.stringify({ valle_encantado: 'mati' })); } } catch (e) {}
});
/** Distancia al centro de una casa (colisionador de radio 3) tras meter al jugador adentro. */
async function houseDist(page) {
  await page.evaluate(() => window.__valle.goto(-7.5, -6));
  await until(page, () => { const s = window.__valle.snap(); return Math.hypot(s.px + 8, s.pz + 6) > 2; });
  const s = await snap(page);
  return Math.hypot(s.px + 8, s.pz + 6);
}

test.describe('El Valle Encantado — personaje Mati Octo', () => {
  test('selector: teclado/tap, persiste al recargar y no carga los GLB si no se elige', async ({ page, isMobile }) => {
    const glb = [];
    page.on('request', r => { if (r.url().endsWith('.glb')) glb.push(r.url()); });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const s0 = await snap(page);
    expect([s0.char, s0.charActive, s0.matiState]).toEqual(['clasico', 'clasico', 'off']);
    const cards = page.locator('#charPick [role="radio"]');
    await expect(cards).toHaveCount(2);
    await expect(page.locator('#charPick [role="radiogroup"]')).toBeVisible();
    expect(glb).toEqual([]);

    if (isMobile) {
      await cards.nth(1).scrollIntoViewIfNeeded();
      await cards.nth(1).tap();
    } else {
      await cards.nth(0).focus();
      await page.keyboard.press('ArrowRight');
      await expect(cards.nth(1)).toBeFocused();
    }
    await expect(cards.nth(1)).toHaveAttribute('aria-checked', 'true');
    // las flechas/el toque del selector no llegan al juego (sigue en el menú, sin moverse)
    expect((await snap(page)).state).toBe('menu');
    await expect.poll(async () => (await snap(page)).charActive, { timeout: 40_000 }).toBe('mati');
    expect(glb.length).toBe(3);
    const s1 = await snap(page);
    expect(s1.matiVisible).toBe(true);
    expect(s1.classicVisible).toBe(false);

    await page.reload();
    await ready(page);
    await expect(page.locator('#charPick [data-char="mati"]')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await snap(page)).charActive, { timeout: 40_000 }).toBe('mati');

    // volver al clásico con el teclado (flecha izquierda) también funciona
    if (!isMobile) {
      await page.locator('#charPick [data-char="mati"]').focus();
      await page.keyboard.press('ArrowLeft');
      await expect.poll(async () => (await snap(page)).charActive).toBe('clasico');
      expect((await snap(page)).classicVisible).toBe(true);
    }
    expectNoErrors(errors);
  });

  test('partida con Mati: poses según el estado, golpe, daño y caída; mismo colisionador', async ({ page }) => {
    test.setTimeout(150_000);
    await pickMati(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect.poll(async () => (await snap(page)).charActive, { timeout: 40_000 }).toBe('mati');

    // colisionador y altura: iguales a los del clásico
    const a = await snap(page);
    expect(a.playerR).toBe(0.5);
    expect(a.matiH).toBeCloseTo(a.classicH, 3);
    expect(a.classicH).toBeGreaterThan(2.3);

    await page.locator('#modeExplore').click();
    await until(page, () => window.__valle.snap().state === 'play');
    await expect.poll(async () => (await snap(page)).pose, { timeout: 30_000 }).toBe('idle');

    // moverse → pose de correr; soltar → quieto
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await snap(page)).pose, { timeout: 30_000 }).toBe('run');
    await page.keyboard.up('KeyW');
    await expect.poll(async () => (await snap(page)).pose, { timeout: 30_000 }).toBe('idle');

    // juntar un fragmento → saltito con la pose de salto
    const j0 = (await snap(page)).poseCount.jump;
    const [fx, fz] = await page.evaluate(() => window.__valle.fragPos()[0]);
    await page.evaluate(([x, z]) => window.__valle.goto(x + 0.5, z + 0.5), [fx, fz]);
    await until(page, () => window.__valle.snap().fragsFound === 1);
    await expect.poll(async () => (await snap(page)).poseCount.jump, { timeout: 30_000 }).toBeGreaterThan(j0);
    await expect.poll(async () => (await snap(page)).pose, { timeout: 30_000 }).toBe('idle');

    // el colisionador es el mismo: el jugador queda a 3 + 0,5 del centro de la casa
    const dMati = await houseDist(page);
    expect(dMati).toBeCloseTo(3.5, 2);

    // golpe con el bastón (Espacio) sigue funcionando
    const n = (await snap(page)).attacks;
    await page.keyboard.press('Space');
    await until(page, k => window.__valle.snap().attacks > k, n);

    // Proteger: daño (parpadeo + tinte) y caída al morir
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await until(page, () => window.__valle.snap().state === 'play' && !window.__valle.snap().paused);
    await page.evaluate(() => window.__valle.hurt(1));
    expect((await snap(page)).hearts).toBe(4);
    await page.evaluate(() => window.__valle.hurt(4));
    await until(page, () => ['dying', 'over'].includes(window.__valle.snap().state));
    await until(page, () => window.__valle.snap().state === 'over', undefined, 60_000);
    expect((await snap(page)).charActive).toBe('mati');
    expectNoErrors(errors);
  });

  test('colisionador del clásico igual al de Mati', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.locator('#modeExplore').click();
    await until(page, () => window.__valle.snap().state === 'play');
    expect((await snap(page)).charActive).toBe('clasico');
    expect(await houseDist(page)).toBeCloseTo(3.5, 2);
    expectNoErrors(errors);
  });

  test('si fallan los GLB/WebP se juega con el clásico, con aviso y sin errores', async ({ page, isMobile }) => {
    await page.route(/matelabs\/characters\/.*\.(glb|webp)$/, r => r.abort());
    await pickMati(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect.poll(async () => (await snap(page)).matiState, { timeout: 40_000 }).toBe('failed');
    const s = await snap(page);
    expect([s.char, s.charActive, s.classicVisible, s.matiVisible]).toEqual(['mati', 'clasico', true, false]);
    await expect(page.locator('#charToast')).toContainText('personaje clásico');
    await press(page, '#modeMission', isMobile);
    await until(page, () => window.__valle.snap().state === 'play');
    const t0 = (await snap(page)).playTime;
    await until(page, t => window.__valle.snap().playTime > t + 0.3, t0);
    expect((await snap(page)).charActive).toBe('clasico');
    // los fallos de red de los recursos abortados a propósito no son errores del juego
    expectNoErrors(errors.filter(e => !/ERR_FAILED|Failed to load resource/.test(e)));
  });
});

// ---------- MiniArcade 3.0: misiones, dificultad, calidad, diario, guardianes y Rey ----------
const ms = page => page.evaluate(() => window.MLMissions.state());
const poll = (page, fn, timeout = 45_000, arg = undefined) => expect.poll(() => page.evaluate(fn, arg), { timeout, intervals: [100, 250, 500] });
/** Perfil inicial: misiones con N partidas previas (fija qué secundarias tocan) y dificultad. */
const profile = (page, { runs = 0, diff = null } = {}) => page.addInitScript(([runs, diff]) => {
  try {
    if (sessionStorage.getItem('va3-once')) return;
    sessionStorage.setItem('va3-once', '1');
    localStorage.setItem('ml:missions', JSON.stringify({ valle_encantado: { done: {}, runs } }));
    if (diff) localStorage.setItem('ml:difficulty', JSON.stringify({ valle_encantado: diff }));
  } catch (e) {}
}, [runs, diff]);
async function startExplore(page) {
  await page.locator('#modeExplore').click();
  await until(page, () => window.__valle.snap().state === 'play');
}
/** Entra a la arena de un guardián y espera a que empiece la pelea. */
async function enterArena(page, type) {
  const z = { ogro: [-40, 36], golem: [-44, -30], brujo: [58, 44], rey: [72, -72] }[type];
  await page.evaluate(([x, z]) => window.__valle.goto(x + 3, z + 3), z);
  await poll(page, t => window.__valle.snap().bosses[t].state, 60_000, type).toBe('fight');
}
async function killBoss(page, type) {
  // golpes reales del juego (damageBoss) hasta vaciar la vida; el Rey es inmune un instante al cambiar de fase
  await poll(page, t => { const v = window.__valle; const b = v.snap().bosses[t]; if (b.state === 'fight') v.dmgBoss(t, 4); return v.snap().bosses[t].state; }, 90_000, type).toBe('dead');
}

test.describe('El Valle Encantado — MiniArcade 3.0', () => {
  test('misiones: secundarias y principal cumplidas jugando, persisten al recargar', async ({ page }) => {
    test.setTimeout(150_000);
    await profile(page, { runs: 4 }); // rotación → secundarias "Buen vecino" y "Ojo de explorador"
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await startExplore(page);
    const st = await ms(page);
    expect(st.current.map(m => m.id)).toEqual(['p_guardian', 's_charla', 's_secreto']);
    await expect(page.locator('.mlm-hud')).toBeVisible();
    // tesoro escondido: se recoge caminando hasta él (lógica real de recolección)
    await page.evaluate(() => window.__valle.goto(17.5, -10.5));
    await poll(page, () => window.MLMissions.state().current.find(m => m.id === 's_secreto').status).toBe('done');
    expect((await snap(page)).album).toContain('t_espejo');
    // hablar con 4 habitantes distintos
    for (const i of [0, 1, 2, 3]) {
      await page.evaluate(i => { window.__valle.talkTo(i); window.__valle.finishDlg(); }, i);
    }
    await poll(page, () => window.MLMissions.state().current.find(m => m.id === 's_charla').status).toBe('done');
    // principal: vencer a un guardián (Ogro Jefe)
    await page.evaluate(() => window.__valle.god(true));
    await enterArena(page, 'ogro');
    await killBoss(page, 'ogro');
    await poll(page, () => window.MLMissions.state().current.find(m => m.id === 'p_guardian').status).toBe('done');
    // persistencia: logros y álbum siguen tras recargar
    await page.reload();
    await ready(page);
    const after = await ms(page);
    expect(Object.keys(after.achievements.done)).toEqual(expect.arrayContaining(['p_guardian', 's_charla', 's_secreto']));
    const alb = await page.evaluate(() => JSON.parse(localStorage.getItem('valle_album')).items);
    expect(alb).toMatchObject({ t_espejo: 1, g_ogro: 1 });
    await expect(page.locator('#menuAlbum')).toContainText('ÁLBUM');
    expectNoErrors(errors);
  });

  test('misiones: "Sin un rasguño" falla al recibir daño; Reiniciar abre otra partida', async ({ page }) => {
    await profile(page, { runs: 2 }); // → "Sin un rasguño" y "Luz que cura"
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.locator('#modeMission').click();
    await until(page, () => window.__valle.snap().state === 'play');
    expect((await ms(page)).current.map(m => m.id)).toEqual(['p_guardian', 's_limpio', 's_curas']);
    await page.evaluate(() => window.__valle.hurt(1));
    await poll(page, () => window.MLMissions.state().current.find(m => m.id === 's_limpio').status).toBe('failed');
    await expect(page.locator('.mlm-hud .mlm-m.failed')).toHaveCount(1);
    // reiniciar desde la pausa: runEnd + runStart (la partida nueva vuelve a empezar las misiones)
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await until(page, () => window.__valle.snap().state === 'play' && !window.__valle.snap().paused);
    const s = await ms(page);
    expect(s.running).toBe(true);
    expect(s.current.every(m => m.status === 'active')).toBe(true);
    expect(s.achievements.runs).toBe(4);
    expectNoErrors(errors);
  });

  test('dificultad: selector con teclado/tap, persiste y cambia parámetros reales', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const radios = page.locator('#diffPick [role="radio"]');
    await expect(radios).toHaveCount(4);
    await expect(page.locator('#diffPick [data-d="normal"]')).toHaveAttribute('aria-checked', 'true');
    if (isMobile) {
      await page.locator('#diffPick [data-d="dificil"]').scrollIntoViewIfNeeded();
      await page.locator('#diffPick [data-d="dificil"]').tap();
    } else {
      await page.locator('#diffPick [data-d="normal"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#diffPick [data-d="dificil"]')).toBeFocused();
    }
    await expect(page.locator('#diffPick [data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    expect((await snap(page)).state).toBe('menu'); // la flecha no llega al juego
    await page.reload();
    await ready(page);
    await expect(page.locator('#diffPick [data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('#modeMission').click();
    await until(page, () => window.__valle.snap().state === 'play');
    await page.evaluate(() => window.__valle.skipWait());
    await until(page, () => window.__valle.snap().e0 !== null);
    const s = await snap(page);
    expect(s.difficulty).toBe('dificil');
    expect(s.enemyHp).toEqual([3, 14]);
    expect(s.e0.hp).toBe(3);          // Normal: 2
    expect(s.windUp).toBe(0.4);        // Normal: 0,45 s de aviso
    expect(s.waveSize).toBe(5);        // oleada 1 en Normal: 4 diablillos
    expectNoErrors(errors);
  });

  test('calidad: baja/media/alta cambian costos reales (pixel ratio, sombras, pasto, partículas, niebla)', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const set = q => page.evaluate(q => window.MLArcade.settings.set('quality', q), q);
    await set('low');
    await poll(page, () => window.__valle.snap().quality).toBe('low');
    let s = await snap(page);
    expect([s.grass, s.pCap, s.shadows, s.fogFar, s.camFar]).toEqual([0, 40, false, 150, 420]);
    expect(s.pixelRatio).toBeLessThanOrEqual(1);
    await set('high');
    await poll(page, () => window.__valle.snap().quality).toBe('high');
    s = await snap(page);
    expect([s.grass, s.pCap, s.shadows, s.flowers]).toEqual([1600, 150, true, 320]);
    await set('medium');
    await poll(page, () => window.__valle.snap().quality).toBe('medium');
    s = await snap(page);
    expect([s.grass, s.pCap, s.shadows]).toEqual([700, 120, false]);
    // el botón del menú de pausa también avisa al juego
    await startExplore(page);
    const n = (await snap(page)).qualChanges;
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="quality"]').click();
    await poll(page, k => window.__valle.snap().qualChanges > k ? 'ok' : 'no', 45_000, n).toBe('ok');
    await page.keyboard.press('Escape');
    // con 'low' el tope de partículas (40) se respeta en juego
    await set('low');
    await page.evaluate(() => window.__valle.goto(0, 4));
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await wait(page, 120); }
    expect((await snap(page)).particles).toBeLessThanOrEqual(40);
    expectNoErrors(errors);
  });

  test('diario: Q/📜 abre misiones, mapa y álbum; congela el juego; elegir una misión la sigue', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await startExplore(page);
    await page.evaluate(() => { window.__valle.talkTo(1); window.__valle.finishDlg(); });
    await poll(page, () => window.__valle.snap().quests.lirios.st).toBe('active');
    if (isMobile) await page.locator('#journalBtn').tap(); else await page.keyboard.press('KeyQ');
    await expect(page.locator('#journal')).not.toHaveClass(/hidden/);
    await expect(page.locator('#jQuests [data-q]')).toHaveCount(9);
    const a = await snap(page);
    expect(a.journalOpen).toBe(true);
    await wait(page, 700);
    expect((await snap(page)).playTime).toBe(a.playTime);
    await page.locator('#jQuests [data-q="lirios"]').click();
    await expect(page.locator('#jQuests [data-q="lirios"]')).toHaveClass(/tracked/);
    expect((await snap(page)).tracked).toBe('lirios');
    if (isMobile) await page.locator('#jClose').tap(); else await page.keyboard.press('KeyQ');
    await expect(page.locator('#journal')).toHaveClass(/hidden/);
    await until(page, t => window.__valle.snap().playTime > t, a.playTime);
    await expect(page.locator('#exploreHint')).toContainText('Lirios de luna');
    // la brújula apunta (celeste) al lirio más cercano
    await poll(page, () => { const s = window.__valle.snap(); return s.compass && !s.compassGold; }).toBe(true);
    expectNoErrors(errors);
  });

  test('las 7 misiones de los habitantes se pueden completar (sin bloqueos) y dan su recompensa', async ({ page }) => {
    test.setTimeout(240_000);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    // alcanzabilidad: todos los objetivos quedan al alcance con la colisión real
    const reach = await page.evaluate(() => window.__valle.reach());
    const bad = reach.filter(o => !o.id.startsWith('zone') && o.d > o.r - 0.2);
    expect(bad, JSON.stringify(bad)).toEqual([]);
    await startExplore(page);
    await page.evaluate(() => window.__valle.god(true));
    const quests = [['lirios', 1], ['lena', 2], ['pelota', 3], ['harina', 5], ['notas', 6], ['corderos', 7]];
    for (const [id, npc] of quests) {
      await page.evaluate(i => { window.__valle.talkTo(i); window.__valle.finishDlg(); }, npc);
      await poll(page, id => window.__valle.snap().quests[id].st, 20_000, id).toBe('active').catch(() => {});
      expect((await snap(page)).quests[id].st, id).toBe('active');
      const pts = await page.evaluate(id => window.__valle.pickPos(id), id);
      expect(pts.length).toBeGreaterThan(0);
      for (const [x, z] of pts) {
        const n0 = (await snap(page)).quests[id].n;
        await page.evaluate(([x, z]) => window.__valle.goto(x + 0.4, z + 0.4), [x, z]);
        await poll(page, ([id, n0]) => window.__valle.snap().quests[id].n > n0 || window.__valle.snap().quests[id].st === 'ready', 40_000, [id, n0]).toBe(true).catch(() => {});
        expect(await page.evaluate(([id, n0]) => window.__valle.snap().quests[id].n > n0, [id, n0]), `${id} ${x},${z}`).toBe(true);
      }
      await poll(page, id => window.__valle.snap().quests[id].st, 20_000).toBe('ready').catch(() => {});
      expect((await snap(page)).quests[id].st, id).toBe('ready');
      // las marcas se recalculan a 10 Hz
      await poll(page, i => window.__valle.snap().marks[i], 20_000, npc).toBe('?');
      await page.evaluate(i => { window.__valle.talkTo(i); window.__valle.finishDlg(); }, npc);
      expect((await snap(page)).quests[id].st, id).toBe('done');
    }
    // carrera de Centella: primero se deja apagar (falla → se puede reintentar) y después se gana
    await page.evaluate(() => { window.__valle.talkTo(4); window.__valle.finishDlg(); });
    await poll(page, () => window.__valle.snap().raceOn).toBe(true);
    await page.evaluate(() => window.__valle.skipRace());
    await poll(page, () => { const s = window.__valle.snap(); return [s.raceOn, s.quests.carrera.st, s.quests.carrera.failed]; }).toEqual([false, 'new', true]);
    await poll(page, () => window.__valle.snap().marks[4]).toBe('!');
    await page.evaluate(() => { window.__valle.talkTo(4); window.__valle.finishDlg(); });
    await poll(page, () => window.__valle.snap().raceOn).toBe(true);
    const rings = await page.evaluate(() => window.__valle.pickPos('carrera'));
    expect(rings.length).toBe(6);
    for (let i = 0; i < rings.length; i++) {
      await page.evaluate(([x, z]) => window.__valle.goto(x, z + 0.3), rings[i]);
      await poll(page, i => window.__valle.snap().raceIdx > i || window.__valle.snap().quests.carrera.st === 'ready', 30_000, i).toBe(true).catch(() => {});
    }
    await poll(page, () => window.__valle.snap().quests.carrera.st).toBe('ready');
    await page.evaluate(() => { window.__valle.talkTo(4); window.__valle.finishDlg(); });
    const s = await snap(page);
    expect(s.quests.carrera.st).toBe('done');
    // recompensas reales
    expect(s.playerPower).toBe(1);        // bastón de roble: +1 contra guardianes
    expect(s.invulBonus).toBeGreaterThan(0); // pluma de hada
    expect(s.album).toEqual(expect.arrayContaining(['lirio', 'roble', 'corona_flores', 'pluma', 'rosca', 'melodia', 'lana']));
    // las marcas se actualizan en el cuadro siguiente
    await poll(page, () => window.__valle.snap().marks.slice(1)).toEqual(['', '', '', '', '', '', '']);
    expectNoErrors(errors);
  });

  test('guardianes: aparecen, atacan con aviso, se curan si te alejás y al caer rompen su sello', async ({ page }) => {
    test.setTimeout(240_000);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await startExplore(page);
    await page.evaluate(() => window.__valle.god(true));
    let s = await snap(page);
    expect(Object.values(s.bosses).map(b => b.state)).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(s.barrier).toBeGreaterThan(10);
    for (const t of ['ogro', 'golem', 'brujo']) {
      await enterArena(page, t);
      await expect(page.locator('#bossBar')).toBeVisible();
      // se comporta: lanza un ataque telegrafiado (aro/línea en el suelo o proyectiles)
      await page.evaluate(t => window.__valle.bossTick(t), t);
      await poll(page, t => { const s = window.__valle.snap(); return !!(s.bosses[t].act || s.hazards || s.shots); }, 45_000, t).toBe(true);
      if (t === 'golem') {
        // correa: si te alejás, se cura y vuelve a esperar
        await page.evaluate(() => window.__valle.dmgBoss('golem', 3));
        expect((await snap(page)).bosses.golem.hp).toBeLessThan((await snap(page)).bosses.golem.max);
        await page.evaluate(() => window.__valle.goto(0, 9));
        await poll(page, () => { const b = window.__valle.snap().bosses.golem; return b.state === 'idle' && b.hp === b.max; }).toBe(true);
        await enterArena(page, t);
      }
      const d0 = (await snap(page)).dropN;
      await killBoss(page, t);
      s = await snap(page);
      expect(s.dropN).toBeGreaterThanOrEqual(d0 + 3);  // recompensa: 3 destellos curativos
      expect(s.album).toContain({ ogro: 'g_ogro', golem: 'g_golem', brujo: 'g_brujo' }[t]);
      await page.evaluate(() => window.__valle.goto(0, 9));
    }
    s = await snap(page);
    expect(s.seals).toBe(3);
    expect(s.barrier).toBe(0);
    expectNoErrors(errors);
  });

  test('Rey Sombrío: la barrera bloquea hasta romper los sellos; 3 fases; entregar la misión a Alba', async ({ page }) => {
    test.setTimeout(240_000);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await startExplore(page);
    await page.evaluate(() => { window.__valle.god(true); window.__valle.talkTo(0); window.__valle.finishDlg(); });
    expect((await snap(page)).quests.sombras.st).toBe('active');
    // barrera: caminando hacia el centro desde la entrada, el jugador queda afuera
    await page.evaluate(() => { window.__valle.goto(55, -55); window.__valle.walkTo(72, -72); });
    await poll(page, () => { const s = window.__valle.snap(); return Math.hypot(s.px - 72, s.pz + 72) < 14.2; }, 60_000).toBe(true);
    await wait(page, 800);
    let s = await snap(page);
    expect(Math.hypot(s.px - 72, s.pz + 72)).toBeGreaterThan(13);
    expect(s.bosses.rey.state).toBe('idle');
    await page.evaluate(() => window.__valle.stopWalk());
    for (const t of ['ogro', 'golem', 'brujo']) { await enterArena(page, t); await killBoss(page, t); }
    expect((await snap(page)).barrier).toBe(0);
    // ahora se puede entrar caminando y el Rey despierta
    await page.evaluate(() => { window.__valle.goto(55, -55); window.__valle.walkTo(70, -70); });
    await poll(page, () => window.__valle.snap().bosses.rey.state, 60_000).toBe('fight');
    await page.evaluate(() => window.__valle.stopWalk());
    await expect(page.locator('#bossPh')).toHaveText('FASE 1 / 3');
    const max = (await snap(page)).bosses.rey.max;
    // fase 2 y 3 (inmune un instante en cada cambio)
    await poll(page, m => { const v = window.__valle; if (v.snap().bosses.rey.phase < 2) v.dmgBoss('rey', 2); return v.snap().bosses.rey.phase; }, 60_000, max).toBe(2);
    await expect(page.locator('#bossPh')).toHaveText('FASE 2 / 3');
    await poll(page, () => { const v = window.__valle; if (v.snap().bosses.rey.phase < 3) v.dmgBoss('rey', 2); return v.snap().bosses.rey.phase; }, 60_000).toBe(3);
    await killBoss(page, 'rey');
    await poll(page, () => window.__valle.snap().quests.sombras.st).toBe('ready');
    await poll(page, () => window.__valle.snap().marks[0]).toBe('?');
    expect((await snap(page)).album).toContain('rey');
    await page.evaluate(() => { window.__valle.talkTo(0); window.__valle.finishDlg(); });
    expect((await snap(page)).quests.sombras.st).toBe('done');
    expectNoErrors(errors);
  });

  test('Proteger: cada 5 oleadas llega un jefe; al vencerlo da recompensas', async ({ page }) => {
    test.setTimeout(150_000);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.locator('#modeMission').click();
    await until(page, () => window.__valle.snap().state === 'play');
    await page.evaluate(() => { window.__valle.god(true); window.__valle.setWave(4); window.__valle.skipWait(); });
    await until(page, () => window.__valle.snap().wave === 5);
    await poll(page, () => { const b = window.__valle.snap().bosses.ogro; return b && b.mode === 'mission' && b.state === 'fight'; }, 60_000).toBe(true);
    await expect(page.locator('#foeInfo')).toContainText('JEFE');
    await expect(page.locator('#bossBar')).toBeVisible();
    const hp0 = (await snap(page)).heartHP, d0 = (await snap(page)).dropN;
    await killBoss(page, 'ogro');
    const s = await snap(page);
    expect(s.dropN).toBeGreaterThanOrEqual(d0 + 2);
    expect(s.heartHP).toBeGreaterThanOrEqual(Math.min(100, hp0));
    await expect(page.locator('#bossBar')).toBeHidden();
    expectNoErrors(errors);
  });

  test('Explorar: desmayarse no borra la aventura ("Levantarse" sigue con el progreso)', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await startExplore(page);
    await page.evaluate(() => { window.__valle.talkTo(3); window.__valle.finishDlg(); });
    const [x, z] = await page.evaluate(() => window.__valle.fragPos()[0]);
    await page.evaluate(([x, z]) => window.__valle.goto(x + 0.5, z + 0.5), [x, z]);
    await until(page, () => window.__valle.snap().fragsFound === 1);
    await page.evaluate(() => window.__valle.hurt(5));
    await until(page, () => window.__valle.snap().state === 'over', undefined, 60_000);
    await expect(page.locator('#overKicker')).toHaveText('TE DESMAYASTE');
    await expect(page.locator('#keepBtn')).toHaveText('✨ LEVANTARSE');
    await press(page, '#keepBtn', isMobile);
    await until(page, () => window.__valle.snap().state === 'play');
    const s = await snap(page);
    expect([s.hearts, s.fragsFound, s.quests.pelota.st]).toEqual([5, 1, 'active']);
    expectNoErrors(errors);
  });

  test('HUD nuevo sin solaparse en celular vertical y apaisado', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const vp of [{ width: 412, height: 915 }, { width: 915, height: 412 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await page.locator('#diffPick [data-d="extremo"]').scrollIntoViewIfNeeded();
      await expect(page.locator('#diffPick [data-d="extremo"]')).toBeInViewport();
    }
    await page.setViewportSize({ width: 412, height: 915 });
    await page.locator('#modeExplore').scrollIntoViewIfNeeded();
    await page.locator('#modeExplore').click();
    await until(page, () => window.__valle.snap().state === 'play');
    await page.evaluate(() => { window.__valle.god(true); window.__valle.talkTo(0); window.__valle.finishDlg(); });
    await enterArena(page, 'ogro');
    for (const vp of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
      await page.setViewportSize(vp);
      await wait(page, 400);
      const ids = ['hearts', 'journalBtn', 'fragWrap', 'bossBar'];
      const boxes = await page.evaluate(ids => ids.map(id => document.getElementById(id).getBoundingClientRect().toJSON())
        .concat([document.querySelector('.mla-bar').getBoundingClientRect().toJSON(), document.querySelector('.mlm-hud').getBoundingClientRect().toJSON()]), ids);
      const names = ids.concat(['mla-bar', 'mlm-hud']);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `${vp.width}: ${names[i]} / ${names[j]}`).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expectNoErrors(errors);
  });
});
