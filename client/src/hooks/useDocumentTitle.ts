import { useEffect } from 'react';

const APP_NAME = 'Quotation System';

/**
 * Set the browser tab title (and, as a side effect, the title the browser
 * uses when it injects a "header" into a printed page). Use a short title per
 * page like "Invoice INV-0001 — Acme Co.". Pass `null` to reset to the bare
 * app name (useful while a page is still loading).
 *
 * Resets to the app name on unmount so leaving a page doesn't leave the
 * stale per-page title behind.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
