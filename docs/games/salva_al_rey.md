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
