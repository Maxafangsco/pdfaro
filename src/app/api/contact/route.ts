import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactBody {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  /** Honeypot – must be empty; bots fill it automatically */
  _hp?: unknown;
}

interface ResendPayload {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateBody(body: ContactBody): string | null {
  if (typeof body.name !== 'string' || body.name.trim().length < 1) {
    return 'Name is required.';
  }
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email.trim())) {
    return 'A valid email address is required.';
  }
  if (typeof body.subject !== 'string' || body.subject.trim().length < 1) {
    return 'Subject is required.';
  }
  if (typeof body.message !== 'string' || body.message.trim().length < 10) {
    return 'Message must be at least 10 characters.';
  }
  if (body.message.trim().length > 10_000) {
    return 'Message is too long (max 10 000 characters).';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------

function buildHtml(name: string, email: string, subject: string, message: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Contact: ${escape(subject)}</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
  <h2 style="margin-top:0">New contact message</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <tr><th style="text-align:left;padding:6px 12px 6px 0;width:80px">From</th>
        <td style="padding:6px 0">${escape(name)} &lt;${escape(email)}&gt;</td></tr>
    <tr><th style="text-align:left;padding:6px 12px 6px 0">Subject</th>
        <td style="padding:6px 0">${escape(subject)}</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
  <p style="white-space:pre-wrap;line-height:1.6">${escape(message)}</p>
  <hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0">
  <p style="font-size:12px;color:#666">
    Reply directly to this email to respond to ${escape(name)}.
  </p>
</body>
</html>`;
}

function buildText(name: string, email: string, subject: string, message: string): string {
  return [
    `New contact message`,
    `From: ${name} <${email}>`,
    `Subject: ${subject}`,
    ``,
    message,
  ].join('\n');
}

async function sendViaResend(payload: ResendPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');

    // 403 validation_error means CONTACT_FROM_EMAIL is not a verified Resend domain.
    // Treat this as a configuration error so callers can distinguish it from a
    // transient send failure.
    if (res.status === 403) {
      const err = new Error(`Resend API error ${res.status}: ${detail}`) as Error & { isConfigError: true };
      err.isConfigError = true;
      throw err;
    }

    throw new Error(`Resend API error ${res.status}: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- Parse body ---
  let body: ContactBody;
  try {
    body = (await req.json()) as ContactBody;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // --- Honeypot: bots fill this field; real users never see it ---
  if (body._hp) {
    // Return 200 to avoid giving bots useful feedback
    return NextResponse.json({ success: true });
  }

  // --- Validate fields ---
  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 422 });
  }

  const name = (body.name as string).trim();
  const email = (body.email as string).trim();
  const subject = (body.subject as string).trim();
  const message = (body.message as string).trim();

  // --- Check required env vars ---
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!toEmail || !fromEmail || !process.env.RESEND_API_KEY) {
    console.error('[/api/contact] Email environment variables are not configured.');
    return NextResponse.json(
      { error: 'Email service is not configured. Please try again later.' },
      { status: 503 }
    );
  }

  // --- Send ---
  try {
    await sendViaResend({
      from: fromEmail,
      to: [toEmail],
      reply_to: email,
      subject: `[PDFaro Contact] ${subject} — ${name}`,
      html: buildHtml(name, email, subject, message),
      text: buildText(name, email, subject, message),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const isConfigError = (err as { isConfigError?: boolean }).isConfigError === true;

    if (isConfigError) {
      // CONTACT_FROM_EMAIL is not a Resend-verified domain (e.g. a Gmail address was used).
      // Hint: use onboarding@resend.dev for dev, or verify your own domain for production.
      console.error(
        '[/api/contact] CONTACT_FROM_EMAIL is not a verified Resend domain. ' +
        'For local dev use CONTACT_FROM_EMAIL=onboarding@resend.dev. ' +
        'For production, verify your domain at https://resend.com/domains.',
        err
      );
      return NextResponse.json(
        { error: 'Email service is not configured correctly. Please try again later.' },
        { status: 503 }
      );
    }

    console.error('[/api/contact] Failed to send email:', err);
    return NextResponse.json(
      { error: 'Failed to send your message. Please try again later.' },
      { status: 500 }
    );
  }
}

// Disable static generation — this route must always be a dynamic serverless function
export const dynamic = 'force-dynamic';
