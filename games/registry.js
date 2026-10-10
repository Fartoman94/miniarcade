// @ts-check
/* Registro de juegos de MiniArcade.
   Es la ÚNICA fuente de metadatos: el portal (index.html) y el SDK (matelabs/arcade.js)
   lo leen. Para sumar un juego nuevo: agregar su .html y una entrada acá; el núcleo no cambia.

   Campos:
   - id: identificador estable (también es la clave de puntajes y favoritos).
   - file: ruta del juego relativa a la raíz.
   - score: cómo se compara el récord ('high' = más es mejor, 'level' = nivel alcanzado, 'none').
   - legacyBestKey: clave de localStorage que el juego ya usaba antes del SDK (compatibilidad).
   - category: una de CATEGORIES.
   - tech: motor/render, para el filtro y la documentación.
   - added: fecha (AAAA-MM-DD) en que el juego entró al catálogo; alimenta «Nuevos» (dato real, no métrica). */

/** @typedef {{id:string,file:string,title:string,icon:string,accent:string,category:string,tags:string[],
 *   tech:string,description:string,controls:{pc:string,touch:string,gamepad?:string},
 *   score:'high'|'level'|'none',scoreLabel?:string,legacyBestKey?:string,orientation?:'any'|'landscape'|'portrait',
 *   heavy?:boolean, pick?:string, thumb?:string, added?:string}} GameMeta */

/** @type {Record<string,string>} */
export const CATEGORIES = {
  reflejos: 'Reflejos',
  accion: 'Acción',
  plataformas: 'Plataformas',
  carreras: 'Carreras',
  aventura: 'Aventura',
  estrategia: 'Estrategia',
  relajado: 'Relajado',
  puzles: 'Puzles',
};

/** @type {GameMeta[]} */
export const GAMES = [
  {
    id: 'clavado', thumb: 'games/thumbs/clavado.webp', file: 'clavado.html', title: '¡CLAVADO!', icon: '🔪', accent: '#ff6b5d',
    category: 'reflejos', tags: ['Un toque', 'PC + Android'], tech: 'Canvas 2D',
    description: 'Clavá cuchillos en troncos giratorios a través de 4 biomas: placas de acero y hielo, compuertas y un tronco jefe cada 5 niveles.',
    controls: { pc: 'Clic o Espacio para lanzar', touch: 'Tocá la pantalla para lanzar', gamepad: 'A para lanzar' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'clavado_best', orientation: 'any',
  },
  {
    id: 'fruta_furia', thumb: 'games/thumbs/fruta_furia.webp', file: 'fruta_furia.html', title: 'FRUTA FURIA', icon: '🍉', accent: '#8be07a',
    category: 'reflejos', tags: ['Deslizar', 'PC + Android'], tech: 'Canvas 2D',
    description: 'Deslizá el filo y hacé volar la fruta, pero no toques la bomba. Frutas especiales, oleadas y la Sandía Gigante como jefa.',
    controls: { pc: 'Arrastrá el mouse para cortar', touch: 'Deslizá el dedo para cortar' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'fruta_best', orientation: 'any',
  },
  {
    id: 'muerte_gloriosa', thumb: 'games/thumbs/muerte_gloriosa.webp', file: 'muerte_gloriosa.html', title: 'MUERTE GLORIOSA', icon: '🤕', accent: '#87ceeb',
    category: 'plataformas', tags: ['Parkour', '6 niveles'], tech: 'Canvas 2D',
    description: 'Parece un juego de caminar y saltar… pero el nivel te odia. 10 niveles en 2 actos, con la Grúa Loca y la Aplanadora.',
    controls: { pc: '← → caminar · Espacio saltar · R reiniciar nivel · Esc pausa', touch: 'Botones ◀ ▶ y SALTAR en pantalla', gamepad: 'Stick/cruceta mover · A saltar · X reiniciar nivel' },
    score: 'high', scoreLabel: 'niveles superados',
    pick: 'El nivel te odia, y el narrador también. Ideal para reírse.', legacyBestKey: 'mg_best', orientation: 'landscape',
  },
  {
    id: 'neon_survivor', thumb: 'games/thumbs/neon_survivor.webp', file: 'NEON_SURVIVOR.html', title: 'NEON SURVIVOR', icon: '🟣', accent: '#00ffff',
    category: 'accion', tags: ['Roguelite', 'Neón'], tech: 'Canvas 2D',
    description: 'Sobreviví a las hordas con disparo automático: 4 familias de enemigos, armas que evolucionan y el Coloso en 3 fases.',
    controls: { pc: 'WASD / Flechas para moverte · disparo automático · 1/2/3 para elegir mejora', touch: 'Arrastrá el dedo en cualquier lado (joystick)', gamepad: 'Stick para moverte · A elegir mejora' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'neonBest', orientation: 'any',
  },
  {
    id: 'salva_al_rey', thumb: 'games/thumbs/salva_al_rey.webp', file: 'Salva_al_rey.html', title: '¡SALVA AL REY!', icon: '👑', accent: '#c9a24b',
    category: 'accion', tags: ['3D', 'Oleadas'], tech: 'Three.js (WebGL)',
    description: 'Defendé el reino medieval en 3D: 10 oleadas, arqueros y trolls ariete, aldeanos para rescatar y 2 jefes con fases.',
    controls: { pc: 'WASD mover · clic o J golpear · Espacio saltar · Shift correr · Q/E cámara', touch: 'Joystick · botones ⚔️ y ⬆️ · deslizá la cámara', gamepad: 'Stick mover · A saltar · X golpear · B correr · LB/RB cámara' },
    score: 'level', scoreLabel: 'oleada', legacyBestKey: 'rey_best', orientation: 'landscape', heavy: true,
    pick: 'Defensa en 3D con noche que cae y faroles que se encienden.',
  },
  {
    id: 'torre_infinita', thumb: 'games/thumbs/torre_infinita.webp', file: 'torre_infinita.html', title: 'TORRE INFINITA', icon: '🧱', accent: '#ffd93d',
    category: 'reflejos', tags: ['Un toque', 'PC + Android'], tech: 'Canvas 2D',
    description: 'Apilá bloques y subí hasta la órbita: tormentas, piezas especiales, un bloque gigante y desafíos de estabilidad.',
    controls: { pc: 'Clic o Espacio para soltar el bloque', touch: 'Tocá la pantalla para soltar', gamepad: 'A para soltar' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'torre_best', orientation: 'any',
    pick: 'Un toque, una torre, y "una más" hasta las tres de la mañana.',
  },
  {
    id: 'turbo_furia', thumb: 'games/thumbs/turbo_furia.webp', file: 'turbo_furia.html', title: 'TURBO FURIA', icon: '🏁', accent: '#ff8c1a',
    category: 'carreras', tags: ['3D', 'Nitro'], tech: 'Three.js (WebGL)',
    description: 'Carreras 3D a toda velocidad: 9 autos (4 para desbloquear), modos Clásica, Contrarreloj y Duelo contra un rival, biomas de día y de noche, nitro y ranking local.',
    controls: { pc: '← → / A D carril · ↓ freno · Shift/Espacio nitro', touch: 'Deslizá o usá los botones', gamepad: 'Stick/cruceta carril · A nitro · X/LT freno' },
    score: 'high', scoreLabel: 'metros', legacyBestKey: 'turbo_best', orientation: 'any', heavy: true,
  },
  {
    id: 'valle_encantado', thumb: 'games/thumbs/valle_encantado.webp', file: 'valle_encantado.html', title: 'EL VALLE ENCANTADO', icon: '🧚', accent: '#ff8fb8',
    category: 'aventura', tags: ['3D', 'Exploración'], tech: 'Three.js (WebGL)',
    description: 'Un mundo de cuentos en 3D: misiones de 8 habitantes, 12 fragmentos de estrella, diario y mapa, 3 guardianes y el Rey Sombrío, o defendé el valle por oleadas.',
    controls: { pc: 'WASD mover · clic der. + arrastrar cámara · clic/Espacio golpear · E hablar · Shift correr', touch: 'Joystick · deslizá cámara · botón ⚔️ · 💬 hablar', gamepad: 'Stick izq. mover · stick der. cámara · A golpear · X/B hablar · Y diario · RB correr' },
    score: 'level', scoreLabel: 'oleada', legacyBestKey: 'valle_best', orientation: 'landscape', heavy: true,
  },
  {
    id: 'academia_dragones', thumb: 'games/thumbs/academia_dragones.webp', file: 'academia_dragones.html', title: 'ACADEMIA DE DRAGONES', icon: '🐉', accent: '#ff9f43',
    category: 'aventura', tags: ['3D', 'Vuelo'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Volá un dragón por picos, un lago espejo y un volcán: aros, carreras, rescates y la Serpiente de Tormenta en 3 fases.',
    controls: { pc: 'A/D girar · W/S morro · Espacio/C subir/bajar · Shift turbo · F o clic aliento', touch: 'Joystick dirección · botones ▲ ▼ altitud · 🔥 aliento · ⚡ turbo', gamepad: 'Stick dirección · A subir · B bajar · X/RT aliento · RB/LT turbo · Start pausa' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'templo_ecos', thumb: 'games/thumbs/templo_ecos.webp', file: 'templo_ecos.html', title: 'TEMPLO DE LOS ECOS', icon: '🏛️', accent: '#f5b84a',
    category: 'puzles', tags: ['Puzles de luz', 'Jefe final'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Guiá la luz con espejos, repetí melodías de cristal, cruzá plataformas que se desvanecen y devolvé los rayos del Guardián Eco.',
    controls: { pc: 'WASD mover · Espacio saltar · E usar · F eco · mouse/Q-R cámara', touch: 'Joystick + botones SALTO/USAR/ECO · arrastrar para girar la cámara', gamepad: 'Stick mover · A saltar · X usar · B eco · LB/RB cámara' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'guardianes_estelares', thumb: 'games/thumbs/guardianes_estelares.webp', file: 'guardianes_estelares.html', title: 'GUARDIANES ESTELARES', icon: '🚀', accent: '#ffb13b',
    category: 'accion', tags: ['Shooter 3D', 'Jefe final'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Shooter espacial 3D: escoltá convoyes entre asteroides, derribá transmisores y destruí al Destructor Némesis en 3 fases.',
    controls: { pc: 'WASD/mouse pilotear · Espacio/clic pulso · F/clic der. láser · Shift turbo · E escanear · Q objetivo', touch: 'Stick para pilotear · botones FUEGO, LÁSER, TURBO y SCAN', gamepad: 'Stick pilotear · A pulso · X láser · RB turbo · Y escanear · LB objetivo' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'granja_runas', thumb: 'games/thumbs/granja_runas.webp', file: 'granja_runas.html', title: 'GRANJA DE RUNAS', icon: '🌱', accent: '#86efac',
    category: 'relajado', tags: ['Granja 3D', 'Sin combate'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Plantá, regá y cosechá, vendé en el pueblo, buscá semillas raras en el bosque y rescatá la cosecha en la Estación de Tormentas.',
    controls: { pc: 'WASD mover · E usar · Q semilla · Z/X cámara · J diario · clic para ir y usar', touch: 'Joystick · USAR · 🌱 · ⟲ · 📖 · tocá objetos para ir y usarlos', gamepad: 'Stick mover · A usar · X semilla · LB/RB cámara · Y diario' },
    score: 'high', scoreLabel: 'puntos de granja', orientation: 'any', heavy: true,
  },
  {
    id: 'bastiones_elementales', thumb: 'games/thumbs/bastiones_elementales.webp', file: 'bastiones_elementales.html', title: 'BASTIONES ELEMENTALES', icon: '🏰', accent: '#8f7bff',
    category: 'estrategia', tags: ['Tower defense 3D', 'Jefe final'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Torres de fuego, hielo y rayo con sinergias, puentes que desvían la ruta enemiga y el Titán Elemental en 3 fases.',
    controls: { pc: 'Clic elegir/construir · arrastrar/WASD cámara · rueda zoom · Q/E girar · 1-4 torres · U mejorar · X vender · Espacio oleada', touch: 'Tocar para elegir · arrastrar, pellizcar y girar con dos dedos · botones ▶▶ oleada y x2', gamepad: 'Stick cámara · A elegir (retícula) · B cerrar · X mejorar · Y oleada · LB/RB girar · LT/RT zoom' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'derby_chatarra', thumb: 'games/thumbs/derby_chatarra.webp', file: 'derby_chatarra.html', title: 'DERBY DE CHATARRA', icon: '💥', accent: '#b8f52a',
    category: 'accion', tags: ['Demolición 3D', 'Jefe final'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Embestí, derrapá y saltá en 3 arenas con imanes, escudos y trampas, ganá el torneo y destruí al Triturador Omega.',
    controls: { pc: 'W/S acelerar-frenar · A/D girar · Espacio derrape · Shift nitro · E potenciador', touch: 'Volante + botones ACEL, FRENO, NITRO y PODER', gamepad: 'Stick girar · RT acelerar · LT frenar · A nitro · X potenciador · B derrape' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'arena_mutante', thumb: 'games/thumbs/arena_mutante.webp', file: 'arena_mutante.html', title: 'ARENA MUTANTE', icon: '☣️', accent: '#a6ff2e',
    category: 'accion', tags: ['Supervivencia 3D', 'Jefe final'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Supervivencia 3D en tercera persona: restablecé generadores, aguantá 6 oleadas mutantes y escapá del Coloso Radiactivo.',
    controls: { pc: 'WASD mover · mouse/flechas apuntar · clic/J disparar · Espacio rodar · E usar · Q pulso · F barricada · R recargar', touch: 'Doble stick (mover y apuntar) · FUEGO o disparo automático · RODAR · USAR · PULSO · BARR.', gamepad: 'Sticks mover y cámara · RT disparar · LT mira · A rodar · X usar · LB pulso · Y barricada · B recargar' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'carrera_vertical', thumb: 'games/thumbs/carrera_vertical.webp', file: 'carrera_vertical.html', title: 'CARRERA VERTICAL', icon: '🏃', accent: '#ff7a2f',
    category: 'plataformas', tags: ['Parkour 3D', 'Contrarreloj'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Corré por azoteas y paredes, colgate de tirolinas, batí a tu fantasma en tres distritos y escapá del dron jefe.',
    controls: { pc: 'WASD correr · Espacio saltar/trepar · Shift deslizar · F tirolina · R punto de control · mouse/Q-E cámara', touch: 'Joystick + botones SALTO/DESLIZ/ACCIÓN · arrastrar para mirar', gamepad: 'Stick correr · A saltar · B deslizar · X acción · Y punto de control · LB/RB cámara' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'mareas_profundas', thumb: 'games/thumbs/mareas_profundas.webp', file: 'mareas_profundas.html', title: 'MAREAS PROFUNDAS', icon: '🌊', accent: '#ffb547',
    category: 'aventura', tags: ['Exploración submarina', 'Jefe final'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Piloteá un minisubmarino con sonar, escaneá fauna, recuperá la caja negra y encendé el faro de la fosa ante el Leviatán.',
    controls: { pc: 'W/S avanzar · A/D girar · Espacio/Shift subir-bajar · E usar/escanear · Q sonar · C foto · L luz', touch: 'Joystick + botones SUBIR/BAJAR/SONAR/USAR/FOTO/LUZ · arrastrar para mirar', gamepad: 'Stick mover · A usar · B sonar · X foto · Y luz · RB/LB subir/bajar' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'cocina_caos', thumb: 'games/thumbs/cocina_caos.webp', file: 'cocina_caos.html', title: 'COCINA DEL CAOS', icon: '🍳', accent: '#ff5c7a',
    category: 'accion', tags: ['Cocina 3D', 'Contra reloj'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Picá, horneá y serví pedidos contra reloj en 3 cocinas 3D con fuego, derrames y roedores, hasta superar el Gran Banquete.',
    controls: { pc: 'WASD mover · E acción (mantener: picar/lavar/apagar) · Q ayudante · Shift impulso', touch: 'Joystick · ACCIÓN contextual grande · ⚡ impulso · 🧑‍🍳 encargo del ayudante', gamepad: 'Stick mover · A acción · X ayudante · B impulso · LB/RB encargos' },
    score: 'high', scoreLabel: 'puntos', orientation: 'any', heavy: true,
  },
  {
    id: 'corsarios_abismo', thumb: 'games/thumbs/corsarios_abismo.webp', file: 'corsarios_abismo.html', title: 'CORSARIOS DEL ABISMO', icon: '🏴‍☠️', accent: '#ffbe3d',
    category: 'aventura', tags: ['Naval 3D', 'Jefe final'], tech: 'Three.js 0.186 (WebGL)', added: '2026-10-10',
    description: 'Navegá con el viento, cañoneá de costado, desenterrá tesoros en 3 mares, tomá el fuerte y hundí al Almirante Espectral.',
    controls: { pc: 'W/S velas · A/D timón · Q/E andanadas babor/estribor · Espacio acción · R kit', touch: 'Timón virtual (velas y giro) + botones BABOR, ESTRIB., ACCIÓN y KIT', gamepad: 'Stick timón y velas · LB/RB andanadas · A acción · X kit' },
    score: 'high', scoreLabel: 'botín', orientation: 'any', heavy: true,
  },
];

/** @param {string} id */
export const getGame = id => GAMES.find(g => g.id === id);
/** @param {string} path ruta del documento actual (location.pathname) */
export const gameForPath = path => GAMES.find(g => path.endsWith('/' + g.file) || path === g.file);
