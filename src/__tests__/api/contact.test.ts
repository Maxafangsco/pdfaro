/**
 * Unit tests for /api/contact route
 *
 * The route handler is a plain async function; we test it by constructing
 * NextRequest objects and asserting on the NextResponse it returns.
 * The Resend API call is mocked via vi.stubGlobal('fetch', …) so no real
 * network requests are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callRoute(body: unknown) {
  // Lazy-import after env vars are set so the module picks up the mocked env
  const { POST } = await import('@/app/api/contact/route');
  const req = makeRequest(body);
  const res = await POST(req);
  const json = await res.json();
  return { status: res.status, json };
}

const VALID_BODY = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  subject: 'general',
  message: 'Hello, this is a valid test message long enough.',
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  // Provide required env vars
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.CONTACT_TO_EMAIL = 'to@example.com';
  process.env.CONTACT_FROM_EMAIL = 'from@example.com';

  // Clear call history so each test starts with a fresh spy count
  mockFetch.mockClear();

  // Mock global fetch so no real HTTP requests are made
  vi.stubGlobal('fetch', mockFetch);

  // Default: Resend returns 200 OK
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify({ id: 'email-id-123' }), { status: 200 })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules(); // ensure env changes propagate to re-imported modules
  delete process.env.RESEND_API_KEY;
  delete process.env.CONTACT_TO_EMAIL;
  delete process.env.CONTACT_FROM_EMAIL;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/contact', () => {
  it('returns 200 and success:true for a valid submission', async () => {
    const { status, json } = await callRoute(VALID_BODY);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('calls the Resend API with correct payload', async () => {
    await callRoute(VALID_BODY);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.reply_to).toBe('jane@example.com');
    expect(sent.to).toContain('to@example.com');
    expect(sent.from).toBe('from@example.com');
    expect(sent.subject).toContain('general');
  });

  it('silently accepts (200) when honeypot field is filled — bot protection', async () => {
    const { status, json } = await callRoute({ ...VALID_BODY, _hp: 'spambot' });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    // Resend must NOT be called for bot submissions
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 422 when name is missing', async () => {
    const { status, json } = await callRoute({ ...VALID_BODY, name: '' });
    expect(status).toBe(422);
    expect(json.error).toMatch(/name/i);
  });

  it('returns 422 when email is invalid', async () => {
    const { status, json } = await callRoute({ ...VALID_BODY, email: 'not-an-email' });
    expect(status).toBe(422);
    expect(json.error).toMatch(/email/i);
  });

  it('returns 422 when subject is missing', async () => {
    const { status, json } = await callRoute({ ...VALID_BODY, subject: '' });
    expect(status).toBe(422);
    expect(json.error).toMatch(/subject/i);
  });

  it('returns 422 when message is too short', async () => {
    const { status, json } = await callRoute({ ...VALID_BODY, message: 'Hi' });
    expect(status).toBe(422);
    expect(json.error).toMatch(/message/i);
  });

  it('returns 422 when message exceeds 10 000 characters', async () => {
    const { status, json } = await callRoute({ ...VALID_BODY, message: 'a'.repeat(10_001) });
    expect(status).toBe(422);
    expect(json.error).toMatch(/too long/i);
  });

  it('returns 503 when env vars are not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const { status, json } = await callRoute(VALID_BODY);
    expect(status).toBe(503);
    expect(json.error).toMatch(/not configured/i);
  });

  it('returns 500 when Resend API call fails', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ name: 'missing_api_key' }), { status: 403 })
    );
    const { status, json } = await callRoute(VALID_BODY);
    expect(status).toBe(500);
    expect(json.error).toMatch(/failed/i);
  });

  it('returns 400 for non-JSON body', async () => {
    const req = new NextRequest('http://localhost/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });
    const { POST } = await import('@/app/api/contact/route');
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
