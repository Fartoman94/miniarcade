// Mateo: Ciudad de Altura — streaming de sectores (V2 P1): cada sector se carga (mallas con detalle, colisiones y
// vecinos del sector) cuando Mateo se acerca a menos de `preload` m y se descarga (se liberan geometrías, cajas de
// colisión y vecinos) más allá de `unload` m (histéresis). Mientras no está cargado se ve un «proxy» barato (LOD).
// Las colisiones existen antes de que Mateo llegue: la carga empieza lejos (≥ 150 m) y `ensure()` carga en el acto
// los sectores cercanos tras un teletransporte o al recargar la partida. La reconstrucción es determinista (semilla
// por sector): la firma de colisiones de una recarga es idéntica a la de la primera carga.

/**
 * @param {{ sectors: { id: string, cx: number, cz: number, load: () => any, unload: (h: any) => void, setProxy?: (on: boolean) => void }[], preload?: number, unload?: number }} o
 */
export function createStreaming({ sectors, preload = 150, unload = 215 }) {
  const S = sectors.map(s => ({ ...s, handle: null, loads: 0, unloads: 0, sig: null, lastSig: null, ms: 0 }));
  let acc = 0, totalLoads = 0, totalUnloads = 0;
  const queue = [];
  const dist = (s, x, z) => Math.hypot(s.cx - x, s.cz - z);
  function load(s) {
    if (s.handle) return;
    const t0 = performance.now();
    s.handle = s.load();
    s.ms = +(performance.now() - t0).toFixed(1);
    s.lastSig = s.sig; s.sig = s.handle.sig;
    s.loads++; totalLoads++;
    if (s.setProxy) s.setProxy(false);
  }
  function drop(s) {
    if (!s.handle) return;
    s.unload(s.handle); s.handle = null; s.unloads++; totalUnloads++;
    if (s.setProxy) s.setProxy(true);
  }
  const api = {
    sectors: S,
    /** llamar en cada paso; evalúa distancias cada 0,25 s y carga como mucho un sector por paso (sin tirones) */
    update(dt, x, z) {
      acc += dt;
      if (acc >= 0.25) {
        acc = 0;
        for (const s of S) {
          const d = dist(s, x, z);
          if (!s.handle && d < preload && !queue.includes(s)) queue.push(s);
          else if (s.handle && d > unload) drop(s);
        }
        queue.sort((a, b) => dist(a, x, z) - dist(b, x, z));
      }
      const s = queue.shift();
      if (s && dist(s, x, z) < preload + 20) load(s);
    },
    /** carga ya todo lo que esté dentro del radio (teletransporte, recarga de partida) */
    ensure(x, z, r = preload) { for (const s of S) if (!s.handle && dist(s, x, z) < r) load(s); queue.length = 0; acc = 1; },
    /** descarga todo (pruebas) */
    unloadAll() { for (const s of S) drop(s); queue.length = 0; },
    info() {
      return {
        loaded: S.filter(s => s.handle).map(s => s.id), loads: totalLoads, unloads: totalUnloads, preload, unload,
        sectors: S.map(s => ({ id: s.id, loaded: !!s.handle, loads: s.loads, unloads: s.unloads, sig: s.sig, lastSig: s.lastSig, ms: s.ms, boxes: s.handle ? s.handle.boxes.length : 0, walkers: s.handle ? s.handle.walkers.length : 0 })),
      };
    },
  };
  return api;
}
