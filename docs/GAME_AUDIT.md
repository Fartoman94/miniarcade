# Auditoría de juegos — MiniArcade

> Inventario y auditoría (Fase 1) de los **8 juegos** del repositorio, hecha el 2026-10-09 sobre el commit `69ace25` (marca MateLabs, antes de la modernización). Cada hallazgo indica si fue **CONFIRMADO** (reproducido en el navegador con Playwright) o **SOSPECHADO** (detectado leyendo el código).

## Inventario

| Juego | Archivo | Motor / render | Dependencias externas | Pantallas | Récord guardado en |
|---|---|---|---|---|---|
| ¡CLAVADO! | `clavado.html` | Canvas 2D | Google Fonts | menú · juego · nivel superado · fin | `clavado_best` |
| FRUTA FURIA | `fruta_furia.html` | Canvas 2D | Google Fonts | menú · juego · fin | `fruta_best` |
| MUERTE GLORIOSA | `muerte_gloriosa.html` | Canvas 2D | Google Fonts | menú · juego · tarjeta de muerte · fin | `mg_best`, `mg_deaths`, `mg_muted` |
| NEON SURVIVOR | `NEON_SURVIVOR.html` | Canvas 2D | — | menú · juego · subir de nivel · fin | `neonBest` |
| ¡SALVA AL REY! | `Salva_al_rey.html` | Three.js r128 (WebGL) | cdnjs (three.min.js), Google Fonts | menú de modos · misión · exploración · fin | `rey_best`, `rey_wins` |
| TORRE INFINITA | `torre_infinita.html` | Canvas 2D | Google Fonts | menú · juego · fin | `torre_best` |
| TURBO FURIA | `turbo_furia.html` | Three.js r128 (WebGL) | cdnjs (three.min.js), Google Fonts | garaje · cuenta regresiva · carrera · fin | `turbo_best` |
| EL VALLE ENCANTADO | `valle_encantado.html` | Three.js r128 (WebGL) | cdnjs (three.min.js), Google Fonts | menú de modos · explorar · proteger · fin | `valle_best`, `valle_lit` |

Integración con el portal antes de la modernización: el `index.html` tenía las 8 tarjetas escritas a mano y los juegos **no tenían forma de volver al portal**. Ninguno tenía pausa, cuatro no tenían controles táctiles completos y ninguno compartía audio, puntajes ni configuración.

**Problemas transversales**, repetidos en varios juegos:
- Temporizadores con `setTimeout` que no se podían pausar y que terminaban una partida nueva después de reiniciar (¡CLAVADO!, FRUTA FURIA, MUERTE GLORIOSA, ¡SALVA AL REY!, TURBO FURIA, EL VALLE ENCANTADO).
- Teclas que quedaban "apretadas" al perder el foco de la ventana.
- La auto-repetición del teclado disparaba acciones múltiples.
- Fugas de memoria de GPU en los juegos 3D: geometrías y materiales que se creaban sin liberarse.
- Muchas llamadas de dibujo por frame en los juegos 3D.
- Diseños que se rompían en celular apaisado o vertical.
- Código duplicado: cada juego tenía su propio sistema de audio, récord, overlay y manejo de tamaño. Lo común pasó al SDK (`matelabs/arcade.js`); la mecánica de cada juego sigue en su archivo para no acoplarla.

## Resumen de hallazgos

| Juego | Total | Crítico | Alto | Medio | Bajo |
|---|---|---|---|---|---|
| ¡CLAVADO! | 9 | 0 | 2 | 2 | 5 |
| FRUTA FURIA | 9 | 0 | 1 | 2 | 6 |
| MUERTE GLORIOSA | 14 | 2 | 2 | 4 | 6 |
| NEON SURVIVOR | 16 | 1 | 4 | 5 | 6 |
| ¡SALVA AL REY! | 14 | 3 | 2 | 5 | 4 |
| TORRE INFINITA | 10 | 0 | 2 | 2 | 6 |
| TURBO FURIA | 10 | 0 | 2 | 3 | 5 |
| EL VALLE ENCANTADO | 15 | 1 | 2 | 5 | 7 |
| **Total** | **97** | **7** | **17** | **28** | **45** |

**Los 7 críticos:**
1. MUERTE GLORIOSA: en pantallas bajas (celular apaisado) el suelo quedaba fuera de la pantalla.
2. MUERTE GLORIOSA: en táctil la tarjeta de muerte no se podía cerrar y la partida quedaba trabada.
3. NEON SURVIVOR: no tenía ningún control táctil; en celular el jugador no se podía mover.
4. ¡SALVA AL REY!: los monstruos nunca dañaban el portón, así que las barras del portón y del rey eran decorativas.
5. ¡SALVA AL REY!: al romperse el portón se quitaba el colisionador equivocado y el rey era inalcanzable.
6. ¡SALVA AL REY!: en celular apaisado los botones de modo quedaban fuera de la pantalla y no se podía empezar.
7. EL VALLE ENCANTADO: `banner()` se llamaba en unos 10 lugares pero no existía, y los dos modos se congelaban.

---

## ¡CLAVADO!

### Estado anterior

- **Tecnología:** un solo HTML con Canvas 2D y JavaScript plano (IIFE), sin dependencias salvo Google Fonts (Bungee, Space Grotesk) y la intro de marca `matelabs/intro.js`. Audio sintetizado con Web Audio (osciladores creados por sonido, conectados directo a `destination`).
- **Mecánicas:** un tronco gira en el centro; el jugador lanza cuchillos (clic, toque, Espacio o Enter). Si el cuchillo cae a menos de ~0,105 rad de otro ya clavado, se rompe y se termina la partida. Cada nivel trae 6–8 cuchillos, manzanas (+50) y, desde el nivel 3, cuchillos preclavados. Clavadas seguidas en menos de 1,5 s suman combo (10 × combo). La rotación cambia por nivel: constante, senoidal, ida y vuelta y cambio brusco de sentido, con velocidad base creciente (tope 3 rad/s).
- **Pantallas/estados:** `menu` (con una demo automática que lanza cuchillos sola), `playing`, `clear` (cartel de nivel superado), `over` (tarjeta con puntos, nivel, manzanas y récord).
- **Persistencia:** récord en `localStorage['clavado_best']`.
- **Bucle:** `requestAnimationFrame` con `dt` acotado a 33 ms; DPR acotado a 2.

### Hallazgos de la auditoría

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

_Detalle completo: [docs/games/clavado.md](games/clavado.md)_

---

## FRUTA FURIA

### Estado anterior

- **Tecnología:** un único `fruta_furia.html`, Canvas 2D puro, sin librerías. Audio sintetizado con Web Audio (osciladores efímeros por sonido). Fuentes Bungee / Space Grotesk desde Google Fonts. Intro de marca `matelabs/intro.js`.
- **Mecánicas:** fruta (sandía, naranja, manzana, limón, kiwi, dorada de 50 pts) lanzada desde abajo con gravedad; se corta deslizando (colisión segmento–círculo del trazo). Combo por tajo (×N), FRENESÍ con bonus si un tajo corta 3+. Bombas desde los 8 s (probabilidad creciente hasta 20 %). Oleadas cada 16 s. 3 frutas escapadas = fin; tocar bomba = explosión y fin.
- **Pantallas:** menú (con un "bot" que corta fruta de fondo), juego (HUD puntos / vidas), explosión (`boom`), fin de partida (puntaje, cortadas, récord, badge de nuevo récord).
- **Entrada:** Pointer Events (mouse y táctil), Espacio/Enter para empezar o reintentar.
- **Persistencia:** récord en `localStorage['fruta_best']`.
- **Sin pausa, sin silencio, sin integración con el arcade.**

### Hallazgos de la auditoría

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

_Detalle completo: [docs/games/fruta_furia.md](games/fruta_furia.md)_

---

## MUERTE GLORIOSA

### Estado anterior

- **Tecnología:** un único `muerte_gloriosa.html`, Canvas 2D puro, sin dependencias de JS. Fuentes de Google Fonts (Lilita One, Nunito). Audio sintetizado con Web Audio (osciladores + buffer de ruido).
- **Mecánicas:** plataformas "troll" de 6 niveles. Caminar (←/→, A/D), saltar (Espacio/↑/W) y llegar a la bandera de META. Trampas: pinchos, yunques que caen, sierras, barriles TNT, trampolines que te lanzan al cielo. Cada muerte genera un ragdoll, un cartel con un título y un chiste al azar, y la frase de un narrador. Las muertes son ilimitadas: el "puntaje" es hasta qué nivel llegás.
- **Pantallas/estados:** `menu` → `play` → `dying` → `card` (cartel de muerte, se descarta con tecla o toque) → `play` …; `win` (1,6 s de festejo) → siguiente nivel; al terminar el nivel 6, `over` (estadísticas: niveles, muertes, tiempo).
- **Persistencia:** `localStorage` `mg_best` (niveles superados), `mg_deaths` (muertes totales) y `mg_muted`.
- **Loop:** `requestAnimationFrame` con `dt` limitado a 33 ms y cámara lenta al morir.

### Hallazgos de la auditoría

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

_Detalle completo: [docs/games/muerte_gloriosa.md](games/muerte_gloriosa.md)_

---

## NEON SURVIVOR

### Estado anterior

- **Tecnología:** un solo HTML con Canvas 2D y JavaScript plano, sin dependencias externas (sólo `matelabs/intro.js` de la marca). Sin audio.
- **Mecánicas:** survivor-like. El jugador (círculo cian) se mueve con WASD/flechas y dispara solo al enemigo más cercano dentro de su alcance. Dos tipos de enemigo (rojo común, magenta grande). Los enemigos dejan orbes de XP; al subir de nivel se elige 1 de 3 mejoras al azar (velocidad, cadencia, daño, proyectil+, alcance, imán, regeneración, vida máx., piercing, crítico). La dificultad sube linealmente con el tiempo (`1 + t/15`).
- **Pantallas:** menú/Game Over (mismo overlay), HUD DOM (vida, XP/nivel, reloj, puntaje), overlay de "¡SUBISTE DE NIVEL!" con tarjetas.
- **Persistencia:** récord en `localStorage['neonBest']`.
- **Entrada:** sólo teclado (`e.key`), sin táctil ni gamepad. Sin pausa.

### Hallazgos de la auditoría

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

_Detalle completo: [docs/games/neon_survivor.md](games/neon_survivor.md)_

---

## ¡SALVA AL REY!

### Estado anterior

- **Tecnología:** un único `Salva_al_rey.html`, Three.js r128 desde cdnjs, WebGL, WebAudio sintetizado (sin archivos de audio). Fuentes de Google (MedievalSharp, Nunito). Sin dependencias extra.
- **Mecánicas:** caballero en tercera persona (mover, correr, saltar, golpe en arco). Modo **Defender el reino**: 10 oleadas de gollums (saltan), espectros (flotan) y ogros (lentos, 11 PV), que van al jugador si está cerca y si no al portón y luego al rey. Rachas de muertes con multiplicador, gotas de vida, ciclo día/noche con faroles que se encienden. Modo **Pasear por la villa**: sin monstruos.
- **Pantallas:** menú con selección de modo (la escena gira de fondo), HUD (puntos y corazones, barras de rey y portón, oleada), cartel de fin con récord.
- **Entrada:** WASD/flechas, Shift, Espacio, clic o J; clic derecho + arrastrar y rueda para la cámara; en táctil joystick dinámico, botones ⚔️/⬆️, arrastre y pellizco para la cámara.
- **Persistencia:** `rey_best` (mejor oleada) y `rey_wins` en localStorage.

### Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | crítico | CONFIRMADO | Los monstruos **nunca dañaban el portón**: apuntaban a un punto detrás de él (z−1.5) y atacaban solo a menos de 3 de ese punto, pero el collider del portón (r 2.2) los frenaba a ~4.2. Las barras de portón y rey eran decorativas y la única forma de perder era morir. | Copia del original con hooks: 4 gollums frente al portón durante 6 s, portón en 100 y monstruos quietos en z≈−25. |
| 2 | crítico | CONFIRMADO | Al romperse el portón se quitaba el **collider equivocado** (`COLL[length-6]` era la torre del homenaje en (4,−41)). El muro invisible del portón seguía ahí y el rey quedaba intocable. | Se forzó el portón a 0: el collider (0,−28) seguía, faltaba el de (4,−41); 25 s con 6 gollums y rey en 100 %. |
| 3 | crítico | CONFIRMADO | **Celular apaisado** (915×412, la orientación que declara el registro): los botones de modo quedaban fuera de pantalla y `#menu` no scrolleaba, así que no se podía empezar. | Captura con Pixel 7 apaisado: el `tap` de Playwright falla con "element is outside of the viewport". |
| 4 | alto | CONFIRMADO | Fin de partida con `setTimeout`: si se reiniciaba durante la animación de muerte, el temporizador viejo cortaba la partida nueva. El temporizador también seguía corriendo en pausa. | `startMode` justo después de morir: 2 s después `state='over'` y el cartel final visible. |
| 5 | alto | CONFIRMADO | La auto-calidad nunca se activaba: medía fps con el dt ya recortado a 0.033 s, así que nunca veía menos de ~30 fps. Además, en el nivel 1 *subía* la resolución a 1.25 en pantallas de densidad 1. | DPR 2 en headless: 1.3 fps reales, `qual` siguió en 2 y la resolución en 2. |
| 6 | medio | CONFIRMADO | `damagePlayer(n)` ignoraba `n`: el ogro (dmg 2) sacaba 1 corazón. | `damagePlayer(2)` con 5 corazones dejaba 4. |
| 7 | medio | CONFIRMADO (código) | Ganar no guardaba el récord: `rec=!victory&&…`, así que `rey_best` no llegaba a 10. | Lectura de `gameOver`: la rama de victoria no escribe `rey_best`. |
| 8 | medio | CONFIRMADO (código) | Fugas de GPU: cada monstruo, gota y arco creaba geometrías y materiales nuevos y solo se hacía `scene.remove`, sin `dispose`. | `renderer.info.memory.geometries` crecía con cada aparición (348 → 367 al empezar la oleada 1). |
| 9 | medio | CONFIRMADO | Render costoso: ~358 llamadas de dibujo en el menú (539 objetos, 403 materiales), casi todas del escenario estático. | `renderer.info.render.calls` = 358. En un experimento con la misma carga, ocultar el escenario subió de 16.8 a 54.9 fps y apagar el antialias, a 34. |
| 10 | medio | SOSPECHADO | Con la partida terminada, los monstruos podían seguir golpeando el portón (sonido y carteles detrás del cartel final): `damageGate` no miraba el estado. Por el bug 1 no se llegó a observar. | Lectura del código. |
| 11 | bajo | CONFIRMADO (código) | La chispa al golpear un monstruo nunca se veía: `e.h` no existía en el objeto del monstruo y la posición era `NaN`. | Lectura de `spawnEnemy`/`damageEnemy`. |
| 12 | bajo | CONFIRMADO (código) | Sin pausa, sin control de silencio y sin opción de volver; teclas "pegadas" si se soltaban con la ventana sin foco. Los botones táctiles se veían detrás del menú. | Lectura del código. |
| 13 | bajo | CONFIRMADO (código) | Asignaciones por cuadro: `new THREE.Color` ×2, el color de 10 faroles reparseado desde texto y `style.opacity` y textos del HUD reescritos en cada cuadro. | Lectura de `update`. |
| 14 | bajo | CONFIRMADO | En celular vertical (412 px) las tres placas del HUD se encimaban. | Medición de rectángulos en el test de layout. |

_Detalle completo: [docs/games/salva_al_rey.md](games/salva_al_rey.md)_

---

## TORRE INFINITA

### Estado anterior

- **Tecnología:** un único `torre_infinita.html` con Canvas 2D y JavaScript plano, sin dependencias externas salvo Google Fonts (Bungee + Space Grotesk) y `matelabs/intro.js` (intro de marca).
- **Mecánica:** juego de un solo toque. Un bloque cruza la pantalla de lado a lado y el jugador lo suelta: la parte que sobresale de la torre se corta y cae. Si queda alineado dentro de un margen (≈4,5 % del ancho), es **caída perfecta**: no se recorta, el bloque crece 12 px (hasta el ancho de la base) y suma combo (1 + combo puntos). Si no apoya nada, se termina la partida.
- **Dificultad:** el tiempo de cruce baja de 2,5 s a 1,35 s (−0,03 s por piso).
- **Cielo por altitud:** atardecer → día → crepúsculo → noche con estrellas y luna; nubes con paralaje.
- **Pantallas:** portada con demo automática de fondo (un bot apila bloques), partida con HUD (puntos y récord), pantalla de fin con puntaje, mejor combo, récord y “OTRA VEZ”.
- **Audio:** sintetizado con WebAudio (osciladores efímeros), sin archivos. Vibración en celulares.
- **Persistencia:** récord en `localStorage['torre_best']`.
- **Entrada:** `pointerdown` en toda la ventana, Espacio / Enter.
- **No tenía:** pausa, silencio, integración con el arcade.

### Hallazgos de la auditoría

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

_Detalle completo: [docs/games/torre_infinita.md](games/torre_infinita.md)_

---

## TURBO FURIA

### Estado anterior

- **Tecnología:** un único `turbo_furia.html`, Three.js r128 desde cdnjs (sin otras dependencias), fuentes de Google Fonts (Bungee, Space Grotesk), intro de marca `matelabs/intro.js`.
- **Mecánicas:** carrera infinita en una ruta de 4 carriles. Se elige vehículo en un garaje 3D (3 autos y 2 motos con velocidad máxima y agilidad distintas). Se cambia de carril libremente, se frena y se usa nitro (barra que se gasta y se recarga). Tráfico con 6 tipos de vehículo y velocidades distintas; adelantar suma 5, pasar rozando ("CASI") suma 50 × combo, cada 5 km hay un hito (+100). 3 vidas con 2 s de invulnerabilidad tras un choque. La dificultad crece con los km (más velocidad tope y más frecuencia de tráfico).
- **Pantallas:** garaje (selección) → cuenta regresiva 3-2-1-¡YA! → carrera con HUD (puntos, vidas, récord, km/h, nitro, combo) → pantalla final (puntos, km, adelantados, "casi", récord nuevo) con "OTRA VEZ" y "GARAJE".
- **Entrada:** teclado (flechas/A D, ↓/S freno, Shift/Espacio nitro, Enter largar), táctil (arrastrar el dedo para doblar, botones FRENO y NITRO).
- **Audio:** WebAudio sintetizado (motor continuo con 2 osciladores + efectos), sin control de volumen ni silencio.
- **Persistencia:** récord en `localStorage['turbo_best']`.
- No tenía pausa, ni botón de sonido, ni soporte de gamepad.

### Hallazgos de la auditoría

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

_Detalle completo: [docs/games/turbo_furia.md](games/turbo_furia.md)_

---

## EL VALLE ENCANTADO

### Estado anterior

- **Tecnología:** un único `valle_encantado.html` (CRLF) con Three.js r128 desde cdnjs, WebGL, Web Audio sintetizado (sin archivos de audio) y fuentes de Google Fonts (MedievalSharp, Nunito). Sin build ni otras dependencias.
- **Mecánicas:** valle 3D low-poly en tercera persona. El jugador camina (WASD/joystick), corre (Shift), golpea con un bastón (clic/Espacio/⚔️) y habla con 8 habitantes (E/💬).
  - **Explorar el valle:** juntar 12 fragmentos de estrella (una flecha dorada guía al más cercano); al completarlo el valle "se ilumina" (`valle_lit` en localStorage).
  - **Proteger el valle:** oleadas de diablillos y ogros que van hacia el Corazón del Valle y lo drenan; 5 corazones de vida; récord = mejor oleada (`valle_best`).
- **Pantallas:** menú con selección de modo, HUD por modo, diálogos con efecto máquina de escribir, cartel de anuncios, pantalla de fin.
- **Decorado:** ~50 árboles, flores, pasto, hongos, juncos, aldea, molino, cristales, muelle, hadas, dragones, mariposas, ovejas, luciérnagas y polen (Points), partículas pooleadas.

### Hallazgos de la auditoría

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

_Detalle completo: [docs/games/valle_encantado.md](games/valle_encantado.md)_