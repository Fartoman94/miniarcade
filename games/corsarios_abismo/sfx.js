// @ts-check
/* Corsarios del Abismo — sonidos sintetizados con createAudio().tone (sin archivos). */

/** @param {{tone:(o:any)=>void}} audio */
export function createSfx(audio) {
  const t = o => audio.tone(o);
  const later = (ms, fn) => setTimeout(fn, ms);
  const arp = (fs, d = 0.09, type = 'triangle', v = 0.12) => fs.forEach((f, i) => later(i * d * 1000, () => t({ f, d: d * 2.2, type, v })));
  return {
    cannon(k = 1) { t({ f: 70, d: 0.55, v: 0.26 * k, noise: true, id: 'cannon', gap: 0.05 }); t({ f: 120, f2: 40, d: 0.4, type: 'sawtooth', v: 0.1 * k }); },
    volley(n) { for (let i = 0; i < n; i++) later(i * 70, () => t({ f: 80 + i * 6, d: 0.5, v: 0.22, noise: true })); later(0, () => t({ f: 110, f2: 38, d: 0.5, type: 'sawtooth', v: 0.12 })); },
    far() { t({ f: 60, d: 0.5, v: 0.08, noise: true, id: 'far', gap: 0.2 }); },
    splash(v = 1) { t({ f: 900, d: 0.35, v: 0.07 * v, noise: true, id: 'splash', gap: 0.06 }); },
    hit(v = 1) { t({ f: 140, d: 0.3, v: 0.22 * v, noise: true, id: 'hit', gap: 0.05 }); t({ f: 220, f2: 90, d: 0.2, type: 'square', v: 0.07 * v }); },
    crack() { t({ f: 300, d: 0.25, v: 0.16, noise: true }); t({ f: 180, f2: 60, d: 0.5, type: 'sawtooth', v: 0.1 }); },
    hurt() { t({ f: 200, f2: 70, d: 0.3, type: 'sawtooth', v: 0.12, id: 'hurt', gap: 0.12 }); },
    sink() { t({ f: 120, f2: 40, d: 1.6, type: 'sawtooth', v: 0.12 }); t({ f: 400, d: 1.4, v: 0.1, noise: true }); },
    wave() { t({ f: 300, d: 0.9, v: 0.018, noise: true, id: 'wave', gap: 0.6 }); },
    creak() { t({ f: 140 + Math.random() * 40, f2: 120, d: 0.25, type: 'triangle', v: 0.025, id: 'creak', gap: 1.2 }); },
    sail(up) { t({ f: up ? 300 : 500, f2: up ? 500 : 280, d: 0.22, v: 0.05, noise: true, id: 'sail', gap: 0.15 }); },
    reload() { t({ f: 520, d: 0.06, type: 'square', v: 0.05, id: 'reload', gap: 0.2 }); later(80, () => t({ f: 780, d: 0.07, type: 'square', v: 0.05 })); },
    empty() { t({ f: 150, d: 0.08, type: 'square', v: 0.05, id: 'empty', gap: 0.25 }); },
    dig() { t({ f: 220, d: 0.12, v: 0.1, noise: true, id: 'dig', gap: 0.25 }); },
    chest() { t({ f: 180, f2: 260, d: 0.25, type: 'triangle', v: 0.1 }); later(200, () => arp([784, 988, 1318, 1568], 0.06, 'square', 0.07)); },
    coins() { arp([1318, 1568, 1976, 1568, 2093], 0.045, 'square', 0.05); },
    fragment() { arp([523, 659, 784, 1046, 1318], 0.1, 'triangle', 0.13); },
    rescue() { arp([392, 523, 659, 784], 0.08, 'triangle', 0.11); },
    step() { t({ f: 160, d: 0.05, v: 0.03, noise: true, id: 'step', gap: 0.2 }); },
    bell() { t({ f: 880, d: 1.2, type: 'sine', v: 0.12 }); t({ f: 1320, d: 0.9, type: 'sine', v: 0.05 }); },
    coin() { t({ f: 1568, d: 0.12, type: 'square', v: 0.05 }); },
    tele(spectral) { t({ f: spectral ? 300 : 500, f2: spectral ? 900 : 700, d: 0.6, type: spectral ? 'sine' : 'triangle', v: 0.07, id: 'tele', gap: 0.3 }); },
    whistle() { t({ f: 1600, f2: 500, d: 0.9, type: 'sine', v: 0.06, id: 'whistle', gap: 0.3 }); },
    shark() { t({ f: 80, f2: 120, d: 0.9, type: 'sawtooth', v: 0.06 }); arp([220, 233], 0.25, 'sawtooth', 0.05); },
    bite() { t({ f: 90, d: 0.4, v: 0.25, noise: true }); t({ f: 300, f2: 80, d: 0.3, type: 'square', v: 0.1 }); },
    boost() { t({ f: 200, f2: 600, d: 0.4, type: 'sawtooth', v: 0.06, id: 'boost', gap: 0.4 }); },
    clash() { t({ f: 2400, d: 0.12, type: 'square', v: 0.05 }); t({ f: 1800, d: 0.15, v: 0.06, noise: true }); },
    board() { arp([392, 494, 587, 784], 0.07, 'square', 0.09); },
    miss() { t({ f: 160, f2: 90, d: 0.3, type: 'square', v: 0.08 }); },
    ghost() { t({ f: 220, f2: 160, d: 1.6, type: 'sine', v: 0.12 }); t({ f: 330, f2: 250, d: 1.6, type: 'sine', v: 0.07 }); },
    roar() { t({ f: 70, f2: 45, d: 1.4, type: 'sawtooth', v: 0.16 }); t({ f: 50, d: 1.4, v: 0.18, noise: true }); },
    phase() { arp([220, 277, 330, 440], 0.12, 'sawtooth', 0.08); },
    portal() { t({ f: 200, f2: 1200, d: 1.0, type: 'sine', v: 0.1 }); },
    win() { arp([523, 659, 784, 1046, 1318, 1568], 0.12, 'square', 0.1); },
    lose() { arp([392, 330, 262, 196], 0.18, 'sawtooth', 0.09); },
    click() { t({ f: 700, d: 0.05, type: 'square', v: 0.05 }); },
    denied() { t({ f: 160, d: 0.1, type: 'square', v: 0.06, id: 'denied', gap: 0.2 }); },
    repair() { arp([392, 523, 659, 784], 0.07, 'triangle', 0.1); t({ f: 600, d: 0.3, v: 0.05, noise: true }); },
  };
}
