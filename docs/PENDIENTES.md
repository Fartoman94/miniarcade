# Pendientes — MiniArcade 3.0

> Lo que **no** se hizo o **no** se pudo verificar, ordenado por prioridad. Nada de esto está marcado como hecho en ningún otro documento.

## P0 — necesita una decisión o un recurso del equipo

1. **Logo oficial de MateLabs.** El prompt pide reemplazar los coleccionables tipo «punto» por el logo, pero en el repo solo está la mascota (`matelabs/mascota*.webp`), que no es el logo. Hace falta el archivo oficial (SVG o PNG con versión para fondo claro y oscuro). Mientras tanto no se reemplazó ningún coleccionable.
2. **Pruebas en dispositivos reales:** un Android de gama media, un iPhone (Safari), un desktop con GPU y un gamepad físico. Todo lo medido es headless con SwiftShader.
3. **Escuchar el audio** de los sonidos nuevos: todos son sintetizados y nadie los oyó.

## P1 — técnico

4. **Three.js moderno (etapa 2).**
   - **Hoy:** r128 local.
   - **Migrar implica:**
     - `outputColorSpace` / `ColorManagement` y luces físicas, que cambian el aspecto de los 3 juegos 3D;
     - reemplazar el `flatShading` de Lambert;
     - revisar `Geometry` / `BufferGeometry` en los helpers propios.
   - **Requiere:** regresión visual con capturas de antes y después.
   - **Ideas anotadas:** `MeshStandardMaterial` con PMREM y tráfico instanciado en TURBO FURIA.
5. **Rendimiento 3D en calidad media frente a la versión anterior.** Ver RENDIMIENTO.md. ¡SALVA AL REY! y EL VALLE ENCANTADO quedan parejos con la versión anterior. En TURBO FURIA el garaje ya quedó por encima de la versión anterior (dibujado a 30 Hz detrás del menú). EL VALLE ENCANTADO en Explorar: si hace falta, bajar el pasto de media de 700 a unas 400 matas.
6. **Calidad automática:** se resuelve con memoria, núcleos y tipo de puntero, sin benchmark. En un desktop con muchos núcleos pero GPU débil puede elegir «alta». Algunos juegos 3D ya bajan un nivel si sostienen menos de 27 fps; habría que llevar eso al SDK para todos.
7. **Modularizar los juegos.** La mecánica de cada juego sigue en su HTML. Cuando se partan en módulos tiene sentido pasar a Vite y TypeScript; el contrato del SDK ya está definido en ARQUITECTURA.md.
8. **Récord por dificultad:** hoy hay un solo récord por juego. TURBO FURIA tiene ranking local por dificultad.
9. **Ranking global:** requiere un backend con autenticación y validación antitrampa. No se muestra ningún ranking «mundial».
10. **Misiones diarias o semanales:** requieren un reloj de servidor confiable.
11. **`sitemap.xml`:** se puede generar ahora que el dominio es `miniarcade-gold.vercel.app`; falta confirmar el dominio final.
12. **CSP:** hace falta mover el JS y el CSS inline de los juegos a archivos aparte para tener una Content-Security-Policy útil.

## P2 — contenido y pulido

13. **¡SALVA AL REY!:** el modo Paseo solo recibió cambios visuales, no contenido nuevo.
14. **EL VALLE ENCANTADO:** las misiones de los habitantes son por partida; solo el álbum y las coronas persisten.
15. **TURBO FURIA:** no hay selector de pista; cada modo empieza en un bioma fijo.
16. **Mati Octo:**
    - no tiene sprite de muerte propio (en MUERTE GLORIOSA el ragdoll usa su paleta);
    - no tiene sprites de frente ni de espalda (en NEON SURVIVOR usa la vista lateral);
    - es más ancho que los personajes clásicos y puede asomar un poco dentro de paredes finas;
    - se mantuvo el colisionador original para no cambiar la jugabilidad.
17. **Secundarias sin prueba de punta a punta:** varias solo emiten su evento, sin una prueba que las complete como misión. El detalle está en cada `docs/games/<juego>.md`.
18. **Balance de la dificultad «Extremo»:** se ajustó con simulaciones y recorridos guionados, no con jugadores.
