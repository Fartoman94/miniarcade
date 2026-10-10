# Testing — MiniArcade 3.0

> Resultados **reales**, ejecutados el 2026-10-10 sobre la rama `feat/miniarcade-3` en Linux, con Chromium headless de Playwright 1.62.1 y WebGL por SwiftShader. Nada de lo que figura como PASS dejó de ejecutarse.

## Cómo correr

```bash
npm ci
npm run serve                     # http://localhost:8765
npm test                          # Vitest (unitarias)
npm run typecheck                 # tsc --checkJs del código compartido
npm run test:e2e                  # Playwright: escritorio 1280×800 + Pixel 7
npx playwright test tests/e2e/lifecycle.spec.js --project=desktop   # ciclo de vida
ML_QUALITY=medium npm run perf -- etiqueta [páginas]                 # rendimiento
```

CI: `.github/workflows/ci.yml` corre tipos, unitarias y E2E de escritorio en cada push.

## Resumen

| Suite | Resultado |
|---|---|
| Unitarias (SDK 20, misiones 10, catálogo 12) | **42/42 PASS** |
| Tipos (`tsc --checkJs`) | **PASS** (0 errores) |
| E2E completa, ambos proyectos (`--grep-invert "ciclo de vida"`) | **346 PASS · 0 FAIL · 16 omitidas** (24,8 min, 3 workers) |
| Ciclo de vida (escritorio) | **9/9 PASS** (4,7 min) |

Las 16 omitidas lo están **a propósito, por dispositivo**: pruebas táctiles en escritorio, de teclado físico en móvil y 2 de Extremo en móvil (MUERTE GLORIOSA).

## E2E por spec (corrida completa)

| Spec | Escritorio | Móvil |
|---|---|---|
| portal | 9 ✓ | 9 ✓ |
| navigation | 1 ✓ | 1 ✓ |
| clavado | 16 ✓ · 1 omitida | 17 ✓ |
| fruta_furia | 11 ✓ · 1 | 12 ✓ |
| muerte_gloriosa | 26 ✓ · 1 | 21 ✓ · 6 |
| neon_survivor | 24 ✓ · 1 | 24 ✓ · 1 |
| salva_al_rey | 26 ✓ · 1 | 27 ✓ |
| torre_infinita | 21 ✓ · 1 | 22 ✓ |
| turbo_furia | 18 ✓ · 1 | 19 ✓ |
| valle_encantado | 21 ✓ · 1 | 21 ✓ · 1 |

## Qué cubren, por juego (PASS)

Cada spec cubre lo siguiente. El detalle está en `docs/games/<juego>.md`.

- **Base:**
  - carga sin errores de consola;
  - inicio con entrada real (mouse, teclado o toques CDP);
  - el estado avanza;
  - la pausa congela el estado durante 1 s y al reanudar no hay salto de tiempo;
  - reinicio desde la pausa;
  - fin de partida;
  - récord persistente tras recargar, con migración de la clave vieja;
  - layout de celular vertical y apaisado;
  - controles táctiles;
  - silencio.
- **3.0:**
  - misión principal y secundaria cumplidas;
  - caso de falla (`failOn`) y persistencia de logros;
  - selector de dificultad con teclado y toque, que persiste y **cambia parámetros medibles**;
  - niveles de calidad que cambian DPR, topes de partículas o sombras;
  - cada enemigo, jefe o evento nuevo: aparece, se comporta, muere y da recompensa.
- **Regresiones específicas:**
  - corte de TORRE INFINITA idéntico al original (3000 casos aleatorios);
  - precisión angular de ¡CLAVADO!;
  - hitbox de los 17 autos de TURBO FURIA;
  - niveles 7–10 de MUERTE GLORIOSA completados por un recorrido guionado;
  - misiones de los habitantes de EL VALLE ENCANTADO completables sin softlocks;
  - balance del portón de ¡SALVA AL REY! con oleadas guionadas.
- **Mati Octo** (4 juegos):
  - selector;
  - poses según el estado;
  - colisionador idéntico al clásico;
  - vuelta al clásico si falla la red.
- **Portal:**
  - catálogo, buscador, categorías, orden y favoritos;
  - ficha por URL;
  - intro;
  - modo sin conexión (service worker);
  - «Jugar ahora» con datos reales;
  - logros.

## Ciclo de vida (10 aperturas y 10 reinicios)

`tests/e2e/lifecycle.spec.js`. El heap se mide con CDP **después de forzar el recolector**. La log completa está en `docs/perf/3.0/lifecycle.log`.

| Caso | Resultado |
|---|---|
| Portal ↔ cada juego, 10 vueltas (80 aperturas) | Heap del portal 2,23 MB al inicio → **2,37–2,40 MB** en las 10 vueltas, sin crecimiento sostenido. PASS |
| ¡CLAVADO!, 10 reinicios | heap 1,72 → 1,82 MB · sin loops duplicados. PASS |
| FRUTA FURIA | 1,78 → 1,82 MB. PASS |
| MUERTE GLORIOSA | 1,98 → 2,08 MB. PASS |
| NEON SURVIVOR | 1,83 → 1,92 MB. PASS |
| ¡SALVA AL REY! | 5,80 → 5,98 MB. PASS |
| TORRE INFINITA | 1,65 → 1,76 MB. PASS |
| TURBO FURIA | 4,69 → 4,83 MB. PASS |
| EL VALLE ENCANTADO | 6,63 → 6,54 MB. PASS |

La tasa de `requestAnimationFrame` nunca aumentó después de 10 reinicios, así que no hay loops duplicados. En headless la tasa absoluta es ruidosa porque depende de la carga.

## Problemas del entorno de pruebas (resueltos)

- **Joysticks reales conectados:** la máquina de desarrollo tiene 2 joysticks Xbox que el SDK convertía en teclas fantasma durante las pruebas. Ahora el SDK ignora los mandos bajo `navigator.webdriver`; se reactivan con `?gamepad`.
- **Timers demorados en headless:** Chromium headless demora timers y `requestAnimationFrame` durante varios segundos con la máquina cargada o después de un clic. Las pruebas usan `expect.poll` con margen y el reloj del juego, no tiempos fijos de pared. La intro ya no depende de timers.
- **CI:** la primera corrida tuvo 3 fallas de timing (intro, MUERTE GLORIOSA y TURBO FURIA). Las tres están corregidas en el juego o en la prueba y verificadas localmente.

## NO PROBADO

- **Dispositivos reales:** ningún celular, ninguna GPU física y ningún gamepad físico. El puente del gamepad se probó con teclas sintéticas.
- **Otros navegadores:** ni Safari iOS ni Firefox.
- **Audio:** no se escuchó; solo se verificó el estado del `AudioContext` y de la ganancia.
- **Juego humano:** ninguna persona jugó las campañas completas (los 10 niveles de MUERTE GLORIOSA, las 10 oleadas de ¡SALVA AL REY! o el Rey Sombrío). Las completaron recorridos guionados y hooks de prueba.
- **`prefers-reduced-motion`:** está implementado en todos los juegos, pero solo algunos tienen prueba automática.
- **Varias secundarias:** solo emiten su evento, sin una prueba que las complete como misión. El detalle está en cada `docs/games/<juego>.md`.
