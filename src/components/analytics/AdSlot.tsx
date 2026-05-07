'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackAdViewed, trackAdClicked } from '@/lib/analytics';

export interface AdSlotProps {
  /** Where on the page this ad appears, e.g. "sidebar", "below-tool", "footer" */
  position: string;
  /** Optional tool name if ad is shown on a tool page */
  toolName?: string;
  /** Additional class names for the container */
  className?: string;
}

/**
 * AdSlot — placeholder component for future ad placements.
 *
 * Tracks impressions (ad_viewed) on mount and click events (ad_clicked).
 * Replace the inner <div> with your real ad tag (e.g. Google AdSense, Carbon)
 * when monetisation is enabled.
 *
 * Usage:
 *   <AdSlot position="sidebar" toolName="compress-pdf" />
 */
export function AdSlot({ position, toolName, className = '' }: AdSlotProps) {
  const pathname = usePathname();
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    try {
      trackAdViewed({ adPosition: position, page: pathname, toolName });
    } catch { /* never block rendering */ }
  }, [position, pathname, toolName]);

  const handleClick = () => {
    try {
      trackAdClicked({ adPosition: position, page: pathname, toolName });
    } catch { /* never block interaction */ }
  };

  // Placeholder — replace with real ad content when ready
  return (
    <div
      className={`pdfaro-ad-slot ${className}`}
      data-ad-position={position}
      onClick={handleClick}
      aria-hidden="true"
      style={{ display: 'none' }} // hidden until real ads are wired in
    />
  );
}
