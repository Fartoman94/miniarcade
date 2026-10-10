// @ts-check
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.ML_PORT || 8765);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: process.env.CI ? 120_000 : 60_000,
  // CI (2 núcleos, WebGL por software): esperas más largas y 1 reintento; los reintentos quedan como «flaky» en el reporte
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: process.env.CI ? 20_000 : 5_000 },
  // Los juegos 3D usan WebGL por software en headless: pocos workers para no saturar la CPU.
  workers: Number(process.env.ML_WORKERS || 3),
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: true,
  },
});
