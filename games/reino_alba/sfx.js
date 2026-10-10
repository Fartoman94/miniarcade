// @ts-check
/* Reino del Alba — sonidos sintetizados con createAudio().tone. */

/** @param {{tone:(o:any)=>void}} audio @param {(fn:()=>void, ms:number)=>void} later */
export function createSfx(audio, later) {
  const t = o => audio.tone(o);
  const arp = (fs, d = 0.09, type = 'triangle', v = 0.12) => fs.forEach((f, i) => later(() => t({ f, d: d * 2.2, type, v }), i * d * 1000));
  return {
    step: () => t({ f: 110, d: 0.05, v: 0.03, noise: true, id: 'step', gap: 0.24 }),
    swing: () => t({ f: 520, f2: 180, d: 0.14, type: 'sawtooth', v: 0.06, id: 'swing', gap: 0.1 }),
    roll: () => t({ f: 180, d: 0.22, v: 0.06, noise: true, id: 'roll' }),
    hit: () => { t({ f: 200, f2: 90, d: 0.12, type: 'square', v: 0.1, id: 'hit', gap: 0.05 }); t({ f: 900, d: 0.05, v: 0.05, noise: true }); },
    clank: () => t({ f: 1400, f2: 900, d: 0.12, type: 'square', v: 0.06, id: 'clank', gap: 0.1 }),
    kill: () => arp([300, 220, 160], 0.06, 'sawtooth', 0.07),
    hurt: () => t({ f: 280, f2: 90, d: 0.25, type: 'sawtooth', v: 0.14, id: 'hurt', gap: 0.2 }),
    door: () => { t({ f: 140, f2: 90, d: 0.5, type: 'sawtooth', v: 0.05, id: 'door', gap: 0.3 }); t({ f: 70, d: 0.4, v: 0.06, noise: true }); },
    locked: () => { t({ f: 300, d: 0.06, type: 'square', v: 0.06, id: 'locked', gap: 0.25 }); later(() => t({ f: 240, d: 0.08, type: 'square', v: 0.06 }), 80); },
    chest: () => arp([523, 659, 784], 0.07, 'triangle', 0.1),
    coin: () => { t({ f: 1320, d: 0.07, type: 'square', v: 0.05, id: 'coin', gap: 0.05 }); later(() => t({ f: 1760, d: 0.1, type: 'square', v: 0.05 }), 60); },
    pick: () => t({ f: 660, f2: 990, d: 0.12, type: 'triangle', v: 0.09, id: 'pick' }),
    mine: () => { t({ f: 1800, d: 0.05, type: 'square', v: 0.07 }); t({ f: 100, d: 0.15, v: 0.08, noise: true }); },
    talk: () => t({ f: 380 + Math.random() * 120, d: 0.06, type: 'triangle', v: 0.05, id: 'talk', gap: 0.07 }),
    quest: () => arp([392, 523, 659, 784, 1046], 0.09, 'triangle', 0.12),
    stage: () => arp([523, 784], 0.08, 'sine', 0.1),
    solve: () => arp([523, 659, 784, 1046], 0.1, 'triangle', 0.12),
    click: () => t({ f: 700, d: 0.04, type: 'square', v: 0.04, id: 'click' }),
    roar: () => { t({ f: 90, f2: 50, d: 0.9, type: 'sawtooth', v: 0.14, id: 'roar' }); t({ f: 60, d: 0.8, v: 0.12, noise: true }); },
    growl: () => t({ f: 120, f2: 80, d: 0.3, type: 'sawtooth', v: 0.06, id: 'growl', gap: 0.3 }),
    slam: () => { t({ f: 70, f2: 35, d: 0.35, type: 'square', v: 0.14, id: 'slam', gap: 0.1 }); t({ f: 60, d: 0.3, v: 0.14, noise: true }); },
    swoosh: () => t({ f: 400, f2: 120, d: 0.25, v: 0.08, noise: true, id: 'swoosh' }),
    chain: () => { for (let i = 0; i < 4; i++) later(() => t({ f: 1200 + i * 90, d: 0.04, type: 'square', v: 0.04 }), i * 40); },
    heal: () => arp([440, 554, 659], 0.08, 'sine', 0.1),
    hammer: () => { t({ f: 1500, d: 0.06, type: 'square', v: 0.07 }); later(() => t({ f: 1500, d: 0.06, type: 'square', v: 0.07 }), 220); later(() => t({ f: 1700, d: 0.1, type: 'square', v: 0.08 }), 440); },
    lever: () => { t({ f: 200, f2: 120, d: 0.25, type: 'square', v: 0.07 }); t({ f: 80, d: 0.3, v: 0.08, noise: true }); },
    victory: () => arp([392, 523, 659, 784, 1046, 1318], 0.12, 'triangle', 0.13),
    defeat: () => arp([392, 311, 262, 196], 0.15, 'sawtooth', 0.1),
    denied: () => t({ f: 160, d: 0.08, type: 'square', v: 0.04, id: 'denied', gap: 0.2 }),
  };
}
