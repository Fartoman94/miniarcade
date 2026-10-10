# Diseño ejecutable del reino para Valle Encantado + Salva al Rey

## Mapa objetivo
Zona 1: Aldea del Puente (plaza/mercado, taberna, herrería, cinco casas, huerta, molino).
Zona 2: Castillo del Alba (puerta, patio, sala del trono, cocina, torre de guardia, mazmorra).
Zona 3: Bosque de las Runas (senderos, claro, altar, cueva con mineral y un miniboss).
Zona 4: Campos Dorados (granjas, animales, establo y ruta secundaria de comercio).

## Edificios cuya entrada debe funcionar (mínimo 6)
1. Casa del herrero: taller, yunque, interactuar para fabricar llave, NPC.
2. Taberna: interior, tabernera, mesa, cartel con misión.
3. Casa del curandero: diálogo, objetos recolectables, receta.
4. Biblioteca: libro, estantes y pista de reliquia.
5. Castillo: patio y sala del trono con guardias.
6. Torre del castillo: puerta bloqueada, puzzle de llave, prisionero.

Los demás edificios del arte pueden ser decorativos, pero no deben presentar un prompt de "Entrar" que no funcione. Si la puerta parece utilizable, definir de forma clara si es accesible o no.

## NPC iniciales (12 roles con scripts sencillos)
Herrero, tabernera, guardia de entrada, capitán, rey, reina, curandera, bibliotecaria, mercader, campesino, aprendiz, viajero. Cada NPC tiene: ID, casa o spawn, nombre, agenda diaria, un diálogo base, al menos una condición reactiva al progreso, orientación al jugador y gestión de proximidad. Reutilizar rigs y personalizar vestimenta, no 12 comportamientos copiando el mismo NPC.

## Misiones de referencia (con cadena real)
**Principal A · La llave del alba:** (1) hablar con capitán, (2) visitar herrero, (3) conseguir 3 minerales en cueva, (4) entregar mineral, (5) obtener llave, (6) abrir torre, (7) rescatar aldeano, (8) conversar con rey.
**Principal B · El bosque oscuro:** limpiar tres tótems, derrotar guardián, restaurar altar.
**Principal C · La defensa del reino:** reforzar 3 puertas, reunir NPC aliados, derrotar carcelero.
**Secundarias:** recuperar libro, entregar medicina, comprar semillas, reparar molino, rescatar mascota, activar puente viejo.

## Interacción y física
- Raycast a 2.4 unidades con filtro de objetos interactivos, más zona de proximidad para táctil.
- Puerta: `closed -> opening -> open`, pivote geométrico correcto, colisión actualizada, sonido, persistencia.
- Cofre: `locked/closed/opened/looted`; no permitir loot infinito al recargar.
- NPC: `idle/walk/talk/questAvailable/questTurnIn`, pathfinding sin atravesar paredes.
- Castillo: transiciones interior/exterior con fade breve y spawn seguro; evitar transición duplicada durante carga.
- Jugador: controlador cinemático con colisionadores simples; bloquear puerta sin llave con mensaje y pista.

## Arte/animación
Arte estilizado low-poly + materiales PBR ligeros, normal maps solo donde aporten, antorchas con sombras limitadas, capas de niebla y luz según zona. Animaciones de caminar, idle, hablar, atacar para actores relevantes. Usar solo assets generados/licenciados y registrar fuente.

## Performance
Dividir mundo en zonas cargadas a demanda; interiores separados; NPC del área activa con IA completa y lejanos en baja frecuencia. Evitar castillo, bosque y aldeas a máximo detalle simultáneo.

## Acceptance de reino
- 6 interiores accesibles, con puerta abierta y retorno probado;
- 12 NPC roles con diálogo o reacción funcional;
- 3 principales completas + 6 secundarias verificables;
- 1 cadena de llave/cofre/recompensa persistente sin exploits;
- 1 jefe con fases; navmesh/bounds, no softlocks;
- apertura/cierre repetidos de cada edificio sin pérdida de estado;
- objetivos FPS y memoria probados.
