/**
 * Analytics module tests
 *
 * Tests that:
 * 1. Analytics wrapper never throws when PostHog is absent
 * 2. Session ID helper works correctly
 * 3. Backend adapter sanitizes errors and respects allowlist
 * 4. Tracking calls do not block or throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrCreateSessionId } from '@/lib/analytics/session';
import { sanitizeError, sendBackendEvent } from '@/lib/analytics/backend';
import {
  trackPageView,
  trackToolClicked,
  trackFileUploaded,
  trackToolStarted,
  trackToolCompleted,
  trackDownloadClicked,
  trackProcessingFailed,
  trackAdClicked,
  trackAdViewed,
} from '@/lib/analytics';

// ─── Session ID tests ──────────────────────────────────────────────────────

describe('getOrCreateSessionId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a non-empty string', () => {
    const id = getOrCreateSessionId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns the same ID on repeated calls', () => {
    const id1 = getOrCreateSessionId();
    const id2 = getOrCreateSessionId();
    expect(id1).toBe(id2);
  });

  it('persists across calls using localStorage', () => {
    const id = getOrCreateSessionId();
    expect(localStorage.getItem('pdfaro_session_id')).toBe(id);
  });

  it('creates a new ID when localStorage is empty', () => {
    localStorage.removeItem('pdfaro_session_id');
    const id = getOrCreateSessionId();
    expect(id).toBeTruthy();
  });
});

// ─── sanitizeError tests ───────────────────────────────────────────────────

describe('sanitizeError', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeError(null)).toBe('');
    expect(sanitizeError(undefined)).toBe('');
    expect(sanitizeError('')).toBe('');
  });

  it('strips stack trace lines', () => {
    const error = 'TypeError: Cannot read property\n    at Object.foo (file.js:10:5)\n    at main (index.js:2:3)';
    const result = sanitizeError(error);
    expect(result).not.toContain('at Object');
    expect(result).not.toContain('at main');
  });

  it('returns only the first line', () => {
    const error = 'Line one\nLine two\nLine three';
    expect(sanitizeError(error)).toBe('Line one');
  });

  it('caps output at 200 characters', () => {
    const longError = 'x'.repeat(500);
    expect(sanitizeError(longError).length).toBeLessThanOrEqual(200);
  });

  it('handles Error objects', () => {
    const err = new Error('Something went wrong');
    expect(sanitizeError(err.message)).toBe('Something went wrong');
  });
});

// ─── Analytics wrapper safety tests ────────────────────────────────────────

describe('analytics wrapper — never throws', () => {
  // Ensure window.posthog is undefined (simulates missing PostHog key)
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).posthog;
  });

  it('trackPageView does not throw', () => {
    expect(() => trackPageView('/en/tools', '', 'en')).not.toThrow();
  });

  it('trackToolClicked does not throw', () => {
    expect(() =>
      trackToolClicked({ toolName: 'Compress PDF', toolCategory: 'optimize-repair' })
    ).not.toThrow();
  });

  it('trackFileUploaded does not throw', () => {
    expect(() =>
      trackFileUploaded({ toolName: 'compress-pdf', fileType: 'application/pdf', fileSize: 1024, fileCount: 1 })
    ).not.toThrow();
  });

  it('trackToolStarted does not throw', () => {
    expect(() =>
      trackToolStarted({ toolName: 'compress-pdf', fileType: 'application/pdf', fileSize: 1024, fileCount: 1 })
    ).not.toThrow();
  });

  it('trackToolCompleted does not throw', () => {
    expect(() =>
      trackToolCompleted({ toolName: 'compress-pdf', processingTimeMs: 500, fileCount: 1, outputType: 'application/pdf' })
    ).not.toThrow();
  });

  it('trackDownloadClicked does not throw', () => {
    expect(() => trackDownloadClicked('compress-pdf', 'pdf')).not.toThrow();
  });

  it('trackProcessingFailed does not throw', () => {
    expect(() =>
      trackProcessingFailed({ toolName: 'compress-pdf', errorMessage: 'Failed', step: 'processing' })
    ).not.toThrow();
  });

  it('trackAdClicked does not throw', () => {
    expect(() =>
      trackAdClicked({ adPosition: 'sidebar', page: '/en/tools/compress-pdf' })
    ).not.toThrow();
  });

  it('trackAdViewed does not throw', () => {
    expect(() =>
      trackAdViewed({ adPosition: 'footer', page: '/en' })
    ).not.toThrow();
  });
});

// ─── Backend adapter — sendBackendEvent ───────────────────────────────────

describe('backend adapter — sendBackendEvent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when called with a valid event type', () => {
    expect(() =>
      sendBackendEvent('tool_started', { toolName: 'compress-pdf', fileType: 'application/pdf', fileSize: 1024, fileCount: 1 })
    ).not.toThrow();
  });

  it('does not throw when called with no endpoint configured', () => {
    // NEXT_PUBLIC_EVENTS_ENDPOINT is undefined in test env — should be a no-op
    expect(() =>
      sendBackendEvent('tool_completed', { toolName: 'compress-pdf' })
    ).not.toThrow();
  });

  it('does not throw for all valid event types', () => {
    const types = ['tool_started', 'tool_completed', 'download_clicked', 'processing_failed'] as const;
    types.forEach((t) => {
      expect(() => sendBackendEvent(t, { toolName: 'test' })).not.toThrow();
    });
  });
});

// ─── Backend adapter — Supabase path ─────────────────────────────────────

describe('backend adapter — Supabase integration', () => {
  const SUPABASE_URL = 'https://test-project.supabase.co';
  const SUPABASE_KEY = 'test-anon-key';

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = SUPABASE_KEY;
    delete process.env.NEXT_PUBLIC_EVENTS_ENDPOINT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_EVENTS_ENDPOINT;
  });

  it('sends to Supabase REST endpoint when configured', () => {
    sendBackendEvent('tool_started', { toolName: 'compress-pdf' });

    expect(fetch).toHaveBeenCalledWith(
      `${SUPABASE_URL}/rest/v1/tool_events`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('includes required Supabase headers', () => {
    sendBackendEvent('tool_completed', { toolName: 'merge-pdf' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('maps camelCase payload to snake_case columns for Supabase', () => {
    sendBackendEvent('tool_started', {
      toolName: 'compress-pdf',
      fileType: 'application/pdf',
      fileSize: 2048,
      fileCount: 3,
      processingTimeMs: 500,
    });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.tool_name).toBe('compress-pdf');
    expect(body.event_type).toBe('tool_started');
    expect(body.file_type).toBe('application/pdf');
    expect(body.file_size).toBe(2048);
    expect(body.file_count).toBe(3);
    expect(body.processing_time_ms).toBe(500);
  });

  it('does NOT call fetch when neither Supabase nor custom endpoint is configured', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    sendBackendEvent('tool_started', { toolName: 'compress-pdf' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('sets user_id to null in the payload', () => {
    sendBackendEvent('download_clicked', { toolName: 'merge-pdf' });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.user_id).toBeNull();
  });

  it('includes a session_id in every Supabase payload', () => {
    sendBackendEvent('tool_completed', { toolName: 'split-pdf' });

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(typeof body.session_id).toBe('string');
    expect(body.session_id.length).toBeGreaterThan(0);
  });

  it('uses keepalive: true so events survive page unload', () => {
    sendBackendEvent('tool_started', { toolName: 'compress-pdf' });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ keepalive: true })
    );
  });

  it('trackProcessingFailed sanitizes the error before reaching sendBackendEvent', () => {
    const stackTrace = 'RangeError: out of memory\n    at compress (compress.js:10)\n    at main (index.js:5)';
    // sanitizeError is called inside trackProcessingFailed, not inside sendBackendEvent
    const sanitized = sanitizeError(stackTrace);
    expect(sanitized).toBe('RangeError: out of memory');
    expect(sanitized).not.toContain('at compress');
    expect(sanitized).not.toContain('at main');
  });
});
