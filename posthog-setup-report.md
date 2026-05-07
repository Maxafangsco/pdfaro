<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into PDFaro (Next.js 15.5, App Router, static export).

## Summary of changes

- **`instrumentation-client.ts`** (new) — PostHog is now initialised here using the Next.js 15.3+ recommended pattern. Enables automatic exception capture (`capture_exceptions: true`) and debug logging in development. All configuration is read from environment variables.
- **`src/components/analytics/PostHogProvider.tsx`** — Removed the `posthog.init()` call (moved to `instrumentation-client.ts`) and the module-level `initialised` guard. The component now only handles page view tracking on route changes.
- **`.env.local`** — Created with `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` values. Covered by `.gitignore`.
- **`src/components/tools/merge/MergePDFTool.tsx`** — Added `tool_started` on merge button click, `tool_completed` on success (with processing time), and `processing_failed` on error.
- **`src/components/tools/compress/CompressPDFTool.tsx`** — Added `tool_started` when compression begins, `tool_completed` when all batch files finish.
- **`src/app/[locale]/contact/ContactPageClient.tsx`** — Added `contact_form_submitted` (with subject category, no PII) on successful form submission.

The following were already instrumented before this session and remain unchanged:
- `file_uploaded` — fired by `FileUploader` for every tool
- `download_clicked` — fired by `DownloadButton` for every tool
- `tool_clicked` — fired by `ToolCard` on every tool card click

## Events

| Event | Description | File |
|---|---|---|
| `tool_started` | User clicked the process button; captures `tool_name`, `file_count`, `file_size`, `file_type` | `src/components/tools/merge/MergePDFTool.tsx`, `src/components/tools/compress/CompressPDFTool.tsx` |
| `tool_completed` | Processing finished successfully; captures `tool_name`, `processing_time_ms`, `file_count`, `output_type` | `src/components/tools/merge/MergePDFTool.tsx`, `src/components/tools/compress/CompressPDFTool.tsx` |
| `processing_failed` | Processing threw an error; captures `tool_name`, sanitised `error_message` | `src/components/tools/merge/MergePDFTool.tsx` |
| `contact_form_submitted` | Contact form submitted successfully; captures `subject` category only | `src/app/[locale]/contact/ContactPageClient.tsx` |
| `file_uploaded` | File selected in uploader; captures `tool_name`, `file_type`, `file_size`, `file_count` | `src/components/tools/FileUploader.tsx` (pre-existing) |
| `download_clicked` | Download button clicked; captures `tool_name`, `output_type` | `src/components/tools/DownloadButton.tsx` (pre-existing) |
| `tool_clicked` | Tool card clicked; captures `tool_name`, `tool_category`, `source_page` | `src/components/tools/ToolCard.tsx` (pre-existing) |
| `$pageview` | Automatic page view on every route change | `src/components/analytics/PostHogProvider.tsx` (pre-existing) |

## Next steps

We've built a dashboard and insights to monitor user behaviour based on the events just instrumented:

- [Analytics basics dashboard](/dashboard/1557350)
- [Tool usage volume (30d)](/insights/INup9tQs) — daily count of processing jobs started
- [Tool success rate](/insights/AhZBq7Zb) — `tool_completed / tool_started × 100` — spot reliability regressions
- [Tool-to-download conversion funnel](/insights/NdaavId8) — `file_uploaded → tool_started → tool_completed → download_clicked` — the core value-delivery funnel
- [Top tools by usage](/insights/XoUh42V7) — `tool_started` broken down by `tool_name` — see which tools drive the most activity
- [Contact form submissions](/insights/TYzsu3hR) — submissions by subject category

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
