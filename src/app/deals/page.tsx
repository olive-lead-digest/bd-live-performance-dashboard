'use client';

import { useDashboard } from '@/lib/DashboardContext';
import {
  Handshake, IndianRupee, Building2, XCircle, KeyRound, TrendingUp, Users, Layers, ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
} from 'recharts';
import { SigningProbabilityCard } from '@/components/SigningProbabilityCard';
import { ProposalsStageCard } from '@/components/ProposalsStageCard';
import { buildFunnelModel } from '@/lib/dealsRuntime';
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

const BRAND_COLORS: Record<string, string> = {
  Olive: '#502875',
  Spark: '#da1a84',
  'Open Hotels': '#a470d6',
};

const PROP_COLORS = ['#502875', '#da1a84', '#a470d6', '#34d399'];

function typeColor(type: string) {
  if (type === 'signed') return '#da1a84';
  if (type === 'dropped') return '#6b7280';
  return '#502875';
}

export default function DealsPage() {
  const { data, filteredLeads, dealsRuntime } = useDashboard();
  const deals = dealsRuntime.deals;
  const exempt = useDealsExempt();

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
  const closers: Array<{ bd: string; signed: number; feeContracted: number }> = Array.isArray(deals.closers) ? deals.closers : [];
  const propertyType: Record<string, number> = deals.propertyType || {};

  // Leads count reflects the active global filters (mirrors the lead modules).
  const leadsCount = Array.isArray(filteredLeads) ? filteredLeads.length : null;
  const proposalsCount =
    data?.proposals?.totals?.proposals != null ? Number(data.proposals.totals.proposals) : null;

  // P0-4 — branch-aware funnel model (no % may exceed 100; drops are exits).
  const funnelModel = buildFunnelModel(funnel);
  const convPct = (a?: number | null, b?: number | null) =>
    a != null && b != null && b > 0 ? `${((a / b) * 100).toFixed(1)}%` : null;
  const propOfLeads = convPct(proposalsCount, leadsCount);
  const dealsOfProp = convPct(totals.deals, proposalsCount ?? undefined);
  const propData = Object.entries(propertyType).map(([name, value]) => ({ name, value: Number(value) || 0 }));
  const brandNames = Object.keys(byBrand);
  const maxBrandSigned = Math.max(1, ...brandNames.map((b) => Number(byBrand[b]?.signed) || 0));

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-20 relative">
      {/* Ambient glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-brand-pink-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-100px] w-[600px] h-[600px] bg-brand-purple-500/10 rounded-full blur-[150px] pointer-events-none" />

      <header className="mb-2 relative z-10">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight flex flex-wrap items-center gap-x-3 gap-y-2">
          Deals &amp; Signings
          <span className="px-2 py-0.5 rounded bg-brand-pink-500/20 border border-brand-pink-500/50 text-brand-pink-400 text-[10px] uppercase tracking-widest">
            Zoho CRM
          </span>
        </h1>
        <p className="text-text-secondary text-sm mt-1 font-medium">
          Real hotel-signing pipeline &amp; fees from Zoho CRM
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
              <p className="text-[10px] text-text-secondary/70 italic">{dealsRuntime.dateCaption}</p>
            )}
          </div>
        )}
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 relative z-10">
        <KpiCard title="Total Deals" value={(totals.deals ?? 0).toLocaleString('en-IN')} icon={Layers} color="#a470d6" />
        <KpiCard
          title="MA Signed"
          value={(totals.signed ?? 0).toLocaleString('en-IN')}
          sub={totals.signRatePct != null ? `${totals.signRatePct}% sign rate` : undefined}
          icon={Handshake}
          color="#da1a84"
        />
        <KpiCard title="In-Progress" value={(totals.active ?? 0).toLocaleString('en-IN')} sub="active" icon={TrendingUp} color="#502875" />
        <KpiCard
          title="Dropped"
          value={(totals.dropped ?? 0).toLocaleString('en-IN')}
          sub={totals.dropRatePct != null ? `${totals.dropRatePct}% drop rate` : undefined}
          icon={XCircle}
          color="#ef4444"
        />
        <KpiCard
          title="Keys (MA-signed)"
          value={(totals.keysContracted ?? 0).toLocaleString('en-IN')}
          sub={totals.keysContractedFY != null ? `${Number(totals.keysContractedFY).toLocaleString('en-IN')} this FY` : undefined}
          icon={KeyRound}
          color="#34d399"
        />
      </div>

      {/* Full funnel — rendered in the feed's canonical order, no re-sort */}
      <div className="glass-panel p-4 sm:p-6 relative z-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-6">
          <Handshake className="w-4 h-4 text-brand-pink-400" /> Signing Funnel
        </h2>

        {/* End-to-end funnel connector: Leads → Proposals (dept approvals) → Deals,
            with real counts from the leads feed, the proposals feed and the deals feed. */}
        <div className="mb-5 flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold text-text-secondary/70 flex-wrap">
          <span className="flex items-center gap-1.5">
            Leads
            {leadsCount != null && (
              <span className="text-white tabular-nums normal-case">{leadsCount.toLocaleString('en-IN')}</span>
            )}
          </span>
          <ConvArrow pct={propOfLeads} />
          <span
            className="px-2 py-0.5 rounded border border-brand-pink-500/40 bg-brand-pink-500/10 text-brand-pink-300 flex items-center gap-1.5"
            title="Proposals awaiting or completing department approvals (Zoho Awaiting_BusinessApproval). Once approved, a deal auto-creates."
          >
            Proposals
            {proposalsCount != null ? (
              <span className="text-white tabular-nums normal-case">{proposalsCount.toLocaleString('en-IN')}</span>
            ) : (
              <span className="text-text-secondary/60 normal-case tracking-normal">&amp; approvals</span>
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

        <p className="text-[10px] text-text-secondary/70 mb-4 italic leading-snug">
          Main path: Business Approval Received → Under Negotiation → MA Signed, each % against its
          true parent cohort. MA Signed % is computed against the {funnelModel.maCohortLabel}. LOI
          Signed is a Spark-only side branch (excluded from the main-path chain). Drop rows are exits,
          not forward conversions.
        </p>
        <div className="flex flex-col gap-3">
          {funnelModel.rows.map((f) => {
            const color = f.kind === 'drop' ? '#6b7280' : typeColor(f.type);
            const isDrop = f.kind === 'drop';
            return (
              <div key={f.stage} className={isDrop ? 'pl-3 border-l-2 border-red-500/40' : ''}>
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

      {/* Proposals / department approvals — the pre-deal stage. Renders only
          when the proposals feed is present. */}
      <ProposalsStageCard />

      {/* Signing probability — renders only when the feed carries it */}
      <SigningProbabilityCard />

      {/* Revenue */}
      <div className="glass-panel p-4 sm:p-6 relative z-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-6">
          <IndianRupee className="w-4 h-4 text-emerald-400" /> Deal Revenue (TA Fees)
        </h2>
        {/* Contracted & Collected on the SAME basis (contracted book), split into
            Current-FY and All-time scopes so they are never mixed. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          <div className="p-4 rounded-xl bg-black/20 border border-brand-pink-500/30">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] uppercase tracking-widest font-bold text-brand-pink-400">Current FY ({fyLabel})</span>
              {feesFy?.deals != null && (
                <span className="text-[10px] uppercase tracking-wider text-text-secondary/70">{feesFy.deals} signed</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <RevStat label="Contracted" value={inr(feesFy?.contracted)} />
              <RevStat label="Collected" value={inr(feesFy?.collected)} accent="#34d399" />
              <RevStat label="Received" value={inr(feesFy?.collectedActual)} />
            </div>
          </div>
          <div className="p-4 rounded-xl bg-black/20 border border-border-subtle/50">
            <div className="text-[11px] uppercase tracking-widest font-bold text-text-secondary mb-3">All-time · contracted book</div>
            <div className="grid grid-cols-3 gap-3">
              <RevStat label="Contracted" value={inr(feesAll?.contracted)} />
              <RevStat label="Collected" value={inr(feesAll?.collected)} accent="#34d399" />
              <RevStat label="Received" value={inr(feesAll?.collectedActual)} />
            </div>
          </div>
        </div>
        <div className="mb-6 text-[10px] text-text-secondary/70 italic leading-snug space-y-0.5">
          {fees?.collectedBasis && <div>{fees.collectedBasis}</div>}
          {fees?.undatedMASigned != null && fees.undatedMASigned > 0 && (
            <div>{fees.undatedMASigned} MA deals have no MA-date, so Current-FY figures exclude them.</div>
          )}
          <div>Contracted = Ta_Fee_Contracted; Collected = TA_fee_collected (cumulative keyed); Received = Actual_Amount_Total.</div>
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
                <th className="text-right py-2 pl-4 font-bold">Pending</th>
              </tr>
            </thead>
            <tbody>
              {brandNames.map((b) => {
                const row = byBrand[b] || {};
                return (
                  <tr key={b} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-2 font-bold text-white">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: BRAND_COLORS[b] || '#4a4957' }} />
                        {b}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-4 text-text-secondary">{(row.deals ?? 0).toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 px-4 text-white font-bold">{(row.signed ?? 0).toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 px-4 text-white">{inr(row.feeContracted)}</td>
                    <td className="text-right py-2.5 px-4 text-emerald-400">{inr(row.feeCollected)}</td>
                    <td className="text-right py-2.5 pl-4 text-amber-400">{inr(row.feePending)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closer scorecard + property/brand splits */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 relative z-10">
        {/* Closer scorecard */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-2 flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-brand-pink-400" /> BD Closer Scorecard
          </h2>
          <p className="text-[10px] text-text-secondary/70 mb-4 italic">
            Blank / &quot;Unassigned&quot; owners are legacy or house accounts.
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
                  <tr key={`${c.bd}-${i}`} className="border-b border-border-subtle/40 hover:bg-surface/30 transition-colors">
                    <td className="py-2.5 pr-4 text-text-secondary">{i + 1}</td>
                    <td className="py-2.5 px-4 text-white font-bold">{c.bd || 'Unassigned'}</td>
                    <td className="text-right py-2.5 px-4 text-white">{(c.signed ?? 0).toLocaleString('en-IN')}</td>
                    <td className="text-right py-2.5 pl-4 text-brand-pink-400 font-bold">{inr(c.feeContracted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Property type + brand */}
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="glass-panel p-4 sm:p-6 flex flex-col">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-brand-purple-400" /> Property Type
            </h2>
            {propData.length > 0 ? (
              <div className="w-full h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={propData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {propData.map((entry, i) => (
                        <Cell key={entry.name} fill={PROP_COLORS[i % PROP_COLORS.length]} />
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
              {propData.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-2 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PROP_COLORS[i % PROP_COLORS.length] }} />
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
                  <div key={b}>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-text-secondary font-medium">{b}</span>
                      <span className="text-white font-bold">{signed.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, pct)}%`, backgroundColor: BRAND_COLORS[b] || '#4a4957' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
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

function KpiCard({ title, value, sub, icon: Icon, color }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black/40 border border-border-subtle p-5 backdrop-blur-xl">
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[40px] -mr-10 -mt-10 opacity-20 pointer-events-none" style={{ backgroundColor: color }} />
      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary leading-tight">{title}</h3>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0" style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div className="relative z-10">
        <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">{value}</span>
        {sub && <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary/80">{sub}</div>}
      </div>
    </div>
  );
}

function RevStat({ label, value, accent, warn }: { label: string; value: string; accent?: string; warn?: boolean }) {
  return (
    <div className={`flex flex-col justify-center p-3 rounded-xl border ${warn ? 'bg-amber-500/5 border-amber-500/20' : 'bg-black/20 border-border-subtle/50'}`}>
      <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-1">{label}</span>
      <span className="text-lg sm:text-xl font-black tracking-tight" style={{ color: accent || '#ffffff' }}>{value}</span>
    </div>
  );
}
