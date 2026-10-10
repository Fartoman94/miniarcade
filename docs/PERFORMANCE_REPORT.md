# Informe de rendimiento — MiniArcade

## Metodología
- **Herramienta:** `tests/perf/measure.mjs`, que corre en Chromium headless con viewport de 1280×800. Por página mide:
  - tiempo de DOMContentLoaded y de carga;
  - FPS durante 4 s en la pantalla inicial (menú) y el peor frame;
  - tareas largas;
  - heap de JS;
  - nodos DOM;
  - pedidos y KB transferidos;
  - errores de consola.
- **Render por CPU:** en headless, WebGL corre en **SwiftShader**. Los números sirven para comparar antes y después en la misma máquina, **no** como FPS de un dispositivo real. En los juegos 2D el límite de 60 fps es el vsync y en los 3D el cuello de botella es la CPU dibujando.
- **Comparación A/B sobre la máquina descargada:** después de que terminaron los agentes, se midió dos veces la versión original (commit `69ace25`, servida desde un worktree) **intercalada** con la versión nueva, con las mismas condiciones. Los JSON crudos están en [`docs/perf/`](perf/): `before.json` es la medición inicial del día y `orig-idle-*` / `after-idle-*` son la comparación A/B.
- **Alcance:** la medición automática cubre solo la pantalla inicial. Las mejoras de juego en curso las midió cada agente con sondas propias (ver la tabla de abajo y los documentos de cada juego). Los números de los agentes se tomaron con la máquina cargada por los 8 en paralelo. Se usan solo las métricas que no dependen de la carga (draw calls, geometrías, buffers, tiempos relativos medidos en la misma corrida).

## Pantalla inicial: original → nuevo (2 corridas cada uno, máquina descargada)

| Página | FPS | Peor frame (ms) | Heap (MB) | Tareas largas | DCL (ms) | KB transferidos | Errores |
|---|---|---|---|---|---|---|---|
| index | 60.2 / 60.1 → 60.2 / 60.2 | 16.8 / 16.8 → 16.8 / 16.8 | 1.6 / 1.6 → 1.4 / 1.4 | 0 / 0 → 0 / 0 | 167 / 159 → 184 / 160 | 65 → 117 | 0 |
| clavado | 60.3 / 60.3 → 60.2 / 60 | 16.8 / 16.8 → 16.8 / 16.8 | 3 / 2.9 → 2.6 / 2.6 | 0 / 0 → 0 / 0 | 125 / 166 → 181 / 154 | 75 → 111 | 0 |
| fruta_furia | 60.1 / 60.5 → 60.4 / 60.2 | 16.8 / 16.8 → 16.8 / 16.8 | 1.6 / 1.6 → 1.9 / 2.2 | 0 / 0 → 0 / 0 | 119 / 105 → 159 / 153 | 83 → 120 | 0 |
| muerte_gloriosa | 60.3 / 60.5 → 60 / 60.1 | 16.8 / 16.8 → 16.8 / 16.8 | 1.6 / 1.6 → 0.9 / 0.9 | 0 / 0 → 0 / 0 | 152 / 151 → 178 / 150 | 110 → 152 | 0 |
| NEON_SURVIVOR | 60.3 / 60.5 → 60.4 / 60.4 | 16.8 / 16.8 → 16.8 / 16.8 | 1.2 / 1.2 → 1.4 / 1.4 | 0 / 0 → 0 / 0 | 15 / 17 → 27 / 23 | 28 → 80 | 0 |
| Salva_al_rey | 39.8 / 31.6 → 35 / 34.2 | 66.6 / 83.4 → 83.4 / 83.4 | 10 / 8.5 → 8 / 6.3 | 2 / 2 → 2 / 2 | 433 / 502 → 716 / 474 | 753 → 796 | 0 |
| torre_infinita | 60 / 60.2 → 60.3 / 60.1 | 16.8 / 16.8 → 16.8 / 16.8 | 1.9 / 1.7 → 1.9 / 2.1 | 0 / 0 → 0 / 0 | 98 / 124 → 164 / 167 | 73 → 109 | 0 |
| turbo_furia | 60.1 / 60.1 → 60.1 / 60.2 | 16.8 / 16.8 → 16.8 / 16.8 | 4.9 / 5.3 → 6.6 / 6.4 | 0 / 1 → 0 / 1 | 272 / 370 → 593 / 307 | 686 → 722 | 0 |
| valle_encantado | 33.4 / 33.1 → 34.2 / 35.1 | 116.7 / 83.4 → 66.7 / 66.7 | 13.6 / 17.4 → 9.6 / 12.8 | 2 / 2 → 2 / 2 | 460 / 466 → 501 / 443 | 768 → 815 | 0 |

**Lectura honesta:**
- **2D:** en la pantalla inicial los juegos 2D ya iban a 60 fps y siguen igual. Ahí no había nada que ganar.
- **3D en el menú:** los juegos 3D muestran poca diferencia de FPS porque SwiftShader está limitado por píxeles, no por la cantidad de objetos. La mejora que sí se ve en esta medición es el heap de EL VALLE ENCANTADO (13,6–17,4 → 9,6–12,8 MB) y su peor frame (83–117 → 67 ms).
- **KB extra (+36 a +52 KB por página):** son el SDK (`arcade.js`), el registro y la intro, compartidos. Con el service worker se descargan una sola vez para todo el arcade.
- **DCL:** varía ±100 ms entre corridas de la misma versión, así que las diferencias de DCL no son significativas.

## Mejoras medidas dentro del juego

Las midieron los agentes y el detalle está en `docs/games/<juego>.md`.

| Juego | Métrica | Antes | Después |
|---|---|---|---|
| NEON SURVIVOR | FPS a los 5 min simulados | 9,1 (869 enemigos) | 40,2 (261, con tope) |
| NEON SURVIVOR | `draw()` con 260 enemigos + 40 balas + 100 orbes | 38,6 ms | 25,8 ms |
| ¡SALVA AL REY! | Draw calls (menú / partida) | 358 / 377 | 108 / 128 |
| ¡SALVA AL REY! | Geometrías en GPU (menú) | 348 | 94 |
| EL VALLE ENCANTADO | Draw calls por frame | 445–477 | 127–141 |
| EL VALLE ENCANTADO | JS por frame | 8–15 ms | 3,6–6 ms |
| EL VALLE ENCANTADO | Geometrías tras 3 rondas de oleadas | crecían sin límite (fuga) | 101 → 105 → 105 (estable) |
| TURBO FURIA | Buffers WebGL vivos tras 20 cambios de vehículo | 112 → 1392 (fuga) | 112 → 112 |
| ¡CLAVADO!, FRUTA FURIA, TORRE INFINITA | Gradientes creados por frame | ~30 / varios | 0 (se crean al redimensionar) |

**Pendiente:** medir en dispositivos reales (un Android de gama media y un iPhone) con el medidor integrado: tecla F3 o `?debug=1`, que expone `window.__mlPerf`.
