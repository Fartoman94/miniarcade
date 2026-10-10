// Mide cada página del arcade en Chromium headless: tiempos de carga, bytes transferidos,
// FPS en el menú, tareas largas, heap JS y errores de consola.
// Uso: node tests/perf/measure.mjs [etiqueta] [pagina...]   (servidor en http://localhost:8765)
// Las cifras de FPS en headless usan SwiftShader (render por CPU): sirven para comparar
// antes/después en la misma máquina, no como FPS reales de un dispositivo.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.ML_BASE || 'http://localhost:8765';
const label = process.argv[2] || 'run';
const PAGES = process.argv.slice(3).length ? process.argv.slice(3) : [
  'index', 'clavado', 'fruta_furia', 'muerte_gloriosa', 'NEON_SURVIVOR',
  'Salva_al_rey', 'torre_infinita', 'turbo_furia', 'valle_encantado'];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const results = {};
for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // saltear la intro de marca para medir sólo el juego
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ml-intro:' + location.pathname, '1'); } catch (e) {} });
  const page = await ctx.newPage();
  const errors = [];
  let bytes = 0, requests = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', async r => { requests++; try { const b = await r.body(); bytes += b.length; } catch (e) {} });
  const url = p === 'index' ? `${BASE}/index.html` : (p.includes('/') ? `${BASE}/${p}` : `${BASE}/${p}.html`);
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => {
    window.__lt = 0;
    try { new PerformanceObserver(l => { window.__lt += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => new Promise(res => {
    let frames = 0; const t0 = performance.now(); let worst = 0, last = t0;
    function f(t) { frames++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 4000) requestAnimationFrame(f); else {
      const nav = performance.getEntriesByType('navigation')[0];
      res({ fps: +(frames / ((t - t0) / 1000)).toFixed(1), worstFrameMs: +worst.toFixed(1),
        dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        longTasks: window.__lt, domNodes: document.getElementsByTagName('*').length });
    } }
    requestAnimationFrame(f);
  }));
  results[p] = { ...m, requests, kb: Math.round(bytes / 1024), errors };
  console.log(p, JSON.stringify(results[p]));
  await ctx.close();
}
await browser.close();
mkdirSync('.perf', { recursive: true });
writeFileSync(`.perf/${label}.json`, JSON.stringify(results, null, 2));
