# Cocina del Caos

Gestión de cocina contra reloj en 3D, modo solitario (Three.js 0.186.1 por import map + Kit3D + MLArcade + MLMissions). Spec: `docs/specs/19_cocina-caos.md`.

- Página: `cocina_caos.html` · Código: `games/cocina_caos/` (`main.js` pegamento/cámara/menús/gancho, `config.js` datos y reglas puras, `sim.js` reglas del turno, `world.js` armado de cocinas por plano de baldosas, `models.js` modelos procedurales, `helper.js` ayudante + BFS, `fx.js` pools de efectos/ítems, `ui.js` HUD DOM, `sfx.js` sonidos y música) · Pruebas: `tests/e2e/cocina_caos.spec.js`.
- Sin assets externos: chef, ayudante Pipo, comensales (caballeros, diablillos de lava, alienígenas), roedores, estaciones, ingredientes (crudo / picado / asado / cocido / quemado), platos, extintor y **tickets 3D** (tarjeta con lienzo + barra de paciencia sobre cada comensal) se arman en código con primitivas fusionadas y colores por vértice. Audio 100 % sintetizado con `createAudio().tone` (incluida una musiquita distinta por cocina). Acento `#ff5c7a`.

## Concepto

Sos el chef de un reino caótico. Bucle: **sacar ingredientes de la nevera → picar en la tabla / hornear / olla → emplatar con un plato limpio → servir por la cinta → lavar los platos sucios que vuelven**, con pedidos que vencen, fuego, derrames, roedores y eventos de caos propios de cada cocina. Con estrellas desbloqueás la cocina siguiente; con las tres, el **Gran Banquete** del Rey Glotón.

## Controles

| Acción | PC (configurable) | Táctil | Gamepad |
|---|---|---|---|
| Moverse | WASD / flechas | joystick (izquierda) | stick / cruceta |
| **Acción contextual** (agarrar, dejar, emplatar, servir, sacar, hornear…) | **E** (siempre también Espacio / Enter) | botón grande **ACCIÓN** (cambia de texto: AGARRAR, PICAR, SERVIR…) | A (también Y) |
| Picar / lavar / limpiar / apagar | **mantener** Acción (o tocar repetido) | mantener ACCIÓN | mantener A |
| Encargo del ayudante | **Q** cicla · 1-4 directo · botones de la barra PIPO | botón 🧑‍🍳 (muestra el encargo actual) | X cicla · LB/RB encargos 1/2 |
| Impulso | **Shift** | ⚡ | B |
| Pausa | Esc / P / ⏸ | ⏸ | Start |

- La estación que mirás se marca con **marco + relleno + flecha** (rosa si la acción es posible, blanco si no) y el texto exacto de la acción aparece abajo (`#prompt`) y en el botón táctil. Roedores y derrames se marcan con un anillo. En el tutorial, una flecha amarilla grande indica a dónde ir.
- **⌨ Controles** (menú principal o de pausa): remapeo de Acción / Ayudante / Impulso (se guardan) y **sensibilidad del stick** (Suave / Normal / Rápida). Pausa, silencio, calidad y ayuda vienen del SDK. `prefers-reduced-motion`: sin temblor de cámara ni animaciones de banner/tickets.
- Cámara fija isométrica que encuadra toda la cocina y el salón; en celular vertical encuadra la cocina completa hasta la cinta (el salón queda fuera; los pedidos se leen en los tickets).

**Cómo arrancar una partida con entrada real:** en el menú, **Enter** (o clic/toque en «▶ Jugar · Taberna» `#ccMenu [data-play]`).

## Escenarios (3 cocinas jugables, plano de baldosas 12×8)

| Cocina | Plano y estaciones | Recetas | Riesgos propios |
|---|---|---|---|
| **Taberna del Reino** 🏰 | piedra, vigas, estandartes, antorchas; isla central; 5 neveras (lechuga, tomate, hongo, pan, carne), 3 tablas, 2 hornos de barro, olla, 2 fregaderos, escurridor, retorno, cinta a la derecha | ensalada verde (2), ensalada mixta (3), sopa de hongos (3), sándwich de carne (3) | roedores periódicos, **barril pinchado** (derrames), **grasa al rojo** (un horno/olla se prende) |
| **Cocina Volcánica** 🌋 | **río de lava** que corta la cocina con 2 puentes (el retorno de platos queda abajo y el fregadero arriba), cascadas de lava, grietas en el piso | papas volcánicas (3), hamburguesa (4), sopa de tomate (3), combo magma (4) | **erupción** (marca roja sobre 1-2 estaciones → fuego), **temblor** (sacudón + derrames de aceite), **grietas** (escupen vapor: te aturden y te empujan) |
| **Restaurante Espacial** 🚀 | estación orbital blanca, ojos de buey con estrellas y planeta; **pasillos móviles** (te arrastran a izquierda/derecha), **esclusa** a la izquierda, 6 neveras | onigiri (2), sushi (3), pescado orbital (4), ensalada mixta (3) | **esclusa** (te chupa hacia el vacío 5 s), **gravedad cero** (todo patina 9 s), **meteoritos** (salpicaduras de baba), ratones lunares |

Pasar de una cocina a otra: botón «▶ siguiente cocina» al terminar un turno con ★, o elegirla en el menú.

## Sistemas

- **Estaciones utilizables en tiempo real** (todas con colisión, foco por proximidad + dirección, resaltado, animación y estado que persiste durante el turno):
  - **Mesada:** apoya cualquier cosa (ingredientes, platos, platos sucios, extintor) y lo conserva; emplatar ingrediente↔plato en la mesada.
  - **Tabla de picar:** se pica manteniendo Acción (1.5 s); el progreso queda guardado si te vas. Cuchillo animado + barra.
  - **Horno:** hornea (carne cruda, papa picada, pescado) en 6.5 s × dificultad; después avisa (pitidos, humo, barra roja titilante) y **se quema**; 5 s más quemado → **fuego**. Puerta y boca con brillo animados.
  - **Olla:** 3 picados de tomate/hongo → sopa; 2 de arroz → arroz cocido (8 s). Se sirve con un plato; si se pasa se quema y luego se prende. Llama del anafe, burbujas y nivel de la sopa.
  - **Fregadero:** recibe la pila de platos sucios y se lava manteniendo Acción (1.6 s por plato) → el plato aparece en el escurridor.
  - **Platos:** escurridor con platos visibles (4–5 al inicio); cada entrega devuelve un plato **sucio** por el retorno a los 6 s. Sin platos limpios no hay servicio.
  - **Nevera:** saca el ingrediente que muestra arriba (tapa que se abre + vaho); también se devuelve.
  - **Cinta transportadora:** lo que apoyes viaja hasta la ventanilla y se entrega solo (tablillas animadas, no se encima). Se puede retirar algo antes de que llegue.
  - **Basura** (tira ingredientes o vacía el plato) y **extintor** (ítem que se lleva en la mano).
- **Recetas de 2 a 5 pasos** (picar, hornear, olla, emplatar; el Festín del Rey y la Gran Cena Orbital tienen 5). Pedidos progresivos: aparecen cada vez más seguido durante el turno (−25 % de intervalo al final), máximo 4–5 a la vez.
- **Puntaje:** 20 × pasos + propina (hasta 60 % según el tiempo restante) + 10 si es **perfecto** (≥ 50 % del tiempo) + racha (+5 por entrega seguida, hasta +25). Pedido equivocado: −10 y vuelve el plato sucio.
- **Ayudante IA (Pipo)** con 4 encargos seleccionables, BFS por baldosas y las **mismas funciones** que el chef: 🧼 lavar (junta platos del retorno, los lleva y los lava), 🔪 picar (mira los pedidos abiertos, saca lo que falta de la nevera y lo pica en una tabla libre), 🧯 emergencias (apaga fuegos a mano, limpia derrames, corre roedores), 🤝 seguirte. Etiqueta flotante con lo que está haciendo. Es más lento que vos (×1.35).

## Rivales y desafíos

| Rival | Silueta | Comportamiento | Contrajuego |
|---|---|---|---|
| **Fuego** | llamas cónicas naranjas animadas sobre la estación | nace de comida quemada o de eventos; deja la estación inutilizable y **se propaga** a una vecina cada 9 s | extintor (1.1 s manteniendo) o a mano (2.6 s); Pipo en «emergencias» |
| **Derrame** | charco brillante (cerveza / aceite / baba verde según cocina) | hace patinar al chef (casi sin agarre); si queda más de 14 s, la cocina cuenta como sucia | mantener Acción encima o al lado (1.4 s) |
| **Roedor travieso** | bola gris de orejas rosas y cola larga (versión lunar con casco) | sale de la ratonera, va a una mesada con comida, la mordisquea 1.8 s (temblequeo + chillido) y se la lleva a la cueva | tocarlo con Acción o pasarle por encima: huye y **devuelve** la comida |

Los eventos de caos se **telegrafían** (banner, alarma y marcas rojas en el piso/estación durante el tiempo de aviso de la dificultad) antes de ocurrir.

## Gran evento: el Gran Banquete (3 fases, no es combate)

Se desbloquea con ★ en las tres cocinas. Intro animada (cámara cinemática por la taberna con la corte sentada, clarín y fanfarria, salteable con Acción). Cada fase es un turno en otra cocina con **reglas nuevas**:

1. **Entradas** (Taberna, 70 s): los comensales llegan en **oleadas de 3** anunciadas por el clarín (aviso de 2–4 s). Atender toda la oleada antes de la próxima da +40.
2. **Plato fuerte** (Volcánica, 80 s): el Rey pide el **Festín del Rey** (5 pasos, vale **doble**, cada 34 s) y el volcán entra en **erupción a ritmo fijo** (cada 15 s × dificultad) con marca previa.
3. **Gran final en órbita** (Espacial, 80 s): **gravedad cero permanente**, la esclusa se abre cada ~19 s y cada plato vale **×1.5** (Gran Cena Orbital real).

Entre fases, pantalla con estrellas de la fase, total y la regla siguiente. **Victoria:** sumar las estrellas que exige la dificultad (3/4/5/6 de 9). **Recompensa:** gorro dorado para el chef (persistente), récord y misión principal. **Derrota:** demasiados pedidos fallidos en una fase o no llegar a las estrellas.

## Condiciones

- **Derrota:** llegar al máximo de pedidos fallidos (vencidos) de la dificultad → pantalla «¡La cocina colapsó!» con Reintentar / Menú.
- **Turno:** al terminar el reloj se calculan estrellas (umbrales por cocina, se ven en la barra del HUD). Con ★ se desbloquea la cocina siguiente.
- **Victoria:** estrellas necesarias en el Gran Banquete.
- Reinicio limpio desde la pausa (turno nuevo, misiones reiniciadas); nunca hay bloqueo irreversible (siempre se puede repetir cualquier cocina desbloqueada).

## Misiones (MLMissions: `primaryPerRun: 3`, `secondaryPerRun: 3`)

| Tipo | Misión | Cómo |
|---|---|---|
| ★ | Atender 8 órdenes | evento `served`, suma entre turnos (progreso guardado en `served`) |
| ★ | Desbloquear la segunda cocina | ★ en la Taberna → `unlock2` |
| ★ | Superar el Gran Banquete | victoria del banquete → `banquete` |
| ◆ | Completar 3 pedidos perfectos | `perfect` ×3 |
| ◆ | No quemar ninguna receta | terminar un turno ganado sin quemar (`noburn`, falla con `burn`) |
| ◆ | Mantener la cocina limpia | turno ganado sin derrames viejos ni ≥5 platos sucios apilados (`clean`, falla con `dirty`) |
| ◆ | Entregar 5 platos sin error | racha `streak` (modo máx.) ≥ 5 |
| ◆ | Apagar 3 incendios | `fire_out` ×3 |
| ◆ | Espantar 5 roedores | `rat_shoo` ×5 |

El progreso de campaña vive en el guardado y se sincroniza con MLMissions al empezar cada partida (`syncMissions`, sin repetir logros). Panel 🎯 Misiones en el menú; lista compacta en el HUD de PC; sección de misiones en la pausa (SDK).

## Dificultad (tabla real de efectos)

| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Tiempo de cada pedido | ×1.4 | ×1 | ×0.85 | ×0.7 |
| Intervalo entre pedidos | ×1.3 | ×1 | ×0.85 | ×0.72 |
| Pedidos fallidos para perder | 6 | 4 | 3 | 2 |
| Intervalo de caos | ×1.6 | ×1 | ×0.75 | ×0.55 |
| Margen antes de quemar | ×1.6 | ×1 | ×0.75 | ×0.6 |
| Tiempo de cocción | ×0.85 | ×1 | ×1.1 | ×1.2 |
| Frecuencia de roedores | ×0.6 | ×1 | ×1.3 | ×1.6 |
| Aviso previo de eventos | 4 s | 3 s | 2.5 s | 2 s |
| Estrellas para el Banquete | 3 | 4 | 5 | 6 |

Los controles nunca cambian con la dificultad. Erupciones dobles en Difícil/Extremo; un roedor extra por evento en Difícil/Extremo.

## Calidad gráfica

| | Baja | Media | Alta |
|---|---|---|---|
| Pixel ratio máx. | 1 | 1.5 | 2 |
| Sombras | no | no | sí (2048) |
| Partículas (tope del pool) | 90 | 180 | 300 |
| Luz puntual de ambiente | no | sí | sí |
| Niebla / distancia | 16–40 | 20–55 | 26–70 |
| Estrellas del fondo espacial | 250 | 600 | 1200 |
| Decoración de paredes (al construir) | 40 % | 75 % | 100 % |

Rendimiento: estático fusionado por cocina (piso, paredes, mesadas, brillos), InstancedMesh para tablillas de la cinta, platos, burbujas y chevrones; pools de 44 vistas de ítems, 12 llamas, 6 charcos, 6 marcas, 10 barras y 300 partículas; nada se crea por cuadro. Cocinas construidas a demanda y cacheadas.

## Guardado (`cocina_caos:save`, versión 2, `createSave`)

`{ unlocked: 1-4, best: {taberna|volcan|espacial|banquete: {score, stars}}, served, banquetWon, goldHat, tutorialDone, keys: {act, helper, dash}, stick: 0.7|1|1.3, stats: {perfect, burnt, fires, rats, shifts} }`. `sanitize()` tolera tipos rotos (números fuera de rango, teclas inválidas o repetidas, coherencia récord↔desbloqueo). JSON corrupto: se copia a `cocina_caos:save:corrupto` y se arranca de cero. **Migración v1** `{level, record, orders}` → `unlocked / best.taberna.score / served`. Récord general vía `MLArcade.ended({score})`.

## Tutorial

Contextual y guiado en el primer turno de la Taberna (el reloj y el pedido esperan): moverse → sacar lechuga → picarla → agarrar plato → emplatar → servir por la cinta → consejo final (ayudante y caos). Flecha amarilla sobre el objetivo. «Saltar tutorial» siempre visible; se reabre desde la pausa («📘 Ver tutorial de nuevo»).

## Gancho de pruebas

`window.__cocina_caos` (congelado): `state, scene, endKind, banquet, player, hold, hp, score, shift, orders, stations, station(id), conveyor, focus, spills, rats, chaos, helper, events, save, missions, difficulty, tutorial, counts, perf, camera, goldHat, simTime, paused, screenOf(id)`. Con `?debug`: `simulate, goto, banquetPhase, startBanquet, skipCut, tp, face, at(id), act(), holdAct(s), give, put, spawn('rat'|'spill'|'fire:<id>'|'order:<receta>'), startChaos, clearOrders, noSpawn, setScore, setTime, setTask, unlock, deliverDirty, endTut, flush`. `act()` y `holdAct()` usan el mismo camino que el teclado.

## Pruebas (`tests/e2e/cocina_caos.spec.js`, 24 casos)

Carga sin errores; arranque con entrada real + movimiento + tutorial (saltar/reabrir); nevera/tabla/mesada/platos/cinta con entrada real y resaltado; horno (asar, quemar, fuego) + extintor; olla + retorno + fregadero + escurridor; roedor/derrame/ayudante; ayudante lavar/picar autónomo; 3 cocinas + eventos propios + transición a la siguiente con entrada real; misión principal y secundaria + persistencia tras recargar; guardado corrupto/malformado/v1; dificultad (tabla + tiempo medido); calidad (pixel ratio, sombras, niebla, luz, partículas); Gran Banquete (intro salteada con entrada real, oleadas telegrafiadas, pedido real, erupciones, gravedad cero, victoria + recompensa + misión); derrota + reintento; pausa congela 1 s / reanuda / reiniciar; remapeo de tecla; móvil (sólo proyecto `mobile`): matriz 360×640 / 390×844 / 412×915 / 915×412 / 844×390, multitáctil, rotación a mitad de partida y pausa en segundo plano (detalle en «Móvil»).

Resultados reales (esta máquina, 2026-10-11, tras el pase móvil):

- `ML_WORKERS=1`: **desktop 16 passed (8 de celular se saltean) · mobile 24 passed** → 40 passed, 8 skipped (10.1 min, con otros agentes usando la CPU).
- `ML_WORKERS=4`: **40 passed, 8 skipped** (4.2 min). Tras el último ajuste de CSS (chip de fase en vertical) se repitió `--project=mobile` con 4 workers: 24 passed.

## Rendimiento (Chromium headless + SwiftShader, 1280×800 — sólo comparativo)

- `node tests/perf/measure.mjs cocina_caos cocina_caos` (menú, calidad automática): 18.5 fps, DCL 276 ms, load 415 ms, heap 8.8 MB, 22 requests, 1112 KB, 217 nodos DOM, 0 errores. Con `ML_QUALITY=low`: 22.8 fps, heap 8.6 MB.
- En juego (gancho `perf`, tras 40 s simulados): **media** — Taberna 71 draw calls / 10.5 k tris / render 1.5 ms / heap 9.0 MB; Volcán 77 / 10.1 k / 3.9 ms / 10.5 MB; Espacial 76 / 11.0 k / 1.7 ms / 11.7 MB. **baja** — 71–76 draw calls, 9.8–11.0 k tris, render 1.7–2.0 ms, heap 9.7–11.8 MB. Lógica (`updateMs`) < 1 ms por cuadro.

## Móvil

Pase mobile-first (2026-10-11), verificado con Chromium + toque emulado (`isMobile`, `hasTouch`, DPR 2–3) en 360×640, 390×844, 412×915 (vertical) y 915×412, 844×390 (apaisado). **No probado en teléfonos reales.**

Problemas encontrados → arreglados:

| Problema (dónde se vio) | Arreglo |
|---|---|
| Menú apaisado cortado: «Jugar», dificultad y botones secundarios fuera de pantalla (915×412, 844×390: el menú medía 677 px) | Menú compacto para alto ≤ 520 px: título en una línea, sin bajada, 4 cocinas en una fila, dificultad en línea. Ahora entra entero (412/390 px). Además la fila de «Jugar» (y la de la pantalla de fin) es `sticky` abajo: si algún menú no entra, el botón principal sigue visible en la zona del pulgar |
| Tarjetas de cocinas cortadas a la derecha en vertical angosto (360, 390) | `min-width:0` en las tarjetas del grid (el texto `nowrap` ensanchaba la columna); textos con elipsis |
| Barra del SDK tapando «MATELABS PRESENTA» (vertical) y el HUD superior (`#hTop` debajo de la barra, 3.ª estrella oculta en 360/390) | En vertical táctil el menú baja 56 px y el HUD pasa a una fila completa debajo de la barra; tickets y tutorial se corren en consecuencia |
| 11 objetivos táctiles < 44 px: dificultad 33 px de alto, «Cómo jugar/Controles/Misiones» 38 px, ✕ de paneles 38 px, «Saltar tutorial» | En `pointer:coarse`: dificultad ≥ 44 px, secundarios ≥ 44 px, ✕ 44 px, «Saltar tutorial» 44 px; «Jugar» y botones del fin ≥ 56 px (los 4 del SDK ya eran 44 px desde el cambio central) |
| Texto < 12 px: «DIFICULTAD» 10 px, kicker 11, subtítulos de cocinas 11.5, cartel de Pipo 11, nombre de cocina 11, insignias de los tickets 9 px | 12 px (insignias 11 px) |
| Vertical: la cámara seguía al chef mostrando 13 u de ancho → la cinta, ollas y horno quedaban fuera de cuadro casi siempre (360, 390, 412) | Encuadre vertical = cocina completa hasta la cinta (sin seguimiento), el salón queda afuera |
| Vertical alto (390×844, 412×915): la cocina se veía velada por la niebla (la cámara se aleja más que la distancia fija de niebla) | La niebla se corre con la distancia de cámara |
| **Bug (también en PC al redimensionar)**: al rotar a mitad de partida la cámara se encuadraba con el aspecto viejo (el `resize` llega antes que el ResizeObserver del motor) → 640×360 quedaba con distancia 50 y la cocina diminuta | `fitCamera` actualiza el aspecto antes de encuadrar |
| Tutorial en vertical tapaba la fila de neveras y la tabla justo cuando pide usarlas | En vertical va compacto abajo (texto + «Saltar» a la derecha), en el lugar del aviso contextual (que se oculta mientras tanto; la acción sigue escrita en el botón ACCIÓN) |
| Chip de fase del Gran Banquete partido en 3 líneas en medio de la cocina (360×640, fase 3) | En vertical: chip a lo ancho (1–2 líneas), sobre los controles |
| Sin `touch-action` en la superficie de juego | `touch-action:none` en canvas/HUD (el menú sigue scrolleable) |
| Sin respuesta háptica / presión poco visible | `navigator.vibrate(8)` al tocar ACCIÓN/⚡/ayudante (sólo táctil, se omite con «reducir movimiento»); botón presionado se achica y se ilumina |

Ya estaba bien y se verificó: joystick + botones del kit con captura por puntero (multitáctil real: mover y actuar a la vez), ACCIÓN de 104 px abajo a la derecha con el texto de la acción contextual, calidad automática «media» en táctil (DPR tope 1.5), pausa al pasar a segundo plano (SDK).

Capturas reales (DPR 2–3) en `.perf/mobile-audit/cocina_caos-movil/`: antes `before-360x640-menu.png`, `before-360x640-play.png`, `before-360x640-tut.png`, `before-390x844-play.png`, `before-844x390-menu.png`, `before-844x390-tut.png`; después `after3-360x640-menu.png`, `after3-360x640-play.png`, `after3-360x640-tut.png`, `after3-390x844-play.png`, `after3-412x915-play.png`, `after3-844x390-menu.png`, `after3-915x412-menu.png`, `after3-844x390-play.png`, rotación a mitad de partida `x-360x640-rotated.png` / `x-844x390-rotated.png`, fin de turno apaisado `x-844x390-end.png`, Gran Banquete fase 3 `k-360x640-espacial.png` / `k-844x390-espacial.png`. Las pruebas guardan además `test-results/cocina_caos-<ancho>x<alto>.png`.

Pruebas móviles (proyecto `mobile`, Pixel 7): matriz de 5 tamaños (menú sin desborde ni tarjetas cortadas, «Jugar» ≥ 56 px dentro de pantalla y tocado de verdad, sin superposición con la barra del SDK, tutorial sin pisar controles/HUD, HUD/tickets/joystick/botones/barra sin superponerse ni salirse, todos los botones visibles ≥ 44 px, ACCIÓN ≥ 90 px en el cuarto inferior derecho, texto de HUD ≥ 12 px, AGARRAR + impulso con toques reales, vertical sin cámara de seguimiento); multitáctil por CDP (joystick sostenido + ACCIÓN a la vez); rotación a mitad de partida (estado, ítem en mano y pedidos intactos, cámara reencuadrada, controles reubicados); segundo plano → pausa → reanudar tocando.

## Pendiente / NO PROBADO

- **NO PROBADO** con gamepad físico (el SDK ignora mandos bajo webdriver); el mapa está configurado y documentado.
- **NO PROBADO** en celulares reales (sólo emulación Pixel 7 en Playwright) ni con GPU real.
- Balance de umbrales de estrellas ajustado por cálculo (≈5–7 entregas por turno para ★★★), no con sesiones largas de jugadores reales.
- Los modelos GLB del paquete no se usan (todo procedural, más coherente con el estilo).
- Sin miniatura `games/thumbs/cocina_caos.webp` (archivo compartido: pedido en el informe).
