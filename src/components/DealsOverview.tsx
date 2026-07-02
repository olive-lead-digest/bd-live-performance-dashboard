'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { Handshake, IndianRupee } from 'lucide-react';

const inr = (n?: number | null) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        notation: 'compact',
        maximumFractionDigits: 2,
      }).format(n);

// Stages we want to spotlight in the compact funnel. This is a membership filter
// only — the render order below always follows the feed's canonical funnel order,
// never this list's order.
const SPOTLIGHT_STAGES = new Set([
  'Under Negotiation',
  'Business Approval Received',
  'LOI Signed',
  'MA Signed',
]);

const STAGE_COLORS: Record<string, string> = {
  'Under Negotiation': '#502875',
  'Business Approval Received': '#7c4bb0',
  'LOI Signed': '#a470d6',
  'MA Signed': '#da1a84',
};

export function DealsOverview() {
  const { data } = useDashboard();
  const deals = data?.deals;
  if (!deals) return null;

  const totals = deals.totals || {};
  const fees = deals.fees || {};
  const funnel: Array<{ stage: string; count: number; type: string; note?: string }> = Array.isArray(deals.funnel)
    ? deals.funnel
    : [];

  // Keep the feed's canonical order; just filter to the spotlight stages.
  const spotlight = funnel
    .filter((f) => SPOTLIGHT_STAGES.has(f.stage))
    .map((f) => ({ stage: f.stage, count: f.count ?? 0, note: f.note }));
  const maxCount = Math.max(1, ...spotlight.map((s) => s.count));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 relative z-10">
      {/* Card A — Signings Funnel */}
      <div className="glass-panel p-4 sm:p-6 flex flex-col">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-5">
          <Handshake className="w-4 h-4 text-brand-pink-400" /> Signings Funnel
        </h2>

        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            {(totals.signed ?? 0).toLocaleString('en-IN')}
          </span>
          <span className="text-sm font-bold text-brand-pink-400">
            MA Signed
          </span>
          {totals.signRatePct != null && (
            <span className="text-xs font-bold text-emerald-400 ml-auto">
              {totals.signRatePct}% sign rate
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 flex-1">
          {spotlight.map((s) => {
            const pct = (s.count / maxCount) * 100;
            const color = STAGE_COLORS[s.stage] || '#502875';
            return (
              <div key={s.stage}>
                <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                  <span className="text-text-secondary font-medium truncate pr-2 flex items-baseline gap-1.5 min-w-0">
                    <span className="truncate">{s.stage}</span>
                    {s.note && (
                      <span
                        className="text-[9px] uppercase tracking-wider text-brand-purple-400/80 whitespace-nowrap shrink-0"
                        title={s.note}
                      >
                        ({s.note})
                      </span>
                    )}
                  </span>
                  <span className="text-white font-bold shrink-0">{s.count.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.max(3, pct)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {(totals.dropped != null || totals.dropRatePct != null) && (
          <div className="mt-4 pt-3 border-t border-border-subtle/50 text-[11px] text-text-secondary">
            Dropped:{' '}
            <span className="text-red-400 font-bold">
              {(totals.dropped ?? 0).toLocaleString('en-IN')}
            </span>
            {totals.dropRatePct != null && ` (${totals.dropRatePct}%)`}
          </div>
        )}
      </div>

      {/* Card B — Deal Revenue (TA Fees) */}
      <div className="glass-panel p-4 sm:p-6 flex flex-col">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-5">
          <IndianRupee className="w-4 h-4 text-emerald-400" /> Deal Revenue (TA Fees)
        </h2>

        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="flex flex-col justify-center p-3 rounded-xl bg-black/20 border border-border-subtle/50">
            <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-1">Contracted</span>
            <span className="text-xl sm:text-2xl font-black text-white tracking-tight">{inr(fees.contracted)}</span>
          </div>
          <div className="flex flex-col justify-center p-3 rounded-xl bg-black/20 border border-border-subtle/50">
            <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-1">Collected</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">{inr(fees.collected)}</span>
          </div>
          <div className="flex flex-col justify-center p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <span className="text-[10px] uppercase tracking-widest font-bold text-amber-400/80 mb-1">Pending</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight">{inr(fees.pending)}</span>
          </div>
        </div>

        {totals.keysContracted != null && (
          <div className="mt-4 text-[11px] text-text-secondary">
            Keys contracted:{' '}
            <span className="text-white font-bold">{totals.keysContracted.toLocaleString('en-IN')}</span>
          </div>
        )}
        <div className="mt-1 text-[10px] text-text-secondary/70 italic">
          Real booked fees from Zoho Deals — as of {deals.generated} UTC
        </div>
      </div>
    </div>
  );
}
