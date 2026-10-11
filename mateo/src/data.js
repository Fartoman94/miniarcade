// Mateo: Ciudad de Altura — datos del juego en JSON (game/data): distritos e incidentes (V2 P1); reloj, vestuario,
// comercios, vehículos y actividades (V2 P2); campaña (V2 P3). Se cargan una vez al arrancar; si falta un archivo el juego muestra el
// error de inicio (no inventa valores).
export async function loadData() {
  const get = async f => { const r = await fetch(new URL(`../data/${f}`, import.meta.url)); if (!r.ok) throw new Error(`No se pudo cargar ${f} (${r.status})`); return r.json(); };
  const [d, i, clock, wardrobe, shops, vehicles, jobs, missions] = await Promise.all(['distritos.json', 'incidentes.json', 'ciclo_dia_noche.json', 'vestuario.json', 'comercios.json', 'vehiculos.json', 'actividades.json', 'misiones.json'].map(get));
  return { districts: d.districts, incidents: i, clock, wardrobe, shops, vehicles, jobs, missions };
}
