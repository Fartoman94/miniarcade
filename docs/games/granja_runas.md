# Granja de Runas

Simulador acogedor en 3D (Three.js 0.186.1 por import map + Kit3D + MLArcade + MLMissions). Spec: `docs/specs/12_granja-runas.md`.

- Página: `granja_runas.html` · Código: `games/granja_runas/` (`main.js`, `data.js`, `models.js`, `world.js`, `critters.js`, `storm.js`, `ui.js`) · Pruebas: `tests/e2e/granja_runas.spec.js`.
- Sin assets externos: todos los modelos (campesina, agricultor y vecinos, animales, surcos, cultivos, herramientas, edificios rurales) se arman en código con primitivas fusionadas y colores por vértice. Audio 100 % sintetizado (`createAudio().tone`), incluida una musiquita pentatónica de día y grillos de noche.

## Concepto

Heredaste la granja de la Abuela Runa, comida por la maleza. Bucle: **limpiar → plantar → regar → cosechar → vender / pedidos → mejorar herramientas → misiones**. Ganar la Feria de Cosechas trae la **Estación de Tormentas**; sobrevivirla da la Runa de tormenta que completa el **Invernadero mágico**. No hay combate ni pérdida irreversible.

## Controles

| Acción | PC (configurable) | Táctil | Gamepad |
|---|---|---|---|
| Moverse | WASD / flechas | joystick (izquierda) | stick / cruceta |
| Ir a un lugar / usar un objeto | clic en el suelo o en el objeto | tocar el suelo o el objeto | — |
| Usar / interactuar | **E** (siempre también Espacio/Enter) | botón **USAR** | A |
| Calmar espíritu | mantener E | mantener USAR | mantener A |
| Cambiar semilla | **Q** (también Tab, 1–5 directo) | 🌱 | X |
| Girar cámara | **Z / X** (también , y .) | ⟲ | LB / RB |
| Diario y misiones | **J** (también I), botón 📖 | 📖 | Y |
| Pausa | Esc / P / ⏸ | ⏸ | Start |

Las teclas se cambian en **⌨ Controles** (menú principal o menú de pausa) y se guardan; ahí también está la **sensibilidad de cámara** (giro de 27°/45°/68° y suavizado). Pausa, silencio, calidad gráfica, ayuda y reinicio vienen del SDK. `prefers-reduced-motion`: sin temblor de cámara, sin destello de rayo, sin fundidos.

Cómo arrancar una partida con entrada real: **Enter (o clic/toque en «▶ Jugar» / «▶ Continuar»)** en el menú.

## Escenarios

| Escenario | Objetivo | Interactivos |
|---|---|---|
| **Granja** | huerta, animales, molino, invernadero, decoración; escenario del evento | 12 parcelas, pozo, casa (comer/dormir), molino, obra del invernadero (+6 parcelas internas), 4 lugares de decoración, corral con animales; en la tormenta: lonas, 3 pararrayos, 2 compuertas, 3 campanas |
| **Mercado del pueblo** | comprar, vender, pedidos, feria, mejoras, adopción | 4 estantes de semillas con stock visible (caja de honestidad), almacén de Tomás (venta) y su estantería a abastecer (se llena visualmente), herrería de Inés, puesto de Rosa (forraje + decoración), corralito de adopción, tablero de pedidos, carpa de la Feria; 4 vecinos con rutina |
| **Bosque de semillas raras** | materiales y semillas raras | 5 arbustos rúnicos (fragmentos ✨, 2 dan semilla de calabaza), 4 troncos (leña), 3 cristales rúnicos, santuario (3 ✨ → semilla arcoíris), cabrita perdida, espíritus del clima; arroyo con vado |

Las salidas se cruzan caminando (cartel + fundido). Cada escenario tiene ángulo de cámara propio.

## Sistemas

- **Día/noche corto:** 8 min de juego por segundo real (día 6:00–24:00 ≈ 135 s). Cielo, sol, hemisferio, niebla y ventanas/faroles cambian por franja. Se duerme en casa desde las 18:00; a las 24:00 te quedás dormida en el camino (−5 % monedas).
- **Estaciones suaves:** 3 días cada una; el último tercio mezcla el tinte del follaje y del suelo con la siguiente. Afectan el crecimiento de cada cultivo y la demanda en el almacén. Días de lluvia deterministas (≈22 %, nunca en verano) riegan solos.
- **Crecimiento determinista:** `g += minutosRegados / grow × multEstación × dificultad`. Sin agua no crece; la humedad dura ~10 h de juego. Etapas: semilla → brote → creciendo → madura (mallas distintas). Invernadero: ×1.25, nunca baja por estación, sin plagas.
- **Economía local:** precio = base × dificultad × demanda estacional (+20 %/−15 %) × saturación del día (−5 % por unidad vendida, mínimo 60 %) × decoración (+3 % por adorno). Pedidos del tablero (3 cada 2 días, deterministas, pagan ~1.6×). Estantes con stock diario. Molino reparado: trigo → harina (vale 3×).
- **Mejoras de herramientas (Inés):** regadera 4 → 8 → 14 de agua; azada 2 golpes → 1 golpe (menos energía); botas 4.6 → 5.6 → 6.6 m/s. Cuestan monedas, madera y/o cristal.
- **Energía:** cada acción cuesta (×dificultad). Se recupera comiendo (casa o diario) o durmiendo.
- **Animales:** gallina y oveja (adopción en el refugio), cabrita (bosque, se adopta convidándole comida). Se alimentan con forraje o trigo una vez por día (salto + corazones) y a la mañana siguiente dejan huevo/lana/leche.
- **Vecinos con rutina (por hora):** Don Tito (semillas; agricultor), Inés (herrería), Abuela Rosa (refugio/decoración), Tomás (almacén). Almuerzan en la fuente, descansan en el banco, a la noche vuelven a casa. Si no están en su puesto, el mostrador dice dónde encontrarlos; hablándoles se abre su tienda igual (nunca bloquea).

## Rivales y desafíos (no letales)

| Rival | Silueta | Comportamiento | Contrajuego |
|---|---|---|---|
| **Topo travieso** | bola marrón de orejas enormes con runa en la frente | aviso: montículo que se sacude 2.6 s junto a un cultivo en crecimiento; después asoma y mordisquea (−8 % de crecimiento cada 3 s, nunca baja de brote) | acercarse y USAR: salta y se va |
| **Cuervo roba-semillas** | pájaro negro de alas batientes | ronda en círculo alto, luego baja en espiral sobre una **semilla recién plantada** mientras su sombra crece (aviso = telegrafía de la dificultad); si picotea 2.6 s se lleva la semilla | acercarse a 2.8 m lo espanta; el **espantapájaros** protege los surcos a 7.5 m |
| **Espíritu del clima** | nubecita con cara; ☀️ rayos dorados o ❄️ cristales | se desliza hacia un cultivo y lanza su clima (aviso: el halo gira y crece): seca la tierra o la congela (no crece hasta regarla) | mantener USAR cerca 1.2 s: se calma y deja **rocío de espíritu** (agua de la flor arcoíris) |

## Gran evento: Estación de Tormentas

Llega a las 9:00 del día siguiente a ganar la feria (o al volver a la granja). Las parcelas vacías se siembran con trigo comunal: todo cultivo queda «en riesgo» (2 de vida).

1. **Intro animada** (4.5 s, salteable con USAR): cielo gris, lluvia, cámara cinemática y el gran espíritu bajando.
2. **Fase 1 · Ráfagas:** 7 ráfagas (9 en Extremo). Cada una marca en rojo una fila o columna de surcos durante el tiempo de aviso; los surcos sin **lona** pierden 1 de vida. 6 lonas (8 en Fácil) que se ponen y se sacan.
3. **Fase 2 · Rayos y anegamiento** (cambio de reglas: el viento se lleva todas las lonas): anillos de aviso donde caerá un rayo (sobre cultivos o sobre vos: te aturde y quita energía); los **pararrayos** cargados absorben 3 rayos en 4.8 m; el agua sube y daña la fila baja salvo que abras las **2 compuertas**. 32 s.
4. **Fase 3 · El ojo de la tormenta:** el espíritu toca una melodía en 3 campanas (3/4/5 notas según dificultad); hay que repetirla. Error → ráfaga a una planta y se repite; cada 3 errores la melodía se acorta (nunca bloquea).
5. **Desenlace:** si sobrevive ≥ el % de la dificultad (40/50/55/60 %) → «¡Cosecha rescatada!», 40 + 15/cultivo 🪙 y la **🌀 Runa de tormenta**; el trigo comunal salvado queda para vos. Si no → pantalla «La tormenta ganó esta vez», se pierden las plantas dañadas y la tormenta vuelve en 2 días.

## Misiones (MLMissions, 3 principales + 4 secundarias, todas visibles)

| Tipo | Misión | Cómo |
|---|---|---|
| ★ | Restaurar la huerta | limpiar 6 parcelas y cosechar 4 cultivos (evento `huerta`, objetivo 10) |
| ★ | Completar la Feria de Cosechas | entregar 4 🥕, 5 🌾, 2 🎃 y 1 🥚 en la carpa (se habilita con la huerta restaurada) |
| ★ | Construir el invernadero mágico | 8 🪵, 4 💎, 200 🪙 y la 🌀 Runa de tormenta; se ve crecer por etapas |
| ◆ | Adoptar tres animales | gallina, oveja, cabrita |
| ◆ | Cultivar la flor arcoíris | semilla del santuario, regada sólo con rocío |
| ◆ | Reparar el molino | 6 🪵, 2 💎, 60 🪙 (las aspas vuelven a girar) |
| ◆ | Abastecer el almacén de Tomás | 10 productos (la estantería se llena) |

El progreso de campaña vive en el guardado del juego; al empezar cada sesión se sincroniza con MLMissions (sin repetir logros). Como MLMissions sigue una principal por partida, cuando la campaña cumple la principal en curso se la registra y se rota a la siguiente (`syncCampaign`). HUD propio (placa ★ MISIÓN) y diario 📖 con todo el detalle.

**Victoria:** feria + invernadero → pantalla de victoria con puntaje de granja (`MLArcade.ended({score})`), y se puede seguir cultivando. **Derrota (recuperable):** desmayo por energía 0 (−10 % monedas, día siguiente con 70 ⚡) o tormenta perdida.

## Dificultad (selector en el menú)

| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Crecimiento | ×1.3 | ×1 | ×0.85 | ×0.7 |
| Precios de venta | ×1.2 | ×1 | ×0.9 | ×0.8 |
| Intervalo de plagas/cuervos/espíritus | ×1.7 | ×1 | ×0.75 | ×0.55 |
| Rivales a la vez | 1 | 1 | 2 | 2 |
| Gasto de energía | ×0.7 | ×1 | ×1.2 | ×1.4 |
| Aviso de peligro (s) | 4.2 | 3.0 | 2.4 | 1.8 |
| Rescate mínimo en la tormenta | 40 % | 50 % | 55 % | 60 % |
| Lonas / ráfagas / notas | 8 / 7 / 3 | 6 / 7 / 4 | 6 / 7 / 4 | 6 / 9 / 5 |

## Calidad (`onQuality`)

| | Baja | Media | Alta |
|---|---|---|---|
| Pixel ratio máx. (Kit3D) | 1 | 1.5 | 2 |
| Sombras | no | no | sí (mapa 2048) |
| Niebla (cerca/lejos, m) | 26/58 | 34/85 | 45/120 |
| Vegetación instanciada (pasto, flores, helechos, hongos) | 35 % | 70 % | 100 % |
| Partículas / gotas de lluvia | 60 / 250 | 140 / 600 | 240 / 1100 |
| Nubes | no | sí | sí |

## Guardado

Clave única `granja_runas:save` con `createSave` (versión **2**): `{ v: 2, d: {...} }` con día, minuto, monedas, energía, escena y posición, inventario, semillas, herramientas, 12+6 parcelas, animales, decoración, molino, feria, invernadero, huerta, pedidos, stock, bosque, tormenta, banderas, estadísticas, tutorial, teclas y sensibilidad. JSON roto → se respalda en `granja_runas:save:corrupto` y se arranca de cero; JSON con forma rota → `sanitize()` repara campo por campo; v1 → `migrate()` (`money` → `coins`). Se guarda al amanecer, al cambiar de escenario, al cerrar paneles, cada 15 s y al salir. «Reiniciar partida» del menú de pausa = **reinicia el día desde el amanecer** (copia del amanecer); «Nueva granja» en el menú (con confirmación) es el reinicio limpio.

Gancho de pruebas: `window.__granja_runas` (sólo lectura: estado, escena, tiempo, jugadora, energía=`hp`, puntaje, inventario, parcelas, misiones, conteos, perf, tormenta, visuales). Con `?debug`: `goto`, `simulate`, `tp`, `face`, `set`, `act`, `growAll`, `setTime`, `newDay`, `spawn`, `startStorm`, `stormSkip`, `stormEnd`, `stormRing`, `stormSeq`, `faint`, `flush`.

## Pruebas

`ML_WORKERS=1 npx playwright test tests/e2e/granja_runas.spec.js` — 20 pruebas (la de diseño móvil se saltea en escritorio):
carga sin errores · arranque con entrada real + movimiento + tutorial (saltar/reabrir) · parcelas y regadera (+persistencia) · animales · estanterías/tienda/decoración · rivales (topo, cuervo, espíritu con USAR mantenido) · los 3 escenarios caminando por las salidas · bosque · rutinas de vecinos · misión principal + secundaria con persistencia · guardado corrupto/malformado/v1 · dificultad (tabla + crecimiento medido) · calidad (sombras, DPR, niebla, vegetación) · tormenta completa con entrada real (3 fases) · tormenta perdida · desmayo · victoria con paneles reales · pausa 1 s + reanudar + reiniciar · tocar/clic en el pozo (ir y usar) · controles táctiles y diseño 412×915 / 915×412 sin solapes ni scroll.

Resultados: ver «RESULTADOS» al final.

## Rendimiento

Ver «RESULTADOS» al final (SwiftShader por CPU en headless: sirve para comparar, no son FPS reales).

## Pendientes / NO PROBADO

- Falta `games/thumbs/granja_runas.webp` (no puedo tocar `games/thumbs`): dejé una captura en `games/granja_runas/thumb.webp` para copiar.
- No probado en dispositivos reales ni con gamepad físico (el mapa pasa por el SDK; en webdriver el gamepad está desactivado).
- El kit avisa por consola (warning) en Three 0.186 si usa `PCFSoftShadowMap` (ya corregido en kit3d según la coordinación).
- Las acciones propias del menú de pausa usan `kick()` (pausa+reanuda real) porque el SDK reanuda «en silencio» y el bucle del Kit3D queda detenido: conviene arreglarlo en `kit3d.js`/`arcade.js`.
- Balance de economía ajustado a mano; no hay sesiones largas medidas con jugadores reales (estimado 30–45 min para la victoria en Normal).

## RESULTADOS (medidos el 2026-10-10, Chromium headless + SwiftShader, `ML_WORKERS=1`)

### Pruebas

| Proyecto | Resultado |
|---|---|
| desktop (1280×800) | **19 pasan**, 1 omitida (diseño móvil, sólo celular) |
| mobile (Pixel 7) | **20 pasan** |

Corrida completa: 39 pasan, 1 omitida, 3.3 min. En corridas anteriores apareció una vez `net::ERR_NETWORK_CHANGED` al cargar Google Fonts (red del entorno, no del juego).

### Rendimiento

Menú (`node tests/perf/measure.mjs`): 1089 KB en 19 pedidos, DCL ~300 ms, load ~400–450 ms, heap 13 MB, 155 nodos DOM, 0 errores; 24 fps (media) / 22 fps (baja) en SwiftShader.

En juego (promedio de 3 s por escenario, gancho `perf`; en headless el DPR siempre es 1):

| Calidad | Escenario | Draw calls | Triángulos | Frame (ms) | Render JS (ms) | Update (ms) | Heap (MB) |
|---|---|---|---|---|---|---|---|
| media | granja | 41 | 41.0 k | 48.5 | 1.2 | 0.25 | 16.0 |
| media | mercado | 73 | 36.1 k | 66.0 | 1.4 | 0.35 | 16.0 |
| media | bosque | 38 | 38.8 k | 68.4 | 1.1 | 0.18 | 14.5 |
| baja | granja | 40 | 34.5 k | 48.1 | 1.2 | 0.20 | 16.5 |
| baja | mercado | 72 | 31.9 k | 64.3 | 1.4 | 0.32 | 16.1 |
| baja | bosque | 37 | 31.4 k | 63.9 | 1.3 | 0.21 | 14.5 |
| alta (sombras) | granja / mercado / bosque | 73 / 114 / 57 | 61 k / 52 k / 56 k | 65 / 92 / 88 | ≤2 | ≤0.5 | ~15 |

El costo de JS por cuadro es de ~1.5 ms; el resto es el rasterizado por CPU de SwiftShader. En el mercado los 4 vecinos animados suman ~20 draw calls (5 piezas cada uno).
