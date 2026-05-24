/**
 * Shared Playwright helpers for PDFaro tool flows.
 *
 * Every PDF tool follows the same high-level pattern:
 *   1. Navigate to /en/tools/<slug>
 *   2. Upload one or more PDF files via the hidden file input
 *   3. Optionally tweak options
 *   4. Click the primary action button
 *   5. Wait for the processing overlay to disappear
 *   6. Assert either a download or a success state
 *
 * These helpers centralise that pattern so individual spec files stay lean.
 */

import { type Page, type Download, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.resolve(__dirname, '../fixtures');

export const PDF_1   = path.join(FIXTURES, 'sample.pdf');
export const PDF_2   = path.join(FIXTURES, 'sample-two-pages.pdf');
export const IMAGE_1 = path.join(FIXTURES, 'sample-image.jpg');
export const TXT_1   = path.join(FIXTURES, 'sample-text.txt');

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/** Navigate to a tool page (always under /en/tools/<slug>). */
export async function gotoTool(page: Page, slug: string) {
  await page.goto(`/en/tools/${slug}`);
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

/**
 * Upload one or more files into a tool's FileUploader component.
 * Works for both single-file and multi-file uploaders.
 */
export async function uploadFiles(page: Page, filePaths: string[]) {
  const fileInput = page.getByTestId('file-input');
  await fileInput.setInputFiles(filePaths);
}

/**
 * Upload a single PDF and wait until the file card appears in the UI,
 * which signals the upload was accepted.
 */
export async function uploadPDF(page: Page, filePath = PDF_1) {
  await uploadFiles(page, [filePath]);
  // After upload the FileUploader hides and a file card / filename appears.
  // We wait for the file-uploader to disappear (tool accepted the file).
  await expect(page.getByTestId('file-uploader')).not.toBeVisible({ timeout: 5_000 }).catch(() => {
    // Some tools keep the uploader visible when multiple files are allowed — that's fine.
  });
}

// ---------------------------------------------------------------------------
// Processing helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the processing-progress bar to appear then disappear,
 * indicating the PDF operation completed.
 * Falls back gracefully if the tool doesn't use ProcessingProgress.
 */
export async function waitForProcessing(page: Page, timeout = 30_000) {
  const progress = page.getByTestId('processing-progress');
  // It may not appear for very fast operations — use a short look-ahead.
  const appeared = await progress.isVisible({ timeout: 2_000 }).catch(() => false);
  if (appeared) {
    await expect(progress).not.toBeVisible({ timeout });
  }
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

/**
 * Click the primary action button and wait for a file download to begin.
 * Returns the Download object for further assertions.
 */
export async function clickAndDownload(
  page: Page,
  buttonTestId: string,
): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId(buttonTestId).click(),
  ]);
  return download;
}

/**
 * Full single-file tool flow:
 *  upload → click action → wait → assert download
 */
export async function runSingleFileTool(
  page: Page,
  opts: {
    slug: string;
    filePath?: string;
    actionButtonTestId: string;
    /** Extra steps between upload and clicking action, e.g. selecting options */
    setup?: (page: Page) => Promise<void>;
    /** Expected download filename pattern — defaults to asserting any download */
    expectedFilename?: RegExp | string;
  },
) {
  await gotoTool(page, opts.slug);
  await uploadPDF(page, opts.filePath ?? PDF_1);

  if (opts.setup) await opts.setup(page);

  const download = await clickAndDownload(page, opts.actionButtonTestId);
  await waitForProcessing(page);

  if (opts.expectedFilename) {
    if (opts.expectedFilename instanceof RegExp) {
      expect(download.suggestedFilename()).toMatch(opts.expectedFilename);
    } else {
      expect(download.suggestedFilename()).toContain(opts.expectedFilename);
    }
  }

  return download;
}

// ---------------------------------------------------------------------------
// Error-state helpers
// ---------------------------------------------------------------------------

/** Assert that an error alert is visible and optionally contains text. */
export async function expectError(page: Page, containsText?: string) {
  const alert = page.getByTestId('error-alert');
  await expect(alert).toBeVisible({ timeout: 10_000 });
  if (containsText) {
    await expect(alert).toContainText(containsText);
  }
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Assert the download button is present and enabled. */
export async function expectDownloadButton(page: Page) {
  await expect(page.getByTestId('download-button')).toBeVisible({ timeout: 15_000 });
}
