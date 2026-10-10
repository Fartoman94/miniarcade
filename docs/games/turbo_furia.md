# TURBO FURIA — auditoría y modernización

## Estado anterior

- **Tecnología:** un único `turbo_furia.html`, Three.js r128 desde cdnjs (sin otras dependencias), fuentes de Google Fonts (Bungee, Space Grotesk), intro de marca `matelabs/intro.js`.
- **Mecánicas:** carrera infinita en una ruta de 4 carriles. Se elige vehículo en un garaje 3D (3 autos y 2 motos con velocidad máxima y agilidad distintas). Se cambia de carril libremente, se frena y se usa nitro (barra que se gasta y se recarga). Tráfico con 6 tipos de vehículo y velocidades distintas; adelantar suma 5, pasar rozando ("CASI") suma 50 × combo, cada 5 km hay un hito (+100). 3 vidas con 2 s de invulnerabilidad tras un choque. La dificultad crece con los km (más velocidad tope y más frecuencia de tráfico).
- **Pantallas:** garaje (selección) → cuenta regresiva 3-2-1-¡YA! → carrera con HUD (puntos, vidas, récord, km/h, nitro, combo) → pantalla final (puntos, km, adelantados, "casi", récord nuevo) con "OTRA VEZ" y "GARAJE".
- **Entrada:** teclado (flechas/A D, ↓/S freno, Shift/Espacio nitro, Enter largar), táctil (arrastrar el dedo para doblar, botones FRENO y NITRO).
- **Audio:** WebAudio sintetizado (motor continuo con 2 osciladores + efectos), sin control de volumen ni silencio.
- **Persistencia:** récord en `localStorage['turbo_best']`.
- No tenía pausa, ni botón de sonido, ni soporte de gamepad.

## Hallazgos de la auditoría

| # | Severidad | Estado | Descripción | Cómo se reprodujo |
|---|---|---|---|---|
| 1 | alto | CONFIRMADO | Fuga de memoria de GPU: cada cambio de vehículo en el garaje y cada carrera nueva creaban un vehículo nuevo (≈20 geometrías + materiales) y el anterior sólo se sacaba de la escena, nunca se hacía `dispose()`. | Script Playwright contando `createBuffer`/`deleteBuffer` de WebGL: 20 cambios de vehículo llevaron los buffers vivos de **112 a 1392**. Tras el arreglo: **112 → 112**. |
| 2 | alto | CONFIRMADO | En celular vertical (Pixel 7, 412×915) la cámara (FOV vertical 62°) sólo mostraba los 2 carriles del centro cerca del auto: el tráfico de los carriles exteriores aparecía sin aviso. | Captura en el proyecto mobile: los carriles ±5,25 quedaban fuera de cuadro. |
| 3 | medio | CONFIRMADO | Sin pausa: la única forma de parar era cambiar de pestaña (rAF se frena) y al volver el juego seguía sin aviso. Cuenta regresiva y fin de partida usaban `setTimeout`, imposibles de congelar. | Lectura de código; con el SDK integrado los timers seguirían corriendo en pausa. |
| 4 | medio | CONFIRMADO | Con teclado/gamepad no se podía volver a correr desde la pantalla final (sólo con clic), y Espacio (botón A del gamepad) no largaba desde el garaje. | Playwright: `Space` en el garaje no ocultaba `#garage` (`false`). |
| 5 | medio | CONFIRMADO | Teclas "pegadas": si la ventana perdía el foco con una flecha apretada, el `keyup` nunca llegaba y el auto seguía doblando solo. | Playwright: `keydown ArrowLeft` + `blur` → el auto quedó contra el borde izquierdo (captura). |
| 6 | bajo | CONFIRMADO | Tras la pantalla final el auto volvía a acelerar a velocidad tope detrás del overlay (la velocidad objetivo sólo era 0 en `dying`). | Lectura de código (`target` sólo contemplaba `dying`). |
| 7 | bajo | SOSPECHADO | El spawn sólo verificaba el carril propio: podían aparecer 4 vehículos casi a la misma altura y cerrar la ruta (choque inevitable). | No reproducido en la práctica (es aleatorio); se mitigó igual. |
| 8 | bajo | CONFIRMADO | Asignaciones por cuadro: arrays literales de colores creados en cada partícula de nitro. | Lectura de código. |
| 9 | bajo | CONFIRMADO | Sin control de sonido; el audio iba directo a `AC.destination`. | Lectura de código. |
| 10 | bajo | CONFIRMADO | El `resize` no actualizaba el `pixelRatio` (cambio de monitor/zoom). | Lectura de código. |

## Cambios implementados

- **Fuga de GPU (#1):** función `disposeObj()` que libera geometrías, materiales y texturas del vehículo de vista previa y del vehículo del jugador al reemplazarlos. El tráfico ya usaba pools.
- **Cámara en vertical (#2):** `fitCamera()` ajusta FOV (hasta 86°), altura y distancia de la cámara según la relación de aspecto, y atenúa el seguimiento lateral; en horizontal queda igual que antes. El FOV dinámico (velocidad + nitro) se limita a 100°.
- **SDK MateLabs (`matelabs/arcade.js`):** `MLArcade.init({ id:'turbo_furia', toolbar:'tr', ... })`.
  - Pausa real: `onPause` detiene el `requestAnimationFrame` (cero CPU), libera entradas y suspende el `AudioContext`; `onResume` reanuda audio y reinicia el reloj del loop (sin salto de `dt`).
  - Cuenta regresiva y espera de fin de partida pasaron a llevarse en `update(dt)`, así se congelan en pausa y un reinicio no deja timers colgados.
  - `isActive`: cuenta regresiva, carrera y animación de choque final.
  - `onRestart` → nueva carrera con el mismo vehículo; `onExit` corta el loop y cierra el `AudioContext`.
  - `onMute` controla un nodo de ganancia maestro nuevo (todo el audio pasa por él); respeta el ajuste inicial.
  - `MLArcade.started()` al largar y `MLArcade.ended({score})` al terminar (guarda el récord en `ml:scores`). Se sigue escribiendo `turbo_best` y el récord mostrado es el mayor entre ambos.
  - Gamepad: stick/cruceta doblar, A nitro (y largar/otra vez en menús), X o LT freno, RT nitro, B/Start pausa.
  - Ayuda del menú de pausa en español con todos los controles.
  - Barra arriba a la derecha: se bajaron las vidas/récord (`top:56px`) y la firma vertical del garaje; en pantallas angostas la firma "CREADO POR MATELABS" del HUD pasa abajo al centro para no quedar tapada.
- **Teclado en menús (#4):** Enter o Espacio larga desde el garaje (A/D también cambian de vehículo); en la pantalla final Enter/Espacio = "OTRA VEZ" y G/Retroceso = "GARAJE" (con 0,7 s de gracia para no saltearla por accidente). Se ignoran repeticiones de tecla.
- **Teclas pegadas (#5):** `releaseInput()` en `blur` y al pausar.
- **Fin de partida (#6):** el auto queda detenido detrás de la pantalla final.
- **Spawn justo (#7):** no se genera un vehículo si los otros 3 carriles ya tienen uno a menos de 14 m de esa altura.
- **Varios:** colores constantes fuera del bucle, `pixelRatio` (máx. 2) recalculado en `resize`, repintado del cuadro congelado si se redimensiona en pausa, chip de controles del garaje menciona el freno.
- **Ganchos de prueba:** `window.__turbo` (sólo lectura: estado, puntos, distancia, vidas, etc.). Con `?test=1` existe `__turbo.forceCrash()` para probar el fin de partida en tiempo razonable.

## Mediciones antes/después

`node tests/perf/measure.mjs` (Chromium headless, WebGL por **SwiftShader/CPU**, 1280×800, mide el garaje, que es la pantalla inicial).

| Medición | `before.json` (commit anterior, máquina tranquila) | `after-turbo_furia.json` |
|---|---|---|
| FPS | 60,2 | 12,1 |
| Peor cuadro | 16,8 ms | 166,7 ms |
| DCL / load | 589 ms | 3714 ms |
| Heap JS | 5 MB | 6 MB |
| Long tasks | 0 | 3 |
| Nodos DOM | 94 | 117 (barra + menú de pausa del SDK) |
| Requests / KB | 7 / 684 | 9 / 721 (`arcade.js` + `registry.js`) |

**Advertencia:** la medición "después" se hizo con otros 7 agentes renderizando WebGL por CPU al mismo tiempo (load average 42–56 en 12 núcleos); en esa misma corrida `index.html` también cayó de 60,2 a 48,4 FPS. Para separar carga de la máquina de cambios del juego se midió la **versión original y la nueva una después de la otra**, bajo la misma carga (original servida desde una copia aparte):

| Corrida | Original FPS / peor cuadro | Nueva FPS / peor cuadro |
|---|---|---|
| 1 | 11,4 / 166,7 ms | 7,5 / 816,7 ms |
| 2 | 13,2 / 604,1 ms | 13,6 / 166,6 ms |

Las diferencias son ruido de la máquina; el código de render del garaje no cambió. La mejora concreta medible es la de memoria de GPU (hallazgo #1: 1392 → 112 buffers tras 20 cambios de vehículo).

## Pruebas

`tests/e2e/turbo_furia.spec.js` (Playwright, `ML_WORKERS=1`, proyectos desktop y mobile Pixel 7):

1. Carga sin errores de consola; garaje y barra del arcade visibles.
2. Carrera iniciada con entrada real (Enter en PC, toque en "¡A LA RUTA!" en celular); la distancia y la velocidad avanzan; Escape pausa y el estado (distancia, puntos) queda idéntico durante 1 s; "Reanudar" continúa sin salto de distancia; "Reiniciar partida" del menú vuelve a la cuenta regresiva con distancia 0 y 3 vidas.
3. Fin de partida (3 choques con `forceCrash`): aparece la pantalla final con récord nuevo, se guardan `turbo_best` y `ml:scores.turbo_furia`, telemetría `start/end/score`; Enter vuelve a largar; tras recargar el récord sigue en el HUD.
4. Viewport 390×844: sin scroll horizontal, canvas a pantalla completa, la barra no tapa las vidas.
5. Táctil (sólo mobile, eventos touch reales vía CDP): mantener a la derecha dobla a la derecha, a la izquierda vuelve; el botón NITRO se activa mientras se mantiene.
6. El botón de sonido de la barra silencia el juego.

Resultado real: **11 passed, 1 skipped** (el test táctil se saltea en desktop) — desktop 5/5, mobile 6/6, 2,0 min.

## Pendientes / problemas conocidos

- El registro (`games/registry.js`) no menciona el freno en los controles; ver corrección sugerida en el reporte.
- `MLArcade.scores.best()` ignora `legacyBestKey` si se llama antes de que cargue el registro (import asíncrono); el juego lo resuelve leyendo también `turbo_best`.
- Las animaciones CSS (banner de cuenta, popups de puntos) siguen corriendo durante la pausa; es sólo visual.
- No se probó en dispositivos reales ni con un gamepad físico (el mapa se configuró pero no se verificó con hardware).
- Las mediciones de FPS no son representativas por la carga de la máquina durante la sesión (ver arriba).

## MiniArcade 3.0

### Estado antes → después

| | Antes | Después |
|---|---|---|
| Vehículos | 5 (3 autos, 2 motos), modelos de cajas, 2 stats (vel., agilidad) | 9: los 5 originales + 4 especiales desbloqueables (HIPERNOVA X, FLECHA SOLAR, MONSTRUO 6X6, COHETE 77); siluetas por perfil extruido, ruedas con rayos que giran, ruedas delanteras que doblan, cabeceo al acelerar/frenar, luces de freno; 3 stats (VEL, ACEL, MANEJO) con aceleración propia por vehículo |
| Modos | 1 (infinita) | 3: Clásica (la original + eventos), Contrarreloj, Duelo contra rival con IA |
| Tráfico | 6 tipos, siempre en su carril | 8 tipos (+camioneta van, colectivo); algunos cambian de carril con **guiño de 1 s antes** |
| Peligros / eventos | — | Obras en la ruta (cartel naranja 70 m antes + aviso en HUD), latas de nitro, rival que aparece de atrás y hay que pasar |
| Escenario | Desierto al atardecer fijo | 4 biomas que se suceden cada 3 km con transición de 400 m: Desierto·atardecer, Costa·mediodía (mar), Bosque·noche (estrellas, luna, haz de luces), Ciudad neón·noche (skyline) |
| Nitro | ×1,3 vel. tope, partículas | además aceleración ×2,4, llamas en el escape, borde cálido en pantalla, cámara que retrocede/baja + FOV, líneas de velocidad, sonido más grave y filtro abierto |
| Progreso | Récord único `turbo_best` | + `turbo:progress` (desbloqueos, km totales, etc.) y `turbo:ranking` (ranking **local** por vehículo/modo/dificultad) con migración |
| SDK 3.0 | — | MLMissions (11 misiones), dificultad, `onQuality`, `requireWebGL()` |

### Misiones (MLMissions, `hud:'tl'`, 2 secundarias por partida)

Los eventos se emiten desde la lógica del juego (no del render).

| id | Tipo | Misión | Evento | Meta |
|---|---|---|---|---|
| tf_km3 | principal | Recorré 3 km | `km` (máx., cada 100 m) | 3 |
| tf_km6 | principal | Recorré 6 km | `km` (máx.) | 6 |
| tf_clean | secundaria | 10 adelantamientos limpios (sin choque en los últimos 5 s) | `cleanOvertake` | 10 |
| tf_near | secundaria | Hacé 5 «CASI» | `nearMiss` | 5 |
| tf_combo | secundaria | Combo CASI ×3 | `combo` (máx.) | 3 |
| tf_nocrash | secundaria | 2 km sin chocar | `km` (máx.), **failOn `crash`** | 2 |
| tf_rival | secundaria | Superá a un rival | `rivalBeat` | 1 |
| tf_works | secundaria | Esquivá 3 obras | `worksDodged` | 3 |
| tf_cans | secundaria | Juntá 3 latas de nitro | `nitroCan` | 3 |
| tf_nitro | secundaria | Nitro a fondo 3 s | `nitroHold` (máx.) | 3 |
| tf_record | secundaria | Superá tu récord (o 1000 pts si no hay récord) | `record` | 1 |

`runStart()` al largar (también desde «Reiniciar partida» y «Otra vez», cerrando antes la partida en curso con `runEnd({won:false})`); `runEnd({won})` en la pantalla final (Duelo: ganó/perdió; Contrarreloj: `won:true`; Clásica: `false`), al volver al garaje y en `onExit`. Las fichas van arriba a la izquierda; los puntos bajaron debajo (la barra del arcade está arriba a la derecha). La firma «CREADO POR MATELABS» del HUD pasó abajo al centro también en PC.

### Dificultad (selector en el garaje, nunca a mitad de carrera)

| Parámetro | Fácil | **Normal (= balance original)** | Difícil | Extremo |
|---|---|---|---|---|
| Intervalo de aparición del tráfico | ×1,35 | ×1 | ×0,82 | ×0,68 |
| Tráfico simultáneo máx. | 10 | 13 | 15 | 17 |
| Aumento de vel. tope por km / máximo | +0,35 / +6 | +0,5 / +9 | +0,65 / +12 | +0,8 / +15 |
| Recarga de nitro (/s) | 13 | 11 | 9,5 | 8,5 |
| Invulnerabilidad tras choque | 2,5 s | 2 s | 1,7 s | 1,4 s |
| Vel. del rival (× tu tope) | 0,94 | 1 | 1,04 | 1,08 |
| Prob. de que un auto cambie de carril | 0 | 0,10 | 0,20 | 0,30 |
| Obras cada | 900–1300 m | 650–1000 m | 500–800 m | 380–650 m |
| Rival (Clásica/Contrarreloj) cada | 3000 m | 2500 m | 2000 m | 1600 m |
| Contrarreloj: tiempo inicial / por control | 70 / +20 s | 60 / +15 s | 55 / +12 s | 50 / +10 s |
| Multiplicador de puntos | ×0,8 | ×1 | ×1,25 | ×1,5 |

Normal conserva los números originales de tráfico, rampa de velocidad, nitro e invulnerabilidad; lo nuevo en Normal son los eventos agregados (obras, latas, rival y 10 % de autos que cambian de carril, siempre con guiño). Los controles no cambian. **Récord:** se mantiene un único récord global (SDK + `turbo_best`); la separación por dificultad está en el ranking local, que es por vehículo · modo · dificultad (top 5, sólo este dispositivo, se aclara en el diálogo «No es un ranking mundial»).

### Calidad (`onQuality`)

| | Baja | Media | Alta |
|---|---|---|---|
| pixelRatio | 0,8 (pantallas dpr 1) / 1 | mín(dpr, 1,5) | mín(dpr, 2) |
| Sombras reales (mapa) | no | no (sombras blob) | sí, 1024 (jugador y rival) |
| Pintura del jugador | Lambert | Phong + mapa de entorno procedural | Phong + mapa de entorno |
| Partículas (InstancedMesh) | 36 | 70 | 110 |
| Líneas de velocidad | 0 | 28 | 56 |
| Props de escenario visibles | 8 | 16 | 24 |
| Niebla / distancia de dibujo | 360 / 430 | 520 / 620 | 600 / 720 |
| Estrellas / skyline | 0 / no | 180 / sí | 360 / sí |

### Contenido nuevo

- **Garaje con desbloqueos persistentes** (`turbo:progress` v2): HIPERNOVA X (8 km acumulados), FLECHA SOLAR (5 km en una carrera), MONSTRUO 6X6 (40 «CASI» acumulados), COHETE 77 (ganar un duelo). Bloqueado = silueta oscura, botón «🔒 BLOQUEADO» con progreso. Se recuerda el último vehículo y modo. **Migración:** si no existe `turbo:progress`, se crea y se guarda `turbo_best` como `legacyBest` (se sigue escribiendo `turbo_best`).
- **Modos:** Contrarreloj (reloj, controles cada 1,5 km con arco, choque = −5 s sin perder vidas, empieza en la Costa); Duelo (3 km contra EL CÓNDOR, barra de progreso tú/rival, arco de meta, empieza en la Ciudad neón; rubber-band suave ±10 % para que nunca quede imposible).
- **Rival con IA** (también como evento en Clásica/Contrarreloj): esquiva tráfico y obras cambiando de carril con guiño, frena detrás si no hay hueco, usa nitro, nunca embiste al jugador desde atrás; tocarlo es un «ROCE» (frena, sin perder vida). Pasarlo: +400 y `rivalBeat`; si se aleja 380 m o pasan 55 s, se escapa.
- **Obras:** vallas a rayas, conos y lámpara con pulso suave (sin destellos), cartel triangular 70 m antes y aviso «⚠ OBRAS EN LA RUTA». Nunca aparecen con un auto entre la obra y vos en ese carril, y se respeta la regla de dejar siempre un carril libre.
- **Latas de nitro** (+35 de nitro, +25 pts).
- **Tráfico:** van y colectivo nuevos; cambios de carril con guiño intermitente lento (1 s de aviso + 1,2 s de maniobra), nunca hacia un carril ocupado ni con obra adelante.

### Cambios visuales y de rendimiento

- Vehículos con perfil lateral extruido (r128), piezas fusionadas por material con colores por vértice: ~8 draw calls por auto del tráfico (antes ~20). Geometrías cacheadas por tipo (no se liberan ni se recrean al cambiar de vehículo).
- Postes reflectivos fusionados en una malla que se desplaza en módulo (2 draw calls en vez de 76), montañas en una malla, props por bioma fusionados (1–2 draw calls cada uno), partículas en un `InstancedMesh` (1 draw call), líneas de velocidad en un `LineSegments`.
- Fichas de misiones sin `backdrop-filter` en este juego (re-desenfocar el canvas 3D cada cuadro costaba ~30 % de FPS en SwiftShader).
- `prefers-reduced-motion`: sin sacudida de cámara, FOV del nitro reducido, líneas de velocidad a la mitad.
- Hitbox AABB **sin cambios** (mismas medidas `w`/`l` y misma fórmula); los modelos no exceden la hitbox salvo las ruedas (+0,24 m de ancho, igual que antes).

### Arreglos de robustez

- La cuenta regresiva, la animación de choque final y el cierre de modo usan tiempo real acotado (≤ 0,25 s por cuadro) en vez del `dt` de juego acotado a 33 ms: con WebGL por software a 3 FPS la cuenta tardaba >20 s (era la causa del test que fallaba en CI). La física sigue con `dt` ≤ 33 ms.
- Tras elegir modo/dificultad con mouse o toque, el foco vuelve al juego para que Enter/Espacio larguen.
- Las pruebas que medían por reloj de pared (táctil, puntos antes de chocar) ahora esperan condiciones del reloj del juego.

### Pruebas

`ML_WORKERS=1 npx playwright test tests/e2e/turbo_furia.spec.js` (corrida final, 10/10/2026): **37 passed, 1 skipped, 6,4 min** — desktop 18 passed + 1 skipped (el táctil es sólo mobile), mobile 19 passed.

Nuevas: misiones (principal + secundaria cumplidas, falla de `tf_nocrash` al chocar, reinicio desde pausa, persistencia tras recargar), dificultad (teclado + toque/clic, persistencia, parámetros e invulnerabilidad medida en carrera), calidad baja/alta (pixelRatio, partículas, props, sombras, niebla, material), obras (aviso, choque en tu carril, esquivar suma), nitro (Shift gasta y acelera, borde de pantalla, lata recarga), rival (entra de atrás, se lo supera con premio, sin perder vidas) + cambio de carril con guiño, duelo (gana → desbloquea COHETE 77; pierde cuando el rival llega primero), contrarreloj (choque resta 5 s y no vidas, fin por tiempo), garaje (migración de `turbo_best`, bloqueo, desbloqueo persistente, ranking local), biomas día/noche + hitboxes de los 17 modelos, garaje usable en 1280×800, 412×915 y 915×412. Todas las pruebas ocultan `navigator.getGamepads` (el equipo tiene dos joysticks físicos con entradas trabadas).

### Mediciones (reales, Chromium headless + SwiftShader, 1280×800, 20 s de manejo real en zigzag con nitro; equipo compartido con carga ~26–30)

Corridas alternadas original/nuevo para compensar la carga (4 pares por calidad). Draw calls contados interceptando `drawArrays/drawElements`.

| | Original | Nuevo — media | Nuevo — baja |
|---|---|---|---|
| FPS (4 corridas) | 13,8 · 21,6 · 19,3 · 23,6 (media) / 20,2 · 20,1 · 23,9 · 25,3 (baja; el original ignora la calidad) | 14,8 · 16,1 · 16,9 · 22,7 | 20,6 · 36,1 · 28,3 · 26,7 |
| Draw calls por cuadro | 185–219 | 65–69 | 44–52 |
| Cuadro mediano | 33–67 ms | 33–67 ms | 17–50 ms |
| Heap JS | 6,7–9,2 MB | 7,2–8,2 MB | 6,5–7,2 MB |
| CPU de update+render (gancho) | — | 2,1–3,3 ms | 1,2–2,5 ms |

Alta (1 corrida): 10,3 FPS, 80 draw calls (incluye pase de sombras). Con este nivel de ruido la diferencia de FPS entre original y «media» no es concluyente (≈ −10 % de promedio); «baja» quedó igual o mejor que el original. Los draw calls bajaron ~3–4×.

### Pendientes / NO PROBADO

- No probado en dispositivos reales ni con GPU real; FPS medidos sólo con SwiftShader bajo carga.
- Gamepad no probado con hardware (los joysticks del equipo tienen entradas trabadas).
- El récord global sigue siendo uno solo (no por dificultad); la separación está en el ranking local.
- Idea para cuando se actualice three.js (no en esta ronda): `MeshStandardMaterial` + PMREM para la pintura e `InstancedMesh` para el tráfico.
- El modo Duelo es siempre contra EL CÓNDOR a 3 km; no hay selector de pista (cada modo arranca en su bioma).
