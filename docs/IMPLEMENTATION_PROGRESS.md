# Progreso hacia 20 juegos

Estados: `pending` · `in_progress` · `test_failed` · `ready_for_review` · `released` (cumple CRITERIOS_QA, está en el catálogo y con merge a `main` con CI en verde).

| # | Juego | Archivo | Motor | Estado | Rama / commit | Notas |
|---|---|---|---|---|---|---|
| 01 | ¡CLAVADO! | clavado.html | Canvas 2D (2.5D) | released | main | 3.0: biomas, jefes, misiones |
| 02 | FRUTA FURIA | fruta_furia.html | Canvas 2D | released | main | 3.0 |
| 03 | MUERTE GLORIOSA | muerte_gloriosa.html | Canvas 2D | released | main | 3.0: 10 niveles |
| 04 | NEON SURVIVOR | NEON_SURVIVOR.html | Canvas 2D | released | main | 3.0 |
| 05 | ¡SALVA AL REY! | Salva_al_rey.html | Three.js r128 | released (reino: pending) | main | reino explorable pendiente |
| 06 | TORRE INFINITA | torre_infinita.html | Canvas 2D | released | main | 3.0 |
| 07 | TURBO FURIA | turbo_furia.html | Three.js r128 | released | main | 3.0 |
| 08 | EL VALLE ENCANTADO | valle_encantado.html | Three.js r128 | released (reino: pending) | main | reino explorable pendiente |
| 09 | Guardianes Estelares* | guardianes_estelares.html | Three.js 0.186 | released | main (PR #7, 971fd82) | *renombrado (marca de terceros) · 37 tests ok |
| 10 | Arena Mutante | arena_mutante.html | Three.js 0.186 | released | main (PR #7, 971fd82) | 39 tests ok (+ bajo carga) |
| 11 | Corsarios del Abismo | corsarios_abismo.html | Three.js 0.186 | in_progress | — | |
| 12 | Granja de Runas | granja_runas.html | Three.js 0.186 | released | main (PR #7, 971fd82) | 39 tests ok |
| 13 | Templo de los Ecos | templo_ecos.html | Three.js 0.186 | released | main (PR #7, 971fd82) | 30 tests ok |
| 14 | Bastiones Elementales | bastiones_elementales.html | Three.js 0.186 | released | main (PR #7, 971fd82) | 32 tests ok |
| 15 | Derby de Chatarra | derby_chatarra.html | Three.js 0.186 | released | main (PR #7, 971fd82) | 32 tests ok |
| 16 | Academia de Dragones | academia_dragones.html | Three.js 0.186 | released | main (PR #7, 971fd82) | 34 tests ok |
| 17 | Mareas Profundas | mareas_profundas.html | Three.js 0.186 | in_progress | — | |
| 18 | Carrera Vertical | carrera_vertical.html | Three.js 0.186 | ready_for_review | feat/miniarcade-3 | 30 tests ok (+ bajo carga) |
| 19 | Cocina del Caos | cocina_caos.html | Three.js 0.186 | in_progress | — | |
| 20 | Portales Imposibles | portales_imposibles.html | Three.js 0.186 | in_progress | — | |

**Total released: 15/20** (8 originales + 7 nuevos, PR #7 mergeado el 2026-10-10 con CI en verde). El reino explorable de 05/08 está en `docs/specs/REINO_EXPLORABLE.md`.
