/**
 * Playwright E2E Test Configuration
 *
 * Tests the cockpit-apt UI in a real Cockpit environment.
 * Requires Cockpit to be running on halos.local:9090.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter to use
  reporter: [
    ['html'],
    ['list']
  ],

  use: {
    // Base URL for tests
    baseURL: 'https://halos.local:9090',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Ignore HTTPS errors (self-signed cert)
    ignoreHTTPSErrors: true,
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run local dev server before tests (optional)
  // webServer: {
  //   command: 'npm run dev',
  //   port: 9090,
  //   reuseExistingServer: !process.env.CI,
  // },
});
