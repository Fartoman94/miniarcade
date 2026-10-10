// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait } from './helpers.js';

// Corsarios del Abismo (Three.js 0.186). En headless el WebGL es SwiftShader (CPU) y el juego corre a pocos FPS:
// las esperas son por condición (expect.poll) y los tramos de juego usan simulate() determinista (?debug)
// mientras las teclas/toques reales siguen apretados: la entrada es real y el tiempo de juego es fijo.

const FILE = 'corsarios_abismo.html';
const DBG = 'corsarios_abismo.html?debug';
const T = (page, body) => page.evaluate(`(()=>{ const T = window.__corsarios_abismo; ${body} })()`);
const D = (page, call) => page.evaluate(`window.__corsarios_abismo.debug.${call}`);
const POLL = { timeout: 60_000 };

async function ready(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__corsarios_abismo?.state === 'menu' && /** @type {any} */ (window).__corsarios_abismo.perf.frames > 1, null, { timeout: 60_000 });
}
/** Arranca desde el menú con entrada real (Enter en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#ca-menu [data-go]').tap();
  else { await page.locator('#ca-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => T(page, 'return T.state'), POLL).toBe('sail');
}
/** Arranque real y luego loop detenido: el juego sólo avanza con simulate() (determinista incluso en CI lento). */
async function startDet(page, isMobile) { await start(page, isMobile); await D(page, 'loop(false)'); }
async function sim(page, sec) { await D(page, `simulate(${sec})`); }
async function hold(page, key, sec) { await page.keyboard.down(key); await sim(page, sec); await page.keyboard.up(key); }
async function press(page, key, isMobile, btn) { if (isMobile && btn) await page.locator(`.k3-btn[aria-label="${btn}"]`).tap(); else await page.keyboard.press(key); await sim(page, 0.05); }
const cdps = new WeakMap();
async function touch(page, type, pts) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
}
async function center(page, sel) { const b = /** @type {any} */ (await page.locator(sel).boundingBox()); return [b.x + b.width / 2, b.y + b.height / 2]; }
/** Mantiene ACCIÓN (tecla real o botón táctil real) durante un tramo simulado. */
async function holdAct(page, isMobile, sec) {
  if (isMobile) { const c = await center(page, '.k3-btn[aria-label="act"]'); await touch(page, 'touchStart', [c]); await sim(page, sec); await touch(page, 'touchEnd', []); }
  else await hold(page, 'Space', sec);
}
const act = (page, isMobile) => press(page, 'Space', isMobile, 'act');

test.describe('Corsarios del Abismo', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(240_000); });

  test('carga sin errores: menú con crédito, dificultad y bahía 3D de fondo', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#ca-menu h1')).toContainText('CORSARIOS DEL ABISMO');
    await expect(page.locator('#ca-menu .ca-credit')).toContainText('CREADO POR');
    await expect(page.locator('#ca-menu [role=radiogroup] [role=radio][data-d]')).toHaveCount(4);
    const s = await T(page, 'return { calls: T.perf.calls, scene: T.scene, isl: T.counts.islands, verts: T.counts.waterVerts }');
    expect(s.scene).toBe('Bahía del Contrabandista');
    expect(s.isl).toBe(8);
    expect(s.verts).toBeGreaterThan(5000);
    expect(s.calls).toBeGreaterThan(8);
    expect(s.calls).toBeLessThan(150);
    expectNoErrors(errors);
  });

  test('arranque con entrada real: velas con inercia, timón y andanadas por banda', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type))).toContain('start');
    await expect(page.locator('#ca-status')).toBeVisible();
    await D(page, 'freeze(true)');
    await D(page, 'teleport(0,0,0)');
    if (isMobile) {
      const j = await center(page, '.k3-joy');
      await touch(page, 'touchStart', [[j[0], j[1]]]); await touch(page, 'touchMove', [[j[0], j[1] - 60]]);
      await sim(page, 1.0);
      await touch(page, 'touchEnd', []);
    } else await hold(page, 'KeyW', 1.0);
    const p1 = await T(page, 'return T.player');
    expect(p1.sail).toBeGreaterThan(0.5);
    expect(p1.sailCur).toBeLessThan(p1.sail); // las velas tardan en desplegarse (inercia)
    // inercia: con todo el trapo arriba el barco tarda en tomar velocidad
    await D(page, 'setSail(1)'); await D(page, 'setSpeed(0)'); await sim(page, 0.5);
    expect(await T(page, 'return T.player.speed')).toBeLessThan(7);
    await sim(page, 6);
    const p2 = await T(page, 'return T.player');
    expect(p2.speed).toBeGreaterThan(10);
    // timón a estribor: el rumbo cambia
    if (isMobile) {
      const j = await center(page, '.k3-joy');
      await touch(page, 'touchStart', [[j[0], j[1]]]); await touch(page, 'touchMove', [[j[0] + 60, j[1]]]);
      await sim(page, 1.5); await touch(page, 'touchEnd', []);
    } else await hold(page, 'KeyD', 1.5);
    const p3 = await T(page, 'return T.player');
    expect(p3.yaw).toBeLessThan(p2.yaw - 0.3);
    // andanadas: cada banda recarga por separado
    await press(page, 'KeyQ', isMobile, 'port');
    let r = await T(page, 'return T.player.reload');
    expect(r.L).toBeGreaterThan(1.5); expect(r.R).toBe(0);
    await press(page, 'KeyE', isMobile, 'star');
    r = await T(page, 'return T.player.reload');
    expect(r.R).toBeGreaterThan(1.5);
    expect(await T(page, 'return T.counts.balls')).toBeGreaterThanOrEqual(3);
    await sim(page, 3);
    expect(await T(page, 'return T.player.reload')).toEqual({ L: 0, R: 0 });
    expectNoErrors(errors);
  });

  test('tutorial contextual: aparece, se salta y se reactiva desde la ayuda de la pausa', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => T(page, 'return T.tip'), POLL).toBe('sail');
    await expect(page.locator('#ca-tip')).toBeVisible();
    await expect(page.locator('#ca-tip')).toContainText(isMobile ? 'TIMÓN' : 'velas');
    const skip = page.locator('#ca-tip [data-t="skip"]');
    if (isMobile) await skip.tap(); else await skip.click();
    await expect(page.locator('#ca-tip')).toBeHidden();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'Cómo jugar' }).click();
    await expect(page.locator('#ca-help')).toBeVisible();
    await page.locator('#ca-help [data-retut]').click();
    expect(await T(page, 'return T.save.tutorial')).toEqual({ off: false, seen: {} });
    expectNoErrors(errors);
  });

  test('muelle y mercado: atracar con ACCIÓN, comprar, zarpar y el muelle queda iluminado', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    await D(page, 'freeze(true)');
    await D(page, 'teleport(4,-36,3.14)'); await sim(page, 0.2);
    expect(await T(page, 'return T.action')).toContain('Atracar');
    await act(page, isMobile);
    expect(await T(page, 'return T.state')).toBe('docked');
    await sim(page, 1.5);
    await expect(page.locator('#ca-market')).toBeVisible();
    await D(page, 'gold(500)'); await D(page, 'hurt(30)');
    await page.locator('#ca-market [data-leave]').click(); // reabrir con oro actualizado: zarpar y volver a atracar
    expect(await T(page, 'return T.state')).toBe('sail');
    await D(page, 'teleport(4,-36,3.14)'); await sim(page, 0.1); await act(page, isMobile); await sim(page, 1.5);
    await expect(page.locator('#ca-market')).toBeVisible();
    const before = await T(page, 'return { gold: T.gold, kits: T.save.kits, hp: T.hp }');
    const buy = id => isMobile ? page.locator(`#ca-market [data-buy="${id}"]`).tap() : page.locator(`#ca-market [data-buy="${id}"]`).click();
    await buy('kit'); await buy('hull'); await buy('cannons');
    const after = await T(page, 'return { gold: T.gold, kits: T.save.kits, hp: T.hp, max: T.maxHp, balls: T.player.balls, up: T.save.up }');
    expect(after.kits).toBe(before.kits + 1);
    expect(after.hp).toBe(after.max);
    expect(after.balls).toBe(4);
    expect(after.up.cannons).toBe(1);
    expect(after.gold).toBeLessThan(before.gold - 150);
    const leave = page.locator('#ca-market [data-leave]'); if (isMobile) await leave.tap(); else await leave.click();
    expect(await T(page, 'return T.state')).toBe('sail');
    expect(await T(page, 'return T.interactions.docks[0]')).toMatchObject({ visited: true, lit: true, docked: false });
    expect(await T(page, 'return T.save.regions.bahia.dock')).toBe(true);
    expectNoErrors(errors);
  });

  test('cañones de costa: mortero telegrafiado, destrucción a cañonazos y sabotaje a pie; quedan destruidos', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    await D(page, 'freeze(true)');
    // Roca del Vigía (108,-58): barco al oeste, apuntando al norte → el cañón queda a babor (+x = izquierda)
    await D(page, 'teleport(80,-58,0)'); await D(page, 'freeze(false)'); await D(page, 'god(true)');
    await D(page, 'cannonFire("b_k2")'); await sim(page, 0.1);
    const c0 = (await T(page, 'return T.interactions.cannons')).find(c => c.id === 'b_k2');
    expect(c0.tele).toBe(true); expect(c0.seen).toBe(true);
    await sim(page, 4);
    for (let i = 0; i < 8; i++) {
      const c = (await T(page, 'return T.interactions.cannons')).find(c => c.id === 'b_k2');
      if (c.destroyed) break;
      await D(page, 'teleport(80,-58,0)');
      await press(page, 'KeyQ', isMobile, 'port'); await sim(page, 2.6);
    }
    expect((await T(page, 'return T.interactions.cannons')).find(c => c.id === 'b_k2').destroyed).toBe(true);
    // sabotaje a pie en Cayo Calavera
    await D(page, 'teleport(-86,29,0)'); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('Desembarcar');
    await act(page, isMobile);
    expect(await T(page, 'return T.state')).toBe('foot');
    await D(page, 'footTo(-83,52)'); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('Clavar');
    await holdAct(page, isMobile, 1.8);
    expect((await T(page, 'return T.interactions.cannons')).find(c => c.id === 'b_k1').destroyed).toBe(true);
    expect((await T(page, 'return T.save.regions.bahia.cannons')).sort()).toEqual(['b_k1', 'b_k2']);
    await page.reload(); await ready(page);
    expect((await T(page, 'return T.interactions.cannons')).every(c => c.destroyed)).toBe(true);
    expectNoErrors(errors);
  });

  test('tesoros enterrados y cofres: cavar con ACCIÓN mantenida da el fragmento; persiste tras recargar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    await D(page, 'freeze(true)');
    await D(page, 'teleport(62,24,0.8)'); await sim(page, 0.1);
    await act(page, isMobile);
    expect(await T(page, 'return T.state')).toBe('foot');
    // caminar con entrada real
    const f0 = await T(page, 'return T.foot');
    if (isMobile) { const j = await center(page, '.k3-joy'); await touch(page, 'touchStart', [[j[0], j[1]]]); await touch(page, 'touchMove', [[j[0], j[1] - 60]]); await sim(page, 0.8); await touch(page, 'touchEnd', []); }
    else await hold(page, 'KeyW', 0.8);
    const f1 = await T(page, 'return T.foot');
    expect(Math.hypot(f1.x - f0.x, f1.z - f0.z)).toBeGreaterThan(2);
    // cofre
    await D(page, 'footTo(71.5,31)'); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('cofre');
    const g0 = await T(page, 'return T.gold');
    await act(page, isMobile); await sim(page, 1);
    expect(await T(page, 'return T.gold')).toBeGreaterThan(g0);
    expect((await T(page, 'return T.interactions.chests')).find(c => c.id === 'b_c1')).toMatchObject({ opened: true });
    // tesoro: soltar antes de tiempo no alcanza
    await D(page, 'footTo(80.6,39.6)'); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('Cavar');
    await holdAct(page, isMobile, 0.5);
    expect((await T(page, 'return T.interactions.treasures'))[0].dug).toBe(false);
    await holdAct(page, isMobile, 1.4);
    await sim(page, 1.5);
    const t = (await T(page, 'return T.interactions.treasures'))[0];
    expect(t.dug).toBe(true); expect(t.chestUp).toBe(1);
    expect(await T(page, 'return T.fragments')).toBe(1);
    expect(await T(page, 'return T.interactions.gates[0].active')).toBe(true);
    await page.reload(); await ready(page);
    expect(await T(page, 'return T.save.fragments')).toBe(1);
    expect(await T(page, 'return T.interactions.treasures[0].dug')).toBe(true);
    expect(await T(page, 'return T.interactions.chests.find(c => c.id === "b_c1").opened')).toBe(true);
    expectNoErrors(errors);
  });

  test('rivales: goleta (aviso, rendición y abordaje), lancha (carril y embestida) y tiburón (aviso, mordida, salto)', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    // goleta: se pone de costado y avisa con troneras antes de disparar
    await D(page, 'teleport(-40,70,0)'); await D(page, 'placeEnemy(0,-12,70,0)');
    await expect.poll(async () => { await sim(page, 0.25); return T(page, 'const e = T.enemies[0]; return e.tele.L || e.tele.R'); }, POLL).toBe(true);
    expect(await T(page, 'return T.enemies[0].state')).toBe('engage');
    // rendición con poca vida y abordaje por sincronización
    await D(page, 'damageEnemy(0, 100)'); await sim(page, 0.1);
    expect(await T(page, 'return T.enemies[0].surrender')).toBe(true);
    await D(page, 'freeze(true)');
    const e = await T(page, 'return T.enemies[0]');
    await D(page, `teleport(${e.x + 7}, ${e.z}, ${e.yaw})`); await D(page, 'setSpeed(0)'); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('Abordar');
    await act(page, isMobile);
    expect(await T(page, 'return T.state')).toBe('board');
    await expect(page.locator('#ca-qte')).toBeVisible();
    for (let i = 0; i < 150 && (await T(page, 'return T.state')) === 'board'; i++) {
      const q = await T(page, 'return T.qte');
      if (q.needle >= q.zone[0] + 0.01 && q.needle <= q.zone[1] - 0.01) await act(page, isMobile); else await sim(page, 1 / 60);
    }
    expect(await T(page, 'return T.state')).toBe('sail');
    expect(await T(page, 'return T.enemies[0].boarded')).toBe(true);
    // lancha: carril telegrafiado y embestida
    await D(page, 'freeze(false)'); await D(page, 'god(true)');
    await D(page, 'teleport(60,60,0)'); await D(page, 'placeEnemy(1,60,85,3.14)'); await D(page, 'enemyState(1,"approach")');
    await expect.poll(async () => { await sim(page, 0.2); return T(page, 'return T.enemies[1].state'); }, POLL).toMatch(/aim|dash/);
    await expect.poll(async () => { await sim(page, 0.2); return T(page, 'return T.enemies[1].state'); }, POLL).toBe('dash');
    await D(page, 'god(false)');
    const hp0 = await T(page, 'return T.hp');
    await expect.poll(async () => { await sim(page, 0.1); return T(page, 'return T.enemies[1].state'); }, POLL).toBe('evade');
    expect(await T(page, 'return T.hp')).toBeLessThan(hp0);
    // tiburón (Bruma)
    await D(page, 'goto("bruma")'); await D(page, 'god(true)');
    await D(page, 'teleport(30,80,0)'); await D(page, 'placeShark(0,30,95)'); await sim(page, 0.5);
    expect(await T(page, 'return T.sharks[0].state')).toBe('circle');
    await D(page, 'sharkState(0,"tele",0.2)'); await D(page, 'god(false)');
    const h1 = await T(page, 'return T.hp');
    await expect.poll(async () => { await sim(page, 0.1); return T(page, 'return T.sharks[0].state'); }, POLL).toBe('surface');
    expect(await T(page, 'return T.sharks[0].exposed')).toBe(true);
    expect(await T(page, 'return T.hp')).toBeLessThan(h1);
    await D(page, 'hurtShark(0, 999)');
    expect(await T(page, 'return T.sharks[0].fled')).toBe(true);
    expectNoErrors(errors);
  });

  test('tres escenarios: corriente cerrada sin fragmentos, viaje por corrientes y por el mercado', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    await D(page, 'freeze(true)');
    await D(page, 'teleport(0,158,0)'); await D(page, 'setSail(1)'); await D(page, 'setSpeed(10)'); await sim(page, 2);
    expect(await T(page, 'return T.state')).toBe('sail');
    expect(await T(page, 'return T.region')).toBe('bahia');
    await D(page, 'fragments(1)');
    await D(page, 'teleport(0,158,0)'); await D(page, 'setSail(1)'); await D(page, 'setSpeed(10)');
    await expect.poll(async () => { await sim(page, 0.3); return T(page, 'return T.state'); }, POLL).toBe('travel');
    await sim(page, 1.5);
    await expect.poll(() => T(page, 'return T.region'), POLL).toBe('bruma');
    expect(await T(page, 'return T.scene')).toBe('Archipiélago de la Bruma');
    expect(await T(page, 'return T.enemies.length')).toBe(3);
    expect(await T(page, 'return T.sharks.length')).toBe(1);
    // segunda corriente cerrada hasta tener 3 fragmentos
    await D(page, 'freeze(true)');
    await D(page, 'fragments(3)');
    await D(page, 'teleport(0,162,0)'); await D(page, 'setSail(1)'); await D(page, 'setSpeed(10)');
    await expect.poll(async () => { await sim(page, 0.3); return T(page, 'return T.region'); }, POLL).toBe('coral');
    expect(await T(page, 'return T.interactions.fort.batteries')).toBe(4);
    expect(await T(page, 'return T.save.unlocked')).toEqual(['bahia', 'bruma', 'coral']);
    // volver a la bahía por el mercado de Puerto Niebla
    await D(page, 'goto("bruma")'); await D(page, 'freeze(true)');
    await D(page, 'teleport(-19,-76,3.14)'); await sim(page, 0.1); await act(page, isMobile); await sim(page, 1.5);
    await expect(page.locator('#ca-market [data-travel="bahia"]')).toBeVisible();
    await page.locator('#ca-market [data-travel="bahia"]').click();
    await expect.poll(() => T(page, 'return T.region'), POLL).toBe('bahia');
    expect(await T(page, 'return T.state')).toBe('sail');
    expectNoErrors(errors);
  });

  test('misión principal (asaltar el fuerte) y secundaria (cueva) completas y persistentes tras recargar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    const cur = await T(page, 'return T.missions.current.map(m => m.id)');
    expect(cur).toEqual(['m_mapa', 'm_fuerte', 'm_almirante', 's_naufragos', 's_cueva']);
    // cueva de la Isla del Eco
    await D(page, 'goto("bruma")'); await D(page, 'freeze(true)');
    await D(page, 'teleport(-80,-2,0.3)'); await sim(page, 0.1); await act(page, isMobile);
    expect(await T(page, 'return T.state')).toBe('foot');
    await D(page, 'footTo(-97,19)');
    if (isMobile) { const j = await center(page, '.k3-joy'); await touch(page, 'touchStart', [[j[0], j[1]]]); await touch(page, 'touchMove', [[j[0], j[1] - 60]]); await sim(page, 0.5); await touch(page, 'touchEnd', []); }
    else await hold(page, 'KeyW', 0.5);
    await sim(page, 0.2);
    expect(await T(page, 'return T.interactions.cave.found')).toBe(true);
    expect(await T(page, 'return T.missions.current.find(m => m.id === "s_cueva").status')).toBe('done');
    // fuerte: con baterías en pie no se puede desembarcar
    await D(page, 'goto("coral")'); await D(page, 'freeze(true)');
    const dock = await T(page, 'return T.interactions.fort.dock');
    await D(page, `teleport(${dock.x},${dock.z - 3},3.14)`); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('Silenciá');
    await D(page, 'destroyBatteries()'); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('fuerte');
    await act(page, isMobile);
    expect(await T(page, 'return T.state')).toBe('foot');
    const flag = await T(page, 'return T.interactions.fort.flag');
    await D(page, `footTo(${flag.x},${flag.z - 1.5})`); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('bandera');
    await holdAct(page, isMobile, 2.3);
    expect(await T(page, 'return T.interactions.fort.captured')).toBe(true);
    expect(await T(page, 'return T.missions.current.find(m => m.id === "m_fuerte").status')).toBe('done');
    await page.reload(); await ready(page);
    const s = await T(page, 'return { fort: T.save.fort, cave: T.save.regions.bruma.cave, ach: T.missions.achievements.done }');
    expect(s.fort).toBe(true); expect(s.cave).toBe(true);
    expect(s.ach.m_fuerte).toBeGreaterThan(0); expect(s.ach.s_cueva).toBeGreaterThan(0);
    await expect(page.locator('#ca-menu [data-go]')).toContainText('Continuar');
    expectNoErrors(errors);
  });

  test('Almirante Espectral: intro, fase 1 blindada con troneras, fase 2 etérea con cañones encantados, fase 3 remolino y victoria', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    await D(page, 'spawnBoss()');
    expect(await T(page, 'return T.state')).toBe('cutscene');
    await sim(page, 1);
    expect(await T(page, 'return T.boss.y')).toBeLessThan(-2); // emerge del mar
    await act(page, isMobile); await sim(page, 0.2);
    expect(await T(page, 'return T.state')).toBe('sail');
    await expect(page.locator('#ca-boss')).toBeVisible();
    await D(page, 'freeze(true)');
    const b = await T(page, 'return T.boss');
    expect(b.phase).toBe(1); expect(b.hp).toBe(900);
    // fase 1: costado blindado ×0,2; con troneras abiertas ×1,6 (andanada real por babor, sin ayuda de puntería)
    await D(page, 'aim(false)'); await D(page, 'god(true)');
    const h0 = (await T(page, 'return T.boss')).hp;
    await D(page, 'placeBoss(0,-50,0)'); await D(page, 'teleport(-30,-50,0)'); await sim(page, 0.1);
    await press(page, 'KeyQ', isMobile, 'port'); await sim(page, 2.5);
    const h1 = (await T(page, 'return T.boss')).hp;
    expect(h0 - h1).toBeGreaterThan(0); expect(h0 - h1).toBeLessThan(15);
    await D(page, 'bossTele(1)'); // abre las troneras del costado que mira al jugador
    expect((await T(page, 'return T.boss')).portsOpen.R).toBe(true);
    await D(page, 'placeBoss(0,-50,0)'); await D(page, 'teleport(-30,-50,0)'); await sim(page, 0.1);
    await press(page, 'KeyQ', isMobile, 'port'); await sim(page, 2.5);
    const h2 = (await T(page, 'return T.boss')).hp;
    expect(h1 - h2).toBeGreaterThan(40);
    // fase 2: etéreo e inmune, cañones encantados
    await D(page, 'bossPhase(2)'); await sim(page, 0.1);
    let bb = await T(page, 'return T.boss');
    expect(bb.phase).toBe(2); expect(bb.ethereal).toBe(true); expect(bb.cannons).toBe(3);
    await D(page, 'placeBoss(0,-50,0)'); await D(page, 'teleport(-30,-50,0)'); await sim(page, 0.1);
    await press(page, 'KeyQ', isMobile, 'port'); await sim(page, 2.5);
    expect((await T(page, 'return T.boss')).hp).toBe(bb.hp);
    // fase 3: remolino (se rompe el hechizo y cambia la regla)
    await D(page, 'freeze(false)');
    await D(page, 'bossPhase(3)'); await sim(page, 3);
    bb = await T(page, 'return T.boss');
    expect(bb.phase).toBe(3); expect(bb.ethereal).toBe(false); expect(bb.whirl).toBeGreaterThan(0.5);
    // derrota del jefe → cofre flotante → victoria al recuperarlo
    await D(page, 'killBoss()'); await sim(page, 5);
    expect(await T(page, 'return T.boss.defeated')).toBe(true);
    const ch = await T(page, 'return T.chest');
    expect(ch.on).toBe(true);
    expect(await T(page, 'return T.missions.current.find(m => m.id === "m_almirante").status')).toBe('done');
    await D(page, `teleport(${ch.x},${ch.z - 6},0)`); await sim(page, 0.1);
    expect(await T(page, 'return T.action')).toContain('Cofre del Almirante');
    await act(page, isMobile);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('victory');
    await expect(page.locator('#ca-end')).toContainText('VICTORIA');
    const sv = await T(page, 'return T.save');
    expect(sv.wins).toBe(1); expect(sv.bestScore).toBeGreaterThan(400); expect(sv.fragments).toBe(0);
    expectNoErrors(errors);
  });

  test('derrota: barco hundido, pantalla ¡A PIQUE! y reintento limpio de la región', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, isMobile);
    await D(page, 'gold(10)');
    await D(page, 'sinkMe()'); await sim(page, 0.2);
    expect(await T(page, 'return T.state')).toBe('sinking');
    await sim(page, 4);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#ca-end')).toContainText('A PIQUE');
    const retry = page.locator('#ca-end [data-retry]');
    if (isMobile) await retry.tap(); else await retry.click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('sail');
    const r = await T(page, 'return { hp: T.hp, max: T.maxHp, p: T.player, gold: T.gold }');
    expect(r.hp).toBe(r.max);
    expect(r.gold).toBe(50); // vuelve al punto de control de entrada a la región
    expect(Math.hypot(r.p.x - 6, r.p.z + 44)).toBeLessThan(1.5);
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanuda y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(0.3);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const snap = 'return { t: T.simTime, r: T.runTime, p: T.player, e: T.enemies }';
    const a = await T(page, snap);
    await wait(page, 1000);
    const b = await T(page, snap);
    expect(b).toEqual(a);
    expect(await T(page, 'return T.paused')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(b.r);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('sail');
    const r = await T(page, 'return { r: T.runTime, hp: T.hp, max: T.maxHp, p: T.player }');
    expect(r.r).toBeLessThan(2);
    expect(r.hp).toBe(r.max);
    expect(Math.hypot(r.p.x - 6, r.p.z + 44)).toBeLessThan(2);
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('ca-once')) { sessionStorage.setItem('ca-once', '1'); localStorage.setItem('corsarios_abismo:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#ca-menu [data-go]')).toContainText('Zarpar');
    expect(await page.evaluate(() => localStorage.getItem('corsarios_abismo:save:corrupto'))).toBe('{esto no es json');
    await page.evaluate(() => localStorage.setItem('corsarios_abismo:save', JSON.stringify({ v: 1, d: { region: 'coral', unlocked: 'x', fragments: 9, gold: -5, kits: 'a', up: { cannons: 7 }, regions: { bahia: { dug: 'no', cannons: [1, 'b_k1'] } }, opts: { sens: 99, binds: { port: 3 } }, started: true, fort: true } })));
    await page.reload();
    await ready(page);
    const s = await T(page, 'return T.save');
    expect(s.fragments).toBe(3);
    expect(s.unlocked).toEqual(['bahia']);
    expect(s.region).toBe('bahia');
    expect(s.gold).toBe(0);
    expect(s.kits).toBe(1); // tipo inválido → valor por defecto
    expect(s.up).toEqual({ cannons: 2, armor: 0 });
    expect(s.regions.bahia.dug).toEqual([]);
    expect(s.regions.bahia.cannons).toEqual(['b_k1']);
    expect(s.opts.sens).toBe(1);
    expect(s.opts.binds.port).toBe('KeyQ');
    await expect(page.locator('#ca-menu [data-go]')).toContainText('Continuar');
    expectNoErrors(errors);
  });

  test('la dificultad cambia parámetros medibles', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    const pick = async label => { const b = page.locator('#ca-menu [role=radio][data-d]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Extremo');
    await expect(page.locator('#ca-menu [data-dtab]')).toContainText('Daño enemigo ×1.6');
    expect(await T(page, 'return T.difficulty')).toMatchObject({ name: 'extremo', dmg: 1.6, bossHp: 1400, hull: 90 });
    await start(page, isMobile);
    expect(await T(page, 'return T.maxHp')).toBe(90);
    expect(await T(page, 'return T.enemies[0].maxHp')).toBe(168);
    expect(await T(page, 'return T.save.kits')).toBe(0);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'menú' }).click();
    await pick('Fácil');
    await start(page, isMobile);
    expect(await T(page, 'return T.difficulty')).toMatchObject({ name: 'facil', dmg: 0.6 });
    expect(await T(page, 'return T.maxHp')).toBe(130);
    expect(await T(page, 'return T.enemies[0].maxHp')).toBe(96);
    expectNoErrors(errors);
  });

  test('la calidad gráfica cambia costos reales', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    const lo = await T(page, 'return T.quality');
    expect(lo).toMatchObject({ q: 'low', pixelRatio: 1, shadows: false });
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    const hi = await T(page, 'return T.quality');
    expect(hi).toMatchObject({ q: 'high', shadows: true });
    expect(hi.waterVerts).toBeGreaterThan(lo.waterVerts * 4);
    expect(hi.particles).toBeGreaterThan(lo.particles * 2);
    expect(hi.decorCount).toBeGreaterThan(lo.decorCount);
    expect(hi.fogFar).toBeGreaterThan(lo.fogFar);
    expect(hi.far).toBeGreaterThan(lo.far);
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y horizontal; controles táctiles', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDet(page, true);
    await D(page, 'freeze(true)');
    const check = async () => {
      await sim(page, 0.3); await wait(page, 300);
      const r = await page.evaluate(() => {
        const sel = ['#ca-status', '#ca-mis', '#ca-map', '#ca-prompt', '.mla-bar', '.k3-joy', '.k3-btn[aria-label="port"]', '.k3-btn[aria-label="star"]', '.k3-btn[aria-label="act"]', '.k3-btn[aria-label="kit"]'];
        const boxes = sel.map(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height && getComputedStyle(e).display !== 'none' && !(/** @type {HTMLElement} */ (e)).hidden ? { s, x: b.left, y: b.top, r: b.right, b: b.bottom } : null; }).filter(Boolean);
        const hits = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.x < c.r - 1 && a.r > c.x + 1 && a.y < c.b - 1 && a.b > c.y + 1) hits.push(a.s + ' × ' + c.s);
        }
        const out = boxes.filter(b => b.x < -1 || b.y < -1 || b.r > innerWidth + 1 || b.b > innerHeight + 1).map(b => b.s);
        return { hits, out, n: boxes.length, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
      });
      expect(r.hits).toEqual([]);
      expect(r.out).toEqual([]);
      expect(r.n).toBeGreaterThan(7);
      expect(r.sw).toBeLessThanOrEqual(r.w);
      expect(r.sh).toBeLessThanOrEqual(r.h);
    };
    await D(page, 'teleport(4,-36,3.14)'); // con aviso de acción visible
    await page.setViewportSize({ width: 412, height: 915 });
    await check();
    await page.setViewportSize({ width: 915, height: 412 });
    await check();
    // ACCIÓN táctil atraca; KIT repara
    await page.locator('.k3-btn[aria-label="act"]').tap(); await sim(page, 0.1);
    expect(await T(page, 'return T.state')).toBe('docked');
    await sim(page, 1.5); await page.locator('#ca-market [data-leave]').tap();
    await D(page, 'hurt(30)'); const hp = await T(page, 'return T.hp');
    await page.locator('.k3-btn[aria-label="kit"]').tap(); await sim(page, 0.1);
    expect(await T(page, 'return T.hp')).toBeGreaterThan(hp);
    await page.setViewportSize({ width: 412, height: 915 });
    expectNoErrors(errors);
  });
});
