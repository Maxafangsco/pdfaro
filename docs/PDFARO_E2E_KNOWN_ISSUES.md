# PDFaro E2E Known Issues & Limitations

_Last updated: 2026-05-10 — branch `feat/playwright-e2e`_

---

## 1. Vitest unit tests fail in the Linux sandbox

**Symptom:** `npm run test` throws an esbuild platform error when run inside the
Cowork sandbox (Linux/arm64) because `node_modules` was originally installed on
macOS.

**Cause:** This is a sandbox environment issue, not a code issue.

**Fix:** Run `npm ci` on a matching platform (macOS or Linux x86) before running
`npm run test`. CI (ubuntu-latest) runs `npm ci` from scratch and is unaffected.

---

## 2. WASM tool tests are skipped / marked slow in CI

**Affected tools:** `word-to-pdf`, `excel-to-pdf`, `ocr-pdf` (Tesseract.js)

**Why:** These tools decompress large WASM binaries (LibreOffice ~150 MB) on
first use and require `COEP: require-corp` / `COOP: same-origin` headers.
The decompression can take 30–90 s and may timeout in CI.

**Current state:**
- `ocr-pdf` is tested but uses `test.slow()` (3× global timeout)
- `word-to-pdf` and `excel-to-pdf` are **not** tested by the current suite
- LibreOffice WASM postbuild script is skipped via `SKIP_WASM_POSTBUILD=true` in CI

**Future fix:** Add a `test.skip(!!process.env.CI, 'WASM too slow in CI')` guard
and run those tests in a nightly job with extended timeouts.

---

## 3. PDF.js iframe tools (sign-pdf, edit-pdf) — read-only smoke tests only

**Affected tools:** `sign-pdf`, `edit-pdf`

**Why:** These tools embed PDF.js in a sandboxed `<iframe>` and pass the file via
a blob URL. Cross-origin restrictions prevent Playwright from interacting with
the iframe's DOM (clicks, typing on annotation canvas, etc.).

**Current state:** Tests only verify:
1. The file uploader is visible before upload
2. The iframe appears after upload

**Interactions not tested:** drawing, annotating, saving/exporting.

**Future fix:** Expose a `postMessage` API from the iframe for test hooks, or use
Playwright's `page.frame()` with `allow-same-origin` removed.

---

## 4. Protect-pdf and watermark-pdf — no stable `data-testid` on action button

**Why:** These tools were not part of the initial `data-testid` pass (action
button selector is dynamic or inside a shared component).

**Current state:** Tests fall back to `getByRole('button', { name: /…/i })` which
is brittle against i18n label changes.

**Fix:** Add `data-testid="protect-button"` and `data-testid="watermark-button"`
to those tool components.

---

## 5. Mobile menu test requires 375 px viewport

**Symptom:** The mobile menu button (`data-testid="mobile-menu-button"`) is
hidden by Tailwind's `md:hidden` class at desktop widths.

**Current state:** The smoke test sets `page.setViewportSize({ width: 375, … })`
before navigating, which works correctly.

**Note:** If the Tailwind breakpoint changes from `md` (768 px), the viewport
width in `smoke.spec.ts` must be updated to match.

---

## 6. `reuseExistingServer` behaviour

**Locally:** Playwright reuses a running `npm run dev` server (port 3000) so
tests start immediately. If no server is running, Playwright starts one
automatically.

**In CI:** Playwright runs `npm run start` (production build). The `npm run build`
step must complete successfully before `playwright test` is invoked.

**If the build is skipped / fails:** Tests will fail at the webServer startup
step with a connection-refused error. Check the `Build Next.js` step in the
`E2E Tests` GitHub Actions job first.

---

## 7. Batch-download tools produce ZIP, not PDF

**Affected tools:** `compress-pdf` (batch mode), `split-pdf`

**Current state:** Tests assert `suggestedFilename` matches `/\.(pdf|zip)$/i`
which handles both single-file and batch output.

**Note:** If a test asserts `.pdf` strictly, it will fail when the tool produces
a ZIP. Keep the regex permissive or detect batch mode before asserting.

---

## 8. ReactFlow canvas interaction not tested

**Affected spec:** `workflow.spec.ts`

**Why:** ReactFlow's pointer-event model (drag-to-connect nodes) does not map
cleanly to Playwright's `dragAndDrop` because ReactFlow uses custom synthetic
events and canvas-relative coordinates.

**Current state:** Tests only assert the canvas renders and ReactFlow's wrapper
element is visible.

**Future fix:** ReactFlow 12+ exposes a `data-testid="rf__wrapper"` element.
Use `page.mouse.move` + `page.mouse.down/up` with exact coordinate calculations
relative to that element's bounding box.
