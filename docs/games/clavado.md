# ¡CLAVADO! (`clavado.html`)

## Estado anterior

- **Tecnología:** un solo HTML con Canvas 2D y JavaScript plano (IIFE), sin dependencias salvo Google Fonts (Bungee, Space Grotesk) y la intro de marca `matelabs/intro.js`. Audio sintetizado con Web Audio (osciladores creados por sonido, conectados directo a `destination`).
- **Mecánicas:** un tronco gira en el centro; el jugador lanza cuchillos (clic, toque, Espacio o Enter). Si el cuchillo cae a menos de ~0,105 rad de otro ya clavado, se rompe y se termina la partida. Cada nivel trae 6–8 cuchillos, manzanas (+50) y, desde el nivel 3, cuchillos preclavados. Clavadas seguidas en menos de 1,5 s suman combo (10 × combo). La rotación cambia por nivel: constante, senoidal, ida y vuelta y cambio brusco de sentido, con velocidad base creciente (tope 3 rad/s).
- **Pantallas/estados:** `menu` (con una demo automática que lanza cuchillos sola), `playing`, `clear` (cartel de nivel superado), `over` (tarjeta con puntos, nivel, manzanas y récord).
- **Persistencia:** récord en `localStorage['clavado_best']`.
- **Bucle:** `requestAnimationFrame` con `dt` acotado a 33 ms; DPR acotado a 2.

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | alto | CONFIRMADO | Al romperse un cuchillo, `land()` no cambiaba `knifeState` (quedaba en `'fly'`), así que el mismo lanzamiento se volvía a resolver en cada cuadro: varios `shatter()`/`sBreak()` y varios `setTimeout(gameOver, 750)` → `gameOver()` (y el sonido de derrota) se ejecutaba varias veces encimado. | Script Playwright que espamea Espacio y cuenta `setTimeout` por demora: en 5 partidas hubo 6, 6, 2, 1 y 2 llamadas de 750 ms (y la misma cantidad de `gameOver`) por cada rotura. |
| 2 | alto | CONFIRMADO | Durante los 750 ms entre la rotura y el game over el estado seguía en `playing`: cuando el tronco giraba fuera de la zona de choque, el cuchillo roto **se clavaba y sumaba puntos**, y además se podían seguir lanzando cuchillos e incluso pasar de nivel. | Mismo script, leyendo el HUD en la primera rotura y en la tarjeta final: 5110→5430, 2200→2860, 6050→6760, 2100→2530, 1710→2100. |
| 3 | medio | CONFIRMADO (por diseño del código) | Todos los temporizadores del juego (recarga 230 ms, nivel superado 1,1 s, game over 750 ms, tarjeta 250 ms, demo 600 ms) eran `setTimeout` de reloj real: no se pueden congelar con una pausa (el nivel avanzaría o la partida terminaría con el juego en pausa). | Lectura del código; era bloqueante para integrar la pausa del SDK. |
| 4 | medio | CONFIRMADO | Sin pausa, sin silencio y sin forma de volver al arcade. El `AudioContext` nunca se suspendía ni cerraba. | Revisión en navegador. |
| 5 | bajo | CONFIRMADO | Mantener Espacio apretado (autorepetición) en la pantalla final reiniciaba la partida sola apenas pasaban 500 ms. | Lectura del código: `keydown` sin filtrar `e.repeat`. |
| 6 | bajo | CONFIRMADO | En el menú y la pantalla final, el texto inferior (`.foot`) quedaba encimado con la marca de agua «MATELABS». | Captura en Pixel 7 y en escritorio. |
| 7 | bajo | CONFIRMADO | Textos sin voseo: «TOCA PARA JUGAR», «o toca en cualquier parte». | Lectura. |
| 8 | bajo | CONFIRMADO | Se creaban en cada cuadro 3 degradados de fondo/tronco + 2 por cada cuchillo dibujado (hasta ~30 objetos por cuadro en niveles altos). | Lectura del código de `render()`/`drawKnife()`. |
| 9 | bajo | SOSPECHADO | El combo no tiene tope (10 × combo), así que lanzar rápido da puntajes muy altos. Es parte del diseño original; no se tocó. | Puntajes de miles en las corridas del hallazgo 2. |

## Cambios implementados

- **Rotura resuelta una sola vez:** `land()` pone `knifeState='none'` al llegar; la rotura pasa a un estado nuevo `dying` (el tronco sigue girando, pero no se aceptan lanzamientos ni se suma nada) y `gameOver()` sólo actúa desde `dying`, así que corre una única vez.
- **Temporizadores en tiempo de simulación** (`after(seg, fn)` + `tickTimers(dt)`): reemplazan todos los `setTimeout`, se congelan con la pausa y se limpian al reiniciar.
- **SDK MateLabs** (`matelabs/arcade.js` en el `<head>`):
  - `toolbar: 'tr'`; el bloque NIVEL del HUD baja 40 px para no quedar tapado (verificado en capturas de escritorio y Pixel 7, y con un test de superposición de cajas).
  - `isActive`: `playing`, `clear` o `dying`.
  - `onPause`: detiene el `requestAnimationFrame` y suspende el `AudioContext`; `onResume`: reanuda el audio y reinicia el bucle con `last=performance.now()` (sin salto de `dt`).
  - `onRestart`: nueva partida desde cero. `onExit`: corta el bucle y cierra el `AudioContext` (con `pageshow` para volver desde el bfcache).
  - `onMute`: ganancia maestra a 0; además el estado inicial se lee de `MLArcade.settings.get('muted')` y no se programan osciladores mientras está silenciado.
  - `MLArcade.started()` al arrancar y `MLArcade.ended({score})` al terminar (una sola vez por partida).
  - Récord: se lee de `MLArcade.scores.best()` (que migra `clavado_best`) y se sigue escribiendo `clavado_best` por compatibilidad. El chip «TU RÉCORD» del menú se actualiza.
  - Gamepad `{a: 'Space'}` (A lanza, Start pausa); ayuda propia en el menú de pausa.
- Autorepetición de teclado ignorada fuera de la partida (no reinicia sola).
- Degradados cacheados: fondo/tronco al redimensionar, cuchillo una sola vez. Canvas con tamaño entero y redibujo al redimensionar en pausa.
- `.foot` subido para no pisar la marca de agua; textos con voseo («TOCÁ PARA JUGAR», «o tocá…»).
- Gancho de pruebas `window.__clavado` (`snap()` y `forceNextHit()` para forzar un choque sin depender del azar).

## Mediciones antes/después

`node tests/perf/measure.mjs after-clavado clavado` (Chromium headless, SwiftShader, 1280×800, menú). Ojo: el «después» se midió con la máquina muy cargada (load average ≈ 22–30 en 12 núcleos por otros agentes corriendo Playwright en paralelo); el «antes» es `.perf/before.json`.

| Métrica | Antes | Después (corrida 1) | Después (corrida 2) |
|---|---|---|---|
| FPS menú | 60.3 | 60.2 | 60.1 |
| Peor cuadro (ms) | 16.8 | 16.8 | 16.8 |
| DOMContentLoaded (ms) | 132 | 293 | 271 |
| load (ms) | 252 | 438 | 364 |
| Heap JS (MB) | 2.9 | 2.6 | 2.4 |
| Long tasks | 0 | 1 | 1 |
| Nodos DOM | 57 | 80 | 80 |
| Requests / KB | 6 / 75 | 8 / 111 | 8 / 111 |
| Errores | 0 | 0 | 0 |

Los requests/KB/nodos extra son el SDK (`arcade.js`, `registry.js`, barra y menú de pausa). Los tiempos de carga más altos son coherentes con la carga de la máquina y los 2 scripts extra; no se pudo medir el original en las mismas condiciones.

## Pruebas

`tests/e2e/clavado.spec.js` (7 tests × 2 proyectos; el de toque se saltea en escritorio):

1. Carga sin errores, la demo del menú gira y la barra del SDK está visible.
2. Arranca con entrada real (Espacio / toque), clava un cuchillo, suma puntos, telemetría `start`, y la barra no se superpone con PUNTOS ni NIVEL.
3. Escape congela el juego (`theta` y `time` idénticos tras 1 s), la entrada queda bloqueada y Reanudar continúa sin salto de tiempo.
4. Reiniciar desde el menú de pausa deja puntaje 0, nivel 1, tronco vacío y el bucle vivo.
5. Romper un cuchillo: game over único (`MLArcade.ended` llamado 1 vez), el puntaje no sigue subiendo, insignia de récord, `clavado_best` y `ml:scores.clavado` guardados, «otra vez» con entrada real y récord persistido tras recargar.
6. Redimensionar a 360×640: canvas a pantalla completa, sin scroll horizontal, se sigue jugando.
7. (móvil) El toque lanza el cuchillo y tocar la barra del SDK no lanza.

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/clavado.spec.js`), dos corridas seguidas: **13 passed, 1 skipped** (desktop 6/6 + 1 skip, mobile 7/7).

Nota: con la máquina saturada, Chromium headless dejaba de entregar cuadros (`requestAnimationFrame`) durante varios segundos — también en una sonda rAF independiente del juego — y los primeros tiempos de espera de 5 s fallaban. Los tiempos de espera del spec son holgados (20 s) por eso.

## Pendientes / problemas conocidos

- El combo sin tope (hallazgo 9) se dejó como está por ser parte del diseño.
- Los textos flotantes (`+10`, `¡ROTO!`) guardan coordenadas absolutas: si se redimensiona justo mientras están en pantalla, quedan desplazados un instante.
- El fondo del menú y de la pantalla final se sigue animando (es la demo del juego); no hay ahorro de CPU extra ahí.
- No se verificó el audio de forma audible en headless; mute/pausa del audio están revisados a nivel de código.
