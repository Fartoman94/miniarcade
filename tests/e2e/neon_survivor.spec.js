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
  await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('play');
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

/* Esta máquina tiene un gamepad físico conectado que reporta A apretado y deriva del stick: el SDK lo
   traduce a Enter/flechas y arranca/mueve la partida solo. Las pruebas se aíslan sin gamepads. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [], configurable: true }); } catch (e) { /* sin API */ } });
});

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
    await expect.poll(async () => (await N(page)).px, { timeout: 20000 }).toBeGreaterThan(p0);
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
    await expect.poll(async () => (await N(page)).time, { timeout: 20000 }).toBeGreaterThan(a.time);
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
    // (se compara contra el tiempo real medido en la página: con la CPU cargada, esperar «1 s» puede durar más)
    const r0 = await page.evaluate(() => ({ g: /** @type {any} */ (window).__neon.time, w: performance.now() }));
    await wait(page, 1000);
    const r1 = await page.evaluate(() => ({ g: /** @type {any} */ (window).__neon.time, w: performance.now() }));
    const dt = r1.g - r0.g, real = (r1.w - r0.w) / 1000;
    expect(dt).toBeGreaterThan(0.1);
    expect(dt).toBeLessThan(real * 1.25 + 0.05); // al doble daría ≈ 2 × real
    expectNoErrors(errors);
  });

  test('subir varios niveles juntos da una mejora por nivel', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await godMode(page);
    // orbe de XP que alcanza para pasar del nivel 1 al 3 (8 + 11 = 19)
    await page.evaluate('orbs.push({ x: player.x, y: player.y, vx: 0, vy: 0, value: 19, r: 5, dead: false })');
    await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('levelup');
    expect((await N(page)).pending).toBe(2);
    await expect(page.locator('#cards .card')).toHaveCount(3);
    await expect(page.locator('#luTitle')).toContainText('2 mejoras');
    await wait(page, 350);
    if (hasTouch) await page.locator('#cards .card').first().tap(); else await page.keyboard.press('1');
    await expect.poll(async () => (await N(page)).pending, { timeout: 20000 }).toBe(1);
    await wait(page, 350);
    if (hasTouch) await page.locator('#cards .card').nth(1).tap();
    else { await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); }
    await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('play');
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
    await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('over');
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
    await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('play');
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
    // con la CPU cargada el evento resize puede tardar: esperar a que el juego lo procese
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__neon.view.SW), { timeout: 15000 }).toBe(360);
    await wait(page, 100);
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
    // px/py son coordenadas del MUNDO: en pantallas chicas la cámara se aleja (mundo ≥ 440 u de lado corto)
    const v = await page.evaluate(() => /** @type {any} */ (window).__neon.view);
    expect(Math.min(v.W, v.H)).toBeGreaterThanOrEqual(439.5);
    expect(m.px).toBeLessThanOrEqual(v.W);
    expect(m.py).toBeLessThanOrEqual(v.H);
    // la barra del SDK queda dentro de la pantalla
    const bar = await page.locator('.mla-bar').boundingBox();
    expect(bar && bar.x + bar.width).toBeLessThanOrEqual(361);
    expectNoErrors(errors);
  });
});

test.describe('Neon Survivor — personaje Mati Octo', () => {
  /** Personaje elegido/activo, pose visible y colisionador, vía el hook de sólo lectura. */
  const C = page => page.evaluate(() => {
    const n = /** @type {any} */ (window).__neon;
    return { wanted: n.charWanted, char: n.char, failed: n.charFailed, pose: n.pose, face: n.face, r: n.r, state: n.state, time: n.time };
  });
  const preselectMati = page => page.addInitScript(() => {
    if (!sessionStorage.getItem('mati-seeded')) { localStorage.setItem('ml:character', JSON.stringify({ neon_survivor: 'mati' })); sessionStorage.setItem('mati-seeded', '1'); }
  });

  test('el selector se ve en el menú, se opera con flechas o toque y la elección persiste', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const group = page.locator('#charPick [role="radiogroup"]');
    await expect(group).toBeVisible();
    const clasico = page.locator('#charPick [data-char="clasico"]'), matiCard = page.locator('#charPick [data-char="mati"]');
    await expect(clasico).toHaveAttribute('aria-checked', 'true'); // el clásico es el predeterminado
    await expect(page.locator('#playBtn')).toBeInViewport();
    if (hasTouch) await matiCard.tap();
    else { await clasico.focus(); await page.keyboard.press('ArrowRight'); await expect(matiCard).toBeFocused(); }
    await expect(matiCard).toHaveAttribute('aria-checked', 'true');
    expect((await N(page)).state).toBe('menu'); // elegir no arranca la partida
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:character') || '{}').neon_survivor)).toBe('mati');
    await page.reload();
    await ready(page);
    await expect(page.locator('#charPick [data-char="mati"]')).toHaveAttribute('aria-checked', 'true');
    expect((await C(page)).wanted).toBe('mati');
    // y se puede volver al clásico
    if (hasTouch) await page.locator('#charPick [data-char="clasico"]').tap();
    else { await page.locator('#charPick [data-char="mati"]').focus(); await page.keyboard.press('ArrowLeft'); }
    await expect(page.locator('#charPick [data-char="clasico"]')).toHaveAttribute('aria-checked', 'true');
    expect((await C(page)).wanted).toBe('clasico');
    expectNoErrors(errors);
  });

  test('partida con Mati: la pose cambia con el estado y el colisionador es el mismo', async ({ page, hasTouch }) => {
    // colisionador del clásico como referencia
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    const rClasico = (await C(page)).r;
    expect((await C(page)).pose).toBe('orb');
    expect(rClasico).toBe(14);
    await page.evaluate(() => localStorage.setItem('ml:character', JSON.stringify({ neon_survivor: 'mati' })));
    await page.reload();
    await start(page, hasTouch);
    await expect.poll(async () => (await C(page)).char, { timeout: 15000 }).toBe('mati');
    await godMode(page);
    const c0 = await C(page);
    expect(c0.r).toBe(rClasico);
    expect(c0.pose).toBe('idle');
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await C(page)).pose, { timeout: 15000 }).toBe('run');
    expect((await C(page)).face).toBe(-1);
    await page.keyboard.up('ArrowLeft');
    await expect.poll(async () => (await C(page)).pose, { timeout: 15000 }).toBe('idle');
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await C(page)).face, { timeout: 15000 }).toBe(1);
    await page.keyboard.up('ArrowRight');
    // subir de nivel → pose de salto breve al volver a jugar
    await page.evaluate('orbs.push({ x: player.x, y: player.y, vx: 0, vy: 0, value: 8, r: 5, dead: false })');
    await expect.poll(async () => (await N(page)).state, { timeout: 15000 }).toBe('levelup');
    expect((await C(page)).pose).toBe('jump');
    await wait(page, 350);
    if (hasTouch) await page.locator('#cards .card').first().tap(); else await page.keyboard.press('1');
    await expect.poll(async () => (await C(page)).pose, { timeout: 15000 }).toBe('idle');
    // el golpe usa el mismo círculo: un enemigo a r + e.r - 2 px lastima, a r + e.r + 2 px no
    const hit = await page.evaluate(`(() => {
      player.invul = 0; player.hp = player.maxHp = 100; const hp0 = player.hp;
      enemies.length = 0;
      enemies.push({ x: player.x + 30, y: player.y, r: 14, hp: 50, maxHp: 50, speed: 0, dmg: 10, xp: 1, score: 10, color: '#f55', tier: 1, id: -2 });
      step(); const far = player.hp;
      enemies[0].x = player.x + 26; step();
      return { hp0, far, near: player.hp };
    })()`);
    expect(hit.far).toBe(hit.hp0);
    expect(hit.near).toBeLessThan(hit.hp0);
    expectNoErrors(errors);
  });

  test('si los sprites de Mati no cargan, se juega con el clásico y se avisa', async ({ page, hasTouch }) => {
    await page.route('**/matelabs/characters/*.webp', r => r.abort());
    await page.route('**/matelabs/characters/*.glb', r => r.abort());
    await preselectMati(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect.poll(async () => (await C(page)).failed, { timeout: 15000 }).toBe(true);
    await expect(page.locator('#charToast')).toBeVisible();
    await expect(page.locator('#charToast')).toContainText('clásico');
    await start(page, hasTouch);
    const c = await C(page);
    expect(c.wanted).toBe('mati');
    expect(c.char).toBe('clasico');
    expect(c.pose).toBe('orb');
    await expect.poll(async () => (await N(page)).time, { timeout: 15000 }).toBeGreaterThan(1);
    // sólo se toleran los avisos de recurso abortado a propósito; nada de errores no capturados
    expectNoErrors(errors.filter(e => !/Failed to load resource|ERR_FAILED/.test(e)));
    expect(errors.filter(e => e.startsWith('pageerror'))).toEqual([]);
  });
});

/* ======================= MiniArcade 3.0 ======================= */
const DBG = FILE + '?debug';
/** Estado de misiones del SDK compartido. */
const MS = page => page.evaluate(() => /** @type {any} */ (window).MLMissions.state());
const H = (page, expr) => page.evaluate(expr);
/** Arranca en modo depuración, sin enemigos automáticos ni disparo (para aislar cada mecánica). */
async function startCalm(page, hasTouch, { gun = false } = {}) {
  await start(page, hasTouch);
  await H(page, `__neon.dbg.god(); __neon.dbg.calm(); ${gun ? '' : 'player.range = 0;'}`);
}
const enemy = (page, id) => page.evaluate(i => /** @type {any} */ (window).__neon.enemyList.find(e => e.id === i) || null, id);

test.describe('Neon Survivor — MiniArcade 3.0', () => {
  test.describe.configure({ timeout: 120000 }); // CPU compartida: algunas pruebas encadenan varias esperas
  test('misiones: principal (Coloso) y secundaria (élites) se cumplen, persisten y se ven en el HUD', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await start(page, hasTouch);
    const s0 = await MS(page);
    expect(s0.running).toBe(true);
    expect(s0.current.map(m => m.id)).toEqual(['coloso', 'elites', 'oleada5']); // datos limpios: orden determinista
    await expect(page.locator('.mlm-hud.bl')).toBeVisible();
    await expect(page.locator('.mlm-hud .mlm-m')).toHaveCount(3);
    await H(page, '__neon.dbg.god(); __neon.dbg.calm(); player.range = 0;');
    // secundaria: 2 élites (con corona) muertos
    const ids = await H(page, '[__neon.dbg.spawn("grunt", 200, 200, true), __neon.dbg.spawn("tank", 900, 200, true)]');
    for (const id of ids) expect((await enemy(page, id)).elite).toBe(true);
    await H(page, `${JSON.stringify(ids)}.forEach(i => __neon.dbg.hurtEnemy(i, 1e6))`);
    await expect.poll(async () => (await MS(page)).current.find(m => m.id === 'elites').status, { timeout: 20000 }).toBe('done');
    expect(await H(page, '__neon.eliteKills')).toBe(2);
    // las élites sueltan núcleo + corazón
    expect(await H(page, '__neon.pickups.filter(k => k === "chest").length')).toBe(2);
    // principal: Coloso derrotado
    await H(page, '__neon.dbg.boss(1000, 300); __neon.dbg.setBossHp(0.0001)');
    await H(page, 'enemies.find(e => e.kind === "boss").hp = 0');
    await expect.poll(async () => (await MS(page)).current.find(m => m.id === 'coloso').status, { timeout: 20000 }).toBe('done');
    expect(await H(page, '__neon.bossKills')).toBe(1);
    await expect(page.locator('.mlm-hud .mlm-m.done')).toHaveCount(2);
    // persisten tras recargar
    await page.reload();
    await ready(page);
    const ach = (await MS(page)).achievements.done;
    expect(ach.coloso).toBeGreaterThanOrEqual(1);
    expect(ach.elites).toBeGreaterThanOrEqual(1);
    // la próxima partida ofrece la otra principal (la del Coloso ya está cumplida)
    await start(page, hasTouch);
    expect((await MS(page)).current[0].id).toBe('aguante');
    expectNoErrors(errors);
  });

  test('misión «Primer minuto sin daño»: falla al recibir un golpe y se cumple si llegás intacto', async ({ page, hasTouch }) => {
    // las 3 primeras secundarias ya cumplidas → esta partida trae «intacto» y «botin»
    await page.addInitScript(() => { if (!sessionStorage.getItem('m-seeded')) { localStorage.setItem('ml:missions', JSON.stringify({ neon_survivor: { done: { elites: 1, oleada5: 1, masacre: 1 }, runs: 0 } })); sessionStorage.setItem('m-seeded', '1'); } });
    const { errors } = await openGame(page, DBG);
    await startCalm(page, hasTouch);
    expect((await MS(page)).current.map(m => m.id)).toEqual(['coloso', 'intacto', 'botin']);
    // un enemigo encima → golpe → la misión falla (failOn: 'hurt')
    await H(page, 'player.invul = 0; __neon.dbg.spawn("grunt", player.x, player.y)');
    await expect.poll(async () => (await MS(page)).current.find(m => m.id === 'intacto').status, { timeout: 20000 }).toBe('failed');
    await expect(page.locator('.mlm-hud .mlm-m.failed')).toHaveCount(1);
    // «botin»: 3 objetos especiales juntados (y cada uno hace lo suyo)
    await H(page, '__neon.dbg.calm(); player.hp = 50; player.maxHp = 100;');
    await H(page, '__neon.dbg.pickup("heart", player.x, player.y)');
    await expect.poll(() => H(page, '__neon.hp'), { timeout: 20000 }).toBe(75);
    await H(page, 'orbs.push({ x: 10, y: 10, vx: 0, vy: 0, value: 1, r: 5, dead: false }); __neon.dbg.pickup("magnet", player.x, player.y)');
    await expect.poll(() => H(page, '__neon.orbs'), { timeout: 20000 }).toBe(0); // el imán absorbe todo el XP de la pantalla
    const tank = await H(page, '__neon.dbg.spawn("tank", player.x + 200, player.y)');
    await H(page, `enemies.find(e => e.id === ${tank}).speed = 0; __neon.dbg.pickup("bomb", player.x, player.y)`);
    await expect.poll(async () => { const e = await enemy(page, tank); return e ? e.hp < e.maxHp : true; }, { timeout: 20000 }).toBe(true);
    await expect.poll(async () => (await MS(page)).current.find(m => m.id === 'botin').status, { timeout: 20000 }).toBe('done');
    // otra partida (Reiniciar del menú de pausa): sin golpes hasta el 1:00 → «intacto» cumplida
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    await H(page, '__neon.dbg.god(); __neon.dbg.calm(); __neon.dbg.setTime(59.5)');
    // rotación determinista: «intacto» sigue sin cumplir → vuelve a salir
    expect((await MS(page)).current.map(m => m.id)).toContain('intacto');
    await expect.poll(async () => (await MS(page)).current.find(m => m.id === 'intacto').status, { timeout: 20000 }).toBe('done');
    expectNoErrors(errors);
  });

  test('dificultad: selector en el menú (teclado o toque), persiste y cambia la vida real de los enemigos', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    const pick = page.locator('#diffPick [role="radiogroup"]');
    await expect(pick).toBeVisible();
    await expect(page.locator('#playBtn')).toBeInViewport();
    const normal = page.locator('#diffPick [data-d="normal"]');
    await expect(normal).toHaveAttribute('aria-checked', 'true');
    if (hasTouch) await page.locator('#diffPick [data-d="dificil"]').tap();
    else { await normal.focus(); await page.keyboard.press('ArrowRight'); }
    await expect(page.locator('#diffPick [data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#diffInfo')).toContainText('Más vida');
    expect((await N(page)).state).toBe('menu'); // elegir no arranca
    await page.reload();
    await ready(page);
    await expect(page.locator('#diffPick [data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    await startCalm(page, hasTouch);
    expect(await H(page, '__neon.difficulty')).toBe('dificil');
    const { id, d } = await H(page, '(() => ({ id: __neon.dbg.spawn("grunt", 50, 50), d: difficulty }))()');
    // Normal: 10 + d·2 (fórmula original); Difícil ×1,3
    expect((await enemy(page, id)).maxHp).toBeCloseTo((10 + d * 2) * 1.3, 5);
    expect((await enemy(page, id)).dmg).toBeCloseTo(12.5, 5);
    // Extremo: Coloso cada 90 s (se elige entre partidas; acá se simula el «jugar de nuevo»)
    await page.evaluate(() => /** @type {any} */ (window).MLMissions.setDifficulty('extremo'));
    await H(page, 'startGame()');
    expect(await H(page, '__neon.nextBoss')).toBe(90);
    expect(await H(page, '__neon.diff.spawn')).toBe(0.65);
    expectNoErrors(errors);
  });

  test('calidad: baja/media/alta cambian DPR, tope de partículas, capas y sombras', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    const Qs = () => H(page, '({ q: __neon.quality, dpr: __neon.dpr, cap: __neon.partCap, layers: __neon.layers, shadows: __neon.shadows, cw: document.getElementById("game").width, w: innerWidth })');
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    let q = await Qs();
    expect(q).toMatchObject({ q: 'low', dpr: 1, cap: 140, layers: 1, shadows: false });
    expect(q.cw).toBe(q.w);
    // el tope se respeta aunque se pidan muchas partículas
    await H(page, 'addParticles(100, 100, "#f55", 500, 4)');
    expect(await H(page, '__neon.particles')).toBeLessThanOrEqual(140);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    q = await Qs();
    expect(q).toMatchObject({ q: 'high', cap: 420, layers: 3, shadows: true });
    const dpr = await page.evaluate(() => devicePixelRatio);
    expect(q.dpr).toBe(Math.min(2, dpr));
    // desde el botón real del menú de pausa: alta → automática → baja
    await page.keyboard.press('Escape');
    const qb = page.locator('.mla-pause [data-a="quality"]');
    await expect(qb).toBeVisible();
    await qb.click(); await qb.click();
    await expect(qb).toContainText('Baja');
    expect((await Qs()).cap).toBe(140);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await N(page)).time, { timeout: 15000 }).toBeGreaterThan(0.5);
    expectNoErrors(errors);
  });

  test('Embestidor: avisa con carril, embiste en línea recta, muere y suma', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await startCalm(page, hasTouch);
    // simulación paso a paso (determinista, sin depender de la carga de la CPU)
    const r = await H(page, `(() => {
      stopLoop(); player.x = W / 2; player.y = H / 2;
      const id = __neon.dbg.spawn('dasher', player.x - 150, player.y);
      const e = enemies.find(q => q.id === id); e.cd = 0;
      let n = 0; while (e.st !== 1 && n++ < 600) step();
      const aimX = e.x; let aimSteps = 0;
      while (e.st === 1 && aimSteps < 600) { step(); aimSteps++; }
      const moved = e.x - aimX; // durante el aviso no se mueve
      let dashSteps = 0; const x0 = e.x;
      while (e.st === 2 && dashSteps < 600) { step(); dashSteps++; }
      return { id, aimSteps, stillDuringAim: Math.abs(moved) < 0.001, dashDist: e.x - x0, st: e.st, ax: e.ax, ay: e.ay };
    })()`);
    expect(r.aimSteps).toBeGreaterThanOrEqual(36);      // ≥ 0,6 s de aviso (carril rojo)
    expect(r.stillDuringAim).toBe(true);
    expect(r.ax).toBeCloseTo(1, 3); expect(Math.abs(r.ay)).toBeLessThan(.01); // apuntó hacia el jugador
    expect(r.dashDist).toBeGreaterThan(150);             // embestida recta y larga
    expect(r.st).toBe(3);                                // después se recupera lento
    await H(page, 'startLoop()');
    const s0 = (await N(page)).score;
    await H(page, `__neon.dbg.hurtEnemy(${r.id}, 1e6)`);
    await expect.poll(async () => (await N(page)).score, { timeout: 20000 }).toBe(s0 + 30);
    expect(await H(page, '__neon.kills')).toBe(1);
    // suelta 3 de XP (puede que el jugador ya lo haya absorbido si murió cerca)
    expect(await H(page, 'orbs.reduce((a, o) => a + o.value, 0) + player.xp')).toBeGreaterThanOrEqual(3);
    expectNoErrors(errors);
  });

  test('Espectro: esquiva balas, carga y dispara, y sus disparos lastiman', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await startCalm(page, hasTouch, { gun: true });
    await H(page, 'player.hp = player.maxHp = 1000; player.x = W / 2; player.y = H / 2;');
    // vida enorme sólo para la prueba: si no, las balas lo matan antes de verlo disparar
    const id = await H(page, '(() => { const i = __neon.dbg.spawn("ghost", W / 2 + 160, H / 2); const g = enemies.find(e => e.id === i); g.hp = g.maxHp = 1e6; return i; })()');
    await expect.poll(() => H(page, '__neon.dodges'), { timeout: 30000 }).toBeGreaterThan(0);
    // sin balas del jugador, el espectro carga (núcleo rojo creciente) y dispara apuntado
    await H(page, `player.range = 0; enemies.find(e => e.id === ${id}).sc = 0`);
    await expect.poll(() => H(page, '__neon.shots'), { timeout: 30000 }).toBeGreaterThan(0);
    // un disparo encima del jugador lo lastima (y respeta la invulnerabilidad)
    await H(page, '__neon.dbg.calm(); player.invul = 0; fireShot(player.x + 30, player.y, Math.PI, 3, 8, 5)');
    await expect.poll(() => H(page, '__neon.hp'), { timeout: 20000 }).toBe(992);
    const e = await enemy(page, id);
    expect(e).toBeNull(); // calm() recicló al espectro
    expectNoErrors(errors);
  });

  test('Nido: invoca larvas con aviso y al morir cuenta para la misión', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await startCalm(page, hasTouch);
    const id = await H(page, '__neon.dbg.spawn("summoner", W / 2 + 250, H / 2)');
    // paso a paso (determinista): marcas verdes quieto ≥ 0,6 s → 3 larvas
    const r = await H(page, `(() => {
      stopLoop(); const e = enemies.find(q => q.id === ${id}); step(); e.sc = 0;
      let n = 0; while (e.st !== 1 && n++ < 600) step();
      const x0 = e.x; let warnSteps = 0;
      while (e.st === 1 && warnSteps < 600) { step(); warnSteps++; }
      const larvas = enemies.filter(q => q.kind === 'larva').length;
      startLoop();
      return { warnSteps, still: Math.abs(e.x - x0) < 0.001, larvas };
    })()`);
    expect(r.warnSteps).toBeGreaterThanOrEqual(36);
    expect(r.still).toBe(true);
    expect(r.larvas).toBe(3);
    await H(page, `__neon.dbg.hurtEnemy(${id}, 1e6)`);
    await expect.poll(() => H(page, '__neon.summonerKills'), { timeout: 20000 }).toBe(1);
    expectNoErrors(errors);
  });

  test('Coloso: barra, 3 fases, ataques avisados, sin invulnerabilidad y recompensa', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await startCalm(page, hasTouch);
    await H(page, 'player.x = W / 2; player.y = H / 2; __neon.dbg.boss(W / 2 + 200, H / 2)');
    expect((await H(page, '__neon.boss')).phase).toBe(1);
    // F1: pisotón = aviso circular en el piso ANTES del golpe
    await H(page, 'enemies.find(e => e.kind === "boss").cd = 0');
    await expect.poll(() => H(page, '__neon.warns.filter(w => w.type === "slam").length'), { timeout: 20000 }).toBeGreaterThan(0);
    const w = (await H(page, '__neon.warns'))[0];
    expect(w.dur).toBeGreaterThanOrEqual(600); // nunca menos de 0,6 s para salir del círculo
    expect(w.r).toBe(95);
    // F2 al bajar del 60%: aturdido pero recibe daño igual
    await H(page, '__neon.dbg.setBossHp(0.55)');
    await expect.poll(async () => (await H(page, '__neon.boss')).phase, { timeout: 20000 }).toBe(2);
    const hit = await H(page, `(() => { const b = enemies.find(e => e.kind === 'boss'); b.st = 'stagger'; b.t = 900; const hp0 = b.hp;
      const bl = bulletPool.get(); bl.x = b.x; bl.y = b.y; bl.vx = 0; bl.vy = 0; bl.dmg = 10; bl.life = 60; bl.pierce = 0; bl.crit = false; bl.color = '#0ff'; bl.hits.length = 0; bullets.push(bl);
      step(); return { hp0, hp1: b.hp, st: b.st }; })()`);
    expect(hit.st).toBe('stagger');
    expect(hit.hp1).toBe(hit.hp0 - 10);
    // F2 usa ráfaga y embestida (con aviso): forzar el ciclo
    const br = await H(page, `(() => {
      stopLoop(); const b = enemies.find(e => e.kind === 'boss'); b.st = 'walk'; b.cd = 0; b.atk = 1;
      const s0 = shots.length; step();
      let warnSteps = 0; while (b.st === 'burst' && warnSteps < 600) { step(); warnSteps++; }
      const fired = shots.length - s0; startLoop();
      return { warnSteps, fired };
    })()`);
    expect(br.warnSteps).toBeGreaterThanOrEqual(36); // rayos de aviso ≥ 0,6 s antes de la ráfaga
    expect(br.fired).toBeGreaterThanOrEqual(12);     // 14 disparos (alguno puede pegarle al jugador en el mismo paso)
    // F3 al bajar del 30%: llama larvas (aparecen marcadas antes)
    await H(page, '__neon.dbg.setBossHp(0.25)');
    await expect.poll(async () => (await H(page, '__neon.boss')).phase, { timeout: 20000 }).toBe(3);
    await expect.poll(() => H(page, '__neon.warns.filter(w => w.type === "spawn" && w.kind === "larva").length + __neon.kinds.larva'), { timeout: 20000 }).toBeGreaterThanOrEqual(4);
    // recompensa (lejos del jugador, para que el imán no junte el botín antes de mirarlo)
    await H(page, 'const b3 = enemies.find(e => e.kind === "boss"); b3.x = player.x + 300; b3.y = player.y;');
    const s0 = (await N(page)).score;
    await H(page, 'enemies.find(e => e.kind === "boss").hp = 0');
    await expect.poll(() => H(page, '__neon.bossKills'), { timeout: 20000 }).toBe(1);
    expect((await N(page)).score).toBeGreaterThanOrEqual(s0 + 500);
    expect(await H(page, '__neon.pickups')).toEqual(expect.arrayContaining(['chest', 'magnet']));
    expect(await H(page, '__neon.boss')).toBeNull();
    // el núcleo da una mejora gratis
    await H(page, 'pickups.forEach(k => { if (k.kind === "chest") { k.x = player.x; k.y = player.y; } })');
    await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('levelup');
    expectNoErrors(errors);
  });

  test('armas nuevas: Orbitales, Pulso y Rayo dañan; al nivel 4 se ofrece la evolución', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await startCalm(page, hasTouch);
    await H(page, 'player.x = W / 2; player.y = H / 2;');
    const dummy = async (dx, dy) => { const id = await H(page, `__neon.dbg.spawn("tank", player.x + ${dx}, player.y + ${dy})`); await H(page, `enemies.find(e => e.id === ${id}).speed = 0`); return id; };
    const hurt = async id => { const e = await enemy(page, id); return !e || e.hp < e.maxHp; };
    // Rayo (salta desde el jugador hasta 300 px)
    expect(await H(page, '__neon.dbg.give("chain")')).toBe(true);
    let id = await dummy(250, 0);
    await expect.poll(() => hurt(id), { timeout: 20000 }).toBe(true);
    await H(page, '__neon.dbg.calm(); player.w.chain = 0;');
    // Pulso
    expect(await H(page, '__neon.dbg.give("nova")')).toBe(true);
    id = await dummy(0, 80);
    await expect.poll(() => hurt(id), { timeout: 20000 }).toBe(true);
    await H(page, '__neon.dbg.calm(); player.w.nova = 0;');
    // Orbitales (radio 62)
    expect(await H(page, '__neon.dbg.give("orbit")')).toBe(true);
    id = await dummy(-62, 0);
    await expect.poll(() => hurt(id), { timeout: 20000 }).toBe(true);
    expect((await H(page, '__neon.weapons')).orbit).toBe(1);
    // árbol: Orbitales 4/4 → la evolución aparece en la próxima subida
    await H(page, '__neon.dbg.give("orbit"); __neon.dbg.give("orbit"); __neon.dbg.give("orbit");');
    expect(await H(page, '__neon.dbg.give("orbit")')).toBe(false); // tope de nivel
    await H(page, 'orbs.push({ x: player.x, y: player.y, vx: 0, vy: 0, value: 8, r: 5, dead: false })');
    await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('levelup');
    await expect(page.locator('#cards .card.evo h3')).toHaveText('Anillo de plasma');
    // y el menú de pausa muestra el árbol
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause .ns-tree')).toContainText('Orbitales');
    expectNoErrors(errors);
  });

  test('oleadas: cada 30 s sube la oleada y la 3 trae un enjambre marcado en el piso', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await startCalm(page, hasTouch);
    await H(page, '__neon.dbg.setTime(59.9)');
    await expect.poll(() => H(page, '__neon.wave'), { timeout: 20000 }).toBe(3);
    await expect(page.locator('#wave')).toHaveText('OLEADA 3');
    // 12 + oleada marcas (15); cada una se convierte en un enemigo del enjambre
    await expect.poll(() => H(page, '__neon.warns.filter(w => w.type === "spawn" && w.kind === "swarm").length + __neon.kinds.swarm'), { timeout: 20000 }).toBe(15);
    await expect.poll(() => H(page, '__neon.kinds.swarm'), { timeout: 20000 }).toBe(15);
    expectNoErrors(errors);
  });
});

/* ======================= Móvil ======================= */
const SIZES = [[360, 640], [390, 844], [412, 915], [915, 412], [844, 390]];
/** Mide la UI propia del juego contra la pantalla, la barra del SDK y el HUD (todo en px CSS). */
const layout = page => page.evaluate(() => {
  const vw = innerWidth, vh = innerHeight;
  const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]'); };
  const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hit = (a, b) => a.l < b.r - .5 && a.r > b.l + .5 && a.t < b.b - .5 && a.b > b.t + .5;
  const name = e => e.id || String(e.className || e.tagName).split(' ')[0];
  const toolbar = [...document.querySelectorAll('.mla-bar .mla-btn')].filter(vis).map(box);
  const own = [...document.querySelectorAll('#overlay .ov-col > *, #overlay > .ml-credit, #levelUp h2, #levelUp .card, #levelUp .sub, #ui, #timer, #score, #wave, .mlm-hud, #charToast')].filter(vis);
  const outside = [], onToolbar = [], small = [];
  for (const e of own) {
    const b = box(e);
    if (b.l < -1 || b.t < -1 || b.r > vw + 1 || b.b > vh + 1) outside.push(name(e));
    if (toolbar.some(t => hit(b, t))) onToolbar.push(name(e));
  }
  for (const e of document.querySelectorAll('#overlay button, #levelUp button, .mla-bar .mla-btn')) {
    if (!vis(e)) continue; const b = box(e);
    if (b.w < 44 || b.h < 44) small.push(`${(e.textContent || '').trim().slice(0, 20)} ${Math.round(b.w)}×${Math.round(b.h)}`);
  }
  const hud = ['ui', 'timer', 'score', 'wave'].map(id => document.getElementById(id)).filter(vis).map(box);
  const missions = [...document.querySelectorAll('.mlm-hud')].filter(vis).map(box);
  const hudClash = [];
  for (const m of missions) if (hud.some(h => hit(m, h))) hudClash.push('misiones/HUD');
  if (hud.length === 4 && hit(hud[0], hud[1])) hudClash.push('vida/reloj');
  return { vw, vh, scrollX: document.documentElement.scrollWidth > vw + 1, outside, onToolbar, small, hudClash, toolbar, hud, missions };
});

test.describe('Neon Survivor — móvil', () => {
  test.describe.configure({ timeout: 240000 });

  test('matriz de tamaños: menú, juego, Coloso y subir de nivel entran sin pisar la barra ni el HUD', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'sólo móvil');
    for (const [w, h] of SIZES) {
      const tag = `${w}×${h}`;
      await page.setViewportSize({ width: w, height: h });
      const { errors } = await openGame(page, DBG);
      await ready(page);
      // menú
      let L = await layout(page);
      expect(L.scrollX, tag).toBe(false);
      expect(L.outside, tag + ' menú fuera de pantalla').toEqual([]);
      expect(L.onToolbar, tag + ' menú bajo la barra').toEqual([]);
      expect(L.small, tag + ' objetivos táctiles < 44 px').toEqual([]);
      const pb = await page.locator('#playBtn').boundingBox();
      expect(pb && pb.height, tag).toBeGreaterThanOrEqual(56);
      expect(pb && pb.y + pb.height, tag).toBeLessThanOrEqual(h);
      // el botón es lo que realmente recibe el toque en su centro
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [pb.x + pb.width / 2, pb.y + pb.height / 2]), tag).toBe('playBtn');
      await page.tap('#playBtn');
      await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('play');
      await H(page, '__neon.dbg.god(); __neon.dbg.calm();');
      // juego: HUD, misiones y barra del SDK sin superponerse; pista del joystick visible y en pantalla
      L = await layout(page);
      expect(L.onToolbar, tag + ' HUD/misiones bajo la barra').toEqual([]);
      expect(L.hudClash, tag).toEqual([]);
      const hint = await H(page, '__neon.hint');
      expect(hint, tag + ' pista del joystick').not.toBeNull();
      expect(hint.x - 55).toBeGreaterThanOrEqual(0); expect(hint.x + 55).toBeLessThanOrEqual(w);
      expect(hint.y + 55, tag).toBeLessThanOrEqual(h);
      const ring = { l: hint.x - 55, t: hint.y - 55, r: hint.x + 55, b: hint.y + 55 };
      for (const o of [...L.hud, ...L.missions, ...L.toolbar]) {
        expect(ring.l < o.r && ring.r > o.l && ring.t < o.b && ring.b > o.t, `${tag} pista vs ${JSON.stringify(o)}`).toBe(false);
      }
      // cámara: el lado corto del mundo nunca baja de 440 u
      const v = await H(page, '__neon.view');
      expect(Math.min(v.W, v.H), tag).toBeGreaterThanOrEqual(439.5);
      // barra del Coloso: entra en pantalla y no pisa el HUD, las misiones ni la barra del SDK
      await H(page, '__neon.dbg.boss(W / 2, H / 3)');
      const bb = await H(page, '__neon.bossBar');
      const bossBox = { l: bb.x - 4, t: bb.y - 4, r: bb.x + bb.bw + 4, b: bb.y - 4 + bb.h };
      expect(bossBox.l, tag).toBeGreaterThanOrEqual(0); expect(bossBox.r, tag).toBeLessThanOrEqual(w);
      for (const o of [...L.hud, ...L.missions, ...L.toolbar]) {
        const clash = bossBox.l < o.r && bossBox.r > o.l && bossBox.t < o.b && bossBox.b > o.t;
        expect(clash, `${tag} barra del Coloso vs ${JSON.stringify(o)}`).toBe(false);
      }
      // subir de nivel: tarjetas enteras en pantalla, sobre las misiones y fuera de la barra
      await H(page, 'orbs.push({ x: player.x, y: player.y, vx: 0, vy: 0, value: 8, r: 5, dead: false })');
      await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('levelup');
      L = await layout(page);
      expect(L.outside, tag + ' tarjetas fuera de pantalla').toEqual([]);
      expect(L.onToolbar, tag + ' tarjetas bajo la barra').toEqual([]);
      expect(L.small, tag).toEqual([]);
      for (const m of L.missions) {
        const top = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#levelUp'), [(m.l + m.r) / 2, (m.t + m.b) / 2]);
        expect(top, tag + ' el panel de mejoras tapa las misiones').toBe(true);
      }
      await wait(page, 350);
      await page.locator('#cards .card').first().tap();
      await expect.poll(async () => (await N(page)).state, { timeout: 20000 }).toBe('play');
      expectNoErrors(errors);
    }
  });

  test('partida sólo táctil: la pista guía, el joystick mueve, el disparo automático mata y el multitáctil no roba el control', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'sólo móvil');
    const { errors } = await openGame(page, DBG);
    await start(page, true);
    await H(page, '__neon.dbg.god(); __neon.dbg.calm();');
    expect(await H(page, '__neon.hint')).not.toBeNull();
    const a = await N(page);
    // dedo 1 arrastra a la derecha; a mitad de camino apoya un dedo 2 que tira para el otro lado
    const cdp = await page.context().newCDPSession(page);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await T('touchStart', [{ x: 150, y: 500, id: 1 }]);
    for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: 150 + i * 12, y: 500, id: 1 }]); await wait(page, 30); }
    await T('touchStart', [{ x: 222, y: 500, id: 1 }, { x: 300, y: 300, id: 2 }]);
    for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: 222, y: 500, id: 1 }, { x: 300 - i * 20, y: 300, id: 2 }]); await wait(page, 30); }
    await wait(page, 300);
    expect(await H(page, '__neon.joy')).toBe(true);
    await T('touchEnd', [{ x: 222, y: 500, id: 1 }]);
    await T('touchEnd', []);
    const b = await N(page);
    expect(b.px - a.px).toBeGreaterThan(30);         // siguió mandando el primer dedo
    expect(await H(page, '__neon.hint')).toBeNull();  // la pista se fue al encontrar el control
    expect(await H(page, '__neon.joy')).toBe(false);
    // acción principal: disparo automático al enemigo más cercano (simulación determinista)
    const k = await H(page, `(() => { stopLoop(); const id = __neon.dbg.spawn('grunt', player.x + 120, player.y);
      let n = 0; while (__neon.kills < 1 && n++ < 900) step(); startLoop(); return { kills: __neon.kills, steps: n }; })()`);
    expect(k.kills).toBe(1);
    expectNoErrors(errors);
  });

  test('girar el teléfono en plena partida: sigue jugando, conserva la posición relativa y reubica la UI', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'sólo móvil');
    await page.setViewportSize({ width: 390, height: 844 });
    const { errors } = await openGame(page, DBG);
    await start(page, true);
    await H(page, '__neon.dbg.god(); __neon.dbg.calm(); __neon.dbg.boss(W / 2, H / 4); stopLoop(); player.x = W * .25; player.y = H * .75; draw();');
    const before = await H(page, '({ v: __neon.view, rx: __neon.px / __neon.view.W, ry: __neon.py / __neon.view.H, t: __neon.time })');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => H(page, '__neon.view.SW'), { timeout: 15000 }).toBe(844);
    await wait(page, 100);
    const after = await H(page, '({ v: __neon.view, rx: __neon.px / __neon.view.W, ry: __neon.py / __neon.view.H, st: __neon.state, cw: document.getElementById("game").getBoundingClientRect().width, bb: __neon.bossBar })');
    expect(after.st).toBe('play');
    expect(after.cw).toBe(844);
    expect(after.v.SW).toBe(844);
    expect(Math.min(after.v.W, after.v.H)).toBeGreaterThanOrEqual(439.5);
    expect(after.rx).toBeCloseTo(before.rx, 2); expect(after.ry).toBeCloseTo(before.ry, 2);
    // la barra del Coloso pasó a la fila superior (hay lugar entre la vida y el reloj)
    expect(after.bb.y).toBeLessThan(40);
    const L = await layout(page);
    expect(L.onToolbar).toEqual([]); expect(L.hudClash).toEqual([]);
    await H(page, 'startLoop()');
    await expect.poll(async () => (await N(page)).time, { timeout: 15000 }).toBeGreaterThan(before.t + 0.3); // el reloj sigue corriendo
    expectNoErrors(errors);
  });

  test('las misiones se atenúan si el dedo del joystick pasa por encima', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'sólo móvil');
    const { errors } = await openGame(page, DBG);
    await start(page, true);
    await H(page, '__neon.dbg.god(); __neon.dbg.calm();');
    const m = await page.locator('.mlm-hud').boundingBox();
    expect(m).not.toBeNull();
    const cdp = await page.context().newCDPSession(page);
    const x = m.x + m.width / 2, y = m.y + m.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 10, y }] });
    await expect(page.locator('.mlm-hud')).toHaveClass(/ns-dim/);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.mlm-hud')).not.toHaveClass(/ns-dim/);
    expectNoErrors(errors);
  });

  test('PC: la cámara no cambia (escala 1) y no hay pista táctil', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'sólo PC');
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    const v = await H(page, '__neon.view');
    expect(v).toMatchObject({ vs: 1, W: 1280, H: 800 });
    expect(await H(page, '__neon.hint')).toBeNull();
    expectNoErrors(errors);
  });
});
