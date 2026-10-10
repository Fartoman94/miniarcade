# JUEGO 19 · Cocina del Caos

**Estado:** especificación para implementar, no juego terminado.

**Género:** Gestión cooperativa inspirada, modo solitario 3D

## Identidad y bucle jugable
Tomar ingredientes, cocinar, emplatar y entregar pedidos contra reloj.

**Diferenciación:** Juego divertido de cocina con interacciones de objetos y niveles.

## Escenarios 3D obligatorios
- Taberna del Reino: escena navegable con objetivo, variedad visual y elementos interactivos.
- Cocina Volcánica: escena navegable con objetivo, variedad visual y elementos interactivos.
- Restaurante Espacial: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- cocinas con estaciones utilizables en tiempo real.
- recetas de 2 a 5 pasos y pedidos progresivos.
- ayudante NPC IA simple con encargos seleccionables.

## Interacciones funcionales
- mesada: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- horno: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- fregadero: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- nevera: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- platos: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- cinta transportadora: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- obstáculos ambientales: fuego, derrame, roedores traviesos: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Gran Banquete: ronda de pedidos especialmente compleja, no jefe de combate. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Atender 8 órdenes.
2. Desbloquear segunda cocina.
3. Superar Gran Banquete.

## Misiones secundarias
- Completar 3 pedidos perfectos.
- No quemar ninguna receta.
- Mantener cocina limpia.
- Entregar 5 platos sin error.

## Condiciones de partida
- Derrota: Exceder pedidos fallidos.
- Victoria: Obtener estrellas necesarias en Gran Banquete.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- chef, en glTF/GLB optimizado con materiales y escala coherentes.
- ayudante, en glTF/GLB optimizado con materiales y escala coherentes.
- estaciones, en glTF/GLB optimizado con materiales y escala coherentes.
- ingredientes, en glTF/GLB optimizado con materiales y escala coherentes.
- platos, en glTF/GLB optimizado con materiales y escala coherentes.
- clientes, en glTF/GLB optimizado con materiales y escala coherentes.
- UI tickets, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: stick virtual + acción contextual grande.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
