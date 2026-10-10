// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait } from './helpers.js';

// Portales Imposibles (Three.js 0.186). En headless el WebGL es SwiftShader (CPU) y corre a pocos FPS: las esperas son
// por condición (expect.poll) y los tramos largos usan simulate() determinista (?debug) mientras las teclas/toques
// reales siguen apretados: la entrada es real y el tiempo de juego es fijo. Para no saturar la CPU, casi todas las
// pruebas fijan la calidad «baja» (sin render targets); la prueba de calidad mide las tres.

const FILE = 'portales_imposibles.html';
const DBG = 'portales_imposibles.html?debug';
const T = (page, body) => page.evaluate(`(()=>{ const T = window.__portales_imposibles; ${body} })()`);
const D = (page, call) => page.evaluate(`window.__portales_imposibles.debug.${call}`);
const POLL = { timeout: 40_000 };
const PI = Math.PI;

async function lowQuality(page) { await page.addInitScript(() => { try { if (!sessionStorage.getItem('pi-q')) { sessionStorage.setItem('pi-q', '1'); localStorage.setItem('ml:settings', JSON.stringify({ quality: 'low' })); } } catch (e) {} }); }
async function ready(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__portales_imposibles?.state === 'menu' && /** @type {any} */ (window).__portales_imposibles.perf.frames > 1, null, { timeout: 45_000 });
}
/** Arranca desde el menú con entrada real (Enter en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#pi-menu [data-go]').tap();
  else { await page.locator('#pi-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
}
async function sim(page, sec) { await D(page, `simulate(${sec})`); }
async function hold(page, key, sec) { await page.keyboard.down(key); await sim(page, sec); await page.keyboard.up(key); }
const cdps = new WeakMap();
async function touch(page, type, x, y) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
/** Mirar hacia un punto desde el ojo del sujeto. */
async function lookAt(page, x, y, z) {
  const p = await T(page, 'return T.player');
  const ey = p.y + 0.62, dx = x - p.x, dz = z - p.z;
  await D(page, `look(${Math.atan2(-dx, -dz)}, ${Math.atan2(y - ey, Math.hypot(dx, dz))})`);
  await D(page, 'simulate(0.05)');
}
async function fireKey(page, isMobile, which) {
  if (isMobile) await page.locator(`.k3-btn[aria-label="${which === 'A' ? 'a' : 'b'}"]`).tap();
  else await page.keyboard.press(which === 'A' ? 'KeyQ' : 'KeyF');
  await sim(page, 0.3);
}
async function useKey(page, isMobile) {
  if (isMobile) await page.locator('.k3-btn[aria-label="use"]').tap(); else await page.keyboard.press('KeyE');
  await sim(page, 0.25);
}

test.describe('Portales Imposibles', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(200_000); });

  test('carga sin errores: menú con crédito, dificultad y fondo 3D', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#pi-menu h1')).toContainText('PORTALES IMPOSIBLES');
    await expect(page.locator('#pi-menu .pi-credit')).toContainText('CREADO POR');
    await expect(page.locator('#pi-menu [role=radiogroup] [role=radio]')).toHaveCount(4);
    await expect(page.locator('#pi-menu [data-tt]')).toBeDisabled();
    const s = await T(page, 'return { calls: T.perf.calls, scene: T.scene }');
    expect(s.scene).toBe('Laboratorio Azul');
    expect(s.calls).toBeGreaterThan(5);
    expect(s.calls).toBeLessThan(160);
    expectNoErrors(errors);
  });

  test('matemática de teletransporte: posición, velocidad, mirada y matriz (unitarias)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'matemática pura: alcanza con un proyecto');
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const r = await page.evaluate(() => {
      const m = /** @type {any} */ (window).__portales_imposibles.math;
      const V = (x, y, z) => ({ x, y, z });
      const near = (a, b, e = 1e-6) => Math.abs(a.x - b.x) < e && Math.abs(a.y - b.y) < e && Math.abs(a.z - b.z) < e;
      const out = {};
      // A: pared que mira a +x en (0,1,0); B: pared que mira a −z en (10,2,5)
      const A = m.makeFrame(V(0, 1, 0), V(1, 0, 0), V(0, 1, 0)), B = m.makeFrame(V(10, 2, 5), V(0, 0, -1), V(0, 1, 0));
      // un punto 0,1 m detrás de A sale 0,1 m delante de B
      out.through = near(m.xfPoint(A, B, V(-0.1, 1, 0), V(0, 0, 0)), V(10, 2, 4.9));
      // el centro va al centro; un punto 0,5 m a la «derecha» de A sale espejado a la izquierda de B
      out.center = near(m.xfPoint(A, B, V(0, 1, 0), V(0, 0, 0)), V(10, 2, 5));
      const pr = m.xfPoint(A, B, V(0, 1, -0.5), V(0, 0, 0)); // r de A = (0,0,−1)
      out.mirror = Math.abs(Math.hypot(pr.x - 10, pr.z - 5) - 0.5) < 1e-9 && Math.abs(pr.y - 2) < 1e-9;
      // velocidad que entra (−x) sale por la normal de B (−z) con la misma rapidez
      out.vel = near(m.xfDir(A, B, V(-6, 0, 0), V(0, 0, 0)), V(0, 0, -6));
      // lanzamiento: piso (normal +y, arriba −z) → pared (normal +x): cae a 12 m/s y sale horizontal a 12 m/s
      const F = m.makeFrame(V(0, 0, 0), V(0, 1, 0), V(0, 0, -1)), Wl = m.makeFrame(V(5, 3, 0), V(1, 0, 0), V(0, 1, 0));
      out.fling = near(m.xfDir(F, Wl, V(0, -12, 0), V(0, 0, 0)), V(12, 0, 0));
      // ida y vuelta = identidad; rapidez conservada para marcos al azar
      let worst = 0, worstRT = 0;
      const rnd = () => { const n = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); return n; };
      for (let i = 0; i < 200; i++) {
        const P = m.makeFrame(rnd(), rnd(), rnd()), Q = m.makeFrame(rnd(), rnd(), rnd());
        const v = rnd(), p = rnd();
        const v2 = m.xfDir(P, Q, v, V(0, 0, 0));
        worst = Math.max(worst, Math.abs(Math.hypot(v2.x, v2.y, v2.z) - Math.hypot(v.x, v.y, v.z)));
        const back = m.xfPoint(Q, P, m.xfPoint(P, Q, p, V(0, 0, 0)), V(0, 0, 0));
        worstRT = Math.max(worstRT, Math.hypot(back.x - p.x, back.y - p.y, back.z - p.z));
      }
      out.speedErr = worst; out.roundTripErr = worstRT;
      // la matriz 4×4 coincide con xfPoint
      const e = new Array(16).fill(0); m.xfMatrix(A, B, e);
      const q = V(0.3, 1.7, -0.2), qq = m.xfPoint(A, B, q, V(0, 0, 0));
      const mx = e[0] * q.x + e[4] * q.y + e[8] * q.z + e[12], my = e[1] * q.x + e[5] * q.y + e[9] * q.z + e[13], mz = e[2] * q.x + e[6] * q.y + e[10] * q.z + e[14];
      out.matrix = near(qq, V(mx, my, mz), 1e-9);
      // mirada: mirar hacia el portal A (−x, yaw π/2) → salir mirando por la normal de B (−z, yaw 0)
      const t = m.teleport(A, B, { pos: V(-0.05, 1, 0), vel: V(-5, 0, 0), yaw: PI_2(), pitch: 0 });
      out.yaw = Math.abs(t.yaw) < 1e-9 && Math.abs(t.pitch) < 1e-9;
      // mirar hacia abajo a un portal de piso → salir mirando horizontal por la pared
      const t2 = m.teleport(F, Wl, { pos: V(0, -0.1, 0), vel: V(0, -9, 0), yaw: 0, pitch: -Math.PI / 2 + 0.01 });
      out.lookFling = Math.abs(t2.pitch) < 0.02 && Math.abs(t2.vel.x - 9) < 1e-9;
      function PI_2() { return Math.PI / 2; }
      return out;
    });
    expect(r).toMatchObject({ through: true, center: true, mirror: true, vel: true, fling: true, matrix: true, yaw: true, lookFling: true });
    expect(r.speedErr).toBeLessThan(1e-9);
    expect(r.roundTripErr).toBeLessThan(1e-9);
    expectNoErrors(errors);
  });

  test('arranque con entrada real, movimiento, mirada y salto', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type))).toContain('start');
    await expect(page.locator('#pi-side')).toBeVisible();
    const p0 = await T(page, 'return T.player');
    if (isMobile) {
      const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await touch(page, 'touchStart', cx, cy); await touch(page, 'touchMove', cx, cy - 50);
      await expect.poll(() => T(page, 'return T.player.z'), POLL).toBeLessThan(p0.z - 0.8);
      await touch(page, 'touchEnd', 0, 0);
      // arrastrar el dedo fuera de los controles gira la mirada
      await page.evaluate(() => {
        const el = /** @type {any} */ (document.querySelector('canvas'));
        const r = el.getBoundingClientRect(), x = r.width / 2, y = r.height * 0.4;
        const ev = (t, cx) => el.dispatchEvent(new PointerEvent(t, { pointerId: 9, pointerType: 'touch', clientX: cx, clientY: y, bubbles: true }));
        ev('pointerdown', x); ev('pointermove', x + 60); ev('pointermove', x + 120); ev('pointerup', x + 120);
      });
      await expect.poll(async () => Math.abs((await T(page, 'return T.player.yaw')) - p0.yaw), POLL).toBeGreaterThan(0.2);
      await page.locator('.k3-btn[aria-label="jump"]').tap();
    } else {
      await page.keyboard.down('KeyW');
      await expect.poll(() => T(page, 'return T.player.z'), POLL).toBeLessThan(p0.z - 0.8);
      await page.keyboard.up('KeyW');
      await page.keyboard.down('ArrowLeft');
      await expect.poll(() => T(page, 'return T.player.yaw'), POLL).toBeGreaterThan(p0.yaw + 0.5);
      await page.keyboard.up('ArrowLeft');
      await page.keyboard.press('Space');
    }
    await expect.poll(() => T(page, 'return T.player.y'), POLL).toBeGreaterThan(p0.y + 0.2);
    expectNoErrors(errors);
  });

  test('tutorial contextual: aparece, se salta y se reactiva desde la ayuda', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect(page.locator('#pi-tip')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pi-tip')).toContainText(isMobile ? 'joystick' : 'WASD');
    await page.locator('#pi-tip [data-t="skip"]').click();
    await expect(page.locator('#pi-tip')).toBeHidden();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(true);
    await page.locator('.mla-bar button[aria-label="Pausa"]').click();
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="custom"]', { hasText: 'Cómo jugar' }).click();
    await expect(page.locator('#pi-help')).toBeVisible();
    await expect(page.locator('#pi-help')).toContainText('Lanzamiento');
    await page.locator('#pi-help [data-retut]').click();
    expect(await T(page, 'return T.save.tutorial.off')).toBe(false);
    await expect(page.locator('.mla-pause')).toBeVisible();
    expectNoErrors(errors);
  });

  test('portales con entrada real: disparo, superficie inválida y cruce que conserva la orientación', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, "goto(1,'1-1')"); await D(page, 'teleport(0,0.9,-3,0,0)'); await sim(page, 0.2);
    // metal: no acepta portales
    await lookAt(page, 0, 1.5, -9);
    await fireKey(page, isMobile, 'A');
    expect((await T(page, 'return T.portals')).A).toBeNull();
    // azul en el panel bajo izquierdo, naranja en el panel alto derecho
    await lookAt(page, -5.94, 1.2, -4.5);
    await fireKey(page, isMobile, 'A');
    await lookAt(page, 5.94, 5.6, -11.5);
    await fireKey(page, isMobile, 'B');
    const pr = await T(page, 'return T.portals');
    expect(pr.linked).toBe(true);
    expect(pr.A.n).toEqual([1, 0, 0]);
    expect(pr.B.n).toEqual([-1, 0, 0]);
    // la superficie del portal sigue a su anfitrión y la cruz muestra los dos
    await expect(page.locator('#pi-cross .a.on')).toHaveCount(1);
    await expect(page.locator('#pi-cross .b.on')).toHaveCount(1);
    // caminar a través del azul: aparece sobre el borde alto, mirando hacia afuera del portal naranja
    await D(page, `teleport(-4.4,0.9,${pr.A.z},${PI / 2},0)`); await sim(page, 0.1);
    if (isMobile) {
      const box = /** @type {any} */ (await page.locator('.k3-joy').boundingBox());
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await touch(page, 'touchStart', cx, cy); await touch(page, 'touchMove', cx, cy - 55);
      await sim(page, 1.2);
      await touch(page, 'touchEnd', 0, 0);
    } else await hold(page, 'KeyW', 1.2);
    await sim(page, 0.3);
    const p = await T(page, 'return T.player');
    expect(p.y).toBeGreaterThan(4.6);          // sobre el borde (piso a 4 m)
    expect(p.x).toBeLessThan(5.6);             // salió delante del portal naranja
    expect(Math.abs(p.yaw - PI / 2)).toBeLessThan(0.05); // mira por la normal de salida (−x)
    expectNoErrors(errors);
  });

  test('lanzamiento (Salto de Fe): la velocidad de caída sale por la pared y cruza el ácido', async ({ page }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    await D(page, "goto(1,'1-3')"); await sim(page, 0.2);
    expect((await D(page, "shootFrom('A', 0,5.5,-45, 0,-1,-0.4)")).ok).toBe(true);
    expect((await D(page, "shootFrom('B', -2,5.5,-43, -4,0,1.74)")).ok).toBe(true);
    const a = (await T(page, 'return T.portals')).A;
    // caer desde la altura del borde sobre el portal del foso
    await D(page, `teleport(${a.x},5.6,${a.z},0,-1.2)`);
    // ~1,35 s: cae ~11,5 m (≈1,2 s), cruza y sale disparado por la pared de entrada
    await sim(page, 1.35);
    const crossed = await T(page, 'return T.player');
    const sp = Math.hypot(crossed.vx, crossed.vy, crossed.vz);
    expect(crossed.z).toBeLessThan(-42);                   // ya salió por el portal naranja (pared en z = −41,26)
    expect(-crossed.vz).toBeGreaterThan(15);               // ≈ √(2·g·h) de unos 10 m, hacia el norte
    expect(Math.abs(crossed.vx)).toBeLessThan(0.5);
    void sp;
    await sim(page, 1.2);
    const end = await T(page, 'return { p: T.player, st: T.state }');
    expect(end.st).toBe('play');
    expect(end.p.z).toBeLessThan(-58.2);                    // aterrizó en la plataforma de salida
    expect(end.p.y).toBeGreaterThan(-5);
    expectNoErrors(errors);
  });

  test('cubos y botones: pedestal dispensa, el cubo cruza portales en la mano y el botón abre la puerta', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, "goto(1,'1-2')");
    await D(page, 'teleport(-5,4.9,-22.4,0,-0.3)'); await sim(page, 0.3);
    expect(await T(page, 'return T.prompt')).toBe('Soltar un cubo en la jaula');
    await useKey(page, isMobile); await sim(page, 1.5);
    let c = (await T(page, 'return T.puzzle.cubes')).cube12;
    expect(c.alive).toBe(true);
    expect(c.y).toBeLessThan(5);
    // azul en la jaula (a través de la rejilla), naranja afuera
    expect((await D(page, "shootFrom('A', 0,5.5,-26, -6.94,-0.5,-4.6)")).ok).toBe(true);
    expect((await D(page, "shootFrom('B', 0,5.5,-25, 1,-0.12,0)")).ok).toBe(true);
    const pr = await T(page, 'return T.portals');
    await D(page, `teleport(5.5,4.9,${pr.B.z},${-PI / 2},0)`); await sim(page, 0.1);
    await hold(page, 'KeyW', 1.0); await sim(page, 0.3);
    const inCage = await T(page, 'return T.player');
    expect(inCage.x).toBeLessThan(-3.05); // dentro de la jaula
    c = (await T(page, 'return T.puzzle.cubes')).cube12;
    await lookAt(page, c.x, c.y, c.z);
    expect(await T(page, 'return T.prompt')).toBe('Agarrar cubo');
    await useKey(page, isMobile);
    expect(await T(page, 'return T.held')).toBe('cube12');
    // volver por el azul con el cubo
    await D(page, `teleport(-5.2,4.9,${pr.A.z},${PI / 2},0)`); await sim(page, 0.3);
    await hold(page, 'KeyW', 1.2); await sim(page, 0.3);
    const out = await T(page, 'return { p: T.player, held: T.held, c: T.puzzle.cubes.cube12 }');
    expect(out.p.x).toBeGreaterThan(0);
    expect(out.held).toBe('cube12');
    expect(out.c.x).toBeLessThan(out.p.x); // el cubo va delante (hacia −x)
    // llevarlo caminando hasta el botón y soltarlo encima
    for (let i = 0; i < 30; i++) {
      const q = await T(page, 'return T.player');
      if (Math.hypot(q.x - 3, q.z + 27.6) < 1.7) break;
      await lookAt(page, 3, q.y + 0.62, -27.6);
      await hold(page, 'KeyW', 0.12);
    }
    expect(await T(page, 'return T.held')).toBe('cube12');
    await lookAt(page, 3, 4.1, -27.6); await sim(page, 0.4);
    await useKey(page, isMobile); await sim(page, 1.5);
    const z = await T(page, 'return { b: T.puzzle.buttons.b12, d: T.puzzle.doors.d12 }');
    expect(z.b).toBe(true);
    expect(z.d.open).toBeGreaterThan(0.9);
    // estado de sesión: al volver a cargar el escenario el cubo dispensado sigue ahí
    await D(page, "goto(2,'2-1')"); await D(page, "goto(1,'1-2')"); await sim(page, 0.3);
    expect((await T(page, 'return T.puzzle.cubes.cube12')).alive).toBe(true);
    expectNoErrors(errors);
  });

  test('interruptores y puertas temporizadas: abre, cuenta hacia atrás, se cierra y no aplasta', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, "goto(1,'1-3')");
    await D(page, 'teleport(6,-4.1,-63.9,0,-0.6)'); await sim(page, 0.2);
    await D(page, "knock('t13')");
    expect(await T(page, 'return T.prompt')).toContain('compuerta');
    await useKey(page, isMobile);
    let d = await T(page, 'return T.puzzle.doors.dt13');
    expect(d.timer).toBeGreaterThan(3);
    await sim(page, 1);
    d = await T(page, 'return T.puzzle.doors.dt13');
    expect(d.open).toBe(1);
    await sim(page, 5);
    expect((await T(page, 'return T.puzzle.doors.dt13')).open).toBe(0);
    // parado en el vano, la compuerta no se cierra
    await D(page, "use('p13a')"); await sim(page, 1);
    await D(page, 'teleport(-8.3,-4.1,-61.2,0,0)'); await sim(page, 6);
    expect((await T(page, 'return T.puzzle.doors.dt13')).open).toBeGreaterThan(0.5);
    expect(await T(page, 'return T.state')).toBe('play');
    expectNoErrors(errors);
  });

  test('paneles de energía: el láser cruza portales, enciende el panel y el campo de gravedad', async ({ page }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    await D(page, "goto(2,'2-1')"); await sim(page, 0.3);
    expect(await T(page, 'return T.puzzle.receptors.r21')).toBe(false);
    expect(await T(page, 'return T.puzzle.lifts.l21')).toBe(false);
    await D(page, "shootFrom('A', 0,1.5,-3, -7.94,0.1,-3)"); await D(page, "shootFrom('B', 0,1.5,-5, -4,0.1,5)");
    await sim(page, 0.3);
    expect(await T(page, 'return T.counts.beams')).toBeGreaterThanOrEqual(3);
    expect(await T(page, 'return T.puzzle.receptors.r21')).toBe(true);
    expect(await T(page, 'return T.puzzle.lifts.l21')).toBe(true);
    // el campo eleva al sujeto hasta la galería
    await D(page, 'teleport(3.75,0.9,-10,0,0)'); await sim(page, 3.5);
    expect((await T(page, 'return T.player.y'))).toBeGreaterThan(8.5);
    // sin portales, el panel se apaga
    await D(page, 'clearPortals()'); await sim(page, 0.4);
    expect(await T(page, 'return T.puzzle.receptors.r21')).toBe(false);
    expectNoErrors(errors);
  });

  test('cubo prisma + láser por el techo restauran el generador (misión principal persistente)', async ({ page }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    await D(page, "goto(2,'2-2')"); await sim(page, 0.3);
    await D(page, 'teleport(2.8,8.9,-31,0,-0.5)'); await sim(page, 0.2);
    expect((await T(page, 'return T.puzzle.switches.pg')).enabled).toBe(false);
    await D(page, "cubeTo('prism22', 0, 8.4, -29.6, 0, -1)"); await sim(page, 0.5);
    expect(await T(page, 'return T.puzzle.receptors.rga')).toBe(true);
    await D(page, "shootFrom('A', -6,9.5,-30, 0,0.5,5.34)"); await D(page, "shootFrom('B', 0,9.5,-30, 0,11.44,-5.6)");
    await sim(page, 0.3);
    expect(await T(page, 'return T.puzzle.receptors.rgb')).toBe(true);
    expect(await T(page, 'return T.prompt')).toBe('Bajar la palanca del generador');
    await page.keyboard.press('KeyE'); await sim(page, 0.5);
    const g = await T(page, 'return { g: T.puzzle.generator, d: T.puzzle.doors.d22, m: T.missions.current.find(x => x.id === "generador") }');
    expect(g.g).toBe(true);
    expect(g.m.status).toBe('done');
    await sim(page, 1);
    expect((await T(page, 'return T.puzzle.doors.d22')).open).toBeGreaterThan(0.9);
    await page.reload();
    await ready(page);
    await expect(page.locator('#pi-menu [data-go]')).toContainText('Continuar');
    const after = await page.evaluate(() => ({ save: JSON.parse(localStorage.getItem('portales_imposibles:save') || '{}').d, missions: JSON.parse(localStorage.getItem('ml:missions') || '{}').portales_imposibles }));
    expect(after.save.generator).toBe(true);
    expect(after.missions.done.generador).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('resolver una sala: secundaria «dos portales» y cristal, persistentes tras recargar', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    const cur = await T(page, 'return T.missions.current.map(m => m.id)');
    expect(cur).toEqual(expect.arrayContaining(['salas', 'generador', 'salida']));
    expect(cur).toContain('dosportales');
    // cristal del nicho
    await D(page, 'teleport(7.4,3.9,-4.5,0,0)'); await sim(page, 0.3);
    expect(await T(page, 'return T.save.crystals')).toContain('c11');
    // Primer Paso con exactamente dos portales
    await D(page, 'teleport(0,0.9,-3,0,0)'); await sim(page, 0.3);
    await lookAt(page, -5.94, 1.2, -4.5); await fireKey(page, isMobile, 'A');
    await lookAt(page, 5.94, 5.6, -11.5); await fireKey(page, isMobile, 'B');
    const pa = (await T(page, 'return T.portals')).A;
    await D(page, `teleport(-4.4,0.9,${pa.z},${PI / 2},0)`); await sim(page, 0.1);
    await hold(page, 'KeyW', 1.2);
    // caminar hasta la puerta de salida y el pasillo
    await lookAt(page, 0, 5.5, -17); await hold(page, 'KeyW', 3.0); await sim(page, 0.4);
    const st = await T(page, 'return { solved: T.save.solved, m: T.missions.current }');
    expect(st.solved['1-1']).toBe(true);
    expect(st.m.find(m => m.id === 'dosportales').status).toBe('done');
    expect(st.m.find(m => m.id === 'salas').progress).toBe(1);
    await page.reload();
    await ready(page);
    const after = await page.evaluate(() => ({ save: JSON.parse(localStorage.getItem('portales_imposibles:save') || '{}').d, missions: JSON.parse(localStorage.getItem('ml:missions') || '{}').portales_imposibles }));
    expect(after.save.solved['1-1']).toBe(true);
    expect(after.save.crystals).toContain('c11');
    expect(after.missions.done.dosportales).toBeGreaterThan(0);
    // la Contrarreloj queda habilitada
    await expect(page.locator('#pi-menu [data-tt]')).toBeEnabled();
    expectNoErrors(errors);
  });

  test('pistas por etapas (con marcas fantasma) y reinicio de sala', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, "goto(1,'1-2')"); await D(page, 'teleport(0,4.9,-23,0,0)'); await sim(page, 0.3);
    for (let i = 1; i <= 3; i++) {
      if (isMobile) await page.locator('#pi-room [data-ui="hint"]').tap(); else await page.keyboard.press('KeyH');
      await sim(page, 0.1);
      await expect(page.locator('#pi-hint')).toContainText(`PISTA ${i}/3`);
    }
    expect((await T(page, 'return T.hints'))['1-2']).toBe(3);
    await D(page, "shootFrom('A', 0,5.5,-25, 1,-0.12,0)"); await D(page, 'teleport(3,4.9,-30,1,0)'); await sim(page, 0.2);
    if (isMobile) await page.locator('#pi-room [data-ui="reset"]').tap(); else await page.keyboard.press('KeyR');
    await sim(page, 0.3);
    const r = await T(page, 'return { p: T.player, portals: T.portals }');
    expect(r.portals.A).toBeNull();
    expect(Math.abs(r.p.z - (-19.6))).toBeLessThan(0.6);
    expectNoErrors(errors);
  });

  test('torretas: aviso, disparo y contrajuego (portal bajo sus patas, empujón por la espalda)', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, "goto(1,'1-3')"); await sim(page, 0.2);
    await D(page, 'teleport(3,-4.1,-58.8,0,0)'); await sim(page, 0.4);
    let t = (await T(page, 'return T.puzzle.turrets.t13'));
    expect(t.alert).toBeGreaterThan(0);
    expect(t.down).toBe(false);
    await sim(page, 1.4);
    expect(await T(page, 'return T.hp')).toBeLessThan(await T(page, 'return T.maxHp'));
    // portal bajo sus patas: cae y queda fuera de servicio
    await D(page, 'setHP(3)'); await D(page, 'teleport(0,4.9,-41,0,0)'); await sim(page, 0.1);
    await D(page, "shootFrom('A', 0,5.5,-45, 0,-1,-0.4)");
    expect((await D(page, "shootFrom('B', 3,-1,-58, 0,-1,-1.2)")).ok).toBe(true);
    await sim(page, 1.5);
    t = (await T(page, 'return T.puzzle.turrets.t13'));
    expect(t.down).toBe(true);
    // empujón por la espalda (Antesala Prismática)
    await D(page, "goto(3,'3-1')"); await D(page, `teleport(4,0.9,-17.9,${PI},0)`); await sim(page, 0.2);
    expect(await T(page, 'return T.prompt')).toBe('Empujar torreta');
    await useKey(page, isMobile);
    expect((await T(page, 'return T.puzzle.turrets.t31')).down).toBe(true);
    expectNoErrors(errors);
  });

  test('esferas supervisoras: escaneo con aviso, pulso que borra portales, señuelo y láser que las aturde', async ({ page }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    await D(page, "goto(2,'2-1')"); await D(page, "cubeTo('cube21', -6, 8.4, -16)"); await sim(page, 0.4);
    await D(page, "shootFrom('A', 0,9.5,-3, 7.94,1,-0.5)");
    // pararse en su foco
    let saw = false;
    for (let i = 0; i < 16; i++) {
      const s = (await T(page, 'return T.puzzle.spheres.s21'));
      if (s.state === 'scan') saw = true;
      if (saw && !(await T(page, 'return T.portals')).A) break;
      await D(page, `teleport(${s.gx},0.9,${s.gz},0,0)`); await sim(page, 0.2);
    }
    expect(saw).toBe(true);
    expect((await T(page, 'return T.portals')).A).toBeNull();
    // señuelo: un cubo suelto en el foco la distrae
    await D(page, 'teleport(-7,8.9,-15.5,0,0)'); await sim(page, 3.2);
    let s = await T(page, 'return T.puzzle.spheres.s21');
    await D(page, `cubeTo('cube21', ${s.gx}, 0.4, ${s.gz})`); await sim(page, 0.3);
    expect((await T(page, 'return T.puzzle.spheres.s21')).state).toBe('bait');
    // el láser que pasa rozándola la aturde (portal de salida alto: el haz cruza bajo su recorrido)
    await D(page, "cubeTo('cube21', -6, 8.4, -16)");
    await D(page, "shootFrom('A', 0,1.5,-3, -7.94,-0.4,-3)"); await D(page, "shootFrom('B', 0,2.5,-5, -4,0.1,5)");
    await expect.poll(async () => { await sim(page, 0.4); return (await T(page, 'return T.puzzle.spheres.s21')).state; }, POLL).toBe('stun');
    expectNoErrors(errors);
  });

  test('los tres escenarios cargan y transicionan por los elevadores', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    expect(await T(page, 'return T.scene')).toBe('Laboratorio Azul');
    await D(page, "goto(1,'1-3')"); await D(page, 'teleport(0,-4.1,-75.2,0,0)');
    await sim(page, 1.0);
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Salas de Gravedad');
    await sim(page, 0.3);
    expect(await T(page, 'return T.save.scen')).toBe(2);
    await D(page, 'teleport(0,8.9,-54.6,0,0)'); await sim(page, 1.0);
    await expect.poll(() => T(page, 'return T.scene'), POLL).toBe('Núcleo Prismático');
    await sim(page, 0.3);
    const c = await T(page, 'return T.counts');
    expect(c.turrets).toBeGreaterThan(0);
    expect(c.spheres).toBeGreaterThan(0);
    expect(await T(page, 'return T.state')).toBe('play');
    expectNoErrors(errors);
  });

  test('Núcleo Fractal: intro, fase 1 (pilares con láser por panel móvil), fase 2 (cubos por el techo), fase 3 y victoria', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await D(page, 'spawnBoss()');
    expect(await T(page, 'return T.state')).toBe('cutscene');
    await expect(page.locator('#pi-title')).toContainText('NÚCLEO FRACTAL');
    // la cinemática se salta con entrada real
    if (isMobile) await page.locator('canvas').tap(); else await page.keyboard.press('Space');
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    expect((await T(page, 'return T.boss')).phase).toBe(1);
    await D(page, 'setHP(99)');
    // fase 1: láser al panel fijo del fondo y salida por el panel móvil oeste
    expect((await D(page, "shootFrom('A', 1.4,2.5,-45, 0,-0.05,-1)")).ok).toBe(true);
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { await sim(page, 0.25); ok = (await D(page, 'shootFrom("B", 0,5,-38, -7.52,-3.0,-2.6)')).ok; }
    expect(ok).toBe(true);
    await expect.poll(async () => { await sim(page, 0.5); await D(page, 'setHP(99)'); return (await T(page, 'return T.boss.nodes.filter(n => n.broken).length')); }, POLL).toBeGreaterThanOrEqual(1);
    await D(page, 'breakNodes()'); await sim(page, 3);
    let b = await T(page, 'return T.boss');
    expect(b.phase).toBe(2);
    await expect(page.locator('#pi-boss')).toContainText('Sobrecarga');
    // fase 2: pedestal de cubos, portal en el piso y en el techo móvil cuando está sobre el Núcleo
    await D(page, "use('pbd')"); await sim(page, 1.5);
    expect((await T(page, 'return T.puzzle.cubes.cubeB')).alive).toBe(true);
    expect((await D(page, "shootFrom('A', 15.9,3,-27, 0,-1,-1.2)")).ok).toBe(true);
    let placed = false;
    for (let i = 0; i < 60 && !placed; i++) { await sim(page, 0.2); await D(page, 'setHP(99)'); if (await T(page, 'return T.boss.aligned')) placed = (await D(page, "shootFrom('B', 6.4,2,-40.6, 0,1,0.001)")).ok; }
    expect(placed).toBe(true);
    const pa = (await T(page, 'return T.portals')).A;
    await D(page, `cubeTo('cubeB', ${pa.x}, 1.2, ${pa.z})`);
    await expect.poll(async () => { await sim(page, 0.25); await D(page, 'setHP(99)'); return (await T(page, 'return T.boss.hits')); }, POLL).toBe(1);
    await D(page, 'bossHit()'); await D(page, 'bossHit()'); await sim(page, 3); await D(page, 'setHP(99)');
    b = await T(page, 'return T.boss');
    expect(b.phase).toBe(3);
    // fase 3: el ácido sube y los pulsos borran los portales
    await D(page, "shootFrom('A', 1.4,2.5,-45, 0,-0.05,-1)");
    await sim(page, 7); await D(page, 'setHP(99)');
    b = await T(page, 'return T.boss');
    expect(b.acidY).toBeGreaterThan(-3);
    expect((await T(page, 'return T.portals')).A).toBeNull();
    // cruzar el portal de salida
    await D(page, `teleport(-5.1,8.9,-53.5,${PI},0)`); await sim(page, 0.1);
    await hold(page, 'KeyW', 1.2);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('victory');
    await expect(page.locator('#pi-end')).toContainText('¡LIBRE!');
    const sv = await T(page, 'return T.save');
    expect(sv.bossDone).toBe(true);
    expect(sv.goldGun).toBe(true);
    const ms = await page.evaluate(() => JSON.parse(localStorage.getItem('ml:missions') || '{}').portales_imposibles);
    expect(ms.done.salida).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('derrota: caer restablece la sala; sin respaldos aparece la derrota y se reintenta', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    const lives = await T(page, 'return T.lives');
    await D(page, "goto(1,'1-3')"); await D(page, 'teleport(0,-4,-53,0,0)'); await sim(page, 0.3);
    expect(await T(page, 'return T.state')).toBe('dead');
    await sim(page, 1.6);
    const r = await T(page, 'return { st: T.state, lives: T.lives, p: T.player, room: T.room }');
    expect(r.st).toBe('play');
    expect(r.lives).toBe(lives - 1);
    expect(r.p.z).toBeGreaterThan(-41); // de vuelta al inicio de la sala
    await D(page, 'setLives(1)'); await D(page, 'teleport(0,-4,-53,0,0)'); await sim(page, 2);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('defeat');
    await expect(page.locator('#pi-end')).toContainText('DERROTA');
    if (isMobile) await page.locator('#pi-end [data-retry]').tap(); else await page.locator('#pi-end [data-retry]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    expect(await T(page, 'return T.lives')).toBe(lives);
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanuda y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(0.2);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, s: T.puzzle.spheres }');
    await wait(page, 1000);
    const b = await T(page, 'return { t: T.simTime, r: T.runTime, p: T.player, s: T.puzzle.spheres }');
    expect(b).toEqual(a);
    expect(await T(page, 'return T.paused')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => T(page, 'return T.runTime'), POLL).toBeGreaterThan(b.r);
    await page.keyboard.down('KeyW'); await wait(page, 400); await page.keyboard.up('KeyW');
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    const r = await T(page, 'return { r: T.runTime, hp: T.hp, max: T.maxHp, p: T.player, score: T.score, portals: T.portals }');
    expect(r.r).toBeLessThan(1.5);
    expect(r.hp).toBe(r.max);
    expect(r.score).toBe(0);
    expect(Math.abs(r.p.z - 2.6)).toBeLessThan(1);
    expect(r.portals.A).toBeNull();
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('pi-once')) { sessionStorage.setItem('pi-once', '1'); localStorage.setItem('portales_imposibles:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#pi-menu [data-go]')).toContainText('Empezar');
    expect(await page.evaluate(() => localStorage.getItem('portales_imposibles:save:corrupto'))).toBe('{esto no es json');
    await page.evaluate(() => localStorage.setItem('portales_imposibles:save', JSON.stringify({ v: 1, d: { scen: 9, room: 'x', crystals: 'abc', solved: [1, 2], best: { '1-1': 'rápido' }, opts: { sens: 99, fov: 3, binds: { jump: 3 } }, started: true, generator: 'sí' } })));
    await page.reload();
    await ready(page);
    const s = await T(page, 'return T.save');
    expect(s.scen).toBe(1);
    expect(s.room).toBe('1-1');
    expect(s.crystals).toEqual([]);
    expect(s.solved).toEqual({});
    expect(s.best).toEqual({});
    expect(s.generator).toBe(false);
    expect(s.opts.sens).toBe(1);
    expect(s.opts.fov).toBe(72);
    expect(s.opts.binds.jump).toBe('Space');
    // y se puede jugar
    await start(page, false);
    expectNoErrors(errors);
  });

  test('la dificultad cambia parámetros medibles', async ({ page, isMobile }) => {
    await lowQuality(page);
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const pick = async label => { const b = page.locator('#pi-menu [role=radio]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Difícil');
    await expect(page.locator('#pi-menu [data-dtab]')).toContainText('Respaldos 4');
    let d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'dificil', lives: 4, hp: 3, turretAim: 0.7 });
    await pick('Fácil');
    d = await T(page, 'return T.difficulty');
    expect(d).toMatchObject({ name: 'facil', lives: 9, hp: 4 });
    expect(d.doorMul).toBeGreaterThan(1.2);
    await start(page, isMobile);
    expect(await T(page, 'return [T.hp, T.lives]')).toEqual([4, 9]);
    expectNoErrors(errors);
  });

  test('la calidad gráfica cambia costos reales (render targets de los portales)', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    await D(page, "goto(1,'1-1')"); await D(page, 'teleport(0,0.9,-3,0,0)');
    await D(page, "shootFrom('A', 0,1.47,-3, -1,-0.1,-0.4)"); await D(page, "shootFrom('B', 0,1.47,-3, 5.94,3.8,-8.5)");
    await D(page, `teleport(-2,0.9,-5.3,${PI / 2},0)`); await sim(page, 0.1);
    const measure = async q => {
      await page.evaluate(v => /** @type {any} */ (window).MLArcade.settings.set('quality', v), q);
      await sim(page, 0.05);
      return T(page, 'return { ...T.quality, calls: T.perf.calls, rt: T.perf.rtPasses }');
    };
    const lo = await measure('low'), mid = await measure('medium'), hi = await measure('high');
    expect(lo).toMatchObject({ q: 'low', pixelRatio: 1, shadows: false, portalRT: 0, rt: 0 });
    expect(mid).toMatchObject({ q: 'medium', portalRT: 0.5 });
    expect(mid.rt).toBeGreaterThanOrEqual(1);
    expect(hi).toMatchObject({ q: 'high', shadows: true, portalRT: 0.85, rtHalfFloat: true });
    expect(mid.calls).toBeGreaterThan(lo.calls);
    expect(hi.fogFar).toBeGreaterThan(lo.fogFar);
    expect(hi.lights).toBeGreaterThan(lo.lights);
    expectNoErrors(errors);
  });

  test('contrarreloj: elegir una sala resuelta, terminarla y guardar el tiempo', async ({ page, isMobile }) => {
    await lowQuality(page);
    await page.addInitScript(() => { if (!sessionStorage.getItem('pi-tt')) { sessionStorage.setItem('pi-tt', '1'); localStorage.setItem('portales_imposibles:save', JSON.stringify({ v: 1, d: { started: true, solved: { '1-1': true }, best: { '1-1': 99 } } })); } });
    const { errors } = await openGame(page, DBG);
    await ready(page);
    if (isMobile) await page.locator('#pi-menu [data-tt]').tap(); else await page.locator('#pi-menu [data-tt]').click();
    await expect(page.locator('#pi-tt')).toBeVisible();
    await expect(page.locator('#pi-tt [data-room="1-2"]')).toBeDisabled();
    if (isMobile) await page.locator('#pi-tt [data-room="1-1"]').tap(); else await page.locator('#pi-tt [data-room="1-1"]').click();
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('play');
    expect(await T(page, 'return T.mode')).toBe('tt');
    expect((await T(page, 'return T.puzzle.doors.d11')).forced).toBe(false);
    await D(page, "shootFrom('A', 0,1.47,-3, -1,-0.1,-0.4)"); await D(page, "shootFrom('B', 0,1.47,-3, 5.94,3.8,-8.5)");
    const pa = (await T(page, 'return T.portals')).A;
    await D(page, `teleport(-4.4,0.9,${pa.z},${PI / 2},0)`); await sim(page, 0.1);
    await hold(page, 'KeyW', 1.2);
    await lookAt(page, 0, 5.5, -17); await hold(page, 'KeyW', 3.0); await sim(page, 0.4);
    await expect.poll(() => T(page, 'return T.state'), POLL).toBe('ttresult');
    await expect(page.locator('#pi-end')).toContainText('CONTRARRELOJ');
    const best = (await T(page, 'return T.save.best'))['1-1'];
    expect(best).toBeLessThan(99);
    expectNoErrors(errors);
  });

  test('celular: HUD sin superposiciones ni scroll en vertical y horizontal; tocar dispara portales', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo celular');
    await lowQuality(page);
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, true);
    await expect(page.locator('#pi-tip')).toBeVisible({ timeout: 20_000 });
    const check = async () => {
      const r = await page.evaluate(() => {
        const sel = ['#pi-status', '#pi-room', '#pi-tip', '#pi-obj', '#pi-prompt', '.mlm-hud', '.mla-bar', '.k3-joy', '.k3-btn[aria-label="a"]', '.k3-btn[aria-label="b"]', '.k3-btn[aria-label="use"]', '.k3-btn[aria-label="jump"]'];
        const boxes = sel.map(s => { const e = document.querySelector(s); if (!e || /** @type {any} */ (e).hidden) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? { s, x: b.left, y: b.top, r: b.right, b: b.bottom } : null; }).filter(Boolean);
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
    // tocar la pantalla dispara el portal que falta hacia el punto tocado
    await D(page, "goto(1,'1-1')"); await D(page, 'teleport(0,0.9,-3,0,0)'); await sim(page, 0.1);
    await lookAt(page, -5.94, 1.2, -4.5); await sim(page, 0.1);
    const vp = /** @type {any} */ (page.viewportSize());
    await page.touchscreen.tap(vp.width / 2, vp.height / 2);
    await expect.poll(async () => { await sim(page, 0.05); return (await T(page, 'return T.portals')).A !== null; }, POLL).toBe(true);
    await page.setViewportSize({ width: 412, height: 915 });
    expectNoErrors(errors);
  });
});
