'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Deep-linkable in-page tab state via a URL query param, WITHOUT next/navigation
 * useSearchParams (which would force a Suspense boundary in the App-Router build).
 * Reads the initial value from window.location.search on mount (so redirects like
 * /ranking -> /team?tab=ranking land on the right tab) and mirrors changes back to
 * the URL with history.replaceState (no new history entry, no scroll jump).
 */
export function useUrlTab(param: string, valid: readonly string[], fallback: string) {
  const [tab, setTab] = useState<string>(fallback);

  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get(param);
      if (v && valid.includes(v)) setTab(v);
    } catch {
      /* ignore — fall back to default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (v: string) => {
      setTab(v);
      try {
        const p = new URLSearchParams(window.location.search);
        p.set(param, v);
        const qs = p.toString();
        window.history.replaceState(
          window.history.state,
          '',
          qs ? `${window.location.pathname}?${qs}` : window.location.pathname
        );
      } catch {
        /* ignore — never let URL sync break the tab */
      }
    },
    [param]
  );

  return [tab, update] as const;
}
