# JUEGO 20 · Portales Imposibles

**Estado:** especificación para implementar, no juego terminado.

**Género:** Puzles de portales 3D

## Identidad y bucle jugable
Examinar cámaras, orientar portales, mover cubos y resolver enigmas espaciales.

**Diferenciación:** Puzles espaciales con teletransporte físicamente consistente.

## Escenarios 3D obligatorios
- Laboratorio Azul: escena navegable con objetivo, variedad visual y elementos interactivos.
- Salas de Gravedad: escena navegable con objetivo, variedad visual y elementos interactivos.
- Núcleo Prismático: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- portales de par definido y limitaciones de superficie.
- cubos físicos, momentum controlado y raycast.
- pistas por etapas y modo contrarreloj.

## Interacciones funcionales
- paneles de energía: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- interruptores: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- cubos: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- puertas temporizadas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- torretas de seguridad: silueta, patrón de comportamiento y contrajuego únicos.
- esferas supervisoras: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Núcleo Fractal: puzle final por fases con portales móviles. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Resolver tres salas iniciales.
2. Restaurar generador.
3. Salir del Núcleo Fractal.

## Misiones secundarias
- Terminar sala con dos portales.
- Obtener todos los cristales.
- Resolver sin pistas.
- Finalizar en tiempo objetivo.

## Condiciones de partida
- Derrota: Caída/restablecer sala; nunca softlock irreversible.
- Victoria: Restaurar sistema y cruzar portal de salida.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- gun portal, en glTF/GLB optimizado con materiales y escala coherentes.
- marcos portales, en glTF/GLB optimizado con materiales y escala coherentes.
- cubos, en glTF/GLB optimizado con materiales y escala coherentes.
- paneles, en glTF/GLB optimizado con materiales y escala coherentes.
- sala modular, en glTF/GLB optimizado con materiales y escala coherentes.
- efecto portal, en glTF/GLB optimizado con materiales y escala coherentes.
- torretas, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: mirar y tocar punto de destino con controles adaptados.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
