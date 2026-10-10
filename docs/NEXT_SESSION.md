# Punto de continuación

- **Rama de trabajo:** `feat/miniarcade-3` (se mergea a `main` por PR con CI en verde; autorizado por el dueño).
- **Último merge a main:** PR #7 → `971fd82` (2026-10-10). Producción: https://miniarcade-gold.vercel.app
- **Released:** 15/20 (ver `docs/IMPLEMENTATION_PROGRESS.md`).
- **En curso:** Carrera Vertical (18), Mareas Profundas (17), Corsarios del Abismo (11), Cocina del Caos (19).
- **Pendiente:** Portales Imposibles (20); reino explorable en ¡SALVA AL REY! y EL VALLE ENCANTADO (`docs/specs/REINO_EXPLORABLE.md`).
- **Comandos:** `npm run serve` · `npm test` · `npm run typecheck` · `ML_WORKERS=1 npx playwright test tests/e2e/<id>.spec.js` (validar también con `ML_WORKERS=4`) · `node tools/make-thumbs.mjs <id>`.
- **Integrar un juego nuevo:** entrada en `games/registry.js` (con `added`), JSON-LD y enlace estático en `index.html`, miniatura, línea en `START` de `tests/e2e/lifecycle.spec.js`, fila en IMPLEMENTATION_PROGRESS.
- **Trampas conocidas:** 2 joysticks físicos en la máquina de desarrollo (el SDK los ignora bajo webdriver); Chromium headless demora timers/entrada con carga → pruebas deterministas con `simulate()`; el CI de GitHub corre en 2 núcleos con WebGL por software.
