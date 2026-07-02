'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { TrendingDown } from 'lucide-react';

const num = (n: number) => Math.round(n).toLocaleString('en-IN');

/*
 * "Why leads drop" — horizontal bars of drop reasons, sorted desc, each with its
 * share of total drops. Renders only when data.dropReasons exists (undefined
 * until the pipeline reruns).
 */
export function DropReasonsCard() {
  const { data } = useDashboard();

  const rows = useMemo(() => {
    const dr = data?.dropReasons;
    if (!dr) return [];
    return Object.entries(dr)
      .map(([reason, count]) => ({ reason, count: Number(count) || 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [data]);

  if (!data?.dropReasons || rows.length === 0) return null;

  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <div className="glass-panel p-4 sm:p-6 flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-400" /> Why Leads Drop
        </h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface px-2 py-1 rounded">
          {num(total)} drops
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const share = total > 0 ? (r.count / total) * 100 : 0;
          const scale = max > 0 ? (r.count / max) * 100 : 0;
          return (
            <div key={r.reason}>
              <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                <span className="text-text-secondary font-medium truncate pr-2">{r.reason}</span>
                <span className="shrink-0 flex items-baseline gap-2">
                  <span className="text-text-secondary tabular-nums">{share.toFixed(0)}%</span>
                  <span className="text-white font-bold tabular-nums">{num(r.count)}</span>
                </span>
              </div>
              <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                <div
                  className="h-full rounded-full bg-red-500/80 transition-all duration-700"
                  style={{ width: `${Math.max(3, scale)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-text-secondary">
        Share is each reason&apos;s % of all dropped leads. Tackle the top reasons to lift end-to-end conversion.
      </p>
    </div>
  );
}
