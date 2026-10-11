# Texturas procedurales incluidas

Cada grupo se entrega con 3 mapas: `*_albedo.png`, `*_normal.png`, `*_roughness.png`.

- asfalto_urbano: pavimento granulado
- hormigon_acera: acera gris cuadriculada
- ladrillo_rojizo: mampostería
- fachada_vidriada: fachada de oficinas
- cesped_parque: vegetación base
- metal_cepillado: superficies de metal
- techo_grava: cubierta rugosa

Los mapas son originales generados en este kit. Son base técnica para texturizado, no escaneos fotográficos. Actualmente el prototipo JS genera otras texturas de fachada vía canvas para su render inmediato; para el paso a PBR profesional integrar estos mapas con UV correctas, repetir, atlas, mipmaps y compresión KTX2 al exportar. Si se sustituye por Poly Haven, conservar licencias en manifest.
