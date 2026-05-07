'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';

/**
 * Captures page views on route change.
 * Renders nothing — pure side-effect component.
 * PostHog is initialised in instrumentation-client.ts.
 *
 * Wrap the app with this inside a <Suspense> boundary (required for
 * useSearchParams in Next.js App Router static export).
 */
export function PostHogProvider({ locale }: { locale?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPath = useRef<string>('');

  // Fire page_view on every route change
  useEffect(() => {
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
