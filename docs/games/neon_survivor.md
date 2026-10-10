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

## Personaje Mati Octo

### Qué se integró
- Selector de personaje (`MLChars.picker`) en el menú inicial / de Game Over, entre el mejor puntaje y "JUGAR": **Clásico** (el orbe neón original, predeterminado) o **Mati Octo** (el pulpo robot de MateLabs con su mate). Se opera con flechas (radio group) o con toque/clic; la elección se guarda en `ml:character` y persiste al recargar. Elegir no arranca la partida (el selector frena los eventos).
- `matelabs/characters.js` se carga en el `<head>` después de `arcade.js`. Los sprites 2D (`MLChars.loadSprites()`, WebP de 128×128 mirando a la derecha) se piden al elegir Mati o al abrir el juego con Mati ya elegido. Ojo: la vista previa giratoria del propio selector también llama a `loadSprites()` al dibujarse, así que hoy los WebP se descargan al mostrar el menú aunque esté elegido el clásico (es comportamiento del archivo compartido, no del juego).
- Brillo neón **pre-renderizado**: al cargar se arman 6 canvas (3 poses × derecha/izquierda) con un halo cian (`shadowBlur` 9 sobre la silueta + el sprite nítido encima). En cada frame se hace un único `drawImage`; nunca `shadowBlur` por frame. Se regeneran sólo si cambia el DPR.
- CSS: los estilos del botón del menú (`#overlay button`) pasaron a `#playBtn` para no pisar las tarjetas del selector; el overlay usa `justify-content: safe center` y una variante compacta para pantallas de ≤ 500 px de alto (celular apaisado 915×412: todo entra sin scroll). Revisado con capturas en 1280×800, Pixel 7 vertical y 915×412.

### Poses (imágenes estáticas, no animación)
Las 3 poses son imágenes fijas pre-renderizadas, sin esqueleto ni animación. El juego elige una por estado:

| Estado | Pose |
|---|---|
| Quieto | `idle` + vaivén vertical procedural de ±1,2 px (desactivado con `prefers-reduced-motion`) |
| Moviéndose (teclado o joystick) | alterna `run` ↔ `idle` cada 150 ms de juego (zancada falsa) |
| Al subir de nivel | `jump` durante 450 ms de juego (se ve detrás del panel de mejoras y al volver a jugar), elevado 5 px |

No hay salto en el juego; el uso de `jump` es sólo un festejo visual. Mira hacia donde se mueve en horizontal (sprite volteado para la izquierda; con movimiento vertical puro conserva la última orientación).

### Escala y colisionador
- El colisionador **no cambió**: sigue siendo el círculo de radio `player.r = 14` en `(player.x, player.y)` para enemigos, orbes y límites de pantalla. El sprite es sólo visual.
- El cuerpo de Mati se dibuja con 40 px de alto (el orbe clásico mide 28 px más el halo), centrado en el centro del colisionador. El ancla es el centro del recuadro opaco de la pose quieta (medido una vez sobre los píxeles) y es común a las tres poses, así cambiar de pose no desplaza al personaje.
- Efectos existentes: el parpadeo de invulnerabilidad funciona igual (se saltea el dibujo). La estela cian se dibuja con la mitad de opacidad con Mati, porque quieta formaba un disco que tapaba el sprite.

### Si falla la carga
Si los WebP no cargan (error de red o imagen vacía), el juego sigue con el orbe clásico sin cortar nada y muestra un aviso no bloqueante (`#charToast`, `role="status"`, 4,5 s): "No se pudo cargar Mati Octo: seguís con el personaje clásico." La elección guardada no se borra; si se vuelve a elegir Mati en el selector, se reintenta la carga. Si se arranca una partida mientras los sprites todavía cargan, se ve el orbe clásico hasta que llegan.

### Hook de pruebas (`window.__neon`, sólo lectura)
Nuevos campos: `charWanted` (elección guardada), `char` (personaje activo de verdad), `charFailed`, `pose` (`idle`/`run`/`jump`, u `orb` para el clásico), `face` (1 derecha / −1 izquierda), `r` (radio del colisionador).

### Pruebas
3 pruebas nuevas en `tests/e2e/neon_survivor.spec.js` (bloque "personaje Mati Octo"):
1. El selector aparece en el menú con el clásico marcado; se elige Mati con ArrowRight (PC) o toque (móvil), no arranca la partida, persiste tras recargar y se puede volver al clásico (ArrowLeft / toque).
2. Partida con Mati: pose `idle` quieto, `run` y `face = -1` con la flecha izquierda, vuelve a `idle` al soltar, `face = 1` con la derecha, `jump` al subir de nivel y `idle` después. Colisionador: `r` igual al del clásico (14), y un enemigo a `r + e.r + 2` px no lastima mientras que a `r + e.r − 2` px sí.
3. Fallo de red (`page.route` aborta los `.webp` y `.glb`): se avisa, el personaje activo es el clásico y la partida avanza; sin `pageerror` (sólo se ignoran los avisos de recurso abortado a propósito).

Resultado (`ML_WORKERS=1 npx playwright test tests/e2e/neon_survivor.spec.js`): **28 passed, 2 skipped** en 2,2 min (desktop 14 + 1 omitida, mobile 14 + 1 omitida; las omitidas son las de sólo-PC / sólo-móvil que ya existían). Pasó en la primera corrida.

### Rendimiento (medido en partida, Chromium headless 1280×800, DPR 1, load average ~32)
| Medida | Clásico | Mati Octo |
|---|---|---|
| FPS reales en partida, escena vacía (4 s) | 58,4–60,2 | 59,4–60,3 |
| Costo de dibujar sólo al jugador (promedio de 2000) | 21–22 µs | 50–54 µs |
| `draw()` completo con 260 enemigos + 100 orbes (promedio de 60) | 29,7–33,7 ms | 31,1–39,2 ms |
| Heap JS usado | 2,5–3,2 MB | 2,4–3,4 MB |

El costo extra de Mati es ~30 µs por frame; la diferencia en el `draw()` completo está dentro del ruido de la máquina saturada (dos corridas por personaje). Memoria extra: 6 canvas de 81×81 px por DPR (≈ 160 KB a DPR 1, ≈ 630 KB a DPR 2) más los 4 WebP.

### Pendientes
- La vista previa del selector descarga los sprites aunque esté elegido el clásico (ver arriba; habría que cambiarlo en `characters.js`).
- Con movimiento sólo vertical se usa la misma pose lateral (no hay sprites de frente/espalda).
- No probado en un celular físico; los tamaños se verificaron con capturas de Playwright.

## MiniArcade 3.0

### Estado antes → después
- **Antes:** 3 enemigos que sólo perseguían (círculos con brillo de distinto color), un Coloso cada 2:00 que era un círculo grande sin ataques, una sola arma (disparo automático), sólo orbes de XP, sin misiones, sin dificultad ni calidad. 30 pruebas E2E (28 corridas + 2 omitidas por proyecto), todas verdes.
- **Después:** 5 familias nuevas/diferenciadas + élites, Coloso con 3 fases y ataques avisados, oleadas con enjambre, 3 armas nuevas con árbol de mejoras y evoluciones, 4 objetos especiales, misiones (MLMissions), dificultad Fácil/Normal/Difícil/Extremo, calidad baja/media/alta con costos reales, y look 2.5D (sombras de contacto, volumen, profundidad por orden en y, parallax). Se conserva todo lo anterior: controles, récord (`neonBest` + `ml:scores`), Mati Octo, pausa/reinicio/mute/pantalla completa/gamepad. No cambió ninguna estructura de `localStorage` propia del juego.

### Misiones (1 principal + 2 secundarias por partida)
| id | tipo | misión | evento (desde la lógica) | meta |
|---|---|---|---|---|
| coloso | principal | Derrotá al Coloso | `bossKill` | 1 |
| aguante | principal | Aguantá 5 minutos | `survived` (máx., segundos) | 300 |
| elites | secundaria | Cazá 2 élites | `eliteKill` | 2 |
| oleada5 | secundaria | Llegá a la oleada 5 | `wave` (máx.) | 5 |
| masacre | secundaria | Eliminá 150 enemigos | `kill` (agrupado por paso) | 150 |
| intacto | secundaria | Primer minuto sin daño | `minuteClean`, **failOn `hurt`** | 1 |
| botin | secundaria | Juntá 3 objetos especiales | `pickup` | 3 |
| arsenal | secundaria | Desbloqueá 2 armas | `weaponUnlock` | 2 |
| nidos | secundaria | Destruí 2 Nidos | `summonerKill` | 2 |
| nivel10 | secundaria | Llegá al nivel 10 | `level` (máx.) | 10 |

`runStart()` en cada partida (también al reiniciar desde la pausa: antes se cierra la anterior con `runEnd({won:false})`), `runEnd({won: colosos > 0})` en el game over y `runEnd` al salir al portal. HUD de misiones abajo a la izquierda (`hud:'bl'`): no pisa la vida/XP (arriba izq.), el reloj/puntaje/oleada (arriba der.), la barra del Coloso (arriba al centro) ni la barra del SDK (abajo der.).

### Dificultad (se elige en el menú, nunca durante la partida)
Multiplica la curva original; **Normal = 1 = balance de siempre** (mismas fórmulas de vida/velocidad/aparición de los 3 enemigos originales).

| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Vida de enemigos | ×0,75 | ×1 | ×1,3 | ×1,7 |
| Velocidad de enemigos | ×0,85 | ×1 | ×1,1 | ×1,2 |
| Intervalo de aparición | ×1,3 | ×1 | ×0,8 | ×0,65 |
| Daño recibido | ×0,7 | ×1 | ×1,25 | ×1,5 |
| Vida del Coloso | ×0,7 | ×1 | ×1,35 | ×1,8 |
| Coloso cada | 2:00 | 2:00 | 2:00 | 1:30 |
| Duración de avisos | ×1,25 | ×1 | ×0,9 | ×0,8 (mínimo absoluto 0,6 s) |
| Velocidad de disparos enemigos | ×0,85 | ×1 | ×1,1 | ×1,2 |
| Élite cada | 60 s | 45 s | 40 s | 30 s |

Los controles, la velocidad del jugador y el colisionador no cambian. **Récord:** se mantiene uno solo para todas las dificultades (el game over muestra con qué dificultad se jugó).

### Calidad (`onQuality`; «Automática» la resuelve el SDK)
| | Baja | Media | Alta |
|---|---|---|---|
| Tope de DPR del canvas | 1 | 1,5 | 2 |
| Tope de partículas | 140 | 280 | 420 (el original) |
| Capas de fondo (parallax) | 1 (grilla) | 2 (+ grilla grande) | 3 (+ estrellas) |
| Sombras de contacto | no | sí | sí |
| Luz del jugador/Coloso en el piso | no | sí | sí |
| Estela de balas | no | sí | sí |
| Partículas aditivas (`lighter`) | no | no | sí |
| Intensidad del brillo pre-renderizado | ×0,55 | ×1 | ×1 |

Cambiar la calidad limpia la caché de sprites, recorta las partículas vivas y redimensiona el canvas.

### Contenido nuevo
- **Familias** (silueta, animación y aviso propios; el colisionador sigue siendo un círculo de radio `r`, igual que antes):
  - *Drón* (original, rojo, esfera), *Acorazado* (original, magenta, hexágono blindado que se balancea), *Enjambre* (original, naranja, dardo orientado al movimiento).
  - **Embestidor** (rápido, amarillo, chevrón; desde 0:30): se queda quieto y marca un **carril rojo del ancho de su cuerpo** que se llena en 0,7 s (se encoge mientras carga), embiste en línea recta ~225 px y se recupera lento.
  - **Espectro** (evasivo, lavanda, rombo con ojo; desde 1:00): orbita a media distancia, **esquiva** balas que vienen hacia él (enfriamiento 1,6 s), carga un núcleo rojo visible 0,6 s y dispara un proyectil lento apuntado.
  - **Nido** (invocador, verde, pentágono con anillo que gira; desde 1:30, máx. 3): guarda distancia, se detiene, marca 3 puntos verdes 0,9 s y aparecen 3 **Larvas** (tope global 36).
  - **Élite** (cualquier familia base cada 45 s): ×4 vida, cuerpo +35 %, corona dentada dorada que gira, barra de vida dorada; suelta **núcleo + corazón**.
- **Coloso** (reescrito): barra arriba al centro (debajo del HUD en pantallas angostas) con marcas al 60 % y 30 %. F1 pisotón (círculo rojo que se llena 1 s). F2 + ráfaga radial de 14 disparos lentos con huecos (rayos previos que anuncian los ángulos) y embestida con carril. F3 más rápido, doble pisotón (uno donde vas a estar) y 4 larvas marcadas. Al cambiar de fase queda aturdido 0,9 s **pero recibe daño** (sin invulnerabilidad). No se apilan: si sigue vivo, el próximo espera. Cada Coloso tiene +25 % de vida que el anterior. Recompensa: 30 XP (como antes, repartida), núcleo (mejora gratis + 20 % vida), imán y 500 × n.º de Coloso puntos.
- **Oleadas** de 30 s (indicador «OLEADA n»); cada 3 oleadas un **enjambre en anillo** con marcas en el piso 1,1 s antes.
- **Armas** (en las cartas de mejora, con etiqueta «ARMA NUEVA» / «Nv x → y» / «EVOLUCIÓN»): Orbitales (2–5 cuchillas), Pulso (onda que daña y empuja), Rayo (salta entre 3–6 enemigos). Cada una sube a nivel 4 y desbloquea su **evolución** (Anillo de plasma, Supernova, Tormenta). Desde el nivel 3, si no tenés ningún arma, siempre se ofrece una. El menú de pausa muestra el árbol de la partida.
- **Objetos especiales** (dibujados en código, sin emojis): corazón (+25 % vida), imán (absorbe todo el XP), bomba (80 × daño en 420 px), núcleo (mejora gratis). Titilan suave los últimos 3 s.
- Todo con pools y topes: enemigos 260, disparos enemigos 160, avisos 48, objetos 14, rayos 24, partículas según calidad.

### Cambios visuales
Sprites pre-renderizados por familia con volumen (gradiente con luz arriba a la izquierda), borde neón y detalles; sombras de contacto; vaivén leve; orden de dibujo por `y` (profundidad); destello blanco al recibir daño; anillos de onda; luz en el piso alrededor del jugador y del Coloso; parallax de 1–3 capas; estelas de bala en un único trazo. Sin estroboscópicos: los avisos se llenan, no parpadean, y con `prefers-reduced-motion` no hay vaivén, el texto no pulsa y el temblor queda al 25 %. El texto de aviso se achicó para que no toque los bordes en celular vertical.

### Pruebas (Playwright, `tests/e2e/neon_survivor.spec.js`)
Se agregaron 10 pruebas («MiniArcade 3.0»): misiones (principal + secundaria cumplidas, HUD, persistencia tras recargar, rotación de principal), misión con `failOn` (falla al recibir golpe y se cumple en otra partida sin daño; además los 4 objetos), dificultad (teclado en PC / toque en móvil, persiste, vida y daño reales del enemigo, Extremo → Coloso a los 90 s), calidad (DPR, tope de partículas, capas, sombras; también por el botón real del menú de pausa), Embestidor (paso a paso: ≥ 0,6 s de aviso quieto, embestida recta, muerte y puntaje), Espectro (esquiva, dispara, el disparo lastima), Nido (3 larvas y muerte cuenta), Coloso (aviso antes del golpe, 3 fases, recibe daño aturdido, ráfaga, larvas, recompensa, núcleo → mejora), armas (las 3 dañan, tope de nivel, evolución ofrecida, árbol en pausa) y oleadas (oleada 3 → enjambre marcado → 15 enemigos).

Ajustes a pruebas existentes (sin cambiar lo que verifican): un `beforeEach` que oculta los gamepads (esta máquina tiene un mando físico conectado que reporta A apretado y deriva del stick y arrancaba/mudaba la partida sola en headless); `start()` espera hasta 20 s el estado `play`; «Reiniciar…» compara el tiempo de juego contra el tiempo real medido en la página en vez de un tope fijo de 1,3 s (falló una vez con 1,3000000000000014 por carga de CPU).

También: los `expect.poll` de las pruebas viejas pasaron de 5 s a 20 s (fallaban de a una por carga de CPU), y las pruebas de Embestidor, Nido y ráfaga del Coloso avanzan la simulación con `step()` síncrono (ventanas de 0,6–0,9 s que un poll lento podía saltarse). El coordinador avisó que el SDK ahora ignora los gamepads físicos bajo automatización; el `beforeEach` queda como refuerzo inocuo.

**Resultado real** (`ML_WORKERS=2 npx playwright test tests/e2e/neon_survivor.spec.js`, carga del equipo ~40): **48 pasaron, 0 fallaron, 2 omitidas** (táctil en desktop y teclado en mobile, como antes) → desktop 24/24, mobile 24/24. Corridas anteriores de la misma sesión tuvieron 1–3 fallas sueltas por carga (load average 63–71), todas en esperas cortas que ya se corrigieron como se describe arriba.

### Mediciones (partida real, 1280×800, sin gamepad, jugador con vida infinita, mejoras elegidas con la 1.ª carta)
Script `measure.mjs` (scratch): 180 frames de rAF al llegar al tiempo indicado; llamadas = `drawImage/fill/stroke/fillRect/fillText/strokeRect` por frame. **El equipo tenía load average ~65 (otros agentes con juegos 3D): el tiempo de frame lo domina la carga, no el juego.** El costo propio del juego lo da el hook (`stepMs`/`drawMs`, media móvil).

| corrida | t juego | frame medio / p95 (ms) | llamadas/frame | heap (MB) | enemigos | partículas | step / draw (ms) |
|---|---|---|---|---|---|---|---|
| Antes (original) | 65 s | 24,9 / 50,0 | 122 | 3,0 | 11 | 46 | — |
| Después, media | 63 s | 25,9 / 50,1 | 114 | 3,2 | 39 (1 élite) | 107 | 0,20 / 0,81 |
| Después, baja | 66 s | 29,3 / 50,1 | 152 | 4,5 | 26 | 38 | 0,27 / 0,88 |
| Después, media | 142 s | 33,9 / 83,3 | 160 | 4,2 | 24 (Coloso, 4 embest., 6 espectros) | 42 | 0,16 / 0,85 |
| Después, baja | 137 s | 21,3 / 33,4 | 109 | 3,9 | 33 (Coloso, Nido, 10 larvas) | 121 | 0,26 / 1,01 |

Lectura honesta: las escenas no son iguales entre corridas (aleatoriedad), así que «baja vs. media» no se puede comparar por llamadas; lo medible y probado de la calidad son sus topes (DPR 1/1,5/2, partículas 140/280/420, capas 1/2/3, sombras). En desktop el DPR ya es 1, así que ahí el tope de DPR no cambia nada; en un celular de DPR 2,6 baja el canvas de 2× a 1,5× o 1×. Step + draw del juego quedan en ~1 ms por frame en todas las corridas. Las corridas de 137–142 s (con Coloso natural, sin ayudas de depuración) no tiraron errores visibles en el juego (el script no captura la consola; la ausencia de errores la verifican las pruebas E2E).

### Pendientes / NO PROBADO
- No probado en un celular físico ni con gamepad real (sólo emulación de Playwright + capturas 1280×800, Pixel 7 412×915 y 915×412 apaisado).
- No se midió en un equipo sin carga; los ms de frame de arriba están inflados por el resto de los agentes.
- Récord único para todas las dificultades (por dificultad no era trivial sin tocar el SDK de puntajes).
- Las evoluciones no tienen sprite propio más allá de color/tamaño (Anillo de plasma) o radio/frecuencia.
- Sonido nuevo (aviso, pisotón, rayo, pulso, objeto, élite) sintetizado y sin revisar con oído humano.
- Balance de las familias nuevas en Normal ajustado a ojo; Normal mantiene exactamente las fórmulas originales para los 3 enemigos de siempre, pero la partida igual es distinta porque aparecen familias nuevas desde 0:30.
