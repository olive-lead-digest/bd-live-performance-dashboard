'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { Handshake, IndianRupee } from 'lucide-react';
import { DealsExemptBadge, useDealsExempt } from '@/components/DataBadges';

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
  const { dealsRuntime } = useDashboard();
  const deals = dealsRuntime.deals;
  const exempt = useDealsExempt();
  if (!deals) return null;

  const totals = deals.totals || {};
  const fees = deals.fees || {};
  const feesFy = fees?.fy || {};
  const feesAll = fees?.allTime || fees || {};
  // Fiscal-year label, e.g. "Apr'26–", derived from the feed's fyStart.
  const fyStartStr: string | undefined = feesFy?.fyStart;
  const fyLabel = fyStartStr ? `Apr'${fyStartStr.slice(2, 4)}–` : 'This FY';
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
      <div className={'glass-panel p-4 sm:p-6 flex flex-col transition-opacity ' + (exempt ? 'opacity-80' : '')}>
        <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
            <Handshake className="w-4 h-4 text-brand-pink-400" /> Signings Funnel
          </h2>
          <DealsExemptBadge />
        </div>

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
      <div className={'glass-panel p-4 sm:p-6 flex flex-col transition-opacity ' + (exempt ? 'opacity-80' : '')}>
        <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-emerald-400" /> Deal Revenue (TA Fees)
          </h2>
          <DealsExemptBadge />
        </div>

        {/* Contracted & Collected shown on the SAME basis (contracted book), for two scopes. */}
        <div className="flex flex-col gap-3 flex-1">
          {/* Current fiscal year */}
          <div className="p-3 rounded-xl bg-black/20 border border-brand-pink-500/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-brand-pink-400">
                Current FY ({fyLabel})
              </span>
              {feesFy?.deals != null && (
                <span className="text-[9px] uppercase tracking-wider text-text-secondary/70">
                  {feesFy.deals} signed
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Contracted</span>
                <span className="text-xl sm:text-2xl font-black text-white tracking-tight">{inr(feesFy?.contracted)}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Collected</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">{inr(feesFy?.collected)}</span>
                {feesFy?.collectedActual != null && (
                  <span className="block text-[9px] text-text-secondary/70 mt-0.5">received {inr(feesFy.collectedActual)}</span>
                )}
              </div>
            </div>
          </div>

          {/* All-time / contracted book */}
          <div className="p-3 rounded-xl bg-black/20 border border-border-subtle/50">
            <div className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-2">
              All-time · contracted book
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Contracted</span>
                <span className="text-lg sm:text-xl font-black text-white tracking-tight">{inr(feesAll?.contracted)}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Collected</span>
                <span className="text-lg sm:text-xl font-black text-emerald-400 tracking-tight">{inr(feesAll?.collected)}</span>
                {feesAll?.collectedActual != null && (
                  <span className="block text-[9px] text-text-secondary/70 mt-0.5">received {inr(feesAll.collectedActual)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {totals?.keysContracted != null && (
          <div className="mt-4 text-[11px] text-text-secondary">
            Keys (MA-signed):{' '}
            <span className="text-white font-bold">{totals.keysContracted.toLocaleString('en-IN')}</span>
            {totals?.keysContractedFY != null && (
              <>
                {' '}· FY{' '}
                <span className="text-white font-bold">{totals.keysContractedFY.toLocaleString('en-IN')}</span>
              </>
            )}
          </div>
        )}
        <div className="mt-2 text-[10px] text-text-secondary/70 italic leading-snug space-y-0.5">
          {fees?.collectedBasis && <div>{fees.collectedBasis}</div>}
          {fees?.undatedMASigned != null && fees.undatedMASigned > 0 && (
            <div>{fees.undatedMASigned} MA deals have no MA-date, so FY figures exclude them.</div>
          )}
          <div>Real booked fees from Zoho Deals — as of {deals.generated} UTC</div>
        </div>
      </div>
    </div>
  );
}
