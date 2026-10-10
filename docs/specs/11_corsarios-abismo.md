# JUEGO 11 · Corsarios del Abismo

**Estado:** especificación para implementar, no juego terminado.

**Género:** Aventura naval 3D

## Identidad y bucle jugable
Navegar, maniobrar, disparar cañones, desembarcar e investigar islas.

**Diferenciación:** Mar navegable y exploración de pequeñas islas combinadas.

## Escenarios 3D obligatorios
- Bahía del Contrabandista: escena navegable con objetivo, variedad visual y elementos interactivos.
- Archipiélago de la Bruma: escena navegable con objetivo, variedad visual y elementos interactivos.
- Fuerte de Coral Negro: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- vela y timón arcade con inercia fácil de aprender.
- combate de costado con recarga y proyectiles balísticos.
- desembarco en pequeñas islas y apertura de cofres.

## Interacciones funcionales
- muelles y mercados: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- cañones de costa: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- tesoros enterrados: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- goleta pirata: silueta, patrón de comportamiento y contrajuego únicos.
- lancha corsaria: silueta, patrón de comportamiento y contrajuego únicos.
- fortaleza artillada: silueta, patrón de comportamiento y contrajuego únicos.
- tiburón gigante: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Almirante Espectral: galeón acorazado con cañones encantados. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Reunir tres fragmentos de mapa.
2. Asaltar fortaleza.
3. Vencer al Almirante Espectral.

## Misiones secundarias
- Rescatar náufragos.
- Descubrir una cueva.
- Abordar una goleta.
- Terminar batalla sin perder el mástil.

## Condiciones de partida
- Derrota: Barco hundido.
- Victoria: Recuperar el cofre del Almirante.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- barco jugador, en glTF/GLB optimizado con materiales y escala coherentes.
- galeón enemigo, en glTF/GLB optimizado con materiales y escala coherentes.
- isla modular, en glTF/GLB optimizado con materiales y escala coherentes.
- faro, en glTF/GLB optimizado con materiales y escala coherentes.
- muelle, en glTF/GLB optimizado con materiales y escala coherentes.
- cañón, en glTF/GLB optimizado con materiales y escala coherentes.
- mar y espuma, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: volante/timón virtual + botones de cañón.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
