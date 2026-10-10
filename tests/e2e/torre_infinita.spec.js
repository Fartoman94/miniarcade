// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

const FILE = 'torre_infinita.html';
const T = page => page.evaluate(() => {
  const t = /** @type {any} */ (window).__torre;
  return { state: t.state, score: t.score, rows: t.rows, curX: t.curX, paused: t.paused, best: t.best };
});

/** Entrada real según el proyecto: toque en móvil, Espacio en PC. */
async function press(page, hasTouch) {
  if (hasTouch) await page.touchscreen.tap(200, 420);
  else await page.keyboard.press('Space');
}

/** Espera a que el bloque pase cerca del centro de la torre y lo suelta (siempre apoya). */
async function dropNearCenter(page, hasTouch) {
  await page.waitForFunction(() => {
    const t = /** @type {any} */ (window).__torre;
    return t.state === 'playing' && Math.abs(t.curX) < 30;
  }, null, { timeout: 8000, polling: 'raf' });
  await press(page, hasTouch);
}

async function start(page, hasTouch) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre) && !!(/** @type {any} */ (window).MLArcade));
  await press(page, hasTouch);
  await expect.poll(async () => (await T(page)).state).toBe('playing');
}

/* En esta máquina hay joysticks reales conectados (Xbox 360) que el SDK traduce a teclas sintéticas
   y que soltaban bloques solos durante las pruebas: se ocultan los gamepads en todas las pruebas del juego. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); } catch (e) {} });
});

test.describe('Torre Infinita', () => {
  test('carga sin errores y la demo del menú corre', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#menu .blink')).toHaveText(/TOCÁ PARA EMPEZAR/);
    const a = await T(page);
    expect(a.state).toBe('menu');
    await wait(page, 600);
    const b = await T(page);
    expect(b.curX).not.toBe(a.curX); // el bloque de la demo se mueve
    await expect(page.locator('.mla-bar.bl')).toBeVisible();
    expectNoErrors(errors);
  });

  test('arranca con entrada real, apila bloques y avanza el puntaje', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    const s0 = await T(page);
    expect(s0.rows).toBe(1);
    expect(s0.score).toBe(0);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    expect((await T(page)).score).toBeGreaterThan(0);
    await expect(page.locator('#score')).not.toHaveText('0');
    expect((await sdk(page)).telemetry).toContain('start');
    expectNoErrors(errors);
  });

  test('mantener Espacio apretado (autorepetición) no suelta más bloques', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, false);
    await page.evaluate(() => {
      for (let i = 0; i < 8; i++) dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }));
    });
    const s = await T(page);
    expect(s.rows).toBe(1);
    expect(s.state).toBe('playing');
    expectNoErrors(errors);
  });

  test('Esc pausa y congela la simulación; reanudar sigue', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await T(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await T(page);
    expect(b).toEqual(a);
    // la entrada al juego está bloqueada durante la pausa (Espacio sobre el foco del menú = Reanudar,
    // por eso se despacha sobre el body, como si el foco estuviera en el juego)
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })));
    expect((await T(page)).rows).toBe(a.rows);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await wait(page, 300);
    const c = await T(page);
    expect(c.paused).toBe(false);
    expect(c.curX).not.toBe(a.curX);
    // sin salto de dt: en 300 ms el bloque no puede haber recorrido más de lo que da su velocidad máxima
    expect(Math.abs(c.curX - a.curX)).toBeLessThan(page.viewportSize().width * 2);
    expectNoErrors(errors);
  });

  test('Reiniciar desde el menú de pausa resetea la partida', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const s = await T(page);
    expect(s).toMatchObject({ state: 'playing', rows: 1, score: 0, paused: false });
    await wait(page, 300);
    expect((await T(page)).curX).not.toBe(s.curX);
    expectNoErrors(errors);
  });

  test('fin de partida, récord guardado y persistente tras recargar', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start(page, hasTouch);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    const score = (await T(page)).score;
    // soltar apenas aparece el siguiente bloque (todavía fuera de la torre) = fallo total
    await press(page, hasTouch);
    await expect.poll(async () => (await T(page)).state).toBe('over');
    await expect(page.locator('#over')).toBeVisible();
    await expect(page.locator('#overScore')).toHaveText(String(score));
    await expect(page.locator('#recordBadge')).toBeVisible();
    const stored = await page.evaluate(() => ({
      legacy: localStorage.getItem('torre_best'),
      ml: JSON.parse(localStorage.getItem('ml:scores') || '{}').torre_infinita,
    }));
    expect(Number(stored.legacy)).toBe(score);
    expect(stored.ml).toBe(score);
    expect((await sdk(page)).telemetry).toContain('end');

    // otra vez desde la pantalla final
    await wait(page, 700);
    await press(page, hasTouch);
    await expect.poll(async () => (await T(page)).state).toBe('playing');

    await page.reload();
    await expect(page.locator('#menuBest')).toHaveText(`TU RÉCORD · ${score}`);
    expect((await T(page)).best).toBe(score);
    expectNoErrors(errors);
  });

  test('el récord viejo (torre_best) se migra', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('torre_best', '17'); sessionStorage.setItem('seeded', '1'); } });
    const { errors } = await openGame(page, FILE);
    await expect(page.locator('#menuBest')).toHaveText('TU RÉCORD · 17');
    expect(await page.evaluate(() => /** @type {any} */ (window).MLArcade.scores.best())).toBe(17);
    expectNoErrors(errors);
  });

  test('viewport de celular: canvas a pantalla completa, sin scroll y sin choques con el HUD', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await page.setViewportSize({ width: 390, height: 780 });
    await start(page, hasTouch);
    await wait(page, 200);
    const m = await page.evaluate(() => {
      const c = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
      const r = el => el.getBoundingClientRect();
      const ov = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const bar = r(document.querySelector('.mla-bar'));
      const hudBoxes = ['score', 'best'].map(id => r(document.getElementById(id)));
      return {
        cssW: c.clientWidth, cssH: c.clientHeight, bw: c.width, iw: innerWidth, ih: innerHeight,
        dpr: Math.min(devicePixelRatio, 2),
        scrollW: document.documentElement.scrollWidth,
        barOverHud: hudBoxes.some(h => ov(bar, h)),
        barOverMark: ov(bar, r(document.querySelector('.watermark'))),
      };
    });
    expect(m.cssW).toBe(m.iw);
    expect(m.cssH).toBe(m.ih);
    expect(m.bw).toBe(Math.round(m.iw * m.dpr));
    expect(m.scrollW).toBeLessThanOrEqual(m.iw);
    expect(m.barOverHud).toBe(false);
    expect(m.barOverMark).toBe(false);
    await dropNearCenter(page, hasTouch);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    expectNoErrors(errors);
  });

  test('táctil: un toque arranca y suelta bloques', async ({ page, hasTouch }) => {
    test.skip(!hasTouch, 'solo en el proyecto móvil');
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre));
    await page.touchscreen.tap(150, 500);
    await expect.poll(async () => (await T(page)).state).toBe('playing');
    await dropNearCenter(page, true);
    await expect.poll(async () => (await T(page)).rows).toBe(2);
    // tocar la barra del arcade no suelta bloques
    const rows = (await T(page)).rows;
    const mute = page.locator('.mla-bar button[aria-label="Sonido"]');
    const box = await mute.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect((await T(page)).rows).toBe(rows);
    expect(await page.evaluate(() => /** @type {any} */ (window).MLArcade.settings.get('muted'))).toBe(true);
    expectNoErrors(errors);
  });
});

/* ======================= MiniArcade 3.0 ======================= */

/** Arranque con entrada real, reintentando si con la máquina muy cargada el primer toque no llegó. */
async function start3(page, hasTouch) {
  await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre) && !!(/** @type {any} */ (window).MLArcade));
  await expect(async () => {
    if ((await T(page)).state !== 'playing') await press(page, hasTouch);
    await expect.poll(async () => (await T(page)).state, { timeout: 4000 }).toBe('playing');
  }).toPass({ timeout: 40_000 });
}


/** Algoritmo de corte ORIGINAL, copiado literal de la versión anterior a 3.0 (dropBlock).
 *  Sirve de referencia: el juego tiene que dar exactamente lo mismo. */
function origCut(curCx, curW, topCx, topW, BASE_W) {
  const PERF = Math.max(8, curW * .045);
  const diff = curCx - topCx;
  if (Math.abs(diff) <= PERF) return { kind: 'perfect', cx: topCx, w: Math.min(curW + 12, BASE_W), pieceW: 0, pieceX: null };
  const l = Math.max(curCx - curW / 2, topCx - topW / 2);
  const r = Math.min(curCx + curW / 2, topCx + topW / 2);
  const ow = r - l;
  if (ow <= 4) return { kind: 'miss', cx: null, w: 0, pieceW: curW, pieceX: curCx };
  const curL = curCx - curW / 2, curR = curCx + curW / 2;
  let pieceW = 0, pieceX = null;
  if (l - curL > .5) { pieceW = l - curL; pieceX = curL + pieceW / 2; }
  else if (curR - r > .5) { pieceW = curR - r; pieceX = r + pieceW / 2; }
  return { kind: 'cut', cx: (l + r) / 2, w: ow, pieceW, pieceX };
}
/** Misma referencia con la ventana perfecta escalada (dificultades ≠ Normal): sólo cambia el umbral del perfecto,
 *  el corte es el mismo código de arriba. */
function refCut(curCx, curW, topCx, topW, BASE_W, perfK) {
  if (perfK === 1) return origCut(curCx, curW, topCx, topW, BASE_W);
  if (Math.abs(curCx - topCx) <= Math.max(8, curW * .045) * perfK) return { kind: 'perfect', cx: topCx, w: Math.min(curW + 12, BASE_W), pieceW: 0, pieceX: null };
  // fuera de la ventana: misma rama de corte del original, con una ventana nula
  return origCutNoPerfect(curCx, curW, topCx, topW);
}
function origCutNoPerfect(curCx, curW, topCx, topW) {
  const l = Math.max(curCx - curW / 2, topCx - topW / 2);
  const r = Math.min(curCx + curW / 2, topCx + topW / 2);
  const ow = r - l;
  if (ow <= 4) return { kind: 'miss', cx: null, w: 0, pieceW: curW, pieceX: curCx };
  const curL = curCx - curW / 2, curR = curCx + curW / 2;
  let pieceW = 0, pieceX = null;
  if (l - curL > .5) { pieceW = l - curL; pieceX = curL + pieceW / 2; }
  else if (curR - r > .5) { pieceW = curR - r; pieceX = r + pieceW / 2; }
  return { kind: 'cut', cx: (l + r) / 2, w: ow, pieceW, pieceX };
}

/* Calendario de eventos esperado (independiente del juego) */
const isStormLast = r => r >= 22 && (r - 22) % 28 === 0;
const isGiant = r => r >= 30 && (r - 30) % 28 === 0;
const stabPh = r => (r >= 37 && (r - 37) % 28 < 3) ? (r - 37) % 28 + 1 : 0;

/** Rehace la partida bloque por bloque con la referencia y compara pila, combo y puntaje exactos. */
function verifyDrops(drops) {
  let score = 0, combo = 0, stabFail = false;
  for (const d of drops) {
    const ref = refCut(d.curCx, d.curW, d.topCx, d.topW, d.baseW, d.perfK);
    expect(d.kind, `fila ${d.row}`).toBe(ref.kind);
    expect(d.cx, `cx fila ${d.row}`).toBe(ref.cx);
    expect(d.w, `w fila ${d.row}`).toBe(ref.w);
    expect(d.pieceW, `pieza fila ${d.row}`).toBe(ref.pieceW);
    expect(d.comboBefore).toBe(combo);
    if (ref.kind === 'miss') { expect(d.score).toBe(score); break; }
    const perfect = ref.kind === 'perfect';
    if (perfect) combo++; else if (d.sp !== 'escudo') combo = 0;
    expect(d.combo, `combo fila ${d.row}`).toBe(combo);
    const gained = (perfect ? 1 + combo : 1) * (d.sp === 'oro' ? 2 : 1);
    expect(d.gained, `puntos fila ${d.row}`).toBe(gained);
    let bonus = 0;
    if (isGiant(d.row)) { expect(d.sp).toBe('gigante'); bonus += perfect ? 10 : 5; }
    if (isStormLast(d.row)) bonus += 5;
    const ph = stabPh(d.row);
    if (ph) { if (ph === 1) stabFail = false; if (!(perfect || ref.w >= d.curW * .75)) stabFail = true; if (ph === 3 && !stabFail) bonus += 10; }
    expect(d.bonus, `bono fila ${d.row}`).toBe(bonus);
    score += gained + bonus;
    expect(d.score, `puntaje fila ${d.row}`).toBe(score);
  }
  return score;
}

const DBG = FILE + '?debug=1';
const X = page => page.evaluate(() => {
  const t = /** @type {any} */ (window).__torre;
  return { state: t.state, rows: t.rows, score: t.score, combo: t.combo, topX: t.topX, topW: t.topW, curW: t.curW, curRow: t.curRow,
    curSpecial: t.curSpecial, storm: t.storm, stabPhase: t.stabPhase, stabFail: t.stabFail, events: t.events, banner: t.banner,
    speed: t.speed, baseSpeed: t.baseSpeed, perfWindow: t.perfWindow, difficulty: t.difficulty, quality: t.quality, dpr: t.dpr,
    caps: t.caps, stats: t.stats };
});
/** Suelta bloques con la ayuda de depuración (misma ruta de código que un toque) hasta tener `rows` filas.
 *  `dx` puede ser número o función (row, topW) => desplazamiento. */
async function stackTo(page, rows, dx = 0) {
  await page.evaluate(([rows, dxs]) => {
    const t = /** @type {any} */ (window).__torre, d = /** @type {any} */ (window).__torreDebug;
    const f = dxs ? new Function('row', 'w', 'return ' + dxs) : () => 0;
    let g = 0;
    while (t.rows < rows && t.state === 'playing' && g++ < 500) d.dropAt(f(t.curRow, t.topW));
  }, [rows, typeof dx === 'string' ? dx : (dx ? String(dx) : '')]);
}
const missions = page => page.evaluate(() => /** @type {any} */ (window).MLMissions.state());

test.describe('Torre Infinita 3.0', () => {
  // headless con la máquina cargada puede frenar timers/rAF: margen amplio (los asserts usan expect.poll)
  test.describe.configure({ timeout: 150_000 });
  test('el algoritmo de corte da resultados idénticos al original (grilla + 3000 casos aleatorios)', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre));
    // casos fijos documentados (antes = después)
    const fixed = [
      [0, 300, 0, 300, 300], [13.4, 300, 0, 300, 300], [13.6, 300, 0, 300, 300], [-40, 300, 0, 300, 300],
      [120, 300, 0, 300, 300], [297, 300, 0, 300, 300], [296.5, 300, 0, 300, 300], [-310, 300, 0, 300, 300],
      [5, 40, 0, 40, 400], [9, 40, 2, 40, 400], [37, 40, 0, 40, 400], [0.3, 500, 0, 400, 400], [60, 500, 0, 400, 400],
      [-7.99, 120, 0, 120, 220], [8.01, 120, 0, 120, 220], [100.25, 222.5, 98.75, 210, 400],
    ];
    let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cases = [...fixed];
    for (let i = 0; i < 3000; i++) {
      const baseW = 180 + rnd() * 220, topW = 5 + rnd() * baseW, curW = rnd() < .15 ? topW * (1 + rnd() * .6) : topW;
      const topCx = (rnd() - .5) * 200, curCx = topCx + (rnd() - .5) * (curW + topW) * (rnd() < .3 ? .05 : 1.2);
      cases.push([curCx, curW, topCx, topW, baseW]);
    }
    const got = await page.evaluate(cs => cs.map(c => {
      const r = /** @type {any} */ (window).__torre.cut(c[0], c[1], c[2], c[3], c[4], 1);
      return { kind: r.kind, cx: r.cx, w: r.w, pieceW: r.piece ? r.piece.w : 0, pieceX: r.piece ? r.piece.x : null };
    }), cases);
    const kinds = { perfect: 0, cut: 0, miss: 0 };
    cases.forEach((c, i) => { expect(got[i], JSON.stringify(c)).toEqual(origCut(...c)); kinds[got[i].kind]++; });
    // la muestra cubre los tres resultados
    expect(kinds.perfect).toBeGreaterThan(50); expect(kinds.cut).toBeGreaterThan(500); expect(kinds.miss).toBeGreaterThan(50);
    expectNoErrors(errors);
  });

  test('juego real: cada pila y cada puntaje coinciden con la referencia', async ({ page, hasTouch }) => {
    test.setTimeout(150_000); // con la máquina cargada, el headless puede frenar el rAF varios segundos
    const { errors } = await openGame(page, FILE);
    await start3(page, hasTouch);
    // tres soltadas cerca del centro y tres con corte (cuando el bloque está a 25-60 px del centro de la torre)
    for (let i = 0; i < 6; i++) {
      const lo = i % 2 ? 25 : 0, hi = i % 2 ? 60 : 20;
      await page.waitForFunction(([lo, hi]) => {
        const t = /** @type {any} */ (window).__torre; const d = Math.abs(t.curX - t.topX);
        return t.state === 'playing' && d >= lo && d <= hi;
      }, [lo, hi], { timeout: 20000, polling: 'raf' });
      await press(page, hasTouch);
      await expect.poll(async () => (await X(page)).rows, { timeout: 10000 }).toBe(i + 2);
    }
    const drops = await page.evaluate(() => /** @type {any} */ (window).__torre.drops);
    expect(drops).toHaveLength(6);
    const score = verifyDrops(drops);
    const s = await X(page);
    expect(s.score).toBe(score);
    await expect(page.locator('#score')).toHaveText(String(score));
    expect(s.topW).toBe(drops[5].w);
    expectNoErrors(errors);
  });

  test('partida larga con tormenta, piezas especiales, bloque gigante y desafío: pilas y puntajes exactos', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    // mezcla de perfectos y cortes chicos (siempre ≥ 75 % para que el desafío se gane)
    await stackTo(page, 41, '(row%4===1? w*0.08 : row%4===3? -w*0.05 : 0)');
    const drops = await page.evaluate(() => /** @type {any} */ (window).__torre.drops);
    expect(drops).toHaveLength(40);
    const score = verifyDrops(drops);
    const s = await X(page);
    expect(s.score).toBe(score);
    expect(s.events).toMatchObject({ storms: 1, giants: 1, stab: 1, stabFail: 0 });
    expect(s.events.specials).toBeGreaterThanOrEqual(6);
    expect(drops.filter(d => d.kind === 'cut').length).toBeGreaterThan(5);
    expectNoErrors(errors);
  });

  test('misiones: principal y secundaria cumplidas, persisten tras recargar', async ({ page, hasTouch }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('m1')) { localStorage.removeItem('ml:missions'); sessionStorage.setItem('m1', '1'); } });
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    const m0 = await missions(page);
    expect(m0.running).toBe(true);
    expect(m0.current.map(m => m.id)).toEqual(['p_altura', 's_perfectos', 's_combo']);
    await expect(page.locator('.mlm-hud.br')).toBeVisible();
    await stackTo(page, 21);
    const m1 = await missions(page);
    expect(m1.current.every(m => m.status === 'done')).toBe(true);
    await page.reload();
    await page.waitForFunction(() => !!(/** @type {any} */ (window).MLMissions));
    const done = (await missions(page)).achievements.done;
    expect(done.p_altura).toBe(1);
    expect(done.s_perfectos).toBe(1);
    expect(done.s_combo).toBe(1);
    expectNoErrors(errors);
  });

  test('misiones: «Sin cortes grandes» falla con un corte de más de la mitad; fin de partida cierra la ronda', async ({ page, hasTouch }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('m2')) { localStorage.setItem('ml:missions', JSON.stringify({ torre_infinita: { done: {}, runs: 3 } })); sessionStorage.setItem('m2', '1'); } });
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    const ids = (await missions(page)).current.map(m => m.id);
    expect(ids).toContain('s_sin_cortes');
    await stackTo(page, 4);
    await page.evaluate(() => { const t = /** @type {any} */ (window).__torre; /** @type {any} */ (window).__torreDebug.dropAt(t.topW * .6); });
    const m = (await missions(page)).current.find(x => x.id === 's_sin_cortes');
    expect(m.status).toBe('failed');
    // fallo total → runEnd: las misiones abiertas quedan cerradas y se listan en la pantalla final
    await page.evaluate(() => { /** @type {any} */ (window).__torreDebug.dropAt(5000); });
    await expect.poll(async () => (await missions(page)).running, { timeout: 20_000 }).toBe(false);
    await expect(page.locator('#overMissions')).toContainText('Sin cortes grandes', { timeout: 20_000 });
    expectNoErrors(errors);
  });

  test('reiniciar desde la pausa cierra la ronda de misiones y abre otra', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, FILE);
    await start3(page, hasTouch);
    const runs0 = (await missions(page)).achievements.runs;
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const m = await missions(page);
    expect(m.running).toBe(true);
    expect(m.achievements.runs).toBe(runs0 + 1);
    expectNoErrors(errors);
  });

  test('dificultad: selector con teclado y toque, persiste y cambia velocidad y ventana perfecta', async ({ page, hasTouch }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('d1')) { localStorage.removeItem('ml:difficulty'); sessionStorage.setItem('d1', '1'); } });
    const { errors } = await openGame(page, FILE);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre));
    const normal = page.locator('#diffBox [data-d="normal"]');
    await expect(normal).toHaveAttribute('aria-checked', 'true');
    // Normal = balance original
    await start3(page, hasTouch);
    const n = await X(page);
    expect(n.difficulty).toBe('normal');
    const W = page.viewportSize().width, bw = n.topW;
    expect(n.baseSpeed).toBeCloseTo(Math.min((W + n.curW + 80) / Math.max(1.35, 2.5 - 1 * .03), bw * 2.4), 6);
    expect(n.perfWindow).toBe(Math.max(8, n.curW * .045));
    await page.reload();
    // teclado: flecha a la derecha → Difícil, sin arrancar la partida
    await normal.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#diffBox [data-d="dificil"]')).toHaveAttribute('aria-checked', 'true');
    expect((await X(page)).state).toBe('menu');
    // toque / clic: Extremo
    const ex = page.locator('#diffBox [data-d="extremo"]');
    if (hasTouch) await ex.tap(); else await ex.click();
    await expect(ex).toHaveAttribute('aria-checked', 'true');
    expect((await X(page)).state).toBe('menu');
    await expect(page.locator('#diffInfo')).toContainText('Velocidad máxima');
    await page.reload();
    await expect(page.locator('#diffBox [data-d="extremo"]')).toHaveAttribute('aria-checked', 'true');
    await start3(page, hasTouch);
    const e = await X(page);
    expect(e.difficulty).toBe('extremo');
    expect(e.baseSpeed).toBeGreaterThan(n.baseSpeed);
    expect(e.perfWindow).toBeCloseTo(n.perfWindow * .7, 6);
    expectNoErrors(errors);
  });

  test('calidad: baja/media/alta cambian DPR, topes de partículas y capas', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await page.waitForFunction(() => !!(/** @type {any} */ (window).__torre) && !!(/** @type {any} */ (window).MLArcade));
    const setQ = q => page.evaluate(q => /** @type {any} */ (window).MLArcade.settings.set('quality', q), q);
    const res = {};
    for (const q of ['low', 'medium', 'high']) {
      await setQ(q);
      await expect.poll(async () => (await X(page)).quality).toBe(q);
      await page.evaluate(() => { const t = /** @type {any} */ (window).__torre; if (t.state !== 'playing') document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); });
      await expect.poll(async () => (await X(page)).state).toBe('playing');
      const before = (await X(page)).stats.parts;
      await page.evaluate(() => /** @type {any} */ (window).__torreDebug.dropAt(0)); // caída perfecta = confeti
      const s = await X(page);
      res[q] = { dpr: s.dpr, cap: s.caps.parts, layers: s.caps.layers, burst: s.stats.parts - before,
        cw: await page.evaluate(() => /** @type {HTMLCanvasElement} */ (document.getElementById('c')).width) };
    }
    expect(res.low.dpr).toBe(1);
    expect(res.low.cap).toBeLessThan(res.medium.cap);
    expect(res.medium.cap).toBeLessThan(res.high.cap);
    expect(res.low.layers).toBe(1); expect(res.high.layers).toBe(3);
    expect(res.low.burst).toBeLessThan(res.high.burst);
    expect(res.low.cw).toBe(page.viewportSize().width);
    expectNoErrors(errors);
  });

  test('tormenta: aviso previo, viento que cambia la velocidad, lluvia y bono al superarla', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    await stackTo(page, 15);
    expect((await X(page)).banner).toContain('SE VIENE UNA TORMENTA EN 1');
    await stackTo(page, 17);
    const s = await X(page);
    expect(s.storm).toBe(true);
    expect(s.banner).toContain('TORMENTA');
    // el viento cambia la velocidad del bloque en movimiento (la base no cambia)
    await expect.poll(async () => { const a = await X(page); return Math.abs(a.speed / a.baseSpeed - 1); }, { timeout: 10000 }).toBeGreaterThan(.03);
    await expect.poll(async () => (await X(page)).stats.rain, { timeout: 10000 }).toBeGreaterThan(10);
    await stackTo(page, 23);
    const e = await X(page);
    expect(e.storm).toBe(false);
    expect(e.events.storms).toBe(1);
    const d = (await page.evaluate(() => /** @type {any} */ (window).__torre.drops)).find(x => x.row === 22);
    expect(d.bonus).toBe(5);
    expectNoErrors(errors);
  });

  test('bloque gigante: aviso, más ancho y lento, bono al apoyarlo; fallarlo termina la partida', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    await stackTo(page, 28);
    expect((await X(page)).banner).toContain('BLOQUE GIGANTE EN 2');
    await stackTo(page, 30);
    const g = await X(page);
    expect(g.curSpecial).toBe('gigante');
    expect(g.curW).toBeGreaterThan(g.topW);
    expect(g.speed).toBeCloseTo(g.baseSpeed * .8, 3);
    const score0 = g.score;
    await page.evaluate(() => /** @type {any} */ (window).__torreDebug.dropAt(40)); // apoyado con corte
    const a = await X(page);
    expect(a.events.giants).toBe(1);
    expect(a.rows).toBe(31);
    expect(a.score - score0).toBe(1 + 5);
    expectNoErrors(errors);

    // después, soltar lejos = fallo total (el juego termina normalmente)
    await page.evaluate(() => /** @type {any} */ (window).__torreDebug.dropAt(5000));
    await expect.poll(async () => (await X(page)).state).toBe('over');
  });

  test('desafío de estabilidad: tres fases, se gana con ≥75 % y se pierde el bono si una falla', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    await stackTo(page, 37);
    let s = await X(page);
    expect(s.stabPhase).toBe(1);
    expect(s.banner).toContain('ESTABILIDAD 1/3');
    // fase 1 perfecta, fase 2 con ráfaga (velocidad variable), fase 3 más rápida (×1,12)
    await stackTo(page, 38);
    await expect.poll(async () => { const a = await X(page); return Math.abs(a.speed / a.baseSpeed - 1); }, { timeout: 10000 }).toBeGreaterThan(.02);
    await stackTo(page, 40);
    s = await X(page);
    expect(s.events.stab).toBe(1);
    // ciclo siguiente (65-67): falla la fase 1 con un corte del 40 %
    await stackTo(page, 65);
    await page.evaluate(() => { const t = /** @type {any} */ (window).__torre; /** @type {any} */ (window).__torreDebug.dropAt(t.topW * .4); });
    s = await X(page);
    expect(s.stabFail).toBe(true);
    expect(s.banner).toContain('FALLADO');
    await stackTo(page, 68);
    s = await X(page);
    expect(s.events).toMatchObject({ stab: 1, stabFail: 1 });
    const d = (await page.evaluate(() => /** @type {any} */ (window).__torre.drops)).find(x => x.row === 67);
    expect(d.bonus).toBe(0);
    expectNoErrors(errors);
  });

  test('piezas especiales: dorado duplica, escudo protege el combo, hielo y pesado cambian la velocidad', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    await stackTo(page, 5);
    let s = await X(page);
    expect(s.curSpecial).toBe('oro');
    expect(s.banner).toContain('DORADO');
    await page.evaluate(() => /** @type {any} */ (window).__torreDebug.dropAt(0));
    let d = (await page.evaluate(() => /** @type {any} */ (window).__torre.drops)).at(-1);
    expect(d).toMatchObject({ sp: 'oro', kind: 'perfect', combo: 5, gained: 12 });
    await stackTo(page, 11);
    s = await X(page);
    expect(s.curSpecial).toBe('escudo');
    const combo = s.combo;
    await page.evaluate(() => { const t = /** @type {any} */ (window).__torre; /** @type {any} */ (window).__torreDebug.dropAt(t.topW * .2); });
    s = await X(page);
    expect(s.combo).toBe(combo); // con corte, el combo sigue
    await stackTo(page, 26);
    s = await X(page);
    expect(s.curSpecial).toBe('pesado');
    expect(s.speed).toBeCloseTo(s.baseSpeed * .75, 3);
    await stackTo(page, 32);
    s = await X(page);
    expect(s.curSpecial).toBe('hielo');
    expect(s.speed).toBeCloseTo(s.baseSpeed * 1.25, 3);
    expect(s.events.specials).toBeGreaterThanOrEqual(3);
    expectNoErrors(errors);
  });

  test('pantalla final: «Menú y dificultad» vuelve a la portada sin arrancar otra partida', async ({ page, hasTouch }) => {
    const { errors } = await openGame(page, DBG);
    await start3(page, hasTouch);
    await page.evaluate(() => /** @type {any} */ (window).__torreDebug.dropAt(5000));
    await expect.poll(async () => (await X(page)).state).toBe('over');
    await expect(page.locator('#over')).toBeVisible({ timeout: 20_000 });
    await wait(page, 700);
    const b = page.locator('#menuBtn');
    if (hasTouch) await b.tap(); else await b.click();
    await expect.poll(async () => (await X(page)).state, { timeout: 20_000 }).toBe('menu');
    await expect(page.locator('#menu')).toBeVisible({ timeout: 20_000 });
    expect((await missions(page)).running).toBe(false);
    expectNoErrors(errors);
  });
});
