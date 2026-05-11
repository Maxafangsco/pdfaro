import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for PDFaro.
 *
 * Runs against the local Next.js dev server (auto-started if not already
 * running). Chromium is the primary browser; Firefox and WebKit can be
 * enabled below for full cross-browser coverage.
 *
 * Quick reference
 * ---------------
 *   npm run test:e2e          – headless Chromium
 *   npm run test:e2e:headed   – visible Chromium
 *   npm run test:e2e:ui       – Playwright UI explorer
 *   npm run test:e2e:debug    – step-through debugger
 *   npx playwright show-report – open last HTML report
 */
export default defineConfig({
  // ── Test discovery ──────────────────────────────────────────────────────────
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  // ── Parallelism ─────────────────────────────────────────────────────────────
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,

  // ── Retries ─────────────────────────────────────────────────────────────────
  // Retry once in CI to absorb transient flakes; no retries locally.
  retries: process.env.CI ? 1 : 0,

  // ── Reporting ───────────────────────────────────────────────────────────────
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ...(process.env.CI ? [['github'] as ['github']] : []),
  ],

  // ── Global test options ──────────────────────────────────────────────────────
  use: {
    baseURL: 'http://localhost:3000',

    // Capture artefacts on failure only.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // Generous timeout for WASM-heavy tools.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  // ── Global timeout per test ──────────────────────────────────────────────────
  timeout: 60_000,
  expect: { timeout: 15_000 },

  // ── Output ──────────────────────────────────────────────────────────────────
  outputDir: 'test-results',

  // ── Browser projects ────────────────────────────────────────────────────────
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // COEP/COOP headers are required for SharedArrayBuffer (LibreOffice WASM).
        // Chromium respects them correctly in headless mode.
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },

    // Uncomment to enable Firefox and WebKit locally:
    // { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',   use: { ...devices['Desktop Safari'] } },

    // Mobile viewports (optional):
    // { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    // { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],

  // ── Dev server ──────────────────────────────────────────────────────────────
  // Automatically start `npm run dev` when tests are launched, then tear it
  // down afterwards.  Uses `reuseExistingServer: true` so running `npm run dev`
  // manually first (recommended for speed) skips the auto-start.
  webServer: {
    // In CI, run against `npm start` (production build); locally use `npm run dev`.
    command: process.env.PLAYWRIGHT_WEB_SERVER_CMD ?? 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // Turbopack first-boot can be slow
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
