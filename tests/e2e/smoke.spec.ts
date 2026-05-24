/**
 * Smoke tests — Phase 5
 *
 * Fast, high-confidence checks that the app loads, core navigation works,
 * and the homepage search is functional.  These run first in CI and gate
 * the more expensive tool-flow tests.
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en');
    await page.waitForLoadState('networkidle');
  });

  test('loads and shows hero section', async ({ page }) => {
    await expect(page).toHaveTitle(/PDFaro|PDF/i);
    // Hero search is present
    await expect(page.getByTestId('hero-search-form')).toBeVisible();
    await expect(page.getByTestId('hero-search-input')).toBeVisible();
  });

  test('hero search navigates to /en/tools with query', async ({ page }) => {
    const input = page.getByTestId('hero-search-input');
    await input.fill('merge');
    await page.getByTestId('hero-search-form').locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/en\/tools\?q=merge/);
  });

  test('hero search accepts Enter key', async ({ page }) => {
    const input = page.getByTestId('hero-search-input');
    await input.fill('compress');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/en\/tools\?q=compress/);
  });

  test('tool cards are rendered', async ({ page }) => {
    const cards = page.getByTestId('tool-card');
    await expect(cards.first()).toBeVisible();
    // At least 5 cards expected
    await expect(cards).toHaveCount({ minimum: 5 } as never);
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Tools directory
// ---------------------------------------------------------------------------

test.describe('Tools directory (/en/tools)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/tools');
    await page.waitForLoadState('networkidle');
  });

  test('loads and shows tool cards', async ({ page }) => {
    await expect(page.getByTestId('tool-card').first()).toBeVisible();
  });

  test('search filters tool cards', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();
    await searchInput.fill('merge');
    // At least one card matches
    await expect(page.getByTestId('tool-card').first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Header navigation
// ---------------------------------------------------------------------------

test.describe('Header navigation', () => {
  test('desktop nav links resolve correctly', async ({ page }) => {
    await page.goto('/en');
    // Tools link
    await page.getByRole('link', { name: /tools/i }).first().click();
    await expect(page).toHaveURL(/\/en\/tools/);
  });

  test('mobile menu opens and closes', async ({ page }) => {
    // Use a narrow viewport to trigger mobile layout
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/en');
    await page.waitForLoadState('networkidle');

    const toggleBtn = page.getByTestId('mobile-menu-button');
    await expect(toggleBtn).toBeVisible();

    // Open
    await toggleBtn.click();
    await expect(page.getByTestId('mobile-menu')).toBeVisible();

    // Close
    await toggleBtn.click();
    await expect(page.getByTestId('mobile-menu')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Individual tool pages load
// ---------------------------------------------------------------------------

const TOOL_SLUGS = [
  'merge-pdf',
  'compress-pdf',
  'split-pdf',
  'rotate-pdf',
  'image-to-pdf',
  'protect-pdf',
  'watermark-pdf',
  'pdf-to-image',
  'sign-pdf',
  'edit-pdf',
];

for (const slug of TOOL_SLUGS) {
  test(`/en/tools/${slug} loads without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/en/tools/${slug}`);
    await page.waitForLoadState('networkidle');

    // Page should render (tool-page data-testid present)
    await expect(page.getByTestId('tool-page')).toBeVisible();

    // No unhandled JS errors
    expect(errors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
}

// ---------------------------------------------------------------------------
// Static pages
// ---------------------------------------------------------------------------

test.describe('Static pages', () => {
  for (const path of ['/en/about', '/en/faq', '/en/privacy', '/en/contact']) {
    test(`${path} loads`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expect(page).not.toHaveURL(/404|error/i);
    });
  }
});
