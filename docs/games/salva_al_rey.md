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
