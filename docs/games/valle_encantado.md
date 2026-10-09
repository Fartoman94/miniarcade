# El Valle Encantado

## Estado anterior

- **Tecnología:** un único `valle_encantado.html` (CRLF) con Three.js r128 desde cdnjs, WebGL, Web Audio sintetizado (sin archivos de audio) y fuentes de Google Fonts (MedievalSharp, Nunito). Sin build ni otras dependencias.
- **Mecánicas:** valle 3D low-poly en tercera persona. El jugador camina (WASD/joystick), corre (Shift), golpea con un bastón (clic/Espacio/⚔️) y habla con 8 habitantes (E/💬).
  - **Explorar el valle:** juntar 12 fragmentos de estrella (una flecha dorada guía al más cercano); al completarlo el valle "se ilumina" (`valle_lit` en localStorage).
  - **Proteger el valle:** oleadas de diablillos y ogros que van hacia el Corazón del Valle y lo drenan; 5 corazones de vida; récord = mejor oleada (`valle_best`).
- **Pantallas:** menú con selección de modo, HUD por modo, diálogos con efecto máquina de escribir, cartel de anuncios, pantalla de fin.
- **Decorado:** ~50 árboles, flores, pasto, hongos, juncos, aldea, molino, cristales, muelle, hadas, dragones, mariposas, ovejas, luciérnagas y polen (Points), partículas pooleadas.

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | crítico | CONFIRMADO | `banner()` se llamaba en todo el juego pero **no existía**. Al elegir un modo se lanzaba `banner is not a function`; en "Proteger" el error ocurría dentro de `update()` al empezar la oleada 1 y mataba el bucle de `requestAnimationFrame`: el juego quedaba congelado. En "Explorar" pasaba lo mismo al tomar el primer fragmento. | Playwright contra el original: errores `banner is not a function` ×2 y 0 draw calls por cuadro después de pulsar "Proteger el valle". |
| 2 | alto | CONFIRMADO | En celulares apaisados (915×412) el menú no se podía desplazar y los botones de modo quedaban fuera de pantalla: imposible empezar a jugar. | `#modeMission` en top=790 con viewport de 412 px y `overflow-y: visible`. |
| 3 | alto | CONFIRMADO | ~470 draw calls por cuadro en el menú: cada hoja, flor, piedra, poste o parte de personaje era una malla con su propio material. ~12–15 ms de JS por cuadro sólo en `update+render`. | Contando `drawElements/drawArrays` por cuadro (445–477) y midiendo los callbacks de rAF. |
| 4 | medio | CONFIRMADO | En escritorio, un clic con el mouse en la mitad izquierda abría el joystick táctil y el personaje seguía al puntero (los `pointerdown` no filtraban `pointerType`). | Mantener el mouse en (200,500) → `#joy` con `display:block`. |
| 5 | medio | CONFIRMADO | En táctil, tocar la zona de cámara también golpeaba (el `mousedown` de compatibilidad llamaba a `attack()`); con un diálogo abierto, un toque pasaba dos líneas. | Pixel 7: un toque en la zona de cámara agregó a la escena el arco del golpe (2 `add`). |
| 6 | medio | SOSPECHADO | Fuga de memoria: cada diablillo creaba ~12 geometrías y materiales, cada destello curativo y cada arco de golpe los suyos, y nunca se liberaban. Crecía oleada tras oleada. | Por lectura de código (en el original no se llegaba a jugar oleadas por el #1). Tras el arreglo: 101→105→105 geometrías en GPU en tres rondas de oleada. |
| 7 | medio | SOSPECHADO | La caída del jugador / marchitado usaba `setTimeout`: la pausa no la frenaba y, si se reiniciaba durante la caída, el game over viejo aparecía encima de la partida nueva. | Por lectura de código (el original no tenía pausa). |
| 8 | medio | CONFIRMADO | HUD de "Proteger" en vertical (412 px): corazones, barra del Corazón y placa de oleada se pisaban entre sí; en "Explorar" el texto guía tapaba el contador de fragmentos. | Capturas Pixel 7. |
| 9 | bajo | SOSPECHADO | Tras completar el valle una vez (`valle_lit=1`), la flecha guía no volvía a aparecer en partidas nuevas (condición `!valleyLit`). | Lectura de código. |
| 10 | bajo | CONFIRMADO | En "Proteger" los fragmentos seguían visibles y recolectables, con carteles que tapaban los de oleada. | Lectura de código + visual. |
| 11 | bajo | SOSPECHADO | Al perder el foco con una tecla apretada se perdía el `keyup` y el personaje seguía caminando solo. | Lectura de código. |
| 12 | bajo | CONFIRMADO | En celular el botón ⚔️ se veía detrás del menú y de la pantalla de fin. | Capturas Pixel 7. |
| 13 | bajo | CONFIRMADO | Se reescribían textos/estilos del DOM en cada cuadro (`promptBtn`, oleada, diablillos, opacidad de daño, diálogo). | Lectura de código. |
| 14 | bajo | CONFIRMADO | "Explorar" no tenía final ni forma de volver al menú; no había silencio ni pausa; el registro anuncia "A saltar" en gamepad pero el juego no tiene salto. | Lectura de código. |
| 15 | bajo | CONFIRMADO | 16 mallas de "postes" de las casas se creaban y nunca se agregaban a la escena (basura). | Lectura de código. |

## Cambios implementados

- **Bug crítico:** se agregó `banner()` (cartel animado, ahora con `role=status`/`aria-live`).
- **Rendimiento:** horneado de geometría (`mergeMeshes`/`bakeGroup`): el decorado fijo se une por tipo de material en pocas mallas con colores por vértice, y cada personaje rígido (habitantes, hadas, dragones, ovejas, honguitos, nubes, jugador) en una malla por material; las partes animadas (alas, piernas, brazos, capa, aspas, bote) quedan aparte. Mismo aspecto, ~470 → ~130 draw calls.
- **Memoria:** diablillos desde una plantilla horneada por tipo que se clona compartiendo geometría y materiales (el destello de golpe cambia de material); destellos curativos con geometría/material compartidos; arcos de golpe liberan su material.
- **Pausa real (SDK):** `onPause` corta el bucle de rAF (no se simula ni se dibuja), suelta las teclas y suspende el AudioContext; `onResume` reinicia el reloj (sin salto de dt). La caída/marchitado ahora usa tiempo de juego.
- **SDK MLArcade:** `<script src="matelabs/arcade.js">` en el `<head>`; `init` con barra arriba a la derecha (las placas de la derecha bajaron), `isActive` = jugando o cayendo, reinicio, salida (detiene el bucle y cierra el audio), silencio conectado a un `GainNode` maestro (respeta el ajuste inicial), ayuda en castellano y mapa de gamepad (stick izq. = WASD, A = golpe, X/B = hablar, RB/LB = correr; Start = pausa). Stick derecho del gamepad mueve la cámara (lectura propia).
- **Puntajes:** `MLArcade.started()` al empezar; `MLArcade.ended({score: oleada})` en el game over de "Proteger" (y `ended()` al completar "Explorar"). El récord se lee del SDK (con la clave vieja como respaldo) y se sigue escribiendo `valle_best`.
- **Explorar tiene final:** 4 s después del 12.º fragmento aparece un resumen (fragmentos, habitantes con los que hablaste, tiempo, mejor tiempo en `valle_explore_best`) con "Otra vez", "Seguir paseando" y "Menú". Contador "💬 N / 8 HABITANTES" en el HUD. La flecha guía vuelve a aparecer en cada partida.
- **Entrada:** el mouse ya no abre el joystick; los toques no generan golpes ni saltos de diálogo fantasma; teclas se liberan al perder el foco/pausar; el botón ⚔️ sólo se muestra mientras se juega.
- **Responsive:** menú desplazable y compacto en pantallas bajas; HUD reacomodado en pantallas angostas (≤600 px); textos del menú corregidos ("clic derecho + arrastrar" para la cámara).
- **Dificultad:** los enemigos son un 2,5 % más rápidos por oleada (tope en la oleada 20), además del aumento de cantidad/ogros que ya existía. En "Proteger" los fragmentos se ocultan.
- **Varios:** escrituras al DOM sólo cuando cambia el valor; sin objeto con getters por cuadro para la colisión del jugador; `setPixelRatio` (tope 2) también al redimensionar y redibujo si se redimensiona en pausa; se quitaron las mallas huérfanas.
- **Ganchos de prueba:** `window.__valle.snap()` (solo lectura). Con `?e2e` en la URL: `hurt`, `goto`, `fragPos`, `skipWait` para llegar a los finales en tiempo de prueba.

## Mediciones antes/después

Headless Chromium con SwiftShader (WebGL por CPU), 1280×800, menú. **Advertencia:** la máquina estaba muy cargada (load average 22–44 por otras pruebas en paralelo), así que los FPS absolutos fluctúan mucho y están limitados por el raster de SwiftShader; sirven para comparar, no como FPS reales.

`.perf/before.json` (medido antes, otra sesión): fps 31,1 · peor cuadro 83,4 ms · heap 14,5 MB · 2 long tasks · 99 nodos · 768 KB.

`node tests/perf/measure.mjs` intercalando original (servido desde una copia) y nuevo en la misma sesión:

| corrida | fps | peor cuadro | heap | long tasks |
|---|---|---|---|---|
| original 1 / nuevo 1 | 9,5 / 10,6 | 266,7 / 150 ms | 11,0 / 11,5 MB | 3 / 3 |
| original 2 / nuevo 2 | 8,7 / 8,4 | 483,3 / 216,6 ms | 14,4 / 8,6 MB | 3 / 3 |
| original 3 / nuevo 3 | 8,6 / 8,3 | 216,7 / 266,7 ms | 14,3 / 9,5 MB | 2 / 3 |

`.perf/after-valle_encantado.json` (última corrida): fps 12,9 · peor cuadro 183,4 ms · heap 12,4 MB · 3 long tasks · 125 nodos (barra y menú de pausa del SDK) · 815 KB (incluye arcade.js y registry.js).

Medición propia por cuadro (contando llamadas WebGL y el tiempo de los callbacks de rAF, 60 cuadros, menú):

| | draw calls | JS por cuadro | vértices por cuadro |
|---|---|---|---|
| original (4 corridas) | 445–477 | 8,0–14,8 ms | ~73 k |
| nuevo (5 corridas) | 127–141 | 3,6–6,0 ms | ~97 k |

Lectura honesta: el trabajo de CPU del juego por cuadro bajó ~3× y los draw calls ~3,5×, pero en SwiftShader con la máquina saturada los FPS del menú quedaron iguales (el cuello de botella es el raster por CPU, no el JS). Los vértices dibujados suben porque las mallas unidas ya no se descartan por frustum; en GPU real eso es barato frente a los draw calls. El heap bajó en 2 de 3 corridas. Las 2–3 long tasks son de la carga (parseo de three.js, armado de la escena y compilación de shaders), igual que antes.

## Pruebas

`tests/e2e/valle_encantado.spec.js` (7 casos):

1. Carga sin errores, menú visible, menos de 220 draw calls.
2. "Proteger" con clic/tap real: la partida avanza, empieza la oleada 1 con enemigos, **Escape pausa** (tiempo, posición y enemigos idénticos durante 1 s, SDK en pausa), Escape reanuda sin salto de tiempo, **Reiniciar** desde el menú de pausa resetea la partida y el bucle sigue vivo.
3. Fin de partida: oleada 1 → derrota → pantalla de fin con "nueva mejor oleada", `ml:scores.valle_encantado = 1` y `valle_best = "1"`, telemetría `end`; tras recargar el menú muestra "MEJOR OLEADA: 1".
4. "Explorar": hablar con la Anciana Alba (E / tap en 💬), pasar el diálogo, juntar los 12 fragmentos, resumen "¡El valle brilla!", mejor tiempo guardado, "Seguir paseando" vuelve al juego.
5. (escritorio) WASD mueve, clic en la mitad izquierda golpea sin abrir el joystick, el botón de sonido silencia.
6. (móvil) joystick táctil mueve, ⚔️ golpea, un toque en la zona de cámara no golpea.
7. Cambio a 412×915 y 915×412: sin scroll horizontal, canvas del tamaño correcto, modos alcanzables, placas del HUD sin solaparse con la barra.

Resultado (`ML_WORKERS=1 npx playwright test tests/e2e/valle_encantado.spec.js`): **12 passed, 2 skipped** (los casos 5 y 6 se saltean en el proyecto que no corresponde) — desktop 6/6, mobile 6/6, en 1,9 min.

## Pendientes / problemas conocidos

- Las partículas siguen siendo una malla por partícula (cada una con su material para color/opacidad): con humo, estelas de dragón y destellos son ~30–50 draw calls. Se podría pasar a `InstancedMesh`, pero cambia el fundido de opacidad del humo.
- Los 16 destellos del cielo y los sprites de brillo siguen siendo un draw call cada uno.
- El decorado unido no se descarta por frustum; si en GPUs de celulares viejos se notara, partirlo en celdas.
- La animación CSS del cartel sigue corriendo durante la pausa (es sólo visual).
- No se guarda el progreso parcial de "Explorar" (la partida es corta; se guarda el mejor tiempo).
- Los FPS medidos en headless no muestran mejora por el raster de SwiftShader y la carga de la máquina; falta medir en un dispositivo real.
- El registro (`games/registry.js`) tiene datos desactualizados; ver la corrección sugerida en el informe.
