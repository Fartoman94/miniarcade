// @ts-check
import { test, expect } from '@playwright/test';
import { openGame, expectNoErrors, wait, sdk } from './helpers.js';

// Reino del Alba (Three.js 0.186). En headless el WebGL es SwiftShader (CPU) y en CI hay 2 núcleos: el juego corre
// a pocos FPS. Por eso las pruebas de juego usan tiempo manual (debug.manual: el bucle real se detiene y el tiempo
// sólo avanza con simulate() de paso fijo) y recorren los mismos caminos de código que la entrada real
// (acercarse + interactuar = rayo de interacción + tecla E). Unas pocas pruebas usan teclas y toques reales.

const FILE = 'reino_alba.html';
const DBG = 'reino_alba.html?debug';
const H = (page, body) => page.evaluate(`(()=>{ const H = window.__reino_alba, D = H.debug; ${body} })()`);
const POLL = { timeout: 40_000 };

async function ready(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__reino_alba?.state === 'menu' && /** @type {any} */ (window).__reino_alba.perf.frames > 1, null, { timeout: 45_000 });
}
/** Arranca desde el menú con entrada real (Enter en escritorio, toque en celular). */
async function start(page, isMobile) {
  if (isMobile) await page.locator('#ra-menu [data-go]').tap();
  else { await page.locator('#ra-menu [data-go]').focus(); await page.keyboard.press('Enter'); }
  await expect.poll(() => H(page, 'return H.state'), POLL).toBe('play');
}
/** Abre en modo debug, arranca y fija el tiempo manual. */
async function play(page, isMobile, { god = true } = {}) {
  const r = await openGame(page, DBG);
  await ready(page);
  await start(page, isMobile);
  await H(page, `D.manual(true); ${god ? 'D.god(true);' : ''} D.setHour(10); D.simulate(0.1); return 1`);
  return r;
}
const sim = (page, s) => H(page, `D.simulate(${s}); return 1`);
async function hold(page, key, sec) { await page.keyboard.down(key); await sim(page, sec); await page.keyboard.up(key); }
const cdps = new WeakMap();
async function touch(page, type, x, y) {
  let cdp = cdps.get(page);
  if (!cdp) { cdp = await page.context().newCDPSession(page); cdps.set(page, cdp); }
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}

/** Cadena completa de la principal A con los caminos reales de interacción. */
async function chainA(page) {
  return H(page, `
    const r = [];
    r.push(D.talk('capitan')); D.finishDialog(); r.push(H.quests.A.stage);
    r.push(D.talk('herrero')); D.finishDialog(); r.push(H.quests.A.stage);
    D.goto('cueva'); for (const m of ['mena1','mena2','mena3']) r.push(D.use(m)); r.push(H.quests.A.stage);
    r.push(D.talk('herrero')); D.finishDialog(); r.push(H.quests.A.stage);
    D.goto('herreria'); r.push(D.use('yunque')); r.push(H.quests.A.stage, !!H.inv.items.llaveAlba);
    D.goto('castillo','sur'); r.push(D.use('door:torre')); D.simulate(0.8); r.push(H.quests.A.stage, H.doors.torre.state);
    r.push(D.use('door:torre')); D.simulate(0.8); r.push(H.scene);
    r.push(D.talk('tomas')); D.finishDialog(); r.push(H.quests.A.stage);
    const code = H.code;
    for (let i = 0; i < 3; i++) { let g = 0; while ((H.save.flags.dials || [0,0,0])[i] !== code[i] && g++ < 5) D.use('dial' + (i + 1)); }
    r.push(!!H.save.flags.celda); D.simulate(2);
    r.push(D.talk('tomas')); D.finishDialog(); r.push(H.quests.A.stage);
    r.push(D.talk('rey')); D.finishDialog(); r.push(H.quests.A.stage, H.quests.A.done);
    return r;`);
}

test.describe('Reino del Alba', () => {
  test.beforeEach(({}, testInfo) => { testInfo.setTimeout(180_000); });

  test('carga sin errores: menú con crédito, dificultad, vuelta a Salva al Rey y fondo 3D', async ({ page }) => {
    const { errors } = await openGame(page, FILE);
    await ready(page);
    await expect(page.locator('#ra-menu h1')).toContainText('REINO DEL ALBA');
    await expect(page.locator('#ra-menu .ra-credit')).toContainText('CREADO POR');
    await expect(page.locator('#ra-menu [role=radiogroup] [role=radio]')).toHaveCount(4);
    await expect(page.locator('#ra-menu a.ra-back')).toHaveAttribute('href', 'Salva_al_rey.html');
    const s = await H(page, 'return { calls: H.perf.calls, scene: H.scene, kind: H.sceneKind }');
    expect(s.scene).toBe('aldea');
    expect(s.calls).toBeGreaterThan(5);
    expect(s.calls).toBeLessThan(160);
    expectNoErrors(errors);
  });

  test('arranque con entrada real, movimiento con teclado, tutorial salteable y reactivable', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclado: sólo escritorio (el táctil tiene su propia prueba)');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, false);
    expect((await sdk(page)).telemetry).toContain('start');
    await H(page, 'D.manual(true); D.simulate(0.6); return 1');
    await expect(page.locator('#ra-tip')).toBeVisible();
    expect(await H(page, 'return H.tip')).toBe('move');
    const z0 = await H(page, 'return H.player.z');
    await hold(page, 'KeyW', 1.0);
    const p1 = await H(page, 'return H.player');
    expect(p1.z).toBeLessThan(z0 - 2);
    await hold(page, 'KeyD', 0.6);
    expect((await H(page, 'return H.player')).x).toBeGreaterThan(p1.x + 1);
    // saltear el tutorial lo desactiva; «Cómo jugar» lo reactiva
    await page.locator('#ra-tip [data-t="skip"]').click();
    expect(await H(page, 'return H.save.tutorial.off')).toBe(true);
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause').getByRole('button', { name: /Cómo jugar y tutorial/ }).click();
    await page.locator('#ra-help [data-retut]').click();
    expect(await H(page, 'return H.save.tutorial.off')).toBe(false);
    // atacar (Espacio) y rodar (Shift) con teclas reales
    await H(page, 'D.simulate(0.5); return 1');
    await page.keyboard.press('Space'); await sim(page, 0.05);
    expect(await H(page, 'return H.save.fame >= 0')).toBe(true);
    await page.keyboard.down('ShiftLeft'); await sim(page, 0.05); await page.keyboard.up('ShiftLeft');
    expect(await H(page, 'return H.player.rolling')).toBe(true);
    expectNoErrors(errors);
  });

  test('interiores: 6 edificios + cueva entran y salen repetidas veces, sin doble transición y con spawn seguro', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    await H(page, "D.give('llaveAlba'); return 1");
    const res = await H(page, `
      const out = [];
      const B = [['aldea','inicio','herreria'],['aldea','inicio','taberna'],['aldea','inicio','curandera'],['aldea','inicio','biblioteca'],['castillo','sur','trono'],['castillo','sur','torre']];
      for (const [zone, sp, b] of B) {
        D.goto(zone, sp);
        for (let k = 0; k < 3; k++) {
          const t0 = H.transitions;
          const rec = { b, k };
          if (H.doors[b].state !== 'open') { rec.opened = D.use('door:' + b); rec.mid = H.doors[b].state; D.simulate(0.8); }
          rec.door = H.doors[b].state; rec.rot = H.doors[b].rot;
          rec.enter = D.use('door:' + b); D.simulate(0.7);
          rec.inside = H.scene; rec.kindIn = H.sceneKind; rec.inDoor = H.doors[b + ':in'] && H.doors[b + ':in'].state;
          rec.t1 = H.transitions - t0;
          rec.exit = D.use('door:' + b); D.simulate(0.7);
          rec.back = H.scene; rec.t2 = H.transitions - t0;
          D.simulate(1.5); rec.t3 = H.transitions - t0; rec.state = H.state;
          const p = H.player; rec.p = [p.x, p.z];
          out.push(rec);
        }
      }
      return out;`);
  for (const r of res) {
      expect(r.door, r.b).toBe('open');
      expect(r.enter, r.b).toBe(true);
      expect(r.inside, r.b).toBe(r.b);
      expect(r.kindIn).toBe('interior');
      expect(r.inDoor, r.b).toBe('open'); // la puerta compartida sigue abierta adentro
      expect(r.t1, r.b).toBe(1);
      expect(r.back, r.b).not.toBe(r.b);
      expect(r.t2, r.b).toBe(2);
      expect(r.t3, `sin re-entrar sola: ${r.b}`).toBe(2);
      expect(r.state).toBe('play');
    }
    // la primera apertura pasó por «opening»
    expect(res.filter(r => r.k === 0).every(r => r.mid === 'opening')).toBe(true);
    // la cueva (sin puerta: pasaje) también ida y vuelta, caminando con la simulación
    const cave = await H(page, `
      D.goto('bosque','cueva'); D.killAll(); const t0 = H.transitions; const r = {};
      r.portal = D.portal('cueva'); D.simulate(0.7); r.in = H.scene; r.exit = D.portal('exit:cueva'); D.simulate(0.7); r.out = H.scene; r.t = H.transitions - t0; return r;`);
    expect(cave).toEqual({ portal: true, in: 'cueva', exit: true, out: 'bosque', t: 2 });
    // persistencia de puertas tras recargar
    await page.reload(); await ready(page);
    const doors = await H(page, 'return H.save.doors');
    for (const b of ['herreria', 'taberna', 'curandera', 'biblioteca', 'trono', 'torre']) expect(doors[b], b).toBe('open');
    expectNoErrors(errors);
  });

  test('puertas: bisagra closed → opening → open, colisión actualizada, entrada caminando y bloqueo con pista', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'teclas reales: escritorio');
    const { errors } = await play(page, false);
    // frente a la herrería, la puerta cerrada no deja pasar
    const r0 = await H(page, "D.goto('aldea','inicio'); D.teleport(-13, -3.4); D.face(Math.PI); return { door: H.doors.herreria.state, rot: H.doors.herreria.rot }");
    expect(r0.door).toBe('closed');
    // la cámara mira hacia el norte: W = hacia la puerta
    await H(page, 'D.setCam(0); D.simulate(0.2); D.teleport(-13, -3.4); return 1');
    await hold(page, 'KeyW', 1.2);
    const blocked = await H(page, 'return H.player.z');
    expect(blocked).toBeGreaterThan(-5.6); // la losa de la puerta está en la fachada (z = -5.5)
    expect(await H(page, 'return H.scene')).toBe('aldea');
    // abrir con E (tecla real): opening → open, la hoja gira 90° sobre la bisagra
    await H(page, "D.approach('door:herreria'); return 1");
    await page.keyboard.press('KeyE'); await sim(page, 0.15);
    expect(await H(page, 'return H.doors.herreria.state')).toBe('opening');
    await sim(page, 0.7);
    const r1 = await H(page, 'return H.doors.herreria');
    expect(r1.state).toBe('open');
    expect(Math.abs(r1.rot - r0.rot)).toBeCloseTo(Math.PI / 2, 2);
    expect(await H(page, 'return H.save.doors.herreria')).toBe('open');
    // ahora se puede entrar caminando al zaguán
    await H(page, 'D.teleport(-13, -3.4); D.face(Math.PI); D.setCam(0); return 1');
    await hold(page, 'KeyW', 1.5);
    await sim(page, 0.6);
    expect(await H(page, 'return H.scene')).toBe('herreria');
    // la torre sin llave: bloqueada con mensaje y pista
    const t = await H(page, "D.goto('castillo','sur'); const ok = D.use('door:torre'); D.simulate(0.8); return { ok, st: H.doors.torre.state, toast: H.toastText, label: H.focus && H.focus.label }");
    expect(t.st).toBe('closed');
    expect(t.toast).toContain('Pista');
    expect(t.label).toContain('🔒');
    // la mazmorra también está trabada hasta la principal C
    const m = await H(page, "D.use('door:mazmorra'); D.simulate(0.8); return { st: H.doors.mazmorra.state, toast: H.toastText }");
    expect(m.st).toBe('closed');
    expect(m.toast).toContain('Pista');
    expectNoErrors(errors);
  });

  test('sin prompts falsos: toda «Entrar» lleva a un interior real y las casas decorativas avisan que no se entra', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const r = await H(page, `
      const out = [];
      for (const [z, sp] of [['aldea','inicio'],['castillo','sur'],['bosque','oeste'],['campos','norte']]) {
        D.goto(z, sp);
        for (const i of H.interactables) {
          if (i.kind === 'door') out.push({ z, id: i.id, portal: H.portals.some(p => p.id === i.id), deco: false });
          if (i.kind === 'deco') out.push({ z, id: i.id, label: i.label, deco: true });
        }
      }
      // usar una casa decorativa no cambia de escena
      D.goto('aldea','inicio'); const t0 = H.transitions; D.use('deco:casa_perez'); D.simulate(1);
      return { out, t: H.transitions - t0, toast: H.toastText };`);
    const doors = r.out.filter(o => !o.deco), decos = r.out.filter(o => o.deco);
    expect(doors.length).toBeGreaterThanOrEqual(7);
    for (const d of doors) expect(d.portal, d.id).toBe(true);
    expect(decos.length).toBeGreaterThanOrEqual(8);
    for (const d of decos) { expect(d.label).toContain('no se puede entrar'); expect(d.label).not.toMatch(/^Entrar/); }
    expect(r.t).toBe(0);
    expect(r.toast).toContain('No se puede');
    expectNoErrors(errors);
  });

  test('los 12 roles de NPC: id, casa, agenda, diálogo, reacción al progreso y orientación al jugador', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const roles = await H(page, 'return H.roles');
    expect(roles).toHaveLength(12);
    // marcadores: al principio el capitán ofrece la principal A
    expect(await H(page, "return H.npcs.find(n => n.id === 'capitan').marker")).toBe('available');
    const res = await H(page, `
      const out = [];
      for (const id of H.roles) {
        const ok = D.talk(id);
        const n = H.npcs.find(x => x.id === id);
        const dlg = H.dialog;
        D.simulate(0.3);
        const n2 = H.npcs.find(x => x.id === id), p = H.player;
        const face = Math.atan2(p.x - n2.x, p.z - n2.z);
        const dif = Math.abs(Math.atan2(Math.sin(face - n2.ry), Math.cos(face - n2.ry)));
        out.push({ id, ok, dlgNpc: dlg && dlg.npc, line: dlg && dlg.line, state: n2.state, talking: n2.talking, scene: n.scene, name: n.name, role: n.role, dif });
        D.finishDialog();
      }
      return out;`);
    for (const r of res) {
      expect(r.ok, r.id).toBe(true);
      expect(r.dlgNpc, r.id).toBe(r.id);
      expect(r.line.length, r.id).toBeGreaterThan(5);
      expect(r.state, r.id).toBe('talk');
      expect(r.talking, r.id).toBe(true);
      expect(r.name.length).toBeGreaterThan(2);
      expect(r.dif, 'mira al jugador: ' + r.id).toBeLessThan(0.35);
    }
    // reacción al progreso: el herrero saludaba con su línea base; tras hablar con el capitán pide mineral
    const base = res.find(r => r.id === 'herrero').line;
    const after = await H(page, "D.talk('herrero'); const l = H.dialog.line; D.finishDialog(); return l");
    expect(after).not.toBe(base);
    expect(after).toContain('mineral');
    // agenda diaria: de noche Bruno está en la taberna; de día, en la herrería
    const sched = await H(page, "D.setHour(21); const a = H.npcs.find(n => n.id === 'herrero').scene; D.setHour(8); const b = H.npcs.find(n => n.id === 'herrero').scene; return [a, b]");
    expect(sched).toEqual(['taberna', 'herreria']);
    expectNoErrors(errors);
  });

  test('NPC: caminan con A* por la aldea sin atravesar paredes y cambian de escena según la agenda', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const r = await H(page, `
      D.goto('aldea','inicio'); D.setHour(18.95); D.teleport(-30, 30);
      const samples = []; let walked = false;
      for (let i = 0; i < 40; i++) {
        D.simulate(0.5);
        const n = H.npcs.find(x => x.id === 'mercader');
        if (n.scene !== 'aldea') break;
        if (n.state === 'walk') walked = true;
        samples.push(D.npcFree('mercader'));
      }
      return { walked, free: samples.every(Boolean), n: samples.length, scene: H.npcs.find(x => x.id === 'mercader').scene };`);
    expect(r.walked).toBe(true);
    expect(r.free).toBe(true);
    expect(r.scene).toBe('taberna');
    expectNoErrors(errors);
  });

  test('principal A «La llave del alba» completa de punta a punta y persiste tras recargar', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const r = await chainA(page);
    expect(r).toEqual([true, 1, true, 2, true, true, true, 3, true, 4, true, 5, true, true, 6, 'open', true, 'torre', true, 6, true, true, 7, true, 8, true]);
    const m = await H(page, "return H.missions.current.find(x => x.id === 'llave_alba')");
    expect(m.status).toBe('done');
    await page.reload(); await ready(page);
    const s = await H(page, 'return { A: H.quests.A, torre: H.save.doors.torre, celda: H.save.flags.celda, C: H.npcs.find(n => n.id === "capitan").marker }');
    expect(s.A.done).toBe(true);
    expect(s.torre).toBe('open');
    expect(s.celda).toBe(true);
    expect(s.C).toBe('available'); // la principal C se habilita
    expectNoErrors(errors);
  });

  test('principal B «El bosque oscuro»: tótems, Guardián con 3 fases y altar restaurado', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const r = await H(page, `
      const o = {};
      D.talk('bibliotecaria'); D.finishDialog(); D.talk('bibliotecaria'); D.finishDialog(); o.b1 = H.quests.B.stage;
      D.goto('bosque','oeste'); D.killAll();
      o.tot = [];
      for (const t of ['totem1','totem2','totem3']) { D.use(t); o.tot.push(H.enemies.filter(e => !e.dead).length); D.killMinions(); D.simulate(1); }
      o.b2 = H.quests.B.stage; D.simulate(2); o.boss = H.boss && H.boss.kind;
      let g = 0; while (H.boss.phase === 1 && g++ < 60) D.bossHit(1); o.p2 = H.boss.phase; o.shield = H.boss.shield;
      D.simulate(1.3); const hp = H.boss.hp; D.bossHit(3); o.shieldBlocks = H.boss.hp === hp;
      o.wisps = H.enemies.filter(e => e.kind === 'sombra' && !e.dead).length;
      D.killMinions(); D.simulate(0.5); o.shieldOff = !H.boss.shield;
      g = 0; while (H.boss.phase === 2 && g++ < 60) D.bossHit(1); o.p3 = H.boss.phase;
      D.simulate(1.3); g = 0; while (!H.boss.dead && g++ < 80) D.bossHit(1); o.dead = H.boss.dead; o.b3 = H.quests.B.stage;
      D.simulate(1); o.altar = D.use('altar'); o.b4 = H.quests.B.done; D.simulate(2.5); o.scene = H.scene; o.healed = H.save.flags.altar;
      o.enemiesAfter = H.enemies.length;
      return o;`);
    expect(r.b1).toBe(1);
    expect(r.tot).toEqual([2, 2, 2]);
    expect(r.b2).toBe(2);
    expect(r.boss).toBe('guardian');
    expect(r.p2).toBe(2); expect(r.shield).toBe(true); expect(r.shieldBlocks).toBe(true);
    expect(r.shieldOff).toBe(true);
    expect(r.p3).toBe(3);
    expect(r.dead).toBe(true); expect(r.b3).toBe(3);
    expect(r.altar).toBe(true); expect(r.b4).toBe(true); expect(r.healed).toBe(true);
    expect(r.scene).toBe('bosque');
    expect(r.enemiesAfter).toBe(0); // el bosque sanado ya no tiene sombras
    expectNoErrors(errors);
  });

  test('principal C «La defensa del reino»: 3 puertas, 3 aliados y el Carcelero con 2 fases', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    await chainA(page);
    const r = await H(page, `
      const o = {};
      D.talk('capitan'); D.finishDialog(); o.c1 = H.quests.C.stage; o.ref = H.inv.items.refuerzos;
      D.goto('aldea','inicio'); D.use('gate:puerta_puente');
      D.goto('castillo','sur'); D.use('gate:porton');
      D.goto('campos','norte'); D.use('gate:empalizada'); o.c2 = H.quests.C.stage; o.gates = Object.keys(H.save.flags.gates).length;
      for (const a of ['guardia','herrero','aprendiz']) { D.talk(a); D.finishDialog(); }
      o.c3 = H.quests.C.stage; o.allies = Object.keys(H.save.flags.aliados);
      D.goto('castillo','sur'); D.use('door:mazmorra'); D.simulate(0.8); D.use('door:mazmorra'); D.simulate(0.8);
      D.simulate(0.4);
      o.scene = H.scene; o.boss = H.boss && H.boss.kind; o.alliesIn = H.npcs.filter(n => n.scene === 'mazmorra').map(n => n.id).sort();
      o.locked = H.doors['mazmorra:in'].state; D.use('door:mazmorra'); D.simulate(0.8); o.stillIn = H.scene;
      let g = 0; while (H.boss.phase === 1 && g++ < 60) D.bossHit(1); o.p2 = H.boss.phase;
      D.simulate(1.3); o.minions = H.enemies.filter(e => e.kind === 'preso' && !e.dead).length;
      const hp = H.boss.hp; D.simulate(10); o.allyDamage = hp - H.boss.hp;
      g = 0; while (!H.boss.dead && g++ < 80) D.bossHit(1); o.dead = H.boss.dead; o.c4 = H.quests.C.done;
      D.simulate(1); o.exit = D.use('door:mazmorra'); D.simulate(0.8); D.use('door:mazmorra'); D.simulate(0.8); o.out = H.scene;
      return o;`);
    expect(r.c1).toBe(1); expect(r.ref).toBe(3);
    expect(r.c2).toBe(2); expect(r.gates).toBe(3);
    expect(r.c3).toBe(3); expect(r.allies).toHaveLength(3);
    expect(r.scene).toBe('mazmorra'); expect(r.boss).toBe('carcelero');
    expect(r.alliesIn).toEqual(['aprendiz', 'guardia', 'herrero']);
    expect(r.locked).toBe('closed'); expect(r.stillIn).toBe('mazmorra');
    expect(r.p2).toBe(2); expect(r.minions).toBe(2);
    expect(r.allyDamage).toBeGreaterThan(0);
    expect(r.dead).toBe(true); expect(r.c4).toBe(true);
    expect(r.out).toBe('castillo');
    expectNoErrors(errors);
  });

  test('las 6 secundarias: libro, medicina, semillas, molino, mascota y puente viejo', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const r = await H(page, `
      const q = () => H.quests;
      D.talk('bibliotecaria'); D.finishDialog(); D.goto('bosque','oeste'); D.killAll(); D.use('libro'); D.talk('bibliotecaria'); D.finishDialog();
      D.goto('biblioteca'); D.use('atril');
      D.talk('curandera'); D.finishDialog(); D.goto('curandera'); for (const x of ['hierba1','hierba2','hierba3']) D.use(x); D.use('caldero');
      D.talk('campesino'); D.finishDialog();
      D.talk('mercader'); D.advance(0); D.goto('aldea','inicio'); D.use('huerta');
      D.talk('aprendiz'); D.finishDialog(); D.goto('aldea','inicio'); D.use('molino');
      D.talk('viajero'); D.finishDialog(); D.goto('campos','norte'); D.use('canela'); D.talk('viajero'); D.finishDialog();
      D.talk('guardia'); D.finishDialog(); D.goto('campos','norte'); D.use('palanca1'); D.use('palanca2'); D.simulate(2);
      const o = {}; for (const k of ['libro','medicina','semillas','molino','mascota','puente']) o[k] = q()[k].done;
      o.pista = H.save.flags.pista;
      o.missions = H.missions.current.filter(m => m.kind !== 'primary' && m.status === 'done').length;
      return o;`);
    expect(r).toMatchObject({ libro: true, medicina: true, semillas: true, molino: true, mascota: true, puente: true, pista: true });
    expect(r.missions).toBe(6);
    expectNoErrors(errors);
  });

  test('cofres: locked → closed → opened → looted, sin botín infinito al recargar', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const a = await H(page, `
      D.goto('herreria'); const c0 = H.coins, s0 = H.chests.herreria;
      D.use('chest:herreria'); const s1 = H.chests.herreria; D.simulate(0.6); D.use('chest:herreria'); const s2 = H.chests.herreria;
      return { s0, s1, s2, gain: H.coins - c0, can: H.interactables.find(i => i.id === 'chest:herreria').label };`);
    expect(a).toEqual({ s0: 'closed', s1: 'opened', s2: 'looted', gain: 12, can: 'Cofre vacío' });
    // cofre con llave: sin llave avisa y sigue cerrado
    const b = await H(page, "D.goto('biblioteca'); D.use('chest:biblioteca'); return { st: H.chests.biblioteca, toast: H.toastText }");
    expect(b.st).toBe('locked'); expect(b.toast).toContain('Pista');
    await page.reload(); await ready(page);
    await start(page, isMobile);
    const c = await H(page, `D.manual(true); D.goto('herreria'); const c0 = H.coins; const used = D.use('chest:herreria'); D.simulate(0.6);
      return { st: H.chests.herreria, used, gain: H.coins - c0, saved: H.save.chests.herreria };`);
    expect(c).toEqual({ st: 'looted', used: false, gain: 0, saved: 'looted' });
    // salir y volver a entrar varias veces tampoco reinicia el cofre
    const d = await H(page, `const r = []; for (let i = 0; i < 3; i++) { D.goto('aldea','inicio'); D.goto('herreria'); r.push(H.chests.herreria); } return r;`);
    expect(d).toEqual(['looted', 'looted', 'looted']);
    expectNoErrors(errors);
  });

  test('guardado corrupto o con forma inválida: se recupera sin errores', async ({ page, isMobile }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('ra-once')) { sessionStorage.setItem('ra-once', '1'); localStorage.setItem('reino_alba:save', '{esto no es json'); } });
    const { errors } = await openGame(page, FILE);
    await ready(page);
    expect(await H(page, 'return [H.save.scene, H.save.inv.coins, H.save.started]')).toEqual(['aldea', 15, false]);
    expect(await page.evaluate(() => localStorage.getItem('reino_alba:save:corrupto'))).toBe('{esto no es json');
    // forma inválida: tipos rotos, escena inexistente, cofres con estados raros
    await page.evaluate(() => localStorage.setItem('reino_alba:save', JSON.stringify({ v: 1, d: { scene: 'luna', inv: { coins: 'mucho', items: [1, 2] }, chests: { herreria: 'robado' }, quests: { A: -3, B: 'x' }, flags: { dials: [9, 9], gates: 'si' }, time: 'mediodía', npcs: 5 } })));
    await page.reload(); await ready(page);
    const s = await H(page, 'return H.save');
    expect(s.scene).toBe('aldea');
    expect(s.inv.coins).toBe(15);
    expect(s.chests.herreria).toBeUndefined();
    expect(s.quests.A).toBeUndefined();
    expect(s.flags.dials).toEqual([0, 0, 0]);
    expect(typeof s.time).toBe('number');
    await start(page, isMobile);
    expect(await H(page, 'return H.scene')).toBe('aldea');
    expectNoErrors(errors);
  });

  test('dificultad: el selector cambia la vida máxima y la vida de los jefes', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    const pick = async label => { const b = page.locator('#ra-menu [role=radio]', { hasText: label }); if (isMobile) await b.tap(); else await b.click(); };
    await pick('Fácil');
    await expect(page.locator('#ra-menu [data-dtab]')).toContainText('Vida 8');
    await start(page, isMobile);
    const easy = await H(page, "return { hp: H.maxHp, d: H.difficulty.name }");
    expect(easy).toEqual({ hp: 8, d: 'facil' });
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause').getByRole('button', { name: /Volver al menú del reino/ }).click();
    await expect.poll(() => H(page, 'return H.state'), POLL).toBe('menu');
    await pick('Extremo');
    await expect(page.locator('#ra-menu [data-dtab]')).toContainText('Vida 4');
    await start(page, isMobile);
    const hard = await H(page, "D.manual(true); return { hp: H.maxHp, d: H.difficulty.name, boss: H.difficulty.bossHp }");
    expect(hard).toEqual({ hp: 4, d: 'extremo', boss: 1.6 });
    expectNoErrors(errors);
  });

  test('calidad: bajo y alto cambian costos reales (DPR, sombras, luces, vegetación, niebla)', async ({ browser }) => {
    const res = {};
    for (const q of ['low', 'high']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
      await ctx.addInitScript(qq => { try { sessionStorage.setItem('ml-intro:' + location.pathname, '1'); localStorage.setItem('ml:settings', JSON.stringify({ quality: qq })); } catch (e) {} }, q);
      const page = await ctx.newPage();
      const { errors } = await openGame(page, DBG);
      await ready(page);
      await start(page, false);
      res[q] = await H(page, "D.manual(true); D.goto('bosque','oeste'); D.simulate(0.6); return H.quality");
      expectNoErrors(errors);
      await ctx.close();
    }
    expect(res.low.q).toBe('low'); expect(res.high.q).toBe('high');
    expect(res.low.pixelRatio).toBeLessThan(res.high.pixelRatio);
    expect(res.low.shadows).toBe(false); expect(res.high.shadows).toBe(true);
    expect(res.low.lights).toBeLessThan(res.high.lights);
    expect(res.low.instances).toBeLessThan(res.high.instances);
    expect(res.low.fogFar).toBeLessThan(res.high.fogFar);
    expect(res.low.particleCap).toBeLessThan(res.high.particleCap);
  });

  test('pausa congela 1 s, reanudar continúa y reiniciar desde la pausa resetea', async ({ page, isMobile }) => {
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, isMobile);
    await expect.poll(() => H(page, 'return H.runTime'), POLL).toBeGreaterThan(0.05);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeVisible();
    const a = await H(page, 'return { t: H.runTime, h: H.hour, p: H.player, paused: H.paused }');
    await wait(page, 1000);
    const b = await H(page, 'return { t: H.runTime, h: H.hour, p: H.player, paused: H.paused }');
    expect(b.paused).toBe(true);
    expect(b).toEqual(a);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mla-pause')).toBeHidden();
    await expect.poll(() => H(page, 'return H.runTime'), POLL).toBeGreaterThan(a.t);
    // reiniciar: vuelve a la plaza con vida completa
    await H(page, "D.goto('castillo','sur'); D.setHP(2); return 1");
    await page.keyboard.press('Escape');
    await page.locator('.mla-pause [data-a="restart"]').click();
    await expect(page.locator('.mla-pause')).toBeHidden();
    const r = await H(page, 'return { s: H.state, sc: H.scene, hp: H.hp, max: H.maxHp, t: H.runTime }');
    expect(r.s).toBe('play'); expect(r.sc).toBe('aldea'); expect(r.hp).toBe(r.max); expect(r.t).toBeLessThan(1);
    expectNoErrors(errors);
  });

  test('derrota y victoria: pantallas, telemetría y vuelta al juego', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile, { god: false });
    await H(page, "D.goto('bosque','oeste'); D.defeatNow(); D.simulate(1.6); return 1");
    await expect(page.locator('#ra-end')).toBeVisible();
    await expect(page.locator('#ra-end h1')).toContainText('TE DESMAYASTE');
    expect(await H(page, 'return H.state')).toBe('defeat');
    expect((await sdk(page)).telemetry).toContain('end');
    if (isMobile) await page.locator('#ra-end [data-retry]').tap(); else await page.locator('#ra-end [data-retry]').click();
    await expect.poll(() => H(page, 'return H.state'), POLL).toBe('play');
    expect(await H(page, 'return [H.scene, H.hp === H.maxHp]')).toEqual(['aldea', true]);
    await H(page, 'D.manual(true); D.victory(); return 1');
    await expect(page.locator('#ra-end h1')).toContainText('VICTORIA');
    expect(await H(page, 'return [H.state, H.save.victory, H.save.wins]')).toEqual(['victory', true, 1]);
    expectNoErrors(errors);
  });

  test('cámara: nunca atraviesa paredes (interiores y junto a edificios)', async ({ page, isMobile }) => {
    const { errors } = await play(page, isMobile);
    const r = await H(page, `
      const out = [];
      for (const id of ['herreria','taberna','curandera','biblioteca','trono','torre']) {
        D.goto(id);
        for (const yaw of [0, 1.6, 3.1, 4.7]) {
          D.teleport(0, 1); D.setCam(yaw); D.simulate(0.6);
          const c = H.camera, rm = H.room;
          out.push({ id, inside: c.x >= rm.x0 - 0.5 && c.x <= rm.x1 + 0.5 && c.z >= rm.z0 - 0.5 && c.z <= rm.z1 + 0.5, clear: D.camClear() });
        }
      }
      // de espaldas a la herrería: la cámara se acerca en vez de atravesar la fachada
      D.goto('aldea','inicio'); D.teleport(-13, -4.6); D.setCam(Math.PI); D.simulate(1.5); out.push({ id: 'fachada', clear: D.camClear(), inside: H.camDist < 6 });
      return out;`);
    for (const o of r) { expect(o.inside, o.id).toBe(true); expect(o.clear, o.id).toBe(true); }
    expectNoErrors(errors);
  });

  for (const [w, h] of [[412, 915], [915, 412]]) {
    test(`layout celular ${w}×${h}: sin scroll ni HUD encimado`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'sólo en el proyecto móvil');
      await page.setViewportSize({ width: w, height: h });
      const { errors } = await openGame(page, DBG);
      await ready(page);
      // el menú entra sin scroll horizontal y el botón principal es tocable
      await expect(page.locator('#ra-menu [data-go]')).toBeInViewport();
      await start(page, true);
      await H(page, "D.manual(true); D.approach('door:herreria') || D.approach('pozo'); D.simulate(0.3); return 1");
      await expect(page.locator('#ra-prompt')).toBeVisible();
      const m = await page.evaluate(() => {
        const r = sel => { const e = document.querySelector(sel); if (!e || /** @type {HTMLElement} */ (e).hidden) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? b : null; };
        const over = (a, b) => !!a && !!b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        const els = { status: r('#ra-status'), side: r('#ra-side'), bar: r('.mla-bar'), joy: r('.k3-joy'), btns: r('.k3-btns'), prompt: r('#ra-prompt') };
        const pairs = [['status', 'side'], ['status', 'bar'], ['side', 'bar'], ['status', 'joy'], ['side', 'btns'], ['side', 'joy'], ['prompt', 'joy'], ['prompt', 'btns'], ['prompt', 'side'], ['prompt', 'status'], ['joy', 'btns']];
        return {
          scrollW: document.documentElement.scrollWidth, innerW: innerWidth, scrollH: document.documentElement.scrollHeight, innerH: innerHeight,
          missing: Object.keys(els).filter(k => !els[k]),
          overlaps: pairs.filter(([a, b]) => over(els[a], els[b])).map(p => p.join('/')),
          inside: Object.entries(els).filter(([, b]) => b && (b.left < -1 || b.right > innerWidth + 1 || b.top < -1 || b.bottom > innerHeight + 1)).map(([k]) => k),
        };
      });
      expect(m.scrollW).toBeLessThanOrEqual(m.innerW);
      expect(m.scrollH).toBeLessThanOrEqual(m.innerH);
      expect(m.missing).toEqual([]);
      expect(m.overlaps).toEqual([]);
      expect(m.inside).toEqual([]);
      expectNoErrors(errors);
    });
  }

  test('táctil: joystick mueve, el aviso se toca para interactuar y USAR abre la puerta', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'sólo en el proyecto móvil');
    const { errors } = await openGame(page, DBG);
    await ready(page);
    await start(page, true);
    await H(page, 'D.manual(true); D.simulate(0.2); return 1');
    await expect(page.locator('.k3-joy')).toBeVisible();
    await expect(page.locator('.k3-btn[aria-label="use"]')).toBeVisible();
    const box = await page.locator('.k3-joy').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const z0 = await H(page, 'return H.player.z');
    await touch(page, 'touchStart', cx, cy);
    await touch(page, 'touchMove', cx, cy - 30);
    await touch(page, 'touchMove', cx, cy - 55);
    await sim(page, 1.0);
    await touch(page, 'touchEnd', 0, 0);
    expect(await H(page, 'return H.player.z')).toBeLessThan(z0 - 1.5);
    // tocar el aviso: hablar con quien esté delante
    expect(await H(page, "D.goto('aldea','inicio'); D.approach('pozo'); D.simulate(0.2); return H.focus && H.focus.id")).toBe('pozo');
    await expect(page.locator('#ra-prompt')).toContainText('pozo');
    await page.locator('#ra-prompt').tap();
    await sim(page, 0.1);
    expect(await H(page, 'return H.toastText')).toContain('pozo');
    // USAR abre la puerta de la taberna
    await H(page, "D.approach('door:taberna'); D.simulate(0.2); return 1");
    await page.locator('.k3-btn[aria-label="use"]').tap();
    await sim(page, 0.8);
    expect(await H(page, 'return H.doors.taberna.state')).toBe('open');
    // y el aviso «Entrar» tocado lleva adentro
    await H(page, 'D.simulate(0.2); return 1');
    await page.locator('#ra-prompt').tap();
    await sim(page, 0.8);
    expect(await H(page, 'return H.scene')).toBe('taberna');
    expectNoErrors(errors);
  });

  test('rendimiento: zonas a demanda, interiores separados y conteos acotados', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'mediciones en escritorio');
    const { errors } = await play(page, false);
    const r = await H(page, `
      const out = {};
      for (const [z, sp] of [['aldea','inicio'],['castillo','sur'],['bosque','oeste'],['campos','norte'],['herreria'],['trono'],['cueva']]) {
        D.goto(z, sp); D.simulate(0.3);
        out[z] = { calls: H.perf.calls, tris: H.perf.tris, build: Math.round(H.buildMs), npcs: H.counts.npcs, scene: H.scene };
      }
      return out;`);
    for (const k in r) {
      expect(r[k].scene).toBe(k);
      expect(r[k].calls, k).toBeLessThan(260);
      expect(r[k].build, k).toBeLessThan(2500);
    }
    // una sola escena cargada a la vez (las demás se liberan)
    expect(await H(page, 'return H.loadedScenes')).toBe(1);
    expectNoErrors(errors);
  });
});
