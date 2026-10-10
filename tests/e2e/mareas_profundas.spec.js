// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait } from './helpers.js';

// Mareas Profundas (Three.js 0.186). En headless el WebGL es SwiftShader (CPU) y puede ir a 1-5 FPS: las pruebas de
// jugabilidad congelan el bucle real (?debug → freeze) y avanzan con simulate() en pasos fijos, mientras las teclas y
// toques reales siguen apretados: la entrada es real y el tiempo de juego es determinista.

const FILE = 'mareas_profundas.html';
const DBG = 'mareas_profundas.html?debug';
const T = (page, body) => page.evaluate(`(()=>{ const T = window.__mareas_profundas; ${body} })()`);
const D = (page, call) => page.evaluate(`window.__mareas_profundas.debug.${call}`);
const POLL = { timeout: 45_000 };

async function ready(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__mareas_profundas?.state === 'menu' && /** @type {any} */ (window).__mareas_profundas.perf.frames > 1, null, { timeout: 60_000 });
}
/** Arranca desde el menú con entrada real (Enter en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#mp-menu [data-go]').tap();
  else { await page.locator('#mp-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
}
/** Arranque determinista: menú con entrada real y bucle congelado. */
async function startFrozen(page, isMobile) { await start(page, isMobile); await D(page, 'freeze(true)'); await D(page, 'setRes({energy:100,hull:100,o2:100})'); }
const sim = (page, s) => D(page, `simulate(${s})`);
/** Mantiene una tecla mientras corre un tramo de simulación determinista. */
async function hold(page, key, s) { await page.keyboard.down(key); await sim(page, s); await page.keyboard.up(key); }
async function press(page, isMobile, key, btn) {
  if (isMobile) await page.locator(`.k3-btn[aria-label="${btn}"]`).tap(); else await page.keyboard.press(key);
  await sim(page, 0.05);
}
const cdps = new WeakMap();
async function touch(page, type, x, y) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
const mission = (page, id) => T(page, `return T.missions.current.find(m => m.id === '${id}')`);

test.describe('Mareas Profundas', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(240_000); });

  test('carga sin errores: menú con crédito, dificultad y fondo 3D', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#mp-menu h1')).toContainText('MAREAS PROFUNDAS');
    await expect(page.locator('#mp-menu .mp-credit')).toContainText('CREADO POR');
    await expect(page.locator('#mp-menu [role=radiogroup] [role=radio]')).toHaveCount(4);
    const s = await T(page, 'return { calls: T.perf.calls, scene: T.scene }');
    expect(s.scene).toBe('Arrecifes Bioluminiscentes');
    expect(s.calls).toBeGreaterThan(10);
    expect(s.calls).toBeLessThan(140);
    expectNoErrors(errors);
  });

  test('arranque con entrada real: avanzar, girar, subir y bajar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type))).toContain('start');
    await expect(page.locator('#mp-left')).toBeVisible();
    await D(page, 'teleport(0,-12,30,Math.PI)');
    const p0 = await T(page, 'return T.player');
    if (isMobile) {
      const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await touch(page, 'touchStart', cx, cy); await touch(page, 'touchMove', cx, cy - 55);
      await sim(page, 1.2);
      await touch(page, 'touchEnd', 0, 0);
      expect((await T(page, 'return T.player')).z).toBeLessThan(p0.z - 1.5);
      await touch(page, 'touchStart', cx, cy); await touch(page, 'touchMove', cx + 55, cy);
      await sim(page, 0.6);
      await touch(page, 'touchEnd', 0, 0);
      expect(Math.abs((await T(page, 'return T.player.yaw')) - p0.yaw)).toBeGreaterThan(0.4);
      const y0 = (await T(page, 'return T.player.y'));
      const up = page.locator('.k3-btn[aria-label="up"]'); const ub = /** @type {any} */ (await up.boundingBox());
      await touch(page, 'touchStart', ub.x + ub.width / 2, ub.y + ub.height / 2); await sim(page, 1); await touch(page, 'touchEnd', 0, 0);
      expect((await T(page, 'return T.player.y'))).toBeGreaterThan(y0 + 0.8);
    } else {
      await hold(page, 'KeyW', 1.2);
      expect((await T(page, 'return T.player')).z).toBeLessThan(p0.z - 1.5);
      await hold(page, 'KeyD', 0.6);
      expect(Math.abs((await T(page, 'return T.player.yaw')) - p0.yaw)).toBeGreaterThan(0.4);
      const y0 = (await T(page, 'return T.player.y'));
      await hold(page, 'Space', 1);
      expect((await T(page, 'return T.player.y'))).toBeGreaterThan(y0 + 0.8);
      await hold(page, 'ShiftLeft', 2);
      expect((await T(page, 'return T.player.y'))).toBeLessThan(y0);
    }
    // el empuje consume energía
    expect(await T(page, 'return T.energy')).toBeLessThan(100);
    expectNoErrors(errors);
  });

  test('tutorial contextual: aparece, se salta y se reactiva desde la ayuda', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect(page.locator('#mp-tip')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#mp-tip')).toContainText(isMobile ? 'joystick' : 'W/S');
    await page.locator('#mp-tip [data-t="skip"]').click();
    await expect(page.locator('#mp-tip')).toBeHidden();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(true);
    await page.locator('.mla-bar button[aria-label="Pausa"]').click();
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'Cómo jugar' }).click();
    await expect(page.locator('#mp-help')).toBeVisible();
    await expect(page.locator('#mp-help')).toContainText('Leviatán');
    await page.locator('#mp-help [data-retut]').click();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(false);
    await expect(page.locator('.mla-pause')).toBeVisible();
    expectNoErrors(errors);
  });

  test('sondas científicas (E/USAR) abren la puerta acuática; módulo de buceo recarga y sube el límite; persiste', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    // módulo de buceo: acoplar con USAR
    await D(page, 'at("module:reef",0,0,1)'); await D(page, 'setRes({energy:40,hull:60,o2:50})'); await sim(page, 0.1);
    expect(await T(page, 'return T.prompt')).toBe('Acoplar al módulo de buceo');
    expect(await T(page, 'return T.limit')).toBe(80);
    await press(page, isMobile, 'KeyE', 'use');
    await sim(page, 3);
    let r = await T(page, 'return { d: T.player.docked, e: T.energy, h: T.hull, o: T.o2, lim: T.limit, cp: T.save.cp }');
    expect(r.d).toBe('reef'); expect(r.e).toBeGreaterThan(70); expect(r.h).toBeGreaterThan(75); expect(r.o).toBeGreaterThan(95);
    expect(r.lim).toBe(150); expect(r.cp).toBe('module');
    // sondas: prompt, animación (mástil) y estado
    for (const id of ['p1', 'p2', 'p3']) {
      await D(page, `at("probe:${id}",0,1.5,0)`); await sim(page, 0.1);
      expect(await T(page, 'return T.prompt')).toBe('Activar sonda científica');
      await press(page, isMobile, 'KeyE', 'use');
      await sim(page, 0.3);
      expect((await T(page, 'return T.puzzle.probes'))[id]).toBe(true);
    }
    await sim(page, 1);
    expect((await T(page, 'return T.puzzle.gates')).reef_city).toBe(true);
    await page.reload();
    await ready(page);
    await expect(page.locator('#mp-menu [data-go]')).toContainText('Continuar');
    const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('mareas_profundas:save') || '{}').d);
    expect(sv.probes).toEqual({ p1: true, p2: true, p3: true });
    expect(sv.modules.reef).toBe(true);
    expectNoErrors(errors);
  });

  test('escombros movibles con el casco → ruina oculta (secundaria) persistente tras recargar', async ({ page, isMobile }) => {
    test.skip(isMobile, 'empuje con teclado; el joystick se prueba en otra prueba');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    // la losa tapa la entrada: sólo se ve el aviso (sin tecla)
    await D(page, 'teleport(-43.8,-28.4,-10.3,Math.PI)'); await sim(page, 0.1);
    expect(await T(page, 'return T.prompt')).toBe('Empujá los escombros con el casco');
    await hold(page, 'KeyW', 3.5);
    let dz = await T(page, 'return T.puzzle.debris.ruina');
    expect(dz.off).toBeLessThan(-3.5);
    expect(dz.cleared).toBe(true);
    // entrar a la cámara
    await D(page, 'teleport(-44,-27.5,-14,-Math.PI/2)');
    await hold(page, 'KeyW', 3);
    await expect.poll(() => T(page, 'return T.save.ruin'), POLL).toBe(true);
    expect((await mission(page, 'ruina')).status).toBe('done');
    await page.reload();
    await ready(page);
    const after = await page.evaluate(() => ({ save: JSON.parse(localStorage.getItem('mareas_profundas:save') || '{}').d, missions: JSON.parse(localStorage.getItem('ml:missions') || '{}').mareas_profundas }));
    expect(after.save.ruin).toBe(true);
    expect(after.save.debris.ruina).toBeLessThan(-3.5);
    expect(after.missions.done.ruina).toBeGreaterThan(0);
    await start(page, false);
    expect((await T(page, 'return T.puzzle.debris.ruina')).cleared).toBe(true);
    expectNoErrors(errors);
  });

  test('escanear fauna (mantener USAR) completa la misión principal; foto (C/FOTO) registra especies', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    const targets = ['medusa', 'manta', 'tortuga', 'linterna'];
    for (const sp of targets) {
      // ubicarse frente a la especie
      const pos = await T(page, `return T.creatures.find(c => c.species === '${sp}')`);
      await D(page, `teleport(${pos.x},${pos.y},${pos.z + 8},Math.PI)`); await D(page, `face(${pos.x},${pos.y},${pos.z})`);
      await sim(page, 0.05);
      expect(await T(page, 'return T.scan.target')).toBe(sp);
      if (isMobile) {
        const b = /** @type {any} */ (await page.locator('.k3-btn[aria-label="use"]').boundingBox());
        await touch(page, 'touchStart', b.x + b.width / 2, b.y + b.height / 2); await sim(page, 1.3); await touch(page, 'touchEnd', 0, 0);
      } else await hold(page, 'KeyE', 1.3);
      await D(page, 'setRes({hull:100,energy:100})');
      expect(await T(page, 'return T.save.scanned')).toContain(sp);
    }
    expect((await mission(page, 'fauna')).status).toBe('done');
    // foto con una especie en cuadro
    const m = await T(page, 'return T.creatures.find(c => c.species === "manta")');
    await D(page, `teleport(${m.x},${m.y + 1},${m.z + 9},Math.PI)`); await D(page, `face(${m.x},${m.y},${m.z})`); await sim(page, 1.2);
    await D(page, `face(${(await T(page, 'return T.creatures.find(c => c.species === "manta")')).x},${m.y},${m.z})`); await sim(page, 0.05);
    await press(page, isMobile, 'KeyC', 'photo');
    expect((await T(page, 'return T.save.photos')).length).toBeGreaterThan(0);
    expect((await mission(page, 'fotos')).progress).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('sonar (Q/SONAR) y luz (L/LUZ): pulso con ecos, gasta energía, aturde drones y espanta anguilas', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'goto(2)'); await D(page, 'freeze(true)'); await D(page, 'give("reef")');
    // dron: ponerse delante de su reflector para que alerte
    const dr = await T(page, 'return T.creatures.find(c => c.kind === "drone")');
    await D(page, `teleport(${dr.x},${dr.y},${dr.z},0)`); await sim(page, 0.1);
    const e0 = await T(page, 'return T.energy');
    await press(page, isMobile, 'KeyQ', 'sonar');
    await sim(page, 1.5);
    const st = await T(page, 'return T.creatures.filter(c => c.kind === "drone").map(c => c.state)');
    expect(st).toContain('jammed');
    expect(await T(page, 'return T.energy')).toBeLessThan(e0 - 2);
    // anguila: el pulso la esconde
    await D(page, 'teleport(12,-52,-39,Math.PI)'); await sim(page, 2);
    await press(page, isMobile, 'KeyQ', 'sonar'); await sim(page, 1.2);
    expect(await T(page, 'return T.creatures.find(c => c.kind === "eel" && Math.abs(c.x - 12) < 3).state')).toBe('scared');
    // luz: L apaga y prende los focos
    await press(page, isMobile, 'KeyL', 'light');
    expect(await T(page, 'return T.player.light')).toBe(false);
    await press(page, isMobile, 'KeyL', 'light');
    expect(await T(page, 'return T.player.light')).toBe(true);
    expectNoErrors(errors);
  });

  test('Ciudad: puertas hidráulicas (válvula), escombros sobre el panel, caja negra al módulo (principal) y puerta a la fosa', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mismo recorrido; los toques se cubren en otras pruebas');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    await D(page, 'goto(2)'); await D(page, 'freeze(true)'); await D(page, 'give("reef")');
    // puerta hidráulica sur: cerrada y sólida → válvula → se levanta y deja pasar
    expect((await T(page, 'return T.puzzle.doors.d1'))).toMatchObject({ open: false, solid: true });
    await D(page, 'at("door:d1",0,0,1.2)'); await sim(page, 0.1);
    expect(await T(page, 'return T.prompt')).toBe('Girar la válvula hidráulica');
    await page.keyboard.press('KeyE'); await sim(page, 3);
    expect((await T(page, 'return T.puzzle.doors.d1'))).toMatchObject({ open: true, solid: false });
    await D(page, 'teleport(0,-52,27,Math.PI)'); await hold(page, 'KeyW', 2);
    expect((await T(page, 'return T.player.z'))).toBeLessThan(21);
    // panel norte tapado por escombros
    await D(page, 'at("door:d2",0,0,0)'); await sim(page, 0.1);
    expect(await T(page, 'return T.prompt')).toContain('escombros');
    await D(page, 'teleport(-5.4,-54,-15.6,-Math.PI/2)');
    await hold(page, 'KeyW', 3);
    expect((await T(page, 'return T.puzzle.debris.panel')).cleared).toBe(true);
    await D(page, 'at("door:d2",0,0,0.6)'); await sim(page, 0.1);
    expect(await T(page, 'return T.prompt')).toBe('Girar la válvula hidráulica');
    await page.keyboard.press('KeyE'); await sim(page, 3);
    expect((await T(page, 'return T.puzzle.doors.d2')).open).toBe(true);
    // la puerta a la fosa sigue sellada
    await D(page, 'at("gate:city_trench",0,0,0)'); await sim(page, 0.1);
    expect(await T(page, 'return T.prompt')).toContain('caja negra');
    // caja negra: enganchar y entregar acoplando en el módulo
    await D(page, 'at("cargo:blackbox",0,1.2,2)'); await D(page, 'face(12,-55,-44.5)'); await sim(page, 0.05);
    expect(await T(page, 'return T.prompt')).toBe('Enganchar la caja negra');
    await page.keyboard.press('KeyE'); await sim(page, 0.1);
    expect(await T(page, 'return T.player.carrying')).toBe('blackbox');
    await D(page, 'at("module:city",0,0,1)'); await sim(page, 0.05);
    await page.keyboard.press('KeyE'); await sim(page, 0.5);
    const s = await T(page, 'return T.save');
    expect(s.blackbox).toBe('delivered');
    expect(s.modules.city).toBe(true);
    expect((await mission(page, 'caja')).status).toBe('done');
    expect(await T(page, 'return T.limit')).toBe(300);
    await sim(page, 1);
    expect((await T(page, 'return T.puzzle.gates')).city_trench).toBe(true);
    expectNoErrors(errors);
  });

  test('cápsula: entregarla sin chocar cumple la secundaria; chocar la hace fallar', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica igual en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    await D(page, 'goto(2)'); await D(page, 'freeze(true)'); await D(page, 'give("reef")');
    await D(page, 'at("cargo:capsule",0,1,1.5)'); await sim(page, 0.05);
    expect(await T(page, 'return T.prompt')).toBe('Enganchar la cápsula de escape');
    await page.keyboard.press('KeyE'); await sim(page, 0.1);
    expect(await T(page, 'return T.player.carrying')).toBe('capsule');
    await D(page, 'at("module:city",0,0,1)'); await sim(page, 0.05);
    await page.keyboard.press('KeyE'); await sim(page, 0.5);
    expect(await T(page, 'return T.save.capsule')).toBe('delivered');
    expect((await mission(page, 'capsula')).status).toBe('done');
    // nueva expedición: chocar con la cápsula falla la misión
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('mareas_profundas:save')); s.d.capsule = 'alley'; localStorage.setItem('mareas_profundas:save', JSON.stringify(s)); });
    await page.evaluate(() => localStorage.setItem('ml:missions', '{}'));
    await page.reload(); await ready(page); await startFrozen(page, false);
    await D(page, 'goto(2)'); await D(page, 'freeze(true)');
    await D(page, 'at("cargo:capsule",0,1,1.5)'); await sim(page, 0.05);
    await page.keyboard.press('KeyE'); await sim(page, 0.1);
    await D(page, 'teleport(51,-50,-0.8,-Math.PI/2)'); await hold(page, 'KeyW', 1.5);
    expect((await mission(page, 'capsula')).status).toBe('failed');
    expectNoErrors(errors);
  });

  test('rivales: medusa se carga y descarga; anguila avisa y embiste; dron alerta y persigue; pulpo marca, golpea y el flash lo ahuyenta', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica de IA: igual en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    // un solo evaluate por tramo: simula en pasos de 0,1 s y junta los estados observados (rápido aun con la CPU saturada)
    const seen = (kind, n, filter = '') => page.evaluate(`(()=>{ const T = window.__mareas_profundas, s = new Set();
      for (let i = 0; i < ${n}; i++) { T.debug.simulate(0.1); T.debug.setRes({hull:100,energy:100}); T.creatures.filter(c => c.kind === '${kind}'${filter}).forEach(c => s.add(c.state)); }
      return [...s]; })()`);
    // medusa
    const j = await T(page, 'return T.creatures.find(c => c.kind === "jelly")');
    await D(page, `teleport(${j.x + 2.5},${j.y},${j.z})`);
    const js = await seen('jelly', 40, ` && Math.abs(c.x - ${j.x}) < 6`);
    expect(js).toEqual(expect.arrayContaining(['charge', 'cool']));
    // anguila
    await D(page, 'goto(2)'); await D(page, 'freeze(true)'); await D(page, 'give("reef")');
    await D(page, 'teleport(12,-54.4,-40,Math.PI)');
    const es = await seen('eel', 30, ' && Math.abs(c.x - 12) < 3');
    expect(es).toEqual(expect.arrayContaining(['tell', 'lunge']));
    // dron
    const dr = await T(page, 'return T.creatures.find(c => c.kind === "drone")');
    await D(page, `teleport(${dr.x},${dr.y},${dr.z})`);
    const ds = await seen('drone', 30);
    expect(ds).toEqual(expect.arrayContaining(['alert', 'chase']));
    // pulpo
    await D(page, 'goto(3)'); await D(page, 'freeze(true)');
    const o = await T(page, 'return T.creatures.find(c => c.kind === "octopus")');
    await D(page, `teleport(${o.x + 9},${o.y + 2},${o.z})`); await D(page, `face(${o.x},${o.y},${o.z})`);
    const os = await seen('octopus', 40);
    expect(os).toEqual(expect.arrayContaining(['warn']));
    expect(os.some(x => x === 'aim' || x === 'ink')).toBe(true);
    await D(page, `teleport(${o.x + 9},${o.y + 2},${o.z})`); await D(page, `face(${o.x},${o.y + 1},${o.z})`); await sim(page, 0.05);
    await page.keyboard.press('KeyC'); await sim(page, 0.1);
    expect(await T(page, 'return T.creatures.find(c => c.kind === "octopus").state')).toBe('flee');
    expectNoErrors(errors);
  });

  test('los tres escenarios cargan y transicionan por las puertas acuáticas con E', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mismo recorrido que escritorio');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    await D(page, 'probes()');
    await sim(page, 1);
    await D(page, 'at("gate:reef_city",0,0,0)'); await sim(page, 0.05);
    expect(await T(page, 'return T.prompt')).toBe('Descender a la Ciudad Sumergida');
    await page.keyboard.press('KeyE'); await sim(page, 0.8);
    expect(await T(page, 'return T.scene')).toBe('Ciudad Sumergida');
    expect(await T(page, 'return T.depth')).toBeGreaterThan(60);
    // volver y regresar
    await D(page, 'at("gate:city_reef",0,0,0)'); await sim(page, 0.05);
    await page.keyboard.press('KeyE'); await sim(page, 0.8);
    expect(await T(page, 'return T.scene')).toBe('Arrecifes Bioluminiscentes');
    await D(page, 'goto(2)'); await D(page, 'freeze(true)'); await D(page, 'give("blackbox")'); await sim(page, 1);
    await D(page, 'at("gate:city_trench",0,0,0)'); await sim(page, 0.05);
    await page.keyboard.press('KeyE'); await sim(page, 0.8);
    expect(await T(page, 'return T.scene')).toBe('Fosa Silenciosa');
    const c = await T(page, 'return T.counts');
    expect(c.octopus).toBe(1); expect(c.anglers).toBeGreaterThan(2); expect(c.colliders).toBeGreaterThan(20);
    await D(page, 'at("gate:trench_city",0,0,0)'); await sim(page, 0.05);
    await page.keyboard.press('KeyE'); await sim(page, 0.8);
    expect(await T(page, 'return T.scene')).toBe('Ciudad Sumergida');
    expectNoErrors(errors);
  });

  test('Leviatán Abisal: intro, 3 fases (embestidas+válvulas, caza a ciegas con sonar, apagado esquivando ondas), faro y victoria', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'goto(3)'); await D(page, 'freeze(true)'); await D(page, 'give("city")');
    await D(page, 'at("console:beacon",0,0,0)'); await sim(page, 0.05);
    expect(await T(page, 'return T.prompt')).toBe('Encender el faro de la fosa');
    await press(page, isMobile, 'KeyE', 'use');
    expect(await T(page, 'return T.state')).toBe('cutscene');
    await sim(page, 6);
    let b = await T(page, 'return T.boss');
    expect(b.phase).toBe(1);
    // F1: válvulas (quedarse cerca) mientras el Leviatán embiste por su carril
    const heal = () => D(page, 'setRes({hull:100,energy:100})');
    await page.evaluate(() => { const T = /** @type {any} */ (window).__mareas_profundas;
      for (let i = 0; i < 3; i++) for (let k = 0; k < 12; k++) { const v = T.boss.valves[i]; if (v.done) break;
        T.debug.at('valve:' + i, 0, 0.5, 0); if (!v.on) T.debug.use('valve:' + i); T.debug.simulate(0.5); T.debug.setRes({ hull: 100, energy: 100 }); } });
    await sim(page, 1); await heal();
    b = await T(page, 'return T.boss');
    expect(b.valves.every(v => v.done)).toBe(true);
    expect(b.lunges).toBeGreaterThan(0);
    await sim(page, 4); await heal();
    expect(await T(page, 'return T.boss.phase')).toBe(2);
    // F2: el pulso revela las barras y atrae la mordida al punto del pulso
    await D(page, 'teleport(0,-92,16)'); await sim(page, 0.05);
    await press(page, isMobile, 'KeyQ', 'sonar'); await sim(page, 1.5); await heal();
    b = await T(page, 'return T.boss');
    expect(b.rods.every(r => r.state === 'revealed')).toBe(true);
    expect(['tell', 'dash']).toContain(b.mode);
    for (let i = 0; i < b.need; i++) {
      await D(page, 'revealRods()');
      await D(page, `at("rod:${i}",0,1,0)`); await sim(page, 0.05);
      expect(await T(page, 'return T.prompt')).toBe('Recoger barra de control');
      await press(page, isMobile, 'KeyE', 'use'); await heal();
      await D(page, 'at("console:insert",0,0,1)'); await sim(page, 0.05);
      await press(page, isMobile, 'KeyE', 'use'); await heal();
    }
    expect(await T(page, 'return T.boss.inserted')).toBe(b.need);
    await sim(page, 4); await heal();
    expect(await T(page, 'return T.boss.phase')).toBe(3);
    // F3: iniciar el apagado y esquivar las ondas cambiando de banda
    await D(page, 'at("console:shutdown",0,0,1)'); await sim(page, 0.05);
    await press(page, isMobile, 'KeyE', 'use');
    // esquivar cada onda pasando a la banda opuesta (un solo evaluate: estable con la CPU saturada)
    await page.evaluate(() => { const T = /** @type {any} */ (window).__mareas_profundas;
      for (let i = 0; i < 160; i++) { const r = T.boss; if (r.sub !== 'fight') break;
        const y = r.waveOn ? (r.bandY > -93 ? -96.5 : -88.5) : -92.5; T.debug.teleport(0, y, 9.5); T.debug.simulate(0.1); T.debug.setRes({ hull: 100, energy: 100 }); } });
    await sim(page, 9); await heal();
    b = await T(page, 'return T.boss');
    expect(b.active).toBe(false);
    expect(await T(page, 'return T.save.beacon')).toBe(true);
    expect((await mission(page, 'faro')).status).toBe('done');
    // corriente ascendente → Arrecifes → superficie junto al barco = victoria
    await D(page, 'teleport(0,-88,19)'); await sim(page, 1.2);
    expect(await T(page, 'return T.scene')).toBe('Arrecifes Bioluminiscentes');
    await D(page, 'setRes({energy:60})');
    await D(page, 'teleport(0,-4,42,0)');
    if (isMobile) { const ub = /** @type {any} */ (await page.locator('.k3-btn[aria-label="up"]').boundingBox()); await touch(page, 'touchStart', ub.x + ub.width / 2, ub.y + ub.height / 2); await sim(page, 1.5); await touch(page, 'touchEnd', 0, 0); }
    else await hold(page, 'Space', 1.5);
    await sim(page, 4);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('victory');
    await expect(page.locator('#mp-end')).toContainText('VICTORIA');
    expect((await mission(page, 'bateria')).status).toBe('done');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:scores') || '{}').mareas_profundas)).toBeGreaterThan(3000);
    expect((await T(page, 'return T.save')).wins).toBe(1);
    expectNoErrors(errors);
  });

  test('derrota por casco y por energía; reintento desde el último punto con recursos llenos', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'hurt(150)'); await sim(page, 2.5);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#mp-end')).toContainText('DERROTA');
    await expect(page.locator('#mp-end')).toContainText('CASCO');
    if (isMobile) await page.locator('#mp-end [data-retry]').tap(); else await page.locator('#mp-end [data-retry]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    expect(await T(page, 'return [T.hull, T.energy, T.o2]')).toEqual([100, 100, 100]);
    // sin energía (con O₂ en cero la electrólisis consume batería)
    await D(page, 'freeze(true)'); await D(page, 'setRes({energy:2,o2:0})'); await sim(page, 4.5);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#mp-end')).toContainText('SIN ENERGÍA');
    expectNoErrors(errors);
  });

  test('presión: pasar el límite daña el casco y acoplar en el módulo lo sube', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica igual en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    await D(page, 'goto(2)'); await D(page, 'freeze(true)');
    await D(page, 'teleport(0,-50,40,0)'); await sim(page, 0.1);
    expect(await T(page, 'return T.depth')).toBeGreaterThan(80);
    const h0 = await T(page, 'return T.hull');
    await sim(page, 2);
    expect(await T(page, 'return T.hull')).toBeLessThan(h0 - 1);
    await expect(page.locator('#mp-warn')).toContainText('PRESIÓN');
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanuda y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(0.2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, c: T.creatures, e: T.energy }');
    await wait(page, 1000);
    const b = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, c: T.creatures, e: T.energy }');
    expect(b).toEqual(a);
    expect(await T(page, 'return T.paused')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(b.r);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    const r = await T(page, 'return { r: T.runTime, hull: T.hull, score: T.score, p: T.player }');
    expect(r.r).toBeLessThan(2);
    expect(r.hull).toBe(100);
    expect(r.score).toBe(0);
    expect(Math.abs(r.p.z - 42)).toBeLessThan(3);
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('mp-once')) { sessionStorage.setItem('mp-once', '1'); localStorage.setItem('mareas_profundas:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#mp-menu [data-go]')).toContainText('Comenzar');
    expect(await page.evaluate(() => localStorage.getItem('mareas_profundas:save:corrupto'))).toBe('{esto no es json');
    await page.evaluate(() => localStorage.setItem('mareas_profundas:save', JSON.stringify({ v: 1, d: { zone: 'x', probes: 5, scanned: ['medusa', 'dragon', 3], debris: { ruina: 'mucho' }, blackbox: 'robada', opts: { sens: 99, binds: { up: 3 } }, started: true } })));
    await page.reload();
    await ready(page);
    const s = await T(page, 'return T.save');
    expect(s.zone).toBe(1);
    expect(s.probes).toEqual({});
    expect(s.scanned).toEqual(['medusa']);
    expect(s.debris).toEqual({});
    expect(s.blackbox).toBe('wreck');
    expect(s.opts.sens).toBe(1);
    expect(s.opts.binds.up).toBe('Space');
    await start(page, false);
    expectNoErrors(errors);
  });

  test('la dificultad cambia parámetros medibles', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    const pick = async label => { const b = page.locator('#mp-menu [role=radio]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Extremo');
    await expect(page.locator('#mp-menu [data-dtab]')).toContainText('Barras del Leviatán 4');
    let d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'extremo', rods: 4, sonarCost: 5, drain: 1.5 });
    await pick('Fácil');
    d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'facil', rods: 2, sonarCost: 2 });
    // efecto real: costo del sonar
    await startFrozen(page, isMobile);
    await D(page, 'teleport(0,-12,30,Math.PI)');
    const e0 = await T(page, 'return T.energy');
    await D(page, 'sonar()');
    expect(e0 - await T(page, 'return T.energy')).toBeCloseTo(2, 1);
    expectNoErrors(errors);
  });

  test('la calidad gráfica cambia costos reales', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    const lo = await T(page, 'return T.quality');
    expect(lo).toMatchObject({ q: 'low', pixelRatio: 1, shadows: false, snow: 160, rays: 0, fish: 36, lights: 0, caustics: false, terrainSeg: 56 });
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    const hi = await T(page, 'return T.quality');
    expect(hi).toMatchObject({ q: 'high', shadows: true, snow: 1100, rays: 7, fish: 200, caustics: true, terrainSeg: 96 });
    expect(hi.lights).toBeGreaterThan(lo.lights);
    expect(hi.far).toBeGreaterThan(lo.far);
    expect(hi.fogDensity).toBeLessThan(lo.fogDensity);
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y horizontal; controles táctiles', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, true);
    await expect(page.locator('#mp-tip')).toBeVisible({ timeout: 30_000 });
    const check = async () => {
      const r = await page.evaluate(() => {
        const sel = ['#mp-left', '#mp-radar', '#mp-tip', '#mp-prompt', '.mla-bar', '.k3-joy', ...['up', 'down', 'sonar', 'use', 'photo', 'light'].map(b => `.k3-btn[aria-label="${b}"]`)];
        const boxes = sel.map(s => { const e = document.querySelector(s); if (!e || /** @type {HTMLElement} */ (e).hidden) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { s, x: b.left, y: b.top, r: b.right, b: b.bottom } : null; }).filter(Boolean);
        const hits = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.x < c.r - 1 && a.r > c.x + 1 && a.y < c.b - 1 && a.b > c.y + 1) hits.push(a.s + ' × ' + c.s);
        }
        const out = boxes.filter(b => b.x < -1 || b.y < -1 || b.r > innerWidth + 1 || b.b > innerHeight + 1).map(b => b.s);
        return { hits, out, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
      });
      expect(r.hits).toEqual([]);
      expect(r.out).toEqual([]);
      expect(r.sw).toBeLessThanOrEqual(r.w);
      expect(r.sh).toBeLessThanOrEqual(r.h);
    };
    await check();
    // con el aviso de interacción visible
    await D(page, 'freeze(true)'); await D(page, 'at("module:reef",0,0,1)'); await sim(page, 0.2);
    await expect(page.locator('#mp-prompt')).toBeVisible();
    await check();
    await page.setViewportSize({ width: 915, height: 412 });
    await wait(page, 600); await sim(page, 0.2);
    await check();
    // botones táctiles: SONAR y USAR (acoplar)
    await page.locator('.k3-btn[aria-label="sonar"]').tap(); await sim(page, 0.1);
    expect(await T(page, 'return T.energy')).toBeLessThan(100);
    await page.locator('.k3-btn[aria-label="use"]').tap(); await sim(page, 0.2);
    expect(await T(page, 'return T.player.docked')).toBe('reef');
    await page.setViewportSize({ width: 412, height: 915 });
    expectNoErrors(errors);
  });
});
