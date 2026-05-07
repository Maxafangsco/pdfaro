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
    .split('\n')[0]   // first line only — no stack trace
    .replace(/at .+/g, '')  // remove "at ..." frames
    .trim()
    .slice(0, 200);   // cap at 200 chars
  return str;
}

/**
 * Fire-and-forget: send a business event to the configured backend endpoint.
 * If the endpoint is not configured or the call fails, this is a no-op.
 *
 * Configure via: NEXT_PUBLIC_EVENTS_ENDPOINT=https://your-backend/events/tool
 */
export function sendBackendEvent(
  eventType: BackendEventType,
  payload: Omit<BackendEventPayload, 'sessionId' | 'userId' | 'eventType' | 'toolName'> & { toolName: string }
): void {
  const endpoint = process.env.NEXT_PUBLIC_EVENTS_ENDPOINT;
  if (!endpoint) return;
  if (!ALLOWED_EVENT_TYPES.includes(eventType)) return;

  const body: BackendEventPayload = {
    sessionId: getOrCreateSessionId(),
    userId: null, // attach when auth is implemented
    eventType,
    ...payload,
  };

  try {
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true, // survives page unload
    }).catch(() => {
      // Silently ignore network errors — never block the user
    });
  } catch {
    // fetch itself threw (SSR / unsupported env) — ignore
  }
}
