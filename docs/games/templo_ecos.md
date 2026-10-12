# Templo de los Ecos (`templo_ecos`)

**Género:** puzles y aventura 3D · **Motor:** Three.js 0.186.1 (import map, módulos ES) + Kit3D · **Acento:** `#f5b84a` (luz ámbar sobre piedra arenisca y glifos turquesa)
**Archivos:** `templo_ecos.html`, `games/templo_ecos/*.js` (`main`, `config`, `models`, `physics`, `level`, `areas`, `enemies`, `boss`, `fx`, `sfx`, `ui`), `tests/e2e/templo_ecos.spec.js`.

## Concepto
Una exploradora con farol entra a un templo dormido. Para reactivarlo resuelve puzles de **luz** (espejos giratorios),
**sonido** (melodías de cristales) y **presión** (placas + bloques), cruza **plataformas temporizadas**, consigue dos
**reliquias** que transforman su exploración y enfrenta al **Guardián Eco**, que intenta absorber su reliquia.
Ganar = desactivar el Corazón del Templo **sin sacrificar la reliquia**.

Todo el arte es procedimental (geometrías low-poly fusionadas con color por vértice, `InstancedMesh` para estatuas y
columnas); todo el audio se sintetiza con `createAudio().tone`. No se usan GLB del paquete (no encajaban con la estética).

## Controles
| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Moverse | WASD / flechas | joystick izquierdo | stick / cruceta |
| Cámara | arrastrar mouse, Q / R | arrastrar el dedo fuera de los controles | LB / RB |
| Saltar (doble con Plumas) | Espacio* | botón SALTO | A |
| Interactuar | E* | botón USAR (se ilumina si hay algo cerca) o tocar el aviso «Girar espejo / Tocar cristal…» | X |
| Eco | F* | botón ECO (se atenúa en recarga) | B |
| Pausa | Esc / P | ⏸ de la barra | Start |

\* Re-asignables en **Controles y opciones** (menú y pausa), junto con sensibilidad, invertir cámara vertical y
movimiento reducido (Auto/Reducido/Completo; con reducido no hay sacudidas, destellos ni parpadeos). El mapa del gamepad
se muestra en esa pantalla y en «Cómo jugar». Sonido y calidad gráfica: menú del SDK.

## Escenarios
1. **Vestíbulo de Estatuas** (arenisca, rayos de sol): sala de estatuas con puzle de 3 placas (2 bloques + la exploradora),
   puerta sellada del santuario, **Sello del Eco** (emboscada de arañas), sala secreta tras pared agrietada, cornisa con
   brasero y abismo con 3 plataformas temporizadas, portal al siguiente escenario (requiere el Sello).
2. **Salas de Resonancia** (piedra azulada, tubos de bronce): hub con centinela, arañas y sello central; **Sala de Luz**
   (emisor + 3 espejos + receptor, espectro), **Sala del Eco** (4 cristales, Estatua Cantora, tablilla de pistas),
   **Sala del Vacío** (plataformas temporizadas y móvil, isla con **Plumas del Viento**, códice en lo alto, placa que
   levanta un puente escalonado). Sala secreta en el hub. El sello central baja a la Cámara con las 3 salas resueltas.
3. **Cámara del Guardián** (arena circular rojiza): 4 pilares (cobertura), 3 resonadores (obelisco emisor + espejo + placa),
   Corazón del Templo suspendido, compuerta que se cierra al empezar el combate.

Se puede viajar entre escenarios en ambos sentidos (portales de regreso), así nada queda bloqueado.

## Sistemas
- **Física**: AABB por ejes con escalones (0.45 m), salto con búfer y tiempo de coyote, salto corto al soltar, arrastre por plataformas móviles.
- **Puzles de luz**: rayo 2D trazado cada cuadro contra muros, espejos (segmentos que reflejan con su ángulo animado), receptores y blancos (espectros, arañas, Guardián).
- **Sonido**: la melodía se genera con semilla por dificultad (3–6 notas); cada nota tiene color, forma (▲●◆■), tono y subtítulo visual.
- **Presión**: placas que se hunden con la exploradora o con bloques; bloques empujables de a baldosa (2 m) caminando contra ellos, con chequeo de piso y colisión; altar de reinicio.
- **Reliquias**: *Sello del Eco* (habilidad Eco: onda de 4.5 m que derrumba grietas, destruye arañas, repele espectros, aturde centinelas por la espalda, devuelve rayos y corta el drenaje) y *Plumas del Viento* (doble salto).
- **Checkpoints**: braseros; caer cuesta 1 ♥ y vuelve al brasero; vida 0 gasta una 🔥 llama y vuelve al brasero con vida llena. Sin llamas → derrota (el progreso de campaña queda).
- **Cámara**: tercera persona orbital; se acerca si un muro visible tapa a la exploradora; en el combate encuadra a la exploradora y al Guardián.
- **Estado persistente**: espejos, puertas, bloques, paredes rotas, braseros, salas, códices y reliquias quedan guardados (sesión y recarga).

## Rivales
| Rival | Silueta | Patrón | Contrajuego |
|---|---|---|---|
| Centinela de piedra | mole ancha, ojo en ranura, cono de visión ámbar en el piso | patrulla; si te ve (cono + línea de visión) se planta 0.7 s y embiste en línea recta | romper la línea de visión con columnas, hacerlo chocar contra un muro (queda aturdido), Eco por la espalda |
| Araña de ruinas | baja, 8 patas, ojos rojos | duerme; al acercarte corre en zigzag, muerde y retrocede | el Eco la destruye, la luz la quema, se la puede esquivar saltando |
| Espectro vigía | túnica translúcida con farol, casi invisible de lejos | ronda su puesto; te persigue atravesando muros y drena vida | el Eco lo repele y aturde; llevarlo a un rayo de luz lo disuelve (reaparece a los 14 s) |

## Guardián Eco (gran evento)
Intro cinemática (salteable con salto/usar/toque; versión corta con movimiento reducido): emerge del piso, se cierra la compuerta.
- **Fase 1 · Eco reflejado**: telegrafía con una línea roja que se fija 0.3 s antes del disparo; el rayo se devuelve con el Eco si está cerca (ventana según dificultad). 3–4 rayos devueltos.
- **Fase 2 · Resonadores**: escudo de 3 fragmentos. Pisar la placa abre la luz del obelisco 10 s; girar el espejo hasta que el rayo toque al Guardián 1.2 s rompe un fragmento. Ataca con ondas de choque (saltarlas), arañas y **drenaje** violeta de la reliquia (cubrirse tras un pilar o usar el Eco).
- **Fase 3 · Corazón**: el Corazón baja; rayos más rápidos (dobles en Difícil/Extremo), ondas y drenaje. 2–3 rayos devueltos derrotan al Guardián.
- **Final**: desactivar el Corazón → cinemática de reactivación → victoria. **Recompensa**: +3000 pts (+300 por llama, +100 por ♥), farol dorado permanente y templo abierto para completar códices/secretos.
- Si la reliquia llega a 0 (3 grietas), se pierde una llama y se reinicia **la fase actual** (no todo el combate). Morir en el combate también reinicia la fase.

## Misiones (MLMissions)
| Tipo | Misión | Evento | Meta |
|---|---|---|---|
| Principal 1 | Encontrá el Sello del Eco | `sello` | 1 |
| Principal 2 | Resolvé las tres salas | `roomSolved` | 3 |
| Principal 3 | Desactivá el Corazón del Templo | `heartOff` | 1 |
| Secundaria | Descubrí dos salas secretas | `secret` | 2 |
| Secundaria | Acertijo sin pistas (falla con `hintUsed`) | `riddleNoHint` | 1 |
| Secundaria | Recogé seis códices (hay 9) | `codex` | 6 |
| Secundaria | Sala en tiempo récord (Luz 75 s, Eco 60 s, Vacío 55 s × dificultad) | `roomRecord` | 1 |

Se muestran 1 principal + 4 secundarias por partida. Al empezar una partida se re-emite el progreso de campaña guardado
(códices, secretos, salas, reliquia), así las metas acumulativas no se pierden entre sesiones.

## Dificultad
| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Vida ♥ | 5 | 4 | 3 | 2 |
| Llamas 🔥 | 9 | 5 | 3 | 2 |
| Velocidad de rivales/ondas | ×0.8 | ×1 | ×1.2 | ×1.4 |
| Ventana sólida de plataformas | ×1.35 | ×1 | ×0.85 | ×0.7 |
| Aviso del Guardián (s) | 1.6 | 1.2 | 0.95 | 0.75 |
| Ventana de reflejo (s) | 0.42 | 0.32 | 0.26 | 0.2 |
| Drenaje por grieta (s) | 2.6 | 2.0 | 1.6 | 1.3 |
| Intervalo entre rayos (s) | 3.2 | 2.6 | 2.2 | 1.9 |
| Rayos F1 / F3 | 3 / 2 | 3 / 2 | 4 / 3 | 4 / 3 |
| Notas de la melodía | 3 | 4 | 5 | 6 |
| Tiempo récord | ×1.4 | ×1 | ×0.85 | ×0.75 |
| Rayo doble en F3 | no | no | sí | sí |

## Calidad
| | Baja | Media | Alta |
|---|---|---|---|
| DPR máx. (Kit3D) | 1 | 1.5 | 2 |
| Sombras | no | no | sí (PCF 1024) |
| Partículas de polvo | 60 | 220 | 420 |
| Luces puntuales | 1 | 3 | 6 |
| Niebla (cerca/lejos) | 12/40 | 18/62 | 24/90 |
| Plano lejano | 70 | 110 | 160 |
| Halo de los rayos | no | sí | sí |

## Guardado (`templo_ecos:save`, versión 1, `createSave`)
`{ area, cp, relics{sello,plumas}, codices[], secrets[], rooms{luz,eco,vacio}, best{sala:s}, mirrors{id:idx}, doors{}, blocks{id:[x,z]}, walls{}, braziers{}, score, started, bossDone, wins, tutorial{off,seen{}}, opts{sens,invert,motion,binds{jump,use,eco}} }`.
JSON corrupto → se descarta (copia en `templo_ecos:save:corrupto`) y se arranca de cero; forma inválida → `sanitize()`
repara campo por campo. «Nueva expedición» (con confirmación) borra la campaña pero conserva opciones, tutorial y victorias.
Logros de misiones y dificultad: claves compartidas `ml:missions` / `ml:difficulty`; récord: `ml:scores`.

## Gancho de pruebas
`window.__templo_ecos` (sólo lectura): `state, scene, area, missions, player, hp, maxHp, flames, score, runTime, simTime,
paused, tip, prompt, camYaw, stats, touch, counts, enemies, perf, quality, difficulty, boss, puzzle, save` (`stats`: contadores
monótonos de saltos/altura máxima/distancia/usos/ecos/toques del aviso; `touch`: táctil, FOV, búfer del Eco, radio de reflejo).
Con `?debug` agrega `debug`: `freeze` (el bucle real deja de avanzar la simulación; sólo `simulate`), `showTip`, `goto, simulate, teleport, setHP, setFlames, give, solveRoom, openDoor, use, rotateMirror, pulse, hurt, spawnBoss,
bossPhase, bossHit, killBoss, strike, skipCut, reflectAll`.

## Pruebas (`tests/e2e/templo_ecos.spec.js`)
20 pruebas por proyecto. Las de juego con `?debug` arrancan con `startFrozen`: tras arrancar con entrada real se congela el
bucle real (`debug.freeze`) y se baja la calidad, así sólo `simulate()` avanza el juego y la tecla/toque real se consume
siempre en el próximo paso simulado (resultado independiente de la carga de CPU). Cobertura: carga sin errores; arranque
con entrada real + movimiento + salto (verificado con contadores monótonos `stats`); tutorial; placas + bloques + puerta;
Sello + arañas + pared secreta + códice + persistencia; espejos; Sala del Eco; plataformas temporizadas y brasero; 3
escenarios; rivales; Guardián completo; drenaje + derrota + reintento; pausa; guardado corrupto; dificultad; calidad;
celular HUD 412×915/915×412; **celular: matriz de pantallas**; **celular: recorrido sólo táctil**; **celular: vibración,
pausa en segundo plano y gestos** (ver «Móvil»).

**Resultados reales (2026-10-11, máquina compartida con otros agentes, carga media ~50–60):**
- `ML_WORKERS=1`: desktop 16 passed / 4 skipped (las de celular); mobile (Pixel 7) 17 passed / 3 skipped. Total 33 passed, 7 skipped, 0 failed (13.3 min).
- `ML_WORKERS=4`: mismo resultado, 33 passed, 7 skipped, 0 failed (5.0 min).
- Además, «arranque…», «Sello del Eco…», «Guardián Eco…» y «recorrido sólo táctil» con `--repeat-each 2` y 4 workers: 14/14 passed.

## Móvil
Capturas reales (Chromium headless, `isMobile` + `hasTouch`, DPR 2–3; script de auditoría con `?debug`, que además muestra
el contador de FPS del SDK arriba): antes `.perf/mobile-templo_ecos/before/<tamaño>-{menu,play,mirror,boss}.png`, después
`.perf/mobile-templo_ecos/after/…` (con `report.json` de cajas, superposiciones y textos chicos). Tamaños: 360×640,
390×844, 412×915, 915×412 y 844×390.

**Problemas encontrados → arreglados**
- La columna derecha (tutorial/objetivo/jefe) empezaba en y=48 y quedaba **debajo de la barra del SDK** (58 px en táctil) en
  los 5 tamaños; los chips de estado también la pisaban en 360/390/412 vertical. Ahora `layout()` (ui.js) mide la barra,
  los chips, las misiones y los controles reales y ubica todo con variables `--te-*`; se recalcula al girar, al cambiar la
  barra del navegador (`visualViewport`) y cuando cambia el HUD (`ResizeObserver`).
- Chips de estado con `height:32px;overflow:hidden`: en 360 px **se cortaban** (puntos/Eco invisibles). Ahora hacen salto de
  línea y las misiones bajan debajo.
- Apaisado (915×412, 844×390): en el jefe, el tutorial **tapaba el botón ECO**. Los tres botones van en fila
  (ECO · SALTO · USAR) y la columna derecha tiene alto máximo hasta los controles; si no entra, el objetivo cede lugar.
- Aviso de interacción en apaisado podía caer sobre los botones: su ancho se calcula entre joystick y botones.
- Botones del tutorial 32 px, cerrar inscripción 34 px, selects/botones de opciones 34 px → **≥ 44 px**; botones del menú en
  apaisado 40–42 px → 48 px, principal **56 px**; en pantallas bajas el menú oculta la descripción para que entre sin scroll.
- Textos: `TUTORIAL` 10→11 px, subtítulo del jefe 11→12 px, misiones 11→12 px en táctil.
- Avisos (toast) en vertical: tope al 18 % encima del tutorial y del aviso de misión, angostos (≤ 50 % del ancho). Ahora
  usan todo el ancho bajo la barra y el aviso de misión va debajo; en apaisado van abajo al centro. Siguen pudiendo tapar
  por 1,5–3 s el tutorial/misiones en vertical (transitorio, aceptado).
- Encuadre vertical: FOV 50 → **62** cuando el aspecto es < 0,8 (además de la distancia mayor que ya había).
- Aviso suave «Apaisado se ve más del templo» al arrancar en vertical (5 s, se cierra con un toque, no bloquea).

**Asistencias táctiles (escritorio sin cambios)**
- Tocar el aviso («Girar espejo», «Tocar cristal turquesa», «Escuchar la melodía»…) equivale a USAR: espejos y melodía se
  resuelven sólo con toques y el blanco es grande.
- Jefe: radio de reflejo del Eco +1,0 (≈ 75 ms de latencia de toque a velocidad 13) y búfer: un ECO tocado hasta 0,2 s antes
  de que el rayo entre al radio se guarda y se dispara solo cuando entra.
- Vibración corta opcional (botones 10 ms, aviso 12 ms, daño 35 ms, reflejo 25 ms); opción «Vibración» en Controles (sólo
  táctil) y se apaga con movimiento reducido.

**Ya estaba bien (verificado):** `touch-action:none` en la superficie (kit) y ahora también en el HUD; viewport sin
`user-scalable`/`maximum-scale`; multitáctil joystick + botón + cámara; pausa al pasar a segundo plano (SDK); calidad
automática en táctil = media (DPR ≤ 1,5, sin sombras).

**Pruebas móviles nuevas (proyecto mobile, Pixel 7):** matriz de 5 tamaños (menú: principal visible, en pantalla, ≥ 56 px y
tocable; todos los botones ≥ 44 px; partida en exploración/espejo/jefe girando el tamaño en plena partida: sin salirse,
sin superponerse con barra/misiones/controles, sin recortes en la columna, blancos ≥ 44 px, textos ≥ 12 px (misiones ≥ 11),
FOV según orientación); recorrido sólo táctil (joystick + SALTO a la vez, «Entendido», espejo con el aviso y con USAR,
melodía completa tocando el aviso, dos reflejos con ECO tocado temprano); vibración on/off, `touch-action`, viewport y
pausa por `visibilitychange`.

**Flaky de CI arreglado («arranque con entrada real, movimiento y salto»):** muestreaba `player.y > 0.2` con `expect.poll`
después de un salto corto (≈ 0,45 s en el aire): con los intervalos del poll y la CPU de CI el pico se perdía. Ahora corre
congelado: el toque/tecla real queda apretado mientras corre `simulate()` y el salto se verifica con contadores monótonos
(`stats.jumps`, `stats.peak`). Con la misma técnica se estabilizaron «Sello del Eco» (en móvil fallaba: el Eco salía cuando
una araña ya había salido del radio) y «Guardián Eco» (timeout con 4 workers).

**NO PROBADO:** teléfonos reales (no hay disponibles), Safari/iOS (notch real, `navigator.vibrate` no existe en iOS: la
opción simplemente no hace nada), FPS reales en gama baja.

## Rendimiento (Chromium headless + SwiftShader, 1280×800; sirve para comparar, no son FPS reales)
`node tests/perf/measure.mjs` (menú): Media → 16.5 fps, peor cuadro 183 ms, heap 7.1 MB, 1043 KB, 23 requests, 0 errores;
Baja → 19.4 fps, peor cuadro 150 ms, heap 7.2 MB.

En partida (gancho `perf`, promedio de 40 cuadros):
| Calidad | Área | ms/cuadro | draw calls | triángulos | update ms | render CPU ms | heap MB |
|---|---|---|---|---|---|---|---|
| Media | 1 | 56.7 | 34 | 10.6k | 0.4 | 0.8 | 12.7 |
| Media | 2 | 60.4 | 37 | 12.9k | 0.5 | 1.3 | 16.1 |
| Media | 3 (jefe) | 49.2 | 52 | 6.4k | 0.3 | 1.3 | 13.0 |
| Baja | 1 | 37.1 | 34 | 10.6k | 0.4 | 1.1 | 11.7 |
| Baja | 2 | 51.2 | 35 | 12.9k | 0.4 | 1.1 | 15.0 |
| Baja | 3 (jefe) | 35.4 | 52 | 6.4k | 0.3 | 1.1 | 12.0 |

La CPU del juego (update + armado del render) es ~1–2 ms por cuadro; el tiempo restante es el rasterizado por software de
SwiftShader. Degradación para hardware inferior: Baja quita sombras, halo de rayos, 5 luces y 85 % del polvo, DPR 1 y niebla corta.

## Pendiente / NO PROBADO
- NO PROBADO en dispositivos reales (sólo Chromium headless con SwiftShader); FPS reales en celulares de gama baja sin medir.
- NO PROBADO con un gamepad físico (el SDK ignora mandos bajo webdriver); el mapa se probó sólo por lectura de código.
- La cinemática de la cámara en el combate puede quedar detrás de un pilar si te escondés (comportamiento esperado, se ve igual al Guardián al salir).
- Sin portada `games/thumbs/templo_ecos.webp` (fuera de los archivos permitidos) ni entrada en `games/registry.js`.
