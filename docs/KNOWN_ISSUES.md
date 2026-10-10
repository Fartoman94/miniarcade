# Problemas conocidos y pendientes — MiniArcade

## Generales
- **CI:** `.github/workflows/ci.yml` corre tipos, Vitest y Playwright (escritorio) en cada push. Las pruebas de móvil se corren localmente.
- **Sin pruebas en dispositivos reales.** Todo se probó en Chromium headless: escritorio 1280×800 y emulación de Pixel 7. Faltan iOS Safari, Firefox, un Android real y un gamepad físico.
- **FPS reales.** Las mediciones usan SwiftShader (render por CPU) y sirven para comparar, no como FPS de un dispositivo. Ver [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md).
- **Audio:** se verificó por su estado (corriendo, suspendido o silenciado), no escuchándolo.
- **Three.js r128** (2021) se mantuvo a propósito: migrar cambia la iluminación y el color. Si en algún momento se actualiza, hay que revisar visualmente los tres juegos 3D.
- **Google Fonts** es externo: sin conexión, los juegos usan la fuente del sistema.
- **No hay `sitemap.xml`** porque se desconoce el dominio de publicación. Hay que agregarlo con URLs absolutas al decidir dónde se publica.
- **CSP:** los juegos usan scripts y estilos inline, así que una Content-Security-Policy útil requiere moverlos a archivos aparte. Se dejó `referrer` estricto y ningún uso de `eval` ni de `innerHTML` con datos externos.
- **Telemetría** solo local (`ml:telemetry` en localStorage). Para observabilidad remota hace falta un endpoint.
- **Acciones del menú de pausa:** "Reiniciar" llama a `resume(true)` sin `onResume`. Cada juego debe limpiar su propia bandera de pausa dentro de `onRestart`. El test "reiniciar desde el menú de pausa" de cada juego lo verifica.
- **Tecla Espacio en pausa:** con el foco en "Reanudar", Espacio o Enter reanudan, por ser un botón nativo. Es intencional.

## Por juego

## ¡CLAVADO!

- El combo sin tope (hallazgo 9) se dejó como está por ser parte del diseño.
- Los textos flotantes (`+10`, `¡ROTO!`) guardan coordenadas absolutas: si se redimensiona justo mientras están en pantalla, quedan desplazados un instante.
- El fondo del menú y de la pantalla final se sigue animando (es la demo del juego); no hay ahorro de CPU extra ahí.
- No se verificó el audio de forma audible en headless; mute/pausa del audio están revisados a nivel de código.

_Detalle completo: [docs/games/clavado.md](games/clavado.md)_

---

## FRUTA FURIA

- El silencio no tiene prueba automática (sólo se verificó leyendo el código: ganancia maestra + no se crean osciladores).
- La ruta de la bomba no está en la spec porque depende del azar (bombas desde los 8 s); se verificó con un script aparte.
- El fondo del menú y de la pantalla de fin sigue animándose a 60 fps (es parte de la presentación); no se limitó.
- Accesibilidad: el juego es de deslizar, no hay alternativa por teclado ni gamepad para cortar.
- Sin prueba en dispositivo real (sólo emulación Pixel 7 en headless).

_Detalle completo: [docs/games/fruta_furia.md](games/fruta_furia.md)_

---

## MUERTE GLORIOSA

- En celular apaisado, al arrancar el nivel el personaje (x=120) queda parcialmente detrás de los botones ◀ ▶ (son translúcidos) hasta que la cámara empieza a seguirlo.
- La muerte `fall` sigue siendo inalcanzable (no hay pozos). No se agregaron pozos para no cambiar el diseño de los niveles.
- El cambio del yunque (colgado arriba en vez de apoyado en el piso) modifica un poco la dificultad: corriendo a toda velocidad se lo esquiva y, si te quedás debajo, te aplasta. Antes había que saltarlo como un obstáculo y caía mientras estabas en el aire.
- El fallback de `roundRect` no se probó en un Safari viejo real.
- No se midió el rendimiento durante la partida (`measure.mjs` mide el menú).

_Detalle completo: [docs/games/muerte_gloriosa.md](games/muerte_gloriosa.md)_

---

## NEON SURVIVOR

- Por debajo de ~7,5 FPS el juego entra en cámara lenta (máx. 8 pasos por frame); es intencional para evitar la espiral de atraso, pero en equipos muy lentos el reloj del juego va más lento que el real.
- Los enemigos siguen superponiéndose en un solo "blob" cuando alcanzan al jugador (comportamiento original; no se agregó separación para no cambiar la sensación).
- No se probó con un gamepad físico (sólo el mapeo a teclas del SDK).
- El audio se verificó sólo a nivel de estado (`AudioContext` `running`/silenciado), no escuchando en un dispositivo real.
- El anuncio del Coloso se dibuja con `shadowBlur` sobre texto (sólo 2,5 s cada 2 min; costo aceptable).

_Detalle completo: [docs/games/neon_survivor.md](games/neon_survivor.md)_

---

## ¡SALVA AL REY!

- No hay forma de volver al menú del juego (elegir el otro modo) sin terminar la partida. Pasaba igual antes, y en el modo paseo, que no termina nunca, solo quedan "Reiniciar" o "Volver al arcade". Haría falta que el SDK permita acciones propias en el menú de pausa.
- El balance de dificultad cambió porque el portón ahora recibe daño de verdad (+10 de reparación entre oleadas). No se jugaron las 10 oleadas a mano para afinarlo.
- No se pudo medir fps de forma útil por la carga de la máquina. Conviene repetir `measure.mjs` con la máquina libre.
- El escenario fusionado ya no se descarta por frustum en partes (es una malla grande por material). Con este tamaño de escena es irrelevante.

_Detalle completo: [docs/games/salva_al_rey.md](games/salva_al_rey.md)_

---

## TORRE INFINITA

- En pantallas ultra anchas (≥ ~2000 px) el bloque cruza más distancia y el tope de velocidad se alcanza desde el inicio; la curva se aplana ahí (como antes, pero con tope mayor).
- La posición del bloque al soltar es la del último cuadro dibujado; a FPS muy bajos la precisión del toque es menor.
- El registro (`games/registry.js`) dice `scoreLabel: 'pisos'`, pero el juego cuenta **puntos** (las caídas perfectas suman 1 + combo). Ver corrección propuesta en el informe.
- La demo de la portada sigue animando el canvas mientras se está en el menú (es la presentación del juego; el navegador la frena con la pestaña oculta).

_Detalle completo: [docs/games/torre_infinita.md](games/torre_infinita.md)_

---

## TURBO FURIA

- El registro (`games/registry.js`) no menciona el freno en los controles; ver corrección sugerida en el reporte.
- `MLArcade.scores.best()` ignora `legacyBestKey` si se llama antes de que cargue el registro (import asíncrono); el juego lo resuelve leyendo también `turbo_best`.
- Las animaciones CSS (banner de cuenta, popups de puntos) siguen corriendo durante la pausa; es sólo visual.
- No se probó en dispositivos reales ni con un gamepad físico (el mapa se configuró pero no se verificó con hardware).
- Las mediciones de FPS no son representativas por la carga de la máquina durante la sesión (ver arriba).

_Detalle completo: [docs/games/turbo_furia.md](games/turbo_furia.md)_

---

## EL VALLE ENCANTADO

- Las partículas siguen siendo una malla por partícula (cada una con su material para color/opacidad): con humo, estelas de dragón y destellos son ~30–50 draw calls. Se podría pasar a `InstancedMesh`, pero cambia el fundido de opacidad del humo.
- Los 16 destellos del cielo y los sprites de brillo siguen siendo un draw call cada uno.
- El decorado unido no se descarta por frustum; si en GPUs de celulares viejos se notara, partirlo en celdas.
- La animación CSS del cartel sigue corriendo durante la pausa (es sólo visual).
- No se guarda el progreso parcial de "Explorar" (la partida es corta; se guarda el mejor tiempo).
- Los FPS medidos en headless no muestran mejora por el raster de SwiftShader y la carga de la máquina; falta medir en un dispositivo real.
- El registro (`games/registry.js`) tiene datos desactualizados; ver la corrección sugerida en el informe.

_Detalle completo: [docs/games/valle_encantado.md](games/valle_encantado.md)_