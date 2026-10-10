# Arquitectura de MiniArcade

> Rama `feat/modernizacion-arcade`. Sitio estático, **sin paso de build**: cualquier hosting de archivos sirve (GitHub Pages, Netlify, nginx, bucket).

## Vista general

```
index.html ──► matelabs/portal.js ──► matelabs/catalog.js   (lógica pura: filtros, orden, recomendaciones)
     │                 │
     │                 └──► games/registry.js   ◄── ÚNICA fuente de metadatos de los juegos
     │
     └──► matelabs/arcade.js (SDK)  ◄── también lo carga cada juego
           matelabs/intro.js         ◄── intro de marca (portal y juegos)
           sw.js                     ◄── service worker (caché)

<juego>.html  (un documento HTML autocontenido por juego)
     ├── <script src="matelabs/arcade.js">   en el <head>
     ├── <script src="matelabs/intro.js">    justo después de <body>
     └── su propio <script> con la mecánica, que llama a MLArcade.init({...})
```

## Decisiones

### 1. Un documento por juego (aislamiento por navegación)
Cada juego es una página propia; el portal enlaza con `<a href>`. Entrar a un juego descarga el anterior por completo.

- **Aislamiento de fallos**: un error en un juego no puede afectar al portal ni a otros juegos. El SDK además captura `error` y `unhandledrejection`, los registra y muestra un aviso con "Reiniciar / Seguir".
- **Liberación de recursos**: al salir, el navegador destruye el documento: contextos WebGL, `AudioContext`, timers y listeners. El SDK llama a `onExit()` en `pagehide` para que cada juego suspenda el audio y corte su loop también cuando la página entra en bfcache.
- **Compatibilidad**: los juegos existentes siguen funcionando aunque se abran directamente por URL.
- **Descartado**: cargar los juegos en un `<iframe>` dentro de una SPA. Agrega complejidad (postMessage, foco, pantalla completa, teclado en iOS) sin beneficio real frente a la navegación, que ya libera todo.

### 2. Registro de juegos (`games/registry.js`)
Módulo ES con `GAMES` y `CATEGORIES`. Lo usan el portal (catálogo, buscador, fichas, recomendaciones), el SDK (instrucciones y orientación) y los tests (cada entrada se valida y su archivo debe existir).

**Agregar un juego nuevo** sin tocar el núcleo:
1. Crear `mi_juego.html` con `matelabs/arcade.js` en el `<head>` e `intro.js` después de `<body>`.
2. Llamar a `MLArcade.init({ id: 'mi_juego', isActive, onPause, onResume, onRestart })` y a `MLArcade.started()` / `MLArcade.ended({ score })`.
3. Agregar la entrada en `games/registry.js`, el JSON-LD de `index.html` (SEO) y su `tests/e2e/mi_juego.spec.js`.

### 3. SDK compartido (`matelabs/arcade.js`)
Script **clásico** (no módulo), para que los juegos puedan llamar a `MLArcade.init()` de forma síncrona desde su propio script. Los metadatos del registro se cargan con `import()` diferido.

| Sistema | Qué hace | Qué pone el juego |
|---|---|---|
| Barra flotante | ⌂ volver · ⏸ pausa · 🔊 sonido · ⛶ pantalla completa (posición configurable) | `toolbar: 'tl'\|'tr'\|'bl'\|'br'\|'none'` |
| Pausa | Esc / P / Start / pestaña oculta → menú (Reanudar, Reiniciar, Cómo jugar, Sonido, Volver). Mientras está abierto, **bloquea toda la entrada al juego** (listeners en fase de captura) | `isActive()`, `onPause()`, `onResume()`, `onRestart()` |
| Sonido | Ajuste global `muted`, persistido y compartido entre juegos | `onMute(muted)` |
| Gamepad | Sondea `navigator.getGamepads()` sólo con un mando conectado y traduce botones/stick a `KeyboardEvent` sintéticos | `gamepad: { a: 'Space', left: 'ArrowLeft', … }` o `false` |
| Puntajes | `ml:scores` en localStorage; el récord sólo sube y se descartan valores no finitos; migra la clave vieja (`legacyBestKey`) | `MLArcade.scores.submit(n)` / `best()` |
| Estadísticas | Partidas, tiempo jugado, última vez (`ml:stats`) → el portal arma "Seguir jugando" y los totales | `MLArcade.started()` / `ended({score})` |
| Acciones propias | Botones extra en el menú de pausa (p. ej. "☰ Menú del juego" en ¡SALVA AL REY!) | `actions: [{ label, fn }]` |
| Récord heredado | Lectura sincrónica de la clave vieja antes de que cargue el registro | `legacyBestKey` |
| Pantalla completa | Fullscreen API (+ prefijo webkit) y bloqueo de orientación si el registro lo pide | — |
| Observabilidad | Telemetría local en `ml:telemetry` (últimos 200 eventos: open, start, end, pause, error, gamepad…), medidor de FPS/heap con `?debug=1` o F3, `window.__mlPerf` para los tests | — |

Todo acceso a `localStorage` va dentro de `try/catch`: en modo privado o sin almacenamiento los juegos funcionan igual, sólo sin persistencia.

### 4. Portal
`index.html` (estructura y estilos) + `matelabs/portal.js` (interfaz) + `matelabs/catalog.js` (lógica pura, probada con Vitest).
- Catálogo generado desde el registro; enlaces estáticos en el HTML como respaldo sin JS y para los buscadores.
- Buscador sin tildes y por varias palabras, chips de categoría, orden (destacados, más jugados, recientes, A→Z), favoritos, "Seguir jugando", totales del jugador.
- Ficha de cada juego en un `<dialog>` accesible, con URL propia (`#/juego/<id>`): controles, récord, partidas, tiempo y recomendaciones (misma categoría > no jugado > misma tecnología).
- Accesibilidad: enlace "saltar al catálogo", foco visible, `aria-pressed` en chips y favoritos, `aria-live` con la cantidad de resultados y `prefers-reduced-motion`. Las partículas se detienen con la pestaña oculta.
- SEO técnico: title y description, Open Graph, JSON-LD `ItemList` de `VideoGame`, `robots.txt`, `manifest.webmanifest`.

### 5. Caché (`sw.js`)
- Código propio (HTML/JS): **network-first**, así un deploy nuevo nunca queda tapado por la caché. Sin conexión se usa la copia guardada.
- Recursos inmutables (Three.js versionado de cdnjs, fuentes, imágenes): **cache-first**. Three.js (~600 KB) se descarga una sola vez para los tres juegos 3D.
- Al subir `VERSION` se invalidan las cachés anteriores. `?nosw` desactiva el registro (lo usan los tests).

## Fase 3 — Evaluación de tecnologías

| Tecnología | Decisión | Justificación |
|---|---|---|
| **Phaser / PixiJS** | No migrar | Los 5 juegos 2D dibujan pocas decenas de primitivas por frame y ya van a 60 fps en el menú en headless (ver PERFORMANCE_REPORT). Migrar implicaría reescribir mecánicas que funcionan y sumar 300 KB a 1 MB por juego, sin ganancia medible. |
| **Canvas 2D** | Se mantiene | Adecuado para minijuegos livianos. Mejoras aplicadas: DPR acotado, dt acotado y menos asignaciones por frame. |
| **WebGL (Three.js r128)** | Se mantiene en los 3 juegos 3D | Actualizar a una versión moderna de Three.js cambia APIs (color management, iluminación física) y alteraría el aspecto. Se optimizó dentro de r128: pixelRatio acotado y menos asignaciones por frame. Detalle en el doc de cada juego. |
| **WebGPU** | No | Sin ventaja medible para escenas de este tamaño. Soporte todavía desparejo en móviles; habría que mantener un respaldo WebGL igual. |
| **TypeScript** | Sí, como **JSDoc + `tsc --checkJs`** (`npm run typecheck`) en el código compartido nuevo | Da chequeo de tipos sin agregar un build: el sitio sigue siendo archivos estáticos que se sirven tal cual. |
| **Web Audio API** | Sí (ya la usaban; NEON SURVIVOR la incorpora) | Audio sintetizado sin archivos que descargar. El silencio es global vía SDK. |
| **Web Workers / OffscreenCanvas** | No | Ningún juego tiene un cálculo independiente pesado (pathfinding, procedural) que bloquee el hilo principal. El costo dominante es el render. |
| **Object pooling** | Selectivo | Sólo donde hay creación y destrucción masiva por frame (partículas, proyectiles, enemigos). Ver el doc de cada juego. |
| **Spritesheets / atlas** | No aplica | Los juegos no usan imágenes: todo es vectorial, procedural o geometría 3D. |
| **Lazy loading / precarga** | Sí | Three.js sólo se carga en los juegos 3D. El SW precachea el núcleo del portal. El registro del SDK se importa diferido. |
| **Profiling / métricas** | Sí | `tests/perf/measure.mjs` (carga, FPS, peor frame, tareas largas, heap, nodos DOM, bytes), medidor en vivo (F3) y `window.__mlPerf`. |

## Herramientas

| Comando | Qué hace |
|---|---|
| `npm run serve` | Servidor estático en :8765 |
| `npm test` | Vitest: registro, catálogo y SDK (jsdom) |
| `npm run test:e2e` | Playwright: portal, navegación y cada juego, en escritorio y Pixel 7 |
| `npm run typecheck` | `tsc --checkJs` sobre el código compartido |
| `npm run perf -- <etiqueta> [páginas]` | Mide rendimiento y guarda `.perf/<etiqueta>.json` |
