// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'guardianes_estelares.html';
const KEY = 'guardianes_estelares:save';
/** Partida sin tutorial (se prueba aparte). */
const NO_TUT = () => { try { if (!localStorage.getItem('guardianes_estelares:save')) localStorage.setItem('guardianes_estelares:save', JSON.stringify({ v: 2, d: { settings: { tutorialDone: true } } })); } catch (e) {} };

/** Estado de sólo lectura (window.__guardianes_estelares). */
const H = (page) => page.evaluate(() => {
  const h = /** @type {any} */ (window).__guardianes_estelares;
  return { state: h.state, scene: h.scene, sector: h.sector, score: h.score, hp: h.hp, player: h.player, counts: h.counts, sec: h.sec, boss: h.boss, tutorial: h.tutorial, world: h.world, difficulty: h.difficulty, quality: h.quality, perf: h.perf, campaign: h.campaign, missions: h.missions, paused: h.paused };
});
/** Llama a un ayudante de depuración (sólo con ?debug). */
const D = (page, fn, ...args) => page.evaluate(([fn, args]) => /** @type {any} */ (window).__guardianes_estelares.debug[fn](...args), [fn, args]);
const until = (page, fn, arg, timeout = 60_000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });

async function open(page, q = '?debug', { tutorial = false } = {}) {
  if (!tutorial) await page.addInitScript(NO_TUT);
  const r = await openGame(page, FILE + q);
  await until(page, () => { const h = /** @type {any} */ (window).__guardianes_estelares; return h && h.state === 'menu' && !!document.querySelector('#ge-menu:not([hidden])'); });
  return r;
}
/** Arranca la campaña con entrada real: Enter en PC, toque del botón en celular. */
async function startReal(page, mobile) {
  if (mobile) await page.locator('#ge-menu [data-go]').tap();
  else await page.keyboard.press('Enter');
  await until(page, () => ['intro', 'play'].includes(/** @type {any} */ (window).__guardianes_estelares.state));
}
async function toPlay(page) {
  await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'play', undefined, 60_000);
}

test.describe('GUARDIANES ESTELARES', () => {
  // la máquina de pruebas tiene joysticks físicos: se ocultan para no generar teclas fantasma
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); } catch (e) {} });
  });

  test('carga sin errores: menú con marca MateLabs, sectores, dificultad y barra del arcade', async ({ page }) => {
    const { errors } = await open(page, '');
    await expect(page.locator('#ge-menu h1')).toContainText('GUARDIANES');
    await expect(page.locator('#ge-menu .ge-credit')).toContainText('MATELABS');
    await expect(page.locator('#ge-menu [data-sector]')).toHaveCount(3);
    await expect(page.locator('#ge-menu [data-sector="1"]')).toBeDisabled();
    await expect(page.locator('#ge-menu .mlm-diff button')).toHaveCount(4);
    await expect(page.locator('.mla-bar')).toBeVisible();
    expect(await page.title()).toBe('GUARDIANES ESTELARES — MateLabs');
    // sin ?debug no hay ayudantes de depuración
    expect(await page.evaluate(() => 'debug' in /** @type {any} */ (window).__guardianes_estelares)).toBe(false);
    await wait(page, 800);
    expectNoErrors(errors);
  });

  test('arranque con entrada real, pilotaje, pulso, láser y turbo', async ({ page, isMobile }) => {
    const { errors } = await open(page, '');
    await startReal(page, isMobile);
    await toPlay(page);
    expect((await sdk(page)).telemetry).toContain('start');
    const a = await H(page);
    expect(a.scene).toBe('cinturon');
    // girar a la izquierda con teclado (inercia: el giro se acumula)
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await H(page)).player.yaw - a.player.yaw, { timeout: 30_000 }).toBeGreaterThan(0.15);
    await page.keyboard.up('ArrowLeft');
    // la nave avanza sola (crucero)
    await expect.poll(async () => { const p = (await H(page)).player; return Math.hypot(p.x - a.player.x, p.z - a.player.z); }, { timeout: 30_000 }).toBeGreaterThan(10);
    // pulso: Espacio dispara proyectiles
    await page.keyboard.down('Space');
    await expect.poll(async () => (await H(page)).counts.pbolts, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.keyboard.up('Space');
    // láser secundario: F lo enciende y gasta energía
    await page.keyboard.down('KeyF');
    await expect.poll(async () => (await H(page)).player.energy, { timeout: 30_000 }).toBeLessThan(90);
    await page.keyboard.up('KeyF');
    // turbo: Shift gasta la barra de turbo
    await page.keyboard.down('ShiftLeft');
    await expect.poll(async () => (await H(page)).player.boost, { timeout: 30_000 }).toBeLessThan(90);
    await page.keyboard.up('ShiftLeft');
    await expect(page.locator('.ge-hud')).toBeVisible();
    expectNoErrors(errors);
  });

  test('tutorial: aparece la primera vez, avanza con la acción pedida, se saltea y se reabre', async ({ page }) => {
    const { errors } = await open(page, '?debug', { tutorial: true });
    await page.keyboard.press('Enter');
    await toPlay(page);
    await expect(page.locator('.ge-tut')).toBeVisible();
    expect((await H(page)).tutorial).toEqual({ on: true, step: 0 });
    // paso 1: mover (entrada real)
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => (await H(page)).tutorial.step, { timeout: 40_000 }).toBe(1);
    await page.keyboard.up('ArrowUp');
    // mientras dura el tutorial el convoy espera
    expect((await H(page)).sec.started).toBe(false);
    // saltear
    await page.locator('.ge-tut [data-skip]').click();
    await expect(page.locator('.ge-tut')).toBeHidden();
    expect((await H(page)).tutorial.on).toBe(false);
    expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).d.settings.tutorialDone).toBe(true);
    // reabrir desde la pausa (acción «Ver tutorial»)
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]').click();
    await expect(page.locator('.ge-tut')).toBeVisible();
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.tutorial.on === true);
    // el juego sigue corriendo (no quedó congelado tras la acción de pausa)
    const t0 = (await H(page)).sec.t;
    await expect.poll(async () => (await H(page)).sec.t, { timeout: 30_000 }).toBeGreaterThan(t0);
    expectNoErrors(errors);
  });

  test('baliza: el escaneo por raycast avanza al mantener E, marca la baliza y persiste en la sesión', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    const b = (await H(page)).world.beacons[0];
    expect(b.scanned).toBe(false);
    await D(page, 'face', b.x, b.y, b.z, 40);
    await D(page, 'clearEnemies');
    // sin mantener E no se escanea
    await D(page, 'face', b.x, b.y, b.z, 40); await D(page, 'simulate', 0.5);
    expect((await H(page)).world.beacons[0].progress).toBe(0);
    await page.keyboard.down('KeyE');
    await D(page, 'face', b.x, b.y, b.z, 40); await D(page, 'simulate', 0.6);
    const mid = (await H(page)).world.beacons[0].progress;
    expect(mid).toBeGreaterThan(0.2); expect(mid).toBeLessThan(1);
    await D(page, 'face', b.x, b.y, b.z, 40); await D(page, 'simulate', 1.2);
    await page.keyboard.up('KeyE');
    const s = await H(page);
    expect(s.world.beacons[0].scanned).toBe(true);
    expect(s.score).toBeGreaterThanOrEqual(250);
    // apuntar a otro lado: la baliza no escaneada no avanza
    const b1 = s.world.beacons[1];
    await D(page, 'face', b1.x + 300, b1.y, b1.z, 40);
    await page.keyboard.down('KeyE'); await D(page, 'simulate', 0.8); await page.keyboard.up('KeyE');
    expect((await H(page)).world.beacons[1].progress).toBe(0);
    // estado de sesión: tras perder y reintentar, la baliza sigue escaneada
    await D(page, 'lose');
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'over');
    await page.locator('#ge-end [data-retry]').click();
    await until(page, () => ['intro', 'play'].includes(/** @type {any} */ (window).__guardianes_estelares.state));
    expect((await H(page)).world.beacons.map(x => x.scanned)).toEqual([true, false, false]);
    expectNoErrors(errors);
  });

  test('torreta aliada: se activa al atravesar su anillo (colisión), arranca y derriba enemigos', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'clearEnemies');
    const t = (await H(page)).world.turrets[0];
    expect(t.active).toBe(false);
    // volar a través del anillo con la nave real (avanza sola)
    await D(page, 'face', t.x, t.y, t.z, 25);
    await page.keyboard.down('ShiftLeft');
    await D(page, 'simulate', 1.5);
    await page.keyboard.up('ShiftLeft');
    let s = await H(page);
    expect(s.world.turrets[0].active).toBe(true);
    await D(page, 'simulate', 1.6);
    expect((await H(page)).world.turrets[0].boot).toBe(1);
    // un dron cerca de la torreta (la nave lejos): la torreta lo destruye sola
    await D(page, 'teleport', t.x + 250, t.y + 150, t.z);
    await D(page, 'spawnAt', 'drone', t.x + 45, t.y - 10, t.z);
    const k0 = (await H(page)).score;
    await expect.poll(async () => { await D(page, 'simulate', 1); return (await H(page)).counts.drone; }, { timeout: 60_000 }).toBe(0);
    expect((await H(page)).score).toBeGreaterThan(k0);
    expectNoErrors(errors);
  });

  test('dock de reparación: atraque por colisión, repara, mejora un arma y queda usado', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'clearEnemies');
    await D(page, 'setHp', 0, 30);
    const d0 = (await H(page)).world.docks[0];
    expect(d0.used).toBe(false);
    const lv0 = (await H(page)).player.pulseLv;
    await D(page, 'face', d0.x, d0.y, d0.z, 13);
    await expect.poll(async () => { await D(page, 'simulate', 0.2); return (await H(page)).player.docking; }, { timeout: 30_000 }).toBe(true);
    await D(page, 'simulate', 2.4);
    const s = await H(page);
    expect(s.player.docking).toBe(false);
    expect(s.world.docks[0].used).toBe(true);
    expect(s.hp.hull).toBe(100);
    expect(s.hp.shield).toBeGreaterThan(90);
    expect(s.player.pulseLv + s.player.laserLv).toBe(lv0 + 1 + 1);
    // ya usado: no vuelve a atracar
    await D(page, 'setHp', 50, 50);
    await D(page, 'face', d0.x, d0.y, d0.z, 13); await D(page, 'simulate', 1.4);
    expect((await H(page)).player.docking).toBe(false);
    expectNoErrors(errors);
  });

  test('cápsulas y enemigos con aviso: minas que parpadean y estallan, dron derribado con láser', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'clearEnemies');
    const c = (await H(page)).world.capsules[0];
    await D(page, 'face', c.x, c.y, c.z, 8); await D(page, 'simulate', 0.4);
    let s = await H(page);
    expect(s.world.capsules[0].taken).toBe(true);
    expect(s.missions.current.find(m => m.id === 'capsulas').progress).toBe(1);
    // dron minador frente a la nave: el láser secundario lo destruye y cuenta para la misión
    await D(page, 'spawn', 'drone', 50);
    await page.keyboard.down('KeyF');
    await expect.poll(async () => { await D(page, 'simulate', 0.2); return (await H(page)).counts.drone; }, { timeout: 30_000 }).toBe(0);
    await page.keyboard.up('KeyF');
    s = await H(page);
    expect(s.missions.current.find(m => m.id === 'drones_laser').progress).toBe(1);
    expectNoErrors(errors);
  });

  test('sector 1 completo: misión principal + secundaria, transición al sector 2 y progreso persistente tras recargar', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'clearEnemies');
    await D(page, 'invulnerable', true);
    await D(page, 'convoyProgress', 0.995);
    await D(page, 'clearEnemies');
    await D(page, 'simulate', 4);
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'clear');
    const s = await H(page);
    expect(s.missions.current.find(m => m.id === 'convoy').status).toBe('done');
    expect(s.missions.current.find(m => m.id === 'sin_escudo').status).toBe('done');
    expect(s.campaign.unlocked).toBe(2);
    expect(s.campaign.campaign.convoy).toBe(true);
    await expect(page.locator('#ge-clear')).toBeVisible();
    // transición al sector 2
    await page.locator('#ge-clear [data-next]').click();
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.scene === 'delta');
    await toPlay(page);
    expect((await H(page)).world.transmitters.length).toBe(3);
    // recargar: campaña y logros persisten
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__guardianes_estelares; return h && h.state === 'menu'; });
    const r = await H(page);
    expect(r.campaign.campaign.convoy).toBe(true);
    expect(r.missions.achievements.done.convoy).toBeGreaterThan(0);
    expect(r.missions.achievements.done.sin_escudo).toBeGreaterThan(0);
    await expect(page.locator('#ge-menu [data-sector="1"]')).toBeEnabled();
    await expect(page.locator('#ge-menu .ge-camp')).toContainText('✅ Salvar convoy mercante');
    expectNoErrors(errors);
  });

  test('sector 2: escanear una baliza baja el escudo del transmisor; 3 transmisores cierran el sector', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'goto', 1);
    await D(page, 'clearEnemies'); await D(page, 'invulnerable', true);
    let s = await H(page);
    expect(s.scene).toBe('delta');
    expect(s.world.transmitters.every(t => t.shielded)).toBe(true);
    const b = s.world.beacons[0];
    await page.keyboard.down('KeyE');
    for (let i = 0; i < 4; i++) { await D(page, 'face', b.x, b.y, b.z, 40); await D(page, 'simulate', 0.5); }
    await page.keyboard.up('KeyE');
    s = await H(page);
    expect(s.world.transmitters[0].shielded).toBe(false);
    expect(s.world.transmitters[1].shielded).toBe(true);
    for (let i = 0; i < 3; i++) await D(page, 'destroyTransmitter', i);
    await D(page, 'simulate', 2);
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'clear');
    s = await H(page);
    expect(s.missions.current.length).toBeGreaterThan(0);
    expect(s.campaign.unlocked).toBe(3);
    // al sector 3
    await page.locator('#ge-clear [data-next]').click();
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.scene === 'nebulosa');
    expectNoErrors(errors);
  });

  test('cargueros varados: aparecen atacantes y al derribarlos el carguero se salva', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'goto', 1); await D(page, 'clearEnemies'); await D(page, 'invulnerable', true);
    // acercarse al carguero CARDENAL (170,-18,150)
    await D(page, 'face', 170, -18, 150, 120); await D(page, 'simulate', 0.3);
    let s = await H(page);
    expect(s.world.stranded[0].spawned).toBe(true);
    expect(s.counts.bomber).toBeGreaterThan(0);
    await D(page, 'killAll'); await D(page, 'simulate', 0.5);
    s = await H(page);
    expect(s.world.stranded[0].saved).toBe(true);
    expect(s.missions.current.find(m => m.id === 'cargueros').progress).toBe(1);
    expectNoErrors(errors);
  });

  test('jefe Némesis: entrada, fase torretas → escudos (emisores sólo vulnerables abiertos) → reactor → escolta y victoria', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'invulnerable', true);
    await D(page, 'spawnBoss');
    expect((await H(page)).state).toBe('cine');
    await expect(page.locator('.ge-banner')).toContainText('DESTRUCTOR NÉMESIS');
    await D(page, 'simulate', 4.5);
    let s = await H(page);
    expect(s.state).toBe('play');
    expect(s.boss.phase).toBe(1);
    expect(s.boss.turrets).toBe(4);
    // torretas avisan (estado de carga) antes de disparar: se ve la barra de jefe
    await expect(page.locator('.ge-boss')).toBeVisible();
    for (let i = 0; i < 4; i++) await D(page, 'bossDamage', 9999);
    s = await H(page);
    expect(s.boss.phase).toBe(2);
    // emisor cerrado: bloquea el daño; abierto: lo recibe
    await D(page, 'simulate', 6.5);
    s = await H(page);
    expect(s.boss.emittersOpen).toBe(false);
    expect(await D(page, 'bossHit', 9999)).toBe('block');
    expect((await H(page)).boss.emitters).toBe(3);
    await D(page, 'simulate', 4.2); // vuelve a abrirse (ciclo 10,5 s)
    expect((await H(page)).boss.emittersOpen).toBe(true);
    expect(await D(page, 'bossHit', 9999)).toBe('hit');
    expect((await H(page)).boss.emitters).toBe(2);
    for (let i = 0; i < 2; i++) await D(page, 'bossDamage', 9999);
    s = await H(page);
    expect(s.boss.phase).toBe(3);
    expect(s.boss.emitters).toBe(0);
    await D(page, 'bossDamage', 99999);
    expect((await H(page)).boss.phase).toBe(4);
    await D(page, 'simulate', 4);
    s = await H(page);
    expect(s.boss.phase).toBe(5);
    expect(s.sec.escort).toBe(true);
    expect(s.world.esperanza.moving).toBe(true);
    expect(s.player.pulseLv).toBe(3); // recompensa
    await D(page, 'escortArrive'); await D(page, 'simulate', 2.5);
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'victory');
    await expect(page.locator('#ge-end')).toContainText('VICTORIA');
    expect((await H(page)).campaign.trophy).toBe(true);
    expect((await sdk(page)).telemetry).toContain('end');
    expectNoErrors(errors);
  });

  test('jefe: el pulso del reactor avisa (esfera creciente) antes de dañar', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'spawnBoss'); await D(page, 'simulate', 4.5);
    await D(page, 'bossPhase', 3);
    await D(page, 'setHp', 100, 100);
    // pulso: primero aviso (esfera creciente) sin daño
    await page.evaluate(() => { const d = /** @type {any} */ (window).__guardianes_estelares.debug; d.simulate(5.2); });
    const s1 = await H(page);
    expect(s1.boss.pulse).toBe(1);
    expect(s1.hp.shield + s1.hp.hull).toBeGreaterThan(150);
    expectNoErrors(errors);
  });

  test('derrota: nave destruida y convoy perdido muestran su pantalla; reintentar vuelve al sector', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'damage', 500);
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'over');
    await expect(page.locator('#ge-end h1')).toHaveText('NAVE DESTRUIDA');
    expect((await sdk(page)).telemetry).toContain('end');
    await wait(page, 700);
    await page.keyboard.press('Enter');
    await until(page, () => ['intro', 'play'].includes(/** @type {any} */ (window).__guardianes_estelares.state));
    await toPlay(page);
    await D(page, 'invulnerable', true);
    await D(page, 'killFreighter', 0);
    expect((await H(page)).state).toBe('play');
    await D(page, 'killFreighter', 1);
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'over');
    await expect(page.locator('#ge-end h1')).toHaveText('CONVOY PERDIDO');
    await page.locator('#ge-end [data-menu]').click();
    await until(page, () => /** @type {any} */ (window).__guardianes_estelares.state === 'menu');
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanudar continúa y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await open(page);
    await startReal(page, isMobile); await toPlay(page);
    await D(page, 'invulnerable', true);
    await wait(page, 600);
    await page.keyboard.press('Escape');
    expect((await sdk(page)).paused).toBe(true);
    await expect(page.locator('.mla-pause')).toBeVisible();
    const p1 = await H(page);
    await wait(page, 1000);
    const p2 = await H(page);
    expect(p2.sec.t).toBe(p1.sec.t);
    expect(p2.player.x).toBe(p1.player.x);
    expect(p2.paused).toBe(true);
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect.poll(async () => (await H(page)).sec.t, { timeout: 30_000 }).toBeGreaterThan(p2.sec.t);
    const r = await H(page);
    expect(r.sec.t - p2.sec.t).toBeLessThan(5); // sin salto de tiempo
    // puntos para comprobar el reinicio
    await D(page, 'spawn', 'drone', 30); await D(page, 'killAll');
    expect((await H(page)).score).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    const z = await H(page);
    expect(z.score).toBe(0);
    expect(z.sec.t).toBeLessThan(1);
    expect(z.counts.enemies).toBe(0);
    expect(z.hp).toEqual({ shield: 100, hull: 100 });
    await toPlay(page);
    expectNoErrors(errors);
  });

  test('guardado corrupto: se recupera sin romper el juego (JSON roto y tipos inválidos)', async ({ page }) => {
    await page.addInitScript(k => { if (!sessionStorage.getItem('ge-once')) { sessionStorage.setItem('ge-once', '1'); localStorage.setItem(k, '{roto!!'); } }, KEY);
    const { errors } = await open(page, '', { tutorial: true });
    let s = await H(page);
    expect(s.campaign.unlocked).toBe(1);
    expect(await page.evaluate(k => localStorage.getItem(k + ':corrupto'), KEY)).toBe('{roto!!');
    // tipos inválidos dentro de un JSON válido
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 2, d: { unlocked: 'muchos', best: -5, campaign: 'x', settings: { sens: 99, invertY: 'si' } } })), KEY);
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__guardianes_estelares; return h && h.state === 'menu'; });
    s = await H(page);
    expect(s.campaign.unlocked).toBe(1);
    expect(s.campaign.best).toBe(0);
    expect(s.campaign.campaign).toEqual({ convoy: false, transmisores: false, nemesis: false });
    expect(s.campaign.settings.sens).toBe(1.6);
    expect(s.campaign.settings.invertY).toBe(false);
    // migración desde la versión 1
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 1, d: { sector: 2, best: 1234, tutorial: true } })), KEY);
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__guardianes_estelares; return h && h.state === 'menu'; });
    s = await H(page);
    expect([s.campaign.unlocked, s.campaign.best, s.campaign.settings.tutorialDone]).toEqual([2, 1234, true]);
    await page.keyboard.press('Enter');
    await toPlay(page);
    expectNoErrors(errors);
  });

  test('dificultad: el selector cambia daño, vida y regeneración reales', async ({ page }) => {
    const { errors } = await open(page);
    await page.locator('#ge-menu .mlm-diff [data-d="extremo"]').click();
    await expect(page.locator('#ge-menu [data-dfx]')).toContainText('+75%');
    await page.locator('#ge-menu [data-go]').click();
    await toPlay(page);
    const s = await H(page);
    expect(s.difficulty.id).toBe('extremo');
    expect(s.difficulty.enemyDmg).toBe(1.75);
    expect(s.world.freighters[0].max).toBeCloseTo(600 * 0.7, 0);
    // vida real de un enemigo: interceptor 32 × 1,5
    await D(page, 'clearEnemies'); await D(page, 'spawn', 'interceptor', 80);
    expect((await D(page, 'enemies'))[0].hp).toBeCloseTo(48, 0);
    await page.evaluate(() => localStorage.setItem('ml:difficulty', JSON.stringify({ guardianes_estelares: 'facil' })));
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__guardianes_estelares; return h && h.state === 'menu'; });
    await page.keyboard.press('Enter'); await toPlay(page);
    const f = await H(page);
    expect(f.difficulty.id).toBe('facil');
    expect(f.world.freighters[0].max).toBeCloseTo(600 * 1.5, 0);
    expect(f.difficulty.regenDelay).toBeLessThan(s.difficulty.regenDelay);
    await D(page, 'clearEnemies'); await D(page, 'spawn', 'interceptor', 80);
    expect((await D(page, 'enemies'))[0].hp).toBeCloseTo(24, 0);
    expectNoErrors(errors);
  });

  test('calidad: baja y alta cambian estrellas, rocas, partículas y triángulos dibujados', async ({ page }) => {
    const res = {};
    for (const q of ['low', 'high']) {
      await page.addInitScript(qq => { localStorage.setItem('ml:settings', JSON.stringify({ quality: qq })); }, q);
      await open(page, '');
      await wait(page, 600);
      res[q] = await H(page);
    }
    expect(res.low.quality).toBe('low');
    expect(res.high.quality).toBe('high');
    expect(res.high.counts.stars).toBeGreaterThan(res.low.counts.stars * 3);
    expect(res.high.counts.asteroids).toBeGreaterThan(res.low.counts.asteroids * 1.5);
    expect(res.high.perf.tris).toBeGreaterThan(res.low.perf.tris);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y apaisado', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await toPlay(page);
    await D(page, 'spawnBoss'); await D(page, 'simulate', 4.5);
    const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const vp of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
      await page.setViewportSize(vp);
      await wait(page, 500);
      const m = await page.evaluate(() => {
        const sels = ['.ge-status', '.ge-obj', '.ge-radar', '.mla-bar'];
        const touch = !document.querySelector('.k3-touch')?.hasAttribute('hidden');
        if (touch) sels.push('.k3-joy', '.k3-btns');
        return { sels, boxes: sels.map(s => /** @type {HTMLElement} */ (document.querySelector(s)).getBoundingClientRect().toJSON()),
          sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
      });
      for (let i = 0; i < m.boxes.length; i++) {
        const b = m.boxes[i];
        expect(b.left >= -1 && b.right <= m.w + 1 && b.top >= -1 && b.bottom <= m.h + 1, `${vp.width}: ${m.sels[i]} dentro de la pantalla`).toBe(true);
        for (let j = i + 1; j < m.boxes.length; j++) expect(overlap(b, m.boxes[j]), `${vp.width}: ${m.sels[i]} / ${m.sels[j]}`).toBe(false);
      }
      expect(m.sw).toBeLessThanOrEqual(m.w); expect(m.sh).toBeLessThanOrEqual(m.h);
    }
    expectNoErrors(errors);
  });

  test('táctil: stick virtual gira la nave y los botones FUEGO/LÁSER disparan', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    const { errors } = await open(page);
    await startReal(page, true); await toPlay(page);
    await D(page, 'invulnerable', true);
    await expect(page.locator('.k3-joy')).toBeVisible();
    const a = await H(page);
    const joy = await page.locator('.k3-joy').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const cx = joy.x + joy.width / 2, cy = joy.y + joy.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 50, y: cy, id: 1 }] });
    await expect.poll(async () => (await H(page)).player.yaw - a.player.yaw, { timeout: 30_000 }).toBeGreaterThan(0.15);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const fire = await page.locator('.k3-btn[aria-label="fire"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x + 30, y: fire.y + 30, id: 2 }] });
    await expect.poll(async () => (await H(page)).counts.pbolts, { timeout: 30_000 }).toBeGreaterThan(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const las = await page.locator('.k3-btn[aria-label="laser"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: las.x + 30, y: las.y + 30, id: 3 }] });
    await expect.poll(async () => (await H(page)).player.energy, { timeout: 30_000 }).toBeLessThan(90);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expectNoErrors(errors);
  });
  /* ======================= móvil (proyecto 'mobile', Pixel 7 con toque) ======================= */
  const SIZES = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 915, height: 412 }, { width: 844, height: 390 }];
  /** Cajas de la UI propia + barra del SDK, texto chico y objetivos táctiles chicos (sólo lo visible). */
  const layoutProbe = (page) => page.evaluate(() => {
    const vis = (/** @type {Element} */ el) => { for (let p = el; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/** @type {HTMLElement} */ (p).hidden || cs.display === 'none' || cs.visibility === 'hidden') return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sels = ['.ge-status', '.ge-obj', '.ge-radar', '.ge-tut', '.k3-joy', '.k3-btns', '.mla-bar'];
    const boxes = sels.map(s => { const e = document.querySelector(s); return e && vis(e) ? { s, r: e.getBoundingClientRect().toJSON() } : null; }).filter(Boolean);
    const tiny = [], small = [];
    for (const el of document.querySelectorAll('.ge-hud *, .ge-tut *, .k3-touch *')) {
      if (!vis(el) || getComputedStyle(el).opacity === '0') continue;
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) tiny.push(el.textContent.trim().slice(0, 24) + ' ' + fs); }
    }
    for (const el of document.querySelectorAll('.k3-btn, .ge-tut button, .mla-bar .mla-btn')) if (vis(el)) { const r = el.getBoundingClientRect(); if (r.width < 44 || r.height < 44) small.push((el.getAttribute('aria-label') || el.textContent) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
    const fire = document.querySelector('.k3-btn[aria-label="fire"]')?.getBoundingClientRect();
    const goal = ['.ge-goal', '.ge-prog', '.ge-sm span'].flatMap(s => [...document.querySelectorAll(s)]).filter(vis).map(e => parseFloat(getComputedStyle(e).fontSize));
    return { boxes, tiny, small, fire: fire ? Math.min(fire.width, fire.height) : 0, goalMin: Math.min(...goal, 99), w: innerWidth, h: innerHeight,
      sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight };
  });
  const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

  test('móvil: matriz de pantallas — menú entra con el botón principal tocable; HUD, tutorial y controles sin superposición', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    test.setTimeout(150_000);
    const { errors } = await open(page, '?debug', { tutorial: true });
    for (const vp of SIZES) {
      await page.setViewportSize(vp); await wait(page, 250);
      const m = await page.evaluate(() => {
        const go = /** @type {HTMLElement} */ (document.querySelector('#ge-menu [data-go]')).getBoundingClientRect();
        const bar = /** @type {HTMLElement} */ (document.querySelector('.mla-bar')).getBoundingClientRect();
        const scr = /** @type {HTMLElement} */ (document.querySelector('#ge-menu'));
        const els = [...scr.querySelectorAll('.k3-panel *')].filter(e => e.getBoundingClientRect().width > 0);
        const kick = scr.querySelector('.k3-kicker')?.getBoundingClientRect();
        const hit = document.elementFromPoint(go.left + go.width / 2, go.top + go.height / 2);
        return { go: go.toJSON(), bar: bar.toJSON(), kick: kick && kick.toJSON(), hitGo: !!hit && !!hit.closest('[data-go]'), w: innerWidth, h: innerHeight,
          maxRight: Math.max(...els.map(e => e.getBoundingClientRect().right)), sw: scr.scrollWidth, docW: document.documentElement.scrollWidth,
          btnH: Math.min(...[...scr.querySelectorAll('button')].map(b => b.getBoundingClientRect().height)) };
      });
      const tag = `${vp.width}x${vp.height}`;
      expect(m.go.bottom <= m.h && m.go.top >= 0, `${tag}: botón principal visible`).toBe(true);
      expect(m.go.height, `${tag}: botón principal ≥ 48 px`).toBeGreaterThanOrEqual(48);
      expect(m.btnH, `${tag}: botones del menú ≥ 44 px`).toBeGreaterThanOrEqual(44);
      expect(m.hitGo, `${tag}: nada tapa al botón principal`).toBe(true);
      expect(m.maxRight, `${tag}: sin desborde horizontal`).toBeLessThanOrEqual(m.w + 1);
      expect(m.docW).toBeLessThanOrEqual(m.w);
      if (m.kick) expect(overlap(m.kick, m.bar), `${tag}: el título no queda bajo la barra del arcade`).toBe(false);
    }
    // arranque con toque real; el tutorial (primera vez) queda visible
    await page.setViewportSize(SIZES[0]);
    await page.locator('#ge-menu [data-go]').tap();
    await toPlay(page);
    await expect(page.locator('.ge-tut')).toBeVisible();
    for (const vp of SIZES) {
      await page.setViewportSize(vp); await wait(page, 400);
      const m = await layoutProbe(page);
      const tag = `${vp.width}x${vp.height}`;
      // en vertical el tutorial ocupa el lugar del panel de objetivo (que se oculta mientras dura)
      expect(m.boxes.map(b => b.s), tag).toEqual(expect.arrayContaining(['.ge-status', '.ge-radar', '.ge-tut', '.k3-joy', '.k3-btns', '.mla-bar']));
      for (let i = 0; i < m.boxes.length; i++) {
        const b = m.boxes[i].r;
        expect(b.left >= -1 && b.right <= m.w + 1 && b.top >= -1 && b.bottom <= m.h + 1, `${tag}: ${m.boxes[i].s} dentro de la pantalla`).toBe(true);
        for (let j = i + 1; j < m.boxes.length; j++) expect(overlap(b, m.boxes[j].r), `${tag}: ${m.boxes[i].s} / ${m.boxes[j].s}`).toBe(false);
      }
      expect(m.tiny, `${tag}: texto < 11 px`).toEqual([]);
      expect(m.goalMin, `${tag}: objetivo y misiones ≥ 12 px`).toBeGreaterThanOrEqual(12);
      expect(m.small, `${tag}: objetivos táctiles < 44 px`).toEqual([]);
      expect(m.fire, `${tag}: FUEGO ≥ 56 px`).toBeGreaterThanOrEqual(56);
      expect(m.sw).toBeLessThanOrEqual(m.w); expect(m.sh).toBeLessThanOrEqual(m.h);
    }
    // sin tutorial: el panel de objetivo vuelve y tampoco choca con nada
    await page.locator('.ge-tut [data-skip]').tap();
    for (const vp of [SIZES[0], SIZES[4]]) {
      await page.setViewportSize(vp); await wait(page, 400);
      const m = await layoutProbe(page);
      for (let i = 0; i < m.boxes.length; i++) for (let j = i + 1; j < m.boxes.length; j++) expect(overlap(m.boxes[i].r, m.boxes[j].r), `${vp.width}: ${m.boxes[i].s} / ${m.boxes[j].s}`).toBe(false);
    }
    expect((await H(page)).state).toBe('play');
    expectNoErrors(errors);
  });

  test('móvil: partida sólo táctil — stick y FUEGO a la vez (multitáctil), vibración corta, girar el teléfono a mitad de partida', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    await page.addInitScript(() => { /** @type {any} */ (window).__buzz = []; Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (/** @type {any} */ p) => { /** @type {any} */ (window).__buzz.push(p); return true; } }); });
    const { errors } = await open(page);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.locator('#ge-menu [data-go]').tap();
    await toPlay(page);
    await D(page, 'invulnerable', true); await D(page, 'clearEnemies');
    // vertical: FOV más abierto (≥ 48° horizontales) para ver amenazas a los costados
    const fovH = () => page.evaluate(() => { const c = /** @type {any} */ (window).__guardianes_estelares.debug.three.camera; return 2 * Math.atan(Math.tan(c.fov * Math.PI / 360) * c.aspect) * 180 / Math.PI; });
    await D(page, 'simulate', 1);
    expect(await fovH()).toBeGreaterThan(48);
    const a = await H(page);
    const joy = await page.locator('.k3-joy').boundingBox();
    const fire = await page.locator('.k3-btn[aria-label="fire"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const jx = joy.x + joy.width / 2, jy = joy.y + joy.height / 2, fx = fire.x + fire.width / 2, fy = fire.y + fire.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jx - 55, y: jy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx - 55, y: jy, id: 1 }, { x: fx, y: fy, id: 2 }] });
    await expect(page.locator('.k3-btn[aria-label="fire"]')).toHaveClass(/\bon\b/);
    await expect.poll(async () => { const h = await H(page); return h.player.yaw - a.player.yaw > 0.15 && h.counts.pbolts > 0; }, { timeout: 30_000 }).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await page.evaluate(() => /** @type {any} */ (window).__buzz.length)).toBeGreaterThan(0);
    // girar a apaisado en plena partida: sigue jugando, FOV vuelve al normal, controles reubicados dentro de la pantalla
    const before = await H(page);
    await page.setViewportSize({ width: 915, height: 412 }); await wait(page, 300);
    await D(page, 'simulate', 1);
    const after = await H(page);
    expect(after.state).toBe('play'); expect(after.sector).toBe(before.sector); expect(after.score).toBeGreaterThanOrEqual(before.score);
    const fh = await fovH(); expect(fh).toBeGreaterThan(90);
    const btns = await page.locator('.k3-btns').boundingBox();
    expect(btns.y + btns.height).toBeLessThanOrEqual(412); expect(btns.x + btns.width).toBeLessThanOrEqual(915);
    await page.setViewportSize({ width: 412, height: 915 }); await D(page, 'simulate', 0.5);
    expect((await H(page)).state).toBe('play');
    await cdp.detach();
    expectNoErrors(errors);
  });

  test('móvil: disparo asistido activo por defecto en táctil — dispara solo al alinear con un enemigo', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    const { errors } = await open(page);
    expect((await page.evaluate(() => /** @type {any} */ (window).__guardianes_estelares.settings)).autoFire).toBe(true);
    await page.locator('#ge-menu [data-go]').tap();
    await toPlay(page);
    await D(page, 'invulnerable', true); await D(page, 'clearEnemies');
    const k0 = (await H(page)).kills;
    await D(page, 'spawn', 'interceptor', 70);
    await expect.poll(async () => { await D(page, 'simulate', 0.25); const h = await H(page); return h.counts.pbolts > 0 || h.kills > k0; }, { timeout: 30_000 }).toBe(true);
    expectNoErrors(errors);
  });
});
