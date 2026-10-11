// Mateo: Ciudad de Altura — V2 P2: reloj del mundo (WorldClock) en horas de juego, basado en el ejemplo del kit
// (docs/kit_v2/examples/clock.mjs). Sin Three.js ni DOM. Sólo avanza con los pasos fijos del bucle mientras se juega:
// pausa, menús, tiendas y pestaña oculta lo detienen y al reanudar no «recupera» el tiempo perdido (el paso es de
// 1/60 s y el bucle limita los pasos por cuadro). Minutos totales monótonos para enfriamientos de trabajos y comidas.
export const wrap24 = h => ((h % 24) + 24) % 24;

/**
 * @param {{ startHour?: number, realMinutesPerDay?: number, day?: number, segments?: {id:string,from:number,to:number}[], lights?: {streetOnHour:number, streetOffHour:number} }} o
 */
export function createClock({ startHour = 10, realMinutesPerDay = 24, day = 1, segments = null, lights = null } = {}) {
  if (!(realMinutesPerDay > 0)) throw new RangeError('realMinutesPerDay');
  let hour = wrap24(startHour), d = Math.max(1, Math.floor(day)), paused = false, rate = realMinutesPerDay;
  const SEG = segments || [{ id: 'dawn', from: 5, to: 7 }, { id: 'day', from: 7, to: 17 }, { id: 'sunset', from: 17, to: 20 }, { id: 'night', from: 20, to: 24 }, { id: 'night_pre', from: 0, to: 5 }];
  const L = lights || { streetOnHour: 18.5, streetOffHour: 6.5 };
  const NAMES = { dawn: 'amanecer', day: 'dia', sunset: 'atardecer', night: 'noche', night_pre: 'noche' };
  const api = {
    get hour() { return hour; }, get day() { return d; }, get paused() { return paused; }, get realMinutesPerDay() { return rate; },
    /** minutos de juego desde el día 1 a las 0:00 (monótono: nunca retrocede) */
    get minutes() { return (d - 1) * 1440 + hour * 60; },
    pause(v = true) { paused = !!v; },
    setRate(m) { if (m > 0) rate = m; },
    /** debug / modos fijos: pone la hora del MISMO día (puede retroceder la hora, no el día) */
    setHour(h) { if (!Number.isFinite(h)) throw new TypeError('hour'); hour = wrap24(h); },
    /** avanza hasta la próxima vez que el reloj marque h (dormir): siempre hacia adelante, cambia de día si hace falta */
    advanceTo(h) { if (!Number.isFinite(h)) throw new TypeError('hour'); h = wrap24(h); if (h <= hour) d++; hour = h; return api.minutes; },
    /** avanza realDt segundos reales (paso fijo del bucle) */
    update(realDt) {
      if (paused) return hour;
      if (!Number.isFinite(realDt) || realDt < 0) throw new RangeError('dt');
      hour += 24 * realDt / (rate * 60);
      while (hour >= 24) { hour -= 24; d++; }
      return hour;
    },
    /** franja del kit: amanecer | dia | atardecer | noche */
    get phase() { const s = SEG.find(x => hour >= x.from && hour < x.to); return s ? NAMES[s.id] || s.id : 'noche'; },
    get streetLightsOn() { return hour >= L.streetOnHour || hour < L.streetOffHour; },
    /** 0..1 suave: farolas encendidas (fundido de media hora alrededor de las horas de encendido y apagado) */
    get lampLevel() {
      const on = L.streetOnHour, off = L.streetOffHour, s = x => Math.max(0, Math.min(1, x));
      if (hour >= off && hour < on) return Math.max(s((hour - (on - 0.5)) / 0.5), s(((off + 0.5) - hour) / 0.5));
      return 1;
    },
    /** ¿está abierto un horario [desde, hasta) en horas? (admite cruzar la medianoche) */
    isOpen(range) { const [a, b] = range; return a <= b ? hour >= a && hour < b : hour >= a || hour < b; },
    label() { const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; },
    snapshot() { return { hour: +hour.toFixed(4), day: d }; },
    restore(o) { if (o && Number.isFinite(o.hour)) hour = wrap24(o.hour); if (o && Number.isFinite(o.day)) d = Math.max(1, Math.floor(o.day)); },
  };
  return api;
}
