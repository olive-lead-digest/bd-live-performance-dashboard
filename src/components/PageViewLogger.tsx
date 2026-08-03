'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Fires a cheap, non-blocking beacon on every route change so page views land
 * in the audit log (path + the query string, which carries the active filter
 * state). Silently no-ops on any failure — logging must never block or break
 * navigation. Skips the auth pages themselves, since nothing about the
 * dashboard has been "viewed" there yet. Identity is stamped server-side from
 * the session; nothing here says who the user is.
 */
export function PageViewLogger() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === '/login' || pathname === '/reset-password' || pathname.startsWith('/auth/')) return;
    try {
      const query = typeof window !== 'undefined' ? window.location.search.slice(0, 500) : '';
      const body = JSON.stringify({ event: 'page_view', path: pathname, query });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/audit', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(
          () => {}
        );
      }
    } catch {
      /* never break navigation over a logging beacon */
    }
  }, [pathname]);

  return null;
}
