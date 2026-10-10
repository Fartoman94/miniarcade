# Portales Imposibles (`portales_imposibles`)

**Género:** puzles de portales 3D en primera persona · **Motor:** Three.js 0.186.1 (import map, módulos ES) + Kit3D · **Acento:** `#9b7bff` (violeta; portales azul `#35b6ff` y naranja `#ff8a24`)
**Archivos:** `portales_imposibles.html`, `games/portales_imposibles/*.js` (`main`, `config`, `portalmath`, `portals`, `physics`, `level`, `levels`, `boss`, `models`, `fx`, `sfx`, `ui`), `tests/e2e/portales_imposibles.spec.js`.

## Concepto
Un sujeto de prueba con una pistola de portales recorre un complejo de cámaras de ensayo. Dos portales de par definido
(azul/naranja) conectan superficies blancas: lo que entra por uno sale por el otro **con la misma velocidad y la mirada
girada de forma consistente**. Con eso se cruzan abismos, se lanzan cuerpos (la altura se convierte en velocidad), se
llevan cubos, se desvían láseres hacia paneles de energía y, al final, se desarma el **Núcleo Fractal** en tres fases con
**portales móviles** (paneles que se desplazan llevando el portal encima).

Todo el arte es procedimental: cajas fusionadas por material con UV en espacio de mundo y texturas de canvas (paneles
blancos, metal remachado, rejilla, franjas de peligro, ácido), modelos low-poly fusionados con color por vértice
(pistola, cubos, torretas, esferas, generador, Núcleo), `InstancedMesh` para partículas. Audio 100 % sintetizado con
`createAudio().tone`. No se usan los GLB del paquete (no encajaban con la estética de laboratorio).

**Primera persona (decisión):** la spec admite primera o tercera persona; los portales se leen mucho mejor en primera
persona (ves a través del portal lo mismo que verás al cruzar). A través de los portales sí se ve el cuerpo del sujeto.

## Controles
| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Moverse | WASD | joystick izquierdo | stick / cruceta |
| Mirar | mouse (clic en la pantalla para capturarlo), flechas, o arrastrar sin captura | arrastrar el dedo fuera de los controles | LB/RB girar, LT/RT mirar abajo/arriba |
| Portal azul | clic izquierdo / Q* | botón AZUL, o **tocar un punto** de la pantalla | X |
| Portal naranja | clic derecho / F* | botón NARANJA, o tocar un punto | Y |
| Usar / agarrar / soltar / empujar torreta | E* | botón USAR (se ilumina si hay algo) | B |
| Saltar | Espacio* | botón SALTO | A |
| Pista por etapas | H* o 💡 del HUD | 💡 del HUD | Select |
| Reiniciar sala | R* o ↺ del HUD | ↺ del HUD | — (menú de pausa) |
| Pausa | Esc / P (soltar el mouse capturado también pausa) | ⏸ de la barra | Start |

\* Re-asignables en **Controles** (menú y pausa), con sensibilidad, campo de visión (60–95°), invertir mirada vertical y
movimiento reducido (Auto/Reducido/Completo: sin sacudidas, balanceo de cámara ni destellos). El mapa del gamepad se
muestra en «Cómo jugar» y en Controles (el mapeo del gamepad es fijo; el del teclado es configurable).
**Tocar para disparar (spec «mirar y tocar punto de destino»):** un toque corto dispara hacia el punto tocado el portal
que falta; si están los dos, el más viejo. Arrastrar mira.

## Escenarios (3) y salas (7)
1. **Laboratorio Azul** — paneles blancos y metal azul.
   - *1-1 Primer Paso:* el borde de salida está a 4 m: portal bajo + portal alto sobre el borde. Cristal en un nicho alto.
   - *1-2 Peso Muerto:* el pedestal suelta un cubo dentro de una jaula de rejilla; los disparos atraviesan la rejilla. Entrar
     y salir con el cubo por portales y ponerlo sobre el botón rojo. Cristal en un balcón alto.
   - *1-3 Salto de Fe:* foso de 10 m, pileta de ácido y torreta en la salida. Portal en el piso del foso y otro en la pared de
     entrada, detrás del jugador: se tira, cae y sale lanzado ~20 m por encima del ácido. Campo de gravedad de rescate
     si se cae sin plan. Compuerta **temporizada** hacia la bóveda del cristal (pedestal de cada lado, nunca te encierra).
2. **Salas de Gravedad** — violeta industrial, campos de gravedad.
   - *2-1 Ascensor Gravitatorio:* el láser debe entrar por un portal y salir hacia el **panel de energía** del frente de la
     galería; eso enciende el campo de gravedad, que sube al sujeto y al cubo hasta el botón de la galería. Esfera supervisora.
   - *2-2 Sala del Generador* (gravedad ×0,55): dos paneles a la vez — el bajo con el **cubo prisma** (desvía el láser hacia
     donde apunta) y el del techo del generador con el otro láser bajando por un portal de techo. Palanca → generador
     restaurado. Dos esferas supervisoras.
3. **Núcleo Prismático** — oscuro, acentos rosa/violeta.
   - *3-1 Antesala Prismática:* abismo sin piso; el único blanco del otro lado es un **panel móvil**. Torreta y esfera. Un
     láser por portales abre la vitrina del cristal.
   - *3-B Núcleo Fractal:* arena del gran evento (ver abajo).
Los escenarios se encadenan con **elevadores**; cada sala resuelta deja su salida abierta para siempre. Entre salas hay
**rejillas emancipadoras** que borran los portales y desintegran cubos.

## Sistemas
- **Portales de par definido** (`portals.js`): disparo por raycast; sólo pegan en paneles **blancos**; el metal, el vidrio
  y lo tapado (repisas, pedestales, puertas) se rechazan con aviso. El portal se encaja dentro de la cara (se corre hasta
  entrar o falla si no entra), se separa del otro si se superponen, y en pisos/techos se orienta según la dirección del
  disparo. Sobre paneles móviles, el portal viaja con su anfitrión.
- **Teletransporte** (`portalmath.js`, puro y testeado): marcos ortonormales (p, r, u, n); `x' = F_B · diag(−1,1,−1) · F_A⁻¹ · x`.
  Posición, velocidad y mirada (yaw/pitch) se transforman con la misma matriz; la rapidez se conserva exacta
  (error < 1e−9 en 200 marcos al azar). Al salir se acomoda el cuerpo dentro de la abertura y delante del plano; si sale
  por un portal de piso casi sin velocidad recibe 1,5 m/s para no volver a caer. Para cruzar, las cajas enteramente detrás
  del portal (dentro de un «túnel» de 1,2 m) se ignoran mientras el cuerpo está alineado con la abertura, con un «imán»
  suave que lo centra.
- **Física** (`physics.js`): AABB por ejes con subpasos (nada atraviesa paredes a 30 m/s), escalones bajos, control aéreo
  que **nunca frena un lanzamiento**, búfer de salto y coyote. Cubos con gravedad de sala, fricción, cruce de portales,
  ácido/rejillas/vacío → se desintegran y reaparecen (o vuelven al dispensador).
- **Cubos en la mano**: se mantienen delante de la mira sin atravesar paredes; cruzan portales antes o después del sujeto
  (se sigue el lado con una transformación pendiente). El prisma queda apuntando hacia donde mirás.
- **Láseres**: trazado con hasta 7 tramos que atraviesa portales, se redirige con prismas, energiza paneles, tumba
  torretas, aturde esferas que roza y quema al sujeto (1 de daño cada 0,45 s y empuje).
- **Pistas por etapas**: 3 por sala (la 3.ª muestra marcas fantasma azul/naranja donde va cada portal). Pedir una pista
  impide la secundaria «sin pistas» en esa sala.
- **Modo contrarreloj**: desde el menú, cualquier sala ya resuelta (salvo la arena) con tiempo objetivo y mejor tiempo.
- **Vida y respaldos**: vida que se regenera; morir o caer **restablece la sala** (cubos, torretas, esferas, compuertas) y
  gasta un respaldo 🧬. Sin respaldos → derrota (el progreso queda). ↺ reinicia la sala sin costo: nunca hay bloqueo.

## Interacciones (cada una con prueba propia)
| Interacción | Detección | Indicación visual | Animación | Estado de sesión |
|---|---|---|---|---|
| Paneles de energía | raycast del láser | lente roja → rosa brillante, sonido | el campo/generador se enciende | el generador queda latcheado y guardado; la vitrina de 3-1 queda abierta en la sesión |
| Interruptores (pedestales) | mira + proximidad (cono) | perilla azul/verde/roja (sin energía), prompt | perilla y puertas | pedestales «una vez» recordados en la sesión (p. ej. cubo dispensado) |
| Botones de piso | colisión (peso de cubo o sujeto) | tapa roja → verde | la tapa se hunde | — (dependen del peso) |
| Cubos | raycast/cono para agarrar; colisión física | prompt, partículas al cruzar | caída, giro del prisma | dispensados = presentes al volver al escenario |
| Puertas temporizadas | interruptor + colisión (no aplastan) | 6 luces que se apagan, tic-tac que se acelera | hojas corredizas | el timer sigue aunque cambies de sala |

## Rivales
- **Torretas de seguridad** (silueta: cápsula blanca con ojo rojo y tres patas): cono de visión de ~42°, 15 m, con línea de
  visión. **Aviso:** puntero rojo y ojo naranja durante `turretAim` s; después ráfagas cada `turretRate` s.
  **Contrajuego único:** se tumban con un cubo que les pega (>2,2 m/s), con el láser, con un **portal bajo sus patas**
  (caen por el portal) o **empujándolas por la espalda** (E). Cubos y paredes cortan su visión.
- **Esferas supervisoras** (esfera con anillo, ojo y cono de luz): patrullan y proyectan un **foco** en el piso. Si te
  quedás en el foco, escanean (el foco pulsa amarillo→naranja→rojo, `sphereScan` s) y emiten un **pulso que borra tus
  portales** (en Difícil/Extremo también daña). **Contrajuego:** salir del foco o cortar la visión, **un cubo suelto en
  su foco la distrae** 4 s, y **un láser que pasa rozándola la aturde** 8 s.

## Núcleo Fractal (gran evento, 3 fases)
- **Intro:** cinemática salteable (cámara orbitando mientras el Núcleo se ensambla), la compuerta se cierra.
- **Fase 1 · Escudo prismático:** tres pilares sostienen el escudo; cada uno necesita `nodeTime` s de láser. El láser pega
  en el panel fijo del fondo; sacándolo por un **panel móvil** (oeste, este o norte), éste se frena frente a cada pilar.
  **Ataque telegrafiado:** anillo rojo bajo tus pies durante `shardWarn` s y luego cae una esquirla.
- **Fase 2 · Sobrecarga (cambio de reglas):** el Núcleo baja al pozo y abre su corona; el piso se **electrifica por
  sectores** (aviso naranja 1,6 s → descarga 2,6 s). Hay que dejar caer **3 cubos de carga** (pedestal dispensador) por un
  portal en el piso blanco cuyo par está en el **techo móvil**; un haz violeta avisa cuando el techo está sobre el Núcleo.
- **Fase 3 · Colapso:** se abre el **portal de salida** en la plataforma alta (noroeste); sube el ácido fractal
  (`acidRise` m/s) y cada `pulseEvery` s un pulso telegrafiado (brillo + tono ascendente 1,2 s) **borra tus portales**.
  Cruzar el portal de salida = **victoria**. Morir reinicia sólo la fase en curso.
- **Recompensa:** pantalla «¡LIBRE!», 5000 puntos + respaldos + cristales, y la **pistola dorada** (cosmética, guardada).

## Misiones (MLMissions, `primaryPerRun: 3`, `secondaryPerRun: 2`)
| Id | Tipo | Misión | Evento | Meta |
|---|---|---|---|---|
| `salas` | principal | Resolvé las tres salas iniciales | `labRoom` | 3 |
| `generador` | principal | Restaurá el generador | `generator` | 1 |
| `salida` | principal | Salí del Núcleo Fractal | `escape` | 1 |
| `dosportales` | secundaria | Sala con dos portales (sólo 2 disparos válidos en la sala) | `twoPortals` | 1 |
| `cristales` | secundaria | Obtené todos los cristales (modo `max`) | `crystal` | 6 |
| `sinpistas` | secundaria | Dos salas sin pistas | `noHintRoom` | 2 |
| `tiempo` | secundaria | Sala en tiempo objetivo (vale en Contrarreloj) | `parRoom` | 1 |
| `torretas` | secundaria | Tumbá tres torretas | `turretDown` | 3 |
Al empezar cada partida se re-emite el progreso guardado (salas, generador, salida, cristales).

## Dificultad (tabla real, `config.js › DIFF`)
| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Respaldos | 9 | 6 | 4 | 2 |
| Vida ♥ | 4 | 3 | 3 | 2 |
| Torretas: aviso antes de disparar | 1,5 s | 1,0 s | 0,7 s | 0,5 s |
| Torretas: cadencia / daño | 0,75 s / 1 | 0,55 s / 1 | 0,45 s / 1 | 0,35 s / 2 |
| Esferas: escaneo / radio del foco | 2,4 s / 1,9 m | 1,6 s / 2,2 m | 1,1 s / 2,5 m | 0,8 s / 2,8 m |
| Compuertas temporizadas | ×1,5 | ×1 | ×0,8 | ×0,65 |
| Tiempo objetivo | ×1,4 | ×1 | ×0,85 | ×0,75 |
| Núcleo: esquirla cada / aviso | 4,4 / 1,7 s | 3,4 / 1,3 s | 2,7 / 1,05 s | 2,2 / 0,85 s |
| Núcleo: láser por pilar | 0,8 s | 1,2 s | 1,6 s | 2,0 s |
| Núcleo: pulso cada / ácido | 7,5 s / 0,10 m/s | 6 s / 0,14 | 5 s / 0,18 | 4,2 s / 0,22 |
| Pulso de esfera daña | no | no | sí | sí |

## Calidad (`QUAL` + Kit3D)
| | Baja | Media | Alta |
|---|---|---|---|
| Vista a través del portal | membrana animada (shader) | render target ×0,5 | render target ×0,85, HalfFloat |
| Pasadas extra por portal visible | 0 | +1 escena | +1 escena |
| DPR máx. (Kit3D) | 1 | 1,5 | 2 |
| Sombras | no | no | sí (mapa 1024, se actualiza 1 vez por cuadro aunque haya pasadas de portal) |
| Niebla (cerca/lejos) · plano lejano | 14/46 · 70 m | 22/75 · 110 m | 30/120 · 160 m |
| Luces puntuales activas | 1 | 3 | 5 |
| Partículas (tope) | 50 | 160 | 320 |

**Decisión de render de portales:** render targets con cámara virtual (`M(A→B) · cámara`) y **plano cercano oblicuo**
en el portal de salida (Lengyel, como `Reflector.js`); la superficie muestrea el RT con coordenadas de pantalla y se
tonemapea igual que la escena. Sólo se renderiza un portal si está enlazado, de frente y dentro del frustum. Recursión:
dentro de la vista de un portal ese mismo portal es membrana (sin bucle de realimentación) y el otro muestra su vista del
cuadro anterior. Costo medido (1-1 con los dos portales a la vista): **64 draw calls en baja → 167 en media → 172 en alta**
(2 pasadas extra). En baja la membrana mantiene la lectura (color, borde, giro) sin costo extra.

## Guardado (`portales_imposibles:save`, versión 1, `createSave`)
`{ scen, room, solved{sala:true}, best{sala:segundos}, crystals[], generator, bossDone, started, wins, goldGun, bestRun,
tutorial{off, seen{}}, opts{sens, invert, motion, fov, binds{jump,use,portalA,portalB,hint,reset}} }`.
JSON inválido → se descarta (copia en `portales_imposibles:save:corrupto`) y se empieza limpio. Forma inválida → `sanitize()`
repara campo por campo (escenario/sala inexistentes, salas/mejores tiempos/cristales desconocidos, opciones fuera de rango,
teclas vacías). La sala actual es el punto de control. Récord con `MLArcade.scores`; misiones en `ml:missions`.

## Gancho de pruebas
`window.__portales_imposibles` (congelado): `state, scene, scen, room, mode, missions, player, hp, maxHp, lives, score,
runTime, simTime, paused, portals, held, tip, prompt, hints, tt, counts, perf (+rtPasses, heapMB), quality, difficulty,
boss, puzzle, save` y `math` (funciones puras de teletransporte). Con `?debug`: `goto, simulate, teleport, look, setVel,
shootFrom` (dispara por el mismo código que la pistola)`, fireAt, clearPortals, solveRoom, setHP, setLives, hurt, give,
grab, drop, cubeTo, use, knock, stun, setGenerator, spawnBoss, skipCut, bossPhase, breakNodes, bossHit, escape,
resetRoom, hint, tip, beams`. `?nolock` desactiva la captura del mouse (clic = disparo directo).

## Pruebas (`tests/e2e/portales_imposibles.spec.js`)
23 pruebas × 2 proyectos (escritorio 1280×800 y Pixel 7). La entrada es real (teclas, botones táctiles, joystick por
CDP, toques) y los tramos largos usan `simulate()` con pasos fijos. Casi todas fijan calidad baja para no saturar CPU.
Cubren: carga sin errores; matemática de teletransporte (unitarias por `page.evaluate`: punto, espejo lateral,
velocidad, lanzamiento piso→pared, ida y vuelta, rapidez en 200 marcos al azar, matriz, mirada); arranque, movimiento,
mirada y salto; tutorial (aparece, se salta, se reactiva desde la ayuda de la pausa); disparo con superficie inválida y
cruce que conserva la orientación; lanzamiento de Salto de Fe; cubos + botón + persistencia de sesión; puertas
temporizadas (y que no aplastan); paneles de energía + campo de gravedad; prisma + techo + generador (persistente tras
recargar); sala resuelta con secundaria y cristal persistentes; pistas por etapas y reinicio de sala; torretas (aviso,
disparo, portal bajo sus patas, empujón); esferas (escaneo, pulso que borra portales, señuelo, láser que aturde); los
tres escenarios y sus elevadores; Núcleo Fractal (intro, 3 fases, victoria y misión); derrota y reintento; pausa que
congela 1 s y reinicio; guardado corrupto; dificultad; calidad (render targets); contrarreloj; celular sin
superposiciones ni scroll (412×915 y 915×412) y tocar-para-disparar.

**Resultados reales (esta máquina):**
- `ML_WORKERS=1`: **44 passed, 2 skipped** (escritorio 22 ✓ + 1 omitida «sólo celular»; celular 22 ✓ + 1 omitida «matemática pura»), 3,3 min.
- `ML_WORKERS=4` (simula el runner lento de CI): **44 passed, 2 skipped**, 2,8 min.

## Rendimiento (Chromium headless + SwiftShader, 1280×800; sirve para comparar, no son FPS reales)
`node tests/perf/measure.mjs portales portales_imposibles` (menú): auto(alta) **13,9 fps**, peor cuadro 350 ms, DCL 336 ms,
load 795 ms, heap 9,4 MB, 24 requests, 1110 KB, 146 nodos DOM, 0 errores. Con `ML_QUALITY=low`: 18,6 fps, heap 7,9 MB;
`medium`: 16,3 fps, heap 7,5 MB.

En partida (gancho `perf`, promedio de 3 s):
| Escena | Baja: calls / tris / fps | Media: calls / tris / RT / fps | Alta: calls / tris / fps |
|---|---|---|---|
| 1-1 con los dos portales a la vista | 64 / 5,3k / 8,7 | 167 / 13,7k / 2 / 6,3 | 172 / 15,0k / 3,2 |
| 2-2 generador | 49 / 4,2k / 13,8 | 49 / 4,2k / 0 / 7,7 | 57 / 5,3k / 4,3 |
| 3-B jefe (fase 1) | 37 / 2,3k / 7,0 | 36 / 2,3k / 0 / 6,5 | 45 / 3,8k / 5,0 |
Heap en partida: 10–16 MB. `updateMs` de la simulación ≤ 1,5 ms por cuadro (CPU), sin asignaciones por paso en los
sistemas calientes (raycasts, láseres, partículas, matrices de portal). Degradación para hardware inferior: la calidad
baja quita los render targets (la pasada más cara), sombras y luces extra.

## Pendiente / NO PROBADO
- **Miniatura** `games/thumbs/portales_imposibles.webp`: no la creé (fuera de mis archivos permitidos); generarla con `tools/make-thumbs.mjs`.
- **Registro** en `games/registry.js`: pendiente (entrada propuesta en el reporte).
- **NO PROBADO en hardware real**: FPS en celulares/GPU reales; captura del mouse (Pointer Lock) en navegadores reales
  (en headless se prueba con teclas, botones y `?nolock`); gamepad físico (el SDK lo ignora bajo webdriver).
- Recursión de portales de un solo nivel (el portal dentro del portal muestra el cuadro anterior); no hay portales a
  través de portales para los disparos.
- La captura del mouse se pide con el primer clic de la partida: ese clic no dispara.
