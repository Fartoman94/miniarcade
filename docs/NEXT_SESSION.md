# Punto de continuación

- **Estado:** **20/20 juegos publicados**, más el modo Reino del Alba. `main` = `e3c0952` (PR #10). Producción: https://miniarcade-gold.vercel.app
- **Rama de trabajo:** `feat/miniarcade-3`. Se mergea a `main` por PR, solo con el CI en verde; el dueño lo autorizó.
- **Siguiente trabajo sugerido** (ver `docs/PENDIENTES.md`):
  1. estabilizar la prueba inestable de `granja_runas`;
  2. migrar a Three.js 0.186 los 3 juegos 3D originales, con regresión visual;
  3. probar en dispositivos reales y medir FPS;
  4. agregar el logo oficial de MateLabs para los coleccionables, si el dueño lo provee.
- **Comandos:**
  - `npm run serve`
  - `npm test`
  - `npm run typecheck`
  - `ML_WORKERS=1 npx playwright test tests/e2e/<id>.spec.js` (también con `ML_WORKERS=4`)
  - `node tools/make-thumbs.mjs <id>`
- **Integrar un juego:** entrada en `games/registry.js` (con `added`), JSON-LD y enlace en `index.html`, miniatura, línea en `START` de `tests/e2e/lifecycle.spec.js` y fila en IMPLEMENTATION_PROGRESS.
- **Trampas conocidas:**
  - la máquina de desarrollo tiene 2 joysticks físicos (el SDK los ignora bajo webdriver);
  - Chromium headless demora timers y entrada cuando hay carga, así que las pruebas usan `simulate()` o tiempo manual;
  - el CI corre en runners de 2 núcleos con WebGL por software.
