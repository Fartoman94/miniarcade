# Auditoría para el objetivo 20 juegos

> Hecha el 2026-10-10, al recibir el paquete `MiniArcade_20_Juegos_3D_Pack_Completo_Claude.zip`, sobre el repo real `Fartoman94/miniarcade` (rama `main` en `20fba9c` / `feat/miniarcade-3`). El paquete se basaba en un ZIP viejo del repo y pide explícitamente no reemplazar un Git más nuevo por ese ZIP. Por eso esta auditoría compara lo que el paquete supone con lo que había realmente.

## Lo que el paquete suponía y no era cierto

| Supuesto del paquete | Estado real del repo |
|---|---|
| El portal son 8 tarjetas estáticas | El catálogo se arma desde `games/registry.js`, con buscador, categorías, favoritos, «Seguir jugando», fichas por URL, JSON-LD, PWA y service worker |
| No hay `package.json`, CI ni tests | Vitest, Playwright, `tsc --checkJs` y GitHub Actions ya existían, con más de 340 tests E2E |
| Three.js r128 desde CDN | Three.js r128 se servía local desde `vendor/three-r128`, con `requireWebGL()` y una pantalla de respaldo |
| No hay pausa, misiones ni dificultad | El SDK compartido ya tenía pausa, opciones y calidad; `MLMissions` ya tenía misiones, logros y dificultad en los 8 juegos |
| Hay firmas de «Fabricio Tasca» en la interfaz | No queda ninguna (verificado con `grep`) |
| Los GLB del paquete sirven para producción | Son prototipos de baja calidad y sin normales: con Three.js se ven negros sin una corrección. Los juegos nuevos no los usan; todos sus modelos se generan por código |

## Decisiones técnicas para los 12 juegos nuevos

- **Three.js 0.186.1 local** (`vendor/three-0.186.1`, MIT), cargado con import map sin build. Los 3 juegos 3D originales siguen en r128 local; migrarlos es una etapa aparte (ver PENDIENTES.md).
- **Kit3D** (`matelabs/kit3d.js`): base común con renderer por calidad, loop de paso fijo integrado con la pausa, entrada, audio, carga de GLB, guardado versionado, pantallas y liberación de recursos.
- **Sin Vite ni TypeScript compilado:** el sitio se publica tal cual en Vercel. Los juegos nuevos son módulos ES en `games/<id>/`. El código compartido tiene tipos JSDoc revisados con `tsc --checkJs`.
- **Sin Rapier:** ningún juego necesitó cuerpos rígidos generales. Cada uno tiene física simple y determinista, probada con `simulate()`.
- **Sin backend:** no hay ranking global; los récords son locales (regla del prompt).
- **Renombre:** «Guardianes de la Galaxia» pasó a llamarse **Guardianes Estelares** porque el nombre original es una marca de terceros. Lo decidió el dueño.
- **Merge:** el dueño autorizó el merge a `main` solo con el CI en verde.

## Estado al empezar esta fase (P0/P1/P2)

- **P0 (impiden jugar):** ninguno abierto en los 8 juegos. Sí había un P0 de CI: el runner de 2 núcleos con WebGL por software volvía inestables las pruebas que dependían de tiempo real. Se resolvió con 6 runners en paralelo, pruebas deterministas (`simulate()` o tiempo manual) y 1 reintento en CI.
- **P1:** faltaban los 12 juegos nuevos y el reino explorable.
- **P2:** migrar a Three.js moderno los 3 juegos originales, sitemap y CSP (ver PENDIENTES.md).

## Resultado

Ver `docs/IMPLEMENTATION_PROGRESS.md`: 20/20 juegos implementados con pruebas, cada uno con su documento en `docs/games/<id>.md`, más el modo Reino del Alba.
