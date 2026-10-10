# JUEGO 09 · Guardianes de la Galaxia

**Estado:** especificación para implementar, no juego terminado.

**Género:** Shooter espacial 3D

## Identidad y bucle jugable
Pilotear, esquivar, fijar objetivos, disparar y completar sectores de combate.

**Diferenciación:** Combate espacial 3D con cobertura entre asteroides y objetivos de escolta.

## Escenarios 3D obligatorios
- Cinturón de asteroides: escena navegable con objetivo, variedad visual y elementos interactivos.
- Orbital de la estación Delta: escena navegable con objetivo, variedad visual y elementos interactivos.
- Nebulosa de cristales: escena navegable con objetivo, variedad visual y elementos interactivos.

## Sistemas jugables obligatorios
- nave con inercia arcade y retícula predictiva.
- dos armas mejorables y escudo regenerativo.
- astros como cobertura y estaciones activables.

## Interacciones funcionales
- escaneos de balizas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- torretas defensivas aliadas: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.
- docks de reparación: colisión o raycast, indicación visual, animación, estado persistente de la sesión y prueba específica.

## Rivales y desafíos
- interceptor rápido: silueta, patrón de comportamiento y contrajuego únicos.
- dron minador: silueta, patrón de comportamiento y contrajuego únicos.
- bombardero pesado: silueta, patrón de comportamiento y contrajuego únicos.
- fragata protectora: silueta, patrón de comportamiento y contrajuego únicos.

**Jefe o gran evento:** Destructor Némesis: fases de torretas, escudos y reactor vulnerable. Animación introductoria, mecánica telegráfica, mínimo 2 fases o cambios de reglas y recompensa.

## Misiones principales
1. Salvar convoy mercante.
2. Desactivar tres transmisores.
3. Destruir el destructor Némesis.

## Misiones secundarias
- Completar sector sin perder escudo.
- Recuperar cinco cápsulas.
- Eliminar diez drones con láser secundario.
- Salvar dos cargueros aliados.

## Condiciones de partida
- Derrota: Nave destruida o convoy perdido.
- Victoria: Destruir reactor y escoltar último carguero.
- Reinicio limpio; salvado de progreso, récord y estado con versión; no bloqueo irreversible.

## Assets 3D mínimos
- caza de jugador, en glTF/GLB optimizado con materiales y escala coherentes.
- drones, en glTF/GLB optimizado con materiales y escala coherentes.
- fragata, en glTF/GLB optimizado con materiales y escala coherentes.
- asteroides, en glTF/GLB optimizado con materiales y escala coherentes.
- muelle espacial, en glTF/GLB optimizado con materiales y escala coherentes.
- proyectiles, en glTF/GLB optimizado con materiales y escala coherentes.
- HUD cockpit, en glTF/GLB optimizado con materiales y escala coherentes.

## Experiencia de controles
- Desktop: teclado/ratón o gamepad con mapa visible y configurable.
- Mobile: stick virtual de dirección + disparo asistido opcional.
- Pausa, mute, sensibilidad, reintento, optimización gráfica y accesibilidad desde el menú.

## Criterios de aprobación por juego
- Tres escenarios terminados jugables; tres misiones principales; cuatro secundarias; jefe/evento final.
- Cada elemento de interacción listado funciona y tiene test de comportamiento.
- Sin recursos, NPC, botones o rutas decorativas que prometan funcionalidad inexistente.
- Pruebas completas de partida, derrota, victoria, pausa, reinicio, navegación, guardado y celular.
- Cumple presupuesto de FPS y recursos definido en `07_TESTING/CRITERIOS_QA.md`, o documenta mediciones y degradación para hardware inferior.
- Logo Matelabs y estética distintiva.
- No contar el juego como terminado por disponer solo de menú, escena con cubos o placeholder.
