const SESSION_KEY = 'pdfaro_session_id';

/**
 * Generate a random anonymous session ID.
 * Uses crypto.randomUUID when available, falls back to a manual UUID v4.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Return the existing session ID from localStorage or create a new one.
 * Safe to call on the server (returns empty string) and during SSR.
 */
export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = generateId();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // localStorage blocked (private mode, etc.) — return a per-call ID
    return generateId();
  }
}
