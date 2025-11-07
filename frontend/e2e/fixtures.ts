/**
 * Playwright test fixtures for cockpit-apt E2E tests
 *
 * Provides authenticated page fixture that logs into Cockpit automatically.
 */

import { test as base } from '@playwright/test';

// Extend test with authenticated page fixture
export const test = base.extend({
  // Override page fixture to automatically log in
  page: async ({ page }, use) => {
    // Navigate to Cockpit login
    await page.goto('/');

    // Login with test credentials
    await page.fill('#login-user-input', 'claude');
    await page.fill('#login-password-input', 'claude123');
    await page.click('#login-button');

    // Wait for Cockpit dashboard to load (navigation sidebar visible)
    await page.waitForSelector('nav a:has-text("Overview")', { timeout: 15000 });

    // Navigate to APT module
    await page.goto('/apt');

    // Wait for APT module to load (look for Search tab or search input)
    await page.waitForSelector('[role="tab"]:has-text("Search"), input[placeholder*="Search"]', { timeout: 15000 });

    // Use the authenticated page
    await use(page);
  },
});

export { expect } from '@playwright/test';
