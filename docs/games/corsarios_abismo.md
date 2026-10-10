# Corsarios del Abismo

**ID:** `corsarios_abismo` · **Archivo:** `corsarios_abismo.html` · **Código:** `games/corsarios_abismo/*.js` · **Tecnología:** Three.js 0.186 (WebGL, import map, módulos ES) + `matelabs/kit3d.js` · **Acento:** `#ffbe3d` (oro de doblón) · **Especificación:** `docs/specs/11_corsarios-abismo.md`

## Concepto

Aventura naval 3D en tercera persona. Capitaneás un bergantín: subís y bajás velas (con inercia), manejás el timón con momento, aprovechás el viento, peleás de costado con andanadas balísticas por banda, desembarcás en islas para abrir cofres, cavar tesoros y clavar cañones, rescatás náufragos, abordás goletas rendidas y comerciás en los muelles. La campaña recorre tres regiones, reúne los 3 fragmentos del mapa, asalta el Fuerte de Coral Negro y termina contra el **Almirante Espectral**. Se gana al **recuperar el Cofre del Almirante**; se pierde si **el barco se hunde**.

Todo es procedural: barcos, galeón, tiburón, islas, muelle, faro, cañones, cofres, fuerte, capitán y el mar se construyen en código (geometrías fusionadas con color por vértice, instancias). No se usan GLB externos ni audio grabado (todo `createAudio().tone`).

## Controles

| Acción | PC | Táctil | Gamepad |
|---|---|---|---|
| Subir / bajar velas | W/S o ↑/↓ (mantener) | Timón virtual arriba/abajo | Stick arriba/abajo |
| Timón | A/D o ←/→ | Timón virtual a los costados | Stick izquierda/derecha |
| Andanada babor (izq.) | Q (configurable) | Botón ◀ BABOR (muestra la recarga) | LB / LT |
| Andanada estribor (der.) | E (configurable) | Botón ESTRIB. ▶ | RB / RT |
| Acción (desembarcar, atracar, rescatar, abordar, abrir, cavar manteniendo, clavar, izar) | Espacio (configurable) | Botón ACCIÓN | A |
| Kit de reparación | R (configurable) | Botón KIT | X |
| A pie: caminar | W/A/S/D | Timón virtual | Stick |
| Pausa | Esc / P | ⏸ de la barra | Start |

Con las velas bajadas, mantener S rema hacia atrás despacio. Opciones (menú y pausa): reasignar las 4 teclas de acción, sensibilidad del timón, ayuda de puntería sí/no, cámara cerca/lejos y movimiento (sacudidas/destellos) según sistema, reducido o completo. Sonido y calidad: barra del SDK. Respeta `prefers-reduced-motion` (sin sacudidas ni destellos, órbita del menú quieta).

## Escenarios

1. **Bahía del Contrabandista** — soleada, agua turquesa. Puerto con muelle y mercado (inicio atracado), faro giratorio, Isla del Loro (X con el fragmento 1 + cofre), Cayo Calavera (roca calavera, cañón de costa, X de oro), Roca del Vigía (cañón), arrecifes, 2 náufragos, 1 goleta y 2 lanchas. Salida: **Corriente de la Bruma** (norte, requiere 1 fragmento).
2. **Archipiélago de la Bruma** — niebla densa, verde gris. Puerto Niebla (muelle/mercado), **Isla del Eco con la cueva** (cofre con el fragmento 2), Isla de los Mástiles (restos de barcos, X con el fragmento 3), Isla Gemela e Islote del Ahorcado (cañones, cofre, X), 6 peñascos, 2 faros, 3 náufragos, 2 goletas, 1 lancha y el **tiburón gigante**. Salida: **Corriente del Coral Negro** (requiere 3 fragmentos).
3. **Fuerte de Coral Negro** — atardecer violeta, mar más picado, espinas de coral negro. Fuerte amurallado con **4 baterías**, muelle y bandera; Cala del Náufrago (X y cofre), faro roto, 3 lanchas, 1 goleta, tiburón y náufrago. Tomado el fuerte, al acercarse al sur aparece el jefe.

Los viajes: por las corrientes (anillo dorado = abierta, gris = cerrada con aviso de cuántos fragmentos faltan) o desde cualquier mercado a una región ya descubierta. Una carta náutica (minimapa) muestra islas, enemigos, náufragos, X, muelles, corrientes, el objetivo actual (★) y la flecha del viento.

## Sistemas

- **Vela y timón arcade con inercia** (`ships.js`): la vela objetivo (palanca) sube/baja a ~1,2/s y la vela real la sigue a 0,7/s; la velocidad persigue el objetivo con constantes de 0,55 s⁻¹ (acelerar) y 0,38 s⁻¹ (frenar). Velocidad = base × vela × eficiencia del viento (100 % de popa → 42 % de proa) × estado del mástil. El timón fija una velocidad de giro objetivo que crece con la velocidad (32 % parado → 100 % a 6 m/s) y se alcanza con momento (2,2 s⁻¹). Escora y cabeceo según olas (4 muestras de la misma función de olas del shader).
- **Combate de costado** con recarga independiente por banda (2,4 s; −0,15 s por mejora), 3 balas (+1 por mejora), proyectiles balísticos (g = 18, v₀ = 34, alcance ~63 m) con herencia de la velocidad del barco. La **ayuda de puntería** elige el blanco más conveniente en el arco de ±35° de esa banda, calcula elevación y adelanto, y dibuja la parábola dorada (gris mientras recarga). Las balas altas pegan en el **mástil**: si llega a 0 se rompe (−55 % de velocidad hasta reparar).
- **Desembarco** (a cualquier isla desembarcable frenando a menos de ~4,8 m/s cerca de la costa): el capitán baja con un bote; a pie camina limitado a la isla (y a las murallas del fuerte). Interactúa con cofres (tocar), tesoros (mantener 1,2 s: el cofre sube de la arena y se abre), cañones (mantener 1,5 s: «clavar») y la bandera del fuerte (mantener 2 s). Vuelve al barco por el bote.
- **Muelles y mercados**: atracar (animación de amarre, faroles que se encienden, campana) abre el mercado: reparar casco/mástil (precio según daño), kits (máx. 3), más cañones (2 niveles), blindaje (+25 casco, −12 % daño; 2 niveles) y viajes. El estado «visitado» queda guardado.
- **Abordaje**: una goleta con <22 % de vida iza bandera blanca 25 s; acercándote y con ACCIÓN empieza un minijuego de sincronización (3 aciertos en la zona verde; cada fallo cuesta casco). Recompensa: oro y 1 kit.
- **Náufragos** en balsas: acercarse despacio + ACCIÓN → +25 oro, +10 casco.
- **Batalla limpia**: el juego registra cada batalla (desde que alguien te ataca hasta 2,5 s sin enemigos activos); si hundiste/rendiste al menos uno sin perder el mástil, cumple la secundaria.
- **Mar barato y convincente** (`water.js`): plano subdividido que sigue a la cámara anclado a su grilla; 4 ondas sumadas en el vertex shader con normales analíticas; fragment con color por altura, agua clara cerca de las costas, fresnel con el cielo, brillo especular, espuma en crestas, **espuma de costa animada** alrededor de cada isla (hasta 16) y remolino del jefe. Niebla de Three.js integrada. Partículas en pool: estela y espuma planas sobre el agua, gotas de proa, salpicaduras, humo, fuego, astillas, anillos.
- **Tutorial contextual** (consejos del contramaestre, una vez cada uno, «No mostrar más» lo apaga; se reactiva desde «Cómo jugar»): velas, andanadas, desembarco, X, muelle, goleta, lancha, cañón, tiburón, rendición, mástil roto, corrientes, fuerte y las 3 fases del jefe.

## Rivales y obstáculos

| Rival | Silueta | Patrón | Contrajuego |
|---|---|---|---|
| Goleta pirata | Casco negro, 2 mástiles con velas rojas, bandera con calavera | Se pone de costado a ~26 m y dispara 3 balas; **troneras naranjas 0,85 s antes** | Cruzarle proa o popa (no puede disparar hacia adelante/atrás); con poca vida se rinde → abordarla |
| Lancha corsaria | Bote chico con vela latina triangular | Orbita, se alinea (**carril rojo** 1,15 s) y embiste a ×1,9 | Recibirla **de proa** (daño ×0,5 y la lancha recibe 30) o barrerla de costado mientras apunta (38 PV) |
| Cañones de costa / baterías | Torreta sobre base de piedra (o torre del fuerte) | Morteros con **círculo rojo** de impacto (1,25 s) que adelantan tu rumbo; necesitan línea de tiro (las islas altas tapan: raycast 2D segmento-isla) | Cambiar rumbo/velocidad, cubrirse detrás de islas, destruirlos a cañonazos o **clavarlos a pie** |
| Tiburón gigante | Aleta que asoma; cuerpo completo al saltar | Te rodea a 17 m, avisa (**ondas rojas + gruñido** 1,4 s), embiste (14 de daño) y **salta** quedando expuesto ~3 s | Navegar rápido (falla), dispararle cuando salta (×1,5); a 0 PV huye |
| Arrecifes y costas | — | El roce a más de 4 m/s daña el casco | Bajar velas cerca de la costa |

## Jefe: el Almirante Espectral

Galeón acorazado de 24 m (placas de hierro, velas fantasmales, mascarón de calavera, fuego verde). **Intro**: el mar se agita, la niebla vira a verde y el galeón emerge (≈5 s, salteable con ACCIÓN / toque).

| Fase | Vida | Regla | Telegrafía | Contrajuego |
|---|---|---|---|---|
| 1 · Casco acorazado | 100→60 % | Costados ×0,2, proa ×0,3, popa ×1,2 | Troneras **verdes** + abanico verde en el agua 1,6 s antes de una andanada de 7 balas espectrales | Pegar en la **popa** o en el costado mientras las troneras están abiertas (×1,6) |
| 2 · Cañones encantados | 60→25 % | **Etéreo** (translúcido, inmune); 3 cañones espectrales en rocas flotantes con balas teledirigidas lentas; embestidas | **Carril verde** 1,6 s antes de embestir | Destruir los cañones → 10 s **materializado** y vulnerable (después invoca 2 más) |
| 3 · Furia del Abismo | <25 % | **Remolino** central que arrastra (el núcleo daña), tormenta (olas ×1,7), andanadas más rápidas, costados ×0,6 | Espirales de espuma, troneras verdes | Velas arriba lejos del centro, disparar a la popa / troneras |

**Recompensa:** al hundirse deja flotando el **Cofre del Almirante** (pilar de luz verde); recuperarlo (+500 oro) da la **victoria**.

## Misiones (MLMissions, `primaryPerRun: 3`, `secondaryPerRun: 2`)

| ID | Tipo | Misión | Evento | Meta |
|---|---|---|---|---|
| m_mapa | Principal | Reunir los 3 fragmentos del mapa | `fragment` | 3 |
| m_fuerte | Principal | Asaltar el Fuerte de Coral Negro | `fort` | 1 |
| m_almirante | Principal | Vencer al Almirante Espectral | `admiral` | 1 |
| s_naufragos | Secundaria | Rescatar 3 náufragos | `rescue` | 3 |
| s_cueva | Secundaria | Descubrir una cueva | `cave` | 1 |
| s_abordaje | Secundaria | Abordar una goleta | `board` | 1 |
| s_mastil | Secundaria | Ganar una batalla sin perder el mástil | `cleanBattle` | 1 |
| s_tesoros | Secundaria | Desenterrar 3 tesoros | `treasure` | 3 |
| s_tiburon | Secundaria | Ahuyentar al tiburón gigante | `shark` | 1 |
| s_lanchas | Secundaria | Hundir 4 lanchas corsarias | `sinkLaunch` | 4 |

Al empezar cada partida se reemiten los fragmentos y el fuerte ya conseguidos en la campaña (para que las principales reflejen el progreso guardado).

## Dificultad (nunca cambia los controles)

| | Fácil | Normal | Difícil | Extremo |
|---|---|---|---|---|
| Daño enemigo | ×0,6 | ×1 | ×1,3 | ×1,6 |
| Vida enemiga | ×0,8 | ×1 | ×1,2 | ×1,4 |
| Recarga enemiga | ×1,35 | ×1 | ×0,85 | ×0,7 |
| Dispersión enemiga | ×1,6 | ×1 | ×0,75 | ×0,55 |
| Almirante (PV) | 650 | 900 | 1150 | 1400 |
| Pausa del tiburón | ×1,4 | ×1 | ×0,8 | ×0,65 |
| Casco del jugador | 130 | 100 | 100 | 90 |
| Precios | ×0,75 | ×1 | ×1,2 | ×1,5 |
| Oro ganado | ×1,25 | ×1 | ×0,9 | ×0,8 |
| Kits iniciales | 2 | 1 | 1 | 0 |

## Calidad gráfica

| | Baja | Media | Alta |
|---|---|---|---|
| Mar (vértices) | 73² = 5.329 | 129² = 16.641 | 191² = 36.481 |
| Tamaño del mar | 380 m | 460 m | 520 m |
| Partículas (tope) | 140 | 280 | 440 |
| Decoración instanciada (palmeras, rocas, coral) | 40 % | 75 % | 100 % |
| Niebla / distancia de dibujo | ×0,7 / 260 m | ×1 / 380 m | ×1,25 / 480 m |
| Espuma de costa animada | no (línea simple) | sí | sí |
| Estela | cada 0,12 s, más corta | 0,07 s | 0,045 s |
| Sombras | no | no | sí (PCF 1024) |
| Pixel ratio máx. (Kit3D) | 1 | 1,5 | 2 |

## Guardado (`corsarios_abismo:save`, versión 1, `createSave`)

```
{ started, region: 'bahia'|'bruma'|'coral', unlocked: [...], fragments: 0..3, fort, admiral,
  gold, plunder (botín = puntaje), kits: 0..3, up: { cannons: 0..2, armor: 0..2 },
  regions: { bahia|bruma|coral: { dug: [ids], chests: [ids], cannons: [ids], rescued: [ids], cave, dock } },
  wins, bestScore, stats: { sunk, shots, hits, rescued, boarded, treasures },
  tutorial: { off, seen: {} }, opts: { sens, cam, motion, aim, binds: { port, star, act, kit } } }
```

- JSON inválido: `createSave` lo copia a `corsarios_abismo:save:corrupto` y arranca de cero. Forma inválida: `sanitize()` repara campo por campo (tipos, rangos, ids, región no desbloqueada, `coral` sin 3 fragmentos, fuerte sin fragmentos, teclas inválidas).
- **Punto de control**: al entrar a una región se toma una instantánea de la campaña; «Reiniciar» (pausa) y «Reintentar la región» (derrota) la restauran (reinicio limpio, nunca bloqueo irreversible). Tesoros, cofres, cañones destruidos, náufragos, cueva y muelles visitados quedan persistentes por región.
- Al ganar se reinicia la campaña conservando victorias, récord, estadísticas, tutorial y opciones.

## Pruebas (`tests/e2e/corsarios_abismo.spec.js`)

16 pruebas (15 en escritorio, 16 en celular; la de diseño celular se saltea en escritorio). Usan entrada real (teclas, clics, toques CDP sobre el timón y los botones) combinada con `simulate()` determinista de `?debug` para los tramos de juego, sin esperas de reloj ajustadas.

Cubren: carga sin errores; arranque con Enter/toque; velas con inercia, timón y andanadas por banda; tutorial (aparece, se salta, se reactiva desde la pausa); muelle/mercado (atracar, comprar kit/casco/cañones, zarpar, faroles persistentes); cañones de costa (telegrafía, destrucción a cañonazos, sabotaje a pie, persistencia tras recargar); cofres y tesoros (caminar con entrada real, cavar manteniendo, fragmento, corriente abierta, persistencia tras recargar); rivales (goleta: aviso, rendición, abordaje con el minijuego; lancha: carril y embestida; tiburón: aviso, mordida, salto, huida); tres escenarios (corriente cerrada, viajes por corrientes y por el mercado); misión principal (fuerte) + secundaria (cueva) persistentes tras recargar; jefe (intro, fase 1 con blindaje vs. troneras abiertas con disparos reales, fase 2 etérea inmune, fase 3 remolino, cofre y victoria); derrota y reintento limpio; pausa congela 1 s, reanuda y reinicio; guardado corrupto; dificultad; calidad; diseño celular 412×915 y 915×412 sin superposiciones ni scroll + botones táctiles.

Las pruebas de juego arrancan con entrada real desde el menú y después detienen el loop en tiempo real (`debug.loop(false)`): el juego sólo avanza con `simulate()` de paso fijo, así que no dependen de los FPS ni del reloj (aptas para el runner de CI con 2 núcleos). La de pausa usa el loop real.

**Resultados reales (2026-10-10, esta máquina con carga de otros agentes):**

| Corrida | desktop | mobile (Pixel 7) |
|---|---|---|
| `ML_WORKERS=1` | 15/15 ✓ (+1 omitida: sólo celular) | 16/16 ✓ |
| `ML_WORKERS=4` (simula CI cargado) | 15/15 ✓ | 16/16 ✓ |

Total por corrida: 31 pasadas, 1 omitida, 0 fallidas, 0 flaky (2,6 min con 1 worker; 1,8 min con 4).

## Rendimiento

Mediciones en Chromium headless con SwiftShader (render por CPU; la máquina tenía carga ~20 de otros agentes, así que las cifras varían ±30 %):

`node tests/perf/measure.mjs` (menú, 1280×800):

| Calidad | FPS menú | Peor cuadro | DCL / load | Heap | Pedidos / KB |
|---|---|---|---|---|---|
| media | 15,1–16,8 | 250–283 ms | 320–520 / 557–790 ms | 7,2–7,7 MB | 23 / 1102 KB |
| baja | 14,9–18,3 | 200–317 ms | 365–455 / 563–830 ms | 8,4–10,5 MB | 23 / 1102 KB |

(Referencia en la misma sesión: `derby_chatarra` menú media 15,6 FPS.)

En juego (gancho `perf`, navegando en la Bahía con 3 barcos enemigos, promedio de 10 muestras):

| Calidad | Draw calls | Triángulos | Cuadro | Render | Update | Heap |
|---|---|---|---|---|---|---|
| media | ~26 | ~44.600 | ~73 ms | 1,1 ms | 0,8 ms | 10,1 MB |
| baja | ~24 | ~19.700 | ~43 ms | 0,9 ms | 0,5 ms | 10,1 MB |

Optimización aplicada: la distancia a las costas (bucle sobre las islas) se calcula por vértice y no por píxel, y el ruido del agua se reemplazó por sumas de senos: en SwiftShader el menú pasó de ~4 a ~15 FPS. El terreno de cada región es una sola malla; palmeras, rocas y coral son `InstancedMesh`; balas y partículas son pools instanciados (sin asignaciones por cuadro).

## Pendiente / NO PROBADO

- Gamepad físico: el mapa está configurado (`lb/lt` babor, `rb/rt` estribor, `a` acción, `x` kit, stick) pero no se probó con un mando real (Playwright ignora los mandos).
- No se probó en dispositivos móviles reales (sólo emulación Pixel 7 de Playwright con SwiftShader).
- Las cifras de FPS de headless son de render por CPU: sirven para comparar, no son FPS reales.
- Falta la miniatura `games/thumbs/corsarios_abismo.webp` y la entrada en `games/registry.js` (archivos compartidos: los agrega el coordinador).
- Sin prueba e2e específica (lógica implementada y usada en juego, pero no verificada por test): secundarias «sin perder el mástil», «3 tesoros», «3 náufragos», «4 lanchas» y «tiburón» (este último sí se ve en la prueba de rivales: el tiburón huye, pero la misión no estaba en la rotación); compras de blindaje; viaje de vuelta desde la Bahía a la Bruma por mercado.
- No se jugó una campaña completa de corrido en tiempo real (15–30 min): el balance de daño/oro está ajustado a mano y validado por tramos.
- A pie, alguna palmera alta puede tapar por momentos al capitán (la cámara sube a ~13 m para minimizarlo).
