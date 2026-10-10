# Rendimiento — MiniArcade 3.0

> Mediciones **reales**, tomadas el 2026-10-10 en Chromium headless con **SwiftShader** (render por CPU), a 1280×800 y DPR 1. Sirven para comparar antes y después **en la misma máquina y en corridas intercaladas**; no son FPS de un dispositivo real.
> Los JSON crudos están en `docs/perf/3.0/`. La herramienta es `tests/perf/measure.mjs`, y `ML_QUALITY=low|medium|high` fija la calidad.
> **No se presentan objetivos como resultados.** Lo que no se midió figura como pendiente.

## Metodología

- **«pre-3.0»** es el commit `0771f53` (antes de Mati Octo y de 3.0), servido desde un worktree en `:8766`. **«3.0»** es la rama actual.
- **Orden de las corridas:** intercaladas (pre, media, baja) × 3, con la máquina en load 7–15. La carga varía, por eso se comparan corridas vecinas.
- **Pantalla inicial (menú):** FPS (= tasa de `requestAnimationFrame` durante 4 s), peor cuadro, tareas largas, heap, nodos, bytes y errores.
- **En partida:** mediciones de cada agente con el hook de su juego (draw calls, JS por cuadro, entidades). El detalle está en `docs/games/<juego>.md`.

## Pantalla inicial — juegos 3D (pre-3.0 vs 3.0, intercalado)

| Juego | pre-3.0 fps | 3.0 media fps | 3.0 baja fps | Nota |
|---|---|---|---|---|
| ¡SALVA AL REY! | 27,7 / 26,2 / 21,4 | 25,8 / 26,6 / 25,2 | 19,8 / 28,5 / 27,7 | parejo (dentro del ruido) |
| EL VALLE ENCANTADO | 23,8 / 27,1 / 26,8 | 23,6 / 24,0 / 22,8 | 24,5 / 25,2 / 25,4 | parejo o levemente abajo en media |
| TURBO FURIA (garaje), antes de optimizar | 50,1 / 50,1 / 54,4 | 37,7 / 37,9 / 37,9 | 45,5 / 45,9 / 45,1 | **regresión**: corregida en el paso siguiente |
| TURBO FURIA (garaje), después de optimizar | 43,2 / 47,9 / 49,7 | **60,0 / 60,2 / 60,1** | **60,3 / 60,1 / 60,2** | peor cuadro 50 → 16,8 ms |

**Sobre TURBO FURIA:** después de optimizar, el garaje y la pantalla final se **dibujan a 30 Hz (24 en baja)** porque son escenas casi quietas detrás de un menú. La página sigue a 60 fps de rAF. La carrera dibuja todos los cuadros.

**Calidad «Automática»:** en esta máquina (12 núcleos) resuelve **alta**. Con sombras reales y más pasto, los menús 3D bajan a ~16–17 fps en SwiftShader: ¡SALVA AL REY! y EL VALLE ENCANTADO pasan de ~35 a ~17. En una GPU real eso no debería pasar, pero **no está medido** (PENDIENTES.md, punto 6).

## Pantalla inicial — juegos 2D y portal (antes vs 3.0, calidad automática)

| Página | fps antes → 3.0 | peor cuadro (ms) | heap MB | KB transferidos | errores |
|---|---|---|---|---|---|
| portal | 60,2 → 60,4 / 60,1 | 16,8 → 16,8 | 1,4 → 1,4 | 117 → 246 (miniaturas, misiones, personajes) | 0 |
| ¡CLAVADO! | 60,2 → 59,6 / 59,9 | 16,8 → 50–66 (un pico al pintar el bioma) | 2,6 → 1,7 | 111 → 167 | 0 |
| FRUTA FURIA | 60,4 → 60,0 / 60,3 | 16,8 → 16,8 | 1,9 → 1,4 | 120 → 169 | 0 |
| MUERTE GLORIOSA | 60,0 → 60,2 / 60,0 | 16,8 → 16,8 | 0,9 → 1,2 | 152 → 279 | 0 |
| NEON SURVIVOR | 60,4 → 60,3 / 60,5 | 16,8 → 16,8 | 1,4 → 1,1 | 80 → 214 | 0 |
| TORRE INFINITA | 60,3 → 60,2 / 60,2 | 16,8 → 16,8 | 1,9 → 1,8 | 109 → 158 | 0 |

**KB transferidos:** el aumento sale de los módulos compartidos (misiones, personajes) y de más contenido. Con el service worker, los archivos compartidos se descargan una sola vez para todo el arcade.

## En partida (mediciones de los agentes)

Estas mediciones las tomó cada agente con la máquina cargada por otros agentes (load 25–70). Por eso los **tiempos por cuadro no son concluyentes**. Lo que sí es estable son las cantidades: draw calls, entidades y memoria.

| Juego | Métrica | Antes | 3.0 |
|---|---|---|---|
| ¡SALVA AL REY! | Draw calls con 12 monstruos en el portón | 215–220 | **110** (media) / 103 (baja) |
| TURBO FURIA | Draw calls en carrera | 185–219 | **65–69** (media) / 44–52 (baja) |
| EL VALLE ENCANTADO | Draw calls caminando en Explorar | 101–104 | **91–97** (media) / 90–93 (baja) |
| EL VALLE ENCANTADO | FPS en Explorar (SwiftShader) | 14,6–16,2 | 10,9–12,3 (media) / 14,0–15,0 (baja) |
| NEON SURVIVOR | Costo propio del juego (simulación + dibujo) | — | ~1 ms por cuadro |
| MUERTE GLORIOSA | JS por cuadro, nivel 1 | 0,55–0,73 ms | 0,61–0,69 ms (igual) |
| TORRE INFINITA | JS por cuadro | < 1 ms | < 1 ms (igual) |
| FRUTA FURIA | Tarea principal por cuadro | 23–27 ms | 14–19 (media) / 11–15 (baja) |

**Pendiente en EL VALLE ENCANTADO:** en media rinde menos FPS que el original, aunque con menos draw calls. El costo es el raster de SwiftShader para 700 matas de pasto. Si hace falta, se puede bajar el pasto de media a unas 400.

## Memoria y ciclo de vida

En 10 aperturas y 10 reinicios por juego no crece el heap ni se duplican loops. Ver TESTING.md y `docs/perf/3.0/lifecycle.log`.

## Lo que falta medir

- **FPS reales:** p50 y p95 en un Android de gama media, un iPhone y un desktop con GPU.
- **Calidad «alta» con GPU real:** tiene sombras con mapa de 1024 que solo se midieron por software.
