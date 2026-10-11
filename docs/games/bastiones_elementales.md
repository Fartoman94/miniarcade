# Bastiones Elementales (`bastiones_elementales`)

**Género:** tower defense 3D / estrategia · **Motor:** Three.js 0.186.1 (import map, módulos ES) + Kit3D · **Acento:** `#8f7bff` (violeta arcano: el color del cristal que se defiende, neutral entre fuego, hielo y rayo)
**Archivos:** `bastiones_elementales.html`, `games/bastiones_elementales/*.js` (`main`, `config`, `models`, `world`, `enemies`, `towers`, `boss`, `fx`, `sfx`, `ui`), `tests/e2e/bastiones_elementales.spec.js`.

## Concepto
Un cristal arcano sostiene el valle y las criaturas elementales quieren romperlo. El jugador construye torres en
plataformas ◇ junto a los caminos, las combina para disparar **sinergias elementales**, gira **puentes levadizos** con
palancas para decidir por qué orilla pasa el enemigo, **cosecha cristales auxiliares** para tener más esencia y resiste
oleadas con armaduras distintas en tres escenarios. En el último despierta el **Titán Elemental**, que cambia de
inmunidad, fuerza los puentes y aturde torres. Ganar = derrotarlo con el cristal en pie.

Todo el arte es procedimental (geometrías low-poly fusionadas con color por vértice; decoración, plataformas, enemigos,
proyectiles, barras de vida y partículas con `InstancedMesh`). No se usan los GLB del paquete (no encajaban con la
estética de diorama). Todo el audio se sintetiza con `createAudio().tone`.

## Controles
| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Elegir / construir | clic izquierdo | tocar | A (elige lo que está bajo la retícula central) |
| Mover cámara | arrastrar · WASD / flechas | arrastrar un dedo | stick izq. / cruceta |
| Zoom | rueda · Z / C | pellizcar | LT / RT |
| Girar cámara | clic derecho + arrastrar · Q / E | girar con dos dedos · botones ⟲ ⟳ | LB / RB |
| Torres | 1 Ballesta · 2 Fuego · 3 Hielo · 4 Rayo (con una plataforma elegida) | panel inferior | ◀ ▶ en el panel + A |
| Mejorar · Vender · Reubicar | U* · X* · R | panel | X mejorar · ◀ ▶ + A |
| Llamar oleada · Velocidad x1/x2 | Espacio* · T* | botones ▶▶ · x1 | Y · Select |
| Cerrar panel · Pausa | clic en el vacío / ⌫ · Esc / P | ✕ · ⏸ | B · Start |

\* Re-asignables en **Controles** (menú y pausa), junto con sensibilidad de cámara, velocidad de zoom, invertir arrastre,
movimiento reducido (Auto/Sí/No: sin sacudidas, destellos ni relámpagos) y «mostrar el alcance de todas las torres».
El mapa del gamepad se ve en Controles y en Cómo jugar. Sonido y calidad: menú del SDK (⚙ / ⏸).
Los botones táctiles (createInput) miden 64 px y se ocultan mientras hay un panel abierto para no pisarlo.

## Escenarios
1. **Puente Glacial** (nieve, pinos, témpanos en el río): un portal al oeste, el cristal al este; el río helado se cruza por
   el norte o por el sur según **un puente levadizo** con palanca. 20 plataformas, 2 cristales auxiliares. 8 oleadas
   (trasgos, caballeros, harpías, gólems y un gólem **élite** al final).
2. **Paso de Lava** (basalto, obsidiana, brasas, río de lava luminoso): **dos portales** (norte y sur) que confluyen;
   un puente sobre la lava. 16 plataformas, 2 cristales auxiliares. 9 oleadas con muchos **imps**; caballero élite final.
   Empieza con +60 de esencia.
3. **Valle del Trueno** (pradera, robles, menhires, lluvia y relámpagos): dos portales al norte, el cristal al sur, un río
   horizontal con **dos puentes y dos palancas** (4 cruces posibles, siempre 2 abiertos). 19 plataformas, 3 cristales
   auxiliares. 10 oleadas; la 10 es el **Titán Elemental**. Empieza con +140 de esencia.

Los escenarios se desbloquean en orden (menú con selector) y al ganar uno aparece «Siguiente». El menú usa el escenario
elegido como fondo 3D en órbita lenta.

## Sistemas
- **Grilla 20×13** (baldosas de 2 m) definida en texto en `config.js`; de ella salen el terreno (una geometría), las
  plataformas, el río, los puentes, las palancas, los cristales y los portales.
- **Navegación enemiga**: campo de flujo BFS desde el cristal sobre las baldosas caminables; cada enemigo de tierra va a la
  baldosa vecina con menor distancia (prefiriendo seguir derecho). Al girar un puente se recalcula el campo y los enemigos
  que ya iban hacia el cruce cerrado **dan la vuelta**. Las flechas ˄ del piso muestran la ruta actual (se tiñen de rojo
  cuando el Titán va a desviarla). Los voladores ignoran caminos y puentes: línea recta (con vaivén) al cristal.
- **Torres** (4 tipos × 3 niveles, modelos distintos por nivel): Ballesta (piedra, aire ×1.5, doble virote en III),
  Fuego (tiro parabólico anticipado, área + quemadura, sólo tierra), Hielo (frena, congela cada N impactos, área en III),
  Rayo (cadena que ignora armadura, aturde en III). Prioridad de apuntado: Primero / Más fuerte / Más cerca.
  Las torres no gastan disparos en enemigos inmunes a su elemento.
- **Sinergias**: *Choque térmico* (fuego sobre frenado/congelado o hielo sobre quemado → daño extra y armadura rota 4.5 s),
  *Conducción* (rayo sobre frenado/congelado → ×1.6 y un salto más de cadena), *Sobrecarga* (rayo sobre quemado →
  explosión en área). Cada una muestra su nombre sobre el enemigo y suma a la misión de sinergias.
- **Reubicación limitada**: una torre se puede mudar a otra plataforma libre (se hunde y emerge, 1 s sin disparar); cupo por
  escenario según dificultad. Vender devuelve el 70 % de lo invertido.
- **Oleadas**: la primera espera a que el jugador la llame; las siguientes tienen cuenta regresiva (Fácil 22 s … Extremo
  10 s) y se pueden adelantar (+1 de esencia por segundo ahorrado; +10 si se llama con la anterior todavía en curso pero ya
  sin aparecer enemigos). Cartel con la composición antes y durante cada oleada; velocidad x1/x2.
- **Economía**: esencia por baja (× dificultad, élite ×4), bono por oleada superada, cosecha de cristales auxiliares
  (+30 × dificultad cada 13 s de carga, con un toque cuando brillan).
- **Cristales auxiliares**: se drenan cuando pasan enemigos cerca y los imps los atacan; se regeneran solos si nadie los
  toca; se reparan (20) o, si se rompen, se restauran (80). Perder uno hace fallar «Salvá todos los cristales auxiliares».
- **Palancas de puente**: tocar → el puente se levanta y el otro baja (animación de bisagra), la ruta cambia. Enfriamiento
  10 s; no gira si hay enemigos sobre el puente; nunca deja a un portal sin camino (se valida con un BFS hipotético).
- **Punto de control**: al terminar cada oleada se guarda el estado (oleada, esencia, cristal, torres con nivel y
  prioridad, puentes, cristales auxiliares, reubicaciones). El menú ofrece «Continuar · oleada N» (también tras una
  derrota: nunca hay bloqueo irreversible). «Nueva partida» / «Reintentar» empiezan el escenario desde cero.
- **Cámara**: orbital inclinada (52–64° según el zoom), arrastre «agarrando el suelo», pellizco, giro de dos dedos, encuadre
  automático (en vertical la cámara gira 90° para que el mapa entre a lo alto).
- **Selección por raycast**: el rayo del puntero se intersecta con planos a varias alturas (piso, mitad y cima de las
  torres, cristales) y se elige el objeto más cercano dentro de una tolerancia mayor en táctil. Anillo de selección,
  alcance de la torre (o del tipo que se está por construir al pasar el mouse por el botón) y anillo de hover en PC.

## Enemigos
| Rival | Armadura | Silueta | Patrón | Contrajuego |
|---|---|---|---|---|
| Trasgo | Ligera | bajito verde con lanza | marcha por la ruta | cualquier torre |
| Imp volcánico | Ígnea (inmune al fuego, hielo ×1.5) | rojo, cuernos, alitas y cola | rápido; al bajar del 60 % **salta 2 baldosas** hacia adelante; se detiene a **atacar cristales auxiliares** cercanos | hielo: congelado no salta ni ataca; torres cerca de los cristales |
| Gólem de hielo | Gélida (fuego ×1.6, hielo ×0.25, no se frena) | mole azul con cristales en la espalda | lento y duro; cada 7 s **congela la torre más cercana** 3 s (anillo azul de aviso de 1 s) | fuego, choque térmico, no amontonar torres sobre su ruta |
| Caballero blindado | Pesada (piedra ×0.4, fuego ×0.7, hielo ×0.8, rayo ×1.2) | acero, escudo azul, penacho rojo | al recibir daño levanta un **escudo** 2.4 s (−75 % salvo rayo) | rayo, o choque térmico para romper la armadura |
| Harpía de tormenta | Etérea (fuego no la alcanza, piedra ×1.5) | alas anchas que aletean, sombra en el piso | **vuela recto** al cristal ignorando rutas y puentes | ballesta, hielo y rayo sobre la línea de vuelo |
| Élite (final de 1 y 2) | según tipo | ×1.35 de tamaño, tono dorado | ×3.2 de vida, deja ×4 de esencia y resta ×2 de cristal | concentrar fuego/sinergias |

## Titán Elemental (gran evento, oleada 10 del Valle del Trueno)
- **Intro**: cinemática (cámara al portal, el Titán emerge del suelo con temblor y rugido, cartel). Se saltea tocando o con
  Enter/Espacio.
- **Fase 1 · Coraza de Escarcha**: inmune al hielo (daño y freno), débil al fuego (×1.5).
- **Transición** (al 66 % y al 33 %): se detiene 3 s, invulnerable, anillo del color de la fase siguiente y cartel con la
  nueva inmunidad. Antes de la fase 2 las flechas del piso se tiñen de rojo y aparece el aviso de desvío.
- **Fase 2 · Núcleo de Magma**: inmune al fuego, débil al hielo. **Desvía la ruta**: gira todos los puentes al otro estado
  y bloquea las palancas 25 s (los enemigos que estaban sobre un tablero que se levanta caen al agua). Invoca 4 imps.
- **Fase 3 · Ojo de la Tormenta**: inmune al rayo, débil a la piedra. Invoca 4 harpías. Cada 9 s **pulso**: disco
  amarillo de aviso 1.6 s (el Titán se planta) y luego aturde 2.5 s las torres en 7.5 m.
- Si llega al cristal lo destruye (derrota). **Recompensa**: +3000 puntos, +400 de esencia, misión principal y la
  **Corona Elemental** permanente girando sobre el cristal en todos los escenarios.

## Misiones (MLMissions, 3 principales + 3 secundarias por partida)
| Tipo | Misión | Evento | Meta |
|---|---|---|---|
| Principal | Defendé el cristal principal (ganá un escenario) | `crystalDefended` | 1 |
| Principal | Completá 10 oleadas (suma entre partidas, se re-emite el total guardado) | `wavesTotal` (max) | 10 |
| Principal | Detené al Titán Elemental | `titanDown` | 1 |
| Secundaria | Ganá sin torres de fuego (falla con `fireBuilt`, requiere victoria) | `mapWon` | 1 |
| Secundaria | Mejorá tres torres al máximo | `maxed` | 3 |
| Secundaria | Salvá todos los cristales auxiliares (falla con `auxLost`, requiere victoria) | `mapWon` | 1 |
| Secundaria | Derrotá cien enemigos (en una partida) | `kill` | 100 |
| Secundaria | Encadená 15 sinergias | `combo` | 15 |
| Secundaria | Cosechá 8 cristales | `harvest` | 8 |

Al retomar desde un punto de control se re-emiten `fireBuilt`, `auxLost` y `maxed` para que las misiones reflejen la
partida real. En escritorio la lista va bajo el estado; en celular se resume en una fila «Misiones x/6» (detalle en la pausa).

## Dificultad
| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Vida del cristal | 30 | 20 | 15 | 10 |
| Vida enemiga | ×0.75 | ×1 | ×1.3 | ×1.65 |
| Velocidad enemiga | ×0.9 | ×1 | ×1.1 | ×1.2 |
| Esencia inicial | 280 | 220 | 190 | 170 |
| Recompensas (bajas, oleadas) | ×1.2 | ×1 | ×0.9 | ×0.8 |
| Cosecha de cristal | ×1.2 | ×1 | ×0.9 | ×0.8 |
| Reubicaciones por escenario | 4 | 3 | 2 | 1 |
| Pausa entre oleadas | 22 s | 16 s | 12 s | 10 s |
| Vida del Titán (base 12 000) | ×0.75 | ×1 | ×1.3 | ×1.6 |

## Calidad
| | Baja | Media | Alta |
|---|---|---|---|
| DPR máx. (Kit3D) | 1 | 1.5 | 2 |
| Sombras | no | no | sí (PCF 2048) |
| Partículas (tope del pool) | 160 | 420 | 900 |
| Decoración (densidad) | 45 % | 75 % | 100 % |
| Luces puntuales (cristal, portales, auxiliares) | 0 | 2 | 4–5 |
| Niebla lejana / plano lejano | 70 / 110 | 95 / 135 | 130 / 170 |
| Clima (copos/brasas/lluvia) | 60 | 220 | 480 |
| Agua/lava animada y témpanos | 6 quietos | 14 | 14 |

La densidad de decoración se aplica al construir el escenario (en el menú se reconstruye al instante; en partida, al
cambiar de escenario); el resto se aplica en vivo.

## Guardado (`bastiones_elementales:save`, versión 1, `createSave`)
`{ unlocked, mapSel, wavesTotal, defended, titan, wins, runs, kills, best:[{waves,won,score}|null ×3],
checkpoint:{map,wave,gold,crystal,score,kills,moves,diff,fireBuilt,auxLost,maxed,towers:[{pad,type,lv,prio,inv}],bridges:[],aux:[{hp,alive,charge}]}|null,
settings:{pan,zoom,invert,motion,ranges,haptics,binds:{wave,speed,upgrade,sell}}, tutorial:{done} }`.
JSON corrupto → se descarta (copia en `bastiones_elementales:save:corrupto`) y se arranca de cero; forma inválida →
`sanitize()` repara campo por campo (rangos, teclas válidas no reservadas, punto de control coherente, claves extra fuera).
Logros/dificultad: `ml:missions` / `ml:difficulty`; récord: `ml:scores` (vía `MLArcade.ended({score})`).

## Móvil
Pasada mobile-first (2026-10-11). Medido en Chromium headless con emulación táctil (isMobile + hasTouch, DPR 3) a
360×640, 390×844, 412×915, 915×412 y 844×390. **No probado en teléfonos reales** (no hay dispositivos): sólo emulación.

Capturas reales (script de capturas, sin el contador de FPS de `?debug`):
- Antes: `.perf/mobile-bastiones/before/<tamaño>-{menu,help,opts,play,panel,tower}.png` + `result.json`
- Después: `.perf/mobile-bastiones/after/<tamaño>-{menu,help,opts,play,panel,tower}.png` + `result.json`
- Auditoría central previa: `.perf/mobile-audit/bastiones_elementales-*.png`

| Problema encontrado (tamaño) | Arreglo |
|---|---|
| Con la barra del SDK de 44 px en táctil, el cartel de oleada pisaba la barra (412×915: falla real de la prueba «celular» existente) y el bloque de estado quedaba debajo del botón ⌂ (360×640) | En vertical táctil el cartel de oleada baja a +62 px; en ≤ 430 px también el estado; en apaisado el cartel se angosta para no llegar a la barra |
| «Cómo jugar» / «Controles» abiertos desde el menú se transparentaban sobre el menú (texto encimado en todos los tamaños) y su título quedaba bajo la barra del SDK | El menú se oculta al abrir la ayuda/controles y vuelve al cerrar; las pantallas dejan 62 px arriba para la barra |
| Objetivos chicos: ✕ del panel 34×34, OK/Saltar del tutorial 38×33, deslizadores 150×16, selector 88×33, botones de teclas 88×31; menú apaisado: principal 237×39, secundarios 41 px | Táctil: ✕ 44×44, tutorial ≥ 44×52, filas de opciones ≥ 44 (el `label` entero es el área de toque), selector y deslizadores 44 px de alto, botón principal ≥ 56 px, secundarios ≥ 44–48 px |
| Texto de 9–10 px: ESENCIA/PTS, TUTORIAL, CONSTRUIR, nombres de escenario, tablas de ayuda | ≥ 11 px en táctil (etiquetas) y 12 px en costos, marcadores y texto de dificultad |
| Ayuda y Controles con columnas PC/Gamepad y reasignación de teclas que no aplican en el celular (tabla de 4 columnas apretada en 360 px) | En táctil sólo la columna TÁCTIL; teclas y gamepad ocultos (siguen en escritorio) |
| Menú apaisado 844×390 con los botones más grandes: «Cómo jugar»/«Controles» quedaban fuera de pantalla | Menú apaisado compacto (escenarios 52 px, huecos menores): todo entra sin scroll en 844×390 y 915×412 |
| Plataformas de ~20 px y separadas 36–47 px en pantalla (360–412 px de ancho): tocar al lado fallaba o elegía otra | Selección táctil por distancia en píxeles con radio mínimo de dedo de 30 px; si el dedo queda casi igual de cerca de dos objetos (< 7 px de diferencia) **no adivina**: acerca la cámara al punto tocado («lupa») y avisa «tocá de nuevo». Escritorio sin cambios |
| El panel de construir/torre (abajo, 270 px en vertical; centro-abajo en apaisado) podía tapar la plataforma o torre recién tocada | Al elegir algo tapado por el panel o el HUD, la cámara se desliza hasta dejarlo sobre el panel (se permite correr la cámara 4 u. más allá del borde mientras hay selección; vuelve al cerrar) |
| Tutorial en 360 px: los dos botones al costado lo hacían de 8 líneas y tapaba medio mapa | En ≤ 560 px los botones van en una fila debajo del texto |
| Girar el teléfono en plena partida dejaba el encuadre del otro formato (mapa cortado) | En el giro se reencuadra el mapa (sin tocar el estado) y se vuelve a mostrar lo seleccionado |
| Sin respuesta háptica | Vibración corta (8–45 ms) al elegir, construir, mejorar, vender, palanca, cosecha, fuga y acción denegada; sólo con entrada táctil, desactivada con movimiento reducido y con el interruptor «Vibración al tocar» de Controles (nuevo ajuste `settings.haptics`) |
| Feedback de presión | `:active` (escala + brillo) en botones del panel, tutorial, escenarios y pantallas |

Ya estaba bien y se verificó: `touch-action:none` en la superficie del juego (Kit3D), sin `user-scalable=no`; arrastre
vs. toque con umbral de 12 px y 700 ms, dos dedos nunca cuentan como toque; los botones ▶▶ x1 ⟲ ⟳ (64 px) se ocultan con el
panel abierto; calidad «auto» en táctil = media (DPR ≤ 1.5, sin sombras); pausa al ocultar la pestaña y audio reanudado
por gesto (SDK). Ambas orientaciones son jugables: no hace falta aviso de «girá el teléfono».

Arreglo funcional (escritorio y celular): el gólem gastaba su pisotón helado aunque no tuviera ninguna torre a tiro
(enfriamiento de 7 s perdido); ahora reintenta a los 1.5 s. Además la prueba de rivales fallaba ~50 % por azar (primer
pisotón a los 3–7 s, cuando el gólem a veces ya había pasado la torre): ahora reintenta con otro gólem.

Pruebas nuevas (proyecto `mobile`, Pixel 7): matriz de 5 tamaños (menú/ayuda/controles sin superposición con la barra,
botón principal ≥ 56 px visible, todo ≥ 44 px, sin scroll horizontal; partida con toques reales: HUD sin superposición,
panel dentro de pantalla y sin tapar la plataforma elegida, oleada llamada con ▶▶ y enemigos en el mapa); toque preciso
(toque a 20 px del centro elige la plataforma, toque entre dos plataformas activa la lupa, plataforma del tercio inferior
queda sobre el panel, giro a apaisado con el panel abierto); vibración al construir + apagado desde Controles + arrastre que
empieza sobre una plataforma no la elige.

**Resultados reales (2026-10-11, `tests/e2e/bastiones_elementales.spec.js`, 21 pruebas × 2 proyectos):**
- `ML_WORKERS=1`: desktop 17 passed / 4 skipped (las 4 «celular»); mobile (Pixel 7) 18 passed / 3 skipped (IA de rivales,
  sinergias y teclado). Total 35 passed, 7 skipped, 0 failed, 25.5 min.
- `ML_WORKERS=4`: mismo reparto, 35 passed, 7 skipped, 0 failed, 11.7 min.
- La prueba de rivales (escritorio) con `--repeat-each 6`: 6/6 (antes del arreglo fallaba 2 de 4).

Pendiente: en 640×360 (apaisado muy bajo, fuera de la matriz) los botones secundarios del menú requieren desplazar el menú;
no hay prueba en hardware real (rendimiento de GPU, vibración real, notch/barra de inicio reales).

## Gancho de pruebas
`window.__bastiones_elementales` (congelado, sólo lectura): `state, scene, mapIndex, phase, wave, wavesDone, waves,
countdown, gold, crystal, crystalMax, hp, score, kills, runTime, simTime, paused, speed, moves, overlay, selected, panel,
moving, towers, enemies{total,ground,air,byType,list}, bridges, levers, aux, pads, route, routes, boss, missions,
difficulty, quality, perf, camera, camMoving, lastPick, player, tutorial, combos, counts, save, screenOf(kind,i)`.
Con `?debug` agrega `debug`: `simulate, goto, unlockAll, setGold, setCrystal, spawn, startWave, killAll, clearWaves,
spawnBoss, skipCine, bossPhase, bossHp, hurtBoss, hitBoss, hurtEnemy, status, winMap, loseMap, build, upgrade,
upgradeAll, charge, hurtAux, setSpeed, camTo, emit`.

## Pruebas (`tests/e2e/bastiones_elementales.spec.js`)
18 pruebas: carga sin errores (crédito, 3 escenarios, dificultad, fondo 3D); arranque con entrada real + tocar/clic en
una plataforma + construir desde el panel; tutorial (aparece, avanza, se salta, se reactiva desde la pausa y vuelve al menú
de pausa); torres (mejorar ×2 hasta MÁX, prioridad, reubicar tocando otra plataforma, vender 70 %); palanca de puente con
toque real (cambia la ruta del campo de flujo, enfriamiento, no gira con un enemigo sobre el puente, el enemigo sigue la
ruta nueva); cristales auxiliares (cosecha con toque, regeneración, drenaje por enemigos cercanos, pérdida → misión fallida,
restaurar desde el panel); rivales (imp inmune al fuego que salta y ataca un cristal, escudo del caballero vs rayo, gólem
que congela una torre, harpía en línea recta); sinergias reales entre torres; los 3 escenarios encadenados con
«Siguiente» y desbloqueados en el menú; punto de control (recarga → «Continuar» restaura oleada y torres) + misión principal
y secundaria persistentes tras recargar; Titán completo (intro salteable con entrada real, inmunidades por fase,
transición invulnerable, desvío de puentes + bloqueo de palancas + imps, F3 inmune al rayo con pulso que aturde una torre,
recompensa, victoria final y guardado); derrota por fugas reales y reintento limpio; pausa congela 1 s / reanuda /
reiniciar; guardado corrupto y con forma inválida; dificultad (selector + parámetros + vida enemiga); calidad (DPR,
sombras, partículas, luces, decoración, niebla, clima); teclado/gamepad (reasignar tecla en Controles, retícula + Enter,
1-4, U, cruceta en el panel, ⌫, WASD); celular 412×915 y 915×412 (sin superposición ni scroll, con y sin panel abierto,
botones táctiles ocultos con el panel, arrastre, pellizco, giro y botón de oleada por CDP/toques).

**Resultados previos a la pasada móvil (2026-10-10, `ML_WORKERS=1 npx playwright test tests/e2e/bastiones_elementales.spec.js`, 5.2 min):**
- desktop: 17 passed, 1 skipped (la de celular).
- mobile (Pixel 7): 15 passed, 3 skipped (IA de rivales, sinergias y teclado: lógica idéntica o exclusiva de escritorio).
- Total: 32 passed, 4 skipped, 0 failed. Sin errores de consola en ninguna prueba.

## Rendimiento
Chromium headless + SwiftShader (render por CPU), 1280×800, con otras 3 builds corriendo en la máquina: sirve para
comparar, no son FPS reales.

`node tests/perf/measure.mjs` (menú, fondo 3D en órbita): Media → 14.8 fps, peor cuadro 233 ms, heap 8.1 MB, 1084 KB,
22 requests, 0 errores; Baja → 11.9 fps, peor cuadro 200 ms, heap 8.2 MB (la diferencia está dentro del ruido de la
máquina cargada).

En partida (gancho `perf`, promedio de 40 cuadros, 6 torres construidas, oleada 7 en curso):
| Calidad | Escenario | ms/cuadro | draw calls | triángulos | update ms | render CPU ms | heap MB |
|---|---|---|---|---|---|---|---|
| Media | Puente Glacial | 172 | 77 | 23.0k | 0.39 | 3.5 | 9.5 |
| Media | Paso de Lava | 133 | 79 | 21.1k | 0.57 | 2.8 | 9.5 |
| Media | Valle del Trueno | 128 | 96 | 26.9k | 0.80 | 3.7 | 9.5 |
| Baja | Puente Glacial | 184 | 77 | 19.6k | 0.44 | 4.5 | 9.5 |
| Baja | Paso de Lava | 155 | 79 | 18.9k | 0.45 | 5.1 | 9.5 |
| Baja | Valle del Trueno | 144 | 97 | 21.8k | 0.66 | 4.4 | 9.5 |

La simulación cuesta < 1 ms por paso y el armado del render 3–5 ms; el resto es rasterizado por software. Baja reduce
triángulos (decoración al 45 %), sin luces puntuales ni sombras, DPR 1, menos partículas y clima. Sin asignaciones por
cuadro en el bucle (pools e `InstancedMesh` para enemigos, proyectiles, barras, sombras, partículas y decoración).

## Pendiente / NO PROBADO
- **NO PROBADO en dispositivos reales** (celular/tablet ni GPU real): sólo Chromium headless con SwiftShader.
- **NO PROBADO con un gamepad físico**: el mapa se verificó con las teclas equivalentes que sintetiza el SDK.
- Balance: verificado con un jugador automático simple (construye por cobertura de ruta, sin cosechar ni usar palancas):
  gana el Puente Glacial y el Paso de Lava en Normal y llega al Titán en el Valle del Trueno, donde pierde; un jugador que
  cosecha, combina elementos y mejora debería ganarlo, pero falta testeo humano de 15–30 min por escenario.
- Portada `games/thumbs/bastiones_elementales.webp` y entrada en `games/registry.js` / `sw.js`: no se tocaron (archivos
  compartidos); ver el pedido en el informe.
- La densidad de decoración por calidad se aplica al cargar un escenario, no en caliente dentro de la partida.
- Los GLB del paquete no se usan (todo procedural).
