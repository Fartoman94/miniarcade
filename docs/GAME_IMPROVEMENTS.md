# Mejoras implementadas — MiniArcade

> Fase 2 (juego por juego), Fase 4 (arquitectura) y Fase 5 (portal). Rama `feat/modernizacion-arcade`, un commit por juego.

## Cambios comunes a los 8 juegos (vía SDK `matelabs/arcade.js`)
- **Pausa real:** Esc, P, Start del gamepad, botón ⏸, o automática al ocultar la pestaña. Detiene el loop y suspende el `AudioContext`. Al reanudar no hay salto de dt y mientras está en pausa no llega entrada al juego.
- **Menú de pausa:** Reanudar · Reiniciar partida · Cómo jugar (instrucciones del juego) · Sonido · Volver al arcade. ¡SALVA AL REY! agrega "☰ Menú del juego".
- **Barra flotante:** ⌂ volver al arcade, ⏸, 🔊 y ⛶ pantalla completa, con bloqueo de orientación si el juego lo pide. En cada juego se ubicó donde no tapa el HUD, revisado con capturas de escritorio y celular.
- **Sonido global:** un solo ajuste de silencio compartido por todos los juegos. Cada juego enruta su audio por un `GainNode` maestro.
- **Gamepad:** mapa por juego, salvo FRUTA FURIA, que es de deslizar y lo tiene desactivado.
- **Récords y estadísticas:** se guardan en `ml:scores` y `ml:stats`. Las claves viejas se siguen leyendo y escribiendo, así que los récords existentes se conservan.
- **Ciclo de vida:** `onExit` en `pagehide` corta el loop y cierra el audio. Cada juego vuelve a arrancar su loop si se restaura desde bfcache.
- **Gancho de pruebas:** cada juego expone un objeto de solo lectura (`window.__<juego>`) para las pruebas automáticas.

## Portal
Catálogo generado desde el registro, buscador, categorías, orden, favoritos, "Seguir jugando", estadísticas del jugador, ficha por juego con URL propia y recomendaciones, accesibilidad, SEO técnico (JSON-LD, Open Graph), manifest y service worker con modo sin conexión. Detalle en [ARCHITECTURE.md](ARCHITECTURE.md).

---

## ¡CLAVADO!

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

_Detalle completo: [docs/games/clavado.md](games/clavado.md)_

---

## FRUTA FURIA

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

_Detalle completo: [docs/games/fruta_furia.md](games/fruta_furia.md)_

---

## MUERTE GLORIOSA

- **Vista escalable (#1, #13):** el mundo se dibuja con una transformación `escala × DPR`. `VS = clamp(min(1, alto/560, ancho/700), 0.4)` asegura que el piso siempre se vea (celular apaisado, ventanas bajas) y que en vertical se vean al menos 700 px de nivel. En pantallas altas el horizonte baja (`OFFY`) en vez de dejar media pantalla de tierra. El cielo, el sol, la luna, las estrellas y las nubes se calculan sobre la vista real.
- **Lienzo DPR-aware (#10):** `devicePixelRatio` con tope 2.
- **Controles táctiles (#2, #3, #4, #14):** botones ◀ ▶ (abajo a la izquierda) y SALTAR (abajo a la derecha), visibles sólo en dispositivos táctiles. Tocar cualquier otro lado del lienzo también salta. Seguimiento por `pointerId` para el multitáctil. Con mouse se conservan los tercios originales. El cartel de muerte se descarta tocándolo. Hay un "buffer" de salto de 120 ms (en tiempo de juego) para toques y teclas cortísimos. En el celular, el HUD y el menú muestran ayuda táctil en lugar de la del teclado.
- **Yunque (#5):** arranca colgado en el cielo sobre su sombra (`ANVIL_Y = -340`) y vuelve a subir al rearmarse. El rearmado de 2,2 s ahora se cuenta en tiempo de juego.
- **Cartel de muerte (#7):** se ignora `e.repeat` y hay un mínimo de 0,3 s antes de poder descartarlo.
- **Récord (#6):** `best` = niveles superados (0..6). Se muestra igual en el menú y en el HUD como `x/6` (con 🏆 al completar todo). Nuevo botón **⏩ SEGUIR EN NIVEL n** en el menú cuando hay progreso parcial (guarda progreso de forma natural).
- **SDK MateLabs Arcade:**
  - `<script src="matelabs/arcade.js">` en el `<head>`; `MLArcade.init` con `toolbar:'tr'`. El bloque de muertes/récord del HUD se movió a `top:56px` y, en pantallas angostas, la píldora "LLEGÁ A LA META" pasa debajo del nombre del nivel para no chocar con la barra.
  - `isActive`: estados `play`/`dying`/`card`/`win`.
  - `onPause`: congela el loop (no agenda más cuadros), limpia las entradas, suspende el `AudioContext` y pausa las animaciones CSS del narrador y del cartel (`body.mg-paused`). `onResume`: reinicia `last` para evitar el salto de `dt`, descuenta la pausa del cronómetro de la partida y relanza el loop.
  - `onRestart`: arranca una partida nueva desde el nivel 1.
  - `onMute`: conectado al audio real. El botón "SONIDO" del menú usa `MLArcade.settings.set('muted', …)`, así que el botón propio y el del SDK comparten estado. El `mg_muted` viejo se migra una sola vez si no existían ajustes del SDK, y se sigue escribiendo.
  - `onExit`: cierra la partida, cancela el `requestAnimationFrame` y cierra el `AudioContext` (con `pageshow` desde bfcache se relanza).
  - `MLArcade.started()` al empezar cada partida y `MLArcade.ended({score: nivelesSuperados})` al terminar el juego o al reiniciar. `MLArcade.scores.submit()` en cada nivel superado. Se sigue escribiendo `mg_best`; al cargar se toma el máximo entre `mg_best` y `MLArcade.scores.best()`.
  - Gamepad: stick/cruceta → flechas, A y B → saltar, X → reiniciar el nivel (R), Start → pausa. Con Espacio/Enter (o A) se arranca desde el menú y desde la pantalla final.
  - Ayuda del menú de pausa en rioplatense.
- **Temporizadores (#8):** el narrador y el yunque usan contadores en tiempo de juego, no `setTimeout`.
- **Entrada (#9):** `blur` y pausa/reanudación limpian las teclas y los punteros.
- **CPU (#11):** en el menú no se dibuja el lienzo y, en pausa, no se agendan cuadros.
- **Compatibilidad (#12):** fallback de `roundRect` a `rect`.
- **Accesibilidad:** `aria-live` en el narrador y en el cartel. Los menús hacen scroll si no entran (celular apaisado).
- Hook de prueba `window.__mg` (sólo lectura del estado, más `P` para los tests).

_Detalle completo: [docs/games/muerte_gloriosa.md](games/muerte_gloriosa.md)_

---

## NEON SURVIVOR

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

_Detalle completo: [docs/games/neon_survivor.md](games/neon_survivor.md)_

---

## ¡SALVA AL REY!

- **Combate del portón y del rey (1, 2):** los monstruos se acercan al frente del portón y atacan si están a menos de `2.7 + alcance·0.5` de su centro. Se guarda la referencia directa al collider del portón. Ahora la misión se puede perder por el portón y por el rey. Para compensar que el portón por fin recibe daño, entre oleadas se repara +10 (aviso "🔨 PORTÓN +10").
- **Temporizadores en tiempo de juego (4):** muerte, caída del rey y victoria usan `endTimer`, que avanza dentro de `update`: se congela en pausa y se cancela al reiniciar. El golpe al portón usa `hitAnim` en lugar de `setTimeout`.
- **Auto-calidad (5):** mide con el tiempo real del cuadro, descarta picos de más de 0.5 s y nunca sube la resolución. El dt sigue recortado, ahora a 0.05 s.
- **Daño (6)** según `n`. **Récord (7):** la victoria guarda 10; se escribe `rey_best` y además `MLArcade.ended({score: oleada})`. El menú lee el máximo entre la clave vieja y `MLArcade.scores.best()`.
- **Rendimiento (8, 9, 13):** `mergeStatic()` agrupa por material todo el escenario que no se anima (casas, árboles, piedras, castillo, faroles salvo caja y halo, etc.) en una malla por material. El menú bajó de 358 a 108 llamadas de dibujo y la escena de 348 a 94 geometrías. Los monstruos clonan una plantilla (geometría compartida, solo el material del cuerpo es propio y se libera al morir). Gotas con recursos compartidos, `dispose` del material de los arcos, colores precalculados y escrituras al DOM solo cuando cambia el valor.
- **Fin de partida (10):** con el estado en `over`, los monstruos quedan quietos y `damageGate`/`damageKing` solo actúan durante la partida.
- **SDK MateLabs:** `matelabs/arcade.js` va en el `<head>`. La barra está en `bl` (abajo a la izquierda), libre del HUD en escritorio, vertical y apaisado. La pausa es real: corta el `requestAnimationFrame`, suspende el `AudioContext`, congela el cartel animado, suelta la entrada y al reanudar reinicia el reloj sin salto de dt. `isActive` es verdadero en `play` y en `dying`. "Reiniciar" vuelve a empezar el mismo modo. El silencio usa una ganancia maestra y respeta el ajuste inicial. `onExit` corta el bucle y cierra el audio. `started()` se llama al empezar cualquier modo y `ended()` al terminar la misión o volver al menú.
- **Gamepad:** stick/cruceta → WASD, A saltar, X golpear, B correr, LB/RB girar la cámara. Se agregaron **Q/E** para girar la cámara con teclado, que antes solo se podía con el clic derecho. Las líneas de ayuda en español aparecen en el menú de pausa.
- **Móvil (3, 14):** layout compacto para pantallas de hasta 540 px de alto y `overflow-y:auto` en el menú y el cartel final. En vertical, el HUD se reorganiza (barras debajo de las placas) y la marca de agua sube para no quedar tapada por la barra. Los botones táctiles solo se ven durante la partida (`body.playing`). Se agregó `pointercancel` en los botones y se reajusta el tamaño en `orientationchange`.
- **Pruebas:** `window.__rey.snap()` es un estado de solo lectura. Con `?debug=1` se agregan atajos de prueba (`hurt`, `gate`, `spawn`, `near`, `setWave`, `teleport`).

_Detalle completo: [docs/games/salva_al_rey.md](games/salva_al_rey.md)_

---

## TORRE INFINITA

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

_Detalle completo: [docs/games/torre_infinita.md](games/torre_infinita.md)_

---

## TURBO FURIA

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

_Detalle completo: [docs/games/turbo_furia.md](games/turbo_furia.md)_

---

## EL VALLE ENCANTADO

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

_Detalle completo: [docs/games/valle_encantado.md](games/valle_encantado.md)_