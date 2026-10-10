# Derby de Chatarra (`derby_chatarra`)

**Género:** demolición vehicular 3D · **Motor:** Three.js 0.186.1 (import map, módulos ES) + Kit3D · **Acento:** `#b8f52a` (verde tóxico de chatarrería sobre óxido, hormigón y neón)
**Archivos:** `derby_chatarra.html`, `games/derby_chatarra/*.js` (`main`, `config`, `models`, `entities`, `physics`, `arena`, `ai`, `boss`, `fx`, `sfx`, `ui`), `tests/e2e/derby_chatarra.spec.js`.
**Especificación:** `docs/specs/15_derby-chatarra.md`.

## Concepto
Un torneo de demolición en tres rondas. En cada ronda el jugador y cuatro rivales fijos (siempre los mismos pilotos,
con tabla de posiciones) se embisten en una arena durante un tiempo límite. Los **puntos de ronda** salen del daño causado
(×10), +500 por rival destruido, +200/+300 por descarrilar contenedores y derribar torres, saltos acrobáticos y un bono
final según la vida que te queda. El puesto en cada ronda da **puntos de torneo** (10/7/5/3/1). Para pasar de ronda hay que
quedar entre los 3 primeros; se gana el torneo siendo **1º en puntos de torneo al final de la Gran Final**, donde irrumpe el
**Triturador Omega**. A diferencia de Turbo Furia (carrera), acá no hay vueltas: es arena de choque con zonas de daño.

Todo el arte es procedimental (geometrías low-poly fusionadas con color por vértice, `InstancedMesh` para ruedas,
contenedores, cajas, público, edificios y partículas). No se usan GLB del paquete: el `auto_arcade.glb` no encajaba con
la silueta de chatarra ni con las abolladuras por vértice. Todo el audio se sintetiza con `createAudio().tone`.

## Controles
| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Acelerar | W / ↑ | botón ACEL (o aceleración automática) | RT / stick arriba |
| Frenar / marcha atrás | S / ↓ | botón FRENO | LT / stick abajo |
| Girar | A / D, ← / → | VOLANTE (izquierda) | stick / cruceta |
| Derrape (freno de mano) | Espacio* | FRENO + girar a velocidad | B |
| Nitro | Shift* | botón NITRO | A o RB |
| Usar potenciador | E* | botón PODER (se atenúa si la ranura está vacía) | X |
| Saltear cinemática | Espacio / Enter | tocar la pantalla o ACEL | A / X |
| Pausa | Esc / P | ⏸ de la barra | Start |

\* Re-asignables en **Controles y opciones** (menú y pausa), junto con sensibilidad de dirección, aceleración automática,
cámara cerca/lejos y movimiento reducido (Auto/Reducido/Completo: sin sacudidas ni destellos). El mapa completo (incluido
el gamepad) se muestra en esa pantalla y en «Cómo jugar». Sonido y calidad gráfica: menú del SDK (⚙/⏸).

## Vehículos (garaje del menú)
| Vehículo | Masa | Vida | Vel. máx. | Habilidad |
|---|---|---|---|---|
| Escarabajo | 1.0 | 100 | 26 m/s | Nitro rápido (+60 % de recarga) |
| Pisón | 1.6 | 135 | 23 m/s | Paragolpes reforzado: frente pega ×1,4 y recibe ×0,6 |
| Saeta | 0.75 | 80 | 29,5 m/s | Derrape cargado: derrapar llena el nitro |
| Mini-Omega (recompensa del jefe) | 1.9 | 150 | 24 m/s | Triturador: frente ×1,8 e inmune a imanes |

## Escenarios
1. **Depósito Industrial** (Ronda 1, Clasificatoria; rectángulo 92×68 m, hormigón): muralla de contenedores apilados,
   grúa pórtico, torres de iluminación, pilas de neumáticos. Dos **rampas** enfrentadas, dos **contenedores móviles** sobre
   rieles, un **interruptor** que sube la **barrera central** (cambia el circuito: corta el paso por el centro), tres torres de
   cajas, dos manchas de aceite (sin agarre) y cinco plataformas de potenciadores.
2. **Coliseo Desértico** (Ronda 2, Semifinal; círculo de 42 m, arena): muro de piedra, tribunas con público que festeja,
   columnas, **meseta central** de 2,4 m con dos rampas (subir, cruzarla y tirarse por el borde) y dos rampas que lanzan hacia
   la meseta. Dos **interruptores** controlan los **rastrillos** norte y sur, pozos de arena (frenan), tres torres de cajas.
3. **Arenas Neón** (Ronda 3, Gran Final; octógono nocturno de 40 m de apotema): piso de grilla neón, ciudad de fondo,
   dos rampas grandes, dos **cápsulas de carga móviles** (contenedores en riel), dos **interruptores** que suben **barreras
   eléctricas** (rebote fuerte, daño y aturdimiento; el jefe queda electrocutado), dos turbos en el piso, tres torres de
   cajas y el **portón** por donde entra el Triturador Omega.

Cada ronda se puede reintentar sin perder los puntos de torneo previos; nada queda bloqueado.

## Sistemas
- **Física arcade** (`physics.js`): motor/freno/marcha atrás, agarre lateral con derrape, nitro, turbo de piso, aceite y arena.
  El terreno es un campo de alturas (rampas en cuña y meseta): subir una rampa acumula velocidad vertical y al terminar el
  auto vuela; los paredones (costados de rampa, meseta) bloquean por eje. Colisiones contra límites (planos o círculo),
  cajas orientadas (contenedores —con su velocidad—, barreras) y círculos (columnas, torres, postes).
- **Choques entre autos**: impulso con masas (los destruidos pesan 40), restitución mayor con escudo. El **daño** depende
  de la velocidad de impacto, la relación de masas y las **zonas**: recibir de frente ×0,55, costado ×1,15, cola ×1,35;
  pegar con el frente ×1,25 (×1,3 con nitro), costado ×0,7, cola ×0,45. Tope 34 por golpe (80 contra el jefe).
- **Daño representado**: cada zona (frente/cola/izquierda/derecha) abolla de verdad la malla (desplaza vértices), el
  cuerpo se oscurece, pierde piezas (paragolpes, baúl, puertas), humea gris → negro y se prende fuego bajo 20 %, las ruedas
  bailan. El HUD muestra un **diagrama de daño** por zona (verde → rojo).
- **Potenciadores** (plataformas que reaparecen): 🔥 nitro (3,2 s, ×1,42 velocidad máxima), 🧲 imán (5,5 s, atrae autos a 17 m),
  🛡 escudo (5 s, anula daño y rebota), ✴ trampa (mina detrás: 18 de daño y lanza), 🔧 reparación (inmediata, +35 %, límite por
  ronda según dificultad). Los rivales también los agarran y usan.
- **Saltos acrobáticos**: salir de una rampa y pasar ≥0,7 s en el aire (+250 + 150/s); girar en el aire (>4,4 rad) suma
  «trompo aéreo» (+400).
- **Torneo y puntaje**: puntos de ronda → puesto → puntos de torneo. El puntaje del SDK (`MLArcade.ended({score})`) es la suma
  de puntos de ronda del torneo.
- **Cámara**: persecución con anticipación, FOV según velocidad y nitro, no atraviesa muros (se acerca y sube), encuadre
  más alto en vertical; en el jefe se aleja.

## Interacciones (estado de sesión)
El estado vive en `session[arena]` mientras la página está abierta: sobrevive a reiniciar o reintentar la ronda y a volver
del menú; «Nuevo torneo» lo limpia.
| Interacción | Detección | Indicación | Animación | Estado persistente |
|---|---|---|---|---|
| Rampas | campo de alturas (cuña) | franjas de peligro + luces de borde que titilan | luces que destellan al saltar | `used`, mejor tiempo en el aire; luces verdes encendidas |
| Contenedores móviles | caja orientada con velocidad | balizas naranjas que parpadean al moverse, rieles con franjas | deslizamiento con pausas en los extremos; al descarrilar se tuerce, se hunde y apaga balizas | `derailed` (embestida de frente ≥45 km/h) y posición |
| Interruptores de barreras | círculo de 2 m, sólo el jugador, con cooldown | botón rojo/verde + lámpara | botón que se hunde; barrera que sube/baja (0,55 s), eléctrica titila | barrera arriba/abajo |

## Rivales
| Rival | Silueta | Patrón | Contrajuego |
|---|---|---|---|
| 🏎 La Chispa (kart veloz) | kart abierto, piloto con casco, ruedas traseras grandes | busca costados/cola con anticipación, zigzaguea de lejos, esquiva tu frente, huye 2,2 s después de pegar | frenar de golpe o recibirla de frente: pesa 0,6 y tiene 60 de vida |
| 🐂 El Toro (camioneta ariete) | pickup con paragolpes tubular y cuernos | se planta, prende faros, toca bocina y marca un **carril rojo**; carga en línea recta 2 s con turbo | salirse del carril; si choca un muro queda **aturdido** 2,6 s (recibe ×1,25). Frente blindado ×0,4 |
| 🛸 Dr. Hélice (auto volador prototipo) | platillo con cabina y patas de levitación luminosas | levita sobre todo, cada 6–9 s sube y cae sobre una **sombra roja** que marca dónde vas a estar (onda de 4,8 m, 15 de daño) | salir de la sombra; al aterrizar apaga las patas y recarga 2,2 s: recibe ×1,5 |
| 🛡 Doña Tanque (camión blindado) | camión con placas remachadas y tanque naranja que late atrás | persecución lenta e imparable, empuja contra muros, retrocede si quedás detrás | rodearla y pegar el **tanque trasero** (×2,2); frente y costados ×0,35 |

## Triturador Omega (gran evento)
Se dispara en la Gran Final al terminar el tiempo o al quedar sin rivales: los rivales se retiran a las tribunas (sus
puntos quedan), se abre el portón y entra el camión monstruo (cinemática salteable, corta con movimiento reducido). Desde
ahí no hay reloj: la ronda termina cuando cae el jefe o cuando tu auto queda en cero.
- **Fase 1 · Escudo frontal**: los golpes de frente no le hacen nada (chispas azules). Persigue y cada tanto **telegrafía
  una carga** (carril rojo + bocina, aviso según dificultad) y embiste hasta chocar. Si choca contra muro o columna queda
  aturdido 3 s; contra una **barrera eléctrica** (interruptores) queda 4,2 s y pierde 40. Cola ×1,6, costados ×1 (×1,25 aturdido).
- **Fase 2 · Triturador** (≤55 %): estalla el escudo (2,4 s de transición invulnerable) y cambian las reglas: alterna
  **imán triturador** (anillos violetas 1 s, después te arrastra 2,6 s hacia la trituradora que muele 5 cada 0,35 s; el escudo y
  el Mini-Omega lo resisten), **salto sísmico** (círculo naranja en tu posición; cae, aplasta y lanza una **onda** que sólo daña
  a autos en el piso: alejarse o saltar con una rampa) y cargas con aviso más corto. Frente ×0,6, cola ×1,5.
- **Recompensa**: +3000 puntos de ronda, misión «Derrotá al Triturador Omega» y **desbloqueo permanente del Mini-Omega**.

## Misiones (MLMissions, 3 principales + 2 secundarias por ronda)
| Tipo | Misión | Evento | Meta |
|---|---|---|---|
| Principal | Ganá la clasificatoria (1º en la Ronda 1) | `qualifyWin` | 1 |
| Principal | Destruí cinco rivales (todo el torneo; se re-emite al continuar) | `wreck` | 5 |
| Principal | Derrotá al Triturador Omega | `omega` | 1 |
| Secundaria | Hacé tres saltos acrobáticos | `stunt` | 3 |
| Secundaria | Sobreviví sin reparación (ronda terminada en pie sin 🔧) | `noRepairRound` | 1 |
| Secundaria | Usá tres tipos de potenciador | `powerType` | 3 |
| Secundaria | Destruí dos torres de cajas | `tower` | 2 |

Cada ronda es una «partida» de MLMissions (`runStart` al empezar/reintentar, `runEnd` al terminar, abandonar o reiniciar);
las secundarias rotan priorizando las nunca completadas.

## Dificultad
| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Daño recibido | ×0,65 | ×1 | ×1,25 | ×1,5 |
| Agresión (probabilidad de que un rival te elija) | 30 % | 45 % | 60 % | 75 % |
| Velocidad rival | ×0,88 | ×1 | ×1,07 | ×1,14 |
| Vida rival | ×0,8 | ×1 | ×1,15 | ×1,3 |
| Vida del Omega | 450 | 600 | 750 | 900 |
| Aviso de carga (Omega y El Toro ×0,95) | 1,5 s | 1,15 s | 0,95 s | 0,75 s |
| Fuerza del imán triturador | 10 | 13 | 15 | 17 |
| Reaparición de potenciadores | 6 s | 8 s | 10 s | 12 s |
| Duración de ronda | 100 s | 90 s | 90 s | 80 s |
| Reparaciones por ronda | 3 | 2 | 1 | 0 |

Durante los primeros 6 s de cada ronda la agresión hacia el jugador se reduce (×0,35) para que el arranque no sea un
linchamiento.

## Calidad
| | Baja | Media | Alta |
|---|---|---|---|
| DPR máx. (Kit3D) | 1 | 1,5 | 2 |
| Sombras | no | no | sí (PCF 1024) |
| Partículas (dos pools) | 90 | 240 | 420 |
| Decoración instanciada (público, barriles, chatarra, dunas, ciudad) | 35 % | 70 % | 100 % |
| Anisotropía del piso neón | 1 | 2 | 4 |
| Niebla (cerca/lejos) | 45/120 | 70/190 | 90/260 |
| Plano lejano | 140 | 230 | 300 |
| Humo de autos dañados (cada) | 0,16 s | 0,08 s | 0,05 s |

## Guardado (`derby_chatarra:save`, versión 1, `createSave`)
`{ started, round(1–3), car, unlocked{omega}, tour{ pts{player,chispa,toro,helice,tanque}, places[], wrecks, score, qualified },
wins, bestScore, stats{stunts,towers,wrecks,rounds}, tutorial{off,seen{}}, opts{sens,autoGas,motion,cam,binds{nitro,power,drift}} }`.
Los puntos de torneo se confirman sólo al pasar de ronda (reintentar no descuenta nada). JSON corrupto → se descarta (copia
en `derby_chatarra:save:corrupto`) y se arranca de cero; forma inválida → `sanitize()` repara campo por campo (ronda, auto
bloqueado, puntos negativos, teclas inválidas…). Ganar el torneo lo reinicia y conserva victorias, récord, auto desbloqueado,
opciones y tutorial. Logros y dificultad: `ml:missions` / `ml:difficulty`; récord: `ml:scores`.

## Gancho de pruebas
`window.__derby_chatarra` (congelado, sólo lectura): `state, scene, arenaId, round, missions, player, hp, maxHp, score,
tourScore, timeLeft, runTime, simTime, countdown, paused, overlay, tip, big, rivals, stats, standings, result, boss,
interactions{ramps,containers,switches,barriers,towers,pads,mines}, counts, perf, quality, difficulty, save, session`.
Con `?debug` agrega `debug`: `goto, skipCountdown, simulate, teleport, place, setSpeed, setHP, hurt, rivalHP, give,
rivalState, freezeAI, god, wreck, setTime, setPoints, spawnBoss, skipCut, bossPhase, bossHit, bossCharge, bossAttack,
killBoss, toggleSwitch, endRound`.

## Pruebas (`tests/e2e/derby_chatarra.spec.js`, `ML_WORKERS=1`)
17 pruebas: carga sin errores (menú, crédito, garaje, dificultad, fondo 3D); arranque con entrada real + cuenta regresiva +
acelerar/girar/frenar (teclado; en celular botón ACEL y volante por toques CDP); tutorial (aparece, se salta, se reactiva desde
la ayuda de la pausa con la simulación en espera); **rampas** (salto con W real, luces, estado tras reiniciar); **contenedores**
(se mueven, embestida lenta no descarrila, rápida sí, quedan sólidos y descarrilados tras reiniciar); **interruptores** (pasar por
encima sube la barrera, bloquea, persiste y se vuelve a bajar); torres de cajas + los cuatro potenciadores con E/PODER (recoger
de plataforma, imán atrae, escudo anula, nitro supera la velocidad máxima, mina daña a un rival); **rivales** (telegrafía y carga
del ariete, salto/recarga del volador, ariete aturdido contra el muro, cola del blindado ≥2,5× el frente); tres escenarios
(no clasificar → reintentar, clasificar → avanzar con clic/toque real hasta la Gran Final, puntos de torneo); **Triturador Omega**
completo (intro salteada con entrada real, escudo frontal, carga contra barrera eléctrica activada pasando por el interruptor,
golpe en la cola aturdido, fase 2 con imán y salto sísmico, recompensa, campeón, récord, Mini-Omega en el garaje); misión
principal (clasificatoria) + secundaria (saltos) y persistencia tras recargar, con «destruí cinco» recuperado en 4/5; derrota y
reintento limpio; pausa congela 1 s / reanuda / reiniciar; guardado corrupto y con forma inválida; dificultad; calidad;
celular 412×915 y 915×412 sin superposición ni scroll + botones PODER y NITRO.

**Resultados reales (2026-10-10, `ML_WORKERS=1`):**
- desktop: 16 passed, 1 skipped (la de celular).
- mobile (Pixel 7): 16 passed, 1 skipped (IA de rivales: idéntica a escritorio y cubierta ahí).
- Sin errores de consola en ninguna prueba.

Además (script manual, no en la suite): 10 reinicios desde la pausa sin loops duplicados de rAF ni crecimiento de heap
(5,49 → 5,78 MB).

## Rendimiento (Chromium headless + SwiftShader, 1280×800; sirve para comparar, no son FPS reales)
Medido con la máquina cargada (load average ≈16 por otros procesos), así que hay mucho ruido entre corridas.
`node tests/perf/measure.mjs` (menú): automática → 18,7 fps, peor cuadro 167 ms, heap 8,5 MB, 1069 KB, 23 requests, 0 errores;
`ML_QUALITY=low` → 16,3 fps, peor 200 ms, heap 9,0 MB; `ML_QUALITY=medium` → 14,3 fps, peor 283 ms, heap 7,8 MB.

En partida (gancho `perf`, promedio de 40 cuadros, IA activa, jugador invulnerable):
| Calidad | Arena | ms/cuadro | draw calls | triángulos | update ms | render CPU ms | heap MB |
|---|---|---|---|---|---|---|---|
| Media | Depósito | 60,0 | 33 | 31k | 0,97 | 3,8 | 11,0 |
| Media | Coliseo | 77,1 | 34 | 33k | 0,55 | 1,1 | 15,7 |
| Media | Neón (jefe) | 135–163 | 34 | 13k | 0,8–1,1 | 1,3 | 13,8–16,1 |
| Baja | Depósito | 57,1 | 27 | 29k | 0,78 | 3,4 | 12,4 |
| Baja | Coliseo | 104,6* | 33 | 24k | 0,97 | 1,4 | 14,5 |
| Baja | Neón (jefe) | 125–148 | 34 | 12k | 0,76–0,84 | 1,4 | 10,7–20 |

\* ruido de la máquina (Baja nunca cuesta más que Media en GPU real). La CPU del juego (física + IA + armado del render) es
~1–4 ms por cuadro; el resto es el rasterizado por software de SwiftShader (el piso neón texturizado y a pantalla completa es lo
más caro). Degradación para hardware inferior: Baja quita sombras, 65 % de la decoración, 80 % de partículas, baja la anisotropía,
DPR 1 y acorta la niebla y el plano lejano.

## Pendiente / NO PROBADO
- NO PROBADO en GPU real ni en un teléfono físico (sólo Chromium headless con SwiftShader y emulación Pixel 7).
- NO PROBADO con un gamepad físico (el SDK ignora mandos en navegadores automatizados); el mapa está declarado y documentado.
- Falta la portada `games/thumbs/derby_chatarra.webp` y la entrada en `games/registry.js` (archivos compartidos: los agrega
  el integrador). Sin la entrada del registro, la ayuda por defecto del SDK y el portal no conocen el juego (el juego pasa su propia
  ayuda a `createGame`, así que funciona igual).
- El sonido del motor es una secuencia de pulsos cortos (createAudio no ofrece osciladores sostenidos); suena «a chatarra», a
  propósito, pero no es un motor continuo.
- Balance: probado con partidas simuladas de IA contra IA; no hubo sesiones largas de juego humano de 15–30 min.
