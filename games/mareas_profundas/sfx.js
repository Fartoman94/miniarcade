// @ts-check
/* Mareas Profundas — sonidos sintetizados (createAudio().tone): sonar, motor, criaturas, Leviatán y ambiente. */

/** @param {{tone:(o:any)=>void}} audio @param {()=>boolean} active */
export function createSfx(audio, active) {
  const t = o => audio.tone(o);
  const later = (ms, o) => setTimeout(() => { if (active()) t(o); }, ms);
  const arp = (fs, d = 0.09, type = 'triangle', v = 0.12) => fs.forEach((f, i) => later(i * d * 1000, { f, d: d * 2.2, type, v }));
  return {
    ping: () => { t({ f: 1250, f2: 980, d: 0.35, type: 'sine', v: 0.16, id: 'ping' }); later(260, { f: 1250, f2: 980, d: 0.5, type: 'sine', v: 0.06 }); later(620, { f: 1250, f2: 980, d: 0.6, type: 'sine', v: 0.025 }); },
    echo: () => t({ f: 1600, d: 0.06, type: 'sine', v: 0.05, id: 'echo', gap: 0.07 }),
    engine: k => t({ f: 55 + k * 30, d: 0.18, type: 'sawtooth', v: 0.012 + k * 0.01, id: 'engine', gap: 0.16 }),
    thrustUp: () => t({ f: 80, d: 0.25, v: 0.03, noise: true, id: 'ballast', gap: 0.3 }),
    light: on => t({ f: on ? 900 : 500, f2: on ? 1300 : 300, d: 0.08, type: 'square', v: 0.04 }),
    photo: () => { t({ f: 2400, d: 0.04, type: 'square', v: 0.06 }); t({ f: 200, d: 0.12, v: 0.08, noise: true }); },
    scan: () => t({ f: 700, f2: 1400, d: 0.12, type: 'sine', v: 0.05, id: 'scan', gap: 0.2 }),
    scanDone: () => arp([660, 880, 1320], 0.06, 'sine', 0.1),
    crash: k => { t({ f: 90, f2: 40, d: 0.3, type: 'square', v: Math.min(0.2, 0.06 + k * 0.02), id: 'crash', gap: 0.2 }); t({ f: 120, d: 0.25, v: 0.12, noise: true }); },
    bump: () => t({ f: 140, f2: 90, d: 0.08, type: 'sine', v: 0.05, id: 'bump', gap: 0.25 }),
    scrape: () => t({ f: 60, d: 0.2, v: 0.06, noise: true, id: 'scrape', gap: 0.18 }),
    hurt: () => { t({ f: 300, f2: 90, d: 0.3, type: 'sawtooth', v: 0.14, id: 'hurt', gap: 0.15 }); },
    alarm: () => { t({ f: 880, d: 0.12, type: 'square', v: 0.07 }); later(160, { f: 660, d: 0.12, type: 'square', v: 0.07 }); },
    beep: () => t({ f: 1200, d: 0.05, type: 'square', v: 0.04, id: 'beep', gap: 0.2 }),
    warn: () => t({ f: 520, d: 0.18, type: 'square', v: 0.06, id: 'warn', gap: 0.9 }),
    creak: () => t({ f: 70, f2: 50, d: 0.7, type: 'sawtooth', v: 0.06, id: 'creak', gap: 1.6 }),
    crackle: () => { for (let i = 0; i < 4; i++) later(i * 90, { f: 2000 + Math.random() * 2000, d: 0.04, type: 'square', v: 0.025 }); },
    zap: () => { t({ f: 1800, f2: 200, d: 0.25, type: 'sawtooth', v: 0.1, id: 'zap', gap: 0.1 }); t({ f: 400, d: 0.2, v: 0.08, noise: true }); },
    hiss: () => t({ f: 300, d: 0.5, v: 0.06, noise: true, id: 'hiss', gap: 0.4 }),
    bite: () => { t({ f: 160, f2: 60, d: 0.18, type: 'square', v: 0.12, id: 'bite', gap: 0.15 }); },
    clang: () => { t({ f: 420, f2: 300, d: 0.3, type: 'square', v: 0.1 }); t({ f: 630, d: 0.25, type: 'triangle', v: 0.06 }); },
    growl: () => t({ f: 70, f2: 50, d: 0.8, type: 'sawtooth', v: 0.1, id: 'growl', gap: 1 }),
    slam: () => { t({ f: 60, f2: 30, d: 0.5, type: 'square', v: 0.16 }); t({ f: 90, d: 0.4, v: 0.14, noise: true }); },
    ink: () => t({ f: 200, d: 0.6, v: 0.08, noise: true }),
    roar: () => { t({ f: 55, f2: 35, d: 1.4, type: 'sawtooth', v: 0.16, id: 'roar', gap: 1 }); t({ f: 110, f2: 70, d: 1.2, type: 'square', v: 0.05 }); },
    dash: () => t({ f: 120, f2: 50, d: 0.6, v: 0.14, noise: true, id: 'dash', gap: 0.4 }),
    rumble: () => { t({ f: 45, f2: 35, d: 1.2, type: 'sawtooth', v: 0.12, id: 'rumble', gap: 0.8 }); },
    valve: () => t({ f: 220, f2: 180, d: 0.15, type: 'square', v: 0.04, id: 'valve', gap: 0.18 }),
    grab: () => { t({ f: 300, f2: 500, d: 0.12, type: 'square', v: 0.07 }); later(90, { f: 500, d: 0.1, type: 'triangle', v: 0.06 }); },
    insert: () => arp([392, 523, 659], 0.08, 'square', 0.08),
    door: () => { t({ f: 60, d: 1.4, v: 0.16, noise: true, id: 'door', gap: 0.3 }); t({ f: 70, f2: 45, d: 1.2, type: 'sawtooth', v: 0.06 }); },
    probe: () => { arp([523, 784, 1046], 0.08, 'triangle', 0.1); later(300, { f: 1250, f2: 900, d: 0.4, type: 'sine', v: 0.06 }); },
    dock: () => { t({ f: 180, f2: 90, d: 0.25, type: 'square', v: 0.08 }); later(220, { f: 260, f2: 520, d: 0.4, type: 'sine', v: 0.08 }); },
    undock: () => t({ f: 400, f2: 200, d: 0.3, type: 'sine', v: 0.06 }),
    cell: () => arp([784, 1046, 1318], 0.05, 'sine', 0.08),
    deliver: () => arp([392, 523, 659, 784, 1046], 0.09, 'triangle', 0.12),
    secret: () => arp([440, 554, 659, 880, 1108], 0.11, 'sine', 0.11),
    gate: () => { t({ f: 80, f2: 160, d: 1.0, type: 'sawtooth', v: 0.06 }); t({ f: 100, d: 1.0, v: 0.08, noise: true }); },
    denied: () => t({ f: 160, d: 0.1, type: 'square', v: 0.05, id: 'denied', gap: 0.25 }),
    explode: () => { t({ f: 80, f2: 20, d: 1.2, type: 'sawtooth', v: 0.2 }); t({ f: 100, d: 1.0, v: 0.2, noise: true }); },
    victory: () => arp([523, 659, 784, 1046, 1318, 1568], 0.12, 'triangle', 0.14),
    whale: () => { t({ f: 180 + Math.random() * 60, f2: 120 + Math.random() * 120, d: 2.2, type: 'sine', v: 0.03, id: 'whale', gap: 4 }); },
    click: () => t({ f: 900, d: 0.04, type: 'square', v: 0.04 }),
  };
}
