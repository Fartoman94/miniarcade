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
- Cámara fija isométrica que encuadra toda la cocina y el salón; en celular vertical se acerca y sigue al chef en horizontal.

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

## Pruebas (`tests/e2e/cocina_caos.spec.js`, 18 casos)

Carga sin errores; arranque con entrada real + movimiento + tutorial (saltar/reabrir); nevera/tabla/mesada/platos/cinta con entrada real y resaltado; horno (asar, quemar, fuego) + extintor; olla + retorno + fregadero + escurridor; roedor/derrame/ayudante; ayudante lavar/picar autónomo; 3 cocinas + eventos propios + transición a la siguiente con entrada real; misión principal y secundaria + persistencia tras recargar; guardado corrupto/malformado/v1; dificultad (tabla + tiempo medido); calidad (pixel ratio, sombras, niebla, luz, partículas); Gran Banquete (intro salteada con entrada real, oleadas telegrafiadas, pedido real, erupciones, gravedad cero, victoria + recompensa + misión); derrota + reintento; pausa congela 1 s / reanuda / reiniciar; remapeo de tecla; celular 412×915 y 915×412 (sin superposiciones ni scroll, botón ≥ 90 px, ACCIÓN contextual e impulso táctil).

Resultados reales (esta máquina, 2026-10-10):

- `ML_WORKERS=1`: **desktop 16/16 ✓ (2 de celular se saltean en desktop) · mobile 18/18 ✓** (34 passed, 2 skipped, 2.1 min).
- `ML_WORKERS=4` (simula el runner lento): **34 passed, 2 skipped** en ambos proyectos; en una corrida, el caso de celular 412×915 falló por un `net::ERR_NETWORK_CHANGED` de la red de la máquina (consola, ajeno al juego) y pasó al repetirlo con `ML_WORKERS=4`.

## Rendimiento (Chromium headless + SwiftShader, 1280×800 — sólo comparativo)

- `node tests/perf/measure.mjs cocina_caos cocina_caos` (menú, calidad automática): 18.5 fps, DCL 276 ms, load 415 ms, heap 8.8 MB, 22 requests, 1112 KB, 217 nodos DOM, 0 errores. Con `ML_QUALITY=low`: 22.8 fps, heap 8.6 MB.
- En juego (gancho `perf`, tras 40 s simulados): **media** — Taberna 71 draw calls / 10.5 k tris / render 1.5 ms / heap 9.0 MB; Volcán 77 / 10.1 k / 3.9 ms / 10.5 MB; Espacial 76 / 11.0 k / 1.7 ms / 11.7 MB. **baja** — 71–76 draw calls, 9.8–11.0 k tris, render 1.7–2.0 ms, heap 9.7–11.8 MB. Lógica (`updateMs`) < 1 ms por cuadro.

## Pendiente / NO PROBADO

- **NO PROBADO** con gamepad físico (el SDK ignora mandos bajo webdriver); el mapa está configurado y documentado.
- **NO PROBADO** en celulares reales (sólo emulación Pixel 7 en Playwright) ni con GPU real.
- Balance de umbrales de estrellas ajustado por cálculo (≈5–7 entregas por turno para ★★★), no con sesiones largas de jugadores reales.
- Los modelos GLB del paquete no se usan (todo procedural, más coherente con el estilo).
- Sin miniatura `games/thumbs/cocina_caos.webp` (archivo compartido: pedido en el informe).
