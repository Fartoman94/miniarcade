# NEON SURVIVOR — modernización

Archivo: `NEON_SURVIVOR.html` · id `neon_survivor` · pruebas: `tests/e2e/neon_survivor.spec.js`

## Estado anterior

- **Tecnología:** un solo HTML con Canvas 2D y JavaScript plano, sin dependencias externas (sólo `matelabs/intro.js` de la marca). Sin audio.
- **Mecánicas:** survivor-like. El jugador (círculo cian) se mueve con WASD/flechas y dispara solo al enemigo más cercano dentro de su alcance. Dos tipos de enemigo (rojo común, magenta grande). Los enemigos dejan orbes de XP; al subir de nivel se elige 1 de 3 mejoras al azar (velocidad, cadencia, daño, proyectil+, alcance, imán, regeneración, vida máx., piercing, crítico). La dificultad sube linealmente con el tiempo (`1 + t/15`).
- **Pantallas:** menú/Game Over (mismo overlay), HUD DOM (vida, XP/nivel, reloj, puntaje), overlay de "¡SUBISTE DE NIVEL!" con tarjetas.
- **Persistencia:** récord en `localStorage['neonBest']`.
- **Entrada:** sólo teclado (`e.key`), sin táctil ni gamepad. Sin pausa.

## Hallazgos de la auditoría

Reproducciones hechas con Playwright sobre la versión original (servida por intercepción de ruta) — script de auditoría con `page.evaluate` y capturas.

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | crítico | CONFIRMADO | Inmanejable en celular: no hay controles táctiles. | Pixel 7: arrastre táctil de 80 px durante 0,5 s → el jugador se movió **0,0 px**. |
| 2 | alto | CONFIRMADO | Toda la simulación es "por frame": movimiento, balas, enemigos, orbes y partículas ignoran `dt`. En un monitor de 120/144 Hz el juego corre al doble/más; con frames lentos va en cámara lenta. | `update(16)` y `update(50)` movieron al jugador lo mismo: **3,2 px** cada uno. |
| 3 | alto | CONFIRMADO | `startGame()` lanza otro `requestAnimationFrame(loop)` sin cancelar el anterior: dos bucles en paralelo (doble velocidad de movimiento y doble costo de dibujo). Afectaría a cualquier "reiniciar" en plena partida. | Llamando `startGame()` dos veces: **59 → 122** `draw()` por segundo. |
| 4 | alto | CONFIRMADO | Rendimiento colapsa en partidas largas: enemigos sin tope y `shadowBlur` por entidad en cada frame. | Simulando 8 min: **2063 enemigos** vivos, `draw()` ≈ **108 ms**; a los 5 min, **9,1 FPS** medidos (869 enemigos). |
| 5 | alto | CONFIRMADO | Sin pausa (ni con pestaña oculta); el SDK no estaba integrado. | Inspección + no existe manejador de Esc/visibilidad. |
| 6 | medio | CONFIRMADO | Subir varios niveles con un mismo orbe da una sola mejora (las tarjetas se regeneran y se pierden las demás). | Orbe de 30 XP: nivel **1 → 4**, se mostró una sola elección y al elegir se cerró. |
| 7 | medio | CONFIRMADO | Una bala con piercing golpea al mismo enemigo en cada frame mientras lo atraviesa (gasta todo el piercing en un enemigo). | Bala con `pierce: 5` contra un enemigo: **6 impactos** sobre el mismo enemigo. |
| 8 | medio | CONFIRMADO | Tecla "pegada": si se suelta una tecla con la ventana sin foco, el jugador sigue caminando solo. | `keydown d` + `blur` → `keys.d` sigue en `true`. |
| 9 | medio | CONFIRMADO | Las tarjetas de mejora salen apiladas en columna también en PC (`#cards` era un bloque, no flex). | Coordenadas de las 3 tarjetas: misma `x` (530), `y` 285/428/571. |
| 10 | medio | CONFIRMADO | Enemigos más rápidos que el jugador base sin techo (a los 8 min: 3,25 vs 3,2) y vida lineal infinita: después de cierto punto es imposible. | Simulación de 8 min: `maxEnemySpeed` 3,25. |
| 11 | bajo | CONFIRMADO | Canvas sin DPR: borroso en pantallas retina/celulares. | `cvs.width = innerWidth` sin escalar. |
| 12 | bajo | CONFIRMADO | En celular el título ocupa todo el ancho y queda pegado al borde (sin padding). | Captura Pixel 7: el `h1` mide 412 px = ancho total. |
| 13 | bajo | CONFIRMADO | Asignaciones por frame (`filter`, objetos nuevos por bala/partícula, gradiente de viñeta recreado cada frame) y 5 escrituras de DOM por frame aunque no cambien. | Lectura del código. |
| 14 | bajo | SOSPECHADO | Los orbes no recogidos no desaparecen nunca → el arreglo crece sin límite en partidas largas. | Lectura del código (no medido aislado). |
| 15 | bajo | CONFIRMADO | Sin forma de elegir mejora con teclado/gamepad; el menú no arranca con Enter. | Inspección. |
| 16 | bajo | CONFIRMADO | La mejora "Crítico" puede seguir ofreciéndose cuando ya está al máximo (80 %). | Lectura del código. |

## Cambios implementados

**Bucle y simulación**
- Simulación a **paso fijo de 60 Hz** con acumulador: la lógica original "por frame" se conserva exacta (mismas velocidades/sensaciones que en un monitor de 60 Hz), pero ahora es independiente de los Hz. Máx. 8 pasos por frame (por debajo de ~7,5 FPS el juego se ralentiza en vez de acumular atraso); un `dt` > 250 ms (pestaña congelada, depurador) no se intenta recuperar.
- Un único `requestAnimationFrame` vivo (`startLoop` cancela el anterior). El bucle se detiene en menú, Game Over, elección de mejora y pausa (no quema CPU).
- Disparo, invulnerabilidad y parpadeo usan tiempo de juego, no `performance.now()`.

**Integración con el SDK (`matelabs/arcade.js`)**
- `MLArcade.init({ id:'neon_survivor', toolbar:'br', … })`. Barra abajo a la derecha: no pisa el HUD (vida/XP arriba a la izquierda, reloj/puntaje arriba a la derecha) en PC ni en celular.
- `isActive`: jugando o eligiendo mejora. `onPause` corta el bucle, limpia la entrada y suspende el `AudioContext`; `onResume` reanuda con `last = now` (sin salto de `dt`). `onRestart` reinicia la partida. `onExit` corta el bucle y cierra el `AudioContext`. `onMute` conectado al audio real; arranca respetando `settings.muted`.
- `MLArcade.started()` al empezar y `MLArcade.ended({score})` en Game Over. El récord se lee como el máximo entre `MLArcade.scores.best()` y la clave vieja `neonBest`, y se sigue escribiendo `neonBest` por compatibilidad.
- Gamepad: stick/cruceta → flechas, A → Enter (elegir mejora / jugar), B → Esc; Start pausa (SDK).
- Ayuda propia en el menú de pausa (en castellano rioplatense).

**Controles**
- **Joystick táctil flotante**: se apoya el dedo en cualquier lado y se arrastra (analógico, con zona muerta y base que sigue al dedo). También funciona arrastrando con el mouse.
- Teclado por `e.code` (WASD funciona con cualquier distribución) con respaldo por `e.key`. Teclas se limpian al perder foco y al pausar.
- Mejoras: 1/2/3, flechas + Enter/Espacio, gamepad, clic o toque. Bloqueo de 300 ms al aparecer para no elegir sin querer.
- Enter/Espacio arrancan desde el menú y desde Game Over.

**Reglas y dificultad**
- Cada nivel ganado da su mejora (cola de mejoras pendientes, el título muestra "(N mejoras)").
- Las balas perforantes golpean una sola vez a cada enemigo.
- Techo de velocidad para enemigos (comunes 3,0 / grandes 2,4) — el jugador base (3,2) siempre puede escapar si esquiva bien. La vida sigue escalando.
- Nuevos enemigos para variar la curva: **enjambre** naranja (rápido y débil) desde el segundo 45, con probabilidad creciente, y un **Coloso** cada 2 minutos (mucha vida, deja 30 XP), anunciado con un cartel y sonido.
- "Crítico" deja de ofrecerse al llegar al 80 %.

**Rendimiento y memoria**
- Tope de 260 enemigos, 420 partículas y 260 orbes (al pasar el tope, la XP se suma a un orbe existente: no se pierde).
- **Object pooling** de enemigos, balas, orbes y partículas; compactación en el lugar en vez de `filter`; estela en buffer circular.
- Sprites con brillo **pre-renderizados** en canvas offscreen (antes, `shadowBlur` por entidad y por frame), grilla en un solo trazo, viñeta cacheada hasta el próximo resize.
- Canvas DPR-aware con tope 2.
- HUD: sólo toca el DOM cuando cambia algo, y las barras usan `transform: scaleX` en vez de `width`.

**Audio**
- Efectos sintetizados con Web Audio (sin archivos): disparo, impacto, muerte, XP, subida de nivel, daño, Coloso y Game Over. Se crea el `AudioContext` con el primer gesto del usuario, los nodos se desconectan al terminar, y los sonidos repetitivos están limitados en frecuencia.

**Interfaz**
- Tarjetas de mejora en fila en PC y compactas en lista en celular; título del menú con `clamp()`; textos de ayuda distintos para táctil y teclado; "¡NUEVO RÉCORD!" en Game Over con nivel alcanzado; `touch-action: none` y safe areas.
- `prefers-reduced-motion` reduce el temblor de cámara.
- Hook de sólo lectura `window.__neon` para pruebas.

## Mediciones antes/después

Todas en Chromium headless con SwiftShader (render por CPU) en la misma máquina, que además estaba muy cargada (load average 29–42 en 12 núcleos, otros agentes corriendo pruebas en paralelo). Sirven para comparar, no como FPS reales de un dispositivo.

`node tests/perf/measure.mjs after-neon_survivor NEON_SURVIVOR` (mide el **menú**, donde ni antes ni ahora corre el bucle del juego):

| Métrica | Antes (`.perf/before.json`) | Después |
|---|---|---|
| FPS (menú) | 60,4 | 60,3 |
| Peor frame | 16,8 ms | 16,8 ms |
| DOMContentLoaded | 13 ms | 61 ms |
| load | 103 ms | 196 ms |
| Heap JS | 1,2 MB | 1,4 MB |
| Requests / KB | 4 / 28 KB | 6 / 78 KB |
| Long tasks | 0 | 0 |
| Nodos DOM | 35 | 62 |
| Errores | 0 | 0 |

Los requests/KB extra son `matelabs/arcade.js` y `games/registry.js` (compartidos por todo el arcade). Los tiempos de carga se midieron con la máquina saturada; la diferencia de DCL/load está dentro del ruido de esas condiciones y no la atribuyo con certeza al juego.

Mediciones propias **en partida** (script de auditoría en Playwright, mismas condiciones):

| Escenario | Antes | Después |
|---|---|---|
| `draw()` con 260 enemigos, 40 balas, 100 orbes (promedio de 60 frames) | 38,6 ms | 25,8 ms |
| `draw()` con escena vacía | 8,2 ms | 7,3 ms |
| 5 min simulados con jugador inmortal, FPS reales en 4 s | 9,1 FPS (869 enemigos) | 40,2 FPS (261 enemigos, por el tope) |
| Enemigos vivos tras 8 min simulados | 2063 | ≤ 260 |

## Pruebas

`tests/e2e/neon_survivor.spec.js` (proyectos `desktop` y `mobile` Pixel 7):

1. Carga sin errores, menú visible, barra del SDK en `br`, el bucle no corre en el menú.
2. Arranca con entrada real (clic / toque) y la partida avanza (reloj, enemigos, telemetría `start`).
3. (PC) WASD mueve al jugador a ~192 px por segundo de juego (independencia de Hz).
4. (Móvil) el joystick táctil (eventos touch reales vía CDP) mueve al jugador.
5. Esc pausa: estado idéntico durante 1 s, bucle detenido; Esc reanuda sin recuperar el tiempo pausado.
6. Botón de pausa de la barra + "Reanudar" (clic o toque).
7. "Reiniciar partida" del menú de pausa: puntaje 0, tiempo ~0, nivel 1, telemetría `restart`, un solo bucle (el tiempo avanza a ritmo real, no al doble).
8. Subir 2 niveles con un orbe → dos elecciones (tecla 1, luego flechas + Enter en PC; toques en móvil) → nivel 3.
9. Game Over → "¡NUEVO RÉCORD!", se guarda en `ml:scores` y en `neonBest`, persiste tras recargar, y Enter/toque reinicia.
10. Un récord viejo en `neonBest` se muestra.
11. El botón de sonido de la barra llega al audio del juego.
12. Cambiar a viewport 360×640 en plena partida: canvas ajustado, sin scroll horizontal, HUD sin superposición, barra dentro de pantalla.

Resultado final (`ML_WORKERS=1 npx playwright test tests/e2e/neon_survivor.spec.js`, load average ~43): **22 passed, 2 skipped** en 2,3 min (desktop 11 + 1 omitida de sólo-móvil; mobile 11 + 1 omitida de sólo-PC). Corridas anteriores fallaron 1–3 pruebas por umbrales de tiempo real demasiado exigentes con la máquina saturada (con 3–7 FPS headless el juego pasa a cámara lenta); se cambiaron por `expect.poll` sobre el tiempo de juego y la velocidad se mide sólo mientras la tecla está apretada. No fueron fallas del juego.

## Pendientes / problemas conocidos

- Por debajo de ~7,5 FPS el juego entra en cámara lenta (máx. 8 pasos por frame); es intencional para evitar la espiral de atraso, pero en equipos muy lentos el reloj del juego va más lento que el real.
- Los enemigos siguen superponiéndose en un solo "blob" cuando alcanzan al jugador (comportamiento original; no se agregó separación para no cambiar la sensación).
- No se probó con un gamepad físico (sólo el mapeo a teclas del SDK).
- El audio se verificó sólo a nivel de estado (`AudioContext` `running`/silenciado), no escuchando en un dispositivo real.
- El anuncio del Coloso se dibuja con `shadowBlur` sobre texto (sólo 2,5 s cada 2 min; costo aceptable).
