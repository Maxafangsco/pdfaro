/**
 * Extended tool-flow E2E tests
 *
 * Covers the next tier of tools not included in tools.spec.ts.
 * All follow the same two-step download pattern:
 *   upload → click action button → wait for DownloadButton → click it
 *
 * Tools without a DownloadButton (view-metadata) assert on visible output
 * instead of a download event.
 */

import { test, expect, type Page, type Download } from '@playwright/test';
import {
  gotoTool,
  uploadFiles,
  uploadPDF,
  waitForProcessing,
  PDF_1,
  PDF_2,
} from './helpers/toolFlow.js';

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

async function processAndDownload(
  page: Page,
  actionTestId: string,
  timeout = 45_000,
): Promise<Download> {
  await page.getByTestId(actionTestId).click();
  await expect(page.getByTestId('download-button')).toBeVisible({ timeout });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout }),
    page.getByTestId('download-button').first().click(),
  ]);
  return download;
}

// ---------------------------------------------------------------------------
// Delete Pages
// ---------------------------------------------------------------------------

test.describe('Delete Pages', () => {
  test('deletes a page and downloads result', async ({ page }) => {
    await gotoTool(page, 'delete-pages');
    await uploadPDF(page, PDF_2); // 2-page PDF — we can delete page 1

    // Select page 1 for deletion via thumbnail (aria-label="Page 1")
    const page1Thumb = page.locator('[aria-label="Page 1"], [aria-label^="Page 1 "]').first();
    await expect(page1Thumb).toBeVisible({ timeout: 15_000 });
    await page1Thumb.click();

    await expect(page.getByTestId('delete-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'delete-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Extract Pages
// ---------------------------------------------------------------------------

test.describe('Extract Pages', () => {
  test('extracts pages and downloads result', async ({ page }) => {
    await gotoTool(page, 'extract-pages');
    await uploadPDF(page, PDF_2);

    // The tool renders page thumbnails with aria-label="Page N".
    // Wait for page 1 thumbnail to appear after PDF.js renders, then click it.
    const page1Thumb = page.locator('[aria-label="Page 1"], [aria-label^="Page 1 "]').first();
    await expect(page1Thumb).toBeVisible({ timeout: 15_000 });
    await page1Thumb.click();

    await expect(page.getByTestId('extract-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'extract-button');
    expect(download.suggestedFilename()).toMatch(/\.(pdf|zip)$/i);
  });
});

// ---------------------------------------------------------------------------
// Decrypt PDF
// ---------------------------------------------------------------------------

test.describe('Decrypt PDF', () => {
  test('loads decrypt-pdf page and shows file uploader', async ({ page }) => {
    // Note: our test PDFs are not password-protected, so we just verify
    // the UI loads correctly.  A full decrypt test would require a fixture
    // PDF encrypted with a known password.
    await gotoTool(page, 'decrypt-pdf');
    await expect(page.getByTestId('file-uploader')).toBeVisible({ timeout: 10_000 });
  });

  test('shows password field after upload', async ({ page }) => {
    await gotoTool(page, 'decrypt-pdf');
    await uploadPDF(page, PDF_1);
    // Either an error appears (not encrypted) or a password input is shown
    const passwordInput = page.locator('input[type="password"]');
    const errorAlert = page.getByTestId('error-alert');
    await expect(passwordInput.or(errorAlert)).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// Flatten PDF
// ---------------------------------------------------------------------------

test.describe('Flatten PDF', () => {
  test('flattens a PDF and downloads result', async ({ page }) => {
    await gotoTool(page, 'flatten-pdf');
    await uploadPDF(page, PDF_1);

    await expect(page.getByTestId('flatten-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'flatten-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Page Numbers
// ---------------------------------------------------------------------------

test.describe('Page Numbers', () => {
  test('adds page numbers and downloads result', async ({ page }) => {
    await gotoTool(page, 'page-numbers');
    await uploadPDF(page, PDF_1);

    await expect(page.getByTestId('page-numbers-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'page-numbers-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Repair PDF
// ---------------------------------------------------------------------------

test.describe('Repair PDF', () => {
  test('repairs a PDF and downloads result', async ({ page }) => {
    await gotoTool(page, 'repair-pdf');
    await uploadPDF(page, PDF_1);

    await expect(page.getByTestId('repair-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'repair-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Remove Restrictions
// ---------------------------------------------------------------------------

test.describe('Remove Restrictions', () => {
  test('removes restrictions and downloads result', async ({ page }) => {
    await gotoTool(page, 'remove-restrictions');
    await uploadPDF(page, PDF_1);

    await expect(page.getByTestId('remove-restrictions-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'remove-restrictions-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Add Blank Page
// ---------------------------------------------------------------------------

test.describe('Add Blank Page', () => {
  test('adds a blank page and downloads result', async ({ page }) => {
    await gotoTool(page, 'add-blank-page');
    await uploadPDF(page, PDF_1);

    await expect(page.getByTestId('add-blank-page-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'add-blank-page-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Reverse Pages
// ---------------------------------------------------------------------------

test.describe('Reverse Pages', () => {
  test('reverses pages and downloads result', async ({ page }) => {
    await gotoTool(page, 'reverse-pages');
    await uploadPDF(page, PDF_2);

    await expect(page.getByTestId('reverse-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'reverse-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// View Metadata  (auto-extracts on upload — no action button)
// ---------------------------------------------------------------------------

test.describe('View Metadata', () => {
  test('extracts and displays PDF metadata after upload', async ({ page }) => {
    await gotoTool(page, 'view-metadata');
    await uploadPDF(page, PDF_1);

    // The tool auto-extracts metadata on file selection and renders
    // a "Document Properties" Card. Wait for that heading to appear.
    await waitForProcessing(page, 15_000);
    const metadataOutput = page.locator('h3, h2, [data-testid="metadata-output"], table, dl').filter({
      hasText: /document properties|properties|metadata/i,
    }).first();
    await expect(metadataOutput).toBeVisible({ timeout: 15_000 });
  });

  test('export JSON button triggers download', async ({ page }) => {
    await gotoTool(page, 'view-metadata');
    await uploadPDF(page, PDF_1);

    await waitForProcessing(page, 15_000);
    const exportBtn = page.getByTestId('export-metadata-button');
    await expect(exportBtn).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.json$/i);
  });
});

// ---------------------------------------------------------------------------
// Edit Metadata
// ---------------------------------------------------------------------------

test.describe('Edit Metadata', () => {
  test('edits metadata and downloads result', async ({ page }) => {
    await gotoTool(page, 'edit-metadata');
    await uploadPDF(page, PDF_1);

    // Wait for metadata form to appear
    const titleInput = page.locator('input[name="title"], input[id*="title"], input[placeholder*="title" i]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill('E2E Test Title');

    await expect(page.getByTestId('save-metadata-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'save-metadata-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Additional tool smoke tests — all remaining P1/P2 slugs
// ---------------------------------------------------------------------------

const ADDITIONAL_SLUGS = [
  'delete-pages',
  'extract-pages',
  'add-blank-page',
  'reverse-pages',
  'flatten-pdf',
  'page-numbers',
  'repair-pdf',
  'remove-restrictions',
  'view-metadata',
  'edit-metadata',
  'crop-pdf',
  'organize-pdf',
  'compare-pdfs',
  'pdf-to-png',
  'pdf-to-webp',
  'pdf-to-greyscale',
  'remove-blank-pages',
  'invert-colors',
];

test.describe('Additional tool pages load without errors', () => {
  for (const slug of ADDITIONAL_SLUGS) {
    test(`/en/tools/${slug}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => {
        if (!err.message.includes('ResizeObserver')) errors.push(err.message);
      });

      await page.goto(`/en/tools/${slug}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByTestId('tool-page')).toBeVisible({ timeout: 15_000 });
      expect(errors).toHaveLength(0);
    });
  }
});
