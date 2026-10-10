# ¡CLAVADO! (`clavado.html`)

## Estado anterior

- **Tecnología:** un solo HTML con Canvas 2D y JavaScript plano (IIFE), sin dependencias salvo Google Fonts (Bungee, Space Grotesk) y la intro de marca `matelabs/intro.js`. Audio sintetizado con Web Audio (osciladores creados por sonido, conectados directo a `destination`).
- **Mecánicas:** un tronco gira en el centro; el jugador lanza cuchillos (clic, toque, Espacio o Enter). Si el cuchillo cae a menos de ~0,105 rad de otro ya clavado, se rompe y se termina la partida. Cada nivel trae 6–8 cuchillos, manzanas (+50) y, desde el nivel 3, cuchillos preclavados. Clavadas seguidas en menos de 1,5 s suman combo (10 × combo). La rotación cambia por nivel: constante, senoidal, ida y vuelta y cambio brusco de sentido, con velocidad base creciente (tope 3 rad/s).
- **Pantallas/estados:** `menu` (con una demo automática que lanza cuchillos sola), `playing`, `clear` (cartel de nivel superado), `over` (tarjeta con puntos, nivel, manzanas y récord).
- **Persistencia:** récord en `localStorage['clavado_best']`.
- **Bucle:** `requestAnimationFrame` con `dt` acotado a 33 ms; DPR acotado a 2.

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | alto | CONFIRMADO | Al romperse un cuchillo, `land()` no cambiaba `knifeState` (quedaba en `'fly'`), así que el mismo lanzamiento se volvía a resolver en cada cuadro: varios `shatter()`/`sBreak()` y varios `setTimeout(gameOver, 750)` → `gameOver()` (y el sonido de derrota) se ejecutaba varias veces encimado. | Script Playwright que espamea Espacio y cuenta `setTimeout` por demora: en 5 partidas hubo 6, 6, 2, 1 y 2 llamadas de 750 ms (y la misma cantidad de `gameOver`) por cada rotura. |
| 2 | alto | CONFIRMADO | Durante los 750 ms entre la rotura y el game over el estado seguía en `playing`: cuando el tronco giraba fuera de la zona de choque, el cuchillo roto **se clavaba y sumaba puntos**, y además se podían seguir lanzando cuchillos e incluso pasar de nivel. | Mismo script, leyendo el HUD en la primera rotura y en la tarjeta final: 5110→5430, 2200→2860, 6050→6760, 2100→2530, 1710→2100. |
| 3 | medio | CONFIRMADO (por diseño del código) | Todos los temporizadores del juego (recarga 230 ms, nivel superado 1,1 s, game over 750 ms, tarjeta 250 ms, demo 600 ms) eran `setTimeout` de reloj real: no se pueden congelar con una pausa (el nivel avanzaría o la partida terminaría con el juego en pausa). | Lectura del código; era bloqueante para integrar la pausa del SDK. |
| 4 | medio | CONFIRMADO | Sin pausa, sin silencio y sin forma de volver al arcade. El `AudioContext` nunca se suspendía ni cerraba. | Revisión en navegador. |
| 5 | bajo | CONFIRMADO | Mantener Espacio apretado (autorepetición) en la pantalla final reiniciaba la partida sola apenas pasaban 500 ms. | Lectura del código: `keydown` sin filtrar `e.repeat`. |
| 6 | bajo | CONFIRMADO | En el menú y la pantalla final, el texto inferior (`.foot`) quedaba encimado con la marca de agua «MATELABS». | Captura en Pixel 7 y en escritorio. |
| 7 | bajo | CONFIRMADO | Textos sin voseo: «TOCA PARA JUGAR», «o toca en cualquier parte». | Lectura. |
| 8 | bajo | CONFIRMADO | Se creaban en cada cuadro 3 degradados de fondo/tronco + 2 por cada cuchillo dibujado (hasta ~30 objetos por cuadro en niveles altos). | Lectura del código de `render()`/`drawKnife()`. |
| 9 | bajo | SOSPECHADO | El combo no tiene tope (10 × combo), así que lanzar rápido da puntajes muy altos. Es parte del diseño original; no se tocó. | Puntajes de miles en las corridas del hallazgo 2. |

## Cambios implementados

- **Rotura resuelta una sola vez:** `land()` pone `knifeState='none'` al llegar; la rotura pasa a un estado nuevo `dying` (el tronco sigue girando, pero no se aceptan lanzamientos ni se suma nada) y `gameOver()` sólo actúa desde `dying`, así que corre una única vez.
- **Temporizadores en tiempo de simulación** (`after(seg, fn)` + `tickTimers(dt)`): reemplazan todos los `setTimeout`, se congelan con la pausa y se limpian al reiniciar.
- **SDK MateLabs** (`matelabs/arcade.js` en el `<head>`):
  - `toolbar: 'tr'`; el bloque NIVEL del HUD baja 40 px para no quedar tapado (verificado en capturas de escritorio y Pixel 7, y con un test de superposición de cajas).
  - `isActive`: `playing`, `clear` o `dying`.
  - `onPause`: detiene el `requestAnimationFrame` y suspende el `AudioContext`; `onResume`: reanuda el audio y reinicia el bucle con `last=performance.now()` (sin salto de `dt`).
  - `onRestart`: nueva partida desde cero. `onExit`: corta el bucle y cierra el `AudioContext` (con `pageshow` para volver desde el bfcache).
  - `onMute`: ganancia maestra a 0; además el estado inicial se lee de `MLArcade.settings.get('muted')` y no se programan osciladores mientras está silenciado.
  - `MLArcade.started()` al arrancar y `MLArcade.ended({score})` al terminar (una sola vez por partida).
  - Récord: se lee de `MLArcade.scores.best()` (que migra `clavado_best`) y se sigue escribiendo `clavado_best` por compatibilidad. El chip «TU RÉCORD» del menú se actualiza.
  - Gamepad `{a: 'Space'}` (A lanza, Start pausa); ayuda propia en el menú de pausa.
- Autorepetición de teclado ignorada fuera de la partida (no reinicia sola).
- Degradados cacheados: fondo/tronco al redimensionar, cuchillo una sola vez. Canvas con tamaño entero y redibujo al redimensionar en pausa.
- `.foot` subido para no pisar la marca de agua; textos con voseo («TOCÁ PARA JUGAR», «o tocá…»).
- Gancho de pruebas `window.__clavado` (`snap()` y `forceNextHit()` para forzar un choque sin depender del azar).

## Mediciones antes/después

`node tests/perf/measure.mjs after-clavado clavado` (Chromium headless, SwiftShader, 1280×800, menú). Ojo: el «después» se midió con la máquina muy cargada (load average ≈ 22–30 en 12 núcleos por otros agentes corriendo Playwright en paralelo); el «antes» es `.perf/before.json`.

| Métrica | Antes | Después (corrida 1) | Después (corrida 2) |
|---|---|---|---|
| FPS menú | 60.3 | 60.2 | 60.1 |
| Peor cuadro (ms) | 16.8 | 16.8 | 16.8 |
| DOMContentLoaded (ms) | 132 | 293 | 271 |
| load (ms) | 252 | 438 | 364 |
| Heap JS (MB) | 2.9 | 2.6 | 2.4 |
| Long tasks | 0 | 1 | 1 |
| Nodos DOM | 57 | 80 | 80 |
| Requests / KB | 6 / 75 | 8 / 111 | 8 / 111 |
| Errores | 0 | 0 | 0 |

Los requests/KB/nodos extra son el SDK (`arcade.js`, `registry.js`, barra y menú de pausa). Los tiempos de carga más altos son coherentes con la carga de la máquina y los 2 scripts extra; no se pudo medir el original en las mismas condiciones.

## Pruebas

`tests/e2e/clavado.spec.js` (7 tests × 2 proyectos; el de toque se saltea en escritorio):

1. Carga sin errores, la demo del menú gira y la barra del SDK está visible.
2. Arranca con entrada real (Espacio / toque), clava un cuchillo, suma puntos, telemetría `start`, y la barra no se superpone con PUNTOS ni NIVEL.
3. Escape congela el juego (`theta` y `time` idénticos tras 1 s), la entrada queda bloqueada y Reanudar continúa sin salto de tiempo.
4. Reiniciar desde el menú de pausa deja puntaje 0, nivel 1, tronco vacío y el bucle vivo.
5. Romper un cuchillo: game over único (`MLArcade.ended` llamado 1 vez), el puntaje no sigue subiendo, insignia de récord, `clavado_best` y `ml:scores.clavado` guardados, «otra vez» con entrada real y récord persistido tras recargar.
6. Redimensionar a 360×640: canvas a pantalla completa, sin scroll horizontal, se sigue jugando.
7. (móvil) El toque lanza el cuchillo y tocar la barra del SDK no lanza.

Resultado real (`ML_WORKERS=1 npx playwright test tests/e2e/clavado.spec.js`), dos corridas seguidas: **13 passed, 1 skipped** (desktop 6/6 + 1 skip, mobile 7/7).

Nota: con la máquina saturada, Chromium headless dejaba de entregar cuadros (`requestAnimationFrame`) durante varios segundos — también en una sonda rAF independiente del juego — y los primeros tiempos de espera de 5 s fallaban. Los tiempos de espera del spec son holgados (20 s) por eso.

## Pendientes / problemas conocidos

- El combo sin tope (hallazgo 9) se dejó como está por ser parte del diseño.
- Los textos flotantes (`+10`, `¡ROTO!`) guardan coordenadas absolutas: si se redimensiona justo mientras están en pantalla, quedan desplazados un instante.
- El fondo del menú y de la pantalla final se sigue animando (es la demo del juego); no hay ahorro de CPU extra ahí.
- No se verificó el audio de forma audible en headless; mute/pausa del audio están revisados a nivel de código.

## MiniArcade 3.0

### Estado antes → después

- **Antes:** un único tronco (mismo dibujo en todos los niveles), 4 patrones de giro, manzanas y cuchillos preclavados, sin misiones, sin dificultad, sin niveles de calidad. Fondo plano con luciérnagas.
- **Después:** 4 biomas con fondo propio y paralaje, tronco 2.5D (canto, sombra proyectada, luz estática), placas de acero y hielo, compuertas que abren y cierran, 3 patrones de giro nuevos, troncos jefe con fases cada 5 niveles, reto por nivel con recompensa, misiones MLMissions, dificultad Fácil/Normal/Difícil/Extremo y calidad baja/media/alta con costos reales. La mecánica original (un toque, vuelo de 0,11 s, choque angular a 0,105 rad, manzana a 0,17 rad, combo 10 × combo) no se tocó.

### Precisión preservada

`angDiff`, el umbral de choque cuchillo-cuchillo (0,105 rad), el de manzana (0,17 rad), el vuelo de 0,11 s y la posición de clavado (`-theta`) son idénticos al original. Las placas se evalúan **después** del choque entre cuchillos (si un cuchillo cae a menos de 0,105 de otro, se rompe aunque haya una placa). Los efectos visuales (retroceso del tronco, vibración del cuchillo clavado) son sólo de dibujo: no cambian ángulos ni colisiones. La prueba «choque cuchillo-cuchillo» verifica 0,11 rad → entra y 0,10 rad → se rompe con la matemática real.

### Misiones (MLMissions, `hud: 'br'`, 2 secundarias por partida)

| id | tipo | título | evento | objetivo |
|---|---|---|---|---|
| p_boss1 | principal | Derribá al Roble Milenario | `bossDefeated` | 1 |
| p_lv10 | principal | Llegá al nivel 10 | `level` (máx.) | 10 |
| s_graze | secundaria | Rozá 3 cuchillos | `nearMiss` (clavar entre 0,105 y 0,2 rad de otro) | 3 |
| s_armor | secundaria | 2 niveles blindados sin rebotes | `armorClear`, falla con `deflect` | 2 |
| s_combo5 | secundaria | Combo ×5 | `combo` (máx.) | 5 |
| s_apples | secundaria | Cortá 4 manzanas | `apple` | 4 |
| s_jam | secundaria | Trabá 2 compuertas | `jam` | 2 |
| s_goals | secundaria | Cumplí 3 retos de nivel | `levelGoal` | 3 |

`runStart()` al empezar cada partida (también «otra vez» y Reiniciar desde la pausa, que primero cierra la partida en curso con `runEnd`); `runEnd({won:false})` en el game over y en `onExit` (volver al arcade / cerrar la pestaña). Todos los eventos se emiten desde `land()`/`levelClear()`/`setupLevel()` (lógica), nunca desde el dibujo, y no se emiten en la demo del menú.

**Reto del nivel** (misión principal de cada nivel, propia del juego): aparece bajo el número de nivel (`★ RETO: …`). Tipos: cortar todas las manzanas, combo ×N, rozar un cuchillo, sin rebotar en placas (los jefes siempre tienen este). Cumplirlo paga **+100** una sola vez por nivel.

### Dificultad (selector en el menú de inicio, no durante la partida)

| Parámetro | Fácil | Normal (= original) | Difícil | Extremo |
|---|---|---|---|---|
| Velocidad de giro | ×0,8 | ×1 | ×1,15 | ×1,3 |
| Tope de velocidad (rad/s) | 2,6 | 3,0 | 3,3 | 3,6 |
| Cuchillos preclavados (desde nivel 3) | −1 | ±0 | +1 | +2 |
| Ventana de combo | 1,8 s | 1,5 s | 1,3 s | 1,1 s |
| Tiempo con compuertas abiertas | ×1,3 | ×1 | ×0,85 | ×0,7 |
| Cuchillos por fase de jefe | −1 | ±0 | +1 | +1 |
| Umbral de choque / manzana | 0,105 / 0,17 | igual | igual | igual |

Normal reproduce exactamente la velocidad base del original (`min(0,65 + 0,24·nivel, 3)`). Hay **un solo récord** para todas las dificultades (el del SDK, `ml:scores` + `clavado_best`); la pantalla final muestra con qué dificultad se jugó.

### Calidad (`onQuality`)

| | Baja | Media | Alta |
|---|---|---|---|
| Tope de DPR del canvas | 1 | 1,5 | 2 |
| Tope de partículas | 70 | 180 | 340 |
| Multiplicador de partículas por efecto | ×0,5 | ×1 | ×1,4 |
| Partículas ambientales | 6 | 16 | 28 |
| Capas de paralaje | 1 | 2 | 3 |
| Sombras (tronco, cuchillos, manzanas) | no | sí | sí |
| Capa de luz del tronco | no | sí | sí |
| Resolución de las capas de fondo | ×0,75 | ×1 | ×1,5 (con tope de DPR) |

Cambiar la calidad reconstruye las cachés y redimensiona el canvas en el momento.

### Contenido nuevo

- **Biomas** (cambian cada 5 niveles y se repiten): Bosque (1–5), Nieve (6–10), Volcán (11–15), Caverna de cristal (16–20). Cada uno con degradado, luz, 3 capas de siluetas procedurales (pinos, montañas nevadas, volcán con cráter, cristales), partículas ambientales (luciérnagas, nieve, brasas, destellos), piso y madera propia (abedul, madera quemada con grietas de brasa, madera petrificada con vetas).
- **Placas** (estructurales, con silueta y color distintos): acero (rebota siempre), hielo (rebota y se rompe al segundo golpe), compuertas (se abren y cierran con un ciclo de 3,4 s; 0,6 s antes de cerrarse el marco late en ámbar, suave y sin destellos; si clavás con la compuerta abierta queda **trabada** abierta). Un rebote no gasta el cuchillo, corta el combo y vuelve a estar listo a los 0,45 s. Aparecen en el nivel 3 (acero), 4 (compuertas) y desde el 6 según el bioma.
- **Patrones de giro nuevos:** «arranca y frena» (`stopgo`, pausas legibles), «trinquete» (`ratchet`, empujones cortos) y «oleaje» (`surge`, acelera y cambia de sentido). Los niveles 1–4 mantienen los patrones originales.
- **Troncos jefe** cada 5 niveles: Roble Milenario (3 fases), Abeto de Hielo (3), Tronco de Basalto (3), Tronco Petrificado (4). Cada fase tiene su patrón, sus placas y su cantidad de cuchillos; al terminar una fase los cuchillos clavados saltan, la corteza se agrieta y arranca la siguiente. Barra de fases con los cuchillos que faltan. Al derribarlo el tronco estalla en astillas y paga **200 × número de jefe + 100 × fases** (Roble: +500). Después de los 4, se repiten 12 % más rápidos (con tope por dificultad).
- **Efectos de clavada:** onda de impacto, astillas del color de la madera del bioma, polvo de aserrín, retroceso del tronco y vibración amortiguada del cuchillo (desactivada con `prefers-reduced-motion`, que además reduce el temblor de pantalla al 25 %).

### Cambios visuales y de rendimiento

- El tronco se dibuja con 4 `drawImage` por cuadro (sombra+canto, cara rotada, luz) en vez de ~40 trazos: la cara (anillos irregulares, corteza, nudos, grietas, aro de hierro del jefe) se pinta una vez en un canvas fuera de pantalla y se rota.
- Capas de paralaje cacheadas (silueta repetible en X, dos `drawImage` por capa).
- Partículas ambientales sin estado por cuadro (posición en función del tiempo) y sin strings `rgba()` nuevos por luciérnaga.

### Pruebas

`tests/e2e/clavado.spec.js`: los 7 tests anteriores + 10 nuevos (`¡Clavado! 3.0`): choque cuchillo-cuchillo con la matemática real (0,11 entra / 0,10 rompe), patrones (cambios de sentido en flip y oleaje, frenadas en arranca-frena), placas de acero y hielo, compuertas (ciclo real + trabar/rebotar), jefe completo de 3 fases con recompensa y misión principal, misiones (secundaria cumplida, secundaria fallada por `failOn`, reinicio, persistencia), dificultad (teclado + toque, persiste, cambia la velocidad real), calidad (DPR del canvas, partículas, capas, sombras, botón de la pausa), reto del nivel (+100 una vez) y biomas + reinicio limpio desde un jefe.

Los atajos de depuración (`__clavado.debug`: `setLevel`, `setSpin`, `aim`, `aimFree`, `forcePlate`) sólo existen con `?debug`. Las pruebas anulan `navigator.getGamepads`: la máquina de pruebas tiene gamepads físicos (ShanWan / XBOX 360) que Chromium headless también ve, y su botón A (→ Espacio) arrancaba partidas solo. El SDK ahora los ignora bajo automatización (`navigator.webdriver`); la anulación en el spec queda como doble resguardo.

**Resultado real** (`ML_WORKERS=1 npx playwright test tests/e2e/clavado.spec.js`, corrida final completa, load average ≈ 30): **33 passed, 1 skipped** (desktop 16/16 + 1 skip del test de toque; mobile 17/17), 6,7 min. En corridas anteriores con la máquina a load ≈ 60–70 fallaron por falta de cuadros (no por lógica): el test de patrones (necesita varios segundos de tiempo de juego y el `dt` está acotado a 33 ms, así que con 2–5 fps el tiempo de juego avanza muy lento) y una vez la espera del nivel 6 después del jefe; se ampliaron sus tiempos de espera (90 s de sondeo, 300 s / 240 s por test) y pasaron en la corrida aislada y en la final. Antes de mover el selector de dificultad al pie del menú, 9 tests de móvil fallaban porque el toque de `start()` en (200, 600) caía sobre el selector (que frena la propagación): por eso el selector va abajo, lejos del centro.

Capturas revisadas con Read: 1280×800, Pixel 7 vertical (412×915) y horizontal (915×412) — menú, jefe del nivel 5 y niveles de nieve / volcán / cristal. En vertical angosto la barra del jefe baja sobre el cuchillo listo para no pisar PUNTOS; en horizontal bajo se ocultan el texto, el crédito y los chips de controles del menú.

### Mediciones (juego real)

Script propio (Chromium headless, SwiftShader, 1280×800, DPR 1): arranca y lanza un cuchillo cada ~0,45 s durante 15 s, reinicia al perder. «Antes» = `clavado.html` original servido por `page.route` desde una copia exacta. Máquina con load average 25–31 (otros agentes corriendo), así que los intervalos de cuadro están dominados por la carga.

| Corrida | Cuadros | Intervalo medio (ms) | p95 (ms) | Peor (ms) | Heap (MB) | Partículas máx. | Costo update+render del juego (ms, media móvil) |
|---|---|---|---|---|---|---|---|
| Antes #1 | 879 | 17,2 | 16,8 | 66,6 | 1,5 | 35 | — (el original no lo mide) |
| Antes #2 | 831 | 18,0 | 33,3 | 50,1 | 2,8 | 33 | — |
| Después media #1 | 752 | 20,5 | 33,4 | 66,7 | 1,7 | 35 | 0,69 |
| Después media #2 | 826 | 18,4 | 33,3 | 50,1 | 1,9 | 37 | 0,72 |
| Después baja #1 | 803 | 19,0 | 33,4 | 50,0 | 2,2 | 13 | 0,65 |
| Después baja #2 | 692 | 21,7 | 33,4 | 66,6 | 2,1 | 18 | 0,71 |

Lectura honesta: el costo propio del juego por cuadro queda por debajo de 1 ms en media y baja; las diferencias de intervalo de cuadro entre corridas (17–22 ms) están dentro del ruido de la máquina cargada y no permiten afirmar una mejora ni un empeoramiento. Lo que sí es medible y determinista: la baja reduce a la mitad las partículas por efecto (máx. 13–18 contra 35–37) y el canvas usa DPR ≤ 1 (en un Pixel 7, DPR 2,625: 412 px de ancho en baja contra 824 en alta, verificado por el test de calidad). No se midieron llamadas de dibujo (Canvas 2D no las expone).

### Pendientes / NO PROBADO

- **Audio**: los sonidos nuevos (rebote metálico, hielo, compuerta trabada, cambio de fase, reto) no se escucharon; sólo se verificó que no hay errores.
- **Jefes 2–4** (Abeto de Hielo, Tronco de Basalto, Tronco Petrificado) y el ciclo «+12 %» después del nivel 20: probados sólo su armado (nombre, bioma, placas); el jefe completo de punta a punta se probó con el Roble Milenario.
- Misiones `s_combo5`, `s_apples`, `s_jam`, `s_goals`, `p_lv10`: los eventos se emiten y se prueban indirectamente (combo/manzana/trabar/reto), pero no hay un test que complete cada una de esas misiones.
- `prefers-reduced-motion`: implementado (sin vibración del cuchillo, temblor al 25 %, aviso de compuerta fijo), no cubierto por un test.
- Récord por dificultad: no (un solo récord, como antes).
- Rendimiento en un teléfono real: no medido.
