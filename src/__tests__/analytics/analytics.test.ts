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
