# JUEGO 16 · Academia de Dragones

**Estado:** especificación para implementar, no juego terminado.

**Género:** Aventura aérea 3D

## Identidad y bucle jugable
Volar con dragón, atravesar aros, rescatar animales y perfeccionar habilidades.

**Diferenciación:** Juego de vuelo libre con misiones de cuidado y entrenamiento.

## Escenarios 3D obligatorios
- Picos Nubosos: escena navegable con objetivo, variedad visual y elementos interactivos.
- Lago de Espejos: escena navegable con objetivo, variedad visual y elementos interactivos.
- Volcán Dormido: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- vuelo accesible con ascenso/descenso.
- dragones con atributos de velocidad, resistencia y elementalidad.
- entrenamientos, carreras y retos de rescate.

## Interacciones funcionales
- nidos: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- posadas flotantes: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- marcadores de entrenamiento y huevos: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- murciélago sombrío: silueta, patrón de comportamiento y contrajuego únicos.
- arpía aérea: silueta, patrón de comportamiento y contrajuego únicos.
- autómata volador: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Serpiente de Tormenta: jefe aéreo con tormentas y ventanas de vulnerabilidad. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Graduarse de aprendiz.
2. Dominar tres pruebas aéreas.
3. Proteger la academia de tormenta.

## Misiones secundarias
- Encontrar huevo brillante.
- Rescatar dos criaturas.
- Superar circuito sin tocar roca.
- Desbloquear tercer dragón.

## Condiciones de partida
- Derrota: Sin energía o caída, reaparecer en checkpoint.
- Victoria: Terminar prueba y salvar academia.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- 3 dragones, en glTF/GLB optimizado con materiales y escala coherentes.
- academia, en glTF/GLB optimizado con materiales y escala coherentes.
- anillos, en glTF/GLB optimizado con materiales y escala coherentes.
- nubes, en glTF/GLB optimizado con materiales y escala coherentes.
- peñascos, en glTF/GLB optimizado con materiales y escala coherentes.
- huevos, en glTF/GLB optimizado con materiales y escala coherentes.
- serpiente, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: arrastrar dirección + dos botones altitud.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
