// Genera matelabs/characters/mati_{idle,run,jump,turn}.webp a partir de los GLB.
// Requiere el servidor estático en :8765 (npm run serve).
import { chromium } from '@playwright/test';
const BASE = process.env.ML_BASE || 'http://localhost:8765';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', e => console.error(e.message));
await p.goto(`${BASE}/tools/render-mati-sprites.html`);
await p.waitForFunction(() => window.__sprites || window.__spritesErr, null, { timeout: 60000 });
const err = await p.evaluate(() => window.__spritesErr);
if (err) throw new Error(err);
// Componer y codificar a WebP dentro del navegador (canvas.toBlob) para no depender de herramientas externas.
const files = await p.evaluate(async () => {
  const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const enc = cv => new Promise(r => cv.toBlob(bl => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(bl); }, 'image/webp', 0.9));
  const sp = window.__sprites, out = {};
  for (const k of ['idle', 'run', 'jump']) {
    const im = await load(sp[k]); const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    cv.getContext('2d').drawImage(im, 0, 0, 128, 128); out[k] = await enc(cv);
  }
  const cv = document.createElement('canvas'); cv.width = 128 * 16; cv.height = 128; const c = cv.getContext('2d');
  for (let i = 0; i < 16; i++) c.drawImage(await load(sp.turn[i]), i * 128, 0, 128, 128);
  out.turn = await enc(cv);
  return out;
});
const { writeFileSync } = await import('node:fs');
for (const [k, v] of Object.entries(files)) { writeFileSync(`matelabs/characters/mati_${k}.webp`, Buffer.from(v, 'base64')); console.log('ok', k, Buffer.from(v, 'base64').length, 'bytes'); }
await b.close();
