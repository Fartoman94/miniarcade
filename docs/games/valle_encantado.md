# El Valle Encantado

## Estado anterior

- **Tecnología:** un único `valle_encantado.html` (CRLF) con Three.js r128 desde cdnjs, WebGL, Web Audio sintetizado (sin archivos de audio) y fuentes de Google Fonts (MedievalSharp, Nunito). Sin build ni otras dependencias.
- **Mecánicas:** valle 3D low-poly en tercera persona. El jugador camina (WASD/joystick), corre (Shift), golpea con un bastón (clic/Espacio/⚔️) y habla con 8 habitantes (E/💬).
  - **Explorar el valle:** juntar 12 fragmentos de estrella (una flecha dorada guía al más cercano); al completarlo el valle "se ilumina" (`valle_lit` en localStorage).
  - **Proteger el valle:** oleadas de diablillos y ogros que van hacia el Corazón del Valle y lo drenan; 5 corazones de vida; récord = mejor oleada (`valle_best`).
- **Pantallas:** menú con selección de modo, HUD por modo, diálogos con efecto máquina de escribir, cartel de anuncios, pantalla de fin.
- **Decorado:** ~50 árboles, flores, pasto, hongos, juncos, aldea, molino, cristales, muelle, hadas, dragones, mariposas, ovejas, luciérnagas y polen (Points), partículas pooleadas.

## Hallazgos de la auditoría

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

## Cambios implementados

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

## Mediciones antes/después

Headless Chromium con SwiftShader (WebGL por CPU), 1280×800, menú. **Advertencia:** la máquina estaba muy cargada (load average 22–44 por otras pruebas en paralelo), así que los FPS absolutos fluctúan mucho y están limitados por el raster de SwiftShader; sirven para comparar, no como FPS reales.

`.perf/before.json` (medido antes, otra sesión): fps 31,1 · peor cuadro 83,4 ms · heap 14,5 MB · 2 long tasks · 99 nodos · 768 KB.

`node tests/perf/measure.mjs` intercalando original (servido desde una copia) y nuevo en la misma sesión:

| corrida | fps | peor cuadro | heap | long tasks |
|---|---|---|---|---|
| original 1 / nuevo 1 | 9,5 / 10,6 | 266,7 / 150 ms | 11,0 / 11,5 MB | 3 / 3 |
| original 2 / nuevo 2 | 8,7 / 8,4 | 483,3 / 216,6 ms | 14,4 / 8,6 MB | 3 / 3 |
| original 3 / nuevo 3 | 8,6 / 8,3 | 216,7 / 266,7 ms | 14,3 / 9,5 MB | 2 / 3 |

`.perf/after-valle_encantado.json` (última corrida): fps 12,9 · peor cuadro 183,4 ms · heap 12,4 MB · 3 long tasks · 125 nodos (barra y menú de pausa del SDK) · 815 KB (incluye arcade.js y registry.js).

Medición propia por cuadro (contando llamadas WebGL y el tiempo de los callbacks de rAF, 60 cuadros, menú):

| | draw calls | JS por cuadro | vértices por cuadro |
|---|---|---|---|
| original (4 corridas) | 445–477 | 8,0–14,8 ms | ~73 k |
| nuevo (5 corridas) | 127–141 | 3,6–6,0 ms | ~97 k |

Lectura honesta: el trabajo de CPU del juego por cuadro bajó ~3× y los draw calls ~3,5×, pero en SwiftShader con la máquina saturada los FPS del menú quedaron iguales (el cuello de botella es el raster por CPU, no el JS). Los vértices dibujados suben porque las mallas unidas ya no se descartan por frustum; en GPU real eso es barato frente a los draw calls. El heap bajó en 2 de 3 corridas. Las 2–3 long tasks son de la carga (parseo de three.js, armado de la escena y compilación de shaders), igual que antes.

## Pruebas

`tests/e2e/valle_encantado.spec.js` (7 casos):

1. Carga sin errores, menú visible, menos de 220 draw calls.
2. "Proteger" con clic/tap real: la partida avanza, empieza la oleada 1 con enemigos, **Escape pausa** (tiempo, posición y enemigos idénticos durante 1 s, SDK en pausa), Escape reanuda sin salto de tiempo, **Reiniciar** desde el menú de pausa resetea la partida y el bucle sigue vivo.
3. Fin de partida: oleada 1 → derrota → pantalla de fin con "nueva mejor oleada", `ml:scores.valle_encantado = 1` y `valle_best = "1"`, telemetría `end`; tras recargar el menú muestra "MEJOR OLEADA: 1".
4. "Explorar": hablar con la Anciana Alba (E / tap en 💬), pasar el diálogo, juntar los 12 fragmentos, resumen "¡El valle brilla!", mejor tiempo guardado, "Seguir paseando" vuelve al juego.
5. (escritorio) WASD mueve, clic en la mitad izquierda golpea sin abrir el joystick, el botón de sonido silencia.
6. (móvil) joystick táctil mueve, ⚔️ golpea, un toque en la zona de cámara no golpea.
7. Cambio a 412×915 y 915×412: sin scroll horizontal, canvas del tamaño correcto, modos alcanzables, placas del HUD sin solaparse con la barra.

Resultado (`ML_WORKERS=1 npx playwright test tests/e2e/valle_encantado.spec.js`): **12 passed, 2 skipped** (los casos 5 y 6 se saltean en el proyecto que no corresponde) — desktop 6/6, mobile 6/6, en 1,9 min.

## Pendientes / problemas conocidos

- Las partículas siguen siendo una malla por partícula (cada una con su material para color/opacidad): con humo, estelas de dragón y destellos son ~30–50 draw calls. Se podría pasar a `InstancedMesh`, pero cambia el fundido de opacidad del humo.
- Los 16 destellos del cielo y los sprites de brillo siguen siendo un draw call cada uno.
- El decorado unido no se descarta por frustum; si en GPUs de celulares viejos se notara, partirlo en celdas.
- La animación CSS del cartel sigue corriendo durante la pausa (es sólo visual).
- No se guarda el progreso parcial de "Explorar" (la partida es corta; se guarda el mejor tiempo).
- Los FPS medidos en headless no muestran mejora por el raster de SwiftShader y la carga de la máquina; falta medir en un dispositivo real.
- El registro (`games/registry.js`) tiene datos desactualizados; ver la corrección sugerida en el informe.

## Personaje Mati Octo

### Qué se integró

- Selector de personaje en el menú de inicio (columna "¿Cómo querés jugar?", debajo de los dos modos): **Mago del valle** (el original, por defecto) o **Mati Octo**. Usa `MLChars.picker` de `matelabs/characters.js` (radio group accesible: flechas, Tab, tap; vista previa giratoria con opción de detenerla). La elección se guarda en `ml:character` y persiste al recargar. Los clics/teclas del selector no llegan al juego.
- `matelabs/characters.js` se carga en el `<head>` después de `arcade.js`. Los tres GLB (`mati_octo_idle/run/jump.glb`, ~116 KB c/u) se piden **sólo** si Mati está elegido (al cargar la página con esa elección o en el momento de elegirlo). Ojo: el selector compartido descarga siempre los WebP de la vista previa (~45 KB), aunque no se elija a Mati.
- Las tres mallas se crean una sola vez y se agregan como hijas de `playerG` dentro de un grupo `mati`; cambiar de pose es alternar `visible`. Sin luces extra, sin re-crear nada por cuadro. Al activar a Mati se ocultan las partes del clásico (malla horneada, ojos, capa, piernas, brazos, bastón y orbe); la sombra circular la comparten los dos.

### Poses (estáticas, no animadas)

Los GLB son **poses estáticas**, no hay esqueleto ni animación. Mapeo discreto:

| Estado del juego | Pose |
|---|---|
| quieto, en diálogo, cayendo al morir | `idle` |
| caminando o corriendo (Shift) | `run` |
| saltito al juntar un fragmento o al empezar a hablar con un habitante (0,42 s) | `jump` |

Movimiento procedural barato encima: el rebote vertical que ya tenía el jugador, inclinación hacia adelante al moverse (más al correr), un leve balanceo lateral siguiendo el paso y un arco de 0,55 de alto durante el saltito (sólo visual: no cambia la posición lógica ni el colisionador). El juego no tiene salto, así que la pose `jump` sólo aparece en esos saltitos.

### Escala, orientación y colisionador

- Altura: se mide en tiempo de ejecución la caja del clásico (pies → punta del sombrero) = **2,517** unidades, y Mati se escala a esa misma altura (`classicH === matiH`, verificado en las pruebas). Pies en y=0 del grupo del jugador, igual que el clásico, así que apoya en el terreno con el mismo `groundH`.
- Orientación: el modelo mira a +Z, como el clásico; hereda `playerG.rotation.y = prot`, así que mira hacia donde camina.
- Colisionador: **sin cambios**. Se extrajo el radio a la constante `PLAYER_R = .5` (mismo valor que antes) y lo usan los dos personajes; las pruebas comprueban que al meter al jugador en una casa queda a 3,5 del centro (3 + 0,5) con ambos.
- Mati a esa altura es más ancho que el mago (~1,9 contra ~1 de ancho total): con los colisionadores de árboles (0,8) y casas (3) no se ve metido en nada en las pruebas, pero en algún poste de cerca (radio 0,35) los tentáculos pueden rozar visualmente el poste.

### Efectos

- **Golpe del bastón**: el arco dorado en el suelo y las chispas son los mismos (son del mundo). Como Mati no tiene bastón ni orbe, se agregó un sprite de brillo (misma textura `glowWarm`) delante de Mati que sólo se ve durante el golpe y crece con el mismo pulso que el orbe; además Mati se inclina hacia adelante durante el golpe.
- **Daño**: el parpadeo de invulnerabilidad funciona igual (es la visibilidad de `playerG`); además, mientras dura la invulnerabilidad, el material de Mati recibe un tinte emisivo rojo (se cambia sólo cuando cambia el estado, sin asignar memoria por cuadro).
- **Muerte**: la caída (`playerG.rotation.x = -1.2`) se aplica igual a Mati, en pose `idle` y con el tinte rojo.

### Si falla la carga

Si los GLB no se pueden bajar o leer (red, archivo roto, WebGL), `loadMeshes` rechaza la promesa: el juego sigue con el clásico, la elección guardada no se toca, y aparece un aviso breve no bloqueante ("No se pudo cargar Mati Octo: seguís con el personaje clásico."). Al empezar otra partida se reintenta la carga. Si falta `characters.js` el selector no aparece y el juego es el de siempre.

### Gancho de pruebas

`window.__valle.snap()` suma (sólo lectura): `char` (elegido), `charActive` (el que se ve), `matiState` (`off|loading|ready|failed`), `pose`, `poseCount` (veces que se mostró cada pose), `matiVisible`, `classicVisible`, `playerR`, `classicH`, `matiH`, `frameMs` (update + render del último cuadro) y `heap`.

### Pruebas

4 casos nuevos en `tests/e2e/valle_encantado.spec.js` (describe "personaje Mati Octo"):

1. Selector: dos opciones, no se piden GLB si no se elige; flecha derecha (escritorio) / tap (móvil) elige a Mati, el juego sigue en el menú, se bajan los 3 GLB, Mati visible y clásico oculto; tras recargar sigue elegido; flecha izquierda vuelve al clásico.
2. Partida con Mati: mismo radio y altura que el clásico; `idle` quieto → `run` con W → `idle` al soltar → `jump` al juntar un fragmento; colisión contra una casa a 3,5; golpe con Espacio; en "Proteger" daño (5 → 4 corazones) y caída hasta la pantalla de fin.
3. Clásico: el mismo choque contra la casa da 3,5.
4. Con `page.route` abortando los `.glb`/`.webp`: `matiState = failed`, se ve el clásico, aparece el aviso, "Proteger" arranca y avanza, sin errores de página.

Resultado (`ML_WORKERS=1 npx playwright test tests/e2e/valle_encantado.spec.js`): **20 passed, 2 skipped** — desktop 10/10, mobile 10/10 (los 2 salteados son los casos sólo-escritorio/sólo-móvil de siempre), 2,9 min.

Capturas revisadas: menú a 1280×800 (el selector entra entero en la columna derecha), Pixel 7 vertical (el selector queda debajo de los modos, se llega desplazando el menú, como ya pasaba con "Proteger") y 915×412 apaisado (entra al desplazar; en pantallas bajas las miniaturas se achican a 38 px).

### Rendimiento (medido)

Headless Chromium con SwiftShader (WebGL por CPU), 1280×800, modo Explorar caminando 4 s, 2 corridas por personaje:

| | draw calls (mediana, mín–máx) | update+render por cuadro (mediana) | heap JS | FPS |
|---|---|---|---|---|
| Clásico, corrida 1 | 104 (97–116) | 3,0 ms | 15,7 MB | 9,2 |
| Mati, corrida 1 | 99 (96–104) | 3,4 ms | 15,3 MB | 9,0 |
| Clásico, corrida 2 | 100 (97–107) | 3,4 ms | 15,8 MB | 9,2 |
| Mati, corrida 2 | 86 (83–100) | 2,7 ms | 16,4 MB | 9,5 |

Por construcción, el clásico son 10 draw calls (malla horneada, ojos, capa, 2 piernas, 2 brazos, bastón, orbe y su brillo) y Mati 1 (+1 sólo durante el golpe); la sombra es 1 en los dos. La variación entre corridas viene sobre todo de las partículas (humo, estelas) y de lo que entra en cámara. El costo por cuadro y el heap son equivalentes dentro del ruido; los FPS los limita el raster por CPU de SwiftShader.

### Pendientes

- El selector compartido baja los WebP de la vista previa aunque no se elija a Mati (cambio a pedir en `characters.js`, no en el juego).
- Mati es más ancho que el mago con la misma altura: puede rozar visualmente postes finos de cerca.
- No hay medición en GPU/celular real.

## MiniArcade 3.0

### Estado antes → después

- **Antes:** Explorar = 12 fragmentos + charlar con 8 habitantes; Proteger = oleadas infinitas de diablillos/ogros. Sin misiones, sin dificultad, sin niveles de calidad, sin jefes, sin mapa.
- **Después:** la campaña original sigue intacta (8 habitantes, 12 fragmentos con la flecha, final "¡El valle brilla!", oleadas y récord). Encima se agregaron: 2 misiones principales de la Anciana Alba + 7 misiones de los habitantes, diario con mapa y álbum, brújula al objetivo seguido, minimapa (escritorio), 4 tesoros escondidos, 4 zonas especiales, 3 guardianes con patrones telegrafiados, el Rey Sombrío con 3 fases, jefes cada 5 oleadas en Proteger, misiones compartidas (MLMissions), dificultad y calidad.
- Las fallas de `cambiar a viewport de celular` (canvas con el tamaño viejo si el `resize` llegaba tarde) se arreglaron: el canvas ahora sigue al viewport por CSS (`setSize(W,H,false)` + `#c{width:100%;height:100%}`).

### Misiones (MLMissions, HUD abajo a la izquierda, 2 secundarias por partida)

| id | tipo | título | evento | meta | notas |
|---|---|---|---|---|---|
| p_guardian | principal | Vencé a un guardián | bossDefeated | 1 | Aventura: 3 guardianes · Proteger: jefe en la oleada 5 |
| p_rey | principal | Vencé al Rey Sombrío | regionBoss | 1 | Aventura (tras los 3 sellos) o Proteger oleada 20 |
| s_golpes | secundaria | Asestá 20 golpes | hit | 20 | criaturas y jefes |
| s_doble | secundaria | Doble bastonazo | multiHit (max) | 2 | 2 blancos en un mismo golpe |
| s_limpio | secundaria | Sin un rasguño | kill | 6 | failOn: hurt |
| s_curas | secundaria | Luz que cura | heal | 2 | destellos dorados |
| s_charla | secundaria | Buen vecino | talk | 4 | habitantes distintos, cualquier modo |
| s_secreto | secundaria | Ojo de explorador | secret | 1 | 4 tesoros, en los dos modos |

`runStart()` en cada `startMode` (también "Otra vez" y Reiniciar desde la pausa, que primero cierra la partida anterior); `runEnd()` en el game over de Proteger, al volver al menú y al salir. Desmayarse en Explorar **no** cierra la partida (se puede "Levantarse").

### Dificultad (selector en el menú, no durante la partida)

| parámetro | Fácil | Normal (= original) | Difícil | Extremo |
|---|---|---|---|---|
| velocidad de criaturas | ×0,8 | ×1 | ×1,15 | ×1,3 |
| vida diablillo / ogro | 1 / 8 | 2 / 11 | 3 / 14 | 3 / 18 |
| drenaje al Corazón (diablillo / ogro) | 3 / 6 | 4 / 9 | 5 / 11 | 6 / 13 |
| diablillos por oleada | 2n+1 (tope 12) | 2n+2 (tope 14) | 2n+3 (tope 16) | 2n+4 (tope 18) |
| aviso antes del golpe de criatura | 0,6 s | 0,45 s | 0,4 s | 0,34 s |
| aviso de ataques de jefe (×) | 1,3 | 1 | 0,9 | 0,8 |
| vida de jefes (×) | 0,7 | 1 | 1,3 | 1,6 |
| daño de ataques pesados de jefe | 1 | 1 | 1 | 2 |
| prob. de destello curativo | 35 % | 22 % | 17 % | 12 % |
| tiempo de la carrera de hadas | 55 s | 40 s | 34 s | 28 s |

Los controles no cambian. El récord sigue siendo **uno solo** (mejor oleada, sin separar por dificultad).

### Calidad (`onQuality`)

| | baja | media | alta |
|---|---|---|---|
| tope de pixel ratio | 1 | 1,5 | 2 |
| sombras reales (PCF suave, mapa 1024, siguen al jugador) | no | no | sí |
| pasto instanciado con viento | 0 | 700 | 1600 |
| flores instanciadas | 0 | 160 | 320 |
| tope de partículas | 40 | 120 | 150 |
| luciérnagas / polen | 40 / 50 | 150 / 210 | 150 / 210 |
| pétalos / destellos del cielo | 6 / 6 | 18 / 16 | 26 / 16 |
| niebla (cerca / lejos) | 38 / 150 | 55 / 250 | 70 / 320 |
| distancia de dibujo (camera.far) | 420 | 1400 | 1400 |
| estelas de proyectiles y embestidas | no | sí | sí |
| guardianes en reposo se dejan de dibujar a | 42 m | 62 m | 62 m |
| Bosque Sombrío (cúpula, gemas, niebla) se dibuja a menos de | 85 m | 115 m | 115 m |
| niebla violeta del bosque | no | sí | sí |
| minimapa (redibujos/s) | apagado | 3 | 6 |

`MLArcade.requireWebGL()` se llama antes de crear el renderer.

### Contenido nuevo

- **Misiones de los habitantes** (marca ¡! amarilla = nueva, ¿? celeste = para entregar): Lirio (5 lirios de luna en la orilla → cura total), Bruno (4 atados de leña → bastón de roble, +1 de daño contra jefes), Pipa (pelota → corona de flores, cosmética permanente), Centella (carrera por 6 aros con tiempo → pluma de hada, +0,5 s de invulnerabilidad; si fallás, revancha), Otto (harina del Molino Viejo, junto al ogro → rosca, cura total), Maia (4 notas doradas), Simón (3 corderitos perdidos). Alba da las 2 principales: "La estrella rota" (los 12 fragmentos, como siempre) y "Los sellos sombríos" (3 guardianes → Rey → volver con Alba → corona de estrellas). El progreso sale del estado del mundo, así que hacer las cosas "fuera de orden" no traba nada.
- **Diario** (Q / M / botón 📜 / Y del gamepad): misiones con estado, tocar una la sigue (brújula y rastreador arriba), mapa con zonas, fragmentos, habitantes y objetivo, y álbum persistente (`valle_album`, 15 hallazgos). El mundo queda quieto mientras está abierto.
- **Zonas:** Molino Viejo, Jardín de Cristales, Claro Hechizado (arenas marcadas con piedras rúnicas) y el Bosque Sombrío (anillo de pinos oscuros, suelo y niebla violeta, cúpula con 3 gemas-sello que bloquea la entrada hasta romper los sellos).
- **Guardianes** (aviso en el suelo antes de cada ataque; si te alejás 12 m de la arena se curan y vuelven):
  - Ogro Jefe: embestida con línea roja de aviso (queda aturdido al terminar), pisotón en área, llama 2 diablillos.
  - Gólem de Cristal: pisotón de área grande, abanico de 6–8 esquirlas (se esquivan entre ellas).
  - Diablillo Hechicero: mantiene distancia, bolas de fuego (3 en abanico con poca vida), teletransporte marcado, invoca diablillos.
  - Rey Sombrío: fase 1 andanada + pisotón; fase 2 invoca corte + embestida; fase 3 más rápido, nova de 12 proyectiles y charcos de sombra alrededor del jugador. Inmune 1,2 s en cada cambio de fase.
  - Recompensas: 3 destellos curativos, sello/álbum; el Rey aclara el bosque.
- **Proteger:** cada 5 oleadas se suma un jefe (Ogro → Gólem → Hechicero → Rey, con +15 % de vida por ciclo); la oleada no termina hasta vencerlo; al caer suma 20 al Corazón y deja 2 destellos.
- **Desmayo en Explorar:** perder los corazones muestra "TE DESMAYASTE" con "✨ LEVANTARSE" (vuelve a la plaza con todo el progreso); los jefes en pelea se reinician.

### Cambios visuales

Pasto y flores instanciados con viento en el vértice, pinos oscuros instanciados (3 draw calls para todo el anillo), sombras reales en alta, niebla que se tiñe de violeta cerca del Bosque Sombrío, luz que sigue al jugador, valle más luminoso al completarlo, criaturas que rebotan al caminar y se agachan/ensanchan antes de pegar (aviso legible), habitantes que miran al jugador y saltan al entregar, cámara con suavizado corto que se aleja un poco y mira hacia el jefe durante las peleas, sin temblor con `prefers-reduced-motion`, carteles largos más chicos.

### Pruebas

`tests/e2e/valle_encantado.spec.js`: 11 casos existentes (+ Mati) y 11 nuevos (misiones completadas y persistencia; falla de "Sin un rasguño" y reinicio; dificultad con teclado/tap que persiste y cambia vida/aviso/tamaño de oleada; calidad baja/media/alta y botón de la pausa; diario; las 7 misiones de habitantes completables + alcanzabilidad de todos los objetivos con la colisión real + carrera fallida y revancha; guardianes que atacan, se curan al alejarte y rompen sellos; barrera, 3 fases del Rey y entrega a Alba; jefe en Proteger; desmayo; HUD sin solaparse en 412×915 y 915×412).

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/valle_encantado.spec.js`), última corrida completa: **42 passed, 2 skipped, 0 failed** — desktop 21/21, mobile 21/21 (los 2 salteados son los casos sólo-escritorio/sólo-móvil de siempre), 9,2 min. Después de la pasada de rendimiento: **42 passed, 2 skipped, 0 failed** otra vez (desktop 21/21, mobile 21/21, 6,4 min); se ajustaron 3 aserciones a los nuevos valores de baja (tope de partículas 40) y a las marcas recalculadas a 10 Hz (se esperan con `expect.poll`). Una corrida intermedia dio 38 passed, 4 failed, 2 skipped; los 4 eran errores de las pruebas nuevas (argumento faltante en un `poll` y una marca que se actualiza al cuadro siguiente), corregidos y verificados (4/4 passed).

Nota: durante el trabajo había 2 joysticks físicos conectados a la máquina que inyectaban teclas (abrían el diario o golpeaban solos) y hacían fallar al azar "partida con Mati"; el SDK ahora ignora los gamepads reales bajo automatización.

### Mediciones

#### Pasada de rendimiento (después de la primera entrega)

La primera versión de 3.0 dejaba Explorar más pesado (+15–25 draw calls, ~+2 ms de JS). Cambios:

- Destellos del cielo: 16 sprites → 1 nube de puntos.
- Fragmentos: 12 mallas + 12 sprites → 1 malla instanciada + 1 nube de puntos (cada fragmento conserva un `Object3D` lógico; las pruebas no cambian).
- Pétalos: 26 mallas con material propio → 1 `InstancedMesh` con color por instancia.
- Brillos fijos (faroles, cristales, hongos, farolitos del muelle, ~20 sprites) → 1 nube de puntos por textura y tamaño, armada al hornear.
- Ojos de habitantes, honguitos y jugador: `MeshLambertMaterial` casi negro en vez de `MeshBasic`, así se hornean con el cuerpo (un draw call menos cada uno).
- Marcas ¡!/¿? de los habitantes: 8 sprites → 2 nubes de puntos; el estado se recalcula a 10 Hz.
- Objetos de misión: la visibilidad se recalcula a 10 Hz y no se dibujan a más de 70 m.
- Flores instanciadas sin tallo (1 draw call en vez de 2).
- Pinos del Bosque Sombrío con esfera envolvente real (se descartan fuera de cámara). Cúpula, gemas, suelo y niebla del bosque sólo se dibujan con la cámara a menos de 115 m (85 en baja).
- Guardianes en reposo: no se dibujan a más de 62 m (42 en baja).
- Minimapa a 3 Hz en media; apagado en baja.
- Baja: sin pasto ni flores ni niebla del bosque, luciérnagas 40, polen 50, pétalos 6, partículas 40.

Método: `perf.cjs` (scratchpad). Headless Chromium + SwiftShader, 1280×800, dpr 1. Explorar caminando 4 s y Proteger con la oleada 1 en pantalla; mediana por cuadro. El original se sirve desde una copia en otro puerto y las corridas se intercalan (original → media → baja, ×3). Load average de la máquina: 6–12.

| corrida | Explorar: fps · draw calls · JS update+render · heap | Proteger: fps · draw calls · JS · heap |
|---|---|---|
| original 1 | 14,6 · 104 · 3,7 ms · 11,3 MB | 16,8 · 115 · 4,2 ms · 11,7 MB |
| media 1 | 11,6 · 91 · 3,8 ms · 15,6 MB | 14,3 · 92 · 3,8 ms · 23,3 MB |
| baja 1 | 15,0 · 93 · 3,7 ms · 17,2 MB | 17,1 · 90 · 3,6 ms · 14,3 MB |
| original 2 | 15,1 · 101 · 3,5 ms · 12,6 MB | 17,5 · 96 · 3,7 ms · 11,9 MB |
| media 2 | 12,3 · 96 · 4,5 ms · 16,8 MB | 13,0 · 105 · 5,0 ms · 24,6 MB |
| baja 2 | 14,0 · 93 · 4,3 ms · 17,2 MB | 17,4 · 100 · 4,6 ms · 14,8 MB |
| original 3 | 16,2 · 101 · 3,9 ms · 11,9 MB | 18,4 · 94 · 3,4 ms · 11,8 MB |
| media 3 | 10,9 · 97 · 3,7 ms · 15,9 MB | 12,9 · 98 · 4,0 ms · 23,4 MB |
| baja 3 | 14,6 · 90 · 3,8 ms · 17,4 MB | 16,4 · 84 · 4,1 ms · 13,3 MB |

Lectura honesta:

- **Draw calls:** media en Explorar quedó **por debajo** del original (91–97 contra 101–104); baja, 90–93.
- **JS por cuadro:** media 3,7–4,5 ms contra 3,5–3,9 ms del original. En 2 de 3 corridas queda igual dentro del ruido (3,7–3,8 ms); en la corrida 2 quedó 0,6–1 ms arriba. Baja: 3,7–4,3 ms. No se puede afirmar que media esté siempre por debajo del original.
- **FPS:** media sigue más baja que el original (10,9–12,3 contra 14,6–16,2). Con dpr 1 el costo extra es de raster (700 briznas de pasto y 160 flores dibujadas por CPU en SwiftShader), no de draw calls ni de JS. Baja (sin pasto ni flores) está a la par del original: 14,0–15,0 fps.
- **Baja contra media:** baja es más barata en FPS (+2–4 fps), partículas, minimapa y contenido dibujado. Los draw calls son parecidos porque lo que se quita en baja era poco (pasto, flores y niebla: 3 draw calls).
- **Heap:** más alto que el original (13–25 MB contra 11–12 MB): misiones, jefes, pools de peligros y proyectiles, canvas del mapa y texturas de las marcas.

#### Primera entrega (antes de la pasada, load average 26–30)

Explorar media: 3,2–5,1 fps · 120–129 draw calls · 4,3–7,3 ms. Baja: 4,2–6,3 fps · 118–130 draw calls · 6,8–9,6 ms. Original en la misma sesión: 5,1–9,5 fps · 101–106 draw calls · 2,4–5,6 ms.

### Pendientes / NO PROBADO

- **No probado en GPU real ni en celular real** (sólo SwiftShader); falta medir la calidad baja con dpr alto.
- En media los FPS de Explorar en SwiftShader siguen por debajo del original por el raster del pasto y las flores (en GPU real debería ser barato; falta medirlo). Si molestara, bajar `grass` de media a ~400.
- Récord único (no por dificultad). El progreso de misiones de los habitantes es por partida; sólo el álbum y las coronas persisten.
- Los jefes son esquivables pero no hay prueba automática de "esquivar" (la evitación real se verificó sólo con los avisos/hazards en capturas).
- `games/registry.js` sigue con la descripción vieja (pedir: mencionar misiones, guardianes y el Rey).
- Ideas para un three.js nuevo: sombras con `shadowMap.autoUpdate` por zonas, `MeshStandardMaterial` para cristales; no se hizo en esta ronda.
