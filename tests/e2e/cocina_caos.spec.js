// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

// Cocina del Caos (Three.js 0.186 + Kit3D). En headless el WebGL es SwiftShader (CPU) y el reloj real avanza a saltos:
// las esperas son por condición (expect.poll) y los tramos largos usan simulate() con ?debug (pasos fijos de 1/60 s,
// mismas funciones de juego que la entrada real).

const FILE = 'cocina_caos.html?debug';
const hk = (page, expr) => page.evaluate(`window.__cocina_caos.${expr}`);
const run = (page, fn, arg) => page.evaluate(fn, arg);
const POLL = { timeout: 30_000 };

async function ready(page) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__cocina_caos && document.querySelector('#ccMenu [data-play]')), null, { timeout: 40_000 });
}
/** Arranca desde el menú con entrada real (Enter en PC, toque en celular). */
async function start(page, isMobile, { skipTut = true } = {}) {
  const { errors } = await openGame(page, FILE);
  await ready(page);
  if (isMobile) await page.locator('#ccMenu [data-play]').tap();
  else await page.keyboard.press('Enter');
  await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
  if (skipTut) await page.evaluate(() => { const b = document.getElementById('coachSkip'); if (b && !document.getElementById('coach').hidden) b.click(); });
  return errors;
}
/** Botón ACCIÓN (táctil) o tecla E (PC). */
async function use(page, isMobile) {
  if (isMobile) await page.locator('.k3-btn[aria-label="act"]').tap();
  else await page.keyboard.press('KeyE');
}
async function hold(page, isMobile, until) {
  if (isMobile) {
    const b = /** @type {any} */ (await page.locator('.k3-btn[aria-label="act"]').boundingBox());
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await until(); await page.mouse.up();
  } else { await page.keyboard.down('KeyE'); await until(); await page.keyboard.up('KeyE'); }
}
async function at(page, id) { expect(await page.evaluate(i => /** @type {any} */ (window).__cocina_caos.at(i), id)).toBe(true); }
const quiet = page => page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.noSpawn(); h.setTask('seguir'); });

test.describe('Cocina del Caos', () => {
  test('carga sin errores: menú con crédito MateLabs, cocinas, dificultad y escena de fondo', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    expect(await hk(page, 'state')).toBe('menu');
    await expect(page.locator('#ccMenu .cc-credit')).toContainText('MATELABS');
    await expect(page.locator('#ccMenu .mlm-diff button')).toHaveCount(4);
    await expect(page.locator('#ccMenu .cc-k')).toHaveCount(4);
    await expect(page.locator('#ccMenu .cc-k.locked')).toHaveCount(3);
    await expect.poll(() => hk(page, 'perf.calls'), POLL).toBeGreaterThan(5);
    expect(await page.title()).toBe('Cocina del Caos — MateLabs');
    expectNoErrors(errors);
  });

  test('arranque con entrada real, movimiento y tutorial guiado (se salta y se reabre desde la pausa)', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile, { skipTut: false });
    expect((await sdk(page)).telemetry).toContain('start');
    await expect(page.locator('#coach')).toBeVisible();
    await expect(page.locator('#coachTx')).toContainText(isMobile ? 'joystick' : 'WASD');
    expect((await hk(page, 'shift')).frozen).toBe(true); // el reloj espera al tutorial
    const p0 = await hk(page, 'player');
    if (isMobile) {
      const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 55, cy, { steps: 4 });
      await expect.poll(async () => p0.x - (await hk(page, 'player')).x, POLL).toBeGreaterThan(1.7);
      await page.mouse.up();
    } else {
      await page.keyboard.down('KeyA');
      await expect.poll(async () => p0.x - (await hk(page, 'player')).x, POLL).toBeGreaterThan(1.7);
      await page.keyboard.up('KeyA');
    }
    await expect.poll(() => hk(page, 'tutorial.step'), POLL).toBe(1);
    await expect(page.locator('#coachTx')).toContainText('lechuga');
    // paso 2 con entrada real: sacar lechuga
    await at(page, 'nevera_lechuga');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'tutorial.step'), POLL).toBe(2);
    await page.locator('#coachSkip').click();
    await expect(page.locator('#coach')).toBeHidden();
    expect((await hk(page, 'shift')).frozen).toBe(false);
    expect((await hk(page, 'save')).tutorialDone).toBe(true);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.pause());
    await page.locator('.mla-pause button', { hasText: 'Ver tutorial' }).click();
    await expect(page.locator('#coach')).toBeVisible();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expectNoErrors(errors);
  });

  test('nevera, tabla (mesada), platos y cinta: ensalada completa con entrada real y resaltado', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await quiet(page);
    await at(page, 'nevera_lechuga');
    const f = await hk(page, 'focus');
    expect(f.id).toBe('nevera_lechuga'); expect(f.ok).toBe(true);
    await expect.poll(() => hk(page, 'focus?.highlight'), POLL).toBe(true);
    await expect(page.locator('#prompt')).toContainText('Sacar lechuga');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.ing'), POLL).toBe('lechuga');
    expect((await hk(page, "station('nevera_lechuga')")).anim).toBeGreaterThan(0); // tapa animada
    await at(page, 'board0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, "station('board0').item?.ing"), POLL).toBe('lechuga');
    await expect(page.locator('#prompt')).toContainText('Picar');
    await hold(page, isMobile, () => expect.poll(() => hk(page, "station('board0').item?.st"), POLL).toBe('picado'));
    // plato limpio del escurridor
    const clean0 = (await hk(page, "station('rack0')")).clean;
    await at(page, 'rack0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.t'), POLL).toBe('plate');
    expect((await hk(page, "station('rack0')")).clean).toBe(clean0 - 1);
    await at(page, 'board0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.items.length'), POLL).toBe(1);
    // mesada persistente: dejar el plato, irse, volver
    await at(page, 'counter2');
    await use(page, isMobile);
    await expect.poll(() => hk(page, "station('counter2').item?.t"), POLL).toBe('plate');
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(3));
    expect((await hk(page, "station('counter2')")).item.items).toEqual(['lechuga:picado']);
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.t'), POLL).toBe('plate');
    // cinta
    await at(page, 'conveyor0');
    await expect(page.locator('#prompt')).toContainText('Servir Ensalada verde');
    const served0 = (await hk(page, 'shift')).served;
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'conveyor.length'), POLL).toBe(1);
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(1));
    expect((await hk(page, 'conveyor'))[0].s).toBeGreaterThan(0.5); // el plato viaja por la cinta
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(5));
    expect((await hk(page, 'shift')).served).toBe(served0 + 1);
    expect((await hk(page, 'events'))).toContain('served:ensalada_verde:perfect');
    expectNoErrors(errors);
  });

  test('horno: hornea, se quema y se prende fuego; extintor lo apaga', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await quiet(page);
    await at(page, 'nevera_carne');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.ing'), POLL).toBe('carne');
    await at(page, 'oven0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, "station('oven0').item?.ing"), POLL).toBe('carne');
    expect((await hk(page, "station('oven0')")).anim).toBeGreaterThan(0); // puerta
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(7));
    expect((await hk(page, "station('oven0')")).item.st).toBe('asado');
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(7.5));
    expect((await hk(page, "station('oven0')")).item.st).toBe('quemado');
    expect((await hk(page, 'missions')).current.find(m => m.id === 'sinquemar')?.status ?? 'failed').toBe('failed');
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(5.5));
    expect((await hk(page, "station('oven0')")).fire).toBe(1);
    // apagar con el extintor: agarrarlo y mantener ACCIÓN mirando el fuego
    await at(page, 'mesada_extintor');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.t'), POLL).toBe('ext');
    await at(page, 'oven0');
    await expect(page.locator('#prompt')).toContainText('Apagar');
    await hold(page, isMobile, () => expect.poll(() => hk(page, "station('oven0').fire"), POLL).toBe(0));
    expect(await hk(page, 'events')).toContain('fireOut:oven0');
    expectNoErrors(errors);
  });

  test('olla y fregadero: sopa de 3 picados y lavado de platos sucios (persisten en la sesión)', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await quiet(page);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; for (let i = 0; i < 2; i++) { h.give({ t: 'ing', ing: 'hongo', st: 'picado' }); h.at('pot0'); h.act(); } h.give({ t: 'ing', ing: 'hongo', st: 'picado' }); });
    await at(page, 'pot0');
    await expect(page.locator('#prompt')).toContainText('3/3');
    await use(page, isMobile);
    await expect.poll(() => hk(page, "station('pot0').pot.state"), POLL).toBe('cooking');
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(8.5));
    expect((await hk(page, "station('pot0')")).pot.state).toBe('done');
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.give({ t: 'plate', items: [] }); h.at('pot0'); });
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.items[0]'), POLL).toBe('sopa_hongo:cocido');
    // platos sucios: retorno → fregadero → lavar (mantener) → escurridor
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.give(null); h.deliverDirty(2); });
    await at(page, 'return0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'hold?.n'), POLL).toBe(2);
    await at(page, 'sink0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, "station('sink0').dirty"), POLL).toBe(2);
    const clean0 = (await hk(page, "station('rack0')")).clean;
    await hold(page, isMobile, () => expect.poll(() => hk(page, "station('sink0').dirty"), POLL).toBe(0));
    expect((await hk(page, "station('rack0')")).clean).toBe(clean0 + 2);
    expectNoErrors(errors);
  });

  test('rivales: roedor roba y se espanta, derrame hace patinar y se limpia, ayudante con encargos', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await quiet(page);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.put('counter7', { t: 'ing', ing: 'tomate', st: 'picado' }); h.tp(3, 2); h.spawn('rat'); });
    await expect.poll(() => hk(page, 'rats.length'), POLL).toBe(1);
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(3.5));
    const r = (await hk(page, 'rats'))[0];
    expect(['out', 'nibble']).toContain(r.st);
    // ir hasta el roedor y espantarlo con ACCIÓN
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; const r = h.rats[0]; h.tp(r.x + 1.6, r.z); h.face(r.x, r.z); });
    await expect.poll(() => hk(page, 'focus?.kind'), POLL).toBe('rat');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'events'), POLL).toContain('ratShoo');
    expect((await hk(page, "station('counter7')")).item?.ing).toBe('tomate');
    // derrame
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.tp(0, 1.2); h.spawn('spill'); });
    const sp = (await hk(page, 'spills'))[0];
    await page.evaluate(([x, z]) => { const h = /** @type {any} */ (window).__cocina_caos; h.tp(x, z); }, [sp.x, sp.z]);
    await expect.poll(() => hk(page, 'focus?.kind'), POLL).toBe('spill');
    await expect(page.locator('#prompt')).toContainText('Limpiar');
    await hold(page, isMobile, () => expect.poll(() => hk(page, 'spills.length'), POLL).toBe(0));
    // ayudante: encargo «emergencias» apaga un fuego solo
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.setTask('limpiar'); h.spawn('fire:counter5'); h.simulate(9); });
    expect((await hk(page, "station('counter5')")).fire).toBe(0);
    // encargo con entrada real: Q / botón del ayudante
    if (isMobile) await page.locator('.k3-btn[aria-label="help"]').tap(); else await page.keyboard.press('KeyQ');
    await expect.poll(() => hk(page, 'helper.task'), POLL).toBe('seguir');
    expectNoErrors(errors);
  });

  test('ayudante «lavar» y «picar» trabajan solos', async ({ page }) => {
    const errors = await start(page, false);
    await quiet(page);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.deliverDirty(2); h.setTask('lavar'); h.simulate(16); });
    expect((await hk(page, "station('return0')")).dirty).toBe(0);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.simulate(6); });
    expect((await hk(page, "station('rack0')")).clean).toBe(6);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.clearOrders(); h.spawn('order:ensalada_mixta'); h.setTask('picar'); h.simulate(20); });
    const st = await hk(page, 'stations');
    expect(st.filter(s => s.item && s.item.t === 'ing' && s.item.st === 'picado').length).toBeGreaterThanOrEqual(1);
    expectNoErrors(errors);
  });

  test('escenarios: las 3 cocinas cargan con distinto plano y riesgos, y se pasa de una a otra', async ({ page }) => {
    const errors = await start(page, false);
    const info = {};
    for (const k of ['taberna', 'volcan', 'espacial']) {
      await page.evaluate(id => /** @type {any} */ (window).__cocina_caos.goto(id), k);
      await expect.poll(() => hk(page, 'scene'), POLL).toBe(k);
      await expect.poll(() => hk(page, 'perf.calls'), POLL).toBeGreaterThan(10);
      info[k] = (await hk(page, 'stations')).map(s => s.id);
      await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(3));
      expect(await hk(page, 'state')).toBe('play');
    }
    expect(info.volcan).toContain('nevera_queso'); expect(info.espacial).toContain('nevera_pescado'); expect(info.taberna).toContain('nevera_hongo');
    // eventos de caos propios de cada cocina (con aviso previo)
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.noSpawn(); h.startChaos('esclusa'); });
    expect((await hk(page, 'chaos')).pending).toBe('esclusa');
    const x0 = (await hk(page, 'player')).x;
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(4.5));
    expect((await hk(page, 'chaos')).suction).toBe(true);
    expect((await hk(page, 'player')).x).toBeLessThan(x0 - 1);
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.goto('volcan'));
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.noSpawn(); h.startChaos('erupcion'); h.simulate(3.2); });
    expect((await hk(page, 'counts')).fires).toBeGreaterThanOrEqual(1);
    // de turno ganado a la cocina siguiente con entrada real
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.goto('taberna'); h.endTut(); h.setScore(260); h.setTime(0.05); h.simulate(0.2); });
    await expect.poll(() => hk(page, 'endKind'), POLL).toBe('shift');
    await page.locator('#ccEnd [data-next="volcan"]').click();
    await expect.poll(() => hk(page, 'scene'), POLL).toBe('volcan');
    expect(await hk(page, 'state')).toBe('play');
    expectNoErrors(errors);
  });

  test('misiones: principal «Desbloquear segunda cocina» y secundaria «3 pedidos perfectos»; persisten al recargar', async ({ page }) => {
    const errors = await start(page, false);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.noSpawn(); h.clearOrders();
      for (let i = 0; i < 3; i++) { h.spawn('order:ensalada_verde'); h.give({ t: 'plate', items: ['lechuga:picado'] }); h.at('conveyor0'); h.act(); h.simulate(6); } });
    let ms = await hk(page, 'missions');
    expect(ms.achievements.done.perfectos).toBeGreaterThanOrEqual(1);
    expect((await hk(page, 'shift')).perfect).toBe(3);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.setScore(150); h.setTime(0.05); h.simulate(0.2); });
    await expect.poll(() => hk(page, 'endKind'), POLL).toBe('shift');
    ms = await hk(page, 'missions');
    expect(ms.achievements.done.cocina2).toBeGreaterThanOrEqual(1);
    expect((await hk(page, 'save')).unlocked).toBe(2);
    expect((await hk(page, 'save')).served).toBe(3);
    await page.reload(); await ready(page);
    expect((await hk(page, 'save')).unlocked).toBe(2);
    expect((await hk(page, 'missions')).achievements.done.cocina2).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#ccMenu .cc-k.locked')).toHaveCount(2);
    await expect(page.locator('#ccMenu [data-k="taberna"] small')).toContainText('★');
    expectNoErrors(errors);
  });

  test('guardado corrupto, malformado y versión vieja: se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('cc-t')) { sessionStorage.setItem('cc-t', '1'); localStorage.setItem('cocina_caos:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    expect(await page.evaluate(() => localStorage.getItem('cocina_caos:save:corrupto'))).toBe('{esto no es json');
    expect((await hk(page, 'save')).unlocked).toBe(1);
    await page.evaluate(() => localStorage.setItem('cocina_caos:save', JSON.stringify({ v: 2, d: { unlocked: 'x', best: { volcan: { score: 'mucho', stars: 2 } }, keys: { act: 5 }, served: -3, stick: 9 } })));
    await page.reload(); await ready(page);
    const s = await hk(page, 'save');
    expect(s.unlocked).toBe(2); expect(s.best.volcan.score).toBe(0); expect(s.keys.act).toBe('KeyE'); expect(s.served).toBe(0); expect(s.stick).toBe(1);
    await page.evaluate(() => localStorage.setItem('cocina_caos:save', JSON.stringify({ v: 1, d: { level: 3, record: 321, orders: 12 } })));
    await page.reload(); await ready(page);
    const s1 = await hk(page, 'save');
    expect(s1.unlocked).toBe(3); expect(s1.best.taberna.score).toBe(321); expect(s1.served).toBe(12);
    await page.keyboard.press('Enter');
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expectNoErrors(errors);
  });

  test('dificultad: el selector cambia la tabla de efectos y el tiempo medido de los pedidos', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const measure = async () => {
      await page.locator('#ccMenu [data-play]').click();
      await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
      return page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.endTut(); h.clearOrders(); h.spawn('order:sandwich'); return h.orders[0].tMax; });
    };
    await page.locator('.mlm-diff button[data-d="facil"]').click();
    await expect(page.locator('#ccDiffInfo')).toContainText('Fallidos permitidos 6');
    const easy = await measure();
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.pause());
    await page.locator('.mla-pause button', { hasText: 'Menú principal' }).click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('menu');
    await page.locator('.mlm-diff button[data-d="extremo"]').click();
    expect((await hk(page, 'difficulty')).maxFails).toBe(2);
    const hard = await measure();
    expect(easy).toBeGreaterThan(hard * 1.8);
    expectNoErrors(errors);
  });

  test('calidad: baja/alta cambian resolución, sombras, niebla, luces y partículas', async ({ page }) => {
    const errors = await start(page, false);
    const atQ = async q => {
      await page.evaluate(q => /** @type {any} */ (window).MLArcade.settings.set('quality', q), q);
      await expect.poll(() => hk(page, 'perf.quality'), POLL).toBe(q);
      await wait(page, 300);
      return hk(page, 'perf');
    };
    const low = await atQ('low'); const high = await atQ('high');
    expect(low.shadows).toBe(false); expect(high.shadows).toBe(true);
    expect(low.pixelRatio).toBeLessThanOrEqual(1);
    expect(low.fogFar).toBeLessThan(high.fogFar);
    expect(low.particleCap).toBeLessThan(high.particleCap);
    expect(low.pointLight).toBe(false); expect(high.pointLight).toBe(true);
    await expect.poll(async () => (await hk(page, 'perf')).tris, POLL).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('Gran Banquete: intro, 3 fases con reglas distintas, pedido real y victoria con recompensa', async ({ page, isMobile }) => {
    test.setTimeout(150_000);
    const errors = await start(page, isMobile);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.unlock(4); h.startBanquet(); });
    expect(await hk(page, 'state')).toBe('cutscene');
    await expect(page.locator('#cut')).toBeVisible();
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(0.8));
    await use(page, isMobile); // saltear la intro con entrada real
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expect(await hk(page, 'banquet.phase')).toBe(0);
    expect(await hk(page, 'scene')).toBe('taberna');
    // fase 1: oleadas telegrafiadas (llegan 3 juntos)
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(3.5));
    expect(await hk(page, 'orders.length')).toBe(0);
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(3.6));
    expect(await hk(page, 'orders.length')).toBe(3);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.setScore(240); h.setTime(0.05); h.simulate(0.2); });
    await expect.poll(() => hk(page, 'endKind'), POLL).toBe('phase');
    await expect(page.locator('#ccEnd')).toContainText('Cambio de reglas');
    await page.locator('#ccEnd [data-phase]').click();
    // fase 2: volcán, pedido real que vale doble y erupciones a ritmo fijo
    await expect.poll(() => hk(page, 'scene'), POLL).toBe('volcan');
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(5.5));
    expect((await hk(page, 'orders')).some(o => o.royal && o.recipe === 'festin_volcan')).toBe(true);
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(14));
    expect(await hk(page, 'events')).toContain('chaos:erupcion');
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.setScore(270); h.setTime(0.05); h.simulate(0.2); });
    await expect.poll(() => hk(page, 'endKind'), POLL).toBe('phase');
    await page.locator('#ccEnd [data-phase]').click();
    // fase 3: gravedad cero permanente
    await expect.poll(() => hk(page, 'scene'), POLL).toBe('espacial');
    expect((await hk(page, 'chaos')).zeroG).toBe(true);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.setScore(300); h.setTime(0.05); h.simulate(0.2); });
    await expect.poll(() => hk(page, 'endKind'), POLL).toBe('victory');
    await expect(page.locator('#ccEnd')).toContainText('Gorro dorado');
    expect(await hk(page, 'goldHat')).toBe(true);
    expect((await hk(page, 'missions')).achievements.done.banquete).toBeGreaterThanOrEqual(1);
    expectNoErrors(errors);
  });

  test('derrota por pedidos fallidos y reintento limpio', async ({ page }) => {
    const errors = await start(page, false);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.clearOrders(); for (const r of ['ensalada_verde', 'sandwich', 'ensalada_mixta', 'sopa_hongos']) h.spawn('order:' + r); h.noSpawn(); h.simulate(80); });
    await expect.poll(() => hk(page, 'endKind'), POLL).toBe('defeat');
    await expect(page.locator('#ccEnd')).toContainText('Derrota');
    await page.locator('#ccEnd [data-retry]').click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    const s = await hk(page, 'shift');
    expect(s.fails).toBe(0); expect(s.score).toBe(0); expect(s.time).toBeGreaterThan(140);
    expectNoErrors(errors);
  });

  test('pausa congela 1 s y reanuda; reiniciar desde la pausa resetea el turno', async ({ page }) => {
    const errors = await start(page, false);
    await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.simulate(5));
    await page.keyboard.press('Escape');
    await expect.poll(() => hk(page, 'paused'), POLL).toBe(true);
    const a = await hk(page, 'shift.time'), st = await hk(page, 'simTime');
    await wait(page, 1000);
    expect(await hk(page, 'shift.time')).toBe(a);
    expect(await hk(page, 'simTime')).toBe(st);
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect.poll(() => hk(page, 'simTime'), POLL).toBeGreaterThan(st);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.setScore(99); h.give({ t: 'ext' }); });
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => hk(page, 'shift.score'), POLL).toBe(0);
    expect(await hk(page, 'hold')).toBe(null);
    expect(await hk(page, 'state')).toBe('play');
    expectNoErrors(errors);
  });

  test('controles: remapeo de la tecla de acción desde el menú', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.locator('#ccMenu [data-keys]').click();
    await page.locator('#panel [data-rebind="act"]').click();
    await page.keyboard.press('KeyF');
    await expect(page.locator('#panel [data-rebind="act"] kbd')).toHaveText('F');
    await page.locator('#panel [data-close]').click();
    expect((await hk(page, 'save')).keys.act).toBe('KeyF');
    await page.keyboard.press('Enter');
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; h.endTut(); h.at('nevera_tomate'); });
    await page.keyboard.press('KeyF');
    await expect.poll(() => hk(page, 'hold?.ing'), POLL).toBe('tomate');
    expectNoErrors(errors);
  });

  for (const vp of [{ w: 412, h: 915 }, { w: 915, h: 412 }]) {
    test(`celular ${vp.w}×${vp.h}: sin superposiciones ni scroll, controles táctiles funcionan`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'sólo en el proyecto mobile');
      await page.setViewportSize({ width: vp.w, height: vp.h });
      const errors = await start(page, true);
      await expect.poll(() => hk(page, 'orders.length'), POLL).toBeGreaterThan(0);
      await page.evaluate(() => /** @type {any} */ (window).__cocina_caos.at('nevera_lechuga'));
      await wait(page, 400);
      const r = await page.evaluate(() => {
        const box = s => { const e = document.querySelector(s); if (!e || /** @type {HTMLElement} */ (e).hidden || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
        const els = { top: box('#hTop'), tickets: box('.tk:not([hidden])'), joy: box('.k3-joy'), act: box('.k3-btn[aria-label="act"]'), dash: box('.k3-btn[aria-label="dash"]'), help: box('.k3-btn[aria-label="help"]'), bar: box('.mla-bar'), prompt: box('#prompt') };
        const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const pairs = []; const k = Object.keys(els);
        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (hit(els[k[i]], els[k[j]])) pairs.push(k[i] + '/' + k[j]);
        const inside = Object.entries(els).filter(([, b]) => b && (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1)).map(([n]) => n);
        return { pairs, inside, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, actSize: els.act ? els.act.width : 0 };
      });
      expect(r.pairs).toEqual([]); expect(r.inside).toEqual([]);
      expect(r.scrollW).toBeLessThanOrEqual(vp.w); expect(r.scrollH).toBeLessThanOrEqual(vp.h);
      expect(r.actSize).toBeGreaterThanOrEqual(90);
      await expect(page.locator('.k3-btn[aria-label="act"]')).toHaveText('AGARRAR');
      await page.locator('.k3-btn[aria-label="act"]').tap();
      await expect.poll(() => hk(page, 'hold?.ing'), POLL).toBe('lechuga');
      // impulso táctil
      await page.evaluate(() => { const h = /** @type {any} */ (window).__cocina_caos; const p = h.player; h.face(p.x, p.z + 3); });
      const p0 = await hk(page, 'player');
      await page.locator('.k3-btn[aria-label="dash"]').tap();
      await expect.poll(async () => Math.hypot((await hk(page, 'player')).x - p0.x, (await hk(page, 'player')).z - p0.z), POLL).toBeGreaterThan(0.3);
      await page.screenshot({ path: `test-results/cocina_caos-${vp.w}x${vp.h}.png` });
      expectNoErrors(errors);
    });
  }
});
