# Mareas Profundas

**id:** `mareas_profundas` · **archivo:** `mareas_profundas.html` · **código:** `games/mareas_profundas/*.js` · **pruebas:** `tests/e2e/mareas_profundas.spec.js`
**Tecnología:** Three.js 0.186.1 (import map), MateLabs Kit3D, MLArcade, MLMissions. Acento `#ffb547` (ámbar de los focos del submarino sobre el azul del mar).
**Spec:** `docs/specs/17_mareas-profundas.md`.

## Concepto

Exploración submarina 3D pausada con tensión ambiental. Piloteás un minisubmarino desde un barco de apoyo, bajando por tres zonas cada vez más profundas y oscuras: gestionás **energía, casco, oxígeno y presión**, usás el **sonar** para encontrar cosas y espantar rivales, escaneás y fotografiás fauna, activás sondas, empujás escombros, abrís puertas hidráulicas, recuperás una caja negra y, en el fondo de la fosa, encendés el faro… lo que despierta al **Leviatán Abisal**. No se dispara nunca: el evento final es de evasión y de apagado de un reactor. Victoria: faro encendido y volver a la superficie junto al barco.

## Controles

| Acción | Teclado/ratón | Táctil | Mando |
|---|---|---|---|
| Avanzar / retroceder | W/S o ↑/↓ | joystick (eje vertical) | stick / cruceta |
| Girar | A/D o ←/→ | joystick (eje horizontal) | stick / cruceta |
| Subir / bajar | Espacio / Shift (reasignables) | SUBIR / BAJAR | RB / LB |
| Usar (sondas, válvulas, carga, módulos, puertas) · mantener = escanear | E | USAR | A |
| Sonar | Q | SONAR | B |
| Foto | C | FOTO | X |
| Focos on/off | L | LUZ | Y |
| Mirar alrededor | arrastrar el mouse | arrastrar el dedo | — |
| Pausa | Esc / P | botón ⏸ | Start |

Todas las teclas de acción se reasignan en **Controles y opciones** (menú o pausa), junto con sensibilidad de cámara, invertir eje vertical y movimiento reducido (sin sacudidas ni destellos; también respeta `prefers-reduced-motion`). Mute y calidad gráfica desde la barra del SDK. En celular, 6 botones de 64 px en dos filas a la derecha y joystick a la izquierda, sin tapar el HUD.

## Escenarios

1. **Arrecifes Bioluminiscentes** (0–46 m): superficie con barco de apoyo, corales instanciados con puntas que brillan, cardúmenes, medusas, manta, tortuga. Objetivo: activar las **3 sondas científicas** que abren la **puerta acuática** (escotilla de iris en el fondo). Módulo de buceo junto al barco. Cámara de piedra oculta detrás de una losa (ruina oculta).
2. **Ciudad Sumergida** (60–118 m): ciudad en una caverna con bóveda de roca, edificios con ventanas iluminadas, murallas de contención con **puertas hidráulicas**, avión hundido, callejón de columnas con la **cápsula de escape**, módulo de buceo en la plaza, drones y anguilas. Objetivo: abrir las dos puertas (la segunda tiene el panel tapado por **escombros**), recuperar la **caja negra** y entregarla en el módulo: su código abre la puerta a la fosa.
3. **Fosa Silenciosa** (140–240 m): oscuridad casi total, agujas de roca, un pozo cónico con gusanos tubícolas bioluminiscentes, rapes abisales, el **pulpo territorial** en una repisa y el **faro** en el fondo. Al encenderlo empieza el evento del Leviatán. Al terminar, una **corriente ascendente** te devuelve a los Arrecifes para el ascenso final.

Las zonas se conectan por puertas acuáticas en ambos sentidos (no hay bloqueos irreversibles: siempre se puede volver).

## Sistemas

- **Energía** (batería): base + motor + vertical + focos (+ sonar 3 % y foto 1 %). Se recarga en módulos y con **células de energía** (16 repartidas). Con 0 → derrota.
- **Casco**: choques (daño = (velocidad de impacto − 3,2) × 7 × multiplicador), criaturas, el Leviatán y **presión**. Con 0 → derrota.
- **Oxígeno**: baja con el tiempo; se recarga en la superficie y en los módulos. Con O₂ en 0 la batería alimenta la electrólisis (−1,5 %/s) → termina en derrota por energía.
- **Presión**: límite del casco 80 m → 150 m al acoplar en el módulo del arrecife → 300 m al acoplar en el de la ciudad. Pasarlo daña el casco en proporción al exceso, con crujidos, sacudida y aviso.
- **Sonar**: pulso esférico con borde fresnel que se expande a 34 m/s hasta 48 m; cuando el frente alcanza un objeto, aparece un marcador de eco siempre visible y un punto en el **radar** (canvas, frente hacia arriba, flecha al objetivo). Aturde drones, espanta anguilas, revela las barras de control del jefe (y atrae su mordida).
- **Escaneo**: mantener USAR con una especie nueva dentro de un cono frontal (≈30°, ≤18 m) → retícula con progreso (1,1 s).
- **Foto**: flash; registra las especies en cuadro (proyección a pantalla) y a ≤24 m; ahuyenta al pulpo y a los rapes.
- **Módulos de buceo**: acoplar (USAR) = recarga, reparación, punto de control, mejora de presión y entrega de carga. Se suelta moviéndose o con USAR.
- **Luz**: los focos (SpotLight + cono volumétrico falso) gastan energía, atraen medusas, rapes y al Leviatán en la fase 2, y duplican el rango de detección de los drones.

## Interacciones (todas con estado persistente y prueba propia)

| Interacción | Detección | Indicación | Animación | Persistencia |
|---|---|---|---|---|
| Sondas científicas (3) | proximidad 3D | aviso «Activar sonda científica», luz ámbar parpadeante, eco de sonar | se despliega el mástil, gira la antena, ondas cian | `save.probes` |
| Escombros movibles (2) | colisión esfera-caja con etiqueta `debris:*` | aviso «Empujá los escombros con el casco», eco ámbar | se desliza por su eje, tiembla, levanta sedimento | `save.debris` (desplazamiento) |
| Puertas hidráulicas (2) | proximidad al panel; bloqueo por escombros | aviso, luz roja/verde | la válvula gira, la puerta sube 2,4 s con burbujas, el colisionador se apaga | `save.doors` |
| Caja negra / cápsula | proximidad | aviso, baliza titilante | cuelga bajo el submarino, se entrega al acoplar | `save.blackbox` / `save.capsule` |
| Puertas acuáticas (4) | proximidad | aviso o motivo del bloqueo | iris que se abre, resplandor, burbujas | derivado de sondas / caja negra |

## Rivales

| Rival | Silueta | Patrón | Contrajuego |
|---|---|---|---|
| Medusa eléctrica | campana translúcida rosada con tentáculos (instanciada) | deriva y la atrae tu luz; a <5,5 m se **carga** (brillo + chisporroteo) y descarga en 4,4 m (casco y batería) | alejarse al ver el brillo; apagar la luz |
| Anguila guardiana | cuerpo segmentado que asoma de un caño | ojos rojos (aviso 0,75 s) → embestida recta de 15 m → se retrae | no cruzar su carril o **sonar** (se esconde 6 s) |
| Dron submarino | caja con reflector cónico y ojo | patrulla; si te ve (cono, rango 17 m / 8,5 m sin luz, línea de visión) → alerta con pitidos → persecución y embestida | cortar la línea de visión, apagar la luz, **sonar** (aturdido 3,5 s) |
| Pulpo territorial | manto grande con 8 tentáculos animados | en su territorio (14 m) se pone rojo, marca un **círculo rojo** donde estás y golpea; de cerca suelta **tinta** (pantalla oscura y empujón) | salir del territorio o **foto** (el flash lo ahuyenta 8 s) |
| Rape abisal (ambiente) | pez oscuro con señuelo luminoso | se acerca a tu luz y muerde | apagar la luz, alejarse |

## Jefe: Leviatán Abisal

Intro cinemática (salteable): el faro titila, el Leviatán (cabeza con mandíbulas, 26 segmentos instanciados que siguen un rastro, manchas y ojos bioluminiscentes y una luz propia) sube en espiral desde la oscuridad y ruge.

1. **Embestidas**: rodea el pozo y, cada 4,2 s, marca un **carril rojo** hacia tu posición durante 1,25 s y embiste a 34 m/s (22 de daño). Mientras tanto hay que **cerrar 3 válvulas de refrigeración** en los pilares: se activan con USAR y avanzan mientras estés cerca (2,8 s cada una).
2. **Caza a ciegas** (cambio de reglas): se apaga todo (niebla más densa, viñeta oscura). El Leviatán caza **por sonido y luz**: cada pulso de sonar revela las **barras de control** escondidas, pero el Leviatán marca una **columna roja** en el punto del pulso y muerde desde abajo; con la luz encendida te encuentra solo. Hay que hacer ping, alejarse, recoger cada barra (USAR) e insertarla en la consola (si te muerde, la soltás).
3. **Apagado del reactor**: el núcleo sube. Iniciás la secuencia en la consola y avanza mientras estés a <7,5 m. El Leviatán azota con la cola: una **banda de profundidad** (baja o alta) se ilumina 1,3 s y después la barre una onda expansiva; hay que cambiar de altura con SUBIR/BAJAR.

**Recompensa**: el Leviatán se calma y se va, el faro se enciende (haz de luz visible), misión principal 3 cumplida, +2000 puntos, se abre la corriente ascendente; tras la victoria el submarino queda con casco dorado. Si perdés durante el combate, reintentás en la **fase alcanzada** (no se repite lo superado).

## Misiones (MLMissions: 3 principales por partida + 4 secundarias)

| id | Tipo | Misión | Evento |
|---|---|---|---|
| `fauna` | principal | Escaneá fauna (4 especies) | `scan` |
| `caja` | principal | Recuperá la caja negra | `blackbox` |
| `faro` | principal | Activá el faro de la fosa | `faro` |
| `fotos` | secundaria | Fotografiá cinco especies | `photo` |
| `ruina` | secundaria | Encontrá la ruina oculta | `ruin` |
| `capsula` | secundaria | Recuperá la cápsula sin chocar (falla con `capsuleCrash`) | `capsule` |
| `bateria` | secundaria | Salí con 30 % de batería (`mode:max`, `requireWin`) | `exitBattery` |

Especies: pez linterna, medusa eléctrica, manta luminosa, tortuga de arrecife, anguila guardiana, pulpo territorial, rape abisal y el propio Leviatán. Al empezar cada partida se reemiten los avances de campaña (especies, caja negra, faro, fotos, ruina, cápsula).

## Dificultad (`MLMissions.difficultyPicker`)

| | Batería | O₂ | Daño | Choques | Criaturas | Avisos | Sonar | Célula | Barras | Válvula | Apagado | Embestida cada | Onda cada |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Fácil | ×0,7 | ×0,65 | ×0,6 | ×0,5 | ×0,85 | ×1,4 | 2 % | +25 % | 2 | 2,4 s | 5 s | 5,2 s | 4,4 s |
| Normal | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | 3 % | +18 % | 3 | 2,8 s | 7 s | 4,2 s | 3,6 s |
| Difícil | ×1,25 | ×1,25 | ×1,3 | ×1,3 | ×1,15 | ×0,85 | 4 % | +14 % | 3 | 3,2 s | 8 s | 3,6 s | 3,1 s |
| Extremo | ×1,5 | ×1,45 | ×1,6 | ×1,6 | ×1,3 | ×0,7 | 5 % | +11 % | 4 | 3,6 s | 9 s | 3,1 s | 2,7 s |

## Calidad gráfica

| | DPR máx. | Sombras | Nieve marina | Rayos de luz | Peces | Luces de bioluminiscencia | Niebla | Lejanía | Cáusticas | Terreno |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 1 | no | 160 | 0 | 36 | 0 | ×1,45 | 95 | no | 56² |
| medium | 1,5 | no | 520 | 4 | 110 | 2 | ×1 | 160 | sí | 80² |
| high | 2 | sí (foco del submarino) | 1100 | 7 | 200 | 4 | ×0,82 | 220 | sí | 96² |

Atmósfera barata: `FogExp2` por zona, **cáusticas** inyectadas por `onBeforeCompile` en los materiales del mundo (función de senos en el fragment shader, atenuada con la profundidad, se apaga con un `define`), **rayos de luz** como planos aditivos con degradé generado en canvas que quedan fijos en el mundo, **nieve marina** como `Points` que se envuelven alrededor de la cámara en el vertex shader (cero CPU), y partículas en pool (burbujas, chispas, tinta, sedimento).

## Guardado

Clave única `mareas_profundas:save` (createSave, versión 1). Contenido: `zone`, `cp` (punto de control), `started`, `modules`, `probes`, `debris`, `doors`, `blackbox`, `capsule`, `scanned`, `photos`, `cells`, `ruin`, `bossPhase`, `beacon`, `ascended`, `wins`, `tutorial`, `opts` (sensibilidad, invertir, movimiento, teclas). Un JSON roto se descarta (copia en `:corrupto`) y `sanitize()` repara cualquier forma inválida campo por campo (zona, estados de carga, especies desconocidas, desplazamientos no numéricos, teclas). Una carga «enganchada» al guardar vuelve a su lugar. Récord en `ml:scores`, logros en `ml:missions`.

## Pruebas

`tests/e2e/mareas_profundas.spec.js` (19 pruebas). Las de jugabilidad congelan el bucle real (`?debug` → `freeze()`) y avanzan con `simulate()` en pasos fijos de 1/60 s mientras las teclas/toques reales siguen apretados, para no depender de los FPS de SwiftShader.

Cubren: carga sin errores; arranque con entrada real (Enter / toque); avanzar, girar, subir y bajar (teclado y joystick + botón SUBIR); tutorial (aparece, se salta, se reactiva desde la pausa); sondas + módulo de buceo (recarga, límite de presión, punto de control) y persistencia tras recargar; escombros empujados con el casco → ruina oculta (secundaria) persistente; escaneo de 4 especies (principal 1) y foto; sonar (aturde dron, espanta anguila, gasta energía) y luz; Ciudad: puertas hidráulicas, escombros sobre el panel, caja negra entregada (principal 2), límite 300 m y puerta a la fosa; cápsula sin chocar (cumple) y chocando (falla); patrones de los 4 rivales y flash contra el pulpo; transiciones entre las 3 zonas por las puertas acuáticas; Leviatán completo (intro, F1 válvulas+embestidas, F2 sonar+barras, F3 apagado esquivando ondas, faro = principal 3, corriente ascendente, superficie, victoria, misión de batería, récord); derrota por casco y por energía + reintento; presión; pausa congela 1 s / reanuda / reinicia; guardado corrupto y con forma inválida; dificultad (tabla y costo real del sonar); calidad (costos reales low/high); celular 412×915 y 915×412 sin superposiciones ni scroll + botones táctiles.

Resultados reales (19 pruebas × 2 proyectos; las 7 omitidas son las de sólo escritorio en celular y la de sólo celular en escritorio):

| Corrida | desktop | mobile (Pixel 7) | Total |
|---|---|---|---|
| `ML_WORKERS=1` | 18 ✓ · 1 omitida | 13 ✓ · 6 omitidas | **31 passed, 7 skipped (12,7 min)** |
| `ML_WORKERS=4` (carga) | 18 ✓ | 13 ✓ | **31 passed, 7 skipped (7,3 min)** |

Nota: una primera corrida con 4 workers dejó la prueba de rivales en timeout (muchos `evaluate` por paso con la CPU saturada); se reescribió para simular y muestrear dentro de un solo `evaluate`, igual que los bucles largos del jefe.

## Rendimiento

Chromium headless con SwiftShader (render por CPU) en una máquina con otros 3 agentes corriendo: sirve para comparar, no como FPS reales.

`node tests/perf/measure.mjs mareas_profundas mareas_profundas` (menú):

| Calidad | FPS menú | Peor cuadro | DCL | load | Heap | Tareas largas | Nodos DOM | Peticiones | KB |
|---|---|---|---|---|---|---|---|---|---|
| auto (high en escritorio) | 7,1 | 333 ms | 366 ms | 708 ms | 9,1 MB | 3 | 158 | 22 | 1100 |
| low (`ML_QUALITY=low`) | 22,1 | 233 ms | 422 ms | 803 ms | 7,6 MB | 3 | 158 | 22 | 1100 |

En juego (gancho `__mareas_profundas.perf`, 1280×800):

| Calidad | Zona | Draw calls | Triángulos | update | render (CPU) | Heap |
|---|---|---|---|---|---|---|
| medium | Arrecifes | 66 | 60 k | 2,0 ms | 1,6 ms | 10,7 MB |
| medium | Ciudad | 74 | 43 k | 2,0 ms | 2,8 ms | 10,7 MB |
| medium | Fosa | 31 | 32 k | 1,4 ms | 0,9 ms | 10,7 MB |
| low | Arrecifes | 49 | 53 k | 0,9 ms | 2,0 ms | 10,1 MB |
| low | Ciudad | 50 | 35 k | 1,2 ms | 1,1 ms | 10,1 MB |
| low | Fosa | 28 | 24 k | 0,5 ms | 1,0 ms | 10,1 MB |

Sin asignaciones por cuadro en los bucles calientes (vectores reutilizados, partículas en pool, instancias), recursos de cada zona liberados al cambiar de zona y al salir.

## Móvil

Pasada mobile-first (2026-10-11). Probado sólo con emulación (Chromium headless + SwiftShader, touch emulado por CDP, DPR 2,
perfil Pixel 7); **NO PROBADO en teléfonos reales**. Capturas reales: `.perf/mobile-audit/mareas_profundas/antes/before-*.png` y
`.perf/mobile-audit/mareas_profundas/despues/after-*.png` (360×640, 390×844, 412×915, 915×412, 844×390; menú, opciones, ayuda,
partida con consejo, aviso USAR, peligro y jefe).

Problemas encontrados → arreglos:
- **Joystick encima de los botones** (360×640: joystick 20–156 px vs LUZ/SONAR desde 120 px; 390×844: 6 px de choque). Ahora los 6
  botones van en una grilla 3×2 fija (LUZ·FOTO·SUBIR / SONAR·USAR·BAJAR: SUBIR y BAJAR en la columna del pulgar derecho), de 56 px
  en vertical ≤ 400 px, 64 px en vertical ancho y 62 px en horizontal; USAR con borde más grueso, realce al apretar y safe-area.
  En horizontal bajo (≤ 480 px) el joystick baja a 120 px para no tocar el HUD.
- **HUD vertical gigante:** se veían las 7 misiones (3 principales + 4 secundarias) y el panel izquierdo ocupaba ~350 px de 640,
  pisando consejo y título. En vertical táctil sólo se ven las principales, y se ocultan mientras hay un consejo o durante el jefe
  (la barra del Leviatán quedaba encima del panel de misiones en 360 px).
- **Radar y panel bajo la barra del SDK** (la barra mide 58 px con su relleno; radar y panel empezaban en 48–52 px): bajados a
  barra + 54 px.
- **Consejo, aviso USAR y alerta de peligro:** se apilan sobre los controles en vertical (aviso → alerta → consejo), sin pisarse
  con el joystick (antes el aviso tocaba el joystick en 360 y 390 px); la alerta de peligro estaba arriba al centro, sobre la barra
  del SDK, ahora va abajo (y en horizontal sobre el aviso, lejos del consejo). El aviso en horizontal ya no se mete debajo de los
  botones en 844 px. Botones del consejo de 34 → 44 px. Avisos breves (toasts) movidos al centro (44–48 %) para no tapar el HUD.
- **Textos:** medidores, profundidad, objetivo, consejo y aviso ≥ 12 px en táctil; chips de misión ≥ 11 px (antes 10 px en
  horizontal); etiqueta «TUTORIAL» 11 px. Título de zona ya no se desborda en 360 px.
- **Menú:** «Comenzar inmersión» de 48 px (40 px en horizontal) → 56 px; botones secundarios ≥ 48 px; entra sin scroll en los 5
  tamaños (en horizontal bajo se oculta sólo el crédito). En vertical, las pantallas dejan libre la franja de la barra del SDK.
- **Opciones y ayuda:** en horizontal tenían 230–250 px de contenido extra y «Listo/Volver» fuera de pantalla; ahora la botonera
  queda fija abajo mientras el texto scrollea. En táctil se quitan las 6 filas de teclas (no hay teclado) y se agrega **Vibración**
  (`navigator.vibrate`: 8 ms por botón, 25–35 ms en choques y golpes; apagable).
- **Cámara vertical:** FOV fijo de 62° vertical daba ~37° horizontales en 360×640 (túnel). Ahora el FOV se abre para conservar ~62°
  horizontales (hasta 86° vertical) y el punto de mira baja un poco para que el submarino suba hacia el centro, lejos de los
  pulgares. Horizontal/PC sin cambios (62°).
- **Asistencia táctil:** el cono para escanear fauna es algo más ancho en táctil (cos 0,80 en vez de 0,86). PC sin cambios.
- **Orientación:** se juega en ambas; en vertical aparece una vez un aviso suave «con el teléfono horizontal ves más océano» (no
  bloquea). Rotar en plena inmersión reacomoda HUD, controles y FOV sin perder estado (probado).
- Ya estaban bien y se verificaron: calidad automática en táctil = media, sin sombras, DPR ≤ 1,5; pausa al ir a segundo plano
  (SDK); `touch-action:none` en la superficie de juego; sin scroll horizontal; viewport sin `user-scalable=no`.

Pruebas móviles nuevas (proyecto `mobile`): matriz de 5 viewports (menú sin scroll ni choques con la barra, botones ≥ 44 px,
Comenzar ≥ 56 px, textos ≥ 11/12 px, HUD sin superposiciones en juego+consejo / aviso USAR / peligro / jefe, botones ≥ 56 px en
zona del pulgar, joystick ≥ 120 px, partida sólo táctil: joystick adelante + SONAR); multitáctil (joystick + SUBIR a la vez),
arrastre de cámara y escaneo manteniendo USAR; rotación a mitad de inmersión + calidad + pausa en segundo plano; opciones táctiles
+ vibración + botonera de ayuda alcanzable.

Resultados (2026-10-11, suite completa de 23 pruebas × 2 proyectos): `ML_WORKERS=1` → 35 passed, 11 skipped (desktop 18 ✓ / 5
sólo-celular saltadas; mobile 17 ✓ / 6 saltadas: recorridos idénticos a escritorio); `ML_WORKERS=4` → igual, 35 passed, 11 skipped.
`lifecycle.spec.js -g mareas`: 1 passed, 1 skipped. `npm run typecheck`: sin errores en los archivos del juego.
No se encontraron bugs funcionales nuevos (P0/P1) en el recorrido completo con emulación táctil; lo que fallaba era de layout.

## Pendiente / NO PROBADO

- Los modelos son procedurales en código (geometrías fusionadas con colores por vértice e instancias), no GLB: la spec pide glTF/GLB, pero los GLB del paquete son placeholders genéricos que no encajaban (no hay submarino, corales ni criaturas marinas). Decisión documentada.
- Mando físico: el mapeo se probó sólo por lectura del código del SDK (los navegadores automatizados ignoran mandos).
- FPS reales en dispositivos: NO PROBADO (sólo SwiftShader en headless).
- Sonido: sintetizado; no hay prueba automática de audio.
