# MUERTE GLORIOSA — modernización

## Estado anterior

- **Tecnología:** un único `muerte_gloriosa.html`, Canvas 2D puro, sin dependencias de JS. Fuentes de Google Fonts (Lilita One, Nunito). Audio sintetizado con Web Audio (osciladores + buffer de ruido).
- **Mecánicas:** plataformas "troll" de 6 niveles. Caminar (←/→, A/D), saltar (Espacio/↑/W) y llegar a la bandera de META. Trampas: pinchos, yunques que caen, sierras, barriles TNT, trampolines que te lanzan al cielo. Cada muerte genera un ragdoll, un cartel con un título y un chiste al azar, y la frase de un narrador. Las muertes son ilimitadas: el "puntaje" es hasta qué nivel llegás.
- **Pantallas/estados:** `menu` → `play` → `dying` → `card` (cartel de muerte, se descarta con tecla o toque) → `play` …; `win` (1,6 s de festejo) → siguiente nivel; al terminar el nivel 6, `over` (estadísticas: niveles, muertes, tiempo).
- **Persistencia:** `localStorage` `mg_best` (niveles superados), `mg_deaths` (muertes totales) y `mg_muted`.
- **Loop:** `requestAnimationFrame` con `dt` limitado a 33 ms y cámara lenta al morir.

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | crítico | CONFIRMADO | En un celular apaisado (o cualquier ventana de menos de unos 480 px de alto) el piso, que está fijo en y=470 px, queda fuera de la pantalla: no se ve el personaje ni las trampas. | Playwright con `Pixel 7 landscape` (863×360): en la captura sólo se veía cielo. |
| 2 | crítico | CONFIRMADO | En pantallas táctiles no se podía descartar el cartel de muerte: el `#card` tapa el lienzo y el `pointerdown` sólo se escuchaba en el `<canvas>`. Quedabas trabado para siempre (salvo con la tecla R). | Playwright móvil: morir y tocar el cartel → `#card` seguía con `.show`. |
| 3 | alto | CONFIRMADO | No había controles táctiles visibles (el registro dice "Botones en pantalla") y el HUD mostraba atajos de teclado en el celular. Los tercios de la pantalla eran zonas invisibles. | Captura móvil. |
| 4 | alto | CONFIRMADO (por código + test) | Multitáctil roto: cualquier `pointerup` ponía `touchL = touchR = false`, así que al soltar el dedo que saltaba se frenaba el que corría. `touchJ` estaba declarado y nunca se usaba. | Lectura del código. El test móvil ahora mantiene ▶ (pointerId 11), toca SALTAR (pointerId 12) y verifica que se siga avanzando. |
| 5 | medio | CONFIRMADO | El yunque arrancaba apoyado en el piso, debajo de su propia sombra roja, y al activarse se teletransportaba 340 px hacia arriba para caer. La sombra (columna roja desde el cielo) y la lógica de caída indican que tenía que arrancar colgado arriba. | Captura de escritorio: el yunque aparecía sobre el pasto con la columna de aviso encima. |
| 6 | medio | CONFIRMADO | Récord inconsistente: el menú mostraba "NIVEL `best`" y el HUD "NIVEL `best+1`" (con 6 niveles superados el HUD decía "NIVEL 7"). | `mg_best=2` → menú "NIVEL 2", HUD "RÉCORD: NIVEL 3". |
| 7 | medio | SOSPECHADO (por código) | El cartel de muerte se descartaba con la auto-repetición de la tecla que venías manteniendo (casi siempre →), así que el chiste no llegaba a leerse. | Por código: `keydown` sin chequear `e.repeat`. El test ahora envía un `keydown` con `repeat:true` y verifica que el cartel siga visible. |
| 8 | medio | CONFIRMADO (por código) | No había pausa. Los temporizadores del yunque (`setTimeout` de 2,2 s) y del narrador (2,5 s) iban en tiempo real, así que no se iban a poder congelar. | Lectura del código. |
| 9 | bajo | CONFIRMADO (por código) | Si se suelta una tecla con la ventana sin foco (alt-tab), queda "pegada" y el personaje sigue caminando. | Lectura del código (no había `blur`). |
| 10 | bajo | CONFIRMADO (por código) | Lienzo sin `devicePixelRatio`: se ve borroso en celulares y pantallas retina. | `cv.width = innerWidth`. |
| 11 | bajo | CONFIRMADO (por código) | En el menú se redibujaba el fondo del lienzo 60 veces por segundo detrás de un overlay opaco (CPU desperdiciada). | Lectura del código. |
| 12 | bajo | SOSPECHADO | `ctx.roundRect` no existe en Safari < 16: el juego tiraba error al dibujar al personaje. | No reproducido (no hay Safari viejo). |
| 13 | bajo | CONFIRMADO | En pantallas altas quedaba más de media pantalla de tierra marrón bajo el horizonte. | Captura de escritorio de 1280×800. |
| 14 | bajo | CONFIRMADO (por código) | Un toque/tecla muy corto (soltado antes del siguiente cuadro) podía no saltar. | Lectura del código. |
| — | info | — | La muerte `fall` (caer al vacío) es inalcanzable porque no hay pozos. Quedó como estaba. | Lectura del código. |

## Cambios implementados

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

## Mediciones antes/después

`node tests/perf/measure.mjs after-muerte_gloriosa muerte_gloriosa` (Chromium headless, 1280×800, **SwiftShader/CPU**, se mide en el menú; sirve para comparar antes y después en la misma máquina, no son FPS reales de un dispositivo. Además había otros agentes usando la CPU al mismo tiempo).

| Métrica | Antes (`.perf/before.json`) | Después |
|---|---|---|
| FPS (menú) | 60.4 | 60.2 |
| Peor cuadro (ms) | 16.8 | 16.8 |
| DOMContentLoaded (ms) | 201 | 163 |
| load (ms) | 374 | 301 |
| Heap JS (MB) | 1.6 | 0.9 |
| Long tasks | 0 | 1 |
| Nodos DOM | 83 | 113 |
| Requests | 7 | 9 |
| KB transferidos | 110 | 151 |
| Errores | 0 | 0 |

La baja del heap se explica porque el menú ya no redibuja el lienzo. Los requests, KB y nodos DOM extra son `arcade.js`, `games/registry.js`, la barra y el menú de pausa del SDK, y los botones táctiles. La long task extra es de la carga, no del loop: no se investigó más.

## Pruebas

`tests/e2e/muerte_gloriosa.spec.js` (10 tests):

1. Carga sin errores de consola y con el SDK inicializado.
2. Jugar con teclado real: el personaje avanza, cambia la distancia a la meta en el HUD, el salto funciona y la telemetría registra `start`.
3. Esc pausa: el estado (posición, tiempo, nivel, muertes) queda idéntico durante 1 s; reanudar hace avanzar el tiempo, y una tecla soltada durante la pausa no queda pegada.
4. Reiniciar desde el menú de pausa (con el cartel de muerte abierto) vuelve al nivel 1 con 0 muertes.
5. Muerte → cartel: la auto-repetición no lo saltea y una tecla nueva hace reaparecer al personaje.
6. Completar los 6 niveles (teletransportando al personaje a la meta) → pantalla final 6/6, telemetría `end`, y el récord persiste tras recargar tanto en `mg_best` como en `MLArcade.scores`.
7. Récord parcial: el botón SEGUIR arranca en el nivel siguiente.
8. Cambiar el viewport a 412×839, 863×360 y 1280×800: el piso queda visible, no hay scroll horizontal y DPR ≤ 2.
9. (Sólo mobile) Botones táctiles: SALTAR, mantener ▶ con un dedo mientras otro toca SALTAR, morir y descartar el cartel tocándolo.
10. Silencio: el botón del menú y el del SDK comparten estado y persiste tras recargar.

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/muerte_gloriosa.spec.js`):
**15 passed, 5 skipped (5.2m)**. Desktop: 9 passed y 1 skipped (el test táctil). Mobile (Pixel 7): 6 passed y 4 skipped (los que usan teclado físico).

## Pendientes / problemas conocidos

- En celular apaisado, al arrancar el nivel el personaje (x=120) queda parcialmente detrás de los botones ◀ ▶ (son translúcidos) hasta que la cámara empieza a seguirlo.
- La muerte `fall` sigue siendo inalcanzable (no hay pozos). No se agregaron pozos para no cambiar el diseño de los niveles.
- El cambio del yunque (colgado arriba en vez de apoyado en el piso) modifica un poco la dificultad: corriendo a toda velocidad se lo esquiva y, si te quedás debajo, te aplasta. Antes había que saltarlo como un obstáculo y caía mientras estabas en el aire.
- El fallback de `roundRect` no se probó en un Safari viejo real.
- No se midió el rendimiento durante la partida (`measure.mjs` mide el menú).

## Personaje Mati Octo

### Qué se integró

- `matelabs/characters.js` se carga en el `<head>` después de `arcade.js`. El selector compartido (`MLChars.picker`) está en el menú inicial, entre los botones y las estadísticas, con el título «ELEGÍ TU VÍCTIMA». Las opciones son «Clásico» (🤕, el personaje original, que sigue siendo el predeterminado) y «Mati Octo». Se maneja con flechas, Tab o toque, y la elección se guarda en `ml:character` (sobrevive a la recarga).
- Mati se dibuja con los 3 sprites 2D pre-renderizados (`MLChars.loadSprites()`, 128×128 WebP mirando a la derecha). Cuando camina a la izquierda el sprite se espeja (`scale(-1,1)`).
- En el lienzo, las tarjetas del selector se oscurecieron con CSS propio del juego para que el texto blanco se lea sobre el cielo celeste del menú.
- En pantallas bajas (`max-height:430px`, celular apaisado) el selector va en una sola fila, y el texto del menú y las tarjetas de estadísticas son más compactos. Con eso el menú entra completo en 915×412 sin scroll; antes del cambio ya desbordaba 10 px. Se revisó con capturas en 1280×800, Pixel 7 vertical y 915×412.

### Poses (sprites estáticos, no animación)

Son 3 imágenes **fijas**: no hay esqueleto ni animación. Se elige una según el estado del jugador:

| Estado del juego | Pose |
|---|---|
| En el piso y `|vx| ≤ 30` | `idle` (quieto) |
| En el piso y `|vx| > 30` | `run`, alternando con `idle` cada ~1,9 unidades de `P.walk` (≈0,15 s a velocidad máxima) para simular el paso |
| En el aire | `jump` |

Además hay movimiento procedural barato, anclado en los pies: una «respiración» leve (±1,5 % de alto) cuando está quieto, una inclinación hacia adelante de hasta 0,08 rad al correr con un pequeño rebote en el cuadro `idle` del paso, y un estiramiento/aplastamiento según `vy` en el aire.

### Escala y colisionador

- El colisionador **no cambió**: `P.w=26`, `P.h=54` y todas las pruebas de trampas usan `P.x`/`P.y` igual que antes, sin importar el personaje.
- Escala: el recuadro opaco de cada pose se mide una sola vez al cargar (con `getImageData`; si falla, se usan valores fijos). La escala es común y sale de la pose quieta: Mati mide 80 unidades de alto, como el clásico (de los pies a la punta del gorro, ≈81). El centro horizontal también es común, así que cambiar de pose no corre al personaje. Cada pose apoya su borde inferior real en `P.y`: los pies quedan sobre el piso, sin hundirse.
- Muerte: el «ragdoll» (pedazos rectangulares, cabeza con ojos en X) es el mismo efecto que antes, pero con Mati usa su paleta (azul, azul oscuro, cian) y suma un pedazo marrón que vuela: el mate. No hay destello de golpe en este juego (`P.inv` sólo existe para el reinicio).

### Carga diferida y fallback

- El juego sólo pide los sprites si el personaje elegido es Mati (al cargar la página) o cuando se lo elige en el selector.
- **Ojo:** el `picker` compartido igual pide los sprites para su vista previa giratoria apenas se crea, aunque esté elegido el Clásico. Eso está en `characters.js`, no en el juego.
- Si los sprites no cargan, el juego dibuja al clásico (`charDrawn: 'clasico'`) y muestra un aviso breve que no bloquea: «No se pudo cargar a Mati Octo: seguís con el personaje clásico.». El selector muestra además su propio mensaje. Al empezar una partida nueva se reintenta la carga en silencio.
- Mientras se cargan, se ve el clásico (en local tarda unos pocos ms).

### Gancho de pruebas

`window.__mg` suma: `char` (elegido), `charDrawn` (el que realmente se dibuja), `charLoad` (`idle|loading|ready|failed`), `pose` (`classic|idle|run|jump`: la imagen visible), `poseState` (estado lógico), `collider` (`{w,h}`), `frameMs` (media móvil del tiempo de CPU por cuadro) y `frameN`.

### Pruebas

Se agregaron 3 tests a `tests/e2e/muerte_gloriosa.spec.js`:

1. Selector: se ve el radiogroup. En escritorio se elige con flechas (→ Mati, ← Clásico) y en mobile con toque. La elección no arranca la partida y persiste tras recargar.
2. Partida con Mati: se dibuja Mati, el colisionador es igual al del clásico (`{w:26,h:54}`) y las poses pasan por `idle` → `run` (corriendo) → `jump` (en el aire). Sigue muriendo en los pinchos.
3. Fallback: con `page.route` se abortan todas las peticiones a `matelabs/characters/`. Aparece el aviso, la partida se juega con el clásico (avanza más de 60 px) y no hay `pageerror`. Sólo se ignoran los «Failed to load resource» de los pedidos abortados a propósito.

Además, el test existente «jugar: el personaje avanza…» medía 600 ms fijos de caminata y falló una vez bajo carga (177 px contra los 180 pedidos). Ahora usa `expect.poll`, con el mismo umbral.

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/muerte_gloriosa.spec.js`): **21 passed, 5 skipped (3.1m)**. Desktop: 12 passed y 1 skipped. Mobile (Pixel 7): 9 passed y 4 skipped.

### Rendimiento (medido en partida real)

Escritorio 1280×800, Chromium headless. El personaje corre a la derecha durante 4 s (invulnerable, sólo para la medición), 241 cuadros por corrida, 2 corridas por personaje:

| | Clásico | Mati |
|---|---|---|
| CPU por cuadro (media, corrida 1 / 2) | 0,50 / 0,25 ms | 0,34 / 0,25 ms |
| FPS / p95 entre cuadros | 60 / 16,8 ms | 60 / 16,8 ms |
| Heap JS usado | 3,22–3,30 MB | 3,38–3,39 MB |

La diferencia de CPU está dentro del ruido. El clásico son ~15 trazados vectoriales por cuadro y Mati es un solo `drawImage`. El heap sube ~0,1 MB por los sprites y los recuadros (las imágenes decodificadas no cuentan en el heap JS). En 2D no hay «draw calls» de WebGL para comparar.

### Pendientes

- Lo de la vista previa del `picker` compartido: descarga los sprites de Mati aunque no esté elegido.
- No hay sprite de muerte de Mati: el ragdoll son rectángulos con su paleta, no partes reales del modelo.
- Mati es casi todo azul. Sobre el cielo celeste del nivel diurno se lee bien gracias al contorno oscuro, pero contrasta menos que el clásico.

## MiniArcade 3.0

### Estado antes → después

| | Antes | Después |
|---|---|---|
| Niveles | 6 (un solo «acto») | 10: **Acto 1** = los 6 originales intactos (mismas trampas, mismas posiciones) + **Acto 2: la venganza del nivel** (7–10), que se desbloquea al terminar el Acto 1 |
| Terreno | piso plano infinito | pozos, plataformas de una vía, piedras que se rompen, plataforma móvil, cintas transportadoras (Acto 2) |
| Trampas | pinchos, yunque, sierra, TNT, trampolín | + prensa hidráulica (con aviso), sierra en riel vertical, meta que sale corriendo, pozo (la muerte `fall` ahora existe) |
| Jefes | — | 2 «jefes ambientales» sin combate: **La Grúa Loca** (nivel 8) y **La Aplanadora** (nivel 10) |
| Progreso dentro del nivel | — | banderas de CONTROL en el Acto 2 (2 por nivel; en Extremo no hay) |
| Secretos | — | 8 «pollos de goma dorados» opcionales (4 en el Acto 1 sin tocar el recorrido, 1 por nivel del Acto 2) |
| Desafíos sin morir | — | cada nivel superado sin morir queda marcado (💀0 ✔ en el HUD, «SIN MORIR x/10» en el menú) + misiones |
| Misiones / dificultad / calidad | — | MLMissions (2 principales + 7 secundarias), selector Fácil/Normal/Difícil/Extremo, `onQuality` |
| Visual | cielo + colinas, sin sombras | parallax de 3 capas pre-dibujadas por tema, sombras proyectadas, brillos cacheados, viñeta nocturna, partículas en pool, «alma» y onda al morir, aplastamiento al caer, cámara con anticipación |

**Datos guardados nuevos** (no se tocó ninguna clave vieja): `mg_best2` (niveles del Acto 2, 0..4), `mg_secrets` (ids de pollos encontrados), `mg_clean` (niveles superados sin morir). `mg_best` sigue siendo 0..6 (Acto 1) y `MLArcade.scores` recibe el total de niveles superados (hasta 10). Al cargar: `best = min(6, max(mg_best, sdk))` y `best2 = min(4, max(mg_best2, sdk − 6))`. **Un solo récord para todas las dificultades** (guardarlo por dificultad no era trivial con el SDK y la clave vieja).

### Misiones (MLMissions, `hud:'bl'`, 2 secundarias por partida)

Los eventos salen de la lógica (física, trampas, jefes), nunca del dibujo. `runStart()` en cada partida (también al reiniciar desde la pausa) y `runEnd({won})` al terminar el acto, al reiniciar y al salir. Como dos misiones sólo existen en el Acto 2, `MLMissions.setup` se llama con la lista del acto antes de `runStart()` (mismo `gameId`, mismos logros).

| id | Tipo | Título | Evento (origen) | Meta | Acto |
|---|---|---|---|---|---|
| p_tres | principal | Superá 3 niveles | `levelClear` (winLevel) | 3 | 1 y 2 |
| p_limpio | principal | Un nivel sin morir | `cleanClear` (winLevel con 0 muertes en el nivel) | 1 | 1 y 2 |
| s_intocable | secundaria | Intocable | `levelClear`, **failOn `death`** | 2 | 1 y 2 |
| s_pollo | secundaria | Pollo de oro | `secret` (tocar un pollo dorado) | 1 | 1 y 2 |
| s_yunques | secundaria | Esquivayunques | `anvilDodge` (un yunque o la grúa tocan el piso y seguís vivo) | 5 | 1 y 2 |
| s_creativo | secundaria | Muerte creativa | `deathKinds` (máx. de causas distintas en la partida, `mode:'max'`) | 3 | 1 y 2 |
| s_volador | secundaria | Pasajero frecuente | `spring` (te lanza un trampolín) | 3 | 1 y 2 |
| s_jefe | secundaria | Jefe ambiental | `bossDefeated` (apagar la grúa / escapar de la aplanadora) | 1 | 2 |
| s_control | secundaria | Paso a paso | `checkpoint` | 2 | 2 (no en Extremo) |

### Dificultad (selector del menú, no se puede cambiar en partida)

Nunca cambia controles, salto, colisionadores ni ventanas de golpe: sólo velocidades, tiempos de aviso y banderas. **Normal = el balance original** (el yunque usa la misma gravedad 2600 de siempre).

| Parámetro | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Gravedad del yunque (px/s²) | 2100 | 2600 | 3000 | 3400 |
| Prensa: tiempo abierta (s) | 2,4 | 1,8 | 1,5 | 1,3 |
| Prensa: aviso antes de bajar (s) | 1,2 | 0,9 | 0,75 | 0,6 |
| Piedra rajada: tiempo hasta caerse (s) | 0,75 | 0,5 | 0,4 | 0,32 |
| Grúa: aviso del círculo rojo (s) | 1,2 | 0,9 | 0,75 | 0,6 |
| Grúa: pausa entre yunques (×) | 1,25 | 1 | 0,85 | 0,75 |
| Sierra en riel: período (×) | 1,15 | 1 | 0,9 | 0,82 |
| Aplanadora por tramo (px/s; el jugador corre a 260) | 150/170/190 | 175/200/222 | 190/215/238 | 200/228/248 |
| Banderas de control (Acto 2) | sí | sí | sí | **no** |

### Calidad (`onQuality`; «Automática» la resuelve el SDK)

| | Baja | Media | Alta |
|---|---|---|---|
| Tope de `devicePixelRatio` | 1 | 1,5 | 2 |
| Tope de partículas (pool de 400 preasignado) | 60 | 180 | 400 |
| Capas de parallax | 1 (lejana) | 2 (+ media) | 3 (+ cercana) |
| Resolución de las capas pre-dibujadas | ×0,6 | ×0,8 | ×1 |
| Brillo del sol/faroles, viñeta nocturna, cono de luz de la aplanadora | no | sí | sí |
| Sombras proyectadas y volumen (barril, árboles, torso) | no | sí | sí |
| Partículas ambientales (polvo, luciérnagas) | 0 | 0 | 22 |

### Contenido nuevo (Acto 2)

- **Nivel 7 · EL PISO ES OPCIONAL** (pradera): presenta los pozos y la piedra rajada (tiembla antes de caerse). Ruta de arriba opcional por dos plataformas con el pollo; abajo, pozo + pinchos. Final troll: la META tiene ojitos y, cuando te acercás, **le salen patitas y se escapa** 550 px (con trampolín y pinchos en el medio).
- **Nivel 8 · LA GRÚA LOCA** (obra): presenta la prensa. Jefe ambiental: una grúa en un riel te sigue; en cada ciclo marca un **círculo rojo** en el piso (aviso + alarma) y suelta un yunque. 3 fases según tu avance: fase 1 y 2 apuntan donde estás (seguí corriendo), fase 3 apunta **adonde vas a estar** (frená). Se «vence» tocando el botón **APAGAR** del final: la grúa se desarma. Pollo: soltando ▶ en el aire sobre el trampolín.
- **Nivel 9 · LA FÁBRICA DE PRENSAS** (tema nuevo «fábrica»): cinta que te empuja para atrás con pinchos encima, plataforma móvil sobre un pozo, dos prensas en «tuc-tuc» (hay un hueco seguro entre las dos), sierra en riel vertical y una **ruta alternativa por escalera y pasarela** (con el pollo) que evita la segunda cinta.
- **Nivel 10 · LA APLANADORA** (noche): persecución. La aplanadora sale a los 1,5 s y acelera por tramos (siempre más lenta que vos corriendo). Indicador «🚜 x m» en el borde izquierdo y en el HUD. Puente de piedras rajadas, dos trampolines (el segundo te cruza el pozo final). Al pasar el pozo final el conductor entra en pánico, acelera y se cae al pozo. El pollo está detrás del punto de partida (vas hacia la aplanadora…).
- **Acto 1:** sólo se agregaron 4 pollos opcionales que no cambian el recorrido (niveles 1 y 4: detrás del inicio; 2 y 6: arriba del trampolín, se agarran soltando ▶ en el aire).
- Muertes nuevas con cartel y chistes propios: `crusher` (prensa), `crane` (grúa), `roller` (aplanadora); `fall` (pozo) ahora es alcanzable.
- «Coyote time» de 80 ms para saltar justo después del borde de un pozo (el salto en sí no cambió: mismo impulso, misma gravedad, respuesta en el mismo cuadro).
- Todos los niveles nuevos se completan con un recorrido guionado (autopiloto de `?debug`, ver Pruebas). Antes de escribir los tests se corrió ese guion en las 4 dificultades: **16/16 niveles completados sin morir** (y también a 1× de simulación en Normal).

### Cambios visuales

- Parallax de 3 capas por tema (montañas/cerros/arbustos, skyline/grúas/cerco, montañas/pinos/setos, chimeneas/tanques/cajones) pre-dibujadas una vez en canvas fuera de pantalla (con semilla fija) y repetidas en mosaico; las colinas translúcidas originales se mantienen.
- Gradiente del cielo, brillo del sol y de los faroles y viñeta: cacheados (antes se creaban gradientes en cada cuadro).
- Partículas en un pool preasignado (sin objetos nuevos por cuadro); las chispas del TNT pasaron del dibujo a la lógica.
- Sombras proyectadas del personaje (sobre la superficie real de abajo, achicándose con la altura), del yunque que cae, de barriles, plataformas, sierra del riel, aplanadora y meta.
- Muerte: además del ragdoll, un «alma» con aureola sube despacito y una onda blanca se expande (sin destellos ni flashes). Aplastamiento leve al aterrizar (sólo visual, también en Mati).
- Cámara: anticipa unos 90 px hacia donde corrés, suavizada; no toca la física. Con `prefers-reduced-motion` no hay sacudón de cámara ni temblor de la prensa.

### Pruebas

`tests/e2e/muerte_gloriosa.spec.js` pasó de 13 a 27 tests. Nuevos:

1. **Misiones (principal + secundaria):** partida nueva → misiones `p_tres`, `s_intocable`, `s_pollo` (rotación determinista). Se agarra el pollo del nivel 1 (gancho de prueba: se ubica al personaje en el salto) → `s_pollo` cumplida; se superan 3 niveles sin morir → `p_tres` y `s_intocable` cumplidas, niveles 1–3 marcados «sin morir». Tras recargar: logros en `ml:missions`, menú «POLLOS 1/8» y «SIN MORIR 3/10».
2. **failOn:** morir en los pinchos → `s_intocable` queda `failed`, la principal sigue activa, `runKinds = ['spikes']`.
3. **Dificultad:** teclado (escritorio, flechas) o toque (celular) → Extremo; no arranca la partida; persiste tras recargar; `diffCfg` cambia (`anvilG 2600 → 3400`, `crushOpen 1.3`, `cps:false`) y el nivel 7 en Extremo no tiene banderas.
4. **Calidad:** baja/media/alta cambian `partCap` (60/180/400), capas de parallax (1/2/3, y se dibujan), brillos y el DPR efectivo (en Pixel 7, DPR 2,625 → 1 / 1,5 / 2).
5–10. **Niveles 7, 8, 9 y 10 completables en Normal** y **8 y 10 en Extremo** (estos dos sólo en escritorio) con el recorrido guionado del autopiloto (`?debug`), **0 muertes**; además el guion pasa por el pollo (7 y 9) y vence al jefe (8 y 10).
11. **Acto 2:** botón oculto hasta tener 6/6; arranca en el nivel 7 con «ACTO 2: 0/4».
12. **Mecánicas (1):** pozo → muerte `fall`; piedra rajada: se activa, se cae y reaparece; bandera de control: se guarda y al morir se reaparece en x=1300; la meta del nivel 7 huye de 2700 a 3250.
13. **Mecánicas (2):** la cinta te lleva para atrás; la plataforma móvil te lleva (sube y baja con ella); la prensa primero avisa (`warn`) y después aplasta (`crusher`); la sierra en riel mata.
14. **Jefes:** la grúa se activa, marca el objetivo donde estás parado y el yunque te aplasta (`crane`); tocando APAGAR queda `dead`, el jefe cuenta como vencido y se oculta su barra; la aplanadora alcanza al que no corre (`roller`).

Robustez (pedido del coordinador y fallas propias del entorno):
- **«muerte → cartel → tecla nueva»** falló en CI (2 núcleos) porque caminaba desde x=120 con un tope de 8 s. Ahora el gancho deja al personaje en x=360 (antes de los pinchos de x=430) y el tope es de 30 s. Lo mismo en «reiniciar desde la pausa», «táctil» y «Mati: poses».
- En esta máquina hay joysticks reales conectados que inyectaban teclas fantasma (R, Espacio) a través del SDK: el spec anula `navigator.getGamepads` en `beforeEach` (además del arreglo del SDK con `navigator.webdriver`).
- «Mati: poses» fallaba antes de este trabajo en mobile (1 de 26): un `blur` suelta las entradas a propósito (bug #9). Ahora se vuelve a apretar ▶ en cada sondeo.
- Tiempos de espera más amplios en los tests que dependen del tiempo de juego (6 festejos, cartel que ignora toques antes de 0,3 s).

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/muerte_gloriosa.spec.js`): **47 passed, 7 skipped (17,4 min)**. Desktop: 26 passed, 1 skipped (el táctil). Mobile (Pixel 7): 21 passed, 6 skipped (los de teclado físico y los dos de Extremo).
Antes de empezar, el mismo spec daba 20 passed, 1 failed (Mati mobile, ver arriba), 5 skipped.

### Mediciones

Partida real: el personaje corre a la derecha 4 s (invulnerable sólo para medir), 2 corridas por fila, Chromium headless 1280×800, DPR 1, SwiftShader (CPU). Script propio en el scratchpad (`perf.mjs`), sirviendo el archivo original y el nuevo desde el mismo servidor. «CPU/cuadro» = media móvil de `__mg.frameMs` (sólo JS del cuadro, no raster).

| Versión · calidad · nivel | FPS | p95 entre cuadros | CPU/cuadro | Heap JS | Partículas (máx.) |
|---|---|---|---|---|---|
| Antes · (sin calidad) · 1 | 58,0 / 57,8 | 16,8 ms | 0,73 / 0,55 ms | 3,85 / 3,54 MB | — |
| Después · media · 1 | 54,8 / 52,5 | 33,3 ms | 0,65 / 0,69 ms | 4,42 / 3,54 MB | 14 |
| Después · baja · 1 | 55,3 / 60,0 | 33,3 / 16,7 ms | 0,64 / 0,63 ms | 4,47 / 3,66 MB | 14 |
| Después · alta · 1 | 55,8 / 57,3 | 33,3 ms | 1,24 / 0,61 ms | 4,78 / 3,51 MB | 14 |
| Después · media · 10 (aplanadora) | 49,8 / 51,0 | 33,4 ms | 0,90 / 0,64 ms | 4,73 / 4,23 MB | 8 |
| Después · baja · 10 (aplanadora) | 60,0 / 59,5 | 16,8 ms | 0,59 / 0,58 ms | 4,14 / 3,81 MB | 8 |
| Después · media · 9 (fábrica) | 51,8 / 51,5 | 33,3 ms | 0,87 / 0,64 ms | 4,09 / 3,58 MB | 26 |

Lectura honesta: el JS por cuadro quedó igual (≈0,6–0,9 ms). En media/alta bajan unos FPS en este headless porque el raster por software tiene que pintar 2–3 capas de parallax de pantalla completa; en baja (1 capa, sin brillos ni sombras) vuelve a 60 FPS, incluso en el nivel de la aplanadora. El heap sube ≈0,5 MB (capas en canvas, pool de partículas). En 2D no hay «draw calls» de WebGL; el gancho expone `counts` (partículas, tope, capas dibujadas, trampas, plataformas). Había otros agentes usando la CPU: los números sirven para comparar, no son FPS de un dispositivo real.

### Pendientes / NO PROBADO

- **NO PROBADO en dispositivos reales** (sólo Chromium headless con emulación de Pixel 7): la sensación de los saltos sobre plataformas móviles y la legibilidad del círculo rojo de la grúa en pantallas chicas.
- Los niveles nuevos los completó el autopiloto (que salta en posiciones fijas y espera prensas/sierras); no hubo una partida humana completa del Acto 2.
- Los pollos de los niveles 2, 6 y 8 (soltar ▶ en el aire sobre el trampolín) se verificaron por cálculo de la trayectoria, no con un test; sí hay test del pollo del nivel 1 y de los de las rutas del 7 y el 9.
- Con `prefers-reduced-motion` se apagan sacudón y temblor, pero no hay test automático de eso.
- Récord único para todas las dificultades (no por dificultad).
- En celular apaisado las misiones (abajo a la izquierda) tapan un poco del piso del borde izquierdo.
- Sigue sin sprite de muerte propio para Mati (ragdoll con su paleta).
