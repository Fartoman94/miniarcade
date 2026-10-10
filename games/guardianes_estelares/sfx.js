// @ts-check
/* Efectos de sonido sintetizados con createAudio().tone (atenuados por distancia al jugador). */

/** @param {{tone:(o:any)=>void}} audio @param {()=>{x:number,y:number,z:number}} listener */
export function createSfx(audio, listener) {
  const t = audio.tone;
  const att = (/** @type {any} */ p, range = 420) => {
    if (!p) return 1;
    const l = listener(), d = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
    return Math.max(0, 1 - d / range);
  };
  return {
    shot() { t({ f: 920, f2: 420, d: 0.07, type: 'square', v: 0.045, id: 'shot', gap: 0.05 }); },
    laser() { t({ f: 180, f2: 260, d: 0.11, type: 'sawtooth', v: 0.05, id: 'laser', gap: 0.09 }); },
    enemyShot(p) { const a = att(p, 300); if (a > 0.05) t({ f: 560, f2: 240, d: 0.09, type: 'sawtooth', v: 0.035 * a, id: 'eshot', gap: 0.07 }); },
    hit() { t({ noise: true, d: 0.05, v: 0.06, id: 'hit', gap: 0.04 }); },
    block() { t({ f: 1400, f2: 900, d: 0.05, type: 'triangle', v: 0.04, id: 'block', gap: 0.08 }); },
    boom(p, k = 0.5) { const a = att(p, 600); if (a <= 0.03) return; t({ noise: true, d: 0.35 + k * 0.5, v: 0.22 * a * (0.6 + k), id: 'boom', gap: 0.06 }); t({ f: 110, f2: 38, d: 0.4 + k * 0.4, type: 'sine', v: 0.25 * a, id: 'boomlo', gap: 0.08 }); },
    shieldHit() { t({ f: 380, f2: 180, d: 0.14, type: 'triangle', v: 0.12, id: 'shit', gap: 0.08 }); },
    hullHit() { t({ noise: true, d: 0.2, v: 0.2, id: 'hhit', gap: 0.1 }); t({ f: 140, f2: 60, d: 0.2, type: 'square', v: 0.08, id: 'hhit2', gap: 0.1 }); },
    shieldDown() { t({ f: 700, f2: 120, d: 0.5, type: 'sawtooth', v: 0.12, id: 'sdown', gap: 0.5 }); },
    pickup() { t({ f: 660, f2: 990, d: 0.12, type: 'triangle', v: 0.12, id: 'pk1', gap: 0.05 }); setTimeout(() => t({ f: 990, f2: 1480, d: 0.14, type: 'triangle', v: 0.1, id: 'pk2', gap: 0.05 }), 90); },
    scanTick() { t({ f: 1200, d: 0.04, type: 'sine', v: 0.05, id: 'scan', gap: 0.18 }); },
    scanDone() { t({ f: 520, f2: 1560, d: 0.35, type: 'sine', v: 0.14, id: 'scand', gap: 0.2 }); },
    turretOn() { t({ f: 200, f2: 800, d: 0.5, type: 'square', v: 0.07, id: 'ton', gap: 0.3 }); },
    allyShot(p) { const a = att(p, 260); if (a > 0.05) t({ f: 1300, f2: 700, d: 0.05, type: 'square', v: 0.025 * a, id: 'ashot', gap: 0.08 }); },
    dock() { t({ f: 300, f2: 600, d: 0.6, type: 'triangle', v: 0.1, id: 'dock', gap: 0.4 }); },
    repair() { t({ f: 440, f2: 880, d: 0.5, type: 'sine', v: 0.12, id: 'rep', gap: 0.3 }); },
    mineDrop(p) { const a = att(p, 250); if (a > 0.05) t({ f: 300, f2: 200, d: 0.12, type: 'square', v: 0.05 * a, id: 'mine', gap: 0.2 }); },
    mineBeep() { t({ f: 1800, d: 0.05, type: 'square', v: 0.05, id: 'mbeep', gap: 0.12 }); },
    torpedo(p) { const a = att(p, 350); if (a > 0.05) t({ f: 160, f2: 420, d: 0.4, type: 'sawtooth', v: 0.08 * a, id: 'torp', gap: 0.3 }); },
    charge() { t({ f: 120, f2: 520, d: 1.4, type: 'sawtooth', v: 0.09, id: 'charge', gap: 0.8 }); },
    beam() { t({ f: 90, f2: 70, d: 0.9, type: 'sawtooth', v: 0.16, id: 'beam', gap: 0.6 }); t({ noise: true, d: 0.8, v: 0.1, id: 'beamn', gap: 0.6 }); },
    warp() { t({ f: 80, f2: 900, d: 1.1, type: 'sine', v: 0.16, id: 'warp', gap: 0.8 }); },
    alarm() { t({ f: 660, f2: 440, d: 0.35, type: 'square', v: 0.08, id: 'alarm', gap: 0.3 }); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => t({ f, d: 0.22, type: 'triangle', v: 0.12, id: 'm' + i, gap: 0.05 }), i * 110)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => t({ f, d: 0.3, type: 'triangle', v: 0.12, id: 'l' + i, gap: 0.05 }), i * 160)); },
    click() { t({ f: 700, d: 0.04, type: 'square', v: 0.05, id: 'click', gap: 0.03 }); },
  };
}
