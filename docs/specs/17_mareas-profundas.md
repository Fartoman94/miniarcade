# JUEGO 17 · Mareas Profundas

**Estado:** especificación para implementar, no juego terminado.

**Género:** Exploración submarina 3D

## Identidad y bucle jugable
Pilotear minisubmarino, usar sonar, recuperar artefactos y gestionar energía.

**Diferenciación:** Exploración pausada con tensión ambiental y gestión de recursos.

## Escenarios 3D obligatorios
- Arrecifes Bioluminiscentes: escena navegable con objetivo, variedad visual y elementos interactivos.
- Ciudad Sumergida: escena navegable con objetivo, variedad visual y elementos interactivos.
- Fosa Silenciosa: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- energía, presión y oxígeno simplificados.
- sonar con pulsos y ecos.
- puertas acuáticas y módulos de buceo.

## Interacciones funcionales
- sondas científicas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- escombros movibles: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- puertas hidráulicas y cajas negras: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- medusa eléctrica: silueta, patrón de comportamiento y contrajuego únicos.
- anguila guardiana: silueta, patrón de comportamiento y contrajuego únicos.
- dron submarino: silueta, patrón de comportamiento y contrajuego únicos.
- pulpo territorial: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Leviatán Abisal: secuencia de evasión y desactivación del reactor, no disparos triviales. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Escanear fauna.
2. Recuperar caja negra.
3. Activar faro de la fosa.

## Misiones secundarias
- Fotografiar cinco especies.
- Encontrar ruina oculta.
- Recuperar cápsula sin chocar.
- Salir con 30% de batería.

## Condiciones de partida
- Derrota: Energía o casco a cero.
- Victoria: Activar faro y volver a superficie.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- submarino, en glTF/GLB optimizado con materiales y escala coherentes.
- corales, en glTF/GLB optimizado con materiales y escala coherentes.
- ruinas, en glTF/GLB optimizado con materiales y escala coherentes.
- pez, en glTF/GLB optimizado con materiales y escala coherentes.
- criaturas, en glTF/GLB optimizado con materiales y escala coherentes.
- sonar HUD, en glTF/GLB optimizado con materiales y escala coherentes.
- luces submarinas, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: stick más botones profundidad/sonar.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
