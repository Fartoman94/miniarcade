// Mateo: Ciudad de Altura — telemetría de cuadros y perfil gráfico adaptativo.
// Guarda los últimos 240 tiempos de cuadro (p50/p95/p99/peor/FPS). En modo «Automática» ajusta cada 2 s, con histéresis:
//  · p95 por encima de 1,3 × presupuesto en 2 ventanas seguidas → baja la resolución interna 15 % (mín. 0,55);
//    si ya está al mínimo, baja un nivel de calidad (alta → media → baja) y vuelve a 0,85.
//  · 4 ventanas buenas (p95 ≤ 1,1 × presupuesto) → sube la resolución 10 % hasta 1; volver a subir de nivel exige
//    8 ventanas buenas y 30 s sin bajar; si un nivel ya falló dos veces queda bloqueado (sin vaivenes).
// Presupuesto: 16,7 ms (60 FPS) en PC, 33,3 ms (30 FPS) en táctiles. No toca el HUD (DOM) ni la física (paso fijo).
const LEVELS = ['low', 'medium', 'high'];

export function createPerfMon({ getQuality, setQuality, setScale, touch }) {
  const N = 240, buf = new Float32Array(N);
  let n = 0, i = 0;
  const A = { enabled: false, scale: 1, bad: 0, good: 0, win: 0, sinceDown: 1e9, fails: {}, log: [] };
  const budget = touch ? 1000 / 30 : 1000 / 60;
  let since = 0; // segundos desde el último reinicio de ventana
  function record(ms) { buf[i] = ms; i = (i + 1) % N; n = Math.min(N, n + 1); }
  function stats() {
    if (!n) return { n: 0, fps: 0, p50: 0, p95: 0, p99: 0, worst: 0 };
    const s = Array.from(buf.subarray(0, n)).sort((a, b) => a - b), q = p => s[Math.min(n - 1, Math.floor(p * n))];
    const mean = s.reduce((a, b) => a + b, 0) / n;
    return { n, fps: +(1000 / mean).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), worst: +s[n - 1].toFixed(1) };
  }
  function note(what) { A.log.push({ t: +(performance.now() / 1000).toFixed(1), what }); if (A.log.length > 20) A.log.shift(); }
  function evaluate() {
    const st = stats();
    if (st.n < 60 && !(since >= 6 && st.n >= 6)) return; // equipos muy lentos: alcanza con 6 s y 6 cuadros
    const q = getQuality(), li = LEVELS.indexOf(q);
    if (st.p95 > budget * 1.3) { A.bad++; A.good = 0; } else if (st.p95 <= budget * 1.1) { A.good++; A.bad = 0; } else { A.bad = 0; A.good = 0; }
    if (A.bad >= 2) {
      A.bad = 0;
      if (A.scale > 0.56) { A.scale = Math.max(0.55, +(A.scale - 0.15).toFixed(2)); setScale(A.scale); note(`resolución ${A.scale}`); }
      else if (li > 0) { A.fails[q] = (A.fails[q] || 0) + 1; A.scale = 0.85; setQuality(LEVELS[li - 1]); setScale(A.scale); A.sinceDown = 0; note(`calidad ${LEVELS[li - 1]}`); }
      n = 0; i = 0; since = 0; // ventana nueva tras cada cambio
    } else if (A.good >= 4 && A.scale < 1) { A.good = 0; A.scale = Math.min(1, +(A.scale + 0.1).toFixed(2)); setScale(A.scale); note(`resolución ${A.scale}`); n = 0; i = 0; since = 0; }
    else if (A.good >= 8 && A.scale >= 1 && li < LEVELS.length - 1 && A.sinceDown > 30 && (A.fails[LEVELS[li + 1]] || 0) < 2 && A.upTo && LEVELS.indexOf(A.upTo) > li) {
      A.good = 0; A.scale = 0.85; setQuality(LEVELS[li + 1]); setScale(A.scale); note(`calidad ${LEVELS[li + 1]}`); n = 0; i = 0; since = 0;
    }
  }
  return {
    record, stats, budget,
    /** dt en segundos de tiempo real de juego (no corre en pausa) */
    tick(dt) { A.sinceDown += dt; since += dt; if (!A.enabled) return; A.win += dt; if (A.win >= 2) { A.win = 0; evaluate(); } },
    /** activa/desactiva el modo automático; upTo = nivel máximo al que puede volver (el elegido al arrancar) */
    setAuto(on, upTo) { A.enabled = on; A.upTo = upTo; A.bad = A.good = 0; A.win = 0; if (!on && A.scale !== 1) { A.scale = 1; setScale(1); } },
    reset() { n = 0; i = 0; since = 0; },
    get adapt() { return { enabled: A.enabled, scale: A.scale, bad: A.bad, good: A.good, fails: { ...A.fails }, log: A.log.slice() }; },
  };
}
