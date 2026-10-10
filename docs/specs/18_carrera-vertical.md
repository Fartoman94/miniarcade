# JUEGO 18 · Carrera Vertical

**Estado:** especificación para implementar, no juego terminado.

**Género:** Parkour urbano 3D

## Identidad y bucle jugable
Correr, saltar, impulsarse por muros, deslizarse y alcanzar meta con rutas alternativas.

**Diferenciación:** Parkour competitivo con físicas legibles y rutas creativas.

## Escenarios 3D obligatorios
- Distrito del Amanecer: escena navegable con objetivo, variedad visual y elementos interactivos.
- Rascacielos de Neón: escena navegable con objetivo, variedad visual y elementos interactivos.
- Grúas del Puerto: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- movimiento de precisión asistido y parkour de pared.
- cronómetro con fantasmas de carreras previas.
- rutas secretas y atajos por habilidad.

## Interacciones funcionales
- tirolinas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- plataformas elevadoras: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- puertas automáticas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- paneles de impulso: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- drones de vigilancia: silueta, patrón de comportamiento y contrajuego únicos.
- barreras móviles: silueta, patrón de comportamiento y contrajuego únicos.
- torretas no letales: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Circuito Maestro: persecución contra dron gigante en azoteas. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Completar tres circuitos.
2. Derrotar tiempo de campeonato.
3. Escapar del dron jefe.

## Misiones secundarias
- Conseguir cinco coleccionables.
- Hacer combo de movimiento x4.
- Cruzar sector sin caer.
- Usar dos rutas alternativas.

## Condiciones de partida
- Derrota: Caída vuelve a checkpoint con penalización.
- Victoria: Llegar a la meta de campeonato.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- runner, en glTF/GLB optimizado con materiales y escala coherentes.
- rampas, en glTF/GLB optimizado con materiales y escala coherentes.
- edificios modulares, en glTF/GLB optimizado con materiales y escala coherentes.
- drones, en glTF/GLB optimizado con materiales y escala coherentes.
- tirolinas, en glTF/GLB optimizado con materiales y escala coherentes.
- neón, en glTF/GLB optimizado con materiales y escala coherentes.
- relojes, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: stick, salto, deslizar, botón contextual.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
