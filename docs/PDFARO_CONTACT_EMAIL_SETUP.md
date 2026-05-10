# PDFaro — Contact Form Email Setup

This document explains how to wire up the contact form so messages are
delivered to your inbox via [Resend](https://resend.com).

---

## Why static export breaks API routes

Next.js `output: 'export'` generates a fully static site (HTML/JS/CSS files in
`out/`). **Static sites have no server**, so there is nowhere to run
`/api/contact` — Next.js will refuse to build a project that has both
`output: 'export'` and API routes.

PDFaro conditionally enables static export **only when `TAURI_ENV=true`** (the
Tauri desktop build). On Vercel, `TAURI_ENV` is not set, so the build runs in
normal serverless mode and the `/api/contact` route works as a Vercel
Serverless Function.

```
TAURI_ENV=true  →  output: 'export'  (Tauri desktop)
TAURI_ENV unset →  serverless        (Vercel / any Node.js host)
```

---

## Required environment variables

Set these in `.env.local` for local development, and in Vercel's Environment
Variables panel for production.

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Your Resend API key — **never** prefix with `NEXT_PUBLIC_` |
| `CONTACT_TO_EMAIL` | Inbox that receives contact-form submissions |
| `CONTACT_FROM_EMAIL` | Sender address shown in the From: field (must be a Resend-verified domain) |

### Example `.env.local`

```dotenv
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxx
CONTACT_TO_EMAIL=max@yourdomain.com
CONTACT_FROM_EMAIL=contact@yourdomain.com
```

> **Security note:** `RESEND_API_KEY` is only read inside the serverless
> function (`src/app/api/contact/route.ts`). It is never bundled into the
> client-side JavaScript. Do not add it to any `NEXT_PUBLIC_*` variable.

---

## Step-by-step: creating a Resend account and API key

1. Sign up at <https://resend.com> (free tier: 3 000 emails/month).
2. Go to **API Keys → Create API Key**.
   - Choose "Sending access" — the key only needs permission to send emails.
3. Copy the key and add it as `RESEND_API_KEY` in your environment.

---

## Domain verification and DNS records

Resend requires you to prove ownership of the sending domain. Without this,
emails land in spam or are rejected outright.

### Adding your domain in Resend

1. In the Resend dashboard, go to **Domains → Add Domain**.
2. Enter the domain you want to send from (e.g. `yourdomain.com`).
3. Resend will display the exact DNS records to add — copy them straight from
   the dashboard.

### DNS records to add (Namecheap step-by-step)

Resend's dashboard shows four records across three sections. Go to your domain
in Namecheap → **Advanced DNS → Add New Record** for each one.

> **Namecheap host field rule:** Namecheap appends your domain automatically.
> If Resend shows `resend._domainkey.yourdomain.com`, type only
> `resend._domainkey` in the Host box.

---

#### Section 1 — DKIM (Domain Verification)

| Namecheap field | What to enter |
|---|---|
| **Type** | `TXT Record` |
| **Host** | `resend._domainkey` |
| **Value** | The full `p=MIGf…` string Resend shows |
| **TTL** | Automatic |

---

#### Section 2 — SPF / Enable Sending (two records)

**Record A — MX**

Namecheap does have MX records. In the **Type** dropdown choose
**`MX Record`** (it is listed there, scroll past A/AAAA/CAA/CNAME).

| Namecheap field | What to enter |
|---|---|
| **Type** | `MX Record` |
| **Host** | `send` |
| **Value / Mail Server** | `feedback-smtp.us-east-1.amazonses.com` |
| **Priority** | `10` |
| **TTL** | Automatic |

**Record B — TXT (SPF)**

| Namecheap field | What to enter |
|---|---|
| **Type** | `TXT Record` |
| **Host** | `send` |
| **Value** | `v=spf1 include:amazonses.com ~all` |
| **TTL** | Automatic |

---

#### Section 3 — DMARC (Optional)

| Namecheap field | What to enter |
|---|---|
| **Type** | `TXT Record` |
| **Host** | `_dmarc` |
| **Value** | `v=DMARC1; p=none;` |
| **TTL** | Automatic |

---

> DNS propagation usually completes within minutes. Click **Verify** in the
> Resend dashboard to confirm. Full propagation can take up to 48 hours.

### Subdomain senders (recommended)

The records above use the `send` subdomain, so set your env var to match:

```
CONTACT_FROM_EMAIL=contact@send.yourdomain.com
```

---

## Testing delivery locally

1. Create `.env.local` with the three required variables.
2. Run the dev server:

   ```bash
   npm run dev
   ```

3. Open the contact form at `http://localhost:3000/en/contact` and submit it.
4. Check Resend's **Logs** dashboard — you should see the email appear within
   seconds.
5. Check your `CONTACT_TO_EMAIL` inbox.

### Testing with curl

```bash
curl -X POST http://localhost:3000/api/contact \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "subject": "general",
    "message": "This is a test message from curl."
  }'
```

Expected success response:

```json
{ "success": true }
```

### Common errors

| HTTP status | `error` field | Cause |
|---|---|---|
| `422` | "Name is required." | Validation failed — check the request body |
| `503` | "Email service is not configured…" | One or more env vars are missing |
| `500` | "Failed to send your message…" | Resend API returned an error — check API key & domain verification |

---

## Spam protection

The contact form includes a **honeypot field** (`name="_hp"`). It is visually
hidden and set to `aria-hidden` so real users never see or interact with it.
Bots that auto-fill every form field will populate it. The server silently
returns `200` (to avoid tipping off the bot) but does **not** call the Resend
API, so no email is sent.

This is a lightweight, zero-dependency anti-spam measure. For heavier traffic
you can complement it with Cloudflare Turnstile or hCaptcha.

---

## Vercel deployment

1. In the Vercel dashboard, open your project → **Settings → Environment
   Variables**.
2. Add `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, and `CONTACT_FROM_EMAIL` for the
   **Production** environment (and optionally Preview).
3. Re-deploy the project — the variables take effect on the next build.
4. Make sure **`TAURI_ENV` is not set** in Vercel — the absence of that
   variable is what keeps static export disabled and allows the API route to
   function.
