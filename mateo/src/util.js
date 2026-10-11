// Mateo: Ciudad de Altura — utilidades pequeñas compartidas.
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
/** Suavizado independiente del framerate: acerca a → b con tasa k (1/s). */
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
/** PRNG determinista (mulberry32). */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
