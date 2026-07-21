'use client';

import clsx from 'clsx';
import { useDashboard } from '@/lib/DashboardContext';
import { calculateRates, buildLeaderboard, qaCoverage, rosterOwnerSet, signingsByOwner } from '@/lib/utils';
import { compactNum } from '@/lib/format';
import { FunnelChart } from '@/components/FunnelChart';
import { BarChart2, Award, Zap, Info, AlertTriangle, ChevronRight, Activity, Users, ShieldAlert, Handshake } from 'lucide-react';
import { useMemo } from 'react';

import { InsightsDropdown } from '@/components/InsightsDropdown';
import { ExecSummary, SummaryBullet } from '@/components/ExecSummary';
import { HeroAsk } from '@/components/HeroAsk';
import { DealsOverview } from '@/components/DealsOverview';
import { PropertyStatusCard } from '@/components/PropertyStatusCard';
import { CallingQualityCard } from '@/components/CallingQualityCard';
import { LeadsAsOfStamp } from '@/components/DataBadges';

export default function Overview() {
  const { data, filteredLeads, dealsRuntime, isLoading, error } = useDashboard();

  const metrics = useMemo(() => {
    return calculateRates(filteredLeads);
  }, [filteredLeads]);

  // Top 4 BDs by balanced score. buildLeaderboard does NOT sort, so we sort here:
  // prefer reviewed reps with a computed bps.score (desc); if fewer than 4 are
  // reviewed, fall back to sorting by active rate so the card always fills.
  const leaderboard = useMemo(() => {
    if (!data || !data.weights) return [];
    // Signings (MA + LOI) per BD fold into the balanced score (primary KPI).
    const sig = signingsByOwner(dealsRuntime.deals);
    const lb = buildLeaderboard(filteredLeads, data.bds, data.weights, rosterOwnerSet(data.org), sig).filter(r => !r.inactive);
    const scored = lb
      .filter(r => r.reviewed && r.bps && typeof r.bps.score === 'number')
      .sort((a, b) => (b.bps!.score) - (a.bps!.score));
    if (scored.length >= 4) return scored.slice(0, 4);
    // Defensive fallback: fill remaining slots by signings then active rate.
    const rest = lb
      .filter(r => !scored.includes(r))
      .sort((a, b) => (b.signings || 0) - (a.signings || 0) || (b.active || 0) - (a.active || 0));
    return [...scored, ...rest].slice(0, 4);
  }, [filteredLeads, data, dealsRuntime]);

  // Real lead metrics (no monetary estimates).
  const totalLeads = filteredLeads.length;
  // Signings = MA-signed + Spark LOI from the deals feed (the primary KPI).
  const signedCount = Number(dealsRuntime.deals?.totals?.signed ?? 0)
    + Number(dealsRuntime.deals?.portfolio?.sparkLOI ?? 0);

  // === Executive intelligence (real lead + signings metrics only) ===
  const exec = useMemo(() => {
    if (!data || !filteredLeads.length) return null;
    const rates = calculateRates(filteredLeads);

    // Month-over-month volume — PERIOD-ALIGNED (P1-5): month-to-date vs the SAME
    // day-range of the previous month (never full-month vs partial-month).
    const maxDate = filteredLeads.reduce((mx, l) => (l.dt > mx ? l.dt : mx), '2000-01-01');
    const [my, mm, md] = maxDate.split('-').map(Number);
    const curr = `${my}-${String(mm).padStart(2, '0')}`;
    const prevD = new Date(my, mm - 2, md); // mm is 1-based → previous month, JS 0-based
    const prev = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
    const dayOf = (l: { dt: string }) => parseInt(l.dt.split('-')[2]) || 0;
    const mtdCount = filteredLeads.filter(l => l.dt.slice(0, 7) === curr && dayOf(l) <= md).length;
    const prevMtdCount = filteredLeads.filter(l => l.dt.slice(0, 7) === prev && dayOf(l) <= md).length;
    const momPct = prevMtdCount ? ((mtdCount - prevMtdCount) / prevMtdCount) * 100 : 0;

    // Region leadership / fall-out
    const byRegion: Record<string, any[]> = {};
    filteredLeads.forEach(l => { const r = l.region || 'Unknown'; (byRegion[r] = byRegion[r] || []).push(l); });
    const regionStats = Object.entries(byRegion).filter(([r]) => r !== 'Unknown')
      .map(([r, ls]) => { const rt = calculateRates(ls); return { r, active: rt.active, drop: rt.drop, n: ls.length }; });
    const totalActive = regionStats.reduce((a, x) => a + x.active, 0) || 1;
    const topRegion = [...regionStats].sort((a, b) => b.active - a.active)[0];
    const worstDropRegion = [...regionStats].sort((a, b) => b.drop - a.drop)[0];

    // Rep bands — over the ACTIVE roster only (P1-8), signings folded into score.
    const sig = signingsByOwner(dealsRuntime.deals);
    const lb = buildLeaderboard(filteredLeads, data.bds, data.weights, rosterOwnerSet(data.org), sig).filter(r => !r.inactive);
    const coaching = lb.filter(r => r.band === 'Priority coaching');
    const topPerf = lb.filter(r => r.band === 'Top performer').length;

    // Operational health
    const unassignedPct = (1 - rates.n / filteredLeads.length) * 100;
    // P1-8: single QA-coverage computation shared with Leaderboard & Reporting.
    const noQa = qaCoverage(data).missing;

    // Signings headline (deals feed) — the primary KPI.
    const dealsT = dealsRuntime.deals?.totals || {};
    const signedTotal = Number(dealsT.signed ?? 0) + Number(dealsRuntime.deals?.portfolio?.sparkLOI ?? 0);

    // ---- Plain-language summary ----
    const summary: { tone: string; text: string }[] = [];
    summary.push({ tone: momPct >= 0 ? 'up' : 'down', text: `Pipeline volume ${momPct >= 0 ? 'up' : 'down'} ${Math.abs(momPct).toFixed(1)}% month-to-date vs the same 1–${md} window last month (${mtdCount.toLocaleString('en-IN')} leads so far in ${curr} vs ${prevMtdCount.toLocaleString('en-IN')} by day ${md} of ${prev}).` });
    if (signedTotal > 0) summary.push({ tone: 'up', text: `${signedTotal.toLocaleString('en-IN')} signings booked to date (MA-signed + Spark LOI) — the primary KPI.` });
    if (topRegion) summary.push({ tone: 'info', text: `${topRegion.r} is driving ${Math.round(topRegion.active / totalActive * 100)}% of all active deals — the strongest region this period.` });

    // ---- Risk watchlist ----
    const risks: { sev: string; label: string; detail: string }[] = [];
    if (unassignedPct >= 15) risks.push({ sev: 'high', label: 'Unassigned pipeline', detail: `${unassignedPct.toFixed(0)}% of leads have no owner — revenue at risk of going cold.` });
    if (coaching.length) risks.push({ sev: 'high', label: 'Reps below bar', detail: `${coaching.length} rep${coaching.length > 1 ? 's' : ''} in the Priority-Coaching band${coaching.length <= 3 ? ': ' + coaching.map(c => c.owner).join(', ') : ''}.` });
    if (worstDropRegion) risks.push({ sev: 'med', label: `${worstDropRegion.r} fall-out`, detail: `Highest drop rate of any region at ${worstDropRegion.drop.toFixed(1)}% of assigned leads.` });
    if (noQa > 0) risks.push({ sev: 'low', label: 'QA coverage gap', detail: `${noQa} rep${noQa > 1 ? 's' : ''} have no quality-review score on file.` });

    return {
      summary,
      target: { topPerf },
      risks: risks.slice(0, 5),
    };
  }, [filteredLeads, data, dealsRuntime]);

  const unkRegion = filteredLeads.filter(l => l.region === 'Unknown').length;
  const noCity = filteredLeads.filter(l => !l.city || l.city === 'Other').length;
  // P1-8: same single QA-coverage figure as the risk watchlist & Leaderboard.
  const noAi = data ? qaCoverage(data).missing : 0;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 relative z-10 max-w-xl mx-auto text-center px-6">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <div className="text-white font-bold tracking-widest uppercase text-sm">Data unavailable</div>
        <div className="text-text-secondary text-sm">{error}</div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 relative z-10">
        <div className="w-16 h-16 border-4 border-brand-purple-500/20 border-t-brand-pink-500 rounded-full animate-spin shadow-[0_0_30px_rgba(218,26,132,0.4)]" />
        <div className="text-white font-bold tracking-widest uppercase text-sm animate-pulse">Initializing Data Engine</div>
      </div>
    );
  }

  // P1-2: route through the shared Indian compact formatter (never T/M/B).
  const formatCompact = (n: number) => compactNum(n);

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-20 relative">
      <HeroAsk />
      <DealsOverview />
      {/* Background ambient glows */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] bg-brand-pink-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[-100px] w-[600px] h-[600px] bg-brand-purple-500/10 rounded-full blur-[150px] pointer-events-none" />

      <header className="mb-2 flex flex-col sm:flex-row sm:items-start justify-between gap-3 relative z-40">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight flex flex-wrap items-center gap-x-3 gap-y-2">
            Overview
            <span className="px-2 py-0.5 rounded bg-brand-pink-500/20 border border-brand-pink-500/50 text-brand-pink-400 text-[10px] uppercase tracking-widest shadow-[0_0_15px_rgba(218,26,132,0.3)]">Executive View</span>
          </h1>
          <p className="text-text-secondary text-sm mt-1 font-medium">Real-time pipeline health, signings, and rep performance.</p>
          <LeadsAsOfStamp className="mt-1" />
        </div>

        <div className="flex items-center gap-4">
          <InsightsDropdown />
        </div>
      </header>

      {/* Executive Summary */}
      {exec && <ExecSummary bullets={exec.summary as SummaryBullet[]} />}

      {/* KPI Rail — all real lead metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        <FinancialCard
          title="Total Leads"
          value={formatCompact(totalLeads)}
          subtitle={`${metrics.n.toLocaleString()} Assigned`}
          icon={Users}
          color="#a470d6"
          prefix=""
        />
        <FinancialCard
          title="Contact Rate"
          value={metrics.contact.toFixed(1)}
          subtitle={`${metrics.contacted.toLocaleString()} Engaged`}
          icon={Activity}
          color="#38bdf8"
          prefix=""
          suffix="%"
        />
        <FinancialCard
          title="Lead Drop Rate"
          value={metrics.drop.toFixed(1)}
          subtitle={`${metrics.dropped.toLocaleString()} Dropped`}
          icon={Zap}
          color="#ffb020"
          prefix=""
          suffix="%"
        />
        <FinancialCard
          title="Signings"
          value={formatCompact(signedCount)}
          subtitle="MA + Spark LOI"
          icon={Handshake}
          color="#da1a84"
          prefix=""
        />
      </div>

      {/* Risk Watchlist */}
      {exec && (
        <div className="glass-panel p-4 sm:p-6 flex flex-col relative z-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-2 mb-5">
            <ShieldAlert className="w-4 h-4 text-amber-400" /> Risk Watchlist
          </h2>
          <div className="flex flex-col gap-3 flex-1">
            {exec.risks.length === 0 && (
              <div className="text-sm text-text-secondary flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> No material risks flagged.</div>
            )}
            {exec.risks.map((r: any, i: number) => {
              const dot = r.sev === 'high' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : r.sev === 'med' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]' : 'bg-slate-400';
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{r.label}</div>
                    <div className="text-[11px] text-text-secondary leading-snug">{r.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pipeline Funnel + Elite Performers */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 relative z-10">

        {/* Pipeline Funnel (lead-stage — distinct from the deal funnel above) */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-2 min-h-[380px] flex flex-col relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center justify-between">
            <span>Conversion Funnel</span>
            <BarChart2 className="w-4 h-4 text-text-secondary" />
          </h2>
          <div className="flex-1">
            <FunnelChart leads={filteredLeads} deals={dealsRuntime.deals} />
          </div>
        </div>

        {/* Executive Leaderboard — Top BDs by balanced score */}
        <div className="glass-panel p-4 sm:p-6 xl:col-span-1 min-h-[380px] flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-white mb-6 flex items-center justify-between border-b border-border-subtle pb-4">
            <span className="flex items-center gap-2"><Award className="w-4 h-4 text-brand-pink-400"/> Elite Performers</span>
            <span className="text-[10px] text-text-secondary bg-surface px-2 py-1 rounded">By Balanced Score</span>
          </h2>
          <div className="flex-1 flex flex-col gap-4">
            {leaderboard.map((bd, i) => {
              const score = bd.bps?.score || 0;
              const signings = bd.signings || 0;
              return (
              <div key={bd.owner} className="flex items-center gap-4 p-3 rounded-xl bg-black/20 border border-border-subtle/50 hover:bg-surface/40 hover:border-border-subtle transition-colors group">
                <div className={clsx(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  i === 0 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]" :
                  i === 1 ? "bg-slate-300/20 text-slate-300 border border-slate-300/30" :
                  i === 2 ? "bg-orange-700/20 text-orange-500 border border-orange-700/30" :
                  "bg-surface text-text-secondary"
                )}>
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{bd.owner}</div>
                  <div className="text-[10px] text-text-secondary uppercase tracking-wider mt-0.5">{bd.n} Leads &bull; {score.toFixed(0)} Score</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-brand-pink-400">{score.toFixed(0)}</div>
                  <div className="text-[10px] text-emerald-400 font-bold mt-0.5">{signings} signing{signings === 1 ? '' : 's'}</div>
                </div>
              </div>
            )})}
          </div>
        </div>

      </div>

      {/* Property Status + Calling Quality */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 relative z-10">
        <PropertyStatusCard />
        <CallingQualityCard />
      </div>

      {/* Operations Integrity Strip */}
      <div className="glass-panel p-4 sm:p-6 flex flex-col justify-center bg-gradient-to-r from-black/40 to-brand-purple-900/10 relative z-10">
        <h2 className="text-xs font-bold uppercase tracking-widest text-text-secondary mb-6 flex items-center gap-2">
          <Info className="w-4 h-4 text-brand-purple-400" />
          Operations Integrity Diagnostics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DiagnosticItem
            value={`${filteredLeads.length ? Math.round(((filteredLeads.length - metrics.n) / filteredLeads.length) * 100) : 0}%`}
            label="Unassigned Pipeline"
            warning={((filteredLeads.length - metrics.n) / Math.max(1, filteredLeads.length)) > 0.4}
          />
          <DiagnosticItem
            value={`${filteredLeads.length ? Math.round((unkRegion / filteredLeads.length) * 100) : 0}%`}
            label="Routing Failures"
            warning={(unkRegion / Math.max(1, filteredLeads.length)) > 0.25}
          />
          <DiagnosticItem
            value={`${filteredLeads.length ? Math.round((noCity / filteredLeads.length) * 100) : 0}%`}
            label="Incomplete Data Capture"
            warning={(noCity / Math.max(1, filteredLeads.length)) > 0.25}
          />
          <DiagnosticItem
            value={noAi.toString()}
            label="Reps Evading QA"
            warning={noAi > 0}
          />
        </div>
      </div>
    </div>
  );
}

function FinancialCard({ title, value, subtitle, icon: Icon, color, prefix = '', suffix = '' }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black/40 border border-border-subtle p-5 backdrop-blur-xl group transition-all duration-500 hover:-translate-y-1 hover:border-white/20 z-10" style={{ boxShadow: `0 0 0 0 ${color}` }}>
      {/* Dynamic hover shadow trick */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ boxShadow: `inset 0 0 40px ${color}15, 0 10px 40px ${color}20` }} />
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[40px] -mr-10 -mt-10 opacity-20 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none" style={{ backgroundColor: color }} />

      <div className="flex justify-between items-start mb-4 relative z-10">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-secondary w-2/3 leading-tight">{title}</h3>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 shadow-lg" style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}>
          <Icon className="w-4 h-4" style={{ color: color }} />
        </div>
      </div>
      <div className="relative z-10">
        {/* P1-2: keep value + unit on one line (never wrap "44.0 / %"). */}
        <div className="flex items-baseline gap-0.5 flex-nowrap whitespace-nowrap">
          {prefix && <span className="text-xl font-bold text-text-secondary -translate-y-1">{prefix}</span>}
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">{value}</span>
          {suffix && <span className="text-xl font-bold text-text-secondary -translate-y-1">{suffix}</span>}
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-text-secondary border-t border-border-subtle/50 pt-2 flex items-center justify-between">
          <span>{subtitle}</span>
          <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity translate-x-[-10px] group-hover:translate-x-0 duration-300" />
        </div>
      </div>
    </div>
  );
}

function DiagnosticItem({ value, label, warning }: { value: string; label: string; warning?: boolean }) {
  return (
    <div className={clsx(
      "flex flex-col p-4 rounded-xl border relative overflow-hidden group",
      warning ? "bg-red-500/5 border-red-500/20" : "bg-black/20 border-border-subtle/50"
    )}>
      {warning && <div className="absolute top-0 left-0 w-1 h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" />}
      <div className="flex items-center justify-between">
        <span className={clsx("text-2xl font-black tracking-tight", warning ? "text-red-400" : "text-white")}>{value}</span>
        {warning && <AlertTriangle className="w-4 h-4 text-red-400/80 animate-pulse" />}
      </div>
      <span className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-2">{label}</span>
    </div>
  );
}
