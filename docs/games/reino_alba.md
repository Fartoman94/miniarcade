# Reino del Alba (`reino_alba`)

Modo de exploración de **¡SALVA AL REY!** implementado según `docs/specs/REINO_EXPLORABLE.md`. Página propia `reino_alba.html`
(Three.js 0.186.1 por import map + Kit3D), código en `games/reino_alba/`. Se llega desde el menú de modos de
`Salva_al_rey.html` (tercer botón «🏰 Explorar el Reino del Alba», enlace a `reino_alba.html`); el menú del reino tiene
«⟵ Volver a ¡Salva al Rey!».

## Concepto
Aventura de exploración en tercera persona: cuatro zonas que se cargan de a una, ocho interiores reales con puertas de
bisagra, doce vecinos con agenda diaria y diálogos que reaccionan al progreso, tres misiones principales encadenadas,
seis secundarias, cofres persistentes, un minijefe y dos jefes con fases. Todo se guarda solo.

## Controles
| | PC | Táctil | Gamepad |
|---|---|---|---|
| Mover | WASD / flechas | joystick izquierdo | stick / cruceta |
| Interactuar (hablar, puertas, cofres, objetos) | E / Enter | botón USAR o tocar el aviso de abajo | A |
| Atacar | Espacio / J / clic | ⚔ | X |
| Rodar (invulnerable) | Shift / K | ⤳ | B |
| Poción | F | 🧪 | Y |
| Cámara | arrastrar mouse, Q/R | arrastrar el dedo | LB / RB |
| Diario de misiones | L / Tab / 📜 | 📜 | Select |
| Pausa | Esc / P | ⏸ | Start |

Interacción: rayo frontal de **2,4 u** con filtro de interactuables y línea de visión; si nada queda en el rayo, cono de
proximidad (útil en táctil) y, muy cerca, cualquier dirección. Un anillo marca el objetivo y el aviso inferior es tocable.

## Escenarios (cargados por zona; interiores como sub-escenas separadas)
- **Aldea del Puente**: plaza con pozo y mercado, herrería, taberna, casa de la curandera, biblioteca (con interior), cinco
  casas decorativas, huerta, molino, río con puente y la Puerta del Puente.
- **Castillo del Alba**: murallas, portón, patio con fuente y jardín de la reina, sala del trono, torre (cerrada con llave),
  mazmorra (trabada hasta la principal C), cocina y cuerpo de guardia decorativos.
- **Bosque de las Runas**: senderos, claro con altar, tres tótems, santuario en ruinas y la **cueva** (interior) con
  mineral, sombras y el gólem de cristal (minijefe). Al restaurar el altar el bosque se recarga sanado (luz, árboles, sin sombras).
- **Campos Dorados**: trigo instanciado, corral con ovejas y vacas, establo, río con el **puente viejo** levadizo y la ruta
  de comercio en la otra orilla.

Interiores con puerta real (closed → opening → open, pivote en la bisagra, colisión de la losa → hoja, sonido, persistencia):
**herrería** (yunque para forjar la llave, fragua, cofre), **taberna** (Rosa, mesas, **cartel de misiones**, cofre),
**curandera** (caldero, **receta**, 3 hierbas recolectables), **biblioteca** (estantes, atril con la **pista de la reliquia**,
cofre con candado), **sala del trono** (rey, reina, dos guardias reales; el patio es la zona del castillo), **torre**
(puerta con cerradura del alba, **cerrojo rúnico de 3 discos**, Tomás prisionero, cofre). Además **mazmorra** (arena del
Carcelero) y **cueva** (pasaje sin puerta).

Las puertas que se usan tienen **farol** y zaguán oscuro; las decorativas tienen **tablones cruzados**, nunca muestran
«Entrar» y al usarlas avisan «(No se puede entrar)». Puertas bloqueadas muestran 🔒 y un mensaje con **pista**.

Transiciones: fundido breve (~0,25 s), carga de la escena nueva, liberación de la anterior, **spawn seguro** (si el punto
está ocupado, busca en espiral uno libre), y bloqueo de doble transición (una sola a la vez; el portal no se rearma hasta
que el jugador sale de su zona).

## Sistemas
- **Jugador**: controlador cinemático (círculo contra AABB con sub-pasos), sin saltos; ataque en arco, rodar con i-frames,
  pociones, retroceso al recibir daño.
- **Cámara**: en exteriores se acerca ante cualquier muro entre jugador y cámara; en interiores (sin techo) se queda dentro de
  la habitación y sube por encima de las paredes. Nunca atraviesa paredes (verificado en pruebas).
- **NPC**: 12 roles (herrero Bruno, tabernera Rosa, guardia Iván, capitán Leandro, rey Alberto, reina Isolda, curandera
  Mirta, bibliotecaria Elena, mercader Fermín, campesino Ramón, aprendiz Lucas, viajero Saúl) + Tomás y dos guardias
  reales. Mismo rig humanoide, vestimenta propia (sombreros, armaduras, capas, delantales, armas). Máquina de estados
  `idle / walk / talk / questAvailable / questTurnIn`; marcadores ❗ (misión) y ◆ (entrega); miran al jugador cerca y
  saludan; si el jugador les bloquea el paso, esperan. Navegación por grilla A* por escena + el mismo colisionador del
  jugador. Agenda diaria por hora (p. ej. Bruno: herrería → fragua → taberna 20 h → herrería); para cambiar de escena
  caminan a la salida que lleva hacia allá. IA completa sólo en el área activa y cerca; lejos, 4 Hz; en otras escenas,
  1–4 Hz según calidad.
- **Reloj**: 1 día ≈ 12 min reales; la luz cambia en exteriores (estable, sin sombras extra).
- **Cofres**: `locked / closed / opened / looted`, guardados; 8 cofres; nunca dan botín dos veces.
- **Minimapa** (estático por escena + puntos a 5 Hz), **diario** con todas las misiones, etapa y lugar del NPC objetivo.

## Enemigos y jefes
- **Sombra** (lobo oscuro): deambula, persigue si te ve, ataque en embestida con aviso rojo en el piso.
- **Gólem de cristal** (minijefe de la cueva): golpe en área; a la mitad de vida suma onda expansiva.
- **Guardián del bosque** (jefe B) — 3 fases: 1) barrido en cono y embestida en línea; 2) (≤60 %) **escudo de runas**
  invulnerable + 3 fuegos fatuos (matarlos lo rompe 7 s) y raíces que brotan bajo el jugador; 3) (≤25 %) furia: más rápido
  y más raíces.
- **Malvor, el Carcelero** (jefe C) — 2 fases: 1) martillazo en área y cadena en línea; 2) (≤50 %) giro en anillo, 2
  presos-sombra y **los aliados reunidos lo golpean** cada 4,5 s. La reja de la mazmorra se traba durante la pelea.

## Misiones
| Tipo | Misión | Cadena |
|---|---|---|
| Principal A | La llave del alba | capitán → herrero → 3 minerales en la cueva → entregar → forjar la llave en el yunque → abrir la torre → cerrojo rúnico (combinación grabada en la llave) y rescatar a Tomás → hablar con el rey |
| Principal B | El bosque oscuro | Elena o el cartel → purificar 3 tótems (cada uno despierta 2 sombras) → Guardián (3 fases) → restaurar el altar |
| Principal C | La defensa del reino | (tras A) capitán entrega 3 refuerzos → reforzar Puerta del Puente, Portón y Empalizada → reunir 3 aliados (guardia, herrero, aprendiz, campesino sano o viajero con Canela) → Carcelero (2 fases) |
| Secundaria | Recuperar el libro | Elena → Crónica en el santuario del bosque → devolverla → el atril revela la pista de la **Reliquia** (cofre junto al molino) |
| Secundaria | Entregar medicina | Mirta → 3 hierbas → tónico en el caldero → Ramón (se levanta y puede ser aliado) |
| Secundaria | Comprar semillas | Fermín (opción Comprar / Ahora no) → plantar en la huerta |
| Secundaria | Reparar el molino | Lucas da el engranaje → molino (las aspas giran) |
| Secundaria | Rescatar mascota | Saúl → Canela en el heno de los Campos → te sigue entre escenas → Saúl |
| Secundaria | Activar el puente viejo | Iván → 2 palancas → baja el puente → ruta de comercio (cofre con llave de bronce → cofre de la biblioteca) |

Victoria: al completar las tres principales (pantalla de victoria; se puede seguir explorando). Derrota: vida en 0 →
«Te desmayaste» (despertás en la plaza; se pierde un % de monedas según dificultad; el progreso queda).
MLMissions: 3 principales + 6 secundarias por partida (`hud: 'none'`; el HUD propio muestra la misión seguida).

## Dificultad
| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Vida ♥ | 8 | 6 | 5 | 4 |
| Daño enemigo | 1 | 1 | 1 | 2 |
| Velocidad enemiga | ×0,8 | ×1 | ×1,15 | ×1,3 |
| Vida enemigos / jefes | ×0,75 / ×0,7 | ×1 / ×1 | ×1,3 / ×1,3 | ×1,6 / ×1,6 |
| Aviso de ataques | ×1,35 | ×1 | ×0,85 | ×0,7 |
| Radio de alerta | 7 | 9 | 11 | 13 |
| Poción | +4 | +3 | +2 | +2 |
| Precios | ×0,7 | ×1 | ×1,3 | ×1,6 |
| Monedas perdidas al caer | 0 % | 10 % | 20 % | 30 % |
| Daño de aliados al Carcelero | 2 | 1 | 1 | 1 |

## Calidad
| | Baja | Media | Alta |
|---|---|---|---|
| DPR máx. (Kit3D) | 1 | 1,5 | 2 |
| Sombras del sol | no | no | sí |
| Árboles/trigo decorativos | 45 % | 75 % | 100 % (los árboles con colisión siempre) |
| Pasto y flores | 0 % | 50 % | 100 % |
| Niebla (cerca/lejos) / far | 14/46 / 70 | 22/70 / 110 | 30/100 / 150 |
| Luces puntuales (antorchas cercanas) | 0 | 2 | 4 |
| Tope de partículas | 24 | 48 | 64 |
| NPC de otras escenas | 1 Hz | 2 Hz | 4 Hz |
| Radio de IA completa | 18 | 26 | 34 |

Lo estático de cada escena es **una sola malla fusionada** (colores por vértice) + una de brillos; vegetación en
`InstancedMesh`; partículas en un `InstancedMesh` con pool; sólo una escena cargada (la anterior se libera).

## Guardado (`reino_alba:save`, `createSave` versión 1)
`{ scene, spawn, time, hp, fame, started, wins, victory, inv:{coins, ore, potions, herbs, items{}}, flags{…mundo, gates,
aliados, dials, code}, doors{id:'open'|'closed'}, chests{id:'locked'|'closed'|'opened'|'looted'}, quests{id:etapa},
picked{id:true}, npcs{id:{talked}}, tutorial, opts }`. Se guarda la escena y el **nombre del spawn** (no la posición exacta):
al continuar siempre aparecés en un punto seguro. JSON corrupto → valores por defecto (copia en `reino_alba:save:corrupto`);
forma inválida → `sanitize()` repara tipos, escenas inexistentes, estados de cofre/puerta raros y etapas negativas. Nunca
se guarda dentro de la mazmorra (se vuelve al castillo).

## Pruebas (`tests/e2e/reino_alba.spec.js`)
22 pruebas (algunas sólo escritorio o sólo celular). Usan `?debug` con **tiempo manual** (`debug.manual()` detiene el
bucle real; `simulate()` avanza en pasos fijos) y los mismos caminos de la entrada real (rayo de interacción + interactuar),
más teclas/toques reales donde importa (arranque, movimiento, E sobre la puerta, entrar caminando, joystick, USAR, aviso
tocable, pausa). Cubren: carga sin errores; arranque real; tutorial salteable y reactivable; los 6 interiores + cueva ida y
vuelta ×3 sin doble transición y con persistencia de puertas tras recargar; bisagra/colisión/entrada caminando y bloqueos
con pista; sin prompts falsos; los 12 roles (diálogo, estado `talk`, mirar al jugador, marcador, reacción, agenda); NPC
caminando por A* sin pisar paredes hasta cambiar de escena; principal A completa + persistencia; B con 3 fases y altar; C
con puertas, aliados y 2 fases; las 6 secundarias; cofres sin botín infinito tras recargar; guardado corrupto y con forma
inválida; dificultad; calidad baja vs alta; pausa 1 s / reanudar / reiniciar; derrota y victoria; cámara sin atravesar
paredes; layout 412×915 y 915×412 sin scroll ni HUD encimado; táctil; rendimiento por zona.

Resultados reales (esta máquina, con otros 3 agentes corriendo, carga ~25):
- `ML_WORKERS=1`: escritorio 19 ✓ / 3 omitidas, celular 19 ✓ / 3 omitidas (38 ✓ total).
- `ML_WORKERS=4`: 38 ✓, 0 fallas, 0 flaky.
- `salva_al_rey.spec.js` (con la prueba nueva del botón): 55 ✓ en ambos proyectos.

## Móvil
Pasada mobile-first (2026-10-11), verificada con Playwright emulando Pixel 7 (táctil, DPR 2) en 360×640, 390×844, 412×915,
915×412 y 844×390. **No probado en teléfonos reales** (no hay dispositivos disponibles).

Capturas antes/después (`.perf/mobile-audit/reino_alba/`): `antes-<ancho>x<alto>-<pantalla>.png` y
`despues-<ancho>x<alto>-<pantalla>.png`, pantallas `menu, play, prompt, dialog, choices, journal, interior, torre` (los 5
tamaños) y `help, opts, text, pause` (360×640 y 844×390). El contador de FPS de las capturas es del modo `?debug`.

Problemas encontrados → arreglos:
- **Diálogo salteaba la primera línea en táctil** (bug real, reproducido): el toque en USAR (o en el aviso) abría el diálogo y
  el clic sintético del mismo toque caía sobre el cuadro recién abierto → avanzaba una línea. Ahora el diálogo sólo acepta
  clics cuyo toque empezó sobre él.
- **Tocar el texto de un diálogo con opciones elegía la primera** (p. ej. comprar semillas sin querer). Ahora sólo cuentan los
  botones de opción (el teclado E/Enter sigue eligiendo la primera, como antes).
- **Jugador tapado por los controles en interiores (vertical)**: la cámara de interiores miraba 1,8 u hacia adelante y el
  jugador quedaba al 76 % de la altura, debajo de ⤳/USAR (360×640). En táctil ahora mira 0,3 u (vertical) / 0,5 u (apaisado):
  el jugador queda por encima de los controles en vertical y por encima del 62 % en apaisado (escritorio sin cambios).
- **FOV en vertical**: con 55° verticales el horizontal era ~32°. En retrato el FOV vertical se abre hasta ~44° horizontales
  (tope 72°) y la distancia pasa de ×1,2 a ×1,05; al girar vuelve a 55°.
- **HUD contra la barra del SDK**: en 844×390 el tutorial/objetivo empezaba en y=48 y la barra termina en ~50 (encimados); en
  360×640 los chips podían meterse bajo la barra con más monedas. Ahora el HUD mide la barra (`--ra-bar-b`, `--ra-bar-x`, al
  mostrar, al redimensionar y cada 1 s) y se ubica debajo / a su izquierda.
- **Tutorial en vertical**: «Saltar tutorial» se partía en dos líneas y el cuadro + objetivo bajaban hasta tapar al jugador.
  En vertical angosto el panel derecho es más ancho, el botón dice «Saltar» y el objetivo se oculta mientras hay tutorial.
- **Objetivos táctiles**: diario 📜 32→44 px, ✕ de los carteles 36→44, botones del tutorial y opciones de diálogo ≥44/48,
  aviso tocable 44→50 (con respuesta visual al apretar), botón principal del menú/fin ≥56 px (en apaisado era 40 px).
- **Texto**: zona/hora 11→12 px, objetivo 11→12 px en pantallas chicas, fase del jefe 11→12, «Tocá para seguir» 11→12.
- **Diario**: en pantallas chicas la lista se corta sin aviso; ahora se desvanece abajo con «▼ deslizá para ver más» hasta el
  final. En táctil el botón dice «Cerrar» (sin «(L)»). Opciones muestra la ayuda táctil en vez de las teclas.
- **Gestos**: aviso, diálogo, tutorial, carteles y 📜 con `touch-action:none`; pantallas del juego con `pan-y` (se puede
  desplazar el diario pero no pellizcar/zoom que después quede aplicado al juego). El lienzo ya tenía `touch-action:none`.
- **Ayudas táctiles** (escritorio sin cambios): al atacar con ⚔ el jugador gira hacia el enemigo vivo más cercano a ≤3,4 u sin
  muro en medio. Vibración corta opcional (golpe recibido 40 ms, golpe dado 15 ms, fase de jefe 70 ms) sólo en táctil y nunca
  con «Movimiento: reducido» o `prefers-reduced-motion`.
- **Orientación**: se juega en ambas. En vertical aparece una vez por sesión un aviso no bloqueante («con el teléfono
  horizontal ves más del reino»). Girar en plena partida reacomoda HUD, controles y cámara sin perder el estado.
- Sin cambios necesarios: pausa al pasar a segundo plano (SDK), calidad automática en táctil = media (DPR ≤1,5, sin sombras),
  multitáctil joystick + botones + arrastre de cámara (kit3d).

Pruebas móviles nuevas (proyecto `mobile`): matriz de los 5 tamaños (menú: botón principal ≥56 px y visible, sin scroll
horizontal; en juego: HUD/SDK/joystick/botones/aviso/tutorial/objetivo/diálogo sin encimarse ni salirse, objetivos ≥44 px,
textos de juego ≥12 px, jugador fuera de la franja de controles en aldea, herrería, torre y taberna; diálogo con opciones y
diario tocables), clic sintético del toque que abre un diálogo, multitáctil joystick + ⚔ con ayuda de puntería, giro en plena
partida + pausa por `visibilitychange`. Reemplazan a las dos pruebas de layout 412×915/915×412 anteriores.

Resultados (`tests/e2e/reino_alba.spec.js`, 2026-10-11, máquina compartida con otros agentes, carga ~30): 28 pruebas por
proyecto. `ML_WORKERS=1`: escritorio 19 ✓ / 9 omitidas (sólo celular), celular 25 ✓ / 3 omitidas → 44 ✓, 0 fallas.
`ML_WORKERS=4`: 44 ✓, 12 omitidas, 0 fallas, 0 flaky. La prueba del diálogo falla con el código anterior (línea salteada:
esperado 0, recibido 1) y la de la matriz falla con la cámara de interiores anterior (jugador a la altura de los controles).

## Rendimiento (SwiftShader headless, máquina cargada: los FPS no son representativos)
- `node tests/perf/measure.mjs reino_alba reino_alba` (menú): fps 2,7 (templo_ecos en el mismo momento: 2,7), heap 11,1 MB,
  DCL 512 ms, load 1082 ms, 23 requests, 1131 KB, 0 errores.
- En juego (draw calls / triángulos / heap / armado de escena):
  - Media: aldea 34 / 15,7k / 11,6 MB / 53 ms · castillo 12 / 10,8k · bosque 13 / 19k · campos 43 / 76k · taberna 19 / 1,9k ·
    trono 10 / 1,2k · cueva 16 / 2,5k; update ≤ 0,6 ms; render ≤ 2,1 ms; heap 11–17 MB.
  - Baja: aldea 32 / 8,8k · castillo 10 / 5,7k · bosque 12 / 12k · campos 42 / 49k · interiores iguales; heap 11–15 MB.

## Decisiones de diseño
- Se interpretó «castillo: patio y sala del trono» como zona exterior (patio) + interior (trono).
- Los efectos de un diálogo se aplican al abrirlo (cortar la charla nunca deja una misión trabada).
- Los NPC de otras escenas no se simulan físicamente: se ubican según la agenda a baja frecuencia.
- Las misiones toleran orden libre (hierbas, libro, minerales, Canela y palancas se pueden hacer antes de hablar).
- Arte 100 % procedural (sin assets externos). Sonido sintetizado con `createAudio().tone`.

## Pendiente / NO PROBADO
- Gamepad físico: mapeado pero no probado con un mando real (Playwright desactiva los mandos).
- FPS en dispositivos reales: no medidos (sólo SwiftShader).
- No hay mapas normales ni sombras de antorchas (sólo sombra del sol en «Alta»), por rendimiento.
- Animaciones de NPC simples (caminar, respirar, hablar, atacar); no hay rigs esqueléticos.
- Miniatura `games/thumbs/reino_alba.webp` y entrada en `games/registry.js`: no creadas (archivos compartidos).
