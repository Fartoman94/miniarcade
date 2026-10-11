// Auditoría móvil de todos los juegos del registro (y el portal).
// Para cada página y viewport de celular: carga con emulación táctil, captura el menú, intenta arrancar
// tocando el botón principal, captura en juego y mide problemas objetivos:
//  - scroll horizontal/vertical del documento (los juegos deben ocupar la pantalla sin desplazarse)
//  - controles interactivos visibles fuera del viewport o tapados
//  - objetivos táctiles chicos (< 40 px de lado)
//  - texto chico (< 11 px)
//  - errores de consola / de página
// Uso: node tools/mobile-audit.mjs [id...]   (servidor en :8765). Salida: .perf/mobile-audit/
import { chromium, devices } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GAMES } from '../games/registry.js';

const BASE = process.env.ML_BASE || 'http://localhost:8765';
const OUT = '.perf/mobile-audit/';
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const VIEWS = [
  { tag: 'chico', viewport: { width: 360, height: 640 }, dpr: 2 },
  { tag: 'vertical', viewport: { width: 412, height: 915 }, dpr: 2.625 },
  { tag: 'apaisado', viewport: { width: 915, height: 412 }, dpr: 2.625 },
];
const pages = [{ id: 'portal', file: 'index.html?nosw' }, ...GAMES.filter(g => !only.length || only.includes(g.id))].filter(p => !only.length || only.includes(p.id) || (p.id === 'portal' && only.includes('portal')));

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = {};

/** Mide problemas en la página actual. */
const measure = () => {
  const vw = innerWidth, vh = innerHeight, de = document.documentElement;
  const out = { scrollX: de.scrollWidth > vw + 1, scrollY: de.scrollHeight > vh + 1 && getComputedStyle(document.body).overflowY !== 'hidden', offscreen: [], small: [], tinyText: [] };
  const vis = el => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const label = el => (el.getAttribute('aria-label') || el.textContent || el.id || el.className || el.tagName).toString().trim().slice(0, 30);
  for (const el of document.querySelectorAll('button, a[href], [role=button], input, select, .k3-btn, .k3-joy')) {
    if (!vis(el)) continue;
    // ignorar lo que está dentro de pantallas ocultas o la barra accesible de saltar
    if (el.closest('[hidden]') || el.classList.contains('skip')) continue;
    const r = el.getBoundingClientRect();
    const inScrollable = (() => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && p.scrollHeight > p.clientHeight + 2) return true; } return false; })();
    if (!inScrollable && (r.right < 1 || r.bottom < 1 || r.left > vw - 1 || r.top > vh - 1 || r.left < -2 || r.right > vw + 2 || r.bottom > vh + 2 || r.top < -2)) out.offscreen.push(label(el));
    if (Math.min(r.width, r.height) < 40) out.small.push(`${label(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !el.textContent.trim() || !vis(el)) continue;
    if (el.closest('[hidden]')) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 11) out.tinyText.push(`${el.textContent.trim().slice(0, 24)} (${fs}px)`);
  }
  out.small = [...new Set(out.small)].slice(0, 12);
  out.tinyText = [...new Set(out.tinyText)].slice(0, 12);
  out.offscreen = [...new Set(out.offscreen)].slice(0, 12);
  return out;
};

for (const p of pages) {
  report[p.id] = {};
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: v.viewport, deviceScaleFactor: v.dpr, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('ml-intro:' + location.pathname, '1'); localStorage.setItem('ml:settings', JSON.stringify({ quality: 'low' })); } catch (e) {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message.slice(0, 160)));
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_NETWORK_CHANGED/.test(m.text())) errors.push(m.text().slice(0, 160)); });
    let started = false, startNote = '';
    try {
      await page.goto(`${BASE}/${p.file}`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(p.heavy ? 3500 : 1800);
      const menu = await page.evaluate(measure);
      await page.screenshot({ path: `${OUT}${p.id}-${v.tag}-menu.png` });
      let play = null;
      if (p.id !== 'portal') {
        // botón principal: el primero visible que parezca «jugar/empezar» (o el foco)
        const cand = page.locator('button, a, [role=button], [data-go], [data-a="go"]').filter({ hasText: /jugar|comenzar|empezar|volar|correr|defender|a la ruta|torneo|inmersi|expedici|toca|continuar|play|start|misi|reino|valle|ruta/i }).first();
        if (await cand.count()) { await cand.tap({ timeout: 4000 }).then(() => { started = true; }).catch(e => { startNote = 'tap falló: ' + String(e.message).slice(0, 60); }); }
        if (!started) { await page.touchscreen.tap(v.viewport.width / 2, v.viewport.height / 2).then(() => { started = true; startNote = startNote || 'tap al centro'; }).catch(() => {}); }
        await page.waitForTimeout(p.heavy ? 4000 : 2000);
        play = await page.evaluate(measure);
        await page.screenshot({ path: `${OUT}${p.id}-${v.tag}-play.png` });
      }
      report[p.id][v.tag] = { menu, play, started, startNote, errors: [...new Set(errors)].slice(0, 5) };
    } catch (e) {
      report[p.id][v.tag] = { fatal: String(e.message).slice(0, 200), errors };
    }
    console.log(p.id, v.tag, JSON.stringify({ err: report[p.id][v.tag].errors?.length, scrollX: report[p.id][v.tag].menu?.scrollX, off: report[p.id][v.tag].play?.offscreen?.length ?? report[p.id][v.tag].menu?.offscreen?.length, small: report[p.id][v.tag].play?.small?.length }));
    await ctx.close();
  }
}
await browser.close();
writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 2));
console.log('listo:', OUT + 'report.json');
