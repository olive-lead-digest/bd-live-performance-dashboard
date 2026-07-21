'use client';

import { useDashboard } from '@/lib/DashboardContext';
import { Handshake, IndianRupee } from 'lucide-react';
import { DealsExemptBadge, useDealsExempt } from '@/components/DataBadges';
import { inr } from '@/lib/format';

// Receivable = Contracted − Collected (P1-1). Zoho's Pending_TA_fee field is
// unpopulated org-wide, so we DERIVE the receivable so the arithmetic closes.
const receivable = (contracted?: number | null, collected?: number | null) =>
  Math.max(0, (Number(contracted) || 0) - (Number(collected) || 0));

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

  // P1-10 — Spark's conversion event is the LOI, not the MA (the org's own
  // scoring counts Spark at LOI; Spark MAs follow LOI). So Spark's HEADLINE
  // rate is the LOI rate, with the MA rate shown as a secondary figure. The
  // denominator is the Spark deal cohort (byBrand.Spark.deals).
  const spark = (deals.byBrand || {}).Spark || {};
  const sparkCohort = Number(spark.deals) || 0;
  const sparkMA = Number(spark.signed) || 0;
  const sparkLOI = Number((deals.portfolio || {}).sparkLOI) || 0;
  const sparkLOIrate = sparkCohort ? (sparkLOI / sparkCohort) * 100 : 0;
  const sparkMArate = sparkCohort ? (sparkMA / sparkCohort) * 100 : 0;

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

        {sparkCohort > 0 && (
          <div className="mt-3 pt-3 border-t border-border-subtle/50 text-[11px] leading-snug">
            <span className="text-brand-pink-400 font-bold">Spark conversion (LOI):</span>{' '}
            <span className="text-white font-bold">{sparkLOIrate.toFixed(1)}%</span>{' '}
            <span className="text-text-secondary">— {sparkLOI.toLocaleString('en-IN')} LOIs across {sparkCohort.toLocaleString('en-IN')} Spark deals.</span>
            <span className="block text-text-secondary mt-0.5">
              MA rate: {sparkMArate.toFixed(1)}% ({sparkMA.toLocaleString('en-IN')}/{sparkCohort.toLocaleString('en-IN')}) — Spark MAs follow LOI, so LOI is Spark&apos;s signing event and the rate to watch (denominator = all Spark deals).
            </span>
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
              {(feesFy?.contractedSignings ?? feesFy?.deals) != null && (
                <span className="text-[9px] uppercase tracking-wider text-text-secondary">
                  {feesFy?.contractedSignings ?? feesFy?.deals} signed
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div title="Ta_Fee_Contracted on deals signed this fiscal year — MA-signed (by MA date) plus LOI-signed (by LOI date).">
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Contracted (FY)</span>
                <span className="text-lg sm:text-xl font-black text-white tracking-tight">{inr(feesFy?.contracted)}</span>
              </div>
              <div title="TA fee collected recorded on each deal, summed over the deals contracted this FY (matches the Zoho brand dashboards).">
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Collected (FY)</span>
                <span className="text-lg sm:text-xl font-black text-emerald-400 tracking-tight">{inr(feesFy?.collected)}</span>
                <span className="block text-[9px] text-text-secondary mt-0.5">matches Zoho brand dashboards</span>
              </div>
              <div title="Receivable (FY) = Contracted (FY) − Collected (FY).">
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Receivable (FY)</span>
                <span className="text-lg sm:text-xl font-black text-amber-400 tracking-tight">{inr(receivable(feesFy?.contracted, feesFy?.collected))}</span>
              </div>
            </div>
            <p className="mt-2 text-[9px] text-text-secondary italic leading-snug">
              Contracted is attributed to the MA/LOI signing date; Collected is the TA fee collected recorded on each deal over the same FY window (matches the Zoho brand dashboards); Receivable = Contracted − Collected.
            </p>
          </div>

          {/* All-time / contracted book */}
          <div className="p-3 rounded-xl bg-black/20 border border-border-subtle/50">
            <div className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-2">
              All-time · contracted book
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Contracted</span>
                <span className="text-base sm:text-lg font-black text-white tracking-tight">{inr(feesAll?.contracted)}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Collected</span>
                <span className="text-base sm:text-lg font-black text-emerald-400 tracking-tight">{inr(feesAll?.collected)}</span>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-0.5">Receivable</span>
                <span className="text-base sm:text-lg font-black text-amber-400 tracking-tight">{inr(receivable(feesAll?.contracted, feesAll?.collected))}</span>
                <span className="block text-[9px] text-text-secondary mt-0.5">derived</span>
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
        <div className="mt-2 text-[10px] text-text-secondary italic leading-snug space-y-0.5">
          {fees?.collectedBasis && <div>{fees.collectedBasis}</div>}
          {fees?.undatedMASigned != null && fees.undatedMASigned > 0 && (
            <div>{fees.undatedMASigned} MA deals have no MA-date; FY signing counts exclude them (FY fees follow the brand-specific contracted date).</div>
          )}
          <div>Receivable = Contracted − Collected (derived; Zoho&apos;s Pending_TA_fee is unpopulated org-wide, so we show a derived receivable instead).</div>
          <div>Real booked fees from Zoho Deals — as of {deals.generated} UTC</div>
        </div>
      </div>
    </div>
  );
}
