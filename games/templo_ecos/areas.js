// @ts-check
/* Templo de los Ecos — los tres escenarios. Coordenadas en metros; +z es «sur» (hacia la cámara inicial). */
import * as THREE from 'three';
import { Level } from './level.js';
import { PAL, GeoBuilder, makeCrystal, makeHeart, glowMat } from './models.js';
import { colBox } from './physics.js';
import { createSentinel, createSpider, createSpectre } from './enemies.js';
import { createBoss } from './boss.js';
import { rng } from '../../matelabs/kit3d.js';

export const AREA_NAMES = { 1: 'Vestíbulo de Estatuas', 2: 'Salas de Resonancia', 3: 'Cámara del Guardián' };

/* ============================================================================
   1 · VESTÍBULO DE ESTATUAS — placas + bloques, puerta sellada, Sello del Eco, abismo temporizado
   ============================================================================ */
export function buildArea1(ctx) {
  const L = new Level(ctx, 1, AREA_NAMES[1]);
  L.env = { bg: 0x2b2117, fog: 0x2b2117, sky: 0xffe6b8, ground: 0x4a3524, hemi: 1.45, sun: 0xffd8a0, sunI: 1.9, sunDir: [7, 15, 9], dust: 0xffe0a8 };
  L.bounds = { x0: -12, x1: 17, z0: -40, z1: 20 };
  const S = L.S;
  // --- sala de estatuas
  L.floor(-9, -4, 9, 18);
  L.wall(-10, -5, -9, 19); L.wall(9, -5, 10, 6); L.wall(9, 10, 10, 19); L.wall(-10, 18, 10, 19, 1.4);
  L.wall(-10, -5, -1.8, -4); L.wall(1.8, -5, 10, -4);
  // sala secreta (este)
  L.floor(9, 6, 10, 10); L.floor(10, 5, 15, 11, 0, [0x9c8a6a, 0x8f7e60]);
  L.wall(15, 4, 16, 12); L.wall(10, 4, 16, 5); L.wall(10, 11, 16, 12);
  L.secretWall('s1', 9, 6, 10, 10, [10.4, 5, 15, 11]);
  L.codex('v3', 13.5, 1.1, 8);
  L.tablet(14, 5.9, 0, 'Sala del Primer Eco', 'Los constructores escondían salas tras muros agrietados. Si una pared brilla con una grieta turquesa, un Eco la derrumba.');
  L.torch(14.6, 2.2, 8);
  for (const z of [16, 12, 8, 4, 0]) L.statue(-8, z, Math.PI / 2, z % 8 === 0 ? 1 : 0);
  for (const z of [16, 12, 4, 0]) L.statue(8, z, -Math.PI / 2, z % 8 === 0 ? 0 : 1);
  L.column(-5.5, 13.5); L.column(5.5, 13.5); L.column(-6, 3); L.column(6, 3);
  L.codex('v1', -8, 1.1, 2);
  L.sunShaft(-3, 10); L.sunShaft(4, 4); L.sunShaft(0, -9, 6, 1.2);
  L.torch(-9.4, 2.2, 10); L.torch(9.4, 2.2, 14);
  L.brazier('a1_inicio', 2.5, 16.4, 0, 15, Math.PI);
  // puzle de presión: dos bloques + la exploradora
  L.plate('p1', -2, 6); L.plate('p2', 2, 6); L.plate('p3', 0, 1);
  L.block('b1', -4, 10); L.block('b2', 4, 10);
  L.solid(-3.5, 0, 16.6, 1.2, 0.9, 1.0, PAL.stoneDark);
  L.gb.box(-3.5, 0.92, 16.6, 0.8, 0.05, 0.6, 0x3fe8d6, 0, 0, false);
  L.interact({ id: 'reset:a1', x: -3.5, y: 1, z: 16.6, r: 2.0, key: 'reset', label: () => 'Reiniciar bloques', use: () => L.resetBlocks() });
  L.tablet(4.5, 16.8, 0, 'Inscripción del Vestíbulo', 'Tres pesos rompen el sello: dos de piedra y uno de carne. Empujá los bloques caminando contra ellos.');
  const door1 = L.door('a1_santuario', 0, -4.5, true);
  L.updaters.push(() => {
    const ok = L.plates.p1.down && L.plates.p2.down && L.plates.p3.down;
    door1.ready = ok || door1.open;
    if (ok && !door1.open) { L.openDoor('a1_santuario'); ctx.toast('¡El sello del santuario se quebró!'); ctx.emit('puzzle'); ctx.addScore(250); ctx.tip('sanctum'); }
  });
  // centinela que patrulla el frente de la puerta
  L.enemies.push(createSentinel(L, { path: [[-5.6, -1.4], [5.6, -1.4]] }));
  // --- santuario
  L.floor(-5, -14, 5, -4, 0, [0x9a8a70, 0x8c7c62]);
  L.wall(-6, -15, -5, -5); L.wall(5, -15, 6, -5); L.wall(-6, -15, -2, -14); L.wall(2, -15, 6, -14);
  L.statue(-3.6, -12.6, 0, 1); L.statue(3.6, -12.6, 0, 1);
  L.torch(-5.4, 2.2, -9); L.torch(5.4, 2.2, -9);
  L.relic('sello', 0, -10, 'Tomar el Sello del Eco');
  L.codex('v2', -3.8, 1.1, -6.5);
  if (!S.relics.sello) {
    const a = createSpider(L, { x: -3.2, z: -10.8, wake: 0 }), b = createSpider(L, { x: 3.5, z: -7, wake: 0 });
    L.enemies.push(a, b);
    L.onRelic = kind => { if (kind === 'sello') { a.wakeUp(); b.wakeUp(); } };
  }
  // --- cornisa y abismo con plataformas temporizadas
  L.floor(-3, -17.5, 3, -14);
  L.wall(-4, -17.5, -3, -15); L.wall(3, -17.5, 4, -15);
  L.brazier('a1_abismo', 2.3, -16.6, 0, -16, Math.PI);
  L.timedPlatform(0, 0, -19.3, 2.4, 2.2, { period: 3.4, offset: 0 });
  L.timedPlatform(1.6, 0, -22.4, 2.4, 2.2, { period: 3.4, offset: 2.5 });
  L.timedPlatform(-0.8, 0, -25.5, 2.4, 2.2, { period: 3.4, offset: 1.6 });
  for (const [x, z, top] of [[-4.5, -20, -0.6], [4.6, -24, -1.4], [-5, -27, -2.4]]) { L.sb.cyl(x, (top - 12) / 2, z, 0.5, 0.6, top + 12, 8, PAL.sand); L.sb.box(x, top + 0.15, z, 1.3, 0.3, 1.3, PAL.stone); }
  L.trigger(-3, -27, 3, -17.6, () => ctx.tip('timed'));
  // --- otra orilla y portal al siguiente escenario
  L.floor(-4, -35, 4, -27.4);
  L.wall(-5, -36, -4, -27.4); L.wall(4, -36, 5, -27.4); L.wall(-5, -36, -1.8, -35); L.wall(1.8, -36, 5, -35);
  const gate = L.door('a1_portal', 0, -35.5, true);
  L.updaters.push(() => { gate.ready = !!S.relics.sello; });
  L.interact({
    id: 'gate:a1', x: 0, y: 1, z: -34.4, r: 2.4, key: 'gate',
    label: () => S.relics.sello ? 'Abrir con el Sello del Eco' : 'Puerta sellada (falta el Sello)',
    can: () => !gate.open,
    use: () => { if (S.relics.sello) { L.openDoor('a1_portal'); ctx.addScore(100); } else ctx.toast('Necesitás el Sello del Eco del santuario.'); },
  });
  L.floor(-1.8, -40, 1.8, -35);
  L.wall(-2.8, -40, -1.8, -36); L.wall(1.8, -40, 2.8, -36); L.wall(-2.8, -41, 2.8, -40);
  L.spawns.a1_portal = { x: 0, y: 0, z: -32, ry: 0 };
  L.trigger(-1.8, -40, 1.8, -36.3, () => ctx.gotoArea(2, 'a2_inicio'));
  L.torch(-4.4, 2.2, -31); L.torch(4.4, 2.2, -31);
  return L;
}

/* ============================================================================
   2 · SALAS DE RESONANCIA — hub + Sala de Luz (espejos), Sala del Eco (sonido), Sala del Vacío (plataformas)
   ============================================================================ */
const CRYSTALS = [
  { color: 0xff6b6b, f: 440, name: 'rojo', glyph: '▲' },
  { color: 0xffc35a, f: 554, name: 'ámbar', glyph: '●' },
  { color: 0x3fe8d6, f: 659, name: 'turquesa', glyph: '◆' },
  { color: 0xb06cff, f: 880, name: 'violeta', glyph: '■' },
];
export { CRYSTALS };

export function buildArea2(ctx) {
  const L = new Level(ctx, 2, AREA_NAMES[2]);
  L.env = { bg: 0x0e1c22, fog: 0x0e1c22, sky: 0xbfeeff, ground: 0x1b2b2c, hemi: 1.35, sun: 0xcfe8ff, sunI: 1.5, sunDir: [-6, 15, 7], dust: 0xa8f0ff };
  L.bounds = { x0: -27, x1: 36, z0: -27, z1: 17 };
  const S = L.S, T = PAL;
  const cool = [0x8f9a98, 0x83908e], cool2 = [0x7d8f96, 0x72838a];
  // --- pasillo de entrada
  L.floor(-2.5, 9, 2.5, 17, 0, cool);
  L.wall(-3.5, 10, -2.5, 17); L.wall(2.5, 10, 3.5, 17); L.wall(-3.5, 17, 3.5, 18, 1.4, 0x9fa7a0);
  L.brazier('a2_inicio', 1.6, 14.6, 0, 13.4, Math.PI);
  L.interact({ id: 'back:a2', x: 0, y: 1, z: 16.3, r: 1.8, key: 'gate', label: () => 'Volver al Vestíbulo', use: () => ctx.gotoArea(1, 'a1_portal') });
  L.gb.box(0, 0.75, 16.95, 2.2, 1.2, 0.1, 0x2a6f80, 0, 0, false);
  // --- hub
  L.floor(-10, -10, 10, 10, 0, cool);
  const W = 0xa59f8e;
  L.wall(-10, 9, -8, 10, 2.8, W); L.wall(-4, 9, -2.5, 10, 2.8, W); L.wall(2.5, 9, 10, 10, 2.8, W);
  L.wall(-10, -10, -2, -9, 2.8, W); L.wall(2, -10, 10, -9, 2.8, W);
  L.wall(-10, -9, -9, -2, 2.8, W); L.wall(-10, 2, -9, 9, 2.8, W);
  L.wall(9, -9, 10, -2, 2.8, W); L.wall(9, 2, 10, 9, 2.8, W);
  L.column(-5, -5); L.column(5, -5); L.column(-5, 5); L.column(5, 5);
  L.statue(-8, 7.6, Math.PI * 0.75, 1); L.statue(8, 7.6, -Math.PI * 0.75, 0);
  L.torch(-9.4, 2.2, -6); L.torch(9.4, 2.2, -6);
  L.codex('r_hub', 7.6, 1.1, -7.4);
  // sello central (descenso a la Cámara)
  L.sb.cyl(0, 0.05, 0, 3.2, 3.3, 0.1, 12, 0x6c7270);
  const lampMats = {};
  ['luz', 'eco', 'vacio'].forEach((k, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
    const m = glowMat(S.rooms[k] ? 0x3fe8d6 : 0x33403f);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 6), m); mesh.position.set(Math.cos(a) * 2.1, 0.16, Math.sin(a) * 2.1);
    L.group.add(mesh); lampMats[k] = m;
  });
  const ringM = glowMat(0x1f5f5a); const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.06, 4, 40), ringM); ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; L.group.add(ring);
  const solvedCount = () => ['luz', 'eco', 'vacio'].filter(k => S.rooms[k]).length;
  L.updaters.push(() => { ringM.color.setHex(solvedCount() === 3 ? 0x3fe8d6 : 0x1f5f5a); });
  L.interact({
    id: 'seal:a2', x: 0, y: 0.5, z: 0, r: 2.6, key: 'seal',
    label: () => solvedCount() === 3 ? 'Descender a la Cámara del Guardián' : `Sello central (${solvedCount()}/3 salas)`,
    use: () => { if (solvedCount() === 3) ctx.gotoArea(3, 'a3_inicio'); else ctx.toast('El sello pide la resonancia de las tres salas.'); },
  });
  L.spawns.a2_sello = { x: 0, y: 0, z: 4.2, ry: Math.PI };
  L.enemies.push(createSentinel(L, { path: [[-7, -6.8], [7, -6.8]] }));
  L.enemies.push(createSpider(L, { x: -6.5, z: 6.5, wake: 5, respawn: 30 }), createSpider(L, { x: 6.5, z: 2.8, wake: 5, respawn: 30 }));
  // sala secreta (suroeste)
  L.floor(-8, 10, -4, 15, 0, [0x6e7c80, 0x67747a]);
  L.wall(-9, 10, -8, 16); L.wall(-4, 10, -3.5, 16); L.wall(-9, 15, -3.5, 16);
  L.secretWall('s2', -8, 9, -4, 10, [-8, 10.3, -4, 15]);
  L.codex('r_secreto', -6, 1.1, 13);
  L.tablet(-6, 14.5, Math.PI, 'Bodega de los Afinadores', 'Aquí guardaban los diapasones. Dicen que el Guardián sólo teme a su propio eco devuelto.');
  L.torch(-6, 2.2, 15.4);

  const roomEnter = id => { if (!S.rooms[id]) ctx.roomStart(id); };
  const lamp = id => { lampMats[id].color.setHex(0x3fe8d6); };

  // --- SALA DE LUZ (oeste): emisor + 3 espejos + receptor
  L.floor(-25, -7, -10, 7, 0, [0xb5a079, 0xa79370]);
  L.wall(-26, -8, -25, 8); L.wall(-26, -8, -10, -7); L.wall(-26, 7, -10, 8);
  L.gb.box(-10.2, 3.05, 0, 0.3, 0.3, 3.6, 0xffc35a, 0, 0, false);
  L.emitter('emLuz', -14, -6.2, 0);
  L.mirror('m1', -14, 2, 0); L.mirror('m2', -21, 2, 0); L.mirror('m3', -21, -4, 2);
  L.column(-17.5, -0.6);
  L.receptor('rLuz', -16.5, -4, () => { if (!S.rooms.luz) { ctx.solveRoom('luz'); lamp('luz'); } });
  if (S.rooms.luz) { L.receptors.rLuz.lit = true; }
  L.enemies.push(createSpectre(L, { x: -19, z: 4.5, radius: 3 }));
  L.codex('r_luz', -24, 1.1, 6);
  L.tablet(-11.6, 5.2, -Math.PI / 2, 'Sala de Luz', 'El sol obedece al bronce. Girá cada espejo (de a octavos de vuelta) hasta que la luz toque el cristal. La luz también disuelve espectros.');
  L.torch(-25.4, 2.2, 0);
  L.trigger(-25, -7, -10.4, 7, () => roomEnter('luz'));

  // --- SALA DEL ECO (norte): melodía de cristales
  L.floor(-7, -25, 7, -10, 0, cool2);
  L.wall(-8, -26, -7, -10); L.wall(7, -26, 8, -10); L.wall(-8, -26, 8, -25);
  for (const x of [-6.6, 6.6]) for (const z of [-13, -17, -21]) { L.sb.cyl(x, 2.0, z, 0.22, 0.22, 4.0, 8, T.bronze); L.sb.cyl(x, 4.1, z, 0.35, 0.22, 0.3, 8, T.bronze); }
  L.statue(0, -23, 0, 0);
  L.gb.box(0, 4.0, -23, 0.4, 0.4, 0.4, 0xffe08a, 0, 0, false);
  const d = ctx.diff();
  const R = rng(1307 + d.melody * 31);
  const melody = []; for (let i = 0; i < d.melody; i++) { let k; do { k = Math.floor(R() * 4); } while (i && k === melody[i - 1]); melody.push(k); }
  const crystals = [];
  [[-4.5, -16.5], [-1.5, -18.8], [1.5, -18.8], [4.5, -16.5]].forEach(([x, z], i) => {
    L.solid(x, 0, z, 1.1, 0.9, 1.1, T.stoneDark);
    const c = makeCrystal(CRYSTALS[i].color, 0.42); c.mesh.position.set(x, 1.75, z); L.group.add(c.mesh);
    const cr = { i, x, z, mesh: c.mesh, mat: c.mat, flash: 0, bad: 0 };
    crystals.push(cr);
    L.interact({ id: 'crystal:' + i, x, y: 1, z, r: 1.9, key: 'crystal', label: () => `Tocar cristal ${CRYSTALS[i].name}`, can: () => echo.state !== 'play' && !S.rooms.eco, use: () => strike(i) });
  });
  const dots = [];
  for (let i = 0; i < melody.length; i++) {
    const m = glowMat(0x2a3a3a), mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), m);
    mesh.position.set((i - (melody.length - 1) / 2) * 0.42, 0.95, -21.9); L.group.add(mesh); dots.push(m);
  }
  const echo = { state: 'idle', i: 0, t: 0, step: 0, hint: false, melody, input: 0, heard: false };
  const playNote = k => { const c = crystals[k]; c.flash = 1; ctx.sfx.note(CRYSTALS[k].f); ctx.fx.burst(c.x, 2.3, c.z, CRYSTALS[k].color, 8, 1.5); ctx.noteCue(CRYSTALS[k]); };
  function startMelody() { if (S.rooms.eco) return; echo.state = 'play'; echo.step = 0; echo.t = 0.5; echo.input = 0; echo.heard = true; }
  function strike(k) {
    if (S.rooms.eco || echo.state === 'play') return;
    playNote(k);
    if (!echo.heard) { ctx.toast('Primero escuchá a la Estatua Cantora.', 1500); return; }
    if (melody[echo.input] === k) {
      echo.input++;
      if (echo.input >= melody.length) {
        echo.state = 'done'; ctx.solveRoom('eco'); lamp('eco');
        if (!echo.hint) ctx.emit('riddleNoHint');
      }
    } else {
      echo.input = 0; ctx.sfx.wrong(); crystals.forEach(c => { c.bad = 1; });
      ctx.toast('Nota equivocada: la melodía vuelve a empezar', 1500); ctx.emit('wrongNote');
      for (const e of eSpiders) e.wakeUp();
      echo.state = 'idle'; echo.t = 1.4; echo.replay = true;
    }
  }
  L.interact({ id: 'singer', x: 0, y: 1, z: -21.4, r: 2.4, key: 'singer', label: () => 'Escuchar la melodía', can: () => !S.rooms.eco && echo.state !== 'play', use: startMelody });
  L.tablet(5.6, -11.6, -Math.PI / 2, 'Tablilla de pistas', '', () => {
    echo.hint = true; ctx.emit('hintUsed');
    ctx.showText('Tablilla de pistas', 'Orden de la melodía: ' + melody.map(k => `<b style="color:#${CRYSTALS[k].color.toString(16).padStart(6, '0')}">${CRYSTALS[k].glyph} ${CRYSTALS[k].name}</b>`).join(' → '));
  });
  // la inscripción de pista reemplaza su texto por la secuencia (ver arriba)
  L.inters[L.inters.length - 1].label = () => 'Leer la tablilla de pistas';
  const eSpiders = [createSpider(L, { x: -5, z: -22.5, wake: 0, respawn: 25 }), createSpider(L, { x: 5, z: -22.5, wake: 0, respawn: 25 })];
  L.enemies.push(...eSpiders);
  L.codex('r_eco', -5.6, 1.1, -11.6);
  L.torch(-7.4, 2.2, -19); L.torch(7.4, 2.2, -19);
  L.trigger(-7, -25, 7, -10.4, () => roomEnter('eco'));
  L.updaters.push(dt => {
    if (echo.state === 'play') {
      echo.t -= dt;
      if (echo.t <= 0) {
        if (echo.step < melody.length) { playNote(melody[echo.step]); echo.step++; echo.t = 0.75; }
        else { echo.state = 'idle'; ctx.toast('Tu turno: tocá los cristales en el mismo orden', 1800); }
      }
    } else if (echo.replay && echo.state === 'idle') { echo.t -= dt; if (echo.t <= 0) { echo.replay = false; startMelody(); } }
    for (const c of crystals) {
      c.flash = Math.max(0, c.flash - dt * 2.2); c.bad = Math.max(0, c.bad - dt * 1.5);
      c.mat.emissiveIntensity = S.rooms.eco ? 1.2 : 0.25 + c.flash * 2.5;
      c.mat.emissive.setHex(c.bad > 0.05 ? 0xff2020 : CRYSTALS[c.i].color);
      c.mesh.position.y = 1.75 + c.flash * 0.25; c.mesh.rotation.y += dt * (0.4 + c.flash * 4);
    }
    dots.forEach((m, i) => m.color.setHex(S.rooms.eco || i < echo.input ? 0x3fe8d6 : 0x2a3a3a));
  });
  L.echo = echo;

  // --- SALA DEL VACÍO (este): plataformas temporizadas/móviles, Plumas del Viento, puente
  L.floor(10, -4, 14, 4, 0, cool);
  L.wall(10, -5, 14, -4); L.wall(10, 4, 14, 5);
  L.brazier('a2_vacio', 12.8, -3.0, 11.6, 0, Math.PI / 2);
  L.timedPlatform(15.9, 0, 0, 2.2, 2.4, { period: 3.2, offset: 0, on: 0.6 });
  L.movingPlatform(19.5, 0, 0, 2.2, 2.2, { az: 1, amp: 1.3, speed: 1.2 });
  L.timedPlatform(23.1, 0, -1.2, 2.2, 2.4, { period: 3.2, offset: 1.5, on: 0.6 });
  L.floor(25.4, -2.0, 27.6, 0.2, 0.9, [0xa0a6a2, 0x9aa09c]);
  L.floor(28.6, -4, 34, 4, 1.0, cool2);
  L.wall(34, -5, 35, 5); L.wall(28.6, -5, 35, -4); L.wall(28.6, 4, 35, 5);
  L.relic('plumas', 32.6, -2.3, 'Tomar las Plumas del Viento', 1);
  L.solid(31.6, 1, 2.3, 1.6, 1.8, 1.6, T.stone);
  L.codex('r_vacio', 31.6, 3.9, 2.3);
  L.plate('pv', 29.8, 0, 1);
  L.torch(34.4, 3.2, 0);
  L.enemies.push(createSpider(L, { x: 31, z: 0.5, y: 1, wake: 4.5, respawn: 0 }));
  // puente escalonado que sube al resolver la sala
  const bridge = [];
  const steps = [[14, 18.4, 0], [18.4, 22.4, 0.33], [22.4, 25.6, 0.66], [25.6, 28.8, 1.0]];
  for (const [x0, x1, y] of steps) {
    const b = new GeoBuilder(77 + x0); b.box((x0 + x1) / 2, y - 0.3, 3.15, x1 - x0, 0.6, 1.5, 0xb8ab8c, 0.05); b.box((x0 + x1) / 2, y - 0.9, 3.15, (x1 - x0) * 0.8, 0.6, 0.9, PAL.stoneDark);
    const mesh = new THREE.Mesh(b.build(), ctx.mats.stone); mesh.castShadow = mesh.receiveShadow = true; L.group.add(mesh);
    const c = colBox((x0 + x1) / 2, y - 0.6, 3.15, x1 - x0, 0.6, 1.5, 'floor'); L.cols.push(c);
    bridge.push({ mesh, c, y });
  }
  let bridgeT = S.rooms.vacio ? 1 : 0;
  L.updaters.push(dt => {
    const goal = S.rooms.vacio ? 1 : 0;
    if (bridgeT < goal) bridgeT = Math.min(1, bridgeT + dt / 1.6);
    for (const b of bridge) { b.mesh.position.y = (bridgeT - 1) * 6; b.mesh.visible = bridgeT > 0; b.c.on = bridgeT >= 1; }
    if (L.plates.pv.down && !S.rooms.vacio) { ctx.solveRoom('vacio'); lamp('vacio'); ctx.toast('¡Un puente emerge del vacío!'); ctx.sfx.door(); }
  });
  L.trigger(10.4, -4, 35, 4, () => roomEnter('vacio'));
  L.trigger(14.6, -4, 28, 4, () => ctx.tip(S.relics.plumas ? 'double' : 'timed'));
  L.spawns.a2_portal3 = L.spawns.a2_sello;
  return L;
}

/* ============================================================================
   3 · CÁMARA DEL GUARDIÁN — arena circular, pilares (cobertura), 3 resonadores, Corazón del Templo
   ============================================================================ */
export function buildArea3(ctx) {
  const L = new Level(ctx, 3, AREA_NAMES[3]);
  L.env = { bg: 0x1a0e16, fog: 0x1a0e16, sky: 0xffc0b0, ground: 0x2a1424, hemi: 1.3, sun: 0xffb0a0, sunI: 1.4, sunDir: [5, 16, 6], dust: 0xffb0c8 };
  L.bounds = { x0: -17, x1: 17, z0: -17, z1: 27 };
  const S = L.S;
  const tiles = [0x8e7a72, 0x84706a];
  // pasillo
  L.floor(-2.5, 13, 2.5, 26, 0, tiles);
  L.wall(-3.5, 14, -2.5, 26); L.wall(2.5, 14, 3.5, 26); L.wall(-3.5, 26, 3.5, 27, 1.4);
  L.brazier('a3_inicio', 1.6, 23.4, 0, 21.4, Math.PI);
  L.interact({ id: 'back:a3', x: 0, y: 1, z: 25.3, r: 1.8, key: 'gate', label: () => 'Volver a las Salas de Resonancia', can: () => !L.boss.active, use: () => ctx.gotoArea(2, 'a2_sello') });
  L.gb.box(0, 0.75, 25.95, 2.2, 1.2, 0.1, 0x80303a, 0, 0, false);
  // arena circular
  for (let z = -15; z < 15; z += 2) {
    const zc = z + 1, w = Math.floor(Math.sqrt(Math.max(0, 15.2 * 15.2 - zc * zc)) / 2) * 2;
    if (w > 0) L.floor(-w, z, w, z + 2, 0, tiles);
  }
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.2) continue;
    const x = Math.sin(a) * 16, z = Math.cos(a) * 16;
    const pc = colBox(x, -1, z, 3.0, 11, 3.0, 'wall'); pc.vt = 4.2; L.cols.push(pc);
    L.sb.add(new THREE.BoxGeometry(3.0, 4.2, 1.2), i % 3 ? 0x9a8079 : 0x8a6f6a, [Math.sin(a) * 15.8, 2.1, Math.cos(a) * 15.8], [0, a, 0]);
    if (i % 3 === 0) L.sb.add(new THREE.BoxGeometry(1.0, 6.5, 1.0), 0x6c5550, [Math.sin(a) * 15.2, 3.25, Math.cos(a) * 15.2], [0, a, 0]);
  }
  // glifos concéntricos en el piso
  const g1 = new THREE.Mesh(new THREE.RingGeometry(5.9, 6.1, 64), glowMat(0x5a2240)); g1.rotation.x = -Math.PI / 2; g1.position.y = 0.02; L.group.add(g1);
  const g2 = new THREE.Mesh(new THREE.RingGeometry(11.9, 12.1, 64), glowMat(0x5a2240)); g2.rotation.x = -Math.PI / 2; g2.position.y = 0.02; L.group.add(g2);
  L.floorGlyphs = [g1, g2];
  // pilares (cobertura contra el drenaje)
  for (const [x, z] of [[5.3, 5.3], [-5.3, 5.3], [5.3, -5.3], [-5.3, -5.3]]) {
    L.solid(x, 0, z, 1.6, 6, 1.6, 0x9a8476); L.sb.box(x, 6.15, z, 2.1, 0.3, 2.1, PAL.bronze); L.gb.box(x, 2.6, z + (z > 0 ? -0.82 : 0.82), 0.5, 0.5, 0.04, 0xc27dff, 0, 0, false);
  }
  const gate = L.door('a3_puerta', 0, 13.7, true, { w: 4.4, persist: false });
  gate.open = true; gate.t = 1; gate.col.on = false; gate.slab.visible = false;
  L.torch(-2.9, 2.2, 18); L.torch(2.9, 2.2, 18);
  L.torch(-10.6, 3, -10.6); L.torch(10.6, 3, -10.6);
  L.codex('g_camara', -9.5, 1.1, -9.5);
  // resonadores: emisor (obelisco) + espejo + placa
  const shutters = { E: 0, W: 0, N: 0 }, done = { E: false, W: false, N: false };
  const bossOn = () => L.boss && L.boss.phase === 2;
  const res = {
    E: { em: [10, 3.5, Math.PI], mirror: [10, 0, 1], plate: [12.6, 0] },
    W: { em: [-10, 3.5, Math.PI], mirror: [-10, 0, 3], plate: [-12.6, 0] },
    N: { em: [3.5, -10, -Math.PI / 2], mirror: [0, -10, 3], plate: [0, -12.6] },
  };
  for (const k of /** @type {const} */ (['E', 'W', 'N'])) {
    const r = res[k];
    L.emitter('em' + k, r.em[0], r.em[1], r.em[2], () => done[k] || (bossOn() && shutters[k] > 0));
    L.mirror('r' + k, r.mirror[0], r.mirror[1], r.mirror[2], { persist: false, can: () => L.boss && L.boss.phase >= 1 && L.boss.phase <= 2 });
    L.plate('p' + k, r.plate[0], r.plate[1]);
  }
  L.updaters.push(dt => {
    for (const k of /** @type {const} */ (['E', 'W', 'N'])) {
      const p = L.plates['p' + k];
      if (bossOn() && p.down && !done[k]) { if (shutters[k] <= 0) { ctx.sfx.door(); ctx.emit('resonator'); } shutters[k] = 10; }
      shutters[k] = Math.max(0, shutters[k] - dt);
      const e = L.emitters.find(x => x.id === 'em' + k);
      if (e) { e.shutter.visible = !(done[k] || (bossOn() && shutters[k] > 0)); e.diskMat.color.setHex(done[k] ? 0x7ffff0 : 0xffd27a); }
      p.ringMat.color.setHex(done[k] ? 0x7ffff0 : shutters[k] > 0 ? (shutters[k] < 3 && Math.sin(L.time * 12) > 0 ? 0xff8a3d : 0xffd27a) : p.down ? 0x3fe8d6 : 0x6a5a40);
    }
  });
  // corazón y guardián
  const heart = makeHeart(); heart.group.position.set(0, 12, 0); L.group.add(heart.group);
  L.heart = heart;
  L.boss = createBoss(L, {
    heart,
    resetResonators() { for (const k in shutters) { shutters[k] = 0; done[k] = false; } const idx = { E: 1, W: 3, N: 3 }; for (const k in idx) { const m = L.mirrors['r' + k]; m.idx = idx[k]; m.target = m.ang = idx[k] * Math.PI / 4; m.pivot.rotation.y = m.ang; } },
    resonatorDone(k) { done[k] = true; },
  });
  L.beamTargets.push({ x: 0, z: 0, r: 2.4, hitNow: false, src: '', active: () => L.boss.phase === 2, hit(dt) { L.boss.beamHit(dt, this.src); } });
  L.pulseListeners.push((x, z) => L.boss.onPulse(x, z));
  L.interact({
    id: 'heart', x: 0, y: 1, z: 0, r: 3.0, key: 'heart',
    label: () => 'Desactivar el Corazón del Templo',
    can: () => L.boss.phase === 4 && L.boss.sub === 'gone' && !L.heartOff,
    use: () => { L.heartOff = true; ctx.heartOff(); },
  });
  L.trigger(-14, -14, 14, 11.6, () => { if (!S.bossDone && L.boss.phase === 0) ctx.startBoss(); });
  if (S.bossDone) {
    L.boss.phase = 4; L.boss.sub = 'gone'; L.boss.dead = true; L.boss.G.group.visible = false; L.boss.col.on = false; L.boss.heartY = 1.9; L.heartOff = true;
    heart.mat.color.setHex(0x3fe8d6); heart.mat.emissive.setHex(0x1fa89c);
    g1.material.color.setHex(0x3fe8d6); g2.material.color.setHex(0x3fe8d6);
  }
  L.spawns.a3_arena = { x: 0, y: 0, z: 11, ry: Math.PI };
  return L;
}
