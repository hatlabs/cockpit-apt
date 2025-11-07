/**
 * E2E tests for package search functionality
 */

import { test, expect } from './fixtures';

test.describe('Package Search', () => {
  test('should display search view by default', async ({ page }) => {
    await expect(page.locator('h2:has-text("Search Packages")')).toBeVisible();
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  test('should show hint for short queries', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Type 1 character
    await searchInput.fill('n');

    // Should show minimum length hint
    await expect(page.locator('text=Type at least 2 characters')).toBeVisible();
  });

  test('should search and display results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Search for nginx
    await searchInput.fill('nginx');

    // Wait for search to complete (debounced)
    await page.waitForTimeout(500);

    // Should display results
    await expect(page.locator('text=nginx').first()).toBeVisible();

    // Should show result count
    await expect(page.locator('text=/Showing \\d+ result/')).toBeVisible();
  });

  test('should clear search with Escape key', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Type search query
    await searchInput.fill('nginx');
    await expect(searchInput).toHaveValue('nginx');

    // Press Escape
    await searchInput.press('Escape');

    // Should clear the input
    await expect(searchInput).toHaveValue('');
  });

  test('should search immediately with Enter key', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Type partial query
    await searchInput.fill('ng');

    // Press Enter immediately (don't wait for debounce)
    await searchInput.press('Enter');

    // Should show results
    await expect(page.locator('table').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show empty state for no results', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Search for something that doesn't exist
    await searchInput.fill('xyznonexistentpackage123');

    // Wait for search
    await page.waitForTimeout(500);

    // Should show empty state
    await expect(page.locator('text=No results found')).toBeVisible();
  });

  test('should navigate to package details on click', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Search for nginx
    await searchInput.fill('nginx');
    await page.waitForTimeout(500);

    // Click on first result
    await page.locator('table tr').nth(1).click();

    // Should navigate to package details
    await expect(page.locator('h1:has-text("nginx")')).toBeVisible({ timeout: 5000 });
  });
});
