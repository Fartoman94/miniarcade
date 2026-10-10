// @ts-check
/* Derby de Chatarra — sonidos sintetizados (createAudio().tone): motor, choques, potenciadores, jefe. */

/** @param {{tone:(o:any)=>void}} audio */
export function createSfx(audio) {
  const t = o => audio.tone(o);
  const later = (ms, fn) => setTimeout(fn, ms);
  const arp = (fs, d = 0.09, type = 'triangle', v = 0.12) => fs.forEach((f, i) => later(i * d * 1000, () => t({ f, d: d * 2.2, type, v })));
  return {
    /** motor: pulso corto cuyo tono sube con la velocidad (limitado por id/gap) */
    engine(speed, nitro, throttle) {
      const f = 48 + Math.abs(speed) * 3.4 + (nitro ? 40 : 0) + throttle * 8;
      t({ f, f2: f * 1.04, d: 0.1, type: 'sawtooth', v: 0.028 + throttle * 0.012, id: 'eng', gap: 0.085 });
    },
    crash(k = 1) { t({ f: 90, d: 0.25 + k * 0.15, v: Math.min(0.32, 0.1 + k * 0.12), noise: true, id: 'crash', gap: 0.06 }); t({ f: 140, f2: 50, d: 0.22, type: 'square', v: Math.min(0.12, 0.04 + k * 0.05) }); },
    scrape() { t({ f: 900, f2: 600, d: 0.12, v: 0.05, noise: true, id: 'scrape', gap: 0.18 }); },
    skid() { t({ f: 520, f2: 480, d: 0.12, type: 'sawtooth', v: 0.018, id: 'skid', gap: 0.12 }); },
    pickup() { arp([660, 880, 1320], 0.05, 'square', 0.07); },
    power(type) {
      if (type === 'nitro') { t({ f: 200, f2: 900, d: 0.5, type: 'sawtooth', v: 0.09 }); t({ f: 100, d: 0.6, v: 0.12, noise: true }); }
      else if (type === 'iman') { t({ f: 120, f2: 240, d: 0.6, type: 'sine', v: 0.14 }); }
      else if (type === 'escudo') { arp([523, 784, 1046], 0.06, 'sine', 0.12); }
      else if (type === 'trampa') { t({ f: 300, f2: 180, d: 0.15, type: 'square', v: 0.08 }); }
      else if (type === 'repair') { arp([392, 523, 659, 784], 0.07, 'triangle', 0.12); }
    },
    nitro() { t({ f: 180, f2: 420, d: 0.3, type: 'sawtooth', v: 0.05, id: 'nitro', gap: 0.5 }); },
    explosion(k = 1) { t({ f: 60, d: 0.9 * k, v: 0.3, noise: true }); t({ f: 110, f2: 30, d: 0.8 * k, type: 'sawtooth', v: 0.12 }); },
    horn(on) { if (!on) return; t({ f: 330, d: 0.25, type: 'square', v: 0.07, id: 'horn', gap: 0.5 }); later(260, () => t({ f: 262, d: 0.35, type: 'square', v: 0.07 })); },
    hop() { t({ f: 200, f2: 700, d: 0.45, type: 'sine', v: 0.1, id: 'hop', gap: 0.3 }); },
    slam(k = 1) { t({ f: 70, d: 0.5 * k, v: 0.28, noise: true }); t({ f: 90, f2: 35, d: 0.5, type: 'square', v: 0.1 }); },
    stunt() { arp([784, 988, 1175, 1568], 0.06, 'square', 0.07); },
    land() { t({ f: 110, f2: 60, d: 0.14, type: 'square', v: 0.08, id: 'land', gap: 0.15 }); },
    tower() { t({ f: 140, d: 0.7, v: 0.22, noise: true }); arp([300, 220, 160], 0.07, 'square', 0.06); },
    switch() { t({ f: 220, d: 0.06, type: 'square', v: 0.09 }); later(80, () => t({ f: 330, d: 0.08, type: 'square', v: 0.09 })); later(200, () => t({ f: 60, d: 0.6, v: 0.12, noise: true })); },
    derail() { t({ f: 80, d: 1.0, v: 0.25, noise: true }); t({ f: 70, f2: 30, d: 0.9, type: 'sawtooth', v: 0.1 }); },
    beep(hi) { t({ f: hi ? 880 : 440, d: hi ? 0.45 : 0.18, type: 'square', v: 0.1 }); },
    roundEnd() { arp([523, 659, 784, 1046, 784, 1046], 0.1, 'triangle', 0.12); },
    win() { arp([523, 659, 784, 1046, 1318, 1568], 0.11, 'square', 0.1); },
    lose() { arp([392, 330, 262, 196], 0.16, 'sawtooth', 0.09); },
    roar(k = 1) { t({ f: 70, f2: 45, d: 1.1 * k, type: 'sawtooth', v: 0.16 }); t({ f: 55, d: 1.0 * k, v: 0.18, noise: true }); },
    shieldBreak() { arp([1800, 1400, 1000, 700], 0.04, 'square', 0.08); t({ f: 2000, d: 0.5, v: 0.14, noise: true }); },
    zap() { t({ f: 1200, f2: 200, d: 0.35, type: 'sawtooth', v: 0.12, id: 'zap', gap: 0.2 }); t({ f: 3000, d: 0.25, v: 0.08, noise: true }); },
    grind() { t({ f: 160, f2: 120, d: 0.15, type: 'sawtooth', v: 0.08, id: 'grind', gap: 0.12 }); },
    magnet() { t({ f: 90, f2: 180, d: 2.4, type: 'sine', v: 0.12 }); },
    magnetCharge() { t({ f: 300, f2: 900, d: 0.9, type: 'triangle', v: 0.08 }); },
    jumpBig() { t({ f: 120, f2: 500, d: 0.7, type: 'sawtooth', v: 0.1 }); },
    hurt() { t({ f: 300, f2: 90, d: 0.2, type: 'sawtooth', v: 0.1, id: 'hurt', gap: 0.15 }); },
    click() { t({ f: 700, d: 0.05, type: 'square', v: 0.05 }); },
    denied() { t({ f: 160, d: 0.08, type: 'square', v: 0.05, id: 'denied', gap: 0.2 }); },
  };
}
