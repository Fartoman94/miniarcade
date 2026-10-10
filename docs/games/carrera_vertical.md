# Carrera Vertical (`carrera_vertical`)

**Género:** parkour urbano 3D contrarreloj · **Motor:** Three.js 0.186.1 (import map, módulos ES) + Kit3D · **Acento:** `#ff7a2f` (naranja «amanecer» sobre azoteas)
**Archivos:** `carrera_vertical.html`, `games/carrera_vertical/*.js` (`main`, `config`, `courses`, `world`, `player`, `physics`, `entities`, `boss`, `models`, `fx`, `sfx`, `ui`), `tests/e2e/carrera_vertical.spec.js`.
**Spec:** `docs/specs/18_carrera-vertical.md`.

## Concepto
Una corredora cruza la ciudad por los techos: corre, salta huecos, se agarra de cornisas, trepa paredes, corre por los
paneles publicitarios, se cuelga de tirolinas y usa paneles de impulso. Cada circuito es una carrera contrarreloj con
puntos de control, relojes que descuentan segundos, rutas alternativas marcadas con grafitis y un **fantasma** que
repite tu mejor carrera (o la anterior). La campaña son **tres distritos** y la final, el **Circuito Maestro**, una
persecución por azoteas contra el **Vigía Mayor**, un dron gigante con tres fases.

Todo el arte es procedimental: fachadas con textura de ventanas generada en canvas (con mapa emisivo para la noche),
geometría estática fusionada por material (4 mallas por circuito), horizonte con `InstancedMesh`, relojes instanciados,
corredor articulado de 7 mallas. Todo el audio se sintetiza con `createAudio().tone` (incluido un pulso musical que
acelera con la tensión). No se usan GLB del paquete (no encajaban con la escala ni la estética).

## Controles
| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Correr (el sprint llega solo si no frenás) | WASD / flechas | joystick izquierdo | stick / cruceta |
| Mirar (la cámara vuelve sola detrás tuyo) | arrastrar el mouse, Q / E | arrastrar el dedo fuera de los controles | LB / RB |
| Saltar (mantener = más alto) · trepar · saltar de pared | Espacio* | SALTO | A |
| Deslizar · rodar al caer · salto largo (saltar deslizando) | Shift* (también C / Ctrl) | DESLIZ | B |
| Acción contextual (colgarse de la tirolina) | F* | ACCIÓN (se ilumina cuando sirve) | X |
| Volver al punto de control | R* | menú de pausa | Y |
| Pausa | Esc / P | ⏸ de la barra | Start |

\* Re-asignables en **Controles y opciones** (menú y pausa), junto con sensibilidad, invertir vertical, cámara automática,
fantasma (mejor / anterior / apagado), música y movimiento reducido (Auto / Reducido / Completo: sin sacudidas, destellos,
inclinación de cámara ni cambio de FOV). Sonido y calidad gráfica: menú del SDK.

## Escenarios (circuitos)
1. **Distrito del Amanecer** (cálido, de día): enseña todo. Conducto para saltar corriendo, hueco con reloj, muro de 3 m
   (cornisa) con **rampa** alternativa, panel de impulso, carrera por pared sobre un hueco de 10 m (si caés, azotea de
   rescate con **plataforma elevadora**), casilla con **puerta automática** (o trepala: atajo «Por arriba del ascensor»),
   barrera láser, primer **dron**, **tirolina** de 44 m, lanzador vertical a la torre de la meta. Atajos: «Cornisa angosta», «Por arriba del ascensor».
2. **Rascacielos de Neón** (noche, ventanas emisivas y letreros): muro de 5 m (trepada) o ascensor, **torreta** con
   coberturas, doble pared sobre el vacío (o techo bajo + lanzador), muro con **puerta de seguridad** (escanea y se traba
   con alarma) y **puerta exprés** (sólo al sprint; queda abierta toda la sesión), tirolina, dos barreras láser, segunda
   torreta, segundo ascensor (o «Trepada de servicio») y carrera por pared final con impulso. Atajos: «Puerta exprés», «Trepada de servicio».
3. **Grúas del Puerto** (atardecer nublado, mar): saltos entre pilas de contenedores (con rampa), ascensor de jaula a la
   **pasarela del brazo de una grúa** con barrera y torreta disparando desde el puente de un carguero, **dos tirolinas**,
   ruta alternativa por la **cubierta del carguero** (lanzador a una torre de contenedores) y **túnel de contenedor** que
   esconde del dron. Atajos: «Cubierta del carguero», «Túnel de contenedor».
4. **Circuito Maestro** (final, puesta de sol): 330 m de azoteas con todo lo anterior mientras te persigue el Vigía Mayor.

Se desbloquean en orden (terminar uno abre el siguiente; el Maestro pide los tres distritos). Nunca hay bloqueo
irreversible: cualquier circuito completado se puede repetir y el desbloqueo se recalcula a partir de lo completado.

## Sistemas
- **Movimiento de precisión asistido**: aceleración rápida (34 m/s²), sprint automático (7.6 → 10.4 m/s tras 0.9 s sin
  frenar), salto con búfer (0.14 s) y tiempo de coyote (según dificultad), salto variable, control aéreo, **cornisa
  asistida** (si llegás corto a un borde dentro del alcance, te agarrás y subís), **salto de obstáculo** automático
  (obstáculos ≤ 1.35 m), **trepada** de pared (+2.7 m) y **cornisa** al final, **carrera por pared** con imán suave hacia
  los paneles con flechas (1.05 s, gravedad reducida) y **salto de pared**, **deslizamiento** (altura 0.85 m, pasa bajo
  barreras y te oculta de los drones), **rodada** (deslizar justo antes de una caída alta; si no, aterrizaje duro que
  frena), **salto largo** (saltar deslizando), **paneles** de impulso (15.5 m/s) y lanzador (17.5 m/s vertical).
- **Combos de movimiento**: encadenar movimientos **distintos** (pared, salto de pared, trepada, cornisa, valla,
  deslizamiento, rodada, tirolina, impulso…) a menos de 2.6 s entre sí; un golpe o caída corta el combo.
- **Cronómetro y fantasmas**: tiempo = carrera + penalizaciones − relojes. Se graban posición/pose a 10 Hz; el mejor
  tiempo y la carrera anterior quedan en el guardado. Parciales en cada punto de control contra tu mejor marca (verde/rojo).
- **Medallas**: oro = tiempo de campeonato, plata = tiempo par, bronce = terminar (multiplicados por la dificultad).
- **Rutas secretas y atajos por habilidad**: 2 por circuito, marcados con grafitis «ATAJO»; quedan registrados.
- **Cámara**: tercera persona detrás del corredor (vuelve sola tras 1.1 s sin tocarla), mira hacia adelante según la
  velocidad, se acerca si un edificio tapa, FOV y líneas de velocidad (salvo movimiento reducido), inclinación leve al
  correr por pared, sombra de contacto y **marca de aterrizaje** (Fácil y Normal).
- **Estado de sesión**: tirolinas descubiertas (lámpara naranja), puertas exprés desbloqueadas y usos de cada elemento
  persisten mientras la página está abierta (también al reiniciar la carrera).

## Interacciones funcionales
| Elemento | Detección | Indicación visual | Animación | Estado de sesión |
|---|---|---|---|---|
| Tirolina | punto del cable más cercano en planta (≤ 1.25 m) y altura de la cabeza; se engancha sola en el aire o con ACCIÓN | cable, postes amarillos, lámpara (blanca → naranja al descubrirla), aviso «Colgarte de la tirolina» y botón ACCIÓN iluminado | manija que viaja con el corredor y vuelve sola | descubierta + usos |
| Plataforma elevadora | colisión: el corredor parado sobre su colisionador | chevrones (amarillo esperando / celeste moviéndose), rieles y luz | sube 3.4 m/s, espera 1.6 s libre y baja | posición, estado y viajes |
| Puerta automática | sensor de proximidad en el eje de paso (+ velocidad en la exprés) | luz verde/ámbar/roja, franja de color en las hojas | hojas corredizas | aperturas; la exprés queda desbloqueada |
| Panel de impulso / lanzador | colisión con los pies sobre el panel | chevrones celestes / amarillos, se apagan al recargar | anillo y chispas | usos + recarga 0.9 s |

## Rivales y desafíos
| Rival | Silueta | Patrón | Contrajuego |
|---|---|---|---|
| Dron de vigilancia | cuerpo octogonal, 4 rotores, ojo; cono de luz y círculo en el piso | patrulla en bucle o ida y vuelta, barre el foco a los costados; llena un medidor si estás dentro (con línea de visión) y dispara la alarma: +s y puertas de seguridad trabadas 3 s | salir del círculo, **deslizarse** (perfil bajo), cubrirse (túnel), pasar rápido |
| Barrera móvil | postes a franjas amarillas y negras con un láser rojo pulsante | sube y baja, o barre hacia adelante y atrás a 1.1 m | deslizarse por debajo o saltarla según la altura; si toca: aturdido y frenado |
| Torreta no letal | trípode con cabeza blanca y franja naranja | te sigue, mira con un láser amarillo → rojo (parpadea al final) y dispara un pulso con anticipación | cortar la línea de visión, deslizarse (el pulso pasa por arriba), seguir moviéndose; si pega: aturdido y más lento 1.2 s |

## Gran evento: Circuito Maestro contra el Vigía Mayor
Intro cinemática (salteable con salto/toque; corta con movimiento reducido): el dron gigante sube detrás del edificio de
largada. Barra de **distancia** y **capturas** en el HUD.
- **Fase 1 · La caza** (largada → punto de control 1): te persigue por detrás (nunca a más de 34 m) y lanza **barridos
  láser**: una línea roja parpadea en el piso adelante tuyo (aviso según dificultad) y dispara un muro de luz bajo:
  **saltalo** o no llegues todavía. Si te toca: aturdido y el dron se acerca 6 m.
- **Fase 2 · Bloqueo** (PC1 → PC2): se adelanta y siembra **minas de pulso** marcadas con un círculo que se llena; al
  explotar empujan y aturden. Hay que leer el piso y esquivar.
- **Fase 3 · Sobrecarga** (PC2 → meta): vuelve atrás y persigue 15 % más rápido, con barridos más seguidos y alguna mina.
- **Captura**: si te alcanza, volvés al último punto de control con penalización. Con todas las capturas de la
  dificultad → derrota. **Escape** = llegar a la meta del campeonato: el dron se sobrecarga y cae.
- **Recompensa**: misión principal «Escapá del dron jefe», +2500 puntos, y si además fue con tiempo de campeonato:
  título **Campeón Vertical** en el menú y **buzo dorado** permanente para el corredor.

## Misiones (MLMissions, 3 principales + 2 secundarias por partida)
| Tipo | Misión | Evento | Meta |
|---|---|---|---|
| Principal 1 | Completá los tres circuitos | `circuit` | 3 |
| Principal 2 | Batí un tiempo de campeonato (oro en cualquier circuito) | `champTime` | 1 |
| Principal 3 | Escapá del dron jefe | `escape` | 1 |
| Secundaria | Juntá cinco relojes (cada circuito tiene 6) | `clock` | 5 |
| Secundaria | Combo de movimiento ×4 | `combo` (máx.) | 4 |
| Secundaria | Cruzá un sector sin caer | `cleanSector` | 1 |
| Secundaria | Usá dos rutas alternativas | `altRoute` | 2 |
| Secundaria | Ganale a tu fantasma | `beatGhost` | 1 |
| Secundaria | Circuito sin alertas (falla con `alarm`) | `stealthFinish` | 1 |

Al empezar cada partida se re-emite el progreso de campaña (circuitos completados, oros, escape), así las metas
acumulativas no se pierden entre sesiones.

## Condiciones de partida
- **Derrota**: caer vuelve al punto de control con penalización (+s); la partida se pierde si el tiempo supera el
  **límite** del circuito o, en el Maestro, si el Vigía te atrapa tantas veces como permite la dificultad.
- **Victoria**: llegar a la meta (pantalla «¡META!» con tiempo, medalla, récord y desbloqueo); la victoria final es la
  meta del campeonato (pantalla «¡ESCAPASTE!» / «¡CAMPEÓN VERTICAL!»).
- Reinicio limpio desde la pausa (SDK) o con «Reintentar»; volver al punto de control con R / pausa.

## Dificultad
| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Penalización por caída / captura | +3 s | +5 s | +7 s | +10 s |
| Penalización por alarma | +1 s | +2 s | +3 s | +4 s |
| Tiempo para que un dron te detecte | 0.85 s | 0.5 s | 0.36 s | 0.26 s |
| Aviso de torreta (y del barrido del jefe) | 1.5 s | 1.1 s | 0.85 s | 0.65 s |
| Velocidad de barreras / drones | ×0.75 / ×0.8 | ×1 / ×1 | ×1.2 / ×1.2 | ×1.4 / ×1.35 |
| Velocidad del Vigía (m/s) | 6.6 | 7.6 | 8.4 | 9.0 |
| Capturas permitidas | 4 | 3 | 2 | 1 |
| Límite de tiempo | ×1.6 | ×1.3 | ×1.12 | ×1.0 |
| Tiempos de oro / plata | ×1.15 | ×1 | ×0.95 | ×0.9 |
| Alcance de cornisa | 2.5 m | 2.3 m | 2.1 m | 1.9 m |
| Tiempo de coyote | 0.16 s | 0.12 s | 0.1 s | 0.08 s |
| Marca de aterrizaje | sí | sí | no | no |

Tiempos base (oro / plata / límite): Amanecer 30 / 40 / 100 s · Neón 38 / 50 / 120 s · Puerto 37 / 50 / 120 s · Maestro
44 / 58 / 130 s. Calibrados con el piloto automático de depuración, que recorre cada circuito sin errores en ~19, ~25,
~24 y ~28 s (rutas óptimas, sin relojes extra).

## Calidad
| | Baja | Media | Alta |
|---|---|---|---|
| DPR máx. (Kit3D) | 1 | 1.5 | 2 |
| Sombras | no | no | sí (PCF 1024, sigue al corredor) |
| Partículas (tope) | 90 | 240 | 420 |
| Edificios del horizonte (instancias) | 70 | 170 | 320 |
| Plano lejano / niebla | 170 m / ×0.55 | 270 m / ×0.8 | 380 m / ×1 |
| Halos de neón | no | sí | sí |
| Estrellas (Neón) | 0 | 220 | 500 |
| Ventanas iluminadas | ×0.45 | ×1 | ×1 |
| Estelas de viento | no | sí | sí |

## Guardado (`carrera_vertical:save`, versión 1, `createSave`)
`{ unlocked, done{circuito}, best{circuito:s}, splits{circuito:[s]}, medals{circuito:0-3}, ghosts{circuito:{t,d[]}},
lastGhost{…}, clocks{circuito:[id]}, routes{circuito:[id]}, champion, escaped, wins, runs, last,
tutorial{off,seen{}}, opts{sens,invert,motion,ghost,music,autocam,binds{jump,slide,action,respawn}} }`.
Los fantasmas son enteros (posición ×10, rumbo ×100, pose) a 10 Hz. JSON corrupto → se descarta (copia en
`carrera_vertical:save:corrupto`) y se arranca de cero; forma inválida → `sanitize()` repara campo por campo (récords
no numéricos, fantasmas con datos no numéricos, teclas inválidas, circuito desconocido) y recalcula el desbloqueo a
partir de lo completado. Logros y dificultad: claves compartidas `ml:missions` / `ml:difficulty`; récord: `ml:scores`.

## Gancho de pruebas
`window.__carrera_vertical` (sólo lectura): `state, scene, course, missions, player, hp (capturas restantes en el jefe),
score, time, clock, pen, bonus, simTime, paused, run, tip, prompt, camYaw, counts, interactions, enemies, boss,
ghostVisible, perf, quality, difficulty, save, session`. Con `?debug` agrega `debug`: `goto, simulate, trace, teleport,
place, setVel, setMode, setTime, reachCp, finish, unlockAll, complete, bossPhase, bossCapture, bossSweepNow, alarm, hit,
fall, combo, clocksAll, autopilot, stopLoop`. `autopilot(ruta)` sigue puntos de paso con acciones (saltar, deslizar,
acción, esperar) usando la física real: con él se verificó que los cuatro circuitos se pueden completar.

## Pruebas (`tests/e2e/carrera_vertical.spec.js`)
19 pruebas. Las de jugabilidad detienen el bucle real (`debug.stopLoop()`) y avanzan con pasos fijos (`simulate`/`trace`)
mientras las teclas o toques reales siguen apretados: no dependen de cuadros reales ni del reloj (CI con 2 núcleos).
Quedan con bucle real sólo las de controles (arranque desde el menú, tutorial, pausa, celular).
Cobertura: carga sin errores; arranque con Enter/toque + cuenta regresiva + correr/saltar (teclado y joystick por CDP);
tutorial (aparece, se salta, se reactiva desde la pausa); parkour con teclas reales (valla, cornisa, carrera por pared
sobre el hueco, deslizamiento, aterrizaje duro vs. rodada, trepada de 5 m); paneles de impulso y lanzador (recarga);
tirolina (ACCIÓN/F real, viaje, soltarse saltando, manija que vuelve, estado de sesión); plataforma elevadora (sube, espera,
baja); puertas (proximidad, exprés al sprint que persiste tras reiniciar, seguridad trabada por alarma); rivales (dron
detecta y suma tiempo, deslizarse lo evita, barrera aturde, torreta apunta y dispara); los 4 escenarios desde el menú y
paso «meta → siguiente circuito»; misión principal (3 circuitos) + secundarias (relojes, combo ×4) persistentes tras
recargar; fantasma grabado y reproducido; Vigía Mayor (intro, barrido con golpe, fase 2 con minas, captura, fase 3,
escape, recompensa y puntaje); derrotas (tiempo agotado, capturas) con reintento y victoria; pausa congela 1 s / reanuda /
reiniciar; guardado corrupto y con forma inválida; dificultad; calidad; celular 412×915 y 915×412 sin superposición ni
scroll + botones táctiles (dos dedos: joystick + DESLIZ).

**Resultados reales (2026-10-10, máquina compartida con load average ~40):**
- `ML_WORKERS=1`, ambos proyectos: **30 passed, 8 skipped, 0 failed** (13.8 min). desktop: 18 passed, 1 skipped (la de
  celular); mobile (Pixel 7): 12 passed, 7 skipped (parkour por teclado, ascensor, puertas, IA de rivales, recorrido de
  escenarios, misiones y fantasma: lógica idéntica, cubiertas en escritorio).
- `ML_WORKERS=4`, ambos proyectos: **30 passed, 8 skipped, 0 failed** (15.6 min).
- Además, el piloto automático (`debug.autopilot`) completó los 4 circuitos con la física real.
- Bug real encontrado por las pruebas y corregido: al saltar de una tirolina el corredor se volvía a enganchar al mismo cable (ahora hay 0.7 s de gracia).

## Rendimiento (Chromium headless + SwiftShader, 1280×800, máquina con load average ~40: sirve para comparar, no son FPS reales)
`node tests/perf/measure.mjs` (menú): Media → 1.9 fps, peor cuadro 1150 ms, heap 8.0 MB, 1071 KB, 23 requests, 0 errores;
Baja → 3.6 fps, peor cuadro 1100 ms, heap 7.4 MB. (Con la máquina menos cargada, al principio de la sesión, el menú corría a ~21 fps.)

En partida (gancho `perf`, promedio de 40 cuadros con el bucle real):
| Calidad | Circuito | ms/cuadro | draw calls | triángulos | update ms | render CPU ms | heap MB |
|---|---|---|---|---|---|---|---|
| Media | Amanecer | 226.7 | 54 | 8.8k | 1.29 | 2.08 | 10.1 |
| Media | Neón | 212.5 | 74 | 9.9k | 0.82 | 3.48 | 10.1 |
| Media | Puerto | 202.5 | 52 | 16.5k | 0.72 | 2.96 | 10.1 |
| Media | Maestro (jefe) | 210.4 | 45 | 9.3k | 0.91 | 1.67 | 10.1 |
| Baja | Amanecer | 209.2 | 40 | 6.9k | 0.74 | 1.57 | 10.1 |
| Baja | Neón | 217.9 | 51 | 8.0k | 0.69 | 1.19 | 10.1 |
| Baja | Puerto | 214.6 | 38 | 14.9k | 0.61 | 2.20 | 10.1 |
| Baja | Maestro (jefe) | 215.4 | 32 | 7.7k | 0.85 | 1.91 | 10.1 |

La CPU del juego (simulación + armado del render) es ~1–3 ms por cuadro; el resto es rasterizado por software bajo una
carga extrema (el tope de 250 ms por cuadro del Kit3D se alcanzaba). Degradación para hardware inferior: Baja quita
sombras, halos, estelas de viento y estrellas, baja DPR a 1, recorta el horizonte (320 → 70 edificios), partículas
(420 → 90) y el plano lejano (380 → 170 m).

## Pendiente / NO PROBADO
- NO PROBADO en dispositivos reales (sólo Chromium headless con SwiftShader en una máquina compartida y cargada).
- NO PROBADO con un gamepad físico (el SDK ignora mandos bajo webdriver); el mapa se revisó por lectura de código.
- La sensación de control se ajustó con el piloto automático y capturas, no con jugadores reales: los tiempos de oro
  pueden necesitar retoque tras pruebas con personas.
- Sin portada `games/thumbs/carrera_vertical.webp` ni entrada en `games/registry.js` (fuera de los archivos permitidos).
