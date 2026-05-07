# PDFaro Analytics Map

_Phase 1 discovery document — feature/analytics branch._

---

## Critical Constraint: Static Export

`next.config.js` sets `output: 'export'`. This means:
- **No Next.js API routes** (`/api/*`) can run at request time.
- All analytics must be **client-side** or sent to **external services**.
- Backend logging uses a **fire-and-forget fetch** to a configurable external endpoint
  (e.g. a separate Express/Supabase Edge Function/Vercel serverless function).
- The adapter layer is fully abstracted — plug in any endpoint later via `NEXT_PUBLIC_EVENTS_ENDPOINT`.

---

## 1. Where Page Views Should Be Tracked

| Route | Component | Track |
|-------|-----------|-------|
| `/<locale>` | `HomePageClient.tsx` | `page_view` on mount |
| `/<locale>/tools` | `ToolsPageClient.tsx` | `page_view` on mount |
| `/<locale>/tools/[tool]` | `ToolPage.tsx` | `page_view` on mount |
| `/<locale>/workflow` | `WorkflowPageClient.tsx` | `page_view` on mount |
| `/<locale>/about` | `AboutPageClient.tsx` | `page_view` on mount |

**Mechanism:** `PostHogProvider` wraps the app and captures `$pageview` automatically via
`usePathname` + `useEffect`. No manual call needed per page.

---

## 2. Where Tool Events Should Be Tracked

| Component | File | Event |
|-----------|------|-------|
| `ToolCard` | `src/components/tools/ToolCard.tsx` | `tool_clicked` on link click |
| `ToolPage` | `src/components/tools/ToolPage.tsx` | `tool_clicked` (page view of a tool) |

---

## 3. Where Uploads Happen

All tool components call `<FileUploader onFilesSelected={...} />`.
- **`FileUploader`** (`src/components/tools/FileUploader.tsx`) — central upload entry point.
- Each tool component's `handleFilesSelected` callback receives the validated `File[]`.
- Track `file_uploaded` inside `FileUploader` on successful file acceptance.

---

## 4. Where Processing Starts

Each tool component (e.g. `CompressPDFTool`) has a button handler like `handleCompress` that
calls `startProcessing(processor)` from `useBatchProcessing`.
- **`useBatchProcessing`** (`src/lib/hooks/useBatchProcessing.ts`) — `startProcessing()` is the
  central start point. Track `tool_started` here.

---

## 5. Where Processing Completes

`useBatchProcessing` resolves when all files succeed.
- Track `tool_completed` in the hook's completion callback.
- `processingTimeMs` = `Date.now() - startTime`.

---

## 6. Where Downloads Happen

**`DownloadButton`** (`src/components/tools/DownloadButton.tsx`) — single component used across
all tools for downloading results. Has `onDownloadStart` and `onDownloadComplete` callbacks.
- Track `download_clicked` inside `DownloadButton` on click.

---

## 7. Where Errors Are Handled

- `useBatchProcessing` — catches per-file errors, surfaces them via `errorCount` and file status.
- Individual tool components set local `error` state and display it.
- Track `processing_failed` inside `useBatchProcessing` on processor throw.

---

## 8. Files / Components Changed

| File | Change |
|------|--------|
| `src/lib/analytics.ts` | **NEW** — analytics wrapper (PostHog + backend adapter) |
| `src/lib/analytics/session.ts` | **NEW** — `getOrCreateSessionId()` |
| `src/lib/analytics/backend.ts` | **NEW** — fire-and-forget backend event sender |
| `src/components/analytics/PostHogProvider.tsx` | **NEW** — PostHog initialisation provider |
| `src/components/analytics/AdSlot.tsx` | **NEW** — ad tracking placeholder |
| `src/app/[locale]/layout.tsx` | Add `PostHogProvider` wrapper |
| `src/components/tools/ToolCard.tsx` | Add `tool_clicked` tracking on click |
| `src/components/tools/FileUploader.tsx` | Add `file_uploaded` tracking on file acceptance |
| `src/components/tools/DownloadButton.tsx` | Add `download_clicked` tracking on click |
| `src/lib/hooks/useBatchProcessing.ts` | Add `tool_started`, `tool_completed`, `processing_failed` |
| `docs/sql/create_tool_events.sql` | **NEW** — DB migration SQL |
| `docs/PDFARO_ANALYTICS_EVENTS.md` | **NEW** — event reference |
| `.env.local.example` | **NEW** — environment variable template |

---

## 9. Risks & Safeguards

| Risk | Safeguard |
|------|-----------|
| Analytics failure blocks user | All calls wrapped in `try/catch`; errors logged to console only |
| PII sent to PostHog | Wrapper only accepts `fileType`, `fileSize`, `fileCount` — never names/content |
| Raw error stacks exposed | `sanitizeError()` strips stack traces before sending |
| Backend endpoint unavailable | `fire-and-forget` with `keepalive: true`; failures are silent |
| PostHog key missing in dev | Wrapper checks `NEXT_PUBLIC_POSTHOG_KEY` before initialising; no-ops if absent |
| Static export — no API routes | Backend logging via configurable external URL, not `/api/*` |
| Instrumenting 99 tool components | Track at the shared hook level (`useBatchProcessing`), not per-tool |
