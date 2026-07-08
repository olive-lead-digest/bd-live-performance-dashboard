'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
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
      return next;
    });
  };

  const setDateRange = (from: string, to: string) => {
    setFilters(prev => ({ ...prev, from, to }));
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
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
