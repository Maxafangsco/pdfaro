import posthog from 'posthog-js';

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

// This file can be executed very early in the client bootstrap.
// Ensure analytics never breaks core UX (like file upload/processing).
if (typeof window !== 'undefined' && posthogKey) {
  try {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: '2026-01-30',
      capture_exceptions: true,
      debug: process.env.NODE_ENV === 'development',
    });
  } catch {
    // PostHog must never break the app
  }
}
