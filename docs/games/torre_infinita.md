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

## MiniArcade 3.0

### Estado antes → después

- **Antes:** apilado de un toque con corte, combo de perfectos, cielo por altitud, demo en la portada, SDK (pausa/reinicio/silencio/gamepad/récord). Bloques planos con una cara lateral y tapa, sin misiones, sin dificultad, sin calidad, sin eventos.
- **Después:** mismo algoritmo de corte y de apilado (verificado bloque por bloque contra una copia literal del original), más misiones (MLMissions), selector de dificultad, niveles de calidad reales, tormentas con viento, piezas especiales, dos eventos estructurales “jefe” (bloque gigante y desafío de estabilidad), zonas de altura, bloques 2.5D con sombras proyectadas, paralaje de fondo, mar de nubes, curvatura de la Tierra en la órbita, relámpagos suaves y cámara que se acerca cuando la torre se angosta.

### Algoritmo de corte (sin cambios)

El cálculo se extrajo a una función pura `computeCut(curCx, curW, topCx, topW, baseW, perfK)` con las mismas operaciones en el mismo orden que el `dropBlock` original. En Normal `perfK = 1` y la ventana perfecta es exactamente `Math.max(8, w·0,045)`; el bloque perfecto sigue creciendo 12 px (tope = ancho de la base) y el corte deja `max(l)…min(r)` con fallo total si quedan ≤ 4 px. Las pruebas comparan con `===` el resultado contra el código original copiado literal en el spec (16 casos fijos + 3000 aleatorios con semilla) y re-calculan pila, combo y puntaje de cada bloque de partidas reales y de una partida de 40 pisos.

Puntaje: igual que antes (`1` por bloque, `1 + combo` por perfecto). Lo nuevo se suma aparte y queda registrado por bloque (`__torre.drops[i].bonus`): dorado ×2 sobre los puntos del bloque; bloque gigante +5 (+10 si es perfecto); tormenta superada +5; desafío de estabilidad ganado +10.

### Misiones

| id | Tipo | Título | Evento (emitido en `dropBlock`) | Meta |
|---|---|---|---|---|
| p_altura | principal | Subí 20 pisos | `height` (max) | 20 |
| p_gigante | principal | Domá el bloque gigante | `giantPlaced` | 1 |
| s_perfectos | secundaria | 5 caídas perfectas | `perfect` | 5 |
| s_combo | secundaria | Combo ×4 | `combo` (max) | 4 |
| s_precision | secundaria | Pulso firme | `precise` (perfecto o ≥ 90 % del ancho) | 8 |
| s_sin_cortes | secundaria | Sin cortes grandes | `height` (max), **failOn `bigCut`** (corte que deja < 50 %) | 12 |
| s_tormenta | secundaria | Aguantá la tormenta | `stormCleared` | 1 |
| s_estable | secundaria | Torre estable | `stabilityWon` | 1 |
| s_especial | secundaria | Coleccionista | `special` (bloques especiales apoyados) | 3 |

Dos secundarias por partida (rotación del SDK). `runStart()` al empezar (también desde “OTRA VEZ” y “Reiniciar” de la pausa), `runEnd({won})` al perder, al reiniciar desde la pausa, al volver a la portada y al salir. `won` = la partida superó el récord anterior (el juego no tiene final). HUD de misiones abajo a la derecha (`br`; en pantallas < 760 px se sube a 78 px para no pisar la marca de agua). La pantalla final lista las misiones de la partida (✔/✖).

### Dificultad

Selector en la portada (no durante la partida); botón nuevo “⟵ MENÚ Y DIFICULTAD” en la pantalla final para volver a elegir. La demo de la portada siempre usa Normal. **Un solo récord** para todas las dificultades (no se separó por nivel).

| Nivel | Cruce inicial T0 | −s por piso | T mínimo | Tope de velocidad | Ventana perfecta | Ráfagas de tormenta |
|---|---|---|---|---|---|---|
| Fácil | 2,9 s | 0,025 | 1,7 s | 2,0 × base | ×1,4 | ±12 % |
| **Normal (= original)** | 2,5 s | 0,03 | 1,35 s | 2,4 × base | ×1 | ±20 % |
| Difícil | 2,2 s | 0,035 | 1,15 s | 2,8 × base | ×0,85 | ±26 % |
| Extremo | 1,9 s | 0,04 | 0,95 s | 3,3 × base | ×0,7 | ±32 % |

Los controles no cambian. El calendario de eventos y piezas es el mismo en todos los niveles.

### Calidad (`onQuality`)

| | Baja | Media | Alta |
|---|---|---|---|
| Tope de DPR del canvas | 1 | 2 (como antes) | 2 |
| Tope de partículas vivas | 90 | 220 | 420 |
| Confeti por perfecto / escombros por corte | 10 / 4 | 18 / 6 | 26 / 8 (como antes) |
| Capas de paralaje | 1 (ciudad) | 2 (+ horizonte) | 3 (+ barrio con grúa) |
| Gotas de lluvia | 70 | 150 | 260 |
| Nubes / estrellas | 5 / 50 | 9 / 110 | 9 / 110 |
| Efectos | sin sombras, bandas ni relámpagos | sombras proyectadas, banda de luz, sombra de la torre, mar de nubes, relámpagos | + filo de luz, brillo lateral, nubes sombreadas, estrellas fugaces |

### Contenido nuevo

- **Tormentas** (pisos 16–22, y cada 28): aviso 2 pisos antes, cielo encapotado, lluvia (un único trazo por cuadro, pool fijo), viento que acelera/frena el bloque en movimiento (sólo la velocidad, nunca el corte), relámpago suave como máximo cada 4,5 s (sin destellos estroboscópicos; desactivado con `prefers-reduced-motion`). Superarla: +5.
- **Bloque gigante** (piso 30, y cada 28): aviso 2 pisos antes; viga de acero 1,6× más ancha (mín. +30 px, tope 1,25 × base) y 20 % más lenta. Se corta con el mismo algoritmo (si cae perfecto, la torre se ensancha hasta la base). Apoyarlo: +5 (+10 perfecto); fallarlo termina la partida como cualquier bloque.
- **Desafío de estabilidad** (pisos 37–39, y cada 28): tres fases; cada bloque tiene que conservar ≥ 75 % del ancho (marcas naranjas de tolerancia sobre la torre). Fase 2 suma ráfagas, fase 3 además +12 % de velocidad. Ganarlo: +10; si una fase falla, el aviso pasa a “FALLADO” y no hay bono.
- **Piezas especiales** (pisos fijos fuera de los eventos): dorado (puntos ×2; pisos 5, 29, 41…), hielo (25 % más rápido; pisos 32, 56…), pesado (25 % más lento; pisos 14, 26, 62…), escudo (si el bloque se corta, el combo no se pierde; pisos 11, 23, 35…). Regla: `piso % 12` = 5/8/2/11, salteando los pisos de tormenta, gigante y desafío.
- **Zonas de altura** con aviso: Ciudad → Sobre las nubes (12) → Cielo alto (30) → Estratósfera (55) → Órbita (85).

### Cambios visuales

Bloques 2.5D con frente de dos tonos, cara lateral sombreada, sombra proyectada sobre la tapa del bloque de abajo (también la del bloque en movimiento: muestra con exactitud dónde va a apoyar), sombra de la torre en el piso, paletas cacheadas por tono y nivel de noche (sin strings nuevos por cuadro), texturas propias para cada especial (brillo del dorado, vetas del hielo, sillería del pesado, escudo, viga con cruces y remaches). Fondo: horizonte y ciudad con paralaje generados una vez por tamaño en canvas fuera de pantalla, mar de nubes a media altura, curvatura de la Tierra en la órbita, sol/luna/nubes como sprites cacheados (antes se creaban degradados radiales en cada cuadro). La cámara se acerca hasta 10 % cuando la torre se angosta. Nada se dibuja desplazado respecto de su posición lógica.

### Pruebas

`tests/e2e/torre_infinita.spec.js` (se ocultan los gamepads en todas las pruebas: esta máquina tiene dos joysticks Xbox 360 reales conectados que el SDK convertía en teclas y soltaban bloques solos). Pruebas nuevas: corte idéntico al original; juego real con verificación de cada pila y puntaje; partida de 40 pisos con todos los eventos verificada bloque por bloque; misiones (principal + secundarias cumplidas y persistentes tras recargar; fallo por `failOn`; cierre en fin de partida; reinicio desde pausa); dificultad (teclado, toque, persistencia, velocidad y ventana medidas); calidad (DPR, tope y ráfaga de partículas, capas); tormenta; bloque gigante; desafío de estabilidad (ganado y fallado); piezas especiales; botón de volver a la portada.

Resultados reales (`ML_WORKERS=1 npx playwright test tests/e2e/torre_infinita.spec.js`, máquina con carga media 55–68 por otros agentes):

- Antes de tocar nada: 17 passed, 1 skipped.
- Corrida 1 con los cambios: 41 passed, 2 failed, 1 skipped (ambas en mobile por tiempos: un `touchscreen.tap` que superó los 60 s y un arranque que no pasó a `playing` en 5 s). Se agregó margen (timeout 150 s en las pruebas 3.0, arranque con reintento, `expect.poll` con 20 s).
- Corrida 2: 41 passed, 2 failed, 1 skipped — una prueba vieja (“arranca con entrada real…”, mobile: el toque no arrancó en 5 s) y una nueva (`#over` tardó más de 5 s en aparecer por el `setTimeout` de 550 ms). La prueba vieja no se modificó; reproducida aparte 5/5 veces el toque arranca bien, así que se considera inestabilidad por carga.
- Sólo las 13 pruebas nuevas en mobile: 13 passed. Sólo las nuevas en desktop: 13 passed.
- **Corrida final completa: 43 passed, 1 skipped (desktop 21 + 1 omitida táctil, mobile 22).**

### Mediciones

`tests/perf`-style script propio (Chromium headless 1280×800, juega con Espacio cuando el bloque pasa a < 14 px del centro, 12 s; mide la duración de cada callback de rAF = update+render en JS, y el intervalo entre cuadros). Antes = copia del HTML original servida aparte. **La máquina tenía carga media de 63–69** durante todas las mediciones (otros 7 agentes corriendo pruebas), así que los intervalos están dominados por ruido:

| Corrida | Versión | Calidad | JS por cuadro prom. / p95 (ms) | Intervalo prom. / p95 (ms) | Heap (MB) | Entidades máx. |
|---|---|---|---|---|---|---|
| 1 | original | (no tenía) | 0,639 / 2,8 | 18,97 / 33,3 | 2,79 | — |
| 1 | 3.0 | media | 0,811 / 3,3 | 24,39 / 50 | 3,10 | 19 |
| 1 | 3.0 | baja | 0,712 / 2,9 | 22,23 / 50 | 3,05 | 11 |
| 2 | original | (no tenía) | 0,995 / 5,1 | 28,94 / 66,6 | 2,86 | — |
| 2 | 3.0 | media | 0,824 / 3,7 | 25,26 / 50 | 3,31 | 19 |
| 2 | 3.0 | baja | 0,887 / 4,1 | 29,26 / 66,7 | 3,38 | 11 |

Conclusión honesta: con esta carga no hay diferencia medible entre versiones; el costo JS por cuadro está por debajo de 1 ms en todas. Lo determinista: con calidad baja el tope de entidades fue 11 contra 19 en media (confeti 10 vs 18), y el canvas usa DPR 1 en baja. Antes de los cambios (máquina menos cargada) el original daba 0,36 ms de JS y 16,7 ms de intervalo.

### Pendientes / NO PROBADO

- No se probó en un celular físico (sólo emulación Pixel 7 y capturas 412×915 / 915×412 / 1280×800).
- Récord único para todas las dificultades.
- `registry.js` sigue diciendo `scoreLabel: 'pisos'` (ver informe anterior).
- No se agregó audio de lluvia continuo (sólo truenos sintetizados y sonidos de bono/aviso).
