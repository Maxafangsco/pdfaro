/**
 * PDFaro Analytics Wrapper
 *
 * Single entry point for all analytics. Never call posthog directly in components.
 * All functions are safe to call server-side (no-ops) and never throw.
 *
 * PostHog events:  all events
 * Backend events:  tool_started, tool_completed, download_clicked, processing_failed only
 */

import { sendBackendEvent, sanitizeError } from './analytics/backend';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolMeta {
  toolName: string;
  toolCategory?: string;
  sourcePage?: string;
}

export interface FileMeta {
  toolName: string;
  fileType: string;   // e.g. "application/pdf"
  fileSize: number;   // bytes
  fileCount: number;
}

export interface CompletionMeta {
  toolName: string;
  processingTimeMs: number;
  fileCount: number;
  outputType: string;
}

export interface FailureMeta {
  toolName: string;
  errorCode?: string;
  errorMessage?: string;
  step?: string;
}

export interface AdMeta {
  adPosition: string;
  page: string;
  toolName?: string;
}

// ─── PostHog helper (lazy import to avoid SSR issues) ─────────────────────────

function ph() {
  if (typeof window === 'undefined') return null;
  try {
    // posthog-js attaches itself to window after init
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).posthog ?? null;
  } catch {
    return null;
  }
}

function capture(event: string, properties: Record<string, unknown>): void {
  try {
    ph()?.capture(event, properties);
  } catch {
    // PostHog failure must never break the app
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Page view — called automatically by PostHogProvider via usePathname.
 * Manual call available for SPAs that need explicit control.
 */
export function trackPageView(path: string, referrer?: string, locale?: string): void {
  capture('page_view', {
    path,
    referrer: referrer ?? (typeof document !== 'undefined' ? document.referrer : ''),
    locale: locale ?? '',
  });
}

/**
 * User clicked a tool card or tool link.
 */
export function trackToolClicked(meta: ToolMeta): void {
  capture('tool_clicked', {
    tool_name: meta.toolName,
    tool_category: meta.toolCategory ?? '',
    source_page: meta.sourcePage ?? '',
  });
}

/**
 * User selected files in the upload zone.
 */
export function trackFileUploaded(meta: FileMeta): void {
  capture('file_uploaded', {
    tool_name: meta.toolName,
    file_type: meta.fileType,
    file_size: meta.fileSize,
    file_count: meta.fileCount,
    // ⚠️ Never include file names or content
  });
}

/**
 * Processing started (Process button clicked).
 */
export function trackToolStarted(meta: FileMeta): void {
  capture('tool_started', {
    tool_name: meta.toolName,
    file_type: meta.fileType,
    file_size: meta.fileSize,
    file_count: meta.fileCount,
  });

  sendBackendEvent('tool_started', {
    toolName: meta.toolName,
    fileType: meta.fileType,
    fileSize: meta.fileSize,
    fileCount: meta.fileCount,
  });
}

/**
 * Processing completed successfully.
 */
export function trackToolCompleted(meta: CompletionMeta): void {
  capture('tool_completed', {
    tool_name: meta.toolName,
    processing_time_ms: meta.processingTimeMs,
    file_count: meta.fileCount,
    output_type: meta.outputType,
  });

  sendBackendEvent('tool_completed', {
    toolName: meta.toolName,
    processingTimeMs: meta.processingTimeMs,
    fileCount: meta.fileCount,
    fileType: meta.outputType,
    success: true,
  });
}

/**
 * User clicked the Download button.
 */
export function trackDownloadClicked(toolName: string, outputType: string): void {
  capture('download_clicked', {
    tool_name: toolName,
    output_type: outputType,
  });

  sendBackendEvent('download_clicked', {
    toolName,
    fileType: outputType,
    success: true,
  });
}

/**
 * Processing failed with an error.
 */
export function trackProcessingFailed(meta: FailureMeta): void {
  const safeMessage = sanitizeError(meta.errorMessage);

  capture('processing_failed', {
    tool_name: meta.toolName,
    error_code: meta.errorCode ?? '',
    error_message: safeMessage,
    step: meta.step ?? '',
  });

  sendBackendEvent('processing_failed', {
    toolName: meta.toolName,
    errorMessage: safeMessage,
    success: false,
  });
}

/**
 * Ad clicked — for future monetisation.
 */
export function trackAdClicked(meta: AdMeta): void {
  capture('ad_clicked', {
    ad_position: meta.adPosition,
    page: meta.page,
    tool_name: meta.toolName ?? '',
  });
}

/**
 * Ad viewed (impression) — for future monetisation.
 */
export function trackAdViewed(meta: AdMeta): void {
  capture('ad_viewed', {
    ad_position: meta.adPosition,
    page: meta.page,
    tool_name: meta.toolName ?? '',
  });
}
