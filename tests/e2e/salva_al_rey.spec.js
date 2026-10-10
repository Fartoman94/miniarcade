// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

// WebGL corre por CPU (SwiftShader) en headless: todo lo que depende del tiempo de juego se
// espera con expect.poll y márgenes amplios.
const FILE = 'Salva_al_rey.html?debug=1';
const snap = page => page.evaluate(() => /** @type {any} */ (window).__rey.snap());
const P = { timeout: 30_000 };

async function open(page) {
  const r = await openGame(page, FILE);
  await expect(page.locator('#modeMission')).toBeVisible();
  await page.waitForFunction(() => /** @type {any} */ (window).__rey && /** @type {any} */ (window).MLArcade);
  return r;
}

async function startMission(page, isMobile) {
  if (isMobile) await page.tap('#modeMission'); else await page.click('#modeMission');
  await expect.poll(async () => (await snap(page)).state, P).toBe('play');
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
  await expect.poll(async () => (await snap(page)).playTime, P).toBeGreaterThan(t0 + 0.1);

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
  await expect.poll(async () => (await snap(page)).playTime, P).toBeGreaterThan(b.playTime);
  expect((await snap(page)).playTime - b.playTime).toBeLessThan(1.5);
  expectNoErrors(errors);
});

test('reiniciar desde el menú de pausa resetea la partida', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await page.evaluate(() => /** @type {any} */ (window).__rey.hurt(2));
  await expect.poll(async () => (await snap(page)).playTime, P).toBeGreaterThan(0.3);
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
  await expect.poll(async () => (await snap(page)).atkCd, P).toBeGreaterThan(0);
  await page.tap('#jumpBtn');
  await expect.poll(async () => (await snap(page)).jumpY, P).toBeGreaterThan(0);
  expectNoErrors(errors);
});

test('celular apaisado: los botones de modo entran en pantalla y arrancan la partida', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await page.setViewportSize({ width: 915, height: 412 });
  await expect(page.locator('#modeMission')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#modeExplore')).toBeInViewport({ ratio: 1 });
  if (isMobile) await page.tap('#modeExplore'); else await page.click('#modeExplore');
  await expect.poll(async () => (await snap(page)).state, P).toBe('play');
  expect((await snap(page)).mode).toBe('explorar');
  expectNoErrors(errors);
});

test('menú de modos: «Explorar el Reino del Alba» existe y lleva a reino_alba.html', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  const link = page.locator('#modeRealm');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'reino_alba.html');
  await expect(link).toContainText('Explorar el Reino del Alba');
  if (isMobile) await link.tap(); else await link.click();
  await page.waitForURL(/reino_alba\.html/);
  await expect(page.locator('#ra-menu h1')).toContainText('REINO DEL ALBA', { timeout: 30_000 });
  expectNoErrors(errors);
});

test('modo exploración: "Menú del juego" en la pausa vuelve al menú de modos', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  if (isMobile) await page.tap('#modeExplore'); else await page.click('#modeExplore');
  await expect.poll(async () => (await snap(page)).state, P).toBe('play');
  await page.keyboard.press('Escape');
  await expect(page.locator('.mla-pause')).toBeVisible();
  await page.getByRole('button', { name: '☰ Menú del juego' }).click();
  await expect(page.locator('.mla-pause')).toBeHidden();
  await expect.poll(async () => (await snap(page)).state, P).toBe('menu');
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
  await expect.poll(async () => (await snap(page)).pose, P).toBe('idle');
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
  await expect.poll(async () => (await snap(page)).atkCd, P).toBeGreaterThan(0);
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
  await expect.poll(async () => (await snap(page)).playTime, P).toBeGreaterThan(t0 + 0.2);
  expect((await snap(page)).pose).toBe('caballero');
  // los únicos errores permitidos son los de las descargas que el test abortó a propósito
  expectNoErrors(errors.filter(e => !/Failed to load resource: net::ERR_FAILED/.test(e)));
});

/* ================= MiniArcade 3.0 =================
   Lo que depende del tiempo de juego se avanza con __rey.sim(seg) (debug): corre la lógica real del
   juego paso a paso sin depender de los cuadros, que en headless con SwiftShader pueden frenarse. */
const R = (page, fn, arg) => page.evaluate(fn, arg);
const sim = (page, sec) => R(page, s => /** @type {any} */ (window).__rey.sim(s), sec);
/** avanza de a 0.1 s hasta que se cumpla la condición (expresión sobre el snapshot `s`) */
const simUntil = (page, pred, max = 15) => R(page, ([p, m]) => {
  const r = /** @type {any} */ (window).__rey, f = new Function('s', 'return ' + p);
  for (let t = 0; t < m; t += 0.1) { r.sim(0.1); if (f(r.snap())) return true; }
  return false;
}, [pred, max]);
const mis = page => page.evaluate(() => /** @type {any} */ (window).MLMissions.state());
const misOf = async (page, id) => (await mis(page)).current.find(m => m.id === id);
/** fija qué secundarias tocan (rotación determinista de MLMissions: runs % 7 sobre la lista) */
const presetRuns = (page, runs) => page.addInitScript(r => {
  try { localStorage.setItem('ml:missions', JSON.stringify({ salva_al_rey: { done: {}, runs: r } })); } catch (e) { /* */ }
}, runs);
const clearWaves = async (page, n) => {
  for (let k = 0; k < n; k++) {
    const before = (await snap(page)).waveLog.length;
    await R(page, () => /** @type {any} */ (window).__rey.clearWave());
    expect(await simUntil(page, `s.waveLog.length===${before + 1}`, 3)).toBe(true);
  }
};

test('misiones: la principal "Muralla firme" se cumple en 5 oleadas y queda guardada tras recargar', async ({ page, isMobile }) => {
  test.setTimeout(150_000);
  const { errors } = await open(page);
  await startMission(page, isMobile);
  const st = await mis(page);
  expect(st.running).toBe(true);
  expect(st.current[0]).toMatchObject({ id: 'rey_muralla', kind: 'primary', status: 'active' });
  expect(st.current.length).toBe(3); // principal + 2 secundarias
  await expect(page.locator('.mlm-hud')).toBeVisible();
  await clearWaves(page, 5); // termina cada oleada por la lógica normal (killEnemy → waveClear)
  expect((await misOf(page, 'rey_muralla')).status).toBe('done');
  await expect(page.locator('.mlm-hud [data-m="rey_muralla"]')).toHaveClass(/done/);
  expect((await snap(page)).waveLog.map(w => w.wave)).toEqual([1, 2, 3, 4, 5]);

  await page.reload();
  await page.waitForFunction(() => /** @type {any} */ (window).MLMissions && /** @type {any} */ (window).__rey);
  expect((await mis(page)).achievements.done.rey_muralla).toBeGreaterThanOrEqual(1);
  await startMission(page, isMobile);
  expect((await mis(page)).current[0].id).toBe('rey_salvar'); // ya cumplida: pasa a la siguiente principal
  expectNoErrors(errors);
});

test('misiones: "Frenesí ×4" se cumple y "Intocable" falla al perder un corazón (failOn)', async ({ page, isMobile }) => {
  await presetRuns(page, 4);
  const { errors } = await open(page);
  await startMission(page, isMobile);
  expect((await mis(page)).current.map(m => m.id)).toEqual(['rey_muralla', 'rey_intocable', 'rey_frenesi']);
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.teleport(0, 12); for (let i = 0; i < 4; i++) r.spawnAt('gollum', -3 + i * 2, 4); });
  expect((await snap(page)).enemies).toBe(4);
  await R(page, () => /** @type {any} */ (window).__rey.killAll('gollum'));
  expect((await misOf(page, 'rey_frenesi')).status).toBe('done');
  await expect(page.locator('.mlm-hud [data-m="rey_frenesi"]')).toHaveClass(/done/);
  expect((await misOf(page, 'rey_intocable')).status).toBe('active');
  await R(page, () => /** @type {any} */ (window).__rey.hurt(1));
  expect((await misOf(page, 'rey_intocable')).status).toBe('failed');
  // el cartel final resume las misiones de la partida
  await R(page, () => /** @type {any} */ (window).__rey.hurt(5));
  await sim(page, 1.5);
  await expect(page.locator('#over')).not.toHaveClass(/hidden/, { timeout: 30_000 });
  await expect(page.locator('#overMis .ok')).toContainText('Frenesí');
  await expect(page.locator('#overMis')).toContainText('Intocable');
  expect((await mis(page)).running).toBe(false);
  expectNoErrors(errors);
});

test('madera: tras la oleada aparecen 2 fardos, juntarlos repara el portón +4 y suma a la misión', async ({ page, isMobile }) => {
  await presetRuns(page, 1);
  const { errors } = await open(page);
  await startMission(page, isMobile);
  expect((await mis(page)).current.map(m => m.id)).toContain('rey_madera');
  await R(page, () => /** @type {any} */ (window).__rey.gate(30));
  await clearWaves(page, 1);
  let s = await snap(page);
  expect(s.gateHP).toBe(80); // 70 + reparación de Normal (+10)
  expect(s.woods.length).toBe(2);
  for (let k = 0; k < 2; k++) {
    const w = (await snap(page)).woods[0];
    await R(page, ([x, z]) => /** @type {any} */ (window).__rey.teleport(x, z), [w.x, w.z]);
    expect(await simUntil(page, `s.woods.length===${1 - k}`, 2)).toBe(true);
  }
  s = await snap(page);
  expect(s.gateHP).toBe(88);
  expect((await misOf(page, 'rey_madera')).progress).toBe(2);
  expectNoErrors(errors);
});

test('rescate: en la oleada 2 queda un aldeano afuera; llegar lo salva y si lo atrapan se pierde', async ({ page, isMobile }) => {
  test.setTimeout(120_000);
  const { errors } = await open(page); // sin partidas previas: tocan "Rescatá 2 aldeanos" y "Madera"
  await startMission(page, isMobile);
  expect((await mis(page)).current.map(m => m.id)).toContain('rey_rescate');
  await clearWaves(page, 2);
  let s = await snap(page);
  expect(s.rescue).toMatchObject({ on: true, phase: 'wait', hp: 3 });
  const score0 = s.score;
  await R(page, ([x, z]) => /** @type {any} */ (window).__rey.teleport(x, z), [s.rescue.x, s.rescue.z]);
  expect(await simUntil(page, `s.rescue.phase==='run'`, 1)).toBe(true);
  expect((await snap(page)).score).toBe(score0 + 50);
  expect((await misOf(page, 'rey_rescate')).progress).toBe(1);
  expect(await simUntil(page, `!s.rescue.on`, 10)).toBe(true); // corre al castillo y entra

  // oleada 4: otro aldeano; ahora el héroe está lejos y un gollum lo atrapa
  await clearWaves(page, 2);
  s = await snap(page);
  expect(s.rescue).toMatchObject({ on: true, phase: 'wait' });
  await R(page, ([x, z]) => { const r = /** @type {any} */ (window).__rey; r.teleport(0, -50); r.spawnAt('gollum', x + 3, z); }, [s.rescue.x, s.rescue.z]);
  expect(await simUntil(page, `s.list.some(e=>e.mode==='villager'&&e.threat===2)`, 2)).toBe(true);
  expect(await simUntil(page, `!s.rescue.on`, 15)).toBe(true);
  expect((await snap(page)).rescue.hp).toBe(0);
  expect((await misOf(page, 'rey_rescate')).progress).toBe(1);
  expectNoErrors(errors);
});

test('trasgo arquero: aviso en el piso, flecha real y daño si no te movés; recompensa al vencerlo', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.teleport(0, 10); r.spawnAt('arquero', 0, 19); });
  expect(await simUntil(page, `s.tele>0&&s.list.some(e=>e.type==='arquero'&&e.wind)`, 6)).toBe(true);
  expect((await snap(page)).list[0].mode).toBe('player');
  expect(await simUntil(page, `s.proj.includes('arrow')`, 2)).toBe(true);
  expect(await simUntil(page, `s.hearts<5`, 3)).toBe(true);
  const sc = (await snap(page)).score;
  await R(page, () => /** @type {any} */ (window).__rey.hit('arquero', 2));
  expect((await snap(page)).score).toBe(sc + 20);
  expectNoErrors(errors);
});

test('troll del ariete: ignora al héroe, avisa y embiste el portón (−18); frenarlo antes cuenta para la misión', async ({ page, isMobile }) => {
  await presetRuns(page, 3); // "Frená 2 arietes" + "Intocable"
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.god(true); r.teleport(2, -21); r.spawnAt('zapador', 0, -22); });
  await sim(page, 0.2);
  let z = (await snap(page)).list[0];
  expect(z.mode).toBe('gate'); // el héroe está a <5.5 y aun así va al portón
  expect(z.threat).toBe(1);
  expect(await simUntil(page, `s.list[0].wind`, 6)).toBe(true); // se echa atrás: aviso
  expect((await snap(page)).gateHP).toBe(100);
  expect(await simUntil(page, `s.gateHP===82`, 2)).toBe(true);
  // otro ariete, derrotado lejos del portón antes de golpear
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.killAll(); r.spawnAt('zapador', 20, 30); });
  await R(page, () => /** @type {any} */ (window).__rey.hit('zapador', 7));
  expect((await misOf(page, 'rey_ariete')).progress).toBe(1);
  expectNoErrors(errors);
});

test('chamán: escudo de un golpe a los aliados cercanos', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.teleport(30, 30); r.spawnAt('chaman', 0, -16); r.spawnAt('gollum', 1.5, -23); r.spawnAt('gollum', -1.5, -23); });
  expect(await simUntil(page, `s.list.some(e=>e.type==='gollum'&&e.shield)`, 8)).toBe(true);
  const idx = (await snap(page)).list.filter(e => e.type === 'gollum').findIndex(e => e.shield);
  expect(await R(page, i => /** @type {any} */ (window).__rey.hit('gollum', 1, i), idx)).toBe(2); // el escudo absorbe
  expect(await R(page, i => /** @type {any} */ (window).__rey.hit('gollum', 1, i), idx)).toBe(1); // ya sin escudo
  expectNoErrors(errors);
});

test('jefe Grumak: barra, golpe al piso con aviso, fase 2 con furia y refuerzos, recompensa', async ({ page, isMobile }) => {
  await presetRuns(page, 2); // "Vencé a un jefe" + "Frená 2 arietes"
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.teleport(0, 10); r.spawnAt('grumak', 0, 15); });
  await expect(page.locator('#bossBar')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#bossName')).toContainText('Grumak');
  await expect(page.locator('#bossPhase')).toContainText('FASE 1/2');
  expect(await simUntil(page, `s.boss.act==='slam'&&s.tele>0`, 4)).toBe(true);
  expect((await snap(page)).hearts).toBe(5); // el aviso da tiempo: todavía no pegó
  expect(await simUntil(page, `s.hearts<5`, 2)).toBe(true); // si no saltás ni salís, pega
  await R(page, () => /** @type {any} */ (window).__rey.god(true));
  await R(page, () => /** @type {any} */ (window).__rey.hit('grumak', 31));
  const s = await snap(page);
  expect(s.boss.phase).toBe(2);
  expect(s.list.filter(e => e.type === 'gollum').length).toBe(3); // refuerzos de la furia
  await expect(page.locator('#bossPhase')).toContainText('FASE 2/2');
  await R(page, () => /** @type {any} */ (window).__rey.hit('grumak', 40));
  expect((await snap(page)).score).toBeGreaterThanOrEqual(s.score + 300);
  expect((await misOf(page, 'rey_jefe')).status).toBe('done');
  await expect(page.locator('#bossBar')).toBeHidden({ timeout: 20_000 });
  expect(await simUntil(page, `s.boss===null`, 3)).toBe(true);
  expectNoErrors(errors);
});

test('jefe Morvath: velo invulnerable hasta derrotar a sus espectros, drenaje del portón que 3 golpes interrumpen', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.god(true); r.teleport(0, -12); r.spawnAt('morvath', 0, 0); });
  await expect(page.locator('#bossName')).toContainText('Morvath', { timeout: 20_000 });
  await R(page, () => /** @type {any} */ (window).__rey.hit('morvath', 28));
  let s = await snap(page);
  expect(s.boss).toMatchObject({ phase: 2, inv: true, veil: 4, hp: 52 });
  await R(page, () => /** @type {any} */ (window).__rey.hit('morvath', 5));
  expect((await snap(page)).boss.hp).toBe(52); // velo: no recibe daño
  await expect(page.locator('#bossBar')).toHaveClass(/inv/);
  await R(page, () => /** @type {any} */ (window).__rey.killAll('espectro'));
  expect(await simUntil(page, `!s.boss.inv`, 1)).toBe(true);
  await R(page, () => /** @type {any} */ (window).__rey.hit('morvath', 26));
  expect((await snap(page)).boss.phase).toBe(3);
  expect(await simUntil(page, `s.boss.chan`, 3)).toBe(true);
  expect(await simUntil(page, `s.gateHP<100`, 2)).toBe(true);
  await R(page, () => /** @type {any} */ (window).__rey.hit('morvath', 3));
  s = await snap(page);
  expect(s.boss.chan).toBe(false);
  expect(s.boss.hp).toBe(23);
  expectNoErrors(errors);
});

test('dificultad: selector con teclado y tap en el menú, persiste y cambia parámetros reales', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  const radio = d => page.locator(`#diffPick [data-d="${d}"]`);
  await expect(page.locator('#diffPick [role="radio"]')).toHaveCount(4);
  await expect(radio('normal')).toHaveAttribute('aria-checked', 'true');
  // Normal = balance anterior (oleada 1: 4 gollums)
  expect(await R(page, () => /** @type {any} */ (window).__rey.comp(1))).toMatchObject({ gollum: 4, espectro: 0, ogro: 0 });
  await radio('normal').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio('dificil')).toHaveAttribute('aria-checked', 'true');
  await expect(radio('dificil')).toBeFocused();
  expect((await snap(page)).state).toBe('menu'); // las flechas no llegan al juego
  if (isMobile) await radio('extremo').tap(); else await radio('extremo').click();
  await expect(radio('extremo')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await page.waitForFunction(() => /** @type {any} */ (window).__rey);
  await expect(radio('extremo')).toHaveAttribute('aria-checked', 'true');
  await startMission(page, isMobile);
  const s = await snap(page);
  expect(s.diff).toBe('extremo');
  expect(s.diffCfg).toMatchObject({ rep: 5, heal: false });
  expect(await R(page, () => /** @type {any} */ (window).__rey.comp(1))).toMatchObject({ gollum: 6 });
  await R(page, () => /** @type {any} */ (window).__rey.spawnAt('gollum', 0, 30));
  expect((await snap(page)).list[0]).toMatchObject({ hp: 3, maxHp: 3, speed: 4.125, gdmg: 4.5 });
  expectNoErrors(errors);
});

test('calidad: Baja / Media / Alta cambian sombras, partículas, pasto, polvo, distancia y resolución', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  await startMission(page, isMobile);
  const got = {};
  for (const q of ['low', 'medium', 'high']) {
    await R(page, qq => /** @type {any} */ (window).MLArcade.settings.set('quality', qq), q);
    await expect.poll(async () => (await snap(page)).quality, P).toBe(q);
    const s = await snap(page);
    got[q] = { pcap: s.pcap, sh: s.shadows, on: s.shadowMapOn, grass: s.grass, dust: s.dust, far: s.far, pr: s.pixelRatio, stars: s.stars };
  }
  expect([got.low.pcap, got.medium.pcap, got.high.pcap]).toEqual([40, 90, 150]);
  expect([got.low.sh, got.medium.sh, got.high.sh]).toEqual([0, 0, 1024]);
  expect([got.low.on, got.high.on]).toEqual([false, true]);
  expect(got.low.grass).toBe(0);
  expect(got.medium.grass).toBeGreaterThan(100);
  expect(got.high.grass).toBeGreaterThan(got.medium.grass);
  expect([got.low.dust, got.medium.dust, got.high.dust]).toEqual([0, 70, 110]);
  expect([got.low.far, got.medium.far, got.high.far]).toEqual([450, 700, 900]);
  expect([got.low.stars, got.high.stars]).toEqual([false, true]);
  const dpr = await page.evaluate(() => devicePixelRatio);
  if (dpr > 1) { expect(got.low.pr).toBeLessThan(got.medium.pr); expect(got.medium.pr).toBeLessThan(got.high.pr); }
  else expect(got.low.pr).toBe(1);
  // el tope de partículas se respeta de verdad
  await R(page, () => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.spawn('gollum', 6); r.killAll(); });
  await sim(page, 0.05);
  expect((await snap(page)).particles).toBeLessThanOrEqual(40);
  // también desde el botón del menú de pausa
  await page.keyboard.press('Escape');
  await page.locator('.mla-pause [data-a="quality"]').click();
  await expect(page.locator('.mla-pause [data-a="quality"]')).toContainText('Calidad');
  expectNoErrors(errors);
});

test('oleadas nuevas, instancias y avisos de amenaza: composición, una malla por tipo y flecha 🪵 fuera de cuadro', async ({ page, isMobile }) => {
  const { errors } = await open(page);
  const comp = n => R(page, k => /** @type {any} */ (window).__rey.comp(k), n);
  expect(await comp(4)).toMatchObject({ arquero: 1, zapador: 0, boss: null });
  expect(await comp(5)).toMatchObject({ boss: 'grumak' });
  expect(await comp(6)).toMatchObject({ zapador: 1, arquero: 3 });
  expect(await comp(9)).toMatchObject({ chaman: 1, zapador: 2 });
  expect(await comp(10)).toMatchObject({ boss: 'morvath' });
  await startMission(page, isMobile);
  await R(page, () => { const r = /** @type {any} */ (window).__rey; r.teleport(0, 14); for (let i = 0; i < 5; i++) r.spawnAt('gollum', -4 + i * 2, 6); r.spawnAt('zapador', 45, 20); });
  await sim(page, 0.1);
  expect((await snap(page)).inst.gollum).toBe(5); // 5 gollums = una InstancedMesh por pieza
  await expect.poll(async () => (await snap(page)).arrows, P).toContain('🪵');
  await expect(page.locator('.tarr.on')).toHaveCount(1);
  expectNoErrors(errors);
});
