// @ts-check
import { expect } from '@playwright/test';

/** Abre una página del arcade sin la intro de marca y junta errores de consola/página. */
export async function openGame(page, file, { intro = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (!intro) {
    await page.addInitScript(() => { try { sessionStorage.setItem('ml-intro:' + location.pathname, '1'); } catch (e) {} });
  }
  await page.goto('/' + file);
  return { errors };
}

/** Falla si hubo errores (ignora fallos de red de fuentes externas, que no dependen del juego). */
export function expectNoErrors(errors) {
  const real = errors.filter(e => !/fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|net::ERR_INTERNET_DISCONNECTED/.test(e));
  expect(real, real.join('\n')).toEqual([]);
}

/** Avanza el tiempo real N ms (los juegos usan requestAnimationFrame). */
export const wait = (page, ms) => page.waitForTimeout(ms);

/** Estado del SDK compartido. */
export const sdk = page => page.evaluate(() => ({
  paused: window.MLArcade?.isPaused?.() ?? null,
  telemetry: JSON.parse(localStorage.getItem('ml:telemetry') || '[]').map(e => e.type),
}));
