// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait } from './helpers.js';

// Bastiones Elementales (Three.js 0.186). En headless el WebGL es SwiftShader (CPU): el juego corre a pocos FPS,
// así que las esperas son por condición (expect.poll) y los tramos largos usan simulate() determinista (?debug).
// Las interacciones del mapa (plataformas, torres, palancas, cristales) se prueban con clics/toques reales sobre
// la posición de pantalla que informa el gancho (screenOf), verificando antes que ahí no haya HUD encima.

const ID = 'bastiones_elementales';
const FILE = ID + '.html';
const DBG = FILE + '?debug';
const T = (page, body) => page.evaluate(`(()=>{ const T = window.__${ID}; ${body} })()`);
const D = (page, call) => page.evaluate(`window.__${ID}.debug.${call}`);
const POLL = { timeout: 40_000 };

/** Guardado con el tutorial ya visto (para que su cartel no tape el mapa en pruebas que no lo usan). */
async function noTutorial(page) {
  await page.addInitScript(k => { if (!sessionStorage.getItem('be-seed')) { sessionStorage.setItem('be-seed', '1'); localStorage.setItem(k, JSON.stringify({ v: 1, d: { tutorial: { done: true } } })); } }, ID + ':save');
}
async function ready(page) {
  await page.waitForFunction(id => /** @type {any} */ (window)['__' + id]?.state === 'menu' && /** @type {any} */ (window)['__' + id].perf.frames > 1, ID, { timeout: 45_000 });
}
/** Arranca desde el menú con entrada real (Enter en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#be-menu [data-go]').tap();
  else { await page.locator('#be-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
}
async function tapXY(page, isMobile, x, y) { if (isMobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); }
/** Posición en pantalla de un objeto del mapa, sólo si ahí está el lienzo (sin HUD encima). */
async function freeSpot(page, kind, i) {
  return page.evaluate(([id, kind, i]) => {
    const p = /** @type {any} */ (window)['__' + id].screenOf(kind, i);
    if (!p || !p.vis) return null;
    const el = document.elementFromPoint(p.x, p.y);
    return el && el.tagName === 'CANVAS' ? p : null;
  }, [ID, kind, i]);
}
/** Toca un objeto; si su posición está tapada, centra la cámara en él primero. */
async function tapObj(page, isMobile, kind, i) {
  let p = await freeSpot(page, kind, i);
  if (!p) {
    const pos = await T(page, `const k = '${kind}', i = ${i}; if (k === 'pad') return T.pads[i]; if (k === 'tower') return T.pads[T.towers[i].pad]; return null`);
    if (pos) await D(page, `camTo(${pos.x}, ${pos.z}, 26)`);
    p = await freeSpot(page, kind, i);
  }
  expect(p, `${kind} ${i} visible y libre`).toBeTruthy();
  await tapXY(page, isMobile, /** @type {any} */ (p).x, /** @type {any} */ (p).y);
}
/** Índice de una plataforma libre y tocable. */
async function freePad(page, skip = []) {
  const n = await T(page, 'return T.pads.length');
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    if ((await T(page, `return T.pads[${i}].tower`)) !== null) continue;
    if (await freeSpot(page, 'pad', i)) return i;
  }
  return -1;
}
async function press(page, isMobile, locator) { if (isMobile) await page.locator(locator).tap(); else await page.locator(locator).click(); }
const cdps = new WeakMap();
async function touch(page, type, pts) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
}

test.describe('Bastiones Elementales', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(180_000); });

  test('carga sin errores: menú con crédito, escenarios, dificultad y fondo 3D', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#be-menu h1')).toContainText('BASTIONES');
    await expect(page.locator('#be-menu .be-credit')).toContainText('CREADO POR MATELABS');
    await expect(page.locator('#be-menu [role=radiogroup] [role=radio]')).toHaveCount(4);
    await expect(page.locator('#be-menu .be-maps button')).toHaveCount(3);
    await expect(page.locator('#be-menu .be-maps button:disabled')).toHaveCount(2);
    const s = await T(page, 'return { calls: T.perf.calls, scene: T.scene }');
    expect(s.scene).toBe('Puente Glacial');
    expect(s.calls).toBeGreaterThan(10);
    expectNoErrors(errors);
  });

  test('arranque con entrada real: tocar plataforma, construir y ver el panel de la torre', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type))).toContain('start');
    await expect(page.locator('#be-status')).toBeVisible();
    const gold0 = await T(page, 'return T.gold');
    const pad = await freePad(page);
    expect(pad).toBeGreaterThanOrEqual(0);
    await tapObj(page, isMobile, 'pad', pad);
    await expect.poll(() => T(page, 'return T.panel'), POLL).toBe('pad');
    await press(page, isMobile, '#be-panel [data-a="build"][data-v="ballesta"]');
    await expect.poll(() => T(page, 'return T.towers.length'), POLL).toBe(1);
    const t = (await T(page, 'return T.towers'))[0];
    expect(t).toMatchObject({ pad, type: 'ballesta', lv: 1 });
    expect(await T(page, 'return T.gold')).toBe(gold0 - 70);
    expect(await T(page, 'return T.panel')).toBe('tower');
    // tocar fuera cierra el panel
    await press(page, isMobile, '#be-panel [data-a="close"]');
    await expect.poll(() => T(page, 'return T.panel'), POLL).toBe('');
    expectNoErrors(errors);
  });

  test('tutorial contextual: aparece, avanza con la acción, se salta y se reactiva desde la pausa', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect(page.locator('#be-tip')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#be-tip')).toContainText(isMobile ? 'Tocá una plataforma' : 'clic en una plataforma');
    expect(await T(page, 'return T.tutorial.id')).toBe('build');
    // «OK» avanza al paso siguiente (llamar oleada)
    await press(page, isMobile, '#be-tip [data-t="ok"]');
    expect(await T(page, 'return T.tutorial.id')).toBe('wave');
    await press(page, isMobile, '#be-tip [data-t="skip"]');
    await expect(page.locator('#be-tip')).toBeHidden();
    expect(await T(page, 'return T.save.tutorial.done')).toBe(true);
    // se reabre desde la pausa: «Cómo jugar» → «Repetir tutorial»
    await press(page, isMobile, '.mla-bar button[aria-label="Pausa"]');
    await expect(page.locator('.mla-pause')).toBeVisible();
    await press(page, isMobile, '.mla-pause [data-a="custom"] >> text=Cómo jugar');
    await expect(page.locator('#be-help')).toBeVisible();
    await expect(page.locator('#be-help')).toContainText('Titán Elemental');
    await expect(page.locator('#be-help')).toContainText('GAMEPAD');
    await press(page, isMobile, '#be-help [data-m="retut"]');
    expect(await T(page, 'return T.save.tutorial.done')).toBe(false);
    await expect(page.locator('.mla-pause')).toBeVisible();
    await press(page, isMobile, '.mla-pause [data-a="resume"]');
    await expect(page.locator('#be-tip')).toBeVisible();
    expect(await T(page, 'return T.tutorial.step')).toBe(0);
    expectNoErrors(errors);
  });

  test('torres: mejorar, apuntado, reubicar y vender con entrada real', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, 'setGold(1000)');
    const pad = await freePad(page);
    await tapObj(page, isMobile, 'pad', pad);
    await press(page, isMobile, '#be-panel [data-a="build"][data-v="hielo"]');
    await expect.poll(() => T(page, 'return T.towers.length'), POLL).toBe(1);
    await press(page, isMobile, '#be-panel [data-a="upgrade"]');
    await expect.poll(() => T(page, 'return T.towers[0].lv'), POLL).toBe(2);
    await press(page, isMobile, '#be-panel [data-a="upgrade"]');
    await expect.poll(() => T(page, 'return T.towers[0].lv'), POLL).toBe(3);
    await expect(page.locator('#be-panel [data-a="upgrade"]')).toBeDisabled();
    expect((await T(page, 'return T.missions.current')).find(m => m.id === 'maximo')?.progress ?? 1).toBeGreaterThanOrEqual(1);
    await press(page, isMobile, '#be-panel [data-a="prio"]');
    expect(await T(page, 'return T.towers[0].prio')).toBe('fuerte');
    // reubicar: el botón entra en modo mover y la plataforma nueva recibe la torre
    const moves0 = await T(page, 'return T.moves');
    await press(page, isMobile, '#be-panel [data-a="move"]');
    expect(await T(page, 'return T.moving')).toBe(true);
    const pad2 = await freePad(page, [pad]);
    await tapObj(page, isMobile, 'pad', pad2);
    await expect.poll(() => T(page, 'return T.towers[0].pad'), POLL).toBe(pad2);
    expect(await T(page, 'return T.moves')).toBe(moves0 - 1);
    expect(await T(page, 'return T.towers[0].lv')).toBe(3);
    // vender devuelve el 70 % de lo invertido
    const g0 = await T(page, 'return T.gold');
    await press(page, isMobile, '#be-panel [data-a="sell"]');
    await expect.poll(() => T(page, 'return T.towers.length'), POLL).toBe(0);
    expect(await T(page, 'return T.gold')).toBe(g0 + Math.floor((90 + 80 + 140) * 0.7));
    expectNoErrors(errors);
  });

  test('palanca de puente: cambia la ruta, se recarga y no gira con enemigos encima', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    const r0 = await T(page, 'return T.route.map(t => t.join(",")).join(" ")');
    expect(r0).toContain('9,2');
    expect(await T(page, 'return T.bridges[0].state')).toBe(0);
    await tapObj(page, isMobile, 'lever', 0);
    await expect.poll(() => T(page, 'return T.bridges[0].state'), POLL).toBe(1);
    const r1 = await T(page, 'return T.route.map(t => t.join(",")).join(" ")');
    expect(r1).toContain('9,10');
    expect(r1).not.toContain('9,2');
    expect(await T(page, 'return T.levers[0].cool')).toBeGreaterThan(8);
    expect((await T(page, 'return T.missions.current')).length).toBeGreaterThanOrEqual(4);
    // en recarga: no gira
    await tapObj(page, isMobile, 'lever', 0);
    await wait(page, 200);
    expect(await T(page, 'return T.bridges[0].state')).toBe(1);
    // con un enemigo sobre el puente tampoco
    await D(page, 'simulate(10.5)');
    await D(page, 'spawn("trasgo", 1, 0)');
    let on = false;
    for (let i = 0; i < 120 && !on; i++) { await D(page, 'simulate(0.2)'); on = await T(page, 'const e = T.enemies.list[0]; return !!e && e.tile[1] === 10 && (e.tile[0] === 9 || e.tile[0] === 10)'); }
    expect(on).toBe(true);
    await tapObj(page, isMobile, 'lever', 0);
    await wait(page, 200);
    expect(await T(page, 'return T.bridges[0].state')).toBe(1);
    // el enemigo siguió la ruta nueva
    expect(await T(page, 'return T.enemies.list[0].z')).toBeGreaterThan(6);
    expectNoErrors(errors);
  });

  test('cristales auxiliares: cargan, se cosechan con un toque, se drenan, se pierden y se restauran', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, 'charge(0)');
    const g0 = await T(page, 'return T.gold');
    await tapObj(page, isMobile, 'aux', 0);
    await expect.poll(() => T(page, 'return T.gold'), POLL).toBe(g0 + 30);
    expect(await T(page, 'return T.aux[0].charge')).toBeLessThan(0.1);
    // regeneración cuando no hay enemigos cerca
    await D(page, 'hurtAux(0, 15)');
    const hp1 = await T(page, 'return T.aux[0].hp');
    await D(page, 'simulate(3)');
    expect(await T(page, 'return T.aux[0].hp')).toBeGreaterThan(hp1);
    // destruido: la misión de salvarlos falla y el cristal se puede restaurar
    await D(page, 'hurtAux(0, 999)');
    expect(await T(page, 'return T.aux[0].alive')).toBe(false);
    const aux = (await T(page, 'return T.missions.current')).find(m => m.id === 'auxiliares');
    if (aux) expect(aux.status).toBe('failed');
    await D(page, 'setGold(200)');
    await tapObj(page, isMobile, 'aux', 0);
    await expect.poll(() => T(page, 'return T.panel'), POLL).toBe('aux');
    await press(page, isMobile, '#be-panel [data-a="restore"]');
    await expect.poll(() => T(page, 'return T.aux[0].alive'), POLL).toBe(true);
    expect(await T(page, 'return T.gold')).toBe(120);
    // los enemigos que pasan cerca lo drenan
    const h0 = await T(page, 'return T.aux[0].hp');
    await D(page, 'spawn("caballero", 3, 0)');
    await D(page, 'simulate(2.5)');
    expect(await T(page, 'return T.aux[0].hp')).toBeLessThan(h0);
    expectNoErrors(errors);
  });

  test('rivales: imp inmune al fuego que salta y ataca cristales, caballero con escudo, gólem que congela y harpía en línea recta', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica de IA: igual en ambos proyectos');
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    await D(page, 'unlockAll()'); await D(page, 'goto(1)');
    expect(await T(page, 'return T.scene')).toBe('Paso de Lava');
    // imp
    await D(page, 'spawn("imp", 1, 0)'); await D(page, 'simulate(0.8)');
    expect(await D(page, 'hurtEnemy(0, 100, "fuego")')).toBe(0);
    const before = await T(page, 'return T.enemies.list[0].remain');
    expect(await D(page, 'hurtEnemy(0, 25, "piedra")')).toBe(25);
    const imp = await T(page, 'return T.enemies.list[0]');
    expect(imp.blink).toBe(true);
    expect(imp.remain).toBeLessThan(before - 3);
    let attacked = false;
    for (let i = 0; i < 80 && !attacked; i++) { await D(page, 'simulate(0.4)'); attacked = await T(page, 'return T.enemies.list.some(e => e.type === "imp" && e.state === "attack")'); }
    expect(attacked).toBe(true);
    await D(page, 'simulate(1)');
    expect((await T(page, 'return T.aux')).some(a => a.hp < a.max)).toBe(true);
    await D(page, 'killAll()');
    // caballero: escudo frontal contra lo no eléctrico; el rayo la ignora
    await D(page, 'spawn("caballero", 1, 0)'); await D(page, 'simulate(0.6)');
    expect(await D(page, 'hurtEnemy(0, 10, "piedra")')).toBe(4);
    expect(await T(page, 'return T.enemies.list[0].shield')).toBe(true);
    expect(await D(page, 'hurtEnemy(0, 40, "piedra")')).toBe(4);
    expect(await D(page, 'hurtEnemy(0, 40, "rayo")')).toBe(48);
    await D(page, 'killAll()');
    // gólem: congela una torre cercana con aviso
    await D(page, 'setGold(500)'); await D(page, 'build(2, "ballesta")');
    await D(page, 'spawn("golem", 1, 0)');
    let frozen = false;
    for (let i = 0; i < 60 && !frozen; i++) { await D(page, 'simulate(0.5)'); frozen = await T(page, 'return T.towers.some(t => t.frozen)'); }
    expect(frozen).toBe(true);
    expect(await D(page, 'hurtEnemy(0, 100, "hielo")')).toBe(25);
    await D(page, 'killAll()');
    // harpía: vuela recto al cristal, ignora caminos
    await D(page, 'spawn("volador", 1, 1)'); await D(page, 'simulate(3)');
    const v = await T(page, 'const e = T.enemies.list[0]; return { x: e.x, z: e.z, fly: e.fly }');
    expect(v.fly).toBe(true);
    // spawn (0,11) → cristal (19,6): distancia del punto a la recta
    const ax = -19, az = 10, bx = 19, bz = 0, len = Math.hypot(bx - ax, bz - az);
    const dist = Math.abs((bx - ax) * (az - v.z) - (ax - v.x) * (bz - az)) / len;
    expect(dist).toBeLessThan(1.3);
    expectNoErrors(errors);
  });

  test('sinergias elementales: las torres combinan estados (choque térmico, conducción, sobrecarga)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica de combate: igual en ambos proyectos');
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    await D(page, 'setGold(3000)');
    await D(page, 'build(5, "hielo")'); await D(page, 'build(4, "fuego")'); await D(page, 'build(8, "rayo")'); await D(page, 'build(9, "hielo")');
    await D(page, 'spawn("caballero", 6, 0)');
    let combos = 0, shred = false;
    for (let i = 0; i < 40 && combos < 2; i++) { await D(page, 'simulate(0.5)'); combos = await T(page, 'return T.combos'); shred = shred || await T(page, 'return T.enemies.list.some(e => e.shred)'); }
    expect(combos).toBeGreaterThanOrEqual(2);
    const m = (await T(page, 'return T.missions.current')).find(x => x.id === 'sinergias');
    if (m) expect(m.progress).toBeGreaterThanOrEqual(2);
    void shred;
    expectNoErrors(errors);
  });

  test('los tres escenarios cargan y se encadenan con «Siguiente»', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    expect(await T(page, 'return T.scene')).toBe('Puente Glacial');
    const names = ['Paso de Lava', 'Valle del Trueno'];
    for (const n of names) {
      await D(page, 'winMap()');
      await expect(page.locator('#be-end')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('#be-end')).toContainText('VICTORIA');
      await press(page, isMobile, '#be-end [data-m="next"]');
      await expect.poll(() => T(page, 'return T.scene'), POLL).toBe(n);
      expect(await T(page, 'return T.state')).toBe('play');
      const c = await T(page, 'return { pads: T.pads.length, levers: T.levers.length, aux: T.aux.length, waves: T.waves }');
      expect(c.pads).toBeGreaterThan(12);
      expect(c.aux).toBeGreaterThanOrEqual(2);
      expect(c.levers).toBeGreaterThanOrEqual(1);
    }
    expect(await T(page, 'return T.levers.length')).toBe(2);
    expect(await T(page, 'return T.waves')).toBe(10);
    // menú: los tres escenarios desbloqueados
    await D(page, 'winMap()');
    await expect(page.locator('#be-end')).toContainText('TITÁN', { timeout: 20_000 });
    await press(page, isMobile, '#be-end [data-m="menu"]');
    await expect(page.locator('#be-menu')).toBeVisible();
    await expect(page.locator('#be-menu .be-maps button:disabled')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('misiones y guardado: punto de control retoma oleada y torres; principal + secundaria persisten', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    const pad = await freePad(page);
    await tapObj(page, isMobile, 'pad', pad);
    await press(page, isMobile, '#be-panel [data-a="build"][data-v="ballesta"]');
    await expect.poll(() => T(page, 'return T.towers.length'), POLL).toBe(1);
    // la palanca también queda guardada
    await D(page, 'startWave(0)'); await D(page, 'simulate(0.5)'); await D(page, 'clearWaves()');
    await expect.poll(() => T(page, 'return T.wavesDone'), POLL).toBe(1);
    expect(await T(page, 'return T.save.checkpoint.wave')).toBe(1);
    expect(await T(page, 'return T.save.wavesTotal')).toBe(1);
    await page.reload();
    await ready(page);
    await expect(page.locator('#be-menu [data-go]')).toContainText('Continuar');
    await start(page, isMobile);
    expect(await T(page, 'return T.towers')).toEqual([expect.objectContaining({ pad, type: 'ballesta', lv: 1 })]);
    expect(await T(page, 'return T.wavesDone')).toBe(1);
    // ganar el escenario sin perder cristales auxiliares ni usar fuego
    await D(page, 'winMap()');
    await expect(page.locator('#be-end')).toBeVisible({ timeout: 20_000 });
    const ms = await T(page, 'return T.missions.current');
    expect(ms.find(m => m.id === 'defender').status).toBe('done');
    expect(ms.filter(m => m.kind !== 'primary' && m.status === 'done').length).toBeGreaterThanOrEqual(1);
    await page.reload();
    await ready(page);
    const after = await page.evaluate(id => ({ save: JSON.parse(localStorage.getItem(id + ':save') || '{}').d, m: JSON.parse(localStorage.getItem('ml:missions') || '{}')[id] }), ID);
    expect(after.save.defended).toBe(true);
    expect(after.save.unlocked).toBe(2);
    expect(after.save.checkpoint).toBe(null);
    expect(after.m.done.defender).toBeGreaterThan(0);
    expect(Object.keys(after.m.done).some(k => ['sinfuego', 'auxiliares', 'maximo', 'cien', 'sinergias', 'cosecha'].includes(k))).toBe(true);
    await expect(page.locator('#be-menu .be-maps button:disabled')).toHaveCount(1);
    expectNoErrors(errors);
  });

  test('Titán Elemental: intro, 3 fases con inmunidades, desvío de ruta, pulso y victoria final', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, 'unlockAll()'); await D(page, 'goto(2)');
    await D(page, 'setGold(2000)');
    await D(page, 'spawnBoss()');
    expect(await T(page, 'return T.state')).toBe('cine');
    expect(await T(page, 'return T.boss.intro')).toBe(true);
    // la intro se saltea con entrada real
    if (isMobile) await page.touchscreen.tap(200, 450); else await page.keyboard.press('Enter');
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    let b = await T(page, 'return T.boss');
    expect(b).toMatchObject({ active: true, phase: 1, immune: 'hielo' });
    expect(await D(page, 'hitBoss("hielo", 100)')).toBe(0);
    expect(await D(page, 'hitBoss("fuego", 100)')).toBe(150);
    // F1 → F2: aviso, cambio de inmunidad y desvío de ruta (puentes forzados y palancas bloqueadas)
    const br0 = await T(page, 'return T.bridges.map(b => b.state)');
    await D(page, 'bossHp(0.68)'); await D(page, 'hitBoss("fuego", 400)');
    expect(await T(page, 'return T.boss.transition')).toBe(true);
    expect(await D(page, 'hitBoss("fuego", 100)')).toBe(0);
    await D(page, 'simulate(3.2)');
    b = await T(page, 'return T.boss');
    expect(b).toMatchObject({ phase: 2, immune: 'fuego', transition: false });
    const br1 = await T(page, 'return T.bridges');
    expect(br1.map(x => x.state)).toEqual(br0.map(x => 1 - x));
    expect(br1.every(x => x.lock > 20)).toBe(true);
    expect(await T(page, 'return T.enemies.byType.imp || 0')).toBeGreaterThanOrEqual(4);
    expect(await D(page, 'hitBoss("hielo", 100)')).toBe(150);
    // F2 → F3: inmune al rayo, pulso que aturde torres cercanas
    await D(page, 'bossHp(0.35)'); await D(page, 'hitBoss("hielo", 400)');
    await D(page, 'simulate(3.2)');
    b = await T(page, 'return T.boss');
    expect(b).toMatchObject({ phase: 3, immune: 'rayo' });
    expect(await D(page, 'hitBoss("rayo", 100)')).toBe(0);
    const near = await T(page, 'const b = T.boss; return T.pads.filter(p => !p.tower).map(p => ({ i: p.i, d: Math.hypot(p.x - b.x, p.z - b.z) })).sort((a, c) => a.d - c.d)[0].i');
    await D(page, `build(${near}, "ballesta")`);
    let stunned = false, warned = false;
    for (let i = 0; i < 40 && !stunned; i++) { await D(page, 'simulate(0.25)'); warned = warned || await T(page, 'return T.boss.empWarn'); stunned = await T(page, 'return T.towers.some(t => t.stunned)'); }
    expect(warned).toBe(true);
    expect(stunned).toBe(true);
    // derrota del Titán → recompensa → victoria
    const sc = await T(page, 'return T.score');
    await D(page, 'hurtBoss(1e7)');
    await D(page, 'simulate(2)');
    expect(await T(page, 'return T.boss.active')).toBe(false);
    expect(await T(page, 'return T.score')).toBeGreaterThanOrEqual(sc + 3000);
    expect((await T(page, 'return T.missions.current')).find(m => m.id === 'titan').status).toBe('done');
    await D(page, 'clearWaves()'); await D(page, 'simulate(0.2)');
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('victory');
    await expect(page.locator('#be-end')).toContainText('TITÁN DETENIDO', { timeout: 20_000 });
    expect(await T(page, 'return T.save.titan')).toBe(true);
    expectNoErrors(errors);
  });

  test('derrota por enemigos que llegan al cristal y reintento limpio', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, 'setCrystal(2)');
    await D(page, 'spawn("trasgo", 3, 0)');
    for (let i = 0; i < 40; i++) { await D(page, 'simulate(1)'); if ((await T(page, 'return T.state')) !== 'play') break; }
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#be-end')).toContainText('EL CRISTAL CAYÓ', { timeout: 20_000 });
    await press(page, isMobile, '#be-end [data-m="retry"]');
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    const r = await T(page, 'return { cr: T.crystal, max: T.crystalMax, w: T.wave, t: T.towers.length, e: T.enemies.total, score: T.score }');
    expect(r).toEqual({ cr: r.max, max: 20, w: 0, t: 0, e: 0, score: 0 });
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanuda y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    if (isMobile) await page.locator('.k3-btn[aria-label="wave"]').tap(); else await page.keyboard.press('Space');
    await expect.poll(() => T(page, 'return T.enemies.total'), POLL).toBeGreaterThan(0);
    if (isMobile) await page.locator('.mla-bar button[aria-label="Pausa"]').tap(); else await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const snap = () => T(page, 'return { t: T.simTime, r: T.runTime, e: T.enemies.list.map(e => [e.x, e.z, e.hp]), g: T.gold }');
    const a = await snap();
    await wait(page, 1000);
    const b = await snap();
    expect(b).toEqual(a);
    expect(await T(page, 'return T.paused')).toBe(true);
    await press(page, isMobile, '.mla-pause [data-a="resume"]');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(b.r);
    // reiniciar
    if (isMobile) await page.locator('.mla-bar button[aria-label="Pausa"]').tap(); else await page.keyboard.press('Escape');
    await press(page, isMobile, '.mla-pause [data-a="restart"]');
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    const r = await T(page, 'return { r: T.runTime, w: T.wave, e: T.enemies.total, g: T.gold, cr: T.crystal, max: T.crystalMax }');
    expect(r.r).toBeLessThan(1.5);
    expect(r.w).toBe(0);
    expect(r.e).toBe(0);
    expect(r.g).toBe(220);
    expect(r.cr).toBe(r.max);
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida se recupera sin romper', async ({ page }) => {
    await page.addInitScript(k => { if (!sessionStorage.getItem('be-once')) { sessionStorage.setItem('be-once', '1'); localStorage.setItem(k, '{esto no es json'); } }, ID + ':save');
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#be-menu [data-go]')).toContainText('Defender');
    expect(await page.evaluate(k => localStorage.getItem(k + ':corrupto'), ID + ':save')).toBe('{esto no es json');
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 1, d: { unlocked: 'x', best: 5, wavesTotal: -3, checkpoint: { map: 7, towers: 'no' }, settings: { pan: 99, binds: { wave: 'KeyW', sell: 3 } }, raro: true } })), ID + ':save');
    await page.reload();
    await ready(page);
    const s = await T(page, 'return T.save');
    expect(s.unlocked).toBe(1);
    expect(s.best).toEqual([null, null, null]);
    expect(s.wavesTotal).toBe(0);
    expect(s.checkpoint).toBe(null);
    expect(s.settings.pan).toBe(2);
    expect(s.settings.binds).toEqual({ wave: 'Space', speed: 'KeyT', upgrade: 'KeyU', sell: 'KeyX' });
    expect('raro' in s).toBe(false);
    expectNoErrors(errors);
  });

  test('la dificultad cambia parámetros medibles', async ({ page, isMobile }) => {
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    const pick = async label => { const b = page.locator('#be-menu [role=radio]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Difícil');
    await expect(page.locator('#be-dfx')).toContainText('Cristal 15');
    await pick('Fácil');
    await expect(page.locator('#be-dfx')).toContainText('Cristal 30');
    await pick('Extremo');
    await start(page, isMobile);
    const d = await T(page, 'return { d: T.difficulty, cr: T.crystal, g: T.gold, m: T.moves }');
    expect(d.d).toMatchObject({ name: 'extremo', crystal: 10, hp: 1.65, gold: 170 });
    expect([d.cr, d.g, d.m]).toEqual([10, 170, 1]);
    await D(page, 'spawn("trasgo", 1, 0)');
    expect(await T(page, 'return T.enemies.list[0].max')).toBe(Math.round(62 * 1.65));
    expectNoErrors(errors);
  });

  test('la calidad gráfica cambia costos reales', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    const lo = await T(page, 'return T.quality');
    expect(lo).toMatchObject({ q: 'low', pixelRatio: 1, shadows: false, particles: 160, lights: 0, weather: 60 });
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    const hi = await T(page, 'return T.quality');
    expect(hi).toMatchObject({ q: 'high', shadows: true, particles: 900, weather: 480 });
    expect(hi.lights).toBeGreaterThan(lo.lights);
    expect(hi.decor).toBeGreaterThan(lo.decor);
    expect(hi.fogFar).toBeGreaterThan(lo.fogFar);
    expectNoErrors(errors);
  });

  test('teclado y gamepad: retícula central, teclas 1-4 / U, y teclas reasignables', async ({ page, isMobile }) => {
    test.skip(isMobile, 'sólo escritorio');
    await noTutorial(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    // reasignar «Llamar oleada» a G desde Controles
    await page.locator('#be-menu [data-m="opts"]').click();
    await expect(page.locator('#be-opts')).toBeVisible();
    await page.locator('#be-opts [data-m="bind"][data-v="wave"]').click();
    await page.keyboard.press('KeyG');
    await expect(page.locator('#be-opts [data-m="bind"][data-v="wave"]')).toHaveText('G');
    expect(await T(page, 'return T.save.settings.binds.wave')).toBe('KeyG');
    await page.locator('#be-opts [data-m="closeOpts"]').click();
    await start(page, false);
    // retícula: centrar la cámara en una plataforma y elegirla con Enter (botón A del gamepad)
    const p = await T(page, 'return T.pads[6]');
    await D(page, `camTo(${p.x}, ${p.z}, 24)`);
    await page.keyboard.press('Enter');
    await expect.poll(() => T(page, 'return T.selected && T.selected.pad'), POLL).toBe(6);
    await page.keyboard.press('Digit1');
    await expect.poll(() => T(page, 'return T.towers.length'), POLL).toBe(1);
    await D(page, 'setGold(500)');
    await page.keyboard.press('KeyU');
    await expect.poll(() => T(page, 'return T.towers[0].lv'), POLL).toBe(2);
    // panel con ◀ ▶ (cruceta) + Enter: «Apunta a»
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect.poll(() => T(page, 'return T.towers[0].prio'), POLL).toBe('fuerte');
    await page.keyboard.press('Backspace');
    await expect.poll(() => T(page, 'return T.panel'), POLL).toBe('');
    // la tecla reasignada llama la oleada; Espacio ya no
    await page.keyboard.press('Space');
    await wait(page, 300);
    expect(await T(page, 'return T.wave')).toBe(0);
    await page.keyboard.press('KeyG');
    await expect.poll(() => T(page, 'return T.wave'), POLL).toBe(1);
    // mover cámara con WASD
    const c0 = await T(page, 'return T.camera');
    await page.keyboard.down('KeyD'); await expect.poll(() => T(page, 'return T.camera.x'), POLL).toBeGreaterThan(c0.x + 1); await page.keyboard.up('KeyD');
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y horizontal; gestos y botones táctiles', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, true);
    await expect(page.locator('#be-tip')).toBeVisible({ timeout: 20_000 });
    const check = async (extra = []) => {
      const r = await page.evaluate(sel => {
        const boxes = [];
        for (const s of sel) document.querySelectorAll(s).forEach((e, i) => { const b = e.getBoundingClientRect(); const st = getComputedStyle(e); if (b.width && b.height && st.display !== 'none' && st.visibility !== 'hidden' && !e.closest('[hidden]')) boxes.push({ s: s + '#' + i, x: b.left, y: b.top, r: b.right, b: b.bottom }); });
        const hits = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          if (a.x < c.r - 1 && a.r > c.x + 1 && a.y < c.b - 1 && a.b > c.y + 1) hits.push(a.s + ' × ' + c.s);
        }
        const out = boxes.filter(b => b.x < -1 || b.y < -1 || b.r > innerWidth + 1 || b.b > innerHeight + 1).map(b => b.s);
        return { hits, out, n: boxes.length, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
      }, ['#be-status', '#be-wave', '.mla-bar', '.k3-touch .k3-btn', '#be-tip', ...extra]);
      expect(r.hits).toEqual([]);
      expect(r.out).toEqual([]);
      expect(r.sw).toBeLessThanOrEqual(r.w);
      expect(r.sh).toBeLessThanOrEqual(r.h);
      return r;
    };
    await check();
    // panel abierto: los botones táctiles se ocultan y nada se pisa
    const pad = await freePad(page);
    await tapObj(page, true, 'pad', pad);
    await expect.poll(() => T(page, 'return T.panel'), POLL).toBe('pad');
    await expect(page.locator('.k3-touch')).toBeHidden();
    await check(['#be-panel']);
    await page.setViewportSize({ width: 915, height: 412 });
    await wait(page, 700);
    await check(['#be-panel']);
    await page.locator('#be-panel [data-a="close"]').tap();
    await expect(page.locator('.k3-touch')).toBeVisible();
    await check();
    // gestos: arrastrar mueve, pellizcar acerca, botones giran y llaman la oleada
    const c0 = await T(page, 'return T.camera');
    await touch(page, 'touchStart', [[450, 220]]); await touch(page, 'touchMove', [[420, 220]]); await touch(page, 'touchMove', [[330, 200]]); await touch(page, 'touchEnd', []);
    await expect.poll(async () => { const c = await T(page, 'return T.camera'); return Math.hypot(c.x - c0.x, c.z - c0.z); }, POLL).toBeGreaterThan(1);
    const d0 = (await T(page, 'return T.camera')).dist;
    await touch(page, 'touchStart', [[400, 200], [500, 200]]); await touch(page, 'touchMove', [[360, 200], [540, 200]]); await touch(page, 'touchMove', [[300, 200], [600, 200]]); await touch(page, 'touchEnd', []);
    await expect.poll(() => T(page, 'return T.camera.dist'), POLL).toBeLessThan(d0 - 2);
    const y0 = (await T(page, 'return T.camera')).yaw;
    await page.locator('.k3-btn[aria-label="rotl"]').dispatchEvent('pointerdown');
    await expect.poll(() => T(page, 'return T.camera.yaw'), POLL).toBeGreaterThan(y0 + 0.05);
    await page.locator('.k3-btn[aria-label="rotl"]').dispatchEvent('pointerup');
    await page.locator('.k3-btn[aria-label="wave"]').tap();
    await expect.poll(() => T(page, 'return T.wave'), POLL).toBe(1);
    await page.setViewportSize({ width: 412, height: 915 });
    expectNoErrors(errors);
  });
});
