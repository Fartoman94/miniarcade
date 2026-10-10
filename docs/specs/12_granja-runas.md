# JUEGO 12 · Granja de Runas

**Estado:** especificación para implementar, no juego terminado.

**Género:** Simulador acogedor 3D

## Identidad y bucle jugable
Plantar, regar, cosechar, comerciar, decorar y ayudar al pueblo.

**Diferenciación:** Juego relajado basado en NPC con rutinas y progreso sin combate.

## Escenarios 3D obligatorios
- Granja inicial: escena navegable con objetivo, variedad visual y elementos interactivos.
- Mercado del pueblo: escena navegable con objetivo, variedad visual y elementos interactivos.
- Bosque de semillas raras: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- ciclo día/noche corto y estaciones suaves.
- parcelas cultivables con crecimiento determinista.
- economía local con pedidos y mejoras de herramientas.

## Interacciones funcionales
- parcelas y regaderas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- animales que alimentar: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- estanterías, tiendas y decoración: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- plagas traviesas no letales: silueta, patrón de comportamiento y contrajuego únicos.
- cuervos roba-semillas: silueta, patrón de comportamiento y contrajuego únicos.
- espíritus que alteran clima: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Evento Estación de Tormentas: desafío de rescatar cosechas, sin combate forzado. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Restaurar huerta.
2. Completar feria de cosechas.
3. Construir invernadero mágico.

## Misiones secundarias
- Adoptar tres animales.
- Cultivar flor arcoíris.
- Reparar molino.
- Ayudar a mercader a abastecer tienda.

## Condiciones de partida
- Derrota: Sin fracaso irreversible; eventos penalizan recursos recuperables.
- Victoria: Completar la feria y el invernadero.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- campesina, en glTF/GLB optimizado con materiales y escala coherentes.
- agricultor, en glTF/GLB optimizado con materiales y escala coherentes.
- animales, en glTF/GLB optimizado con materiales y escala coherentes.
- surcos, en glTF/GLB optimizado con materiales y escala coherentes.
- cultivos, en glTF/GLB optimizado con materiales y escala coherentes.
- herramientas, en glTF/GLB optimizado con materiales y escala coherentes.
- edificios rurales, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: arrastrar y tocar objetos en tercera persona.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
