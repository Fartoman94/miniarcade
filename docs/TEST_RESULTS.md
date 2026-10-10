# Resultados de pruebas — MiniArcade

> Ejecutado el 2026-10-09 en la rama `feat/modernizacion-arcade`, sobre Linux con Chromium headless de Playwright 1.62.1 y WebGL por SwiftShader. Todo lo de abajo se corrió de verdad; la salida cruda de la corrida completa no se versiona (está en `.perf/`, que ignora git).

## Resumen

| Suite | Comando | Resultado |
|---|---|---|
| Unitarias (Vitest + jsdom): registro, catálogo, SDK | `npm test` | **26/26 pasan** |
| Chequeo de tipos (`tsc --checkJs`) del código compartido | `npm run typecheck` | **sin errores** |
| E2E completa (Playwright, escritorio 1280×800 y Pixel 7) | `npm run test:e2e` | **135 pasan, 2 fallan, 13 omitidas** en 7,3 min (primera corrida completa) |
| Re-ejecución después de corregir la prueba que fallaba | `npx playwright test tests/e2e/portal.spec.js` | **14/14 pasan**. La prueba corregida también pasó 6/6 con `--repeat-each=3`. |

### La falla y su corrección
Las 2 fallas eran la misma prueba del portal ("intro de marca… se saltea"), en escritorio y en móvil. Al investigar con trazas se vio que **la intro sí se salteaba en el mismo `pointerdown`**: pasaba a `ml-out` de inmediato. Lo que fallaba era la espera: este Chromium headless deja de correr los timers de la página durante varios segundos después de un clic. Se reprodujo también **sin intro**, así que es del entorno. La prueba esperaba que el `setTimeout` de 560 ms que quita el nodo se cumpliera a tiempo. Ahora verifica el salteo de forma síncrona: la clase `ml-out` tiene que aparecer en menos de 1 s, cuando sin salteo recién aparece a los 3,4 s. Recién después espera la remoción, con margen.

### Omitidas (13)
Son todas a propósito, por dispositivo:
- pruebas táctiles en el proyecto de escritorio;
- pruebas de teclado físico en el proyecto móvil (4 de MUERTE GLORIOSA).

## Detalle por spec (corrida completa)

| Spec | Escritorio | Móvil (Pixel 7) | Qué cubre |
|---|---|---|---|
| `portal.spec.js` | 6 ✓ 1 ✘ → 7 ✓ | 6 ✓ 1 ✘ → 7 ✓ | Catálogo, buscador, categorías, orden, favoritos persistentes, ficha por URL con recomendaciones y récord migrado, intro, sin scroll horizontal, service worker offline |
| `navigation.spec.js` | 1 ✓ | 1 ✓ | Portal → cada uno de los 8 juegos → ⌂ volver, dos vueltas, sin errores de consola |
| `clavado.spec.js` | 6 ✓ 1 – | 7 ✓ | |
| `fruta_furia.spec.js` | 5 ✓ | 5 ✓ | |
| `muerte_gloriosa.spec.js` | 9 ✓ 1 – | 6 ✓ 4 – | |
| `neon_survivor.spec.js` | 11 ✓ 1 – | 11 ✓ 1 – | |
| `salva_al_rey.spec.js` | 10 ✓ 1 – | 11 ✓ | |
| `torre_infinita.spec.js` | 8 ✓ 1 – | 9 ✓ | |
| `turbo_furia.spec.js` | 5 ✓ 1 – | 6 ✓ | |
| `valle_encantado.spec.js` | 6 ✓ 1 – | 6 ✓ 1 – | |

**Lo que verifica cada spec de juego** (el detalle de cada una está en su `docs/games/<juego>.md`):
- carga sin errores de consola;
- inicio con entrada real (mouse, teclado o toques CDP);
- el estado avanza;
- **pausa con Esc**: el estado queda idéntico durante 1 s y al reanudar no hay salto de tiempo;
- **reinicio** desde el menú de pausa;
- **fin de partida** y récord guardado en `ml:scores` y en la clave vieja, que persiste tras recargar;
- viewport de celular sin superposiciones;
- controles táctiles;
- silencio.

Además, cada spec tiene **pruebas de regresión de los bugs corregidos**. Por ejemplo: el portón de ¡SALVA AL REY! recibe daño, la altura de la fruta es visible en cualquier pantalla, mantener Espacio no suelta varios bloques, y un solo game over por choque en ¡CLAVADO!.

## Pruebas unitarias (Vitest)
- `tests/unit/catalog.test.js` (12): cada entrada del registro es válida y su archivo existe, ids únicos, filtros, búsqueda sin tildes, orden, recomendaciones, formato de récord y tiempo.
- `tests/unit/arcade-sdk.test.js` (14): doble `init`, barra y menú de pausa, no pausa fuera de partida, Esc pausa sin llegar al juego, bloqueo de entrada en pausa, reinicio, pausa automática al ocultar la pestaña, silencio persistente, récord monótono, estadísticas, telemetría acotada a 200 eventos, aviso de error, funcionamiento sin localStorage y respaldo de clave vieja.

## Rendimiento
Ver [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md): medición A/B original vs. nuevo con la máquina descargada y métricas dentro del juego.

## Lo que NO se probó
- Navegadores distintos de Chromium (Safari iOS, Firefox).
- Dispositivos reales y gamepad físico. El puente gamepad→teclado se probó de forma indirecta, con teclas sintéticas.
- Escuchar el audio: solo se verificó el estado del `AudioContext` y de la ganancia.
- Partidas largas completas a mano, como las 10 oleadas de ¡SALVA AL REY! para ajustar el balance nuevo.
