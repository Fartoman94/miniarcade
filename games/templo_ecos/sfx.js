// @ts-check
/* Templo de los Ecos — sonidos sintetizados (createAudio().tone). */

/** @param {{tone:(o:any)=>void}} audio */
export function createSfx(audio) {
  const t = o => audio.tone(o);
  /** arpegio: notas con retardo */
  const arp = (fs, d = 0.09, type = 'triangle', v = 0.12) => fs.forEach((f, i) => setTimeout(() => t({ f, d: d * 2.2, type, v }), i * d * 1000));
  return {
    step: () => t({ f: 90, d: 0.05, v: 0.035, noise: true, id: 'step', gap: 0.22 }),
    jump: () => t({ f: 320, f2: 560, d: 0.12, type: 'square', v: 0.05, id: 'jump' }),
    djump: () => t({ f: 560, f2: 980, d: 0.16, type: 'triangle', v: 0.08, id: 'jump' }),
    land: () => t({ f: 110, f2: 70, d: 0.08, type: 'sine', v: 0.08, id: 'land', gap: 0.15 }),
    push: () => { t({ f: 70, d: 0.3, v: 0.12, noise: true, id: 'push' }); t({ f: 65, f2: 50, d: 0.3, type: 'sawtooth', v: 0.05 }); },
    bump: () => t({ f: 90, f2: 60, d: 0.1, type: 'square', v: 0.05, id: 'bump', gap: 0.3 }),
    plate: down => t({ f: down ? 220 : 160, f2: down ? 140 : 240, d: 0.12, type: 'square', v: 0.07, id: 'plate', gap: 0.06 }),
    door: () => { t({ f: 60, d: 1.1, v: 0.18, noise: true, id: 'door', gap: 0.3 }); t({ f: 55, f2: 40, d: 1.1, type: 'sawtooth', v: 0.06 }); },
    mirror: () => { t({ f: 820, f2: 980, d: 0.07, type: 'triangle', v: 0.08 }); setTimeout(() => t({ f: 640, d: 0.06, type: 'triangle', v: 0.06 }), 70); },
    reset: () => arp([660, 440, 330], 0.07, 'sine', 0.1),
    solve: () => arp([523, 659, 784, 1046], 0.1, 'triangle', 0.13),
    crumble: () => { t({ f: 80, d: 0.9, v: 0.22, noise: true }); t({ f: 70, f2: 35, d: 0.7, type: 'square', v: 0.05 }); },
    codex: () => arp([784, 988, 1175, 1568], 0.06, 'sine', 0.1),
    relic: () => { arp([392, 523, 659, 784, 1046], 0.11, 'triangle', 0.14); t({ f: 196, d: 1.2, type: 'sine', v: 0.12 }); },
    checkpoint: () => { t({ f: 200, f2: 600, d: 0.35, type: 'sine', v: 0.1 }); t({ f: 300, d: 0.4, v: 0.05, noise: true }); },
    eco: () => { t({ f: 1100, f2: 220, d: 0.5, type: 'sine', v: 0.16, id: 'eco' }); t({ f: 550, f2: 110, d: 0.6, type: 'triangle', v: 0.06 }); },
    denied: () => t({ f: 160, d: 0.08, type: 'square', v: 0.04, id: 'denied', gap: 0.2 }),
    hurt: () => { t({ f: 260, f2: 90, d: 0.25, type: 'sawtooth', v: 0.14, id: 'hurt' }); },
    die: () => arp([392, 311, 262, 196], 0.14, 'sawtooth', 0.1),
    fall: () => t({ f: 600, f2: 80, d: 0.8, type: 'sine', v: 0.12 }),
    alert: () => { t({ f: 620, d: 0.1, type: 'square', v: 0.08 }); setTimeout(() => t({ f: 620, d: 0.1, type: 'square', v: 0.08 }), 140); },
    charge: () => t({ f: 120, f2: 380, d: 0.45, type: 'sawtooth', v: 0.06, id: 'charge', gap: 0.2 }),
    thud: () => { t({ f: 55, d: 0.4, v: 0.25, noise: true, id: 'thud' }); },
    skitter: () => t({ f: 2000, d: 0.12, v: 0.05, noise: true, id: 'skit', gap: 0.3 }),
    squish: () => { t({ f: 400, f2: 90, d: 0.18, type: 'square', v: 0.07 }); },
    wail: () => t({ f: 520, f2: 300, d: 0.7, type: 'sine', v: 0.08, id: 'wail', gap: 1 }),
    dispel: () => t({ f: 300, f2: 1300, d: 0.35, type: 'sine', v: 0.1, id: 'dispel' }),
    note: f => { t({ f, d: 0.7, type: 'sine', v: 0.2 }); t({ f: f * 2, d: 0.35, type: 'triangle', v: 0.04 }); },
    wrong: () => { t({ f: 140, d: 0.35, type: 'square', v: 0.09 }); t({ f: 147, d: 0.35, type: 'square', v: 0.07 }); },
    roar: () => { t({ f: 95, f2: 45, d: 1.4, type: 'sawtooth', v: 0.16 }); t({ f: 70, d: 1.2, v: 0.18, noise: true }); },
    bossHit: () => { t({ f: 180, f2: 60, d: 0.4, type: 'square', v: 0.14 }); t({ f: 90, d: 0.35, v: 0.15, noise: true }); },
    fire: () => t({ f: 900, f2: 300, d: 0.3, type: 'sawtooth', v: 0.07, id: 'fire' }),
    reflect: () => { t({ f: 1200, f2: 2000, d: 0.2, type: 'triangle', v: 0.14 }); t({ f: 1800, d: 0.15, type: 'sine', v: 0.08 }); },
    slam: () => { t({ f: 50, d: 0.6, v: 0.28, noise: true }); t({ f: 60, f2: 30, d: 0.5, type: 'sine', v: 0.2 }); },
    shatter: () => { t({ f: 3000, d: 0.4, v: 0.1, noise: true }); arp([1568, 1318, 1046], 0.06, 'triangle', 0.08); },
    crack: () => { t({ f: 1600, f2: 400, d: 0.3, type: 'sawtooth', v: 0.1 }); t({ f: 2400, d: 0.2, v: 0.08, noise: true }); },
    drainCharge: () => t({ f: 200, f2: 420, d: 0.9, type: 'sine', v: 0.08 }),
    drainHit: () => t({ f: 330, f2: 320, d: 0.6, type: 'sawtooth', v: 0.06 }),
    victory: () => arp([523, 659, 784, 1046, 784, 1046, 1318], 0.13, 'triangle', 0.14),
    click: () => t({ f: 900, d: 0.04, type: 'square', v: 0.04, id: 'click' }),
  };
}
