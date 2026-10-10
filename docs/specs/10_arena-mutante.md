# JUEGO 10 · Arena Mutante

**Estado:** especificación para implementar, no juego terminado.

**Género:** Supervivencia 3D tercera persona

## Identidad y bucle jugable
Explorar arena, disparar, esquivar, reunir recursos y sobrevivir hasta extracción.

**Diferenciación:** Sobrevivencia táctica con objetos del entorno y extracción.

## Escenarios 3D obligatorios
- Búnker oxidado: escena navegable con objetivo, variedad visual y elementos interactivos.
- Estación eléctrica: escena navegable con objetivo, variedad visual y elementos interactivos.
- Laboratorio tóxico: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- tercera persona con cámara al hombro y roll de evasión.
- oleadas con director de amenazas y rutas de escape.
- fabricación simple de barricadas y mejoras.

## Interacciones funcionales
- puertas con energía: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- cajas de suministros: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- generadores y trampas activables: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- corredor: silueta, patrón de comportamiento y contrajuego únicos.
- bruto: silueta, patrón de comportamiento y contrajuego únicos.
- escupidor tóxico: silueta, patrón de comportamiento y contrajuego únicos.
- acechador invisible: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Coloso Radiactivo: destruye coberturas y altera la arena. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Restablecer tres generadores.
2. Sobrevivir seis oleadas.
3. Llamar y alcanzar extracción.

## Misiones secundarias
- Salvar superviviente.
- Derrotar 15 enemigos sin perder vida.
- Activar dos trampas.
- Encontrar antídoto escondido.

## Condiciones de partida
- Derrota: Vida cero o extracción fallida.
- Victoria: Llegar al transporte tras defender su llegada.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- sobreviviente, en glTF/GLB optimizado con materiales y escala coherentes.
- 4 mutantes, en glTF/GLB optimizado con materiales y escala coherentes.
- coloso, en glTF/GLB optimizado con materiales y escala coherentes.
- barricadas, en glTF/GLB optimizado con materiales y escala coherentes.
- puertas, en glTF/GLB optimizado con materiales y escala coherentes.
- laboratorio, en glTF/GLB optimizado con materiales y escala coherentes.
- módulos de armas, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: doble stick y autoapuntado configurable.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
