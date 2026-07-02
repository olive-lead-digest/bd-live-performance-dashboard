'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { Gauge } from 'lucide-react';

const num = (n: number) => Math.round(n).toLocaleString('en-IN');

// green High -> amber Medium -> red Low, with a muted grey for Unspecified.
const BANDS: { key: string; label: string; color: string; bg: string }[] = [
  { key: 'High', label: 'High', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  { key: 'Medium', label: 'Medium', color: '#ffb020', bg: 'rgba(255,176,32,0.12)' },
  { key: 'Low', label: 'Low', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { key: 'Unspecified', label: 'Unspecified', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
];

/*
 * Signing probability of the OPEN deal pipeline, bucketed High/Medium/Low/
 * Unspecified. Renders only when data.deals.signingProbability exists (undefined
 * until the pipeline reruns). Each bucket may carry {count, keys}.
 */
export function SigningProbabilityCard() {
  const { data } = useDashboard();

  const rows = useMemo(() => {
    const sp = data?.deals?.signingProbability;
    if (!sp) return [];
    return BANDS.map((b) => {
      const entry = sp[b.key] || {};
      return {
        ...b,
        count: Number(entry.count) || 0,
        keys: entry.keys != null ? Number(entry.keys) : null,
      };
    });
  }, [data]);

  if (!data?.deals?.signingProbability || rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return null;

  const anyKeys = rows.some((r) => r.keys != null && r.keys > 0);

  return (
    <div className="glass-panel p-4 sm:p-6 flex flex-col relative z-10">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand-pink-400" /> Signing Probability
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface px-2 py-1 rounded">
          {num(total)} open deals
        </span>
      </div>

      {/* Weighted single bar: green -> amber -> red -> grey */}
      <div className="h-4 rounded-full bg-surface overflow-hidden flex shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] mb-5">
        {rows.map((r) => {
          const pct = total > 0 ? (r.count / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={r.key}
              className="h-full border-r border-black/40 last:border-0"
              style={{ width: `${pct}%`, backgroundColor: r.color }}
              title={`${r.label}: ${num(r.count)}`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {rows.map((r) => {
          const pct = total > 0 ? (r.count / total) * 100 : 0;
          return (
            <div
              key={r.key}
              className="rounded-xl p-4 border border-border-subtle/60 flex flex-col gap-2"
              style={{ backgroundColor: r.bg }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{r.label}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tabular-nums" style={{ color: r.color }}>{num(r.count)}</span>
                <span className="text-xs font-bold text-text-secondary">{pct.toFixed(0)}%</span>
              </div>
              {r.keys != null && r.keys > 0 && (
                <span className="text-[10px] text-text-secondary tabular-nums">{num(r.keys)} keys</span>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
        Probability that each open deal signs, from the Zoho Deals feed.
        {anyKeys ? ' Keys are the room count attached to each band.' : ''}
      </p>
    </div>
  );
}
