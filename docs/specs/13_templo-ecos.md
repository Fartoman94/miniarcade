# JUEGO 13 · Templo de los Ecos

**Estado:** especificación para implementar, no juego terminado.

**Género:** Puzles y aventura 3D

## Identidad y bucle jugable
Explorar ruinas, manipular mecanismos, resolver salas y esquivar trampas.

**Diferenciación:** Resolución de puzles con físicas y objetos de entorno.

## Escenarios 3D obligatorios
- Vestíbulo de Estatuas: escena navegable con objetivo, variedad visual y elementos interactivos.
- Salas de Resonancia: escena navegable con objetivo, variedad visual y elementos interactivos.
- Cámara del Guardián: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- puzles de luz, sonido y presión con pistas legibles.
- plataformas temporizadas con checkpoints.
- reliquias que transforman una habilidad de exploración.

## Interacciones funcionales
- espejos giratorios: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- placas de presión: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- puertas selladas y bloques movibles: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- centinela de piedra: silueta, patrón de comportamiento y contrajuego únicos.
- araña de ruinas: silueta, patrón de comportamiento y contrajuego únicos.
- espectro vigía: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Guardián Eco: se derrota devolviendo rayos y accionando mecanismos. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Encontrar sello del eco.
2. Resolver tres salas.
3. Desactivar corazón del templo.

## Misiones secundarias
- Descubrir dos salas secretas.
- Resolver acertijo sin usar pistas.
- Recoger seis códices.
- Terminar una sala en tiempo récord.

## Condiciones de partida
- Derrota: Caída o vida cero devuelve al checkpoint.
- Victoria: Reactivar templo sin sacrificar reliquia.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- bloques antiguos, en glTF/GLB optimizado con materiales y escala coherentes.
- estatuas, en glTF/GLB optimizado con materiales y escala coherentes.
- espejos, en glTF/GLB optimizado con materiales y escala coherentes.
- placas, en glTF/GLB optimizado con materiales y escala coherentes.
- puertas, en glTF/GLB optimizado con materiales y escala coherentes.
- cristales, en glTF/GLB optimizado con materiales y escala coherentes.
- guardián, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: joystick + interacción contextual + cámara accesible.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
