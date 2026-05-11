# PDFaro Playwright E2E Test Map

_Generated during Phase 1 inspection — branch `feat/playwright-e2e`_

---

## 1. Current Testing Setup

| Dimension | Detail |
|-----------|--------|
| Unit/component runner | **Vitest 2.x** (jsdom) |
| Component testing | `@testing-library/react` + `@testing-library/user-event` |
| Unit test location | `src/__tests__/**/*.{test,spec}.{ts,tsx}` |
| Existing unit coverage | API route (`/api/contact`), lib utils, analytics, accessibility, workflow |
| E2E runner | ❌ None — **this PR adds Playwright** |
| CI | GitHub Actions (`.github/workflows/`) — deploy/release/docker workflows exist; e2e workflow is new |

---

## 2. Routes to Test

| Route | Description | Priority |
|-------|-------------|----------|
| `/en` | Homepage — hero, search, quick-actions, tool grid | P0 |
| `/en/tools` | Full tool directory — search, category filter | P0 |
| `/en/tools/merge-pdf` | Merge PDFs (multi-file upload, drag-reorder, merge) | P0 |
| `/en/tools/compress-pdf` | Compress PDF (batch, quality slider) | P0 |
| `/en/tools/split-pdf` | Split PDF (page selection) | P0 |
| `/en/tools/rotate-pdf` | Rotate pages | P0 |
| `/en/tools/image-to-pdf` | JPG/PNG → PDF | P0 |
| `/en/tools/jpg-to-pdf` | Alias for image-to-pdf | P1 |
| `/en/tools/pdf-to-image` | PDF → JPG/PNG export | P1 |
| `/en/tools/sign-pdf` | Signature overlay (PDF.js embed) | P1 |
| `/en/tools/edit-pdf` | Annotation editor (PDF.js embed) | P1 |
| `/en/tools/ocr-pdf` | OCR via Tesseract.js | P2 |
| `/en/tools/protect-pdf` | Password encryption | P1 |
| `/en/tools/watermark-pdf` | Watermark overlay | P1 |
| `/en/tools/pdf-to-docx` | PDF → Word conversion | P2 |
| `/en/tools/word-to-pdf` | Word → PDF via LibreOffice WASM | P2 |
| `/en/workflow` | Workflow builder (ReactFlow) | P2 |
| `/en/contact` | Contact form | P2 |
| `/en/about`, `/en/faq`, `/en/privacy` | Static pages | P2 |

---

## 3. Top PDF Tools to Test First

Priority order based on user impact and implementation complexity:

1. **merge-pdf** — most-used tool; pure pdf-lib, reliable WASM
2. **compress-pdf** — batch mode, quality presets
3. **split-pdf** — page-selection UI, extracts ranges
4. **rotate-pdf** — simple, fast, good smoke test
5. **image-to-pdf** — different input type (JPG), fast
6. **protect-pdf** — encrypt/password — uses node-forge in WASM
7. **watermark-pdf** — text overlay, pdf-lib
8. **pdf-to-image** — reverse direction, canvas rendering
9. **sign-pdf** — PDF.js iframe embed (complex)
10. **edit-pdf** — PDF.js annotation iframe (complex; recently fixed upload)

---

## 4. Components Needing `data-testid`

### Already has `data-testid`
- `ToolCard` — `tool-card`, `tool-card-container`, `tool-card-name`, `tool-card-description`
- `ToolPage` — `tool-page`

### Needs `data-testid` added

| Component / Element | Suggested `data-testid` | File |
|---------------------|------------------------|------|
| Homepage search `<form>` | `hero-search-form` | `HomePageClient.tsx` |
| Homepage search `<input>` | `hero-search-input` | `HomePageClient.tsx` |
| FileUploader drop zone | `file-uploader` | `FileUploader.tsx` |
| FileUploader `<input type="file">` | `file-input` | `FileUploader.tsx` |
| DownloadButton | `download-button` | `DownloadButton.tsx` |
| ProcessingProgress bar | `processing-progress` | `ProcessingProgress.tsx` |
| MergePDF process button | `merge-button` | `MergePDFTool.tsx` |
| CompressPDF process button | `compress-button` | `CompressPDFTool.tsx` |
| SplitPDF process button | `split-button` | `SplitPDFTool.tsx` |
| RotatePDF apply button | `rotate-button` | `RotatePDFTool.tsx` |
| ImageToPDF convert button | `convert-button` | `ImageToPDFTool.tsx` |
| OCR process button | `ocr-button` | `OCRPDFTool.tsx` |
| Error alert div | `error-alert` | multiple tool files |
| Header mobile menu button | `mobile-menu-button` | `Header.tsx` |
| Header mobile menu panel | `mobile-menu` | `Header.tsx` |
| Workflow editor canvas | `workflow-canvas` | `WorkflowPageClient.tsx` |

---

## 5. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| **WASM tools need cross-origin headers** — LibreOffice WASM requires `COEP: require-corp`; Playwright's `--no-sandbox` should still work | High | Test against real dev server (`npm run dev`) not static export |
| **PDF.js iframe tools (sign, edit)** — file passed via JS API, not URL; complex init timing | Medium | Use longer timeouts + wait for `data-testid="editor-ready"` |
| **Tesseract.js OCR** — 2–15 s processing time per page, downloads language models | High | Mark test with `timeout: 60_000`; skip in CI on first pass |
| **Batch downloads as ZIP** — compress/split produce ZIP; `page.waitForEvent('download')` required | Medium | Use Playwright `download` event listener |
| **next-intl locale prefix** — all routes start with `/en/`; baseURL must account for this | Low | Use `/en/` prefix in all test paths |
| **Turbopack dev server startup** — `npm run dev` uses `--turbopack`; first boot can be 10–20 s | Medium | Set `webServer.timeout` to 60 s in Playwright config |
| **LibreOffice WASM cold load** — word-to-pdf/excel-to-pdf decompress large WASM gz on first use | High | Skip in initial pass; mark as P2 |

---

## 6. Test Execution Plan

```
Phase 1  Inspection + docs           ← this document
Phase 2  Install Playwright + config
Phase 3  Generate fixture files
Phase 4  Add data-testid attrs
Phase 5  Smoke tests (homepage, nav, search)
Phase 6  Tool-flow tests (priority tools)
Phase 7  Reusable helpers
Phase 8  Error + edge-case tests
Phase 9  Workflow editor test
Phase 10 GitHub Actions CI
Phase 11 Final verification
```

### Local commands
```bash
npm run test:e2e            # headless (Chromium)
npm run test:e2e:headed     # visible browser
npm run test:e2e:ui         # Playwright UI mode
npm run test:e2e:debug      # step-through debugger
npx playwright show-report  # view HTML report after run
```

### CI
- Runs on every push to `main` and on PRs
- Uploads HTML report as artifact on failure
- Installs Chromium only (Firefox/WebKit opt-in locally)
