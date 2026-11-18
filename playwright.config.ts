import { defineConfig, devices } from '@playwright/test';

// The app tests run against the fixture texture set (src/textures/fixture.json).
export default defineConfig({
  testDir: 'tests',
  // Every test opens its own page, so tests run side by side. Two workers keep SwiftShader from starving.
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 60_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 800 },
    // Headless Chromium has no GPU, so WebGL2 runs on SwiftShader.
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    env: { VITE_ASSET_SET: 'fixture' },
    reuseExistingServer: false,
  },
});
