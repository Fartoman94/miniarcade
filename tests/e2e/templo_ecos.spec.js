// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait } from './helpers.js';

// Templo de los Ecos (Three.js 0.186). En headless el WebGL es SwiftShader (CPU): el juego corre a pocos FPS,
// así que las esperas son por condición (expect.poll) y los tramos largos usan simulate() determinista (?debug),
// mientras las teclas/toques reales siguen apretados: la entrada es real y el tiempo de juego es fijo.

const FILE = 'templo_ecos.html';
const DBG = 'templo_ecos.html?debug';
const T = (page, body) => page.evaluate(`(()=>{ const T = window.__templo_ecos; ${body} })()`);
const D = (page, call) => page.evaluate(`window.__templo_ecos.debug.${call}`);
const POLL = { timeout: 40_000 };

async function ready(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__templo_ecos?.state === 'menu' && /** @type {any} */ (window).__templo_ecos.perf.frames > 1, null, { timeout: 45_000 });
}
/** Arranca desde el menú con entrada real (Enter en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#te-menu [data-go]').tap();
  else { await page.locator('#te-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
}
/** Igual que start() y además congela el bucle real (?debug): sólo simulate() avanza el juego, así la entrada real
 * (teclas/toques) se consume siempre en el próximo paso simulado y los resultados no dependen de la carga de la CPU. */
async function sim(page, sec) { await D(page, `simulate(${sec})`); }
async function startFrozen(page, isMobile) {
  await start(page, isMobile); await D(page, 'freeze(true)');
  // calidad baja (DPR 1, sin sombras): el rasterizado por software de cada cuadro real no ahoga a la CPU cuando corren varios workers
  await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
  await sim(page, 0.15); // primer HUD
}
/** Mantiene una tecla mientras corre un tramo de simulación determinista. */
async function hold(page, key, sec) { await page.keyboard.down(key); await D(page, `simulate(${sec})`); await page.keyboard.up(key); }
const cdps = new WeakMap();
async function touch(page, type, x, y) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
/** Empuja un bloque con teclas reales desde una posición. */
async function pushFrom(page, x, z, key, times = 1) {
  for (let i = 0; i < times; i++) { await D(page, `teleport(${x},0,${z})`); await hold(page, key, 0.7); await sim(page, 0.45); if (key === 'KeyW') z -= 2; if (key === 'KeyS') z += 2; if (key === 'KeyD') x += 2; if (key === 'KeyA') x -= 2; }
}
async function solvePlates(page) {
  await pushFrom(page, -6.4, 10, 'KeyD'); await pushFrom(page, -2, 12.4, 'KeyW', 2);
  await pushFrom(page, 6.4, 10, 'KeyA'); await pushFrom(page, 2, 12.4, 'KeyW', 2);
  await D(page, 'teleport(0,0,1)'); await sim(page, 0.5);
}

/** Toques múltiples reales por CDP (cada punto con su id). */
async function touches(page, type, points) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(p => ({ x: p.x, y: p.y, id: p.id })) });
}
const center = async (page, sel) => { const b = /** @type {any} */ (await page.locator(sel).boundingBox()); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))));
const SIZES = [[360, 640], [390, 844], [412, 915], [915, 412], [844, 390]];
/** Revisa la UI propia del juego: dentro de la pantalla, sin superponerse con la barra del SDK, misiones, controles ni entre sí. */
async function auditLayout(page) {
  return page.evaluate(() => {
    const vis = e => { if (!e || e.closest('[hidden]')) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? b : null; };
    const SEL = ['#te-status', '#te-side', '#te-prompt', '#te-rot', '.mlm-hud', '.mla-bar', '.k3-joy', '.k3-btn[aria-label="jump"]', '.k3-btn[aria-label="use"]', '.k3-btn[aria-label="eco"]'];
    const boxes = SEL.map(s => { const b = vis(document.querySelector(s)); return b ? { s, x: b.left, y: b.top, r: b.right, b: b.bottom } : null; }).filter(Boolean);
    const hits = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      if (a.x < c.r - 1 && a.r > c.x + 1 && a.y < c.b - 1 && a.b > c.y + 1) hits.push(a.s + ' × ' + c.s);
    }
    const out = boxes.filter(b => b.x < -1 || b.y < -1 || b.r > innerWidth + 1 || b.b > innerHeight + 1).map(b => b.s);
    // el contenido de la columna derecha no se recorta (salvo el objetivo, que cede lugar a propósito)
    const side = document.querySelector('#te-side');
    const clipped = [...side.querySelectorAll('#te-tip button, #te-boss .te-bar')].filter(e => { const b = vis(e); const sb = side.getBoundingClientRect(); return b && (b.bottom > sb.bottom + 1); }).map(e => e.textContent || 'barra');
    const targets = [...document.querySelectorAll('.k3-btn, .mla-bar button, #te-tip button, #te-prompt, #te-rot')].map(e => ({ e, b: vis(e) })).filter(x => x.b)
      .filter(x => x.b.width < 44 || x.b.height < 44).map(x => (x.e.getAttribute('aria-label') || x.e.textContent || '').trim().slice(0, 20) + ' ' + Math.round(x.b.width) + '×' + Math.round(x.b.height));
    const fonts = [...document.querySelectorAll('#te-status .te-chip, #te-obj, #te-boss small, #te-tip, #te-prompt, .mlm-m')].filter(e => vis(e))
      .map(e => ({ t: (e.textContent || '').trim().slice(0, 16), f: parseFloat(getComputedStyle(e).fontSize), min: e.classList.contains('mlm-m') ? 11 : 12 })).filter(x => x.f < x.min).map(x => x.t + ' ' + x.f);
    return { hits, out, clipped, targets, fonts, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
  });
}
function expectClean(r, label) {
  expect(r.hits, label).toEqual([]);
  expect(r.out, label).toEqual([]);
  expect(r.clipped, label).toEqual([]);
  expect(r.targets, label).toEqual([]);
  expect(r.fonts, label).toEqual([]);
  expect(r.sw, label).toBeLessThanOrEqual(r.w);
  expect(r.sh, label).toBeLessThanOrEqual(r.h);
}

test.describe('Templo de los Ecos', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(180_000); });

  test('carga sin errores: menú con crédito, dificultad y fondo 3D', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#te-menu h1')).toContainText('TEMPLO DE LOS ECOS');
    await expect(page.locator('#te-menu .te-credit')).toContainText('CREADO POR');
    await expect(page.locator('#te-menu [role=radiogroup] [role=radio]')).toHaveCount(4);
    const s = await T(page, 'return { calls: T.perf.calls, scene: T.scene }');
    expect(s.scene).toBe('Vestíbulo de Estatuas');
    expect(s.calls).toBeGreaterThan(5);
    expect(s.calls).toBeLessThan(140);
    expectNoErrors(errors);
  });

  test('arranque con entrada real, movimiento y salto', async ({ page, isMobile }) => {
    // Determinista: la entrada real (tecla o toque) queda apretada mientras corre simulate(); el salto se verifica con
    // contadores monótonos (saltos y altura máxima) en vez de muestrear la altura en el instante justo (era la causa del flaky en CI).
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type))).toContain('start');
    await expect(page.locator('#te-status')).toBeVisible();
    const z0 = (await T(page, 'return T.player')).z;
    if (isMobile) {
      const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await touch(page, 'touchStart', cx, cy); await touch(page, 'touchMove', cx, cy - 50);
      await sim(page, 0.6);
      await touch(page, 'touchEnd', 0, 0);
    } else {
      await page.keyboard.down('KeyW'); await sim(page, 0.6); await page.keyboard.up('KeyW');
    }
    expect((await T(page, 'return T.player')).z).toBeLessThan(z0 - 0.8);
    expect((await T(page, 'return T.stats')).moved).toBeGreaterThan(0.8);
    await sim(page, 0.3);
    expect(await T(page, 'return T.player.grounded')).toBe(true);
    // salto: botón táctil real / Espacio real; el flanco queda guardado hasta el próximo paso, así que simulate lo consume siempre
    if (isMobile) await page.locator('.k3-btn[aria-label="jump"]').tap(); else await page.keyboard.press('Space');
    await sim(page, 1.0);
    const st = await T(page, 'return T.stats');
    expect(st.jumps).toBe(1);
    expect(st.peak).toBeGreaterThan(0.2);
    expect(await T(page, 'return T.player.grounded')).toBe(true);
    expectNoErrors(errors);
  });

  test('tutorial contextual: aparece, se salta y se reactiva desde la ayuda', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect(page.locator('#te-tip')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#te-tip')).toContainText(isMobile ? 'joystick' : 'WASD');
    await page.locator('#te-tip [data-t="skip"]').click();
    await expect(page.locator('#te-tip')).toBeHidden();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(true);
    // la ayuda se reabre desde la pausa
    await page.locator('.mla-bar button[aria-label="Pausa"]').click();
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'Cómo jugar' }).click();
    await expect(page.locator('#te-help')).toBeVisible();
    await expect(page.locator('#te-help')).toContainText('Guardián Eco');
    await page.locator('#te-help [data-retut]').click();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(false);
    // al cerrar vuelve al menú de pausa
    await expect(page.locator('.mla-pause')).toBeVisible();
    expectNoErrors(errors);
  });

  test('placas de presión, bloques movibles y puerta sellada con entrada real', async ({ page, isMobile }) => {
    test.skip(isMobile, 'empuje por teclado: en celular se cubre con el joystick en otra prueba');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    // empujar el bloque b1 una baldosa al este caminando contra él
    await pushFrom(page, -6.4, 10, 'KeyD');
    expect((await T(page, 'return T.puzzle.blocks')).b1).toEqual([-2, 10]);
    // dos empujes al norte lo dejan sobre la placa p1
    await pushFrom(page, -2, 12.4, 'KeyW', 2);
    let pz = await T(page, 'return T.puzzle');
    expect(pz.blocks.b1).toEqual([-2, 6]);
    expect(pz.plates.p1).toBe(true);
    expect(pz.doors.a1_santuario).toBe(false);
    // placa: se hunde con la exploradora y vuelve al salir
    await D(page, 'teleport(0,0,1)'); await sim(page, 0.3);
    expect((await T(page, 'return T.puzzle.plates')).p3).toBe(true);
    await D(page, 'teleport(0,0,3.5)'); await sim(page, 0.3);
    expect((await T(page, 'return T.puzzle.plates')).p3).toBe(false);
    // el otro bloque y las tres placas a la vez: la puerta sellada se abre para siempre
    await pushFrom(page, 6.4, 10, 'KeyA'); await pushFrom(page, 2, 12.4, 'KeyW', 2);
    await D(page, 'teleport(0,0,1)'); await sim(page, 1.5);
    pz = await T(page, 'return T.puzzle');
    expect(pz.doors.a1_santuario).toBe(true);
    // la puerta abierta deja pasar: caminar hacia el santuario
    await D(page, 'teleport(0,0,-2.5)'); await hold(page, 'KeyW', 0.8);
    expect((await T(page, 'return T.player.z'))).toBeLessThan(-5);
    // altar de reinicio devuelve los bloques (sin bloqueo irreversible)
    await D(page, 'use("reset:a1")'); await sim(page, 0.2);
    expect((await T(page, 'return T.puzzle.blocks')).b1).toEqual([-4, 10]);
    expect((await T(page, 'return T.save.doors')).a1_santuario).toBe(true);
    expectNoErrors(errors);
  });

  test('Sello del Eco: reliquia, arañas, pared secreta y códice (misión principal + secundaria persistentes)', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'openDoor("a1_santuario")');
    await D(page, 'teleport(0,0,-8)'); await sim(page, 0.3);
    expect(await T(page, 'return T.prompt')).toBe('Tomar el Sello del Eco');
    if (isMobile) await page.locator('.k3-btn[aria-label="use"]').tap(); else await page.keyboard.press('KeyE');
    await sim(page, 0.1);
    expect(await T(page, 'return T.save.relics.sello')).toBe(true);
    const m = await T(page, 'return T.missions.current.find(x => x.id === "sello")');
    expect(m.status).toBe('done');
    // las arañas despiertan; el Eco las destruye
    await sim(page, 1.0);
    expect((await T(page, 'return T.enemies')).filter(e => e.kind === 'spider' && e.state !== 'sleep').length).toBe(2);
    if (isMobile) await page.locator('.k3-btn[aria-label="eco"]').tap(); else await page.keyboard.press('KeyF');
    await sim(page, 0.1);
    expect(await T(page, 'return T.enemies.filter(e => e.kind === "spider" && e.dead).length')).toBe(2);
    // pared agrietada: el Eco la derrumba y la sala secreta cuenta
    await D(page, 'teleport(7.6,0,8)'); await sim(page, 1.2);
    if (isMobile) await page.locator('.k3-btn[aria-label="eco"]').tap(); else await page.keyboard.press('KeyF');
    await sim(page, 0.2);
    expect(await T(page, 'return T.puzzle.walls.s1')).toBe(true);
    await D(page, 'teleport(13.5,0,8)'); await sim(page, 0.4);
    const s = await T(page, 'return T.save');
    expect(s.secrets).toContain('s1');
    expect(s.codices).toContain('v3');
    // persistencia tras recargar: campaña y logros
    await page.reload();
    await ready(page);
    await expect(page.locator('#te-menu [data-go]')).toContainText('Continuar');
    const after = await page.evaluate(() => ({ save: JSON.parse(localStorage.getItem('templo_ecos:save') || '{}').d, missions: JSON.parse(localStorage.getItem('ml:missions') || '{}').templo_ecos }));
    expect(after.save.relics.sello).toBe(true);
    expect(after.save.walls.s1).toBe(true);
    expect(after.missions.done.sello).toBeGreaterThan(0);
    // al seguir, la pared sigue rota y el códice ya no está
    await start(page, isMobile);
    expect(await T(page, 'return T.puzzle.walls.s1')).toBe(true);
    expectNoErrors(errors);
  });

  test('espejos giratorios: la luz se redirige con E, enciende el receptor y el estado persiste', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'goto(2)');
    const beams0 = await T(page, 'return T.counts.beams');
    const pressUse = async () => { if (isMobile) await page.locator('.k3-btn[aria-label="use"]').tap(); else await page.keyboard.press('KeyE'); await sim(page, 0.5); };
    // m1 (-14,2): un giro → la luz dobla al oeste hacia m2
    await D(page, 'teleport(-12.6,0,2.6)'); await sim(page, 0.3);
    expect(await T(page, 'return T.prompt')).toBe('Girar espejo');
    await pressUse();
    expect((await T(page, 'return T.puzzle.mirrors')).m1).toBe(1);
    expect(await T(page, 'return T.counts.beams')).toBeGreaterThanOrEqual(beams0);
    // m2 (-21,2) tres giros, m3 (-21,-4) tres giros
    await D(page, 'teleport(-19.6,0,3)'); await sim(page, 0.3);
    for (let i = 0; i < 3; i++) await pressUse();
    await D(page, 'teleport(-19.6,0,-4.8)'); await sim(page, 0.3);
    for (let i = 0; i < 3; i++) await pressUse();
    await sim(page, 1.5);
    const pz = await T(page, 'return T.puzzle');
    expect(pz.mirrors).toEqual({ m1: 1, m2: 3, m3: 1 });
    expect(pz.receptors.rLuz).toBe(true);
    expect(await T(page, 'return T.counts.beams')).toBeGreaterThanOrEqual(4);
    expect((await T(page, 'return T.save.rooms')).luz).toBe(true);
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('templo_ecos:save') || '{}').d.mirrors)).toEqual({ m1: 1, m2: 3, m3: 1 });
    expectNoErrors(errors);
  });

  test('Sala del Eco: melodía de cristales, nota equivocada despierta arañas, acertijo sin pistas', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'goto(2)');
    await D(page, 'teleport(0,0,-19.8)'); await sim(page, 0.3);
    expect(await T(page, 'return T.prompt')).toBe('Escuchar la melodía');
    if (isMobile) await page.locator('.k3-btn[aria-label="use"]').tap(); else await page.keyboard.press('KeyE');
    await sim(page, 5);
    const echo = await T(page, 'return T.puzzle.echo');
    expect(echo.len).toBe(4);
    const wrong = (echo.melody[0] + 1) % 4;
    await D(page, `strike(${wrong})`);
    await sim(page, 0.3);
    expect((await T(page, 'return T.enemies')).filter(e => e.kind === 'spider' && e.state !== 'sleep').length).toBeGreaterThanOrEqual(2);
    await sim(page, 6);
    for (const k of echo.melody) { await D(page, `strike(${k})`); await sim(page, 0.2); }
    expect((await T(page, 'return T.puzzle.echo')).state).toBe('done');
    const ms = await T(page, 'return T.missions.current');
    expect(ms.find(m => m.id === 'sinpistas').status).toBe('done');
    expectNoErrors(errors);
  });

  test('plataformas temporizadas, caída al abismo y checkpoint de brasero', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'teleport(0,0,-16)'); await sim(page, 0.5);
    expect(await T(page, 'return T.save.cp')).toBe('a1_abismo');
    // las plataformas alternan (sólida → parpadeo → hueca)
    const seen = new Set();
    for (let i = 0; i < 8; i++) { seen.add(JSON.stringify(await T(page, 'return T.puzzle.platforms[0]'))); await sim(page, 0.5); }
    expect(seen.size).toBe(2);
    // caer devuelve al brasero y cuesta un corazón (sin gastar llama)
    const hp0 = await T(page, 'return T.hp'), fl0 = await T(page, 'return T.flames');
    await D(page, 'teleport(6,0,-21)'); await sim(page, 2.5);
    const p = await T(page, 'return T.player');
    expect(Math.hypot(p.x - 0, p.z + 16)).toBeLessThan(1.5);
    expect(await T(page, 'return T.hp')).toBe(hp0 - 1);
    expect(await T(page, 'return T.flames')).toBe(fl0);
    expectNoErrors(errors);
  });

  test('los tres escenarios cargan y transicionan con entrada real', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mismo recorrido que escritorio; en celular se cubre el uso táctil en otras pruebas');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    await D(page, 'give("sello")');
    await D(page, 'teleport(0,0,-33.6)'); await sim(page, 0.3);
    expect(await T(page, 'return T.prompt')).toBe('Abrir con el Sello del Eco');
    await page.keyboard.press('KeyE'); await sim(page, 1.6);
    await hold(page, 'KeyW', 1.4);
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Salas de Resonancia');
    await sim(page, 0.6);
    // volver al vestíbulo y regresar
    await D(page, 'teleport(0,0,15.6)'); await sim(page, 0.2);
    expect(await T(page, 'return T.prompt')).toBe('Volver al Vestíbulo');
    await page.keyboard.press('KeyE'); await sim(page, 0.6);
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Vestíbulo de Estatuas');
    await D(page, 'goto(2)');
    for (const r of ['luz', 'eco', 'vacio']) await D(page, `solveRoom("${r}")`);
    await D(page, 'teleport(0,0,1.6)'); await sim(page, 0.3);
    expect(await T(page, 'return T.prompt')).toBe('Descender a la Cámara del Guardián');
    await page.keyboard.press('KeyE'); await sim(page, 0.6);
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Cámara del Guardián');
    const c = await T(page, 'return T.counts');
    expect(c.colliders).toBeGreaterThan(30);
    expectNoErrors(errors);
  });

  test('rivales: centinela embiste y queda aturdido, espectro repelido y disuelto por la luz', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica de IA: igual en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, false);
    // centinela: te ve dentro del cono → alerta → embiste
    await D(page, 'teleport(0,0,1.0)');
    const states = new Set();
    for (let i = 0; i < 40; i++) { await sim(page, 0.1); states.add((await T(page, 'return T.enemies[0].state'))); await D(page, 'setHP(4)'); }
    expect([...states]).toEqual(expect.arrayContaining(['alert', 'charge']));
    // espectro vigía: persigue, el Eco lo repele y la luz lo disuelve
    await D(page, 'give("sello")'); await D(page, 'goto(2)');
    await D(page, 'teleport(-18,0,3)'); await sim(page, 1.5);
    expect(await T(page, 'return T.enemies.find(e => e.kind === "spectre").state')).toBe('hunt');
    await page.keyboard.press('KeyF'); await sim(page, 0.1);
    expect(await T(page, 'return T.enemies.find(e => e.kind === "spectre").state')).toBe('repel');
    // la luz lo disuelve: m1 desvía el rayo al oeste (z=2) y el espectro lo cruza al perseguirte
    await D(page, 'rotateMirror("m1")'); await sim(page, 0.6);
    await D(page, 'teleport(-17.5,0,-0.4)');
    let gone = false;
    for (let i = 0; i < 24 && !gone; i++) { await D(page, 'setHP(4)'); await sim(page, 0.5); gone = (await T(page, 'return T.enemies.find(e => e.kind === "spectre").state')) === 'gone'; }
    expect(gone).toBe(true);
    expect(await T(page, 'return T.missions.running')).toBe(true);
    expectNoErrors(errors);
  });

  test('Guardián Eco: intro, 3 fases (rayos devueltos con Eco, resonadores, corazón) y victoria', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'give("sello")');
    await D(page, 'goto(3)');
    // entrar a la arena dispara la intro (cinemática)
    await D(page, 'teleport(0,0,10.5)'); await sim(page, 0.4);
    expect(await T(page, 'return T.state')).toBe('cutscene');
    await sim(page, 5);
    expect(await T(page, 'return T.boss.phase')).toBe(1);
    expect(await T(page, 'return T.puzzle.doors.a3_puerta')).toBe(false);
    // F1: devolver rayos con el Eco cuando están cerca
    // el reflejo es de reacción: se usa la tecla F en ambos proyectos (en celular el bucle real a DPR alto es tan lento
    // que el toque llega tarde); el botón táctil ECO se prueba en «Sello del Eco».
    const eco = async () => { await page.keyboard.press('KeyF'); };
    for (let i = 0; i < 700; i++) {
      await D(page, 'setHP(4)'); await sim(page, 0.05);
      const r = await T(page, 'const b = T.boss, p = T.player; return { ph: b.phase, near: b.orbs.some(o => !o.back && Math.hypot(o.x - p.x, o.z - p.z) < 3.2) }');
      if (r.ph !== 1) break;
      if (r.near) await eco();
    }
    let b = await T(page, 'return T.boss');
    expect(b.reflects).toBeGreaterThanOrEqual(3);
    await sim(page, 3);
    expect(await T(page, 'return T.boss.phase')).toBe(2);
    // F2: placa abre la luz del resonador; el espejo se gira con E hasta apuntar al Guardián
    const resonate = async (plate, near, mirror, turns) => {
      await eco(); await sim(page, 0.1);
      await D(page, `teleport(${plate})`); await D(page, 'setHP(4)'); await sim(page, 0.3);
      await D(page, `teleport(${near})`); await sim(page, 0.2);
      for (let i = 0; i < turns; i++) { if (isMobile) await page.locator('.k3-btn[aria-label="use"]').tap(); else await page.keyboard.press('KeyE'); await D(page, 'setHP(4)'); await sim(page, 0.5); }
      await D(page, 'setHP(4)'); await sim(page, 1.6);
      void mirror;
    };
    await resonate('12.6,0,0', '11.3,0,0.5', 'rE', 2);
    expect(await T(page, 'return T.boss.shards')).toBe(2);
    await resonate('-12.6,0,0', '-11.3,0,0.5', 'rW', 2);
    await resonate('0,0,-12.6', '0.6,0,-11.3', 'rN', 2);
    await sim(page, 3);
    b = await T(page, 'return T.boss');
    expect(b.phase).toBe(3);
    expect(b.integrity).toBeGreaterThan(0);
    // F3: el corazón baja; dos rayos más devueltos
    await D(page, 'teleport(0,0,9)');
    for (let i = 0; i < 700; i++) {
      await D(page, 'setHP(4)'); await sim(page, 0.05);
      const r = await T(page, 'const b = T.boss, p = T.player; return { ph: b.phase, near: b.orbs.some(o => !o.back && Math.hypot(o.x - p.x, o.z - p.z) < 3.2) }');
      if (r.ph !== 3) break;
      if (r.near) await eco();
    }
    expect(await T(page, 'return T.boss.phase')).toBe(4);
    await sim(page, 5);
    await D(page, 'teleport(0,0,2.6)'); await sim(page, 0.2);
    expect(await T(page, 'return T.prompt')).toBe('Desactivar el Corazón del Templo');
    if (isMobile) await page.locator('.k3-btn[aria-label="use"]').tap(); else await page.keyboard.press('KeyE');
    await sim(page, 5);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('victory');
    await expect(page.locator('#te-end')).toContainText('VICTORIA');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:scores') || '{}').templo_ecos)).toBeGreaterThan(3000);
    expect((await T(page, 'return T.save')).bossDone).toBe(true);
    expectNoErrors(errors);
  });

  test('drenaje de la reliquia: perderla reinicia la fase; derrota sin llamas y reintento', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, isMobile);
    await D(page, 'spawnBoss()'); await sim(page, 0.3); await D(page, 'skipCut()'); await sim(page, 0.1);
    await D(page, 'bossPhase(2)');
    await D(page, 'teleport(0,0,9)');
    const fl0 = await T(page, 'return T.flames');
    let lost = false;
    for (let i = 0; i < 60 && !lost; i++) { await D(page, 'setHP(4)'); await sim(page, 0.5); const b = await T(page, 'return T.boss'); if (b.drain === 'attached') { await sim(page, 8); lost = true; } }
    expect(lost).toBe(true);
    await expect.poll(() => T(page, 'return T.flames'), POLL).toBe(fl0 - 1);
    await sim(page, 2);
    expect(await T(page, 'return T.boss.integrity')).toBe(3);
    // derrota: última llama
    await D(page, 'setFlames(1)'); await sim(page, 1.6);
    await D(page, 'hurt(10)'); await sim(page, 2);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#te-end')).toContainText('DERROTA');
    if (isMobile) await page.locator('#te-end [data-retry]').tap(); else await page.locator('#te-end [data-retry]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    expect(await T(page, 'return T.flames')).toBe(5);
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanuda y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(0.2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, e: T.enemies }');
    await wait(page, 1000);
    const b = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, e: T.enemies }');
    expect(b).toEqual(a);
    expect(await T(page, 'return T.paused')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(b.r);
    // reiniciar
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    const r = await T(page, 'return { r: T.runTime, hp: T.hp, max: T.maxHp, fl: T.flames, p: T.player, score: T.score }');
    expect(r.r).toBeLessThan(1);
    expect(r.hp).toBe(r.max);
    expect(r.score).toBe(0);
    expect(Math.abs(r.p.z - 15)).toBeLessThan(1);
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('te-once')) { sessionStorage.setItem('te-once', '1'); localStorage.setItem('templo_ecos:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#te-menu [data-go]')).toContainText('Comenzar');
    expect(await page.evaluate(() => localStorage.getItem('templo_ecos:save:corrupto'))).toBe('{esto no es json');
    await page.evaluate(() => localStorage.setItem('templo_ecos:save', JSON.stringify({ v: 1, d: { area: 'x', relics: 5, codices: 'abc', opts: { sens: 99, binds: { jump: 3 } }, started: true } })));
    await page.reload();
    await ready(page);
    const s = await T(page, 'return T.save');
    expect(s.area).toBe(1);
    expect(s.relics).toEqual({ sello: false, plumas: false });
    expect(s.codices).toEqual([]);
    expect(s.opts.sens).toBe(1);
    expect(s.opts.binds.jump).toBe('Space');
    expectNoErrors(errors);
  });

  test('la dificultad cambia parámetros medibles', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const pick = async label => { const b = page.locator('#te-menu [role=radio]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Difícil');
    await expect(page.locator('#te-menu [data-dtab]')).toContainText('Vida 3');
    let d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'dificil', hp: 3, flames: 3, melody: 5 });
    await pick('Fácil');
    d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'facil', hp: 5, flames: 9 });
    expect(d.telegraph).toBeGreaterThan(1.5);
    await start(page, isMobile);
    expect(await T(page, 'return [T.hp, T.flames]')).toEqual([5, 9]);
    expectNoErrors(errors);
  });

  test('la calidad gráfica cambia costos reales', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    const lo = await T(page, 'return T.quality');
    expect(lo).toMatchObject({ q: 'low', pixelRatio: 1, shadows: false, particles: 60, lights: 1, beamGlow: false });
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    const hi = await T(page, 'return T.quality');
    expect(hi).toMatchObject({ q: 'high', shadows: true, particles: 420, beamGlow: true });
    expect(hi.lights).toBeGreaterThan(lo.lights);
    expect(hi.fogFar).toBeGreaterThan(lo.fogFar);
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y horizontal; controles táctiles', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, true);
    await expect(page.locator('#te-tip')).toBeVisible({ timeout: 20_000 });
    const check = async () => {
      const r = await page.evaluate(() => {
        const sel = ['#te-status', '#te-side', '#te-prompt', '.mlm-hud', '.mla-bar', '.k3-joy', '.k3-btn[aria-label="jump"]', '.k3-btn[aria-label="use"]', '.k3-btn[aria-label="eco"]'];
        const boxes = sel.map(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { s, x: b.left, y: b.top, r: b.right, b: b.bottom } : null; }).filter(Boolean);
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
    await wait(page, 600);
    await check();
    // controles táctiles: saltar y usar
    await page.locator('.k3-btn[aria-label="jump"]').tap();
    await expect.poll(() => T(page, 'return T.player.y'), POLL).toBeGreaterThan(0.2);
    await page.setViewportSize({ width: 412, height: 915 });
    expectNoErrors(errors);
  });
  test('celular: matriz de pantallas (vertical y apaisado) en menú, exploración, espejo y jefe; girar en plena partida', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    // menú: el botón principal se ve, está en pantalla y mide ≥ 56 px; todo botón ≥ 44 px; sin scroll horizontal
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h }); await frames(page);
      const m = await page.evaluate(() => {
        const go = document.querySelector('#te-menu [data-go]').getBoundingClientRect();
        const small = [...document.querySelectorAll('#te-menu button')].map(b => b.getBoundingClientRect()).filter(b => b.height < 44 || b.width < 44).length;
        const el = document.elementFromPoint(go.left + go.width / 2, go.top + go.height / 2);
        return { go: { t: go.top, b: go.bottom, h: go.height, l: go.left, r: go.right }, small, hitGo: !!(el && el.closest('[data-go]')), sw: document.documentElement.scrollWidth, w: innerWidth, h: innerHeight };
      });
      const label = `menú ${w}×${h}`;
      expect(m.go.t, label).toBeGreaterThanOrEqual(0); expect(m.go.b, label).toBeLessThanOrEqual(m.h);
      expect(m.go.l, label).toBeGreaterThanOrEqual(0); expect(m.go.r, label).toBeLessThanOrEqual(m.w);
      expect(m.go.h, label).toBeGreaterThanOrEqual(56);
      expect(m.small, label).toBe(0);
      expect(m.hitGo, label).toBe(true);
      expect(m.sw, label).toBeLessThanOrEqual(m.w);
    }
    await page.setViewportSize({ width: 360, height: 640 }); await frames(page);
    await start(page, true);
    const scenes = {
      exploración: async () => { await D(page, 'showTip("move")'); },
      espejo: async () => { await D(page, 'give("sello")'); await D(page, 'goto(2)'); await D(page, 'teleport(-12.6,0,2.6)'); await sim(page, 0.4); await D(page, 'showTip("mirror")'); },
      jefe: async () => { await D(page, 'spawnBoss()'); await sim(page, 0.3); await D(page, 'skipCut()'); await sim(page, 0.1); await D(page, 'bossPhase(1)'); await D(page, 'teleport(0,0,9)'); await D(page, 'setHP(4)'); await sim(page, 0.5); await D(page, 'showTip("boss")'); },
    };
    for (const [name, setup] of Object.entries(scenes)) {
      await setup();
      for (const [w, h] of SIZES) {
        // rotar/cambiar de tamaño en plena partida: el estado sigue y la distribución se recalcula
        await page.setViewportSize({ width: w, height: h }); await frames(page);
        await D(page, 'setHP(4)'); await sim(page, 0.05);
        await page.evaluate(() => { const t = document.querySelector('.k3-toast'); if (t) t.classList.remove('on'); });
        await frames(page);
        expect(await T(page, 'return T.state'), `${name} ${w}×${h}`).toBe('play');
        await expect(page.locator('#te-tip'), `${name} ${w}×${h}`).toBeVisible();
        if (name === 'espejo') await expect(page.locator('#te-prompt'), `${name} ${w}×${h}`).toBeVisible();
        if (name === 'jefe') await expect(page.locator('#te-boss'), `${name} ${w}×${h}`).toBeVisible();
        expectClean(await auditLayout(page), `${name} ${w}×${h}`);
        // encuadre: en vertical la cámara abre el ángulo
        expect(await T(page, 'return T.touch.fov'), `${name} ${w}×${h}`).toBe(w < h * 0.8 ? 62 : 50);
      }
    }
    expectNoErrors(errors);
  });

  test('celular: recorrido sólo táctil — multitáctil, espejo y melodía tocando el aviso, Eco del jefe con margen táctil', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startFrozen(page, true);
    // multitáctil: joystick (dedo 1) + SALTO (dedo 2) a la vez
    const joy = await center(page, '.k3-joy'), jump = await center(page, '.k3-btn[aria-label="jump"]');
    const z0 = (await T(page, 'return T.player.z'));
    await touches(page, 'touchStart', [{ ...joy, id: 1 }]);
    await touches(page, 'touchMove', [{ x: joy.x, y: joy.y - 50, id: 1 }]);
    await touches(page, 'touchStart', [{ x: joy.x, y: joy.y - 50, id: 1 }, { ...jump, id: 2 }]);
    await sim(page, 0.5);
    await touches(page, 'touchEnd', [{ x: joy.x, y: joy.y - 50, id: 1 }]);
    await touches(page, 'touchEnd', []);
    await sim(page, 0.8);
    let st = await T(page, 'return T.stats');
    expect(st.jumps).toBe(1);
    expect(st.peak).toBeGreaterThan(1);
    expect((await T(page, 'return T.player.z'))).toBeLessThan(z0 - 1.5);
    // tutorial: «Entendido» se toca
    await D(page, 'showTip("interact")');
    await page.locator('#te-tip [data-t="ok"]').tap();
    await expect(page.locator('#te-tip')).toBeHidden();
    // espejo: tocar el aviso «Girar espejo» lo gira (y USAR también)
    await D(page, 'give("sello")'); await D(page, 'goto(2)');
    await D(page, 'teleport(-12.6,0,2.6)'); await sim(page, 0.3);
    await expect(page.locator('#te-prompt')).toContainText('Girar espejo');
    await page.locator('#te-prompt').tap(); await sim(page, 0.3);
    expect((await T(page, 'return T.puzzle.mirrors')).m1).toBe(1);
    await page.locator('.k3-btn[aria-label="use"]').tap(); await sim(page, 0.3);
    expect((await T(page, 'return T.puzzle.mirrors')).m1).toBe(2);
    expect((await T(page, 'return T.stats')).promptTaps).toBe(1);
    // melodía: escuchar y tocar cada cristal desde el aviso, sin teclado
    await D(page, 'teleport(0,0,-19.8)'); await sim(page, 0.3);
    await expect(page.locator('#te-prompt')).toContainText('Escuchar la melodía');
    await page.locator('#te-prompt').tap(); await sim(page, 5);
    const melody = (await T(page, 'return T.puzzle.echo')).melody;
    const SPOT = [[-4.5, -15.3], [-1.5, -17.6], [1.5, -17.6], [4.5, -15.3]];
    const NAMES = ['rojo', 'ámbar', 'turquesa', 'violeta'];
    for (const k of melody) {
      await D(page, `teleport(${SPOT[k][0]},0,${SPOT[k][1]})`); await sim(page, 0.3);
      await expect(page.locator('#te-prompt')).toContainText(NAMES[k]);
      await page.locator('#te-prompt').tap(); await sim(page, 0.2);
    }
    expect((await T(page, 'return T.puzzle.echo')).state).toBe('done');
    expect((await T(page, 'return T.save.rooms')).eco).toBe(true);
    // Guardián: el Eco táctil tiene margen (radio mayor) y un toque apenas temprano se guarda hasta que el rayo entra
    await D(page, 'spawnBoss()'); await sim(page, 0.3); await D(page, 'skipCut()'); await sim(page, 0.1);
    await D(page, 'bossPhase(1)'); await D(page, 'teleport(0,0,9)');
    const tr = await T(page, 'return T.touch');
    expect(tr.reflectR).toBeGreaterThan(await T(page, 'const d = T.difficulty; return d.parry * 13 + 0.6'));
    let early = 0;
    for (let i = 0; i < 400 && early < 2; i++) {
      await D(page, 'setHP(4)'); await sim(page, 0.05);
      const r = await T(page, `const b = T.boss, p = T.player; let d = Infinity; for (const o of b.orbs) if (!o.back && o.y < 4) d = Math.min(d, Math.hypot(o.x - p.x, o.z - p.z)); return { ph: b.phase, d, R: T.touch.reflectR, cd: T.touch.ecoBuf }`);
      if (r.ph !== 1) break;
      // toque «temprano»: el rayo todavía está fuera del radio, dentro de la ventana de guardado
      if (r.d > r.R + 0.4 && r.d < r.R + 2.4) {
        const before = await T(page, 'return T.boss.reflects');
        await page.locator('.k3-btn[aria-label="eco"]').tap();
        await sim(page, 0.4);
        if ((await T(page, 'return T.boss.reflects')) > before) early++;
        await sim(page, 1.0);
      }
    }
    expect(early).toBeGreaterThanOrEqual(2);
    expectNoErrors(errors);
  });

  test('celular: vibración opcional, pausa al pasar a segundo plano y gestos bloqueados en la superficie de juego', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    await page.addInitScript(() => { /** @type {any} */ (window).__vib = 0; navigator.vibrate = () => { /** @type {any} */ (window).__vib++; return true; }; });
    const { errors } = await openGame(page, DBG);
    await ready(page);
    // con «movimiento: completo» (headless puede informar reduced-motion) la vibración está activa por defecto
    await page.locator('#te-menu [data-opts]').tap();
    await expect(page.locator('#te-opts [data-haptics]')).toBeChecked();
    await page.locator('#te-opts [data-motion]').selectOption('full');
    await page.locator('#te-opts [data-back]').tap();
    await startFrozen(page, true);
    await page.locator('.k3-btn[aria-label="jump"]').tap();
    expect(await page.evaluate(() => /** @type {any} */ (window).__vib)).toBeGreaterThan(0);
    // apagarla desde las opciones (vía pausa)
    await page.locator('.mla-bar button[aria-label="Pausa"]').tap();
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'Controles' }).tap();
    await page.locator('#te-opts [data-haptics]').uncheck();
    expect(await T(page, 'return T.save.opts.haptics')).toBe(false);
    await page.locator('#te-opts [data-back]').tap();
    await page.locator('.mla-pause [data-a="resume"]').tap();
    await expect.poll(() => T(page, 'return T.paused'), POLL).toBe(false);
    const v0 = await page.evaluate(() => /** @type {any} */ (window).__vib);
    await page.locator('.k3-btn[aria-label="jump"]').tap();
    expect(await page.evaluate(() => /** @type {any} */ (window).__vib)).toBe(v0);
    // superficie de juego sin gestos del navegador (zoom/scroll): touch-action none en el lienzo y en el HUD
    const ta = await page.evaluate(() => ({ root: getComputedStyle(document.querySelector('canvas').parentElement).touchAction, hud: getComputedStyle(document.querySelector('#te-status')).touchAction, vp: document.querySelector('meta[name=viewport]').getAttribute('content') }));
    expect(ta.root).toBe('none'); expect(ta.hud).toBe('none');
    expect(ta.vp).not.toMatch(/user-scalable|maximum-scale/);
    // la app pasa a segundo plano → pausa
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => T(page, 'return T.paused'), POLL).toBe(true);
    await expect(page.locator('.mla-pause')).toBeVisible();
    expectNoErrors(errors);
  });
});
