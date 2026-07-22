'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { Radio } from 'lucide-react';
import { InfoNote } from '@/components/MobileStatCard';

const num = (n: number) => Math.round(n).toLocaleString('en-IN');
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

/*
 * Leads by acquisition source. Renders only when the feed carries
 * data.leadsBySource (undefined until the pipeline reruns). Each source row
 * shows total leads, active-rate and drop-rate, sorted by total leads desc.
 * Rates are computed over that source's own total (l).
 */
export function LeadsBySourceCard() {
  const { data, dealsRuntime } = useDashboard();

  const rows = useMemo(() => {
    const src = data?.leadsBySource;
    if (!src) return [];
    return Object.entries(src)
      .map(([name, s]) => {
        const l = Number(s?.l) || 0;
        const a = Number(s?.a) || 0;
        const d = Number(s?.d) || 0;
        return { name, l, a, d, activeR: pct(a, l), dropR: pct(d, l) };
      })
      .filter((r) => r.l > 0)
      .sort((a, b) => b.l - a.l);
  }, [data]);

  // Guard: only render when the key exists and has content.
  if (!data?.leadsBySource || rows.length === 0) return null;

  const maxL = rows.reduce((m, r) => Math.max(m, r.l), 0);
  const grandTotal = rows.reduce((s, r) => s + r.l, 0);
  // Item 19 — deal-stage drops (deals.totals.dropped) are shown as a separate,
  // clearly-labelled total: Deals.Lead_Source is null/"NA" for most dropped deals
  // (and uses different labels than the Leads module), so attributing them to a
  // lead source would fabricate data. Per-source drop counts stay lead-stage only.
  const dealDrops = Number(dealsRuntime.deals?.totals?.dropped) || 0;

  return (
    <div className="glass-panel p-4 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-brand-pink-400" /> Leads by Source
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface px-2 py-1 rounded">
          {num(grandTotal)} leads
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {rows.map((r) => {
          const scale = maxL > 0 ? r.l / maxL : 0;
          return (
            <div key={r.name} className="rounded-xl px-3 py-3 hover:bg-surface/40 transition-colors">
              <div className="flex items-center justify-between mb-2 gap-3">
                <span className="text-sm font-bold text-white truncate">{r.name}</span>
                <div className="flex items-baseline gap-3 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 tabular-nums">
                    {r.activeR.toFixed(0)}% active
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 tabular-nums">
                    {r.dropR.toFixed(0)}% drop
                  </span>
                  <span className="text-sm font-black text-white tabular-nums">{num(r.l)}</span>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-surface/70 overflow-hidden" style={{ width: `${Math.max(6, scale * 100)}%` }}>
                <div className="h-full rounded-full bg-brand-pink-500" style={{ width: '100%' }} />
              </div>
            </div>
          );
        })}
      </div>

      {dealDrops > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border-subtle/60 bg-surface/40 px-3 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
            plus deal-stage drops (not source-attributed)
          </span>
          <span className="text-sm font-black text-red-400 tabular-nums">{num(dealDrops)}</span>
        </div>
      )}

      <InfoNote desktopClassName="mt-3 text-[11px] leading-relaxed text-text-secondary">
        Active-rate and drop-rate are computed over each source&apos;s own total leads.
        Drop-rate covers lead-stage drops only; deal-stage drops are totalled separately
        above because dropped deals rarely carry a usable lead source.
      </InfoNote>
    </div>
  );
}
