# TURBO FURIA — auditoría y modernización

## Estado anterior

- **Tecnología:** un único `turbo_furia.html`, Three.js r128 desde cdnjs (sin otras dependencias), fuentes de Google Fonts (Bungee, Space Grotesk), intro de marca `matelabs/intro.js`.
- **Mecánicas:** carrera infinita en una ruta de 4 carriles. Se elige vehículo en un garaje 3D (3 autos y 2 motos con velocidad máxima y agilidad distintas). Se cambia de carril libremente, se frena y se usa nitro (barra que se gasta y se recarga). Tráfico con 6 tipos de vehículo y velocidades distintas; adelantar suma 5, pasar rozando ("CASI") suma 50 × combo, cada 5 km hay un hito (+100). 3 vidas con 2 s de invulnerabilidad tras un choque. La dificultad crece con los km (más velocidad tope y más frecuencia de tráfico).
- **Pantallas:** garaje (selección) → cuenta regresiva 3-2-1-¡YA! → carrera con HUD (puntos, vidas, récord, km/h, nitro, combo) → pantalla final (puntos, km, adelantados, "casi", récord nuevo) con "OTRA VEZ" y "GARAJE".
- **Entrada:** teclado (flechas/A D, ↓/S freno, Shift/Espacio nitro, Enter largar), táctil (arrastrar el dedo para doblar, botones FRENO y NITRO).
- **Audio:** WebAudio sintetizado (motor continuo con 2 osciladores + efectos), sin control de volumen ni silencio.
- **Persistencia:** récord en `localStorage['turbo_best']`.
- No tenía pausa, ni botón de sonido, ni soporte de gamepad.

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | alto | CONFIRMADO | Fuga de memoria de GPU: cada cambio de vehículo en el garaje y cada carrera nueva creaban un vehículo nuevo (≈20 geometrías + materiales) y el anterior sólo se sacaba de la escena, nunca se hacía `dispose()`. | Script Playwright contando `createBuffer`/`deleteBuffer` de WebGL: 20 cambios de vehículo llevaron los buffers vivos de **112 a 1392**. Tras el arreglo: **112 → 112**. |
| 2 | alto | CONFIRMADO | En celular vertical (Pixel 7, 412×915) la cámara (FOV vertical 62°) sólo mostraba los 2 carriles del centro cerca del auto: el tráfico de los carriles exteriores aparecía sin aviso. | Captura en el proyecto mobile: los carriles ±5,25 quedaban fuera de cuadro. |
| 3 | medio | CONFIRMADO | Sin pausa: la única forma de parar era cambiar de pestaña (rAF se frena) y al volver el juego seguía sin aviso. Cuenta regresiva y fin de partida usaban `setTimeout`, imposibles de congelar. | Lectura de código; con el SDK integrado los timers seguirían corriendo en pausa. |
| 4 | medio | CONFIRMADO | Con teclado/gamepad no se podía volver a correr desde la pantalla final (sólo con clic), y Espacio (botón A del gamepad) no largaba desde el garaje. | Playwright: `Space` en el garaje no ocultaba `#garage` (`false`). |
| 5 | medio | CONFIRMADO | Teclas "pegadas": si la ventana perdía el foco con una flecha apretada, el `keyup` nunca llegaba y el auto seguía doblando solo. | Playwright: `keydown ArrowLeft` + `blur` → el auto quedó contra el borde izquierdo (captura). |
| 6 | bajo | CONFIRMADO | Tras la pantalla final el auto volvía a acelerar a velocidad tope detrás del overlay (la velocidad objetivo sólo era 0 en `dying`). | Lectura de código (`target` sólo contemplaba `dying`). |
| 7 | bajo | SOSPECHADO | El spawn sólo verificaba el carril propio: podían aparecer 4 vehículos casi a la misma altura y cerrar la ruta (choque inevitable). | No reproducido en la práctica (es aleatorio); se mitigó igual. |
| 8 | bajo | CONFIRMADO | Asignaciones por cuadro: arrays literales de colores creados en cada partícula de nitro. | Lectura de código. |
| 9 | bajo | CONFIRMADO | Sin control de sonido; el audio iba directo a `AC.destination`. | Lectura de código. |
| 10 | bajo | CONFIRMADO | El `resize` no actualizaba el `pixelRatio` (cambio de monitor/zoom). | Lectura de código. |

## Cambios implementados

- **Fuga de GPU (#1):** función `disposeObj()` que libera geometrías, materiales y texturas del vehículo de vista previa y del vehículo del jugador al reemplazarlos. El tráfico ya usaba pools.
- **Cámara en vertical (#2):** `fitCamera()` ajusta FOV (hasta 86°), altura y distancia de la cámara según la relación de aspecto, y atenúa el seguimiento lateral; en horizontal queda igual que antes. El FOV dinámico (velocidad + nitro) se limita a 100°.
- **SDK MateLabs (`matelabs/arcade.js`):** `MLArcade.init({ id:'turbo_furia', toolbar:'tr', ... })`.
  - Pausa real: `onPause` detiene el `requestAnimationFrame` (cero CPU), libera entradas y suspende el `AudioContext`; `onResume` reanuda audio y reinicia el reloj del loop (sin salto de `dt`).
  - Cuenta regresiva y espera de fin de partida pasaron a llevarse en `update(dt)`, así se congelan en pausa y un reinicio no deja timers colgados.
  - `isActive`: cuenta regresiva, carrera y animación de choque final.
  - `onRestart` → nueva carrera con el mismo vehículo; `onExit` corta el loop y cierra el `AudioContext`.
  - `onMute` controla un nodo de ganancia maestro nuevo (todo el audio pasa por él); respeta el ajuste inicial.
  - `MLArcade.started()` al largar y `MLArcade.ended({score})` al terminar (guarda el récord en `ml:scores`). Se sigue escribiendo `turbo_best` y el récord mostrado es el mayor entre ambos.
  - Gamepad: stick/cruceta doblar, A nitro (y largar/otra vez en menús), X o LT freno, RT nitro, B/Start pausa.
  - Ayuda del menú de pausa en español con todos los controles.
  - Barra arriba a la derecha: se bajaron las vidas/récord (`top:56px`) y la firma vertical del garaje; en pantallas angostas la firma "CREADO POR MATELABS" del HUD pasa abajo al centro para no quedar tapada.
- **Teclado en menús (#4):** Enter o Espacio larga desde el garaje (A/D también cambian de vehículo); en la pantalla final Enter/Espacio = "OTRA VEZ" y G/Retroceso = "GARAJE" (con 0,7 s de gracia para no saltearla por accidente). Se ignoran repeticiones de tecla.
- **Teclas pegadas (#5):** `releaseInput()` en `blur` y al pausar.
- **Fin de partida (#6):** el auto queda detenido detrás de la pantalla final.
- **Spawn justo (#7):** no se genera un vehículo si los otros 3 carriles ya tienen uno a menos de 14 m de esa altura.
- **Varios:** colores constantes fuera del bucle, `pixelRatio` (máx. 2) recalculado en `resize`, repintado del cuadro congelado si se redimensiona en pausa, chip de controles del garaje menciona el freno.
- **Ganchos de prueba:** `window.__turbo` (sólo lectura: estado, puntos, distancia, vidas, etc.). Con `?test=1` existe `__turbo.forceCrash()` para probar el fin de partida en tiempo razonable.

## Mediciones antes/después

`node tests/perf/measure.mjs` (Chromium headless, WebGL por **SwiftShader/CPU**, 1280×800, mide el garaje, que es la pantalla inicial).

| Medición | `before.json` (commit anterior, máquina tranquila) | `after-turbo_furia.json` |
|---|---|---|
| FPS | 60,2 | 12,1 |
| Peor cuadro | 16,8 ms | 166,7 ms |
| DCL / load | 589 ms | 3714 ms |
| Heap JS | 5 MB | 6 MB |
| Long tasks | 0 | 3 |
| Nodos DOM | 94 | 117 (barra + menú de pausa del SDK) |
| Requests / KB | 7 / 684 | 9 / 721 (`arcade.js` + `registry.js`) |

**Advertencia:** la medición "después" se hizo con otros 7 agentes renderizando WebGL por CPU al mismo tiempo (load average 42–56 en 12 núcleos); en esa misma corrida `index.html` también cayó de 60,2 a 48,4 FPS. Para separar carga de la máquina de cambios del juego se midió la **versión original y la nueva una después de la otra**, bajo la misma carga (original servida desde una copia aparte):

| Corrida | Original FPS / peor cuadro | Nueva FPS / peor cuadro |
|---|---|---|
| 1 | 11,4 / 166,7 ms | 7,5 / 816,7 ms |
| 2 | 13,2 / 604,1 ms | 13,6 / 166,6 ms |

Las diferencias son ruido de la máquina; el código de render del garaje no cambió. La mejora concreta medible es la de memoria de GPU (hallazgo #1: 1392 → 112 buffers tras 20 cambios de vehículo).

## Pruebas

`tests/e2e/turbo_furia.spec.js` (Playwright, `ML_WORKERS=1`, proyectos desktop y mobile Pixel 7):

1. Carga sin errores de consola; garaje y barra del arcade visibles.
2. Carrera iniciada con entrada real (Enter en PC, toque en "¡A LA RUTA!" en celular); la distancia y la velocidad avanzan; Escape pausa y el estado (distancia, puntos) queda idéntico durante 1 s; "Reanudar" continúa sin salto de distancia; "Reiniciar partida" del menú vuelve a la cuenta regresiva con distancia 0 y 3 vidas.
3. Fin de partida (3 choques con `forceCrash`): aparece la pantalla final con récord nuevo, se guardan `turbo_best` y `ml:scores.turbo_furia`, telemetría `start/end/score`; Enter vuelve a largar; tras recargar el récord sigue en el HUD.
4. Viewport 390×844: sin scroll horizontal, canvas a pantalla completa, la barra no tapa las vidas.
5. Táctil (sólo mobile, eventos touch reales vía CDP): mantener a la derecha dobla a la derecha, a la izquierda vuelve; el botón NITRO se activa mientras se mantiene.
6. El botón de sonido de la barra silencia el juego.

Resultado real: **11 passed, 1 skipped** (el test táctil se saltea en desktop) — desktop 5/5, mobile 6/6, 2,0 min.

## Pendientes / problemas conocidos

- El registro (`games/registry.js`) no menciona el freno en los controles; ver corrección sugerida en el reporte.
- `MLArcade.scores.best()` ignora `legacyBestKey` si se llama antes de que cargue el registro (import asíncrono); el juego lo resuelve leyendo también `turbo_best`.
- Las animaciones CSS (banner de cuenta, popups de puntos) siguen corriendo durante la pausa; es sólo visual.
- No se probó en dispositivos reales ni con un gamepad físico (el mapa se configuró pero no se verificó con hardware).
- Las mediciones de FPS no son representativas por la carga de la máquina durante la sesión (ver arriba).
