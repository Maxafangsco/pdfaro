import { getOrCreateSessionId } from './session';

export type BackendEventType =
  | 'tool_started'
  | 'tool_completed'
  | 'download_clicked'
  | 'processing_failed';

export interface BackendEventPayload {
  sessionId: string;
  userId: string | null;
  toolName: string;
  eventType: BackendEventType;
  fileType?: string | null;
  fileSize?: number | null;
  fileCount?: number | null;
  processingTimeMs?: number | null;
  success?: boolean | null;
  errorMessage?: string | null;
}

// Supabase column names (snake_case) for PostgREST
interface SupabaseRow {
  session_id: string;
  user_id: string | null;
  tool_name: string;
  event_type: BackendEventType;
  file_type?: string | null;
  file_size?: number | null;
  file_count?: number | null;
  processing_time_ms?: number | null;
  success?: boolean | null;
  error_message?: string | null;
}

const ALLOWED_EVENT_TYPES: BackendEventType[] = [
  'tool_started',
  'tool_completed',
  'download_clicked',
  'processing_failed',
];

/**
 * Sanitize an error message: strip stack traces and limit length.
 */
export function sanitizeError(message: unknown): string {
  if (!message) return '';
  const str = String(message)
    .split('\n')[0]
    .replace(/at .+/g, '')
    .trim()
    .slice(0, 200);
  return str;
}

/**
 * Fire-and-forget: insert a business event into Supabase via PostgREST.
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * Falls back to NEXT_PUBLIC_EVENTS_ENDPOINT for custom backends.
 * No-op if neither is configured.
 */
export function sendBackendEvent(
  eventType: BackendEventType,
  payload: Omit<BackendEventPayload, 'sessionId' | 'userId' | 'eventType' | 'toolName'> & { toolName: string }
): void {
  if (!ALLOWED_EVENT_TYPES.includes(eventType)) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const customEndpoint = process.env.NEXT_PUBLIC_EVENTS_ENDPOINT;

  if (!supabaseUrl && !customEndpoint) return;

  const sessionId = getOrCreateSessionId();

  try {
    if (supabaseUrl && supabaseKey) {
      // Supabase PostgREST — snake_case column names
      const row: SupabaseRow = {
        session_id: sessionId,
        user_id: null,
        tool_name: payload.toolName,
        event_type: eventType,
        file_type: payload.fileType ?? null,
        file_size: payload.fileSize ?? null,
        file_count: payload.fileCount ?? null,
        processing_time_ms: payload.processingTimeMs ?? null,
        success: payload.success ?? null,
        error_message: payload.errorMessage ?? null,
      };

      fetch(`${supabaseUrl}/rest/v1/tool_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(row),
        keepalive: true,
      }).catch(() => {});
    } else if (customEndpoint) {
      // Custom backend — camelCase body as before
      const body: BackendEventPayload = {
        sessionId,
        userId: null,
        eventType,
        ...payload,
      };

      fetch(customEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // fetch threw (SSR / unsupported env) — ignore
  }
}
