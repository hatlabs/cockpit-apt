/**
 * E2E tests for keyboard navigation and accessibility
 */

import { test, expect } from './fixtures';

test.describe('Keyboard Navigation', () => {
  test('should navigate tabs with keyboard', async ({ page }) => {
    // Click Search tab to ensure it's active
    await page.click('[role="tab"]:has-text("Search")');

    // Tab through navigation
    await page.keyboard.press('Tab'); // Into search input
    await page.keyboard.press('Shift+Tab'); // Back to nav
    await page.keyboard.press('ArrowRight'); // Next tab

    // Sections tab should be focused
    const activeTab = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.textContent?.trim();
    });

    expect(activeTab).toContain('Sections');
  });

  test('should activate search with Enter key', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Type and press Enter
    await searchInput.fill('nginx');
    await searchInput.press('Enter');

    // Should show results immediately
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
  });

  test('should clear search with Escape key', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');

    // Type something
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');

    // Press Escape
    await searchInput.press('Escape');

    // Should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('should navigate package details with Escape', async ({ page }) => {
    // Search and click a package
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('nginx');
    await page.waitForTimeout(500);
    await page.locator('table tr').nth(1).click();

    // Should be on package details
    await expect(page.locator('h1')).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Should go back to search
    await expect(page.locator('h2:has-text("Search Packages")')).toBeVisible();
  });

  test('should activate section cards with Enter key', async ({ page }) => {
    // Navigate to sections
    await page.click('[role="tab"]:has-text("Sections")');
    await page.waitForLoadState('networkidle');

    // Focus first card
    const firstCard = page.locator('[role="button"]').filter({ hasText: 'packages' }).first();
    await firstCard.focus();

    // Press Enter
    await page.keyboard.press('Enter');

    // Should navigate
    await expect(page.locator('text=/Packages in/')).toBeVisible({ timeout: 5000 });
  });

  test('should activate section cards with Space key', async ({ page }) => {
    // Navigate to sections
    await page.click('[role="tab"]:has-text("Sections")');
    await page.waitForLoadState('networkidle');

    // Focus first card
    const firstCard = page.locator('[role="button"]').filter({ hasText: 'packages' }).first();
    await firstCard.focus();

    // Press Space
    await page.keyboard.press('Space');

    // Should navigate
    await expect(page.locator('text=/Packages in/')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Accessibility', () => {
  test('should have proper ARIA labels on navigation', async ({ page }) => {
    const searchTab = page.locator('[role="tab"]:has-text("Search")');
    const sectionsTab = page.locator('[role="tab"]:has-text("Sections")');

    await expect(searchTab).toBeVisible();
    await expect(sectionsTab).toBeVisible();
  });

  test('should have ARIA labels on section cards', async ({ page }) => {
    await page.click('[role="tab"]:has-text("Sections")');
    await page.waitForLoadState('networkidle');

    // First card should have aria-label
    const firstCard = page.locator('[role="button"]').filter({ hasText: 'packages' }).first();
    const ariaLabel = await firstCard.getAttribute('aria-label');

    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('package');
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    // Should have h1 or h2 heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('should focus visible on interactive elements', async ({ page }) => {
    // Tab to search input
    await page.keyboard.press('Tab');

    // Check if element is focused
    const isFocused = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName === 'INPUT';
    });

    expect(isFocused).toBe(true);
  });
});
