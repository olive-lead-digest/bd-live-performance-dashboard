'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DashData, Lead } from './types';
import { computeDealsRuntime, DealsRuntime } from './dealsRuntime';

export interface Filters {
  from: string;
  to: string;
  region: Set<string>;
  state: Set<string>;
  city: Set<string>;
  cluster: Set<string>;
  brand: Set<string>;
  status: Set<string>;
  tier: Set<string>;
  prop: Set<string>;
  owner: Set<string>;
}

// ---- P1-6: shareable, refresh-safe filter state via URL query params ----
// Serialise the active global filter state to the URL so a pasted link
// reproduces the exact view. Multi-select dimensions become comma-joined
// values (e.g. ?brand=Spark&from=2026-07-01&to=2026-07-08&region=South,West).
// We use window.history.replaceState directly (no useSearchParams) so the
// App-Router build never needs a Suspense boundary, and updates never add a
// history entry or trigger a scroll jump.
const SET_KEYS = ['region', 'state', 'city', 'cluster', 'brand', 'status', 'tier', 'prop', 'owner'] as const;

function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  for (const k of SET_KEYS) {
    const s = f[k] as Set<string>;
    if (s && s.size) p.set(k, Array.from(s).join(','));
  }
  return p.toString();
}

function queryToFilters(search: string): Filters {
  const next: Filters = {
    from: '', to: '',
    region: new Set(), state: new Set(), city: new Set(), cluster: new Set(),
    brand: new Set(), status: new Set(), tier: new Set(), prop: new Set(), owner: new Set(),
  };
  try {
    const p = new URLSearchParams(search || '');
    const from = p.get('from');
    const to = p.get('to');
    // Only accept well-formed ISO dates; silently ignore malformed values.
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) next.from = from;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) next.to = to;
    for (const k of SET_KEYS) {
      const v = p.get(k);
      if (v) next[k] = new Set(v.split(',').map(s => s.trim()).filter(Boolean)) as any;
    }
  } catch {
    /* malformed query string → defaults, never crash */
  }
  return next;
}

function queryHasFilters(f: Filters): boolean {
  return !!(f.from || f.to || SET_KEYS.some(k => (f[k] as Set<string>).size));
}

function writeUrl(f: Filters) {
  if (typeof window === 'undefined') return;
  const qs = filtersToQuery(f);
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  try {
    window.history.replaceState(window.history.state, '', url);
  } catch {
    /* ignore — never let URL sync break the app */
  }
}

interface DashboardContextType {
  data: DashData | null;
  filters: Filters;
  filteredLeads: Lead[];
  /** Deals object recomputed from per-deal records under the active filters
   *  (P0-2). Use `dealsRuntime.deals` in place of `data.deals` in deal modules. */
  dealsRuntime: DealsRuntime;
  /** Timestamp the lead dataset was generated (feed `generated`), snapshotted
   *  once per page load — powers the "Leads data as of …" stamps (P0-3). */
  leadsAsOf: string | null;
  setFilter: (key: keyof Filters, value: string, clear?: boolean) => void;
  setDateRange: (from: string, to: string) => void;
  clearFilters: () => void;
  isLoading: boolean;
  error: string | null;
}

const defaultFilters: Filters = {
  from: '',
  to: '',
  region: new Set(),
  state: new Set(),
  city: new Set(),
  cluster: new Set(),
  brand: new Set(),
  status: new Set(),
  tier: new Set(),
  prop: new Set(),
  owner: new Set()
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashData | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // P1-6 — hydrate filters FROM the URL once on mount (pasted link / reload).
  // Done in an effect (not a lazy initializer) to avoid an SSR hydration
  // mismatch. A ref tracks the latest filters for the nav re-sync below.
  const hydratedRef = useRef(false);
  const filtersRef = useRef<Filters>(filters);
  filtersRef.current = filters;
  const pathname = usePathname();

  useEffect(() => {
    const parsed = queryToFilters(window.location.search);
    if (queryHasFilters(parsed)) setFilters(parsed);
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-append the active filter params after an in-app route change so the URL
  // stays shareable when navigating between pages. Skips the initial mount so
  // it never clobbers the params before hydration reads them.
  const firstNavRef = useRef(true);
  useEffect(() => {
    if (firstNavRef.current) { firstNavRef.current = false; return; }
    if (hydratedRef.current) writeUrl(filtersRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Fetch the real dataset from the server-side API route (which reads the
  // OliveScripts pipeline output). No credentials or raw data in the client bundle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard');
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error || `Failed to load dashboard data (${res.status}).`);
        } else {
          setData(body as DashData);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load dashboard data.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setFilter = (key: keyof Filters, value: string, clear?: boolean) => {
    setFilters(prev => {
      const next = { ...prev };
      if (key === 'from' || key === 'to') return next;

      const set = new Set(prev[key] as Set<string>);
      if (clear) {
        set.clear();
      } else if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }
      next[key] = set as any;
      writeUrl(next); // P1-6: keep URL in sync (no history entry, no scroll)
      return next;
    });
  };

  const setDateRange = (from: string, to: string) => {
    setFilters(prev => {
      const next = { ...prev, from, to };
      writeUrl(next);
      return next;
    });
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
    writeUrl(defaultFilters); // P1-6: Clear-all empties the query params
  };

  const filteredLeads = useMemo(() => {
    if (!data) return [];
    
    return data.leads.filter(l => {
      if (filters.from && l.dt < filters.from) return false;
      if (filters.to && l.dt > filters.to) return false;
      if (filters.region.size && !filters.region.has(l.region)) return false;
      if (filters.state.size && !filters.state.has(l.state)) return false;
      if (filters.city.size && !filters.city.has(l.city)) return false;
      if (filters.cluster.size && !filters.cluster.has(l.cluster)) return false;
      if (filters.brand.size && !filters.brand.has(l.brand)) return false;
      if (filters.tier.size && !filters.tier.has(l.tier)) return false;
      if (filters.owner.size && !(l.owner && filters.owner.has(l.owner))) return false;
      if (filters.prop.size && !filters.prop.has(l.prop)) return false;
      if (filters.status.size && !filters.status.has(l.status || '(unassigned)')) return false;
      return true;
    });
  }, [data, filters]);

  // P0-2 — recompute the deal side from per-deal `records` under the active
  // filters. Degrades to the feed's own aggregates when records are absent or
  // no deal-honourable filter is active (so unfiltered numbers never drift).
  const dealsRuntime = useMemo(
    () => computeDealsRuntime(data?.deals, filters),
    [data, filters]
  );

  // P0-3 — snapshot the leads "data as of" timestamp once per load.
  const leadsAsOf = data?.generated ?? null;

  return (
    <DashboardContext.Provider value={{
      data,
      filters,
      filteredLeads,
      dealsRuntime,
      leadsAsOf,
      setFilter,
      setDateRange,
      clearFilters,
      isLoading,
      error
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider');
  return ctx;
}
