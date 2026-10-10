# TORRE INFINITA

## Estado anterior

- **Tecnología:** un único `torre_infinita.html` con Canvas 2D y JavaScript plano, sin dependencias externas salvo Google Fonts (Bungee + Space Grotesk) y `matelabs/intro.js` (intro de marca).
- **Mecánica:** juego de un solo toque. Un bloque cruza la pantalla de lado a lado y el jugador lo suelta: la parte que sobresale de la torre se corta y cae. Si queda alineado dentro de un margen (≈4,5 % del ancho), es **caída perfecta**: no se recorta, el bloque crece 12 px (hasta el ancho de la base) y suma combo (1 + combo puntos). Si no apoya nada, se termina la partida.
- **Dificultad:** el tiempo de cruce baja de 2,5 s a 1,35 s (−0,03 s por piso).
- **Cielo por altitud:** atardecer → día → crepúsculo → noche con estrellas y luna; nubes con paralaje.
- **Pantallas:** portada con demo automática de fondo (un bot apila bloques), partida con HUD (puntos y récord), pantalla de fin con puntaje, mejor combo, récord y “OTRA VEZ”.
- **Audio:** sintetizado con WebAudio (osciladores efímeros), sin archivos. Vibración en celulares.
- **Persistencia:** récord en `localStorage['torre_best']`.
- **Entrada:** `pointerdown` en toda la ventana, Espacio / Enter.
- **No tenía:** pausa, silencio, integración con el arcade.

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|-----------|--------|-------------|-------------------|
| 1 | alto | CONFIRMADO | Mantener Espacio apretado (autorrepetición del teclado) soltaba un bloque por cada repetición: la torre se arruinaba o la partida terminaba en el acto. | Playwright sobre la versión original: con la partida en curso se despacharon 8 `keydown` con `repeat:true` → puntaje 2 y pantalla de fin visible. |
| 2 | alto | CONFIRMADO | Sin pausa: Esc no hacía nada y no había forma de congelar la partida (salvo cambiar de pestaña). | Esc en partida: `window.MLArcade` inexistente, el bloque seguía moviéndose. |
| 3 | medio | CONFIRMADO | Sin control de sonido (no se podía silenciar). | Revisión de código: no había ningún mute ni nodo de ganancia maestro. |
| 4 | medio | CONFIRMADO (por cálculo) | Curva de dificultad rota en pantallas anchas: la velocidad tenía tope fijo de 760 px/s. A 1280 px de ancho ese tope se alcanza en el piso ~4 y la dificultad deja de subir; en celular (412 px) sí progresaba hasta el piso ~38. | `(W + w + 80) / T` con W=1280, w=400: piso 0 = 664 px/s, piso 4 ≈ 760 → tope. |
| 5 | bajo | CONFIRMADO | Clic derecho (y medio) soltaba bloques / arrancaba la partida. | Playwright: `mouse.click(..., {button:'right'})` en la portada → `#menu` pasó a `.hidden`. |
| 6 | bajo | CONFIRMADO | La pantalla de fin aceptaba el toque de “otra vez” a los 500 ms pero recién aparecía a los 550 ms: un toque en esa ventana reiniciaba sin mostrar el resultado. | Revisión de código (`overAt > 500` vs `setTimeout(…, 550)`). |
| 7 | bajo | CONFIRMADO | Textos sin voseo: “TOCA PARA EMPEZAR”, “o toca en cualquier parte”. | Lectura del HTML. |
| 8 | bajo | CONFIRMADO | La marca de agua “MATELABS” y el pie de la portada / fin se enciman (ambos centrados abajo). | Captura de pantalla en 1280×800 y Pixel 7. |
| 9 | bajo | SOSPECHADO | Asignaciones por cuadro: un `createLinearGradient` + 4 conversiones hex→rgb por cuadro para el cielo, y se recorrían todos los bloques de la torre (crece sin límite) aunque sólo se dibujen los visibles. No es un cuello de botella medible (60 fps antes y después). | Revisión de código. |
| 10 | bajo | SOSPECHADO | El AudioContext nunca se suspendía ni cerraba al salir. | Revisión de código. |

Sin problemas encontrados en: `dt` (ya estaba limitado a 33 ms), DPR (ya limitado a 2), limpieza de partículas/textos/piezas (se eliminan al morir), redimensionado (las coordenadas son relativas al centro).

## Cambios implementados

- **SDK MateLabs Arcade** (`matelabs/arcade.js` en el `<head>`), `MLArcade.init` con:
  - `isActive`: sólo con `state === 'playing'`.
  - Pausa real: `onPause` detiene el bucle `requestAnimationFrame` por completo y suspende el AudioContext; `onResume` reinicia el reloj (`last = now`) para que no haya salto de `dt`, y reanuda el audio.
  - `onRestart`: nueva partida desde el menú de pausa.
  - `onMute`: nodo de ganancia maestro (y no se crean osciladores mientras está silenciado). Respeta el ajuste inicial `muted`.
  - `onExit`: corta el bucle y cierra el AudioContext; si la página vuelve desde el bfcache se reactiva el bucle.
  - `MLArcade.started()` al empezar y `MLArcade.ended({score})` al perder.
  - Récord: se lee de `MLArcade.scores.best()` (con migración desde `torre_best` vía registro) y se sigue escribiendo `torre_best` por compatibilidad.
  - Barra en **abajo a la izquierda** (`'bl'`): arriba están los puntos (izq.) y el récord (der.). En pantallas angostas se suben la marca de agua y el pie para no chocar con la barra.
  - Gamepad: A = soltar, B = pausa (Start también pausa).
  - Ayuda (“Cómo jugar”) en castellano con voseo.
- **Entrada:** se ignora la autorrepetición de teclado, los clics que no son el principal y las teclas/toques sobre la barra o el menú de pausa.
- **Dificultad:** el tope de velocidad pasa a ser proporcional al ancho de la base (`BASE_W × 2,4`), así la curva sigue subiendo en PC hasta el piso ~30 en lugar de estancarse en el 4. En celular no cambia (el tope nunca se alcanza).
- **Fin de partida:** el toque para reiniciar se acepta recién a los 600 ms (cuando ya se ve el resultado).
- **Rendimiento:** degradado del cielo cacheado (se regenera sólo si cambia la altitud redondeada o el alto); sólo se recorren las filas visibles de la torre.
- **Accesibilidad:** `prefers-reduced-motion` desactiva el temblor de pantalla; el canvas tiene `role="img"` y etiqueta.
- **Visual:** la marca de agua se oculta mientras hay una pantalla superpuesta (evita que se encime con el pie); textos con voseo (“TOCÁ”).
- Gancho de sólo lectura `window.__torre` (estado, puntaje, filas, posición del bloque, pausa, récord) para las pruebas.

## Mediciones antes/después

`node tests/perf/measure.mjs after-torre_infinita torre_infinita` (Chromium headless, 1280×800, render por CPU con SwiftShader: sirve para comparar en la misma máquina, no son FPS reales de un dispositivo). Durante la medición “después” había otros agentes corriendo pruebas en la misma máquina, así que los tiempos de carga tienen ruido.

| Métrica | Antes (`.perf/before.json`) | Después (`.perf/after-torre_infinita.json`) |
|---|---|---|
| FPS en portada | 60 | 60.3 |
| Peor cuadro (ms) | 16.8 | 16.8 |
| DOMContentLoaded (ms) | 128 | 287 |
| load (ms) | 229 | 364 |
| Heap JS (MB) | 1.9 | 1.9 |
| Tareas largas | 0 | 1 |
| Nodos DOM | 56 | 78 |
| Requests | 6 | 8 |
| KB transferidos | 73 | 108 |

Dos corridas extra (no guardadas) dieron DCL 330/337 ms, load 410/433 ms, peor cuadro 33.4/16.8 ms, 1 tarea larga cada una. El aumento de carga, requests, KB y nodos viene del SDK compartido (`arcade.js` + `registry.js` + barra y menú de pausa), no del juego.

## Pruebas

`tests/e2e/torre_infinita.spec.js` (Playwright, proyectos `desktop` y `mobile` Pixel 7):

1. Carga sin errores, portada visible con voseo y la demo de fondo se mueve; barra del arcade presente.
2. Arranque con entrada real (Espacio en PC, toque en móvil), soltar un bloque sube filas y puntaje; telemetría `start`.
3. Autorrepetición de Espacio no suelta bloques.
4. Esc pausa: menú visible y estado idéntico tras 1 s; la entrada al juego queda bloqueada; Esc reanuda y el bloque vuelve a moverse sin salto.
5. “Reiniciar partida” del menú de pausa resetea a 1 fila / 0 puntos.
6. Fin de partida (fallo total), pantalla de fin con puntaje y “¡NUEVO RÉCORD!”, récord guardado en `torre_best` y `ml:scores`, telemetría `end`, “otra vez” con un toque, y el récord sigue tras recargar.
7. Migración del récord viejo `torre_best` (17) al SDK.
8. Viewport de celular 390×780: canvas a pantalla completa con DPR ≤ 2, sin scroll horizontal, la barra no tapa el HUD ni la marca de agua.
9. Táctil (sólo móvil): un toque arranca y suelta; tocar el botón de sonido de la barra silencia y no suelta bloques.

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/torre_infinita.spec.js`): **17 passed, 1 skipped** (desktop 8/8 + 1 omitida por ser sólo táctil; mobile 9/9).

## Pendientes / problemas conocidos

- En pantallas ultra anchas (≥ ~2000 px) el bloque cruza más distancia y el tope de velocidad se alcanza desde el inicio; la curva se aplana ahí (como antes, pero con tope mayor).
- La posición del bloque al soltar es la del último cuadro dibujado; a FPS muy bajos la precisión del toque es menor.
- El registro (`games/registry.js`) dice `scoreLabel: 'pisos'`, pero el juego cuenta **puntos** (las caídas perfectas suman 1 + combo). Ver corrección propuesta en el informe.
- La demo de la portada sigue animando el canvas mientras se está en el menú (es la presentación del juego; el navegador la frena con la pestaña oculta).
