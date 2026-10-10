# JUEGO 14 · Bastiones Elementales

**Estado:** especificación para implementar, no juego terminado.

**Género:** Tower defense 3D

## Identidad y bucle jugable
Preparar defensas, colocar torres, administrar recursos y resistir oleadas.

**Diferenciación:** Estrategia 3D con combinaciones elementales y mapa interactivo.

## Escenarios 3D obligatorios
- Puente Glacial: escena navegable con objetivo, variedad visual y elementos interactivos.
- Paso de Lava: escena navegable con objetivo, variedad visual y elementos interactivos.
- Valle del Trueno: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- torres fuego/hielo/rayo con sinergias.
- caminos definidos, upgrades y reubicación limitada.
- oleadas con tipos de armadura y ritmo inteligible.

## Interacciones funcionales
- torres seleccionables: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- palancas de puente: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- cristales generadores de recursos: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- gólem de hielo: silueta, patrón de comportamiento y contrajuego únicos.
- imp volcánico: silueta, patrón de comportamiento y contrajuego únicos.
- caballero blindado: silueta, patrón de comportamiento y contrajuego únicos.
- unidad voladora: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Titán Elemental: cambia inmunidades y desvía una ruta. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Defender cristal principal.
2. Completar 10 oleadas.
3. Detener Titán Elemental.

## Misiones secundarias
- Ganar sin usar torre de fuego.
- Mejorar tres torres al máximo.
- Salvar todos los cristales auxiliares.
- Derrotar cien enemigos.

## Condiciones de partida
- Derrota: Salud cristal cero.
- Victoria: Titán derrotado, cristal intacto.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- 4 torres, en glTF/GLB optimizado con materiales y escala coherentes.
- oleadas enemigas, en glTF/GLB optimizado con materiales y escala coherentes.
- tres arenas, en glTF/GLB optimizado con materiales y escala coherentes.
- cristales, en glTF/GLB optimizado con materiales y escala coherentes.
- proyectiles, en glTF/GLB optimizado con materiales y escala coherentes.
- UI economía, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: selección toque, rotación simple y zoom.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
