/**
 * Tool-flow E2E tests — Phase 6
 *
 * Each test exercises the full user flow for a priority PDF tool:
 *   upload → configure → click action button → wait for DownloadButton → download
 *
 * PDFaro tools use a two-step download pattern:
 *   1. Click the action button (merge-button, compress-button, etc.)
 *   2. Tool processes, then renders a DownloadButton
 *   3. User clicks DownloadButton → browser download event fires
 *
 * Tests are ordered by priority (P0 first).
 */

import { test, expect, type Download, type Page } from '@playwright/test';
import {
  gotoTool,
  uploadFiles,
  uploadPDF,
  waitForProcessing,
  PDF_1,
  PDF_2,
  IMAGE_1,
  IMAGE_PNG,
} from './helpers/toolFlow.js';

// ---------------------------------------------------------------------------
// Core helper: click action button → wait for DownloadButton → click → download
// ---------------------------------------------------------------------------

async function processAndDownload(
  page: Page,
  actionTestId: string,
  processingTimeout = 45_000,
): Promise<Download> {
  await page.getByTestId(actionTestId).click();
  await expect(page.getByTestId('download-button')).toBeVisible({ timeout: processingTimeout });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: processingTimeout }),
    page.getByTestId('download-button').first().click(),
  ]);
  return download;
}

// ---------------------------------------------------------------------------
// Merge PDF  (P0)
// ---------------------------------------------------------------------------

test.describe('Merge PDF', () => {
  test('merges two PDFs and downloads result', async ({ page }) => {
    await gotoTool(page, 'merge-pdf');
    await uploadFiles(page, [PDF_1, PDF_2]);

    // Merge button becomes enabled once ≥2 files are added
    await expect(page.getByTestId('merge-button')).toBeEnabled({ timeout: 8_000 });

    const download = await processAndDownload(page, 'merge-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test('merge button is disabled with only one file', async ({ page }) => {
    await gotoTool(page, 'merge-pdf');
    await uploadFiles(page, [PDF_1]);

    const mergeBtn = page.getByTestId('merge-button');
    await expect(mergeBtn).toBeVisible({ timeout: 8_000 });
    await expect(mergeBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Compress PDF  (P0)
// ---------------------------------------------------------------------------

test.describe('Compress PDF', () => {
  test('compresses a PDF and triggers download', async ({ page }) => {
    await gotoTool(page, 'compress-pdf');
    await uploadPDF(page, PDF_1);

    await expect(page.getByTestId('compress-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'compress-button');
    expect(download.suggestedFilename()).toMatch(/\.(pdf|zip)$/i);
  });
});

// ---------------------------------------------------------------------------
// Split PDF  (P0)
// ---------------------------------------------------------------------------

test.describe('Split PDF', () => {
  test('splits a two-page PDF and triggers download', async ({ page }) => {
    await gotoTool(page, 'split-pdf');
    await uploadPDF(page, PDF_2);

    await expect(page.getByTestId('split-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'split-button');
    expect(download.suggestedFilename()).toMatch(/\.(pdf|zip)$/i);
  });
});

// ---------------------------------------------------------------------------
// Rotate PDF  (P0)
// ---------------------------------------------------------------------------

test.describe('Rotate PDF', () => {
  test('rotates pages and downloads result', async ({ page }) => {
    await gotoTool(page, 'rotate-pdf');
    await uploadPDF(page, PDF_1);

    // rotate-button is disabled until pages are marked for rotation (canRotate = false).
    // Click "Rotate All Right" first to mark all pages, then apply.
    const rotateAllRight = page.getByRole('button', { name: /rotate all right/i });
    await expect(rotateAllRight).toBeVisible({ timeout: 10_000 });
    await rotateAllRight.click();

    await expect(page.getByTestId('rotate-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'rotate-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Image to PDF  (P0)
// ---------------------------------------------------------------------------

test.describe('Image to PDF', () => {
  test('converts a JPEG to PDF and downloads result', async ({ page }) => {
    await gotoTool(page, 'image-to-pdf');
    await uploadFiles(page, [IMAGE_1]);

    await expect(page.getByTestId('convert-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'convert-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// JPG to PDF — should accept PNG too (regression)
// ---------------------------------------------------------------------------

test.describe('JPG to PDF', () => {
  test('accepts a PNG upload and converts to PDF', async ({ page }) => {
    await gotoTool(page, 'jpg-to-pdf');
    await uploadFiles(page, [IMAGE_PNG]);

    // If the file type is rejected, the error alert appears and button stays disabled.
    await expect(page.getByTestId('convert-button')).toBeEnabled({ timeout: 8_000 });

    const download = await processAndDownload(page, 'convert-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Encrypt PDF  (P1) — slug: 'encrypt-pdf', action button: data-testid="encrypt-button"
// ---------------------------------------------------------------------------

test.describe('Encrypt PDF', () => {
  test('encrypts a PDF with a password and downloads result', async ({ page }) => {
    await gotoTool(page, 'encrypt-pdf');
    await uploadPDF(page, PDF_1);

    // Fill password fields (two inputs: password + confirm)
    const passwordInputs = page.locator('input[type="password"]');
    await expect(passwordInputs.first()).toBeVisible({ timeout: 8_000 });
    const count = await passwordInputs.count();
    await passwordInputs.nth(0).fill('TestPass123!');
    if (count > 1) await passwordInputs.nth(1).fill('TestPass123!');

    await expect(page.getByTestId('encrypt-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'encrypt-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Add Watermark  (P1) — slug: 'add-watermark', action button: data-testid="watermark-button"
// ---------------------------------------------------------------------------

test.describe('Add Watermark', () => {
  test('adds a text watermark and downloads result', async ({ page }) => {
    await gotoTool(page, 'add-watermark');
    await uploadPDF(page, PDF_1);

    // Fill the watermark text field — button stays disabled until text is provided
    const textInput = page.locator('input[type="text"], textarea').first();
    await expect(textInput).toBeVisible({ timeout: 8_000 });
    await textInput.fill('CONFIDENTIAL');

    await expect(page.getByTestId('watermark-button')).toBeEnabled({ timeout: 8_000 });
    const download = await processAndDownload(page, 'watermark-button');
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// PDF to JPG  (P1) — slug: 'pdf-to-jpg', action button: data-testid="pdf-to-image-button"
// ---------------------------------------------------------------------------

test.describe('PDF to JPG', () => {
  test('converts a PDF to JPG and triggers download', async ({ page }) => {
    await gotoTool(page, 'pdf-to-jpg');
    await uploadPDF(page, PDF_1);

    await expect(page.getByTestId('pdf-to-image-button')).toBeEnabled({ timeout: 8_000 });

    // For a single-page PDF the tool renders a DownloadButton.
    // For multi-page it renders a "Download All" zip button instead.
    await page.getByTestId('pdf-to-image-button').click();

    // Wait for either a DownloadButton (single image) or a zip button (multiple)
    const downloadBtn = page.getByTestId('download-button').first();
    const zipBtn = page.getByRole('button', { name: /download all/i });
    await expect(downloadBtn.or(zipBtn)).toBeVisible({ timeout: 45_000 });

    // Click whichever appeared and capture the download event
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      (await downloadBtn.isVisible() ? downloadBtn : zipBtn).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.(jpg|jpeg|png|zip)$/i);
  });
});

// ---------------------------------------------------------------------------
// Sign PDF  (P1, iframe-based — smoke only)
// ---------------------------------------------------------------------------

test.describe('Sign PDF (iframe smoke)', () => {
  test('loads sign-pdf page with file uploader', async ({ page }) => {
    await gotoTool(page, 'sign-pdf');
    await expect(page.getByTestId('file-uploader')).toBeVisible({ timeout: 10_000 });
  });

  test('accepts PDF upload for signing', async ({ page }) => {
    await gotoTool(page, 'sign-pdf');
    await uploadPDF(page, PDF_1);
    const iframe = page.locator('iframe[title*="PDF"], iframe[src*="pdfjs"]');
    await expect(iframe).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Edit PDF  (P1, iframe-based — smoke only)
// ---------------------------------------------------------------------------

test.describe('Edit PDF (iframe smoke)', () => {
  test('loads edit-pdf page with file uploader', async ({ page }) => {
    await gotoTool(page, 'edit-pdf');
    await expect(page.getByTestId('file-uploader')).toBeVisible({ timeout: 10_000 });
  });

  test('accepts PDF upload and shows editor iframe', async ({ page }) => {
    await gotoTool(page, 'edit-pdf');
    await uploadPDF(page, PDF_1);
    const iframe = page.locator('iframe[title*="PDF"], iframe[src*="pdfjs"]');
    await expect(iframe).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// OCR PDF  (P2, slow — Tesseract.js downloads language models)
// ---------------------------------------------------------------------------

test.describe('OCR PDF', () => {
  test.slow(); // Triples the global timeout

  test('runs OCR on a PDF and produces output', async ({ page }) => {
    await gotoTool(page, 'ocr-pdf');
    await uploadPDF(page, PDF_1);

    const ocrBtn = page.getByTestId('ocr-button');
    await expect(ocrBtn).toBeEnabled({ timeout: 8_000 });
    await ocrBtn.click();

    await waitForProcessing(page, 90_000);

    const downloadBtn = page.getByTestId('download-button');
    const textOutput = page.locator('[data-testid="ocr-output"], textarea, .ocr-result');
    await expect(downloadBtn.or(textOutput).first()).toBeVisible({ timeout: 90_000 });
  });
});
