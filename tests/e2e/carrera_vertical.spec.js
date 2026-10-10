// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait } from './helpers.js';

// Carrera Vertical (Three.js 0.186). En headless el WebGL es SwiftShader (CPU) y la máquina puede estar cargada: las
// esperas son por condición (expect.poll) y los tramos de física usan pasos deterministas (?debug: simulate/trace)
// mientras las teclas/toques reales siguen apretados: la entrada es real y el tiempo de juego es fijo.

const FILE = 'carrera_vertical.html';
const DBG = 'carrera_vertical.html?debug';
const T = (page, body) => page.evaluate(`(()=>{ const T = window.__carrera_vertical; ${body} })()`);
const D = (page, call) => page.evaluate(`window.__carrera_vertical.debug.${call}`);
const POLL = { timeout: 60_000 };

async function ready(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__carrera_vertical?.state === 'menu' && /** @type {any} */ (window).__carrera_vertical.perf.frames > 1, null, { timeout: 60_000 });
}
/** Arranca desde el menú con entrada real (Enter sobre «Correr» en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#cv-menu [data-go]').tap();
  else { await page.locator('#cv-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/count|play/);
  await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
}
async function sim(page, sec) { await D(page, `simulate(${sec})`); }
/** Detiene el bucle real: desde acá todo avanza sólo con pasos deterministas (CI lento / SwiftShader). */
async function det(page) { await D(page, 'stopLoop()'); }
/** Mantiene una tecla mientras corre un tramo determinista; devuelve la traza. */
async function hold(page, key, sec, zStop) { await page.keyboard.down(key); const r = await D(page, `trace(${sec}${zStop !== undefined ? ',' + zStop : ''})`); await page.keyboard.up(key); return r; }
const cdps = new WeakMap();
async function touch(page, type, x, y) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
const press = async (page, isMobile, btn, key) => { if (isMobile) await page.locator(`.k3-btn[aria-label="${btn}"]`).tap(); else await page.keyboard.press(key); };

test.describe('Carrera Vertical', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(300_000); });

  test('carga sin errores: menú con crédito, circuitos, dificultad y fondo 3D', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#cv-menu h1')).toContainText('CARRERA VERTICAL');
    await expect(page.locator('#cv-menu .cv-credit')).toContainText('CREADO POR');
    await expect(page.locator('#cv-menu [role=radiogroup] [role=radio]')).toHaveCount(4);
    await expect(page.locator('#cv-menu .cv-course')).toHaveCount(4);
    await expect(page.locator('#cv-menu .cv-course[disabled]')).toHaveCount(3);
    const s = await T(page, 'return { calls: T.perf.calls, scene: T.scene, cols: T.counts.colliders }');
    expect(s.scene).toBe('Distrito del Amanecer');
    expect(s.calls).toBeGreaterThan(8);
    expect(s.calls).toBeLessThan(160);
    expect(s.cols).toBeGreaterThan(20);
    expectNoErrors(errors);
  });

  test('arranque con entrada real, cuenta regresiva, correr y saltar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type))).toContain('start');
    await expect(page.locator('#cv-top')).toBeVisible();
    const z0 = (await T(page, 'return T.player')).z;
    if (isMobile) {
      const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await touch(page, 'touchStart', cx, cy); await touch(page, 'touchMove', cx, cy - 55);
      await expect.poll(() => T(page, 'return T.player.z'), POLL).toBeLessThan(z0 - 1);
      await touch(page, 'touchEnd', 0, 0);
      await page.locator('.k3-btn[aria-label="jump"]').tap();
    } else {
      await page.keyboard.down('KeyW');
      await expect.poll(() => T(page, 'return T.player.z'), POLL).toBeLessThan(z0 - 1);
      await page.keyboard.up('KeyW');
      await page.keyboard.press('Space');
    }
    await expect.poll(() => T(page, 'return T.player.y'), POLL).toBeGreaterThan(12.2);
    await expect.poll(() => T(page, 'return T.time'), POLL).toBeGreaterThan(0.3);
    expectNoErrors(errors);
  });

  test('tutorial contextual: aparece, se salta y se reactiva desde la ayuda', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect(page.locator('#cv-tip')).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('#cv-tip')).toContainText(isMobile ? 'joystick' : 'WASD');
    if (isMobile) await page.locator('#cv-tip [data-t="skip"]').tap(); else await page.locator('#cv-tip [data-t="skip"]').click();
    await expect(page.locator('#cv-tip')).toBeHidden();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(true);
    await page.locator('.mla-bar button[aria-label="Pausa"]').click();
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'Cómo jugar' }).click();
    await expect(page.locator('#cv-help')).toBeVisible();
    await expect(page.locator('#cv-help')).toContainText('Vigía Mayor');
    await page.locator('#cv-help [data-retut]').click();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(false);
    await expect(page.locator('.mla-pause')).toBeVisible();
    expectNoErrors(errors);
  });

  test('parkour con teclas reales: valla, cornisa, carrera por pared, trepada, deslizamiento y rodada', async ({ page, isMobile }) => {
    test.skip(isMobile, 'física idéntica; en celular se prueban los botones táctiles en otras pruebas');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, 'unlockAll()');
    await D(page, "goto('amanecer')"); await det(page);
    // valla: el conducto de 1 m se salta corriendo, sin frenar
    await D(page, 'teleport(0,12,-11)'); await D(page, 'setVel(0,0,-9)');
    let r = await hold(page, 'KeyW', 1.2);
    expect(r.modes).toContain('mantle');
    expect(r.p.z).toBeLessThan(-19);
    expect(r.p.y).toBeCloseTo(12, 1);
    // cornisa asistida: salto contra un muro de 3 m → te agarrás y subís
    await D(page, 'teleport(0,12,-40)'); await D(page, 'setVel(0,0,-9)');
    await page.keyboard.down('KeyW');
    await D(page, 'trace(1,-44.3)'); await page.keyboard.press('Space');
    r = await D(page, 'trace(1.4)'); await page.keyboard.up('KeyW');
    expect(r.modes).toContain('mantle');
    expect(r.p.y).toBeCloseTo(15, 1);
    // carrera por pared sobre el hueco de 10 m y aterrizaje del otro lado
    await D(page, 'teleport(4.05,14,-80)'); await D(page, 'setVel(0,0,-10.4)');
    await page.keyboard.down('KeyW');
    await D(page, 'trace(1,-85.5)'); await page.keyboard.press('Space');
    r = await D(page, 'trace(2.2)'); await page.keyboard.up('KeyW');
    expect(r.modes).toContain('wall');
    expect(r.p.z).toBeLessThan(-96);
    expect(r.p.y).toBeCloseTo(14, 1);
    // deslizamiento: altura baja y conserva velocidad
    await D(page, 'teleport(0,12,-2)'); await D(page, 'setVel(0,0,-9)');
    await page.keyboard.down('KeyW'); await page.keyboard.press('ShiftLeft');
    r = await D(page, 'trace(0.2)'); await page.keyboard.up('KeyW');
    expect(r.p.mode).toBe('slide'); expect(r.p.h).toBeLessThan(1); expect(r.p.speed).toBeGreaterThan(8);
    // caída alta: sin deslizar → aturdido; con deslizar justo antes → rodada
    await D(page, 'teleport(0,23,-6)'); r = await D(page, 'trace(1.2)');
    expect(r.modes).toContain('stun');
    await D(page, 'teleport(0,23,-6)'); await D(page, 'setVel(0,0,-6)');
    await page.keyboard.down('KeyW'); await D(page, 'trace(0.66)');
    await page.keyboard.press('ShiftLeft'); r = await D(page, 'trace(0.3)'); await page.keyboard.up('KeyW');
    expect(r.modes).toContain('roll'); expect(r.modes).not.toContain('stun');
    // trepada: muro de 5 m en Neón (salto + trepada + cornisa)
    await D(page, "goto('neon')"); await det(page);
    await D(page, 'teleport(0,30,-40.5)'); await D(page, 'setVel(0,0,-8)');
    await page.keyboard.down('KeyW');
    await D(page, 'trace(1,-43.6)'); await page.keyboard.press('Space');
    r = await D(page, 'trace(1.6)'); await page.keyboard.up('KeyW');
    expect(r.modes).toContain('climb'); expect(r.modes).toContain('mantle');
    expect(r.p.y).toBeCloseTo(35, 1);
    expect(await T(page, 'return T.run.maxCombo')).toBeGreaterThanOrEqual(2);
    expectNoErrors(errors);
  });

  test('paneles de impulso y lanzador: impulsan, se recargan y suben a la torre', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')"); await det(page);
    await D(page, 'teleport(0,15.05,-59)'); await sim(page, 0.1);
    let st = await T(page, 'return { p: T.player, pads: T.interactions.pads }');
    expect(st.pads[0].uses).toBe(1); expect(st.pads[0].ready).toBe(false);
    expect(st.p.speed).toBeGreaterThan(14);
    await sim(page, 1.2);
    expect((await T(page, 'return T.interactions.pads'))[0].ready).toBe(true);
    // lanzador vertical + cornisa asistida hasta la torre de la meta
    await D(page, 'teleport(4,10.55,-209.5)');
    if (!isMobile) await page.keyboard.down('KeyW');
    const r = await D(page, 'trace(2)');
    if (!isMobile) await page.keyboard.up('KeyW');
    expect(r.maxY).toBeGreaterThan(16);
    expect((await T(page, 'return T.interactions.pads'))[1].uses).toBe(1);
    if (!isMobile) expect(r.p.y).toBeCloseTo(18.5, 1);
    expectNoErrors(errors);
  });

  test('tirolina: colgarse con ACCIÓN real, viajar, soltarse saltando y estado de la sesión', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')"); await det(page);
    await D(page, 'teleport(4,14,-123.6)'); await sim(page, 0.2);
    expect(await T(page, 'return T.prompt')).toContain('tirolina');
    await press(page, isMobile, 'action', 'KeyF'); await sim(page, 0.05);
    expect(await T(page, 'return T.player.mode')).toBe('zip');
    await sim(page, 1);
    let z = (await T(page, 'return T.interactions.zips'))[0];
    expect(z.busy).toBe(true); expect(z.t).toBeGreaterThan(0.15); expect(z.found).toBe(true);
    await sim(page, 3);
    const p = await T(page, 'return T.player');
    expect(p.mode).toBe('move'); expect(p.z).toBeLessThan(-165); expect(p.y).toBeGreaterThan(10);
    // la manija vuelve sola; segunda vuelta: soltarse en el medio con SALTO
    await sim(page, 5);
    expect((await T(page, 'return T.interactions.zips'))[0].t).toBeLessThan(0.6);
    await D(page, 'teleport(4,14,-123.6)'); await sim(page, 0.1);
    await press(page, isMobile, 'action', 'KeyF'); await sim(page, 0.05);
    expect(await T(page, 'return T.player.mode')).toBe('zip');
    await sim(page, 0.6);
    await press(page, isMobile, 'jump', 'Space'); await sim(page, 0.05);
    expect(await T(page, 'return T.player.mode')).not.toBe('zip');
    z = (await T(page, 'return T.interactions.zips'))[0];
    expect(z.busy).toBe(false); expect(z.uses).toBeGreaterThanOrEqual(2);
    expectNoErrors(errors);
  });

  test('plataforma elevadora: sube con peso, espera arriba y baja cuando te vas', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica idéntica en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')"); await det(page);
    await D(page, 'teleport(-2,8.05,-94.3)'); await sim(page, 0.2);
    expect((await T(page, 'return T.interactions.lifts'))[0].state).toBe('down');
    await sim(page, 0.5);
    expect((await T(page, 'return T.interactions.lifts'))[0].state).toBe('up');
    await sim(page, 2.2);
    let l = (await T(page, 'return T.interactions.lifts'))[0];
    expect(l.state).toBe('top'); expect(l.trips).toBe(1);
    expect((await T(page, 'return T.player.y'))).toBeCloseTo(14, 1);
    // bajarse hacia la azotea E con W y esperar: el ascensor vuelve abajo
    await hold(page, 'KeyW', 0.8);
    expect((await T(page, 'return T.player.z'))).toBeLessThan(-96);
    await sim(page, 4.5);
    l = (await T(page, 'return T.interactions.lifts'))[0];
    expect(l.state).toBe('down'); expect(l.y).toBeCloseTo(8, 1);
    expectNoErrors(errors);
  });

  test('puertas automáticas: proximidad, seguridad trabada por alarma y exprés al sprint (persiste en la sesión)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica idéntica en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')"); await det(page);
    await D(page, 'teleport(1,14,-101)'); await sim(page, 0.3);
    let d = (await T(page, 'return T.interactions.doors'))[0];
    expect(d.open).toBe(0); expect(d.solid).toBe(true);
    await D(page, 'teleport(1,14,-105.5)'); await sim(page, 0.6);
    d = (await T(page, 'return T.interactions.doors'))[0];
    expect(d.open).toBeGreaterThan(0.9); expect(d.solid).toBe(false); expect(d.opens).toBe(1);
    await hold(page, 'KeyW', 0.9);
    expect((await T(page, 'return T.player.z'))).toBeLessThan(-111);
    await D(page, 'teleport(1,14,-124)'); await sim(page, 2);
    d = (await T(page, 'return T.interactions.doors'))[0];
    expect(d.open).toBeLessThan(0.05); expect(d.solid).toBe(true);
    // Neón: la puerta exprés no abre caminando; al sprint se desbloquea para toda la sesión
    await D(page, "goto('neon')"); await det(page);
    await D(page, 'teleport(6.8,35,-91)'); await sim(page, 0.6);
    d = (await T(page, 'return T.interactions.doors.find(x => x.id === "d2")'));
    expect(d.open).toBe(0); expect(d.unlocked).toBe(false);
    await D(page, 'teleport(6.8,35,-89.2)'); await D(page, 'setVel(0,0,-10.4)');
    await hold(page, 'KeyW', 1.2);
    d = (await T(page, 'return T.interactions.doors.find(x => x.id === "d2")'));
    expect(d.unlocked).toBe(true); expect(d.open).toBeGreaterThan(0.5);
    expect(await T(page, 'return T.run.routes')).toBe(1);
    // reiniciar la carrera: el atajo sigue abierto (estado de sesión)
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/count|play/);
    d = (await T(page, 'return T.interactions.doors.find(x => x.id === "d2")'));
    expect(d.unlocked).toBe(true); expect(d.open).toBe(1);
    // seguridad: una alarma de dron la traba 3 s
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play'); await det(page);
    await D(page, 'alarm()');
    await D(page, 'teleport(0,35,-93.6)'); await sim(page, 1);
    d = (await T(page, 'return T.interactions.doors.find(x => x.id === "d1")'));
    expect(d.locked).toBe(true); expect(d.open).toBe(0);
    await sim(page, 3.6);
    d = (await T(page, 'return T.interactions.doors.find(x => x.id === "d1")'));
    expect(d.locked).toBe(false); expect(d.open).toBeGreaterThan(0.5);
    expectNoErrors(errors);
  });

  test('rivales: el dron detecta (alarma y tiempo), deslizarse lo evita; la barrera aturde; la torreta telegrafía y dispara', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica de IA: igual en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')"); await det(page);
    // deslizándose bajo el foco no hay detección
    const follow = async (sec, mode) => {
      for (let i = 0; i < sec * 10; i++) {
        const dr = (await T(page, 'return T.enemies.drones[0]'));
        await D(page, `place(${dr.sx},${dr.gy},${dr.sz})`); if (mode) await D(page, `setMode('${mode}')`);
        await D(page, 'trace(0.1)');
      }
    };
    await follow(1.5, 'slide');
    expect((await T(page, 'return T.enemies.drones[0]')).alarms).toBe(0);
    const pen0 = await T(page, 'return T.pen');
    await D(page, "setMode('move')");
    await follow(1.5);
    const dr = await T(page, 'return T.enemies.drones[0]');
    expect(dr.alarms).toBeGreaterThanOrEqual(1);
    expect(await T(page, 'return T.run.alarms')).toBeGreaterThanOrEqual(1);
    expect(await T(page, 'return T.pen')).toBe(pen0 + 2);
    // barrera láser que sube y baja: tarde o temprano te toca si te quedás debajo
    await D(page, 'teleport(1,14,-119.5)');
    let hit = false;
    for (let i = 0; i < 30 && !hit; i++) { await D(page, 'place(1,14,-119.5)'); await D(page, 'trace(0.1)'); hit = (await T(page, 'return T.enemies.barriers[0].hits')) > 0; }
    expect(hit).toBe(true);
    expect(await T(page, 'return T.player.mode')).toBe('stun');
    // torreta: te ve, apunta con el láser (estado aim) y dispara un pulso
    await D(page, "goto('neon')"); await det(page);
    await D(page, 'teleport(0,35,-58)');
    const seen = new Set();
    for (let i = 0; i < 30; i++) { await D(page, 'place(0,35,-58)'); await D(page, 'trace(0.1)'); seen.add(await T(page, 'return T.enemies.turrets[0].state')); }
    expect([...seen]).toEqual(expect.arrayContaining(['aim', 'cd']));
    expect((await T(page, 'return T.enemies.turrets[0].fired'))).toBeGreaterThanOrEqual(1);
    expectNoErrors(errors);
  });

  test('los cuatro escenarios cargan desde el menú y transicionan (meta → siguiente circuito)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mismo recorrido que escritorio');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "complete(['amanecer','neon','puerto'])");
    await page.reload();
    await ready(page);
    await expect(page.locator('#cv-menu .cv-course[disabled]')).toHaveCount(0);
    const names = { amanecer: 'Distrito del Amanecer', neon: 'Rascacielos de Neón', puerto: 'Grúas del Puerto', maestro: 'Circuito Maestro' };
    for (const id of ['neon', 'puerto', 'amanecer']) {
      await page.locator(`#cv-menu [data-course="${id}"]`).click();
      await expect.poll(() => T(page, 'return T.scene'), POLL).toBe(names[id]);
      await page.locator('#cv-menu [data-go]').click();
      await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
      expect(await T(page, 'return T.counts.colliders')).toBeGreaterThan(20);
      await page.keyboard.press('Escape');
      await page.locator('.mla-pause [data-a="custom"]', { hasText: 'menú de circuitos' }).click();
      await expect.poll(() => T(page, 'return T.state'), POLL).toBe('menu');
    }
    // llegar a la meta y pasar al siguiente circuito desde la pantalla de resultados
    await D(page, "goto('amanecer')");
    await D(page, 'finish()'); await sim(page, 0.2);
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/finish|result/);
    await sim(page, 2.2);
    await expect(page.locator('#cv-end')).toContainText('META');
    await page.locator('#cv-end [data-next]').click();
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe(names.neon);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    await D(page, "goto('maestro')");
    expect(await T(page, 'return T.scene')).toBe(names.maestro);
    expectNoErrors(errors);
  });

  test('misiones: principal (tres circuitos) y secundarias (relojes, combo ×4) persistentes tras recargar', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mismas misiones; en celular se prueba el control táctil');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')"); await det(page);
    let ms = await T(page, 'return T.missions.current.map(m => m.id)');
    expect(ms).toEqual(expect.arrayContaining(['circuitos', 'campeonato', 'escape', 'relojes', 'combo']));
    await D(page, 'clocksAll()');
    expect(await T(page, 'return T.run.clocks')).toBe(6);
    expect(await T(page, 'return T.bonus')).toBe(6);
    await D(page, 'combo(4)');
    let cur = await T(page, 'return T.missions.current');
    expect(cur.find(m => m.id === 'relojes').status).toBe('done');
    expect(cur.find(m => m.id === 'combo').status).toBe('done');
    for (const id of ['amanecer', 'neon', 'puerto']) {
      if (id !== 'amanecer') await D(page, `goto('${id}')`);
      await D(page, 'finish()'); await sim(page, 0.2); await sim(page, 2.2);
      await expect.poll(() => T(page, 'return T.state'), POLL).toBe('result');
    }
    const st = await T(page, 'return T.missions');
    expect(st.achievements.done.circuitos).toBeGreaterThan(0);
    await page.reload();
    await ready(page);
    const after = await page.evaluate(() => ({ save: JSON.parse(localStorage.getItem('carrera_vertical:save') || '{}').d, missions: JSON.parse(localStorage.getItem('ml:missions') || '{}').carrera_vertical }));
    expect(after.save.done).toMatchObject({ amanecer: true, neon: true, puerto: true });
    expect(after.save.unlocked).toBe(4);
    expect(after.save.clocks.amanecer.length).toBe(6);
    expect(after.missions.done.circuitos).toBeGreaterThan(0);
    expect(after.missions.done.relojes).toBeGreaterThan(0);
    expect(after.missions.done.combo).toBeGreaterThan(0);
    await expect(page.locator('#cv-menu [data-course="maestro"]')).toBeEnabled();
    expectNoErrors(errors);
  });

  test('fantasma: la mejor carrera queda grabada y corre en el siguiente intento', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica idéntica');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')");
    await hold(page, 'KeyW', 2);
    await D(page, 'finish()'); await sim(page, 0.2); await sim(page, 2.2);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('result');
    const s = await T(page, 'return T.save');
    expect(s.ghosts.amanecer.d.length).toBeGreaterThan(50);
    expect(s.best.amanecer).toBeGreaterThan(1);
    await page.locator('#cv-end [data-retry]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    expect(await T(page, 'return T.run.ghostT')).toBe(s.ghosts.amanecer.t);
    await sim(page, 1);
    expect(await T(page, 'return T.ghostVisible')).toBe(true);
    expectNoErrors(errors);
  });

  test('Vigía Mayor: intro, barrido telegrafiado, minas, sobrecarga, captura y escape con recompensa', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "complete(['amanecer','neon','puerto'])");
    await page.reload();
    await ready(page);
    if (isMobile) await page.locator('#cv-menu [data-course="maestro"]').tap(); else await page.locator('#cv-menu [data-course="maestro"]').click();
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Circuito Maestro');
    if (isMobile) await page.locator('#cv-menu [data-go]').tap(); else await page.locator('#cv-menu [data-go]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('intro');
    await sim(page, 4.6);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    await det(page);
    let b = await T(page, 'return T.boss');
    expect(b.phase).toBe(1); expect(b.gap).toBeGreaterThan(15);
    // F1: barrido telegrafiado; quedarse sobre la línea cuando dispara = golpe y el dron se acerca
    await D(page, 'bossSweepNow()'); await D(page, 'trace(0.05)');
    b = await T(page, 'return T.boss');
    expect(b.sweepOn).toBe(true);
    for (let i = 0; i < 25 && (await T(page, 'return T.boss.sweepHits')) === 0; i++) { b = await T(page, 'return T.boss'); await D(page, `place(0,${b.sweepGy},${b.sweepZ})`); await D(page, 'trace(0.08)'); }
    b = await T(page, 'return T.boss');
    expect(b.sweepHits).toBeGreaterThanOrEqual(1);
    // F2: punto de control 1 → se adelanta y siembra minas en tu camino
    await D(page, 'teleport(1,18,-114)'); await sim(page, 0.3);
    expect(await T(page, 'return T.boss.phase')).toBe(2);
    await D(page, 'trace(2.5)');
    expect(await T(page, 'return T.boss.mines')).toBeGreaterThanOrEqual(1);
    // captura: volvés al punto de control con penalización
    await D(page, 'bossCapture()'); await sim(page, 1);
    expect(await T(page, 'return T.run.captures')).toBe(1);
    expect(await T(page, 'return T.state')).toBe('play');
    expect(await T(page, 'return T.hp')).toBe(2);
    // F3: punto de control 2 → sobrecarga
    await D(page, 'teleport(-3,12.6,-228)'); await sim(page, 0.3);
    expect(await T(page, 'return T.boss.phase')).toBe(3);
    // escape: meta del campeonato
    await D(page, 'finish()'); await sim(page, 0.2);
    expect(await T(page, 'return T.state')).toBe('finish');
    await sim(page, 3.5);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('result');
    await expect(page.locator('#cv-end h1')).toContainText(/ESCAPASTE|CAMPEÓN/);
    const s = await T(page, 'return T.save');
    expect(s.escaped).toBe(true);
    expect((await T(page, 'return T.missions')).achievements.done.escape).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:scores') || '{}').carrera_vertical)).toBeGreaterThan(3000);
    expectNoErrors(errors);
  });

  test('derrotas (tiempo agotado y captura) con reintento; victoria con pantalla de meta', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await D(page, "goto('amanecer')");
    await D(page, 'setTime(999)'); await sim(page, 0.1);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#cv-end')).toContainText('TIEMPO AGOTADO');
    if (isMobile) await page.locator('#cv-end [data-retry]').tap(); else await page.locator('#cv-end [data-retry]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/count|play/);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    expect(await T(page, 'return T.time')).toBeLessThan(5);
    // captura definitiva en el Circuito Maestro (Normal: 3 capturas)
    await D(page, "goto('maestro')");
    for (let i = 0; i < 3; i++) { await D(page, 'bossCapture()'); await sim(page, 1); }
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#cv-end')).toContainText('ATRAPÓ');
    // victoria de circuito
    await D(page, "goto('amanecer')");
    await D(page, 'finish()'); await sim(page, 0.2); await sim(page, 2.2);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('result');
    await expect(page.locator('#cv-end h1')).toContainText('META');
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanuda y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => T(page, 'return T.time'), POLL).toBeGreaterThan(0.2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await T(page, 'return { t: T.simTime, r: T.time, p: T.player, e: T.enemies }');
    await wait(page, 1000);
    const b = await T(page, 'return { t: T.simTime, r: T.time, p: T.player, e: T.enemies }');
    expect(b).toEqual(a);
    expect(await T(page, 'return T.paused')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => T(page, 'return T.time'), POLL).toBeGreaterThan(b.r);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/count|play/);
    const r = await T(page, 'return { r: T.time, p: T.player, score: T.score, cp: T.run.cp }');
    expect(r.r).toBeLessThan(1);
    expect(r.cp).toBe(-1);
    expect(Math.abs(r.p.z - 2)).toBeLessThan(1.5);
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('cv-once')) { sessionStorage.setItem('cv-once', '1'); localStorage.setItem('carrera_vertical:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#cv-menu .cv-course[disabled]')).toHaveCount(3);
    expect(await page.evaluate(() => localStorage.getItem('carrera_vertical:save:corrupto'))).toBe('{esto no es json');
    await page.evaluate(() => localStorage.setItem('carrera_vertical:save', JSON.stringify({ v: 1, d: { unlocked: 'x', best: { amanecer: -5, neon: 'abc' }, done: { puerto: true }, ghosts: { amanecer: { t: 3, d: [1, 2, 'x'] } }, opts: { sens: 99, binds: { jump: 3 } }, last: 'nada' } })));
    await page.reload();
    await ready(page);
    const s = await T(page, 'return T.save');
    expect(s.best).toEqual({});
    expect(s.ghosts).toEqual({});
    expect(s.opts.sens).toBe(1);
    expect(s.opts.binds.jump).toBe('Space');
    expect(s.last).toBe('amanecer');
    // «puerto» completado desbloquea hasta el Maestro: nunca queda progreso inaccesible
    expect(s.unlocked).toBe(4);
    expectNoErrors(errors);
  });

  test('la dificultad cambia parámetros medibles', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    const pick = async label => { const b = page.locator('#cv-menu [role=radio]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Difícil');
    await expect(page.locator('#cv-menu [data-dtab]')).toContainText('Caída +7 s');
    let d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'dificil', fallPen: 7, captures: 2 });
    await pick('Fácil');
    d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'facil', fallPen: 3, captures: 4 });
    expect(d.detect).toBeGreaterThan(0.8);
    await start(page, isMobile);
    await D(page, 'fall()'); await sim(page, 1.2);
    expect(await T(page, 'return T.pen')).toBe(3);
    expect(await T(page, 'return T.run.limit')).toBeCloseTo(100 * 1.6, 0);
    expectNoErrors(errors);
  });

  test('la calidad gráfica cambia costos reales', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    const lo = await T(page, 'return T.quality');
    expect(lo).toMatchObject({ q: 'low', pixelRatio: 1, shadows: false, particles: 90, skyline: 70, glow: false });
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    const hi = await T(page, 'return T.quality');
    expect(hi).toMatchObject({ q: 'high', shadows: true, particles: 420, skyline: 320, glow: true });
    expect(hi.far).toBeGreaterThan(lo.far);
    expect(hi.fogFar).toBeGreaterThan(lo.fogFar);
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y horizontal; controles táctiles', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, true);
    await expect(page.locator('#cv-tip')).toBeVisible({ timeout: 40_000 });
    const check = async () => {
      const r = await page.evaluate(() => {
        const sel = ['#cv-time', '#cv-chips', '#cv-tip', '.mlm-hud', '.mla-bar', '.k3-joy', '.k3-btn[aria-label="jump"]', '.k3-btn[aria-label="slide"]', '.k3-btn[aria-label="action"]', '#cv-prompt'];
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
    await page.setViewportSize({ width: 915, height: 412 });
    await wait(page, 800);
    await check();
    // táctil: saltar, y deslizar mientras corrés con el joystick
    await page.locator('.k3-btn[aria-label="jump"]').tap();
    await expect.poll(() => T(page, 'return T.player.y'), POLL).toBeGreaterThan(12.2);
    await expect.poll(() => T(page, 'return T.player.grounded'), POLL).toBe(true);
    const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await touch(page, 'touchStart', cx, cy); await touch(page, 'touchMove', cx, cy - 60);
    await expect.poll(() => T(page, 'return T.player.speed'), POLL).toBeGreaterThan(5);
    // segundo dedo sobre DESLIZ sin soltar el joystick
    const sb = /** @type {any} */ (await page.locator('.k3-btn[aria-label="slide"]').boundingBox());
    const cdp = cdps.get(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy - 60, id: 1 }, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2, id: 2 }] });
    await expect.poll(() => T(page, 'return T.run.maxCombo'), POLL).toBeGreaterThanOrEqual(1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: cx, y: cy - 60, id: 1 }] });
    await touch(page, 'touchEnd', 0, 0);
    await page.setViewportSize({ width: 412, height: 915 });
    expectNoErrors(errors);
  });
});
