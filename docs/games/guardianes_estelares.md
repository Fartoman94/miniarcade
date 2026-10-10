# GUARDIANES ESTELARES — shooter espacial 3D

> **Nota sobre el nombre:** el spec original (`docs/specs/09_guardianes-galaxia.md`) usaba un título que es marca registrada de terceros. El juego se llama **GUARDIANES ESTELARES** en toda la UI, el código y la documentación.

- **Archivo:** `guardianes_estelares.html` + módulos ES en `games/guardianes_estelares/` (`main.js`, `config.js`, `world.js`, `models.js`, `enemies.js`, `boss.js`, `fx.js`, `ui.js`, `sfx.js`).
- **Motor:** Three.js 0.186.1 (import map local) + `matelabs/kit3d.js` + SDK `MLArcade` + `MLMissions`.
- **Acento:** `#ffb13b` (ámbar de cabina, contrasta con el azul/violeta del espacio).
- **Sin assets externos:** todos los modelos (caza, 4 enemigos, cargueros, estación Delta, destructor, torretas, docks, balizas, cápsulas, asteroides, cristales, minas, torpedos, portal) se construyen en código con geometrías fusionadas y colores por vértice. El audio se sintetiza con `createAudio().tone`.

## Concepto

Piloteás el caza **Guardián** en una campaña de 3 sectores. Bucle: pilotear con inercia arcade → fijar objetivo → apuntar al rombo de la **retícula predictiva** → disparar (pulso + láser) → esconderse tras asteroides/cristales → activar balizas, torretas y docks → cumplir el objetivo del sector. Diferencial del spec: cobertura real (las rocas y cristales bloquean disparos enemigos, el haz del jefe y el pulso del reactor) y objetivos de escolta (convoy, cargueros varados, carguero Esperanza).

## Controles

| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Pilotear | WASD / flechas / mouse (la nave gira hacia el puntero; zona muerta 8 %) | stick izquierdo | stick izq. / cruceta |
| Cañón de pulsos | Espacio / clic izquierdo | FUEGO | A / RT |
| Láser secundario | F / clic derecho | LÁSER | X / LT |
| Turbo | Shift | TURBO | RB |
| Escanear baliza | E (mantener) | SCAN | Y |
| Cambiar objetivo | Q / Tab | automático | LB |
| Tutorial | H | pausa → Ver tutorial | — |
| Pausa | Esc / P | ⏸ | Start |

Opciones (menú → CONTROLES, guardadas): sensibilidad de giro (0,5–1,6), invertir eje vertical, dirigir con mouse, **disparo asistido** (dispara solo cuando el rombo está alineado; viene activado la primera vez en celular), reducir movimiento (sin sacudidas ni destellos; también se respeta `prefers-reduced-motion`). El mapa de controles está visible en esa pantalla y en la ayuda de la pausa.

Ayuda de puntería: si el rombo predictivo está a menos de N grados de la nariz (ver tabla de dificultad; +3° en táctil), los disparos van al rombo.

## Escenarios

1. **Cinturón de asteroides** — 240 asteroides (en alta) en 3 variantes instanciadas, corredor despejado para la ruta del convoy (curva Catmull-Rom de ~1000 m), portal de salto al final. 3 balizas, 2 torretas aliadas sobre rocas, 1 dock, 3 cápsulas. Objetivo: **escoltar al convoy** (3 cargueros: ÁGUILA, COLIBRÍ, HORNERO) hasta el portal.
2. **Orbital de la estación Delta** — estación con anillo rotatorio, eje, paneles solares y luces; planeta de fondo; campo de escombros. 3 transmisores enemigos con escudo montados en módulos del anillo, 3 balizas de frecuencia (cada una baja el escudo de su transmisor), 3 torretas aliadas sobre el anillo, dock en la punta del eje, 2 cargueros varados (CARDENAL, TERO), 3 cápsulas. Objetivo: **desactivar los tres transmisores**.
3. **Nebulosa de cristales** — niebla violeta, nubes aditivas, ~130 racimos de cristales (cobertura), ruta del Esperanza y órbita del jefe despejadas. 2 balizas, 2 torretas, 1 dock, 3 cápsulas. Objetivo: resistir, **destruir al Destructor Némesis** y **escoltar al carguero Esperanza** hasta el portal.

Entre sectores aparece un resumen (puntos, bono, escudo intacto) y se guarda el desbloqueo. Desde el menú se puede empezar en cualquier sector desbloqueado (con mejoras base: sector 2 → pulso NV2; sector 3 → pulso y láser NV2).

## Sistemas

- **Nave con inercia arcade:** velocidad angular suavizada (respuesta 5/s), cabeceo limitado a ±72°, alabeo visual al girar, velocidad lineal que se acerca a la de crucero (34) o turbo (66) y vector de velocidad que «derrapa» hacia la nariz. Límite blando del sector con giro asistido de regreso.
- **Retícula predictiva:** se resuelve la intercepción del proyectil con la velocidad relativa del objetivo (ecuación cuadrática) y se dibuja un rombo (rojo → verde cuando está alineado). Objetivo automático por ángulo/distancia, Q/Tab cicla.
- **Dos armas mejorables (NV1–3):** pulso (cadencia 7→10/s, doble cañón desde NV2, daño 10→15) y láser secundario hitscan (raycast contra coberturas, enemigos, minas, torpedos, transmisores y jefe; 42→85 dps; ×3 contra drones; gasta energía). Mejoras: docks de reparación y completar todas las balizas de un sector; recompensa del jefe = ambas al máximo.
- **Escudo regenerativo:** absorbe antes que el casco y se recarga 22/s tras N segundos sin daño (según dificultad).
- **Astros como cobertura:** cuadrícula espacial de esferas (`createCoverGrid`) que bloquea proyectiles, la línea de visión de enemigos/torretas, el barrido del jefe y el pulso del reactor. Chocar contra una roca rebota y daña el escudo.
- **Estaciones activables:**
  - **Balizas (raycast):** se escanean apuntando (cono de ~15°, ≤130 m, sin rocas en medio) y manteniendo E/SCAN 1,4 s; anillo ámbar → verde, plato que gira más rápido, haz de escaneo y anillo de progreso en el HUD. Sector 1/3: revelan cápsulas en radar y marcadores; todas = mejora de arma. Sector 2: bajan el escudo del transmisor vinculado.
  - **Torretas aliadas (colisión):** atravesar su anillo de activación → arranque animado (la cabeza crece y sube) → apuntan y disparan solas (LOS) al enemigo más cercano en 170 m.
  - **Docks de reparación (colisión):** entrar al anillo → atraque (la nave es llevada al centro, brazos se cierran), reparación total, mejora del arma más baja; el campo pasa de verde a rojo (usado).
  - **Estado de sesión:** balizas escaneadas, torretas activas, docks usados, cápsulas recogidas, transmisores destruidos y cargueros salvados se conservan al reintentar el sector dentro de la misma campaña.

## Enemigos (silueta · patrón · aviso · contrajuego)

| Enemigo | Silueta | Patrón | Aviso (telegrafía) | Contrajuego |
|---|---|---|---|---|
| Interceptor rápido | dardo negro/rojo con alas finas | se acerca rápido, ráfaga de 3 disparos, se abre y vuelve | ojo rojo se intensifica + línea roja 0,55 s | romper la línea de tiro (cobertura, giro cerrado), rombo predictivo |
| Dron minador | esfera con anillo amarillo y púas | se adelanta a la ruta del convoy/del jugador y siembra minas; huye si te acercás | minas parpadean al armarse; al detectar a alguien pitan y muestran un anillo rojo 0,85 s | láser (×3), dispararle a las minas a distancia |
| Bombardero pesado | casco ancho verde oliva con dos góndolas | busca cargueros, lanza torpedos guiados lentos; cañón de cola | compuerta brilla + línea naranja al blanco 1,5 s | derribar los torpedos, atacarlo por detrás (motores ×2) |
| Fragata protectora | casco largo con placa-escudo frontal y generador cian atrás | orbita lo que protege, gira su blindaje hacia vos, vincula escudos (−70 % daño) a aliados en 80 m | torretas brillan 0,85 s antes del abanico de 5 disparos; vínculos cian visibles | flanquear: el frente recibe ×0,15, el generador trasero ×1,7; matarla primero |

Aparición por oleadas (por progreso del convoy en el sector 1, por tiempo en los otros) + un «director» que mantiene presión mínima. Las cantidades escalan con la dificultad.

## Jefe: Destructor Némesis

- **Entrada:** alerta «SEÑAL MASIVA», el destructor sale del hiperespacio estirado (warp) mientras la cámara lo encuadra; cartel de jefe. Se saltea con disparo/Enter.
- **Fase 1 · Torretas:** 4 torretas (150 HP c/u × dificultad). Cada una brilla y traza una línea roja 1 s antes de su ráfaga; las superiores sólo disparan si estás de su lado del casco. Lanza pares de interceptores.
- **Fase 2 · Escudos:** burbuja que absorbe disparos sobre el casco; 3 emisores en pilones sólo vulnerables mientras están abiertos (6 s abiertos / 4,5 s cerrados, titilan 1 s antes de cerrarse). **Barrido:** franja roja que sigue lento al jugador 1,6 s y luego dispara 1 s; las rocas/cristales cortan el haz. Lanza drones.
- **Fase 3 · Reactor vulnerable:** escudo caído, el destructor acelera; el reactor abre sus compuertas 5 s de cada 9. **Pulso del reactor:** esfera roja creciente 2,2 s → daño en 120 m salvo detrás de cobertura (aviso «Te salvó la cobertura»).
- **Fase 4:** explosiones en cadena 3,2 s → **recompensa «Núcleo Némesis»**: reparación total, armas al máximo, +3000 y trofeo persistente. Luego **escolta final** del Esperanza (~40 s, con oleadas) → victoria.

## Misiones

| Tipo | Misión | Evento | Meta |
|---|---|---|---|
| Principal | Salvar convoy mercante | `convoySaved` | 1 |
| Principal | Desactivar tres transmisores | `transmitterDown` | 3 |
| Principal | Destruir el destructor Némesis | `nemesisDown` | 1 |
| Secundaria | Completar sector sin perder escudo | `sectorClean` | 1 |
| Secundaria | Recuperar cinco cápsulas (3 por sector) | `capsule` | 5 |
| Secundaria | Eliminar diez drones con láser | `droneLaser` | 10 |
| Secundaria | Salvar dos cargueros aliados (estación Delta) | `freighterSaved` | 2 |

`MLMissions.setup({ secondaryPerRun: 4, hud: 'none' })`: las 4 secundarias están activas en cada partida y se muestran en el panel de objetivo del HUD propio. `runStart` al empezar/reiniciar/reintentar, `runEnd` en derrota, victoria, menú y `pagehide`. Al reintentar un sector se re-emiten los contadores de la sesión (cápsulas, drones, cargueros) para no perder progreso. **Limitación de MLMissions:** por partida sólo sigue una misión `primary` (la primera no cumplida). Por eso la campaña guarda sus propias principales en `campaign` (lo que muestra el menú y desbloquea sectores); el logro de MLMissions de las principales 2 y 3 se registra en partidas posteriores si ya se cumplió la anterior.

**Derrota:** nave destruida, o convoy perdido (2 de 3 cargueros del convoy, o el Esperanza). **Victoria:** reactor destruido + Esperanza en el portal. Reintentar sector conserva el estado de la sesión; no hay bloqueos irreversibles (un dock usado no impide terminar; los sectores desbloqueados quedan disponibles).

## Dificultad (`MLMissions.difficultyPicker` en el menú)

| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Vida enemiga | ×0,75 | ×1 | ×1,25 | ×1,5 |
| Daño enemigo | ×0,55 | ×1 | ×1,35 | ×1,75 |
| Cadencia enemiga | ×0,7 | ×1 | ×1,25 | ×1,5 |
| Escudo regenera tras | 2 s | 3 s | 4 s | 5 s |
| Vida de cargueros | ×1,5 | ×1 | ×0,85 | ×0,7 |
| Tamaño de oleadas | ×0,75 | ×1 | ×1,25 | ×1,5 |
| Vida del jefe | ×0,75 | ×1 | ×1,3 | ×1,6 |
| Ayuda de puntería | 9° | 6° | 4,5° | 3,5° |
| Multiplicador de puntos | ×0,8 | ×1 | ×1,3 | ×1,7 |

## Calidad (SDK: baja / media / alta)

| | Baja | Media | Alta |
|---|---|---|---|
| Pixel ratio máx. (Kit3D) | 1 | 1,5 | 2 |
| Estrellas | 900 | 2200 | 4500 |
| Asteroides / cristales | 45 % / 50 % | 75 % / 80 % | 100 % |
| Partículas (pool) | 160 | 360 | 700 |
| Destellos | 8 | 16 | 16 |
| Polvo cercano | no | 120 | 260 |
| Niebla / plano lejano | 380 / 520 m | 560 / 800 m | 760 / 1100 m |
| Sombras | no | no | sí (1024²) |

La niebla cambia al instante; estrellas, rocas y partículas se aplican al construir el sector (en el menú se reconstruye en el acto).

## Guardado

Clave única `guardianes_estelares:save` (`createSave`, versión 2):

```json
{ "v": 2, "d": { "unlocked": 1, "best": 0, "campaign": { "convoy": false, "transmisores": false, "nemesis": false },
  "trophy": false, "victories": 0, "runs": 0, "kills": 0, "capsulesTotal": 0, "lastSector": 0,
  "settings": { "sens": 1, "invertY": false, "mouseSteer": true, "autoFire": false, "calm": false, "tutorialDone": false } } }
```

- JSON roto → se descarta, se copia en `guardianes_estelares:save:corrupto` y se usan valores por defecto (Kit3D).
- JSON válido con tipos/rangos inválidos → `sanitize()` valida cada campo (números acotados, booleanos estrictos, claves desconocidas eliminadas).
- Migración v1 (`{sector, best, tutorial}`) → v2.
- Además: récord en `ml:scores` (`MLArcade.ended({score})`), logros en `ml:missions`, dificultad en `ml:difficulty`.

## Ganchos de prueba

`window.__guardianes_estelares` (congelado, sólo lectura): `state`, `scene`, `sector`, `score`, `hp`, `player`, `missions`, `campaign`, `difficulty`, `quality`, `perf` (de `createGame().perf` + heap), `counts`, `sec`, `world`, `boss`, `tutorial`, `target`, `paused`, `settings`, `session`. Con `?debug` además `debug.*`: `simulate`, `goto`, `face`, `teleport`, `spawn`, `spawnAt`, `killAll`, `clearEnemies`, `setHp`, `damage`, `invulnerable`, `convoyProgress`, `killFreighter`, `killEsperanza`, `destroyTransmitter`, `spawnBoss`, `bossPhase`, `bossDamage`, `bossHit`, `escortArrive`, `setUpgrades`, `lose`, `enemies`, `lead`, `bossPos`.

## Pruebas

`tests/e2e/guardianes_estelares.spec.js` (Playwright; `ML_WORKERS=1 npx playwright test tests/e2e/guardianes_estelares.spec.js`). 
Resultado real (10/10/2026, `ML_WORKERS=1`, máquina compartida con carga ~27): **desktop 18 ✔ + 1 omitida** (la de táctil es sólo móvil), **mobile 19 ✔** — 37 passed, 1 skipped en 8,3 min. Ejecución previa sólo-mobile: 19/19 ✔.

| Prueba | Qué verifica |
|---|---|
| carga sin errores | menú, crédito MateLabs, 3 sectores (2 y 3 bloqueados), selector de dificultad, barra del SDK, título; sin `?debug` no hay ayudantes |
| arranque con entrada real | Enter (PC) / toque (móvil) → partida; flecha gira (inercia), crucero avanza, Espacio dispara, F gasta energía de láser, Shift gasta turbo; telemetría `start` |
| tutorial | aparece la primera vez, avanza con la acción real, el convoy espera, «Saltar» lo cierra y guarda, se reabre desde la pausa y el juego sigue corriendo |
| baliza | raycast + mantener E: progreso parcial y completo, apuntar a otro lado no escanea, persiste tras perder y reintentar |
| torreta aliada | colisión con el anillo → activa → arranque → derriba un dron sola |
| dock | colisión → atraque → reparación total + mejora de arma → queda usado y no re-atraca |
| cápsulas y láser | recoger cápsula (misión), dron destruido con láser (misión) |
| sector 1 completo | misión principal «convoy» + secundaria «sin perder escudo», pantalla de sector, transición al sector 2, persistencia tras recargar (campaña, logros, sector 2 habilitado) |
| sector 2 | escaneo baja el escudo del transmisor vinculado; 3 transmisores cierran el sector; transición a la nebulosa |
| cargueros varados | aparecen atacantes al acercarse; al derribarlos el carguero se salva (misión) |
| jefe | entrada (cine) → fase 1 → fase 2 (emisor cerrado bloquea, abierto recibe) → fase 3 → fase 4 → recompensa → escolta → victoria + trofeo + telemetría `end` |
| pulso del reactor | aviso de 2,2 s sin daño antes del estallido |
| derrota | nave destruida y convoy perdido con sus pantallas; Enter reintenta; Menú vuelve |
| pausa | congela 1 s (tiempo y posición idénticos), reanuda sin salto, reiniciar resetea puntos/tiempo/enemigos/vida |
| guardado corrupto | JSON roto (copia `:corrupto`), tipos inválidos saneados, migración v1→v2 |
| dificultad | Extremo/Fácil cambian vida real de enemigos (48 vs 24), vida de cargueros y regeneración |
| calidad | baja vs alta: estrellas ×5, asteroides ×2,2, más triángulos dibujados |
| celular | 412×915 y 915×412 en jefe: estado, objetivo, radar, barra del SDK, joystick y botones dentro de pantalla y sin superponerse, sin scroll |
| táctil (móvil) | stick virtual gira la nave; FUEGO dispara; LÁSER gasta energía |

## Rendimiento

Chromium headless + SwiftShader (render por CPU) en una máquina compartida con **carga ~27–29** por otros agentes: los FPS absolutos no representan un dispositivo real; sirven las cifras de costo (draw calls, triángulos, ms de JS).

`node tests/perf/measure.mjs ge-<q> guardianes_estelares` (menú, 1280×800):

| Calidad | FPS | peor cuadro | DCL / load | heap | long tasks | nodos DOM | requests / KB |
|---|---|---|---|---|---|---|---|
| media (`ML_QUALITY=medium`) | 26,2 | 150 ms | 456 / 838 ms | 8,0 MB | 2 | 277 | 21 / 1072 |
| baja (`ML_QUALITY=low`) | 26,2 | 100 ms | 214 / 544 ms | 9,2 MB | 2 | 277 | 21 / 1072 |

En juego (gancho `perf`, 5 s con disparo continuo, 1280×800):

| Calidad · escena | draw calls (máx.) | triángulos (máx.) | render JS (ms/cuadro) | update JS (ms/cuadro) | heap | FPS (SwiftShader, máquina cargada) |
|---|---|---|---|---|---|---|
| media · cinturón + 6 enemigos | 71 | 24 004 | 4,5 | 2,5 | 13,7 MB | 5,2 |
| media · jefe | 64 | 9 452 | 3,2 | 1,4 | 12,3 MB | 5,0 |
| baja · cinturón + 6 enemigos | 59 | 17 040 | 3,4 | 1,7 | 12,2 MB | 5,8 |
| baja · jefe | 60 | 8 458 | 4,0 | 1,5 | 12,7 MB | 5,4 |

Alta (con sombras) en el menú: 20 draw calls / 36 k triángulos. El costo de JS por cuadro (≈5–7 ms) deja margen para 60 FPS en GPU real; el cuello en headless es la rasterización por CPU. Optimizaciones: rocas/cristales/enemigos/proyectiles/minas/líneas de aviso con `InstancedMesh`, partículas en un solo `Points`, modelos fusionados, pools sin asignaciones en el bucle de simulación, HUD de texto cada 6 cuadros y radar cada 4, sombras sólo en alta, cielo/estrellas que acompañan a la cámara (no se recortan con el plano lejano reducido de baja).

## Pendiente / NO PROBADO

- Gamepad real: mapeado vía SDK, **NO PROBADO** con un mando físico (las pruebas ocultan los mandos).
- FPS en dispositivos reales: **NO PROBADO**; las cifras son de Chromium headless con SwiftShader (render por CPU).
- Vista de cabina 3D (el spec lista «HUD cockpit» como asset): se resolvió como HUD de cabina en DOM (paneles, retícula, radar); no hay modelo 3D de cabina ni cámara interior.
- Los modelos son procedurales en código, no archivos glTF/GLB (el brief pide no usar assets externos; los GLB del paquete no encajaban con la estética).
- Reasignación de teclas: hay opciones (sensibilidad, inversión, mouse, disparo asistido) pero no remapeo tecla por tecla.
- Balance: ajustado con un bot de prueba simple (gana el sector 1 perdiendo un carguero en Normal); falta prueba con jugadores reales en Difícil/Extremo.
