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
   - tech: motor/render, para el filtro y la documentación. */

/** @typedef {{id:string,file:string,title:string,icon:string,accent:string,category:string,tags:string[],
 *   tech:string,description:string,controls:{pc:string,touch:string,gamepad?:string},
 *   score:'high'|'level'|'none',scoreLabel?:string,legacyBestKey?:string,orientation?:'any'|'landscape'|'portrait',
 *   heavy?:boolean}} GameMeta */

/** @type {Record<string,string>} */
export const CATEGORIES = {
  reflejos: 'Reflejos',
  accion: 'Acción',
  plataformas: 'Plataformas',
  carreras: 'Carreras',
  aventura: 'Aventura',
};

/** @type {GameMeta[]} */
export const GAMES = [
  {
    id: 'clavado', file: 'clavado.html', title: '¡CLAVADO!', icon: '🔪', accent: '#ff6b5d',
    category: 'reflejos', tags: ['Un toque', 'PC + Android'], tech: 'Canvas 2D',
    description: 'Clavá cuchillos en el tronco giratorio, esquivá tu propio acero, cortá manzanas y sobreviví a cada nivel.',
    controls: { pc: 'Clic o Espacio para lanzar', touch: 'Tocá la pantalla para lanzar', gamepad: 'A para lanzar' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'clavado_best', orientation: 'any',
  },
  {
    id: 'fruta_furia', file: 'fruta_furia.html', title: 'FRUTA FURIA', icon: '🍉', accent: '#8be07a',
    category: 'reflejos', tags: ['Deslizar', 'PC + Android'], tech: 'Canvas 2D',
    description: 'Deslizá el filo y hacé volar la fruta. Pero ni se te ocurra tocar la bomba. Combo, frenesí y oleadas.',
    controls: { pc: 'Arrastrá el mouse para cortar', touch: 'Deslizá el dedo para cortar' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'fruta_best', orientation: 'any',
  },
  {
    id: 'muerte_gloriosa', file: 'muerte_gloriosa.html', title: 'MUERTE GLORIOSA', icon: '🤕', accent: '#87ceeb',
    category: 'plataformas', tags: ['Parkour', '6 niveles'], tech: 'Canvas 2D',
    description: 'Parece un juego de caminar y saltar… pero el nivel te odia. Yunques, pinchos, barriles y trampolines traicioneros.',
    controls: { pc: '← → caminar · Espacio saltar · R reiniciar', touch: 'Botones en pantalla', gamepad: 'Stick/cruceta mover · A saltar' },
    score: 'level', scoreLabel: 'nivel', legacyBestKey: 'mg_best', orientation: 'landscape',
  },
  {
    id: 'neon_survivor', file: 'NEON_SURVIVOR.html', title: 'NEON SURVIVOR', icon: '🟣', accent: '#00ffff',
    category: 'accion', tags: ['Roguelite', 'Neón'], tech: 'Canvas 2D',
    description: 'Sobreviví a las hordas. Subí de nivel. Elegí mejoras. Disparo automático, upgrades y hordas infinitas.',
    controls: { pc: 'WASD / Flechas para moverte · disparo automático', touch: 'Joystick en pantalla', gamepad: 'Stick izquierdo para moverte' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'neonBest', orientation: 'any',
  },
  {
    id: 'salva_al_rey', file: 'Salva_al_rey.html', title: '¡SALVA AL REY!', icon: '👑', accent: '#c9a24b',
    category: 'accion', tags: ['3D', 'Oleadas'], tech: 'Three.js (WebGL)',
    description: 'Defendé el reino medieval en 3D. 10 oleadas de monstruos contra el portón y el rey. Modo exploración incluido.',
    controls: { pc: 'WASD mover · clic o J golpear · Espacio saltar · Shift correr · Q/E cámara', touch: 'Joystick · botones ⚔️ y ⬆️ · deslizá la cámara', gamepad: 'Stick mover · A saltar · X golpear · B correr · LB/RB cámara' },
    score: 'level', scoreLabel: 'oleada', legacyBestKey: 'rey_best', orientation: 'landscape', heavy: true,
  },
  {
    id: 'torre_infinita', file: 'torre_infinita.html', title: 'TORRE INFINITA', icon: '🧱', accent: '#ffd93d',
    category: 'reflejos', tags: ['Un toque', 'PC + Android'], tech: 'Canvas 2D',
    description: 'Apilá bloques, clavá caídas perfectas y subí hasta donde el cielo se apague. Cielos que cambian con la altura.',
    controls: { pc: 'Clic o Espacio para soltar el bloque', touch: 'Tocá la pantalla para soltar', gamepad: 'A para soltar' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'torre_best', orientation: 'any',
  },
  {
    id: 'turbo_furia', file: 'turbo_furia.html', title: 'TURBO FURIA', icon: '🏁', accent: '#ff8c1a',
    category: 'carreras', tags: ['3D', 'Nitro'], tech: 'Three.js (WebGL)',
    description: 'Carreras 3D a toda velocidad. Elegí tu vehículo, esquivá el tráfico, activá el nitro y batí tu récord.',
    controls: { pc: '← → / A D carril · ↓ freno · Shift/Espacio nitro', touch: 'Deslizá o usá los botones', gamepad: 'Stick/cruceta carril · A nitro · X/LT freno' },
    score: 'high', scoreLabel: 'metros', legacyBestKey: 'turbo_best', orientation: 'any', heavy: true,
  },
  {
    id: 'valle_encantado', file: 'valle_encantado.html', title: 'EL VALLE ENCANTADO', icon: '🧚', accent: '#ff8fb8',
    category: 'aventura', tags: ['3D', 'Exploración'], tech: 'Three.js (WebGL)',
    description: 'Un mundo de cuentos en 3D. Explorá, hablá con 8 habitantes, encontrá 12 fragmentos de estrella o defendé el valle.',
    controls: { pc: 'WASD mover · mouse cámara · clic golpear · E hablar · Shift correr', touch: 'Joystick · botón ⚔️', gamepad: 'Stick mover · A saltar · X golpear' },
    score: 'high', scoreLabel: 'puntos', legacyBestKey: 'valle_best', orientation: 'landscape', heavy: true,
  },
];

/** @param {string} id */
export const getGame = id => GAMES.find(g => g.id === id);
/** @param {string} path ruta del documento actual (location.pathname) */
export const gameForPath = path => GAMES.find(g => path.endsWith('/' + g.file) || path === g.file);
