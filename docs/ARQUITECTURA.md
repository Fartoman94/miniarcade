# Arquitectura — MiniArcade 3.0

> Complementa [ARCHITECTURE.md](ARCHITECTURE.md), que explica la base: un documento por juego, el registro, el SDK, el portal y la caché. Acá se documenta lo que agregó la etapa 3.0.

## Capas

```
index.html + matelabs/portal.js + matelabs/catalog.js     portal (catálogo, hero, fichas)
games/registry.js                                         metadatos (única fuente)
matelabs/arcade.js      SDK: ciclo de vida, pausa/opciones, calidad, WebGL, puntajes, gamepad, telemetría
matelabs/missions.js    misiones, logros y dificultad (eventos tipados)
matelabs/characters.js  personajes seleccionables (Mati Octo: GLB + sprites)
matelabs/intro.js       intro de marca
vendor/three-r128/      Three.js local (MIT) para los 3 juegos 3D
<juego>.html            mecánica, render y estado propios de cada juego
sw.js                   caché (network-first para código, cache-first para lo inmutable)
```

## Contrato por juego

El prompt maestro propone el contrato `mount / start / pause / resume / restart / resize / destroy`. En MiniArcade cada juego es **una página**, así que el contrato se cumple así, sin reescribir los juegos:

| Contrato | Implementación |
|---|---|
| `mount` | Cargar la página del juego. El portal navega con `<a href>` y la URL de cada juego se conserva. |
| `start` | Lo inicia el propio juego, que avisa con `MLArcade.started()` y `MLMissions.runStart()`. |
| `pause` / `resume` | `MLArcade.init({ isActive, onPause, onResume })`. El SDK detiene la entrada y el juego corta su loop y su audio. |
| `restart` | `onRestart`, que el SDK llama desde el menú de pausa. |
| `resize` | Lo maneja cada juego (canvas o renderer, con DPR acotado por la calidad). |
| `quality` | `onQuality('low'\|'medium'\|'high')`, al iniciar y cada vez que cambia. |
| `destroy` | `onExit` en `pagehide`: corta el loop y cierra el audio. Al navegar, el navegador libera el documento entero. La prueba de ciclo de vida lo verifica. |

**Por qué no Vite + TypeScript ahora:** el sitio se sirve tal cual en Vercel, sin build. Para el código compartido ya hay tipos con JSDoc y `tsc --checkJs`. Pasar a Vite tendría sentido si los juegos se parten en módulos. Queda como etapa futura en PENDIENTES.md.

## Misiones (`MLMissions`)

- **Separación:** los juegos emiten **eventos** desde su lógica (`emit('waveClear')`, `emit('combo', 5)`) y nunca desde el render. Las misiones se declaran como datos.
- **Tipos de misión:**
  - `count` suma valores.
  - `max` toma el mayor valor.
  - `failOn` la hace fallar en la partida.
  - `requireWin` se evalúa al cerrar la partida.
- **Por partida:** una principal y N secundarias que rotan, primero las nunca completadas. Las completadas quedan como **logros** en `ml:missions`, y el portal los muestra.
- **Dificultad:** Fácil, Normal, Difícil o Extremo, por juego (`ml:difficulty`). Cada juego define su tabla y **Normal es el balance original**.
- **No hay misiones diarias ni semanales**, porque no hay reloj de servidor confiable (regla del prompt). Hay campañas y logros locales.

## Calidad gráfica

- **Ajuste:** global `auto|low|medium|high`, en `ml:settings`.
- **`auto`:** se resuelve con `deviceMemory`, `hardwareConcurrency` y el tipo de puntero, sin benchmark. Algunos juegos 3D además bajan un nivel si se sostienen por debajo de ~27 fps en `auto`.
- **Dónde se cambia:** en **⚙ Opciones** (fuera de partida) o en el menú de pausa.
- **Qué cambia en cada juego:** ver la tabla de calidad en `docs/games/<juego>.md`.

## 3D

- **Three.js r128 local:** ya no hay pantalla negra si falla el CDN.
- **WebGL:** `MLArcade.requireWebGL()` corre antes de crear el renderer y, si falta WebGL o no cargó el motor, muestra una pantalla de respaldo.
- **Optimizaciones dentro de r128:**
  - escenarios fusionados por material;
  - `InstancedMesh` para monstruos, partículas y pasto (¡SALVA AL REY!);
  - pixel ratio acotado por calidad;
  - sombras reales solo en calidad alta;
  - liberación de geometrías y materiales.
- **Migración a Three.js moderno:** etapa 2, ver PENDIENTES.md. Cambia el manejo de color e iluminación y necesita una regresión visual.

## Personajes

`MLChars` carga los GLB de Mati Octo con un lector propio y mínimo, y los sprites 2D pre-renderizados con `tools/render-mati-sprites.mjs`. La carga es diferida: solo si el jugador lo elige. Si falla, el juego vuelve al personaje clásico y avisa.

## Datos guardados (localStorage)

| Clave | Contenido | Migración |
|---|---|---|
| `ml:scores`, `ml:stats` | récords y estadísticas por juego | lee las claves viejas (`clavado_best`, `torre_best`…), que se siguen escribiendo |
| `ml:missions`, `ml:difficulty` | logros y dificultad por juego | nuevas |
| `ml:settings` | sonido, FPS, calidad | nueva |
| `ml:character`, `ml:favs`, `ml:portal-view` | personaje, favoritos, vista del portal | nuevas |
| claves propias de cada juego | progreso específico (p. ej. `turbo:progress`, `mg_best2`) | ver el doc de cada juego |

## Pruebas automatizadas

- `tests/unit` (Vitest): SDK, misiones y catálogo.
- `tests/e2e/<juego>.spec.js` (Playwright, escritorio y Pixel 7).
- `tests/e2e/lifecycle.spec.js`: 10 aperturas y 10 reinicios.
- `.github/workflows/ci.yml`: corre todo en cada push.
- Gamepads físicos: el SDK los ignora bajo `navigator.webdriver` (había joysticks reales generando teclas fantasma en las pruebas).
