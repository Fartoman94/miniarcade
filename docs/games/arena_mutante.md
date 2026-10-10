# ARENA MUTANTE — supervivencia 3D en tercera persona

- **Archivo:** `arena_mutante.html` + módulos ES en `games/arena_mutante/` (`main.js`, `config.js`, `world.js`, `models.js`, `enemies.js`, `boss.js`, `fx.js`, `ui.js`, `sfx.js`).
- **Spec:** `docs/specs/10_arena-mutante.md`.
- **Motor:** Three.js 0.186.1 (import map local) + `matelabs/kit3d.js` + SDK `MLArcade` + `MLMissions`.
- **Acento:** `#a6ff2e` (verde radiactivo: contrasta con el óxido del búnker, el azul de la estación y el blanco del laboratorio).
- **Sin assets externos:** sobreviviente, superviviente NPC, 4 mutantes, Coloso, barricadas, puertas, generadores, cajas, trampas, banco de trabajo, terminal de radio, transporte VTOL, módulos del arma y todo el decorado se construyen en código (geometrías fusionadas con color por vértice). No se usan los GLB del paquete (no encajaban con la estética). Audio 100 % sintetizado con `createAudio().tone`.

## Concepto

Sos el último sobreviviente con un rifle y una mochila. Tres arenas encadenadas, cada una con su objetivo principal:

1. **Búnker oxidado** → restablecer los tres generadores (cada uno hace ruido y atrae una horda; el tercero energiza el ascensor).
2. **Estación eléctrica** → sobrevivir seis oleadas del director de amenazas.
3. **Laboratorio tóxico** → pedir la extracción por radio, defender la baliza de aterrizaje, derrotar al **Coloso Radiactivo** y subir al transporte.

Bucle: explorar → disparar con cámara al hombro → **rodar** cuando un ataque se pone rojo → juntar **chatarra** 🔩 → barricadas y módulos de arma → usar el entorno (puertas con energía, cajas, generadores, trampas) → objetivo → extracción. Diferencial del spec: supervivencia táctica con objetos del entorno (cerrar una puerta energizada detrás tuyo, sellar un pasillo con una barricada, atraer la horda a una trampa) y extracción defendida.

## Controles

| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Mover | WASD | stick izquierdo | stick izquierdo |
| Apuntar / cámara | mouse (clic captura el cursor; Esc lo suelta y pausa) · flechas | stick derecho (APUNTAR) o arrastrar la pantalla | stick derecho |
| Disparar | clic izq. / J | FUEGO o **disparo automático** | RT / RB |
| Mira al hombro (zoom, menos dispersión) | clic der. / K | — | LT |
| Rodar (invulnerable 0,34 s, 2 cargas) | Espacio | RODAR | A |
| Usar / mantener | E | USAR | X |
| Pulso (empuja, aturde, revela) | Q | PULSO | LB |
| Barricada (4 🔩) | F | BARR. | Y |
| Recargar | R (automática al vaciar) | automática | B |
| Tutorial | H | pausa → Ver tutorial | — |
| Pausa | Esc / P | ⏸ | Start |

Opciones (menú → CONTROLES, guardadas): sensibilidad de cámara (0,4–2), invertir eje vertical, **autoapuntado** (Apagado / Suave: cono 6°, tira 60 % / Fuerte: cono 12°, apunta al 100 % y en táctil la cámara sigue al objetivo), **disparo automático** al tener un mutante en la mira (táctil), reducir movimiento (sin sacudidas ni destellos; también se respeta `prefers-reduced-motion`). La primera vez en un dispositivo táctil vienen activados autoapuntado Fuerte y disparo automático. El mapa completo está en esa pantalla y en la ayuda de la pausa. El gamepad usa el mapeo del SDK (botones → teclas) y el juego lee los ejes 2/3 para la cámara.

## Escenarios

| Arena | Objetivo | Elementos | Bocas de mutantes |
|---|---|---|---|
| **Búnker oxidado** (52×30 m, interior) | 3 generadores: el del salón abre el ala oeste; el del ala oeste abre la este; los 3 energizan el ascensor | 3 puertas con energía, 4 cajas, 2 trampas de vapor, banco de trabajo, coberturas | 6 rejillas de ventilación (sólo se usan las alcanzables) |
| **Estación eléctrica** (56×32 m, patio nocturno) | 6 oleadas; después se abre la compuerta norte | generador A (cabina del superviviente + bobinas tesla), generador B (compuertas laterales = rutas de escape), 3 cajas, banco | 4 escotillas |
| **Laboratorio tóxico** (56×26 m) | generador → radio → defender baliza 45 s → Coloso → transporte (30 s para subir) | pileta tóxica, puerta a la sala de radio, 2 rociadores neutralizantes, rejilla rompible con el antídoto, pista de aterrizaje | 3 tanques rotos |

Los mapas son ASCII en `config.js` (celdas de 2 m): de ahí salen la geometría, las colisiones, el raycast por grilla (DDA) y el campo de flujo.

## Sistemas

- **Tercera persona con cámara al hombro:** pivote a 1,95 m desplazado 0,95 m a la derecha, 5 m detrás (2,6 m con la mira). La cámara choca con paredes y sube un poco si queda pegada. En vertical (celular) se abre el FOV hasta ×1,42.
- **Disparo hitscan** desde el centro de la cámara (el rayo arranca a la altura del jugador): torso, cabeza (crítico ×1,6) y piernas; trazadora desde la boca real del arma; marcador de impacto; dispersión mayor al moverse y menor con la mira.
- **Roll de evasión:** 0,42 s, 0,34 s de invulnerabilidad, 2 cargas que se recargan cada 1,5 s.
- **Pulso:** radio 6,5 m, 25 de daño, empuje, aturde 1 s (0,6 s al bruto), revela acechadores 4 s y rompe la rejilla del antídoto. Recarga 12 s (−25 % por nivel).
- **Director de amenazas:** cola de mutantes que aparecen por bocas alcanzables (campo de flujo finito), priorizando las lejanas y fuera de cámara, con aviso luminoso de 0,9 s. Mide estrés (daño reciente + mutantes a <8 m); con mucho estrés y vida <45 % da **5 s de respiro** y marca una **ruta de escape** 🏃 (la puerta energizada más cercana con menos mutantes). En la estación compone cada oleada gastando un presupuesto de amenaza (corredor 1, escupidor 2, acechador 2,5, bruto 4) × dificultad.
- **Campo de flujo:** Dijkstra 8-vecinos sobre la grilla 4 veces por segundo (jugador y, en el laboratorio, la baliza). Puertas cerradas con energía cuestan 9 (los mutantes van a golpearlas), bloqueadas = intransitables, barricadas +6 por celda, pileta 7.
- **Fabricación simple:** chatarra de cajas y bajas (imán a 3,8 m). **Barricada** (F, 4 🔩, 170 de vida, máx. 4, de 3,6 m: sella una puerta de 2 celdas). **Banco de trabajo** (E): módulos Cañón (daño 14→18→23→29), Cargador (24→48 balas, recarga 1,35→0,9 s), Pulso (−25 %/nivel), Placas (+25 de vida máx. y cura 25). Teclas 1-4 o clic.
- **Vida:** se regenera tras 5 s sin daño hasta el tope de la dificultad. Botiquines en cajas y 6 % de las bajas.
- **Estado persistente de la sesión:** generadores restablecidos, estado de cada puerta (abierta/cerrada/rota), cajas abiertas, usos de trampas, rejilla rota, antídoto y superviviente se conservan al reintentar la arena. Puntos, chatarra y módulos vuelven al punto de control del inicio de la arena.

## Interacciones funcionales (con prueba propia)

| Interacción | Colisión / raycast | Indicación | Animación | Persistencia |
|---|---|---|---|---|
| **Puertas con energía** | celdas sólidas mientras están cerradas (jugador, mutantes, balas, cámara) | luz roja = sin energía, amarilla = cerrada, verde = abierta, gris = rota; aviso «E» | hojas que se deslizan; abolladas al romperse | estado por puerta en la sesión |
| **Cajas de suministros** | sólidas; se abren con E a <2 m | anillo verde que pulsa + marcador 📦 a <11 m | la tapa gira; salta la chatarra | abierta en la sesión |
| **Generadores** | sólidos; mantener E 3,2 s a <2,4 m (el daño recibido atrasa) | anillo amarillo con progreso, luz roja→verde, marcador ⚡ | volante que gira | restablecido en la sesión |
| **Trampas activables** | consola a 1,5 m de la rejilla; la zona (3,4 m) daña sólo mutantes | luz gris sin energía / verde lista / amarilla armando / naranja activa / azul recargando | vapor, rayos tesla encadenados (3 objetivos) o niebla que frena | usos en la sesión |

Además: **rejilla rompible** (disparos o pulso) que esconde el **antídoto**, **superviviente** en la cabina (E para liberarlo), **radio** (mantener E 2,6 s), **baliza** y **pista**.

## Enemigos (silueta · patrón · aviso · contrajuego)

| Mutante | Silueta | Patrón | Aviso | Contrajuego |
|---|---|---|---|---|
| **Corredor** (30 vida, 6,1 m/s) | flaco, encorvado, brazos largos, púas en la espalda | persigue y a <5,5 m salta (11 m/s) | se agacha y destella rojo 0,45 s + chillido | rodar de costado; aterriza expuesto 0,6 s |
| **Bruto** (230, 2,5 m/s) | enorme, placa metálica al frente, tumor verde en la espalda | golpe cuerpo a cuerpo; embestida a 6-15 m; rompe barricadas | brazos arriba 0,75 s / línea naranja en el piso 0,95 s + rugido | frente ×0,35; espalda ×1,6; si choca contra pared, generador o cobertura queda aturdido 2,2 s (×1,6) |
| **Escupidor tóxico** (60, 2,9 m/s) | saco verde hinchado en la espalda | se mantiene a 9-13 m, huye si te acercás, ácido parabólico con predicción | círculo verde donde va a caer + saco que se infla 0,8 s | moverse; al morir se infla 0,6 s y libera gas (no matarlo de cerca) |
| **Acechador invisible** (75, 4,8 m/s) | alto, delgado, cabeza en punta, ojos rojos | casi invisible (7 % de opacidad), zarpazo y retirada | latido que se acelera al acercarse; se vuelve visible y sisea 0,55 s antes del golpe | un tiro lo revela 2,5 s; el pulso 4 s; trampas tesla/rociador también |

## Jefe: Coloso Radiactivo (laboratorio)

- **Intro:** al terminar la cuenta de la baliza emerge de la pileta tóxica (cámara cinemática ~3,4 s, rugido, sacudida). El transporte queda en órbita: no puede aterrizar con el Coloso en pie.
- **Fase 1 «Blindado»:** sólo los **3 tanques radiactivos** (hombros y espalda, 340 c/u × dificultad) reciben daño completo; el cuerpo, 12 %. **Pisotón** (anillo naranja que se llena 1,1 s, 7,6 m, empuja) y **arroja escombros** (círculo rojo en el piso). Si te quedás detrás de una cobertura más de 1,8 s, la elige como blanco y **la destruye**. Camina rompiendo coberturas.
- **Fase 2 «Marea tóxica»:** sin tanques queda expuesto el **núcleo del pecho**. **Altera la arena:** inunda cuadrantes (siempre incluye el tuyo) con aviso amarillo parpadeante 2,5 s antes de volverse tóxico 6 s (12 de daño/s). **Rayo de barrido** (dos líneas verdes marcan el arco, 1,2 s de carga) que también destruye coberturas. Llama corredores desde la pileta.
- **Fase 3 «Furia»** (núcleo <45 %): ciclos 32 % más rápidos, dos cuadrantes por marea y **salto aplastante** sobre tu posición (sombra roja 1,3 s) que destruye coberturas en 4,2 m.
- **Recompensa:** núcleo del Coloso (+5000 × dificultad, vida completa, 10 🔩, trofeo en el menú) y el transporte aterriza: 30 s para subir.

## Misiones

| Tipo | Misión | Evento | Dónde |
|---|---|---|---|
| ★ Principal | Restablecer tres generadores | `generator` ×3 | Búnker |
| ★ Principal | Sobrevivir seis oleadas | `waveSurvived` ×6 | Estación |
| ★ Principal | Llamar y alcanzar extracción | `extracted` | Laboratorio (al subir al transporte) |
| ◆ Secundaria | Salvar superviviente | `survivorSaved` (falla con `survivorDied`) | Estación: liberarlo y salir con él vivo |
| ◆ Secundaria | Derrotar 15 enemigos sin perder vida | `cleanStreak` (modo máx.; la racha se corta al recibir daño) | cualquiera |
| ◆ Secundaria | Activar dos trampas | `trapOn` ×2 | cualquiera |
| ◆ Secundaria | Encontrar antídoto escondido | `antidote` | Laboratorio, tras la rejilla (reduce el daño tóxico a ⅓) |
| ◆ Secundaria (extra) | Levantar tres barricadas | `barricade` ×3 | cualquiera |

`MLMissions.setup({ primaryPerRun: 3, secondaryPerRun: 5, hud: 'none' })`: el HUD propio muestra las 8 como chips (en celular sólo las principales; todas en la pausa). `runStart` al empezar / reintentar, `runEnd` al ganar, perder, volver al menú o salir. Al reintentar se re-emite lo ya logrado en la sesión. Las principales completadas quedan en la campaña del guardado.

## Dificultad (`MLMissions.difficultyPicker`)

| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Vida mutante | ×0,75 | ×1 | ×1,3 | ×1,6 |
| Daño mutante (y charcos/marea) | ×0,6 | ×1 | ×1,35 | ×1,75 |
| Velocidad mutante | ×0,9 | ×1 | ×1,08 | ×1,15 |
| Presupuesto de hordas/oleadas | ×0,75 | ×1 | ×1,3 | ×1,6 |
| Duración de los avisos | ×1,3 | ×1 | ×0,85 | ×0,72 |
| Regeneración hasta | 100 % | 60 % | 40 % | sin regeneración |
| Chatarra | ×1,4 | ×1 | ×0,85 | ×0,7 |
| Vida del Coloso | ×0,7 | ×1 | ×1,3 | ×1,65 |
| Puntos | ×0,8 | ×1 | ×1,35 | ×1,8 |

## Calidad (SDK: baja / media / alta)

| | Baja | Media | Alta |
|---|---|---|---|
| Partículas (chispas + restos ×0,6) | 220 | 520 | 900 |
| Decorado instanciado | ×0,35 | ×0,7 | ×1 |
| Luces puntuales | 0 | 2 | 4 |
| Sombras | no | no | sí (1024²) |
| Niebla / distancia de dibujo | 46 / 70 m | 70 / 110 m | 95 / 150 m |
| Trazadoras simultáneas | 24 | 48 | 64 |
| DPR máx. (Kit3D) | 1 | 1,5 | 2 |

El decorado y las luces se aplican al construir la arena (en el menú, al instante; en partida, luces/sombras/niebla/partículas al instante y el decorado en la próxima arena).

## Guardado

Clave única `arena_mutante:save` (`createSave`, versión 2):

```json
{ "v": 2, "d": { "unlocked": 1, "best": 0, "campaign": { "generadores": false, "oleadas": false, "extraccion": false },
  "trophy": false, "victories": 0, "runs": 0, "kills": 0, "lastArena": 0,
  "settings": { "sens": 1, "invertY": false, "autoAim": "off", "autoFire": false, "calm": false, "tutorialDone": false } } }
```

- JSON roto → se descarta (copia en `arena_mutante:save:corrupto`) y se sigue con valores por defecto.
- Tipos/rangos inválidos → `sanitize()` los corrige (claves desconocidas fuera, números acotados, `autoAim` validado).
- Migración v1 (`{ arena, best, tutorial }`) → v2.
- Desbloqueo coherente con la campaña (generadores → arena 2; oleadas → arena 3). Nunca hay bloqueo irreversible: siempre se puede reintentar la arena o volver al menú.
- Las misiones/logros los guarda `MLMissions` (`ml:missions`), la dificultad `ml:difficulty`, el récord el SDK.

## Pruebas

`tests/e2e/arena_mutante.spec.js` (20 pruebas; la táctil sólo en el proyecto móvil). Usa `?debug` y `simulate()` (pasos fijos de 1/60 s) para los recorridos largos, con entrada real para lo que prueba controles (teclado, toque CDP en sticks y botones).

Cobertura: carga sin errores y marca · arranque con entrada real (Enter / toque) · movimiento, cámara, disparo, recarga, rodar y pulso con teclado · tutorial (avanza con la acción, se saltea, se reabre desde la pausa) · **puertas con energía** (se energizan, se cierran con E, bloquean, un bruto las rompe, persisten al reintentar) · **generador** (mantener E, progreso parcial) · **cajas** (E, tapa, chatarra, persistencia) · **trampas** (sin energía no; armado → activa → mata → recarga) · barricada que sella una puerta y se daña · banco de trabajo (tecla 1, daño real 14→18 por disparo) · telegrafía y contrajuego de los 4 mutantes (rodar esquiva el salto, blindaje frontal vs. espalda, embestida → aturdido, zona y charco del escupidor, acechador revelado por un tiro) · las 3 arenas encadenadas · misión principal + secundaria persistidas tras recargar · guardado corrupto y migración v1 · dificultad (vida/daño/avisos reales) · calidad (partículas, decorado, luces, sombras, triángulos) · jefe: intro, fase 1, pisotón, rompe la cobertura donde te escondés, fase 2 (marea aviso→tóxico, rayo), fase 3 (salto), muerte · derrota por vida y por baliza destruida · victoria · superviviente (liberar, sigue, salvarlo) y antídoto (romper rejilla) · pausa congela 1 s / reanudar / reiniciar · HUD sin superposición ni scroll en 412×915 y 915×412 · sticks táctiles y botones FUEGO/RODAR.

Resultados reales (2026-10-10, máquina compartida con otros 3 agentes, carga ~35):

| Corrida | desktop | mobile (Pixel 7) |
|---|---|---|
| `ML_WORKERS=1` | **19 pasan**, 1 omitida (táctil, sólo móvil) | **20 pasan** |
| `ML_WORKERS=4` (ambos proyectos juntos, simula carga de CI) | 39 pasan, 1 omitida en total | |

Las aserciones de juego usan `simulate()` (pasos fijos) y ganchos con `frozen` para mutantes de medición; el daño se mide **por disparo** (el loop real puede disparar de más mientras la tecla está abajo). Las pruebas de controles reales usan `expect.poll` con márgenes amplios.

## Rendimiento

`node tests/perf/measure.mjs` (menú, 1280×800, SwiftShader por CPU, máquina con carga ~35 por otros agentes — las cifras de FPS son muy ruidosas):

| Calidad | FPS menú | Peor cuadro | DCL / load | Heap | Requests / KB |
|---|---|---|---|---|---|
| media | 3,4 (otra corrida: 9,1; GUARDIANES en el mismo momento: 17 y 8,7) | 617 ms | 545 / 1089 ms | 7,6 MB | 21 / 1124 KB |
| baja | 3,6 | 550 ms | 526 / 1080 ms | 11,9 MB | 21 / 1124 KB |

En partida (gancho `perf`, 8 mutantes vivos; en el laboratorio además el Coloso):

| Calidad | Arena | Draw calls | Triángulos | render (CPU) | update | Heap |
|---|---|---|---|---|---|---|
| media | Búnker | 72 | 25,4 k | 1,5 ms | 0,8 ms | 17,3 MB |
| media | Estación | 61 | 28,9 k | 1,4 ms | 0,8 ms | 18,2 MB |
| media | Laboratorio + jefe | 59 | 26,8 k | 1,2 ms | 0,7 ms | 16,7 MB |
| baja | Búnker | 71 | 24,6 k | — | — | 17,5 MB |
| baja | Estación | 61 | 27,1 k | 1,3 ms | 1,3 ms | 12,3 MB |
| baja | Laboratorio + jefe | 59 | 25,2 k | 1,4 ms | 0,5 ms | 14,1 MB |

El costo de CPU por cuadro es bajo (~2 ms); el FPS headless está limitado por SwiftShader y la carga de la máquina. Medidas de presupuesto: mutantes instanciados por parte (5 draw calls por tipo; se dibujan sólo hasta el último lugar ocupado), pools vacíos ocultos (sin draw call), paredes/piso/coberturas fusionados o instanciados, partículas en 2 `Points`, sombras sólo en alta, luces puntuales 0/2/4, sin asignaciones por cuadro en el bucle caliente. **Degradación para hardware inferior:** calidad baja = DPR 1, sin luces puntuales ni sombras, 220 partículas, decorado ×0,35 y niebla a 46 m.

## Pendiente / NO PROBADO

- **NO PROBADO en hardware real:** gamepad físico (sólo el mapeo; en pruebas los mandos se ocultan) ni celular real (sólo emulación Pixel 7 de Playwright). Bloqueo de puntero (pointer lock) no probado en headless; en `?debug` está desactivado.
- Miniatura `games/thumbs/arena_mutante.webp`: hay que generarla con `node tools/make-thumbs.mjs arena_mutante` después de agregar la entrada al registro (no se puede tocar `games/` fuera de `games/arena_mutante/`).
- El decorado no tiene colisión (está pegado a las paredes).
- La partida no se jugó completa a mano de punta a punta con entrada real (sí por ganchos de depuración + simulación); el balance (idle muere en ~20 s en la primera horda/oleada en Normal) es estimado.
- La cámara en el laboratorio durante el jefe puede quedar cerca del Coloso: hay que mirar hacia arriba para ver los tanques de los hombros.
- Sin música de fondo (sólo efectos sintetizados).
