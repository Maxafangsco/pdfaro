'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';

let initialised = false;

/**
 * Initialise PostHog once and capture page views on route change.
 * Renders nothing — pure side-effect component.
 *
 * Wrap the app with this inside a <Suspense> boundary (required for
 * useSearchParams in Next.js App Router static export).
 */
export function PostHogProvider({ locale }: { locale?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPath = useRef<string>('');

  // Initialise PostHog on first client mount
  useEffect(() => {
    if (!POSTHOG_KEY || initialised) return;

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,   // manual — we control when to fire
      capture_pageleave: true,
      autocapture: false,         // keep bundle lean; explicit tracking only
      persistence: 'localStorage+cookie',
      bootstrap: {},
    });

    initialised = true;
  }, []);

  // Fire page_view on every route change
  useEffect(() => {
    if (!POSTHOG_KEY) return;

    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    if (url === prevPath.current) return;
    prevPath.current = url;

    try {
      posthog.capture('$pageview', {
        $current_url: url,
        path: pathname,
        locale: locale ?? '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      });
    } catch {
      // PostHog must never break the app
    }
  }, [pathname, searchParams, locale]);

  return null;
}
