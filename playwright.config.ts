import { defineConfig, devices } from '@playwright/test';

const PORT = 3041;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Reuse the installed Chrome so no browser download is needed. Set
    // PW_CHROMIUM to a Chromium binary to run somewhere without Chrome.
    ...(process.env.PW_CHROMIUM ? {} : { channel: 'chrome' }),
    trace: 'retain-on-failure',
    video: 'off',
    launchOptions: {
      ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
      args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run build && PORT=${PORT} DB_FILE=:memory: COOKIE_SECURE=0 npm start`,
    port: PORT,
    // Always start fresh: reusing a server can silently test a stale build.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
