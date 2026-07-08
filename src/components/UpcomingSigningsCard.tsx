'use client';

import { useMemo } from 'react';
import { useDashboard } from '@/lib/DashboardContext';
import { CalendarClock, KeyRound } from 'lucide-react';
import { inr, num, brandColor, shortDate } from '@/lib/format';
import { DealsExemptBadge, useDealsExempt } from '@/components/DataBadges';

interface Upcoming {
  dealName?: string;
  brand?: string;
  bd?: string;
  region?: string;
  keys?: number;
  expectedDate?: string;
  type?: 'LOI' | 'MA';
  taFee?: number;
}

export function UpcomingSigningsCard() {
  const { dealsRuntime } = useDashboard();
  const deals = dealsRuntime.deals;
  const exempt = useDealsExempt();

  const rows = useMemo(() => {
    const u = deals?.upcoming as Upcoming[] | undefined;
    if (!Array.isArray(u)) return [];
    // Deterministic order: expected date asc, then deal name asc (stable tiebreaker).
    return [...u].sort(
      (a, b) =>
        (a.expectedDate || '').localeCompare(b.expectedDate || '') ||
        (a.dealName || '').localeCompare(b.dealName || '')
    );
  }, [deals]);

  // Guard: render nothing if the key is absent.
  if (!Array.isArray(deals?.upcoming)) return null;

  return (
    <div className={'glass-panel p-4 sm:p-6 flex flex-col relative z-10 transition-opacity ' + (exempt ? 'opacity-80' : '')}>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-brand-pink-400" /> Upcoming Signings
        </h2>
        <div className="flex items-center gap-2">
          <DealsExemptBadge />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary bg-surface px-2 py-1 rounded">
            Next ~20 days · {num(rows.length)}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-text-secondary py-8 text-center border border-dashed border-border-subtle rounded-xl">
          No high-probability signings expected in the next 20 days.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="overflow-x-auto hidden sm:block">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                  <th className="text-left py-2 pr-4 font-bold">Deal</th>
                  <th className="text-left py-2 px-3 font-bold">Brand</th>
                  <th className="text-left py-2 px-3 font-bold">BD</th>
                  <th className="text-left py-2 px-3 font-bold">Region</th>
                  <th className="text-right py-2 px-3 font-bold">Keys</th>
                  <th className="text-right py-2 px-3 font-bold">TA Fee</th>
                  <th className="text-right py-2 px-3 font-bold">Expected</th>
                  <th className="text-center py-2 pl-3 font-bold">Type</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.dealName}-${i}`} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                    <td className="py-2.5 pr-4 text-white font-bold">{r.dealName || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1.5 text-text-secondary">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: brandColor(r.brand) }} />
                        {r.brand || '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-text-secondary">{r.bd || '—'}</td>
                    <td className="py-2.5 px-3 text-text-secondary">{r.region || '—'}</td>
                    <td className="py-2.5 px-3 text-right text-white tabular-nums">{r.keys != null ? num(r.keys) : '—'}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 tabular-nums">{inr(r.taFee)}</td>
                    <td className="py-2.5 px-3 text-right text-white tabular-nums whitespace-nowrap">{shortDate(r.expectedDate)}</td>
                    <td className="py-2.5 pl-3 text-center">
                      <TypeBadge type={r.type} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 sm:hidden">
            {rows.map((r, i) => (
              <div key={`${r.dealName}-m-${i}`} className="rounded-xl p-4 border border-border-subtle/60 bg-black/20 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-white">{r.dealName || '—'}</span>
                  <TypeBadge type={r.type} />
                </div>
                <div className="flex items-center gap-2 text-[11px] text-text-secondary">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: brandColor(r.brand) }} />
                    {r.brand}
                  </span>
                  <span>·</span>
                  <span>{r.bd}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-text-secondary">{r.region}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-text-secondary inline-flex items-center gap-1"><KeyRound className="w-3 h-3" />{num(r.keys ?? 0)}</span>
                    <span className="text-emerald-400 font-bold">{inr(r.taFee)}</span>
                  </span>
                </div>
                <div className="text-[11px] text-white font-bold">{shortDate(r.expectedDate)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type?: 'LOI' | 'MA' }) {
  const isMA = type === 'MA';
  return (
    <span
      className={
        'inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border ' +
        (isMA
          ? 'bg-brand-pink-500/15 border-brand-pink-500/40 text-brand-pink-400'
          : 'bg-brand-purple-500/15 border-brand-purple-400/40 text-brand-purple-300')
      }
    >
      {type || '—'}
    </span>
  );
}
