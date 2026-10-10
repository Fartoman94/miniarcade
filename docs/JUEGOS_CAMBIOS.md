# Cambios por juego — MiniArcade 3.0

> Rama `feat/miniarcade-3`, un commit por juego. Cada juego tiene el detalle completo en `docs/games/<juego>.md`, sección «MiniArcade 3.0»: tablas de misiones, dificultad y calidad, pruebas y mediciones.
> Común a los 8:
> - misiones con `MLMissions`: una principal y 2 secundarias por partida, más logros persistentes;
> - selector de dificultad Fácil/Normal/Difícil/Extremo, donde **Normal = balance original**;
> - calidad baja/media/alta con efecto real;
> - en los 3D, `requireWebGL()` y Three.js local;
> - un solo récord por juego para todas las dificultades;
> - claves viejas de localStorage conservadas.

## Antes → después

| Juego | Antes (al empezar 3.0) | Después | Misiones | Tests (escritorio + móvil) |
|---|---|---|---|---|
| **¡CLAVADO!** | Tronco 2D plano, un solo escenario, patrones de giro básicos | 4 biomas (Bosque, Nieve, Volcán, Caverna) con paralaje · tronco 2.5D pre-renderizado · placas de acero, hielo y compuertas con aviso · 3 patrones de giro nuevos · tronco jefe cada 5 niveles (3–4 fases) · reto por nivel · efectos de clavada. **Precisión angular intacta**, con test sobre la matemática real. | 2 + 6 | 33 ✓ / 1 omitida |
| **FRUTA FURIA** | Frutas, dorada y bomba; dificultad estancada | Fruta helada (cámara lenta) y ananá gigante de 3 tajos · bomba con calavera y petardo de −1 vida, los dos con aviso de 0,6 s · oleadas con patrones · **Sandía Gigante** (jefa en 3 fases) cada 4 oleadas · multitáctil de 3 dedos · rastro en cinta y salpicaduras. Colisión del gesto sin cambios. | 2 + 8 | 23 ✓ / 1 |
| **MUERTE GLORIOSA** | 6 niveles | **Acto 1 intacto + Acto 2 con 4 niveles nuevos**: pozos y piedras rajadas, *La Grúa Loca* (jefa ambiental en 3 fases), *La Fábrica de Prensas*, *La Aplanadora* (persecución) · banderas de control · pollos de oro secretos · desafíos sin morir · 3 muertes nuevas · paralaje de 3 capas · coyote time de 80 ms. Los niveles 7–10 los completa un recorrido guionado en las 4 dificultades. | 2 + 7 | 47 ✓ / 7 |
| **NEON SURVIVOR** | 3 tipos de enemigo y un Coloso simple | Embestidor, Espectro, Nido y Élite, cada uno con su aviso · **Coloso con 3 fases**, barra y ataques avisados (mín. 0,6 s), sin invulnerabilidad injusta · oleadas y enjambres · armas Orbitales, Pulso y Rayo con evolución · objetos especiales · sprites 2.5D cacheados · topes y pools. | 2 + 8 | 48 ✓ / 2 |
| **¡SALVA AL REY!** | 3 tipos de enemigo y 10 oleadas sin jefes | Arquero goblin, troll ariete y chamán con avisos · **Grumak** (oleada 5) y **Morvath** (oleada 10) con fases · rescate de aldeanos · fardos de madera que reparan el portón · barras de vida, marcadores de amenaza y flechas en el borde · modelos con animación por partes · `InstancedMesh` · grilla espacial · huecos del nivel corregidos · balance del portón verificado con oleadas guionadas. | 2 + 7 | 53 ✓ / 1 |
| **TORRE INFINITA** | Apilar con cielo cambiante | Corte extraído a `computeCut()` **idéntico** al original (3000 casos aleatorios comparados con `===`) · tormentas con viento · bloque gigante de acero · desafío de estabilidad en 3 fases · piezas dorada, hielo, pesada y escudo · zonas de altura hasta la órbita · bloques 2.5D con sombras. | 2 + 7 | 43 ✓ / 1 |
| **TURBO FURIA** | 5 autos, un modo, una ruta | **9 autos** (4 desbloqueables) con ruedas que giran y luces · modos **Contrarreloj** y **Duelo** contra un rival con IA · 4 biomas de día y de noche · obras con aviso · latas de nitro · nitro con llamas y FOV · **ranking local** por auto, modo y dificultad (aclarado como no mundial) · hitbox idéntico en los 17 modelos. | 2 + 9 | 37 ✓ / 1 |
| **EL VALLE ENCANTADO** | 8 habitantes y 12 fragmentos, sin misiones | Misiones de los habitantes: 2 principales de Alba y 7 secundarias · **diario** con misiones, mapa y álbum · brújula, rastreador y minimapa · 4 zonas · 4 tesoros · **3 guardianes** y el **Rey Sombrío** en 3 fases · jefe cada 5 oleadas en Proteger · pasto, flores y pinos instanciados · niebla. Campaña original intacta. | 2 + 6 | 42 ✓ / 2 |

Las pruebas omitidas lo están a propósito, por dispositivo: táctil en escritorio y teclado físico en móvil.

## Mati Octo (etapa previa, rama `feat/personaje-mati-octo`)

Seleccionable en MUERTE GLORIOSA, NEON SURVIVOR, ¡SALVA AL REY! y EL VALLE ENCANTADO. Son **poses estáticas**: el personaje cambia entre quieto, correr y saltar según el estado, sin esqueleto. Mantiene el colisionador original y, si falla la carga, vuelve al personaje clásico con un aviso.

## Lo que no se cambió a propósito

- **No se reemplazó ningún coleccionable por el logo de MateLabs:** no hay un logo oficial en el repo, solo la mascota.
- **Sin misiones diarias ni semanales:** no hay un reloj de servidor confiable.
- **Sin ranking global:** no hay backend con validación.
- **Three.js sigue en r128:** se sirve local; la migración queda como etapa 2.
- **Récord único por juego:** no se separó por dificultad. En TURBO FURIA, el ranking local sí separa por dificultad.
