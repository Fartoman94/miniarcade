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

## MiniArcade 3.0

### Estado antes → después

| Antes | Después |
|---|---|
| 6 frutas (dorada como única especial), 1 tipo de bomba sin aviso | + **Helada ❄** (hexágono de hielo, cámara lenta 3,5 s), **Ananá gigante 🍍** (óvalo con corona, 3 tajos distintos), **Petardo 🧨** (cilindro rojo con franjas, −1 vida). La bomba clásica ahora lleva una calavera y **todas las bombas se avisan 0,6 s antes** con un ⚠ en el borde inferior, en la columna por donde van a salir |
| Oleadas iguales (6 frutas al azar) cada 16→10 s | Oleadas numeradas (HUD «OLEADA n») con patrones que rotan: abanico, cítricos, lluvia de los costados; 6→10 frutas según la oleada |
| Sin jefe | **Sandía Gigante** cada 4 oleadas: 3 fases (quieta → se balancea → se balancea rápido y escupe fruta), barra de vida y de tiempo; si se acaba el tiempo se va **sin penalizar** |
| Un solo puntero | **Multitáctil**: hasta 3 dedos, cada uno con su rastro y su combo |
| Rastro de dos trazos por segmento | Cinta afinada (cola fina, punta ancha), rosa con combo ≥ 3 |
| Partículas `{}` nuevas por cada gota, gradientes por fruta por frame | Pool fijo de 520 partículas (tope por calidad), sprites de fruta cacheados por tamaño/DPR, fondo cacheado, brillo de faroles cacheado; manchas de jugo en pool |
| Sin misiones, sin dificultad, sin calidad | MLMissions (2 principales + 8 secundarias), 4 dificultades, 3 calidades |

Colisión del tajo **sin cambios**: segmento del trazo contra círculo de radio `r + 4` (mismos radios de las frutas originales). Penalizaciones originales **sin cambios**: fruta común escapada = −1 vida, bomba = fin, 3 vidas en todas las dificultades. Lo nuevo es igual o menos castigador: las especiales (dorada, helada, ananá) y la fruta que escupe el jefe **no** quitan vida si se escapan; el petardo reemplaza al 35 % de las bombas desde la oleada indicada (quita una vida en lugar de terminar la partida).

### Misiones

Se eligen la principal pendiente + 2 secundarias por partida (rotación de MLMissions). Chips abajo a la derecha (`hud: 'br'`): no tapan puntos (arriba-izq.), vidas (arriba-der.), oleada/jefe (arriba-centro) ni la barra del arcade (abajo-izq.).

| id | Tipo | Título | Evento (emitido desde la lógica) | Meta |
|---|---|---|---|---|
| p_boss | principal | Partí la Sandía Gigante | `bossDefeated` | 1 |
| p_wave | principal | Llegá a la oleada 6 | `wave` (max) | 6 |
| s_intact | secundaria | Intacto | `wave` (max), **failOn `lifeLost`** | oleada 3 |
| s_combo | secundaria | Combo ×4 | `combo` (max, por tajo) | 4 |
| s_prec | secundaria | Pulso firme | `precision` (racha de tajos que cortan; un tajo de > 60 px en el aire la corta) | 8 |
| s_citrus | secundaria | Cítricos | `citrus` (naranja o limón) | 12 |
| s_golden | secundaria | Oro puro | `golden` | 2 |
| s_frozen | secundaria | Cámara lenta | `frozen` | 1 |
| s_giant | secundaria | Ananá gigante | `giantSplit` | 1 |
| s_bombs | secundaria | Sangre fría | `bombDodged` (bomba o petardo que cae sin tocarse) | 4 |

`runStart()` al empezar cada partida (también «Reiniciar» y «Otra vez»); `runEnd()` al terminar, al reiniciar desde la pausa, al volver al menú (botón «MENÚ · DIFICULTAD» del fin de partida o «☰ Menú del juego» de la pausa) y al salir al arcade.

### Dificultad

Se elige en el menú de inicio (no durante la partida). Nunca cambia los controles, la colisión ni las vidas.

| Parámetro | Fácil | Normal (= balance anterior) | Difícil | Extremo |
|---|---|---|---|---|
| Velocidad del vuelo (escala de tiempo; misma altura) | ×0,85 | ×1 | ×1,12 | ×1,25 |
| Intervalo entre lanzamientos | ×1,25 | ×1 | ×0,85 | ×0,72 |
| Probabilidad de bomba (tope 30 %) | ×0,6 | ×1 (6 %→20 %) | ×1,3 | ×1,6 |
| Sin bombas los primeros | 12 s | 8 s | 6 s | 4 s |
| Petardos desde la oleada | 4 | 3 | 2 | 1 |
| Sandía Gigante: tajos / segundos | 12 / 18 | 16 / 15 | 20 / 13 | 26 / 12 |
| Frecuencia de especiales (helada, ananá) | ×1,3 | ×1 | ×0,85 | ×0,7 |
| Petardo en la fase 3 del jefe | no | no | 50 % | 50 % |

Récord: **uno solo** para todas las dificultades (`fruta_best` + `ml:scores`, sin cambio de estructura).

### Calidad (🎚 del menú de pausa)

| | Baja | Media | Alta |
|---|---|---|---|
| Tope de DPR del canvas | 1 | 1,5 | 2 |
| Tope de partículas (pool) | 120 (cuadradas) | 260 | 520 |
| Manchas de jugo | 0 | 10 | 22 |
| Luciérnagas | 0 | 8 | 14 |
| Brillo de faroles, sombras de fruta | no | sí | sí |
| Estrellas titilantes | no (horneadas en el fondo) | sí | sí |
| Capas de colinas con paralaje | no (horneadas) | no (horneadas) | sí (3 capas, siguen al filo) |
| Rastro | un trazo | con halo | con halo |

### Cambios visuales

Sprites cacheados con sombreado volumétrico (terminador en la sandía), sombra proyectada 2,5D detrás de cada fruta, manchas de jugo que se desvanecen, cinta del filo afinada, tinte celeste suave durante la cámara lenta (sin parpadeos), cara temática de la Sandía Gigante (cejas y boca; grietas rojas según el daño, aplastamiento suave al recibir tajos). `prefers-reduced-motion`: sin sacudón de cámara, destello de la bomba al 25 % (antes 85 %; ahora 60 % sin la preferencia), sin animación del título/fruta del menú. Menú compacto en pantallas de ≤ 560 px de alto (celular apaisado): dos columnas.

### Pruebas (`tests/e2e/fruta_furia.spec.js`)

Las 5 pruebas anteriores siguen y pasan. Cambiaron tres esperas fijas: ahora esperan con `expect.poll`. Son el tiempo después de «Reiniciar», el resize a 390 px y la ventana de muestreo de la altura del vuelo (de 30 a 60 s). Con la máquina cargada fallaban aunque el juego estuviera bien. Pruebas nuevas (`describe('Fruta Furia 3.0')`, con `?debug=1` para poner fruta quieta y frenar los lanzamientos; los cortes son siempre gestos reales, mouse o toques CDP):

1. **Misiones:** combo ×4 con un tajo real → `s_combo` cumplida; petardo cortado → −1 vida y `s_intact` (failOn) fallida; Sandía Gigante con 2 de vida y tajos reales → `p_boss` cumplida; tras recargar, los logros siguen en `ml:missions`.
2. **Dificultad:** 4 radios; flecha → desde Normal pasa a Difícil (no arranca la partida); toque/clic en Fácil; `D.speed`, `D.spawn` y `D.bossHp` cambian; persiste tras recargar.
3. **Calidad:** baja → DPR 1, canvas = ancho CSS, tope de 120 partículas que no se supera tras cortar 12 sandías, 0 manchas; alta → 520/22/14 + paralaje; media → 260/10, DPR ≤ 1,5.
4. **Especiales:** helada → cámara lenta (`ts < 0,8`) que se termina sola; ananá → 3 tajos (vida 3→2→1→partido), 5+5+40 pts; dorada 50.
5. **Bombas:** aviso previo (está en `warns` y no en `fruits` hasta que termina); si se deja pasar no penaliza; petardo → 1 vida perdida y se sigue jugando; bomba → fin; botón «MENÚ · DIFICULTAD» vuelve al menú y cierra la partida de misiones.
6. **Jefe:** aparece en la oleada 4 con 16 de vida (Normal); un tajo real resta 1 y suma 5; con el tiempo agotado se va sin quitar vidas.
7. **Multitáctil** (sólo proyecto mobile): dos dedos a la vez → 2 tajos activos, 2 frutas cortadas.

Los gestos que dependen del estado se repiten hasta 4 veces con `swipeUntil`. Con la carga en 70–87, un toque CDP a veces llegaba tarde y la prueba fallaba sin que el juego tuviera la culpa.

**Resultado final:** `ML_WORKERS=1 npx playwright test tests/e2e/fruta_furia.spec.js` → **23 passed, 1 skipped (8.6 min)**: desktop 11/11 (multitáctil se saltea a propósito), mobile 12/12. Load average entre 30 y 45 durante la corrida. Corridas anteriores con la máquina más cargada (load 41–87) tuvieron fallas de 1 a 4 pruebas por espera. Todas pasaron al repetirlas solas, y después se reemplazaron esas esperas por `poll`/reintentos.

Un **bug real** que encontraron las pruebas: la dificultad guardada no se leía al cargar, porque se leía antes de `MLMissions.setup`, que es lo que fija el `gameId`. Quedó corregido.

### Mediciones (antes → después)

Script de Playwright propio (no forma parte de la spec): 1280×800, Chromium headless. Primero 8 s en el menú (el bot corta fruta) y después 8 s de partida con tajos reales cada ~0,3 s. «Antes» es el archivo original servido por intercepción de ruta. El original ignora la calidad, así que sus dos filas sólo muestran el ruido de la medición. Durante la medición la máquina estaba **muy cargada (load ≈ 60–70)**: hay que comparar las cifras entre sí y no tomarlas como valores absolutos.

| Versión / calidad | Fase | Frame medio | p95 | Tarea principal por frame | Script+layout por frame | Heap JS |
|---|---|---|---|---|---|---|
| antes (fila "medium") | menú | 33,3 ms | 66,7 | 27,3 ms | 1,61 ms | 1,41 MB |
| antes (fila "medium") | juego | 24,8 ms | 50,0 | 23,2 ms | 2,55 ms | 1,37 MB |
| antes (fila "low") | menú | 31,4 ms | 66,7 | 25,3 ms | 1,53 ms | 2,03 MB |
| antes (fila "low") | juego | 27,5 ms | 66,6 | 26,1 ms | 2,20 ms | 1,66 MB |
| después media | menú | 24,9 ms | 50,0 | 13,6 ms | 1,34 ms | 1,95 MB |
| después media | juego | 24,1 ms | 50,0 | 19,2 ms | 1,66 ms | 1,76 MB |
| después baja | menú | 22,9 ms | 50,0 | 10,5 ms | 1,05 ms | 1,24 MB |
| después baja | juego | 20,4 ms | 33,4 | 14,7 ms | 1,38 ms | 1,93 MB |

Máximo de entidades vivas en la versión nueva (fruta + partículas, muestreo cada ~0,3 s): 17–26. El original no expone las partículas, así que no hay comparación. El canvas 2D no tiene «draw calls» medibles como WebGL.

### Pendientes / NO PROBADO

- Sin prueba en un dispositivo real (sólo emulación de Pixel 7 en headless). El multitáctil se probó con toques CDP, no con dedos reales.
- El silencio sigue sin prueba automática.
- Misiones `p_wave`, `s_prec`, `s_citrus`, `s_golden`, `s_frozen`, `s_giant` y `s_bombs`: los eventos se emiten desde la lógica, pero en la spec sólo se completan `p_boss` y `s_combo`, y sólo falla `s_intact`. La helada, el ananá y el paso de una bomba sin tocarla se prueban como mecánica, no como misión.
- La fase 3 del jefe (escupe fruta y, en Difícil/Extremo, petardos) no tiene prueba propia.
- `prefers-reduced-motion` (sin sacudón, destello al 25 %) se verificó sólo leyendo el código.
- Mediciones tomadas con la máquina muy cargada; conviene repetirlas en reposo.
- Récord único para las 4 dificultades (no es por dificultad).

### Ajuste por CI (GitHub Actions, 2 núcleos)

En CI, la prueba de misiones falló dos veces: `swipeUntil` nunca vio la condición. La fruta que pone `debug.spawn` ya era estática (`still`), así que no se movía. La causa probable es un gesto real que llega tarde o incompleto: si el primer tajo corta sólo 3 de las 4 manzanas, el combo ×4 ya no se puede cumplir aunque se reintente.

Se agregó `__fruta.debug.cut(x1,y1,x2,y2)` (sólo con `?debug`). Arma un tajo sintético que pasa por el mismo `addTrailPoint` + `endSwipe` que el gesto real, con la misma colisión.

- **Usan el gancho**, porque prueban lógica y no entrada: las misiones (combo, petardo/Intacto, jefe), el tope de partículas en la prueba de calidad y los 3 tajos del ananá.
- **Siguen con gesto real** (mouse o toques CDP): helada y dorada, petardo y bomba, el tajo al jefe, multitáctil, y las pruebas originales de cortar y de fin de partida.
- La helada ahora espera el puntaje (que no se vence) en vez de la ventana de cámara lenta.

Resultado: `ML_WORKERS=1` → **23 passed, 1 skipped (7,9 min)**; `ML_WORKERS=4` → **23 passed, 1 skipped (3,9 min)**. Load average de la máquina entre 15 y 37. No se corrió en GitHub Actions.
