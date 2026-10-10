// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait } from './helpers.js';

// Derby de Chatarra (Three.js 0.186). En headless el WebGL es SwiftShader (CPU): el juego corre a pocos FPS,
// así que las esperas son por condición (expect.poll) y los tramos largos usan simulate() determinista (?debug)
// mientras las teclas/toques reales siguen apretados: la entrada es real y el tiempo de juego es fijo.

const FILE = 'derby_chatarra.html';
const DBG = 'derby_chatarra.html?debug';
const T = (page, body) => page.evaluate(`(()=>{ const T = window.__derby_chatarra; ${body} })()`);
const D = (page, call) => page.evaluate(`window.__derby_chatarra.debug.${call}`);
const POLL = { timeout: 45_000 };

async function ready(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__derby_chatarra?.state === 'menu' && /** @type {any} */ (window).__derby_chatarra.perf.frames > 1, null, { timeout: 45_000 });
}
/** Arranca desde el menú con entrada real (Enter en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#dc-menu [data-go]').tap();
  else { await page.locator('#dc-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/countdown|play/);
}
/** Arranque real + salto de la cuenta regresiva (sólo ?debug) + rivales quietos para pruebas deterministas. */
async function startDbg(page, isMobile, freeze = true) {
  // el tiempo de juego sólo avanza con simulate(): sin dependencia de los FPS del runner
  await D(page, 'manual(true)');
  await start(page, isMobile);
  await D(page, 'skipCountdown()'); await sim(page, 0.1);
  if (freeze) await D(page, 'freezeAI(true)');
  expect(await T(page, 'return T.state')).toBe('play');
}
async function sim(page, sec) { await D(page, `simulate(${sec})`); }
/** Mantiene una tecla real mientras corre un tramo de simulación determinista. */
async function hold(page, key, sec) { await page.keyboard.down(key); await sim(page, sec); await page.keyboard.up(key); }
const cdps = new WeakMap();
async function touch(page, type, pts) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts.map((p, i) => ({ x: p[0], y: p[1], id: i + 1 })) });
}
async function center(page, sel) { const b = /** @type {any} */ (await page.locator(sel).boundingBox()); return [b.x + b.width / 2, b.y + b.height / 2]; }
async function usePower(page, isMobile) { if (isMobile) await page.locator('.k3-btn[aria-label="power"]').tap(); else await page.keyboard.press('KeyE'); await sim(page, 0.1); }

test.describe('Derby de Chatarra', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(180_000); });

  test('carga sin errores: menú con crédito, garaje, dificultad y fondo 3D', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#dc-menu h1')).toContainText('DERBY DE CHATARRA');
    await expect(page.locator('#dc-menu .dc-credit')).toContainText('CREADO POR');
    await expect(page.locator('#dc-menu [role=radiogroup] [role=radio][data-d]')).toHaveCount(4);
    await expect(page.locator('#dc-menu [data-car]')).toHaveCount(4);
    await expect(page.locator('#dc-menu [data-car="omega"]')).toBeDisabled();
    const s = await T(page, 'return { calls: T.perf.calls, scene: T.scene, cars: T.counts.cars }');
    expect(s.scene).toBe('Depósito Industrial');
    expect(s.cars).toBe(5);
    expect(s.calls).toBeGreaterThan(8);
    expect(s.calls).toBeLessThan(120);
    expectNoErrors(errors);
  });

  test('arranque con entrada real: cuenta regresiva, acelerar, girar y frenar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type))).toContain('start');
    await expect(page.locator('#dc-status')).toBeVisible();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    const p0 = await T(page, 'return T.player');
    if (isMobile) {
      const gas = await center(page, '.k3-btn[aria-label="gas"]');
      await touch(page, 'touchStart', [gas]);
      await expect.poll(() => T(page, 'return T.player.speed'), POLL).toBeGreaterThan(3);
      // volante a la derecha mientras acelera: la dirección cambia
      const joy = await center(page, '.k3-joy');
      await touch(page, 'touchMove', [gas, [joy[0] + 60, joy[1]]]).catch(() => {});
      await touch(page, 'touchEnd', []);
      await touch(page, 'touchStart', [gas, [joy[0] + 1, joy[1]]]);
      await touch(page, 'touchMove', [gas, [joy[0] + 60, joy[1]]]);
      await expect.poll(() => T(page, 'return Math.abs(T.player.yaw - ' + p0.yaw + ')'), POLL).toBeGreaterThan(0.2);
      await touch(page, 'touchEnd', []);
    } else {
      await page.keyboard.down('KeyW');
      await expect.poll(() => T(page, 'return T.player.speed'), POLL).toBeGreaterThan(3);
      await page.keyboard.down('KeyD');
      await expect.poll(() => T(page, 'return Math.abs(T.player.yaw - ' + p0.yaw + ')'), POLL).toBeGreaterThan(0.2);
      await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
      await page.keyboard.down('KeyS');
      await expect.poll(() => T(page, 'return T.player.speed'), POLL).toBeLessThan(1);
      await page.keyboard.up('KeyS');
    }
    const p1 = await T(page, 'return T.player');
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(1);
    expectNoErrors(errors);
  });

  test('tutorial contextual: aparece, se salta y se reactiva desde la ayuda de la pausa', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect(page.locator('#dc-tip')).toBeVisible({ timeout: 40_000 });
    await expect(page.locator('#dc-tip')).toContainText(isMobile ? 'VOLANTE' : 'acelerar');
    await page.locator('#dc-tip [data-t="skip"]').click();
    await expect(page.locator('#dc-tip')).toBeHidden();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(true);
    await page.locator('.mla-bar button[aria-label="Pausa"]').click();
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'Cómo jugar' }).click();
    await expect(page.locator('#dc-help')).toBeVisible();
    await expect(page.locator('#dc-help')).toContainText('Triturador Omega');
    expect(await T(page, 'return T.overlay')).toBe(true);
    await page.locator('#dc-help [data-retut]').click();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(false);
    await expect(page.locator('.mla-pause')).toBeVisible();
    expect(await T(page, 'return T.overlay')).toBe(false);
    expectNoErrors(errors);
  });

  test('rampas: salto acrobático con W real, luces encendidas y estado de sesión tras reiniciar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    await D(page, 'teleport(-34,-2,Math.PI/2)'); await D(page, 'setSpeed(24)');
    expect((await T(page, 'return T.interactions.ramps'))[0]).toMatchObject({ id: 'd_r1', used: 0, lit: false });
    await hold(page, 'KeyW', 0.85);
    const air = await T(page, 'return T.player');
    expect(air.grounded).toBe(false);
    expect(air.y).toBeGreaterThan(2);
    await hold(page, 'KeyW', 1.6);
    const r = await T(page, 'return { st: T.stats, ramp: T.interactions.ramps[0], p: T.player, score: T.score }');
    expect(r.p.grounded).toBe(true);
    expect(r.st.stunts).toBe(1);
    expect(r.ramp.lit).toBe(true);
    expect(r.ramp.best).toBeGreaterThan(0.7);
    expect(r.score).toBeGreaterThan(300);
    // el estado de la rampa persiste en la sesión: reiniciar desde la pausa no la apaga
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/countdown|play/);
    expect((await T(page, 'return T.interactions.ramps'))[0]).toMatchObject({ used: 1, lit: true });
    expect(await T(page, 'return T.stats.stunts')).toBe(0);
    expectNoErrors(errors);
  });

  test('contenedores móviles: se desplazan por el riel, se descarrilan de frente y quedan así en la sesión', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    const c0 = (await T(page, 'return T.interactions.containers'))[0];
    await sim(page, 2.5);
    const c1 = (await T(page, 'return T.interactions.containers'))[0];
    expect(c1.x).not.toBe(c0.x);
    expect(c1.derailed).toBe(false);
    // embestida lenta: rebota sin descarrilar
    await D(page, `teleport(${c1.x},${c1.z - 7},0)`); await D(page, 'setSpeed(6)'); await sim(page, 1);
    expect((await T(page, 'return T.interactions.containers'))[0].derailed).toBe(false);
    // embestida rápida de frente con W real: descarrila
    const c2 = (await T(page, 'return T.interactions.containers'))[0];
    await D(page, `teleport(${c2.x},${c2.z - 10},0)`); await D(page, 'setSpeed(22)');
    await hold(page, 'KeyW', 0.8);
    const c3 = (await T(page, 'return T.interactions.containers'))[0];
    expect(c3.derailed).toBe(true);
    await sim(page, 2);
    const c4 = (await T(page, 'return T.interactions.containers'))[0];
    expect(c4.x).toBe(c3.x);
    expect(c4.moving).toBe(false);
    // sigue siendo un obstáculo sólido
    await D(page, `teleport(${c4.x},${c4.z - 8},0)`); await hold(page, 'KeyW', 1.5);
    expect((await T(page, 'return T.player.z'))).toBeLessThan(c4.z - 1.5);
    // persiste tras reiniciar la ronda
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/countdown|play/);
    expect((await T(page, 'return T.interactions.containers'))[0].derailed).toBe(true);
    expect((await T(page, 'return T.session.deposito.containers.d_c1.derailed'))).toBe(true);
    expectNoErrors(errors);
  });

  test('interruptores de barreras: pasar por encima sube/baja la barrera, bloquea el paso y persiste', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    expect((await T(page, 'return T.interactions.barriers'))[0]).toMatchObject({ up: false, solid: false });
    // con la barrera baja se cruza el centro
    await D(page, 'teleport(-8,0,Math.PI/2)'); await hold(page, 'KeyW', 1.2);
    expect(await T(page, 'return T.player.x')).toBeGreaterThan(1);
    // pasar con el auto sobre el interruptor
    await D(page, 'teleport(-30,15,0)'); await hold(page, 'KeyW', 1.0);
    await sim(page, 1);
    expect((await T(page, 'return T.interactions.switches'))[0].on).toBe(true);
    expect((await T(page, 'return T.interactions.barriers'))[0]).toMatchObject({ up: true, solid: true, anim: 1 });
    // ahora bloquea
    await D(page, 'teleport(-8,0,Math.PI/2)'); await hold(page, 'KeyW', 1.5);
    expect(await T(page, 'return T.player.x')).toBeLessThan(-1);
    // persiste en la sesión al reiniciar
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/countdown|play/);
    expect((await T(page, 'return T.interactions.barriers'))[0]).toMatchObject({ up: true, solid: true });
    // volver a pisarlo la baja
    await D(page, 'skipCountdown()'); await sim(page, 0.1);
    await D(page, 'teleport(-30,15,0)'); await hold(page, 'KeyW', 1.0); await sim(page, 1);
    expect((await T(page, 'return T.interactions.barriers'))[0]).toMatchObject({ up: false, solid: false });
    expectNoErrors(errors);
  });

  test('torres de cajas y los cuatro potenciadores (imán, nitro, escudo, trampa) con tecla/botón real', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    await D(page, 'teleport(-36,-12,Math.PI)'); await D(page, 'setSpeed(16)'); await hold(page, 'KeyW', 1.0);
    expect((await T(page, 'return T.interactions.towers'))[0].alive).toBe(false);
    expect(await T(page, 'return T.stats.towers')).toBe(1);
    // recoger de una plataforma
    await sim(page, 3);
    const pad = await T(page, 'return T.interactions.pads.find(p => p.type && p.type !== "repair")');
    expect(pad).toBeTruthy();
    await D(page, `teleport(${pad.x},${pad.z},0)`); await sim(page, 0.1);
    expect(await T(page, 'return T.player.slot')).toBe(pad.type);
    await usePower(page, isMobile);
    // imán: atrae a La Chispa
    await D(page, 'teleport(0,10,0)'); await D(page, 'place("chispa",10,10,0)');
    await D(page, 'give("iman")'); await usePower(page, isMobile);
    expect(await T(page, 'return T.player.magnet')).toBe(true);
    await sim(page, 1.2);
    expect(await T(page, 'return Math.hypot(T.rivals[0].x - T.player.x, T.rivals[0].z - T.player.z)')).toBeLessThan(8);
    // escudo: anula el daño
    await D(page, 'give("escudo")'); await usePower(page, isMobile);
    const hp = await T(page, 'return T.hp');
    await D(page, 'hurt(30)');
    expect(await T(page, 'return T.hp')).toBe(hp);
    // nitro: más velocidad máxima
    await sim(page, 5);
    await D(page, 'teleport(-30,-20,Math.PI/2)');
    await D(page, 'give("nitro")'); await usePower(page, isMobile);
    expect(await T(page, 'return T.player.boost')).toBe(true);
    await hold(page, 'KeyW', 2.2);
    expect(await T(page, 'return T.player.speed')).toBeGreaterThan(28);
    // trampa: mina detrás; La Chispa la pisa y se daña
    const mines0 = await T(page, 'return T.interactions.mines');
    await D(page, 'teleport(-38,-5,0)'); await D(page, 'give("trampa")'); await usePower(page, isMobile);
    expect(await T(page, 'return T.interactions.mines')).toBe(mines0 + 1);
    await sim(page, 1);
    await D(page, 'place("chispa",-38,-7.8,0)'); await sim(page, 0.3);
    expect(await T(page, 'return T.interactions.mines')).toBe(mines0);
    expect(await T(page, 'return T.rivals[0].hp')).toBeLessThan(await T(page, 'return T.rivals[0].maxHp'));
    expect((await T(page, 'return T.stats.powerTypes')).length).toBeGreaterThanOrEqual(4);
    expectNoErrors(errors);
  });

  test('rivales: carga telegrafiada del ariete, salto del volador, huida del kart y punto débil del blindado', async ({ page, isMobile }) => {
    test.skip(isMobile, 'lógica de IA: idéntica en ambos proyectos');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, false, false);
    await D(page, 'god(true)');
    // volador: sube, planea sobre la sombra y aterriza vulnerable (patrón natural, semilla fija en ?debug)
    const seen = new Set();
    for (let i = 0; i < 160 && !(seen.has('glide') && seen.has('rechargeV')); i++) {
      await sim(page, 0.1);
      const h = await T(page, 'const r = T.rivals[2]; return r.state + (r.vuln ? "V" : "")');
      seen.add(h);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['rise', 'glide', 'rechargeV']));
    // ariete: telegrafía (faros + alerta) y luego carga en línea recta
    await D(page, 'freezeAI(true)');
    await D(page, 'place("toro",0,-5,Math.PI)'); await D(page, 'teleport(0,-28,0)');
    await D(page, 'freezeAI(false)'); await D(page, 'rivalState("toro","aim",0.6)');
    await sim(page, 0.2);
    expect(await T(page, 'return [T.rivals[1].state, T.rivals[1].alert]')).toEqual(['aim', true]);
    await sim(page, 0.5);
    const ch = await T(page, 'return T.rivals[1]');
    expect(ch.state).toBe('charge');
    expect(ch.boost).toBe(true);
    // ariete contra el muro: queda aturdido
    await D(page, 'freezeAI(false)');
    await D(page, 'place("toro",30,0,Math.PI/2)'); await D(page, 'rivalState("toro","charge",2.5)'); await D(page, 'teleport(-30,20,0)');
    let stun = false;
    for (let i = 0; i < 30 && !stun; i++) { await sim(page, 0.1); stun = await T(page, 'return T.rivals[1].stun'); }
    expect(stun).toBe(true);
    // blindado: la cola recibe mucho más daño que el frente
    await D(page, 'freezeAI(true)'); await D(page, 'god(false)');
    // embestida guionada en una sola evaluación (pasos fijos), con los demás rivales lejos del recorrido
    const hitTank = (fromZ, yaw) => T(page, `const D = T.debug;
      D.place('chispa', -30, 25, 0); D.place('toro', 30, 25, 0); D.place('helice', -30, -25, 0);
      D.place('tanque', -38, 0, 0); D.rivalHP('tanque', 200); D.setTime(999);
      D.teleport(-38, ${fromZ}, ${yaw}); D.setSpeed(18); D.simulate(0.8);
      return 200 - T.rivals[3].hp;`);
    const rear = await hitTank(-12, 0), front = await hitTank(12, Math.PI);
    expect(front).toBeGreaterThan(0);
    expect(rear).toBeGreaterThan(front * 2.5);
    expectNoErrors(errors);
  });

  test('tres escenarios: clasificar y avanzar con clic real, y reintentar si no clasificás', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    expect(await T(page, 'return T.scene')).toBe('Depósito Industrial');
    // no clasificar: rivales con más puntos
    for (const id of ['chispa', 'toro', 'helice', 'tanque']) await D(page, `setPoints("${id}",5000)`);
    await D(page, 'endRound()');
    expect(await T(page, 'return T.result')).toMatchObject({ kind: 'retry', place: 5 });
    await expect(page.locator('#dc-end')).toContainText('NO CLASIFICASTE');
    expect(await T(page, 'return T.save.round')).toBe(1);
    if (isMobile) await page.locator('#dc-end [data-retry]').tap(); else await page.locator('#dc-end [data-retry]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/countdown|play/);
    expect(await T(page, 'return T.scene')).toBe('Depósito Industrial');
    // ganar la ronda: pasa al Coliseo
    await D(page, 'skipCountdown()'); await sim(page, 0.1);
    await D(page, 'setPoints("player",9000)'); await D(page, 'endRound()');
    expect(await T(page, 'return T.result')).toMatchObject({ kind: 'advance', place: 1 });
    await expect(page.locator('#dc-end')).toContainText('CLASIFICASTE');
    if (isMobile) await page.locator('#dc-end [data-next]').tap(); else await page.locator('#dc-end [data-next]').click();
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Coliseo Desértico');
    let c = await T(page, 'return T.counts');
    expect(c.colliders).toBeGreaterThan(10);
    expect(await T(page, 'return T.interactions.ramps.length')).toBe(4);
    await D(page, 'skipCountdown()'); await sim(page, 0.1);
    await D(page, 'setPoints("player",9000)'); await D(page, 'endRound()');
    if (isMobile) await page.locator('#dc-end [data-next]').tap(); else await page.locator('#dc-end [data-next]').click();
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Arenas Neón');
    c = await T(page, 'return T.counts');
    expect(c.cars).toBe(5);
    expect(await T(page, 'return T.interactions.barriers.every(b => b.elec)')).toBe(true);
    expect(await T(page, 'return T.save.tour.pts.player')).toBe(20);
    expectNoErrors(errors);
  });

  test('Triturador Omega: intro, escudo frontal, carga contra barrera eléctrica, fase 2 (imán y salto) y campeón', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    await D(page, 'spawnBoss()'); await D(page, 'freezeAI(false)'); await sim(page, 0.3);
    expect(await T(page, 'return T.state')).toBe('cutscene');
    expect(await T(page, 'return T.rivals.every(r => r.retired)')).toBe(true);
    // la intro se saltea con entrada real
    if (isMobile) await page.locator('.k3-btn[aria-label="gas"]').tap(); else await page.keyboard.press('Space');
    await sim(page, 0.2);
    expect(await T(page, 'return T.state')).toBe('play');
    let b = await T(page, 'return T.boss');
    expect(b).toMatchObject({ phase: 1, shield: true });
    // golpe de frente: el escudo lo anula
    await D(page, 'god(true)');
    await D(page, `teleport(${b.x},${b.z - 14},0)`); await D(page, 'setSpeed(22)');
    await hold(page, 'KeyW', 0.7);
    expect((await T(page, 'return T.boss')).hp).toBe(b.maxHp);
    // carga telegrafiada contra la barrera eléctrica (interruptor real: pasar por encima)
    await D(page, 'teleport(-12,21,0)'); await hold(page, 'KeyW', 1.0); await sim(page, 1.6);
    expect((await T(page, 'return T.interactions.barriers'))[0].solid).toBe(true);
    await D(page, 'place("omega",0,27,Math.PI)'); await D(page, 'teleport(0,3,0)'); await D(page, 'bossCharge()');
    let stun = false;
    for (let i = 0; i < 40 && !stun; i++) { await sim(page, 0.1); stun = (await T(page, 'return T.boss')).stun; }
    b = await T(page, 'return T.boss');
    expect(b.elecStuns).toBe(1);
    expect(b.hp).toBeLessThan(b.maxHp);
    // aturdido: golpe en la cola
    const hp0 = b.hp;
    const back = await T(page, 'const o = T.boss; return [o.x, o.z]');
    await D(page, `teleport(${back[0]},${back[1] + 14},Math.PI)`); await D(page, 'setSpeed(22)'); await hold(page, 'KeyW', 0.6);
    expect((await T(page, 'return T.boss')).hp).toBeLessThan(hp0);
    // fase 2
    await D(page, 'bossPhase(2)'); await sim(page, 3);
    b = await T(page, 'return T.boss');
    expect(b).toMatchObject({ phase: 2, shield: false });
    await D(page, `teleport(${b.x + 12},${b.z},0)`); await D(page, 'bossAttack("magnet")'); await sim(page, 0.5);
    const d0 = await T(page, 'return Math.hypot(T.player.x - T.boss.x, T.player.z - T.boss.z)');
    await sim(page, 1.5);
    expect(await T(page, 'return Math.hypot(T.player.x - T.boss.x, T.player.z - T.boss.z)')).toBeLessThan(d0 - 1);
    await sim(page, 3);
    b = await T(page, 'return T.boss');
    await D(page, `teleport(${b.x + 10},${b.z},0)`); await D(page, 'bossAttack("jump")');
    let wave = false;
    for (let i = 0; i < 40 && !wave; i++) { await sim(page, 0.05); wave = (await T(page, 'return T.boss')).wave; }
    expect(wave).toBe(true);
    // derrota del jefe: recompensa y campeón
    await D(page, 'setPoints("player",9000)');
    await D(page, 'killBoss()'); await sim(page, 6);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('victory');
    await expect(page.locator('#dc-end')).toContainText('CAMPEÓN');
    const s = await T(page, 'return T.save');
    expect(s.unlocked.omega).toBe(true);
    expect(s.wins).toBe(1);
    expect(s.round).toBe(1);
    const m = JSON.parse(await page.evaluate(() => localStorage.getItem('ml:missions') || '{}')).derby_chatarra;
    expect(m.done.omega).toBeGreaterThan(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:scores') || '{}').derby_chatarra)).toBeGreaterThan(9000);
    // la recompensa aparece en el garaje
    await page.locator('#dc-end [data-menu]').click();
    await expect(page.locator('#dc-menu [data-car="omega"]')).toBeEnabled();
    expectNoErrors(errors);
  });

  test('misión principal y secundaria completas y persistentes tras recargar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    const cur = await T(page, 'return T.missions.current.map(m => m.id)');
    expect(cur.slice(0, 3)).toEqual(['clasificatoria', 'destruir5', 'omega']);
    expect(cur).toContain('saltos');
    for (let i = 0; i < 3; i++) {
      await D(page, `teleport(${i % 2 ? 34 : -34},${i % 2 ? 2 : -2},${i % 2 ? -Math.PI / 2 : Math.PI / 2})`); await D(page, 'setSpeed(24)');
      await hold(page, 'KeyW', 2.0);
    }
    expect(await T(page, 'return T.stats.stunts')).toBe(3);
    expect(await T(page, 'return T.missions.current.find(m => m.id === "saltos").status')).toBe('done');
    // destruir a todos: ronda ganada (clasificatoria) y fin por KO
    await D(page, 'wreck("all")'); await sim(page, 0.2);
    expect(await T(page, 'return T.result')).toMatchObject({ kind: 'advance', place: 1, reason: 'ko' });
    await page.reload();
    await ready(page);
    await expect(page.locator('#dc-menu [data-go]')).toContainText('Continuar');
    const after = await page.evaluate(() => ({ save: JSON.parse(localStorage.getItem('derby_chatarra:save') || '{}').d, missions: JSON.parse(localStorage.getItem('ml:missions') || '{}').derby_chatarra }));
    expect(after.save.round).toBe(2);
    expect(after.save.tour.wrecks).toBe(4);
    expect(after.save.tour.qualified).toBe(true);
    expect(after.missions.done.clasificatoria).toBeGreaterThan(0);
    expect(after.missions.done.saltos).toBeGreaterThan(0);
    // al continuar, el progreso de «destruí cinco» se recupera (4/5)
    await start(page, isMobile);
    expect(await T(page, 'return T.scene')).toBe('Coliseo Desértico');
    expect(await T(page, 'return T.missions.current.find(m => m.id === "destruir5").progress')).toBe(4);
    expectNoErrors(errors);
  });

  test('derrota: salud cero, pantalla de chatarra y reintento limpio', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, isMobile);
    await D(page, 'hurt(500)'); await sim(page, 0.3);
    expect(await T(page, 'return T.state')).toBe('wrecked');
    await sim(page, 3);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#dc-end')).toContainText('CHATARRA');
    if (isMobile) await page.locator('#dc-end [data-retry]').tap(); else await page.locator('#dc-end [data-retry]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/countdown|play/);
    expect(await T(page, 'return [T.hp, T.maxHp, T.score]')).toEqual([100, 100, 0]);
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanuda y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(0.3);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, e: T.rivals, left: T.timeLeft }');
    await wait(page, 1000);
    const b = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, e: T.rivals, left: T.timeLeft }');
    expect(b).toEqual(a);
    expect(await T(page, 'return T.paused')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(b.r);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toMatch(/countdown|play/);
    const r = await T(page, 'return { r: T.runTime, hp: T.hp, max: T.maxHp, score: T.score, p: T.player }');
    expect(r.r).toBeLessThan(1.5);
    expect(r.hp).toBe(r.max);
    expect(r.score).toBe(0);
    expect(Math.hypot(r.p.x - 0, r.p.z - 21)).toBeLessThan(1.5);
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('dc-once')) { sessionStorage.setItem('dc-once', '1'); localStorage.setItem('derby_chatarra:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#dc-menu [data-go]')).toContainText('Empezar');
    expect(await page.evaluate(() => localStorage.getItem('derby_chatarra:save:corrupto'))).toBe('{esto no es json');
    await page.evaluate(() => localStorage.setItem('derby_chatarra:save', JSON.stringify({ v: 1, d: { round: 'x', car: 'omega', unlocked: 5, tour: { pts: { player: -4, toro: 'a' }, wrecks: 'z' }, opts: { sens: 99, binds: { nitro: 3 } }, started: true } })));
    await page.reload();
    await ready(page);
    const s = await T(page, 'return T.save');
    expect(s.round).toBe(1);
    expect(s.car).toBe('escarabajo');
    expect(s.unlocked).toEqual({ omega: false });
    expect(s.tour.pts).toEqual({ player: 0, chispa: 0, toro: 0, helice: 0, tanque: 0 });
    expect(s.tour.wrecks).toBe(0);
    expect(s.opts.sens).toBe(1);
    expect(s.opts.binds.nitro).toBe('ShiftLeft');
    expectNoErrors(errors);
  });

  test('la dificultad cambia parámetros medibles', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    const pick = async label => { const b = page.locator('#dc-menu [role=radio][data-d]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Extremo');
    await expect(page.locator('#dc-menu [data-dtab]')).toContainText('Daño recibido ×1.5');
    expect(await T(page, 'return T.difficulty')).toMatchObject({ name: 'extremo', dmgTaken: 1.5, bossHp: 900, repair: 0 });
    await pick('Fácil');
    const d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'facil', dmgTaken: 0.65, bossHp: 450 });
    await startDbg(page, isMobile);
    expect(await T(page, 'return T.timeLeft')).toBeGreaterThan(99);
    expect(await T(page, 'return T.rivals.find(r => r.id === "tanque").maxHp')).toBe(160);
    await D(page, 'hurt(20)');
    expect(await T(page, 'return T.hp')).toBeCloseTo(100 - 13, 1);
    expectNoErrors(errors);
  });

  test('la calidad gráfica cambia costos reales', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'low'));
    const lo = await T(page, 'return T.quality');
    expect(lo).toMatchObject({ q: 'low', pixelRatio: 1, shadows: false, particles: 90 });
    await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.set('quality', 'high'));
    const hi = await T(page, 'return T.quality');
    expect(hi).toMatchObject({ q: 'high', shadows: true, particles: 420 });
    expect(hi.decorCount).toBeGreaterThan(lo.decorCount);
    expect(hi.fogFar).toBeGreaterThan(lo.fogFar);
    expect(hi.far).toBeGreaterThan(lo.far);
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y horizontal; controles táctiles', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startDbg(page, true);
    await D(page, 'give("iman")');
    const check = async () => {
      await wait(page, 400);
      const r = await page.evaluate(() => {
        const sel = ['#dc-status', '#dc-mis', '#dc-side', '.mla-bar', '.k3-joy', '.k3-btn[aria-label="gas"]', '.k3-btn[aria-label="brake"]', '.k3-btn[aria-label="nitro"]', '.k3-btn[aria-label="power"]'];
        const boxes = sel.map(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height && getComputedStyle(e).display !== 'none' ? { s, x: b.left, y: b.top, r: b.right, b: b.bottom } : null; }).filter(Boolean);
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
    await page.setViewportSize({ width: 412, height: 915 });
    await check();
    await page.setViewportSize({ width: 915, height: 412 });
    await check();
    // botones táctiles: PODER usa el imán y NITRO activa el turbo
    await page.locator('.k3-btn[aria-label="power"]').tap(); await sim(page, 0.1);
    expect(await T(page, 'return T.player.magnet')).toBe(true);
    const n = await center(page, '.k3-btn[aria-label="nitro"]');
    await touch(page, 'touchStart', [n]); await sim(page, 0.3);
    expect(await T(page, 'return T.player.nitro')).toBeLessThan(100);
    await touch(page, 'touchEnd', []);
    await page.setViewportSize({ width: 412, height: 915 });
    expectNoErrors(errors);
  });
});
