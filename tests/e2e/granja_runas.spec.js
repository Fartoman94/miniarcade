// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

// Granja de Runas (Three.js 0.186 + Kit3D). En headless el WebGL es SwiftShader (CPU) y el reloj de juego
// avanza a saltos: las esperas son por condición (expect.poll) y los tramos largos usan simulate() con ?debug.

const FILE = 'granja_runas.html?debug';
/** Lee una expresión del gancho de pruebas. @param {import('@playwright/test').Page} page @param {string} expr */
const hk = (page, expr) => page.evaluate(`window.__granja_runas.${expr}`);
const POLL = { timeout: 30_000 };

/** @param {import('@playwright/test').Page} page */
async function ready(page) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__granja_runas && document.querySelector('#grMenu [data-go]')), null, { timeout: 40_000 });
}
/** Arranca desde el menú con entrada real (Enter en PC, toque en celular). */
async function start(page, isMobile, { skipTut = true } = {}) {
  const { errors } = await openGame(page, FILE);
  await ready(page);
  if (isMobile) await page.locator('#grMenu [data-go]').first().tap();
  else await page.keyboard.press('Enter');
  await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
  if (skipTut) await page.evaluate(() => /** @type {HTMLElement} */ (document.getElementById('coachSkip')).click());
  return errors;
}
/** Botón USAR (táctil) o tecla E (PC). */
async function use(page, isMobile) {
  if (isMobile) await page.locator('.k3-btn[aria-label="act"]').tap();
  else await page.keyboard.press('KeyE');
}
/** Pararse junto a algo mirándolo. */
async function stand(page, x, z, fx, fz) { await page.evaluate(([x, z, fx, fz]) => { const h = /** @type {any} */ (window).__granja_runas; h.tp(x, z); h.face(fx, fz); }, [x, z, fx, fz]); }
async function focusIs(page, id) { await expect.poll(() => page.evaluate(() => { const f = /** @type {any} */ (window).__granja_runas.focus; return f && f.id; }), POLL).toBe(id); }

test.describe('Granja de Runas', () => {
  test('carga sin errores: menú con crédito MateLabs, dificultad y escena de fondo', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    expect(await hk(page, 'state')).toBe('menu');
    await expect(page.locator('#grMenu')).toBeVisible();
    await expect(page.locator('#grMenu .gr-credit')).toContainText('MATELABS');
    await expect(page.locator('#grMenu .mlm-diff button')).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__granja_runas.perf.calls), POLL).toBeGreaterThan(5);
    expect(await page.title()).toBe('Granja de Runas — MateLabs');
    expectNoErrors(errors);
  });

  test('arranque con entrada real, movimiento y tutorial (se salta y se reabre desde la pausa)', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile, { skipTut: false });
    expect((await sdk(page)).telemetry).toContain('start');
    await expect(page.locator('#coach')).toBeVisible();
    await expect(page.locator('#coachTx')).toContainText(isMobile ? 'joystick' : 'WASD');
    const p0 = await hk(page, 'player');
    if (isMobile) {
      const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy - 55, { steps: 4 });
      await expect.poll(async () => p0.z - (await hk(page, 'player')).z, POLL).toBeGreaterThan(2.6);
      await page.mouse.up();
    } else {
      await page.keyboard.down('KeyW');
      await expect.poll(async () => p0.z - (await hk(page, 'player')).z, POLL).toBeGreaterThan(2.6);
      await page.keyboard.up('KeyW');
    }
    // el primer paso se cumple al moverse: pasa a «limpiar maleza»
    await expect.poll(() => hk(page, 'tutorial.step'), POLL).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#coachTx')).toContainText('maleza');
    await page.locator('#coachSkip').click();
    await expect(page.locator('#coach')).toBeHidden();
    expect((await hk(page, 'tutorial')).done).toBe(true);
    // reabrir desde el menú de pausa
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.pause());
    await page.locator('.mla-pause button', { hasText: 'Ver tutorial' }).click();
    await expect(page.locator('#coach')).toBeVisible();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expectNoErrors(errors);
  });

  test('parcelas y regadera: limpiar, plantar, llenar y regar con entrada real; persiste al recargar', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    // parcela 0 (maleza, 2 golpes)
    await stand(page, -9.6, -1.0, -9.6, -2);
    await focusIs(page, 'parcela0');
    await expect(page.locator('#prompt')).toContainText('Limpiar');
    expect((await hk(page, 'visuals')).focusRing).toBe(true);
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'plots[0].hits'), POLL).toBe(1);
    await wait(page, 300);
    await expect.poll(async () => { if ((await hk(page, 'plots[0].s')) !== 'vacia') await use(page, isMobile); return hk(page, 'plots[0].s'); }, POLL).toBe('vacia');
    expect((await hk(page, 'visuals')).weedsVisible[0]).toBe(false);
    expect((await hk(page, 'campaign')).huerta.cleared).toBe(1);
    // plantar
    await expect.poll(async () => { if ((await hk(page, 'plots[0].s')) !== 'cultivo') await use(page, isMobile); return hk(page, 'plots[0].s'); }, POLL).toBe('cultivo');
    expect(await hk(page, 'plots[0].crop')).toBe('nabo');
    expect((await hk(page, 'visuals')).cropVisible[0]).toBe(true);
    // regadera vacía → pozo
    await expect(page.locator('#prompt')).toContainText('Regadera vacía');
    await stand(page, 2.6, 2.4, 2.6, 0.6);
    await focusIs(page, 'pozo');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'water'), POLL).toBe(4);
    await stand(page, -9.6, -1.0, -9.6, -2);
    await focusIs(page, 'parcela0');
    await expect(page.locator('#prompt')).toContainText(/Regar|regada/);
    await expect.poll(async () => { if ((await hk(page, 'plots[0].w')) < 0.9) await use(page, isMobile); return hk(page, 'plots[0].w'); }, POLL).toBeGreaterThan(0.9);
    expect(await hk(page, 'water')).toBe(3);
    // crecimiento determinista: 300 min de juego regados ×1.2 (primavera) → maduro antes de 40 s simulados
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.simulate(33));
    expect(await hk(page, 'plots[0].g')).toBe(1);
    // persistencia
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.flush());
    await page.reload(); await ready(page);
    const pl = await hk(page, 'plots[0]');
    expect(pl.s).toBe('cultivo'); expect(pl.crop).toBe('nabo');
    await expect(page.locator('#grMenu [data-go="cont"]')).toBeVisible();
    expectNoErrors(errors);
  });

  test('animales: adoptar en el refugio, alimentar con entrada real, animación y producto al día siguiente', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.set({ coins: 200 }); h.goto('mercado'); });
    await stand(page, -13.5, 6.2, -13.5, 8.5);
    await focusIs(page, 'adoptar_gallina');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'animals.gallina.own'), POLL).toBe(true);
    expect(await hk(page, 'coins')).toBe(160);
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.goto('granja'));
    const pos = await hk(page, 'animalPos.gallina');
    expect(pos.visible).toBe(true);
    await stand(page, pos.x - 1.2, pos.z, pos.x, pos.z);
    await focusIs(page, 'animal_gallina');
    await expect(page.locator('#prompt')).toContainText('forraje');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'animals.gallina.fed'), POLL).toBe(true);
    expect((await hk(page, 'inv')).forraje).toBe(1);
    expect((await hk(page, 'animalPos.gallina')).hop).toBeGreaterThan(0);
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.newDay());
    expect(await hk(page, 'animals.gallina.ready')).toBe(true);
    const p2 = await hk(page, 'animalPos.gallina');
    await stand(page, p2.x - 1.2, p2.z, p2.x, p2.z);
    await focusIs(page, 'animal_gallina');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'inv.huevo'), POLL).toBe(1);
    expectNoErrors(errors);
  });

  test('estanterías, tienda y decoración: comprar (stock visible), vender, colocar decoración', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.set({ coins: 100, inv: { zanahoria: 3 } }); h.goto('mercado'); h.setTime(600); });
    // estante de zanahoria (self-service)
    await stand(page, -12.8, -8.3, -12.8, -10.4);
    await focusIs(page, 'estante_zanahoria');
    const sacks0 = (await hk(page, 'market')).sacks[1];
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'seeds.zanahoria'), POLL).toBe(1);
    expect(await hk(page, 'coins')).toBe(90);
    expect((await hk(page, 'market')).sacks[1]).toBe(sacks0 - 1);
    // vender a Tomás (está en su puesto a las 10:00)
    await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__granja_runas.critters.npcs.find(n => n.id === 'tomas').spot), POLL).toBe('post');
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.setTime(600));
    await stand(page, 11, -4.6, 11, -6.5);
    await focusIs(page, 'venta');
    await use(page, isMobile);
    await expect(page.locator('#panel')).toBeVisible();
    expect(await hk(page, 'state')).toBe('dialog');
    await page.locator('#panel .gr-row[data-id="vender_zanahoria"] button').click();
    await expect.poll(() => hk(page, 'inv.zanahoria'), POLL).toBe(2);
    expect(await hk(page, 'coins')).toBeGreaterThan(90);
    await page.locator('#panel .gr-x').click();
    await expect(page.locator('#panel')).toBeHidden();
    // decoración: comprar un farol a la Abuela Rosa y colocarlo en la granja
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.act('decoracion'));
    await page.locator('#panel .gr-row[data-id="comprar_farol"] button').click();
    await page.locator('#panel .gr-x').click();
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.goto('granja'));
    await stand(page, -12.8, 2.2, -12.8, 0.6);
    await focusIs(page, 'deco0');
    await use(page, isMobile);
    await expect(page.locator('#panel')).toBeVisible();
    await page.locator('#panel .gr-row[data-id="colocar_farol"] button').click();
    expect(await hk(page, 'decor[0]')).toBe('farol');
    expect((await hk(page, 'visuals')).decorVisible[0]).toBe('farol');
    expectNoErrors(errors);
  });

  test('rivales: topo se espanta, cuervo huye al acercarse y espíritu se calma manteniendo USAR', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas;
      h.set({ plots: h.plots.map((p, i) => i === 1 ? { s: 'cultivo', crop: 'zanahoria', g: 0.5, w: 1, frost: 0, hits: 0 } : i === 2 ? { s: 'cultivo', crop: 'nabo', g: 0, w: 1, frost: 0, hits: 0 } : p) }); });
    // topo
    expect(await page.evaluate(() => /** @type {any} */ (window).__granja_runas.spawn('pest'))).toBe(true);
    await expect.poll(() => hk(page, 'counts.pests'), POLL).toBe(1);
    await stand(page, -5.6, -0.4, -5.95, -1.1);
    await focusIs(page, 'topo0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'counts.pests'), POLL).toBe(0);
    // cuervo: se acerca a la semilla; al llegar la jugadora, huye y la semilla sigue ahí
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.tp(8, 10));
    expect(await page.evaluate(() => /** @type {any} */ (window).__granja_runas.spawn('crow'))).toBe(true);
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.simulate(3.5));
    expect((await hk(page, 'critters')).crows[0].st).toBe('dive');
    await stand(page, -4.4, -0.2, -4.4, -2);
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.simulate(0.2));
    expect(['flee', 'leave']).toContain((await hk(page, 'critters')).crows[0].st);
    expect(await hk(page, 'plots[2].s')).toBe('cultivo');
    // espíritu del clima: mantener USAR cerca
    expect(await page.evaluate(() => /** @type {any} */ (window).__granja_runas.spawn('spirit'))).toBe(true);
    const sp = (await hk(page, 'critters')).spirits.find(s => s.on);
    await stand(page, sp.x + 1, sp.z, sp.x, sp.z);
    await focusIs(page, 'espiritu0');
    await expect(page.locator('#prompt')).toContainText('Calmar');
    const rocio0 = await hk(page, 'inv.rocio');
    if (isMobile) {
      const b = /** @type {any} */ (await page.locator('.k3-btn[aria-label="act"]').boundingBox());
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      await expect.poll(() => hk(page, 'inv.rocio'), POLL).toBe(rocio0 + 1);
      await page.mouse.up();
    } else {
      await page.keyboard.down('KeyE');
      await expect.poll(() => hk(page, 'inv.rocio'), POLL).toBe(rocio0 + 1);
      await page.keyboard.up('KeyE');
    }
    expectNoErrors(errors);
  });

  test('escenarios: granja → mercado → granja → bosque → granja caminando por las salidas', async ({ page }) => {
    const errors = await start(page, false);
    // Determinista: con la tecla apretada se avanza la simulación a mano (no depende de los fps del CI) y,
    // ya en el escenario nuevo, se sigue apretando 1,5 s más: antes eso hacía rebotar a la salida (la cámara
    // del escenario nuevo mira al revés y la misma dirección volvía a la puerta) según cuánto tardara el keyup.
    const sim = s => page.evaluate(x => /** @type {any} */ (window).__granja_runas.simulate(x), s);
    const walk = async (key, scene) => {
      await page.keyboard.down(key);
      for (let i = 0; i < 60 && (await hk(page, 'scene')) !== scene; i++) await sim(0.25);
      expect(await hk(page, 'scene')).toBe(scene);
      await sim(1.5);
      expect(await hk(page, 'scene'), 'no rebota a la salida con la tecla todavía apretada').toBe(scene);
      expect(await hk(page, 'state')).toBe('play');
      await page.keyboard.up(key);
    };
    await stand(page, 0, 19.6, 0, 22);
    await walk('KeyS', 'mercado');
    expect((await hk(page, 'counts')).npcsVisible).toBeGreaterThan(0);
    await stand(page, 0, -16, 0, -19);
    await walk('KeyS', 'granja');
    expect((await hk(page, 'player')).z).toBeGreaterThan(15);
    await stand(page, -21.6, 6, -24, 6);
    await walk('KeyA', 'bosque');
    expect(await page.evaluate(() => /** @type {any} */ (window).__granja_runas.ids())).toContain('santuario');
    await stand(page, 21.6, 0, 24, 0);
    await walk('KeyS', 'granja');
    // las tres escenas renderizan algo
    for (const sc of ['mercado', 'bosque', 'granja']) {
      await page.evaluate(s => /** @type {any} */ (window).__granja_runas.goto(s), sc);
      await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__granja_runas.perf.calls), POLL).toBeGreaterThan(8);
    }
    expectNoErrors(errors);
  });

  test('bosque: leña, cristal, fragmentos, santuario y cabrita perdida', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.goto('bosque'); h.set({ inv: { fragmento: 2, forraje: 1 } }); });
    await stand(page, 12, 7.8, 12, 6);
    await focusIs(page, 'tronco0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'inv.madera'), POLL).toBe(2);
    expect(await page.evaluate(() => /** @type {any} */ (window).__granja_runas.ids())).not.toContain('tronco0');
    await stand(page, -6, -12.2, -6, -14);
    await focusIs(page, 'arbusto0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'inv.fragmento'), POLL).toBe(3);
    await stand(page, -4, -2.2, -4, -4);
    await focusIs(page, 'santuario');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'seeds.arcoiris'), POLL).toBe(1);
    await stand(page, 10, 13.4, 10, 15);
    await focusIs(page, 'cabrita');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'animals.cabra.own'), POLL).toBe(true);
    expectNoErrors(errors);
  });

  test('vecinos con rutina: Don Tito almuerza en la fuente y el almacén avisa dónde está Tomás', async ({ page }) => {
    const errors = await start(page, false);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.goto('mercado'); h.setTime(12 * 60 + 20); h.simulate(8); });
    const npcs = (await hk(page, 'critters')).npcs;
    const tito = npcs.find(n => n.id === 'tito'), tomas = npcs.find(n => n.id === 'tomas');
    expect(tito.spot).toBe('fuente'); expect(Math.hypot(tito.x + 2.6, tito.z - 3.1)).toBeLessThan(0.5);
    expect(tito.x).toBeLessThan(-1);
    void tomas;
    // Tomás almuerza de 13 a 14: el mostrador avisa dónde encontrarlo
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.setTime(13 * 60 + 2));
    await stand(page, 11, -4.6, 11, -6.5);
    await focusIs(page, 'venta');
    await expect(page.locator('#prompt')).toContainText('fuente');
    expectNoErrors(errors);
  });

  test('misiones: completa la principal «Restaurar la huerta» y la secundaria «Reparar el molino»; persisten', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    // seis parcelas limpiadas con la acción real de juego (vía gancho de interacción) y cuatro cosechas
    await page.evaluate(async () => {
      const h = /** @type {any} */ (window).__granja_runas;
      h.set({ tools: { azada: 1 } });
      for (const i of [0, 1, 2, 3, 4, 7]) { for (let k = 0; k < 3 && h.plots[i].s !== 'vacia'; k++) { h.act('parcela' + i); h.simulate(0.6); } }
      for (const i of [0, 1, 2, 3]) { h.act('parcela' + i); h.simulate(0.6); }
      h.growAll();
      for (const i of [0, 1, 2, 3]) { h.act('parcela' + i); h.simulate(0.6); }
    });
    const c = await hk(page, 'campaign');
    expect(c.huerta.cleared).toBeGreaterThanOrEqual(6);
    expect(c.huerta.harvested).toBe(4);
    expect(c.huerta.done).toBe(true);
    let ms = await hk(page, 'missions');
    expect(ms.achievements.done.huerta).toBeGreaterThanOrEqual(1);
    // molino
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.set({ coins: 200, inv: { madera: 6, cristal: 2 } }); h.act('molino'); });
    expect((await hk(page, 'campaign')).mill).toBe(true);
    expect((await hk(page, 'visuals')).millSpinning).toBe(true);
    ms = await hk(page, 'missions');
    expect(ms.achievements.done.molino).toBeGreaterThanOrEqual(1);
    // persistencia tras recargar
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.flush());
    await page.reload(); await ready(page);
    const c2 = await hk(page, 'campaign');
    expect(c2.huerta.done).toBe(true); expect(c2.mill).toBe(true);
    expect((await hk(page, 'missions')).achievements.done.huerta).toBeGreaterThanOrEqual(1);
    await page.locator('#grMenu [data-go="cont"]').click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    await expect(page.locator('#quest')).toContainText('Feria');
    expectNoErrors(errors);
  });

  test('guardado corrupto o malformado: se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('gr-t')) { sessionStorage.setItem('gr-t', '1'); localStorage.setItem('granja_runas:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    expect(await page.evaluate(() => localStorage.getItem('granja_runas:save:corrupto'))).toBe('{esto no es json');
    expect(await hk(page, 'time.day')).toBe(1);
    // JSON válido pero con forma rota
    await page.evaluate(() => localStorage.setItem('granja_runas:save', JSON.stringify({ v: 2, d: { plots: 'x', coins: 'mucho', day: -4, scene: 'luna', inv: { nabo: 'a' }, storm: { state: 'raro' } } })));
    await page.reload(); await ready(page);
    expect((await hk(page, 'plots')).length).toBe(12);
    expect(typeof await hk(page, 'coins')).toBe('number');
    expect(await hk(page, 'time.day')).toBe(1);
    expect(await hk(page, 'inv.nabo')).toBe(0);
    // versión vieja (v1): migra el campo money → coins
    await page.evaluate(() => localStorage.setItem('granja_runas:save', JSON.stringify({ v: 1, d: { money: 321, day: 3 } })));
    await page.reload(); await ready(page);
    expect(await hk(page, 'coins')).toBe(321);
    expect(await hk(page, 'time.day')).toBe(3);
    await page.locator('#grMenu [data-go="cont"]').click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expectNoErrors(errors);
  });

  test('dificultad: el selector cambia la tabla de efectos y el crecimiento medido', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const measure = async () => {
      await page.locator('#grMenu [data-go]').first().click();
      await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
      return page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas;
        h.set({ plots: h.plots.map((p, i) => i === 5 ? { s: 'cultivo', crop: 'nabo', g: 0, w: 1, frost: 0, hits: 0 } : p) }); h.simulate(10); return h.plots[5].g; });
    };
    await page.locator('.mlm-diff button[data-d="facil"]').click();
    await expect(page.locator('#grDiffInfo')).toContainText('×1.3');
    expect((await hk(page, 'difficulty')).growth).toBe(1.3);
    const gEasy = await measure();
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.pause());
    await page.locator('.mla-pause button', { hasText: 'Menú principal' }).click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('menu');
    await page.locator('.mlm-diff button[data-d="dificil"]').click();
    expect((await hk(page, 'difficulty')).telegraph).toBe(2.4);
    const gHard = await measure();
    expect(gEasy).toBeGreaterThan(gHard * 1.4);
    expectNoErrors(errors);
  });

  test('calidad: baja/alta cambian resolución, sombras, niebla y densidad de vegetación', async ({ page }) => {
    const errors = await start(page, false);
    const at = async q => {
      await page.evaluate(q => /** @type {any} */ (window).MLArcade.settings.set('quality', q), q);
      await expect.poll(() => hk(page, 'perf.quality'), POLL).toBe(q);
      await wait(page, 400);
      return hk(page, 'perf');
    };
    const low = await at('low'); const lowFlora = await hk(page, 'counts.flora');
    const high = await at('high'); const highFlora = await hk(page, 'counts.flora');
    expect(low.shadows).toBe(false); expect(high.shadows).toBe(true);
    expect(low.pixelRatio).toBeLessThanOrEqual(1);
    expect(low.fogFar).toBeLessThan(high.fogFar);
    expect(lowFlora).toBeLessThan(highFlora * 0.5);
    await expect.poll(async () => (await hk(page, 'perf')).tris, POLL).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('Estación de Tormentas: intro, 3 fases con reglas distintas y recompensa (entrada real)', async ({ page, isMobile }) => {
    test.setTimeout(150_000);
    const errors = await start(page, isMobile);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas;
      h.set({ plots: h.plots.map((p, i) => ({ s: i < 10 ? 'cultivo' : 'vacia', crop: 'trigo', g: 0.7, w: 1, frost: 0, hits: 0 })) }); h.startStorm(); });
    expect(await hk(page, 'state')).toBe('cutscene');
    expect((await hk(page, 'storm')).phase).toBe(0);
    await use(page, isMobile); // saltear la intro
    await expect.poll(() => hk(page, 'storm.phase'), POLL).toBe(1);
    expect((await hk(page, 'storm')).atRisk).toBe(12);
    // fase 1: cubrir con lona
    await stand(page, -9.6, -0.3, -9.6, -2);
    await focusIs(page, 'parcela0');
    await expect(page.locator('#prompt')).toContainText('lona');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'storm.tarps'), POLL).toBe(5);
    expect((await hk(page, 'visuals')).tarps[0]).toBe(true);
    // aviso telegráfico antes de cada ráfaga
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.simulate(1.3));
    expect((await hk(page, 'visuals')).marks.some(Boolean)).toBe(true);
    // fase 2: cambio de reglas (se pierden las lonas), pararrayos y compuertas
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.stormSkip());
    expect((await hk(page, 'storm')).phase).toBe(2);
    expect((await hk(page, 'visuals')).tarps.some(Boolean)).toBe(false);
    await stand(page, -14.8, -1.6, -13.2, -1.6);
    await focusIs(page, 'pararrayos0');
    await use(page, isMobile);
    await expect.poll(() => hk(page, 'storm.rods[0]'), POLL).toBe(3);
    for (const [k, x] of [[0, -12.6], [1, 1.4]]) {
      await stand(page, x, 5.0, x, 3.4);
      await focusIs(page, 'compuerta' + k);
      await use(page, isMobile);
      await expect.poll(() => hk(page, `storm.gates[${k}]`), POLL).toBe(true);
    }
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.simulate(3));
    expect((await hk(page, 'storm')).flood).toBeLessThan(0.5);
    // fase 3: melodía de campanas
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.stormSkip());
    expect((await hk(page, 'storm')).phase).toBe(3);
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.simulate(5));
    expect((await hk(page, 'storm')).showing).toBe(false);
    const seq = await page.evaluate(() => /** @type {any} */ (window).__granja_runas.stormSeq());
    const BELLS = [[-13.4, -4.6], [-8.6, 7.0], [1.9, -4.8]];
    for (const k of seq) {
      const before = await hk(page, 'storm.input');
      await stand(page, BELLS[k][0], BELLS[k][1] + 1.6, BELLS[k][0], BELLS[k][1]);
      await focusIs(page, 'campana' + k);
      await use(page, isMobile);
      await expect.poll(async () => { const s = await hk(page, 'storm'); return s.input > before || s.phase === 4 || !s.active; }, POLL).toBe(true);
    }
    await expect.poll(() => hk(page, 'endKind'), { timeout: 60_000 }).toBe('stormWin');
    await expect(page.locator('#grEnd')).toContainText('Cosecha rescatada');
    expect(await hk(page, 'inv.runa')).toBe(1);
    expect((await hk(page, 'campaign')).storm.state).toBe('done');
    await page.locator('#grEnd [data-cont]').click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expectNoErrors(errors);
  });

  test('tormenta perdida: pantalla de derrota recuperable y la tormenta vuelve en 2 días', async ({ page }) => {
    const errors = await start(page, false);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.startStorm(); h.stormSkip(); h.stormEnd(false); });
    expect(await hk(page, 'endKind')).toBe('stormLoss');
    await expect(page.locator('#grEnd')).toContainText(/tormenta ganó/i);
    const st = (await hk(page, 'campaign')).storm;
    expect(st.state).toBe('pending'); expect(st.day).toBe(3);
    await page.locator('#grEnd [data-cont]').click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expectNoErrors(errors);
  });

  test('derrota: desmayo sin energía (penaliza monedas) y sigue al día siguiente', async ({ page }) => {
    const errors = await start(page, false);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.set({ coins: 100 }); h.faint(); });
    expect(await hk(page, 'endKind')).toBe('faint');
    await expect(page.locator('#grEnd')).toContainText('Te desmayaste');
    expect(await hk(page, 'coins')).toBe(90);
    await page.locator('#grEnd [data-cont]').click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expect(await hk(page, 'time.day')).toBe(2);
    expect(await hk(page, 'energy')).toBe(70);
    expectNoErrors(errors);
  });

  test('victoria: feria entregada en la carpa + invernadero construido con paneles reales', async ({ page }) => {
    const errors = await start(page, false);
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas;
      h.set({ coins: 300, huerta: { cleared: 6, harvested: 4, done: true }, inv: { zanahoria: 4, trigo: 5, calabaza: 2, huevo: 1, madera: 8, cristal: 4 } }); h.goto('mercado'); });
    await stand(page, 0, 6.6, 0, 8.3);
    await focusIs(page, 'feria');
    await page.keyboard.press('KeyE');
    await expect(page.locator('#panel')).toBeVisible();
    for (const it of ['zanahoria', 'trigo', 'calabaza', 'huevo']) {
      const b = page.locator(`#panel .gr-row[data-id="feria_${it}"] button`);
      if (await b.count()) await b.click();
    }
    await expect.poll(() => hk(page, 'campaign.feria'), POLL).toBe(true);
    expect((await hk(page, 'market')).ribbon).toBe(true);
    expect((await hk(page, 'campaign')).storm.state).toBe('pending');
    // la runa sale de la tormenta (forzada a ganar)
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.startStorm(); h.stormSkip(); h.stormEnd(true); });
    await page.locator('#grEnd [data-cont]').click();
    await stand(page, -6, -6.9, -6, -8.6);
    await focusIs(page, 'obra');
    await page.keyboard.press('KeyE');
    await expect(page.locator('#panel')).toBeVisible();
    for (const k of ['madera', 'cristal', 'monedas', 'runa']) {
      const b = page.locator(`#panel .gr-row[data-id="obra_${k}"] button`);
      if (await b.count()) await b.click();
    }
    await expect.poll(() => hk(page, 'endKind'), POLL).toBe('victory');
    await expect(page.locator('#grEnd')).toContainText('VICTORIA');
    expect((await hk(page, 'visuals')).greenhouse.runes).toBe(true);
    expect((await hk(page, 'missions')).achievements.done.invernadero).toBeGreaterThanOrEqual(1);
    expect(await page.evaluate(() => /** @type {any} */ (window).MLArcade.scores.best('granja_runas'))).toBeGreaterThan(0);
    await page.locator('#grEnd [data-cont]').click();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    expect(await page.evaluate(() => /** @type {any} */ (window).__granja_runas.ids())).toContain('invernadero0');
    expectNoErrors(errors);
  });

  test('pausa congela el estado 1 s, reanudar continúa y reiniciar vuelve al amanecer', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await page.evaluate(() => /** @type {any} */ (window).__granja_runas.set({ coins: 777 }));
    await expect.poll(() => hk(page, 'time.min'), POLL).toBeGreaterThan(362);
    if (isMobile) await page.locator('.mla-bar button[aria-label="Pausa"]').tap(); else await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; return { t: h.time.min, sim: h.simTime, p: h.player, paused: h.paused }; });
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; return { t: h.time.min, sim: h.simTime, p: h.player }; });
    expect(b).toEqual({ t: a.t, sim: a.sim, p: a.p });
    expect((await sdk(page)).paused).toBe(true);
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => hk(page, 'simTime'), POLL).toBeGreaterThan(b.sim);
    // reiniciar desde la pausa: vuelve al amanecer del día (monedas y hora)
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.pause());
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => hk(page, 'coins'), POLL).toBe(40);
    expect(await hk(page, 'time.min')).toBeLessThan(370);
    expect(await hk(page, 'state')).toBe('play');
    expectNoErrors(errors);
  });

  test('tocar/clic en un objeto: la granjera camina hasta el pozo y lo usa', async ({ page, isMobile }) => {
    const errors = await start(page, isMobile);
    await stand(page, -1, 4, 2.6, 0.6);
    await wait(page, 400);
    const pt = await page.evaluate(() => /** @type {any} */ (window).__granja_runas.screenOf('pozo'));
    expect(pt.vis).toBe(true);
    if (isMobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
    await expect.poll(async () => (await hk(page, 'player')).x, POLL).toBeGreaterThan(0);
    await expect.poll(() => hk(page, 'water'), POLL).toBe(4);
    expectNoErrors(errors);
  });

  test('controles táctiles y diseño de celular sin solapes (vertical y horizontal)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    const errors = await start(page, true);
    const seed0 = await hk(page, 'seedSel');
    await page.locator('.k3-btn[aria-label="seed"]').tap();
    await expect.poll(() => hk(page, 'seedSel'), POLL).not.toBe(seed0);
    await page.locator('.k3-btn[aria-label="diary"]').tap();
    await expect(page.locator('#panel')).toBeVisible();
    await page.locator('#panel .gr-x').tap();
    await expect(page.locator('#panel')).toBeHidden();
    for (const [w, h] of [[412, 915], [915, 412]]) {
      await page.setViewportSize({ width: w, height: h });
      await stand(page, -9.6, -1.0, -9.6, -2);
      await expect(page.locator('#prompt')).toBeVisible();
      await wait(page, 300);
      const r = await page.evaluate(() => {
        const rect = el => { if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const b = el.getBoundingClientRect(); return b.width && b.height ? { l: b.left, t: b.top, r: b.right, b: b.bottom, id: el.id || el.className } : null; };
        const els = [document.getElementById('stat'), document.getElementById('quest'), document.getElementById('coach'), document.getElementById('prompt'), document.querySelector('.mla-bar'), document.querySelector('.k3-joy'), ...document.querySelectorAll('.k3-btn')].map(rect).filter(Boolean);
        const over = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) over.push(a.id + ' × ' + b.id); }
        const off = els.filter(e => e.l < 0 || e.t < 0 || e.r > innerWidth + 0.5 || e.b > innerHeight + 0.5).map(e => e.id);
        return { over, off, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
      });
      expect(r.over, `solapes en ${w}×${h}`).toEqual([]);
      expect(r.off, `fuera de pantalla en ${w}×${h}`).toEqual([]);
      expect(r.sw).toBeLessThanOrEqual(r.w); expect(r.sh).toBeLessThanOrEqual(r.h);
    }
    expectNoErrors(errors);
  });
  /* ======================= móvil ======================= */
  const SIZES = [[360, 640], [390, 844], [412, 915], [915, 412], [844, 390]];
  /** Rectángulos visibles de la UI propia + barra del SDK + controles táctiles; devuelve solapes, salidas de pantalla y blancos chicos. */
  const layoutCheck = (page, extra = []) => page.evaluate(extra => {
    const vis = el => { if (!el) return false; for (let e = el; e; e = e.parentElement) { if (e.hidden) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const R = (el, id) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, id }; };
    const sel = ['#stat', '#quest', '#coach', '#prompt', '#stormHud', '.k3-joy', ...extra];
    const els = [];
    for (const q of sel) document.querySelectorAll(q).forEach((el, i) => vis(el) && els.push(R(el, q + (i ? i : ''))));
    document.querySelectorAll('.k3-btn').forEach(el => vis(el) && els.push(R(el, 'btn:' + el.getAttribute('aria-label'))));
    const bar = document.querySelector('.mla-bar'); const btns = [...(bar ? bar.querySelectorAll('button') : [])].filter(vis).map(b => R(b, 'sdk:' + (b.getAttribute('aria-label') || '')));
    const all = [...els, ...btns], over = [];
    const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (!(all[i].id.startsWith('sdk:') && all[j].id.startsWith('sdk:')) && hit(all[i], all[j])) over.push(all[i].id + ' × ' + all[j].id);
    const off = all.filter(e => e.l < -0.5 || e.t < -0.5 || e.r > innerWidth + 0.5 || e.b > innerHeight + 0.5).map(e => e.id);
    const small = [...document.querySelectorAll('.k3-btn, #coachSkip, #quest, #panel button, .mla-bar button')].filter(vis).map(el => R(el, el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20))).filter(r => r.w < 44 - 0.5 || r.h < 44 - 0.5).map(r => `${r.id} ${r.w | 0}×${r.h | 0}`);
    return { over, off, small, sw: document.documentElement.scrollWidth, w: innerWidth };
  }, extra);

  test('móvil: matriz de tamaños (vertical/apaisado) — menú, HUD, tutorial, misión, paneles y rotación en partida', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    test.setTimeout(180_000);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    // menú: el botón principal entra en pantalla, mide ≥ 56 px y no se tapa con nada
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await wait(page, 150);
      const m = await page.evaluate(() => {
        const b = /** @type {HTMLElement} */ (document.querySelector('#grMenu [data-go]')).getBoundingClientRect();
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        const sm = [...document.querySelectorAll('#grMenu button')].map(x => x.getBoundingClientRect()).filter(r => r.width && (r.height < 43.5 || r.width < 43.5)).length;
        const panel = /** @type {HTMLElement} */ (document.querySelector('#grMenu .k3-panel')).getBoundingClientRect();
        return { b: { t: b.top, b: b.bottom, h: b.height }, onTop: !!(top && top.closest('[data-go]')), sm, sw: document.documentElement.scrollWidth, fits: panel.bottom <= innerHeight + 0.5 && panel.top >= -0.5 };
      });
      expect(m.b.t, `menú ${w}×${h}`).toBeGreaterThanOrEqual(0); expect(m.b.b).toBeLessThanOrEqual(h);
      expect(m.b.h).toBeGreaterThanOrEqual(55.5);
      expect(m.onTop, `Jugar tapado en ${w}×${h}`).toBe(true);
      expect(m.sm, `botones del menú < 44 px en ${w}×${h}`).toBe(0);
      expect(m.fits, `menú cortado en ${w}×${h}`).toBe(true);
      expect(m.sw).toBeLessThanOrEqual(w);
    }
    // arranque sólo con toques
    await page.setViewportSize({ width: 360, height: 640 });
    await page.locator('#grMenu [data-go]').first().tap();
    await expect.poll(() => hk(page, 'state'), POLL).toBe('play');
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      // el evento resize llega con el siguiente cuadro (lento con SwiftShader): se espera a que el HUD se reacomode
      await expect.poll(async () => (await layoutCheck(page)).over, { ...POLL, message: `solapes en ${w}×${h}` }).toEqual([]);
      const r = await layoutCheck(page);
      expect(r.over, `solapes con tutorial en ${w}×${h}`).toEqual([]);
      expect(r.off, `fuera de pantalla en ${w}×${h}`).toEqual([]);
      expect(r.small, `blancos < 44 px en ${w}×${h}`).toEqual([]);
      expect(r.sw).toBeLessThanOrEqual(r.w);
    }
    // saltar el tutorial con un toque; la misión aparece plegada y se despliega tocándola (sin hacer caminar)
    await page.locator('#coachSkip').tap();
    await expect(page.locator('#coach')).toBeHidden();
    await expect(page.locator('#quest')).toBeVisible();
    const p0 = await hk(page, 'player');
    await page.locator('#quest').tap();
    await expect(page.locator('#quest')).toHaveClass(/open/);
    await wait(page, 300);
    expect((await hk(page, 'player')).x).toBeCloseTo(p0.x, 1);
    await stand(page, -9.6, -1.0, -9.6, -2);
    await expect(page.locator('#prompt')).toBeVisible();
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await expect.poll(async () => (await layoutCheck(page)).over, { ...POLL, message: `solapes en ${w}×${h}` }).toEqual([]);
      const r = await layoutCheck(page);
      expect(r.over, `solapes en partida en ${w}×${h}`).toEqual([]);
      expect(r.off, `fuera de pantalla en ${w}×${h}`).toEqual([]);
      expect(r.small, `blancos < 44 px en ${w}×${h}`).toEqual([]);
      // panel (diario) dentro de pantalla y debajo de la barra del SDK, con botones ≥ 44 px
      await page.evaluate(() => /** @type {any} */ (window).__granja_runas.openDiary());
      await expect(page.locator('#panel .gr-card')).toBeVisible();
      const pr = await layoutCheck(page, ['#panel .gr-card']);
      expect(pr.over.filter(x => x.includes('.gr-card') && x.includes('sdk:')), `panel bajo la barra en ${w}×${h}`).toEqual([]);
      expect(pr.off.filter(x => x.includes('.gr-card'))).toEqual([]);
      expect(pr.small, `botones del panel < 44 px en ${w}×${h}`).toEqual([]);
      await page.locator('#panel .gr-x').tap();
      await expect(page.locator('#panel')).toBeHidden();
    }
    // la rotación no rompió el estado: sigue jugando y USAR (toque) limpia la maleza
    expect(await hk(page, 'state')).toBe('play');
    await focusIs(page, 'parcela0');
    await page.locator('.k3-btn[aria-label="act"]').tap();
    await expect.poll(() => hk(page, 'plots[0].hits'), POLL).toBe(1);
    expectNoErrors(errors);
  });

  test('móvil: multitáctil (joystick + USAR a la vez) y deslizar gira la cámara sin caminar', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    const errors = await start(page, true);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
    const joy = /** @type {any} */ (await page.locator('.k3-joy').boundingBox()), act = /** @type {any} */ (await page.locator('.k3-btn[aria-label="seed"]').boundingBox());
    const jx = joy.x + joy.width / 2, jy = joy.y + joy.height / 2, ax = act.x + act.width / 2, ay = act.y + act.height / 2;
    const p0 = await hk(page, 'player'), seed0 = await hk(page, 'seedSel');
    await touch('touchStart', [[jx, jy]]);
    await touch('touchMove', [[jx, jy - 55]]);
    // segundo dedo en 🌱 mientras el primero sigue en el joystick
    await touch('touchStart', [[jx, jy - 55], [ax, ay]]);
    await touch('touchEnd', [[jx, jy - 55]]);
    await expect.poll(() => hk(page, 'seedSel'), POLL).not.toBe(seed0);
    await expect.poll(async () => p0.z - (await hk(page, 'player')).z, POLL).toBeGreaterThan(1);
    await touch('touchEnd', []);
    // deslizar de costado sobre el campo: gira la cámara (evento camSwipe) y no deja marca de caminar
    await wait(page, 300);
    const p1 = await hk(page, 'player');
    const W = page.viewportSize().width, H = page.viewportSize().height;
    await touch('touchStart', [[W * 0.3, H * 0.45]]);
    for (let k = 1; k <= 6; k++) await touch('touchMove', [[W * 0.3 + k * 30, H * 0.45]]);
    await touch('touchEnd', []);
    await expect.poll(() => hk(page, 'lastEvent'), POLL).toBe('camSwipe:1');
    await wait(page, 400);
    const p2 = await hk(page, 'player');
    expect(Math.hypot(p2.x - p1.x, p2.z - p1.z), 'deslizar no es un toque para caminar').toBeLessThan(0.2);
    expectNoErrors(errors);
  });

  test('móvil: panel largo en apaisado — se desplaza, comprar no lo vuelve arriba y avisa que hay más', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    const errors = await start(page, true);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => { const h = /** @type {any} */ (window).__granja_runas; h.goto('mercado'); h.set({ coins: 900 }); h.act('decoracion'); });
    const rows = page.locator('#panel .gr-rows');
    await expect(rows).toHaveClass(/more/);
    await rows.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(rows).not.toHaveClass(/more/);
    const top0 = await rows.evaluate(el => el.scrollTop);
    expect(top0).toBeGreaterThan(20);
    const last = page.locator('#panel .gr-row:last-child button');
    await last.tap();
    await expect.poll(() => hk(page, 'coins'), POLL).toBeLessThan(900);
    expect(await rows.evaluate(el => el.scrollTop)).toBeGreaterThan(top0 - 2);
    expectNoErrors(errors);
  });
});
