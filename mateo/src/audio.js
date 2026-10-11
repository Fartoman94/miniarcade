// Mateo: Ciudad de Altura — audio sintetizado con WebAudio (sin archivos): pasos, saltos, cable, viento según
// velocidad, ambiente de ciudad, drones, autos, interfaz y fanfarrias. Volumen general y silencio desde Ajustes.
export function createAudio(getVolume) {
  let ctx = null, master = null, wind = null, windGain = null, amb = null, ambGain = null;
  const last = new Map();
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = getVolume(); master.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let b = 0; for (let i = 0; i < len; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; } // ruido marrón
      wind = ctx.createBufferSource(); wind.buffer = buf; wind.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.6;
      windGain = ctx.createGain(); windGain.gain.value = 0; wind.connect(f); f.connect(windGain); windGain.connect(master); wind.start();
      amb = ctx.createBufferSource(); amb.buffer = buf; amb.loop = true; amb.playbackRate.value = 0.5;
      const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 260;
      ambGain = ctx.createGain(); ambGain.gain.value = 0.05; amb.connect(lf); lf.connect(ambGain); ambGain.connect(master); amb.start();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(o) {
    if (!ctx || getVolume() <= 0) return;
    const now = ctx.currentTime;
    if (o.id) { if (now - (last.get(o.id) || -1) < (o.gap ?? 0.05)) return; last.set(o.id, now); }
    const d = o.d ?? 0.15, g = ctx.createGain();
    g.gain.setValueAtTime(o.v ?? 0.15, now); g.gain.exponentialRampToValueAtTime(0.0001, now + d); g.connect(master);
    if (o.noise) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * d)), buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      if (o.f) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.f; src.connect(bp); bp.connect(g); } else src.connect(g);
      src.start(now); return;
    }
    const osc = ctx.createOscillator(); osc.type = o.type || 'triangle'; osc.frequency.setValueAtTime(o.f ?? 440, now);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), now + d);
    osc.connect(g); osc.start(now); osc.stop(now + d + 0.02);
  }
  const arp = (fs, step = 0.08, type = 'triangle', v = 0.1) => fs.forEach((f, i) => setTimeout(() => tone({ f, d: step * 2.2, type, v }), i * step * 1000));
  return {
    unlock: ensure,
    setVolume(v) { if (master) master.gain.value = v; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    /** viento según velocidad (0..1) y altura */
    setSpeed(k) { if (windGain) windGain.gain.setTargetAtTime(Math.min(0.32, k * k * 0.32), ctx.currentTime, 0.15); },
    step(k = 1) { tone({ f: 900 * k, d: 0.05, v: 0.035, noise: true, id: 'step', gap: 0.18 }); },
    jump(k = 1) { tone({ f: 260 * k, f2: 520 * k, d: 0.16, type: 'sine', v: 0.09, id: 'jump', gap: 0.08 }); },
    superJump(k) { tone({ f: 180, f2: 900 + 500 * k, d: 0.45, type: 'sawtooth', v: 0.07 }); tone({ d: 0.4, v: 0.08, noise: true, f: 1200 }); },
    land(k = 1) { tone({ f: 120, f2: 60, d: 0.14 * k, type: 'square', v: 0.06 * k, id: 'land', gap: 0.1 }); tone({ d: 0.12 * k, v: 0.05 * k, noise: true, f: 400 }); },
    cable() { tone({ f: 1400, f2: 300, d: 0.25, type: 'sawtooth', v: 0.06 }); tone({ d: 0.18, v: 0.06, noise: true, f: 3000 }); },
    whoosh(k = 1) { tone({ d: 0.4, v: 0.08 * k, noise: true, f: 800, id: 'whoosh', gap: 0.2 }); },
    pulse() { tone({ f: 600, f2: 1600, d: 0.22, type: 'sine', v: 0.09 }); tone({ d: 0.2, v: 0.05, noise: true, f: 4000 }); },
    hurt() { tone({ f: 300, f2: 120, d: 0.25, type: 'square', v: 0.07, id: 'hurt', gap: 0.2 }); },
    denied() { tone({ f: 180, d: 0.1, type: 'square', v: 0.05, id: 'denied', gap: 0.25 }); },
    medal() { arp([988, 1318, 1568], 0.06, 'square', 0.06); },
    stun() { tone({ f: 900, f2: 200, d: 0.5, type: 'sawtooth', v: 0.06 }); arp([1200, 900, 1200], 0.06, 'sine', 0.05); },
    drone(k) { tone({ f: 220 + k * 80, d: 0.12, type: 'sawtooth', v: 0.012 + k * 0.02, id: 'drone', gap: 0.1 }); },
    beep() { tone({ f: 1200, d: 0.08, type: 'square', v: 0.05, id: 'beep', gap: 0.15 }); },
    stomp() { tone({ f: 70, f2: 40, d: 0.5, type: 'sawtooth', v: 0.14 }); tone({ d: 0.4, v: 0.12, noise: true, f: 200 }); },
    horn() { tone({ f: 420, d: 0.25, type: 'square', v: 0.04, id: 'horn', gap: 1.5 }); setTimeout(() => tone({ f: 380, d: 0.3, type: 'square', v: 0.04 }), 260); },
    car(k) { tone({ f: 60 + k * 30, d: 0.12, type: 'sawtooth', v: 0.01 * k, id: 'car', gap: 0.12 }); },
    talk() { tone({ f: 500 + Math.random() * 300, d: 0.05, type: 'square', v: 0.03, id: 'talk', gap: 0.07 }); },
    ui() { tone({ f: 760, d: 0.05, type: 'square', v: 0.05 }); },
    quest() { arp([523, 659, 784, 1046], 0.09, 'triangle', 0.09); },
    win() { arp([523, 659, 784, 1046, 1318, 1568], 0.1, 'square', 0.08); },
    checkpoint() { arp([784, 1046], 0.07, 'sine', 0.08); },
  };
}
