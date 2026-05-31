/**
 * Contact form E2E tests
 *
 * Tests:
 *  - Submit button is disabled until all required fields are filled
 *  - Each required field contributes to form validity
 *  - Message minimum-length enforcement (10 chars per the UI rule)
 *  - Honeypot field is present but hidden
 *  - Happy path: valid submission reaches the API
 *    (API response is mocked so the test is hermetic and never sends email)
 */

import { test, expect } from '@playwright/test';

const CONTACT_URL = '/en/contact';

// Valid form data that satisfies all requirements
const VALID_FORM = {
  name: 'E2E Test User',
  email: 'e2e@example.com',
  subject: 'bug',
  message: 'This is a test message that is long enough to pass validation.',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fillForm(
  page: import('@playwright/test').Page,
  data: Partial<typeof VALID_FORM>,
) {
  if (data.name !== undefined) {
    await page.locator('#name').fill(data.name);
  }
  if (data.email !== undefined) {
    await page.locator('#email').fill(data.email);
  }
  if (data.subject !== undefined) {
    await page.locator('#subject').selectOption(data.subject);
  }
  if (data.message !== undefined) {
    await page.locator('#message').fill(data.message);
  }
}

function getSubmitBtn(page: import('@playwright/test').Page) {
  return page.locator('button[type="submit"]');
}

// ---------------------------------------------------------------------------
// Page load
// ---------------------------------------------------------------------------

test.describe('Contact page', () => {
  test('loads the contact page', async ({ page }) => {
    await page.goto(CONTACT_URL);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#subject')).toBeVisible();
    await expect(page.locator('#message')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Submit button state
// ---------------------------------------------------------------------------

test.describe('Contact form — submit button state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CONTACT_URL);
    await page.waitForLoadState('networkidle');
  });

  test('is disabled on an empty form', async ({ page }) => {
    await expect(getSubmitBtn(page)).toBeDisabled();
  });

  test('is disabled when only name is filled', async ({ page }) => {
    await fillForm(page, { name: 'Test User' });
    await expect(getSubmitBtn(page)).toBeDisabled();
  });

  test('is disabled when name and email are filled but message is empty', async ({ page }) => {
    await fillForm(page, { name: 'Test', email: 'test@example.com', subject: 'bug' });
    await expect(getSubmitBtn(page)).toBeDisabled();
  });

  test('is disabled when message is too short (< 10 chars)', async ({ page }) => {
    await fillForm(page, { ...VALID_FORM, message: 'Short' });
    await expect(getSubmitBtn(page)).toBeDisabled();
  });

  test('is enabled when all required fields are valid', async ({ page }) => {
    await fillForm(page, VALID_FORM);
    await expect(getSubmitBtn(page)).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Honeypot
// ---------------------------------------------------------------------------

test.describe('Contact form — honeypot', () => {
  test('honeypot field is present but hidden from assistive technology', async ({ page }) => {
    await page.goto(CONTACT_URL);
    const honeypot = page.locator('input[name="_hp"]');
    await expect(honeypot).toBeAttached(); // exists in DOM

    // The honeypot sits inside a div[aria-hidden="true"] so screen readers skip it.
    // Playwright may still consider off-screen elements "visible", so we verify
    // the aria-hidden wrapper exists rather than using not.toBeVisible().
    const ariaHiddenWrapper = page.locator('[aria-hidden="true"]:has(input[name="_hp"])');
    await expect(ariaHiddenWrapper).toBeAttached();
  });
});

// ---------------------------------------------------------------------------
// Field-level validation
// ---------------------------------------------------------------------------

test.describe('Contact form — field validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CONTACT_URL);
    await page.waitForLoadState('networkidle');
  });

  test('email field rejects non-email input', async ({ page }) => {
    // Fill everything valid except email
    await fillForm(page, { ...VALID_FORM, email: 'not-an-email' });
    // Submit button should remain disabled because the browser type="email" validity fails
    await expect(getSubmitBtn(page)).toBeDisabled();
  });

  test('clearing name after full form disables submit', async ({ page }) => {
    await fillForm(page, VALID_FORM);
    await expect(getSubmitBtn(page)).toBeEnabled();

    await page.locator('#name').fill('');
    await expect(getSubmitBtn(page)).toBeDisabled();
  });

  test('clearing message after full form disables submit', async ({ page }) => {
    await fillForm(page, VALID_FORM);
    await expect(getSubmitBtn(page)).toBeEnabled();

    await page.locator('#message').fill('');
    await expect(getSubmitBtn(page)).toBeDisabled();
  });

  test('message exactly at minimum length (10 chars) enables submit', async ({ page }) => {
    await fillForm(page, { ...VALID_FORM, message: '1234567890' }); // exactly 10
    await expect(getSubmitBtn(page)).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// Happy path — mock the /api/contact endpoint
// ---------------------------------------------------------------------------

test.describe('Contact form — submission', () => {
  test('shows success state after valid submission (mocked API)', async ({ page }) => {
    // Intercept the POST so no real email is sent
    await page.route('**/api/contact', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(CONTACT_URL);
    await page.waitForLoadState('networkidle');
    await fillForm(page, VALID_FORM);

    const submitBtn = getSubmitBtn(page);
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // After success the form is replaced by a success Card.
    // The Card contains an h3 with the success title (no role="status" or role="alert").
    const successMessage = page.locator('h3, [role="status"], [role="alert"]').filter({ hasText: /success|sent|thank/i });
    await expect(successMessage.first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows error state when API returns 500 (mocked)', async ({ page }) => {
    await page.route('**/api/contact', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto(CONTACT_URL);
    await page.waitForLoadState('networkidle');
    await fillForm(page, VALID_FORM);
    await getSubmitBtn(page).click();

    // An error alert should appear — check both role="alert" and common error elements
    const errorAlert = page.locator('[role="alert"], h3, p').filter({ hasText: /error|fail|wrong|try again/i });
    await expect(errorAlert.first()).toBeVisible({ timeout: 10_000 });
  });
});
