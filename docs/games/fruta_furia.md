# FRUTA FURIA

## Estado anterior

- **Tecnología:** un único `fruta_furia.html`, Canvas 2D puro, sin librerías. Audio sintetizado con Web Audio (osciladores efímeros por sonido). Fuentes Bungee / Space Grotesk desde Google Fonts. Intro de marca `matelabs/intro.js`.
- **Mecánicas:** fruta (sandía, naranja, manzana, limón, kiwi, dorada de 50 pts) lanzada desde abajo con gravedad; se corta deslizando (colisión segmento–círculo del trazo). Combo por tajo (×N), FRENESÍ con bonus si un tajo corta 3+. Bombas desde los 8 s (probabilidad creciente hasta 20 %). Oleadas cada 16 s. 3 frutas escapadas = fin; tocar bomba = explosión y fin.
- **Pantallas:** menú (con un "bot" que corta fruta de fondo), juego (HUD puntos / vidas), explosión (`boom`), fin de partida (puntaje, cortadas, récord, badge de nuevo récord).
- **Entrada:** Pointer Events (mouse y táctil), Espacio/Enter para empezar o reintentar.
- **Persistencia:** récord en `localStorage['fruta_best']`.
- **Sin pausa, sin silencio, sin integración con el arcade.**

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | alto | CONFIRMADO | La velocidad de lanzamiento escalaba con `H` pero la gravedad era fija (980): la altura alcanzada crece con `H²`. En pantallas bajas (celular apaisado) la fruta apenas asomaba sobre las colinas; en pantallas altas salía por arriba de la pantalla. | Copia instrumentada del original (bot del menú desactivado) registrando el `y` de cada fruta en su punto más alto: 915×412 → picos entre 79 % y 90 % de la altura; 1280×1600 → 4/4 picos por encima del borde superior (−26 %…−8 %); 1280×800 → 46–59 %. |
| 2 | medio | CONFIRMADO (al integrar pausa) | La explosión de la bomba usaba `setTimeout(gameOver, 750)`: no se congela con la pausa y, si se reinicia durante la explosión, el timeout viejo terminaba la partida nueva. | Con el arreglo (temporizador simulado `boomT`) se verificó con Playwright: bomba cortada → Esc → 1,5 s después sigue en `boom`; Reiniciar → 1,5 s después `playing`, 0 vidas perdidas. |
| 3 | medio | CONFIRMADO (al integrar pausa) | Un tajo en curso al pausar dejaba `activePtr` colgado (el SDK bloquea el `pointerup`): en táctil no se podía volver a cortar; con mouse se cortaba moviendo sin apretar. | Análisis del flujo de eventos + pruebas de pausa/reanudación; se resetea el tajo en `onPause`. |
| 4 | bajo | SOSPECHADO | Si se suelta el botón del mouse fuera de la ventana puede no llegar `pointerup` y el tajo sigue "en el aire". | No reproducido en Chromium headless (captura implícita). Se agregó defensa: `pointermove` de mouse con `buttons===0` cierra el tajo. |
| 5 | bajo | CONFIRMADO | Sin pausa, sin silencio (no había nodo de volumen maestro), sin pausa automática al ocultar la pestaña (el `setTimeout` de la bomba seguía corriendo). | Lectura del código. |
| 6 | bajo | CONFIRMADO | En celular, la barra del arcade (abajo-izquierda) tapaba el comienzo de la marca de agua "CREADO POR MATELABS"; en los overlays el pie `.foot` se superponía con la marca de agua y se veía el texto duplicado y corrido. | Capturas desktop 1280×800 y Pixel 7. |
| 7 | bajo | CONFIRMADO | La dificultad se aplanaba a los ~50 s (intervalo mínimo y bomba máxima alcanzados); después el juego no cambiaba más. | Lectura de las fórmulas de `update`/`launchGroup`. |
| 8 | bajo | CONFIRMADO | Asignaciones por frame evitables: 3 gradientes de fondo nuevos por frame y `trail.filter()` creando un array por frame. Código muerto en `launchOne` (`vx` "placeholder"). | Lectura del código. No es un cuello de botella medible (60 fps antes y después). |
| 9 | bajo | SOSPECHADO | Tajos muy rápidos en pantallas de alta frecuencia pueden perder puntos intermedios. | Mitigado usando `getCoalescedEvents()`; no medido. |

Revisado sin problemas: dt ya acotado a 33 ms, DPR ya limitado a 2, arrays de partículas/mitades/textos se vacían, osciladores se detienen solos.

## Cambios implementados

- **Física independiente de la pantalla:** la gravedad escala con la altura (`G = 980·clamp(H/800, .55, 1.8)`) y la velocidad vertical se calcula para que la fruta llegue a una franja fija (15–48 % desde arriba). Mismo tiempo de vuelo en cualquier pantalla. Las mitades cortadas usan la misma `G`.
- **SDK MateLabs Arcade** (`matelabs/arcade.js` en el `<head>`):
  - `isActive`: `playing` o `boom`. Pausa real: se detiene el `requestAnimationFrame`, se congela todo (incl. temporizador de la bomba) y se suspende el `AudioContext`; al reanudar se reinicia `last`, sin salto de dt.
  - `onRestart` reinicia la partida (también durante la explosión). `onExit` corta el loop y cierra el `AudioContext`.
  - `onMute` controla un nodo de ganancia maestro; respeta el silencio guardado al cargar y no crea osciladores en silencio.
  - `MLArcade.started()` al empezar, `MLArcade.ended({score})` al terminar. El récord se lee como `max(fruta_best, MLArcade.scores.best())`, se actualiza cuando el registro termina de cargar, y se sigue escribiendo `fruta_best` por compatibilidad.
  - Barra en `bl` (abajo-izquierda): no tapa puntos (arriba-izq.) ni vidas (arriba-der.). `gamepad: false` (es un juego de deslizar). Ayuda propia en español en el menú de pausa.
- Tajo cortado limpiamente al pausar; defensa ante `pointerup` perdido; `getCoalescedEvents()` para tajos rápidos.
- Bomba con temporizador simulado (`boomT`) en vez de `setTimeout`.
- Dificultad después del minuto: más grupos dobles/triples (hasta +20 % a los 2 min) y oleadas cada vez más seguidas (de 16 s a 10 s).
- Gradientes del fondo cacheados al redimensionar; recorte del rastro en el lugar; tamaño del canvas redondeado.
- Marca de agua más arriba en pantallas ≤ 640 px; se ocultó el pie duplicado de los overlays (el crédito sigue en la marca de agua y en la tarjeta "CREADO POR MATELABS").
- Gancho de sólo lectura `window.__fruta.snap()` para las pruebas.

## Mediciones antes/después

`node tests/perf/measure.mjs after-fruta_furia fruta_furia`, Chromium headless con SwiftShader (render por CPU), 1280×800, menú. Sirve para comparar, no son cifras de un dispositivo real. La medición "después" se hizo con la máquina cargada (load average ≈ 11 en 12 núcleos, con otros agentes corriendo pruebas).

| Métrica | Antes (`.perf/before.json`) | Después (`.perf/after-fruta_furia.json`) |
|---|---|---|
| FPS (menú) | 60,5 | 60,3 |
| Peor frame | 16,8 ms | 16,8 ms |
| DOMContentLoaded | 157 ms | 222 ms |
| load | 276 ms | 496 ms |
| Heap JS | 1,6 MB | 1,8 MB |
| Long tasks | 0 | 0 |
| Nodos DOM | 64 | 86 |
| Requests | 6 | 8 |
| Transferido | 83 KB | 120 KB |
| Errores | 0 | 0 |

Las 2 requests y ~37 KB extra son `matelabs/arcade.js` y `games/registry.js` (SDK compartido); los nodos DOM extra son la barra y el menú de pausa. La diferencia de DCL/load está dentro de lo esperable por el script extra y la carga de la máquina.

## Pruebas

`tests/e2e/fruta_furia.spec.js` (Playwright, proyectos `desktop` y `mobile` Pixel 7):

1. Carga sin errores de consola y muestra el menú; SDK presente.
2. Arranque con clic/toque real; se corta fruta con entrada real (mouse en desktop, toques CDP en mobile) y sube el puntaje; Esc pausa (tiempo y frutas idénticos durante 1 s), Esc reanuda sin salto de tiempo; "Reiniciar partida" del menú de pausa vuelve a 0.
3. Fin de partida (dejando escapar fruta), overlay con puntaje, telemetría `start`/`end`, récord guardado en `ml:scores` y en `fruta_best`, y visible en el menú tras recargar.
4. Altura del vuelo: en 915×412 y 1280×1600 el punto más alto previsto de cada fruta queda entre 10 % y 55 % de la altura (falla con la física anterior).
5. Viewport 390×780: canvas ocupa la pantalla, sin scroll horizontal, barra del arcade en la mitad inferior.

Resultado final: `ML_WORKERS=1 npx playwright test tests/e2e/fruta_furia.spec.js` → **10 passed (2.5m)** (5 desktop + 5 mobile).
Durante el desarrollo hubo corridas fallidas por la carga de la máquina (un `newContext` que no llegó a crearse, muestreo por reloj); por eso las pruebas miden por tiempo de juego o por estado, no por reloj.

Además se verificó aparte (script Playwright, no en la spec) la ruta de la bomba: explosión → pausa congela → reiniciar no dispara el fin viejo.

## Pendientes / problemas conocidos

- El silencio no tiene prueba automática (sólo se verificó leyendo el código: ganancia maestra + no se crean osciladores).
- La ruta de la bomba no está en la spec porque depende del azar (bombas desde los 8 s); se verificó con un script aparte.
- El fondo del menú y de la pantalla de fin sigue animándose a 60 fps (es parte de la presentación); no se limitó.
- Accesibilidad: el juego es de deslizar, no hay alternativa por teclado ni gamepad para cortar.
- Sin prueba en dispositivo real (sólo emulación Pixel 7 en headless).
