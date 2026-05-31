/**
 * i18n / locale E2E tests
 *
 * PDFaro supports 13 locales: en, ja, ko, es, fr, de, zh, zh-TW, pt, ar, it, id, vi
 *
 * These tests verify:
 *  1. Each tested locale's homepage loads without JS errors
 *  2. Tool pages render correctly under non-English locales
 *  3. RTL layout is applied for Arabic (ar)
 *  4. The page <html lang> attribute matches the locale
 *  5. Tool cards are present (not lost in translation)
 */

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Locale smoke tests — homepage loads
// ---------------------------------------------------------------------------

// Test a representative sample rather than all 13 to keep the suite fast.
// Add more locales here if you want broader coverage.
const SMOKE_LOCALES: Array<{ locale: string; label: string }> = [
  { locale: 'en', label: 'English' },
  { locale: 'es', label: 'Spanish' },
  { locale: 'fr', label: 'French' },
  { locale: 'de', label: 'German' },
  { locale: 'ja', label: 'Japanese' },
  { locale: 'ar', label: 'Arabic (RTL)' },
  { locale: 'zh', label: 'Chinese' },
  { locale: 'pt', label: 'Portuguese' },
];

test.describe('Locale homepages load without errors', () => {
  for (const { locale, label } of SMOKE_LOCALES) {
    test(`/${locale} — ${label}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => {
        const msg = err.message;
        // ResizeObserver: benign browser noise
        if (msg.includes('ResizeObserver')) return;
        // "Script error." — cross-origin script; no detail available
        if (msg === 'Script error.' || msg.startsWith('Script error')) return;
        // Next.js chunk load failures in CI / slow networks
        if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) return;
        errors.push(msg);
      });

      await page.goto(`/${locale}`);
      await page.waitForLoadState('networkidle');

      // Page should load — not redirect to 404
      await expect(page).not.toHaveURL(/404|not.found/i);

      // Tool cards should be present
      const cards = page.getByTestId('tool-card');
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });

      // No JS errors
      expect(errors).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// html[lang] attribute
// ---------------------------------------------------------------------------

test.describe('html[lang] attribute matches locale', () => {
  const LANG_MAP: Record<string, string | RegExp> = {
    en: /^en/,
    es: /^es/,
    fr: /^fr/,
    de: /^de/,
    ja: /^ja/,
    ar: /^ar/,
    zh: /^zh/,
    'zh-TW': /^zh/,
  };

  for (const [locale, expected] of Object.entries(LANG_MAP)) {
    test(`/${locale} sets lang="${locale}"`, async ({ page }) => {
      await page.goto(`/${locale}`);
      await page.waitForLoadState('networkidle');

      // PDFaro sets lang on a wrapper <div>, not on <html>
      const lang = await page.locator('div[lang]').first().getAttribute('lang');
      expect(lang).toMatch(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// RTL layout for Arabic
// ---------------------------------------------------------------------------

test.describe('Arabic locale — RTL layout', () => {
  test('/ar sets dir="rtl" or text-align:right', async ({ page }) => {
    await page.goto('/ar');
    await page.waitForLoadState('networkidle');

    // PDFaro sets dir on a wrapper <div lang> element, not on <html> or <body>
    const divDir = await page.locator('div[lang]').first().getAttribute('dir');

    // Fall back to computed direction on body
    const computedDir = await page.evaluate(() =>
      window.getComputedStyle(document.body).direction
    );

    const isRTL = divDir === 'rtl' || computedDir === 'rtl';
    expect(isRTL).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tool pages under non-English locales
// ---------------------------------------------------------------------------

test.describe('Tool pages in non-English locales', () => {
  const TOOL_SLUG = 'merge-pdf';
  const TEST_LOCALES = ['es', 'fr', 'de', 'ja'];

  for (const locale of TEST_LOCALES) {
    test(`/${locale}/tools/${TOOL_SLUG} loads`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => {
        if (!err.message.includes('ResizeObserver')) errors.push(err.message);
      });

      await page.goto(`/${locale}/tools/${TOOL_SLUG}`);
      await page.waitForLoadState('networkidle');

      // ToolPage must render
      await expect(page.getByTestId('tool-page')).toBeVisible({ timeout: 15_000 });

      // FileUploader must be present
      await expect(page.getByTestId('file-uploader')).toBeVisible({ timeout: 10_000 });

      // No JS errors
      expect(errors).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Locale navigation — switching locale via URL
// ---------------------------------------------------------------------------

test.describe('Locale switching via URL', () => {
  test('navigating from /en to /fr shows different locale', async ({ page }) => {
    await page.goto('/en');
    await page.waitForLoadState('networkidle');
    // PDFaro sets lang on a wrapper <div>, not on <html>
    const enLang = await page.locator('div[lang]').first().getAttribute('lang');
    expect(enLang).toMatch(/^en/);

    await page.goto('/fr');
    await page.waitForLoadState('networkidle');
    const frLang = await page.locator('div[lang]').first().getAttribute('lang');
    expect(frLang).toMatch(/^fr/);
  });

  test('tool pages maintain locale in URL', async ({ page }) => {
    await page.goto('/es/tools/merge-pdf');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/es\/tools\/merge-pdf/);
    await expect(page.getByTestId('tool-page')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tools directory in multiple locales
// ---------------------------------------------------------------------------

test.describe('Tools directory in non-English locales', () => {
  for (const locale of ['es', 'de', 'ja']) {
    test(`/${locale}/tools shows tool cards`, async ({ page }) => {
      await page.goto(`/${locale}/tools`);
      await page.waitForLoadState('networkidle');

      const cards = page.getByTestId('tool-card');
      await expect(cards.first()).toBeVisible({ timeout: 10_000 });
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(5);
    });
  }
});
