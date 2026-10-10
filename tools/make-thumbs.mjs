// Genera games/thumbs/<id>.webp (480×270) con capturas reales de la pantalla inicial de cada juego.
// Uso: node tools/make-thumbs.mjs [id...]   (servidor estático en :8765)
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GAMES } from '../games/registry.js';

const BASE = process.env.ML_BASE || 'http://localhost:8765';
const only = process.argv.slice(2);
mkdirSync('games/thumbs', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const g of GAMES.filter(x => !only.length || only.includes(x.id))) {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('ml-intro:' + location.pathname, '1'); } catch (e) {} });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${g.file}`);
  await p.waitForTimeout(g.heavy ? 6000 : 2500);
  // ocultar la barra del SDK y chips de misiones: la miniatura muestra el juego
  await p.addStyleTag({ content: '.mla-bar,.mlm-hud,.mla-fps{display:none!important}' });
  await p.waitForTimeout(300);
  const png = await p.screenshot({ type: 'png' });
  // reescalar y codificar a WebP en el propio navegador
  const webp = await p.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = 480; c.height = 270;
    c.getContext('2d').drawImage(img, 0, 0, 480, 270);
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.8));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s);
  }, png.toString('base64'));
  writeFileSync(`games/thumbs/${g.id}.webp`, Buffer.from(webp, 'base64'));
  console.log('ok', g.id, Buffer.from(webp, 'base64').length, 'bytes');
  await ctx.close();
}
await b.close();
