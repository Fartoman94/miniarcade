// @ts-check
/* Carrera Vertical — sonidos sintetizados (createAudio().tone) y un pulso musical liviano atado al tiempo de juego. */

/** @param {{tone:(o:any)=>void}} audio */
export function createSfx(audio) {
  const t = o => audio.tone(o);
  const arp = (fs, d = 0.08, type = 'triangle', v = 0.12) => fs.forEach((f, i) => setTimeout(() => t({ f, d: d * 2.2, type, v }), i * d * 1000));
  let beat = 0, bar = 0;
  const BASS = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4];
  return {
    step: () => t({ f: 120, d: 0.04, v: 0.03, noise: true, id: 'step', gap: 0.12 }),
    jump: () => t({ f: 330, f2: 620, d: 0.11, type: 'square', v: 0.045, id: 'jump' }),
    land: () => t({ f: 120, f2: 70, d: 0.08, type: 'sine', v: 0.09, id: 'land', gap: 0.12 }),
    hardLand: () => { t({ f: 70, d: 0.25, v: 0.16, noise: true, id: 'hard' }); t({ f: 90, f2: 45, d: 0.25, type: 'sine', v: 0.14 }); },
    roll: () => t({ f: 200, d: 0.25, v: 0.07, noise: true, id: 'roll' }),
    slide: () => t({ f: 900, d: 0.4, v: 0.05, noise: true, id: 'slide', gap: 0.3 }),
    wall: () => t({ f: 1400, d: 0.18, v: 0.03, noise: true, id: 'wall', gap: 0.16 }),
    wallJump: () => { t({ f: 440, f2: 880, d: 0.12, type: 'square', v: 0.05 }); t({ f: 300, d: 0.06, v: 0.05, noise: true }); },
    climb: () => t({ f: 260, f2: 420, d: 0.14, type: 'triangle', v: 0.06, id: 'climb', gap: 0.2 }),
    mantle: () => t({ f: 180, f2: 300, d: 0.1, type: 'triangle', v: 0.07, id: 'mantle' }),
    dash: () => { t({ f: 200, f2: 1200, d: 0.25, type: 'sawtooth', v: 0.07, id: 'dash' }); t({ f: 500, d: 0.2, v: 0.06, noise: true }); },
    launch: () => { t({ f: 120, f2: 900, d: 0.4, type: 'sawtooth', v: 0.08, id: 'dash' }); t({ f: 300, d: 0.3, v: 0.08, noise: true }); },
    zipOn: () => t({ f: 700, f2: 1100, d: 0.12, type: 'triangle', v: 0.07 }),
    zip: () => t({ f: 2400, d: 0.16, v: 0.025, noise: true, id: 'zip', gap: 0.12 }),
    door: () => { t({ f: 520, f2: 260, d: 0.25, type: 'sine', v: 0.06, id: 'door', gap: 0.3 }); t({ f: 1600, d: 0.2, v: 0.025, noise: true }); },
    denied: () => t({ f: 160, d: 0.12, type: 'square', v: 0.05, id: 'denied', gap: 0.4 }),
    unlock: () => arp([660, 880, 1320], 0.06, 'triangle', 0.1),
    lift: () => t({ f: 90, f2: 140, d: 0.6, type: 'sawtooth', v: 0.04, id: 'lift', gap: 0.5 }),
    liftStop: () => t({ f: 140, f2: 90, d: 0.2, type: 'square', v: 0.04, id: 'liftS' }),
    clock: () => { arp([988, 1319, 1760], 0.05, 'sine', 0.1); },
    checkpoint: () => arp([523, 784, 1046], 0.07, 'triangle', 0.12),
    alt: () => arp([392, 523, 659, 880], 0.06, 'square', 0.06),
    combo: n => t({ f: 440 * Math.pow(1.12, Math.min(10, n)), d: 0.12, type: 'triangle', v: 0.07, id: 'combo', gap: 0.05 }),
    scan: () => t({ f: 1800, f2: 1600, d: 0.06, type: 'sine', v: 0.03, id: 'scan', gap: 0.25 }),
    alarm: () => { t({ f: 880, d: 0.12, type: 'square', v: 0.08 }); setTimeout(() => t({ f: 660, d: 0.12, type: 'square', v: 0.08 }), 140); setTimeout(() => t({ f: 880, d: 0.12, type: 'square', v: 0.08 }), 280); },
    zap: () => { t({ f: 1200, f2: 200, d: 0.22, type: 'sawtooth', v: 0.1, id: 'zap' }); t({ f: 900, d: 0.15, v: 0.06, noise: true }); },
    turretLock: () => t({ f: 1500, d: 0.08, type: 'square', v: 0.035, id: 'tlock', gap: 0.5 }),
    turretFire: () => t({ f: 600, f2: 150, d: 0.25, type: 'square', v: 0.07, id: 'tfire' }),
    stunHit: () => { t({ f: 260, f2: 90, d: 0.3, type: 'sawtooth', v: 0.12, id: 'hurt' }); },
    fall: () => t({ f: 700, f2: 90, d: 0.9, type: 'sine', v: 0.12, id: 'fall' }),
    count: last => t({ f: last ? 1046 : 523, d: last ? 0.4 : 0.16, type: 'square', v: 0.08 }),
    finish: () => arp([523, 659, 784, 1046, 1318], 0.09, 'triangle', 0.14),
    record: () => arp([784, 988, 1175, 1568, 1976], 0.07, 'square', 0.07),
    fail: () => arp([392, 330, 262, 196], 0.13, 'sawtooth', 0.09),
    roar: () => { t({ f: 80, f2: 40, d: 1.6, type: 'sawtooth', v: 0.16 }); t({ f: 70, d: 1.4, v: 0.15, noise: true }); },
    bossCharge: () => t({ f: 160, f2: 900, d: 0.9, type: 'sawtooth', v: 0.06, id: 'bc' }),
    bossFire: () => { t({ f: 120, f2: 60, d: 0.45, type: 'square', v: 0.14 }); t({ f: 400, d: 0.4, v: 0.12, noise: true }); },
    mineDrop: () => t({ f: 1200, f2: 600, d: 0.15, type: 'triangle', v: 0.05, id: 'mine', gap: 0.1 }),
    mineBoom: () => { t({ f: 60, d: 0.45, v: 0.2, noise: true, id: 'boom', gap: 0.08 }); t({ f: 90, f2: 40, d: 0.4, type: 'sine', v: 0.14 }); },
    capture: () => { t({ f: 300, f2: 80, d: 0.8, type: 'sawtooth', v: 0.13 }); t({ f: 100, d: 0.6, v: 0.12, noise: true }); },
    crash: () => { t({ f: 50, d: 1.6, v: 0.25, noise: true }); arp([440, 349, 262, 175], 0.15, 'sawtooth', 0.1); },
    click: () => t({ f: 900, d: 0.04, type: 'square', v: 0.04, id: 'click' }),
    /** pulso musical (llamar cada paso con el tiempo de juego; el ritmo sube con la tensión) */
    music(dt, on, intensity = 0) {
      if (!on) return;
      beat += dt * (2 + intensity * 0.8); // corcheas a ~120-170 bpm
      if (beat < 1) return;
      beat -= 1; bar = (bar + 1) % 16;
      const step = bar % 8;
      if (bar % 2 === 0) t({ f: BASS[step], d: 0.2, type: 'triangle', v: 0.06 + intensity * 0.02 });
      if (bar % 4 === 0) t({ f: 55, f2: 35, d: 0.12, type: 'sine', v: 0.09 });
      if (bar % 2 === 1) t({ f: 8000, d: 0.03, v: 0.012 + intensity * 0.008, noise: true });
      if (intensity > 0.5 && bar % 8 === 6) t({ f: BASS[step] * 4, d: 0.15, type: 'square', v: 0.025 });
    },
  };
}
