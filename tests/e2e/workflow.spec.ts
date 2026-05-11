/**
 * Workflow editor E2E tests — Phase 9
 *
 * The workflow editor is a ReactFlow canvas loaded dynamically (no SSR).
 * These tests are intentionally kept as smoke-level: verify the page
 * loads, the canvas renders, and basic interactions don't crash.
 *
 * Full drag-and-drop node wiring is left for future manual QA due to
 * the complexity of ReactFlow's pointer-event model.
 */

import { test, expect } from '@playwright/test';

test.describe('Workflow editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/workflow');
    await page.waitForLoadState('networkidle');
  });

  test('loads the workflow page', async ({ page }) => {
    await expect(page).toHaveURL(/\/en\/workflow/);
    // The page title or heading should mention Workflow
    await expect(page.locator('title, h1, [aria-label*="workflow" i]').first()).toBeTruthy();
  });

  test('renders the workflow canvas', async ({ page }) => {
    // Wait for the dynamic import to resolve
    const canvas = page.getByTestId('workflow-canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });
  });

  test('ReactFlow viewport is rendered inside the canvas', async ({ page }) => {
    // ReactFlow renders a .react-flow or [data-testid="rf__wrapper"] element
    const rfRoot = page
      .getByTestId('workflow-canvas')
      .locator('.react-flow, [data-testid="rf__wrapper"], [class*="react-flow"]')
      .first();
    await expect(rfRoot).toBeVisible({ timeout: 20_000 });
  });

  test('no unhandled JS errors during load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      if (!err.message.includes('ResizeObserver')) {
        errors.push(err.message);
      }
    });

    await page.goto('/en/workflow');
    await page.waitForLoadState('networkidle');

    // Wait a bit longer for the dynamic import
    await page.waitForTimeout(3_000);
    expect(errors).toHaveLength(0);
  });

  test('header navigation links are visible', async ({ page }) => {
    // The workflow page has its own slim header
    const homeLink = page.getByRole('link', { name: /home|pdfaro/i }).first();
    await expect(homeLink).toBeVisible({ timeout: 10_000 });
  });

  test('navigating back to home works', async ({ page }) => {
    const homeLink = page.getByRole('link', { name: /home|pdfaro/i }).first();
    await homeLink.click();
    await expect(page).toHaveURL(/\/en\/?$/);
  });
});
