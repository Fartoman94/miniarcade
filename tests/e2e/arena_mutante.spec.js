// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'arena_mutante.html';
const KEY = 'arena_mutante:save';
/** Partida sin tutorial (se prueba aparte). */
const NO_TUT = () => { try { if (!localStorage.getItem('arena_mutante:save')) localStorage.setItem('arena_mutante:save', JSON.stringify({ v: 2, d: { settings: { tutorialDone: true, autoAim: 'off', autoFire: false } } })); } catch (e) {} };

/** Estado de sólo lectura (window.__arena_mutante). */
const H = (page) => page.evaluate(() => {
  const h = /** @type {any} */ (window).__arena_mutante;
  return { state: h.state, scene: h.scene, arena: h.arena, score: h.score, hp: h.hp, player: h.player, counts: h.counts, sec: h.sec, boss: h.boss, tutorial: h.tutorial,
    world: h.world, difficulty: h.difficulty, quality: h.quality, perf: h.perf, campaign: h.campaign, missions: h.missions, paused: h.paused, session: h.session, interaction: h.interaction };
});
/** Llama a un ayudante de depuración (sólo con ?debug). */
const D = (page, fn, ...args) => page.evaluate(([fn, args]) => /** @type {any} */ (window).__arena_mutante.debug[fn](...args), [fn, args]);
const until = (page, fn, arg, timeout = 60_000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const stateIs = (page, s, timeout = 60_000) => until(page, st => /** @type {any} */ (window).__arena_mutante.state === st, s, timeout);

async function open(page, q = '?debug', { tutorial = false } = {}) {
  if (!tutorial) await page.addInitScript(NO_TUT);
  const r = await openGame(page, FILE + q);
  await until(page, () => { const h = /** @type {any} */ (window).__arena_mutante; return h && h.state === 'menu' && !!document.querySelector('#am-menu:not([hidden])'); });
  return r;
}
/** Arranca con entrada real: Enter en PC, toque del botón en celular. */
async function startReal(page, mobile) {
  if (mobile) await page.locator('#am-menu [data-go]').tap();
  else await page.keyboard.press('Enter');
  await stateIs(page, 'play');
}
/** Arena lista para probar: director quieto, sin mutantes. */
async function calm(page) { await D(page, 'freezeDirector', true); await D(page, 'clearEnemies'); }

test.describe('ARENA MUTANTE', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); } catch (e) {} });
  });

  test('carga sin errores: menú con marca MateLabs, 3 arenas, dificultad y barra del arcade', async ({ page }) => {
    const { errors } = await open(page, '');
    await expect(page.locator('#am-menu h1')).toContainText('ARENA');
    await expect(page.locator('#am-menu .am-credit')).toContainText('MATELABS');
    await expect(page.locator('#am-menu [data-arena]')).toHaveCount(3);
    await expect(page.locator('#am-menu [data-arena="1"]')).toBeDisabled();
    await expect(page.locator('#am-menu .mlm-diff button')).toHaveCount(4);
    await expect(page.locator('.mla-bar')).toBeVisible();
    expect(await page.title()).toBe('ARENA MUTANTE — MateLabs');
    expect(await page.evaluate(() => 'debug' in /** @type {any} */ (window).__arena_mutante)).toBe(false);
    await wait(page, 800);
    expectNoErrors(errors);
  });

  test('entrada real: arrancar, mover (WASD), cámara (flechas), disparar (J), rodar (Espacio), recargar (R) y pulso (Q)', async ({ page, isMobile }) => {
    const { errors } = await open(page, '');
    await startReal(page, isMobile);
    expect((await sdk(page)).telemetry).toContain('start');
    const a = await H(page);
    expect(a.scene).toBe('bunker');
    await page.keyboard.down('KeyW');
    await expect.poll(async () => { const p = (await H(page)).player; return Math.hypot(p.x - a.player.x, p.z - a.player.z); }, { timeout: 30_000 }).toBeGreaterThan(1.2);
    await page.keyboard.up('KeyW');
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await H(page)).player.yaw - a.player.yaw, { timeout: 30_000 }).toBeGreaterThan(0.3);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('KeyJ');
    await expect.poll(async () => (await H(page)).player.shots, { timeout: 30_000 }).toBeGreaterThan(2);
    await page.keyboard.up('KeyJ');
    expect((await H(page)).player.ammo).toBeLessThan(24);
    await page.keyboard.press('KeyR');
    await expect.poll(async () => (await H(page)).player.ammo, { timeout: 30_000 }).toBe(24);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await H(page)).player.rolls, { timeout: 10_000 }).toBeLessThan(2);
    await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await H(page)).player.pulseCd, { timeout: 10_000 }).toBeGreaterThan(5);
    await expect(page.locator('.am-hud')).toBeVisible();
    expectNoErrors(errors);
  });

  test('tutorial: aparece la primera vez, avanza con la acción pedida, se saltea y se reabre desde la pausa', async ({ page }) => {
    const { errors } = await open(page, '?debug', { tutorial: true });
    await page.keyboard.press('Enter');
    await stateIs(page, 'play');
    await expect(page.locator('.am-tut')).toBeVisible();
    expect((await H(page)).tutorial).toEqual({ on: true, step: 0 });
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await H(page)).tutorial.step, { timeout: 40_000 }).toBe(1);
    await page.keyboard.up('KeyD');
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await H(page)).tutorial.step, { timeout: 40_000 }).toBe(2);
    await page.keyboard.up('ArrowRight');
    // mientras dura el tutorial no hay goteo de mutantes
    expect((await H(page)).counts.enemies).toBe(0);
    await page.locator('.am-tut [data-skip]').click();
    await expect(page.locator('.am-tut')).toBeHidden();
    expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).d.settings.tutorialDone).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]').click();
    await expect(page.locator('.am-tut')).toBeVisible();
    // el juego sigue corriendo tras la acción de pausa
    const t0 = (await H(page)).sec.t;
    await expect.poll(async () => (await H(page)).sec.t, { timeout: 30_000 }).toBeGreaterThan(t0);
    expectNoErrors(errors);
  });

  test('generador y puerta con energía: mantener E restablece, la puerta se abre, se cierra con E, bloquea y los mutantes la rompen; persiste al reintentar', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await calm(page); await D(page, 'invulnerable', true);
    const w = (await H(page)).world;
    expect(w.doors.find(d => d.id === 1).state).toBe('locked');
    const g = w.gens[0];
    await D(page, 'face', g.x, g.z, 1.9);
    expect((await H(page)).interaction.kind).toBe('gen');
    // mantener E un rato y soltar: progreso parcial
    await page.keyboard.down('KeyE'); await D(page, 'simulate', 1.2); await page.keyboard.up('KeyE');
    let s = await H(page);
    expect(s.world.gens[0].progress).toBeGreaterThan(0.2);
    expect(s.world.gens[0].restored).toBe(false);
    await page.keyboard.down('KeyE'); await D(page, 'simulate', 3.4); await page.keyboard.up('KeyE');
    s = await H(page);
    expect(s.world.gens[0].restored).toBe(true);
    expect(s.missions.current.find(m => m.id === 'generadores').progress).toBe(1);
    await D(page, 'clearEnemies');
    await D(page, 'simulate', 1);
    const d1 = (await H(page)).world.doors.find(d => d.id === 1);
    expect(d1.state).toBe('open'); expect(d1.open).toBeGreaterThan(0.9);
    // cerrar con E (desde el lado del salón)
    await D(page, 'teleport', d1.x + 2.4, d1.z); await D(page, 'look', -Math.PI / 2, 0);
    expect((await H(page)).interaction.kind).toBe('door');
    await page.keyboard.press('KeyE'); await D(page, 'simulate', 1);
    expect((await H(page)).world.doors.find(d => d.id === 1)).toMatchObject({ state: 'closed' });
    // un bruto del otro lado golpea la puerta cerrada hasta romperla
    await D(page, 'spawnAt', 'brute', d1.x - 5, d1.z);
    await D(page, 'teleport', d1.x + 6, d1.z);
    await D(page, 'simulate', 1.5);
    const mid = (await H(page)).world.doors.find(d => d.id === 1);
    expect(mid.hp).toBeLessThan(260);
    let br = (await D(page, 'enemies'))[0];
    expect(br.x).toBeLessThan(d1.x); // la puerta lo frena
    await expect.poll(async () => { await D(page, 'simulate', 2); return (await H(page)).world.doors.find(d => d.id === 1).state; }, { timeout: 60_000 }).toBe('broken');
    // estado de sesión: tras perder y reintentar, generador y puerta rota se conservan
    await D(page, 'lose');
    await stateIs(page, 'over');
    await page.locator('#am-end [data-retry]').click();
    await stateIs(page, 'play');
    s = await H(page);
    expect(s.world.gens[0].restored).toBe(true);
    expect(s.world.doors.find(d => d.id === 1).state).toBe('broken');
    expect(s.missions.current.find(m => m.id === 'generadores').progress).toBe(1);
    expectNoErrors(errors);
  });

  test('caja de suministros: E la abre con animación, suelta chatarra que se junta y queda abierta en la sesión', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await calm(page); await D(page, 'invulnerable', true);
    const crates = (await H(page)).world.crates;
    const idx = crates.findIndex(c => Math.abs(c.x + 1) < 0.5 && Math.abs(c.z - 12) < 0.5);
    expect(idx).toBeGreaterThanOrEqual(0);
    const c = crates[idx];
    const scrap0 = (await H(page)).player.scrap;
    await D(page, 'face', c.x, c.z, 1.7);
    expect((await H(page)).interaction.kind).toBe('crate');
    await page.keyboard.press('KeyE');
    await D(page, 'simulate', 0.2);
    const s = await H(page);
    expect(s.world.crates[idx].opened).toBe(true);
    expect(s.counts.pickups).toBeGreaterThan(2);
    await D(page, 'simulate', 3);
    expect((await H(page)).player.scrap).toBeGreaterThan(scrap0 + 2);
    // ya abierta: no ofrece abrirla otra vez, y sigue abierta tras reintentar
    expect((await H(page)).interaction?.kind).not.toBe('crate');
    await D(page, 'lose'); await stateIs(page, 'over');
    await page.locator('#am-end [data-retry]').click(); await stateIs(page, 'play');
    expect((await H(page)).world.crates[idx].opened).toBe(true);
    expectNoErrors(errors);
  });

  test('trampa activable: sin energía no arranca; con energía E la arma, se activa, mata mutantes en la zona y entra en recarga', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await calm(page); await D(page, 'invulnerable', true);
    const t = (await H(page)).world.traps[0];
    await D(page, 'restoreGen', 0); await D(page, 'simulate', 1.5); await D(page, 'clearEnemies');
    await D(page, 'face', t.cx, t.cz, 1.4);
    let it = (await H(page)).interaction;
    expect(it.kind).toBe('trap'); expect(it.ok).toBe(false);
    await page.keyboard.press('KeyE'); await D(page, 'simulate', 0.3);
    expect((await H(page)).world.traps[0].state).toBe('idle');
    await D(page, 'restoreGen', 1); await D(page, 'simulate', 0.5); await D(page, 'clearEnemies');
    await D(page, 'face', t.cx, t.cz, 1.4);
    it = (await H(page)).interaction;
    expect(it.kind).toBe('trap'); expect(it.ok).toBe(true);
    await page.keyboard.press('KeyE'); await D(page, 'simulate', 0.2);
    expect((await H(page)).world.traps[0].state).toBe('arming');
    await D(page, 'simulate', 1.0);
    expect((await H(page)).world.traps[0].state).toBe('active');
    await D(page, 'spawnAt', 'runner', t.x, t.z, { speed: 0 });
    await D(page, 'spawnAt', 'spitter', t.x + 1, t.z + 0.5, { speed: 0 });
    const k0 = (await H(page)).score;
    await D(page, 'simulate', 3);
    expect((await H(page)).counts.runner).toBe(0);
    expect((await H(page)).score).toBeGreaterThan(k0);
    await D(page, 'simulate', 6);
    expect((await H(page)).world.traps[0].state).toBe('cooldown');
    expect((await H(page)).missions.current.find(m => m.id === 'trampas').progress).toBe(1);
    expectNoErrors(errors);
  });

  test('barricada (F) frena y se daña; banco de trabajo: E abre el menú y la tecla 1 compra una mejora de daño', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await calm(page); await D(page, 'invulnerable', true);
    await D(page, 'setScrap', 30);
    // energizar el ala oeste y sellar su puerta (2 celdas) con una barricada
    await D(page, 'restoreGen', 0); await D(page, 'simulate', 1.2); await D(page, 'clearEnemies');
    const d1 = (await H(page)).world.doors.find(d => d.id === 1);
    await D(page, 'teleport', d1.x + 1.9, d1.z); await D(page, 'look', -Math.PI / 2, 0);
    await page.keyboard.press('KeyF'); await D(page, 'simulate', 0.2);
    let s = await H(page);
    expect(s.world.barricades).toHaveLength(1);
    expect(s.player.scrap).toBe(26);
    const b = s.world.barricades[0];
    await D(page, 'spawnAt', 'runner', b.x - 5, b.z, { cd: 99 });
    await D(page, 'teleport', b.x + 5, b.z);
    await D(page, 'simulate', 4);
    s = await H(page);
    expect(s.world.barricades[0].hp).toBeLessThan(170);
    const r = (await D(page, 'enemies'))[0];
    expect(r.x).toBeLessThan(b.x); // no pasó
    expect(s.missions.current.find(m => m.id === 'barricadas').progress).toBe(1);
    await D(page, 'clearEnemies');
    const wb = s.world.workbench;
    await D(page, 'face', wb.x, wb.z, 1.8);
    expect((await H(page)).interaction.kind).toBe('bench');
    await page.keyboard.press('KeyE');
    await stateIs(page, 'craft');
    await expect(page.locator('#am-craft')).toBeVisible();
    await page.keyboard.press('Digit1');
    await expect.poll(async () => (await H(page)).player.up.dmg).toBe(1);
    expect((await H(page)).player.scrap).toBe(20);
    await page.keyboard.press('KeyE');
    await stateIs(page, 'play');
    await expect(page.locator('#am-craft')).toBeHidden();
    // daño real del rifle mejorado (por disparo): 18 en vez de 14, contra un bruto quieto de espaldas (×1,6)
    expect((await H(page)).player.dmg).toBe(18);
    await D(page, 'teleport', 3, 10); await D(page, 'look', Math.PI, 0);
    await D(page, 'spawnAt', 'brute', 3, 4, { frozen: true, yaw: Math.PI });
    const e = (await D(page, 'enemies'))[0];
    await D(page, 'face', e.x, e.z, 6, 1.15);
    const sh0 = (await H(page)).player.shots;
    await page.keyboard.down('KeyJ'); await D(page, 'simulate', 0.05); await page.keyboard.up('KeyJ');
    const shots = (await H(page)).player.shots - sh0;
    const per = (e.hp - (await D(page, 'enemies'))[0].hp) / shots;
    expect(shots).toBeGreaterThan(0);
    expect(per).toBeGreaterThan(18 * 1.6 - 0.1);
    expectNoErrors(errors);
  });

  test('mutantes con aviso y contrajuego: corredor salta tras agacharse (rodar lo esquiva), bruto blindado, escupidor con zona, acechador invisible revelado', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await calm(page);
    await D(page, 'teleport', -1, 4); await D(page, 'look', Math.PI, 0);
    // corredor: wind (aviso) antes del salto; rodar durante el salto evita el daño
    await D(page, 'spawn', 'runner', 4.5, { cd: 0 });
    await expect.poll(async () => { await D(page, 'simulate', 0.05); return (await D(page, 'enemies'))[0].state; }, { timeout: 30_000 }).toBe('wind');
    expect((await H(page)).hp).toBe(100);
    await expect.poll(async () => { await D(page, 'simulate', 0.05); return (await D(page, 'enemies'))[0].state; }, { timeout: 30_000 }).toBe('leap');
    await page.keyboard.press('Space');
    await D(page, 'simulate', 0.3);
    expect((await H(page)).hp).toBe(100);
    await D(page, 'clearEnemies'); await D(page, 'simulate', 2);
    // bruto: de frente el blindaje reduce el daño; de espaldas recibe ×1,6
    await D(page, 'teleport', 3, 10); await D(page, 'look', Math.PI, 0); await D(page, 'invulnerable', true);
    // bruto quieto (congelado sólo para medir) mirando al jugador (+z)
    await D(page, 'spawnAt', 'brute', 3, 3, { frozen: true, yaw: 0 });
    let e = (await D(page, 'enemies'))[0];
    await D(page, 'face', e.x, e.z, 7, 1.15);
    /** daño promedio por disparo con J (el loop real también puede disparar mientras la tecla está abajo) */
    const perShot = async () => {
      const hpA = (await D(page, 'enemies'))[0].hp, shA = (await H(page)).player.shots;
      await page.keyboard.down('KeyJ'); await D(page, 'simulate', 0.05); await page.keyboard.up('KeyJ');
      const n = (await H(page)).player.shots - shA;
      return n ? (hpA - (await D(page, 'enemies'))[0].hp) / n : 0;
    };
    const front = await perShot();
    expect(front).toBeGreaterThan(0); expect(front).toBeLessThan(8);
    await D(page, 'teleport', 3, -3);
    await D(page, 'face', e.x, e.z, 6, 1.15);
    await D(page, 'simulate', 0.3);
    const back = await perShot();
    expect(back).toBeGreaterThan(front * 3);
    await D(page, 'clearEnemies');
    // embestida: línea de aviso y aturdido al chocar contra la pared
    await D(page, 'teleport', 3, -4);
    await D(page, 'spawnAt', 'brute', 3, 9, { cd2: 0 });
    await expect.poll(async () => { await D(page, 'simulate', 0.1); return (await D(page, 'enemies'))[0].state; }, { timeout: 30_000 }).toBe('cwind');
    expect((await H(page)).counts.telegraphs).toBeGreaterThan(0);
    await D(page, 'teleport', 6, -3);
    await expect.poll(async () => { await D(page, 'simulate', 0.1); return (await D(page, 'enemies'))[0].state; }, { timeout: 30_000 }).toBe('stun');
    await D(page, 'clearEnemies');
    // escupidor: marca la zona antes de que caiga el ácido y deja un charco
    await D(page, 'teleport', -1, 6);
    await D(page, 'spawnAt', 'spitter', -1, -5, { cd: 0 });
    await expect.poll(async () => { await D(page, 'simulate', 0.1); return (await D(page, 'enemies'))[0].state; }, { timeout: 30_000 }).toBe('wind');
    expect((await H(page)).counts.telegraphs).toBeGreaterThan(0);
    await expect.poll(async () => { await D(page, 'simulate', 0.2); return (await H(page)).counts.puddles; }, { timeout: 30_000 }).toBeGreaterThan(0);
    await D(page, 'clearEnemies');
    // acechador: casi invisible; un tiro lo revela
    await D(page, 'teleport', -1, 6);
    await D(page, 'spawnAt', 'stalker', 3, -1, { speed: 0 });
    await D(page, 'simulate', 0.5);
    e = (await D(page, 'enemies'))[0];
    expect(e.alpha).toBeLessThan(0.2);
    await D(page, 'face', e.x, e.z, 8, 1.2);
    await page.keyboard.down('KeyJ'); await D(page, 'simulate', 0.05); await page.keyboard.up('KeyJ');
    await D(page, 'simulate', 0.4);
    e = (await D(page, 'enemies'))[0];
    expect(e.revealed).toBeGreaterThan(1);
    expect(e.alpha).toBeGreaterThan(0.8);
    expectNoErrors(errors);
  });

  test('escenarios: búnker → estación → laboratorio cargan y se encadenan sin romperse', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await D(page, 'invulnerable', true); await calm(page);
    for (const i of [0, 1, 2]) await D(page, 'restoreGen', i);
    await D(page, 'simulate', 1.5); await D(page, 'clearEnemies');
    let s = await H(page);
    expect(s.sec.stage).toBe('lift');
    expect(s.world.doors.find(d => d.exit).state).toBe('open');
    await D(page, 'teleport', s.world.exit.x, s.world.exit.z + 3); await D(page, 'simulate', 0.4);
    await D(page, 'teleport', s.world.exit.x, s.world.exit.z); await D(page, 'simulate', 0.2);
    await stateIs(page, 'clear');
    await page.locator('#am-clear [data-next]').click();
    await stateIs(page, 'play');
    s = await H(page);
    expect(s.scene).toBe('estacion');
    expect(s.world.survivor).toMatchObject({ alive: true, freed: false });
    await D(page, 'invulnerable', true);
    for (let w = 0; w < 6; w++) { await D(page, 'waveSkip'); await D(page, 'simulate', 0.2); await D(page, 'clearEnemies'); await D(page, 'simulate', 0.3); }
    s = await H(page);
    expect(s.sec.wave).toBe(6); expect(s.sec.stage).toBe('exit');
    expect(s.missions.current.find(m => m.id === 'oleadas').status).toBe('done');
    await D(page, 'teleport', s.world.exit.x, s.world.exit.z + 3); await D(page, 'simulate', 0.4);
    await D(page, 'teleport', s.world.exit.x, s.world.exit.z + 0.5); await D(page, 'simulate', 0.2);
    await stateIs(page, 'clear');
    await wait(page, 900);
    await page.keyboard.press('Enter');
    await stateIs(page, 'play');
    s = await H(page);
    expect(s.scene).toBe('laboratorio');
    expect(s.sec.stage).toBe('power');
    expect(s.campaign.unlocked).toBe(3);
    expectNoErrors(errors);
  });

  test('misiones: principal (generadores) y secundaria (barricadas) completas persisten tras recargar', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await calm(page); await D(page, 'invulnerable', true);
    for (const i of [0, 1, 2]) await D(page, 'restoreGen', i);
    await D(page, 'setScrap', 40); await D(page, 'clearEnemies');
    const spots = [[-5, 10], [3, 10], [5, 4]];
    for (const [x, z] of spots) { await D(page, 'teleport', x, z); await D(page, 'look', Math.PI, 0); await page.keyboard.press('KeyF'); await D(page, 'simulate', 0.1); }
    const m = (await H(page)).missions.current;
    expect(m.find(x => x.id === 'generadores').status).toBe('done');
    expect(m.find(x => x.id === 'barricadas').status).toBe('done');
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__arena_mutante; return h && h.state === 'menu'; });
    const s = await H(page);
    expect(s.campaign.campaign.generadores).toBe(true);
    expect(s.campaign.unlocked).toBeGreaterThanOrEqual(1);
    expect(s.missions.achievements.done.generadores).toBeGreaterThanOrEqual(1);
    expect(s.missions.achievements.done.barricadas).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#am-menu .am-camp')).toContainText('✅ Restablecer tres generadores');
    expectNoErrors(errors);
  });

  test('guardado corrupto: se recupera (JSON roto, tipos inválidos) y migra la versión 1', async ({ page }) => {
    await page.addInitScript(k => { if (!sessionStorage.getItem('am-once')) { sessionStorage.setItem('am-once', '1'); localStorage.setItem(k, '{roto!!'); } }, KEY);
    const { errors } = await open(page, '', { tutorial: true });
    let s = await H(page);
    expect(s.campaign.unlocked).toBe(1);
    expect(await page.evaluate(k => localStorage.getItem(k + ':corrupto'), KEY)).toBe('{roto!!');
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 2, d: { unlocked: 'muchas', best: -5, campaign: 'x', settings: { sens: 99, invertY: 'si', autoAim: 'laser' } } })), KEY);
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__arena_mutante; return h && h.state === 'menu'; });
    s = await H(page);
    expect(s.campaign.unlocked).toBe(1);
    expect(s.campaign.best).toBe(0);
    expect(s.campaign.campaign).toEqual({ generadores: false, oleadas: false, extraccion: false });
    expect(s.campaign.settings.sens).toBe(2);
    expect(s.campaign.settings.invertY).toBe(false);
    expect(['off', 'suave', 'fuerte']).toContain(s.campaign.settings.autoAim);
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 1, d: { arena: 2, best: 1234, tutorial: true } })), KEY);
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__arena_mutante; return h && h.state === 'menu'; });
    s = await H(page);
    expect([s.campaign.unlocked, s.campaign.best, s.campaign.settings.tutorialDone]).toEqual([2, 1234, true]);
    await page.keyboard.press('Enter');
    await stateIs(page, 'play');
    expectNoErrors(errors);
  });

  test('dificultad: el selector cambia daño, vida y presupuesto reales', async ({ page }) => {
    const { errors } = await open(page);
    await page.locator('#am-menu .mlm-diff [data-d="extremo"]').click();
    await expect(page.locator('#am-menu [data-dfx]')).toContainText('+75%');
    await page.locator('#am-menu [data-go]').click();
    await stateIs(page, 'play');
    const s = await H(page);
    expect(s.difficulty.id).toBe('extremo');
    expect(s.difficulty.enemyDmg).toBe(1.75);
    await calm(page);
    await D(page, 'spawn', 'runner', 8);
    expect((await D(page, 'enemies'))[0].hp).toBeCloseTo(48, 0);
    // daño real recibido: golpe de corredor 12 × 1,75
    await D(page, 'clearEnemies');
    await page.evaluate(() => localStorage.setItem('ml:difficulty', JSON.stringify({ arena_mutante: 'facil' })));
    await page.reload();
    await until(page, () => { const h = /** @type {any} */ (window).__arena_mutante; return h && h.state === 'menu'; });
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    const f = await H(page);
    expect(f.difficulty.id).toBe('facil');
    expect(f.difficulty.telegraph).toBeGreaterThan(s.difficulty.telegraph);
    await calm(page);
    await D(page, 'spawn', 'runner', 8);
    expect((await D(page, 'enemies'))[0].hp).toBeCloseTo(22.5, 0);
    expectNoErrors(errors);
  });

  test('calidad: baja y alta cambian partículas, decorado, luces, sombras y triángulos', async ({ page }) => {
    const res = {};
    for (const q of ['low', 'high']) {
      await page.addInitScript(qq => { localStorage.setItem('ml:settings', JSON.stringify({ quality: qq })); }, q);
      await open(page, '');
      await wait(page, 700);
      res[q] = await H(page);
    }
    expect(res.low.quality).toBe('low');
    expect(res.high.quality).toBe('high');
    expect(res.high.counts.particleCap).toBeGreaterThan(res.low.counts.particleCap * 3);
    expect(res.high.counts.props).toBeGreaterThan(res.low.counts.props);
    expect(res.high.counts.lights).toBeGreaterThan(res.low.counts.lights);
    expect(res.high.counts.shadows).toBe(true);
    expect(res.low.counts.shadows).toBe(false);
    expect(res.high.perf.tris).toBeGreaterThan(res.low.perf.tris);
  });

  test('jefe: intro, fase 1 (tanques), fase 2 (marea tóxica + núcleo), fase 3 (salto) y destruye coberturas', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await D(page, 'goto', 2);
    await D(page, 'invulnerable', true);
    await D(page, 'spawnBoss'); await D(page, 'simulate', 0.2);
    let s = await H(page);
    expect(s.state).toBe('cine');
    expect(s.boss.state).toBe('intro');
    await D(page, 'simulate', 4);
    s = await H(page);
    expect(s.state).toBe('play');
    expect(s.boss).toMatchObject({ phase: 1, state: 'fight', tanks: 3 });
    // el cuerpo blindado casi no recibe daño
    const bar0 = s.boss.bar;
    await D(page, 'bossDamage', 'body', 100);
    expect((await H(page)).boss.bar).toBeGreaterThan(bar0 - 0.02);
    // pisotón: anillo de aviso antes del golpe
    await D(page, 'bossAttack', 'stomp'); await D(page, 'simulate', 0.1);
    expect((await H(page)).boss.atk).toBe('stomp');
    expect((await H(page)).counts.telegraphs).toBeGreaterThan(0);
    await D(page, 'simulate', 1.5);
    // si te escondés, rompe la cobertura
    const covers0 = (await H(page)).counts.covers;
    const cv = (await H(page)).world.covers[0];
    await D(page, 'teleport', cv.x + 1.6, cv.z);
    await D(page, 'bossAttack', 'hide'); await D(page, 'simulate', 3.5);
    expect((await H(page)).boss.covers).toBeGreaterThan(0);
    expect((await H(page)).counts.covers).toBeLessThan(covers0);
    // fase 2: sin tanques → marea tóxica que altera la arena (aviso amarillo → tóxico)
    await D(page, 'bossDamage', 'tanks', 99999);
    s = await H(page);
    expect(s.boss.phase).toBe(2);
    await D(page, 'bossAttack', 'tide'); await D(page, 'simulate', 0.3);
    expect((await H(page)).boss.tides).toContain('warn');
    await D(page, 'simulate', 3);
    expect((await H(page)).boss.tides).toContain('toxic');
    await D(page, 'bossAttack', 'beam'); await D(page, 'simulate', 0.2);
    expect((await H(page)).boss.atk).toBe('beam');
    await D(page, 'simulate', 3.5);
    // fase 3: furia con salto aplastante
    const core0 = (await H(page)).boss.coreHp;
    await D(page, 'bossDamage', 'core', core0 * 0.6);
    expect((await H(page)).boss.phase).toBe(3);
    await D(page, 'bossAttack', 'leap'); await D(page, 'simulate', 0.2);
    expect((await H(page)).boss.atk).toBe('leap');
    await D(page, 'simulate', 2);
    await D(page, 'bossDamage', 'core', 999999);
    await D(page, 'simulate', 3);
    s = await H(page);
    expect(s.boss.state).toBe('dead');
    expect(s.sec.stage).toBe('descend');
    expectNoErrors(errors);
  });

  test('derrota: vida cero y extracción fallida (baliza destruida) muestran su pantalla; reintentar vuelve a la arena', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await calm(page);
    await D(page, 'damage', 500);
    await stateIs(page, 'over');
    await expect(page.locator('#am-end h1')).toHaveText('CAÍSTE');
    expect((await sdk(page)).telemetry).toContain('end');
    await wait(page, 700);
    await page.keyboard.press('Enter');
    await stateIs(page, 'play');
    expect((await H(page)).hp).toBe(100);
    await D(page, 'goto', 2);
    await D(page, 'invulnerable', true);
    await D(page, 'callExtraction'); await D(page, 'setEta', 500); await D(page, 'simulate', 0.5);
    expect((await H(page)).world.beacon.active).toBe(true);
    await D(page, 'clearEnemies');
    const bc = (await H(page)).world.pad;
    await D(page, 'spawnAt', 'brute', bc.x + 6, bc.z, { target: 'beacon' });
    await D(page, 'spawnAt', 'brute', bc.x + 5, bc.z + 1.5, { target: 'beacon' });
    await D(page, 'teleport', bc.x - 12, bc.z + 10);
    await expect.poll(async () => { await D(page, 'simulate', 2); return (await H(page)).state; }, { timeout: 90_000 }).toBe('over');
    await expect(page.locator('#am-end h1')).toHaveText('EXTRACCIÓN FALLIDA');
    await page.locator('#am-end [data-menu]').click();
    await stateIs(page, 'menu');
    expectNoErrors(errors);
  });

  test('victoria: derrotar al Coloso, esperar el transporte y subir', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await D(page, 'goto', 2);
    await D(page, 'invulnerable', true);
    await D(page, 'spawnBoss'); await D(page, 'simulate', 4.5);
    await D(page, 'bossDamage', 'tanks', 99999);
    await D(page, 'bossDamage', 'core', 999999);
    await D(page, 'simulate', 3);
    await D(page, 'clearEnemies');
    await D(page, 'simulate', 6.5);
    expect((await H(page)).sec.stage).toBe('board');
    await D(page, 'board'); await D(page, 'simulate', 0.2);
    await stateIs(page, 'victory');
    await expect(page.locator('#am-end')).toContainText('ESCAPASTE');
    const s = await H(page);
    expect(s.campaign.trophy).toBe(true);
    expect(s.missions.current.find(m => m.id === 'extraccion').status).toBe('done');
    expect((await sdk(page)).telemetry).toContain('end');
    expectNoErrors(errors);
  });

  test('superviviente y antídoto: liberarlo, que siga al jugador y salvarlo; romper la rejilla y tomar el antídoto', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await D(page, 'goto', 1);
    await D(page, 'invulnerable', true); await calm(page);
    let s = await H(page);
    const sv = s.world.survivor;
    // la cabina está cerrada: el aviso explica que falta energía
    await D(page, 'teleport', sv.x, sv.z + 3.5); await D(page, 'look', Math.PI, 0);
    expect((await H(page)).interaction).toMatchObject({ kind: 'survivor', ok: false });
    await D(page, 'restoreGen', 0); await D(page, 'simulate', 1.5); await D(page, 'clearEnemies');
    await D(page, 'teleport', sv.x, sv.z + 2.2);
    expect((await H(page)).interaction).toMatchObject({ kind: 'survivor', ok: true });
    await page.keyboard.press('KeyE'); await D(page, 'simulate', 0.2);
    expect((await H(page)).world.survivor.following).toBe(true);
    await D(page, 'teleport', 0, 4); await D(page, 'simulate', 6);
    s = await H(page);
    expect(Math.hypot(s.world.survivor.x - s.player.x, s.world.survivor.z - s.player.z)).toBeLessThan(6);
    // salvar: completar las oleadas y salir con él
    for (let w = 0; w < 6; w++) { await D(page, 'waveSkip'); await D(page, 'simulate', 0.2); await D(page, 'clearEnemies'); await D(page, 'simulate', 0.3); }
    s = await H(page);
    await D(page, 'teleport', s.world.exit.x, s.world.exit.z + 3); await D(page, 'simulate', 0.3);
    await D(page, 'teleport', s.world.exit.x, s.world.exit.z + 0.5); await D(page, 'simulate', 0.2);
    await stateIs(page, 'clear');
    s = await H(page);
    expect(s.missions.current.find(m => m.id === 'superviviente').status).toBe('done');
    // antídoto escondido tras la rejilla del laboratorio
    await page.locator('#am-clear [data-next]').click(); await stateIs(page, 'play');
    await D(page, 'invulnerable', true); await calm(page);
    s = await H(page);
    const gr = s.world.grate, an = s.world.antidote;
    await D(page, 'face', gr.x, gr.z, 5, 1.5);
    expect((await H(page)).interaction?.kind).not.toBe('antidote');
    await page.keyboard.down('KeyJ'); await D(page, 'simulate', 0.6); await page.keyboard.up('KeyJ');
    expect((await H(page)).world.grate.broken).toBe(true);
    await D(page, 'face', an.x, an.z, 1.2);
    expect((await H(page)).interaction.kind).toBe('antidote');
    await page.keyboard.press('KeyE'); await D(page, 'simulate', 0.2);
    s = await H(page);
    expect(s.world.antidote.taken).toBe(true);
    expect(s.player.antidote).toBe(true);
    expect(s.missions.current.find(m => m.id === 'antidoto').status).toBe('done');
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanudar continúa y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await open(page);
    await startReal(page, isMobile);
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
    expect((await H(page)).sec.t - p2.sec.t).toBeLessThan(5);
    await D(page, 'spawn', 'runner', 8); await D(page, 'killAll');
    await D(page, 'setScrap', 9);
    await D(page, 'restoreGen', 0);
    expect((await H(page)).score).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    const z = await H(page);
    expect(z.score).toBe(0);
    expect(z.sec.t).toBeLessThan(1);
    expect(z.counts.enemies).toBe(0);
    expect(z.hp).toBe(100);
    expect(z.world.gens[0].restored).toBe(false);
    expect(z.player.scrap).toBe(0);
    expect(z.state).toBe('play');
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y apaisado', async ({ page }) => {
    const { errors } = await open(page);
    await page.keyboard.press('Enter'); await stateIs(page, 'play');
    await D(page, 'goto', 2); await D(page, 'invulnerable', true);
    await D(page, 'spawnBoss'); await D(page, 'simulate', 4.5);
    const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    for (const vp of [{ width: 412, height: 915 }, { width: 915, height: 412 }]) {
      await page.setViewportSize(vp);
      await wait(page, 500);
      const m = await page.evaluate(() => {
        const sels = ['.am-status', '.am-obj', '.mla-bar'];
        const touch = !document.querySelector('.k3-touch')?.hasAttribute('hidden');
        if (touch) sels.push('.k3-joy', '.k3-btns', '.am-rstick');
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

  test('táctil: stick izquierdo mueve, stick derecho apunta y FUEGO/RODAR responden', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    const { errors } = await open(page);
    await startReal(page, true);
    await D(page, 'invulnerable', true); await calm(page);
    await expect(page.locator('.k3-joy')).toBeVisible();
    await expect(page.locator('.am-rstick')).toBeVisible();
    const a = await H(page);
    const cdp = await page.context().newCDPSession(page);
    const joy = await page.locator('.k3-joy').boundingBox();
    const jx = joy.x + joy.width / 2, jy = joy.y + joy.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jx, y: jy - 50, id: 1 }] });
    await expect.poll(async () => { const p = (await H(page)).player; return Math.hypot(p.x - a.player.x, p.z - a.player.z); }, { timeout: 30_000 }).toBeGreaterThan(1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const rs = await page.locator('.am-rstick').boundingBox();
    const rx = rs.x + rs.width / 2, ry = rs.y + rs.height / 2;
    const y0 = (await H(page)).player.yaw;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rx, y: ry, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rx + 55, y: ry, id: 2 }] });
    await expect.poll(async () => Math.abs((await H(page)).player.yaw - y0), { timeout: 30_000 }).toBeGreaterThan(0.3);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const fire = await page.locator('.k3-btn[aria-label="fire"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x + 30, y: fire.y + 30, id: 3 }] });
    await expect.poll(async () => (await H(page)).player.shots, { timeout: 30_000 }).toBeGreaterThan(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const roll = await page.locator('.k3-btn[aria-label="roll"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: roll.x + 30, y: roll.y + 30, id: 4 }] });
    await expect.poll(async () => (await H(page)).player.rolls, { timeout: 30_000 }).toBeLessThan(2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expectNoErrors(errors);
  });
});
