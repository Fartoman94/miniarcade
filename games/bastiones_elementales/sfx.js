// @ts-check
/* Bastiones Elementales — sonidos sintetizados con createAudio().tone (sin archivos). */

/** @param {{tone:(o:any)=>void}} audio */
export function createSfx(audio) {
  const t = o => audio.tone(o);
  const arp = (fs, d = 0.08, type = 'triangle', v = 0.1) => fs.forEach((f, i) => setTimeout(() => t({ f, d: d * 2.2, type, v }), i * d * 1000));
  return {
    click: () => t({ f: 660, d: 0.05, type: 'triangle', v: 0.06, id: 'click', gap: 0.05 }),
    select: () => t({ f: 520, f2: 780, d: 0.08, type: 'triangle', v: 0.07, id: 'sel', gap: 0.05 }),
    denied: () => t({ f: 150, d: 0.12, type: 'square', v: 0.05, id: 'denied', gap: 0.2 }),
    build: () => { t({ f: 90, d: 0.25, v: 0.14, noise: true }); arp([392, 523, 659], 0.06, 'triangle', 0.09); },
    upgrade: () => arp([523, 659, 784, 1046], 0.06, 'triangle', 0.1),
    sell: () => arp([880, 660, 520], 0.05, 'sine', 0.08),
    move: () => { t({ f: 300, f2: 700, d: 0.3, type: 'sine', v: 0.08 }); },
    lever: () => { t({ f: 120, d: 0.12, type: 'square', v: 0.08 }); setTimeout(() => t({ f: 70, d: 0.9, v: 0.14, noise: true }), 90); setTimeout(() => t({ f: 60, f2: 40, d: 0.9, type: 'sawtooth', v: 0.05 }), 90); },
    harvest: () => arp([784, 988, 1175, 1568], 0.05, 'sine', 0.1),
    coin: () => t({ f: 1320, f2: 1760, d: 0.06, type: 'square', v: 0.025, id: 'coin', gap: 0.06 }),
    bolt: () => t({ f: 900, f2: 300, d: 0.06, type: 'triangle', v: 0.03, id: 'bolt', gap: 0.07 }),
    fire: () => t({ f: 220, f2: 120, d: 0.18, type: 'sawtooth', v: 0.035, id: 'fire', gap: 0.1 }),
    boom: () => t({ f: 80, d: 0.25, v: 0.07, noise: true, id: 'boom', gap: 0.08 }),
    ice: () => t({ f: 1600, f2: 2400, d: 0.07, type: 'sine', v: 0.03, id: 'ice', gap: 0.08 }),
    freeze: () => t({ f: 2400, f2: 1200, d: 0.25, type: 'sine', v: 0.05, id: 'freeze', gap: 0.15 }),
    zap: () => { t({ f: 140, d: 0.12, v: 0.06, noise: true, id: 'zap', gap: 0.08 }); t({ f: 1800, f2: 400, d: 0.1, type: 'square', v: 0.025, id: 'zap2', gap: 0.08 }); },
    combo: () => t({ f: 660, f2: 1320, d: 0.18, type: 'square', v: 0.05, id: 'combo', gap: 0.12 }),
    shield: () => t({ f: 500, f2: 900, d: 0.12, type: 'sine', v: 0.04, id: 'shield', gap: 0.3 }),
    blink: () => t({ f: 1200, f2: 300, d: 0.15, type: 'triangle', v: 0.05, id: 'blink', gap: 0.1 }),
    warn: () => { t({ f: 440, d: 0.1, type: 'square', v: 0.06, id: 'warn', gap: 0.3 }); setTimeout(() => t({ f: 440, d: 0.1, type: 'square', v: 0.06 }), 150); },
    leak: () => { t({ f: 300, f2: 90, d: 0.4, type: 'sawtooth', v: 0.12, id: 'leak', gap: 0.15 }); },
    auxHit: () => t({ f: 700, f2: 500, d: 0.06, type: 'triangle', v: 0.03, id: 'auxhit', gap: 0.4 }),
    auxLost: () => arp([660, 494, 392, 262], 0.1, 'sawtooth', 0.09),
    wave: () => { arp([262, 330, 392, 523], 0.09, 'square', 0.07); t({ f: 65, d: 0.8, type: 'sawtooth', v: 0.06 }); },
    cleared: () => arp([523, 659, 784, 1046, 1318], 0.07, 'triangle', 0.1),
    roar: () => { t({ f: 90, f2: 40, d: 1.6, type: 'sawtooth', v: 0.16 }); t({ f: 60, d: 1.4, v: 0.14, noise: true }); },
    emp: () => { t({ f: 2000, f2: 80, d: 0.6, type: 'square', v: 0.08 }); t({ f: 100, d: 0.5, v: 0.12, noise: true }); },
    titanDown: () => { arp([196, 262, 330, 392, 523, 659, 784], 0.12, 'triangle', 0.13); t({ f: 50, d: 2, v: 0.18, noise: true }); },
    win: () => arp([523, 659, 784, 1046, 784, 1046, 1318], 0.1, 'triangle', 0.12),
    lose: () => arp([392, 330, 262, 196, 131], 0.16, 'sawtooth', 0.1),
    thunder: () => t({ f: 50, d: 1.6, v: 0.1, noise: true, id: 'thunder', gap: 2 }),
  };
}
