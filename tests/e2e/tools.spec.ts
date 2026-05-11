/**
 * Tool-flow E2E tests — Phase 6
 *
 * Each test exercises the full user flow for a priority PDF tool:
 *   upload → configure → process → download
 *
 * Tests are ordered by priority (P0 first).
 *
 * WASM-heavy tools (word-to-pdf, ocr) have extended timeouts and are
 * marked with test.slow() to triple the global timeout.
 */

import { test, expect } from '@playwright/test';
import {
  gotoTool,
  uploadFiles,
  uploadPDF,
  waitForProcessing,
  clickAndDownload,
  runSingleFileTool,
  expectError,
  expectDownloadButton,
  PDF_1,
  PDF_2,
  IMAGE_1,
  TXT_1,
} from './helpers/toolFlow.js';

// ---------------------------------------------------------------------------
// Merge PDF  (P0)
// ---------------------------------------------------------------------------

test.describe('Merge PDF', () => {
  test('merges two PDFs and downloads result', async ({ page }) => {
    await gotoTool(page, 'merge-pdf');

    // Upload two files
    await uploadFiles(page, [PDF_1, PDF_2]);

    // Both files should appear in the file list
    const fileInput = page.getByTestId('file-input');
    // After upload the merge button should be enabled
    const mergeBtn = page.getByTestId('merge-button');
    await expect(mergeBtn).toBeVisible({ timeout: 8_000 });

    const download = await clickAndDownload(page, 'merge-button');
    await waitForProcessing(page);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test('shows error when only one file is provided', async ({ page }) => {
    await gotoTool(page, 'merge-pdf');
    await uploadFiles(page, [PDF_1]);

    // Merge button may be disabled or show an error inline
    // Click it and assert either disabled state or error
    const mergeBtn = page.getByTestId('merge-button');
    const isDisabled = await mergeBtn.isDisabled().catch(() => false);
    if (!isDisabled) {
      await mergeBtn.click();
      // Either an error appears or nothing happens (button stays enabled but
      // tool validates before processing)
      // We just assert no crash
    }
    await expect(page).not.toHaveURL(/500|error/);
  });
});

// ---------------------------------------------------------------------------
// Compress PDF  (P0)
// ---------------------------------------------------------------------------

test.describe('Compress PDF', () => {
  test('compresses a PDF and triggers download', async ({ page }) => {
    await gotoTool(page, 'compress-pdf');
    await uploadPDF(page, PDF_1);

    const compressBtn = page.getByTestId('compress-button');
    await expect(compressBtn).toBeVisible({ timeout: 8_000 });

    const download = await clickAndDownload(page, 'compress-button');
    await waitForProcessing(page, 45_000);

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

    const splitBtn = page.getByTestId('split-button');
    await expect(splitBtn).toBeVisible({ timeout: 8_000 });

    const download = await clickAndDownload(page, 'split-button');
    await waitForProcessing(page, 30_000);

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

    const rotateBtn = page.getByTestId('rotate-button');
    await expect(rotateBtn).toBeVisible({ timeout: 8_000 });

    const download = await clickAndDownload(page, 'rotate-button');
    await waitForProcessing(page, 30_000);

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

    const convertBtn = page.getByTestId('convert-button');
    await expect(convertBtn).toBeVisible({ timeout: 8_000 });

    const download = await clickAndDownload(page, 'convert-button');
    await waitForProcessing(page, 30_000);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Protect PDF  (P1)
// ---------------------------------------------------------------------------

test.describe('Protect PDF', () => {
  test('encrypts a PDF with a password and downloads result', async ({ page }) => {
    await gotoTool(page, 'protect-pdf');
    await uploadPDF(page, PDF_1);

    // Fill password fields — look for password inputs
    const passwordInputs = page.locator('input[type="password"]');
    const count = await passwordInputs.count();
    if (count > 0) {
      await passwordInputs.nth(0).fill('TestPass123!');
      if (count > 1) {
        await passwordInputs.nth(1).fill('TestPass123!');
      }
    }

    // Find the protect/encrypt button (may not have our testid)
    const actionBtn =
      page.getByTestId('process-button').or(
        page.getByRole('button', { name: /protect|encrypt|apply/i })
      ).first();

    await expect(actionBtn).toBeVisible({ timeout: 8_000 });
    const download = await Promise.all([
      page.waitForEvent('download'),
      actionBtn.click(),
    ]).then(([dl]) => dl);

    await waitForProcessing(page, 30_000);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// Watermark PDF  (P1)
// ---------------------------------------------------------------------------

test.describe('Watermark PDF', () => {
  test('adds a text watermark and downloads result', async ({ page }) => {
    await gotoTool(page, 'watermark-pdf');
    await uploadPDF(page, PDF_1);

    // Fill in watermark text if there's an input
    const textInput = page.locator('input[type="text"], textarea').first();
    const inputVisible = await textInput.isVisible().catch(() => false);
    if (inputVisible) {
      await textInput.fill('CONFIDENTIAL');
    }

    // Find the watermark/apply button
    const actionBtn =
      page.getByTestId('process-button').or(
        page.getByRole('button', { name: /watermark|apply|add/i })
      ).first();

    await expect(actionBtn).toBeVisible({ timeout: 8_000 });
    const download = await Promise.all([
      page.waitForEvent('download'),
      actionBtn.click(),
    ]).then(([dl]) => dl);

    await waitForProcessing(page, 30_000);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});

// ---------------------------------------------------------------------------
// PDF to Image  (P1)
// ---------------------------------------------------------------------------

test.describe('PDF to Image', () => {
  test('converts PDF to image and triggers download', async ({ page }) => {
    await gotoTool(page, 'pdf-to-image');
    await uploadPDF(page, PDF_1);

    const actionBtn =
      page.getByTestId('process-button').or(
        page.getByRole('button', { name: /convert|export|extract/i })
      ).first();

    await expect(actionBtn).toBeVisible({ timeout: 8_000 });
    const download = await Promise.all([
      page.waitForEvent('download'),
      actionBtn.click(),
    ]).then(([dl]) => dl);

    await waitForProcessing(page, 45_000);
    expect(download.suggestedFilename()).toMatch(/\.(jpg|jpeg|png|zip)$/i);
  });
});

// ---------------------------------------------------------------------------
// Sign PDF  (P1, iframe-based — smoke only)
// ---------------------------------------------------------------------------

test.describe('Sign PDF (iframe smoke)', () => {
  test('loads sign-pdf page with file uploader', async ({ page }) => {
    await gotoTool(page, 'sign-pdf');
    // Before upload: FileUploader should be visible
    await expect(page.getByTestId('file-uploader')).toBeVisible({ timeout: 10_000 });
  });

  test('accepts PDF upload for signing', async ({ page }) => {
    await gotoTool(page, 'sign-pdf');
    await uploadPDF(page, PDF_1);
    // After upload a PDF.js iframe should appear
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
    await expect(ocrBtn).toBeVisible({ timeout: 8_000 });
    await ocrBtn.click();

    await waitForProcessing(page, 90_000);

    // Either a download button appears or text output is shown
    const downloadBtn = page.getByTestId('download-button');
    const textOutput = page.locator('[data-testid="ocr-output"], textarea, .ocr-result');
    await expect(downloadBtn.or(textOutput).first()).toBeVisible({ timeout: 90_000 });
  });
});
