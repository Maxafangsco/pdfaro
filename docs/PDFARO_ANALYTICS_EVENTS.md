# PDFaro Analytics Events Reference

_Last updated: feature/analytics branch._

---

## Architecture Overview

```
User interaction
      │
      ▼
Component (ToolCard / FileUploader / DownloadButton / useBatchProcessing)
      │
      ▼
src/lib/analytics.ts  ←── single wrapper, never call PostHog directly
      │           │
      │           └──► PostHog (all events, client-side)
      │
      └──────────────► Backend endpoint (business-critical only, fire-and-forget)
                        configured via NEXT_PUBLIC_EVENTS_ENDPOINT
```

---

## Privacy Rules

| Rule | Detail |
|------|--------|
| ❌ No file names | Never tracked in any event |
| ❌ No file content | Never tracked |
| ❌ No raw stack traces | `sanitizeError()` strips stacks before sending |
| ❌ No PII | No email, IP, device fingerprint |
| ✅ File type | e.g. `application/pdf` — safe metadata |
| ✅ File size (bytes) | Aggregate total — safe metadata |
| ✅ File count | Integer — safe metadata |
| ✅ Tool name | e.g. `compress-pdf` — safe |
| ✅ Error message (sanitized) | First line only, max 200 chars |

---

## Events

### 1. `$pageview` (PostHog only)
Fired automatically on every route change by `PostHogProvider`.

| Property | Type | Example |
|----------|------|---------|
| `path` | string | `/en/tools/compress-pdf` |
| `locale` | string | `en` |
| `referrer` | string | `https://google.com` |

---

### 2. `tool_clicked` (PostHog only)
Fired when a user clicks a tool card.

| Property | Type | Example |
|----------|------|---------|
| `tool_name` | string | `Compress PDF` |
| `tool_category` | string | `optimize-repair` |
| `source_page` | string | `tools_directory` |

**Source:** `src/components/tools/ToolCard.tsx`

---

### 3. `file_uploaded` (PostHog only)
Fired when files pass validation and are accepted into a tool.

| Property | Type | Example |
|----------|------|---------|
| `tool_name` | string | `compress-pdf` |
| `file_type` | string | `application/pdf` |
| `file_size` | number | `2457600` (bytes total) |
| `file_count` | number | `3` |

**Source:** `src/components/tools/FileUploader.tsx`

---

### 4. `tool_started` (PostHog + Backend)
Fired when processing begins.

| Property | Type | Example |
|----------|------|---------|
| `tool_name` | string | `batch` |
| `file_type` | string | `application/pdf` |
| `file_size` | number | `2457600` |
| `file_count` | number | `3` |

**Source:** `src/lib/hooks/useBatchProcessing.ts`
**Backend:** stored in `tool_events` table.

---

### 5. `tool_completed` (PostHog + Backend)
Fired when processing succeeds.

| Property | Type | Example |
|----------|------|---------|
| `tool_name` | string | `batch` |
| `processing_time_ms` | number | `4321` |
| `file_count` | number | `3` |
| `output_type` | string | `application/pdf` |

**Source:** `src/lib/hooks/useBatchProcessing.ts`
**Backend:** stored in `tool_events` table.

---

### 6. `download_clicked` (PostHog + Backend)
Fired when the user clicks the Download button.

| Property | Type | Example |
|----------|------|---------|
| `tool_name` | string | `compress-pdf` |
| `output_type` | string | `pdf` |

**Source:** `src/components/tools/DownloadButton.tsx`
**Backend:** stored in `tool_events` table.

---

### 7. `processing_failed` (PostHog + Backend)
Fired when processing throws an error.

| Property | Type | Example |
|----------|------|---------|
| `tool_name` | string | `batch` |
| `error_code` | string | `""` |
| `error_message` | string | `Failed to compress PDF` (sanitized) |
| `step` | string | `processing` |

**Source:** `src/lib/hooks/useBatchProcessing.ts`
**Backend:** stored in `tool_events` table.

---

### 8. `ad_clicked` (PostHog only)
Fired when a user clicks an AdSlot (future monetisation).

| Property | Type | Example |
|----------|------|---------|
| `ad_position` | string | `sidebar` |
| `page` | string | `/en/tools/compress-pdf` |
| `tool_name` | string | `compress-pdf` |

---

### 9. `ad_viewed` (PostHog only)
Fired on AdSlot mount (impression tracking).

Same properties as `ad_clicked`.

---

## Backend-Only Events

These four events are sent to `NEXT_PUBLIC_EVENTS_ENDPOINT` (fire-and-forget):

| Event | Why backend? |
|-------|-------------|
| `tool_started` | Funnel start — core business metric |
| `tool_completed` | Completion rate — core business metric |
| `download_clicked` | Value delivered — core business metric |
| `processing_failed` | Error rate — ops metric |

Page views and clicks are PostHog-only (no backend needed).

---

## Session Tracking

- **Session ID:** random UUID, stored in `localStorage` under key `pdfaro_session_id`.
- **User ID:** `null` until auth is implemented. Field exists in schema.
- **Helper:** `src/lib/analytics/session.ts` → `getOrCreateSessionId()`

---

## Environment Variables

```bash
# Required for PostHog (frontend analytics)
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com  # or your self-hosted URL

# Optional: backend business event logging
# Must be a URL that accepts POST with JSON body matching BackendEventPayload
NEXT_PUBLIC_EVENTS_ENDPOINT=https://your-api.com/events/tool
```

---

## Future Metrics (Derivable from Events)

| Metric | How to Calculate |
|--------|-----------------|
| **Tool activation rate** | `tool_started` / unique sessions |
| **Tool completion rate** | `tool_completed` / `tool_started` |
| **Download rate** | `download_clicked` / `tool_completed` |
| **Error rate** | `processing_failed` / `tool_started` |
| **Time to first value** | `tool_completed.created_at - session start` |
| **Return usage rate** | Sessions with >1 `tool_started` / total sessions |
| **Revenue per 1000 users** | Ad clicks × CPM / unique users × 1000 |
| **Top tools** | `COUNT(*) GROUP BY tool_name WHERE event_type = 'tool_completed'` |

---

## Database Schema

See: `docs/sql/create_tool_events.sql`

```sql
tool_events (
  id               UUID PRIMARY KEY,
  session_id       TEXT NOT NULL,
  user_id          TEXT,           -- null until auth
  tool_name        TEXT NOT NULL,
  event_type       TEXT NOT NULL,  -- allowlisted
  file_type        TEXT,
  file_size        BIGINT,
  file_count       INTEGER,
  processing_time_ms INTEGER,
  success          BOOLEAN,
  error_message    TEXT,           -- sanitized, max 200 chars
  created_at       TIMESTAMPTZ DEFAULT NOW()
)
```
