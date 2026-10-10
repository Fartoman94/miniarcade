# Licencias y procedencia de assets

| Asset | Ruta | Origen | Licencia |
|---|---|---|---|
| Three.js r128 | `vendor/three-r128/` | npm/cdnjs oficial | MIT (`vendor/three-r128/LICENSE`) |
| Three.js 0.186.1 (build + addons seleccionados, minificados con esbuild) | `vendor/three-0.186.1/` | paquete npm oficial `three@0.186.1` | MIT (`vendor/three-0.186.1/LICENSE`) |
| Mascota MateLabs | `matelabs/mascota*.webp`, `favicon.png` | MateLabs (provisto por el dueño) | propiedad de MateLabs |
| Mati Octo (GLB y sprites) | `matelabs/characters/` | paquete MiniArcade_MatiOcto_3D (diseño original, no copia de Tripo3D según su README) | provisto por el dueño |
| 20 modelos GLB low-poly | `assets/models/` | paquete MiniArcade 20 juegos; generados con `assets/models/generar_modelos_3d.py` (trimesh) | provistos por el dueño para este proyecto |
| 20 portadas SVG | `assets/covers/` | paquete MiniArcade 20 juegos | provistas por el dueño (temporales) |
| Miniaturas de juegos | `games/thumbs/` | capturas propias (`tools/make-thumbs.mjs`) | propias |
| Fuentes Bungee / Space Grotesk / MedievalSharp, etc. | Google Fonts (remoto) | Google Fonts | SIL Open Font License |
| Audio | — | sintetizado en código (Web Audio) | propio |
| Geometría y texturas de los juegos | — | generadas por código | propias |

Regla: cualquier asset de terceros nuevo se agrega acá con URL de origen y licencia antes de commitear.
