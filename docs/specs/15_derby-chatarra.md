# JUEGO 15 · Derby de Chatarra

**Estado:** especificación para implementar, no juego terminado.

**Género:** Demolición vehicular 3D

## Identidad y bucle jugable
Conducir, derrapar, embestir, sobrevivir y sumar puntuación en arenas dinámicas.

**Diferenciación:** Carrera-arena de choque distinta a Turbo Furia.

## Escenarios 3D obligatorios
- Depósito Industrial: escena navegable con objetivo, variedad visual y elementos interactivos.
- Coliseo Desértico: escena navegable con objetivo, variedad visual y elementos interactivos.
- Arenas Neón: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- física arcade de colisiones con daño representado.
- power-ups imanes, nitro, escudos y trampas.
- vehículos con masas y habilidades distintas.

## Interacciones funcionales
- rampas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- contenedores móviles: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- interruptores de barreras: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- kart veloz: silueta, patrón de comportamiento y contrajuego únicos.
- camioneta ariete: silueta, patrón de comportamiento y contrajuego únicos.
- auto volador prototipo: silueta, patrón de comportamiento y contrajuego únicos.
- camión blindado: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Triturador Omega: camión monstruoso con escudo y carga especial. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Ganar clasificatoria.
2. Destruir cinco rivales.
3. Derrotar Triturador Omega.

## Misiones secundarias
- Hacer tres saltos acrobáticos.
- Sobrevivir sin reparación.
- Usar tres tipos de potenciador.
- Destruir dos torres de cajas.

## Condiciones de partida
- Derrota: Salud vehículo cero.
- Victoria: Primero en puntos al finalizar torneo.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- 6 autos, en glTF/GLB optimizado con materiales y escala coherentes.
- rampas, en glTF/GLB optimizado con materiales y escala coherentes.
- torre de contenedores, en glTF/GLB optimizado con materiales y escala coherentes.
- partículas, en glTF/GLB optimizado con materiales y escala coherentes.
- pistas, en glTF/GLB optimizado con materiales y escala coherentes.
- HUD daño, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: volante virtual + acelerador/freno; aceleración opcional.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
