# ¡Salva al Rey! (`salva_al_rey`)

## Estado anterior

- **Tecnología:** un único `Salva_al_rey.html`, Three.js r128 desde cdnjs, WebGL, WebAudio sintetizado (sin archivos de audio). Fuentes de Google (MedievalSharp, Nunito). Sin dependencias extra.
- **Mecánicas:** caballero en tercera persona (mover, correr, saltar, golpe en arco). Modo **Defender el reino**: 10 oleadas de gollums (saltan), espectros (flotan) y ogros (lentos, 11 PV), que van al jugador si está cerca y si no al portón y luego al rey. Rachas de muertes con multiplicador, gotas de vida, ciclo día/noche con faroles que se encienden. Modo **Pasear por la villa**: sin monstruos.
- **Pantallas:** menú con selección de modo (la escena gira de fondo), HUD (puntos y corazones, barras de rey y portón, oleada), cartel de fin con récord.
- **Entrada:** WASD/flechas, Shift, Espacio, clic o J; clic derecho + arrastrar y rueda para la cámara; en táctil joystick dinámico, botones ⚔️/⬆️, arrastre y pellizco para la cámara.
- **Persistencia:** `rey_best` (mejor oleada) y `rey_wins` en localStorage.

## Hallazgos de la auditoría

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

## Cambios implementados

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

## Mediciones antes/después

`node tests/perf/measure.mjs` (headless, SwiftShader: el render es por CPU).

| Métrica | Antes (`.perf/before.json`) | Después (`.perf/after-salva_al_rey.json`) |
|---|---|---|
| fps en el menú | 32 | 5.7 |
| peor cuadro | 83.4 ms | 500 ms |
| tareas largas | 2 | 3 |
| heap JS | 8.8 MB | 6.6 MB |
| DCL | 765 ms | 1673 ms |
| requests / KB | 8 / 753 | 10 / 795 (+ arcade.js y registry.js) |
| errores | 0 | 0 |

**Las cifras de fps "después" no se pueden comparar con la base:** se midieron con la máquina saturada por los otros agentes (load average ~45 en 12 núcleos). En la misma situación, el original sin tocar (servido aparte) dio 6.9 / 6.4 / 7.8 fps y la versión nueva 6.4 / 6.9 / 5.7: con esa carga son indistinguibles. Hay que volver a medir con la máquina libre.

Medidas deterministas, que no dependen de la carga:

- Llamadas de dibujo en el menú: **358 → 108**. Durante la partida: 377 → 128.
- Geometrías en memoria al cargar: **348 → 94**. Ya no crecen con cada monstruo, gota o arco.

En un experimento controlado (misma carga, misma sesión) sobre el original: base 16.8 fps, sin antialias 34.0 fps, con casi todo el escenario oculto (8 llamadas) 54.9 fps. El antialias (MSAA) es muy caro en SwiftShader, pero se mantuvo en escritorio porque en GPU real es barato. En móvil ya venía desactivado.

## Pruebas

`tests/e2e/salva_al_rey.spec.js`, que se corre con `ML_WORKERS=1 npx playwright test tests/e2e/salva_al_rey.spec.js`:

1. Carga sin errores, menú visible, menos de 160 llamadas de dibujo y pixelRatio ≤ 2.
2. Empieza con clic o tap real; el tiempo avanza; W mueve al caballero (escritorio); Escape pausa y el estado (tiempo, posición, cámara) queda idéntico durante 1 s; Escape reanuda sin salto de tiempo.
3. "Reiniciar partida" del menú de pausa restablece corazones, puntaje y tiempo.
4. Los monstruos dañan el portón y, sin portón, al rey (regresión de los bugs 1 y 2).
5. Fin de partida: cartel, insignia de récord, `rey_best` = "3" y `ml:scores.salva_al_rey` = 3; Escape no pausa fuera de la partida; después de recargar el menú muestra "MEJOR OLEADA: 3".
6. Reiniciar durante la caída no termina la partida nueva (regresión del bug 4).
7. El botón de sonido del arcade silencia el juego.
8. Viewport de 412×915: sin scroll horizontal, canvas a pantalla completa, placas del HUD y barra sin encimarse.
9. (Solo móvil) Toque real por CDP: el joystick aparece y mueve al caballero; ⚔️ golpea y ⬆️ salta.
10. Celular apaisado 915×412: los dos botones de modo entran completos en pantalla y el modo paseo arranca (regresión del bug 3).

Resultado real de la última corrida: **19 passed, 1 skipped (3.1 min)**. Escritorio: 9 passed y 1 skipped (el test táctil es solo para móvil). Móvil: 10 de 10 passed.

## Pendientes / problemas conocidos

- No hay forma de volver al menú del juego (elegir el otro modo) sin terminar la partida. Pasaba igual antes, y en el modo paseo, que no termina nunca, solo quedan "Reiniciar" o "Volver al arcade". Haría falta que el SDK permita acciones propias en el menú de pausa.
- El balance de dificultad cambió porque el portón ahora recibe daño de verdad (+10 de reparación entre oleadas). No se jugaron las 10 oleadas a mano para afinarlo.
- No se pudo medir fps de forma útil por la carga de la máquina. Conviene repetir `measure.mjs` con la máquina libre.
- El escenario fusionado ya no se descarta por frustum en partes (es una malla grande por material). Con este tamaño de escena es irrelevante.

## Actualización (integración con el SDK)
- El SDK ahora admite acciones propias en el menú de pausa (`actions`). ¡Salva al Rey! agrega **☰ Menú del juego**, que resuelve la salida del modo exploración sin recargar. Cubierto por el test `modo exploración: "Menú del juego"…` (desktop y mobile, 2/2 pasan).
- Controles del registro actualizados (J para golpear, Q/E cámara, B correr, LB/RB cámara).

## Personaje Mati Octo

### Qué se integró
- `matelabs/characters.js` se carga en el `<head>` después de `arcade.js`. En el menú, debajo del cartel "Creado por MateLabs", está el selector **ELEGÍ TU HÉROE** (`MLChars.picker`): **Caballero** (el original, por defecto) o **Mati Octo**. Es un radio group: flechas para cambiar con teclado, tap/clic con el dedo o el mouse; las teclas y toques del selector no llegan al juego. La elección se guarda en `ml:character` y sobrevive a la recarga.
- Carga diferida: los tres GLB (`MLChars.loadMeshes(THREE)`) se piden solo si Mati está elegido al cargar la página o en el momento de elegirlo. Con el Caballero no se baja ningún `.glb` (lo verifica un test). Ojo: la miniatura giratoria del selector (código compartido) sí baja los `.webp` de Mati al abrir el menú.
- El caballero de primitivas ahora vive en un subgrupo (`P.body`) del grupo del héroe; la sombra queda afuera. Al usar a Mati se oculta ese subgrupo y se muestra el grupo `mati` con las tres poses colgadas del mismo `playerG`, así que posición, giro hacia donde se mueve (`rotation.y = prot`), rebote al caminar, parpadeo de invulnerabilidad y la caída final (`rotation.x = -1.2`) funcionan igual sin tocar nada más.

### Poses (estáticas, no animadas)
Los GLB son **tres poses fijas sin esqueleto**; no hay animación esquelética. Se cambia de pose alternando `visible` de tres mallas creadas una sola vez:
- **quieto** (`idle`): en el piso y sin moverse. Movimiento procedural barato: un leve "respirar" (escala Y ±2.5 %).
- **corriendo** (`run`): mientras se mueve en el piso. Para simular la zancada se alterna `run` ↔ `idle` cada medio paso (≈0.28 s caminando, ≈0.17 s con Shift), más una inclinación hacia adelante de 0.12 rad y el rebote que ya tenía el caballero.
- **en el aire** (`jump`): mientras no está apoyado (salto).
- Caída al morir: la pose que esté visible se tumba con el grupo, como el caballero.

### Escala, orientación y collider
- Mati se escala a **2.0 unidades** de alto (el caballero mide 2.0 hasta el casco; el penacho llega a ~2.3). Medido en el juego: alto 2.04, base exactamente a la altura del piso (`minY = groundY`).
- Los GLB miran a +Z, igual que el caballero: se usa el mismo `prot` sin corrección.
- **El collider no cambió**: sigue siendo el círculo de radio `PLAYER_R = 0.5` (antes un `.5` literal en `collide()`); se expone `playerR` en `__rey.snap()`. Un test mete al héroe dentro del collider del portón y comprueba que el empuje deja exactamente la misma posición con los dos personajes.
- Mati es más ancho que el caballero (1.56 × 1.03 contra ~1.2 con escudo). Como el collider es el mismo, los tentáculos pueden asomar un poco dentro de muros o casas al pegarse a ellos; se priorizó no cambiar la jugabilidad.
- La cámara sigue apuntando a 1.6 sobre los pies, igual que antes.

### Efectos
- **Espada y arco del golpe**: la espada original no se duplica; se reparenta a un pivote propio de Mati (a la derecha del cuerpo, a la altura del "hombro") y recibe la misma rotación de swing que el brazo del caballero. El arco blanco del golpe no dependía del modelo y sigue igual.
- **Golpe recibido**: el caballero solo parpadeaba; con Mati además se tiñe de rojo el `emissive` del material compartido mientras dura la invulnerabilidad (solo se cambia el valor al entrar/salir, sin crear objetos por cuadro).
- **Muerte**: la misma caída hacia atrás.

### Si falla la carga
Si los GLB no bajan o no se pueden leer, `loadMeshes` rechaza: el juego queda con el Caballero (la partida arranca y se juega normal) y aparece abajo un aviso no bloqueante durante ~4 s: "No se pudo cargar a Mati Octo: seguís con el caballero." (además de un `console.warn`). La preferencia guardada no se borra, así que se reintenta en la próxima carga. Si se arranca la partida antes de que termine la descarga, se juega con el Caballero y Mati aparece apenas termina.

### Pruebas
Se agregaron 4 tests a `tests/e2e/salva_al_rey.spec.js`:
1. Selector: por defecto Caballero y sin pedidos de `.glb`; flechas (→ Mati con foco, ← vuelve), tap/clic, el juego sigue en el menú; tras recargar sigue Mati y se carga.
2. Partida con Mati: alto 1.9–2.15, pies en el piso, espada en el pivote; con W la pose pasa por `run` y vuelve a `idle` al soltar; el salto muestra `jump`; J golpea; daño y caída final llegan a la pantalla de fin.
3. Collider idéntico con los dos personajes (mismo empuje del portón, `playerR = 0.5`).
4. Fallo de red (`page.route` aborta `.glb` y `.webp`): aviso visible, personaje `clasico`, la partida avanza, sin errores fuera de los "Failed to load resource" de los pedidos abortados por el test.

`__rey.snap()` ahora también expone `char`, `charPref`, `pose`, `playerR`, `grounded`, `tris` y `heap`; con `?debug=1` hay `heroBox()`.

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/salva_al_rey.spec.js`): **29 passed, 1 skipped (3.4 min)**. Escritorio: 14 passed y 1 skipped (el táctil es solo para móvil). Móvil: 15 de 15 passed.

Capturas revisadas: menú en 1280×800 (el selector entra en la columna izquierda), Pixel 7 vertical (el menú ya no entraba entero: se cambió a `align-content: safe center` para que scrollee desde arriba sin cortar el título) y apaisado 915×412 (el selector entra en la columna izquierda y los botones de modo siguen completos en pantalla).

### Rendimiento (medido en partida, modo paseo caminando, 1280×800, SwiftShader)
| | Caballero | Mati Octo |
|---|---|---|
| llamadas de dibujo (promedio) | 108–111 | 96–98 |
| triángulos por cuadro | ~15 000–15 800 | ~20 600–20 800 |
| geometrías en memoria | 98 | 99–100 |
| heap JS | 6.8–9.4 MB | 7.7–7.8 MB |

Con Mati hay ~13 llamadas de dibujo menos (una malla por pose + la espada contra ~17 piezas del caballero) y ~5 000 triángulos más. El tiempo por cuadro no se puede comparar: se midió con load average ~33 por los otros agentes y dio 93–177 ms por cuadro en ambos casos, puro ruido.

### Pendientes
- `characters.js` crea el material con `flatShading`, que `MeshLambertMaterial` de r128 no tiene: avisa por consola (warning, no error) y el sombreado plano no se aplica. El juego ya tenía muchos avisos iguales propios.
- Los tentáculos pueden asomar dentro de muros al pegarse (ver collider).
- Repetir la medición de tiempo por cuadro con la máquina libre.

## MiniArcade 3.0

### Estado antes → después
- **Antes:** 3 monstruos (gollum, espectro, ogro), 10 oleadas sin jefes, sin misiones, sin dificultad, sin niveles de calidad (sólo una auto-calidad de resolución). Cada monstruo era un grupo de ~13 mallas (una llamada de dibujo cada una) y las partículas tenían material propio (hasta 90 llamadas).
- **Después:** 6 tipos de monstruo + 2 jefes con fases, misiones (MLMissions) con rescate y recolección reales, 4 dificultades, 3 niveles de calidad con costos reales, monstruos/partículas/pasto instanciados, indicadores de vida y de prioridad de amenaza, cámara y táctil mejorados. Se mantienen las 10 oleadas, el modo paseo, el récord (`rey_best`, `rey_wins`, `ml:scores`), Mati Octo, pausa/reinicio/silencio/pantalla completa/gamepad.

### Misiones (MLMissions, HUD abajo a la izquierda, 2 secundarias por partida, sólo en "Defender el reino")
| id | tipo | misión | evento (lo emite la lógica del juego) | objetivo |
|---|---|---|---|---|
| rey_muralla | principal | Muralla firme | `waveClear`, falla con `gateBroken` | 5 oleadas sin perder el portón |
| rey_salvar | principal | ¡Salvá al Rey! | `waveClear` + `requireWin` | ganar las 10 |
| rey_rescate | secundaria | Rescatá 2 aldeanos | `rescue` | 2 |
| rey_madera | secundaria | Juntá 4 fardos de madera | `wood` | 4 |
| rey_jefe | secundaria | Vencé a un jefe | `bossDefeated` | 1 |
| rey_ariete | secundaria | Frená 2 arietes | `ramStopped` (troll derrotado antes de golpear) | 2 |
| rey_intocable | secundaria | Intocable | `waveClear`, falla con `heroHurt` | 3 oleadas |
| rey_frenesi | secundaria | Frenesí ×4 | `streak` (modo max) | 4 |
| rey_portonsano | secundaria | Portón intacto | `cleanWave` (oleada sin daño al portón) | 2 |

`runStart()` al empezar la defensa (también al reiniciar desde la pausa); `runEnd({won})` al terminar, al reiniciar y al volver al menú. El cartel final lista las misiones de la partida.

### Dificultad (se elige en el menú; Normal = balance anterior de gollum/espectro/ogro)
| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| vida de monstruos | ×0.7 | ×1 | ×1.3 | ×1.6 |
| velocidad | ×0.85 | ×1 | ×1.12 | ×1.25 |
| cantidad por oleada | ×0.75 | ×1 | ×1.2 | ×1.4 |
| daño a portón/rey | ×0.7 | ×1 | ×1.25 | ×1.5 |
| reparación del portón entre oleadas | +15 | +10 | +8 | +5 |
| descanso entre oleadas | 8 s | 6.5 s | 6 s | 5 s |
| corazón entre oleadas | sí | sí | sí | no |
| vida de jefes | ×0.75 | ×1 | ×1.25 | ×1.5 |

El récord sigue siendo uno solo (no se separa por dificultad).

### Calidad (botón "🎚 Calidad" de la pausa; "Automática" la resuelve el SDK y además baja un nivel si se sostienen <27 fps)
| | Baja | Media | Alta |
|---|---|---|---|
| tope de pixelRatio (PC / táctil) | 1 / 1 | 1.5 / 1.25 | 2 / 1.5 |
| sombras reales | no (manchas) | no (manchas) | sí, mapa 1024, sigue al héroe |
| tope de partículas | 40 | 90 | 150 |
| polvo/luciérnagas | 0 | 70 | 110 |
| pasto instanciado | 0 | ~220 matas | ~420 matas |
| estrellas / charcos de luz de faroles | no | sí | sí |
| luz de contorno (siluetas de noche) | no | sí | sí |
| distancia de dibujo / niebla | 450 / 32–150 | 700 / 45–200 | 900 / 50–230 |

### Contenido nuevo
- **Trasgo arquero** (oleada 4+): dispara de lejos. Aviso naranja en el piso que sigue al objetivo y se **fija 0.35 s antes del disparo** (se esquiva moviéndose o saltando). Retrocede si lo apurás, pero tras 2.5 s huyendo queda acorralado 4 s.
- **Troll del ariete** (oleada 6+): ignora al héroe y embiste el portón (−18). Se echa hacia atrás 0.8 s antes del golpe (aviso). Siempre marcado como amenaza roja, con flecha 🪵 en el borde si está fuera de cuadro.
- **Chamán** (oleada 7+): se queda detrás de la pelea y da a los aliados cercanos (radio 10) un escudo que absorbe un golpe (aviso verde de 1 s, burbuja celeste).
- **Jefe Grumak, el Rey Trol** (oleada 5): fase 1 golpe al piso con aviso rojo de 1.2 s (saltá o salí: 2 corazones); fase 2 (≤50 %) ruge, llama 3 gollums, es más rápido y tira rocas con aviso en tu posición.
- **Jefe Morvath, el Espectro Coronado** (oleada 10): fase 1 orbes en abanico; fase 2 (≤66 %) **velo** invulnerable hasta derrotar a sus 4 espectros; fase 3 (≤33 %) aparece junto al portón y lo **drena** con un rayo; 3 golpes lo interrumpen y lo aturden.
- Los jefes entran cuando quedan ≤2 monstruos de la oleada (ver balance).
- **Rescate de aldeanos** (oleadas 2, 4, 7, 9): columna de luz y flecha 🆘; llegar = +50 y portón +5; gollums y arqueros pueden atraparlo (3 golpes); si no llegás en 40 s se esconde.
- **Fardos de madera** tras cada oleada (2 por descanso, lugares fijos que rotan): portón +4 cada uno (o +15 puntos si está entero).
- **Indicadores:** barras de vida sobre los monstruos (siempre en los grandes, en los chicos sólo heridos), barra del jefe con fase, contador "⚔N" de atacantes junto a las barras de portón y rey, marcas 3D (rojo: golpea portón/rey o es ariete; ámbar: va por el aldeano), flechas en el borde para jefe/ariete/aldeano/portón atacado fuera de cuadro, puntos que salen sobre el monstruo.

### Cambios visuales y técnicos
- Modelos nuevos low-poly con color por vértice y oclusión horneada; siluetas distintas por tipo (gollum orejón con púas, ogro con garrote con clavos, espectro con túnica deshilachada, arquero con capucha y arco, troll con ariete zunchado, chamán con máscara de cráneo y cuernos, jefes con corona y rocas / corona de hielo).
- Animaciones por pieza (piernas, brazos, armas), telegrafiado del golpe (brazos/garrote arriba y tinte naranja), aparición desde el suelo, muerte con caída y encogimiento.
- **Instancing:** cada pieza de cada tipo de monstruo, sombras de mancha, barras de vida, escudos, marcas, partículas y pasto son `InstancedMesh`.
- **Colisiones:** grilla espacial (celdas de 6) para los colliders estáticos; desvío automático cuando un monstruo queda trabado (elige el lado libre).
- **Cámara:** se acerca si una casa o muralla queda entre ella y el héroe, se aleja un poco con un jefe y en táctil se acomoda detrás del héroe al avanzar. Sin sacudidas con `prefers-reduced-motion`.
- **Táctil:** joystick a fondo = correr (antes no se podía correr en el celular); asistencia de apuntado sólo en táctil (si no hay nadie delante al golpear, gira hacia el más cercano a tiro). En PC el golpe no cambió.
- `MLArcade.requireWebGL()` antes de crear el renderer.

### Bugs reales encontrados y corregidos
- Monstruos **trabados para siempre** entre la casa (12,6) y el barril (10.5,9), o entre el farol (3.4,18) y la casa (8,17): la oleada no terminaba nunca. Se agregó el desvío.
- Con el portón caído los monstruos iban en línea recta al rey y los que venían de costado quedaban **detrás de la muralla**, contra el muro del patio. Ahora rodean por el extremo del muro y entran por el hueco del portón.
- El **patio del rey tenía huecos** entre los muros laterales y la torre del homenaje: se podía entrar por detrás sin pasar por el portón. Se cerraron con un tramo de muro visible y su collider.

### Balance del +10 al portón entre oleadas (oleadas guionadas)
`__rey.sim()` + piloto automático `__rey.bot()` (guardia del portón: prioriza aldeano, drenaje, arietes y lo que golpea el portón; pelea a distancia de espada). Normal, 30 pasos por segundo, sin dibujar.
- Primera corrida: el portón perdía 0–19 por oleada en las oleadas 1–4 y 6–7 (el +10 lo cubre), pero **la oleada 5 lo rompía** (−38 a −100) aun con héroe invulnerable: Grumak acaparaba al defensor mientras 6 gollums golpeaban el portón. Cambiar la reparación casi no cambió el resultado (victorias con héroe invulnerable: +0 → 3/4, +10 → 3/6, +20 → 0/4).
- Ajuste: el jefe entra cuando quedan ≤2 monstruos, el golpe de Grumak al portón bajó de 12 a 8 y prefiere el duelo con el héroe (radio 12), la oleada 9 trae 1 chamán.
- Después: héroe invulnerable 6/6 victorias (portón final 76, 38, 22, 0, −3, −14); la oleada más dura pasó a ser la 8 (0 a −114). Héroe mortal (bot): el portón llegó entero a la oleada 9–10 en 4/6; el bot muere por corazones (no esquiva como una persona). Fácil: 3/3 con el portón ≥98. Difícil: 3/3 derrota en la oleada 8.
- **Conclusión: se mantiene +10.** La reparación no decide las partidas; lo que decidía era la oleada del jefe. No se jugó a mano para afinar.

### Pruebas
`ML_WORKERS=1 npx playwright test tests/e2e/salva_al_rey.spec.js`. 12 pruebas nuevas: misión principal completa + persistencia tras recargar; secundaria completa (Frenesí) y fallida (Intocable, failOn) con resumen en el cartel final; madera; rescate (salvado y perdido); arquero; troll del ariete; chamán; Grumak (aviso, daño, fase 2, refuerzos, recompensa, barra); Morvath (velo, drenaje, interrupción); dificultad (teclado, tap, persistencia, vida/velocidad/daño/cantidad); calidad (sombras, partículas, pasto, polvo, distancia, resolución, tope real de partículas, botón de la pausa); composición de oleadas + instancing + flecha de amenaza. Lo que depende del tiempo de juego avanza con `__rey.sim()` (lógica real, sin depender de los cuadros de SwiftShader). Las esperas viejas sin timeout pasaron a 30 s.

Resultado real de la última corrida completa: **53 passed, 1 skipped (7.2 min)**. Escritorio: 26 passed y 1 skipped (el táctil es sólo para móvil). Móvil: 27 de 27 passed.

### Mediciones (1280×800, SwiftShader, load average 23–30 por otros agentes)
12 monstruos (8 gollums, 2 ogros, 2 espectros) a la vista frente al portón, 6 s, dos corridas intercaladas antes/después:
| | antes | después Media | después Baja |
|---|---|---|---|
| llamadas de dibujo | 215–220 | 110 | 103 |
| triángulos | ~19 000 | ~31 000 | ~21 000–22 000 |
| geometrías | 124–128 | 120 | 107 |
| heap JS | 8.9–11.4 MB | 9.6–10.2 MB | 10.9–11.7 MB |
| tiempo por cuadro (prom.) | 80–142 ms | 137–140 ms | 105–170 ms |

Con los monstruos lejos (aparición normal a ~50 u): 111 → 127 (Media) / 115 (Baja) llamadas, por el pasto, el HUD 3D y las piezas nuevas. **El tiempo por cuadro es ruido** con esta carga (la versión anterior sola varió 80→142 ms entre corridas): no se puede afirmar mejora ni empeoramiento de fps. Hay más triángulos (modelos más detallados y pasto en Media/Alta).

### Pendientes / NO PROBADO
- No se jugó a mano en un celular real ni con GPU real; fps sin medir con la máquina libre. Las sombras de Alta no se midieron en GPU real.
- El modo paseo no recibió contenido nuevo (sólo lo visual: pasto, luz de contorno, calidad).
- El piloto de balance no esquiva como una persona: sus números de supervivencia del héroe no son representativos; los del portón sirven para comparar.
- Para cuando se actualice three.js (no en esta ronda): `MeshStandardMaterial`, frustum culling por lote en `InstancedMesh`.
