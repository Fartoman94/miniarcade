# Auditoría inicial — MiniArcade 3.0

> Punto de partida de la rama `feat/miniarcade-3`, creada el 2026-10-09 desde `feat/personaje-mati-octo`, que a su vez parte de `main` con `d44aa2f` (merge de los PRs #1 y #2).
> Compara la **auditoría estática del ZIP original** (`00_AUDITORIA_REAL.md`) con el estado real del repositorio al empezar esta etapa.
> Estados: **RESUELTO** (implementado y probado), **PARCIAL** o **PENDIENTE**.

## 1. Hallazgos de arquitectura de la auditoría vs. estado al inicio de 3.0

| # | Hallazgo (ZIP original) | Estado | Evidencia |
|---|---|---|---|
| 1 | Archivos monolíticos HTML/CSS/JS | **PARCIAL** | Los sistemas comunes ya están fuera de los juegos: SDK `matelabs/arcade.js`, registro, catálogo, personajes y misiones. La mecánica de cada juego sigue en su HTML (ver ARQUITECTURA.md, sección «Contrato por juego»). |
| 2 | Three.js r128 por CDN, error si no carga | **RESUELTO (etapa 1)** | Three.js r128 local en `vendor/three-r128/` con su LICENSE, cacheado por el service worker, más `MLArcade.requireWebGL()` con pantalla de respaldo. La migración a una versión moderna queda como etapa 2 (PENDIENTES.md). |
| 3 | Récords locales aislados | **RESUELTO (local)** / **PENDIENTE (global)** | Récords y estadísticas unificados en `ml:scores` y `ml:stats`, con migración de las claves viejas. **No hay ranking global**: requiere un backend con validación que no existe. |
| 4 | Portal estático de 8 tarjetas | **RESUELTO** | El catálogo sale de `games/registry.js` e incluye buscador, categorías, orden, favoritos, «Seguir jugando», ficha por juego, JSON-LD y Open Graph. |
| 5 | Intro que bloquea eventos | **RESUELTO** | Se saltea con un toque o una tecla después de 350 ms, aparece una vez por sesión, respeta `prefers-reduced-motion` y tiene test E2E. |
| 6 | Branding a consolidar | **RESUELTO** | No queda ninguna firma personal (`grep -i "fabricio\|tasca"` sin resultados en los juegos). «CREADO POR MATELABS» está unificado. No existe un **logo oficial** en el repo, solo la mascota, así que no se reemplazó ningún coleccionable. |
| 7 | Sin package.json, CI ni tests | **RESUELTO** | `package.json` con Vitest, Playwright y tsc. A la fecha hay 40 tests unitarios y E2E por juego y para el portal. CI agregado en 3.0: `.github/workflows/ci.yml`. |

## 2. Criterios de aceptación de la auditoría

| Criterio | Estado al inicio de 3.0 |
|---|---|
| Cada juego arranca, pausa, reinicia, termina y vuelve al menú | RESUELTO: probado por juego en `tests/e2e/<juego>.spec.js` |
| Cambiar repetidamente de juego sin errores | RESUELTO: `tests/e2e/navigation.spec.js`, 2 vueltas por los 8 juegos |
| Sin uso creciente de memoria al abrir y cerrar | **NUEVO EN 3.0**: `tests/e2e/lifecycle.spec.js`, 10 aperturas por juego y 10 reinicios por juego, con heap medido por CDP después de forzar el recolector |
| Gameplay original conservado | RESUELTO: cada cambio de mecánica está justificado en `docs/games/<juego>.md` |
| Fallback WebGL y perfil gráfico bajo | **NUEVO EN 3.0**: `requireWebGL()` y calidad Automática/Baja/Media/Alta en el SDK |
| FPS en equipos reales | **NO PROBADO**: solo hay mediciones en Chromium headless con SwiftShader |
| Rankings públicos solo con validación de servidor | Respetado: no se muestra ningún ranking «mundial» |
| PASS/FAIL/NO PROBADO por cambio | Ver TESTING.md |
| No merge | Respetado: solo commit y push de ramas de trabajo |

## 3. Estado por juego al inicio de 3.0 (P0/P1/P2)

**P0** = rompe el juego · **P1** = falta funcionalidad pedida · **P2** = contenido o pulido.

| Juego | Motor | P0 abiertos | P1 (lo que pide el prompt maestro y no existía) | P2 |
|---|---|---|---|---|
| ¡CLAVADO! | Canvas 2D | 0 | misiones, dificultad, calidad, troncos especiales o jefe | biomas, look volumétrico |
| FRUTA FURIA | Canvas 2D | 0 | misiones, dificultad, calidad, frutas especiales, variantes de bomba | evento de fruta gigante, salpicaduras |
| MUERTE GLORIOSA | Canvas 2D | 0 | misiones, dificultad, calidad, niveles nuevos | rutas secundarias, secretos, parallax |
| NEON SURVIVOR | Canvas 2D | 0 | misiones, dificultad, calidad, familias de enemigos, jefe con fases | árbol de mejoras, armas, 2.5D |
| ¡SALVA AL REY! | Three.js r128 | 0 | misiones, dificultad, calidad, enemigos nuevos, jefe con fases | indicadores de amenaza, modelos y animación |
| TORRE INFINITA | Canvas 2D | 0 | misiones, dificultad, calidad, piezas especiales, eventos estructurales | volumen, clima |
| TURBO FURIA | Three.js r128 | 0 | misiones, dificultad, calidad, garaje con desbloqueos, rankings locales por auto | biomas día/noche, rivales |
| EL VALLE ENCANTADO | Three.js r128 | 0 | misiones de NPC, diario, brújula o mapa, minijefes, jefe de región | vegetación instanciada, niebla |

No había P0 abiertos: los 97 hallazgos de la primera auditoría (7 críticos) están corregidos (ver GAME_AUDIT.md). La última corrida completa fue de 135 tests E2E OK, más la prueba de intro corregida (14/14 en el portal).

## 4. Línea base técnica

- Tamaño transferido por página, FPS en el menú, heap y tareas largas: ver `docs/perf/after-idle-*.json`, medidos con la máquina descargada (PERFORMANCE_REPORT.md).
- Todas las mediciones son de Chromium headless con SwiftShader (render por CPU). Sirven para comparar antes y después en la misma máquina, no como FPS de un dispositivo.
