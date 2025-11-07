/**
 * E2E tests for sections navigation
 */

import { test, expect } from './fixtures';

test.describe('Sections Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Sections tab
    await page.click('[role="tab"]:has-text("Sections")');
    await page.waitForLoadState('networkidle');
  });

  test('should display sections view', async ({ page }) => {
    await expect(page.locator('h1:has-text("Browse by Section")')).toBeVisible();
    await expect(page.locator('text=/\\d+ sections? available/')).toBeVisible();
  });

  test('should display section cards', async ({ page }) => {
    // Should have multiple section cards
    const cards = page.locator('[role="button"]').filter({ hasText: 'packages' });
    await expect(cards.first()).toBeVisible();

    // Each card should have a package count
    await expect(cards.first().locator('text=/\\d+ packages?/')).toBeVisible();
  });

  test('should navigate to section packages on click', async ({ page }) => {
    // Click on first section card
    const firstCard = page.locator('[role="button"]').filter({ hasText: 'packages' }).first();
    const sectionName = await firstCard.locator('strong').textContent();

    await firstCard.click();

    // Should show package list for that section
    await expect(page.locator(`text=Packages in ${sectionName}`)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate section with keyboard', async ({ page }) => {
    // Focus first section card
    const firstCard = page.locator('[role="button"]').filter({ hasText: 'packages' }).first();
    await firstCard.focus();

    // Press Enter to activate
    await page.keyboard.press('Enter');

    // Should navigate to section packages
    await expect(page.locator('text=/Packages in/')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate through sections with Tab key', async ({ page }) => {
    // Tab to first card
    await page.keyboard.press('Tab');

    // Get focused element
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'));

    // Should be a button (section card)
    expect(focused).toBe('button');
  });
});

test.describe('Section Package List', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Sections
    await page.click('[role="tab"]:has-text("Sections")');
    await page.waitForLoadState('networkidle');

    // Click first section
    await page.locator('[role="button"]').filter({ hasText: 'packages' }).first().click();
    await page.waitForLoadState('networkidle');
  });

  test('should display package list', async ({ page }) => {
    await expect(page.locator('text=/Packages in/')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('should navigate to package details', async ({ page }) => {
    // Click first package in the table
    await page.locator('table tr').nth(1).click();

    // Should show package details
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate back with Back button', async ({ page }) => {
    // Should have Back button
    const backButton = page.locator('button:has-text("Back")');
    await expect(backButton).toBeVisible();

    await backButton.click();

    // Should return to sections view
    await expect(page.locator('h1:has-text("Browse by Section")')).toBeVisible();
  });
});
