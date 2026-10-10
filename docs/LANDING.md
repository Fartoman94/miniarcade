# Portada (landing) — MiniArcade 3.0

URL: `index.html`. En producción: https://miniarcade-gold.vercel.app (rama `main`).

## Estructura

1. **Hero**
   - Marca MateLabs, título y bajada.
   - **«▶ Jugar ahora»** lleva al **último juego jugado** (dato real de `ml:stats`). La primera vez lleva a un juego de la «Selección del equipo», que rota según el día.
   - «Ver los 8 juegos».
   - Totales del jugador (partidas, tiempo, juegos probados), solo si hay datos.
   - **Mascota con anillo orbital** de accesos a los 8 juegos: enlaces reales, navegables con teclado.
2. **Buscador y filtros**
   - búsqueda instantánea sin tildes, por varias palabras;
   - chips de categoría y ♥ Favoritos;
   - orden: Destacados, Más jugados, Jugados recientemente, A→Z (los dos de jugados usan datos reales).
3. **Selección del equipo:** curada a mano en el registro (`pick`). **No se muestran «Nuevos» ni «Más jugados» globales**, porque no existen datos reales de esa clase (regla del prompt).
4. **Seguir jugando:** los últimos 4 juegos con su récord.
5. **Catálogo**
   - tarjetas con ícono, descripción, categoría, tags y acento de color por juego;
   - récord, partidas y 🏅 logros;
   - miniatura (`thumb`) si el registro la define.
6. **Ficha** (`#/juego/<id>`): `<dialog>` accesible con controles (PC, táctil, gamepad), récord, partidas, tiempo, logros y «Te puede gustar».

## Sistema visual

- **Tokens CSS** en `:root`: fondo, paneles, líneas, texto y acento de marca `#2ee6e6`. Cada juego aporta su acento: `--glow` y `--accent-*`.
- **Tipografías:** Bungee (títulos) y Space Grotesk (texto), con tamaños fluidos (`clamp`).
- **Estados** hover y focus visibles, y enlace «Saltar al catálogo».
- `prefers-reduced-motion` desactiva las animaciones. Las partículas del fondo se detienen con la pestaña oculta.
- **Móvil:** una columna, chips con scroll horizontal propio, sin scroll horizontal de página (con test).

## SEO, PWA y rendimiento

- **SEO:** title, description, Open Graph y JSON-LD `ItemList` de `VideoGame`, más enlaces estáticos de respaldo para los buscadores.
- **PWA:** `manifest.webmanifest` y `sw.js`, con el portal funcionando sin conexión después de la primera visita (con test).
- **Carga diferida:** los juegos 3D cargan Three.js recién al abrirse. La intro y los sprites de Mati se descargan solo cuando hacen falta.
- **Audio:** ningún audio arranca sin un gesto del usuario.

## Pruebas

`tests/e2e/portal.spec.js` cubre catálogo, buscador, categorías, orden, favoritos persistentes, ficha por URL con récord migrado, intro, móvil sin scroll horizontal, service worker sin conexión, «Jugar ahora» con datos reales y logros en tarjeta y ficha.

## Pendiente

- **Miniaturas reales de cada juego:** se generan con capturas de Playwright cuando el contenido 3.0 esté cerrado. El registro ya admite `thumb`.
