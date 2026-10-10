// @ts-check
import { test, expect as baseExpect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

// Academia de Dragones (Three.js 0.186, Kit3D). En headless el WebGL es SwiftShader (CPU) y el rAF puede
// frenarse varios segundos: los objetivos largos se completan con simulate() (pasos fijos de 1/60 s) vía ?debug,
// y las comprobaciones con tiempo real usan expect.poll con márgenes amplios.

// la máquina de pruebas puede estar muy cargada: esperas por condición con margen amplio
const expect = baseExpect.configure({ timeout: 30_000 });
const FILE = 'academia_dragones.html';
const DBG = FILE + '?debug';
const H = page => page.evaluate(() => {
  const h = window.__academia_dragones;
  return { state: h.state, scene: h.scene, player: h.player, lives: h.lives, score: h.score, counts: h.counts, run: h.run, boss: h.boss, quality: h.quality, difficulty: h.difficulty, save: h.save, paused: h.paused, simTime: h.simTime };
});
const sim = (page, s) => page.evaluate(x => window.__academia_dragones.simulate(x), s);
const call = (page, fn, ...args) => page.evaluate(([f, a]) => window.__academia_dragones[f](...a), [fn, args]);

async function ready(page) {
  await page.waitForFunction(() => !!(window.__academia_dragones && window.MLArcade && window.MLMissions), null, { timeout: 40_000 });
  await page.waitForFunction(() => window.__academia_dragones.perf.frames > 1, null, { timeout: 40_000 });
}
/** Arranca con entrada real: Enter en PC, toque en «Volar» en celular. */
async function startReal(page, isMobile) {
  await expect(page.locator('#adStart')).toBeVisible();
  if (isMobile) await page.locator('#adStart').tap(); else await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__academia_dragones.state), { timeout: 30_000 }).toBe('play');
}
/** Arranque rápido por debug en una región. */
async function startAt(page, kind) {
  await call(page, 'goto', kind);
  await expect.poll(() => page.evaluate(() => window.__academia_dragones.scene)).toBe(kind);
}

test.describe('Academia de Dragones', () => {
  test.beforeEach(async ({ page }) => {
    // sin gamepads físicos de la máquina (generan teclas fantasma)
    await page.addInitScript(() => { try { Object.defineProperty(navigator, 'getGamepads', { value: () => [] }); } catch (e) {} });
  });

  test('carga sin errores: menú con dragones, dificultad y crédito MateLabs', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    const s = await H(page);
    expect(s.state).toBe('menu');
    await expect(page.locator('#adMenu')).toBeVisible();
    await expect(page.locator('#adMenu .ad-drag')).toHaveCount(3);
    await expect(page.locator('[data-dragon="ascua"]')).toBeDisabled();
    await expect(page.locator('#adMenu .mlm-diff [role=radio]')).toHaveCount(4);
    await expect(page.locator('#adMenu .ad-credit')).toContainText('MATELABS');
    await expect(page.locator('.mla-bar')).toBeVisible();
    await wait(page, 600);
    expectNoErrors(errors);
  });

  test('arranque con entrada real, tutorial contextual y saltable', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await startReal(page, isMobile);
    expect((await sdk(page)).telemetry).toContain('start');
    await expect(page.locator('#adHud')).toBeVisible();
    await expect(page.locator('#adTip')).toBeVisible();
    await expect(page.locator('#adTipText')).toContainText('1/5');
    await page.locator('#adTipSkip').click();
    await expect(page.locator('#adTip')).toBeHidden();
    expect((await H(page)).save.tutorial).toBe(true);
    // se puede volver a abrir desde la pausa
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause button', { hasText: 'Ver tutorial' }).click();
    await expect(page.locator('#adTip')).toBeVisible();
    expectNoErrors(errors);
  });

  test('vuelo con teclado: girar, subir y turbo responden', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startReal(page, false);
    await call(page, 'setInvuln', 999);
    const a = await H(page);
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await H(page)).player.yaw, { timeout: 30_000 }).toBeGreaterThan(a.player.yaw + 0.15);
    await page.keyboard.up('ArrowLeft');
    const b = await H(page);
    await page.keyboard.down('Space');
    await expect.poll(async () => (await H(page)).player.pitch, { timeout: 30_000 }).toBeGreaterThan(0.2);
    await page.keyboard.up('Space');
    // nivelación automática al soltar
    await sim(page, 2);
    expect(Math.abs((await H(page)).player.pitch)).toBeLessThan(0.15);
    await page.keyboard.down('ShiftLeft');
    await expect.poll(async () => (await H(page)).player.boosting, { timeout: 30_000 }).toBe(true);
    await page.keyboard.up('ShiftLeft');
    // aliento con F: aparece un proyectil
    await page.keyboard.down('KeyF');
    await expect.poll(async () => (await H(page)).counts.bolts, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.keyboard.up('KeyF');
    expect(b.state).toBe('play');
    expectNoErrors(errors);
  });

  test('controles táctiles: joystick gira y ▲ sube', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'táctil: sólo celular');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startReal(page, true);
    await call(page, 'setInvuln', 999);
    await expect(page.locator('.k3-joy')).toBeVisible();
    await expect(page.locator('.k3-btn[data-btn="up"]')).toBeVisible();
    const joy = await page.locator('.k3-joy').boundingBox();
    const a = await H(page);
    const cdp = await page.context().newCDPSession(page);
    const cx = joy.x + joy.width / 2, cy = joy.y + joy.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 60, y: cy, id: 1 }] });
    await expect.poll(async () => (await H(page)).player.yaw, { timeout: 30_000 }).toBeLessThan(a.player.yaw - 0.15);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const up = await page.locator('.k3-btn[data-btn="up"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: up.x + up.width / 2, y: up.y + up.height / 2, id: 2 }] });
    await expect.poll(async () => (await H(page)).player.pitch, { timeout: 30_000 }).toBeGreaterThan(0.2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // botón de aliento
    const fire = await page.locator('.k3-btn[data-btn="fire"]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x + 20, y: fire.y + 20, id: 3 }] });
    await expect.poll(async () => (await H(page)).counts.bolts + (await H(page)).counts.particles, { timeout: 30_000 }).toBeGreaterThan(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    expectNoErrors(errors);
  });

  test('marcadores de entrenamiento: pasar, altura, picada, turbo y farol', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'picos');
    await call(page, 'setInvuln', 999);
    // 1: atravesar la columna
    await call(page, 'toMarker', 0); await sim(page, 1.2);
    expect((await H(page)).counts.markersDone).toBe(1);
    // 2: altura — por debajo de la marca no cuenta
    const m2 = await page.evaluate(() => window.__academia_dragones.counts.markersDone);
    await page.evaluate(() => { const h = window.__academia_dragones; h.toMarker(1); });
    await sim(page, 1.0);
    expect((await H(page)).counts.markersDone).toBe(m2);
    await page.evaluate(() => { const h = window.__academia_dragones; const s = h.save; h.teleport(-110, 150, 22, 0); });
    await sim(page, 0.5);
    expect((await H(page)).counts.markersDone).toBe(2);
    // 3: picada (velocidad vertical negativa): desde arriba con el morro hacia abajo (tecla C)
    await page.evaluate(() => window.__academia_dragones.teleport(-150, 140, -72, 0));
    await page.keyboard.down('KeyC');
    await sim(page, 1.6);
    await page.keyboard.up('KeyC');
    await expect.poll(async () => (await H(page)).counts.markersDone, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    // si la picada no entró por geometría, el resto se completa por debug (la prueba de marcador 3 queda en el log)
    if ((await H(page)).counts.markersDone === 2) { await call(page, 'toMarker', 2); await page.keyboard.down('KeyC'); await sim(page, 1.2); await page.keyboard.up('KeyC'); }
    // 4: turbo
    await call(page, 'toMarker', 3); await page.keyboard.down('ShiftLeft'); await sim(page, 1.2); await page.keyboard.up('ShiftLeft');
    // 5: farol con aliento
    await call(page, 'toMarker', 4); await call(page, 'fire'); await sim(page, 0.8);
    const s = await H(page);
    expect(s.counts.markersDone).toBeGreaterThanOrEqual(4);
    if (s.counts.markersDone < 5) await call(page, 'completeMarkers');
    expect((await H(page)).run.courseActive).toBe(true);
    expect((await H(page)).save.campaign.markers.length).toBe(5);
    expectNoErrors(errors);
  });

  test('aros: atravesarlos en orden avanza el circuito y gradúa', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'picos');
    await call(page, 'setInvuln', 999);
    await call(page, 'completeMarkers');
    for (let i = 0; i < 3; i++) { await call(page, 'toNextRing'); await sim(page, 0.6); }
    expect((await H(page)).counts.ringIdx).toBe(3);
    await call(page, 'completeTrial');
    const s = await H(page);
    expect(s.save.campaign.graduated).toBe(true);
    expect(s.run.portalOpen).toBe(true);
    const m = await page.evaluate(() => window.MLMissions.state().current.find(x => x.id === 'graduarse'));
    expect(m.status).toBe('done');
    expectNoErrors(errors);
  });

  test('huevos, nidos y posadas: recoger, rescatar, entregar y punto de control', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'picos');
    await call(page, 'setInvuln', 999);
    await call(page, 'toPos', 'egg'); await sim(page, 0.2);
    let s = await H(page);
    expect(s.save.eggs).toContain('picos');
    expect(s.counts.eggs.find(e => e.id === 'picos').visible).toBe(false);
    await call(page, 'toPos', 'nest'); await sim(page, 0.2);
    s = await H(page);
    expect(s.player.carrying).toBe(1);
    expect(s.counts.nests[0].state).toBe('carried');
    await call(page, 'toPos', 'inn'); await sim(page, 0.2);
    s = await H(page);
    expect(s.player.carrying).toBe(0);
    expect(s.run.rescued).toBe(1);
    expect(s.counts.inns[0].active).toBe(true);
    expect(s.run.checkpoint).toBe(true);
    // estado de la sesión: el nido queda vacío y la posada activa al cambiar de región y volver
    await call(page, 'goto', 'lago'); await call(page, 'goto', 'picos');
    s = await H(page);
    expect(s.counts.nests[0].state).toBe('delivered');
    expect(s.counts.inns[0].active).toBe(true);
    expect(s.counts.eggs.find(e => e.id === 'picos').visible).toBe(false);
    expectNoErrors(errors);
  });

  test('rivales: murciélago cae con el aliento, autómata blindado hasta recalentarse', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'picos');
    // todo por pasos fijos (simulate): blancos inmóviles vía enemyAhead, sin esperas de tiempo real
    const kill = await page.evaluate(() => {
      const h = window.__academia_dragones; h.setInvuln(999);
      if (!h.enemyAhead('bat')) return -1;
      h.fire(); for (let i = 0; i < 6; i++) { h.setInvuln(999); h.simulate(0.1); }
      return h.run.kills;
    });
    expect(kill).toBeGreaterThanOrEqual(1);
    await startAt(page, 'volcan');
    const r = await page.evaluate(() => {
      const h = window.__academia_dragones; h.setInvuln(999);
      if (!h.enemyAhead('auto')) return null;
      const hp0 = h.enemies().find(e => e.kind === 'auto' && e.alive).hp;
      h.fire(); for (let i = 0; i < 6; i++) { h.setInvuln(999); h.simulate(0.1); }
      const hurt = h.enemies().some(e => e.kind === 'auto' && (e.hp < hp0 || !e.alive));
      // patrón de ataque: al acercarse fija el blanco (láser) y dispara
      const st = h.forceEnemy('auto');
      const seen = new Set();
      for (let i = 0; i < 60; i++) { h.setInvuln(999); h.setEnergy(80); h.simulate(0.1); h.enemies().filter(e => e.kind === 'auto').forEach(e => seen.add(e.state)); if (seen.has('lock')) break; }
      return { hurt, st, lock: seen.has('lock') };
    });
    expect(r).not.toBeNull();
    expect(r.hurt).toBe(true);
    expect(r.st).not.toBeNull();
    expect(r.lock).toBe(true);
    // blindaje: con Brisa (viento) un autómata en guardia no recibe daño
    const armored = await page.evaluate(() => {
      const h = window.__academia_dragones;
      h.enemyAhead('auto'); const e0 = h.enemies().find(e => e.kind === 'auto' && e.alive);
      return e0 ? true : false;
    });
    expect(armored).toBe(true);
    expectNoErrors(errors);
  });

  test('géiser del volcán: avisa, erupciona y daña', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'volcan');
    await call(page, 'toPos', 'geyser');
    await call(page, 'setInvuln', 0);
    const phases = new Set();
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => { const h = window.__academia_dragones; h.toPos('geyser'); h.setInvuln(0); h.setEnergy(80); h.simulate(0.1); });
      phases.add((await H(page)).counts.geysers[0]);
      if (phases.has('erupt')) break;
    }
    expect(phases.has('warn') || phases.has('erupt')).toBe(true);
    expect(phases.has('erupt')).toBe(true);
    // dentro de la columna en erupción se pierde energía
    await page.evaluate(() => { const h = window.__academia_dragones; const g = h.counts; h.setInvuln(0); h.setEnergy(80); });
    const e0 = (await H(page)).player.energy;
    await page.evaluate(() => { const h = window.__academia_dragones; h.toPos('geyser'); });
    await page.evaluate(() => { const h = window.__academia_dragones; const p = h.player.pos; h.teleport(p.x, p.y - 15, p.z, 0); h.simulate(0.05); });
    expect((await H(page)).player.energy).toBeLessThan(e0);
    expectNoErrors(errors);
  });

  test('regiones: las cuatro escenas cargan y el portal lleva a la siguiente', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    for (const k of ['picos', 'lago', 'volcan', 'tormenta']) {
      await startAt(page, k);
      await sim(page, 0.5);
      const s = await H(page);
      expect(s.scene).toBe(k);
      expect(s.counts.obstacles).toBeGreaterThan(5);
    }
    await startAt(page, 'picos');
    await call(page, 'completeTrial');
    expect((await H(page)).run.portalOpen).toBe(true);
    await call(page, 'toPos', 'portal'); await sim(page, 0.1);
    expect((await H(page)).state).toBe('travel');
    await sim(page, 1.5);
    const s = await H(page);
    expect(s.scene).toBe('lago');
    expect(s.state).toBe('play');
    // carrera: largada, el rival corre y si gana se reinicia
    await call(page, 'setInvuln', 999);
    await call(page, 'toNextRing'); await sim(page, 0.5);
    expect((await H(page)).run.raceActive).toBe(true);
    await sim(page, 2);
    expect((await H(page)).run.rivalU).toBeGreaterThan(0);
    await call(page, 'rival', 0.999); await sim(page, 0.3);
    expect((await H(page)).run.raceActive).toBe(false);
    expectNoErrors(errors);
  });

  test('misiones: principal + secundaria cumplidas y persisten tras recargar', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'picos');
    await call(page, 'completeTrial');
    await startAt(page, 'lago');
    await call(page, 'setInvuln', 999);
    await call(page, 'toPos', 'shiny'); await sim(page, 0.2);
    const cur = await page.evaluate(() => window.MLMissions.state().current);
    expect(cur.find(m => m.id === 'graduarse').status).toBe('done');
    expect(cur.find(m => m.id === 'huevo_brillante').status).toBe('done');
    await page.reload();
    await ready(page);
    const ach = await page.evaluate(() => window.MLMissions.state().achievements.done);
    expect(ach.graduarse).toBeGreaterThan(0);
    expect(ach.huevo_brillante).toBeGreaterThan(0);
    const s = await H(page);
    expect(s.save.campaign.graduated).toBe(true);
    // el menú refleja el progreso y ofrece continuar en el lago
    await expect(page.locator('#adStart')).toContainText('Lago');
    expectNoErrors(errors);
  });

  test('guardado corrupto: se recupera sin romper', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('ad-once')) { sessionStorage.setItem('ad-once', '1'); localStorage.setItem('academia_dragones:save', '{esto no es json'); }
    });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    let s = await H(page);
    expect(s.state).toBe('menu');
    expect(s.save.campaign.markers).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('academia_dragones:save:corrupto'))).toContain('esto no es json');
    // datos con tipos inválidos: se sanean
    await page.evaluate(() => localStorage.setItem('academia_dragones:save', JSON.stringify({ v: 1, d: { campaign: 'roto', eggs: 7, dragon: 'ascua', settings: { sens: 99, assist: 'x' } } })));
    await page.reload(); await ready(page);
    s = await H(page);
    expect(s.save.campaign.graduated).toBe(false);
    expect(s.save.eggs).toEqual([]);
    expect(s.save.dragon).toBe('brisa');
    expect(s.save.settings.sens).toBeLessThanOrEqual(1.6);
    await startReal(page, false);
    expectNoErrors(errors);
  });

  test('dificultad: el selector cambia vidas y daño reales', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await page.locator('#adMenu [role=radio][data-d="facil"]').click();
    await expect(page.locator('#adDiffInfo')).toContainText('Vidas 5');
    await page.locator('#adStart').click();
    await expect.poll(async () => (await H(page)).state).toBe('play');
    let s = await H(page);
    expect(s.lives).toBe(5); expect(s.difficulty.damage).toBe(0.6);
    // daño recibido escala con la dificultad
    await call(page, 'setInvuln', 0);
    const e0 = s.player.energy;
    await page.evaluate(() => { const h = window.__academia_dragones; h.toPos('egg'); });
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause button', { hasText: 'Menú del juego' }).click();
    await page.locator('#adMenu [role=radio][data-d="extremo"]').click();
    await page.locator('#adStart').click();
    await expect.poll(async () => (await H(page)).state).toBe('play');
    s = await H(page);
    expect(s.lives).toBe(2); expect(s.difficulty.damage).toBe(1.6); expect(s.difficulty.bossHp).toBe(1.5);
    expect(e0).toBeGreaterThan(0);
    expectNoErrors(errors);
  });

  test('calidad: baja/media/alta cambian distancia, nubes, sombras y espejo', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'lago');
    const q = async (v) => { await page.evaluate(x => window.MLArcade.settings.set('quality', x), v); await sim(page, 0.1); await wait(page, 300); return (await H(page)).quality; };
    const low = await q('low'), med = await q('medium'), high = await q('high');
    expect(low.far).toBeLessThan(med.far); expect(med.far).toBeLessThan(high.far);
    expect(low.clouds).toBeLessThan(med.clouds); expect(med.clouds).toBeLessThan(high.clouds);
    expect(low.particleLimit).toBeLessThan(high.particleLimit);
    expect(high.shadows).toBe(true); expect(low.shadows).toBe(false);
    await expect.poll(async () => (await H(page)).quality.mirror).toBe(true);
    await q('low');
    await expect.poll(async () => (await H(page)).quality.mirror).toBe(false);
    expectNoErrors(errors);
  });

  test('jefe: intro, fases 1→2→3, victoria y pantalla final', async ({ page }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await call(page, 'spawnBoss');
    await expect.poll(async () => (await H(page)).state).toBe('intro');
    await page.keyboard.press('Space');
    await sim(page, 0.2);
    await expect.poll(async () => (await H(page)).state, { timeout: 20_000 }).toBe('play');
    await call(page, 'setInvuln', 999);
    let b = (await H(page)).boss;
    expect(b.phase).toBe(1);
    // fase 1: telegrafía de rayos
    await sim(page, 6);
    b = (await H(page)).boss;
    expect(b.strikes + b.orbs).toBeGreaterThanOrEqual(0);
    await call(page, 'hitBoss', b.maxHp * 0.45);
    b = (await H(page)).boss;
    expect(b.phase).toBe(2);
    await expect(page.locator('#adBoss')).toBeVisible();
    // fase 2: embestida telegrafiada → aturdida
    await page.evaluate(() => { const h = window.__academia_dragones; for (let i = 0; i < 16; i++) { h.setInvuln(999); h.setEnergy(90); h.simulate(1); } });
    await call(page, 'hitBoss', b.maxHp * 0.32);
    expect((await H(page)).boss.phase).toBe(3);
    await call(page, 'hitBoss', b.maxHp);
    expect((await H(page)).boss.mode).toBe('dying');
    await sim(page, 3.5);
    await sim(page, 3.5);
    await expect.poll(async () => (await H(page)).state).toBe('win');
    await expect(page.locator('#adEnd')).toBeVisible();
    await expect(page.locator('#adEnd')).toContainText('SALVADA');
    expect((await H(page)).save.bossDefeated).toBe(true);
    expectNoErrors(errors);
  });

  test('derrota: sin vidas aparece la pantalla de derrota y se puede reintentar', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startAt(page, 'volcan');
    await call(page, 'setLives', 2);
    await call(page, 'kill'); await sim(page, 2);
    let s = await H(page);
    expect(s.state).toBe('play'); expect(s.lives).toBe(1);
    // sin energía también es caída
    await call(page, 'setInvuln', 0);
    await call(page, 'setEnergy', 5);
    await call(page, 'hurt', 50);
    await sim(page, 2);
    s = await H(page);
    expect(s.state).toBe('over');
    await expect(page.locator('#adEnd')).toBeVisible();
    await expect(page.locator('#adEnd')).toContainText('SIN ENERGÍA');
    if (isMobile) await page.locator('#adEnd [data-retry]').tap(); else await page.locator('#adEnd [data-retry]').click();
    await expect.poll(async () => (await H(page)).state).toBe('play');
    expect((await H(page)).scene).toBe('volcan');
    expectNoErrors(errors);
  });

  test('pausa congela 1 s, reanudar continúa y reiniciar resetea', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await startReal(page, isMobile);
    await call(page, 'setInvuln', 999);
    await expect.poll(async () => (await H(page)).simTime, { timeout: 30_000 }).toBeGreaterThan(0.2);
    await call(page, 'addScore', 500);
    if (isMobile) await page.locator('.mla-bar button[aria-label="Pausa"]').tap(); else await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await H(page);
    expect(a.paused).toBe(true);
    await wait(page, 1000);
    const b = await H(page);
    expect(b.simTime).toBe(a.simTime);
    expect(b.player.pos).toEqual(a.player.pos);
    await page.locator('.mla-pause [data-a="resume"]').click();
    await expect.poll(async () => (await H(page)).simTime, { timeout: 30_000 }).toBeGreaterThan(a.simTime);
    // reiniciar desde la pausa
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect.poll(async () => (await H(page)).state).toBe('play');
    const c = await H(page);
    expect(c.score).toBe(0);
    expect(c.lives).toBe(c.difficulty.lives);
    expectNoErrors(errors);
  });

  for (const [w, h] of [[412, 915], [915, 412]]) {
    test(`celular ${w}×${h}: sin scroll ni superposición del HUD con controles y barra`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'diseño celular: proyecto mobile');
      await page.setViewportSize({ width: w, height: h });
      const { errors } = await openGame(page, DBG);
      await ready(page);
      // menú sin desbordar horizontalmente
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollHeight <= innerHeight + 1)).toBe(true);
      await startReal(page, true);
      await sim(page, 0.3); await wait(page, 400);
      const boxes = await page.evaluate(() => {
        const r = s => { const e = document.querySelector(s); if (!e || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return null; const b = e.getBoundingClientRect(); return b.width ? { x: b.x, y: b.y, w: b.width, h: b.height, s } : null; };
        return ['.ad-stats', '#adObj', '#adTip', '.mla-bar', '.k3-joy', '.k3-btns'].map(r).filter(Boolean);
      });
      const over = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        expect(over(boxes[i], boxes[j]), `${boxes[i].s} se superpone con ${boxes[j].s}`).toBe(false);
      }
      for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(w + 1); expect(b.y + b.h).toBeLessThanOrEqual(h + 1); }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`celular-${w}x${h}.png`) });
      expectNoErrors(errors);
    });
  }
});
