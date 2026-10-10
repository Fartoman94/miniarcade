# Academia de Dragones

Juego 16 de MiniArcade (spec `docs/specs/16_academia-dragones.md`). Aventura aérea 3D: volás un dragón por tres regiones, superás las pruebas de la academia, rescatás crías y la defendés de la Serpiente de Tormenta.

- **Archivos:** `academia_dragones.html` (HTML, HUD, CSS) y módulos ES en `games/academia_dragones/`:
  `config.js` (datos de diseño), `models.js` (modelos low-poly procedurales), `world.js` (regiones), `fx.js` (partículas y sonidos), `enemies.js` (rivales), `boss.js` (jefe), `main.js` (estados, vuelo, cámara, lógica, UI, ganchos).
- **Tecnología:** Three.js 0.186.1 local por import map, `matelabs/kit3d.js`, `arcade.js` (MLArcade), `missions.js` (MLMissions), `intro.js`. Sin assets externos: todo modelo, textura (lava, puntos) y sonido se genera en código. No se usaron los GLB del paquete (no encajaban con la estética).
- **Acento:** `#ff9f43` (ámbar de dragón).

## Concepto y bucle

Campaña de academia en 4 tramos encadenados por portales dorados:

1. **Picos Nubosos** — 5 marcadores de entrenamiento + circuito de 12 aros → *graduado*.
2. **Lago de Espejos** — Carrera de los Espejos contra Nube (dragón rival) por 13 aros y 3 arcos de piedra.
3. **Volcán Dormido** — Rescate: 3 crías en nidos entre géiseres y autómatas; cada cría debe llegar a la posada antes de que «se asuste con el calor».
4. **Academia en tormenta** (Picos Nubosos de noche, con lluvia) — Serpiente de Tormenta en 3 fases.

En cada región además hay huevos dorados (1 por región → con los 3 nace **Ascua**, el tercer dragón), un huevo brillante escondido en el lago, nidos con crías, posadas flotantes (puntos de control), rivales y corrientes ascendentes. Una flecha dorada sobre el dragón apunta siempre al objetivo actual.

**Derrota:** quedarse sin energía o caer al «suelo letal» (mar de nubes, agua, lava) cuesta una vida y reaparecés en el último punto de control (posada activada o inicio de la región). Sin vidas → pantalla de derrota con «Reintentar» (misma región; la campaña queda guardada) y «Menú». En el jefe también se pierde si la integridad de la academia llega a 0.
**Victoria:** derrotar a la Serpiente de Tormenta → secuencia final y pantalla de victoria con puntos, récord y misiones.

## Controles

| Acción | Teclado/ratón | Táctil | Gamepad |
|---|---|---|---|
| Girar | A/D · ←/→ | joystick izquierdo | stick / cruceta |
| Morro arriba/abajo | W/S · ↑/↓ (se nivela solo al soltar) | joystick arriba/abajo | stick |
| Subir / bajar | Espacio o E / C o Q | botones ▲ / ▼ | A / B (y LB) |
| Turbo | Shift o K | ⚡ | RB / LT |
| Aliento | F, J o clic izquierdo | 🔥 | X / Y / RT |
| Pausa | Esc o P | ⏸ de la barra | Start |

- **Nivelación automática** siempre (más rápida con asistencia).
- **Asistencia de vuelo** (Ajustes: Automática = sólo táctil / Siempre / Nunca): nivela antes, evita el suelo, imán suave hacia el objetivo que está adelante (aros, marcadores) y curva el aliento hacia el blanco.
- Siempre activa: si te acercás al suelo bajando, el dragón levanta el morro solo y aparece «¡SUBÍ!».
- **Ajustes:** sensibilidad (0,5–1,6), invertir eje vertical, asistencia, sacudidas de cámara (desactivadas con `prefers-reduced-motion`). El mapa de controles se ve en Ajustes y en la ayuda de pausa. Calidad y sonido desde el ⚙ del SDK.
- Cámara de persecución suavizada; en vertical se aleja y abre el FOV. Movimiento reducido: sin sacudidas ni destellos (la viñeta de daño es fija y el relámpago no ilumina la escena).

## Escenarios

| Región | Look | Objetivo | Interactivos | Peligros |
|---|---|---|---|---|
| Picos Nubosos | cielo celeste, picos nevados, islas flotantes con pinos, mar de nubes | entrenamiento + circuito de aros | 5 marcadores, 12 aros, 1 huevo, 1 nido (cabrita alada), 1 posada, 3 corrientes ascendentes, portal | 34 peñascos flotantes, 10 islas, academia, 5 murciélagos |
| Lago de Espejos | atardecer rosado, lago espejo (Reflector real en calidad alta), cristales, arcos | carrera contra Nube | 13 aros, 3 arcos, huevo dorado, huevo brillante (anillo de cristales), nido (grifito), posada, portal | cristales, rocas, 3 arpías, 2 murciélagos |
| Volcán Dormido | cielo rojo, cono volcánico, ríos y mar de lava animada, brasas | rescate de 3 crías | 3 nidos (zorritos de brasa), huevo en el cráter, posada, 7 géiseres, portal | columnas de roca, peñascos, 4 autómatas, 2 murciélagos, 1 arpía, lava |
| Academia en tormenta | noche, lluvia, nubes oscuras | vencer a la Serpiente | aros de calma (fase 2+) | rayos, orbes, embestidas |

## Sistemas

- **Vuelo:** velocidad crucero 30 × velocidad del dragón; turbo ×1,6 (−9 energía/s); picar acelera y trepar frena; corrientes ascendentes empujan hacia arriba y recargan ×2,8.
- **Energía** (= vida): máximo 100 × resistencia del dragón; se recarga planeando (3,2/s × dificultad), al máximo en posadas. Aliento −2,5. Daño recibido ÷ resistencia × dificultad. Chocar peñascos/laderas: rebote + daño.
- **Dragones:** Brisa (viento: rápida, aliento doble; ×2 contra murciélagos), Musgo (tierra: resistente; su bala de piedra perfora la coraza del autómata, ×2), Ascua (fuego: equilibrada, ×2 contra arpías, ×1,4 contra la serpiente; desbloqueable).
- **Entrenamientos, carreras y rescates:** ver Escenarios. Aros: hay que atravesarlos en orden (detección por cruce del plano dentro del radio); pasar cerca sin entrar suena a error y corta la racha.
- **Puntaje:** aro 50 + racha, marcador 120, huevo 250, brillante 600, rescate 300, posada 80, rivales 100/160/200, prueba 1000 + bono de tiempo, orbe 60, punto débil 100/150, jefe 5000 + 500 por vida + 20 por % de academia.

## Interacciones (colisión, indicación, animación, estado y prueba)

| Interacción | Detección | Indicación | Animación | Estado | Prueba |
|---|---|---|---|---|---|
| Nidos | esfera r=12 | columna de luz verde + flecha | la cría salta al lomo del dragón | sesión: `nest → carried → delivered` (sobrevive al cambio de región; vuelve al nido si caés o se asusta) | «huevos, nidos y posadas» |
| Posadas flotantes | esfera r=26 | farol gris → dorado, aro giratorio | bandera, aro, partículas | sesión: activa = punto de control; entrega de crías, energía llena | ídem + derrota/reaparición |
| Marcadores de entrenamiento | cilindro r=9,5 (+ condición: pasar, altura, picada, turbo, aliento al farol) | columna azul/dorada/verde, anillo de altura, farol | estallido, cambio de color, faroles | **persistente** (`campaign.markers`) | «marcadores de entrenamiento» |
| Huevos | esfera r=8 | halo dorado / rosado | flotan y giran | dorados **persistentes** (`eggs`); brillante por sesión | «huevos…», «misiones» |

## Rivales

| Rival | Silueta | Patrón | Contrajuego |
|---|---|---|---|
| Murciélago sombrío | pequeño, alas membranosas violetas, ojos | orbita su percha; al acercarte chilla y sus ojos se ponen rojos (0,85 s × tele) y se tira en picada recta hacia tu posición prevista | salirte de la línea después del aviso; 1 soplo de Brisa |
| Arpía aérea | humanoide alado púrpura con cresta | te acecha arriba y atrás; abre las alas con aura rosa (1 s) y lanza un abanico de 5 plumas | golpearla durante el aviso la aturde y cancela el disparo; esquivar en lateral |
| Autómata volador | octaedro de bronce con anillo giratorio y ojo | patrulla; apunta con un láser rojo que se fija 0,35 s antes de disparar un rayo | moverse del láser fijado; blindado salvo recalentado (ojo naranja, 2,8 s) o contra Musgo |

Los rivales derrotados reaparecen a los 30 s si estás lejos. Cantidad × dificultad.

## Jefe: Serpiente de Tormenta

- **Intro** (5 s, saltable con Espacio/toque): se levanta del mar de nubes rodeando la academia; cámara cinemática y cartel.
- **Fase 1 — Tormenta (100–60 %):** cada ~5,5 s, 5 columnas rojas marcan dónde caerán rayos (1,55 s × tele). Lanza orbes violetas lentos hacia la academia (reventarlos con el aliento o atravesarlos). Tras 2 andanadas se agota: 3 **escamas doradas** expuestas 6,5 s (ventana de vulnerabilidad; cuerpo y cabeza blindados).
- **Fase 2 — Ojo del ciclón (60–25 %):** el viento te arrastra hacia la academia; embestidas telegrafiadas con línea punteada (1,7 s) a 88 u/s; después queda **aturdida** 3,6 s (cabeza vulnerable, máx. 3 golpes). Aparecen 3 **aros de calma**: +30 energía y aliento cargado (×3).
- **Fase 3 — Furia (<25 %):** rayos más rápidos (4 columnas, 1,2 s), orbes cada 7 s y embestidas alternadas.
- **Recompensa:** cielo despejado, fuegos de partículas, +5000 y bonos, título de Guardián, `bossDefeated` y misión «Proteger la academia».

## Misiones (MLMissions)

| ID | Tipo | Título | Evento / objetivo |
|---|---|---|---|
| graduarse | principal | Graduarse de aprendiz | `graduate` ×1 (5 marcadores + circuito) |
| tres_pruebas | principal | Dominar tres pruebas aéreas | `trials` máx. 3 (se emite el total guardado al empezar cada partida) |
| proteger | principal | Proteger la academia de tormenta | `bossDefeated` ×1 |
| huevo_brillante | secundaria | Encontrar huevo brillante | `shinyEgg` |
| rescatar_dos | secundaria | Rescatar dos criaturas | `rescue` ×2 |
| sin_roca | secundaria | Superar circuito sin tocar roca | `cleanCircuit` (circuito o carrera sin choques) |
| tercer_dragon | secundaria | Desbloquear tercer dragón | `dragon3` (3 huevos dorados) |
| cazador | secundaria | Espantar 6 rivales | `enemy` ×6 |

Por partida: la principal pendiente + 2 secundarias (rotación del SDK). El HUD propio muestra las tres en píldoras; el detalle está en la pausa.

## Dificultad

| | Vidas | Daño recibido | Rivales | Vida del jefe | Recarga | Radio de aros | Velocidad de Nube | Calor de crías | Telegrafías |
|---|---|---|---|---|---|---|---|---|---|
| Fácil | 5 | ×0,6 | ×0,6 | ×0,75 | ×1,4 | ×1,3 | ×0,82 | ×1,4 | ×1,3 |
| Normal | 3 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 |
| Difícil | 3 | ×1,3 | ×1,3 | ×1,25 | ×0,85 | ×0,9 | ×1,08 | ×0,85 | ×0,85 |
| Extremo | 2 | ×1,6 | ×1,6 | ×1,5 | ×0,7 | ×0,8 | ×1,15 | ×0,7 | ×0,72 |

## Calidad

| | Distancia de dibujo | Niebla | Nubes instanciadas | Partículas | Ambiente | Sombras | Lago | Terreno |
|---|---|---|---|---|---|---|---|---|
| Baja | 340 | ×0,75 | 36 | 140 | 120 | no | brillo PMREM | 96² |
| Media | 520 | ×1 | 80 | 300 | 260 | no | brillo PMREM | 128² |
| Alta | 700 | ×1,25 | 140 | 520 | 420 | sí (sol que sigue al jugador) | espejo real (Reflector 512²) | 160² |

El DPR lo limita Kit3D (1 / 1,5 / 2). El terreno usa la resolución de la calidad vigente al cargar la región.

## Guardado

Clave `academia_dragones:save` (Kit3D `createSave`, versión 1):

```json
{ "v": 1, "d": { "campaign": { "markers": [0,1,2,3,4], "graduated": true, "courseDone": true, "raceDone": false, "rescueDone": false, "region": "picos" },
  "eggs": ["picos"], "dragon3": false, "bossDefeated": false, "best": 0, "wins": 0, "dragon": "brisa", "tutorial": true,
  "bestCourse": 0, "bestRace": 0, "settings": { "sens": 1, "invert": false, "assist": "auto", "shake": true } } }
```

- JSON roto → se guarda copia en `academia_dragones:save:corrupto` y se arranca de cero.
- Tipos inválidos → `sanitizeSave()` normaliza cada campo (marcadores consecutivos, huevos válidos, Ascua sólo si está desbloqueada, ajustes acotados) y repara incoherencias (graduado ⇒ marcadores y circuito hechos). Nunca hay bloqueo irreversible: «Regiones» deja rejugar todo lo desbloqueado y «Continuar» va a la región más avanzada.
- Estado de sesión (por partida): nidos, posadas, huevo brillante, carrera. Récord en `ml:scores` (MLArcade) y `best`.

## Ganchos de prueba

`window.__academia_dragones` (sólo lectura, congelado): `state`, `scene`, `missions`, `player` (pos, yaw, pitch, velocidad, energía, dragón, crías), `hp`, `lives`, `score`, `difficulty`, `quality` (far, DPR, sombras, nubes, partículas, espejo), `counts` (rivales, plumas, aros, marcadores, proyectiles, partículas, obstáculos, nidos, posadas, huevos, géiseres), `run`, `boss`, `save`, `perf` (de `createGame().perf` + heap), `paused`, `simTime`.
Con `?debug`: `simulate(s)`, `goto(region)`, `teleport`, `toNextRing`, `toMarker`, `completeMarkers`, `completeTrial`, `toPos(egg|shiny|nest|inn|portal|geyser)`, `setEnergy`, `setInvuln`, `hurt`, `kill`, `setLives`, `spawnBoss`, `skipIntro`, `hitBoss`, `setAcademy`/`damageAcademy`, `rival(u)`, `enemies()`, `enemyAhead(kind)`, `forceEnemy`, `fire`, `addScore`.

**Arranque con entrada real desde el menú:** `await p.keyboard.press('Enter')` (el foco inicial está en «Volar»; en táctil, tocar `#adStart`).

## Pruebas

`tests/e2e/academia_dragones.spec.js` — 19 casos (algunos sólo escritorio o sólo celular). `ML_WORKERS=1 npx playwright test tests/e2e/academia_dragones.spec.js`, 2026-10-10, con la máquina muy cargada (load ~40 por otros agentes):

| Proyecto | Resultado |
|---|---|
| desktop | 16 pasaron, 3 omitidos (táctil y diseño celular) |
| mobile (Pixel 7) | 18 pasaron, 1 omitido (teclado) |

Cubre: carga sin errores; arranque con Enter / toque; tutorial (visible, saltable, se reabre desde la pausa); vuelo con teclado (giro, ascenso, nivelación automática, turbo, aliento); táctil (joystick por CDP touch, ▲, 🔥); los 5 tipos de marcador; aros en orden y graduación; huevos, nidos, posadas y persistencia de sesión entre regiones; murciélago derribado, autómata blindado/recalentado y fijación de blanco; géiser (aviso → erupción → daño); las 4 escenas y viaje por portal; carrera (largada, rival avanza, rival gana → reinicio); misión principal + secundaria y persistencia tras recargar; guardado corrupto (JSON roto y tipos inválidos); dificultad (vidas/daño/jefe); calidad (far, nubes, partículas, sombras, espejo); jefe fases 1→2→3 y victoria; derrota y reintento; pausa congela 1 s, reanudar y reiniciar; celular 412×915 y 915×412 sin scroll ni superposición (HUD, tutorial, barra, joystick, botones).

## Rendimiento

Medido en esta máquina con SwiftShader (render por CPU) y carga alta de otros procesos: los FPS **no** son representativos de un dispositivo; sirven los draw calls, triángulos y ms de JS.

- `node tests/perf/measure.mjs` (menú, 1280×800): media → fps 2,6, heap 9,1 MB, carga 1288 ms, 19 pedidos / 1047 KB, 0 errores; baja → fps 3,1, heap 7,6 MB. (Referencia en la misma corrida: turbo_furia 8,9 fps, valle_encantado 4,2 fps.)
- En juego (promedio 4 s, gancho `perf`):

| Calidad | Región | Draw calls | Triángulos | update ms | render (JS) ms | Heap MB |
|---|---|---|---|---|---|---|
| media | Picos | 53 | 60,8 k | 0,92 | 2,87 | 21,6 |
| media | Lago | 55 | 65,1 k | 0,72 | 1,76 | 13,3 |
| media | Volcán | 46 | 49,2 k | 2,62 | 3,04 | 10,2 |
| media | Tormenta | 33 | 63,6 k | 0,79 | 3,38 | 12,3 |
| baja | Picos | 49 | 40,5 k | 0,52 | 2,40 | 10,5 |
| baja | Lago | 37 | 41,5 k | 0,74 | 3,24 | 10,7 |
| baja | Volcán | 31 | 28,0 k | 0,64 | 6,63 | 10,7 |
| baja | Tormenta | 30 | 43,2 k | 0,79 | 3,20 | 14,1 |
| alta | Lago (espejo) | 55 | 91,6 k | 0,41 | 4,76 | 12,2 |

Técnicas: repeticiones instanciadas (nubes, peñascos, islas, pinos, cristales, columnas, cuerpo de la serpiente), modelos fusionados con colores por vértice, partículas y proyectiles en pool (1 draw call), temporales reutilizados, HUD a 10 Hz con escrituras sólo si cambia, regiones liberadas al cambiar (geometrías, materiales, texturas, PMREM, Reflector).

## Pendiente / NO PROBADO

- **NO PROBADO** en dispositivos reales (celular/tablet) ni con gamepad físico (el mapa se probó sólo por lectura; las pruebas ocultan los gamepads).
- FPS reales sin medir (sólo SwiftShader bajo carga).
- Falta la miniatura `games/thumbs/academia_dragones.webp` y la entrada en `games/registry.js` (archivos compartidos; ver informe).
- No hay remapeo de teclas libre: el mapa es fijo con alternativas (WASD/flechas, E/Espacio, Q/C, Shift/K, F/J/clic) más sensibilidad, inversión y asistencia configurables.
- Kit3D avisa en consola (warning, no error) que `PCFSoftShadowMap` fue reemplazado por `PCFShadowMap` en Three 0.186.
- El import map del brief usaba rutas sin `./` (`vendor/...`), que el navegador rechaza como «bare specifier»; se usó `./vendor/...`.
