# Biblioteca 3D real de este kit

Archivos `.glb` en esta carpeta son geometría 3D exportable por Trimesh. Están creados en el proyecto. La escala es aproximada en metros, eje vertical Y, y sólo se utilizarán como prefabs/proxies durante el desarrollo. En producción se requiere optimización, rigging, LOD y materiales avanzados.

- `mateo_heroe_proxy_v1.glb`: modelo inicial con partes visibles, rostro infantil estilizado aproximado, pelo, traje original M. **No exacto, no rig**, no blendshapes, no clips.
- `civil_npc.glb`, `villano_no_letal.glb`: humanos simples estáticos que el juego posiciona y mueve por lógica.
- `drone_enemigo.glb`: enemigo mecánico simple.
- `auto_urbano.glb`, `furgoneta.glb`: autos urbanos con ruedas como piezas.
- `torre_oficinas.glb`, `edificio_ladrillo.glb`, `banco_central.glb`: prefabs de edificación para evolucionar a calidad PBR.
- `banco_plaza.glb`, `arbol_urbano.glb`, `parada_bus.glb`, `farola.glb`, `semaforo.glb`, `papelera.glb`, `bolardo.glb`, `antena_azotea.glb`: mobiliario.

**OJO:** ciertos prefabs de oficinas contienen muchas mallas/ventanas (por ejemplo torre >600). Antes de colocar decenas de copias, fusionar por material, hacer instancing y LOD o rediseñarlos más eficientemente. No ponerlos todos juntos en mobile sin revisar FPS.
