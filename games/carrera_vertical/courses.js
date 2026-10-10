// @ts-check
/* Carrera Vertical — los cuatro circuitos. Cada uno avanza hacia -Z. Las alturas son absolutas (m).
   Alcances de referencia (Normal): salto 1.8 m de alto / ~5.4 m corriendo / ~7.3 m al sprint; cornisa +2.3 m sobre los pies;
   trepada de pared +2.7 m; impulso horizontal ~11 m; lanzador vertical +6.4 m. */

export const THEMES = {
  dawn: {
    sky: [0x6fa8e0, 0xf3c4a2, 0xffe6c8], fog: 0xf0cbb0, fogNear: 70, fogFar: 300,
    sun: 0xffd6a0, sunI: 2.3, sunDir: [-45, 32, -70], hemiSky: 0xfff0dd, hemiGround: 0x6b5a50, hemiI: 1.25,
    facades: [0xe8b48a, 0xdac8aa, 0x9fc5c0, 0xe3a07a, 0xcdbbd8, 0xf0d9a0], roof: 0x8f877c, trim: 0xfff3e0, emissive: 0.12,
    ground: 0x4a4650, groundY: -40, disc: 0xfff0c8, discSize: 34, stars: false, neon: [0xff7a2f, 0x46c8ff, 0xffd23a],
  },
  neon: {
    sky: [0x07051a, 0x1e0e44, 0x5a1a6a], fog: 0x2a1048, fogNear: 50, fogFar: 240,
    sun: 0xb8c4ff, sunI: 1.7, sunDir: [30, 60, -40], hemiSky: 0x9a8aff, hemiGround: 0x40205a, hemiI: 1.9,
    facades: [0x4a5070, 0x3c4262, 0x5a5480, 0x384a62, 0x4f4566], roof: 0x464b60, trim: 0x46f0ff, emissive: 1.35, playerLight: 0xa8eeff,
    ground: 0x120a1e, groundY: -60, disc: 0xdfe6ff, discSize: 16, stars: true, neon: [0xff3dbb, 0x46f0ff, 0xb46bff, 0xffd23a],
  },
  port: {
    sky: [0x587d98, 0xaac0c8, 0xf0dcc0], fog: 0xb8c6c8, fogNear: 70, fogFar: 260,
    sun: 0xffe2b0, sunI: 1.9, sunDir: [55, 35, -50], hemiSky: 0xdfeef5, hemiGround: 0x4a5a5a, hemiI: 1.15,
    facades: [0x8a9aa8, 0xa59a8a, 0x7a8a7a, 0xb0a48c], roof: 0x7d8288, trim: 0xffd23a, emissive: 0.18,
    ground: 0x2a5a78, groundY: 0, sea: true, disc: 0xfff2d8, discSize: 26, stars: false, neon: [0xffd23a, 0xff7a2f, 0x46c8ff],
    containers: [0xc8432f, 0x2f6fb5, 0xe0a42a, 0x3f8f5a, 0xdedede, 0x8a3fb5, 0xd06a2a],
  },
  sunset: {
    sky: [0x34266a, 0xff7a4a, 0xffc46a], fog: 0xe8906a, fogNear: 60, fogFar: 260,
    sun: 0xffa060, sunI: 2.1, sunDir: [-8, 14, -100], hemiSky: 0xffd2b4, hemiGround: 0x4a2a3a, hemiI: 1.3, playerLight: 0xffc890,
    facades: [0xe0a07a, 0x8a7aa0, 0xc0806a, 0x6a6a8a, 0xe8b88a], roof: 0x6e5e5e, trim: 0xffe0b0, emissive: 0.6,
    ground: 0x2a1a24, groundY: -40, disc: 0xffd090, discSize: 40, stars: false, neon: [0xff3dbb, 0xffd23a, 0x46f0ff],
  },
};

const PI = Math.PI;

/** @typedef {any} B constructor de circuito (ver world.js) */

export const COURSES = [
  {
    id: 'amanecer', name: 'Distrito del Amanecer', short: 'Amanecer', theme: 'dawn', par: 40, champ: 30, limit: 100,
    blurb: 'Azoteas cálidas para aprender: saltos, cornisas, carrera por pared, tirolina y el primer dron.',
    /** @param {B} b */
    build(b) {
      b.start(0, 12, 2);
      b.bld(0, 6, -26, 16, 12);
      b.ac(-5, 12, -6); b.ac(5.5, 12, -9, PI / 2); b.tank(-6, 12, -21);
      b.duct(0, 12, -17, 16, 1.0, 1.0);
      b.bld(0, -30, -46, 14, 12);
      b.clock('c1', 0, 14.2, -28);
      b.bld(0, -46, -64, 14, 15);
      b.ramp(5, 12, -36, -46, 3, 15);
      b.cp(0, 15, -54);
      b.clock('c2', -4, 16, -60);
      b.pad(0, 15, -59, PI, 'dash');
      // ruta alternativa: cornisa angosta por la izquierda
      b.box(-7.7, 11.4, -58, 1.4, 1.1, 28, 0x6a625a);
      b.alt('a1_cornisa', 'Cornisa angosta', [-8.4, 12.4, -62, -7.0, 14.6, -54], [-5.2, 13.6, -45.94, 0]);
      b.clock('c3', -7.7, 13.4, -66);
      b.bld(0, -70, -86, 12, 14);
      b.ac(-3.5, 14, -76);
      // carrera por pared sobre el hueco
      b.wall(5.0, 13, -91, 0.6, 6, 14, { arrows: -1 });
      b.bld(-2, -86.5, -95.5, 9, 8);
      b.clock('c4', -4.5, 9, -90);
      b.lift('l1', -2, 8, -94.3, 2.4, 2.2, 14);
      b.bld(1, -96, -126, 16, 14);
      // casilla del ascensor con puerta automática; arriba, atajo para quien trepa
      b.box(-3.7, 14, -109, 6.6, 4.5, 2, 0xd9c7a8, { pent: true });
      b.box(5.7, 14, -109, 6.6, 4.5, 2, 0xd9c7a8, { pent: true });
      b.box(1, 17.2, -109, 2.8, 1.3, 2, 0xd9c7a8, { pent: true });
      b.door('d1', 1, 14, -109, 2.8, 'x', { h: 3.2 });
      b.alt('a1_techo', 'Por arriba del ascensor', [-7, 18.4, -110, 9, 21, -108], [-3.7, 16.2, -107.94, 0]);
      b.clock('c5', 5.5, 19.4, -109);
      b.cp(1, 14, -115);
      b.drone([[-6, 19.5, -113], [8, 19.5, -113], [8, 19.5, -122], [-6, 19.5, -122]], 3);
      b.barrier('b1', 1, 14, -119.5, 16, 'lift', 'x', { speed: 1.4 });
      b.zip('z1', 4, 16.9, -124.6, 4, 12.6, -168);
      b.clock('c6', 4, 14.0, -146);
      b.bld(4, -164, -192, 14, 10.5);
      b.cp(4, 10.5, -172);
      b.drone([[-2, 15.5, -177], [10, 15.5, -186]], 3.2);
      b.ac(0, 10.5, -186);
      b.bld(4, -196, -214, 12, 10.5);
      b.pad(4, 10.5, -209.5, PI, 'launch');
      b.bld(4, -214, -236, 14, 18.5, { tint: 0xf0d9a0 });
      b.neon(4, 22.5, -213.9, 8, 1.6, 0xff7a2f, 0);
      b.goal(4, 18.5, -228);
      b.decor({ tanks: 6, antennas: 8 });
    },
  },
  {
    id: 'neon', name: 'Rascacielos de Neón', short: 'Neón', theme: 'neon', par: 50, champ: 38, limit: 120,
    blurb: 'De noche y en altura: trepadas, doble pared, torretas, barreras láser y la puerta exprés.',
    /** @param {B} b */
    build(b) {
      b.start(0, 30, 2);
      b.bld(0, 6, -20, 14, 30);
      b.barrier('b1', 0, 30, -12, 14, 'lift', 'x', { speed: 1.2 });
      b.bld(0, -25, -45, 12, 30);
      b.clock('c1', -3, 31.2, -35);
      b.bld(0, -45, -70, 14, 35);
      b.lift('l1', 4.6, 30, -43.6, 2.2, 2.2, 35);
      b.neon(0, 37, -44.9, 7, 1.4, 0xff3dbb, 0);
      b.cp(0, 35, -50);
      b.turret(5.5, 35, -67);
      b.ac(-2, 35, -58); b.ac(2.5, 35, -62, PI / 2);
      b.clock('c2', -5, 36, -64);
      // doble pared sobre el vacío (izquierda: hay que saltar de pared)
      b.wall(-2.6, 34, -73, 0.6, 6, 8, { arrows: 1 });
      b.wall(2.6, 34, -79, 0.6, 6, 8, { arrows: -1 });
      b.bld(0, -71, -81, 8, 28);
      b.pad(0, 28, -78.5, PI, 'launch');
      b.bld(0, -82, -112, 16, 35);
      b.drone([[-6, 40, -86], [6, 40, -93]], 3.4);
      // muro con puerta de seguridad (se traba con alarma) y puerta exprés (sólo al sprint)
      b.box(-4.6, 35, -96, 6.8, 5, 1.2, 0x2c3248, { pent: true });
      b.box(3.6, 35, -96, 4.8, 5, 1.2, 0x2c3248, { pent: true });
      b.box(7.8, 35, -96, 0.4, 5, 1.2, 0x2c3248, { pent: true });
      b.box(-0.0, 38.4, -96, 2.4, 1.6, 1.2, 0x2c3248, { pent: true });
      b.box(6.8, 38.4, -96, 1.6, 1.6, 1.2, 0x2c3248, { pent: true });
      b.door('d1', 0, 35, -96, 2.4, 'x', { h: 3.4, secure: true });
      b.door('d2', 6.8, 35, -96, 1.6, 'x', { h: 3.4, speed: 9.3 });
      b.alt('b_expres', 'Puerta exprés', [5.6, 35, -99, 8, 38, -97], [4.0, 37.4, -95.38, 0]);
      b.cp(0, 35, -104);
      b.zip('z1', -4, 37.9, -110.6, -4, 32.5, -150);
      b.clock('c3', -4, 34.2, -130);
      b.bld(-4, -147, -173.5, 14, 30.5);
      b.barrier('b2', -4, 30.5, -156, 14, 'sweep', 'x', { range: 3, speed: 1.1 });
      b.barrier('b3', -4, 30.5, -163, 14, 'lift', 'x', { phase: 1.6, speed: 1.3 });
      b.box(-10, 30.5, -148.6, 1.8, 1, 1.8, 0x2c3248);
      b.turret(-10, 31.5, -148.6);
      b.clock('c4', -9, 31.5, -160);
      b.cp(-4, 30.5, -168);
      b.bld(-4, -173.5, -190, 12, 37);
      b.lift('l2', -4, 30.5, -172.4, 2.2, 2.0, 37);
      b.ac(-8.5, 30.5, -172, PI / 2);
      b.alt('b_grieta', 'Trepada de servicio', [-10, 36.9, -177, -7, 39.5, -173.5], [-8.5, 34, -173.44, 0]);
      b.clock('c5', -8.5, 38, -180);
      b.drone([[-9, 42, -177], [1, 42, -187]], 3.6);
      b.pad(0.1, 37, -185, PI, 'dash');
      b.wall(1.0, 34.5, -196, 0.6, 6.5, 14, { arrows: -1 });
      b.clock('c6', 0.1, 38.4, -196);
      b.bld(-4, -202, -224, 12, 35, { tint: 0x4a4466 });
      b.neon(-4, 39.5, -201.9, 9, 1.8, 0x46f0ff, 0);
      b.goal(-4, 35, -216);
      b.decor({ tanks: 2, antennas: 14, signs: 14 });
    },
  },
  {
    id: 'puerto', name: 'Grúas del Puerto', short: 'Puerto', theme: 'port', par: 50, champ: 37, limit: 120,
    blurb: 'Contenedores, brazos de grúa, dos tirolinas, la cubierta del barco y un túnel secreto.',
    /** @param {B} b */
    build(b) {
      b.start(0, 10, 2);
      b.bld(0, 6, -18, 16, 10, { warehouse: true });
      b.stack(0, -20.5, -26.5, 5.2, 4);
      b.stack(-1.5, -28, -34, 5.2, 3);
      b.clock('c1', -1.5, 8.9, -31);
      b.ramp(-0.25, 7.8, -29.5, -35.5, 2.3, 10.4, { color: 0x6e737a });
      b.stack(1, -35.5, -41.5, 5.2, 4);
      b.stack(0, -43.5, -49.5, 5.2, 5);
      b.cp(0, 13, -47);
      b.box(9, 0, -32, 2.4, 10, 2.4, 0x7d8288);
      b.turret(9, 10, -32);
      // grúa 1: ascensor de jaula y brazo como pasarela
      b.platform(-8, 13, -51.5, 6, 3);
      b.lift('l1', -7, 13, -51.5, 2.0, 2.2, 22);
      b.crane(-9, -54, 26, -50, -100, 22);
      b.barrier('b2', -9, 22, -72, 2.2, 'lift', 'x', { speed: 1.2 });
      b.clock('c2', -9, 23, -80);
      // barco: ruta alternativa por la cubierta
      b.ship(4, -56, -100, 12, 6);
      b.alt('c_cubierta', 'Cubierta del carguero', [-2, 6, -72, 10, 9, -64], [2.0, 14.3, -49.3, 0]);
      b.clock('c3', 6, 7, -82);
      b.box(4, 6, -70, 2.4, 1.0, 1.2, 0xc8432f);
      b.box(1, 6, -88, 2.4, 1.1, 1.2, 0x2f6fb5);
      b.box(7.5, 6, -86, 2.6, 6, 6, 0xdedede);
      b.turret(7.5, 12, -86);
      b.pad(4, 6, -97.5, PI, 'launch');
      b.stack(4, -101, -109, 5.2, 5);
      b.zip('z2', 4, 16.1, -108.4, 0.5, 15.6, -136);
      b.zip('z1', -9, 24.3, -99.2, -3, 15.6, -138);
      b.clock('c4', -6.1, 19.0, -118);
      b.stack(-2, -134, -152, 12, 5.25, { flat: true });
      b.cp(-2, 13.65, -142);
      b.clock('c5', 2.5, 14.6, -148);
      b.bld(-2, -155, -190, 18, 12, { warehouse: true });
      b.tunnel(6, 12, -158, -174);
      b.alt('c_tunel', 'Túnel de contenedor', [4.8, 12, -168, 7.2, 14.4, -164], [6, 13.3, -157.9, 0]);
      b.clock('c6', 6, 12.9, -166);
      b.barrier('b1', -3.5, 12, -166, 15, 'sweep', 'x', { range: 4, speed: 0.9 });
      b.drone([[-9, 18, -160], [2, 18, -160], [2, 18, -180], [-9, 18, -180]], 3.6);
      b.cp(-2, 12, -184);
      b.pad(-2, 12, -188, PI, 'launch');
      b.bld(-2, -193, -212, 12, 19, { tint: 0xe8e2d0 });
      b.neon(-2, 23, -192.9, 8, 1.6, 0xffd23a, 0);
      b.goal(-2, 19, -204);
      b.decor({ cranes: 4, containers: 40 });
    },
  },
  {
    id: 'maestro', name: 'Circuito Maestro', short: 'Maestro', theme: 'sunset', par: 58, champ: 44, limit: 130, boss: true,
    blurb: 'La final del campeonato: escapá del Vigía Mayor por las azoteas, en tres fases.',
    /** @param {B} b */
    build(b) {
      b.start(0, 20, 2);
      b.bld(0, 8, -22, 16, 20);
      b.duct(0, 20, -14, 16, 1.0, 1.0);
      b.bld(0, -26, -44, 14, 20);
      b.barrier('b1', 0, 20, -36, 14, 'lift', 'x', { speed: 1.3 });
      b.clock('c1', 0, 22.3, -24);
      b.bld(1, -49, -66, 14, 19);
      b.ac(-3, 19, -55);
      b.pad(1, 19, -61.5, PI, 'dash');
      b.bld(0, -72, -92, 14, 18);
      b.clock('c2', 2, 19.4, -84);
      b.wall(5.0, 17, -97, 0.6, 6, 14, { arrows: -1 });
      b.box(-5, 17, -97, 1.3, 1, 10.5, 0x6a625a);
      b.alt('m_viga', 'Viga de equilibrio', [-5.7, 17.9, -99, -4.3, 20, -95], [-5.4, 19.2, -91.94, 0]);
      b.bld(1, -102, -124, 16, 18);
      b.cp(1, 18, -116);
      b.bld(-1, -127, -150, 18, 17);
      b.ac(-6, 17, -131); b.ac(3, 17, -134, PI / 2); b.ac(-1, 17, -137);
      b.box(-6.6, 17, -143, 6.8, 4.5, 2, 0xc0806a, { pent: true });
      b.box(4.6, 17, -143, 6.8, 4.5, 2, 0xc0806a, { pent: true });
      b.box(-1, 20.2, -143, 4.4, 1.3, 2, 0xc0806a, { pent: true });
      b.door('d1', -1, 17, -143, 4.4, 'x', { h: 3.2 });
      b.alt('m_techo', 'Sobre la sala de máquinas', [-10, 21.4, -144, 8, 24, -142], [-6.6, 19.2, -141.94, 0]);
      b.clock('c3', 6, 22.4, -143);
      b.bld(0, -154, -176, 16, 17);
      b.turret(6, 17, -173);
      b.clock('c4', -5, 18, -164);
      b.zip('z1', -3, 19.9, -175.4, -3, 14.6, -215);
      b.bld(-3, -211, -236, 14, 12.6);
      b.cp(-3, 12.6, -230);
      b.bld(-3, -240, -256, 14, 12.6);
      b.barrier('b2', -3, 12.6, -247, 14, 'lift', 'x', { speed: 1.5 });
      b.pad(-3, 12.6, -253, PI, 'launch');
      b.clock('c5', -3, 21, -258);
      b.bld(-2, -260, -278, 14, 19);
      b.pad(-5.8, 19, -273.5, PI, 'dash');
      b.bld(-2, -281, -298, 12, 18);
      b.pad(-6.0, 18, -294, PI, 'dash');
      b.wall(-6.7, 16.5, -303, 0.6, 6.5, 14, { arrows: 1 });
      b.clock('c6', -6.1, 19.2, -303);
      b.bld(-3, -308, -334, 16, 18.5, { tint: 0xe8b88a });
      b.neon(-3, 23, -307.9, 10, 2, 0xffd23a, 0);
      b.goal(-3, 18.5, -326);
      b.phases([0, 1, 2]);
      b.decor({ tanks: 6, antennas: 12, signs: 8 });
    },
  },
];

/** @param {string} id */
export const courseById = id => COURSES.find(c => c.id === id) || COURSES[0];
export const courseIndex = id => Math.max(0, COURSES.findIndex(c => c.id === id));
