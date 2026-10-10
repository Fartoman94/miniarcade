// @ts-check
/* Cocina del Caos — sonidos sintetizados (createAudio().tone) y música por cocina. */
export const SFX = {
  pick: { f: 520, f2: 700, d: 0.07, type: 'triangle', v: 0.1 }, drop: { f: 380, f2: 260, d: 0.08, type: 'triangle', v: 0.1 },
  fridge: { f: 1500, f2: 700, d: 0.18, noise: true, v: 0.06 }, plate: { f: 900, f2: 1250, d: 0.09, type: 'sine', v: 0.12 },
  plateTake: { f: 1100, d: 0.06, type: 'square', v: 0.04 }, clink: { f: 1700, d: 0.08, type: 'sine', v: 0.06 },
  chop: { f: 260, d: 0.05, noise: true, v: 0.14 }, chopDone: { f: 660, f2: 990, d: 0.12, type: 'triangle', v: 0.12 },
  oven: { f: 160, f2: 120, d: 0.25, type: 'square', v: 0.05 }, ready: { f: 1046, f2: 1568, d: 0.25, type: 'sine', v: 0.12 },
  beep: { f: 1400, d: 0.06, type: 'square', v: 0.035, gap: 0.5 }, burn: { f: 220, f2: 90, d: 0.5, type: 'sawtooth', v: 0.09 },
  fire: { f: 120, d: 0.7, noise: true, v: 0.18 }, foam: { f: 2000, d: 0.12, noise: true, v: 0.06, gap: 0.12 },
  splash: { f: 700, d: 0.25, noise: true, v: 0.08 }, splat: { f: 300, d: 0.3, noise: true, v: 0.12 }, scrub: { f: 1800, d: 0.06, noise: true, v: 0.04, gap: 0.12 },
  wash: { f: 1200, d: 0.08, noise: true, v: 0.04, gap: 0.15 }, clean: { f: 1568, f2: 2093, d: 0.12, type: 'sine', v: 0.08 }, sparkle: { f: 1800, f2: 2600, d: 0.2, type: 'sine', v: 0.08 },
  ding: { f: 1318, f2: 1318, d: 0.5, type: 'sine', v: 0.18 }, error: { f: 180, f2: 120, d: 0.35, type: 'square', v: 0.09 }, fail: { f: 300, f2: 110, d: 0.6, type: 'sawtooth', v: 0.08 },
  nope: { f: 200, d: 0.06, type: 'square', v: 0.04, gap: 0.2 }, belt: { f: 140, d: 0.12, type: 'square', v: 0.05 }, trash: { f: 220, d: 0.2, noise: true, v: 0.1 },
  squeak: { f: 2400, f2: 3200, d: 0.08, type: 'sine', v: 0.06, gap: 0.3 }, squeakHi: { f: 3200, f2: 2000, d: 0.14, type: 'square', v: 0.05 }, steal: { f: 900, f2: 400, d: 0.25, type: 'square', v: 0.06 },
  horn: { f: 392, f2: 523, d: 0.7, type: 'sawtooth', v: 0.08 }, fanfare: { f: 523, f2: 1046, d: 0.6, type: 'triangle', v: 0.14 },
  alarm: { f: 880, f2: 660, d: 0.35, type: 'square', v: 0.06, gap: 0.3 }, wind: { f: 300, d: 1.4, noise: true, v: 0.12 }, float: { f: 300, f2: 900, d: 0.8, type: 'sine', v: 0.08 },
  steam: { f: 4000, d: 0.6, noise: true, v: 0.08 }, quake: { f: 50, d: 1, noise: true, v: 0.25 }, dash: { f: 300, f2: 600, d: 0.12, type: 'triangle', v: 0.06 },
  stun: { f: 600, f2: 200, d: 0.3, type: 'square', v: 0.06 }, ui: { f: 880, d: 0.05, type: 'sine', v: 0.06 }, star: { f: 1046, f2: 2093, d: 0.35, type: 'triangle', v: 0.12 },
  lose: { f: 330, f2: 110, d: 1.1, type: 'sawtooth', v: 0.1 },
};
/** Escalas y tempo por cocina. */
export const MUSIC = {
  taberna: { notes: [294, 330, 349, 392, 440, 523, 587], beat: 0.24, type: 'triangle', bass: [147, 196, 220, 196] },
  volcan: { notes: [220, 233, 262, 294, 311, 349, 392], beat: 0.21, type: 'sawtooth', bass: [110, 110, 117, 98] },
  espacial: { notes: [392, 440, 494, 587, 659, 740, 880], beat: 0.2, type: 'sine', bass: [196, 247, 165, 220] },
};
