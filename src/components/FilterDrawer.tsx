'use client';

import { X } from 'lucide-react';
import { useDashboard } from '@/lib/DashboardContext';
import clsx from 'clsx';
import { useMemo } from 'react';

// Tier removed (analyst correction — the feed no longer carries a lead tier).
const FILTER_CONFIG = [
  { key: 'brand', label: 'Brand' },
  { key: 'region', label: 'Region' },
  { key: 'status', label: 'Status' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'state', label: 'State' },
  { key: 'city', label: 'City' },
  { key: 'prop', label: 'Property Status' },
  { key: 'owner', label: 'BD Rep' }
] as const;

const parseDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function FilterDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { data, filters, setFilter, clearFilters, setDateRange } = useDashboard();

  // Extract unique values from data for dropdowns
  const options = useMemo(() => {
    if (!data) return {} as Record<string, string[]>;
    const res: Record<string, Set<string>> = {};
    FILTER_CONFIG.forEach(c => res[c.key] = new Set());

    data.leads.forEach(l => {
      if (l.brand) res.brand.add(l.brand);
      if (l.region) res.region.add(l.region);
      if (l.status) res.status.add(l.status);
      else res.status.add('(unassigned)');
      if (l.cluster) res.cluster.add(l.cluster);
      if (l.state) res.state.add(l.state);
      if (l.city) res.city.add(l.city);
      if (l.prop) res.prop.add(l.prop);
      if (l.owner) res.owner.add(l.owner);
    });

    const final: Record<string, string[]> = {};
    Object.keys(res).forEach(k => {
      final[k] = Array.from(res[k]).filter(Boolean).sort();
    });
    return final;
  }, [data]);

  // Quick duration presets, computed relative to the latest date present in the data.
  const presets = useMemo(() => {
    const arr: { label: string; from: string; to: string }[] = [{ label: 'All time', from: '', to: '' }];
    if (!data?.leads?.length) return arr;
    const maxDt = data.leads.reduce((m, l) => (l.dt && l.dt > m ? l.dt : m), '0000-00-00');
    if (maxDt === '0000-00-00') return arr;
    const end = parseDate(maxDt);
    const startOfMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    const lmStart = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const lmEnd = new Date(end.getFullYear(), end.getMonth(), 0);
    const d30 = new Date(end); d30.setDate(end.getDate() - 29);
    const d90 = new Date(end); d90.setDate(end.getDate() - 89);
    const q = Math.floor(end.getMonth() / 3);
    const qStart = new Date(end.getFullYear(), q * 3, 1);
    const yStart = new Date(end.getFullYear(), 0, 1);
    arr.push(
      { label: 'Last 30 days', from: fmtDate(d30), to: fmtDate(end) },
      { label: 'Last 90 days', from: fmtDate(d90), to: fmtDate(end) },
      { label: 'This month', from: fmtDate(startOfMonth), to: fmtDate(end) },
      { label: 'Last month', from: fmtDate(lmStart), to: fmtDate(lmEnd) },
      { label: 'This quarter', from: fmtDate(qStart), to: fmtDate(end) },
      { label: 'This year', from: fmtDate(yStart), to: fmtDate(end) },
    );
    return arr;
  }, [data]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-panel border-l border-border-subtle shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-white">Filters</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Duration</span>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => {
                const isActive = filters.from === p.from && filters.to === p.to;
                return (
                  <button
                    key={p.label}
                    onClick={() => setDateRange(p.from, p.to)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border",
                      isActive
                        ? "bg-brand-pink-500/20 border-brand-pink-500/60 text-white shadow-[0_0_10px_rgba(218,26,132,0.3)]"
                        : "bg-surface border-border-subtle text-text-secondary hover:text-white hover:border-brand-pink-500/40"
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-1">
              <input
                type="date"
                value={filters.from}
                onChange={(e) => setDateRange(e.target.value, filters.to)}
                className="flex-1 bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-purple-400"
              />
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setDateRange(filters.from, e.target.value)}
                className="flex-1 bg-surface border border-border-subtle rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-purple-400"
              />
            </div>
          </div>

          {FILTER_CONFIG.map(({ key, label }) => {
            const list = options[key] || [];
            if (!list.length) return null;
            const activeSet = filters[key as keyof typeof filters] as Set<string>;

            return (
              <div key={key} className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex justify-between">
                  {label} {activeSet.size > 0 && <span className="text-brand-pink-400">({activeSet.size})</span>}
                </span>
                <div className="flex flex-wrap gap-2">
                  {list.map(val => {
                    const isActive = activeSet.has(val);
                    return (
                      <button
                        key={val}
                        onClick={() => setFilter(key as any, val)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border",
                          isActive
                            ? "bg-brand-purple-600/50 border-brand-purple-400 text-white shadow-[0_0_10px_rgba(80,40,117,0.3)]"
                            : "bg-surface border-border-subtle text-text-secondary hover:text-white hover:border-brand-purple-800"
                        )}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-6 border-t border-border-subtle flex gap-3">
          <button
            onClick={clearFilters}
            className="flex-1 py-2.5 rounded-xl border border-border-subtle text-sm font-semibold text-white hover:bg-surface transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-brand-pink-500 text-sm font-bold text-white hover:bg-brand-pink-400 transition-colors shadow-[0_0_15px_rgba(218,26,132,0.4)]"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
