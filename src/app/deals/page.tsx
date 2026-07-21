'use client';

import { useDashboard } from '@/lib/DashboardContext';
import {
  Handshake, IndianRupee, Building2, XCircle, KeyRound, TrendingUp, Users, Layers, ArrowRight, Filter,
} from 'lucide-react';
import clsx from 'clsx';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
} from 'recharts';
import { SigningProbabilityCard } from '@/components/SigningProbabilityCard';
import { ProposalsStageCard } from '@/components/ProposalsStageCard';
import { buildFunnelModel, anyFilterActive } from '@/lib/dealsRuntime';
import { DealsExemptBadge, useDealsExempt } from '@/components/DataBadges';
import { inr, shortDate } from '@/lib/format';
import { useUrlTab } from '@/lib/useUrlTab';
import { TabBar } from '@/components/TabBar';
import { useDrill, DrillColumn } from '@/components/DrillDrawer';
import Pipeline from '@/app/pipeline/page';
import { EmptyState } from '@/components/EmptyState';

// Receivable = Contracted − Collected (P1-1); Zoho's Pending_TA_fee is empty.
const receivable = (c?: number | null, col?: number | null) =>
  Math.max(0, (Number(c) || 0) - (Number(col) || 0));

const BRAND_COLORS: Record<string, string> = {
  Olive: '#502875',
  Spark: '#da1a84',
  'Open Hotels': '#a470d6',
};

// Property status = land status (Vacant Land / Operational / Under Construction),
// from deals.landStatus (analyst correction — replaces the old property-type mix).
const LAND_ORDER = ['Vacant Land', 'Operational', 'Under Construction', 'Unspecified'];
const LAND_COLORS: Record<string, string> = {
  'Vacant Land': '#da1a84',
  'Operational': '#34d399',
  'Under Construction': '#a470d6',
  'Unspecified': '#6b7280',
};

const CANON = ['Business Approval Received', 'Under Negotiation', 'LOI Signed', 'MA Signed'];

function typeColor(type: string) {
  if (type === 'signed') return '#da1a84';
  if (type === 'dropped') return '#6b7280';
  return '#502875';
}

const DEALS_TABS = [
  { id: 'deals', label: 'Deals', icon: Handshake },
  { id: 'pipeline', label: 'Pipeline', icon: Filter },
];

export default function DealsPage() {
  const { data, filteredLeads, dealsRuntime, filters } = useDashboard();
  const deals = dealsRuntime.deals;
  const exempt = useDealsExempt();
  const { openDrill } = useDrill();
  const [view, setView] = useUrlTab('view', ['deals', 'pipeline'], 'deals');

  if (!deals) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 relative z-10 max-w-xl mx-auto text-center px-6 py-20">
        <Handshake className="w-10 h-10 text-brand-purple-400" />
        <div className="text-white font-bold tracking-widest uppercase text-sm">Deals</div>
        <div className="text-text-secondary text-sm">Deals data is loading or unavailable.</div>
      </div>
    );
  }

  const totals = deals.totals || {};
  const fees = deals.fees || {};
  const feesFy = fees?.fy || {};
  const feesAll = fees?.allTime || fees || {};
  const fyStartStr: string | undefined = feesFy?.fyStart;
  const fyLabel = fyStartStr ? `Apr'${fyStartStr.slice(2, 4)}–` : 'This FY';
  const funnel: Array<{ stage: string; count: number; type: string; note?: string }> = Array.isArray(deals.funnel) ? deals.funnel : [];
  const byBrand: Record<string, any> = deals.byBrand || {};
  const dealRecords: any[] = Array.isArray(deals.records) ? deals.records : [];
  // Collected-by-brand comes from the feed's TA_fee_collected split
  // (fees.allTime.collectedByBrand — the Zoho Analytics basis). Contracted-by-brand
  // is summed from the per-deal records (Ta_Fee_Contracted on MA+LOI-signed deals).
  // Under an active filter the feed map is absent, so we degrade to the
  // record-level collected (same TA_fee_collected basis).
  const collectedByBrand: Record<string, number> =
    (deals.fees?.allTime?.collectedByBrand || deals.fees?.collectedByBrand || {}) as Record<string, number>;
  const hasCollectedByBrand = Object.keys(collectedByBrand).length > 0;
  const contractedByBrandRecords: Record<string, number> = {};
  const collectedByBrandRecords: Record<string, number> = {};
  for (const r of dealRecords) {
    // Contracted book = MA-signed (won) + LOI-signed (Spark's signing milestone),
    // so the by-brand Contracted column foots to the all-time contracted total.
    const isContracted = r?.stageType === 'won' || r?.stage === 'LOI Signed';
    if (!isContracted) continue;
    const b = String(r.brand || 'Unknown').trim() || 'Unknown';
    contractedByBrandRecords[b] = (contractedByBrandRecords[b] || 0) + (Number(r.feeContracted) || 0);
    collectedByBrandRecords[b] = (collectedByBrandRecords[b] || 0) + (Number(r.feeCollected) || 0);
  }
  const brandFee = (b: string) => {
    const contracted = contractedByBrandRecords[b] || 0;
    const collected = hasCollectedByBrand ? (Number(collectedByBrand[b]) || 0) : (collectedByBrandRecords[b] || 0);
    return { contracted, collected, receivable: receivable(contracted, collected) };
  };
  const closers: Array<{ bd: string; signed: number; feeContracted: number }> = Array.isArray(deals.closers) ? deals.closers : [];
  const landStatus: Record<string, number> = deals.landStatus || {};
  const negStages: string[] = Array.isArray(deals.inProgress?.stages)
    ? deals.inProgress.stages
    : ['Business Approval Received', 'Under Negotiation'];

  const leadsCount = Array.isArray(filteredLeads) ? filteredLeads.length : null;
  const proposalsCount =
    data?.proposals?.totals?.proposals != null ? Number(data.proposals.totals.proposals) : null;

  const funnelModel = buildFunnelModel(funnel);
  const convPct = (a?: number | null, b?: number | null) =>
    a != null && b != null && b > 0 ? `${((a / b) * 100).toFixed(1)}%` : null;
  // The proposals feed publishes ONLY org-wide aggregates (no per-proposal
  // records), so it cannot be re-filtered. Dividing an UNFILTERED proposal count
  // by a FILTERED lead count produced impossible conversions - a June range gave
  // 975 proposals / 764 leads = 127.6%. While any filter is active we suppress
  // both conversion figures and label the Proposals node as unfiltered, rather
  // than print a ratio between two different populations.
  const proposalsUnfiltered = anyFilterActive(filters);
  const propOfLeads = proposalsUnfiltered ? null : convPct(proposalsCount, leadsCount);
  const dealsOfProp = proposalsUnfiltered ? null : convPct(totals.deals, proposalsCount ?? undefined);
  const propData = LAND_ORDER.filter((k) => landStatus[k] != null).map((name) => ({ name, value: Number(landStatus[name]) || 0 }));
  const brandNames = Object.keys(byBrand);
  const maxBrandSigned = Math.max(1, ...brandNames.map((b) => Number(byBrand[b]?.signed) || 0));

  // ── P2-4 drill-down — rows from the SAME filtered records the funnel/KPIs use.
  const drillRecords: any[] = Array.isArray(deals._filteredRecords)
    ? deals._filteredRecords
    : dealRecords;
  const brandOf = (r: any) => String(r.brand || 'Unknown').trim() || 'Unknown';
  const isOpenRec = (r: any) => r.stageType !== 'won' && r.stageType !== 'dropped';
  const DEAL_COLUMNS: DrillColumn[] = [
    { key: 'name', label: 'Deal / Property', format: (r) => r.name || '(unnamed)' },
    { key: 'owner', label: 'BD', format: (r) => r.owner || 'Unassigned' },
    { key: 'stage', label: 'Stage', format: (r) => r.stage || (r.stageType === 'won' ? 'MA Signed' : r.stageType === 'dropped' ? 'Dropped' : 'Open') },
    { key: 'value', label: 'Fee (₹)', align: 'right', format: (r) => inr(r.feeContracted) },
    { key: 'date', label: 'Date', align: 'right', format: (r) => shortDate(r.stageType === 'won' ? r.maDate : r.expectedDate) },
  ];
  const drill = (title: string, rows: any[]) =>
    openDrill({
      title,
      subtitle: `${rows.length.toLocaleString('en-IN')} deal${rows.length !== 1 ? 's' : ''}`,
      columns: DEAL_COLUMNS,
      rows,
    });
  const wonRecs = drillRecords.filter((r) => r.stageType === 'won');
  const recsForFunnel = (f: any) => {
    if (f.type === 'won' || f.stage === 'MA Signed') return wonRecs;
    if (f.kind === 'drop' || f.type === 'dropped') return drillRecords.filter((r) => r.stageType === 'dropped' && (r.stage || 'Dropped') === f.stage);
    return drillRecords.filter((r) => isOpenRec(r) && (CANON.includes(r.stage) ? r.stage : 'Business Approval Received') === f.stage);
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-20 relative">
      {/* Ambient glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-brand-pink-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-100px] w-[600px] h-[600px] bg-brand-purple-500/10 rounded-full blur-[150px] pointer-events-none" />

      <header className="mb-2 relative z-10">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight flex flex-wrap items-center gap-x-3 gap-y-2">
          Deals &amp; Pipeline
          <span className="px-2 py-0.5 rounded bg-brand-pink-500/20 border border-brand-pink-500/50 text-brand-pink-400 text-[10px] uppercase tracking-widest">
            Zoho CRM
          </span>
        </h1>
        <p className="text-text-secondary text-sm mt-1 font-medium">
          Real hotel-signing pipeline &amp; fees from Zoho CRM, plus the lead-stage pipeline view
        </p>
        {(dealsRuntime.recomputed || exempt) && (
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              {dealsRuntime.recomputed && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-brand-pink-500/40 bg-brand-pink-500/10 text-brand-pink-300 text-[9px] font-bold uppercase tracking-widest">
                  Filtered · {deals._recordsFiltered?.toLocaleString('en-IN')} deals
                </span>
              )}
              <DealsExemptBadge />
            </div>
            {dealsRuntime.dateCaption && (
              <p className="text-[10px] text-text-secondary italic">{dealsRuntime.dateCaption}</p>
            )}
          </div>
        )}
      </header>

      <div className="relative z-10">
        <TabBar tabs={DEALS_TABS} active={view} onChange={setView} />
      </div>

      {view === 'pipeline' ? (
        <div className="relative z-10">
          <Pipeline />
        </div>
      ) : (
      <>
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 relative z-10">
        <KpiCard title="Total Deals" value={(totals.deals ?? 0).toLocaleString('en-IN')} icon={Layers} color="#a470d6" onClick={() => drill('Total Deals', drillRecords)} />
        <KpiCard
          title="MA Signed"
          value={(totals.signed ?? 0).toLocaleString('en-IN')}
          sub={totals.signRatePct != null ? `${totals.signRatePct}% sign rate` : undefined}
          icon={Handshake}
          color="#da1a84"
          onClick={() => drill('MA Signed deals', wonRecs)}
        />
        <KpiCard
          title="Open Pipeline"
          value={((deals.inProgress?.count ?? totals.active) ?? 0).toLocaleString('en-IN')}
          sub="BA Received + Under Negotiation"
          tooltip={`Open Pipeline = every open deal in active negotiation: Business Approval Received + Under Negotiation${negStages.length ? ` (${negStages.join(' + ')})` : ''}. This is a combined cohort — distinct from the single "Under Negotiation" stage in the Signing Funnel below.`}
          icon={TrendingUp}
          color="#502875"
          onClick={() => drill('Open Pipeline (BA Received + Under Negotiation)', drillRecords.filter((r) => isOpenRec(r) && negStages.includes(r.stage)))}
        />
        <KpiCard
          title="Dropped"
          value={(totals.dropped ?? 0).toLocaleString('en-IN')}
          sub={totals.dropRatePct != null ? `${totals.dropRatePct}% drop rate` : undefined}
          icon={XCircle}
          color="#ef4444"
          onClick={() => drill('Dropped deals', drillRecords.filter((r) => r.stageType === 'dropped'))}
        />
        <KpiCard
          title="Keys (MA-signed)"
          value={(totals.keysContracted ?? 0).toLocaleString('en-IN')}
          sub={totals.keysContractedFY != null ? `${Number(totals.keysContractedFY).toLocaleString('en-IN')} this FY` : undefined}
          icon={KeyRound}
          color="#34d399"
          onClick={() => drill('Keys — signed deals', wonRecs)}
        />
      </div>

      {/* Full funnel — rendered in the feed's canonical order, no re-sort */}
      <div className="glass-panel p-4 sm:p-6 relative z-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-6">
          <Handshake className="w-4 h-4 text-brand-pink-400" /> Signing Funnel
        </h2>

        <div className="mb-5 flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-text-secondary flex-wrap">
          <span className="flex items-center gap-1.5">
            Leads
            {leadsCount != null && (
              <span className="text-white tabular-nums normal-case">{leadsCount.toLocaleString('en-IN')}</span>
            )}
          </span>
          <ConvArrow pct={propOfLeads} />
          <span
            className="px-2 py-0.5 rounded border border-brand-pink-500/40 bg-brand-pink-500/10 text-brand-pink-300 flex items-center gap-1.5"
            title={
              'Proposals awaiting or completing department approvals (Zoho Awaiting_BusinessApproval). Once approved, a deal auto-creates.' +
              (proposalsUnfiltered
                ? ' The proposals feed carries org-wide totals only (no per-proposal records), so this count is NOT affected by the active filters and conversion percentages are hidden.'
                : '')
            }
          >
            Proposals
            {proposalsCount != null ? (
              <span className="text-white tabular-nums normal-case">
                {proposalsCount.toLocaleString('en-IN')}
                {proposalsUnfiltered && (
                  <span className="ml-1 text-[9px] uppercase tracking-wider text-amber-300/90 normal-case">(unfiltered)</span>
                )}
              </span>
            ) : (
              <span className="text-text-secondary normal-case tracking-normal">&amp; approvals</span>
            )}
          </span>
          <ConvArrow pct={dealsOfProp} />
          <span className="text-brand-pink-400 flex items-center gap-1.5">
            Deals
            {totals.deals != null && (
              <span className="text-white tabular-nums normal-case">{Number(totals.deals).toLocaleString('en-IN')}</span>
            )}
          </span>
        </div>

        <p className="text-[10px] text-text-secondary mb-4 italic leading-snug">
          Main path: Business Approval Received → Under Negotiation → MA Signed, each % against its
          true parent cohort. MA Signed % is computed against the {funnelModel.maCohortLabel}. LOI
          Signed is a Spark-only side branch (excluded from the main-path chain). Drop rows are exits,
          not forward conversions. Tap any stage to list the underlying deals. Note: the
          &ldquo;Under Negotiation&rdquo; row here is that single stage only; the &ldquo;Open Pipeline&rdquo;
          KPI above combines it with Business Approval Received, so the two figures differ by design.
        </p>
        <div className="flex flex-col gap-3">
          {funnelModel.rows.map((f) => {
            const color = f.kind === 'drop' ? '#6b7280' : typeColor(f.type);
            const isDrop = f.kind === 'drop';
            return (
              <div
                key={f.stage}
                role="button"
                tabIndex={0}
                title={f.stage === 'Under Negotiation' ? 'The single "Under Negotiation" funnel stage. The "Open Pipeline" KPI above additionally includes Business Approval Received, so it reads higher.' : undefined}
                onClick={() => drill(f.stage, recsForFunnel(f))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drill(f.stage, recsForFunnel(f)); } }}
                className={clsx(
                  'cursor-pointer rounded-lg -mx-2 px-2 py-1 hover:bg-surface/30 transition-colors',
                  isDrop && 'border-l-2 border-red-500/40'
                )}
              >
                <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                  <span className="text-text-secondary font-medium truncate pr-2 flex items-baseline gap-1.5 min-w-0">
                    <span className="truncate">{f.stage}</span>
                    {f.note && (
                      <span
                        className="text-[9px] uppercase tracking-wider text-brand-purple-400/80 whitespace-nowrap shrink-0"
                        title={f.note}
                      >
                        ({f.note})
                      </span>
                    )}
                    {f.kind === 'side' && (
                      <span className="text-[9px] uppercase tracking-wider text-brand-purple-400/80 whitespace-nowrap shrink-0">
                        side branch
                      </span>
                    )}
                  </span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    {isDrop && f.exitPct != null ? (
                      <span className="text-[9px] font-bold tabular-nums text-red-400/90" title="Share of all dropped deals">
                        {f.exitPct.toFixed(1)}% of exits
                      </span>
                    ) : f.convPct != null ? (
                      <span
                        className="text-[9px] font-bold tabular-nums text-emerald-400/90"
                        title={`Conversion vs ${f.parentLabel} cohort`}
                      >
                        {f.convPct.toFixed(1)}%
                      </span>
                    ) : null}
                    <span className={'font-bold ' + (isDrop ? 'text-red-300' : 'text-white')}>
                      {f.count.toLocaleString('en-IN')}
                    </span>
                  </span>
                </div>
                <div className="w-full h-3 bg-surface rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, f.barPct)}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ProposalsStageCard />

      <SigningProbabilityCard />

      {/* Revenue */}
      <div className="glass-panel p-4 sm:p-6 relative z-10">
        <div className="flex items-center justify-between gap-2 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-emerald-400" /> Deal Revenue (TA Fees)
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className="p-4 rounded-xl bg-black/20 border border-brand-pink-500/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-widest font-bold text-brand-pink-400">Current FY ({fyLabel})</span>
              {(feesFy?.contractedSignings ?? feesFy?.deals) != null && (
                <span className="text-[10px] uppercase tracking-wider text-text-secondary">{feesFy?.contractedSignings ?? feesFy?.deals} signed</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <RevStat label="Contracted (FY)" value={inr(feesFy?.contracted)} tooltip="Ta_Fee_Contracted on deals signed this fiscal year — MA-signed (by MA date) plus LOI-signed (by LOI date)." />
              <RevStat label="Collected (FY)" value={inr(feesFy?.collected)} accent="#34d399" tooltip="TA fee collected recorded on each deal, summed over the deals contracted this FY (matches the Zoho brand dashboards)." />
              <RevStat label="Receivable (FY)" value={inr(receivable(feesFy?.contracted, feesFy?.collected))} accent="#ffb020" warn tooltip="Receivable (FY) = Contracted (FY) − Collected (FY)." />
            </div>
            <p className="mt-2 text-[9px] text-text-secondary italic leading-snug">
              Contracted is attributed to the MA/LOI signing date; Collected is the TA fee collected recorded on each deal over the same FY window (matches the Zoho brand dashboards); Receivable = Contracted − Collected.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-black/20 border border-border-subtle/50">
            <div className="text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-3">All-time · contracted book</div>
            <div className="grid grid-cols-3 gap-3">
              <RevStat label="Contracted" value={inr(feesAll?.contracted)} />
              <RevStat label="Collected" value={inr(feesAll?.collected)} accent="#34d399" />
              <RevStat label="Receivable" value={inr(receivable(feesAll?.contracted, feesAll?.collected))} accent="#ffb020" warn />
            </div>
          </div>
        </div>
        <div className="mb-6 text-[10px] text-text-secondary italic leading-snug space-y-0.5">
          {fees?.collectedBasis && <div>{fees.collectedBasis}</div>}
          {fees?.undatedMASigned != null && fees.undatedMASigned > 0 && (
            <div>{fees.undatedMASigned} MA deals have no MA-date; Current-FY signing counts exclude them (FY fees follow the brand-specific contracted date).</div>
          )}
          <div>Contracted = Ta_Fee_Contracted on MA-signed + LOI-signed deals (attributed to the MA/LOI signing date); Collected = TA fee collected recorded on each deal (matches the Zoho brand dashboards); Receivable = Contracted − Collected.</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                <th className="text-left py-2 pr-4 font-bold">Brand</th>
                <th className="text-right py-2 px-4 font-bold">Deals</th>
                <th className="text-right py-2 px-4 font-bold">Signed</th>
                <th className="text-right py-2 px-4 font-bold">Contracted</th>
                <th className="text-right py-2 px-4 font-bold">Collected</th>
                <th className="text-right py-2 pl-4 font-bold">Receivable</th>
              </tr>
            </thead>
            <tbody>
              {brandNames.map((b) => {
                const row = byBrand[b] || {};
                const bf = brandFee(b);
                return (
                  <tr
                    key={b}
                    onClick={() => drill(`${b} — deals`, drillRecords.filter((r) => brandOf(r) === b))}
                    className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors cursor-pointer"
                    title={`List all ${b} deals`}
                  >
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-2 font-bold text-white">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BRAND_COLORS[b] || '#4a4957' }} />
                        {b}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-4 text-text-secondary">{(row.deals ?? 0).toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 px-4 text-white font-bold">{(row.signed ?? 0).toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 px-4 text-white">{inr(bf.contracted)}</td>
                    <td className="text-right py-2.5 px-4 text-emerald-400">{inr(bf.collected)}</td>
                    <td className="text-right py-2.5 pl-4 text-amber-400">{inr(bf.receivable)}</td>
                  </tr>
                );
              })}
              {brandNames.length > 0 && (() => {
                const tot = brandNames.reduce((a, b) => {
                  const bf = brandFee(b);
                  a.deals += Number(byBrand[b]?.deals) || 0;
                  a.signed += Number(byBrand[b]?.signed) || 0;
                  a.contracted += bf.contracted; a.collected += bf.collected; a.receivable += bf.receivable;
                  return a;
                }, { deals: 0, signed: 0, contracted: 0, collected: 0, receivable: 0 });
                return (
                  <tr className="border-t-2 border-border-subtle font-bold">
                    <td className="py-2.5 pr-4 text-white uppercase text-[11px] tracking-widest">Total</td>
                    <td className="text-right py-2.5 px-4 text-text-secondary">{tot.deals.toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 px-4 text-white">{tot.signed.toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 px-4 text-white">{inr(tot.contracted)}</td>
                    <td className="text-right py-2.5 px-4 text-emerald-400">{inr(tot.collected)}</td>
                    <td className="text-right py-2.5 pl-4 text-amber-400">{inr(tot.receivable)}</td>
                  </tr>
                );
              })()}
              {brandNames.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4">
                    <EmptyState title="No deal revenue to show" message="No deals match the current filters. Try clearing or widening them." icon={IndianRupee} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-text-secondary italic leading-snug">
          Receivable = Contracted − Collected (derived; Zoho&apos;s Pending_TA_fee is unpopulated org-wide). Brand rows sum to the totals above. Tap a brand row to list its deals.
        </p>
      </div>

      {/* Closer scorecard + property/brand splits */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 relative z-10">
        <div className="glass-panel p-4 sm:p-6 xl:col-span-2 flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-brand-pink-400" /> BD Closer Scorecard
          </h2>
          <p className="text-[10px] text-text-secondary mb-4 italic">
            Blank / &quot;Unassigned&quot; owners are legacy or house accounts. Tap a BD to list their signed deals.
          </p>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-text-secondary border-b border-border-subtle">
                  <th className="text-left py-2 pr-4 font-bold">#</th>
                  <th className="text-left py-2 px-4 font-bold">BD</th>
                  <th className="text-right py-2 px-4 font-bold">Signed</th>
                  <th className="text-right py-2 pl-4 font-bold">Fee Contracted</th>
                </tr>
              </thead>
              <tbody>
                {closers.slice(0, 15).map((c, i) => (
                  <tr
                    key={`${c.bd}-${i}`}
                    onClick={() => drill(`${c.bd || 'Unassigned'} — signed deals`, wonRecs.filter((r) => (r.owner || '') === c.bd))}
                    className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors cursor-pointer"
                    title={`List ${c.bd || 'Unassigned'}'s signed deals`}
                  >
                    <td className="py-2.5 pr-4 text-text-secondary">{i + 1}</td>
                    <td className="py-2.5 px-4 text-white font-bold">{c.bd || 'Unassigned'}</td>
                    <td className="text-right py-2.5 px-4 text-white">{(c.signed ?? 0).toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 pl-4 text-brand-pink-400 font-bold">{inr(c.feeContracted)}</td>
                  </tr>
                ))}
                {closers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4">
                      <EmptyState title="No closers to show" message="No signed deals match the current filters. Try clearing or widening them." icon={Users} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="glass-panel p-4 sm:p-6 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-brand-purple-400" /> Property Status
            </h2>
            {propData.length > 0 ? (
              <div
                className="w-full h-[200px]"
                role="img"
                aria-label={`Property status pie chart: ${propData.map((p) => `${p.name} ${p.value.toLocaleString('en-IN')}`).join(', ')}.`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={propData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {propData.map((entry) => (
                        <Cell key={entry.name} fill={LAND_COLORS[entry.name] || '#6b7280'} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: '#16151a', border: '1px solid #2a2930', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-text-secondary">No data available</div>
            )}
            <div className="flex flex-col gap-2 mt-2">
              {propData.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-2 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: LAND_COLORS[p.name] || '#6b7280' }} />
                    {p.name}
                  </span>
                  <span className="text-white font-bold">{p.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-4 sm:p-6 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-4">
              <Handshake className="w-4 h-4 text-brand-pink-400" /> Signings by Brand
            </h2>
            <div className="flex flex-col gap-3">
              {brandNames.map((b) => {
                const signed = Number(byBrand[b]?.signed) || 0;
                const pct = (signed / maxBrandSigned) * 100;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => drill(`${b} — signed deals`, wonRecs.filter((r) => brandOf(r) === b))}
                    className="text-left cursor-pointer rounded-lg -mx-1 px-1 py-1 hover:bg-surface/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink-400"
                    title={`List ${b} signed deals`}
                  >
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-text-secondary font-medium">{b}</span>
                      <span className="text-white font-bold">{signed.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, pct)}%`, backgroundColor: BRAND_COLORS[b] || '#4a4957' }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function ConvArrow({ pct }: { pct: string | null }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      <ArrowRight className="w-3 h-3 shrink-0" />
      {pct && (
        <span className="text-[9px] font-bold tabular-nums text-emerald-400/90 normal-case tracking-normal">
          {pct}
        </span>
      )}
    </span>
  );
}

function KpiCard({ title, value, sub, icon: Icon, color, onClick, tooltip }: any) {
  const clickable = typeof onClick === 'function';
  return (
    <div
      onClick={onClick}
      title={tooltip}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={clsx(
        'relative overflow-hidden rounded-2xl bg-black/40 border border-border-subtle p-5 backdrop-blur-xl transition-colors',
        clickable && 'cursor-pointer hover:border-white/20 hover:bg-black/50'
      )}
    >
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[40px] -mr-10 -mt-10 opacity-20 pointer-events-none" style={{ backgroundColor: color }} />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary leading-tight">{title}</h3>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0" style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div className="relative z-10">
        <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">{value}</span>
        {sub && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary">{sub}</div>}
      </div>
    </div>
  );
}

function RevStat({ label, value, accent, warn, tooltip }: { label: string; value: string; accent?: string; warn?: boolean; tooltip?: string }) {
  return (
    <div title={tooltip} className={`flex flex-col justify-center p-3 rounded-xl border ${warn ? 'bg-amber-500/5 border-amber-500/20' : 'bg-black/20 border-border-subtle/50'}`}>
      <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-1">{label}</span>
      <span className="text-lg sm:text-xl font-black tracking-tight" style={{ color: accent || '#ffffff' }}>{value}</span>
    </div>
  );
}
